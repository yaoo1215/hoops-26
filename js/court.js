/* Full-court animation with continuous motion.
   Players glide toward targets every frame (no teleports), the ball rides with whoever
   holds it, and each possession runs a small tactical script: pick-and-roll, drive,
   drive-and-kick, or give-and-go. The engine has already decided the outcome — this
   only decides how it looks. */
(function (root) {
  'use strict';

  const W = 940, H = 500, MID = 470;
  const HOOP = { right: [872, 250], left: [68, 250] };
  const ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];
  const PREF = { PG: [0, 1, 2, 3, 4], SG: [1, 0, 2, 4, 3], SF: [2, 1, 0, 3, 4], PF: [3, 4, 0, 1, 2], C: [4, 3, 0, 1, 2] };

  let el = null;
  let svg = null;
  let meta = { home: {}, away: {} };
  let raf = null;
  let lastFrame = 0;
  let phase = 0;

  const state = {
    five: { home: [], away: [] },
    off: 'home',
    lastOff: null,
    pos: {},          // id -> { x, y, tx, ty, spd, side, mark }
    pmap: {},         // id -> player (shooting-based spots)
    man: {},          // defender id -> offensive id he is guarding
    ball: { x: MID, y: 250, holder: null, flight: false },
  };

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hoopFor = (side) => HOOP[side === 'home' ? 'right' : 'left'];
  const ownHoopFor = (side) => HOOP[side === 'home' ? 'left' : 'right'];
  const dirFor = (side) => (side === 'home' ? 1 : -1);

  // Team colours straight from the palette are unusable on a dark court (Brooklyn and
  // San Antonio are near-black). Lift the lightness and keep the hue, so navy stays navy
  // and purple stays purple instead of both turning grey.
  function teamColor(hex) {
    if (!hex) return '#8fb3d9';
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return '#8fb3d9';
    const n = parseInt(m[1], 16);
    let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, sat = 0;
    const l0 = (max + min) / 2;
    const d = max - min;
    if (d > 0.0001) {
      sat = l0 > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    const grey = sat < 0.12;
    const l = grey ? 0.66 : clamp(l0, 0.46, 0.56);
    const S = grey ? 0 : clamp(sat, 0.36, 0.66);
    const hue2rgb = (p1, q1, t) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p1 + (q1 - p1) * 6 * tt;
      if (tt < 1 / 2) return q1;
      if (tt < 2 / 3) return p1 + (q1 - p1) * (2 / 3 - tt) * 6;
      return p1;
    };
    const q = l < 0.5 ? l * (1 + S) : l + S - l * S;
    const p1 = 2 * l - q;
    const R = Math.round(hue2rgb(p1, q, h + 1 / 3) * 255);
    const G = Math.round(hue2rgb(p1, q, h) * 255);
    const B = Math.round(hue2rgb(p1, q, h - 1 / 3) * 255);
    return `rgb(${R},${G},${B})`;
  }

  function spotForPlayer(p, offSide) {
    const [hx, hy] = hoopFor(offSide);
    const d = dirFor(offSide);
    const three = p.three == null ? 50 : p.three;
    const stretch = three >= (p.pos === 'C' ? 68 : 62);
    switch (p.pos) {
      case 'PG': return [hx - 300 * d, hy + 8];
      case 'SG': return [hx - 205 * d, hy - 165];
      case 'SF': return [hx - 205 * d, hy + 165];
      case 'PF': return stretch && Math.random() > 0.3 ? [hx - 120 * d, hy - 205] : [hx - 120 * d, hy - 70];
      case 'C': return stretch && Math.random() > 0.35 ? [hx - 108 * d, hy + 200] : [hx - 95 * d, hy + 55];
      default: return [hx - 250 * d, hy];
    }
  }

  function spotsFor(side) {
    const [hx, hy] = hoopFor(side);
    const d = dirFor(side);
    return {
      PG: [hx - 300 * d, hy],
      SG: [hx - 205 * d, hy - 152],
      SF: [hx - 205 * d, hy + 152],
      PF: [hx - 128 * d, hy - 84],
      C: [hx - 128 * d, hy + 84],
    };
  }

  /* ---------------- court ---------------- */
  function court() {
    return `<rect x="0" y="0" width="${W}" height="${H}" fill="#0e1522" rx="10"/>
      <rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="#2b3b53" stroke-width="3"/>
      <line x1="${MID}" y1="14" x2="${MID}" y2="${H - 14}" stroke="#2b3b53" stroke-width="2"/>
      <circle cx="${MID}" cy="250" r="48" fill="none" stroke="#2b3b53" stroke-width="2"/>
      <circle cx="${MID}" cy="250" r="6" fill="#2b3b53"/>
      <defs>
        <clipPath id="cl3"><rect x="234" y="14" width="260" height="472"/></clipPath>
        <clipPath id="cr3"><rect x="${W - 494}" y="14" width="260" height="472"/></clipPath>
      </defs>
      <path d="M 234 14 L 234 98 M 234 402 L 234 486" stroke="#2b3b53" stroke-width="2"/>
      <circle cx="${HOOP.left[0]}" cy="${HOOP.left[1]}" r="225" fill="none" stroke="#2b3b53" stroke-width="2" clip-path="url(#cl3)"/>
      <path d="M ${W - 234} 14 L ${W - 234} 98 M ${W - 234} 402 L ${W - 234} 486" stroke="#2b3b53" stroke-width="2"/>
      <circle cx="${HOOP.right[0]}" cy="${HOOP.right[1]}" r="225" fill="none" stroke="#2b3b53" stroke-width="2" clip-path="url(#cr3)"/>
      <rect x="14" y="170" width="190" height="160" fill="#0b111b" stroke="#2b3b53" stroke-width="3"/>
      <path d="M 204 170 A 80 80 0 0 1 204 330" fill="none" stroke="#2b3b53" stroke-width="2"/>
      <path d="M 204 170 A 80 80 0 0 0 204 330" fill="none" stroke="#2b3b53" stroke-width="2" stroke-dasharray="5 5"/>
      <path d="M 14 205 L 56 205 A 45 45 0 0 1 56 295 L 14 295" fill="none" stroke="#2b3b53" stroke-width="2"/>
      <rect x="${W - 204}" y="170" width="190" height="160" fill="#0b111b" stroke="#2b3b53" stroke-width="3"/>
      <path d="M ${W - 204} 170 A 80 80 0 0 0 ${W - 204} 330" fill="none" stroke="#2b3b53" stroke-width="2"/>
      <path d="M ${W - 204} 170 A 80 80 0 0 1 ${W - 204} 330" fill="none" stroke="#2b3b53" stroke-width="2" stroke-dasharray="5 5"/>
      <path d="M ${W - 14} 205 L ${W - 56} 205 A 45 45 0 0 0 ${W - 56} 295 L ${W - 14} 295" fill="none" stroke="#2b3b53" stroke-width="2"/>
      <circle cx="${HOOP.left[0]}" cy="${HOOP.left[1]}" r="8" fill="none" stroke="#ff8c42" stroke-width="3"/>
      <circle cx="${HOOP.right[0]}" cy="${HOOP.right[1]}" r="8" fill="none" stroke="#ff8c42" stroke-width="3"/>
      <g id="ct-players"></g><g id="ct-ball"></g>`;
  }

  function init(svgEl, m) {
    el = svgEl;
    meta = m;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="height:380px;max-width:100%;display:block;margin:0 auto" preserveAspectRatio="xMidYMid meet">${court()}</svg>`;
    svg = el.querySelector('svg');
    state.pos = {};
    state.ball = { x: MID, y: 250, holder: null, flight: false };
    const b = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    b.setAttribute('id', 'ct-ball-dot');
    b.setAttribute('r', '7.5');
    b.setAttribute('fill', '#ffd27a');
    b.setAttribute('stroke', '#4a2f00');
    b.setAttribute('stroke-width', '1');
    el.querySelector('#ct-ball').appendChild(b);
    if (raf) cancelAnimationFrame(raf);
    lastFrame = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function makeNode(id, p, side) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const color = side === 'home' ? teamColor(meta.home.color) : teamColor(meta.away.color);
    g.innerHTML = `<circle r="13.5" fill="${color}" stroke="#ffffff" stroke-width="2" stroke-opacity=".85"/>
      <text text-anchor="middle" y="4" font-size="10" font-weight="800" fill="#0b0e14">${(p.num || '').toString().slice(0, 3)}</text>`;
    el.querySelector('#ct-players').appendChild(g);
    return g;
  }

  function place(id, x, y) {
    if (!state.pos[id]) return;
    state.pos[id].x = x; state.pos[id].y = y;
    state.pos[id].tx = x; state.pos[id].ty = y;
  }
  function go(id, x, y, spd) {
    const p = state.pos[id];
    if (!p) return;
    p.tx = clamp(x, 22, W - 22);
    p.ty = clamp(y, 22, H - 22);
    if (spd) p.spd = spd;
  }

  // On the ball: stay a metre off him, shade toward the rim.
  // Off the ball: sink into the paint, more on the weak side, but never deeper
  // than the restricted area, and slide back out on a pass to the other side.
  function defenseTarget(id, hx, hy) {
    const p = state.pos[id];
    const man = p.mark && state.pos[p.mark];
    if (!man) return null;
    if (p.helpUntil && performance.now() < p.helpUntil) return [p.helpX, p.helpY];
    let onBall = state.ball.holder === p.mark;
    if (!state.ball.holder) {
      // loose ball: whoever is closest to it is the one closing out
      const ids = Object.keys(state.pos).filter((x) => state.pos[x].side !== state.off);
      const nearest = ids.sort((a, b) => Math.hypot(state.pos[a].x - state.ball.x, state.pos[a].y - state.ball.y)
        - Math.hypot(state.pos[b].x - state.ball.x, state.pos[b].y - state.ball.y))[0];
      onBall = nearest === id;
    }
    if (onBall) {
      const k = 0.085;
      return [man.x + (hx - man.x) * k + p.offX * 0.25, man.y + (hy - man.y) * k + p.offY * 0.25];
    }
    const ballSide = state.ball.y < 250 ? -1 : 1;
    const weak = (man.y < 250 ? -1 : 1) !== ballSide;
    const sag = weak ? 0.46 : 0.30;
    let tx = man.x + (hx - man.x) * sag;
    let ty = man.y + (hy - man.y) * sag;
    // never lose him by more than a couple of steps
    const gap = Math.hypot(tx - man.x, ty - man.y);
    if (gap > 130) {
      tx = man.x + (tx - man.x) * (130 / gap);
      ty = man.y + (ty - man.y) * (130 / gap);
    }
    const dist = Math.hypot(tx - hx, ty - hy);
    if (dist < 78) {
      const ang = Math.atan2(ty - hy, tx - hx);
      tx = hx + Math.cos(ang) * 78;
      ty = hy + Math.sin(ang) * 78;
    }
    return [tx, ty];
  }

  // two nearest defenders collapse on a drive, then recover
  function setHelp(driverId, ms) {
    const [hx, hy] = hoopFor(state.off);
    const d = driverId && state.pos[driverId];
    if (!d) return;
    const def = Object.keys(state.pos).filter((id) => state.pos[id].side !== state.off);
    def.sort((a, b) => Math.hypot(state.pos[a].x - d.x, state.pos[a].y - d.y)
      - Math.hypot(state.pos[b].x - d.x, state.pos[b].y - d.y));
    def.slice(0, 2).forEach((id, i) => {
      const p = state.pos[id];
      p.helpX = hx - dirFor(state.off) * (95 + i * 30) + (i ? 26 : -26);
      p.helpY = hy + (i ? 34 : -34);
      p.helpUntil = performance.now() + ms;
    });
  }

  /* ---------------- frame loop ---------------- */
  function tick(now) {
    const dt = Math.min(0.06, (now - lastFrame) / 1000);
    lastFrame = now;
    phase += dt;
    const [hx, hy] = hoopFor(state.off);
    for (const id in state.pos) {
      const p = state.pos[id];
      if (!p.node) continue;
      if (p.side !== state.off) {
        const t = defenseTarget(id, hx, hy);
        if (t) { p.tx = t[0]; p.ty = t[1]; }
      }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const step = Math.min(dist, p.spd * dt);
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
      // players never stand perfectly still: a small shuffle keeps the set alive
      const wob = Math.sin(phase * 2.1 + p.ph) * (dist > 6 ? 0 : 2.2);
      const bob = Math.cos(phase * 1.7 + p.ph * 1.3) * (dist > 6 ? 0 : 2.0);
      p.node.setAttribute('transform', `translate(${(p.x + wob).toFixed(1)},${(p.y + bob).toFixed(1)})`);
    }
    const dot = document.getElementById('ct-ball-dot');
    if (dot) {
      if (state.ball.holder && state.pos[state.ball.holder]) {
        const h = state.pos[state.ball.holder];
        state.ball.x = h.x + 15;
        state.ball.y = h.y - 6;
      }
      dot.setAttribute('transform', `translate(${state.ball.x.toFixed(1)},${state.ball.y.toFixed(1)})`);
    }
    raf = requestAnimationFrame(tick);
  }

  /* ---------------- ball ---------------- */
  let ballToken = 0;
  function holdBall(id) { state.ball.holder = id; }
  function releaseBall() { state.ball.holder = null; return { x: state.ball.x, y: state.ball.y }; }
  function tweenBall(to, dur, arcH) {
    dur = Math.max(60, dur / speed);
    const from = { x: state.ball.x, y: state.ball.y };
    const token = ++ballToken;
    state.ball.holder = null;
    state.ball.flight = true;
    const start = performance.now();
    return new Promise((resolve) => {
      function step(now) {
        if (token !== ballToken) return resolve();
        const t = clamp((now - start) / dur, 0, 1);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        state.ball.x = from.x + (to[0] - from.x) * e;
        state.ball.y = from.y + (to[1] - from.y) * e - (arcH || 0) * Math.sin(Math.PI * e);
        if (t < 1) requestAnimationFrame(step);
        else { state.ball.flight = false; resolve(); }
      }
      requestAnimationFrame(step);
    });
  }
  async function passTo(id, dur = 230, arc = 14) {
    const p = state.pos[id];
    if (!p) return;
    dur = Math.max(60, dur / speed);
    state.ball.holder = null;
    const token = ++ballToken;
    const from = { x: state.ball.x, y: state.ball.y };
    const start = performance.now();
    await new Promise((resolve) => {
      function step(now) {
        if (token !== ballToken) return resolve();
        const t = clamp((now - start) / dur, 0, 1);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const tx = p.x + 15, ty = p.y - 6;
        state.ball.x = from.x + (tx - from.x) * e;
        state.ball.y = from.y + (ty - from.y) * e - arc * Math.sin(Math.PI * e);
        if (t < 1) requestAnimationFrame(step); else resolve();
      }
      requestAnimationFrame(step);
    });
    state.ball.holder = id;
  }

  let speed = 1;
  function setSpeed(x) { speed = Math.max(0.5, Math.min(8, Number(x) || 1)); }
  const PACE = 1.5;   // 1x reads at roughly 3s per possession
  function wait(ms) { return new Promise((r) => setTimeout(r, Math.max(20, (ms * PACE) / speed))); }

  /* ---------------- lineups ---------------- */
  function assign(five, players, side) {
    const out = {};
    five.forEach((id) => {
      const p = (players && players[id]) || state.pmap[id] || {};
      out[id] = spotForPlayer(p, side);
    });
    return out;
  }

  function setLineups(five, players, offSide) {
    state.five = five;
    state.off = offSide || 'home';
    state.lastOff = null;
    document.querySelectorAll('#ct-players g').forEach((n) => n.remove());
    state.pos = {};
    state.pmap = players || {};
    for (const side of ['home', 'away']) {
      const ids = five[side] || [];
      const spots = assign(ids, players, state.off);
      ids.forEach((id, i) => {
        const p = players[id];
        if (!p) return;
        const base = spots[id] || [MID, 250];
        const node = makeNode(id, p, side);
        state.pos[id] = {
          x: base[0] + rnd(-10, 10), y: base[1] + rnd(-8, 8),
          tx: base[0], ty: base[1], spd: 130, side, node, ph: rnd(0, 6.28), pos: p.pos,
          mark: null, offX: 12, offY: 10,
        };
      });
    }
    state.ball = { x: MID, y: 250, holder: null, flight: false };
  }

  function playersOn(side) {
    return (state.five[side] || []).filter((id) => state.pos[id]);
  }
  function bigsOn(side) {
    return playersOn(side).filter((id) => state.pos[id].pos === 'C' || state.pos[id].pos === 'PF');
  }
  function guardsOn(side) {
    return playersOn(side).filter((id) => state.pos[id].pos === 'PG' || state.pos[id].pos === 'SG');
  }

  function assignMarks(offSide) {
    const defSide = offSide === 'home' ? 'away' : 'home';
    const offIds = playersOn(offSide);
    playersOn(defSide).forEach((id, i) => {
      const p = state.pos[id];
      p.mark = offIds[i] || null;
      p.offX = i % 2 ? 13 : -13;
      p.offY = i % 2 ? 11 : -11;
    });
  }
  function clearMarks() {
    for (const id in state.pos) state.pos[id].mark = null;
  }

  /* ---------------- formations ---------------- */
  // half-court set: everyone to his spot, defenders between man and rim
  function halfCourt(offSide, opts = {}) {
    const off = offSide;
    const spots = assign(playersOn(off), {}, off);
    const [hx, hy] = hoopFor(off);
    for (const id of playersOn(off)) {
      const base = spots[id] || [MID, 250];
      go(id, base[0] + rnd(-6, 6), base[1] + rnd(-6, 6), opts.spd || 150);
    }
    assignMarks(off);
  }

  // running the floor: offence starts in its own half and pushes up
  function transition(offSide) {
    clearMarks();
    const [ox, oy] = ownHoopFor(offSide);
    const d = dirFor(offSide);
    const ids = playersOn(offSide);
    ids.forEach((id, i) => {
      place(id, ox + d * rnd(20, 70), clamp(250 + (i - 2) * 46 + rnd(-16, 16), 60, H - 60));
    });
    const defSide = offSide === 'home' ? 'away' : 'home';
    playersOn(defSide).forEach((id, i) => {
      const [hx] = hoopFor(offSide);
      place(id, hx - d * rnd(120, 240), clamp(250 + (i - 2) * 50 + rnd(-16, 16), 60, H - 60));
    });
    halfCourt(offSide, { spd: 200 });
  }

  /* ---------------- tactical scripts ---------------- */
  function nearestBigTo(offSide, id) {
    const p = state.pos[id];
    const bigs = bigsOn(offSide);
    if (!bigs.length) return null;
    return bigs.sort((a, b) => Math.hypot(state.pos[a].x - p.x, state.pos[a].y - p.y)
      - Math.hypot(state.pos[b].x - p.x, state.pos[b].y - p.y))[0];
  }
  function bestHandler(offSide, exclude) {
    const g = guardsOn(offSide).filter((x) => x !== exclude);
    return (g.length ? g : playersOn(offSide).filter((x) => x !== exclude))[0];
  }
  function bestShooter(offSide, exclude) {
    return playersOn(offSide).filter((x) => x !== exclude)
      .sort((a, b) => ((meta.k2 && meta.k2[b]) || 0) - ((meta.k2 && meta.k2[a]) || 0))[0]
      || playersOn(offSide)[0];
  }

  // 挡拆：大个上来掩护，持球人借掩护突破，大个顺下
  async function playPnR(ev, offSide) {
    const [hx, hy] = hoopFor(offSide);
    const d = dirFor(offSide);
    const h = ev.pid;
    const big = nearestBigTo(offSide, h);
    go(h, hx - d * 250, hy + rnd(-24, 24), 170);
    if (big) go(big, hx - d * 205, hy + 40, 165);
    await wait(420);
    if (big) {
      go(big, state.pos[h].x - d * 12, state.pos[h].y + 34, 90);   // set the screen
      await wait(260);
    }
    go(h, hx - d * 120, hy + rnd(-40, 40), 230);                   // turn the corner
    if (big) go(big, hx - d * 55, hy + rnd(-34, 34), 210);          // roll to the rim
    await wait(520);
  }

  // 突破上篮：从侧翼启动，两步过人后上篮
  async function playDrive(ev, offSide) {
    const [hx, hy] = hoopFor(offSide);
    const d = dirFor(offSide);
    const h = ev.pid;
    go(h, hx - d * 190, hy + (hx > MID ? 120 : -120), 220);
    await wait(320);
    go(h, hx - d * 95, hy + rnd(-55, 55), 250);
    setHelp(h, 1600);
    await wait(300);
    go(h, hx - d * 34, hy + rnd(-26, 26), 260);
    await wait(300);
  }

  // 突破分球：一个后卫突破吸引协防，回传外线
  async function playKick(ev, offSide) {
    const [hx, hy] = hoopFor(offSide);
    const d = dirFor(offSide);
    const driver = bestHandler(offSide, ev.pid) || ev.pid;
    const shooter = ev.pid;
    holdBall(driver);
    go(driver, hx - d * 210, hy + 110, 210);
    await wait(300);
    go(driver, hx - d * 70, hy + rnd(-30, 40), 250);      // get into the paint
    setHelp(driver, 1800);
    await wait(420);
    const spot = [hx - d * 250, hy + (ev.shot === 'three' ? (Math.random() < 0.5 ? -170 : 170) : -110)];
    go(shooter, spot[0], spot[1], 200);
    await wait(260);
    await passTo(shooter, 240, 26);
    await wait(180);
  }

  // 传切：侧翼把球给弧顶，空切篮下，回传上篮
  async function playCut(ev, offSide) {
    const [hx, hy] = hoopFor(offSide);
    const d = dirFor(offSide);
    const cutter = ev.pid;
    const feeder = bestHandler(offSide, cutter) || playersOn(offSide)[1] || cutter;
    go(feeder, hx - d * 290, hy, 190);
    go(cutter, hx - d * 200, hy + 150, 180);
    holdBall(feeder);
    await wait(380);
    await passTo(cutter, 230, 16);          // ball to the wing
    await wait(160);
    go(cutter, hx - d * 40, hy + rnd(-24, 24), 250);   // cut hard to the rim
    const loner = playersOn(offSide).find((x) => x !== cutter && x !== feeder);
    if (loner) go(loner, hx - d * 150, hy - 140, 170);  // clear the lane
    await wait(430);
    await passTo(cutter, 210, 12);          // return pass for the layup
    await wait(120);
  }

  // 定点投篮：球在外线倒两手再出手
  async function playSpot(ev, offSide) {
    const [hx, hy] = hoopFor(offSide);
    const d = dirFor(offSide);
    const h = ev.pid;
    go(h, hx - d * 245, hy + (ev.shot === 'three' ? 150 : -60), 190);
    const mate = playersOn(offSide).find((x) => x !== h);
    if (mate) { go(mate, hx - d * 280, hy + (Math.random() < 0.5 ? 90 : -90), 175); }
    await wait(330);
    if (mate) { await passTo(mate, 220, 18); await wait(120); await passTo(h, 220, 18); }
    await wait(140);
  }

  async function playPost(ev, offSide) {
    const [hx, hy] = hoopFor(offSide);
    const d = dirFor(offSide);
    go(ev.pid, hx - d * 70, hy + (ev.pid && Math.random() < 0.5 ? 60 : -60), 160);
    await wait(420);
    go(ev.pid, hx - d * 44, hy + rnd(-24, 24), 120);
    await wait(240);
  }

  function scenarioOf(ev) {
    const play = ev.play || 'spot';
    if (play === 'transition') return 'transition';
    if (play === 'pnr') return 'pnr';
    if (play === 'cut') return 'cut';
    if (play === 'post') return 'post';
    if (ev.shot === 'three' && (play === 'iso' || play === 'spot' || play === 'offscreen')) return 'kick';
    if (ev.shot === 'rim' && (play === 'iso' || play === 'spot' || play === 'offscreen')) return 'drive';
    return 'spot';
  }

  async function showEvent(ev, players, offSide) {
    const [hx, hy] = hoopFor(offSide);
    const d = dirFor(offSide);
    const changed = state.lastOff !== offSide;

    if (changed) {
      state.lastOff = offSide;
      transition(offSide);
      await wait(620);
    }
    if (!state.pos[ev.pid]) return;

    const sc = scenarioOf(ev);
    // the ball starts with whoever runs the action
    const initiator = sc === 'kick' ? (bestHandler(offSide, ev.pid) || ev.pid)
      : sc === 'cut' ? (bestHandler(offSide, ev.pid) || ev.pid) : ev.pid;
    holdBall(initiator);
    assignMarks(offSide);

    if (sc === 'pnr') await playPnR(ev, offSide);
    else if (sc === 'drive') await playDrive(ev, offSide);
    else if (sc === 'kick') await playKick(ev, offSide);
    else if (sc === 'cut') await playCut(ev, offSide);
    else if (sc === 'post') await playPost(ev, offSide);
    else if (sc === 'transition') { go(ev.pid, hx - d * 140, hy, 240); await wait(360); }
    else await playSpot(ev, offSide);

    if (state.ball.holder !== ev.pid) {
      // make sure the shooter actually has it before the release
      if (state.pos[ev.pid]) { await passTo(ev.pid, 170, 8); await wait(90); }
    }

    const shooter = state.pos[ev.pid] || { x: hx - d * 100, y: hy };
    const isThree = ev.shot === 'three';
    flash(isThree ? '三分' : ev.shot === 'rim' ? '上篮' : '中投', 'rgba(255,255,255,.6)', shooter.x, shooter.y - 30);

    const arc = isThree ? 68 : ev.shot === 'mid' ? 34 : 16;
    const rel = isThree ? 0.42 : 0.72;
    await tweenBall([shooter.x + (hx - shooter.x) * rel, shooter.y + (hy - shooter.y) * rel], isThree ? 400 : 280, arc * 0.62);
    await tweenBall([hx, hy], isThree ? 300 : 230, arc * 0.38);

    if (ev.made) {
      flash(ev.pts >= 3 ? '+3' : '+2', '#37c98b', hx - d * 46, hy - 48);
      await wait(220);
    } else {
      const reb = ev.reb && state.pos[ev.reb];
      if (isThree) {
        const side = shooter.y < 250 ? 1 : -1;
        const lx = clamp(hx - d * rnd(90, 170), 60, W - 60);
        const ly = clamp(250 + side * rnd(80, 150), 60, H - 60);
        await tweenBall([lx, ly], 300, 26);
        await wait(160);
        if (reb) { go(ev.reb, lx, ly, 240); await wait(230); holdBall(ev.reb); }
      } else if (reb) {
        await tweenBall([state.pos[ev.reb].x, state.pos[ev.reb].y], 240, 10);
        await wait(150);
        holdBall(ev.reb);
      } else {
        await tweenBall([hx - d * 40, hy + rnd(-40, 40)], 240, 8);
      }
      await wait(150);
    }
  }

  function flash(text, color, x, y) {
    if (!el || !svg) return;
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '19');
    t.setAttribute('font-weight', '800');
    t.setAttribute('fill', color);
    t.textContent = text;
    t.style.transition = 'opacity .8s, transform .8s';
    svg.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '0'; t.setAttribute('transform', 'translate(0,-18)'); });
    setTimeout(() => t.remove(), 900);
  }

  root.Court = {
    init, setLineups, showEvent, halfCourt, transition, wait, setSpeed,
    state, HOOP, teamColor, go, holdBall,
  };
})(typeof window !== 'undefined' ? window : globalThis);
