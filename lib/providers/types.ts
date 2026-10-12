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

/**
 * The provider's own "not signed in" card (no mailbox known). The popup doesn't list these: with many
 * providers they would crowd out the real mailboxes. They only feed the empty state's sign-in links.
 */
export const isSignInPrompt = (a: Account): boolean =>
  a.status === 'signed-out' && a.id === `${a.provider}:signed-out`;

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
