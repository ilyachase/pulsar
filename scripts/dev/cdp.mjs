// Minimal CDP client over the browser's debugging port (no Playwright: it must never close the window)
export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
    else for (const l of listeners) l(msg);
  };
  return {
    send: (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); }),
    on: (l) => listeners.push(l),
    close: () => ws.close(),
  };
}
export async function browserWs() {
  return (await (await fetch('http://127.0.0.1:9333/json/version')).json()).webSocketDebuggerUrl;
}
