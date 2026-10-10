import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  fetchYandexAccounts,
  parseYandexMessages,
  parseYandexPage,
  resetYandexSessions,
  type YandexResponse,
} from '../lib/providers/yandex';

const messages = JSON.parse(
  readFileSync(new URL('./fixtures/yandex-messages.json', import.meta.url), 'utf8'),
) as YandexResponse;
// Yandex escapes "/" in the inline JSON as /
const page =
  '<script>window.x={"uid":"100500","ckey":"abc\\u002Fdef!mv4","default_email":"test@yandex.ru"}</script>';
const session = { ckey: 'abc/def!mv4', uid: '100500', email: 'test@yandex.ru' };

describe('parseYandexPage', () => {
  it('extracts ckey (unescaped), uid and email', () => {
    expect(parseYandexPage(page)).toEqual(session);
  });
  it('returns null without a ckey', () => {
    expect(parseYandexPage('<html>login</html>')).toBeNull();
  });
});

describe('parseYandexMessages', () => {
  it('keeps unread messages only and builds message links', () => {
    const acc = parseYandexMessages(messages, 'mail.yandex.ru', session);
    expect(acc).toMatchObject({
      id: 'yandex:100500',
      email: 'test@yandex.ru',
      unreadCount: 4,
      inboxUrl: 'https://mail.yandex.ru/?uid=100500#/inbox',
    });
    expect(acc.messages).toEqual([
      {
        id: '194499208907126502',
        from: 'Банк',
        fromEmail: 'bank@example.com',
        subject: 'Выписка за сентябрь',
        snippet: 'Во вложении выписка по счёту',
        date: 1791623520000,
        url: 'https://mail.yandex.ru/?uid=100500#/message/194499208907126502',
      },
    ]);
  });

  it('throws on a model error (stale ckey)', () => {
    expect(() =>
      parseYandexMessages(
        { models: [{ name: 'messages', status: 'error', error: 'ckey' }] },
        'mail.yandex.ru',
        session,
      ),
    ).toThrow('ckey');
  });
});

describe('fetchYandexAccounts', () => {
  beforeEach(resetYandexSessions);

  const respond = (body: string, url: string) => {
    const res = new Response(body);
    Object.defineProperty(res, 'url', { value: url });
    return res;
  };

  it('reloads the page once when the ckey is stale', async () => {
    let posts = 0;
    let pages = 0;
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts++;
        const body = JSON.parse(String(init.body)) as { _ckey: string };
        expect(body._ckey).toBe('abc/def!mv4');
        if (posts === 1) {
          const stale = { models: [{ name: 'messages', status: 'error', error: 'ckey' }] };
          return respond(JSON.stringify(stale), url);
        }
        return respond(JSON.stringify(messages), url);
      }
      pages++;
      return respond(page, url);
    }) as unknown as typeof fetch;

    const [acc] = await fetchYandexAccounts(fetchFn);
    expect(acc?.status).toBe('ok');
    expect(posts).toBe(2);
    expect(pages).toBe(2);
  });

  it('reports signed-out when redirected away from the mail domain', async () => {
    const fetchFn = (async () =>
      respond('', 'https://360.yandex.ru/mail/')) as unknown as typeof fetch;
    const [acc] = await fetchYandexAccounts(fetchFn);
    expect(acc?.status).toBe('signed-out');
  });
});
