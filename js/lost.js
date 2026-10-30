/* 校园通 · 失物招领
 * 图片「智能匹配」为端侧实现：提取图片主色 / 明暗特征，与帖子文本做关键词与时空特征加权打分。
 * 未接入云端视觉大模型，全部在本机完成，界面上如实标注。
 */
(function (CH) {
  'use strict';
  const U = CH.util, UI = CH.ui, S = CH.store, D = CH.DATA;
  CH.views = CH.views || {};

  const H = 3600e3;
  const NEUTRAL = ['黑色', '白色', '灰色'];
  const CAT_WORDS = {
    电子: ['耳机', 'airpods', '充电', '手机', 'ipad', '平板', '电脑', '笔记本电', '手表', '手环', '数据线', '充电宝', '鼠标', '键盘', 'u盘', '相机', 'kindle', '耳塞'],
    证件: ['校园卡', '一卡通', '学生证', '身份证', '卡套', '证件', '银行卡', '公交卡', '饭卡', '社保卡'],
    书籍: ['书', '笔记', '教材', '资料', '习题', '卷子', '作业', '讲义'],
    钥匙: ['钥匙', '门禁', '锁', '挂件', '钥匙扣'],
    衣物: ['围巾', '外套', '衣服', '帽子', '手套', '鞋', '毛衣', '卫衣', '校服', '伞'], 
    其他: ['水杯', '保温杯', '钱包', '背包', '书包', '眼镜', '雨伞', '充电器', '化妆'],
  };

  const st = {
    tab: 'browse',
    type: 'all',
    cat: 'all',
    status: 'all',
    q: '',
    ai: { type: 'lost', img: null, detected: null, results: null, base: null, form: {} },
  };
  let root = null, pane = null, inited = false;

  /* ---------------- 图片特征分析（端侧） ---------------- */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    const d = max - min;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s, l };
  }
  function hueName(h) {
    if (h < 15 || h >= 345) return '红色';
    if (h < 40) return '橙色';
    if (h < 70) return '黄色';
    if (h < 160) return '绿色';
    if (h < 200) return '青色';
    if (h < 250) return '蓝色';
    if (h < 290) return '紫色';
    if (h < 345) return '粉色';
    return '红色';
  }
  /** 从像素统计主色：优先取有彩色的像素做色相平均，否则按明度归为 黑/白/灰 */
  function colorFromPixels(data) {
    let n = 0, lSum = 0, hsN = 0, hx = 0, hy = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      n++;
      lSum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const c = rgbToHsl(r, g, b);
      if (c.s > 0.30 && c.l > 0.12 && c.l < 0.94) {
        const rad = (c.h * Math.PI) / 180;
        hx += Math.cos(rad) * c.s; hy += Math.sin(rad) * c.s; hsN++;
      }
    }
    const avgL = n ? lSum / n : 0.5;
    if (!n) return { name: '灰色', light: avgL, chromatic: false, sample: 0 };
    if (hsN < n * 0.10) {
      return { name: avgL < 0.28 ? '黑色' : (avgL > 0.80 ? '白色' : '灰色'), light: avgL, chromatic: false, sample: n };
    }
    let hue = (Math.atan2(hy, hx) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    return { name: hueName(hue), light: avgL, chromatic: true, hue: Math.round(hue), sample: n };
  }

  /** 分析图片 → { thumb, detected } */
  function analyzeImage(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('没有选择图片'));
      if (!/^image\//.test(file.type || '')) return reject(new Error('请选择图片文件（jpg / png / webp）'));
      if (file.size > 8 * 1024 * 1024) return reject(new Error('图片不要超过 8MB'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('图片解析失败'));
        img.onload = () => {
          let thumb = '';
          try {
            const max = 560;
            const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
            const cw = Math.max(1, Math.round((img.width || 1) * scale));
            const chh = Math.max(1, Math.round((img.height || 1) * scale));
            const cv = document.createElement('canvas');
            cv.width = cw; cv.height = chh;
            cv.getContext('2d').drawImage(img, 0, 0, cw, chh);
            thumb = cv.toDataURL('image/jpeg', 0.72);
          } catch (e) { thumb = ''; }
          let detected = { name: '灰色', light: 0.5, chromatic: false, sample: 0 };
          try {
            const sm = document.createElement('canvas');
            sm.width = 32; sm.height = 32;
            const ctx = sm.getContext('2d');
            ctx.drawImage(img, 0, 0, 32, 32);
            detected = colorFromPixels(ctx.getImageData(0, 0, 32, 32).data);
          } catch (e) { /* 跨域或画布不可用，退回默认值 */ }
          resolve({ thumb, detected, size: img.width + '×' + img.height });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function suggestCategory(text) {
    const s = String(text || '').toLowerCase();
    let best = '', bestN = 0;
    Object.keys(CAT_WORDS).forEach((cat) => {
      let n = 0;
      CAT_WORDS[cat].forEach((w) => { if (s.indexOf(w) >= 0) n++; });
      if (n > bestN) { bestN = n; best = cat; }
    });
    return bestN ? { cat: best, hits: bestN } : null;
  }

  const COLOR_SYN = [['银', '灰色'], ['乌', '黑色'], ['漆黑', '黑色'], ['米白', '白色'], ['乳白', '白色'], ['藏青', '蓝色'], ['天蓝', '蓝色'], ['深蓝', '蓝色'], ['浅蓝', '蓝色'], ['军绿', '绿色'], ['墨绿', '绿色'], ['卡其', '棕色'], ['咖啡色', '棕色']];

  /** 从文字里识别颜色（用于没有照片时的自动识别） */
  function suggestColor(text) {
    const s = String(text || '').toLowerCase();
    const hit = D.LOST_COLORS.filter((c) => s.indexOf(c) >= 0);
    if (hit.length) return hit[0];
    for (let i = 0; i < COLOR_SYN.length; i++) if (s.indexOf(COLOR_SYN[i][0]) >= 0) return COLOR_SYN[i][1];
    return '';
  }

  function buildingOf(place) {
    // 校园实测地物（CH.cmap）+ 少量校园通用地点
    const names = D.BUILDINGS.map((b) => b.name)
      .concat(D.ANCHORS.map((a) => a.name))
      .concat(['宿舍', '校医院', '行政楼', '操场', '外语楼', '实验楼', '校门'])
      .filter((v, i, arr) => arr.indexOf(v) === i);
    const s = String(place || '');
    for (let i = 0; i < names.length; i++) if (s.indexOf(names[i]) >= 0) return names[i];
    return '';
  }

  /** 打分：分类 / 颜色 / 关键词 / 地点 / 时间 加权，返回 {score, reasons} */
  function score(mine, post) {
    const reasons = [];
    let s = 0;
    if (mine.cat && post.cat && mine.cat === post.cat) { s += 26; reasons.push('同类物品：' + post.cat); }
    if (mine.color && post.color && mine.color === post.color) { s += 24; reasons.push('颜色一致：' + post.color); }
    else if (mine.color && post.color && NEUTRAL.indexOf(mine.color) >= 0 && NEUTRAL.indexOf(post.color) >= 0) {
      s += 10; reasons.push('均为素色（黑/白/灰）');
    }
    const A = U.tokens(mine.title + ' ' + (mine.desc || ''));
    const B = U.tokens(post.title + ' ' + (post.desc || ''));
    const common = [];
    A.forEach((t) => { if (B.has(t)) common.push(t); });
    if (common.length) {
      const ratio = common.length / Math.max(3, Math.min(A.size, B.size));
      s += Math.min(30, Math.round(ratio * 30) + 6);
      reasons.push('关键词重合：' + common.slice(0, 4).map((t) => '「' + t + '」').join(''));
    }
    const bA = buildingOf(mine.place), bB = buildingOf(post.place);
    if (bA && bB && bA === bB) { s += 10; reasons.push('地点相近：' + bA); }
    const dt = Math.abs((mine.ts || Date.now()) - post.ts);
    if (dt < 6 * H) { s += 8; reasons.push('发布时间接近（6 小时内）'); }
    else if (dt < 24 * H) { s += 5; reasons.push('发布时间在 1 天内'); }
    else if (dt < 72 * H) { s += 2; }
    return { score: U.clamp(s, 0, 99), reasons };
  }

  /** 匹配：我的信息 vs 广场中类型互补且未归还的帖子 */
  function matchAll(mine, items) {
    const want = mine.type === 'lost' ? 'found' : 'lost';
    return items
      .filter((p) => p.type === want && p.status === 'open')
      .map((p) => ({ post: p, res: score(mine, p) }))
      .filter((x) => x.res.score >= 30)
      .sort((a, b) => b.res.score - a.res.score)
      .slice(0, 6);
  }

  CH.lostAI = { analyzeImage, colorFromPixels, hueName, suggestCategory, suggestColor, buildingOf, score, matchAll };

  /* ---------------- 骨架 ---------------- */
  function mount(el, sub) {
    root = el;
    st.tab = sub === 'match' ? 'match' : 'browse';
    root.innerHTML =
      '<div class="tabs">' +
        '<a href="#/lost" class="' + (st.tab === 'browse' ? 'active' : '') + '">' + UI.icon('lost') + '失物广场</a>' +
        '<a href="#/lost/match" class="' + (st.tab === 'match' ? 'active' : '') + '">' + UI.icon('sparkles') + '智能匹配</a>' +
      '</div><div data-pane></div>';
    pane = root.querySelector('[data-pane]');
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    inited = true;
    render();
  }

  function tab(sub) {
    const next = sub === 'match' ? 'match' : 'browse';
    if (next === st.tab) return;
    captureAI();
    st.tab = next;
    root.querySelectorAll('.tabs a').forEach((a) => {
      a.classList.toggle('active', (a.getAttribute('href') === '#/lost/match') === (next === 'match'));
    });
    render();
  }

  function render() {
    if (!inited) return;
    if (st.tab === 'browse') { CH.setHeader('失物招领', '捡到东西发招领，丢了东西发寻物；也可以用图片智能匹配已有帖子'); renderPane(browseHtml()); }
    else { CH.setHeader('失物招领 · 智能匹配', '上传照片或填写描述，系统在本机提取特征并与广场帖子比对'); renderPane(matchHtml()); }
  }

  function renderPane(html) {
    const act = document.activeElement;
    const keepId = act && pane.contains(act) ? act.id : null;
    const pos = keepId && act.setSelectionRange ? act.selectionStart : null;
    pane.innerHTML = html;
    if (keepId) {
      const n = pane.querySelector('#' + keepId);
      if (n) {
        n.focus({ preventScroll: true });
        if (pos != null && n.setSelectionRange) { try { n.setSelectionRange(pos, pos); } catch (e) { /* noop */ } }
      }
    }
  }

  /* ---------------- 失物广场 ---------------- */
  function browseHtml() {
    const items = S.state.lost;
    const openFound = items.filter((i) => i.type === 'found' && i.status === 'open').length;
    const openLost = items.filter((i) => i.type === 'lost' && i.status === 'open').length;
    const returned = items.filter((i) => i.status === 'returned').length;
    const todayNew = items.filter((i) => Date.now() - i.ts < 24 * H).length;

    const kpis = '<div class="kpis">' +
      kpi(openFound, '招领中', '条', 'accent') +
      kpi(openLost, '寻物中', '条', 'warn') +
      kpi(returned, '已归还', '条', 'primary') +
      kpi(todayNew, '24 小时内新增', '条', '') +
      '</div>';

    const cats = ['all'].concat(D.LOST_CATS);
    const toolbar =
      '<div class="toolbar">' +
        '<div class="seg">' +
          '<button type="button" data-act="type" data-v="all" class="' + (st.type === 'all' ? 'active' : '') + '">全部</button>' +
          '<button type="button" data-act="type" data-v="found" class="' + (st.type === 'found' ? 'active' : '') + '">招领</button>' +
          '<button type="button" data-act="type" data-v="lost" class="' + (st.type === 'lost' ? 'active' : '') + '">寻物</button>' +
        '</div>' +
        '<div class="seg">' +
          '<button type="button" data-act="status" data-v="open" class="' + (st.status === 'open' ? 'active' : '') + '">进行中</button>' +
          '<button type="button" data-act="status" data-v="all" class="' + (st.status === 'all' ? 'active' : '') + '">全部状态</button>' +
        '</div>' +
        '<span class="spacer" style="flex:1"></span>' +
        '<span class="search">' + UI.icon('search') + '<input id="lq" data-act="lq" value="' + U.esc(st.q) + '" placeholder="搜索物品 / 地点 / 描述"></span>' +
        '<button class="btn primary sm" data-act="publish" type="button">' + UI.icon('plus') + '发布信息</button>' +
      '</div>' +
      '<div class="toolbar" style="border-bottom:0">' +
        '<span class="muted sm">' + UI.icon('filter', 'sm') + '分类</span>' +
        '<div class="chips">' + cats.map((c) =>
          '<button type="button" class="chip' + (st.cat === c ? ' active' : '') + '" data-act="cat" data-v="' + c + '">' + (c === 'all' ? '全部' : c) + '</button>').join('') + '</div>' +
      '</div>';

    let list = items.slice().sort((a, b) => b.ts - a.ts);
    if (st.type !== 'all') list = list.filter((i) => i.type === st.type);
    if (st.status === 'open') list = list.filter((i) => i.status === 'open');
    if (st.cat !== 'all') list = list.filter((i) => i.cat === st.cat);
    if (st.q.trim()) {
      const q = st.q.trim().toLowerCase();
      list = list.filter((i) => (i.title + i.desc + i.place + i.author).toLowerCase().indexOf(q) >= 0);
    }

    const cards = list.length ? list.map(cardHtml).join('') : UI.empty('search', '没有找到相关信息', '换个关键词，或者发布一条新的招领 / 寻物信息');

    return kpis +
      '<div class="card">' +
        '<div class="card-head"><h3>' + UI.icon('lost', 'sm') + ' 失物广场</h3>' +
          '<span class="muted sm">共 ' + list.length + ' 条信息</span></div>' +
        toolbar +
        '<div class="lost-grid">' + cards + '</div>' +
      '</div>' +
      '<p class="hint">提示：</p>' +
      '<p class="hint">1. 捡到物品建议同时交到就近的值班室或图书馆服务台，线上信息仅作撮合；</p>' +
      '<p class="hint">2. 认领时请让对方描述物品特征，避免误领；</p>' +
      '<p class="hint">3. 「智能匹配」可以在本机分析你上传的照片，自动推送可能匹配的帖子。</p>';
  }

  function kpi(v, label, unit, cls) {
    return '<div class="kpi ' + (cls || '') + '"><div class="v">' + v + '<small>' + unit + '</small></div><div class="l">' + label + '</div></div>';
  }

  function cardHtml(i) {
    const isFound = i.type === 'found';
    const thumb = i.img
      ? '<div class="thumb"><img src="' + i.img + '" alt="' + U.esc(i.title) + ' 的物品照片"></div>'
      : '<div class="thumb"><div class="ph">' + UI.icon(isFound ? 'lost' : 'search', 'lg') + '<span>' + (isFound ? '招领' : '寻物') + ' · ' + U.esc(i.cat) + '</span></div></div>';
    return '<article class="lost-card">' + thumb +
      '<div class="body">' +
        '<h4><span class="badge ' + (isFound ? 'found' : 'lost') + '">' + (isFound ? '招领' : '寻物') + '</span>' +
          U.esc(i.title) + (i.status === 'returned' ? '<span class="badge done">已归还</span>' : '') + '</h4>' +
        '<div class="row"><span class="cat-chip">' + U.esc(i.cat) + '</span><span class="color-chip">' + U.esc(i.color || '未标注') + '</span></div>' +
        '<p class="desc">' + U.esc(i.desc) + '</p>' +
        '<div class="meta">' +
          '<span>' + UI.icon('pin') + U.esc(i.place) + '</span>' +
          '<span>' + UI.icon('clock') + U.relTime(i.ts) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="foot"><span>' + U.esc(i.author) + '</span>' +
        '<button class="btn sm ghost" type="button" data-detail="' + i.id + '">查看详情</button></div>' +
      '</article>';
  }

  function detail(id) {
    const i = S.state.lost.filter((x) => x.id === id)[0];
    if (!i) return;
    const isFound = i.type === 'found';
    const body =
      (i.img ? '<img src="' + i.img + '" alt="物品照片" style="width:100%;max-height:240px;object-fit:cover;border-radius:12px;margin-bottom:14px">' : '') +
      '<div class="detail-grid">' +
        item('信息类型', isFound ? '招领（我捡到了）' : '寻物（我丢失了）') +
        item('物品分类', U.esc(i.cat)) +
        item('物品颜色', U.esc(i.color || '未标注')) +
        item('地点', U.esc(i.place)) +
        item('时间', U.fmtDateTime(i.ts) + '（' + U.relTime(i.ts) + '）') +
        item('发布人', U.esc(i.author)) +
        item('联系方式', U.esc(i.contact)) +
        item('当前状态', i.status === 'returned' ? '已归还 / 已找到' : '进行中') +
      '</div>' +
      '<h4 style="margin:16px 0 6px;font-size:13.5px">详细描述</h4>' +
      '<p style="font-size:13.5px;line-height:1.7">' + U.esc(i.desc) + '</p>' +
      '<p class="hint">认领前建议先核对物品特征（如刮痕、贴纸、内含物），避免误领。</p>';

    const actions =
      '<button class="btn subtle" data-copy type="button">' + UI.icon('copy') + '复制联系方式</button>' +
      (i.status === 'open' ? '<button class="btn primary" data-done type="button">' + UI.icon('check') + (isFound ? '标记已归还' : '标记已找到') + '</button>' : '') +
      '<button class="btn ghost" data-close type="button">关闭</button>' +
      (i.status === 'open' ? '' : '');

    UI.modal({
      title: U.esc(i.title),
      sub: isFound ? '招领信息' : '寻物信息',
      body,
      wide: true,
      actions,
      onMount(el, close) {
        el.querySelector('[data-copy]').addEventListener('click', async () => {
          const ok = await U.copy(i.contact + '（' + i.author + '，' + i.title + '）');
          UI.toast(ok ? '已复制联系方式' : '复制失败，请手动记录', ok ? '' : 'err');
        });
        const done = el.querySelector('[data-done]');
        if (done) done.addEventListener('click', async () => {
          close();
          const ok = await UI.confirm({ title: '确认更新状态', text: '确认这条信息已经「' + (isFound ? '归还给失主' : '找回') + '」吗？', ok: '确认' });
          if (!ok) return;
          S.update((s) => { const t = s.lost.filter((x) => x.id === i.id)[0]; if (t) { t.status = 'returned'; t.returnedAt = Date.now(); } });
          UI.toast('已更新为「已归还」，感谢你的善意');
        });
      },
    });
  }

  function item(label, value) {
    return '<div class="item"><b>' + label + '</b><span>' + value + '</span></div>';
  }

  /* ---------------- 发布弹层 ---------------- */
  function publishModal(prefill) {
    prefill = prefill || {};
    const body =
      '<form class="form-grid" data-form>' +
        '<div class="field full"><label>信息类型<em>*</em></label>' +
          '<select name="type">' +
            '<option value="found"' + (prefill.type === 'found' ? ' selected' : '') + '>招领 · 我捡到了东西</option>' +
            '<option value="lost"' + (prefill.type === 'lost' ? ' selected' : '') + '>寻物 · 我丢了东西</option>' +
          '</select></div>' +
        '<div class="field full"><label>物品名称<em>*</em></label><input name="title" maxlength="30" placeholder="例如：黑色 AirPods 充电盒" value="' + U.esc(prefill.title || '') + '" required></div>' +
        '<div class="field"><label>分类</label><select name="cat">' +
          '<option value=""' + (!prefill.cat ? ' selected' : '') + '>自动识别</option>' +
          D.LOST_CATS.map((c) => '<option' + (prefill.cat === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>颜色</label><select name="color">' +
          '<option value=""' + (!prefill.color ? ' selected' : '') + '>自动识别</option>' +
          D.LOST_COLORS.map((c) => '<option' + (prefill.color === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>地点<em>*</em></label><input name="place" maxlength="30" placeholder="例如：教三-305 / 二食堂 2 楼" value="' + U.esc(prefill.place || '') + '" required></div>' +
        '<div class="field"><label>时间</label><input name="when" type="datetime-local"></div>' +
        '<div class="field full"><label>详细描述<em>*</em></label><textarea name="desc" maxlength="200" placeholder="描述外观特征、里面有什么、可以如何认领等">' + U.esc(prefill.desc || '') + '</textarea></div>' +
        '<div class="field full"><label>联系方式<em>*</em></label><input name="contact" maxlength="40" placeholder="微信 / QQ / 手机号" value="' + U.esc(prefill.contact || '') + '" required></div>' +
        '<div class="field full"><label>物品照片（可选）</label>' +
          '<div class="row"><button class="btn ghost sm" type="button" data-pick>' + UI.icon('camera', 'sm') + '选择照片</button>' +
          '<span class="muted sm" data-file-name>' + (prefill.img ? '已使用智能匹配中的照片' : '未选择') + '</span>' +
          '<img data-preview' + (prefill.img ? ' src="' + prefill.img + '"' : '') + ' style="' + (prefill.img ? '' : 'display:none;') + 'width:64px;height:64px;object-fit:cover;border-radius:10px" alt="预览"></div>' +
          '<span class="sub">照片仅保存在本机浏览器，用于展示与智能匹配</span>' +
        '</div>' +
        '<div class="form-error full" data-err hidden></div>' +
        '<input type="file" accept="image/*" hidden data-file>' +
      '</form>';

    let imgData = prefill.img || null;
    let detectedColor = null;

    UI.modal({
      title: '发布信息',
      sub: '发布后可在「智能匹配」中与照片做比对',
      body,
      wide: true,
      actions: '<button class="btn ghost" data-close type="button">取消</button><button class="btn primary" data-ok type="button">发布</button>',
      onMount(el, close) {
        const form = el.querySelector('[data-form]');
        const file = el.querySelector('[data-file]');
        const err = el.querySelector('[data-err]');
        const pv = el.querySelector('[data-preview]');
        const fname = el.querySelector('[data-file-name]');
        el.querySelector('[data-pick]').addEventListener('click', () => file.click());
        file.addEventListener('change', async () => {
          const f = file.files && file.files[0];
          if (!f) return;
          try {
            const r = await analyzeImage(f);
            imgData = r.thumb;
            detectedColor = r.detected.name;
            pv.src = r.thumb; pv.style.display = 'block';
            fname.textContent = f.name + '（主色：' + r.detected.name + '）';
            const sel = form.querySelector('[name="color"]');
            if (sel && !sel.value && r.detected.name) sel.value = r.detected.name;
            const cs = form.querySelector('[name="cat"]');
            if (cs && !cs.value) {
              const s3 = suggestCategory(String(form.querySelector('[name="title"]').value) + ' ' + String(form.querySelector('[name="desc"]').value));
              if (s3) cs.value = s3.cat;
            }
          } catch (e2) { UI.toast(e2.message, 'err'); }
        });
        el.querySelector('[data-ok]').addEventListener('click', () => {
          err.hidden = true;
          const f = new FormData(form);
          const title = String(f.get('title') || '').trim();
          const place = String(f.get('place') || '').trim();
          const desc = String(f.get('desc') || '').trim();
          const contact = String(f.get('contact') || '').trim();
          if (!title) { err.hidden = false; err.textContent = '请填写物品名称'; return; }
          if (!place) { err.hidden = false; err.textContent = '请填写地点'; return; }
          if (!desc) { err.hidden = false; err.textContent = '请填写详细描述'; return; }
          if (!contact) { err.hidden = false; err.textContent = '请填写联系方式'; return; }
          const when = String(f.get('when') || '');
          const ts = when ? new Date(when).getTime() : Date.now();
          const cat = String(f.get('cat') || '') || ((suggestCategory(title + ' ' + desc) || {}).cat) || '其他';
          const color = String(f.get('color') || '') || detectedColor || '灰色';
          const rec = {
            id: U.uid('l'), type: String(f.get('type')), title, cat,
            color, place, desc, contact, ts: isFinite(ts) ? ts : Date.now(),
            author: S.state.profile.name, status: 'open', img: imgData, mine: true,
          };
          S.update((s) => { s.lost.unshift(rec); });
          close();
          UI.toast('发布成功，谢谢你的分享');
        });
      },
    });
  }

  /* ---------------- 智能匹配 ---------------- */
  function captureAI() {
    if (!pane) return;
    pane.querySelectorAll('[data-ai-field]').forEach((n) => { st.ai.form[n.getAttribute('data-ai-field')] = n.value; });
  }

  function matchHtml() {
    const ai = st.ai;
    const f = ai.form;
    const hasImg = !!ai.img;
    const det = ai.detected;
    const sug = suggestCategory((f.title || '') + ' ' + (f.desc || ''));
    const sugColor = det ? '' : suggestColor((f.title || '') + ' ' + (f.desc || ''));

    const form =
      '<div class="ai-grid">' +
        '<div class="card ai-form">' +
          '<div class="card-head"><h3>' + UI.icon('sparkles', 'sm') + ' 描述你丢失 / 捡到的物品</h3></div>' +
          '<div class="card-body">' +
            '<div class="seg" style="align-self:flex-start">' +
              '<button type="button" data-act="ai-type" data-v="lost" class="' + (ai.type === 'lost' ? 'active' : '') + '">我丢了东西</button>' +
              '<button type="button" data-act="ai-type" data-v="found" class="' + (ai.type === 'found' ? 'active' : '') + '">我捡到了东西</button>' +
            '</div>' +
            '<div style="position:relative">' +
              '<div class="drop' + (hasImg ? ' has-img' : '') + '" data-act="pick">' +
                '<input type="file" accept="image/*" hidden data-ai-file>' +
                (hasImg
                  ? '<img src="' + ai.img + '" alt="待匹配物品照片">'
                  : '<div style="padding:18px">' + UI.icon('camera', 'lg') + '<p>点击上传物品照片<br><span class="muted">本机提取主色与特征，不会上传到服务器</span></p></div>') +
              '</div>' +
              (hasImg ? '<button class="icon-btn clear-img" data-act="clear-img" type="button" aria-label="移除照片">' + UI.icon('x') + '</button>' : '') +
            '</div>' +
            '<div class="ai-detected' + ((det || sug || sugColor) ? ' show' : '') + '">' + UI.icon('sparkles', 'sm') +
              (det ? '<span>图片特征：主色 <b>' + U.esc(det.name) + '</b> · 明度 ' + Math.round(det.light * 100) + '% · ' + (det.chromatic ? '彩色物体' : '素色物体') + '</span>' : '') +
              (sug ? '<span>文本识别：建议分类 <b>' + U.esc(sug.cat) + '</b>（命中 ' + sug.hits + ' 个关键词）</span>' : '') +
              (sugColor ? '<span>文本识别：颜色 <b>' + U.esc(sugColor) + '</b></span>' : '') +
              ((det || sug || sugColor) ? '' : '<span>上传照片或填写名称后，这里会显示本机识别结果</span>') +
            '</div>' +
            '<div class="form-grid">' +
              '<div class="field full"><label>物品名称<em>*</em></label>' +
                '<input data-ai-field="title" maxlength="30" value="' + U.esc(f.title || '') + '" placeholder="例如：黑色耳机充电盒"></div>' +
              '<div class="field"><label>分类</label><select data-ai-field="cat">' +
                '<option value=""' + (!f.cat ? ' selected' : '') + '>自动识别</option>' +
                D.LOST_CATS.map((c) => '<option' + (f.cat === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div>' +
              '<div class="field"><label>颜色</label><select data-ai-field="color">' +
                '<option value=""' + (!f.color ? ' selected' : '') + '>自动识别</option>' +
                D.LOST_COLORS.map((c) => '<option' + (f.color === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div>' +
              '<div class="field full"><label>丢失 / 拾取地点<em>*</em></label>' +
                '<input data-ai-field="place" maxlength="30" value="' + U.esc(f.place || '') + '" placeholder="例如：教三-305"></div>' +
              '<div class="field full"><label>补充描述</label>' +
                '<textarea data-ai-field="desc" maxlength="200" placeholder="外观细节、里面有什么…">' + U.esc(f.desc || '') + '</textarea></div>' +
              '<div class="field full"><label>联系方式</label>' +
                '<input data-ai-field="contact" maxlength="40" value="' + U.esc(f.contact || '') + '" placeholder="微信 / QQ / 手机号"></div>' +
            '</div>' +
            '<div class="ai-note">' + UI.icon('info') +
              '<span>匹配在浏览器本机完成：先用图片主色 + 明暗特征，再叠加分类、关键词、地点与时间做加权打分。当前版本未接入云端视觉大模型，接入后可直接替换 <code>CH.lostAI.score</code> 的权重来源。</span></div>' +
            '<div class="row">' +
              '<button class="btn primary" data-act="run" type="button">' + UI.icon('sparkles', 'sm') + '开始智能匹配</button>' +
              '<button class="btn ghost" data-act="publish-ai" type="button">发布到广场</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-head"><h3>' + UI.icon('search', 'sm') + ' 匹配结果</h3>' +
            '<span class="muted sm">' + (ai.results ? '共 ' + ai.results.length + ' 条候选' : '尚未匹配') + '</span></div>' +
          '<div class="card-body">' + resultsHtml() + '</div>' +
        '</div>' +
      '</div>';
    return form;
  }

  function resultsHtml() {
    const ai = st.ai;
    if (!ai.results) {
      return UI.empty('sparkles', '上传照片或填写描述后开始匹配', '系统会推送可能属于你的招领帖子，并按匹配度排序');
    }
    if (!ai.results.length) {
      return UI.empty('search', '暂未找到高匹配度的帖子', '可以换个关键词描述，或直接把信息发布到广场让更多人看到');
    }
    return '<div class="match-list">' + ai.results.map((r) => {
      const p = S.state.lost.filter((x) => x.id === r.id)[0];
      if (!p) return '';
      return '<article class="match">' +
        (p.img ? '<img class="thumb-s" src="' + p.img + '" alt="帖子照片">' : '') +
        '<div class="score"><b>' + r.score + '%</b><div class="bar"><i style="width:' + r.score + '%"></i></div><span>匹配度</span></div>' +
        '<div class="main">' +
          '<h4><span class="badge ' + (p.type === 'found' ? 'found' : 'lost') + '">' + (p.type === 'found' ? '招领' : '寻物') + '</span>' + U.esc(p.title) + '</h4>' +
          '<div class="meta"><span>' + UI.icon('pin', 'sm') + U.esc(p.place) + '</span><span>' + UI.icon('clock', 'sm') + U.relTime(p.ts) + '</span><span>' + U.esc(p.color) + ' · ' + U.esc(p.cat) + '</span></div>' +
          '<div class="reasons">' + r.reasons.map((x) => '<span>' + U.esc(x) + '</span>').join('') + '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px">' +
          '<button class="btn sm primary" type="button" data-detail="' + p.id + '">联系 Ta</button>' +
        '</div>' +
        '</article>';
    }).join('') + '</div>' +
    '<p class="hint">匹配度由「分类 + 颜色 + 关键词 + 地点 + 时间」加权得到，仅供参考；认领前请先核对细节特征。</p>';
  }

  function runMatch() {
    captureAI();
    const f = st.ai.form;
    if (!f.title && !st.ai.detected) { UI.toast('请先上传照片，或至少填写物品名称', 'err'); return; }
    if (f.title && f.title.trim().length < 2) { UI.toast('物品名称太短，再补充一下吧', 'err'); return; }
    const mine = {
      type: st.ai.type,
      title: f.title || (st.ai.detected ? st.ai.detected.name + '物品' : ''),
      desc: f.desc || '',
      cat: f.cat || '',
      color: f.color || (st.ai.detected ? st.ai.detected.name : '') || suggestColor((f.title || '') + ' ' + (f.desc || '')),
      place: f.place || '',
      ts: Date.now(),
    };
    // 未选分类时按文本自动推断
    if (!mine.cat) {
      const sug = suggestCategory(mine.title + ' ' + mine.desc);
      if (sug) mine.cat = sug.cat;
    }
    const res = matchAll(mine, S.state.lost);
    st.ai.results = res.map((x) => ({ id: x.post.id, score: x.res.score, reasons: x.res.reasons }));
    st.ai.base = mine;
    render();
    UI.toast(res.length ? '找到 ' + res.length + ' 条可能匹配的帖子' : '暂无高匹配帖子，建议直接发布', res.length ? '' : 'err');
  }

  /* ---------------- 事件 ---------------- */
  function onClick(e) {
    const t = e.target;

    const detailEl = t.closest('[data-detail]');
    if (detailEl) { detail(detailEl.getAttribute('data-detail')); return; }

    const btn = t.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');

    if (act === 'pick') { const inp = pane.querySelector('[data-ai-file]'); if (inp) inp.click(); return; }
    if (act === 'clear-img') { st.ai.img = null; st.ai.detected = null; st.ai.results = null; render(); return; }
    if (act === 'ai-type') { captureAI(); st.ai.type = btn.getAttribute('data-v'); render(); return; }
    if (act === 'run') { runMatch(); return; }
    if (act === 'publish-ai') { captureAI(); publishModal(Object.assign({}, st.ai.form, { type: st.ai.type, img: st.ai.img })); return; }
    if (act === 'publish') { publishModal(); return; }
    if (act === 'type') { st.type = btn.getAttribute('data-v'); render(); return; }
    if (act === 'status') { st.status = btn.getAttribute('data-v'); render(); return; }
    if (act === 'cat') { st.cat = btn.getAttribute('data-v'); render(); return; }
  }

  function onInput(e) {
    if (e.target.id === 'lq') { st.q = e.target.value; render(); return; }
    const field = e.target.getAttribute('data-ai-field');
    if (field) {
      st.ai.form[field] = e.target.value;
      // 分类留空时按文本自动识别（保持焦点，不改动其他输入）
      if (field === 'title' || field === 'desc') {
        const txt = (st.ai.form.title || '') + ' ' + (st.ai.form.desc || '');
        const sel = pane.querySelector('[data-ai-field="cat"]');
        if (sel && !sel.value) {
          const s2 = suggestCategory(txt);
          if (s2) { sel.value = s2.cat; st.ai.form.cat = s2.cat; }
        }
        const selC = pane.querySelector('[data-ai-field="color"]');
        if (selC && !selC.value) {
          const c2 = suggestColor(txt);
          if (c2) { selC.value = c2; st.ai.form.color = c2; }
        }
      }
    }
  }

  async function onChange(e) {
    const t = e.target;
    if (t.getAttribute('data-ai-file') === null) return;
    const f = t.files && t.files[0];
    if (!f) return;
    try {
      const r = await analyzeImage(f);
      st.ai.img = r.thumb;
      st.ai.detected = r.detected;
      if (!st.ai.form.color) st.ai.form.color = r.detected.name;
      const sug = suggestCategory((st.ai.form.title || '') + ' ' + (st.ai.form.desc || ''));
      if (!st.ai.form.cat && sug) st.ai.form.cat = sug.cat;
      render();
      UI.toast('已识别主色：' + r.detected.name + (sug ? '，建议分类：' + sug.cat : ''));
    } catch (err) {
      UI.toast(err.message || '图片处理失败', 'err');
    }
  }

  CH.views.lost = { mount, tab, render };
})(window.CH);
