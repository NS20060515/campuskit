/* 校园通 · 主控制器：导航 / 路由 / 主题 / 头部 */
(function (CH) {
  'use strict';
  const U = CH.util, UI = CH.ui, S = CH.store;

  const NAV = [
    { id: 'tt', label: '课表 · 教室', icon: 'calendar', href: '#/tt' },
    { id: 'lost', label: '失物招领', icon: 'lost', href: '#/lost' },
    { id: 'qa', label: '校园问答', icon: 'chat', href: '#/qa' },
  ];

  let current = null;
  let container = null;
  let navEl = null;
  let lastStorageOk = true;
  let shareInited = false;
  let shareTimer = null;

  CH.setHeader = function (title, sub) {
    const t = document.getElementById('pageTitle');
    const s = document.getElementById('pageSub');
    if (t) t.textContent = title;
    if (s) s.textContent = sub || '';
    document.title = title + ' · 校园通';
  };

  function parseHash() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return { mod: parts[0] || 'tt', sub: parts[1] || '' };
  }

  function badgeFor(id) {
    if (id === 'lost') return S.state.lost.filter((i) => i.status === 'open').length;
    if (id === 'qa') return S.state.questions.filter((q) => q.status === 'open').length;
    return 0;
  }

  function buildNav() {
    navEl.innerHTML = NAV.map((n) => {
      const b = badgeFor(n.id);
      return '<a class="nav-item' + (n.id === current ? ' active' : '') + '" href="' + n.href + '">' +
        UI.icon(n.icon) + '<span>' + n.label + '</span>' +
        (b ? '<span class="nav-badge">' + b + '</span>' : '') +
        '</a>';
    }).join('');
  }

  function syncNav() {
    navEl.querySelectorAll('.nav-item').forEach((a) => {
      const id = (a.getAttribute('href') || '').replace('#/', '');
      a.classList.toggle('active', id === current);
    });
    buildNav();
  }

  function route() {
    const p = parseHash();
    const id = CH.views[p.mod] ? p.mod : 'tt';
    if (current !== id) {
      current = id;
      container.innerHTML = '';
      CH.views[id].mount(container, p.sub);
    } else if (CH.views[id].tab) {
      CH.views[id].tab(p.sub);
    }
    syncNav();
  }

  function onStoreChange() {
    if (current && CH.views[current]) CH.views[current].render();
    buildNav();
    if (!S.storageOk && lastStorageOk) {
      lastStorageOk = false;
      UI.toast('本地存储空间不足，这次的修改可能没有保存', 'err');
    } else if (S.storageOk) {
      lastStorageOk = true;
    }
  }

  /* ---------------- 主题 ---------------- */
  function effectiveTheme() {
    if (S.state && S.state.theme) return S.state.theme;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme() {
    const t = effectiveTheme();
    document.documentElement.dataset.theme = t;
    const btn = document.getElementById('themeBtn');
    if (btn) {
      btn.innerHTML = UI.icon(t === 'dark' ? 'sun' : 'moon');
      btn.title = t === 'dark' ? '切换到浅色模式' : '切换到深色模式';
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0d1017' : '#f5f6fb');
  }
  function toggleTheme() {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    S.update((s) => { s.theme = next; });
    applyTheme();
    UI.toast(next === 'dark' ? '已切换到深色模式' : '已切换到浅色模式');
  }

  /* ---------------- 个人资料 ---------------- */
  function profileModal() {
    const p = S.state.profile;
    const myLost = S.state.lost.filter((i) => i.mine).length;
    const myQ = S.state.questions.filter((q) => q.author === p.name).length;
    const myAct = S.state.activities.filter((a) => a.mine).length;
    const body =
      '<div class="row" style="gap:14px;align-items:center;margin-bottom:16px">' +
        '<div class="avatar" style="width:54px;height:54px;font-size:20px">' + U.esc(p.initial) + '</div>' +
        '<div><b style="font-size:16px">' + U.esc(p.name) + '</b><p class="muted sm">' + U.esc(p.college) + '</p></div>' +
      '</div>' +
      '<div class="kpis" style="margin-bottom:0">' +
        '<div class="kpi"><div class="v">' + S.state.courses.length + '<small>节</small></div><div class="l">本学期课程</div></div>' +
        '<div class="kpi"><div class="v">' + myLost + '<small>条</small></div><div class="l">我发布的失物</div></div>' +
        '<div class="kpi"><div class="v">' + myQ + '<small>个</small></div><div class="l">我提的问题</div></div>' +
        '<div class="kpi"><div class="v">' + myAct + '<small>场</small></div><div class="l">已报名活动</div></div>' +
      '</div>' +
      '<p class="hint">演示账号，数据保存在浏览器 localStorage 中。';
    UI.modal({
      title: '个人资料',
      body,
      actions: '<button class="btn danger" data-reset type="button">' + UI.icon('refresh') + '恢复演示数据</button>' +
               '<button class="btn ghost" data-close type="button">关闭</button>',
      onMount(el, close) {
        el.querySelector('[data-reset]').addEventListener('click', () => { close(); resetAll(); });
      },
    });
  }

  async function resetAll() {
    const ok = await UI.confirm({
      title: '恢复演示数据',
      text: '将清空本机的课表、失物、问答等修改，恢复到初始演示数据。此操作不可撤销。',
      ok: '恢复', danger: true,
    });
    if (!ok) return;
    S.reset();
    applyTheme();
    UI.toast('已恢复初始演示数据');
    route();
  }

  /* ---------------- 手机访问（桌面版内建内网服务） ---------------- */
  function isDesktopApp() {
    return !!(window.chrome && window.chrome.webview && window.chrome.webview.postMessage);
  }
  function safeParse(s) {
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  function shareModal() {
    if (!isDesktopApp()) {
      CH.ui.modal({
        title: '在手机上使用',
        sub: '两种方式，任选一种',
        body:
          '<p style="font-size:13.5px;line-height:1.8"><b>方式一（推荐）：</b>用桌面版「校园通.exe」打开本应用，' +
          '点侧边栏的「手机访问」，会给出一个局域网地址，手机连同一个 WiFi 输入该地址即可。</p>' +
          '<p style="font-size:13.5px;line-height:1.8;margin-top:10px"><b>方式二：</b>把本文件夹放到任意 HTTPS 静态托管上，' +
          '手机打开后选择「添加到主屏幕」，就能像 App 一样离线使用。</p>' +
          '<p class="hint">说明：手机端数据独立保存在手机浏览器里，不会与电脑同步；' +
          'http 环境下浏览器会禁用设备定位，可手动选择位置。</p>',
        actions: '<button class="btn ghost" data-close type="button">知道了</button>',
      });
      return;
    }

    CH.ui.modal({
      title: '手机访问',
      sub: '让手机连上同一个 WiFi，再扫描下面的二维码',
      body: '<div data-share-box data-pending="1"><p class="muted sm">正在启动内网共享服务…</p></div>',
      actions: '<button class="btn ghost" data-close type="button">关闭</button>',
    });

    if (!shareInited) {
      window.chrome.webview.addEventListener('message', function (ev) {
        const data = typeof ev.data === 'string' ? safeParse(ev.data) : ev.data;
        if (data && data.type === 'share') renderShareResult(data);
      });
      shareInited = true;
    }
    try { window.chrome.webview.postMessage('share'); } catch (e) { /* noop */ }

    // 超时兜底：只在仍处于「等待中」状态时才报错，避免覆盖已成功的结果
    if (shareTimer) { clearTimeout(shareTimer); shareTimer = null; }
    shareTimer = setTimeout(function () {
      const box = document.querySelector('[data-share-box]');
      if (box && box.hasAttribute('data-pending')) renderShareResult({ ok: false, url: '' });
    }, 4000);
  }

  /** 生成二维码 SVG；编码器异常时返回空串，保证弹层仍可用 */
  function qrSvgFor(url) {
    try {
      if (!CH.qr) return '';
      return CH.qr.svg(url, { moduleSize: 4, margin: 3 });
    } catch (e) {
      console.warn('[校园通] 二维码生成失败', e);
      return '';
    }
  }

  function renderShareResult(data) {
    const box = document.querySelector('[data-share-box]');
    if (!box) return;
    box.removeAttribute('data-pending');
    if (shareTimer) { clearTimeout(shareTimer); shareTimer = null; }
    if (!data || !data.ok || !data.url) {
      box.innerHTML = '<p class="muted" style="font-size:13.5px">未能取得局域网地址。可能是防火墙拦截，' +
        '或电脑当前未连接 WiFi / 网线。可在 Windows 防火墙里允许「校园通」的专用网络访问后重试。</p>';
      return;
    }
    box.innerHTML =
      '<div class="share-qr">' + qrSvgFor(data.url) + '</div>' +
      '<p class="muted sm" style="text-align:center;margin-top:2px">用手机相机或微信「扫一扫」直接打开</p>' +
      '<div class="share-url">' + U.esc(data.url) + '</div>' +
      '<div class="row" style="margin-top:10px">' +
        '<button class="btn primary sm" data-copy-url type="button">' + UI.icon('copy', 'sm') + '复制网址</button>' +
        '<button class="btn ghost sm" data-test-url type="button">在本机浏览器测试打开</button>' +
      '</div>' +
      '<p class="hint">手机浏览器菜单选「添加到主屏幕」，即可像 App 一样全屏使用，断网也能打开。</p>' +
      '<p class="hint">局域网 http 无法触发 PWA 安装（浏览器要求 HTTPS），但功能完全可用；' +
        '设备定位在此环境下会被浏览器禁用，可手动选择位置。</p>' +
      '<p class="hint">同一 WiFi 下的其他设备也能访问该地址，关闭软件即停止共享。</p>';

    const copyBtn = box.querySelector('[data-copy-url]');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        U.copy(data.url).then(function (ok) {
          UI.toast(ok ? '已复制，去手机上粘贴打开' : '复制失败，请手动输入', ok ? '' : 'err');
        });
      });
    }
    const testBtn = box.querySelector('[data-test-url]');
    if (testBtn) {
      testBtn.addEventListener('click', function () { window.open(data.url, '_blank'); });
    }
  }

  /* ---------------- 离线支持（PWA） ---------------- */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // file:// 不支持；局域网 http 属不安全来源会被浏览器拒绝，静默忽略即可
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    navigator.serviceWorker.register('sw.js').then(function () {
      console.log('[校园通] 离线缓存已启用');
    }).catch(function (e) {
      console.warn('[校园通] 离线缓存未启用（需要 HTTPS 或 localhost）：' + (e && e.message ? e.message : e));
    });
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    S.init();
    container = document.getElementById('view');
    navEl = document.getElementById('nav');

    // 支持 ?theme=dark / ?theme=light 临时指定主题（用于演示与截图，不写入本地存储）
    // 注意：必须在 applyTheme() 之前读取，否则主题不会生效
    try {
      const qs = new URLSearchParams(location.search);
      const t = qs.get('theme');
      if (t === 'dark' || t === 'light') S.state.theme = t;
    } catch (e) { /* noop */ }
    applyTheme();
    current = null;
    if (!location.hash) history.replaceState(null, '', '#/tt');
    route();

    window.addEventListener('hashchange', route);
    S.subscribe(onStoreChange);

    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    const pb = document.getElementById('profileBtn');
    if (pb) {
      pb.textContent = S.state.profile.initial;
      pb.addEventListener('click', profileModal);
    }
    const rb = document.getElementById('resetBtn');
    if (rb) rb.addEventListener('click', resetAll);
    const sb = document.getElementById('shareBtn');
    if (sb) sb.addEventListener('click', shareModal);

    const now = new Date();
    const pill = document.getElementById('datePill');
    if (pill) pill.textContent = now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · ' + U.DAYS[U.dayIdx(now) - 1];

    registerServiceWorker();
    if (CH.install) CH.install.init();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.CH);
