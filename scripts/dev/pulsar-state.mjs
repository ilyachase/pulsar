import { browserWs, connect } from './cdp.mjs';

// Triggers a Pulsar check in the test browser and prints a privacy-safe summary of its state.
const cdp = await connect(await browserWs());
const { targetInfos } = await cdp.send('Target.getTargets');
let summary = null;
for (const w of targetInfos.filter((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'))) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: w.targetId, flatten: true });
  const name = (await cdp.send('Runtime.evaluate', { expression: 'chrome.runtime.getManifest().name', returnByValue: true }, sessionId)).result.value;
  if (name !== 'Pulsar') {
    await cdp.send('Target.detachFromTarget', { sessionId });
    continue;
  }
  const r = await cdp.send(
    'Runtime.evaluate',
    {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const all = await chrome.storage.local.get(null);
        const perms = await chrome.permissions.getAll();
        const { state } = all;
        return {
          workmailUrlSet: !!all.workmailUrl,
          workmailOrigins: perms.origins.filter((o) => o.includes('awsapps')),
          updatedAt: state && new Date(state.updatedAt).toLocaleTimeString('ru-RU'),
          accounts: (state?.accounts ?? []).map((a) => ({
            provider: a.provider,
            status: a.status,
            emailDomain: a.email.includes('@') ? a.email.replace(/^[^@]*/, '***') : a.email,
            unread: a.unreadCount,
            listed: a.messages.length,
            fieldsFilled: a.messages.every((m) => m.from && m.subject && m.date > 0),
            error: a.error,
          })),
        };
      })()`,
    },
    sessionId,
  );
  summary = r.result.value ?? r.exceptionDetails?.exception?.description;
  await cdp.send('Target.detachFromTarget', { sessionId });
  break;
}
cdp.close();
console.log(JSON.stringify(summary, null, 1));
