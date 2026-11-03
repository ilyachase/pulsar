import { describe, expect, it, vi } from 'vitest';
import type { Account, Message, State } from '../lib/providers/types';
import {
  interruptedReadJobs,
  optimisticReadState,
  readShownMessages,
  requestedShownMessages,
  shownMessageIds,
} from '../lib/read-shown';
import { markRead } from '../lib/state';

const message = (id: string): Message => ({
  id,
  from: '',
  fromEmail: '',
  subject: '',
  snippet: '',
  date: 0,
  url: id,
});
const account: Account = {
  id: 'gmail:test@gmail.com',
  provider: 'gmail',
  email: 'test@gmail.com',
  status: 'ok',
  unreadCount: 500,
  inboxUrl: '',
  messages: [message('a'), message('b'), message('c')],
};

describe('shown snapshot', () => {
  it('uses the display limit rather than the total unread count', () => {
    expect(shownMessageIds(account, 2)).toEqual(['a', 'b']);
  });
  it('does not enroll new arrivals or duplicate IDs into the requested operation', () => {
    const current = { ...account, messages: [message('new'), ...account.messages] };
    expect(requestedShownMessages(current, ['a', 'b', 'a']).map((m) => m.id)).toEqual(['a', 'b']);
  });
  it.each([null, [], ['a', 3], Array.from({ length: 21 }, () => 'a')])(
    'rejects invalid/unbounded input: %j',
    (ids) => {
      expect(requestedShownMessages(account, ids)).toEqual([]);
    },
  );
  it('rejects failed accounts and IDs outside the account', () => {
    expect(requestedShownMessages({ ...account, status: 'error' }, ['a'])).toEqual([]);
    expect(requestedShownMessages(account, ['other-account'])).toEqual([]);
  });
  it.each(['gmail', 'yandex', 'workmail', 'mailru', 'proton'] as const)(
    'accepts only the requested shown IDs for %s',
    (provider) => {
      expect(requestedShownMessages({ ...account, provider }, ['a']).map((m) => m.id)).toEqual([
        'a',
      ]);
    },
  );
});

describe('readShownMessages', () => {
  it('commits only confirmed reads; failures release their optimistic hiding and processing continues', async () => {
    const confirmed = vi.fn(async () => {});
    const progress = vi.fn(async () => {});
    const mark = vi.fn(async (m: Message) => {
      if (m.id === 'b') throw Error('network');
      return m.id === 'a';
    });
    const result = await readShownMessages(account.messages, mark, confirmed, progress);
    expect(result).toEqual({ total: 3, processed: 3, failed: 2 });
    expect(confirmed.mock.calls).toHaveLength(1);
    expect(confirmed).toHaveBeenCalledWith(account.messages[0]);
    expect(mark.mock.calls.map(([m]) => m.id)).toEqual(['a', 'b', 'c']);
    expect(progress).toHaveBeenLastCalledWith({
      total: 3,
      processed: 3,
      failed: 2,
      status: 'running',
      pendingIds: [],
    });
  });
  it('waits for each confirmation before beginning the next message', async () => {
    const events: string[] = [];
    await readShownMessages(
      account.messages.slice(0, 2),
      async (m) => {
        events.push(`request:${m.id}`);
        return true;
      },
      async (m) => {
        events.push(`confirmed:${m.id}`);
      },
      async () => {},
    );
    expect(events).toEqual(['request:a', 'confirmed:a', 'request:b', 'confirmed:b']);
  });
});

it('turns an interrupted operation into a retryable error without affecting other mailboxes', () => {
  expect(
    interruptedReadJobs({
      a: { total: 5, processed: 2, failed: 1, status: 'running' },
      b: { total: 1, processed: 1, failed: 1, status: 'error' },
    }),
  ).toEqual({
    a: { total: 5, processed: 5, failed: 4, status: 'error', pendingIds: [] },
    b: { total: 1, processed: 1, failed: 1, status: 'error' },
  });
});

describe('optimisticReadState', () => {
  const state: State = { accounts: [account], updatedAt: 0 };
  const job = {
    total: 2,
    processed: 0,
    failed: 0,
    status: 'running' as const,
    pendingIds: ['a', 'b'],
  };

  it('immediately removes the snapshot and reduces the count without changing the server cache', () => {
    const visible = optimisticReadState(state, { [account.id]: job });
    expect(visible.accounts[0]?.unreadCount).toBe(498);
    expect(visible.accounts[0]?.messages.map((m) => m.id)).toEqual(['c']);
    expect(state.accounts[0]?.unreadCount).toBe(500);
    expect(state.accounts[0]?.messages).toHaveLength(3);
  });

  it('continues hiding pending reads across a refresh and a reopened popup, preserving new mail', () => {
    const refreshed = {
      ...state,
      accounts: [{ ...account, unreadCount: 501, messages: [message('new'), ...account.messages] }],
    };
    const visible = optimisticReadState(refreshed, { [account.id]: job });
    expect(visible.accounts[0]?.unreadCount).toBe(499);
    expect(visible.accounts[0]?.messages.map((m) => m.id)).toEqual(['new', 'c']);
  });

  it('restores only failed reads while keeping confirmed messages removed, with no double decrement', () => {
    const confirmed = markRead(state, account.id, 'a');
    const pending = optimisticReadState(confirmed, { [account.id]: job });
    expect(pending.accounts[0]?.unreadCount).toBe(498);
    const restored = optimisticReadState(confirmed, {
      [account.id]: { ...job, status: 'error', pendingIds: [], failed: 1, processed: 2 },
    });
    expect(restored.accounts[0]?.unreadCount).toBe(499);
    expect(restored.accounts[0]?.messages.map((m) => m.id)).toEqual(['b', 'c']);
  });

  it('restores pending reads after the worker was interrupted', () => {
    const recovered = interruptedReadJobs({ [account.id]: job });
    expect(optimisticReadState(state, recovered)).toEqual(state);
  });
});
