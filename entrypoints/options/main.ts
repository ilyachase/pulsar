import '@/lib/ui/wa';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/number-input/number-input.js';
import '@awesome.me/webawesome/dist/components/radio/radio.js';
import '@awesome.me/webawesome/dist/components/radio-group/radio-group.js';
import {
  describeInterval,
  MAX_POLL_SECONDS,
  MIN_POLL_SECONDS,
  normalizeSettings,
  SETTINGS_KEY,
  type Settings,
} from '@/lib/settings';
import {
  getThemeMode,
  initTheme,
  setThemeMode,
  THEME_ICON,
  THEME_LABEL,
  THEME_MODES,
  type ThemeMode,
} from '@/lib/ui/theme';

initTheme();

// Theme: a radio group rendered as icon buttons
const themeGroup = document.getElementById('theme') as HTMLElement & { value: string };
const themeDesc = document.getElementById('theme-desc') as HTMLElement;

for (const mode of THEME_MODES) {
  const radio = document.createElement('wa-radio');
  radio.setAttribute('appearance', 'button');
  radio.setAttribute('value', mode);
  radio.title = THEME_LABEL[mode];
  const icon = document.createElement('wa-icon');
  icon.setAttribute('name', THEME_ICON[mode]);
  icon.setAttribute('label', THEME_LABEL[mode]);
  radio.append(icon);
  themeGroup.append(radio);
}
themeGroup.setAttribute('value', getThemeMode());
themeDesc.textContent = THEME_LABEL[getThemeMode()];
themeGroup.addEventListener('change', () => {
  const mode = themeGroup.value as ThemeMode;
  setThemeMode(mode);
  themeDesc.textContent = THEME_LABEL[mode];
});

// Poll interval: a free number of seconds, saved while typing
const poll = document.getElementById('poll') as HTMLElement & { value: string | number | null };
const pollHint = document.getElementById('poll-hint') as HTMLElement;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const pollText = () => String(poll.value ?? '').trim();

/** null when the field holds something we can't save as is */
function readPoll(): number | null {
  const n = Number(pollText());
  if (pollText() === '' || !Number.isInteger(n)) return null;
  if (n < MIN_POLL_SECONDS || n > MAX_POLL_SECONDS) return null;
  return n;
}

/**
 * Inline validation, "reward early, punish late":
 * - while typing, an invalid value only shows the allowed range (no error yet);
 * - the error appears once the user is done (leaves the field or presses Enter);
 * - once shown, the error clears as soon as the value becomes valid;
 * - an invalid value is never auto-corrected or saved; the last valid setting stays in effect.
 */
let errorShown = false;

function showPollHint(): void {
  const n = readPoll();
  poll.classList.toggle('invalid', n === null && errorShown);
  pollHint.replaceChildren();
  if (n !== null) {
    pollHint.textContent = `Pulsar будет проверять почту ${describeInterval(n)}`;
    return;
  }
  if (!errorShown) {
    pollHint.textContent = 'От 30 секунд до суток';
    return;
  }
  const raw = Number(pollText());
  const icon = document.createElement('wa-icon');
  icon.setAttribute('name', 'circle-alert');
  pollHint.append(
    icon,
    Number.isFinite(raw) && raw > MAX_POLL_SECONDS ? 'Максимум 86 400 секунд' : 'Минимум 30 секунд',
  );
}

void browser.storage.local.get(SETTINGS_KEY).then((stored) => {
  let settings: Settings = normalizeSettings(stored[SETTINGS_KEY]);
  poll.value = String(settings.pollSeconds);
  showPollHint();

  const save = (pollSeconds: number) => {
    if (pollSeconds === settings.pollSeconds) return;
    settings = { ...settings, pollSeconds };
    void browser.storage.local.set({ [SETTINGS_KEY]: settings });
  };

  poll.addEventListener('input', () => {
    if (readPoll() !== null) errorShown = false;
    showPollHint();
    clearTimeout(saveTimer);
    const n = readPoll();
    if (n !== null) saveTimer = setTimeout(() => save(n), 400);
  });

  const commit = () => {
    const n = readPoll();
    errorShown = n === null;
    showPollHint();
    clearTimeout(saveTimer);
    if (n !== null) save(n);
  };
  poll.addEventListener('change', commit);
  poll.addEventListener('blur', commit);
});

(document.getElementById('version') as HTMLElement).textContent =
  `Pulsar ${browser.runtime.getManifest().version}`;
