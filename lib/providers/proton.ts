import { i18n } from '../i18n';
import { type Account, failed, MAX_MESSAGES, type Message, signedOut } from './types';

/**
 * Proton Mail: the internal API of the web client (mail.proton.me), authorized by the browser session.
 * Verified 2026-11-03 against a live mailbox:
 *  1. The session uid is the suffix of the httpOnly cookie AUTH-<uid> (the same value as
 *     localStorage ps-<localID>.UID). The cookie's path is /api, so a lookup for the site root
 *     does not see it; ask by domain and by the API url. Every call needs headers x-pm-uid and
 *     x-pm-appversion: web-mail@<version>. The version is APP_VERSION from the mail bundle.
 *     Without the uid header the API answers 401. A stale version answers code 5003.
 *  2. GET /api/core/v4/addresses → the mailbox address.
 *  3. GET /api/auth/v4/sessions/local → LocalID and PrimaryEmail for the open-in-browser URL.
 *     Session.UID in that response is a different id and is rejected as x-pm-uid.
 *  4. GET /api/mail/v4/messages/count → Counts[].LabelID "0" is the inbox unread total.
 *  5. GET /api/mail/v4/messages?LabelID=0&Unread=1&Sort=Time&Desc=1&Limit=
 *     Subject, Sender.{Name,Address} and Time (seconds) are plaintext on the list.
 *  6. Open a message: /u/<localID>/inbox/<conversationID>/<messageID>
 *  7. PUT /api/mail/v4/messages/read {"IDs":[id]} marks one message. The conversation call
 *     would mark every message in the thread.
 */
const ORIGIN = 'https://mail.proton.me';
const API = `${ORIGIN}/api`;
const INBOX = '0';
/** Verified build. Replaced when the API reports the client is out of date (code 5003). */
const VERIFIED_APP_VERSION = 'web-mail@5.0.138.11';
const LOGIN_URL = 'https://account.proton.me/mail';
const STALE_APP = 5003;
const ID = /^[A-Za-z0-9_-]{1,200}={0,2}$/;

let appVersion = VERIFIED_APP_VERSION;
/** Cookie uid per mailbox, so marking read does not walk every signed-in session again. */
const uidByEmail = new Map<string, string>();

export interface ProtonMessage {
  ID?: string;
  ConversationID?: string;
  Subject?: string;
  Unread?: number;
  Time?: number;
  Sender?: { Name?: string; Address?: string };
  SenderName?: string;
  SenderAddress?: string;
}
export interface ProtonList {
  Code?: number;
  Messages?: ProtonMessage[];
}
export interface ProtonCounts {
  Code?: number;
  Counts?: { LabelID?: string; Unread?: number }[];
}

export const inboxUrl = (localId: number) => `${ORIGIN}/u/${localId}/inbox`;
export const messageUrl = (localId: number, conversationId: string, messageId: string) =>
  `${inboxUrl(localId)}/${conversationId}/${messageId}`;

const UID = /^[a-z0-9]{16,}$/;

/** Uids of AUTH-<uid> session cookies, in cookie order, without duplicates. */
export function authUids(cookies: { name: string }[]): string[] {
  const uids: string[] = [];
  for (const cookie of cookies) {
    const uid = /^AUTH-([a-z0-9]{16,})$/.exec(cookie.name)?.[1];
    if (uid && !uids.includes(uid)) uids.push(uid);
  }
  return uids;
}

export function parseIndexScript(html: string): string | null {
  return html.match(/\/assets\/static\/index\.[a-z0-9]+\.js/)?.[0] ?? null;
}

/** "web-mail@5.0.138.11" — the client id the API accepts, plus APP_VERSION from the bundle. */
export function parseAppVersion(source: string): string | null {
  const version = source.match(/APP_VERSION:"([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)"/)?.[1];
  return version ? `web-mail@${version}` : null;
}

export function parseAddressEmail(json: unknown): string | null {
  const list = (json as { Addresses?: unknown }).Addresses;
  if (!Array.isArray(list)) return null;
  const usable = list.filter(
    (a): a is { Email: string; Receive?: number; Order?: number; Status?: number } =>
      !!a &&
      typeof a === 'object' &&
      typeof (a as { Email?: unknown }).Email === 'string' &&
      (a as { Email: string }).Email.includes('@') &&
      (a as { Status?: number }).Status !== 0,
  );
  usable.sort((a, b) => (a.Order ?? 99) - (b.Order ?? 99));
  return (usable.find((a) => a.Receive === 1) ?? usable[0])?.Email ?? null;
}

