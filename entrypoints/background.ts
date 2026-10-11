import { computeBadge } from '@/lib/badge';
import {
  findNewMessages,
  MAX_SEPARATE_NOTIFICATIONS,
  type NewMessage,
  notificationId,
  parseNotificationId,
} from '@/lib/notify';
import { plural } from '@/lib/plural';
import { fetchAllAccounts, type State } from '@/lib/providers';
import { clampPollSeconds } from '@/lib/settings';
import { notifyItem, pollSecondsItem } from '@/lib/settings-store';
import { hideOpenedSince, markRead, openedKey, STATE_KEY } from '@/lib/state';

const ALARM = 'poll';

/**
 * Requests from the service worker carry Origin: chrome-extension://…; Yandex may reject them
 * as cross-site. For requests outside tabs (tabId -1, i.e. ours) we set the mail's own origin.
 */
const YANDEX_ORIGINS: Record<string, string> = {
  'mail.yandex.ru': 'https://mail.yandex.ru',
  'mail.yandex.com': 'https://mail.yandex.com',
  'mail.360.yandex.ru': 'https://mail.360.yandex.ru',
  // The account list is requested by the mail page itself, so it sees the mail origin
  'api.passport.yandex.ru': 'https://mail.yandex.ru',
};
const MAX_RULE_ID = 10;

async function installHeaderRules(): Promise<void> {
  const rules = Object.entries(YANDEX_ORIGINS).map(([domain, origin], i) => ({
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
/** Messages opened from the popup: key → time of the click */
const opened = new Map<string, number>();

async function publish(state: State): Promise<void> {
  await browser.storage.local.set({ [STATE_KEY]: state });
  const badge = computeBadge(state.accounts);
  await browser.action.setBadgeText({ text: badge.text });
  await browser.action.setBadgeBackgroundColor({ color: badge.color });
  await browser.action.setTitle({ title: badge.title });
}

const SUMMARY_NOTIFICATION = 'summary';

async function readState(): Promise<State | undefined> {
  return (await browser.storage.local.get(STATE_KEY))[STATE_KEY] as State | undefined;
}

/** System notifications (Windows plays its own sound): one per message, or a summary */
async function notify(fresh: NewMessage[]): Promise<void> {
  if (fresh.length === 0) return;
  if (!(await notifyItem.getValue())) return;
  const iconUrl = browser.runtime.getURL('/icon/128.png');
  if (fresh.length > MAX_SEPARATE_NOTIFICATIONS) {
    const n = fresh.length;
    await browser.notifications.create(SUMMARY_NOTIFICATION, {
      type: 'basic',
      iconUrl,
      title: `${n} ${plural(n, ['новое письмо', 'новых письма', 'новых писем'])}`,
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
    });
  }
}

/** Opens the message behind a notification and counts it as read, like a click in the popup */
async function onNotificationClicked(id: string): Promise<void> {
  void browser.notifications.clear(id);
  const state = await readState();
  const ref = parseNotificationId(id);
  const account = ref && state?.accounts.find((a) => a.id === ref.accountId);
  const message = ref && account?.messages.find((m) => m.id === ref.messageId);
  if (ref && message) {
    await browser.tabs.create({ url: message.url });
    await onOpened(ref.accountId, ref.messageId);
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
      const prev = await readState();
      const fetched = await fetchAllAccounts();
      const accounts = hideOpenedSince(fetched, opened, startedAt);
      // Clicks before this poll started are already reflected by the mail service (or not — fine)
      for (const [key, at] of opened) if (at < startedAt) opened.delete(key);
      const state: State = { accounts, updatedAt: Date.now() };
      await publish(state);
      if (withNotifications) await notify(findNewMessages(prev, accounts));
      return state;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Optimistically treat a message opened from the popup as read */
async function onOpened(accountId: string, messageId: string): Promise<void> {
  opened.set(openedKey(accountId, messageId), Date.now());
  const current = await readState();
  if (current) await publish(markRead(current, accountId, messageId));
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
    const m = msg as { type?: string; accountId?: string; messageId?: string };
    // The popup is open: the user sees new mail there, no need to notify about it
    if (m?.type === 'refresh') return poll(false);
    if (m?.type === 'opened' && m.accountId && m.messageId) {
      return onOpened(m.accountId, m.messageId);
    }
    return undefined;
  });

  browser.notifications.onClicked.addListener((id) => void onNotificationClicked(id));

  pollSecondsItem.watch(() => void ensureAlarm());

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
