import '@/lib/ui/wa';
import '@awesome.me/webawesome/dist/components/avatar/avatar.js';
import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/callout/callout.js';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/skeleton/skeleton.js';
import { i18n, localizePage, unreadParts } from '@/lib/i18n';
import type { Account, Message, State } from '@/lib/providers';
import { STATE_KEY } from '@/lib/state';
import { initTheme } from '@/lib/ui/theme';
import { avatarHue, cleanSnippet, formatTime } from './format';

initTheme();
localizePage();

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

/** Yandex 360 (organization) mailboxes live on mail.360.yandex.ru and get their own mark */
function providerIcon(a: Account): string {
  if (a.provider === 'yandex' && a.inboxUrl.includes('360.yandex')) return 'yandex360';
  return a.provider;
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
  head.title = a.status === 'signed-out' ? i18n.t('popup.signIn') : i18n.t('popup.openInbox');
  const who = el('span', 'who');
  who.append(el('span', 'email', a.email));
  head.append(icon(providerIcon(a), { class: 'provider' }), who, ...trailing);
  head.addEventListener('click', () => open(a.inboxUrl));
  return head;
}

function renderAccount(a: Account): HTMLElement {
  const empty = a.messages.length === 0 && a.unreadCount === 0;
  // Every account keeps its place; one with nothing unread is a single quiet header row
  const card = wa('wa-card', { 'with-header': true, class: empty ? 'quiet' : '' });
  const openHint = el('span', 'open', i18n.t('popup.openInbox'));
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
  action.textContent = isError ? i18n.t('popup.retry') : i18n.t('popup.signIn');
  action.addEventListener('click', () => (isError ? void refresh() : open(a.inboxUrl)));
  body.append(
    el(
      'span',
      undefined,
      isError
        ? i18n.t('popup.checkFailed', [a.error ?? i18n.t('popup.unknownError')])
        : i18n.t('popup.notSignedIn'),
    ),
    action,
  );
  callout.append(calloutIcon, body);
  card.append(renderHead(a, []), callout);
  return card;
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
    summary.textContent = i18n.t('popup.checking');
    for (let i = 0; i < 3; i++) list.append(wa('wa-skeleton', { effect: 'sheen' }));
    return;
  }

  const ok = state.accounts.filter((a) => a.status === 'ok');
  const total = ok.reduce((s, a) => s + a.unreadCount, 0);

  summary.replaceChildren();
  if (total > 0) {
    const [count, rest] = unreadParts(total);
    summary.append(el('b', undefined, count), rest);
  } else {
    summary.textContent = i18n.t('popup.noNew');
  }
  logo.classList.toggle('live', total > 0);

  // Accounts always render in the same order, so nothing jumps when mail arrives or is read
  for (const a of state.accounts) {
    list.append(a.status === 'ok' ? renderAccount(a) : renderProblem(a));
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
void browser.storage.local.get(STATE_KEY).then((cached) => {
  render(cached[STATE_KEY] as State | undefined, true);
  void refresh(true);
});
