/* 校园通 · 课表 + 空闲教室 + 社团活动（合并视图） */
(function (CH) {
  'use strict';
  const U = CH.util, UI = CH.ui, S = CH.store, D = CH.DATA;
  CH.views = CH.views || {};

  const TABS = [
    { id: 'tt', label: '我的课表', icon: 'calendar', sub: '按周查看课程，点击课程卡片可查看详情' },
    { id: 'rooms', label: '空闲教室', icon: 'door', sub: '按日期和节次查空闲教室，并根据你的位置推荐最近的空教室' },
    { id: 'act', label: '社团活动', icon: 'users', sub: '社团活动占用的教室会同步体现在空闲教室里' },
  ];

  const st = {
    tab: 'tt',
    week: 1,
    dateKey: null,
    period: 'now',
    building: 'all',
    rtype: 'all',
    onlyFree: false,
    rq: '',
    atag: 'all',
  };
  let root = null, pane = null, inited = false;

  /* ---------------- 工具 ---------------- */
  function selectedDate() {
    return st.dateKey ? U.parseKey(st.dateKey) : new Date();
  }
  function isToday(d) { return U.dateKey(d) === U.dateKey(new Date()); }
  function currentPos() {
    const loc = S.state.loc;
    if (loc.mode === 'device' && loc.lat != null) return { lat: loc.lat, lng: loc.lng, label: '设备定位位置' };
    const a = D.ANCHORS.filter((x) => x.id === loc.anchor)[0] || D.ANCHORS[0];
    return { lat: a.lat, lng: a.lng, label: a.name };
  }
  /** 用于推荐 / 只看空闲的参考节次；'all' 返回 null */
  function focusPeriod() {
    if (typeof st.period === 'number') return st.period;
    if (st.period === 'now') {
      if (isToday(selectedDate())) { const n = U.nowPeriod(); return n >= 0 ? n : 0; }
      return 2;
    }
    return null;
  }
  function periodLabel(p) { return p == null ? '全天' : U.PERIODS[p].label; }
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
  function distOf(room, pos) { return U.haversine(pos, { lat: room.lat, lng: room.lng }); }
  /** 距离展示：同楼不显示「0 m」 */
  function distLabel(d) {
    if (d == null || !isFinite(d)) return { d: '—', w: '—' };
    if (d < 25) return { d: '同一栋楼', w: '就在本楼' };
    return { d: U.fmtDist(d), w: '步行 ' + U.walkMin(d) + ' 分钟' };
  }

  /* ---------------- 骨架 ---------------- */
  function mount(el, sub) {
    root = el;
    st.week = U.semester().week;
    st.dateKey = U.dateKey(new Date());
    if (sub && TABS.some((t) => t.id === sub)) st.tab = sub;
    root.innerHTML = '<div class="tabs">' + TABS.map((t) =>
      '<a href="#/tt' + (t.id === 'tt' ? '' : '/' + t.id) + '" class="' + (t.id === st.tab ? 'active' : '') + '">' +
      UI.icon(t.icon) + t.label + '</a>').join('') + '</div><div data-pane></div>';
    pane = root.querySelector('[data-pane]');
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    inited = true;
    render();
  }

  function tab(sub) {
    const next = TABS.some((t) => t.id === sub) ? sub : 'tt';
    if (next === st.tab) return;
    st.tab = next;
    root.querySelectorAll('.tabs a').forEach((a) => {
      const id = (a.getAttribute('href') || '').replace('#/tt', '').replace('/', '') || 'tt';
      a.classList.toggle('active', id === st.tab);
    });
    render();
  }

  function render() {
    if (!inited) return;
    const t = TABS.filter((x) => x.id === st.tab)[0] || TABS[0];
    CH.setHeader('课表 · 教室', t.sub);
    if (st.tab === 'tt') renderPane(ttHtml());
    else if (st.tab === 'rooms') { renderPane(roomsHtml()); CH.cmap.mount(pane); }
    else renderPane(actHtml());
  }

  /* ---------------- 我的课表 ---------------- */
  function courseColor(name) { return U.hash(name) % 8; }

  function showToday() { st.week = U.semester().week; render(); }

  function ttHtml() {
    const sem = U.semester();
    const start = U.weekStart(st.week);
    const todayKey = U.dateKey(new Date());
    const isThisWeek = st.week === sem.week;
    const nowP = isThisWeek ? U.nowPeriod() : -1;
    const list = S.state.courses.filter((c) => c.weeks.indexOf(st.week) >= 0);
    const names = {};
    S.state.courses.forEach((c) => { names[c.name] = 1; });
    const daySet = {};
    list.forEach((c) => { daySet[c.day] = 1; });
    const days = Object.keys(daySet).length;

    const kpis =
      '<div class="kpis">' +
        kpi(Object.keys(names).length, '本学期课程', '门', 'primary') +
        kpi(list.length, '本周课程', '节', 'accent') +
        kpi(days, '本周上课天数', '天', '') +
        kpi('第 ' + st.week + ' 周', '当前查看', '', 'warn') +
      '</div>';

    const head =
      '<div class="card-head">' +
        '<div class="week-nav">' +
          '<button class="icon-btn" data-act="prev-week" type="button" aria-label="上一周">' + UI.icon('left') + '</button>' +
          '<div class="week-now"><b>第 ' + st.week + ' 周</b><span>' + U.weekRangeText(st.week) + '</span></div>' +
          '<button class="icon-btn" data-act="next-week" type="button" aria-label="下一周">' + UI.icon('right') + '</button>' +
          '<button class="btn ghost sm" data-act="today-week" type="button"' + (isThisWeek ? ' disabled' : '') + '>回到本周</button>' +
        '</div>' +
        '<div class="row">' +
          '<span class="muted sm">' + (isThisWeek ? '当前为教学第 ' + sem.week + ' 周' : '查看非当前周') + '</span>' +
          '<button class="btn subtle sm" data-act="add-course" type="button">' + UI.icon('plus') + '添加课程</button>' +
        '</div>' +
      '</div>';

    const cells = [];
    cells.push('<div class="tt-h tt-corner" style="grid-column:1;grid-row:1">节次 / 时间</div>');
    for (let d = 0; d < 7; d++) {
      const date = U.addDays(start, d);
      const today = U.dateKey(date) === todayKey;
      cells.push('<div class="tt-h' + (today ? ' is-today' : '') + '" style="grid-column:' + (d + 2) + ';grid-row:1">' +
        '<span class="dow">' + U.DAYS[d] + '</span>' +
        '<span class="date">' + (date.getMonth() + 1) + '/' + date.getDate() + '</span>' +
        (today ? '<em class="now-pill">今天</em>' : '') + '</div>');
    }
    U.PERIODS.forEach((p, i) => {
      cells.push('<div class="tt-time' + (i === nowP ? ' is-now' : '') + '" style="grid-column:1;grid-row:' + (i + 2) + '">' +
        '<b>' + p.label + '</b><span>' + p.time + '</span></div>');
    });
    for (let i = 0; i < 5; i++) {
      for (let d = 0; d < 7; d++) {
        const today = U.dateKey(U.addDays(start, d)) === todayKey;
        cells.push('<div class="tt-slot' + (today ? ' is-today' : '') + '" style="grid-column:' + (d + 2) + ';grid-row:' + (i + 2) + '"></div>');
      }
    }
    list.forEach((c) => {
      cells.push('<button class="course" type="button" data-course="' + c.id + '" data-color="' + courseColor(c.name) + '" ' +
        'style="grid-column:' + (c.day + 1) + ';grid-row:' + (c.start + 2) + '/span ' + (c.span || 1) + '">' +
        '<b>' + U.esc(c.name) + '</b>' +
        '<span class="room">' + UI.icon('pin', 'sm') + U.esc(c.room) + '</span>' +
        '<span class="teacher">' + U.esc(c.teacher || '') + '</span>' +
        '</button>');
    });

    return kpis +
      '<div class="card">' + head +
        '<div class="tt-wrap"><div class="tt">' + cells.join('') + '</div></div>' +
      '</div>' +
      '<p class="hint">提示：点击课程卡片可查看详情或删除课程；课程与「空闲教室」的占用数据是联动的。</p>';
  }

  function kpi(v, label, unit, cls) {
    return '<div class="kpi ' + (cls || '') + '"><div class="v">' + v + (unit ? '<small>' + unit + '</small>' : '') + '</div><div class="l">' + label + '</div></div>';
  }

  function courseDetail(id) {
    const c = S.state.courses.filter((x) => x.id === id)[0];
    if (!c) return;
    const weeks = c.weeks.length === 18 ? '1–18 周' : (c.weeks[0] + '–' + c.weeks[c.weeks.length - 1] + ' 周');
    const body =
      '<div class="detail-grid">' +
        item('课程名称', U.esc(c.name)) +
        item('任课教师', U.esc(c.teacher || '—')) +
        item('上课时间', U.DAYS[c.day - 1] + ' · ' + U.PERIODS[c.start].label + '（' + U.PERIODS[c.start].time + '）') +
        item('上课地点', U.esc(c.room)) +
        item('连排节次', (c.span || 1) + ' 节') +
        item('上课周次', weeks) +
      '</div>';
    UI.modal({
      title: U.esc(c.name),
      sub: '课程详情',
      body,
      actions: '<button class="btn danger" data-del type="button">' + UI.icon('trash') + '删除课程</button>' +
               '<button class="btn ghost" data-close type="button">关闭</button>',
      onMount(el, close) {
        el.querySelector('[data-del]').addEventListener('click', async () => {
          close();
          const ok = await UI.confirm({ title: '删除课程', text: '确定删除「' + U.esc(c.name) + '」吗？该操作不影响演示数据的恢复。', ok: '删除', danger: true });
          if (!ok) return;
          S.update((s) => { s.courses = s.courses.filter((x) => x.id !== c.id); });
          UI.toast('已删除课程');
        });
      },
    });
  }

  function item(label, value) {
    return '<div class="item"><b>' + label + '</b><span>' + value + '</span></div>';
  }

  function addCourse() {
    const body =
      '<form class="form-grid" data-form>' +
        '<div class="field full"><label>课程名称<em>*</em></label><input name="name" maxlength="20" placeholder="例如：数据结构" required></div>' +
        '<div class="field"><label>上课地点<em>*</em></label><input name="room" maxlength="20" placeholder="例如：教三-305" required></div>' +
        '<div class="field"><label>任课教师</label><input name="teacher" maxlength="12" placeholder="选填"></div>' +
        '<div class="field"><label>星期</label><select name="day">' + U.DAYS.map((d, i) => '<option value="' + (i + 1) + '">' + d + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>开始节次</label><select name="start">' + U.PERIODS.map((p, i) => '<option value="' + i + '">' + p.label + '（' + p.time + '）</option>').join('') + '</select></div>' +
        '<div class="field"><label>连排大节数</label><select name="span"><option value="1" selected>1 个大节（如 1-2 节）</option><option value="2">2 个大节（连续半天）</option></select>' +
          '<span class="sub">一个「大节」= 课表上的一行，如 1-2 节</span></div>' +
        '<div class="field"><label>周次类型</label><select name="parity"><option value="all">每周</option><option value="odd">单周</option><option value="even">双周</option></select></div>' +
        '<div class="field"><label>起始周</label><input name="from" type="number" min="1" max="18" value="1"></div>' +
        '<div class="field"><label>结束周</label><input name="to" type="number" min="1" max="18" value="16"></div>' +
        '<div class="form-error full" data-err hidden></div>' +
      '</form>';
    UI.modal({
      title: '添加课程',
      sub: '仅保存在本机浏览器，用于演示课表联动',
      body,
      wide: true,
      actions: '<button class="btn ghost" data-close type="button">取消</button><button class="btn primary" data-ok type="button">添加到课表</button>',
      onMount(el, close) {
        const form = el.querySelector('[data-form]');
        const errBox = el.querySelector('[data-err]');
        function fail(msg) { errBox.hidden = false; errBox.textContent = msg; }
        el.querySelector('[data-ok]').addEventListener('click', () => {
          errBox.hidden = true;
          const f = new FormData(form);
          const name = String(f.get('name') || '').trim();
          const room = String(f.get('room') || '').trim();
          const teacher = String(f.get('teacher') || '').trim();
          const day = Number(f.get('day'));
          const start = Number(f.get('start'));
          const span = Number(f.get('span'));
          const parity = String(f.get('parity'));
          const from = Number(f.get('from'));
          const to = Number(f.get('to'));
          if (!name) return fail('请填写课程名称');
          if (!room) return fail('请填写上课地点');
          if (!(from >= 1 && to <= 18 && from <= to)) return fail('周次范围需在 1–18 之间，且起始周不能大于结束周');
          if (start + span > 5) return fail('连排节次超出了每天 5 个大节的范围，请调整节次或连排数');
          const weeks = [];
          for (let w = from; w <= to; w++) {
            if (parity === 'odd' && w % 2 === 0) continue;
            if (parity === 'even' && w % 2 === 1) continue;
            weeks.push(w);
          }
          if (!weeks.length) return fail('按所选周次类型没有可用周次，请调整范围');
          const clash = S.state.courses.filter((c) =>
            c.day === day && c.weeks.some((w) => weeks.indexOf(w) >= 0) &&
            !(c.start + (c.span || 1) <= start || start + span <= c.start))[0];
          if (clash) return fail('与「' + clash.name + '」（' + U.DAYS[clash.day - 1] + ' ' + U.PERIODS[clash.start].label + '）时间冲突');
          S.update((s) => {
            s.courses.push({ id: S.nextCourseId(), name, room, teacher, day, start, span, weeks });
          });
          close();
          UI.toast('已添加课程「' + name + '」');
        });
      },
    });
  }

  /* ---------------- 空闲教室 ---------------- */
  function roomsHtml() {
    const date = selectedDate();
    const g = CH.occ.grid(date, S.state);
    const pos = currentPos();
    const fp = focusPeriod();
    const today = isToday(date);
    const dk = U.dateKey(date);

    const rooms = D.ROOMS.map((r) => ({ room: r, dist: distOf(r, pos), row: g[r.id] || [] }));
    const totalFree = rooms.filter((x) => fp == null ? x.row.some((v) => !v) : !x.row[fp]).length;
    const recos = rooms.filter((x) => !x.row[fp == null ? 0 : fp])
      .sort((a, b) => (a.dist || 0) - (b.dist || 0))
      .slice(0, 3);

    const actToday = S.state.activities.filter((a) => a.day === U.dayIdx(date) && a.weeks.indexOf(U.weekOfDate(date)) >= 0).length;

    const kpis =
      '<div class="kpis">' +
        kpi(totalFree + '<small>/ ' + D.ROOMS.length + '</small>', '可用教室（' + periodLabel(fp) + '）', '', 'accent') +
        kpi(recos.length ? distLabel(recos[0].dist).d : '—', '最近空教室', '', 'primary') +
        kpi(recos.length ? (recos[0].dist < 25 ? '本楼' : U.walkMin(recos[0].dist) + '<small>分钟</small>') : '—', '步行约需', '', '') +
        kpi(actToday, '当天社团活动', '场', 'warn') +
      '</div>';

    const locBar =
      '<div class="loc-bar">' +
        '<span class="loc-label">' + UI.icon('locate') + '我的位置</span>' +
        '<select class="input" data-loc-select style="width:auto;min-width:130px">' +
          D.ANCHORS.map((a) => '<option value="' + a.id + '"' + (S.state.loc.mode !== 'device' && S.state.loc.anchor === a.id ? ' selected' : '') + '>' + a.name + '</option>').join('') +
        '</select>' +
        '<button class="btn subtle sm" data-act="geo" type="button">' + UI.icon('pin', 'sm') + '使用设备定位</button>' +
        '<span class="loc-status">' + U.esc(posSourceText(pos)) + '</span>' +
        '<span class="spacer" style="flex:1"></span>' +
        '<span class="muted sm">' + UI.icon('info', 'sm') + ' 校园平面为实测底图（© OpenStreetMap），接入校园定位后可自动获取</span>' +
      '</div>';

    const recoCard =
      '<div class="card" style="margin-top:14px">' +
        '<div class="card-head"><h3>' + UI.icon('sparkles', 'sm') + ' 为你推荐 · 离你最近的空闲教室</h3>' +
          '<span class="muted sm">' + (today ? '今天' : (date.getMonth() + 1) + '月' + date.getDate() + '日') + ' · ' + periodLabel(fp) + '</span></div>' +
        '<div class="reco-grid">' +
          CH.cmap.panel({
            pos: pos,
            targets: recos.map((x, i) => ({ lat: x.room.lat, lng: x.room.lng, rank: i + 1, buildingId: x.room.buildingId })),
          }) +
          '<div class="reco-list">' +
            (recos.length ? recos.map((x, i) =>
              '<div class="reco-item">' +
                '<span class="reco-rank">' + (i + 1) + '</span>' +
                '<div class="reco-main"><b>' + U.esc(x.room.id) + '</b><span>' + U.esc(x.room.type) + ' · ' + x.room.cap + ' 人 · ' + freeText(x.row, fp) + '</span></div>' +
                '<div class="reco-dist"><b>' + distLabel(x.dist).d + '</b><span>' + distLabel(x.dist).w + '</span></div>' +
                '<button class="btn sm ghost" data-room-detail="' + U.esc(x.room.id) + '" type="button">详情</button>' +
              '</div>').join('')
              : UI.empty('door', '该时段没有空闲教室', '换个节次或日期试试')) +
            '<p class="hint">底图为高德地图，按 1:2000 绘制（图上 1 cm = 实地 20 m），拖动可平移、可放大；距离按「' + U.esc(pos.label) + '」到教室的直线距离估算，步行速度按 1.25 m/s 折算。</p>' +
          '</div>' +
        '</div>' +
      '</div>';

    const segDate =
      '<div class="seg">' +
        [['今天', 0], ['明天', 1], ['后天', 2]].map((p) => {
          const d = U.addDays(new Date(), p[1]);
          return '<button type="button" data-act="date-off" data-off="' + p[1] + '" class="' + (U.dateKey(d) === dk ? 'active' : '') + '">' + p[0] + '</button>';
        }).join('') +
      '</div>' +
      '<input class="input" type="date" data-date-input value="' + dk + '" style="width:auto">';

    const segPeriod =
      '<div class="seg">' +
        '<button type="button" data-act="period" data-p="now" class="' + (st.period === 'now' ? 'active' : '') + '">当前时段</button>' +
        U.PERIODS.map((p, i) => '<button type="button" data-act="period" data-p="' + i + '" class="' + (st.period === i ? 'active' : '') + '">' + p.label + '</button>').join('') +
        '<button type="button" data-act="period" data-p="all" class="' + (st.period === 'all' ? 'active' : '') + '">全天</button>' +
      '</div>';

    const buildings = ['all'].concat(D.BUILDINGS.map((b) => b.name));
    const types = ['all'].concat(D.ROOMS.map((r) => r.type).filter((v, i, a) => a.indexOf(v) === i));

    const toolbar =
      '<div class="toolbar">' +
        segDate +
        '<span class="spacer" style="flex:1"></span>' +
        '<label class="switch"><input type="checkbox" data-act="onlyfree"' + (st.onlyFree ? ' checked' : '') + '><span>只看空闲</span></label>' +
      '</div>' +
      '<div class="toolbar">' +
        segPeriod +
        '<span class="spacer" style="flex:1"></span>' +
        '<span class="search">' + UI.icon('search') + '<input id="rq" data-act="rq" value="' + U.esc(st.rq) + '" placeholder="搜索教室，如 305"></span>' +
      '</div>' +
      '<div class="toolbar" style="border-bottom:0">' +
        '<span class="muted sm">' + UI.icon('filter', 'sm') + '楼栋</span>' +
        '<div class="chips">' + buildings.map((b) =>
          '<button type="button" class="chip' + (st.building === b ? ' active' : '') + '" data-act="building" data-v="' + b + '">' + (b === 'all' ? '全部' : b) + '</button>').join('') + '</div>' +
        '<span class="spacer" style="flex:1"></span>' +
        '<span class="muted sm">类型</span>' +
        '<div class="chips">' + types.map((t) =>
          '<button type="button" class="chip' + (st.rtype === t ? ' active' : '') + '" data-act="rtype" data-v="' + U.esc(t) + '">' + (t === 'all' ? '全部' : t) + '</button>').join('') + '</div>' +
      '</div>';

    let rows = rooms;
    if (st.building !== 'all') rows = rows.filter((x) => x.room.building === st.building);
    if (st.rtype !== 'all') rows = rows.filter((x) => x.room.type === st.rtype);
    if (st.rq.trim()) {
      const q = st.rq.trim().toLowerCase();
      rows = rows.filter((x) => (x.room.id + x.room.type).toLowerCase().indexOf(q) >= 0);
    }
    if (st.onlyFree) rows = rows.filter((x) => (fp == null ? x.row.some((v) => !v) : !x.row[fp]));
    rows = rows.sort((a, b) => (a.dist || 0) - (b.dist || 0));

    const head = '<tr><th>教室</th><th>距离</th>' +
      U.PERIODS.map((p, i) => '<th' + (i === fp ? ' style="color:var(--primary-ink)"' : '') + '>' + p.label + (i === fp ? ' ●' : '') + '</th>').join('') +
      '<th></th></tr>';

    const body = rows.length ? rows.map((x) => {
      const cells = x.row.map((ev, i) => {
        if (ev) return '<td class="cell-busy' + (ev.kind === 'activity' ? ' act' : '') + (ev.mine ? ' mine' : '') + '" title="' + U.esc(ev.title + ' · ' + (ev.meta || '')) + '">' + (ev.mine ? '我的课' : '占用') + '<small>' + U.esc(ev.title) + '</small></td>';
        return '<td class="cell-free" data-room-detail="' + U.esc(x.room.id) + '" data-p="' + i + '">空闲</td>';
      }).join('');
      return '<tr>' +
        '<td class="room-name"><b>' + U.esc(x.room.id) + '</b><span>' + U.esc(x.room.type) + ' · ' + x.room.cap + ' 人</span></td>' +
        '<td class="dist-cell">' + distLabel(x.dist).d + '<br><span class="muted sm">' + distLabel(x.dist).w + '</span></td>' +
        cells +
        '<td><button class="btn sm ghost" type="button" data-room-detail="' + U.esc(x.room.id) + '">详情</button></td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="8">' + UI.empty('search', '没有符合条件的教室', '试试放宽筛选条件') + '</td></tr>';

    return kpis + '<div class="card">' + locBar + '</div>' + recoCard +
      '<div class="card" style="margin-top:14px">' +
        '<div class="card-head"><h3>' + UI.icon('door', 'sm') + ' 教室空闲矩阵</h3>' +
          '<span class="muted sm">共 ' + rows.length + ' 间 · 按距离由近到远排序</span></div>' +
        toolbar +
        '<div class="table-wrap"><table class="rooms"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
      '</div>' +
      '<p class="hint">数据说明：带「我的课程」与紫色活动标记的占用为真实数据，其余「其他班级」占用为演示生成的稳定数据，接入教务系统后可替换为真实课表。</p>';
  }

  function posSourceText(pos) {
    const loc = S.state.loc;
    if (loc.mode === 'device' && loc.lat != null) {
      const d = U.haversine({ lat: loc.lat, lng: loc.lng }, D.CAMPUS_CENTER);
      return '已使用设备定位（距校园中心 ' + U.fmtDist(d) + '）';
    }
    return '当前位置：' + pos.label + '（可手动切换）';
  }

  function freeText(row, fp) {
    if (fp != null) return row[fp] ? '占用' : '该时段空闲';
    const n = row.filter((v) => !v).length;
    return '全天空闲 ' + n + '/5 个时段';
  }

  function mapSvg(pos, recos) {
    // 兼容旧调用：改为输出 1:2000 实测校园地图面板（实现见 js/campus-map.js）
    return CH.cmap.panel({
      pos: pos,
      targets: (recos || []).map((x, i) => ({ lat: x.room.lat, lng: x.room.lng, rank: i + 1, buildingId: x.room.buildingId })),
    });
  }

  function roomDetail(roomId) {
    const room = D.ROOM_MAP[roomId];
    if (!room) return;
    const date = selectedDate();
    const g = CH.occ.grid(date, S.state);
    const row = g[room.id] || [];
    const pos = currentPos();
    const dist = distOf(room, pos);
    const freeIdx = [];
    row.forEach((v, i) => { if (!v) freeIdx.push(i); });

    const periods = U.PERIODS.map((p, i) => {
      const ev = row[i];
      return '<tr>' +
        '<td style="white-space:nowrap"><b>' + p.label + '</b><br><span class="muted sm">' + p.time + '</span></td>' +
        (ev ? '<td class="cell-busy' + (ev.kind === 'activity' ? ' act' : '') + '">占用<small>' + U.esc(ev.title) + ' · ' + U.esc(ev.meta || '') + '</small></td>'
            : '<td class="cell-free" style="cursor:default">空闲</td>') +
        '</tr>';
    }).join('');

    const body =
      '<div class="detail-grid">' +
        item('教室编号', U.esc(room.id)) +
        item('教室类型', U.esc(room.type)) +
        item('座位容量', room.cap + ' 人') +
        item('所在楼栋', U.esc(room.building)) +
        item('距当前位置', distLabel(dist).d) +
        item('步行约', distLabel(dist).w) +
      '</div>' +
      '<h4 style="margin:16px 0 8px;font-size:13.5px">' +
        (isToday(date) ? '今日' : (date.getMonth() + 1) + '月' + date.getDate() + '日') + ' 各时段占用情况</h4>' +
      '<table class="rooms" style="min-width:auto"><tbody>' + periods + '</tbody></table>' +
      '<p class="hint">' + (freeIdx.length
        ? '空闲时段：' + freeIdx.map((i) => U.PERIODS[i].label).join('、') + '，适合自习或社团临时借用。'
        : '当天 5 个时段均已排课，建议查看其他教室。') + '</p>';

    UI.modal({
      title: U.esc(room.id),
      sub: U.esc(room.building) + ' · ' + U.esc(room.type),
      body,
      wide: true,
      actions: '<button class="btn ghost" data-close type="button">关闭</button>',
      onMount(el) {
        const cbtn = document.createElement('button');
        cbtn.className = 'btn subtle';
        cbtn.type = 'button';
        cbtn.innerHTML = UI.icon('copy') + '复制教室信息';
        cbtn.addEventListener('click', async () => {
          const ok = await U.copy(room.id + '（' + room.type + '，' + room.cap + ' 人，距你 ' + distLabel(dist).d + '）');
          UI.toast(ok ? '已复制教室信息' : '复制失败，请手动选择');
        });
        el.querySelector('.modal-foot').insertBefore(cbtn, el.querySelector('.modal-foot').firstChild);
      },
    });
  }

  function useGeo() {
    if (!navigator.geolocation) { UI.toast('当前浏览器不支持定位，已保留手动选择', 'err'); return; }
    UI.toast('正在获取设备位置…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        S.update((s) => { s.loc = { mode: 'device', anchor: s.loc.anchor, lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() }; });
        const d = U.haversine({ lat: p.coords.latitude, lng: p.coords.longitude }, D.CAMPUS_CENTER);
        UI.toast(d > 8000 ? '你当前距校园约 ' + U.fmtDist(d) + '，已按校园地图推荐' : '定位成功，已按你的位置推荐');
      },
      (err) => {
        console.warn(err);
        UI.toast('定位失败（' + (err && err.message ? err.message : '权限被拒绝') + '），已保留手动选择', 'err');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }

  /* ---------------- 社团活动 ---------------- */
  function actHtml() {
    const data = S.state.activities;
    const sem = U.semester();
    const todayIdx = U.dayIdx(new Date());
    const tags = ['all'].concat(data.map((a) => a.tag).filter((v, i, arr) => arr.indexOf(v) === i));
    const list = data.filter((a) => st.atag === 'all' || a.tag === st.atag);

    const todayList = data.filter((a) => a.day === todayIdx && a.weeks.indexOf(sem.week) >= 0);
    const mineCount = data.filter((a) => a.mine).length;
    const totalJoin = data.reduce((n, a) => n + (a.mine ? 1 : 0), 0);

    const kpis =
      '<div class="kpis">' +
        kpi(data.length, '本学期社团活动', '场', 'primary') +
        kpi(todayList.length, '今天的活动', '场', 'accent') +
        kpi(mineCount, '我已报名', '场', 'warn') +
        kpi(totalJoin ? '已加入' : '未加入', '报名状态', '', '') +
      '</div>';

    const chips = '<div class="toolbar"><span class="muted sm">' + UI.icon('filter', 'sm') + '分类</span><div class="chips">' +
      tags.map((t) => '<button type="button" class="chip' + (st.atag === t ? ' active' : '') + '" data-act="atag" data-v="' + U.esc(t) + '">' + (t === 'all' ? '全部' : U.esc(t)) + '</button>').join('') +
      '</div></div>';

    const cards = list.length ? list.map((a) => {
      const pct = Math.min(100, Math.round((a.joined / a.cap) * 100));
      const full = a.joined >= a.cap && !a.mine;
      return '<article class="act-card">' +
        '<div class="top"><div><h4>' + U.esc(a.title) + '</h4><div class="club">' + U.esc(a.club) + '</div></div>' +
          '<span class="badge act">' + U.esc(a.tag) + '</span></div>' +
        '<div class="meta">' +
          '<span>' + UI.icon('clock') + U.DAYS[a.day - 1] + ' · ' + U.PERIODS[a.start].label + '（' + U.PERIODS[a.start].time + '）</span>' +
          '<span>' + UI.icon('pin') + U.esc(a.room) + ' · 第 ' + a.weeks[0] + '–' + a.weeks[a.weeks.length - 1] + ' 周</span>' +
        '</div>' +
        '<div class="desc">' + U.esc(a.desc) + '</div>' +
        '<div class="foot">' +
          '<div class="progress"><div class="bar"><i style="width:' + pct + '%"></i></div><span>已报名 ' + a.joined + '/' + a.cap + ' 人' + (full ? ' · 已满' : '') + '</span></div>' +
          '<button class="btn sm ' + (a.mine ? 'ghost' : 'primary') + '" type="button" data-join="' + a.id + '"' + (full ? ' disabled' : '') + '>' +
            (a.mine ? '取消报名' : (full ? '名额已满' : '报名参加')) + '</button>' +
        '</div>' +
        '</article>';
    }).join('') : UI.empty('users', '没有该分类的活动', '试试其他分类');

    return kpis +
      '<div class="card">' +
        '<div class="card-head"><h3>' + UI.icon('users', 'sm') + ' 社团活动与场地</h3>' +
          '<span class="muted sm">活动占用的教室会在「空闲教室」中显示为占用</span></div>' +
        chips +
        '<div class="act-grid">' + cards + '</div>' +
      '</div>' +
      '<p class="hint">报名数据为演示用途，仅保存在本机浏览器。</p>';
  }

  /* ---------------- 事件 ---------------- */
  function onClick(e) {
    const t = e.target;

    const course = t.closest('[data-course]');
    if (course) { courseDetail(course.getAttribute('data-course')); return; }

    const roomEl = t.closest('[data-room-detail]');
    if (roomEl) { roomDetail(roomEl.getAttribute('data-room-detail')); return; }

    const join = t.closest('[data-join]');
    if (join) {
      const id = join.getAttribute('data-join');
      let msg = '';
      S.update((s) => {
        const a = s.activities.filter((x) => x.id === id)[0];
        if (!a) return;
        if (a.mine) { a.mine = false; a.joined = Math.max(0, a.joined - 1); msg = '已取消报名：' + a.title; }
        else {
          if (a.joined >= a.cap) { msg = ''; return; }
          a.mine = true; a.joined += 1; msg = '报名成功：' + a.title;
        }
      });
      if (msg) UI.toast(msg);
      return;
    }

    const btn = t.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');

    if (act === 'prev-week') { st.week = U.clamp(st.week - 1, 1, 18); render(); }
    else if (act === 'next-week') { st.week = U.clamp(st.week + 1, 1, 18); render(); }
    else if (act === 'today-week') { showToday(); }
    else if (act === 'add-course') { addCourse(); }
    else if (act === 'date-off') {
      st.dateKey = U.dateKey(U.addDays(new Date(), Number(btn.getAttribute('data-off'))));
      render();
    }
    else if (act === 'period') {
      const p = btn.getAttribute('data-p');
      st.period = p === 'all' || p === 'now' ? p : Number(p);
      render();
    }
    else if (act === 'building') { st.building = btn.getAttribute('data-v'); render(); }
    else if (act === 'rtype') { st.rtype = btn.getAttribute('data-v'); render(); }
    else if (act === 'atag') { st.atag = btn.getAttribute('data-v'); render(); }
    else if (act === 'geo') { useGeo(); }
  }

  function onInput(e) {
    const t = e.target;
    if (t.id === 'rq' || t.getAttribute('data-act') === 'rq') { st.rq = t.value; render(); }
  }

  function onChange(e) {
    const t = e.target;
    if (t.getAttribute('data-act') === 'onlyfree') { st.onlyFree = t.checked; render(); return; }
    if (t.getAttribute('data-loc-select') !== null) {
      const id = t.value;
      S.update((s) => { s.loc = { mode: 'manual', anchor: id, lat: null, lng: null, at: Date.now() }; });
      UI.toast('已把位置切换为「' + ((D.ANCHORS.filter((a) => a.id === id)[0] || {}).name || id) + '」');
      return;
    }
    if (t.getAttribute('data-date-input') !== null) {
      st.dateKey = t.value || U.dateKey(new Date());
      render();
    }
  }

  CH.views.tt = { mount, tab, render };
})(window.CH);
