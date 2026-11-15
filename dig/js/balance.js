/* dig hero 数值表与公式（游戏和 tools/sim.js 共用；改这里后跑 node tools/sim.js） */
(function (g) {
  'use strict';
  const B = {};
  B.W = 7;            // 一屏 7 格宽
  B.STAGE = 20;       // 每阶段 20 行（1 行 = 1 米）
  B.STAGES = 10;
  B.SPUR_EVERY = 3;   // 每 3 行一根“叉”
  B.SPUR_LEN = 5;     // 叉长 5 格，留 2 格缺口
  B.P = {             // 可调参数（sim 会覆盖）
    blockHp: 10, blockHpG: 5, spurK: 6, blockCoin: 8, coinG: 5,
    monHp: 36, monHpG: 6, monAtk: 8, monAtkG: 3, monGem: 4, gemG: 5, monCoin: 3,
    bossHpK: 12, bossAtkK: 1.5, bossGemK: 12, bossCoinK: 10,
    drain: 10, drainG: 3.5,
    gearG: 3, gearPrice: 30, gearPriceG: 13, pickPrice: 30, pickPriceG: 10,
    skillPrice: 40, skillPriceG: 16, timePrice: 15, timePriceG: 6, freqPrice: 80, freqPriceG: 6,
    dieLoss: 0.3, fullBonus: 0.2,
  };
  const P = B.P;
  B.stageOf = row => Math.max(0, Math.floor(row / B.STAGE));
  B.blockHp = s => P.blockHp * Math.pow(P.blockHpG, s);
  B.spurHp = s => B.blockHp(s) * P.spurK;
  B.blockCoin = s => P.blockCoin * Math.pow(P.coinG, s);
  B.monHp = s => P.monHp * Math.pow(P.monHpG, s);
  B.monAtk = s => P.monAtk * Math.pow(P.monAtkG, s);
  B.monGem = s => P.monGem * Math.pow(P.gemG, s);
  B.monCoin = s => P.monCoin * Math.pow(P.coinG, s);
  B.boss = s => ({ hp: B.monHp(s) * P.bossHpK, atk: B.monAtk(s) * P.bossAtkK, gem: B.monGem(s) * P.bossGemK, coin: B.blockCoin(s) * P.bossCoinK });
  B.drain = s => P.drain * Math.pow(P.drainG, s);

  /* 装备：四个部位 + 镐。值 = base × 3^档；0 档是开局自带 */
  B.GEAR = {
    weapon: { name: '武器', stat: 'atk', base: 6, cur: 'coin', slot: '右手' },
    shield: { name: '盾牌', stat: 'def', base: 3, cur: 'coin', slot: '左手' },
    helmet: { name: '头盔', stat: 'hp', base: 60, cur: 'coin', slot: '头' },
    armor: { name: '行囊衣', stat: 'stam', base: 100, cur: 'coin', slot: '身' },
    pick: { name: '镐', stat: 'dig', base: 5, cur: 'gem', slot: '工具' },
  };
  B.gearVal = (k, t) => B.GEAR[k].base * Math.pow(P.gearG, t);
  B.gearPrice = (k, t) => Math.round((k === 'pick' ? P.pickPrice * Math.pow(P.pickPriceG, t - 1) : P.gearPrice * Math.pow(P.gearPriceG, t - 1)));  // 买第 t 档（t≥1）
  B.MAX_TIER = B.STAGES + 1;

  /* 技能线：每条线一串节点，小节点 +20%×5 次（合计 ×2），大节点一次 +100% / +200% / +500% */
  B.NODE_SEQ = [['s', 2], ['b', 2], ['s', 2], ['b', 3], ['s', 2], ['b', 6], ['s', 2], ['b', 6]];
  B.LINES = {
    dig: { name: '挖掘伤害', branch: '探索', cur: 'coin', stat: 'dig' },
    atk: { name: '攻击', branch: '战斗', cur: 'gem', stat: 'atk' },
    def: { name: '防御', branch: '战斗', cur: 'gem', stat: 'def' },
    hp: { name: '血量', branch: '战斗', cur: 'gem', stat: 'hp' },
    coin: { name: '金币获取', branch: '经济', cur: 'gem', stat: 'coin' },
    gem: { name: '宝石获取', branch: '经济', cur: 'coin', stat: 'gem' },
  };
  B.SPECIAL = {   // 加法型技能
    time: { name: '耐饿', branch: '探索', cur: 'coin', max: 12, desc: '体力上限 +50%（每趟约 +5 秒）' },
    freq: { name: '挥镐速度', branch: '探索', cur: 'coin', max: 6, desc: '每秒挥击 +0.5 次' },
  };
  B.nodeClicks = j => B.NODE_SEQ[j][0] === 's' ? 5 : 1;
  B.nodeCost = (line, j) => {   // 第 j 个节点点一次的价格
    const total = P.skillPrice * Math.pow(P.skillPriceG, j) * (B.LINES[line].cur === 'gem' ? P.pickPrice / P.gearPrice * 1.0 : 1);
    return Math.max(1, Math.round(total / B.nodeClicks(j) * (B.NODE_SEQ[j][0] === 's' ? 1 : 0.8)));
  };
  B.specialCost = (k, l) => Math.round(k === 'time' ? P.timePrice * Math.pow(P.timePriceG, l) : P.freqPrice * Math.pow(P.freqPriceG, l));
  B.lineMult = (lv) => {   // lv = 每个节点已点次数的数组
    let m = 1;
    for (let j = 0; j < B.NODE_SEQ.length; j++) { const c = (lv && lv[j]) || 0; if (!c) continue; const [t, x] = B.NODE_SEQ[j]; m *= t === 's' ? 1 + 0.2 * c : x; }
    return m;
  };

  /* 宠物、VIP、图鉴 */
  B.PETS = {
    Pug: { name: '挖挖狗', desc: '跟着你挖：每秒额外挖 1 次，伤害 = 你的挖掘力 50%', dig: 0.5 },
    Bomb: { name: '炸弹崽', desc: '帮你打怪：每秒攻击 1 次，伤害 = 你的攻击 60%', atk: 0.6 },
    Goldfish: { name: '招财鱼', desc: '金币获取 +30%；离线每小时带回 1 趟收入（最多 8 小时）', coin: 0.3, offline: 1 },
  };
  B.VIP = [   // 累计看广告次数 → 奖励
    { ads: 1, text: '宠物 挖挖狗', pet: 'Pug' },
    { ads: 3, text: '金币获取永久 +20%', coin: 0.2 },
    { ads: 6, text: '送一件比你最好装备高 1 档的武器', gift: 'weapon' },
    { ads: 10, text: '宠物 炸弹崽', pet: 'Bomb' },
    { ads: 15, text: '宝石获取永久 +20%', gem: 0.2 },
    { ads: 22, text: '宠物 招财鱼', pet: 'Goldfish' },
    { ads: 30, text: '送一把比你最好的镐高 1 档的镐', gift: 'pick' },
    { ads: 40, text: '金币、宝石获取永久再 +30%', coin: 0.3, gem: 0.3 },
  ];
  B.CODEX_STEPS = [10, 50, 200];   // 每种怪击杀到这些数，各 +2% 金币和宝石
  B.CODEX_BONUS = 0.02;

  /* 由存档算出面板属性 */
  B.derive = (S) => {
    const sk = S.skill || {}, gear = S.gear || {};
    const v = k => B.gearVal(k, gear[k] || 0);
    let coinM = B.lineMult(sk.coin), gemM = B.lineMult(sk.gem);
    let codex = 0; for (const k in (S.codex || {})) for (const n of B.CODEX_STEPS) if (S.codex[k] >= n) codex += B.CODEX_BONUS;
    let vc = 0, vg = 0; for (const r of B.VIP) if ((S.ads || 0) >= r.ads) { vc += r.coin || 0; vg += r.gem || 0; }
    const pet = S.pet && B.PETS[S.pet];
    coinM *= (1 + codex) * (1 + vc) * (1 + (pet && pet.coin || 0)); gemM *= (1 + codex) * (1 + vg);
    return {
      dig: v('pick') * B.lineMult(sk.dig), atk: v('weapon') * B.lineMult(sk.atk), def: v('shield') * B.lineMult(sk.def),
      hp: Math.round(v('helmet') * B.lineMult(sk.hp)), stam: v('armor') * (1 + 0.5 * (sk.time || 0)),
      freq: 3 + 0.5 * (sk.freq || 0), coinM, gemM, pet,
    };
  };
  B.hurt = (matk, def) => Math.max(1, Math.round(Math.max(matk * 0.15, matk - def)));
  B.hits = (hp, dmg) => Math.max(1, Math.ceil(hp / dmg - 1e-9));
  B.fmt = n => { n = Math.floor(n); if (n < 10000) return '' + n; const u = ['万', '亿', '万亿']; let i = -1; while (n >= 10000 && i < 2) { n /= 10000; i++; } return (n >= 99.95 ? n.toFixed(0) : n >= 9.995 ? n.toFixed(1) : n.toFixed(2)) + u[i]; };
  g.BAL = B; if (typeof module !== 'undefined') module.exports = B;
})(typeof window !== 'undefined' ? window : globalThis);
