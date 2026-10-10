import type { Account } from './providers/types';

export interface Badge {
  text: string;
  color: string;
  title: string;
}

export function computeBadge(accounts: Account[]): Badge {
  const ok = accounts.filter((a) => a.status === 'ok');
  const errors = accounts.filter((a) => a.status === 'error');
  const unread = ok.reduce((sum, a) => sum + a.unreadCount, 0);

  const lines = accounts.map((a) =>
    a.status === 'ok'
      ? `${a.email}: ${a.unreadCount}`
      : `${a.email}: ${a.status === 'error' ? 'ошибка' : 'не выполнен вход'}`,
  );
  const title = ['Pulsar', ...lines].join('\n');

  if (ok.length === 0) {
    return { text: errors.length ? '!' : '?', color: errors.length ? '#d93025' : '#9aa0a6', title };
  }
  const text = unread === 0 ? '' : unread > 99 ? '99+' : String(unread);
  return { text, color: errors.length ? '#e37400' : '#d93025', title };
}
