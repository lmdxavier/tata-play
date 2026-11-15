/* dig hero 素材加载与方块烘焙：贴图来自 assets/terrain（LayerLab Simple Sidescroll），裂缝和方块描边在这里烘成图集 */
(function () {
  'use strict';
  const A = window.ART = { img: {}, ready: false, T: 0 };
  const IMGS = {
    dirt: 'terrain/dirt.png', sand: 'terrain/sand.png', deep: 'terrain/deep.png', bed: 'terrain/bed.png', rock: 'terrain/rock.png',
    hard2: 'terrain/hard2.png', hard: 'terrain/hard.png', grass: 'terrain/e_grass.png',
    sky: 'bg/map02_06.png', hill1: 'bg/map01_11.png', hill2: 'bg/map01_09.png', bush: 'bg/map01_07.png', market: 'props/Market_01.png',
    puff: 'vfx/puff.png', coinburst: 'vfx/coin_burst_gold.png', ring: 'vfx/ring_shockwave_white.png', star: 'vfx/star_burst_gold.png', smoke: 'vfx/smoke.png',
    coin: 'ui/i_coin.png', gem: 'ui/i_gem_1_purple.png', lock: 'ui/icon_color_lock_m.png', glow: 'ui/glow_white.png',
  };
  A.VFX = { puff: [18, 160, 135, 30], coinburst: [30, 128, 128, 30], ring: [16, 128, 128, 30], star: [24, 128, 128, 30], smoke: [10, 160, 154, 20] };
  /* 每个阶段的材质：[贴图, 色相旋转, 亮度, 取样缩放] —— 10 个阶段外观都不同 */
  A.MATS = [
    ['dirt', 0, 1, 0.34], ['sand', 0, 1, 0.34], ['deep', 0, 1, 0.5], ['bed', 0, 1, 0.34], ['rock', 0, 1, 0.34],
    ['hard2', 0, 1.05, 0.34], ['deep', 150, 0.9, 0.5], ['rock', 70, 0.9, 0.34], ['dirt', 190, 0.85, 0.34], ['bed', 250, 0.8, 0.34],
  ];
  A.load = function () {
    return Promise.all(Object.keys(IMGS).map(k => new Promise(res => { const im = new Image(); im.onload = im.onerror = res; im.src = 'assets/' + IMGS[k]; A.img[k] = im; })));
  };
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  /* 取贴图平均色（用于描边、背墙） */
  function avg(im) { try { return avg0(im); } catch (e) { return [120, 90, 70]; } }
  function avg0(im) { const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 8, 8); const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } return [r / 64, gg / 64, b / 64]; }
  const VAR = 4;
  /* 图集布局：每种材质一行：VAR 个方块 + 1 个背墙；最后几行：叉、门、裂缝、阴影 */
  A.bake = function (T) {
    T = Math.max(24, Math.round(T)); A.T = T;
    const rows = A.MATS.length + 3, cols = 9;
    const cv = A.atlas || (A.atlas = document.createElement('canvas')); cv.width = cols * T; cv.height = rows * T;
    const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = T; const tg = tmp.getContext('2d');
    const block = (im, hue, bri, k, seed, ox, oy, o) => {
      const R = rng(seed), sw = T / k, sx = R() * Math.max(1, im.width - sw), sy = R() * Math.max(1, im.height - sw);
      tg.clearRect(0, 0, T, T); tg.save();
      const pad = Math.max(1, Math.round(T * 0.025)), rad = T * (o.rad || 0.16);
      rr(tg, pad, pad, T - pad * 2, T - pad * 2, rad); tg.clip();
      tg.filter = `hue-rotate(${hue}deg) brightness(${bri * (o.bri || 1)}) saturate(${o.sat || 1})`;
      tg.drawImage(im, sx, sy, sw, sw, 0, 0, T, T); tg.filter = 'none';
      // 下、右暗面
      let gr = tg.createLinearGradient(0, T * 0.62, 0, T); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(20,8,30,0.38)'); tg.fillStyle = gr; tg.fillRect(0, 0, T, T);
      gr = tg.createLinearGradient(T * 0.8, 0, T, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(20,8,30,0.2)'); tg.fillStyle = gr; tg.fillRect(0, 0, T, T);
      // 上、左亮面
      gr = tg.createLinearGradient(0, 0, 0, T * 0.3); gr.addColorStop(0, 'rgba(255,250,225,0.34)'); gr.addColorStop(1, 'rgba(255,250,225,0)'); tg.fillStyle = gr; tg.fillRect(0, 0, T, T);
      tg.restore();
      // 高光线 + 深色描边
      tg.lineWidth = Math.max(1.5, T * 0.035); tg.strokeStyle = 'rgba(255,255,240,0.45)'; tg.lineCap = 'round';
      tg.beginPath(); tg.moveTo(pad + rad, pad + tg.lineWidth * 1.4); tg.lineTo(T - pad - rad * 1.6, pad + tg.lineWidth * 1.4); tg.stroke();
      rr(tg, pad + 0.75, pad + 0.75, T - pad * 2 - 1.5, T - pad * 2 - 1.5, rad); tg.lineWidth = Math.max(1.5, T * 0.04); tg.strokeStyle = o.line; tg.stroke();
      if (o.studs) {   // 叉：四角铆钉，一眼看出更硬
        for (const [px, py] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
          tg.fillStyle = 'rgba(30,34,52,0.7)'; tg.beginPath(); tg.arc(px * T, py * T + T * 0.012, T * 0.062, 0, 7); tg.fill();
          tg.fillStyle = o.stud; tg.beginPath(); tg.arc(px * T, py * T, T * 0.052, 0, 7); tg.fill();
          tg.fillStyle = 'rgba(255,255,255,0.6)'; tg.beginPath(); tg.arc(px * T - T * 0.015, py * T - T * 0.018, T * 0.02, 0, 7); tg.fill();
        }
      }
      g.drawImage(tmp, ox * T, oy * T);
    };
    A.backCol = [];
    A.MATS.forEach((m, s) => {
      const im = A.img[m[0]], c = avg(im);
      const line = `rgb(${c.map(v => Math.round(v * 0.38)).join(',')})`;
      for (let v = 0; v < VAR; v++) block(im, m[1], m[2], m[3], s * 97 + v * 13 + 5, v, s, { line });
      // 背墙：同材质压暗、去饱和，不描边，整格铺满
      const R = rng(s * 31 + 7), sw = T / m[3]; g.save(); g.filter = `hue-rotate(${m[1]}deg) brightness(${m[2] * 0.36}) saturate(0.7)`;
      g.drawImage(im, R() * (im.width - sw), R() * (im.height - sw), sw, sw, VAR * T, s * T, T, T); g.restore();
      
    });
    const y0 = A.MATS.length;
    for (let v = 0; v < VAR; v++) block(A.img.hard, 0, 0.92, 0.42, 900 + v * 7, v, y0, { line: '#232a3f', studs: 1, stud: '#aeb9cc', rad: 0.1, sat: 1.1 });                 // 叉
    for (let v = 0; v < 2; v++) block(A.img.hard2, 250, 0.55, 0.34, 950 + v * 7, VAR + v, y0, { line: '#150c24', studs: 1, stud: '#d9a53a', rad: 0.08 });                       // 守卫门（打不动）
    // 裂缝 3 档 × 3 种：深色主缝 + 更细的黑芯 + 一侧亮边，叠在方块上
    const crack = (stage, v, ox, oy) => {
      const R = rng(stage * 50 + v * 17 + 3); tg.clearRect(0, 0, T, T); tg.lineCap = 'round'; tg.lineJoin = 'round';
      const paths = []; const n = [2, 4, 6][stage];
      const cx = T * (0.42 + R() * 0.16), cy = T * (0.42 + R() * 0.16);
      for (let i = 0; i < n; i++) {
        let a = (i / n) * Math.PI * 2 + R() * 0.9, x = cx, y = cy; const pts = [[x, y]]; const len = T * [0.26, 0.36, 0.46][stage] * (0.7 + R() * 0.5), seg = 3 + stage;
        for (let k = 0; k < seg; k++) { a += (R() - 0.5) * 1.1; x += Math.cos(a) * len / seg; y += Math.sin(a) * len / seg; pts.push([Math.min(T * 0.92, Math.max(T * 0.08, x)), Math.min(T * 0.92, Math.max(T * 0.08, y))]);
          if (stage > 0 && k === 1 && R() < 0.6) { const b = a + (R() < 0.5 ? 1 : -1) * (0.7 + R() * 0.5); paths.push([[x, y], [x + Math.cos(b) * len * 0.3, y + Math.sin(b) * len * 0.3]]); } }
        paths.push(pts);
      }
      const stroke = (w, col, dx, dy) => { tg.lineWidth = w; tg.strokeStyle = col; for (const p of paths) { tg.beginPath(); p.forEach((q, i) => i ? tg.lineTo(q[0] + dx, q[1] + dy) : tg.moveTo(q[0] + dx, q[1] + dy)); tg.stroke(); } };
      const w = Math.max(1.5, T * 0.03);
      stroke(w * (1.5 + stage * 0.5), 'rgba(255,248,225,0.3)', w * 0.5, w * 0.7);
      stroke(w * (1.6 + stage * 0.5), 'rgba(38,18,36,0.78)', 0, 0);
      stroke(w * 0.7, 'rgba(8,2,12,0.9)', 0, 0);
      if (stage === 2) { tg.fillStyle = 'rgba(8,2,12,0.85)'; tg.beginPath(); tg.arc(cx, cy, w * 2.2, 0, 7); tg.fill(); }
      g.drawImage(tmp, ox * T, oy * T);
    };
    for (let st = 0; st < 3; st++) for (let v = 0; v < 3; v++) crack(st, v, st * 3 + v, y0 + 1);
    // 洞壁阴影：上 / 左 / 右 / 下 四条（挨着实心格的那一侧画）
    const sh = (i, x0, y0g, x1, y1) => { const gr = g.createLinearGradient(i * T + x0 * T, (y0 + 2) * T + y0g * T, i * T + x1 * T, (y0 + 2) * T + y1 * T); gr.addColorStop(0, 'rgba(6,2,14,0.6)'); gr.addColorStop(1, 'rgba(6,2,14,0)'); g.fillStyle = gr; g.fillRect(i * T, (y0 + 2) * T, T, T); };
    sh(0, 0, 0, 0, 0.42); sh(1, 0, 0, 0.3, 0); sh(2, 1, 0, 0.7, 0); sh(3, 0, 1, 0, 0.78);
    A.rowSpur = y0; A.rowCrack = y0 + 1; A.rowShade = y0 + 2; A.VARN = VAR; A.ready = true; A.ver = (A.ver || 0) + 1;
  };
})();
