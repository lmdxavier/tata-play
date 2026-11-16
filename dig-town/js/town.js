/* dig hero 地面小镇（侧视平台）：素材 = craftpix RPG Platformer Kit 的 VILLAGE 图块（assets/town）。
 * 布局单位：格（T 像素）。x 0..7 是屏幕宽；y = 0 是地面（地下第 0 行的顶），往上是负数。
 * 只管画面和布局；主角走路、爬梯、点建筑的逻辑在 game.js。 */
(function () {
  'use strict';
  const TW = window.TOWN = { img: {}, ready: false };
  const N = ['Background_01', 'Background_02', 'Wall_C_01', 'Wall_C_02', 'Wall_C_03', 'Wall_A_01', 'Wall_A_02', 'Wall_A_03', 'Roof_A_01', 'Roof_A_03', 'Roof_B_01', 'Roof_B_03', 'Roof_A_04', 'Roof_A_05', 'Roof_B_04', 'Roof_B_05', 'Roof_A_02', 'Roof_B_02',
    'Wide_Door_02', 'Door_04', 'Chimney_04', 'Stone_Window_02', 'Window_04', 'Decor_Window_04', 'Pillar_01', 'Pillar_02', 'Pillar_03', 'Pillar_04',
    'Banner_01', 'Banner_02', 'Bench', 'Fence_02', 'Fence_03', 'Grass_01', 'Grass_02', 'Grass_03', 'Plant_01', 'Plant_02', 'Plant_03', 'Quest_Board',
    'Rock_01', 'Rock_03', 'Sack_01', 'Sign_01', 'Sign_02', 'Stump', 'Tree_01', 'Tree_02', 'Wooden_Barrel', 'Wooden_Crate', 'Wheat', 'Sunflower', 'Canopy_02'];
  const EXTRA = { anvil: 'sk/Item_Anvil_01_Light.png', book: 'sk/Item_Book_02_Purple.png', pick: 'sk/Gear_Weapons_Pickaxe_01.png', smoke: 'vfx/smoke.png' };
  // 布局（格）
  const L = TW.L = {
    plat: { x0: 4.35, x1: 6.98, y: -2.6 },           // 技能屋平台（木板面）
    ladder: { x: 4.72, w: 0.62, y0: 0, y1: -2.6 },   // 梯子中心 x
    hole: { x0: 3, x1: 4 },                          // 矿洞（第 4 列）
    smithy: { x0: 0.24, x1: 2.74, door: 1.12, y: 0 },
    house: { x0: 4.9, x1: 6.78, door: 5.48, y: -2.6 },
  };
  // 前景装饰（格）：每样都要落在真实画出来的地表上（v0.5 的 Plant_02 摆在 2.55，地形画出来的洞口比格子宽，草浮在洞上）
  TW.FG = [['Grass_02', -0.1, 0.9], ['Wooden_Barrel', 0.0, 0.5], ['Grass_01', 0.95, 0.7], ['Plant_02', 2.05, 0.55], ['Wooden_Crate', 2.18, 0.5], ['Grass_01', 4.4, 0.6], ['Fence_02', 5.95, 0.62], ['Plant_03', 6.35, 0.55], ['Grass_02', 6.6, 0.7], ['Rock_03', 1.6, 0.5]];   // 对比页：加了木桶、木箱、栅栏挡在建筑脚下（三档共用）
  TW.mode = 0; TW.POSTS = [];   // 对比页档位：0 现在 / 1 加结构 / 2 再加阴影；POSTS = 第 2、3 档立在地上的雨棚柱（落地检查）
  // 落地检查：每样装饰底边上取 7 个点，问地形“这里的土面在哪”，比地面线低超过 0.12 格 = 悬空（tools/test/ground.js 调用）
  TW.checkGround = (T, floorAt) => [...TW.FG, ...TW.POSTS].flatMap(([n, x, w]) => { const bad = []; for (let i = 0; i <= 6; i++) { const xi = x + 0.08 * w + (0.84 * w) * i / 6; if (xi < 0 || xi > 7) continue; const f = floorAt(xi * T, 0); if (f > 0.12 * T) bad.push(+xi.toFixed(2)); } return bad.length ? [{ n, x, w, bad }] : []; });
  TW.load = () => Promise.all([...N.map(n => ['t_' + n, 'town/' + n + '.png']), ...Object.entries(EXTRA)].map(([k, src]) => new Promise(res => { const im = new Image(); im.onload = im.onerror = res; im.src = 'assets/' + src; TW.img[k] = im; }))).then(() => { TW.ready = true; });
  const I = n => TW.img['t_' + n];
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  function dr(g, im, x, y, w, h, flip) { if (!im || !im.width) return; if (!h) h = w * im.height / im.width; if (flip) { g.save(); g.translate(x + w, y); g.scale(-1, 1); g.drawImage(im, 0, 0, w, h); g.restore(); } else g.drawImage(im, x, y, w, h); }
  // 三段拼接（用户 2026-11-16：建筑边缘要用素材自带的收边件）：左收边 + 中段平铺（余数裁切，不拉伸）+ 右收边，统一缩放
  const OPQ = {};   // 每张图不透明区域的左右边界（素材像素）
  const OPQ_T = { Wall_A_01: [63, 128], Wall_A_03: [0, 65], Wall_C_01: [65, 128], Wall_C_03: [0, 63], Roof_A_01: [36, 128], Roof_A_03: [0, 92], Roof_B_01: [36, 128], Roof_B_03: [0, 92] };   // file:// 下读不了像素，常用件直接查表
  function opq(im) { const k = im.src; if (OPQ[k]) return OPQ[k]; const nm = (k.match(/([A-Za-z_0-9]+)\.png/) || [])[1]; if (OPQ_T[nm]) return OPQ[k] = OPQ_T[nm]; const c = mk(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0); let a = null; try { a = g.getImageData(0, 0, im.width, im.height).data; } catch (e) { return OPQ[k] = [0, im.width]; }
    let l = im.width, r = 0; for (let y = 0; y < im.height; y += 2) for (let x = 0; x < im.width; x++) if (a[(y * im.width + x) * 4 + 3] > 8) { if (x < l) l = x; if (x > r) r = x; } return OPQ[k] = [l, r + 1]; }
  function slice3(g, L, M, R, x0, x1, y, h) {   // 画在 [x0,x1] × [y, y+h]，h = 素材整张高度对应的像素
    if (!L || !L.width || !M || !M.width || !R || !R.width) return;
    const k = h / M.height, [la, lb] = opq(L), [ra, rb] = opq(R), lw = (lb - la) * k, rw = (rb - ra) * k;
    const m0 = x0 + lw * 0.5, m1 = x1 - rw * 0.5, tw = M.width * k;   // 中段伸进收边一半，接缝被收边盖住
    for (let x = m0; x < m1 - 0.5; x += tw) { const w = Math.min(tw, m1 - x); g.drawImage(M, 0, 0, w / k, M.height, x, y, w, h); }
    g.drawImage(L, la, 0, lb - la, L.height, x0, y, lw, L.height * k);
    g.drawImage(R, ra, 0, rb - ra, R.height, x1 - rw, y, rw, R.height * k);
  }
  TW.slice3 = slice3;
  function label(g, text, x, y, fs) { g.font = `700 ${fs}px UINum, "PingFang SC", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = fs * 0.28; g.strokeStyle = '#3a2412'; g.strokeText(text, x, y); g.fillStyle = '#fff2c8'; g.fillText(text, x, y); }

  /* ---------- 烘焙：远景层 + 建筑层（按当前格宽 T 画一次） ---------- */
  let B = null, bakedT = 0;
  TW.bake = function (T, VW) {
    if (!TW.ready || (bakedT === T && B && B.vw === VW && B.mode === TW.mode)) return; bakedT = T; TW._last = [T, VW]; doorCache = {};
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
    dr(g, I('Tree_01'), gx + T * 3.7, H - T * 4.9, T * 4.9);   // 根部落在地面上（v0.4 根浮在半空）
    g.restore();
    const y0 = H;   // 地面线在烘焙画布里的 y
    const X = v => gx + v * T, Y = v => y0 + v * T;

    let B_EXTRA = null; TW.POSTS = [];
    if (TW.mode === 0) {
    // ---- 铁匠铺 ----
    { const L0 = L.smithy, x0 = X(L0.x0), w = (L0.x1 - L0.x0) * T, wh = T * 2.35;
      dr(g, I('Chimney_04'), x0 + w * 0.66, Y(0) - wh - T * 1.35, T * 0.62, T * 0.62 * 1.55);
      slice3(g, I('Wall_C_01'), I('Wall_C_02'), I('Wall_C_03'), x0, x0 + w, Y(0) - wh * 320 / 302, wh * 320 / 302);
      slice3(g, I('Roof_A_01'), I('Roof_A_02'), I('Roof_A_03'), x0 - T * 0.1, x0 + w + T * 0.1, Y(0) - wh - T * 0.36, T * 0.62);
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
      slice3(g, I('Wall_A_01'), I('Wall_A_02'), I('Wall_A_03'), x0, x0 + w, by - wh * 320 / 300, wh * 320 / 300);
      slice3(g, I('Roof_B_01'), I('Roof_B_02'), I('Roof_B_03'), x0 - T * 0.1, x0 + w + T * 0.1, by - wh - T * 0.34, T * 0.58);
      const gh = T * 0.95; dr(g, I('Roof_B_05'), x0 - T * 0.24, by - wh - T * 0.28 - gh, w / 2 + T * 0.26, gh); dr(g, I('Roof_B_04'), x0 + w / 2 - T * 0.02, by - wh - T * 0.28 - gh, w / 2 + T * 0.26, gh);
      dr(g, I('Window_04'), x0 + w * 0.6, by - T * 1.45, T * 0.62, T * 0.62);
      dr(g, I('Banner_02'), x0 + w * 0.06, by - wh + T * 0.12, T * 0.5, T * 0.5);
      dr(g, TW.img.book, x0 + w * 0.6 + T * 0.07, by - wh - T * 0.58, T * 0.48, T * 0.48);
    }
    } else {
    /* ---------- 对比页第 2、3 档：加结构（木框架、雨棚、梁头）/ 再加阴影 ----------
     * 图层：墙层 WL（墙面 + 光影）→ 凸出层 OB（框架、窗、招牌）→ 屋顶层 RF；雨棚和门楣在 OV（画在门上面）。
     * 阴影（第 3 档）：所有投影先累积到 SH（光从左上来），只叠在墙上（source-atop），门按同一张 SH 裁一块上影（TW.doorImg）。 */
    const SHADE = TW.mode >= 2, lay = () => { const c = mk(VW, H); return { c, g: c.getContext('2d') }; };
    const SH = lay(), OV = lay(), SC = 'rgba(28,14,6,';
    // 按原比例画一根横梁 / 立柱：两端各留一段原图端头，中间平铺原图中段（余数裁切），不非等比拉伸
    function beamH(gg, im, x0, x1, yTop, th) {   // th = 看得见的厚度（像素）
      const bb = im === I('Pillar_01') ? [13, 51] : [0, im.height], k = th / (bb[1] - bb[0]), cap = 40, y = yTop - bb[0] * k, h = im.height * k;
      const cw = cap * k, m0 = x0 + cw, m1 = x1 - cw, mw = (im.width - 2 * cap) * k;
      for (let x = m0; x < m1 - 0.5; x += mw) { const w = Math.min(mw, m1 - x); gg.drawImage(im, cap, 0, w / k, im.height, x, y, w, h); }
      gg.drawImage(im, 0, 0, cap, im.height, x0, y, cw, h); gg.drawImage(im, im.width - cap, 0, cap, im.height, x1 - cw, y, cw, h);
    }
    function postV(gg, cx, y0, y1, tw) {   // Pillar_02 立柱，cx 中心，tw 看得见的宽度
      const im = I('Pillar_02'), k = tw / 40, w = im.width * k, cap = 40, ch = cap * k, m0 = y0 + ch, m1 = y1 - ch, mh = (im.height - 2 * cap) * k, x = cx - 32 * k;
      for (let y = m0; y < m1 - 0.5; y += mh) { const h = Math.min(mh, m1 - y); gg.drawImage(im, 0, cap, im.width, h / k, x, y, w, h); }
      gg.drawImage(im, 0, 0, im.width, cap, x, y0, w, ch); gg.drawImage(im, 0, im.height - cap, im.width, cap, x, y1 - ch, w, ch);
    }
    function head(gg, n, cx, cy, vis) { const im = I(n), s = vis * 64 / 41; dr(gg, im, cx - s / 2, cy - s / 2, s, s); }   // 梁头 Pillar_05 方 / 06 圆
    // 把 src 图层的剪影模糊后叠进 SH（偏移 dx, dy，模糊约 r 像素，不透明度 a）；不用 ctx.filter（iOS Safari 画布不支持）
    function cast(src, dx, dy, r, a) {
      if (!SHADE) return; const f = Math.max(2, Math.round(r)), w = Math.ceil(src.width / f), h = Math.ceil(src.height / f);
      const s = mk(w, h), sg = s.getContext('2d'); sg.drawImage(src, 0, 0, w, h); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = SC + '1)'; sg.fillRect(0, 0, w, h);
      const s2 = mk(Math.ceil(w / 2), Math.ceil(h / 2)); s2.getContext('2d').drawImage(s, 0, 0, s2.width, s2.height);
      SH.g.save(); SH.g.imageSmoothingEnabled = true; SH.g.globalAlpha = a * 0.6; SH.g.drawImage(s, dx, dy, src.width, src.height); SH.g.globalAlpha = a * 0.55; SH.g.drawImage(s2, dx, dy, src.width, src.height); SH.g.restore();
    }
    function wallGrad(x0, x1, yTop, yBot) {   // 墙面从上到下轻微变暗 + 墙脚接触暗带
      if (!SHADE) return; let gr = SH.g.createLinearGradient(0, yTop, 0, yBot); gr.addColorStop(0, SC + '0)'); gr.addColorStop(1, SC + '.3)'); SH.g.fillStyle = gr; SH.g.fillRect(x0, yTop, x1 - x0, yBot - yTop);
      gr = SH.g.createLinearGradient(0, yBot - T * 0.42, 0, yBot); gr.addColorStop(0, SC + '0)'); gr.addColorStop(1, SC + '.42)'); SH.g.fillStyle = gr; SH.g.fillRect(x0, yBot - T * 0.42, x1 - x0, T * 0.42);
    }
    const applySH = L => { if (!SHADE) return; L.g.save(); L.g.globalCompositeOperation = 'source-atop'; L.g.drawImage(SH.c, 0, 0); L.g.restore(); };
    TW.POSTS = [];
    // ---- 铁匠铺 ----
    { const L0 = L.smithy, x0 = X(L0.x0), w = (L0.x1 - L0.x0) * T, x1 = x0 + w, wh = T * 2.35, by = Y(0);
      dr(g, I('Chimney_04'), x0 + w * 0.66, by - wh - T * 1.35, T * 0.62, T * 0.62 * 1.55);
      const WL = lay(), OB = lay(), RF = lay();
      slice3(WL.g, I('Wall_C_01'), I('Wall_C_02'), I('Wall_C_03'), x0, x1, by - wh * 320 / 302, wh * 320 / 302);
      // 屋顶层
      slice3(RF.g, I('Roof_A_01'), I('Roof_A_02'), I('Roof_A_03'), x0 - T * 0.1, x1 + T * 0.1, by - wh - T * 0.36, T * 0.62);
      const gh = T * 1.05; dr(RF.g, I('Roof_A_05'), x0 - T * 0.22, by - wh - T * 0.3 - gh, w / 2 + T * 0.24, gh); dr(RF.g, I('Roof_A_04'), x0 + w / 2 - T * 0.02, by - wh - T * 0.3 - gh, w / 2 + T * 0.24, gh);
      dr(RF.g, I('Decor_Window_04'), x0 + w / 2 - T * 0.28, by - wh - T * 0.92, T * 0.56, T * 0.56);
      // 凸出层：檐下横梁（两头伸出墙、圆梁头）、石窗（带窗台）、招牌挂在梁上
      const bmT = by - wh - T * 0.03, bmH = T * 0.17;
      beamH(OB.g, I('Pillar_01'), x0 - T * 0.2, x1 + T * 0.2, bmT, bmH);
      head(OB.g, 'Pillar_06', x0 - T * 0.12, bmT + bmH / 2, T * 0.25); head(OB.g, 'Pillar_06', x1 + T * 0.12, bmT + bmH / 2, T * 0.25);
      dr(OB.g, I('Stone_Window_02'), x0 + w * 0.68, by - T * 1.55, T * 0.66, T * 0.66);
      dr(OB.g, I('Sign_01'), x0 + w * 0.55, by - wh + T * 0.02, T * 1.05, T * 1.05);
      dr(OB.g, TW.img.anvil, x0 + w * 0.55 + T * 0.3, by - wh + T * 0.33, T * 0.46, T * 0.46);
      // 门口雨棚 Canopy_02：两条短腿接 Pillar_02 立柱落地，柱顶加 Canopy_04 三角撑（雨棚画在门上面 OV）
      const cw = T * 1.5, ch = cw / 2, cx0 = X(L0.door) - cw / 2, ct = by - T * 1.66, k = cw / 256, plankB = ct + 79 * k, legB = ct + 126 * k;
      dr(OV.g, I('Canopy_02'), cx0, ct, cw, ch);
      for (const [lx, flip] of [[14, 0], [242, 1]]) {
        const pcx = cx0 + lx * k; postV(OB.g, pcx, legB - T * 0.08, by + T * 0.06, 18 * k); TW.POSTS.push(['Pillar_02', (pcx - gx) / T - 0.06, 0.12]);
        const bs = T * 0.3; dr(OV.g, I('Canopy_04'), flip ? pcx - 9 * k - bs : pcx + 9 * k - T * 0.01, plankB - T * 0.01, bs, bs, flip);
      }
      wallGrad(x0, x1, by - wh, by);
      cast(RF.c, T * 0.02, T * 0.2, T * 0.07, 0.75);   // 屋檐压在墙上的影
      cast(OB.c, T * 0.05, T * 0.1, T * 0.05, 0.55);   // 横梁、窗台、招牌
      cast(OV.c, T * 0.03, T * 0.24, T * 0.07, 0.7);     // 雨棚
      applySH(WL); g.drawImage(WL.c, 0, 0); g.drawImage(OB.c, 0, 0); g.drawImage(RF.c, 0, 0);
    }
    // ---- 平台（木板单独一层：第 3 档技能屋在木板上压一条接触影） ----
    { const P = L.plat, px0 = X(P.x0), px1 = X(P.x1), py = Y(P.y), PL = lay();
      for (const xx of [P.x0 + 0.25, P.x1 - 0.55]) dr(g, I('Pillar_02'), X(xx), py, T * 0.24, -P.y * T);
      dr(g, I('Pillar_04'), X(P.x0 + 0.3), py + T * 0.25, T * 1.0, T * 1.0); dr(g, I('Pillar_03'), X(P.x1 - 1.45), py + T * 0.25, T * 1.0, T * 1.0);
      for (let x = px0; x < px1; x += T * 1.25) dr(PL.g, I('Pillar_01'), x, py - T * 0.06, T * 1.3, T * 0.26);
      if (SHADE) { const H1 = L.house, cx = X((H1.x0 + H1.x1) / 2), rx = (H1.x1 - H1.x0) / 2 * T + T * 0.25, gr = PL.g.createRadialGradient(0, 0, 0, 0, 0, 1);
        gr.addColorStop(0, SC + '.55)'); gr.addColorStop(0.7, SC + '.3)'); gr.addColorStop(1, SC + '0)');
        PL.g.save(); PL.g.globalCompositeOperation = 'source-atop'; PL.g.translate(cx, py - T * 0.02); PL.g.scale(rx, T * 0.2); PL.g.fillStyle = gr; PL.g.fillRect(-1, -1, 2, 2); PL.g.restore(); }
      g.drawImage(PL.c, 0, 0);
    }
    // ---- 技能屋：白墙 + 木框架（顶梁、地梁、角柱、中柱、窗下交叉斜撑、方梁头） ----
    { const L1 = L.house, x0 = X(L1.x0), w = (L1.x1 - L1.x0) * T, x1 = x0 + w, wh = T * 1.95, by = Y(L1.y) - T * 0.04;
      const WL = lay(), OB = lay(), RF = lay();
      slice3(WL.g, I('Wall_A_01'), I('Wall_A_02'), I('Wall_A_03'), x0, x1, by - wh * 320 / 300, wh * 320 / 300);
      slice3(RF.g, I('Roof_B_01'), I('Roof_B_02'), I('Roof_B_03'), x0 - T * 0.1, x1 + T * 0.1, by - wh - T * 0.34, T * 0.58);
      const gh = T * 0.95; dr(RF.g, I('Roof_B_05'), x0 - T * 0.24, by - wh - T * 0.28 - gh, w / 2 + T * 0.26, gh); dr(RF.g, I('Roof_B_04'), x0 + w / 2 - T * 0.02, by - wh - T * 0.28 - gh, w / 2 + T * 0.26, gh);
      dr(RF.g, TW.img.book, x0 + w * 0.6 + T * 0.07, by - wh - T * 0.58, T * 0.48, T * 0.48);
      const th = T * 0.15, topT = by - wh + T * 0.02, sillT = by - T * 0.2, pw = T * 0.14;
      const dX0 = X(L1.door - 0.31), dX1 = X(L1.door + 0.31), wX0 = x0 + w * 0.6, wX1 = wX0 + T * 0.62, wB = by - T * 1.45 + T * 0.62;
      postV(OB.g, x0 + T * 0.17, topT, sillT + th, pw); postV(OB.g, x1 - T * 0.17, topT, sillT + th, pw); postV(OB.g, (dX1 + wX0) / 2, topT, sillT + th, pw);
      { const s = Math.min(sillT - wB, x1 - T * 0.24 - (dX1 + wX0) / 2 - pw * 0.4) - T * 0.04, sx = (wX0 + wX1) / 2 - s / 2 + T * 0.02, sy = wB + (sillT - wB - s) / 2;
        dr(OB.g, I('Pillar_03'), sx, sy, s, s); dr(OB.g, I('Pillar_04'), sx, sy, s, s); }
      beamH(OB.g, I('Pillar_01'), x0 + T * 0.04, x1 - T * 0.04, sillT, th);
      beamH(OB.g, I('Pillar_01'), x0 - T * 0.2, x1 + T * 0.2, topT, th);
      head(OB.g, 'Pillar_05', x0 - T * 0.13, topT + th / 2, T * 0.22); head(OB.g, 'Pillar_05', x1 + T * 0.13, topT + th / 2, T * 0.22);
      dr(OB.g, I('Window_04'), wX0, by - T * 1.45, T * 0.62, T * 0.62);
      dr(OB.g, I('Banner_02'), x0 + w * 0.06, by - wh + T * 0.12, T * 0.5, T * 0.5);
      beamH(OV.g, I('Pillar_01'), dX0 - T * 0.08, dX1 + T * 0.08, by - T * 1.24 - T * 0.11, th);   // 门楣（压在门顶上）
      wallGrad(x0, x1, by - wh, by);
      cast(RF.c, T * 0.02, T * 0.2, T * 0.07, 0.75); cast(OB.c, T * 0.045, T * 0.09, T * 0.04, 0.55);
      applySH(WL); g.drawImage(WL.c, 0, 0); g.drawImage(OB.c, 0, 0); g.drawImage(RF.c, 0, 0);
    }
    B_EXTRA = { ov: OV.c, sh: SHADE ? SH.c : null };
    }
    // ---- 告示板、木桶等（不可点的装饰） ----
    dr(g, I('Quest_Board'), X(5.35), Y(0) - T * 1.3, T * 1.3, T * 1.3);
    dr(g, I('Wheat'), X(6.25), Y(0) - T * 0.95, T * 0.95, T * 0.95);
    dr(g, I('Wooden_Barrel'), X(6.5), Y(0) - T * 0.5, T * 0.42, T * 0.5);
    dr(g, I('Sack_01'), X(6.3), Y(P_Y()) - T * 0.5, T * 0.45, T * 0.45);
    function P_Y() { return L.plat.y; }
    // 梯子画在背景层：主角爬梯时在梯子前面（v0.4 画在前景，人被梯子挡住）
    { const Ld = L.ladder, lx = X(Ld.x - Ld.w / 2), ly1 = Y(Ld.y1 - 0.25), lh = Y(Ld.y0) - ly1, rw = T * 0.13;
      dr(g, I('Pillar_02'), lx, ly1, rw, lh); dr(g, I('Pillar_02'), lx + Ld.w * T - rw, ly1, rw, lh);
      for (let y = ly1 + T * 0.3; y < Y(0) - T * 0.1; y += T * 0.42) dr(g, I('Pillar_01'), lx + rw * 0.4, y, Ld.w * T - rw * 0.8, T * 0.12);
    }
    // 矿洞木架、吊绳、“矿洞”木牌也在背景层：主角跳过洞口、宠物经过时不被横梁和吊绳挡脸
    { const hx0 = X(L.hole.x0), hx1 = X(L.hole.x1), top = Y(0) - T * 1.55;
      dr(g, I('Pillar_04'), hx0 - T * 0.22, top, T * 0.95, T * 1.55); dr(g, I('Pillar_03'), hx1 - T * 0.73, top, T * 0.95, T * 1.55);
      dr(g, I('Pillar_01'), hx0 - T * 0.1, top + T * 0.1, hx1 - hx0 + T * 0.2, T * 0.2);
      g.strokeStyle = '#5a3a1c'; g.lineWidth = Math.max(2, T * 0.04); g.beginPath(); g.moveTo((hx0 + hx1) / 2, top + T * 0.25); g.lineTo((hx0 + hx1) / 2, Y(0) - T * 0.35); g.stroke();
      dr(g, I('Sign_02'), X(L.hole.x1) + T * 0.0, Y(0) - T * 0.92, T * 0.85, T * 0.85);
      label(g, '矿洞', X(L.hole.x1) + T * 0.43, Y(0) - T * 0.55, Math.round(T * 0.2));
    }
    B = { cv: bk, H, vw: VW, mode: TW.mode, ov: B_EXTRA && B_EXTRA.ov, sh: B_EXTRA && B_EXTRA.sh, gs: null };
    // 前景（画在角色前面）：只有草和小石头
    const fr = mk(VW, H + T * 0.6), f = fr.getContext('2d'), fy0 = H;
    const FX = v => gx + v * T, FY = v => fy0 + v * T;
    for (const [n, x, w] of TW.FG)
      { const h = w * T * I(n).height / I(n).width; dr(f, I(n), FX(x), FY(0) - h + T * 0.06, w * T, h); }   // 底边落在地面线（只压进 0.06 格草根）
    B.front = fr; B.gx = gx;
    // 第 3 档：地面接触影（建筑脚、柱脚、告示板、木桶、前景装饰下面），画在地形之后、角色之前
    if (TW.mode >= 2) {
      const gs = mk(VW, H + T * 0.6), q = gs.getContext('2d'), fl = x => { let v = 0; try { v = window.TERRAIN && TERRAIN.floorAt ? TERRAIN.floorAt(x * T, 0) : 0; } catch (e) { v = 0; } return Math.min(T * 0.2, Math.max(-T * 0.2, v || 0)); };
      const blob = (xa, xb, a, ry) => { const cx = (xa + xb) / 2, rx = (xb - xa) / 2 * T, gr = q.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, 'rgba(28,14,6,' + a + ')'); gr.addColorStop(0.6, 'rgba(28,14,6,' + a * 0.55 + ')'); gr.addColorStop(1, 'rgba(28,14,6,0)');
        q.save(); q.translate(gx + cx * T, fy0 + fl(cx) + T * 0.02); q.scale(rx, T * (ry || 0.13)); q.fillStyle = gr; q.fillRect(-1, -1, 2, 2); q.restore(); };
      blob(L.smithy.x0 - 0.15, L.smithy.x1 + 0.15, 0.5, 0.16);
      for (const [, x, w] of TW.POSTS) blob(x - 0.1, x + w + 0.1, 0.45);
      blob(5.4, 6.6, 0.4); blob(6.45, 6.98, 0.45); blob(6.25, 7.1, 0.3);   // 告示板、木桶、麦子
      blob(L.plat.x0 + 0.15, L.plat.x0 + 0.65, 0.4); blob(L.plat.x1 - 0.65, L.plat.x1 - 0.15, 0.4); blob(L.ladder.x - 0.45, L.ladder.x + 0.45, 0.35);
      blob(L.hole.x0 - 0.3, L.hole.x0 + 0.05, 0.4); blob(L.hole.x1 - 0.05, L.hole.x1 + 0.3, 0.4);
      for (const [n, x, w] of TW.FG) if (/Barrel|Crate|Fence|Rock/.test(n)) blob(x - 0.06, x + w + 0.06, 0.5);
      B.gs = gs;
    }
  };
  // 对比页：切档后立即重画小镇
  let doorCache = {};
  window.TOWN_MODE = m => { TW.mode = m; bakedT = 0; doorCache = {}; if (TW._last) TW.bake(TW._last[0], TW._last[1]); };
  TW.drawOver = function (ctx, cy, VW, VH) { if (!B || !B.ov) return; const y = -B.H - cy; if (y + B.H < 0 || y > VH) return; ctx.drawImage(B.ov, 0, Math.round(y)); };
  TW.drawShade = function (ctx, cy, VW, VH) { if (!B || !B.gs) return; const y = -B.H - cy; if (y + B.H < 0 || y > VH) return; ctx.drawImage(B.gs, 0, Math.round(y)); };
  // 门按墙上同一张影子图裁一块上影（第 3 档），门开合时照样用
  TW.doorImg = function (k, im, x, y, w, h) {
    if (!B || !B.sh || !im || !im.width) return im; if (doorCache[k]) return doorCache[k];
    const c = mk(im.width, im.height), q = c.getContext('2d'), T = bakedT; q.drawImage(im, 0, 0);
    q.globalCompositeOperation = 'source-atop'; q.drawImage(B.sh, B.gx + x * T, B.H + y * T, w * T, h * T, 0, 0, im.width, im.height);
    return doorCache[k] = c;
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
