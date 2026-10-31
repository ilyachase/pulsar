import type { Account, State } from './providers/types';

export const STATE_KEY = 'state';

/** Removes a message the user just opened and lowers the account's unread count */
export function markRead(state: State, accountId: string, messageId: string): State {
  return {
    ...state,
    accounts: state.accounts.map((a) => {
      if (a.id !== accountId || !a.messages.some((m) => m.id === messageId)) return a;
      return {
        ...a,
        unreadCount: Math.max(0, a.unreadCount - 1),
        messages: a.messages.filter((m) => m.id !== messageId),
      };
    }),
  };
}

/** Messages opened from the popup or a notification: openedKey → time of the click */
export type Opened = Record<string, number>;

/**
 * The Gmail Atom feed shows an opened message as read up to a minute later (several minutes when
 * Gmail was opened in a new tab), so polls in between still return it as unread. Opened messages stay
 * hidden until the feed stops listing them, but no longer than this; after that, the mail service
 * has the final say.
 */
export const OPENED_GRACE_MS = 5 * 60_000;

/**
 * Drops messages opened recently (or while the poll ran) from its result; once the grace period
 * is over, the real state shows again (if the mail service still has it unread, it comes back).
 */
export function hideRecentlyOpened(
  accounts: Account[],
  opened: Opened,
  pollStartedAt: number,
): Account[] {
  let state: State = { accounts, updatedAt: 0 };
  for (const [key, at] of Object.entries(opened)) {
    if (at < pollStartedAt - OPENED_GRACE_MS) continue;
    const [accountId, messageId] = JSON.parse(key) as [string, string];
    state = markRead(state, accountId, messageId);
  }
  return state.accounts;
}

/**
 * The opened messages a poll's result (before hiding) still needs hidden: not the expired ones and
 * not the ones the mail service no longer lists as unread. A click made during the poll is kept,
 * since the result may predate it; so is a mailbox whose check failed and listed nothing.
 */
export function stillOpened(opened: Opened, fetched: Account[], pollStartedAt: number): Opened {
  const next: Opened = {};
  for (const [key, at] of Object.entries(opened)) {
    if (at < pollStartedAt - OPENED_GRACE_MS) continue;
    const [accountId, messageId] = JSON.parse(key) as [string, string];
    const account = fetched.find((a) => a.id === accountId);
    const listed = account?.messages.some((m) => m.id === messageId);
    if (listed || at >= pollStartedAt || account?.status !== 'ok') next[key] = at;
  }
  return next;
}

export const openedKey = (accountId: string, messageId: string): string =>
  JSON.stringify([accountId, messageId]);
