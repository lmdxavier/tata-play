// 分赃背包 · 纯逻辑（不依赖画面，Node 和浏览器都能直接用）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FZ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 随机 ----------
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

  // ---------- 数值（集中在这里，模拟调的就是这些）----------
  const CFG = {
    startHp: 60,
    ownBias: 0.3,          // 桌上每件有这么大概率是「你包里已有的那几种」之一（凑得出合成）
    probK: 2.0,            // 两堆吸引力差 → 概率的陡度
    probMin: 0.05, probMax: 0.95,
    dark: { on: true, after: 2, shift: 0.08 }, // 暗调：连输 after 次后，下一次实际概率往玩家想要的方向偏 shift
    crit: 0.15,            // 玩家的武器每次出手的暴击概率（×2）。对手不暴击
    poisonCarry: 0.5,      // 换客人时毒留下的比例
    oldMoves: 2,           // 每轮能挪几件旧东西
    barrelFuse: 3, barrelDmg: 10,
    restHeal: 0.45,        // 休息回最大血量的比例
    maxLv: 3,
    // 客人血量：[小客, 熟客, 头目]，按档
    kitN: { small: [0, 1, 2, 2, 3], regular: [0, 0, 2, 0, 3, 4], boss: [0, 0, 0, 3, 0, 0, 4] },
    kitLv2: { small: [0, 0, 0, 0, 1], regular: [0, 0, 0, 0, 1, 1], boss: [0, 0, 0, 0, 0, 0, 0] },
    reward: { small: { heal: 6 }, regular: { heal: 12, maxHp: 5, steal: 1 }, boss: { heal: 20, maxHp: 5, steal: 1, expand: [4, 4] } },
    lv2Chance: [0, 0, 0, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.13], // 按节点序号
  };

  // ---------- 物品 ----------
  // tag: weapon 武器 / armor 护具 / food 吃的 / tool 道具 / junk 破烂
  // pool: 出现权重；val: 不看搭配时的大概价值（贪心玩家用）
  const ITEMS = {
    dagger:   { name: '短剑',   icon: '🗡️', tag: 'weapon', w: 1, h: 1, pool: 10, val: 3 },
    spear:    { name: '长枪',   icon: '🔱', tag: 'weapon', w: 3, h: 1, pool: 5,  val: 7 },
    shield:   { name: '木盾',   icon: '🛡️', tag: 'armor',  w: 1, h: 1, pool: 9,  val: 3 },
    plate:    { name: '铁甲',   icon: '🦺', tag: 'armor',  w: 1, h: 2, pool: 4,  val: 5 },
    apple:    { name: '苹果',   icon: '🍎', tag: 'food',   w: 1, h: 1, pool: 8,  val: 2 },
    meat:     { name: '烤肉',   icon: '🍖', tag: 'food',   w: 1, h: 2, pool: 4,  val: 4 },
    whet:     { name: '磨刀石', icon: '🪨', tag: 'tool',   w: 1, h: 1, pool: 7,  val: 3, passive: true },
    flag:     { name: '战旗',   icon: '🚩', tag: 'tool',   w: 1, h: 1, pool: 6,  val: 4 },
    horn:     { name: '号角',   icon: '📯', tag: 'tool',   w: 1, h: 1, pool: 4,  val: 3 },
    // 连发
    spring:   { name: '发条',   icon: '⚙️', tag: 'tool',   w: 1, h: 1, pool: 6,  val: 4, passive: true, arch: 'combo' },
    gear:     { name: '吊钩',   icon: '🪝', tag: 'tool',   w: 1, h: 1, pool: 5,  val: 4, passive: true, arch: 'combo' },
    crossbow: { name: '连弩',   icon: '🏹', tag: 'weapon', w: 2, h: 1, pool: 5,  val: 6, arch: 'combo' },
    // 反击
    spike:    { name: '刺盾',   icon: '🦔', tag: 'armor',  w: 2, h: 1, pool: 6,  val: 6, arch: 'counter' },
    thorn:    { name: '荆棘甲', icon: '🌵', tag: 'armor',  w: 1, h: 1, pool: 5,  val: 4, arch: 'counter' },
    anvil:    { name: '铁砧',   icon: '🔨', tag: 'tool',   w: 1, h: 1, pool: 5,  val: 3, arch: 'counter' },
    // 养毒
    vial:     { name: '毒瓶',   icon: '🧪', tag: 'tool',   w: 1, h: 1, pool: 6,  val: 4, arch: 'poison' },
    fang:     { name: '毒牙',   icon: '🦷', tag: 'weapon', w: 1, h: 1, pool: 5,  val: 4, arch: 'poison' },
    catalyst: { name: '催化剂', icon: '⚗️', tag: 'tool',   w: 1, h: 1, pool: 4,  val: 3, arch: 'poison' },
    // 空位
    great:    { name: '巨剑',   icon: '⚔️', tag: 'weapon', w: 2, h: 2, pool: 5,  val: 9, arch: 'space' },
    cloak:    { name: '斗篷',   icon: '🧥', tag: 'tool',   w: 1, h: 1, pool: 5,  val: 3, arch: 'space' },
    lone:     { name: '孤狼牙', icon: '🐺', tag: 'weapon', w: 1, h: 1, pool: 5,  val: 5, arch: 'space' },
    // 赌
    dice:     { name: '骰子剑', icon: '🎲', tag: 'weapon', w: 1, h: 1, pool: 5,  val: 4, gamble: true },
    coin:     { name: '幸运币', icon: '🪙', tag: 'tool',   w: 1, h: 1, pool: 4,  val: 4, gamble: true },
    // 成长
    pupil:    { name: '学徒剑', icon: '🌱', tag: 'weapon', w: 1, h: 1, pool: 5,  val: 4, grow: true },
    wine:     { name: '老酒',   icon: '🍶', tag: 'tool',   w: 1, h: 1, pool: 4,  val: 3, grow: true },
    // 破烂
    barrel:   { name: '火药桶', icon: '🧨', tag: 'junk',   w: 1, h: 1, pool: 4,  val: -6, passive: true },
    scrap:    { name: '破罐子', icon: '🏺', tag: 'junk',   w: 1, h: 1, pool: 5,  val: 0, passive: true },
  };
  const ARCH = { combo: '连发', counter: '反击', poison: '养毒', space: '空位' };
  const TAGNAME = { weapon: '武器', armor: '护具', food: '吃的', tool: '道具', junk: '破烂' };
  const LV = (it) => 1 << (it.lv - 1); // 1 级 ×1，2 级 ×2，3 级 ×4
  const fmt = (x) => (Math.round(x * 100) / 100).toString();

  function desc(it) {
    const L = LV(it), g = it.grow || 0;
    switch (it.id) {
      case 'dagger': return `攻击 +${3 * L}`;
      case 'spear': return `攻击 +${8 * L}`;
      case 'shield': return `挡 ${3 * L}`;
      case 'plate': return `挡 ${7 * L}`;
      case 'apple': return `回 ${2 * L} 血`;
      case 'meat': return `回 ${5 * L} 血`;
      case 'whet': return `上下左右紧挨的武器，每次出手攻击 +${2 * L}`;
      case 'flag': return `倍率 +${fmt(0.2 * L)}`;
      case 'horn': return `排在背包里最后一个出手时：倍率 ×${fmt(1 + 0.2 * L)}；不在最后没用（磨刀石、发条、吊钩、破烂不算出手）`;
      case 'spring': return `右边紧挨的那件武器多出手 ${L} 次`;
      case 'gear': return `下面紧挨的那件武器多出手 ${L} 次`;
      case 'crossbow': return `攻击 +${3 * L}，连出手 3 次（升级不加次数）`;
      case 'spike': return `挡 ${5 * L}；它挡下多少，就反弹 2 倍`;
      case 'thorn': return `挡 ${2 * L}；被打时反弹 ${4 * L}`;
      case 'anvil': return `出手时，把排在它前面的格挡的 ${100 * L}% 加到攻击`;
      case 'vial': return `对手 +${4 * L} 层毒（每层每轮掉 1 血，无视格挡，不消失；换客人时留一半）`;
      case 'fang': return `攻击 +${2 * L}，对手 +${2 * L} 层毒`;
      case 'catalyst': return `对手身上的毒，每轮多发作 ${L} 次`;
      case 'great': return `攻击 +${8 * L}；上下左右紧挨它的格子每空 1 格，再 +${4 * L}`;
      case 'cloak': return `背包每空 1 格，倍率 +${fmt(0.1 * L)}`;
      case 'lone': return `攻击 +${4 * L}；上下左右都没东西时改为 +${14 * L}`;
      case 'dice': return `攻击 +${L}～${6 * L}（随机）；25% 概率再出手 1 次（升级不加概率）`;
      case 'coin': return `50%：倍率 ×${fmt(1 + 0.4 * L)}；50%：倍率 ×0.8。乘的是它出手时已有的倍率，放得越靠后乘得越多`;
      case 'pupil': return `攻击 +${2 * L + g * L}；每打完一轮永久再 +${L}`;
      case 'wine': return `倍率 +${fmt(0.04 * L * (1 + g))}；每打完一轮永久再 +${fmt(0.04 * L)}`;
      case 'barrel': return `再打 ${it.fuse == null ? CFG.barrelFuse : it.fuse} 轮后爆炸，炸拿着它的人 ${CFG.barrelDmg} 血；爆炸前不能丢`;
      case 'scrap': return '没用，占 1 格';
    }
    return '';
  }

  // ---------- 背包 ----------
  let UID = 1;
  function makeItem(id, lv) { const it = { uid: UID++, id, lv: lv || 1, x: -1, y: -1 }; if (id === 'barrel') it.fuse = CFG.barrelFuse; if (ITEMS[id].grow) it.grow = 0; return it; }
  function makeBag(cols, rows) { return { cols, rows, items: [] }; }
  function cloneBag(b) { return { cols: b.cols, rows: b.rows, items: b.items.map((i) => Object.assign({}, i)) }; }
  function buildGrid(bag) {
    const g = new Int16Array(bag.cols * bag.rows).fill(-1);
    for (let i = 0; i < bag.items.length; i++) {
      const it = bag.items[i], d = ITEMS[it.id];
      for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) g[(it.y + dy) * bag.cols + it.x + dx] = i;
    }
    return g;
  }
  function canPlace(bag, id, x, y, ignoreUid, grid) {
    const d = ITEMS[id];
    if (x < 0 || y < 0 || x + d.w > bag.cols || y + d.h > bag.rows) return false;
    const g = grid || buildGrid(bag);
    for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) {
      const o = g[(y + dy) * bag.cols + x + dx];
      if (o >= 0 && bag.items[o].uid !== ignoreUid) return false;
    }
    return true;
  }
  function itemAt(bag, x, y) {
    if (x < 0 || y < 0 || x >= bag.cols || y >= bag.rows) return null;
    const o = buildGrid(bag)[y * bag.cols + x];
    return o >= 0 ? bag.items[o] : null;
  }
  function removeItem(bag, uid) { const i = bag.items.findIndex((t) => t.uid === uid); if (i >= 0) return bag.items.splice(i, 1)[0]; return null; }
  function canMerge(a, b) { return !!(a && b && a.uid !== b.uid && a.id === b.id && a.lv === b.lv && a.lv < CFG.maxLv && ITEMS[a.id].tag !== 'junk'); } // 破烂不能合
  // 把 src 合到 dst 上（dst 留在原位升一级）
  function mergeInto(dst, src) {
    dst.lv += 1;
    if (dst.grow != null) dst.grow = Math.max(dst.grow || 0, src.grow || 0); // 成长值取大的：合完正好是数值翻倍
    if (dst.fuse != null) dst.fuse = Math.min(dst.fuse, src.fuse);
  }
  const canDiscard = (it) => !(it.id === 'barrel');

  // ---------- 一边背包这一轮的结算 ----------
  // o.rnd: 随机函数；不给 = 按期望值算（给模拟和电脑摆放用）
  // o.hold: 留手（武器不出手）；o.trace: 往里记每一下，界面照着演
  function scoreBag(bag, o) {
    o = o || {};
    const rnd = o.rnd || null, tr = o.trace || null, crit = o.crit || 0;
    // 武器这一下打多少：有暴击概率的一边，实打时掷骰（×2），估算时按平均
    const hitv = (v, info) => { if (!crit) return v; if (!rnd) return v * (1 + crit); if (rnd() < crit) { info.crit = true; return v * 2; } return v; };
    const items = bag.items, n = items.length, cols = bag.cols, rows = bag.rows;
    const g = buildGrid(bag);
    let empty = 0;
    for (let i = 0; i < g.length; i++) if (g[i] < 0) empty++;
    const extra = new Array(n).fill(0), whet = new Array(n).fill(0), emptyAdj = new Array(n).fill(0), nbCount = new Array(n).fill(0);
    const at = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows) ? -2 : g[y * cols + x];
    for (let i = 0; i < n; i++) {
      const it = items[i], d = ITEMS[it.id];
      if (it.id === 'spring') { const t = at(it.x + 1, it.y); if (t >= 0 && ITEMS[items[t].id].tag === 'weapon') extra[t] += LV(it); }
      if (it.id === 'gear') { const t = at(it.x, it.y + 1); if (t >= 0 && ITEMS[items[t].id].tag === 'weapon') extra[t] += LV(it); }
      // 邻居
      const seen = [];
      const visit = (x, y) => { const t = at(x, y); if (t === -1) emptyAdj[i]++; else if (t >= 0 && t !== i && seen.indexOf(t) < 0) { seen.push(t); } };
      for (let dx = 0; dx < d.w; dx++) { visit(it.x + dx, it.y - 1); visit(it.x + dx, it.y + d.h); }
      for (let dy = 0; dy < d.h; dy++) { visit(it.x - 1, it.y + dy); visit(it.x + d.w, it.y + dy); }
      nbCount[i] = seen.length;
      if (d.tag === 'weapon') for (const t of seen) if (items[t].id === 'whet') whet[i] += 2 * LV(items[t]);
    }
    const order = [];
    for (let i = 0; i < n; i++) order.push(i);
    order.sort((a, b) => items[a].y - items[b].y || items[a].x - items[b].x);
    let last = -1;
    const held = (it) => o.hold && (ITEMS[it.id].tag === 'weapon' || it.id === 'anvil'); // 留手：武器和铁砧不出手
    for (const i of order) { const d = ITEMS[items[i].id]; if (!d.passive && !held(items[i])) last = i; }
    const S = { atk: 0, mult: 1, block: 0, spike: 0, thorns: 0, heal: 0, poison: 0, ticks: 1, total: 0, empty, maxHits: 0, potential: 0, barrels: 0 };
    const ev = (i, k, v, extraInfo) => { if (tr) tr.push(Object.assign({ u: items[i].uid, k, v, atk: S.atk, mult: S.mult, block: S.block }, extraInfo || {})); };
    for (const i of order) {
      const it = items[i], d = ITEMS[it.id], L = LV(it);
      if (it.id === 'barrel') { S.barrels++; continue; }
      if (d.passive) continue;
      if (held(it)) continue;
      let times = (it.id === 'crossbow' ? 3 : 1) + extra[i];
      let expMul = 1;
      if (it.id === 'dice') { if (rnd) { const base = times; for (let k = 0; k < base; k++) if (rnd() < 0.25) times++; } else expMul = 1.25; }
      if (d.tag === 'weapon' && times > S.maxHits) S.maxHits = times;
      for (let t = 0; t < times; t++) {
        const info = { n: t, of: times };
        switch (it.id) {
          case 'dagger': { const v = hitv(3 * L + whet[i], info); S.atk += v; ev(i, 'atk', v, info); break; }
          case 'spear': { const v = hitv(8 * L + whet[i], info); S.atk += v; ev(i, 'atk', v, info); break; }
          case 'crossbow': { const v = hitv(3 * L + whet[i], info); S.atk += v; ev(i, 'atk', v, info); break; }
          case 'fang': { const v = hitv(2 * L + whet[i], info); S.atk += v; S.poison += 2 * L; ev(i, 'atk', v, info); ev(i, 'poison', 2 * L, info); break; }
          case 'great': { const v = hitv(8 * L + 4 * L * emptyAdj[i] + whet[i], info); S.atk += v; ev(i, 'atk', v, info); break; }
          case 'lone': { const v = hitv((nbCount[i] === 0 ? 14 * L : 4 * L) + whet[i], info); S.atk += v; ev(i, 'atk', v, Object.assign({ big: nbCount[i] === 0 }, info)); break; }
          case 'dice': { const v = hitv((rnd ? (1 + Math.floor(rnd() * 6)) * L : 3.5 * L * expMul) + whet[i] * expMul, info); S.atk += v; ev(i, 'atk', v, info); break; }
          case 'pupil': { const v = hitv(2 * L + (it.grow || 0) * L + whet[i], info); S.atk += v; ev(i, 'atk', v, info); break; }
          case 'shield': S.block += 3 * L; ev(i, 'block', 3 * L, info); break;
          case 'plate': S.block += 7 * L; ev(i, 'block', 7 * L, info); break;
          case 'spike': S.block += 5 * L; S.spike += 5 * L; ev(i, 'block', 5 * L, info); break;
          case 'thorn': S.block += 2 * L; S.thorns += 4 * L; ev(i, 'block', 2 * L, info); break;
          case 'apple': S.heal += 2 * L; ev(i, 'heal', 2 * L, info); break;
          case 'meat': S.heal += 5 * L; ev(i, 'heal', 5 * L, info); break;
          case 'flag': S.mult += 0.2 * L; ev(i, 'mult', 0.2 * L, info); break;
          case 'cloak': { const v = 0.1 * L * empty; S.mult += v; ev(i, 'mult', v, info); break; }
          case 'wine': { const v = 0.04 * L * (1 + (it.grow || 0)); S.mult += v; ev(i, 'mult', v, info); break; }
          case 'horn': if (i === last) { S.mult *= 1 + 0.2 * L; ev(i, 'xmult', 1 + 0.2 * L, info); } else ev(i, 'fizz', 0, info); break;
          case 'coin': {
            if (rnd) { const win = rnd() < 0.5; const m = win ? 1 + 0.4 * L : 0.8; S.mult *= m; ev(i, 'xmult', m, Object.assign({ win }, info)); }
            else S.mult *= 0.5 * (1 + 0.4 * L) + 0.4;
            break;
          }
          case 'anvil': { const v = Math.floor(S.block * L); S.atk += v; ev(i, 'atk', v, info); break; }
          case 'vial': S.poison += 4 * L; ev(i, 'poison', 4 * L, info); break;
          case 'catalyst': S.ticks += L; ev(i, 'tick', L, info); break;
        }
      }
      if (it.id === 'pupil') S.potential += L;
      if (it.id === 'wine') S.potential += 0.04 * L * S.atk;
    }
    S.total = Math.floor(S.atk * S.mult + 1e-9);
    S.poisonOut = Math.floor(S.poison * S.mult + 1e-9); // 倍率对下毒、反弹也生效
    S.spikeOut = S.spike; S.thornsOut = Math.floor(S.thorns * S.mult + 1e-9);
    return S;
  }

  // ---------- 对手口味、挑哪堆 ----------
  const TASTES = {
    count:   { name: '贪多',   text: '只数件数：每件都算 1', f: () => 1 },
    weapon:  { name: '好斗',   text: '武器算 3，其它算 1', f: (it) => ITEMS[it.id].tag === 'weapon' ? 3 : 1 },
    armor:   { name: '怕死',   text: '护具算 3，其它算 1', f: (it) => ITEMS[it.id].tag === 'armor' ? 3 : 1 },
    food:    { name: '馋嘴',   text: '吃的算 3，其它算 1', f: (it) => ITEMS[it.id].tag === 'food' ? 3 : 1 },
    quality: { name: '识货',   text: '1 级算 1，2 级算 4，3 级算 9；破烂算 0', f: (it) => ITEMS[it.id].tag === 'junk' ? 0 : it.lv * it.lv },
    big:     { name: '贪大',   text: '占几格就算几', f: (it) => ITEMS[it.id].w * ITEMS[it.id].h },
    junk:    { name: '收破烂', text: '破烂算 4，其它算 1', f: (it) => ITEMS[it.id].tag === 'junk' ? 4 : 1 },
  };
  function pileValue(taste, pile) { let v = 0; const f = TASTES[taste].f; for (const it of pile) v += f(it); return v; }
  // 对手拿 A 堆的概率（界面显示的就是这个）
  function probA(taste, A, B) {
    const a = Math.pow(pileValue(taste, A) + 0.15, CFG.probK), b = Math.pow(pileValue(taste, B) + 0.15, CFG.probK);
    const p = a / (a + b);
    return Math.min(CFG.probMax, Math.max(CFG.probMin, p));
  }

  // ---------- 电脑摆放（对手用；会算的模拟玩家也用它打底）----------
  // 一个背包值多少：打出去的 + 挡得住的 + 反弹 + 回血 + 毒 + 以后会长的
  function bagValue(bag, ctx) {
    const s = scoreBag(bag, { crit: ctx.crit || 0 });
    const oa = ctx.oppAtk == null ? 6 : ctx.oppAtk, R = ctx.rounds || 2;
    let v = s.total;
    v += Math.min(s.block, oa) * (ctx.wDef == null ? 1.1 : ctx.wDef);
    v += reflect(s, oa);
    v += s.heal * (ctx.wHeal == null ? 1 : ctx.wHeal);
    v += s.poisonOut * s.ticks * (R + 2) / 2; // 毒会留一半给下一位，比只算这位客人值钱
    v += s.potential * (ctx.future == null ? 4 : Math.min(ctx.future, 10)) * 0.5;
    v -= s.barrels * (ctx.barrelCost == null ? 4 : ctx.barrelCost);
    return v;
  }
  // 把 items 一件件放进 bag（原地改 bag）。返回丢掉的。deep: 放完再试着挪旧东西 / 丢东西
  function autoPlace(bag, items, ctx, opt) {
    opt = opt || {};
    const dropped = [];
    const todo = items.slice().sort((a, b) => ITEMS[b.id].val * LV(b) - ITEMS[a.id].val * LV(a));
    for (const it of todo) {
      let best = null, bestV = -1e9;
      const baseV = bagValue(bag, ctx);
      // 合成
      for (const t of bag.items) if (canMerge(t, it)) {
        t.lv++; const og = t.grow; if (t.grow != null) t.grow = Math.max(t.grow, it.grow || 0);
        const v = bagValue(bag, ctx) + 0.01; t.lv--; if (t.grow != null) t.grow = og;
        if (v > bestV) { bestV = v; best = { k: 'merge', t }; }
      }
      // 空位
      const g = buildGrid(bag);
      let anyFit = false;
      for (let y = 0; y < bag.rows; y++) for (let x = 0; x < bag.cols; x++) if (canPlace(bag, it.id, x, y, -1, g)) {
        anyFit = true; it.x = x; it.y = y; bag.items.push(it);
        const v = bagValue(bag, ctx); bag.items.pop();
        if (v > bestV) { bestV = v; best = { k: 'put', x, y }; }
      }
      // 放不下：试着丢一件再放
      if (!anyFit && !opt.noSwap) {
        for (const out of bag.items.slice()) {
          if (!canDiscard(out)) continue;
          const idx = bag.items.indexOf(out); bag.items.splice(idx, 1);
          const g2 = buildGrid(bag);
          for (let y = 0; y < bag.rows; y++) for (let x = 0; x < bag.cols; x++) if (canPlace(bag, it.id, x, y, -1, g2)) {
            it.x = x; it.y = y; bag.items.push(it);
            const v = bagValue(bag, ctx); bag.items.pop();
            if (v > bestV) { bestV = v; best = { k: 'swap', x, y, out }; }
          }
          bag.items.splice(idx, 0, out);
        }
      }
      const mustKeep = !canDiscard(it);
      if (best && (bestV > baseV - 1e-9 || mustKeep)) {
        if (best.k === 'merge') mergeInto(best.t, it);
        else { if (best.k === 'swap') { removeItem(bag, best.out.uid); dropped.push(best.out); } it.x = best.x; it.y = best.y; bag.items.push(it); }
      } else if (mustKeep && !best) {
        // 火药桶放不下又没东西可丢：只能丢它
        dropped.push(it);
      } else dropped.push(it);
    }
    if (opt.deep) improve(bag, ctx, opt.oldUids || null, opt.moves == null ? CFG.oldMoves : opt.moves, dropped);
    return dropped;
  }
  // 挪动 / 丢弃改进。oldUids: 哪些算旧东西（挪它们要花次数）
  function improve(bag, ctx, oldUids, moves, dropped) {
    const moved = new Set();
    for (let pass = 0; pass < 6; pass++) {
      let cur = bagValue(bag, ctx), best = null, bestGain = 0.05;
      for (const it of bag.items) {
        const isOld = oldUids && oldUids.has(it.uid);
        if (isOld && !moved.has(it.uid) && moved.size >= moves) continue;
        const ox = it.x, oy = it.y;
        const g = buildGrid(bag);
        for (let y = 0; y < bag.rows; y++) for (let x = 0; x < bag.cols; x++) {
          if (x === ox && y === oy) continue;
          if (!canPlace(bag, it.id, x, y, it.uid, g)) continue;
          it.x = x; it.y = y;
          const gain = bagValue(bag, ctx) - cur;
          if (gain > bestGain) { bestGain = gain; best = { k: 'move', it, x, y }; }
        }
        it.x = ox; it.y = oy;
        if (canDiscard(it)) {
          const idx = bag.items.indexOf(it); bag.items.splice(idx, 1);
          const gain = bagValue(bag, ctx) - cur;
          bag.items.splice(idx, 0, it);
          if (gain > bestGain) { bestGain = gain; best = { k: 'drop', it }; }
        }
      }
      if (!best) break;
      if (best.k === 'move') { best.it.x = best.x; best.it.y = best.y; if (oldUids && oldUids.has(best.it.uid)) moved.add(best.it.uid); }
      else { removeItem(bag, best.it.uid); if (dropped) dropped.push(best.it); }
    }
    return moved.size;
  }

  // ---------- 一局 ----------
  const RUN = [
    { t: 'guest', kind: 'small', tier: 1, stay: 1, hp: 6, table: 3 },
    { t: 'guest', kind: 'small', tier: 1, stay: 1, hp: 11 },
    { t: 'guest', kind: 'regular', tier: 2, stay: 2, hp: 36 },
    { t: 'chest', expand: [4, 3] },
    { t: 'guest', kind: 'small', tier: 2, stay: 1, hp: 55 },
    { t: 'guest', kind: 'boss', tier: 3, stay: 5, hp: 200 },
    { t: 'rest' },
    { t: 'guest', kind: 'small', tier: 3, stay: 1, hp: 140 },
    { t: 'guest', kind: 'regular', tier: 4, stay: 3, hp: 380 },
    { t: 'chest' },
    { t: 'guest', kind: 'small', tier: 4, stay: 1, hp: 260 },
    { t: 'guest', kind: 'regular', tier: 5, stay: 3, hp: 520 },
    { t: 'rest' },
    { t: 'guest', kind: 'boss', tier: 6, stay: 6, hp: 2400, final: true },
  ];
  const KIND = { small: '小客', regular: '熟客', boss: '头目' };
  const NAMES = {
    small: ['阿福', '小六', '麻子', '豆丁', '二狗', '阿旺', '泥鳅', '柱子'],
    regular: ['老周', '铁娘子', '钱掌柜', '花婆婆', '独眼陈', '胖厨子'],
    boss: ['黑三爷', '九指', '白夫人', '铜算盘'],
  };
  const KITS = {
    count:   ['dagger', 'shield', 'apple', 'dagger', 'vial', 'whet'],
    weapon:  ['dagger', 'dagger', 'whet', 'spear', 'flag', 'crossbow'],
    armor:   ['dagger', 'shield', 'thorn', 'plate', 'dagger', 'anvil'],
    food:    ['dagger', 'apple', 'fang', 'meat', 'apple', 'flag'],
    quality: ['spear', 'flag', 'shield', 'pupil', 'apple', 'horn'],
    big:     ['spear', 'plate', 'meat', 'crossbow', 'great', 'shield'],
    junk:    ['dagger', 'scrap', 'shield', 'dagger', 'scrap', 'apple'],
  };
  const SMALL_TASTES = ['count', 'weapon', 'armor', 'food', 'junk', 'big'];
  const REG_TASTES = ['count', 'weapon', 'armor', 'food', 'quality', 'big'];

  function makeGuest(node, rnd) {
    const kind = node.kind, tier = node.tier;
    let tastes;
    if (node.taste) tastes = [node.taste];
    else if (kind === 'small') tastes = [pick(rnd, SMALL_TASTES)];
    else if (kind === 'regular') tastes = [pick(rnd, REG_TASTES)];
    else { // 头目：口味每轮换，三种轮着来
      const pool = REG_TASTES.slice(); tastes = [];
      for (let i = 0; i < 3; i++) tastes.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    }
    const hp = node.hp;
    const size = kind === 'small' ? [3, 2] : kind === 'regular' ? [3, 3] : node.final ? [4, 3] : [3, 3];
    const bag = makeBag(size[0], size[1]);
    const n = CFG.kitN[kind][tier], n2 = CFG.kitLv2[kind][tier];
    const kit = KITS[tastes[0]].slice(0, n).map((id, i) => makeItem(id, i < n2 ? 2 : 1));
    const g = { name: pick(rnd, NAMES[kind]), kind, tier, tastes, hp, maxHp: hp, bag, stay: node.stay, round: 0, poison: 0, final: !!node.final };
    autoPlace(bag, kit, oppCtx(g, 6), { noSwap: true });
    return g;
  }
  function oppCtx(g, myAtk) { return { oppAtk: myAtk, rounds: Math.max(1, g.stay - g.round), wDef: 0.7, wHeal: 0.6, future: 0, barrelCost: (g.stay - g.round) >= CFG.barrelFuse ? 8 : 0 }; }
  const tasteNow = (g) => g.tastes[g.round % g.tastes.length];
  const tasteNext = (g) => (g.tastes.length > 1 && g.round + 1 < g.stay) ? g.tastes[(g.round + 1) % g.tastes.length] : null;

  function newRun(seed, opt) {
    opt = opt || {};
    const rnd = makeRng(seed);
    const G = {
      seed, rnd, opt, node: -1, hp: CFG.startHp, maxHp: CFG.startHp, bag: makeBag(3, 3), opp: null, table: null,
      poison: 0, loseStreak: 0, rounds: 0, over: null, recent: {}, banned: opt.ban || null,
      stats: { splits: [], kills: 0, escaped: 0, dmgByNode: [], nodeLog: [], hold: 0, pity: 0 },
    };
    const a = makeItem('dagger'); a.x = 0; a.y = 0; const b = makeItem('shield'); b.x = 1; b.y = 0;
    G.bag.items.push(a, b);
    return G;
  }
  // 往下走一个节点。返回节点
  function nextNode(G) {
    // 养的毒不白费：换客人时，上一位身上的毒留下一半给下一位
    if (G.opp) G.carry = Math.floor(G.opp.poison * CFG.poisonCarry);
    G.node++; G.poison = 0; G.opp = null; G.table = null;
    const node = RUN[G.node];
    if (!node) { G.over = 'win'; return null; }
    G.stats.nodeLog.push(node.t === 'guest' ? node.kind : node.t);
    if (node.t === 'guest') { G.opp = makeGuest(node, G.rnd); G.opp.poison = G.carry || 0; G.carry = 0; }
    return node;
  }
  function rollItem(G, lv2) {
    let tot = 0; const ids = Object.keys(ITEMS), ws = [];
    let own = null;
    if (G.rnd() < CFG.ownBias) { const kinds = []; for (const it of G.bag.items) if (ITEMS[it.id].tag !== 'junk' && kinds.indexOf(it.id) < 0) kinds.push(it.id); if (kinds.length) own = pick(G.rnd, kinds); }
    for (const id of ids) {
      let w = ITEMS[id].pool;
      if (G.banned && G.banned.indexOf(ITEMS[id].arch) >= 0) w = 0;
      if (G.banned && G.banned.indexOf(id) >= 0) w = 0;
      const seen = G.recent[id]; if (seen == null || G.rounds - seen >= 4) w *= 1.5; // 好几轮没出过的更容易出
      ws.push(w); tot += w;
    }
    let r = G.rnd() * tot, id = ids[0];
    for (let i = 0; i < ids.length; i++) { r -= ws[i]; if (r <= 0) { id = ids[i]; break; } }
    if (own) id = own;
    G.recent[id] = G.rounds;
    let lv = 1; const x = G.rnd();
    if (ITEMS[id].tag !== 'junk') { if (x < lv2) lv = 2; }
    return makeItem(id, lv);
  }
  function dealTable(G) {
    const node = RUN[G.node];
    const n = (node.table && G.opp.round === 0) ? node.table : 5;
    const lv2 = CFG.lv2Chance[G.node] || 0;
    G.table = [];
    for (let i = 0; i < n; i++) G.table.push(rollItem(G, lv2));
    return G.table;
  }
  function chestItems(G) {
    const lv2 = (CFG.lv2Chance[G.node] || 0) + 0.1, out = [];
    for (let i = 0; i < 3; i++) { let it; do { it = rollItem(G, lv2); } while (ITEMS[it.id].tag === 'junk'); out.push(it); }
    return out;
  }
  // 对手挑。want: 玩家希望他拿的那堆（'A' / 'B' / null），只给暗调用
  function oppChoose(G, A, B, want) {
    const pShown = probA(tasteNow(G.opp), A, B);
    let p = pShown, pity = false;
    if (CFG.dark.on && !G.opt.fair && want && G.loseStreak >= CFG.dark.after) {
      p = want === 'A' ? Math.min(0.97, p + CFG.dark.shift) : Math.max(0.03, p - CFG.dark.shift);
      pity = true; G.stats.pity++;
    }
    const took = G.rnd() < p ? 'A' : 'B';
    if (want) G.loseStreak = took === want ? 0 : G.loseStreak + 1;
    return { took, pShown, pActual: p, pity };
  }
  // 对手把拿到的摆进自己的包
  function oppTake(G, pile) {
    const myAtk = scoreBag(G.bag, { crit: CFG.crit }).total;
    return autoPlace(G.opp.bag, pile, oppCtx(G.opp, myAtk), {});
  }

  // 反弹：刺盾挡下多少弹 2 倍、荆棘固定值，都乘倍率
  function reflect(s, incoming) { return incoming > 0 ? Math.floor((2 * Math.min(incoming, s.spike) + s.thorns) * s.mult + 1e-9) : 0; }
  // 打一轮。返回 res；trace 里是界面要演的每一步
  function fightRound(G, opt) {
    opt = opt || {};
    const o = G.opp, rnd = G.rnd;
    const tm = opt.trace ? [] : null, to = opt.trace ? [] : null;
    const me = scoreBag(G.bag, { rnd, hold: !!opt.hold, trace: tm, crit: CFG.crit });
    const op = scoreBag(o.bag, { rnd, trace: to });
    const res = { me, op, traceMe: tm, traceOp: to, toOpp: 0, toMe: 0, reflToOpp: 0, reflToMe: 0, healMe: 0, healOpp: 0, poisonToOpp: 0, poisonToMe: 0, boomMe: 0, boomOpp: 0, oppDead: false, meDead: false, killedBy: null, hold: !!opt.hold, hpBefore: G.hp, oppHpBefore: o.hp };
    if (opt.hold) G.stats.hold++;
    // 提前结束（打跑了他）时，我这一轮吃的东西照样回血
    const done = () => { if (!res.healed && G.hp > 0) { const h = Math.min(G.maxHp - G.hp, me.heal); G.hp += h; res.healMe = h; res.healed = true; } res.oppDead = o.hp <= 0; res.meDead = G.hp <= 0; endRound(G, res); return res; };
    // 我先出手
    res.toOpp = Math.max(0, me.total - op.block); o.hp -= res.toOpp;
    if (o.hp <= 0) { res.killedBy = 'hit'; return done(); }
    // 他挡下我的同时反弹；然后他出手
    res.reflToMe = reflect(op, me.total);
    res.toMe = Math.max(0, op.total - me.block);
    res.reflToOpp = reflect(me, op.total);
    G.hp -= res.reflToMe + res.toMe; o.hp -= res.reflToOpp;
    if (G.hp <= 0) return done();
    if (o.hp <= 0) { res.killedBy = 'reflect'; return done(); }
    // 回血
    const h1 = Math.min(G.maxHp - G.hp, me.heal); G.hp += h1; res.healMe = h1; res.healed = true;
    const h2 = Math.min(o.maxHp - o.hp, op.heal); o.hp += h2; res.healOpp = h2;
    // 毒
    o.poison += me.poisonOut; G.poison += op.poisonOut;
    res.poisonToOpp = o.poison * me.ticks; res.poisonToMe = G.poison * op.ticks;
    o.hp -= res.poisonToOpp; G.hp -= res.poisonToMe;
    if (G.hp <= 0) return done();
    if (o.hp <= 0) { res.killedBy = 'poison'; return done(); }
    // 火药桶
    for (const [bag, who] of [[G.bag, 'me'], [o.bag, 'opp']]) for (const it of bag.items.slice()) if (it.id === 'barrel') {
      it.fuse--; if (it.fuse <= 0) { removeItem(bag, it.uid); if (who === 'me') { G.hp -= CFG.barrelDmg; res.boomMe += CFG.barrelDmg; } else { o.hp -= CFG.barrelDmg; res.boomOpp += CFG.barrelDmg; } }
    }
    res.barrelsTicked = true;
    if (o.hp <= 0 && G.hp > 0) res.killedBy = 'barrel';
    return done();
  }
  function endRound(G, res) {
    const o = G.opp;
    // 我的火药桶：对手提前倒下时也照样走一格
    if (!res.barrelsTicked && G.hp > 0) for (const it of G.bag.items.slice()) if (it.id === 'barrel') {
      it.fuse--; if (it.fuse <= 0) { removeItem(G.bag, it.uid); G.hp -= CFG.barrelDmg; res.boomMe += CFG.barrelDmg; }
    }
    res.meDead = G.hp <= 0;
    for (const it of G.bag.items) if (it.grow != null) it.grow++;
    for (const it of o.bag.items) if (it.grow != null) it.grow++;
    G.rounds++; o.round++;
    G.stats.dmgByNode.push({ node: G.node, me: res.me.total, op: res.op.total, hpMe: G.hp, hpOpp: o.hp, maxHits: res.me.maxHits });
    // 最后的头目已经被打跑：就算同一轮自己的火药桶炸了，也算赢（留 1 血）
    if (res.oppDead && o.final && res.killedBy && res.killedBy !== 'reflect' && res.meDead) { G.hp = 1; res.meDead = false; }
    if (res.meDead) { G.over = 'lose'; res.next = 'lose'; return; }
    if (res.oppDead) { G.stats.kills++; res.next = o.final ? 'win' : 'reward'; if (o.final) G.over = 'win'; return; }
    if (o.round >= o.stay) { G.stats.escaped++; if (o.final) { G.over = 'lose'; res.next = 'lose'; res.escaped = true; } else { res.next = 'leave'; } return; }
    res.next = 'round';
  }
  // 打跑客人的奖励（回血 / 加上限 / 扩包直接生效；返回说明，steal 由调用方让玩家挑）
  function applyReward(G) {
    const r = CFG.reward[G.opp.kind], out = { heal: 0, maxHp: 0, expand: null, steal: r.steal || 0 };
    if (r.maxHp) { G.maxHp += r.maxHp; out.maxHp = r.maxHp; }
    if (r.heal) { const h = Math.min(G.maxHp - G.hp, r.heal); G.hp += h; out.heal = h; }
    if (r.expand) { G.bag.cols = Math.max(G.bag.cols, r.expand[0]); G.bag.rows = Math.max(G.bag.rows, r.expand[1]); out.expand = r.expand; }
    return out;
  }
  function applyChest(G) { const node = RUN[G.node]; if (node.expand) { G.bag.cols = Math.max(G.bag.cols, node.expand[0]); G.bag.rows = Math.max(G.bag.rows, node.expand[1]); } return chestItems(G); }
  function applyRest(G) { const h = Math.min(G.maxHp - G.hp, Math.round(G.maxHp * CFG.restHeal)); G.hp += h; return h; }

  // 现在这包东西算哪个套路（界面和模拟都用）
  function archOf(bag) {
    const c = { combo: 0, counter: 0, poison: 0, space: 0 };
    for (const it of bag.items) { const a = ITEMS[it.id].arch; if (a) c[a] += LV(it); }
    let best = null, bv = 1.5;
    for (const k in c) if (c[k] > bv) { bv = c[k]; best = k; }
    return { best, c };
  }

  return { CFG, ITEMS, ARCH, TAGNAME, TASTES, RUN, KIND, KITS, LV, desc, fmt, makeRng, makeItem, makeBag, cloneBag, buildGrid, canPlace, itemAt, removeItem, canMerge, mergeInto, canDiscard,
    scoreBag, reflect, pileValue, probA, bagValue, autoPlace, improve, makeGuest, oppCtx, tasteNow, tasteNext, newRun, nextNode, dealTable, chestItems, oppChoose, oppTake, fightRound, applyReward, applyChest, applyRest, archOf };
});
