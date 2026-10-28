/* Condition: fatigue, morale, locker room. Pure functions over state. */
(function (root) {
  'use strict';
  const { RNG, clamp, mean } = root.Core;

    function rosterOf(state, abbr) {
    return state.players.filter((p) => p.team === abbr && !p.retired);
  }

  // ---------- after a game: fatigue load + 10-game rolling window ----------
  function afterGame(state, abbr, rows, totals) {
    const roster = rosterOf(state, abbr);
    const team = state.teams[abbr];
    const poss = Math.max(1, (totals.fga || 0) + 0.44 * (totals.fta || 0) + (totals.tov || 0) - (totals.oreb || 0));
    const b2b = team.lastGameDate && root.League.diffDays(team.lastGameDate, state.date) <= 1;
    const playedIds = new Set(rows.map((r) => r.id));

    for (const r of rows) {
      const p = state.players.find((x) => x.id === r.id);
      if (!p) continue;
      const cap = root.Core.capacityOf(p);
      // superlinear in minutes: playing above your ceiling costs much more than below it
      const load = r.min * (r.min / cap) * 1.42 * (b2b ? 1.2 : 1);
      p.fatigue = clamp((p.fatigue || 0) + load, 0, 100);
      p.lastPlayed = state.date;
      const ts = r.pts / (2 * (r.fga + 0.44 * r.fta) || 1);
      const usg = (r.fga + 0.44 * r.fta + r.tov) / poss;
      // defensive production per 36: a lockdown wing earns his minutes here, not on TS%
      const dfw = ((r.stl || 0) * 1.6 + (r.blk || 0) * 1.6 + (r.reb || 0) * 0.75 * 0.5) / Math.max(1, r.min) * 36;
      p.recent = (p.recent || []).concat([{ min: r.min, ts, usg, dfw }]).slice(-10);
    }
    for (const p of roster) {
      if (!playedIds.has(p.id)) p.recent = (p.recent || []).concat([{ min: 0, ts: 0, usg: 0, dfw: 0 }]).slice(-10);
      p.restNextGame = false;   // rest flag is consumed by the game it was set for
    }
    team.lastGameDate = state.date;
  }

  // ---------- daily recovery ----------
  // Exponential decay: every player settles at an equilibrium set by his workload,
  // so a 36 mpg starter carries a constant ~55 and a deep bench player stays near 15.
  function recover(state) {
    for (const p of state.players) {
      if (p.retired || !p.team) continue;
      const played = p.lastPlayed === state.date;
      let rate = played ? 0.20 : 0.48;
      if (p.age >= 33) rate *= 0.78;
      else if (p.age >= 30) rate *= 0.88;
      if (p.injDays > 0) rate *= 0.5;
      p.fatigue = clamp((p.fatigue || 0) * (1 - rate), 0, 100);
    }
  }

  // ---------- morale ----------
  const WEIGHTS = { minutes: 0.40, usage: 0.25, performance: 0.20, team: 0.15 };

  function breakdown(p, roster, team) {
    // a player who cannot play is not judged on minutes or shots — sitting out
    // injured must never cost morale
    if (root.Injury && root.Injury.isOut(p)) {
      const wins0 = (team.recent || []).slice(-10);
      return {
        score: clamp(68 + 48 * (WEIGHTS.team * (wins0.length >= 3 ? clamp((mean(wins0) - 0.5) / 0.35, -1, 1) : 0)), 12, 96),
        winRate: wins0.length ? mean(wins0) : 0.5,
        minSat: 0, usgSat: 0, perfSat: 0,
        teamSat: wins0.length >= 3 ? clamp((mean(wins0) - 0.5) / 0.35, -1, 1) : 0,
        tsSat: 0, defSat: 0, actualM: 0, expM: 0, actualU: 0, expU: 0,
        actualTS: 0, expTS: 0, actualDef: 0, expDef: 0, injured: true,
      };
    }
    const rec = p.recent || [];
    const expM = root.Core.expectedMinutes(p, roster);
    const actualM = rec.length ? mean(rec.map((x) => x.min)) : expM;
    const minSat = expM > 2 ? clamp((actualM - expM) / Math.max(6, expM), -1, 1) : 0;

    const expU = root.Core.expectedUsage(p);
    const actualU = rec.length ? mean(rec.map((x) => x.usg)) : expU;
    const usgSat = clamp((actualU - expU) / Math.max(0.06, expU), -1, 1);

    const expTS = 0.48 + Math.max(0, (p.ovr || 60) - 55) * 0.0028;
    const actualTS = rec.length ? mean(rec.map((x) => x.ts)) : expTS;
    const tsSat = clamp((actualTS - expTS) / 0.10, -1, 1);

    // defensive satisfaction: steals/blocks/boards against what his defensive
    // rating says he should produce. This is what keeps 3-and-D players happy.
    const defAttr = ((p.pdef || 60) + (p.idef || 60) + (p.reb || 60)) / 3;
    const expDef = 2 + (defAttr - 45) * 0.12;
    const actualDef = rec.length ? mean(rec.map((x) => x.dfw || 0)) : expDef;
    const defSat = clamp((actualDef - expDef) / 2.2, -1, 1);

    // a 12% usage player is judged on defense; a 28% player on shot-making
    const wDef = clamp((0.22 - actualU) / 0.10, 0.25, 0.75);
    const perfSat = clamp((1 - wDef) * tsSat + wDef * defSat, -1, 1);

    const wins = (team.recent || []).slice(-10);
    const teamSat = wins.length >= 3 ? clamp((mean(wins) - 0.5) / 0.35, -1, 1) : 0;

    // early-season sample is noisy: ramp the weights in over the first six games
    const damp = Math.min(1, rec.length / 6);
    const w = damp * (WEIGHTS.minutes * minSat + WEIGHTS.usage * usgSat + WEIGHTS.performance * perfSat) + WEIGHTS.team * teamSat;
    return {
      score: clamp(68 + 48 * w, 12, 96),
      winRate: wins.length ? mean(wins) : 0.5,
      minSat, usgSat, perfSat, teamSat, tsSat, defSat,
      actualM, expM, actualU, expU, actualTS, expTS, actualDef, expDef,
    };
  }

  function moraleScore(p) {
    return clamp(Math.round((p.morale == null ? 70 : p.morale)), 0, 100);
  }

  // ---------- daily morale pass + locker room ----------
  function daily(state) {
    for (const team of Object.values(state.teams)) {
      const roster = rosterOf(state, team.abbr);
      const rows = roster.map((p) => ({ p, b: breakdown(p, roster, team) }));
      team.chemistry = Math.round(mean(rows.map((r) => r.b.score)));

      for (const { p, b } of rows) {
        p.moraleBase = Math.round(b.score);
        p.moraleParts = b;
        // current form: recent play, independent of long-run satisfaction
        p.form = Math.round(clamp(b.perfSat * 2.2 + b.minSat * 1.2, -4, 4) * 10) / 10;
        if (!(p.recent || []).length) p.form = 0;
        p.moraleMod = clamp((p.moraleMod || 0) * 0.96, -15, 10);   // events fade out
        p.morale = clamp(Math.round(b.score + p.moraleMod), 0, 100);
        p.unhappyDays = p.morale < 32 ? (p.unhappyDays || 0) + 1 : 0;
        p.happyDays = p.morale >= 55 ? (p.happyDays || 0) + 1 : 0;
        if (p.tradeRequest && p.happyDays >= 5) p.tradeRequest = false;
      }

      // public discontent: a genuinely unhappy player eventually says it out loud
      for (const { p } of rows) {
        if (p.morale < 30 && p.unhappyDays >= 3 && !p.tradeRequest) {
          p.tradeRequest = true;
          p.moraleMod = (p.moraleMod || 0) - 6;
          const mates = roster.filter((x) => x.id !== p.id).sort((a, b) => (b.ovr || 0) - (a.ovr || 0)).slice(0, 4);
          mates.forEach((m) => { m.moraleMod = (m.moraleMod || 0) - 2; });
          if (p.team === state.userTeam) {
            root.Office.pushInbox(state, {
              type: 'morale',
              title: `${p.name} 提出交易申请`,
              body: `士气 ${p.morale}，公开表达不满，更衣室受到波及（队友士气 -2）。`,
            });
          }
        }
      }

      // contagion: one sour voice pulls the room down
      const grumps = roster.filter((p) => p.morale < 35);
      for (const g of grumps) {
        if (RNG.chance(0.1)) {
          const mates = roster.filter((x) => x.id !== g.id && x.morale > 45);
          if (mates.length) {
            const m = RNG.pick(mates);
            m.moraleMod = Math.max(-12, (m.moraleMod || 0) - 1);
          }
        }
      }

      // winning cures a lot
      const wins = (team.recent || []).slice(-5);
      if (wins.length >= 4 && mean(wins) >= 0.8) {
        roster.forEach((p) => { p.moraleMod = (p.moraleMod || 0) + 0.6; });
      }
    }
  }

  function ensureFields(state) {
    for (const p of state.players) {
      if (p.fatigue == null) p.fatigue = 0;
      if (p.morale == null) p.morale = 70;
      if (!p.recent) p.recent = [];
      if (p.moraleMod == null) p.moraleMod = 0;
      if (p.restNextGame == null) p.restNextGame = false;
      if (p.tradeRequest == null) p.tradeRequest = false;
    }
    for (const t of Object.values(state.teams)) {
      if (t.chemistry == null) t.chemistry = 70;
      if (!t.recent) t.recent = [];
      if (!t.rotation) t.rotation = {};
      if (t.lastGameDate === undefined) t.lastGameDate = null;
    }
  }

  root.Condition = { afterGame, recover, daily, breakdown, moraleScore, ensureFields, rosterOf };
})(typeof window !== 'undefined' ? window : globalThis);
