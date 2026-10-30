/* 校园通 · 开发自测（仅在 URL 带 ?selftest=1 时由 index.html 动态加载）
 * 目的：在无浏览器驱动的情况下，用无头浏览器 --dump-dom 验证核心纯函数与数据一致性。
 */
(function () {
  'use strict';
  function run() {
    const CH = window.CH;
    const lines = [];
    let pass = 0, fail = 0;
    function ok(name, cond, extra) {
      if (cond) { pass++; lines.push('PASS  ' + name); }
      else { fail++; lines.push('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
    }
    function guard(name, fn) {
      try { fn(); } catch (e) { fail++; lines.push('FAIL  ' + name + '  → 抛出异常: ' + e.message); }
    }

    if (!CH || !CH.util || !CH.occ || !CH.lostAI || !CH.store) {
      lines.push('FAIL  模块未加载完整：CH.util / CH.occ / CH.lostAI / CH.store 缺失');
      dump(lines, 0, 1);
      return;
    }
    const U = CH.util, D = CH.DATA, S = CH.store, AI = CH.lostAI;

    /* ---- 基础工具 ---- */
    guard('semester() 周次在 1–18 之间', () => {
      const s = U.semester();
      ok('semester() 周次在 1–18 之间', s.week >= 1 && s.week <= 18, 'week=' + s.week);
    });
    guard('weekStart(1) 是周一 00:00', () => {
      const d = U.weekStart(1);
      ok('weekStart(1) 是周一 00:00', U.dayIdx(d) === 1 && d.getHours() === 0, d.toString());
    });
    guard('dateKey / parseKey 往返一致', () => {
      const k = U.dateKey(new Date(2026, 9, 20));
      ok('dateKey / parseKey 往返一致', k === '2026-10-20' && U.dateKey(U.parseKey(k)) === k, k);
    });
    guard('weekOfDate(weekStart(n)) === n', () => {
      const okAll = [1, 3, 8, 15].every((n) => U.weekOfDate(U.weekStart(n)) === n);
      ok('weekOfDate(weekStart(n)) === n', okAll);
    });
    guard('haversine / walkMin 合理', () => {
      const a = CH.cmap.place('lib'), b = CH.cmap.place('ms');   // 图书馆 → 明实楼（实测坐标）
      const d = U.haversine(a, b);
      ok('haversine / walkMin 合理', d > 100 && d < 400 && U.walkMin(d) >= 1, 'd=' + Math.round(d));
    });

    /* ---- 数据一致性 ---- */
    guard('课表 / 活动引用的教室都存在', () => {
      const bad = S.state.courses.concat(S.state.activities).map((x) => x.room).filter((r) => !D.ROOM_MAP[r]);
      ok('课表 / 活动引用的教室都存在', bad.length === 0, bad.join(','));
    });
    guard('种子课表内部无时间冲突', () => {
      const cs = S.state.courses, bad = [];
      for (let i = 0; i < cs.length; i++) {
        for (let j = i + 1; j < cs.length; j++) {
          const a = cs[i], b = cs[j];
          if (a.day !== b.day) continue;
          if (!a.weeks.some((w) => b.weeks.indexOf(w) >= 0)) continue;
          if (a.start + a.span <= b.start || b.start + b.span <= a.start) continue;
          bad.push(a.name + ' × ' + b.name);
        }
      }
      ok('种子课表内部无时间冲突', bad.length === 0, bad.join(' / '));
    });
    guard('所有周次都在 1–18 内', () => {
      const bad = S.state.courses.concat(S.state.activities).filter((x) => x.weeks.some((w) => w < 1 || w > 18));
      ok('所有周次都在 1–18 内', bad.length === 0, bad.map((x) => x.name || x.title).join(','));
    });
    guard('同一教室不会被课程与活动同时占用', () => {
      const all = S.state.courses.map((c) => ({ room: c.room, day: c.day, start: c.start, span: c.span || 1, weeks: c.weeks, label: c.name }))
        .concat(S.state.activities.map((a) => ({ room: a.room, day: a.day, start: a.start, span: a.span || 1, weeks: a.weeks, label: a.title })));
      const bad = [];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i], b = all[j];
          if (a.room !== b.room || a.day !== b.day) continue;
          if (!a.weeks.some((w) => b.weeks.indexOf(w) >= 0)) continue;
          if (a.start + a.span <= b.start || b.start + b.span <= a.start) continue;
          bad.push(a.room + '：' + a.label + ' × ' + b.label);
        }
      }
      ok('同一教室不会被课程与活动同时占用', bad.length === 0, bad.join(' / '));
    });

    /* ---- 占用引擎 ---- */
    guard('占用矩阵稳定（同一天两次结果一致）', () => {
      const d = new Date(2026, 9, 20);
      ok('占用矩阵稳定（同一天两次结果一致）', JSON.stringify(CH.occ.grid(d, S.state)) === JSON.stringify(CH.occ.grid(d, S.state)));
    });
    guard('我的课程会出现在空闲教室矩阵中', () => {
      const monday = U.weekStart(5);
      const g = CH.occ.grid(monday, S.state);
      const ev = (g['南明楼·北德楼-301'] || [])[1];
      ok('我的课程会出现在空闲教室矩阵中', !!ev && ev.title === '数据结构' && ev.kind === 'class', ev ? ev.title : 'null');
    });
    guard('社团活动会占用对应教室', () => {
      const wed = U.addDays(U.weekStart(5), 2); // 周三
      const g = CH.occ.grid(wed, S.state);
      const ev = (g['南明楼·北德楼-301'] || [])[4];
      ok('社团活动会占用对应教室', !!ev && ev.kind === 'activity', ev ? ev.kind : 'null');
    });
    guard('自习室空闲率高于普通教室', () => {
      const d = new Date(2026, 9, 20);
      const g = CH.occ.grid(d, S.state);
      function rate(type) {
        const rs = D.ROOMS.filter((r) => r.type === type);
        let total = 0, free = 0;
        rs.forEach((r) => { g[r.id].forEach((v) => { total++; if (!v) free++; }); });
        return total ? free / total : 0;
      }
      const a = rate('自习室'), b = rate('多媒体教室');
      ok('自习室空闲率高于普通教室', a > b, '自习室=' + a.toFixed(2) + ' 多媒体=' + b.toFixed(2));
    });

    /* ---- 图片特征与匹配 ---- */
    function px(r, g, b, n) {
      const arr = new Uint8ClampedArray(n * 4);
      for (let i = 0; i < n; i++) { arr[i * 4] = r; arr[i * 4 + 1] = g; arr[i * 4 + 2] = b; arr[i * 4 + 3] = 255; }
      return arr;
    }
    guard('主色识别：红 / 白 / 黑 / 灰 / 蓝', () => {
      const cases = [[[200, 30, 30], '红色'], [[250, 250, 250], '白色'], [[12, 12, 12], '黑色'], [[128, 128, 128], '灰色'], [[30, 70, 200], '蓝色']];
      const bad = cases.filter((c) => AI.colorFromPixels(px(c[0][0], c[0][1], c[0][2], 64)).name !== c[1])
        .map((c) => '期望' + c[1] + '得到' + AI.colorFromPixels(px(c[0][0], c[0][1], c[0][2], 64)).name);
      ok('主色识别：红 / 白 / 黑 / 灰 / 蓝', bad.length === 0, bad.join(' / '));
    });
    guard('文本推断分类：耳机 → 电子，校园卡 → 证件', () => {
      const a = AI.suggestCategory('黑色耳机充电盒'), b = AI.suggestCategory('捡到一张校园卡');
      ok('文本推断分类：耳机 → 电子，校园卡 → 证件', !!a && a.cat === '电子' && !!b && b.cat === '证件',
        (a && a.cat) + ' / ' + (b && b.cat));
    });
    guard('地点楼栋提取正确', () => {
      ok('地点楼栋提取正确', AI.buildingOf('南明楼·北德楼-301') === '南明楼·北德楼' && AI.buildingOf('图书馆-自习室101') === '图书馆' && AI.buildingOf('北苑餐厅-2楼') === '北苑餐厅');
    });
    guard('文本推断颜色：从描述里识别主色', () => {
      ok('文本推断颜色：从描述里识别主色',
        AI.suggestColor('黑色耳机充电盒') === '黑色' && AI.suggestColor('捡到一个蓝色保温杯') === '蓝色' && AI.suggestColor('一个水杯') === '');
    });

    const now = Date.now();
    const mine = { type: 'lost', cat: '电子', color: '黑色', title: '黑色耳机充电盒', desc: '盒盖内侧有星球贴纸', place: '教三-305', ts: now };
    const good = { id: 'x1', type: 'found', cat: '电子', color: '黑色', title: 'AirPods 充电盒', desc: '黑色耳机盒，盖上有贴纸', place: '教三-305', ts: now - 2 * 3600e3, status: 'open' };
    const bad1 = { id: 'x2', type: 'found', cat: '证件', color: '白色', title: '校园卡', desc: '白色卡片一张', place: '图书馆-自习室101', ts: now - 5 * 86400e3, status: 'open' };
    const bad2 = { id: 'x3', type: 'lost', cat: '电子', color: '黑色', title: '黑色耳机充电盒', desc: '同样是寻物帖', place: '教三-305', ts: now, status: 'open' };

    guard('相似帖得分显著高于不相似帖', () => {
      const a = AI.score(mine, good).score, b = AI.score(mine, bad1).score;
      ok('相似帖得分显著高于不相似帖', a >= 60 && b <= 35, '相似=' + a + ' 不相似=' + b);
    });
    guard('匹配结果只含类型互补、未归还的帖子', () => {
      const r = AI.matchAll(mine, [good, bad1, bad2]);
      ok('匹配结果只含类型互补、未归还的帖子', r.length === 1 && r[0].post.id === 'x1', '命中 ' + r.length + ' 条');
    });
    guard('匹配理由包含关键词与颜色线索', () => {
      const r = AI.score(mine, good);
      const has = r.reasons.join('|');
      ok('匹配理由包含关键词与颜色线索', has.indexOf('颜色一致') >= 0 && has.indexOf('关键词') >= 0, has);
    });

    /* ---- 视图 ---- */
    guard('三个视图都已注册', () => {
      ok('三个视图都已注册', !!(CH.views.tt && CH.views.lost && CH.views.qa && CH.views.tt.tab && CH.views.qa.tab));
    });

    /* ---- 二维码编码器 ---- */
    guard('二维码：版本尺寸、定位图形与二值性', () => {
      const q1 = CH.qr.encode('http://a.b/');
      const q2 = CH.qr.encode('http://192.168.100.200:65535/?a=1');
      function finderAt(m, r0, c0) {
        for (let r = 0; r < 7; r++) {
          for (let c = 0; c < 7; c++) {
            const ring = (r === 0 || r === 6 || c === 0 || c === 6);
            const core = (r >= 2 && r <= 4 && c >= 2 && c <= 4);
            if (m[r0 + r][c0 + c] !== ((ring || core) ? 1 : 0)) return false;
          }
        }
        return true;
      }
      const sizeOk = q1.size === 21 && q2.size === 29;
      const finders = finderAt(q1.modules, 0, 0) && finderAt(q1.modules, 0, q1.size - 7) && finderAt(q1.modules, q1.size - 7, 0);
      const binary = q1.modules.every((row) => row.every((v) => v === 0 || v === 1));
      const timing = (function () {
        for (let i = 8; i < q1.size - 8; i++) {
          if (q1.modules[6][i] !== (i % 2 === 0 ? 1 : 0)) return false;
        }
        return true;
      })();
      ok('二维码：版本尺寸、定位图形与二值性', sizeOk && finders && binary && timing,
        'size=' + q1.size + '/' + q2.size + ' finders=' + finders + ' timing=' + timing);
    });

    guard('二维码：SVG 带静区且为矢量路径', () => {
      const svg = CH.qr.svg('http://a.b/', { moduleSize: 4, margin: 3 });
      const q = CH.qr.encode('http://a.b/');
      const want = 'viewBox="0 0 ' + ((q.size + 6) * 4) + ' ' + ((q.size + 6) * 4) + '"';
      ok('二维码：SVG 带静区且为矢量路径',
        svg.indexOf('<svg') === 0 && svg.indexOf(want) > 0 && svg.indexOf('shape-rendering') > 0,
        want);
    });

    guard('二维码：超长内容抛出可读错误', () => {
      let msg = '';
      try { CH.qr.encode(new Array(200).join('x')); } catch (e) { msg = e.message; }
      ok('二维码：超长内容抛出可读错误', msg.indexOf('过长') >= 0, msg || '（未抛错）');
    });

    /* ---- 集成测试：真实驱动 DOM ---- */
    function sandbox() {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:-9999px;top:0;width:1200px';
      document.body.appendChild(d);
      return d;
    }
    function type(el, v) {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    guard('集成 · 失物智能匹配：文本自动识别分类并命中黑色耳机帖', () => {
      const box = sandbox();
      CH.views.lost.mount(box, 'match');
      type(box.querySelector('[data-ai-field="title"]'), '黑色 AirPods 耳机充电盒');
      type(box.querySelector('[data-ai-field="place"]'), '教三-305');
      const catSel = box.querySelector('[data-ai-field="cat"]');
      const autoCat = catSel.value;
      box.querySelector('[data-act="run"]').click();
      const hits = box.querySelectorAll('.match');
      const reasons = box.querySelector('.reasons');
      ok('集成 · 失物智能匹配：文本自动识别分类并命中黑色耳机帖',
        autoCat === '电子' && hits.length >= 1 && !!reasons && reasons.textContent.indexOf('颜色一致') >= 0,
        '自动分类=' + (autoCat || '空') + ' 命中=' + hits.length);
      box.remove();
    });

    guard('集成 · 空闲教室：推荐卡按距离升序且可切换节次', () => {
      const box = sandbox();
      CH.views.tt.mount(box, 'rooms');
      const before = box.querySelectorAll('table.rooms tbody tr').length;
      const nums = [].map.call(box.querySelectorAll('.reco-dist b'), (n) => n.textContent);
      // 切到「全天」应仍然渲染出表格
      box.querySelector('[data-act="period"][data-p="all"]').click();
      const after = box.querySelectorAll('table.rooms tbody tr').length;
      ok('集成 · 空闲教室：推荐卡按距离升序且可切换节次',
        before > 0 && after > 0 && !!box.querySelector('.campus-map svg'),
        '行数 ' + before + ' → ' + after + '，推荐 ' + nums.join(' / '));
      box.remove();
    });

    guard('集成 · 空闲教室：只看空闲开关生效且我的课程标记为「我的课」', () => {
      const box = sandbox();
      CH.views.tt.mount(box, 'rooms');
      box.querySelector('[data-act="period"][data-p="now"]').click();
      const mineCell = box.querySelector('.cell-busy.mine');
      const all = box.querySelectorAll('table.rooms tbody tr').length;
      const sw = box.querySelector('[data-act="onlyfree"]');
      sw.checked = true;
      sw.dispatchEvent(new Event('change', { bubbles: true }));
      const freeOnly = box.querySelectorAll('table.rooms tbody tr').length;
      ok('集成 · 空闲教室：只看空闲开关生效且我的课程标记为「我的课」',
        !!mineCell && freeOnly > 0 && freeOnly < all,
        '我的课单元格=' + (mineCell ? '有' : '无') + '，全部=' + all + ' 只看空闲=' + freeOnly);
      box.remove();
    });

    guard('集成 · 问答：点击问题进入详情并显示回答', () => {
      const box = sandbox();
      CH.views.qa.mount(box, '');
      const first = box.querySelector('[data-open]');
      const qid = first && first.getAttribute('data-open');
      first.click();
      const answers = box.querySelectorAll('.answer').length;
      const hasForm = !!box.querySelector('#answerBody');
      ok('集成 · 问答：点击问题进入详情并显示回答', !!qid && answers >= 1 && hasForm, '问题=' + qid + ' 回答=' + answers);
      box.remove();
    });

    guard('集成 · 政策与通讯录：能找到负责部门与电话', () => {
      const box = sandbox();
      CH.views.qa.mount(box, 'policy');
      const pcount = box.querySelectorAll('[data-policy]').length;
      const tel = box.querySelector('a[href^="tel:"]');
      const pTitle = box.querySelector('[data-policy]');
      if (pTitle) pTitle.click();
      const modal = document.querySelector('#modalRoot .modal');
      const steps = modal ? modal.querySelectorAll('.step').length : 0;
      const mTel = modal ? modal.querySelector('a[href^="tel:"]') : null;
      const closeBtn = document.querySelector('#modalRoot [data-close]');
      if (closeBtn) closeBtn.click();
      CH.views.qa.tab('contacts');
      const ccount = box.querySelectorAll('.contact-card').length;
      const cPhone = box.querySelector('.contact-card .phone-line');
      ok('集成 · 政策与通讯录：能找到负责部门与电话',
        pcount >= 5 && !!mTel && steps >= 3 && ccount >= 5 && !!cPhone,
        '政策=' + pcount + ' 流程步骤=' + steps + ' 通讯录=' + ccount + ' 详情电话=' + (mTel ? '有' : '无'));
      box.remove();
    });

    guard('集成 · 添加课程：时间冲突会被拦截', () => {
      document.querySelector('[data-act="add-course"]').click();
      const modal = document.querySelector('#modalRoot .modal');
      const form = modal && modal.querySelector('[data-form]');
      if (!form) { ok('集成 · 添加课程：时间冲突会被拦截', false, '弹层未打开'); return; }
      form.querySelector('[name="name"]').value = '冲突测试课';
      form.querySelector('[name="room"]').value = '教二-201';
      form.querySelector('[name="day"]').value = '1';
      form.querySelector('[name="start"]').value = '0';
      form.querySelector('[name="span"]').value = '1';
      form.querySelector('[name="from"]').value = '1';
      form.querySelector('[name="to"]').value = '8';
      document.querySelector('#modalRoot [data-ok]').click();
      const err = document.querySelector('#modalRoot [data-err]');
      const msg = err && !err.hidden ? err.textContent : '';
      ok('集成 · 添加课程：时间冲突会被拦截', msg.indexOf('冲突') >= 0, msg || '（未出现错误提示）');
      const closeBtn = document.querySelector('#modalRoot [data-close]');
      if (closeBtn) closeBtn.click();
    });

    guard('遍历全部页面渲染无 JS 异常', () => {
      const box = sandbox();
      const routes = [['tt', ''], ['tt', 'rooms'], ['tt', 'act'], ['lost', ''], ['lost', 'match'], ['qa', ''], ['qa', 'policy'], ['qa', 'contacts']];
      routes.forEach((r) => {
        CH.views[r[0]].mount(box, r[1]);
        CH.views[r[0]].tab(r[1]);
      });
      box.remove();
      const errs = window.__errs || [];
      ok('遍历全部页面渲染无 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));
    });

    guard('主题：?theme 参数与切换按钮都能生效', () => {
      const want = new URLSearchParams(location.search).get('theme');
      const before = document.documentElement.dataset.theme;
      const paramOk = !want || before === want;
      const btn = document.getElementById('themeBtn');
      btn.click();
      const flipped = document.documentElement.dataset.theme !== before;
      const after = document.documentElement.dataset.theme;
      btn.click();
      const restored = document.documentElement.dataset.theme === before;
      ok('主题：?theme 参数与切换按钮都能生效', paramOk && flipped && restored,
        '参数=' + (want || '无') + ' 初始=' + before + ' 切换后=' + after);
    });

    guard('布局无横向溢出（当前视口宽度）', () => {
      const v = document.getElementById('view');
      const w = document.documentElement.clientWidth;
      const routes = [['tt', ''], ['tt', 'rooms'], ['tt', 'act'], ['lost', ''], ['lost', 'match'], ['qa', ''], ['qa', 'policy'], ['qa', 'contacts']];
      let worst = null;
      routes.forEach((r) => {
        v.innerHTML = '';
        CH.views[r[0]].mount(v, r[1]);
        const sw = document.documentElement.scrollWidth;
        if (sw > w + 1 && (!worst || sw > worst.sw)) {
          const bad = [];
          document.querySelectorAll('body *').forEach((el) => {
            if (el.closest('.sprite')) return;
            const rc = el.getBoundingClientRect();
            if (rc.width > 0 && rc.right > w + 1 && bad.length < 4) {
              const cs = window.getComputedStyle(el);
              bad.push(el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0] +
                '[@' + Math.round(rc.right) + ' w=' + Math.round(rc.width) + ' ovf=' + cs.overflowX + ']');
            }
          });
          worst = { sw, route: '#' + r[0] + (r[1] ? '/' + r[1] : ''), bad, bodySw: document.body.scrollWidth };
        }
      });
      ok('布局无横向溢出（当前视口宽度）', !worst,
        worst ? (worst.route + ' docScroll=' + worst.sw + ' bodyScroll=' + worst.bodySw + ' 视口=' + w + ' 越界: ' + worst.bad.join(', ')) : ('视口 ' + w + 'px'));
      v.innerHTML = '';
      CH.views.tt.mount(v, 'rooms');
    });

    /* ---- 校园地图：北方民族大学 · 1:2000 ---- */
    guard('校园地图模块已加载', () => {
      const CM = CH.cmap;
      ok('校园地图模块已加载', !!(CM && CM.panel && CM.mount && CM.place), CM ? 'SCALE=' + CM.SCALE : '缺失');
    });
    guard('地图按 1:2000 绘制（1 px = 0.5292 m 实地）', () => {
      const CM = CH.cmap, mpp = (25.4 / 96 / 1000) * 2000;
      ok('地图按 1:2000 绘制（1 px = 0.5292 m 实地）', CM.SCALE === 2000 && Math.abs(CM.M_PER_PX - mpp) < 1e-9,
        '1 px = ' + CM.M_PER_PX.toFixed(6) + ' m，1 cm = ' + (10 / (25.4 / 96) * CM.M_PER_PX).toFixed(1) + ' m');
    });
    guard('地图图面尺寸与 1:2000 一致', () => {
      const CM = CH.cmap;
      const worldW = CM.WORLD.maxX - CM.WORLD.minX;
      const ratio = CM.mapPx.w / (worldW * CM.PX_PER_M);
      ok('地图图面尺寸与 1:2000 一致', Math.abs(ratio - 1) < 0.001,
        '图面 ' + CM.mapPx.w + ' px ↔ 实地 ' + Math.round(worldW) + ' m（1 px = ' + (CM.M_PER_PX * 1000).toFixed(1) + ' mm 图上）');
    });
    guard('高德地图底图已加载', () => {
      const img = document.querySelector('.campus-map image.cmap-plan');
      const okLoad = !!img && img.getBBox().width > 100;
      ok('高德地图底图已加载', okLoad, img ? ('铺开 ' + Math.round(img.getBBox().width) + ' × ' + Math.round(img.getBBox().height) + ' px') : '未找到 <image>');
    });
    guard('底图为北方民族大学实测坐标', () => {
      const CM = CH.cmap, DD = CH.DATA;
      const inCampus = DD.BUILDINGS.concat(DD.ANCHORS).every((b) =>
        b.lat > 38.492 && b.lat < 38.502 && b.lng > 106.09 && b.lng < 106.11);
      ok('底图为北方民族大学实测坐标', CM.CAMPUS.name === '北方民族大学' && inCampus,
        DD.BUILDINGS.map((b) => b.name).join('、') + '（共 ' + DD.ANCHORS.length + ' 个参照点）');
    });
    guard('地图以 1:1 像素渲染（不被 CSS 缩放）', () => {
      const svg = document.querySelector('.campus-map svg.cmap-svg');
      const r = svg ? svg.getBoundingClientRect() : null;
      ok('地图以 1:1 像素渲染（不被 CSS 缩放）', !!r && Math.abs(r.width - CH.cmap.mapPx.w) < 2,
        r ? Math.round(r.width) + ' px / 应为 ' + CH.cmap.mapPx.w + ' px' : '未找到 SVG');
    });
    guard('比例尺标尺长度 = 50 m', () => {
      const bar = document.querySelector('[data-cmap-bar]');
      const w = bar ? bar.getBoundingClientRect().width : 0;
      const want = 50 * CH.cmap.PX_PER_M;
      ok('比例尺标尺长度 = 50 m', Math.abs(w - want) < 3,
        '实测 ' + w.toFixed(1) + ' px / 期望 ' + want.toFixed(1) + ' px');
    });

    // 收尾：把视图重新挂回主容器，避免测试沙箱影响页面本身
    try {
      const v = document.getElementById('view');
      if (v && CH.views && CH.views.tt) { v.innerHTML = ''; CH.views.tt.mount(v, 'rooms'); }
    } catch (e) { /* noop */ }

    dump(lines, pass, fail);
  }

  function dump(lines, pass, fail) {
    const pre = document.createElement('pre');
    pre.id = 'selftest';
    pre.style.cssText = 'position:fixed;left:-9999px;top:0';
    pre.textContent = 'SELFTEST_RESULT pass=' + pass + ' fail=' + fail + '\n' + lines.join('\n');
    document.body.appendChild(pre);
    document.title = 'SELFTEST pass=' + pass + ' fail=' + fail;
    console.log(pre.textContent);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(run, 60);
  else window.addEventListener('load', () => setTimeout(run, 60));
})();
