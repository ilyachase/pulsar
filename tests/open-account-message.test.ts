import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { State } from '../lib/providers/types';
import { type Opened, openedKey } from '../lib/state';

const { openTab, markGmailRead, fetchAccounts } = vi.hoisted(() => ({
  openTab: vi.fn(async () => {}),
  markGmailRead: vi.fn(),
  fetchAccounts: vi.fn(),
}));
vi.mock('../lib/open-message', () => ({ openMessageTab: openTab }));
vi.mock('../lib/providers/gmail-read', () => ({ markGmailMessageRead: markGmailRead }));
vi.mock('../lib/providers', () => ({ fetchAllAccounts: fetchAccounts }));

const accountId = 'gmail:test@example.com';
const messageId = 'message';
const url = 'https://mail.google.com/mail/u/0/#inbox/abc';
const state: State = {
  updatedAt: 0,
  accounts: [
    {
      id: accountId,
      provider: 'gmail',
      email: 'test@example.com',
      status: 'ok',
      unreadCount: 1,
      inboxUrl: 'https://mail.google.com/mail/u/0/#inbox',
      messages: [
        { id: messageId, from: 'Test', fromEmail: '', subject: 'Test', snippet: '', date: 1, url },
      ],
    },
  ],
};

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.declarativeNetRequest, 'updateSessionRules').mockResolvedValue();
  await fakeBrowser.storage.local.set({ state });
  fetchAccounts.mockResolvedValue(structuredClone(state.accounts));
  const background = (await import('../entrypoints/background')).default;
  background.main();
});

describe('opening a message', () => {
  it.each([true, false])(
    'opens and hides immediately while Gmail confirmation is pending (%s)',
    async (confirmed) => {
      let finish!: (value: boolean) => void;
      markGmailRead.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            finish = resolve;
          }),
      );
      const operation = fakeBrowser.runtime.onMessage.trigger(
        { type: 'open-message', accountId, messageId },
        {},
        () => {},
      );
      await vi.waitFor(() => expect(markGmailRead).toHaveBeenCalled());
      expect(openTab).toHaveBeenCalledExactlyOnceWith(url);
      const pending = (await fakeBrowser.storage.local.get('state')).state as State;
      expect(pending.accounts[0]?.messages).toEqual([]);
      const opened = (await fakeBrowser.storage.session.get('opened')).opened as Opened;
      expect(opened[openedKey(accountId, messageId)]).toBeTypeOf('number');
      finish(confirmed);
      await operation;
      const next = (await fakeBrowser.storage.local.get('state')).state as State;
      expect(next.accounts[0]?.unreadCount).toBe(confirmed ? 0 : 1);
      expect(next.accounts[0]?.messages).toHaveLength(confirmed ? 0 : 1);
      if (!confirmed) expect((await fakeBrowser.storage.session.get('opened')).opened).toEqual({});
    },
  );

  it('does not open a message absent from the current state', async () => {
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'open-message', accountId, messageId: 'missing' },
      {},
      () => {},
    );
    expect(openTab).not.toHaveBeenCalled();
    expect(markGmailRead).not.toHaveBeenCalled();
  });
});
