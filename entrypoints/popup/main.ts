import type { Account, Message, State } from '@/lib/providers';
import { STATE_KEY } from '@/lib/state';
import { avatarColor, formatTime } from './format';

const list = document.getElementById('list') as HTMLElement;
const foot = document.getElementById('foot') as HTMLElement;
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

function providerIcon(provider: Account['provider']): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.classList.add('pi');
  const path = document.createElementNS(SVG_NS, 'path');
  if (provider === 'gmail') {
    path.setAttribute('fill', '#ea4335');
    path.setAttribute(
      'd',
      'M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z',
    );
  } else {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '11');
    circle.setAttribute('fill', '#fc3f1d');
    svg.append(circle);
    path.setAttribute('fill', '#fff');
    path.setAttribute(
      'd',
      'M13.3 6h-1.1C10.3 6 9 7.3 9 9.3c0 1.7.8 2.6 2.3 3.6L9 18h1.8l2.5-5.6V18H15V6h-1.7zm0 5.6-.4-.2c-1.2-.8-1.8-1.4-1.8-2.6 0-1.3.8-2 1.8-2h.4v4.8z',
    );
  }
  svg.append(path);
  return svg;
}

function open(url: string): void {
  void browser.tabs.create({ url });
  window.close();
}

function renderMessage(m: Message): HTMLButtonElement {
  const row = el('button', 'msg');
  row.type = 'button';
  row.title = m.fromEmail ? `${m.from} <${m.fromEmail}>` : m.from;
  const name = m.from || m.fromEmail || '?';
  const av = el('div', 'av', name.trim().charAt(0).toUpperCase());
  av.style.background = avatarColor(m.fromEmail || name);
  const line = el('div', 'line');
  line.append(el('b', undefined, m.subject));
  if (m.snippet) line.append(` — ${m.snippet}`);
  row.append(av, el('span', 'from', name), el('span', 'time', formatTime(m.date)), line);
  row.addEventListener('click', () => open(m.url));
  return row;
}

function renderAccount(a: Account): DocumentFragment {
  const frag = document.createDocumentFragment();

  const head = el('button', 'acc');
  head.type = 'button';
  head.title = a.status === 'signed-out' ? 'Войти' : 'Открыть входящие';
  head.append(providerIcon(a.provider), el('span', 'em', a.email));
  if (a.status === 'ok') {
    head.append(el('span', a.unreadCount ? 'cnt' : 'cnt zero', String(a.unreadCount)));
  }
  head.addEventListener('click', () => open(a.inboxUrl));
  frag.append(head);

  if (a.status === 'ok') {
    if (a.messages.length === 0) frag.append(el('div', 'state', 'Новых писем нет'));
    for (const m of a.messages) frag.append(renderMessage(m));
  } else {
    const state = el('div', 'state');
    const isError = a.status === 'error';
    const label = el(
      'span',
      'grow',
      isError ? `Ошибка: ${a.error ?? 'неизвестно'}` : 'Не выполнен вход',
    );
    const btn = el('button', 'btn', isError ? 'Повторить' : 'Войти');
    btn.type = 'button';
    btn.addEventListener('click', () => (isError ? void refresh() : open(a.inboxUrl)));
    state.append(label, btn);
    frag.append(state);
  }
  return frag;
}

function render(state: State | undefined): void {
  list.replaceChildren();
  if (!state) {
    list.append(el('div', 'state', 'Проверяю почту…'));
    foot.textContent = '';
    return;
  }
  for (const a of state.accounts) list.append(renderAccount(a));
  const time = new Date(state.updatedAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  foot.textContent = `Обновлено ${time} · проверка каждые 30 с`;
}

async function refresh(): Promise<void> {
  refreshBtn.classList.add('spin');
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

// Render the cache instantly, then fetch fresh data
void browser.storage.local.get(STATE_KEY).then((cached) => {
  render(cached[STATE_KEY] as State | undefined);
  void refresh();
});
