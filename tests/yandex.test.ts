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

  const PASSPORT = 'https://api.passport.yandex.ru/accounts';
  const redirect = () => {
    const res = new Response('');
    Object.defineProperty(res, 'type', { value: 'opaqueredirect' });
    return res;
  };
  const pageFor = (uid: string, email: string, ckey: string) =>
    `<script>x={"uid":"${uid}","ckey":"${ckey}","default_email":"${email}"}</script>`;
  const passport = (accounts: Array<{ uid: string; email: string }>, defaultUid: string) =>
    new Response(
      JSON.stringify({
        accounts: accounts.map((a) => ({ uid: a.uid, defaultEmail: a.email, login: 'x' })),
        default_uid: defaultUid,
      }),
    );

  it('fetches every passport account from the host that serves it', async () => {
    const posts: string[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      expect(init?.redirect ?? 'manual').toBe('manual');
      if (url === PASSPORT) {
        return passport(
          [
            { uid: '200', email: 'work@company.ru' },
            { uid: '100', email: 'me@yandex.ru' },
          ],
          '100',
        );
      }
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { _ckey: string; _uid: string };
        posts.push(`${new URL(url).host} ${body._uid} ${body._ckey}`);
        return new Response(JSON.stringify(messages));
      }
      // Personal mailbox on mail.yandex.ru, Yandex 360 one on mail.360.yandex.ru
      if (url === 'https://mail.yandex.ru/?uid=100')
        return new Response(pageFor('100', 'me@yandex.ru', 'k1'));
      if (url === 'https://mail.360.yandex.ru/?uid=200') {
        return new Response(pageFor('200', 'work@company.ru', 'k2'));
      }
      return redirect();
    }) as unknown as typeof fetch;

    const accounts = await fetchYandexAccounts(fetchFn);
    // The default account comes first
    expect(accounts.map((a) => [a.email, a.status])).toEqual([
      ['me@yandex.ru', 'ok'],
      ['work@company.ru', 'ok'],
    ]);
    expect(accounts[1]?.messages[0]?.url).toBe(
      'https://mail.360.yandex.ru/?uid=200#/message/194499208907126502',
    );
    expect(accounts[1]?.inboxUrl).toBe('https://mail.360.yandex.ru/?uid=200#/inbox');
    // Each account uses its own ckey
    expect(posts.sort()).toEqual(['mail.360.yandex.ru 200 k2', 'mail.yandex.ru 100 k1']);

    // The next poll goes straight to the known host, with cached sessions
    posts.length = 0;
    const pages: string[] = [];
    const counting = (async (url: string, init?: RequestInit) => {
      if (init?.method !== 'POST' && url !== PASSPORT) pages.push(url);
      return fetchFn(url, init);
    }) as unknown as typeof fetch;
    await fetchYandexAccounts(counting);
    expect(pages).toEqual([]);
    expect(posts).toHaveLength(2);
  });

  it('ignores a page that belongs to another account', async () => {
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (url === PASSPORT) return passport([{ uid: '200', email: 'work@company.ru' }], '200');
      if (init?.method === 'POST') return new Response(JSON.stringify(messages));
      // Every host answers with someone else's mailbox
      if (url.includes('?uid=')) return new Response(pageFor('999', 'other@yandex.ru', 'k'));
      return redirect();
    }) as unknown as typeof fetch;
    const [acc] = await fetchYandexAccounts(fetchFn);
    expect(acc).toMatchObject({ id: 'yandex:200', email: 'work@company.ru', status: 'error' });
  });

  it('reports signed-out when the passport list is empty', async () => {
    const fetchFn = (async (url: string) =>
      url === PASSPORT ? passport([], '') : redirect()) as unknown as typeof fetch;
    const [acc] = await fetchYandexAccounts(fetchFn);
    expect(acc?.status).toBe('signed-out');
  });

  describe('without the passport list (falls back to the default account)', () => {
    it('reloads the page once when the ckey is stale', async () => {
      let posts = 0;
      let pages = 0;
      const fetchFn = (async (url: string, init?: RequestInit) => {
        if (url === PASSPORT) return new Response('', { status: 500 });
        if (init?.method === 'POST') {
          posts++;
          const body = JSON.parse(String(init.body)) as { _ckey: string };
          expect(body._ckey).toBe('abc/def!mv4');
          if (posts === 1) {
            const stale = { models: [{ name: 'messages', status: 'error', error: 'ckey' }] };
            return new Response(JSON.stringify(stale));
          }
          return new Response(JSON.stringify(messages));
        }
        pages++;
        return new Response(page);
      }) as unknown as typeof fetch;

      const [acc] = await fetchYandexAccounts(fetchFn);
      expect(acc?.status).toBe('ok');
      expect(posts).toBe(2);
      expect(pages).toBe(2);
    });

    it('reports signed-out when the page redirects (to 360.yandex.ru / passport)', async () => {
      const fetchFn = (async (url: string, init?: RequestInit) => {
        if (url === PASSPORT) throw new TypeError('Failed to fetch');
        expect(init?.redirect).toBe('manual');
        return redirect();
      }) as unknown as typeof fetch;
      const [acc] = await fetchYandexAccounts(fetchFn);
      expect(acc?.status).toBe('signed-out');
    });
  });
});
