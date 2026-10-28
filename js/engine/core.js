/* Core: RNG, constants, cap math, player valuation. Plain script -> window.Core */
(function (root) {
  'use strict';

  const CAP = {
    cap: 164961000, tax: 200428000, apron1: 209428000, apron2: 221686000,
    floor: 148465000, mle: 15044000, bae: 5477000, room: 9366000, min: 1272870, max: 58617000,
  };

  // ---------- RNG (mulberry32) ----------
  let S = 123456789;
  const RNG = {
    seed(s) { S = (s >>> 0) || 1; },
    get state() { return S; },
    set state(v) { S = v >>> 0; },
    next() {
      S = (S + 0x6D2B79F5) >>> 0;
      let t = S;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) { return Math.floor(RNG.next() * n); },
    range(a, b) { return a + RNG.next() * (b - a); },
    gauss() {
      let u = 0, v = 0;
      while (u === 0) u = RNG.next();
      while (v === 0) v = RNG.next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    chance(p) { return RNG.next() < p; },
    pick(arr) { return arr[Math.floor(RNG.next() * arr.length)]; },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(RNG.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    },
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const round = Math.round;
  const fmtM = (n) => {
    if (n == null) return '-';
    const s = n < 0 ? '-' : '';
    const v = Math.abs(n);
    if (v >= 1e6) return `${s}$${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)}M`;
    if (v >= 1e3) return `${s}$${(v / 1e3).toFixed(0)}K`;
    return `${s}$${v}`;
  };

  // ---------- salary model ----------
  // Anchors are on the 2K display scale, calibrated against 2026-27 cap sheets:
  // 97 = supermax, 81 = a $25-27M starter, 75 = mid-level, 68 = minimum.
  const SAL_ANCHORS = [[68, 1272870], [70, 4200000], [72, 8000000], [75, 14000000], [78, 20000000], [81, 27000000], [84, 35000000], [88, 44000000], [93, 52000000], [97, 58617000]];
  // engine ratings are 0-99 on the legacy scale; salaries are quoted on the 2K scale
  const toK = (x) => 68 + ((x == null ? 60 : x) - 46) / 1.72;
  function marketSalary(ovr) {
    ovr = toK(ovr);
    for (let i = 1; i < SAL_ANCHORS.length; i++) {
      const [o1, s1] = SAL_ANCHORS[i - 1], [o2, s2] = SAL_ANCHORS[i];
      if (ovr <= o2) return s1 + (s2 - s1) * ((ovr - o1) / (o2 - o1));
    }
    return CAP.max;
  }

  // ---------- valuation ----------
  function ageFactor(age) {
    if (age <= 19) return 1.18;
    if (age <= 21) return 1.2;
    if (age <= 23) return 1.12;
    if (age <= 25) return 1.05;
    if (age <= 28) return 1.0;
    if (age <= 30) return 0.9;
    if (age <= 32) return 0.74;
    if (age <= 34) return 0.55;
    if (age <= 36) return 0.36;
    return 0.2;
  }

  // Trade value in arbitrary "points" (a star ~ 12000, rotation guy ~ 300)
  function tradeValue(p) {
    const ovr = p.ovr || 50;
    const talent = 90 * Math.exp((ovr - 60) / 8.2);
    const pot = Math.max(0, (p.pot || ovr) - ovr);
    const youth = Math.max(0, 26 - (p.age || 26)) * (p.pot > ovr ? 18 : 4);
    const salary = p.salary || 0;
    const surplus = (marketSalary(ovr) - salary) / 5.5e5;
    const contractPen = salary > marketSalary(ovr) * 1.6 ? -0.28 : 0;
    let v = (talent + pot * 26 + youth) * ageFactor(p.age) * (1 + clamp(surplus / 26, -0.35, 0.45)) * (1 + contractPen);
    // injury history is a discount, not a death sentence: capped at 12%
    if (p.injuryHistory) v *= clamp(1 - Math.min(0.12, p.injuryHistory * 0.03), 0.88, 1);
    if (p.lastPermDamage) v *= 0.96;
    if (p.noTrade) v *= 0.92;
    if (p.tradeRequest) v *= 0.85;
    if (p.injDays > 0 && p.injDays > 40) v *= 0.75;
    return Math.max(20, v);
  }

  // Draft pick value by slot (1..60)
  function pickValue(slot, yearOffset = 0) {
    const s = clamp(slot, 1, 60);
    const raw = 9000 * Math.exp(-(s - 1) / 11.5) + 60;
    return raw * (yearOffset <= 0 ? 1 : 1 / (1 + 0.22 * yearOffset));
  }

  // ---------- roster helpers ----------
  function rosterOf(teamAbbr, players) {
    return players.filter((p) => p.team === teamAbbr && !p.retired);
  }
  function payrollOf(teamAbbr, players, state) {
    const base = rosterOf(teamAbbr, players).reduce((a, p) => a + (p.salary || 0), 0);
    const dead = state && state.teams && state.teams[teamAbbr] && state.teams[teamAbbr].dead;
    const buyoutPay = dead ? dead.reduce((a, d) => a + (d.amount || 0), 0) : 0;
    return base + buyoutPay;
  }
  function capRoom(teamAbbr, players) { return CAP.cap - payrollOf(teamAbbr, players); }
  function taxRoom(teamAbbr, players) { return CAP.tax - payrollOf(teamAbbr, players); }

  // Suggested workload ceiling: stamina carries it, age drags it down.
  function capacityOf(p) {
    const sta = p.sta || 65;
    const age = p.age || 26;
    return clamp(33 + (sta - 70) * 0.35 - Math.max(0, age - 29) * 0.9, 16, 38);
  }

  // What a player believes he should be getting, by his standing in the room.
  const MIN_CURVE = [35, 34, 32, 31, 29, 22, 18, 15, 11, 8, 5, 3, 1, 0, 0];
  function expectedMinutes(p, roster) {
    const ranked = roster.filter((x) => !x.retired).sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
    const i = ranked.findIndex((x) => x.id === p.id);
    if (i < 0) return 0;
    return MIN_CURVE[Math.min(i, MIN_CURVE.length - 1)];
  }
  function expectedUsage(p) {
    // usage expectation follows what a player can actually do with the ball,
    // not his overall rating: a lockdown defender is not owed 20 shots.
    const off = 0.34 * (p.ins || 55) + 0.34 * (p.three || 50) + 0.18 * (p.mid || 50)
      + 0.07 * (p.handle || 50) + 0.07 * (p.pass || 50);
    return clamp((off - 47) * 0.0072, 0.02, 0.33);
  }

  // Minutes plan: manual rotation wins when it's usable, otherwise the auto curve.
  function rotation(players, tactics, opts) {
    const o = opts || {};
    const INJ = root.Injury;
    const available = players.filter((p) => !p.retired && !(INJ ? INJ.isOut(p) : p.injDays > 0)
      && !p.restNextGame && !(o.playoffs && p.noPlayoffs));
    const manual = o.manual || {};
    const entries = available.filter((p) => (manual[p.id] || 0) > 0).map((p) => [p, manual[p.id]]);
    // a player carrying a knock gets 80% of his planned load, not his full run
    const banged = (p) => (INJ && p.injDays > 0 && !INJ.isOut(p) ? 0.8 : 1);
    if (entries.length >= 5) {
      const sum = entries.reduce((a, x) => a + x[1] * banged(x[0]), 0);
      const scale = sum > 0 ? 240 / sum : 1;
      const mins = new Map();
      entries.forEach(([p, m]) => mins.set(p, clamp(m * banged(p) * scale, 0, 44)));
      return mins;
    }
    const roster = available;
    const score = (p) => (p.ovr || 50) + (p.pot > p.ovr ? Math.min(4, (p.pot - p.ovr) * 0.25) : 0);
    const ranked = roster.slice().sort((a, b) => score(b) - score(a)).slice(0, 12);
    const base = [0.148, 0.140, 0.131, 0.122, 0.111, 0.080, 0.068, 0.056, 0.044, 0.032, 0.023, 0.015];
    const sh = base.slice(0, ranked.length);
    const tot = sh.reduce((a, b) => a + b, 0) || 1;
    const mins = new Map();
    ranked.forEach((p, i) => mins.set(p, (240 * sh[i]) / tot * banged(p)));
    for (let g = 0; g < 24; g++) {
      const over = [...mins.entries()].filter(([, m]) => m > 37.5);
      if (!over.length) break;
      let spare = 0;
      over.forEach(([p, m]) => { spare += m - 37.5; mins.set(p, 37.5); });
      const under = [...mins.entries()].filter(([, m]) => m < 37.4).sort((a, b) => a[1] - b[1]);
      if (!under.length) break;
      const each = spare / under.length;
      under.forEach(([p, m]) => mins.set(p, m + each));
    }
    return mins;
  }

  // ---------- positions ----------
  // A player has one natural position; playing one slot away costs 7%, two 15%,
  // three 24%. That is what lets a PG cover SF without turning the lineup into mush.
  const POS_LIST = ['PG', 'SG', 'SF', 'PF', 'C'];
  const POS_IDX = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };
  const POS_PEN = [1, 0.93, 0.85, 0.76];

  // a player carrying a knock is worth less than his card says
  function effOvr(p) {
    const m = root.Injury ? root.Injury.effMul(p) : 1;
    return (p && p.ovr ? p.ovr : 50) * m;
  }

  function posFactor(p, pos) {
    const nat = POS_IDX[p && p.pos] || 3;
    const want = POS_IDX[pos] || 3;
    return POS_PEN[Math.min(3, Math.abs(nat - want))];
  }
  function ovrAt(p, pos) { return effOvr(p) * posFactor(p, pos); }
  function posLabel(p) {
    const nat = POS_IDX[p && p.pos] || 3;
    return { pos: p.pos, can: POS_LIST.filter((x) => Math.abs(POS_IDX[x] - nat) <= 1 && x !== p.pos) };
  }

  /* One natural body per position. Slots are filled with real centres, real point
     guards and so on; only when a position has nobody left does an out-of-position
     player slide in (and pay the penalty). Returns the five ordered PG..C. */
  function bestFive(players, weightFn) {
    const pool = players.filter((p) => p && !p.retired);
    if (!pool.length) return [];
    const w = weightFn || (() => 0);
    const val = (p, pos) => ovrAt(p, pos) + w(p);
    const chosen = {};
    const used = new Set();

    for (const pos of POS_LIST) {
      let best = null, bestV = -1e9;
      for (const p of pool) {
        if (used.has(p.id) || p.pos !== pos) continue;
        const v = val(p, pos);
        if (v > bestV) { bestV = v; best = p; }
      }
      if (best) { chosen[pos] = best; used.add(best.id); }
    }
    for (const pos of POS_LIST) {                    // out-of-position fill
      if (chosen[pos]) continue;
      let best = null, bestV = -1e9;
      for (const p of pool) {
        if (used.has(p.id)) continue;
        const v = val(p, pos);
        if (v > bestV) { bestV = v; best = p; }
      }
      if (best) { chosen[pos] = best; used.add(best.id); }
    }
    return POS_LIST.map((pos) => chosen[pos]).filter(Boolean);
  }

  function lineupRating(five, tactics) {
    const w = (k) => mean(five.map((p) => p[k] || 55));
    const off = 0.30 * w('ins') + 0.26 * w('three') + 0.16 * w('pass') + 0.14 * w('handle') + 0.14 * w('oiq');
    const def = 0.30 * w('pdef') + 0.28 * w('idef') + 0.26 * w('diq') + 0.16 * w('str');
    const reb = 0.55 * w('reb') + 0.25 * w('str') + 0.20 * w('idef');
    const t = tactics || {};
    // the head coach lifts or caps what the group can do
    const cOff = t.coachOff || 1, cDef = t.coachDef || 1;
    // emergency: no real centre on the floor means the whole unit plays small
    const small = five.length > 0 && !five.some((p) => p.pos === 'C');
    const k = small ? 0.94 : 1;
    return {
      off: off * (1 + (t.threeBias || 0) * 0.04) * k * cOff,
      def: def * k * cDef, reb: reb * (small ? 0.90 : 1),
      pace: 1 + (t.pace || 0) * 0.06,
      small,
    };
  }

  root.Core = {
    CAP, RNG, clamp, mean, round, fmtM, marketSalary, ageFactor, tradeValue, pickValue,
    rosterOf, payrollOf, capRoom, taxRoom, rotation, lineupRating,
    POS_LIST, POS_IDX, posFactor, ovrAt, posLabel, bestFive, effOvr,
    capacityOf, expectedMinutes, expectedUsage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
