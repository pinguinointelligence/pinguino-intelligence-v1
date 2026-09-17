// One-off evaluate in the visible QA Chrome page (CDP 9334). usage: node cdp_eval9334.mjs '<expression>'
const targets = await (await fetch('http://127.0.0.1:9334/json/list')).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('staging.pinguinoai.com')) ?? targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
const result = await new Promise((resolve) => {
  ws.onmessage = (event) => { const msg = JSON.parse(event.data); if (msg.id === 1) resolve(msg.result); };
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: process.argv[2], returnByValue: true, awaitPromise: true } }));
});
console.log(JSON.stringify(result?.result?.value ?? result, null, 1));
ws.close();
