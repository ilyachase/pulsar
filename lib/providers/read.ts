import { markGmailMessageRead } from './gmail-read';
import { markMailruMessageRead } from './mailru';
import { markProtonMessageRead } from './proton';
import type { Account, Message } from './types';
import { markWorkmailMessageRead } from './workmail';
import { markYandexMessageRead } from './yandex';

export function markProviderMessageRead(account: Account, message: Message): Promise<boolean> {
  if (account.provider === 'gmail') return markGmailMessageRead(message.url, account.id);
  if (account.provider === 'yandex') return markYandexMessageRead(account, message);
  if (account.provider === 'workmail') return markWorkmailMessageRead(account, message);
  if (account.provider === 'mailru') return markMailruMessageRead(account, message);
  if (account.provider === 'proton') return markProtonMessageRead(account, message);
  return Promise.resolve(false);
}
