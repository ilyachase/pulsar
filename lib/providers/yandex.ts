import { i18n } from '../i18n';
import { type Account, failed, MAX_MESSAGES, type Message, signedOut } from './types';

/**
 * Yandex Mail: the same internal web API the Yandex Mail web interface uses.
 * Verified 2026-10-10 against live mailboxes (a personal and a Yandex 360 account in one session):
 *  1. GET https://api.passport.yandex.ru/accounts → {"accounts":[{"uid","defaultEmail",…}],
 *     "default_uid"} — every account signed in to the browser session (the account switcher list).
 *  2. GET https://{host}/?uid={uid} → the HTML contains "ckey", "uid" and "default_email" of that
 *     account, without switching the session's default account. Personal mailboxes live on
 *     mail.yandex.ru, Yandex 360 (organization) ones on mail.360.yandex.ru; the wrong host
 *     redirects to the right one. Signed out, the page redirects to 360.yandex.ru / passport.
 *  3. POST https://{host}/web-api/models/liza1?_m=messages,app-badge-counter
 *     {"models":[{"name":"messages","params":{"current_folder":"1","extra_cond":"only_new",…}},
 *                {"name":"app-badge-counter","params":{}}],"_ckey":…,"_uid":…}
 *     The ckey is per account; a stale or foreign one answers status "error", error "ckey".
 *  4. Open a message: https://{host}/?uid={uid}#/message/{mid}
 */
const PASSPORT_ACCOUNTS = 'https://api.passport.yandex.ru/accounts';
const MAIL_HOSTS = ['mail.yandex.ru', 'mail.360.yandex.ru', 'mail.yandex.com'] as const;
/** Without the passport list we can only see the session's default account */
const FALLBACK_HOSTS = ['mail.yandex.ru', 'mail.yandex.com'] as const;

const LOGIN_URL = 'https://passport.yandex.ru/auth?retpath=https%3A%2F%2Fmail.yandex.ru%2F';

export interface YandexSession {
  ckey: string;
  uid: string;
  email: string;
}

interface PassportAccount {
  uid: string;
  email: string;
}

/** Session cache per host+uid: the page is ~300 KB, so we reload it only when the ckey goes stale */
const sessions = new Map<string, YandexSession>();
/** Which mail host serves which uid, so we don't walk through redirects on every poll */
const hostByUid = new Map<string, string>();

export function parseYandexPage(html: string): YandexSession | null {
  const ckey = html.match(/"ckey":"([^"]+)"/)?.[1];
  const uid = html.match(/"uid":"(\d+)"/)?.[1];
  if (!ckey || !uid) return null;
  const email = html.match(/"default_email":"([^"]+)"/)?.[1] ?? i18n.t('yandex.name');
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
    super(i18n.t('yandex.error', [code]));
  }
}

export function messageUrl(host: string, uid: string, mid: string): string {
  return `https://${host}/?uid=${uid}#/message/${mid}`;
}

export function parseYandexMessages(
  json: YandexResponse,
  host: string,
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
      subject: m.subject?.trim() || i18n.t('noSubject'),
      snippet: m.firstline?.trim() ?? '',
      date: ts,
      url: messageUrl(host, session.uid, m.mid as string),
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
    inboxUrl: `https://${host}/?uid=${session.uid}#/inbox`,
    messages,
  };
}

/**
 * Accounts signed in to the browser session, default first.
 * null = the list is unavailable (network error, unexpected format): fall back to the default
 * account only. [] = signed out.
 */
