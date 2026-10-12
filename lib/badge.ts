import { i18n, plural, unreadText } from './i18n';
import { type Account, isSignInPrompt } from './providers/types';

export interface Badge {
  text: string;
  color: string;
  title: string;
}

/**
 * The toolbar tooltip is a one-line summary: Chrome truncates long or multi-line titles,
 * and the per-account details are in the popup anyway.
 */
function summary(accounts: Account[], unread: number): string {
  const ok = accounts.filter((a) => a.status === 'ok').length;
  const errors = accounts.filter((a) => a.status === 'error').length;
  const signedOut = accounts.filter((a) => a.status === 'signed-out').length;

  if (ok === 0) return errors ? i18n.t('badge.allFailed') : i18n.t('badge.allSignedOut');

  const parts = [unread > 0 ? unreadText(unread) : i18n.t('badge.noNew')];
  if (errors) parts.push(plural('badge.failedIn', errors));
  if (signedOut) parts.push(plural('badge.signedOutIn', signedOut));
  return parts.join(' · ');
}

export function computeBadge(all: Account[]): Badge {
  // Services the user never signed in to are not "signed-out mailboxes"
  const accounts = all.filter((a) => !isSignInPrompt(a));
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
