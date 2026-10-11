import { i18n } from '@/lib/i18n';

export type ThemeMode = 'auto' | 'light' | 'dark';

/**
 * The theme lives in localStorage: it is synchronous (no flash before the first paint) and is
 * shared by all extension pages (popup and settings) since they have the same origin.
 */
const KEY = 'pulsar:theme';

export const THEME_MODES: ThemeMode[] = ['auto', 'light', 'dark'];

export const THEME_LABEL: Record<ThemeMode, string> = {
  auto: i18n.t('options.themeAuto'),
  light: i18n.t('options.themeLight'),
  dark: i18n.t('options.themeDark'),
};

export const THEME_ICON: Record<ThemeMode, string> = {
  auto: 'monitor',
  light: 'sun',
  dark: 'moon',
};

const system = window.matchMedia('(prefers-color-scheme: dark)');

export function getThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
  } catch {}
  return 'auto';
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {}
  applyTheme();
}

/** Web Awesome switches schemes with the wa-light / wa-dark classes on <html> */
export function applyTheme(): void {
  const mode = getThemeMode();
  const dark = mode === 'dark' || (mode === 'auto' && system.matches);
  const root = document.documentElement;
  root.classList.toggle('wa-dark', dark);
  root.classList.toggle('wa-light', !dark);
}

/** Applies the saved theme now and keeps it in sync with the system and other extension pages */
export function initTheme(): void {
  applyTheme();
  system.addEventListener('change', applyTheme);
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) applyTheme();
  });
}
