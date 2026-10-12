import { providerIcon } from '@/lib/ui/wa';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/number-input/number-input.js';
import '@awesome.me/webawesome/dist/components/radio/radio.js';
import '@awesome.me/webawesome/dist/components/radio-group/radio-group.js';
import '@awesome.me/webawesome/dist/components/switch/switch.js';
import '@awesome.me/webawesome/dist/components/divider/divider.js';
import '@awesome.me/webawesome/dist/components/input/input.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import { type Disconnected, removeDisconnected } from '@/lib/disconnected';
import { i18n, localizePage } from '@/lib/i18n';
import { isOrderable, mergeOrder, move } from '@/lib/order';
import type { Account, State } from '@/lib/providers';
import { parseWorkmailUrl } from '@/lib/providers/workmail';
import {
  clampPollSeconds,
  clampShownMessages,
  formatDuration,
  MAX_POLL_SECONDS,
  MAX_SHOWN_MESSAGES,
  MIN_POLL_SECONDS,
  MIN_SHOWN_MESSAGES,
  pollError,
  shownMessagesError,
  shownMessagesRange,
} from '@/lib/settings';
import {
  accountOrderItem,
  disconnectedItem,
  notifyItem,
  pollSecondsItem,
  shownMessagesItem,
  workmailUrlItem,
} from '@/lib/settings-store';
import { STATE_KEY } from '@/lib/state';
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
localizePage();

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

/**
 * A number field saved while typing. The component validates (required/min/max/step) and decides
 * when an error shows (:state(user-invalid), styled in CSS); we supply the wording and the hint.
 */
function numberSetting(opts: {
  id: string;
  min: number;
  max: number;
  item: { getValue(): Promise<number>; setValue(v: number): Promise<void> };
  clamp: (v: unknown) => number;
  error: (raw: string) => string | null;
  /** The hint under the label for a typed value (its error is shown separately) */
  hint: (raw: string, error: string | null) => string;
}): void {
  const input = document.getElementById(opts.id) as HTMLElement & { value: string | number | null };
  const hint = document.getElementById(`${opts.id}-hint`) as HTMLElement;
  const errorText = document.getElementById(`${opts.id}-error-text`) as HTMLElement;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  input.setAttribute('min', String(opts.min));
  input.setAttribute('max', String(opts.max));
  const raw = () => String(input.value ?? '');

  const renderTexts = () => {
    const error = opts.error(raw());
    errorText.textContent = error ?? '';
    hint.textContent = opts.hint(raw(), error);
  };
  const saveIfValid = () => {
    clearTimeout(saveTimer);
    if (opts.error(raw()) === null) void opts.item.setValue(Number(raw()));
  };

  void opts.item.getValue().then((stored) => {
    input.value = String(opts.clamp(stored));
    renderTexts();
    input.addEventListener('input', () => {
      renderTexts();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveIfValid, 400);
    });
    input.addEventListener('change', () => {
      renderTexts();
      saveIfValid();
    });
  });
}

// Poll interval: a free number of seconds
numberSetting({
  id: 'poll',
  min: MIN_POLL_SECONDS,
  max: MAX_POLL_SECONDS,
  item: pollSecondsItem,
  clamp: clampPollSeconds,
  error: pollError,
  // Only when the seconds aren't self-explanatory: 900 → "= 15 minutes", 30 → nothing
  hint: (raw, error) => {
    if (error) return i18n.t('options.pollRange');
    const human = formatDuration(Number(raw));
    return human ? `= ${human}` : '';
  },
});