export function parseLocalId(json: unknown, email: string): number | null {
  const sessions = (json as { Sessions?: unknown }).Sessions;
  if (!Array.isArray(sessions)) return null;
  const want = email.toLowerCase();
  for (const session of sessions) {
    if (!session || typeof session !== 'object') continue;
    const localId = (session as { LocalID?: unknown }).LocalID;
    const primary = (session as { PrimaryEmail?: unknown }).PrimaryEmail;
    if (typeof localId !== 'number' || !Number.isInteger(localId) || localId < 0 || localId > 50)
      continue;
    if (typeof primary === 'string' && primary.toLowerCase() === want) return localId;
  }
  return null;
}

const readable = (subject: string) =>
  subject && !subject.includes('-----BEGIN PGP') ? subject : i18n.t('noSubject');

export function parseProtonAccount(
  list: ProtonList,
  counts: ProtonCounts,
  email: string,
  localId: number,
): Account {
  if (list.Code !== 1000) throw new Error(`Proton: ${list.Code ?? 'no status'}`);
  if (counts.Code !== 1000) throw new Error(`Proton: ${counts.Code ?? 'no status'}`);
  const messages: Message[] = (list.Messages ?? [])
    .filter((m) => m.Unread === 1 && ID.test(m.ID ?? '') && ID.test(m.ConversationID ?? ''))
    .slice(0, MAX_MESSAGES)
    .map((m) => {
      const address = m.Sender?.Address || m.SenderAddress || '';
      let time = m.Time ?? 0;
      if (time > 0 && time < 1e12) time *= 1000;
      return {
        id: m.ID as string,
        from: (m.Sender?.Name || m.SenderName || address).trim(),
        fromEmail: address,
        subject: readable((m.Subject ?? '').trim()),
        snippet: '',
        date: time,
        url: messageUrl(localId, m.ConversationID as string, m.ID as string),
      };
    });
  const unread = counts.Counts?.find((c) => c.LabelID === INBOX)?.Unread;
  return {
    id: `proton:${email}`,
    provider: 'proton',
    email,
    status: 'ok',
    unreadCount: typeof unread === 'number' ? Math.max(unread, messages.length) : messages.length,
    inboxUrl: inboxUrl(localId),
    messages,
  };
}

interface ProtonJson {
  Code?: number;
}

class StaleAppError extends Error {}

