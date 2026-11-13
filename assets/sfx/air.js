/* sfxgen v2.0 · 线 C · 气流：挥动 swing / 通用嗖 whoosh（第二轮修订）
 * 发声原理：物体划过空气，尾迹里周期性脱落涡旋（卡门涡街），形成宽带"气动噪声"；细杆/刀刃在速度合适时还会出现
 *   风鸣音（Aeolian tone，同样来自涡旋脱落，频率 f ≈ St·v/d，St≈0.2）。声功率随速度高次方增长（偶极子声源 P∝v^6）。
 * 系数来自语料实测（tool/C/swing_fit.py，84 段 = 14 个物理挥动录音文件 × 各 6 段：
 *   竹棍×3/竹鞭×2/羽毛球拍×2（SWSH），毛巾/快速挥动×4/低·中噪声嗖×2（WHSH））：
 *   - 物体类型定基准峰频（文件中位）：细竹棍/鞭 615–1200Hz（族中位 820），羽毛球拍 380–440，快速挥动 320–485，毛巾 260。
 *     注意：跨文件"时长越短越亮"(r=−0.79) 主要是物体之间的差异；同一文件内 r=−0.10（斜率 −0.37，90% 区间 −0.85…+0.02，几乎不成立）。
 *     所以本版：武器 → 物体类型（细/中/宽）定基准峰频；速度 → 峰频只用很弱的斜率 f∝v^0.37（同文件内拟合值，不确定性大；
 *     斯特劳哈尔理论值是 f∝v），不再同时用"时长律"和"厚度修正"两次计算粗细。
 *   - 峰位在全程 43%（上升略短于下降）。
 *   - 细物体（竹棍/鞭）：峰下 +12dB/oct、峰上 −14dB/oct 的鼓包；宽物体（毛巾/布/宽板）：峰以下平坦、峰上 −10dB/oct。
 *   - 几乎所有真录音在 <150Hz 都有低频气流冲击（峰值时刻能量占比中位：竹棍 0.23、快速挥动 0.66）。
 *   - 原声 28 段的电平与谱心相关中位 −0.06：没有稳定的"响度与频率一起扫弧线"；物理挥动录音里也没有稳定的风鸣音调线，whistle 只作设计项（默认 0）。
 */
