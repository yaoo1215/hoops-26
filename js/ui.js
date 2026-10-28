/* UI: single-page, no framework. Screens render into #app. */
(function () {
  'use strict';
  const { RNG, fmtM, payrollOf, marketSalary, CAP, clamp } = Core;
  const L = League, O = Office;

  let state = null;
  let view = 'dashboard';
  let lastGame = null;
  let live = null;          // {game, result} 上一场（含事件）
  let trade = { team: null, outA: [], outB: [] };
  let draft = null;
  let faFilter = '';
  let replay = { idx: 0, playing: false, timer: null, events: [], home: null, away: null };

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (w, l) => (w + l ? (w / (w + l)).toFixed(3).replace(/^0/, '') : '-');
  const my = () => state.teams[state.userTeam];
  const players = (abbr) => state.players.filter((p) => p.team === abbr && !p.retired);
  const byId = (id) => state.players.find((p) => p.id === id);
  const zn = (x) => ZH.name(typeof x === 'string' ? x : (x && x.name) || '');
  const zt = (abbr) => ZH.team(abbr);
  const zts = (abbr) => ZH.teamShort(abbr);
  function localizeText(s) {
    if (!state) return s;
    if (!s) return s;
    let out = String(s);
    for (const t of Object.values(state.teams)) {
      out = out.split(t.name).join(ZH.team(t.abbr));
      out = out.split(' ' + t.abbr + ' ').join(' ' + ZH.teamShort(t.abbr) + ' ');
      if (out.indexOf(t.abbr + ' ') === 0) out = ZH.teamShort(t.abbr) + out.slice(t.abbr.length);
      if (out.endsWith(' ' + t.abbr)) out = out.slice(0, -t.abbr.length) + ZH.teamShort(t.abbr);
    }
    for (const p of state.players) {
      if (p.name && out.indexOf(p.name) >= 0) out = out.split(p.name).join(ZH.name(p.name));
    }
    return out;
  }
  // Display scale = NBA 2K27 values. The engine keeps its own 0-99 scale; these
  // two helpers are the only place the conversion happens.
  const toK = (x) => Math.round(68 + ((x == null ? 60 : x) - 46) / 1.72);
  const ov = (x) => toK(typeof x === 'number' ? x : x && x.ovr);
  const pt = (x) => toK(typeof x === 'number' ? x : (x && (x.pot == null ? x.ovr : x.pot)));
  const ovrCls = (o) => (o >= 90 ? 's' : o >= 82 ? 'a' : 'b');
  const phaseName = { regular: '常规赛', playoffs: '季后赛', offseason: '休赛期' };

  // ---------------- persistence ----------------
  function save() {
    try {
      state._rng = RNG.state;
      localStorage.setItem('nbagm.save', JSON.stringify(state));
      try {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        localStorage.setItem('nbagm.savedAt', `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`);
      } catch (e) { /* ignore */ }
    } catch (e) { console.warn('save failed', e); }
  }
  function load() {
    const raw = localStorage.getItem('nbagm.save');
    if (!raw) return false;
    try {
      state = JSON.parse(raw);
      if (state._rng) RNG.state = state._rng;
      if (state.lastGame) lastGame = state.lastGame;   // "上一场" survives a reload
      return true;
    } catch { return false; }
  }

  // ---------------- boot ----------------
  function boot() {
    if (!load()) return pickTeam();
    render();
  }

  function pickTeam() {
    $('#datebox').innerHTML = '';
    ['#advance', '#btnSave', '#btnMenu'].forEach((id) => { const el = document.querySelector(id); if (el) el.style.display = 'none'; });
    const list = DATA.teams.slice().sort((a, b) => a.name.localeCompare(b.name));
    $('#app').innerHTML = `
      <div class="card" style="max-width:900px;margin:40px auto">
        <h3>选择你的球队</h3>
        <p class="muted" style="margin-top:-4px">2026-27 赛季真实名单 · 82 场常规赛 · 交易 / 选秀 / 自由市场全开</p>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr));margin-top:16px">
          ${list.map((t) => `
            <button class="btn" data-act="newgame" data-team="${t.abbr}" style="display:flex;align-items:center;gap:10px;justify-content:flex-start;padding:10px">
              <img src="assets/logos/${t.abbr}.png" style="width:26px;height:26px;object-fit:contain">
              <span style="min-width:0;overflow:hidden;text-align:left"><b style="display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${zt(t.abbr)}</b><em style="font-style:normal;font-size:11px;color:var(--muted)">${t.conf === 'East' ? '东部' : '西部'} · ${ZH.division ? ZH.division(t.div) : t.div}</em></span>
            </button>`).join('')}
        </div>
      </div>`;
  }

  function newGame(team) {
    // every career gets its own seed, otherwise rookie classes are identical
    const seedNum = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    state = L.newLeague(DATA, team, seedNum);
    RNG.seed(state.seed + 7);
    lastGame = null;
    save();
    render();
  }

  // ---------------- shell ----------------
  function toast(msg, kind) {
    let box = document.getElementById('toastBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toastBox';
      box.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:200;pointer-events:none';
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `background:#101a2acc;border:1px solid ${kind === 'err' ? '#ff547066' : '#ffffff22'};color:${kind === 'err' ? '#ff9aa8' : '#e8eef6'};` +
      'padding:9px 16px;border-radius:10px;font-size:13px;backdrop-filter:blur(6px);opacity:0;transition:opacity .18s, transform .18s;transform:translateY(6px)';
    box.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 220); }, 2600);
  }

  // ---------------- save / share ----------------
  function saveInfo() {
    try {
      const raw = localStorage.getItem('nbagm.save') || '';
      return { bytes: raw.length, at: localStorage.getItem('nbagm.savedAt') || '' };
    } catch (e) { return { bytes: 0, at: '' }; }
  }

  function exportSave() {
    try {
      const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `NBA-GM-${state.userTeam}-${state.season}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      toast('存档已导出，保存好这个文件就能换设备继续');
    } catch (e) { toast('导出失败：' + e.message, 'err'); }
  }

  function importSave(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        if (!obj || !obj.teams || !obj.players || !obj.userTeam || !obj.season) throw new Error('不是有效的存档');
        state = obj;
        save();
        render();
        toast('存档已载入');
        $('#modal').classList.add('hidden');
      } catch (e) { toast('导入失败：' + e.message, 'err'); }
    };
    reader.readAsText(file);
  }

  function showMenu() {
    const info = saveInfo();
    $('#modal').classList.remove('hidden');
    $('#modal').innerHTML = `<div class="box" style="max-width:520px">
      <button class="x" data-act="closeModal">×</button>
      <h2 style="margin:0 0 4px">存档 / 设置</h2>
      <div class="muted small">进度自动存在这台设备的浏览器里。换手机、换浏览器、清缓存都会丢，想带走就导出。</div>
      <div class="card" style="background:#0e1522;margin-top:14px">
        <div class="row" style="justify-content:space-between"><span>当前存档</span>
          <span class="mono small">${info.bytes ? `${(info.bytes / 1024).toFixed(0)} KB · ${info.at || '未记录'}` : '无'}</span></div>
        <div class="row" style="justify-content:space-between;margin-top:6px"><span>赛季</span>
          <span class="mono small">${state.season - 1}-${String(state.season).slice(2)} · ${state.date}</span></div>
      </div>
      <div class="row" style="margin-top:14px;gap:8px;flex-wrap:wrap">
        <button class="btn" data-act="saveNow">立即保存</button>
        <button class="btn ghost" data-act="exportSave">导出存档</button>
        <label class="btn ghost" style="cursor:pointer;margin:0">导入存档
          <input type="file" accept="application/json,.json" id="importInput" style="display:none">
        </label>
      </div>
      <div class="tiny muted" style="margin-top:12px">快捷键：空格 = 推进一天 · Esc = 关闭弹窗</div>
      <div class="row" style="margin-top:18px;justify-content:flex-end">
        <button class="btn ghost" data-act="resetSave" style="color:var(--loss)">放弃进度，重新选队</button>
      </div>
    </div>`;
    const inp = document.getElementById('importInput');
    if (inp) inp.addEventListener('change', (e) => { if (e.target.files && e.target.files[0]) importSave(e.target.files[0]); });
  }

  function render() {
    const t = my();
    $('#teamchip').innerHTML = `<img src="assets/logos/${t.abbr}.png"><b>${zt(t.abbr)}</b><span class="rec">${t.wins}-${t.losses}</span>`;
    document.documentElement.style.setProperty('--tc', t.color);
    const nav = [
      ['dashboard', '总览'], ['roster', '阵容'], ['schedule', '赛程'], ['standings', '排名'],
      ['playoff', '季后赛'],
      ['stats', '数据'], ['trade', '交易'], ['fa', '自由市场'], ['draft', '选秀'], ['staff', '制服组'], ['history', '历史'],
    ];
    $('#nav').innerHTML = nav.map(([k, n]) => `<button data-act="view" data-view="${k}" class="${view === k ? 'on' : ''}">${n}</button>`).join('');
    $('#datebox').innerHTML = `<b>${state.date}</b><span>${state.season - 1}-${String(state.season).slice(2)} 赛季 · ${phaseName[state.phase]}${state.phase === 'offseason' && state.off ? ' · ' + (state.off.step === 'draft' ? '选秀' : '自由市场') : ''}</span>`;
    $('#advance').style.display = state.phase === 'offseason' ? 'none' : '';
    document.getElementById('btnSave').style.display = '';
    document.getElementById('btnMenu').style.display = '';

    const screens = {
      dashboard: viewDashboard, roster: viewRoster, schedule: viewSchedule, standings: viewStandings,
      stats: viewStats, playoff: viewPlayoff, trade: viewTrade, fa: viewFA, draft: viewDraft, staff: viewStaff, history: viewHistory, game: viewGame, live: viewLive,
    };
    if (view === 'draft') draftAuto();
    $('#app').innerHTML = (screens[view] || viewDashboard)();
  }

  // ---------------- dashboard ----------------
  function nextGame() {
    const g = state.games.find((x) => !x.played && (x.home === state.userTeam || x.away === state.userTeam));
    return g || null;
  }

  function viewDashboard() {
    const t = my();
    const roster = players(t.abbr);
    const pay = roster.reduce((a, p) => a + (p.salary || 0), 0);
    const ng = nextGame();
    const po = state.playoffs && state.playoffs.stage !== 'done'
      ? state.playoffs.series.find((x) => (x.a === t.abbr || x.b === t.abbr) && !x.done) : null;
    const conf = L.confStandings(state, t.conf);
    const seed = conf.findIndex((x) => x.abbr === t.abbr) + 1;
    const leaders = state.players.filter((p) => p.st.gp > 5)
      .sort((a, b) => b.st.pts / b.st.gp - a.st.pts / a.st.gp).slice(0, 5);

    const capPct = clamp((pay / CAP.tax) * 100, 0, 100);
    const taxPct = clamp((CAP.tax / CAP.tax) * 100, 0, 100);

    return `
    <div class="hero">
      <div>
        <div class="nextgame" style="--tc:${t.color}">
          <div class="lg">
            <img src="assets/logos/${t.abbr}.png">
            <div>
              <div class="vs">${ng ? (ng.home === t.abbr ? '主场' : '客场') : po ? '季后赛' : '——'}</div>
              <h2>${ng ? opponents(ng) : po ? zt(po.a === t.abbr ? po.b : po.a) : (state.phase === 'playoffs' ? '季后赛进行中' : '赛季结束')}</h2>
              <div class="muted small">${ng ? `今天 ${state.date} · 下一场 ${ng.date}${ng.date === state.date ? '（就是今天）' : `（${L.diffDays(state.date, ng.date)} 天后）`} · 本季第 ${seasonSeries(ng)} 次交手` : po ? `系列赛 ${po.wa}-${po.wb} · ${po.best === 1 ? '一场定胜负' : '七场四胜'}` : `今天 ${state.date}`}</div>
            </div>
            ${(ng || po) ? `<img src="assets/logos/${ng ? (ng.home === t.abbr ? ng.away : ng.home) : (po.a === t.abbr ? po.b : po.a)}.png" style="margin-left:auto">` : ''}
          </div>
          <div class="statline">
            <div>战绩<b>${t.wins}-${t.losses}</b></div>
            <div>${t.conf === 'East' ? '东部' : '西部'}排名<b>${seed || '-'}</b></div>
            <div>场均净胜<b>${t.wins + t.losses ? ((t.pf - t.pa) / (t.wins + t.losses)).toFixed(1) : '0.0'}</b></div>
            <div>连续<b>${t.streak > 0 ? '胜 ' + t.streak : t.streak < 0 ? '负 ' + Math.abs(t.streak) : '-'}</b></div>
          </div>
          <div style="margin-top:14px" class="row">
            ${ng ? `<button class="btn sm primary" data-act="liveGame">进场观看：自己换人</button>` : ''}
            ${ng ? `<button class="btn sm ghost" data-act="jumpGame">推进到下一场</button>` : ''}
            ${lastGame ? `<button class="btn sm ghost" data-act="view" data-view="game">上一场：${lastGame.game.hs}-${lastGame.game.as} 查看 →</button>` : ''}
          </div>
        </div>
        <div class="card" style="margin-top:14px">
          <h3>薪资状况</h3>
          <div class="row" style="justify-content:space-between"><span>球队总薪资</span><b class="mono">${fmtM(pay)}</b></div>
          <div class="capbar"><i style="width:${capPct}%"></i><em style="left:${taxPct}%"></em></div>
          <div class="row small muted" style="justify-content:space-between">
            <span>工资帽 ${fmtM(CAP.cap)}</span><span>税线 ${fmtM(CAP.tax)}</span>
          </div>
          <div class="row small" style="justify-content:space-between;margin-top:8px">
            <span>空间 <b class="mono" style="color:${CAP.cap - pay > 0 ? 'var(--win)' : 'var(--loss)'}">${fmtM(CAP.cap - pay)}</b></span>
            <span>距税线 <b class="mono" style="color:${CAP.tax - pay > 0 ? 'var(--win)' : 'var(--loss)'}">${fmtM(CAP.tax - pay)}</b></span>
            <span>名单 <b class="mono" style="color:${roster.length > 15 ? 'var(--loss)' : roster.length < 12 ? 'var(--gold)' : 'var(--win)'}">${roster.length}/15</b></span>
          </div>
        </div>
      </div>
      <div class="card">
        <h3>收件箱</h3>
        <div class="inbox">
          ${state.inbox.slice(0, 9).map((m) => `
            <div class="msg ${m.read ? 'read' : ''}" data-act="msg" data-id="${m.id}">
              <span class="dot"></span>
              <div><div class="t">${esc(localizeText(m.title))}</div><div class="d">${m.date}</div></div>
            </div>`).join('') || '<div class="empty">暂无消息</div>'}
        </div>
      </div>
    </div>

    ${alertsCard()}
    ${state.playoffs && state.playoffs.stage !== 'done' ? playoffPanel() : ''}
    <div class="hero" style="margin-top:14px">
      <div class="card">
        <h3>${t.conf === 'East' ? '东部' : '西部'}积分榜</h3>
        <table><thead><tr><th>#</th><th>球队</th><th class="num">胜</th><th class="num">负</th><th class="num">胜率</th><th class="num">净胜</th></tr></thead><tbody>
        ${conf.slice(0, 10).map((x, i) => `<tr class="click ${x.abbr === t.abbr ? 'me' : ''}" data-act="team" data-team="${x.abbr}" style="${x.abbr === t.abbr ? 'background:#ff6b3510' : ''}">
          <td class="num muted">${i + 1}</td><td><img src="assets/logos/${x.abbr}.png" style="width:16px;vertical-align:-3px;margin-right:6px">${zts(x.abbr)}</td>
          <td class="num">${x.wins}</td><td class="num">${x.losses}</td><td class="num">${pct(x.wins, x.losses)}</td>
          <td class="num" style="color:${x.diff >= 0 ? 'var(--win)' : 'var(--loss)'}">${x.diff > 0 ? '+' : ''}${x.diff}</td></tr>`).join('')}
        </tbody></table>
      </div>
      <div class="card">
        <h3>联盟得分榜</h3>
        <table><thead><tr><th>球员</th><th>球队</th><th class="num">场均</th><th class="num">篮板</th><th class="num">助攻</th></tr></thead><tbody>
        ${leaders.map((p) => `<tr class="click" data-act="player" data-id="${p.id}">
          <td>${esc(zn(p))}</td><td class="muted">${zts(p.team)}</td>
          <td class="num"><b>${(p.st.pts / p.st.gp).toFixed(1)}</b></td>
          <td class="num">${(p.st.reb / p.st.gp).toFixed(1)}</td>
          <td class="num">${(p.st.ast / p.st.gp).toFixed(1)}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>`;
  }

  function alertsCard() {
    const t = my();
    const roster = players(t.abbr);
    const mins = Core.rotation(roster, t.tactics, { manual: t.rotation });
    const tired = roster.filter((p) => (p.fatigue || 0) >= 70 && (mins.get(p) || 0) >= 20 && !p.restNextGame)
      .sort((a, b) => b.fatigue - a.fatigue);
    const unhappy = roster.filter((p) => p.tradeRequest);
    const lowMorale = roster.filter((p) => (p.morale || 70) < 45 && !p.tradeRequest);
    if (!tired.length && !unhappy.length && !lowMorale.length) return '';
    return `<div class="card" style="margin-top:14px;border-color:#5a3a1c">
      <h3 style="color:var(--gold)">需要处理</h3>
      ${tired.map((p) => `<div class="row" style="justify-content:space-between;padding:3px 0;font-size:12px">
        <span>${esc(zn(p))} 疲劳 <b class="mono" style="color:var(--loss)">${(p.fatigue || 0).toFixed(0)}</b>，建议上限 ${Core.capacityOf(p).toFixed(0)} 分钟</span>
        <button class="btn sm" data-act="rest" data-id="${p.id}">本轮轮休</button></div>`).join('')}
      ${unhappy.map((p) => `<div class="tiny" style="color:var(--loss);padding:2px 0">${esc(zn(p))} 已公开申请交易（士气 ${p.morale}）</div>`).join('')}
      ${lowMorale.map((p) => `<div class="tiny" style="color:var(--gold);padding:2px 0">${esc(zn(p))} 士气偏低（${p.morale}）：${p.moraleParts && p.moraleParts.minSat < -0.3 ? '上场时间不足' : p.moraleParts && p.moraleParts.usgSat < -0.3 ? '球权太少' : '状态或战绩不佳'}</div>`).join('')}
    </div>`;
  }

  function playoffPanel() {
    const po = state.playoffs;
    const stageName = { playin: '附加赛', r1: '首轮', semis: '分区半决赛', cf: '分区决赛', finals: '总决赛' };
    return `<div class="card" style="margin-top:14px">
      <div class="row" style="justify-content:space-between"><h3 style="margin:0">季后赛 · ${stageName[po.stage] || ''}</h3>
      <button class="btn sm" data-act="view" data-view="playoff">对阵图 →</button></div>
      <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:8px">
      ${po.series.map((s) => {
        const done = s.done;
        const lead = s.wa === s.wb ? '' : s.wa > s.wb ? s.a : s.b;
        return `<div class="row" style="justify-content:space-between;padding:6px 8px;background:#ffffff06;border-radius:8px;font-size:12px">
          <span style="opacity:${done && s.winner !== s.a ? .45 : 1}">${zts(s.a)}</span>
          <b class="mono">${s.wa} - ${s.wb}</b>
          <span style="opacity:${done && s.winner !== s.b ? .45 : 1}">${zts(s.b)}</span>
        </div>`;
      }).join('')}
      </div></div>`;
  }

  function opponents(g) {
    const other = g.home === state.userTeam ? g.away : g.home;
    return zt(other);
  }
  function seasonSeries(g) {
    const other = g.home === state.userTeam ? g.away : g.home;
    const n = state.games.filter((x) => x.played && ((x.home === state.userTeam && x.away === other) || (x.away === state.userTeam && x.home === other))).length;
    return n + 1;
  }

  // ---------------- roster ----------------
  function formTag(p) {
    const f = p.form || 0;
    if (Math.abs(f) < 1) return '';
    return `<span class="tiny mono" style="margin-left:3px;color:${f > 0 ? 'var(--win)' : 'var(--loss)'}">${f > 0 ? '↑' : '↓'}${Math.abs(Math.round(f))}</span>`;
  }

  function fatigueColor(f) { return f >= 65 ? 'var(--loss)' : f >= 45 ? 'var(--gold)' : 'var(--win)'; }
  function moraleColor(m) { return m >= 75 ? 'var(--win)' : m >= 55 ? 'var(--fg)' : m >= 40 ? 'var(--gold)' : 'var(--loss)'; }

  function viewRoster() {
    const t = my();
    const roster = players(t.abbr).sort((a, b) => b.ovr - a.ovr);
    const deadSum = ((state.teams[t.abbr] || {}).dead || []).reduce((a, d) => a + (d.amount || 0), 0);
    const tot = roster.reduce((a, p) => a + (p.salary || 0), 0) + deadSum;
    const manualOn = Object.keys(t.rotation || {}).length > 0;
    // show what the user set, not the internally scaled plan, so +1 is always +1
    const mins = manualOn
      ? new Map(roster.map((p) => [p, t.rotation[p.id] || 0]))
      : Core.rotation(roster, t.tactics);
    const planned = [...mins.values()].reduce((a, b) => a + b, 0);
    const avgFat = roster.length ? roster.reduce((a, p) => a + (p.fatigue || 0), 0) / roster.length : 0;
    const over = Math.abs(planned - 240) > 1.5;

    return `
    <div class="card" style="margin-bottom:14px">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px">
        <h3 style="margin:0">${zt(t.abbr)} 阵容 · ${roster.length} 人 · ${fmtM(tot)}</h3>
        <div class="row" style="gap:14px;flex-wrap:wrap">
          <span class="small muted">计划分钟 <b class="mono" style="color:${over ? 'var(--loss)' : 'var(--fg)'}">${planned.toFixed(0)}/240</b></span>
          <span class="small muted">平均疲劳 <b class="mono" style="color:${fatigueColor(avgFat)}">${avgFat.toFixed(0)}</b></span>
          <span class="small muted">更衣室 <b class="mono" style="color:${moraleColor(t.chemistry || 70)}">${t.chemistry || 70}</b></span>
          <button class="btn sm ${manualOn ? '' : 'ghost'}" data-act="rotAuto">${manualOn ? '恢复自动轮换' : '自动轮换中'}</button>
          <button class="btn sm" data-act="tactics">战术板</button>
        </div>
      </div>
      ${over ? '<div class="tiny" style="color:var(--loss);margin-top:6px">分钟总数不等于 240，系统会按比例缩放。建议补足或削减。</div>' : ''}
    </div>
    <div class="card">
      <div style="overflow-x:auto">
      <table><thead><tr>
        <th>球员</th><th>位置</th><th class="num">年龄</th><th class="num">能力</th><th class="num">潜力</th>
        <th style="text-align:center">计划分钟</th><th style="text-align:center">体力 / 疲劳</th><th class="num">士气</th>
        <th class="num">本季</th><th class="num">薪资</th><th class="num">合同</th><th>状态</th>
      </tr></thead><tbody>
      ${roster.map((p) => {
        const ppg = p.st.gp ? (p.st.pts / p.st.gp).toFixed(1) : '-';
        const m = mins.get(p) || 0;
        const fat = p.fatigue || 0;
        const mor = p.morale == null ? 70 : p.morale;
        const cap = Core.capacityOf(p);
        return `<tr class="click" data-act="player" data-id="${p.id}">
          <td><b>${esc(zn(p))}</b>${p.exp === 0 ? ' <span class="pill b">新秀</span>' : ''}${p.tradeRequest ? ' <span class="pill r">申请交易</span>' : ''}${p.promise ? ` <span class="pill b" title="${esc(p.promise.label)}">承诺</span>` : ''}${p.injDays > 0 ? `<span class="pill ${Injury.isOut(p) ? 'r' : 'o'}" title="${esc(Injury.label(p))}">${Injury.isOut(p) ? '重伤' : '轻伤'} ${p.injDays}天</span>` : ''}</td>
          <td><span class="pos">${p.pos}</span></td>
          <td class="num">${p.age}</td>
          <td class="num"><span class="ovr ${ovrCls(ov(p))}">${ov(p)}</span>${formTag(p)}</td>
          <td class="num muted">${pt(p)}</td>
          <td style="white-space:nowrap;text-align:center">
            <button class="btn sm" style="padding:2px 7px" data-act="rotSub" data-id="${p.id}">−</button>
            <b class="mono" style="display:inline-block;min-width:34px;text-align:center;${fat > 60 ? 'color:var(--loss)' : ''}">${m.toFixed(0)}</b>
            <button class="btn sm" style="padding:2px 7px" data-act="rotAdd" data-id="${p.id}">+</button>
          </td>
          <td style="min-width:92px">
            <div class="tiny mono" style="color:var(--muted);display:flex;justify-content:space-between"><span>${p.sta}</span><span style="color:${fatigueColor(fat)}">${fat.toFixed(0)}</span></div>
            <div class="bar" style="height:4px"><i style="width:${Math.min(100, fat)}%;background:${fatigueColor(fat)}"></i></div>
            <div class="tiny" style="color:var(--muted)">建议≤${cap.toFixed(0)}分钟</div>
          </td>
          <td class="num"><b class="mono" style="color:${moraleColor(mor)}">${mor}</b></td>
          <td class="num">${ppg}</td>
          <td class="num">${fmtM(p.salary)}</td>
          <td class="num muted">${p.years}年${p.opt === 1 ? ' PO' : p.opt === 2 ? ' TO' : ''}</td>
          <td style="white-space:nowrap">
            ${p.injDays > 0 ? `<span class="pill r">伤 ${p.injDays}天</span>` :
              `<button class="btn sm ${p.restNextGame ? 'primary' : 'ghost'}" data-act="rest" data-id="${p.id}">${p.restNextGame ? '轮休中' : '轮休'}</button>`}
          </td>
        </tr>`;
      }).join('')}
      </tbody></table></div>
    </div>`;
  }

  // ---------------- schedule ----------------
  function viewSchedule() {
    const gs = state.games.filter((g) => g.home === state.userTeam || g.away === state.userTeam);
    const done = gs.filter((g) => g.played).slice(-12).reverse();
    const next = gs.filter((g) => !g.played).slice(0, 10);
    return `<div class="splitcol">
      <div class="card"><h3>最近比赛</h3><table><thead><tr><th>日期</th><th>对手</th><th>主客</th><th class="num">比分</th><th>结果</th></tr></thead><tbody>
      ${done.map((g) => {
        const home = g.home === state.userTeam;
        const won = home ? g.hs > g.as : g.as > g.hs;
        return `<tr><td class="mono tiny">${g.date.slice(5)}</td><td>${zts(home ? g.away : g.home)}</td><td class="muted">${home ? '主' : '客'}</td>
          <td class="num mono">${home ? `${g.hs}-${g.as}` : `${g.as}-${g.hs}`}</td><td><span class="pill ${won ? 'g' : 'r'}">${won ? '胜' : '负'}</span></td></tr>`;
      }).join('') || '<tr><td colspan="5" class="empty">还没打</td></tr>'}
      </tbody></table></div>
      <div class="card"><h3>接下来的赛程</h3><table><thead><tr><th>日期</th><th>对手</th><th>主客</th><th class="num">对方战绩</th></tr></thead><tbody>
      ${next.map((g) => {
        const home = g.home === state.userTeam;
        const o = state.teams[home ? g.away : g.home];
        return `<tr><td class="mono tiny">${g.date.slice(5)}</td><td>${zt(o.abbr)}</td><td class="muted">${home ? '主' : '客'}</td>
          <td class="num muted">${o.wins}-${o.losses}</td></tr>`;
      }).join('') || '<tr><td colspan="4" class="empty">赛季结束</td></tr>'}
      </tbody></table></div>
    </div>`;
  }

  // ---------------- standings ----------------
  function viewStandings() {
    const tbl = (conf) => {
      const rows = L.confStandings(state, conf);
      return `<div class="card"><h3>${conf === 'East' ? '东部' : '西部'}</h3>
      <table><thead><tr><th>#</th><th>球队</th><th class="num">胜</th><th class="num">负</th><th class="num">胜率</th><th class="num">得分</th><th class="num">失分</th><th class="num">净胜</th></tr></thead><tbody>
      ${rows.map((x, i) => {
        const g = Math.max(1, x.wins + x.losses);
        return `<tr class="click" data-act="team" data-team="${x.abbr}" style="${x.abbr === state.userTeam ? 'background:#ff6b3510' : ''}${i === 5 || i === 7 ? ';border-bottom:2px solid #ff6b3544' : ''}">
          <td class="num muted">${i + 1}</td>
          <td><img src="assets/logos/${x.abbr}.png" style="width:16px;vertical-align:-3px;margin-right:6px">${zts(x.abbr)}</td>
          <td class="num">${x.wins}</td><td class="num">${x.losses}</td><td class="num">${pct(x.wins, x.losses)}</td>
          <td class="num muted">${(x.pf / g).toFixed(1)}</td><td class="num muted">${(x.pa / g).toFixed(1)}</td>
          <td class="num" style="color:${x.diff >= 0 ? 'var(--win)' : 'var(--loss)'}">${x.diff > 0 ? '+' : ''}${x.diff}</td></tr>`;
      }).join('')}
      </tbody></table></div>`;
    };
    return `<div class="splitcol">${tbl('East')}${tbl('West')}</div>`;
  }

  // ---------------- playoffs ----------------
  const ROUND_NAME = { 0: '附加赛', 1: '首轮', 2: '分区半决赛', 3: '分区决赛', 4: '总决赛' };

  function seedLookup() {
    const m = {};
    const po = state.playoffs;
    const BRACKET = [[1, 8], [4, 5], [3, 6], [2, 7]];
    const r1 = po && (po.all || []).filter((s) => s.round === 1);
    if (r1 && r1.length) {
      for (const conf of ['East', 'West']) {
        r1.filter((s) => s.conf === conf).sort((a, b) => a.slot - b.slot).forEach((s, i) => {
          const [sa, sb] = BRACKET[i] || [0, 0];
          m[`${conf}:${s.a}`] = sa;
          m[`${conf}:${s.b}`] = sb;
        });
      }
      return m;
    }
    for (const conf of ['East', 'West']) {
      L.confStandings(state, conf).slice(0, 8).forEach((t, i) => { m[`${conf}:${t.abbr}`] = i + 1; });
    }
    return m;
  }

  function bracketMap() {
    const po = state.playoffs;
    const map = {};
    if (po && po.all && po.all.length) {
      po.all.forEach((s) => { if (s.round >= 1) map[`${s.conf}-${s.round}-${s.slot}`] = s; });
      return { map, live: true, proj: false };
    }
    for (const conf of ['East', 'West']) {
      const list = L.confStandings(state, conf).slice(0, 10).map((t) => t.abbr);
      if (list.length < 10) continue;
      const pairs = [[list[0], list[7], 0], [list[3], list[4], 1], [list[2], list[5], 2], [list[1], list[6], 3]];
      pairs.forEach(([a, b, slot]) => {
        map[`${conf}-1-${slot}`] = { a, b, wa: 0, wb: 0, done: false, proj: true, slot, conf, round: 1 };
      });
    }
    return { map, live: false, proj: true };
  }

  function seriesCard(s, seeds, conf) {
    if (!s) return `<div class="ser empty"><span class="tiny">待定</span></div>`;
    const aWin = s.done && s.winner === s.a;
    const bWin = s.done && s.winner === s.b;
    const lead = (x, y) => (!s.done && x > y ? ' lead' : '');
    const mine = (abbr) => (abbr === state.userTeam ? ' me' : '');
    const seed = (abbr) => (seeds[`${conf}:${abbr}`] ? `<span class="seed">${seeds[`${conf}:${abbr}`]}</span>` : '<span class="seed">·</span>');
    return `<div class="ser ${s.done ? 'done' : 'live'} ${s.proj ? 'proj' : ''}">
      <div class="row ${aWin ? 'w' : 'l'}${lead(s.wa, s.wb)}${mine(s.a)}">${seed(s.a)}<span class="tm">${zts(s.a)}</span>${s.proj ? '' : `<b class="mono">${s.wa || 0}</b>`}</div>
      <div class="row ${bWin ? 'w' : 'l'}${lead(s.wb, s.wa)}${mine(s.b)}">${seed(s.b)}<span class="tm">${zts(s.b)}</span>${s.proj ? '' : `<b class="mono">${s.wb || 0}</b>`}</div>
    </div>`;
  }

  function roundColumn(map, seeds, conf, round) {
    const n = round === 1 ? 4 : round === 2 ? 2 : 1;
    const cards = [];
    for (let i = 0; i < n; i++) cards.push(seriesCard(map[`${conf}-${round}-${i}`], seeds, conf));
    return `<div class="round"><div class="rlbl">${ROUND_NAME[round]}</div>
      <div class="rlist">${cards.join('')}</div></div>`;
  }

  function playinStrip(conf) {
    const po = state.playoffs;
    if (!po || !po.all) return '';
    const games = po.all.filter((s) => s.conf === conf && s.round === 0);
    if (!games.length) return '';
    return `<div class="playin"><span class="tiny muted">附加赛</span>
      ${games.map((g) => `<span class="tiny">${zts(g.a)} <b class="mono">${g.wa}-${g.wb}</b> ${zts(g.b)}${g.done ? ` → <b>${zts(g.winner)}</b>` : ''}</span>`).join('')}</div>`;
  }

  function viewPlayoff() {
    const { map, live, proj } = bracketMap();
    const seeds = seedLookup();
    const po = state.playoffs;
    const champion = po && po.champion;
    const stage = po && po.stage && po.stage !== 'done' ? ROUND_NAME[po.round] : null;

    return `
    <div class="card" style="margin-bottom:14px">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <h3 style="margin:0 0 2px">${live ? '季后赛对阵图' : '季后赛对阵预测'}</h3>
          <div class="tiny muted">${live ? (champion ? `总冠军：${champion}` : `进行中 · ${stage}`) : '按当前排名推演，7-10 名打附加赛'}</div>
        </div>
        ${champion ? `<div class="champbadge">🏆 ${zt(champion)}</div>` : ''}
      </div>
    </div>
    <div class="bracket">
      <div class="bside">
        <div class="bhead">东部</div>
        ${playinStrip('East')}
        <div class="rounds">${roundColumn(map, seeds, 'East', 1)}${roundColumn(map, seeds, 'East', 2)}${roundColumn(map, seeds, 'East', 3)}</div>
      </div>
      <div class="bfinals">
        <div class="bhead center">总决赛</div>
        ${seriesCard(map['Finals-4-0'], seeds, 'Finals')}
        ${champion ? `<div class="ser champ"><div class="row w"><span class="tm">${zts(champion)}</span><b class="mono">🏆</b></div></div>` : ''}
      </div>
      <div class="bside west">
        <div class="bhead">西部</div>
        ${playinStrip('West')}
        <div class="rounds">${roundColumn(map, seeds, 'West', 3)}${roundColumn(map, seeds, 'West', 2)}${roundColumn(map, seeds, 'West', 1)}</div>
      </div>
    </div>
    ${proj ? '<div class="tiny muted" style="margin-top:14px">预测对阵不含附加赛结果：7/8 与 9/10 的胜者进入首轮。</div>' : ''}`;
  }

  // ---------------- stats ----------------
  function viewStats() {
    const rows = state.players.filter((p) => p.st.gp >= 5);
    const cats = [
      ['得分', (p) => p.st.pts / p.st.gp, (v) => v.toFixed(1)],
      ['篮板', (p) => p.st.reb / p.st.gp, (v) => v.toFixed(1)],
      ['助攻', (p) => p.st.ast / p.st.gp, (v) => v.toFixed(1)],
      ['抢断', (p) => p.st.stl / p.st.gp, (v) => v.toFixed(1)],
      ['盖帽', (p) => p.st.blk / p.st.gp, (v) => v.toFixed(1)],
      ['三分命中', (p) => p.st.tpm / p.st.gp, (v) => v.toFixed(1)],
    ];
    return `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
      ${cats.map(([name, fn, fmt]) => `
        <div class="card"><h3>${name}</h3>
        <table><tbody>
          ${rows.slice().sort((a, b) => fn(b) - fn(a)).slice(0, 8).map((p, i) => `
            <tr class="click" data-act="player" data-id="${p.id}">
              <td class="num muted" style="width:24px">${i + 1}</td>
              <td>${esc(zn(p))}</td><td class="muted tiny">${p.team}</td>
              <td class="num"><b>${fmt(fn(p))}</b></td>
            </tr>`).join('')}
        </tbody></table></div>`).join('')}
    </div>`;
  }

  // ---------------- trades ----------------
  function offersCard() {
    const offers = state.offers || [];
    if (!offers.length) return '';
    return `<div class="card" style="margin-bottom:14px">
      <h3>收到的报价 · ${offers.length}</h3>
      ${offers.map((o) => `<div class="row" style="justify-content:space-between;padding:9px 10px;background:#ffffff06;border-radius:9px;margin-bottom:6px;gap:12px">
        <div style="min-width:0">
          <div class="small"><b>${zt(o.from)}</b> 想要 <b>${esc(zn(o.target.name))}</b> <span class="pill">${ov(o.target)}</span></div>
          <div class="tiny muted" style="margin-top:3px">送出 ${o.give.map((g) => esc(g.name)).join('、')} · 价值比 ${isFinite(o.ratio) ? o.ratio.toFixed(2) : '-'} · ${o.expires} 到期</div>
        </div>
        <div class="row" style="flex:none">
          <button class="btn sm" data-act="offerView" data-id="${o.id}">查看</button>
          <button class="btn sm ghost" data-act="offerReject" data-id="${o.id}">拒绝</button>
        </div>
      </div>`).join('')}
    </div>`;
  }

  function deadlineCard() {
    if (!state.deadline) return '';
    const blocked = O.tradeBlocked(state);
    const dtd = O.daysToDeadline(state);
    return `<div class="card" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
      <div><b>交易窗口</b> <span class="muted small">截止日 ${state.deadline}</span></div>
      <div>${blocked ? '<span class="pill r">已关闭，休赛期重开</span>'
        : `<span class="pill ${dtd <= 10 ? 'r' : 'g'}">${dtd <= 0 ? '截止日当天' : `还剩 ${dtd} 天`}</span>`}</div>
    </div>`;
  }

  function showOffer(id) {
    const o = (state.offers || []).find((x) => x.id === id);
    if (!o) return;
    const blocked = O.tradeBlocked(state);
    const mine = state.players.find((p) => p.id === o.target.id);
    $('#modal').classList.remove('hidden');
    $('#modal').innerHTML = `<div class="box" style="max-width:640px">
      <button class="x" data-act="closeModal">×</button>
      <h2 style="margin:0 0 4px">${zt(o.from)} 的报价</h2>
      <div class="muted small">${o.date} 提出 · ${o.expires} 前有效</div>
      <div class="splitcol" style="margin-top:16px">
        <div class="card" style="background:#0e1522">
          <h3>你送出</h3>
          <div class="row" style="justify-content:space-between"><b>${esc(zn(o.target.name))}</b>
            <span class="mono small">${ov(o.target)} · ${fmtM(o.target.salary)}</span></div>
          ${mine ? `<div class="tiny muted" style="margin-top:4px">${mine.pos} · ${mine.age}岁 · 潜力 ${mine.pot}</div>` : ''}
        </div>
        <div class="card" style="background:#0e1522">
          <h3>你得到</h3>
          ${o.give.map((g) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid #ffffff08;padding:3px 0">
            <span>${esc(zn(g.name))}</span><span class="mono small muted">${g.kind === 'pick' ? '选秀权' : `${ov(g)} · ${fmtM(g.salary)}`}</span></div>`).join('')}
        </div>
      </div>
      <div class="row" style="justify-content:space-between;margin-top:16px">
        <span class="small ${isFinite(o.ratio) && o.ratio >= 1 ? '' : 'muted'}">价值比 ${isFinite(o.ratio) ? o.ratio.toFixed(2) : '-'}${o.ratio >= 1.05 ? '（对方多给）' : o.ratio < 0.9 ? '（对方压价）' : ''}</span>
        <div class="row">
          <button class="btn" data-act="closeModal">再想想</button>
          <button class="btn primary" data-act="offerAccept" data-id="${o.id}" ${blocked ? 'disabled' : ''}>接受交易</button>
        </div>
      </div>
    </div>`;
  }

  function tpeList(abbr) {
    const t = state.teams[abbr];
    const list = (t && t.tpe ? t.tpe : []).filter((x) => x.expires >= state.date);
    return list.map((x) => ({ kind: 'tpe', id: x.id, amount: x.amount, name: '', salary: 0, expires: x.expires }));
  }

  function viewTrade() {
    const t = my();
    const other = trade.team || Object.keys(state.teams).find((x) => x !== t.abbr);
    const mine = players(t.abbr).sort((a, b) => b.ovr - a.ovr);
    const theirs = players(other).sort((a, b) => b.ovr - a.ovr);
    const pickList = (abbr) => state.picks.filter((p) => p.owner === abbr && !p.used).sort((a, b) => a.year - b.year || a.round - b.round).slice(0, 8);

    const assetLabel = (x) => {
      if (x.kind === 'tpe') return `交易特例 ${fmtM(x.amount)}`;
      if (x.kind === 'player') return x.name;
      const pk = state.picks.find((p) => p.id === x.id);
      const bits = [`${x.year} ${x.round}轮`];
      if (pk && pk.orig !== state.userTeam) bits.push(pk.orig);
      if (pk && pk.prot) bits.push(`保护${pk.prot[0]}-${pk.prot[1]}`);
      return bits.join(' · ');
    };
    const side = (list, cb) => list.map((item) => {
      const x = item.kind ? item
        : item.round ? { kind: 'pick', id: item.id, year: item.year, round: item.round }
        : { kind: 'player', id: item.id, name: item.name, ovr: item.ovr, salary: item.salary };
      const on = trade[cb].some((y) => y.kind === x.kind && y.id === x.id);
      return `<div class="chip ${on ? 'on' : ''}" data-act="toggle" data-side="${cb}" data-kind="${x.kind}" data-id="${x.id}" data-name="${esc(x.name || '')}" data-salary="${x.salary || 0}" data-amount="${x.amount || 0}">
        <span>${x.kind === 'player' ? `<b>${ov(x)}</b> ${esc(zn(x.name))}` : assetLabel(x)}</span>
        <span class="muted" style="margin-left:auto">${x.kind === 'player' ? fmtM(x.salary) : ''}</span>
      </div>`;
    }).join('');

    const evalOut = trade.team ? O.evaluateTrade(state, t.abbr, trade.team, trade.outA, trade.outB) : null;

    const blocked = O.tradeBlocked(state);
    return `${deadlineCard()}${offersCard()}<div class="card">
      <div class="row" style="justify-content:space-between">
        <h3 style="margin:0">交易构建器</h3>
        <div class="row">
          <span class="muted small">交易对象</span>
          <select class="sel" data-act="tradeTeam">
            ${Object.values(state.teams).filter((x) => x.abbr !== t.abbr).sort((a, b) => a.name.localeCompare(b.name)).map((x) => `<option value="${x.abbr}" ${x.abbr === other ? 'selected' : ''}>${zt(x.abbr)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="splitcol" style="margin-top:14px">
        <div>
          <div class="row" style="justify-content:space-between;margin-bottom:6px">
            <b>${zt(t.abbr)}</b><span class="mono small muted">送出 ${fmtM(trade.outA.reduce((a, x) => a + (x.salary || 0), 0))} · 接回 ${fmtM(trade.outB.reduce((a, x) => a + (x.salary || 0), 0))}</span>
          </div>
          <div class="tradecol scroll">${side(mine, 'outA')}</div>
          <div class="tiny muted" style="margin:8px 0 4px">选秀权</div>
          <div class="tradecol scroll" style="max-height:120px">${side(pickList(t.abbr), 'outA')}</div>
          ${tpeList(t.abbr).length ? `<div class="tiny muted" style="margin:8px 0 4px">交易特例（只能单独吃一名球员）</div>
          <div class="tradecol scroll" style="max-height:110px">${side(tpeList(t.abbr), 'outA')}</div>` : ''}
        </div>
        <div>
          <div class="row" style="justify-content:space-between;margin-bottom:6px">
            <b>${zt(other)}</b><span class="mono small muted">送出 ${fmtM(trade.outB.reduce((a, x) => a + (x.salary || 0), 0))} · 接回 ${fmtM(trade.outA.reduce((a, x) => a + (x.salary || 0), 0))}</span>
          </div>
          <div class="tradecol scroll">${side(theirs, 'outB')}</div>
          <div class="tiny muted" style="margin:8px 0 4px">选秀权</div>
          <div class="tradecol scroll" style="max-height:120px">${side(pickList(other), 'outB')}</div>
        </div>
      </div>
      <div class="row" style="margin-top:16px;justify-content:space-between;align-items:flex-end">
        <div class="small">${evalOut ? `<span class="pill ${evalOut.accept ? 'g' : 'r'}">${evalOut.msg}</span> <span class="muted mono">价值比 ${evalOut.ratio === 99 ? '-' : evalOut.ratio.toFixed(2)}</span>` : '<span class="muted">选择交易对象</span>'}</div>
        <div class="row">
          <button class="btn sm ghost" data-act="clearTrade">清空</button>
          ${blocked ? '<span class="pill r">交易窗口已关闭</span>'
            : `<button class="btn primary" data-act="doTrade" ${evalOut && evalOut.accept ? '' : 'disabled'}>提交交易</button>`}
        </div>
      </div>
    </div>`;
  }

  // ---------------- free agency ----------------
  function viewFA() {
    const fas = O.listFreeAgents(state).filter((p) => !faFilter || p.name.toLowerCase().includes(faFilter) || p.pos === faFilter);
    const t = my();
    const pay = payrollOf(t.abbr, state.players, state);
    return `<div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:10px">
        <h3 style="margin:0">自由球员市场 · ${fas.length} 人</h3>
        <div class="row">
          <span class="mono small muted">空间 ${fmtM(CAP.cap - pay)}</span>
          <input class="sel" placeholder="搜索 / 位置" value="${esc(faFilter)}" data-act="faFilter" style="width:150px">
        </div>
      </div>
      <table><thead><tr><th>球员</th><th>位置</th><th class="num">年龄</th><th class="num">能力</th><th class="num">潜力</th><th class="num">要价</th><th></th></tr></thead><tbody>
      ${fas.slice(0, 80).map((p) => `<tr>
        <td class="click" data-act="player" data-id="${p.id}"><b>${esc(zn(p))}</b></td>
        <td><span class="pos">${p.pos}</span></td><td class="num">${p.age}</td>
        <td class="num"><span class="ovr ${ovrCls(ov(p))}">${ov(p)}</span></td><td class="num muted">${pt(p)}</td>
        <td class="num mono">${fmtM(O.askingPrice(p))}</td>
        <td class="right">${(() => {
          const n = O.negoFor(state, p.id);
          if (n) {
            const behind = n.rival && n.rival.salary > n.salary;
            return `<span class="pill ${behind ? 'r' : 'b'}">谈判中 ${fmtM(n.salary)}${behind ? ` · 被 ${zt(n.rival.team)} 压价` : ''}</span>
              <button class="btn sm" data-act="negoRaise" data-id="${p.id}">加价</button>
              <button class="btn sm ghost" data-act="negoDrop" data-id="${p.id}">撤销</button>`;
          }
          return `<button class="btn sm" data-act="negoOpen" data-id="${p.id}">报价</button>
            ${p.birdTeam && p.birdTeam !== t.abbr ? `<button class="btn sm ghost" data-act="snt" data-id="${p.id}">先签后换</button>` : ''}`;
        })()}</td>
      </tr>`).join('') || '<tr><td colspan="7" class="empty">市场已空</td></tr>'}
      </tbody></table>
      ${state.phase === 'offseason' ? `<div class="row" style="margin-top:16px;justify-content:flex-end">
        <button class="btn primary" data-act="startSeason">结束休赛期，进入新赛季</button></div>` : ''}
    </div>`;
  }

  // ---------------- free agency negotiation ----------------
  function negoModal(id) {
    const p = byId(id);
    if (!p) return;
    const n = O.negoFor(state, id);
    const ask = n ? n.salary : O.askingPrice(p);
    const rival = n && n.rival;
    $('#modal').classList.remove('hidden');
    $('#modal').innerHTML = `<div class="box" style="max-width:560px">
      <button class="x" data-act="closeModal">×</button>
      <h2 style="margin:0 0 4px">${n ? '加价' : '报价'} · ${esc(zn(p))}</h2>
      <div class="muted small">要价 ${fmtM(O.askingPrice(p))} · 市场价 ${fmtM(marketSalary(p.ovr))} · ${p.age} 岁</div>
      ${rival ? `<div class="card" style="background:#0e1522;margin-top:12px">
        <div class="row" style="justify-content:space-between"><span>${zt(rival.team)} 的报价</span><b class="mono">${fmtM(rival.salary)} × ${rival.years} 年</b></div>
        <div class="tiny muted" style="margin-top:4px">你现在是 ${fmtM(n.salary)}，${n.expires} 前不加价他就走了</div>
      </div>` : ''}
      <div class="row" style="gap:12px;margin-top:14px;align-items:flex-end;flex-wrap:wrap">
        <label class="small">年薪<br><input id="negoSalary" class="sel" type="number" step="100000" min="1272870" value="${Math.round(n ? Math.max(n.salary, rival ? rival.salary * 1.02 : n.salary) : O.askingPrice(p))}" style="width:150px"></label>
        <label class="small">年限<br><select id="negoYears" class="sel">
          ${[1, 2, 3, 4].map((y) => `<option value="${y}" ${((n && n.years) || 3) === y ? 'selected' : ''}>${y} 年</option>`).join('')}
        </select></label>
        <span class="tiny muted">上限 ${fmtM(Math.max(CAP.max, O.askingPrice(p) * 1.3))}</span>
      </div>
      <div class="row" style="margin-top:16px;justify-content:flex-end">
        <button class="btn primary" data-act="negoSubmit" data-id="${id}">${n ? '提交加价' : '提交报价'}</button>
      </div>
    </div>`;
  }

  function negoSubmit(id) {
    const sal = Number(document.getElementById('negoSalary').value || 0);
    const yrs = Number(document.getElementById('negoYears').value || 3);
    const n = O.negoFor(state, id);
    const r = n ? O.raiseOffer(state, id, sal, yrs) : O.openNegotiation(state, id, sal, yrs);
    if (!r.ok) return toast(r.msg, 'err');
    $('#modal').classList.add('hidden');
    save(); render();
  }

  // ---------------- sign and trade ----------------
  function sntsPackage(id) {
    const d = O.signTradeDemand(state, id, state.userTeam);
    if (!d.ok) return d;
    const picks = state.picks.filter((p) => p.owner === state.userTeam && !p.used && p.year > state.season)
      .map((p) => ({ p, v: O.pickAssetValue(state, p) })).sort((a, b) => a.v - b.v);
    const picked = [];
    let v = 0;
    for (const x of picks) {
      if (v >= d.need || picked.length >= 3) break;   // 最多三个签，剩下的用球员谈
      picked.push(x.p);
      v += x.v;
    }
    return { ...d, package: picked, give: v };
  }

  function showSNT(id) {
    const p = state.players.find((x) => x.id === id);
    const r = sntsPackage(id);
    $('#modal').classList.remove('hidden');
    if (!r.ok) {
      $('#modal').innerHTML = `<div class="box" style="max-width:520px">
        <button class="x" data-act="closeModal">×</button>
        <h2 style="margin:0 0 6px">先签后换 · ${esc(zn(p))}</h2>
        <div class="muted small">${r.msg}</div></div>`;
      return;
    }
    const salary = r.salary;
    $('#modal').innerHTML = `<div class="box" style="max-width:600px">
      <button class="x" data-act="closeModal">×</button>
      <h2 style="margin:0 0 4px">先签后换 · ${esc(zn(p))}</h2>
      <div class="muted small">${zt(p.birdTeam)} 是母队 · 至少 3 年合同 · 吃下后你会被硬帽在第一围裙（${fmtM(CAP.apron1)}）</div>
      <div class="card" style="background:#0e1522;margin-top:14px">
        <div class="row" style="justify-content:space-between"><span>你得到</span>
          <b>${esc(zn(p))} <span class="muted mono small">${ov(p)} · ${fmtM(salary)} × 3-4 年</span></b></div>
      </div>
      <div class="card" style="background:#0e1522;margin-top:10px">
        <div class="row" style="justify-content:space-between"><span>你送出</span>
          <span class="mono small">你的筹码相当于 ${(r.give / Core.pickValue(15, 0)).toFixed(1)} 个中段首轮，母队要 ${(r.need / Core.pickValue(15, 0)).toFixed(1)} 个</span></div>
        ${r.package.map((pk) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid #ffffff08;padding:3px 0">
          <span>${pk.year} ${pk.round}轮${pk.orig !== state.userTeam ? ` · ${zt(pk.orig)}` : ''}</span>
          <span class="mono small muted">${pk.prot ? `保护${pk.prot[0]}-${pk.prot[1]}` : '无保护'}</span></div>`).join('') || '<div class="muted small">没有可用的选秀权</div>'}
      </div>
      <div class="row" style="margin-top:16px;justify-content:flex-end">
        ${r.give >= r.need
          ? `<button class="btn primary" data-act="sntGo" data-id="${id}" data-picks="${r.package.map((x) => x.id).join(',')}">确认先签后换</button>`
          : '<span class="pill r">你的筹码不够，母队不会同意</span>'}
      </div>
    </div>`;
  }

  function doSNT(id, pickIds) {
    const assets = (pickIds || '').split(',').filter(Boolean).map((pid) => {
      const pk = state.picks.find((q) => q.id === pid);
      return { kind: 'pick', id: pid, name: pk ? `${pk.year} ${pk.round}轮` : pid, year: pk && pk.year, round: pk && pk.round };
    });
    const r = O.signAndTrade(state, id, state.userTeam, assets);
    if (!r.ok) return toast(r.msg, 'err');
    $('#modal').classList.add('hidden');
    save();
    render();
  }

  // ---------------- buyout ----------------
  function showBuyout(id) {
    const d = O.buyoutDemand(state, id);
    const p = state.players.find((x) => x.id === id);
    $('#modal').classList.remove('hidden');
    if (!d.ok) {
      $('#modal').innerHTML = `<div class="box" style="max-width:520px">
        <button class="x" data-act="closeModal">×</button>
        <h2 style="margin:0 0 6px">买断 · ${esc(zn(p))}</h2>
        <div class="muted small">${d.msg}</div></div>`;
      return;
    }
    $('#modal').innerHTML = `<div class="box" style="max-width:560px">
      <button class="x" data-act="closeModal">×</button>
      <h2 style="margin:0 0 4px">买断 · ${esc(zn(p))}</h2>
      <div class="muted small">剩余合同 ${fmtM(d.total)} · 球员要求保住 ${fmtM(d.keep)}（${Math.round(d.keepRatio * 100)}%）</div>
      <div class="card" style="background:#0e1522;margin-top:14px">
        <div class="row" style="justify-content:space-between"><span>你支付</span><b class="mono">${fmtM(d.keep)}</b></div>
        <div class="row" style="justify-content:space-between;margin-top:6px"><span>球员放弃</span><b class="mono">${fmtM(d.giveBack)}</b></div>
        <label class="row small" style="margin-top:10px;gap:8px">
          <input type="checkbox" id="stretchBox"> 摊薄到 ${(p.years || 1) * 2 + 1} 年（stretch）
        </label>
      </div>
      <div class="row" style="margin-top:16px;justify-content:flex-end">
        <button class="btn primary" data-act="buyoutGo" data-id="${id}">执行买断</button>
      </div>
    </div>`;
  }

  function doBuyout(id) {
    const box = document.getElementById('stretchBox');
    const r = O.executeBuyout(state, id, { stretch: !!(box && box.checked) });
    if (!r.ok) return toast(r.msg, 'err');
    $('#modal').classList.add('hidden');
    save();
    render();
  }

  // ---------------- draft ----------------
  function ensureDraft() {
    if (draft) return;
    if (!state.draftClass) state.draftClass = O.makeDraftClass(state.season);
    draft = {
      order: O.draftOrder(state),
      pool: state.draftClass.slice().sort((a, b) => b.pot - a.pot),
      slot: 1,
      log: [],
      done: false,
    };
  }

  function slotInfo(slot) {
    const ds = O.draftSlot(state, draft.order, slot);
    return { owner: ds.owner, orig: ds.effectiveOrig, round: ds.round, protectedStay: ds.protectedStay, swapped: ds.swapped };
  }

  function assign(prospect, slot, round, owner) {
    prospect.team = owner;
    prospect.years = 2;
    const base = round === 1 ? 13500000 * Math.pow(0.94, slot - 1) : 2400000 * Math.pow(0.96, slot - 31);
    prospect.salary = Math.round(base / 1000) * 1000;
    prospect.opt = round === 1 ? 2 : 0;
    state.players.push(prospect);
    draft.pool = draft.pool.filter((p) => p !== prospect);
    const rep = Scout.report(state, prospect);
    draft.log.push({ slot, owner, name: prospect.name, pos: prospect.pos, ovr: prospect.ovr, pot: prospect.pot, ceiling: rep.ceiling ? rep.ceiling.name : null, protectedStay: slotInfo(draft.slot).protectedStay });
    draft.slot++;
  }

  function draftAuto() {
    ensureDraft();
    if (draft.done) return;
    let guard = 0;
    while (draft.slot <= 60 && guard++ < 80) {
      const { owner, round } = slotInfo(draft.slot);
      if (owner === state.userTeam) return;     // wait for user
      const best = draft.pool.slice(0, 5).sort((a, b) => (b.pot + RNG.range(-5, 5)) - (a.pot + RNG.range(-5, 5)))[0];
      if (!best) break;
      assign(best, draft.slot, round, owner);
    }
    if (draft.slot > 60) finishDraft();
  }

  function finishDraft() {
    draft.done = true;
    state.off.step = 'fa';
    state.date = `${state.season - 1}-07-01`;
    O.aiFreeAgency(state, 2);
    O.pushInbox(state, { type: 'draft', title: '选秀大会结束', body: '自由市场开启。' });
    save();
  }

  function protLabel(pk) {
    if (!pk.prot) return '';
    return `保护 ${pk.prot[0]}-${pk.prot[1]}`;
  }

  function picksCard() {
    const mine = state.picks.filter((p) => p.owner === state.userTeam).sort((a, b) => a.year - b.year || a.round - b.round);
    const out = state.picks.filter((p) => p.orig === state.userTeam && p.owner !== state.userTeam).sort((a, b) => a.year - b.year || a.round - b.round);
    const row = (pk, dir) => `<tr>
      <td class="mono">${pk.year}</td>
      <td>第 ${pk.round} 轮</td>
      <td>${dir === 'in' && pk.orig !== state.userTeam ? `<b>${zts(pk.orig)}</b>` : `<span class="muted">${zts(pk.orig)}</span>`}</td>
      <td>${pk.prot ? `<span class="pill">${protLabel(pk)}</span>` : '<span class="muted">无保护</span>'}</td>
      <td class="tiny muted">${esc(pk.note || '')}${pk.simplified ? ' <span class="pill">简化</span>' : ''}</td>
    </tr>`;
    return `<div class="card" style="margin-top:14px">
      <h3>选秀权台账</h3>
      <div class="splitcol">
        <div>
          <div class="tiny muted" style="margin-bottom:6px">持有 ${mine.length} 个</div>
          <div class="scroll" style="max-height:300px"><table><thead><tr><th>年</th><th>轮</th><th>原属</th><th>保护</th><th>说明</th></tr></thead>
          <tbody>${mine.map((p) => row(p, 'in')).join('')}</tbody></table></div>
        </div>
        <div>
          <div class="tiny muted" style="margin-bottom:6px">送出 ${out.length} 个</div>
          <div class="scroll" style="max-height:300px"><table><thead><tr><th>年</th><th>轮</th><th>归属</th><th>保护</th><th>说明</th></tr></thead>
          <tbody>${out.map((p) => `<tr><td class="mono">${p.year}</td><td>第 ${p.round} 轮</td><td>${zts(p.owner)}</td>
            <td>${p.prot ? `<span class="pill">${protLabel(p)}</span>` : '<span class="muted">无保护</span>'}</td>
            <td class="tiny muted">${esc(p.note || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">没有送出的选秀权</td></tr>'}</tbody></table></div>
        </div>
      </div>
      <div class="tiny muted" style="margin-top:10px">2027 年首轮为真实归属（含保护条款）；2028 年起为各队自有签，标注「简化」。保护生效时该签留在原队并作废。</div>
    </div>`;
  }

  function prospectRow(p, idx, showTruth) {
    const scoutR = Scout.staffRating(state, state.userTeam);
    const worked = Scout.hasWorkout(state, p);
    const rg = Scout.range(p, scoutR, worked);
    const rep = Scout.report(state, p);
    const comp = (c) => (c ? esc(zn(c.name)) : '<span class="muted">—</span>');
    return `<tr class="click" data-act="draftReport" data-id="${p.id}">
      <td class="num muted">${idx}</td>
      <td><b>${esc(zn(p))}</b> <span class="pill ${rep.grade.startsWith('S') || rep.grade.startsWith('A') ? 'g' : ''}">${rep.grade}</span>${worked ? ' <span class="pill b">已试训</span>' : ''}</td>
      <td><span class="pos">${p.pos}</span></td>
      <td class="num">${p.age}</td>
      <td class="num mono">${rg.ovr[0]}-${rg.ovr[1]}</td>
      <td class="num mono" style="color:var(--accent2)">${rg.pot[0]}-${rg.pot[1]}</td>
      <td class="tiny">${comp(rep.ceiling)}<br><span class="muted">${comp(rep.floor)}</span></td>
      <td class="tiny muted">${esc(p.college)}</td>
    </tr>`;
  }

  function draftReport(id) {
    const p = (state.draftClass || []).find((x) => x.id === id) || (draft && draft.pool.find((x) => x.id === id));
    if (!p) return;
    const rep = Scout.report(state, p);
    const worked = Scout.hasWorkout(state, p);
    const rg = Scout.range(p, Scout.staffRating(state, state.userTeam), worked);
    const cmb = Scout.combine(p);
    const ft = (inch) => `${Math.floor(inch / 12)}'${Math.round(inch % 12)}"`;
    const onClock = state.off && state.off.step === 'draft' && draft && draft.slot <= 60
      && slotInfo(draft.slot).owner === state.userTeam && !draft.done;
    const line = (k, v) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid #ffffff08;padding:5px 0"><span class="muted small">${k}</span><b class="small">${v}</b></div>`;
    const inj = p.injuryRisk >= 0.45 ? '<span style="color:var(--loss)">高</span>' : p.injuryRisk >= 0.2 ? '中' : '<span style="color:var(--win)">低</span>';
    $('#modal').classList.remove('hidden');
    $('#modal').innerHTML = `<div class="box" style="max-width:600px">
      <button class="x" data-act="closeModal">×</button>
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><h2 style="margin:0">${esc(zn(p))}</h2>
          <div class="tiny muted" style="margin-top:2px">${esc(p.name)} · ${p.pos} · ${p.age} 岁 · ${esc(p.college)}</div></div>
        <div style="text-align:right"><div class="mono" style="font-size:28px;color:var(--accent2);line-height:1">${rep.grade}</div><div class="tiny muted">球探评级</div></div>
      </div>
      <div style="margin-top:12px">
        ${line('定位', rep.archLabel)}
        ${line('能力区间', `<span class="mono">${rg.ovr[0]} - ${rg.ovr[1]}</span>`)}
        ${line('潜力区间', `<span class="mono" style="color:var(--accent2)">${rg.pot[0]} - ${rg.pot[1]}</span>`)}
        ${line('上限模板', rep.ceiling ? `${esc(zn(rep.ceiling.name))} <span class="muted">(${ov(rep.ceiling.ovr)})</span>` : '—')}
        ${line('下限模板', rep.floor ? `${esc(zn(rep.floor.name))} <span class="muted">(${ov(rep.floor.ovr)})</span>` : '—')}
        ${line('球探把握', `${rep.sq}%${worked ? '（试训已收紧）' : ''}`)}
        ${line('伤病隐患', inj)}
      </div>
      <div class="tiny muted" style="margin-top:14px">联合试训数据</div>
      <div class="row" style="gap:14px;flex-wrap:wrap;margin-top:6px;font-size:12px">
        <span>裸足 <b class="mono">${ft(cmb.height)}</b></span>
        <span>体重 <b class="mono">${cmb.weight} lbs</b></span>
        <span>臂展 <b class="mono">${ft(cmb.wingspan)}</b></span>
        <span>站立摸高 <b class="mono">${ft(cmb.reach)}</b></span>
        <span>垂直弹跳 <b class="mono">${cmb.vert}"</b></span>
        <span>3/4 场冲刺 <b class="mono">${cmb.sprint}s</b></span>
        <span>禁区折返 <b class="mono">${cmb.lane}s</b></span>
        <span>卧推 <b class="mono">${cmb.bench}</b></span>
      </div>
      <div class="tiny muted" style="margin-top:14px">球队试训</div>
      ${worked
        ? `<div class="small" style="margin-top:4px;color:var(--accent2)">${esc(Scout.workoutNote(state, p))}</div>`
        : `<div class="row" style="margin-top:6px;gap:10px;align-items:center">
             <button class="btn sm" data-act="workout" data-id="${p.id}">邀请试训（剩余 ${Scout.workoutsLeft(state)} 个名额）</button>
             <span class="tiny muted">试训能收紧能力区间，并可能看破水货或捡漏</span>
           </div>`}
      <div class="small" style="margin-top:12px;line-height:1.75">${esc(rep.note)}</div>
      ${onClock ? `<div class="row" style="margin-top:16px"><button class="btn primary" data-act="draftPick" data-id="${p.id}">用第 ${draft.slot} 顺位选中他</button></div>` : ''}
    </div>`;
  }

  function viewDraft() {
    ensureDraft();
    if (!state.off || state.off.step !== 'draft') {
      const last = state.history[0];
      const soon = state.phase !== 'offseason';
      const pro = (state.phase === 'offseason' ? [] : (state.draftClass || [])).slice()
        .sort((a, b) => (b.ovr + b.pot) - (a.ovr + a.pot)).slice(0, 20);
      return `<div class="card"><h3>选秀</h3><div class="empty">${soon ? `本届选秀将在赛季结束后举行（${state.season} 年 6 月）。` : '本届选秀已结束。'}${state.phase === 'offseason' ? '<div class="row" style="justify-content:center;margin-top:16px"><button class="btn primary" data-act="view" data-view="fa">前往自由市场 →</button></div>' : ''}</div></div>
        ${pro.length ? `<div class="card" style="margin-top:14px"><h3>本届苗子前瞻</h3>
          <div class="tiny muted" style="margin-bottom:8px">球探初评，会有浮动 · 共 ${state.draftClass.length} 人参选 · 点击任意球员看球探报告</div>
          <table><thead><tr><th>预测</th><th>球员</th><th>位置</th><th class="num">年龄</th><th class="num">能力</th><th class="num">潜力</th><th>上限 / 下限模板</th><th>学校</th></tr></thead><tbody>
          ${pro.map((p, i) => prospectRow(p, i + 1)).join('')}
          </tbody></table></div>` : ''}
        ${picksCard()}`;
    }
    const onClock = draft.slot <= 60 && slotInfo(draft.slot).owner === state.userTeam && !draft.done;
    const { owner, round } = draft.slot <= 60 ? slotInfo(draft.slot) : { owner: '-', round: 2 };
    return `<div class="splitcol">
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <h3 style="margin:0">${state.season} 选秀大会</h3>
          <span class="pill ${onClock ? 'g' : ''}">${draft.slot > 60 ? '已结束' : `第 ${draft.slot} 顺位 · ${state.teams[owner]?.abbr || owner}`}</span>
        </div>
        <div class="scroll" style="margin-top:10px;max-height:520px">
          <table><thead><tr><th>#</th><th>球员</th><th>位置</th><th class="num">年龄</th><th class="num">能力</th><th class="num">潜力</th><th>上限 / 下限模板</th><th>学校</th></tr></thead><tbody>
          ${draft.pool.slice(0, 60).map((p, i) => prospectRow(p, i + 1)).join('')}
          </tbody></table>
        </div>
        ${onClock ? '<div class="tiny" style="margin-top:8px;color:var(--accent)">轮到你了：点开球员看球探报告，再决定要不要选</div>' : '<div class="tiny muted" style="margin-top:8px">其他球队选人中…（点球员可看报告）</div>'}
      </div>
      <div class="card">
        <h3>选秀结果</h3>
        <div class="pbp" style="max-height:520px">
          ${draft.log.slice().reverse().map((x) => `<div>${x.slot}. <b style="color:var(--fg)">${esc(zn(x.name))}</b> <span class="muted">${x.pos} · ${zts(x.owner)}</span> <span style="color:var(--accent2)">${ov(x)}/${pt(x)}</span>${x.ceiling ? ` <span class="muted tiny">模板 ${esc(zn(x.ceiling))}</span>` : ''}${x.protectedStay ? ' <span class="pill">保护生效</span>' : ''}</div>`).join('') || '<div class="muted">尚无结果</div>'}
        </div>
      </div>
    </div>${picksCard()}`;
  }

  // ---------------- history ----------------
  function awardName(x) { return x ? `${esc(zn(x.name))} <span class="tiny muted">${zt(x.team)}</span>` : '—'; }

  function storyBlock(r) {
    if (!r || !r.story || !r.story.length) return '';
    return `<div style="margin-top:16px">
      <div class="tiny muted">赛季纪事</div>
      ${r.story.map((p) => `<div style="margin-top:10px">
        <div class="tiny" style="color:var(--accent2);letter-spacing:.04em">${esc(p.head)}</div>
        <div class="small" style="line-height:1.9;margin-top:2px">${esc(p.text)}</div>
      </div>`).join('')}
    </div>`;
  }

  function reviewCard(r) {
    if (!r) return '';
    const A = r.awards || {};
    const teamRow = (t, i) => `<div style="margin-top:${i ? 8 : 4}px"><span class="tiny muted">${['一阵', '二阵', '三阵'][i] || `第 ${i + 1} 阵`}</span>
      <div class="small">${t.map((p) => `${esc(zn(p.name))} <span class="tiny muted">${zt(p.team)}</span>`).join('、')}</div></div>`;
    return `<div class="card">
      <div class="row" style="justify-content:space-between;align-items:baseline">
        <h3 style="margin:0">${r.season - 1}-${String(r.season).slice(2)} 赛季总结</h3>
        <span class="pill g">总冠军 ${r.champion || '-'}</span>
      </div>
      ${r.finals ? `<div class="muted small" style="margin-top:4px">总决赛 ${zt(r.finals.a)} ${r.finals.wa} - ${r.finals.wb} ${zt(r.finals.b)}</div>` : ''}
      ${storyBlock(r)}
      <div class="splitcol" style="margin-top:14px">
        <div>
          <div class="tiny muted">个人奖项</div>
          <table style="margin-top:6px"><tbody>
            <tr><td>MVP</td><td>${awardName(A.mvp)}</td></tr>
            <tr><td>FMVP</td><td>${awardName(A.fmvp)}</td></tr>
            <tr><td>最佳防守</td><td>${awardName(A.dpoy)}</td></tr>
            <tr><td>最佳新秀</td><td>${awardName(A.roy)}</td></tr>
            <tr><td>最快进步</td><td>${awardName(A.mip)}</td></tr>
            <tr><td>最佳第六人</td><td>${awardName(A.smoy)}</td></tr>
          </tbody></table>
          <div class="tiny muted" style="margin-top:12px">最佳阵容</div>
          ${(A.allNBA || []).map(teamRow).join('')}
          <div class="tiny muted" style="margin-top:12px">最佳防守阵容</div>
          ${(A.allDef || []).map((t, i) => teamRow(t, i)).join('')}
          <div class="tiny muted" style="margin-top:12px">最佳新秀阵容</div>
          <div class="small">${(A.allRookie || []).map((p) => `${esc(zn(p.name))} <span class="tiny muted">${zt(p.team)}</span>`).join('、') || '—'}</div>
        </div>
        <div>
          <div class="tiny muted">你的赛季</div>
          <div class="small" style="margin-top:6px">${zt(r.user.team)} ${r.user.wins}-${r.user.losses} · 联盟第 ${r.user.rank} · <b>${r.user.result}</b></div>
          <table style="margin-top:8px"><thead><tr><th>球员</th><th class="num">场</th><th class="num">分</th><th class="num">板</th><th class="num">助</th></tr></thead><tbody>
            ${r.user.roster.map((p) => `<tr><td>${esc(zn(p.name))}</td><td class="num">${p.gp}</td><td class="num">${p.pts.toFixed(1)}</td><td class="num">${p.reb.toFixed(1)}</td><td class="num">${p.ast.toFixed(1)}</td></tr>`).join('')}
          </tbody></table>
          <div class="tiny muted" style="margin-top:12px">联盟数据王</div>
          <div class="small" style="margin-top:4px">
            ${['pts', 'reb', 'ast'].map((k) => `<div>${({ pts: '得分', reb: '篮板', ast: '助攻' })[k]}：${esc(zn(r.leaders[k][0].name))} ${r.leaders[k][0].val.toFixed(1)}</div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
  }

  // ---------------- staff ----------------
  function coachCard(m) {
    if (!m) {
      return `<div class="card"><h3>主教练</h3><div class="empty">位置空缺 — 去下面的职员市场签一位</div></div>`;
    }
    const sys = Staff.SYSTEMS[m.system];
    const bar = (label, v) => `<div class="row" style="justify-content:space-between;align-items:center;gap:8px;margin-top:6px">
      <span class="tiny muted" style="width:52px">${label}</span>
      <div class="bar" style="flex:1;height:5px"><i style="width:${v}%;background:${v >= 85 ? 'var(--win)' : v >= 70 ? 'var(--accent)' : 'var(--loss)'}"></i></div>
      <b class="mono tiny" style="width:24px;text-align:right">${v}</b></div>`;
    return `<div class="card">
      <div class="row" style="justify-content:space-between;align-items:baseline">
        <h3 style="margin:0">主教练 · ${esc(m.name)}</h3>
        <span class="pill b">总评 ${m.ovr}</span>
      </div>
      <div class="muted small">体系：<b>${sys.name}</b>（${sys.short}） · 合同 ${fmtM(m.salary)} × ${m.years} 年</div>
      <div style="margin-top:10px">
        ${bar('进攻', m.off)}${bar('防守', m.def)}${bar('培养', m.dev)}${bar('临场', m.rot)}
      </div>
      <div class="card" style="background:#0e1522;margin-top:12px">
        <div class="small"><b style="color:var(--win)">优势：</b>${sys.good}</div>
        <div class="small" style="margin-top:4px"><b style="color:var(--loss)">劣势：</b>${sys.bad}</div>
      </div>
      <div class="row" style="margin-top:12px;gap:8px">
        <button class="btn sm" data-act="staffRenew" data-role="coach">续约</button>
        <button class="btn sm ghost" data-act="staffRelease" data-role="coach">解约</button>
      </div>
    </div>`;
  }

  function scoutCard(m) {
    if (!m) return `<div class="card"><h3>球探</h3><div class="empty">位置空缺 — 选秀报告只能靠基础数据</div></div>`;
    return `<div class="card">
      <div class="row" style="justify-content:space-between;align-items:baseline">
        <h3 style="margin:0">球探 · ${esc(m.name)}</h3>
        <span class="pill b">看人 ${m.eye}</span>
      </div>
      <div class="muted small">合同 ${fmtM(m.salary)} × ${m.years} 年</div>
      <div class="small" style="margin-top:8px">选秀报告的可信度、区间宽度都按他的看人能力走。${m.eye >= 85 ? '这是联盟里数一数二的眼睛。' : m.eye >= 75 ? '报告基本可靠，偶尔看错。' : '报告波动较大，最好配合球队试训。'}</div>
      <div class="row" style="margin-top:12px;gap:8px">
        <button class="btn sm" data-act="staffRenew" data-role="scout">续约</button>
        <button class="btn sm ghost" data-act="staffRelease" data-role="scout">解约</button>
      </div>
    </div>`;
  }

  function viewStaff() {
    const t = my();
    const market = O.refreshStaffMarket(state);
    const coaches = market.filter((m) => m.role === 'coach');
    const scouts = market.filter((m) => m.role === 'scout');
    const row = (m) => `<tr>
      <td><b>${esc(m.name)}</b></td>
      <td>${m.role === 'coach' ? `<span class="pill b">${Staff.SYSTEMS[m.system].name}</span>` : '<span class="pill b">看人</span>'}</td>
      <td class="num mono">${m.role === 'coach' ? `${m.off}/${m.def}/${m.dev}` : m.eye}</td>
      <td class="num mono">${m.role === 'coach' ? m.ovr : m.eye}</td>
      <td class="num mono">${fmtM(m.ask)}</td>
      <td class="right"><button class="btn sm" data-act="staffHire" data-id="${m.id}">签约</button></td>
    </tr>`;
    const empty = (role) => !t[role];
    return `<div class="grid" style="grid-template-columns:1fr 1fr">
      ${coachCard(t.coach)}
      ${scoutCard(t.scout)}
    </div>
    <div class="card" style="margin-top:14px">
      <div class="row" style="justify-content:space-between"><h3 style="margin:0">职员市场</h3>
        <button class="btn sm ghost" data-act="staffRefresh">刷新名单</button></div>
      <div class="tiny muted" style="margin:6px 0 8px">主教练决定体系（进攻/防守/培养/临场），球探决定选秀报告准不准。合同到期会自动离开。</div>
      <table><thead><tr><th>姓名</th><th>专长</th><th class="num">进攻/防守/培养</th><th class="num">总评</th><th class="num">要价</th><th></th></tr></thead>
      <tbody>${[...coaches, ...scouts].map(row).join('') || '<tr><td colspan="6" class="empty">市场暂时没有人</td></tr>'}</tbody></table>
    </div>`;
  }

  function viewHistory() {
    const last = (state.history[0] && state.history[0].review) || state.review || null;
    return `${last ? reviewCard(last) : ''}
    <div class="card" style="margin-top:14px"><h3>球队历史</h3>
      ${state.history.length ? `<table><thead><tr><th>赛季</th><th>总冠军</th><th>MVP</th><th>FMVP</th><th>DPOY</th><th>最佳新秀</th><th>最快进步</th><th>你的战绩</th><th></th></tr></thead><tbody>
      ${state.history.map((h, i) => `<tr><td class="mono">${h.season - 1}-${String(h.season).slice(2)}</td><td>${h.champion || '-'}</td>
        <td>${esc(zn(h.mvp))}</td><td>${esc(zn(h.fmvp || '-'))}</td><td>${esc(zn(h.dpoy))}</td><td>${esc(zn(h.roy))}</td><td>${esc(zn(h.mip || '-'))}</td>
        <td class="tiny">${h.user ? `${h.user.wins}-${h.user.losses} · ${h.user.result}` : '-'}</td>
        <td class="right">${h.review ? `<button class="btn sm ghost" data-act="review" data-i="${i}">查看</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">还没有完整赛季</div>'}
      <h3 style="margin-top:20px">近期交易与签约</h3>
      <div class="pbp" style="max-height:300px">${state.transactions.slice(0, 40).map((x) => `<div>${x.date} <span class="muted">${x.type}</span> ${esc(localizeText(x.text))}</div>`).join('') || '<div class="muted">暂无</div>'}</div>
    </div>`;
  }

  function showReview(i) {
    const h = state.history[i];
    if (!h || !h.review) return;
    $('#modal').classList.remove('hidden');
    $('#modal').innerHTML = `<div class="box" style="max-width:860px">
      <button class="x" data-act="closeModal">×</button>
      ${reviewCard(h.review)}
    </div>`;
  }

  // ---------------- game (box + tactical replay) ----------------
  function logGame(game, result) {
    const home = game.home, away = game.away;
    const isHome = home === state.userTeam;
    const opp = isHome ? away : home;
    const myScore = isHome ? game.hs : game.as;
    const oppScore = isHome ? game.as : game.hs;
    const won = myScore > oppScore;
    const side = result.home.team === state.userTeam ? result.home : result.away;
    const best = side.rows.slice().sort((a, b) => b.pts - a.pts)[0];
    Office.pushInbox(state, {
      type: 'game',
      title: `${won ? '胜' : '负'} ${isHome ? '主' : '客'} ${opp} ${myScore}-${oppScore}`,
      body: `${best ? `本场最佳：${best.name} ${best.pts}分 ${best.reb}篮板 ${best.ast}助攻。` : ''}${game.playoff ? '（季后赛）' : ''}`,
    });
  }

  function persistGame(game, result) {
    try {
      state.lastGame = { game, result: {
        home: result.home, away: result.away, qHome: result.qHome, qAway: result.qAway, ot: result.ot,
        events: (result.events || []).slice(-90),
      } };
    } catch (e) { /* ignore quota */ }
  }

  function viewGame() {
    if (!lastGame && state.lastGame) lastGame = state.lastGame;
    if (!lastGame) return `<div class="card"><div class="empty">还没有比赛。点「推进一天」开始赛季。</div></div>`;
    const { game, result } = lastGame;
    const home = result.home, away = result.away;
    const mine = home.team === state.userTeam ? home : away;
    const other = home.team === state.userTeam ? away : home;
    const box = (side) => `
      <table><thead><tr><th>${zts(side.team)}</th><th class="num">分</th><th class="num">板</th><th class="num">助</th><th class="num">投</th><th class="num">三分</th><th class="num">罚</th><th class="num">+/-</th></tr></thead>
      <tbody id="gbBox-${side.team}"></tbody></table>`;
    return `
    <div class="hud">
      <div class="row" style="gap:12px"><img src="assets/logos/${away.team}.png" style="width:30px"><b>${zt(away.team)}</b></div>
      <div class="sc" id="gbScore">0 : 0</div>
      <div class="row" style="gap:12px"><b>${zt(home.team)}</b><img src="assets/logos/${home.team}.png" style="width:30px"></div>
    </div>
    <div class="gamewrap">
      <div>
        <div class="court">
          <div class="playhdr">
            <span class="dotp" style="background:${state.teams[away.team]?.color}"></span><span class="small">${zts(away.team)}</span>
            <span class="dotp" style="background:${state.teams[home.team]?.color};margin-left:8px"></span><span class="small">${zts(home.team)}</span>
            <span class="spacer" style="flex:1"></span>
            <span class="mono small" id="replayclock">关键时刻回放</span>
          </div>
          <div id="courtbox"></div>
          <div class="row" style="margin-top:10px;gap:8px">
            <button class="btn sm primary" data-act="replayPlay">▶ 播放关键时刻</button>
            <button class="btn sm" data-act="replayStep">下一回合</button>
            <select class="sel" id="replaySpeed" style="padding:4px 8px"><option value="1400">1x</option><option value="700">2x</option><option value="300">4x</option></select>
          </div>
        </div>
        <div class="card" style="margin-top:14px"><h3>技术统计 · ${zt(away.team)}</h3>${box(away)}</div>
        <div class="card" style="margin-top:14px"><h3>技术统计 · ${zt(home.team)}</h3>${box(home)}</div>
      </div>
      <div class="card">
        <h3>本场节奏</h3>
        <div class="small" style="line-height:1.9">
          <div class="row" style="justify-content:space-between"><span>比分</span><b class="mono">${away.score}-${home.score}</b></div>
          <div class="row" style="justify-content:space-between"><span>FG%</span><b class="mono">${(away.fgPct * 100).toFixed(1)}% / ${(home.fgPct * 100).toFixed(1)}%</b></div>
          <div class="row" style="justify-content:space-between"><span>3P%</span><b class="mono">${(away.tpPct * 100).toFixed(1)}% / ${(home.tpPct * 100).toFixed(1)}%</b></div>
          <div class="row" style="justify-content:space-between"><span>篮板</span><b class="mono">${away.reb} / ${home.reb}</b></div>
          <div class="row" style="justify-content:space-between"><span>助攻</span><b class="mono">${away.ast} / ${home.ast}</b></div>
          <div class="row" style="justify-content:space-between"><span>失误</span><b class="mono">${away.tov} / ${home.tov}</b></div>
        </div>
        <h3 style="margin-top:18px">逐回合</h3>
        <div class="pbp" id="pbp"></div>
      </div>
    </div>`;
  }

  function renderReplayBox() {
    if (!replay || !replay.box) return;
    for (const side of [replay.away, replay.home]) {
      const body = document.getElementById(`gbBox-${side.team}`);
      if (!body) continue;
      const rows = Object.values(replay.box).filter((r) => r.team === side.team)
        .sort((a, b) => (b.pts + b.reb + b.ast) - (a.pts + a.reb + a.ast));
      body.innerHTML = rows.map((r) => `<tr>
        <td>${esc(zn(r.name))} <span class="pos">${r.pos}</span></td>
        <td class="num"><b>${r.pts}</b></td><td class="num">${r.reb}</td><td class="num">${r.ast}</td>
        <td class="num tiny">${r.fgm}-${r.fga}</td><td class="num tiny">${r.tpm}-${r.tpa}</td><td class="num tiny">${r.ftm}-${r.fta}</td>
        <td class="num tiny">—</td></tr>`).join('');
    }
  }

  function replayLine(id, ev) {
    if (!replay.box) replay.box = {};
    if (replay.box[id]) return replay.box[id];
    const p = byId(id) || {};
    return (replay.box[id] = { id, name: p.name || '', pos: p.pos || '', team: ev.team, pts: 0, reb: 0, ast: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 });
  }

  function bumpReplayBox(ev) {
    if (!replay) return;
    const b = replayLine(ev.pid, ev);
    if (ev.action === 'make' || ev.action === 'secondChance' || ev.action === 'putback') {
      b.pts += ev.pts || 0; b.fgm += 1; b.fga += 1;
      if (ev.shot === 'three') { b.tpm += 1; b.tpa += 1; }
      if (ev.ast) replayLine(ev.ast, ev).ast += 1;
    } else if (ev.action === 'miss' || ev.action === 'secondChanceMiss') {
      b.fga += 1;
      if (ev.shot === 'three') b.tpa += 1;
    } else if (ev.action === 'foul' && ev.ft) {
      b.pts += ev.pts || 0;
      if (ev.pts) { b.fta += 1; b.ftm += 1; }
    }
    if (ev.reb) replayLine(ev.reb, ev).reb += 1;
    if (ev.oreb) replayLine(ev.oreb, ev).reb += 1;
  }

  function initReplay() {
    if (!lastGame) return;
    const { result } = lastGame;
    const ev = (result.events || []).slice();
    replay = { idx: 0, playing: false, timer: null, events: ev, home: result.home, away: result.away,
      shown: { [result.home.team]: 0, [result.away.team]: 0 } };
    // use the same moving-dot court as the live view
    if (window.Court && $('#courtbox')) {
      Court.init($('#courtbox'), {
        home: { color: state.teams[result.home.team].color },
        away: { color: state.teams[result.away.team].color },
      });
      const fiveOf = (side) => side.rows.filter((r) => r.min > 0).sort((a, b) => b.min - a.min).slice(0, 5).map((r) => r.id);
      replay.five = { home: fiveOf(result.home), away: fiveOf(result.away) };
      Court.setLineups(replay.five, playersMap(), 'home');
      return;
    }
    drawCourt();
  }

  const SPOTS = {
    PG: [250, 250], SG: [400, 175], SF: [105, 175], PF: [165, 325], C: [335, 325],
  };
  const POS_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];

  function drawCourt(ev) {
    const box = $('#courtbox');
    if (!box) return;
    const homeColor = state.teams[replay.home?.team]?.color || '#ff6b35';
    const awayColor = state.teams[replay.away?.team]?.color || '#2fb5ff';
    let off = [], def = [];
    let ball = [250, 250];
    if (ev) {
      const shooter = byId(ev.pid);
      const idx = shooter ? POS_ORDER.indexOf(shooter.pos) : 0;
      const spot = SPOTS[POS_ORDER[idx >= 0 ? idx : 0]] || [250, 250];
      ball = ev.shot === 'three' ? [spot[0], spot[1] - 10] : ev.shot === 'rim' ? [250, 340] : spot;
      off = POS_ORDER.map((p, i) => [SPOTS[p][0], SPOTS[p][1]]);
      def = off.map(([x, y], i) => [x + (250 - x) * 0.16, y + (420 - y) * 0.18]);
    } else {
      off = POS_ORDER.map((p) => SPOTS[p]);
      def = off.map(([x, y]) => [x + (250 - x) * 0.16, y + (420 - y) * 0.18]);
    }
    const isHome = ev && ev.team === replay.home?.team;
    box.innerHTML = `
      <svg viewBox="0 0 500 470" style="height:420px" preserveAspectRatio="xMidYMid meet">
        <rect x="0" y="0" width="500" height="470" fill="#0e1522" rx="10"/>
        <path d="M35 470 L35 268 A268 268 0 0 1 465 268 L465 470" fill="none" stroke="#2b3b53" stroke-width="3"/>
        <rect x="170" y="292" width="160" height="178" fill="#0b111b" stroke="#2b3b53" stroke-width="3"/>
        <path d="M170 292 A80 80 0 0 1 330 292" fill="none" stroke="#2b3b53" stroke-width="3"/>
        <path d="M170 292 A80 80 0 0 0 330 292" fill="none" stroke="#2b3b53" stroke-width="2" stroke-dasharray="5 5"/>
        <path d="M205 470 L205 400 A45 45 0 0 1 295 400 L295 470" fill="none" stroke="#2b3b53" stroke-width="2"/>
        <line x1="218" y1="452" x2="282" y2="452" stroke="#8ea3bf" stroke-width="3"/>
        <circle cx="250" cy="440" r="8" fill="none" stroke="#ff6b35" stroke-width="3"/>
        <line x1="14" y1="470" x2="486" y2="470" stroke="#2b3b53" stroke-width="4"/>
        ${off.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="15" fill="${isHome ? homeColor : awayColor}" opacity=".9" stroke="#0b0e14" stroke-width="2"/>`).join('')}
        ${def.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="none" stroke="#c8d6ea" stroke-width="2" opacity=".8"/>`).join('')}
        ${ev ? `<line x1="${ball[0]}" y1="${ball[1]}" x2="250" y2="440" stroke="#ffe6b0" stroke-width="1.5" stroke-dasharray="4 4" opacity=".55"/><circle cx="${ball[0]}" cy="${ball[1]}" r="7" fill="#ffe6b0"/>` : ''}
        ${ev && ev.made ? `<circle cx="250" cy="440" r="26" fill="none" stroke="#37c98b" stroke-width="3" opacity=".9"><animate attributeName="r" values="18;44;18" dur="0.7s"/><animate attributeName="opacity" values=".9;0;.9" dur="0.7s"/></circle>` : ''}
      </svg>`;
    const pbp = $('#pbp');
    if (pbp) {
      pbp.innerHTML = replay.events.slice(Math.max(0, replay.idx - 14), replay.idx + 1).map((e, i) => {
        const p = byId(e.pid);
        const label = { foul: '罚球', turnover: '失误', miss: '不中', secondChance: '二次进攻', secondChanceMiss: '二次不进', oreb: '前场板', putback: '补篮' }[e.action] || (e.made ? '命中' : '不中');
        const cls = e.made ? 'sc' : '';
        return `<div class="${cls}">Q${e.q} ${String(Math.floor(e.clock / 60)).padStart(2, '0')}:${String(e.clock % 60).padStart(2, '0')} · ${zts(e.team)} · ${p ? esc(zn(p)) : ''} ${label} ${e.pts ? '+' + e.pts : ''}</div>`;
      }).join('');
      pbp.scrollTop = pbp.scrollHeight;
    }
  }

  function renderReplayPbp() {
    const pbp = $('#pbp');
    if (!pbp) return;
    pbp.innerHTML = replay.events.slice(Math.max(0, replay.idx - 14), replay.idx + 1).map((e) => {
      const p = byId(e.pid);
      const label = { foul: '造犯规', turnover: '失误', miss: '不中', secondChance: '二次进攻命中', secondChanceMiss: '二次不中', oreb: '前场板', putback: '补篮', make: '命中' }[e.action] || (e.made ? '命中' : '不中');
      return `<div class="${e.made ? 'sc' : ''}">Q${e.q} ${String(Math.floor(e.clock / 60)).padStart(2, '0')}:${String(e.clock % 60).padStart(2, '0')} · ${zts(e.team)} · ${p ? esc(zn(p)) : ''} ${label} ${e.pts ? '+' + e.pts : ''}</div>`;
    }).join('');
    pbp.scrollTop = pbp.scrollHeight;
  }

  function replayStep() {
    if (!replay.events.length) return;
    if (replay.idx >= replay.events.length) { replay.playing = false; return; }
    const ev = replay.events[replay.idx];
    bumpReplayBox(ev);
    renderReplayBox();
    if (replay.shown && ev.pts) {
      replay.shown[ev.team] = (replay.shown[ev.team] || 0) + ev.pts;
      const el = $('#gbScore');
      if (el) el.textContent = `${replay.shown[replay.away.team] || 0} : ${replay.shown[replay.home.team] || 0}`;
    }
    if (window.Court && replay.five) {
      if (replay.idx === 0 || ev.team !== replay.lastTeam) { Court.halfCourt(ev.team === replay.home.team ? 'home' : 'away'); replay.lastTeam = ev.team; }
      Court.showEvent(ev, playersMap(), ev.team === replay.home.team ? 'home' : 'away');
      renderReplayPbp();
    } else {
      drawCourt(ev);
    }
    replay.idx++;
  }

  function toggleReplay() {
    if (replay.playing) { replay.playing = false; clearInterval(replay.timer); $('#replayclock') && ($('#replayclock').textContent = '已暂停'); return; }
    if (replay.idx >= replay.events.length) { replay.idx = 0; }
    replay.playing = true;
    const speed = Number($('#replaySpeed')?.value || 1400);
    $('#replayclock') && ($('#replayclock').textContent = '回放中…');
    replay.timer = setInterval(() => {
      replayStep();
      if (replay.idx >= replay.events.length) { clearInterval(replay.timer); replay.playing = false; $('#replayclock') && ($('#replayclock').textContent = '回放结束'); }
    }, speed);
  }

  // ---------------- live coach mode ----------------
  const playersMap = () => {
    const m = {};
    state.players.forEach((p) => { m[p.id] = { id: p.id, pos: p.pos, num: p.jersey || '' }; });
    return m;
  };

  // engine reports on-court ids keyed by team abbr; the court wants home/away
  const fiveOf = () => {
    const o = live.session.onCourt();
    return { home: o[live.session.homeAbbr], away: o[live.session.awayAbbr] };
  };

  function startLive() {
    const ng = nextUserGame();
    if (!ng) return;
    let guard = 0;
    while (state.date < ng.date && guard++ < 40 && state.phase === 'regular') stepDay();
    const g = state.games.find((x) => x === ng);
    if (!g || g.played) { save(); render(); return; }
    const session = Sim.createSession(state, g.home, g.away, { events: true, autoSub: true });
    if (!session) return;
    session.setAutoSub(state.userTeam, false);      // watching = you coach the subs
    Court.setSpeed(Number(localStorage.getItem('nbagm.speed') || 1));
    live = { game: g, session, q: 0, evSeen: 0, break: false, playing: false, lines: [], fiveKey: '', queued: null };
    view = 'live';
    render();
    initLiveCourt();
    liveLoop();
  }

  function initLiveCourt() {
    if (!live) return;
    const box = $('#courtbox');
    if (!box) return;
    const s = live.session;
    Court.init(box, {
      home: { color: state.teams[s.homeAbbr].color, abbr: s.homeAbbr },
      away: { color: state.teams[s.awayAbbr].color, abbr: s.awayAbbr },
      k2: Object.fromEntries(state.players.map((p) => [p.id, p.three || 0])),
    });
    const five = fiveOf();
    live.fiveKey = JSON.stringify(five);
    Court.setLineups(five, playersMap(), 'home');
  }

  function liveScoreLine(delta) {
    if (!live) return;
    const s = live.session;
    if (!live.shown) live.shown = { [s.homeAbbr]: 0, [s.awayAbbr]: 0 };
    if (delta && delta.pts) live.shown[delta.team] = (live.shown[delta.team] || 0) + delta.pts;
    const el = $('#liveScore');
    if (el) el.textContent = `${live.shown[s.awayAbbr] || 0} : ${live.shown[s.homeAbbr] || 0}`;
  }

  function pushPbp(ev) {
    const p = byId(ev.pid);
    const label = { foul: '造犯规', turnover: '失误', miss: '不中', secondChance: '二次进攻命中', secondChanceMiss: '二次进攻不中', oreb: '前场篮板', putback: '补篮命中', make: '命中' }[ev.action] || (ev.made ? '命中' : '不中');
    const steal = ev.steal ? byId(ev.steal) : null;
    const text = `Q${ev.q} ${String(Math.floor(ev.clock / 60)).padStart(2, '0')}:${String(ev.clock % 60).padStart(2, '0')} · ${zts(ev.team)} · ${p ? zn(p.name) : ''} ${label}${ev.pts ? ' +' + ev.pts : ''}${steal ? `（被 ${zn(steal.name)} 断球）` : ''}`;
    live.lines.push({ text, made: !!ev.made });
    const pbp = document.getElementById('pbp');
    if (pbp) {
      const d = document.createElement('div');
      d.className = ev.made ? 'sc' : '';
      d.textContent = text;
      pbp.appendChild(d);
      pbp.scrollTop = pbp.scrollHeight;
    }
  }

  // one possession at a time, so a queued sub can land on the next dead ball
  async function liveLoop() {
    if (!live || live.playing) return;
    live.playing = true;
    live.break = false;
    const btn = document.querySelector('[data-act="livePlay"]');
    if (btn) { btn.textContent = '播放中…'; btn.disabled = true; }
    const s = live.session;
    const pm = playersMap();
    if (!document.querySelector('#ct-players g')) initLiveCourt();

    while (live && !live.break) {
      const step = s.stepOne();
      if (!step) break;
      if (step === 'start') {
        live.q = s.quarter;
        live.fiveKey = JSON.stringify(fiveOf());
        Court.setLineups(fiveOf(), pm, 'home');
        continue;
      }
      if (step === 'quarter') {
        live.q = s.quarter;
        live.break = true;
        break;
      }
      const five = fiveOf();
      const key = JSON.stringify(five);
      if (!live.panelReady && (live.session.onCourt()[state.userTeam] || []).length === 5) {
        live.panelReady = true;
        repaintSubs();
      }
      if (key !== live.fiveKey) {           // a queued substitution just went on
        live.fiveKey = key;
        Court.setLineups(five, pm, 'home');
        repaintSubs();
        live.queued = null;
        live.draft = (five[state.userTeam === s.homeAbbr ? 'home' : 'away'] || []).slice();
        live.sel = null;
        live.dirty = false;
        repaintSubs();
        await new Promise((r) => setTimeout(r, 260));
      }
      const evs = s.events.slice(live.evSeen);
      live.evSeen = s.events.length;
      if (evs.length) Court.halfCourt(evs[0].team === s.homeAbbr ? 'home' : 'away');
      for (const ev of evs) {
        await Court.showEvent(ev, pm, ev.team === s.homeAbbr ? 'home' : 'away');
        liveScoreLine({ team: ev.team, pts: ev.pts || 0 });
        pushPbp(ev);
        renderLiveBox();
      }
    }

    if (!live) return;
    live.playing = false;
    if (s.finished) return liveEnd();
    live.break = true;
    render();
  }

  function liveEnd() {
    if (!live) return;
    const s = live.session;
    const res = s.result();
    L.applyResult(state, live.game, res);
    lastGame = { game: live.game, result: res };
    persistGame(live.game, res);
    logGame(live.game, res);
    stepDay();
    live = null;
    save();
    view = 'game';
    render();
    initReplay();
  }

  function renderLiveBox() {
    const body = document.getElementById('liveBoxBody');
    if (!body || !live) return;
    const s = live.session;
    const mins = s.minutes;
    const rows = Object.values(s.box).map((r) => ({ ...r, min: mins[r.id] || 0 }))
      .filter((r) => r.min > 0).sort((a, b) => b.min - a.min);
    body.innerHTML = rows.map((r) => `<tr><td>${esc(zn(r.name))} <span class="pos">${r.pos}</span></td>
      <td class="num"><b>${r.pts}</b></td><td class="num">${r.reb}</td><td class="num">${r.ast}</td>
      <td class="num tiny">${r.fgm}-${r.fga}</td><td class="num tiny">${r.tpm}-${r.tpa}</td>
      <td class="num tiny">${Math.round(r.min)}</td></tr>`).join('');
  }

  function liveQueueSubs() {
    if (!live || !live.draft || live.draft.length !== 5) return;
    live.session.setFive(state.userTeam, live.draft);
    live.queued = live.draft.slice();
    live.dirty = false;
    repaintSubs();
  }

  function subReset() {
    if (!live) return;
    live.draft = (live.session.onCourt()[state.userTeam] || []).slice();
    live.sel = null;
    repaintSubs();
  }

  function subPlayerCard(p, onCourt, sel) {
    const bg = onCourt ? 'rgba(255,107,53,.16)' : 'var(--bg3)';
    const border = sel ? 'var(--accent)' : onCourt ? 'rgba(255,107,53,.55)' : 'var(--line)';
    const fat = Math.round(p.fatigue || 0);
    const fatDot = fat >= 70 ? 'var(--loss)' : fat >= 40 ? 'var(--accent)' : 'var(--win)';
    return `<button class="pcard" data-act="subPick" data-id="${p.id}" data-on="${onCourt ? 1 : 0}" title="${esc(zn(p))} · ${p.pos} · 能力 ${ov(p)} · 疲劳 ${fat}"
      style="display:flex;align-items:center;gap:5px;padding:5px 8px;border-radius:8px;border:1px solid ${border};background:${bg};color:var(--fg);cursor:pointer;white-space:nowrap">
      <span style="width:6px;height:6px;border-radius:50%;background:${fatDot};flex:none"></span>
      <span style="font-size:11.5px;font-weight:600">${esc(zn(p))}</span>
      <span class="tiny muted">${p.pos}</span>
      <b class="mono" style="font-size:11.5px">${ov(p)}</b>
    </button>`;
  }

  function liveSubsPanel() {
    if (!live) return '';
    const roster = state.players.filter((p) => p.team === state.userTeam && !p.retired && !p.injDays);
    const floor = live.session.onCourt()[state.userTeam] || [];
    if (!live.draft || live.draft.length !== 5 || (!live.dirty && floor.length === 5
        && JSON.stringify(floor.slice().sort()) !== JSON.stringify(live.draft.slice().sort()))) {
      live.draft = floor.length === 5 ? floor.slice() : roster.slice(0, 5).map((p) => p.id);
      live.sel = null;
    }
    const on = live.draft;
    const bench = roster.filter((p) => !on.includes(p.id)).sort((a, b) => b.ovr - a.ovr);
    const onCards = on.map((id) => byId(id)).filter(Boolean).map((p) => subPlayerCard(p, true, live.sel === p.id)).join('');
    const benchCards = bench.map((p) => subPlayerCard(p, false, live.sel === p.id)).join('');
    const changed = on.length === 5 && JSON.stringify(on.slice().sort()) !== JSON.stringify((live.session.onCourt()[state.userTeam] || []).slice().sort());
    const auto = live.session.autoSub ? live.session.autoSub(state.userTeam) : true;
    return `<div class="card" style="margin-top:12px" id="subPanel">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px;gap:10px;flex-wrap:wrap">
        <h3 style="margin:0">换人 <span class="tiny muted" style="font-weight:400">点场上球员，再点替补交换</span></h3>
        <div class="row" style="gap:8px;align-items:center">
          <button class="btn sm ${auto ? 'ghost' : 'primary'}" data-act="autoSub">自动轮换：${auto ? '开' : '关'}</button>
          <button class="btn sm ${changed ? 'primary' : 'ghost'}" data-act="liveSubs" ${changed ? '' : 'disabled'}>安排换人</button>
          ${changed ? '<button class="btn sm ghost" data-act="subReset">撤销</button>' : ''}
        </div>
      </div>
      <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
        <span class="tiny muted" style="width:40px">场上</span>${onCards}
      </div>
      <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">
        <span class="tiny muted" style="width:40px">替补</span>${benchCards}
      </div>
      <div class="tiny" id="subNotice" style="margin-top:8px;color:${live.queued ? 'var(--accent)' : 'var(--muted)'}">${live.queued ? '已安排：下次死球执行' : (changed ? '这套阵容还没提交' : (auto ? '自动轮换开着，死球时教练会按计划分钟换人' : '自动轮换关着：谁上场由你决定'))}</div>
    </div>`;
  }

  function subPick(id) {
    if (!live) return;
    const onCourt = (live.draft || []).includes(id);
    live.dirty = true;
    if (onCourt) { live.sel = live.sel === id ? null : id; return repaintSubs(); }
    if (!live.sel) { live.sel = id; return repaintSubs(); }
    // swap the selected starter with this bench player
    const i = live.draft.indexOf(live.sel);
    if (i >= 0) live.draft[i] = id;
    live.sel = null;
    repaintSubs();
  }

  function repaintSubs() {
    const el = document.getElementById('subPanel');
    if (!el) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = liveSubsPanel();
    el.replaceWith(wrap.firstElementChild);
  }

  function viewLive() {
    if (!live) return `<div class="card"><div class="empty">没有进行中的比赛。回总览点「逐节观看」开始。</div></div>`;
    const s = live.session;
    const mins = s.minutes;
    const box = Object.values(s.box).map((r) => ({ ...r, min: mins[r.id] || 0 })).sort((a, b) => b.min - a.min);
    const shown = live.shown || { [s.homeAbbr]: 0, [s.awayAbbr]: 0 };
    const line = (r) => `<tr><td>${esc(zn(r.name))} <span class="pos">${r.pos}</span></td>
      <td class="num"><b>${r.pts}</b></td><td class="num">${r.reb}</td><td class="num">${r.ast}</td>
      <td class="num tiny">${r.fgm}-${r.fga}</td><td class="num tiny">${r.tpm}-${r.tpa}</td>
      <td class="num tiny">${Math.round(r.min)}</td></tr>`;
    return `<div class="hud">
        <div class="row" style="gap:12px"><img src="assets/logos/${s.awayAbbr}.png" style="width:30px"><b>${zt(s.awayAbbr)}</b></div>
        <div class="sc" id="liveScore">${shown[s.awayAbbr] || 0} : ${shown[s.homeAbbr] || 0}</div>
        <div class="row" style="gap:12px"><b>${zt(s.homeAbbr)}</b><img src="assets/logos/${s.homeAbbr}.png" style="width:30px"></div>
      </div>
      <div class="gamewrap">
        <div>
          ${liveSubsPanel()}
          <div class="court">
            <div class="playhdr">
              <span class="dotp" style="background:${state.teams[s.awayAbbr].color}"></span><span class="small">${zts(s.awayAbbr)}</span>
              <span class="dotp" style="background:${state.teams[s.homeAbbr].color};margin-left:8px"></span><span class="small">${zts(s.homeAbbr)}</span>
              <span style="flex:1"></span>
              <span class="mono small">${live.playing ? '进行中' : live.break ? '节间休息' : `第 ${Math.max(1, live.q)} 节`}</span>
              <span class="row" style="gap:4px;margin-left:8px">
                ${[1, 2, 4].map((x) => `<button class="btn sm ${Number(localStorage.getItem('nbagm.speed') || 1) === x ? '' : 'ghost'}" style="padding:1px 7px" data-act="liveSpeed" data-v="${x}">${x}x</button>`).join('')}
              </span>
            </div>
            <div id="courtbox"></div>
            <div class="row" style="margin-top:10px;gap:8px">
              ${live.break ? `<button class="btn sm primary" data-act="livePlay">继续第 ${Math.min(live.q + 1, 4)} 节</button>
                              <button class="btn sm ghost" data-act="liveSimRest">直接模拟剩余</button>`
                            : `<button class="btn sm primary" data-act="livePlay">${live.playing ? '播放中…' : (live.evSeen ? '继续播放' : '开始比赛')}</button>`}
              <span class="tiny muted">${live.break ? '节间休息' : '十名球员会随球移动'}</span>
            </div>
          </div>
          <div class="card" style="margin-top:14px"><h3>技术统计</h3>
            <table><thead><tr><th>球员</th><th class="num">分</th><th class="num">板</th><th class="num">助</th><th class="num">投</th><th class="num">三分</th><th class="num">分钟</th></tr></thead>
            <tbody id="liveBoxBody">${box.filter((r) => r.min > 0).map(line).join('')}</tbody></table>
          </div>
        </div>
        <div class="card">
          <h3>逐回合</h3>
          <div class="pbp" id="pbp" style="max-height:520px">
            ${live.lines.map((l) => `<div class="${l.made ? 'sc' : ''}">${esc(l.text)}</div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  // ---------------- player modal ----------------
  function showPlayer(id) {
    const p = byId(id);
    if (!p) return;
    const s = p.st;
    const per = (v, d = 1) => (s.gp ? (v / s.gp).toFixed(d) : '-');
    const A0 = p.k2a || {};
    const av = (k) => (A0[k] != null ? A0[k] : toK(p[k]));
    const A = [
      ['内线得分', av('ins')], ['中距离', av('mid')], ['三分', av('three')], ['罚球', av('ft')],
      ['控球', av('handle')], ['传球', av('pass')], ['进攻智商', av('oiq')], ['防守智商', av('diq')],
      ['外线防守', av('pdef')], ['内线防守', av('idef')], ['篮板', av('reb')], ['速度', av('spd')],
      ['力量', av('str')], ['体能', av('sta')], ['耐伤', av('dur')],
    ];
    $('#modal').classList.remove('hidden');
    $('#modal').innerHTML = `<div class="box">
      <button class="x" data-act="closeModal">×</button>
      <div class="row" style="gap:16px">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800">${ov(p)}</div>
        <div>
          <h2 style="margin:0">${esc(zn(p))}</h2>
          <div class="muted small">${p.pos} · ${p.age} 岁 · ${Math.floor(p.h / 12)}'${p.h % 12}" · ${p.w} lbs · ${esc(p.college || '—')}</div>
          <div class="tiny muted" style="margin-top:2px">可打：${Core.POS_LIST.filter((x) => x !== p.pos).map((x) => {
            const f = Core.posFactor(p, x);
            return `<span style="color:${f >= 0.93 ? 'var(--win)' : f >= 0.85 ? 'var(--fg)' : 'var(--loss)'}">${x}（${Math.round(Core.ovrAt(p, x))}，-${Math.round((1 - f) * 100)}%）</span>`;
          }).join(' · ')}</div>
          <div class="small" style="margin-top:4px">${p.team ? `<img src="assets/logos/${p.team}.png" style="width:18px;vertical-align:-4px"> ${zt(p.team)}` : '<span class="pill">自由球员</span>'}
           ${p.injDays > 0 ? `<span class="pill ${Injury.isOut(p) ? 'r' : 'o'}">${Injury.label(p)}</span>` : ''}</div>
          ${p.injDays > 0 && p.injury ? `<div class="tiny" style="margin-top:4px;color:${Injury.isOut(p) ? 'var(--loss)' : 'var(--accent)'}">
             ${Injury.isOut(p) ? '无法出战' : `带伤出战：能力约 ${Math.round((1 - Injury.effMul(p)) * 100)}% 折扣`}
             ${p.injury.sev === 'severe' ? ' · 复出后可能永久掉能力' : ''}</div>` : ''}
          ${p.lastPermDamage && !p.injDays ? `<div class="tiny" style="margin-top:4px;color:var(--loss)">上次重伤复出：能力永久 -${p.lastPermDamage.ovrDrop}${p.lastPermDamage.potDrop ? ` · 潜力 -${p.lastPermDamage.potDrop}` : ''}</div>` : ''}
          ${p.injuryHistory ? `<div class="tiny" style="margin-top:2px;color:var(--muted)">伤病史：${p.injuryHistory} 次${p.injuryHistory >= 3 ? ' · 交易价值约 -' + Math.min(12, p.injuryHistory * 3) + '%' : ''}</div>` : ''}
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="mono small muted">合同</div>
          <div class="mono">${p.salary ? fmtM(p.salary) + ' × ' + p.years + '年' : '—'}</div>
          <div class="tiny muted">市场价 ${fmtM(marketSalary(p.ovr))}</div>
          ${p.team === state.userTeam ? `<div class="row" style="margin-top:6px;justify-content:flex-end">
            <button class="btn sm" data-act="talk" data-id="${p.id}">对话</button>
            <button class="btn sm ghost" data-act="release" data-id="${p.id}">裁掉</button>
            ${O.buyoutOpen(state) && p.years > 0 ? `<button class="btn sm ghost" data-act="buyout" data-id="${p.id}">买断</button>` : ''}</div>` : ''}
        </div>
      </div>
      ${(() => {
        const fat = p.fatigue || 0;
        const mor = p.morale == null ? 70 : p.morale;
        const cap = Core.capacityOf(p);
        const b = p.moraleParts;
        const row = (label, actual, expect, sat) => `<div class="row" style="justify-content:space-between;font-size:12px">
          <span class="muted">${label}</span>
          <span class="mono">${actual} <span class="muted">/ ${expect}</span></span>
          <span class="mono" style="color:${sat > 0.1 ? 'var(--win)' : sat < -0.1 ? 'var(--loss)' : 'var(--muted)'};width:40px;text-align:right">${sat > 0 ? '+' : ''}${sat.toFixed(2)}</span>
        </div>`;
        return `<div class="card" style="margin-top:16px;background:#0e1522">
          <div class="row" style="gap:24px;align-items:flex-start;flex-wrap:wrap">
            <div style="min-width:180px;flex:1">
              <h3 style="margin:0 0 6px">身体状况</h3>
              <div class="row" style="justify-content:space-between;font-size:12px"><span class="muted">体力</span><b class="mono">${p.sta}</b></div>
              <div class="row" style="justify-content:space-between;font-size:12px"><span class="muted">疲劳</span><b class="mono" style="color:${fatigueColor(fat)}">${fat.toFixed(0)}</b></div>
              <div class="bar" style="height:6px;margin:4px 0"><i style="width:${Math.min(100, fat)}%;background:${fatigueColor(fat)}"></i></div>
              <div class="tiny muted">建议单场 ≤ ${cap.toFixed(0)} 分钟，超过会加速疲劳</div>
            </div>
            <div style="min-width:230px;flex:1.4">
              <h3 style="margin:0 0 6px">士气 <span class="mono" style="color:${moraleColor(mor)}">${mor}</span>${p.tradeRequest ? ' <span class="pill r">已申请交易</span>' : ''}</h3>
              ${b ? `
                ${row('上场时间', b.actualM.toFixed(1), b.expM, b.minSat)}
                ${row('球权占比', (b.actualU * 100).toFixed(0) + '%', (b.expU * 100).toFixed(0) + '%', b.usgSat)}
                ${row('真实命中率', (b.actualTS * 100).toFixed(1) + '%', (b.expTS * 100).toFixed(1) + '%', b.perfSat)}
                ${row('球队近况', (b.winRate * 100).toFixed(0) + '%', '50%', b.teamSat)}
              ` : '<div class="tiny muted">打几场之后才会有士气评估</div>'}
              <div class="tiny muted" style="margin-top:6px">权重：时间 40% · 球权 25% · 表现 20% · 战绩 15%</div>
              <div class="tiny" style="margin-top:4px">当前状态 <b style="color:${(p.form || 0) > 0 ? 'var(--win)' : (p.form || 0) < 0 ? 'var(--loss)' : 'var(--fg)'}">${(p.form || 0) > 0 ? '+' : ''}${(p.form || 0).toFixed(1)}</b>（近 6 场，影响命中率 ±3%）</div>
              ${p.promise ? `<div class="tiny" style="margin-top:6px;color:var(--accent2)">当前承诺：${esc(p.promise.label)} · ${p.promise.until} 前</div>` : ''}
            </div>
          </div>
        </div>`;
      })()}
      <div class="splitcol" style="margin-top:18px">
        <div>
          <h3>能力</h3>
          <div class="attr">${A.map(([k, v]) => `<div><span class="muted">${k}</span><b>${v}</b></div>`).join('')}</div>
          <div class="small" style="margin-top:10px">潜力 <b class="mono" style="color:var(--accent2)">${pt(p)}</b> · 综合 <b class="mono">${ov(p)}</b></div>
        </div>
        <div>
          <h3>本季数据</h3>
          <div class="small" style="line-height:1.9">
            <div class="row" style="justify-content:space-between"><span>出场</span><b class="mono">${s.gp}</b></div>
            <div class="row" style="justify-content:space-between"><span>场均时间</span><b class="mono">${per(s.min)}</b></div>
            <div class="row" style="justify-content:space-between"><span>得分</span><b class="mono">${per(s.pts)}</b></div>
            <div class="row" style="justify-content:space-between"><span>篮板</span><b class="mono">${per(s.reb)}</b></div>
            <div class="row" style="justify-content:space-between"><span>助攻</span><b class="mono">${per(s.ast)}</b></div>
            <div class="row" style="justify-content:space-between"><span>投篮</span><b class="mono">${s.fga ? (100 * s.fgm / s.fga).toFixed(1) : '-'}%</b></div>
            <div class="row" style="justify-content:space-between"><span>三分</span><b class="mono">${s.tpa ? (100 * s.tpm / s.tpa).toFixed(1) : '-'}%</b></div>
            <div class="row" style="justify-content:space-between"><span>罚球</span><b class="mono">${s.fta ? (100 * s.ftm / s.fta).toFixed(1) : '-'}%</b></div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function showTalk(id) {
    const p = byId(id);
    if (!p) return;
    const gate = O.canTalk(state, p);
    const planMin = O.promisePlan(state, p, 'minutes');
    const planUsg = O.promisePlan(state, p, 'usage');
    const opt = (type, title, desc, ok) => `<button class="btn" data-act="talkDo" data-id="${p.id}" data-type="${type}" ${ok ? '' : 'disabled'}
      style="display:block;width:100%;text-align:left;margin-bottom:8px;padding:10px 12px">
      <b>${title}</b><div class="tiny muted" style="margin-top:3px">${desc}</div></button>`;
    $('#modal').classList.remove('hidden');
    $('#modal').innerHTML = `<div class="box" style="max-width:520px">
      <button class="x" data-act="closeModal">×</button>
      <h2 style="margin:0">与 ${esc(zn(p))} 谈话</h2>
      <div class="muted small" style="margin:6px 0 14px">士气 ${p.morale == null ? 70 : p.morale} · ${p.promise ? `已有承诺：${p.promise.label}（${p.promise.until} 前）` : p.lastTalk ? `上次谈话 ${p.lastTalk}` : '还没谈过'}</div>
      ${gate.ok ? '' : `<div class="pill r" style="margin-bottom:10px">${gate.msg}</div>`}
      ${opt('soothe', '安抚情绪', '立刻提振士气，越不满效果越大。不附加承诺，10 天后可再谈。', gate.ok)}
      ${opt('minutes', '承诺上场时间', `目标 ${planMin.label}，20 天内达成则士气 +10、信任提升；做不到 −12 并可能申请交易。`, gate.ok)}
      ${opt('usage', '承诺更多球权', `目标 ${planUsg.label}，条件同上。`, gate.ok)}
      ${opt('trade', '承诺会送走他', '25 天内完成交易；否则士气 −15、信任受损。适合已经公开申请交易的球员。', gate.ok)}
    </div>`;
  }

  // ---------------- tactics ----------------
  function showTactics() {
    const t = my();
    const tc = t.tactics;
    const slider = (k, label, min, max, hint) => `
      <div style="margin:12px 0">
        <div class="row" style="justify-content:space-between"><span>${label}</span><b class="mono">${tc[k] > 0 ? '+' + tc[k] : tc[k]}</b></div>
        <input type="range" min="${min}" max="${max}" value="${tc[k]}" data-act="tactic" data-k="${k}" style="width:100%">
        <div class="tiny muted">${hint}</div>
      </div>`;
    $('#modal').classList.remove('hidden');
    $('#modal').innerHTML = `<div class="box" style="max-width:560px">
      <button class="x" data-act="closeModal">×</button>
      <h2 style="margin:0 0 4px">战术板</h2>
      <div class="muted small">这些设置会直接改变回合分布与比赛节奏。</div>
      ${slider('pace', '节奏', -2, 2, '越靠右回合数越多，越靠左越慢')}
      ${slider('threeBias', '三分倾向', -2, 2, '越高越多的挡拆外拆与定点三分')}
      ${slider('isoBias', '单打倾向', -2, 2, '越高越依赖球星单打，助攻会下降')}
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" data-act="closeModal">完成</button></div>
    </div>`;
  }

  function adjustRotation(id, delta) {
    const t = my();
    const roster = players(t.abbr);
    if (!Object.keys(t.rotation || {}).length) {
      const auto = Core.rotation(roster, t.tactics);
      t.rotation = {};
      auto.forEach((m, p) => { t.rotation[p.id] = Math.round(m * 10) / 10; });
    }
    const cur = t.rotation[id] || 0;
    t.rotation[id] = Math.max(0, Math.min(44, cur + delta));
    save();
    render();
  }

  // ---------------- events ----------------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;

    if (act === 'newgame') return newGame(el.dataset.team);
    if (act === 'view') { view = el.dataset.view; render(); if (view === 'game') initReplay(); return; }
    if (act === 'closeModal') { $('#modal').classList.add('hidden'); return; }
    if (act === 'talk') return showTalk(el.dataset.id);
    if (act === 'talkDo') {
      const r = O.talk(state, el.dataset.id, el.dataset.type);
      if (!r.ok) { toast(r.msg, 'err'); return; }
      save();
      $('#modal').innerHTML = `<div class="box" style="max-width:460px">
        <button class="x" data-act="closeModal">×</button>
        <h2 style="margin:0">谈话结果</h2>
        <div style="margin-top:10px;line-height:1.7">${esc(r.msg)}</div>
        <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn primary" data-act="closeModal">知道了</button></div>
      </div>`;
      render();
      return;
    }
    if (act === 'release') {
      const p = byId(el.dataset.id);
      if (!p) return;
      if (!confirm(`裁掉 ${p.name}？剩余薪资不再计入空间。`)) return;
      p.team = null; p.salary = 0; p.years = 0; p.opt = 0;
      state.transactions.unshift({ date: state.date, type: '裁员', text: `${state.userTeam} 裁掉 ${p.name}` });
      $('#modal').classList.add('hidden');
      save(); return render();
    }
    if (act === 'player') return showPlayer(el.dataset.id);
    if (act === 'tactics') return showTactics();
    if (act === 'rotAuto') { my().rotation = {}; save(); return render(); }
    if (act === 'rotAdd' || act === 'rotSub') return adjustRotation(el.dataset.id, act === 'rotAdd' ? 1 : -1);
    if (act === 'rest') {
      const p = byId(el.dataset.id);
      if (p) {
        if (!p.restNextGame) {
          const healthy = players(p.team).filter((x) => !(x.injDays > 0));
          const resting = healthy.filter((x) => x.restNextGame).length;
          if (healthy.length - resting <= 8) { toast('至少保留 9 名可用球员，不能再轮休了。', 'err'); return; }
        }
        p.restNextGame = !p.restNextGame;
        save(); render();
      }
      return;
    }
    if (act === 'msg') {
      const m = state.inbox.find((x) => x.id === el.dataset.id);
      if (m && m.offerId) {
        m.read = true;
        if ((state.offers || []).some((x) => x.id === m.offerId)) return showOffer(m.offerId);
        $('#modal').classList.remove('hidden');
        $('#modal').innerHTML = `<div class="box" style="max-width:420px"><button class="x" data-act="closeModal">×</button>
          <h2 style="margin:0">报价已失效</h2><div class="muted small" style="margin-top:8px">这份报价有效期 7 天，或者已经过了交易截止日。</div></div>`;
        return;
      }
      if (m) { m.read = true; $('#modal').classList.remove('hidden'); $('#modal').innerHTML = `<div class="box" style="max-width:520px"><button class="x" data-act="closeModal">×</button><h2 style="margin:0">${esc(localizeText(m.title))}</h2><div class="muted small" style="margin:6px 0 14px">${m.date}</div><div style="line-height:1.7">${esc(localizeText(m.body))}</div></div>`; }
      return;
    }
    if (act === 'advance') return advance(1);
    if (act === 'quickgame') return quickGame();
    if (act === 'liveGame') return startLive();
    if (act === 'liveSubs') return liveQueueSubs();
    if (act === 'subPick') return subPick(el.dataset.id);
    if (act === 'autoSub') {
      if (!live) return;
      const on = !(live.session.autoSub && live.session.autoSub(state.userTeam));
      live.session.setAutoSub(state.userTeam, on);
      return repaintSubs();
    }
    if (act === 'subReset') return subReset();
    if (act === 'livePlay') return liveLoop();
    if (act === 'liveSpeed') {
      const v = Number(el.dataset.v) || 1;
      localStorage.setItem('nbagm.speed', String(v));
      Court.setSpeed(v);
      return;
    }
    if (act === 'liveSimRest') {
      if (!live) return;
      while (!live.session.finished) live.session.stepQuarter();
      return liveEnd();
    }
    if (act === 'jumpGame') return jumpToNextGame();
    if (act === 'replayPlay') return toggleReplay();
    if (act === 'replayStep') { replay.playing = false; clearInterval(replay.timer); return replayStep(); }

    if (act === 'toggle') {
      const side = el.dataset.side;
      const item = { kind: el.dataset.kind, id: el.dataset.id, name: el.dataset.name, salary: Number(el.dataset.salary) };
      if (item.kind === 'tpe') item.amount = Number(el.dataset.amount || 0);
      const arr = trade[side];
      const i = arr.findIndex((x) => x.kind === item.kind && x.id === item.id);
      if (i >= 0) arr.splice(i, 1); else arr.push(item);
      return render();
    }
    if (act === 'clearTrade') { trade.outA = []; trade.outB = []; return render(); }
    if (act === 'review') return showReview(Number(el.dataset.i));
    if (act === 'saveNow') { save(); toast('已保存'); return; }
    if (act === 'exportSave') return exportSave();
    if (act === 'resetSave') {
      if (!confirm('放弃当前进度，重新选择球队？')) return;
      localStorage.removeItem('nbagm.save'); localStorage.removeItem('nbagm.savedAt'); location.reload();
      return;
    }
    if (act === 'staffHire') { const r = O.hireStaff(state, el.dataset.id); if (!r.ok) return toast(r.msg, 'err'); save(); return render(); }
    if (act === 'staffRelease') {
      const role = el.dataset.role;
      if (!confirm('确定解约？合同剩余部分不再支付。')) return;
      O.releaseStaff(state, role); save(); return render();
    }
    if (act === 'staffRenew') { O.renewStaff(state, el.dataset.role); save(); return render(); }
    if (act === 'staffRefresh') { O.refreshStaffMarket(state, true); save(); return render(); }
    if (act === 'negoOpen') return negoModal(el.dataset.id);
    if (act === 'negoRaise') return negoModal(el.dataset.id);
    if (act === 'negoSubmit') return negoSubmit(el.dataset.id);
    if (act === 'negoDrop') { O.withdrawOffer(state, el.dataset.id); save(); return render(); }
    if (act === 'workout') {
      const p = (state.draftClass || []).find((x) => x.id === el.dataset.id);
      if (!p) return;
      const r = Scout.workout(state, p);
      if (!r.ok) return toast(r.msg, 'err');
      save();
      draftReport(p.id);
      return;
    }
    if (act === 'snt') return showSNT(el.dataset.id);
    if (act === 'sntGo') return doSNT(el.dataset.id, el.dataset.picks);
    if (act === 'buyout') return showBuyout(el.dataset.id);
    if (act === 'buyoutGo') return doBuyout(el.dataset.id);
    if (act === 'offerView') return showOffer(el.dataset.id);
    if (act === 'offerReject') { O.rejectOffer(state, el.dataset.id); save(); return render(); }
    if (act === 'offerAccept') {
      const r = O.acceptOffer(state, el.dataset.id);
      if (!r.ok) return toast(r.msg, 'err');
      $('#modal').classList.add('hidden');
      save(); return render();
    }
    if (act === 'doTrade') {
      const r = O.executeTrade(state, state.userTeam, trade.team, trade.outA, trade.outB);
      if (!r.ok) return toast(r.msg, 'err');
      trade.outA = []; trade.outB = [];
      save(); return render();
    }
    if (act === 'sign') {
      const p = byId(el.dataset.id);
      const ask = O.askingPrice(p);
      $('#modal').classList.remove('hidden');
      $('#modal').innerHTML = `<div class="box" style="max-width:460px">
        <button class="x" data-act="closeModal">×</button>
        <h2 style="margin:0">签下 ${esc(zn(p))}</h2>
        <div class="muted small" style="margin:6px 0 14px">要价 ${fmtM(ask)} / 年 · 能力 ${ov(p)} · ${p.age} 岁</div>
        <label class="small muted">年薪</label>
        <input class="sel" id="offerSalary" type="number" value="${ask}" style="width:100%;margin:6px 0 12px">
        <label class="small muted">年限</label>
        <select class="sel" id="offerYears" style="width:100%;margin:6px 0 16px"><option>1</option><option selected>2</option><option>3</option><option>4</option></select>
        <button class="btn primary" data-act="signConfirm" data-id="${p.id}" style="width:100%">提交报价</button>
      </div>`;
      return;
    }
    if (act === 'signConfirm') {
      const sal = Number(document.querySelector('#offerSalary').value);
      const yrs = Number(document.querySelector('#offerYears').value);
      const r = O.signPlayer(state, el.dataset.id, state.userTeam, sal, yrs);
      if (!r.ok) return toast(r.msg, 'err');
      $('#modal').classList.add('hidden');
      save(); return render();
    }
    if (act === 'startSeason') {
      O.startNewSeason(state);
      draft = null; lastGame = null;
      save(); return render();
    }
    if (act === 'draftReport') { draftReport(el.dataset.id); return; }
    if (act === 'draftPick') {
      const p = draft.pool.find((x) => x.id === el.dataset.id);
      $('#modal').classList.add('hidden');
      const { owner, round } = slotInfo(draft.slot);
      assign(p, draft.slot, round, owner);
      save();
      return render();
    }
    if (act === 'team') {
      const abbr = el.dataset.team;
      if (abbr === state.userTeam) { view = 'roster'; return render(); }
      $('#modal').classList.remove('hidden');
      $('#modal').innerHTML = `<div class="box" style="max-width:640px"><button class="x" data-act="closeModal">×</button>
        <h2 style="margin:0"><img src="assets/logos/${abbr}.png" style="width:28px;vertical-align:-5px"> ${zt(abbr)}</h2>
        <div class="muted small" style="margin:6px 0 12px">${state.teams[abbr].wins}-${state.teams[abbr].losses} · 薪资 ${fmtM(payrollOf(abbr, state.players, state))}</div>
        ${players(abbr).sort((a, b) => b.ovr - a.ovr).map((p) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid #ffffff08;padding:5px 0"><span>${esc(zn(p))}</span><span class="mono small muted">${p.pos} ${ov(p)} · ${fmtM(p.salary)}</span></div>`).join('')}
      </div>`;
      return;
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'tradeTeam') { trade.team = el.value; trade.outA = []; trade.outB = []; render(); }
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'faFilter') { faFilter = el.value; render(); }
    if (el.dataset.act === 'tactic') {
      my().tactics[el.dataset.k] = Number(el.value);
      el.parentElement.querySelector('b').textContent = (Number(el.value) > 0 ? '+' : '') + el.value;
      save();
    }
  });

  // ---------------- actions ----------------
  const nextUserGame = () => state.games.find(
    (g) => !g.played && (g.home === state.userTeam || g.away === state.userTeam),
  );

  // one calendar day, including the user's game if it lands today
  function stepDay() {
    const ev = L.advanceDay(state);
    const mine = ev.games.find((g) => g.isUser);
    if (mine) {
      lastGame = { game: mine.game, result: mine.result };
      persistGame(mine.game, mine.result);
      logGame(mine.game, mine.result);
    }
    return ev;
  }

  function advance(n) {
    for (let i = 0; i < n; i++) {
      if (state.phase === 'offseason') break;
      stepDay();
    }
    save();
    render();
  }

  // play the next game now: walk the calendar to it first so fatigue and
  // injuries between today and game day still happen
  function quickGame() {
    const ng = nextUserGame();
    if (!ng) return;
    let guard = 0;
    while (state.date < ng.date && guard++ < 40 && state.phase === 'regular') stepDay();
    const g = state.games.find((x) => x === ng);
    if (!g || g.played) { save(); render(); return; }
    const res = Sim.playGame(state, g.home, g.away, { events: true });
    L.applyResult(state, g, res);
    lastGame = { game: g, result: res };
    persistGame(g, res);
    logGame(g, res);
    stepDay();                       // roll past game day: rest of the league, recovery
    save();
    view = 'game';
    render();
    initReplay();
  }

  // stop on game day, without simulating it
  function jumpToNextGame() {
    const ng = nextUserGame();
    if (!ng) return;
    let guard = 0;
    while (state.date < ng.date && guard++ < 40 && state.phase === 'regular') stepDay();
    save();
    render();
  }

  document.getElementById('advance').addEventListener('click', () => advance(1));
  document.getElementById('btnSave').addEventListener('click', () => { save(); const b = document.getElementById('btnSave'); b.textContent = '已保存'; setTimeout(() => (b.textContent = '保存'), 1200); });
  document.getElementById('btnMenu').addEventListener('click', showMenu);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      if (state && state.phase !== 'offseason') advance(1);
    }
  });

  boot();
  window.__gm = { get state() { return state; }, get live() { return live; }, save, load };
})();
