import type { Account, ProviderId } from './providers/types';

/**
 * A mailbox (or a whole mail service) the user told Pulsar to stop checking.
 * Nothing is signed out: the mail stays signed in in the browser, Pulsar just leaves it alone.
 */
export interface Disconnected {
  /** An account id ("gmail:me@gmail.com"), or a provider id ("mailru") for the whole service */
  key: string;
  provider: ProviderId;
  /** What the settings page lists: the address, or the service name */
  label: string;
}

/**
 * A card with no known mailbox (the service as a whole is signed out or failed) stands for the
 * service: disconnecting it stops checking that provider at all.
 */
export function disconnectKey(a: Account): string {
  return a.id === `${a.provider}:signed-out` || a.id === `${a.provider}:error` ? a.provider : a.id;
}

export function toDisconnected(a: Account): Disconnected {
  return { key: disconnectKey(a), provider: a.provider, label: a.email };
}

/** Providers not to query at all */
export function disconnectedProviders(list: Disconnected[]): Set<ProviderId> {
  return new Set(list.filter((d) => d.key === d.provider).map((d) => d.provider));
}

export function withoutDisconnected(accounts: Account[], list: Disconnected[]): Account[] {
  const keys = new Set(list.map((d) => d.key));
  return accounts.filter((a) => !keys.has(a.id) && !keys.has(a.provider));
}

/** Adds one entry (once) */
export function addDisconnected(list: Disconnected[], entry: Disconnected): Disconnected[] {
  return list.some((d) => d.key === entry.key) ? list : [...list, entry];
}

export function removeDisconnected(list: Disconnected[], key: string): Disconnected[] {
  return list.filter((d) => d.key !== key);
}
