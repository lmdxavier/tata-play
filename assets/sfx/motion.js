/* sfxgen v2.0 · 线 B · 动作（脚步/跳跃/落地/翻滚）+ 拾取与机关（金币/宝石/药水/宝箱/门/拉杆）
 * 全部按发声原理实时合成；地面材质层运行时调用线 A 的 impact（未加载时用本文件的临时模态版），水花/气泡可调用线 C。
 * 参数来源（tool/B/mmeasure.py 实测，详见 notes/B.md）：
 *   金币（第二轮重测，tool/B/coinstats.py + coindecay.py）：只用 6 个单枚硬币文件（36 段）——硬币本体最强模态、各频段衰减、弹跳间隔/幅度比（只取间隔单调递减的序列）；
 *     模态频率比用自由圆板理论值（实测只在 2/6 个文件里见到 ≈1.75 的比值，2.33 及以上没有文件支持）
 *   玻璃 54 段（GLASTonl、Treasure Gem、UIClick GLASS）：最低强模态、衰减
 *   闷响 72 段（Book Drop Low、DIRTImpt、CLOTHImpt、Suitcase Fall、FGHTImpt）：最低模态、t20
 *   碎粒 66 段（ROCKMvmt 碎石/石堆、Sand）：碎粒密度/中心频率/带宽/衰减
 *   咔哒 105 段（玻璃棘轮、弹珠台装填/转轮、机械解锁、箱扣、卷尺/枪栓/卡扣）：咔哒间隔与规则度、t20
 *   布料 48 段（CLOTHImpt、PAPRFric、洗牌擦桌）：碎粒密度/频率
 * 库里没有的（如实标注为"设计约定"）：真正的脚步录音（脚跟→脚掌时间差、强弱比）、木头吱呀声（库里"吱呀转动"实际是敲击声）、
 *   拉杆/门的整体时序。吱呀按粘滑摩擦原理设计（周期脉冲激励木头共振峰），不是从录音测的。
 */
