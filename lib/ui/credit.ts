import { i18n, locale } from '@/lib/i18n';

const AUTHOR = 'Ilya L.';
const AUTHOR_URL = 'https://github.com/ilyachase';

/** Russian speakers donate via Boosty, everyone else via Buy Me a Coffee (as in PAC Proxy Manager) */
const SUPPORT = locale.startsWith('ru')
  ? { icon: 'boosty', url: 'https://boosty.to/ilyachase' }
  : { icon: 'bmc', url: 'https://buymeacoffee.com/ilyachase' };

function link(href: string, ...content: (Node | string)[]): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.append(...content);
  return a;
}

/**
 * Two lines: "Made with ❤️ by <author>" and "<icon> Support the author". The name goes into the
 * message via $1 (word order differs by language) and becomes a link to the author's GitHub.
 */
export function renderCredit(target: HTMLElement): void {
  const [before = '', after = ''] = (i18n.t as (key: string, s: string[]) => string)(
    'credit.madeBy',
    [AUTHOR],
  ).split(AUTHOR);
  const madeBy = document.createElement('span');
  madeBy.append(before, link(AUTHOR_URL, AUTHOR), after);
  const icon = document.createElement('wa-icon');
  icon.setAttribute('name', SUPPORT.icon);
  const support = link(SUPPORT.url, icon, i18n.t('credit.support'));
  support.className = 'support';
  const supportLine = document.createElement('span');
  supportLine.append(support);
  target.replaceChildren(madeBy, supportLine);
}
