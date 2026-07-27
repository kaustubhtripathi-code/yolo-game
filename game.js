// game.js — engine, screens, save. Renders at 480x270 and upscales by an
// integer factor; every draw position is rounded, because a sprite drawn at
// x=12.4 gets resampled between screen pixels and reads as blurry and smaller
// than the ones next to it.
(function () {
  'use strict';

  const { CAST, OUTFITS, LEVELS, XP_PER, LOVE_CURVE } = Content;
  const { P } = Physics;
  const T = P.TILE, VW = 480, VH = 270;
  const YOFF = 6;                       // world (11 tiles = 264px) sits under a 6px sky strip
  const STEP = 1000 / 60;

  const cv = document.getElementById('screen');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // ------------------------------------------------------------------- save
  const t = I18n.t;
  const KEY = 'yolo-save-v1';
  const fresh = () => ({ xp: 0, cast: 'a', outfit: 'default', chill: false, duo: false, trail: true, got: {}, secrets: [], cleared: [], seen: false, lang: 'en' });
  let save = fresh();
  try { Object.assign(save, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* corrupt save: start over */ }
  I18n.set(save.lang || 'en');

  // A level being edited in editor.html, played via index.html?draft=1. Kept
  // OUT of LEVELS so the memory map never sees a seventh card.
  let draftLevel = null;
  try {
    if (/[?&]draft=1/.test(location.search)) draftLevel = JSON.parse(localStorage.getItem('yolo-draft-level') || 'null');
  } catch (e) { draftLevel = null; }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} };
  const loveLevel = () => { let l = 1; for (let i = 0; i < LOVE_CURVE.length; i++) if (save.xp >= LOVE_CURVE[i]) l = i + 1; return l; };
  const addXp = (n) => { const before = loveLevel(); save.xp += n; if (loveLevel() > before) toast(t('LOVE LEVEL') + ' ' + loveLevel() + '!'); persist(); };

  // ------------------------------------------------------------------ audio
  const Sfx = (function () {
    let ac = null;
    const on = () => { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; };
    function blip(f0, f1, dur, type, vol) {
      const a = on(); if (!a) return;
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(f0, a.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), a.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.06, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur + 0.02);
    }
    return {
      unlock: on,
      jump: () => blip(300, 620, 0.12),
      air: () => blip(420, 780, 0.1),
      land: () => blip(150, 90, 0.06, 'triangle', 0.04),
      pick: () => { blip(760, 1180, 0.09, 'square', 0.05); setTimeout(() => blip(1180, 1500, 0.07, 'square', 0.04), 60); },
      heart: () => blip(520, 900, 0.16, 'triangle', 0.07),
      hurt: () => blip(220, 70, 0.22, 'sawtooth', 0.06),
      ui: () => blip(480, 620, 0.05, 'square', 0.04),
      secret: () => [0, 90, 180, 300].forEach((d, i) => setTimeout(() => blip(500 + i * 160, 700 + i * 200, 0.16, 'triangle', 0.06), d)),
      win: () => [0, 120, 240, 380, 560].forEach((d, i) => setTimeout(() => blip(400 + i * 110, 600 + i * 140, 0.2, 'triangle', 0.07), d)),
    };
  })();

  // ------------------------------------------------------------------ input
  const keys = {}, pressed = {};
  const MAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump', Enter: 'ok', Escape: 'back', KeyR: 'restart', KeyG: 'gallery' };
  addEventListener('keydown', (e) => {
    const k = MAP[e.code]; if (!k) return;
    e.preventDefault(); Sfx.unlock();
    if (!keys[k]) pressed[k] = true;
    keys[k] = true;
  });
  addEventListener('keyup', (e) => { const k = MAP[e.code]; if (k) { e.preventDefault(); keys[k] = false; } });
  document.querySelectorAll('[data-key]').forEach((el) => {
    const k = el.dataset.key;
    const down = (e) => { e.preventDefault(); Sfx.unlock(); if (!keys[k]) pressed[k] = true; keys[k] = true; el.classList.add('on'); };
    const up = (e) => { e.preventDefault(); keys[k] = false; el.classList.remove('on'); };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up); el.addEventListener('touchcancel', up);
    el.addEventListener('mousedown', down); el.addEventListener('mouseup', up); el.addEventListener('mouseleave', up);
  });
  const took = (k) => { const v = !!pressed[k]; pressed[k] = false; return v; };

  // ------------------------------------------------------------------- art
  const sheets = {};                     // "cast:outfit" -> pose canvases
  function sheetFor(castKey, outfitKey) {
    const k = castKey + ':' + outfitKey;
    return sheets[k] || (sheets[k] = Art.sheet(CAST[castKey], OUTFITS[outfitKey]));
  }
  const HEART_ON = Art.heart(true), HEART_OFF = Art.heart(false), DUST = Art.dust();
  const iconCache = {};
  const iconOf = (n) => iconCache[n] || (iconCache[n] = Art.icon(n));
  const CRITTER_BY_THEME = { neon: 'pigeon', sunset: 'crab', snow: 'pigeon', mountain: 'goat', lantern: 'scooter', dawn: 'crab' };

  // Real photos, fetched the first time a secret room opens. Loading all six on
  // boot means six 404s in the console for anyone who hasn't added theirs yet.
  const photos = {};
  function photoFor(L) {
    if (L.id in photos) return photos[L.id];
    photos[L.id] = null;
    if (L.photo) {
      const img = new Image();
      img.onload = () => { photos[L.id] = img; };
      img.src = L.photo;
    }
    return null;
  }

  // -------------------------------------------------------------- level load
  function loadLevel(def) {
    const rows = def.map, w = rows[0].length, h = rows.length;
    const at = (tx, ty) => (tx < 0 || ty < 0 || tx >= w || ty >= h ? '.' : rows[ty][tx]);
    const world = {
      solid: (tx, ty) => (tx < 0 || tx >= w ? true : at(tx, ty) === '#'),
      oneWay: (tx, ty) => at(tx, ty) === '-',
    };
    const L = {
      def, rows, w, h, world, at,
      pw: w * T, ph: h * T,
      souvenirs: [], hearts: [], coffees: [], vents: [], critters: [],
      spawn: null, goal: null, secretCols: new Set(),
      bg: Art.backdrop(def.theme, w * T, VH), tiles: Art.tiles(def.theme),
    };
    let si = 0;
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      const ch = at(tx, ty), cx = tx * T + T / 2, cy = ty * T + T / 2;
      if (ch === '*') { const s = def.souvenirs[si % def.souvenirs.length]; L.souvenirs.push({ i: si++, x: cx, y: cy, name: s.name, icon: s.icon, got: false }); }
      else if (ch === 'h') L.hearts.push({ x: cx, y: cy, got: false });
      else if (ch === 'c') L.coffees.push({ x: cx, y: cy, got: false });
      else if (ch === 'u') L.vents.push({ x: cx, y: ty * T, t: (tx * 37) % 110 });
      else if (ch === 'g') L.critters.push({ x: cx, y: (ty + 1) * T, dir: 1, f: 0, frames: Art.critter(CRITTER_BY_THEME[def.theme]) });
      else if (ch === 'P') { let sy = ty; while (sy < h && !(world.solid(tx, sy) || world.oneWay(tx, sy))) sy++; L.spawn = { x: cx, y: sy * T }; }
      else if (ch === 'E') { let sy = ty; while (sy < h && !(world.solid(tx, sy) || world.oneWay(tx, sy))) sy++; L.goal = { x: cx, y: sy * T }; }
    }
    // The secret pit: the run of empty bottom-row tiles containing '~'.
    const bottom = h - 1;
    for (let tx = 0; tx < w; tx++) if (at(tx, bottom) === '~') {
      let a = tx, b = tx;
      while (a > 0 && at(a - 1, bottom) !== '#') a--;
      while (b < w - 1 && at(b + 1, bottom) !== '#') b++;
      for (let i = a; i <= b; i++) L.secretCols.add(i);
    }
    return L;
  }

  // ------------------------------------------------------------------- state
  let screen = 'title';
  let lv = null, body = null, run = null;
  let cam = 0, camTarget = 0;
  let parts = [], tally = null, secret = null, toastMsg = null, toastT = 0;
  let sel = 0, fade = 0, frame = 0, numPressed = 0;

  function toast(msg) { toastMsg = msg; toastT = 150; }

  function startLevel(idx) {
    const def = typeof idx === 'object' ? idx : LEVELS[idx];
    lv = loadLevel(def);
    const done = save.got[lv.def.id] || [];
    lv.souvenirs.forEach((s) => { if (done.indexOf(s.i) >= 0) s.got = true; });
    body = Physics.newBody(lv.spawn.x, lv.spawn.y);
    run = {
      idx: typeof idx === 'object' ? -1 : idx,
      hearts: 3, maxHearts: 5, inv: 0, boost: 0, squash: 0, anim: 0, pose: 'idle',
      checkpoint: { x: lv.spawn.x, y: lv.spawn.y }, trail: [], deaths: 0,
      newSouvenirs: [], newHearts: 0, t: 0,
    };
    cam = camTarget = clampCam(body.x - VW / 2);
    parts = [];
    screen = 'play';
    fade = 1;
  }

  const clampCam = (x) => Math.max(0, Math.min(lv.pw - VW, x));
  const puff = (x, y, n, spread) => { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * (spread || 1.6), vy: -Math.random() * 0.9, life: 18 + Math.random() * 10, kind: 'dust' }); };
  const hearts = (x, y, n) => { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 1.4, vy: -0.7 - Math.random(), life: 40 + Math.random() * 20, kind: 'heart' }); };

  // -------------------------------------------------------------- play logic
  function hurt(fromX) {
    if (save.chill || run.inv > 0) return;
    run.hearts--; run.inv = 90;
    body.vy = -5.2; body.vx = (body.x < fromX ? -1 : 1) * 3.4;
    Sfx.hurt();
    if (run.hearts <= 0) respawn();
  }

  function respawn() {
    run.deaths++; run.hearts = 3; run.inv = 60; run.boost = 0;
    body = Physics.newBody(run.checkpoint.x, run.checkpoint.y);
    run.trail.length = 0;
    puff(body.x, body.y, 10, 3);
  }

  function tickPlay() {
    run.t++;
    const inp = {
      left: keys.left, right: keys.right, down: keys.down,
      jumpPressed: took('jump'), jumpHeld: keys.jump,
    };
    body.speedMul = run.boost > 0 ? P.BOOST : 1;
    Physics.step(body, inp, lv.world);

    if (body.events.jump) { Sfx.jump(); puff(body.x, body.y, 5); }
    if (body.events.airjump) { Sfx.air(); puff(body.x, body.y - 8, 6, 2.4); }
    if (body.events.land) { Sfx.land(); puff(body.x, body.y, 4); run.squash = 7; }

    if (run.inv > 0) run.inv--;
    if (run.boost > 0) { run.boost--; if (run.t % 4 === 0) parts.push({ x: body.x, y: body.y - 20, vx: -body.vx * 0.3, vy: -0.2, life: 16, kind: 'spark' }); }
    if (run.squash > 0) run.squash--;

    // animation: the passing pose matters. legs-apart <-> legs-apart reads as
    // gliding, so the cycle is walk1 -> idle -> walk2 -> idle.
    const moving = body.onGround && Math.abs(body.vx) > 0.35;
    run.anim = moving ? run.anim + Math.abs(body.vx) * 0.075 : 0;
    run.pose = run.inv > 0 && run.inv % 8 > 4 ? 'hurt'
      : !body.onGround ? 'jump'
      : moving ? ['walk1', 'idle', 'walk2', 'idle'][Math.floor(run.anim) % 4] : 'idle';

    run.trail.push({ x: body.x, y: body.y, pose: run.pose, facing: body.facing });
    if (run.trail.length > 200) run.trail.shift();
    if (save.trail && loveLevel() >= 2 && run.t % 9 === 0 && Math.abs(body.vx) > 1)
      parts.push({ x: body.x, y: body.y - 18, vx: -body.vx * 0.15, vy: -0.15, life: 26, kind: 'heart' });

    if (body.onGround) {
      const tx = Math.floor(body.x / T), ty = Math.round(body.y / T);
      if (lv.world.solid(tx, ty)) run.checkpoint = { x: tx * T + T / 2, y: ty * T };
    }

    // pickups
    const near = (e, r) => Math.abs(e.x - body.x) < (r || 15) && e.y > body.y - P.PH - 4 && e.y < body.y + 6;
    lv.souvenirs.forEach((s) => {
      if (s.got || !near(s)) return;
      s.got = true; run.newSouvenirs.push(s.i); Sfx.pick(); addXp(XP_PER.souvenir);
      hearts(s.x, s.y, 3); toast(t(s.name));
    });
    lv.hearts.forEach((e) => {
      if (e.got || !near(e)) return;
      e.got = true; run.newHearts++; Sfx.heart(); addXp(XP_PER.heart);
      run.hearts = Math.min(run.maxHearts, run.hearts + 1); hearts(e.x, e.y, 4);
    });
    lv.coffees.forEach((e) => {
      if (e.got || !near(e)) return;
      e.got = true; run.boost = 360; Sfx.pick(); toast(t('Coffee! go go go'));
    });

    // hazards
    lv.vents.forEach((v) => {
      v.t = (v.t + 1) % 110;
      if (v.t < 42 && Math.abs(v.x - body.x) < 12 && body.y - P.PH < v.y && body.y > v.y - 34) hurt(v.x);
    });
    lv.critters.forEach((c) => {
      c.f += 0.1;
      const ahead = Math.floor((c.x + c.dir * 11) / T), foot = Math.round(c.y / T);
      // never walk over a gap, never into a wall
      if (!(lv.world.solid(ahead, foot) || lv.world.oneWay(ahead, foot)) || lv.world.solid(ahead, foot - 1)) c.dir *= -1;
      c.x += c.dir * 0.55;
      if (Math.abs(c.x - body.x) < 14 && Math.abs(c.y - body.y) < 26) hurt(c.x);
    });

    // pits
    if (body.y > lv.ph + 16) {
      const col = Math.floor(body.x / T);
      if (lv.secretCols.has(col)) enterSecret();
      else if (save.chill) { body = Physics.newBody(run.checkpoint.x, run.checkpoint.y); run.inv = 30; }
      else respawn();
    }

    // reunion
    if (Math.abs(lv.goal.x - body.x) < 16 && Math.abs(lv.goal.y - body.y) < 30) finish();

    camTarget = clampCam(body.x - VW / 2 + body.facing * 40);
    cam += (camTarget - cam) * 0.12;

    parts = parts.filter((p) => { p.x += p.vx; p.y += p.vy; p.vy += p.kind === 'heart' ? -0.012 : 0.05; p.vx *= 0.94; return --p.life > 0; });
  }

  function enterSecret() {
    const id = lv.def.id;
    const isNew = save.secrets.indexOf(id) < 0;
    if (isNew) { save.secrets.push(id); addXp(XP_PER.secret); }
    Sfx.secret();
    photoFor(lv.def);
    secret = { level: lv.def, isNew, t: 0 };
    screen = 'secret'; fade = 1;
  }

  function exitSecret() {
    // put the player back on the nearest solid ground left of the pit
    let tx = Math.min.apply(null, Array.from(lv.secretCols)) - 1;
    while (tx > 0 && !lv.world.solid(tx, lv.h - 1)) tx--;
    body = Physics.newBody(tx * T + T / 2, (lv.h - 1) * T);
    run.checkpoint = { x: body.x, y: body.y };
    run.inv = 45; run.trail.length = 0;
    screen = 'play'; fade = 1;
  }

  function finish() {
    const id = lv.def.id;
    if (run.idx < 0) {   // a draft from the editor never touches the real save
      Sfx.win();
      tally = { level: lv.def, got: run.newSouvenirs.length, total: lv.souvenirs.length, first: true, secret: false, deaths: run.deaths, t: 0 };
      screen = 'tally'; fade = 1;
      return;
    }
    const got = (save.got[id] || []).slice();
    run.newSouvenirs.forEach((i) => { if (got.indexOf(i) < 0) got.push(i); });
    save.got[id] = got;
    const first = save.cleared.indexOf(id) < 0;
    if (first) { save.cleared.push(id); addXp(XP_PER.clear); }
    persist(); Sfx.win();
    tally = { level: lv.def, got: got.length, total: lv.souvenirs.length, first, secret: save.secrets.indexOf(id) >= 0, deaths: run.deaths, t: 0 };
    screen = 'tally'; fade = 1;
    hearts(lv.goal.x, lv.goal.y - 30, 14);
  }

  // ----------------------------------------------------------------- drawing
  function text(s, x, y, col, size, align) {
    ctx.font = (size || 8) + 'px "Courier New", ui-monospace, monospace';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = col || '#fff';
    ctx.fillText(s, Math.round(x), Math.round(y));
    ctx.textAlign = 'left';
  }
  function panel(x, y, w, h, a) {
    ctx.fillStyle = 'rgba(16,10,26,' + (a === undefined ? 0.72 : a) + ')';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
  }
  const bob = (amp, sp, off) => Math.round(Math.sin((frame + (off || 0)) * sp) * amp);

  function drawSprite(img, cx, feetY, facing, sy) {
    const w = img.width, h = img.height;
    const scale = sy === undefined ? 1 : sy;
    const dx = Math.round(cx - cam - w / 2), dy = Math.round(feetY + YOFF - h * scale);
    ctx.save();
    if (facing < 0) { ctx.translate(dx + w, dy); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h * scale); }
    else ctx.drawImage(img, dx, dy, w, h * scale);
    ctx.restore();
  }

  function drawWorld() {
    const bg = lv.bg;
    ctx.drawImage(bg.sky, 0, 0);
    for (const l of bg.layers) ctx.drawImage(l.canvas, -Math.round(cam * l.speed), 0);
    // push the parallax back so a dark-outlined sprite still reads against a
    // dark building. Cheaper and more reliable than tuning every theme palette.
    ctx.fillStyle = 'rgba(10,6,20,0.22)'; ctx.fillRect(0, 0, VW, VH);
    ambient(bg.theme);

    const x0 = Math.max(0, Math.floor(cam / T)), x1 = Math.min(lv.w - 1, Math.ceil((cam + VW) / T));
    for (let ty = 0; ty < lv.h; ty++) for (let tx = x0; tx <= x1; tx++) {
      const ch = lv.at(tx, ty), sx = Math.round(tx * T - cam), sy = ty * T + YOFF;
      if (ch === '#') ctx.drawImage(lv.tiles.ground, sx, sy);
      else if (ch === '-') ctx.drawImage(lv.tiles.platform, sx, sy);
    }

    lv.vents.forEach((v) => {
      ctx.drawImage(lv.tiles.vent, Math.round(v.x - cam - 12), v.y + YOFF - 4);
      if (v.t < 42) {
        const p = v.t / 42;
        ctx.globalAlpha = 0.75 * (1 - p);
        for (let i = 0; i < 3; i++)
          ctx.drawImage(DUST, Math.round(v.x - cam - 4 + Math.sin(v.t * 0.2 + i) * 5), Math.round(v.y + YOFF - 6 - p * 30 - i * 8), 10, 10);
        ctx.globalAlpha = 1;
      }
    });

    lv.souvenirs.forEach((s) => {
      if (s.got) return;
      const sx = Math.round(s.x - cam), sy = Math.round(s.y + YOFF + bob(2, 0.06, s.i * 9));
      // four twinkling pixels instead of a halo box — a translucent rect behind
      // a sprite reads as a grey card, not as "pick me up"
      const tw = (frame + s.i * 13) % 90;
      if (tw < 40) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.5 * Math.sin(tw / 40 * Math.PI)) + ')';
        for (const [dx, dy] of [[0, -13], [13, 0], [0, 13], [-13, 0]]) ctx.fillRect(sx + dx, sy + dy, 1, 1);
      }
      ctx.drawImage(iconOf(s.icon), sx - 10, sy - 10, 20, 20);
    });
    lv.hearts.forEach((e, i) => { if (!e.got) ctx.drawImage(HEART_ON, Math.round(e.x - cam - 6), Math.round(e.y + YOFF - 6 + bob(2, 0.08, i * 20))); });
    lv.coffees.forEach((e, i) => { if (!e.got) ctx.drawImage(iconOf('coffee'), Math.round(e.x - cam - 9), Math.round(e.y + YOFF - 9 + bob(2, 0.07, i * 11)), 18, 18); });

    lv.critters.forEach((c) => drawSprite(c.frames[Math.floor(c.f) % 2], c.x, c.y, c.dir));

    // the one waiting at the end
    const other = save.cast === 'a' ? 'b' : 'a';
    const os = sheetFor(other, save.outfit);
    drawSprite(os.idle, lv.goal.x, lv.goal.y + bob(1, 0.05), body && body.x > lv.goal.x ? 1 : -1);
    ctx.drawImage(HEART_ON, Math.round(lv.goal.x - cam - 5), Math.round(lv.goal.y + YOFF - 50 + bob(3, 0.06)));
  }

  function ambient(theme) {
    const kind = theme.particle;
    if (kind === 'snow' || kind === 'rain') {
      const n = 60, fall = kind === 'snow' ? 0.5 : 3.2;
      for (let i = 0; i < n; i++) {
        const sx = (i * 97 + frame * (kind === 'snow' ? 0.25 : 0.9)) % VW;
        const sy = (i * 53 + frame * fall) % VH;
        ctx.fillStyle = kind === 'snow' ? 'rgba(255,255,255,0.85)' : 'rgba(180,210,255,0.5)';
        ctx.fillRect(Math.round(sx), Math.round(sy), 1, kind === 'snow' ? 1 : 4);
      }
    } else if (kind === 'lantern' || kind === 'star') {
      for (let i = 0; i < 16; i++) {
        const sx = (i * 137 - cam * 0.3) % (VW + 40), sy = 30 + (i * 31) % 130 + Math.sin((frame + i * 40) * 0.02) * 6;
        ctx.fillStyle = kind === 'lantern' ? 'rgba(255,190,90,0.9)' : 'rgba(255,240,210,0.8)';
        ctx.fillRect(Math.round(sx < 0 ? sx + VW + 40 : sx), Math.round(sy), 3, kind === 'lantern' ? 4 : 2);
      }
    }
  }

  function drawPlayer() {
    const sh = sheetFor(save.cast, save.outfit);
    if (save.duo && loveLevel() >= 3 && run.trail.length > 60) {
      const g = run.trail[Math.max(0, run.trail.length - 61)];
      ctx.globalAlpha = 0.4;
      drawSprite(sh[g.pose], g.x, g.y, g.facing);
      ctx.globalAlpha = 1;
    }
    if (run.inv > 0 && frame % 8 < 4) return;
    const sq = run.squash > 0 ? 1 - run.squash * 0.035 : 1;
    drawSprite(sh[run.pose], body.x, body.y, body.facing, sq);
  }

  function drawParts() {
    for (const p of parts) {
      const a = Math.min(1, p.life / 18);
      ctx.globalAlpha = a;
      if (p.kind === 'heart') ctx.drawImage(HEART_ON, Math.round(p.x - cam - 3), Math.round(p.y + YOFF - 3), 6, 5);
      else if (p.kind === 'spark') { ctx.fillStyle = '#ffd166'; ctx.fillRect(Math.round(p.x - cam), Math.round(p.y + YOFF), 2, 2); }
      else ctx.drawImage(DUST, Math.round(p.x - cam - 3), Math.round(p.y + YOFF - 3));
      ctx.globalAlpha = 1;
    }
  }

  function drawHud() {
    for (let i = 0; i < run.maxHearts; i++)
      ctx.drawImage(i < run.hearts ? HEART_ON : HEART_OFF, 6 + i * 13, 6);
    const got = lv.souvenirs.filter((s) => s.got).length;
    ctx.drawImage(iconOf(lv.souvenirs.length ? lv.souvenirs[0].icon : 'shell'), VW - 62, 4, 14, 14);
    text(got + '/' + lv.souvenirs.length, VW - 44, 8, '#fff', 8);
    text(t(lv.def.title), VW / 2, 7, 'rgba(255,255,255,0.85)', 8, 'center');
    if (run.boost > 0) {
      ctx.fillStyle = '#3a2a20'; ctx.fillRect(6, 20, 40, 3);
      ctx.fillStyle = '#ffd166'; ctx.fillRect(6, 20, Math.round(40 * run.boost / 360), 3);
    }
    if (save.chill) text(t('chill'), 6, VH - 12, 'rgba(255,255,255,0.5)', 8);
  }

  // ------------------------------------------------------------------ screens
  function drawTitle() {
    cam = 0;
    ctx.fillStyle = '#140d24'; ctx.fillRect(0, 0, VW, VH);
    const bg = titleBg || (titleBg = Art.backdrop('lantern', VW, VH));
    ctx.drawImage(bg.sky, 0, 0);
    for (const l of bg.layers) ctx.drawImage(l.canvas, -Math.round((frame * 0.15 * l.speed) % 200), 0);
    ctx.fillStyle = 'rgba(10,6,20,0.35)'; ctx.fillRect(0, 0, VW, VH);

    text('Y O L O', VW / 2, 44 + bob(2, 0.03), '#ffd166', 30, 'center');
    text(t('you only live once. spend it well.'), VW / 2, 82, 'rgba(255,255,255,0.75)', 8, 'center');

    const a = sheetFor('a', save.outfit), b = sheetFor('b', save.outfit);
    drawSprite(a.idle, VW / 2 - 26, 190 + bob(1, 0.05), 1);
    drawSprite(b.idle, VW / 2 + 26, 190 + bob(1, 0.05, 20), -1);
    ctx.drawImage(HEART_ON, VW / 2 - 5, 150 + bob(2, 0.04));

    panel(VW / 2 - 110, 208, 220, 42);
    text(t('you play as') + '  ' + CAST[save.cast].name + '   [< >]', VW / 2, 214, '#fff', 8, 'center');
    text('ENTER  ' + t(save.seen ? 'continue' : 'start'), VW / 2, 228, '#ffd166', 8, 'center');
    text(t('love level') + ' ' + loveLevel() + '  ·  ' + save.xp + ' ' + t('xp'), VW / 2, 240, 'rgba(255,255,255,0.5)', 8, 'center');
  }
  let titleBg = null;

  function drawMap() {
    ctx.fillStyle = '#171029'; ctx.fillRect(0, 0, VW, VH);
    const bg = titleBg || (titleBg = Art.backdrop('lantern', VW, VH));
    ctx.drawImage(bg.sky, 0, 0);
    ctx.fillStyle = 'rgba(12,8,24,0.55)'; ctx.fillRect(0, 0, VW, VH);
    text(t('OUR MEMORIES'), VW / 2, 12, '#ffd166', 14, 'center');

    LEVELS.forEach((L, i) => {
      const x = 40 + (i % 3) * 140, y = 42 + Math.floor(i / 3) * 96, H = 80;
      const open = i === 0 || save.cleared.indexOf(LEVELS[i - 1].id) >= 0;
      const on = i === sel;
      if (i % 3) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - 32, y + H / 2, 28, 2); }
      panel(x, y, 116, H, on ? 0.85 : 0.5);
      if (on) { ctx.fillStyle = '#ffd166'; ctx.fillRect(x, y, 116, 1); ctx.fillRect(x, y + H - 1, 116, 1); ctx.fillRect(x, y, 1, H); ctx.fillRect(x + 115, y, 1, H); }
      const th = Art.THEMES[L.theme];
      ctx.fillStyle = open ? th.sky[1] : '#221d30'; ctx.fillRect(x + 4, y + 4, 108, 42);
      if (open) {
        ctx.fillStyle = th.far; ctx.fillRect(x + 4, y + 30, 108, 16);
        for (let b = 0; b < 7; b++) { ctx.fillStyle = th.near; ctx.fillRect(x + 8 + b * 15, y + 22 + (b % 3) * 5, 11, 24); }
        ctx.fillStyle = th.glow; ctx.fillRect(x + 88, y + 10, 8, 8);
        ctx.fillStyle = th.edge; ctx.fillRect(x + 4, y + 42, 108, 2);
      } else {
        text('?', x + 58, y + 18, '#4a4260', 16, 'center');
      }
      text(open ? t(L.title) : t('- locked -'), x + 6, y + 50, open ? '#fff' : '#6a6280', 8);
      if (open) {
        const got = (save.got[L.id] || []).length, tot = (L.map.join('').match(/\*/g) || []).length;
        text(t(L.place), x + 6, y + 59, 'rgba(255,255,255,0.45)', 8);
        ctx.drawImage(iconOf('camera'), x + 5, y + 68, 10, 10);
        text(got + '/' + tot, x + 18, y + 69, got === tot ? '#8fe08f' : '#fff', 8);
        if (save.secrets.indexOf(L.id) >= 0) ctx.drawImage(HEART_ON, x + 44, y + 69);
        if (save.cleared.indexOf(L.id) >= 0) text(t('cleared'), x + 60, y + 69, '#8fe08f', 8);
      }
    });

    panel(0, VH - 34, VW, 34);
    const lvl = loveLevel(), next = LOVE_CURVE[lvl] || save.xp;
    text(t('love level') + ' ' + lvl, 8, VH - 29, '#ffd166', 8);
    ctx.fillStyle = '#2c2340'; ctx.fillRect(8, VH - 18, 90, 4);
    const prev = LOVE_CURVE[lvl - 1] || 0;
    ctx.fillStyle = '#e8455c'; ctx.fillRect(8, VH - 18, Math.round(90 * Math.min(1, (save.xp - prev) / Math.max(1, next - prev))), 4);
    text('[1] ' + t('chill') + ' ' + t(save.chill ? 'on' : 'off') + '   [2] ' + t('duo ghost') + ' ' + (loveLevel() < 3 ? 'lv3' : t(save.duo ? 'on' : 'off')) +
         '   [3] ' + t('outfit') + ' ' + t(OUTFITS[save.outfit].name), 110, VH - 29, 'rgba(255,255,255,0.7)', 8);
    text('[4] ' + t('language') + ' ' + I18n.name() + '   [G] ' + t('gallery') +
         '   ENTER ' + t('play') + '   ESC ' + t('title'), 110, VH - 18, 'rgba(255,255,255,0.45)', 8);
  }

  function drawSecret() {
    ctx.fillStyle = '#0c0818'; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = '#181228'; ctx.fillRect(60, 40, VW - 120, VH - 90);
    for (let i = 0; i < 24; i++) { ctx.fillStyle = 'rgba(255,209,102,' + (0.05 + (i % 3) * 0.03) + ')'; ctx.fillRect(60, 40 + i * 8, VW - 120, 1); }
    const L = secret.level;
    const img = photos[L.id];
    const px0 = VW / 2 - 59, py0 = 56 + bob(2, 0.03);
    ctx.save();
    ctx.translate(VW / 2, py0 + 66); ctx.rotate(Math.sin(frame * 0.012) * 0.02); ctx.translate(-VW / 2, -(py0 + 66));
    if (img) {
      ctx.fillStyle = '#f4f1e8'; ctx.fillRect(px0, py0, 118, 132);
      const s = Math.max(102 / img.width, 92 / img.height);
      const w = img.width * s, h = img.height * s;
      ctx.save(); ctx.beginPath(); ctx.rect(px0 + 8, py0 + 8, 102, 92); ctx.clip();
      ctx.drawImage(img, Math.round(px0 + 8 + (102 - w) / 2), Math.round(py0 + 8 + (92 - h) / 2), Math.round(w), Math.round(h));
      ctx.restore();
    } else {
      if (!secret.card) secret.card = Art.polaroid(L, sheetFor('a', save.outfit), sheetFor('b', save.outfit));
      ctx.drawImage(secret.card, px0, py0);
    }
    ctx.restore();
    text(t(secret.isNew ? 'you found a pocket of us' : 'still here'), VW / 2, 200, '#ffd166', 8, 'center');
    text(t(L.caption), VW / 2, 214, 'rgba(255,255,255,0.8)', 8, 'center');
    text('ENTER  ' + t('climb back out'), VW / 2, 240, 'rgba(255,255,255,0.45)', 8, 'center');
  }

  function drawTally() {
    drawWorld(); drawParts();
    ctx.fillStyle = 'rgba(10,6,20,0.72)'; ctx.fillRect(0, 0, VW, VH);
    const tl = tally;
    text(t(tl.first ? 'YOU FOUND EACH OTHER' : 'AGAIN'), VW / 2, 52, '#ffd166', 16, 'center');
    text(t(tl.level.title), VW / 2, 76, '#fff', 8, 'center');
    panel(VW / 2 - 90, 96, 180, 74);
    text(pad(t('souvenirs')) + tl.got + ' / ' + tl.total, VW / 2 - 78, 106, '#fff', 8);
    text(pad(t('secret')) + t(tl.secret ? 'found' : 'not yet'), VW / 2 - 78, 120, tl.secret ? '#8fe08f' : 'rgba(255,255,255,0.5)', 8);
    text(pad(t('retries')) + tl.deaths, VW / 2 - 78, 134, 'rgba(255,255,255,0.7)', 8);
    text(pad(t('love level')) + loveLevel() + '   (' + save.xp + ' ' + t('xp') + ')', VW / 2 - 78, 148, '#e8455c', 8);
    const a = sheetFor(save.cast, save.outfit), b = sheetFor(save.cast === 'a' ? 'b' : 'a', save.outfit);
    ctx.drawImage(a.idle, VW / 2 - 30, 186); ctx.save(); ctx.translate(VW / 2 + 30, 186); ctx.scale(-1, 1); ctx.drawImage(b.idle, -24, 0); ctx.restore();
    ctx.drawImage(HEART_ON, VW / 2 - 5, 176 + bob(2, 0.06));
    text('ENTER  ' + t('back to the memories'), VW / 2, 240, 'rgba(255,255,255,0.6)', 8, 'center');
  }
  // right-pad a label so the tally column lines up in any language
  const pad = (s) => (s + '            ').slice(0, 12);

  function drawGallery() {
    ctx.fillStyle = '#150f26'; ctx.fillRect(0, 0, VW, VH);
    text(t('SOUVENIRS'), VW / 2, 10, '#ffd166', 14, 'center');
    let i = 0;
    LEVELS.forEach((L) => {
      const got = save.got[L.id] || [];
      const count = (L.map.join('').match(/\*/g) || []).length;
      for (let k = 0; k < count; k++, i++) {
        const s = L.souvenirs[k % L.souvenirs.length];
        const x = 14 + (i % 14) * 33, y = 34 + Math.floor(i / 14) * 46;
        const have = got.indexOf(k) >= 0;
        panel(x, y, 28, 38, have ? 0.5 : 0.25);
        ctx.globalAlpha = have ? 1 : 0.16;
        ctx.drawImage(iconOf(s.icon), x + 4, y + 3, 20, 20);
        ctx.globalAlpha = 1;
        text(have ? s.name.slice(0, 5) : '???', x + 14, y + 26, have ? 'rgba(255,255,255,0.75)' : '#4a4260', 8, 'center');
      }
    });
    const total = LEVELS.reduce((n, L) => n + (L.map.join('').match(/\*/g) || []).length, 0);
    const mine = LEVELS.reduce((n, L) => n + (save.got[L.id] || []).length, 0);
    text(mine + ' ' + t('of') + ' ' + total + ' ' + t('memories kept'), VW / 2, VH - 22, '#fff', 8, 'center');
    text('ESC  ' + t('back'), VW / 2, VH - 12, 'rgba(255,255,255,0.45)', 8, 'center');
  }

  // --------------------------------------------------------------- main loop
  function update() {
    frame++;
    if (toastT > 0) toastT--;
    if (fade > 0) fade = Math.max(0, fade - 0.05);

    if (screen === 'title') {
      if (took('left')) { save.cast = 'a'; Sfx.ui(); }
      if (took('right')) { save.cast = 'b'; Sfx.ui(); }
      if (took('ok')) { save.seen = true; persist(); screen = 'map'; fade = 1; Sfx.ui(); }
    } else if (screen === 'map') {
      if (took('left')) { sel = (sel + LEVELS.length - 1) % LEVELS.length; Sfx.ui(); }
      if (took('right')) { sel = (sel + 1) % LEVELS.length; Sfx.ui(); }
      if (took('back')) { screen = 'title'; fade = 1; }
      if (took('gallery')) { screen = 'gallery'; fade = 1; }
      if (took('ok')) {
        const open = sel === 0 || save.cleared.indexOf(LEVELS[sel - 1].id) >= 0;
        if (open) startLevel(sel); else toast(t('finish the one before it first'));
      }
    } else if (screen === 'play') {
      tickPlay();
      if (took('back')) {
        if (run.idx < 0) location.href = 'editor.html';   // testing a draft: go back to the editor
        else { screen = 'map'; fade = 1; }
      }
      if (took('restart')) startLevel(run.idx < 0 ? draftLevel : run.idx);
    } else if (screen === 'secret') {
      secret.t++;
      if (took('ok') || took('back')) exitSecret();
    } else if (screen === 'tally') {
      tally.t++;
      if (took('ok') || took('back')) {
        if (run.idx < 0) location.href = 'editor.html';
        else { sel = Math.min(LEVELS.length - 1, run.idx + 1); screen = 'map'; fade = 1; }
      }
    } else if (screen === 'gallery') {
      if (took('back') || took('ok')) { screen = 'map'; fade = 1; }
    }

    // map-screen toggles
    if (screen === 'map') {
      if (numPressed === 1) { save.chill = !save.chill; persist(); Sfx.ui(); }
      if (numPressed === 2) { if (loveLevel() >= 3) { save.duo = !save.duo; persist(); Sfx.ui(); } else toast(t('duo ghost unlocks at love level 3')); }
      if (numPressed === 4) { save.lang = I18n.next(); persist(); Sfx.ui(); titleBg = null; }
      if (numPressed === 3) {
        const keys2 = Object.keys(OUTFITS).filter((k) => loveLevel() >= OUTFITS[k].lv);
        save.outfit = keys2[(keys2.indexOf(save.outfit) + 1) % keys2.length];
        persist(); Sfx.ui(); toast(t(OUTFITS[save.outfit].name));
      }
    }
    numPressed = 0;
  }

  addEventListener('keydown', (e) => { if (e.code >= 'Digit1' && e.code <= 'Digit4') numPressed = +e.code.slice(5); });

  function draw() {
    ctx.clearRect(0, 0, VW, VH);
    if (screen === 'title') drawTitle();
    else if (screen === 'map') drawMap();
    else if (screen === 'gallery') drawGallery();
    else if (screen === 'secret') drawSecret();
    else if (screen === 'tally') drawTally();
    else { drawWorld(); drawParts(); drawPlayer(); drawHud(); }

    if (toastT > 0 && toastMsg) {
      const a = Math.min(1, toastT / 40);
      ctx.globalAlpha = a;
      panel(VW / 2 - 88, VH - 52, 176, 16, 0.8);
      text(toastMsg, VW / 2, VH - 48, '#ffd166', 8, 'center');
      ctx.globalAlpha = 1;
    }
    if (fade > 0) { ctx.fillStyle = 'rgba(8,5,16,' + fade + ')'; ctx.fillRect(0, 0, VW, VH); }
  }

  let acc = 0, last = performance.now();
  function loop(now) {
    acc += Math.min(100, now - last); last = now;
    while (acc >= STEP) { update(); acc -= STEP; }
    draw();
    requestAnimationFrame(loop);
  }

  function resize() {
    // Snap to a whole number of DEVICE pixels per game pixel, not CSS pixels.
    // On a 3x phone that permits 1.33x CSS (= exactly 4 device px) instead of
    // forcing 1x and leaving half the screen black, and it stays crisp — a
    // fractional device mapping resamples pixel art into shimmer.
    const dpr = window.devicePixelRatio || 1;
    const step = dpr >= 2 ? dpr : 1;
    const fit = Math.min(innerWidth / VW, (innerHeight - 4) / VH);
    let k = Math.floor(fit * step) / step;
    if (k < 0.5) k = fit;                      // tiny screen: squeezed beats unreadable
    cv.style.width = Math.round(VW * k) + 'px';
    cv.style.height = Math.round(VH * k) + 'px';
  }
  addEventListener('resize', resize);
  resize();

  // Testing seam for tests/ — read-mostly, ~20 lines, and the only way a
  // Playwright suite can assert on physics instead of on pixels alone.
  window.__yolo = {
    state: () => ({
      screen: screen, frame: frame, lang: I18n.get(), cam: cam,
      x: body ? body.x : null, y: body ? body.y : null,
      vx: body ? body.vx : null, vy: body ? body.vy : null,
      onGround: body ? body.onGround : null,
      jumps: body ? body.jumps : null, coyote: body ? body.coyote : null, buffer: body ? body.buffer : null,
      pose: run ? run.pose : null, hearts: run ? run.hearts : null,
      inv: run ? run.inv : null, boost: run ? run.boost : null,
      deaths: run ? run.deaths : null,
      got: lv ? lv.souvenirs.filter((s) => s.got).length : 0,
      total: lv ? lv.souvenirs.length : 0,
      goal: lv ? { x: lv.goal.x, y: lv.goal.y } : null,
      critters: lv ? lv.critters.map((c) => ({ x: c.x, y: c.y, dir: c.dir })) : [],
      secretCols: lv ? Array.from(lv.secretCols) : [],
      worldH: lv ? lv.ph : null,
    }),
    save: () => save,
    setSave: (o) => { Object.assign(save, o); I18n.set(save.lang || 'en'); persist(); },
    goto: (i) => startLevel(i),
    put: (x, y) => { body.x = x; body.y = y; body.vx = 0; body.vy = 0; body.onGround = false; },
    screen: (s) => { screen = s; },
  };

  if (draftLevel) startLevel(draftLevel);
  requestAnimationFrame(loop);
})();
