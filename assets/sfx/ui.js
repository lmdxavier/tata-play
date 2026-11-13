/* sfxgen v2.0 · 线 B · UI 音效（合成器音色 + 音符序列）
 * 发声原理：UI 音不是物理碰撞，是"设计出来的电子音"：一个或几个音符（振荡器 + 谐波/FM 音色 + 起音/指数衰减包络），
 * 叠加音高滑动、可选回声（延迟反馈）、开头一个极短噪声"咔"、随音符衰减的带通噪声层、奖励/升级类再加高频闪光颗粒。
 * 参数来源：
 *   STAT（音高/轮廓/单音衰减/谐波/音符数）：tool/B/tonal.py、partials.py 第一轮逐段测量（399 段，按段统计，包含后来留出的家族；只用来抽音高等分布，不做频谱拟合）。
 *   LT（整体包络/长时频谱/谱平坦度/高频衰减）：tool/B/uiltas2.py 第二轮——按"素材家族"（同一套设计的编号变体算 1 个）先取中位再跨家族统计，
 *     每类留出约 1/4 家族不参与统计，专门给 CLAP 评分（_tmp/B/ui_lt2.json 有留出清单）。
 *   训练家族越少，往实测拉得越轻：≥8 个家族 → 频谱/包络强度 0.6、±12dB；4–7 个 → 0.35/0.4、±8dB；<4 个 → 只校正整体高低频倾斜（tilt）＋包络 0.25。
 * 设计约定（库里测不出来的，如实标注）：多音符时的音阶/音程、回声延迟与反馈量、四种风格 soft/toon/crystal/retro 的音色映射、各类的音区移位 plan.oct。
 */
