import { storage } from 'wxt/utils/storage';
import { computeBadge } from '@/lib/badge';
import { type Disconnected, withoutDisconnected } from '@/lib/disconnected';
import { i18n, unreadText } from '@/lib/i18n';
import {
  findNewMessages,
  MAX_SEPARATE_NOTIFICATIONS,
  type NewMessage,
  notificationId,
  parseNotificationId,
  rememberSeen,
  type SeenMessages,
} from '@/lib/notify';
import { openMessageTab } from '@/lib/open-message';
import { sortAccounts } from '@/lib/order';
import { fetchAllAccounts, type State } from '@/lib/providers';
import { markGmailMessageRead } from '@/lib/providers/gmail-read';
import { markProviderMessageRead } from '@/lib/providers/read';
import { parseWorkmailUrl } from '@/lib/providers/workmail';
import {
  interruptedReadJobs,
  optimisticReadState,
  type ReadShownJob,
  readShownJobsItem,
  readShownMessages,
  requestedShownMessages,
} from '@/lib/read-shown';
import { clampPollSeconds } from '@/lib/settings';
import {
  accountOrderItem,
  disconnectedItem,
  notifyItem,
  pollSecondsItem,
  soundItem,
  workmailUrlItem,
} from '@/lib/settings-store';
import { playSound } from '@/lib/sound';
import {
  hideRecentlyOpened,
  markRead,
  type Opened,
  openedKey,
  STATE_KEY,
  stillOpened,
} from '@/lib/state';

const ALARM = 'poll';

/**
 * Requests from the service worker carry Origin: chrome-extension://…; mail services may reject
 * them as cross-site. For requests outside tabs (tabId -1, i.e. ours) we set the mail's own origin.
 */
const MAIL_ORIGINS: Record<string, string> = {
  'mail.yandex.ru': 'https://mail.yandex.ru',
  'mail.yandex.com': 'https://mail.yandex.com',
  'mail.360.yandex.ru': 'https://mail.360.yandex.ru',
  // The account list is requested by the mail page itself, so it sees the mail origin
  'api.passport.yandex.ru': 'https://mail.yandex.ru',
  'e.mail.ru': 'https://e.mail.ru',
  'portal.mail.ru': 'https://e.mail.ru',
};
const MAX_RULE_ID = 50;

async function installHeaderRules(): Promise<void> {
  const origins = { ...MAIL_ORIGINS };
  // WorkMail lives on a per-organization region host taken from the settings
  const workmail = parseWorkmailUrl((await workmailUrlItem.getValue()) ?? '');
  if (workmail) origins[workmail.hostname] = workmail.origin;
  const rules = Object.entries(origins).map(([domain, origin], i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: 'modifyHeaders' as const,
      requestHeaders: [
        { header: 'origin', operation: 'set' as const, value: origin },
        { header: 'referer', operation: 'set' as const, value: `${origin}/` },
      ],
    },
    condition: { requestDomains: [domain], tabIds: [-1] },
  }));
  await browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: Array.from({ length: MAX_RULE_ID }, (_, i) => i + 1),
    addRules: rules,
  });
}

let inFlight: Promise<State> | null = null;
/**
 * Messages opened from the popup, kept hidden until the mail service shows them read. Session
 * storage, not a variable: the service worker is stopped between polls and would forget them.
 */
const openedItem = storage.defineItem<Opened>('session:opened', { fallback: {} });

const readShownTasks = new Map<string, Promise<void>>();
const readJobsReady = readShownJobsItem
  .getValue()
  .then((jobs) => readShownJobsItem.setValue(interruptedReadJobs(jobs)));
let readJobWrites: Promise<void> = readJobsReady;

function updateReadJob(accountId: string, job: ReadShownJob | null): Promise<void> {
  const write = readJobWrites.then(async () => {
    const jobs = { ...(await readShownJobsItem.getValue()) };
    if (job) jobs[accountId] = job;
    else delete jobs[accountId];
    await readShownJobsItem.setValue(jobs);
    const state = await readState();
    if (state) await updateBadge(state);
  });
  readJobWrites = write.catch(() => undefined);
  return write;
}

async function publish(state: State): Promise<void> {
  await browser.storage.local.set({ [STATE_KEY]: state });
  await updateBadge(state);
}

async function updateBadge(state: State): Promise<void> {
  const badge = computeBadge(
    optimisticReadState(state, await readShownJobsItem.getValue()).accounts,
  );
  await browser.action.setBadgeText({ text: badge.text });
  await browser.action.setBadgeBackgroundColor({ color: badge.color });
}

