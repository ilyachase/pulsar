import { describe, expect, it } from 'vitest';
import {
  clampPollSeconds,
  clampShownMessages,
  formatDuration,
  pollError,
  shownMessagesError,
} from '../lib/settings';

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

describe('pollError', () => {
  it('names the failed constraint, or null when acceptable', () => {
    expect(['', 'abc', '45.5', '10', '100000', '30', '86400', ' 900 '].map(pollError)).toEqual([
      'Укажите число секунд',
      'Укажите число секунд',
      'Только целое число секунд',
      'Минимум 30 секунд',
      'Максимум 86 400 секунд',
      null,
      null,
      null,
    ]);
  });
});

describe('shown messages', () => {
  it('accepts whole numbers from 0 to 20 and explains anything else', () => {
    expect(['0', '20', ' 7 ', '', 'x', '2.5', '-1', '21'].map(shownMessagesError)).toEqual([
      null,
      null,
      null,
      'Укажите число писем',
      'Укажите число писем',
      'Только целое число',
      'От 0 до 20',
      'От 0 до 20',
    ]);
  });
  it('clamps a stored value and defaults to 20', () => {
    expect([undefined, null, '5', 50, -3].map(clampShownMessages)).toEqual([20, 20, 5, 20, 0]);
  });
});
