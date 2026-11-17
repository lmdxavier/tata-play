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
    { name: '表土', body: 'dirt', rim: 'e_dirtrim', top: 'e_dirttop', spur: 'basalt', spurRim: 'e_gate', noise: [0.22, 46, 0], bg: [0.62, 0.86, 1.15], amb: [1.0, 0.96, 0.9, 0.9], ambEnd: 0.8, props: ['mushroom', 'crystal2'] },
    // v0.21 区域 2 沙岩（美术线）：自己的贴图 / 土壳 / 顶条（Simple Sidescroll map18_02、map06_06、map07_05，tools/build_terrain.py --area2）；
    //   起伏横向拉长 2.6 倍 + 软台阶（层状沉积、风蚀圆滑，不尖棱）；远景用自己的一套（bgSet: 's2'，map07 琥珀洞穴，不再叠阶段色）；
    //   环境光暖琥珀、比区域 1 暗一档；光源 = 火把 + 琥珀色晶簇，其余洞底放沙堆 / 碎石 / 风化岩块（deco，不发光）
    { name: '沙岩', body: 'sstone2', rim: 'e_sstone', top: 'e_sstop', spur: 'basalt2', spurRim: 'e_gate', noise: [0.2, 64, 0, 2.6, 0.55], bg: [1.15, 0.92, 0.62], bgSet: 's2', bgTint: 0, amb: [1.0, 0.84, 0.62, 0.76], props: ['fire', 'amber', 'amber'], propP: 0.4, deco: ['mound', 'pebbles', 'spireL', 'spireR', 'pebbles'], decoP: 0.7, room: ['mound', 'pebbles'] },
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
  const GATE = 21, NST = STAGES.length;   // NST：1..NST 是各区域的土
  const RIM_T = { e_dirtrim: 22, e_rock: 18, e_sand: 14, e_sstone: 16, e_bed: 20, e_moss: 22, e_ice: 18, e_teal: 22, e_grey: 18, e_ruin: 20, e_gate: 18 };
  const TOPSTRIP = { e_grass: { s: 0.26, base: 156, h0: 220 }, e_dirttop: { s: 0.34, base: 52, h0: 113 }, e_mosstop: { s: 0.34, base: 52, h0: 113 }, e_sstop: { s: 0.17, base: 214, h0: 300 } };   // e_sstop：沙岩台面（沙堆 + 碎石往上伸）
  const TEX_S = 0.5;   // 内部贴图：1 素材像素 = 0.5 世界像素（和 dig 一样）

  // 光源道具（素材来自 dig）：c = 光的颜色，k = 强度，r = 照多远（世界像素）
  const PROP = {
    fire:     { img: 'flame_loop', frames: 7, s: 0.42, c: [1.0, 0.62, 0.3], k: 1.1, r: 260 },
    mushroom: { img: 'mushrooms', s: 0.3, c: [1.0, 0.9, 0.45], k: 0.8, r: 190 },
    crystal:  { img: 'crystal_big', s: 0.13, c: [0.55, 1.0, 0.4], k: 0.85, r: 200 },
    crystal2: { img: 'crystal_small', s: 0.18, c: [0.55, 1.0, 0.4], k: 0.5, r: 130 },
    ice:      { img: 'Ice_Flower_05', s: 0.62, c: [0.45, 0.85, 1.0], k: 0.6, r: 160 },
    amber:    { img: 'crystal_amber2', s: 0.09, c: [1.0, 0.7, 0.32], k: 0.45, r: 120, glowA: 0.32 },   // v0.21 区域 2：琥珀色晶簇（比区域 1 的水晶弱）
    // 不发光的装饰（k = 0）：区域 2 洞底的沙堆、碎石、风化岩块（Simple Sidescroll map07_05 / map13_04、05）
    mound:    { img: 's2_mound', s: 0.17, k: 0 },
    pebbles:  { img: 's2_pebbles', s: 0.2, k: 0 },
    spireL:   { img: 's2_spireL', s: 0.2, k: 0 },
    spireR:   { img: 's2_spireR', s: 0.2, k: 0 },
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
    // fixR（review 8）：能挖的守卫门（hp / max 只在守卫打败后才有）也按剩余血量往里凹；锁着的门没有 hp，不受影响
    if (k.hp < k.max) { const q = Math.max(0, k.hp / k.max); return TH + 0.1 + (1 - TH - 0.1) * Math.pow(q, 0.85); }
    return 1;
  }
  function cellMat(c, r) {
    if (r < 0) return 0;
    const s = stageOf(r);
    if (c < 0 || c >= COLS) return 1 + s;
    const t = G.cell(c, r).t;
    return t === 0 ? 0 : t === 2 ? 11 + s : t === 3 ? GATE : 1 + s;
  }
  // v0.20 行缓存：噪声只和行号有关（永久缓存）；材质在“这一趟还没挖过附近”时和上一趟完全一样（按格子签名核对后直接拷贝），新一趟开始不用重算
  const NZ = new Map(), PM = new Map(), DIRTY = new Set();   // NZ：r → 噪声；PM：r → { sig, m } 没挖过时的材质；DIRTY：这一趟改过的格子行
  function cellsSig(r0, r1) {   // 格子行 r0..r1（含左右墙）的材质 + 剩余血量 → 字符串签名
    let h = ''; for (let r = r0; r <= r1; r++) for (let c = 0; c < COLS; c++) { if (r < 0) continue; const k = G.cell(c, r); h += k.t + (k.max && k.hp < k.max ? ':' + Math.round(k.hp / k.max * 64) : '') + ','; }
    return h;
  }
  const nearDirty = (r0, r1) => { if (!DIRTY.size) return false; for (let r = r0; r <= r1; r++) if (DIRTY.has(r)) return true; return false; };
  function makeRow(r) {
    const N = NS * NXF; let z = NZ.get(r);
    if (!z) { z = makeNoise(r); NZ.set(r, z); }
    const row = { m: new Uint8Array(N), n: z.n, wx: z.wx, wy: z.wy }, clean = !nearDirty(r - 1, r + 1), sig = clean ? cellsSig(r - 1, r + 1) : null, pm = PM.get(r);
    FR.set(r, row);
    if (clean && pm && pm.sig === sig) row.m.set(pm.m);
    else { fillRow(r, row, -2, COLS + 1); if (clean) PM.set(r, { sig, m: row.m.slice() }); }
    return row;
  }
  // 一个阶段的起伏值。noise = [幅度, 尺度, 尖棱, 横向拉长, 台阶]：横向拉长 > 1 = 起伏横着走（层状沉积）；台阶 0..1 = 软台阶的比重（v0.21 沙岩）
  function stageNoise(s, x, y) {
    const [A, L, ridge, ax = 1, strata = 0] = STAGES[s].noise;
    let v = fbm(x / (L * ax), y / L, 11 + s) * 2 - 1;
    if (ridge) v = (1 - Math.abs(v) * 2) * 0.9 + (vnoise(x / 9, y / 9, 5) - 0.5) * 0.25;   // 尖棱：岩石、冰
    if (strata) { const q = (v + 1) * 2.5, f = q - Math.floor(q); v = v * (1 - strata) + ((Math.floor(q) + sm(smooth(0.3, 0.7, f))) / 2.5 - 1) * strata; }   // 软台阶：一层层的平台，台阶边是圆滑的坡
    return v * A;
  }
  function makeNoise(r) {
    const N = NS * NXF, n = new Float32Array(N), wx = new Int8Array(N), wy = new Int8Array(N);
    const AR = window.BAL.AREA, s = stageOf(r), b = Math.round(r / AR) * AR;   // b：最近的区域交界（行）
    const sA = stageOf(b - 1), sB = stageOf(b), blend = b > 0 && sA !== sB && Math.abs(r + 0.5 - b) < 2.5;   // v0.21：交界前后各 2 行起伏渐变（以前在交界处一刀切换，开门后洞壁有一道横向错位）
    for (let j = 0; j < NS; j++) for (let i = 0; i < NXF; i++) {
      const x = (IC0 + i + 0.5) * SUB, y = (r * NS + j + 0.5) * SUB, q = j * NXF + i;
      let v;
      if (blend) { const t = smooth(b - 1.5, b + 1.5, y / CELL); v = stageNoise(sA, x, y) * (1 - t) + stageNoise(sB, x, y) * t; }
      else v = stageNoise(s, x, y);
      if (y < 70) v *= 0.25 + 0.75 * smooth(10, 70, y);                        // 地表平缓
      n[q] = v;
      wx[q] = Math.round((fbm(x / 34, y / 34, 31) - 0.5) * 60); wy[q] = Math.round((fbm(x / 34, y / 34, 47) - 0.5) * 60);
    }
    return { n, wx, wy };
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
    await Promise.all([...new Set(Object.values(BGSETS).flat().map(l => l[0]))].map(async n => { IMG[n] = await load('assets/bg/' + n + '.png?v=3'); }));
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
  function contour(F, path, th = 0.5) {   // th：等值线取哪一档（< 0.5 = 往外扩一点）
    const { f, Nx, i0, j0, ni, nj } = F;
    const v = (i, j) => f[(j + 1) * Nx + i + 1];
    for (let j = -1; j <= nj; j++) {
      let run = -99;
      for (let i = -1; i <= ni + 1; i++) {
        const full = i <= ni && v(i, j) >= th && v(i + 1, j) >= th && v(i + 1, j + 1) >= th && v(i, j + 1) >= th;
        if (full) { if (run === -99) run = i; continue; }
        if (run !== -99) { path.rect((i0 + run + 0.5) * SUB, (j0 + j + 0.5) * SUB, (i - run) * SUB, SUB); run = -99; }
        if (i > ni) continue;
        const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], val = c.map(([a, b]) => v(a, b));
        if (val.every(q => q < th)) continue;
        const pts = [];
        for (let k = 0; k < 4; k++) {
          const a = val[k], b = val[(k + 1) & 3], pa = c[k], pb = c[(k + 1) & 3];
          if (a >= th) pts.push((i0 + pa[0] + 0.5) * SUB, (j0 + pa[1] + 0.5) * SUB);
          if ((a >= th) !== (b >= th)) { const t = (th - a) / (b - a); pts.push((i0 + pa[0] + 0.5 + (pb[0] - pa[0]) * t) * SUB, (j0 + pa[1] + 0.5 + (pb[1] - pa[1]) * t) * SUB); }
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
  // v0.20 画布块（从根上修“新一趟开头看到上一趟的洞”和越玩越卡）：
  //   · 没挖过的块画完后存成“原样画布”（PRI，按格子签名核对），新一趟 / 回到这块直接引用，不重画、不重新上传纹理；
  //   · 第一次往原样块里画（挖了一下）时才从池里拿一张自己的画布拷一份再改（写时复制），原样画布永远不被改；
  //   · 自己的画布用完还回池子（清空后再用），多余的宽高设 0 释放显存——不再每块 new 一张、旧的留给垃圾回收；
  //   · 块里还有没画完的小片（pend > 0）时不画到屏幕上：宁可这一帧不显示，也不显示旧内容。
  const chunks = new Map();   // k → { k, cv, g, dy0, dy1, own, pend, ready }
  const queue = [];           // 待重画区域 { k, x0, y0, x1, y1 }（世界像素）
  const PRI = new Map(), POOL = [];   // PRI：k → { cv, sig } 没挖过的原样画布；POOL：空闲画布
  const chunkDy = k => Math.round(k * CH * CQ);
  const chunkSig = k => cellsSig(k * 4 - 2, k * 4 + 5);   // 一块（4 行）的画面取决于上下各多 2 行的格子
  function takeCanvas(w, h) {
    const cv = POOL.pop() || document.createElement('canvas');
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }   // 改宽高会清空
    else { const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); }
    cv.__drFull = true;   // 整张都换了：下次上屏整张上传（pixi-ctx 的局部上传只给挖掘重画用）
    return cv;
  }
  function giveCanvas(cv) { if (POOL.length < 4) POOL.push(cv); else { cv.width = 0; cv.height = 0; } }   // 宽高设 0：pixi-ctx 随之释放这张纹理
  // v0.20 tfix（review 建议-4 画布内存随深度涨）：原样画布最多留 PRI_MAX 张（超了先丢最深的），小镇 / 下矿落地要用的前 PIN 块永远留着；
  //   回到小镇（TR.trim）只留这几块和 1 张空闲画布。一张 dpr3 的块画布约 3.2MB。
  const PRI_MAX = 10, PIN = 3;
  const inUse = cv => { for (const ch of chunks.values()) if (ch.cv === cv) return true; for (const f of FADE) if (f.cv === cv) return true; return false; };
  function priEvict(k) { const P = PRI.get(k); if (!P) return; PRI.delete(k); if (!inUse(P.cv)) { P.cv.width = 0; P.cv.height = 0; } else P.cv.__orphan = true; }
  function priCap() { if (PRI.size <= PRI_MAX) return; for (const k of [...PRI.keys()].sort((a, b) => b - a)) { if (PRI.size <= PRI_MAX) break; if (k > PIN) priEvict(k); } }   // 先丢最深的：浅的块回地面镜头和下一趟开头都要用
  TR.trim = function () { for (const k of [...PRI.keys()]) if (k > PIN) priEvict(k); while (POOL.length > 1) { const cv = POOL.pop(); cv.width = 0; cv.height = 0; } };
  function own(ch) {   // 写之前：原样画布 → 自己的副本
    if (ch.own) return;
    const cv = takeCanvas(DW, ch.dy1 - ch.dy0), g = cv.getContext('2d');
    if (ch.cv) g.drawImage(ch.cv, 0, 0);
    ch.cv = cv; ch.g = g; ch.own = true;
  }
  function dropChunk(ch) {
    if (ch.own && ch.cv) giveCanvas(ch.cv);
    else if (ch.cv && ch.cv.__orphan && !inUse(ch.cv)) { ch.cv.width = 0; ch.cv.height = 0; }   // 引用的原样画布已被淘汰：没人用了就释放
    ch.cv = ch.g = null; ch.own = false; chunks.delete(ch.k);
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].ch === ch) queue.splice(i, 1);
    if (job && job.it.ch === ch) job = null;
  }
  function getChunk(k) {
    let ch = chunks.get(k);
    if (!ch) { ch = { k, dy0: chunkDy(k), dy1: chunkDy(k + 1), cv: null, g: null, own: false, pend: 0, ready: false }; chunks.set(k, ch); }
    return ch;
  }
  // 用贴图铺满路径：按路径裁剪，再按世界坐标整像素铺（跨块无缝）
  function fillTex(g, clips, key, dx0, dy0, cx0, cy0, w, h) {   // clips：一条或几条路径（几条 = 取交集）
    const P = PAT[key]; if (!P) return;
    g.save(); g.setTransform(CQ, 0, 0, CQ, -cx0, -cy0); for (const c of clips) g.clip(c); g.setTransform(1, 0, 0, 1, 0, 0);
    const pw = P.ww * CQ, ph = P.wh * CQ;
    const i0 = Math.floor(dx0 / pw), i1 = Math.floor((dx0 + w) / pw), j0 = Math.floor(dy0 / ph), j1 = Math.floor((dy0 + h) / ph);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = Math.round(i * pw), y = Math.round(j * ph), x2 = Math.round((i + 1) * pw), y2 = Math.round((j + 1) * ph);
      g.drawImage(P.c, x - cx0, y - cy0, x2 - x, y2 - y);
    }
    g.restore();
  }
  const DIL = 0.25;   // 多材质时每种材质自己的平滑场取 0.25 等值线（比 0.5 往外扩约 2 世界像素，交界处下面那层是实心）
  const MP = 32;   // 距离场在重画区域四周多算的余量（世界像素）：土壳 + 往外伸的顶条
  let statT = 0, statN = 0; const PF = { fill: 0, dist: 0, crust: 0, top: 0 }, ST = { cpu: 0, hitN: 0, hitLat: 0, hitLatMax: 0 };   // ST：地形重画的纯 CPU 时间、挖一下到画面更新的延迟
  const half = (a, i, fx, fy, stride) => (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + stride] * (1 - fx) + a[i + stride + 1] * fx) * fy;
  const CAP = { e_grass: 12, e_dirttop: 8, e_mosstop: 8, e_sstop: 9 };
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
      const cx0 = -OXc, cy0 = ch.dy0, x0 = Math.max(DX0, cx0), x1 = Math.min(DX1, cx0 + DW), y0 = Math.max(DY0, ch.dy0), y1 = Math.min(DY1, ch.dy1);
      if (x1 <= x0 || y1 <= y0) return;
      own(ch); const g = ch.g;
      g.setTransform(1, 0, 0, 1, 0, 0); g.save(); g.beginPath(); g.rect(x0 - cx0, y0 - cy0, x1 - x0, y1 - y0); g.clip(); fn(g, cx0, cy0, x0, y0, x1 - x0, y1 - y0); g.restore();
      const cv = ch.cv, d = cv.__dr; if (d) { d[0] = Math.min(d[0], x0 - cx0); d[1] = Math.min(d[1], y0 - cy0); d[2] = Math.max(d[2], x1 - cx0); d[3] = Math.max(d[3], y1 - cy0); } else cv.__dr = [x0 - cx0, y0 - cy0, x1 - cx0, y1 - cy0];   // v0.20 tfix：记下改了哪块，WebGL 下只上传这一块（texSubImage2D）
    };
    // 1) 内部：先按最多的材质铺满所有实心，再按其他材质铺
    const cnt = new Map();
    for (let j = j0; j < j0 + nj; j++) for (let i = i0; i < i0 + ni; i++) { const m = at(i, j); if (m) cnt.set(m, (cnt.get(m) || 0) + 1); }
    if (!cnt.size) { for (const ch of targets) clipTo(ch, (g, cx0, cy0, x, y, w, h) => g.clearRect(x - cx0, y - cy0, w, h)); return; }
    // v0.21 fixR：画面不能取决于重画区域里有哪些材质（以前“底色 = 区域里编号最小的材质、铺满整个实心”，
    //   区域里有区域 1 的土时，区域 2 土 / 守卫门的交界抗锯齿缝里会透出区域 1 的土；没有时透出的是区域 2 的土）。
    //   现在每种材质 m 按编号从小到大（全局固定顺序）铺，裁剪 = 「m 自己的平滑场往外扩一点（DIL 等值线）」∩「编号 ≥ m 的所有实心（0.5 等值线）」：
    //   · 往编号大的材质里多铺约 2 世界像素 → 交界 X < Y 处 X 是实心，Y 的抗锯齿边（就在真实交界上）整条落在 X 上：结果 = X·(1−c) + Y·c；
    //   · 朝空气、朝编号小的材质那边仍是真实边界（不出彩边）；不在附近的材质这块是空的、画不画都一样 → 每个像素只取决于附近的格子。
    //   土壳：区域的土（1..NST）一律按“到空气的距离”走普通分支；叉 / 门（> NST）沿自己整圈边界画边。
    const mats = [...cnt.keys()].sort((a, b) => a - b);
    const FU = fieldBlock(i0, j0, ni, nj, m => m > 0), pu = new Path2D(); contour(FU, pu);
    const fills = [], sec = []; let low = null;
    for (const m of mats) {
      if (mats.length === 1) { fills.push({ m, clips: [pu] }); if (m > NST) sec.push({ m, path: pu, rim: MAT[m].rim }); continue; }
      const Fm = fieldBlock(i0, j0, ni, nj, q => q === m), pl = new Path2D();
      if (m === mats[0]) { contour(Fm, pl, DIL); low = Float32Array.from(Fm.f); }
      else {   // 场里直接取交集（一条路径一次裁剪）：min(自己往外扩, 不进编号更小的材质)；场是“是不是这种材质”的加权平均、可以相加 → 编号更小的场 = 前面几种的和（low）
        const hf = new Float32Array(Fm.f.length);
        for (let q = 0; q < hf.length; q++) { hf[q] = Math.min(Fm.f[q] + 0.5 - DIL, 1 - low[q]); low[q] += Fm.f[q]; }
        contour(Object.assign({}, Fm, { f: hf }), pl);
      }
      fills.push({ m, clips: [pl] });
      if (m > NST) { const pe = new Path2D(); contour(Fm, pe); sec.push({ m, path: pe, rim: MAT[m].rim }); }   // 叉 / 门的土壳按自己 0.5 的真实边界
    }
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
      let m = at(Math.floor((wx - nx * 3) / SUB), Math.floor((wy - ny * 3) / SUB)); if (!m) m = at(Math.floor((wx - nx * 7) / SUB), Math.floor((wy - ny * 7) / SUB)); if (!m) m = 1 + stageOf(Math.floor(wy / CELL));
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
        if (si) { const sc = sec[si - 1]; name = sc.rim; const ds = half(sc.d, k, fxx, fyy, mw); if (ds < d) { d = ds; secEdge = true; } }   // 叉 / 门沿自己整圈边界画边；两个区域的土相接不画土壳（土永远不进 sec）
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
      for (const fl of fills) fillTex(g, fl.clips, MAT[fl.m].tex, x, y, cx0, cy0, w, h);
      if (fills.length > 1) { g.save(); g.globalCompositeOperation = 'destination-in'; g.setTransform(CQ, 0, 0, CQ, -cx0, -cy0); g.fillStyle = '#fff'; g.fill(pu); g.restore(); }   // 朝空气那边多铺的裁掉：外形 = 所有实心的轮廓
      g.imageSmoothingEnabled = true; g.drawImage(tmpCv, 0, 0, IW, IH, (X0 - 1) * CQ - cx0, (Y0 - 1) * CQ - cy0, IW * CQ, IH * CQ);
    }); }
    PF.top += performance.now() - t3; statT += performance.now() - t0; statN++;
  }
  // 整块分成小片画（每帧有预算，挖到新的地方不卡顿）
  const TILE_W = 200, TILE_H = 80;
  function queueChunk(k) {
    const ch = getChunk(k); if (ch.queued) return; ch.queued = true;
    const P = PRI.get(k);
    if (P && !nearDirty(k * 4 - 2, k * 4 + 5) && P.sig === chunkSig(k)) { PRI.delete(k); PRI.set(k, P); ch.cv = P.cv; ch.g = null; ch.own = false; ch.ready = true; return; }   // 和原样一样：直接用，不重画（挪到最近用过）
    ch.cv = takeCanvas(DW, ch.dy1 - ch.dy0); ch.g = ch.cv.getContext('2d'); ch.own = true; ch.ready = false;
    const xa = Math.floor(-OXc / CQ), xb = Math.ceil((DW - OXc) / CQ);
    for (let y = k * CH; y < (k + 1) * CH; y += TILE_H) for (let x = xa; x < xb; x += TILE_W) { queue.push({ k, ch, x0: x, y0: y, x1: Math.min(xb, x + TILE_W), y1: y + TILE_H }); ch.pend++; }
  }
  function tileDone(ch) {   // 一块的小片全画完：可以上屏；这一趟还没挖过附近 → 存成原样画布（之后不再改它）
    if (--ch.pend > 0 || chunks.get(ch.k) !== ch) return;
    ch.ready = true;
    if (!nearDirty(ch.k * 4 - 2, ch.k * 4 + 5) && !queue.some(it => it.hit && it.k <= ch.k && (it.k2 === undefined ? it.k : it.k2) >= ch.k)) {
      const old = PRI.get(ch.k); if (old && old.cv !== ch.cv) { old.cv.width = 0; old.cv.height = 0; }
      PRI.delete(ch.k); PRI.set(ch.k, { cv: ch.cv, sig: chunkSig(ch.k) }); ch.own = false; ch.g = null; priCap();
    }
  }
  function dirtyRect(x0, y0, x1, y1) {   // 世界像素；跨块时整块一次算
    const ks = []; for (let k = Math.floor(y0 / CH); k <= Math.floor((y1 - 1) / CH); k++) { const ch = chunks.get(k); if (ch && ch.queued) ks.push(k); }   // 还没建的块以后建时直接按新格子画
    if (!ks.length) return;
    for (const it of queue) if (it.hit && it.x0 < x1 && x0 < it.x1 && it.y0 < y1 && y0 < it.y1) { it.x0 = Math.min(it.x0, x0); it.y0 = Math.min(it.y0, y0); it.x1 = Math.max(it.x1, x1); it.y1 = Math.max(it.y1, y1); it.k = Math.min(it.k, ks[0]); it.k2 = Math.max(it.k2, ks[ks.length - 1]); return; }
    queue.unshift({ k: ks[0], k2: ks[ks.length - 1], x0, y0, x1, y1, hit: true, t0: performance.now() });
  }
  let job = null;   // 正在分几帧算的那一片
  function runQueue(budgetMs, mustK0, mustK1) {
    const t0 = performance.now();
    const vis = it => (it.k2 === undefined ? it.k : it.k2) >= mustK0 && it.k <= mustK1;
    const must = it => it.hit || vis(it);
    // v0.20：正在分帧画的是预画（看不见的块），而现在有挖掘重画或看得见的块在等 → 先把预画放回队尾重来（它第一步算的形状可能已过期），不让它挡在前面
    if (job && !must(job.it) && queue.some(must)) { queue.push(job.it); job = null; }
    for (;;) {
      if (!job) {
        let q = queue.findIndex(must); if (q < 0) q = queue.length ? 0 : -1;
        if (q < 0) return;
        const it = queue.splice(q, 1)[0]; job = { it, gen: renderRegion(it.x0, it.y0, it.x1, it.y1) };
      }
      // 看得见却还没画的块（开局、跳到新深度）和看得见的挖掘重画：一口气画完；其他的每帧只花预算内的时间
      // v0.20 tfix（review 一般-3）：看得见的挖掘重画也当帧画完（原来给 12ms、慢机上要分 3–8 帧，洞比主角晚出现 0.2–1.4 秒）。只重画被挖那格附近一小块，上传也只传这一块
      const urgent = must(job.it) && (!job.it.hit || vis(job.it)), bud = budgetMs;
      while (true) { const ts = performance.now(), dn = job.gen.next().done; ST.cpu += performance.now() - ts; if (dn) { const it = job.it; job = null; if (it.hit) { const l = performance.now() - it.t0; ST.hitN++; ST.hitLat += l; ST.hitLatMax = Math.max(ST.hitLatMax, l); } else if (it.ch) tileDone(it.ch); break; } if (!urgent && performance.now() - t0 > bud) return; }
      if (performance.now() - t0 > budgetMs && !queue.some(vis)) return;
    }
  }

  /* ---------- 对外 ---------- */
  TR.init = function (game) { G = game; };
  TR.resize = function (T, OX, VW) {
    CQ = T / CELL; OXc = OX + 2; DW = VW + 4;
    buildPat(); chipCache = {}; TR.reset();
    for (const f of FADE) giveCanvas(f.cv); FADE.length = 0;
    for (const P of PRI.values()) { P.cv.width = 0; P.cv.height = 0; } PRI.clear(); for (const cv of POOL) { cv.width = 0; cv.height = 0; } POOL.length = 0;   // 清晰度变了：原样画布全部作废
  };
  const FADE = [];   // 回地面跳出洞口时：上一趟挖过的块叠在新地形上淡出（土填回去），{ cv, dy0, a }
  TR.reset = function (fade) {   // 新的一趟：细网格、画布全部重来；fade = 挖过的块淡出而不是一下消失
    for (const f of FADE) giveCanvas(f.cv); FADE.length = 0;
    for (const ch of [...chunks.values()]) { if (fade && ch.own && ch.ready && ch.cv) { FADE.push({ cv: ch.cv, dy0: ch.dy0, a: 1 }); ch.own = false; } dropChunk(ch); }
    FR.clear(); DIRTY.clear(); SPAN.clear(); LVER++; chunks.clear(); queue.length = 0; job = null; buildProps.done = new Set(); TR.props = [];
  };
  // 格子变了（挖了一下 / 挖碎了）：重算附近细格，重画附近一块
  TR.cellChanged = function (c, r) {
    DIRTY.add(r); spanDirty(r); LVER++;
    for (const p of TR.props) if (p.fv && Math.abs(p.r - r) <= 3) p.fv = 0;   // fixR：只让附近的道具重新取地表（原来每挖一下所有看得见的道具都重算 5 次 floorAt，Canvas 2D 下 7–13ms）
    for (let rr = r - 1; rr <= r + 1; rr++) { const row = FR.get(rr); if (row) fillRow(rr, row, c - 1, c + 1); }
    const pad = 64; dirtyRect(c * CELL - pad, r * CELL - pad, (c + 1) * CELL + pad, (r + 1) * CELL + pad);
    if (G.cell(c, r).t === 0) for (const p of TR.props) if (!p.gone && p.c === c && p.r === r) p.gone = 1;   // 道具所在的那格挖碎了：道具一起没
  };
  // v0.20 tfix（review 一般-2 开局 / 第一次下矿一帧长卡）：加载画面还在时，把小镇视角和下矿落地视角要用的块一口气画好（存成原样画布），开局和第一次下矿不再现画
  TR.prewarm = function (cams, VH) {
    for (const cy of cams) { const k0 = Math.max(0, Math.floor(cy / CQ / CH)), k1 = Math.floor((cy + VH) / CQ / CH); for (let k = k0; k <= k1 + 1; k++) { buildProps(k); queueChunk(k); } }
    const t0 = performance.now(); while ((queue.length || job) && performance.now() - t0 < 4000) runQueue(1e9, 0, 1e9);
  };
  // 每帧：保证看得见的块画好；往下预画一两块
  TR.update = function (camY, VH, keepY) {   // keepY（屏幕像素，世界坐标）：回地面镜头会经过的最深处；比它深、又离开视野的“挖过的块”直接丢（v0.20 tfix：回地面不再一路经过最深处）
    const y0 = camY / CQ, y1 = (camY + VH) / CQ;
    const k0 = Math.floor(y0 / CH), k1 = Math.floor(y1 / CH);
    for (let k = Math.max(0, k0); k <= k1 + 2; k++) { buildProps(k); queueChunk(k); }
    runQueue(5, Math.max(0, k0), k1);
    // 离开视野的块：原样块（引用，不占自己的画布）和没画完的块直接丢；这一趟挖过的块留着（一个区域最多 13 块），回地面时镜头一路经过不用重画，超过 16 块才丢最远的
    let nOwn = 0; for (const ch of chunks.values()) if (ch.own) nOwn++;
    const kKeep = keepY === undefined ? 1e9 : Math.floor(keepY / CQ / CH);
    for (const ch of [...chunks.values()]) { const k = ch.k; if (k >= k0 - 2 && k <= k1 + 4) continue; if (!ch.own || !ch.ready || nOwn > 16 || k > kKeep) { if (ch.own) nOwn--; dropChunk(ch); } }
  };
  TR.draw = function (ctx, camY, ox, VH) {
    const k0 = Math.floor(camY / CQ / CH), k1 = Math.floor((camY + VH) / CQ / CH);
    for (let k = Math.max(0, k0); k <= k1; k++) { const ch = chunks.get(k); if (ch && ch.ready && ch.cv) ctx.drawImage(ch.cv, ox - OXc, ch.dy0 - camY); }
    for (const f of FADE) { if (f.dy0 - camY > VH || f.dy0 + f.cv.height - camY < 0) continue; ctx.globalAlpha = f.a * f.a; ctx.drawImage(f.cv, ox - OXc, f.dy0 - camY); ctx.globalAlpha = 1; }
  };
  TR.fadeStep = function (dt, dur) { for (let i = FADE.length - 1; i >= 0; i--) { const f = FADE[i]; f.a -= dt / dur; if (f.a <= 0) { giveCanvas(f.cv); FADE.splice(i, 1); } } };
  TR.stats = () => ({ pf: Object.fromEntries(Object.entries(PF).map(([k, v]) => [k, Math.round(v)])), ms: statT, n: statN, avg: statN ? statT / statN : 0, queue: queue.length, chunks: chunks.size, cpu: ST.cpu, hitN: ST.hitN, hitLat: ST.hitN ? ST.hitLat / ST.hitN : 0, hitLatMax: ST.hitLatMax, props: TR.props.length, pri: PRI.size, pool: POOL.length, own: [...chunks.values()].filter(c => c.own).length });
  TR.resetStats = () => { statT = 0; statN = 0; for (const k in PF) PF[k] = 0; for (const k in ST) ST[k] = 0; };
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
  // fixR（review 6）：地面道具横向收进这一行实际空出的范围（左右各留 PW_M 世界像素给土壳），放不下就不放——以前偏向一侧时会伸进洞壁、被洞口边切一刀
  const PW_M = 12;
  function fitX(kind, c, r, x) {
    const P = PROP[kind], im = IMG[P.img]; if (!im) return x;
    const hw = (P.frames ? im.width / P.frames : im.width) * P.s * 0.5;
    let c0 = c, c1 = c; while (c0 > 0 && G.cell(c0 - 1, r).t === 0) c0--; while (c1 < COLS - 1 && G.cell(c1 + 1, r).t === 0) c1++;
    const a = c0 * CELL + PW_M + hw, b = (c1 + 1) * CELL - PW_M - hw;
    return a > b ? null : Math.max(a, Math.min(b, x));
  }
  function buildProps(k) {
    if (buildProps.done.has(k)) return; buildProps.done.add(k);
    for (let r = k * 4; r < k * 4 + 4; r++) {
      const s = stageOf(r), st = STAGES[s], l = r - s * window.BAL.AREA;
      for (let c = 0; c < COLS; c++) {
        const cell = G.cell(c, r); if (cell.t !== 0 || r < 1) continue;
        const below = G.cell(c, r + 1);
        const floor = (below.t === 1 || below.t === 4) && !cell.web && !cell.mon, side = hash2(c, r, 5) < 0.5 ? -1 : 1;
        if (floor && hash2(c, r, 3) < (st.propP || 0.75)) {   // 怪物洞地面：蘑菇 / 水晶 / 火堆等（发光）
          const kind = st.props[(hash2(c, r, 4) * st.props.length) | 0], x = fitX(kind, c, r, (c + 0.5 + side * 0.3) * CELL);
          if (x !== null) TR.props.push({ kind, c, r: r + 1, on: 'floor', x, y: (r + 1) * CELL, ph: hash2(c, r, 6) * 10 });
        } else if (floor && st.deco && hash2(c, r, 7) < st.decoP && l < window.BAL.AREA - 3) {   // v0.21：没放光源的洞底放这个区域的装饰（沙堆 / 碎石 / 风化岩块），偏向格子一侧，不挡格子中间站人的位置
          const kind = st.deco[(hash2(c, r, 8) * st.deco.length) | 0], x = fitX(kind, c, r, (c + 0.5 + side * 0.24) * CELL);
          if (x !== null) TR.props.push({ kind, c, r: r + 1, on: 'floor', x, y: (r + 1) * CELL, ph: 0 });
        }
        if (l === window.BAL.AREA - 2) {   // 守卫房两侧：火把挂在左右墙上（v0.21：按这一行实际空出的范围找墙，区域 2 的房间 5 格宽）
          let c0 = c, c1 = c; while (c0 > 0 && G.cell(c0 - 1, r).t === 0) c0--; while (c1 < COLS - 1 && G.cell(c1 + 1, r).t === 0) c1++;
          if (c === c0 || c === c1) {
            const L = c === c0;
            TR.props.push({ kind: 'fire', c: L ? c0 - 1 : c1 + 1, r, on: 'wall', x: (L ? c0 : c1 + 1) * CELL + (L ? 8 : -8), y: (r + 0.62) * CELL, ph: c, torch: true });
            if (st.room) {   // 守卫房地面两角按区域换装饰（区域 2：沙堆），站在守卫门上
              const kind = st.room[L ? 0 : 1];
              TR.props.push({ kind, c, r: r + 1, on: 'floor', x: (c + (L ? 0.36 : 0.64)) * CELL, y: (r + 1) * CELL, ph: 0, room: true });
            }
          }
        }
      }
    }
  }
  buildProps.done = new Set(); TR.props = [];
  TR.drawProps = function (ctx, camY, ox, VH, time) {
    for (const p of TR.props) {
      if (p.gone) continue; const P = PROP[p.kind], im = IMG[P.img]; if (!im) continue;
      let x = p.x * CQ, y = p.y * CQ;
      if (y - camY < -260 || y - camY > VH + 260) continue;   // v0.20：先按大致位置剔掉屏幕外的（原来每个道具每帧都先算一次 floorAt，道具随深度越积越多）
      if (p.on === 'floor') {   // 往地里埋一点。v0.21：按道具底边宽度（±0.42 宽）取的真实地表、5 个点里最低的那个（底边每一处都踩在土上，不悬空），按地形版本缓存（不再每帧算 floorAt）
        if (!p.fv || p.fq !== CQ) { const hw = (P.frames ? im.width / P.frames : im.width) * P.s * CQ * (p.torch ? 0.75 : 1) * 0.42; let f = -1e9; for (const k of [-1, -0.5, 0, 0.5, 1]) f = Math.max(f, TR.floorAt(x + hw * k, y)); p.fy = f / CQ; p.fv = 1; p.fq = CQ; p.hw = hw / CQ; }
        y = p.fy * CQ + 5 * CQ;
      }
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
  // [图, 视差, 宽度比例, 镜像平铺]：l1_wall 上暗下亮的渐变、l4_stones 上透明下实心，首尾直接相接会出一道水平硬边（v0.20 review 一般-5，每 5.3 格一道）→ 每隔一张上下翻转（接缝两边是同一行像素）
  // v0.21：每个区域可以有自己的一套远景（STAGES[s].bgSet，默认 cave = dig 的洞穴 5 层）。第一层必须不透明（盖满）。
  //   s2 = 区域 2 沙岩：map07 琥珀洞穴的洞壁（镜像平铺）/ 暗色岩台 / 沙台 / 光柱（光柱层两端已淡出、上下透明，直接平铺），4 层（不超过区域 1 的 5 层）
  const BGSETS = {
    cave: [['l1_wall', 0.06, 1.0, 1, 0.25], ['l2_prop01', 0.16, 0.95, 0], ['l3_prop02', 0.28, 0.9, 0], ['l5_crystals', 0.36, 0.85, 0], ['l4_stones', 0.44, 0.9, 1]],
    s2: [['s2_wall', 0.06, 1.0, 1, 0.8], ['s2_shelf', 0.16, 0.95, 0, 0.7], ['s2_ledge', 0.28, 0.9, 0, 0.8], ['s2_rays', 0.36, 0.85, 0, 0.5]],
  };
  // 第 5 项 = 存成画布时的清晰度（默认 1）：两套远景同屏（区域交界）时显存 / 画布缓存要装下两套。实测 Canvas 2D（软件渲染）两套原尺寸约 41MB 时
  //   超出缓存、远景每帧 0.2 → 3.5ms，压到约 30MB 就恢复。l1_wall 是纯渐变（1/4 清晰度看不出差别），区域 2 的洞壁 / 岩台 / 沙台本来就柔和
  const BGK = {}; for (const L of Object.values(BGSETS)) for (const l of L) BGK[l[0]] = l[4] || 1;
  const bgSetOf = s => STAGES[s].bgSet || 'cave';
  const BGM = {};   // 镜像平铺用的“原图 + 上下翻转”两张拼成一张（加载后做一次）
  // v0.21：每层都先画进一张画布（按 BGK 缩放，镜像层上下拼两份），远景只从这些画布取图
  //   fixR：画布宽不超过这一层在屏幕上实际画出的宽（bgW，随屏幕宽变，resize 时重建）。Canvas 2D 下交界处两套远景同屏时缓存装不下、
  //   地形层 draw 每帧 9–10ms（只画一套时 < 0.5ms），按屏幕大小存后两套合计约少 1/3。
  let BGVW = 0;
  const bgW = (li, sc) => BGVW * 1.5 * sc;   // 和 drawSet 里的层宽同一个式子（v0.20 的大小：层高、竖向平铺的相位都和 v0.20 一样）
  function bgImg(n, mir, li, sc) {
    const im = IMG[n]; if (!im) return im; if (BGM[n]) return BGM[n];
    const K = Math.min(BGK[n] || 1, BGVW ? Math.ceil(bgW(li, sc)) / im.width : 1), w = Math.round(im.width * K), h = Math.round(im.height * K), c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(im, 0, 0, w, h);   // 镜像层不再存“原图 + 翻转”两份，画的时候翻（省一半）
    return (BGM[n] = c);
  }
  // 跨区域时渐变：交界（第 AREA×k 行）到后 3 行（区域 1→2 = 50–53 米；守卫房和守卫门保持本区域的样子，v0.21 合并时定）。
  //   v0.21 修：原来按每阶段 20 行写死（l = r − s×20），区域改成 50 行后，区域 1 的 21–49 米其实一直用的是区域 2 的远景色和环境光
  function mixT(r) {   // → [上一区域, 下一区域, 渐变 0..1]；不在交界附近时两个相同
    const AR = window.BAL.AREA, b = Math.round(r / AR) * AR, sA = stageOf(b - 1), sB = stageOf(b);
    if (b <= 0 || sA === sB || r < b || r > b + 3) { const s0 = stageOf(Math.floor(r)); return [s0, s0, 0]; }
    return [sA, sB, smooth(b, b + 3, r)];
  }
  // fixR（review 4）：ambEnd = 这个区域最底一行的环境光强度；区域内从 amb[3] 按深度线性降到 ambEnd（越往下越暗，深处主角光圈看得出）
  function stageVal(s, key, r) {
    const st = STAGES[s], a = st[key]; if (key !== 'amb' || st.ambEnd === undefined) return a;
    const AR = window.BAL.AREA, f = Math.max(0, Math.min(1, (r - s * AR) / (AR - 1)));
    return [a[0], a[1], a[2], a[3] + (st.ambEnd - a[3]) * f];
  }
  function stageMix(yw, key) {
    const r = yw / CELL, [sA, sB, t] = mixT(r), a = stageVal(sA, key, r); if (!t) return a;
    const b = stageVal(sB, key, r); return a.map((v, i) => v + (b[i] - v) * t);
  }
  // v0.20 tfix（review 严重-1 过度绘制）：远景只画在看得见的空腔里。原来每帧先整屏 #16304c、再 5 层整屏远景、再整屏 multiply 色调（7 屏），
  //   而屏幕大部分被不透明的土挡住。现在按细网格算出每一横条（5 细格 = 20 世界像素高）里有空气的列，左右上下各多留 2 细格（8 世界像素，
  //   等值线 / 抗锯齿的余量，矩形边一定落在土的下面），只在这些矩形里画；按行缓存，挖到哪行才重算附近几行。
  //   画布块还没画好的那几行、震屏时画布块没盖到的屏幕边，照旧整条画（和原来一样露远景）。
  const SPAN = new Map(), SPM = 2, BAND = 5;   // SPAN：格子行 r → 世界像素矩形 [x0,y0,x1,y1]
  function rowSpans(r) {
    let s = SPAN.get(r); if (s) return s; s = [];
    const air = new Uint8Array(NXF); let prev = null;
    for (let b = 0; b < NS; b += BAND) {
      air.fill(0);
      for (let j = r * NS + b - SPM; j < r * NS + b + BAND + SPM; j++) {
        const rr = Math.floor(j / NS); if (rr < 0) { air.fill(1); break; }
        const row = FR.get(rr) || makeRow(rr), o = (j - rr * NS) * NXF, m = row.m;
        for (let i = 0; i < NXF; i++) if (!m[o + i]) air[i] = 1;
      }
      const y0 = (r * NS + b) * SUB, y1 = y0 + BAND * SUB, runs = []; let st = -1;
      for (let i = 0; i <= NXF; i++) {
        let open = 0; if (i < NXF) for (let d = -SPM; d <= SPM; d++) { const q = i + d; if (q >= 0 && q < NXF && air[q]) { open = 1; break; } }
        if (open && st < 0) st = i; else if (!open && st >= 0) { runs.push((IC0 + st) * SUB, (IC0 + i) * SUB); st = -1; }
      }
      if (prev && prev.runs.length === runs.length && prev.runs.every((v, k) => v === runs[k])) { for (const R of prev.rects) R[3] = y1; }   // 和上一条一样宽：并成一个高矩形
      else { prev = { runs, rects: [] }; for (let k = 0; k < runs.length; k += 2) prev.rects.push([runs[k], y0, runs[k + 1], y1]); s.push(...prev.rects); }
    }
    SPAN.set(r, s); return s;
  }
  const spanDirty = r => { for (let q = r - 2; q <= r + 2; q++) SPAN.delete(q); };
  // 一套远景画进一个屏幕矩形 R：阶段 s 的那一套（bgSet）、透明度 alpha；色调（bgTint，默认 BG_TINT；独立的一套写 0 = 原图颜色）WebGL 下精灵着色，Canvas 2D 下由 tintSet 另画
  function nextEdge(r) {   // r 之后下一个交界渐变区的边（行）
    const AR = window.BAL.AREA, b0 = Math.floor(r / AR) * AR; let e = Infinity;
    for (const b of [b0, b0 + AR]) for (const q of [b, b + 3]) if (b > 0 && q > r && q < e) e = q;
    return e;
  }
  function setTint(s, cMix) {   // 阶段 s 远景的色调 [r, g, b]（0..255）
    const st = STAGES[s], k = st.bgTint === undefined ? BG_TINT : st.bgTint, c = cMix || st.bg, cm = Math.max(c[0], c[1], c[2]), tint = v => Math.round(255 * (1 - k + k * v / cm));   // 远景保留原图的颜色，阶段色只轻叠一层
    return [tint(c[0]), tint(c[1]), tint(c[2])];
  }
  function tintSet(ctx, s, alpha, R, cMix) {   // Canvas 2D：multiply 盖一层色调。半透明（交界渐变）时会把下面那套也乘一点点色——只在交界 7 行里、而且独立的一套 bgTint = 0 不乘
    const [tr, tg, tb] = setTint(s, cMix); if (tr === 255 && tg === 255 && tb === 255) return;
    ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgb(${tr},${tg},${tb})`; ctx.fillRect(R[0], R[1], R[2] - R[0], R[3] - R[1]); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function drawSet(ctx, s, alpha, R, camY, VW, top, gpu, cMix) {
    if (gpu) { const [tr, tg, tb] = setTint(s, cMix); ctx.__tint = (tr << 16) | (tg << 8) | tb; }
    if (alpha < 1) ctx.globalAlpha = alpha;
    // 一个矩形画完全部层（第一层不透明，矩形重叠处等于重画一遍，结果不变）
    BGSETS[bgSetOf(s)].forEach(([n, f, sc, mir], li) => {
      if (VW !== BGVW) { BGVW = VW; for (const k in BGM) { BGM[k].width = 0; delete BGM[k]; } }
      const im0 = IMG[n]; if (!im0) return; const im = bgImg(n, mir, li, sc);
      const w = bgW(li, sc), h = w * im0.height / im0.width, th = mir ? h * 2 : h, X0 = Math.max(Math.round(-VW * (0.12 + 0.08 * li)), Math.round(VW + 2 - w)), X1 = Math.round(X0 + w);   // 右边要盖到屏幕边（原来最后一层只到 0.91 屏宽、露竖直硬边）：fixR 改成把层往右挪，不再放大层（放大会改变层高和竖向相位，区域 1 守卫房一带远景变空，review 3）
      const xa = Math.max(R[0], X0), xb = Math.min(R[2], X1); if (xb <= xa) return;
      const kx = im.width / (X1 - X0);
      for (let y = top - ((camY * f) % th + th) % th - (li % 2) * h * 0.45; y < R[3]; y += th) {
        const Y0 = Math.round(y), Ym = Math.round(y + h), ya = Math.max(R[1], Y0), yb = Math.min(R[3], Ym);
        if (yb > ya) { const ky = im.height / (Ym - Y0); ctx.drawImage(im, (xa - X0) * kx, (ya - Y0) * ky, (xb - xa) * kx, (yb - ya) * ky, xa, ya, xb - xa, yb - ya); }
        if (!mir) continue;
        const Y1 = Math.round(y + th), fa = Math.max(R[1], Ym), fb = Math.min(R[3], Y1); if (fb <= fa) continue;   // 下半段：上下翻转（屏幕 d 行 = 图的 (Y1 − d) 行）
        const ky = im.height / (Y1 - Ym);
        ctx.save(); ctx.translate(0, fa + fb); ctx.scale(1, -1); ctx.drawImage(im, (xa - X0) * kx, (Y1 - fb) * ky, (xb - xa) * kx, (fb - fa) * ky, xa, fa, xb - xa, fb - fa); ctx.restore();
      }
    });
    ctx.globalAlpha = 1;
  }
  TR.legacyBG = false;   // 测试开关：true = 原来的整屏画法（同一帧前后对比用）
  const BGR = [];        // 本帧要画远景的屏幕矩形
  TR.drawBG = function (ctx, camY, VW, VH, ox) {
    const gy = Math.round(-camY); if (gy >= VH) return;
    const top = Math.max(0, gy), H = VH - top;
    if (ox === undefined) ox = OXc - 2;
    BGR.length = 0;
    if (TR.legacyBG) BGR.push([0, top, VW, VH]);
    else {
      const k0 = Math.max(0, Math.floor(camY / CQ / CH)), k1 = Math.floor((camY + VH) / CQ / CH);
      for (let k = k0; k <= k1; k++) {
        const ch = chunks.get(k), ya = Math.max(top, Math.round(k * CH * CQ) - camY), yb = Math.min(VH, Math.round((k + 1) * CH * CQ) - camY); if (yb <= ya) continue;
        if (!(ch && ch.ready && ch.cv)) { BGR.push([0, ya, VW, yb]); continue; }   // 这块还没上屏：整条露远景（原来就是这样）
        for (let r = k * 4; r < k * 4 + 4; r++) for (const q of rowSpans(r)) {
          const y0 = Math.max(ya, Math.round(q[1] * CQ) - camY), y1 = Math.min(yb, Math.round(q[3] * CQ) - camY), x0 = Math.max(0, Math.round(ox + q[0] * CQ)), x1 = Math.min(VW, Math.round(ox + q[2] * CQ));
          if (y1 > y0 && x1 > x0) BGR.push([x0, y0, x1, y1]);
        }
      }
      // 上下相接、左右边差不超过 2 细格的矩形并成一个（取外框）：一条竖井只剩一两个矩形，精灵数不涨
      const tol = Math.ceil(SPM * SUB * CQ); let n = 0;
      for (const R of BGR) {
        let hit = null; for (let q = 0; q < n; q++) { const O = BGR[q]; if (O[3] === R[1] && Math.abs(O[0] - R[0]) <= tol && Math.abs(O[2] - R[2]) <= tol) { hit = O; break; } }
        if (hit) { hit[0] = Math.min(hit[0], R[0]); hit[2] = Math.max(hit[2], R[2]); hit[3] = R[3]; } else BGR[n++] = R;
      }
      BGR.length = n;
      const cx0 = ox - OXc, cx1 = cx0 + DW;   // 震屏时画布块左右没盖到的屏幕边
      if (cx0 > 0) BGR.push([0, top, Math.min(VW, Math.ceil(cx0) + 1), VH]);
      if (cx1 < VW) BGR.push([Math.max(0, Math.floor(cx1) - 1), top, VW, VH]);
    }
    TR.bgArea = 0; for (const R of BGR) TR.bgArea += (R[2] - R[0]) * (R[3] - R[1]); TR.bgRects = BGR.length;
    const gpu = !TR.legacyBG && '__tint' in ctx;   // WebGL：每张远景精灵直接乘阶段色（Pixi tint），和画完再整屏 multiply 结果相同（“盖上去”对颜色是线性的），省掉一屏混合
    // 区域交界（前 5 行到后 2 行）里两套远景不同：先画上一区域的整套，再按渐变比例盖下一区域的整套（只在这 7 行里多画一套）。
    //   渐变比例按每个空腔矩形的中心取（空腔之间隔着土，看不出台阶）；高过 2 行的矩形（竖井）按 1 行一段切开。
    //   不切成细横条：细条每条边上远景图会采样到邻近像素，交界处出现一道道横线（v0.21 自查发现）
    const rowPx = CELL * CQ;
    //   Canvas 2D 下先画完所有不透明的那一套（含 multiply 色调），最后再画半透明盖上去的那一套：multiply 和半透明交替画会让画布反复刷新（软件渲染下交界处远景从 0.2ms 涨到 4.7ms）
    const J0 = [], J1 = [];   // [阶段, 透明度, 矩形, 混合色调]：J0 不透明、J1 半透明（交界里下一区域那套）
    const paint = (S, r) => {
      const [sA, sB, t] = mixT(r);
      if (sA === sB) J0.push([sA, 1, S]);
      else if (bgSetOf(sA) === bgSetOf(sB)) J0.push([sA, 1, S, STAGES[sA].bg.map((v, i) => v + (STAGES[sB].bg[i] - v) * t)]);   // 同一套远景：只画一次，色调渐变（和原来一样）
      else if (t >= 0.997) J0.push([sB, 1, S]);
      else { J0.push([sA, 1, S]); if (t > 0.003) J1.push([sB, t, S]); }
    };
    for (const R of BGR) {
      const ra = (R[1] + camY) / rowPx, rb = (R[3] + camY) / rowPx, mA = mixT(ra), mB = mixT(rb);
      if (mA[0] === mA[1] && mB[0] === mB[1] && mA[0] === mB[0] && nextEdge(ra) >= rb) { J0.push([mA[0], 1, R]); continue; }
      if (rb - ra <= 2) { paint(R, (ra + rb) / 2); continue; }
      for (let r = ra; r < rb;) { const re = Math.min(rb, Math.floor(r + 1e-6) + 1), yi = Math.round(r * rowPx - camY), yo = Math.round(re * rowPx - camY); if (yo > yi) paint([R[0], yi, R[2], yo], (r + re) / 2); r = re; }
    }
    for (const J of [J0, J1]) {
      for (const [s, a, S, cm] of J) drawSet(ctx, s, a, S, camY, VW, top, gpu, cm);   // WebGL：层 + 色调一起（精灵着色）
      if (!gpu) for (const [s, a, S, cm] of J) tintSet(ctx, s, a, S, cm);                    // Canvas 2D：这一批的 multiply 色调放在一起画
    }
    if (gpu) ctx.__tint = 0xffffff;
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
  // v0.20 tfix：光照图只在内容变了时重算、重画（WebGL 下画布改了才重新上传）：键 = 光照图在世界里的格子位置 + 地形版本 + 每个光源（含火光闪烁值）。
  //   站着不动、镜头没跨格时不再每帧算 2000 格遮挡、不再每帧上传。最上面整行都是 255（地面以上的天光）的部分乘了等于没乘，不画。
  let LVER = 1, LKEY = '', LTOP = 0;
  TR.lightStats = { calc: 0, skip: 0 };
  TR.drawLight = function (ctx, camY, ox, VW, VH, lights, time) {
    const wy0 = Math.floor(camY / CQ / LS) - 1, wx0 = Math.floor(-OXc / CQ / LS) - 1;
    const W = Math.ceil(DW / CQ / LS) + 3, H = Math.ceil(VH / CQ / LS) + 3;
    let key = wy0 + ',' + wx0 + ',' + W + ',' + H + ',' + LVER;
    const FL = [];
    for (const L of lights) {
      const lx = L.x / LS - wx0, ly = L.y / LS - wy0, R = L.r / LS;
      if (lx < -R || ly < -R || lx >= W + R || ly >= H + R) { FL.push(-1); continue; }
      const fl = L.flicker ? 0.9 + 0.1 * Math.sin(time * 9 + L.x) : 1; FL.push(fl);
      key += '|' + L.x + ',' + L.y + ',' + L.r + ',' + L.k + ',' + L.c + ',' + fl;
    }
    if (key !== LKEY || W !== LW || H !== LH || TR.legacyBG) {
      LKEY = key; TR.lightStats.calc++;
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
      lights.forEach((L, li) => {
        const fl = FL[li]; if (fl < 0) return;
        const lx = L.x / LS - wx0, ly = L.y / LS - wy0, R = L.r / LS;
        const xa = Math.max(0, Math.floor(lx - R)), xb = Math.min(W - 1, Math.ceil(lx + R)), ya = Math.max(0, Math.floor(ly - R)), yb = Math.min(H - 1, Math.ceil(ly + R));
        for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
          const dx = x + 0.5 - lx, dy = y + 0.5 - ly, d = Math.hypot(dx, dy); if (d >= R) continue;
          let occ = 0; const n = Math.ceil(d * 1.5);
          for (let q = 1; q < n; q++) { const t = q / n; if (solid[Math.floor(ly + dy * t) * W + Math.floor(lx + dx * t)]) occ++; }
          const t = 1 - d / R, v = L.k * t * t * fl * Math.pow(0.5, occ / 1.5), i = (y * W + x) * 3;
          LA[i] += L.c[0] * v; LA[i + 1] += L.c[1] * v; LA[i + 2] += L.c[2] * v;
        }
      });
      const D = LI.data; LTOP = H;
      for (let i = 0; i < W * H; i++) { D[i * 4] = Math.min(255, LA[i * 3] * 255); D[i * 4 + 1] = Math.min(255, LA[i * 3 + 1] * 255); D[i * 4 + 2] = Math.min(255, LA[i * 3 + 2] * 255); D[i * 4 + 3] = 255; if (LTOP === H && (D[i * 4] < 255 || D[i * 4 + 1] < 255 || D[i * 4 + 2] < 255)) LTOP = (i / W) | 0; }
      lightG.putImageData(LI, 0, 0);
    } else TR.lightStats.skip++;
    const s = LS * CQ, DX = Math.round(ox + (wx0 + 0.5) * s), DY = Math.round((wy0 + 0.5) * s - camY), DWl = Math.round((W - 1) * s), DHl = Math.round((H - 1) * s);
    ctx.globalCompositeOperation = 'multiply'; ctx.imageSmoothingEnabled = true;
    const t0 = TR.legacyBG ? 0 : Math.max(0, LTOP - 1);   // 从第一行不是纯白的前一行开始画（双线性插值的邻居也包含进来）
    if (t0 < H - 1) { const ky = DHl / (H - 1), sy = 0.5 + t0; ctx.drawImage(lightCv, 0.5, sy, W - 1, H - 0.5 - sy, DX, DY + t0 * ky, DWl, (H - 0.5 - sy) * ky); }
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lights) {   // 光源本身的柔光（淡，不抢角色）
      if (!L.glow) continue; const r = L.glow * CQ, sx = ox + L.x * CQ, sy = L.y * CQ - camY; if (sy < -r || sy > VH + r) continue;
      ctx.globalAlpha = L.glowA || 0.6; ctx.drawImage(glowTex(L.c), Math.round(sx - r), Math.round(sy - r), Math.round(r * 2), Math.round(r * 2));
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };
  TR.propBox = p => p.fy === undefined ? null : { x0: p.x - p.hw, x1: p.x + p.hw, y: p.fy + 5 };   // 测试用（落地检查）：地面道具底边（世界像素）
  TR.propLights = function (time) {
    const out = [];
    for (const p of TR.props) { if (p.gone) continue; const P = PROP[p.kind]; if (!P.k) continue; out.push({ x: p.x, y: p.y - (p.on === 'floor' ? 18 : 10), r: P.r, k: P.k, c: P.c, flicker: p.kind === 'fire', glow: p.kind === 'fire' ? 70 : 46, glowA: P.glowA || 0.5 }); }   // k = 0 的装饰不发光
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
