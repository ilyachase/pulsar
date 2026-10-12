/**
 * Web Awesome setup shared by the popup and the settings page.
 * Import this before any component so the icon library is registered first.
 */
import '@awesome.me/webawesome/dist/styles/themes/default.css';
import '@awesome.me/webawesome/dist/styles/color/variants/brand.css';
import '@awesome.me/webawesome/dist/styles/utilities.css';
// Component strings (English is built in); picked by <html lang>, pt-BR falls back to pt
import '@awesome.me/webawesome/dist/translations/de.js';
import '@awesome.me/webawesome/dist/translations/es.js';
import '@awesome.me/webawesome/dist/translations/fr.js';
import '@awesome.me/webawesome/dist/translations/id.js';
import '@awesome.me/webawesome/dist/translations/it.js';
import '@awesome.me/webawesome/dist/translations/ja.js';
import '@awesome.me/webawesome/dist/translations/pt.js';
import '@awesome.me/webawesome/dist/translations/ru.js';
import '@awesome.me/webawesome/dist/translations/tr.js';
import { registerIconLibrary } from '@awesome.me/webawesome/dist/components/icon/library.js';
import type { Account } from '../providers/types';

const outline = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/**
 * The default library points at the Font Awesome CDN; an extension shouldn't fetch UI icons
 * from the network, so every icon we use is bundled here as inline SVG.
 */
const ICONS: Record<string, string> = {
  refresh: outline('<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>'),
  settings: outline(
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  ),
  external: outline(
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  ),
  monitor: outline('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  sun: outline(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  ),
  moon: outline('<path d="M20.5 14.1A8.5 8.5 0 1 1 9.9 3.5a7 7 0 0 0 10.6 10.6z"/>'),
  'circle-alert': outline('<circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5M12 16.25v.25"/>'),
  // Lucide "unplug": disconnecting a mailbox from Pulsar (not signing out of the mail)
  unplug: outline(
    '<path d="m19 5 3-3"/><path d="m2 22 3-3"/><path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"/><path d="M7.5 13.5 10 11"/><path d="M10.5 16.5 13 14"/><path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"/>',
  ),
  // Lucide "grip-vertical", "chevron-up", "chevron-down": reordering mailboxes in the settings
  grip: outline(
    '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
  ),
  'chevron-up': outline('<path d="m18 15-6-6-6 6"/>'),
  'chevron-down': outline('<path d="m6 9 6 6 6-6"/>'),
  'log-in': outline(
    '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
  ),
  // Provider marks keep their brand colors
  gmail:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ea4335" d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>',
  yandex:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#fc3f1d"/><path fill="#fff" d="M13.3 6h-1.1C10.3 6 9 7.3 9 9.3c0 1.7.8 2.6 2.3 3.6L9 18h1.8l2.5-5.6V18H15V6h-1.7zm0 5.6-.4-.2c-1.2-.8-1.8-1.4-1.8-2.6 0-1.3.8-2 1.8-2h.4v4.8z"/></svg>',
  // Yandex 360 (organization mail) mark, redrawn from the official favicon on 360.yandex.ru
  yandex360:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><radialGradient id="y360" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff783f"/><stop offset="1" stop-color="#ff6321"/></radialGradient></defs><circle cx="12" cy="12" r="12" fill="url(#y360)"/><g fill="#fff"><ellipse cx="12" cy="12" rx="4" ry="6.75"/><ellipse cx="3.75" cy="12" rx="2.1" ry="5.25"/><ellipse cx="20.25" cy="12" rx="2.1" ry="5.25"/></g></svg>',
  // Mail.ru mark: the blue "@" of its 2024 favicon
  mailru:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#07f" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"/></svg>',
  // Amazon WorkMail mark, redrawn from the web client's favicon: a green envelope frame + flap
  workmail:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="#69a543"><path fill-rule="evenodd" d="M0 0h32v32H0zM3 3v26h26V3z"/><path d="M3.5 3h25L16 15.5z"/></g></svg>',
};

export type IconName = keyof typeof ICONS;

registerIconLibrary('default', {
  resolver: (name) => {
    const svg = ICONS[name];
    if (!svg) console.warn(`Pulsar: unknown icon "${name}"`);
    return `data:image/svg+xml,${encodeURIComponent(svg ?? '<svg xmlns="http://www.w3.org/2000/svg"/>')}`;
  },
});

/** Yandex 360 (organization) mailboxes live on mail.360.yandex.ru and get their own mark */
export function providerIcon(a: Pick<Account, 'provider' | 'inboxUrl'>): string {
  if (a.provider === 'yandex' && a.inboxUrl.includes('360.yandex')) return 'yandex360';
  return a.provider;
}
