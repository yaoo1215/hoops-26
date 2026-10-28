/* End-of-season awards.

   Everything is computed from the regular-season box score plus team results, so the
   numbers can be explained: a 30-win volume scorer does not beat a 60-win star with
   the same line, and a bench player cannot win MVP. */
(function (root) {
  'use strict';

  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  function perGame(p) {
    const g = Math.max(1, p.st.gp);
    return {
      g, ppg: p.st.pts / g, rpg: p.st.reb / g, apg: p.st.ast / g,
      spg: p.st.stl / g, bpg: p.st.blk / g, tpg: p.st.tov / g, mpg: p.st.min / g,
      ts: p.st.fga ? p.st.pts / (2 * (p.st.fga + 0.44 * p.st.fta) || 1) : 0.5,
    };
  }

  function value(p) {
    const q = perGame(p);
    return q.ppg + 1.15 * q.rpg + 1.45 * q.apg + 2.2 * (q.spg + q.bpg) - 1.1 * q.tpg + (q.ts - 0.55) * 12;
  }

  function defValue(p) {
    const q = perGame(p);
    const attrs = ((p.pdef || 60) + (p.idef || 60) + (p.diq || 60)) / 3;
    return (q.spg * 1.9 + q.bpg * 2.0) + (attrs - 60) * 0.10 + q.rpg * 0.25;
  }

  function isRookie(p) {
    return (p.exp || 0) <= 1 && (p.st.gp || 0) >= 20;
  }

  /* Weighted so winning matters, without letting a role player on a 65-win team
     walk off with the MVP. */
  function mvpScore(p, teamWinPct) {
    return value(p) * (0.86 + 0.28 * (teamWinPct == null ? 0.5 : teamWinPct)) * (perGame(p).mpg >= 26 ? 1 : 0.92);
  }

  function byScore(list, fn) {
    return list.slice().sort((a, b) => fn(b) - fn(a));
  }

  /* 2 guards, 2 forwards, 1 centre per team; falls back to the best available
     when a position runs dry. */
  function buildTeams(eligible, teams, scoreFn) {
    const used = new Set();
    const out = [];
    for (let t = 0; t < teams; t++) {
      const five = [];
      const want = [['PG', 'SG'], ['PG', 'SG'], ['SF', 'PF'], ['SF', 'PF'], ['C']];
      for (const group of want) {
        const pick = eligible.filter((p) => !used.has(p.id) && group.includes(p.pos))
          .sort((a, b) => scoreFn(b) - scoreFn(a))[0];
        if (pick) { five.push(pick); used.add(pick.id); }
      }
      while (five.length < 5) {
        const pick = eligible.filter((p) => !used.has(p.id)).sort((a, b) => scoreFn(b) - scoreFn(a))[0];
        if (!pick) break;
        five.push(pick); used.add(pick.id);
      }
      if (five.length) out.push(five);
    }
    return out;
  }

  function compute(state) {
    const wins = {};
    Object.keys(state.teams).forEach((abbr) => {
      const t = state.teams[abbr];
      const g = t.wins + t.losses;
      wins[abbr] = g ? t.wins / g : 0.5;
    });
    const all = state.players.filter((p) => p.st && p.st.gp > 0);
    const teamGames = (p) => {
      const t = state.teams[p.team];
      return t ? Math.max(1, t.wins + t.losses) : 82;
    };
    const eligible = all.filter((p) => p.st.gp >= 0.72 * teamGames(p) || p.st.gp >= 58);
    const pool = eligible.length >= 15 ? eligible : all;

    const mvp = byScore(pool, (p) => mvpScore(p, wins[p.team]))[0] || null;
    const dpoy = byScore(pool, (p) => defValue(p) * (0.9 + 0.2 * (wins[p.team] || 0.5)))[0] || null;
    const rookies = all.filter(isRookie);
    const roy = byScore(rookies, (p) => value(p))[0] || null;

    // most improved: a rating jump first, production second. Established stars are
    // out of the running — the award is for the leap, not the ceiling.
    const elite = new Set(byScore(pool, (p) => value(p)).slice(0, 8).map((p) => p.id));
    const mipPool = pool.filter((p) => p.st.gp >= 40 && !elite.has(p.id));
    const mip = byScore(mipPool, (p) => {
      const jump = p.ovrStart ? (p.ovr || 0) - p.ovrStart : 0;
      return jump * 4 + value(p) * 0.35;
    })[0] || null;

    // sixth man: real bench role
    const smoy = byScore(pool.filter((p) => perGame(p).mpg <= 30 && value(p) > 0), (p) => value(p)
      * (perGame(p).mpg <= 26 ? 1.05 : 0.98))[0] || null;

    const allNBA = buildTeams(pool, 3, (p) => mvpScore(p, wins[p.team]));
    const allDef = buildTeams(pool, 2, (p) => defValue(p));
    const allRookie = byScore(rookies, (p) => value(p)).slice(0, 5);

    // Finals MVP: the Finals series alone decides it. Playoff totals are irrelevant,
    // and a player who never checked in during the series is not eligible.
    let fmvp = null;
    const champ = state.playoffs && state.playoffs.champion;
    if (champ) {
      const finals = state.players.filter((p) => p.team === champ && p.fst && p.fst.gp > 0);
      const line = (st) => {
        const g = Math.max(1, st.gp);
        return (st.pts / g) + 1.1 * (st.reb / g) + 1.4 * (st.ast / g) + 2.2 * ((st.stl + st.blk) / g);
      };
      const scored = (finals.length ? finals : state.players.filter((p) => p.team === champ && p.pst && p.pst.gp > 0))
        .map((p) => ({ p, v: line(p.fst && p.fst.gp ? p.fst : p.pst) }))
        .sort((a, b) => b.v - a.v);
      fmvp = scored.length ? scored[0].p : null;
    }

    return {
      mvp, dpoy, roy, mip, smoy, fmvp,
      allNBA, allDef, allRookie,
      runnerUps: { mvp: byScore(pool, (p) => mvpScore(p, wins[p.team])).slice(1, 4) },
    };
  }

  root.Awards = { compute, value, defValue, perGame, isRookie };
})(typeof window !== 'undefined' ? window : globalThis);
