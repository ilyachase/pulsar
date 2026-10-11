export const SETTINGS_KEY = 'settings';

/** Chrome doesn't fire alarms more often than every 30 seconds */
export const MIN_POLL_SECONDS = 30;
export const MAX_POLL_SECONDS = 24 * 60 * 60;

export interface Settings {
  /** How often the background checks mail, in seconds */
  pollSeconds: number;
}

export const DEFAULT_SETTINGS: Settings = { pollSeconds: MIN_POLL_SECONDS };

/** Whole seconds within [MIN, MAX]; anything unparsable gives the default */
export function clampPollSeconds(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SETTINGS.pollSeconds;
  return Math.min(MAX_POLL_SECONDS, Math.max(MIN_POLL_SECONDS, n));
}

export function normalizeSettings(raw: unknown): Settings {
  const s = (raw ?? {}) as Partial<Settings>;
  return { pollSeconds: clampPollSeconds(s.pollSeconds) };
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
