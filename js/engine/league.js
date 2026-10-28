/* League: calendar, schedule, standings, playoffs, offseason, draft, progression. */
(function (root) {
  'use strict';
  const { RNG, clamp, mean } = root.Core;
  const CAP = root.Core.CAP;

  const DAY = 86400000;
  const iso = (d) => d.toISOString().slice(0, 10);
  const parse = (s) => new Date(`${s}T00:00:00Z`);
  const addDays = (s, n) => iso(new Date(parse(s).getTime() + n * DAY));
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / DAY);

  // ---------------- schedule ----------------
  function pairCounts(teams) {
    const cnt = new Map();
    const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const byConf = { East: [], West: [] };
    teams.forEach((t) => byConf[t.conf].push(t.abbr));

    for (const t of teams) {
      for (const o of teams) {
        if (o.abbr <= t.abbr) continue;
        let n;
        if (t.conf !== o.conf) n = 2;
        else if (t.div === o.div) n = 4;
        else n = 3;
        cnt.set(key(t.abbr, o.abbr), n);
      }
    }
    // upgrade some 3s to 4s so every team lands on 82
    for (const conf of ['East', 'West']) {
      const list = byConf[conf];
      const need = new Map(list.map((a) => [a, 0]));
      for (const a of list) for (const b of list) {
        if (a >= b) continue;
        const n = cnt.get(key(a, b)) || 2;
        if (n === 3) { }
      }
      // each team needs 6 four-game conference series beyond division
      const upgraded = new Set();
      for (const a of list) {
        for (const b of list) {
          if (a >= b) continue;
          const k = key(a, b);
          const t1 = teams.find((t) => t.abbr === a);
          const t2 = teams.find((t) => t.abbr === b);
          if (t1.div === t2.div) continue;
          if ((cnt.get(k) || 0) !== 3) continue;
          if (need.get(a) >= 6 || need.get(b) >= 6) continue;
          if (RNG.chance(0.55)) {
            cnt.set(k, 4);
            need.set(a, need.get(a) + 1);
            need.set(b, need.get(b) + 1);
            upgraded.add(k);
          }
        }
      }
      // fix leftovers deterministically
      let guard = 0;
      while (guard++ < 200) {
        const short = list.filter((a) => need.get(a) < 6);
        if (!short.length) break;
        const a = short[0];
        const cand = list.filter((b) => b !== a && need.get(b) < 6 && (cnt.get(key(a, b)) || 0) === 3 &&
          teams.find((t) => t.abbr === a).div !== teams.find((t) => t.abbr === b).div);
        if (!cand.length) break;
        const b = cand[0];
        const k = key(a, b);
        cnt.set(k, 4);
        need.set(a, need.get(a) + 1);
        need.set(b, need.get(b) + 1);
      }
    }
    return cnt;
  }

  function buildSchedule(teams, startDate) {
    const cnt = pairCounts(teams);
    const remaining = [];
    for (const [k, n] of cnt) {
      const [a, b] = k.split('|');
      for (let i = 0; i < n; i++) remaining.push([a, b]);
    }
    const abbrs = teams.map((t) => t.abbr);
    const left = new Map();
    for (const [a, b] of remaining) {
      left.set(`${a}|${b}`, (left.get(`${a}|${b}`) || 0) + 1);
      left.set(`${b}|${a}`, (left.get(`${b}|${a}`) || 0) + 1);
    }

    const rounds = [];
    let guard = 0;
    while (guard++ < 400) {
      const any = [...left.values()].some((v) => v > 0);
      if (!any) break;
      const round = [];
      const used = new Set();
      const order = RNG.shuffle(abbrs);
      for (const a of order) {
        if (used.has(a)) continue;
        const cands = abbrs.filter((b) => b !== a && !used.has(b) && (left.get(`${a}|${b}`) || 0) > 0);
        if (!cands.length) continue;
        cands.sort((x, y) => (left.get(`${a}|${y}`) || 0) - (left.get(`${a}|${x}`) || 0));
        const b = cands[0];
        round.push([a, b]);
        left.set(`${a}|${b}`, left.get(`${a}|${b}`) - 1);
        left.set(`${b}|${a}`, left.get(`${b}|${a}`) - 1);
        used.add(a); used.add(b);
      }
      if (!round.length) break;
      rounds.push(round);
    }

    // alternate home/away per pair so season series are split
    const seen = new Map();
    const games = [];
    const totalDays = 174;
    rounds.forEach((round, i) => {
      const day = addDays(startDate, Math.round((i * totalDays) / Math.max(1, rounds.length - 1)));
      round.forEach(([a, b], j) => {
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        const n = seen.get(k) || 0;
        seen.set(k, n + 1);
        const flip = n % 2 === 1;
        const home = flip ? (a === k.split('|')[0] ? b : a) : (a === k.split('|')[0] ? a : b);
        const away = home === a ? b : a;
        games.push({ id: `${i}-${j}`, date: day, home, away, played: false, hs: 0, as: 0 });
      });
    });
    // the greedy matcher can dead-end on a few pairs; top every team up to 82
    const count = {};
    abbrs.forEach((a) => { count[a] = 0; });
    games.forEach((g) => { count[g.home]++; count[g.away]++; });
    let extra = 0;
    for (let pass = 0; pass < 40; pass++) {
      const need = abbrs.filter((a) => count[a] < 82).sort((x, y) => count[x] - count[y]);
      if (need.length < 2) break;
      const a = need[0];
      const b = need[1];
      const home = extra % 2 === 0 ? a : b;
      games.push({ id: `x${extra++}`, date: addDays(startDate, totalDays), home, away: home === a ? b : a, played: false, hs: 0, as: 0 });
      count[a]++; count[b]++;
    }
    return games;
  }

  // ---------------- new league ----------------
  function newLeague(data, userTeam, seedNum) {
    const players = data.players.map((p) => ({
      ...p,
      injDays: 0, pst: blankLine(), fst: blankLine(), ovrStart: 0,
      morale: 70, fatigue: 0, recent: [], moraleMod: 0,
      restNextGame: false, tradeRequest: false,
      st: { gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 },
    }));
    const teams = {};
    data.teams.forEach((t) => {
      teams[t.abbr] = {
        ...t, wins: 0, losses: 0, pf: 0, pa: 0, streak: 0,
        tactics: { pace: 0, threeBias: 0, isoBias: 0, defScheme: 0 },
        chemistry: 70, recent: [], rotation: {}, lastGameDate: null,
      };
    });
    // veteran free agents so the market is never empty mid-season
    const FA_FIRST = ['Jamal', 'Terrance', 'Reggie', 'Cory', 'Wesley', 'Dwight', 'Marcus', 'Landry', 'Troy', 'Elijah'];
    const FA_LAST = ['Crawford', 'Ross', 'Temple', 'Muscala', 'Bembry', 'Hollis', 'Nwora', 'Kaminsky', 'Dedmon', 'Bazley'];
    for (let i = 0; i < 36; i++) {
      const ovr = 52 + Math.floor(RNG.range(0, 18));
      const pos = RNG.pick(['PG', 'SG', 'SF', 'PF', 'C']);
      const big = pos === 'C' ? 1 : pos === 'PF' ? 0.7 : 0;
      const guard = pos === 'PG' ? 1 : pos === 'SG' ? 0.8 : pos === 'SF' ? 0.4 : 0;
      const r = (v) => clamp(Math.round(v + RNG.range(-4, 4)), 22, 92);
      players.push({
        id: `fa${i}`, name: `${FA_FIRST[i % 10]} ${FA_LAST[Math.floor(i / 4) % 10]}`,
        team: null, pos, age: 24 + Math.floor(RNG.range(0, 11)), h: pos === 'C' ? 82 + RNG.int(5) : pos === 'PF' ? 79 + RNG.int(4) : 75 + RNG.int(4),
        w: 200 + RNG.int(45), college: '', exp: 3 + RNG.int(6), jersey: '', photo: '',
        salary: 0, years: 0, opt: 0, ovr, pot: clamp(ovr + (RNG.chance(0.3) ? RNG.int(6) : 0), ovr, 88),
        ins: r(ovr - 2 + big * 12), mid: r(ovr - 5), three: r(ovr - 2 - big * 18), ft: r(ovr - 7),
        pass: r(ovr - 5 + guard * 8), handle: r(ovr - 5 + guard * 9 - big * 10), oiq: r(ovr - 4), diq: r(ovr - 6),
        pdef: r(ovr - 5 + guard * 4 - big * 6), idef: r(ovr - 3 + big * 11), reb: r(ovr + big * 12),
        spd: r(ovr - 3 + guard * 6 - big * 13), str: r(ovr - 2 + big * 9), sta: r(52), dur: r(64),
        st: { gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 },
        injDays: 0, pst: blankLine(), fst: blankLine(), ovrStart: 0, morale: 70,
      });
    }
    // opening-night roster limit: 15 standard contracts
    const cutLog = [];
    for (const t of data.teams) {
      const roster = players.filter((p) => p.team === t.abbr).sort((a, b) => a.ovr - b.ovr);
      const freeFirst = roster.filter((p) => !p.salary);
      const rest = roster.filter((p) => p.salary);
      const keep = [...rest.sort((a, b) => b.ovr - a.ovr), ...freeFirst.sort((a, b) => b.ovr - a.ovr)].slice(0, 15);
      for (const p of roster) {
        if (!keep.includes(p)) {
          p.team = null; p.waived = true;
          if (t.abbr === userTeam) cutLog.push(p.name);
        }
      }
    }

    const schedule = buildSchedule(data.teams, '2026-10-20');
    const deadline = '2027-02-05';
    // every club starts with a coach and a scout; the user can replace both
    const S = root.Staff;
    if (S) {
      Object.keys(teams).forEach((abbr) => {
        const c = S.finish(S.makeCoach(RNG, abbr === userTeam ? 0.4 : 0.2 + (Math.abs(hashStr(abbr)) % 60) / 100));
        c.salary = c.ask; c.years = 2 + (Math.abs(hashStr(abbr + 'c')) % 3);
        teams[abbr].coach = c;
        const sc = S.finish(S.makeScout(RNG, abbr === userTeam ? 0.45 : 0.2 + (Math.abs(hashStr(abbr + 's')) % 60) / 100));
        sc.salary = sc.ask; sc.years = 2 + (Math.abs(hashStr(abbr + 's2')) % 3);
        teams[abbr].scout = sc;
      });
    }
    const staffMarket = S ? S.makeMarket(null, RNG, 5, 5) : [];
    return {
      version: 1,
      seed: seedNum || 20261027,
      userTeam,
      date: '2026-10-20',
      season: 2027,
      phase: 'regular',
      teams, players, picks: data.picks.map((p) => ({ ...p })),
      games: schedule,
      inbox: [{
        id: 'welcome', date: '2026-10-20', type: 'info', read: false,
        title: `欢迎来到 ${teams[userTeam].name}`,
        body: '新赛季揭幕。你是球队的总经理，工资帽、交易、选秀、自由市场都由你决定。点击「推进一天」开始。',
      }],
      seasonLog: [],
      staffMarket,
      transactions: cutLog.length ? [{ date: '2026-10-20', type: '裁员', text: `开季名单裁至 15 人：${cutLog.join('、')}` }] : [],
      history: [],
      deadline,
      offers: [],
      draftClass: null,
      playoffs: null,
      awards: null,
    };
  }

  function hashStr(x) {
    let h = 0;
    for (let i = 0; i < String(x).length; i++) h = (h * 31 + String(x).charCodeAt(i)) | 0;
    return h;
  }

  // ---------------- standings ----------------
  function standings(state) {
    const rows = Object.values(state.teams).map((t) => ({
      ...t, gp: t.wins + t.losses,
      pct: t.wins + t.losses ? t.wins / (t.wins + t.losses) : 0,
      diff: t.pf - t.pa,
    }));
    rows.sort((a, b) => b.pct - a.pct || b.diff - a.diff || b.wins - a.wins);
    return rows;
  }
  function confStandings(state, conf) {
    return standings(state).filter((t) => t.conf === conf);
  }

  // ---------------- game day ----------------
  function applyResult(state, g, result) {
    const H = state.teams[g.home], A = state.teams[g.away];
    g.played = true;
    g.hs = result.home.score;
    g.as = result.away.score;
    const hw = g.hs > g.as;
    H.wins += hw ? 1 : 0; H.losses += hw ? 0 : 1;
    A.wins += hw ? 0 : 1; A.losses += hw ? 1 : 0;
    H.pf += g.hs; H.pa += g.as;
    A.pf += g.as; A.pa += g.hs;
    H.streak = hw ? Math.max(1, H.streak + 1) : Math.min(-1, H.streak - 1);
    A.streak = hw ? Math.min(-1, A.streak - 1) : Math.max(1, A.streak + 1);

    H.recent = (H.recent || []).concat([hw ? 1 : 0]).slice(-10);
    A.recent = (A.recent || []).concat([hw ? 0 : 1]).slice(-10);

    accumulate(state, g.home, result.home);
    accumulate(state, g.away, result.away);
  }

  // box score -> season totals, fatigue, morale inputs, injuries
  const blankLine = () => ({ gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 });

  function accumulate(state, abbr, side, opts = {}) {
    const rows = side.rows.filter((r) => r.min >= 1);
    const playoff = !!opts.playoff;
    for (const r of rows) {
      const p = state.players.find((x) => x.id === r.id);
      if (!p) continue;
      if (playoff) {
        p.pst = p.pst || blankLine();
        p.fst = p.fst || blankLine();
      }
      const st = playoff ? p.pst : p.st;
      const fst = playoff && opts.finals ? p.fst : null;
      for (const target of fst ? [st, fst] : [st]) {
        target.gp += 1; target.min += r.min; target.pts += r.pts; target.reb += r.reb;
        target.ast += r.ast; target.stl += r.stl; target.blk += r.blk; target.tov += r.tov;
        target.fgm += r.fgm; target.fga += r.fga; target.tpm += r.tpm; target.tpa += r.tpa;
        target.ftm += r.ftm; target.fta += r.fta;
      }
      // a team can never lose more than four bodies at once: real rosters dress nine
      const hurtNow = state.players.filter((x) => x.team === abbr && !x.retired && root.Injury && root.Injury.isOut(x)).length;
      if (hurtNow >= 3) continue;
      const risk = 0.005
        * (1 + Math.max(0, 60 - (p.dur || 65)) / 45)
        * (1 + Math.max(0, r.min - 28) / 30)
        * (1 + Math.max(0, (p.fatigue || 0) - 50) / 60)
        * (1 + (p.injuryRisk || 0) * 1.8)   // injury history and fragility
        * (1 + Math.min(0.8, (p.injuryHistory || 0) * 0.15));   // recurrence: an injury makes the next one likelier
      if (!p.injDays && root.Injury && RNG.chance(risk)) {
        const inj = root.Injury.injure(state, p, RNG, (p.injuryRisk || 0) * 0.8);
        state.seasonLog = state.seasonLog || [];
        state.seasonLog.push({ date: state.date, kind: 'injury', team: abbr, player: p.name, sev: inj.sev, label: inj.label, days: inj.days });
        if (abbr === state.userTeam || inj.sev !== 'minor') {
          const cn = root.Injury.SEV_CN[inj.sev];
          pushInbox(state, {
            type: 'injury',
            title: `${p.name} 受伤：${inj.label}（${cn}）`,
            body: inj.sev === 'minor'
              ? `预计 ${inj.days} 天，期间可以带伤出战，但能力下降约 ${Math.round(p.injury.pen * 100)}%。`
              : `预计缺阵 ${inj.days} 天。`,
          });
        }
      }
    }
    if (root.Condition) root.Condition.afterGame(state, abbr, rows, side);
  }

  function simDayGames(state, opts = {}) {
    const todays = state.games.filter((g) => g.date === state.date && !g.played);
    const results = [];
    for (const g of todays) {
      const isUser = g.home === state.userTeam || g.away === state.userTeam;
      const res = root.Sim.playGame(state, g.home, g.away, { events: isUser });
      if (!res) continue;
      applyResult(state, g, res);
      results.push({ game: g, result: res, isUser });
    }
    return results;
  }

  function pushInbox(state, msg) {
    state.inbox.unshift({ id: `m${state.inbox.length}-${Date.now()}`, date: state.date, read: false, ...msg });
    if (state.inbox.length > 120) state.inbox.length = 120;
  }

  // ---------------- calendar ----------------
  function regularSeasonEnd(state) {
    const last = state.games.reduce((m, g) => (g.date > m ? g.date : m), '2026-10-20');
    return last;
  }

  function advanceDay(state) {
    const events = { games: [], notes: [] };
    if (state.phase === 'regular') {
      const before = state.date;
      events.games = simDayGames(state);
      if (root.Condition) root.Condition.recover(state);
      state.date = addDays(state.date, 1);
      if (root.Condition) root.Condition.daily(state);
      if (root.Office && root.Office.checkPromises) root.Office.checkPromises(state);
      // injuries tick down
      if (root.Injury) {
        const healed = root.Injury.daily(state, RNG);
        for (const h of healed) {
          if (h.p.team === state.userTeam || (h.p.lastPermDamage && h.p.lastPermDamage.date === state.date)) {
            pushInbox(state, { type: 'injury', title: '伤情更新', body: h.text });
          }
        }
      } else {
        state.players.forEach((p) => { if (p.injDays > 0) p.injDays -= 1; });
      }
      if (root.Office && root.Office.tickNegotiations) {
        const news = root.Office.tickNegotiations(state);
        if (news.length) events.notes.push({ type: 'nego', title: news[0] });
      }
      if (state.phase === 'regular' && root.Office) {
        root.Office.pruneOffers ? root.Office.pruneOffers(state) : null;
        const off = root.Office.pushOffer(state);
        if (off) events.notes.push({ type: 'offer', title: `收到 ${state.teams[off.from].abbr} 的交易报价` });
        if (root.Office.buyoutOpen && root.Office.buyoutOpen(state)) {
          // expired exceptions and the buyout pool move along every day
          for (const t of Object.keys(state.teams)) {
            const tm = state.teams[t];
            if (tm.tpe) tm.tpe = tm.tpe.filter((x) => x.expires >= state.date);
          }
          root.Office.aiBuyoutMarket(state);
        }
        if (state.deadline && before <= state.deadline && state.date > state.deadline) {
          const done = root.Office.deadlineDayDeals(state);
          root.Office.pushInbox(state, { type: 'deadline', title: '交易截止日已过', body: `窗口关闭前联盟完成 ${done.length} 笔交易：${done.join('，') || '无'}。` });
          events.notes.push({ type: 'deadline', title: '交易截止日已过' });
        }
      }
      const left = state.games.some((g) => !g.played);
      if (!left) {
        state.phase = 'playoffs';
        state.date = addDays(regularSeasonEnd(state), 3);
        startPlayoffs(state);
        pushInbox(state, { type: 'info', title: '常规赛结束', body: '季后赛对阵已确定。' });
      }
    } else if (state.phase === 'playoffs') {
      playPlayoffDay(state, events);
      state.date = addDays(state.date, 1);
    } else if (state.phase === 'offseason') {
      state.date = addDays(state.date, 1);
    }
    return events;
  }

  // ---------------- playoffs ----------------
  function seedPlayoffs(state) {
    const east = confStandings(state, 'East').slice(0, 10);
    const west = confStandings(state, 'West').slice(0, 10);
    return { East: east, West: west };
  }

  function makeSeries(id, conf, round, a, b) {
    return { id, conf, round, a, b, wa: 0, wb: 0, done: false, winner: null, next: null, best: round === 0 ? 1 : 4 };
  }

  function startPlayoffs(state) {
    const seeds = seedPlayoffs(state);
    const po = { seeds, stage: 'playin', playinStep: 1, series: [], all: [], round: 0, champion: null, started: state.date };
    for (const conf of ['East', 'West']) {
      const s = seeds[conf];
      const g1 = makeSeries(`${conf}-pi78`, conf, 0, s[6].abbr, s[7].abbr);
      const g2 = makeSeries(`${conf}-pi910`, conf, 0, s[8].abbr, s[9].abbr);
      g1.slot = 0; g2.slot = 1;
      po.series.push(g1, g2);
    }
    po.series.forEach((s) => { s.next = state.date; });
    po.all = po.series.slice();
    state.playoffs = po;
  }

  function playSeriesGame(state, s) {
    if (s.done) return null;
    const played = s.wa + s.wb;
    const homeIsA = [0, 0, 1, 1, 0, 1, 0][played] === 0;
    const h = homeIsA ? s.a : s.b;
    const a = homeIsA ? s.b : s.a;
    const res = root.Sim.playGame(state, h, a, { events: false });
    if (!res) return null;
    const winner = res.home.score > res.away.score ? h : a;
    accumulate(state, h, res.home, { playoff: true, finals: s.round === 4 });
    accumulate(state, a, res.away, { playoff: true, finals: s.round === 4 });
    state.teams[h].recent = (state.teams[h].recent || []).concat([winner === h ? 1 : 0]).slice(-10);
    state.teams[a].recent = (state.teams[a].recent || []).concat([winner === a ? 1 : 0]).slice(-10);
    if (winner === s.a) s.wa++; else s.wb++;
    const need = s.best === 1 ? 1 : 4;
    if (s.wa >= need || s.wb >= need) { s.done = true; s.winner = winner; }
    else s.next = addDays(state.date, 2);
    return { series: s, result: res, winner };
  }

  function buildRound(po, round, pairs) {
    const next = [];
    const counts = {};
    pairs.forEach((pair, i) => {
      if (!pair[0] || !pair[1]) return;
      const conf = round === 4 ? 'Finals' : pair[2];
      counts[conf] = counts[conf] || 0;
      const s = makeSeries(`r${round}-${i}`, conf, round, pair[0], pair[1]);
      s.slot = counts[conf]++;
      next.push(s);
    });
    po.series = next;
    po.all = (po.all || []).concat(next);
    po.round = round;
    po.stage = round === 1 ? 'r1' : round === 2 ? 'semis' : round === 3 ? 'cf' : 'finals';
    if (!next.length) po.stage = 'done';
  }

  function advancePlayoffRound(state) {
    const po = state.playoffs;
    const winners = po.series.filter((s) => s.done).map((s) => s.winner);
    if (po.stage === 'playin') {
      const find = (conf, suffix) => (po.all || []).find((s) => s.conf === conf && s.id.endsWith(suffix));
      if (po.playinStep === 1) {
        // 7/8 loser and 9/10 winner play for the 8 seed
        const next = [];
        for (const conf of ['East', 'West']) {
          const s78 = find(conf, 'pi78');
          const s910 = find(conf, 'pi910');
          if (!s78 || !s910) continue;
          const loser = s78.winner === s78.a ? s78.b : s78.a;
          const g = makeSeries(`${conf}-pi8`, conf, 0, loser, s910.winner);
          g.slot = 2;
          g.next = state.date;
          next.push(g);
        }
        po.series = next;
        po.all = (po.all || []).concat(next);
        po.playinStep = 2;
        return;
      }
      const pairs = [];
      for (const conf of ['East', 'West']) {
        const seeded = po.seeds[conf].slice(0, 6).map((t) => t.abbr);
        seeded.push(find(conf, 'pi78').winner, find(conf, 'pi8').winner);
        pairs.push([seeded[0], seeded[7], conf], [seeded[3], seeded[4], conf], [seeded[2], seeded[5], conf], [seeded[1], seeded[6], conf]);
      }
      buildRound(po, 1, pairs);
      return;
    }
    const prev = po.series.slice().filter((s) => s.done);
    const pairs = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (prev[i] && prev[i + 1]) pairs.push([prev[i].winner, prev[i + 1].winner, prev[i].conf]);
    }
    const round = po.round + 1;
    if (round > 4) {
      po.champion = winners[0];
      po.stage = 'done';
      return;
    }
    buildRound(po, round, pairs);
  }

  function playPlayoffDay(state, events) {
    const po = state.playoffs;
    if (!po) return;
    if (po.stage === 'done') return;
    const today = state.date;
    let played = false;
    for (const s of po.series) {
      if (s.done || (s.next && s.next > today)) continue;
      const out = playSeriesGame(state, s);
      if (out) {
        played = true;
        events.games.push({
          game: { home: out.result.home.team, away: out.result.away.team, hs: out.result.home.score, as: out.result.away.score, date: today, playoff: true },
          result: out.result,
          isUser: out.result.home.team === state.userTeam || out.result.away.team === state.userTeam,
        });
      }
    }
    if (po.series.every((s) => s.done) && !played) {
      advancePlayoffRound(state);
      po.series.forEach((s) => { s.next = state.date; });
      if (po.stage === 'done') {
        state.phase = 'offseason';
        pushInbox(state, { type: 'champion', title: `总冠军：${po.champion}`, body: `${po.champion} 夺冠，赛季结束。` });
        root.Office.finishSeason(state);
      }
    }
  }

  root.League = {
    DAY, iso, parse, addDays, diffDays,
    newLeague, buildSchedule, standings, confStandings, advanceDay, applyResult, pushInbox,
    startPlayoffs, regularSeasonEnd, simDayGames,
  };
})(typeof window !== 'undefined' ? window : globalThis);
