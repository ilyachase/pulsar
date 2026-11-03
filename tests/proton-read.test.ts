import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchProtonAccounts,
  markProtonMessageRead,
  parseProtonAccount,
  resetProtonCache,
} from '../lib/providers/proton';

const email = 'me@proton.me';
const uid = 'b'.repeat(32);
const data = {
  Code: 1000,
  Messages: [
    {
      ID: 'selected-message',
      ConversationID: 'conv',
      Subject: 'One',
      Unread: 1,
      Time: 10,
      Sender: { Name: 'Ann', Address: 'ann@example.com' },
    },
    {
      ID: 'unshown-sibling',
      ConversationID: 'conv',
      Subject: 'Two',
      Unread: 1,
      Time: 9,
      Sender: { Address: 'ann@example.com' },
    },
  ],
};
const counts = { Code: 1000, Counts: [{ LabelID: '0', Unread: 2 }] };
const account = parseProtonAccount(data, counts, email, 1);
const message = account.messages[0]!;

beforeEach(() => resetProtonCache());

function server(options: { code?: number; noChange?: boolean } = {}) {
  let changed = false;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/addresses'))
      return Response.json({
        Code: 1000,
        Addresses: [{ Email: email, Status: 1, Receive: 1, Order: 1 }],
      });
    if (url.includes('/sessions/local'))
      return Response.json({ Code: 1000, Sessions: [{ LocalID: 1, PrimaryEmail: email }] });
    if (init?.method === 'PUT') {
      changed = true;
      return Response.json({ Code: options.code ?? 1000 });
    }
    if (url.includes('/messages/count'))
      return Response.json({ Code: 1000, Counts: [{ LabelID: '0', Unread: changed ? 1 : 2 }] });
    if (url.includes('/messages?')) {
      const body = structuredClone(data);
      if (changed && !options.noChange) body.Messages = body.Messages.slice(1);
      return Response.json(body);
    }
    return new Response('no', { status: 404 });
  });
}

describe('markProtonMessageRead', () => {
  it('marks the one message and leaves the unread sibling', async () => {
    const fetchFn = server();
    await fetchProtonAccounts(fetchFn, async () => [uid]);
    expect(await markProtonMessageRead(account, message, fetchFn)).toBe(true);
    const put = fetchFn.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(String(put?.[0])).toBe('https://mail.proton.me/api/mail/v4/messages/read');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ IDs: ['selected-message'] });
    expect(fetchFn.mock.calls.some(([url]) => String(url).includes('/conversations/read'))).toBe(
      false,
    );
  });

  it('does nothing for a message that is not in this mailbox', async () => {
    const fetchFn = server();
    expect(
      await markProtonMessageRead(
        { ...account, id: 'proton:other@proton.me', email: 'other@proton.me' },
        message,
        fetchFn,
      ),
    ).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns false when Proton keeps the message unread', async () => {
    const fetchFn = server({ noChange: true });
    await fetchProtonAccounts(fetchFn, async () => [uid]);
    expect(await markProtonMessageRead(account, message, fetchFn)).toBe(false);
  });
});
