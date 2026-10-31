import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markYandexMessageRead,
  parseYandexMessages,
  resetYandexSessions,
  type YandexResponse,
} from '../lib/providers/yandex';

const data = JSON.parse(
  readFileSync(new URL('./fixtures/yandex-messages.json', import.meta.url), 'utf8'),
) as YandexResponse;
const account = parseYandexMessages(data, 'mail.yandex.ru', {
  uid: '100500',
  ckey: 'key',
  email: 'test@yandex.ru',
});
const message = account.messages[0]!;
function server(options: { uid?: string; status?: number; result?: string; stale?: boolean } = {}) {
  let posted = false,
    actions = 0;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method !== 'POST')
      return new Response(
        `<script>x={"uid":"${options.uid ?? '100500'}","ckey":"key","default_email":"test@yandex.ru"}</script>`,
      );
    if (String(input).includes('_m=do-messages')) {
      actions++;
      posted = true;
      if (options.stale && actions === 1)
        return Response.json({ models: [{ name: 'do-messages', status: 'error', error: 'ckey' }] });
      return Response.json(
        {
          models: [{ name: 'do-messages', status: 'ok', data: { result: options.result ?? 'ok' } }],
        },
        { status: options.status ?? 200 },
      );
    }
    const reply = structuredClone(data);
    if (posted) reply.models![0]!.data!.message = [];
    return Response.json(reply);
  });
}
describe('markYandexMessageRead', () => {
  beforeEach(resetYandexSessions);
  it('marks only the selected mid for the correct uid and checks a fresh unread list', async () => {
    const fetchFn = server();
    expect(await markYandexMessageRead(account, message, fetchFn)).toBe(true);
    const [url, init] = fetchFn.mock.calls.find(([url]) => String(url).includes('_m=do-messages'))!;
    expect(new URL(String(url)).host).toBe('mail.yandex.ru');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      _uid: '100500',
      models: [
        { name: 'do-messages', params: { action: 'mark', ids: message.id, mailboxUid: 'null' } },
      ],
    });
    expect(fetchFn.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(3);
  });
  it('never mutates a different account after its session changes', async () => {
    const fetchFn = server({ uid: '200' });
    expect(await markYandexMessageRead(account, message, fetchFn)).toBe(false);
    expect(fetchFn.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  });
  it('rejects a foreign host, mismatched message and malformed mailbox URL', async () => {
    const fetchFn = server();
    for (const a of [
      { ...account, inboxUrl: 'https://evil.test/?uid=100500' },
      { ...account, id: 'yandex:other' },
      { ...account, inboxUrl: 'bad-url' },
    ]) {
      expect(await markYandexMessageRead(a, message, fetchFn)).toBe(false);
    }
    expect(
      await markYandexMessageRead(account, { ...message, url: message.url + 'x' }, fetchFn),
    ).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each([{ status: 403 }, { result: 'error' }])(
    'does not confirm rejected actions: %j',
    async (options) => {
      expect(await markYandexMessageRead(account, message, server(options))).toBe(false);
    },
  );
  it('refreshes stale credentials for a rejected ckey and retries once', async () => {
    const fetchFn = server({ stale: true });
    // The first rejected mutation must leave the before-list unchanged.
    let actions = 0;
    const wrapped = (async (input, init) => {
      if (String(input).includes('_m=do-messages')) actions++;
      if (actions === 1 && String(input).includes('_m=messages')) return Response.json(data);
      return fetchFn(input, init);
    }) as typeof fetch;
    expect(await markYandexMessageRead(account, message, wrapped)).toBe(true);
    expect(actions).toBe(2);
  });
});
