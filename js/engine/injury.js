/* Injuries with three tiers.

   轻伤 (minor)  – playable, but the player is at reduced effectiveness.
   重伤 (major)  – cannot play; back after weeks.
   重创 (severe) – out for months, and when he comes back some of his game is gone
                   for good. Young players lose potential too.

   The engine only ever asks two questions: "can he play?" and "what is he worth
   right now?" — `isOut()` and `effMul()`. */
(function (root) {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // weight = relative frequency. days in calendar days.
  const TABLE = [
    { label: '脚踝扭伤', sev: 'minor', days: [1, 6], pen: 0.08, w: 22 },
    { label: '膝盖挫伤', sev: 'minor', days: [2, 7], pen: 0.10, w: 16 },
    { label: '大腿拉伤', sev: 'minor', days: [2, 8], pen: 0.09, w: 14 },
    { label: '背部紧张', sev: 'minor', days: [1, 5], pen: 0.07, w: 12 },
    { label: '手腕扭伤', sev: 'minor', days: [2, 7], pen: 0.10, w: 10 },
    { label: '脚趾挫伤', sev: 'minor', days: [1, 4], pen: 0.06, w: 8 },

    { label: '腿筋拉伤', sev: 'major', days: [12, 35], pen: 0, w: 4 },
    { label: '手掌骨折', sev: 'major', days: [20, 45], pen: 0, w: 2.5 },
    { label: '肩部拉伤', sev: 'major', days: [14, 40], pen: 0, w: 2.5 },
    { label: '肋骨骨折', sev: 'major', days: [18, 38], pen: 0, w: 1.5 },
    { label: '半月板撕裂', sev: 'major', days: [30, 70], pen: 0, w: 1.5 },

    { label: '前十字韧带撕裂', sev: 'severe', days: [150, 260], pen: 0, w: 0.35 },
    { label: '跟腱断裂', sev: 'severe', days: [170, 280], pen: 0, w: 0.22 },
    { label: '足部应力性骨折', sev: 'severe', days: [90, 160], pen: 0, w: 0.3 },
    { label: '膝盖软骨损伤', sev: 'severe', days: [80, 150], pen: 0, w: 0.28 },
  ];

  const SEV_CN = { minor: '轻伤', major: '重伤', severe: '重创' };

  function pick(rng) {
    const total = TABLE.reduce((a, x) => a + x.w, 0);
    let r = rng.next() * total;
    for (const x of TABLE) { r -= x.w; if (r <= 0) return x; }
    return TABLE[0];
  }

  /* Lay a new injury on a player. `boost` shifts severity upward for fragile bodies. */
  function injure(state, p, rng, boost = 0) {
    let row = pick(rng);
    if (boost > 0 && row.sev === 'minor' && rng.chance(clamp(boost * 0.6, 0, 0.25))) {
      const heavies = TABLE.filter((x) => x.sev !== 'minor');
      row = heavies[Math.floor(rng.next() * heavies.length)];
    }
    const days = Math.round(row.days[0] + rng.next() * (row.days[1] - row.days[0]));
    p.injury = { label: row.label, sev: row.sev, pen: row.pen, day0: state.date };
    p.injDays = days;
    p.injuryHistory = (p.injuryHistory || 0) + 1;
    return { label: row.label, sev: row.sev, days };
  }

  function isOut(p) {
    if (!p || !p.injDays || p.injDays <= 0) return false;
    return !p.injury || p.injury.sev !== 'minor';
  }

  /* Effectiveness multiplier for a player who is hurt but playing. */
  function effMul(p) {
    if (!p || !p.injDays || p.injDays <= 0) return 1;
    if (!p.injury) return 0.9;                 // legacy Injury with no record
    if (p.injury.sev === 'minor') return 1 - (p.injury.pen || 0.08);
    return 1;                                   // he is not on the floor anyway
  }

  /* Permanent damage when a severe injury heals. */
  function permanentDamage(state, p, rng) {
    const young = (p.age || 26) <= 24;
    const drop = 1 + Math.floor(rng.next() * (young ? 4 : 3));
    const keys = ['spd', 'ins', 'three', 'mid', 'handle', 'pdef', 'idef', 'reb', 'str', 'sta'];
    const hit = [];
    for (let i = 0; i < drop; i++) {
      const k = keys[Math.floor(rng.next() * keys.length)];
      const before = p[k] == null ? (p.ovr || 60) : p[k];
      p[k] = clamp(Math.round(before - (2 + Math.floor(rng.next() * 4))), 20, 99);
      hit.push(k);
    }
    const ovrDrop = 1 + Math.floor(rng.next() * (young ? 3 : 2));
    p.ovr = clamp((p.ovr || 60) - ovrDrop, 20, 96);
    if (p.k2) p.k2 = clamp(p.k2 - ovrDrop, 20, 99);
    let potDrop = 0;
    if (young && p.pot) {
      potDrop = 2 + Math.floor(rng.next() * 4);
      p.pot = clamp(p.pot - potDrop, p.ovr, 96);
    }
    return { ovrDrop, potDrop, keys: hit };
  }

  /* Called once per day for the whole league; returns healing events worth reporting. */
  function daily(state, rng) {
    const news = [];
    for (const p of state.players) {
      if (!p.injDays || p.injDays <= 0) continue;
      p.injDays -= 1;
      if (p.injDays > 0) continue;
      const rec = p.injury;
      p.injDays = 0;
      if (rec && rec.sev === 'severe') {
        const dmg = permanentDamage(state, p, rng);
        p.injury = null;
        p.lastPermDamage = { ...dmg, date: state.date };
        news.push({ p, text: `${p.name} 伤愈复出，但能力永久下降 ${dmg.ovrDrop}${dmg.potDrop ? `、潜力 -${dmg.potDrop}` : ''}` });
      } else {
        p.injury = null;
        news.push({ p, text: `${p.name} 伤愈复出` });
      }
    }
    return news;
  }

  function label(p) {
    if (!p || !p.injDays || p.injDays <= 0) return '';
    const sev = p.injury ? SEV_CN[p.injury.sev] : '伤停';
    return `${sev} ${p.injury ? p.injury.label : ''} ${p.injDays} 天`;
  }

  root.Injury = { injure, isOut, effMul, permanentDamage, daily, label, SEV_CN, TABLE };
})(typeof window !== 'undefined' ? window : globalThis);
