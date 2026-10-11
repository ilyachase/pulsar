import { i18n } from '#i18n';

export { i18n };

/**
 * The language of the messages Chrome picked (its UI language, or English as the fallback).
 * Intl formatting and plural rules follow it, so numbers, dates and words always agree.
 */
export const locale = i18n.t('locale');

const rules = new Intl.PluralRules(locale);

/**
 * A plural message: its forms are keyed by Intl.PluralRules (Unicode CLDR) categories,
 * e.g. ru unread.rest.{one,few,many,other}, en unread.rest.{one,other}. $1 is the count.
 */
export function plural(key: string, n: number): string {
  const t = i18n.t as (key: string, substitutions?: string[]) => string;
  return t(`${key}.${rules.select(n)}`, [new Intl.NumberFormat(locale).format(n)]);
}

/** "5 новых" + " писем": the popup sets the count apart */
export const unreadParts = (n: number): [string, string] => [
  plural('unread.count', n),
  plural('unread.rest', n),
];

/** "5 новых писем" */
export const unreadText = (n: number): string => unreadParts(n).join('');

/**
 * Static page text: data-i18n sets the text, data-i18n-{title,label,placeholder} the attribute.
 * Also sets <html lang> (Web Awesome localizes its components by it).
 */
export function localizePage(root: ParentNode = document): void {
  document.documentElement.lang = locale;
  const t = i18n.t as (key: string) => string;
  for (const node of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n as string);
  }
  for (const attr of ['title', 'label', 'placeholder']) {
    for (const node of root.querySelectorAll<HTMLElement>(`[data-i18n-${attr}]`)) {
      node.setAttribute(attr, t(node.getAttribute(`data-i18n-${attr}`) as string));
    }
  }
}
