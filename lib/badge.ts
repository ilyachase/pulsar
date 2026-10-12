import { type Account, isSignInPrompt } from './providers/types';

export interface Badge {
  text: string;
  color: string;
}

export function computeBadge(all: Account[]): Badge {
  // Services the user never signed in to are not "signed-out mailboxes"
  const accounts = all.filter((a) => !isSignInPrompt(a));
  const ok = accounts.filter((a) => a.status === 'ok');
  const errors = accounts.filter((a) => a.status === 'error');
  const unread = ok.reduce((sum, a) => sum + a.unreadCount, 0);

  if (ok.length === 0) {
    return { text: errors.length ? '!' : '?', color: errors.length ? '#d93025' : '#9aa0a6' };
  }
  const text = unread === 0 ? '' : unread > 99 ? '99+' : String(unread);
  return { text, color: errors.length ? '#e37400' : '#d93025' };
}
