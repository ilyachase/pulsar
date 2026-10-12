import { describe, expect, it } from 'vitest';
import { computeBadge } from '../lib/badge';
import { type Account, signedOut } from '../lib/providers/types';

const acc = (status: Account['status'], unreadCount = 0): Account => ({
  id: `x:${status}:${unreadCount}`,
  provider: 'gmail',
  email: 'x@gmail.com',
  status,
  unreadCount,
  inboxUrl: '',
  messages: [],
});

describe('computeBadge', () => {
  it('sums unread across ok accounts', () => {
    expect(computeBadge([acc('ok', 3), acc('ok', 2), acc('signed-out')]).text).toBe('5');
  });
  it('is empty when nothing is unread', () => {
    expect(computeBadge([acc('ok', 0)]).text).toBe('');
  });
  it('caps at 99+', () => {
    expect(computeBadge([acc('ok', 150)]).text).toBe('99+');
  });
  it('shows ? when signed out everywhere and ! on errors only', () => {
    expect(computeBadge([acc('signed-out')]).text).toBe('?');
    expect(computeBadge([acc('error')]).text).toBe('!');
  });
});

describe('services never signed in to', () => {
  const prompt = signedOut('mailru', 'Почта Mail', '#');
  it('are not counted as signed-out mailboxes', () => {
    expect(computeBadge([acc('ok', 2), prompt]).text).toBe('2');
  });
  it('alone mean nothing is signed in', () => {
    expect(computeBadge([prompt]).text).toBe('?');
  });
});
