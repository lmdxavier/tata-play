/* dig hero 地面小镇（侧视平台）：素材 = craftpix RPG Platformer Kit 的 VILLAGE 图块（assets/town）。
 * 布局单位：格（T 像素）。x 0..7 是屏幕宽；y = 0 是地面（地下第 0 行的顶），往上是负数。
 * 只管画面和布局；主角走路、爬梯、点建筑的逻辑在 game.js。 */
(function () {
  'use strict';
  const TW = window.TOWN = { img: {}, ready: false };
  const N = ['Background_01', 'Background_02', 'Wall_C_02', 'Wall_A_02', 'Roof_A_04', 'Roof_A_05', 'Roof_B_04', 'Roof_B_05', 'Roof_A_02', 'Roof_B_02',
    'Wide_Door_02', 'Door_04', 'Chimney_04', 'Stone_Window_02', 'Window_04', 'Decor_Window_04', 'Pillar_01', 'Pillar_02', 'Pillar_03', 'Pillar_04',
    'Banner_01', 'Banner_02', 'Bench', 'Fence_02', 'Fence_03', 'Grass_01', 'Grass_02', 'Grass_03', 'Plant_01', 'Plant_02', 'Plant_03', 'Quest_Board',
    'Rock_01', 'Rock_03', 'Sack_01', 'Sign_01', 'Sign_02', 'Stump', 'Tree_01', 'Tree_02', 'Wooden_Barrel', 'Wooden_Crate', 'Wheat', 'Sunflower', 'Canopy_02'];
  const EXTRA = { anvil: 'sk/Item_Anvil_01_Light.png', book: 'sk/Item_Book_02_Purple.png', pick: 'sk/Gear_Weapons_Pickaxe_01.png', smoke: 'vfx/smoke.png' };
  // 布局（格）
  const L = TW.L = {
    plat: { x0: 4.35, x1: 6.98, y: -4.1 },           // 技能屋平台（木板面）
    ladder: { x: 4.72, w: 0.62, y0: 0, y1: -4.1 },   // 梯子中心 x
    hole: { x0: 3, x1: 4 },                          // 矿洞（第 4 列）
    smithy: { x0: 0.12, x1: 2.72, door: 1.08, y: 0 },
    house: { x0: 4.9, x1: 6.78, door: 5.48, y: -4.1 },
  };
  TW.load = () => Promise.all([...N.map(n => ['t_' + n, 'town/' + n + '.png']), ...Object.entries(EXTRA)].map(([k, src]) => new Promise(res => { const im = new Image(); im.onload = im.onerror = res; im.src = 'assets/' + src; TW.img[k] = im; }))).then(() => { TW.ready = true; });
  const I = n => TW.img['t_' + n];
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  function dr(g, im, x, y, w, h, flip) { if (!im || !im.width) return; if (!h) h = w * im.height / im.width; if (flip) { g.save(); g.translate(x + w, y); g.scale(-1, 1); g.drawImage(im, 0, 0, w, h); g.restore(); } else g.drawImage(im, x, y, w, h); }
  function label(g, text, x, y, fs) { g.font = `700 ${fs}px UINum, "PingFang SC", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = fs * 0.28; g.strokeStyle = '#3a2412'; g.strokeText(text, x, y); g.fillStyle = '#fff2c8'; g.fillText(text, x, y); }

  /* ---------- 烘焙：远景层 + 建筑层（按当前格宽 T 画一次） ---------- */
  let B = null, bakedT = 0;
  TW.bake = function (T, VW) {
    if (!TW.ready || (bakedT === T && B && B.vw === VW)) return; bakedT = T;
    const s = T / 128;                         // 素材 128 像素 = 1 格
    const H = 15 * T, W = 7 * T;               // 地面以上 15 格
    const bk = mk(VW, H), g = bk.getContext('2d'), gx = (VW - W) / 2;
    // 天空 + 远山（Background_01）+ 林带（Background_02）
    const b1 = I('Background_01'), b2 = I('Background_02');
    const bw = Math.max(VW, H * 0.62 * b1.width / b1.height), bh = bw * b1.height / b1.width;
    const top = H - bh + T * 0.2, sky = g.createLinearGradient(0, 0, 0, top + 2); sky.addColorStop(0, '#4fb4e4'); sky.addColorStop(0.55, '#86d8ee'); sky.addColorStop(1, 'rgb(160,247,247)');
    g.fillStyle = sky; g.fillRect(0, 0, VW, H);
    dr(g, b1, (VW - bw) / 2, H - bh + T * 0.2, bw, bh);
    dr(g, b2, (VW - bw) / 2, H - bh * 0.62 + T * 0.25, bw, bh * 0.62);
    // 后排树
    g.save(); g.globalAlpha = 0.95;
    dr(g, I('Tree_02'), gx - T * 1.2, H - T * 4.6, T * 4.6);
    dr(g, I('Tree_01'), gx + T * 3.9, H - T * 6.4, T * 3.6);
    g.restore();
    const y0 = H;   // 地面线在烘焙画布里的 y
    const X = v => gx + v * T, Y = v => y0 + v * T;

    // ---- 铁匠铺 ----
    { const L0 = L.smithy, x0 = X(L0.x0), w = (L0.x1 - L0.x0) * T, wh = T * 2.35;
      dr(g, I('Chimney_04'), x0 + w * 0.66, Y(0) - wh - T * 1.35, T * 0.62, T * 0.62 * 1.55);
      dr(g, I('Wall_C_02'), x0, Y(0) - wh, w, wh);
      dr(g, I('Roof_A_02'), x0 - T * 0.08, Y(0) - wh - T * 0.36, w + T * 0.16, T * 0.62);
      const gh = T * 1.05; dr(g, I('Roof_A_05'), x0 - T * 0.22, Y(0) - wh - T * 0.3 - gh, w / 2 + T * 0.24, gh); dr(g, I('Roof_A_04'), x0 + w / 2 - T * 0.02, Y(0) - wh - T * 0.3 - gh, w / 2 + T * 0.24, gh);
      dr(g, I('Decor_Window_04'), x0 + w / 2 - T * 0.28, Y(0) - wh - T * 0.92, T * 0.56, T * 0.56);
      dr(g, I('Stone_Window_02'), x0 + w * 0.68, Y(0) - T * 1.55, T * 0.66, T * 0.66);
      // 招牌：木牌 + 铁砧
      dr(g, I('Sign_01'), x0 + w * 0.55, Y(0) - wh + T * 0.02, T * 1.05, T * 1.05);
      dr(g, TW.img.anvil, x0 + w * 0.55 + T * 0.3, Y(0) - wh + T * 0.33, T * 0.46, T * 0.46);
    }
    // ---- 平台、梯子 ----
    { const P = L.plat, px0 = X(P.x0), px1 = X(P.x1), py = Y(P.y);
      for (const xx of [P.x0 + 0.25, P.x1 - 0.55]) dr(g, I('Pillar_02'), X(xx), py, T * 0.24, -P.y * T);
      dr(g, I('Pillar_04'), X(P.x0 + 0.3), py + T * 0.25, T * 1.0, T * 1.0); dr(g, I('Pillar_03'), X(P.x1 - 1.45), py + T * 0.25, T * 1.0, T * 1.0);
      for (let x = px0; x < px1; x += T * 1.25) dr(g, I('Pillar_01'), x, py - T * 0.06, T * 1.3, T * 0.26);
    }
    // ---- 技能屋 ----
    { const L1 = L.house, x0 = X(L1.x0), w = (L1.x1 - L1.x0) * T, wh = T * 1.95, by = Y(L1.y) - T * 0.04;
      dr(g, I('Wall_A_02'), x0, by - wh, w, wh);
      dr(g, I('Roof_B_02'), x0 - T * 0.08, by - wh - T * 0.34, w + T * 0.16, T * 0.58);
      const gh = T * 0.95; dr(g, I('Roof_B_05'), x0 - T * 0.24, by - wh - T * 0.28 - gh, w / 2 + T * 0.26, gh); dr(g, I('Roof_B_04'), x0 + w / 2 - T * 0.02, by - wh - T * 0.28 - gh, w / 2 + T * 0.26, gh);
      dr(g, I('Window_04'), x0 + w * 0.6, by - T * 1.45, T * 0.62, T * 0.62);
      dr(g, I('Banner_02'), x0 + w * 0.06, by - wh + T * 0.12, T * 0.5, T * 0.5);
      dr(g, TW.img.book, x0 + w * 0.6 + T * 0.07, by - wh - T * 0.58, T * 0.48, T * 0.48);
    }
    // ---- 告示板、木桶等（不可点的装饰） ----
    dr(g, I('Quest_Board'), X(5.35), Y(0) - T * 1.3, T * 1.3, T * 1.3);
    dr(g, I('Wheat'), X(6.25), Y(0) - T * 0.95, T * 0.95, T * 0.95);
    dr(g, I('Wooden_Barrel'), X(6.5), Y(0) - T * 0.5, T * 0.42, T * 0.5);
    dr(g, I('Sack_01'), X(6.3), Y(P_Y()) - T * 0.5, T * 0.45, T * 0.45);
    function P_Y() { return L.plat.y; }
    B = { cv: bk, H, vw: VW };
    // 前景（画在角色前面）：梯子、矿洞木架、木牌、草
    const fr = mk(VW, H + T * 0.6), f = fr.getContext('2d'), fy0 = H;
    const FX = v => gx + v * T, FY = v => fy0 + v * T;
    { const Ld = L.ladder, lx = FX(Ld.x - Ld.w / 2), ly1 = FY(Ld.y1 - 0.25), lh = FY(Ld.y0) - ly1, rw = T * 0.13;
      dr(f, I('Pillar_02'), lx, ly1, rw, lh); dr(f, I('Pillar_02'), lx + Ld.w * T - rw, ly1, rw, lh);
      for (let y = ly1 + T * 0.3; y < FY(0) - T * 0.1; y += T * 0.42) dr(f, I('Pillar_01'), lx + rw * 0.4, y, Ld.w * T - rw * 0.8, T * 0.12);
    }
    { const hx0 = FX(L.hole.x0), hx1 = FX(L.hole.x1), top = FY(0) - T * 1.55;
      dr(f, I('Pillar_04'), hx0 - T * 0.22, top, T * 0.95, T * 1.55); dr(f, I('Pillar_03'), hx1 - T * 0.73, top, T * 0.95, T * 1.55);
      dr(f, I('Pillar_01'), hx0 - T * 0.1, top + T * 0.1, hx1 - hx0 + T * 0.2, T * 0.2);
      f.strokeStyle = '#5a3a1c'; f.lineWidth = Math.max(2, T * 0.04); f.beginPath(); f.moveTo((hx0 + hx1) / 2, top + T * 0.25); f.lineTo((hx0 + hx1) / 2, FY(0) - T * 0.35); f.stroke();
      dr(f, I('Sign_02'), FX(L.hole.x1) + T * 0.0, FY(0) - T * 0.92, T * 0.85, T * 0.85);
      label(f, '矿洞', FX(L.hole.x1) + T * 0.43, FY(0) - T * 0.55, Math.round(T * 0.2));
    }
    for (const [n, x, w] of [['Grass_02', -0.1, 0.9], ['Grass_01', 0.95, 0.7], ['Plant_02', 2.55, 0.55], ['Grass_01', 4.2, 0.6], ['Plant_03', 6.35, 0.55], ['Grass_02', 6.6, 0.7], ['Rock_03', 1.95, 0.5]])
      dr(f, I(n), FX(x), FY(0) - w * T * 0.5 + T * 0.05, w * T, w * T * 0.5 * (I(n).height / I(n).width) / 0.5);
    B.front = fr; B.gx = gx;
  };
  // 画：地面线在世界 y = 0；camY 是镜头顶在世界里的 y（屏幕像素）
  TW.drawBack = function (ctx, cy, VW, VH) { if (!B) return; const y = -B.H - cy; if (y + B.H < 0 || y > VH) return; ctx.drawImage(B.cv, 0, Math.round(y)); };
  TW.drawFront = function (ctx, cy, VW, VH) { if (!B) return; const y = -B.H - cy; if (y + B.H < 0 || y > VH) return; ctx.drawImage(B.front, 0, Math.round(y)); };
  // 烟囱的烟（序列帧 smoke），门的开合由 game.js 叠画
  TW.drawFx = function (ctx, cy, T, time) {
    if (!B) return; const im = TW.img.smoke; if (!im || !im.width) return;
    const fw = 160, fh = 154, n = 10, cx = B.gx + (L.smithy.x0 + (L.smithy.x1 - L.smithy.x0) * 0.66 + 0.3) * T, top = -2.35 * T - 1.35 * T - cy;
    for (let i = 0; i < 3; i++) { const t = (time * 0.5 + i / 3) % 1, fr = Math.floor(t * n) % n; ctx.globalAlpha = 0.55 * (1 - t); const z = T * (0.55 + t * 0.6); ctx.drawImage(im, fr * fw, 0, fw, fh, Math.round(cx - z / 2 + Math.sin(time + i) * T * 0.12), Math.round(top - t * T * 1.4 - z * 0.6), z, z); }
    ctx.globalAlpha = 1;
  };
  // 点击判定：返回 'smithy' | 'house' | 'hole' | null（世界坐标，格）
  TW.hit = function (x, y) {
    const S = L.smithy, H = L.house;
    if (x >= S.x0 && x <= S.x1 && y >= -3.7 && y <= 0.1) return 'smithy';
    if (x >= H.x0 - 0.1 && x <= H.x1 + 0.2 && y >= H.y - 3.1 && y <= H.y + 0.15) return 'house';
    if (x >= L.hole.x0 - 0.2 && x <= L.hole.x1 + 0.2 && y >= -1.7 && y <= 1.2) return 'hole';
    return null;
  };
})();
