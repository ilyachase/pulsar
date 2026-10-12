import '@/lib/ui/wa';
import '@awesome.me/webawesome/dist/components/avatar/avatar.js';
import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/callout/callout.js';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/skeleton/skeleton.js';
import { addDisconnected, removeDisconnected, toDisconnected } from '@/lib/disconnected';
import { i18n, localizePage, unreadParts } from '@/lib/i18n';
import type { Account, Message, State } from '@/lib/providers';
import { isSignInPrompt } from '@/lib/providers/types';
import { disconnectedItem, workmailUrlItem } from '@/lib/settings-store';
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

/** Disconnected in this popup: shown as an "undo" row in the account's place until it closes */
const undoable = new Map<string, { index: number; account: Account; undo: () => Promise<void> }>();

/**
 * Pulsar stops checking the mailbox; the mail itself stays signed in. WorkMail is configured by
 * its URL, so it's disconnected by clearing it (the host permission stays: undo needs no prompt,
 * and the settings page re-requests it on connect anyway).
 */
async function disconnect(a: Account, index: number): Promise<void> {
  let undo: () => Promise<void>;
  if (a.provider === 'workmail') {
    const url = await workmailUrlItem.getValue();
    await workmailUrlItem.setValue(null);
    undo = () => workmailUrlItem.setValue(url);
  } else {
    const entry = toDisconnected(a);
    await disconnectedItem.setValue(addDisconnected(await disconnectedItem.getValue(), entry));
    undo = async () =>
      disconnectedItem.setValue(removeDisconnected(await disconnectedItem.getValue(), entry.key));
  }
  undoable.set(a.id, { index, account: a, undo });
  rerender();
}

function renderUndo(id: string, a: Account): HTMLElement {
  const row = el('div', 'undo');
  const text = el('span', 'undo-text', i18n.t('popup.disconnected', [a.email]));
  text.prepend(icon(providerIcon(a), { class: 'provider' }));
  const back = wa('wa-button', { size: 's', appearance: 'plain', variant: 'brand' });
  back.textContent = i18n.t('popup.undo');
  back.addEventListener('click', async () => {
    const entry = undoable.get(id);
    undoable.delete(id);
    await entry?.undo();
    rerender();
  });
  row.append(text, back);
  return row;
}

/**
 * [provider · address · "open inbox"] [disconnect] [count]: the count stays at the card's edge, and
 * the hover-only buttons take their room from the address, so nothing moves when they appear.
 */
function renderHead(a: Account, index: number, count?: HTMLElement): HTMLElement {
  const bar = el('div', 'bar');
  bar.slot = 'header';
  const head = el('button', 'head');
  head.type = 'button';
  head.title = a.status === 'signed-out' ? i18n.t('popup.signIn') : i18n.t('popup.openInbox');
  const who = el('span', 'who');
  who.append(el('span', 'email', a.email));
  const openHint = el('span', 'open', i18n.t('popup.openInbox'));
  openHint.append(icon('external'));
  head.append(icon(providerIcon(a), { class: 'provider' }), who, openHint);
  head.addEventListener('click', () => open(a.inboxUrl));
  const off = wa('wa-button', { class: 'disconnect', appearance: 'plain', size: 's' });
  off.title = i18n.t('popup.disconnectHint');
  off.append(icon('unplug', { label: i18n.t('popup.disconnect') }));
  off.addEventListener('click', () => void disconnect(a, index));
  bar.append(head, off);
  if (count) {
    // Outside the header button (buttons can't nest), but a click on it still opens the inbox
    count.classList.add('count');
    count.addEventListener('click', () => open(a.inboxUrl));
    bar.append(count);
  }
  return bar;
}

function renderAccount(a: Account, index: number): HTMLElement {
  const empty = a.messages.length === 0 && a.unreadCount === 0;
  // Every account keeps its place; one with nothing unread is a single quiet header row
  const card = wa('wa-card', { 'with-header': true, class: empty ? 'quiet' : '' });
  // Every mailbox with unread mail shows its count, even when all its messages are listed:
  // counting rows by eye is not a thing anyone does
  let count: HTMLElement | undefined;
  if (a.unreadCount > 0) {
    count = wa('wa-badge', { variant: 'brand', pill: true });
    count.textContent = String(a.unreadCount);
  }
  card.append(renderHead(a, index, count));
  for (const m of a.messages) card.append(renderMessage(a.id, m));
  return card;
}

function renderProblem(a: Account, index: number): HTMLElement {
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
  card.append(renderHead(a, index), callout);
  return card;
}

/** No mailboxes yet: what to do, with a sign-in button per supported service */
function renderEmpty(prompts: Account[]): HTMLElement {
  const box = el('div', 'empty');
  box.append(el('p', undefined, i18n.t('popup.empty')));
  const services = el('div', 'services');
  for (const a of prompts) {
    const button = wa('wa-button', { size: 's', appearance: 'outlined' });
    const mark = icon(providerIcon(a));
    mark.slot = 'start';
    button.append(mark, a.email);
    button.addEventListener('click', () => open(a.inboxUrl));
    services.append(button);
  }
  box.append(services);
  return box;
}

let lastContent = '';
let lastState: State | undefined;

function render(state: State | undefined, animate = false): void {
  lastState = state;
  // Same mail as already shown: keep the DOM as is (silent refresh)
  const content = state ? JSON.stringify([state.accounts, [...undoable.keys()]]) : '';
  if (state && content === lastContent && !animate) return;
  lastContent = content;
  list.classList.toggle('enter', animate);
  list.replaceChildren();
  if (!state) {
    summary.textContent = i18n.t('popup.checking');
    for (let i = 0; i < 3; i++) list.append(wa('wa-skeleton', { effect: 'sheen' }));
    return;
  }

  const prompts = state.accounts.filter(isSignInPrompt);
  const mailboxes = state.accounts.filter((a) => !isSignInPrompt(a));
  const ok = mailboxes.filter((a) => a.status === 'ok');
  const total = ok.reduce((s, a) => s + a.unreadCount, 0);

  summary.replaceChildren();
  if (mailboxes.length === 0 && undoable.size === 0) {
    // "No new mail" would be misleading: there is no mailbox to have mail in
    logo.classList.remove('live');
    list.append(renderEmpty(prompts));
    return;
  }
  if (total > 0) {
    const [count, rest] = unreadParts(total);
    summary.append(el('b', undefined, count), rest);
  } else {
    summary.textContent = i18n.t('popup.noNew');
  }
  logo.classList.toggle('live', total > 0);

  // Accounts always render in the same order, so nothing jumps when mail arrives or is read.
  // A just-disconnected mailbox (already gone from the state) keeps its place as an undo row.
  const shown = mailboxes.filter((a) => !undoable.has(a.id));
  const undos = [...undoable.values()].sort((x, y) => x.index - y.index);
  for (const { index, account } of undos) shown.splice(index, 0, account);
  list.append(
    ...shown.map((a, i) => {
      if (undoable.has(a.id)) return renderUndo(a.id, a);
      return a.status === 'ok' ? renderAccount(a, i) : renderProblem(a, i);
    }),
  );
}

function rerender(): void {
  lastContent = '';
  render(lastState);
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
