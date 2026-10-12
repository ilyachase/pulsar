import { type Disconnected, disconnectedProviders, withoutDisconnected } from '../disconnected';
import { workmailUrlItem } from '../settings-store';
import { fetchGmailAccounts } from './gmail';
import { fetchMailruAccounts } from './mailru';
import type { Account, ProviderId } from './types';
import { fetchWorkmailAccounts } from './workmail';
import { fetchYandexAccounts } from './yandex';

export type { Account, Message, State } from './types';

/** To add a provider, write an adapter with a fetch…Accounts() function and list it here */
const providers: Record<ProviderId, () => Promise<Account[]>> = {
  gmail: fetchGmailAccounts,
  yandex: fetchYandexAccounts,
  mailru: fetchMailruAccounts,
  workmail: async () => fetchWorkmailAccounts(await workmailUrlItem.getValue()),
};

/** Disconnected services are not queried; disconnected mailboxes are dropped from the result */
export async function fetchAllAccounts(disconnected: Disconnected[] = []): Promise<Account[]> {
  const skip = disconnectedProviders(disconnected);
  const active = (Object.keys(providers) as ProviderId[]).filter((p) => !skip.has(p));
  const results = await Promise.allSettled(active.map((p) => providers[p]()));
  const accounts = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  return withoutDisconnected(accounts, disconnected);
}
