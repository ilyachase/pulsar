import { describe, expect, it } from 'vitest';
import { unreadText } from '../lib/i18n';

// Tests run with the Russian messages (tests/setup.ts)
describe('plural (Intl.PluralRules categories)', () => {
  it('picks the CLDR form', () => {
    expect([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(unreadText)).toEqual([
      '0 новых писем',
      '1 новое письмо',
      '2 новых письма',
      '4 новых письма',
      '5 новых писем',
      '11 новых писем',
      '12 новых писем',
      '14 новых писем',
      '21 новое письмо',
      '22 новых письма',
      '25 новых писем',
      '101 новое письмо',
      '111 новых писем',
    ]);
  });
  it('uses the "other" form for fractions and formats the number for the locale', () => {
    expect(unreadText(1.5)).toBe('1,5 новых письма');
  });
});
