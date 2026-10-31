import { describe, expect, it } from 'vitest';
import { gmailAccountPrefix, pickTab } from '../lib/open-message';

describe('gmailAccountPrefix', () => {
  it('returns the account part of a Gmail link', () => {
    expect(gmailAccountPrefix('https://mail.google.com/mail/u/1/#inbox/19a1b2c3d4e5f607')).toBe(
      'https://mail.google.com/mail/u/1/',
    );
  });

  it('is null for other mail services', () => {
    expect(gmailAccountPrefix('https://mail.yandex.ru/?uid=1#message/1')).toBeNull();
  });
});

describe('pickTab', () => {
  it('prefers a tab in the window the user was last in', () => {
    expect(pickTab([{ windowId: 1 }, { windowId: 2 }], 2)).toEqual({ windowId: 2 });
    expect(pickTab([{ windowId: 1 }], 2)).toEqual({ windowId: 1 });
    expect(pickTab([], 2)).toBeUndefined();
  });
});