(function () {
  'use strict';
  const S = (typeof window !== 'undefined' ? window : globalThis).SFX2;
  const SR = S.SR, TAU = 2 * Math.PI;

  // ---------- 音高/音符统计（第一轮 tonal.py/partials.py，分位数 p10/p25/p50/p75/p90，按段统计） ----------
  // m: 主音高 MIDI（最强谱峰，富谐波/FM 音色时常不是基频）；gl: 轮廓（半音）；t20: 单音掉 20dB 时间(s)；h2/h3: 2、3 次谐波相对基频 dB（中位）；inh: 非谐波占比（中位）
  // nev: 能干净测出音高的音符数（口径严格，分离不清的起音不计）；ioi: 音符间隔(s)；n: 段数
  const STAT = {
    ui_click:   { m: [80.7, 94.2, 101.3, 114.3, 116.6], gl: [-43.9, -27.1, -9.6, 1.3, 9.2], t20: [0.037, 0.07, 0.107, 0.184, 0.236], h2: -33, h3: -36, inh: 0.18, nev: [0, 0, 1, 1, 2], ioi: 0.151, n: 70 },
    ui_hover:   { m: [44.6, 60.1, 70.3, 82.4, 86.9], gl: [-20, -5.7, 5.0, 17.7, 36.5], t20: [0.058, 0.093, 0.181, 0.25, 0.286], h2: -22, h3: -37, inh: 0.05, nev: [0, 0, 0, 0, 1], ioi: 0.12, n: 21 },
    ui_confirm: { m: [78.2, 91.7, 103.7, 108.4, 110.2], gl: [-34.1, -11.8, -4.6, 2.3, 11.1], t20: [0.032, 0.077, 0.174, 0.253, 0.314], h2: -34, h3: -50, inh: 0.12, nev: [0, 1, 1, 2, 2], ioi: 0.122, n: 32 },
    ui_cancel:  { m: [55.7, 64.0, 70.0, 73.4, 87.7], gl: [-32.5, -28.8, -9.6, 5.1, 21.7], t20: [0.068, 0.099, 0.113, 0.244, 0.378], h2: -20, h3: -19, inh: 0.03, nev: [0, 0, 1, 1, 2], ioi: 0.119, n: 14 },
    ui_error:   { m: [44.1, 56.2, 64.1, 74.7, 87.7], gl: [-39.9, -26.2, -14.2, 1.0, 5.4], t20: [0.092, 0.123, 0.363, 1.07, 1.908], h2: -14, h3: -20, inh: 0.02, nev: [0, 0, 1, 2.25, 4], ioi: 0.174, n: 40 },
    ui_open:    { m: [53.1, 59.2, 74.4, 85.1, 93.7], gl: [4.9, 7.4, 15.1, 29.2, 40.1], t20: [0.065, 0.116, 0.27, 0.409, 0.511], h2: -34, h3: -40, inh: 0.06, nev: [0, 0, 1, 1.5, 2.2], ioi: 0.128, n: 39 },
    ui_close:   { m: [44.6, 51.4, 88.2, 94.1, 115.2], gl: [-73.6, -42.4, -11.8, -5.2, -3.2], t20: [0.118, 0.156, 0.264, 0.678, 0.804], h2: -24, h3: -41, inh: 0.02, nev: [0, 0, 0, 1, 2], ioi: 0.163, n: 37 },
    ui_levelup: { m: [38.5, 46.5, 56.2, 85.7, 102.9], gl: [-36.9, -10.5, 0.1, 14.9, 39.8], t20: [0.216, 0.344, 0.662, 1.238, 1.611], h2: -16, h3: -19, inh: 0.07, nev: [0, 0, 1, 3.5, 5], ioi: 0.183, n: 31 },
    ui_reward:  { m: [38.5, 64.1, 85.4, 99.6, 112.4], gl: [-33.4, -11.3, 0, 16.4, 31.5], t20: [0.316, 0.578, 0.952, 1.411, 2.122], h2: -10, h3: -20, inh: 0.14, nev: [0, 0, 0, 3.25, 6], ioi: 0.203, n: 60 },
    ui_notify:  { m: [68.5, 72.1, 76.2, 82.3, 86.8], gl: [-14.8, -8.1, 0.2, 2.4, 28.8], t20: [0.165, 0.192, 0.235, 0.242, 0.247], h2: -7, h3: -19, inh: 0.40, nev: [0, 0, 1, 1.5, 2], ioi: 0.148, n: 15 },
  };
  // ---------- 整体音色/包络（第二轮 tool/B/uiltas2.py，训练家族统计；留出家族不在内） ----------
  // fam: 训练家族数；files: 该类全部文件数（含留出）；len: 有效时长分位数(s，峰值 −40dB 以上，每家族等权)；att: 起音(−30dB→峰)；
  // fl: 谱平坦度（4096 点 Welch 平均谱、60Hz–16kHz，在各段自己的有效时长上算；注意平坦度随时长变化，白噪声在此定义下 0.09s≈0.56、0.3s≈0.90、0.7s≈0.96）；
  // hf30: 6kHz 以上能量从峰值掉 30dB 的时间(s)；env: 有效时长内 16 点归一化 RMS 包络(dB)；lt: 24 个对数频带（60Hz–16kHz）长时平均频谱（dB，相对总能量）。
  const LT = {
    ui_click: { fam: 14, files: 36, len: [0.1, 0.205, 0.329, 0.454, 0.584], att: 0.032, fl: 0.279, hf30: 0.083, env: [-31.9, -6.9, -11.0, -10.3, -10.6, -10.8, -12.7, -14.3, -16.1, -22.3, -23.3, -23.7, -26.0, -30.1, -33.3, -38.0], lt: [-32.7, -34.5, -28.1, -27.3, -29.7, -28.7, -25.9, -26.4, -22.1, -21.8, -18.6, -20.7, -22.9, -19.5, -17.3, -15.2, -16.1, -16.5, -13.8, -12.5, -11.1, -12.1, -11.4, -11.0] },
    ui_hover: { fam: 4, files: 21, len: [0.137, 0.205, 0.389, 0.602, 0.673], att: 0.025, fl: 0.084, hf30: 0.205, env: [-25.1, -11.3, -8.8, -12.1, -16.3, -22.0, -22.0, -23.9, -23.4, -24.2, -25.8, -25.9, -32.4, -31.8, -36.3, -37.9], lt: [-18.7, -23.0, -19.3, -18.3, -19.9, -15.9, -15.5, -17.1, -13.6, -14.5, -13.9, -14.6, -15.7, -22.1, -22.7, -23.3, -19.0, -20.2, -20.9, -20.5, -21.2, -21.8, -21.7, -21.4] },
    ui_confirm: { fam: 5, files: 7, len: [0.085, 0.087, 0.439, 0.659, 0.783], att: 0.075, fl: 0.173, hf30: 0.134, env: [-30.4, -6.2, -6.6, -3.9, -6.9, -9.4, -12.2, -14.2, -18.5, -20.4, -24.3, -26.5, -29.5, -31.9, -37.5, -38.6], lt: [-41.0, -48.1, -46.3, -46.8, -46.2, -38.1, -34.6, -33.3, -32.4, -30.1, -29.7, -31.2, -22.1, -16.3, -15.9, -21.1, -23.2, -20.4, -11.0, -8.9, -13.6, -16.1, -11.6, -13.9] },
    ui_cancel: { fam: 4, files: 9, len: [0.61, 0.671, 0.743, 0.746, 0.756], att: 0.061, fl: 0.148, hf30: 0.187, env: [-32.8, -6.8, -8.2, -17.4, -11.2, -10.4, -14.2, -14.7, -16.7, -18.1, -26.1, -30.2, -34.5, -38.5, -39.4, -38.1], lt: [-31.7, -35.5, -27.6, -29.3, -27.6, -23.2, -14.2, -18.3, -17.9, -16.7, -17.8, -16.5, -18.1, -16.6, -12.9, -13.0, -14.2, -18.9, -14.8, -14.9, -15.4, -19.3, -20.1, -18.2] },
    ui_error: { fam: 6, files: 31, len: [0.973, 1.132, 1.646, 2.21, 3.307], att: 0.367, fl: 0.168, hf30: 0.367, env: [-31.1, -12.9, -13.6, -11.0, -11.3, -11.2, -11.8, -16.1, -13.7, -16.4, -16.1, -22.6, -28.0, -34.2, -37.1, -38.4], lt: [-21.4, -21.7, -14.4, -15.0, -16.9, -13.7, -17.2, -17.0, -15.4, -15.6, -13.7, -12.1, -13.8, -12.9, -14.6, -16.9, -15.0, -14.6, -15.1, -15.8, -16.2, -16.3, -18.5, -18.0] },
    ui_open: { fam: 6, files: 10, len: [0.387, 0.404, 0.703, 1.112, 1.851], att: 0.06, fl: 0.158, hf30: 0.181, env: [-30.7, -12.2, -9.0, -11.0, -9.0, -8.0, -10.7, -14.2, -17.2, -20.4, -23.7, -25.3, -27.7, -31.0, -36.4, -39.3], lt: [-21.5, -23.2, -17.7, -16.8, -14.0, -12.9, -15.3, -14.8, -15.9, -17.5, -18.6, -19.6, -18.7, -19.2, -17.0, -17.1, -18.0, -19.3, -19.8, -19.4, -19.1, -20.2, -21.2, -23.7] },
    ui_close: { fam: 3, files: 7, len: [0.332, 0.364, 0.384, 0.422, 0.483], att: 0.14, fl: 0.287, hf30: 0.087, env: [-34.1, -14.9, -12.7, -10.5, -6.7, -4.2, -5.2, -2.5, -3.1, -6.3, -8.6, -13.2, -12.9, -19.6, -29.2, -37.7], lt: [-31.7, -28.2, -21.6, -22.6, -24.9, -21.6, -19.7, -18.6, -17.8, -15.4, -11.8, -10.6, -10.6, -10.9, -11.3, -10.6, -12.1, -12.5, -15.2, -15.4, -14.8, -15.9, -16.5, -15.9] },
    ui_levelup: { fam: 5, files: 31, len: [0.464, 0.999, 1.797, 2.434, 2.622], att: 0.097, fl: 0.133, hf30: 0.331, env: [-25.5, -13.7, -8.2, -7.8, -7.1, -8.4, -8.7, -11.9, -11.0, -10.4, -18.2, -17.5, -24.9, -24.0, -31.3, -39.3], lt: [-12.8, -13.4, -11.5, -15.5, -17.0, -16.4, -20.2, -19.1, -17.8, -17.4, -12.8, -18.6, -22.5, -20.2, -16.6, -18.0, -17.7, -15.4, -15.1, -14.9, -17.4, -17.6, -18.7, -19.8] },
    ui_reward: { fam: 10, files: 60, len: [0.559, 0.724, 1.482, 2.729, 3.321], att: 0.091, fl: 0.117, hf30: 0.35, env: [-20.8, -4.7, -7.7, -9.8, -11.5, -11.4, -15.4, -12.9, -15.1, -15.7, -20.0, -24.3, -28.7, -30.3, -34.2, -38.6], lt: [-22.1, -23.3, -20.1, -21.3, -23.8, -22.6, -25.0, -23.2, -19.6, -18.9, -15.0, -15.4, -12.9, -15.1, -13.4, -12.8, -13.8, -17.1, -16.6, -15.6, -13.7, -16.6, -17.5, -20.0] },
    ui_notify: { fam: 2, files: 15, len: [0.504, 0.626, 0.73, 0.753, 0.824], att: 0.075, fl: 0.101, hf30: 0.255, env: [-11.3, -4.1, -7.8, -11.2, -11.5, -8.4, -12.9, -12.6, -19.5, -23.4, -25.2, -22.4, -27.2, -32.8, -37.7, -38.7], lt: [-35.4, -37.2, -27.3, -25.1, -21.8, -17.9, -21.3, -19.9, -14.1, -9.6, -10.1, -13.4, -11.9, -11.2, -12.6, -15.3, -15.7, -16.8, -16.3, -20.2, -21.6, -23.5, -25.7, -26.4] },
  };
  // 训练家族数 → 往实测拉的强度（家族少时只做整体倾斜，避免把音色推向两三套素材）
  const tier = fam => fam >= 8 ? { s: 0.6, lim: 12, e: 0.6, elim: 12, tilt: false } : fam >= 4 ? { s: 0.35, lim: 8, e: 0.4, elim: 8, tilt: false } : { s: 0.5, lim: 6, e: 0.25, elim: 6, tilt: true };
  const BC = Array.from({ length: 24 }, (_, i) => 60 * Math.pow(16000 / 60, (i + 0.5) / 24));   // 频带几何中心
  const LB = BC.map(f => Math.log2(f / 1000));
  const slopeOf = v => { let mx = 0, my = 0; for (let b = 0; b < 24; b++) { mx += LB[b]; my += v[b]; } mx /= 24; my /= 24; let sxy = 0, sxx = 0; for (let b = 0; b < 24; b++) { sxy += (LB[b] - mx) * (v[b] - my); sxx += (LB[b] - mx) ** 2; } return sxy / sxx; };
  // 固定长度分析：4096 点汉宁窗帧（最多约 16 帧，跳步随长度增大），累加到 24 个频带 → dB（相对总能量）
  const NA = 4096, BIN0 = [], BIN1 = [];
  for (let b = 0; b < 24; b++) { BIN0.push(Math.max(1, Math.ceil(60 * Math.pow(16000 / 60, b / 24) * NA / SR))); BIN1.push(Math.min(NA / 2, Math.ceil(60 * Math.pow(16000 / 60, (b + 1) / 24) * NA / SR))); }
  const HANN = Float64Array.from({ length: NA }, (_, i) => 0.5 - 0.5 * Math.cos(TAU * i / (NA - 1)));
  function bandDb(y) {
    const L = y.length, hop = Math.max(NA / 2, Math.floor((L - NA) / 15)), E = new Float64Array(24), re = new Float64Array(NA), im = new Float64Array(NA);
    const st = []; for (let s = 0; s === 0 || s + NA <= L; s += hop) st.push(s);
    for (let j = 0; j < st.length; j += 2) {   // 两帧实信号拼成一个复数 FFT（实部一帧、虚部一帧），再按共轭对称拆开：FFT 次数减半
      const s1 = st[j], s2 = st[j + 1]; re.fill(0); im.fill(0);
      for (let i = 0; i < NA && s1 + i < L; i++) re[i] = y[s1 + i] * HANN[i];
      if (s2 != null) for (let i = 0; i < NA && s2 + i < L; i++) im[i] = y[s2 + i] * HANN[i];
      S.fft(re, im, false);
      for (let b = 0; b < 24; b++) for (let k = BIN0[b]; k < BIN1[b]; k++) {
        const ar = re[k], ai = im[k], br = re[NA - k], bi = im[NA - k];
        E[b] += ((ar + br) ** 2 + (ai - bi) ** 2) / 4 + ((ai + bi) ** 2 + (ar - br) ** 2) / 4;   // |X1|²+|X2|²
      }
    }
    let tot = 0; for (let b = 0; b < 24; b++) tot += E[b];
    if (!(tot > 0)) return null;
    return Array.from(E, e => 10 * Math.log10(e / tot + 1e-12));
  }
  // 频谱校色：增益曲线（每频带 dB）→ 1024 抽头线性相位 FIR → 4096 点分块重叠相加卷积（耗时与长度成正比，不再做整段大 FFT）。
  // tilt=true 时只校正整体高低频倾斜（线性回归斜率之差），不碰细节形状。只改"整体音色倾向"；不是套用某段录音。
  const NF = 1024, NB = 4096, BL = NB - NF;
  function specMatch(y, lt, T, bright) {
    const cur = bandDb(y); if (!cur) return y;
    let g0;
    if (T.tilt) { const ds = T.s * (slopeOf(lt) - slopeOf(cur)) + bright * 3; g0 = LB.map(l => Math.max(-T.lim, Math.min(T.lim, ds * l))); }
    else g0 = lt.map((v, b) => Math.max(-T.lim, Math.min(T.lim, T.s * (v - cur[b]) + bright * 3 * LB[b])));
    const g = g0.map((v, b) => (g0[Math.max(0, b - 1)] + 2 * v + g0[Math.min(23, b + 1)]) / 4);
    const LR = Math.log(16000 / 60);
    const gainAt = f => { const p = 24 * Math.log(Math.max(1, f) / 60) / LR - 0.5; let db; if (p <= 0) db = g[0]; else if (p >= 23) db = Math.min(0, g[23]); else { const b = Math.floor(p), w = p - b; db = g[b] * (1 - w) + g[b + 1] * w; } return Math.pow(10, db / 20); };
    // FIR：频域实增益 → 逆变换 → 移到中心 → 汉宁窗
    const hr = new Float64Array(NF), hi = new Float64Array(NF);
    for (let k = 0; k <= NF / 2; k++) { const a = gainAt(k * SR / NF); hr[k] = a; if (k > 0 && k < NF / 2) hr[NF - k] = a; }
    S.fft(hr, hi, true);
    const Hr = new Float64Array(NB), Hi = new Float64Array(NB);
    for (let n = 0; n < NF; n++) Hr[n] = hr[(n + NF / 2) % NF] / NF * (0.5 - 0.5 * Math.cos(TAU * n / NF));
    S.fft(Hr, Hi, false);
    const L = y.length, acc = new Float64Array(L + 2 * NB), re = new Float64Array(NB), im = new Float64Array(NB);
    for (let s = 0; s < L; s += 2 * BL) {   // 两块拼成一个复数信号：滤波器是实的，结果的实部/虚部分别就是两块的卷积（FFT 次数减半）
      const s2 = s + BL; re.fill(0); im.fill(0);
      for (let i = 0; i < BL && s + i < L; i++) re[i] = y[s + i];
      for (let i = 0; i < BL && s2 + i < L; i++) im[i] = y[s2 + i];
      S.fft(re, im, false);
      for (let k = 0; k < NB; k++) { const a = re[k] * Hr[k] - im[k] * Hi[k]; im[k] = re[k] * Hi[k] + im[k] * Hr[k]; re[k] = a; }
      S.fft(re, im, true);
      for (let i = 0; i < NB && s + i < acc.length; i++) acc[s + i] += re[i] / NB;
      for (let i = 0; i < NB && s2 + i < acc.length; i++) acc[s2 + i] += im[i] / NB;
    }
    return acc.slice(NF / 2, NF / 2 + L);   // 补偿线性相位延时
  }
  // 包络校正：生成音的平滑 RMS 包络（5ms 帧、约 1/8 时长的滑动平均，保留单个音符的起落）拉向实测 16 点包络（拉伸到目标时长 Lt）；
  // 增益限 ±elim dB；目标时长之后只许衰减（按 −60dB / 0.15·Lt 收掉）。
  function envMatch(y, env, Lt, strength, elim) {
    const h = 220, nf = Math.ceil(y.length / h), e = new Float64Array(nf);
    for (let i = 0; i < nf; i++) { let s = 0; const a = i * h, b = Math.min(y.length, a + h); for (let n = a; n < b; n++) s += y[n] * y[n]; e[i] = s / Math.max(1, b - a); }
    const w = Math.max(1, Math.round(Lt / 0.005 / 16)), sm = new Float64Array(nf);
    let run = 0; for (let j = 0; j <= Math.min(nf - 1, w); j++) run += e[j];   // 滑动和（O(n)）
    for (let i = 0; i < nf; i++) { const lo = Math.max(0, i - w), hi2 = Math.min(nf - 1, i + w); sm[i] = run / (hi2 - lo + 1); if (i + w + 1 < nf) run += e[i + w + 1]; if (i - w >= 0) run -= e[i - w]; }
    let mx = 0; for (let i = 0; i < nf; i++) mx = Math.max(mx, sm[i]);
    if (!(mx > 0)) return y;
    let a0 = 0; while (a0 < nf - 1 && sm[a0] < mx * 1e-4) a0++;
    const nL = Lt / 0.005, gdb = new Float64Array(nf + 1);
    for (let i = 0; i < nf; i++) {
      const x = (i - a0) / nL; let tg;
      if (x <= 0) tg = env[0]; else if (x >= 1) tg = env[15] - 60 * (x - 1) / 0.15; else { const p = x * 15, k = Math.min(14, Math.floor(p)); tg = env[k] + (env[k + 1] - env[k]) * (p - k); }
      const cur = 10 * Math.log10(sm[i] / mx + 1e-12);
      gdb[i] = Math.max(-elim, Math.min(elim, strength * (tg - cur)));
      if (x >= 1) gdb[i] = Math.min(gdb[i], Math.max(-90, tg - cur));
    }
    gdb[nf] = gdb[nf - 1];
    const endN = Math.max(16, Math.min(y.length, Math.round((a0 + nL * 1.15) * h)));
    const out = new Float64Array(endN), ga = gdb.map(v => Math.pow(10, v / 20));
    for (let n = 0; n < endN; n++) { const p = n / h - 0.5, i = Math.max(0, Math.min(nf - 1, Math.floor(p))), fr = Math.max(0, Math.min(1, p - i)); out[n] = y[n] * (ga[i] * (1 - fr) + ga[Math.min(nf, i + 1)] * fr); }
    return out;
  }
  // 末尾低于峰值 −60dB 的静音裁掉（留 5ms 余弦收尾）
  function trim60(y) {
    let pk = 0; for (let i = 0; i < y.length; i++) pk = Math.max(pk, Math.abs(y[i]));
    const th = pk * 1e-3; let n = y.length - 1; while (n > 0 && Math.abs(y[n]) < th) n--;
    const fo = Math.round(0.005 * SR), L = Math.min(y.length, n + fo), out = y.slice(0, L);
    for (let i = 0; i < Math.min(fo, L); i++) out[L - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fo);
    return out;
  }
  // 分位数插值抽样：u∈[0,1] → p10..p90 之间（u=0.5 → 中位数）
  const quant = (P, u) => { const x = Math.min(4, Math.max(0, u * 4)), i = Math.min(3, Math.floor(x)); return P[i] + (P[i + 1] - P[i]) * (x - i); };
  // vary=0 → 中位数；vary=1 → 在整个 p10–p90 范围内按 seed 取
  const pickQ = (P, R, vary) => quant(P, 0.5 + (R() - 0.5) * vary);

  // ---------- 音色 ----------
  /* 一个音：o = {f(Hz), gl(半音，整个音的滑动量), glT(滑动用时 s), dur, att, t60, slope(dB/倍频程), odd(0–1 奇次谐波偏重),
   *            fm(非谐波 FM 量 0–1), fmr(FM 比), vib:[Hz, 半音], wave('add'|'square'|'pulse'|'tri'), duty} */
  function note(o, R) {
    const N = Math.max(16, Math.round(o.dur * SR)), y = new Float64Array(N);
    const att = Math.max(0.0005, o.att), glT = Math.max(0.005, o.glT || o.dur * 0.6), rr = Math.exp(-6.908 / Math.max(0.01, o.t60) / SR);
    const fmax = o.f * Math.pow(2, Math.max(0, o.gl) / 12);
    const amps = [];
    if (o.wave === 'add') for (let k = 1; k <= (o.maxK || 10) && k * fmax < 15000; k++) {
      let db = o.slope * Math.log2(k); if (k % 2 === 0) db -= 12 * (o.odd || 0);
      if (db < -45 && k > 1) break; amps.push(Math.pow(10, db / 20));
    }
    const K = amps.length, vr = o.vib ? o.vib[0] : 0, vd = o.vib ? o.vib[1] : 0, fm = o.fm || 0, fmr = o.fmr || 1.414;
    const duty = o.duty || 0.5, dcp = 2 * duty - 1, fmDec = Math.exp(-18 / SR);   // dcp：占空比≠50% 的脉冲波自带的直流，减掉
    let ph = R(), pm = 0, env = 0, I = fm * 2.2, f = o.f, fNext = o.f, df = 0;
    const blep = (tt, dt) => { if (tt < dt) { tt /= dt; return tt + tt - tt * tt - 1; } if (tt > 1 - dt) { tt = (tt - 1) / dt; return tt * tt + tt + tt + 1; } return 0; };
    const fAt = t => { const x = Math.min(1, t / glT), g = (1 - Math.exp(-3 * x)) / (1 - Math.exp(-3)); return o.f * Math.pow(2, (o.gl * g + (vd ? vd * Math.sin(TAU * vr * t) : 0)) / 12); };
    let decay = 1;
    // o.hDk：高次谐波额外衰减（第 k 次谐波多衰减 hDk·(k−1) /s）——高次谐波比基频衰减快，音色随时间变暗；衰减到 −80dB 的谐波不再计算
    const hDk = o.hDk || 0, ah = Float64Array.from(amps), hst = Float64Array.from(amps, (_, k) => Math.exp(-hDk * k * 32 / SR)); let KE = K;
    for (let n = 0; n < N; n++) {
      if ((n & 31) === 0) { f = fAt(n / SR); fNext = fAt((n + 32) / SR); df = (fNext - f) / 32;   // 控制率 32 采样，线性插值
        if (hDk && n) { for (let k = 1; k < KE; k++) ah[k] *= hst[k]; while (KE > 1 && ah[KE - 1] < 1e-4) KE--; } } else f += df;
      if (n < att * SR) env = n / (att * SR); else { decay *= rr; env = decay; if (env < 1e-5) break; }
      let v;
      if (K) {
        ph += f / SR; if (ph >= 1) ph -= 1;
        const th = TAU * ph, s1 = Math.sin(th), c1 = Math.cos(th);
        v = ah[0] * (I > 1e-4 ? Math.sin(th + I * Math.sin(TAU * pm)) : s1);
        let sk = s1, ck = c1;
        for (let k = 1; k < KE; k++) { const ns = sk * c1 + ck * s1; ck = ck * c1 - sk * s1; sk = ns; v += ah[k] * sk; }   // 谐波用角度和递推，省三角函数
        pm += f * fmr / SR; if (pm >= 1) pm -= 1; I *= fmDec;
      } else {   // retro：方波/脉冲/三角（PolyBLEP 抗混叠）
        const dt = f / SR; ph += dt; if (ph >= 1) ph -= 1;
        v = o.wave === 'tri' ? 1 - 4 * Math.abs(((ph + 0.25) % 1) - 0.5) : (ph < duty ? 1 : -1) + blep(ph, dt) - blep((ph + 1 - duty) % 1, dt) - dcp;
        v *= 0.5;
      }
      y[n] = v * env;
    }
    const fo = Math.min(N, Math.round(0.004 * SR)); for (let n = 0; n < fo; n++) y[N - 1 - n] *= n / fo;   // 收尾防咔哒
    return y;
  }
  // 延迟回声（反馈 + 环路低通，越往后越暗）
  function echo(x, D, fb, tail) {
    const d = Math.max(1, Math.round(D * SR)), L = x.length + Math.round(tail * SR), y = new Float64Array(L); y.set(x);
    let lp = 0; const a = 0.55;
    for (let n = d; n < L; n++) { lp = lp * a + y[n - d] * (1 - a); y[n] += lp * fb; }
    return y;
  }
  // 高频闪光颗粒（奖励/升级/水晶）：短促的正弦小铃，频率取根音的高八度五声音阶
  function sparkle(R, f0, dur, count, t0) {
    const out = S.buf(t0 + dur + 0.15), pent = [0, 2, 4, 7, 9];
    for (let i = 0; i < count; i++) {
      const oct = 2 + Math.floor(R() * 2), st = pent[Math.floor(R() * 5)] + 12 * oct, f = Math.min(12000, f0 * Math.pow(2, st / 12));
      const g = note({ f, gl: 0, dur: 0.12, att: 0.001, t60: R.range(0.05, 0.12), slope: -40, wave: 'add' }, R);
      const t = t0 + dur * Math.pow(R(), 0.8);
      S.add(out, g, t, R.range(0.12, 0.35) * Math.exp(-(t - t0) / Math.max(0.05, dur)));
    }
    return out;
  }
  // 开头的"咔"：一颗极短噪声碎粒
  const tick = (R, fc, amp) => { const g = S.grain(fc, 0.8, R.range(0.0006, 0.0015), R); for (let i = 0; i < g.length; i++) g[i] *= amp; return g; };

  // ---------- 风格 → 音色映射（设计约定；auto = 按该类实测的谐波/非谐波） ----------
  function timbre(st, style, bright) {
    // 实测 h2（2 次谐波相对基频 dB）≈ 每倍频程斜率；h3−h2 的差判断奇次是否偏重（方波 h2 很低、h3≈−9.5）
    let slope = Math.max(-45, Math.min(-4, st.h2)), odd = Math.max(0, Math.min(1, (st.h3 - st.h2 * 1.585) / 15)), fm = Math.min(0.9, st.inh * 1.6), wave = 'add';
    if (style === 'soft') { slope = Math.min(slope, -30); fm = 0; odd = 0; }
    if (style === 'toon') { slope = Math.min(slope, -24); fm *= 0.3; }
    if (style === 'crystal') { slope = -26; fm = Math.max(fm, 0.55); }
    if (style === 'retro') { wave = 'square'; }
    slope += bright * 10;
    return { slope, odd, fm, wave };
  }
  const SCALES = {   // 多音符时的音程（设计约定，见文件头）
    up: [0, 4, 7, 12, 16, 19, 24], pent: [0, 2, 4, 7, 9, 12, 14, 16], fourth: [0, 5], fifth: [0, 7], down: [0, -5, -7, -12],
    minor2: [0, -1],
  };
  // 音符数超过音阶长度时：ext='oct' 按八度延伸（上行音阶往上、下行往下），'repeat' 循环重复（如错误音"嗡嗡嗡"）
  const semiAt = (seq, i, ext) => {
    if (i < seq.length) return seq[i];
    if (ext === 'repeat') return seq[i % seq.length];
    const dir = seq[seq.length - 1] < seq[0] ? -1 : 1, span = Math.max(12, Math.ceil(Math.abs(seq[seq.length - 1] - seq[0]) / 12 + 1e-9) * 12);
    return seq[i % seq.length] + dir * span * Math.floor(i / seq.length);
  };

  /* 通用生成器：type 的实测统计 + 本类的设计（音符序列、层）
   * o: style, pitch(半音偏移), bright(-1..1), length(倍数), vary(0–1 按 seed 在实测分布里取值的幅度), consistent(1=同一按钮每次相同), notes */
  function make(type, o, plan) {
    const st = STAT[type], lt = LT[type], T = tier(lt.fam), R = S.rng(o.consistent ? 7919 : o.seed), vary = o.consistent ? 0 : o.vary;
    const style = o.style === 'auto' ? plan.style : o.style, tb = timbre(st, style, o.bright);
    // 音高：实测"主音高"（最强谱峰）分位数 + plan.oct（设计上的音区移位：把这一类放到合适的音区，不是"修正到基频"的测量结果）+ 用户偏移
    let m0 = pickQ(st.m, R, vary) + (plan.oct || 0) + o.pitch;
    m0 = Math.max(36, Math.min(108, m0));
    let gl = plan.gl != null ? plan.gl : pickQ(st.gl, R, vary * 0.7);
    let seqFn = plan.seq, nDef = plan.notes;
    if (style === 'retro') {   // 芯片风：不滑音；原本有明显滑音的改成按音阶跳的几个音
      if (Math.abs(gl) > 3 && !plan.seq) { const up = gl > 0; seqFn = () => up ? [0, 4, 7, 12] : [0, -3, -7, -12]; nDef = Math.max(nDef, 3); }
      gl = 0;
    }
    if (style === 'toon') gl = gl * 1.4 + (gl >= 0 ? 4 : -4);
    gl = Math.max(12 * Math.log2(60 / S.mtof(m0)), Math.min(12 * Math.log2(13000 / S.mtof(m0)), gl));   // 防止滑出可听/奈奎斯特范围
    const t20 = pickQ(st.t20, R, vary) * o.length * (plan.dk || 1);
    let Lt = pickQ(lt.len, R, vary) * o.length * (plan.lenK || 1);   // 目标有效时长：实测分位数
    const nN = Math.max(1, Math.min(plan.maxNotes || 8, Math.round(o.notes != null && o.notes > 0 ? o.notes : nDef)));
    const ioi = (style === 'retro' ? 0.6 : 1) * (plan.ioi || st.ioi) * o.length * Math.exp(R.g() * 0.08 * vary);
    Lt = Math.max(Lt, (nN - 1) * ioi / 0.6 + 0.05);
    if (plan.maxLen) Lt = Math.min(Lt, plan.maxLen * o.length);
    const t60 = plan.t60 ? plan.t60 * o.length * Math.exp(R.g() * 0.15 * vary) : Math.min(3, Math.max(t20 * 3, Lt * 1.1));   // plan.t60：分离的短音（悬停的气泡"啵"）
    const seq = seqFn ? seqFn(nN, R) : [0];
    const layers = [];
    for (let i = 0; i < nN; i++) {
      let semi = semiAt(seq, i, plan.ext); const last = i === nN - 1;
      while (m0 + semi > 108) semi -= 12; while (m0 + semi < 36) semi += 12;   // 延伸出音区时折回一个八度（不再夹到同一个音上重复）
      const f = S.mtof(m0 + semi);
      // envMatch 在 1.15·Lt 处收尾，更长的部分是白算
      const dur = (last ? Math.min(t60, Lt * 1.15 + 0.03) : Math.min(t60, ioi * 3)) + 0.02, nt60 = last ? t60 : Math.min(t60, ioi * 2.2);
      const nt = note({ f, gl: (plan.glAll || nN === 1 || last) ? gl : gl * 0.25, glT: plan.glT, dur, att: plan.att || 0.002,
        t60: nt60, slope: tb.slope, odd: tb.odd, fm: tb.fm, fmr: plan.fmr, wave: tb.wave, duty: 0.5, vib: plan.vib, hDk: plan.hDk }, R);
      layers.push([nt, 0.004 + i * ioi * (1 + R.g() * 0.02 * vary), (last ? 1 : 0.85) * (plan.vel ? plan.vel(i, nN) : 1)]);
      if (plan.chord) for (const c of plan.chord) {   // 和弦音（如错误音的小二度）：时长与本音符相同（第一轮误用了整段长度，音符多时很慢）
        const cn = note({ f: S.mtof(Math.min(112, m0 + semi + c)), gl: gl, glT: plan.glT, dur, att: 0.002, t60: nt60, slope: tb.slope, odd: tb.odd, fm: 0, wave: tb.wave, duty: 0.25, maxK: 5 }, R);   // 和弦音在主音下面，只留 5 个谐波（省时）
        layers.push([cn, 0.004 + i * ioi, 0.6]);
      }
    }
    // 开头"咔"：强度来自该类实测的谱平坦度（噪声度）
    const clickAmp = Math.min(0.9, lt.fl * 3.2) * (plan.click == null ? 1 : plan.click);
    if (clickAmp > 0.02) layers.push([tick(R, Math.min(9000, S.mtof(m0) * 2.5), 1), 0.003, clickAmp]);
    let y = S.mix(layers, 0.02);
    // 噪声层（"空气/数码质感"）：能量占比 pN = plan.air（tool/B/calib2.js 校准：同样的平坦度定义、相近时长下，生成音中位平坦度 ≈ 训练家族实测），
    // 柔和/芯片风格减量。每个音符一团噪声，跟随音符起音、按 nDk·t60 衰减（nDk 按"高频掉 30dB 时间 ≈ 实测 hf30"校准）；
    // 上扫/下扫类（plan.whoosh）的噪声带通中心跟着音高滑动（像"嗖"）。
    const pN = Math.min(0.6, plan.air * (style === 'soft' ? 0.6 : style === 'retro' ? 0.15 : 1) * (o.airMul == null ? 1 : o.airMul));
    if (pN > 0.005) {
      let Et = 0; for (let i = 0; i < y.length; i++) Et += y[i] * y[i];
      const nDk = plan.nDk * (o.nDkMul == null ? 1 : o.nDkMul);
      const nz = new Float64Array(y.length), dk = Math.exp(-6.908 / Math.max(0.01, t60 * nDk) / SR), aN = Math.max(44, Math.round((plan.att || 0.002) * SR));
      let nzEnd = 0;
      for (let i = 0; i < nN; i++) {
        const s0 = Math.round((0.004 + i * ioi) * SR); let e = 1, n = s0;
        for (; n < nz.length; n++) { const k = n - s0, a = k < aN ? k / aN : (e *= dk); if (k > aN && a < 1e-4) break; nz[n] += (R() * 2 - 1) * a / Math.sqrt(nN); }
        nzEnd = Math.max(nzEnd, n);
      }
      const f0 = S.mtof(m0), gT = Math.max(0.005, plan.glT || 0.3);
      const cf = plan.whoosh ? (t => Math.min(15000, f0 * 2 * Math.pow(2, gl * (1 - Math.exp(-3 * Math.min(1, t / gT))) / (1 - Math.exp(-3)) / 12))) : Math.min(12000, Math.max(800, f0 * 2));
      const z = S.biquad(nz.subarray(0, Math.min(nz.length, nzEnd + Math.round(0.02 * SR))), 'bp', cf, plan.wQ || (plan.whoosh ? 1.4 : 0.6));   // 只滤有噪声的那一段（滤波器尾巴留 20ms）   // wQ：噪声带通的 Q（越小越宽、越像噪声）
      let En = 0; for (let i = 0; i < z.length; i++) En += z[i] * z[i];
      const g = En > 0 ? Math.sqrt(Et * pN / (1 - pN) / En) : 0;
      for (let i = 0; i < z.length; i++) y[i] += z[i] * g;
    }
    if (plan.sparkle || style === 'crystal') y = S.mix([[y, 0, 1], [sparkle(R, S.mtof(m0), (plan.sparkleDur || 0.4) * o.length, plan.sparkle || 6, 0.02 + (nN - 1) * ioi), 0, 0.6]]);
    const ec = plan.echo || (style === 'crystal' ? [0.11, 0.3] : null);
    if (ec) y = echo(y, ec[0] * o.length, ec[1], ec[0] * 4);
    // 整体包络 + 长时频谱拉向训练家族实测（强度按家族数分档；芯片风格是刻意的方波音色，再减半）
    const rk = style === 'retro' ? 0.5 : 1;
    if (!plan.envOff) y = envMatch(y, lt.env, Lt, T.e * rk, T.elim);
    y = specMatch(y, lt.lt, Object.assign({}, T, { s: T.s * rk }), o.bright);
    for (let n = 0; n < Math.min(88, y.length); n++) y[n] *= n / 88;   // 线性相位 FIR 在起音前有极弱的预振铃：开头 2ms 淡入
    return trim60(y);
  }

  const COMMON = [
    { k: 'style', label: '风格', options: [['auto', '按实测'], ['soft', '柔和'], ['toon', '卡通'], ['crystal', '水晶'], ['retro', '复古芯片']], def: 'auto' },
    { k: 'pitch', label: '音高(半音)', min: -12, max: 12, step: 1, def: 0 },
    { k: 'bright', label: '亮度', min: -1, max: 1, step: 0.1, def: 0 },
    { k: 'length', label: '长短', min: 0.5, max: 2, step: 0.05, def: 1 },
    { k: 'vary', label: '变化幅度', min: 0, max: 1, step: 0.05, def: 0.25 },
    { k: 'consistent', label: '每次相同(1)', min: 0, max: 1, step: 1, def: 0 },
  ];
  const REF = (p, off, dur, name) => ({ name: name || p.split('/').pop().replace(/_B00M_CUCK\.wav|\.wav/, ''), path: p, offset: off, dur });
  const meas = (t, extra) => `频谱/包络/噪声度：训练 ${LT[t].fam} 个素材家族（该类共 ${LT[t].files} 个文件，留出约 1/4 家族只用于评分；${extra}）；` +
    `${LT[t].fam >= 8 ? '往实测拉强度 0.6' : LT[t].fam >= 4 ? '家族偏少，只拉 0.35' : '家族太少，只校正整体高低频倾斜'}。音高/轮廓/衰减/谐波分布取第一轮 ${STAT[t].n} 段统计。见 notes/B.md。`;

  // ---------- 各类型 ----------
  // nDk：噪声衰减时间 = nDk × 音符 t60；air：噪声能量占比（calib2.js 校准值；乘风格系数后上限 0.6，写 1.0 的类在上限处仍达不到实测平坦度）
  const defs = {
    ui_click: { name: '按钮点击', desc: '一个高音短促的"嘀"（谐波很少）＋开头极短噪声咔＋很短的带通噪声，音高快速下滑（实测 70% 的点击音是下滑的）',
      src: 'UIClick DIGITAL-Tonal 11 个文件 + 菜单/按钮点击类 25 个文件',
      plan: { air: 1.0, nDk: 0.31, style: 'soft', oct: -7, notes: 1, dk: 0.6, glT: 0.03, click: 1.3 },
      presets: [['轻点·默认', {}], ['卡通啵', { style: 'toon', pitch: -5 }], ['芯片哔', { style: 'retro', pitch: -12, length: 0.6 }], ['水晶叮', { style: 'crystal', length: 0.8 }]],
      refs: [REF('casual UI/UIClick_CLICK DIGITAL-Tonal Small_B00M_CUCK.wav', 0.1965, 0.344), REF('casual UI/UIClick_CLICK DIGITAL-Tonal Small_B00M_CUCK.wav', 2.4822, 0.445, 'Tonal Small 2'), REF('casual interaction/菜单音效 (Menu)/益智游戏按钮点击01.wav', 0.0078, 0.112)] },
    ui_hover: { name: '悬停', desc: '2–3 个分离的短促气泡"啵"（每个约 60ms 内衰减，音高上扬，一个比一个轻）',
      src: '用户界面 UI_Pop/Bubble/Liquid 21 个文件（5 个家族）',
      plan: { air: 0.16, nDk: 0.5, style: 'soft', notes: 3, ioi: 0.085, t60: 0.06, envOff: true, gl: 5, glAll: true, glT: 0.025, click: 0.3, att: 0.003, vel: (i) => [1, 0.5, 0.3][i] || 0.3 },
      presets: [['悬停·默认', {}], ['高一点', { pitch: 7 }], ['卡通', { style: 'toon' }], ['芯片', { style: 'retro', length: 0.6 }]],
      refs: [REF('casual interaction/用户界面 (UI)/Puzzle_Game_UI_Pop_Tiny_01.wav', 0.0255, 0.301), REF('casual interaction/用户界面 (UI)/Puzzle_Game_UI_Pop_Tiny_02.wav', 0.02, 0.3)] },
    ui_confirm: { name: '确认', desc: '高音区、谐波很少的音（实测 2 次谐波 −34dB，主音高中位约 3.3kHz），1–2 个音，音程上行五度（设计约定）；叠一层随音符衰减的带通噪声（实测这类音并不纯，平坦度中位 0.17）',
      src: 'UIMisc Synth Accept 系列、UIClick Tonal Accept/Positive、有机界面 肯定反馈/金属确认，共 7 个文件',
      plan: { air: 0.21, nDk: 0.48, style: 'soft', oct: -7, notes: 2, glT: 0.03, gl: -1.5, seq: () => SCALES.fifth, vel: (i) => i ? 1 : 0.7 },
      presets: [['确认·默认', {}], ['单音', { notes: 1 }], ['水晶', { style: 'crystal' }], ['芯片', { style: 'retro', pitch: -12 }]],
      refs: [REF('casual UI/UIMisc_EFFECT-Synth Accept_B00M_CUCK.wav', 0.2409, 0.892), REF('casual UI/UIMisc_EFFECT-Synth Accept_B00M_CUCK.wav', 2.638, 0.959, 'Synth Accept 2'), REF('casual interaction/有机界面 (Organic_UI)/益智游戏肯定反馈按钮.wav', 0.0114, 0.149)] },
    ui_cancel: { name: '取消/返回', desc: '中低音区、谐波较丰富的短音，两音下行（设计约定；实测轮廓上/下各半，靠"更低更暗"与确认区分）',
      src: '负向/降级/反向类中时长 <1s 的 9 段（第二轮起与"错误"类按时长分开，不再是其子集）',
      plan: { air: 0.87, nDk: 0.39, style: 'soft', notes: 2, dk: 0.8, seq: () => SCALES.down, vel: (i) => i ? 0.9 : 1, gl: -2 },
      presets: [['取消·默认', {}], ['单音下滑', { notes: 1 }], ['卡通', { style: 'toon' }], ['芯片', { style: 'retro' }]],
      refs: [REF('casual interaction/有机界面 (Organic_UI)/益智游戏否定反馈按钮.wav', 0.0001, 0.13), REF('casual interaction/状态音效 (Status)/益智游戏降级气泡01.wav', 0, 0.9)] },
    ui_error: { name: '错误', desc: '低音区、富谐波（实测 2 次谐波 −14dB）的"嗡"，叠一个小二度不协和音并整体下滑（实测 70% 下滑，中位 −14 半音）；音符多于 2 个时重复"嗡—嗡"',
      src: '负向反馈/负向通知/降级/Status_Negative/Warning_Reverse 中时长 ≥1s 的 31 个文件',
      plan: { air: 1.0, nDk: 0.39, style: 'auto', notes: 2, ioi: 0.16, seq: () => SCALES.minor2, ext: 'repeat', chord: [1], dk: 0.5, glAll: true, maxNotes: 4, maxLen: 1.6 },
      presets: [['错误·默认', {}], ['短促', { length: 0.6 }], ['芯片蜂鸣', { style: 'retro' }], ['低沉', { pitch: -7 }]],
      refs: [REF('casual interaction/状态音效 (Status)/益智游戏负向反馈01.wav', 0.007, 1.18), REF('casual interaction/通知提示 (Notification)/益智游戏负向通知01.wav', 0.1233, 1.086)] },
    ui_open: { name: '打开面板', desc: '上扫音：单音快速上滑（实测轮廓中位 +15 半音）＋跟着音高滑动的带通噪声"嗖"＋轻回声',
      src: 'Tonal Rise/Rising Sweep/Delay Wobble/Vocoder Rise/菜单嗖声 共 10 个文件',
      plan: { air: 1.0, nDk: 0.19, style: 'soft', notes: 1, glT: 0.25, echo: [0.09, 0.25], click: 0.5, whoosh: true, wQ: 0.8 },
      presets: [['打开·默认', {}], ['大幅上扫', { length: 1.4 }], ['卡通', { style: 'toon' }], ['芯片', { style: 'retro', notes: 3 }]],
      refs: [REF('casual UI/UIMisc_EFFECT-Tonal Rise Short_B00M_CUCK.wav', 0.3054, 0.654), REF('casual UI/UIMisc_EFFECT-Tonal Rise Short_B00M_CUCK.wav', 2.1074, 0.6, 'Tonal Rise Short 2')] },
    ui_close: { name: '关闭面板', desc: '下扫音：单音下滑（实测轮廓中位 −12 半音）＋跟着音高滑动的带通噪声＋轻回声；滑到底后很快收掉',
      src: 'Pop Delay Frequency Shift、进度槽清空、Synth Laser Down、Shift Liquid Reverse 共 7 个文件（Reverse Blow 是反向吹气声，第二轮不再计入）',
      plan: { air: 1.0, nDk: 0.28, style: 'soft', oct: -12, notes: 1, glT: 0.2, echo: [0.08, 0.2], click: 0.5, whoosh: true, wQ: 0.4, t60: 0.45 },
      presets: [['关闭·默认', {}], ['短', { length: 0.6 }], ['卡通', { style: 'toon' }], ['芯片', { style: 'retro', notes: 3 }]],
      refs: [REF('casual interaction/用户界面 (UI)/益智游戏进度槽清空01.wav', 0.0165, 1.177), REF('casual UI/UIMisc_EFFECT-Pop Delay Frequency Shift_B00M_CUCK.wav', 0.1, 0.5, 'Pop Delay Frequency Shift')] },
    ui_levelup: { name: '升级', desc: '上行琶音（实测首末音净变化中位 +9 半音，p75 +16）＋长尾衰减＋闪光颗粒＋回声',
      src: '升级音效 + 能力提升 共 31 个文件（7 个家族）',
      plan: { air: 0.24, nDk: 0.17, hDk: 4, style: 'auto', oct: 12, notes: 4, ioi: 0.11, seq: () => SCALES.up, gl: 0, sparkle: 10, sparkleDur: 0.6, echo: [0.13, 0.3], dk: 0.7, vel: (i, n) => 0.75 + 0.25 * i / Math.max(1, n - 1) },
      presets: [['升级·默认', {}], ['大升级', { notes: 6, length: 1.3 }], ['水晶', { style: 'crystal' }], ['芯片', { style: 'retro' }]],
      refs: [REF('casual interaction/升级音效 (Upgrade)/Puzzle_Game_Upgrade_01.wav', 0.0012, 1.766), REF('casual interaction/能力提升 (Power_Ups)/益智游戏能量提升01.wav', 0.0054, 1.997)] },
    ui_reward: { name: '奖励', desc: '五声音阶上行小旋律（谐波丰富，实测 h2 −10dB）＋长尾＋大量闪光颗粒',
      src: '奖励 + 成就 + 收集物品 共 60 个文件（13 个家族）',
      plan: { air: 0.058, nDk: 0.084, hDk: 6, style: 'auto', notes: 5, ioi: 0.09, seq: () => SCALES.pent, gl: 0, sparkle: 18, sparkleDur: 0.6, echo: [0.15, 0.28], dk: 0.6 },
      presets: [['奖励·默认', {}], ['小奖励', { notes: 3, length: 0.7 }], ['水晶', { style: 'crystal' }], ['芯片', { style: 'retro' }]],
      refs: [REF('casual interaction/奖励音效 (Bonus)/益智游戏奖励音效01.wav', 0.0203, 1.626), REF('casual interaction/收集物品 (Collectible)/益智游戏小型收集物04.wav', 0.0039, 0.732)] },
    ui_notify: { name: '通知', desc: '中音区钟铃音（实测非谐波能量占比中位 0.40，像钟/FM 铃），两音四度跳（设计约定）',
      src: '通知提示/科技通知/滑稽通知 15 个文件，只有 3 个家族',
      plan: { air: 1.0, nDk: 0.27, style: 'auto', notes: 2, fmr: 3.5, gl: 0, seq: () => SCALES.fourth, echo: [0.12, 0.2] },
      presets: [['通知·默认', {}], ['单铃', { notes: 1 }], ['柔和', { style: 'soft' }], ['芯片', { style: 'retro' }]],
      refs: [REF('casual interaction/通知提示 (Notification)/益智游戏通知提示01.wav', 0.0325, 0.891), REF('casual interaction/通知提示 (Notification)/益智游戏通知提示02.wav', 0.03, 0.9)] },
  };
  for (const [type, d] of Object.entries(defs)) {
    const multi = ['ui_levelup', 'ui_reward', 'ui_error', 'ui_confirm', 'ui_cancel', 'ui_notify', 'ui_open', 'ui_close'].includes(type);
    // 错误音：音符数上限 4、长短上限 1.5（第一轮 notes=8,length=2 时单次生成到 98ms）
    const params = COMMON.map(p => type === 'ui_error' && p.k === 'length' ? Object.assign({}, p, { max: 1.5 }) : p)
      .concat(multi ? [{ k: 'notes', label: '音符数(0=默认)', min: 0, max: type === 'ui_error' ? 4 : 8, step: 1, def: 0 }] : []);
    S.def(type, {
      group: 'UI', name: d.name, desc: d.desc, measured: meas(type, d.src),
      params, presets: d.presets.map(([name, opts]) => ({ name, opts })), refs: d.refs,
      loud: o => (type === 'ui_hover' ? 0.45 : type === 'ui_click' ? 0.7 : 0.85),
      gen: o => make(type, o, d.plan),
    });
  }
  S.uiStats = STAT; S.uiLT = LT;
})();
