import { plural } from '@/lib/plural';
import type { Account, Message, State } from '@/lib/providers';
import {
  DEFAULT_SETTINGS,
  describeInterval,
  normalizeSettings,
  SETTINGS_KEY,
} from '@/lib/settings';
import { STATE_KEY } from '@/lib/state';
import { initTheme } from '@/lib/ui/theme';
import { avatarColor, formatTime } from './format';

initTheme();

let pollText = describeInterval(DEFAULT_SETTINGS.pollSeconds);

(document.getElementById('settings') as HTMLButtonElement).addEventListener('click', () => {
  void browser.runtime.openOptionsPage();
  window.close();
});

const list = document.getElementById('list') as HTMLElement;
const summary = document.getElementById('summary') as HTMLElement;
const updated = document.getElementById('updated') as HTMLElement;
const logo = document.getElementById('logo') as unknown as SVGSVGElement;
const refreshBtn = document.getElementById('refresh') as HTMLButtonElement;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function svg(viewBox: string, ...children: Array<[string, Record<string, string>]>): SVGSVGElement {
  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttribute('viewBox', viewBox);
  root.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of children) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    root.append(node);
  }
  return root;
}

const GMAIL_PATH =
  'M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z';
const YANDEX_PATH =
  'M13.3 6h-1.1C10.3 6 9 7.3 9 9.3c0 1.7.8 2.6 2.3 3.6L9 18h1.8l2.5-5.6V18H15V6h-1.7zm0 5.6-.4-.2c-1.2-.8-1.8-1.4-1.8-2.6 0-1.3.8-2 1.8-2h.4v4.8z';

function tile(provider: Account['provider'], small = false): HTMLElement {
  const t = el('span', small ? 'tile sm' : 'tile');
  t.append(
    provider === 'gmail'
      ? svg('0 0 24 24', ['path', { fill: '#ea4335', d: GMAIL_PATH }])
      : svg(
          '0 0 24 24',
          ['circle', { cx: '12', cy: '12', r: '11', fill: '#fc3f1d' }],
          ['path', { fill: '#fff', d: YANDEX_PATH }],
        ),
  );
  return t;
}

function providerName(a: Account): string {
  if (a.provider === 'gmail') return 'Gmail';
  return a.inboxUrl.includes('360.yandex') ? 'Яндекс 360' : 'Яндекс Почта';
}

function open(url: string): void {
  void browser.tabs.create({ url });
  window.close();
}

/** Counts the message as read right away; the next poll shows the mail service's real state */
async function openMessage(accountId: string, m: Message): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'opened', accountId, messageId: m.id });
  } finally {
    open(m.url);
  }
}

function renderMessage(accountId: string, m: Message): HTMLButtonElement {
  const row = button('row', () => void openMessage(accountId, m));
  row.title = m.fromEmail ? `${m.from} <${m.fromEmail}>` : m.from;
  const name = m.from || m.fromEmail || '?';
  const av = el('span', 'av', name.trim().charAt(0).toUpperCase());
  av.style.setProperty('--c', avatarColor(m.fromEmail || name));
  const line = el('span', 'line');
  line.append(el('span', 'subj', m.subject));
  if (m.snippet) line.append(` — ${m.snippet}`);
  row.append(av, el('span', 'from', name), line, el('span', 'time', formatTime(m.date)));
  return row;
}

function renderBoxHead(a: Account, trailing: HTMLElement[]): HTMLButtonElement {
  const head = button('box-head', () => open(a.inboxUrl));
  head.title = a.status === 'signed-out' ? 'Войти' : 'Открыть ящик';
  const who = el('span', 'who');
  who.append(el('span', 'email', a.email));
  // Signed-out placeholders are already named after the provider
  if (a.email !== providerName(a)) who.append(el('span', 'kind', providerName(a)));
  head.append(tile(a.provider), who, ...trailing);
  return head;
}

function renderWithMail(a: Account): HTMLElement {
  const box = el('section', 'box');
  box.append(
    renderBoxHead(a, [
      el('span', 'open', 'Открыть ящик ↗'),
      el('span', 'count', String(a.unreadCount)),
    ]),
  );
  for (const m of a.messages) box.append(renderMessage(a.id, m));
  return box;
}

