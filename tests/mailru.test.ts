import { describe, expect, it } from 'vitest';
import {
  fetchMailruAccounts,
  MAILRU_LOGIN_URL,
  type MailruStatus,
  parseMailruMessages,
  parseNaviData,
} from '../lib/providers/mailru';

const msg = (id: string, unread: boolean, extra = {}) => ({
  id,
  subject: `s${id}`,
  snippet: 'Привет',
  date: 1_791_733_578,
  flags: { unread },
  correspondents: { from: [{ name: 'Анна', email: 'anna@example.com' }] },
  ...extra,
});

const status = (messages = [msg('1', true), msg('2', false)]): MailruStatus => ({
  status: 200,
  body: {
    messages,
    folders: [
      { id: '0', messages_unread: 7 },
      { id: '950', messages_unread: 3 },
    ],
  },
});

describe('parseNaviData', () => {
  it('lists signed-in accounts, the active one first', () => {
    expect(
      parseNaviData({
        status: 'ok',
        data: { email: 'b@mail.ru', ldata: { 'a@mail.ru': {}, 'b@mail.ru': {} } },
      }),
    ).toEqual(['b@mail.ru', 'a@mail.ru']);
  });
  it('is empty when signed out', () => {
    expect(parseNaviData({ status: 'noauth', data: { action: 'list', list: [] } })).toEqual([]);
    expect(parseNaviData(null)).toEqual([]);
  });
});

describe('parseMailruMessages', () => {
  it('keeps unread messages, takes the inbox counter and links messages to the account', () => {
    const acc = parseMailruMessages(status(), 'me@mail.ru');
    expect(acc).toMatchObject({
      id: 'mailru:me@mail.ru',
      provider: 'mailru',
      status: 'ok',
      unreadCount: 7,
      inboxUrl: 'https://e.mail.ru/inbox/?x-email=me%40mail.ru',
    });
    expect(acc.messages).toEqual([
      {
        id: '1',
        from: 'Анна',
        fromEmail: 'anna@example.com',
        subject: 's1',
        snippet: 'Привет',
        date: 1_791_733_578_000,
        url: 'https://e.mail.ru/inbox/0:1:0/?x-email=me%40mail.ru',
      },
    ]);
  });
  it('fills an empty subject', () => {
    expect(
      parseMailruMessages(status([msg('1', true, { subject: ' ' })]), 'me@mail.ru').messages[0]
        ?.subject,
    ).toBe('(без темы)');
  });
  it('throws on an API error status', () => {
    expect(() => parseMailruMessages({ status: 403 }, 'me@mail.ru')).toThrow('403');
  });
});

describe('fetchMailruAccounts', () => {
  const server = (navi: unknown, short: unknown = { status: 200, body: { token: 't1' } }) => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => {
      urls.push(url);
      if (url.startsWith('https://portal.mail.ru/')) return Response.json(navi);
      if (url.includes('/user/short')) return Response.json(short);
      return Response.json(status());
    }) as unknown as typeof fetch;
    return { fetchFn, urls };
  };

  it('asks for a token per account, then its unread inbox messages', async () => {
    const { fetchFn, urls } = server({
      data: { email: 'me@mail.ru', ldata: { 'me@mail.ru': {} } },
    });
    const [acc] = await fetchMailruAccounts(fetchFn);
    expect(acc?.status).toBe('ok');
    const list = new URL(urls[2] as string);
    expect(list.pathname).toBe('/api/v1/messages/status');
    expect(Object.fromEntries(list.searchParams)).toMatchObject({
      folder: '0',
      filters: '{"unread":true}',
      email: 'me@mail.ru',
      token: 't1',
    });
  });

  it('reports signed-out without a session', async () => {
    const { fetchFn } = server({ status: 'noauth', data: { action: 'list', list: [] } });
    const [acc] = await fetchMailruAccounts(fetchFn);
    expect(acc).toMatchObject({ status: 'signed-out', inboxUrl: MAILRU_LOGIN_URL });
  });

  it('reports an account the session lost as signed-out', async () => {
    const { fetchFn } = server({ data: { email: 'me@mail.ru', ldata: {} } }, { status: 403 });
    const [acc] = await fetchMailruAccounts(fetchFn);
    expect(acc).toMatchObject({ id: 'mailru:me@mail.ru', status: 'signed-out' });
  });
});
