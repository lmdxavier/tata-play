/*
 * EnemyMonsters — LAYERLAB「2D Minimal - Enemy Monster 1」Canvas 播放器（无依赖）
 *
 * 数据由 convert.py 从 .unitypackage 转出：monsters.json + atlas/*.png
 * 还原方式与 Unity 一致：部件层级（位置/旋转/缩放）+ Hermite 关键帧曲线
 * + 显隐/透明度/换图轨道 + SortingOrder 排序 + Write Defaults。
 *
 * 用法：
 *   const lib = await EnemyMonsters.load('enemy_monster_1/monsters.json');
 *   // 或 file:// 直接打开时：EnemyMonsters.load(window.ENEMY_MONSTER_DATA, 'enemy_monster_1/')
 *   const cat = lib.create('Animal_Cat');
 *   cat.play('Walk');                                   // Idle / Walk 默认循环
 *   cat.play('Attack', { onEvent: () => dealDamage(),   // 攻击命中时刻（来自 Unity 动画事件）
 *                        onEnd:   () => cat.play('Idle') });
 *   // 每帧：
 *   cat.update(dt);                                     // dt 单位：秒
 *   cat.draw(ctx, x, y, { scale: 0.6, flipX: true });   // (x,y) = 脚底中心；原版朝左，flipX 朝右
 *
 * 尺寸：scale = 1 时 1 个 Unity 单位 = 100px（贴图原始分辨率），怪物大约 150~250px 高。
 */
