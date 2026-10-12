import { PLAY_SOUND } from '@/lib/sound';

/**
 * The service worker can't play audio, so it opens this hidden page for that. The chime is
 * synthesized: two short soft tones, no audio file to ship.
 */
let ctx: AudioContext | undefined;

function chime(): void {
  ctx ??= new AudioContext();
  const start = ctx.currentTime + 0.02;
  for (const [i, freq] of [880, 1318.5].entries()) {
    const at = start + i * 0.14;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.25, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.5);
  }
}

browser.runtime.onMessage.addListener((msg: unknown) => {
  if ((msg as { type?: string })?.type === PLAY_SOUND) chime();
});
