import { fetchGmailAccounts } from './gmail';
import type { Account } from './types';
import { fetchYandexAccounts } from './yandex';

export type { Account, Message, State } from './types';

/** To add a provider, write an adapter with a fetch…Accounts() function and list it here */
const providers: Array<() => Promise<Account[]>> = [fetchGmailAccounts, fetchYandexAccounts];

export async function fetchAllAccounts(): Promise<Account[]> {
  const results = await Promise.allSettled(providers.map((p) => p()));
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}
