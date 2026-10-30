/* 校园通 · 校园问答（问答广场 / 政策与指南 / 校园通讯录） */
(function (CH) {
  'use strict';
  const U = CH.util, UI = CH.ui, S = CH.store, D = CH.DATA;
  CH.views = CH.views || {};

  const st = {
    tab: 'ask',
    tag: 'all',
    sort: 'new',
    q: '',
    detailId: null,
    pq: '',
    cq: '',
    cgroup: 'all',
  };
  let root = null, pane = null, inited = false;

  function mount(el, sub) {
    root = el;
    st.tab = sub === 'policy' ? 'policy' : sub === 'contacts' ? 'contacts' : 'ask';
    root.innerHTML =
      '<div class="tabs">' +
        '<a href="#/qa" class="' + (st.tab === 'ask' ? 'active' : '') + '">' + UI.icon('chat') + '问答广场</a>' +
        '<a href="#/qa/policy" class="' + (st.tab === 'policy' ? 'active' : '') + '">' + UI.icon('doc') + '政策与指南</a>' +
        '<a href="#/qa/contacts" class="' + (st.tab === 'contacts' ? 'active' : '') + '">' + UI.icon('phone') + '校园通讯录</a>' +
      '</div><div data-pane></div>';
    pane = root.querySelector('[data-pane]');
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    inited = true;
    render();
  }

  function tab(sub) {
    const next = sub === 'policy' ? 'policy' : sub === 'contacts' ? 'contacts' : 'ask';
    if (next === st.tab) return;
    st.tab = next;
    st.detailId = null;
    root.querySelectorAll('.tabs a').forEach((a) => {
      const href = a.getAttribute('href');
      a.classList.toggle('active',
        (href === '#/qa' && next === 'ask') || (href === '#/qa/policy' && next === 'policy') || (href === '#/qa/contacts' && next === 'contacts'));
    });
    render();
  }

  function render() {
    if (!inited) return;
    if (st.tab === 'ask') {
      CH.setHeader('校园问答', '选课、办事、政策都能问；官方部门会用「官方答复」标识回复');
      renderPane(st.detailId ? detailHtml() : askHtml());
    } else if (st.tab === 'policy') {
      CH.setHeader('政策与指南', '办事流程、所需材料、责任部门与联系电话');
      renderPane(policyHtml());
    } else {
      CH.setHeader('校园通讯录', '按部门或关键词查找负责老师与办公电话');
      renderPane(contactsHtml());
    }
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

  function kpi(v, label, unit, cls) {
    return '<div class="kpi ' + (cls || '') + '"><div class="v">' + v + (unit ? '<small>' + unit + '</small>' : '') + '</div><div class="l">' + label + '</div></div>';
  }

  /* ---------------- 问答广场 ---------------- */
  function askHtml() {
    const qs = S.state.questions;
    const answers = qs.reduce((n, q) => n + q.answers.length, 0);
    const resolved = qs.filter((q) => q.status === 'resolved').length;
    const official = qs.reduce((n, q) => n + q.answers.filter((a) => a.official).length, 0);

    const kpis = '<div class="kpis">' +
      kpi(qs.length, '问题总数', '条', 'primary') +
      kpi(answers, '累计回答', '条', 'accent') +
      kpi(resolved, '已解决', '条', '') +
      kpi(official, '官方答复', '条', 'warn') +
      '</div>';

    const toolbar =
      '<div class="toolbar">' +
        '<div class="seg">' +
          '<button type="button" data-act="sort" data-v="new" class="' + (st.sort === 'new' ? 'active' : '') + '">最新</button>' +
          '<button type="button" data-act="sort" data-v="hot" class="' + (st.sort === 'hot' ? 'active' : '') + '">最热</button>' +
          '<button type="button" data-act="sort" data-v="open" class="' + (st.sort === 'open' ? 'active' : '') + '">待解决</button>' +
        '</div>' +
        '<span class="spacer" style="flex:1"></span>' +
        '<span class="search">' + UI.icon('search') + '<input id="qq" value="' + U.esc(st.q) + '" placeholder="搜索问题 / 回答"></span>' +
        '<button class="btn primary sm" data-act="ask" type="button">' + UI.icon('plus') + '我要提问</button>' +
      '</div>' +
      '<div class="toolbar" style="border-bottom:0">' +
        '<span class="muted sm">' + UI.icon('filter', 'sm') + '标签</span>' +
        '<div class="chips">' + ['all'].concat(D.QA_TAGS).map((t) =>
          '<button type="button" class="chip' + (st.tag === t ? ' active' : '') + '" data-act="tag" data-v="' + t + '">' + (t === 'all' ? '全部' : t) + '</button>').join('') + '</div>' +
      '</div>';

    let list = qs.slice();
    if (st.tag !== 'all') list = list.filter((q) => q.tags.indexOf(st.tag) >= 0);
    if (st.q.trim()) {
      const s = st.q.trim().toLowerCase();
      list = list.filter((q) => (q.title + q.body + q.answers.map((a) => a.body).join(' ')).toLowerCase().indexOf(s) >= 0);
    }
    if (st.sort === 'new') list.sort((a, b) => b.ts - a.ts);
    else if (st.sort === 'hot') list.sort((a, b) => (b.votes + b.answers.length * 2) - (a.votes + a.answers.length * 2));
    else list.sort((a, b) => (a.status === 'resolved' ? 1 : 0) - (b.status === 'resolved' ? 1 : 0) || b.ts - a.ts);

    const cards = list.length ? list.map((q) =>
      '<article class="qa-card" data-open="' + q.id + '">' +
        '<h4>' + U.esc(q.title) +
          (q.status === 'resolved' ? '<span class="badge resolved">' + UI.icon('checkcircle', 'sm') + '已解决</span>' : '<span class="badge open">待解决</span>') +
          (q.policyId ? '<span class="tag ghost">关联政策</span>' : '') +
        '</h4>' +
        (q.body ? '<p class="excerpt">' + U.esc(q.body) + '</p>' : '') +
        '<div class="meta">' +
          q.tags.map((t) => '<span class="tag">' + U.esc(t) + '</span>').join('') +
          '<span>' + UI.icon('up') + q.votes + ' 赞同</span>' +
          '<span>' + UI.icon('chat') + q.answers.length + ' 个回答</span>' +
          '<span>' + UI.icon('user') + U.esc(q.author) + '</span>' +
          '<span>' + UI.icon('clock') + U.relTime(q.ts) + '</span>' +
        '</div>' +
      '</article>').join('') : UI.empty('chat', '没有找到相关问题', '试试换个关键词，或者点击「我要提问」');

    return kpis +
      '<div class="card"><div class="card-head"><h3>' + UI.icon('chat', 'sm') + ' 问答广场</h3>' +
        '<span class="muted sm">共 ' + list.length + ' 个问题</span></div>' +
        toolbar +
        '<div class="qa-list">' + cards + '</div>' +
      '</div>';
  }

  function detailHtml() {
    const q = S.state.questions.filter((x) => x.id === st.detailId)[0];
    if (!q) { st.detailId = null; return askHtml(); }
    const policy = q.policyId ? D.POLICIES.filter((p) => p.id === q.policyId)[0] : null;
    const best = q.answers.filter((a) => a.accepted);
    const rest = q.answers.filter((a) => !a.accepted);

    const answerHtml = (a) =>
      '<div class="answer' + (a.accepted ? ' best' : '') + '">' +
        '<div class="av">' + U.esc((a.author || '匿').slice(0, 1)) + '</div>' +
        '<div class="a-main">' +
          '<div class="a-head"><b>' + U.esc(a.author) + '</b>' +
            (a.official ? '<span class="badge official">' + UI.icon('checkcircle', 'sm') + '官方答复</span>' : '') +
            (a.accepted ? '<span class="badge resolved">' + UI.icon('check', 'sm') + '最佳回答</span>' : '') +
            '<span>' + U.relTime(a.ts) + '</span>' +
          '</div>' +
          '<div class="a-body">' + U.esc(a.body) + '</div>' +
          '<div class="a-foot">' +
            '<button class="vote-btn' + (a.voted ? ' voted' : '') + '" type="button" data-vote-a="' + a.id + '">' + UI.icon('up') + a.votes + '</button>' +
            '<button class="btn sm ghost" type="button" data-accept="' + a.id + '">' + (a.accepted ? '取消最佳' : '设为最佳回答') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    return '<div class="card">' +
      '<div class="qa-detail">' +
        '<button class="btn sm ghost back" data-act="back" type="button">' + UI.icon('back', 'sm') + '返回列表</button>' +
        '<div class="row">' + q.tags.map((t) => '<span class="tag">' + U.esc(t) + '</span>').join('') +
          '<span class="badge ' + (q.status === 'resolved' ? 'resolved' : 'open') + '">' + (q.status === 'resolved' ? '已解决' : '待解决') + '</span></div>' +
        '<h2>' + U.esc(q.title) + '</h2>' +
        '<div class="q-meta">' +
          '<span>' + UI.icon('user', 'sm') + ' ' + U.esc(q.author) + '</span>' +
          '<span>' + UI.icon('clock', 'sm') + ' ' + U.relTime(q.ts) + '</span>' +
          '<span>' + UI.icon('chat', 'sm') + ' ' + q.answers.length + ' 个回答</span>' +
        '</div>' +
        (q.body ? '<div class="body">' + U.esc(q.body) + '</div>' : '') +
        '<div class="row">' +
          '<button class="vote-btn' + (q.voted ? ' voted' : '') + '" type="button" data-vote-q="' + q.id + '">' + UI.icon('up') + '赞同 ' + q.votes + '</button>' +
          (policy ? '<button class="btn sm subtle" type="button" data-policy="' + policy.id + '">' + UI.icon('doc', 'sm') + '查看相关政策：' + U.esc(policy.title) + '</button>' : '') +
        '</div>' +

        '<div class="answers">' +
          '<h3>' + UI.icon('chat', 'sm') + ' 全部回答（' + q.answers.length + '）</h3>' +
          (q.answers.length ? (best.map(answerHtml).join('') + rest.map(answerHtml).join('')) : UI.empty('chat', '还没有人回答', '来做第一个回答的人吧')) +
          '<div class="answer-form">' +
            '<div class="row" style="justify-content:space-between">' +
              '<b style="font-size:13.5px">写下你的回答</b>' +
              '<label class="switch"><input type="checkbox" id="anon"><span>匿名回答</span></label>' +
            '</div>' +
            '<textarea class="input" id="answerBody" rows="4" maxlength="500" placeholder="分享你的经验或官方口径，越具体越有帮助"></textarea>' +
            '<div class="row" style="justify-content:flex-end">' +
              '<button class="btn primary sm" type="button" data-act="answer" data-q="' + q.id + '">' + UI.icon('check', 'sm') + '提交回答</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function askModal() {
    const body =
      '<form class="form-grid" data-form>' +
        '<div class="field full"><label>问题标题<em>*</em></label><input name="title" maxlength="60" placeholder="一句话说明你的问题" required></div>' +
        '<div class="field full"><label>补充说明</label><textarea name="body" maxlength="500" placeholder="已经尝试过什么、具体情况如何"></textarea></div>' +
        '<div class="field full"><label>标签（可多选，最多 3 个）</label>' +
          '<div class="chips" data-tags>' + D.QA_TAGS.map((t) => '<button type="button" class="chip" data-tag="' + t + '">' + t + '</button>').join('') + '</div></div>' +
        '<div class="field full"><label class="switch"><input type="checkbox" name="anon"><span>匿名提问</span></label></div>' +
        '<div class="form-error full" data-err hidden></div>' +
      '</form>';
    UI.modal({
      title: '我要提问',
      sub: '提问前可以先在「政策与指南」里搜一下，很多办事问题已有官方口径',
      body,
      wide: true,
      actions: '<button class="btn ghost" data-close type="button">取消</button><button class="btn primary" data-ok type="button">发布问题</button>',
      onMount(el, close) {
        const chosen = [];
        const tagBox = el.querySelector('[data-tags]');
        tagBox.addEventListener('click', (e) => {
          const b = e.target.closest('[data-tag]');
          if (!b) return;
          const t = b.getAttribute('data-tag');
          const i = chosen.indexOf(t);
          if (i >= 0) { chosen.splice(i, 1); b.classList.remove('active'); }
          else {
            if (chosen.length >= 3) { UI.toast('最多选择 3 个标签', 'err'); return; }
            chosen.push(t); b.classList.add('active');
          }
        });
        const err = el.querySelector('[data-err]');
        el.querySelector('[data-ok]').addEventListener('click', () => {
          const f = new FormData(el.querySelector('[data-form]'));
          const title = String(f.get('title') || '').trim();
          const text = String(f.get('body') || '').trim();
          const anon = !!f.get('anon');
          if (title.length < 5) { err.hidden = false; err.textContent = '标题至少 5 个字，方便别人快速理解'; return; }
          if (!chosen.length) { err.hidden = false; err.textContent = '请至少选择 1 个标签'; return; }
          const q = {
            id: U.uid('q'), title, body: text, tags: chosen.slice(),
            author: anon ? '匿名同学' : S.state.profile.name, ts: Date.now(),
            votes: 0, voted: false, status: 'open', policyId: null, answers: [],
          };
          S.update((s) => { s.questions.unshift(q); });
          close();
          st.detailId = q.id;
          render();
          UI.toast('问题已发布');
        });
      },
    });
  }

  /* ---------------- 政策与指南 ---------------- */
  function policyHtml() {
    let list = D.POLICIES.slice();
    if (st.pq.trim()) {
      const s = st.pq.trim().toLowerCase();
      list = list.filter((p) => (p.title + p.dept + p.keywords.join(' ') + p.note).toLowerCase().indexOf(s) >= 0);
    }
    const cards = list.length ? list.map((p) =>
      '<article class="policy-card" data-policy="' + p.id + '">' +
        '<h4>' + UI.icon('doc', 'sm') + U.esc(p.title) + '</h4>' +
        '<div class="p-meta">' +
          '<span>' + UI.icon('users', 'sm') + U.esc(p.dept) + '</span>' +
          '<span>' + UI.icon('phone', 'sm') + U.esc(p.phone) + '</span>' +
          '<span>' + UI.icon('clock', 'sm') + U.esc(p.hours) + '</span>' +
        '</div>' +
        '<p class="p-note">' + U.esc(p.note) + '</p>' +
        '<div class="row" style="margin-top:auto">' +
          '<span class="tag ghost">' + U.esc(p.audience) + '</span>' +
          '<span class="muted sm">更新于 ' + U.esc(p.updated) + '</span>' +
        '</div>' +
      '</article>').join('') : UI.empty('search', '没有找到相关办事指南', '换个关键词试试，例如「学生证」「缓考」');

    return '<div class="card">' +
      '<div class="card-head"><h3>' + UI.icon('doc', 'sm') + ' 政策与办事指南</h3>' +
        '<span class="search">' + UI.icon('search') + '<input id="pq" value="' + U.esc(st.pq) + '" placeholder="搜索政策 / 关键词"></span></div>' +
      '<div class="policy-grid">' + cards + '</div>' +
      '</div>' +
      '<p class="hint">共 ' + D.POLICIES.length + ' 条指南，内容为演示数据，实际以学校最新文件为准。</p>';
  }

  function policyDetail(id) {
    const p = D.POLICIES.filter((x) => x.id === id)[0];
    if (!p) return;
    const body =
      '<dl class="kv-grid">' +
        '<dt>责任部门</dt><dd>' + U.esc(p.dept) + '</dd>' +
        '<dt>联系电话</dt><dd><a href="tel:' + U.esc(p.phone.replace(/[^0-9-]/g, '')) + '">' + U.esc(p.phone) + '</a></dd>' +
        '<dt>办理地点</dt><dd>' + U.esc(p.place) + '</dd>' +
        '<dt>办公时间</dt><dd>' + U.esc(p.hours) + '</dd>' +
        '<dt>适用对象</dt><dd>' + U.esc(p.audience) + '</dd>' +
        '<dt>更新时间</dt><dd>' + U.esc(p.updated) + '</dd>' +
      '</dl>' +
      '<h4 style="margin:16px 0 4px;font-size:13.5px">所需材料</h4>' +
      '<div class="material-list">' + p.materials.map((m) => '<span>' + U.esc(m) + '</span>').join('') + '</div>' +
      '<h4 style="margin:18px 0 8px;font-size:13.5px">办理流程</h4>' +
      '<div class="steps">' + p.steps.map((s, i) =>
        '<div class="step"><span class="n">' + (i + 1) + '</span><p>' + U.esc(s) + '</p></div>').join('') + '</div>' +
      '<div class="ai-note" style="margin-top:10px">' + UI.icon('info') + '<span>' + U.esc(p.note) + '</span></div>';

    UI.modal({
      title: U.esc(p.title),
      sub: U.esc(p.dept),
      body,
      wide: true,
      actions: '<a class="btn subtle" href="tel:' + U.esc(p.phone.replace(/[^0-9-]/g, '')) + '">' + UI.icon('phone') + '拨打电话</a>' +
               '<button class="btn ghost" data-copy type="button">' + UI.icon('copy') + '复制电话</button>' +
               '<button class="btn ghost" data-close type="button">关闭</button>',
      onMount(el) {
        el.querySelector('[data-copy]').addEventListener('click', async () => {
          const ok = await U.copy(p.phone);
          UI.toast(ok ? '已复制：' + p.phone : '复制失败', ok ? '' : 'err');
        });
      },
    });
  }

  /* ---------------- 校园通讯录 ---------------- */
  function contactsHtml() {
    const groups = ['all'].concat(D.CONTACTS.map((c) => c.dept).filter((v, i, a) => a.indexOf(v) === i));
    let list = D.CONTACTS.slice();
    if (st.cgroup !== 'all') list = list.filter((c) => c.dept === st.cgroup);
    if (st.cq.trim()) {
      const s = st.cq.trim().toLowerCase();
      list = list.filter((c) => (c.name + c.dept + (c.role || '') + c.tags.join(' ') + c.place + c.phone).toLowerCase().indexOf(s) >= 0);
    }

    const chipRow = '<div class="toolbar" style="border-bottom:0">' +
      '<span class="muted sm">' + UI.icon('filter', 'sm') + '部门</span><div class="chips">' +
      groups.map((g) => '<button type="button" class="chip' + (st.cgroup === g ? ' active' : '') + '" data-act="cgroup" data-v="' + U.esc(g) + '">' + (g === 'all' ? '全部' : U.esc(g)) + '</button>').join('') +
      '</div></div>';

    const cards = list.length ? list.map((c) =>
      '<article class="contact-card">' +
        '<div class="c-head"><div class="c-av">' + UI.icon(c.role ? 'user' : 'phone') + '</div>' +
          '<div><h4>' + U.esc(c.name) + '</h4><span>' + U.esc(c.role || c.dept) + '</span></div></div>' +
        '<a class="phone-line" href="tel:' + U.esc(c.phone.replace(/[^0-9-]/g, '')) + '">' + UI.icon('phone', 'sm') + U.esc(c.phone) + '</a>' +
        '<div class="c-meta">' +
          '<span>' + UI.icon('pin', 'sm') + U.esc(c.place) + '</span>' +
          '<span>' + UI.icon('clock', 'sm') + U.esc(c.hours) + '</span>' +
        '</div>' +
        '<div class="chips">' + c.tags.map((t) => '<span class="tag ghost" style="font-size:10.5px">' + U.esc(t) + '</span>').join('') + '</div>' +
        '<div class="c-actions">' +
          '<a class="btn sm primary" href="tel:' + U.esc(c.phone.replace(/[^0-9-]/g, '')) + '">' + UI.icon('phone', 'sm') + '拨打</a>' +
          '<button class="btn sm ghost" type="button" data-copy-phone="' + U.esc(c.phone) + '">' + UI.icon('copy', 'sm') + '复制号码</button>' +
        '</div>' +
      '</article>').join('') : UI.empty('phone', '没有找到相关联系人', '试试搜索「校园网」「学生证」这类关键词');

    return '<div class="card">' +
      '<div class="card-head"><h3>' + UI.icon('phone', 'sm') + ' 校园通讯录</h3>' +
        '<span class="search">' + UI.icon('search') + '<input id="cq" value="' + U.esc(st.cq) + '" placeholder="搜索部门 / 老师 / 电话"></span></div>' +
      chipRow +
      '<div class="contact-grid">' + cards + '</div>' +
      '</div>' +
      '<p class="hint">电话号码为演示数据（格式与真实号码一致，但不可拨打），实际使用请替换为学校公开号码。</p>';
  }

  /* ---------------- 事件 ---------------- */
  function onClick(e) {
    const t = e.target;

    const open = t.closest('[data-open]');
    if (open) { st.detailId = open.getAttribute('data-open'); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }

    const pol = t.closest('[data-policy]');
    if (pol) { policyDetail(pol.getAttribute('data-policy')); return; }

    const cp = t.closest('[data-copy-phone]');
    if (cp) {
      U.copy(cp.getAttribute('data-copy-phone')).then((ok) => UI.toast(ok ? '已复制号码' : '复制失败', ok ? '' : 'err'));
      return;
    }

    const vq = t.closest('[data-vote-q]');
    if (vq) {
      const id = vq.getAttribute('data-vote-q');
      S.update((s) => {
        const q = s.questions.filter((x) => x.id === id)[0];
        if (!q) return;
        q.voted = !q.voted;
        q.votes += q.voted ? 1 : -1;
      });
      return;
    }

    const va = t.closest('[data-vote-a]');
    if (va) {
      const aid = va.getAttribute('data-vote-a');
      S.update((s) => {
        s.questions.forEach((q) => q.answers.forEach((a) => {
          if (a.id === aid) { a.voted = !a.voted; a.votes += a.voted ? 1 : -1; }
        }));
      });
      return;
    }

    const ac = t.closest('[data-accept]');
    if (ac) {
      const aid = ac.getAttribute('data-accept');
      S.update((s) => {
        const q = s.questions.filter((x) => x.id === st.detailId)[0];
        if (!q) return;
        const target = q.answers.filter((a) => a.id === aid)[0];
        const turningOn = target && !target.accepted;
        q.answers.forEach((a) => { a.accepted = false; });
        if (target) target.accepted = turningOn;
        q.status = turningOn ? 'resolved' : 'open';
      });
      UI.toast('已更新最佳回答');
      return;
    }

    const btn = t.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');

    if (act === 'back') { st.detailId = null; render(); return; }
    if (act === 'ask') { askModal(); return; }
    if (act === 'sort') { st.sort = btn.getAttribute('data-v'); render(); return; }
    if (act === 'tag') { st.tag = btn.getAttribute('data-v'); render(); return; }
    if (act === 'cgroup') { st.cgroup = btn.getAttribute('data-v'); render(); return; }
    if (act === 'answer') {
      const qid = btn.getAttribute('data-q');
      const ta = pane.querySelector('#answerBody');
      const anon = pane.querySelector('#anon');
      const text = ta ? ta.value.trim() : '';
      if (text.length < 5) { UI.toast('回答至少 5 个字', 'err'); return; }
      const a = {
        id: U.uid('a'), body: text,
        author: anon && anon.checked ? '匿名同学' : S.state.profile.name,
        ts: Date.now(), votes: 0, voted: false, accepted: false, official: false,
      };
      S.update((s) => {
        const q = s.questions.filter((x) => x.id === qid)[0];
        if (q) q.answers.push(a);
      });
      UI.toast('回答已发布');
      return;
    }
  }

  function onInput(e) {
    if (e.target.id === 'qq') { st.q = e.target.value; render(); return; }
    if (e.target.id === 'pq') { st.pq = e.target.value; render(); return; }
    if (e.target.id === 'cq') { st.cq = e.target.value; render(); return; }
  }

  CH.views.qa = { mount, tab, render };
})(window.CH);
