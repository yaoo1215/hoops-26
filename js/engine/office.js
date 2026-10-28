/* Office: awards, progression, draft, free agency, trades, AI GMs. */
(function (root) {
  'use strict';
  const { RNG, clamp, mean } = root.Core;
  const CAP = root.Core.CAP;

  const FIRST = ['Jalen', 'Marcus', 'Tyrese', 'Amari', 'Cameron', 'Devin', 'Isaiah', 'Kobe', 'Malik', 'Darius', 'Elijah', 'Trey', 'Zion', 'Omar', 'Andre', 'Kyle', 'Noah', 'Luka', 'Mateo', 'Nikola', 'Dimitri', 'Yuki', 'Kwame', 'Tariq', 'Rashad', 'Cole', 'Bryce', 'Xavier', 'Jaden', 'Terrance'];
  const LAST = ['Washington', 'Bridges', 'Hayes', 'Okafor', 'Carter', 'Bennett', 'Rivers', 'Sanders', 'Petrovic', 'Ndiaye', 'Tanaka', 'Moreau', 'Silva', 'Kovac', 'Freeman', 'Dixon', 'Watson', 'Boone', 'Ellis', 'Prince', 'Holloway', 'Vasquez', 'Adebayo', 'Mensah', 'Langford', 'Sutton', 'Reyes', 'Novak', 'Barlow', 'Griffin'];

  function pushInbox(state, msg) {
    state.inbox.unshift({ id: `m${state.inbox.length}-${Math.floor(RNG.next() * 1e9)}`, date: state.date, read: false, ...msg });
    if (state.inbox.length > 150) state.inbox.length = 150;
  }

  // ---------------- season end ----------------
  function finishSeason(state) {
    const aw = root.Awards ? root.Awards.compute(state) : null;
    const rows = state.players.filter((p) => p.st.gp > 0);
    const score = (p) => (root.Awards ? root.Awards.value(p) : p.st.pts);
    const top = rows.slice().sort((a, b) => score(b) - score(a));
    const mvp = aw ? aw.mvp : top[0];
    const dpoy = aw ? aw.dpoy : null;
    const roy = aw ? aw.roy : null;

    const finals = state.playoffs ? state.playoffs.champion : null;
    const po = state.playoffs || {};
    const finalSeries = (po.all || []).filter((x) => x.round === 4)[0] || null;
    const haveAwards = aw != null;
    state.awards = haveAwards ? {
      mvp: aw.mvp && aw.mvp.id, dpoy: aw.dpoy && aw.dpoy.id, roy: aw.roy && aw.roy.id,
      mip: aw.mip && aw.mip.id, smoy: aw.smoy && aw.smoy.id, fmvp: aw.fmvp && aw.fmvp.id,
      allNBA: aw.allNBA.map((t) => t.map((p) => p.id)),
      allDef: aw.allDef.map((t) => t.map((p) => p.id)),
      allRookie: aw.allRookie.map((p) => p.id),
    } : { mvp: mvp && mvp.id, dpoy: dpoy && dpoy.id, roy: roy && roy.id };

    // ---- season review: what the year looked like when you open it next summer ----
    const standings = root.League.standings(state);
    const uid = state.userTeam;
    const userTeam = state.teams[uid];
    const userRank = standings.findIndex((t) => t.abbr === uid) + 1;
    const userSeries = (po.all || []).filter((x) => x.a === uid || x.b === uid);
    const lastUser = userSeries[userSeries.length - 1];
    const ROUND_CN = { 0: '附加赛', 1: '首轮', 2: '分区半决赛', 3: '分区决赛', 4: '总决赛' };
    let userResult = '未进季后赛';
    if (lastUser) {
      const wonIt = po.champion === uid;
      const stage = wonIt ? '总冠军' : lastUser.winner === uid ? `${ROUND_CN[lastUser.round]}晋级` : `止步${ROUND_CN[lastUser.round]}`;
      userResult = stage;
    }
    const leaders = (key, n) => {
      const g = (p) => Math.max(1, p.st.gp);
      return rows.slice().sort((a, b) => b.st[key] / g(b) - a.st[key] / g(a)).slice(0, n)
        .map((p) => ({ id: p.id, name: p.name, team: p.team, val: p.st[key] / g(p) }));
    };
    const userRows = rows.filter((p) => p.team === uid);
    const review = {
      season: state.season,
      champion: finals,
      finals: finalSeries ? { a: finalSeries.a, b: finalSeries.b, wa: finalSeries.wa, wb: finalSeries.wb } : null,
      user: {
        team: uid, wins: userTeam.wins, losses: userTeam.losses, rank: userRank,
        result: userResult,
        roster: userRows.slice().sort((a, b) => score(b) - score(a)).slice(0, 5)
          .map((p) => ({ id: p.id, name: p.name, gp: p.st.gp, pts: p.st.pts / Math.max(1, p.st.gp), reb: p.st.reb / Math.max(1, p.st.gp), ast: p.st.ast / Math.max(1, p.st.gp) })),
      },
      awards: haveAwards ? {
        mvp: aw.mvp && { id: aw.mvp.id, name: aw.mvp.name, team: aw.mvp.team },
        dpoy: aw.dpoy && { id: aw.dpoy.id, name: aw.dpoy.name, team: aw.dpoy.team },
        roy: aw.roy && { id: aw.roy.id, name: aw.roy.name, team: aw.roy.team },
        mip: aw.mip && { id: aw.mip.id, name: aw.mip.name, team: aw.mip.team },
        smoy: aw.smoy && { id: aw.smoy.id, name: aw.smoy.name, team: aw.smoy.team },
        fmvp: aw.fmvp && { id: aw.fmvp.id, name: aw.fmvp.name, team: aw.fmvp.team },
        allNBA: aw.allNBA.map((t) => t.map((p) => ({ id: p.id, name: p.name, team: p.team }))),
        allDef: aw.allDef.map((t) => t.map((p) => ({ id: p.id, name: p.name, team: p.team }))),
        allRookie: aw.allRookie.map((p) => ({ id: p.id, name: p.name, team: p.team })),
      } : null,
      leaders: { pts: leaders('pts', 5), reb: leaders('reb', 5), ast: leaders('ast', 5), stl: leaders('stl', 5), blk: leaders('blk', 5) },
      standings: standings.slice(0, 8).map((t) => ({ abbr: t.abbr, wins: t.wins, losses: t.losses })),
    };
    review.story = writeStory(state);
    state.review = review;
    review.story = writeStory(state);

    state.history.unshift({
      season: state.season, champion: finals,
      mvp: aw && aw.mvp ? aw.mvp.name : mvp ? mvp.name : '-',
      dpoy: aw && aw.dpoy ? aw.dpoy.name : '-',
      roy: aw && aw.roy ? aw.roy.name : '-',
      mip: aw && aw.mip ? aw.mip.name : '-',
      fmvp: aw && aw.fmvp ? aw.fmvp.name : '-',
      user: { wins: userTeam.wins, losses: userTeam.losses, result: userResult },
      standings: review.standings,
      review,
    });
    if (state.history.length > 30) state.history.length = 30;
    // keep the full review for the last ten seasons only, the rest keep the summary row
    state.history.forEach((h, i) => { if (i >= 10) delete h.review; });

    // one inbox card per season so the year is readable at a glance
    if (haveAwards) {
      const nm = (x) => (x ? x.name : '-');
      pushInbox(state, {
        type: 'season',
        title: `${state.season - 1}-${String(state.season).slice(2)} 赛季总结`,
        body: `总冠军 ${finals || '-'}｜MVP ${nm(aw.mvp)}｜DPOY ${nm(aw.dpoy)}｜最佳新秀 ${nm(aw.roy)}｜FMVP ${nm(aw.fmvp)}。你 ${userTeam.wins}-${userTeam.losses}，${userResult}。`,
        review: true,
      });
    }

    // aging + development
    for (const p of state.players) {
      if (p.retired) continue;
      p.age += 1;
      p.exp = (p.exp || 0) + 1;
      if (p.exp >= 1) p.rookie = false;      // the 新秀 tag is a first-year thing only
      const truth = p.truePot || p.pot || p.ovr;       // scouts can be wrong; growth follows the truth
      const gap = Math.max(0, truth - p.ovr);
      const eth = p.workEthic == null ? 0.55 : p.workEthic;
      const ethMul = 0.7 + eth * 0.6;

      // Opportunity gates development: a 20-year-old who never leaves the bench
      // does not improve like one playing 30 minutes, no matter his ceiling.
      const mpg = p.st && p.st.gp ? p.st.min / p.st.gp : 0;
      const opp = mpg >= 28 ? 1.15 : mpg >= 22 ? 1 : mpg >= 15 ? 0.78 : mpg >= 8 ? 0.5 : mpg >= 3 ? 0.28 : 0.12;
      const tsRaw = p.st && p.st.fga ? p.st.pts / (2 * (p.st.fga + 0.44 * p.st.fta) || 1) : 0.55;
      const eff = clamp(0.78 + (tsRaw - 0.54) * 1.1, 0.6, 1.2);

      let delta = 0;
      if (p.lateBloomer && p.age <= 21) delta = Math.min(gap, Math.round(RNG.range(0, 2)));
      else if (p.lateBloomer && p.age <= 27) delta = Math.min(gap, Math.round(RNG.range(4, 8)));
      else if (p.lateBloomer && p.age <= 29) delta = Math.min(gap, Math.round(RNG.range(1, 3)));
      else if (p.age <= 23) delta = Math.min(gap, 1 + RNG.range(0, 5));
      else if (p.age <= 26) delta = Math.min(gap, RNG.range(0, 3));
      else if (p.age <= 29) delta = Math.round(RNG.range(-1, 1));
      else if (p.age <= 32) delta = -Math.round(RNG.range(0, 2));
      else if (p.age <= 35) delta = -Math.round(RNG.range(1, 3));
      else delta = -Math.round(RNG.range(2, 5));

      if (delta > 0) delta = Math.min(gap, Math.round(delta * opp * eff * ethMul));
      else delta = Math.round(delta * (0.75 + Math.min(1.2, mpg / 30) * 0.5));
      const before = p.ovr;
      // a good development coach squeezes a little more out of every summer
      const devMul = root.Staff ? root.Staff.coachDev(state.teams[p.team] && state.teams[p.team].coach) : 1;
      const grown = delta > 0 ? delta * devMul : delta;
      p.ovr = clamp(Math.round(p.ovr + grown), 38, 97);
      const shift = p.ovr - before;
      ['ins', 'mid', 'three', 'ft', 'pass', 'handle', 'oiq', 'diq', 'pdef', 'idef', 'reb', 'spd', 'str', 'sta', 'dur'].forEach((k) => {
        p[k] = clamp((p[k] || p.ovr) + shift, 20, 99);
      });
      if (p.truePot) p.pot = clamp(Math.round(p.pot + (p.truePot - p.pot) * 0.45), p.ovr, 97);
      else if (p.age <= 23) p.pot = clamp(Math.max(p.ovr, p.pot + Math.round(RNG.range(0, 3))), p.ovr, 97);
      p.peak = Math.max(p.peak || 0, p.ovr);
      if (p.injDays > 0) { p.injDays = Math.max(0, p.injDays - 60); }
      if (p.injDays === 0) p.injury = null;
      p.years = (p.years || 1) - 1;
      if (p.age >= 37 && (p.ovr < 70 || RNG.chance(0.35))) {
        const peak = Math.max(p.peak || 0, p.ovr);
        if (peak >= 84) {
          state.legends = state.legends || [];
          state.legends.push({ name: p.name, pos: p.pos, ovr: peak, arch: root.Scout.archetype(p), season: state.season });
          if (state.legends.length > 80) state.legends.shift();
        }
        p.retired = true; p.team = null;
      }
    }

    // expiring contracts hit the market, but their own team keeps Bird rights
    const fa = [];
    for (const p of state.players) {
      if (p.retired) continue;
      if (!p.team) continue;
      if (p.years <= 0) {
        p.birdTeam = p.team; p.team = null; p.salary = 0; p.years = 0; p.opt = 0;
        p.moraleMod = 0; p.tradeRequest = false; p.morale = 68;
        fa.push(p);
      }
    }

    aiResign(state, fa);

    state.freeAgents = fa.map((p) => p.id);
    const mine = fa.filter((p) => p.birdTeam === state.userTeam);
    if (mine.length) {
      pushInbox(state, {
        type: 'resign',
        title: `${mine.length} 名球员合同到期`,
        body: `你可以用鸟权续约（不受工资帽限制，但不能超过第二围裙）：${mine.map((p) => p.name).join('、')}。到自由市场页面操作。`,
      });
    }
    state.phase = 'offseason';
    state.off = { step: 'draft', drafted: false, faDone: false };
    state.date = `${state.season}-06-25`;
    state.draftClass = makeDraftClass(state.season);
    state.playoffsDone = true;
    pushInbox(state, { type: 'season', title: `${state.season - 1}-${String(state.season).slice(2)} 赛季结束`, body: `总冠军：${finals || '-'}。选秀大会即将开始。` });
  }

  // ---------------- Bird-rights re-signing ----------------
  // Real teams keep most of their own free agents. Without this, a 43% expiring
  // class (the actual 2026-27 cap sheet) would scatter the league every summer.
  function aiResign(state, expiring) {
    const stand = root.League.standings(state);
    const rankOf = new Map(stand.map((t, i) => [t.abbr, i]));
    for (const t of Object.keys(state.teams)) {
      if (t === state.userTeam) continue;
      const roster = state.players.filter((p) => p.team === t && !p.retired);
      let payroll = roster.reduce((a, p) => a + (p.salary || 0), 0);
      const rank = rankOf.get(t) ?? 15;
      const contender = rank < 10;
      const pool = expiring.filter((p) => p.birdTeam === t && !p.retired).sort((a, b) => b.ovr - a.ovr);
      for (const p of pool) {
        if (roster.length >= 15) break;
        const market = askingPrice(p);
        const overApron = payroll + market > CAP.apron2;
        let keep;
        if (p.ovr >= 85) keep = 0.97;
        else if (p.ovr >= 78) keep = 0.9;
        else if (p.ovr >= 72) keep = 0.8;
        else if (p.ovr >= 66) keep = 0.68;
        else if (p.ovr >= 60) keep = 0.5;
        else keep = 0.3;
        if (p.age >= 34) keep *= 0.6;
        else if (p.age >= 32) keep *= 0.85;
        if (p.age <= 24 && (p.pot || p.ovr) > p.ovr + 3) keep = Math.min(0.95, keep + 0.2);
        if (contender && p.ovr >= 74) keep = Math.min(0.95, keep + 0.08);
        if (overApron) keep *= 0.55;
        const mood = root.Core.clamp(0.55 + (p.morale == null ? 70 : p.morale) / 130, 0.5, 1.15);
        keep *= mood;
        if (p.tradeRequest) keep *= 0.25;
        if (!RNG.chance(Math.min(0.97, keep))) continue;
        const salary = Math.round(Math.min(CAP.max, market * RNG.range(0.9, 1.07)));
        const yrs = p.age <= 26 ? 3 + RNG.int(2) : p.age <= 30 ? 2 + RNG.int(2) : 1 + RNG.int(2);
        p.team = t; p.salary = salary; p.years = yrs; p.birdTeam = null; p.opt = RNG.chance(0.18) ? 1 : 0;
        payroll += salary;
        roster.push(p);
        state.transactions.unshift({ date: state.date, type: '续约', text: `${t} 用鸟权续约 ${p.name}（${root.Core.fmtM(salary)} × ${yrs} 年）` });
      }
    }
  }

  // ---------------- draft ----------------
  // Class strength varies year to year. Busts are produced by making the scouts
  // wrong about a player (their board is too optimistic), never by quietly
  // lowering him after he is drafted: a bust has to look like a bust from the
  // inside, otherwise the draft stops being a bet.
  function makeProspect(state, rank = 1, strength = 0.6) {
    const pos = RNG.pick(['PG', 'SG', 'SF', 'PF', 'C']);
    const h = pos === 'C' ? 82 + RNG.int(6) : pos === 'PF' ? 79 + RNG.int(5) : pos === 'SF' ? 77 + RNG.int(4) : 74 + RNG.int(4);
    const elite = Math.max(0, (60 - rank) / 59);                  // 1 -> 1, 60 -> 0
    const top = 60 + 12 * strength;                               // weak class 64, strong 78
    const ovr = clamp(Math.round(44 + (top - 44) * Math.pow(elite, 0.8) + RNG.range(-2.5, 2.5)), 40, 78);
    const upside = 3 + Math.round(elite * 8 + RNG.range(0, 7));
    const big = pos === 'C' ? 1 : pos === 'PF' ? 0.7 : 0;
    const guard = pos === 'PG' ? 1 : pos === 'SG' ? 0.8 : pos === 'SF' ? 0.4 : 0;
    const r = (v) => clamp(Math.round(v), 22, 92);
    const pot = clamp(ovr + upside, ovr, 96);
    return {
      id: `d${state.season}-${Math.floor(RNG.next() * 1e9)}`,
      name: `${RNG.pick(FIRST)} ${RNG.pick(LAST)}`,
      team: null, pos, age: 19 + RNG.int(3), h, w: 190 + Math.round(h * 0.9) + RNG.int(20),
      college: RNG.pick(['杜克', '肯塔基', '堪萨斯', '冈萨加', 'UCLA', '贝勒', '亚利桑那', '奥本', '密歇根', '北卡', '皇马', '梅加', '点燃队']),
      exp: 0, jersey: '', photo: '', salary: 0, years: 0, opt: 0,
      ovr, pot,
      trueOvr: ovr, truePot: pot,
      lateBloomer: false,
      injuryRisk: RNG.chance(0.16) ? RNG.range(0.35, 0.75) : RNG.range(0, 0.16),
      workEthic: RNG.range(0.2, 0.9),
      sq: 50,
      ins: r(ovr - 2 + big * 14), mid: r(ovr - 6), three: r(ovr + 2 - big * 24),
      ft: r(ovr - 6), pass: r(ovr - 4 + guard * 8), handle: r(ovr - 4 + guard * 9 - big * 12),
      oiq: r(ovr - 6), diq: r(ovr - 8), pdef: r(ovr - 5 + guard * 4 - big * 7),
      idef: r(ovr - 3 + big * 12), reb: r(ovr - 1 + big * 13), spd: r(ovr - 3 + guard * 7 - big * 14),
      str: r(ovr - 2 + big * 10), sta: r(50), dur: r(64),
      st: { gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 },
      injDays: 0, morale: 75, rookie: true,
    };
  }

  function makeDraftClass(season) {
    const strength = RNG.range(0.05, 1);              // not every class is a good one
    const list = [];
    for (let i = 0; i < 60; i++) list.push(makeProspect({ season }, i + 1, strength));

    // busts: about 1 in 5 lottery picks, at least one inside the top 6
    const byTrue = list.slice().sort((a, b) => (b.trueOvr + b.truePot * 0.45) - (a.trueOvr + a.truePot * 0.45));
    const lottery = byTrue.slice(0, 14);
    const nBust = 2 + (RNG.chance(0.55) ? 1 : 0);
    const busts = [];
    for (let i = 0; i < nBust; i++) {
      let cand = lottery.filter((p) => !busts.includes(p));
      // exactly one bust comes from the top 6; the rest fall in 7-14
      if (i === 0) cand = cand.filter((p) => lottery.indexOf(p) < 6);
      else cand = cand.filter((p) => lottery.indexOf(p) >= 6);
      if (!cand.length) cand = lottery.filter((p) => !busts.includes(p));
      const pick = RNG.pick(cand);
      if (!pick) break;
      pick.truePot = clamp(pick.trueOvr + 2 + Math.round(RNG.range(0, 6)), pick.trueOvr, 96);
      pick.bust = true;
      busts.push(pick);
    }

    // gem: once every 2-3 classes, a second-rounder hides a franchise player
    if (RNG.chance(0.4)) {
      const gem = RNG.pick(byTrue.slice(24));
      if (gem) {
        gem.truePot = 88 + Math.round(RNG.range(0, 6));
        gem.trueOvr = 48 + Math.round(RNG.range(0, 5));
        gem.lateBloomer = true;
        gem.workEthic = RNG.range(0.55, 0.9);
        gem.sq = 38;                                   // nobody has seen it yet
      }
    }

    // scouting opinion: noisy, optimistic, occasionally badly wrong
    for (const p of list) {
      p.sq = clamp(Math.round(45 + RNG.range(-14, 16)), 25, 82);
      const err = ((100 - p.sq) / 100) * 6;
      const scoutOvr = clamp(Math.round(p.trueOvr + RNG.range(-err, err) * 0.6), 38, 84);
      let scoutPot = clamp(Math.round(p.truePot + RNG.range(-err, err)), scoutOvr, 97);
      if (p.bust) {
        scoutPot = clamp(p.truePot + 10 + Math.round(RNG.range(0, 7)), scoutOvr, 95);
        p.sq = 45;
      }
      if (p.lateBloomer) scoutPot = clamp(p.truePot - 14 - Math.round(RNG.range(0, 8)), scoutOvr, 97);
      p.ovr = scoutOvr;
      p.pot = Math.max(scoutPot, scoutOvr);
    }

    // blue-chip cap: at most 2-3 future stars a year
    const ranked = list.slice().sort((a, b) => b.pot - a.pot);
    let blue = 0;
    for (const p of ranked) {
      if (p.pot >= 88) {
        blue++;
        if (blue > 2 + (strength > 0.7 ? 1 : 0)) p.pot = 84 + Math.round(RNG.range(0, 3));
      }
    }

    const keyed = list.map((p) => ({ p, k: p.ovr + p.pot * 0.42 + RNG.range(-2.5, 2.5) }));
    keyed.sort((a, b) => b.k - a.k);
    return keyed.map((x, i) => ({ ...x.p, rank: i + 1, scout: null }));
  }

  function draftOrder(state) {
    const stand = root.League.standings(state);       // best -> worst
    const playoff = stand.slice(0, 16);               // 16 playoff teams
    const lottery = stand.slice(16).reverse();        // 14 non-playoff, worst first
    const weights = lottery.map((t, i) => Math.pow(0.94, i));
    const picked = [];
    for (let i = 0; i < 4; i++) {
      const total = weights.reduce((a, b, j) => (picked.includes(lottery[j].abbr) ? a : a + b), 0);
      let r = RNG.next() * total;
      for (let j = 0; j < lottery.length; j++) {
        if (picked.includes(lottery[j].abbr)) continue;
        r -= weights[j];
        if (r <= 0) { picked.push(lottery[j].abbr); break; }
      }
    }
    const restLottery = lottery.filter((t) => !picked.includes(t.abbr)).map((t) => t.abbr);
    const playoffsWorstFirst = playoff.slice().reverse().map((t) => t.abbr);
    return [...picked, ...restLottery, ...playoffsWorstFirst];   // 30 teams
  }

  // how badly a team needs this position, from its own roster
  function needWeight(state, team, pos) {
    const rs = state.players.filter((p) => p.team === team && !p.retired);
    const same = rs.filter((p) => p.pos === pos);
    const young = same.filter((p) => p.age <= 25).length;
    const old = same.filter((p) => p.age >= 31).length;
    let w = 0;
    if (!same.length) w = 7;
    else if (same.length === 1) w = 3.5;
    else if (same.length === 2) w = 0.5;
    else if (same.length >= 4) w = -4;
    return w - young * 1.3 + old * 0.8;
  }

  function runDraft(state, userPicks, autoAll = false) {
    if (!state.draftClass) state.draftClass = makeDraftClass(state.season);
    const order = draftOrder(state);
    const results = [];
    const posTaken = {};
    let pool = state.draftClass.slice().sort((a, b) => b.pot - a.pot);
    let slot = 1;
    for (let round = 1; round <= 2; round++) {
      for (let i = 0; i < 30; i++) {
        const ds = draftSlot(state, order, slot);
        const pick = ds.pick;
        const owner = ds.owner;
        if (!pool.length) break;
        let prospect;
        const isUser = owner === state.userTeam;
        if (isUser && !autoAll) prospect = state.pendingPick;   // set by UI
        if (!prospect) {
          // AI: shortlist by scouted talent, then bend it toward roster need.
          // A better scouting staff simply evaluates the same board with less noise.
          const scoutR = root.Scout.staffRating(state, owner);
          const taken = posTaken[owner] || (posTaken[owner] = {});
          const noise = ((100 - scoutR) / 100) * 7;
          const scored = pool.slice(0, 20).map((p) => {
            let v = p.ovr * 0.4 + p.pot * 0.6 + RNG.range(-noise, noise);
            v += needWeight(state, owner, p.pos);
            v -= (taken[p.pos] || 0) * 4;
            v -= (p.injuryRisk || 0) * 3;
            v += p.age <= 19 ? 0.8 : 0;
            return { p, v };
          }).sort((a, b) => b.v - a.v);
          prospect = scored[0].p;
        }
        if (!prospect) break;
        const taken = posTaken[owner] || (posTaken[owner] = {});
        taken[prospect.pos] = (taken[prospect.pos] || 0) + 1;
        pool = pool.filter((p) => p !== prospect);
        prospect.team = owner;
        prospect.years = 2;
        prospect.salary = Math.round((round === 1 ? 13500000 * Math.pow(0.94, slot - 1) : 2400000 * Math.pow(0.96, slot - 31)) / 1000) * 1000;
        prospect.opt = round === 1 ? 2 : 0;
        prospect.rookie = true;
        state.players.push(prospect);
        if (pick) pick.used = true;
        results.push({ slot, round, owner, prospect });
        if (isUser && !autoAll) { state.pendingPick = null; return { results, order, slot, done: false }; }
        slot++;
      }
    }
    state.off = state.off || {};
    state.off.drafted = true;
    // next class gets a fresh set of workout invitations
    state.workouts = [];
    (state.draftClass || []).forEach((p) => { p.workedOut = false; });
    return { results, order, slot, done: true };
  }

  // ---------------- free agency ----------------
  function askingPrice(p) {
    const base = root.Core.marketSalary(p.ovr);
    const ageMod = p.age <= 24 ? 1.1 : p.age <= 28 ? 1.0 : p.age <= 31 ? 0.92 : 0.8;
    const morale = p.morale == null ? 70 : p.morale;
    const moodMul = root.Core.clamp(1 + (70 - morale) / 500, 0.85, 1.25);
    return Math.round(base * ageMod * moodMul);
  }

  function listFreeAgents(state) {
    return state.players.filter((p) => !p.team && !p.retired).sort((a, b) => b.ovr - a.ovr);
  }

  function signPlayer(state, playerId, teamAbbr, salary, years) {
    const p = state.players.find((x) => x.id === playerId);
    if (!p || p.team) return { ok: false, msg: '球员已有球队' };
    const payroll = root.Core.payrollOf(teamAbbr, state.players, state);
    const capSpace = CAP.cap - payroll;
    if (p.buyoutFrom === teamAbbr && p.buyoutSeason === state.season) {
      return { ok: false, msg: '本赛季被自己买断的球员不能重新签回' };
    }
    const isBird = p.birdTeam === teamAbbr;
    if (isBird) {
      if (salary + payroll > CAP.apron2) {
        return { ok: false, msg: `鸟权续约不能越过第二围裙（还剩 ${root.Core.fmtM(Math.max(0, CAP.apron2 - payroll))}）` };
      }
    } else if (state.teams[teamAbbr] && state.teams[teamAbbr].hardCap === 'apron1' && payroll + salary > CAP.apron1) {
      return { ok: false, msg: `先签后换后球队被硬帽在第一围裙（${root.Core.fmtM(CAP.apron1)}），签不下这份合同` };
    } else if (salary > capSpace + CAP.mle && salary > CAP.min) {
      return { ok: false, msg: `薪资空间不足（可用 ${root.Core.fmtM(Math.max(0, capSpace))} + 中产）` };
    }
    if (p.ovr >= 80 && !['BOS', 'LAL', 'NYK', 'GSW', 'DEN', 'OKC', 'MIA', 'MIL'].includes(teamAbbr) && RNG.chance(0.45)) {
      return { ok: false, msg: `${p.name} 想去争冠球队` };
    }
    p.team = teamAbbr; p.salary = salary; p.years = years; p.opt = 0; p.morale = 78; p.birdTeam = null;
    // 3 月 1 日之后签下的球员没有季后赛资格
    p.noPlayoffs = state.date > `${state.season}-03-01` && state.phase !== 'offseason';
    state.transactions.unshift({ date: state.date, type: '签约', text: `${teamAbbr} 签下 ${p.name}（${root.Core.fmtM(salary)} × ${years} 年）` });
    if (teamAbbr === state.userTeam) pushInbox(state, { type: 'sign', title: `签约成功：${p.name}`, body: `${root.Core.fmtM(salary)} × ${years} 年` });
    return { ok: true };
  }

  function aiFreeAgency(state, rounds = 1) {
    const fas = listFreeAgents(state);
    const teams = Object.keys(state.teams);
    for (const p of fas.slice(0, 40)) {
      if (p.team) continue;
      if (p.birdTeam === state.userTeam && state.off && state.off.step === 'draft') continue;
      const ask = askingPrice(p);
      for (const t of RNG.shuffle(teams)) {
        const roster = state.players.filter((x) => x.team === t && !x.retired);
        if (roster.length >= 15) continue;
        const payroll = root.Core.payrollOf(t, state.players, state);
        const room = CAP.cap - payroll;
        if (ask > room + CAP.mle) continue;
        if (RNG.chance(0.35)) {
          const salary = Math.round(ask * RNG.range(0.9, 1.1));
          if (salary > room + CAP.mle) continue;
          p.team = t; p.salary = salary; p.years = 1 + RNG.int(3);
          state.transactions.unshift({ date: state.date, type: '签约', text: `${t} 签下 ${p.name}（${root.Core.fmtM(salary)}）` });
          break;
        }
      }
    }
  }

  // ---------------- trades ----------------
  function findTpe(state, team, id) {
    const t = state.teams[team];
    if (!t || !t.tpe) return null;
    return t.tpe.find((x) => x.id === id && x.expires >= state.date) || null;
  }

  function tradeLegal(state, teamA, teamB, outA, outB) {
    // rosters cap at 15: a 2-for-1 is fine, a 1-for-2 for a full team is not
    const sizeOf = (t) => root.Core.rosterOf(t, state.players).length;
    const cnt = (list) => list.filter((x) => x.kind === 'player').length;
    if (sizeOf(teamA) - cnt(outA) + cnt(outB) > 15) {
      return { ok: false, msg: `${teamA} 名单会超过 15 人（现在 ${sizeOf(teamA)} 人），先裁人再谈` };
    }
    if (sizeOf(teamB) - cnt(outB) + cnt(outA) > 15) {
      return { ok: false, msg: `${teamB} 名单会超过 15 人（现在 ${sizeOf(teamB)} 人）` };
    }
    const salOutA = outA.filter((x) => x.kind === 'player').reduce((a, x) => a + (x.salary || 0), 0);
    const salOutB = outB.filter((x) => x.kind === 'player').reduce((a, x) => a + (x.salary || 0), 0);
    const salInA = salOutB, salInB = salOutA;
    const roomA = CAP.cap - root.Core.payrollOf(teamA, state.players, state) + salOutA;
    const roomB = CAP.cap - root.Core.payrollOf(teamB, state.players, state) + salOutB;
    // A trade exception absorbs one player's salary and cannot be combined with salary going out.
    const tpeA = outA.find((x) => x.kind === 'tpe');
    const tpeB = outB.find((x) => x.kind === 'tpe');
    let okA = salOutA === 0 ? true : salInA <= salOutA * 1.25 + 100000 || salInA <= roomA;
    let okB = salOutB === 0 ? true : salInB <= salOutB * 1.25 + 100000 || salInB <= roomB;
    if (tpeA) {
      const tpe = findTpe(state, teamA, tpeA.id);
      if (!tpe) return { ok: false, msg: '交易特例已过期' };
      if (salOutA > 0) return { ok: false, msg: '用交易特例吃人时不能再送出球员薪水（规则限制）' };
      if (outB.filter((x) => x.kind === 'player').length > 1) return { ok: false, msg: '一个交易特例只能吃一名球员' };
      if (salInA > tpe.amount) return { ok: false, msg: `交易特例只有 ${root.Core.fmtM(tpe.amount)}，吃不下 ${root.Core.fmtM(salInA)}` };
      okA = true;
    }
    if (tpeB) {
      const tpe = findTpe(state, teamB, tpeB.id);
      if (!tpe) return { ok: false, msg: '交易特例已过期' };
      if (salOutB > 0) return { ok: false, msg: '用交易特例吃人时不能再送出球员薪水（规则限制）' };
      if (outA.filter((x) => x.kind === 'player').length > 1) return { ok: false, msg: '一个交易特例只能吃一名球员' };
      if (salInB > tpe.amount) return { ok: false, msg: `交易特例只有 ${root.Core.fmtM(tpe.amount)}，吃不下 ${root.Core.fmtM(salInB)}` };
      okB = true;
    }
    if (!okA) return { ok: false, msg: `${teamA} 薪资配平失败：最多可接 ${root.Core.fmtM(salOutA * 1.25 + 100000)}` };
    if (!okB) return { ok: false, msg: `${teamB} 薪资配平失败：最多可接 ${root.Core.fmtM(salOutB * 1.25 + 100000)}` };
    return { ok: true };
  }

  // Draft slot resolution. From 2027 on the real ledger drives it: each pick is
  // identified by the team it originally belonged to, the standings decide its slot,
  // and Picks.resolve() applies the published swaps before protections are checked.
  function draftBoard(state, order, round) {
    const P = root.Picks;
    if (P && state.season >= 2027 && round === 1) {
      return P.resolve(state.season, round, order).map((r) => {
        const rec = state.picks.find((q) => q.year === state.season && q.round === round && q.orig === r.orig);
        const prot = (rec && rec.prot) || r.prot || null;
        const inside = prot && r.slot >= prot[0] && r.slot <= prot[1];
        return {
          slot: r.slot, orig: r.orig, round,
          owner: inside ? r.orig : (rec ? rec.owner : r.owner),
          pick: rec || null, prot, protectedStay: !!inside,
          note: (rec && rec.note) || r.note || '',
        };
      });
    }
    if (P && state.season >= 2027 && round === 2) {
      return order.map((abbr, i) => {
        const rec = state.picks.find((q) => q.year === state.season && q.round === 2 && q.orig === abbr);
        const prot = rec && rec.prot ? rec.prot : null;
        const inside = prot && i + 1 >= prot[0] && i + 1 <= prot[1];
        return { slot: i + 1, orig: abbr, round, owner: inside ? abbr : (rec ? rec.owner : abbr), pick: rec || null, prot, protectedStay: !!inside, note: (rec && rec.note) || '' };
      });
    }
    return order.map((abbr, i) => {
      const rec = state.picks.find((q) => q.year === state.season && q.round === round && q.orig === abbr);
      return { slot: i + 1, orig: abbr, round, owner: rec ? rec.owner : abbr, pick: rec || null, prot: null, protectedStay: false, note: '' };
    });
  }

  function draftSlot(state, order, slotNo) {
    const round = slotNo <= 30 ? 1 : 2;
    const idx = (slotNo - 1) % 30;
    if (!state._board || state._boardKey !== `${state.season}-${round}-${order.join('')}`) {
      state._board = draftBoard(state, order, round);
      state._boardKey = `${state.season}-${round}-${order.join('')}`;
    }
    const row = state._board[idx];
    return { ...row, rank: idx + 1, swapped: row.orig !== order[idx] };
  }

  function pickAssetValue(state, pk) {
    if (!pk) return 0;
    const t = state.teams[pk.orig];
    const wins = t ? t.wins : 41;
    const slot = pk.round === 2 ? 30 + clamp(31 - wins, 1, 30) : clamp(31 - wins, 1, 30);
    const yOff = Math.max(0, pk.year - state.season);
    let v = root.Core.pickValue(slot, yOff);
    if (pk.prot && slot >= pk.prot[0] && slot <= pk.prot[1]) v *= 0.3;
    return v;
  }

  function pickSlot(state, pick) {
    const t = state.teams[pick.orig];
    const wins = t ? t.wins : 41;
    const s = clamp(31 - wins, 1, 30);
    return pick.round === 2 ? 30 + s : s;
  }

  function assetValue(state, x, yearOffset = 0) {
    if (x.kind === 'pick') {
      const pk = state.picks.find((q) => q.id === x.id);
      return pickAssetValue(state, pk);
    }
    const p = x.player || state.players.find((q) => q.id === x.id);
    return p ? root.Core.tradeValue(p) : 0;
  }

  function evaluateTrade(state, teamA, teamB, outA, outB, yearOffset = 0) {
    const legal = tradeLegal(state, teamA, teamB, outA, outB);
    if (!legal.ok) return { accept: false, msg: legal.msg, ratio: 0 };
    const vA = outA.reduce((a, x) => a + assetValue(state, x, yearOffset), 0);
    const vB = outB.reduce((a, x) => a + assetValue(state, x, yearOffset), 0);
    if (!outA.length && !outB.length) return { accept: false, msg: '请先选择双方筹码', ratio: 0, vA: 0, vB: 0 };
    if (!outB.length) return { accept: false, msg: '对方不会白送球员', ratio: 99, vA, vB };
    // AI wants a premium when giving up the best asset
    // The AI never trades straight up. What it asks for depends on what it loses
    // and where it sits: contenders want players back, rebuilders want picks.
    const playersOut = outB.filter((x) => x.kind === 'player');
    const bestOut = playersOut.reduce((m, x) => {
      const p = state.players.find((q) => q.id === x.id);
      return Math.max(m, p ? root.Core.tradeValue(p) : 0);
    }, 0);
    const star = clamp((bestOut - 700) / 1200, 0, 1);
    const tB = state.teams[teamB];
    const gB = tB.wins + tB.losses;
    const winPct = gB ? tB.wins / gB : 0.5;
    const picksIn = outA.filter((x) => x.kind === 'pick').length;
    let premium = 1.06 + star * 0.16;
    if (winPct < 0.42) premium -= picksIn && !bestOut ? 0.05 : 0;      // a rebuilder will take picks
    if (winPct > 0.58) premium += picksIn ? 0.06 : -0.02;             // a contender wants help now
    // nobody trades a franchise player for filler, no matter the totals
    if (bestOut >= 1200 && vA < vB * 0.75) {
      return { accept: false, msg: '对方直接挂了电话：这种报价没得谈。', ratio: vB ? vA / vB : 99, vA, vB };
    }
    const ratio = vB === 0 ? 99 : vA / vB;
    const accept = vA >= vB * premium;
    let msg;
    if (accept) msg = '对方接受了报价。';
    else if (ratio > premium * 0.92) msg = `几乎了，还差一点（对方要 ${Math.round(premium * 100)}% 的价值）。`;
    else if (ratio > premium * 0.7) msg = '差距明显，对方要更多。';
    else msg = '这个报价差得太远。';
    return { accept, msg, ratio, vA, vB, premium };
  }

  function executeTrade(state, teamA, teamB, outA, outB, opts = {}) {
    if (!opts.force && tradeBlocked(state)) return { ok: false, msg: '交易窗口已关闭' };
    const legal = tradeLegal(state, teamA, teamB, outA, outB);
    if (!legal.ok) return legal;
    for (const x of outA) {
      if (x.kind === 'player') { const p = state.players.find((q) => q.id === x.id); if (p) { p.team = teamB; p.years = Math.max(1, p.years); } }
      else { const pk = state.picks.find((q) => q.id === x.id); if (pk) pk.owner = teamB; }
    }
    for (const x of outB) {
      if (x.kind === 'player') { const p = state.players.find((q) => q.id === x.id); if (p) { p.team = teamA; p.years = Math.max(1, p.years); } }
      else { const pk = state.picks.find((q) => q.id === x.id); if (pk) pk.owner = teamA; }
    }
    // trade exceptions: spend the ones used, bank the difference for whoever sent more salary out
    for (const [side, outs] of [[teamA, outA], [teamB, outB]]) {
      const used = outs.find((x) => x.kind === 'tpe');
      const t = state.teams[side];
      if (used && t.tpe) {
        const i = t.tpe.findIndex((x) => x.id === used.id);
        if (i >= 0) {
          const incoming = (side === teamA ? outB : outA).filter((x) => x.kind === 'player').reduce((a, x) => a + (x.salary || 0), 0);
          t.tpe[i].amount -= incoming;
          if (t.tpe[i].amount < 100000) t.tpe.splice(i, 1);
        }
      }
    }
    const netA = outA.filter((x) => x.kind === 'player').reduce((a, x) => a + (x.salary || 0), 0)
      - outB.filter((x) => x.kind === 'player').reduce((a, x) => a + (x.salary || 0), 0);
    const netB = -netA;
    for (const [side, net] of [[teamA, netA], [teamB, netB]]) {
      if (net <= 100000) continue;
      const hasTpe = (outA.concat(outB)).some((x) => x.kind === 'tpe');
      if (hasTpe) continue;                     // a deal that spends an exception doesn't mint a new one
      const t = state.teams[side];
      t.tpe = t.tpe || [];
      t.tpe.push({
        id: `tpe-${side}-${state.date}-${t.tpe.length}`,
        amount: Math.round(net),
        expires: root.League.addDays(state.date, 365),
        from: side === teamA ? teamB : teamA,
      });
      pushInbox(state, {
        type: 'tpe', title: `获得交易特例 ${root.Core.fmtM(net)}`,
        body: `${side} 在交易中得到 ${root.Core.fmtM(net)} 的交易特例，一年内有效，只能单独吃一名球员。`,
      });
    }
    const desc = `${teamA} 送出 ${outA.map((x) => x.name).join('、') || '无'}，得到 ${outB.map((x) => x.name).join('、') || '无'}`;
    state.transactions.unshift({ date: state.date, type: '交易', text: desc });
    if (state.transactions.length > 400) state.transactions.length = 400;
    pushInbox(state, { type: 'trade', title: '交易完成', body: desc });
    return { ok: true };
  }

  // ---------------- staff ----------------
  // One head coach, one scout. The coach brings a system that changes how the team
  // plays; the scout sets how much you can trust a draft report.
  function staffMarket(state) {
    state.staffMarket = state.staffMarket || [];
    return state.staffMarket;
  }

  function refreshStaffMarket(state, force) {
    if (!root.Staff) return [];
    const last = state.staffMarketAt || '';
    if (!force && last && root.League.diffDays(state.date, last) < 30 && (state.staffMarket || []).length) return state.staffMarket;
    state.staffMarket = root.Staff.makeMarket(state, RNG, 5, 5);
    state.staffMarketAt = state.date;
    return state.staffMarket;
  }

  function hireStaff(state, id) {
    const m = (state.staffMarket || []).find((x) => x.id === id);
    if (!m) return { ok: false, msg: '这名职员已经不在市场上' };
    const t = state.teams[state.userTeam];
    if (t[m.role]) return { ok: false, msg: `已经有${m.role === 'coach' ? '主教练' : '球探'}了，先解约` };
    const years = 3;
    t[m.role] = { ...m, salary: m.ask, years };
    state.staffMarket = state.staffMarket.filter((x) => x.id !== id);
    const role = m.role === 'coach' ? '主教练' : '球探';
    state.transactions.unshift({ date: state.date, type: '职员', text: `${state.userTeam} 聘请${role} ${m.name}（${root.Core.fmtM(m.ask)} × ${years} 年）` });
    pushInbox(state, {
      type: 'staff', title: `聘请${role}：${m.name}`,
      body: m.role === 'coach'
        ? `${root.Staff.SYSTEMS[m.system].name}：${root.Staff.SYSTEMS[m.system].good}`
        : `看人评分 ${m.eye}，选秀报告的可信度会按这个走。`,
    });
    return { ok: true };
  }

  function renewStaff(state, role, salary, years) {
    const t = state.teams[state.userTeam];
    const m = t[role];
    if (!m) return { ok: false, msg: '没有这个职位' };
    const pay = Math.max(m.ask * 0.85, salary || m.salary);
    m.salary = Math.round(pay);
    m.years = Math.max(1, Math.min(5, years || (m.years || 1) + 2));
    state.transactions.unshift({ date: state.date, type: '职员', text: `${state.userTeam} 与 ${m.name} 续约（${root.Core.fmtM(m.salary)} × ${m.years} 年）` });
    return { ok: true };
  }

  function releaseStaff(state, role) {
    const t = state.teams[state.userTeam];
    const m = t[role];
    if (!m) return { ok: false, msg: '没有这个职位' };
    t[role] = null;
    state.staffMarket = state.staffMarket || [];
    state.staffMarket.push({ ...m, id: m.id, ask: Math.round(m.ask) });
    state.transactions.unshift({ date: state.date, type: '职员', text: `${state.userTeam} 与${role === 'coach' ? '主教练' : '球探'} ${m.name} 解约` });
    return { ok: true };
  }

  // contracts tick down with the season; an expired one walks
  function tickStaff(state) {
    for (const abbr of Object.keys(state.teams)) {
      for (const role of ['coach', 'scout']) {
        const m = state.teams[abbr][role];
        if (!m || m.role === undefined) continue;
        if (m.years > 0) m.years -= 1;
        if (m.years <= 0 && abbr === state.userTeam) {
          pushInbox(state, {
            type: 'staff', title: `${role === 'coach' ? '主教练' : '球探'}合同到期`,
            body: `${m.name} 的合同到期，制服组空出一个位置，去职员市场找人。`,
          });
        }
        if (m.years <= 0) state.teams[abbr][role] = null;
      }
    }
  }

  // ---------------- season story ----------------
  // A readable chronicle of the year: what happened, when, and how it ended.
  // Everything here is drawn from the season's own records — no invented beats.
  function writeStory(state) {
    const uid = state.userTeam;
    const nm = (x) => (root.ZH ? root.ZH.name(x) : x);
    const tn = (a) => (root.ZH ? root.ZH.team(a) : a);
    const t = state.teams[uid];
    const stand = root.League.standings(state);
    const rank = stand.findIndex((x) => x.abbr === uid) + 1;
    const po = state.playoffs || {};
    const ROUND_CN = { 0: '附加赛', 1: '首轮', 2: '分区半决赛', 3: '分区决赛', 4: '总决赛' };
    const startDate = `${state.season - 1}-10-20`;
    const P = [];

    const roster = state.players.filter((p) => p.team === uid);
    const byPts = roster.slice().sort((a, b) => (b.st.pts / Math.max(1, b.st.gp)) - (a.st.pts / Math.max(1, a.st.gp)));
    const star = roster.slice().sort((a, b) => b.ovr - a.ovr)[0];
    const scorer = byPts[0];
    const games = t.wins + t.losses;
    const pct = games ? t.wins / games : 0;
    const mood = pct >= 0.62 ? '争冠赛季' : pct >= 0.5 ? '冲击季后赛的赛季' : pct >= 0.38 ? '过渡赛季' : '重建赛季';
    const coach = t.coach;
    const sys = coach && root.Staff ? root.Staff.SYSTEMS[coach.system] : null;

    // ---- 1. the manager's office ----
    P.push({
      head: `开季 · ${startDate}`,
      text: `${startDate}，${tn(uid)}的办公室。你把新赛季的名单摊在桌上，最上面一行写着${star ? nm(star.name) : '几个年轻人'}的名字。` +
        `${coach ? `主教练${coach.name}坐在对面，他的${sys ? sys.name : '体系'}写在白板正中——${sys ? sys.short : ''}。` : '教练席还空着，这件事悬而未决。'}` +
        `你们把这一年定义成${mood}，目标只有一句：${pct >= 0.5 ? '把位置守住' : '先把地基打稳'}。`,
    });

    // ---- 2. the room ----
    const core = roster.filter((p) => p.st.gp >= 20).sort((a, b) => (b.st.min / Math.max(1, b.st.gp)) - (a.st.min / Math.max(1, a.st.gp))).slice(0, 8);
    const unhappy = core.filter((p) => (p.morale == null ? 70 : p.morale) < 52).sort((a, b) => (a.morale || 70) - (b.morale || 70))[0];
    const happy = core.filter((p) => (p.morale || 70) >= 78)[0];
    const angry = roster.find((p) => p.tradeRequest);
    const scenes = [];
    if (angry) {
      scenes.push(`更衣室里最刺眼的那个柜子属于${nm(angry.name)}。他在赛季中递交了交易申请，理由说得很直白：“我想去一个真会用我的地方。”`);
    } else if (unhappy) {
      scenes.push(`更衣室里不是没有声音。${nm(unhappy.name)}的出场时间和角色跟他赛季初想的对不上，他在训练后留了下来，把话说明白了：“我不在乎数据，我在乎的是球队到底要我做什么。”`);
    }
    if (happy && (!unhappy || happy.id !== unhappy.id)) {
      scenes.push(`${nm(happy.name)}是另一边：他打得舒服，也在公开场合替这套体系说话——“我们知道自己每天晚上要做什么。”`);
    }
    if (!scenes.length) {
      scenes.push(core.length
        ? '这一年更衣室出奇地安静。没有人公开抱怨角色，训练馆的作息按表走，赛前一个小时所有人都在看录像。'
        : '阵容换得太勤，更衣室里还没形成真正的声音。');
    }
    P.push({ head: '更衣室', text: scenes.join('') });

    // ---- 3. the season ----
    const played = (state.games || []).filter((g) => g.played && (g.home === uid || g.away === uid))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const myScore = (g) => (g.home === uid ? g.hs : g.as);
    const theirScore = (g) => (g.home === uid ? g.as : g.hs);
    let bestStreak = 0, worstStreak = 0, cur = 0;
    let bestWin = null, worstLoss = null;
    const months = {};
    for (const g of played) {
      const won = myScore(g) > theirScore(g);
      const m = g.date.slice(0, 7);
      months[m] = months[m] || { w: 0, l: 0 };
      if (won) months[m].w += 1; else months[m].l += 1;
      cur = won ? (cur > 0 ? cur + 1 : 1) : (cur < 0 ? cur - 1 : -1);
      if (cur > bestStreak) bestStreak = cur;
      if (-cur > worstStreak) worstStreak = -cur;
      const margin = myScore(g) - theirScore(g);
      if (margin > 0 && (!bestWin || margin > bestWin.margin)) bestWin = { ...g, margin };
      if (margin < 0 && (!worstLoss || margin < worstLoss.margin)) worstLoss = { ...g, margin };
    }
    const homeTop = stand[0];
    P.push({
      head: '常规赛',
      text: `八十二场打完，${tn(uid)}的战绩是 ${t.wins} 胜 ${t.losses} 负，排在联盟第 ${rank} 位` +
        (rank <= 8 ? '，主场优势攥在手里' : rank <= 16 ? '，勉强挤进季后赛的门' : '，提前进入了休赛期的思考') +
        `。${scorer ? `进攻端最靠得住的是${nm(scorer.name)}，场均 ${(scorer.st.pts / Math.max(1, scorer.st.gp)).toFixed(1)} 分` : ''}` +
        `${star && scorer && star.id !== scorer.id ? `，真正撑着球队的是${nm(star.name)}（${star.ovr}）` : ''}。` +
        `同一年，${tn(homeTop.abbr)}以 ${homeTop.wins} 胜领跑全联盟。`,
    });
    const monthLine = Object.keys(months).sort().map((m) => `${Number(m.slice(5))}月 ${months[m].w}胜${months[m].l}负`).join('、');
    if (monthLine) {
      P.push({
        head: '走势',
        text: `${monthLine}。` +
          (bestStreak >= 4 ? `最长的一波连胜是 ${bestStreak} 场，那段时间你几乎不用叫暂停。` : '') +
          (worstStreak >= 5 ? `最难熬的时候连输 ${worstStreak} 场，办公室的电话一直响。` : '') +
          (bestWin ? `${bestWin.date} 那晚他们赢了对手 ${bestWin.margin} 分（${myScore(bestWin)}-${theirScore(bestWin)}）。` : '') +
          (worstLoss && worstLoss.margin <= -20 ? `也有过 ${worstLoss.date} 这样输 ${-worstLoss.margin} 分的夜晚。` : ''),
      });
    }

    // ---- 4. the deadline: what you did, or didn't ----
    const moves = (state.transactions || [])
      .filter((x) => x.date >= startDate && x.text && x.text.includes(uid)
        && ['交易', '签约', '先签后换', '买断', '续约', '职员'].includes(x.type))
      .slice(0, 16).reverse();
    const deals = moves.filter((m) => m.type === '交易' || m.type === '先签后换');
    if (deals.length) {
      P.push({
        head: '截止日前后',
        text: deals.map((m) => `${m.date}，${localizeTx(m.text, state)}。`).join('') +
          (deals.length >= 2 ? '这几笔之后，轮换名单彻底换了一次血。' : '这笔交易之后，球队的轮换和更衣室的座位都动了一次。'),
      });
    } else {
      P.push({
        head: '截止日前后',
        text: `交易截止日 ${state.deadline || ''} 那天，电话来了几通，你最后一笔都没做。办公室里有人问是不是该动一动，你的回答是：这套人还没打完。`,
      });
    }
    const otherMoves = moves.filter((m) => m.type !== '交易' && m.type !== '先签后换');
    if (otherMoves.length) {
      P.push({ head: '名单变动', text: otherMoves.map((m) => `${m.date}，${localizeTx(m.text, state)}。`).join('') });
    }

    // ---- 5. injuries ----
    const bad = (state.seasonLog || []).filter((x) => x.team === uid && x.sev !== 'minor')
      .sort((a, b) => b.days - a.days).slice(0, 4);
    if (bad.length) {
      P.push({
        head: '伤病',
        text: bad.map((x) => `${x.date}，${nm(x.player)}${x.label}，预计缺阵 ${x.days} 天。`).join('') +
          '训练馆的康复区那阵子一直有人。',
      });
    }

    // ---- 6. the playoffs ----
    const mine = (po.all || []).filter((x) => x.a === uid || x.b === uid);
    if (mine.length) {
      const lines = mine.map((x) => {
        const home = x.a === uid;
        const me = home ? x.wa : x.wb, them = home ? x.wb : x.wa;
        return `${x.round === 0 ? '附加赛' : ROUND_CN[x.round]}对${tn(home ? x.b : x.a)}，${me}-${them}${x.winner === uid ? '，过关' : '，止步'}。`;
      });
      const champ = po.champion === uid;
      P.push({
        head: '季后赛',
        text: lines.join('') +
          (champ ? `最后一场终场哨响，${tn(uid)}举起了奖杯，你在通道口站了很久。` : po.champion ? `总冠军属于${tn(po.champion)}。` : ''),
      });
    } else {
      P.push({ head: '季后赛', text: '这个赛季没有季后赛可打。四月之后，办公室的灯比训练馆熄得还早。' });
    }

    // ---- 7. honours ----
    const aw = state.awards || {};
    const myAwards = [];
    const awardOf = (id2, label) => {
      const p = state.players.find((q) => q.id === id2);
      if (p && p.team === uid) myAwards.push(label);
    };
    awardOf(aw.mvp, 'MVP');
    awardOf(aw.dpoy, '最佳防守球员');
    awardOf(aw.roy, '最佳新秀');
    awardOf(aw.mip, '最快进步');
    awardOf(aw.smoy, '最佳第六人');
    (aw.allNBA || []).forEach((team, i) => team.forEach((id2) => {
      const p = state.players.find((q) => q.id === id2);
      if (p && p.team === uid) myAwards.push(`最佳阵容${['一', '二', '三'][i]}阵`);
    }));
    P.push({
      head: '结局',
      text: `${myAwards.length ? `赛季结束时，${nm(star ? star.name : '')}等人把${myAwards.join('、')}带回了更衣室。` : '这个赛季没有个人奖项落进这座更衣室。'}` +
        `${coach ? `${coach.name}的${sys ? sys.name : '体系'}被保留了下来，管理层在总结会上承认：这套打法还没被真正打透。` : ''}` +
        `休赛期的第一件事，是决定这套阵容还值不值得再赌一年。`,
    });

    // ---- 8. outlook ----
    const payroll = root.Core.payrollOf(uid, state.players, state);
    const room = CAP.cap - payroll;
    const firsts = state.picks.filter((x) => x.owner === uid && x.year === state.season + 1 && x.round === 1 && !x.used).length;
    const seconds = state.picks.filter((x) => x.owner === uid && x.year === state.season + 1 && x.round === 2 && !x.used).length;
    P.push({
      head: '展望',
      text: `进入 ${state.season}-${String(state.season + 1).slice(2)} 的休赛期，球队工资单 ${root.Core.fmtM(payroll)}` +
        (room > 0 ? `，距离工资帽还有 ${root.Core.fmtM(room)} 的空间` : `，已经越过工资帽 ${root.Core.fmtM(-room)}`) +
        `；选秀大会上手握 ${firsts} 个首轮签、${seconds} 个次轮签。` +
        `${pct >= 0.55 ? '继续围绕现有核心补强' : '要么推倒重来，要么再赌一年'}。`,
    });
    return P;
  }

  // transaction text is written with abbreviations and English names; the story
  // reads in Chinese, so both get translated token by token
  let nameMapCache = null;
  function localizeTx(text, state) {
    if (!root.ZH) return text;
    let out = String(text).replace(/\b([A-Z]{2,3})\b/g, (m) => root.ZH.team(m) || m);
    const pool = (state && state.players) || [];
    if (!nameMapCache || nameMapCache.size < pool.length) {
      nameMapCache = [];
      pool.forEach((p) => { if (p && p.name) nameMapCache.push([p.name, root.ZH.name(p.name)]); });
      nameMapCache.sort((a, b) => b[0].length - a[0].length);
    }
    for (const [en, zh] of nameMapCache) {
      if (en && out.indexOf(en) >= 0) out = out.split(en).join(zh);
    }
    return out;
  }

  // ---------------- free agency: negotiation and bidding ----------------
  // You no longer sign a free agent by clicking once. An offer opens a negotiation
  // that runs for a few days; rival clubs with cap room can out-bid you, the agent
  // comes back asking you to match, and whoever holds the best offer when the clock
  // runs out gets the player.
  const NEGO_DAYS = 3;

  function rivalPool(state, p, excludeTeam) {
    const need = askingPrice(p);
    return Object.keys(state.teams).filter((t) => {
      if (t === excludeTeam) return false;
      const roster = root.Core.rosterOf(t, state.players);
      if (roster.length >= 15) return false;
      const payroll = root.Core.payrollOf(t, state.players, state);
      if (payroll + need * 0.88 > CAP.apron1) return false;
      // contenders chase good players, rebuilders chase them less
      const winPct = state.teams[t].wins / Math.max(1, state.teams[t].wins + state.teams[t].losses);
      return RNG.chance(0.18 + winPct * 0.22 + (p.ovr - 70) * 0.004);
    });
  }

  function negoFor(state, pid) {
    return (state.nego || []).find((n) => n.pid === pid && n.team === state.userTeam) || null;
  }

  function openNegotiation(state, pid, salary, years) {
    const p = state.players.find((x) => x.id === pid);
    if (!p || p.team) return { ok: false, msg: '球员已有球队' };
    if (state.phase === 'playoffs') return { ok: false, msg: '季后赛期间不开放自由球员谈判' };
    if (negoFor(state, pid)) return { ok: false, msg: '已经有一份报价在谈' };
    const check = signCheck(state, p, state.userTeam, salary);
    if (!check.ok) return check;
    const ask = askingPrice(p);
    if (salary < ask * 0.72) return { ok: false, msg: `${p.name} 的经纪人：这个价连谈的兴趣都没有（要价 ${root.Core.fmtM(ask)}）` };
    state.nego = state.nego || [];
    const rivals = rivalPool(state, p, state.userTeam);
    const rivalTeam = rivals.length ? rivals[Math.floor(RNG.next() * rivals.length)] : null;
    let rivalOffer = null;
    if (rivalTeam && RNG.chance(0.62)) {
      // a rival can only bid what it can actually fit under the first apron
      const room = CAP.apron1 - root.Core.payrollOf(rivalTeam, state.players, state);
      const bid = Math.min(Math.round(ask * RNG.range(1.02, 1.18)), Math.round(room * 0.98));
      if (bid >= ask * 0.9) rivalOffer = { team: rivalTeam, salary: bid, years: 2 + RNG.int(2) };
    }
    const n = {
      id: `n${state.date}-${pid}`, team: state.userTeam, pid,
      salary, years: Math.max(1, Math.min(5, years || 2)),
      opened: state.date, expires: root.League.addDays(state.date, NEGO_DAYS),
      rival: rivalOffer, bumped: false, rounds: 1,
    };
    state.nego.push(n);
    const lead = rivalOffer && rivalOffer.salary > salary;
    pushInbox(state, {
      type: 'nego',
      title: `报价已提交：${p.name}`,
      body: `${root.Core.fmtM(salary)} × ${n.years} 年。${lead ? `但有球队（${rivalOffer.team}）出了 ${root.Core.fmtM(rivalOffer.salary)}，${NEGO_DAYS} 天内可以加价。` : `没有别的球队跟价，${NEGO_DAYS} 天后如果没人插一手就是你的。`}`,
    });
    return { ok: true, nego: n, lead };
  }

  // a poor rating can still be refused, but only once the money is real
  function signCheck(state, p, teamAbbr, salary) {
    const payroll = root.Core.payrollOf(teamAbbr, state.players, state);
    const isBird = p.birdTeam === teamAbbr;
    const capSpace = CAP.cap - payroll;
    if (state.teams[teamAbbr] && state.teams[teamAbbr].hardCap === 'apron1' && payroll + salary > CAP.apron1) {
      return { ok: false, msg: `先签后换后球队被硬帽在第一围裙（${root.Core.fmtM(CAP.apron1)}）` };
    }
    if (isBird) {
      if (salary + payroll > CAP.apron2) return { ok: false, msg: `鸟权续约不能越过第二围裙` };
    } else if (salary > capSpace + CAP.mle && salary > CAP.min) {
      return { ok: false, msg: `薪资空间不足（可用 ${root.Core.fmtM(Math.max(0, capSpace))} + 中产）` };
    }
    return { ok: true };
  }

  function raiseOffer(state, pid, salary, years) {
    const n = negoFor(state, pid);
    if (!n) return { ok: false, msg: '没有正在进行的谈判' };
    const p = state.players.find((x) => x.id === pid);
    const check = signCheck(state, p, state.userTeam, salary);
    if (!check.ok) return check;
    if (salary <= n.salary) return { ok: false, msg: '新报价要高于现在的报价' };
    n.salary = salary;
    n.years = Math.max(1, Math.min(5, years || n.years));
    n.rounds += 1;
    pushInbox(state, { type: 'nego', title: `已加价：${p && p.name}`, body: `现在报 ${root.Core.fmtM(salary)} × ${n.years} 年。` });
    return { ok: true };
  }

  function withdrawOffer(state, pid) {
    state.nego = (state.nego || []).filter((n) => !(n.pid === pid && n.team === state.userTeam));
    return { ok: true };
  }

  // called every day; returns the headlines so the day log can show them
  function tickNegotiations(state) {
    if (!state.nego || !state.nego.length) return [];
    const news = [];
    const keep = [];
    for (const n of state.nego) {
      const p = state.players.find((x) => x.id === n.pid);
      if (!p || p.team) { continue; }
      // rivals keep bidding while the window is open
      if (n.rival && RNG.chance(0.45)) {
        const room = CAP.apron1 - root.Core.payrollOf(n.rival.team, state.players, state);
        n.rival.salary = Math.min(Math.round(n.rival.salary * RNG.range(1.01, 1.06)), Math.round(room * 0.98));
      } else if (!n.rival && RNG.chance(0.22)) {
        const pool = rivalPool(state, p, state.userTeam);
        if (pool.length) {
          n.rival = { team: pool[0], salary: Math.round(Math.max(n.salary, askingPrice(p)) * RNG.range(1.01, 1.12)), years: 2 + RNG.int(2) };
          news.push(`${n.rival.team} 加入了对 ${p.name} 的争夺`);
        }
      }
      const outbid = n.rival && n.rival.salary > n.salary;
      if (outbid && !n.warned) {
        n.warned = true;
        pushInbox(state, {
          type: 'nego',
          title: `${p.name} 收到更高报价`,
          body: `${n.rival.team} 出到 ${root.Core.fmtM(n.rival.salary)}。你现在是 ${root.Core.fmtM(n.salary)}，${n.expires} 前可以再加价，否则他会去那边。`,
        });
        news.push(`${p.name} 收到 ${n.rival.team} 的更高报价`);
      }
      if (state.date >= n.expires) {
        const rivalWins = !!(n.rival && n.rival.salary > n.salary);
        let done = false;
        if (rivalWins) {
          const ok = signPlayer(state, p.id, n.rival.team, n.rival.salary, n.rival.years);
          if (ok.ok) { news.push(`${p.name} 加盟 ${n.rival.team}（${root.Core.fmtM(n.rival.salary)}）`); done = true; }
        }
        if (!done) {
          // your offer settles it — or the bid fell apart and he stays on the market
          const ok = signPlayer(state, p.id, state.userTeam, n.salary, n.years);
          if (ok.ok) {
            pushInbox(state, { type: 'sign', title: `签下 ${p.name}`, body: `${root.Core.fmtM(n.salary)} × ${n.years} 年` });
            news.push(`你签下了 ${p.name}`);
          } else {
            pushInbox(state, { type: 'nego', title: `${p.name} 的谈判破裂`, body: `${ok.msg}。他重新回到自由市场。` });
            news.push(`${p.name} 谈判破裂`);
          }
        }
        continue;                                 // negotiation resolved either way
      }
      keep.push(n);
    }
    state.nego = keep;
    return news;
  }

  // ---------------- sign-and-trade ----------------
  // The player must be a free agent whose last team is the one signing him, the deal
  // must run at least three seasons, and the team taking him on is hard-capped at
  // the first apron for the rest of the league year.
  function signTradeDemand(state, playerId, toTeam) {
    const p = state.players.find((x) => x.id === playerId);
    if (!p || p.team || p.retired) return { ok: false, msg: '只有在自由球员才能先签后换' };
    if (!p.birdTeam) return { ok: false, msg: '这名球员没有母队，不能先签后换' };
    const salary = askingPrice(p);
    const payroll = root.Core.payrollOf(toTeam, state.players, state) + salary;
    if (payroll > CAP.apron1) {
      return { ok: false, msg: `${toTeam} 吃下这份合同会越过第一围裙（${root.Core.fmtM(CAP.apron1)}），不能先签后换` };
    }
    const need = Math.round(root.Core.tradeValue(p) * 1.15) + root.Core.pickValue(45, 0) * 0.6;
    return { ok: true, salary, need, team: p.birdTeam, player: p };
  }

  function signAndTrade(state, playerId, toTeam, assets) {
    const d = signTradeDemand(state, playerId, toTeam);
    if (!d.ok) return d;
    const p = d.player;
    const fromTeam = p.birdTeam;
    if (fromTeam === toTeam) return { ok: false, msg: '母队直接续约即可，不需要先签后换' };
    const give = (assets || []).reduce((a, x) => a + assetValue(state, x), 0);
    if (give < d.need) {
      const firsts = (d.need / root.Core.pickValue(15, 0)).toFixed(1);
      return { ok: false, msg: `${fromTeam} 要更多回报：大约相当于 ${firsts} 个中段首轮`, need: d.need, give };
    }
    const years = Math.max(3, 3 + RNG.int(2));
    const salary = d.salary;
    p.team = toTeam; p.salary = salary; p.years = years; p.opt = 0; p.birdTeam = null;
    state.teams[toTeam].hardCap = 'apron1';      // 先签后换的接收方被硬帽
    p.morale = 80; p.noPlayoffs = state.date > `${state.season}-03-01` && state.phase !== 'offseason';
    for (const x of assets || []) {
      if (x.kind === 'pick') { const pk = state.picks.find((q) => q.id === x.id); if (pk) pk.owner = fromTeam; }
      else if (x.kind === 'player') { const q = state.players.find((y) => y.id === x.id); if (q) q.team = fromTeam; }
    }
    const text = `先签后换：${toTeam} 以 ${root.Core.fmtM(salary)} × ${years} 年得到 ${p.name}，${fromTeam} 收回 ${(assets || []).map((x) => x.name).join('、') || '无'}`;
    state.transactions.unshift({ date: state.date, type: '先签后换', text });
    pushInbox(state, { type: 'trade', title: '先签后换完成', body: text });
    return { ok: true, msg: text };
  }

  // ---------------- buyout market ----------------
  // Open after the trade deadline. The player only agrees if he keeps enough of the
  // money; the club can stretch the remaining hit over twice the years plus one.
  function buyoutOpen(state) {
    if (!state.deadline) return false;
    return state.date > state.deadline && state.phase !== 'offseason';
  }

  function remainingMoney(p) {
    return (p.salary || 0) * Math.max(1, p.years || 1);
  }

  function buyoutDemand(state, playerId) {
    const p = state.players.find((x) => x.id === playerId);
    if (!p || !p.team) return { ok: false, msg: '球员不在阵容里' };
    if (!buyoutOpen(state)) return { ok: false, msg: '买断市场在交易截止日后开启' };
    if (p.years <= 0) return { ok: false, msg: '合同已到期' };
    const total = remainingMoney(p);
    // stars want their money; older role players accept a discount to chase a ring
    const keep = root.Core.clamp(0.42 + (p.ovr - 68) * 0.022 + Math.max(0, 30 - p.age) * 0.006, 0.30, 0.95);
    return { ok: true, total, keepRatio: keep, keep: Math.round(total * keep), giveBack: Math.round(total * (1 - keep)), player: p };
  }

  function executeBuyout(state, playerId, opts = {}) {
    const d = buyoutDemand(state, playerId);
    if (!d.ok) return d;
    const p = d.player;
    const team = p.team;
    const keep = Math.round(opts.keep != null ? opts.keep : d.keep);
    if (keep < d.keep) {
      return { ok: false, msg: `${p.name} 不接受：他要保住 ${root.Core.fmtM(d.keep)}（剩余 ${root.Core.fmtM(d.total)}）` };
    }
    const stretch = !!opts.stretch;
    const years = stretch ? Math.max(1, (p.years || 1) * 2 + 1) : Math.max(1, p.years || 1);
    state.teams[team].dead = state.teams[team].dead || [];
    state.teams[team].dead.push({
      amount: Math.round(keep / years), years, from: p.name, note: stretch ? '买断摊薄' : '买断',
    });
    const text = `${team} 买断 ${p.name}，剩余 ${root.Core.fmtM(d.total)} 中支付 ${root.Core.fmtM(keep)}（${stretch ? `摊到 ${years} 年` : `计 ${years} 年`}），球员放弃 ${root.Core.fmtM(d.total - keep)}`;
    state.transactions.unshift({ date: state.date, type: '买断', text });
    p.team = null; p.salary = 0; p.years = 0; p.opt = 0; p.birdTeam = null;
    p.buyoutFrom = team; p.buyoutSeason = state.season; p.waivedAt = state.date;
    p.morale = 55; p.noPlayoffs = false;
    pushInbox(state, { type: 'buyout', title: `买断完成：${p.name}`, body: text });
    return { ok: true, msg: text };
  }

  // AI clubs pick up bought-out veterans after the deadline
  function aiBuyoutMarket(state) {
    if (!buyoutOpen(state)) return;
    const pool = state.players.filter((p) => !p.team && !p.retired && p.buyoutFrom && !p.noPlayoffs);
    if (!pool.length) return;                      // most days there is nobody to sign
    const size = {}, pay = {};
    for (const p of state.players) {
      if (p.retired || !p.team) continue;
      size[p.team] = (size[p.team] || 0) + 1;
      pay[p.team] = (pay[p.team] || 0) + (p.salary || 0);
    }
    for (const t of Object.keys(state.teams)) {
      const dead = (state.teams[t].dead || []).reduce((a, d) => a + (d.amount || 0), 0);
      pay[t] = (pay[t] || 0) + dead;
    }
    for (const p of pool.slice(0, 6)) {
      const teams = RNG.shuffle(Object.keys(state.teams)).filter((t) => t !== p.buyoutFrom);
      for (const t of teams) {
        if ((size[t] || 0) >= 15) continue;
        const ask = Math.round(CAP.min * (1 + Math.max(0, p.ovr - 70) * 0.05));
        if ((pay[t] || 0) + ask > CAP.apron2) continue;
        if (!RNG.chance(0.5)) continue;
        p.team = t; p.salary = Math.max(CAP.min, ask); p.years = 1; p.opt = 0;
        p.noPlayoffs = state.date > `${state.season}-03-01`;
        size[t] = (size[t] || 0) + 1; pay[t] = (pay[t] || 0) + p.salary;
        state.transactions.unshift({ date: state.date, type: '签约', text: `${t} 签下被买断的 ${p.name}（${root.Core.fmtM(p.salary)}）` });
        break;
      }
    }
  }

  // ---------------- AI trade offers ----------------
  function aiTradeOffer(state) {
    const myTeam = state.userTeam;
    const mine = state.players.filter((p) => p.team === myTeam && !p.retired).sort((a, b) => b.ovr - a.ovr);
    if (mine.length < 6) return null;
    const target = mine[1 + RNG.int(3)];
    if (!target || target.ovr < 68) return null;
    const others = Object.keys(state.teams).filter((t) => t !== myTeam);
    const suitor = RNG.pick(others);
    const theirRoster = state.players.filter((p) => p.team === suitor && !p.retired).sort((a, b) => b.ovr - a.ovr);
    if (theirRoster.length < 6) return null;
    const pieces = theirRoster.filter((p) => Math.abs(p.ovr - target.ovr) < 8).slice(0, 3);
    if (!pieces.length) return null;
    return { from: suitor, to: myTeam, want: target.id, offer: pieces.map((p) => p.id) };
  }

  // ---------------- player conversations ----------------
  const TALK_COOLDOWN = 10;

  function canTalk(state, p) {
    if (!p || p.team !== state.userTeam) return { ok: false, msg: '不在你的球队' };
    if (p.promise) return { ok: false, msg: '他还有一个未兑现的承诺，先兑现再说' };
    if (p.lastTalk) {
      const gap = root.League.diffDays(p.lastTalk, state.date);
      if (gap < TALK_COOLDOWN) return { ok: false, msg: `${TALK_COOLDOWN - gap} 天后才能再找他谈` };
    }
    return { ok: true };
  }

  function promisePlan(state, p, type) {
    const roster = state.players.filter((x) => x.team === p.team && !x.retired);
    const recent = (p.recent || []).slice(-6);
    const avgMin = recent.length ? recent.reduce((a, b) => a + b.min, 0) / recent.length : 0;
    const avgUsg = recent.length ? recent.reduce((a, b) => a + b.usg, 0) / recent.length : 0;
    if (type === 'minutes') {
      const target = Math.min(36, Math.max(root.Core.expectedMinutes(p, roster) + 2, avgMin + 2));
      return { type, target, until: root.League.addDays(state.date, 20), label: `场均 ${target.toFixed(0)} 分钟`, stat: 'minutes' };
    }
    if (type === 'usage') {
      const target = Math.min(0.32, Math.max(root.Core.expectedUsage(p) + 0.03, avgUsg + 0.03));
      return { type, target, until: root.League.addDays(state.date, 20), label: `球权占比 ${(target * 100).toFixed(0)}%`, stat: 'usage' };
    }
    return { type: 'trade', target: null, until: root.League.addDays(state.date, 25), label: '25 天内送走他', stat: null };
  }

  function talk(state, playerId, type) {
    const p = state.players.find((x) => x.id === playerId);
    const gate = canTalk(state, p);
    if (!gate.ok) return gate;
    const morale = p.morale == null ? 70 : p.morale;

    if (type === 'soothe') {
      const boost = 3 + Math.max(0, 60 - morale) * 0.12;
      p.moraleMod = Math.min(10, (p.moraleMod || 0) + boost);
      p.lastTalk = state.date;
      p.morale = root.Core.clamp((p.morale || 70) + Math.round(boost), 0, 100);
      state.transactions.unshift({ date: state.date, type: '谈话', text: `${p.name}：安抚（士气 +${boost.toFixed(0)}）` });
      return { ok: true, msg: `你私下聊了聊，${p.name} 的情绪缓和了一些（士气 +${boost.toFixed(0)}）。` };
    }

    const plan = promisePlan(state, p, type);
    p.promise = plan;
    p.lastTalk = state.date;
    p.moraleMod = Math.min(10, (p.moraleMod || 0) + 2);
    state.transactions.unshift({ date: state.date, type: '谈话', text: `${p.name}：承诺${plan.label}` });
    return { ok: true, msg: `你承诺了「${plan.label}」，${plan.until} 前评估。` };
  }

  function checkPromises(state) {
    for (const p of state.players) {
      const pr = p.promise;
      if (!pr) continue;
      if (pr.type === 'trade') {
        if (p.team !== state.userTeam) {
          p.promise = null;
          p.moraleMod = Math.min(10, (p.moraleMod || 0) + 8);
          pushInbox(state, { type: 'promise', title: `承诺兑现：已送走 ${p.name}`, body: '他得到了想要的去处。' });
          continue;
        }
        if (state.date > pr.until) {
          p.promise = null;
          p.moraleMod = Math.max(-15, (p.moraleMod || 0) - 15);
          if (p.morale < 40) p.tradeRequest = true;
          pushInbox(state, { type: 'promise', title: `承诺未兑现：${p.name}`, body: '你答应送走他，但截止日过了还没有交易。士气大幅下降。' });
        }
        continue;
      }
      const recent = (p.recent || []).slice(-6);
      if (recent.length >= 3) {
        const avg = recent.reduce((a, b) => a + (pr.stat === 'minutes' ? b.min : b.usg), 0) / recent.length;
        if (avg >= pr.target) {
          p.promise = null;
          p.moraleMod = Math.min(10, (p.moraleMod || 0) + 10);
          p.trust = (p.trust || 0) + 5;
          pushInbox(state, { type: 'promise', title: `承诺兑现：${p.name}`, body: `他拿到了「${pr.label}」，士气大涨。` });
          continue;
        }
      }
      if (state.date > pr.until) {
        p.promise = null;
        p.moraleMod = Math.max(-15, (p.moraleMod || 0) - 12);
        p.trust = (p.trust || 0) - 8;
        const recentLow = (p.morale || 70) < 45;
        if (recentLow || p.trust < -10) p.tradeRequest = true;
        pushInbox(state, { type: 'promise', title: `承诺未兑现：${p.name}`, body: `你答应过「${pr.label}」，但没做到。士气下降，信任受损。` });
      }
    }
  }

  // ---------------- trade window ----------------
  function setDeadline(state) {
    state.deadline = `${state.season - 1}-02-05`;
  }

  function tradeBlocked(state) {
    if (state.phase === 'playoffs') return true;
    if (state.phase === 'regular' && state.deadline && state.date > state.deadline) return true;
    return false;
  }

  function daysToDeadline(state) {
    if (!state.deadline) return 0;
    return root.League.diffDays(state.date, state.deadline);
  }

  function rosterNeed(teamAbbr, players) {
    const roster = players.filter((p) => p.team === teamAbbr && !p.retired).sort((a, b) => b.ovr - a.ovr);
    const byPos = {};
    for (const pos of ['PG', 'SG', 'SF', 'PF', 'C']) byPos[pos] = roster.filter((p) => p.pos === pos);
    const weakest = ['PG', 'SG', 'SF', 'PF', 'C']
      .map((pos) => ({ pos, top: byPos[pos][0] ? byPos[pos][0].ovr : 0, n: byPos[pos].length }))
      .sort((a, b) => (a.top + a.n * 3) - (b.top + b.n * 3))[0];
    return weakest.pos;
  }

  function pruneOffers(state) {
    if (!state.offers) { state.offers = []; return; }
    state.offers = state.offers.filter((o) => !o.expires || o.expires >= state.date);
  }

  function buildOffer(state) {
    if (tradeBlocked(state)) return null;
    pruneOffers(state);
    if ((state.offers || []).length >= 2) return null;
    const toDeadline = daysToDeadline(state);
    const pressure = toDeadline >= 0 && toDeadline <= 10 ? 0.6 : 0.24;
    if (!RNG.chance(pressure)) return null;

    const mine = state.players.filter((p) => p.team === state.userTeam && !p.retired).sort((a, b) => b.ovr - a.ovr);
    if (mine.length < 7) return null;
    // teams rarely build a mid-season deal around a max contract; target the 2nd-7th man
    const targets = mine.slice(1, 8).filter((p) => {
      if (p.ovr < 62 || (p.salary || 0) > 32000000) return false;
      // AI won't chase bad money: skip players whose deal is far below market value
      const density = root.Core.tradeValue(p) / Math.max(150, root.Core.marketSalary(p.ovr) / 60000);
      return density > 1.2;
    });
    if (!targets.length) return null;
    const target = RNG.pick(targets);

    const suitors = Object.keys(state.teams).filter((t) => t !== state.userTeam);
    const suitor = RNG.pick(suitors);
    const theirRoster = state.players.filter((p) => p.team === suitor && !p.retired);
    if (theirRoster.length < 6) return null;
    if (rosterNeed(suitor, state.players) !== target.pos && !RNG.chance(0.55)) return null;

    const targetValue = root.Core.tradeValue(target);
    const targetSal = target.salary || 0;
    const suitorPayroll = root.Core.payrollOf(suitor, state.players, state);
    const suitorRoom = CAP.cap - suitorPayroll;
    const takeBackMax = targetSal * 1.25 + 100000;

    // both sides must satisfy the 125% rule, so the package total has a legal band
    const lo = Math.max(CAP.min * 0.85, targetSal / 1.25 - 100000);
    const hi = targetSal * 1.25 + 100000;
    const pool = theirRoster
      .filter((p) => (p.salary || 0) >= lo * 0.7 && (p.salary || 0) <= hi)
      .map((p) => ({ p, gap: Math.abs(root.Core.tradeValue(p) - targetValue) }))
      .sort((a, b) => a.gap - b.gap)
      .map((x) => x.p);
    if (!pool.length) return null;

    let give = [];
    const single = pool.find((p) => (p.salary || 0) >= lo && (p.salary || 0) <= hi);
    if (single) give = [single];
    else {
      for (const p of pool) {
        const comp = pool.find((q) => q !== p &&
          (p.salary || 0) + (q.salary || 0) >= lo &&
          (p.salary || 0) + (q.salary || 0) <= hi);
        if (comp) { give = [p, comp]; break; }
      }
    }
    if (!give.length) return null;

    let giveSal = give.reduce((a, p) => a + (p.salary || 0), 0);
    let giveValue0 = give.reduce((a, p) => a + root.Core.tradeValue(p), 0);

    let giveValue = giveValue0;
    const pick = state.picks.find((p) => p.owner === suitor && !p.used && p.year <= state.season + 2);
    if (pick && giveValue < targetValue * 0.95 && RNG.chance(0.6)) {
      giveValue += root.Core.pickValue(pickSlot(state, pick));
      give.push({ id: pick.id, kind: 'pick', year: pick.year, round: pick.round, name: `${pick.year} ${pick.round}轮` });
    }
    if (giveValue < targetValue * 0.7) return null;
    if (giveValue > targetValue * 1.8) return null;

    // the authoritative test: the same salary-matching rule execution will apply
    const legal = tradeLegal(state, state.userTeam, suitor,
      [{ kind: 'player', id: target.id, salary: targetSal }],
      give.map((p) => ({ kind: 'player', id: p.id, salary: p.salary || 0 })));
    if (!legal.ok) return null;

    return {
      id: `o${Math.floor(RNG.next() * 1e9)}`,
      date: state.date,
      from: suitor,
      to: state.userTeam,
      target: { kind: 'player', id: target.id, name: target.name, salary: targetSal, ovr: target.ovr },
      give: give.map((p) => (p.kind === 'pick'
        ? { kind: 'pick', id: p.id, name: p.name, year: p.year, round: p.round }
        : { kind: 'player', id: p.id, name: p.name, salary: p.salary, ovr: p.ovr })),
      ratio: giveValue / Math.max(1, targetValue),
      expires: state.deadline && root.League.addDays(state.date, 7) > state.deadline ? state.deadline : root.League.addDays(state.date, 7),
    };
  }

  function pushOffer(state) {
    const off = buildOffer(state);
    if (!off) return null;
    state.offers = state.offers || [];
    state.offers.push(off);
    const txt = off.give.map((x) => x.name).join(' + ');
    pushInbox(state, {
      type: 'offer',
      title: `${state.teams[off.from].abbr} 报价：想要 ${off.target.name}`,
      body: `对方送出 ${txt}，换 ${off.target.name}（${off.target.ovr}）。${off.ratio >= 0.9 ? '报价很有诚意。' : '报价偏低。'}`,
      offerId: off.id,
    });
    return off;
  }

  function acceptOffer(state, offerId) {
    const off = (state.offers || []).find((o) => o.id === offerId);
    if (!off) return { ok: false, msg: '报价已失效' };
    if (tradeBlocked(state)) return { ok: false, msg: '交易窗口已关闭' };
    const outA = [off.target];
    const outB = off.give;
    const legal = executeTrade(state, state.userTeam, off.from, outA, outB);
    if (!legal.ok) return legal;
    state.offers = state.offers.filter((o) => o.id !== offerId);
    return { ok: true };
  }

  function rejectOffer(state, offerId) {
    state.offers = (state.offers || []).filter((o) => o.id !== offerId);
    return { ok: true };
  }

  // a few AI-to-AI deals on deadline day so the league feels alive
  function deadlineDayDeals(state) {
    const done = [];
    state.offers = [];   // anything unsigned dies with the window
    const teams = Object.keys(state.teams);
    for (let attempt = 0; attempt < 120 && done.length < 3; attempt++) {
      const a = RNG.pick(teams);
      const b = RNG.pick(teams);
      if (a === b) continue;
      const pa = RNG.pick(state.players.filter((p) => p.team === a && !p.retired && p.ovr >= 62 && p.ovr <= 84));
      const pb = RNG.pick(state.players.filter((p) => p.team === b && !p.retired && p.ovr >= 62 && p.ovr <= 84));
      if (!pa || !pb) continue;
      if (pa.salary > pb.salary * 1.25 + 100000 || pb.salary > pa.salary * 1.25 + 100000) continue;
      const va = root.Core.tradeValue(pa), vb = root.Core.tradeValue(pb);
      if (Math.abs(va - vb) / Math.max(va, vb) > 0.18) continue;
      const r = executeTrade(state, a, b,
        [{ kind: 'player', id: pa.id, name: pa.name, salary: pa.salary }],
        [{ kind: 'player', id: pb.id, name: pb.name, salary: pb.salary }], { force: true });
      if (r.ok) done.push(`${a} 送出 ${pa.name} 换 ${b} 的 ${pb.name}`);
    }
    return done;
  }

  // ---------------- new season ----------------
  function startNewSeason(state) {
    state.players.forEach((p) => { if (!p.retired) p.ovrStart = p.ovr; });
    state.seasonLog = [];
    if (root.Office && root.Office.tickStaff) tickStaff(state);
    if (root.Office && root.Office.refreshStaffMarket) refreshStaffMarket(state, true);
    // 1) player options resolve first, so the roster math below is final
    for (const p of state.players) {
      if (p.opt === 1 && p.years === 1) { p.team = null; p.salary = 0; p.years = 0; p.opt = 0; }
    }
    // 2) trim over 15
    for (const abbr of Object.keys(state.teams)) {
      const roster = state.players.filter((p) => p.team === abbr && !p.retired).sort((a, b) => a.ovr - b.ovr);
      let guard = 0;
      while (roster.length > 15 && guard++ < 30) {
        const cut = roster.shift();
        cut.team = null; cut.salary = 0; cut.years = 0; cut.opt = 0;
        state.transactions.unshift({ date: state.date, type: '裁员', text: `${abbr} 裁掉 ${cut.name}` });
        if (abbr === state.userTeam) pushInbox(state, { type: 'cut', title: `阵容超编，已裁掉 ${cut.name}`, body: '新赛季名单上限 15 人。' });
      }
    }
    // 3) fill thin rosters with minimum deals
    for (const abbr of Object.keys(state.teams)) {
      const target = abbr === state.userTeam ? 13 : 14;
      const roster = state.players.filter((p) => p.team === abbr && !p.retired);
      let guard = 0;
      while (roster.length < target && guard++ < 40) {
        const p = listFreeAgents(state)[0];
        if (!p) break;
        p.team = abbr; p.salary = CAP.min; p.years = 1; p.opt = 0;
        roster.push(p);
        state.transactions.unshift({ date: state.date, type: '签约', text: `${abbr} 底薪签下 ${p.name}` });
      }
    }
    for (const p of state.players) { if (!p.team) p.birdTeam = null; }
    state.season += 1;
    state.phase = 'regular';
    state.date = `${state.season - 1}-10-20`;
    setDeadline(state);
    state.offers = [];
    state.playoffs = null;
    state.off = null;
    state.games = root.League.buildSchedule(Object.values(state.teams).map((t) => ({ ...t, abbr: t.abbr })), state.date);
    Object.values(state.teams).forEach((t) => { t.wins = 0; t.losses = 0; t.pf = 0; t.pa = 0; t.streak = 0; });
    state.players.forEach((p) => {
      p.st = { gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 };
    });
    // keep the talent pool from inflating forever: unsigned veterans drift out
    const active = state.players.filter((p) => !p.retired);
    const excess = Math.max(0, active.length - 575);
    if (excess > 0) {
      const unsigned = active.filter((p) => !p.team).sort((a, b) => a.ovr - b.ovr);
      unsigned.slice(0, excess).forEach((p) => { p.retired = true; });
    }
    pushInbox(state, { type: 'season', title: `${state.season - 1}-${String(state.season).slice(2)} 赛季开始`, body: '新赛季揭幕战。' });
  }

  root.Office = {
    finishSeason, makeDraftClass, draftOrder, runDraft, listFreeAgents, askingPrice,
    signPlayer, aiFreeAgency, tradeLegal, evaluateTrade, executeTrade, assetValue,
    aiTradeOffer, startNewSeason, pushInbox,
    setDeadline, tradeBlocked, daysToDeadline, pruneOffers, draftSlot, draftBoard, pickAssetValue,
    openNegotiation, raiseOffer, withdrawOffer, tickNegotiations, negoFor, rivalPool,
    writeStory, localizeTx,
    staffMarket, refreshStaffMarket, hireStaff, renewStaff, releaseStaff, tickStaff,
    signTradeDemand, signAndTrade, buyoutOpen, buyoutDemand, executeBuyout, aiBuyoutMarket, findTpe,
    canTalk, talk, checkPromises, promisePlan, buildOffer, pushOffer, acceptOffer, rejectOffer, deadlineDayDeals,
  };
})(typeof window !== 'undefined' ? window : globalThis);
