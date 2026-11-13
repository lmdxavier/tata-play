/* sfxgen v2.0 · 核心（浏览器 / Node 通用）
 * 所有声音都由代码按发声原理实时合成，不拼接、不混合任何录音。
 * 各功能线在自己的文件里注册生成器：SFX2.def(type, spec)；页面和事件时间轴只通过 SFX2.make(type, opts) 调用。
 * 约定：opts.seed 决定全部随机（同 seed 同结果）；输出 Float32Array，SR=44100，单声道，峰值归一到 0.89（再由 gain 调整）。
 */
(function (root) {
  'use strict';
  const SR = 44100;
  const S = root.SFX2 = root.SFX2 || {};
  S.SR = SR;

  // ---------- 随机 ----------
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    const r = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    r.g = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    r.range = (a, b) => a + (b - a) * r();
    r.pick = arr => arr[Math.floor(r() * arr.length)];
    r.lognorm = (med, sigma) => med * Math.exp(r.g() * sigma);   // 中位数 med，对数标准差 sigma
    return r;
  }
  S.rng = rng;

  // ---------- FFT ----------
  function fft(re, im, inv) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = 2 * Math.PI / len * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const a = i + j, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
  }
  const np2 = n => { let p = 1; while (p < n) p <<= 1; return p; };
  S.fft = fft; S.np2 = np2;   // 注意：逆变换不除以 N

  // ---------- 缓冲 ----------
  const buf = sec => new Float64Array(Math.max(1, Math.round(sec * SR)));
  // 把 src 叠加到 dst 的 t 秒处（越界自动截断）
  function add(dst, src, t, g) {
    g = g == null ? 1 : g; const s0 = Math.round((t || 0) * SR);
    for (let n = Math.max(0, -s0); n < src.length && s0 + n < dst.length; n++) dst[s0 + n] += src[n] * g;
    return dst;
  }
  // 混合若干层 [[x, t, g], ...]，自动定长
  function mix(layers, tail) {
    let L = 0; for (const [x, t] of layers) if (x) L = Math.max(L, Math.round((t || 0) * SR) + x.length);
    const out = new Float64Array(L + Math.round((tail || 0) * SR));
    for (const [x, t, g] of layers) if (x) add(out, x, t, g);
    return out;
  }
  const peak = x => { let m = 0; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > m) m = v; } return m; };
  const rms = x => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); };
  // 收尾：去直流 → 末端淡出 → 峰值归一 → Float32
  function finish(x, o) {
    o = o || {}; x = Float64Array.from(x);   // 不改调用方的缓冲
    let m0 = 0; for (let i = 0; i < x.length; i++) m0 += x[i]; m0 /= Math.max(1, x.length);
    if (o.dc !== false && Math.abs(m0) > 1e-6) { // 一阶高通去直流（20Hz）
      const a = Math.exp(-2 * Math.PI * 20 / SR); let px = 0, py = 0;
      for (let i = 0; i < x.length; i++) { const y = x[i] - px + a * py; px = x[i]; py = y; x[i] = y; }
    }
    const fo = Math.min(x.length, Math.round((o.fade || 0.005) * SR));
    for (let n = 0; n < fo; n++) x[x.length - 1 - n] *= n / fo;
    const m = peak(x), y = new Float32Array(x.length), g = m ? (o.peak || 0.89) / m : 0;
    for (let n = 0; n < x.length; n++) y[n] = x[n] * g;
    return y;
  }
  Object.assign(S, { buf, add, mix, peak, rms, finish });

  // ---------- 噪声与滤波 ----------
  function white(sec, R) { const x = buf(sec); for (let i = 0; i < x.length; i++) x[i] = R() * 2 - 1; return x; }
  // 粉噪（Paul Kellet 近似）
  function pink(sec, R) {
    const x = buf(sec); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < x.length; i++) {
      const w = R() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    return x;
  }
  // RBJ 双二阶；f / q / gain 可以是数字或 (时间秒)=>值 的函数（逐 32 采样更新系数，用于扫频）
  function biquad(x, type, f, q, gainDb) {
    const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0, b1, b2, a1, a2;
    const fv = typeof f === 'function', qv = typeof q === 'function', gv = typeof gainDb === 'function';
    const coef = (F, Q, G) => {
      F = Math.min(SR * 0.49, Math.max(10, F)); Q = Math.max(0.05, Q || 0.707);
      const w = 2 * Math.PI * F / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q), A = Math.pow(10, (G || 0) / 40);
      let B0, B1, B2, A0, A1, A2;
      switch (type) {
        case 'lp': B0 = (1 - c) / 2; B1 = 1 - c; B2 = (1 - c) / 2; A0 = 1 + al; A1 = -2 * c; A2 = 1 - al; break;
        case 'hp': B0 = (1 + c) / 2; B1 = -(1 + c); B2 = (1 + c) / 2; A0 = 1 + al; A1 = -2 * c; A2 = 1 - al; break;
        case 'bp': B0 = al; B1 = 0; B2 = -al; A0 = 1 + al; A1 = -2 * c; A2 = 1 - al; break;   // 峰值增益 0dB
        case 'notch': B0 = 1; B1 = -2 * c; B2 = 1; A0 = 1 + al; A1 = -2 * c; A2 = 1 - al; break;
        case 'peak': B0 = 1 + al * A; B1 = -2 * c; B2 = 1 - al * A; A0 = 1 + al / A; A1 = -2 * c; A2 = 1 - al / A; break;
        case 'lowshelf': { const sq = 2 * Math.sqrt(A) * al; B0 = A * ((A + 1) - (A - 1) * c + sq); B1 = 2 * A * ((A - 1) - (A + 1) * c); B2 = A * ((A + 1) - (A - 1) * c - sq); A0 = (A + 1) + (A - 1) * c + sq; A1 = -2 * ((A - 1) + (A + 1) * c); A2 = (A + 1) + (A - 1) * c - sq; break; }
        case 'highshelf': { const sq = 2 * Math.sqrt(A) * al; B0 = A * ((A + 1) + (A - 1) * c + sq); B1 = -2 * A * ((A - 1) + (A + 1) * c); B2 = A * ((A + 1) + (A - 1) * c - sq); A0 = (A + 1) - (A - 1) * c + sq; A1 = 2 * ((A - 1) - (A + 1) * c); A2 = (A + 1) - (A - 1) * c - sq; break; }
        default: throw new Error('biquad type ' + type);
      }
      b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = A1 / A0; a2 = A2 / A0;
    };
    if (!fv && !qv && !gv) coef(f, q, gainDb);
    for (let n = 0; n < x.length; n++) {
      if ((fv || qv || gv) && (n & 31) === 0) coef(fv ? f(n / SR) : f, qv ? q(n / SR) : q, gv ? gainDb(n / SR) : gainDb);
      const v = b0 * x[n] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x[n]; y2 = y1; y1 = v; y[n] = v;
    }
    return y;
  }
  // 一阶低通/高通（便宜）
  function onepole(x, type, f) {
    const y = new Float64Array(x.length), fv = typeof f === 'function'; let a = Math.exp(-2 * Math.PI * (fv ? f(0) : f) / SR), z = 0;
    for (let n = 0; n < x.length; n++) {
      if (fv && (n & 31) === 0) a = Math.exp(-2 * Math.PI * Math.max(5, f(n / SR)) / SR);
      z = (1 - a) * x[n] + a * z; y[n] = type === 'hp' ? x[n] - z : z;
    }
    return y;
  }
  Object.assign(S, { white, pink, biquad, onepole });

  // ---------- 包络 ----------
  // 分段包络：pts = [[t, v], ...]（线性插值；curve>0 用指数形状）
  function envPts(x, pts, curve) {
    let k = 0;
    for (let n = 0; n < x.length; n++) {
      const t = n / SR; while (k < pts.length - 2 && t > pts[k + 1][0]) k++;
      const [t0, v0] = pts[k], [t1, v1] = pts[Math.min(k + 1, pts.length - 1)];
      let w = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
      if (curve) w = (1 - Math.exp(-curve * w)) / (1 - Math.exp(-curve));
      x[n] *= t < pts[0][0] ? pts[0][1] : (t > pts[pts.length - 1][0] ? pts[pts.length - 1][1] : v0 + (v1 - v0) * w);
    }
    return x;
  }
  // 起音 att 秒（线性）+ 指数衰减（掉 60dB 的时间 t60）
  function envAD(x, att, t60, hold) {
    hold = hold || 0; const d = 6.908 / Math.max(1e-4, t60);
    for (let n = 0; n < x.length; n++) { const t = n / SR; x[n] *= t < att ? t / att : (t < att + hold ? 1 : Math.exp(-(t - att - hold) * d)); }
    return x;
  }
  Object.assign(S, { envPts, envAD });

  // ---------- 振荡 ----------
  // 相位累加振荡器；freq 可以是数字或 t=>Hz；shape: sine/tri/saw/square/pulse(duty)；saw/square 做了 PolyBLEP 抗混叠
  function osc(sec, freq, shape, o) {
    o = o || {}; const x = buf(sec), fv = typeof freq === 'function'; let ph = o.phase || 0;
    const duty = o.duty || 0.5;
    const blep = (t, dt) => { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; };
    for (let n = 0; n < x.length; n++) {
      const f = fv ? freq(n / SR) : freq, dt = Math.min(0.5, Math.abs(f) / SR);
      let v;
      switch (shape || 'sine') {
        case 'sine': v = Math.sin(2 * Math.PI * ph); break;
        case 'tri': v = 1 - 4 * Math.abs(((ph + 0.25) % 1) - 0.5); break;
        case 'saw': v = 2 * ph - 1 - blep(ph, dt); break;
        case 'square': case 'pulse': v = (ph < duty ? 1 : -1) + blep(ph, dt) - blep((ph + 1 - duty) % 1, dt); break;
        default: v = Math.sin(2 * Math.PI * ph);
      }
      x[n] = v; ph += f / SR; ph -= Math.floor(ph);
    }
    return x;
  }
  // FM：载波 fc，调制 ratio·fc，调制指数 index（可为 t=>值）
  function fm(sec, fc, ratio, index) {
    const x = buf(sec), fv = typeof fc === 'function', iv = typeof index === 'function'; let pc = 0, pm = 0;
    for (let n = 0; n < x.length; n++) {
      const t = n / SR, f = fv ? fc(t) : fc, I = iv ? index(t) : index;
      x[n] = Math.sin(2 * Math.PI * pc + I * Math.sin(2 * Math.PI * pm));
      pc += f / SR; pm += f * ratio / SR; pc -= Math.floor(pc); pm -= Math.floor(pm);
    }
    return x;
  }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  Object.assign(S, { osc, fm, mtof });

  // ---------- 模态（衰减正弦组）：碰撞类的核心 ----------
  // modes: [[f(Hz), d(1/s，振幅衰减率), A, phase], ...]；返回长度 sec 的缓冲
  function modalBank(modes, sec, o) {
    o = o || {}; const N = Math.round(sec * SR), out = new Float64Array(N);
    let amax = 0; for (const m of modes) amax = Math.max(amax, Math.abs(m[2] || 0));
    const floor = Math.max(1e-12, amax * 1e-5);   // 截断在最大模态 −100dB 处
    for (const m of modes) {
      const f = m[0], d = m[1], A = m[2], ph = m[3] == null ? -Math.PI / 2 : m[3];   // 默认正弦起振（首采样为 0，无台阶）
      if (!(f > 0 && f < SR * 0.47) || !(A !== 0)) continue;
      const L = Math.min(N, Math.round(Math.log(Math.max(floor, Math.abs(A)) / floor) / Math.max(1, d) * SR));
      const w = 2 * Math.PI * f / SR, rr = Math.exp(-d / SR), c = Math.cos(w), s = Math.sin(w);
      let re = A * Math.cos(ph), im = A * Math.sin(ph);
      for (let n = 0; n < L; n++) { out[n] += re; const nr = (re * c - im * s) * rr; im = (re * s + im * c) * rr; re = nr; }
    }
    return out;
  }
  S.modalBank = modalBank;

  // ---------- 频谱塑形噪声 ----------
  // 按 (Hz, dB) 控制点（对数频率线性插值）塑形的噪声，长度 sec；返回 RMS=1
  function shapedNoise(sec, pts, R) {
    const L = Math.max(16, Math.round(sec * SR)), N = np2(L), re = new Float64Array(N), im = new Float64Array(N);
    const lp = pts.map(p => [Math.log(p[0]), p[1]]);
    for (let k = 1; k < N / 2; k++) {
      const lf = Math.log(k * SR / N); let db;
      if (lf <= lp[0][0]) db = lp[0][1]; else if (lf >= lp[lp.length - 1][0]) db = lp[lp.length - 1][1];
      else { let b = 0; while (lp[b + 1][0] < lf) b++; const w = (lf - lp[b][0]) / (lp[b + 1][0] - lp[b][0]); db = lp[b][1] * (1 - w) + lp[b + 1][1] * w; }
      const a = Math.pow(10, db / 20), ph = R() * 2 * Math.PI;
      re[k] = a * Math.cos(ph); im[k] = a * Math.sin(ph); re[N - k] = re[k]; im[N - k] = -im[k];
    }
    fft(re, im, true);
    const x = new Float64Array(L); let s = 0; for (let n = 0; n < L; n++) { x[n] = re[n]; s += re[n] * re[n]; }
    const r = Math.sqrt(s / L) || 1; for (let n = 0; n < L; n++) x[n] /= r;
    return x;
  }
  // 一颗噪声碎粒：中心频率 fc、带宽 bw（倍频程标准差）、衰减 tau 秒；不重复噪声 + 余弦收尾；峰值=1
  function grain(fc, bw, tau, R) {
    const L = Math.max(32, Math.min(Math.round(0.08 * SR), Math.round(tau * 6 * SR))), N = Math.max(256, np2(L));
    const re = new Float64Array(N), im = new Float64Array(N), l0 = Math.log2(fc), s = Math.max(0.15, bw);
    for (let k = 1; k < N / 2; k++) {
      const f = k * SR / N, z = (Math.log2(f) - l0) / s, a = Math.exp(-0.5 * z * z), ph = R() * 2 * Math.PI;
      re[k] = a * Math.cos(ph); im[k] = a * Math.sin(ph); re[N - k] = re[k]; im[N - k] = -im[k];
    }
    fft(re, im, true);
    const g = new Float64Array(L), fadeL = Math.max(8, Math.round(L * 0.25)); let m = 0;
    for (let n = 0; n < L; n++) {
      const t = n / SR, fo = n > L - fadeL ? 0.5 + 0.5 * Math.cos(Math.PI * (n - (L - fadeL)) / fadeL) : 1;
      g[n] = re[n] * Math.min(1, t / 0.00008) * Math.exp(-t / tau) * fo; m = Math.max(m, Math.abs(g[n]));
    }
    for (let n = 0; n < L; n++) g[n] /= m || 1;
    return g;
  }
  Object.assign(S, { shapedNoise, grain });

  // ---------- 其他工具 ----------
  const softclip = (x, drive) => { const d = drive || 1, k = Math.tanh(d); for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * d) / k; return x; };
  // 简短空间感：几条梳状 + 全通（Schroeder），wet 0–1，size 0–1（只用于"在场感"，不用于掩盖质感问题）
  function room(x, wet, size, tail) {
    wet = wet == null ? 0.15 : wet; size = size == null ? 0.4 : size;
    const combs = [1116, 1188, 1277, 1356].map(d => Math.round(d * (0.5 + size))), fb = 0.72 + 0.2 * size;
    // 尾长默认按梳状反馈估算到 −60dB（RT60 = −3·延时/log10(fb)），末尾再做 80ms 余弦淡出
    const rt60 = -3 * (combs[3] / SR) / Math.log10(fb);
    const L = x.length + Math.round((tail || Math.min(4, rt60)) * SR), y = new Float64Array(L); y.set(x);
    const w = new Float64Array(L);
    for (const d of combs) { const b = new Float64Array(d); let i = 0, lp = 0; for (let n = 0; n < L; n++) { const o = b[i]; lp = o * 0.7 + lp * 0.3; b[i] = (n < x.length ? x[n] : 0) + lp * fb; i = (i + 1) % d; w[n] += o / combs.length; } }
    for (const d of [556, 441, 341, 225]) { const b = new Float64Array(d); let i = 0; for (let n = 0; n < L; n++) { const bo = b[i], v = -w[n] + bo; b[i] = w[n] + bo * 0.5; w[n] = v; i = (i + 1) % d; } }
    for (let n = 0; n < L; n++) y[n] = y[n] * (1 - wet * 0.5) + w[n] * wet;
    const fo = Math.min(L - x.length, Math.round(0.08 * SR)); for (let n = 0; n < fo; n++) y[L - 1 - n] *= 0.5 - 0.5 * Math.cos(Math.PI * n / fo);
    return y;
  }
  const semis = s => Math.pow(2, s / 12);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  Object.assign(S, { softclip, room, semis, clamp, lerp });

  // ---------- WAV ----------
  function wav(x) {
    const N = x.length, b = new ArrayBuffer(44 + N * 2), dv = new DataView(b), ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, 36 + N * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, N * 2, true);
    for (let n = 0; n < N; n++) dv.setInt16(44 + n * 2, Math.max(-1, Math.min(1, x[n])) * 32767, true);
    return b;
  }
  S.wav = wav;

  // ---------- 注册表 ----------
  /* SFX2.def(type, spec)
   * spec = {
   *   group: '战斗·命中' 等（页面分组）, name: '中文名', desc: '一句话：发声原理',
   *   params: [{k, label, min, max, step, def, fmt?}]   // 页面滑块；opts 里同名字段
   *   presets: [{name, opts}]                            // 试听区按钮（每个都是不同的描述/参数，不是原声）
   *   gen(opts) → Float64Array|Float32Array            // 必须只依赖 opts（含 seed）
   *   refs?: [{name, path, offset, dur}]                 // 可选：同类原声（页面"对照原声"按钮）
   *   measured?: '参数来源说明（实测自哪些素材 / 设计约定）'
   *   loud?(opts) → 0–1：相对响度（如力度大小）。make 会把峰值归一到 0.89×loud，
   *                      这样轻击/重击在游戏里音量不同；不写则一律 0.89
   * }
   */
  S.types = S.types || {};
  S.def = (type, spec) => { spec.type = type; S.types[type] = spec; return spec; };
  S.make = (type, opts) => {
    const sp = S.types[type]; if (!sp) throw new Error('未注册的音效类型 ' + type);
    const given = {}; for (const k in (opts || {})) if (opts[k] !== undefined) given[k] = opts[k];   // undefined 不覆盖默认值
    const o = Object.assign({}, ...(sp.params || []).map(p => ({ [p.k]: p.def })), given);
    // 数值参数：非数字/NaN/Infinity → 默认值；再夹到滑块范围内（防止 0/0 之类的输入让合成死循环或输出 NaN）
    for (const p of sp.params || []) {
      if (p.options || typeof p.def !== 'number') continue;
      let v = typeof o[p.k] === 'string' ? Number(o[p.k]) : o[p.k];
      if (typeof v !== 'number' || !isFinite(v)) v = p.def;
      if (p.min != null) v = Math.max(p.min, v); if (p.max != null) v = Math.min(p.max, v);
      o[p.k] = v;
    }
    for (const k of ['force', 'size', 'speed']) if (k in o && typeof o[k] !== 'boolean') { const v = Number(o[k]); o[k] = isFinite(v) ? clamp(v, 0, 1) : 0.5; }
    o.seed = isFinite(o.seed) ? Math.floor(Math.abs(o.seed)) % 4294967296 : 1;
    const y = sp.gen(o);
    if (o.raw) return y;
    const pk = o.peak != null ? o.peak : 0.89 * (sp.loud ? clamp(sp.loud(o), 0.05, 1) : 1);
    if (!isFinite(pk)) throw new Error(type + ' 的 loud() 返回了非数字（检查 opts 字段）');
    return finish(y, { peak: pk });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = S;
})(typeof window !== 'undefined' ? window : globalThis);
