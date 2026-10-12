import { storage } from 'wxt/utils/storage';
import type { Disconnected } from './disconnected';
import { DEFAULT_POLL_SECONDS } from './settings';

/**
 * One storage item per setting: each field reads and writes only its own value, so settings
 * never overwrite each other. Every extension page and the background can watch() them.
 */
export const pollSecondsItem = storage.defineItem<number>('local:pollSeconds', {
  fallback: DEFAULT_POLL_SECONDS,
});

export const notifyItem = storage.defineItem<boolean>('local:notify', { fallback: true });

/** The user's WorkMail web client URL (region and organization differ per company); null = not connected */
export const workmailUrlItem = storage.defineItem<string | null>('local:workmailUrl', {
  fallback: null,
});

/** Mailboxes and services Pulsar doesn't check (disconnected from the popup) */
export const disconnectedItem = storage.defineItem<Disconnected[]>('local:disconnected', {
  fallback: [],
});
