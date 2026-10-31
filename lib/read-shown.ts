import { storage } from 'wxt/utils/storage';
import { canMarkMessagesRead } from './providers/read-capabilities';
import { type Account, MAX_MESSAGES, type Message, type State } from './providers/types';
import { markRead } from './state';

export interface ReadShownJob {
  total: number;
  processed: number;
  failed: number;
  status: 'running' | 'error';
  pendingIds?: string[];
}

export type ReadShownJobs = Record<string, ReadShownJob>;
export const readShownJobsItem = storage.defineItem<ReadShownJobs>('session:readShownJobs', {
  fallback: {},
});

/** Keep the server snapshot intact: pending reads affect only what the user sees. */
export function optimisticReadState(state: State, jobs: ReadShownJobs): State {
  let visible = state;
  for (const [accountId, job] of Object.entries(jobs)) {
    if (job.status !== 'running') continue;
    for (const id of job.pendingIds ?? []) visible = markRead(visible, accountId, id);
  }
  return visible;
}

/** Capture the rendered rows, never the mailbox's full unread count. */
export function shownMessageIds(account: Account, limit: number): string[] {
  return account.messages.slice(0, limit).map((message) => message.id);
}

/** Validate the explicit snapshot from the popup; new mail must never join an existing operation. */
export function requestedShownMessages(account: Account, ids: unknown): Message[] {
  if (!canMarkMessagesRead(account.provider) || account.status !== 'ok') return [];
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_MESSAGES) return [];
  if (!ids.every((id) => typeof id === 'string')) return [];
  const requested = new Set(ids);
  return account.messages.filter((message) => requested.has(message.id));
}

/** Settle the optimistic snapshot sequentially: confirmed reads stay hidden, failures return. */
export async function readShownMessages(
  messages: Message[],
  markRead: (message: Message) => Promise<boolean>,
  confirmed: (message: Message) => Promise<void>,
  progress: (job: ReadShownJob) => Promise<void>,
): Promise<Pick<ReadShownJob, 'total' | 'processed' | 'failed'>> {
  const job: ReadShownJob = {
    total: messages.length,
    processed: 0,
    failed: 0,
    status: 'running',
    pendingIds: messages.map((message) => message.id),
  };
  for (const message of messages) {
    let success = false;
    try {
      success = await markRead(message);
    } catch {
      // One failed message must not prevent the rest of the shown snapshot being processed.
    }
    if (success) await confirmed(message);
    else job.failed++;
    job.processed++;
    job.pendingIds = job.pendingIds?.filter((id) => id !== message.id);
    await progress({ ...job });
  }
  return { total: job.total, processed: job.processed, failed: job.failed };
}

/** A worker interrupted mid-operation leaves a retryable error, never a permanent spinner. */
export function interruptedReadJobs(jobs: ReadShownJobs): ReadShownJobs {
  return Object.fromEntries(
    Object.entries(jobs).map(([id, job]) => [
      id,
      job.status === 'running'
        ? {
            ...job,
            status: 'error',
            failed: job.failed + job.total - job.processed,
            processed: job.total,
            pendingIds: [],
          }
        : job,
    ]),
  );
}
