/* Staff: one head coach and one scout per club.

   The coach carries a system — that is the part a new player needs to understand,
   so every system ships with a plain-language strength and weakness. The scout's
   rating is what the draft reports are built from. */
(function (root) {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const SYSTEMS = {
    pace: {
      name: '跑轰',
      short: '快、三分多',
      good: '回合数多、三分出手多，替补也能刷到数据，打弱队容易一波流。',
      bad: '护框和防守篮板偏弱，遇到能打阵地、内线强的队会被反复打二次进攻。',
      pace: 0.09, threeBias: 0.35, isoBias: 0.05,
      off: 1.04, def: 0.97, reb: 0.95,
      actions: { transition: 0.35, spot: 0.18, post: -0.25 },
    },
    motion: {
      name: '传切体系',
      short: '无球跑动、助攻多',
      good: '空切和掩护多，助攻率高，适合球商高、能传能跑的阵容，团队上限高。',
      bad: '需要时间和默契，单打能力弱的队关键时刻没人能硬解，容易被换防掐死。',
      pace: 0.02, threeBias: 0.12, isoBias: -0.15,
      off: 1.03, def: 1.0, reb: 1.0,
      actions: { cut: 0.35, offscreen: 0.2, iso: -0.3 },
    },
    pnr: {
      name: '挡拆主导',
      short: '持球挡拆为核心',
      good: '有顶级后卫或吃饼中锋时效率极高，制造错位和罚球的能力强。',
      bad: '被换防和夹击针对时容易停球，弱侧球员容易站桩，依赖核心健康。',
      pace: 0, threeBias: 0.05, isoBias: 0.05,
      off: 1.03, def: 1.0, reb: 1.0,
      actions: { pnr: 0.4, post: -0.15 },
    },
    post: {
      name: '内线阵地',
      short: '慢、强攻篮下',
      good: '节奏慢、失误少，篮板和罚球占优，季后赛半场攻防更稳。',
      bad: '节奏拖慢会被跑轰球队拖垮，外线手感差时得分荒明显。',
      pace: -0.06, threeBias: -0.2, isoBias: 0.1,
      off: 1.02, def: 1.02, reb: 1.04,
      actions: { post: 0.45, three: -0.2, transition: -0.2 },
    },
    defense: {
      name: '防守优先',
      short: '低节奏、护框',
      good: '把比赛拖进半场肉搏，限制对手命中率和篮板，弱队也能咬住强队。',
      bad: '进攻上限低，落后两位数很难追，需要有人能单点得分。',
      pace: -0.05, threeBias: -0.1, isoBias: 0.05,
      off: 0.97, def: 1.06, reb: 1.02,
      actions: { post: 0.1, iso: 0.15, transition: -0.15 },
    },
  };

  const FIRST = ['泰伦', '埃里克', '乔纳森', '马库斯', '戴夫', '兰迪', '布莱恩', '肯尼', '查尔斯', '阿德里安',
    '塞尔吉', '迭戈', '卢卡', '伊万', '田中', '金', '阿卜杜', '山姆', '内特', '威尔'];
  const LAST = ['约翰逊', '威廉姆斯', '布朗', '史密斯', '戴维斯', '米勒', '威尔逊', '摩尔', '泰勒', '安德森',
    '托马斯', '杰克逊', '怀特', '哈里斯', '马丁', '汤普森', '加西亚', '马丁内斯', '罗宾逊', '克拉克'];

  const SYSTEMS_KEYS = Object.keys(SYSTEMS);

  function name(rng) {
    return `${FIRST[Math.floor(rng.next() * FIRST.length)]}·${LAST[Math.floor(rng.next() * LAST.length)]}`;
  }

  function makeCoach(rng, tier) {
    const t = tier == null ? rng.range(0.15, 1) : clamp(tier, 0, 1);
    const base = 52 + t * 38;
    const sys = SYSTEMS_KEYS[Math.floor(rng.next() * SYSTEMS_KEYS.length)];
    return {
      id: `c${Math.floor(rng.next() * 1e9)}`,
      role: 'coach',
      name: name(rng),
      system: sys,
      off: clamp(Math.round(base + rng.range(-7, 9)), 40, 99),
      def: clamp(Math.round(base + rng.range(-9, 7)), 40, 99),
      dev: clamp(Math.round(base + rng.range(-8, 10)), 40, 99),
      rot: clamp(Math.round(base + rng.range(-10, 6)), 40, 99),
      ovr: 0,
      ask: 0,
    };
  }

  function makeScout(rng, tier) {
    const t = tier == null ? rng.range(0.15, 1) : clamp(tier, 0, 1);
    const base = 52 + t * 38;
    return {
      id: `s${Math.floor(rng.next() * 1e9)}`,
      role: 'scout',
      name: name(rng),
      eye: clamp(Math.round(base + rng.range(-6, 8)), 40, 99),   // 看人准不准
      ovr: 0,
      ask: 0,
    };
  }

  function finish(m) {
    if (m.role === 'coach') {
      m.ovr = Math.round(m.off * 0.34 + m.def * 0.3 + m.dev * 0.2 + m.rot * 0.16);
      m.ask = Math.round((1200000 + Math.pow(m.ovr - 45, 2.05) * 900) / 100000) * 100000;
    } else {
      m.ovr = m.eye;
      m.ask = Math.round((700000 + Math.pow(m.ovr - 45, 2.0) * 600) / 100000) * 100000;
    }
    return m;
  }

  function makeMarket(state, rng, nCoach = 5, nScout = 5) {
    const list = [];
    for (let i = 0; i < nCoach; i++) list.push(finish(makeCoach(rng, rng.range(0.1, 0.95))));
    for (let i = 0; i < nScout; i++) list.push(finish(makeScout(rng, rng.range(0.1, 0.95))));
    // one genuinely good name per refresh so the market always has a prize
    const elite = finish(makeCoach(rng, rng.range(0.85, 1)));
    list.push(elite);
    return list;
  }

  // what the coach does to the way the team plays
  function systemOf(coach) {
    return coach && SYSTEMS[coach.system] ? SYSTEMS[coach.system] : null;
  }

  function tacticsFor(coach, base) {
    const sys = systemOf(coach);
    const t = { ...(base || {}) };
    if (!sys) return t;
    t.threeBias = clamp((t.threeBias || 0) + sys.threeBias, -1, 1.5);
    t.isoBias = clamp((t.isoBias || 0) + sys.isoBias, -1, 1.5);
    t.pace = clamp((t.pace || 0) + sys.pace, -0.5, 0.5);
    t.actionBias = { ...(t.actionBias || {}) };
    Object.entries(sys.actions || {}).forEach(([k, v]) => {
      t.actionBias[k] = clamp((t.actionBias[k] || 0) + v, -0.8, 0.8);
    });
    t.coachName = coach.name;
    t.coachSystem = sys.name;
    return t;
  }

  function coachOff(coach) { return coach ? 0.94 + (coach.off / 99) * 0.12 : 1; }
  function coachDef(coach) { return coach ? 0.94 + (coach.def / 99) * 0.12 : 1; }
  function coachDev(coach) { return coach ? 0.88 + (coach.dev / 99) * 0.24 : 1; }

  root.Staff = {
    SYSTEMS, SYSTEMS_KEYS, makeMarket, makeCoach, makeScout, finish,
    systemOf, tacticsFor, coachOff, coachDef, coachDev, name,
  };
})(typeof window !== 'undefined' ? window : globalThis);
