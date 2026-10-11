import { locale } from '@/lib/i18n';

/** Web Awesome palette hues used for sender avatars */
const HUES = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'indigo', 'purple', 'pink'];

/** A stable palette hue per sender, e.g. "cyan" */
export function avatarHue(key: string): string {
  // FNV-1a: spreads well even in the low bits (a plain *31 hash collides on small moduli)
  let h = 0x811c9dc5;
  for (const ch of key) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 0x01000193);
  return HUES[(h >>> 0) % HUES.length] as string;
}

const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

/** Today → "12:41", yesterday → "вчера", this year → "8 окт.", otherwise → "08.10.2025" */
export function formatTime(ts: number, now: Date = new Date()): string {
  if (!ts) return '';
  const d = new Date(ts);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startOfToday) {
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  if (ts >= startOfToday - 86_400_000) return relative.format(-1, 'day'); // «вчера»
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString(locale);
}

/**
 * Mail snippets often start with the sender's name and/or the subject (preheader/header noise):
 * "Рег.ру Войти Автопродление скоро…" for sender "Рег.ру". Strip those leading repeats.
 */
export function cleanSnippet(snippet: string, from: string, subject: string): string {
  let s = snippet.trim();
  const norm = (t: string) => t.trim().toLocaleLowerCase(locale);
  for (let changed = true; changed; ) {
    changed = false;
    for (const prefix of [from, subject]) {
      const p = norm(prefix);
      if (p && norm(s).startsWith(p)) {
        s = s.slice(prefix.trim().length).replace(/^[\s:—–\-|·•,.]+/, '');
        changed = true;
      }
    }
  }
  return s;
}
