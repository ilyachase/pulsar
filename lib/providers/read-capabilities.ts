import type { ProviderId } from './types';

/** Keep capability checks lightweight for the popup; network adapters belong in the worker. */
export function canMarkMessagesRead(provider: ProviderId): boolean {
  return (
    provider === 'gmail' ||
    provider === 'yandex' ||
    provider === 'workmail' ||
    provider === 'mailru' ||
    provider === 'proton'
  );
}
