/* Real draft-pick ledger for 2028+.
   Ownership comes from the published trade record; swaps and protections are
   applied at draft time against the final standings. 2028 and 2029 are modelled
   clause by clause (multi-team pools included). 2030/2031 carry the transfers
   that are unconditional today; the conditional multi-team clauses there are
   flagged `simple` so the UI can say so. */
(function (root) {
  'use strict';

  // ---- who sits on the pick before any swap is resolved ----
  const OWN = {
    2028: {
      1: { ORL: 'POR', PHI: 'BKN', LAC: 'BOS', NYK: 'NYK', PHX: 'PHX',
           ATL: 'ATL', BOS: 'BOS', CLE: 'CLE', DAL: 'DAL', UTA: 'UTA', LAL: 'LAL',
           MIL: 'MIL', POR: 'POR', WAS: 'WAS', BKN: 'BKN' },
      2: {},
    },
    2029: {
      1: { IND: 'LAC', LAL: 'DAL', NYK: 'BKN', BOS: 'POR', MIL: 'WAS',
           CLE: 'UTA', MIN: 'UTA', UTA: 'CHA', DEN: 'OKC',
           DAL: 'HOU', PHX: 'BKN', ORL: 'ORL' },
      2: {},
    },
    2030: {
      1: { GSW: 'MEM', ORL: 'MEM' },
      2: {},
    },
    2031: {
      1: { LAL: 'UTA', MIA: 'MIL', MIN: 'SAC', NYK: 'BKN', PHI: 'BOS', PHX: 'MEM', TOR: 'LAC' },
      2: {},
    },
  };

  // ---- protections: inside the range the pick stays home ----
  const PROT = {
    2028: { 1: { PHI: [1, 8], LAC: [1, 16] } },
    2029: { 1: { DEN: [1, 5] } },
    2030: { 1: { GSW: [1, 20] } },
    2031: { 1: {} },
  };

  const NOTE = {
    '2028-1-UTA': '爵士拿 2028 首轮的三个里最好的（爵士/骑士/湖人）',
    '2028-1-LAL': '湖人拿三签里的第二好',
    '2028-1-CLE': '骑士拿三签里最差的',
    '2028-1-ATL': '老鹰可与骑士那一签互换，取更好的',
    '2028-1-DAL': '雷霆可与独行侠互换，取更好的',
    '2028-1-BOS': '马刺可与凯尔特人互换（绿军状元签除外）',
    '2028-1-ORL': '魔术 2028 首轮送至波特兰（经孟菲斯）',
    '2028-1-PHI': '76 人 2028 首轮送至布鲁克林，前 8 顺位保护',
    '2028-1-LAC': '快船 2028 首轮经 76 人送至凯尔特人，前 16 顺位保护',
    '2028-1-MIL': '雄鹿与开拓者互换，华盛顿再拿三签里最好的',
    '2028-1-POR': '开拓者拿雄鹿/开拓者两签里更好的',
    '2028-1-WAS': '奇才拿自己与篮网/76 人/太阳那一签里更好的',
    '2028-1-PHX': '太阳与奇才比较，取较差的',
    '2028-1-BKN': '篮网拿 76 人/篮网/尼克斯/太阳四签中最好的与第三好的',
    '2028-1-NYK': '尼克斯拿四签里第二好的',
    '2029-1-POR': '开拓者拿自己/凯尔特人/雄鹿三签中最好与最差的',
    '2029-1-WAS': '奇才拿三签里第二好的',
    '2029-1-UTA': '爵士拿自己/骑士/森林狼三签中最好的两个（狼签前 5 保护）',
    '2029-1-CHA': '黄蜂拿三签里较差的',
    '2029-1-HOU': '火箭拿自己/独行侠/太阳三签中最好的两个',
    '2029-1-BKN': '篮网拿三签里最差的',
    '2029-1-IND': '步行者 2029 首轮送至快船',
    '2029-1-LAL': '湖人 2029 首轮送至独行侠',
    '2029-1-NYK': '尼克斯 2029 首轮送至篮网',
    '2029-1-LAC': '76 人可与快船互换（快船前 3 保护）',
    '2029-1-ORL': '灰熊可与魔术互换（魔术前 2 保护）',
    '2029-1-DEN': '掘金 2029 首轮送至雷霆，前 5 顺位保护',
    '2030-1-GSW': '勇士 2030 首轮送至灰熊，前 20 顺位保护',
    '2030-1-ORL': '魔术 2030 首轮送至灰熊',
    '2031-1-LAL': '湖人 2031 首轮送至爵士',
    '2031-1-MIA': '热火 2031 首轮送至雄鹿',
    '2031-1-MIN': '森林狼 2031 首轮送至国王',
    '2031-1-NYK': '尼克斯 2031 首轮送至篮网',
    '2031-1-PHI': '76 人 2031 首轮送至凯尔特人（无保护）',
    '2031-1-PHX': '太阳 2031 首轮送至灰熊',
    '2031-1-TOR': '猛龙 2031 首轮送至快船',
  };

  // ---- helpers used by the per-year rules ----
  function better(slot, a, b, to) {
    const A = slot[a], B = slot[b];
    if (A == null || B == null) return;
    if (to === a && B < A) { slot[a] = B; slot[b] = A; }
    if (to === b && A < B) { slot[a] = B; slot[b] = A; }
  }
  // the k-th best slot among `origins` goes to targets[k]
  function pool(slot, skip, origins, targets) {
    const live = origins.filter((o) => slot[o] != null && !skip.has(o));
    const vals = live.map((o) => slot[o]).sort((x, y) => x - y);
    const tg = targets.filter((t) => slot[t] != null && !skip.has(t));
    const n = Math.min(vals.length, tg.length);
    for (let i = 0; i < n; i++) slot[tg[i]] = vals[i];
  }

  function r2028_1(slot, skip) {
    // Utah best, LAL second, Cleveland worst of the three
    pool(slot, skip, ['UTA', 'CLE', 'LAL'], ['UTA', 'LAL', 'CLE']);
    better(slot, 'ATL', 'CLE', 'ATL');
    better(slot, 'DAL', 'OKC', 'OKC');
    if (slot.BOS !== 1) better(slot, 'BOS', 'SAS', 'SAS');
    better(slot, 'POR', 'MIL', 'POR');
    // Brooklyn takes the best and third best of PHI/BKN/NYK/PHX, New York the second,
    // Phoenix the fourth; Washington then compares its own pick with that fourth.
    pool(slot, skip, ['PHI', 'BKN', 'NYK', 'PHX'], ['BKN', 'NYK', 'PHI', 'PHX']);
    better(slot, 'WAS', 'PHX', 'WAS');
    better(slot, 'WAS', 'MIL', 'WAS');
  }

  function r2029_1(slot, skip) {
    // Portland best+worst of POR/BOS/MIL, Washington the middle
    pool(slot, skip, ['POR', 'BOS', 'MIL'], ['POR', 'MIL', 'BOS']);
    // Utah two best of UTA/CLE/MIN, Charlotte the worst
    pool(slot, skip, ['UTA', 'CLE', 'MIN'], ['UTA', 'MIN', 'CLE']);
    // Houston two best of HOU/DAL/PHX, Brooklyn the worst
    pool(slot, skip, ['HOU', 'DAL', 'PHX'], ['HOU', 'DAL', 'PHX']);
    if (!skip.has('LAC')) better(slot, 'LAC', 'PHI', 'PHI');   // LAC top-3 protected
    if (!skip.has('ORL')) better(slot, 'ORL', 'MEM', 'MEM');
  }

  const RULES = { 2028: { 1: r2028_1 }, 2029: { 1: r2029_1 } };

  function ownerOf(year, round, orig) {
    const m = OWN[year] && OWN[year][round];
    return (m && m[orig]) || orig;
  }
  function noteOf(year, round, orig) {
    return NOTE[`${year}-${round}-${orig}`] || '';
  }
  function protOf(year, round, orig) {
    const m = PROT[year] && PROT[year][round];
    return (m && m[orig]) || null;
  }

  /* Returns one entry per slot: { slot, orig, owner, note, prot, protectedStay }.
     `order` is the 30 team abbrs in draft order (worst record first). */
  function resolve(year, round, order) {
    const slot = {};
    order.forEach((abbr, i) => { slot[abbr] = i + 1; });
    const skip = new Set();
    if (round === 1) {
      // protections are decided before the swaps: a protected pick never moves
      for (const orig of order) {
        const pr = protOf(year, round, orig);
        if (pr && slot[orig] >= pr[0] && slot[orig] <= pr[1]) skip.add(orig);
      }
      const fn = RULES[year] && RULES[year][round];
      if (fn) fn(slot, skip);
    }
    const out = [];
    for (const orig of order) {
      const pr = protOf(year, round, orig);
      const pinned = skip.has(orig);
      out.push({
        slot: slot[orig],
        orig,
        owner: pinned ? orig : ownerOf(year, round, orig),
        note: noteOf(year, round, orig),
        prot: pr,
        protectedStay: pinned,
        simple: year >= 2030 ? !!noteOf(year, round, orig) : false,
      });
    }
    out.sort((a, b) => a.slot - b.slot);
    return out;
  }

  root.Picks = { resolve, ownerOf, noteOf, protOf, OWN };
})(typeof window !== 'undefined' ? window : globalThis);
