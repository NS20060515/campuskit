/* 校园通 · 「安装到桌面」交互
 *
 * 各平台能力不同，这里做统一入口 + 分平台指引：
 *   · Android Chrome / Edge：监听 beforeinstallprompt，可直接一键安装（需 HTTPS 或 localhost）
 *   · Android 上的局域网 http：浏览器不提供安装，给出手动「添加到主屏幕」步骤
 *   · iOS Safari：没有 beforeinstallprompt，只能手动「分享 → 添加到主屏幕」；
 *     由于 index.html 里已声明 apple-mobile-web-app-capable，启动后是独立窗口（无 Safari 界面）
 *   · 桌面 Chrome / Edge：地址栏会出安装图标，也可从这里触发
 */
window.CH = window.CH || {};
(function (CH) {
  'use strict';

  var DISMISS_KEY = 'campushub.installHintDismissed';
  var deferred = null;
  var banner = null;

  function ua() { return navigator.userAgent || ''; }
  function isIOS() {
    return /iPad|iPhone|iPod/.test(ua()) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isAndroid() { return /Android/i.test(ua()); }

  /** 识别具体浏览器：国产浏览器 UA 里都带 Chrome/，直接判 Chrome 会给错菜单说明 */
  function browserName() {
    var u = ua();
    if (/MicroMessenger/i.test(u)) return 'wechat';
    if (/VivoBrowser/i.test(u)) return 'vivo';
    if (/HuaweiBrowser|HBPC|HarmonyOS|Huawei/i.test(u)) return 'huawei';
    if (/MQQBrowser|QQBrowser|QQ\//i.test(u)) return 'qq';
    if (/UCBrowser|UBrowser|UCWEB/i.test(u)) return 'uc';
    if (/MiuiBrowser|XiaoMi/i.test(u)) return 'miui';
    if (/HeyTapBrowser|OppoBrowser|OPPO/i.test(u)) return 'oppo';
    if (/SamsungBrowser/i.test(u)) return 'samsung';
    if (/baiduboxapp|BaiduBrowser|bdapp/i.test(u)) return 'baidu';
    if (/EdgA?\//i.test(u)) return 'edge';
    if (/Firefox|FxiOS/i.test(u)) return 'firefox';
    if (/CriOS/i.test(u)) return 'chrome';
    if (/Chrome\//i.test(u)) return 'chrome';
    if (/Safari\//i.test(u)) return 'safari';
    return 'other';
  }

  var ANDROID_MENU = {
    chrome: '点右上角「⋮」菜单，选择「安装应用」或「添加到主屏幕」',
    edge: '点底部「⋯」菜单，选择「添加到手机」或「安装」',
    vivo: '点底部「≡」或「更多」菜单，选择「添加到桌面」',
    huawei: '点底部「≡」菜单，选择「添加到桌面」',
    qq: '点底部「≡」菜单，选择「添加到桌面」',
    uc: '点底部「≡」菜单，选择「添加到桌面」',
    miui: '点底部「≡」菜单，选择「添加到桌面」',
    oppo: '点底部「≡」菜单，选择「添加到桌面」',
    samsung: '点右下角「≡」菜单，选择「添加页面到」→「主屏幕」',
    baidu: '点底部「≡」菜单，选择「添加到桌面」',
    firefox: '点右上角「⋮」菜单，选择「安装」或「添加到主屏幕」',
    other: '打开浏览器菜单，选择「安装应用」或「添加到桌面」',
  };

  function isWeChat() { return browserName() === 'wechat'; }
  function isBrowser() { return browserName(); }

  /** 是否运行在已安装的容器里（安卓 APK / 桌面版内嵌站点）：
   *  这些环境本身就是独立应用，再提示「安装到桌面」既无意义也打扰。 */
  function isEmbedded() {
    var h = (location.hostname || '').toLowerCase();
    if (/CampusKitApp/i.test(ua())) return true;            // 安卓 APK：原生侧在 UA 里加了标记
    if (h === 'campuskit.local') return true;               // 桌面版：内嵌虚拟域名
    if ((h === '127.0.0.1' || h === 'localhost') && isAndroid()) return true;  // APK 的回环服务
    return false;
  }

  /** 是否已在独立窗口中运行（已安装） */
  function isStandalone() {
    if (isEmbedded()) return true;
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) return true;
    } catch (e) { /* noop */ }
    return navigator.standalone === true;
  }

  /** 当前页面是否为安全上下文（PWA 安装的必要条件） */
  function isSecure() { return window.isSecureContext === true; }

  function isDismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  }
  function rememberDismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* noop */ }
  }

  /* ---------------- 分平台安装指引 ---------------- */
  function stepsFor() {
    // 微信内置浏览器既不能安装，也不能添加到主屏幕，必须先换浏览器
    if (isWeChat()) {
      return {
        lead: '微信内置浏览器不支持安装，请先切到系统浏览器：',
        steps: [
          '点右上角「⋯」，选择「在浏览器打开」',
          '在打开的浏览器里，按下面第 2 步操作即可安装',
          isIOS() ? 'iPhone：点上一步浏览器底部的「分享」→「添加到主屏幕」'
                  : '安卓：打开浏览器菜单，选择「安装应用」或「添加到桌面」',
        ],
        note: '微信内置浏览器（X5/XWeb）出于限制不提供安装入口，这是微信的策略，不是应用本身的问题。',
      };
    }

    if (isIOS()) {
      return {
        lead: '在 iPhone / iPad 上安装（Safari、Edge、Chrome 等都可以）：',
        steps: [
          '点浏览器底部的「分享」按钮（方框加向上箭头）',
          '在菜单里选择「添加到主屏幕」',
          '右上角点「添加」，桌面就会出现「校园通」图标',
        ],
        note: 'iOS 上即使通过局域网 http 访问也能这样安装；' +
          '安装后从桌面打开是全屏独立窗口，没有浏览器地址栏。',
      };
    }

    if (isAndroid()) {
      var bn = browserName();
      var step = ANDROID_MENU[bn] || ANDROID_MENU.other;
      return {
        lead: '在安卓手机上安装：',
        steps: [
          step,
          '确认后桌面会出现「校园通」图标（部分浏览器是快捷方式），点开即可使用',
        ],
        note: isSecure()
          ? '当前访问的是安全地址，浏览器菜单里应能直接找到安装入口。'
          : '注意：安卓浏览器要求 HTTPS（或 localhost）才提供「安装应用」；' +
            '通过局域网 http 访问时，多数国产浏览器只能创建桌面快捷方式。' +
            '想获得完整安装体验（离线可用、独立窗口），可把 app 目录放到任意 HTTPS ' +
            '静态托管上再访问。',
      };
    }

    return {
      lead: '在电脑浏览器上安装：',
      steps: [
        'Chrome / Edge 地址栏右侧会出现「安装」图标，点击即可',
        '或打开浏览器菜单（⋮），选择「安装校园通」/「应用 → 安装此站点」',
      ],
      note: isSecure()
        ? '安装后会以独立窗口运行，任务栏也会有独立图标。'
        : '需要 HTTPS 或 localhost 才能安装；桌面版「校园通.exe」本身就是独立窗口程序，无需再装。',
    };
  }

  function openGuide() {
    var g = stepsFor();
    var html = '<p style="font-size:13.5px;line-height:1.7">' + g.lead + '</p><div class="steps" style="margin-top:10px">';
    for (var i = 0; i < g.steps.length; i++) {
      html += '<div class="step"><span class="n">' + (i + 1) + '</span><p>' + g.steps[i] + '</p></div>';
    }
    html += '</div><div class="ai-note" style="margin-top:10px">' + CH.ui.icon('info') +
      '<span>' + g.note + '</span></div>';
    CH.ui.modal({
      title: '安装到桌面',
      sub: isStandalone() ? '当前已经是独立窗口运行' : '装好后可从主屏幕 / 开始菜单直接打开',
      body: html,
      actions: (deferred ? '<button class="btn primary" data-do-install type="button">立即安装</button>' : '') +
        '<button class="btn ghost" data-close type="button">知道了</button>',
      onMount: function (el) {
        var btn = el.querySelector('[data-do-install]');
        if (btn) btn.addEventListener('click', function () { promptInstall(); });
      },
    });
  }

  /* ---------------- 触发安装 ---------------- */
  function promptInstall() {
    if (deferred) {
      var d = deferred;
      deferred = null;
      try { d.prompt(); } catch (e) { /* noop */ }
      if (d.userChoice && d.userChoice.then) {
        d.userChoice.then(function (res) {
          if (res && res.outcome === 'accepted') CH.ui.toast('正在安装…');
          else CH.ui.toast('已取消安装');
        });
      }
      updateEntries();
      return;
    }
    openGuide();
  }

  /* ---------------- 入口：侧边栏按钮 + 移动端横幅 ---------------- */
  function canOffer() {
    if (isStandalone()) return false;
    if (deferred) return true;
    // 没有原生提示时：iOS 与「非安全上下文」的移动端仍值得给出指引
    return isIOS() || isAndroid();
  }

  function ensureSidebarEntry() {
    if (isEmbedded()) return;
    var links = document.querySelector('.tips-links');
    if (!links || links.querySelector('#installBtn')) return;
    var b = document.createElement('button');
    b.id = 'installBtn';
    b.className = 'link-btn';
    b.type = 'button';
    b.textContent = '安装到桌面';
    b.addEventListener('click', promptInstall);
    links.insertBefore(b, links.firstChild);
  }

  function ensureBanner() {
    if (isEmbedded() || banner || !canOffer() || isDismissed()) return;
    banner = document.createElement('div');
    banner.className = 'install-banner';
    banner.innerHTML = CH.ui.icon('sparkles', 'sm') +
      '<span>把校园通装到桌面，打开更方便</span>' +
      '<button class="btn primary sm" data-install type="button">安装</button>' +
      '<button class="icon-btn sm" data-dismiss type="button" aria-label="不再提示">' + CH.ui.icon('x') + '</button>';
    banner.querySelector('[data-install]').addEventListener('click', promptInstall);
    banner.querySelector('[data-dismiss]').addEventListener('click', function () {
      rememberDismiss();
      hideBanner();
    });
    document.body.appendChild(banner);
  }

  function hideBanner() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
  }

  function updateEntries() {
    ensureSidebarEntry();
    if (canOffer() && !isDismissed()) ensureBanner();
    else hideBanner();
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      updateEntries();
    });
    window.addEventListener('appinstalled', function () {
      deferred = null;
      rememberDismiss();
      hideBanner();
      CH.ui.toast('已安装到桌面，可从主屏幕直接打开');
    });
    updateEntries();
  }

  CH.install = {
    init: init,
    prompt: promptInstall,
    guide: openGuide,
    isStandalone: isStandalone,
    isEmbedded: isEmbedded,
    canOffer: canOffer,
    // 供自测使用
    _platform: function () {
      return {
        ios: isIOS(), android: isAndroid(), browser: browserName(),
        standalone: isStandalone(), secure: isSecure(), wechat: isWeChat(),
      };
    },
  };
})(window.CH);
