// editor.js — paint levels, validate them live, test them in the real engine.
//
// The validation panel calls LevelCheck.analyse — the exact module validate.cjs
// runs in CI. An editor with its own idea of "valid" is how you ship a level
// that passes locally and fails the build.
(function () {
  'use strict';

  const CELL = 14;
  const TILES = [
    { ch: '.', name: 'empty' },
    { ch: '#', name: 'ground' },
    { ch: '-', name: 'platform' },
    { ch: 'P', name: 'spawn' },
    { ch: 'E', name: 'reunion' },
    { ch: 'h', name: 'heart' },
    { ch: '*', name: 'souvenir' },
    { ch: 'c', name: 'coffee' },
    { ch: 'u', name: 'vent' },
    { ch: 'g', name: 'critter' },
    { ch: '~', name: 'secret pit' },
  ];
  const UNIQUE = 'PE';                     // only one of each may exist
  const ICONS = Object.keys(Art.ICONS);
  const THEMES = Object.keys(Art.THEMES);
  const DRAFT_KEY = 'yolo-draft-level';

  const $ = (id) => document.getElementById(id);
  const cv = $('grid'), ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // ------------------------------------------------------------------- state
  const blank = () => {
    const w = 64, h = 11, rows = [];
    for (let y = 0; y < h; y++) rows.push(new Array(w).fill('.').join(''));
    rows[h - 1] = new Array(w).fill('#').join('');
    rows[h - 2] = setAt(setAt(rows[h - 2], 2, 'P'), w - 3, 'E');
    return {
      id: 'new-memory', title: 'A new memory', place: 'Somewhere, sometime',
      theme: 'sunset', photo: 'photos/new-memory.jpg',
      caption: 'Say what this one was.',
      souvenirs: [{ name: 'Something we kept', icon: 'camera' }],
      map: rows,
    };
  };
  const setAt = (s, i, ch) => s.slice(0, i) + ch + s.slice(i + 1);

  let doc, undo = [], redo = [], brush = '#', painting = 0, report = null;

  function load() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) { const d = JSON.parse(raw); if (d && d.map && d.map.length) return d; }
    } catch (e) { /* unreadable draft: start clean rather than half-load it */ }
    return blank();
  }

  const snapshot = () => JSON.stringify(doc);
  function commit() {
    undo.push(snapshot());
    if (undo.length > 60) undo.shift();
    redo.length = 0;
  }
  function restore(json) { doc = JSON.parse(json); syncForm(); draw(); save(); validateSoon(); }

  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(doc)); } catch (e) {} }, 120);
  }

  // ------------------------------------------------------------------ paint
  function put(tx, ty, ch) {
    if (ty < 0 || ty >= doc.map.length || tx < 0 || tx >= doc.map[0].length) return false;
    if (doc.map[ty][tx] === ch) return false;
    if (UNIQUE.indexOf(ch) >= 0)                       // one spawn, one reunion
      doc.map = doc.map.map((r) => r.split(ch).join('.'));
    doc.map[ty] = setAt(doc.map[ty], tx, ch);
    return true;
  }

  function cellAt(ev) {
    const r = cv.getBoundingClientRect();
    return {
      tx: Math.floor((ev.clientX - r.left) / CELL),
      ty: Math.floor((ev.clientY - r.top) / CELL),
    };
  }
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('mousedown', (e) => {
    e.preventDefault();
    commit();
    painting = e.button === 2 ? 2 : 1;
    const c = cellAt(e);
    if (put(c.tx, c.ty, painting === 2 ? '.' : brush)) { draw(); save(); validateSoon(); }
  });
  addEventListener('mousemove', (e) => {
    if (!painting) return;
    const c = cellAt(e);
    if (put(c.tx, c.ty, painting === 2 ? '.' : brush)) { draw(); save(); validateSoon(); }
  });
  addEventListener('mouseup', () => { painting = 0; });

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    const z = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && z === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
    else if ((e.ctrlKey || e.metaKey) && (z === 'y' || (z === 'z' && e.shiftKey))) { e.preventDefault(); doRedo(); }
    else if (e.key >= '1' && e.key <= '9') { const i = +e.key - 1; if (TILES[i]) setBrush(TILES[i].ch); }
  });
  function doUndo() { if (!undo.length) return; redo.push(snapshot()); restore(undo.pop()); }
  function doRedo() { if (!redo.length) return; undo.push(snapshot()); restore(redo.pop()); }

  // ------------------------------------------------------------------- draw
  const iconCache = {};
  const iconOf = (n) => iconCache[n] || (iconCache[n] = Art.icon(n));
  const HEART = Art.heart(true);

  function draw() {
    const w = doc.map[0].length, h = doc.map.length;
    cv.width = w * CELL; cv.height = h * CELL;
    ctx.imageSmoothingEnabled = false;
    const th = Art.THEMES[doc.theme] || Art.THEMES.neon;

    // A muted sky, not the real one: at full brightness the backdrop swamps the
    // tiles you are actually placing.
    ctx.fillStyle = Art.shade(th.sky[1], -0.62);
    ctx.fillRect(0, 0, cv.width, cv.height);

    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      const ch = doc.map[ty][tx], x = tx * CELL, y = ty * CELL;
      if (ch === '#') {
        ctx.fillStyle = th.ground[1]; ctx.fillRect(x, y, CELL, CELL);
        ctx.fillStyle = th.ground[0]; ctx.fillRect(x, y, CELL, 4);
        ctx.fillStyle = th.edge; ctx.fillRect(x, y, CELL, 1);
      } else if (ch === '-') {
        ctx.fillStyle = th.edge; ctx.fillRect(x, y + 2, CELL, 2);
        ctx.fillStyle = th.ground[0]; ctx.fillRect(x, y + 4, CELL, 2);
      } else if (ch === 'h') ctx.drawImage(HEART, x + 2, y + 2, 10, 9);
      else if (ch === '*') ctx.drawImage(iconOf(souvIcon(tx, ty)), x + 1, y + 1, 12, 12);
      else if (ch === 'c') ctx.drawImage(iconOf('coffee'), x + 1, y + 1, 12, 12);
      else if (ch === 'u') { ctx.fillStyle = '#8fd8ff'; ctx.fillRect(x + 2, y + CELL - 5, CELL - 4, 4); ctx.fillRect(x + 5, y + 2, 4, CELL - 6); }
      else if (ch === 'g') { ctx.fillStyle = '#c88f4a'; ctx.fillRect(x + 2, y + 5, CELL - 4, 7); }
      else if (ch === 'P') { ctx.fillStyle = '#4ad18f'; ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2); ctx.fillStyle = '#08210f'; ctx.fillText('P', x + 4, y + 11); }
      else if (ch === 'E') { ctx.fillStyle = '#e8455c'; ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2); ctx.fillStyle = '#2a0710'; ctx.fillText('E', x + 4, y + 11); }
      else if (ch === '~') {
        ctx.strokeStyle = '#ffd166'; ctx.setLineDash([3, 2]);
        ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3); ctx.setLineDash([]);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.055)';
      ctx.strokeRect(x + 0.5, y + 0.5, CELL, CELL);
    }

    // floor line + every 8th column, so long maps stay countable
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    for (let tx = 0; tx < w; tx += 8) { ctx.beginPath(); ctx.moveTo(tx * CELL + 0.5, 0); ctx.lineTo(tx * CELL + 0.5, cv.height); ctx.stroke(); }

    if (report) {
      for (const g of report.missed) {
        ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 2;
        ctx.strokeRect(g.tx * CELL - 1, g.ty * CELL - 1, CELL + 2, CELL + 2);
        ctx.lineWidth = 1;
      }
    }
  }

  // which souvenir sits on the nth '*' — matches the game's modulo cycling
  function souvIcon(tx, ty) {
    let n = 0;
    outer:
    for (let y = 0; y < doc.map.length; y++)
      for (let x = 0; x < doc.map[0].length; x++) {
        if (doc.map[y][x] !== '*') continue;
        if (x === tx && y === ty) break outer;
        n++;
      }
    const s = doc.souvenirs[n % Math.max(1, doc.souvenirs.length)];
    return (s && s.icon) || 'camera';
  }

  // -------------------------------------------------------------- validation
  let valT = 0;
  const validateSoon = () => { clearTimeout(valT); valT = setTimeout(validate, 220); };

  function validate() {
    const t0 = performance.now();
    const r = LevelCheck.analyse(doc.map);
    const ms = Math.round(performance.now() - t0);
    report = r;
    const el = $('report');
    const goal = r.targets.filter((g) => g.ch === 'E')[0];
    const bad = r.errs.length || r.missed.length || !goal || !goal.got;
    el.className = bad ? 'bad' : 'ok';

    let html = '';
    if (r.errs.length) {
      html += '<h3>WILL NOT LOAD</h3><ul>' + r.errs.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>';
    } else if (bad) {
      html += '<h3>UNWINNABLE</h3><ul>';
      if (!goal || !goal.got) html += '<li>the reunion (E) cannot be reached from the spawn</li>';
      for (const g of r.missed) if (g.ch !== 'E') html += "<li>'" + g.ch + "' at tile (" + g.tx + ',' + g.ty + ') is unreachable — ringed in red</li>';
      html += '</ul>';
    } else {
      html += '<h3>PLAYABLE</h3>';
    }
    html += '<p class="meta">' + r.m.w + '&times;' + r.m.h + ' tiles &middot; ' +
      r.reached + '/' + r.stands + ' stand spots reachable &middot; ' +
      (r.targets.length - r.missed.length) + '/' + r.targets.length + ' pickups &middot; ' +
      'simulated in ' + ms + ' ms</p>';
    el.innerHTML = html;
    draw();
  }
  const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

  // ------------------------------------------------------------------- form
  function syncForm() {
    $('m-id').value = doc.id; $('m-title').value = doc.title; $('m-place').value = doc.place;
    $('m-photo').value = doc.photo || ''; $('m-caption').value = doc.caption || '';
    $('m-theme').value = doc.theme;
    renderSouvs();
  }
  function renderSouvs() {
    const box = $('souvs');
    box.innerHTML = '';
    doc.souvenirs.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'souv';
      const name = document.createElement('input');
      name.value = s.name;
      name.oninput = () => { s.name = name.value; save(); };
      const sel = document.createElement('select');
      ICONS.forEach((ic) => { const o = document.createElement('option'); o.value = o.textContent = ic; sel.appendChild(o); });
      sel.value = s.icon;
      sel.onchange = () => { s.icon = sel.value; save(); draw(); };
      const del = document.createElement('button');
      del.textContent = '×';
      del.onclick = () => { if (doc.souvenirs.length > 1) { commit(); doc.souvenirs.splice(i, 1); renderSouvs(); save(); draw(); } };
      row.append(name, sel, del);
      box.appendChild(row);
    });
  }

  function setBrush(ch) {
    brush = ch;
    [].forEach.call(document.querySelectorAll('#pal button'), (b) => b.classList.toggle('on', b.dataset.ch === ch));
  }

  // ------------------------------------------------------------------- boot
  TILES.forEach((t, i) => {
    const b = document.createElement('button');
    b.dataset.ch = t.ch;
    b.innerHTML = '<b>' + (t.ch === '.' ? '·' : esc(t.ch)) + '</b>' + t.name + ' <span class="meta">' + (i + 1) + '</span>';
    b.onclick = () => setBrush(t.ch);
    $('pal').appendChild(b);
  });
  THEMES.forEach((th) => { const o = document.createElement('option'); o.value = o.textContent = th; $('m-theme').appendChild(o); });

  ['id', 'title', 'place', 'photo', 'caption'].forEach((k) => {
    $('m-' + k).oninput = (e) => { doc[k] = e.target.value; save(); };
  });
  $('m-theme').onchange = (e) => { doc.theme = e.target.value; save(); draw(); };

  $('undo').onclick = doUndo;
  $('redo').onclick = doRedo;
  $('addsouv').onclick = () => { commit(); doc.souvenirs.push({ name: 'New souvenir', icon: ICONS[doc.souvenirs.length % ICONS.length] }); renderSouvs(); save(); draw(); };
  $('wider').onclick = () => resize(4, 0);
  $('narrower').onclick = () => resize(-4, 0);
  $('taller').onclick = () => resize(0, 1);
  $('shorter').onclick = () => resize(0, -1);
  $('fillfloor').onclick = () => { commit(); doc.map[doc.map.length - 1] = new Array(doc.map[0].length).fill('#').join(''); draw(); save(); validateSoon(); };
  $('clear').onclick = () => { if (confirm('Clear the whole map?')) { commit(); doc = blank(); syncForm(); draw(); save(); validateSoon(); } };
  $('test').onclick = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(doc)); } catch (e) {} location.href = 'index.html?draft=1'; };

  function resize(dw, dh) {
    commit();
    const w = Math.max(20, Math.min(200, doc.map[0].length + dw));
    let rows = doc.map.map((r) => (r.length > w ? r.slice(0, w) : r + new Array(w - r.length + 1).join('.')));
    const h = Math.max(6, Math.min(24, rows.length + dh));
    while (rows.length < h) rows.unshift(new Array(w + 1).join('.'));
    while (rows.length > h) rows.shift();
    doc.map = rows;
    draw(); save(); validateSoon();
  }

  $('export').onclick = () => {
    const q = (s) => "'" + String(s).split('\\').join('\\\\').split("'").join("\\'") + "'";
    const lines = [
      '    {',
      '      id: ' + q(doc.id) + ',',
      '      title: ' + q(doc.title) + ',',
      '      place: ' + q(doc.place) + ',',
      '      theme: ' + q(doc.theme) + ',',
      '      photo: ' + q(doc.photo) + ',',
      '      caption: ' + q(doc.caption) + ',',
      '      souvenirs: [',
    ];
    doc.souvenirs.forEach((s) => lines.push('        { name: ' + q(s.name) + ', icon: ' + q(s.icon) + ' },'));
    lines.push('      ],', '      map: [');
    doc.map.forEach((r) => lines.push('        ' + q(r) + ','));
    lines.push('      ],', '    },');
    const out = lines.join('\n');
    $('io').value = out;
    if (navigator.clipboard) navigator.clipboard.writeText(out).catch(() => {});
    $('io').select();
  };

  // Accepts a pasted levels.js entry OR raw JSON OR just the map rows.
  $('import').onclick = () => {
    const raw = $('io').value.trim();
    if (!raw) return;
    commit();
    try {
      if (raw[0] === '{' && raw.indexOf('"map"') >= 0) {
        Object.assign(doc, JSON.parse(raw));
      } else {
        const rows = (raw.match(/'([.#\-hcugPE~*]+)'/g) || []).map((s) => s.slice(1, -1));
        const pick = (k) => { const m = raw.match(new RegExp(k + ":\\s*'([^']*)'")); return m ? m[1] : null; };
        if (rows.length) doc.map = rows;
        ['id', 'title', 'place', 'theme', 'photo', 'caption'].forEach((k) => { const v = pick(k); if (v) doc[k] = v; });
        const names = raw.match(/name:\s*'([^']*)',\s*icon:\s*'([^']*)'/g);
        if (names) doc.souvenirs = names.map((n) => {
          const m = n.match(/name:\s*'([^']*)',\s*icon:\s*'([^']*)'/);
          return { name: m[1], icon: m[2] };
        });
      }
    } catch (e) { alert('Could not parse that: ' + e.message); }
    syncForm(); draw(); save(); validateSoon();
  };

  $('loadreal').onclick = () => {
    const names = Content.LEVELS.map((L, i) => i + ' ' + L.id).join('\n');
    const pickIdx = prompt('Load which shipped level?\n\n' + names, '0');
    const L = Content.LEVELS[+pickIdx];
    if (!L) return;
    commit();
    doc = JSON.parse(JSON.stringify(L));
    doc.id = L.id + '-copy';
    syncForm(); draw(); save(); validateSoon();
  };

  doc = load();
  syncForm();
  setBrush('#');
  draw();
  validate();

  window.__editor = { doc: () => doc, put: put, draw: draw, validate: validate, report: () => report };
})();
