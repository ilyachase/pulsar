import { describe, expect, it } from 'vitest';
import { clampPollSeconds, describeInterval, normalizeSettings } from '../lib/settings';

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

describe('describeInterval', () => {
  it('picks the largest whole unit with the right Russian form', () => {
    expect([30, 45, 61, 60, 120, 300, 1260, 3600, 7200, 18000].map(describeInterval)).toEqual([
      'каждые 30 секунд',
      'каждые 45 секунд',
      'каждую 61 секунду',
      'каждую минуту',
      'каждые 2 минуты',
      'каждые 5 минут',
      'каждую 21 минуту',
      'каждый час',
      'каждые 2 часа',
      'каждые 5 часов',
    ]);
  });
});
