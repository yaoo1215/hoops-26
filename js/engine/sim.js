/* Game simulation: possession-based, produces box score + play-by-play. */
(function (root) {
  'use strict';
  const { RNG, clamp, mean } = root.Core;

  // Calibrated against 2025-26 league averages (see tools/calibrate.mjs).
  const TUNE = {
    rimPct: 0.676, midPct: 0.432, threePct: 0.350,
    tovRate: 0.127, orbRate: 0.245,
    homeAdv: 0.021,
    foulRim: 0.232, foulMid: 0.072, foulThree: 0.038, andOne: 0.075,
    actionWeights: { transition: 0.115, pnr: 0.185, iso: 0.135, post: 0.085, spot: 0.255, cut: 0.125, offscreen: 0.10 },
    shotMix: {
      transition: { rim: 0.60, mid: 0.02, three: 0.38 },
      pnr: { rim: 0.38, mid: 0.26, three: 0.36 },
      iso: { rim: 0.26, mid: 0.44, three: 0.30 },
      post: { rim: 0.74, mid: 0.24, three: 0.02 },
      spot: { rim: 0.05, mid: 0.20, three: 0.75 },
      cut: { rim: 0.86, mid: 0.13, three: 0.01 },
      offscreen: { rim: 0.10, mid: 0.38, three: 0.52 },
    },
  };

  const POS_BIG = { PF: 1, C: 1 };
  const isOut = (p) => (root.Injury ? root.Injury.isOut(p) : !!p.injDays);
  const POS_IDX = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };

  function usageWeight(p) {
    const scoring = 0.42 * (p.ins || 55) + 0.36 * (p.three || 50) + 0.22 * (p.mid || 50);
    const star = Math.pow(Math.max(2, root.Core.effOvr(p) - 46), 1.28);
    // how much of the offense runs through him: shot-making and creation, not defense
    return star * (0.52 + scoring / 190 + (p.handle || 50) / 420) * (1 + (p.usageBias || 0));
  }

  function buildContext(teamAbbr, players, tactics, isHome, teamState) {
    let roster = players.filter((p) => p.team === teamAbbr && !p.retired && !isOut(p) && !p.restNextGame);
    // never let rest flags make a team unplayable
    if (roster.length < 5) roster = players.filter((p) => p.team === teamAbbr && !p.retired && !isOut(p));
    if (roster.length < 5) {
      // emergency: dress the least-injured bodies rather than deadlock the season
      const hurt = players.filter((p) => p.team === teamAbbr && !p.retired)
        .sort((a, b) => (a.injDays || 0) - (b.injDays || 0));
      hurt.slice(0, 5 - roster.length).forEach((p) => { p.injDays = 0; });
      roster = players.filter((p) => p.team === teamAbbr && !p.retired);
    }
    if (roster.length < 5) return null;
    const minutes = root.Core.rotation(roster, tactics, { manual: teamState && teamState.rotation });
    const chem = teamState && teamState.chemistry != null ? teamState.chemistry : 70;
    // the coach's system is folded into the tactics the engine actually runs
    const t = root.Staff ? root.Staff.tacticsFor(teamState && teamState.coach, tactics) : (tactics || {});
    if (root.Staff && teamState && teamState.coach) {
      t.coachOff = root.Staff.coachOff(teamState.coach);
      t.coachDef = root.Staff.coachDef(teamState.coach);
    }
    const five0 = root.Core.bestFive([...minutes.keys()], (p) => (minutes.get(p) || 0) * 0.02);
    const r = root.Core.lineupRating(five0, t);
    const wUsage = roster.map((p) => ({ p, w: usageWeight(p) }));
    const tw = wUsage.reduce((a, x) => a + x.w, 0);
    wUsage.forEach((x) => { x.p.usage = x.w / tw; });
    // shot share: stars take a bigger but bounded slice of the pie
    const shareRaw = roster.map((p) => Math.pow(Math.max(2, p.ovr - 45), 1.40));
    const shareSum = shareRaw.reduce((a, b) => a + b, 0);
    roster.forEach((p, i) => { p.share = shareRaw[i] / shareSum; });
    return {
      team: teamAbbr, roster, minutes, tactics: t,
      off: r.off, def: r.def, reb: r.reb, pace: r.pace,
      isHome, usage: wUsage, chemMul: 0.975 + (chem / 100) * 0.05,
    };
  }

  function pickWeighted(list, weightFn) {
    let total = 0;
    for (const x of list) total += weightFn(x);
    if (total <= 0) return list[0];
    let r = RNG.next() * total;
    for (const x of list) { r -= weightFn(x); if (r <= 0) return x; }
    return list[list.length - 1];
  }

  function pickAction(t) {
    const w = { ...TUNE.actionWeights };
    const bias = t.threeBias || 0;
    w.spot *= 1 + bias * 0.18;
    w.offscreen *= 1 + bias * 0.12;
    w.post *= 1 - bias * 0.10;
    w.iso += (t.isoBias || 0) * 0.05;
    const ab = t.actionBias || {};
    for (const k of Object.keys(ab)) {
      if (w[k] != null) w[k] = Math.max(0.01, w[k] * (1 + ab[k]));
    }
    const keys = Object.keys(w);
    return pickWeighted(keys, (k) => w[k]);
  }

  function chooseShooter(ctx, action, five, clutch) {
    let skill;
    switch (action) {
      case 'spot': skill = (p) => p.three || 40; break;
      case 'offscreen': skill = (p) => 0.6 * (p.three || 40) + 0.4 * (p.mid || 40); break;
      case 'post': skill = (p) => 0.75 * (p.ins || 40) + 0.25 * (p.str || 40) + (p.h - 79) * 1.4; break;
      case 'pnr': skill = (p) => 0.45 * (p.handle || 40) + 0.3 * (p.pass || 40) + 0.25 * (p.three || 40); break;
      case 'iso': skill = (p) => 0.55 * (p.handle || 40) + 0.45 * (p.mid || 40); break;
      case 'cut': skill = (p) => 0.65 * (p.ins || 40) + 0.35 * (p.spd || 40); break;
      default: skill = (p) => 0.6 * (p.spd || 40) + 0.4 * (p.ins || 40);
    }
    if (clutch) {
      // the ball finds the best player: share matters much more than it does in a
      // normal possession, and the star's rating adds on top of it
      const star = (p) => 0.62 + Math.max(0, (root.Core.effOvr(p) - 58) / 46);
      return pickWeighted(five, (p) => Math.pow(p.share || 0.1, 0.30) * star(p) * (0.86 + (skill(p) / 99) * 0.28));
    }
    return pickWeighted(five, (p) => Math.pow(p.share || 0.1, 0.55) * (0.82 + (skill(p) / 99) * 0.36));
  }

  function chooseDefender(defCtx, five, action, shotType) {
    const guards = five.filter((p) => p.pos === 'PG' || p.pos === 'SG');
    const bigs = five.filter((p) => p.pos === 'PF' || p.pos === 'C');
    if (shotType === 'three' || action === 'pnr' || action === 'iso') {
      const pool = guards.length ? guards : five;
      return pickWeighted(pool, (p) => (p.pdef || 50) ** 1.4);
    }
    const pool = bigs.length ? bigs : five;
    return pickWeighted(pool, (p) => ((p.idef || 50) * 1.2 + (p.h - 78) * 3) ** 1.2);
  }

  function createSession(state, homeAbbr, awayAbbr, opts = {}) {
    const tacticsFor = (abbr) => (state.teams[abbr] && state.teams[abbr].tactics) || {};
    const H = buildContext(homeAbbr, state.players, tacticsFor(homeAbbr), true, state.teams[homeAbbr]);
    const A = buildContext(awayAbbr, state.players, tacticsFor(awayAbbr), false, state.teams[awayAbbr]);
    if (!H || !A) return null;

    const box = {};
    const ensure = (p) => (box[p.id] ||= {
      id: p.id, name: p.name, pos: p.pos, team: p.team,
      min: 0, pts: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
      fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pm: 0,
    });
    [...H.roster, ...A.roster].forEach(ensure);

    const onCourt = { [homeAbbr]: [], [awayAbbr]: [] };
    const secs = {};
    const hot = {};
    [...H.roster, ...A.roster].forEach((p) => { secs[p.id] = 0; hot[p.id] = 0; });

    const events = [];
    const qScores = { home: [], away: [] };
    const totals = {
      [homeAbbr]: { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, oreb: 0, tov: 0, pf: 0, stl: 0, blk: 0, pts: 0 },
      [awayAbbr]: { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, oreb: 0, tov: 0, pf: 0, stl: 0, blk: 0, pts: 0 },
    };

    const ctxOf = (abbr) => (abbr === homeAbbr ? H : A);
    const oppOf = (abbr) => (abbr === homeAbbr ? A : H);
    const score = { [homeAbbr]: 0, [awayAbbr]: 0 };

    const planned = (ctx) => [...ctx.minutes.keys()];

    // one player per position, ordered PG..C, weighted by the minutes still owed
    function pickFive(ctx, pool) {
      const remain = (p) => Math.max(0, (ctx.minutes.get(p) || 0) - secs[p.id] / 60);
      const list = (pool && pool.length ? pool : planned(ctx));
      const five = root.Core.bestFive(list, (p) => remain(p) * 1.4);
      return five.length === 5 ? five : list.slice(0, 5);
    }

    function remainingFive(ctx) { return pickFive(ctx); }
    function freshFive(ctx) { return pickFive(ctx); }

    // substitution: keep the five with the most remaining planned minutes
    // a coach can pin the five he wants on the floor between quarters
    const forced = { [homeAbbr]: null, [awayAbbr]: null };
    // watching a game means the coach (you) decides who plays; skipping means the
    // rotation does it. Auto-sub can be switched back on from the live panel.
    const autoSub = { [homeAbbr]: opts.autoSub !== false, [awayAbbr]: true };

    function pinnedFive(abbr) {
      const ids = forced[abbr];
      if (!ids || !ids.length) return null;
      const ctx = ctxOf(abbr);
      const five = ids.map((id) => ctx.roster.find((p) => p.id === id)).filter((p) => p && !isOut(p) && box[p.id].pf < 5);
      return five.length === 5 ? five : null;
    }

    function substitute(abbr) {
      const ctx = ctxOf(abbr);
      const five = onCourt[abbr];
      const remain = (p) => (ctx.minutes.get(p) || 0) - secs[p.id] / 60;
      const pool = [...ctx.minutes.keys()].sort((a, b) => remain(b) - remain(a));
      const next = pinnedFive(abbr) || pickFive(ctx, pool);
      // players in foul trouble sit
      const fixed = next.map((p) => (box[p.id].pf >= 5 ? pool.find((q) => !next.includes(q) && box[q.id].pf < 5) || p : p));
      onCourt[abbr] = fixed;
      return five.filter((p) => !fixed.includes(p));
    }

    function foulOut(abbr) {
      const five = onCourt[abbr];
      const bad = five.filter((p) => box[p.id].pf >= 6);
      if (!bad.length) return;
      const ctx = ctxOf(abbr);
      const pool = [...ctx.minutes.keys()].filter((p) => !five.includes(p) && !isOut(p) && box[p.id].pf < 6);
      for (const p of bad) {
        const rep = pool.sort((a, b) => (b.ovr || 0) - (a.ovr || 0))[0];
        if (!rep) break;
        onCourt[abbr] = onCourt[abbr].map((x) => (x === p ? rep : x));
        pool.splice(pool.indexOf(rep), 1);
        hot[rep.id] = 0;
      }
    }

    function award(abbr, pts) {
      score[abbr] += pts;
      const other = abbr === homeAbbr ? awayAbbr : homeAbbr;
      onCourt[abbr].forEach((p) => { box[p.id].pm += pts; });
      onCourt[other].forEach((p) => { box[p.id].pm -= pts; });
    }

    function addTime(abbr, seconds) {
      onCourt[abbr].forEach((p) => { secs[p.id] += seconds; });
    }

    function resolve(offAbbr, defAbbr, q, clock, clutch) {
      const off = ctxOf(offAbbr), def = ctxOf(defAbbr);
      const five = onCourt[offAbbr], dfive = onCourt[defAbbr];
      const oStats = totals[offAbbr], dStats = totals[defAbbr];

      // turnovers: four flavours, so the play-by-play reads like basketball
      const tovP = TUNE.tovRate * (1 + (0.5 - off.off / 130) * 0.55);
      if (RNG.chance(tovP)) {
        const handler = pickWeighted(five, (p) => (p.handle || 50) ** 1.3 * (p.usage * 30 + 1));
        const roll = RNG.next();
        const kind = roll < 0.45 ? 'badpass' : roll < 0.65 ? 'lostball' : roll < 0.85 ? 'offfoul' : 'travel';
        box[handler.id].tov++; oStats.tov++;
        let thief = null;
        if (kind === 'badpass' || (kind === 'lostball' && RNG.chance(0.7))) {
          thief = pickWeighted(dfive, (p) => (p.pdef || 50) ** 1.8 * (kind === 'badpass' ? (p.diq || 50) : (p.spd || 50)));
          if (thief) { box[thief.id].stl++; dStats.stl++; }
        } else {
          // offensive foul / travel: a whistle, a personal foul, no steal
          box[handler.id].pf++; oStats.pf++; dStats.pf++;
        }
        events.push({ q, clock, team: offAbbr, action: 'turnover', kind, pid: handler.id, made: false, pts: 0, steal: thief ? thief.id : null });
        return 0;
      }

      let action = pickAction(off.tactics);
      // last three minutes, one-possession game: clear out and let the star go to work
      if (clutch && RNG.chance(0.36)) action = RNG.chance(0.7) ? 'iso' : 'pnr';
      const shooter = chooseShooter(off, action, five, clutch);
      const mix = TUNE.shotMix[action];
      const shotType = pickWeighted(['rim', 'mid', 'three'], (k) => mix[k]);

      // shooting foul before the shot
      const foulP = shotType === 'rim' ? TUNE.foulRim : shotType === 'three' ? TUNE.foulThree : TUNE.foulMid;
      if (RNG.chance(foulP)) {
        const ftN = shotType === 'three' ? 3 : 2;
        const ftPct = clamp(0.60 + ((shooter.ft || 70) - 70) * 0.006, 0.42, 0.94);
        let made = 0;
        for (let i = 0; i < ftN; i++) if (RNG.chance(ftPct)) made++;
        box[shooter.id].ftm += made; box[shooter.id].fta += ftN; box[shooter.id].pts += made;
        oStats.ftm += made; oStats.fta += ftN; oStats.pts += made;
        award(offAbbr, made);
        const df = chooseDefender(def, dfive, action, shotType);
        box[df.id].pf++; dStats.pf++;
        events.push({ q, clock, team: offAbbr, action: 'foul', kind: 'shooting', pid: shooter.id, made: made > 0, pts: made, ft: true });
        return made;
      }

      const skill = shotType === 'rim' ? shooter.ins : shotType === 'mid' ? shooter.mid : shooter.three;
      const defender = chooseDefender(def, dfive, action, shotType);
      const defSkill = shotType === 'rim' ? defender.idef : shotType === 'mid' ? (defender.pdef * 0.5 + defender.idef * 0.5) : defender.pdef;
      const base = shotType === 'rim' ? TUNE.rimPct : shotType === 'mid' ? TUNE.midPct : TUNE.threePct;

      const skillMul = 0.80 + 0.42 * ((skill || 60) / 99);
      const defMul = 1.075 - 0.185 * ((defSkill || 60) / 99);
      const fatigue = Math.max(0, (secs[shooter.id] / 60 - 30) / 60) * 0.012 + Math.max(0, (shooter.fatigue || 0) - 40) / 60 * 0.09;
      const hotMul = (1 + (hot[shooter.id] || 0) * 0.004) * (1 + (shooter.form || 0) * 0.0075);
      const homeMul = off.isHome ? 1 + TUNE.homeAdv : 1 - TUNE.homeAdv * 0.55;
      const teamMul = (0.72 + 0.28 * (off.off / def.def)) * (off.chemMul || 1);

      let pct = base * skillMul * defMul * teamMul * (1 - fatigue) * hotMul * homeMul;
      pct = clamp(pct, 0.10, 0.86);

      const blockP = shotType === 'rim' ? 0.175 : shotType === 'mid' ? 0.026 : 0.002;
      const blocked = RNG.chance(blockP * (defSkill / 68));
      const made = !blocked && RNG.chance(pct);

      box[shooter.id].fga++;
      if (shotType === 'three') { box[shooter.id].tpa++; oStats.tpa++; } else oStats.fga2 = (oStats.fga2 || 0) + 1;
      oStats.fga++;
      if (blocked) { const df = chooseDefender(def, dfive, action, shotType); box[df.id].blk++; dStats.blk++; }

      let pts = 0;
      if (made) {
        pts = shotType === 'three' ? 3 : 2;
        box[shooter.id].fgm++; box[shooter.id].pts += pts;
        if (shotType === 'three') { box[shooter.id].tpm++; oStats.tpm++; }
        oStats.fgm++; oStats.pts += pts;
        award(offAbbr, pts);
        hot[shooter.id] = clamp((hot[shooter.id] || 0) + 1, -2, 4);
        // assist
        let passer = null;
        if (RNG.chance(shotType === 'three' ? 0.90 : 0.63)) {
          passer = pickWeighted(five.filter((p) => p !== shooter), (p) => (p.pass || 50) ** 2.2 * (p.usage * 25 + 0.4));
          if (passer) { box[passer.id].ast++; oStats.ast = (oStats.ast || 0) + 1; }
        }
        events.push({ q, clock, team: offAbbr, action: 'make', play: action, pid: shooter.id, made: true, pts, shot: shotType, ast: passer ? passer.id : null, clutch: !!clutch });
        return pts;
      }
      hot[shooter.id] = clamp((hot[shooter.id] || 0) - 1, -2, 4);

      // rebound
      const offRebW = five.reduce((a, p) => a + (p.reb || 50) ** 1.6, 0);
      const defRebW = dfive.reduce((a, p) => a + (p.reb || 50) ** 1.6, 0);
      const orbP = clamp(TUNE.orbRate * Math.pow(offRebW / Math.max(1, defRebW), 0.75), 0.07, 0.46);
      if (RNG.chance(orbP)) {
        const reb = pickWeighted(five, (p) => (p.reb || 50) ** 1.8);
        box[reb.id].reb++; box[reb.id].oreb++; oStats.reb++; oStats.oreb++;
        // second chance always produces another attempt
        const putback = RNG.chance(0.5);
        const t2 = putback ? 'rim' : 'three';
        const sh2 = putback
          ? pickWeighted(five, (p) => (p.ins || 50) ** 1.6 * (p.h > 80 ? 1.6 : 1))
          : pickWeighted(five, (p) => (p.three || 40) ** 1.8);
        const df2 = chooseDefender(def, dfive, 'cut', t2);
        const defSkill2 = t2 === 'rim' ? df2.idef : df2.pdef;
        const base2 = t2 === 'rim' ? TUNE.rimPct + 0.03 : TUNE.threePct - 0.01;
        const p2 = clamp(base2 * (0.80 + 0.42 * ((t2 === 'rim' ? sh2.ins : sh2.three) || 60) / 99) *
          (1.075 - 0.185 * ((defSkill2 || 60) / 99)) * (0.72 + 0.28 * (off.off / def.def)), 0.12, 0.82);
        const m2 = RNG.chance(p2);
        box[sh2.id].fga++;
        if (t2 === 'three') { box[sh2.id].tpa++; oStats.tpa++; } else oStats.fga2 = (oStats.fga2 || 0) + 1;
        oStats.fga++;
        if (m2) {
          const pts2 = t2 === 'three' ? 3 : 2;
          box[sh2.id].fgm++; box[sh2.id].pts += pts2;
          if (t2 === 'three') { box[sh2.id].tpm++; oStats.tpm++; }
          oStats.fgm++; oStats.pts += pts2; award(offAbbr, pts2);
          events.push({ q, clock, team: offAbbr, action: 'secondChance', pid: sh2.id, made: true, pts: pts2, shot: t2, oreb: reb.id });
          return pts2;
        }
        events.push({ q, clock, team: offAbbr, action: 'secondChanceMiss', pid: sh2.id, made: false, pts: 0, shot: t2, oreb: reb.id });
        return 0;
      }
      const dreb = pickWeighted(dfive, (p) => (p.reb || 50) ** 1.8);
      box[dreb.id].reb++; dStats.reb++;
      events.push({ q, clock, team: offAbbr, action: 'miss', play: action, pid: shooter.id, made: false, pts: 0, shot: shotType, reb: dreb.id, clutch: !!clutch });
      return 0;
    }

    // tip off
    const tipWinner = RNG.chance(0.5) ? homeAbbr : awayAbbr;
    let firstOff = tipWinner;

    const quarters = opts.quarters || 4;
    let q = 0;
    let finished = false;

    let clock = 0;
    let offNow = null;
    let nextSub = 0;
    const pending = { [homeAbbr]: null, [awayAbbr]: null };

    // a coach queues a five; it goes on at the next dead ball (possession boundary)
    function applyPending(abbr) {
      const ids = pending[abbr];
      if (!ids) return;
      pending[abbr] = null;
      const ctx = ctxOf(abbr);
      const five = ids.map((id) => ctx.roster.find((p) => p.id === id)).filter((p) => p && !isOut(p) && box[p.id].pf < 5);
      if (five.length !== 5) return;
      const out = onCourt[abbr].filter((p) => !five.includes(p));
      onCourt[abbr] = five.slice().sort((a, b) => (POS_IDX[a.pos] || 3) - (POS_IDX[b.pos] || 3));
      out.forEach((p) => { hot[p.id] = 0; });
    }

    function startQuarter() {
      if (finished) return false;
      const nextQ = q + 1;
      if (nextQ > quarters && score[homeAbbr] !== score[awayAbbr]) { finished = true; return false; }
      if (nextQ > quarters + 6) { finished = true; return false; }
      q = nextQ;
      const isOt = q > quarters;
      clock = isOt ? 300 : 720;
      applyPending(homeAbbr);
      applyPending(awayAbbr);
      onCourt[homeAbbr] = pinnedFive(homeAbbr) || remainingFive(H);
      onCourt[awayAbbr] = pinnedFive(awayAbbr) || remainingFive(A);
      offNow = isOt ? (q % 2 ? homeAbbr : awayAbbr) : (q % 2 === 1 ? firstOff : firstOff === homeAbbr ? awayAbbr : homeAbbr);
      nextSub = 0;
      return true;
    }

    function stepPossession() {
      if (finished || clock <= 0.5) return false;
      applyPending(homeAbbr);
      applyPending(awayAbbr);
      const isOt = q > quarters;
      const subsAt = isOt ? [150] : [420, 180];
      const margin = Math.abs(score[homeAbbr] - score[awayAbbr]);
      const clutch = q === quarters && clock < 240 && margin <= 9;
      const dur = clutch ? RNG.range(9, 22) : RNG.range(6, 22);
      const used = Math.min(dur, clock);
      resolve(offNow, offNow === homeAbbr ? awayAbbr : homeAbbr, q, Math.round(clock), clutch);
      addTime(offNow, used);
      addTime(offNow === homeAbbr ? awayAbbr : homeAbbr, used);
      clock -= used;

      if (nextSub < subsAt.length && clock <= subsAt[nextSub]) {
        nextSub++;
        const outH = autoSub[homeAbbr] ? substitute(homeAbbr) : [];
        const outA = autoSub[awayAbbr] ? substitute(awayAbbr) : [];
        [...outH, ...outA].forEach((p) => { hot[p.id] = 0; });
      }
      // a player on six fouls leaves regardless of who is coaching
      if (autoSub[homeAbbr] === false) foulOut(homeAbbr);
      if (autoSub[awayAbbr] === false) foulOut(awayAbbr);
      offNow = offNow === homeAbbr ? awayAbbr : homeAbbr;
      return true;
    }

    function finishQuarter() {
      qScores.home.push(score[homeAbbr]);
      qScores.away.push(score[awayAbbr]);
      if (q >= quarters && score[homeAbbr] !== score[awayAbbr]) finished = true;
      if (q >= quarters + 6) finished = true;
    }

    function stepQuarter() {
      if (!startQuarter()) return false;
      let guard = 0;
      while (stepPossession() && guard++ < 600) { /* one possession */ }
      finishQuarter();
      return true;
    }

    // live driving: 'pos' = a possession was played, 'quarter' = a new quarter started, false = done
    function stepOne() {
      if (finished) return false;
      if (clock <= 0.5) {
        const wasQ = q;
        if (q > 0) { finishQuarter(); if (finished) return false; }
        if (!startQuarter()) return false;
        return wasQ === 0 ? 'start' : 'quarter';
      }
      return stepPossession() ? 'pos' : false;
    }

    // finalize minutes + plus/minus
    const allRows = Object.values(box);
    allRows.forEach((r) => { r.min = Math.round(secs[r.id] / 60 * 10) / 10; });


    const teamBox = (abbr) => {
      const t = totals[abbr];
      const rows = allRows.filter((r) => r.team === abbr).sort((a, b) => b.min - a.min);
      return {
        team: abbr, score: score[abbr],
        fgm: t.fgm, fga: t.fga, tpm: t.tpm, tpa: t.tpa, ftm: t.ftm, fta: t.fta,
        reb: t.reb, oreb: t.oreb, tov: t.tov, ast: t.ast || 0, stl: t.stl, blk: t.blk,
        fgPct: t.fga ? t.fgm / t.fga : 0, tpPct: t.tpa ? t.tpm / t.tpa : 0,
        rows,
      };
    };

    function result() {
      allRows.forEach((r) => { r.min = Math.round(secs[r.id] / 60 * 10) / 10; });
      return {
        home: teamBox(homeAbbr), away: teamBox(awayAbbr),
        qHome: qScores.home, qAway: qScores.away,
        events: opts.events ? events.slice(-260) : [],
        eventCount: events.length,
        ot: Math.max(0, qScores.home.length - 4),
      };
    }

    return {
      homeAbbr, awayAbbr, H, A,
      stepQuarter, stepOne, result,
      get finished() { return finished; },
      get quarter() { return q; },
      get score() { return { [homeAbbr]: score[homeAbbr], [awayAbbr]: score[awayAbbr] }; },
      get events() { return events; },
      get box() { return box; },
      get minutes() { const m = {}; Object.keys(secs).forEach((id) => { m[id] = secs[id] / 60; }); return m; },
      get totals() { return totals; },
      setFive(abbr, ids) { pending[abbr] = ids.slice(0, 5); },
      setAutoSub(abbr, on) { autoSub[abbr] = !!on; },
      autoSub: (abbr) => autoSub[abbr],
      queue(abbr) { return pending[abbr]; },
      onCourt: () => ({ [homeAbbr]: onCourt[homeAbbr].map((p) => p.id), [awayAbbr]: onCourt[awayAbbr].map((p) => p.id) }),
    };
  }

  function playGame(state, homeAbbr, awayAbbr, opts = {}) {
    const s = createSession(state, homeAbbr, awayAbbr, opts);
    if (!s) return null;
    let guard = 0;
    while (!s.finished && guard++ < 20) s.stepQuarter();
    return s.result();
  }

  root.Sim = { playGame, createSession, TUNE };
})(typeof window !== 'undefined' ? window : globalThis);
