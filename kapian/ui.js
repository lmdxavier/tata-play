// kapian v1 画面与操作：只管显示、动画、声音和输入；规则全在 logic.js
(function () {
'use strict';
const { CFG, DIRS, SLOTS, SLOT_NAME, MON, ST } = L;
const Q = new URLSearchParams(location.search);
const SPEED = +(Q.get('speed') || 1);
let seed = Q.get('seed') ? +Q.get('seed') : (Date.now() % 1e9);
const $ = id => document.getElementById(id);
const CELL = 54, BW = CFG.W * CELL, BH = CFG.H * CELL, TOP = 8; // TOP：棋盘上方留给最上排血条

// ---------- 配色（照原版取的高饱和色） ----------
const C = {
  floorA: '#4fae5e', floorB: '#47a056', doodle: '#5cbd6b', doodleLine: '#3f9150',
  wall: '#24623e', wallLine: '#163f27', wallShadow: '#123320', wallSil: '#2c7148',
  red: ['#7a1f16', '#ffd0b0', '#fa583a'], blue: ['#0a2c66', '#cfe6ff', '#1478d8'], neu: ['#6b5638', '#fff4d8', '#eadcb6'],
  gold: '#ffcc33', tele: 'rgba(255,40,30,', fire: '#ff8a1e',
};

// ---------- 声音 ----------
const SNDS = ['hit', 'hurt', 'big', 'fire', 'boom', 'die', 'lose', 'win', 'whoosh', 'tele', 'pick', 'lvup', 'heal', 'roar', 'tongue', 'ink', 'stun', 'eat', 'click', 'clear', 'warn', 'step', 'slam', 'shell', 'spawn'];
const SND = { ctx: null, buf: {}, on: Q.get('mute') !== '1' };
window.SND_COUNT = 0;
try {
  SND.ctx = new (window.AudioContext || window.webkitAudioContext)();
  for (const n of SNDS) fetch('snd/' + n + '.mp3?v=v2-1124a').then(r => r.arrayBuffer()).then(b => SND.ctx.decodeAudioData(b)).then(d => { SND.buf[n] = d; }).catch(() => {});
} catch (e) {}
function unlock() { if (SND.ctx && SND.ctx.state !== 'running') SND.ctx.resume().catch(() => {}); }
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, true);
const lastPlay = {};
function sfx(n, vol) {
  if (!SND.on || !SND.ctx || !SND.buf[n]) return;
  const now = performance.now(); if (lastPlay[n] && now - lastPlay[n] < 45) return; lastPlay[n] = now;
  const s = SND.ctx.createBufferSource(), g = SND.ctx.createGain();
  s.buffer = SND.buf[n]; g.gain.value = vol == null ? 1 : vol; s.connect(g); g.connect(SND.ctx.destination); s.start();
  window.SND_COUNT++;
}

// ---------- 图片 ----------
const IMG = {};
function img(n) {
  if (!IMG[n]) { IMG[n] = new Image(); IMG[n].src = 'img/' + n + '.png?v=v2-1124a'; IMG[n].onload = () => { dirty = true; refreshSlots(); }; }
  return IMG[n];
}
const ICON = { p: 'Bird_Snow', r: 'rock', a: 'meat' };
for (const k in MON) img(MON[k].img); for (const k in ICON) img(ICON[k]); img('env_Bush_Green_01'); img('env_Forest_Grass');
// 单色剪影（墙里的灌木、地面草丛）：实心、不描边
const silCache = {};
function silhouette(name, color) {
  const key = name + color; if (silCache[key]) return silCache[key];
  const im = img(name); if (!im.complete || !im.naturalWidth) return null;
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return (silCache[key] = c);
}

// ---------- 画布 ----------
const cv = $('board'), ctx = cv.getContext('2d');
const DPR = Math.min(3, window.devicePixelRatio || 1);
cv.width = BW * DPR; cv.height = (BH + TOP) * DPR;
function fit() {
  const st = $('stage'), vw = window.innerWidth, vh = window.innerHeight;
  const k = Math.min(vw / 390, vh / 800);
  st.style.transform = `translateX(-50%) scale(${k})`; st.style.top = Math.max(0, (vh - 800 * k) / 2) + 'px';
}
window.addEventListener('resize', fit); fit();

// ---------- 状态 ----------
let S = null, V = new Map(), teleView = [], fx = [], parts = [], shake = 0, hitstop = 0, flashRed = 0;
let anim = null, queued = null, dirty = true, selTile = null, hintShown = false;
window.__busy = () => !!anim || !$('overlay').classList.contains('hidden') && !overlayInteractive;
let overlayInteractive = false;

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function hash(a, b) { let h = (a * 374761393 + b * 668265263 + S.room * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

function syncV() {
  const keep = new Map();
  for (const u of S.units) {
    if (u.hp <= 0 && u.k !== 'p') continue;
    const o = V.get(u.id) || { ox: 0, oy: 0, sx: 1, sy: 1, alpha: 1, rot: 0, flash: 0, drop: 0 };
    Object.assign(o, { id: u.id, k: u.k, type: u.type, x: u.x, y: u.y, hp: u.hp, maxhp: u.maxhp, elite: u.elite, dead: false });
    keep.set(u.id, o);
  }
  V = keep;
}
function teleSnapshot() {
  teleView = [];
  for (const m of L.mons(S)) if (m.tele) teleView.push({ id: m.id, tiles: L.teleTiles(S, m), alpha: 0, kind: m.tele.kind, dir: m.tele.dir });
}

// ---------- 画 ----------
function cardColors(v) { return v.k === 'p' ? C.blue : v.k === 'm' ? C.red : C.neu; }
function drawCard(g, v, x, y, s, opt) {
  opt = opt || {};
  const col = cardColors(v), pad = 2 * s / CELL, w = s - pad * 2, r = 9 * s / CELL;
  g.save();
  g.translate(x + s / 2, y + s / 2); g.rotate(v.rot || 0); g.scale(v.sx || 1, v.sy || 1); g.translate(-s / 2, -s / 2);
  g.globalAlpha = v.alpha == null ? 1 : v.alpha;
  // 外描边 → 浅色边 → 填充（每层圆角）
  rr(g, pad, pad, w, w, r); g.fillStyle = v.elite ? '#7a5200' : col[0]; g.fill();
  const b1 = 3.2 * s / CELL; rr(g, pad + b1, pad + b1, w - b1 * 2, w - b1 * 2, r - 1.5); g.fillStyle = v.elite ? C.gold : col[1]; g.fill();
  const b2 = b1 + 2.6 * s / CELL; rr(g, pad + b2, pad + b2, w - b2 * 2, w - b2 * 2, r - 3); g.fillStyle = col[2]; g.fill();
  if (v.k === 'r' || v.k === 'a') { // 中立卡细点阵
    g.save(); rr(g, pad + b2, pad + b2, w - b2 * 2, w - b2 * 2, r - 3); g.clip(); g.fillStyle = 'rgba(120,96,60,.18)';
    for (let yy = 0; yy < s; yy += 4 * s / CELL) for (let xx = (yy / (4 * s / CELL)) % 2 * 2 * s / CELL; xx < s; xx += 4 * s / CELL) g.fillRect(xx, yy, 1.2 * s / CELL, 1.2 * s / CELL);
    g.restore();
  }
  const name = v.k === 'm' ? MON[v.type].img : ICON[v.k];
  const im = img(name);
  if (im.complete && im.naturalWidth) {
    const box = s * (v.k === 'm' && MON[v.type].boss ? 0.86 : 0.76), k = box / Math.max(im.naturalWidth, im.naturalHeight * 1.05);
    const iw = im.naturalWidth * k, ih = im.naturalHeight * k;
    g.drawImage(im, (s - iw) / 2, (s - ih) / 2 + s * 0.02, iw, ih);
  }
  if (v.flash > 0) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(255,255,255,${Math.min(1, v.flash)})`; g.fillRect(0, 0, s, s); }
  g.restore();
}
function hpBar(g, v, x, y, s) {
  if (!v.maxhp || v.k === 'r' || v.k === 'a') return;
  const w = s * 0.74, h = 13, bx = x + (s - w) / 2, by = y - 6;
  rr(g, bx, by, w, h, 6); g.fillStyle = '#1b0a0b'; g.fill();
  rr(g, bx + 2, by + 2, (w - 4) * Math.max(0, v.hp) / v.maxhp, h - 4, 4); g.fillStyle = v.k === 'p' ? '#ff4d3d' : '#e8302a'; g.fill();
  g.font = '900 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = '#000'; g.fillStyle = '#fff';
  g.strokeText(Math.max(0, v.hp), x + s / 2, by + h / 2 + 0.5); g.fillText(Math.max(0, v.hp), x + s / 2, by + h / 2 + 0.5);
}
function badge(g, x, y, txt, bg) {
  g.font = '900 10px sans-serif'; const w = Math.max(15, g.measureText(txt).width + 7);
  rr(g, x, y, w, 14, 6); g.fillStyle = bg; g.fill(); g.lineWidth = 2; g.strokeStyle = '#1b0a0b'; g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x + w / 2, y + 7.5);
}
function drawBoard(g, st, s, mini) {
  const W = CFG.W, H = CFG.H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = x * s, py = y * s;
    if (st.tiles[y * W + x] === 1) continue;
    g.fillStyle = (x + y) % 2 ? C.floorB : C.floorA; g.fillRect(px, py, s, s);
    if (!mini && hash(x, y) < 0.22) {
      const sil = silhouette('env_Forest_Grass', C.doodle);
      if (sil) { const k = s * 0.5 / sil.width; g.globalAlpha = 0.9; g.drawImage(sil, px + s * 0.25 + (hash(y, x) - 0.5) * 8, py + s * 0.55, sil.width * k, sil.height * k); g.globalAlpha = 1; }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (st.tiles[y * W + x] !== 1) continue;
    const px = x * s, py = y * s, p = s * 0.04;
    g.fillStyle = C.wallShadow; rr(g, px + p, py + p + s * 0.06, s - 2 * p, s - 2 * p, s * 0.16); g.fill();
    g.fillStyle = C.wallLine; rr(g, px + p, py + p, s - 2 * p, s - 2 * p, s * 0.16); g.fill();
    g.fillStyle = C.wall; rr(g, px + p + 2, py + p + 2, s - 2 * p - 4, s - 2 * p - 4, s * 0.13); g.fill();
    if (!mini) {
      const sil = silhouette('env_Bush_Green_01', C.wallSil);
      if (sil) { const k = s * 0.66 / sil.width; g.drawImage(sil, px + s * 0.17 + (hash(x, y) - 0.5) * 4, py + s * 0.3, sil.width * k, sil.height * k); }
    }
  }
}
function render() {
  const g = ctx;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.clearRect(0, 0, BW, BH + TOP);
  g.fillStyle = C.wallLine; g.fillRect(0, 0, BW, TOP);
  g.translate(0, TOP);
  if (!S || !S.tiles.length) return;
  g.save();
  if (shake > 0.3) g.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
  g.fillStyle = C.wallLine; g.fillRect(-10, -10, BW + 20, BH + 20);
  drawBoard(g, S, CELL, false);
  const t = performance.now();
  // 火
  for (const k of Object.keys(S.fire)) {
    const x = k % CFG.W, y = Math.floor(k / CFG.W), f = S.fire[k];
    g.fillStyle = `rgba(255,${120 + Math.sin(t / 90 + x) * 30 | 0},20,${0.32 + 0.1 * Math.sin(t / 70 + y)})`; rr(g, x * CELL + 4, y * CELL + 4, CELL - 8, CELL - 8, 10); g.fill();
    g.font = '18px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🔥', x * CELL + CELL / 2, y * CELL + CELL / 2 + Math.sin(t / 120 + x) * 2);
  }
  // 红格
  const pulse = 0.5 + 0.5 * Math.sin(t / 160);
  const redTiles = new Map();
  for (const tv of teleView) { tv.alpha = Math.min(1, tv.alpha + 0.12); for (const [x, y] of tv.tiles) { const k = x + ',' + y; redTiles.set(k, Math.max(redTiles.get(k) || 0, tv.alpha)); } }
  for (const [k, a] of redTiles) {
    const [x, y] = k.split(',').map(Number);
    g.fillStyle = `rgba(255,36,24,${(0.5 + 0.18 * pulse) * a})`; rr(g, x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4, 9); g.fill();
    g.strokeStyle = `rgba(255,240,230,${0.9 * a})`; g.lineWidth = 2.5; g.setLineDash([6, 4]); g.lineDashOffset = -t / 40; rr(g, x * CELL + 4, y * CELL + 4, CELL - 8, CELL - 8, 8); g.stroke(); g.setLineDash([]);
  }
  // 增援预告
  for (const q of S.pending) {
    g.strokeStyle = `rgba(255,220,80,${0.6 + 0.4 * pulse})`; g.lineWidth = 3; g.setLineDash([5, 4]); rr(g, q.x * CELL + 5, q.y * CELL + 5, CELL - 10, CELL - 10, 9); g.stroke(); g.setLineDash([]);
    g.font = '900 22px sans-serif'; g.fillStyle = '#ffdd55'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', q.x * CELL + CELL / 2, q.y * CELL + CELL / 2 + 1);
  }
  // 选中格
  if (selTile) { g.strokeStyle = '#fff'; g.lineWidth = 2; rr(g, selTile[0] * CELL + 3, selTile[1] * CELL + 3, CELL - 6, CELL - 6, 9); g.stroke(); }
  // 卡（先画中立，再怪，再自己；活的在死的上面）
  const list = [...V.values()].sort((a, b) => (a.dead - b.dead) || ({ r: 0, a: 0, m: 1, p: 2 }[a.k] - { r: 0, a: 0, m: 1, p: 2 }[b.k]) || (a.y - b.y));
  for (const v of list) {
    const x = v.x * CELL + v.ox, y = v.y * CELL + v.oy - (v.drop || 0);
    drawCard(g, v, x, y, CELL);
  }
  // 红格压在卡上的那部分：粗红框 + 斜纹（被打的格子上有卡时也看得见）
  for (const [k, a] of redTiles) {
    const [x, y] = k.split(',').map(Number); if (!L.unitAt(S, x, y)) continue;
    g.save(); rr(g, x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2, 10); g.clip();
    g.strokeStyle = `rgba(255,36,24,${(0.35 + 0.2 * pulse) * a})`; g.lineWidth = 5;
    for (let i = -CELL; i < CELL * 2; i += 12) { g.beginPath(); g.moveTo(x * CELL + i, y * CELL); g.lineTo(x * CELL + i - CELL, y * CELL + CELL); g.stroke(); }
    g.restore();
    g.strokeStyle = `rgba(255,36,24,${(0.8 + 0.2 * pulse) * a})`; g.lineWidth = 4; rr(g, x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4, 10); g.stroke();
  }
  for (const v of list) {
    if (v.dead || v.alpha < 0.5) continue;
    const x = v.x * CELL + v.ox, y = v.y * CELL + v.oy - (v.drop || 0);
    hpBar(g, v, x, y + 2, CELL);
    if (v.k === 'm') {
      const u = S.units.find(z => z.id === v.id);
      badge(g, x + 3, y + CELL - 17, '⚔' + (u ? u.atk : MON[v.type].atk), '#5a1a12');
      if (u && u.poison > 0) badge(g, x + CELL - 22, y + CELL - 17, '☠' + u.poison, '#3d7a1a');
      if (u && !anim && u.rest > 0 && !(u.stun > 0)) { g.font = '900 13px sans-serif'; g.fillStyle = '#e8f4ff'; g.strokeStyle = '#123'; g.lineWidth = 3; g.textAlign = 'right'; g.strokeText('zZ', x + CELL - 4, y + 18); g.fillText('zZ', x + CELL - 4, y + 18); }
      if (u && !anim && u.stun > 0) { g.font = '14px sans-serif'; g.textAlign = 'right'; g.fillText('💫', x + CELL - 3, y + 18); }
      if (u && u.tele && !anim) { g.font = '900 15px sans-serif'; g.fillStyle = '#ffec3d'; g.strokeStyle = '#5a0a00'; g.lineWidth = 3.5; g.textAlign = 'right'; g.strokeText('!', x + CELL - 5, y + 20); g.fillText('!', x + CELL - 5, y + 20); }
    }
    if (v.k === 'p' && S.p.poison > 0) badge(g, x + CELL - 22, y + CELL - 17, '☠' + S.p.poison, '#3d7a1a');
  }
  // 特效
  for (const p of parts) { g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = p.c; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66); g.restore(); }
  g.globalAlpha = 1;
  for (const f of fx) f.draw(g, f);
  g.restore();
  if (flashRed > 0) { g.fillStyle = `rgba(255,0,0,${flashRed * 0.25})`; g.fillRect(0, 0, BW, BH); }
  // 暗角
  const pc = V.get(0); const cx = pc ? pc.x * CELL + CELL / 2 : BW / 2, cy = pc ? pc.y * CELL + CELL / 2 : BH / 2;
  const grd = g.createRadialGradient(cx, cy, CELL * 2.5, cx, cy, CELL * 9); grd.addColorStop(0, 'rgba(10,30,16,0)'); grd.addColorStop(1, 'rgba(10,30,16,0.35)');
  g.fillStyle = grd; g.fillRect(0, 0, BW, BH);
}

// ---------- 特效工具 ----------
const ctr = (x, y) => [x * CELL + CELL / 2, y * CELL + CELL / 2];
function burst(x, y, col, n, spd) { const [cx, cy] = ctr(x, y); for (let i = 0; i < (n || 10); i++) { const a = Math.random() * 6.28, v = (spd || 2.2) * (0.5 + Math.random()); parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, s: 4 + Math.random() * 4, c: col[Math.floor(Math.random() * col.length)], life: 40, max: 40 }); } }
function floatText(x, y, txt, col, size) {
  const [cx, cy] = ctr(x, y);
  fx.push({ life: 46, max: 46, x: cx + (Math.random() - 0.5) * 8, y: cy - 10, draw(g, f) {
    const k = 1 - f.life / f.max, sc = k < 0.15 ? 0.6 + k * 4 : 1.2 - k * 0.2;
    g.save(); g.translate(f.x, f.y - k * 26); g.scale(sc, sc); g.globalAlpha = Math.min(1, f.life / 14);
    g.font = `900 ${size || 20}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 5; g.strokeStyle = '#1b0a0b'; g.strokeText(txt, 0, 0); g.fillStyle = col; g.fillText(txt, 0, 0); g.restore();
  } });
}
function ring(x, y, col, r1) { const [cx, cy] = ctr(x, y); fx.push({ life: 22, max: 22, draw(g, f) { const k = 1 - f.life / f.max; g.strokeStyle = col; g.globalAlpha = 1 - k; g.lineWidth = 6 * (1 - k) + 1; g.beginPath(); g.arc(cx, cy, CELL * 0.3 + k * CELL * (r1 || 1.4), 0, 6.28); g.stroke(); g.globalAlpha = 1; } }); }
function streak(path, from, col, w) {
  if (!path.length) return; const [ax, ay] = ctr(from[0], from[1]); const last = path[path.length - 1]; const [bx, by] = ctr(last[0], last[1]);
  fx.push({ life: 14, max: 14, draw(g, f) { const k = 1 - f.life / f.max; g.strokeStyle = col; g.globalAlpha = 1 - k * 0.7; g.lineWidth = (w || 5) * (1 - k * 0.5); g.lineCap = 'round';
    const hx = ax + (bx - ax) * Math.min(1, k * 2.2), hy = ay + (by - ay) * Math.min(1, k * 2.2), tx = ax + (bx - ax) * Math.max(0, k * 2.2 - 0.6), ty = ay + (by - ay) * Math.max(0, k * 2.2 - 0.6);
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(hx, hy); g.stroke(); g.globalAlpha = 1; } });
}
function tileFlash(tiles, col) { fx.push({ life: 16, max: 16, draw(g, f) { g.fillStyle = col; g.globalAlpha = f.life / f.max * 0.7; for (const [x, y] of tiles) { rr(g, x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6, 9); g.fill(); } g.globalAlpha = 1; } }); }
function emoji(x, y, e, life) { const [cx, cy] = ctr(x, y); fx.push({ life: life || 30, max: life || 30, draw(g, f) { const k = 1 - f.life / f.max; g.globalAlpha = Math.min(1, f.life / 10); g.font = '24px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, cx, cy - 6 - k * 10); g.globalAlpha = 1; } }); }

// ---------- 时间线 ----------
function Timeline() { this.t = 0; this.tasks = []; this.cursor = 0; }
Timeline.prototype.tween = function (at, dur, fn, done) { this.tasks.push({ at: at / SPEED, dur: Math.max(1, dur / SPEED), fn, done, st: 0 }); };
Timeline.prototype.call = function (at, fn) { this.tasks.push({ at: at / SPEED, dur: 0, fn: null, done: fn, st: 0 }); };
Timeline.prototype.end = function () { return Math.max(this.cursor / SPEED, ...this.tasks.map(t => t.at + t.dur)); };
Timeline.prototype.update = function (dt) {
  this.t += dt;
  for (const k of this.tasks) {
    if (k.st === 2 || this.t < k.at) continue;
    const p = k.dur ? Math.min(1, (this.t - k.at) / k.dur) : 1;
    if (k.fn) k.fn(p);
    if (p >= 1) { k.st = 2; if (k.done) k.done(); }
  }
  return this.t >= this.end();
};
Timeline.prototype.finish = function () { for (const k of this.tasks) if (k.st !== 2) { if (k.fn) k.fn(1); k.st = 2; if (k.done) k.done(); } };

function vOf(id) { return V.get(id); }
function buildTimeline(events) {
  const T = new Timeline(); let c = 0, moveGroup = null, onceTele = false, onceWarn = false, onceBurn = false;
  const endGroup = () => { if (moveGroup) { c = Math.max(c, moveGroup.end); moveGroup = null; } };
  for (const e of events) {
    const v = e.id != null ? vOf(e.id) : null;
    if (e.t === 'move' && e.id !== 0) {
      if (!moveGroup) moveGroup = { start: c, end: c + 110 };
      const st = moveGroup.start;
      if (v) { const fx0 = e.fx, fy0 = e.fy; T.tween(st, 110, p => { v.x = fx0 + (e.x - fx0) * ease(p); v.y = fy0 + (e.y - fy0) * ease(p); v.oy = -Math.sin(p * Math.PI) * 5; v.sy = 1 - Math.sin(p * Math.PI) * 0.08; v.sx = 1 + Math.sin(p * Math.PI) * 0.06; }); }
      continue;
    }
    endGroup();
    switch (e.t) {
      case 'move': case 'dash': case 'push': case 'pull': case 'charge': {
        if (!v) break; const d = { move: 95, dash: 110, push: 95, pull: 110, charge: 130 }[e.t];
        const fx0 = e.fx, fy0 = e.fy;
        T.call(c, () => { if (e.t === 'move') sfx('step', 0.8); if (e.t === 'dash' || e.t === 'charge' || e.t === 'pull') sfx('whoosh', 1.4); });
        T.tween(c, d, p => { const q = e.t === 'move' ? ease(p) : easeOut(p); v.x = fx0 + (e.x - fx0) * q; v.y = fy0 + (e.y - fy0) * q; v.oy = e.t === 'move' ? -Math.sin(p * Math.PI) * 6 : 0; v.sx = 1 + Math.sin(p * Math.PI) * 0.08; v.sy = 1 - Math.sin(p * Math.PI) * 0.1; });
        if (e.t === 'dash') for (let i = 1; i <= 3; i++) { const k = i / 4; const gx = fx0 + (e.x - fx0) * k, gy = fy0 + (e.y - fy0) * k; T.call(c + d * k, () => { const [a, b] = ctr(gx, gy); fx.push({ life: 12, max: 12, draw(g, f) { g.globalAlpha = f.life / f.max * 0.4; g.fillStyle = C.blue[2]; rr(g, a - CELL / 2 + 3, b - CELL / 2 + 3, CELL - 6, CELL - 6, 9); g.fill(); g.globalAlpha = 1; } }); }); }
        c += d; break;
      }
      case 'bump': {
        const a = vOf(0), tgt = vOf(e.to); if (!a) break; const d = e.d;
        T.tween(c, 150, p => { const k = p < 0.4 ? easeOut(p / 0.4) : 1 - ease((p - 0.4) / 0.6); a.ox = d[0] * CELL * 0.38 * k; a.oy = d[1] * CELL * 0.38 * k; });
        T.call(c + 60, () => { hitstop = e.big ? 110 : 60; shake = Math.max(shake, e.big ? 9 : 4); sfx(e.big ? 'big' : 'hit', e.big ? 1 : 1.1); if (tgt) burst(tgt.x, tgt.y, ['#fff', '#ffd0b0', '#fa583a'], e.big ? 18 : 9, e.big ? 3.5 : 2.4); if (e.big && tgt) floatText(tgt.x, tgt.y - 0.5, '重拳!', '#ffd34d', 16); });
        if (tgt) T.tween(c + 60, 120, p => { tgt.ox = d[0] * 7 * Math.sin(p * Math.PI); tgt.oy = d[1] * 7 * Math.sin(p * Math.PI); tgt.sx = 1 + 0.12 * Math.sin(p * Math.PI); tgt.sy = 1 - 0.12 * Math.sin(p * Math.PI); });
        c += 80; break;
      }
      case 'dmg': {
        if (!v) break; const n = e.n;
        T.call(c, () => {
          v.hp -= n; v.flash = 1;
          if (e.id === 0) { flashRed = 1; shake = Math.max(shake, 6); sfx('hurt', 1.2); floatText(v.x, v.y, '-' + n, '#ff5a4a', 22); }
          else { floatText(v.x, v.y, '' + n, e.src === 'poison' ? '#9dff6a' : e.src === 'fire' ? '#ffb340' : '#ffffff', e.src === 'poison' || e.src === 'fire' ? 16 : 20); if (e.src === 'ff') sfx('hit', 0.8); }
        });
        T.tween(c, 140, p => { v.flash = 1 - p; });
        c += 25; break;
      }
      case 'block': if (v) T.call(c, () => { floatText(v.x, v.y, '挡', '#cfe6ff', 16); sfx('shell', 0.6); }); break;
      case 'die': {
        if (!v) break; const boom = e.boom;
        T.call(c, () => { v.dead = true; sfx(boom ? 'boom' : 'die', boom ? 1 : 1.3); burst(v.x, v.y, boom ? ['#ffcf3d', '#ff7a1e', '#fff'] : ['#fa583a', '#ffd0b0', '#7a1f16', '#fff4d8'], boom ? 24 : 16, boom ? 4 : 3); if (boom) { shake = Math.max(shake, 9); ring(v.x, v.y, '#ffcf3d', 1.6); } });
        T.tween(c, 240, p => { v.sx = v.sy = 1 + 0.15 * Math.sin(p * Math.PI) - p * 0.7; v.rot = p * 0.6; v.alpha = 1 - p; });
        c += 70; break;
      }
      case 'pdie': if (v) { T.call(c, () => { v.dead = true; sfx('lose'); shake = 10; }); T.tween(c, 500, p => { v.rot = -p * 0.4; v.alpha = 1 - p * 0.6; v.sy = 1 - p * 0.3; }); c += 300; } break;
      case 'strike': {
        const tv = teleView.find(z => z.id === e.id);
        T.call(c, () => { teleView = teleView.filter(z => z.id !== e.id); if (tv) tileFlash(tv.tiles, '#ff3b2a');
          const s = { breath: 'fire', bomb: null, line: 'whoosh', lob: 'ink', slam: 'big', cross: 'big', summon: 'roar', charge: 'whoosh', tongue: 'tongue', wide: 'whoosh' }[e.kind];
          if (s) sfx(s, 1); if (e.kind === 'slam' || e.kind === 'cross') shake = Math.max(shake, 8); });
        if (v && tv && tv.dir != null) { const d = DIRS[tv.dir]; T.tween(c, 130, p => { const k = Math.sin(p * Math.PI); v.ox = d[0] * CELL * 0.3 * k; v.oy = d[1] * CELL * 0.3 * k; }); }
        else if (v) T.tween(c, 130, p => { const k = Math.sin(p * Math.PI); v.sx = v.sy = 1 + 0.15 * k; });
        c += 70; break;
      }
      case 'shot': if (v) T.call(c, () => streak(e.path, [v.x, v.y], '#fff6c0', 6)); c += 40; break;
      case 'arrow': { const p0 = vOf(0); if (p0) T.call(c, () => { streak(e.path, [p0.x, p0.y], '#ffffff', 5); sfx('whoosh', 1.5); }); c += 70; break; }
      case 'fireset': T.call(c, () => { const [a, b] = ctr(e.x, e.y); for (let i = 0; i < 5; i++) parts.push({ x: a, y: b, vx: (Math.random() - 0.5) * 1.5, vy: -1 - Math.random() * 1.5, r: 0, vr: 0, s: 5, c: '#ff8a1e', life: 24, max: 24 }); }); break;
      case 'burn': if (v) T.call(c, () => { emoji(v.x, v.y, '🔥', 22); if (!onceBurn) { onceBurn = true; sfx('fire', 0.6); } }); break;
      case 'poison': if (v) T.call(c, () => emoji(v.x, v.y, '☠️', 24)); break;
      case 'sweep': T.call(c, () => { tileFlash(e.tiles.filter(t => !L.wall(S, t[0], t[1])), 'rgba(255,255,255,0.9)'); sfx('whoosh', 1.2); }); c += 40; break;
      case 'slam': T.call(c, () => { sfx('slam', 1.2); shake = Math.max(shake, 6); const [a, b] = ctr(e.x, e.y); burst(e.x, e.y, ['#d9c7a0', '#8a6a40', '#fff'], 10, 2.5); }); c += 50; break;
      case 'quake': { const p0 = vOf(0); T.call(c, () => { sfx('boom', 0.9); shake = Math.max(shake, 8); if (p0) { ring(p0.x, p0.y, '#ffe08a', 1.2); ring(p0.x, p0.y, '#ffffff', 0.8); } }); c += 90; break; }
      case 'tongue': case 'tonguem': {
        const from = e.t === 'tongue' ? vOf(0) : v; if (!from) break; const fx0 = from.x, fy0 = from.y;
        T.call(c, () => { sfx('tongue', 0.9); const [a, b] = ctr(fx0, fy0), [cx2, cy2] = ctr(e.x, e.y); fx.push({ life: 14, max: 14, draw(g, f) { g.strokeStyle = '#ff6fa0'; g.lineWidth = 6; g.lineCap = 'round'; g.globalAlpha = f.life / f.max; g.beginPath(); g.moveTo(a, b); g.lineTo(cx2, cy2); g.stroke(); g.globalAlpha = 1; } }); });
        c += 60; break;
      }
      case 'ink': { const p0 = vOf(0); T.call(c, () => { sfx('ink', 1.3); if (p0) { ring(p0.x, p0.y, '#2a1a4a', e.r * 1.2); burst(p0.x, p0.y, ['#2a1a4a', '#4a3a7a'], 16, 3); } }); c += 60; break; }
      case 'shell': { const p0 = vOf(0); T.call(c, () => { sfx('shell', 1.2); if (p0) { ring(p0.x, p0.y, '#9fdcff', 0.6); floatText(p0.x, p0.y, '挡住!', '#9fdcff', 16); } }); c += 50; break; }
      case 'thorns': { const t2 = vOf(e.to), p0 = vOf(0); T.call(c, () => { if (p0 && t2) streak([[t2.x, t2.y]], [p0.x, p0.y], '#ffe066', 4); }); c += 30; break; }
      case 'heal': if (v) T.call(c, () => { floatText(v.x, v.y, '+' + e.n, '#7dff8a', e.id === 0 ? 22 : 15); if (e.id === 0) { sfx('heal', 1); burst(v.x, v.y, ['#7dff8a', '#fff'], 10, 2); } v.hp += e.n; }); c += e.id === 0 ? 60 : 10; break;
      case 'eat': if (v) { T.call(c, () => { sfx('eat', 1.2); }); T.tween(c, 200, p => { v.sx = v.sy = 1 + p * 0.3; v.alpha = 1 - p; }, () => { v.dead = true; }); c += 60; } break;
      case 'interrupt': if (v) T.call(c, () => { teleView = teleView.filter(z => z.id !== e.id); sfx('stun', 1); floatText(v.x, v.y - 0.3, '打断', '#9fdcff', 15); emoji(v.x, v.y, '💫', 30); }); c += 30; break;
      case 'stunwall': if (v) T.call(c, () => { sfx('slam', 1); shake = Math.max(shake, 5); emoji(v.x, v.y, '💫', 40); }); c += 40; break;
      case 'tele': T.call(c, () => { if (!onceTele) { onceTele = true; sfx('tele', 0.5); } }); break;
      case 'spawn': {
        const u = S.units.find(z => z.id === e.id); if (!u) break;
        const o = { id: u.id, k: 'm', type: u.type, x: u.x, y: u.y, hp: u.hp, maxhp: u.maxhp, ox: 0, oy: 0, sx: 1, sy: 1, alpha: 0, rot: 0, flash: 0, drop: 0, dead: false };
        T.call(c, () => { V.set(u.id, o); sfx('spawn', 1.2); });
        T.tween(c, 200, p => { o.alpha = p; o.drop = (1 - easeOut(p)) * 30; }); c += 60; break;
      }
      case 'warn': T.call(c, () => { if (!onceWarn) { onceWarn = true; sfx('warn', 0.5); } }); break;
      case 'trig': T.call(c, () => flashSlot(e.slot)); c += 50; break;
      case 'wait': { const p0 = vOf(0); if (p0) T.tween(c, 140, p => { p0.sx = p0.sy = 1 - Math.sin(p * Math.PI) * 0.08; }); c += 60; break; }
    }
  }
  endGroup();
  T.cursor = c + 40;
  return T;
}
const ease = p => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
const easeOut = p => 1 - Math.pow(1 - p, 3);

// ---------- 主循环 ----------
let last = performance.now();
function frame(now) {
  let dt = Math.min(50, now - last); last = now;
  if (hitstop > 0) { hitstop -= dt; dt = 0; }
  if (anim) {
    if (anim.update(dt)) endAnim();
  }
  for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.r += p.vr; p.life--; }
  parts = parts.filter(p => p.life > 0);
  for (const f of fx) f.life--; fx = fx.filter(f => f.life > 0);
  shake *= 0.82; flashRed *= 0.88;
  render();
  requestAnimationFrame(frame);
}
function endAnim() {
  if (!anim) return;
  anim.finish(); anim = null;
  syncV(); const old = new Map(teleView.map(t => [t.id, t.alpha])); teleSnapshot();
  for (const t of teleView) t.alpha = old.has(t.id) ? old.get(t.id) : 0;
  refreshHud(); refreshSlots();
  afterTurn();
  if (queued) { const q = queued; queued = null; doAction(q); }
}

// ---------- 行动 ----------
function doAction(a) {
  if (!S || S.phase !== 'play' || S.over) return;
  if (anim) { queued = a; endAnimFast(); return; }
  if (!L.legal(S, a)) { sfx('stun', 0.4); return; }
  selTile = null;
  S.log = [];
  L.step(S, a);
  const evs = S.log; S.log = null;
  anim = buildTimeline(evs);
  refreshSlots();
}
function endAnimFast() { // 动画中又按了：把这段演完再执行新的
  const q = queued; queued = null; endAnim(); if (q) doAction(q);
}
let pendingPhase = null;
function afterTurn() {
  setInfoDefault();
  if (S.phase === 'over') {
    setTimeout(() => showOver(), S.over === 'win' ? 500 : 900);
  } else if (S.phase === 'reward') {
    sfx('clear', 1);
    burstAll();
    setTimeout(() => showReward(), 650 / SPEED);
  }
}
function burstAll() { for (let i = 0; i < 6; i++) setTimeout(() => burst(Math.random() * 7, Math.random() * 9, ['#ffd34d', '#fff', '#7dff8a', '#4aa8ff'], 12, 3), i * 60); }

// ---------- 输入 ----------
function cellAt(ev) { const r = cv.getBoundingClientRect(), k = r.width / BW; return [Math.floor((ev.clientX - r.left) / k / CELL), Math.floor(((ev.clientY - r.top) / k - TOP) / CELL)]; }
let down = null;
cv.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, c: cellAt(e) }; e.preventDefault(); });
cv.addEventListener('pointerup', e => {
  if (!down || !S) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; const r = cv.getBoundingClientRect(), k = r.width / BW;
  const st = down; down = null;
  if (S.phase !== 'play' || !$('overlay').classList.contains('hidden') || performance.now() < boardBlock) return;
  if (Math.hypot(dx, dy) > 22 * k) { // 滑动
    const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0); doAction({ t: 'move', d }); return;
  }
  const [x, y] = st.c, p = S.p;
  if (x === p.x && y === p.y) { showInfoPlayer(); return; }
  const md = Math.abs(x - p.x) + Math.abs(y - p.y);
  if (md === 1) { const d = DIRS.findIndex(dd => dd[0] === x - p.x && dd[1] === y - p.y); doAction({ t: 'move', d }); return; }
  showInfoTile(x, y);
});
window.addEventListener('keydown', e => {
  if (!S || !$('overlay').classList.contains('hidden') || performance.now() < boardBlock) return;
  const k = e.key.toLowerCase();
  const map = { arrowup: 0, w: 0, arrowright: 1, d: 1, arrowdown: 2, s: 2, arrowleft: 3, a: 3 };
  if (k in map) { e.preventDefault(); if (S.phase === 'play') doAction({ t: 'move', d: map[k] }); }
  else if (k === ' ' || k === 'enter') { e.preventDefault(); if (S.phase === 'play') doAction({ t: 'wait' }); }
});
$('waitbtn').addEventListener('click', () => { if (S && S.phase === 'play' && performance.now() >= boardBlock) doAction({ t: 'wait' }); });
$('mute').addEventListener('click', () => { SND.on = !SND.on; $('mute').textContent = SND.on ? '🔊' : '🔇'; if (SND.on) sfx('click'); });
$('restart').addEventListener('click', () => {
  if (S && S.phase === 'over') return;
  showConfirm('重新开始这一局？', () => newGame(seed + 1));
});

