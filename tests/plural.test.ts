import { describe, expect, it } from 'vitest';
import { plural } from '../lib/plural';

const letters = (n: number) => `${n} ${plural(n, ['письмо', 'письма', 'писем'])}`;

describe('plural (Intl.PluralRules, ru)', () => {
  it('picks the CLDR form', () => {
    expect([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(letters)).toEqual([
      '0 писем',
      '1 письмо',
      '2 письма',
      '4 письма',
      '5 писем',
      '11 писем',
      '12 писем',
      '14 писем',
      '21 письмо',
      '22 письма',
      '25 писем',
      '101 письмо',
      '111 писем',
    ]);
  });
  it('uses the "few" form for fractions', () => {
    expect(letters(1.5)).toBe('1.5 письма');
  });
});
