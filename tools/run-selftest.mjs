/* 用无头 Edge 跑某个校园通部署目录的 selftest，打印结果（用于改动前后基线对比）
 * 用法：node tools/run-selftest.mjs <url> [port]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = Number(process.argv[3] || 9344);
const profile = mkdtempSync(join(tmpdir(), 'cmap-selftest-'));

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--window-size=1500,1100', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  URL_ + '?selftest=1#/tt/rooms',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const p = list.filter((t) => t.type === 'page')[0];
      if (p && p.webSocketDebuggerUrl) return p;
    } catch (e) { /* wait */ }
    await sleep(400);
  }
  throw new Error('CDP 目标未就绪');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => { const o = JSON.parse(ev.data); if (o.id && pending.has(o.id)) { pending.get(o.id)(o); pending.delete(o.id); } };
const cdp = (method, params) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params: params || {} })); return new Promise((r) => pending.set(i, r)); };
const evalJs = async (e) => (await cdp('Runtime.evaluate', { expression: e, returnByValue: true })).result.result.value;

await sleep(2500);
let report = '';
for (let i = 0; i < 40; i++) {
  report = await evalJs(`(document.getElementById('selftest')||{}).textContent||''`);
  if (report) break;
  await sleep(500);
}
console.log('URL: ' + URL_);
console.log((report.match(/SELFTEST_RESULT[^\n]*/) || ['(无结果：' + report.slice(0, 120) + ')'])[0]);
(report.match(/FAIL  [^\n]*/g) || []).forEach((l) => console.log('  ' + l));
ws.close(); edge.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* noop */ }
