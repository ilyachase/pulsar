import { browserWs, connect } from './cdp.mjs';

// Opens Pulsar's popup and settings pages in background tabs, prints their UI texts (no mail data), closes them
const port = process.argv[2] ?? '9333';
const ext = process.argv[3] ?? 'pclhojjmopmkhpncofgmknocknmkpakg';
const ws = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json())
  .webSocketDebuggerUrl;
const cdp = await connect(ws);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = {
  popup: `({
    lang: document.documentElement.lang,
    ui: chrome.i18n.getUILanguage(),
    summary: document.getElementById('summary').textContent,
    titles: [...document.querySelectorAll('header [title]')].map((e) => e.title),
    openHints: [...new Set([...document.querySelectorAll('.open')].map((e) => e.textContent))],
    problems: [...document.querySelectorAll('.problem-body')].map((e) => e.innerText.split(String.fromCharCode(10)).filter((l) => !l.includes('@')).join(' | ')),
    times: [...new Set([...document.querySelectorAll('.time')].map((e) => e.textContent))].slice(0, 5),
  })`,
  options: `(async () => ({
    lang: document.documentElement.lang,
    title: document.title,
    text: document.querySelector('main').innerText,
    themeLabels: [...document.querySelectorAll('wa-radio')].map((r) => r.title),
    placeholder: document.getElementById('workmail-url').getAttribute('placeholder'),
    pollHint: document.getElementById('poll-hint').textContent,
    actionTitle: (await chrome.action.getTitle({})),
    rest: JSON.stringify(chrome.i18n.getMessage('unread_count_other', ['5']) + chrome.i18n.getMessage('unread_rest_other')),
    name: chrome.i18n.getMessage('extName') + ' / ' + chrome.i18n.getMessage('extDescription'),
  }))()`,
};
for (const [page, expression] of Object.entries(probe)) {
  const { targetId } = await cdp.send('Target.createTarget', {
    url: `chrome-extension://${ext}/${page}.html`,
    background: true,
  });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await sleep(page === 'popup' ? 6000 : 2000);
  const r = await cdp.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  console.log(
    page,
    JSON.stringify(r.result.value ?? r.exceptionDetails?.exception?.description, null, 1),
  );
  await cdp.send('Target.closeTarget', { targetId });
}
cdp.close();
