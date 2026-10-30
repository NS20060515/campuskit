/* 把校园地图的矢量底面（不含 HUD）截成大图，用于与官方平面图做配准比对
 * 用法：node tools/shot-vector.mjs [out.png] [scale]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.CAMPUS_BASE || 'http://127.0.0.1:8123/index.html';
const OUT = process.argv[2] || 'E:\\Deepseek Work\\Competer\\.shots\\vector-map.png';
const SCALE = Number(process.argv[3] || 0.62);
const PORT = 9366;
const profile = mkdtempSync(join(tmpdir(), 'shot-'));

spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--hide-scrollbars',
  '--window-size=1600,1200', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  BASE + '#/tt/rooms'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
for (let i = 0; i < 60; i++) {
  try {
    const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
    page = l.filter((t) => t.type === 'page')[0];
    if (page) break;
  } catch (e) { /* wait */ }
  await sleep(400);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const o = JSON.parse(e.data); if (o.id && pend.has(o.id)) { pend.get(o.id)(o); pend.delete(o.id); } };
const cdp = (m, p) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); return new Promise((r) => pend.set(i, r)); };
const ev = async (x) => (await cdp('Runtime.evaluate', { expression: x, returnByValue: true })).result.result.value;

await cdp('Page.enable');
await sleep(2500);
// 隐藏 HUD 与总览，只留矢量底面
await ev(`(() => {
  const st = document.querySelector('[data-cmap-stage]');
  document.querySelectorAll('.cmap-hud, .cmap-ov, .cmap-bar, .cmap-foot').forEach(e => e.style.display = 'none');
  st.scrollIntoView();
  return 1;
})()`);
const geo = await ev(`(() => {
  const st = document.querySelector('[data-cmap-stage]');
  const r = st.getBoundingClientRect();
  return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
})()`);
const shot = await cdp('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true, fromSurface: true,
  clip: { x: geo.x, y: geo.y, width: geo.w, height: geo.h, scale: SCALE },
});
writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
console.log('已保存 ' + OUT + '  clip=' + Math.round(geo.w) + 'x' + Math.round(geo.h) + ' scale=' + SCALE);
ws.close();
try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* noop */ }
process.exit(0);
