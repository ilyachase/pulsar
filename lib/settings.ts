/** Chrome doesn't fire alarms more often than every 30 seconds */
export const MIN_POLL_SECONDS = 30;
export const MAX_POLL_SECONDS = 24 * 60 * 60;

export const DEFAULT_POLL_SECONDS = MIN_POLL_SECONDS;

/** Whole seconds within [MIN, MAX]; anything unparsable gives the default */
export function clampPollSeconds(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_POLL_SECONDS;
  return Math.min(MAX_POLL_SECONDS, Math.max(MIN_POLL_SECONDS, n));
}

const duration = new Intl.DurationFormat('ru-RU', { style: 'long' });

/**
 * A human duration for a number of seconds, only when it says more than the seconds themselves:
 * 45 → null, 900 → "15 минут", 7200 → "2 часа", 90 → "1 минута 30 секунд"
 */
export function formatDuration(seconds: number): string | null {
  if (seconds < 60) return null;
  return duration.format({
    hours: Math.floor(seconds / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  });
}

/**
 * The error text for a typed interval, or null when it's acceptable. Only the wording lives here:
 * when to show it is decided by the input component (:state(user-invalid)).
 */
export function pollError(raw: string): string | null {
  const text = raw.trim();
  const n = Number(text);
  if (text === '' || !Number.isFinite(n)) return 'Укажите число секунд';
  if (!Number.isInteger(n)) return 'Только целое число секунд';
  if (n < MIN_POLL_SECONDS) return 'Минимум 30 секунд';
  if (n > MAX_POLL_SECONDS) return 'Максимум 86 400 секунд';
  return null;
}
