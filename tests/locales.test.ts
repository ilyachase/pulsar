import { readdirSync } from 'node:fs';
import { generateChromeMessages, parseMessagesFile } from '@wxt-dev/i18n/build';
import { describe, expect, it } from 'vitest';

const CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

/** Plural messages ("unread.rest.one") are grouped under their base key ("unread.rest") */
async function load(file: string) {
  const messages = generateChromeMessages(await parseMessagesFile(`locales/${file}`));
  const plain = new Set<string>();
  const plural = new Map<string, string[]>();
  for (const key of Object.keys(messages)) {
    const parts = key.split('_');
    const last = parts.pop() as string;
    if (CATEGORIES.has(last)) {
      const base = parts.join('_');
      plural.set(base, [...(plural.get(base) ?? []), last].sort());
    } else plain.add(key);
  }
  return { locale: messages.locale?.message ?? '', plain, plural };
}

const files = readdirSync('locales');
const en = await load('en.yml');

describe.each(files)('%s', (file) => {
  it('has every message, and plural forms for exactly its Intl.PluralRules categories', async () => {
    const m = await load(file);
    expect([...m.plain].sort()).toEqual([...en.plain].sort());
    expect([...m.plural.keys()].sort()).toEqual([...en.plural.keys()].sort());
    const categories = [
      ...new Intl.PluralRules(m.locale).resolvedOptions().pluralCategories,
    ].sort();
    for (const forms of m.plural.values()) expect(forms).toEqual(categories);
  });
});
