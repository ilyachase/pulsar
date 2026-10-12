import type { Account } from './providers/types';

/**
 * Cards without a real mailbox behind them (a service that failed or isn't signed in as a whole)
 * have no stable id to order by; they keep their place after the ordered mailboxes.
 */
export const isOrderable = (a: Account): boolean =>
  a.id !== `${a.provider}:signed-out` && a.id !== `${a.provider}:error`;

/**
 * The user's order: listed mailboxes first, in that order; the rest (new mailboxes, whole-service
 * cards) after them in their usual provider order.
 */
export function sortAccounts(accounts: Account[], order: string[]): Account[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  const ranked = accounts.filter((a) => rank.has(a.id));
  const rest = accounts.filter((a) => !rank.has(a.id));
  ranked.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...ranked, ...rest];
}

/**
 * The order to store after the user rearranged the mailboxes they see. Ids that aren't shown
 * right now (e.g. a mailbox that is signed out today) keep their saved order after these.
 */
export function mergeOrder(shown: string[], saved: string[]): string[] {
  const visible = new Set(shown);
  return [...shown, ...saved.filter((id) => !visible.has(id))];
}

/** Moves the item at `from` to `to` (both indexes in the original array) */
export function move<T>(items: T[], from: number, to: number): T[] {
  const result = [...items];
  const [item] = result.splice(from, 1);
  if (item !== undefined) result.splice(to, 0, item);
  return result;
}