// ---------- 信息条 ----------
function setInfo(html) { $('info').innerHTML = html ? '<span>' + html + '</span>' : ''; }
function setInfoDefault() {
  if (!S) return;
  if (S.room === 1 && !hintShown && S.phase === 'play') { setInfo('红格 = 怪下回合要打的位置。点旁边的格子走 / 撞怪，滑动也行'); return; }
  setInfo('');
}
function showInfoTile(x, y) {
  selTile = [x, y];
  const u = L.unitAt(S, x, y);
  if (!u) { if (L.wall(S, x, y)) setInfo('树墙：过不去'); else if (S.fire[y * CFG.W + x]) setInfo('火：怪站在上面每回合掉血'); else setInfo(''); return; }
  if (u.k === 'r') return setInfo('石头：过不去；把怪推到它上面会多打伤害');
  if (u.k === 'a') return setInfo(`肉：走过去吃，回 ${CFG.appleHeal} 血`);
  const d = MON[u.type];
  const st = d.st ? ` · 打死给「${ST[d.st].n}」（${SLOT_NAME[ST[d.st].slot]}位）` : (u.type === 'slime' ? ' · 打死给 1 点经验' : '');
  const state = u.tele ? '<b style="color:#ffec3d">下回合打红格</b>' : u.rest > 0 ? '喘气中（这回合不动）' : u.stun > 0 ? '晕了（这回合不动）' : '';
  setInfo(`<b>${d.n}${u.elite ? '（精英）' : ''}</b> 血 ${u.hp}/${u.maxhp} · 攻 ${u.atk} · ${d.tip}${st}${state ? '<br>' + state : ''}`);
}
function showInfoPlayer() { selTile = null; setInfo(`你：血 ${S.p.hp}/${S.p.maxhp} · 撞怪打 ${CFG.pAtk}。点自己或下面按钮 = 原地等一回合`); }

