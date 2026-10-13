import { describe, expect, it } from 'vitest';
import {
  findNewMessages,
  MAX_SEEN_PER_ACCOUNT,
  notificationId,
  parseNotificationId,
  rememberSeen,
  type SeenMessages,
} from '../lib/notify';
import type { Account, Message } from '../lib/providers/types';

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
const seenOf = (...accounts: Account[]): SeenMessages => rememberSeen(undefined, accounts);
const keys = (found: { account: Account; message: Message }[]) =>
  found.map((n) => `${n.account.id}/${n.message.id}`);

describe('findNewMessages', () => {
  it('reports nothing on the first check', () => {
    expect(findNewMessages(undefined, [acc('a', ['1', '2'])])).toEqual([]);
  });

  it('reports only messages not seen before, per account', () => {
    const seen = seenOf(acc('a', ['1']), acc('b', ['1']));
    const found = findNewMessages(seen, [acc('a', ['1', '2']), acc('b', ['1', '9'])]);
    expect(keys(found)).toEqual(['a/2', 'b/9']);
  });

  it('treats the same message id in another account as new', () => {
    const seen = { ...seenOf(acc('a', ['1'])), b: [] };
    expect(findNewMessages(seen, [acc('b', ['1'])])).toHaveLength(1);
  });

  it('announces nothing for a mailbox seen for the first time', () => {
    expect(findNewMessages(seenOf(acc('a', ['1'])), [acc('b', ['1', '2'])])).toEqual([]);
  });

  it('ignores accounts that are signed out or failed', () => {
    expect(findNewMessages({ a: [] }, [acc('a', ['1'], 'error')])).toEqual([]);
  });

  it('does not announce old mail again after a failed check', () => {
    let seen = seenOf(acc('a', ['1', '2']));
    seen = rememberSeen(seen, [acc('a', [], 'error')]);
    expect(keys(findNewMessages(seen, [acc('a', ['1', '2', '3'])]))).toEqual(['a/3']);
  });

  it('does not announce a message again when it returns to the list', () => {
    let seen = seenOf(acc('a', ['1', '2']));
    seen = rememberSeen(seen, [acc('a', ['2'])]);
    expect(findNewMessages(seen, [acc('a', ['1', '2'])])).toEqual([]);
  });
});

describe('rememberSeen', () => {
  it('keeps the newest ids up to the limit', () => {
    const many = Array.from({ length: MAX_SEEN_PER_ACCOUNT }, (_, i) => `old${i}`);
    const seen = rememberSeen({ a: many }, [acc('a', ['new'])]);
    expect(seen.a).toHaveLength(MAX_SEEN_PER_ACCOUNT);
    expect(seen.a?.[0]).toBe('new');
    expect(seen.a).not.toContain(`old${MAX_SEEN_PER_ACCOUNT - 1}`);
  });
});

describe('notification ids', () => {
  it('round-trips account and message ids', () => {
    const id = notificationId('yandex:1', 'm:2');
    expect(parseNotificationId(id)).toEqual({ accountId: 'yandex:1', messageId: 'm:2' });
    expect(parseNotificationId('summary')).toBeNull();
  });
});
