import { i18n } from '../i18n';
import { type Account, failed, MAX_MESSAGES, type Message, signedOut } from './types';

/**
 * Mail.ru: the internal API of its web client (e.mail.ru), authorized by the browser session.
 * Verified 2026-10-11 against a live mailbox:
 *  1. GET https://portal.mail.ru/NaviData?ldata=1 → {"status","data":{"email","ldata":{"<email>":
 *     {"mail_cnt",…}}}} — every account signed in to the session (the portal account switcher).
 *  2. GET https://e.mail.ru/api/v1/user/short?email= → {"status":200,"body":{"token"}}; the token
 *     is per account and required by the rest of the API (403 without it).
 *  3. GET https://e.mail.ru/api/v1/messages/status?folder=0&filters={"unread":true}&limit=&offset=0
 *     &email=&htmlencoded=false&token= → body.messages (id, subject, snippet, date in seconds,
 *     flags.unread, correspondents.from[0] {name, email}) and body.folders (inbox id "0",
 *     messages_unread).
 *  4. Open a message: https://e.mail.ru/inbox/0:{id}:0/?x-email={email} — the web client switches to
 *     that account when x-email differs from the active one.
 */
const ORIGIN = 'https://e.mail.ru';
const NAVI_DATA = 'https://portal.mail.ru/NaviData?ldata=1';
const INBOX = '0';
export const MAILRU_LOGIN_URL = 'https://account.mail.ru/login';

const withEmail = (url: string, email: string) =>
  `${url}?${new URLSearchParams({ 'x-email': email })}`;

export const messageUrl = (id: string, email: string) =>
  withEmail(`${ORIGIN}/inbox/0:${id}:0/`, email);
export const inboxUrl = (email: string) => withEmail(`${ORIGIN}/inbox/`, email);

/** Signed-in emails, the active one first; [] when signed out */
export function parseNaviData(json: unknown): string[] {
  const data = (json as { data?: { email?: unknown; ldata?: unknown } } | null)?.data;
  const listed = data?.ldata && typeof data.ldata === 'object' ? Object.keys(data.ldata) : [];
  const active = typeof data?.email === 'string' ? data.email : '';
  const emails = listed.filter((e) => e.includes('@'));
  if (active.includes('@') && !emails.includes(active)) emails.push(active);
  return emails.sort((x, y) => Number(y === active) - Number(x === active));
}

interface MailruMessage {
  id?: string;
  subject?: string;
  snippet?: string;
  date?: number;
  flags?: { unread?: boolean };
  correspondents?: { from?: Array<{ name?: string; email?: string }> };
}
interface MailruFolder {
  id?: string;
  messages_unread?: number;
}
export interface MailruStatus {
  status?: number;
  body?: { messages?: MailruMessage[]; folders?: MailruFolder[] };
}

export function parseMailruMessages(json: MailruStatus, email: string): Account {
  if (json.status !== 200) throw new Error(`Mail.ru: ${json.status ?? 'no status'}`);
  const messages: Message[] = (json.body?.messages ?? [])
    .filter((m) => m.id && m.flags?.unread)
    .slice(0, MAX_MESSAGES)
    .map((m) => {
      const from = m.correspondents?.from?.[0];
      return {
        id: m.id as string,
        from: from?.name || from?.email || '',
        fromEmail: from?.email ?? '',
        subject: m.subject?.trim() || i18n.t('noSubject'),
        snippet: m.snippet?.trim() ?? '',
        date: (m.date ?? 0) * 1000,
        url: messageUrl(m.id as string, email),
      };
    });
  const counter = json.body?.folders?.find((f) => f.id === INBOX)?.messages_unread;
  return {
    id: `mailru:${email}`,
    provider: 'mailru',
    email,
    status: 'ok',
    unreadCount: typeof counter === 'number' ? Math.max(counter, messages.length) : messages.length,
    inboxUrl: inboxUrl(email),
    messages,
  };
}

async function getJson(url: string, fetchFn: typeof fetch): Promise<unknown> {
  const res = await fetchFn(url, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const api = (path: string, params: Record<string, string>) =>
  `${ORIGIN}/api/v1/${path}?${new URLSearchParams({ ...params, htmlencoded: 'false' })}`;

async function fetchMailbox(email: string, fetchFn: typeof fetch): Promise<Account> {
  try {
    const short = (await getJson(api('user/short', { email }), fetchFn)) as {
      status?: number;
      body?: { token?: string };
    };
    const token = short.body?.token;
    // The session lost this account (signed out of it in another tab)
    if (short.status !== 200 || !token) {
      return { ...signedOut('mailru', email, MAILRU_LOGIN_URL), id: `mailru:${email}` };
    }
    const status = await getJson(
      api('messages/status', {
        folder: INBOX,
        limit: String(MAX_MESSAGES),
        offset: '0',
        filters: JSON.stringify({ unread: true }),
        email,
        token,
      }),
      fetchFn,
    );
    return parseMailruMessages(status as MailruStatus, email);
  } catch (err) {
    return { ...failed('mailru', email, inboxUrl(email), err), id: `mailru:${email}` };
  }
}

export async function fetchMailruAccounts(fetchFn: typeof fetch = fetch): Promise<Account[]> {
  let emails: string[];
  try {
    emails = parseNaviData(await getJson(NAVI_DATA, fetchFn));
  } catch (err) {
    return [failed('mailru', i18n.t('mailru.name'), `${ORIGIN}/inbox/`, err)];
  }
  if (emails.length === 0) return [signedOut('mailru', i18n.t('mailru.name'), MAILRU_LOGIN_URL)];
  return Promise.all(emails.map((e) => fetchMailbox(e, fetchFn)));
}
