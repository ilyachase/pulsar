import { XMLParser } from 'fast-xml-parser';
import { i18n } from '../i18n';
import { type Account, failed, MAX_MESSAGES, type Message, signedOut } from './types';

/**
 * Gmail: Atom feed of unread messages in the inbox, authorized by the browser session cookies.
 * Accounts are indexed /u/0, /u/1, … Google answers an index that doesn't exist with the
 * feed of an already-seen account (or 401), so we stop at the first repeated email.
 */
const MAX_ACCOUNTS = 10;
const LOGIN_URL =
  'https://accounts.google.com/ServiceLogin?service=mail&continue=https://mail.google.com/mail/';

const parser = new XMLParser({
  // Gmail writes apostrophes and quotes in titles and snippets as &#39; / &quot;
  htmlEntities: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (name) => name === 'entry' || name === 'link',
});

interface AtomLink {
  rel?: string;
  href?: string;
}
interface AtomEntry {
  title?: string;
  summary?: string;
  link?: AtomLink[];
  issued?: string;
  modified?: string;
  id?: string;
  author?: { name?: string; email?: string };
}

const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v)).trim();

export function parseGmailFeed(xml: string, index: number): Account | null {
  const feed = parser.parse(xml)?.feed;
  if (!feed) return null;

  // Title looks like "Gmail - Inbox for x@gmail.com" (wording depends on the locale)
  const email = text(feed.title).match(/[^\s<>]+@[^\s<>]+/)?.[0];
  if (!email) return null;

  const entries: AtomEntry[] = feed.entry ?? [];
  const messages: Message[] = entries.slice(0, MAX_MESSAGES).map((e) => {
    const href = e.link?.find((l) => !l.rel || l.rel === 'alternate')?.href ?? '';
    return {
      id: text(e.id) || href,
      from: text(e.author?.name) || text(e.author?.email),
      fromEmail: text(e.author?.email),
      subject: text(e.title) || i18n.t('noSubject'),
      snippet: text(e.summary),
      date: Date.parse(text(e.issued) || text(e.modified)) || 0,
      url: href || inboxUrl(index),
    };
  });

  const fullcount = Number.parseInt(text(feed.fullcount), 10);
  return {
    id: `gmail:${email}`,
    provider: 'gmail',
    email,
    status: 'ok',
    unreadCount: Number.isFinite(fullcount) ? fullcount : messages.length,
    inboxUrl: inboxUrl(index),
    messages,
  };
}

function inboxUrl(index: number): string {
  return `https://mail.google.com/mail/u/${index}/#inbox`;
}

export async function fetchGmailAccounts(fetchFn: typeof fetch = fetch): Promise<Account[]> {
  const accounts: Account[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < MAX_ACCOUNTS; i++) {
    let res: Response;
    try {
      res = await fetchFn(`https://mail.google.com/mail/u/${i}/feed/atom`, {
        credentials: 'include',
        cache: 'no-store',
      });
    } catch (err) {
      if (i === 0) return [failed('gmail', 'Gmail', inboxUrl(0), err)];
      break;
    }
    if (res.status === 401 || res.status === 403) break;
    if (!res.ok) {
      if (i === 0) return [failed('gmail', 'Gmail', inboxUrl(0), new Error(`HTTP ${res.status}`))];
      break;
    }
    const account = parseGmailFeed(await res.text(), i);
    // Not XML (e.g. a redirect to the sign-in page) or a repeated account means the list is over
    if (!account || seen.has(account.email)) break;
    seen.add(account.email);
    accounts.push(account);
  }

  return accounts.length > 0 ? accounts : [signedOut('gmail', 'Gmail', LOGIN_URL)];
}
