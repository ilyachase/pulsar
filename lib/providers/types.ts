export type ProviderId = 'gmail' | 'yandex' | 'mailru' | 'workmail';

export interface Message {
  id: string;
  from: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  /** Unix time, ms */
  date: number;
  url: string;
}

export interface Account {
  id: string;
  provider: ProviderId;
  email: string;
  status: 'ok' | 'signed-out' | 'error';
  unreadCount: number;
  inboxUrl: string;
  messages: Message[];
  error?: string;
}

export interface State {
  accounts: Account[];
  updatedAt: number;
}

/** Max messages per account (the Gmail Atom feed limit) */
export const MAX_MESSAGES = 20;

export function signedOut(provider: ProviderId, name: string, loginUrl: string): Account {
  return {
    id: `${provider}:signed-out`,
    provider,
    email: name,
    status: 'signed-out',
    unreadCount: 0,
    inboxUrl: loginUrl,
    messages: [],
  };
}

export function failed(
  provider: ProviderId,
  name: string,
  inboxUrl: string,
  err: unknown,
): Account {
  return {
    id: `${provider}:error`,
    provider,
    email: name,
    status: 'error',
    unreadCount: 0,
    inboxUrl,
    messages: [],
    error: err instanceof Error ? err.message : String(err),
  };
}
