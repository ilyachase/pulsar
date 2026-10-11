import { plural } from './plural';

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

/** 30 → "каждые 30 секунд", 60 → "каждую минуту", 900 → "каждые 15 минут", 3600 → "каждый час" */
export function describeInterval(seconds: number): string {
  const every = (n: number, forms: [string, string, string], single: string) => {
    if (n === 1) return single;
    const word = plural(n, forms);
    return `${plural(n, ['каждую', 'каждые', 'каждые'])} ${n} ${word}`;
  };
  if (seconds % 3600 === 0) {
    const h = seconds / 3600;
    return h === 1
      ? 'каждый час'
      : `${plural(h, ['каждый', 'каждые', 'каждые'])} ${h} ${plural(h, ['час', 'часа', 'часов'])}`;
  }
  if (seconds % 60 === 0)
    return every(seconds / 60, ['минуту', 'минуты', 'минут'], 'каждую минуту');
  return every(seconds, ['секунду', 'секунды', 'секунд'], 'каждую секунду');
}
