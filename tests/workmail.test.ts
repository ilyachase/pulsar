import { describe, expect, it } from 'vitest';
import {
  fetchWorkmailAccounts,
  parseWorkmailPage,
  parseWorkmailUrl,
  toMessages,
} from '../lib/providers/workmail';

const URL_ = 'https://webmail.mail.eu-west-1.awsapps.com/workmail/?organization=acme';
const PAGE = `<html><head>
<meta name="X-amzn-authenticate-csrf" content="first-token">
<meta name="X-amzn-authenticate-csrf-ver" content="2">
<meta name="X-amzn-app-instance-id" content="instance-1">
</head></html>`;

const item = (id: string, flags: number, extra = {}) => ({
  entryid: id,
  props: {
    subject: `s${id}`,
    sender_name: 'Анна',
    sender_smtp_address: 'anna@example.com',
    message_flags: flags,
    message_delivery_time: 1_791_700_000,
    ...extra,
  },
});

describe('parseWorkmailUrl', () => {
  it('accepts WorkMail web client URLs only', () => {
    expect(parseWorkmailUrl(URL_)?.hostname).toBe('webmail.mail.eu-west-1.awsapps.com');
    expect(parseWorkmailUrl('https://webmail.mail.us-east-1.awsapps.com/')?.pathname).toBe(
      '/workmail/',
    );
    expect(parseWorkmailUrl('https://evil.example.com/workmail/')).toBeNull();
    expect(parseWorkmailUrl('http://webmail.mail.eu-west-1.awsapps.com/workmail/')).toBeNull();
    expect(parseWorkmailUrl('not a url')).toBeNull();
  });
});

describe('parseWorkmailPage', () => {
  it('reads the bootstrap tokens from meta tags', () => {
    expect(parseWorkmailPage(PAGE)).toEqual({
      csrf: 'first-token',
      csrfVer: '2',
      instanceId: 'instance-1',
    });
    expect(parseWorkmailPage('<html>sign in</html>')).toBeNull();
  });
});

describe('toMessages', () => {
  it('keeps unread messages (read bit unset) and links them to the mailbox', () => {
    const messages = toMessages([item('a', 0), item('b', 1), item('c', 4)], URL_);
    expect(messages.map((m) => m.id)).toEqual(['a', 'c']);
    expect(messages[0]).toMatchObject({
      from: 'Анна',
      fromEmail: 'anna@example.com',
      subject: 'sa',
      date: 1_791_700_000_000,
      url: URL_,
    });
  });
});

describe('fetchWorkmailAccounts', () => {
  const server = (overrides: { page?: () => Response } = {}) => {
    const calls: Array<{ action: string; csrf: string | null }> = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (!url.includes('/workmail/ajax?')) return overrides.page?.() ?? new Response(PAGE);
      const action = url.split('?')[1]?.split('&')[0] ?? '';
      calls.push({ action, csrf: new Headers(init?.headers).get('x-amzn-csrf') });
      if (action === 'authenticate') {
        return Response.json({
          user: { smtp_address: 'me@acme.com' },
          tokens: { csrf: 'session-token' },
        });
      }
      if (action === 'hierarchymodule_list') {
        return Response.json({
          hierarchymodule: {
            hierarchymodule1: {
              list: {
                item: [
                  {
                    store_entryid: 'store',
                    props: { default_folder_inbox: 'inbox' },
                    folders: { item: [{ entryid: 'inbox', props: { content_unread: 3 } }] },
                  },
                ],
              },
            },
          },
        });
      }
      return Response.json({
        maillistmodule: { maillistmodule1: { list: { item: [item('a', 0), item('b', 1)] } } },
      });
    }) as unknown as typeof fetch;
    return { fetchFn, calls };
  };

  it('is absent until a WorkMail URL is configured', async () => {
    expect(await fetchWorkmailAccounts(null)).toEqual([]);
  });

  it('walks page → authenticate → folders → inbox list with the right tokens', async () => {
    const { fetchFn, calls } = server();
    const [acc] = await fetchWorkmailAccounts(URL_, fetchFn);
    expect(acc).toMatchObject({
      id: 'workmail:me@acme.com',
      email: 'me@acme.com',
      status: 'ok',
      unreadCount: 3,
    });
    expect(acc?.messages.map((m) => m.id)).toEqual(['a']);
    expect(calls).toEqual([
      { action: 'authenticate', csrf: 'first-token' },
      { action: 'hierarchymodule_list', csrf: 'session-token' },
      { action: 'maillistmodule_list', csrf: 'session-token' },
    ]);
  });

  it('reports signed-out when the page redirects to sign-in', async () => {
    const { fetchFn } = server({
      page: () => {
        const res = new Response('');
        Object.defineProperty(res, 'type', { value: 'opaqueredirect' });
        return res;
      },
    });
    const [acc] = await fetchWorkmailAccounts(URL_, fetchFn);
    expect(acc?.status).toBe('signed-out');
  });
});
