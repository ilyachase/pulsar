import type { Account, Message } from './providers/types';

export interface NewMessage {
  account: Account;
  message: Message;
}

/** Above this many new messages in one check we show a single summary instead of one each */
export const MAX_SEPARATE_NOTIFICATIONS = 3;

/** Message ids Pulsar has already shown, per account id (newest first) */
export type SeenMessages = Record<string, string[]>;

/** Enough to cover the 20 listed messages plus ones that drop out of the list and come back */
export const MAX_SEEN_PER_ACCOUNT = 200;

/**
 * Messages Pulsar has never shown before. Checked against all ids seen so far, not just the last
 * check, so a message isn't announced again after a failed check, a restart, or when it returns
 * to the list. A mailbox seen for the first time (or the first check after install) announces
 * nothing, so old unread mail doesn't produce a burst of notifications.
 */
export function findNewMessages(seen: SeenMessages | undefined, accounts: Account[]): NewMessage[] {
  if (!seen) return [];
  return accounts.flatMap((account) => {
    const known = seen[account.id];
    if (account.status !== 'ok' || !known) return [];
    const ids = new Set(known);
    return account.messages.filter((m) => !ids.has(m.id)).map((message) => ({ account, message }));
  });
}

/** Adds the messages of checked mailboxes to `seen`; failed or signed-out ones keep what they had */
export function rememberSeen(seen: SeenMessages | undefined, accounts: Account[]): SeenMessages {
  const next: SeenMessages = { ...seen };
  for (const account of accounts) {
    if (account.status !== 'ok') continue;
    const current = account.messages.map((m) => m.id);
    const older = (next[account.id] ?? []).filter((id) => !current.includes(id));
    next[account.id] = [...current, ...older].slice(0, MAX_SEEN_PER_ACCOUNT);
  }
  return next;
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
