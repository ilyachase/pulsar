import { describe, expect, it } from 'vitest';
import type { Account, Message, State } from '../lib/providers/types';
import {
  hideRecentlyOpened,
  markRead,
  OPENED_GRACE_MS,
  openedKey,
  stillOpened,
} from '../lib/state';

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

describe('hideRecentlyOpened', () => {
  it('hides messages opened shortly before or during the poll', () => {
    const start = 100_000;
    const opened = {
      [openedKey('a', '1')]: start - OPENED_GRACE_MS - 1, // long ago: the mail service has the final say
      [openedKey('a', '2')]: start - 60_000, // a minute ago: the feed may not show it read yet
      [openedKey('a', '3')]: start + 500, // during the poll: the result may be stale
    };
    const result = hideRecentlyOpened([acc('a', ['1', '2', '3'])], opened, start);
    expect(result[0]?.messages.map((m) => m.id)).toEqual(['1']);
    expect(result[0]?.unreadCount).toBe(1);
  });
});

describe('stillOpened', () => {
  const start = 1_000_000;

  it('keeps messages the mail service still lists as unread', () => {
    const opened = { [openedKey('a', '1')]: start - 60_000 };
    expect(stillOpened(opened, [acc('a', ['1', '2'])], start)).toEqual(opened);
  });

  it('drops messages the mail service shows read and expired ones', () => {
    const opened = {
      [openedKey('a', '1')]: start - 60_000, // no longer listed: Gmail caught up
      [openedKey('a', '2')]: start - OPENED_GRACE_MS - 1, // still listed, but too long ago
    };
    expect(stillOpened(opened, [acc('a', ['2'])], start)).toEqual({});
  });

  it('keeps clicks made during the poll and mailboxes whose check failed', () => {
    const opened = {
      [openedKey('a', '1')]: start + 500,
      [openedKey('b', '1')]: start - 60_000,
    };
    const failed: Account = { ...acc('b', []), status: 'error' };
    expect(stillOpened(opened, [acc('a', []), failed], start)).toEqual(opened);
  });
});
