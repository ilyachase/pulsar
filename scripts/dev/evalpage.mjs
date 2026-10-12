import { readFileSync } from 'node:fs';
import { browserWs, connect } from './cdp.mjs';

// Evaluates the JS file argv[3] in the tab whose URL contains argv[2]; prints the JSON result
const [match, file] = process.argv.slice(2);
const cdp = await connect(await browserWs());
const { targetInfos } = await cdp.send('Target.getTargets');
const tab = targetInfos.find((t) => t.type === 'page' && t.url.includes(match));
const { sessionId } = await cdp.send('Target.attachToTarget', {
  targetId: tab.targetId,
  flatten: true,
});
const r = await cdp.send(
  'Runtime.evaluate',
  { expression: readFileSync(file, 'utf8'), awaitPromise: true, returnByValue: true },
  sessionId,
);
console.log(JSON.stringify(r.result.value ?? r.exceptionDetails?.exception?.description, null, 1));
await cdp.send('Target.detachFromTarget', { sessionId });
cdp.close();
