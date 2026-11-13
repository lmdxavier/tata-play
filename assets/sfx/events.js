/* sfxgen v2.0 · 事件时间轴
 * 动作、特效、音效共用同一组事件：{t, type, weapon?, target?, material?, surface?, element?, force, size, speed?, crit?}
 * 一个事件 → 音效（实时合成）+ 命中停顿 + 震屏 + 闪白/击退（由游戏/页面执行）。
 * 命中停顿、震屏的数值是"设计约定"（录音里测不到），集中写在 FEEL 里，方便以后统一调。
 */
(function (root) {
  'use strict';
  const S = root.SFX2;
  const clamp = (v, a, b) => isFinite(v) ? Math.min(b, Math.max(a, v)) : (a + b) / 2;   // NaN → 中值
  const isTrue = v => v === true || v === 1 || v === 'true' || v === '1';   // 下拉框会传字符串 'false'

  // ---------- 手感参数（设计约定） ----------
  const FEEL = {
    // 命中停顿（秒）：基础 + 力度 × 系数；重武器更长；暴击再加
    hitstop: { base: 0.035, perForce: 0.06, heavy: 0.025, crit: 0.04, max: 0.16 },
    // 震屏：幅度（角色身高的比例）与时长；轻击几乎不震
    shake: { base: 0.004, perForce: 0.03, crit: 0.015, dur: 0.16 },
    flash: 0.11,          // 闪白时长
    knock: { base: 0.03, perForce: 0.09 },  // 击退距离（角色身高的比例）
  };
  const HEAVY = { greatsword: 1, hammer: 1, axe: 0.6, spear: 0.2, sword: 0, staff: 0.1, dagger: -0.3, fist: -0.2 };

  // 事件 → 合成参数（字段名按 CONTRACT）
  function sfxFor(ev) {
    const f = clamp(ev.force == null ? 0.6 : ev.force, 0, 1), sz = ev.size == null ? 0.5 : ev.size;
    switch (ev.type) {
      case 'swing': return ['swing', { weapon: ev.weapon, speed: ev.speed == null ? 0.4 + 0.6 * f : ev.speed, size: sz }];
      case 'hit': return ['hit', { weapon: ev.weapon, target: ev.target, force: f, crit: isTrue(ev.crit), size: sz }];
      case 'block': return ['block', { weapon: ev.weapon, force: f, size: sz }];
      case 'death': return ['death', { force: f, size: sz, surface: ev.surface }];
      case 'cast': case 'projectile': case 'skill_hit': return [ev.type, { element: ev.element, force: f, size: sz, dur: ev.dur }];
      case 'step': case 'jump': case 'land': case 'roll': return [ev.type, { surface: ev.surface, force: f, size: sz }];
      default: return [ev.type, Object.assign({}, ev)];
    }
  }
  const clean = o => { for (const k in o) if (o[k] === undefined) delete o[k]; return o; };
  // 事件 → 手感反馈
  function feelFor(ev) {
    const f = clamp(ev.force == null ? 0.6 : ev.force, 0, 1), hv = HEAVY[ev.weapon] || 0;
    if (ev.type === 'hit' || ev.type === 'skill_hit' || ev.type === 'block') {
      const H = FEEL.hitstop, K = FEEL.shake;
      const stop = clamp(H.base + H.perForce * f + H.heavy * Math.max(0, hv) + (isTrue(ev.crit) ? H.crit : 0), 0, H.max) * (ev.type === 'block' ? 0.7 : 1);
      const shake = K.base + K.perForce * f * f * (1 + 0.5 * Math.max(0, hv)) + (isTrue(ev.crit) ? K.crit : 0);
      return { hitstop: stop, shake, shakeDur: FEEL.shake.dur * (0.7 + 0.6 * f), flash: ev.type === 'block' ? 0 : FEEL.flash, knock: FEEL.knock.base + FEEL.knock.perForce * f * (1 + 0.4 * hv) };
    }
    if (ev.type === 'land') return { hitstop: 0, shake: f > 0.7 ? 0.01 * f : 0, shakeDur: 0.12 };
    return null;
  }
  // 合成一个事件的声音；返回 {buf, ms, type, missing}
  function render(ev, seed) {
    const [type, o0] = sfxFor(ev), o = clean(o0);
    if (!S.types[type]) return { buf: null, ms: 0, type, missing: true };
    const sd = seed == null ? (Math.random() * 1e9) >>> 0 : seed;
    const t0 = (root.performance || Date).now();
    const buf = S.make(type, Object.assign({}, o, { seed: sd }));
    return { buf, ms: (root.performance || Date).now() - t0, type, seed: sd, opts: o };   // seed/opts 用于 peak(opts) 对齐（必须同一个 seed）
  }
  // 声音里"最响的那一刻"（毫秒级包络峰）。挥动声要让峰值落在出手/接触点附近，而不是从出手才开始响
  function peakTime(buf) {
    const w = Math.round(S.SR * 0.003); let best = 0, bi = 0;
    for (let i = 0; i + w <= buf.length; i += w) { let s = 0; for (let k = 0; k < w; k++) s += buf[i + k] * buf[i + k]; if (s > best) { best = s; bi = i; } }
    return (bi + w / 2) / S.SR;
  }

  S.events = { FEEL, HEAVY, sfxFor, feelFor, render, peakTime };
})(typeof window !== 'undefined' ? window : globalThis);
