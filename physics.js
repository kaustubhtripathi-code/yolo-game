// physics.js — the ONE source of truth for how the character moves.
// Loaded by the browser game (classic <script>) and by tools/validate.cjs (node),
// so the reachability validator proves levels against the exact same physics
// the player feels. Change a constant here and the validator re-judges every level.
(function (root) {
  'use strict';

  const P = {
    TILE: 24,
    PW: 14,        // hitbox width
    PH: 40,        // hitbox height — deliberately > 1 tile: the player is TWO tiles tall.
    GRAVITY: 0.62,
    MAX_FALL: 11,
    RUN: 2.9,
    ACCEL: 0.6,
    FRICTION: 0.5,
    JUMP_V: -9.8,      // apex ~77px = 3.2 tiles
    AIR_JUMP_V: -8.4,
    JUMP_CUT: 0.45,    // variable jump height: release early, keep 45% of the rise
    COYOTE: 6,         // 100ms at 60fps
    BUFFER: 8,         // 140ms at 60fps
    BOOST: 1.45,       // coffee power-up speed multiplier
  };

  function newBody(x, y) {
    return {
      x: x, y: y,           // y is the FEET. body spans y-PH .. y
      vx: 0, vy: 0,
      onGround: false, coyote: 0, buffer: 0, jumps: 0,
      facing: 1, speedMul: 1,
      events: {},
    };
  }

  // Iterate the tiles overlapped by an AABB. `hit` returning true stops the scan.
  function scan(l, r, t, b, hit) {
    const T = P.TILE;
    for (let ty = Math.floor(t / T); ty <= Math.floor((b - 1e-6) / T); ty++)
      for (let tx = Math.floor(l / T); tx <= Math.floor((r - 1e-6) / T); tx++)
        if (hit(tx, ty)) return true;
    return false;
  }

  // One 60Hz tick. `inp` = {left,right,down,jumpPressed,jumpHeld}.
  // `w` = {solid(tx,ty), oneWay(tx,ty)}.
  function step(b, inp, w) {
    const T = P.TILE;
    const e = (b.events = { jump: false, airjump: false, land: false });
    const wasGround = b.onGround;

    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const top = P.RUN * b.speedMul;
    if (dir) {
      b.vx += dir * P.ACCEL;
      if (b.vx > top) b.vx = top;
      if (b.vx < -top) b.vx = -top;
      b.facing = dir;
    } else {
      const s = Math.sign(b.vx);
      b.vx -= s * Math.min(P.FRICTION, Math.abs(b.vx));
    }

    b.buffer = inp.jumpPressed ? P.BUFFER : Math.max(0, b.buffer - 1);
    if (b.onGround) { b.coyote = P.COYOTE; b.jumps = 2; }
    else {
      if (b.coyote > 0) b.coyote--;
      // Same frame, not the next one: as an else-if this left a single frame
      // where coyote was spent but the ground-strength jump was still owed,
      // quietly making 100ms of coyote time into 117ms.
      if (b.coyote === 0 && b.jumps > 1) b.jumps = 1;
    }

    if (b.buffer > 0 && b.jumps > 0) {
      const fromGround = b.jumps === 2;
      b.vy = fromGround ? P.JUMP_V : P.AIR_JUMP_V;
      b.jumps--; b.buffer = 0; b.coyote = 0; b.onGround = false;
      if (fromGround) e.jump = true; else e.airjump = true;
    }
    if (!inp.jumpHeld && b.vy < P.JUMP_V * P.JUMP_CUT) b.vy = P.JUMP_V * P.JUMP_CUT;

    b.vy = Math.min(b.vy + P.GRAVITY, P.MAX_FALL);

    // --- horizontal ---
    const wasBottom = b.y;
    b.x += b.vx;
    if (b.vx !== 0) {
      const d = b.vx > 0 ? 1 : -1;
      // top inset 3px (head forgiveness), bottom inset 2px so the floor you stand
      // on is never mistaken for a wall.
      scan(b.x - P.PW / 2, b.x + P.PW / 2, b.y - P.PH + 3, b.y - 2, function (tx, ty) {
        if (!w.solid(tx, ty)) return false;
        b.x = d > 0 ? tx * T - P.PW / 2 : (tx + 1) * T + P.PW / 2;
        b.vx = 0;
        return true;
      });
    }

    // --- vertical ---
    b.onGround = false;
    b.y += b.vy;
    const l = b.x - P.PW / 2 + 2, r = b.x + P.PW / 2 - 2;
    if (b.vy >= 0) {
      scan(l, r, b.y - P.PH, b.y, function (tx, ty) {
        const surface = ty * T;
        // Only land on a surface that was at or below the feet last frame — this
        // single guard gives one-way platforms their pass-through-from-below for free.
        if (surface < wasBottom - 1e-3) return false;
        if (!(w.solid(tx, ty) || (w.oneWay(tx, ty) && !inp.down))) return false;
        b.y = surface; b.vy = 0; b.onGround = true;
        e.land = !wasGround;
        return true;
      });
    } else {
      scan(l, r, b.y - P.PH, b.y - P.PH + T, function (tx, ty) {
        if (!w.solid(tx, ty)) return false;
        b.y = (ty + 1) * T + P.PH; b.vy = 0;
        return true;
      });
    }
    return b;
  }

  root.Physics = { P: P, newBody: newBody, step: step, scan: scan };
})(typeof module !== 'undefined' ? module.exports : window);
