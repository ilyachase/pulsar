import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { markGmailMessageRead } from '../lib/providers/gmail-read';

const feed = readFileSync(new URL('./fixtures/gmail-feed.xml', import.meta.url), 'utf8');
const readFeed = feed.replace(/<entry>[\s\S]*?<\/entry>/, '');
const url = 'https://mail.google.com/mail/u/1/#inbox/19a1b2c3d4e5f607';
const accountId = 'gmail:test.user@gmail.com';

function server(
  options: {
    after?: string;
    html?: string;
    status?: number;
    response?: string;
    cookie?: string | null;
    delayChecks?: number;
  } = {},
) {
  let posted = false;
  let checks = 0;
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = String(input);
    if (init?.method === 'POST') {
      posted = true;
      return new Response(options.response ?? 'action accepted', { status: options.status ?? 200 });
    }
    if (href.endsWith('feed/atom')) {
      const body =
        !posted || checks++ < (options.delayChecks ?? 0) ? feed : (options.after ?? readFeed);
      return new Response(body);
    }
    return new Response(options.html ?? "var ID_KEY = 'test-account-key';");
  });
  const getCookie = vi.fn(async () =>
    options.cookie === null ? null : { value: options.cookie ?? 'test-csrf-token' },
  );
  const wait = vi.fn(async () => {});
  return { fetchFn, getCookie, wait };
}

describe('markGmailMessageRead', () => {
  it('explicitly marks only the selected thread in its account and verifies the feed', async () => {
    const deps = server({ delayChecks: 1 });
    expect(await markGmailMessageRead(url, accountId, deps)).toBe(true);
    expect(deps.getCookie).toHaveBeenCalledWith('https://mail.google.com/mail/u/1/');
    const [href, init] = deps.fetchFn.mock.calls.find(([, init]) => init?.method === 'POST')!;
    const actionUrl = new URL(String(href));
    expect(actionUrl.pathname).toBe('/mail/u/1/s/');
    expect(actionUrl.searchParams.get('at')).toBe('test-csrf-token');
    const payload = JSON.parse(String((init?.body as FormData).get('s_jr')));
    expect(payload[1][0][3]).toEqual([
      null,
      3,
      '19a1b2c3d4e5f607',
      '19a1b2c3d4e5f607',
      'l:all',
      [],
      [],
      [],
    ]);
    expect(deps.wait).toHaveBeenCalledTimes(1);
    expect(init?.credentials).toBe('include');
  });

  it('never mutates an account whose slot now belongs to someone else', async () => {
    const deps = server();
    expect(await markGmailMessageRead(url, 'gmail:other@gmail.com', deps)).toBe(false);
    expect(deps.fetchFn).toHaveBeenCalledTimes(1);
    expect(deps.getCookie).not.toHaveBeenCalled();
  });

  it.each(['https://evil.test/mail/u/1/#inbox/abcdef', 'https://mail.google.com/mail/u/1/#inbox'])(
    'rejects a non-message URL before requesting credentials: %s',
    async (href) => {
      const deps = server();
      expect(await markGmailMessageRead(href, accountId, deps)).toBe(false);
      expect(deps.fetchFn).not.toHaveBeenCalled();
    },
  );

  it.each([{ cookie: null }, { html: '<html>Sign in</html>' }])(
    'does not send an action without account credentials: %j',
    async (options) => {
      const deps = server(options);
      expect(await markGmailMessageRead(url, accountId, deps)).toBe(false);
      expect(deps.fetchFn.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    },
  );

  it.each([{ status: 403 }, { response: '<a href="/spreauth">Permission needed</a>' }])(
    'does not report a rejected action as read: %j',
    async (options) => {
      expect(await markGmailMessageRead(url, accountId, server(options))).toBe(false);
    },
  );

  it('does not accept HTTP 200 if the message remains unread', async () => {
    const deps = server({ after: feed });
    expect(await markGmailMessageRead(url, accountId, deps)).toBe(false);
    expect(deps.wait).toHaveBeenCalledTimes(5);
  });

  it('does not mistake a sign-in page or account change during verification for success', async () => {
    for (const after of [
      '<html>Sign in</html>',
      readFeed.replaceAll('test.user@gmail.com', 'other@gmail.com'),
    ]) {
      expect(await markGmailMessageRead(url, accountId, server({ after }))).toBe(false);
    }
  });

  it('does not propagate request errors that could contain a token', async () => {
    const deps = server();
    deps.fetchFn.mockRejectedValue(new Error('https://mail.google.com/?at=secret'));
    expect(await markGmailMessageRead(url, accountId, deps)).toBe(false);
  });
});