const SUMMARY_NOTIFICATION = 'summary';

async function readState(): Promise<State | undefined> {
  return (await browser.storage.local.get(STATE_KEY))[STATE_KEY] as State | undefined;
}

/** Messages already shown (popup or notification), kept across checks and browser restarts */
const SEEN_KEY = 'seenMessages';

/** System notifications: one per message, or a summary, with Pulsar's chime once per check */
async function notify(fresh: NewMessage[]): Promise<void> {
  if (fresh.length === 0) return;
  if (!(await notifyItem.getValue())) return;
  const iconUrl = browser.runtime.getURL('/icon/128.png');
  // With our chime on, the system's own notification sound would play on top of it
  const silent = await soundItem.getValue();
  if (silent) void playSound().catch(() => undefined);
  if (fresh.length > MAX_SEPARATE_NOTIFICATIONS) {
    const n = fresh.length;
    await browser.notifications.create(SUMMARY_NOTIFICATION, {
      type: 'basic',
      iconUrl,
      title: unreadText(n),
      silent,
      message: [...new Set(fresh.map((f) => f.message.from || f.message.fromEmail))].join(', '),
    });
    return;
  }
  for (const { account, message } of fresh) {
    await browser.notifications.create(notificationId(account.id, message.id), {
      type: 'basic',
      iconUrl,
      title: message.from || message.fromEmail,
      message: message.subject,
      contextMessage: account.email,
      silent,
    });
  }
}

const TEST_NOTIFICATION = 'test';

/** "Test" in the settings: a sample notification with the same sound settings as real ones */
async function notifyTest(): Promise<void> {
  const silent = await soundItem.getValue();
  if (silent) void playSound().catch(() => undefined);
  // Replacing a still visible one wouldn't pop it up again
  await browser.notifications.clear(TEST_NOTIFICATION);
  await browser.notifications.create(TEST_NOTIFICATION, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: 'Pulsar',
    message: i18n.t('options.notifyTestMessage'),
    silent,
  });
}

/** Opens the message behind a notification and counts it as read, like a click in the popup */
async function onNotificationClicked(id: string): Promise<void> {
  void browser.notifications.clear(id);
  const state = await readState();
  const ref = parseNotificationId(id);
  const account = ref && state?.accounts.find((a) => a.id === ref.accountId);
  const message = ref && account?.messages.find((m) => m.id === ref.messageId);
  if (ref && message) {
    await openAccountMessage(ref.accountId, ref.messageId);
    return;
  }
  // The summary (or a message that's gone by now): show the list
  await browser.action.openPopup().catch(() => undefined);
}

