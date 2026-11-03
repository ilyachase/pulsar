import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authUids,
  fetchProtonAccounts,
  type ProtonCounts,
  type ProtonList,
  parseAddressEmail,
  parseAppVersion,
  parseIndexScript,
  parseLocalId,
  parsePersistedSessions,
  parseProtonAccount,
  resetProtonCache,
} from '../lib/providers/proton';

const email = 'me@proton.me';
const uid = 'a'.repeat(32);
const message = {
  ID: 'msg1',
  ConversationID: 'conv1',
  Subject: 'Hello',
  Unread: 1,
  Time: 1_793_698_969,
  Sender: { Name: 'Анна', Address: 'anna@example.com' },
};
const list = (messages = [message, { ...message, ID: 'read1', Unread: 0 }]): ProtonList => ({
  Code: 1000,
  Messages: messages,
});
const counts = (unread = 4): ProtonCounts => ({
  Code: 1000,
  Counts: [
    { LabelID: '0', Unread: unread },
    { LabelID: '5', Unread: 9 },
  ],
});

beforeEach(() => resetProtonCache());

describe('parsePersistedSessions', () => {
  it('keeps uid and local id from the mail page', () => {
    const uid = 'a'.repeat(32);
    expect(
      parsePersistedSessions([
        { localId: 1, uid },
        { localId: 1, uid },
        { localId: -1, uid },
      ]),
    ).toEqual([{ localId: 1, uid }]);
    expect(parsePersistedSessions(null)).toEqual([]);
  });
});

describe('authUids', () => {
  it('reads session uids from AUTH- cookie names', () => {
    expect(
      authUids([
        { name: 'Tag' },
        { name: `AUTH-${uid}` },
        { name: 'AUTH-short' },
        { name: `AUTH-${uid}` },
      ]),
    ).toEqual([uid]);
  });
});

describe('parse helpers', () => {
  it('finds the mail bundle and its app version', () => {
    expect(parseIndexScript('<script src="/assets/static/index.abc123.js"></script>')).toBe(
      '/assets/static/index.abc123.js',
    );
    expect(parseAppVersion('APP_NAME:"proton-mail",APP_VERSION:"5.0.138.11"')).toBe(
      'web-mail@5.0.138.11',
    );
  });
  it('picks the receiving address and the matching local id', () => {
    expect(
      parseAddressEmail({
        Addresses: [
          { Email: 'old@proton.me', Status: 0, Receive: 1, Order: 1 },
          { Email: email, Status: 1, Receive: 1, Order: 2 },
        ],
      }),
    ).toBe(email);
    expect(
      parseLocalId(
        {
          Sessions: [
            { LocalID: 0, PrimaryEmail: 'other@proton.me' },
            { LocalID: 1, PrimaryEmail: email },
          ],
        },
        email,
      ),
    ).toBe(1);
  });
});

describe('parseProtonAccount', () => {
  it('keeps unread messages, the inbox counter, and a link to that message', () => {
    const account = parseProtonAccount(list(), counts(), email, 1);
    expect(account).toMatchObject({
      id: 'proton:me@proton.me',
      provider: 'proton',
      status: 'ok',
      unreadCount: 4,
      inboxUrl: 'https://mail.proton.me/u/1/inbox',
    });
    expect(account.messages).toEqual([
      {
        id: 'msg1',
        from: 'Анна',
        fromEmail: 'anna@example.com',
        subject: 'Hello',
        snippet: '',
        date: 1_793_698_969_000,
        url: 'https://mail.proton.me/u/1/inbox/conv1/msg1',
      },
    ]);
  });
  it('replaces an encrypted or empty subject', () => {
    expect(
      parseProtonAccount(
        list([{ ...message, Subject: '-----BEGIN PGP MESSAGE-----' }]),
        counts(1),
        email,
        1,
      ).messages[0]?.subject,
    ).toBe('(без темы)');
  });
  it('throws on an API error status', () => {
    expect(() => parseProtonAccount({ Code: 401 }, counts(), email, 1)).toThrow('401');
  });
});

describe('fetchProtonAccounts', () => {
  const addresses = {
    Code: 1000,
    Addresses: [{ Email: email, Status: 1, Receive: 1, Order: 1 }],
  };
  const sessions = {
    Code: 1000,
    Sessions: [{ LocalID: 1, PrimaryEmail: email, UID: 'not-the-cookie' }],
  };

  function server(options: { addressCode?: number; stale?: boolean } = {}) {
    let version = 'web-mail@5.0.138.11';
    let stale = options.stale ?? false;
    const headers: string[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const header = new Headers(init?.headers);
      if (header.get('x-pm-appversion')) {
        headers.push(header.get('x-pm-appversion') as string);
        version = header.get('x-pm-appversion') as string;
      }
      if (url.endsWith('mail.proton.me/'))
        return new Response('<script src="/assets/static/index.abc.js"></script>');
      if (url.endsWith('/index.abc.js'))
        return new Response('APP_VERSION:"5.0.200.1",clientID:"web-mail"');
      if (url.includes('/addresses'))
        return Response.json(options.addressCode ? { Code: options.addressCode } : addresses);
      if (url.includes('/sessions/local')) return Response.json(sessions);
      if (url.includes('/messages/count')) return Response.json(counts());
      if (url.includes('/messages?')) {
        if (stale) {
          stale = false;
          return Response.json({ Code: 5003 });
        }
        return Response.json(list());
      }
      return new Response('no', { status: 404 });
    });
    return { fetchFn, headers, version: () => version };
  }

  it('lists the mailbox for an AUTH- cookie and asks for unread inbox messages', async () => {
    const { fetchFn, headers } = server();
    const [account] = await fetchProtonAccounts(fetchFn, async () => [uid]);
    expect(account).toMatchObject({
      id: 'proton:me@proton.me',
      email,
      unreadCount: 4,
      inboxUrl: 'https://mail.proton.me/u/1/inbox',
    });
    expect(headers[0]).toBe('web-mail@5.0.138.11');
    const listCall = fetchFn.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes('/messages?'));
    expect(listCall).toContain('LabelID=0');
    expect(listCall).toContain('Unread=1');
    expect(
      new Headers(
        fetchFn.mock.calls.find(([url]) => String(url).includes('/addresses'))?.[1]?.headers,
      ).get('x-pm-uid'),
    ).toBe(uid);
  });

  it('is signed out when no session cookie is present', async () => {
    const { fetchFn } = server();
    const [account] = await fetchProtonAccounts(fetchFn, async () => []);
    expect(account).toMatchObject({ id: 'proton:signed-out', status: 'signed-out' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('is signed out when the cookie is a guest session', async () => {
    const { fetchFn } = server({ addressCode: 401 });
    const [account] = await fetchProtonAccounts(fetchFn, async () => [uid]);
    expect(account).toMatchObject({ status: 'signed-out' });
  });

  it('reloads the app version when Proton says the client is out of date', async () => {
    const { fetchFn, headers } = server({ stale: true });
    const [account] = await fetchProtonAccounts(fetchFn, async () => [uid]);
    expect(account).toMatchObject({ status: 'ok', email });
    expect(headers).toContain('web-mail@5.0.200.1');
  });
});
