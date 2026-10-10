import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fetchGmailAccounts, parseGmailFeed } from '../lib/providers/gmail';

const feed = readFileSync(new URL('./fixtures/gmail-feed.xml', import.meta.url), 'utf8');

describe('parseGmailFeed', () => {
  it('parses the account, counter and messages', () => {
    const acc = parseGmailFeed(feed, 0);
    expect(acc).toMatchObject({
      id: 'gmail:test.user@gmail.com',
      email: 'test.user@gmail.com',
      status: 'ok',
      unreadCount: 27,
      inboxUrl: 'https://mail.google.com/mail/u/0/#inbox',
    });
    expect(acc?.messages).toHaveLength(2);
    expect(acc?.messages[0]).toMatchObject({
      from: 'Анна Петрова',
      fromEmail: 'anna@example.com',
      subject: 'Встреча в четверг & планы',
      snippet: 'Привет! Давай перенесём на 15:00',
      date: Date.parse('2026-10-10T09:41:00Z'),
      url: 'https://mail.google.com/mail/u/0?account_id=test.user@gmail.com&message_id=19a1b2c3d4e5f607&view=conv&extsrc=atom',
    });
  });

  it('falls back to the email and a placeholder subject', () => {
    const m = parseGmailFeed(feed, 0)?.messages[1];
    expect(m?.from).toBe('noreply@example.com');
    expect(m?.subject).toBe('(без темы)');
  });

  it('returns null for a non-feed page', () => {
    expect(parseGmailFeed('<html><body>Sign in</body></html>', 0)).toBeNull();
  });
});

describe('fetchGmailAccounts', () => {
  const feedFor = (email: string) => feed.replaceAll('test.user@gmail.com', email);

  it('walks /u/N until an account repeats', async () => {
    const pages = [feedFor('a@gmail.com'), feedFor('b@gmail.com'), feedFor('a@gmail.com')];
    const fetchFn = (async (url: string) => {
      const i = Number(url.match(/\/u\/(\d+)\//)?.[1]);
      const body = pages[i];
      return new Response(body ?? '', { status: body ? 200 : 401 });
    }) as unknown as typeof fetch;
    const accounts = await fetchGmailAccounts(fetchFn);
    expect(accounts.map((a) => a.email)).toEqual(['a@gmail.com', 'b@gmail.com']);
  });

  it('reports signed-out on 401', async () => {
    const fetchFn = (async () => new Response('', { status: 401 })) as unknown as typeof fetch;
    const [acc] = await fetchGmailAccounts(fetchFn);
    expect(acc?.status).toBe('signed-out');
  });
});
