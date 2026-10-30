/* 校园通 · 校园地图（北方民族大学）
 * ---------------------------------------------------------------------------
 * 底图数据：OpenStreetMap（ODbL 1.0，© OpenStreetMap contributors），坐标为 WGS84。
 *          建筑 rect 为该建筑 OSM 轮廓的外接矩形；points 为 OSM 节点实测点位；
 *          道路为中心线两端点；校园范围取四条围合道路（新干公路 / 文昌北街 /
 *          广武巷 / 宁朔北街）。
 * 制图比例：图上距离 : 实地距离 = 1 : 2000
 *          1 CSS 像素 = 1/96 in = 0.264583 mm
 *          ⇒ 1 px 对应实地 0.264583 mm × 2000 = 0.529167 m
 *          ⇒ 1 m 实地 = 1.889764 px（图上 1 cm = 实地 20 m）
 *          SVG 以 1 SVG 单位 = 1 CSS px 输出，不因容器宽度而缩放，
 *          所以图上量到的长度按 1:2000 直接换算即为实地距离。
 * 投影：以校园中心为原点的局部平面直角坐标（x 向东、y 向南），
 *      米/度按所在纬度计算，1 km 内误差 < 2 m。
 * ---------------------------------------------------------------------------
 */
window.CH = window.CH || {};
(function (CH) {
  'use strict';

  /* ---------------- 比例尺与投影 ---------------- */
  var SCALE = 2000;                             // 图上 : 实地
  var MM_PER_PX = 25.4 / 96;                    // 1 CSS px = 0.264583 mm
  var M_PER_PX = (MM_PER_PX / 1000) * SCALE;    // 1:2000 时 0.5291667 m/px
  var PX_PER_M = 1 / M_PER_PX;                  // 1.8897638 px/m

  var rad = function (d) { return (d * Math.PI) / 180; };
  var CENTER = { lat: 38.4965932, lng: 106.0998505 };   // 校园中心（OSM way/461608579）
  var M_DEG_LAT = 111132.92 - 559.82 * Math.cos(2 * rad(CENTER.lat)) + 1.175 * Math.cos(4 * rad(CENTER.lat));
  var M_DEG_LNG = 111412.84 * Math.cos(rad(CENTER.lat)) - 93.5 * Math.cos(3 * rad(CENTER.lat));

  function project(lat, lng) {
    return { x: (lng - CENTER.lng) * M_DEG_LNG, y: (CENTER.lat - lat) * M_DEG_LAT };  // 米
  }
  function unproject(x, y) {
    return { lat: CENTER.lat - y / M_DEG_LAT, lng: CENTER.lng + x / M_DEG_LNG };
  }

  /* ---------------- 校园数据（实测） ---------------- */
  // 校园范围：四条围合道路的内侧，[minLng, maxLat, maxLng, minLat]
  var FRAME = [106.0966633, 38.5002334, 106.1088159, 38.4933858];

  var CAMPUS = {
    name: '北方民族大学',
    addr: '宁夏回族自治区银川市西夏区文昌北街 204 号',
    center: CENTER,
    scale: SCALE,
    frame: FRAME,
    // OSM 校园多边形（way/461608579）的外接范围，仅作数据出处说明
    osmBounds: [106.0910197, 38.500187, 106.1086579, 38.4934024],
    osm: 'way/461608579',
    source: 'OpenStreetMap（ODbL 1.0）'
  };

  // 建筑：rect = [minLng, maxLat, maxLng, minLat]，取自 OSM 建筑轮廓外接矩形
  var BUILDINGS = [
    { id: 'lib', name: '图书馆', use: '自习 · 借阅 · 研讨', rect: [106.101712, 38.4949016, 106.1030606, 38.4943781], osm: 'way/461608942' },
    { id: 'ms', name: '明实楼', use: '教学楼 · 上课', rect: [106.1039906, 38.4951377, 106.1056091, 38.4946347], osm: 'way/683690679', alt: '明勤楼/明实楼' },
    { id: 'nm', name: '南明楼·北德楼', use: '教学楼 · 机房', rect: [106.104438, 38.4965315, 106.105137, 38.4955512], osm: 'way/683690680', alt: '南明楼/北德楼' },
    { id: 'dz', name: '德泽楼', use: '实验室 · 教学', rect: [106.1064318, 38.4950959, 106.1067836, 38.4948609], osm: 'way/683690678' },
    { id: 'st2', name: '体育场 2', use: '田径场', sport: true, rect: [106.1011751, 38.4999995, 106.1021542, 38.498593], osm: 'way/759568746' },
    { id: 'bb', name: '篮球场', use: '露天球场', sport: true, rect: [106.0995633, 38.4953063, 106.1011656, 38.4943208], osm: 'way/759568747' }
  ];

  // 点位地物（OSM 节点）
  var POINTS = [
    { id: 'gym', name: '体育馆', kind: 'sport', lat: 38.4979209, lng: 106.1005344, osm: 'node/7095486562' },
    { id: 'st1', name: '体育场 1', kind: 'sport', lat: 38.4960978, lng: 106.1007439, osm: 'node/7098277616' },
    { id: 'cn', name: '北苑餐厅', kind: 'food', lat: 38.4993239, lng: 106.100261, osm: 'node/7095407012' },
    { id: 'cs', name: '南苑餐厅', kind: 'food', lat: 38.4940299, lng: 106.1013486, osm: 'node/7095486563' },
    { id: 'be', name: '公交站·文昌北街', kind: 'gate', lat: 38.4940329, lng: 106.1086761, osm: 'node/13204311139' },
    { id: 'bn', name: '公交站·新干公路', kind: 'gate', lat: 38.5001795, lng: 106.1004126, osm: 'node/13233873115' }
  ];

  // 围合校园的道路（OSM 道路中心线；lv 仅用于线宽分级）
  var ROADS = [
    { name: '新干公路', lv: 2, a: { lat: 38.5002334, lng: 106.0863013 }, b: { lat: 38.5001727, lng: 106.1087243 } },
    { name: '文昌北街', lv: 2, a: { lat: 38.5046605, lng: 106.1086934 }, b: { lat: 38.4903867, lng: 106.1088159 }, vertical: true },
    { name: '宁朔北街', lv: 2, a: { lat: 38.5057749, lng: 106.0966633 }, b: { lat: 38.4846526, lng: 106.096772 }, vertical: true },
    { name: '广武巷', lv: 3, a: { lat: 38.493401, lng: 106.0966724 }, b: { lat: 38.4933858, lng: 106.108897 } },
    { name: '怀远西路', lv: 3, a: { lat: 38.4903712, lng: 106.0865718 }, b: { lat: 38.4903238, lng: 106.0966693 } }
  ];

  BUILDINGS.forEach(function (b) {
    b.lat = (b.rect[1] + b.rect[3]) / 2;
    b.lng = (b.rect[0] + b.rect[2]) / 2;
    b.w = Math.abs(b.rect[2] - b.rect[0]) * M_DEG_LNG;
    b.h = Math.abs(b.rect[1] - b.rect[3]) * M_DEG_LAT;
  });

  var PLACE = {};
  BUILDINGS.concat(POINTS).forEach(function (p) { PLACE[p.id] = p; });

  /* ---------------- 底图：高德地图（已配准到 WGS84 / 1:2000） ----------------
   * 数据来源：高德地图瓦片（z=18，路网注记样式），按校园范围批量抓取后拼接。
   * 配准：瓦片是 GCJ-02 墨卡托坐标，逐瓦片换算 GCJ-02 -> WGS84，再投影到本模块的
   *      局部平面直角坐标（与 OSM 实测点、GPS 定位同一套坐标），因此不需要手工标定。
   * 分辨率：z=18 在纬度 38.5 度约 0.467 m/像素，比 1:2000 的 0.529 m/像素更细，
   *      显示时轻微缩小，线划与文字都清晰。
   * 生成脚本：tools/fetch_amap_base.py（可重复运行以刷新底图）。
   */
  var BASE = {
    src: 'img/base-amap.jpg',
    w: 2560, h: 2048,          // 资源像素
    mPerPx: 0.4669753,         // 资源像素 -> 实地米（z=18 墨卡托 + 局部投影）
    x0: -346.1, y0: -526.9,    // 资源左上角对应的世界坐标（米，x 向东 y 向南）
    zoom: 18,
    srcName: '高德地图'
  };
  BASE.world = {
    minX: BASE.x0, minY: BASE.y0,
    maxX: BASE.x0 + BASE.w * BASE.mPerPx,
    maxY: BASE.y0 + BASE.h * BASE.mPerPx
  };

  /* ---------------- 世界坐标 → SVG 像素 ---------------- */
  var PAD_M = 16;
  var WORLD = (function () {
    var tl = project(FRAME[1], FRAME[0]);
    var br = project(FRAME[3], FRAME[2]);
    return {
      minX: Math.min(tl.x, BASE.world.minX) - PAD_M,
      minY: Math.min(tl.y, BASE.world.minY) - PAD_M,
      maxX: Math.max(br.x, BASE.world.maxX) + PAD_M,
      maxY: Math.max(br.y, BASE.world.maxY) + PAD_M
    };
  })();
  var MAP_W = Math.round((WORLD.maxX - WORLD.minX) * PX_PER_M);   // 1:2000 图面尺寸（px）
  var MAP_H = Math.round((WORLD.maxY - WORLD.minY) * PX_PER_M);

  function sx(x) { return (x - WORLD.minX) * PX_PER_M; }
  function sy(y) { return (y - WORLD.minY) * PX_PER_M; }
  function toPx(lat, lng) {
    var p = project(lat, lng);
    return { x: sx(p.x), y: sy(p.y) };
  }
  function rectPx(rect) {
    var p1 = toPx(rect[1], rect[0]), p2 = toPx(rect[3], rect[2]);
    return {
      x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y),
      w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y)
    };
  }
  var r1 = function (n) { return Math.round(n * 10) / 10; };

  /* ---------------- 平面图（1:2000 实测视图） ---------------- */
  var BASE_MODE = 'amap';        // 'amap' = 高德地图底图；'vector' = 实测矢量图
  var lastOpts = null;           // 最近一次的绘制参数，供切换底图时重绘

  function planSvg(o) {
    o = o || {};
    var esc = CH.util.esc;
    var hot = {};
    (o.targets || []).forEach(function (t) { if (t.buildingId) hot[t.buildingId] = true; });

    var s = [];
    s.push('<svg class="cmap-svg" xmlns="http://www.w3.org/2000/svg" width="' + MAP_W + '" height="' + MAP_H +
      '" viewBox="0 0 ' + MAP_W + ' ' + MAP_H + '" role="img" aria-label="' + esc(CAMPUS.name) + '校园平面图，比例尺 1:2000">');
    s.push('<rect class="cmap-paper" x="0" y="0" width="' + MAP_W + '" height="' + MAP_H + '"/>');

    var amapMode = BASE_MODE === 'amap';

    // 官方平面图底图：按标定结果铺满其覆盖范围（1:2000，等比，不额外缩放）
    if (amapMode) {
      s.push('<image class="cmap-plan" x="' + r1(sx(BASE.world.minX)) + '" y="' + r1(sy(BASE.world.minY)) +
        '" width="' + r1((BASE.world.maxX - BASE.world.minX) * PX_PER_M) +
        '" height="' + r1((BASE.world.maxY - BASE.world.minY) * PX_PER_M) +
        '" preserveAspectRatio="none" href="' + BASE.src + '"/>');
    } else {
      // 矢量模式：校园边界 + 道路 + 建筑填充（线划在任何缩放下都锐利）
      var fr = rectPx([FRAME[0], FRAME[1], FRAME[2], FRAME[3]]);
      s.push('<rect class="cmap-range" x="' + r1(fr.x) + '" y="' + r1(fr.y) + '" width="' + r1(fr.w) + '" height="' + r1(fr.h) + '" rx="8"/>');
      ROADS.forEach(function (rd) {
        var a = toPx(rd.a.lat, rd.a.lng), b = toPx(rd.b.lat, rd.b.lng);
        var wPx = (rd.lv === 2 ? 9 : 6.5) * PX_PER_M;
        s.push('<line class="cmap-road' + (rd.lv === 2 ? ' major' : '') + '" x1="' + r1(a.x) + '" y1="' + r1(a.y) +
          '" x2="' + r1(b.x) + '" y2="' + r1(b.y) + '" stroke-width="' + r1(wPx) + '"/>');
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (rd.vertical) {
          s.push('<text class="cmap-roadname" transform="translate(' + r1(mx - 13) + ',' + r1(my) + ') rotate(-90)">' + esc(rd.name) + '</text>');
        } else {
          s.push('<text class="cmap-roadname" x="' + r1(mx) + '" y="' + r1(my - 13) + '">' + esc(rd.name) + '</text>');
        }
      });
    }

    // 100 m 网格（淡，仅作量距参考）；500 m 加重
    var x, y, X, Y;
    for (x = Math.ceil(WORLD.minX / 100) * 100; x <= WORLD.maxX; x += 100) {
      X = r1(sx(x));
      s.push('<line class="cmap-grid plan' + (x % 500 === 0 ? ' major' : '') + '" x1="' + X + '" y1="0" x2="' + X + '" y2="' + MAP_H + '"/>');
    }
    for (y = Math.ceil(WORLD.minY / 100) * 100; y <= WORLD.maxY; y += 100) {
      Y = r1(sy(y));
      s.push('<line class="cmap-grid plan' + (y % 500 === 0 ? ' major' : '') + '" x1="0" y1="' + Y + '" x2="' + MAP_W + '" y2="' + Y + '"/>');
    }

    // 实测建筑：平面图模式下只描虚线轮廓，矢量模式下是实心块
    s.push('<g class="cmap-layer-geo">');
    BUILDINGS.forEach(function (b) {
      var r = rectPx(b.rect);
      var cls = amapMode
        ? 'cmap-bld outline' + (b.sport ? ' sport' : '') + (hot[b.id] ? ' hot' : '')
        : 'cmap-bld' + (b.sport ? ' sport' : '') + (hot[b.id] ? ' hot' : '');
      s.push('<rect class="' + cls + '" x="' + r1(r.x) + '" y="' + r1(r.y) + '" width="' + r1(r.w) + '" height="' + r1(r.h) + '" rx="3"/>');
    });
    s.push('</g>');

    // 建筑名：矢量图画在轮廓左上角；高德底图本身已有楼名，标注放在轮廓上方避免压字
    BUILDINGS.forEach(function (b) {
      var r = rectPx(b.rect);
      if (amapMode) {
        s.push('<text class="cmap-bname" x="' + r1(r.x + r.w / 2) + '" y="' + r1(r.y - 10) + '">' + esc(b.name) + '</text>');
      } else if (r.w > 96 && r.h > 40) {
        s.push('<text class="cmap-bname" x="' + r1(r.x + 8) + '" y="' + r1(r.y + 17) + '" text-anchor="start">' + esc(b.name) + '</text>');
        s.push('<text class="cmap-buse" x="' + r1(r.x + 8) + '" y="' + r1(r.y + 30) + '" text-anchor="start">' + esc(b.use) + '</text>');
      } else {
        s.push('<text class="cmap-bname" x="' + r1(r.x + r.w / 2) + '" y="' + r1(r.y - 8) + '">' + esc(b.name) + '</text>');
      }
    });

    // 点位地物
    POINTS.forEach(function (p) {
      var q = toPx(p.lat, p.lng);
      s.push('<circle class="cmap-pt ' + esc(p.kind) + '" cx="' + r1(q.x) + '" cy="' + r1(q.y) + '" r="4.6"/>');
      s.push('<text class="cmap-ptl" x="' + r1(q.x + 9) + '" y="' + r1(q.y + 4) + '"' + '>' + esc(p.name) + '</text>');
    });

    // 推荐教室连线与标记
    var u = o.pos && o.pos.lat != null ? toPx(o.pos.lat, o.pos.lng) : null;
    (o.targets || []).forEach(function (t) {
      if (!u) return;
      var q = toPx(t.lat, t.lng);
      s.push('<line class="map-link" x1="' + r1(u.x) + '" y1="' + r1(u.y) + '" x2="' + r1(q.x) + '" y2="' + r1(q.y) + '"/>');
    });
    (o.targets || []).forEach(function (t) {
      var q = toPx(t.lat, t.lng);
      s.push('<circle class="cmap-tgt" cx="' + r1(q.x) + '" cy="' + r1(q.y) + '" r="7"/>');
      s.push('<text class="cmap-tgt-l" x="' + r1(q.x) + '" y="' + r1(q.y + 3.6) + '">' + esc(t.rank || '') + '</text>');
    });

    // 我的位置
    if (u) {
      s.push('<circle class="map-you-ring" cx="' + r1(u.x) + '" cy="' + r1(u.y) + '" r="8"/>');
      s.push('<circle class="map-you" cx="' + r1(u.x) + '" cy="' + r1(u.y) + '" r="5"/>');
      s.push('<text class="cmap-you-l" x="' + r1(u.x) + '" y="' + r1(u.y - 16) + '"' + '>你在这里</text>');
    }
    s.push('</svg>');
    return s.join('');
  }

  /* ---------------- 全校总览小图（自身比例，非 1:2000） ---------------- */
  var OV_W = 156;
  var OV_H = Math.round((OV_W * MAP_H) / MAP_W);
  function ovScale() { return OV_W / MAP_W; }

  function overviewSvg(o) {
    o = o || {};
    var k = ovScale();
    var s = [];
    s.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + OV_W + '" height="' + OV_H + '" viewBox="0 0 ' + OV_W + ' ' + OV_H + '">');
    s.push('<rect x="0" y="0" width="' + OV_W + '" height="' + OV_H + '" fill="#ffffff"/>');
    s.push('<image x="' + r1(sx(BASE.world.minX) * k) + '" y="' + r1(sy(BASE.world.minY) * k) +
      '" width="' + r1((BASE.world.maxX - BASE.world.minX) * PX_PER_M * k) +
      '" height="' + r1((BASE.world.maxY - BASE.world.minY) * PX_PER_M * k) +
      '" preserveAspectRatio="none" opacity="0.9" href="' + BASE.src + '"/>');
    var f = rectPx([FRAME[0], FRAME[1], FRAME[2], FRAME[3]]);
    s.push('<rect x="' + r1(f.x * k) + '" y="' + r1(f.y * k) + '" width="' + r1(f.w * k) + '" height="' + r1(f.h * k) + '" fill="#f4f7fb" stroke="rgba(120,140,170,.6)" stroke-width="1" stroke-dasharray="4 3"/>');
    ROADS.forEach(function (rd) {
      var a = toPx(rd.a.lat, rd.a.lng), b = toPx(rd.b.lat, rd.b.lng);
      s.push('<line x1="' + r1(a.x * k) + '" y1="' + r1(a.y * k) + '" x2="' + r1(b.x * k) + '" y2="' + r1(b.y * k) + '" stroke="#dbe2ec" stroke-width="1.6"/>');
    });
    BUILDINGS.forEach(function (b) {
      var r = rectPx(b.rect);
      s.push('<rect x="' + r1(r.x * k) + '" y="' + r1(r.y * k) + '" width="' + Math.max(2, r1(r.w * k)) + '" height="' + Math.max(2, r1(r.h * k)) + '" fill="rgba(72,58,180,.55)" stroke="rgba(255,255,255,.85)" stroke-width="0.8"/>');
    });
    (o.targets || []).forEach(function (t) {
      var q = toPx(t.lat, t.lng);
      s.push('<circle cx="' + r1(q.x * k) + '" cy="' + r1(q.y * k) + '" r="2.4" fill="#e0622c"/>');
    });
    if (o.pos && o.pos.lat != null) {
      var up = toPx(o.pos.lat, o.pos.lng);
      s.push('<circle cx="' + r1(up.x * k) + '" cy="' + r1(up.y * k) + '" r="3" fill="#2f7d6a" stroke="#fff" stroke-width="1"/>');
    }
    s.push('<rect class="cmap-ov-view" data-cmap-view x="0" y="0" width="' + OV_W + '" height="' + OV_H + '" rx="2"/>');
    s.push('</svg>');
    return s.join('');
  }

  /* ---------------- 比例尺 HUD（固定在视口内，随缩放重算） ---------------- */
  var HUD_M = [500, 250, 200, 100, 50, 25, 20, 10];

  function hudHtml() {
    var segs = '';
    for (var i = 0; i < 5; i++) segs += '<i class="cmap-seg' + (i % 2 ? ' on' : '') + '"></i>';
    return '' +
      '<div class="cmap-hud" aria-hidden="true">' +
        '<div class="cmap-sbar">' +
          '<div class="cmap-sbar-inner" data-cmap-barwrap>' +
            '<div class="cmap-sbar-bar" data-cmap-bar>' + segs + '</div>' +
            '<div class="cmap-sbar-lab"><span>0</span><span data-cmap-barm>50 m</span></div>' +
          '</div>' +
          '<div class="cmap-sbar-note">图上量得的长度 ×2000 = 实地长度</div>' +
        '</div>' +
        '<div class="cmap-northbox"><svg viewBox="0 0 24 32" width="18" height="24"><polygon points="12,1 21,26 12,20 3,26" fill="currentColor"/></svg><span>N</span></div>' +
      '</div>';
  }

  /* ---------------- 面板 HTML ---------------- */
  var view = { zoom: 1, cx: null, cy: null, key: null };
  var intent = { x: null, y: null };   // 应用希望对准的中心（布局抖动后按它重试）

  function zoomLevels() { return [0.5, 1, 2]; }

  function panel(o) {
    o = o || {};
    lastOpts = o;
    var z = view.zoom;
    var hasPos = !!(o.pos && o.pos.lat != null);
    var key = hasPos ? (o.pos.lat.toFixed(5) + ',' + o.pos.lng.toFixed(5)) : 'none';
    var amapMode = BASE_MODE === 'amap';
    return '' +
      '<div class="campus-map cmap" data-cmap data-key="' + key + '"' +
        (hasPos ? ' data-ulat="' + o.pos.lat + '" data-ulng="' + o.pos.lng + '"' : '') + '>' +
        '<div class="cmap-bar">' +
          '<b>' + CH.util.esc(CAMPUS.name) + '</b>' +
          '<span class="cmap-sub">' + (amapMode ? '高德地图' : '实测矢量图') + '</span>' +
          '<span class="cmap-ratio" data-cmap-ratio>1 : ' + Math.round(SCALE / z) + '</span>' +
          '<span class="cmap-sp"></span>' +
          '<span class="cmap-vsize" data-cmap-viewsize>视野 —</span>' +
          '<button class="cmap-btn" type="button" data-cmap-base title="在高德地图与实测矢量图之间切换">' +
            (amapMode ? '矢量图' : '高德图') + '</button>' +
          '<span class="cmap-zoomgrp">' +
            '<button class="cmap-btn" type="button" data-cmap-zoom="out" aria-label="缩小" title="缩小">−</button>' +
            '<button class="cmap-btn" type="button" data-cmap-zoom="in" aria-label="放大" title="放大">＋</button>' +
          '</span>' +
          '<button class="cmap-btn wide" type="button" data-cmap-here title="把地图移到我的位置">回到我的位置</button>' +
        '</div>' +
        '<div class="cmap-view">' +
          '<div class="cmap-scroll" data-cmap-scroll>' +
            '<div class="cmap-stage" data-cmap-stage style="width:' + MAP_W + 'px;height:' + MAP_H + 'px">' + planSvg(o) + '</div>' +
          '</div>' +
          hudHtml() +
          '<div class="cmap-ov" data-cmap-ov title="全校总览：点击可定位">' + overviewSvg(o) + '</div>' +
        '</div>' +
        '<div class="cmap-foot">' +
          '<span>' + (amapMode ? '高德地图 · 按 1:2000 绘制 · 虚线＝实测轮廓' : '实测矢量图 · 按 1:2000 绘制 · 可量距') + '</span>' +
          '<span class="cmap-attr">底图 © 高德地图 · 坐标校核 © OpenStreetMap 贡献者（ODbL 1.0）</span>' +
        '</div>' +
      '</div>';
  }

  /* ---------------- 交互：拖动 / 缩放 / 总览联动 ---------------- */
  function mount(root) {
    var box = root.querySelector ? root.querySelector('[data-cmap]') : null;
    if (!box) return;
    var scroller = box.querySelector('[data-cmap-scroll]');
    var stage = box.querySelector('[data-cmap-stage]');
    var svg = stage ? stage.firstChild : null;
    var ratioEl = box.querySelector('[data-cmap-ratio]');
    var viewEl = box.querySelector('[data-cmap-viewsize]');
    var barEl = box.querySelector('[data-cmap-bar]');
    var barWrap = box.querySelector('[data-cmap-barwrap]');
    var barLabel = box.querySelector('[data-cmap-barm]');
    var ovBox = box.querySelector('[data-cmap-ov]');
    var ovRect = box.querySelector('[data-cmap-view]');
    if (!scroller || !stage || !svg) return;

    var key = box.getAttribute('data-key') || '';
    var levels = zoomLevels();
    var here = (function () {
      var la = parseFloat(box.getAttribute('data-ulat')), ln = parseFloat(box.getAttribute('data-ulng'));
      if (!isFinite(la) || !isFinite(ln)) return null;
      var p = toPx(la, ln);
      return { x: Math.min(MAP_W, Math.max(0, p.x)), y: Math.min(MAP_H, Math.max(0, p.y)) };
    })();

    function clampCenter(c) {
      return { x: Math.min(MAP_W, Math.max(0, c.x)), y: Math.min(MAP_H, Math.max(0, c.y)) };
    }

    function drawScaleBar(z) {
      if (!barEl) return;
      var barM = HUD_M[HUD_M.length - 1];
      for (var i = 0; i < HUD_M.length; i++) {          // 取不超过 150 px 的最大整值
        if (HUD_M[i] * PX_PER_M * z <= 150) { barM = HUD_M[i]; break; }
      }
      var total = barM * PX_PER_M * z;
      var segW = (total / 5).toFixed(2) + 'px';
      Array.prototype.forEach.call(barEl.children, function (seg) { seg.style.width = segW; });
      if (barWrap) barWrap.style.width = total.toFixed(2) + 'px';   // 外框严格等于标尺长度
      if (barLabel) barLabel.textContent = barM + ' m';
    }

    function applyZoom(z, keepCenter) {
      view.zoom = z;
      svg.style.transformOrigin = '0 0';
      svg.style.transform = 'scale(' + z + ')';
      stage.style.width = Math.round(MAP_W * z) + 'px';
      stage.style.height = Math.round(MAP_H * z) + 'px';
      if (ratioEl) ratioEl.textContent = '1 : ' + Math.round(SCALE / z);
      drawScaleBar(z);
      if (keepCenter) centerOn(view.cx, view.cy);
      syncOverview();
    }

    function centerOn(mapX, mapY) {
      var z = view.zoom;
      var c = clampCenter({ x: mapX, y: mapY });
      view.cx = c.x; view.cy = c.y;
      intent.x = c.x; intent.y = c.y;
      scroller.scrollLeft = Math.round(c.x * z - scroller.clientWidth / 2);
      scroller.scrollTop = Math.round(c.y * z - scroller.clientHeight / 2);
    }

    // 布局完全落定后再居中一次：卡片宽度、滚动条出现都会改变 clientWidth/Height，
    // 只调用一次会出现十几像素的偏移
    function centerOnSettled(mapX, mapY) {
      var tx = mapX, ty = mapY, tries = 0;
      function step() {
        centerOn(tx, ty);
        syncOverview();
        if (++tries < 3 && window.requestAnimationFrame) requestAnimationFrame(step);
      }
      step();
    }

    function syncOverview() {
      var z = view.zoom;
      var left = scroller.scrollLeft / z, top = scroller.scrollTop / z;
      var vw = Math.min(MAP_W, scroller.clientWidth / z), vh = Math.min(MAP_H, scroller.clientHeight / z);
      if (ovRect) {
        var k = ovScale();
        var l = Math.max(0, left), t = Math.max(0, top);
        ovRect.setAttribute('x', r1(l * k));
        ovRect.setAttribute('y', r1(t * k));
        ovRect.setAttribute('width', r1(Math.max(4, Math.min(MAP_W - l, vw)) * k));
        ovRect.setAttribute('height', r1(Math.max(4, Math.min(MAP_H - t, vh)) * k));
      }
      if (viewEl) viewEl.textContent = '视野 ' + Math.round(scroller.clientWidth / z * M_PER_PX) + ' × ' + Math.round(scroller.clientHeight / z * M_PER_PX) + ' m';
      view.cx = left + vw / 2;
      view.cy = top + vh / 2;
    }

    scroller.addEventListener('scroll', syncOverview, { passive: true });
    window.addEventListener('resize', syncOverview);

    // 卡片宽度可能在挂载后变化（字体晚到、窗口缩放、分栏重排）：
    // 用 ResizeObserver 按「意图中心」重新对准，并刷新视野读数。
    function resync() {
      if (intent.x != null) centerOn(intent.x, intent.y);
      syncOverview();
    }
    if (window.ResizeObserver) {
      try { new ResizeObserver(resync).observe(scroller); } catch (e) { /* noop */ }
    }
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(resync)['catch'](function () { /* noop */ });
    }

    // 拖动平移（触摸交给原生滚动）
    var drag = null;
    scroller.addEventListener('pointerdown', function (e) {
      cancelRecenter();
      if (e.pointerType === 'touch') return;
      drag = { x: e.clientX, y: e.clientY, l: scroller.scrollLeft, t: scroller.scrollTop };
      scroller.classList.add('dragging');
      if (scroller.setPointerCapture) { try { scroller.setPointerCapture(e.pointerId); } catch (err) { /* noop */ } }
    });
    scroller.addEventListener('pointermove', function (e) {
      if (!drag) return;
      scroller.scrollLeft = drag.l - (e.clientX - drag.x);
      scroller.scrollTop = drag.t - (e.clientY - drag.y);
    });
    function endDrag() {
      if (drag && view.cx != null) { intent.x = view.cx; intent.y = view.cy; }
      drag = null;
      scroller.classList.remove('dragging');
    }
    scroller.addEventListener('pointerup', endDrag);
    scroller.addEventListener('pointercancel', endDrag);
    scroller.addEventListener('pointerleave', endDrag);

    if (ovBox) {
      ovBox.addEventListener('click', function (e) {
        var r = ovBox.getBoundingClientRect();
        if (!r.width) return;
        var k = ovScale();
        centerOn((((e.clientX - r.left) / r.width) * OV_W) / k, (((e.clientY - r.top) / r.height) * OV_H) / k);
        syncOverview();
      });
    }

    var bar = box.querySelector('.cmap-bar');
    if (bar) {
      bar.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('[data-cmap-zoom],[data-cmap-here],[data-cmap-base]') : null;
        if (!t) return;
        if (t.hasAttribute('data-cmap-base')) {
          // 官方平面图 ⇄ 实测矢量图：换底图但保持当前视野与缩放
          BASE_MODE = BASE_MODE === 'amap' ? 'vector' : 'amap';
          if (stage) stage.innerHTML = planSvg(lastOpts || {});
          var sub = box.querySelector('.cmap-sub');
          if (sub) sub.textContent = BASE_MODE === 'amap' ? '高德地图' : '实测矢量图';
          var foot = box.querySelector('.cmap-foot span');
          if (foot) foot.textContent = BASE_MODE === 'amap' ? '高德地图 · 按 1:2000 绘制 · 虚线＝实测轮廓' : '实测矢量图 · 按 1:2000 绘制 · 可量距';
          t.textContent = BASE_MODE === 'amap' ? '矢量图' : '高德图';
          applyZoom(view.zoom, false);
          centerOn(view.cx, view.cy);
          syncOverview();
        } else if (t.hasAttribute('data-cmap-here')) {
          if (here) centerOnSettled(here.x, here.y);
        } else {
          var dir = t.getAttribute('data-cmap-zoom');
          var i = levels.indexOf(view.zoom);
          if (i < 0) i = levels.indexOf(1);
          var next = levels[Math.min(levels.length - 1, Math.max(0, i + (dir === 'in' ? 1 : -1)))];
          if (next !== view.zoom) applyZoom(next, true);
        }
        syncOverview();
      });
    }

    // 首次渲染以「我的位置」居中；同一次会话内保留用户的平移与缩放
    var tx, ty;
    if (view.key !== key) {
      view.key = key;
      view.zoom = 1;
      tx = here ? here.x : MAP_W / 2;
      ty = here ? here.y : MAP_H / 2;
    } else {
      tx = view.cx == null ? MAP_W / 2 : view.cx;
      ty = view.cy == null ? MAP_H / 2 : view.cy;
    }
    view.cx = tx; view.cy = ty;              // 先写回，applyZoom 内部的 syncOverview 会覆盖它
    applyZoom(view.zoom, false);
    centerOnSettled(tx, ty);
  }

  CH.cmap = {
    SCALE: SCALE,
    M_PER_PX: M_PER_PX,
    PX_PER_M: PX_PER_M,
    CAMPUS: CAMPUS,
    FRAME: FRAME,
    BUILDINGS: BUILDINGS,
    POINTS: POINTS,
    ROADS: ROADS,
    BASE: BASE,
    WORLD: WORLD,
    mapPx: { w: MAP_W, h: MAP_H },
    place: function (id) { return PLACE[id]; },
    // 「我的位置」可选参照点：实测建筑中心 + 实测点位
    anchorList: function () {
      return BUILDINGS.concat(POINTS).map(function (p) {
        return { id: p.id, name: p.name, lat: p.lat, lng: p.lng };
      });
    },
    toPx: toPx,
    project: project,
    unproject: unproject,
    plan: planSvg,
    overview: overviewSvg,
    panel: panel,
    mount: mount
  };
})(window.CH);
