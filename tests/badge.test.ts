import { describe, expect, it } from 'vitest';
import { computeBadge } from '../lib/badge';
import type { Account } from '../lib/providers/types';

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

describe('badge tooltip', () => {
  const title = (accounts: Account[]) => computeBadge(accounts).title;

  it('is a one-line summary, never a per-account list', () => {
    expect(title([acc('ok', 3), acc('ok', 2)])).toBe('Pulsar — 5 новых писем');
    expect(title([acc('ok', 1)])).toBe('Pulsar — 1 новое письмо');
    expect(title([acc('ok', 2)])).toBe('Pulsar — 2 новых письма');
    expect(title([acc('ok', 0)])).toBe('Pulsar — новых писем нет');
    expect(title([acc('ok', 3)])).not.toContain('\n');
  });
  it('mentions problem accounts briefly', () => {
    expect(title([acc('ok', 3), acc('error'), acc('signed-out')])).toBe(
      'Pulsar — 3 новых письма · ошибка в 1 ящике · вход не выполнен в 1 ящике',
    );
    expect(title([acc('signed-out')])).toBe('Pulsar — не выполнен вход');
    expect(title([acc('error')])).toBe('Pulsar — не удалось проверить почту');
  });
});
