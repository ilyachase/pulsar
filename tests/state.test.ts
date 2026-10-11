import { describe, expect, it } from 'vitest';
import type { Account, Message, State } from '../lib/providers/types';
import { hideOpenedSince, markRead, openedKey } from '../lib/state';

const msg = (id: string): Message => ({
  id,
  from: 'A',
  fromEmail: 'a@example.com',
  subject: 's',
  snippet: '',
  date: 1,
  url: `https://example.com/${id}`,
});
const acc = (id: string, ids: string[], unreadCount = ids.length): Account => ({
  id,
  provider: 'gmail',
  email: `${id}@example.com`,
  status: 'ok',
  unreadCount,
  inboxUrl: '',
  messages: ids.map(msg),
});

describe('markRead', () => {
  const state: State = { accounts: [acc('a', ['1', '2'], 5), acc('b', ['1'])], updatedAt: 0 };

  it('removes the message from its account and lowers the count', () => {
    const next = markRead(state, 'a', '1');
    expect(next.accounts[0]?.messages.map((m) => m.id)).toEqual(['2']);
    expect(next.accounts[0]?.unreadCount).toBe(4);
    // Same message id in another account is untouched
    expect(next.accounts[1]).toBe(state.accounts[1]);
  });

  it('is a no-op for an unknown message and never goes below zero', () => {
    expect(markRead(state, 'a', 'nope')).toEqual(state);
    const zero: State = { accounts: [acc('a', ['1'], 0)], updatedAt: 0 };
    expect(markRead(zero, 'a', '1').accounts[0]?.unreadCount).toBe(0);
  });
});

describe('hideOpenedSince', () => {
  it('hides only messages opened after the poll started', () => {
    const opened = new Map([
      [openedKey('a', '1'), 100], // before the poll: the mail service has the final say
      [openedKey('a', '2'), 300], // during the poll: the result may be stale
    ]);
    const result = hideOpenedSince([acc('a', ['1', '2'])], opened, 200);
    expect(result[0]?.messages.map((m) => m.id)).toEqual(['1']);
    expect(result[0]?.unreadCount).toBe(1);
  });
});
