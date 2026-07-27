// levelcheck.js — reachability analysis, shared by three callers:
//   validate.cjs   (CLI / CI)
//   editor.html    (live validation while you paint)
//   tests/         (Playwright asserts the shipped levels in a real browser)
//
// One copy on purpose. A validator that drifts from the game is worse than no
// validator, and a validator that drifts from the EDITOR ships broken levels
// that CI then rejects.
(function (root, Physics) {
  'use strict';
  const P = Physics.P, T = P.TILE;

  const SOLID = '#', ONEWAY = '-', PICKUPS = 'h*c', HAZARD = 'u';
  const LEGAL = ['.', '#', '-', 'h', '*', 'c', 'u', 'g', 'P', 'E', '~'];
  const LEGAL_SET = {};
  LEGAL.forEach((c) => { LEGAL_SET[c] = true; });

  function parse(rows) {
    const w = rows[0] ? rows[0].length : 0, h = rows.length;
    const at = (tx, ty) => (tx < 0 || ty < 0 || tx >= w || ty >= h ? '.' : rows[ty][tx]);
    return {
      w: w, h: h, at: at,
      // Off the left/right edge counts as wall so simulations can't run off-map.
      solid: (tx, ty) => (tx < 0 || tx >= w ? true : at(tx, ty) === SOLID),
      oneWay: (tx, ty) => at(tx, ty) === ONEWAY,
    };
  }

  function structural(rows, m) {
    const errs = [];
    let p = 0, e = 0;
    rows.forEach((row, y) => {
      if (row.length !== m.w) errs.push('row ' + y + ' is ' + row.length + ' chars, expected ' + m.w);
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (!LEGAL_SET[ch]) errs.push("row " + y + ": illegal char '" + ch + "'");
        if (ch === 'P') p++;
        if (ch === 'E') e++;
      }
    });
    if (p !== 1) errs.push('expected exactly 1 spawn (P), found ' + p);
    if (e !== 1) errs.push('expected exactly 1 goal (E), found ' + e);
    return errs;
  }

  // Standable only if the body — TWO tiles tall, PH=40 > TILE=24 — actually fits
  // above it. Miss this and one-tile crawlspaces validate as walkable.
  function isStand(m, tx, ty) {
    if (!(m.solid(tx, ty) || m.oneWay(tx, ty))) return false;
    return !m.solid(tx, ty - 1) && !m.solid(tx, ty - 2);
  }

  const PLANS = (function () {
    const out = [];
    const dirs = [-1, 0, 1], jumps = ['none', 'short', 'full'], airs = [0, 10, 18, 26];
    for (let a = 0; a < dirs.length; a++)
      for (let b = 0; b < jumps.length; b++)
        for (let c = 0; c < airs.length; c++)
          out.push({ dir: dirs[a], jump: jumps[b], air: airs[c] });
    return out;
  })();

  function inputAt(plan, f) {
    const held = plan.jump === 'full' ? 40 : plan.jump === 'short' ? 5 : 0;
    return {
      left: plan.dir < 0, right: plan.dir > 0, down: false,
      jumpPressed: (plan.jump !== 'none' && f === 0) || (plan.air > 0 && f === plan.air),
      jumpHeld: (plan.jump !== 'none' && f < held) || (plan.air > 0 && f >= plan.air && f < plan.air + 40),
    };
  }

  // rows -> { errs, w, h, stands, reached, targets, missed, spawn }
  function analyse(rows) {
    const m = parse(rows);
    const errs = structural(rows, m);
    if (errs.length) return { errs: errs, m: m, targets: [], missed: [], stands: 0, reached: 0 };

    const worldH = m.h * T;
    const stands = {};
    let standCount = 0;
    for (let ty = 0; ty < m.h; ty++)
      for (let tx = 0; tx < m.w; tx++)
        if (isStand(m, tx, ty)) { stands[tx + ',' + ty] = true; standCount++; }

    const targets = [];
    let spawn = null;
    for (let ty = 0; ty < m.h; ty++)
      for (let tx = 0; tx < m.w; tx++) {
        const ch = m.at(tx, ty);
        if (PICKUPS.indexOf(ch) >= 0 || ch === 'E')
          targets.push({ ch: ch, tx: tx, ty: ty, cx: tx * T + T / 2, cy: ty * T + T / 2, got: false });
        if (ch === 'P' && !spawn) spawn = { tx: tx, ty: ty };
      }

    // P floats above whatever it lands on; find that surface.
    let sy = spawn.ty;
    while (sy < m.h && !(m.solid(spawn.tx, sy) || m.oneWay(spawn.tx, sy))) sy++;
    const start = spawn.tx + ',' + sy;
    if (!stands[start]) {
      errs.push('spawn at (' + spawn.tx + ',' + sy + ') has no room for a two-tile-tall body');
      return { errs: errs, m: m, targets: targets, missed: targets, stands: standCount, reached: 0 };
    }

    function touch(b) {
      const l = b.x - P.PW / 2, r = b.x + P.PW / 2, t = b.y - P.PH, bo = b.y;
      for (let i = 0; i < targets.length; i++) {
        const g = targets[i];
        if (!g.got && l < g.cx + 9 && r > g.cx - 9 && t < g.cy + 9 && bo > g.cy - 9) g.got = true;
      }
    }
    const hazard = (b) => Physics.scan(b.x - P.PW / 2, b.x + P.PW / 2, b.y - P.PH, b.y,
      (tx, ty) => m.at(tx, ty) === HAZARD);

    const seen = {}; seen[start] = true;
    const queue = [start];
    let reached = 1;
    while (queue.length) {
      const parts = queue.shift().split(',');
      const tx = +parts[0], ty = +parts[1];
      for (let i = 0; i < PLANS.length; i++) {
        const b = Physics.newBody(tx * T + T / 2, ty * T);
        b.onGround = true;
        touch(b);
        for (let f = 0; f < 120; f++) {
          Physics.step(b, inputAt(PLANS[i], f), m);
          if (b.y > worldH + 48) break;   // fell out of the world
          if (hazard(b)) break;           // insist on a damage-free route
          touch(b);
          if (b.onGround) {
            const k = Math.floor(b.x / T) + ',' + Math.round(b.y / T);
            if (stands[k] && !seen[k]) { seen[k] = true; reached++; queue.push(k); }
          }
        }
      }
    }

    const missed = targets.filter((g) => !g.got);
    return { errs: errs, m: m, targets: targets, missed: missed, stands: standCount, reached: reached, spawn: { tx: spawn.tx, ty: sy } };
  }

  root.LevelCheck = { analyse: analyse, parse: parse, isStand: isStand, LEGAL: LEGAL };
})(
  typeof module !== 'undefined' ? module.exports : window,
  typeof module !== 'undefined' ? require('./physics.js').Physics : window.Physics
);
