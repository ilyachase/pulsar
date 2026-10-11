import { plural } from './plural';
import type { Account } from './providers/types';

export interface Badge {
  text: string;
  color: string;
  title: string;
}

const inBoxes = (n: number) => `в ${n} ${plural(n, ['ящике', 'ящиках', 'ящиках'])}`;

/**
 * The toolbar tooltip is a one-line summary: Chrome truncates long or multi-line titles,
 * and the per-account details are in the popup anyway.
 */
function summary(accounts: Account[], unread: number): string {
  const ok = accounts.filter((a) => a.status === 'ok').length;
  const errors = accounts.filter((a) => a.status === 'error').length;
  const signedOut = accounts.filter((a) => a.status === 'signed-out').length;

  if (ok === 0) return errors ? 'не удалось проверить почту' : 'не выполнен вход';

  const parts = [
    unread > 0
      ? `${unread} ${plural(unread, ['новое', 'новых', 'новых'])} ${plural(unread, ['письмо', 'письма', 'писем'])}`
      : 'новых писем нет',
  ];
  if (errors) parts.push(`ошибка ${inBoxes(errors)}`);
  if (signedOut) parts.push(`вход не выполнен ${inBoxes(signedOut)}`);
  return parts.join(' · ');
}

export function computeBadge(accounts: Account[]): Badge {
  const ok = accounts.filter((a) => a.status === 'ok');
  const errors = accounts.filter((a) => a.status === 'error');
  const unread = ok.reduce((sum, a) => sum + a.unreadCount, 0);
  const title = `Pulsar — ${summary(accounts, unread)}`;

  if (ok.length === 0) {
    return { text: errors.length ? '!' : '?', color: errors.length ? '#d93025' : '#9aa0a6', title };
  }
  const text = unread === 0 ? '' : unread > 99 ? '99+' : String(unread);
  return { text, color: errors.length ? '#e37400' : '#d93025', title };
}