// ---------- 顶栏、角色卡 ----------
function refreshHud() {
  if (!S) return;
  const name = { normal: '', elite: ' 精英', boss: ' 头目', camp: ' 篝火' }[S.roomType] || '';
  $('room').textContent = `第 ${S.room}/${CFG.rooms} 关${name}`;
  const hp = S.p ? S.p.hp : S.hp, mx = S.maxhp;
  $('hpfill').style.width = Math.max(0, hp / mx * 100) + '%'; $('hptext').textContent = `${Math.max(0, hp)} / ${mx}`;
}
function stickerCanvas(id, size, slot) {
  const c = document.createElement('canvas'); c.width = size * 2; c.height = size * 2; const g = c.getContext('2d'); g.scale(2, 2);
  if (!id) { rr(g, 3, 3, size - 6, size - 6, 9); g.setLineDash([5, 4]); g.strokeStyle = '#4f7d5b'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#4f7d5b'; g.font = `800 ${size * 0.22}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('空', size / 2, size / 2); return c; }
  const v = { k: 'st', sx: 1, sy: 1, alpha: 1 };
  // 贴纸 = 米白卡 + 来源怪
  const col = ['#6b4a2a', '#fffaf0', '#f5e2b8'], s = size, pad = 2, w = s - 4, r = s * 0.17;
  rr(g, pad, pad, w, w, r); g.fillStyle = col[0]; g.fill();
  rr(g, pad + 3, pad + 3, w - 6, w - 6, r - 2); g.fillStyle = col[1]; g.fill();
  rr(g, pad + 5.5, pad + 5.5, w - 11, w - 11, r - 3); g.fillStyle = col[2]; g.fill();
  const im = img(MON[ST[id].from].img);
  if (im.complete && im.naturalWidth) { const box = s * 0.7, k = box / Math.max(im.naturalWidth, im.naturalHeight); g.drawImage(im, (s - im.naturalWidth * k) / 2, (s - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k); }
  return c;
}
function chargeInfo(slot) {
  const sl = S.slots[slot], a = sl.active; if (!a) return null;
  const lv = L.lv(S, slot), d = ST[a];
  if (a === 'heal') return { n: d.uses[lv - 1], on: sl.uses, ready: sl.uses > 0 };
  if (!d.max) return null;
  const mx = d.max[lv - 1]; return { n: mx, on: Math.min(mx, sl.charge), ready: sl.charge >= mx };
}
let slotSel = null;
function refreshSlots() {
  if (!S) return;
  const box = $('slots'); box.innerHTML = '';
  for (const s of SLOTS) {
    const sl = S.slots[s], lv = L.lv(S, s), a = sl.active;
    const d = document.createElement('div'); d.className = 'slot' + (slotSel === s ? ' sel' : ''); d.id = 'slot-' + s;
    d.innerHTML = `<div class="hd">${SLOT_NAME[s]} <b>Lv${lv}</b></div><div class="card"></div><div class="nm">${a ? ST[a].n : '—'}</div><div class="pips"></div><div class="rs"></div>`;
    d.querySelector('.card').appendChild(stickerCanvas(a, 64));
    const ci = chargeInfo(s), pp = d.querySelector('.pips');
    if (ci) { if (ci.ready) pp.classList.add('ready'); for (let i = 0; i < ci.n; i++) { const p = document.createElement('div'); p.className = 'pip' + (i < ci.on ? ' on' : ''); pp.appendChild(p); } }
    const rs = d.querySelector('.rs'); for (const r of sl.reserve) rs.appendChild(stickerCanvas(r, 22));
    d.addEventListener('click', () => {
      slotSel = slotSel === s ? null : s; refreshSlots();
      if (!slotSel) return setInfoDefault();
      const xpNext = lv < 3 ? `（经验 ${sl.xp}/${CFG.xpLv[lv]} 升 Lv${lv + 1}）` : '（满级）';
      setInfo(a ? `<b>${ST[a].n} Lv${lv}</b>：${L.stDesc(a, lv)}${sl.reserve.length ? ` · 备用 ${sl.reserve.map(r => ST[r].n).join('、')}（房间之间可换）` : ''}` : `${SLOT_NAME[s]}位还没贴纸 ${xpNext}`);
    });
    box.appendChild(d);
  }
  const w = S.slots.wait, wa = w.active, ci = chargeInfo('wait');
  $('waitbtn').classList.toggle('ready', !!(wa && ci && ci.ready));
  $('waitbtn').textContent = wa && ci && ci.ready ? `原地等：${ST[wa].n}` : '原地等一回合';
}
function flashSlot(s) { const el = $('slot-' + s); if (!el) return; el.classList.remove('trig'); void el.offsetWidth; el.classList.add('trig'); }

// ---------- 弹层 ----------
function ov(html, interactive) { const o = $('overlay'); o.innerHTML = html; o.classList.remove('hidden'); overlayInteractive = interactive !== false; return o; }
let boardBlock = 0;
function closeOv() { boardBlock = performance.now() + 400; $('overlay').classList.add('hidden'); $('overlay').innerHTML = ''; }
let guardUntil = 0;
function guard() { return performance.now() < guardUntil; }
function arm() { guardUntil = performance.now() + 320; }
function showConfirm(msg, yes) {
  const o = ov(`<div class="ov-title" style="margin-top:220px">${msg}</div><div class="btnrow"><button class="btn gray" id="cno">取消</button><button class="btn" id="cyes">确定</button></div>`);
  arm();
  o.querySelector('#cno').onclick = () => { if (guard()) return; sfx('click'); closeOv(); };
  o.querySelector('#cyes').onclick = () => { if (guard()) return; sfx('click'); closeOv(); yes(); };
}
function offerHtml(o, i) {
  if (o.t === 'xp') return `<div class="offer" data-i="${i}" style="animation-delay:${i * 70}ms"><canvas data-img="Slime_Green" width="144" height="144"></canvas><div class="t">史莱姆胶</div><div class="tag">任一位置</div><div class="d">选一个位置 +1 经验（2 经验升 Lv2，5 经验升 Lv3）</div></div>`;
  const id = o.id, sl = ST[id].slot, lv = L.lv(S, sl), owned = L.owned(S, id), full = L.slotFull(S, sl);
  const foot = (o.found ? '路上捡到的<br>' : '') + (owned ? '已有：自动熔掉 +2 经验' : (!S.seen[id] ? '新贴纸：该位置 +1 经验' : '') + (full ? '<br>位置满了，要熔掉一张' : ''));
  return `<div class="offer" data-i="${i}" style="animation-delay:${i * 70}ms"><canvas data-st="${id}" width="144" height="144"></canvas><div class="t">${ST[id].n}</div><div class="tag">${SLOT_NAME[sl]}位 · Lv${lv}</div><div class="d">${L.stDesc(id, lv)}</div><div class="f">${foot}</div></div>`;
}
function paintCanvases(root) {
  root.querySelectorAll('canvas[data-st]').forEach(c => { const s = stickerCanvas(c.dataset.st, 72); const g = c.getContext('2d'); g.drawImage(s, 0, 0, 144, 144); });
  root.querySelectorAll('canvas[data-img]').forEach(c => { const im = img(c.dataset.img); const g = c.getContext('2d'); const draw = () => { g.clearRect(0, 0, 144, 144); const k = 110 / Math.max(im.naturalWidth, im.naturalHeight); g.drawImage(im, (144 - im.naturalWidth * k) / 2, (144 - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k); }; if (im.complete) draw(); else im.addEventListener('load', draw); });
}
function showReward() {
  if (S.phase !== 'reward') return;
  const n = S.pickLeft;
  const o = ov(`<div class="ov-title">房间清空！</div><div class="ov-sub">${n > 1 ? `精英房：选 ${n} 张` : '选 1 张贴纸'}（贴纸整局有效，每个位置生效 1 张、另存 2 张备用）</div><div class="offers">${S.offers.map(offerHtml).join('')}</div>`);
  paintCanvases(o); arm(); sfx('pick', 0.8);
  o.querySelectorAll('.offer').forEach(el => el.onclick = () => { if (guard()) return; sfx('click'); pickOffer(+el.dataset.i); });
}
function pickOffer(i) {
  const off = S.offers[i];
  if (off.t === 'xp') return chooseSlot('史莱姆胶：给哪个位置 +1 经验？', s => doTake(i, { xpSlot: s }));
  const slot = ST[off.id].slot;
  if (!L.owned(S, off.id) && L.slotFull(S, slot)) {
    const sl = S.slots[slot], list = [sl.active, ...sl.reserve];
    const o = ov(`<div class="ov-title">${SLOT_NAME[slot]}位满了</div><div class="ov-sub">熔掉一张换 +2 经验（熔掉就没了；熔掉生效中的那张，新的直接上场）</div><div class="offers">${[...list.map((id, k) => `<div class="offer" data-m="${id}" style="min-height:150px"><canvas data-st="${id}" width="144" height="144"></canvas><div class="t">${ST[id].n}</div><div class="tag">${k === 0 ? '生效中' : '备用'}</div><div class="d">${L.stDesc(id, L.lv(S, slot))}</div></div>`), `<div class="offer" data-m="new" style="min-height:150px"><canvas data-st="${off.id}" width="144" height="144"></canvas><div class="t">${ST[off.id].n}</div><div class="tag">新拿的</div><div class="d">${L.stDesc(off.id, L.lv(S, slot))}</div></div>`].join('')}</div><div class="btnrow"><button class="btn gray" id="back">返回</button></div>`);
    paintCanvases(o); arm();
    o.querySelectorAll('.offer').forEach(el => el.onclick = () => { if (guard()) return; sfx('click'); doTake(i, { melt: el.dataset.m }); });
    o.querySelector('#back').onclick = () => { if (guard()) return; sfx('click'); showReward(); };
    return;
  }
  doTake(i, {});
}
function doTake(i, opt) {
  const before = SLOTS.map(s => L.lv(S, s)).join();
  L.takeOffer(S, i, opt);
  const after = SLOTS.map(s => L.lv(S, s)).join();
  if (before !== after) sfx('lvup', 0.9); else sfx('pick', 1);
  refreshSlots();
  if (S.phase === 'reward') showReward(); else showFork();
}
function chooseSlot(title, cb, back) {
  const o = ov(`<div class="ov-title" style="margin-top:120px">${title}</div><div class="btnrow" style="margin-top:24px">${SLOTS.map(s => `<button class="btn blue" data-s="${s}">${SLOT_NAME[s]} Lv${L.lv(S, s)}<br><span style="font-size:11px">经验 ${S.slots[s].xp}</span></button>`).join('')}</div><div class="btnrow"><button class="btn gray" id="back">返回</button></div>`);
  o.querySelectorAll('.btn.blue').forEach(b => { b.style.height = '58px'; b.style.minWidth = '80px'; });
  arm();
  o.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { if (guard()) return; sfx('click'); cb(b.dataset.s); });
  o.querySelector('#back').onclick = () => { if (guard()) return; sfx('click'); (back || (() => S.phase === 'reward' ? showReward() : S.phase === 'camp' ? showCamp() : showFork()))(); };
}
const DOOR_TXT = { normal: ['普通房间', '打完挑 1 张贴纸'], elite: ['精英房间', '怪更多、有一只精英；打完挑 2 张'], camp: ['篝火', `回 ${CFG.campHeal} 血 或 某位置 +${CFG.campXp} 经验`], boss: ['头目：史莱姆王', '最后一关'] };
let mgSel = null;
function showFork() {
  if (S.phase !== 'fork') return;
  const cols = SLOTS.map(s => {
    const sl = S.slots[s], lv = L.lv(S, s);
    return `<div class="col"><div class="hd">${SLOT_NAME[s]} <b>Lv${lv}</b></div><div class="a"><canvas data-k="${s}|a" data-st2="${sl.active || ''}" width="116" height="116" class="${mgSel && mgSel.s === s && mgSel.k === 'a' ? 'pick' : ''}"></canvas></div>
      <div class="r">${sl.reserve.map((r, k) => `<canvas data-k="${s}|${k}" data-st2="${r}" width="72" height="72" class="${mgSel && mgSel.s === s && mgSel.k === k ? 'pick' : ''}"></canvas>`).join('')}</div><div class="xp">经验 ${sl.xp}${lv < 3 ? '/' + CFG.xpLv[lv] : ''}</div></div>`;
  }).join('');
  let sel = '点一张贴纸看说明；备用的可以换上场或熔掉';
  if (mgSel) {
    const sl = S.slots[mgSel.s], id = mgSel.k === 'a' ? sl.active : sl.reserve[mgSel.k], lv = L.lv(S, mgSel.s);
    if (id) sel = `<b>${ST[id].n}（${SLOT_NAME[mgSel.s]}位 Lv${lv}）</b>：${L.stDesc(id, lv)}<div class="btnrow">${mgSel.k !== 'a' ? '<button class="btn small blue" id="sw">换上场</button>' : ''}<button class="btn small gray" id="ml">熔掉 +2 经验</button></div>`;
  }
  const doors = S.doors.map((d, i) => `<div class="door ${d.type}" data-i="${i}" style="animation-delay:${i * 80}ms"><div class="t">${DOOR_TXT[d.type][0]}</div><canvas data-door="${i}" width="280" height="360"></canvas><div class="d">${DOOR_TXT[d.type][1]}${d.terrain && d.type !== 'camp' ? (d.terrain === 'walls' ? ' · 墙多' : ' · 空旷') : ''}</div></div>`).join('');
  const o = ov(`<div class="ov-title" style="font-size:20px;margin-top:0">整理贴纸</div><div class="mg">${cols}</div><div class="selbox">${sel}</div><div class="ov-title" style="font-size:18px;margin-top:10px">选下一个房间</div><div class="doors">${doors}</div>`);
  o.style.paddingTop = '12px';
  o.querySelectorAll('canvas[data-st2]').forEach(c => { const sz = c.width / 2; const s2 = stickerCanvas(c.dataset.st2 || null, sz); c.getContext('2d').drawImage(s2, 0, 0, c.width, c.height); });
  o.querySelectorAll('canvas[data-door]').forEach(c => drawDoor(c, S.doors[+c.dataset.door]));
  arm();
  o.querySelectorAll('canvas[data-k]').forEach(c => c.onclick = () => { if (guard()) return; const [s, k] = c.dataset.k.split('|'); const kk = k === 'a' ? 'a' : +k; if (!c.dataset.st2) return; sfx('click', 0.7); mgSel = mgSel && mgSel.s === s && mgSel.k === kk ? null : { s, k: kk }; showForkKeep(); });
  const sw = o.querySelector('#sw'); if (sw) sw.onclick = () => { if (guard()) return; L.swap(S, mgSel.s, mgSel.k); mgSel = { s: mgSel.s, k: 'a' }; sfx('pick', 0.8); refreshSlots(); showForkKeep(); };
  const ml = o.querySelector('#ml'); if (ml) ml.onclick = () => { if (guard()) return; const sl = S.slots[mgSel.s]; const id = mgSel.k === 'a' ? sl.active : sl.reserve[mgSel.k]; const b = L.lv(S, mgSel.s); L.melt(S, mgSel.s, id); sfx(L.lv(S, mgSel.s) > b ? 'lvup' : 'die', 0.9); mgSel = null; refreshSlots(); showForkKeep(); };
  o.querySelectorAll('.door').forEach(el => el.onclick = () => { if (guard()) return; sfx('click'); enterDoor(+el.dataset.i); });
}
function showForkKeep() { const keep = guardUntil; showFork(); guardUntil = keep; }
function drawDoor(c, d) {
  const g = c.getContext('2d'), s = c.width / CFG.W;
  g.fillStyle = C.wallLine; g.fillRect(0, 0, c.width, c.height);
  if (d.type === 'camp') { g.fillStyle = C.floorA; g.fillRect(0, 0, c.width, c.height); g.font = '90px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🔥', c.width / 2, c.height / 2); return; }
  drawBoard(g, d, s, true);
  for (const u of d.units) drawCard(g, { k: u.k, type: u.type, elite: u.elite, sx: 1, sy: 1, alpha: 1 }, u.x * s, u.y * s, s);
  drawCard(g, { k: 'p', sx: 1, sy: 1, alpha: 1 }, CFG.start[0] * s, CFG.start[1] * s, s);
}
function enterDoor(i) {
  mgSel = null; slotSel = null;
  L.chooseDoor(S, i);
  closeOv();
  if (S.phase === 'camp') return showCamp();
  startRoomAnim();
}
function startRoomAnim() {
  fx = []; parts = []; syncV(); teleSnapshot(); refreshHud(); refreshSlots(); setInfoDefault();
  if (S.room > 1) hintShown = true;
  const T = new Timeline(); let k = 0;
  for (const v of V.values()) { v.alpha = 0; const d = k++ * 35; T.tween(d, 220, p => { v.alpha = Math.min(1, p * 1.6); v.drop = (1 - easeOut(p)) * 26; v.sx = v.sy = 0.9 + 0.1 * easeOut(p); }); }
  T.call(0, () => sfx(S.roomType === 'boss' ? 'roar' : 'spawn', S.roomType === 'boss' ? 1 : 0.8));
  T.cursor = k * 35 + 220;
  anim = T;
}
function showCamp() {
  const o = ov(`<div class="ov-title" style="margin-top:110px">🔥 篝火</div><div class="ov-sub">二选一</div><div class="btnrow" style="margin-top:28px"><button class="btn" id="ch">回 ${CFG.campHeal} 血（现在 ${S.hp}/${S.maxhp}）</button><button class="btn blue" id="cx">某位置 +${CFG.campXp} 经验</button></div>`);
  arm();
  o.querySelector('#ch').onclick = () => { if (guard()) return; sfx('heal'); L.camp(S, 'heal'); refreshHud(); showFork(); };
  o.querySelector('#cx').onclick = () => { if (guard()) return; sfx('click'); chooseSlot(`给哪个位置 +${CFG.campXp} 经验？`, s => { const b = L.lv(S, s); L.camp(S, s); sfx(L.lv(S, s) > b ? 'lvup' : 'pick'); refreshSlots(); showFork(); }, showCamp); };
}
function showOver() {
  const win = S.over === 'win';
  if (win) sfx('win');
  const act = SLOTS.map(s => S.slots[s].active).filter(Boolean).map(a => ST[a].n).join('、') || '无';
  const o = ov(`<div class="ov-title" style="margin-top:120px;font-size:30px">${win ? '通关！' : '倒下了'}</div>
    <div class="stats">走到第 ${S.room} / ${CFG.rooms} 关<br>打倒 ${S.stats.kills} 只怪 · 走了 ${S.stats.turns} 步<br>最后的贴纸：${act}</div>
    <div class="btnrow" style="margin-top:30px"><button class="btn" id="again">再来一局</button></div>`);
  arm();
  o.querySelector('#again').onclick = () => { if (guard()) return; sfx('click'); newGame(seed + 1); };
}
function showTitle() {
  const o = ov(`<div class="title-big">卡片走格</div><div class="ov-sub" style="margin-top:14px">你走一步，怪动一步<br>打死怪，拿它的贴纸</div><div class="btnrow" style="margin-top:60px"><button class="btn" id="go" style="min-width:180px;height:56px;font-size:20px">开始</button></div>`);
  arm();
  o.querySelector('#go').onclick = () => { if (guard()) return; unlock(); sfx('click'); newGame(seed); };
}

function newGame(sd) {
  seed = sd; closeOv(); anim = null; queued = null; hintShown = false; slotSel = null; mgSel = null;
  S = L.newRun(seed); S.log = null; window.__S = S;
  startRoomAnim();
}
window.__G = { get S() { return S; }, newGame, doAction, busy: () => !!anim, ov: () => !$('overlay').classList.contains('hidden') };
requestAnimationFrame(frame);
showTitle();
})();
