// art.js — every pixel in this game is generated here, at load time, into
// offscreen canvases. No image files, no asset pipeline, no network.
//
// The original project generated its art with gpt-image-2 from real photos.
// This is the stand-in: characters are drawn from shape + palette (so an
// outfit is a palette patch, not a redraw), icons are 12x12 ASCII grids (same
// idea as the levels: art as text), backdrops are seeded procedural parallax.
// To use real art instead, replace Art.sheet()/Art.backdrop() with image loads.
const Art = (function () {
  'use strict';

  const OUTLINE = '#1b1225';

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return x;
  }
  function px(x, cx, cy, w, h, col) { x.fillStyle = col; x.fillRect(cx | 0, cy | 0, w | 0, h | 0); }

  // A circle built from rows of rects. ctx.arc() antialiases its edge, which on
  // a 480x270 canvas upscaled 3x turns into a grey fringe you can count.
  function disc(x, cx, cy, r, col) {
    x.fillStyle = col;
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.floor(Math.sqrt(r * r - dy * dy) + 0.5);
      x.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1);
    }
  }

  // 1px dark outline around whatever is already drawn, in one pass.
  function outline(canvas, col) {
    const x = canvas.getContext('2d');
    const s = mk(canvas.width, canvas.height);
    s.drawImage(canvas, 0, 0);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = col || OUTLINE;
    s.fillRect(0, 0, canvas.width, canvas.height);
    x.globalCompositeOperation = 'destination-over';
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]])
      x.drawImage(s.canvas, dx, dy);
    x.globalCompositeOperation = 'source-over';
    return canvas;
  }

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- character
  // 24x40. Feet on the bottom edge, facing right. Poses differ only by limb
  // rectangles, so a new outfit is four hex codes and zero new art.
  const POSES = {
    idle:  { legs: [[8, 30, 4, 7], [13, 30, 4, 7]], shoes: [[7, 37, 6, 2], [13, 37, 6, 2]], arms: [[4, 22, 3, 7], [17, 22, 3, 7]], bob: 0 },
    walk1: { legs: [[7, 30, 4, 6], [14, 30, 4, 7]], shoes: [[5, 36, 6, 2], [14, 37, 6, 2]], arms: [[3, 23, 3, 6], [18, 21, 3, 6]], bob: 1 },
    walk2: { legs: [[8, 30, 4, 7], [13, 30, 4, 6]], shoes: [[7, 37, 6, 2], [15, 36, 6, 2]], arms: [[5, 21, 3, 6], [16, 23, 3, 6]], bob: 1 },
    jump:  { legs: [[8, 29, 4, 5], [13, 29, 5, 4]], shoes: [[7, 34, 6, 2], [15, 32, 6, 2]], arms: [[3, 18, 3, 6], [18, 18, 3, 6]], bob: -1 },
    hurt:  { legs: [[8, 30, 4, 6], [13, 30, 4, 6]], shoes: [[7, 36, 6, 2], [13, 36, 6, 2]], arms: [[3, 19, 3, 5], [18, 19, 3, 5]], bob: 0 },
  };

  function drawChar(pose, pal, hairStyle) {
    const x = mk(24, 40);
    const p = POSES[pose], b = p.bob;
    const dark = (c) => shade(c, -0.22);

    for (const [lx, ly, lw, lh] of p.legs) px(x, lx, ly + b, lw, lh, pal.bottom);
    for (const [sx, sy, sw, sh] of p.shoes) px(x, sx, sy + b, sw, sh, pal.shoe);
    // torso
    px(x, 7, 21 + b, 10, 10, pal.top);
    px(x, 7, 21 + b, 10, 2, pal.accent);          // collar
    px(x, 7, 29 + b, 10, 2, dark(pal.top));       // hem shadow
    for (const [ax, ay, aw, ah] of p.arms) {
      px(x, ax, ay + b, aw, ah, pal.top);
      px(x, ax, ay + ah + b, aw, 2, pal.skin);    // hand
    }
    // head — chibi: deliberately oversized
    px(x, 5, 5 + b, 14, 16, pal.skin);
    px(x, 4, 8 + b, 16, 10, pal.skin);
    // hair
    px(x, 4, 3 + b, 16, 6, pal.hair);
    px(x, 4, 3 + b, 3, 10, pal.hair);
    if (hairStyle === 'long') {
      px(x, 3, 6 + b, 3, 18, pal.hair);
      px(x, 18, 6 + b, 3, 18, pal.hair);
      px(x, 17, 3 + b, 3, 8, pal.hair);
    } else {
      for (const cx of [5, 9, 13, 17]) px(x, cx, 2 + b, 3, 3, pal.hair);  // curls
      px(x, 17, 3 + b, 3, 7, pal.hair);
    }
    px(x, 6, 8 + b, 12, 1, shade(pal.hair, 0.25));  // hair highlight
    // face
    px(x, 10, 13 + b, 2, 3, '#2a2230');
    px(x, 15, 13 + b, 2, 3, '#2a2230');
    px(x, 10, 17 + b, 1, 1, shade(pal.skin, -0.25));
    px(x, 13, 17 + b, 3, 1, '#b5566a');
    px(x, 8, 16 + b, 2, 1, shade(pal.skin, -0.14));
    px(x, 16, 16 + b, 2, 1, shade(pal.skin, -0.14));

    return outline(x.canvas);
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function sheet(cast, outfit) {
    const pal = Object.assign({}, cast.pal, outfit ? outfit.patch : {});
    const s = {};
    for (const k in POSES) s[k] = drawChar(k, pal, cast.hairStyle);
    s.pal = pal;
    return s;
  }

  // -------------------------------------------------------------------- icons
  // 12x12 grids. '.' transparent, 'k' outline, digits index the icon palette.
  const ICONS = {
    coffee: { pal: ['#e8e4dc', '#8a5a3c', '#cfd8e0'], rows: [
      '............', '...3..3.....', '..3..3......', '.kkkkkkkk...', '.k222222k...',
      '.k111111kkk.', '.k111111k1k.', '.k111111kk..', '.k111111k...', '..k1111k....',
      '...kkkk.....', '............'] },
    tart: { pal: ['#f2b544', '#c98a3c'], rows: [
      '............', '............', '............', '..kkkkkkkk..', '.k11111111k.',
      '.k11111111k.', 'k2222222222k', 'k2222222222k', '.k22222222k.', '..kkkkkkkk..',
      '............', '............'] },
    lantern: { pal: ['#e0483f', '#f5c542', '#6b3a2a'], rows: [
      '.....k......', '.....k......', '...kkkkk....', '..k11111k...', '.k1111111k..',
      '.k1122111k..', '.k1111111k..', '..k11111k...', '...kkkkk....', '....k3k.....',
      '....k3k.....', '............'] },
    camera: { pal: ['#3a4a5a', '#8ab4d8', '#e0483f'], rows: [
      '............', '............', '....kkkk....', '.kkk1111kkk.', '.k11111111k.',
      '.k11kkkk11k.', '.k1k2222k1k.', '.k1k2222k1k.', '.k11kkkk11k.', '.k31111111k.',
      '.kkkkkkkkkk.', '............'] },
    ring: { pal: ['#f5d76e', '#bfe8ff'], rows: [
      '............', '.....22.....', '....2222....', '.....22.....', '...kkkkkk...',
      '..k111111k..', '.k11kkkk11k.', '.k1k....k1k.', '.k11kkkk11k.', '..k111111k..',
      '...kkkkkk...', '............'] },
    ticket: { pal: ['#f2ecdd', '#e0483f'], rows: [
      '............', '............', '.kkkkkkkkkk.', '.k11111111k.', '.k12211221k.',
      '.k11111111k.', 'kk11111111kk', '.k11111111k.', '.k12211221k.', '.k11111111k.',
      '.kkkkkkkkkk.', '............'] },
    panda: { pal: ['#f2efe8', '#2a2430', '#e08fa0'], rows: [
      '............', '..kk....kk..', '.k22k..k22k.', '.k11111111k.', 'k1122112211k',
      'k1122112211k', 'k1111111111k', 'k1113113111k', '.k11111111k.', '.k1k1111k1k.',
      '..kkkkkkkk..', '............'] },
    mic: { pal: ['#f5d76e', '#4a4458'], rows: [
      '............', '...kkkk.....', '..k1111k....', '..k1111k....', '..k1111k....',
      '...k11k.....', '....k2k.....', '....k2k.....', '....k2k.....', '...kk2kk....',
      '............', '............'] },
    tower: { pal: ['#7a8fb0', '#f5c542'], rows: [
      '.....k......', '.....k......', '....k1k.....', '....k1k.....', '...k111k....',
      '...k121k....', '..k11111k...', '..k11111k...', '.k1111111k..', '.k1122111k..',
      'k111111111k.', 'kkkkkkkkkkk.'] },
    dumpling: { pal: ['#f2ecdd', '#d8cfc0'], rows: [
      '............', '............', '...kkkkkk...', '..k112211k..', '.k11221122k.',
      '.k11111111k.', 'k1111111111k', 'k1111111111k', '.k11111111k.', '..kkkkkkkk..',
      '............', '............'] },
    flower: { pal: ['#e0577a', '#f5d76e', '#4a8f5a'], rows: [
      '............', '...kk..kk...', '..k11kk11k..', '..k111111k..', '.k11122111k.',
      '.k11122111k.', '..k111111k..', '..k11kk11k..', '...kk3kk....', '....k3k.....',
      '...k33k.....', '....kk......'] },
    shell: { pal: ['#f2c9a0', '#e08fa0'], rows: [
      '............', '............', '....kkkk....', '..kk1111kk..', '.k11211211k.',
      'k1121121121k', 'k1121121121k', 'k1112112111k', '.k11111111k.', '..k1kk1k1k..',
      '...kkkkkk...', '............'] },
  };

  function icon(name) {
    const spec = ICONS[name] || ICONS.shell;
    const x = mk(12, 12);
    spec.rows.forEach((row, y) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.') continue;
        px(x, i, y, 1, 1, ch === 'k' ? OUTLINE : spec.pal[+ch - 1] || '#fff');
      }
    });
    return x.canvas;
  }

  function heart(filled) {
    const x = mk(11, 10);
    const c = filled ? '#e8455c' : '#4a3a4a';
    for (const [cx, cy, w, h] of [[1, 1, 3, 2], [6, 1, 3, 2], [0, 2, 11, 3], [1, 5, 9, 2], [2, 7, 7, 1], [4, 8, 3, 1]])
      px(x, cx, cy, w, h, c);
    if (filled) px(x, 2, 2, 2, 1, '#ff98a8');
    return outline(x.canvas);
  }

  // ------------------------------------------------------------------ critter
  // Two frames. The walk cycle alternates them; a critter that never changes
  // silhouette reads as sliding, so frame B moves the legs AND drops the body 1px.
  function critter(kind) {
    const C = {
      pigeon:  { body: '#7d8fa6', head: '#5f7288', accent: '#4a8f8f', w: 18, h: 14, wheel: false },
      goat:    { body: '#e6e0d4', head: '#cfc7b6', accent: '#8a7a63', w: 20, h: 16, wheel: false },
      scooter: { body: '#3f8f7a', head: '#2a2430', accent: '#f5c542', w: 22, h: 16, wheel: true },
      crab:    { body: '#e0674a', head: '#c04a34', accent: '#2a2430', w: 18, h: 12, wheel: false },
    }[kind] || { body: '#8a8a9a', head: '#6a6a7a', accent: '#444', w: 18, h: 14, wheel: false };

    return [0, 1].map((f) => {
      const x = mk(C.w, C.h + 2);
      const y0 = 2 + (f ? 1 : 0);
      px(x, 2, y0 + 3, C.w - 6, C.h - 7, C.body);
      px(x, C.w - 8, y0, 6, 6, C.head);
      px(x, C.w - 4, y0 + 2, 2, 2, '#221a2b');
      px(x, C.w - 2, y0 + 3, 2, 1, C.accent);
      if (C.wheel) {
        px(x, 2, C.h - 4, 5, 5, '#2a2430'); px(x, C.w - 8, C.h - 4, 5, 5, '#2a2430');
        px(x, 3, C.h - 3, 3, 3, '#5a5a68'); px(x, C.w - 7, C.h - 3, 3, 3, '#5a5a68');
      } else {
        px(x, 4, C.h - 3 + (f ? -1 : 0), 2, 4, C.accent);
        px(x, C.w - 9, C.h - 3 + (f ? 0 : -1), 2, 4, C.accent);
      }
      return outline(x.canvas);
    });
  }

  // ----------------------------------------------------------------- backdrop
  const THEMES = {
    neon:    { sky: ['#1a1038', '#3d1f5c', '#7a2f6e'], far: '#2a1a48', mid: '#3a2258', near: '#1d1230', glow: '#ff3f8e', ground: ['#3a2d52', '#241a38'], edge: '#ff3f8e', particle: 'rain',    landmark: 'tower' },
    sunset:  { sky: ['#ff9a5c', '#ffb98a', '#ffd9a0'], far: '#c96f7a', mid: '#8f4f6e', near: '#5a3358', glow: '#ffe1a8', ground: ['#7a4a5c', '#4a2a3c'], edge: '#ffb35c', particle: 'gull',    landmark: 'harbour' },
    snow:    { sky: ['#8fa8c8', '#b9cbe0', '#dfe8f2'], far: '#9fb2cc', mid: '#7e91ae', near: '#5a6a86', glow: '#ffffff', ground: ['#e8eef6', '#9aa8bd'], edge: '#ffffff', particle: 'snow',    landmark: 'iron' },
    mountain:{ sky: ['#1f6f8f', '#4fa3bd', '#a9dbe6'], far: '#dfeef4', mid: '#6f8fa6', near: '#3f5a6e', glow: '#ffffff', ground: ['#7a6a52', '#4a3f30'], edge: '#a8c8a0', particle: 'flag',    landmark: 'peaks' },
    lantern: { sky: ['#120e28', '#25164a', '#4a2050'], far: '#1e1740', mid: '#2c1f4e', near: '#170f2c', glow: '#ffb14a', ground: ['#4a3a30', '#2a1f1a'], edge: '#f5c542', particle: 'lantern', landmark: 'pagoda' },
    dawn:    { sky: ['#3a3a72', '#a0628f', '#ffb27a'], far: '#6a4a72', mid: '#4a3a5e', near: '#2e2440', glow: '#ffd9a0', ground: ['#6a5a48', '#3a3028'], edge: '#ffc98a', particle: 'star',    landmark: 'lighthouse' },
  };

  function skyCanvas(t, W, H) {
    const x = mk(W, H);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, t.sky[0]); g.addColorStop(0.55, t.sky[1]); g.addColorStop(1, t.sky[2]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const r = rng(99);
    if (t.particle === 'star' || t.particle === 'lantern' || t.particle === 'rain')
      for (let i = 0; i < 70; i++) px(x, r() * W, r() * H * 0.6, 1, 1, 'rgba(255,255,255,' + (0.25 + r() * 0.5) + ')');
    // sun / moon, with a halo
    const cx = Math.round(W * 0.72), cy = Math.round(H * 0.22);
    x.globalAlpha = 0.14; disc(x, cx, cy, 22, t.glow);
    x.globalAlpha = 0.22; disc(x, cx, cy, 17, t.glow);
    x.globalAlpha = 0.92; disc(x, cx, cy, 12, t.glow);
    x.globalAlpha = 1;
    return x.canvas;
  }

  function skyline(x, t, W, H, col, seed, minH, maxH, windows) {
    const r = rng(seed);
    let cx = -10;
    while (cx < W) {
      const w = 10 + Math.floor(r() * 22), h = minH + Math.floor(r() * (maxH - minH));
      px(x, cx, H - h, w, h, col);
      if (windows) for (let wy = H - h + 4; wy < H - 4; wy += 5)
        for (let wx = cx + 3; wx < cx + w - 3; wx += 5)
          if (r() > 0.45) px(x, wx, wy, 2, 2, t.glow);
      cx += w + 1 + Math.floor(r() * 6);
    }
  }

  function peaks(x, W, H, col, seed, height) {
    const r = rng(seed);
    let cx = -20;
    while (cx < W + 20) {
      const w = 60 + r() * 90, h = height * (0.6 + r() * 0.4);
      x.fillStyle = col;
      x.beginPath(); x.moveTo(cx, H); x.lineTo(cx + w / 2, H - h); x.lineTo(cx + w, H); x.closePath(); x.fill();
      cx += w * 0.65;
    }
  }

  function landmark(x, t, W, H) {
    const bx = Math.floor(W * 0.42);
    switch (t.landmark) {
      case 'tower':
        px(x, bx, H - 150, 22, 150, t.mid);
        for (let y = H - 140; y < H - 10; y += 12) px(x, bx, y, 22, 3, t.glow);
        px(x, bx + 9, H - 178, 4, 30, t.mid); px(x, bx + 8, H - 182, 6, 5, t.glow);
        break;
      case 'harbour':
        px(x, bx, H - 130, 18, 130, t.mid); px(x, bx + 6, H - 152, 6, 24, t.mid);
        px(x, bx + 26, H - 96, 14, 96, t.mid); px(x, bx - 22, H - 78, 12, 78, t.mid);
        break;
      case 'iron':
        x.fillStyle = t.mid;
        x.beginPath(); x.moveTo(bx - 26, H); x.lineTo(bx, H - 160); x.lineTo(bx + 26, H); x.closePath(); x.fill();
        x.globalCompositeOperation = 'destination-out';
        x.beginPath(); x.moveTo(bx - 17, H - 6); x.lineTo(bx, H - 108); x.lineTo(bx + 17, H - 6); x.closePath(); x.fill();
        x.globalCompositeOperation = 'source-over';
        px(x, bx - 30, H - 96, 60, 5, t.mid); px(x, bx - 20, H - 132, 40, 4, t.mid);
        break;
      case 'peaks': break; // the far layer is the landmark
      case 'pagoda':
        for (let i = 0; i < 3; i++) {
          const w = 54 - i * 12, y = H - 46 - i * 26;
          px(x, bx - w / 2, y, w, 7, t.mid);
          px(x, bx - w / 2 - 5, y, w + 10, 3, shade(t.mid, 0.2));
          px(x, bx - 8, y + 7, 16, 22, t.mid);
        }
        px(x, bx - 22, H - 46, 44, 46, t.mid);
        break;
      case 'lighthouse':
        px(x, bx - 9, H - 118, 18, 118, t.mid);
        for (let y = H - 110; y < H; y += 22) px(x, bx - 9, y, 18, 8, shade(t.mid, 0.22));
        px(x, bx - 12, H - 132, 24, 15, t.glow);
        break;
    }
  }

  function backdrop(themeName, worldW, H) {
    const t = THEMES[themeName] || THEMES.neon;
    const VW = 480;
    const layers = [0.25, 0.5, 0.82].map((speed, i) => {
      const W = Math.ceil(worldW * speed) + VW;
      const x = mk(W, H);
      if (i === 0) {
        if (t.landmark === 'peaks') { peaks(x, W, H, t.far, 7, 190); peaks(x, W, H, shade(t.far, -0.12), 21, 130); }
        else skyline(x, t, W, H, t.far, 11, 40, 110, false);
      } else if (i === 1) {
        skyline(x, t, W, H, t.mid, 23, 55, 130, themeName === 'neon' || themeName === 'lantern');
        landmark(x, t, W, H);
      } else {
        skyline(x, t, W, H, t.near, 37, 30, 70, false);
        px(x, 0, H - 14, W, 14, shade(t.near, -0.2));
      }
      return { canvas: x.canvas, speed: speed };
    });
    return { sky: skyCanvas(t, VW, H), layers: layers, theme: t };
  }

  // -------------------------------------------------------------------- tiles
  function tiles(themeName) {
    const t = THEMES[themeName] || THEMES.neon;
    const T = 24;
    const g = mk(T, T);
    px(g, 0, 0, T, T, t.ground[1]);
    px(g, 0, 0, T, 6, t.ground[0]);
    px(g, 0, 0, T, 2, t.edge);
    const r = rng(5);
    for (let i = 0; i < 26; i++) px(g, r() * T, 7 + r() * (T - 8), 2, 2, shade(t.ground[1], r() > 0.5 ? 0.12 : -0.12));
    px(g, 0, T - 1, T, 1, shade(t.ground[1], -0.3));

    const p = mk(T, 8);
    px(p, 0, 0, T, 3, t.edge);
    px(p, 0, 3, T, 4, t.ground[0]);
    px(p, 0, 7, T, 1, shade(t.ground[0], -0.35));

    const v = mk(T, 10);                      // steam vent grate
    px(v, 2, 4, T - 4, 6, '#3a3340');
    for (let i = 4; i < T - 4; i += 4) px(v, i, 2, 2, 8, '#6a6270');
    return { ground: g.canvas, platform: p.canvas, vent: outline(v.canvas) };
  }

  // ----------------------------------------------------------------- polaroid
  // The secret rooms hold a real photo. Drop a jpg at levels.js `photo` and it
  // is used; otherwise this stands in.
  function polaroid(level, castA, castB) {
    const W = 118, H = 132;
    const x = mk(W, H);
    px(x, 0, 0, W, H, '#f4f1e8');
    px(x, 0, H - 4, W, 4, '#e2ddd0');
    const iw = 102, ih = 92, ix = 8, iy = 8;
    const t = THEMES[level.theme] || THEMES.neon;
    const g = x.createLinearGradient(0, iy, 0, iy + ih);
    g.addColorStop(0, t.sky[0]); g.addColorStop(1, t.sky[2]);
    x.fillStyle = g; x.fillRect(ix, iy, iw, ih);
    skyline(x, t, W, iy + ih, t.near, 3, 20, 46, false);
    x.fillStyle = 'rgba(0,0,0,0)';
    // two little silhouettes, close together
    x.drawImage(castA.idle, ix + 28, iy + ih - 44, 24, 40);
    x.drawImage(castB.idle, ix + 48, iy + ih - 44, 24, 40);
    const hs = heart(true);
    x.drawImage(hs, ix + 46, iy + ih - 58);
    // crop the photo area back to its frame
    const out = mk(W, H);
    px(out, 0, 0, W, H, '#f4f1e8');
    px(out, 0, H - 4, W, 4, '#e2ddd0');
    out.drawImage(x.canvas, ix, iy, iw, ih, ix, iy, iw, ih);
    px(out, ix - 1, iy - 1, iw + 2, 1, '#c9c3b4');
    px(out, ix - 1, iy - 1, 1, ih + 2, '#c9c3b4');
    return out.canvas;
  }

  function dust() {
    const x = mk(7, 7);
    px(x, 1, 1, 5, 5, 'rgba(255,255,255,0.85)');
    px(x, 0, 2, 7, 3, 'rgba(255,255,255,0.55)');
    return x.canvas;
  }

  return {
    mk: mk, outline: outline, rng: rng, shade: shade, disc: disc,
    sheet: sheet, icon: icon, heart: heart, critter: critter,
    backdrop: backdrop, tiles: tiles, polaroid: polaroid, dust: dust,
    THEMES: THEMES, ICONS: ICONS,
  };
})();

if (typeof window !== 'undefined') window.Art = Art;   // see the note in i18n.js