// Messages listed per mailbox: the range is shown up front, there's nothing else to explain
numberSetting({
  id: 'messages',
  min: MIN_SHOWN_MESSAGES,
  max: MAX_SHOWN_MESSAGES,
  item: shownMessagesItem,
  clamp: clampShownMessages,
  error: shownMessagesError,
  hint: () => shownMessagesRange(),
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
    renderWorkmail(null, i18n.t('options.workmailBadUrl'));
    return;
  }
  // Must run inside the click (user gesture) for Chrome to show its permission prompt
  const granted = await browser.permissions.request({ origins: [`${url.origin}/*`] });
  if (!granted) {
    renderWorkmail(null, i18n.t('options.workmailDenied'));
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

// Disconnected mailboxes: Pulsar skips them until the user connects them back here
const disconnectedCard = document.getElementById('disconnected-card') as HTMLElement;
const disconnectedList = document.getElementById('disconnected-list') as HTMLElement;

function renderDisconnected(list: Disconnected[]): void {
  disconnectedCard.hidden = list.length === 0;
  disconnectedList.replaceChildren(
    ...list.map((d) => {
      const row = document.createElement('div');
      row.className = 'row mailbox';
      const icon = document.createElement('wa-icon');
      icon.setAttribute('name', d.provider);
      icon.className = 'provider';
      const addr = document.createElement('span');
      addr.className = 'addr';
      addr.textContent = d.label;
      const connect = document.createElement('wa-button');
      connect.setAttribute('size', 's');
      connect.setAttribute('appearance', 'outlined');
      connect.textContent = i18n.t('options.connect');
      connect.addEventListener('click', async () => {
        await disconnectedItem.setValue(
          removeDisconnected(await disconnectedItem.getValue(), d.key),
        );
      });
      row.append(icon, addr, connect);
      return row;
    }),
  );
}

void disconnectedItem.getValue().then(renderDisconnected);
disconnectedItem.watch(renderDisconnected);

// Mailbox order: drag a row, or use Move up/down (keyboard and single-pointer alternative to
// dragging, WCAG 2.1.1 and 2.5.7). Saved at once; the background re-sorts the popup's list.
const orderCard = document.getElementById('order-card') as HTMLElement;
const orderList = document.getElementById('order-list') as HTMLOListElement;
let mailboxes: Account[] = [];
let dragged: HTMLLIElement | null = null;

const shownIds = () => [...orderList.children].map((li) => (li as HTMLElement).dataset.id ?? '');

async function saveOrder(ids: string[]): Promise<void> {
  await accountOrderItem.setValue(mergeOrder(ids, await accountOrderItem.getValue()));
}

function iconButton(name: string, label: string, onClick: () => void): HTMLElement {
  const button = document.createElement('wa-button');
  button.setAttribute('appearance', 'plain');
  button.setAttribute('size', 's');
  button.title = label;
  button.dataset.action = name;
  const icon = document.createElement('wa-icon');
  icon.setAttribute('name', name);
  icon.setAttribute('label', label);
  button.append(icon);
  button.addEventListener('click', onClick);
  return button;
}

/** Moves a mailbox one step by its buttons and keeps focus on the button that was pressed */
async function step(id: string, by: -1 | 1): Promise<void> {
  const ids = shownIds();
  const from = ids.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= ids.length) return;
  const next = move(ids, from, to);
  renderOrder(next.map((i) => mailboxes.find((a) => a.id === i) as Account));
  await saveOrder(next);
  const row = orderList.querySelector<HTMLElement>(`li[data-id="${CSS.escape(id)}"]`);
  const same = row?.querySelector<HTMLElement>(
    `[data-action="${by < 0 ? 'chevron-up' : 'chevron-down'}"]`,
  );
  const other = row?.querySelector<HTMLElement>(
    `[data-action="${by < 0 ? 'chevron-down' : 'chevron-up'}"]`,
  );
  (same?.hasAttribute('disabled') ? other : same)?.focus();
}

function renderOrder(list: Account[]): void {
  orderCard.hidden = list.length < 2;
  orderList.replaceChildren(
    ...list.map((a, i) => {
      const li = document.createElement('li');
      li.dataset.id = a.id;
      li.draggable = true;
      const grip = document.createElement('wa-icon');
      grip.setAttribute('name', 'grip');
      grip.className = 'grip';
      const mark = document.createElement('wa-icon');
      mark.setAttribute('name', providerIcon(a));
      mark.className = 'provider';
      const addr = document.createElement('span');
      addr.className = 'addr';
      addr.textContent = a.email;
      addr.title = a.email;
      const up = iconButton('chevron-up', i18n.t('options.moveUp'), () => void step(a.id, -1));
      const down = iconButton('chevron-down', i18n.t('options.moveDown'), () => void step(a.id, 1));
      if (i === 0) up.setAttribute('disabled', '');
      if (i === list.length - 1) down.setAttribute('disabled', '');
      li.append(grip, mark, addr, up, down);
      return li;
    }),
  );
}

orderList.addEventListener('dragstart', (e) => {
  dragged = (e.target as HTMLElement).closest('li');
  if (!dragged || !e.dataTransfer) return;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragged.dataset.id ?? '');
  dragged.classList.add('dragging');
});
// The row moves under the pointer while dragging, so the drop shows exactly where it lands
orderList.addEventListener('dragover', (e) => {
  if (!dragged) return;
  e.preventDefault();
  const over = (e.target as HTMLElement).closest('li');
  if (!over || over === dragged) return;
  const box = over.getBoundingClientRect();
  const after = e.clientY > box.top + box.height / 2;
  orderList.insertBefore(dragged, after ? over.nextSibling : over);
});
orderList.addEventListener('drop', (e) => e.preventDefault());
orderList.addEventListener('dragend', () => {
  if (!dragged) return;
  dragged.classList.remove('dragging');
  dragged = null;
  const ids = shownIds();
  // Re-render to update which Move up/down buttons are disabled
  renderOrder(ids.map((i) => mailboxes.find((a) => a.id === i) as Account));
  void saveOrder(ids);
});

/** The mailboxes Pulsar knows about now, in the popup's order (the background applies the order) */
function onState(state: State | undefined): void {
  mailboxes = (state?.accounts ?? []).filter(isOrderable);
  const ids = mailboxes.map((a) => a.id);
  // Polls rewrite the state every 30 s; only a different set or order of mailboxes re-renders
  if (dragged || ids.join('\n') === shownIds().join('\n')) return;
  renderOrder(mailboxes);
}

void browser.storage.local.get(STATE_KEY).then((r) => onState(r[STATE_KEY] as State | undefined));
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STATE_KEY]) onState(changes[STATE_KEY].newValue as State);
});

(document.getElementById('version') as HTMLElement).textContent =
  `Pulsar ${browser.runtime.getManifest().version}`;

// "Made with ❤️ by <author>": the name goes into the message via $1 (word order differs by language)
// and becomes a link to the author's GitHub
const AUTHOR = 'Ilya L.';
const madeBy = document.getElementById('made-by') as HTMLElement;
const [before = '', after = ''] = (i18n.t as (key: string, s: string[]) => string)(
  'options.madeBy',
  [AUTHOR],
).split(AUTHOR);
const author = document.createElement('a');
author.href = 'https://github.com/ilyachase';
author.target = '_blank';
author.rel = 'noopener noreferrer';
author.textContent = AUTHOR;
madeBy.append(before, author, after);
