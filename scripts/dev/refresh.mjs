import { browserWs, connect } from './cdp.mjs';

// Asks Pulsar to check mail now (the popup's refresh message) and waits for the check to finish.
// Sent from a background popup tab: the service worker cannot message itself.
const cdp = await connect(await browserWs());
const { targetInfos } = await cdp.send('Target.getTargets');
const worker = targetInfos.find((t) => t.type === 'service_worker' && t.url.endsWith('/background.js') && t.url.startsWith('chrome-extension://'));
let host = worker && new URL(worker.url).host;
if (!host) {
  // Worker is asleep: find Pulsar's id on chrome://extensions
  const { targetId } = await cdp.send('Target.createTarget', { url: 'chrome://extensions', background: true });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await new Promise((r) => setTimeout(r, 1500));
  const { result } = await cdp.send(
    'Runtime.evaluate',
    { expression: `chrome.developerPrivate.getExtensionsInfo().then((l) => l.find((e) => e.name === 'Pulsar')?.id)`, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  await cdp.send('Target.closeTarget', { targetId });
  host = result.value;
}
const { targetId } = await cdp.send('Target.createTarget', { url: `chrome-extension://${host}/popup.html`, background: true });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
await new Promise((r) => setTimeout(r, 1000));
const r = await cdp.send(
  'Runtime.evaluate',
  { expression: `chrome.runtime.sendMessage({ type: 'refresh' }).then(() => 'done')`, awaitPromise: true, returnByValue: true },
  sessionId,
);
await cdp.send('Target.closeTarget', { targetId });
cdp.close();
console.log(r.result.value ?? r.exceptionDetails?.exception?.description);