/** withNotifications: false for the check right after browser start/install (no burst of old mail) */
function poll(withNotifications = true): Promise<State> {
  inFlight ??= (async () => {
    const startedAt = Date.now();
    try {
      const fetched = await fetchAllAccounts(await disconnectedItem.getValue());
      // A mailbox disconnected while this poll was running must not come back
      const current = withoutDisconnected(fetched, await disconnectedItem.getValue());
      const accounts = sortAccounts(
        hideRecentlyOpened(current, await openedItem.getValue(), startedAt),
        await accountOrderItem.getValue(),
      );
      // Read again: a click may have come while this poll ran
      await openedItem.setValue(stillOpened(await openedItem.getValue(), current, startedAt));
      const state: State = { accounts, updatedAt: Date.now() };
      await publish(state);
      const seen = (await browser.storage.local.get(SEEN_KEY))[SEEN_KEY] as
        | SeenMessages
        | undefined;
      await browser.storage.local.set({ [SEEN_KEY]: rememberSeen(seen, accounts) });
      if (withNotifications) await notify(findNewMessages(seen, accounts));
      return state;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** The operation lives in the worker, so closing the popup or Gmail cannot cancel it. */
async function openAccountMessage(accountId: string, messageId: string): Promise<void> {
  const current = await readState();
  const account = current?.accounts.find((a) => a.id === accountId);
  const message = account?.messages.find((m) => m.id === messageId);
  if (!account || !message) return;
  if (account.provider === 'gmail') {
    if (await markGmailMessageRead(message.url, account.id)) {
      // Protect against an older poll still returning the state from before the action.
      await onOpened(accountId, messageId);
    }
    // On failure retain the unread entry; opening Gmail still lets the user read the message.
  } else {
    await onOpened(accountId, messageId);
  }
  await openMessageTab(message.url);
}

/** The popup sends exactly its shown IDs; processing survives dismissing the popup. */
function markShownRead(accountId: string, ids: unknown): Promise<void> {
  const running = readShownTasks.get(accountId);
  if (running) return running;
  const task = (async () => {
    await readJobsReady;
    const state = await readState();
    const account = state?.accounts.find((a) => a.id === accountId);
    if (!account) return;
    const messages = requestedShownMessages(account, ids);
    if (!messages.length) return;
    await updateReadJob(accountId, {
      total: messages.length,
      processed: 0,
      failed: 0,
      status: 'running',
      pendingIds: messages.map((message) => message.id),
    });
    const result = await readShownMessages(
      messages,
      (message) => markProviderMessageRead(account, message),
      (message) => onOpened(account.id, message.id),
      (job) => updateReadJob(accountId, job),
    );
    await updateReadJob(
      accountId,
      result.failed ? { ...result, status: 'error', pendingIds: [] } : null,
    );
  })()
    .catch(async () => {
      const job = (await readShownJobsItem.getValue())[accountId];
      if (job)
        await updateReadJob(accountId, {
          ...job,
          status: 'error',
          pendingIds: [],
          failed: job.failed + job.total - job.processed,
          processed: job.total,
        });
    })
    .finally(() => readShownTasks.delete(accountId));
  readShownTasks.set(accountId, task);
  return task;
}

/** Hide an opened message, including from polls that started before its read confirmation. */
async function onOpened(accountId: string, messageId: string): Promise<void> {
  const opened = await openedItem.getValue();
  await openedItem.setValue({ ...opened, [openedKey(accountId, messageId)]: Date.now() });
  const current = await readState();
  if (current) await publish(markRead(current, accountId, messageId));
}

/** Hides a disconnected mailbox at once, then checks again (a reconnected one reappears) */
async function onDisconnectedChanged(list: Disconnected[]): Promise<void> {
  const current = await readState();
  if (current) await publish({ ...current, accounts: withoutDisconnected(current.accounts, list) });
  // A poll already running started with the old list; the next one picks up the change
  await inFlight?.catch(() => undefined);
  await poll(false);
}

async function ensureAlarm(): Promise<void> {
  const pollSeconds = clampPollSeconds(await pollSecondsItem.getValue());
  const pollMinutes = pollSeconds / 60;
  const alarm = await browser.alarms.get(ALARM);
  // Recreating an alarm restarts its countdown, so only do it when the period actually changed
  if (alarm?.periodInMinutes !== pollMinutes) {
    await browser.alarms.create(ALARM, {
      periodInMinutes: pollMinutes,
      delayInMinutes: pollMinutes,
    });
  }
}

export default defineBackground(() => {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void poll();
  });

  browser.runtime.onMessage.addListener((msg: unknown) => {
    const m = msg as {
      type?: string;
      accountId?: string;
      messageId?: string;
      messageIds?: unknown;
    };
    // The popup is open: the user sees new mail there, no need to notify about it
    if (m?.type === 'refresh') return poll(false);
    if (m?.type === 'test-notification') return notifyTest();
    if (m?.type === 'open-message' && m.accountId && m.messageId) {
      return openAccountMessage(m.accountId, m.messageId);
    }
    if (m?.type === 'mark-shown-read' && m.accountId) {
      return markShownRead(m.accountId, m.messageIds);
    }
    return undefined;
  });

  browser.notifications.onClicked.addListener((id) => void onNotificationClicked(id));

  pollSecondsItem.watch(() => void ensureAlarm());
  workmailUrlItem.watch(() => void installHeaderRules().then(() => poll(false)));
  disconnectedItem.watch((list) => void onDisconnectedChanged(list));
  // Reordering needs no new check: the mail already shown is just rearranged
  accountOrderItem.watch(async (order) => {
    const current = await readState();
    if (current) await publish({ ...current, accounts: sortAccounts(current.accounts, order) });
  });

  const start = async () => {
    await installHeaderRules();
    await ensureAlarm();
    await poll(false);
  };
  browser.runtime.onInstalled.addListener(() => void start());
  browser.runtime.onStartup.addListener(() => void start());
  // Session rules are cleared when the browser restarts; reinstalling on every wake is cheap
  void installHeaderRules().then(ensureAlarm);
});
