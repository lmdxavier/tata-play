/* dig hero v0.2 地形画面：照搬 dig（v0.6.1）的“百战天虫式”地形画法，逻辑仍是 7 列的方块格子。
 *   格子（玩法）→ 细网格（4 世界像素一格；格子之间用平滑场 + 噪声连成不规则的土）→ 等值线 → 素材贴图铺内部、土壳 / 顶条逐像素取样贴边。
 *   一格 = 80 世界像素；画面缓存 1 世界像素 = CQ 个屏幕像素（CQ = 格子屏幕宽 / 80）。
 *   挖一下只重画这一格附近的一小块（区域重画），挖碎前格子按剩余血量往里缩（不规则地被啃掉）。
 * 远景：dig 的洞穴剪影层（灰度）× 每个阶段的颜色；光照：低分辨率光照图（环境光 + 点光源在空气里传播）乘整个画面。 */
(function () {
  'use strict';
  const TR = window.TERRAIN = {};
  const CELL = 80, SUB = 4, NS = CELL / SUB, COLS = 7;
  const IC0 = -NS * 2, NXF = (COLS + 4) * NS;          // 细网格横向：格子 -2..8
  const TH = 0.56;                                       // 平滑场阈值（>0.5：通道比格子略宽一点）
  const CH = 320;                                        // 一块画布 = 4 行格子高
  let CQ = 1, OXc = 0, DW = 0;                            // CQ：每世界像素几个屏幕像素；DW：画布宽（屏幕像素）
  let G = null;                                          // 游戏回调：cell(c,r)、stageOf(r)

  /* ---------- 阶段外观（每 20 米换：材质、边缘、地形起伏、远景色、环境光、光源道具） ---------- */
  // noise：[起伏幅度, 起伏尺度（世界像素）, 尖棱（ridged）]；bg：远景颜色；amb：环境光（颜色 × 强度）；props：光源道具
  const STAGES = [
    { name: '表土', body: 'dirt', rim: 'e_dirtrim', top: 'e_dirttop', spur: 'basalt', spurRim: 'e_gate', noise: [0.22, 46, 0], bg: [0.62, 0.86, 1.15], amb: [1.0, 0.96, 0.9, 0.9], props: ['mushroom', 'crystal2'] },
    { name: '沙岩', body: 'sand', rim: 'e_sand', top: null, spur: 'basalt', spurRim: 'e_gate', noise: [0.16, 78, 0], bg: [1.15, 0.92, 0.62], amb: [1.0, 0.92, 0.78, 0.8], props: ['fire', 'mushroom'] },
    { name: '根须红土', body: 'deep', rim: 'e_dirtrim', top: 'e_dirttop', spur: 'basalt', spurRim: 'e_gate', noise: [0.24, 40, 0], bg: [1.05, 0.7, 0.58], amb: [1.0, 0.86, 0.74, 0.68], props: ['fire', 'mushroom'] },
    { name: '苔藓洞', body: 'moss', rim: 'e_moss', top: 'e_mosstop', spur: 'basalt', spurRim: 'e_gate', noise: [0.24, 34, 0], bg: [0.66, 1.0, 0.7], amb: [0.86, 1.0, 0.8, 0.62], props: ['mushroom', 'crystal'] },
    { name: '紫晶岩', body: 'rock', rim: 'e_rock', top: null, spur: 'basalt', spurRim: 'e_gate', noise: [0.27, 36, 1], bg: [0.92, 0.7, 1.15], amb: [0.92, 0.84, 1.0, 0.6], props: ['crystal', 'crystal2'] },
    { name: '冰窟', body: 'ice', rim: 'e_ice', top: null, spur: 'basalt', spurRim: 'e_gate', noise: [0.27, 30, 1], bg: [0.62, 0.9, 1.2], amb: [0.82, 0.94, 1.0, 0.64], props: ['ice', 'crystal2'] },
    { name: '青岩沼', body: 'teal', rim: 'e_teal', top: null, spur: 'basalt', spurRim: 'e_gate', noise: [0.21, 52, 0], bg: [0.55, 1.0, 0.92], amb: [0.8, 1.0, 0.92, 0.56], props: ['crystal', 'mushroom'] },
    { name: '灰岩深层', body: 'hard2', rim: 'e_grey', top: null, spur: 'basalt', spurRim: 'e_gate', noise: [0.26, 34, 1], bg: [0.82, 0.86, 0.98], amb: [0.92, 0.92, 1.0, 0.5], props: ['fire', 'crystal2'] },
    { name: '熔岩层', body: 'bed', rim: 'e_bed', top: null, spur: 'basalt', spurRim: 'e_gate', noise: [0.23, 44, 0], bg: [1.2, 0.62, 0.42], amb: [1.0, 0.78, 0.62, 0.56], props: ['fire', 'fire'] },
    { name: '暗紫遗迹', body: 'ruin', rim: 'e_ruin', top: null, spur: 'basalt', spurRim: 'e_gate', noise: [0.13, 60, 0], bg: [0.95, 0.62, 1.05], amb: [0.96, 0.8, 1.0, 0.5], props: ['crystal', 'ice'] },
  ];
  TR.STAGES = STAGES;
  // 材质编号：1..10 各阶段的土，11..20 各阶段的叉（更硬的石头），21 守卫门
  const MAT = [null];
  STAGES.forEach(s => MAT.push({ tex: s.body, rim: s.rim, top: s.top }));
  STAGES.forEach(s => MAT.push({ tex: s.spur, rim: s.spurRim, top: null }));
  MAT.push({ tex: 'gate', rim: 'e_gate', top: null });
  const GATE = 21;
  const RIM_T = { e_dirtrim: 22, e_rock: 18, e_sand: 14, e_bed: 20, e_moss: 22, e_ice: 18, e_teal: 22, e_grey: 18, e_ruin: 20, e_gate: 18 };
  const TOPSTRIP = { e_grass: { s: 0.26, base: 156, h0: 220 }, e_dirttop: { s: 0.34, base: 52, h0: 113 }, e_mosstop: { s: 0.34, base: 52, h0: 113 } };
  const TEX_S = 0.5;   // 内部贴图：1 素材像素 = 0.5 世界像素（和 dig 一样）

  // 光源道具（素材来自 dig）：c = 光的颜色，k = 强度，r = 照多远（世界像素）
  const PROP = {
    fire:     { img: 'flame_loop', frames: 7, s: 0.42, c: [1.0, 0.62, 0.3], k: 1.1, r: 260 },
    mushroom: { img: 'mushrooms', s: 0.3, c: [1.0, 0.9, 0.45], k: 0.8, r: 190 },
    crystal:  { img: 'crystal_big', s: 0.13, c: [0.55, 1.0, 0.4], k: 0.85, r: 200 },
    crystal2: { img: 'crystal_small', s: 0.18, c: [0.55, 1.0, 0.4], k: 0.5, r: 130 },
    ice:      { img: 'Ice_Flower_05', s: 0.62, c: [0.45, 0.85, 1.0], k: 0.6, r: 160 },
  };
  TR.PROP = PROP;

  /* ---------- 噪声 ---------- */
  const hash2 = (x, y, s) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y, s) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.15;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const sm = t => t * t * (3 - 2 * t);

  /* ---------- 细网格（每行格子一份，20 行 × 220 列） ---------- */
  const FR = new Map();   // r → { m: Uint8Array 材质, n: Float32Array 噪声, wx, wy: Int8Array 材质边界扭曲 }
  const stageOf = r => Math.max(0, Math.min(STAGES.length - 1, G.stageOf(Math.max(0, r))));
  function cellVal(c, r) {   // 这格对平滑场的贡献：实心 1、空 0、挖到一半按剩余血量缩
    if (r < 0) return 0;
    if (c < 0 || c >= COLS) return 1;
    const k = G.cell(c, r), t = k.t;
    if (t === 0) return 0;
    if (t !== 3 && k.hp < k.max) { const q = Math.max(0, k.hp / k.max); return TH + 0.1 + (1 - TH - 0.1) * Math.pow(q, 0.85); }
    return 1;
  }
  function cellMat(c, r) {
    if (r < 0) return 0;
    const s = stageOf(r);
    if (c < 0 || c >= COLS) return 1 + s;
    const t = G.cell(c, r).t;
    return t === 0 ? 0 : t === 2 ? 11 + s : t === 3 ? GATE : 1 + s;
  }
  function makeRow(r) {
    const N = NS * NXF, n = new Float32Array(N), wx = new Int8Array(N), wy = new Int8Array(N);
    const st = STAGES[stageOf(r)], [A, L, ridge] = st.noise;
    for (let j = 0; j < NS; j++) for (let i = 0; i < NXF; i++) {
      const x = (IC0 + i + 0.5) * SUB, y = (r * NS + j + 0.5) * SUB, q = j * NXF + i;
      let v = fbm(x / L, y / L, 11 + stageOf(r)) * 2 - 1;
      if (ridge) v = (1 - Math.abs(v) * 2) * 0.9 + (vnoise(x / 9, y / 9, 5) - 0.5) * 0.25;   // 尖棱：岩石、冰
      let a = A; if (y < 70) a *= 0.25 + 0.75 * smooth(10, 70, y);                        // 地表平缓
      n[q] = v * a;
      wx[q] = Math.round((fbm(x / 34, y / 34, 31) - 0.5) * 60); wy[q] = Math.round((fbm(x / 34, y / 34, 47) - 0.5) * 60);
    }
    const row = { m: new Uint8Array(N), n, wx, wy };
    FR.set(r, row); fillRow(r, row, -2, COLS + 1); return row;
  }
  // 重新算 r 行里格子 cA..cB 范围内的细格
  function fillRow(r, row, cA, cB) {
    const V = [], M = [];
    for (let rr = r - 1; rr <= r + 1; rr++) { const v = [], m = []; for (let c = -3; c <= COLS + 2; c++) { v.push(cellVal(c, rr)); m.push(cellMat(c, rr)); } V.push(v); M.push(m); }
    const vAt = (c, rr) => V[rr - r + 1][c + 3], mAt = (c, rr) => M[rr - r + 1][c + 3];
    const i0 = Math.max(0, (cA + 2) * NS), i1 = Math.min(NXF, (cB + 3) * NS);
    for (let j = 0; j < NS; j++) for (let i = i0; i < i1; i++) {
      const q = j * NXF + i, x = (IC0 + i + 0.5) * SUB, y = (r * NS + j + 0.5) * SUB;
      const u = x / CELL - 0.5, v = y / CELL - 0.5, c0 = Math.floor(u), r0 = Math.floor(v), a = sm(u - c0), b = sm(v - r0);
      const f = (vAt(c0, r0) * (1 - a) + vAt(c0 + 1, r0) * a) * (1 - b) + (vAt(c0, r0 + 1) * (1 - a) + vAt(c0 + 1, r0 + 1) * a) * b;
      if (f + row.n[q] <= TH) { row.m[q] = 0; continue; }
      const cw = Math.floor((x + row.wx[q]) / CELL), rw = Math.floor((y + row.wy[q]) / CELL);
      let m = (rw >= r - 1 && rw <= r + 1) ? mAt(cw, rw) : 0;
      if (!m) {   // 扭曲落在空格上：取四个格子里贡献最大的实心材质
        let best = -1; const cand = [[c0, r0, (1 - a) * (1 - b)], [c0 + 1, r0, a * (1 - b)], [c0, r0 + 1, (1 - a) * b], [c0 + 1, r0 + 1, a * b]];
        for (const [cc, rr, w] of cand) { const mm = mAt(cc, rr); if (mm && w * vAt(cc, rr) > best) { best = w * vAt(cc, rr); m = mm; } }
        if (!m) m = 1 + stageOf(r);
      }
      row.m[q] = m;
    }
  }
  function at(i, j) {   // 细格材质（0 = 空）
    const r = Math.floor(j / NS); if (r < 0) return 0;
    const ii = i - IC0; if (ii < 0 || ii >= NXF) return 1 + stageOf(r);
    const row = FR.get(r) || makeRow(r);
    return row.m[(j - r * NS) * NXF + ii];
  }
  TR.at = at;

  /* ---------- 素材 ---------- */
  const IMG = {}, PAT = {}, RIMPXF = {};
  const load = src => new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => { console.warn('加载失败 ' + src); ok(null); }; im.src = src; });
  TR.load = async function () {
    const tex = new Set(); MAT.forEach(m => m && tex.add(m.tex));
    await Promise.all([...tex].map(async n => { IMG[n] = await load('assets/terrain/' + n + '.png'); }));
    await Promise.all(Object.keys(window.RIMS).map(async n => {
      const im = await load(window.RIMS[n]); if (!im) return;
      const th = RIM_T[n] ? RIM_T[n] * 4 : Math.round(TOPSTRIP[n].h0 * TOPSTRIP[n].s * 4);
      RIMPXF[n] = prefilter(im, th);
    }));
    await Promise.all(['l1_wall', 'l2_prop01', 'l3_prop02', 'l4_stones', 'l5_crystals'].map(async n => { IMG[n] = await load('assets/bg/' + n + '.png?v=3'); }));
    await Promise.all(Object.values(PROP).map(async p => { if (!IMG[p.img]) IMG[p.img] = await load('assets/props/' + p.img + '.png'); }));
    IMG.glow = await load('assets/ui/glow_white.png');
  };
  function shrinkTo(img, w, h) {   // 分几次减半再缩，缩小很多时不发糊
    let c = img, cw = img.width, ch = img.height;
    while (cw / 2 > w && ch / 2 > h) { const n = document.createElement('canvas'); n.width = Math.round(cw / 2); n.height = Math.round(ch / 2); const g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, n.width, n.height); c = n; cw = n.width; ch = n.height; }
    const o = document.createElement('canvas'); o.width = Math.max(1, Math.round(w)); o.height = Math.max(1, Math.round(h)); const g = o.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, o.width, o.height); return o;
  }
  function buildPat() {   // 内部贴图按当前清晰度缩好（四周先接上对边再缩，平铺接缝不出细线）
    for (const n in PAT) delete PAT[n];
    const tex = new Set(); MAT.forEach(m => m && tex.add(m.tex));
    for (const n of tex) {
      const im = IMG[n]; if (!im) continue;
      const k = TEX_S * CQ, pad = 32, wrap = document.createElement('canvas'); wrap.width = im.width + pad * 2; wrap.height = im.height + pad * 2;
      const wg = wrap.getContext('2d'); for (const ax of [-1, 0, 1]) for (const ay of [-1, 0, 1]) wg.drawImage(im, pad + ax * im.width, pad + ay * im.height);
      const tw = Math.round(im.width * k), th = Math.round(im.height * k), kx = tw / im.width, ky = th / im.height;
      const big = shrinkTo(wrap, wrap.width * kx, wrap.height * ky), c = document.createElement('canvas'); c.width = tw; c.height = th;
      c.getContext('2d').drawImage(big, -pad * kx, -pad * ky);
      PAT[n] = { c, ww: im.width * TEX_S, wh: im.height * TEX_S };
    }
  }
  function prefilter(im, targetH) {   // 边缘条缩到显示大小（逐级减半 = mipmap），预乘透明度，取样时双线性
    let c = document.createElement('canvas'), w = im.width, h = im.height; c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0);
    while (h / 2 >= targetH) { const n = document.createElement('canvas'); w = Math.max(1, Math.round(w / 2)); h = Math.max(1, Math.round(h / 2)); n.width = w; n.height = h; const g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, w, h); c = n; }
    const n = document.createElement('canvas'), tw = Math.round(w * targetH / h); n.width = tw; n.height = targetH; const g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, tw, targetH);
    const d = g.getImageData(0, 0, tw, targetH).data, f = new Float32Array(d.length);
    for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; f[i] = d[i] * a; f[i + 1] = d[i + 1] * a; f[i + 2] = d[i + 2] * a; f[i + 3] = d[i + 3]; }
    return { w: tw, h: targetH, f };
  }
  const TXO = new Float32Array(4);
  function texBilin(R, x, y) {   // x 横向循环，y 夹在范围内；结果写进 TXO（预乘）
    y = Math.max(0, Math.min(R.h - 1.001, y)); const y0 = Math.floor(y), fy = y - y0;
    let x0 = Math.floor(x); const fx = x - x0; x0 = ((x0 % R.w) + R.w) % R.w; const x1 = (x0 + 1) % R.w, F = R.f;
    const i00 = (y0 * R.w + x0) * 4, i10 = (y0 * R.w + x1) * 4, i01 = ((y0 + 1) * R.w + x0) * 4, i11 = ((y0 + 1) * R.w + x1) * 4;
    for (let k = 0; k < 4; k++) TXO[k] = (F[i00 + k] * (1 - fx) + F[i10 + k] * fx) * (1 - fy) + (F[i01 + k] * (1 - fx) + F[i11 + k] * fx) * fy;
  }

  /* ---------- 等值线、距离场（dig 的做法，改成任意矩形） ---------- */
  // 场值 = 3×3 加权平均后的“是不是实心”；窗口覆盖细格 i0-1..i0+ni+1、j0-1..j0+nj+1
  function fieldBlock(i0, j0, ni, nj, pick) {
    const Nx = ni + 3, Ny = nj + 3, Rx = Nx + 2, raw = new Uint8Array(Rx * (Ny + 2)), f = new Float32Array(Nx * Ny);
    for (let j = 0; j < Ny + 2; j++) for (let i = 0; i < Rx; i++) raw[j * Rx + i] = pick(at(i0 - 2 + i, j0 - 2 + j)) ? 1 : 0;
    for (let j = 0; j < Ny; j++) for (let i = 0; i < Nx; i++) {
      const r = (j + 1) * Rx + i + 1;
      f[j * Nx + i] = (raw[r] * 4 + (raw[r - 1] + raw[r + 1] + raw[r - Rx] + raw[r + Rx]) * 2 + raw[r - Rx - 1] + raw[r - Rx + 1] + raw[r + Rx - 1] + raw[r + Rx + 1]) / 16;
    }
    return { f, Nx, Ny, i0, j0, ni, nj };
  }
  function contour(F, path) {
    const { f, Nx, i0, j0, ni, nj } = F;
    const v = (i, j) => f[(j + 1) * Nx + i + 1];
    for (let j = -1; j <= nj; j++) {
      let run = -99;
      for (let i = -1; i <= ni + 1; i++) {
        const full = i <= ni && v(i, j) >= 0.5 && v(i + 1, j) >= 0.5 && v(i + 1, j + 1) >= 0.5 && v(i, j + 1) >= 0.5;
        if (full) { if (run === -99) run = i; continue; }
        if (run !== -99) { path.rect((i0 + run + 0.5) * SUB, (j0 + j + 0.5) * SUB, (i - run) * SUB, SUB); run = -99; }
        if (i > ni) continue;
        const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], val = c.map(([a, b]) => v(a, b));
        if (val.every(q => q < 0.5)) continue;
        const pts = [];
        for (let k = 0; k < 4; k++) {
          const a = val[k], b = val[(k + 1) & 3], pa = c[k], pb = c[(k + 1) & 3];
          if (a >= 0.5) pts.push((i0 + pa[0] + 0.5) * SUB, (j0 + pa[1] + 0.5) * SUB);
          if ((a >= 0.5) !== (b >= 0.5)) { const t = (0.5 - a) / (b - a); pts.push((i0 + pa[0] + 0.5 + (pb[0] - pa[0]) * t) * SUB, (j0 + pa[1] + 0.5 + (pb[1] - pa[1]) * t) * SUB); }
        }
        path.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) path.lineTo(pts[k], pts[k + 1]); path.closePath();
      }
    }
  }
  function fieldAt(F, wx, wy) {
    const { f, Nx, Ny, i0, j0 } = F, gx = wx / SUB - 0.5 - i0 + 1, gy = wy / SUB - 0.5 - j0 + 1;
    const i = Math.max(0, Math.min(Nx - 2, Math.floor(gx))), j = Math.max(0, Math.min(Ny - 2, Math.floor(gy))), fx = gx - i, fy = gy - j;
    return (f[j * Nx + i] * (1 - fx) + f[j * Nx + i + 1] * fx) * (1 - fy) + (f[(j + 1) * Nx + i] * (1 - fx) + f[(j + 1) * Nx + i + 1] * fx) * fy;
  }
  const GRD = [0, 0];
  function gradAt(F, wx, wy) {
    const { f, Nx, Ny, i0, j0 } = F, gx = wx / SUB - 0.5 - i0 + 1, gy = wy / SUB - 0.5 - j0 + 1;
    const i = Math.max(1, Math.min(Nx - 3, Math.floor(gx))), j = Math.max(1, Math.min(Ny - 3, Math.floor(gy))), fx = gx - i, fy = gy - j;
    const dx = (a, b) => f[b * Nx + a + 1] - f[b * Nx + a - 1], dy = (a, b) => f[(b + 1) * Nx + a] - f[(b - 1) * Nx + a];
    GRD[0] = (dx(i, j) * (1 - fx) + dx(i + 1, j) * fx) * (1 - fy) + (dx(i, j + 1) * (1 - fx) + dx(i + 1, j + 1) * fx) * fy;
    GRD[1] = (dy(i, j) * (1 - fx) + dy(i + 1, j) * fx) * (1 - fy) + (dy(i, j + 1) * (1 - fx) + dy(i + 1, j + 1) * fx) * fy;
    return GRD;
  }
  function boxBlur(src, w, h, r) {   // 只抹实心里面的距离，边缘保持不动（土壳内沿在斜坡上不起台阶）
    let a = Float32Array.from(src), b = new Float32Array(w * h);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < h; y++) { let acc = 0; const o = y * w; for (let x = -r; x <= r; x++) acc += a[o + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { b[o + x] = acc / (2 * r + 1); acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
      for (let x = 0; x < w; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { a[y * w + x] = acc / (2 * r + 1); acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]; } }
    }
    for (let i = 0; i < w * h; i++) if (src[i] < 6) a[i] = src[i]; else if (src[i] < 10) { const t = (src[i] - 6) / 4; a[i] = src[i] * (1 - t) + a[i] * t; }
    return a;
  }
  function distField(mask, w, h) {   // 实心像素到最近非实心像素的距离（倒角距离，两遍）
    const INF = 1e6, d = new Float32Array(w * h), D2 = Math.SQRT2;
    for (let i = 0; i < w * h; i++) d[i] = mask[i] >= 128 ? INF : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; let v = d[i]; if (!v) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) { v = Math.min(v, d[i - w] + 1); if (x > 0) v = Math.min(v, d[i - w - 1] + D2); if (x < w - 1) v = Math.min(v, d[i - w + 1] + D2); }
      d[i] = v;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; let v = d[i]; if (!v) continue;
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) { v = Math.min(v, d[i + w] + 1); if (x < w - 1) v = Math.min(v, d[i + w + 1] + D2); if (x > 0) v = Math.min(v, d[i + w - 1] + D2); }
      d[i] = v;
    }
    for (let i = 0; i < w * h; i++) if (d[i] && d[i] < 1.5) d[i] = Math.max(0, d[i] - 1 + mask[i] / 255);
    return d;
  }
  function nearestSite(mask, w, h) {   // 每个像素最近的轮廓点（两遍八邻域传递）
    const n = w * h, site = new Int32Array(n).fill(-1), d2 = new Int32Array(n).fill(0x3fffffff), SX = new Int32Array(n), SY = new Int32Array(n);
    for (let y = 1; y < h - 1; y++) for (let x = 1, i = y * w + 1; x < w - 1; x++, i++)
      if (mask[i] >= 128 && (mask[i - 1] < 128 || mask[i + 1] < 128 || mask[i - w] < 128 || mask[i + w] < 128)) { site[i] = i; d2[i] = 0; SX[i] = x; SY[i] = y; }
    const relax = (i, j, x, y, st) => { if (site[j] < 0) return st; const dx = SX[j] - x, dy = SY[j] - y, dd = dx * dx + dy * dy; if (dd < st.b) { st.b = dd; st.j = j; } return st; };
    const st = { b: 0, j: -1 };
    for (let y = 1; y < h; y++) for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) {
      st.b = d2[i]; st.j = -1; relax(i, i - 1, x, y, st); relax(i, i - w, x, y, st); relax(i, i - w - 1, x, y, st); relax(i, i - w + 1, x, y, st);
      if (st.j >= 0) { d2[i] = st.b; site[i] = site[st.j]; SX[i] = SX[st.j]; SY[i] = SY[st.j]; }
    }
    for (let y = h - 2; y >= 0; y--) for (let x = w - 2, i = y * w + w - 2; x >= 1; x--, i--) {
      st.b = d2[i]; st.j = -1; relax(i, i + 1, x, y, st); relax(i, i + w, x, y, st); relax(i, i + w + 1, x, y, st); relax(i, i + w - 1, x, y, st);
      if (st.j >= 0) { d2[i] = st.b; site[i] = site[st.j]; SX[i] = SX[st.j]; SY[i] = SY[st.j]; }
    }
    return { site, d2 };
  }
  const maskCv = document.createElement('canvas'), maskG = maskCv.getContext('2d', { willReadFrequently: true });
  function rasterMask(path, x0, y0, w, h) {
    if (maskCv.width < w || maskCv.height < h) { maskCv.width = Math.max(w, maskCv.width); maskCv.height = Math.max(h, maskCv.height); }
    maskG.setTransform(1, 0, 0, 1, 0, 0); maskG.clearRect(0, 0, w, h);
    maskG.setTransform(1, 0, 0, 1, -x0, -y0); maskG.fillStyle = '#fff'; maskG.fill(path);
    const src = maskG.getImageData(0, 0, w, h).data, out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = src[i * 4 + 3];
    return out;
  }
  const tmpCv = document.createElement('canvas'), tmpG = tmpCv.getContext('2d');

  /* ---------- 画布块 ---------- */
  const chunks = new Map();   // k → { cv, g, dy0, dy1, built }
  const queue = [];           // 待重画区域 { k, x0, y0, x1, y1 }（世界像素）
  const chunkDy = k => Math.round(k * CH * CQ);
  function getChunk(k) {
    let ch = chunks.get(k);
    if (!ch) {
      const dy0 = chunkDy(k), dy1 = chunkDy(k + 1);
      ch = { k, dy0, dy1, cv: document.createElement('canvas'), built: false };
      ch.cv.width = DW; ch.cv.height = dy1 - dy0; ch.g = ch.cv.getContext('2d');
      chunks.set(k, ch);
    }
    return ch;
  }
  // 用贴图铺满路径：按路径裁剪，再按世界坐标整像素铺（跨块无缝）
  function fillTex(g, path, key, dx0, dy0, cx0, cy0, w, h) {
    const P = PAT[key]; if (!P) return;
    g.save(); g.setTransform(CQ, 0, 0, CQ, -cx0, -cy0); g.clip(path); g.setTransform(1, 0, 0, 1, 0, 0);
    const pw = P.ww * CQ, ph = P.wh * CQ;
    const i0 = Math.floor(dx0 / pw), i1 = Math.floor((dx0 + w) / pw), j0 = Math.floor(dy0 / ph), j1 = Math.floor((dy0 + h) / ph);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = Math.round(i * pw), y = Math.round(j * ph), x2 = Math.round((i + 1) * pw), y2 = Math.round((j + 1) * ph);
      g.drawImage(P.c, x - cx0, y - cy0, x2 - x, y2 - y);
    }
    g.restore();
  }
  const MP = 32;   // 距离场在重画区域四周多算的余量（世界像素）：土壳 + 往外伸的顶条
  let statT = 0, statN = 0; const PF = { fill: 0, dist: 0, crust: 0, top: 0 };
  const half = (a, i, fx, fy, stride) => (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + stride] * (1 - fx) + a[i + stride + 1] * fx) * fy;
  const CAP = { e_grass: 12, e_dirttop: 8, e_mosstop: 8 };
  // 重画世界像素矩形 [X0,X1)×[Y0,Y1)：只算一次（跨两块画布时两块都贴），土壳 / 顶条在 1 像素 = 1 世界像素的层上算，放大贴上
  function* renderRegion(X0, Y0, X1, Y1) {
    const t0 = performance.now();
    X0 = Math.floor(X0); Y0 = Math.floor(Y0); X1 = Math.ceil(X1); Y1 = Math.ceil(Y1);
    const wx0 = Math.floor((X0 - MP) / SUB) * SUB, wx1 = Math.ceil((X1 + MP) / SUB) * SUB, wy0 = Math.floor((Y0 - MP) / SUB) * SUB, wy1 = Math.ceil((Y1 + MP) / SUB) * SUB;
    const i0 = wx0 / SUB, j0 = wy0 / SUB, ni = (wx1 - wx0) / SUB, nj = (wy1 - wy0) / SUB;
    const DX0 = Math.round(X0 * CQ), DX1 = Math.round(X1 * CQ), DY0 = Math.round(Y0 * CQ), DY1 = Math.round(Y1 * CQ);
    const targets = [];
    for (let k = Math.floor(Y0 / CH); k <= Math.floor((Y1 - 1) / CH); k++) { const ch = chunks.get(k); if (ch) targets.push(ch); }
    if (!targets.length) return;
    const clipTo = (ch, fn) => {
      const g = ch.g, cx0 = -OXc, cy0 = ch.dy0, x0 = Math.max(DX0, cx0), x1 = Math.min(DX1, cx0 + DW), y0 = Math.max(DY0, ch.dy0), y1 = Math.min(DY1, ch.dy1);
      if (x1 <= x0 || y1 <= y0) return;
      g.setTransform(1, 0, 0, 1, 0, 0); g.save(); g.beginPath(); g.rect(x0 - cx0, y0 - cy0, x1 - x0, y1 - y0); g.clip(); fn(g, cx0, cy0, x0, y0, x1 - x0, y1 - y0); g.restore();
    };
    // 1) 内部：先按最多的材质铺满所有实心，再按其他材质铺
    const cnt = new Map();
    for (let j = j0; j < j0 + nj; j++) for (let i = i0; i < i0 + ni; i++) { const m = at(i, j); if (m) cnt.set(m, (cnt.get(m) || 0) + 1); }
    if (!cnt.size) { for (const ch of targets) clipTo(ch, (g, cx0, cy0, x, y, w, h) => g.clearRect(x - cx0, y - cy0, w, h)); return; }
    // 底色按材质编号固定取最小的（土 < 叉 < 门），不按区域里谁多：否则挖掉一格后底色可能翻转，整块重画区域里的交界都跟着变形
    const mats = [...cnt.keys()].sort((a, b) => a - b), base = mats[0];
    const FU = fieldBlock(i0, j0, ni, nj, m => m > 0), pu = new Path2D(); contour(FU, pu);
    const sec = [];
    for (const m of mats) { if (m === base) continue; const Fm = fieldBlock(i0, j0, ni, nj, q => q === m), pm = new Path2D(); contour(Fm, pm); sec.push({ m, path: pm, rim: MAT[m].rim }); }
    PF.fill += performance.now() - t0; yield; let t1 = performance.now();
    // 2) 距离场（1 像素 = 1 世界像素）、最近轮廓点（半分辨率）
    const mw = wx1 - wx0, mh = wy1 - wy0, hw = mw >> 1, hh = mh >> 1, N = mw * mh;
    const mU = rasterMask(pu, wx0, wy0, mw, mh), dU0 = distField(mU, mw, mh);
    PF.dist += performance.now() - t1; yield; t1 = performance.now();
    const dU = boxBlur(dU0, mw, mh, 3);
    const SI = new Uint8Array(N);   // 这个像素在第几个“其他材质”里（0 = 不在）
    for (let q = 0; q < sec.length; q++) { PF.dist += performance.now() - t1; yield; t1 = performance.now(); const sc = sec[q]; sc.mask = rasterMask(sc.path, wx0, wy0, mw, mh); sc.d = distField(sc.mask, mw, mh); for (let i = 0; i < N; i++) if (!SI[i] && sc.mask[i] >= 128) SI[i] = q + 1; }
    PF.dist += performance.now() - t1; yield; t1 = performance.now();
    const mH = new Uint8Array(hw * hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) { const k = y * 2 * mw + x * 2; mH[y * hw + x] = (mU[k] + mU[k + 1] + mU[k + mw] + mU[k + mw + 1]) >> 2; }
    const { site, d2 } = nearestSite(mH, hw, hh);
    const NY = new Float32Array(hw * hh), TW = new Float32Array(hw * hh), SURF = new Uint8Array(hw * hh), SM = new Uint8Array(hw * hh);
    let anyTop = false;
    for (let i = 0; i < hw * hh; i++) {
      if (site[i] !== i) continue;
      const wx = wx0 + (i % hw) * 2 + 1, wy = wy0 + ((i / hw) | 0) * 2 + 1;
      const gr = gradAt(FU, wx, wy), gl = Math.hypot(gr[0], gr[1]) || 1, nx = -gr[0] / gl, ny = -gr[1] / gl;
      NY[i] = ny;
      let m = at(Math.floor((wx - nx * 3) / SUB), Math.floor((wy - ny * 3) / SUB)); if (!m) m = at(Math.floor((wx - nx * 7) / SUB), Math.floor((wy - ny * 7) / SUB)); if (!m) m = base;
      SM[i] = m; SURF[i] = wy < 40 ? 1 : 0;
      TW[i] = (SURF[i] || MAT[m].top) ? smooth(0.45, 0.75, -ny) : 0;
      if (TW[i] > 0.02) anyTop = true;
    }
    const TWP = new Float32Array(hw * hh), ANY = new Float32Array(hw * hh);
    for (let i = 0; i < hw * hh; i++) { TWP[i] = site[i] >= 0 ? TW[site[i]] : 0; ANY[i] = site[i] >= 0 ? Math.abs(NY[site[i]]) : 1; }
    let dA = null;
    if (anyTop) { const mI = new Uint8Array(N); for (let i = 0; i < N; i++) mI[i] = 255 - mU[i]; PF.dist += performance.now() - t1; yield; t1 = performance.now(); dA = distField(mI, mw, mh); }
    PF.dist += performance.now() - t1; yield; const t2 = performance.now();
    // 3) 土壳 + 顶条：1 像素 = 1 世界像素，范围多 1 像素（放大时双线性有邻居）
    const IW = X1 - X0 + 2, IH = Y1 - Y0 + 2;
    const img = tmpG.createImageData(IW, IH), O = img.data;
    for (let py = 0; py < IH; py++) {
      const wy = Y0 - 1 + py + 0.5, myf = wy - wy0 - 0.5, iy = Math.floor(myf), fyy = myf - iy;
      for (let px = 0; px < IW; px++) {
        const wx = X0 - 1 + px + 0.5, mxf = wx - wx0 - 0.5, ix = Math.floor(mxf), fxx = mxf - ix, k = iy * mw + ix;
        const dk = dU[k], si = SI[k];
        if (dk > 26 && !si) continue;
        if (dk === 0 && mU[k] === 0 && mU[k + 1] === 0 && mU[k + mw] === 0 && mU[k + mw + 1] === 0) continue;
        const cov = dk >= 2 ? 1 : half(mU, k, fxx, fyy, mw) / 255;
        if (cov <= 0.01) continue;
        const hx = Math.min(hw - 2, (mxf / 2) | 0), hy = Math.min(hh - 2, (myf / 2) | 0), hfx = mxf / 2 - hx, hfy = myf / 2 - hy, hi = hy * hw + hx;
        const sk = site[(iy >> 1) * hw + (ix >> 1)]; if (sk < 0 && !si) continue;   // 叉和土的交界离空气远时也要画边（以前这里跳过，边框有没有取决于重画区域大小）
        let d = half(dU, k, fxx, fyy, mw), name, secEdge = false;
        if (d < 5) {   // 贴近边缘：用平滑场估算的距离（斜边不起锯齿），往里渐变回距离场
          const fv = fieldAt(FU, wx, wy), gr = gradAt(FU, wx, wy), gl = Math.hypot(gr[0], gr[1]) / (2 * SUB);
          if (gl > 1e-4) { const de = Math.max(0, (fv - 0.5) / gl), t = Math.max(0, (d - 3) / 2); d = de * (1 - t) + d * t; }
        }
        if (si) { const sc = sec[si - 1]; name = sc.rim; const ds = half(sc.d, k, fxx, fyy, mw); if (ds < d) { d = ds; secEdge = true; } }
        else {
          let m = at(Math.floor(wx / SUB), Math.floor(wy / SUB)); if (!m) m = SM[sk];
          name = MAT[m].rim;
          const tw = half(TWP, hi, hfx, hfy, hw); if (tw > 0.02) { d -= tw * (SURF[sk] ? 10 : 6); if (d < 0) continue; }   // 朝上的面盖着顶条：土壳从顶条下面才开始
        }
        const RT = RIM_T[name] * 0.75; if (d >= RT) continue;
        const RF = RIMPXF[name]; if (!RF) continue;
        const wxm = secEdge ? 1 : smooth(0.35, 0.65, half(ANY, hi, hfx, hfy, hw));   // 横的面按 x 取列、竖的墙按 y
        const kk = RF.h / RT, ry = (1 - d / RT) * RF.h;
        texBilin(RF, wx * kk, ry); let pr = TXO[0] * wxm, pg = TXO[1] * wxm, pb = TXO[2] * wxm, pa = TXO[3] * wxm;
        if (wxm < 0.999) { texBilin(RF, wy * kk, ry); const w2 = 1 - wxm; pr += TXO[0] * w2; pg += TXO[1] * w2; pb += TXO[2] * w2; pa += TXO[3] * w2; }
        if (pa < 1) continue;
        let a = pa * Math.min(1, cov); if (a < 2) continue;
        a *= 0.55 + 0.45 * Math.max(0, 1 - d / RT) ** 0.7;   // 往里渐渐变透明，边上保留深色
        const oi = (py * IW + px) * 4; O[oi] = pr * 255 / pa; O[oi + 1] = pg * 255 / pa; O[oi + 2] = pb * 255 / pa; O[oi + 3] = a;
      }
    }
    PF.crust += performance.now() - t2; yield; const t3 = performance.now();
    if (anyTop) {   // 顶条：朝上的面贴草（地表）/ 土顶（洞里），往外伸到空气里；叠在土壳上面
      for (let py = 0; py < IH; py++) {
        const wy = Y0 - 1 + py + 0.5, myf = wy - wy0 - 0.5, iy = Math.floor(myf), fyy = myf - iy; if (iy < 0 || iy >= mh - 1) continue;
        for (let px = 0; px < IW; px++) {
          const wx = X0 - 1 + px + 0.5, mxf = wx - wx0 - 0.5, ix = Math.floor(mxf), fxx = mxf - ix; if (ix < 0 || ix >= mw - 1) continue;
          const k = iy * mw + ix, hk = (iy >> 1) * hw + (ix >> 1), sk = site[hk]; if (sk < 0 || d2[hk] > 900 || TW[sk] <= 0.02) continue;
          const hx = Math.min(hw - 2, (mxf / 2) | 0), hy = Math.min(hh - 2, (myf / 2) | 0), hfx = mxf / 2 - hx, hfy = myf / 2 - hy, hi = hy * hw + hx;
          const tw = half(TWP, hi, hfx, hfy, hw); if (tw <= 0.02) continue;
          const name = SURF[sk] ? 'e_grass' : MAT[SM[sk]].top; if (!name) continue;
          const ts = TOPSTRIP[name], RF = RIMPXF[name]; if (!RF) continue;
          const cov = half(mU, k, fxx, fyy, mw) / 255, inside = cov >= 0.5;
          let dist = half(inside ? dU : dA, k, fxx, fyy, mw);
          if (dist < 5) {
            const fv = fieldAt(FU, wx, wy), gr = gradAt(FU, wx, wy), gl = Math.hypot(gr[0], gr[1]) / (2 * SUB);
            if (gl > 1e-4) { const de = Math.abs(fv - 0.5) / gl, t = Math.max(0, (dist - 3) / 2); dist = de * (1 - t) + dist * t; }
          }
          let fade = 1;
          if (inside) { const cap = CAP[name]; if (dist > cap) continue; fade = Math.min(1, (cap - dist) / 3); }
          const rowW = ts.base * ts.s + (inside ? dist : -dist) / tw, hW = ts.h0 * ts.s; if (rowW < 0 || rowW >= hW) continue;
          texBilin(RF, wx / hW * RF.h, rowW / hW * RF.h);
          const a = TXO[3] * fade / 255; if (a < 0.008) continue;
          const oi = (py * IW + px) * 4, ib = O[oi + 3] / 255, ao = a + ib * (1 - a);   // 叠在土壳上（over）
          for (let c = 0; c < 3; c++) O[oi + c] = ((TXO[c] * 255 / TXO[3]) * a + O[oi + c] * ib * (1 - a)) / ao;
          O[oi + 3] = ao * 255;
        }
      }
    }
    // 提交：清掉旧的、铺内部、贴土壳和顶条（同一帧完成，画面不闪）
    if (tmpCv.width < IW || tmpCv.height < IH) { tmpCv.width = Math.max(IW, tmpCv.width); tmpCv.height = Math.max(IH, tmpCv.height); }
    tmpG.putImageData(img, 0, 0);
    for (const ch of targets) { if (chunks.get(ch.k) !== ch) continue; clipTo(ch, (g, cx0, cy0, x, y, w, h) => {
      g.clearRect(x - cx0, y - cy0, w, h);
      fillTex(g, pu, MAT[base].tex, x, y, cx0, cy0, w, h);
      for (const sc of sec) fillTex(g, sc.path, MAT[sc.m].tex, x, y, cx0, cy0, w, h);
      g.imageSmoothingEnabled = true; g.drawImage(tmpCv, 0, 0, IW, IH, (X0 - 1) * CQ - cx0, (Y0 - 1) * CQ - cy0, IW * CQ, IH * CQ);
    }); }
    PF.top += performance.now() - t3; statT += performance.now() - t0; statN++;
  }
  // 整块分成小片画（每帧有预算，挖到新的地方不卡顿）
  const TILE_W = 200, TILE_H = 80;
  function queueChunk(k) {
    const ch = getChunk(k); if (ch.queued) return; ch.queued = true;
    const xa = Math.floor(-OXc / CQ), xb = Math.ceil((DW - OXc) / CQ);
    for (let y = k * CH; y < (k + 1) * CH; y += TILE_H) for (let x = xa; x < xb; x += TILE_W) queue.push({ k, x0: x, y0: y, x1: Math.min(xb, x + TILE_W), y1: y + TILE_H });
  }
  function dirtyRect(x0, y0, x1, y1) {   // 世界像素；跨块时整块一次算
    const ks = []; for (let k = Math.floor(y0 / CH); k <= Math.floor((y1 - 1) / CH); k++) { const ch = chunks.get(k); if (ch && ch.queued) ks.push(k); }
    if (!ks.length) return;
    for (const it of queue) if (it.hit && it.x0 < x1 && x0 < it.x1 && it.y0 < y1 && y0 < it.y1) { it.x0 = Math.min(it.x0, x0); it.y0 = Math.min(it.y0, y0); it.x1 = Math.max(it.x1, x1); it.y1 = Math.max(it.y1, y1); it.k = Math.min(it.k, ks[0]); it.k2 = Math.max(it.k2, ks[ks.length - 1]); return; }
    queue.unshift({ k: ks[0], k2: ks[ks.length - 1], x0, y0, x1, y1, hit: true });
  }
  let job = null;   // 正在分几帧算的那一片
  function runQueue(budgetMs, mustK0, mustK1) {
    const t0 = performance.now();
    const must = it => it.hit || ((it.k2 === undefined ? it.k : it.k2) >= mustK0 && it.k <= mustK1);
    for (;;) {
      if (!job) {
        let q = queue.findIndex(must); if (q < 0) q = queue.length ? 0 : -1;
        if (q < 0) return;
        const it = queue.splice(q, 1)[0]; job = { it, gen: renderRegion(it.x0, it.y0, it.x1, it.y1) };
      }
      // 看得见却还没画的块（开局、跳到新深度）：一口气画完；其他的每帧只花预算内的时间
      const urgent = !job.it.hit && must(job.it);
      while (true) { if (job.gen.next().done) { job = null; break; } if (!urgent && performance.now() - t0 > budgetMs) return; }
      if (performance.now() - t0 > budgetMs && !queue.some(it => !it.hit && must(it))) return;
    }
  }

  /* ---------- 对外 ---------- */
  TR.init = function (game) { G = game; };
  TR.resize = function (T, OX, VW) {
    CQ = T / CELL; OXc = OX + 2; DW = VW + 4;
    buildPat(); chipCache = {}; TR.reset();
  };
  TR.reset = function () {   // 新的一趟：细网格、画布全部重来
    FR.clear(); chunks.clear(); queue.length = 0; job = null; buildProps.done = new Set(); TR.props = [];
  };
  // 格子变了（挖了一下 / 挖碎了）：重算附近细格，重画附近一块
  TR.cellChanged = function (c, r) {
    for (let rr = r - 1; rr <= r + 1; rr++) { const row = FR.get(rr); if (row) fillRow(rr, row, c - 1, c + 1); }
    const pad = 64; dirtyRect(c * CELL - pad, r * CELL - pad, (c + 1) * CELL + pad, (r + 1) * CELL + pad);
    if (G.cell(c, r).t === 0) for (const p of TR.props) if (!p.gone && p.c === c && p.r === r) p.gone = 1;   // 道具所在的那格挖碎了：道具一起没
  };
  // 每帧：保证看得见的块画好；往下预画一两块
  TR.update = function (camY, VH) {
    const y0 = camY / CQ, y1 = (camY + VH) / CQ;
    const k0 = Math.floor(y0 / CH), k1 = Math.floor(y1 / CH);
    for (let k = Math.max(0, k0); k <= k1 + 2; k++) { buildProps(k); queueChunk(k); }
    runQueue(5, Math.max(0, k0), k1);
    for (const [k] of chunks) if (k < k0 - 2 || k > k1 + 4) { chunks.delete(k); for (let i = queue.length - 1; i >= 0; i--) if (queue[i].k === k && !queue[i].hit) queue.splice(i, 1); }
  };
  TR.draw = function (ctx, camY, ox, VH) {
    const k0 = Math.floor(camY / CQ / CH), k1 = Math.floor((camY + VH) / CQ / CH);
    for (let k = Math.max(0, k0); k <= k1; k++) { const ch = chunks.get(k); if (ch) ctx.drawImage(ch.cv, ox - OXc, ch.dy0 - camY); }
  };
  TR.stats = () => ({ pf: Object.fromEntries(Object.entries(PF).map(([k, v]) => [k, Math.round(v)])), ms: statT, n: statN, avg: statN ? statT / statN : 0, queue: queue.length, chunks: chunks.size });
  TR.resetStats = () => { statT = 0; statN = 0; for (const k in PF) PF[k] = 0; };
  // 脚下地面（屏幕像素）：从逻辑上的地面往上下找真正的土面（平滑场 0.5 处），让角色踩在不规则的土上
  TR.floorAt = function (xd, yd) {
    const wx = xd / CQ, wy = yd / CQ;
    const solidAt = (x, y) => { const i = Math.floor(x / SUB), j = Math.floor(y / SUB); let s = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += (at(i + a, j + b) ? 1 : 0) * (a && b ? 1 : a || b ? 2 : 4); return s / 16; };
    let y = wy - 30, prev = solidAt(wx, y);
    if (prev >= 0.5) return yd;   // 头顶也是土：不动
    for (; y <= wy + 34; y += 2) { const v = solidAt(wx, y + 2); if (v >= 0.5) { const t = (0.5 - prev) / Math.max(1e-3, v - prev); return (y + 2 * t) * CQ; } prev = v; }
    return Math.min(yd + 34 * CQ, (wy + 34) * CQ);
  };

  /* ---------- 光源道具：放在怪物洞、守卫房的地面和墙上 ---------- */
  function buildProps(k) {
    if (buildProps.done.has(k)) return; buildProps.done.add(k);
    for (let r = k * 4; r < k * 4 + 4; r++) {
      const s = stageOf(r), st = STAGES[s], l = r - s * window.BAL.AREA;
      for (let c = 0; c < COLS; c++) {
        const cell = G.cell(c, r); if (cell.t !== 0 || r < 1) continue;
        const below = G.cell(c, r + 1);
        if ((below.t === 1 || below.t === 4) && !cell.web && !cell.mon && hash2(c, r, 3) < 0.75) {   // 怪物洞地面：蘑菇 / 水晶 / 火堆等
          const kind = st.props[(hash2(c, r, 4) * st.props.length) | 0], side = hash2(c, r, 5) < 0.5 ? -1 : 1;
          TR.props.push({ kind, c, r: r + 1, on: 'floor', x: (c + 0.5 + side * 0.3) * CELL, y: (r + 1) * CELL, ph: hash2(c, r, 6) * 10 });
        }
        if (l === window.BAL.AREA - 2 && (c === 2 || c === 4)) {   // 守卫房两侧：火把
          TR.props.push({ kind: 'fire', c: c === 2 ? 1 : 5, r, on: 'wall', x: (c === 2 ? 2 : 5) * CELL + (c === 2 ? 8 : -8), y: (r + 0.62) * CELL, ph: c, torch: true });
        }
      }
    }
  }
  buildProps.done = new Set(); TR.props = [];
  TR.drawProps = function (ctx, camY, ox, VH, time) {
    for (const p of TR.props) {
      if (p.gone) continue; const P = PROP[p.kind], im = IMG[P.img]; if (!im) continue;
      let x = p.x * CQ, y = p.y * CQ;
      if (p.on === 'floor') y = TR.floorAt(x, y) + 5 * CQ;   // 往地里埋一点
      const sy = y - camY; if (sy < -200 || sy > VH + 200) continue;
      if (P.frames) {
        const fw = im.width / P.frames, f = Math.floor(time * 12 + p.ph * 7) % P.frames, w = fw * P.s * CQ * (p.torch ? 0.75 : 1), h = im.height * P.s * CQ * (p.torch ? 0.75 : 1);
        ctx.drawImage(im, f * fw, 0, fw, im.height, Math.round(ox + x - w / 2), Math.round(sy - h), Math.round(w), Math.round(h));
      } else {
        const w = im.width * P.s * CQ, h = im.height * P.s * CQ;
        ctx.drawImage(im, Math.round(ox + x - w / 2), Math.round(sy - h), Math.round(w), Math.round(h));
      }
    }
  };

  /* ---------- 远景：洞穴剪影（灰度）× 阶段颜色，竖向视差 ---------- */
  const BG_TINT = 0.35;   // 阶段色调强度（0 = 原图颜色）
  const BGL = [['l1_wall', 0.06, 1.0], ['l2_prop01', 0.16, 0.95], ['l3_prop02', 0.28, 0.9], ['l5_crystals', 0.36, 0.85], ['l4_stones', 0.44, 0.9]];
  function stageMix(yw, key) {   // 跨阶段时颜色渐变（门那一行前后各 2 行）
    const r = yw / CELL, s = stageOf(Math.floor(r)), l = r - s * 20;
    const a = STAGES[s][key]; if (l < 18 || s >= STAGES.length - 1) return a;
    const b = STAGES[s + 1][key], t = smooth(18, 21, l); return a.map((v, i) => v + (b[i] - v) * t);
  }
  TR.drawBG = function (ctx, camY, VW, VH) {
    const gy = Math.round(-camY); if (gy >= VH) return;
    const top = Math.max(0, gy), H = VH - top;
    ctx.fillStyle = '#16304c'; ctx.fillRect(0, top, VW, H);   // dig 的洞穴底色
    BGL.forEach(([n, f, sc], li) => {
      const im = IMG[n]; if (!im) return;
      const w = VW * 1.5 * sc, h = w * im.height / im.width;
      const xs = -VW * (0.12 + 0.08 * li);
      for (let y = top - ((camY * f) % h + h) % h - (li % 2) * h * 0.45; y < VH; y += h) {
        if (y + h <= top) continue;
        if (y < top) { const cut = (top - y) / h; ctx.drawImage(im, 0, im.height * cut, im.width, im.height * (1 - cut), Math.round(xs), top, Math.round(w), Math.round(y + h - top)); }
        else ctx.drawImage(im, Math.round(xs), Math.round(y), Math.round(w), Math.round(h));
      }
    });
    const c = stageMix(camY / CQ + VH / CQ * 0.5, 'bg');
    ctx.globalCompositeOperation = 'multiply';
    const cm = Math.max(c[0], c[1], c[2]), tint = v => Math.round(255 * (1 - BG_TINT + BG_TINT * v / cm));   // 远景保留 dig 原图的颜色，阶段色只轻叠一层
    ctx.fillStyle = `rgb(${tint(c[0])},${tint(c[1])},${tint(c[2])})`; ctx.fillRect(0, top, VW, H);
    ctx.globalCompositeOperation = 'source-over';
    if (gy > 0) { const gr = ctx.createLinearGradient(0, gy, 0, gy + 60 * CQ); gr.addColorStop(0, 'rgba(10,6,18,0.6)'); gr.addColorStop(1, 'rgba(10,6,18,0)'); ctx.fillStyle = gr; ctx.fillRect(0, gy, VW, 60 * CQ); }
  };

  /* ---------- 光照：环境光 + 点光源在空气里传播（被土挡住），乘整个画面 ---------- */
  const LS = 20;   // 光照图一格 = 20 世界像素
  const lightCv = document.createElement('canvas'), lightG = lightCv.getContext('2d');
  let LW = 0, LH = 0, LI = null, LA = null;
  const glowCache = {};
  function glowTex(c) {   // 带颜色的柔光（加亮用）
    const key = c.map(v => Math.round(v * 20)).join(','); if (glowCache[key]) return glowCache[key];
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0},0.55)`); gr.addColorStop(0.4, `rgba(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0},0.18)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return (glowCache[key] = cv);
  }
  TR.drawLight = function (ctx, camY, ox, VW, VH, lights, time) {
    const wy0 = Math.floor(camY / CQ / LS) - 1, wx0 = Math.floor(-OXc / CQ / LS) - 1;
    const W = Math.ceil(DW / CQ / LS) + 3, H = Math.ceil(VH / CQ / LS) + 3;
    if (W !== LW || H !== LH) { LW = W; LH = H; lightCv.width = W; lightCv.height = H; LI = lightG.createImageData(W, H); LA = new Float32Array(W * H * 3); }
    const solid = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const wx = (wx0 + x + 0.5) * LS, wy = (wy0 + y + 0.5) * LS; solid[y * W + x] = wy > 0 && at(Math.floor(wx / SUB), Math.floor(wy / SUB)) ? 1 : 0; }
    // 环境光：地表附近是天光，往下按阶段
    for (let y = 0; y < H; y++) {
      const wy = (wy0 + y + 0.5) * LS, a = stageMix(Math.max(0, wy), 'amb'), sky = 1 - smooth(-20, 260, wy);
      const lv = a[3] + (1 - a[3]) * sky;
      for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; LA[i] = (a[0] * (1 - sky) + sky) * lv; LA[i + 1] = (a[1] * (1 - sky) + sky) * lv; LA[i + 2] = (a[2] * (1 - sky) + sky) * lv; }
    }
    // 点光源：按直线距离衰减，光线穿过的土越多越暗（土挡光）
    for (const L of lights) {
      const lx = L.x / LS - wx0, ly = L.y / LS - wy0, R = L.r / LS;
      if (lx < -R || ly < -R || lx >= W + R || ly >= H + R) continue;
      const fl = L.flicker ? 0.9 + 0.1 * Math.sin(time * 9 + L.x) : 1;
      const xa = Math.max(0, Math.floor(lx - R)), xb = Math.min(W - 1, Math.ceil(lx + R)), ya = Math.max(0, Math.floor(ly - R)), yb = Math.min(H - 1, Math.ceil(ly + R));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
        const dx = x + 0.5 - lx, dy = y + 0.5 - ly, d = Math.hypot(dx, dy); if (d >= R) continue;
        let occ = 0; const n = Math.ceil(d * 1.5);
        for (let q = 1; q < n; q++) { const t = q / n; if (solid[Math.floor(ly + dy * t) * W + Math.floor(lx + dx * t)]) occ++; }
        const t = 1 - d / R, v = L.k * t * t * fl * Math.pow(0.5, occ / 1.5), i = (y * W + x) * 3;
        LA[i] += L.c[0] * v; LA[i + 1] += L.c[1] * v; LA[i + 2] += L.c[2] * v;
      }
    }
    const D = LI.data;
    for (let i = 0; i < W * H; i++) { D[i * 4] = Math.min(255, LA[i * 3] * 255); D[i * 4 + 1] = Math.min(255, LA[i * 3 + 1] * 255); D[i * 4 + 2] = Math.min(255, LA[i * 3 + 2] * 255); D[i * 4 + 3] = 255; }
    lightG.putImageData(LI, 0, 0);
    const s = LS * CQ;
    ctx.globalCompositeOperation = 'multiply'; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lightCv, 0.5, 0.5, W - 1, H - 1, Math.round(ox + (wx0 + 0.5) * s), Math.round((wy0 + 0.5) * s - camY), Math.round((W - 1) * s), Math.round((H - 1) * s));
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lights) {   // 光源本身的柔光（淡，不抢角色）
      if (!L.glow) continue; const r = L.glow * CQ, sx = ox + L.x * CQ, sy = L.y * CQ - camY; if (sy < -r || sy > VH + r) continue;
      ctx.globalAlpha = L.glowA || 0.6; ctx.drawImage(glowTex(L.c), Math.round(sx - r), Math.round(sy - r), Math.round(r * 2), Math.round(r * 2));
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };
  TR.propLights = function (time) {
    const out = [];
    for (const p of TR.props) { if (p.gone) continue; const P = PROP[p.kind]; out.push({ x: p.x, y: p.y - (p.on === 'floor' ? 18 : 10), r: P.r, k: P.k, c: P.c, flicker: p.kind === 'fire', glow: p.kind === 'fire' ? 70 : 46, glowA: 0.5 }); }
    return out;
  };
  /* ---------- 碎土块：这格材质的贴图剪成不规则小块，外圈描一道它土壳最深的颜色 ---------- */
  let chipCache = {};
  function rimDark(name) { const R = RIMPXF[name]; if (!R) return 'rgba(40,20,10,0.9)'; const i = ((R.h - 1) * R.w + (R.w >> 1)) * 4, a = Math.max(1, R.f[i + 3]); return `rgb(${R.f[i] * 255 / a | 0},${R.f[i + 1] * 255 / a | 0},${R.f[i + 2] * 255 / a | 0})`; }
  TR.chip = function (c, r, v) {
    const m = cellMat(c, r) || 1 + stageOf(r), key = m + '_' + v;
    if (chipCache[key]) return chipCache[key];
    const P = PAT[MAT[m].tex]; if (!P) return null;
    const z = Math.max(8, Math.round(15 * CQ)), cv = document.createElement('canvas'); cv.width = cv.height = z; const g = cv.getContext('2d');
    g.beginPath(); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + hash2(v, i, 9) * 0.5, rr = z * (0.28 + 0.18 * hash2(i, v, m)); g.lineTo(z / 2 + Math.cos(a) * rr, z / 2 + Math.sin(a) * rr); } g.closePath();
    g.save(); g.clip(); g.drawImage(P.c, -Math.floor(hash2(v, m, 1) * (P.c.width - z)), -Math.floor(hash2(v, m, 2) * (P.c.height - z))); g.restore();
    g.lineWidth = Math.max(1.2, CQ * 1.4); g.strokeStyle = rimDark(MAT[m].rim); g.stroke();
    return (chipCache[key] = cv);
  };
  TR.CQ = () => CQ;
  TR.stageName = s => STAGES[s].name;
})();
