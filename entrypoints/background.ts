import { computeBadge } from '@/lib/badge';
import { fetchAllAccounts, type State } from '@/lib/providers';
import { normalizeSettings, SETTINGS_KEY } from '@/lib/settings';
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

function poll(): Promise<State> {
  inFlight ??= (async () => {
    const startedAt = Date.now();
    try {
      const fetched = await fetchAllAccounts();
      const accounts = hideOpenedSince(fetched, opened, startedAt);
      // Clicks before this poll started are already reflected by the mail service (or not — fine)
      for (const [key, at] of opened) if (at < startedAt) opened.delete(key);
      const state: State = { accounts, updatedAt: Date.now() };
      await publish(state);
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
  const current = (await browser.storage.local.get(STATE_KEY))[STATE_KEY] as State | undefined;
  if (current) await publish(markRead(current, accountId, messageId));
}

async function ensureAlarm(): Promise<void> {
  const { pollSeconds } = normalizeSettings(
    (await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY],
  );
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
    if (m?.type === 'refresh') return poll();
    if (m?.type === 'opened' && m.accountId && m.messageId) {
      return onOpened(m.accountId, m.messageId);
    }
    return undefined;
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SETTINGS_KEY]) void ensureAlarm();
  });

  const start = async () => {
    await installHeaderRules();
    await ensureAlarm();
    await poll();
  };
  browser.runtime.onInstalled.addListener(() => void start());
  browser.runtime.onStartup.addListener(() => void start());
  // Session rules are cleared when the browser restarts; reinstalling on every wake is cheap
  void installHeaderRules().then(ensureAlarm);
});
