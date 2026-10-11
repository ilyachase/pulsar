import '@/lib/ui/wa';
import '@awesome.me/webawesome/dist/components/avatar/avatar.js';
import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/callout/callout.js';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/skeleton/skeleton.js';
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
import { avatarHue, cleanSnippet, formatTime } from './format';

initTheme();

let pollText = describeInterval(DEFAULT_SETTINGS.pollSeconds);

const list = document.getElementById('list') as HTMLElement;
const summary = document.getElementById('summary') as HTMLElement;
const logo = document.getElementById('logo') as unknown as SVGSVGElement;
const refreshBtn = document.getElementById('refresh') as HTMLElement;
const settingsBtn = document.getElementById('settings') as HTMLElement;

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

/** A Web Awesome element with attributes (values are plain strings, never HTML) */
function wa(tag: string, attrs: Record<string, string | boolean> = {}): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false) node.setAttribute(k, v);
  }
  return node;
}

function icon(name: string, attrs: Record<string, string> = {}): HTMLElement {
  return wa('wa-icon', { name, ...attrs });
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
  const row = el('button', 'row');
  row.type = 'button';
  row.title = m.fromEmail ? `${m.from} <${m.fromEmail}>` : m.from;
  const name = m.from || m.fromEmail || '?';
  const avatar = wa('wa-avatar', { initials: name.trim().charAt(0).toUpperCase(), label: name });
  avatar.style.setProperty('--hue', `var(--wa-color-${avatarHue(m.fromEmail || name)}-50)`);
  const line = el('span', 'line');
  line.append(el('span', 'subj', m.subject));
  const snippet = cleanSnippet(m.snippet, name, m.subject);
  if (snippet) line.append(` — ${snippet}`);
  row.append(avatar, el('span', 'from', name), line, el('span', 'time', formatTime(m.date)));
  row.addEventListener('click', () => void openMessage(accountId, m));
  return row;
}

function renderHead(a: Account, trailing: HTMLElement[]): HTMLButtonElement {
  const head = el('button', 'head');
  head.type = 'button';
  head.slot = 'header';
  head.title = a.status === 'signed-out' ? 'Войти' : 'Открыть ящик';
  const who = el('span', 'who');
  who.append(el('span', 'email', a.email));
  head.append(icon(a.provider, { class: 'provider' }), who, ...trailing);
  head.addEventListener('click', () => open(a.inboxUrl));
  return head;
}

function renderWithMail(a: Account): HTMLElement {
  const card = wa('wa-card', { 'with-header': true });
  const openHint = el('span', 'open', 'Открыть ящик');
  openHint.append(icon('external'));
  const trailing: HTMLElement[] = [openHint];
  // The count only adds information when there are more unread messages than rows shown
  if (a.unreadCount > a.messages.length) {
    const count = wa('wa-badge', { variant: 'brand', pill: true });
    count.textContent = String(a.unreadCount);
    trailing.push(count);
  }
  card.append(renderHead(a, trailing));
  for (const m of a.messages) card.append(renderMessage(a.id, m));
  return card;
}

function renderProblem(a: Account): HTMLElement {
  const isError = a.status === 'error';
  const card = wa('wa-card', { 'with-header': true });
  const callout = wa('wa-callout', {
    class: 'problem',
    variant: isError ? 'danger' : 'neutral',
    appearance: 'filled',
    size: 's',
  });
  const calloutIcon = icon(isError ? 'circle-alert' : 'log-in');
  calloutIcon.slot = 'icon';
  const body = el('div', 'problem-body');
  const action = wa('wa-button', { size: 's', variant: isError ? 'danger' : 'brand' });
  action.textContent = isError ? 'Повторить' : 'Войти';
  action.addEventListener('click', () => (isError ? void refresh() : open(a.inboxUrl)));
  body.append(
    el(
      'span',
      undefined,
      isError ? `Не удалось проверить: ${a.error ?? 'неизвестная ошибка'}` : 'Не выполнен вход',
    ),
    action,
  );
  callout.append(calloutIcon, body);
  card.append(renderHead(a, []), callout);
  return card;
}

function renderCaughtUp(accounts: Account[], label: string): HTMLElement {
  const row = el('div', 'caught');
  if (label) row.append(el('span', 'caught-label', label));
  for (const a of accounts) {
    const chip = wa('wa-button', {
      size: 'xs',
      pill: true,
      appearance: 'plain',
      variant: 'neutral',
    });
    chip.title = `${providerName(a)} — открыть ящик`;
    const start = icon(a.provider);
    start.slot = 'start';
    chip.append(start, a.email);
    chip.addEventListener('click', () => open(a.inboxUrl));
    row.append(chip);
  }
  return row;
}

function renderEmpty(accounts: Account[]): HTMLElement {
  const empty = el('div', 'empty');
  const art = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  art.setAttribute('viewBox', '0 0 64 64');
  art.setAttribute('aria-hidden', 'true');
  for (const [r, attrs] of [
    ['30', { fill: 'none', stroke: 'currentColor', 'stroke-opacity': '.15', 'stroke-width': '2' }],
    ['20', { fill: 'none', stroke: 'currentColor', 'stroke-opacity': '.3', 'stroke-width': '2' }],
    ['8', { fill: 'currentColor' }],
  ] as const) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', '32');
    c.setAttribute('cy', '32');
    c.setAttribute('r', r);
    for (const [k, v] of Object.entries(attrs)) c.setAttribute(k, v);
    art.append(c);
  }
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
  // Same mail as already shown: keep the DOM as is (silent refresh)
  const content = state ? JSON.stringify(state.accounts) : '';
  if (state && content === lastContent && !animate) return;
  lastContent = content;
  list.classList.toggle('enter', animate);
  list.replaceChildren();
  if (!state) {
    summary.textContent = 'Проверяю почту…';
    for (let i = 0; i < 3; i++) list.append(wa('wa-skeleton', { effect: 'sheen' }));
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
      ` ${plural(total, ['письмо', 'письма', 'писем'])}`,
    );
  } else {
    summary.textContent = 'Новых писем нет';
  }
  logo.classList.toggle('live', total > 0);

  for (const a of withMail) list.append(renderWithMail(a));
  for (const a of problems) list.append(renderProblem(a));
  if (withMail.length === 0 && problems.length === 0) {
    list.append(renderEmpty(quiet));
  } else if (quiet.length > 0) {
    list.append(renderCaughtUp(quiet, 'Всё прочитано:'));
  }
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
settingsBtn.addEventListener('click', () => {
  void browser.runtime.openOptionsPage();
  window.close();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STATE_KEY]) render(changes[STATE_KEY].newValue as State);
});

// Render the cache instantly (the only animated paint), then quietly fetch fresh data
void browser.storage.local.get([STATE_KEY, SETTINGS_KEY]).then((cached) => {
  pollText = describeInterval(normalizeSettings(cached[SETTINGS_KEY]).pollSeconds);
  render(cached[STATE_KEY] as State | undefined, true);
  void refresh(true);
});
