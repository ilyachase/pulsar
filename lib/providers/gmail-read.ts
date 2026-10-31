import { parseGmailFeed } from './gmail';

const VERIFY_ATTEMPTS = 6;
const VERIFY_INTERVAL_MS = 1_000;

interface Dependencies {
  fetchFn: typeof fetch;
  getCookie: (url: string) => Promise<{ value: string } | null | undefined>;
  wait: (ms: number) => Promise<void>;
}

/**
 * Gmail's web-client action, also used by Gmail Notifier (inbasic/ignotifier).
 * This is an undocumented web endpoint, not the OAuth Gmail API. Temporary account keys stay
 * in this call only. A 200 alone is not success: verify the account and unread feed afterwards.
 */
export async function markGmailMessageRead(
  url: string,
  accountId: string,
  dependencies: Partial<Dependencies> = {},
): Promise<boolean> {
  const target = url.match(/^https:\/\/mail\.google\.com\/mail\/u\/(\d+)\/#inbox\/([0-9a-f]+)$/i);
  if (!target) return false;
  const [, index, messageId] = target;
  const base = `https://mail.google.com/mail/u/${index}/`;
  const fetchFn = dependencies.fetchFn ?? fetch;
  const getCookie =
    dependencies.getCookie ?? ((url: string) => browser.cookies.get({ url, name: 'GMAIL_AT' }));
  const wait = dependencies.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const request = (href: string, options: RequestInit = {}) =>
    fetchFn(href, {
      ...options,
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  const unread = async () => {
    const response = await request(`${base}feed/atom`);
    if (!response.ok) return null;
    const account = parseGmailFeed(await response.text(), Number(index));
    return account?.id === accountId ? account : null;
  };

  try {
    // Account slots can change after sign-out. Never mutate an unverified account slot.
    const before = await unread();
    if (!before) return false;
    if (!before.messages.some((message) => message.url === url)) return false;
    const page = await request(base);
    if (!page.ok) return false;
    const ik = (await page.text()).match(/ID_KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const cookie = await getCookie(base);
    if (!ik || !cookie?.value) return false;

    const query = new URLSearchParams({
      v: 'or',
      ik,
      at: cookie.value,
      subui: 'chrome',
      hl: 'en',
      ts: String(Date.now()),
    });
    const body = new FormData();
    body.set(
      's_jr',
      JSON.stringify([
        null,
        [
          [null, null, null, [null, 3, messageId, messageId, 'l:all', [], [], []]],
          [null, null, null, null, null, null, [null, true, false]],
          [null, null, null, null, null, null, [null, true, false]],
        ],
        2,
        null,
        null,
        null,
        ik,
      ]),
    );
    const response = await request(`${base}s/?${query}`, { method: 'POST', body });
    if (!response.ok || (await response.text()).includes('/spreauth')) return false;

    for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
      if (attempt > 0) await wait(VERIFY_INTERVAL_MS);
      const account = await unread();
      if (!account) return false;
      if (!account.messages.some((message) => message.url === url)) return true;
    }
  } catch {
    // Never propagate fetch errors containing the action URL: its query includes a CSRF token.
  }
  return false;
}
