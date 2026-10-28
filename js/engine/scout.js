/* Scout: archetypes, player comparisons and draft reports.
   Comps come from the live league, so a fake star who retires becomes the
   ceiling comp for future prospects — the league writes its own history. */
(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rng = () => (root.Core && root.Core.RNG ? root.Core.RNG : null);

  const ARCH = {
    playmaker: '组织核心',
    scorer: '得分手',
    shooter: '外线射手',
    wing: '3D 锋线',
    stretch5: '空间型中锋',
    rimProt: '护框内线',
    post: '内线终结者',
  };

  function archetype(p) {
    const o = p.ovr || 60;
    const big = p.pos === 'C' || p.pos === 'PF';
    const d = (k) => (p[k] == null ? o : p[k]) - o;
    if (big) {
      if (d('three') >= 0 && d('reb') <= 1) return 'stretch5';
      if (d('idef') >= 2 || d('reb') >= 4) return 'rimProt';
      return 'post';
    }
    if (d('pass') >= 2 && d('handle') >= 1) return 'playmaker';
    if (d('pdef') >= 2 && d('three') >= 1) return 'wing';
    if (d('three') >= 4) return 'shooter';
    if (d('pdef') >= 3) return 'wing';
    return 'scorer';
  }

  function compPool(state) {
    const cur = state.players
      .filter((p) => p.team && !p.retired && !p.rookie && p.ovr >= 58)
      .map((p) => ({ name: p.name, pos: p.pos, ovr: p.ovr, arch: archetype(p) }));
    const leg = (state.legends || []).map((l) => ({ name: l.name, pos: l.pos, ovr: l.ovr, arch: l.arch, legend: true }));
    return cur.concat(leg);
  }

  const BIG_ARCH = { post: 1, rimProt: 1, stretch5: 1 };
  function pickComp(pool, arch, target, exclude, maxOvr) {
    const isBig = !!BIG_ARCH[arch];
    const groups = [
      (x) => x.arch === arch,
      (x) => ((x.pos === 'C' || x.pos === 'PF') === isBig),
    ];
    for (const g of groups) {
      const cands = pool.filter((x) => x.name !== exclude && (maxOvr == null || x.ovr <= maxOvr) && g(x));
      if (!cands.length) continue;
      const R = rng();
      const sorted = cands.slice().sort((a, b) => Math.abs(a.ovr - target) - Math.abs(b.ovr - target));
      const band = sorted.slice(0, 4);
      const pick = R ? R.pick(band) : band[0];
      return pick ? { name: pick.name, ovr: pick.ovr, pos: pick.pos, legend: !!pick.legend } : null;
    }
    return null;
  }

  const ATTRS = [
    ['three', '三分投射'], ['pass', '组织策应'], ['handle', '持球创造'], ['reb', '篮板保护'],
    ['idef', '护框'], ['pdef', '外线防守'], ['spd', '速度'], ['ins', '内线终结'],
    ['str', '身体对抗'], ['ft', '罚球'],
  ];

  const RELEVANT = {
    PG: ['three', 'pass', 'handle', 'spd', 'pdef', 'ft'],
    SG: ['three', 'handle', 'spd', 'pdef', 'ins', 'ft'],
    SF: ['three', 'pdef', 'ins', 'spd', 'str', 'handle'],
    PF: ['ins', 'reb', 'idef', 'str', 'three', 'ft'],
    C: ['ins', 'reb', 'idef', 'str', 'ft', 'pass'],
  };

  function traits(p) {
    const out = [];
    if ((p.injuryHistory || 0) >= 3) out.push(`近年伤过 ${p.injuryHistory} 次，耐操度打问号`);
    else if ((p.injuryRisk || 0) >= 0.45) out.push('伤病史明显，出勤有隐患');
    else if ((p.injuryRisk || 0) <= 0.05) out.push('身体素质过硬，耐操');
    if (p.lateBloomer) out.push('晚熟型，需要 3-4 年才能兑现');
    if ((p.workEthic || 0) >= 0.7) out.push('训练态度极佳，成长曲线偏快');
    if ((p.workEthic || 0) <= 0.25) out.push('自律性存疑，可能停滞不前');
    return out;
  }

  function grade(pot) {
    if (pot >= 90) return 'S';
    if (pot >= 85) return 'A+';
    if (pot >= 80) return 'A';
    if (pot >= 75) return 'B+';
    if (pot >= 70) return 'B';
    if (pot >= 64) return 'C+';
    return 'C';
  }

  // ranges shown to a team: the better the scouting staff, the tighter the band
  // ---- combine: fixed measurements, not skill ratings ----
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function combine(p) {
    const h = hash(String(p.id) + (p.name || ''));
    const pick = (i, lo, hi) => lo + (((h >>> (i * 3)) % 997) / 997) * (hi - lo);
    const ht = p.h || 78;
    const spd = p.spd || 60;
    return {
      height: ht,
      weight: p.w || 210,
      wingspan: Math.round(ht + pick(1, 1.6, 5.4)),
      reach: Math.round(ht * 1.32 + pick(2, 0, 3.2)),
      vert: Math.round(25 + spd * 0.13 + pick(3, -2.5, 5.5)),
      sprint: +(3.36 - (spd - 50) * 0.0062 + pick(4, -0.03, 0.06)).toFixed(2),
      lane: +(11.55 - (spd - 50) * 0.011 + pick(5, -0.08, 0.14)).toFixed(2),
      bench: Math.round(4 + ((p.str || 60) - 50) * 0.22 + pick(6, -1.5, 2.5)),
    };
  }

  // ---- team workout: eight invitations a year, and it buys real information ----
  const WORKOUT_CAP = 8;
  function workoutsLeft(state) {
    return Math.max(0, WORKOUT_CAP - ((state.workouts || []).length));
  }
  function hasWorkout(state, p) {
    return !!(p && p.workedOut) || (state.workouts || []).includes(p && p.id);
  }
  function workout(state, p) {
    if (!p || !p.id) return { ok: false, msg: '没有这名球员' };
    if (hasWorkout(state, p)) return { ok: false, msg: `${p.name} 已经试训过了` };
    if (workoutsLeft(state) <= 0) return { ok: false, msg: `本赛季试训名额已用完（${WORKOUT_CAP} 人）` };
    state.workouts = state.workouts || [];
    state.workouts.push(p.id);
    p.workedOut = true;
    p.scout = null;                         // force the report to refresh with the workout data
    return { ok: true, msg: `${p.name} 试训结束，报告已更新` };
  }
  // what the workout actually told you
  function workoutNote(state, p) {
    if (!hasWorkout(state, p)) return null;
    if (p.bust) return '对抗强度一上来，投篮和决策都掉了一档——球探下调了对他的预期。';
    if (p.lateBloomer) return '试训里的表现远超录像，身体条件也好，属于值得赌的类型。';
    const truth = p.truePot || p.pot || p.ovr;
    if (truth - (p.pot || truth) >= 3) return '动态测试比录像更好看，潜力可能被低估了。';
    if (truth - (p.pot || truth) <= -3) return '体测数据一般，潜力不像报告里写的那么好。';
    return '试训内容与球探报告基本吻合，没有新发现。';
  }

  function range(p, scoutRating, workedOut) {
    const base = clamp(p.sq == null ? 60 : p.sq, 20, 95);
    const staff = clamp((scoutRating == null ? 70 : scoutRating) - 70, -20, 20);
    const certainty = clamp(base + staff * 0.8, 15, 97);
    let w = Math.max(1, Math.round(((100 - certainty) / 100) * 7));
    if (workedOut) w = Math.max(1, Math.round(w * 0.55));   // a workout tightens the band
    return {
      ovr: [clamp(Math.round(p.ovr) - Math.round(w * 0.6), 30, 99), clamp(Math.round(p.ovr) + Math.round(w * 0.6), 30, 99)],
      pot: [clamp(Math.round(p.pot) - w, 30, 97), clamp(Math.round(p.pot) + w, 30, 97)],
      w,
    };
  }

  const zh = (n) => (root.ZH && n ? root.ZH.name(n) : n);

  function makeReport(state, p) {
    const pool = compPool(state);
    const arch = archetype(p);
    const d = (k) => (p[k] == null ? p.ovr : p[k]) - p.ovr;
    const rel = new Set(RELEVANT[p.pos] || RELEVANT.SF);
    const pool2 = ATTRS.filter(([k]) => rel.has(k));
    const strengths = pool2.map(([k, label]) => ({ label, v: d(k) })).filter((x) => x.v >= 2)
      .sort((a, b) => b.v - a.v).slice(0, 2).map((x) => x.label);
    const weaknesses = pool2.map(([k, label]) => ({ label, v: d(k) })).filter((x) => x.v <= -2)
      .sort((a, b) => a.v - b.v).slice(0, 2).map((x) => x.label);
    const ceiling = pickComp(pool, arch, clamp(p.pot, 62, 96));
    // the floor comp must be a genuinely lower tier than the ceiling comp
    const floor = pickComp(pool, arch, clamp(Math.max(p.ovr - 5, 50), 50, 88), ceiling && ceiling.name, ceiling ? ceiling.ovr - 1 : 99);
    const tr = traits(p);
    const bits = [];
    bits.push(`模板定位：${ARCH[arch]}`);
    if (strengths.length) bits.push(`${strengths.join('、')}是他在这个位置上的立身之本`);
    if (weaknesses.length) bits.push(`${weaknesses.join('、')}还需要时间打磨`);
    if (ceiling) bits.push(`如果一切顺利，天花板是${zh(ceiling.name)}`);
    if (floor) bits.push(`最差也是${zh(floor.name)}这一档的轮换`);
    if (tr.length) bits.push(tr.join('；'));
    return {
      arch,
      archLabel: ARCH[arch],
      grade: grade(p.pot),
      ceiling,
      floor,
      strengths,
      weaknesses,
      traits: tr,
      note: bits.join('。') + '。',
      sq: Math.round(p.sq || 60),
    };
  }

  // deterministic scouting staff quality per team (55-90)
  function report(state, p) {
    if (!p) return null;
    if (p.scout && p.scout.season === state.season && p.scout.v === 2) return p.scout;
    const r = makeReport(state, p);
    r.season = state.season;
    r.v = 2;
    p.scout = r;
    return r;
  }

  function staffRating(state, abbr) {
    const t = state.teams[abbr];
    if (!t) return 70;
    // a hired scout (object) overrides the club's built-in reputation (a number)
    if (t.scout && t.scout.eye) return t.scout.eye;
    if (typeof t.scout === 'number') return t.scout;
    let h = 0;
    for (let i = 0; i < abbr.length; i++) h = (h * 31 + abbr.charCodeAt(i)) | 0;
    t.scout = 56 + (Math.abs(h) % 35);
    return t.scout;
  }

  root.Scout = { archetype, compPool, makeReport, report, range, grade, staffRating, ARCH,
    combine, workout, workoutsLeft, hasWorkout, workoutNote, WORKOUT_CAP };
})(typeof window !== 'undefined' ? window : globalThis);
