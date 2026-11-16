/* dig hero 数值表（v0.4：区域制，区域 1 表土层；设计见 docs/系统与数值.md） */
(function (g) {
  'use strict';
  const B = {};
  B.W = 7;
  B.AREA = 50;            // 每区域 50 行（1 行 = 1 米）
  B.AREAS_OPEN = 1;       // v0.4 只开放区域 1
  B.STAGES = 10;          // 外观表（terrain.js）仍按 10 个区域
  B.STAGE = B.AREA;
  B.areaOf = r => Math.max(0, Math.floor(r / B.AREA));
  B.stageOf = B.areaOf;
  B.AREA_NAME = ['表土层', '沙岩层', '根须红土', '苔藓洞', '紫晶岩', '冰窟', '青岩沼', '灰岩深层', '熔岩层', '暗紫遗迹'];
  B.P = { dieLoss: 0.3, baseDig: 5, baseFreq: 2.5, fullBonus: 0.3 };

  /* ---------- 地下 ---------- */
  const dep = r => Math.max(0, r);
  B.dirtHp = r => 6 * Math.pow(1.045, dep(r));
  B.dirtCoin = r => 3 * Math.pow(1.05, dep(r));
  B.CELL = {   // t → { 血量倍数, 金币倍数, 掉的材料 }
    1: { name: '土', hp: 1, coin: 1 },
    2: { name: '玄武岩', hp: 4, coin: 2 },
    4: { name: '树根', hp: 1.5, coin: 1, mat: 'wood' },
    5: { name: '铜矿', hp: 2, coin: 5, mat: 'copper' },
    6: { name: '食物', hp: 0.5, coin: 0 },
  };
  B.cellHp = (t, r) => B.dirtHp(r) * (B.CELL[t] ? B.CELL[t].hp : 1);
  B.FOOD = {
    mushroom: { name: '野蘑菇', img: 'mat/mushroom.png', heal: 0.10 },
    apple: { name: '苹果', img: 'mat/apple.png', heal: 0.20 },
    strawberry: { name: '草莓', img: 'mat/strawberry.png', heal: 0.35 },
  };
  B.drain = r => Math.pow(2, dep(r) / 25);   // 每秒掉多少体力
  B.MON = {
    Slime_Green: { name: '绿史莱姆', hp: 24, atk: 6, gem: 1, mat: 'gel', p: 0.5, pity: 3 },
    Snail_Green: { name: '绿蜗牛', hp: 40, atk: 9, gem: 2, mat: 'pearl', p: 0.35, pity: 4, from: 15 },
    Beetle_Red: { name: '红甲虫王', hp: 1200, atk: 26, gem: 30, coin: 400, mat: 'amber', boss: true },
  };
  B.monHp = (k, r) => B.MON[k].boss ? B.MON[k].hp : B.MON[k].hp * Math.pow(1.045, dep(r));
  B.monAtk = (k, r) => B.MON[k].boss ? B.MON[k].atk : B.MON[k].atk * Math.pow(1.03, dep(r));
  B.monCoin = (k, r) => B.MON[k].coin || B.dirtCoin(r) * 1.5;
  B.hurt = (matk, def) => Math.max(1, Math.round(Math.max(matk * 0.15, matk - def)));

  /* ---------- 材料 ---------- */
  B.MAT = {
    wood: { name: '树根木', img: 'mat/wood.png', src: '0–25 米的树根方块（土里露出的树根）' },
    silk: { name: '蛛丝', img: 'mat/spider_web.png', src: '8–50 米洞穴角上的蜘蛛网（碰到就收）' },
    copper: { name: '铜矿石', img: 'mat/copper.png', src: '12–50 米的铜矿方块' },
    gel: { name: '史莱姆黏液', img: 'mat/cactus_pulp.png', src: '绿史莱姆 50% 掉落（连续 3 只没掉必掉）', mon: 'Slime_Green' },
    pearl: { name: '蜗牛珠', img: 'mat/tree_sap.png', src: '绿蜗牛（15 米起）35% 掉落（连续 4 只没掉必掉）', mon: 'Snail_Green' },
    amber: { name: '甲虫琥珀', img: 'mat/amberstone.png', src: '50 米守卫“红甲虫王”首次击败必掉', mon: 'Beetle_Red' },
  };
  B.MAT_ORDER = ['wood', 'silk', 'copper', 'gel', 'pearl', 'amber'];

  /* ---------- 装备：部位 → 档位列表（0 档自带） ---------- */
  B.SLOTS = ['weapon', 'shield', 'helmet', 'armor'];
  B.SLOT = {
    weapon: { name: '武器', stat: 'atk', part: 'Sword' },
    shield: { name: '盾牌', stat: 'def', part: 'Shield' },
    helmet: { name: '头盔', stat: 'hp', part: 'Helmet' },
    armor: { name: '背包', stat: 'stam', part: 'Chest' },
  };
  B.GEAR = {
    weapon: [
      { name: '木棍', v: 5, part: 'Blunt', spr: 'FA_WP_Main_Blunt_001_Wood' },
      { name: '木剑', v: 9, coin: 90, mat: { wood: 4 }, spr: 'FA_WP_Main_Sword_002_Wood' },
      { name: '铜剑', v: 16, coin: 420, mat: { copper: 6, gel: 2 }, spr: 'FA_WP_Main_Sword_001_Gold' },
      { name: '琥珀剑', v: 28, coin: 1600, mat: { copper: 10, pearl: 3, amber: 1 }, spr: 'FA_WP_Main_Sword_003_GoldRed' },
      { name: '苔晶剑', v: 50, next: true, spr: 'FA_WP_Main_Sword_013_Green' },
    ],
    shield: [
      { name: '锅盖', v: 2, spr: 'FA_WP_Sub_Shield_002_WoodGray' },
      { name: '木盾', v: 4, coin: 70, mat: { wood: 5 }, spr: 'FA_WP_Sub_Shield_005_WoodGray' },
      { name: '铜盾', v: 7, coin: 380, mat: { copper: 6, wood: 4 }, spr: 'FA_WP_Sub_Shield_005_Gold' },
      { name: '琥珀盾', v: 12, coin: 1500, mat: { copper: 10, gel: 4, amber: 1 }, spr: 'FA_WP_Sub_Shield_010_Gold' },
      { name: '蓝钢盾', v: 21, next: true, spr: 'FA_WP_Sub_Shield_008_BlueGold' },
    ],
    helmet: [
      { name: '布帽', v: 50, spr: 'FA_Helmet_007_RedWhite' },
      { name: '蛛丝帽', v: 85, coin: 80, mat: { silk: 3 }, spr: 'FA_Helmet_013_White' },
      { name: '铜盔', v: 145, coin: 400, mat: { copper: 5, silk: 3 }, spr: 'FA_Helmet_012_Brown' },
      { name: '琥珀盔', v: 250, coin: 1500, mat: { copper: 8, pearl: 3, amber: 1 }, spr: 'FA_Helmet_033_GoldRed' },
      { name: '海军盔', v: 430, next: true, spr: 'FA_Helmet_021_Navy' },
    ],
    armor: [
      { name: '粗布衣', v: 10, spr: 'FA_Chest_004_Brown' },
      { name: '草编背包', v: 15, coin: 90, mat: { wood: 5 }, spr: 'FA_Chest_010_Brown' },
      { name: '蛛丝背包', v: 22, coin: 450, mat: { silk: 4, gel: 3 }, spr: 'FA_Chest_013_White' },
      { name: '琥珀背包', v: 33, coin: 1800, mat: { copper: 8, pearl: 2, amber: 1 }, spr: 'FA_Chest_016_Gold' },
      { name: '翠银斗篷', v: 50, next: true, spr: 'FA_Chest_015_GreenSilver' },
    ],
  };

  /* ---------- 技能树（网状；x,y 是格位，0,0 为中心） ---------- */
  // eff：派生属性用；mech：机制节点；cur：币种；c0：第 1 级价格；k：每级乘数；req：[[节点, 级], ...]；boss：要打过守卫
  B.SK = [
    { id: 'root', name: '矿工之心', ic: 'Item_Compass_01_Gold', x: 0, y: 0, max: 1, c0: 0, cur: 'coin', br: 'root', desc: () => '一切从这里开始' },
    { id: 'dig', name: '锋利镐尖', ic: 'Gear_Weapons_Pickaxe_01', x: 0, y: -1, max: 10, c0: 8, k: 1.42, cur: 'coin', br: 'dig', req: [['root', 1]], desc: l => `挖掘力 +25% / 级（现在 ×${(1 + .25 * l).toFixed(2)}）` },
    { id: 'freq', name: '挥镐速度', ic: 'Economy_Energy_01_Yellow', x: -1, y: -2, max: 6, c0: 25, k: 1.9, cur: 'coin', br: 'dig', req: [['dig', 1]], desc: l => `每秒挥击 +0.25 次（现在 ${(2.5 + .25 * l).toFixed(2)} 次/秒）` },
    { id: 'heavy', name: '重击', ic: 'Gear_Weapons_Hammer_01', x: 1, y: -2, max: 1, c0: 60, cur: 'coin', br: 'dig', mech: 1, req: [['dig', 3]], desc: () => '每第 4 下挖掘，伤害 ×3' },
    { id: 'heavy2', name: '重击强化', ic: 'Gear_Weapons_Hammer_02', x: 2, y: -3, max: 3, c0: 300, k: 2.5, cur: 'coin', br: 'dig', req: [['heavy', 1]], desc: l => `重击倍率 +1 / 级（现在 ×${3 + l}）` },
    { id: 'pierce', name: '穿透', ic: 'Gear_Weapons_Shovel_01', x: -2, y: -3, max: 1, c0: 500, cur: 'coin', br: 'dig', mech: 1, req: [['freq', 2]], desc: () => '往下挖时，下面第 2 格同时受 50% 伤害' },
    { id: 'soil', name: '表土专精', ic: 'Material_Ore_01', x: 0, y: -3, max: 4, c0: 600, k: 2, cur: 'coin', br: 'dig', req: [['dig', 6]], desc: l => `对表土层方块伤害 +50% / 级（现在 ×${(1 + .5 * l).toFixed(1)}）` },
    { id: 'soilx', name: '表土制霸', ic: 'Misc_Earth_01', x: 0, y: -4, max: 1, c0: 6000, gem: 50, cur: 'coin', br: 'dig', mech: 1, req: [['soil', 4]], boss: 1, desc: () => '表土层的土、树根、矿一下就碎（玄武岩除外）' },
    { id: 'time', name: '耐饿', ic: 'Consumable_Food_Meat_01', x: -1, y: 0, max: 10, c0: 10, k: 1.5, cur: 'coin', br: 'live', req: [['root', 1]], desc: l => `体力上限 +15% / 级（现在 ×${(1 + .15 * l).toFixed(2)}）` },
    { id: 'full', name: '吃饱有力', ic: 'Consumable_Food_Steak_01', x: -2, y: -1, max: 1, c0: 50, cur: 'coin', br: 'live', mech: 1, req: [['time', 2]], desc: () => '体力高于 50% 时挖掘力 +30%' },
    { id: 'kill', name: '打怪回气', ic: 'Consumable_Food_Skewer_01', x: -3, y: 0, max: 1, c0: 120, cur: 'coin', br: 'live', mech: 1, req: [['time', 4]], desc: () => '打死怪回复 8% 体力' },
    { id: 'aid', name: '急救包', ic: 'Consumable_Healing_Bandage_01', x: -2, y: 1, max: 2, c0: 150, k: 3, cur: 'coin', br: 'live', req: [['time', 3]], desc: l => `血量归零时保住的收获：${[70, 85, 100][l]}%${l < 2 ? ' → ' + [70, 85, 100][l + 1] + '%' : ''}` },
    { id: 'atk', name: '臂力', ic: 'Misc_Fist_01_Brown', x: 1, y: 0, max: 10, c0: 3, k: 1.5, cur: 'gem', br: 'war', req: [['root', 1]], desc: l => `攻击 +20% / 级（现在 ×${(1 + .2 * l).toFixed(1)}）` },
    { id: 'def', name: '铁壁', ic: 'Gear_Shield_01', x: 2, y: -1, max: 10, c0: 4, k: 1.5, cur: 'gem', br: 'war', req: [['atk', 1]], desc: l => `防御 +20% / 级（现在 ×${(1 + .2 * l).toFixed(1)}）` },
    { id: 'hp', name: '强壮', ic: 'Economy_Heart_Red', x: 2, y: 1, max: 10, c0: 4, k: 1.5, cur: 'gem', br: 'war', req: [['atk', 1]], desc: l => `血量 +20% / 级（现在 ×${(1 + .2 * l).toFixed(1)}）` },
    { id: 'counter', name: '反击', ic: 'Misc_Fist_02_Yellow', x: 3, y: -1, max: 1, c0: 15, cur: 'gem', br: 'war', mech: 1, req: [['def', 1]], desc: () => '被打时立刻还手一下，伤害 ×2' },
    { id: 'crit', name: '暴击', ic: 'Misc_Crosshair_01_Red', x: 3, y: 0, max: 1, c0: 30, cur: 'gem', br: 'war', mech: 1, req: [['atk', 3]], desc: () => '攻击有 15% 概率造成 2.5 倍伤害' },
    { id: 'coin', name: '招财', ic: 'Economy_Coin_04_Gold', x: 0, y: 1, max: 10, c0: 5, k: 1.6, cur: 'gem', br: 'eco', req: [['root', 1]], desc: l => `金币获取 +20% / 级（现在 ×${(1 + .2 * l).toFixed(1)}）` },
    { id: 'gem', name: '宝石嗅觉', ic: 'Economy_Gem_01_Purple', x: 1, y: 2, max: 10, c0: 15, k: 1.6, cur: 'coin', br: 'eco', req: [['coin', 1]], desc: l => `宝石获取 +20% / 级（现在 ×${(1 + .2 * l).toFixed(1)}）` },
    { id: 'ore', name: '矿石专家', ic: 'Material_Ore_02_01', x: -1, y: 2, max: 2, c0: 200, k: 3, cur: 'coin', br: 'eco', req: [['coin', 2]], desc: l => `每块树根 / 矿多掉 1 个材料（现在 +${l}）` },
    { id: 'slime', name: '史莱姆猎人', ic: 'Item_Jelly_01', x: 0, y: 3, max: 2, c0: 6, k: 2, cur: 'gem', br: 'eco', req: [['coin', 1]], desc: l => `史莱姆黏液掉率：${[50, 75, 100][l]}%${l < 2 ? ' → ' + [50, 75, 100][l + 1] + '%' : ''}` },
    { id: 'chest', name: '幸运宝箱', ic: 'Item_Chest_01_Wood', x: 2, y: 3, max: 1, c0: 80, cur: 'coin', br: 'eco', mech: 1, req: [['gem', 1]], desc: () => '每趟地下出现 1 个宝箱（金币 = 10 块同深度的土）' },
  ];
  B.SKI = {}; B.SK.forEach(n => { B.SKI[n.id] = n; });
  B.BR_COL = { root: '#ffd84a', dig: '#ff9a3c', live: '#7ee05a', war: '#ff5a5a', eco: '#ffd84a' };
  B.skCost = (n, l) => Math.round(n.c0 * Math.pow(n.k || 1, l));
  B.skOpen = (S, n) => (n.req || []).every(([id, lv]) => (S.skill[id] || 0) >= lv) && (!n.boss || (S.boss || 0) >= 1);
  B.skSeen = (S, n) => n.id === 'root' || (n.req || []).some(([id]) => (S.skill[id] || 0) >= 1);

  /* ---------- 宠物、VIP、签到 ---------- */
  B.PETS = {
    Pug: { name: '挖挖狗', desc: '每秒帮你挖 1 下（50% 挖掘力）', dig: 0.5 },
    Bomb: { name: '炸弹崽', desc: '每秒帮你打 1 下（60% 攻击）', atk: 0.6 },
    Goldfish: { name: '招财鱼', desc: '金币获取 +30%；离线每小时带回 1 趟收入（最多 8 小时，VIP3 起 12 小时）', coin: 0.3, offline: 1 },
    Flower: { name: '花花', desc: '每块树根 / 矿多掉 1 个材料的概率 30%', ore: 0.3 },
  };
  B.VIP = [
    { ads: 1, text: '宠物 挖挖狗', pet: 'Pug' },
    { ads: 3, text: '自动模式：定一个方向自动挖', auto: 1 },
    { ads: 6, text: '离线收益上限 8 → 12 小时，广告宝箱每天多 1 次', off12: 1 },
    { ads: 10, text: '宠物 炸弹崽', pet: 'Bomb' },
    { ads: 15, text: '挂机循环：自动收下、自动再下矿', loop: 1 },
    { ads: 22, text: '送 1 件当前最高档 +1 的装备（自选部位）', gift: 1 },
    { ads: 30, text: '宠物 招财鱼', pet: 'Goldfish' },
  ];
  B.SIGN = [
    { text: '200 金币', coin: 200 },
    { text: '史莱姆黏液 ×3', mat: { gel: 3 } },
    { text: '宠物 花花', pet: 'Flower' },
    { text: '10 宝石', gem: 10 },
    { text: '铜矿石 ×5', mat: { copper: 5 } },
    { text: '收益增益 5 趟（收益 ×2）', boost: 5 },
    { text: '一件区域 1 最高档装备（还没有的部位）', gear: 3 },
  ];
  B.ADCAP = { boost: 3, revive: 2, keep: 1, chest: 2, offline: 1, vip: 1 };
  B.AD_DAY = 10;

  /* ---------- 由存档算出面板属性 ---------- */
  B.gearOf = (S, slot) => B.GEAR[slot][S.gear[slot] || 0];
  B.derive = (S) => {
    const L = id => S.skill[id] || 0, v = s => B.gearOf(S, s).v;
    const pet = S.pet && B.PETS[S.pet];
    const m = {
      atk: 1 + 0.2 * L('atk'), def: 1 + 0.2 * L('def'), hp: 1 + 0.2 * L('hp'), stam: 1 + 0.15 * L('time'),
    };
    return {
      base: { atk: v('weapon'), def: v('shield'), hp: v('helmet'), stam: v('armor') }, mult: m,
      atk: v('weapon') * m.atk, def: v('shield') * m.def, hp: Math.round(v('helmet') * m.hp), stam: v('armor') * m.stam,
      dig: B.P.baseDig * (1 + 0.25 * L('dig')), freq: B.P.baseFreq + 0.25 * L('freq'),
      heavy: L('heavy') ? 3 + L('heavy2') : 0, pierce: !!L('pierce'), soil: 1 + 0.5 * L('soil'), soilx: !!L('soilx'),
      full: !!L('full'), kill: !!L('kill'), keep: [0.7, 0.85, 1][L('aid')], counter: !!L('counter'), crit: !!L('crit'),
      coinM: (1 + 0.2 * L('coin')) * (1 + (pet && pet.coin || 0)), gemM: 1 + 0.2 * L('gem'),
      oreX: L('ore'), slimeP: [0.5, 0.75, 1][L('slime')], chest: !!L('chest'), pet,
    };
  };
  B.hits = (hp, dmg) => Math.max(1, Math.ceil(hp / dmg - 1e-9));
  B.fmt = n => { n = Math.floor(n); if (n < 10000) return '' + n; const u = ['万', '亿', '万亿']; let i = -1; while (n >= 10000 && i < 2) { n /= 10000; i++; } return (n >= 99.95 ? n.toFixed(0) : n >= 9.995 ? n.toFixed(1) : n.toFixed(2)) + u[i]; };
  g.BAL = B; if (typeof module !== 'undefined') module.exports = B;
})(typeof window !== 'undefined' ? window : globalThis);
