import { i18n } from '../i18n';
import { type Account, failed, MAX_MESSAGES, type Message, signedOut } from './types';

/**
 * Amazon WorkMail: the internal API of its web client (based on Kopano/Zarafa WebApp), authorized
 * by the browser session. Verified 2026-10-11 against a live mailbox:
 *  1. GET {webmail URL} → the HTML has <meta name="X-amzn-authenticate-csrf">,
 *     "X-amzn-authenticate-csrf-ver" and "X-amzn-app-instance-id". Signed out, it redirects (303)
 *     to signin.aws. The session cookies (amzn-webapp-*) are session-only: they survive a browser
 *     restart only with Chrome's "Continue where you left off".
 *  2. POST /workmail/ajax?authenticate&v2 {} → user.smtp_address, tokens.csrf (used from here on)
 *  3. POST /workmail/ajax?hierarchymodule_list&v2 → store props.default_folder_inbox, and the
 *     inbox folder's props.content_unread
 *  4. POST /workmail/ajax?maillistmodule_list&v2 → messages; unread = message_flags bit 1 unset,
 *     message_delivery_time is in seconds
 * Headers: x-amzn-action (authenticate | ajax), x-amzn-csrf, x-amzn-csrf-ver, x-amzn-app-instance-id.
 * The web client has no per-message URL (its router lives in React state and the query string is
 * wiped on load), so a message opens the mailbox.
 */
const MSGFLAG_READ = 1;
/** Newest messages to scan for unread ones (the counter covers the rest) */
const PAGE_SIZE = 50;

export interface WorkmailTokens {
  csrf: string;
  csrfVer: string;
  instanceId: string;
}

/** Only WorkMail web client URLs, e.g. https://webmail.mail.eu-west-1.awsapps.com/workmail/?organization=acme */
export function parseWorkmailUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    !/^webmail\.mail\.[a-z0-9-]+\.awsapps\.com$/.test(url.hostname)
  ) {
    return null;
  }
  if (!url.pathname.startsWith('/workmail')) url.pathname = '/workmail/';
  return url;
}

const metaContent = (html: string, name: string): string | undefined => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (new RegExp(`name=["']${name}["']`, 'i').test(tag)) {
      return tag.match(/content=["']([^"']*)["']/i)?.[1];
    }
  }
  return undefined;
};

export function parseWorkmailPage(html: string): WorkmailTokens | null {
  const csrf = metaContent(html, 'X-amzn-authenticate-csrf');
  const csrfVer = metaContent(html, 'X-amzn-authenticate-csrf-ver');
  const instanceId = metaContent(html, 'X-amzn-app-instance-id');
  return csrf && csrfVer && instanceId ? { csrf, csrfVer, instanceId } : null;
}

interface MailItem {
  entryid?: string;
  props?: {
    subject?: string;
    sender_name?: string;
    sent_representing_name?: string;
    sender_smtp_address?: string;
    sender_email_address?: string;
    message_flags?: number;
    message_delivery_time?: number;
  };
}

export function toMessages(items: MailItem[], inboxUrl: string): Message[] {
  return items
    .filter((i) => i.entryid && ((i.props?.message_flags ?? 0) & MSGFLAG_READ) === 0)
    .slice(0, MAX_MESSAGES)
    .map((i) => {
      const p = i.props ?? {};
      return {
        id: i.entryid as string,
        from: p.sender_name || p.sent_representing_name || p.sender_smtp_address || '',
        fromEmail: p.sender_smtp_address || p.sender_email_address || '',
        subject: p.subject?.trim() || i18n.t('noSubject'),
        snippet: '',
        date: (p.message_delivery_time ?? 0) * 1000,
        url: inboxUrl,
      };
    });
}

export async function fetchWorkmailAccounts(
  webmailUrl: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<Account[]> {
  if (!webmailUrl) return [];
  const url = parseWorkmailUrl(webmailUrl);
  if (!url) return [];
  const inboxUrl = url.toString();
  try {
    const page = await fetchFn(inboxUrl, {
      credentials: 'include',
      cache: 'no-store',
      redirect: 'manual',
    });
    // Signed out: a redirect to signin.aws (we stop at it: no host permission there)
    if (page.type === 'opaqueredirect' || (page.status >= 300 && page.status < 400)) {
      return [signedOut('workmail', 'WorkMail', inboxUrl)];
    }
    if (!page.ok) throw new Error(`HTTP ${page.status}`);
    const tokens = parseWorkmailPage(await page.text());
    if (!tokens) return [signedOut('workmail', 'WorkMail', inboxUrl)];

    const post = async (action: string, body: unknown, csrf: string) => {
      const res = await fetchFn(`${url.origin}/workmail/ajax?${action}&v2`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8;',
          'x-amzn-action': action === 'authenticate' ? 'authenticate' : 'ajax',
          'x-amzn-csrf': csrf,
          'x-amzn-csrf-ver': tokens.csrfVer,
          'x-amzn-app-instance-id': tokens.instanceId,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };

    const auth = await post('authenticate', {}, tokens.csrf);
    const csrf: string | undefined = auth?.tokens?.csrf;
    if (!csrf) return [signedOut('workmail', 'WorkMail', inboxUrl)];
    const email: string = auth.user?.smtp_address || auth.user?.email_address || 'WorkMail';

    const hierarchy = await post(
      'hierarchymodule_list',
      { hierarchymodule: { hierarchymodule1: { list: {} } } },
      csrf,
    );
    const store = hierarchy?.hierarchymodule?.hierarchymodule1?.list?.item?.[0];
    const inboxId: string | undefined = store?.props?.default_folder_inbox;
    if (!store || !inboxId) throw new Error(i18n.t('workmail.noInbox'));
    const inbox = store.folders?.item?.find((f: { entryid?: string }) => f.entryid === inboxId);

    const list = await post(
      'maillistmodule_list',
      {
        maillistmodule: {
          maillistmodule1: {
            list: {
              entryid: inboxId,
              store_entryid: store.store_entryid,
              groupDir: 'ASC',
              sort: [{ direction: 'DESC', field: 'message_delivery_time' }],
              restriction: { start: 0, limit: PAGE_SIZE },
            },
          },
        },
      },
      csrf,
    );
    const messages = toMessages(list?.maillistmodule?.maillistmodule1?.list?.item ?? [], inboxUrl);
    const counter = inbox?.props?.content_unread;

    return [
      {
        id: `workmail:${email}`,
        provider: 'workmail',
        email,
        status: 'ok',
        unreadCount:
          typeof counter === 'number' ? Math.max(counter, messages.length) : messages.length,
        inboxUrl,
        messages,
      },
    ];
  } catch (err) {
    return [failed('workmail', 'WorkMail', inboxUrl, err)];
  }
}