function renderProblem(a: Account): HTMLElement {
  const isError = a.status === 'error';
  const box = el('section', isError ? 'box error' : 'box');
  const notice = el('div', 'notice');
  const action = button('btn', () => (isError ? void refresh() : open(a.inboxUrl)));
  action.textContent = isError ? 'Повторить' : 'Войти';
  notice.append(
    el(
      'span',
      'grow',
      isError ? `Не удалось проверить: ${a.error ?? 'неизвестная ошибка'}` : 'Не выполнен вход',
    ),
    action,
  );
  box.append(renderBoxHead(a, []), notice);
  return box;
}

function renderCaughtUp(accounts: Account[], label: string): HTMLElement {
  const row = el('div', 'caught');
  if (label) row.append(el('span', 'caught-label', label));
  for (const a of accounts) {
    const chip = button('chip', () => open(a.inboxUrl));
    chip.title = `${providerName(a)} — открыть ящик`;
    chip.append(tile(a.provider, true), a.email);
    row.append(chip);
  }
  return row;
}

function renderEmpty(accounts: Account[]): HTMLElement {
  const empty = el('div', 'empty');
  const art = svg(
    '0 0 64 64',
    [
      'circle',
      {
        cx: '32',
        cy: '32',
        r: '30',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-opacity': '.12',
        'stroke-width': '2',
      },
    ],
    [
      'circle',
      {
        cx: '32',
        cy: '32',
        r: '20',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-opacity': '.22',
        'stroke-width': '2',
      },
    ],
    ['circle', { cx: '32', cy: '32', r: '8', fill: 'currentColor', 'fill-opacity': '.9' }],
  );
  art.style.color = 'var(--accent)';
  empty.append(
    art,
    el('h2', undefined, 'Всё прочитано'),
    el('p', undefined, `Pulsar проверяет почту ${pollText}`),
    renderCaughtUp(accounts, ''),
  );
  return empty;
}

let lastContent = '';

function render(state: State | undefined, animate = false): void {
  // Same mail as already shown: only the "last checked" time changes, the DOM stays put
  const content = state ? JSON.stringify(state.accounts) : '';
  if (state && content === lastContent && !animate) {
    renderUpdated(state);
    return;
  }
  lastContent = content;
  list.classList.toggle('enter', animate);
  list.replaceChildren();
  if (!state) {
    summary.textContent = 'Проверяю почту…';
    for (let i = 0; i < 3; i++) list.append(el('div', 'skeleton'));
    return;
  }

  const ok = state.accounts.filter((a) => a.status === 'ok');
  const withMail = ok.filter((a) => a.messages.length > 0 || a.unreadCount > 0);
  const quiet = ok.filter((a) => !withMail.includes(a));
  const problems = state.accounts.filter((a) => a.status !== 'ok');
  const total = ok.reduce((s, a) => s + a.unreadCount, 0);

  summary.replaceChildren();
  if (total > 0) {
    summary.append(
      el('b', undefined, `${total} ${plural(total, ['новое', 'новых', 'новых'])}`),
      ` ${plural(total, ['письмо', 'письма', 'писем'])} · ${state.accounts.length} ${plural(state.accounts.length, ['ящик', 'ящика', 'ящиков'])}`,
    );
  } else {
    summary.textContent = 'Новых писем нет';
  }
  logo.classList.toggle('live', total > 0);
  renderUpdated(state);

  for (const a of withMail) list.append(renderWithMail(a));
  for (const a of problems) list.append(renderProblem(a));
  if (withMail.length === 0 && problems.length === 0) {
    list.append(renderEmpty(quiet));
  } else if (quiet.length > 0) {
    list.append(renderCaughtUp(quiet, 'Всё прочитано:'));
  }
}

function renderUpdated(state: State): void {
  updated.textContent = new Date(state.updatedAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  updated.title = `Последняя проверка · ${pollText}`;
}

/** silent: the automatic check on open — no spinner, content is swapped in place */
async function refresh(silent = false): Promise<void> {
  if (!silent) refreshBtn.classList.add('spin');
  try {
    render((await browser.runtime.sendMessage({ type: 'refresh' })) as State);
  } finally {
    refreshBtn.classList.remove('spin');
  }
}

refreshBtn.addEventListener('click', () => void refresh());

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STATE_KEY]) render(changes[STATE_KEY].newValue as State);
});

// Render the cache instantly (the only animated paint), then quietly fetch fresh data
void browser.storage.local.get([STATE_KEY, SETTINGS_KEY]).then((cached) => {
  pollText = describeInterval(normalizeSettings(cached[SETTINGS_KEY]).pollSeconds);
  render(cached[STATE_KEY] as State | undefined, true);
  void refresh(true);
});
