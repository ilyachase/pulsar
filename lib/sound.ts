export const PLAY_SOUND = 'play-sound';
const OFFSCREEN_URL = '/offscreen.html';

/** Plays the new-mail chime in an offscreen document (Chrome closes it after 30 s of silence) */
export async function playSound(): Promise<void> {
  const url = browser.runtime.getURL(OFFSCREEN_URL);
  const open = await browser.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as Browser.runtime.ContextType],
    documentUrls: [url],
  });
  if (open.length === 0) {
    await browser.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: ['AUDIO_PLAYBACK' as Browser.offscreen.Reason],
        justification: 'New mail sound',
      })
      // Two polls racing to open it: the other one already did
      .catch(() => undefined);
  }
  await browser.runtime.sendMessage({ type: PLAY_SOUND }).catch(() => undefined);
}
