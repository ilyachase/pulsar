export type ThemeMode = 'auto' | 'light' | 'dark';

/**
 * The theme lives in localStorage: it is synchronous (no flash before the first paint) and is
 * shared by all extension pages (popup and settings) since they have the same origin.
 */
const KEY = 'pulsar:theme';

export const THEME_MODES: ThemeMode[] = ['auto', 'light', 'dark'];

export const THEME_LABEL: Record<ThemeMode, string> = {
  auto: 'Как в системе',
  light: 'Светлая',
  dark: 'Тёмная',
};

/** Outline icons (stroke = currentColor): monitor, sun, moon */
export const THEME_ICON: Record<ThemeMode, string> = {
  auto: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  light:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  dark: '<path d="M20.5 14.1A8.5 8.5 0 1 1 9.9 3.5a7 7 0 0 0 10.6 10.6z"/>',
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

export function applyTheme(): void {
  const mode = getThemeMode();
  const dark = mode === 'dark' || (mode === 'auto' && system.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/** Applies the saved theme now and keeps it in sync with the system and other extension pages */
export function initTheme(): void {
  applyTheme();
  system.addEventListener('change', applyTheme);
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) applyTheme();
  });
}
