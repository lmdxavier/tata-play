/* dig hero 数值表（v0.4：区域制，区域 1 浅层岩土（bfix 原名表土层：现实表土只有几十厘米，0–50 米叫表土层不合常识）；设计见 docs/系统与数值.md） */
(function (g) {
  'use strict';
  const B = {};
  B.W = 7;
  B.AREA = 50;            // 每区域 50 行（1 行 = 1 米）
  B.AREAS_OPEN = 2;       // v0.4 只开放区域 1；v0.21 区域 2 线：开放到区域 2（沙岩层，50–99 米），99 行守卫门之后不再往下
  B.STAGES = 10;          // 外观表（terrain.js）仍按 10 个区域
  B.STAGE = B.AREA;
  B.areaOf = r => Math.max(0, Math.floor(r / B.AREA));
  B.stageOf = B.areaOf;
  B.AREA_NAME = ['浅层岩土', '沙岩层', '根须红土', '苔藓洞', '紫晶岩', '冰窟', '青岩沼', '灰岩深层', '熔岩层', '暗紫遗迹'];
  B.SC = 10;   // v0.20 属性整数化（用户：体力 10.3/10.5 一直跳 0.1 不像游戏数值）：血量、体力、攻击、防御、挖掘力、方块血、怪血 / 攻击、掉体力速度统一 ×10，公式同比例，手感不变
  B.P = { dieLoss: 0.3, baseDig: 5 * B.SC, baseFreq: 2.5, fullBonus: 0.3, heavyN: 3 };   // heavyN：重击每第几下（v0.20 4 → 3：土多是 2 下碎，每第 4 下总落在一格的第 2 下上，重击白打）

  /* ---------- 地下 ---------- */
  const dep = r => Math.max(0, r);
  // 深度口径（v0.18 统一）：第 r 行 = r 米，地面线 = 0 米，区域 k 从 k×50 米开始。数值公式、横幅、顶部深度、结算“到达 X 米”、最深纪录都只用它。
  B.depthM = dep;
  B.dirtHp = r => 6 * B.SC * Math.pow(1.045, dep(r));
  B.dirtCoin = r => 3 * Math.pow(1.05, dep(r));
  B.CELL = {   // t → { 血量倍数, 金币倍数, 掉的材料 }
    1: { name: '土', hp: 1, coin: 1 },
    2: { name: '玄武岩', hp: 4, coin: 2 },
    3: { name: '守卫门', hp: 4, coin: 0 },   // v0.21：打败本区域守卫后守卫门能挖（血量同玄武岩），锁着时不能挖
    4: { name: '树根', hp: 1.2, coin: 1, mat: 'wood' },   // bfix 1.5 → 1.2：树根挪到 2–12 米（原 0–25 米）后挡在前几趟的主路上
    5: { name: '铜矿', hp: 2, coin: 5, mat: 'copper' },
    6: { name: '食物', hp: 0.5, coin: 0 },
    // v0.21 区域 2 沙岩层的两种矿（画法同铜矿：game.js 把 img 图标嵌在土里，terrain.js 当作普通土画底）
    // 常识：砂岩里常见含铁的“铁质结核 / 铁矿层”（砂岩发红就是氧化铁）；孔雀石：红色砂岩里的“砂岩型铜矿”（红层铜矿，如美国科罗拉多高原、云南）出露氧化后就是绿色的孔雀石，比铁矿少、更深
    7: { name: '铁矿', hp: 2, coin: 5, mat: 'iron', img: 'mat/ironstone.png', z: 0.6 },
    8: { name: '孔雀石', hp: 2.6, coin: 8, mat: 'malachite', img: 'mat/malachite.png', z: 0.54 },
  };
  B.cellHp = (t, r) => B.dirtHp(r) * (B.CELL[t] ? B.CELL[t].hp : 1);
  B.FOOD = {
    mushroom: { name: '野蘑菇', img: 'mat/mushroom.png', sec: 2 },
    apple: { name: '苹果', img: 'mat/apple.png', sec: 3 },
    strawberry: { name: '草莓', img: 'mat/strawberry.png', sec: 4 },
    // v0.21 区域 2（同区域 1 三档：2 / 3 / 4 秒）。常识：白蚁能往下打几十米的隧道找水（沙漠里有记录到 50–70 米），兵蚁是同一窝里个头更大、头部橙褐带大颚的白蚁；沙漠松露（Terfezia 等）是长在沙土里的地下真菌，沙漠里的人挖来吃，外观像土豆。（v0.21 修：原“野蜂巢”蜜蜂要飞出去采花、不会在几十米深处筑巢；原“甲虫幼虫”图标是绿色毛毛虫，图标包里没有乳白蛴螬图）
    termite: { name: '白蚁', img: 'mat/termite.png', sec: 2 },
    soldier: { name: '兵蚁', img: 'mat/termite_soldier.png', sec: 3 },
    truffle: { name: '沙漠松露', img: 'mat/potato.png', sec: 4 },
  };
  // v0.20 用户 23:17「后期体力永远是满的」：食物、打怪回气原来按体力上限的百分比回（上限涨回得也涨，后期溢出）。
  // 改成按“所在深度掉体力的秒数”回：回多少 = sec × 每秒掉速（B.drain），和上限无关；上限越大，同一个蘑菇占比越小，体力始终是约束
  B.foodHeal = (k, r) => B.FOOD[k].sec * B.drain(r);
  B.CHEST_K = 25;   // 幸运宝箱 = 同深度 25 块土的金币（原 10 块；v0.20 修了开不了的 bug 后定）
  B.KILL_SEC = 1.0;   // 技能「打怪回气」：打死怪回 1.5 秒的体力消耗（原 8% 上限）
  B.drain = r => B.SC * Math.pow(2, dep(r) / 25);   // 每秒掉多少体力（×B.SC 整数化）
  B.MON = {
    Slime_Green: { name: '绿史莱姆', hp: 24, atk: 8, gem: 1, mat: 'gel', p: 0.5, pity: 3 },
    Snail_Green: { name: '绿蜗牛', hp: 40, atk: 12, gem: 2, mat: 'pearl', p: 0.35, pity: 4 },
    Bat_Cave: { name: '洞穴蝙蝠', hp: 18, atk: 9, gem: 1, fly: true },   // v0.18：飞行怪（LayerLab Enemy Monster 2 · Bat_Cave），不掉材料
    Beetle_Red: { name: '红甲虫王', hp: 2000, atk: 72, gem: 30, coin: 400, mat: 'amber', boss: true },
    // v0.21 区域 2 沙岩层（基础值和区域 1 同档；血量 / 攻击 / 宝石照样按深度公式涨，50 米处已是区域 1 同名档的 ×9）
    Lizard_Horn: { name: '角蜥', hp: 26, atk: 9, gem: 1, mat: 'lzskin', p: 0.45, pity: 3 },     // 角蜥（Phrynosoma，沙漠蜥蜴，背上有角刺）
    Snake_Bell: { name: '响尾蛇', hp: 30, atk: 13, gem: 2, mat: 'venom', p: 0.35, pity: 4 },     // 响尾蛇：尾巴末端的响环，出击前会摇响示警
    Beetle_Iron: { name: '铁甲虫', hp: 44, atk: 11, gem: 2 },                                   // 硬壳甲虫：挨打会缩进甲壳（同绿蜗牛缩壳），不掉材料（同蝙蝠）
    // 守卫 堡垒龟：数值按区域 1 守卫 × 区域倍数推（系统与数值 20.3：怪血 / 怪攻 1.045^50 ≈ 9.03、金币 1.05^50 ≈ 11.5、宝石 1.04^50 ≈ 7.1）
    // 2000 × 9.03 ≈ 18000，72 × 9.03 ≈ 650，宝石 30 × 7.1 ≈ 210，金币 400 × 11.5 = 4600
    Turtle_Tower: { name: '堡垒龟', hp: 18000, atk: 650, gem: 210, coin: 4600, mat: 'fortstone', boss: true },
  };
  /* ---------- 怪物行为（v0.18，用户 18:21：不能都是“跑过来打一下”的同一模板；区域 1 取偏慢的值）----------
   * 时间单位秒，距离单位格。sight = 沿空腔 / 挖开的通道能走到主角身边的最长步数（隔着土走不过去就不追）。
   * wind = 前摇（闪红 + 蓄力姿势），每种攻击都有；cd = 打完到下一次能出手的间隔。 */
  B.AI = {
    Slime_Green: { type: 'hop', sight: 4, hop: 0.42, hopH: 0.38, rest: 0.2, wind: 0.45, lunge: 0.24, cd: 1.3 },                          // 一跳一格（能跳上 1 格台阶）；扑咬
    Snail_Green: { type: 'crawl', sight: 3, step: 1.0, wind: 0.55, cd: 1.5, shellHits: 5, shellWin: 2.5, shellT: 2.2, shellDR: 0.75, shellCd: 3 },   // 慢爬；连挨 3 下缩壳 2.2 秒，期间受伤 −75%
    Bat_Cave: { type: 'fly', sight: 5, fly: 0.32, hover: 0.32, wind: 0.65, swoop: 0.32, perch: 1.2, cd: 1.8 },                         // 穿过空腔飞到主角斜上方 → 俯冲 → 落在旁边歇 1.2 秒（破绽）
    // v0.21 区域 2（type = 复用的行为：hop 史莱姆式一格一格窜、能上 1 格台阶；crawl 蜗牛式爬 + 顶；fly 蝙蝠式）
    Lizard_Horn: { type: 'hop', sight: 5, hop: 0.26, hopH: 0.1, rest: 0.15, wind: 0.4, lunge: 0.2, cd: 1.15, sfxHop: null, sfxHit: 'boss_bite', hitVol: 0.5 },   // 窜得快、贴地（不跳高）；咬
    Snake_Bell: { type: 'crawl', sight: 4, step: 0.75, wind: 0.75, cd: 1.6, reach: 0.3 },                                                  // 爬；前摇长（摇尾示警），咬得重
    Beetle_Iron: { type: 'crawl', sight: 3, step: 1.1, wind: 0.6, cd: 1.6, shellHits: 4, shellWin: 2.5, shellT: 2.0, shellDR: 0.8, shellCd: 3, reach: 0.2 },   // 连挨 4 下缩进甲壳 2 秒，受伤 −80%
  };
  /* 守卫红甲虫王：三种招式轮换 + 半血二阶段（每对数字 = [一阶段, 二阶段]），伤害 = 攻击 × 倍数 */
  B.BOSS = {
    wake: 4,                     // 主角到守卫房上方 4 行内醒来
    walk: [0.6, 0.45],           // 走 1 格的秒数
    gap: [0.9, 0.55],            // 招式之间的停顿
    seq: [['near', 'charge', 'near', 'slam'], ['near', 'slam', 'charge', 'near', 'slam']],   // 招式轮换顺序（near = 贴身就顶咬，不贴身就走近）
    bite: { wind: [0.6, 0.42], lunge: 0.26, dmg: 1.0, rec: [0.6, 0.4], times: [1, 2] },     // 二阶段连咬两下
    charge: { wind: [1.0, 0.7], speed: [7, 9], dmg: 1.5, stun: [1.6, 1.1], stunTaken: 1.5 }, // 冲到墙边撞晕 = 破绽，晕着受伤 ×1.5
    slam: { wind: [0.85, 0.6], air: [0.7, 0.55], h: 0.8, dmg: 1.3, wave: 6, waveLen: 3, waveDmg: 0.8, rec: [0.9, 0.6], times: [1, 2] },   // 落点追主角（起跳前 0.15 秒锁定），落地左右各一道冲击波；二阶段连跳两次
    rage: 0.5, roar: 1.3,        // 半血咆哮进入二阶段
  };
  /* v0.21 区域 2 守卫 堡垒龟（背着石堡的陆龟；常识：沙漠陆龟会挖洞住在地下）：同一套招式系统，节奏和红甲虫王不同——
   * 慢、重：走得慢、前摇长；冲撞 = 缩进石堡打滚撞过去（撞墙照样晕 = 破绽）；砸地 = 抬身重踏（跳得低，冲击波更远）；
   * 连挨几下会缩壳减伤 1.6 秒（逼玩家停手 / 小跳躲波），二阶段冲撞更多、连踏两次 */
  B.BOSSES = {
    Beetle_Red: B.BOSS,
    Turtle_Tower: {
      wake: 4,
      walk: [0.8, 0.6],
      gap: [1.1, 0.7],
      seq: [['near', 'slam', 'near', 'charge'], ['charge', 'near', 'slam', 'charge', 'near']],
      bite: { wind: [0.75, 0.55], lunge: 0.3, dmg: 1.1, rec: [0.7, 0.5], times: [1, 1] },
      charge: { wind: [1.1, 0.8], speed: [6, 8], dmg: 1.4, stun: [1.8, 1.3], stunTaken: 1.5, spin: true },   // spin：缩壳打滚（画法：藏起头和四肢，整只滚着转）
      slam: { wind: [1.0, 0.75], air: [0.45, 0.4], h: 0.35, dmg: 1.4, wave: 5, waveLen: 4, waveDmg: 0.9, rec: [1.0, 0.7], times: [1, 2], noFlip: true },   // 抬身重踏：不翻跟头
      shell: { hits: 5, win: 2.5, t: 1.6, dr: 0.8, cd: 5 },   // 2.5 秒内挨 5 下 → 缩壳 1.6 秒，受伤 −80%，之后 5 秒内不再缩
      rage: 0.5, roar: 1.3,
      sfx: { wake: 'boss_growl', rage: 'boss_growl', rageRate: 0.75, shell: 'snail_shell' },   // 不用红甲虫王的“巨型昆虫尖叫”（龟不是昆虫）
    },
  };
  B.bossOf = k => B.BOSSES[k] || B.BOSS;
  B.HOP = { t: 0.5, h: 0.8 };    // 主角小跳（摇杆 / 方向键往上，头顶没有怪时）：0.5 秒，跳过冲撞和冲击波
  // bfix（用户「血量根本没有什么用」根因：怪在出手前就被打死）：普通怪血量从浅处 ×1 渐变到 20 米以下 ×1.6，让深处一场战斗长到怪能出手 1–2 次；浅处新手照旧几下打死
  B.monHpK = r => 1 + 0.6 * Math.min(1, dep(r) / 20);
  B.monHp = (k, r) => B.SC * (B.MON[k].boss ? B.MON[k].hp : B.MON[k].hp * B.monHpK(r) * Math.pow(1.045, dep(r)));
  // v0.20（用户 23:00「血量根本没有什么用」）：怪物攻击随深度涨得和血量一样快（1.03 → 1.04），基础攻击 +30% 左右；
  // 打怪收益随深度涨：宝石 = 基础 × 1.04^米（四舍五入，至少 1），金币 = 同深度土 ×4（原 ×1.5）
  B.monAtk = (k, r) => B.SC * (B.MON[k].boss ? B.MON[k].atk : B.MON[k].atk * Math.pow(1.045, dep(r)));   // bfix 1.04 → 1.045：20 米以下的怪要能把不升血量 / 防御的人打倒
  B.monGem = (k, r) => B.MON[k].boss ? B.MON[k].gem : Math.max(1, Math.round(B.MON[k].gem * Math.pow(1.04, dep(r))));
  B.monCoin = (k, r) => B.MON[k].coin || B.dirtCoin(r) * 4;
  B.hurt = (matk, def) => Math.max(1, Math.round(Math.max(matk * 0.15, matk - def)));

  /* ---------- 材料 ---------- */
  B.MAT = {
    wood: { name: '树根木', img: 'mat/wood.png', src: '', srcT: '{wood} 米的树根方块' },
    silk: { name: '蛛丝', img: 'mat/spider_web.png', src: '', srcT: '{silk} 米洞穴角上的蜘蛛网' },
    copper: { name: '铜矿石', img: 'mat/copper.png', src: '', srcT: '{copper} 米的铜矿方块' },
    gel: { name: '史莱姆黏液', img: 'mat/cactus_pulp.png', src: '绿史莱姆 50% 掉落（连续 3 只没掉必掉）', mon: 'Slime_Green' },
    pearl: { name: '蜗牛涎', img: 'mat/tree_sap.png', src: '', srcT: '绿蜗牛（{Snail_Green} 米起）35% 掉落（连续 4 只没掉必掉）', mon: 'Snail_Green' },
    amber: { name: '虫珀', img: 'mat/amberstone.png', src: '', srcT: '{Beetle_Red} 米守卫“红甲虫王”首次击败必掉', mon: 'Beetle_Red', boss: 1 },
    // v0.21 区域 2 沙岩层（area = 所在区域，0 起）
    iron: { name: '铁矿石', img: 'mat/ironstone.png', src: '', srcT: '{iron} 米的铁矿方块', area: 1 },
    malachite: { name: '孔雀石', img: 'mat/malachite.png', src: '', srcT: '{malachite} 米的孔雀石方块', area: 1 },
    salt: { name: '岩盐', img: 'mat/halite.png', src: '', srcT: '{salt} 米洞穴里的盐结晶', area: 1 },   // 常识：干旱地区的砂岩洞里，渗水蒸发后会在洞壁、洞底结出盐晶
    lzskin: { name: '角蜥皮', img: 'mat/leather.png', src: '', srcT: '角蜥（{Lizard_Horn} 米起）45% 掉落（连续 3 只没掉必掉）', mon: 'Lizard_Horn', area: 1 },
    venom: { name: '响尾蛇毒液', img: 'mat/tree_sap_gold.png', src: '', srcT: '响尾蛇（{Snake_Bell} 米起）35% 掉落（连续 4 只没掉必掉）', mon: 'Snake_Bell', area: 1 },   // 常识：响尾蛇毒液是淡黄色的
    fortstone: { name: '石堡碎块', img: 'mat/granite_piece.png', src: '', srcT: '{Turtle_Tower} 米守卫“堡垒龟”首次击败必掉', mon: 'Turtle_Tower', boss: 1, area: 1 },   // 堡垒龟背上石堡打碎掉下的灰色石块（图标 granite_piece = 灰石块 + 碎渣）；原“龟纹石”图标是圆斑、不是龟甲网纹，改成和图标、守卫外形一致
  };
  B.MAT_ORDER = ['wood', 'silk', 'copper', 'gel', 'pearl', 'amber', 'iron', 'malachite', 'salt', 'lzskin', 'venom', 'fortstone'];
  /* 深度文字（v0.18 修：原来手写“蜗牛 15 米起 / 蝙蝠 8 米起 / 50 米守卫”，和地形对不上）：不手写数字，
   * 由 game.js 生成区域地形后调 B.fillDepths(info) 填进去 —— 怪物 B.MON[k].from = 最浅出现的那一行（= 米数，见 depthM），
   * 材料 src 里的 {wood} {silk} {copper} = 地形里实际出现的 “最浅–最深” 米数，{怪名} = 那种怪的最浅米数。 */
  B.fillDepths = info => {
    for (const k in B.MON) if (info.mon[k] !== undefined) B.MON[k].from = dep(info.mon[k]);
    const tx = { ...Object.fromEntries(Object.entries(info.mat).map(([k, [lo, hi]]) => [k, lo === hi ? '' + dep(lo) : dep(lo) + '–' + dep(hi)])), ...Object.fromEntries(Object.keys(info.mon).map(k => [k, dep(info.mon[k])])) };
    for (const k in B.MAT) { const M = B.MAT[k]; if (M.srcT) M.src = M.srcT.replace(/\{(\w+)\}/g, (_, n) => tx[n] !== undefined ? tx[n] : '?'); }
  };

  /* ---------- 装备：部位 → 档位列表（0 档自带） ---------- */
  B.SLOTS = ['weapon', 'shield', 'helmet', 'armor'];
  B.SLOT = {
    weapon: { name: '武器', stat: 'atk', part: 'Sword' },
    shield: { name: '盾牌', stat: 'def', part: 'Shield' },
    helmet: { name: '头盔', stat: 'hp', part: 'Helmet' },
    armor: { name: '衣服', stat: 'stam', part: 'Chest' },
  };
  // v0.20：盾 4/7/12 → 5/10/18（深处怪攻击 40–60，防御是减法，原数值买了只少掉 10–20%）
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
      { name: '木盾', v: 5, coin: 70, mat: { wood: 5 }, spr: 'FA_WP_Sub_Shield_005_WoodGray' },
      { name: '铜盾', v: 10, coin: 380, mat: { copper: 6, wood: 4 }, spr: 'FA_WP_Sub_Shield_005_Gold' },
      { name: '琥珀盾', v: 18, coin: 1500, mat: { copper: 10, gel: 4, amber: 1 }, spr: 'FA_WP_Sub_Shield_010_Gold' },
      { name: '蓝钢盾', v: 32, next: true, spr: 'FA_WP_Sub_Shield_008_BlueGold' },
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
      { name: '根编衣', v: 17, coin: 90, mat: { wood: 5 }, spr: 'FA_Chest_010_Brown' },
      { name: '蛛丝衣', v: 20, coin: 450, mat: { silk: 4, gel: 3 }, spr: 'FA_Chest_013_White' },
      { name: '琥珀甲', v: 25, coin: 1800, mat: { copper: 8, pearl: 2, amber: 1 }, spr: 'FA_Chest_016_Gold' },
      { name: '翠银斗篷', v: 50, next: true, spr: 'FA_Chest_015_GreenSilver' },
    ],
  };

  /* ---------- 技能树（网状；x,y 是格位，0,0 为中心） ---------- */
  // eff：派生属性用；mech：机制节点；cur：币种；c0：第 1 级价格；k：每级乘数；mat：机制节点还要的材料；boss：要打过守卫
  // req：[[前置节点, N], ...]——用户 17:49：前置点了 ≥ 1 级（节点露出来）就能买；N 只给 tools/skcheck.js 核对价格顺序（子节点单价 ≥ 前置单价 × N，约等于“买完前置 N 级才买得起”），游戏里不用、不显示
  // 用户 17:56–18:00（照《龟龟潜海记》）：同一节点每级同价；同一属性拆成“多级小加成 → 单级大跳 → 再多级（单级加成 ≥ 前面的大跳）…”交替，百分比加算
  // add：[属性, 每级加多少]（derive 按属性把所有节点加起来）
  const per = (t, v, u) => () => `${t} +${u ? v : Math.round(v * 100) + '%'} / 级`, one = (t, v) => () => `${t} +${Math.round(v * 100)}%`;
  B.SK = [
    { id: 'root', name: '矿工之心', ic: 'Item_Compass_01_Gold', x: 0, y: 0, max: 1, c0: 0, cur: 'coin', br: 'root', desc: () => '一切从这里开始' },
    // 挖掘
    { id: 'dig', name: '锋利镐尖', ic: 'Gear_Weapons_Pickaxe_01', x: 0, y: -1, max: 5, c0: 12, cur: 'coin', br: 'dig', add: ['dig', 0.10], req: [['root', 0]], desc: per('挖掘力', 0.10) },
    { id: 'dig2', name: '精钢镐尖', ic: 'Material_Ore_03_Silver', x: 0, y: -2, max: 1, c0: 150, cur: 'coin', br: 'dig', add: ['dig', 1.0], req: [['dig', 5]], desc: one('挖掘力', 1.0) },
    { id: 'dig3', name: '镐尖打磨', ic: 'Item_Anvil_01_Light', x: -1, y: -3, max: 2, c0: 450, cur: 'coin', br: 'dig', add: ['dig', 1.0], req: [['dig2', 1]], desc: per('挖掘力', 1.0) },
    { id: 'freq', name: '挥镐速度', ic: 'Economy_Energy_01_Yellow', x: -1, y: -2, max: 6, c0: 60, cur: 'coin', br: 'dig', add: ['freq', 0.25], req: [['dig', 1]], desc: per('每秒挥击', '0.25 次', 1) },
    { id: 'heavy', name: '重击', ic: 'Gear_Weapons_Hammer_01', x: 1, y: -2, max: 1, c0: 60, cur: 'coin', br: 'dig', mech: 1, req: [['dig', 3]], desc: () => `每第 ${B.P.heavyN} 下挖掘伤害 ×3` },
    { id: 'heavy2', name: '重击强化', ic: 'Gear_Weapons_Hammer_02', x: 2, y: -3, max: 3, c0: 500, cur: 'coin', br: 'dig', add: ['heavy', 1], req: [['heavy', 1]], desc: () => '重击倍率 +1 / 级' },
    { id: 'pierce', name: '穿透', ic: 'Gear_Weapons_Shovel_01', x: -2, y: -3, max: 1, c0: 500, cur: 'coin', br: 'dig', mech: 1, req: [['freq', 2]], desc: () => '往下挖时，下面第 2 格同时受 50% 伤害' },
    { id: 'soil', name: '浅层专精', ic: 'Material_Ore_01', x: 0, y: -3, max: 3, c0: 700, cur: 'coin', br: 'dig', add: ['soil', 1.0], req: [['dig2', 1]], desc: per('浅层岩土方块伤害（玄武岩除外）', 1.0) },
    { id: 'soilx', name: '浅层制霸', ic: 'Misc_Earth_01', x: 0, y: -4, max: 1, c0: 6000, gem: 50, cur: 'coin', br: 'dig', mech: 1, req: [['soil', 3]], boss: 1, desc: () => '浅层岩土所有方块一下就碎（含玄武岩）' },
    // v0.18 挖掘机制线第一段（用户路线图 15.1/15.2 定的区域 1 参数；强度全在 B.MECH，以后的区域往 B.MECH 里加形态）
    { id: 'boom', name: '回旋镐', ic: 'DH_Skill_Boomerang_Pickaxe', x: -3, y: -2, max: 1, c0: 260, mat: { copper: 4, wood: 3 }, cur: 'coin', br: 'dig', mech: 1, req: [['freq', 2]], desc: () => `每 ${B.MECH.boom.cd} 秒扔出镐直线飞 ${B.MECH.boom.range} 格再飞回，沿途最多打 ${B.MECH.boom.pierce + 1} 格，去回各打 1 下（挖掘力 ${Math.round(B.MECH.boom.dmg * 100)}%）` },
    { id: 'boomcd', name: '回旋镐·快手', ic: 'Item_Clock_01_Silver', x: -3, y: -3, max: 2, c0: 150, cur: 'coin', br: 'dig', req: [['boom', 0]], desc: () => `回旋镐冷却 −${B.MECH.boom.cdStep} 秒 / 级` },   // 0：价格由用户直接定（父节点还要材料），不参与价格顺序核对
    { id: 'giant', name: '巨镐', ic: 'DH_Skill_Giant_Pickaxe', x: 1, y: -3, max: 1, c0: 420, mat: { copper: 6, gel: 2 }, cur: 'coin', br: 'dig', mech: 1, req: [['heavy', 1]], desc: () => `每下多打左右各 1 格（${Math.round(B.MECH.giant.sideK * 100)}% 伤害）` },
    { id: 'giantw', name: '巨镐·加宽', ic: 'DH_Skill_Giant_Wide', x: 2, y: -4, max: 1, c0: 500, cur: 'coin', br: 'dig', req: [['giant', 1]], desc: () => `巨镐旁边两格伤害 ${Math.round(B.MECH.giant.sideK * 100)}% → ${Math.round((B.MECH.giant.sideK + B.MECH.giant.sideStep) * 100)}%` },
    // 生存
    { id: 'time', name: '耐饿', ic: 'Consumable_Food_Meat_01', x: -1, y: 0, max: 6, c0: 10, cur: 'coin', br: 'live', add: ['stam', 0.05], req: [['root', 0]], desc: per('体力上限', 0.05) },
    { id: 'time2', name: '大胃王', ic: 'Consumable_Food_Stew_01', x: -2, y: 0, max: 1, c0: 120, cur: 'coin', br: 'live', add: ['stam', 0.6], req: [['time', 6]], desc: one('体力上限', 0.6) },
    { id: 'time3', name: '储粮', ic: 'Consumable_Food_Bread_01', x: -3, y: 1, max: 2, c0: 300, cur: 'coin', br: 'live', add: ['stam', 0.6], req: [['time2', 1]], desc: per('体力上限', 0.6) },
    { id: 'full', name: '吃饱有力', ic: 'Consumable_Food_Steak_01', x: -2, y: -1, max: 1, c0: 50, cur: 'coin', br: 'live', mech: 1, req: [['time', 2]], desc: () => '体力高于 50% 时挖掘力 +30%' },
    { id: 'kill', name: '打怪回气', ic: 'Consumable_Food_Skewer_01', x: -3, y: 0, max: 1, c0: 120, cur: 'coin', br: 'live', mech: 1, req: [['time2', 1]], desc: () => `打死怪回复体力：当前深度 ${B.KILL_SEC} 秒的消耗` },
    { id: 'aid', name: '急救包', ic: 'Consumable_Healing_Bandage_01', x: -2, y: 1, max: 2, c0: 200, cur: 'coin', br: 'live', req: [['time', 3]], desc: () => '血量归零时多保住 15% 收获 / 级' },
    { id: 'lamp', name: '光源', ic: 'Item_Bulb_01_On', x: -1, y: 1, max: 1, c0: 40, mat: { silk: 2 }, cur: 'coin', br: 'live', mech: 1, req: [['time', 1]], desc: () => `头灯照亮半径 +${B.MECH.lamp.add} 格，照出暗洞里的暗格宝箱` },
    { id: 'lampr', name: '光源亮度', ic: 'Item_Candle_01', x: -2, y: 2, max: 1, c0: 90, cur: 'coin', br: 'live', req: [['lamp', 1]], desc: () => `头灯照亮半径再 +${B.MECH.lamp.step} 格` },
    // 战斗（宝石买）
    { id: 'atk', name: '臂力', ic: 'Misc_Fist_01_Brown', x: 1, y: 0, max: 4, c0: 4, cur: 'gem', br: 'war', add: ['atk', 0.10], req: [['root', 0]], desc: per('攻击', 0.10) },
    { id: 'atk2', name: '蛮力', ic: 'Misc_Fist_01_Gold', x: 2, y: 0, max: 1, c0: 40, cur: 'gem', br: 'war', add: ['atk', 0.8], req: [['atk', 4]], desc: one('攻击', 0.8) },
    { id: 'atk3', name: '千锤百炼', ic: 'Gear_Weapons_Sword_02', x: 3, y: 1, max: 2, c0: 80, cur: 'gem', br: 'war', add: ['atk', 0.8], req: [['atk2', 1]], desc: per('攻击', 0.8) },
    { id: 'def', name: '铁壁', ic: 'Gear_Shield_01', x: 2, y: -1, max: 4, c0: 5, cur: 'gem', br: 'war', add: ['def', 0.10], req: [['atk', 1]], desc: per('防御', 0.10) },
    { id: 'def2', name: '金刚', ic: 'Gear_Shield_03_Gold', x: 3, y: -2, max: 1, c0: 50, cur: 'gem', br: 'war', add: ['def', 0.8], req: [['def', 4]], desc: one('防御', 0.8) },
    { id: 'hp', name: '强壮', ic: 'Economy_Heart_Red', x: 2, y: 1, max: 4, c0: 5, cur: 'gem', br: 'war', add: ['hp', 0.10], req: [['atk', 1]], desc: per('血量', 0.10) },
    { id: 'hp2', name: '体魄', ic: 'Economy_Heart_03_Red', x: 3, y: 2, max: 1, c0: 50, cur: 'gem', br: 'war', add: ['hp', 0.8], req: [['hp', 4]], desc: one('血量', 0.8) },
    { id: 'counter', name: '反击', ic: 'Misc_Fist_02_Yellow', x: 3, y: -1, max: 1, c0: 15, cur: 'gem', br: 'war', mech: 1, req: [['def', 1]], desc: () => '被打时立刻还手一下，伤害 ×2' },
    { id: 'crit', name: '暴击', ic: 'Misc_Crosshair_01_Red', x: 3, y: 0, max: 1, c0: 45, cur: 'gem', br: 'war', mech: 1, req: [['atk2', 1]], desc: () => '攻击有 15% 概率造成 2.5 倍伤害' },
    // 经济
    { id: 'coin', name: '招财', ic: 'Economy_Coin_04_Gold', x: 0, y: 1, max: 4, c0: 6, cur: 'gem', br: 'eco', add: ['coin', 0.10], req: [['root', 0]], desc: per('金币获取', 0.10) },
    { id: 'coin2', name: '聚宝', ic: 'Economy_Goldbar_01', x: 0, y: 2, max: 1, c0: 60, cur: 'gem', br: 'eco', add: ['coin', 0.8], req: [['coin', 4]], desc: one('金币获取', 0.8) },
    { id: 'coin3', name: '财源滚滚', ic: 'Item_PiggyBank', x: -1, y: 3, max: 2, c0: 150, cur: 'gem', br: 'eco', add: ['coin', 0.8], req: [['coin2', 1]], desc: per('金币获取', 0.8) },
    { id: 'gem', name: '宝石嗅觉', ic: 'Economy_Gem_01_Purple', x: 1, y: 2, max: 6, c0: 15, cur: 'coin', br: 'eco', add: ['gem', 0.08], req: [['coin', 1]], desc: per('宝石获取', 0.08) },
    { id: 'gem2', name: '慧眼', ic: 'Economy_Gem_04_Purple', x: 2, y: 2, max: 1, c0: 200, cur: 'coin', br: 'eco', add: ['gem', 1.0], req: [['gem', 6]], desc: one('宝石获取', 1.0) },
    { id: 'ore', name: '矿石专家', ic: 'Material_Ore_02_01', x: -1, y: 2, max: 2, c0: 300, cur: 'coin', br: 'eco', req: [['coin', 2]], desc: () => '每块树根 / 铜矿、每张蜘蛛网多掉 1 个材料 / 级' },
    { id: 'slime', name: '史莱姆猎人', ic: 'Item_Jelly_01', x: 1, y: 3, max: 2, c0: 20, cur: 'gem', br: 'eco', req: [['gem', 1]], desc: () => '史莱姆黏液掉率 +25% / 级' },
    { id: 'chest', name: '幸运宝箱', ic: 'Item_Chest_01_Wood', x: 2, y: 3, max: 1, c0: 80, cur: 'coin', br: 'eco', mech: 1, req: [['gem', 1]], desc: () => `每趟地下出现 1 个宝箱（18–36 米的洞里），金币 = 同深度 ${B.CHEST_K} 块土` },
    // 条件分支（用户 18:19）：cond = 出现条件（B.COND 里的键），不满足时整支不显示、不能买；没有 req 的 cond 节点 = 这支的独立起点（不连主网）
    // 法杖分支：拿到 VIP 法杖后出现。射程 2 → 最多 4 格；“多级小加成 → 单级大跳”交替
    { id: 'srange', name: '法杖射程', ic: 'Item_Telescope', x: 1, y: 5, max: 2, c0: 15, cur: 'gem', br: 'magic', cond: 'staff', add: ['srange', 1], desc: () => '法杖射程 +1 格 / 级' },
    { id: 'spierce', name: '魔力弹穿透', ic: 'Gear_Bow_01', x: 2, y: 6, max: 1, c0: 60, cur: 'gem', br: 'magic', cond: 'staff', mech: 1, req: [['srange', 2]], desc: () => `魔力弹打穿第 1 只怪，继续飞向射程内的下一只（${Math.round(B.STAFF.pierceK * 100)}% 伤害）` },
    { id: 'ssplit', name: '分裂弹', ic: 'Item_MagicOrb', x: 3, y: 5, max: 1, c0: 150, cur: 'gem', br: 'magic', cond: 'staff', mech: 1, req: [['spierce', 1]], desc: () => `魔力弹命中后分出 2 颗小弹，打 ${B.STAFF.splitR} 格内别的怪（${Math.round(B.STAFF.splitK * 100)}% 伤害）` },
    { id: 'spow', name: '魔力强化', ic: 'Economy_Elixir_01_Blue', x: 0, y: 6, max: 3, c0: 80, cur: 'gem', br: 'magic', cond: 'staff', add: ['sdmg', 0.2], req: [['srange', 1]], desc: per('法杖伤害', 0.2) },
    { id: 'sinfuse', name: '魔力灌注', ic: 'Item_CrystalBall_01', x: -1, y: 5, max: 1, c0: 250, cur: 'gem', br: 'magic', cond: 'staff', add: ['sdmg', 1.5], req: [['spow', 3]], desc: one('法杖伤害', 1.5) },
    // v0.18 宠物分支（用户 18:59：按类别做，不是每只一支）：拥有该类任意一只宠物就长出这一类的独立分支（不连主网）；
    // 通用节点作用在当前带着的同类宠物上；每只宠物另有 1 个专属大跳（单级，cond = 拥有这只宠物）。以后新宠物在 B.PETS 标 cat 就自动吃到本类分支
    // 攻击类（炸弹崽、南瓜灯；宝石）——摆在技能树右上方
    { id: 'pa1', name: '宠物火力', ic: 'Stat_Attack_01', x: 2, y: -6, max: 5, c0: 10, cur: 'gem', br: 'patk', cond: 'petcat:atk', add: ['pa_dmg', 0.2], desc: () => '攻击类宠物伤害 +20% / 级' },
    { id: 'pa2', name: '宠物猛攻', ic: 'Stat_Attack_02', x: 3, y: -7, max: 1, c0: 50, cur: 'gem', br: 'patk', cond: 'petcat:atk', add: ['pa_dmg', 1.0], req: [['pa1', 5]], desc: () => '攻击类宠物伤害 +100%' },
    { id: 'pa4', name: '烈焰之心', ic: 'Misc_Fire_01_Red', x: 3, y: -8, max: 2, c0: 100, cur: 'gem', br: 'patk', cond: 'petcat:atk', add: ['pa_dmg', 1.0], req: [['pa2', 1]], desc: () => '攻击类宠物伤害 +100% / 级' },
    { id: 'pa3', name: '宠物快攻', ic: 'Stat_AttackSpeed_01', x: 1, y: -7, max: 4, c0: 15, cur: 'gem', br: 'patk', cond: 'petcat:atk', add: ['pa_cd', 0.05], req: [['pa1', 1]], desc: () => '攻击类宠物冷却 −5% / 级' },
    { id: 'pa5', name: '连续出击', ic: 'Item_Hourglass_02_Red', x: 1, y: -8, max: 1, c0: 60, cur: 'gem', br: 'patk', cond: 'petcat:atk', add: ['pa_cd', 0.3], req: [['pa3', 4]], desc: () => '攻击类宠物冷却 −30%' },
    { id: 'pa6', name: '范围扩大', ic: 'Misc_Crosshair_01_Yellow', x: 2, y: -8, max: 1, c0: 120, cur: 'gem', br: 'patk', cond: 'petcat:atk', mech: 1, add: ['pa_rng', 1], req: [['pa2', 1]], desc: () => '攻击类宠物范围 +1 格（炸弹：炸十字 5 格；火光：烧 2 格内的怪）' },
    { id: 'xbomb', name: '连环炸', ic: 'Consumable_Explosives_Bomb_03_Red', x: 1, y: -9, max: 1, c0: 300, cur: 'gem', br: 'patk', cond: 'pet:Bomb', mech: 1, req: [['pa6', 1]], desc: () => '炸弹崽每次扔 2 颗炸弹（第 2 颗炸另一个目标）' },
    { id: 'xburn', name: '灼烧', ic: 'Neture_Fire_02_Red', x: 3, y: -9, max: 1, c0: 300, cur: 'gem', br: 'patk', cond: 'pet:Pumpkin', mech: 1, req: [['pa6', 1]], desc: () => `被南瓜灯烧到的怪 ${B.PET_BURN.t} 秒内每秒再受攻击 ×${B.PET_BURN.k}` },
    // 探索类（挖挖狗；以后磁铁、照明类宠物也归这里；金币）——摆在技能树左上方
    { id: 'pe1', name: '刨土力度', ic: 'Gear_Glove_01', x: -2, y: -6, max: 5, c0: 30, cur: 'coin', br: 'pexp', cond: 'petcat:explore', add: ['pe_dmg', 0.2], desc: () => '探索类宠物刨土伤害 +20% / 级' },
    { id: 'pe2', name: '用力刨', ic: 'Stat_Power_01', x: -1, y: -7, max: 1, c0: 150, cur: 'coin', br: 'pexp', cond: 'petcat:explore', add: ['pe_dmg', 1.0], req: [['pe1', 5]], desc: () => '探索类宠物刨土伤害 +100%' },
    { id: 'pe5', name: '利爪打磨', ic: 'Gear_Weapons_Saw_01', x: -1, y: -8, max: 2, c0: 450, cur: 'coin', br: 'pexp', cond: 'petcat:explore', add: ['pe_dmg', 1.0], req: [['pe2', 1]], desc: () => '探索类宠物刨土伤害 +100% / 级' },
    { id: 'pe3', name: '勤快', ic: 'Item_Hourglass_01_Wood', x: -3, y: -7, max: 4, c0: 40, cur: 'coin', br: 'pexp', cond: 'petcat:explore', add: ['pe_cd', 0.05], req: [['pe1', 1]], desc: () => '探索类宠物冷却 −5% / 级' },
    { id: 'pe4', name: '收集范围', ic: 'Item_Magnet_01', x: -3, y: -8, max: 1, c0: 200, cur: 'coin', br: 'pexp', cond: 'petcat:explore', mech: 1, add: ['pe_rng', 1], req: [['pe3', 4]], desc: () => '探索类宠物收集范围 +1 格（自动收身边 2 格内的蜘蛛网）' },
    { id: 'xpaw', name: '双爪', ic: 'DH_Skill_Double_Paw', x: -2, y: -9, max: 1, c0: 1000, cur: 'coin', br: 'pexp', cond: 'pet:Pug', mech: 1, req: [['pe4', 1]], desc: () => '挖挖狗每次刨 2 格' },
    // 回复类（花花、泡泡鱼；金币）——摆在法杖分支下面
    { id: 'ph1', name: '回复量', ic: 'Consumable_Potion_01_Green', x: 0, y: 8, max: 5, c0: 120, cur: 'coin', br: 'pheal', cond: 'petcat:heal', add: ['ph_amt', 0.01], desc: () => '回复类宠物每次多回 1% 上限 / 级（花花回血量、泡泡鱼回体力）' },
    { id: 'ph2', name: '大补', ic: 'Consumable_Potion_02_Green', x: 1, y: 9, max: 1, c0: 600, cur: 'coin', br: 'pheal', cond: 'petcat:heal', add: ['ph_amt', 0.05], req: [['ph1', 5]], desc: () => '回复类宠物每次多回 5% 上限' },
    { id: 'ph5', name: '生命之泉', ic: 'Economy_Elixir_01_Green', x: 2, y: 9, max: 2, c0: 1500, cur: 'coin', br: 'pheal', cond: 'petcat:heal', add: ['ph_amt', 0.05], req: [['ph2', 1]], desc: () => '回复类宠物每次多回 5% 上限 / 级' },
    { id: 'ph3', name: '回复加速', ic: 'Item_Hourglass_02_Green', x: -1, y: 9, max: 4, c0: 150, cur: 'coin', br: 'pheal', cond: 'petcat:heal', add: ['ph_cd', 0.05], req: [['ph1', 1]], desc: () => '回复类宠物冷却 −5% / 级' },
    { id: 'ph4', name: '救急', ic: 'Stat_HP_Regen_01', x: -2, y: 9, max: 1, c0: 800, cur: 'coin', br: 'pheal', cond: 'petcat:heal', mech: 1, req: [['ph3', 4]], desc: () => `血量（花花）/ 体力（泡泡鱼）低于 ${Math.round(B.PET_RESCUE * 100)}% 时不等冷却立刻放一次、回双倍（每趟 1 次）` },
    { id: 'xshield', name: '花盾', ic: 'Gear_Shield_02', x: -3, y: 10, max: 1, c0: 2000, cur: 'coin', br: 'pheal', cond: 'pet:Flower', mech: 1, req: [['ph4', 1]], desc: () => '花花每次回血后，下一次受到的伤害 −50%' },
    { id: 'xfloat', name: '浮力', ic: 'Misc_Baloon_01', x: -1, y: 10, max: 1, c0: 2000, cur: 'coin', br: 'pheal', cond: 'pet:Goldfish', mech: 1, req: [['ph4', 1]], desc: () => `泡泡鱼吐泡泡后 ${B.PET_FLOAT} 秒内不掉体力` },
  ];
  // 出现条件：键 → (存档) => 是否满足。以后装备 / 宠物 / 机制要长新分支，在这里加一个键，节点写 cond: '键'
  B.COND = {
    staff: S => (S.vip || 0) >= B.vipLv('staff'),   // 领到 VIP 法杖（收起来也算拥有）
  };
  // 宠物分支条件（用户 18:59）：'petcat:类别' = 拥有该类任意一只；'pet:名字' = 拥有这只（宠物表在下面定义，这里调用时才读）
  for (const c of ['atk', 'heal', 'explore']) B.COND['petcat:' + c] = S => (S.pets || []).some(k => B.PETS[k] && B.PETS[k].cat === c);
  for (const k of ['Pug', 'Bomb', 'Pumpkin', 'Flower', 'Goldfish']) B.COND['pet:' + k] = S => (S.pets || []).includes(k);
  B.condOk = (S, n) => !n.cond || !!(B.COND[n.cond] && B.COND[n.cond](S));
  /* ---------- 挖掘机制的强度参数（区域 1 = 第一形态；后面区域加 n / pierce / rows / 进化形态，代码按这些字段读） ---------- */
  B.MECH = {
    // 回旋镐：n 把镐（扇形）、cd 冷却秒、range 飞几格、dmg 挖掘力倍数（打怪用攻击 × dmg）、pierce 穿过几个实心格（0 = 打到第一个就折返）
    // hits 每个目标打几下（去 1 回 1）、basalt 能不能伤玄武岩、speed 飞行格/秒、linger 打中后原地转几秒再回、spin 每秒转几圈、cdStep 快手每级减的秒数
    boom: { n: 1, cd: 5, cdStep: 1, range: 3, dmg: 1.0, pierce: 2, hits: 2, basalt: false, speed: 11, linger: 0.18, spin: 3.2 },
    // 巨镐：side 左右各几格、sideK 旁边格伤害倍数、sideStep 加宽每级加多少、rows 往挥击方向打几排（3×3 进化时 = 3）、pick 镐图放大倍数
    giant: { side: 1, sideK: 0.5, sideStep: 0.25, rows: 1, pick: 1.45 },
    // 光源：add 机制节点加的照亮半径（格）、step 亮度节点每级加的格数、dark 每趟暗格宝箱个数 [最少, 最多]、gem 宝石、matN 最缺材料个数、xray 透视（进化，区域 1 没有）
    lamp: { base: 250 / 80, add: 2, step: 1, dark: [1, 2], gem: 5, matN: 2, xray: false },
  };
  B.SKI = {}; B.SK.forEach(n => { B.SKI[n.id] = n; });
  B.BR_COL = { patk: '#ff6a3c', pexp: '#c8a060', pheal: '#5ad88a', magic: '#5ab4ff', root: '#ffd84a', dig: '#ff9a3c', live: '#7ee05a', war: '#ff5a5a', eco: '#ffd84a' };
  B.skCost = (n) => n.c0;   // 用户 17:56：同一节点每级同价
  B.skOpen = (S, n) => B.condOk(S, n) && (n.req || []).every(([id]) => (S.skill[id] || 0) >= 1) && (!n.boss || (S.boss || 0) >= 1);   // 用户 17:49：不再要求前置到 N 级
  B.skSeen = (S, n) => B.condOk(S, n) && (n.id === 'root' || (n.cond && !(n.req || []).length) || (n.req || []).some(([id]) => (S.skill[id] || 0) >= 1));

  /* ---------- 宠物、VIP、签到 ---------- */
  // v0.18 宠物机制（用户 18:24：每只宠物一个专注的主动机制，按冷却触发、有动作 + 特效 + 音效；不加收益倍率）
  // 数值都按主角当前属性的比例算（区域 1 取偏弱的值）；以后更强的宠物同方向放大 k / 缩短 cd
  // kind：dig 刨土 / bomb 爆破 / fire 火光 / heal 治疗 / stam 体力；cd 冷却秒；anim 宠物 Spine 动作
  const PET = {
    Pug: { name: '挖挖狗', cat: 'explore', kind: 'dig', cd: 4, k: 5, web: 1, anim: 'Attack' },             // 刨开身边 1 格：伤害 = 挖掘力 ×3；身边 1 格内蜘蛛网自动收
    Bomb: { name: '炸弹崽', cat: 'atk', kind: 'bomb', cd: 5, blk: 4, mon: 2, anim: 'Attack' },        // 往面前 1 格扔炸弹：方块受 挖掘力 ×4，怪受 攻击 ×2
    Pumpkin: { name: '南瓜灯', cat: 'atk', kind: 'fire', fly: 1, cd: 10, mon: 1.5, light: 1.5, anim: 'Busking' }, // 照亮 +50%；身边一圈火光：1 格内（含斜角）每只怪受 攻击 ×1.5
    Flower: { name: '花花', cat: 'heal', kind: 'heal', cd: 8, heal: 0.05, anim: 'Busking' },            // 回 5% 血量（满血时等着，掉血后马上放）
    Goldfish: { name: '泡泡鱼', cat: 'heal', kind: 'stam', fly: 1, cd: 10, stam: 0.05, anim: 'Busking' },        // 吐泡泡回 5% 体力
  };
  B.STAM_SEC = 60;   // v0.20 泡泡鱼：回 stam × 60 秒 = 所在深度掉体力的秒数（5% → 3 秒），和体力上限脱钩，不随上限溢出
  const pc = x => Math.round(x * 100) + '%';
  // v0.19 说明由参数拼（用户 22:40 定：宠物页显示加上分支后的实际数值）；VIP 卡显示基础值
  const nf = x => String(Math.round(x * 10) / 10);
  B.petDesc = P => {
    const cd = nf(P.cd), two = P.n > 1 ? '，每次 2 下' : '';
    if (P.kind === 'dig') return `每 ${cd} 秒刨开身边 1 格（挖掘力 ×${nf(P.k)}${two}），自动收身边 ${P.webR || 1} 格内的蜘蛛网`;
    if (P.kind === 'bomb') return `每 ${cd} 秒炸开面前 1 格（方块：挖掘力 ×${nf(P.blk)}，怪：攻击 ×${nf(P.mon)}${two}）`;
    if (P.kind === 'fire') return `照亮范围 +${pc(P.light - 1)}；每 ${cd} 秒火光烧身边的怪（攻击 ×${nf(P.mon)}）`;
    if (P.kind === 'heal') return `每 ${cd} 秒回 ${pc(P.heal)} 血量`;
    return `每 ${cd} 秒吐泡泡，回 ${nf(P.stam * B.STAM_SEC)} 秒的体力消耗`;
  };
  for (const k in PET) PET[k].desc = B.petDesc(PET[k]);
  B.PETS = PET;
  B.PET_BOMB_FLY = 0.42;   // 炸弹飞行秒数
  // cat：宠物类别（atk 攻击 / heal 回复 / explore 探索），决定吃哪一支宠物分支
  B.PET_BURN = { t: 3, k: 0.3 };   // 南瓜灯专属「灼烧」：3 秒内每秒受 攻击 ×0.3
  B.PET_RESCUE = 0.3;              // 回复类「救急」：低于 30% 时立刻放一次、回双倍，每趟 1 次
  B.PET_FLOAT = 3;                 // 泡泡鱼专属「浮力」：吐泡泡后 3 秒不掉体力
  // 当前带着的宠物 + 本类分支加成 → 实际参数（derive 里调用；k/blk/mon 伤害倍数、cd 冷却、heal/stam 回复比例、rng 范围、n 一次几下）
  B.petStats = (S, A, L) => {
    const base = S.pet && PET[S.pet]; if (!base) return null; const P = Object.assign({}, base, { rng: 0, n: 1 }), ok = id => L(id) && B.condOk(S, B.SKI[id]);
    if (P.cat === 'atk') { const m = 1 + A.pa_dmg; if (P.mon) P.mon *= m; if (P.blk) P.blk *= m; P.cd *= 1 - A.pa_cd; P.rng = A.pa_rng; if (S.pet === 'Bomb' && ok('xbomb')) P.n = 2; if (S.pet === 'Pumpkin' && ok('xburn')) P.burn = B.PET_BURN; }
    if (P.cat === 'heal') { if (P.heal) P.heal += A.ph_amt; if (P.stam) P.stam += A.ph_amt; P.cd *= 1 - A.ph_cd; P.rescue = !!ok('ph4'); if (S.pet === 'Flower' && ok('xshield')) P.shield = 0.5; if (S.pet === 'Goldfish' && ok('xfloat')) P.float = B.PET_FLOAT; }
    if (P.cat === 'explore') { if (P.k) P.k *= 1 + A.pe_dmg; P.cd *= 1 - A.pe_cd; P.webR = 1 + A.pe_rng; if (S.pet === 'Pug' && ok('xpaw')) P.n = 2; }
    return P;
  };
  B.OFFLINE_H = 8;   // 离线收获：有宠物就有，每小时 = 上一趟收入，最多 8 小时

  /* ---------- VIP（16 节）：独立计数，只算 VIP 页“看广告”看的；奖励都不影响数值平衡 ---------- */
  // 法杖：远程魔法弹；攻击 = 当前最高武器 × 1.1（动态算，跟着铁匠铺的武器涨）
  B.STAFF = { name: '星蓝法杖', spr: 'FA_WP_Main_Staff_003_WoodSkyblue', ball: 'FA_WP_Sub_MagicBall_001_Blue', k: 1.1, range: 2, maxRange: 4, speed: 11, pierceK: 0.7, splitK: 0.5, splitR: 2 };   // 用户 18:19：初始射程 2 格（能打隔 1 格的怪），技能树「法杖射程」加到最多 4 格
  // 整套外观：只改外形（头盔 + 衣服的图），属性照旧按身上的装备算
  B.SKIN = {
    ranger: { name: '游侠套装', Helmet: 'FA_Helmet_011_Green', Chest: 'FA_Chest_013_Green' },
    mage: { name: '法师套装', Helmet: 'FA_Helmet_013_Purple', Chest: 'FA_Chest_016_PurpleYellow' },
  };
  B.VIP = [
    { ads: 1, name: '宠物 挖挖狗', pet: 'Pug' },
    { ads: 3, name: '自动模式', text: '定一个方向，自动一直挖', auto: 1 },
    { ads: 6, name: '游侠套装', skin: 'ranger' },
    { ads: 10, name: '宠物 南瓜灯', pet: 'Pumpkin' },
    { ads: 15, name: '挂机循环', text: '自动模式开着时：3 秒后自动收下、再下矿', loop: 1 },
    { ads: 21, name: '星蓝法杖', text: '远程魔法弹：打 2 格内的怪，攻击 = 最高武器 ×1.1', staff: 1 },
    { ads: 28, name: '宠物 炸弹崽', pet: 'Bomb' },
    { ads: 36, name: '法师套装', skin: 'mage' },
    { ads: 45, name: '宠物 泡泡鱼', pet: 'Goldfish' },
  ];
  B.vipLv = key => B.VIP.findIndex(v => v[key]) + 1;   // 某个便利在第几级（自动模式 = 2）
  B.VIP_DAY = 0;   // VIP 广告每日上限，0 = 不限（等广告平台限频再定）
  B.SIGN = [
    { text: '200 金币', coin: 200 },
    { text: '史莱姆黏液 ×3', mat: { gel: 3 } },
    { text: '宠物 花花', pet: 'Flower' },
    { text: '10 宝石', gem: 10 },
    { text: '铜矿石 ×5', mat: { copper: 5 } },
    { text: '收益 ×2（5 趟）', boost: 5 },
    { text: '一件最高档装备', gear: 3 },
  ];
  // 广告位（16 节）：每个位置各自每天限次（本地日期跨天重置），用完当天入口就不出现；不设总上限
  B.ADCAP = { double: 5, revive: 3, chest: 2, offline: 1, supply: 2 };
  B.AD_CHEST_H = 4;   // 广告宝箱每 4 小时一个，= 当前 1 趟收入

  /* ---------- 由存档算出面板属性 ---------- */
  B.gearOf = (S, slot) => B.GEAR[slot][S.gear[slot] || 0];
  for (const sl in B.GEAR) for (const g of B.GEAR[sl]) g.v *= B.SC;   // 装备数值 ×B.SC（表里按原刻度写，读的时候都是整数化后的）
  B.derive = (S) => {
    const L = id => S.skill[id] || 0, v = s => B.gearOf(S, s).v;
    const staff = !!S.staff && (S.vip || 0) >= B.vipLv('staff');   // 法杖拿在手上：攻击 = 最高武器 × 1.1
    const wAtk = staff ? v('weapon') * B.STAFF.k : v('weapon');
    const A = { dig: 0, freq: 0, heavy: 0, soil: 0, stam: 0, atk: 0, def: 0, hp: 0, coin: 0, gem: 0, srange: 0, sdmg: 0, pa_dmg: 0, pa_cd: 0, pa_rng: 0, ph_amt: 0, ph_cd: 0, pe_dmg: 0, pe_cd: 0, pe_rng: 0 };   // 各属性的加算总和（多阶节点叠在同一属性上）
    for (const n of B.SK) if (n.add && L(n.id) && B.condOk(S, n)) A[n.add[0]] += n.add[1] * L(n.id);
    const pet = B.petStats(S, A, L);   // v0.18：宠物参数 = 基础 + 本类分支加成
    const m = { atk: 1 + A.atk, def: 1 + A.def, hp: 1 + A.hp, stam: 1 + A.stam };
    return {
      base: { atk: wAtk, def: v('shield'), hp: v('helmet'), stam: v('armor') }, mult: m,
      atk: wAtk * m.atk, staff, staffRange: Math.min(B.STAFF.maxRange, B.STAFF.range + A.srange), staffK: 1 + A.sdmg, staffPierce: L('spierce') ? 1 : 0, staffSplit: !!L('ssplit'), def: v('shield') * m.def, hp: Math.round(v('helmet') * m.hp), stam: v('armor') * m.stam,
      dig: B.P.baseDig * (1 + A.dig), digM: 1 + A.dig, freq: B.P.baseFreq + A.freq,
      heavy: L('heavy') ? 3 + A.heavy : 0, pierce: !!L('pierce'), soil: 1 + A.soil, soilx: !!L('soilx'),
      full: !!L('full'), kill: !!L('kill'), keep: [0.7, 0.85, 1][L('aid')], counter: !!L('counter'), crit: !!L('crit'),
      coinM: 1 + A.coin, gemM: 1 + A.gem,
      oreX: L('ore'), slimeP: [0.5, 0.75, 1][L('slime')], chest: !!L('chest'), pet,
      boom: L('boom') ? Object.assign({}, B.MECH.boom, { cd: B.MECH.boom.cd - B.MECH.boom.cdStep * L('boomcd') }) : null,
      giant: L('giant') ? Object.assign({}, B.MECH.giant, { sideK: B.MECH.giant.sideK + B.MECH.giant.sideStep * L('giantw') }) : null,
      lampR: B.MECH.lamp.base + (L('lamp') ? B.MECH.lamp.add + B.MECH.lamp.step * L('lampr') : 0), dark: !!L('lamp'),
    };
  };
  B.hits = (hp, dmg) => Math.max(1, Math.ceil(hp / dmg - 1e-9));
  B.fmt = n => { n = Math.floor(n); if (n < 10000) return '' + n; const u = ['万', '亿', '万亿']; let i = -1; while (n >= 10000 && i < 2) { n /= 10000; i++; } return (n >= 99.95 ? n.toFixed(0) : n >= 9.995 ? n.toFixed(1) : n.toFixed(2)) + u[i]; };
  g.BAL = B; if (typeof module !== 'undefined') module.exports = B;
})(typeof window !== 'undefined' ? window : globalThis);
