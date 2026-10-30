/* 校园通 · 通用 UI：图标 / 提示 / 弹层 */
(function (CH) {
  'use strict';

  function icon(name, cls) {
    return '<svg class="ico ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  function toast(msg, type) {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    }, 2400);
  }

  /**
   * 通用弹层。opts: { title, sub, body, actions, wide, onMount(el, close) }
   * 返回 close 函数。
   */
  function modal(opts) {
    opts = opts || {};
    const root = document.getElementById('modalRoot');
    const back = document.createElement('div');
    back.className = 'backdrop';
    back.innerHTML =
      '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal-head">' +
          '<div><h3>' + (opts.title || '') + '</h3>' + (opts.sub ? '<p>' + opts.sub + '</p>' : '') + '</div>' +
          '<button class="icon-btn" data-close type="button" aria-label="关闭">' + icon('x') + '</button>' +
        '</div>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        (opts.actions ? '<div class="modal-foot">' + opts.actions + '</div>' : '') +
      '</div>';
    root.appendChild(back);
    document.body.classList.add('modal-open');

    function close() {
      back.remove();
      if (!root.children.length) document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', (e) => {
      if (e.target === back || e.target.closest('[data-close]')) close();
    });
    if (typeof opts.onMount === 'function') opts.onMount(back, close);
    const focusable = back.querySelector('input, select, textarea, button:not([data-close])');
    if (focusable) focusable.focus({ preventScroll: true });
    return close;
  }

  /** 确认框 → Promise<boolean> */
  function confirm(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const close = modal({
        title: opts.title || '确认操作',
        body: '<p class="confirm-text">' + (opts.text || '') + '</p>',
        actions: '<button class="btn ghost" data-close type="button">取消</button>' +
                 '<button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-ok type="button">' + (opts.ok || '确定') + '</button>',
        onMount(el, cls) {
          el.querySelector('[data-ok]').addEventListener('click', () => { finish(true); cls(); });
          el.addEventListener('click', (e) => {
            if (e.target === el || e.target.closest('[data-close]')) finish(false);
          });
        },
      });
      void close;
    });
  }

  function empty(iconName, title, text) {
    return '<div class="empty">' +
      (iconName ? '<div class="empty-ico">' + icon(iconName, 'lg') + '</div>' : '') +
      '<b>' + title + '</b>' +
      (text ? '<p>' + text + '</p>' : '') +
      '</div>';
  }

  CH.ui = { icon, toast, modal, confirm, empty };
})(window.CH);
