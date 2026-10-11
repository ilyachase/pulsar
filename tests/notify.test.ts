import { describe, expect, it } from 'vitest';
import { findNewMessages, notificationId, parseNotificationId } from '../lib/notify';
import type { Account, Message, State } from '../lib/providers/types';

const msg = (id: string): Message => ({
  id,
  from: 'A',
  fromEmail: 'a@example.com',
  subject: `s${id}`,
  snippet: '',
  date: 1,
  url: '#',
});
const acc = (id: string, ids: string[], status: Account['status'] = 'ok'): Account => ({
  id,
  provider: 'gmail',
  email: `${id}@example.com`,
  status,
  unreadCount: ids.length,
  inboxUrl: '',
  messages: ids.map(msg),
});
const state = (...accounts: Account[]): State => ({ accounts, updatedAt: 0 });

describe('findNewMessages', () => {
  it('reports nothing on the first check', () => {
    expect(findNewMessages(undefined, [acc('a', ['1', '2'])])).toEqual([]);
  });

  it('reports only messages that were not there before, per account', () => {
    const prev = state(acc('a', ['1']), acc('b', ['1']));
    const found = findNewMessages(prev, [acc('a', ['1', '2']), acc('b', ['1', '9'])]);
    expect(found.map((n) => `${n.account.id}/${n.message.id}`)).toEqual(['a/2', 'b/9']);
  });

  it('treats the same message id in another account as new', () => {
    expect(findNewMessages(state(acc('a', ['1'])), [acc('b', ['1'])])).toHaveLength(1);
  });

  it('ignores accounts that are signed out or failed', () => {
    expect(findNewMessages(state(), [acc('a', ['1'], 'error')])).toEqual([]);
  });
});

describe('notification ids', () => {
  it('round-trips account and message ids', () => {
    const id = notificationId('yandex:1', 'm:2');
    expect(parseNotificationId(id)).toEqual({ accountId: 'yandex:1', messageId: 'm:2' });
    expect(parseNotificationId('summary')).toBeNull();
  });
});
