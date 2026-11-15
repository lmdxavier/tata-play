/*
 * Hero — LayerLab「2D Minimal - Character Maker」Canvas 播放器（无依赖）
 * 数据由 tools/convert_hero.py 从 .unitypackage 转出：hero_data.js + parts/*.png
 * 还原方式与 Unity 一致：部件层级 + Hermite 关键帧曲线 + 显隐/透明度/换图轨道 + SortingOrder + Write Defaults；
 * 换装照 PartsManager：每类部件对应节点和图片列表，皮肤 / 头发 / 胡子按颜色正片叠底。
 *
 *   const h = Hero.create(HERO_DATA, 'assets/hero/', { Helmet: 17, Chest: 7, Hair: 8, Eye: 1, Pickaxe: 0 }, { Hair: [.45,.3,.2] });
 *   await h.ready();
 *   h.play('Run'); h.update(dt); h.draw(ctx, x, y, { scale: 0.8, flipX: false });   // (x,y) = 脚底中心，原版朝右
 */
(function (global) {
  'use strict';
  const DEG = Math.PI / 180;
  const LOOP = { Idle: 1, Walk: 1, Run: 1, Dance: 1, Stun: 1, Fishing_Idle: 1, Fishing_Real: 1 };
  const HAND_R = ['Sword', 'Axe', 'Bow', 'Wand', 'Staff', 'Spear', 'Blunt', 'Crossbow', 'Gun', 'Fishing', 'Pickaxe'];
  const HAND_L = ['Shield', 'SubItem'];

  function evalCurve(keys, t) {
    const n = keys.length;
    if (t <= keys[0][0] || n === 1) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (keys[mid][0] <= t) lo = mid; else hi = mid; }
    const k0 = keys[lo], k1 = keys[hi], out = k0[3], inn = k1[2];
    if (out === null || inn === null) return k0[1];
    const dt = k1[0] - k0[0], s = (t - k0[0]) / dt, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * k0[1] + (s3 - 2 * s2 + s) * out * dt + (-2 * s3 + 3 * s2) * k1[1] + (s3 - s2) * inn * dt;
  }
  function evalStep(keys, t) { let v = keys[0][1]; for (let i = 1; i < keys.length && keys[i][0] <= t; i++) v = keys[i][1]; return v; }

  const IMG = {};   // base -> id -> Image
  function image(base, id) {
    const b = IMG[base] || (IMG[base] = {});
    if (!b[id]) { const im = new Image(); im._p = new Promise(r => { im.onload = im.onerror = r; }); im.src = base + 'parts/' + id + '.png'; b[id] = im; }
    return b[id];
  }
  function tinted(im, rgb) {   // Unity SpriteRenderer.color：RGB 相乘，透明度不变
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${rgb.map(v => Math.round(v * 255)).join(',')})`; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(im, 0, 0);
    return c;
  }

  class Hero {
    constructor(data, base, equip, colors) {
      this.D = data; this.base = base || '';
      const nodes = data.nodes; this.N = nodes.length;
      this.idx = {}; nodes.forEach((n, i) => { if (this.idx[n.name] === undefined || (n.order !== undefined && nodes[this.idx[n.name]].order === undefined)) this.idx[n.name] = i; });   // 同名节点（Bow/Bow）取带图片的那个
      this.pidx = {}; nodes.forEach((n, i) => { if (n.path !== null) this.pidx[n.path] = i; });
      this.anims = {};
      for (const a in data.anims) {
        const c = data.anims[a];
        this.anims[a] = { len: c.len, events: c.events || [], tracks: c.tracks.filter(t => t.p in this.pidx).map(t => ({ i: this.pidx[t.p], k: t.k, c: t.c })) };
      }
      this.def = { spr: new Array(this.N), on: new Uint8Array(this.N), tint: new Array(this.N) };
      const s = this.s = { px: new Float32Array(this.N), py: new Float32Array(this.N), rz: new Float32Array(this.N), sx: new Float32Array(this.N), sy: new Float32Array(this.N), a: new Float32Array(this.N), on: new Uint8Array(this.N), spr: new Array(this.N) };
      this.world = new Float64Array(this.N * 6);
      this.drawList = nodes.map((n, i) => i).filter(i => nodes[i].order !== undefined).sort((p, q) => (nodes[p].order - nodes[q].order) || (p - q));
      this.tintCache = new Map();
      this.speed = 1; this.time = 0;
      this.aim = 0; this.aimIdx = this.idx.HandRight; this.aimPivot = [0.06, 0.3];   // 瞄准：整只右手（连武器）绕肩膀转多少度（逆时针为正 = 朝上）
      this.setLook(equip || {}, colors || {});
      this.play('Idle');
    }
    /** 换装：equip = {部位: 序号}（缺省 = 不穿）；colors = {Skin/Hair/Beard: [r,g,b] 0~1} */
    setLook(equip, colors) {
      const D = this.D, nodes = D.nodes;
      this.equip = Object.assign({}, equip); this.colors = Object.assign({}, colors);
      for (let i = 0; i < this.N; i++) { this.def.spr[i] = nodes[i].spr; this.def.on[i] = nodes[i].on; this.def.tint[i] = null; }
      const hasHelmet = equip.Helmet !== undefined && equip.Helmet >= 0;
      for (const T in D.parts) {
        const P = D.parts[T];
        if (T === 'Skin') continue;
        let k = equip[T];
        if (T === 'HelmetHair') k = hasHelmet ? equip.Hair : undefined;          // 戴头盔时头发换成压扁的那套
        if (T === 'Hair' && hasHelmet) k = undefined;
        if (T === 'Arrow') k = (equip.Bow !== undefined || equip.Crossbow !== undefined) ? (equip.Arrow || 0) : undefined;
        for (const r of P.r) {
          const i = this.idx[r.node]; if (i === undefined) continue;
          if (k === undefined || k < 0) { if (P.toggle) this.def.spr[i] = undefined; continue; }
          this.def.spr[i] = r.spr[Math.min(k, r.spr.length - 1)] || r.spr[0];
        }
      }
      for (const C in D.colorNodes) {
        const rgb = colors[C]; if (!rgb) continue;
        for (const nm of D.colorNodes[C]) if (this.idx[nm] !== undefined) this.def.tint[this.idx[nm]] = rgb;
      }
      if (this.clip) this._pose();
    }
    ready() {
      const ids = new Set(this.def.spr.filter(Boolean));
      for (const a in this.anims) for (const t of this.anims[a].tracks) if (t.k === 'spr') for (const k of t.c) ids.add(k[1]);
      return Promise.all([...ids].map(id => image(this.base, id)._p));
    }
    has(name) { return !!this.anims[name]; }
    play(name, opt = {}) {
      const clip = this.anims[name]; if (!clip) return this;
      if (this.state === name && !opt.restart && !this.done) return this;
      this.state = name; this.clip = clip; this.time = opt.at || 0; this.done = false;
      this.loop = opt.loop !== undefined ? opt.loop : !!LOOP[name];
      this.speed = opt.speed !== undefined ? opt.speed : 1;
      this.onEvent = opt.onEvent || null; this.onEnd = opt.onEnd || null;
      this.range = opt.range || null;                 // [a, b]：只在这一段里循环（如挖地只循环挥镐那一段）
      if (this.range) this.time = this.range[0];
      this._pose(); return this;
    }
    update(dt) {
      if (!this.clip || this.done) return this;
      const c = this.clip, prev = this.time; let t = prev + dt * this.speed;
      if (this.range) {
        const [a, b] = this.range;
        if (this.onEvent) for (const [e, fn] of c.events) if (e >= a && e < b && ((t < b && e > prev && e <= t) || (t >= b && (e > prev || e <= a + (t - b) % (b - a))))) this.onEvent(fn, this.state);
        if (t >= b) t = a + (t - b) % (b - a);
        this.time = t; this._pose(); return this;
      }
      if (this.onEvent) for (const [e, fn] of c.events) {
        if (this.loop && c.len > 0) {
          const loops = Math.floor(t / c.len) - Math.floor(prev / c.len), a = prev % c.len, b = t % c.len;
          if ((loops === 0 && e > a && e <= b) || (loops > 0 && (e > a || e <= b))) this.onEvent(fn, this.state);
        } else if (e > prev && e <= t) this.onEvent(fn, this.state);
      }
      if (t >= c.len && !this.loop) { this.time = c.len; this.done = true; this._pose(); if (this.onEnd) { const f = this.onEnd; this.onEnd = null; f(this.state); } return this; }
      this.time = t; this._pose(); return this;
    }
    _pose() {
      const s = this.s, nodes = this.D.nodes, c = this.clip;
      // （range 播放时 time 本身就在片段里，下面按非循环取值）
      for (let i = 0; i < this.N; i++) {
        const n = nodes[i];
        s.px[i] = n.px; s.py[i] = n.py; s.rz[i] = n.rz; s.sx[i] = n.sx; s.sy[i] = n.sy;
        s.a[i] = n.a === undefined ? 1 : n.a; s.on[i] = this.def.on[i]; s.spr[i] = this.def.spr[i];
      }
      if (!c) return;
      const t = this.loop && c.len > 0 && !this.range ? this.time % c.len : this.time;
      for (const tr of c.tracks) {
        if (tr.k === 'on') s.on[tr.i] = evalStep(tr.c, t) > 0.5 ? 1 : 0;
        else if (tr.k === 'spr') s.spr[tr.i] = evalStep(tr.c, t);
        else if (s[tr.k]) s[tr.k][tr.i] = evalCurve(tr.c, t);
      }
    }
    _computeWorld() {
      const s = this.s, nodes = this.D.nodes, W = this.world;
      for (let i = 0; i < this.N; i++) {
        const r = s.rz[i] * DEG, cs = Math.cos(r), sn = Math.sin(r);
        const a = cs * s.sx[i], b = sn * s.sx[i], c = -sn * s.sy[i], d = cs * s.sy[i], e = s.px[i], f = s.py[i], p = nodes[i].parent, o = i * 6;
        if (p < 0) { W[o] = a; W[o + 1] = b; W[o + 2] = c; W[o + 3] = d; W[o + 4] = e; W[o + 5] = f; }
        else {
          const q = p * 6;
          W[o] = W[q] * a + W[q + 2] * b; W[o + 1] = W[q + 1] * a + W[q + 3] * b;
          W[o + 2] = W[q] * c + W[q + 2] * d; W[o + 3] = W[q + 1] * c + W[q + 3] * d;
          W[o + 4] = W[q] * e + W[q + 2] * f + W[q + 4]; W[o + 5] = W[q + 1] * e + W[q + 3] * f + W[q + 5];
        }
        if (i === this.aimIdx && this.aim) {   // 绕肩膀旋转：W = T(P)·R·T(-P)·W
          const ar = this.aim * DEG, c2 = Math.cos(ar), s2 = Math.sin(ar), [ppx, ppy] = this.aimPivot;
          const a0 = W[o], b0 = W[o + 1], c0 = W[o + 2], d0 = W[o + 3], e0 = W[o + 4] - ppx, f0 = W[o + 5] - ppy;
          W[o] = c2 * a0 - s2 * b0; W[o + 1] = s2 * a0 + c2 * b0; W[o + 2] = c2 * c0 - s2 * d0; W[o + 3] = s2 * c0 + c2 * d0;
          W[o + 4] = c2 * e0 - s2 * f0 + ppx; W[o + 5] = s2 * e0 + c2 * f0 + ppy;
        }
      }
    }
    _visible(i) { const nodes = this.D.nodes; for (let j = i; j >= 0; j = nodes[j].parent) if (!this.s.on[j]) return false; return true; }
    _src(i, id) {
      const im = image(this.base, id); if (!im.complete || !im.naturalWidth) return null;
      const rgb = this.def.tint[i]; if (!rgb) return im;
      const key = id + '|' + rgb.join(',');
      let c = this.tintCache.get(key); if (!c) { c = tinted(im, rgb); this.tintCache.set(key, c); }
      return c;
    }
    /** 某个节点（如 'Tool_Pick'）的世界位置，单位同 draw 的像素 */
    nodePos(name, x, y, opt = {}) {
      this._computeWorld(); const i = this.idx[name], o = i * 6, k = (opt.scale || 1) * this.D.ppu, fx = opt.flipX ? -1 : 1;
      return { x: x + k * fx * this.world[o + 4], y: y - k * this.world[o + 5] };
    }
    draw(ctx, x, y, opt = {}) {
      this._computeWorld();
      const ppu = this.D.ppu, k = (opt.scale || 1) * ppu, fx = opt.flipX ? -1 : 1, alpha = opt.alpha === undefined ? 1 : opt.alpha;
      const frames = this.D.frames, nodes = this.D.nodes, W = this.world, prevA = ctx.globalAlpha, base = ctx.getTransform();
      for (const i of this.drawList) {
        const id = this.s.spr[i]; if (!id || this.s.a[i] <= 0 || !this._visible(i)) continue;
        if (opt.shadow === false && nodes[i].name === 'Shadow') continue;
        const fr = frames[id]; if (!fr) continue;
        const src = this._src(i, id); if (!src) continue;
        const o = i * 6, A = W[o], B = W[o + 1], C = W[o + 2], Dd = W[o + 3];
        const sfx = nodes[i].fx ? -1 : 1, sfy = nodes[i].fy ? -1 : 1;
        ctx.setTransform(base.multiply(new DOMMatrix([k * fx * A / ppu * sfx, -k * B / ppu * sfx, -k * fx * C / ppu * sfy, k * Dd / ppu * sfy, x + k * fx * W[o + 4], y - k * W[o + 5]])));
        ctx.globalAlpha = prevA * alpha * this.s.a[i];
        const [w, h, pvx, pvy] = fr;
        ctx.drawImage(src, -pvx * w, -(1 - pvy) * h, w, h);
      }
      ctx.globalAlpha = prevA; ctx.setTransform(base);
    }
  }
  global.Hero = { create: (data, base, equip, colors) => new Hero(data, base, equip, colors), Hero, HAND_R, HAND_L };
})(typeof window !== 'undefined' ? window : globalThis);
