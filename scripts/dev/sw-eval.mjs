import { readFileSync } from 'node:fs';
import { connect } from './cdp.mjs';

// Evaluates JS file argv[3] in Pulsar's service worker of the browser on port argv[2]
const [port, file] = process.argv.slice(2);
const ws = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
const cdp = await connect(ws);
const { targetInfos } = await cdp.send('Target.getTargets');
for (const w of targetInfos.filter((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'))) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: w.targetId, flatten: true });
  const name = (await cdp.send('Runtime.evaluate', { expression: 'chrome.runtime.getManifest().name', returnByValue: true }, sessionId)).result.value;
  if (name !== 'Pulsar') continue;
  const r = await cdp.send('Runtime.evaluate', { expression: readFileSync(file, 'utf8'), awaitPromise: true, returnByValue: true }, sessionId);
  console.log(JSON.stringify(r.result.value ?? r.exceptionDetails?.exception?.description, null, 1));
  break;
}
cdp.close();
