/* sfx2/ext.js */
/* =====================================================================================
 * v0.24 B 线 · sfxgen v2.0 扩展类型（注册到 window.SFX2V2；上游 lmdxavier/spine sfxgen 以后再同步，Spine 项目里没改）
 *
 * 按 sfxgen 的做法：先写发声原理，参数从参照录音里测（tools/sfx/refmeasure.py → ref_ext.json），不拼接、不混合任何录音；
 * 用和 v2.0 自检同一把尺子（tools/sfx/desc.py：倍频程起音谱 + 整体谱 + 分频带衰减）测和参照的距离，改进前后的数字见 notes/B.md。
 *
 *   swish       亮的"嗖"（4–8kHz 起头）：快速运动物体带起的湍流噪声。频带中心随相对速度变化：靠近/掠过瞬间最高，
 *               远离时按多普勒和距离衰减向下滑（实测中心 fs≈8–15k → fe≈0.4–1.7k，指数时间常数 13–150ms，宽带 Q≈0.4–1.3）；
 *               振幅先快速上升（10–65ms）再慢慢掉（掉 20dB 75–460ms），湍流带来 ±2–3dB 的随机起伏。参照：casual interaction 嗖嗖音效 Puzzle_Game_Whoosh_01–04。
 *   metal_ring  金属薄壳（箱/盾）被硬物敲击后的高频长余音：一组稀疏的弯曲振动模态（衰减正弦）。
 *               实测（METLImpt Metal Box 6 段、72 个模态）：模态集中在 1.5–3kHz 和 4–10kHz 两簇；T60 = e^1.518·f^−0.289 秒
 *               （2k 0.51s、6k 0.37s、10k 0.32s，对数残差 sd 0.44）；幅度随频率略升（+1.17dB/ln f）；每段约 12 个明显模态。
 *               只生成余音层（盾体的低频"哐"仍用 impact metal 软撞）。
 *   punch_body  打肉的"低频后到"：拳套/皮面先接触 → 中频拍击（400–1600Hz，接触瞬间、很快衰减）；身体被压缩 → 整体形变的低频
 *               "咚"随后才达到最大（实测低频峰值比起音晚 57–121ms，中位 65ms；从 −20dB 升到峰 26–48ms），音高从 ~165Hz 下滑到 ~93Hz，
 *               峰值比中频高 ~6.3dB，峰后掉 20dB 约 27ms；高频（2–8k 皮面/布料）比中频低 ~3.4dB。参照：casual UI FGHTImpt Old School Punch 6 段
 *               （该包授权有问题，这里只用它测出的数字，不含任何片段）。
 *
 * 组装：放在 sfx2/_post.js 之后、sfx_cat.js 之前，<script> 第一行必须是 /* sfx2/ext.js *\/（本文件第一行），
 * sfx_cat.js 的 Worker 按 /* sfx2/<名>.js *\/ 标记收集源码并按文档顺序执行，所以 Worker 里也会注册这三个类型。
 * =====================================================================================*/
