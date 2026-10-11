import '@/lib/ui/wa';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/number-input/number-input.js';
import '@awesome.me/webawesome/dist/components/radio/radio.js';
import '@awesome.me/webawesome/dist/components/radio-group/radio-group.js';
import '@awesome.me/webawesome/dist/components/switch/switch.js';
import '@awesome.me/webawesome/dist/components/divider/divider.js';
import '@awesome.me/webawesome/dist/components/input/input.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import { parseWorkmailUrl } from '@/lib/providers/workmail';
import {
  clampPollSeconds,
  formatDuration,
  MAX_POLL_SECONDS,
  MIN_POLL_SECONDS,
  pollError,
} from '@/lib/settings';
import { notifyItem, pollSecondsItem, workmailUrlItem } from '@/lib/settings-store';
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
// The component validates (required/min/max/step) and decides when an error shows
// (:state(user-invalid), styled in CSS); we only supply the wording and the duration hint.
const poll = document.getElementById('poll') as HTMLElement & { value: string | number | null };
const pollHint = document.getElementById('poll-hint') as HTMLElement;
const pollErrorText = document.getElementById('poll-error-text') as HTMLElement;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

poll.setAttribute('min', String(MIN_POLL_SECONDS));
poll.setAttribute('max', String(MAX_POLL_SECONDS));

const pollValue = () => String(poll.value ?? '');

function renderPollTexts(): void {
  const error = pollError(pollValue());
  pollErrorText.textContent = error ?? '';
  // Only when the seconds aren't self-explanatory: 900 → "= 15 минут", 30 → nothing
  const human = error ? null : formatDuration(Number(pollValue()));
  pollHint.textContent = error ? 'От 30 секунд до суток' : human ? `= ${human}` : '';
}

void pollSecondsItem.getValue().then((stored) => {
  poll.value = String(clampPollSeconds(stored));
  renderPollTexts();

  const saveIfValid = () => {
    clearTimeout(saveTimer);
    if (pollError(pollValue()) === null) void pollSecondsItem.setValue(Number(pollValue()));
  };
  poll.addEventListener('input', () => {
    renderPollTexts();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveIfValid, 400);
  });
  poll.addEventListener('change', () => {
    renderPollTexts();
    saveIfValid();
  });
});

// Notifications: a switch that applies instantly
const notifySwitch = document.getElementById('notify') as HTMLElement & { checked: boolean };
void notifyItem.getValue().then((enabled) => {
  notifySwitch.checked = enabled;
  notifySwitch.addEventListener('change', () => void notifyItem.setValue(notifySwitch.checked));
});

// Amazon WorkMail: the web client URL differs per organization (region host), so the user pastes it;
// access to that host is requested via Chrome's optional host permissions on connect.
const workmailInput = document.getElementById('workmail-url') as HTMLElement & {
  value: string;
  disabled: boolean;
};
const workmailConnect = document.getElementById('workmail-connect') as HTMLElement;
const workmailDisconnect = document.getElementById('workmail-disconnect') as HTMLElement;
const workmailHint = document.getElementById('workmail-hint') as HTMLElement;

function renderWorkmail(url: string | null, error = ''): void {
  workmailInput.value = url ?? workmailInput.value;
  workmailInput.disabled = !!url;
  workmailConnect.hidden = !!url;
  workmailDisconnect.hidden = !url;
  workmailHint.classList.toggle('error', !!error);
  workmailHint.textContent = error;
}

void workmailUrlItem.getValue().then((url) => renderWorkmail(url));

workmailConnect.addEventListener('click', async () => {
  const url = parseWorkmailUrl(workmailInput.value);
  if (!url) {
    renderWorkmail(null, 'Нужна ссылка вида https://webmail.mail.<регион>.awsapps.com/workmail/');
    return;
  }
  // Must run inside the click (user gesture) for Chrome to show its permission prompt
  const granted = await browser.permissions.request({ origins: [`${url.origin}/*`] });
  if (!granted) {
    renderWorkmail(null, 'Chrome не выдал доступ к адресу почты');
    return;
  }
  await workmailUrlItem.setValue(url.toString());
  renderWorkmail(url.toString());
});

workmailDisconnect.addEventListener('click', async () => {
  const url = parseWorkmailUrl((await workmailUrlItem.getValue()) ?? '');
  await workmailUrlItem.setValue(null);
  if (url) await browser.permissions.remove({ origins: [`${url.origin}/*`] });
  workmailInput.value = '';
  renderWorkmail(null);
});

(document.getElementById('version') as HTMLElement).textContent =
  `Pulsar ${browser.runtime.getManifest().version}`;
