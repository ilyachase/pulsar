import { describe, expect, it } from 'vitest';
import { clampPollSeconds, formatDuration, normalizeSettings } from '../lib/settings';

describe('normalizeSettings', () => {
  it('keeps any whole number of seconds in range', () => {
    expect(normalizeSettings({ pollSeconds: 45 })).toEqual({ pollSeconds: 45 });
    expect(normalizeSettings({ pollSeconds: 900 })).toEqual({ pollSeconds: 900 });
  });
  it('defaults to 30 seconds when missing or unparsable', () => {
    expect(normalizeSettings(undefined)).toEqual({ pollSeconds: 30 });
    expect(normalizeSettings({ pollSeconds: 'x' })).toEqual({ pollSeconds: 30 });
  });
});

describe('clampPollSeconds', () => {
  it('snaps into [30 s, 1 day] and rounds', () => {
    expect(clampPollSeconds('10')).toBe(30);
    expect(clampPollSeconds(100000)).toBe(86400);
    expect(clampPollSeconds('44.6')).toBe(45);
  });
});

describe('formatDuration', () => {
  it('is silent when the seconds speak for themselves, converts otherwise', () => {
    expect([30, 59, 60, 90, 900, 7200, 3600].map(formatDuration)).toEqual([
      null,
      null,
      '1 минута',
      '1 минута 30 секунд',
      '15 минут',
      '2 часа',
      '1 час',
    ]);
  });
});
