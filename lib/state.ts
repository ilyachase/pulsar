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

/**
 * A poll that started before the click may still return the message as unread.
 * Messages opened after `pollStartedAt` are dropped from such a result; a later poll shows the
 * real state again (if the mail service still has it unread, it comes back — that's fine).
 */
export function hideOpenedSince(
  accounts: Account[],
  opened: Map<string, number>,
  pollStartedAt: number,
): Account[] {
  let state: State = { accounts, updatedAt: 0 };
  for (const [key, at] of opened) {
    if (at < pollStartedAt) continue;
    const [accountId, messageId] = JSON.parse(key) as [string, string];
    state = markRead(state, accountId, messageId);
  }
  return state.accounts;
}

export const openedKey = (accountId: string, messageId: string): string =>
  JSON.stringify([accountId, messageId]);