export async function listPassportAccounts(
  fetchFn: typeof fetch,
): Promise<PassportAccount[] | null> {
  let res: Response;
  try {
    res = await fetchFn(PASSPORT_ACCOUNTS, {
      credentials: 'include',
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    return null;
  }
  if (res.status === 401 || res.status === 403) return [];
  if (!res.ok) return null;
  let json: { accounts?: unknown; default_uid?: unknown };
  try {
    json = await res.json();
  } catch {
    return null;
  }
  if (!Array.isArray(json.accounts)) return null;

  const accounts: PassportAccount[] = [];
  for (const a of json.accounts as Array<{
    uid?: unknown;
    defaultEmail?: unknown;
    login?: unknown;
  }>) {
    if (typeof a?.uid !== 'string' && typeof a?.uid !== 'number') continue;
    const email = typeof a.defaultEmail === 'string' ? a.defaultEmail : String(a.login ?? '');
    accounts.push({ uid: String(a.uid), email: email || i18n.t('yandex.name') });
  }
  const def = String(json.default_uid ?? '');
  return accounts.sort((x, y) => Number(y.uid === def) - Number(x.uid === def));
}

/**
 * Loads ckey/uid/email from the mail page. With a uid, the page must belong to that account
 * (we never switch the session's default account). Signed out or on the wrong host the page
 * redirects; we stop at the redirect (opaque response) since we have no host permission for
 * passport/360.yandex.ru and following it would fail with "Failed to fetch".
 */
async function loadSession(
  host: string,
  uid: string | undefined,
  fetchFn: typeof fetch,
): Promise<YandexSession | null> {
  const res = await fetchFn(`https://${host}/${uid ? `?uid=${uid}` : ''}`, {
    credentials: 'include',
    cache: 'no-store',
    redirect: 'manual',
  });
  if (res.type === 'opaqueredirect' || !res.ok) return null;
  const session = parseYandexPage(await res.text());
  if (!session || (uid && session.uid !== uid)) return null;
  return session;
}

async function requestMessages(
  host: string,
  session: YandexSession,
  fetchFn: typeof fetch,
): Promise<YandexResponse> {
  const res = await fetchFn(`https://${host}/web-api/models/liza1?_m=messages,app-badge-counter`, {
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
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as YandexResponse;
}

/** One mailbox on one host; null if the page isn't there (signed out / another host) */
async function fetchMailbox(
  host: string,
  uid: string | undefined,
  fetchFn: typeof fetch,
): Promise<Account | null> {
  const key = `${host}|${uid ?? ''}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let session = sessions.get(key);
    if (!session) {
      const loaded = await loadSession(host, uid, fetchFn);
      if (!loaded) {
        sessions.delete(key);
        return null;
      }
      session = loaded;
      sessions.set(key, session);
    }
    try {
      return parseYandexMessages(await requestMessages(host, session, fetchFn), host, session);
    } catch (err) {
      // Stale ckey or expired session: drop the cache and retry once with a fresh page
      if (attempt === 0 && err instanceof YandexModelError) {
        sessions.delete(key);
        continue;
      }
      throw err;
    }
  }
  return null;
}

async function fetchByUid(account: PassportAccount, fetchFn: typeof fetch): Promise<Account> {
  const known = hostByUid.get(account.uid);
  const hosts = known ? [known, ...MAIL_HOSTS.filter((h) => h !== known)] : MAIL_HOSTS;
  try {
    for (const host of hosts) {
      const mailbox = await fetchMailbox(host, account.uid, fetchFn);
      if (mailbox) {
        hostByUid.set(account.uid, host);
        return mailbox;
      }
    }
  } catch (err) {
    return {
      ...failed('yandex', account.email, inboxFor(account.uid), err),
      id: `yandex:${account.uid}`,
    };
  }
  hostByUid.delete(account.uid);
  const err = new Error(i18n.t('yandex.mailboxNotFound'));
  return {
    ...failed('yandex', account.email, inboxFor(account.uid), err),
    id: `yandex:${account.uid}`,
  };
}

function inboxFor(uid: string): string {
  const host = hostByUid.get(uid) ?? 'mail.yandex.ru';
  return `https://${host}/?uid=${uid}#/inbox`;
}

/** The pre-multi-account behavior: only the session's default account */
async function fetchDefaultOnly(fetchFn: typeof fetch): Promise<Account[]> {
  let lastError: unknown;
  for (const host of FALLBACK_HOSTS) {
    try {
      const account = await fetchMailbox(host, undefined, fetchFn);
      if (account) return [account];
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError)
    return [failed('yandex', i18n.t('yandex.name'), 'https://mail.yandex.ru/', lastError)];
  return [signedOut('yandex', i18n.t('yandex.name'), LOGIN_URL)];
}

export async function fetchYandexAccounts(fetchFn: typeof fetch = fetch): Promise<Account[]> {
  const accounts = await listPassportAccounts(fetchFn);
  if (accounts === null) return fetchDefaultOnly(fetchFn);
  if (accounts.length === 0) return [signedOut('yandex', i18n.t('yandex.name'), LOGIN_URL)];
  return Promise.all(accounts.map((a) => fetchByUid(a, fetchFn)));
}

/** For tests */
export function resetYandexSessions(): void {
  sessions.clear();
  hostByUid.clear();
}
