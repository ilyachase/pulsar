import { describe, expect, it, vi } from 'vitest';
import { markMailruMessageRead, parseMailruMessages } from '../lib/providers/mailru';

const data = {
  status: 200,
  body: {
    messages: [
      { id: 'selected-message', flags: { unread: true } },
      { id: 'unshown-sibling', flags: { unread: true } },
    ],
    folders: [{ id: '0', messages_unread: 2 }],
  },
};
const account = parseMailruMessages(data, 'me@mail.ru'),
  message = account.messages[0]!;
function server(
  options: { shortStatus?: number; http?: number; status?: number; noChange?: boolean } = {},
) {
  let changed = false;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    if (u.pathname.endsWith('/user/short'))
      return Response.json({ status: options.shortStatus ?? 200, body: { token: 'test-token' } });
    if (init?.method === 'POST') {
      changed = true;
      return Response.json({ status: options.status ?? 200 }, { status: options.http ?? 200 });
    }
    const result = structuredClone(data);
    if (changed && !options.noChange) {
      result.body.messages = result.body.messages.slice(1);
      result.body.folders[0]!.messages_unread = 1;
    }
    return Response.json(result);
  });
}
describe('markMailruMessageRead', () => {
  it('uses the message action with one selected ID, never the thread operation', async () => {
    const fetchFn = server();
    expect(await markMailruMessageRead(account, message, fetchFn)).toBe(true);
    const [href, init] = fetchFn.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(new URL(String(href)).pathname).toBe('/api/v1/messages/marks');
    const body = init?.body as URLSearchParams;
    expect(body.get('email')).toBe('me@mail.ru');
    expect(body.get('token')).toBe('test-token');
    expect(JSON.parse(body.get('marks')!)).toEqual([
      { name: 'unread', unset: ['selected-message'], folder: 0 },
    ]);
    expect(body.has('message_id_last')).toBe(false);
    expect(fetchFn.mock.calls.at(-1)?.[0]).toContain('/messages/status?');
  });
  it('rejects account or message mismatches before requesting credentials', async () => {
    const fetchFn = server();
    expect(
      await markMailruMessageRead({ ...account, id: 'mailru:other@mail.ru' }, message, fetchFn),
    ).toBe(false);
    expect(
      await markMailruMessageRead({ ...account, inboxUrl: 'https://evil.test' }, message, fetchFn),
    ).toBe(false);
    expect(
      await markMailruMessageRead(account, { ...message, url: 'https://evil.test' }, fetchFn),
    ).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('does not mutate an account that has signed out', async () => {
    const fetchFn = server({ shortStatus: 403 });
    expect(await markMailruMessageRead(account, message, fetchFn)).toBe(false);
    expect(fetchFn.mock.calls).toHaveLength(1);
  });
  it.each([{ http: 403 }, { status: 403 }])(
    'rejects failures at either HTTP or API status level: %j',
    async (options) => {
      expect(await markMailruMessageRead(account, message, server(options))).toBe(false);
    },
  );
  it('does not accept a 200 response while the selected message remains unread', async () => {
    expect(await markMailruMessageRead(account, message, server({ noChange: true }))).toBe(false);
  });
  it('does not propagate errors containing session credentials', async () => {
    const fetchFn = server();
    fetchFn.mockRejectedValue(new Error('token=secret'));
    expect(await markMailruMessageRead(account, message, fetchFn)).toBe(false);
  });
});