(function (root) {
  'use strict';
  const S = root.SFX2V2; if (!S || !S.def) return;
  const SR = S.SR, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fadeTail = (x, sec) => { const fo = Math.min(x.length >> 2, Math.round((sec || 0.006) * SR)); for (let n = 0; n < fo; n++) x[x.length - 1 - n] *= n / fo; return x; };

  // ---------------------------------------------------------------- swish 亮的嗖
  const SW = { fs: [8000, 15000], fe: [400, 1700], tau: [0.013, 0.15], rise: [0.01, 0.065], d20: [0.075, 0.46], q: [0.4, 1.3] };   // 参照 4 段的实测范围
  function swishGen(o) {
    const R = S.rng((o.seed >>> 0) * 2246822519 + 3), sp = o.speed, sz = o.size;
    const lerp = (r, u) => r[0] + (r[1] - r[0]) * u, lg = (r, u) => r[0] * Math.pow(r[1] / r[0], u);
    // 速度快 → 起头更高、下滑更快、上升更短；物体大 → 终点更低、更宽带
    const fs = lg(SW.fs, clamp(0.25 + 0.6 * sp + 0.15 * R(), 0, 1)) * (1 - 0.15 * sz), fe = lg(SW.fe, clamp(0.7 - 0.5 * sz + 0.15 * R.g(), 0, 1));
    const tau = lg(SW.tau, clamp(0.75 - 0.6 * sp + 0.1 * R.g(), 0, 1)), rise = lg(SW.rise, clamp(0.7 - 0.6 * sp + 0.1 * R.g(), 0, 1));
    const d20 = o.dur * (0.55 + 0.1 * R()), q = lerp(SW.q, clamp(0.25 - 0.2 * sz + 0.1 * R(), 0, 1));
    const T = rise + d20 * 1.6 + 0.02, x = S.white(T, R);
    let y = S.biquad(x, 'bp', t => fe + (fs - fe) * Math.exp(-Math.max(0, t - rise * 0.5) / tau), q);
    y = S.biquad(y, 'hp', 250, 0.7);
    // 湍流起伏：每 30–60ms 一个随机幅度点（±2.5dB），线性插值
    const knots = []; for (let t = 0; t < T + 0.06; t += 0.03 + 0.03 * R()) knots.push([t, Math.pow(10, R.g() * 2.5 / 20)]);
    let ki = 0; const k20 = Math.log(10) / d20;
    for (let n = 0; n < y.length; n++) {
      const t = n / SR; while (ki < knots.length - 2 && knots[ki + 1][0] < t) ki++;
      const [t0, a0] = knots[ki], [t1, a1] = knots[ki + 1], fl = a0 + (a1 - a0) * clamp((t - t0) / (t1 - t0), 0, 1);
      const env = t < rise ? Math.pow(Math.sin(0.5 * Math.PI * t / rise), 2) : Math.exp(-(t - rise) * k20);
      y[n] *= env * fl;
    }
    return fadeTail(y, 0.02);
  }
  S.def('swish', {
    group: '气流', name: '亮的嗖', desc: '快速运动物体的湍流噪声：带通中心从 8–15kHz 指数下滑到 0.4–1.7kHz（多普勒+远离），快升慢落，±2.5dB 湍流起伏',
    measured: '参照 casual interaction/嗖嗖音效 Puzzle_Game_Whoosh_01–04（来源未确认，只测数字）：中心起点/终点/时间常数、带宽 Q、上升时间、掉 20dB 时间（tools/sfx/refmeasure.py）。设计约定：速度/大小到这些范围内位置的映射、湍流起伏幅度。',
    params: [
      { k: 'speed', label: '速度', min: 0, max: 1, step: 0.05, def: 0.7 },
      { k: 'size', label: '大小', min: 0, max: 1, step: 0.05, def: 0.3 },
      { k: 'dur', label: '拖尾(秒)', min: 0.08, max: 0.6, step: 0.01, def: 0.3 }
    ],
    presets: [{ name: '拳风', opts: { speed: 0.9, size: 0.2, dur: 0.15 } }, { name: '物体被打飞', opts: { speed: 0.8, size: 0.5, dur: 0.35 } }],
    loud: o => 0.6 + 0.4 * o.speed, gen: swishGen
  });

  // ---------------------------------------------------------------- metal_ring 金属高频长余音
  const MR = { a: 1.518, b: -0.289, sd: 0.44, amp: 1.17,
    bins: [[1500, 2000, 9], [2000, 2500, 7], [2500, 3000, 9], [3000, 4000, 1], [4000, 5000, 5], [5000, 6000, 5], [6000, 7000, 11], [7000, 8000, 11], [8000, 9000, 1], [9000, 10000, 10], [10000, 12000, 1], [12000, 16000, 2]] };
  const MR_TOT = MR.bins.reduce((s, b) => s + b[2], 0);
  function ringGen(o) {
    const R = S.rng((o.seed >>> 0) * 3266489917 + 7), N = Math.round(o.modes), fsc = Math.pow(2, (0.5 - o.size) * 1.2);   // 大小：±0.6 倍频程
    const ringMul = Math.pow(2, (o.ring - 0.5) * 2);   // 余音长短：×0.5–×2
    const M = [];
    for (let i = 0; i < N; i++) {
      let u = R() * MR_TOT, b = MR.bins[0]; for (const bb of MR.bins) { if (u < bb[2]) { b = bb; break; } u -= bb[2]; }
      const f = Math.min(18000, (b[0] + (b[1] - b[0]) * R()) * fsc);
      const t60 = Math.exp(MR.a + MR.b * Math.log(f) + R.g() * MR.sd * 0.6) * ringMul;
      const a = Math.pow(10, (MR.amp * Math.log(f / 5000) + R.g() * 3) / 20) * (0.6 + 0.4 * o.force);
      M.push([f, t60, a, R() * 2 * Math.PI]);
    }
    const T = Math.min(2, Math.max(...M.map(m => m[1])) * 0.8), y = new Float64Array(Math.round(T * SR));
    for (const [f, t60, a, ph] of M) { const w = 2 * Math.PI * f / SR, k = Math.log(1000) / (t60 * SR); for (let n = 0; n < y.length; n++) y[n] += a * Math.exp(-k * n) * Math.sin(w * n + ph); }
    // 硬物接触：0.3–0.8ms 的高通噪声脉冲（力度越大越短越亮）
    const cl = Math.round((0.0008 - 0.0005 * o.force) * SR), c = S.biquad(S.white(cl / SR + 0.002, R), 'hp', 3000, 0.7);
    let pk = 0; for (const v of y) pk = Math.max(pk, Math.abs(v));
    for (let n = 0; n < c.length && n < y.length; n++) y[n] += c[n] * pk * 0.8 * Math.exp(-n / Math.max(1, cl));
    for (let n = 0; n < Math.min(y.length, 22); n++) y[n] *= n / 22;   // 0.5ms 起音
    return fadeTail(y, 0.05);
  }
  S.def('metal_ring', {
    group: '碰撞', name: '金属高频余音', desc: '金属薄壳（箱、盾）被硬物敲后的稀疏高频模态：1.5–3k 和 4–10k 两簇，T60≈0.3–0.5s 随频率略短',
    measured: '参照 casual UI/METLImpt_IMPACT-Metal Box 6 段（盗版包，只测数字）：72 个模态的频率分布、T60(f) 回归（e^1.518·f^−0.289，对数残差 0.44）、幅度斜率。设计约定：大小=整体移频 ±0.6 倍频程、ring=余音 ×0.5–×2、接触脉冲。',
    params: [
      { k: 'size', label: '大小', min: 0, max: 1, step: 0.05, def: 0.5 },
      { k: 'force', label: '力度', min: 0, max: 1, step: 0.05, def: 0.8 },
      { k: 'ring', label: '余音', min: 0, max: 1, step: 0.05, def: 0.5 },
      { k: 'modes', label: '模态数', min: 4, max: 24, step: 1, def: 12 }
    ],
    presets: [{ name: '金属盾被打', opts: { size: 0.6, force: 1, ring: 0.5 } }, { name: '小铁皮', opts: { size: 0.2, force: 0.6, ring: 0.3 } }],
    loud: o => 0.5 + 0.5 * o.force, gen: ringGen
  });

  // ---------------------------------------------------------------- punch_body 打肉（低频后到）
  // 直接测得：低频峰值 65ms、上升 30ms、音高 165→93Hz、高频比中频 −3.4dB。
  // 用"同一把尺子"校准（analysis-by-synthesis，同 sfxgen calib.py 的思路）后修正的：中频中心 800Hz + 1.6 倍处低通（起音谱 1k 以上陡降）、
  // 中频/高频掉 20dB 60ms、低频掉 20dB 50ms、低频比中频 +3dB（直接测的分频带值 16/25/27ms、+6.3dB 被 11.6ms 级分析窗和多层叠加低估/高估）。
  const PB0 = { midLp: 1.6, midQ: 0.9, res: 0.02, midCen: 800, midPeak: 0.004, midD20: 0.06, hiRel: -3.4, hiD20: 0.06, loRel: 3, loPeak: 0.065, loRise: 0.030, loD20: 0.05, f0: 165, f1: 93 };
  function punchGen(o) {
    const PB = Object.assign({}, PB0, o.tune || {});   // tune：只给拟合工具用
    const R = S.rng((o.seed >>> 0) * 668265263 + 11), sz = o.size, fo = o.force, dl = o.delay;
    const T = 0.3 + 0.1 * sz, L = Math.round(T * SR);
    // ① 中频拍击：带通噪声，中心 ~1.3kHz（力度大更亮），极快起音、掉 20dB ~16ms
    const mc = PB.midCen * (0.85 + 0.3 * fo) * Math.exp(R.g() * 0.08), md = PB.midD20 * (0.8 + 0.4 * R());
    const mid = S.biquad(S.biquad(S.white(T, R), 'bp', mc, PB.midQ), 'lp', mc * PB.midLp, 0.7);   // 带通后再低通：起音谱在 1kHz 以上按实测陡降
    // ② 皮面/布料高频：2–8kHz，比中频低 ~3.4dB，掉 20dB ~25ms（拳套越多越亮：glove）
    const hi = S.biquad(S.biquad(S.white(T, R), 'hp', 2000, 0.7), 'lp', 8000, 0.7);
    // ③ 身体低频：正弦从 f0 下滑到 f1（体型大更低），升余弦升到峰值（峰值时刻 = 起音后 loPeak×delay），峰后掉 20dB ~27ms
    const f0 = PB.f0 * Math.pow(0.7, sz - 0.5) * Math.exp(R.g() * 0.05), f1 = PB.f1 * Math.pow(0.7, sz - 0.5);
    const lp = Math.max(0.008, PB.loPeak * dl * (0.9 + 0.2 * R())), lr = Math.min(lp, PB.loRise * (0.6 + 0.4 * dl) * (1.4 - 0.4 * fo)), ld = PB.loD20 * (0.8 + 0.6 * sz);
    const y = new Float64Array(L), k = Math.log(10);
    let ph = 0, lsum = 0, msum = 0;
    const lo = new Float64Array(L);
    for (let n = 0; n < L; n++) {
      const t = n / SR;
      const f = f1 + (f0 - f1) * Math.exp(-t / (lp * 0.8)); ph += 2 * Math.PI * f / SR;
      const st = lp - lr, el = t < st ? 0 : t < lp ? 0.5 - 0.5 * Math.cos(Math.PI * (t - st) / lr) : Math.exp(-(t - lp) * k / ld);
      lo[n] = Math.sin(ph) * el;
    }
    // 起音前 3ms 的低频残余（真实录音低频在起音时已有 −20dB 左右），避免完全无声再突然出现
    for (let n = 0; n < Math.min(L, Math.round(lp * SR)); n++) lo[n] += Math.sin(2 * Math.PI * f0 * n / SR) * PB.res * Math.min(1, n / (0.003 * SR)) * Math.exp(-n / SR / (lp * 0.6));
    const em = t => (t < PB.midPeak ? Math.pow(Math.sin(0.5 * Math.PI * t / PB.midPeak), 2) : Math.exp(-(t - PB.midPeak) * k / md));
    const eh = t => (t < 0.002 ? t / 0.002 : Math.exp(-(t - 0.002) * k / PB.hiD20));
    const mpk = S.peak(mid) || 1, hpk = S.peak(hi) || 1, lpk = 1;
    const gm = 1 / mpk, gh = Math.pow(10, (PB.hiRel + 6 * (o.glove - 0.5)) / 20) / hpk, gl = Math.pow(10, (PB.loRel + 3 * (sz - 0.5)) / 20) / lpk;
    for (let n = 0; n < L; n++) { const t = n / SR; y[n] = mid[n] * em(t) * gm + hi[n] * eh(t) * gh + lo[n] * gl; }
    return fadeTail(y, 0.02);
  }
  S.def('punch_body', {
    group: '战斗', name: '打肉（低频后到）', desc: '中频拍击（接触瞬间）+ 皮面高频 + 身体低频（音高 165→93Hz 下滑，起音后约 65ms 才到最大）',
    measured: '参照 casual UI/FGHTImpt_IMPACT-Old School Punch 6 段（盗版包，只测数字）：低频峰值时刻 57–121ms（中位 65）、上升 30ms、峰后掉 20dB 27ms、低频起/止音高 165/93Hz、低频比中频 +6.3dB、高频比中频 −3.4dB、起音 8ms 重心 1.33kHz。设计约定：体型→音高和低频份额、delay 缩放低频到达时间（1=实测）、glove 皮面亮度。',
    params: [
      { k: 'size', label: '体型', min: 0, max: 1, step: 0.05, def: 0.5 },
      { k: 'force', label: '力度', min: 0, max: 1, step: 0.05, def: 0.8 },
      { k: 'delay', label: '低频到达(1=实测)', min: 0.1, max: 1.5, step: 0.05, def: 1 },
      { k: 'glove', label: '皮面亮度', min: 0, max: 1, step: 0.05, def: 0.5 }
    ],
    presets: [{ name: '拳打身体', opts: { size: 0.5, force: 0.9 } }, { name: '重拳打大块头', opts: { size: 0.9, force: 1 } }],
    loud: o => 0.5 + 0.5 * o.force, gen: punchGen
  });
})(typeof window !== 'undefined' ? window : globalThis);