(function (global) {
  'use strict';

  const LOOP_DEFAULT = { Idle: true, Walk: true };
  const DEG = Math.PI / 180;

  // Unity AnimationCurve（非加权 Hermite）求值
  function evalCurve(keys, t) {
    const n = keys.length;
    if (t <= keys[0][0] || n === 1) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (keys[mid][0] <= t) lo = mid; else hi = mid; }
    const k0 = keys[lo], k1 = keys[hi];
    const out = k0[3], inn = k1[2];
    if (out === null || inn === null) return k0[1];      // 无穷斜率 = 阶梯
    const dt = k1[0] - k0[0];
    const s = (t - k0[0]) / dt, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * k0[1] + (s3 - 2 * s2 + s) * out * dt
         + (-2 * s3 + 3 * s2) * k1[1] + (s3 - s2) * inn * dt;
  }
  function evalStep(keys, t) {
    let v = keys[0][1];
    for (let i = 1; i < keys.length && keys[i][0] <= t; i++) v = keys[i][1];
    return v;
  }

  class Library {
    constructor(data, base, images) {
      this.data = data; this.base = base; this.images = images;
      this.ppu = data.ppu || 100;
      this.names = Object.keys(data.monsters);
      this._bind = {};
    }
    category(name) { return this.data.monsters[name].category; }
    animations(name) { return Object.keys(this.data.categories[this.category(name)].anims); }
    // 把类别动画的轨道路径绑定到具体怪物的节点下标（缓存）
    _bound(name) {
      if (this._bind[name]) return this._bind[name];
      const m = this.data.monsters[name];
      const idx = {}; m.nodes.forEach((n, i) => { idx[n.path] = i; });
      const anims = {};
      const cat = this.data.categories[m.category].anims;
      for (const a in cat) {
        const c = cat[a];
        anims[a] = { len: c.len, events: c.events || [],
          tracks: c.tracks.filter(t => t.p in idx).map(t => ({ i: idx[t.p], k: t.k, c: t.c })) };
      }
      return (this._bind[name] = { m, anims, img: this.images[name] });
    }
    create(name) { return new Monster(this, name); }
  }

  class Monster {
    constructor(lib, name) {
      this.lib = lib; this.name = name;
      const b = lib._bound(name);
      this.def = b.m; this.anims = b.anims; this.img = b.img;
      const N = this.def.nodes.length;
      this.s = { px: new Float32Array(N), py: new Float32Array(N), rz: new Float32Array(N),
                 sx: new Float32Array(N), sy: new Float32Array(N), a: new Float32Array(N),
                 on: new Uint8Array(N), spr: new Array(N) };
      this.world = new Float64Array(N * 6);
      this.drawList = this.def.nodes.map((n, i) => i).filter(i => this.def.nodes[i].order !== undefined)
        .sort((p, q) => (this.def.nodes[p].order - this.def.nodes[q].order) || (p - q));
      this.speed = 1; this.time = 0; this.clip = null; this.state = null;
      this.play(this.anims.Idle ? 'Idle' : Object.keys(this.anims)[0]);
    }
    /** play(name, {loop, speed, onEvent, onEnd, restart}) */
    play(name, opt = {}) {
      const clip = this.anims[name];
      if (!clip) throw new Error(`${this.name} 没有动画 ${name}`);
      if (this.state === name && !opt.restart && this.loop) return this;
      this.state = name; this.clip = clip; this.time = 0; this.done = false;
      this.loop = opt.loop !== undefined ? opt.loop : !!LOOP_DEFAULT[name];
      this.speed = opt.speed !== undefined ? opt.speed : 1;
      this.onEvent = opt.onEvent || null; this.onEnd = opt.onEnd || null;
      this._pose();
      return this;
    }
    update(dt) {
      if (!this.clip || this.done) return this;
      const c = this.clip, prev = this.time;
      let t = prev + dt * this.speed;
      if (this.onEvent) for (const e of c.events) {
        if (c.len > 0 && this.loop) {
          const loops = Math.floor(t / c.len) - Math.floor(prev / c.len);
          const a = prev % c.len, b = t % c.len;
          if ((loops === 0 && e > a && e <= b) || (loops > 0 && (e > a || e <= b))) this.onEvent(e, this.state);
        } else if (e > prev && e <= t) this.onEvent(e, this.state);
      }
      if (t >= c.len && !this.loop) {
        t = c.len; this.done = true; this.time = t; this._pose();
        if (this.onEnd) { const f = this.onEnd; this.onEnd = null; f(this.state); }
        return this;
      }
      this.time = t; this._pose();
      return this;
    }
    // Write Defaults：先恢复预制体默认值，再叠加当前动画
    _pose() {
      const s = this.s, nodes = this.def.nodes, c = this.clip;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        s.px[i] = n.px; s.py[i] = n.py; s.rz[i] = n.rz; s.sx[i] = n.sx; s.sy[i] = n.sy;
        s.a[i] = n.a === undefined ? 1 : n.a; s.on[i] = n.on; s.spr[i] = n.spr;
      }
      if (!c) return;
      const t = this.loop && c.len > 0 ? this.time % c.len : this.time;
      for (const tr of c.tracks) {
        if (tr.k === 'on') s.on[tr.i] = evalStep(tr.c, t) > 0.5 ? 1 : 0;
        else if (tr.k === 'spr') s.spr[tr.i] = evalStep(tr.c, t);
        else if (s[tr.k]) s[tr.k][tr.i] = evalCurve(tr.c, t);
      }
    }
    _computeWorld() {
      const s = this.s, nodes = this.def.nodes, W = this.world;
      for (let i = 0; i < nodes.length; i++) {
        const r = s.rz[i] * DEG, cs = Math.cos(r), sn = Math.sin(r);
        const a = cs * s.sx[i], b = sn * s.sx[i], c = -sn * s.sy[i], d = cs * s.sy[i];
        const e = s.px[i], f = s.py[i], p = nodes[i].parent, o = i * 6;
        if (p < 0) { W[o] = a; W[o+1] = b; W[o+2] = c; W[o+3] = d; W[o+4] = e; W[o+5] = f; }
        else {
          const q = p * 6;
          W[o]   = W[q] * a + W[q+2] * b;   W[o+1] = W[q+1] * a + W[q+3] * b;
          W[o+2] = W[q] * c + W[q+2] * d;   W[o+3] = W[q+1] * c + W[q+3] * d;
          W[o+4] = W[q] * e + W[q+2] * f + W[q+4];
          W[o+5] = W[q+1] * e + W[q+3] * f + W[q+5];
        }
      }
    }
    _visible(i) {
      const nodes = this.def.nodes;
      for (let j = i; j >= 0; j = nodes[j].parent) if (!this.s.on[j]) return false;
      return true;
    }
    /** draw(ctx, x, y, {scale=1, flipX=false, alpha=1, shadow=true}) */
    draw(ctx, x, y, opt = {}) {
      const img = this.img; if (!img || !img.complete) return;
      this._computeWorld();
      const k = (opt.scale || 1) * this.lib.ppu, fx = opt.flipX ? -1 : 1;
      const alpha = opt.alpha === undefined ? 1 : opt.alpha;
      const frames = this.def.frames, nodes = this.def.nodes, W = this.world, ppu = this.lib.ppu;
      const prevA = ctx.globalAlpha;
      // 叠加在画布当前矩阵上（支持高分屏缩放、平移等外部变换）
      const base = ctx.getTransform();
      for (const i of this.drawList) {
        const id = this.s.spr[i]; if (!id || this.s.a[i] <= 0 || !this._visible(i)) continue;
        if (opt.shadow === false && nodes[i].name === 'Shadow') continue;
        if (opt.skipFx && nodes[i].path && nodes[i].path.indexOf('Attack_bone/')===0) continue;   // 挂在 Attack_bone 上的是攻击特效（熊爪印等），由游戏单独画、朝向目标；身体部件照常画
        const fr = frames[id]; if (!fr) continue;
        const o = i * 6;
        // 画布矩阵 = 平移(x,y) · 缩放(k·fx, -k) · 世界矩阵 · 缩放(1/ppu, -1/ppu)
        const A = W[o], B = W[o+1], C = W[o+2], D = W[o+3];
        const sfx = nodes[i].fx ? -1 : 1, sfy = nodes[i].fy ? -1 : 1;
        ctx.setTransform(base.multiply(new DOMMatrix([
          k * fx * A / ppu * sfx, -k * B / ppu * sfx,
          -k * fx * C / ppu * sfy, k * D / ppu * sfy,
          x + k * fx * W[o+4], y - k * W[o+5]])));
        ctx.globalAlpha = prevA * alpha * this.s.a[i];
        const [ax, ay, w, h, pvx, pvy] = fr;
        ctx.drawImage(img, ax, ay, w, h, -pvx * w, -(1 - pvy) * h, w, h);
      }
      ctx.globalAlpha = prevA;
      ctx.setTransform(base);
    }
    /** 采样当前动画（或全部动画）得到包围盒，单位：scale=1 时的像素，y 向下 */
    bounds(all = false) {
      const save = [this.state, this.time, this.clip, this.loop];
      const names = all ? Object.keys(this.anims) : [this.state];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const ppu = this.lib.ppu;
      for (const nm of names) {
        this.clip = this.anims[nm]; this.loop = false;
        for (let t = 0; t <= this.clip.len + 1e-6; t += 1 / 30) {
          this.time = t; this._pose(); this._computeWorld();
          for (const i of this.drawList) {
            const id = this.s.spr[i]; if (!id || this.s.a[i] <= 0 || !this._visible(i)) continue;
            const [, , w, h, pvx, pvy] = this.def.frames[id], o = i * 6, W = this.world;
            for (const [u, v] of [[-pvx * w, -pvy * h], [(1 - pvx) * w, -pvy * h], [-pvx * w, (1 - pvy) * h], [(1 - pvx) * w, (1 - pvy) * h]]) {
              const X = (W[o] * u + W[o+2] * v) + W[o+4] * ppu, Y = -((W[o+1] * u + W[o+3] * v) + W[o+5] * ppu);
              if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
            }
          }
        }
      }
      [this.state, this.time, this.clip, this.loop] = save; this._pose();
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
  }

  async function load(src, base) {
    let data = src;
    if (typeof src === 'string') {
      base = base !== undefined ? base : src.replace(/[^/]*$/, '');
      data = await (await fetch(src)).json();
    }
    base = base || '';
    const images = {};
    await Promise.all(Object.entries(data.monsters).map(([name, m]) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(); im.onerror = () => rej(new Error('图集加载失败: ' + m.atlas));
      im.src = base + m.atlas; images[name] = im;
    })));
    return new Library(data, base, images);
  }

  global.EnemyMonsters = { load, Library, Monster, evalCurve };
})(typeof window !== 'undefined' ? window : globalThis);
