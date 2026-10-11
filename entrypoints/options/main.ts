import '@/lib/ui/wa';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/number-input/number-input.js';
import '@awesome.me/webawesome/dist/components/radio/radio.js';
import '@awesome.me/webawesome/dist/components/radio-group/radio-group.js';
import '@awesome.me/webawesome/dist/components/divider/divider.js';
import {
  formatDuration,
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

// Theme: a radio group rendered as icon buttons (the selected one is highlighted, names in tooltips)
const themeGroup = document.getElementById('theme') as HTMLElement & { value: string };

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
themeGroup.addEventListener('change', () => setThemeMode(themeGroup.value as ThemeMode));

// Poll interval: a free number of seconds, saved while typing.
// The constraints live on the element (required, min, max, step) and the browser checks them.
const poll = document.getElementById('poll') as HTMLElement & {
  value: string | number | null;
  validity: ValidityState;
  /** Lit: resolves after the component re-rendered and refreshed its validity */
  updateComplete: Promise<boolean>;
};
const pollHint = document.getElementById('poll-hint') as HTMLElement;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

poll.setAttribute('min', String(MIN_POLL_SECONDS));
poll.setAttribute('max', String(MAX_POLL_SECONDS));

/** null when the field holds something we can't save as is */
function readPoll(): number | null {
  return poll.validity.valid ? Number(poll.value) : null;
}

/** The error text for the constraint that failed */
function pollError(): string {
  const v = poll.validity;
  if (v.valueMissing) return 'Укажите число секунд';
  if (v.rangeOverflow) return 'Максимум 86 400 секунд';
  if (v.stepMismatch) return 'Только целое число секунд';
  return 'Минимум 30 секунд';
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
    // Only when the seconds aren't self-explanatory: 900 → "= 15 минут", 30 → nothing
    const human = formatDuration(n);
    pollHint.textContent = human ? `= ${human}` : '';
    return;
  }
  if (!errorShown) {
    pollHint.textContent = 'От 30 секунд до суток';
    return;
  }
  const icon = document.createElement('wa-icon');
  icon.setAttribute('name', 'circle-alert');
  pollHint.append(icon, pollError());
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

  // validity is updated asynchronously by the component, so wait for it before reading
  poll.addEventListener('input', () => void onInput());
  async function onInput(): Promise<void> {
    await poll.updateComplete;
    if (readPoll() !== null) errorShown = false;
    showPollHint();
    clearTimeout(saveTimer);
    const n = readPoll();
    if (n !== null) saveTimer = setTimeout(() => save(n), 400);
  }

  const commit = async () => {
    await poll.updateComplete;
    const n = readPoll();
    errorShown = n === null;
    showPollHint();
    clearTimeout(saveTimer);
    if (n !== null) save(n);
  };
  poll.addEventListener('change', () => void commit());
  poll.addEventListener('blur', () => void commit());
});

(document.getElementById('version') as HTMLElement).textContent =
  `Pulsar ${browser.runtime.getManifest().version}`;
