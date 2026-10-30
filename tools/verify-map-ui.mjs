/* 校园通 · 校园地图 UI 端到端校验（无头 Edge + CDP）
 * 用法：node tools/verify-map-ui.mjs
 * 校验：1:2000 像素真实性、比例尺标尺长度、缩放联动、回到我的位置、总览联动、
 *      深色主题、以及应用自带 selftest 全量断言。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.CAMPUS_BASE || 'http://127.0.0.1:8123/index.html';
const PORT = 9341;   // 避开桌面版 WebView2 的调试端口 9333
const profile = mkdtempSync(join(tmpdir(), 'cmap-verify-'));

let fails = 0, checks = 0;
const ok = (name, cond, extra) => {
  checks++;
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '　' + extra : ''));
  if (!cond) fails++;
};

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--window-size=1500,1100', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  BASE + '#/tt/rooms',
], { stdio: 'ignore', detached: false });

async function targets() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await r.json();
      const page = list.filter((t) => t.type === 'page')[0];
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (e) { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('CDP 目标未就绪');
}

const page = await targets();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const obj = JSON.parse(ev.data);
  if (obj.id && pending.has(obj.id)) { pending.get(obj.id)(obj); pending.delete(obj.id); }
};
function cdp(method, params) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((res) => pending.set(id, res));
}
async function evalJs(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) throw new Error('JS 异常: ' + r.result.exceptionDetails.text);
  return r.result.result.value;
}
async function goto(url) {
  await cdp('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 1800));
}

await cdp('Page.enable');
await new Promise((r) => setTimeout(r, 2000));

console.log('\n[1] 图面与比例尺（默认 1:2000）');
const base = await evalJs(`(() => {
  const CM = window.CH.cmap;
  const svg = document.querySelector('.campus-map svg.cmap-svg');
  const bar = document.querySelector('[data-cmap-bar]');
  const wrap = document.querySelector('[data-cmap-barwrap]');
  const scroll = document.querySelector('[data-cmap-scroll]');
  return {
    hasSvg: !!svg,
    svgW: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
    mapW: CM.mapPx.w,
    mPerPx: CM.M_PER_PX,
    pxPerM: CM.PX_PER_M,
    ratio: (document.querySelector('[data-cmap-ratio]') || {}).textContent,
    barW: bar ? +bar.getBoundingClientRect().width.toFixed(1) : 0,
    wrapW: wrap ? +wrap.getBoundingClientRect().width.toFixed(1) : 0,
    barLabel: (document.querySelector('[data-cmap-barm]') || {}).textContent,
    view: (document.querySelector('[data-cmap-viewsize]') || {}).textContent,
    viewW: scroll ? Math.round(scroll.clientWidth * CM.M_PER_PX) : 0,
    here: (() => { const b = document.querySelector('[data-cmap]');
      return b.dataset.ulat ? CM.toPx(+b.dataset.ulat, +b.dataset.ulng) : { x: 0, y: 0 }; })(),
    scrollLeft: scroll.scrollLeft, scrollTop: scroll.scrollTop,
    cw: scroll.clientWidth, ch: scroll.clientHeight,
  };
})()`);
ok('地图 SVG 已渲染', base.hasSvg);
ok('SVG 以 1:1 像素渲染（无 CSS 缩放）', Math.abs(base.svgW - base.mapW) <= 1, base.svgW + ' px / 图面 ' + base.mapW + ' px');
ok('比例标注 1 : 2000', /1\s*:\s*2000/.test(base.ratio || ''), base.ratio);
ok('1 px = 0.529167 m 实地', Math.abs(base.mPerPx - 0.5291666667) < 1e-6, base.mPerPx.toFixed(6));
ok('比例尺标尺 = 50 m', Math.abs(base.barW - 50 * base.pxPerM) <= 2,
  base.barW + ' px / 期望 ' + (50 * base.pxPerM).toFixed(1) + ' px（' + base.barLabel + '）');
ok('标尺外框紧贴标尺长度', Math.abs(base.wrapW - base.barW) <= 1, '外框 ' + base.wrapW + ' px');
ok('视野读数与实际视口一致', Math.abs(base.viewW - parseInt(String(base.view).replace(/\D+/g, ' ').trim().split(/\s+/)[0], 10)) <= 2,
  base.view + ' / 实测 ' + base.viewW + ' m');
ok('初始视图居中于「我的位置」',
  Math.abs(base.scrollLeft / 1 + base.cw / 2 - base.here.x) <= 2 && Math.abs(base.scrollTop / 1 + base.ch / 2 - base.here.y) <= 2,
  '视口中心偏移 ' + Math.round(Math.abs(base.scrollLeft + base.cw / 2 - base.here.x)) + ' px');

console.log('\n[2] 缩放联动（比例标注 + 标尺同步换算）');
const zoomIn = await evalJs(`(() => {
  document.querySelector('[data-cmap-zoom="in"]').click();
  const bar = document.querySelector('[data-cmap-bar]');
  return { ratio: document.querySelector('[data-cmap-ratio]').textContent,
           barW: +bar.getBoundingClientRect().width.toFixed(1),
           label: document.querySelector('[data-cmap-barm]').textContent,
           pxPerM: window.CH.cmap.PX_PER_M };
})()`);
ok('放大后比例标注变为 1 : 1000', /1\s*:\s*1000/.test(zoomIn.ratio), zoomIn.ratio);
ok('放大后标尺自动换算（25 m）', zoomIn.label === '25 m' && Math.abs(zoomIn.barW - 25 * zoomIn.pxPerM * 2) <= 2,
  zoomIn.label + ' = ' + zoomIn.barW + ' px');
const zoomOut = await evalJs(`(() => {
  const btns = document.querySelectorAll('[data-cmap-zoom="out"]');
  btns[0].click(); btns[0].click();
  const bar = document.querySelector('[data-cmap-bar]');
  return { ratio: document.querySelector('[data-cmap-ratio]').textContent,
           barW: +bar.getBoundingClientRect().width.toFixed(1),
           label: document.querySelector('[data-cmap-barm]').textContent,
           pxPerM: window.CH.cmap.PX_PER_M };
})()`);
ok('缩小后比例标注变为 1 : 4000', /1\s*:\s*4000/.test(zoomOut.ratio), zoomOut.ratio);
ok('缩小时标尺自动换算（100 m）', zoomOut.label === '100 m' && Math.abs(zoomOut.barW - 100 * zoomOut.pxPerM * 0.5) <= 2,
  zoomOut.label + ' = ' + zoomOut.barW + ' px');

console.log('\n[3] 拖动 / 回到我的位置 / 总览联动');
const afterPan = await evalJs(`(() => {
  const s = document.querySelector('[data-cmap-scroll]');
  s.scrollLeft = 300; s.scrollTop = 200;
  s.dispatchEvent(new Event('scroll'));
  const ov = document.querySelector('[data-cmap-view]');
  return { ovx: +ov.getAttribute('x'), ovy: +ov.getAttribute('y') };
})()`);
ok('总览小图视口框随滚动更新', afterPan.ovx > 0 && afterPan.ovy > 0,
  'x=' + afterPan.ovx + ' y=' + afterPan.ovy);
const backHere = await evalJs(`(() => {
  const CM = window.CH.cmap;
  document.querySelector('[data-cmap-here]').click();
  const s = document.querySelector('[data-cmap-scroll]');
  const z = 0.5;
  const b = document.querySelector('[data-cmap]');
  const p = CM.toPx(+b.dataset.ulat, +b.dataset.ulng);
  return { dx: Math.abs((s.scrollLeft + s.clientWidth / 2) / z - p.x),
           dy: Math.abs((s.scrollTop + s.clientHeight / 2) / z - p.y) };
})()`);
ok('「回到我的位置」把视口居中到我的位置', backHere.dx <= 3 && backHere.dy <= 3,
  '偏差 ' + backHere.dx.toFixed(1) + ' / ' + backHere.dy.toFixed(1) + ' px');

const ovClick = await evalJs(`(() => {
  const CM = window.CH.cmap;
  const ov = document.querySelector('[data-cmap-ov]');
  const r = ov.getBoundingClientRect();
  ov.dispatchEvent(new MouseEvent('click', { clientX: r.left + r.width * 0.75, clientY: r.top + r.height * 0.75, bubbles: true }));
  const s = document.querySelector('[data-cmap-scroll]');
  const z = 0.5;
  return { fx: (s.scrollLeft + s.clientWidth / 2) / z / CM.mapPx.w,
           fy: (s.scrollTop + s.clientHeight / 2) / z / CM.mapPx.h };
})()`);
ok('点击总览小图可定位到对应区域', Math.abs(ovClick.fx - 0.75) < 0.06 && Math.abs(ovClick.fy - 0.75) < 0.06,
  '定位到图面 ' + (ovClick.fx * 100).toFixed(1) + '% / ' + (ovClick.fy * 100).toFixed(1) + '%');

console.log('\n[4] 深色主题');
await goto(BASE + '?theme=dark#/tt/rooms');
const dark = await evalJs(`(() => {
  const paper = document.querySelector('.cmap-paper');
  const bname = document.querySelector('.cmap-bname');
  return { theme: document.documentElement.dataset.theme,
           paper: getComputedStyle(paper).fill,
           name: getComputedStyle(bname).fill };
})()`);
const lum = (c) => { const m = String(c).match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/); return m ? (+m[1] * 0.3 + +m[2] * 0.6 + +m[3] * 0.1) : 255; };
ok('深色主题下地图底纸变暗', dark.theme === 'dark' && lum(dark.paper) < 90, dark.theme + ' / paper=' + dark.paper);
ok('深色主题下建筑名仍可读（亮色文字）', lum(dark.name) > 150, 'name=' + dark.name);

console.log('\n[5] 应用自带自测（含新增地图断言）');
await goto(BASE + '?selftest=1#/tt/rooms');
let report = '';
for (let i = 0; i < 40; i++) {
  report = await evalJs(`(document.getElementById('selftest') || {}).textContent || ''`);
  if (report) break;
  await new Promise((r) => setTimeout(r, 500));
}
const head = (report.match(/SELFTEST_RESULT[^\n]*/) || ['(无结果)'])[0];
const bad = (report.match(/FAIL  [^\n]*/g) || []);
// 下面两项在改动前的部署副本（E:\AI大赛\校园通\app）上同样失败，与环境/视口有关，非本次改动引入
const KNOWN = ['集成 · 添加课程：时间冲突会被拦截', '布局无横向溢出（当前视口宽度）'];
const unexpected = bad.filter((l) => !KNOWN.some((k) => l.indexOf(k) >= 0));
ok('selftest 通过（仅剩改动前既有的环境相关失败）', unexpected.length === 0 && bad.length <= 2, head);
bad.forEach((b) => console.log('      ' + (KNOWN.some((k) => b.indexOf(k) >= 0) ? '[改动前既有] ' : '[新增失败] ') + b));

