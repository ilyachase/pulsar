import { computeBadge } from '@/lib/badge';
import { fetchAllAccounts, type State } from '@/lib/providers';
import { STATE_KEY } from '@/lib/state';

const ALARM = 'poll';

/**
 * Requests from the service worker carry Origin: chrome-extension://…; Yandex may reject them
 * as cross-site. For requests outside tabs (tabId -1, i.e. ours) we set the mail's own origin.
 */
const YANDEX_DOMAINS = ['mail.yandex.ru', 'mail.yandex.com'];

async function installHeaderRules(): Promise<void> {
  const rules = YANDEX_DOMAINS.map((domain, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: 'modifyHeaders' as const,
      requestHeaders: [
        { header: 'origin', operation: 'set' as const, value: `https://${domain}` },
        { header: 'referer', operation: 'set' as const, value: `https://${domain}/` },
      ],
    },
    condition: { requestDomains: [domain], tabIds: [-1] },
  }));
  await browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: rules.map((r) => r.id),
    addRules: rules,
  });
}

let inFlight: Promise<State> | null = null;

function poll(): Promise<State> {
  inFlight ??= (async () => {
    try {
      const accounts = await fetchAllAccounts();
      const state: State = { accounts, updatedAt: Date.now() };
      await browser.storage.local.set({ [STATE_KEY]: state });
      const badge = computeBadge(accounts);
      await browser.action.setBadgeText({ text: badge.text });
      await browser.action.setBadgeBackgroundColor({ color: badge.color });
      await browser.action.setTitle({ title: badge.title });
      return state;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function ensureAlarm(): Promise<void> {
  if (!(await browser.alarms.get(ALARM))) {
    // 0.5 min is the minimum period Chrome allows
    await browser.alarms.create(ALARM, { periodInMinutes: 0.5, delayInMinutes: 0.5 });
  }
}

export default defineBackground(() => {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void poll();
  });

  browser.runtime.onMessage.addListener((msg: unknown) => {
    if ((msg as { type?: string })?.type === 'refresh') return poll();
    return undefined;
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