(function () {
  'use strict';
  const S = globalThis.SFX2, SR = S.SR;

  // ---------- 小工具（magic.js 也会在运行时调用 SFX2.air.*） ----------
  // 时变带通/低通/高通噪声：白噪 → 一串滤波器（每段 {type,f:t=>Hz,q}）
  function filtNoise(L, R, chain) {
    let x = new Float64Array(L); for (let i = 0; i < L; i++) x[i] = R() * 2 - 1;
    for (const c of chain) x = S.biquad(x, c.type, c.f, c.q || 0.707, c.g);
    return x;
  }
  const normRms = x => { const r = S.rms(x) || 1; for (let i = 0; i < x.length; i++) x[i] /= r; return x; };
  // 缓慢随机起伏（对数增益），截止 fc Hz，标准差 sd；用于湍流的轻微粗糙感
  function wobble(L, R, fc, sd) {
    const step = 64, n = Math.ceil(L / step) + 2, a = Math.exp(-2 * Math.PI * fc * step / SR), v = new Float64Array(n);
    let z = 0; for (let i = 0; i < n; i++) { z = a * z + (1 - a) * R.g(); v[i] = z; }
    let s = 0; for (let i = 0; i < n; i++) s += v[i] * v[i]; const k = sd / (Math.sqrt(s / n) || 1);
    for (let i = 0; i < n; i++) v[i] = Math.exp(k * v[i]);   // 先在控制点上取指数，再线性插值（省掉逐采样 exp）
    const g = new Float64Array(L); for (let i = 0; i < L; i++) { const p = i / step, j = p | 0, w = p - j; g[i] = v[j] * (1 - w) + v[j + 1] * w; }
    return g;
  }
  // 跨文件的"时长↔峰频"关系（fpk≈171·T^-0.53，r=−0.65/文件层面 −0.79）主要反映物体之间的差异，同一物体内几乎不成立。
  // 保留函数只为兼容旧调用；本线代码已不再用它推算频率。
  const fpkLaw = T => 171 * Math.pow(Math.max(0.03, T), -0.526);
  // 零相位平滑包络归一：把噪声层的短时 RMS 拉平（τ 秒），去掉窄带噪声自身的随机起伏，
  // 让响度峰稳定落在设计的出手时刻（第一轮 <95Hz 低频层在 20ms 窗里随机起伏，重武器的响度峰随机跳动 ±100ms）
  function flatten(x, tau) {
    const L = x.length, a = Math.exp(-1 / (tau * SR)), e = new Float64Array(L); let z = 0, m = 0;
    for (let n = 0; n < L; n++) m += x[n] * x[n]; m = m / Math.max(1, L) + 1e-20; z = m;
    for (let n = 0; n < L; n++) { z = a * z + (1 - a) * x[n] * x[n]; e[n] = z; }
    z = m; for (let n = L - 1; n >= 0; n--) { z = a * z + (1 - a) * e[n]; e[n] = z; }
    for (let n = 0; n < L; n++) x[n] /= Math.sqrt(e[n] + m * 1e-4);
    return x;
  }
  S.air = { filtNoise, normRms, wobble, fpkLaw, flatten };

  // ---------- 武器物理参数 ----------
  // T0：中速(0.6)/中号(0.5)时的 -20dB 时长（设计换算）；f0：中速中号时的峰频（Hz）= 武器映射到实测物体类型的基准峰频（设计映射，锚点是文件中位）：
  //   细竹棍族中位 820（细竹棍 1198、竹鞭高 900、竹棍 615）、竹棍 Airy 533、羽毛球拍 383–441、快速挥动 316–485、毛巾 261
  // thin：细物体(鼓包谱)↔宽物体(平坦谱)；lf：峰值时刻 <150Hz 能量占比（实测范围 0.01–1.0，按物体类型取）；dop：掠过耳边的多普勒深度
  const W = {
    dagger: { T0: 0.075, f0: 950, thin: 1.0, lf: 0.15, dop: 1.0, name: '匕首', cls: '细（似细竹棍/竹鞭高）' },
    sword: { T0: 0.11, f0: 820, thin: 0.95, lf: 0.25, dop: 1.0, name: '单手剑', cls: '细（竹棍族中位）' },
    greatsword: { T0: 0.21, f0: 500, thin: 0.8, lf: 0.5, dop: 0.9, name: '大剑', cls: '细↔中（竹棍 Airy 与球拍之间）' },
    axe: { T0: 0.17, f0: 420, thin: 0.5, lf: 0.5, dop: 0.8, name: '斧', cls: '中（似羽毛球拍）' },
    hammer: { T0: 0.25, f0: 330, thin: 0.15, lf: 0.7, dop: 0.6, name: '锤', cls: '宽（似快速挥动）' },
    spear: { T0: 0.09, f0: 700, thin: 0.85, lf: 0.2, dop: 0.4, name: '长枪（刺）', cls: '细' },
    staff: { T0: 0.16, f0: 615, thin: 0.7, lf: 0.35, dop: 0.8, name: '法杖/棍', cls: '细（似竹棍）' },
    fist: { T0: 0.07, f0: 280, thin: 0.25, lf: 0.35, dop: 0.5, name: '拳', cls: '宽（似毛巾）' }
  };
  const WOPT = Object.keys(W).map(k => [k, W[k].name]);
  const LEAD_MAX = 0.2;   // 音头到"刀最快"时刻最长 0.2s（试验场 gongji 出手在 0.333s，前导不能比它长）
  const PX = 1.25;   // 电平曲线 -20·u^PX（设计形状；第一轮 1.6 的峰顶太平，20ms 窗的峰值位置容易被噪声起伏带偏，1.25 更尖）
  const EXT = Math.pow(2.5, 1 / PX);   // 从 -20dB 外推到 -50dB 的倍数

  // 一道"气流弧线"：给定 -20dB 时长 T、峰位比例、峰频、细/宽、低频占比、多普勒、粗糙度 → 波形
  // 速度曲线 v(t) 由电平曲线反推（电平 = 60·log10 v，即振幅 ∝ v^3）；中心频率 ∝ v^beta × 多普勒
  // P.rise/P.fall（可选）直接给上升/下降的 -20dB 时长（swing 用它限制前导长度）
  function arc(R, P) {
    const { T, peakFrac, fpk, thin, lf, beta, dop, rough, air } = P;
    const rise = P.rise || T * peakFrac, fall = P.fall || T * (1 - peakFrac), p = P.px || 1.6;
    const ext = Math.pow(2.5, 1 / p), t0 = rise * ext, tEnd = t0 + fall * ext, L = Math.round(tEnd * SR);
    const dB = t => { const u = t < t0 ? (t0 - t) / rise : (t - t0) / fall; return -20 * Math.pow(u, p); };
    const v = t => Math.pow(10, Math.max(-60, dB(t)) / 60);
    const dp = t => Math.pow(2, -0.12 * dop * Math.tanh(1.5 * (t - t0) / Math.max(0.01, (rise + fall) / 2)));
    const fc = t => S.clamp(fpk * Math.pow(v(t), beta) * dp(t), 60, 16000);
    // 各噪声层先拉平短时 RMS（低频层 25ms，其余 8ms），响度完全由设计包络决定
    const A = thin > 0.02 ? normRms(flatten(filtNoise(L, R, [{ type: 'bp', f: fc, q: 0.9 }, { type: 'bp', f: fc, q: 0.9 }]), 0.008)) : null;
    const B = thin < 0.98 ? normRms(flatten(filtNoise(L, R, [{ type: 'lp', f: t => fc(t) * 1.3, q: 0.8 }, { type: 'hp', f: 120, q: 0.7 }]), 0.008)) : null;
    // 高频"空气"层：真录音在 3k 以上有一层更平的嘶声（−25dB 左右）
    const H = normRms(flatten(filtNoise(L, R, [{ type: 'hp', f: t => fc(t) * 3, q: 0.6 }]), 0.008));
    // 低频气流冲击（<150Hz）
    const Lw = lf > 0.01 ? normRms(flatten(filtNoise(L, R, [{ type: 'lp', f: 95, q: 0.8 }, { type: 'hp', f: 28, q: 0.7 }]), 0.004)) : null;
    const gl = Math.sqrt(lf / Math.max(0.02, 1 - lf));
    const wb = rough > 0 ? wobble(L, R, 35, rough) : null;
    const y = new Float64Array(L), ga = Math.sqrt(thin), gb = Math.sqrt(1 - thin), gh = Math.pow(10, (air == null ? -24 : air) / 20);
    const K = 32, nk = Math.ceil(L / K) + 2, ea = new Float64Array(nk), eh = new Float64Array(nk), el = new Float64Array(nk);
    for (let k = 0; k < nk; k++) { const a = Math.pow(10, Math.max(-60, dB(k * K / SR)) / 20); ea[k] = a; eh[k] = a * Math.pow(a, 0.3); el[k] = a * Math.pow(a, 0.15); }
    for (let n = 0; n < L; n++) {
      const p = n / K, k = p | 0, w = p - k, a = ea[k] + (ea[k + 1] - ea[k]) * w;
      let s = ((A ? A[n] * ga : 0) + (B ? B[n] * gb : 0)) * a + H[n] * gh * (eh[k] + (eh[k + 1] - eh[k]) * w);
      if (Lw) s += Lw[n] * gl * (el[k] + (el[k + 1] - el[k]) * w);
      y[n] = s * (wb ? wb[n] : 1);
    }
    const fz = Math.round(0.003 * SR); for (let n = 0; n < fz && n < L; n++) { const w = 0.5 - 0.5 * Math.cos(Math.PI * n / fz); y[n] *= w; y[L - 1 - n] *= w; }
    return y;
  }
  S.air.arc = arc;

  // 与 core.make 相同的参数整理（peak() 可能直接被页面调用，不经过 make）
  const num = (v, d) => { v = typeof v === 'string' ? Number(v) : v; return typeof v === 'number' && isFinite(v) ? S.clamp(v, 0, 1) : d; };
  const seedOf = o => isFinite(o.seed) ? Math.floor(Math.abs(o.seed)) % 4294967296 : 1;
  // swing 的随机计划：gen 与 peak 共用（同一组随机数），返回时长/峰位/前导/峰频等
  function swingPlan(o) {
    const R = S.rng(seedOf(o)), w = W[o.weapon] || W.sword, sp = num(o.speed, 0.6), sz = num(o.size, 0.5);
    const v = (0.5 + sp) / 1.1;    // 相对速度（中速 0.6 → 1）
    // 时长：随机只 ±5%（第一轮 ±8% 加上限制前导，seed 间长度差约 28%，现收窄到 ~10%）
    const T = w.T0 / v * (0.8 + 0.4 * sz) * Math.exp(R.g() * 0.035);
    const pf = S.clamp(0.43 + R.g() * 0.03, 0.35, 0.5);
    let rise = T * pf; const fall = T * (1 - pf);
    if (rise * EXT > LEAD_MAX) rise = LEAD_MAX / EXT;    // 慢速重挥：缩短蓄势段，保证前导 ≤0.2s
    // 峰频：物体类型基准 × 速度^0.37（同文件内实测斜率，弱）× 大小（设计：越大越低，±0.25 倍频程）× 个体差异 ±5%
    const fpk = (o._f0 > 0 ? o._f0 : w.f0) * Math.pow(v, 0.37)   // o._f0：留出检验时换成"去掉留出文件后"的基准峰频
         * Math.pow(2, -0.5 * (sz - 0.5)) * Math.exp(R.g() * 0.05);
    const t0 = rise * EXT;
    // 20ms 窗能量最大的位置（设计包络上数值求）：上升短、下降长时会比 t0 晚几毫秒，peak() 返回它，与试验场/审查的 20ms 峰值检测一致
    const a2 = t => { const u = t < t0 ? (t0 - t) / rise : (t - t0) / fall; return Math.pow(10, -2 * Math.pow(u, PX)); };
    let best = -1, tb = t0;
    for (let c = Math.max(0.01, t0 - 0.01); c <= t0 + 0.03; c += 0.0005) { let e = 0; for (let k = -10; k <= 10; k++) e += a2(c + k * 0.001); if (e > best) { best = e; tb = c; } }
    return { R, w, sp, sz, T, pf, rise, fall, fpk, t0, tpk: tb };
  }

  // ---------- swing 挥动 ----------
  S.def('swing', {
    group: '战斗·挥动', name: '挥动（嗖）',
    desc: '武器划过空气的涡旋噪声：速度先升后降，响度(∝v³)随之起落；武器决定"细（鼓包谱、偏亮）↔宽（平坦谱、偏低）"的物体类型和基准峰频，速度只让峰频略升（f∝v^0.37）、大小越大越低；粗钝的武器低频冲击更重。真录音里没有稳定的"频率随速度扫弧线"，所以中心频率只随速度轻微变化。',
    measured: '14 个物理挥动录音文件（84 段：SWSH 竹棍×3/竹鞭×2/羽毛球拍×2，WHSH 毛巾/快速挥动×4/低·中噪声嗖×2）逐帧测：物体类型的基准峰频（文件中位 260–1200Hz）、峰位 43%、细/宽两种谱形、低频占比。速度→峰频斜率是同一文件内拟合（很弱，r=−0.10）；武器→物体类型、各武器时长是设计映射（库里没有真实刀剑挥动录音）。原声 28 段电平与谱心的相关中位 −0.06，没有稳定的频率弧线。',
    params: [
      { k: 'weapon', label: '武器', options: WOPT, def: 'sword' },
      { k: 'speed', label: '速度', min: 0, max: 1, step: 0.05, def: 0.6 },
      { k: 'size', label: '大小', min: 0, max: 1, step: 0.05, def: 0.5 },
      { k: 'whistle', label: '风鸣音(设计项)', min: 0, max: 1, step: 0.05, def: 0 }
    ],
    presets: [
      { name: '匕首·快刺', opts: { weapon: 'dagger', speed: 0.85, size: 0.3 } },
      { name: '单手剑·普通挥砍', opts: { weapon: 'sword', speed: 0.6, size: 0.5 } },
      { name: '单手剑·全力', opts: { weapon: 'sword', speed: 1, size: 0.55 } },
      { name: '大剑·重劈', opts: { weapon: 'greatsword', speed: 0.55, size: 0.8 } },
      { name: '战锤·抡砸', opts: { weapon: 'hammer', speed: 0.5, size: 0.9 } },
      { name: '斧·横扫', opts: { weapon: 'axe', speed: 0.65, size: 0.6 } },
      { name: '长枪·突刺', opts: { weapon: 'spear', speed: 0.8, size: 0.5 } },
      { name: '棍·快甩', opts: { weapon: 'staff', speed: 0.9, size: 0.4 } },
      { name: '拳·轻', opts: { weapon: 'fist', speed: 0.5, size: 0.4 } }
    ],
    refs: [
      { name: '竹棍挥动（SWSH）', path: 'casual UI/SWSH_WHOOSH-Swish Bamboo Stick_B00M_CUCK.wav', offset: 1.6019, dur: 0.2 },
      { name: '细竹棍（SWSH）', path: 'casual UI/SWSH_WHOOSH-Swish Bamboo Stick Thin_B00M_CUCK.wav', offset: 1.5485, dur: 0.13 },
      { name: '羽毛球拍（SWSH）', path: 'casual UI/SWSH_WHOOSH-Badminton Racket_B00M_CUCK.wav', offset: 2.0137, dur: 0.21 },
      { name: '毛巾甩（WHSH）', path: 'casual UI/WHSH_WHOOSH-Towel Short_B00M_CUCK.wav', offset: 1.488, dur: 0.25 },
      { name: '快速挥动（WHSH）', path: 'casual UI/WHSH_WHOOSH-Swipe Fast Short Air_B00M_CUCK.wav', offset: 2.1648, dur: 0.49 }
    ],
    loud: o => 0.35 + 0.65 * Math.pow(S.clamp(o.speed, 0, 1), 1.5) * (0.75 + 0.25 * o.size),
    // 设计上的"刀最快"时刻（秒，相对音头）：与 gen 用同一组随机数（swingPlan）。各噪声层已拉平随机起伏，20ms 窗的响度峰与它的偏差见 notes/C.md
    peak: o => swingPlan(o || {}).tpk,
    gen: o => {
      const P = swingPlan(o), { R, w, sp, sz, T, pf, rise, fall, fpk, t0 } = P;
      const y = arc(R, {
        T, peakFrac: pf, rise, fall, px: PX, fpk, thin: w.thin, lf: S.clamp(w.lf * (0.6 + 0.8 * sz), 0, 0.9),
        beta: 0.25 + 0.3 * w.thin, dop: w.dop * sp, rough: 0.04 + 0.04 * (1 - w.thin), air: -24 + 4 * sp
      });
      if (o.whistle > 0) {   // 设计项：风鸣音（Aeolian tone，涡旋脱落的窄带音），频率在峰频附近，跟着同一速度弧线；t0 用实际的峰位
        const L = y.length, Rw = S.rng((seedOf(o) + 77) >>> 0);
        const nb = filtNoise(L, Rw, [{ type: 'bp', f: t => fpk * 2.2 * Math.pow(2, -0.15 * Math.tanh((t - t0) / T)), q: 18 }]);
        normRms(nb); const r = S.rms(y);
        for (let n = 0; n < L; n++) { const t = n / SR, u = (t - t0) / ((t < t0 ? rise : fall) * 0.6); y[n] += nb[n] * Math.exp(-u * u) * r * 0.9 * o.whistle; }
      }
      return y;
    }
  });

  // ---------- whoosh 通用嗖（冲刺/闪避/投射物飞过） ----------
  // 声源以速度 v 从距离 D 处掠过：r(t)=√(D²+(vt)²)；振幅 ∝ (D/r)^1.5（距离 + 指向性，设计取值）；
  // 径向速度 vr = v²t/r → 多普勒 f' = f·c/(c+vr)（c=343m/s）：先高后低；远处更暗（空气吸收/指向性）
  S.def('whoosh', {
    group: '动作·气流', name: '嗖（掠过）',
    desc: '物体从身边掠过：距离先近后远（响度先升后降），先靠近后远离 → 多普勒音高先高后低；谱形取宽物体气动噪声。',
    measured: '谱形取宽物体（WHSH 快速挥动×4、低·中噪声嗖×2 测得：峰下平坦、峰上 −10dB/oct，基准峰频取快速挥动文件中位 365Hz，速度斜率同 swing 的弱斜率 v^0.37）；多普勒是物理公式（c=343m/s）；距离衰减指数 1.5（含指向性）是设计取值，指向性指数为设计取值。',
    params: [
      { k: 'speed', label: '速度', min: 0, max: 1, step: 0.05, def: 0.6 },
      { k: 'size', label: '大小', min: 0, max: 1, step: 0.05, def: 0.5 },
      { k: 'dur', label: '时长(秒)', min: 0.15, max: 1.5, step: 0.05, def: 0.45 },
      { k: 'close', label: '贴近程度', min: 0, max: 1, step: 0.05, def: 0.6 }
    ],
    presets: [
      { name: '冲刺·快', opts: { speed: 0.8, size: 0.4, dur: 0.3, close: 0.7 } },
      { name: '闪避翻身', opts: { speed: 0.5, size: 0.5, dur: 0.4, close: 0.8 } },
      { name: '箭矢飞过', opts: { speed: 1, size: 0.15, dur: 0.35, close: 0.85 } },
      { name: '巨物掠过', opts: { speed: 0.4, size: 1, dur: 1.0, close: 0.4 } }
    ],
    refs: [
      { name: '快速挥动（WHSH）', path: 'casual UI/WHSH_WHOOSH-Swipe Fast Basic_B00M_CUCK.wav', offset: 3.028, dur: 0.82 },
      { name: '低挥动（WHSH）', path: 'casual UI/WHSH_WHOOSH-Swipe Fast Short Low_B00M_CUCK.wav', offset: 1.327, dur: 0.54 },
      { name: '中噪声嗖（WHSH）', path: 'casual UI/WHSH_WHOOSH-Noise Mid_B00M_CUCK.wav', offset: 4.3978, dur: 1.05 }
    ],
    loud: o => 0.4 + 0.6 * (0.5 * o.speed + 0.5 * o.close),
    gen: o => S.air.flyby(S.rng(o.seed), o)
  });

  // 掠过模型（projectile 也用）：返回 {y, gain(t), dop(t)}；opts: speed,size,dur,close
  S.air.flyby = function (R, o, extra) {
    const dur = S.clamp(o.dur || 0.45, 0.08, 4), sp = S.clamp(o.speed, 0, 1), sz = S.clamp(o.size, 0, 1), cl = S.clamp(o.close == null ? 0.6 : o.close, 0, 1);
    const v = 15 + 45 * sp, W20 = dur * (0.32 + 0.35 * (1 - cl)), D = v * W20 / 9.07, L = Math.round(dur * SR), tc = dur * (0.5 + R.g() * 0.03);
    const geo = t => { const x = v * (t - tc), r = Math.sqrt(D * D + x * x); return { g: Math.pow(D / r, 1.5), dop: 343 / (343 + v * x / r), near: D / r }; };
    const fpk = 365 * Math.pow(v / 42, 0.37) * Math.pow(2, -1.2 * (sz - 0.5)) * Math.exp(R.g() * 0.05);   // 宽物体基准（快速挥动文件中位）× 弱速度斜率
    const fc = t => { const q = geo(t); return S.clamp(fpk * q.dop * Math.pow(q.near, 0.3), 60, 15000); };
    const B = normRms(filtNoise(L, R, [{ type: 'lp', f: t => fc(t) * 1.3, q: 0.85 }, { type: 'hp', f: 110, q: 0.7 }]));
    const A = normRms(filtNoise(L, R, [{ type: 'bp', f: fc, q: 0.9 }, { type: 'bp', f: fc, q: 0.9 }]));
    const Lw = normRms(filtNoise(L, R, [{ type: 'lp', f: 90, q: 0.8 }, { type: 'hp', f: 28, q: 0.7 }]));
    const wb = wobble(L, R, 30, 0.15), y = new Float64Array(L), gl = Math.sqrt(0.15 + 0.6 * sz);
    // 距离增益每 32 采样算一次再线性插值（逐采样 sqrt/pow 太慢）
    const K = 32, nk = Math.ceil(L / K) + 2, ga = new Float64Array(nk), gb = new Float64Array(nk);
    for (let k = 0; k < nk; k++) { const a = geo(k * K / SR).g; ga[k] = a; gb[k] = gl * Math.pow(a, 1.2); }
    for (let n = 0; n < L; n++) {
      const p = n / K, k = p | 0, w = p - k, a = ga[k] + (ga[k + 1] - ga[k]) * w, b = gb[k] + (gb[k + 1] - gb[k]) * w;
      y[n] = ((B[n] * 0.8 + A[n] * 0.6) * a + Lw[n] * b) * wb[n];   // 低频冲击只在最近处明显（∝a^1.2，比主体 a 更集中）
    }
    const fi = Math.min(L >> 2, Math.round(0.02 * SR)), fo = Math.min(L >> 2, Math.round(0.03 * SR));
    for (let n = 0; n < fi; n++) y[n] *= 0.5 - 0.5 * Math.cos(Math.PI * n / fi);
    for (let n = 0; n < fo; n++) y[L - 1 - n] *= 0.5 - 0.5 * Math.cos(Math.PI * n / fo);
    if (extra) { extra.geo = geo; extra.tc = tc; }
    return y;
  };
})();