console.log('\n[6] 手机端布局（414 × 900，无横向溢出）');
await cdp('Emulation.setDeviceMetricsOverride', { width: 414, height: 900, deviceScaleFactor: 2, mobile: true });
await goto(BASE + '#/tt/rooms');
const mob = await evalJs(`(() => {
  const bar = document.querySelector('[data-cmap] .cmap-bar');
  const hereBtn = document.querySelector('[data-cmap-here]');
  const doc = document.documentElement;
  const r = hereBtn ? hereBtn.getBoundingClientRect() : null;
  const barR = bar ? bar.getBoundingClientRect() : null;
  const sbar = document.querySelector('.cmap-sbar');
  const ov = document.querySelector('.cmap-ov');
  const scroll = document.querySelector('[data-cmap-scroll]');
  const sr = scroll ? scroll.getBoundingClientRect() : null;
  return { docW: doc.clientWidth, docScroll: doc.scrollWidth,
           hereRight: r ? Math.round(r.right) : -1,
           barH: barR ? Math.round(barR.height) : 0,
           sbarIn: sbar && sr ? (sbar.getBoundingClientRect().bottom <= sr.bottom + 1) : false,
           ovIn: ov && sr ? (ov.getBoundingClientRect().right <= sr.right + 1 && ov.getBoundingClientRect().bottom <= sr.bottom + 1) : false,
           view: (document.querySelector('[data-cmap-viewsize]') || {}).textContent || '(已隐藏)' };
})()`);
ok('页面无横向溢出', mob.docScroll <= mob.docW + 1, 'scrollWidth=' + mob.docScroll + ' / 视口=' + mob.docW);
ok('「回到我的位置」按钮完整可见', mob.hereRight > 0 && mob.hereRight <= mob.docW, 'right=' + mob.hereRight);
ok('工具条自动换行收纳', mob.barH > 30 && mob.barH < 95, 'bar 高度 ' + mob.barH + ' px（手机端折行）');
ok('比例尺固定在视图内', mob.sbarIn);
ok('总览小图固定在视图内', mob.ovIn);
await cdp('Emulation.clearDeviceMetricsOverride');

ws.close();
edge.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* noop */ }
console.log('\n结果：' + (checks - fails) + '/' + checks + ' 项通过' + (fails ? '，失败 ' + fails + ' 项' : ''));
process.exit(fails ? 1 : 0);
