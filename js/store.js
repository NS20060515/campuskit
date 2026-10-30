/* 校园通 · 状态管理与本地持久化 */
(function (CH) {
  'use strict';

  const KEY = 'campushub.state.v2';
  const subs = [];

  function migrate(s) {
    const base = CH.seed();
    if (!s || typeof s !== 'object') return base;
    return {
      version: 2,
      theme: s.theme === 'dark' || s.theme === 'light' ? s.theme : null,
      profile: Object.assign({}, base.profile, s.profile || {}),
      loc: Object.assign({}, base.loc, s.loc || {}),
      courses: Array.isArray(s.courses) ? s.courses : base.courses,
      activities: Array.isArray(s.activities) ? s.activities : base.activities,
      lost: Array.isArray(s.lost) ? s.lost : base.lost,
      questions: Array.isArray(s.questions) ? s.questions : base.questions,
    };
  }

  let state = null;
  let storageOk = true;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return migrate(JSON.parse(raw));
    } catch (e) {
      console.warn('[校园通] 读取本地数据失败，已使用演示数据', e);
      return null;
    }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      storageOk = true;
      return true;
    } catch (e) {
      storageOk = false;
      console.warn('[校园通] 保存失败（可能是本地存储空间不足）', e);
      return false;
    }
  }

  function emit() {
    subs.forEach((fn) => {
      try { fn(state); } catch (e) { console.error('[校园通] 视图刷新出错', e); }
    });
  }

  CH.store = {
    init() { state = load() || CH.seed(); },
    get state() { return state; },
    get storageOk() { return storageOk; },
    /** 修改状态并持久化 + 通知视图 */
    update(mutator) {
      if (typeof mutator === 'function') mutator(state);
      const ok = persist();
      emit();
      return ok;
    },
    save() { const ok = persist(); emit(); return ok; },
    subscribe(fn) { subs.push(fn); },
    reset() {
      state = CH.seed();
      persist();
      emit();
    },
    /** 生成一个不与现有课程冲突的课程 id */
    nextCourseId() {
      let i = state.courses.length + 1, id;
      do { id = 'c' + String(i).padStart(2, '0'); i++; } while (state.courses.some((c) => c.id === id));
      return id;
    },
  };
})(window.CH);
