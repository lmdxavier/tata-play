// 分赃背包 · 模拟玩家（贪心 / 中等 / 会算），也给界面算「玩家更想让对手拿哪堆」（暗调用）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'));
  else root.FZBOT = factory(root.FZ);
})(typeof self !== 'undefined' ? self : this, function (FZ) {
  'use strict';
  const { CFG, ITEMS, RUN, LV } = FZ;

  const DEF = { wHp: 1.4, lowHp: 2.0, wLong: 1.0, wLoot: 1.0, fav: null, favBonus: 5, style: null, banStyle: null, noHold: false };
  const REWARD_VAL = { small: 5, regular: 30, boss: 80 };

  function futureRounds(G) { let f = 0; for (let i = G.node + 1; i < RUN.length; i++) if (RUN[i].t === 'guest') f += RUN[i].stay; return f; }
  function genericCtx(G) {
    const F = futureRounds(G), hpFrac = G.hp / G.maxHp;
    return { crit: CFG.crit, oppAtk: 4 + G.node * 1.3, rounds: 2.2, future: F, wDef: 1.0 + 0.8 * (1 - hpFrac), wHeal: 0.8 + 1.2 * (1 - hpFrac), barrelCost: 9 };
  }
  function guestCtx(G, oppBag) {
    const o = G.opp, hpFrac = G.hp / G.maxHp;
    const oa = FZ.scoreBag(oppBag || o.bag).total;
    return { crit: CFG.crit, oppAtk: oa, rounds: Math.max(1, o.stay - o.round), future: futureRounds(G), wDef: 1.0 + 0.8 * (1 - hpFrac), wHeal: 0.8 + 1.2 * (1 - hpFrac), barrelCost: 9 };
  }
  // 当前客人剩下几轮，按期望值推一遍
  function simGuest(G, myBag, oppBag, holdFirst) {
    const o = G.opp, R = o.stay - o.round;
    let hp = G.hp, ohp = o.hp, st = o.poison, mst = G.poison;
    const op = FZ.scoreBag(oppBag);
    const meN = FZ.scoreBag(myBag, { crit: CFG.crit }), meH = holdFirst ? FZ.scoreBag(myBag, { hold: true, crit: CFG.crit }) : null;
    let myFuse = [], opFuse = [];
    for (const it of myBag.items) if (it.id === 'barrel') myFuse.push(it.fuse);
    for (const it of oppBag.items) if (it.id === 'barrel') opFuse.push(it.fuse);
    for (let r = 1; r <= R; r++) {
      const me = (r === 1 && meH) ? meH : meN;
      ohp -= Math.max(0, me.total - op.block);
      if (ohp <= 0) return { kill: r, hp, R };
      hp -= FZ.reflect(op, me.total) + Math.max(0, op.total - me.block);
      ohp -= FZ.reflect(me, op.total);
      if (hp <= 0) return { dead: r, hp, R };
      if (ohp <= 0) return { kill: r, hp, R };
      hp = Math.min(G.maxHp, hp + me.heal); ohp = Math.min(o.maxHp, ohp + op.heal);
      st += me.poisonOut; mst += op.poisonOut; ohp -= st * me.ticks; hp -= mst * op.ticks;
      if (hp <= 0) return { dead: r, hp, R };
      if (ohp <= 0) return { kill: r, hp, R };
      myFuse = myFuse.map((f) => f - 1); opFuse = opFuse.map((f) => f - 1);
      for (const f of myFuse) if (f === 0) hp -= CFG.barrelDmg;
      for (const f of opFuse) if (f === 0) ohp -= CFG.barrelDmg;
      if (hp <= 0) return { dead: r, hp, R };
      if (ohp <= 0) return { kill: r, hp, R };
    }
    return { kill: 0, hp, R, ohp };
  }
  function longValue(G, bag, P) {
    let v = FZ.bagValue(bag, genericCtx(G));
    if (P.fav) for (const it of bag.items) if (ITEMS[it.id].arch === P.fav) v += P.favBonus * LV(it);
    return v;
  }
  function utility(G, myBag, oppBag, P, holdFirst) {
    const o = G.opp, s = simGuest(G, myBag, oppBag, holdFirst);
    if (s.dead) return -1000 + s.dead * 10;
    const F = futureRounds(G), lv = longValue(G, myBag, P);
    let u = -(G.hp - s.hp) * P.wHp * (1 + P.lowHp * (1 - Math.max(0, s.hp) / G.maxHp));
    if (s.kill) {
      u += o.final ? 1000 : REWARD_VAL[o.kind];
      if (!o.final) u -= (s.R - s.kill) * (4 + 0.1 * lv) * P.wLoot; // 提前打跑 = 后面几轮的东西没了
    } else if (o.final) u -= 400 - 300 * Math.max(0, 1 - s.ohp / o.maxHp);
    u += lv * P.wLong * Math.min(F, 10) / 4;
    return u;
  }
  const cloneItems = (arr) => arr.map((i) => Object.assign({}, i));

  // ---- 会算的：把每种分法两个结果都推一遍 ----
  function planSplit(G, table, P) {
    P = Object.assign({}, DEF, P || {});
    const n = table.length, taste = FZ.tasteNow(G.opp), full = (1 << n) - 1;
    const memo = {};
    const outcome = (mineMask) => { // 我拿到 mineMask 这些，其余归他
      if (memo[mineMask] != null) return memo[mineMask];
      const mine = [], his = [];
      for (let i = 0; i < n; i++) ((mineMask >> i) & 1 ? mine : his).push(table[i]);
      const ob = FZ.cloneBag(G.opp.bag); FZ.autoPlace(ob, cloneItems(his), FZ.oppCtx(G.opp, FZ.scoreBag(G.bag, { crit: CFG.crit }).total), {});
      const mb = FZ.cloneBag(G.bag); FZ.autoPlace(mb, cloneItems(mine), guestCtx(G, ob), {});
      return (memo[mineMask] = utility(G, mb, ob, P));
    };
    const cands = [];
    let uMin = 1e9, uMax = -1e9;
    for (let m = 1; m < full; m++) {
      if (!(m & 1)) continue; // A 堆固定含第 0 件，去掉镜像
      const A = [], B = [];
      for (let i = 0; i < n; i++) ((m >> i) & 1 ? A : B).push(table[i]);
      const pA = FZ.probA(taste, A, B);
      const uTakeA = outcome(full ^ m), uTakeB = outcome(m);
      uMin = Math.min(uMin, uTakeA, uTakeB); uMax = Math.max(uMax, uTakeA, uTakeB);
      cands.push({ A, B, pA, uTakeA, uTakeB, eu: pA * uTakeA + (1 - pA) * uTakeB });
    }
    const range = Math.max(1e-6, uMax - uMin);
    for (const c of cands) {
      const good = c.uTakeA >= c.uTakeB ? 'A' : 'B';
      c.want = good; c.pGood = good === 'A' ? c.pA : 1 - c.pA; c.gap = Math.abs(c.uTakeA - c.uTakeB) / range;
      c.style = c.gap < 0.2 ? 'hedge' : c.pGood >= 0.7 ? 'sure' : 'gamble';
    }
    let pool = cands;
    if (P.style) { const f = cands.filter((c) => c.style === P.style); if (f.length) pool = f; }
    if (P.banStyle) { const f = cands.filter((c) => c.style !== P.banStyle); if (f.length) pool = f; }
    let best = pool[0];
    for (const c of pool) if (c.eu > best.eu) best = c;
    best.nStyles = new Set(cands.map((c) => c.style)).size;
    best.cands = cands;
    return best;
  }
  function planArrange(G, items, P) {
    P = Object.assign({}, DEF, P || {});
    const old = new Set(G.bag.items.map((i) => i.uid));
    const ctx = G.opp ? guestCtx(G) : genericCtx(G);
    // 当前客人和长远各占一半：用长远的权重再补一刀
    const dropped = FZ.autoPlace(G.bag, items, ctx, { deep: true, oldUids: old });
    return dropped;
  }
  function planHold(G, P) {
    P = Object.assign({}, DEF, P || {});
    const o = G.opp;
    if (P.noHold || o.stay - o.round < 2 || o.final) return false;
    const u0 = utility(G, G.bag, o.bag, P, false), u1 = utility(G, G.bag, o.bag, P, true);
    return u1 > u0 + 0.5;
  }
  function planSteal(G, P) {
    P = Object.assign({}, DEF, P || {});
    let best = null, bv = -1e9;
    for (const it of G.opp.bag.items) {
      if (it.id === 'barrel') continue;
      const mb = FZ.cloneBag(G.bag); const c = Object.assign({}, it); FZ.autoPlace(mb, [c], genericCtx(G), {});
      const v = longValue(G, mb, P); if (v > bv) { bv = v; best = it; }
    }
    return best;
  }

  // ---- 贪心的：只看哪件东西本身好，想要的放一堆，不看概率、不看对手、不管挨着谁 ----
  const baseVal = (it) => ITEMS[it.id].val * LV(it);
  function greedySplit(G, table) {
    const s = table.slice().sort((a, b) => baseVal(b) - baseVal(a));
    const k = Math.max(1, Math.min(table.length - 1, Math.ceil(table.length / 2)));
    const B = s.slice(0, k), A = s.slice(k); // 我想要 B，希望他拿 A
    return { A, B, want: 'A', pA: FZ.probA(FZ.tasteNow(G.opp), A, B), style: 'greedy' };
  }
  function greedyArrange(G, items) {
    const bag = G.bag, dropped = [];
    for (const it of items.slice().sort((a, b) => baseVal(b) - baseVal(a))) {
      const t = bag.items.find((x) => FZ.canMerge(x, it));
      if (t) { FZ.mergeInto(t, it); continue; }
      let placed = false;
      for (let y = 0; y < bag.rows && !placed; y++) for (let x = 0; x < bag.cols && !placed; x++) if (FZ.canPlace(bag, it.id, x, y, -1)) { it.x = x; it.y = y; bag.items.push(it); placed = true; }
      if (placed) continue;
      // 放不下：比包里最差的 1 格物品好就换掉它
      if (ITEMS[it.id].w * ITEMS[it.id].h === 1) {
        let worst = null;
        for (const x of bag.items) if (FZ.canDiscard(x) && ITEMS[x.id].w * ITEMS[x.id].h === 1 && (!worst || baseVal(x) < baseVal(worst))) worst = x;
        if (worst && (baseVal(worst) < baseVal(it) || !FZ.canDiscard(it))) { it.x = worst.x; it.y = worst.y; FZ.removeItem(bag, worst.uid); dropped.push(worst); bag.items.push(it); continue; }
      }
      dropped.push(it);
    }
    return dropped;
  }
  // ---- 中等的：会看概率，但只按东西本身的价值算，不推演 ----
  function midSplit(G, table) {
    const n = table.length, taste = FZ.tasteNow(G.opp), full = (1 << n) - 1;
    let best = null;
    for (let m = 1; m < full; m++) {
      if (!(m & 1)) continue;
      const A = [], B = [];
      for (let i = 0; i < n; i++) ((m >> i) & 1 ? A : B).push(table[i]);
      const pA = FZ.probA(taste, A, B);
      const vA = A.reduce((s, i) => s + baseVal(i), 0), vB = B.reduce((s, i) => s + baseVal(i), 0);
      const eu = pA * vB + (1 - pA) * vA;
      if (!best || eu > best.eu) best = { A, B, pA, eu, want: vB >= vA ? 'A' : 'B', style: 'mid' };
    }
    return best;
  }

  // 界面用：这样分的话，玩家更希望对手拿哪堆（差不多就返回 null，不算赌）
  function wantOf(G, A, B) {
    const P = Object.assign({}, DEF);
    const u = (mine, his) => { const ob = FZ.cloneBag(G.opp.bag); FZ.autoPlace(ob, cloneItems(his), FZ.oppCtx(G.opp, FZ.scoreBag(G.bag, { crit: CFG.crit }).total), {}); const mb = FZ.cloneBag(G.bag); FZ.autoPlace(mb, cloneItems(mine), guestCtx(G, ob), {}); return utility(G, mb, ob, P); };
    const uA = u(B, A), uB = u(A, B);
    if (Math.abs(uA - uB) < 6) return null; // 两种结果差不多：不算赌，不计连输也不暗调
    return uA > uB ? 'A' : 'B';
  }

  const BOTS = {
    plan:   (P) => ({ name: '会算', split: (G, t) => planSplit(G, t, P), arrange: (G, i) => planArrange(G, i, P), hold: (G) => planHold(G, P), steal: (G) => planSteal(G, P) }),
    greedy: () => ({ name: '贪心', split: greedySplit, arrange: greedyArrange, hold: () => false, steal: (G) => G.opp.bag.items.filter((i) => i.id !== 'barrel').sort((a, b) => baseVal(b) - baseVal(a))[0] }),
    mid:    () => ({ name: '中等', split: midSplit, arrange: (G, i) => FZ.autoPlace(G.bag, i, G.opp ? guestCtx(G) : genericCtx(G), {}), hold: () => false, steal: (G) => G.opp.bag.items.filter((i) => i.id !== 'barrel').sort((a, b) => baseVal(b) - baseVal(a))[0] }),
    // 拆开看：分得好但乱摆 / 乱分但摆得好
    splitOnly:   (P) => ({ name: '只会分', split: (G, t) => planSplit(G, t, P), arrange: greedyArrange, hold: () => false, steal: (G) => planSteal(G, P) }),
    arrangeOnly: (P) => ({ name: '只会摆', split: greedySplit, arrange: (G, i) => planArrange(G, i, P), hold: () => false, steal: (G) => planSteal(G, P) }),
  };

  // 跑完整一局。hook(G, 事件名, 数据) 可选
  function playRun(seed, bot, opt, hook) { return playFrom(FZ.newRun(seed, opt || {}), bot, hook); }
  // 复制一份局面（换一个随机种子），给「从这里往下推演很多次」用
  function cloneG(G, seed) { const c = JSON.parse(JSON.stringify(G, (k, v) => (k === 'rnd' ? undefined : v))); c.rnd = FZ.makeRng(seed); return c; }
  function playFrom(G, bot, hook) {
    const h = hook || (() => {});
    for (;;) {
      h(G, 'node', null);
      const node = FZ.nextNode(G);
      if (!node) break;
      if (node.t === 'chest') { bot.arrange(G, FZ.applyChest(G)); continue; }
      if (node.t === 'rest') { FZ.applyRest(G); continue; }
      for (;;) {
        const table = FZ.dealTable(G);
        const sp = bot.split(G, table);
        h(G, 'split', sp);
        const ch = FZ.oppChoose(G, sp.A, sp.B, sp.want);
        G.stats.splits.push({ style: sp.style, pGood: sp.pGood, won: ch.took === sp.want, node: G.node, taste: FZ.tasteNow(G.opp), nA: sp.A.length, nB: sp.B.length });
        const mine = ch.took === 'A' ? sp.B : sp.A, his = ch.took === 'A' ? sp.A : sp.B;
        FZ.oppTake(G, his);
        bot.arrange(G, mine);
        const hold = bot.hold(G);
        h(G, 'prefight', { hold });
        const res = FZ.fightRound(G, { hold });
        h(G, 'fight', res);
        if (res.next === 'round') continue;
        if (res.next === 'reward') { const r = FZ.applyReward(G); if (r.steal) { const it = bot.steal(G); if (it) { const c = Object.assign({}, it); c.uid = FZ.makeItem('scrap').uid; bot.arrange(G, [c]); } } }
        break;
      }
      if (G.over) break;
    }
    if (!G.over) G.over = 'win';
    return G;
  }

  return { DEF, BOTS, wantOf, playRun, playFrom, cloneG, planSplit, planArrange, planHold, planSteal, greedySplit, greedyArrange, midSplit, simGuest, utility, guestCtx, genericCtx, futureRounds, longValue };
});
