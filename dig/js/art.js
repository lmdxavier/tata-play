/* dig hero 素材加载（地面以上的天空远山、特效、图标）；地形见 terrain.js */
(function () {
  'use strict';
  const A = window.ART = { img: {}, ready: false, T: 0 };
  const IMGS = {
    sky: 'bg/map02_06.png', hill1: 'bg/map01_11.png', hill2: 'bg/map01_09.png', bush: 'bg/map01_07.png', market: 'props/Market_01.png',
    puff: 'vfx/puff.png', coinburst: 'vfx/coin_burst_gold.png', ring: 'vfx/ring_shockwave_white.png', star: 'vfx/star_burst_gold.png', smoke: 'vfx/smoke.png',
    coin: 'ui/i_coin.png', gem: 'ui/i_gem_1_purple.png', lock: 'ui/icon_color_lock_m.png', glow: 'ui/glow_white.png',
  };
  A.VFX = { puff: [18, 160, 135, 30], coinburst: [30, 128, 128, 30], ring: [16, 128, 128, 30], star: [24, 128, 128, 30], smoke: [10, 160, 154, 20] };
  A.load = function () {
    return Promise.all(Object.keys(IMGS).map(k => new Promise(res => { const im = new Image(); im.onload = im.onerror = res; im.src = 'assets/' + IMGS[k]; A.img[k] = im; })));
  };
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  /* 取贴图平均色（用于描边、背墙） */
  function avg(im) { try { return avg0(im); } catch (e) { return [120, 90, 70]; } }
  function avg0(im) { const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 8, 8); const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } return [r / 64, gg / 64, b / 64]; }
  /* v0.2：方块图集（代码画的方块、铆钉、裂缝）去掉，地形改由 terrain.js 用素材画 */
  A.bake = function (T) { A.T = Math.round(T); A.ready = true; };
})();
