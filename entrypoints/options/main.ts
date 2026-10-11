import {
  clampPollSeconds,
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

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Option<T> {
  value: T;
  label: string;
  /** Inner SVG markup (constant, ours) — the option shows an icon instead of text */
  icon?: string;
}

/** A radiogroup of segmented buttons; arrow keys move the selection like native radios */
function segmented<T>(
  root: HTMLElement,
  options: Option<T>[],
  current: T,
  onChange: (value: T) => void,
): void {
  const buttons = options.map((opt) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.title = opt.label;
    if (opt.icon) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = opt.icon;
      b.append(svg);
      b.setAttribute('aria-label', opt.label);
    } else {
      b.textContent = opt.label;
    }
    return b;
  });

  const select = (index: number, focus = false) => {
    buttons.forEach((b, i) => {
      b.setAttribute('aria-checked', String(i === index));
      b.tabIndex = i === index ? 0 : -1;
    });
    if (focus) buttons[index]?.focus();
  };

  buttons.forEach((b, i) => {
    b.addEventListener('click', () => {
      select(i);
      onChange((options[i] as Option<T>).value);
    });
    b.addEventListener('keydown', (e) => {
      const step =
        e.key === 'ArrowRight' || e.key === 'ArrowDown'
          ? 1
          : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
            ? -1
            : 0;
      if (!step) return;
      e.preventDefault();
      const next = (i + step + buttons.length) % buttons.length;
      select(next, true);
      onChange((options[next] as Option<T>).value);
    });
  });

  root.replaceChildren(...buttons);
  select(
    Math.max(
      0,
      options.findIndex((o) => o.value === current),
    ),
  );
}

// Theme
const themeDesc = document.getElementById('theme-desc') as HTMLElement;
const showThemeDesc = (mode: ThemeMode) => {
  themeDesc.textContent = THEME_LABEL[mode];
};
showThemeDesc(getThemeMode());
segmented<ThemeMode>(
  document.getElementById('theme') as HTMLElement,
  THEME_MODES.map((m) => ({ value: m, label: THEME_LABEL[m], icon: THEME_ICON[m] })),
  getThemeMode(),
  (mode) => {
    setThemeMode(mode);
    showThemeDesc(mode);
  },
);

// Poll interval: a free number of seconds, saved while typing
const poll = document.getElementById('poll') as HTMLInputElement;
const pollHint = document.getElementById('poll-hint') as HTMLElement;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** null when the field holds something we can't save as is */
function readPoll(): number | null {
  const n = Number(poll.value);
  if (poll.value.trim() === '' || !Number.isInteger(n)) return null;
  if (n < MIN_POLL_SECONDS || n > MAX_POLL_SECONDS) return null;
  return n;
}

function showPollHint(): void {
  const n = readPoll();
  const raw = Number(poll.value);
  poll.toggleAttribute('aria-invalid', n === null);
  if (n !== null) pollHint.textContent = `Pulsar будет проверять почту ${describeInterval(n)}`;
  else if (Number.isFinite(raw) && raw > MAX_POLL_SECONDS) {
    pollHint.textContent = 'Максимум 86 400 секунд';
  } else pollHint.textContent = 'Минимум 30 секунд';
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
    showPollHint();
    clearTimeout(saveTimer);
    const n = readPoll();
    if (n !== null) saveTimer = setTimeout(() => save(n), 400);
  });
  // Leaving the field with an invalid value snaps it into range
  poll.addEventListener('change', () => {
    const n = clampPollSeconds(poll.value);
    poll.value = String(n);
    showPollHint();
    clearTimeout(saveTimer);
    save(n);
  });
});

(document.getElementById('version') as HTMLElement).textContent =
  `Pulsar ${browser.runtime.getManifest().version}`;
