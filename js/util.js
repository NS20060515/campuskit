/* 校园通 · 通用工具：日期 / 周次 / 地理 / 文本 */
window.CH = window.CH || {};
(function (CH) {
  'use strict';

  const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const PERIODS = [
    { label: '1-2 节', time: '08:00–09:40', start: 480, end: 580 },
    { label: '3-4 节', time: '10:10–11:50', start: 610, end: 710 },
    { label: '5-6 节', time: '14:00–15:40', start: 840, end: 940 },
    { label: '7-8 节', time: '16:10–17:50', start: 970, end: 1070 },
    { label: '9-10 节', time: '19:00–20:40', start: 1140, end: 1240 },
  ];
  const STOP = new Set(['的', '了', '我', '你', '他', '她', '在', '是', '和', '有', '就', '都', '也', '很', '吧', '吗', '啊', '一个', '一下', '今天', '昨天', '前天', '请问', '求', '谢谢', '帮忙', '这个', '那个', '什么', '怎么', '可以', '没有', '现在', '时候', '东西', '捡到', '丢失', '失主']);

  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const uid = (p) => (p || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const dateKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseKey = (k) => { const p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const dayIdx = (d) => ((d.getDay() + 6) % 7) + 1; // 周一 = 1
  function startOfWeek(d) { const x = startOfDay(d); return addDays(x, -(dayIdx(x) - 1)); }

  // 学期推算：秋季以 9/1 所在周的周一为第 1 周，春季以 2/23 所在周的周一为第 1 周
  function semester(now) {
    now = now || new Date();
    const y = now.getFullYear(), m = now.getMonth();
    let start;
    if (m >= 7 || m <= 0) start = startOfWeek(new Date(m >= 7 ? y : y - 1, 8, 1));
    else start = startOfWeek(new Date(y, 1, 23));
    const days = Math.floor((startOfDay(now) - start) / 86400000);
    return { week: clamp(Math.floor(days / 7) + 1, 1, 18), start };
  }
  function weekOfDate(d) {
    const start = semester().start;
    return Math.floor((startOfDay(d) - start) / 86400000 / 7) + 1;
  }
  const weekStart = (w) => addDays(semester().start, (w - 1) * 7);
  function weekRangeText(w) {
    const s = weekStart(w), e = addDays(s, 6);
    return (s.getMonth() + 1) + '月' + s.getDate() + '日 – ' + (e.getMonth() + 1) + '月' + e.getDate() + '日';
  }

  function relTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60e3) return '刚刚';
    if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
    if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
    if (diff < 7 * 86400e3) return Math.floor(diff / 86400e3) + ' 天前';
    const d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function fmtDateTime(ts) {
    const d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function nowPeriod() {
    const d = new Date(), t = d.getHours() * 60 + d.getMinutes();
    for (let i = 0; i < PERIODS.length; i++) if (t >= PERIODS[i].start - 10 && t < PERIODS[i].end) return i;
    return -1;
  }

  const R = 6371000;
  function haversine(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    const rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  const walkMin = (m) => Math.max(1, Math.round(m / 1.25 / 60));
  function fmtDist(m) {
    if (m == null || !isFinite(m)) return '—';
    return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km';
  }

  // 文本特征：中文二元组 + 英文词
  function tokens(str) {
    const s = String(str || '').toLowerCase();
    const out = new Set();
    (s.match(/[a-z0-9]+/g) || []).forEach((w) => { if (w.length > 1 && !STOP.has(w)) out.add(w); });
    (s.match(/[一-龥]+/g) || []).forEach((run) => {
      for (let i = 0; i < run.length - 1; i++) {
        const g = run.slice(i, i + 2);
        if (!STOP.has(g)) out.add(g);
      }
    });
    return out;
  }
  function overlap(a, b) {
    let n = 0;
    a.forEach((t) => { if (b.has(t)) n++; });
    return n;
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { /* noop */ }
      ta.remove(); return ok;
    }
  }

  CH.util = {
    DAYS, PERIODS, STOP,
    pad, esc, clamp, uid, hash,
    startOfDay, addDays, dateKey, parseKey, dayIdx, startOfWeek,
    semester, weekOfDate, weekStart, weekRangeText,
    relTime, fmtDateTime, nowPeriod,
    haversine, walkMin, fmtDist,
    tokens, overlap, copy,
  };
})(window.CH);
