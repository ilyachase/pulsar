/**
 * Plural forms via the built-in Intl.PluralRules (Unicode CLDR rules), no hand-written math.
 * Russian categories: one (1, 21, 101…), few (2–4, 22–24…), many (0, 5–20, 25…), other (fractions).
 */
const rules = new Intl.PluralRules('ru-RU');

/** plural(5, ['письмо', 'письма', 'писем']) → 'писем' */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  switch (rules.select(n)) {
    case 'one':
      return one;
    case 'few':
      return few;
    case 'many':
      return many;
    default:
      // "other" in Russian is fractions: 1,5 письма
      return few;
  }
}
