import { writeFileSync } from 'node:fs';
import { browserWs, connect } from './cdp.mjs';

// Opens a Pulsar page (argv[2]: popup.html, options.html) in a background tab at popup size and
// saves screenshots to argv[3] (a folder): one on load, then one after each step in argv[4..]:
//   hover:<js expr for an element>   click:<js expr for an element>   js:<js expr, result printed>
const [page, outDir, ...steps] = process.argv.slice(2);
const cdp = await connect(await browserWs());

// Pulsar's id by name: other extensions in the profile have pages too
const ext = await cdp.send('Target.createTarget', { url: 'chrome://extensions', background: true });
const extSession = await cdp.send('Target.attachToTarget', {
  targetId: ext.targetId,
  flatten: true,
});
await new Promise((r) => setTimeout(r, 1500));
const { result } = await cdp.send(
  'Runtime.evaluate',
  {
    expression: `chrome.developerPrivate.getExtensionsInfo().then((l) => l.find((e) => e.name === 'Pulsar')?.id)`,
    awaitPromise: true,
    returnByValue: true,
  },
  extSession.sessionId,
);
await cdp.send('Target.closeTarget', { targetId: ext.targetId });

const { targetId } = await cdp.send('Target.createTarget', {
  url: `chrome-extension://${result.value}/${page}`,
  background: true,
});
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
await cdp.send(
  'Emulation.setDeviceMetricsOverride',
  { width: 800, height: 600, deviceScaleFactor: 1, mobile: false },
  sessionId,
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = (expression) =>
  cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(data, 'base64'));
};

await sleep(2500);
await shot('s0');
let i = 1;
for (const step of steps) {
  const colon = step.indexOf(':');
  const [kind, arg] = [step.slice(0, colon), step.slice(colon + 1)];
  if (kind === 'hover' || kind === 'click') {
    const r = await evaluate(
      `(() => { const b = (${arg}).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`,
    );
    const [x, y] = r.result.value;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
    if (kind === 'click') {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send(
          'Input.dispatchMouseEvent',
          { type, x, y, button: 'left', clickCount: 1 },
          sessionId,
        );
      }
    }
  } else {
    const r = await evaluate(arg);
    console.log(JSON.stringify(r.result.value ?? r.exceptionDetails?.exception?.description));
  }
  await sleep(1200);
  await shot(`s${i++}`);
}
console.log(`screenshots s0..s${i - 1} in ${outDir}`);
await cdp.send('Target.closeTarget', { targetId });
cdp.close();
