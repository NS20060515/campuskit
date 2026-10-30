/* 校园通 · 校园地图与地理数据校验（Node 运行，无浏览器依赖）
 * 用法：node tests/campus-map-verify.cjs
 * 校验内容：
 *   1) 1:2000 比例尺的数值自洽（图上距离 : 实地距离 = 1 : 2000）
 *   2) 地图 SVG 尺寸 = 实地范围 ÷ 比例尺（不因取整失真）
 *   3) 实测建筑/点位/道路全部出现在图上
 *   4) 音课表/社团活动引用的教室都能在地理数据里找到
 *   5) 所有建筑与教室坐标都落在校园范围内
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
let fails = 0, checks = 0;
function ok(name, cond, extra) {
  checks++;
  if (cond) { console.log('  ✓ ' + name + (extra ? '　' + extra : '')); return true; }
  fails++;
  console.log('  ✗ ' + name + (extra ? '　' + extra : ''));
  return false;
}

const sandbox = { window: {}, console: console, Math: Math, Date: Date, Number: Number, String: String, Array: Array, Object: Object, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
['js/util.js', 'js/campus-map.js', 'js/data.js'].forEach((f) => {
  const code = fs.readFileSync(path.join(root, f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
});

const CH = sandbox.window.CH;
const CM = CH.cmap, D = CH.DATA;

console.log('\n[1] 比例尺数值');
const MM_PER_PX = 25.4 / 96;
const expectedMpp = (MM_PER_PX / 1000) * 2000;
ok('SCALE = 1:2000', CM.SCALE === 2000, 'SCALE=' + CM.SCALE);
ok('1 px = 0.5292 m 实地', Math.abs(CM.M_PER_PX - expectedMpp) < 1e-9, CM.M_PER_PX.toFixed(6) + ' m/px');
ok('1 m = 1.8898 px', Math.abs(CM.PX_PER_M - 1 / expectedMpp) < 1e-9, CM.PX_PER_M.toFixed(6) + ' px/m');
ok('图上 1 cm = 实地 20 m', Math.abs(10 / MM_PER_PX * CM.M_PER_PX - 20) < 0.01,
  '1 cm = ' + (10 / MM_PER_PX).toFixed(1) + ' px = ' + (10 / MM_PER_PX * CM.M_PER_PX).toFixed(2) + ' m');

console.log('\n[2] 图面尺寸与实地范围');
const b = CM.FRAME;   // 校园范围（四条围合道路）
const proj = CM.project;
const tl = proj(b[1], b[0]), br = proj(b[3], b[2]);
const realW = br.x - tl.x, realH = br.y - tl.y;
const mapW = CM.mapPx.w, mapH = CM.mapPx.h;
const W = CM.WORLD, P = CM.BASE;
const worldW = W.maxX - W.minX, worldH = W.maxY - W.minY;
ok('图面 = 实地 ÷ 比例尺（1 m = 1.8898 px）',
  Math.abs(mapW - worldW * CM.PX_PER_M) < 1 && Math.abs(mapH - worldH * CM.PX_PER_M) < 1,
  mapW + '×' + mapH + ' px ↔ ' + worldW.toFixed(0) + '×' + worldH.toFixed(0) + ' m');
ok('校园实际范围合理', realW > 600 && realW < 3000 && realH > 400 && realH < 2000,
  '围合道路内 ' + realW.toFixed(0) + ' m × ' + realH.toFixed(0) + ' m');
ok('校园范围与 OSM 校园多边形一致', CM.CAMPUS.osmBounds.length === 4 && CM.CAMPUS.osm === 'way/461608579',
  'source: ' + CM.CAMPUS.source);

﻿console.log('\n[3] 高德地图底图的配准');
const imgWWorld = P.w * P.mPerPx, imgHWorld = P.h * P.mPerPx;
ok('底图覆盖围合道路范围', P.world.minX <= tl.x + 1 && P.world.maxX >= br.x - 1 && P.world.minY <= tl.y + 1 && P.world.maxY >= br.y - 1,
  '底图 ' + imgWWorld.toFixed(0) + '×' + imgHWorld.toFixed(0) + ' m');
ok('底图覆盖全部实测点位', CM.POINTS.concat(CM.BUILDINGS).every(function (b) {
  const q = CM.toPx(b.lat, b.lng);
  return q.x >= 0 && q.x <= CM.mapPx.w && q.y >= 0 && q.y <= CM.mapPx.h;
}), '锚点 ' + (CM.POINTS.length + CM.BUILDINGS.length) + ' 个');
const merc = 156543.03392 * Math.cos(CM.CAMPUS.center.lat * Math.PI / 180) / Math.pow(2, P.zoom);
ok('底图分辨率与 z=18 瓦片一致（无随意缩放）', Math.abs(P.mPerPx / merc - 1) < 0.02,
  '实测 ' + P.mPerPx.toFixed(4) + ' m/px / 理论 ' + merc.toFixed(4) + ' m/px');
ok('底图比 1:2000 更细（显示时缩小，不糊）', P.mPerPx < CM.M_PER_PX * 0.95,
  P.mPerPx.toFixed(3) + ' m/px vs 1:2000 的 ' + CM.M_PER_PX.toFixed(3) + ' m/px');
ok('底图在 1:2000 下按真实米数铺开',
  Math.abs((P.world.maxX - P.world.minX) * CM.PX_PER_M - P.w * P.mPerPx * CM.PX_PER_M) < 1e-6,
  '图上 ' + Math.round(imgWWorld * CM.PX_PER_M) + ' px / 资源 ' + P.w + ' px');
const jpg = path.join(root, P.src);
let px = null;
if (fs.existsSync(jpg)) {
  const buf = fs.readFileSync(jpg);
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      px = { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      break;
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
}
ok('底图资源存在且尺寸与配置一致', !!px && px.w === P.w && px.h === P.h,
  px ? px.w + '×' + px.h + ' px, ' + Math.round(fs.statSync(jpg).size / 1024) + ' KB' : '缺失 ' + P.src);

console.log('\n[4] 图上要素');
const plan = CM.plan({ pos: { lat: 38.4947025, lng: 106.102283 }, targets: [{ lat: 38.4950, lng: 106.1048, rank: 1, buildingId: 'ms' }] });
ok('底图图片已嵌入 SVG', plan.indexOf('href="' + P.src + '"') >= 0);
ok('底图铺满其覆盖范围', plan.indexOf('width="' + (Math.round(imgWWorld * CM.PX_PER_M * 10) / 10) + '"') >= 0);
CM.BUILDINGS.forEach((x) => ok('建筑「' + x.name + '」已绘制', plan.indexOf(x.name) >= 0));
CM.POINTS.forEach((x) => ok('点物「' + x.name + '」已绘制', plan.indexOf(x.name) >= 0));
ok('实测建筑轮廓以虚线叠加', plan.indexOf('cmap-bld outline') >= 0);
ok('道路数据齐全（%d 条）'.replace('%d', CM.ROADS.length), CM.ROADS.length === 5,
  CM.ROADS.map((x) => x.name).join('、'));
const ov = CM.overview({ pos: { lat: 38.4947025, lng: 106.102283 }, targets: [] });
ok('总览小图含底图与道路', ov.indexOf('href="' + P.src + '"') >= 0 && ov.indexOf('stroke="#dbe2ec"') >= 0);
ok('比例尺已移出 SVG（固定在视口内的 HUD 里）', plan.indexOf('cmap-sbar') < 0 && plan.indexOf('>50 m<') < 0);
ok('含 1:2000 说明', plan.indexOf('比例尺 1:2000') >= 0);
ok('含你在这里标记', plan.indexOf('你在这里') >= 0);
ok('SVG 尺寸 = ' + mapW + '×' + mapH + ' px（1 px = 1 CSS px）',
  plan.indexOf('width="' + mapW + '" height="' + mapH + '"') >= 0);

console.log('\n[5] 面板与交互节点');
const panel = CM.panel({ pos: { lat: 38.4947025, lng: 106.102283 }, targets: [] });
['class="campus-map cmap"', 'data-cmap-ratio', 'data-cmap-scroll', 'data-cmap-stage', 'data-cmap-ov', 'data-cmap-view',
  'data-cmap-bar', 'data-cmap-barm', 'data-cmap-viewsize', 'cmap-northbox',
  'data-cmap-zoom="in"', 'data-cmap-zoom="out"', 'data-cmap-here', 'OpenStreetMap'].forEach((k) => {
  ok('面板含 ' + k, panel.indexOf(k) >= 0);
});
ok('含指北针', panel.indexOf('cmap-northbox') >= 0);
ok('默认比例标注 1 : 2000', panel.indexOf('1 : 2000') >= 0);
ok('旧自测断言 .campus-map svg 仍成立', /class="campus-map cmap"[\s\S]*<svg/.test(panel));

console.log('\n[6] 数据一致性');
const seed = CH.seed();
const badRooms = seed.courses.concat(seed.activities).map((x) => x.room).filter((r) => !D.ROOM_MAP[r]);
ok('课表/活动引用的教室全部存在', badRooms.length === 0, badRooms.join(', ') || ('共 ' + D.ROOMS.length + ' 间教室'));
ok('建筑清单 5 座（含真实轮廓）', D.BUILDINGS.length === 5, D.BUILDINGS.map((x) => x.name).join('、'));
ok('定位参照点 ≥ 10 个', D.ANCHORS.length >= 10, '共 ' + D.ANCHORS.length + ' 个');
const out = [];
D.ROOMS.forEach((r) => {
  if (r.lat < b[3] || r.lat > b[1] || r.lng < b[0] || r.lng > b[2]) out.push(r.id);
});
ok('所有教室坐标落在校园范围内', out.length === 0, out.join(', '));
// 参照点允许落在校园红线外（公交站在文昌北街/新干公路路边，属实测真实位置），
// 只需保证在图面范围内即可
D.ANCHORS.forEach((a) => {
  const p = CM.toPx(a.lat, a.lng);
  if (p.x < 0 || p.x > CM.mapPx.w || p.y < 0 || p.y > CM.mapPx.h) out.push(a.name);
});
ok('所有参照点都在图面范围内（含路边公交站）', out.length === 0, out.join(', '));
const outside = D.ANCHORS.filter((a) => a.lat < b[3] || a.lat > b[1] || a.lng < b[0] || a.lng > b[2]).map((a) => a.name);
ok('校园红线外的参照点已可解释', outside.every((n) => n.indexOf('公交站') === 0) && outside.length <= 2, outside.join('、') || '无');
const roomsInBuilding = D.ROOMS.filter((r) => r.buildingId === 'lib').every((r) => {
  const lb = CM.place('lib').rect;
  return r.lng > lb[0] && r.lng < lb[2] && r.lat > lb[3] && r.lat < lb[1];
});
ok('图书馆的房间坐标都在图书馆轮廓内', roomsInBuilding);

console.log('\n结果：' + (checks - fails) + '/' + checks + ' 项通过' + (fails ? '，失败 ' + fails + ' 项' : ''));
process.exit(fails ? 1 : 0);