(function () {
  'use strict';
  const S = (typeof window !== 'undefined' ? window : globalThis).SFX2;
  const SR = S.SR, TAU = 2 * Math.PI, cl = S.clamp, lerp = S.lerp;

  // ---------- 实测统计（分位数 p10/p25/p50/p75/p90） ----------
  const M = {
    // 金币（6 个单枚硬币文件，每文件取中位后的分位数）：硬币本体最强模态（3kHz 以上最强峰）Hz
    coinRing: [5230, 5480, 6930, 8370, 9950],
    // 自由圆板（泊松比约 0.3）理论频率比，(2,0) 模态为 1（Rossing）。实测只粗略支持 1.73 附近（2/6 文件），其余是理论值
    coinRatios: [1, 1.73, 2.33, 3.91, 4.11, 6.30, 6.71],
    coinD: [[500, 104], [1500, 139], [4500, 89], [8000, 83], [13000, 60]],   // 各频段衰减：每文件中位 → 跨文件中位 (Hz, 1/s)
    coinKnock: [435, 560, 590, 624],   // 4/6 个文件在主撞时有 435–624Hz 的低频峰：桌面/盒子被敲的声音，不是硬币本体
    // 弹跳（16 条间隔单调递减的序列，36 段中）：主撞后第一个间隔、相邻间隔比（≈恢复系数）、相邻幅度比
    coinGap: [0.054, 0.072, 0.095, 0.14, 0.192], coinGapRatio: [0.318, 0.456, 0.659, 0.816, 0.912], coinAmpRatio: [0.297, 0.396, 0.598, 0.981, 1.398],
    glassF1: [423, 609, 2040, 3860, 8480], glassD: 110,
    thudF1: [69.5, 86.2, 115, 179, 300], thudT20: [0.013, 0.032, 0.044, 0.07, 0.129],
    grainRate: [40.7, 67.9, 117, 154, 196], grainFc: [329, 555, 1780, 4850, 6490], grainBw: 1.07, grainTau: [0.0008, 0.0014, 0.0031, 0.0063, 0.015],
    clothRate: [36, 43, 65, 80, 113], clothFc: [120, 221, 1820, 3720, 5110], clothTau: [0.0013, 0.0025, 0.004, 0.0134, 0.015],
    clickIoi: [0.0159, 0.0215, 0.0322, 0.0494, 0.078], clickCv: 0.53, clickT20: [0.0084, 0.011, 0.015, 0.026, 0.11],
  };
  const quant = (P, u) => { const x = cl(u * 4, 0, 4), i = Math.min(3, Math.floor(x)); return P[i] + (P[i + 1] - P[i]) * (x - i); };
  const logq = (P, u) => Math.exp(quant(P.map(Math.log), u));   // 对数域插值（频率/时间类）
  const coinDecay = f => { const T = M.coinD; if (f <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (f <= T[i][0]) return lerp(T[i - 1][1], T[i][1], Math.log(f / T[i - 1][0]) / Math.log(T[i][0] / T[i - 1][0])); return T[T.length - 1][1]; };
  const peakNorm = (x, g) => { const p = S.peak(x) || 1; for (let i = 0; i < x.length; i++) x[i] *= g / p; return x; };
  const seedOf = R => (R() * 4294967295) >>> 0;
  // 指数阻尼（τ 秒，前 2ms 不压，保留撞击瞬态）；末尾低于峰值 −70dB 的部分裁掉
  const damp = (x, tau) => { const n0 = Math.round(0.002 * SR), k = Math.exp(-1 / (tau * SR)); let e = 1; for (let i = n0; i < x.length; i++) { e *= k; x[i] *= e; } return trim(x); };
  // 末尾低于峰值 −60dB 的部分裁掉，留 5ms 余弦收尾
  const trim = x => { const p = S.peak(x) * 1e-3; let n = x.length - 1; while (n > 0 && Math.abs(x[n]) < p) n--; const L = Math.min(x.length, n + Math.round(0.005 * SR)), y = x.slice(0, L), fo = Math.min(L, Math.round(0.005 * SR)); for (let i = 0; i < fo; i++) y[L - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fo); return y; };
  // 去直流：一阶高通 20Hz（低频闷响/衰减正弦本身带直流；辐射声压没有直流分量，所以在生成端就去掉，不留给 finish）
  const dcb = x => { const a = Math.exp(-TAU * 20 / SR); let px = 0, py = 0; for (let i = 0; i < x.length; i++) { const v = x[i] - px + a * py; px = x[i]; py = v; x[i] = v; } return x; };
  const fin = x => trim(dcb(x));

  // ---------- 积木 ----------
  // 材质撞击层：优先调用线 A 的 impact；没有时用临时模态版（设计值，粗糙）
  const TMP_MAT = {   // f1(Hz, size=0.5), 频率比, 衰减(1/s), 接触噪声中心频率
    wood: [520, [1, 2.4, 3.9, 5.6], 70, 1800], stone: [1500, [1, 1.7, 2.6, 3.3], 260, 3000], metal: [900, [1, 2.76, 5.4, 8.93], 14, 5000],
    dirt: [140, [1, 1.6], 120, 900], cloth: [120, [1, 1.7], 140, 700], glass: [2000, [1, 2.3, 3.6, 5.1], 110, 6000], plastic: [700, [1, 2.2, 3.5], 90, 2500],
  };
  function impactLayer(mat, size, force, striker, R, extra) {
    if (S.types.impact) {
      const y = S.make('impact', Object.assign({ material: mat, size, force, striker, bounces: 1, seed: seedOf(R), raw: true }, extra || {}));
      return peakNorm(Float64Array.from(y), 1);
    }
    const p = TMP_MAT[mat] || TMP_MAT.wood, f1 = p[0] * Math.pow(2, (0.5 - size) * 2.2) * Math.exp(R.g() * 0.05);
    const soft = striker === 'soft', modes = p[1].map((r, i) => [f1 * r * (1 + R.g() * 0.01), p[2] * (1 + i * 0.6) * (soft ? 1.4 : 1), Math.pow(0.6, i) * (soft ? Math.pow(0.5, i) : 1), R() * TAU]);
    const y = S.modalBank(modes, Math.min(1.2, 7 / p[2]) + 0.02);
    const g = S.grain(p[3] * (soft ? 0.5 : 1) * (0.6 + 0.8 * force), 1.0, soft ? 0.002 : 0.0008, R);
    S.add(y, g, 0, 0.6 + force);
    return peakNorm(y, 1);
  }
  // 身体/脚的低频"闷响"：低频正弦，接触瞬间音高略高随即回落（接触变硬→变软），实测闷响最低模态中位 115Hz、t20 中位 44ms
  function thump(f, t20, R) {
    const d = 2.303 / t20, L = Math.round(Math.min(0.6, 7 / d) * SR), y = new Float64Array(L); let ph = 0;
    for (let n = 0; n < L; n++) { const t = n / SR, fi = f * (1 + 0.6 * Math.exp(-t / 0.008)); ph += fi / SR; y[n] = Math.sin(TAU * ph) * Math.exp(-d * t) * Math.min(1, t / 0.0015); }
    return y;
  }
  // 快速碎粒：白噪声 × 指数衰减 → 双二阶带通（时域，比 FFT 造粒快一个量级；每颗噪声都不同，不循环）
  function fgrain(fc, bw, tau, R) {
    const L = Math.max(32, Math.min(Math.round(0.06 * SR), Math.round(tau * 6 * SR))), y = new Float64Array(L);
    const q = 1 / (2 * Math.sinh(Math.LN2 * Math.max(0.3, bw) / 2)), w = TAU * Math.min(fc, SR * 0.45) / SR, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    const b0 = al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0, dk = Math.exp(-1 / (tau * SR)), fo = Math.max(8, Math.round(L * 0.25));
    let e = 1, x1 = 0, x2 = 0, y1 = 0, y2 = 0, m = 0;
    for (let n = 0; n < L; n++) {
      const x = (R() * 2 - 1) * e * (n < 4 ? n / 4 : 1); e *= dk;
      const v = b0 * x - b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = v;
      y[n] = n > L - 1 - fo ? v * (0.5 - 0.5 * Math.cos(Math.PI * (L - 1 - n) / fo)) : v;
      const av = v < 0 ? -v : v; if (av > m) m = av;
    }
    if (m) for (let n = 0; n < L; n++) y[n] /= m;
    return y;
  }
  // 碎粒层（碎石/沙土/草叶/布料褶皱）：泊松到达的噪声碎粒；密度/中心频率/衰减取实测分布
  function grains(R, dur, rate, fc, bw, tau, envFn) {
    const out = S.buf(dur + 0.08); let t = 0, it = 0;
    while (it++ < 4000) {   // 迭代上限保险（rate 异常时不会死循环）
      t += -Math.log(1 - R() * 0.999) / rate; if (t > dur) break;
      const a = (envFn ? envFn(t / dur) : 1) * Math.exp(R.g() * 0.5);
      S.add(out, fgrain(cl(fc * Math.pow(2, R.g() * 0.6), 120, 15000), bw, tau * Math.exp(R.g() * 0.4), R), t, a);
    }
    return out;
  }
  // 摩擦噪声（蹬地/滑擦/翻滚）：带通噪声 + 包络
  function friction(R, dur, fc, q, envFn) {
    const n = S.white(dur, R), y = S.biquad(S.biquad(n, 'bp', fc, q), 'lp', fc * 3, 0.7), L = y.length;
    let e0 = envFn(0), e1 = e0;
    for (let i = 0; i < L; i++) { if ((i & 63) === 0) { e0 = e1 = envFn(i / L); e1 = envFn(Math.min(1, (i + 64) / L)); } y[i] *= e0 + (e1 - e0) * (i & 63) / 64; }   // 包络按 64 采样插值
    return y;
  }
  // 衣物摆动：布料摩擦以"褶皱碎粒"为主（实测布料碎粒密度中位 65/秒），底噪很低且随动作起伏（避免变成持续的"呼呼"白噪声）
  function clothSwish(R, dur, amp) {
    const ph = R() * 6, env = x => Math.pow(Math.sin(Math.PI * Math.min(1, x)), 2) * (0.55 + 0.45 * Math.sin(TAU * 3.3 * x + ph));
    const bed = friction(R, dur, lerp(1500, 2600, R()), 1.2, env);
    peakNorm(bed, 1);
    const g = grains(R, dur, logq(M.clothRate, 0.5 + R.g() * 0.15) * 1.5, lerp(1800, 3500, R()), 1.0, logq(M.clothTau, 0.35), env);
    peakNorm(g, 1);
    return S.mix([[bed, 0, amp * 0.22], [g, 0, amp * 0.8]]);
  }
  // 气泡（Minnaert 共振 f≈3.26/R(m) Hz；衰减 d≈0.043f+0.0014f^1.5；上浮/靠近水面时频率略升 f(t)=f0(1+ξ·d·t)，ξ≈0.1 — van den Doel 2005）
  function bubble(R, rmm, amp) {
    const f0 = 3260 / rmm, d = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5), L = Math.round(Math.min(0.3, 6 / d) * SR), y = new Float64Array(L); let ph = 0;
    for (let n = 0; n < L; n++) { const t = n / SR; ph += f0 * (1 + 0.1 * d * t) / SR; y[n] = Math.sin(TAU * ph) * Math.exp(-d * t) * Math.min(1, t / 0.0005) * amp; }
    return y;
  }
  function splashLayer(R, size, force) {
    if (S.types.splash) return peakNorm(Float64Array.from(S.make('splash', { size, force, seed: seedOf(R), raw: true })), 1);
    // 临时版：水面破开的宽带噪声 + 一串气泡
    const dur = 0.08 + 0.15 * force * (0.5 + size), n = friction(R, dur, 2200, 0.5, x => Math.exp(-x * 4) * Math.min(1, x * 40));
    peakNorm(n, 0.7); const out = S.mix([[n, 0, 1]], 0.25);
    const nb = Math.round(3 + 10 * force * (0.4 + size));
    for (let i = 0; i < nb; i++) S.add(out, bubble(R, lerp(1.5, 6, R() * (0.4 + 0.6 * size)), 0.35 * Math.exp(R.g() * 0.4)), 0.01 + R() * dur * 1.6);
    return peakNorm(out, 1);
  }
  // 短促硬咔哒（锁扣/棘轮齿/门闩）：小金属件的高频模态 + 接触噪声；实测咔哒 t20 中位 15ms
  function click(R, f1, t20, bright) {
    const d = 2.303 / t20, modes = [1, 2.76, 5.4].map((r, i) => [f1 * r * (1 + R.g() * 0.02), d * (1 + i * 0.5), Math.pow(0.55, i), R() * TAU]);
    const y = S.modalBank(modes, Math.min(0.25, 8 / d));
    S.add(y, S.grain(cl(f1 * 1.8, 800, 12000), 1.0, 0.0006, R), 0, 0.9 * (bright == null ? 1 : bright));
    return peakNorm(y, 1);
  }
  // 粘滑摩擦"吱呀"：摩擦面"粘住—滑脱"交替，每次滑脱放出一个脉冲，脉冲串激励木头/金属的共振。第二轮按审查改成：
  //  · 粘住越久、积累的形变越大 → 滑脱位移（脉冲幅度）越大；脉冲率随滑动速度变化（速度快 → 频率高）
  //  · 非线性摩擦振动常见的两种不规则：周期加倍（相邻脉冲间隔/幅度一长一短交替）与间歇跳频（脉冲率突然跳到 ×1.5 或 ×0.67 一段时间）
  //  · "偶发粘住"真的跳过脉冲（不发声），之后一次大滑脱
  //  · 共振峰中心频率随速度略移（滑动快时接触刚度/边界条件变化，设计值 ±8–12%），金属共振 Q 降到 6–10（第一轮 Q 18–25 持续振铃成了平直蜂鸣线）
  //  speedFn(x) 0..1 是开合过程中的速度曲线（必须是确定的函数，随机相位在外部一次抽好）
  function creak(R, dur, rate0, formants, speedFn, rough) {
    const N = Math.round(dur * SR), exc = new Float64Array(N), NK = Math.ceil(N / 32) + 1, NF = formants.length; let t = 0, it = 0;
    // 控制量（每 32 采样一格）：各共振峰的频率倍数与增益倍数——随速度、慢速游走移动；间歇跳频时共振的主次关系也换一次（金属"啸叫"换模态）
    const fM = formants.map(() => new Float64Array(NK).fill(1)), gM = formants.map(() => new Float64Array(NK).fill(1));
    // 慢速游走：3 个低频正弦叠加（0.8–4Hz），让音高"吱—呀"起伏
    const W = [0, 1, 2].map(() => [R.range(0.8, 4), R() * TAU, R.range(0.5, 1)]), wander = x => W.reduce((s, [f, p, a]) => s + a * Math.sin(TAU * f * x * dur + p), 0) / 2;
    let stuck = 0, held = 0, dbl = 0, dPar = 1, jump = 0, jMul = 1, jF = formants.map(() => 1), jG = formants.map(() => 1);
    while (t < dur && it++ < 20000) {
      const x = t / dur, v = speedFn(x); if (v < 0.05) { t += 0.004; continue; }
      if (dbl > 0) dbl--; else if (R() < 0.01) dbl = 20 + Math.floor(R() * 60);          // 进入周期加倍段
      if (jump > 0) jump--; else if (jMul !== 1) { jMul = 1; jF = jF.map(() => 1); jG = jG.map(() => 1); }
      else if (R() < 0.006) { jump = 30 + Math.floor(R() * 90); jMul = R() < 0.5 ? 1.5 : 0.67; jF = formants.map(() => Math.exp(R.g() * 0.08)); jG = formants.map(() => Math.exp(R.g() * 0.7)); }   // 间歇跳频
      dPar = -dPar;
      const w = wander(x), r = Math.max(30, rate0 * (0.45 + 0.55 * v) * jMul * Math.exp(0.35 * w + R.g() * 0.04));   // 下限 30Hz：再慢就成了一个个分离的"嗒"
      const per = (1 / r) * (dbl ? 1 + 0.18 * dPar : 1);
      const n0 = Math.round(t * SR); if (n0 >= N) break;
      for (let k = Math.floor(n0 / 32), k1 = Math.min(NK, Math.ceil((n0 + per * SR) / 32) + 1); k < k1; k++) for (let i = 0; i < NF; i++) { const mv = formants[i][3] || 0.08; fM[i][k] = (1 + mv * (v - 0.5)) * (1 + mv * 0.6 * w) * jF[i]; gM[i][k] = jG[i]; }
      if (stuck > 0) { stuck--; held++; t += per; continue; }                                 // 粘住：这一周期没有滑脱
      if (R() < 0.012) { stuck = 1 + Math.floor(R() * 3); t += per; continue; }
      const a = v * Math.min(2, 1 + 0.3 * held) * (dbl ? 1 + 0.35 * dPar : 1) * Math.exp(R.g() * (rough || 0.25));   // 粘得越久，滑脱越大
      held = 0;
      for (let j = 0; j < 24 && n0 + j < N; j++) exc[n0 + j] += a * Math.exp(-j / 4) * (j ? 1 : 0.5);
      t += per;
    }
    const out = new Float64Array(N);
    formants.forEach(([f, q, g], i) => {
      const fm = fM[i], gm = gM[i], y = S.biquad(exc, 'bp', tt => f * fm[Math.min(NK - 1, Math.floor(tt * SR / 32))], q);
      for (let n = 0; n < N; n++) { const k = n >> 5, fr = (n & 31) / 32; out[n] += y[n] * g * (gm[k] * (1 - fr) + gm[Math.min(NK - 1, k + 1)] * fr); }
    });
    const fo = Math.round(0.01 * SR); for (let i = 0; i < fo && i < N; i++) { out[i] *= i / fo; out[N - 1 - i] *= i / fo; }
    return peakNorm(out, 1);
  }
  // 闪光：线 C 的 sparkle 参数是 density/bright/dur/dir，按本函数的设计换算：dur 直接传；density ≈ 每秒颗数/60；
  // bright 让线 C 的中心频率（10kHz×2^((bright−0.5)×1.2)）对准本函数的颗粒频率（约 f0 的 2–4 倍）
  function sparkleLayer(R, f0, dur, count) {
    if (S.types.sparkle) {
      const fc = Math.min(15000, f0 * 3), bright = cl(0.5 + Math.log2(fc / 10000) / 1.2, 0, 1), density = cl(count / Math.max(0.15, dur) / 60, 0.1, 1);
      return peakNorm(Float64Array.from(S.make('sparkle', { dur: Math.max(0.15, dur), density, bright, dir: 0, seed: seedOf(R), raw: true })), 1);
    }
    const out = S.buf(dur + 0.15), pent = [0, 2, 4, 7, 9];
    for (let i = 0; i < count; i++) {
      const f = Math.min(12500, f0 * Math.pow(2, (pent[Math.floor(R() * 5)] + 12 * (1 + Math.floor(R() * 2))) / 12));
      const y = S.modalBank([[f, R.range(25, 60), 1, -Math.PI / 2], [f * 2.76, 90, 0.2, -Math.PI / 2]], 0.15); for (let i = 0; i < 88; i++) y[i] *= i / 88;   // 余弦相位从 0 起 + 2ms 起音：铃声不带咔哒
      S.add(out, y, dur * Math.pow(R(), 0.7), R.range(0.2, 0.5));
    }
    return peakNorm(out, 1);
  }

  // ---------- 动作类 ----------
  const SURF = [['stone', '石地'], ['wood', '木地板'], ['dirt', '泥土'], ['grass', '草地'], ['gravel', '碎石'], ['metal', '金属'], ['water', '浅水']];
  const MAT_OF = { stone: 'stone', wood: 'wood', dirt: 'dirt', grass: 'dirt', gravel: 'stone', metal: 'metal', water: 'dirt' };
  // 各地面的碎粒层（中心频率/密度相对实测碎石中位的倍数；草=叶片摩擦，偏高频、更密、更短）
  const GRAIN = { stone: [1, 0.25, 1], wood: null, dirt: [0.45, 0.7, 1.2], grass: [2.0, 1.6, 0.6], gravel: [1, 1.2, 1], metal: null, water: null };
  // 一次脚接触 = 材质层 + 脚的闷响 + 碎粒；amp=相对强度，bright=脚掌（更亮更轻）
  function contact(R, surf, force, size, amp, isToe) {
    const L = [];
    if (surf === 'water') { L.push([splashLayer(R, 0.25 + 0.3 * size, force * (isToe ? 0.5 : 1)), 0, 0.9]); return S.mix(L.map(l => (l[2] *= amp, l))); }
    const mat = MAT_OF[surf];
    // 地面是大块、受约束、阻尼很大的物体，鞋底又软：撞击层的振铃要很快被压住（石/木/土 τ≈40ms，金属板 τ≈80ms；设计值，τ=15ms 时 CLAP 对参照反而下降）——否则脚步会像敲钟
    L.push([damp(impactLayer(mat, cl(size * 0.5 + (isToe ? 0.05 : 0.25), 0, 1), cl(force * (isToe ? 0.6 : 0.9), 0.05, 1), 'soft', R), surf === 'metal' ? 0.08 : 0.04 * (0.8 + 0.6 * size)), 0, surf === 'metal' ? 0.7 : 0.55]);
    const f = logq(M.thudF1, 0.5 + R.g() * 0.12) * Math.pow(2, (0.5 - size) * 0.8) * (isToe ? 1.3 : 1);
    L.push([thump(f, logq(M.thudT20, 0.5 + R.g() * 0.1) * (0.7 + 0.5 * force), R), 0, (surf === 'dirt' || surf === 'grass' ? 0.9 : 0.5) * (0.5 + 0.6 * force)]);
    const gp = GRAIN[surf];
    if (gp) {
      const dur = (0.05 + 0.1 * force) * (isToe ? 0.8 : 1);
      const g = grains(R, dur, logq(M.grainRate, 0.5) * gp[1] * (0.6 + 0.8 * force), logq(M.grainFc, 0.5) * gp[0], M.grainBw, logq(M.grainTau, 0.5) * gp[2], x => Math.exp(-x * 2.5) * (1 - x));
      L.push([peakNorm(g, 1), 0.002, (surf === 'gravel' ? 0.75 : surf === 'grass' ? 0.5 : 0.35) * (0.5 + 0.5 * force)]);
    }
    return S.mix(L.map(l => (l[2] *= amp, l)), 0.01);
  }
  const MOTION_P = [
    { k: 'surface', label: '地面', options: SURF, def: 'stone' },
    { k: 'force', label: '力度', min: 0, max: 1, step: 0.05, def: 0.5 },
    { k: 'size', label: '体型', min: 0, max: 1, step: 0.05, def: 0.5 },
  ];
  const MOT_REFS = [
    { name: '碎石落下（碎粒层参照）', path: 'casual UI/ROCKMvmt_MATERIAL STONE-Gravel Drop_B00M_CUCK.wav', offset: 2.482, dur: 0.61 },
    { name: '书本低落（闷响参照）', path: 'casual UI/OBJBook_IMPACT-Book Drop Low_B00M_CUCK.wav', offset: 2.11, dur: 0.37 },
    { name: '沙桶闷击', path: 'casual UI/DIRTImpt_IMPACT-Stone Sand Bucket Dull_B00M_CUCK.wav', offset: 0.1, dur: 0.33 },
  ];
  const MEAS_M = '库里没有专门的脚步/跳跃录音（CLAP 检索"footsteps"只找到碎石/书本落下）。实测部分：闷响频率/衰减（72 段闷击）、碎粒密度/频率/衰减（66 段碎石/沙）、布料碎粒（48 段）、材质层来自线 A impact 的学得模型。设计约定：脚跟→脚掌间隔 35–70ms、脚掌强度 0.35–0.6、双脚落地间隔 8–25ms、翻滚 3 次接触的时刻。';

  S.def('step', {
    group: '动作', name: '脚步', desc: '脚跟着地＋脚掌着地两次接触（脚掌更轻更亮）；每次 = 地面材质撞击层（用学到的撞击材质模型，软撞击物）＋脚的低频闷响＋碎粒层（碎石/土/草叶）',
    measured: MEAS_M, params: MOTION_P, refs: MOT_REFS,
    presets: [{ name: '石地·轻走', opts: { surface: 'stone', force: 0.3, size: 0.4 } }, { name: '木地板·普通', opts: { surface: 'wood', force: 0.5 } },
      { name: '碎石·重踏', opts: { surface: 'gravel', force: 0.8, size: 0.7 } }, { name: '草地·小跑', opts: { surface: 'grass', force: 0.5, size: 0.3 } },
      { name: '泥土', opts: { surface: 'dirt', force: 0.5 } }, { name: '金属板', opts: { surface: 'metal', force: 0.5 } }, { name: '浅水', opts: { surface: 'water', force: 0.5 } }],
    loud: o => 0.35 + 0.5 * o.force,
    gen: o => {
      const R = S.rng(o.seed), F = cl(o.force, 0, 1), Z = cl(o.size, 0, 1);
      const dt = lerp(0.07, 0.035, F) * Math.exp(R.g() * 0.15);
      const heel = contact(R, o.surface, F, Z, 1, false), toe = contact(R, o.surface, F, Z, lerp(0.35, 0.6, R()) , true);
      return fin(S.mix([[heel, 0.002, 1], [toe, 0.002 + dt, 1]], 0.02));
    },
  });
  S.def('jump', {
    group: '动作', name: '跳跃起跳', desc: '蹬地：短促摩擦擦地声＋轻接触（脚掌）＋衣物摆动的布料摩擦噪声（起跳后 0.2s 内）',
    measured: MEAS_M, params: MOTION_P, refs: MOT_REFS,
    presets: [{ name: '石地·普通跳', opts: { surface: 'stone', force: 0.5 } }, { name: '木地板·轻跳', opts: { surface: 'wood', force: 0.3, size: 0.3 } },
      { name: '碎石·大跳', opts: { surface: 'gravel', force: 0.9, size: 0.7 } }, { name: '草地', opts: { surface: 'grass', force: 0.6 } }],
    loud: o => 0.3 + 0.4 * o.force,
    gen: o => {
      const R = S.rng(o.seed), F = cl(o.force, 0, 1), Z = cl(o.size, 0, 1), surf = o.surface;
      const L = [[contact(R, surf, F * 0.5, Z, 0.7, true), 0.002, 1]];
      if (surf !== 'water') {
        const fc = surf === 'gravel' ? 2500 : surf === 'grass' ? 3500 : surf === 'dirt' ? 1100 : surf === 'metal' ? 3000 : 1800;
        L.push([peakNorm(friction(R, 0.03 + 0.04 * F, fc, 0.7, x => Math.min(1, x * 8) * Math.exp(-x * 3)), 1), 0.0, 0.25 + 0.3 * F]);
      }
      L.push([clothSwish(R, 0.12 + 0.1 * F, 1), 0.015, 0.18 + 0.15 * F * (0.5 + Z)]);
      return fin(S.mix(L, 0.02));
    },
  });
  S.def('land', {
    group: '动作', name: '落地', desc: '双脚几乎同时着地（相差 8–25ms）；力度越大：低频闷响越重越长、地面碎粒越多、高频接触越亮；落地后衣物一抖',
    measured: MEAS_M, params: MOTION_P, refs: MOT_REFS,
    presets: [{ name: '石地·轻落', opts: { surface: 'stone', force: 0.3 } }, { name: '石地·重落', opts: { surface: 'stone', force: 0.9, size: 0.7 } },
      { name: '木地板', opts: { surface: 'wood', force: 0.6 } }, { name: '碎石·重落', opts: { surface: 'gravel', force: 0.85 } },
      { name: '泥土', opts: { surface: 'dirt', force: 0.7 } }, { name: '浅水', opts: { surface: 'water', force: 0.7 } }],
    loud: o => 0.4 + 0.6 * o.force,
    gen: o => {
      const R = S.rng(o.seed), F = cl(o.force, 0, 1), Z = cl(o.size, 0, 1), surf = o.surface;
      const d2 = lerp(0.025, 0.008, F) * Math.exp(R.g() * 0.2);
      const L = [[contact(R, surf, F, Z, 1, false), 0.002, 1], [contact(R, surf, F * 0.8, Z, 0.75, false), 0.002 + d2, 1]];
      if (surf !== 'water') {   // 身体重心下沉的低频闷响（力度大时更低更长）
        const f = logq(M.thudF1, 0.35) * Math.pow(2, -F * 0.8 - (Z - 0.5) * 0.8);
        L.push([thump(f, logq(M.thudT20, 0.5 + 0.4 * F), R), 0.004, 0.4 + 0.9 * F]);
        if (GRAIN[surf]) {
          const gp = GRAIN[surf], g = grains(R, 0.08 + 0.25 * F, logq(M.grainRate, 0.5 + 0.3 * F) * gp[1], logq(M.grainFc, 0.5) * gp[0], M.grainBw, logq(M.grainTau, 0.5) * gp[2], x => Math.exp(-x * 3) * (1 - x) * (1 - x));
          L.push([peakNorm(g, 1), 0.01, (surf === 'gravel' ? 0.6 : 0.35) * (0.3 + 0.9 * F)]);
        }
      }
      L.push([clothSwish(R, 0.08, 1), 0.02 + d2, 0.08 + 0.1 * F]);
      return fin(S.mix(L, 0.03));
    },
  });
  S.def('roll', {
    group: '动作', name: '翻滚', desc: '身体与地面的连续摩擦（随翻转起伏两次）＋肩/背/脚 3 次接触＋全程衣物摩擦',
    measured: MEAS_M, params: MOTION_P, refs: MOT_REFS,
    presets: [{ name: '石地翻滚', opts: { surface: 'stone', force: 0.6 } }, { name: '草地翻滚', opts: { surface: 'grass', force: 0.5 } },
      { name: '碎石·快滚', opts: { surface: 'gravel', force: 0.8, size: 0.4 } }, { name: '木地板·重', opts: { surface: 'wood', force: 0.7, size: 0.8 } }],
    loud: o => 0.35 + 0.45 * o.force,
    gen: o => {
      const R = S.rng(o.seed), F = cl(o.force, 0, 1), Z = cl(o.size, 0, 1), surf = o.surface;
      const dur = (0.42 + 0.2 * Z) * lerp(1.15, 0.85, F);
      const hump = x => Math.pow(Math.abs(Math.sin(Math.PI * 2 * x * 0.95 + 0.15)), 1.2) * Math.min(1, x * 12) * Math.min(1, (1 - x) * 6);
      const fc = surf === 'gravel' ? 2200 : surf === 'grass' ? 3200 : surf === 'dirt' ? 900 : surf === 'metal' ? 2600 : surf === 'water' ? 1500 : 1400;
      const L = [[peakNorm(friction(R, dur, fc, 1.1, x => Math.pow(hump(x), 2)), 1), 0, 0.12 + 0.1 * F]];
      if (GRAIN[surf]) L.push([peakNorm(grains(R, dur, logq(M.grainRate, 0.5) * GRAIN[surf][1], logq(M.grainFc, 0.5) * GRAIN[surf][0], M.grainBw, logq(M.grainTau, 0.5), hump), 1), 0, 0.3 + 0.2 * F]);
      if (surf === 'water') L.push([splashLayer(R, 0.4, F), 0, 0.6]);
      [[0, 0.8], [0.42, 1], [0.86, 0.6]].forEach(([x, a]) => L.push([contact(R, surf, F * a, Z, a, x > 0.8), x * dur * (1 + R.g() * 0.04) + 0.002, 0.8]));
      L.push([clothSwish(R, dur, 1), 0, 0.2]);
      return fin(S.mix(L, 0.03));
    },
  });

  // ---------- 拾取 ----------
  // 金币：薄圆板的模态。频率比取自由圆板理论值（1 : 1.73 : 2.33 : 3.91 : 4.11 : 6.30 : 6.71）——实测只粗略支持 1.73 附近；
  // 真实硬币有浮雕、不完全轴对称，每个模态分裂成频率很接近的一对（实测单枚硬币文件里常见相距 4–20% 的成对峰），这里每个模态加一个相距 0.5–4% 的伴峰，产生拍频"嗡嗡"的颤动（伴峰比例是设计值）
  function coinStrike(R, f1, amp, bright) {
    const modes = [];
    M.coinRatios.forEach((r, i) => {
      const f = f1 * r * (1 + R.g() * 0.012); if (f >= 16000) return;
      const A = amp * Math.pow(0.62, i) * Math.exp(R.g() * 0.35) * Math.pow(f / f1, bright || 0), d = coinDecay(f) * Math.exp(R.g() * 0.2);
      modes.push([f, d, A, R() * TAU]);
      const f2 = f * (1 + R.range(0.005, 0.04)); if (f2 < 16000) modes.push([f2, d * Math.exp(R.g() * 0.2), A * R.range(0.3, 0.8), R() * TAU]);
    });
    const y = S.modalBank(modes, Math.min(1.2, 7 / Math.min(...modes.map(m => m[1]))) + 0.01);
    S.add(y, S.grain(cl(f1 * 1.2, 2500, 12000), 0.9, 0.0005, R), 0, amp * 0.5);
    return y;
  }
  // 硬币落在桌面/盒子上：被撞的桌面发出的短促低频"嗒"（4/6 个单枚硬币文件在 435–624Hz 有这个峰，衰减很快）
  function coinKnock(R, amp) {
    const f = logq(M.coinKnock.concat([M.coinKnock[3] * 1.05]), 0.5 + R.g() * 0.2), y = S.modalBank([[f, 160, 1, -Math.PI / 2], [f * 2.3, 300, 0.4, -Math.PI / 2]], 0.06);
    for (let i = 0; i < y.length; i++) y[i] *= amp; return y;
  }
  S.def('pickup_coin', {
    group: '拾取', name: '拾取金币', desc: '金币 = 薄金属圆板：撞击激发圆板模态（频率比取自由圆板理论值，每个模态带一个很近的伴峰产生颤动）。"叮当"风格：两声上行四度的金币敲击＋闪光（游戏惯例，音区比真硬币低）；"落下"风格：硬币本体高频振铃（实测 5–10kHz）＋桌面短促低频"嗒"，按实测间隔比/幅度比弹跳几下；"芯片"风格：两音方波',
    measured: '第二轮重测（tool/B/coinstats.py、coindecay.py，可复现）：只用 6 个单枚硬币文件（Big Silver Drop 三个变体、Drop Single Leather/Plastic Case、Single Drop On Table，共 36 段；第一轮混入的螺丝落玻璃、硬币落杯、垫圈、Drop Hand、Treasure Light 已排除）。' +
      '硬币本体最强模态（3kHz 以上）每文件中位 5.2–10kHz；频率比每文件取一组（≥一半的段里重复出现）再跨文件看：只有 1.73 附近在 2/6 个文件出现，2.33、3.91、4.11、6.3 没有文件支持 → 比值用自由圆板理论值，不是实测规律；' +
      '各频段衰减（每文件中位 → 跨文件中位）500Hz 104/s、1.5k 139、4.5k 89、8k 83、13k 60；弹跳只取间隔单调递减的序列（16 条）：首间隔中位 95ms、相邻间隔比中位 0.66（p25–p75 0.46–0.82）、幅度比中位 0.60。' +
      '叮当风格的音区（1.6–3.2kHz）、两音四度上行是游戏惯例（设计约定）。',
    params: [{ k: 'style', label: '风格', options: [['chime', '叮当（游戏感）'], ['drop', '落下（写实）'], ['retro', '复古芯片']], def: 'chime' },
      { k: 'size', label: '硬币大小', min: 0, max: 1, step: 0.05, def: 0.35 }, { k: 'force', label: '力度', min: 0, max: 1, step: 0.05, def: 0.6 }],
    presets: [{ name: '叮当·小金币', opts: { style: 'chime', size: 0.25 } }, { name: '叮当·大金币', opts: { style: 'chime', size: 0.7 } },
      { name: '落下·单枚', opts: { style: 'drop', size: 0.4 } }, { name: '落下·大银币重', opts: { style: 'drop', size: 0.8, force: 0.9 } }, { name: '芯片', opts: { style: 'retro' } }],
    refs: [{ name: '单枚硬币落桌', path: 'casual UI/OBJCoin_COIN-Single Drop On Table_B00M_CUCK.wav', offset: 0.05, dur: 0.6 },
      { name: '大银币落下', path: 'casual UI/OBJCoin_COIN-Big Silver Drop_B00M_CUCK.wav', offset: 0.1245, dur: 0.51 },
      { name: '小型收集物', path: 'casual interaction/收集物品 (Collectible)/益智游戏小型收集物04.wav', offset: 0.0039, dur: 0.73 }],
    loud: o => 0.55 + 0.35 * o.force,
    gen: o => {
      const R = S.rng(o.seed), Z = cl(o.size, 0, 1), F = cl(o.force, 0, 1);
      if (o.style === 'retro') {   // 芯片风金币：两音方波上行四度（经典做法，设计约定）；音区随大小（大 → 低），每次音高/长度略有不同
        const m = 83 + (0.35 - Z) * 6 + R.g() * 0.15, d2 = 0.32 * Math.exp(R.g() * 0.1);
        const a = S.osc(0.07, S.mtof(m), 'square'), b = S.osc(d2, S.mtof(m + 5), 'square'); S.envAD(a, 0.001, 0.5); S.envAD(b, 0.001, d2);
        return fin(S.mix([[a, 0, 0.5], [b, 0.07 * Math.exp(R.g() * 0.05), 0.5]], 0.01));
      }
      if (o.style === 'drop') {
        const f1 = logq(M.coinRing, cl(0.85 - 0.7 * Z + R.g() * 0.05, 0.05, 0.95));
        const L = [[coinStrike(R, f1, 1, 0.3 * F), 0.002, 1], [coinKnock(R, 0.5 + 0.4 * F), 0.002, 1]];
        let t = 0.002, gap = logq(M.coinGap, cl(0.5 + R.g() * 0.15 + 0.2 * (F - 0.5), 0.05, 0.95)), a = 1;
        const n = 2 + Math.round(R() * 3 + 2 * F);
        for (let k = 0; k < n; k++) {
          t += gap; a *= cl(logq(M.coinAmpRatio, 0.5 + R.g() * 0.12), 0.3, 0.95);   // 幅度比 >1 的多是检测误差/硬币翻转，夹到 0.95
          gap *= cl(logq(M.coinGapRatio, 0.5 + R.g() * 0.15), 0.3, 0.92);
          if (gap < 0.006) break;
          L.push([coinStrike(R, f1 * (1 + R.g() * 0.004), a, 0), t, 1], [coinKnock(R, 0.4 * a), t, 1]);
        }
        return fin(S.mix(L, 0.02));
      }
      // chime：两声上行纯四度（游戏惯例），第二声更响更长，尾部闪光；音区 1.6–3.2kHz 是设计值（真硬币本体在 5–10kHz，太尖）
      const f1 = 3200 * Math.pow(0.5, Z) * Math.exp(R.g() * 0.02);
      const L = [[coinStrike(R, f1, 0.7, 0.2), 0.002, 1], [coinStrike(R, f1 * Math.pow(2, 5 / 12), 1, 0.2), 0.075 + R.g() * 0.004, 1]];
      L.push([sparkleLayer(R, f1, 0.25, 5), 0.08, 0.25]);
      return fin(S.mix(L, 0.02));
    },
  });
  S.def('pickup_gem', {
    group: '拾取', name: '拾取宝石', desc: '宝石 = 玻璃/晶体：高频、清脆短促的非谐波模态（实测玻璃最低强模态中位 2.0kHz、振幅衰减率约 110/s，约 60ms 掉 60dB）；几颗晶体音上行（五声音阶，设计约定）＋高频闪光',
    measured: '玻璃 54 段（GLASTonl 3 个、Impact Treasure Gem、UIClick GLASS 若干）：最低强模态分位数 423/609/2040/3860/8480 Hz，衰减中位约 110/s 且随频率变化不大。玻璃模态频率比在直方图上没有明显的峰（形状各异），所以每颗宝石用 seed 抽一组非谐波比。',
    params: [{ k: 'size', label: '宝石大小', min: 0, max: 1, step: 0.05, def: 0.4 }, { k: 'force', label: '力度', min: 0, max: 1, step: 0.05, def: 0.6 },
      { k: 'notes', label: '晶体音数', min: 1, max: 5, step: 1, def: 3 }],
    presets: [{ name: '小宝石', opts: { size: 0.2, notes: 2 } }, { name: '大宝石', opts: { size: 0.7, notes: 4 } }, { name: '单颗清脆', opts: { notes: 1, size: 0.3 } }],
    refs: [{ name: 'Treasure Gem', path: 'casual UI/OBJCoin_COIN-Impact Treasure Gem_B00M_CUCK.wav', offset: 0.05, dur: 0.75 },
      { name: '玻璃杯余音', path: 'casual UI/GLASTonl_SHIMMER-Glass Ringout_B00M_CUCK.wav', offset: 0.05, dur: 1.2 }],
    loud: o => 0.6 + 0.3 * o.force,
    gen: o => {
      const R = S.rng(o.seed), Z = cl(o.size, 0, 1), F = cl(o.force, 0, 1);
      const f1 = logq(M.glassF1, cl(0.75 - 0.5 * Z, 0.1, 0.9)), rat = [1].concat([1, 2, 3, 4].map(i => Math.exp(R.range(Math.log(1.2 + i * 0.9), Math.log(2 + i * 1.1)))));
      const pent = [0, 3, 5, 7, 10, 12], L = [];
      for (let i = 0; i < o.notes; i++) {
        const f = f1 * Math.pow(2, pent[i] / 12), modes = rat.map((r, k) => [f * r, M.glassD * Math.exp(R.g() * 0.25) * (1 + 0.1 * k), Math.pow(0.55, k) * Math.pow(1.6, k * F * 0.5), R() * TAU]).filter(m => m[0] < 16000);
        const y = S.modalBank(modes, 0.9); S.add(y, S.grain(Math.min(12000, f * 3), 0.8, 0.0004, R), 0, 0.35 + 0.3 * F);
        L.push([y, 0.002 + i * 0.065 * (1 + R.g() * 0.05), 0.7 + 0.3 * i / Math.max(1, o.notes - 1)]);
      }
      L.push([sparkleLayer(R, f1, 0.35, 8), 0.03, 0.3]);
      return fin(S.mix(L, 0.02));
    },
  });
  S.def('pickup_potion', {
    group: '拾取', name: '拾取药水', desc: '玻璃瓶相碰的"叮"（瓶子比宝石大，频率更低）＋瓶中液体晃荡：一串气泡（Minnaert 共振，半径 1.5–5mm → 0.65–2.2kHz，起始后频率微升）',
    measured: '瓶子"叮"取玻璃实测分布的低段（最低强模态 p25 附近）、衰减 110/s；气泡频率/衰减/上滑用物理公式（Minnaert；van den Doel 2005 的衰减与上滑近似），不是从录音测的；参照：Glass Bottle Olive Oil（CLAP 检索"glass bottle liquid sloshing"第一名）。',
    params: [{ k: 'size', label: '瓶子大小', min: 0, max: 1, step: 0.05, def: 0.5 }, { k: 'force', label: '晃动力度', min: 0, max: 1, step: 0.05, def: 0.5 }],
    presets: [{ name: '小瓶', opts: { size: 0.25 } }, { name: '大瓶·猛晃', opts: { size: 0.8, force: 0.9 } }, { name: '轻拿', opts: { force: 0.2 } }],
    refs: [{ name: '玻璃瓶橄榄油', path: 'casual UI/LIQMisc_MATERIAL LIQUID-Glass Bottle Olive Oil_B00M_CUCK.wav', offset: 2.323, dur: 1.07 },
      { name: '塑料瓶倒置', path: 'casual UI/LIQBubl_MATERIAL LIQUID-Plastic Bottle Turn Down_B00M_CUCK.wav', offset: 5.371, dur: 0.6 }],
    loud: o => 0.5 + 0.3 * o.force,
    gen: o => {
      const R = S.rng(o.seed), Z = cl(o.size, 0, 1), F = cl(o.force, 0, 1);
      const f1 = logq(M.glassF1, cl(0.3 - 0.2 * Z, 0.05, 0.9)), rat = [1, 2.32, 3.9, 5.6].map(r => r * (1 + R.g() * 0.03));
      const clink = S.modalBank(rat.map((r, k) => [f1 * r, M.glassD * (1 + 0.15 * k) * 1.6, Math.pow(0.5, k), R() * TAU]).filter(m => m[0] < 16000), 0.5);
      S.add(clink, S.grain(Math.min(10000, f1 * 4), 0.8, 0.0004, R), 0, 0.5);
      const L = [[clink, 0.002, 0.8]];
      const dur = 0.18 + 0.3 * F, nb = Math.round(5 + 12 * F);
      for (let i = 0; i < nb; i++) { const t = 0.03 + dur * Math.pow(R(), 0.8); L.push([bubble(R, lerp(1.5, 5, Math.pow(R(), 1 - 0.5 * Z)), Math.exp(R.g() * 0.4) * (1 - 0.5 * (t / dur))), t, 0.35]); }
      L.push([peakNorm(friction(R, dur, 900, 0.7, x => Math.sin(Math.PI * x) * (0.6 + 0.4 * Math.sin(TAU * 7 * x))), 1), 0.03, 0.08 + 0.1 * F]);   // 液体整体晃荡的低沉噪声
      return fin(S.mix(L, 0.03));
    },
  });

  // ---------- 机关 ----------
  // 共振峰（设计值，库里没有吱呀录音）：每块木头/每扇门按 seed 抽频率（±15%）和 Q，间距不规则；[f, Q, 增益, 随速度移动量]
  const WOOD_FORM = (s, R) => [[lerp(620, 360, s), 7, 1], [lerp(1350, 900, s), 9, 0.7], [lerp(2600, 1900, s), 11, 0.35], [lerp(4300, 3300, s), 12, 0.15]]
    .map(([f, q, g]) => [f * Math.exp(R.g() * 0.15), q * R.range(0.6, 1.2), g * Math.exp(R.g() * 0.3), 0.08]);
  const METAL_FORM = (s, R) => [[lerp(1400, 900, s), 8, 1], [lerp(3100, 2300, s), 9, 0.6], [lerp(5600, 4300, s), 10, 0.3]]
    .map(([f, q, g]) => [f * Math.exp(R.g() * 0.1), q * R.range(0.75, 1.25), g, 0.2]);
  const MECH_REFS = [{ name: '箱扣扣上', path: 'casual UI/OBJLug_IMPACT-Suitcase Latch Snap_B00M_CUCK.wav', offset: 0.0, dur: 0.4 },
    { name: '玻璃棘轮', path: 'casual UI/GLASMvmt_RATTLE-Glass Thick Ratchet_B00M_CUCK.wav', offset: 0.0, dur: 0.42 }];
  const MEAS_MECH = '实测：咔哒 105 段（棘轮/弹珠台装填/机械解锁/箱扣/卷尺/枪栓/卡扣）——相邻咔哒间隔分位数 16/22/32/49/78ms、间隔变异系数中位 0.53、单个咔哒 t20 中位 15ms；落下/关上的撞击层由线 A impact 的学得模型生成。设计约定：吱呀（库里没有真正的木头吱呀录音，"吱呀转动"文件实际是敲击声）按粘滑摩擦原理设计——基准脉冲率 60–320Hz（随门/箱大小与速度；creakPitch −7…+12 半音再整体移），开合中随速度在 45%–100% 间变化（下限 30Hz），偶发周期加倍、跳到 ×1.5/×0.67（同时共振主次换一次）、粘住 1–3 个周期；木头共振峰 360–4300Hz、金属 900–5600Hz（Q 6–10），均按 seed 抽；各段时序。';
  function latch(R, size, metal) {   // 锁扣：两下咔哒（拨开 + 弹回），间隔取实测咔哒间隔的中段
    const f1 = lerp(3600, 2000, size) * Math.exp(R.g() * 0.08), gap = logq(M.clickIoi, 0.5 + R.g() * 0.15);
    return S.mix([[click(R, f1, logq(M.clickT20, 0.5), 1), 0.002, 1], [click(R, f1 * 1.12, logq(M.clickT20, 0.4), 0.7), 0.002 + gap, 0.6]], 0.02);
  }
  S.def('chest_open', {
    group: '机关', name: '开宝箱', desc: '锁扣两下咔哒 → 箱盖铰链"吱呀"（粘滑摩擦：周期性滑脱脉冲激励木头共振，脉冲率随开盖速度先升后降）→ 盖子打开到底轻轻一磕；可加宝藏闪光',
    measured: MEAS_MECH,
    params: [{ k: 'size', label: '箱子大小', min: 0, max: 1, step: 0.05, def: 0.5 }, { k: 'force', label: '开盖速度', min: 0, max: 1, step: 0.05, def: 0.5 },
      { k: 'creak', label: '吱呀程度', min: 0, max: 1, step: 0.05, def: 0.6 }, { k: 'creakPitch', label: '吱呀音高(半音)', min: -7, max: 12, step: 1, def: 0 }, { k: 'sparkle', label: '宝藏闪光', min: 0, max: 1, step: 0.05, def: 0.5 }],
    presets: [{ name: '木箱·普通', opts: {} }, { name: '大箱·慢开·老旧', opts: { size: 0.85, force: 0.25, creak: 0.9 } }, { name: '小箱·快开', opts: { size: 0.2, force: 0.85, creak: 0.3 } }, { name: '无闪光', opts: { sparkle: 0 } }],
    refs: MECH_REFS, loud: o => 0.75,
    gen: o => {
      const R = S.rng(o.seed), Z = cl(o.size, 0, 1), V = cl(o.force, 0, 1), C = cl(o.creak, 0, 1);
      const L = [[latch(R, Z, true), 0, 0.7]];
      const t1 = 0.09 + 0.05 * Z, dur = lerp(0.35, 0.9, Z) * lerp(1.5, 0.6, V);
      if (C > 0.02) L.push([creak(R, dur, lerp(240, 70, Z) * lerp(0.7, 1.3, V) * S.semis(o.creakPitch || 0), WOOD_FORM(Z, R), x => Math.sin(Math.PI * Math.pow(x, 0.8)), 0.3), t1, 0.25 + 0.55 * C]);
      L.push([impactLayer('wood', 0.4 + 0.4 * Z, 0.25 + 0.3 * V, 'soft', R), t1 + dur, 0.45]);
      if (o.sparkle > 0.02) L.push([sparkleLayer(R, 1800, 0.6, 10), t1 + dur * 0.4, 0.35 * o.sparkle]);
      return fin(S.mix(L, 0.03));
    },
  });
  S.def('door_open', {
    group: '机关', name: '开门', desc: '把手转动两下咔哒（门闩缩回）→ 门轴长"吱呀"（粘滑摩擦，速度曲线先快后慢）＋轻微气流',
    measured: MEAS_MECH,
    params: [{ k: 'size', label: '门大小', min: 0, max: 1, step: 0.05, def: 0.6 }, { k: 'force', label: '开门速度', min: 0, max: 1, step: 0.05, def: 0.4 },
      { k: 'creak', label: '吱呀程度', min: 0, max: 1, step: 0.05, def: 0.7 }, { k: 'creakPitch', label: '吱呀音高(半音)', min: -7, max: 12, step: 1, def: 0 }, { k: 'material', label: '门轴', options: [['wood', '木门'], ['metal', '铁门']], def: 'wood' }],
    presets: [{ name: '木门·慢开', opts: { force: 0.25 } }, { name: '木门·快开', opts: { force: 0.8, creak: 0.4 } }, { name: '铁门·大', opts: { material: 'metal', size: 0.9 } }, { name: '无吱呀', opts: { creak: 0 } }],
    refs: MECH_REFS, loud: o => 0.7,
    gen: o => {
      const R = S.rng(o.seed), Z = cl(o.size, 0, 1), V = cl(o.force, 0, 1), C = cl(o.creak, 0, 1), met = o.material === 'metal';
      const L = [[latch(R, Z, met), 0, 0.6]];
      const t1 = 0.12, dur = lerp(0.5, 1.1, Z) * lerp(1.3, 0.6, V);
      // 速度曲线：推开后很快到最快，然后减速到停（结尾速度归零，吱呀自然停下；第一轮结尾还有 0.3 被硬切）；起伏相位在外面一次抽好
      const ph = R() * 3, spd = x => Math.min(1, x * 5) * Math.pow(1 - x, 0.8) * (0.85 + 0.15 * Math.sin(TAU * 1.3 * x + ph));
      if (C > 0.02) L.push([creak(R, dur, (met ? lerp(320, 140, Z) : lerp(200, 60, Z)) * lerp(0.75, 1.25, V) * S.semis(o.creakPitch || 0), met ? METAL_FORM(Z, R) : WOOD_FORM(Z, R), spd, met ? 0.15 : 0.3), t1, 0.2 + 0.6 * C]);
      L.push([peakNorm(friction(R, dur * 0.6, 400, 0.7, x => Math.pow(Math.sin(Math.PI * x), 2)), 1), t1, 0.03 + 0.05 * V]);   // 门扇带动的轻微气流
      return fin(S.mix(L, 0.03));
    },
  });
  S.def('door_close', {
    group: '机关', name: '关门', desc: '门扇推动空气的低沉气流 → 撞上门框的大块木头闷响（用学到的撞击材质模型）＋低频闷响 → 门闩落位咔哒＋门框小抖动',
    measured: MEAS_MECH,
    params: [{ k: 'size', label: '门大小', min: 0, max: 1, step: 0.05, def: 0.6 }, { k: 'force', label: '关门力度', min: 0, max: 1, step: 0.05, def: 0.6 },
      { k: 'material', label: '门', options: [['wood', '木门'], ['metal', '铁门']], def: 'wood' }],
    presets: [{ name: '木门·轻关', opts: { force: 0.3 } }, { name: '木门·摔门', opts: { force: 0.95, size: 0.7 } }, { name: '铁门', opts: { material: 'metal', force: 0.7 } }],
    refs: [{ name: '书本低落（闷响）', path: 'casual UI/OBJBook_IMPACT-Book Drop Low_B00M_CUCK.wav', offset: 2.11, dur: 0.37 }, MECH_REFS[0]],
    loud: o => 0.5 + 0.5 * o.force,
    gen: o => {
      const R = S.rng(o.seed), Z = cl(o.size, 0, 1), F = cl(o.force, 0, 1), met = o.material === 'metal';
      const pre = 0.06 + 0.1 * (1 - F);
      const L = [[peakNorm(friction(R, pre + 0.02, 300, 0.5, x => Math.pow(x, 2)), 1), 0, 0.12 + 0.15 * F]];
      L.push([impactLayer(met ? 'metal' : 'wood', 0.65 + 0.3 * Z, 0.4 + 0.6 * F, 'hard', R), pre, 1]);
      L.push([thump(logq(M.thudF1, 0.25) * Math.pow(2, -Z * 0.6), logq(M.thudT20, 0.5 + 0.35 * F), R), pre + 0.001, 0.4 + 0.7 * F]);
      const tl = pre + 0.03 + 0.04 * R();
      L.push([click(R, lerp(3200, 2200, Z), logq(M.clickT20, 0.5), 1), tl, 0.35]);
      for (let k = 1; k <= 2; k++) L.push([click(R, lerp(2600, 1800, Z) * (1 + R.g() * 0.05), logq(M.clickT20, 0.3), 0.6), tl + k * logq(M.clickIoi, 0.4 + 0.2 * R()), 0.15 / k * F]);
      return fin(S.mix(L, 0.04));
    },
  });
  S.def('lever', {
    group: '机关', name: '拉杆', desc: '棘轮：拉动过程中一串金属咔哒（间隔取实测棘轮/装填类中段，带随机）→ 到位时金属撞击＋低频闷响',
    measured: MEAS_MECH + ' 咔哒间隔的随机度用 0.25（实测变异系数中位 0.53 含很多不规则的抖动类录音）。',
    params: [{ k: 'size', label: '拉杆大小', min: 0, max: 1, step: 0.05, def: 0.5 }, { k: 'force', label: '拉动速度', min: 0, max: 1, step: 0.05, def: 0.5 },
      { k: 'teeth', label: '咔哒数', min: 2, max: 12, step: 1, def: 6 }],
    presets: [{ name: '普通拉杆', opts: {} }, { name: '大闸·慢拉', opts: { size: 0.9, force: 0.25, teeth: 8 } }, { name: '小开关·快', opts: { size: 0.15, force: 0.9, teeth: 3 } }],
    refs: MECH_REFS, loud: o => 0.75,
    gen: o => {
      const R = S.rng(o.seed), Z = cl(o.size, 0, 1), V = cl(o.force, 0, 1), n = Math.round(o.teeth);
      const ioi = logq(M.clickIoi, cl(0.5 + 0.3 * (0.5 - V) + 0.15 * Z, 0.05, 0.95)), f1 = lerp(3800, 1800, Z), L = [];
      let t = 0.002;
      for (let k = 0; k < n; k++) {
        const x = k / Math.max(1, n - 1);
        L.push([click(R, f1 * Math.exp(R.g() * 0.03), logq(M.clickT20, 0.45), 0.8), t, 0.45 + 0.25 * x]);
        t += ioi * (1 - 0.3 * x * V) * Math.exp(R.g() * 0.25);
      }
      L.push([impactLayer('metal', 0.4 + 0.5 * Z, 0.6 + 0.3 * V, 'hard', R), t + 0.01, 1]);
      L.push([thump(lerp(160, 80, Z), 0.05, R), t + 0.011, 0.5]);
      return fin(S.mix(L, 0.04));
    },
  });
  S.motionStats = M;
})();
