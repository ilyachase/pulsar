import { storage } from 'wxt/utils/storage';
import type { Disconnected } from './disconnected';
import { DEFAULT_POLL_SECONDS, DEFAULT_SHOWN_MESSAGES } from './settings';

/**
 * One storage item per setting: each field reads and writes only its own value, so settings
 * never overwrite each other. Every extension page and the background can watch() them.
 */
export const pollSecondsItem = storage.defineItem<number>('local:pollSeconds', {
  fallback: DEFAULT_POLL_SECONDS,
});

export const shownMessagesItem = storage.defineItem<number>('local:shownMessages', {
  fallback: DEFAULT_SHOWN_MESSAGES,
});

export const notifyItem = storage.defineItem<boolean>('local:notify', { fallback: true });

/** Pulsar's own new-mail chime (system notification sound may be off or missing) */
export const soundItem = storage.defineItem<boolean>('local:sound', { fallback: true });

/** The user's WorkMail web client URL (region and organization differ per company); null = not connected */
export const workmailUrlItem = storage.defineItem<string | null>('local:workmailUrl', {
  fallback: null,
});

/** Mailboxes and services Pulsar doesn't check (disconnected from the popup) */
export const disconnectedItem = storage.defineItem<Disconnected[]>('local:disconnected', {
  fallback: [],
});

/** Mailbox ids in the order the popup lists them (set on the settings page) */
export const accountOrderItem = storage.defineItem<string[]>('local:accountOrder', {
  fallback: [],
});
