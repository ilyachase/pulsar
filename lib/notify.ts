import type { Account, Message, State } from './providers/types';

export interface NewMessage {
  account: Account;
  message: Message;
}

/** Above this many new messages in one check we show a single summary instead of one each */
export const MAX_SEPARATE_NOTIFICATIONS = 3;

/**
 * Messages that weren't in the previous state. Without a previous state (first check after the
 * browser started or the extension was installed) nothing counts as new, so old unread mail
 * doesn't produce a burst of notifications.
 */
export function findNewMessages(prev: State | undefined, accounts: Account[]): NewMessage[] {
  if (!prev) return [];
  const known = new Set(
    prev.accounts.flatMap((a) => a.messages.map((m) => `${a.id}\u0000${m.id}`)),
  );
  return accounts.flatMap((account) =>
    account.status !== 'ok'
      ? []
      : account.messages
          .filter((m) => !known.has(`${account.id}\u0000${m.id}`))
          .map((message) => ({ account, message })),
  );
}

export const notificationId = (accountId: string, messageId: string): string =>
  `msg:${JSON.stringify([accountId, messageId])}`;

export function parseNotificationId(id: string): { accountId: string; messageId: string } | null {
  if (!id.startsWith('msg:')) return null;
  try {
    const [accountId, messageId] = JSON.parse(id.slice(4)) as [string, string];
    return { accountId, messageId };
  } catch {
    return null;
  }
}
