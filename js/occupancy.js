/* 校园通 · 教室占用计算
 * 占用来源：① 我的课表 ② 社团活动 ③ 其他班级课程（按房间/日期/节次确定性生成，保证同一日期结果稳定）
 */
(function (CH) {
  'use strict';
  const U = CH.util, D = CH.DATA;

  function threshold(type) {
    if (type === '自习室') return 16;
    if (type === '研讨间') return 24;
    if (type === '机房') return 44;
    if (type === '活动室') return 30;
    return 40;
  }

  function pick(arr, seed) { return arr[U.hash(seed) % arr.length]; }

  /** 其他班级占用的假课程信息 */
  function genEvent(room, dk, p) {
    const name = pick(D.COURSE_POOL, room.id + '|' + dk + '|' + p);
    const teacher = pick(D.TEACHER_POOL, 't' + room.id + p + dk);
    return { kind: 'class', title: name, meta: teacher + ' · 其他班级' };
  }

  /** 指定日期下，所有真实占用（我的课程 + 社团活动） */
  function eventsOn(date, data) {
    const dow = U.dayIdx(date);
    const week = U.weekOfDate(date);
    const out = [];
    (data.courses || []).forEach((c) => {
      if (c.day !== dow || c.weeks.indexOf(week) < 0) return;
      for (let k = 0; k < (c.span || 1); k++) {
        if (c.start + k < 5) out.push({ roomId: c.room, p: c.start + k, kind: 'class', title: c.name, meta: c.teacher + ' · 我的课程', mine: true });
      }
    });
    (data.activities || []).forEach((a) => {
      if (a.day !== dow || a.weeks.indexOf(week) < 0) return;
      for (let k = 0; k < (a.span || 1); k++) {
        if (a.start + k < 5) out.push({ roomId: a.room, p: a.start + k, kind: 'activity', title: a.title, meta: a.club, actId: a.id });
      }
    });
    return out;
  }

  /** 房间 × 5 个节次的占用矩阵 */
  function grid(date, data) {
    const dk = U.dateKey(date);
    const map = {};
    D.ROOMS.forEach((r) => { map[r.id] = [null, null, null, null, null]; });

    // ① 其他班级课程
    D.ROOMS.forEach((r) => {
      const th = threshold(r.type);
      for (let p = 0; p < 5; p++) {
        if (U.hash(r.id + '|' + dk + '|' + p) % 100 < th) map[r.id][p] = genEvent(r, dk, p);
      }
    });
    // ② 真实占用覆盖（优先级更高）
    eventsOn(date, data).forEach((ev) => {
      if (map[ev.roomId]) map[ev.roomId][ev.p] = ev;
    });
    return map;
  }

  /** 某房间某节次的状态 */
  function statusFor(roomId, date, p, data) {
    const g = grid(date, data);
    return (g[roomId] || [])[p] || null;
  }

  /** 该房间当天连续空闲的节次（返回 [{p, label}]） */
  function freePeriods(roomId, date, data) {
    const g = grid(date, data);
    const row = g[roomId] || [];
    const out = [];
    for (let p = 0; p < 5; p++) if (!row[p]) out.push(p);
    return out;
  }

  CH.occ = { grid, eventsOn, statusFor, freePeriods, genEvent };
})(window.CH);
