/** "https://mail.google.com/mail/u/1/" for a Gmail link of account /u/1, otherwise null */
export function gmailAccountPrefix(url: string): string | null {
  return url.match(/^https:\/\/mail\.google\.com\/mail\/u\/\d+\//)?.[0] ?? null;
}

/** Of the tabs showing that mailbox, the one in the window the user was last in, if any */
export function pickTab<T extends { windowId?: number }>(
  tabs: T[],
  focusedWindowId?: number,
): T | undefined {
  return tabs.find((t) => t.windowId === focusedWindowId) ?? tabs[0];
}

/** Reuses a mailbox tab when available. The background handles explicit Gmail read confirmation. */
export async function openMessageTab(url: string): Promise<void> {
  const prefix = gmailAccountPrefix(url);
  if (prefix) {
    const tabs = await browser.tabs.query({ url: `${prefix}*` });
    const focused = await browser.windows.getLastFocused().catch(() => undefined);
    const tab = pickTab(tabs, focused?.id);
    if (tab?.id !== undefined) {
      await browser.tabs.update(tab.id, { url, active: true });
      if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
      return;
    }
  }
  await browser.tabs.create({ url });
}
