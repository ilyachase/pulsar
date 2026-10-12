import { browserWs, connect } from './cdp.mjs';

// Reloads the unpacked Pulsar extension in the test browser so the fresh build is used.
// Goes through chrome://extensions (like its Reload button): chrome.runtime.reload() from the worker
// makes newer Chromium disable a --load-extension extension ("unsupportedDeveloperExtension").
// Re-enables Pulsar if Chromium disabled it, e.g. while a rebuild replaced .output.
const cdp = await connect(await browserWs());
const { targetId } = await cdp.send('Target.createTarget', { url: 'chrome://extensions', background: true });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
await new Promise((r) => setTimeout(r, 1500));
const { result, exceptionDetails } = await cdp.send(
  'Runtime.evaluate',
  {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const ext = (await chrome.developerPrivate.getExtensionsInfo()).find((e) => e.name === 'Pulsar');
      if (!ext) return null;
      if (ext.state !== 'ENABLED') await chrome.management.setEnabled(ext.id, true);
      await chrome.developerPrivate.reload(ext.id, { failQuietly: false });
      return ext.id;
    })()`,
  },
  sessionId,
);
await cdp.send('Target.closeTarget', { targetId });
cdp.close();
if (exceptionDetails) console.log('reload failed:', exceptionDetails.exception?.description);
else console.log(result.value ? `reloaded Pulsar (${result.value})` : 'Pulsar not found in chrome://extensions');
