import { type Account, failed, MAX_MESSAGES, type Message, signedOut } from './types';

/**
 * Yandex Mail: the same internal web API the mail.yandex.ru web interface uses.
 * Verified 2026-10-10 against a live mailbox:
 *  1. GET https://mail.yandex.ru/ → the HTML contains "ckey", "uid" and "default_email".
 *     Signed out, it redirects to 360.yandex.ru / passport.yandex.ru.
 *  2. POST /web-api/models/liza1?_m=messages,app-badge-counter
 *     {"models":[{"name":"messages","params":{"current_folder":"1","extra_cond":"only_new",…}},
 *                {"name":"app-badge-counter","params":{}}],"_ckey":…,"_uid":…}
 *     A stale ckey answers models[i].status = "error", error = "ckey".
 *  3. Open a message: https://mail.yandex.ru/?uid={uid}#/message/{mid}
 */
const DOMAINS = ['mail.yandex.ru', 'mail.yandex.com'] as const;
type Domain = (typeof DOMAINS)[number];

const LOGIN_URL = 'https://passport.yandex.ru/auth?retpath=https%3A%2F%2Fmail.yandex.ru%2F';

export interface YandexSession {
  ckey: string;
  uid: string;
  email: string;
}

/** Session cache: the page is ~300 KB, so we reload it only when the ckey goes stale */
const sessions = new Map<Domain, YandexSession>();

export function parseYandexPage(html: string): YandexSession | null {
  const ckey = html.match(/"ckey":"([^"]+)"/)?.[1];
  const uid = html.match(/"uid":"(\d+)"/)?.[1];
  if (!ckey || !uid) return null;
  const email = html.match(/"default_email":"([^"]+)"/)?.[1] ?? 'Яндекс Почта';
  return { ckey: JSON.parse(`"${ckey}"`) as string, uid, email };
}

interface YandexField {
  type?: string;
  name?: string;
  email?: string;
}
interface YandexMessage {
  mid?: string;
  subject?: string;
  firstline?: string;
  new?: number | boolean;
  date?: { timestamp?: number };
  field?: YandexField[];
}
interface YandexModel {
  name: string;
  status: string;
  error?: string;
  data?: { message?: YandexMessage[]; counters?: { unread?: number } };
}
export interface YandexResponse {
  models?: YandexModel[];
}

export class YandexModelError extends Error {
  constructor(readonly code: string) {
    super(`Яндекс: ${code}`);
  }
}

export function messageUrl(domain: string, uid: string, mid: string): string {
  return `https://${domain}/?uid=${uid}#/message/${mid}`;
}

export function parseYandexMessages(
  json: YandexResponse,
  domain: string,
  session: YandexSession,
): Account {
  const models = json.models ?? [];
  const list = models.find((m) => m.name === 'messages');
  if (list?.status !== 'ok') throw new YandexModelError(list?.error ?? 'no messages model');

  const raw = (list.data?.message ?? []).filter((m) => m.new && m.mid);
  const messages: Message[] = raw.slice(0, MAX_MESSAGES).map((m) => {
    const from = m.field?.find((f) => f.type === 'from');
    let ts = m.date?.timestamp ?? 0;
    if (ts > 0 && ts < 1e12) ts *= 1000; // seconds → ms, just in case
    return {
      id: m.mid as string,
      from: from?.name || from?.email || '',
      fromEmail: from?.email ?? '',
      subject: m.subject?.trim() || '(без темы)',
      snippet: m.firstline?.trim() ?? '',
      date: ts,
      url: messageUrl(domain, session.uid, m.mid as string),
    };
  });

  const counter = models.find((m) => m.name === 'app-badge-counter');
  const unread = counter?.status === 'ok' ? counter.data?.counters?.unread : undefined;

  return {
    id: `yandex:${session.uid}`,
    provider: 'yandex',
    email: session.email,
    status: 'ok',
    unreadCount: typeof unread === 'number' ? Math.max(unread, messages.length) : messages.length,
    inboxUrl: `https://${domain}/?uid=${session.uid}#/inbox`,
    messages,
  };
}

async function loadSession(domain: Domain, fetchFn: typeof fetch): Promise<YandexSession | null> {
  const res = await fetchFn(`https://${domain}/`, { credentials: 'include', cache: 'no-store' });
  // Signed out we land on 360.yandex.ru or passport.yandex.ru
  if (!res.ok || new URL(res.url).host !== domain) return null;
  return parseYandexPage(await res.text());
}

async function requestMessages(
  domain: Domain,
  session: YandexSession,
  fetchFn: typeof fetch,
): Promise<YandexResponse> {
  const res = await fetchFn(
    `https://${domain}/web-api/models/liza1?_m=messages,app-badge-counter`,
    {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        models: [
          {
            name: 'messages',
            params: {
              current_folder: '1',
              first: 0,
              last: MAX_MESSAGES,
              sort_type: 'date',
              extra_cond: 'only_new',
            },
          },
          { name: 'app-badge-counter', params: {} },
        ],
        _ckey: session.ckey,
        _uid: session.uid,
        _locale: 'ru',
      }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as YandexResponse;
}

async function fetchDomain(domain: Domain, fetchFn: typeof fetch): Promise<Account | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let session = sessions.get(domain);
    if (!session) {
      const loaded = await loadSession(domain, fetchFn);
      if (!loaded) {
        sessions.delete(domain);
        return null;
      }
      session = loaded;
      sessions.set(domain, session);
    }
    try {
      return parseYandexMessages(await requestMessages(domain, session, fetchFn), domain, session);
    } catch (err) {
      // Stale ckey or expired session: drop the cache and retry once with a fresh page
      if (attempt === 0 && err instanceof YandexModelError) {
        sessions.delete(domain);
        continue;
      }
      throw err;
    }
  }
  return null;
}

export async function fetchYandexAccounts(fetchFn: typeof fetch = fetch): Promise<Account[]> {
  let lastError: unknown;
  for (const domain of DOMAINS) {
    try {
      const account = await fetchDomain(domain, fetchFn);
      if (account) return [account];
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) return [failed('yandex', 'Яндекс Почта', 'https://mail.yandex.ru/', lastError)];
  return [signedOut('yandex', 'Яндекс Почта', LOGIN_URL)];
}

/** For tests */
export function resetYandexSessions(): void {
  sessions.clear();
}
