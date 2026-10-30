/* 校园通 · 静态数据与演示种子数据 */
(function (CH) {
  'use strict';
  const H = 3600e3, D = 24 * H;
  const wk = (a, b, parity) => {
    const out = [];
    for (let w = a; w <= b; w++) {
      if (parity === 'odd' && w % 2 === 0) continue;
      if (parity === 'even' && w % 2 === 1) continue;
      out.push(w);
    }
    return out;
  };

  /* ---------- 校园地理模型：北方民族大学（真实坐标，来自 OpenStreetMap） ----------
   * 地理底图与投影、1:2000 比例尺定义见 js/campus-map.js（CH.cmap）。
   * 坐标为 WGS84 实测值，不再使用虚构坐标；4 栋教学楼/图书馆取 OSM 建筑轮廓，
   * 体育馆等仅有节点的地物按点位处理。
   */
  const CM = CH.cmap;
  const BUILDING_IDS = ['lib', 'ms', 'nm', 'dz', 'gym'];   // 有教室/自习位的建筑
  const BUILDINGS = BUILDING_IDS.map((id) => {
    const p = CM.place(id);
    return { id: p.id, name: p.name, lat: p.lat, lng: p.lng, extent: p.rect || null, use: p.use || '' };
  });
  const ANCHORS = CM.anchorList();
  const CAMPUS_CENTER = CM.CAMPUS.center;

  // [楼, 房间号, 类型, 容量]（楼名与 CH.cmap 实测建筑一致）
  const ROOM_DEFS = [
    ['图书馆', '自习室101', '自习室', 80], ['图书馆', '自习室102', '自习室', 80],
    ['图书馆', '研读间A', '研讨间', 12], ['图书馆', '研读间B', '研讨间', 12],
    ['图书馆', '研讨间C', '研讨间', 16],
    ['明实楼', '201', '多媒体教室', 120], ['明实楼', '202', '普通教室', 60], ['明实楼', '203', '普通教室', 48],
    ['明实楼', '301', '多媒体教室', 90], ['明实楼', '302', '多媒体教室', 90], ['明实楼', '303', '普通教室', 60],
    ['明实楼', '401', '机房', 60], ['明实楼', '405', '研讨间', 24],
    ['南明楼·北德楼', '101', '多媒体教室', 120], ['南明楼·北德楼', '102', '普通教室', 60],
    ['南明楼·北德楼', '201', '多媒体教室', 90], ['南明楼·北德楼', '202', '普通教室', 48],
    ['南明楼·北德楼', '301', '机房', 60], ['南明楼·北德楼', '302', '机房', 48],
    ['南明楼·北德楼', '401', '研讨间', 20],
    ['德泽楼', '101', '实验室', 40], ['德泽楼', '102', '实验室', 40],
    ['德泽楼', '201', '多媒体教室', 60], ['德泽楼', '202', '研讨间', 24],
    ['体育馆', '活动室1', '活动室', 40], ['体育馆', '羽毛球A', '活动室', 24], ['体育馆', '羽毛球B', '活动室', 24],
  ];
  const byName = {};
  BUILDINGS.forEach((b) => { byName[b.name] = b; });
  const ROOMS = [];
  {
    const counters = {};
    ROOM_DEFS.forEach((d) => {
      const b = byName[d[0]];
      const i = counters[d[0]] = (counters[d[0]] || 0) + 1;
      // 房间坐标在所属建筑轮廓内抖动，幅度按建筑实际尺寸取值（米×0.2 ≈ 十几米）
      const span = b.extent
        ? { lat: Math.abs(b.extent[1] - b.extent[3]), lng: Math.abs(b.extent[2] - b.extent[0]) }
        : { lat: 0.0004, lng: 0.0005 };
      ROOMS.push({
        id: d[0] + '-' + d[1], building: d[0], buildingId: b.id, name: d[1],
        type: d[2], cap: d[3],
        lat: b.lat + ((i % 3) - 1) * span.lat * 0.2,
        lng: b.lng + (((i * 3) % 5) - 2) * span.lng * 0.14,
      });
    });
  }
  const ROOM_MAP = {};
  ROOMS.forEach((r) => { ROOM_MAP[r.id] = r; });

  const COURSE_POOL = ['高等数学', '大学物理', '数据结构', '线性代数', '大学英语', '离散数学', '概率论', '操作系统', '计算机网络', '编译原理', '思政理论', '数字电路'];
  const TEACHER_POOL = ['王海', '张伟', '陈静', '李娜', '周敏', '赵磊', '孙悦'];

  const LOST_CATS = ['证件', '电子', '书籍', '钥匙', '衣物', '其他'];
  const LOST_COLORS = ['黑色', '白色', '灰色', '红色', '橙色', '黄色', '绿色', '青色', '蓝色', '紫色', '粉色', '棕色'];
  const QA_TAGS = ['选课', '政策', '办事', '生活', '考研', '社团'];

  /* ---------- 种子数据 ---------- */
  CH.seed = function () {
    const now = Date.now();
    return {
      version: 2,
      theme: null,
      profile: { name: '林小满', initial: '林', college: '计算机学院 · 软件 2301 班' },
      loc: { mode: 'manual', anchor: 'lib', lat: null, lng: null, at: 0 },
      courses: [
        { id: 'c01', name: '线性代数', teacher: '王海', room: '明实楼-201', day: 1, start: 0, span: 1, weeks: wk(1, 16) },
        { id: 'c02', name: '数据结构', teacher: '陈静', room: '南明楼·北德楼-301', day: 1, start: 1, span: 1, weeks: wk(1, 16) },
        { id: 'c03', name: '体育（羽毛球）', teacher: '刘强', room: '体育馆-羽毛球A', day: 1, start: 3, span: 1, weeks: wk(1, 16) },
        { id: 'c04', name: '高等数学（上）', teacher: '张伟', room: '明实楼-201', day: 2, start: 0, span: 1, weeks: wk(1, 16) },
        { id: 'c05', name: '大学物理', teacher: '周敏', room: '德泽楼-101', day: 2, start: 2, span: 1, weeks: wk(1, 16) },
        { id: 'c06', name: '程序设计实验', teacher: '陈静', room: '南明楼·北德楼-302', day: 2, start: 4, span: 1, weeks: wk(3, 16) },
        { id: 'c07', name: '大学英语', teacher: 'Sarah', room: '德泽楼-202', day: 3, start: 0, span: 1, weeks: wk(1, 16) },
        { id: 'c08', name: '离散数学', teacher: '李娜', room: '南明楼·北德楼-101', day: 3, start: 1, span: 1, weeks: wk(1, 16) },
        { id: 'c09', name: '高等数学（上）', teacher: '张伟', room: '明实楼-201', day: 4, start: 0, span: 1, weeks: wk(1, 16) },
        { id: 'c10', name: '大学物理', teacher: '周敏', room: '德泽楼-101', day: 4, start: 2, span: 1, weeks: wk(1, 16) },
        { id: 'c11', name: '线性代数', teacher: '王海', room: '明实楼-201', day: 4, start: 3, span: 1, weeks: wk(1, 16) },
        { id: 'c12', name: '离散数学', teacher: '李娜', room: '南明楼·北德楼-101', day: 5, start: 0, span: 1, weeks: wk(1, 16) },
        { id: 'c13', name: '思想道德与法治', teacher: '赵磊', room: '德泽楼-201', day: 5, start: 2, span: 1, weeks: wk(1, 12) },
        { id: 'c14', name: '创新创业实践', teacher: '孙悦', room: '南明楼·北德楼-401', day: 6, start: 4, span: 1, weeks: wk(2, 14, 'even') },
      ],
      activities: [
        { id: 'a1', title: '机器人社 · 招新宣讲与技术体验', club: '机器人社', room: '南明楼·北德楼-301', day: 3, start: 4, span: 1, weeks: wk(3, 16), cap: 60, joined: 47, mine: false, tag: '招新', desc: '机械臂现场演示、往年竞赛作品展示，零基础也能来，现场可以直接报名入社。' },
        { id: 'a2', title: '摄影协会 · 人像摄影分享会', club: '摄影协会', room: '明实楼-202', day: 5, start: 4, span: 1, weeks: wk(1, 16), cap: 40, joined: 22, mine: false, tag: '分享', desc: '本期主题「自然光人像」，欢迎带相机来交流，结束后有自愿外拍环节。' },
        { id: 'a3', title: '街舞社 · 周四常规排练', club: '街舞社', room: '体育馆-活动室1', day: 4, start: 4, span: 1, weeks: wk(1, 16), cap: 40, joined: 31, mine: true, tag: '排练', desc: 'Breaking / Hiphop 分组训练，新人有学长带基本功，穿宽松衣服即可。' },
        { id: 'a4', title: '考研互助小组 · 数学答疑', club: '考研互助小组', room: '图书馆-研读间B', day: 4, start: 4, span: 1, weeks: wk(1, 16), cap: 12, joined: 9, mine: false, tag: '学习', desc: '高数 / 线代错题互讲，自带题目来，限 12 人保证讨论质量。' },
        { id: 'a5', title: '辩论队 · 新生模拟赛', club: '校辩论队', room: '南明楼·北德楼-101', day: 6, start: 3, span: 1, weeks: wk(2, 16), cap: 50, joined: 18, mine: false, tag: '比赛', desc: '本周辩题「大学生应不应该躺平」，观众也欢迎，现场可以报名试训。' },
        { id: 'a6', title: '程序设计竞赛集训（ACM）', club: 'ACM 集训队', room: '南明楼·北德楼-302', day: 7, start: 0, span: 1, weeks: wk(1, 16), cap: 48, joined: 36, mine: false, tag: '集训', desc: '周日上午套题训练 + 下午讲评，C++/算法基础较好的同学可以直接来机房。' },
        { id: 'a7', title: '应急救护培训（校医院 × 红十字会）', club: '青年志愿者协会', room: '德泽楼-201', day: 2, start: 2, span: 1, weeks: wk(4, 12), cap: 80, joined: 54, mine: false, tag: '培训', desc: '心肺复苏 + AED 实操，考核通过发救护员证书，计 2 个志愿时长。' },
      ],
      lost: [
        { id: 'l1', type: 'found', title: '校园卡（姓名：王*）', cat: '证件', color: '白色', place: '图书馆-自习室101', ts: now - 3 * H, desc: '在靠窗座位捡到一张校园卡，卡面磨损比较严重，已交给一楼服务台代管，可凭学号认领。', author: '李同学', contact: '微信 lq_0912', status: 'open', img: null },
        { id: 'l2', type: 'lost', title: '黑色 AirPods 充电盒', cat: '电子', color: '黑色', place: '南明楼·北德楼-301', ts: now - 20 * H, desc: '昨天下午高数课后发现充电盒不见了，盒盖内侧贴了一张星球贴纸，拾到的同学麻烦联系我，必有重谢！', author: '陈同学', contact: '手机 138****6621', status: 'open', img: null },
        { id: 'l3', type: 'found', title: '深蓝色保温杯', cat: '其他', color: '蓝色', place: '体育馆-活动室1', ts: now - 2 * D, desc: '杯身有「城市马拉松」字样和一张手写贴纸，已放在看台入口的失物架上。', author: '周同学', contact: 'QQ 4471****', status: 'open', img: null },
        { id: 'l4', type: 'lost', title: '钥匙串（小熊挂件）', cat: '钥匙', color: '灰色', place: '北苑餐厅-2楼', ts: now - 3 * D, desc: '三把钥匙加一个小熊挂件，可能是打饭时落在餐盘回收处附近，捡到请联系，谢谢！', author: '林同学', contact: '微信 xxm_1024', status: 'open', img: null },
        { id: 'l5', type: 'found', title: '《高等数学》笔记本', cat: '书籍', color: '白色', place: '明实楼-201', ts: now - 4 * D, desc: '封面写着「计科 2301」，内页有大量习题笔记，现在放在明实楼一楼值班室。', author: '赵同学', contact: '手机 159****2233', status: 'open', img: null },
        { id: 'l6', type: 'lost', title: '学生证 + 公交卡', cat: '证件', color: '白色', place: '南苑餐厅-门口', ts: now - 5 * D, desc: '透明卡套里有学生证和一张公交卡，补办很麻烦，拜托好心人留意一下。', author: '吴同学', contact: '微信 wu_2003', status: 'open', img: null },
        { id: 'l7', type: 'found', title: '黑色折叠伞', cat: '其他', color: '黑色', place: '德泽楼-101', ts: now - 6 * D, desc: '伞柄有磨损，落在教室最后一排，认领时请说明伞面花纹。', author: '孙同学', contact: 'QQ 1083****', status: 'returned', img: null },
        { id: 'l8', type: 'lost', title: '棕色钱包', cat: '其他', color: '棕色', place: '北苑餐厅-1楼', ts: now - 8 * H, desc: '短款棕色钱包，内有少量现金和两张银行卡，证件对我很重要，拾到必有酬谢。', author: '郑同学', contact: '电话 137****8890', status: 'open', img: null },
        { id: 'l9', type: 'found', title: '米白色针织围巾', cat: '衣物', color: '白色', place: '体育馆-活动室1', ts: now - 30 * H, desc: '米白色针织围巾，叠好放在器材室门口的椅子上了，认领请描述长度和图案。', author: '许同学', contact: '微信 xu__77', status: 'open', img: null },
        { id: 'l10', type: 'found', title: '黑色无线耳机充电盒', cat: '电子', color: '黑色', place: '南明楼·北德楼-202', ts: now - 18 * H, desc: '收拾教室时在最后一排捡到一个黑色无线耳机充电盒，盒盖内侧贴着一张星球贴纸，已交到南明楼一楼值班室。', author: '值班室 · 王师傅', contact: '南明楼一楼值班室 0571-8888-1901', status: 'open', img: null },
        { id: 'l11', type: 'found', title: '蓝色保温杯（杯身有贴纸）', cat: '其他', color: '蓝色', place: '德泽楼-101', ts: now - 26 * H, desc: '蓝色不锈钢保温杯，杯身有一张卡通贴纸，落在教室后排，现放在德泽楼值班室。', author: '黄同学', contact: 'QQ 2205****', status: 'open', img: null },
      ],
      questions: [
        {
          id: 'q1', title: '「数据结构」和「算法设计」应该先修哪门？', tags: ['选课'],
          body: '大一下学期选课，两门都开了。听说算法设计需要数据结构基础，但课表上两门时间不冲突，能不能一起选？求学长学姐给点建议。',
          author: '小满', ts: now - 2 * H, votes: 18, voted: false, status: 'open', policyId: null,
          answers: [
            { id: 'q1a1', body: '建议先修数据结构。算法设计第一节课就会用到链表、树、图，没有基础会非常吃力。', author: '计科 2201 · 张', ts: now - 1.5 * H, votes: 9, voted: false, accepted: false, official: false },
            { id: 'q1a2', body: '我当年是两门一起选的，能跟上但很累，每周要多花 6 小时刷题。基础扎实的话可以一起选。', author: '软工 2102 · 李', ts: now - 1 * H, votes: 5, voted: false, accepted: false, official: false },
          ],
        },
        {
          id: 'q2', title: '图书馆 4 楼自习位需要预约吗？几点开始放号？', tags: ['生活'],
          body: '期末周想找个安静的地方复习，听说 4 楼要抢座，求具体规则。',
          author: '阿离', ts: now - 5 * H, votes: 12, voted: false, status: 'resolved', policyId: 'p4',
          answers: [
            { id: 'q2a1', body: '需要预约：公众号「图书馆微服务」→ 空间预约，每天早上 7:00 放当天的号，每人可约 4 小时，可续约一次。详细规则见「政策与指南」里的座位预约条目。', author: '图书馆志愿者', ts: now - 4 * H, votes: 21, voted: false, accepted: true, official: false },
            { id: 'q2a2', body: '补充：4 楼东侧是静音区，不允许讨论；插座在靠墙的 12、13 号桌。', author: '匿名同学', ts: now - 3 * H, votes: 6, voted: false, accepted: false, official: false },
          ],
        },
        {
          id: 'q3', title: '学生证丢了怎么补办？需要多久？', tags: ['办事'],
          body: '今天发现学生证不见了，下周要坐火车回家，补办来得及吗？',
          author: '吴同学', ts: now - 8 * H, votes: 9, voted: false, status: 'resolved', policyId: 'p2',
          answers: [
            { id: 'q3a1', body: '先在「校园卡服务」公众号挂失，然后带身份证和一寸照片到行政楼 208 教务处学籍科办理，工本费 15 元，3 个工作日可取。着急坐车的话可以同时开一份《在读证明》临时使用。电话：0571-8888-1001。', author: '教务处 · 学籍科', ts: now - 7 * H, votes: 24, voted: false, accepted: true, official: true },
          ],
        },
        {
          id: 'q4', title: '想加入机器人社团，需要什么基础？什么时候招新？', tags: ['社团'],
          body: '大一新生，会一点 Python，对机械臂很感兴趣，不知道招新要不要笔试。',
          author: 'Kevin', ts: now - 1 * D, votes: 8, voted: false, status: 'open', policyId: null,
          answers: [
            { id: 'q4a1', body: '招新在每学期第 3 周，笔试考 C 语言基础 + 一道逻辑题，面试主要看动手意愿。Python 基础够用了，周三晚在南明楼·北德楼-301 有招新宣讲，可以直接来。', author: '机器人社 · 技术组', ts: now - 20 * H, votes: 10, voted: false, accepted: false, official: false },
          ],
        },
        {
          id: 'q5', title: '考研复试时，计算机二级和软考中级哪个更有用？', tags: ['考研'],
          body: '现在大二，时间有限只能考一个，目标是考本校计算机学硕，求过来人指点。',
          author: '一杯冰美式', ts: now - 2 * D, votes: 15, voted: false, status: 'open', policyId: null,
          answers: [],
        },
        {
          id: 'q6', title: '求推荐期末周人少、可以通宵的复习地点', tags: ['生活'],
          body: '宿舍太吵，图书馆 22:30 就闭馆了，有没有其他地方可以待到后半夜？',
          author: '夜猫子', ts: now - 3 * D, votes: 23, voted: false, status: 'resolved', policyId: null,
          answers: [
            { id: 'q6a1', body: '南明楼 1 楼有两间通宵自习室，23:00 后刷卡进入，期末周开放到早上 6:30，人少插座多。', author: '学生会 · 权益部', ts: now - 3 * D + 2 * H, votes: 17, voted: false, accepted: true, official: true },
            { id: 'q6a2', body: '24 小时便利店二楼也不错，就是有点吵，适合刷题不适合背书。', author: '匿名同学', ts: now - 3 * D + 5 * H, votes: 3, voted: false, accepted: false, official: false },
          ],
        },
        {
          id: 'q7', title: '体育课选课有什么推荐？想要不太累又能拿高分的', tags: ['选课'],
          body: '下学期要选体育，羽毛球和乒乓球哪个给分好？',
          author: '大一萌新', ts: now - 4 * D, votes: 6, voted: false, status: 'open', policyId: null,
          answers: [
            { id: 'q7a1', body: '羽毛球、乒乓球给分都不错，但很抢手，选课系统开放 3 秒内就没了，记得定闹钟。', author: '体育委员', ts: now - 4 * D + 3 * H, votes: 4, voted: false, accepted: false, official: false },
          ],
        },
        {
          id: 'q8', title: '宿舍校园网总是断，报修找谁？', tags: ['政策', '办事'],
          body: '最近晚上经常断网，重启路由器也没用，该联系哪个部门？',
          author: '网线另一头', ts: now - 26 * H, votes: 11, voted: false, status: 'resolved', policyId: 'p1',
          answers: [
            { id: 'q8a1', body: '在公众号「校园网络服务」提交自助报修，填写楼栋和房间号，2 小时内会有远程排查；整栋断网可直接拨打网络与信息中心值班电话 0571-8888-1200。详细流程见「政策与指南」。', author: '网络与信息中心', ts: now - 24 * H, votes: 14, voted: false, accepted: true, official: true },
          ],
        },
      ],
    };
  };

  /* ---------- 政策与指南（静态） ---------- */
  const POLICIES = [
    {
      id: 'p1', title: '校园网开通与故障报修', dept: '网络与信息中心', phone: '0571-8888-1200',
      place: '图书馆 1 楼 · 网络服务大厅', hours: '周一至周五 8:30–17:00', updated: '2026-09-01',
      audience: '全体在校生', keywords: ['校园网', '断网', '报修', 'WiFi', '网费'],
      materials: ['学生证或一卡通', '宿舍网口编号（自助机可查）'],
      steps: ['公众号「校园网络服务」→ 自助报修，填写楼栋、房间号与故障描述', '2 小时内远程排查，未解决则安排上门', '上门维修一般在 24 小时内完成', '完成后在公众号内确认并评价'],
      note: '夜间断网请先检查宿舍交换机电源；整栋楼断网可直接拨打值班电话。',
    },
    {
      id: 'p2', title: '学生证补办流程', dept: '教务处 · 学籍科', phone: '0571-8888-1001',
      place: '行政楼 208', hours: '周一至周五 8:30–11:30 / 13:30–16:30', updated: '2026-08-20',
      audience: '全体在校生', keywords: ['学生证', '补办', '挂失', '在读证明'],
      materials: ['身份证', '一寸免冠照片 1 张', '《学生证补办申请表》（教务处网站下载）', '挂失凭证'],
      steps: ['在「校园卡服务」公众号完成挂失', '填写补办申请表并由学院盖章', '到行政楼 208 提交材料并缴费 15 元', '3 个工作日后凭回执领取新证'],
      note: '补办期间可申请《在读证明》临时使用，当场可取。',
    },
    {
      id: 'p3', title: '缓考与缓修申请', dept: '教务处 · 考务科', phone: '0571-8888-1003',
      place: '行政楼 205', hours: '周一至周五 8:30–16:30', updated: '2026-07-15',
      audience: '因病 / 因事无法参考的学生', keywords: ['缓考', '缓修', '考试', '请假'],
      materials: ['《缓考申请表》', '医院诊断证明或相关证明', '学院教学院长签字'],
      steps: ['考试前 3 个工作日提交申请（突发疾病可事后 2 天内补办）', '学院审核后报教务处备案', '缓考一般安排在下学期开学第 2 周，随补考一起进行'],
      note: '缓考成绩按正常考试记载，不计入补考次数。',
    },
    {
      id: 'p4', title: '图书馆座位与研读间预约', dept: '图书馆', phone: '0571-8888-1300',
      place: '图书馆 1 楼 · 服务台', hours: '每天 7:00–22:30', updated: '2026-09-10',
      audience: '全体师生', keywords: ['图书馆', '座位', '预约', '研读间', '自习'],
      materials: ['校园卡（刷卡入馆）'],
      steps: ['公众号「图书馆微服务」→ 空间预约', '每天 7:00 放当天的号，每人可约 4 小时，可续约一次', '到馆后扫码签到，离开超过 30 分钟座位自动释放', '研读间需 3 人及以上成团预约'],
      note: '4 楼东侧为静音区，禁止讨论与外放；期末周通宵自习室开放至次日 6:30。',
    },
    {
      id: 'p5', title: '宿舍门禁与晚归登记', dept: '学生处 · 宿管中心', phone: '0571-8888-1400',
      place: '各宿舍楼管理室', hours: '门禁时间 23:30', updated: '2026-06-30',
      audience: '全体住宿生', keywords: ['宿舍', '门禁', '晚归', '宿管'],
      materials: ['校园卡'],
      steps: ['23:30 后刷卡入楼自动记录', '晚归需在管理室登记事由', '一学期累计 3 次晚归将通报学院'],
      note: '实习、竞赛等特殊情况可提前在「宿舍服务」小程序报备，报备后不计入晚归。',
    },
    {
      id: 'p6', title: '勤工助学岗位申请', dept: '学生处 · 资助中心', phone: '0571-8888-1102',
      place: '学生活动中心 102', hours: '周一至周五 9:00–17:00', updated: '2026-09-05',
      audience: '全体在校生（家庭经济困难学生优先）', keywords: ['勤工助学', '兼职', '资助', '岗位'],
      materials: ['《勤工助学申请表》', '本学期课表（用于排班）'],
      steps: ['每学期第 1–2 周在资助中心公众号查看岗位', '线上申请并选择意向岗位', '用人单位面试', '录用后签订岗位协议，按月发放酬金'],
      note: '每人每月不超过 40 小时，时薪按学校勤工助学标准执行。',
    },
  ];

  /* ---------- 校园通讯录（静态，号码为示例） ---------- */
  const CONTACTS = [
    { id: 'ct1', name: '教务处 · 学籍科', dept: '教务处', phone: '0571-8888-1001', place: '行政楼 208', hours: '周一至周五 8:30–11:30 / 13:30–16:30', tags: ['学生证', '学籍', '在读证明'] },
    { id: 'ct2', name: '教务处 · 选课中心', dept: '教务处', phone: '0571-8888-1002', place: '行政楼 210', hours: '周一至周五 8:30–16:30', tags: ['选课', '退课', '学分'] },
    { id: 'ct3', name: '教务处 · 考务科', dept: '教务处', phone: '0571-8888-1003', place: '行政楼 205', hours: '周一至周五 8:30–16:30', tags: ['缓考', '成绩', '考试安排'] },
    { id: 'ct4', name: '学生处 · 资助中心', dept: '学生处', phone: '0571-8888-1102', place: '学生活动中心 102', hours: '周一至周五 9:00–17:00', tags: ['助学金', '贷款', '勤工助学'] },
    { id: 'ct5', name: '学生处 · 心理咨询中心', dept: '学生处', phone: '0571-8888-1100', place: '学生活动中心 305', hours: '每天 9:00–21:00（紧急情况 24 小时）', tags: ['心理咨询', '情绪', '24小时'] },
    { id: 'ct6', name: '图书馆 · 服务台', dept: '图书馆', phone: '0571-8888-1300', place: '图书馆 1 楼', hours: '每天 7:00–22:30', tags: ['借还书', '座位预约', '失物代管'] },
    { id: 'ct7', name: '宿管中心', dept: '学生处', phone: '0571-8888-1400', place: '各宿舍楼管理室', hours: '每天 8:00–23:30', tags: ['门禁', '维修', '晚归登记'] },
    { id: 'ct8', name: '校医院 · 急诊', dept: '校医院', phone: '0571-8888-1500', place: '校医院 1 楼', hours: '24 小时', tags: ['急诊', '发热', '外伤', '24小时'] },
    { id: 'ct9', name: '保卫处（24 小时）', dept: '保卫处', phone: '0571-8888-1600', place: '校门警务室', hours: '24 小时', tags: ['失窃', '安全', '报警', '24小时'] },
    { id: 'ct10', name: '网络与信息中心', dept: '网络与信息中心', phone: '0571-8888-1200', place: '图书馆 1 楼', hours: '周一至周五 8:30–17:00', tags: ['校园网', '一卡通', '系统账号'] },
    { id: 'ct11', name: '就业指导中心', dept: '就业指导中心', phone: '0571-8888-1700', place: '学生活动中心 201', hours: '周一至周五 9:00–17:00', tags: ['就业', '实习', '三方协议'] },
    { id: 'ct12', name: '体育部 · 场馆预约', dept: '体育部', phone: '0571-8888-1800', place: '体育馆 1 楼', hours: '每天 9:00–21:00', tags: ['场馆', '羽毛球', '预约'] },
    { id: 'ct13', name: '王海（辅导员）', dept: '计算机学院', phone: '138-8888-2301', place: '计算机学院楼 412', hours: '工作日 9:00–17:00（突发随时）', tags: ['辅导员', '请假', '突发情况'], role: '软件 2301–2304 班' },
    { id: 'ct14', name: '陈静（班主任）', dept: '计算机学院', phone: '138-8888-2302', place: '计算机学院楼 408', hours: '工作日 9:00–17:00', tags: ['班主任', '学业规划', '竞赛'], role: '软件 2301 班' },
  ];

  CH.DATA = { BUILDINGS, ANCHORS, CAMPUS_CENTER, ROOMS, ROOM_MAP, COURSE_POOL, TEACHER_POOL, LOST_CATS, LOST_COLORS, QA_TAGS, POLICIES, CONTACTS };
})(window.CH);
