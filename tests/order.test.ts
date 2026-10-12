import { describe, expect, it } from 'vitest';
import { isOrderable, mergeOrder, move, sortAccounts } from '../lib/order';
import { type Account, failed, signedOut } from '../lib/providers/types';

const acc = (id: string): Account => ({
  id,
  provider: 'gmail',
  email: id,
  status: 'ok',
  unreadCount: 0,
  inboxUrl: '',
  messages: [],
});
const ids = (accounts: Account[]) => accounts.map((a) => a.id);

describe('sortAccounts', () => {
  const [a, b, c] = [acc('gmail:a'), acc('gmail:b'), acc('gmail:c')];

  it('follows the saved order', () => {
    expect(ids(sortAccounts([a, b, c], ['gmail:c', 'gmail:a', 'gmail:b']))).toEqual([
      'gmail:c',
      'gmail:a',
      'gmail:b',
    ]);
  });
  it('puts mailboxes missing from the order after the ordered ones, in their usual order', () => {
    expect(ids(sortAccounts([a, b, c], ['gmail:b']))).toEqual(['gmail:b', 'gmail:a', 'gmail:c']);
  });
  it('ignores saved ids that are not shown and keeps everything with no order', () => {
    expect(ids(sortAccounts([a, b], ['gmail:x', 'gmail:b']))).toEqual(['gmail:b', 'gmail:a']);
    expect(ids(sortAccounts([a, b], []))).toEqual(['gmail:a', 'gmail:b']);
  });
});

describe('isOrderable', () => {
  it('is false for whole-service cards that have no mailbox', () => {
    expect(isOrderable(acc('gmail:a'))).toBe(true);
    expect(isOrderable(signedOut('mailru', 'Почта Mail', '#'))).toBe(false);
    expect(isOrderable(failed('yandex', 'Яндекс Почта', '#', 'x'))).toBe(false);
  });
});

describe('mergeOrder', () => {
  it('keeps the saved place of mailboxes that are not shown now', () => {
    expect(mergeOrder(['b', 'a'], ['a', 'x', 'b'])).toEqual(['b', 'a', 'x']);
  });
});

describe('move', () => {
  it('moves an item up and down without touching the input', () => {
    const list = ['a', 'b', 'c'];
    expect(move(list, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(move(list, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(list).toEqual(['a', 'b', 'c']);
  });
});