async function api(
  path: string,
  uid: string,
  version: string,
  fetchFn: typeof fetch,
  init: RequestInit = {},
): Promise<ProtonJson> {
  const response = await fetchFn(`${API}/${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/vnd.protonmail.v1+json',
      'x-pm-appversion': version,
      'x-pm-uid': uid,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  if (response.status === 401 || response.status === 403) return { Code: response.status };
  let json: ProtonJson;
  try {
    json = (await response.json()) as ProtonJson;
  } catch {
    throw new Error(`Proton: HTTP ${response.status}`);
  }
  if (json.Code === STALE_APP) throw new StaleAppError();
  if (!response.ok && json.Code == null) throw new Error(`Proton: HTTP ${response.status}`);
  return json;
}

async function refreshAppVersion(fetchFn: typeof fetch): Promise<string> {
  const page = await fetchFn(`${ORIGIN}/`, { credentials: 'include', cache: 'reload' });
  if (!page.ok) throw new Error(`Proton: HTTP ${page.status}`);
  const script = parseIndexScript(await page.text());
  if (!script) throw new Error('Proton: app version');
  const bundle = await fetchFn(`${ORIGIN}${script}`, { credentials: 'include', cache: 'reload' });
  if (!bundle.ok) throw new Error(`Proton: HTTP ${bundle.status}`);
  const version = parseAppVersion(await bundle.text());
  if (!version) throw new Error('Proton: app version');
  appVersion = version;
  return version;
}

const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

async function unreadMailbox(
  uid: string,
  email: string,
  localId: number,
  version: string,
  fetchFn: typeof fetch,
): Promise<Account> {
  const listPath = `mail/v4/messages?${query({
    LabelID: INBOX,
    Unread: '1',
    Sort: 'Time',
    Desc: '1',
    Limit: String(MAX_MESSAGES),
    Page: '0',
  })}`;
  const [list, counts] = await Promise.all([
    api(listPath, uid, version, fetchFn),
    api('mail/v4/messages/count', uid, version, fetchFn),
  ]);
  return parseProtonAccount(list as ProtonList, counts as ProtonCounts, email, localId);
}

/** null = this cookie is not a signed-in mailbox (guest session, or signed out of it). */
async function fetchMailbox(
  uid: string,
  version: string,
  fetchFn: typeof fetch,
): Promise<Account | null> {
  const addresses = await api('core/v4/addresses?Page=0&PageSize=50', uid, version, fetchFn);
  if (addresses.Code === 401 || addresses.Code === 403) return null;
  const email = addresses.Code === 1000 ? parseAddressEmail(addresses) : null;
  if (addresses.Code !== 1000 || !email)
    throw new Error(`Proton: ${addresses.Code ?? 'no status'}`);
  const sessions = await api('auth/v4/sessions/local', uid, version, fetchFn);
  const localId = sessions.Code === 1000 ? parseLocalId(sessions, email) : null;
  if (localId == null) throw new Error(`Proton: ${sessions.Code ?? 'no mailbox'}`);
  const account = await unreadMailbox(uid, email, localId, version, fetchFn);
  uidByEmail.set(email.toLowerCase(), uid);
  return account;
}

async function listMailboxes(
  uids: string[],
  version: string,
  fetchFn: typeof fetch,
): Promise<Account[]> {
  const rows = await Promise.all(
    uids.map(async (uid) => {
      try {
        return await fetchMailbox(uid, version, fetchFn);
      } catch (err) {
        if (err instanceof StaleAppError) throw err;
        return err instanceof Error ? err : new Error(String(err));
      }
    }),
  );
  const accounts: Account[] = [];
  let failure: unknown;
  for (const row of rows) {
    if (row instanceof Error) failure ??= row;
    else if (row && !accounts.some((a) => a.email.toLowerCase() === row.email.toLowerCase()))
      accounts.push(row);
  }
  if (accounts.length > 0) return accounts;
  if (failure) return [failed('proton', i18n.t('proton.name'), `${ORIGIN}/`, failure)];
  return [signedOut('proton', i18n.t('proton.name'), LOGIN_URL)];
}

export function parsePersistedSessions(raw: unknown): { localId: number; uid: string }[] {
  if (!Array.isArray(raw)) return [];
  const sessions: { localId: number; uid: string }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const localId = (item as { localId?: unknown }).localId;
    const uid = (item as { uid?: unknown }).uid;
    if (typeof localId !== 'number' || !Number.isInteger(localId) || localId < 0 || localId > 50)
      continue;
    if (typeof uid !== 'string' || !UID.test(uid)) continue;
    if (!sessions.some((s) => s.uid === uid)) sessions.push({ localId, uid });
  }
  return sessions;
}

const PAGE_SESSIONS = 'protonSessions';
let pageSessions: { localId: number; uid: string }[] = [];

/** Sessions read from the open Proton page (localStorage ps-<localID>). */
export async function rememberProtonSessions(raw: unknown): Promise<boolean> {
  const sessions = parsePersistedSessions(raw);
  if (sessions.length === 0) return false;
  pageSessions = sessions;
  try {
    await browser.storage.session.set({ [PAGE_SESSIONS]: sessions });
  } catch {
    // The in-memory list still covers this service worker.
  }
  return true;
}

async function pageUids(): Promise<string[]> {
  if (pageSessions.length === 0) {
    try {
      const stored = await browser.storage.session.get(PAGE_SESSIONS);
      pageSessions = parsePersistedSessions(stored[PAGE_SESSIONS]);
    } catch {
      pageSessions = [];
    }
  }
  return pageSessions.map((s) => s.uid);
}

/**
 * AUTH-<uid> is path-scoped to /api, and Chrome may keep it in the mail site's cookie partition.
 * A root-url lookup misses both, which looks like being signed out.
 */
async function cookieUids(): Promise<string[]> {
  const queries: Record<string, unknown>[] = [
    { url: `${ORIGIN}/api/` },
    { domain: 'mail.proton.me' },
    { domain: 'proton.me' },
  ];
  for (const topLevelSite of [`${ORIGIN}`, 'https://account.proton.me']) {
    queries.push({ url: `${ORIGIN}/api/`, partitionKey: { topLevelSite } });
    queries.push({ domain: 'proton.me', partitionKey: { topLevelSite } });
  }
  const lists = await Promise.all(
    queries.map(async (query) => {
      try {
        return await browser.cookies.getAll(query as Parameters<typeof browser.cookies.getAll>[0]);
      } catch {
        return [];
      }
    }),
  );
  return authUids(lists.flat());
}

async function defaultUids(): Promise<string[]> {
  const [cookies, page] = await Promise.all([cookieUids(), pageUids()]);
  return [...new Set([...cookies, ...page])];
}

export async function fetchProtonAccounts(
  fetchFn: typeof fetch = fetch,
  listUids: () => Promise<string[]> = defaultUids,
): Promise<Account[]> {
  let uids: string[];
  try {
    uids = await listUids();
  } catch (err) {
    return [failed('proton', i18n.t('proton.name'), `${ORIGIN}/`, err)];
  }
  if (uids.length === 0) return [signedOut('proton', i18n.t('proton.name'), LOGIN_URL)];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await listMailboxes(uids, appVersion, fetchFn);
    } catch (err) {
      if (!(err instanceof StaleAppError) || attempt > 0)
        return [failed('proton', i18n.t('proton.name'), `${ORIGIN}/`, err)];
      try {
        await refreshAppVersion(fetchFn);
      } catch (refreshErr) {
        return [failed('proton', i18n.t('proton.name'), `${ORIGIN}/`, refreshErr)];
      }
    }
  }
  return [signedOut('proton', i18n.t('proton.name'), LOGIN_URL)];
}

async function resolveUid(email: string, fetchFn: typeof fetch): Promise<string | null> {
  const known = uidByEmail.get(email.toLowerCase());
  if (known) return known;
  for (let attempt = 0; attempt < 2; attempt++) {
    let uids: string[];
    try {
      uids = await defaultUids();
    } catch {
      return null;
    }
    try {
      for (const uid of uids) {
        const addresses = await api(
          'core/v4/addresses?Page=0&PageSize=50',
          uid,
          appVersion,
          fetchFn,
        );
        const found = addresses.Code === 1000 ? parseAddressEmail(addresses) : null;
        if (found?.toLowerCase() === email.toLowerCase()) {
          uidByEmail.set(email.toLowerCase(), uid);
          return uid;
        }
      }
      return null;
    } catch (err) {
      if (!(err instanceof StaleAppError) || attempt > 0) return null;
      try {
        await refreshAppVersion(fetchFn);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** One message, not the conversation: unshown messages in the same thread stay unread. */
export async function markProtonMessageRead(
  account: Account,
  message: Message,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  let inbox: URL;
  let target: URL;
  try {
    inbox = new URL(account.inboxUrl);
    target = new URL(message.url);
  } catch {
    return false;
  }
  const localId = /^\/u\/(\d+)\/inbox$/.exec(inbox.pathname)?.[1];
  const parts = /^\/u\/(\d+)\/inbox\/([^/]+)\/([^/]+)$/.exec(target.pathname);
  if (
    account.provider !== 'proton' ||
    account.id !== `proton:${account.email}` ||
    inbox.origin !== ORIGIN ||
    target.origin !== ORIGIN ||
    !localId ||
    !parts ||
    parts[1] !== localId ||
    parts[3] !== message.id ||
    !ID.test(message.id) ||
    !ID.test(parts[2] ?? '')
  )
    return false;
  try {
    const uid = await resolveUid(account.email, fetchFn);
    if (!uid) return false;
    const before = await unreadMailbox(uid, account.email, Number(localId), appVersion, fetchFn);
    if (before.id !== account.id || !before.messages.some((m) => m.id === message.id)) return false;
    const result = await api('mail/v4/messages/read', uid, appVersion, fetchFn, {
      method: 'PUT',
      body: JSON.stringify({ IDs: [message.id] }),
    });
    if (result.Code !== 1000) return false;
    for (let check = 0; check < 6; check++) {
      if (check > 0) await new Promise((r) => setTimeout(r, 500));
      const after = await unreadMailbox(uid, account.email, Number(localId), appVersion, fetchFn);
      if (!after.messages.some((m) => m.id === message.id)) return true;
    }
  } catch {
    uidByEmail.delete(account.email.toLowerCase());
  }
  return false;
}

/** For tests */
export function resetProtonCache(): void {
  appVersion = VERIFIED_APP_VERSION;
  uidByEmail.clear();
  pageSessions = [];
}
