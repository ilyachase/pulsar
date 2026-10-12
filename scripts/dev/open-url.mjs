import { browserWs, connect } from './cdp.mjs';

// Opens argv[2] in a new background tab, waits, prints the final URL (long ids masked) and whether argv[3] text is on the page, then closes the tab
const [url, needle] = process.argv.slice(2);
const cdp = await connect(await browserWs());
const { targetId } = await cdp.send('Target.createTarget', { url, background: true });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
await new Promise((r) => setTimeout(r, 7000));
const r = await cdp.send('Runtime.evaluate', { expression: `({ url: location.href, found: document.body.innerText.includes(${JSON.stringify(needle ?? '')}) })`, returnByValue: true }, sessionId);
const v = r.result.value;
console.log(v.url.replace(/\d{6,}/g, (m) => `<${m.length}d>`), 'found:', v.found);
await cdp.send('Target.closeTarget', { targetId });
cdp.close();
