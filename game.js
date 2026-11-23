'use strict';
// M2：逻辑层与灰盒 1 相同，只加了 emit() 事件钩子给画面层/音效用。
const HOOKS=[]; function emit(type,d){ for(const h of HOOKS) h(type,d||{}); }
/* =====================================================================
   塔塔 · 灰盒原型 1 —— 只验证规则，不接美术
   所有内容数据在 DATA 里（以后拆成 pets.json / enemies.json / levels/1-3.json）。
   方向规则：逻辑只认 (lane, p)。lane 0..4；p 是沿 lane 的位置，0 = 家门口，9 = 怪物入口，
   第 col 格的中心是 p = col + 0.5。所有攻击范围都用 p 和 lane 偏移写。
   画面方向只存在于 Layout（横屏 / 竖屏两个实现）。
   ===================================================================== */

const LANES = 5, COLS = 9;
const EL = {
  fire:  {name:'火', color:'#f0703c'},
  water: {name:'水', color:'#3f9cf0'},
  grass: {name:'草', color:'#58c35a'},
  light: {name:'光', color:'#f0cf3c'},
  dark:  {name:'暗', color:'#9a6cf0'},
  none:  {name:'—', color:'#9aa0a6'},
};
// 克制：key 克 value
const BEATS = {fire:'grass', grass:'water', water:'fire', light:'dark', dark:'light'};

const DATA = {
  pets: {
    flower:  {cn:'聚能花', desc:'每 20 秒产出 25 能量。放在花丛格上产量 +20%。', rarity:'common', name:'Flower',  short:'花', el:'grass', shape:'producer', cost:50,  cd:5,  hp:300,  prod:25, prodInt:20,   /* 92 版：14 → 20（关卡设计.md「难度和重玩」；PvZ 向日葵每 24 秒 25） */ windup:0.17},
    goldfish:{cn:'泡泡鱼', desc:'向本路前方吐水弹，命中第一个敌人。水系连成 3 只时，水弹让敌人减速 15%，持续 2 秒。上下左右 4 格都被普通宠物链接时可以进化。', rarity:'rare', evo:{spine:'GoldfishEvo', cn:'花冠泡泡鱼', dmgMul:1.5, ring:{n:12, rounds:2, round:2, dmg:60, speed:5}}, name:'Goldfish',short:'鱼', el:'water', shape:'shooter',  cost:100, cd:5,  hp:300,  dmg:20, int:1.4, projSpeed:6, windup:0.17},
    pug:     {cn:'火牙犬', desc:'咬前方 1 格内的所有敌人。火系连成 3 只时，攻击附带灼烧：每秒 4 点，持续 3 秒。', rarity:'common', name:'Pug',     short:'巴哥',el:'fire', shape:'melee',    cost:75,  cd:5,  hp:450,  dmg:40, int:1.0, reach:1, windup:0.36}   /* 出手 = Attack 动画里身体顶到最高点（0.367s），不是 Spine 自带的 0.167s 事件（那是蓄力开始） */,
    pumpkin: {cn:'硬壳南瓜', desc:'生命 2000，不攻击。挡住敌人，让后排继续输出。', rarity:'common', name:'Pumpkin', short:'南瓜',el:'grass', shape:'wall',    cost:50,  cd:20, hp:2000, windup:0.17},
    bomb:    {cn:'波姆', desc:'放下 3 秒后就绪。敌人走到它面前时爆炸，对周围 3×3 格造成 600 伤害。', rarity:'rare', name:'Bomb',    short:'雷', el:'fire',  shape:'mine',     cost:125, cd:30, hp:1,    dmg:600, arm:3, windup:0.17},
    snail:   {cn:'厚壳蜗', desc:'生命 1000，不攻击。咬它的敌人移动和攻击都变慢 30%，持续 2 秒。', rarity:'common', name:'Snail_Green', short:'蜗', el:'grass', shape:'wall', cost:25, cd:10, hp:1000, windup:0.13, monster:true, sticky:{k:0.7, t:2}},   // 73 版：1-8 通关得到；比南瓜便宜、冷却短、血少
    // 第2章角色 v1（_dev，未合并）：迅火狐（第 2 章给）、菇背羊（第 2 章收服）、格鲁姆【提案】
    fox:     {cn:'迅火狐', desc:'挥爪横扫本路和上下相邻两路的前方 1 格，每 0.6 秒一次，每次 22 伤害。', rarity:'rare', name:'Animal_Fox', short:'狐', el:'fire', shape:'melee', cost:100, cd:8, hp:380, dmg:22, int:0.6, reach:1, sweep:true, windup:0.09, monster:true},
    mushgoat:{cn:'菇背羊', desc:'不攻击。每 6 秒给周围 3×3 格内的宠物回复 80 生命（包括自己）。', rarity:'rare', name:'Goat_Mushroom', short:'菇', el:'grass', shape:'support', cost:125, cd:15, hp:600, heal:{amt:80, every:6}, windup:0.3, monster:true},
    bear:    {cn:'格鲁姆', desc:'生命 2400，能挡住蛮角牛和巴隆的践踏。每 2.4 秒拍击前方 1 格，90 伤害，并把普通敌人击退 0.6 格。', rarity:'epic', name:'Bear_Grizzly', short:'熊', el:'none', shape:'melee', tank:true, cost:200, cd:30, hp:2400, dmg:90, int:2.4, reach:1, knock:0.6, windup:0.47, monster:true},
    // 第 3 章：岩钳蟹、炮台龟（93 版合并；另外 8 只见下面「93 版」）
    crab:    {cn:'岩钳蟹', desc:'每 2.5 秒钳住前方 1 格内最近的一个敌人：30 伤害，并让它 1.5 秒不能走、不能攻击（精英和 Boss 只有 0.5 秒）。', rarity:'rare', name:'Crab_Rock', short:'钳', el:'water', shape:'melee', clamp:{t:1.5, big:0.5}, cost:100, cd:10, hp:520, dmg:30, int:2.5, reach:1, windup:0.28, monster:true},
    turtle:  {cn:'炮台龟', desc:'每 3 秒朝本路最靠后的地面敌人投一块石头：60 伤害，落点前后 0.5 格内的其他敌人各受 30。石头从空中落下，不被木桶、背壳、墨挡住；打不到飞行的敌人。', rarity:'epic', name:'Turtle_Tower', short:'龟', el:'none', shape:'shooter', toss:{splash:0.5, sdmg:30, fly:0.8}, cost:200, cd:20, hp:500, dmg:60, int:3, windup:0.2, monster:true},
    // 93 版：第 3 章其余 8 只怪的宠物形态（原则同 91 版：宠物技能 = 它当敌人时那一招；出手时机沿用敌方 windup）
    puffer:   {cn:'鼓气鲀', desc:'放下 1.2 秒后鼓好气。敌人走到它面前时炸开，周围 3×3 格的敌人各受 300 伤害。', rarity:'common', name:'Blowfish_Angry', short:'鼓', el:'water', shape:'mine', cost:50, cd:20, hp:1, dmg:300, arm:1.2, windup:0.5, monster:true},
    helmfish: {cn:'铁盔鱼', desc:'每 2 秒用铁盔顶前方 1 格的敌人：40 伤害，并把它顶回 1 格（精英、Boss 顶不动）。生命 700。', rarity:'rare', name:'Goby_Helmet', short:'盔', el:'none', shape:'melee', cost:100, cd:8, hp:700, dmg:40, int:2.0, reach:1, knock:1.0, windup:0.25, monster:true},
    jelly:    {cn:'飘电水母', desc:'电前方 1 格的敌人，每 1.3 秒 14 伤害；同时放电：周围 1.5 格内的其他敌人（最多 3 只）各受 12 伤害、麻痹 1 秒（Boss 不麻痹）。', rarity:'rare', name:'Jellyfish_Bouncy', short:'电', el:'light', shape:'melee', cost:100, cd:8, hp:320, dmg:14, int:1.3, reach:1, zap:{n:3, dmg:12, t:1, r:1.5}, windup:0.6, monster:true},
    inkocto:  {cn:'喷墨章鱼', desc:'不攻击。每 9 秒朝本路前方 3 格喷墨，持续 5 秒：墨里的敌人移动变慢 50%。', rarity:'rare', name:'Octopus_Pirate', short:'墨', el:'dark', shape:'support', cost:100, cd:12, hp:360, inkP:{every:9, len:3, t:5, k:0.5}, windup:0.22, monster:true},
    mudfish:  {cn:'泥跃鱼', desc:'不攻击。每 7 秒朝本路前方 3 格内最近的敌人甩一团泥：落点 1 格内的敌人陷住 1.5 秒（精英、Boss 0.5 秒）。', rarity:'common', name:'Goby_Mad', short:'泥', el:'grass', shape:'support', cost:75, cd:10, hp:320, mudP:{every:7, dist:3, t:1.5, big:0.5}, windup:0.25, monster:true},
    parrot:   {cn:'船长鹦鹉', desc:'每 2.4 秒把一只小岩钳蟹丢向本路最近的地面敌人：36 伤害，并钳住它 1 秒（精英、Boss 0.3 秒）。打不到飞行的敌人。', rarity:'rare', name:'Bird_Parrot', short:'鹦', el:'grass', shape:'shooter', toss:{near:true, fly:0.6, splash:0, sdmg:0, clamp:1, big:0.3, crab:true}, cost:125, cd:8, hp:260, dmg:36, int:2.4, windup:0.3, monster:true},
    beast:    {cn:'棘皮鲀', desc:'咬前方 1 格，每 1.1 秒 24 伤害。越打越凶：每损失 150 生命，攻击 +50%（最多 +150%）。生命 700。', rarity:'rare', name:'Blowfish_Beast', short:'鲀', el:'fire', shape:'melee', cost:125, cd:10, hp:700, dmg:24, int:1.1, reach:1, growP:{per:150, k:0.5, max:3}, windup:0.5, monster:true},
    kraken:   {cn:'奥库塔', desc:'不攻击。每 18 秒掀起潮浪：本路和上下两路的敌人各受 120 伤害，普通敌人被推回 1 格。', rarity:'legend', name:'Octopus_Ringed', short:'奥', el:'dark', shape:'support', cost:250, cd:40, hp:1500, tide:{every:18, dmg:120, push:1}, windup:0.3, monster:true},
    lizard:  {cn:'喷火蜥', desc:'朝前方 2 格喷火，命中的敌人灼烧：每秒 6 点，持续 3 秒。', rarity:'rare', name:'Lizard_Fire',short:'火蜥',el:'fire',shape:'melee',  cost:150, cd:8,  hp:400,  dmg:30, int:1.5, reach:2, burn:{dps:6, t:3}, windup:0.28, monster:true},
    // ===== 91 版：所有怪都能召唤（用户 2026-11-17 同意 Claude 的提案）：宠物技能 = 它当敌人时的那一招；出手时机沿用敌方同一只怪测好的 windup =====
    slime:    {cn:'绿莱姆', desc:'向本路前方吐粘液弹，每 1.5 秒一发，14 伤害；命中的敌人移动变慢 20%，持续 2 秒。', rarity:'common', name:'Slime_Green', short:'史', el:'grass', shape:'shooter', cost:75, cd:6, hp:300, dmg:14, int:1.5, projSpeed:5, windup:0.1, monster:true, spit:{k:0.8, t:2}},
    beetle:   {cn:'赤甲虫', desc:'咬前方 1 格，每 1.1 秒 30 伤害。背上带刺：咬它的敌人每口反受 15 伤害。', rarity:'common', name:'Beetle_Red', short:'甲', el:'fire', shape:'melee', cost:75, cd:6, hp:500, dmg:30, int:1.1, reach:1, windup:0.15, monster:true, thorns:15},
    snake:    {cn:'翠颈蛇', desc:'咬前方 1 格，每秒 16 伤害；咬中的敌人中毒：每秒 5 伤害，持续 4 秒。', rarity:'common', name:'Snake_Green', short:'蛇', el:'grass', shape:'melee', cost:75, cd:6, hp:360, dmg:16, int:1.0, reach:1, windup:0.17, monster:true, venom:{dps:5, t:4}},
    hornliz:  {cn:'棘背蜥', desc:'咬前方 1 格，每 1.2 秒 34 伤害。生命降到一半以下后发怒，攻击间隔缩短 30%。', rarity:'common', name:'Lizard_Horn', short:'棘', el:'grass', shape:'melee', cost:100, cd:8, hp:520, dmg:34, int:1.2, reach:1, windup:0.2, monster:true, fury:{at:0.5, k:0.7}},
    hornbug:  {cn:'尖角虫', desc:'咬前方 1 格，每 0.9 秒 16 伤害。同一路每多 1 只尖角虫，攻击 +15%（最多 +60%）。', rarity:'common', name:'Beetle_Blood', short:'角', el:'dark', shape:'melee', cost:50, cd:5, hp:260, dmg:16, int:0.9, reach:1, windup:0.15, monster:true, pack:{k:0.15, max:4}},
    gull:     {cn:'长信翁', desc:'抛出水弹，每 1.8 秒一发，26 伤害；弧线飞行，越过木箱等道具，打本路最前面的敌人。', rarity:'rare', name:'Bird_Gull', short:'翁', el:'none', shape:'shooter', cost:100, cd:7, hp:280, dmg:26, int:1.8, projSpeed:4.5, windup:0.42, monster:true, lob:true},
    goat:     {cn:'莽角羊', desc:'咬前方 1 格，每秒 20 伤害。每 12 秒冲向前方 4 格内最近的敌人，撞击 200 伤害并击退 1 格（精英、Boss 不击退），撞完回到原位。', rarity:'rare', name:'Goat_Angry', short:'莽', el:'none', shape:'melee', cost:125, cd:12, hp:450, dmg:20, int:1.0, reach:1, windup:0.2, monster:true, ram:{every:12, dmg:200, knock:1, range:4}},
    cat:      {cn:'灰原喵', desc:'不攻击。每 1.5 秒自动收取周围 3×3 格内的一颗能量，不用点。', rarity:'rare', name:'Animal_Cat', short:'喵', el:'dark', shape:'support', cost:50, cd:10, hp:300, windup:0.25, monster:true, magnet:{every:1.5, dl:1, dp:1.5}},
    bellsnake:{cn:'铃尾蛇', desc:'不攻击。每 8 秒摇一次铃：周围 3×3 格内的宠物攻击速度 +25%，持续 3 秒。', rarity:'rare', name:'Snake_Bell', short:'铃', el:'light', shape:'support', cost:100, cd:12, hp:300, windup:0.17, monster:true, chime:{every:8, t:3, k:1.25}},
    redbird:  {cn:'掠空鸟', desc:'每 2 秒俯冲攻击本路最远的一只敌人，40 伤害，能打到飞行的敌人。', rarity:'rare', name:'Bird_Red', short:'掠', el:'fire', shape:'shooter', cost:125, cd:8, hp:260, dmg:40, int:2.0, windup:0.2, monster:true, snipe:true},
    mushsnake:{cn:'伞顶蛇', desc:'不攻击。每 10 秒炸开伞顶孢子：本路和上下相邻路、前后 1.5 格内的敌人停下 1.5 秒（Boss 不受影响）。', rarity:'rare', name:'Snake_Mushroom', short:'伞', el:'fire', shape:'support', cost:100, cd:12, hp:300, windup:0.17, monster:true, sporeP:{every:10, t:1.5, dl:1, dp:1.5}},
    shellliz: {cn:'背壳蜥', desc:'生命 1400，不攻击。背壳挡住远程攻击：喷火等远程攻击打它只有 50% 伤害。', rarity:'rare', name:'Lizard_Snail', short:'壳', el:'water', shape:'wall', cost:75, cd:15, hp:1400, windup:0.25, monster:true, shellP:0.5},
    wildox:   {cn:'蛮角牛', desc:'生命 1600，能挡住践踏。顶前方 1 格，每 1.5 秒 30 伤害。每 15 秒向前冲 2 格，路上的敌人各受 150 伤害并被击退 0.5 格（精英、Boss 不击退），冲完回到原位。', rarity:'epic', name:'Buffalo_Wild', short:'牛', el:'none', shape:'melee', tank:true, cost:175, cd:25, hp:1600, dmg:30, int:1.5, reach:1, windup:0.3, monster:true, rush:{every:15, dmg:150, len:2, knock:0.5}},
    toucan:   {cn:'巨喙鸟', desc:'不攻击。每 20 秒叼走本路离它最近的一只普通敌人（精英、Boss 叼不走）。', rarity:'epic', name:'Bird_Toucan', short:'喙', el:'none', shape:'support', cost:150, cd:25, hp:300, windup:0.2, monster:true, pluck:{every:20}},
    disco:    {cn:'巴隆', desc:'不攻击。每 14 秒打开舞池灯光：场上最靠近警钟的 4 只敌人停下跳舞 2 秒（Boss 不受影响）。', rarity:'legend', name:'Buffalo_Disco', short:'隆', el:'none', shape:'support', cost:250, cd:40, hp:1200, windup:0.3, monster:true, lights:{every:14, n:4, t:2}},
  },
  enemies: {
    slime:  {cn:'绿莱姆', desc:'移动 0.25 格 / 秒，生命 200。咬挡路的宠物。', name:'Slime_Green', short:'史', el:'grass', hp:200,  speed:0.25, atk:10, atkInt:1.0, role:'minor', drop:0.05, r:0.30, windup:0.1},
    beetle: {cn:'赤甲虫', desc:'火系，生命 280。水系攻击对它伤害 +50%。', name:'Beetle_Red',  short:'甲', el:'fire',  hp:280,  speed:0.25, atk:12, atkInt:1.0, role:'minor', drop:0.05, r:0.30, windup:0.15},
    snail:  {cn:'厚壳蜗', desc:'移动 0.15 格 / 秒，生命 800。', name:'Snail_Green', short:'蜗', el:'grass', hp:800,  speed:0.15, atk:15, atkInt:1.5, role:'minor', drop:0.05, r:0.34, windup:0.13},
    fox:    {cn:'迅火狐', desc:'移动 0.5 格 / 秒，是绿莱姆的 2 倍。生命 170。', name:'Animal_Fox',  short:'狐', el:'fire',  hp:170,  speed:0.5,  atk:10, atkInt:0.8, role:'minor', drop:0.05, r:0.28, windup:0.09},
    lizard: {cn:'喷火蜥', desc:'隔 1 格停下，向前喷火 2 格，烧到最前面的宠物：每次 16 伤害。近战 1 格的宠物打不到它。', name:'Lizard_Fire', short:'火蜥', el:'fire', hp:360, speed:0.2, atk:16, atkInt:1.6, role:'minor', drop:0.05, r:0.32, windup:0.28, range:2},
    snake:  {cn:'翠颈蛇', desc:'生命 240，移动 0.3 格 / 秒。咬中的宠物中毒：每秒 5 伤害，持续 4 秒。', name:'Snake_Green', short:'蛇', el:'grass', hp:240, speed:0.3, atk:8, atkInt:1.0, role:'minor', drop:0.05, r:0.3, windup:0.17, poison:{dps:5, t:4}},   // 73 版；出手 = Attack 里身体冲到最前（0.167s）
    gull:   {cn:'长信翁', desc:'生命 220，移动 0.4 格 / 秒。遇到的第一只宠物会被它飞越过去，之后正常前进。', name:'Bird_Gull', short:'翁', el:'none', hp:220, speed:0.4, atk:10, atkInt:1.0, role:'minor', drop:0.05, r:0.3, windup:0.42, hop:true},   // 73 版；出手 = Attack 里身体冲到最前、最低（0.417s）
    hornliz:{cn:'棘背蜥', desc:'生命 320。生命降到一半后移动速度 +80%，攻击间隔缩短 30%。', name:'Lizard_Horn', short:'棘', el:'grass', hp:320, speed:0.22, atk:14, atkInt:1.2, role:'minor', drop:0.05, r:0.32, windup:0.2, enrage:{at:0.5, speed:1.8, atkInt:0.7}},
    hornbug:{cn:'尖角虫', desc:'5 只一群一起出现。生命 260，移动比绿莱姆快 40%。', name:'Beetle_Blood', short:'角', el:'dark', hp:260, speed:0.35, atk:8, atkInt:0.9, role:'minor', drop:0.05, r:0.26, windup:0.15},
    // ===== 第2章角色 v1（_dev，未合并；机制表见 _dev/第2章角色/v1/说明.md）=====
    goat:     {cn:'莽角羊', desc:'进场就冲刺（速度 0.7），撞上第一只挡路的宠物造成 100 伤害，然后自己晕 2 秒。之后正常走、咬。生命 380。', name:'Goat_Angry', short:'莽', el:'none', hp:380, speed:0.25, atk:12, atkInt:1.0, role:'minor', drop:0.08, r:0.32, windup:0.2, charge:{speed:0.7, dmg:100, daze:2}},
    cat:      {cn:'灰原喵', desc:'每 5 秒叼走场上一颗没收的能量（最多 3 颗）。打死它，叼走的能量全部掉出来。生命 260，移动 0.35 格 / 秒。', name:'Animal_Cat', short:'喵', el:'dark', hp:260, speed:0.35, atk:10, atkInt:1.0, role:'minor', drop:0.08, r:0.3, windup:0.25, steal:{every:5, max:3, minAge:1.2}},
    bellsnake:{cn:'铃尾蛇', desc:'每 6 秒摇一次铃：本路和上下相邻路、前后 2 格内的其他敌人移动速度 +50%，持续 3 秒。生命 180。', name:'Snake_Bell', short:'铃', el:'light', hp:180, speed:0.28, atk:8, atkInt:1.0, role:'minor', drop:0.08, r:0.28, windup:0.17, ring:{every:6, t:3, k:1.5, dp:2, stop:0.6}},
    mushgoat: {cn:'菇背羊', desc:'每 5 秒给本路和上下相邻路、前后 1.5 格内的敌人（包括自己）回复 60 生命。生命 340，移动 0.2 格 / 秒。', name:'Goat_Mushroom', short:'菇', el:'grass', hp:340, speed:0.2, atk:10, atkInt:1.2, role:'minor', drop:0.08, r:0.32, windup:0.2, healAura:{every:5, amt:60, dp:1.5, stop:0.6}},
    redbird:  {cn:'掠空鸟', desc:'飞在空中，不停下、不咬，直接飞向警钟。近战打不到它，也不会踩响波姆；只有吐弹的宠物能打到。生命 160，移动 0.45 格 / 秒。', name:'Bird_Red', short:'掠', el:'fire', hp:160, speed:0.45, atk:0, atkInt:1.0, role:'minor', drop:0.08, r:0.28, windup:0.2, fly:true},
    wildox:   {cn:'蛮角牛', desc:'精英。从宠物身上踩过去，每踩到一只造成 150 伤害，不停下。只有坦克（硬壳南瓜、厚壳蜗、格鲁姆）能把它挡住，挡住后每 1.5 秒顶 60。生命 1800。', name:'Buffalo_Wild', short:'牛', el:'none', hp:1800, speed:0.18, atk:60, atkInt:1.5, drop:1, role:'elite',  r:0.42, windup:0.3, trample:{dmg:150}},
    toucan:   {cn:'巨喙鸟', desc:'飞到本路最贵的一只宠物上方，盘旋 2.5 秒（脚下出现红圈）后把它叼走。盘旋时把那只宠物换走，它就扑空落地，之后像普通敌人一样走。生命 260。', name:'Bird_Toucan', short:'喙', el:'none', hp:260, speed:0.4, atk:10, atkInt:1.0, role:'minor', drop:0.08, r:0.3, windup:0.3, fly:true, grab:{hover:2.5}},
    mushsnake:{cn:'伞顶蛇', desc:'被打死时伞顶炸开孢子：本路和上下相邻路、前后 1 格内的宠物停手 2.5 秒。生命 280。', name:'Snake_Mushroom', short:'伞', el:'fire', hp:280, speed:0.26, atk:10, atkInt:1.0, role:'minor', drop:0.08, r:0.3, windup:0.17, spore:{t:2.5, dp:1.2}},
    shellliz: {cn:'背壳蜥', desc:'背上的壳挡子弹：吐弹的宠物打它只有 25% 伤害。近战、爆炸、灼烧照常。生命 420。', name:'Lizard_Snail', short:'壳', el:'water', hp:420, speed:0.22, atk:12, atkInt:1.1, role:'minor', drop:0.08, r:0.32, windup:0.25, shell:0.25},
    disco:    {cn:'巴隆', desc:'Boss，生命 7000。践踏：踩过的宠物各 150 伤害，坦克才挡得住。舞池灯光：每 15 秒地上亮 4 格灯，2 秒后打开 4 秒，站在灯里的宠物跳舞停手。伴舞：每 24 秒叫出 3 只莽角羊。节拍冲刺：每 18 秒踩 4 拍，第 4 拍往前冲 3 格，冲过的宠物各 200 伤害。生命降到一半后：移动速度 +40%，灯光每 10 秒、亮 6 格，伴舞每 16 秒，冲刺每 12 秒。', name:'Buffalo_Disco', short:'隆', el:'light', hp:7000, speed:0.12, atk:80, atkInt:1.6, drop:1, role:'elite',  r:0.46, windup:0.3,
               trample:{dmg:150}, disco:{light:15, lightRage:10, n:4, nRage:6, warn:2, on:4, dance:24, danceRage:16, pose:1.2, dash:18, dashRage:12, beat:0.5, dashLen:3, dashDmg:200}, boss:{bell:true}, enrage:{at:0.5, speed:1.4, atkInt:0.85}},
    // ===== 第3章角色 v1（_dev，未合并；机制表见 _dev/第3章角色/v1/说明.md）=====
    crab:     {cn:'岩钳蟹', desc:'每往前走 2 格，就横着爬到相邻的一路（挑宠物少的那一路）。被挡住时不横爬。生命 300。', name:'Crab_Rock', short:'蟹', el:'water', hp:300, speed:0.24, atk:12, atkInt:1.0, role:'minor', drop:0.1, r:0.32, windup:0.28, side:{every:2, t:0.6}},
    puffer:   {cn:'鼓气鲀', desc:'碰到宠物就停下鼓气，1.2 秒后炸开：周围 3×3 格的宠物各受 300 伤害。鼓完之前被打死就不会炸。生命 240。', name:'Blowfish_Angry', short:'鼓', el:'water', hp:240, speed:0.3, atk:0, atkInt:1.0, role:'minor', drop:0.1, r:0.32, windup:0.5, puff:{t:1.2, dmg:300}},
    helmfish: {cn:'铁盔鱼', desc:'每 4 秒用铁盔顶一下挡路的宠物：40 伤害，并把它往后顶 1 格；后面那格有宠物、木桶或已经在最后一格时顶不动，改为 80 伤害。生命 460。', name:'Goby_Helmet', short:'盔', el:'none', hp:460, speed:0.22, atk:12, atkInt:1.2, role:'minor', drop:0.1, r:0.32, windup:0.25, butt:{every:4, dmg:40, push:1}},
    jelly:    {cn:'飘电水母', desc:'每咬一口都放电：挡路宠物周围 3×3 格内的其他宠物（最多 3 只）各受 12 伤害，并麻痹 1 秒不能攻击。生命 260。', name:'Jellyfish_Bouncy', short:'电', el:'light', hp:260, speed:0.26, atk:12, atkInt:1.3, role:'minor', drop:0.1, r:0.3, windup:0.6, chain:{n:3, dmg:12, stun:1}},
    inkocto:  {cn:'喷墨章鱼', desc:'每 8 秒停下喷墨：本路前方 3 格盖上墨，持续 5 秒。站在墨里的远程宠物只能打到 1.5 格内的敌人。生命 320。', name:'Octopus_Pirate', short:'墨', el:'dark', hp:320, speed:0.22, atk:10, atkInt:1.0, role:'minor', drop:0.1, r:0.32, windup:0.22, ink:{every:8, len:3, t:5, stop:0.6, reach:1.5}},
    turtle:   {cn:'炮台龟', desc:'进场走 1.5 格就停下，每 3.5 秒朝本路最后排的宠物投一块石头：45 伤害，越过前面的宠物。本路没有宠物时继续往前走。生命 650。', name:'Turtle_Tower', short:'炮', el:'none', hp:650, speed:0.16, atk:15, atkInt:1.5, role:'minor', drop:0.1, r:0.36, windup:0.2, lob:{every:3.5, dmg:45, stopAt:7.9, fly:1.0}},
    mudfish:  {cn:'泥跃鱼', desc:'每 6 秒往前方 2 格甩一团泥：那一格 8 秒内放不了宠物、换位也进不去，站在上面的宠物攻击变慢 40%。生命 280。', name:'Goby_Mad', short:'泥', el:'grass', hp:280, speed:0.26, atk:10, atkInt:1.0, role:'minor', drop:0.1, r:0.3, windup:0.25, mud:{every:6, dist:2, t:8, slow:1.4, stop:0.5}},
    parrot:   {cn:'船长鹦鹉', desc:'飞在空中，抓着一只岩钳蟹飞进来，飞到最前排宠物身后 1.5 格把蟹丢下，然后飞走。半路被打下来，蟹就在原地落下。近战打不到它。生命 200。', name:'Bird_Parrot', short:'鹦', el:'grass', hp:200, speed:0.5, atk:0, atkInt:1.0, role:'minor', drop:0.1, r:0.3, windup:0.3, fly:true, ferry:{key:'crab', behind:1.5}},
    beast:    {cn:'棘皮鲀', desc:'越打越大：每受到 120 伤害长大一级，每级攻击 +50%、体型 +15%，最多 3 级。生命 520。', name:'Blowfish_Beast', short:'棘', el:'fire', hp:520, speed:0.2, atk:14, atkInt:1.1, role:'minor', drop:0.1, r:0.34, windup:0.5, grow:{per:120, max:3, atk:0.5, size:0.15}},
    kraken:   {cn:'奥库塔', desc:'Boss，生命 9000。墨潮：每 12 秒朝自己和上下两路的前方 4 格喷墨，持续 6 秒，墨里的远程宠物只能打 1.5 格内。潮浪：每 20 秒标出 2 路，2.5 秒后海浪从这两路冲过，每只宠物受 120 伤害并往后推 1 格。召集船员：每 24 秒叫来 2 只抓着岩钳蟹的船长鹦鹉。生命降到一半后：移动速度 +30%，墨潮每 8 秒，潮浪每 13 秒、冲 3 路，召集每 16 秒。', name:'Octopus_Ringed', short:'奥', el:'dark', hp:9000, speed:0.11, atk:90, atkInt:1.7, role:'elite', drop:1, r:0.46, windup:0.22,
               boss:{bell:true}, kraken:{ink:12, inkRage:8, inkLen:4, inkT:6, stop:0.8, wave:20, waveRage:13, nWave:2, nWaveRage:3, warn:2.5, sweep:1.2, waveDmg:120, crew:24, crewRage:16}, enrage:{at:0.5, speed:1.3, atkInt:0.85}},
    bear:   {cn:'格鲁姆', desc:'生命 5000。重击面前的宠物 60 伤害，同一列上下两路的宠物也受 60 伤害。每 16 秒换到相邻一路（那一路先亮红 2 秒）；每 24 秒吼叫，左右两路各出 2 只绿莱姆。生命降到一半后移动速度 +50%、攻击间隔缩短 15%，改为每 10 秒换路、每 16 秒吼叫。', name:'Bear_Grizzly',short:'熊', el:'none',  hp:5000, speed:0.15, atk:60, atkInt:1.8, drop:1, role:'elite',  r:0.44, windup:0.47,
             boss:{switchEvery:16, switchRage:10, warn:2, roarEvery:24, roarRage:16, roarT:1.2, cleave:true}, enrage:{at:0.5, speed:1.5, atkInt:0.85}},
  },
  level: {
    id:'1-5', title:'花田保卫战', loadout:['flower','goldfish','pug','pumpkin','bomb','lizard'],
    startEnergy:75, skyDrop:{every:12, value:25, firstAt:6},
    cells:[ {lane:1,col:2,type:'flower'}, {lane:3,col:2,type:'flower'}, {lane:2,col:6,type:'crate',kind:'barrel'}, {lane:4,col:5,type:'crate',kind:'box'} ],
    duration:240,
  },
};
// ---------- 65 版：关卡按 id 读取（数据在 levels.js），宠物拥有 / 机制解锁存档 ----------
// 90 版：2 星效果数值（和 meta.js STAR_ROUTE 的文字一致，改一处要两处一起改）
// 96 版：升星效果统一成一张表（vfx-design.md 9.1；文字在 meta.js STAR_ROUTE，两处一起改）。
// STAR_FX[key] = [2 星补丁, 3 星补丁]：宠物上场时按星级把补丁深合并进它自己的 def（pet.def），战斗代码照常读 def；3 星包含 2 星。
// 新增的升星专用字段：double 连发 2 颗、heavy4 每第 4 口重咬、splash 水弹溅射、fireFloor 地面留火、blast 爆炸前后格数、lucky 产出双倍概率、reflect 被咬反弹比例、soak 水弹减速
const STAR_FX = {
  goldfish:[{double:true}, {splash:{r:0.5, k:0.4}}],
  pug:[{heavy4:true}, {reach:2}],
  lizard:[{reach:3}, {fireFloor:{t:2, k:0.3}}],
  bomb:[{arm:2.1}, {blast:2}],
  flower:[{prod:31}, {lucky:0.2}],
  pumpkin:[{hp:2800}, {reflect:0.2}],
  fox:[{burn:{dps:6, t:3}}, {reach:2}],
  // 96 版：其余 28 只的 2 星（Claude 定，用户 2026-11-23「2 星也一起做」）
  // 97 版：这 28 只的 3 星（Claude 定，vfx-design.md 9.1）。新字段：glue 咬满 n 口粘住、heal.clean 解除负面、slamDaze 拍中停下、clamp.n 钳几只、toss.n 投几块、
  //   uses/rearm 地雷能炸几次、bump 顶回撞身后、bigZap 每第 n 次大放电、inkP.dl 墨盖上下路、mudP.floor 留泥地、toss.air 能打飞行、leech 吸血比例、tide.all 全场、
  //   spit.pierce 穿透、thornsBurn 反伤点火、venom.stack 毒叠层、fury.reach 发怒加射程、pack.adj 相邻路算同伴、lob3 三路抛、ram.daze 撞晕、gift 自己产能量、
  //   chime.dp 铃声范围、pass 俯冲路过伤害、sporeP.venom 孢子带毒、shellBack 远程反弹、rush.leech 冲锋回血、pluck.elite 叼精英、lights.party 开灯全场加速
  snail:[{sticky:{k:0.5}}, {glue:{n:3, t:1.5, big:0.5}}], mushgoat:[{heal:{amt:120}}, {heal:{clean:true}}], bear:[{sweep:true}, {slamDaze:1}], crab:[{clamp:{t:2.5, big:0.8}}, {clamp:{n:2}}],
  turtle:[{toss:{splash:1}}, {toss:{n:2}}], puffer:[{dmg:450}, {uses:2, rearm:6}], helmfish:[{knock:1.5}, {bump:{r:1, dmg:40, push:0.5}}], jelly:[{zap:{n:5}}, {bigZap:{every:3, r:2.5, dmg:30, t:1.5}}],
  inkocto:[{inkP:{len:5}}, {inkP:{dl:1}}], mudfish:[{mudP:{t:2.5, big:0.8}}, {mudP:{floor:{t:4, k:0.6}}}], parrot:[{toss:{clamp:2, big:0.5}}, {toss:{air:true}}], beast:[{growP:{per:100}}, {leech:0.3}],
  kraken:[{tide:{every:13}}, {tide:{all:true}}], slime:[{spit:{k:0.65}}, {spit:{pierce:2, pk:0.85}}], beetle:[{thorns:30}, {thornsBurn:{dps:6, t:3}}], snake:[{venom:{dps:9}}, {venom:{stack:3}}],
  hornliz:[{fury:{at:0.7}}, {fury:{reach:2}}], hornbug:[{pack:{k:0.25}}, {pack:{adj:true}}], gull:[{soak:{k:0.8, t:2}}, {lob3:true}], goat:[{ram:{every:8}}, {ram:{daze:1.5}}],
  cat:[{magnet:{dp:2.5}}, {gift:{every:25, v:25}}], bellsnake:[{chime:{k:1.4}}, {chime:{dp:2}}], redbird:[{dmg:56}, {pass:0.5}], mushsnake:[{sporeP:{t:2.5}}, {sporeP:{venom:{dps:6, t:4}}}],
  shellliz:[{hp:2000}, {shellBack:0.5}], wildox:[{rush:{len:3}}, {rush:{leech:60}}], toucan:[{pluck:{every:14}}, {pluck:{elite:true}}], disco:[{lights:{n:6}}, {lights:{party:{k:1.3, t:3}}}],
};
const STAR_DEF_CACHE = {};
function starDef(key, star){ const base=DATA.pets[key], P=STAR_FX[key]; star=star||starOf(key); if(!base || !P || star<2) return base;
  const n=Math.min(star-1, P.length), ck=key+'|'+n; if(STAR_DEF_CACHE[ck]) return STAR_DEF_CACHE[ck];
  const d=Object.assign({}, base);
  for(let i=0;i<n;i++) for(const k in P[i]){ const v=P[i][k]; d[k] = (v && typeof v==='object' && d[k] && typeof d[k]==='object') ? Object.assign({}, d[k], v) : v; }
  d.base=base; return STAR_DEF_CACHE[ck]=d; }
const PET_ORDER = ['flower','goldfish','pug','pumpkin','bomb','lizard','snail','fox','mushgoat','bear',
  'slime','beetle','snake','hornliz','hornbug','gull','shellliz','goat','cat','bellsnake','redbird','mushsnake','wildox','toucan','disco',
  'crab','turtle','puffer','helmfish','jelly','inkocto','mudfish','parrot','beast','kraken'];   // 93 版：+ 第 3 章 10 只怪的宠物形态   // 91 版：+ 15 只怪的宠物形态   // 第2章角色 v1：+ 迅火狐、菇背羊、格鲁姆
const PET_NEED = {common:10, rare:15, epic:25, legend:40};   // 召唤一只宠物要的碎片（和 render.js 的 RAR.need 一致）
let PROFILE = {owned:{flower:1, goldfish:1}, unlock:{}};
const PROFILE_KEY = 'tata_profile';
let PROFILE_NEW = false;   // 这台设备第一次打开（没有存档）：直接进 1-1
(function(){ let p=null; try{ if(/[?&]reset=1\b/.test(location.search)){ for(const k of [PROFILE_KEY,'tata_map','tata_shards']) localStorage.removeItem(k);
      history.replaceState(null, '', location.pathname+location.search.replace(/([?&])reset=1&?/,'$1').replace(/[?&]$/,'')); }   // 清完把参数从网址里去掉，免得每次刷新都再清一次
    p=JSON.parse(localStorage.getItem(PROFILE_KEY)||'null'); }catch(e){}
  if(p && p.owned){ PROFILE=p; PROFILE.unlock=PROFILE.unlock||{}; PROFILE.stars=PROFILE.stars||{}; PROFILE.owned.flower=1; PROFILE.owned.goldfish=1; }
  else { PROFILE_NEW=true;   // 65 版关卡内容全换了：旧的地图进度、旧的怪物碎片不再对应，一起清掉
    try{ localStorage.removeItem('tata_map'); localStorage.removeItem('tata_shards'); localStorage.setItem(PROFILE_KEY, JSON.stringify(PROFILE)); }catch(e){} } })();
function profileSave(){ try{ localStorage.setItem(PROFILE_KEY, JSON.stringify(PROFILE)); }catch(e){} }
const starOf = k => (PROFILE.stars && PROFILE.stars[k]) || 1;   // 69 版：宠物星级（升星在宠物页，meta.js starUp）
const swapMax = () => PROFILE.unlock.swap3 ? 3 : PROFILE.unlock.swap ? 2 : 0;
const laneOn = l => DATA.level.lanes.includes(l);
const levelCleared = id => { try{ return !!(window.CHAPTER_MAP && CHAPTER_MAP.progress.cleared[id]); }catch(e){ return false; } };
// 92 版：本关条件（开局写清楚；用户 2026-11-14：「需要在一开始游戏界面说明」）。只列和平常不一样的
function condInfo(){ const lv=DATA.level, c=lv.cond||{}, out=[];
  if(!lv.skyDrop) out.push('天上不掉能量');
  if(c.prod && c.prod<1) out.push(`聚能花产量 -${Math.round((1-c.prod)*100)}%`);
  return out.length ? {name:c.name||'', lines:out} : null; }
function setLevel(id){
  const lv = (window.LEVELS||{})[id]; if(!lv) return false;
  const owned = PET_ORDER.filter(k=>PROFILE.owned[k]);
  const pick = owned.length>6;   // 73 版：宠物超过 6 只 → 开战前选上阵（参照 PvZ 1-8 起开战前选卡）；默认上次选的
  const prev = (PROFILE.loadout||[]).filter(k=>PROFILE.owned[k]);
  DATA.level = { id, scene:lv.scene||'day', title:lv.title, lanes:lv.lanes.slice(), loadout: pick && prev.length ? prev.slice(0,6) : owned.slice(0,6), pick, startEnergy:lv.startEnergy, skyDrop:lv.skyDrop, cells:lv.cells||[], duration:lv.duration,
    spawns:lv.spawns, cond:lv.cond||null, reward:lv.reward||null, tut:lv.tut||null, boxShard:lv.boxShard||null, first:!levelCleared(id) };
  DATA.level.demo = (lv.demo && DATA.level.first && !PROFILE.demo) ? lv.demo : null;   // 66 版：带浮窗的演示，只放一次；演示完重新开始，玩家自己打
  EVENTS = lv.events||[]; WAVE_MARKS = lv.marks||[];
  if(L) L = makeLayout(L.kind);
  return true;
}
DATA.level.lanes=[0,1,2,3,4];

// ---------- 波次（由设计表生成）----------
function buildSpawns(){
  if(DATA.level.spawns) return DATA.level.spawns.map(([t,type,lane])=>({t,type,lane})).sort((a,b)=>a.t-b.t);
  const s = [];
  const add=(t,type,lane)=>s.push({t,type,lane});
  // 第 1 波 0:20–1:10：6 史莱姆，lane 2→1→3 轮流，间隔 8 秒
  [2,1,3,2,1,3].forEach((l,i)=>add(20+8*i,'slime',l));
  // 第 2 波 1:10–2:10：8 史莱姆 + 4 甲虫，每次 2 条 lane；前 3 组走 lane 0 和 4（提前 10 秒预告）
  const w2 = [[0,4],[0,4],[4,0],[1,3],[2,4],[0,2]];
  const w2types = [['slime','slime'],['beetle','slime'],['slime','beetle'],['slime','slime'],['beetle','slime'],['slime','beetle']];
  w2.forEach((pair,i)=>{ add(70+10*i,w2types[i][0],pair[0]); add(70+10*i+1.5,w2types[i][1],pair[1]); });
  // 第 3 波 2:10–3:00：4 狐狸冲 lane 1、3；4 蜗牛慢压
  [[135,1],[140,3],[150,1],[160,3]].forEach(([t,l])=>add(t,'fox',l));
  [[132,0],[145,2],[158,4],[170,2]].forEach(([t,l])=>add(t,'snail',l));
  // 最终波 3:15–4:00：熊走 lane 2 + 12 只混合
  add(195,'bear',2);
  const mix=['slime','beetle','fox','slime','snail','beetle','slime','fox','beetle','slime','snail','fox','slime','beetle','fox','snail','beetle','slime'];
  mix.forEach((ty,i)=>add(197+i*2.2,ty,[0,4,1,3,2,0,4,1,3,0,4,2,1,3,0,4,2,1][i]));
  return s.sort((a,b)=>a.t-b.t);
}
let EVENTS = [
  {t:60,  kind:'preview', lanes:[0,4], until:90, text:'预告：下一波从最左、最右两路进攻'},
  {t:125, kind:'preview', lanes:[1,3], until:165, text:'预告：迅火狐走第 2、第 4 路'},
  {t:180, kind:'banner',  text:'一大波敌人正在接近', until:186},
];
let WAVE_MARKS = [20,70,130,195];
const SHAPE_CN = {producer:'生产', shooter:'远程 · 直射', melee:'近战', wall:'坦克', mine:'地雷', support:'治疗'};
// 可破坏的场景道具（10 版）：挡住敌我双方的攻击；怪物要先咬破才能前进；我方打破才给奖励，怪物打破什么都不给
const PROPS = {
  // 图：2D Minimal 包的木桶（和场景同一画风）；两种用同一个桶，桶上的奖励图标区分（同画风的第二种容器素材还没有）
  barrel:{cn:'能量桶', hp:150, energy:50, img:'env1/Ork.png', h:0.66, badge:'Economy_Energy_01_Yellow'},
  box:   {cn:'宝石桶', hp:260, shards:2,  img:'env1/Ork.png', h:0.66, badge:'Economy_Gem_01_Purple'},
};
const CELL_INFO = {
  flower:{cn:'花丛', desc:'草系宠物放在这里，伤害和产量 +20%。'},
  barrel:{cn:'能量桶', desc:'障碍：挡住敌我双方的攻击，怪物要先咬破才能前进。我方打破得 50 能量（本局用）。点一下标记，这一路的宠物会先打它。'},
  box:{cn:'宝石桶', desc:'障碍：挡住敌我双方的攻击，怪物要先咬破才能前进。我方打破得 2 个怪物碎片（局外收集）。点一下标记，这一路的宠物会先打它。'},
  bell:{cn:'警钟', desc:'怪物走到这里会敲响，清掉这一路的所有怪物。每一路只能用一次，再漏怪就失败。'},
};

// ---------- 画布与布局 ----------
const cv = document.getElementById('c'); let ctx = window.PIXICTX ? PIXICTX.create(cv) : cv.getContext('2d');   // 57 版：WebGL（Pixi）主画布；?gl=0 用 Canvas 2D
let W=0,H=0,DPR=1;
// 61 版：帧率、画质设置（暂停界面里切换，存在本机）。fps: 60 / 30；res: 画布清晰度上限 2（高）/ 1.5（标准）
// 默认 30 帧 + 标准画质（用户 2026-11-14 真机对比：「肉眼不对比的话差别不大」，发热少一些）；玩家在暂停界面改过的以玩家的为准
const OPTS = {fps:30, res:1.5, aa:false}; try{ const o=JSON.parse(localStorage.getItem('tata_opts')||'{}')||{}; if(o.fps===60) OPTS.fps=60; if(o.res===2) OPTS.res=2; if(o.aa===true) OPTS.aa=true; }catch(e){}
const AA_LIVE = OPTS.aa || /[?&]aa=1\b/.test(location.search);   // 抗锯齿只能在创建画面时定，改了要重开才生效（pixi-ctx.js 启动时自己读同一份设置）
function optsSave(){ try{ localStorage.setItem('tata_opts', JSON.stringify(OPTS)); }catch(e){} }
let orientMode = 'portrait';
let X0 = 0, SW = 0, SC = 1, X0PX = 0, Y0PX = 0;
const PX = e => (e.clientX - X0PX)/SC, PY = e => (e.clientY - Y0PX)/SC;   // 屏幕坐标 → 设计坐标   // 竖屏在宽屏上居中：X0 = 左边留白，SW = 整个窗口宽         // auto | landscape | portrait
let L = null;                    // 当前 Layout

function makeLayout(kind){
  const lay = {kind, items:[]};
  if(kind==='landscape'){
    const barH = Math.max(72, Math.min(110, H*0.17));
    const DECO = 0.9;   // 顶部装饰带（远景树、石像）高度，单位：格
    const cs = Math.min((W-24)/(COLS+1.6), (H-barH-14)/(LANES+DECO+0.25));
    lay.cs = cs;
    lay.ox = (W-(COLS+1.6)*cs)/2 + 0.8*cs;
    lay.oy = barH + DECO*cs + ((H-barH-14) - (LANES+DECO+0.25)*cs)/2;
    lay.decoTop = lay.oy - DECO*cs;
    lay.bar = {x:0,y:0,w:W,h:barH};
    lay.toScreen = (lane,p)=>({x: lay.ox + p*cs, y: lay.oy + (lane+0.5)*cs});
    lay.cellRect = (lane,col)=>({x: lay.ox+col*cs, y: lay.oy+lane*cs, w:cs, h:cs});
    lay.toCell = (x,y)=>({lane:Math.floor((y-lay.oy)/cs), col:Math.floor((x-lay.ox)/cs)});
    lay.forward = {x:1,y:0};
  } else {
    // 竖屏（主方向）：顶部悬浮 HUD + 中间战场 + 底部卡槽托盘
    const n = Math.max(DATA.level.loadout.length, DATA.level.pick ? 6 : 0), pad = 6;   // 73 版：选上阵时按 6 个位置排，换上换下时战场不跟着缩放
    const side = 0;    // 46 版（用户 2026-11-13：倍速放到上面，不要占卡牌的位置）：卡槽整行都给卡牌，倍速挪到右上角暂停键下面（原来静音键的位置）
    const cw = Math.min(66, (W - 16 - side - pad*n) / n), ch = cw*1.18;
    // 36 版：安全区。44 版（用户 2026-11-13：主屏幕全屏打开战斗还是缩小版）：安全区和原有留白重叠着用，不再两个相加 ——
    //   顶部：信息栏本来就离上沿 10～12，有刘海时这段留白算进安全区里（少占 8）；底部：卡片下面的留白 = max(原来的 16, 横条安全区 + 4)（原来是 16 + 安全区）
    // 52 版（用户 2026-11-13：上下安全区里不放任何东西；不同页签顶部的东西不能有高有低）：战斗信息栏和局外各页签顶部一行对齐 —— 都从 安全区下沿 + 10 开始
    //   （44 版为了让格子大一点，把信息栏往安全区里收了 8，结果比营地 / 宠物 / 地图页的顶栏高 8）
    const st = SAFE.t, sbm=SAFE.b;
    // 46 版（用户 2026-11-13 截图：警钟和卡牌中间「为什么这么大空隙」）：原来警钟下沿到卡牌上沿有 0.2 格 + 8 + 14 ≈ 35 的空地，什么都没放。
    //   收到约 13（警钟那一行占 0.75 格，原来 0.9；棋盘和卡槽之间 2，原来 8；卡牌上面的留白 8，原来 14），省下的高度全部给格子。
    const BASE = 0.75, TPAD = 8;
    const trayH = ch + TPAD + Math.max(16, sbm+4), hudH = 92 + st;
    const avail = H - hudH - trayH - 2;
    const cs = Math.min((W-28)/LANES, avail/(COLS+0.45+BASE));
    lay.cs = cs;
    lay.ox = (W-LANES*cs)/2;
    lay.oy = hudH + 0.45*cs + (avail - (COLS+0.45+BASE)*cs)/2;
    lay.bar = {x:0, y:H-trayH, w:W, h:trayH};
    lay.hud = {x:0, y:0, w:W, h:hudH}; lay.hudTop = st;
    lay.toScreen = (lane,p)=>({x: lay.ox+(lane+0.5)*cs, y: lay.oy+(COLS-p)*cs});
    lay.cellRect = (lane,col)=>({x: lay.ox+lane*cs, y: lay.oy+(COLS-1-col)*cs, w:cs, h:cs});
    lay.toCell = (x,y)=>({lane:Math.floor((x-lay.ox)/cs), col:COLS-1-Math.floor((y-lay.oy)/cs)});
    lay.forward = {x:0,y:-1};
    let x = (W - (cw*n + pad*(n-1)))/2;
    DATA.level.loadout.forEach(k=>{ lay.items.push({id:'card', key:k, x, y:H-trayH+TPAD, w:cw, h:ch}); x+=cw+pad; });
    lay.items.push({id:'energy', x:10, y:12+st, w:112, h:36});
    lay.swapBox = {x:10, y:54+st, w:112, h:28};
    const bs = 44;
    lay.items.push({id:'pause', x:W-10-bs, y:10+st, w:bs, h:bs});
    lay.items.push({id:'speed', x:W-10-bs, y:10+bs+8+st, w:bs, h:bs});   // 46 版：静音键去掉，音乐 / 音效开关进暂停界面
    lay.waveBar = {x:W/2-W*0.2, y:56+st, w:W*0.4, h:12};
    lay.shardPos = {x:W/2, y:86+st};
    return lay;
  }
  return lay;
}
const PORT_HMIN = 640, PORT_HMAX = 900;
// 36 版：刘海 / 灵动岛 / 底部横条的安全区（主屏幕全屏打开时才有；Safari 里是 0）。
//   做法照 iOS / 安卓手游通行做法：背景铺满整个屏幕（包括刘海后面），按钮、拖动条、信息栏放在安全区里。
//   SAFE 是设计单位（和 W、H 同一单位）。测试用：网址加 ?safe=59,34 模拟 iPhone 刘海（上 59、下 34 像素）
const SAFE = {t:0, b:0, l:0, r:0};
const SAFE_PROBE = (()=>{ const d=document.createElement('div'); d.style.cssText='position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.appendChild(d); return d; })();
// 44 版（用户 2026-11-13 iPhone 主屏幕全屏：画面底部露出一条 47 像素的深绿底色，底栏没铺到屏幕最底）：
//   iOS 主屏幕全屏 + 状态栏透明时，innerHeight 会少报一个状态栏的高度（797 而不是 844），画布就短了一截。
//   主屏幕全屏时改用 100vh（这种模式下它等于整屏）和 screen.height 里更大的那个；Safari 网页里仍用 innerHeight（那里 100vh 比可见区域高）。
const VH_PROBE = (()=>{ const d=document.createElement('div'); d.style.cssText='position:fixed;left:0;top:0;width:0;height:100vh;visibility:hidden;pointer-events:none'; document.body.appendChild(d); return d; })();
const isStandalone = () => { try{ return navigator.standalone===true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches; }catch(e){ return false; } };
const DBG_VIEW = /[?&]dbg=1/.test(location.search), VIEW_DBG = {};
function viewSize(){
  const iw=window.innerWidth, ih=window.innerHeight, sa=isStandalone(), vh=VH_PROBE.offsetHeight||0, sw=screen.width||0, sh=screen.height||0;
  let rh=ih;
  if(sa){ if(vh>rh) rh=vh; if(navigator.standalone===true && iw===sw && sh>rh && iw<sh) rh=sh; }
  Object.assign(VIEW_DBG, {iw, ih, vh, sw, sh, sa, rw:iw, rh});
  return [iw, rh];
}
const SAFE_FAKE = (()=>{ const m=/[?&]safe=([\d.]+),([\d.]+)/.exec(location.search); return m?{t:+m[1], b:+m[2]}:null; })();
function readSafe(){ const s=getComputedStyle(SAFE_PROBE); const px=k=>parseFloat(s[k])||0;
  return SAFE_FAKE ? {t:SAFE_FAKE.t, b:SAFE_FAKE.b, l:0, r:0} : {t:px('paddingTop'), b:px('paddingBottom'), l:px('paddingLeft'), r:px('paddingRight')}; }   // 34 版：竖屏设计高度范围（宽固定 390）
function resize(){
  // 竖屏按设计宽度 390 等比缩放（手游的标准做法：宽度定死、高度随机型变）：
  // 34 版：设计高度不再固定 844，而是在 PORT_HMIN～PORT_HMAX 之间跟着屏幕比例走 —— 手机浏览器带地址栏 / 工具栏时可见区域比 390:844 宽，
  //        固定 844 会按高度缩小、左右留两大条黑边（用户 2026-11-13 iPhone Safari 实测）。比 PORT_HMIN 还扁才左右留边，比 PORT_HMAX 还长才上下留边。
  const RDPR = Math.min(OPTS.res, window.devicePixelRatio||1), [RW, RH] = viewSize();
  cv.width = Math.round(RW*RDPR); cv.height = Math.round(RH*RDPR);   // 31 版：取整，避免画布被浏览器按小数比例拉伸
  cv.style.width = RW+'px'; cv.style.height = RH+'px';              // 34 版：画布显示尺寸 = 实际可见区域（不用 100vh）
  const kind = orientMode==='auto' ? (RW>=RH?'landscape':'portrait') : orientMode;
  if(kind==='portrait'){ SC = Math.min(RW/390, RH/PORT_HMIN); W = 390; H = Math.max(PORT_HMIN, Math.min(PORT_HMAX, RH/SC)); }
  else { SC = 1; W = RW; H = RH; }
  DPR = Math.min(2.5, RDPR*SC);                 // 每个设计像素对应多少屏幕物理像素（离屏烘焙按这个精度）
  // 45 版（用户 2026-11-13：「所有的按钮包括战斗场景的卡等都应该在这个区域上面，下面只做背景填充延伸」，参照塔塔冒险队：按钮停在底部横条上方，下面只有场景）：
  //   iPhone 主屏幕全屏时，innerHeight 以下那一条（画布比 innerHeight 多出来的部分）整条算进底部安全区 —— 按钮、卡槽、底栏按钮都排在它上面，
  //   这一条只铺背景 / 底栏底色。这样即使 iOS 不画这一条，也不会有按钮被裁掉。
  { const s=readSafe(); if(!SAFE_FAKE && navigator.standalone===true && RH>VIEW_DBG.ih) s.b=Math.max(s.b, RH-VIEW_DBG.ih);
    SAFE.t=s.t/SC; SAFE.b=s.b/SC; SAFE.l=s.l/SC; SAFE.r=s.r/SC; }
  X0PX = (RW - W*SC)/2; Y0PX = (RH - H*SC)/2; SW = RW/SC; X0 = X0PX/SC;
  ctx.setTransform(RDPR*SC,0,0,RDPR*SC,X0PX*RDPR,Y0PX*RDPR);
  L = makeLayout(kind);
}
window.addEventListener('resize', resize);
// 35 版（用户 2026-11-13 iPhone：宠物页往上拖以后画面整体偏到左上、显示不全）：iOS Safari 不认 user-scalable=no，
//   双击 / 双指会放大，拖动也会把页面推走。这里把页面的滚动、缩放手势全部拦掉，游戏自己处理触摸
document.addEventListener('touchmove', e=>{ if(e.touches.length>1 || e.cancelable) e.preventDefault(); }, {passive:false});
for(const ev of ['gesturestart','gesturechange','gestureend','dblclick']) document.addEventListener(ev, e=>e.preventDefault(), {passive:false});
let LAST_TAP=0; document.addEventListener('touchend', e=>{ const t=performance.now(); if(t-LAST_TAP<350 && e.cancelable) e.preventDefault(); LAST_TAP=t; }, {passive:false});   // 双击放大
window.addEventListener('scroll', ()=>{ if(window.scrollX||window.scrollY) window.scrollTo(0,0); }); window.addEventListener('orientationchange', ()=>setTimeout(resize, 200));   // 34 版：iOS 转屏后尺寸晚一点才更新

// ---------- 游戏状态 ----------
let G;
function newGame(){
  if(typeof BANKED!=='undefined') BANKED=false;
  if(typeof RTIP!=='undefined') RTIP=null;
  G = {
    t:0, speed:1, tscale:1, paused:false, over:null,   // 87 版：tscale = 进化演出期间战场减速 50%（render.js frame 里乘上）
    energy: DATA.level.startEnergy,
    pets:[], enemies:[], projs:[], rprojs:[], orbs:[], fx:[], shardsFx:[],
    cells: DATA.level.cells.map(c=>{ const h=c.type==='crate'?(c.hp||PROPS[c.kind].hp):c.hp; return {...c, hp:h, hpNow:h}; }),
    cooldown: Object.fromEntries(DATA.level.loadout.map(k=>[k,0])),
    spawns: buildSpawns(), spawnIdx:0,
    nextSky: DATA.level.skyDrop ? DATA.level.skyDrop.firstAt : 1e9,   // 72 版：夜里的关 skyDrop:null，天上不掉能量（用户 2026-11-14，参照 PvZ 夜晚）
    bells: Array.from({length:LANES}, (_,l)=>laneOn(l)),
    bellsUsed: 0, bossWarn: null,
    swaps: swapMax(), swapCap: swapMax(), swapRegen: 0,   // swapCap：这一局的换位上限（进关时定；通关当场解锁的下一局才生效）
    selected: null,       // 卡 key 或 'shovel'
    drag: null,
    groups: [], links: [],
    fire3Seen: false,
    kills: 0,
    shards: {}, pity: {}, loot: {gold:0, star:0},   // 88 版：打怪掉落的金币 / 星星（胜利时并进结算）
    stats: {placed:0, moved:0},
    started: false,
    tut: (DATA.level.demo || (DATA.level.tut && DATA.level.first)) ? {steps:(DATA.level.demo||DATA.level.tut).map(s=>({...s})), i:0, cur:null, t:0, gap:0} : null,
    demo: !!DATA.level.demo,
    pick: DATA.level.pick ? {on:true, t:0} : null,
    ink:[], mud:[], lobs:[], wave:null, pink:[], pfire:[],   // pink = 93 版喷墨章鱼（宠物）的墨区   // 第3章角色 v1：墨、泥潭、投石、奥库塔的潮浪
  };
  if(G.demo){ G.spawns=[]; G.nextSky=1e9; }   // 演示：怪和能量都按脚本来
  recalcResonance();
}

// ---------- 工具 ----------
const petAt = (lane,col)=>G.pets.find(p=>p.lane===lane&&p.col===col);
const cellAt = (lane,col)=>G.cells.find(c=>c.lane===lane&&c.col===col);
const propAlive = c => !!c && c.type==='crate' && c.hpNow>0;
// 这一路 [from,to] 格里最近的一个完好道具
function propAhead(lane, from, to){ return G.cells.filter(c=>propAlive(c)&&c.lane===lane&&c.col>=from&&c.col<=to).sort((a,b)=>a.col-b.col)[0]; }
function damageProp(c, dmg, byPet){
  if(!propAlive(c)) return;
  c.hpNow-=dmg; c.flash=0.12; const broken=c.hpNow<=0;
  emit('crate',{c,broken,byEnemy:!byPet});
  if(!broken) return;
  c.marked=false;
  if(byPet){ const P=PROPS[c.kind];
    if(P.energy) G.orbs.push({lane:c.lane,p:c.col+0.5,value:P.energy,life:0,fall:0,pop:0.3});
    if(P.shards && DATA.level.boxShard){ const k=DATA.level.boxShard;
      G.shards[k]=(G.shards[k]||0)+P.shards; emit('propShard',{c,key:k,n:P.shards}); } }
  G.fx.push({kind:'pop',lane:c.lane,p:c.col+0.5,t:0,life:0.4,color:'#b07a45'}); recalcResonance();
}
// 近战要不要打道具：道具在攻击范围内，并且被标记了、或者后面有怪（攻击被它挡住）
function meleeProp(pet){ const pr=propAhead(pet.lane,pet.col+1,pet.col+(pet.reach||pet.def.reach)); if(!pr) return null;
  return (pr.marked || G.enemies.some(e=>!e.dead&&e.lane===pet.lane&&e.p>pr.col)) ? pr : null; }
const inGrid = (lane,col)=>lane>=0&&lane<LANES&&col>=0&&col<COLS;
function elemMult(att, def){ if(BEATS[att]===def) return 1.5; if(BEATS[def]===att) return 0.7; return 1; }
function floatText(lane,p,text,color,size){ G.fx.push({kind:'text',lane,p,text,color:color||'#fff',size:size||14,t:0,life:0.9}); }

// ---------- 相邻共鸣 ----------
function recalcResonance(){
  const links=[];
  for(const pet of G.pets){
    if(pet.def.shape==='mine'){ pet.nSame=0; continue; }
    let n=0;
    for(const [dl,dc] of [[0,1],[1,0],[0,-1],[-1,0]]){
      const o = petAt(pet.lane+dl, pet.col+dc);
      if(o && o.def.shape!=='mine' && o.def.el===pet.def.el){ n++; if(dl>0||dc>0) links.push([pet,o]); }
    }
    pet.nSame = n; pet.group = null;
  }
  // 连通片
  const groups=[]; const seen=new Set();
  for(const pet of G.pets){
    if(seen.has(pet)||pet.def.shape==='mine') continue;
    const g=[pet]; seen.add(pet);
    for(let i=0;i<g.length;i++){
      const a=g[i];
      for(const [dl,dc] of [[0,1],[1,0],[0,-1],[-1,0]]){
        const o=petAt(a.lane+dl,a.col+dc);
        if(o&&!seen.has(o)&&o.def.shape!=='mine'&&o.def.el===a.def.el){ seen.add(o); g.push(o); }
      }
    }
    const grp={el:pet.def.el, members:g, size:g.length};
    g.forEach(m=>m.group=grp);
    groups.push(grp);
    if(grp.el==='fire' && grp.size>=3 && !G.fire3Seen){ G.fire3Seen=true; emit('resonance',{grp}); G.fx.push({kind:'banner',text:'火系 3 连共鸣：攻击附带灼烧',t:0,life:2.2,color:EL.fire.color}); }
  }
  G.groups=groups; G.links=links;
}
const groupSize = pet => pet.group ? pet.group.size : 1;
function atkMul(pet){
  let m = 1 + 0.08*(pet.nSame||0);
  const c = cellAt(pet.lane,pet.col);
  if(c && c.type==='flower' && pet.def.el==='grass') m *= 1.2;
  const gp=pet.def.growP; if(gp) m *= 1+gp.k*Math.min(gp.max, Math.floor(Math.max(0,pet.maxHp-pet.hp)/gp.per));   // 93 版：棘皮鲀（宠物）
  return m;
}

// ---------- 放置 / 移动 / 铲除 ----------
function canPlaceAt(lane,col){
  if(!inGrid(lane,col) || !laneOn(lane) || (G.pick && G.pick.on)) return false;
  const ts=tutCur(); if(ts && !(ts.kind==='place' && ts.L===lane && ts.C===col)) return false;   // 教学中：只能放在指定格
  if(petAt(lane,col)) return false;
  const c=cellAt(lane,col); if(c && c.type==='crate' && c.hpNow>0) return false;
  if(mudAt(lane,col)) return false;   // 第3章角色 v1：泥潭里放不了宠物
  return true;
}
function placePet(key,lane,col){
  const def = starDef(key);   // 96 版：带升星补丁的 def
  if(G.energy<def.cost || G.cooldown[key]>0 || !canPlaceAt(lane,col)) return false;
  { const ts=tutCur(); if(ts && ts.key!==key) return false; if(G.demo && !ts) return false; }   // 67 版：演示里只能按提示放，不能自己加宠物（用户加了一只把怪打死，演示卡住）
  G.energy -= def.cost; G.cooldown[key] = def.cd;
  const star=starOf(key);   // 96 版：升星效果全部在 STAR_FX 补丁里
  const hp0 = def.hp;
  const pet={key, def, lane, col, hp:hp0, maxHp:hp0, timer:def.shape==='producer'? def.prodInt*0.5 : (()=>{ const S=def.magnet||def.chime||def.sporeP||def.pluck||def.lights||def.inkP||def.mudP||def.tide; return S ? S.every*0.5 : 0.3; })(),   // 91 版：控场技能放下后先等半个冷却
               stun:0, armT: def.arm||0, flash:0, move:null, star,
               reach: def.reach||0};
  G.pets.push(pet);
  G.stats.placed++; emit('place',{pet});
  recalcResonance();
  return true;
}
function movePet(pet,lane,col){
  if(G.swaps<1 || !inGrid(lane,col) || !laneOn(lane) || (pet.lane===lane&&pet.col===col)) return false;
  { const ts=tutCur(); if(ts && !(ts.kind==='move' && ts.pet===pet && ts.L===lane && ts.C===col)) return false; }
  const c=cellAt(lane,col); if(c && c.type==='crate' && c.hpNow>0) return false;
  if(mudAt(lane,col)) return false;   // 第3章角色 v1：换位进不去泥潭
  const other = petAt(lane,col);
  const go=(p,l,cc)=>{ p.move={fl:p.lane,fc:p.col,t:0}; p.lane=l; p.col=cc; p.stun=Math.max(p.stun,1.5); };
  if(other){ go(other,pet.lane,pet.col); }
  go(pet,lane,col);
  G.swaps--; G.stats.moved++; emit('move',{pet,other,lane,col});
  recalcResonance();
  G.fx.push({kind:'ring',lane,p:col+0.5,t:0,life:0.35,color:'#fff'});
  return true;
}
function shovel(lane,col){
  const pet=petAt(lane,col); if(!pet) return false;
  G.energy += Math.floor(pet.def.cost*0.5);
  floatText(lane,col+0.5,'+'+Math.floor(pet.def.cost*0.5),'#ffe680');
  G.pets.splice(G.pets.indexOf(pet),1); emit('shovel',{pet});
  recalcResonance();
  return true;
}

// ---------- 伤害 ----------
function hitEnemy(e, dmg, el, opts){
  if(e.dead) return;
  const mult = elemMult(el, e.def.el);
  const d = dmg*mult;
  e.hp -= d; e.flash = 0.12;
  if(mult>1) floatText(e.lane,e.p,'克制','#ffd25a',11);
  emit('hit',{e,el,mult,dmg:d,src:opts&&opts.src});
  if(e.def.grow){ const Gr=e.def.grow; e.taken=(e.taken||0)+d; const lv=Math.min(Gr.max, Math.floor(e.taken/Gr.per)); if(lv>(e.lv||0) && e.hp>0){ e.lv=lv; emit('grow',{e,lv}); } }   // 第3章角色 v1：棘皮鲀越打越大
  if(opts && opts.burn){ e.burn = {dps:Math.max(e.burn?e.burn.dps:0, opts.burn.dps), t:opts.burn.t}; }
  if(opts && opts.slow){ const k=opts.slowK||0.85; e.slowK = e.slow>0 ? Math.min(e.slowK||0.85, k) : k; e.slow = Math.max(e.slow||0, opts.slow); }
  if(opts && opts.venom){ const V=opts.venom, fresh=!e.venom, n0=(e.venom&&e.venom.n)||0, n=V.stack ? Math.min(V.stack, n0+1) : 1;   // 97 版：翠颈蛇 3 星毒叠 3 层
    if(!e.venom || V.dps*n>=e.venom.dps){ e.venom={dps:V.dps*n, t:V.t, n}; if(fresh) emit('venom',{e}); else if(V.stack && n>n0) emit('venomStack',{e, n}); } else e.venom.t=Math.max(e.venom.t, V.t); }   // 91 版：翠颈蛇（宠物）的毒
  if(e.hp<=0) killEnemy(e);
}
const LOOT_P = {gold:0.15, star:0.03, goldV:10};   // 88 版：每只怪死亡时的掉落概率；一枚金币 = 10 金币
function killEnemy(e, silent){
  if(e.dead) return; e.dead=true; G.kills++; if(e.def.boss) G.bossWarn=null; emit('death',{e,silent});
  if(e.def.disco){ G.disco=null; G.discoDash=null; }   // 第2章角色 v1
  if(e.def.kraken) G.wave=null;   // 第3章角色 v1：奥库塔倒下，没冲完的潮浪取消
  if(!silent && e.def.ferry && !e.dropped) dropCrew(e, true);   // 船长鹦鹉半路被打下来：蟹在原地落下
  if(!silent && e.lootV && e.lootV.length){ e.lootV.forEach((v,i)=>G.orbs.push({lane:e.lane, p:Math.max(0.3,Math.min(COLS-0.3, e.p+(i-(e.lootV.length-1)/2)*0.35)), value:v, life:0, fall:0, pop:0.3})); emit('lootDrop',{e, n:e.lootV.length}); }
  if(!silent && e.def.spore){ const S=e.def.spore, pets=G.pets.filter(p=>!p.dead&&Math.abs(p.lane-e.lane)<=1&&Math.abs(p.col+0.5-e.p)<=S.dp&&p.def.shape!=='mine');
    pets.forEach(p=>{ p.stun=Math.max(p.stun||0, S.t); p.spored=S.t; }); emit('spore',{e, pets}); }
  G.fx.push({kind:'pop',lane:e.lane,p:e.p,t:0,life:0.4,color:EL[e.def.el].color});
  // 火系 5 连：灼烧死亡传火（灰盒里 5 连很难凑，先实现规则）
  if(e.burn && e.burn.t>0 && e.burnFromGroup5){
    const n = G.enemies.filter(o=>!o.dead&&Math.abs(o.lane-e.lane)<=1&&Math.abs(o.p-e.p)<1.2)[0];
    if(n) n.burn={dps:e.burn.dps,t:3};
  }
  if(!silent && !G.demo){ const r=Math.random(), kind = r<LOOT_P.star ? 'star' : r<LOOT_P.star+LOOT_P.gold ? 'gold' : null;   // 88 版（用户 2026-11-15）：金币 15%、星星 3%
    if(kind){ const v = kind==='gold' ? LOOT_P.goldV : 1; G.loot[kind]+=v; emit('loot',{e, kind, v}); } }
  if(silent || e.summoned || !e.def.drop || !DATA.pets[e.key]) return;   // 65 版：只有能收服成宠物的怪才掉碎片；91 版：全部怪都能，Boss 叫出来的小兵不掉
  // 碎片掉落：看本关角色（drop），带保底 N = 2/p
  const k=e.key, p=e.def.drop, N=Math.round(2/p);
  G.pity[k]=(G.pity[k]||0)+1;
  if(Math.random()<p || G.pity[k]>=N){
    G.pity[k]=0;
    const big = e.def.boss || e.def.disco ? 2 : e.def.role==='elite' ? 1 : 0;   // 91 版：精英必掉 3～5 片，Boss 必掉 5～8 片；普通怪 1～2 片
    const n = big===2 ? 5+Math.floor(Math.random()*4) : big===1 ? 3+Math.floor(Math.random()*3) : (Math.random()<0.5?1:2);
    G.shards[k]=(G.shards[k]||0)+n;
    G.shardsFx.push({lane:e.lane,p:e.p,t:0,life:0.9,n,key:k}); emit('shard',{e,n});
  }
}

// ---------- 攻击出手（前摇结束那一帧）----------
// 近战覆盖「前方 reach 格」：按怪物身体边缘判断，体型大的怪站得远也打得到
function meleeHits(pet){ const R=(pet.furyOn && pet.def.fury && pet.def.fury.reach) || pet.reach || pet.def.reach,   /* 97 版：棘背蜥 3 星发怒后前方 2 格 */ lo=pet.col+0.3, pr=propAhead(pet.lane,pet.col+1,pet.col+R), hi=pr ? pr.col+0.2 : pet.col+1+R;   // 道具挡住：道具后面的怪打不到
  const lanes = pet.def.sweep ? [pet.lane-1,pet.lane,pet.lane+1] : [pet.lane];   // 第2章角色 v1：迅火狐横扫本路和上下相邻两路
  return G.enemies.filter(e=>!e.dead&&lanes.includes(e.lane)&&!isFly(e)&&e.p>=lo&&e.p-e.def.r<=(e.lane===pet.lane?hi:pet.col+1+R)); }
// ===== 第2章角色 v1（_dev，未合并）：通用小工具 =====
const isFly = e => !!e.def.fly && !e.landed;                       // 掠空鸟、巨喙鸟（扑空落地前）：近战打不到、不被挡、不踩响波姆
const isTank = p => p.def.shape==='wall' || !!p.def.tank;          // 能挡住践踏的宠物
function hurtPet(q, dmg){ if(q.dead) return; q.hp-=dmg; q.flash=0.12; if(q.hp<=0){ q.dead=true; G.stats.lost=(G.stats.lost||0)+1; emit('petdeath',{pet:q}); G.fx.push({kind:'pop',lane:q.lane,p:q.col+0.5,t:0,life:0.4,color:'#ccc'}); } }
// ---------- 87 版：进化后的全屏环射（用户 2026-11-15）----------
// 绕自己一周，从正上方开始顺时针一发一发打（屏幕上的方向），round 秒一圈，共 rounds 圈；水弹穿透，每只怪只打一次
function ringStart(pet){ const R=pet.def.evo.ring; pet.ring={t:-0.35, i:0, R}; pet.faceL=false; emit('ringStart',{pet, lead:0.35, per:R.round/R.n}); }
function ringTick(pet, dt){ const B=pet.ring, R=B.R, per=R.round/R.n, total=R.n*R.rounds; B.t+=dt;
  while(B.i<total && B.t>=B.i*per){ ringShot(pet, B.i%R.n, B.i); B.i++; }
  if(B.i>=total && B.t>=total*per+0.2){ pet.ring=null; pet.faceL=false; pet.timer=0.4; emit('ringEnd',{pet}); } }
function ringShot(pet, k, idx){ const R=pet.def.evo.ring, a=-Math.PI/2 + k/R.n*Math.PI*2;   // 屏幕角度：-90° = 正上方，角度变大 = 顺时针
  const sx=Math.cos(a), sy=Math.sin(a), o=L.toScreen(0,0), ul=L.toScreen(1,0), up=L.toScreen(0,1);
  const lx=ul.x-o.x, ly=ul.y-o.y, px=up.x-o.x, py=up.y-o.y, det=lx*py-ly*px;   // 屏幕方向 = vl·(lane 方向) + vp·(p 方向)
  const vl=(sx*py-sy*px)/det, vp=(lx*sy-ly*sx)/det, n=Math.hypot(vl,vp)||1;
  pet.faceL = sx < -0.01 || (Math.abs(sx)<=0.01 && k>R.n/2);   // 打左半圈时转过身朝左
  G.rprojs.push({lane:pet.lane, p:pet.col+0.5, vl:vl/n*R.speed, vp:vp/n*R.speed, dmg:R.dmg*atkMul(pet), el:pet.def.el, src:pet, t:0, ang:a, hit:new Set()});
  emit('ringShot',{pet, ang:a, k, idx}); }
// ===== 91 版：怪物宠物的主动技能 =====
const petInt = pet => pet.def.int*(pet.def.fury && pet.hp<=pet.maxHp*pet.def.fury.at ? pet.def.fury.k : 1);   // 棘背蜥半血后发怒
// 97 版：加速叠加——倍率更高的覆盖（倍率和时间一起换）；倍率相同续时间；更弱的不改（不把强加成拖长）
function addHaste(q, k, t){ if(!(q.haste>0) || k>(q.hasteK||1)){ q.hasteK=k; q.haste=t; } else if(k===(q.hasteK||1)) q.haste=Math.max(q.haste, t); }
const petHasteK = pet => pet.haste>0 ? (pet.hasteK||1.25) : 1;                                               // 铃尾蛇的铃声
const knockable = e => !e.def.boss && !e.def.disco && e.def.role!=='elite';
// 莽角羊冲撞 / 蛮角牛冲锋：dash = {t, d 冲出去的格数, hit 是否已结算, kind}；0.22 秒冲出去、在最远处结算、0.3 秒回来
function petDashTick(pet, dt){ const D=pet.dash; D.t+=dt;
  if(!D.hit && D.t>=0.22){ D.hit=true; const d=pet.def;
    if(D.kind==='ram'){ const t=D.tg, pr=propAhead(pet.lane,pet.col+1,pet.col+1+d.ram.range); if(t && !t.dead && !(pr && t.p>pr.col+0.2)){ hitEnemy(t, d.ram.dmg*atkMul(pet), d.el, {src:pet}); if(!t.dead && knockable(t)) t.p=Math.min(COLS+0.4, t.p+d.ram.knock); const dz=d.ram.daze && !t.dead && !t.def.boss && !t.def.disco; if(dz){ t.daze=Math.max(t.daze||0, d.ram.daze); t.windup=0; } emit('petRamHit',{pet, e:t, daze:dz}); }   /* 97 版：莽角羊 3 星撞中停下 1.5 秒 */ }
    else { const pr=propAhead(pet.lane,pet.col+1,pet.col+d.rush.len), hi=pr ? pr.col+0.2 : 99, hs=G.enemies.filter(e=>!e.dead&&e.lane===pet.lane&&!isFly(e)&&e.p>=pet.col+0.3&&e.p<=hi&&e.p-e.def.r<=pet.col+1+d.rush.len);   // 道具后面的怪打不到
      hs.forEach(e=>{ hitEnemy(e, d.rush.dmg*atkMul(pet), d.el, {src:pet}); if(!e.dead && knockable(e)) e.p=Math.min(COLS+0.4, e.p+d.rush.knock); }); emit('petRushHit',{pet, hits:hs});
      if(d.rush.leech && hs.length && !pet.dead){ const a=Math.min(pet.maxHp-pet.hp, d.rush.leech*hs.length); if(a>0){ pet.hp+=a; emit('petLeech',{pet, amt:a}); } } } }   // 97 版：蛮角牛 3 星每撞一只回 60
  if(D.t>=0.52) pet.dash=null; }
function petSkillTick(pet, dt){ const d=pet.def;
  if(d.gift){ pet.giftT=(pet.giftT??d.gift.every*0.5)-dt; if(pet.giftT<=0){ pet.giftT=d.gift.every; G.orbs.push({lane:pet.lane, p:pet.col+0.5, value:d.gift.v, life:0, fall:0, pop:0.3, produced:true}); emit('petGift',{pet}); } }   // 97 版：灰原喵 3 星每 25 秒自己叼来 25 能量
  if(d.ram || d.rush){ const S=d.ram||d.rush; pet.skT=(pet.skT??S.every*0.5)-dt;
    if(pet.skT<=0){ if(d.ram){ const t=G.enemies.filter(e=>!e.dead&&e.lane===pet.lane&&!isFly(e)&&e.p>pet.col+0.3&&e.p<=pet.col+1+d.ram.range&&e.p<COLS).sort((a,b)=>a.p-b.p)[0];
        const prA=propAhead(pet.lane,pet.col+1,pet.col+1+d.ram.range); if(t && prA && t.p>prA.col+0.2) { pet.skT=0.3; return false; }
        if(t){ pet.skT=S.every; pet.dash={t:0, kind:'ram', tg:t, d:Math.max(0.3, t.p-t.def.r-(pet.col+0.75))}; emit('petRam',{pet, e:t}); return true; } pet.skT=0.3; }
      else { const any=G.enemies.some(e=>!e.dead&&e.lane===pet.lane&&!isFly(e)&&e.p>=pet.col+0.3&&e.p-e.def.r<=pet.col+1+d.rush.len);
        if(any){ pet.skT=S.every; pet.dash={t:0, kind:'rush', d:d.rush.len}; emit('petRush',{pet}); return true; } pet.skT=0.3; } } }
  if(d.shape!=='support' || d.heal) return false;
  const S=d.magnet||d.chime||d.sporeP||d.pluck||d.lights||d.inkP||d.mudP||d.tide; pet.timer-=dt; if(pet.timer>0) return false;
  pet.timer=S.every;
  if(d.magnet){ const o=G.orbs.filter(o=>!o.got&&!(o.fall>0)&&Math.abs(o.lane-pet.lane)<=d.magnet.dl&&Math.abs(o.p-(pet.col+0.5))<=d.magnet.dp)[0];
    if(o){ emit('petMagnet',{pet, o}); collectOrb(o); } else pet.timer=0.3; }
  else if(d.chime){ const list=G.pets.filter(q=>!q.dead&&Math.abs(q.lane-pet.lane)<=1&&Math.abs(q.col-pet.col)<=(d.chime.dp||1)&&q.def.shape!=='mine');   // 97 版：铃尾蛇 3 星 5×3
    list.forEach(q=>addHaste(q, d.chime.k, d.chime.t)); emit('petChime',{pet, list}); }
  else if(d.sporeP){ const list=G.enemies.filter(e=>!e.dead&&!e.def.boss&&!e.def.disco&&Math.abs(e.lane-pet.lane)<=d.sporeP.dl&&Math.abs(e.p-(pet.col+0.5))<=d.sporeP.dp);
    if(list.length){ const V=d.sporeP.venom; list.forEach(e=>{ e.daze=Math.max(e.daze||0, d.sporeP.t); if(V && (!e.venom || e.venom.dps<=V.dps)){ const fresh=!e.venom; e.venom={dps:V.dps, t:V.t, n:1}; if(fresh) emit('venom',{e}); } }); emit('petSpore',{pet, list}); }   /* 97 版：伞顶蛇 3 星孢子带毒 */ else pet.timer=0.5; }
  else if(d.pluck){ const t=G.enemies.filter(e=>!e.dead&&e.lane===pet.lane&&e.p>pet.col+0.3&&e.p<COLS&&(knockable(e) || (d.pluck.elite && e.def.role==='elite' && !e.def.boss && !e.def.disco))).sort((a,b)=>a.p-b.p)[0];   // 97 版：巨喙鸟 3 星精英也叼得走
    if(t){ emit('petPluck',{pet, e:t}); killEnemy(t, true); } else pet.timer=0.5; }   // 叼走不算击杀掉落：不掉金币、碎片（否则每 20 秒稳定刷碎片）
  else if(d.lights){ const list=G.enemies.filter(e=>!e.dead&&e.p<COLS&&!e.def.boss&&!e.def.disco).sort((a,b)=>a.p-b.p).slice(0,d.lights.n);
    if(list.length){ list.forEach(e=>{ e.daze=Math.max(e.daze||0, d.lights.t); e.danceT=d.lights.t; }); const P=d.lights.party;
      if(P) G.pets.forEach(q=>{ if(!q.dead && q.def.shape!=='mine') addHaste(q, P.k, P.t); });   // 97 版：巴隆 3 星开灯时全场宠物攻速 +30%
      emit('petLights',{pet, list, party:!!P}); } else pet.timer=0.5; }
  else if(d.inkP){ const D=d.inkP, any=G.enemies.some(e=>!e.dead&&e.lane===pet.lane&&e.p>pet.col+0.3&&e.p<=pet.col+1+D.len);   // 93 版：喷墨章鱼（宠物）
    if(any){ const ls=D.dl ? [pet.lane-1,pet.lane,pet.lane+1].filter(l=>l>=0&&l<LANES&&laneOn(l)) : [pet.lane];   // 97 版：喷墨章鱼 3 星墨盖本路和上下两路
      ls.forEach(l=>{ const z={lane:l, c0:pet.col+1, c1:Math.min(COLS,pet.col+1+D.len), until:G.t+D.t, k:D.k}; G.pink.push(z); emit('petInk',{pet, z, silent:l!==pet.lane}); }); } else pet.timer=0.5; }
  else if(d.mudP){ const D=d.mudP, t=G.enemies.filter(e=>!e.dead&&e.lane===pet.lane&&!isFly(e)&&e.p>pet.col+0.3&&e.p<=pet.col+1+D.dist).sort((a,b)=>a.p-b.p)[0];   // 93 版：泥跃鱼（宠物）
    if(t){ const at=t.p, list=G.enemies.filter(e=>!e.dead&&e.lane===pet.lane&&!isFly(e)&&Math.abs(e.p-at)<=0.5+e.def.r*0.5);
      list.forEach(e=>{ e.held=Math.max(e.held||0, knockable(e)?D.t:D.big); e.windup=0; }); emit('petMud',{pet, at, list});
      if(D.floor){ const c=Math.max(0, Math.min(COLS-1, Math.floor(at))); G.pink.push({lane:pet.lane, c0:c, c1:c+1, from:G.t+0.3, until:G.t+0.3+D.floor.t, k:D.floor.k, mud:true}); } } else pet.timer=0.5; }   // 97 版：泥跃鱼 3 星落点留泥地 4 秒，经过的敌人变慢 40%
  else if(d.tide){ const D=d.tide, list=G.enemies.filter(e=>!e.dead&&(D.all||Math.abs(e.lane-pet.lane)<=1)&&e.p<COLS+0.2);   // 97 版：奥库塔 3 星全场   // 93 版：奥库塔（宠物）
    if(list.length){ emit('petTide',{pet, list}); list.forEach(e=>{ hitEnemy(e, D.dmg*atkMul(pet), d.el, {src:pet}); if(!e.dead && knockable(e)) e.p=Math.min(COLS+0.4, e.p+D.push); }); } else pet.timer=0.5; }
  return false;
}
function petRelease(pet){
  const d=pet.def;
  if(d.shape==='shooter' && d.snipe){   // 91 版：掠空鸟俯冲打本路最远的敌人（飞行的也打得到）
    const rc=inkAt(pet.lane,pet.col) ? pet.col+1+INK_REACH : 1e9, t=G.enemies.filter(e=>!e.dead&&e.lane===pet.lane&&e.p>pet.col+0.3&&e.p<COLS+0.3&&e.p-e.def.r<=rc).sort((a,b)=>b.p-a.p)[0];   // 93 版：墨里只打 1.5 格内
    const pass = t && d.pass ? G.enemies.filter(e=>!e.dead&&e!==t&&e.lane===pet.lane&&e.p>pet.col+0.3&&e.p<t.p) : [];   // 97 版：掠空鸟 3 星俯冲路过的敌人各受 50%
    emit('snipe',{pet, e:t||null, pass}); if(t) hitEnemy(t, d.dmg*atkMul(pet), d.el, {src:pet}); pass.forEach(e=>hitEnemy(e, d.dmg*d.pass*atkMul(pet), d.el, {src:pet}));
    return;
  }
  if(d.shape==='shooter' && (d.spit || d.lob)){   // 91 版：绿莱姆粘液弹（减速）、长信翁抛物线（越过道具）
    const lanes = d.lob3 ? [pet.lane-1,pet.lane,pet.lane+1].filter(l=>l>=0&&l<LANES&&laneOn(l)) : [pet.lane];   // 97 版：长信翁 3 星同时朝本路和上下两路各抛一颗
    for(const ln of lanes){ const tg = d.lob ? G.enemies.filter(e=>!e.dead&&e.lane===ln&&e.p>pet.col+0.3&&e.p<COLS+0.3).sort((a,b)=>a.p-b.p)[0] : null;
      if(ln!==pet.lane && !tg) continue;   // 旁路没有敌人就不抛
      G.projs.push({lane:ln, lane0:pet.lane, p:pet.col+0.8, speed:d.projSpeed, dmg:d.dmg*atkMul(pet), el:d.el, src:pet, maxP: d.spit && inkAt(pet.lane,pet.col) ? pet.col+1+INK_REACH+0.1 : 0,   // 93 版：粘液弹也受墨限制；长信翁抛物线越过墨
        slow: d.spit ? d.spit.t : d.soak ? d.soak.t : 0, slowK: d.spit ? d.spit.k : d.soak ? d.soak.k : 0, lob: d.lob ? {tg, p0:pet.col+0.8} : null,
        pierce: d.spit&&d.spit.pierce||0, pk: d.spit&&d.spit.pk||1}); }   // 97 版：绿莱姆 3 星粘液弹穿透 2 个
    emit('shoot',{pet});
    return;
  }
  if(d.shape==='shooter' && d.toss){   // 第 3 章：炮台龟（宠物）投石打本路最靠后的地面敌人；船长鹦鹉（宠物）丢蟹打最近的
    const ts = d.toss.near ? G.enemies.filter(e=>!e.dead&&e.lane===pet.lane&&(d.toss.air||!isFly(e))&&e.p>pet.col+0.3&&e.p<COLS+0.2).sort((x,y)=>x.p-y.p).slice(0,1) : lobTargets(pet, d.toss.n||1);   // 97 版：船长鹦鹉 3 星能丢飞行的；炮台龟 3 星投最靠后的 2 只
    ts.forEach((t,i)=>G.lobs.push({side:'p', lane:pet.lane, from:pet.col+0.6, e:t, to:t.p, t:-0.12*i, dur:d.toss.fly, dmg:d.dmg*atkMul(pet), el:d.el, src:pet}));
    if(ts.length) emit('lobStart',{pet});
    return;
  }
  if(d.shape==='shooter'){
    const maxP = inkAt(pet.lane,pet.col) ? pet.col+1+INK_REACH+0.1 : 1e9;   // 第 3 章：墨里的远程只打得到 1.5 格内
    G.projs.push({maxP,lane:pet.lane,p:pet.col+0.8,speed:d.projSpeed,dmg:d.dmg*atkMul(pet)*(pet.evo&&d.evo?d.evo.dmgMul:1),el:d.el,src:pet,
                  slow: pet.group&&pet.group.el==='water'&&pet.group.size>=3 ? 2 : 0, splash:d.splash||null}); emit('shoot',{pet});   // 96 版：3 星溅射
    if(d.double && !pet.second) pet.again=0.22;   // 2 星：每次连发 2 颗水弹（vfx-design.md 9.1）
    pet.second=false;
  } else if(d.shape==='melee'){
    let hits=meleeHits(pet); const prop=meleeProp(pet); pet.swing=0.18;
    if(d.clamp){ hits=hits.filter(e=>e.lane===pet.lane).sort((a,b)=>a.p-b.p).slice(0,d.clamp.n||1);   /* 97 版：岩钳蟹 3 星钳 2 只 */ hits.forEach(e=>{ e.held=Math.max(e.held||0, knockable(e)?d.clamp.t:d.clamp.big);   /* 96 版：Boss 也按 big 算（原来只看精英，Boss 被钳满 1.5 秒，和描述不符） */ e.windup=0; }); }   // 第3章角色 v1：岩钳蟹（宠物）只钳最近的一个
    let burn = d.burn || null;
    let pk = 1; if(d.pack){ const n=Math.min(d.pack.max, G.pets.filter(q=>q!==pet&&!q.dead&&q.key===pet.key&&(d.pack.adj?Math.abs(q.lane-pet.lane)<=1:q.lane===pet.lane)).length);   /* 97 版：尖角虫 3 星相邻路也算 */ pk=1+d.pack.k*n; }   // 91 版：尖角虫同路加成
    let heavy = false; if(d.heavy4 && hits.length){ pet.bites=(pet.bites||0)+1; if(pet.bites%4===0) heavy=true; }   // 73 版：火牙犬 2 星，每第 4 口变重咬（伤害 ×2，击退 0.5 格）
    if(pet.group && pet.group.el==='fire' && pet.group.size>=3) burn = {dps:Math.max(4,(burn||{}).dps||0), t:3};
    emit('melee',{pet,hits,prop,heavy});   // 出手时目标走开了也照样挥空（动画已经播了）
    let bigZ=false; if(d.bigZap && hits.length){ pet.zaps=(pet.zaps||0)+1; bigZ = pet.zaps%d.bigZap.every===0; }   // 97 版：飘电水母 3 星每第 3 次攻击放大电
    if(d.zap && hits.length){ const B=d.bigZap, Z=bigZ ? {n:99, dmg:B.dmg, t:B.t, r:B.r} : d.zap, h0=hits[0], others=G.enemies.filter(e=>!e.dead&&!hits.includes(e)&&(bigZ ? Math.hypot(e.lane-h0.lane, e.p-h0.p)<=Z.r : Math.abs(e.lane-h0.lane)<=1&&Math.abs(e.p-h0.p)<=Z.r)).sort((a,b)=>Math.abs(a.p-h0.p)-Math.abs(b.p-h0.p)).slice(0,Z.n);   // 93 版：飘电水母（宠物）
      if(bigZ) hits.forEach(e=>{ if(!e.def.boss && !e.def.disco) e.daze=Math.max(e.daze||0, Z.t); });
      if(others.length || bigZ){ emit('petZap',{pet, from:h0, list:others, big:bigZ}); others.forEach(e=>{ hitEnemy(e, Z.dmg*atkMul(pet), d.el, {src:pet}); if(!e.dead && !e.def.boss && !e.def.disco) e.daze=Math.max(e.daze||0, Z.t); }); } }
    if(prop) damageProp(prop, d.dmg*atkMul(pet), true);
    if(d.fireFloor){ const F=d.fireFloor, R=pet.reach||d.reach, pr2=propAhead(pet.lane,pet.col+1,pet.col+R), c1=pr2 ? pr2.col : Math.min(COLS, pet.col+1+R);   // 96 版：喷火蜥 3 星地面留火（道具后面不留）
      const z=G.pfire.find(z=>z.src===pet); if(z){ Object.assign(z, {lane:pet.lane, c0:pet.col+1, c1, until:G.t+F.t, dps:d.dmg*F.k*atkMul(pet)}); } else G.pfire.push({src:pet, lane:pet.lane, c0:pet.col+1, c1, until:G.t+F.t, t0:G.t, dps:d.dmg*F.k*atkMul(pet), el:d.el}); }
    let leech=0; const dazed=[], bumped=[];
    hits.forEach(e=>{ const hp0=e.hp; hitEnemy(e,d.dmg*atkMul(pet)*(heavy?2:1)*pk,d.el,{burn,src:pet,venom:d.venom||null}); if(d.leech) leech+=Math.max(0, hp0-Math.max(0,e.hp))*d.leech; if(heavy && !e.dead && !e.def.boss) e.p=Math.min(COLS+0.4, e.p+0.5);
      if(d.knock && !e.dead && knockable(e)){ e.p=Math.min(COLS+0.4, e.p+d.knock);
        if(d.bump){ const B=d.bump; G.enemies.forEach(o=>{ if(o!==e&&!o.dead&&o.lane===e.lane&&!isFly(o)&&!hits.includes(o)&&!bumped.includes(o)&&o.p>=e.p-0.2&&o.p<=e.p+B.r){ bumped.push(o); hitEnemy(o, B.dmg*atkMul(pet), d.el, {src:pet}); if(!o.dead && knockable(o)) o.p=Math.min(COLS+0.4, o.p+B.push); } }); } }   // 97 版：铁盔鱼 3 星顶回的敌人撞到身后 1 格内的敌人
      if(d.slamDaze && !e.dead && !e.def.boss && !e.def.disco){ e.daze=Math.max(e.daze||0, d.slamDaze); e.windup=0; dazed.push(e); }   // 97 版：格鲁姆 3 星拍中停下 1 秒
      if(pet.group&&pet.group.size>=5&&pet.group.el==='fire') e.burnFromGroup5=true; });
    if(bumped.length) emit('petBump',{pet, list:bumped});
    if(dazed.length) emit('petDaze',{pet, list:dazed});
    if(leech>=1 && !pet.dead){ const a=Math.min(pet.maxHp-pet.hp, Math.round(leech)); if(a>0){ pet.hp+=a; emit('petLeech',{pet, amt:a}); } }   // 97 版：棘皮鲀 3 星吸血 30%
  }
}

// ---------- 开战前选上阵（73 版）----------
function pickToggle(k){
  const lo=DATA.level.loadout, i=lo.indexOf(k);
  if(i>=0){ if(lo.length<=1){ emit('deny',{key:k}); return false; } lo.splice(i,1); }
  else { if(lo.length>=6){ emit('deny',{key:k}); return false; } lo.push(k); G.cooldown[k]=0; }
  L = makeLayout(L.kind); emit('ui'); return true;
}
function pickDone(){
  if(!G.pick || !G.pick.on) return; const lo=DATA.level.loadout;
  lo.sort((a,b)=>PET_ORDER.indexOf(a)-PET_ORDER.indexOf(b)); L = makeLayout(L.kind);
  for(const k of lo) if(G.cooldown[k]==null) G.cooldown[k]=0;
  PROFILE.loadout=lo.slice(); PROFILE.tipPick=1; profileSave(); G.pick.on=false; emit('start');
}

// ===== 第2章角色 v1（_dev，未合并）：每只新怪的机制（_dev/第2章角色/v1/说明.md）=====
// 返回 true = 这一帧不走、不咬
function ch2Tick(e, dt){
  const D=e.def;
  if(D.steal && e.p<COLS){   // 灰原喵：叼走离它最近的一颗没收的能量
    e.stT=(e.stT??2.5)-dt; e.lootV=e.lootV||[];
    if(e.stT<=0 && e.lootV.length<D.steal.max){
      const o=G.orbs.filter(o=>!o.got&&!(o.fall>0)&&o.life>=D.steal.minAge).sort((a,b)=>(Math.abs(a.lane-e.lane)+Math.abs(a.p-e.p))-(Math.abs(b.lane-e.lane)+Math.abs(b.p-e.p)))[0];
      if(o){ o.got=true; e.lootV.push(o.value); e.stT=D.steal.every; emit('steal',{e,o}); } else e.stT=0.4; } }
  if(D.ring){   // 铃尾蛇：摇铃，附近的怪加速
    if(e.rgStop>0){ e.rgStop-=dt; return true; }
    e.rgT=(e.rgT??3)-dt;
    if(e.rgT<=0 && e.p<COLS){ e.rgT=D.ring.every; e.rgStop=D.ring.stop; const list=G.enemies.filter(o=>o!==e&&!o.dead&&Math.abs(o.lane-e.lane)<=1&&Math.abs(o.p-e.p)<=D.ring.dp);
      list.forEach(o=>{ o.haste=D.ring.t; }); emit('ring',{e,list}); return true; } }
  if(D.healAura){   // 菇背羊：给附近的怪回血
    if(e.hlStop>0){ e.hlStop-=dt; return true; }
    e.hlT=(e.hlT??2.5)-dt;
    if(e.hlT<=0 && e.p<COLS){ e.hlT=D.healAura.every; e.hlStop=D.healAura.stop; const list=G.enemies.filter(o=>!o.dead&&Math.abs(o.lane-e.lane)<=1&&Math.abs(o.p-e.p)<=D.healAura.dp&&o.hp<o.maxHp);
      list.forEach(o=>{ o.hp=Math.min(o.maxHp, o.hp+D.healAura.amt); }); emit('mheal',{e,list}); return true; } }
  if(D.grab && !e.landed){   // 巨喙鸟：盯上本路最贵的宠物 → 盘旋 → 叼走；目标换走了就扑空落地
    const ok = p => p && !p.dead && G.pets.includes(p);
    if(e.hov!=null){ const g=e.gt;
      if(!ok(g) || g.lane!==e.gtL || g.col!==e.gtC){ e.hov=null; e.gt=null; e.landed=true; e.daze=1.2; emit('grabMiss',{e}); return true; }
      e.hov+=dt; e.p += ((g.col+0.55)-e.p)*Math.min(1,dt*6);
      if(e.hov>=D.grab.hover){ g.dead=true; G.stats.lost=(G.stats.lost||0)+1; emit('grab',{e,pet:g}); e.dead=true; e.escaped=true; recalcResonance(); }
      return true; }
    if(e.p<COLS){ const cand=G.pets.filter(p=>!p.dead&&p.lane===e.lane&&p.def.shape!=='mine'&&p.col+0.5<e.p).sort((a,b)=>b.def.cost-a.def.cost||b.col-a.col);
      e.gt = cand[0] || null;
      if(e.gt && e.p<=e.gt.col+0.75){ e.hov=0; e.gtL=e.gt.lane; e.gtC=e.gt.col; emit('lock',{e,pet:e.gt}); return true; } } }
  if(D.disco) return discoTick(e, dt);
  return false;
}
// 巴隆（第 2 章 Boss）：舞池灯光、伴舞、节拍冲刺（践踏在怪物循环里，和蛮角牛共用）
function discoTick(e, dt){
  const B=e.def.disco; if(!e.ds) e.ds={light:B.light*0.4, dance:B.dance*0.5, dash:B.dash*0.75, pose:0, dsh:null};
  const s=e.ds, R=!!e.rage;
  if(G.disco){ const d=G.disco; d.t+=dt; if(d.phase==='warn' && d.t>=B.warn){ d.phase='on'; d.t=0; emit('discoOn',{e}); } else if(d.phase==='on' && d.t>=B.on) G.disco=null; }
  else if((s.light-=dt)<=0){ s.light=R?B.lightRage:B.light; const n=R?B.nRage:B.n;
    const all=[]; for(const l of DATA.level.lanes) for(let c=0;c<COLS;c++) if(!propAlive(cellAt(l,c))) all.push([l,c]);
    const shuf=a=>a.map(x=>[Math.random(),x]).sort((p,q)=>p[0]-q[0]).map(x=>x[1]);
    const withPet=shuf(all.filter(([l,c])=>{ const p=petAt(l,c); return p && !p.dead && p.def.shape!=='mine'; })), pick=withPet.slice(0, Math.ceil(n*0.75));
    for(const c of shuf(all)){ if(pick.length>=n) break; if(!pick.some(q=>q[0]===c[0]&&q[1]===c[1])) pick.push(c); }
    G.disco={cells:pick, phase:'warn', t:0, hue:Math.floor(Math.random()*4)}; emit('discoWarn',{e, cells:pick}); }
  if(s.pose>0){ s.pose-=dt; if(s.pose<=0){ const def=DATA.enemies.goat;
      for(const [l,dp] of [[e.lane-1,0],[e.lane+1,0],[e.lane,0.9]]) if(laneOn(l)){ const m={key:'goat', def, lane:l, p:Math.min(COLS+0.4, e.p+dp), hp:def.hp, maxHp:def.hp, atkT:0, flash:0, burn:null, slow:0, summoned:true}; G.enemies.push(m); emit('spawn',{e:m}); }
      emit('discoDancers',{e}); }
    return true; }
  if(s.dsh){ const q=s.dsh; q.t+=dt;
    if(q.beat<4){ if(q.t>=B.beat){ q.t=0; q.beat++; G.discoDash.beat=q.beat; if(q.beat<4) emit('discoBeat',{e, beat:q.beat+1}); else emit('discoDash',{e}); } return true; }
    const old=e.p, np=Math.max(q.to, q.from-(q.from-q.to)*Math.min(1,q.t/0.4));
    const hit=G.pets.filter(p=>!p.dead&&p.lane===e.lane&&p.def.shape!=='mine'&&p.col+1+e.def.r*0.6>=np&&p.col+1+e.def.r*0.6<=old+0.01).sort((a,b)=>b.col-a.col);
    let stop=false; for(const p of hit){ if(q.done.has(p)) continue; q.done.add(p); emit('trample',{e,pet:p,dash:true}); hurtPet(p, B.dashDmg); if(isTank(p) && !p.dead){ e.p=p.col+1+e.def.r*0.6; stop=true; break; } }
    if(!stop) e.p=np;
    if(stop || q.t>=0.4){ s.dsh=null; G.discoDash=null; }
    return true; }
  s.dance-=dt; s.dash-=dt;
  if(s.dance<=0 && !(e.windup>0)){ s.dance=R?B.danceRage:B.dance; s.pose=B.pose; emit('discoPose',{e}); return true; }
  if(s.dash<=0 && !(e.windup>0) && e.p>1.4 && e.p<COLS){ s.dash=R?B.dashRage:B.dash; const to=Math.max(0.6, e.p-B.dashLen);
    s.dsh={beat:0, t:0, from:e.p, to, done:new Set()}; G.discoDash={lane:e.lane, from:e.p, to, beat:0}; emit('discoBeat',{e, beat:1}); return true; }
  return false;
}

// ===== 第3章角色 v1（_dev，未合并）：每只新怪的机制（_dev/第3章角色/v1/说明.md）=====
const INK_REACH = 1.5;
const inkAt = (lane,col) => G.ink.some(c=>c.lane===lane&&c.col===col&&c.until>G.t);
const mudAt = (lane,col) => !!G && !!G.mud && G.mud.some(c=>c.lane===lane&&c.col===col&&G.t>=c.from&&c.until>G.t);
function addInk(cells, t){ for(const [l,c] of cells){ const o=G.ink.find(q=>q.lane===l&&q.col===c); if(o) o.until=Math.max(o.until, G.t+t); else G.ink.push({lane:l, col:c, until:G.t+t, t0:G.t}); } }
// 把宠物往后推 1 格（铁盔鱼、潮浪）；推不动时多受 extra 伤害。返回是否推动了
function pushPet(q, dmg, extra){
  const to=q.col-1, c=cellAt(q.lane,to), ok = to>=0 && !petAt(q.lane,to) && !(c && c.type==='crate' && c.hpNow>0) && !mudAt(q.lane,to);
  if(ok){ q.move={fl:q.lane, fc:q.col, t:0}; q.col=to; q.stun=Math.max(q.stun||0, 0.4); recalcResonance(); }
  hurtPet(q, ok ? dmg : dmg+extra); return ok;
}
function lobTargets(pet, n){ const air=pet.def.toss&&pet.def.toss.air; return G.enemies.filter(e=>!e.dead&&e.lane===pet.lane&&(air||!isFly(e))&&e.p>pet.col+0.3&&e.p<COLS+0.2).sort((a,b)=>b.p-a.p).slice(0,n); }
function lobTarget(pet){ return lobTargets(pet,1)[0] || null; }
function spawnAt(key, lane, p, extra){ const def=DATA.enemies[key]; const m=Object.assign({key, def, lane, p, hp:def.hp, maxHp:def.hp, atkT:0, flash:0, burn:null, slow:0, summoned:true}, extra||{}); G.enemies.push(m); emit('spawn',{e:m}); return m; }
function dropCrew(e, shot){ e.dropped=true; const p=Math.max(0.4, Math.min(COLS-0.2, e.p)); const c=spawnAt(e.def.ferry.key, e.lane, p, {fall:0.45}); emit('ferryDrop',{e, crab:c, shot:!!shot}); }
// 返回 true = 这一帧不走、不咬
function ch3Tick(e, dt){
  const D=e.def;
  if(e.fall>0){ e.fall-=dt; if(e.fall<=0) emit('land',{e}); return true; }   // 被船长鹦鹉丢下来的蟹：落地前不动
  if(e.lmv && !D.boss){ e.lmv.t+=dt; if(e.lmv.t>=D.side.t) e.lmv=null; else return true; }   // 岩钳蟹横爬中
  if(D.side && e.p<COLS){   // 岩钳蟹：每走 2 格，横爬到相邻、宠物少的一路
    if(e.sdFrom==null) e.sdFrom=e.p;
    if(e.sdFrom-e.p>=D.side.every && !e.blocked){ const busy=l=>G.pets.filter(p=>!p.dead&&p.lane===l).length, opts=[e.lane-1,e.lane+1].filter(laneOn).sort((a,b)=>busy(a)-busy(b)||Math.random()-0.5);
      e.sdFrom=e.p; if(opts.length){ e.lmv={from:e.lane, t:0}; e.lane=opts[0]; e.windup=0; emit('sidestep',{e}); return true; } } }
  if(D.ink){   // 喷墨章鱼：本路前方 3 格盖墨
    if(e.inkStop>0){ e.inkStop-=dt; return true; }
    e.inkT=(e.inkT??3)-dt;
    if(e.inkT<=0 && e.p<COLS-0.3){ e.inkT=D.ink.every; const cells=[]; for(let k=1;k<=D.ink.len;k++){ const c=Math.floor(e.p)-k; if(c>=0) cells.push([e.lane,c]); }
      if(cells.length){ addInk(cells, D.ink.t); e.inkStop=D.ink.stop; emit('ink',{e, cells}); return true; } } }
  if(D.mud){   // 泥跃鱼：往前方 2 格甩泥
    if(e.mdStop>0){ e.mdStop-=dt; return true; }
    e.mdT=(e.mdT??3)-dt;
    if(e.mdT<=0 && e.p<COLS-0.3){ e.mdT=D.mud.every; const c=Math.floor(e.p)-D.mud.dist;
      if(c>=0){ const o=G.mud.find(q=>q.lane===e.lane&&q.col===c); if(o) o.until=G.t+0.35+D.mud.t; else G.mud.push({lane:e.lane, col:c, from:G.t+0.35, until:G.t+0.35+D.mud.t}); e.mdStop=D.mud.stop; emit('mudThrow',{e, lane:e.lane, col:c}); return true; } } }
  if(D.lob && e.p<=D.lob.stopAt){   // 炮台龟：停下来，朝本路最后排的宠物投石
    const tg=G.pets.filter(p=>!p.dead&&p.lane===e.lane&&p.def.shape!=='mine'&&p.col+0.5<e.p).sort((a,b)=>a.col-b.col)[0];
    if(tg){ e.lbT=(e.lbT??1.0)-dt; e.blocked=true;
      if(e.lbT<=0){ e.lbT=D.lob.every; G.lobs.push({side:'e', lane:e.lane, from:e.p-0.2, to:tg.col+0.5, pet:tg, t:0, dur:D.lob.fly, dmg:D.lob.dmg, src:e}); emit('lobStart',{e}); }
      return true; } }
  if(D.ferry){   // 船长鹦鹉：把蟹丢到最前排宠物身后，然后飞走
    if(e.leave){ e.p+=0.9*dt; if(e.p>COLS+0.8){ e.dead=true; e.escaped=true; } return true; }
    if(!e.dropped && e.p<COLS){ const front=G.pets.filter(p=>!p.dead&&p.lane===e.lane&&p.def.shape!=='mine').sort((a,b)=>b.col-a.col)[0];
      const at = front ? Math.max(0.5, front.col+0.5-D.ferry.behind) : 3.5;
      if(e.p<=at){ dropCrew(e); e.leave=true; return true; } } }
  if(D.kraken) return krakenTick(e, dt);
  return false;
}
// 奥库塔（第 3 章 Boss）：墨潮、潮浪、召集船员
function krakenTick(e, dt){
  const K=e.def.kraken, R=!!e.rage; if(!e.ks) e.ks={ink:K.ink*0.4, wave:K.wave*0.55, crew:K.crew*0.75, stop:0};
  const s=e.ks;
  if(s.stop>0){ s.stop-=dt; return true; }
  if(e.p>=COLS-0.2) return false;
  s.ink-=dt; s.wave-=dt; s.crew-=dt;
  if(s.ink<=0 && !(e.windup>0)){ s.ink=R?K.inkRage:K.ink; const cells=[];
    for(const l of [e.lane-1,e.lane,e.lane+1]) if(laneOn(l)) for(let k=1;k<=K.inkLen;k++){ const c=Math.floor(e.p)-k; if(c>=0) cells.push([l,c]); }
    addInk(cells, K.inkT); s.stop=K.stop; emit('krInk',{e, cells}); return true; }
  if(s.wave<=0 && !G.wave){ s.wave=R?K.waveRage:K.wave; const n=R?K.nWaveRage:K.nWave, busy=l=>G.pets.filter(p=>!p.dead&&p.lane===l).length;
    const lanes=DATA.level.lanes.slice().sort((a,b)=>busy(b)-busy(a)||Math.random()-0.5).slice(0,n).sort((a,b)=>a-b);
    G.wave={lanes, phase:'warn', t:0, hit:new Set()}; emit('krWaveWarn',{e, lanes}); }
  if(s.crew<=0 && !(e.windup>0)){ s.crew=R?K.crewRage:K.crew; s.stop=1.0;
    const ls=[e.lane-1,e.lane+1].map(l=>laneOn(l)?l:e.lane); for(const l of ls) spawnAt('parrot', l, COLS+0.4);
    emit('krCrew',{e}); return true; }
  return false;
}
function waveTick(dt){   // 奥库塔的潮浪：预警 → 海浪从右往左冲过标出的几路
  const w=G.wave, K=DATA.enemies.kraken.kraken; w.t+=dt;
  if(w.phase==='warn'){ if(w.t>=K.warn){ w.phase='go'; w.t=0; emit('krWave',{lanes:w.lanes}); } return; }
  const front = COLS+0.5-(COLS+1.5)*Math.min(1,w.t/K.sweep);
  for(const q of G.pets.slice()){ if(q.dead || !w.lanes.includes(q.lane) || w.hit.has(q) || q.col+0.5<front) continue;
    w.hit.add(q); const pushed=pushPet(q, K.waveDmg, 60); emit('waveHit',{pet:q, pushed}); }
  if(w.t>=K.sweep) G.wave=null;
}

// ---------- Boss（70 版，关卡设计.md「Boss 棕熊」）----------
// 换路：目标路亮红 warn 秒 → 0.6 秒横移过去（期间不走不咬）；吼叫：停 roarT 秒，结束时左右两路各出 2 只绿莱姆；半血后间隔缩短
function bossTick(e, dt){
  const B=e.def.boss; if(!e.bs) e.bs={sw:B.switchEvery*0.6, roar:B.roarEvery*0.75, warn:null, roarLeft:0};
  const s=e.bs;
  if(e.lmv){ e.lmv.t+=dt; if(e.lmv.t>=0.6) e.lmv=null; else return true; }
  if(s.roarLeft>0){ s.roarLeft-=dt;
    if(s.roarLeft<=0){ for(const l of [e.lane-1,e.lane+1]) if(laneOn(l)) for(const dp of [0.3,1.0]){ const def=DATA.enemies.slime;
        const m={key:'slime', def, lane:l, p:Math.min(COLS+0.4, e.p+dp), hp:def.hp, maxHp:def.hp, atkT:0, flash:0, burn:null, slow:0, summoned:true}; G.enemies.push(m); emit('spawn',{e:m}); } }
    return true; }
  if(s.warn){ s.warn.t-=dt;
    if(s.warn.t<=0){ const to=s.warn.lane; s.warn=null; G.bossWarn=null;
      if(laneOn(to)){ e.lmv={from:e.lane, t:0}; e.lane=to; e.windup=0; e.blocked=false; emit('bossMove',{e}); return true; } } }
  else { s.sw-=dt;
    if(s.sw<=0){ s.sw=e.rage?B.switchRage:B.switchEvery; const opts=[e.lane-1,e.lane+1].filter(laneOn);
      if(opts.length){ const busy=l=>G.pets.filter(p=>p.lane===l&&!p.dead).length;   // 往宠物少的一路换（逼玩家跟着调）
        opts.sort((a,b)=>busy(a)-busy(b)||Math.random()-0.5); s.warn={lane:opts[0], t:B.warn}; G.bossWarn={lane:opts[0], until:G.t+B.warn}; emit('bossWarn',{e,lane:opts[0]}); } } }
  s.roar-=dt;
  if(s.roar<=0 && !s.warn && !(e.windup>0)){ s.roar=e.rage?B.roarRage:B.roarEvery; s.roarLeft=B.roarT; emit('bossRoar',{e}); return true; }
  return false;
}

// ---------- 更新 ----------
function update(dt){
  if(G.over) { G.fx.forEach(f=>f.t+=dt); return; }
  if(G.pick && G.pick.on){ G.pick.t+=dt; return; }   // 73 版：选上阵时战斗还没开始
  tutUpdate(dt);
  if(tutCur()){   // 教学步骤进行中：战斗停住（不是暂停界面），只有能量球和提示在动，等玩家做完
    for(const o of G.orbs){ o.life=Math.min(o.life+dt, 3); if(o.fall>0) o.fall=Math.max(0,o.fall-dt); if(o.pop) o.pop=Math.max(0,o.pop-dt); }
    G.orbs=G.orbs.filter(o=>!o.got);
    for(const pet of G.pets){ if(pet.move){ pet.move.t+=dt; if(pet.move.t>=0.4) pet.move=null; } pet.flash=Math.max(0,pet.flash-dt); }
    for(const f of G.fx) f.t+=dt;  G.fx=G.fx.filter(f=>f.t<f.life);
    return; }
  G.t += dt;
  // 冷却与换阵次数
  for(const k in G.cooldown) G.cooldown[k]=Math.max(0,G.cooldown[k]-dt);
  if(G.swaps<G.swapCap){ G.swapRegen+=dt; if(G.swapRegen>=20){ G.swapRegen=0; G.swaps++; } } else G.swapRegen=0;
  // 天降能量
  if(G.t>=G.nextSky){
    G.nextSky += DATA.level.skyDrop.every;
    G.orbs.push({lane:DATA.level.lanes[Math.floor(Math.random()*DATA.level.lanes.length)], p:1+Math.random()*6, value:DATA.level.skyDrop.value, life:0, fall:1}); emit('sky');
  }
  // 刷怪
  while(G.spawnIdx<G.spawns.length && G.spawns[G.spawnIdx].t<=G.t){
    const s=G.spawns[G.spawnIdx++]; const def=DATA.enemies[s.type];
    const e={key:s.type, def, lane:s.lane, p:COLS+0.4, hp:def.hp, maxHp:def.hp, atkT:0, flash:0, burn:null, slow:0};
    G.enemies.push(e); emit('spawn',{e});
  }
  // 宠物
  for(const pet of G.pets){
    if(pet.move){ pet.move.t+=dt; if(pet.move.t>=0.4) pet.move=null; }
    pet.flash=Math.max(0,pet.flash-dt);
    if(pet.poison){ pet.poison.t-=dt; pet.hp-=pet.poison.dps*dt; if(pet.poison.t<=0) pet.poison=null;   // 73 版：翠颈蛇的毒
      if(pet.hp<=0 && !pet.dead){ pet.dead=true; G.stats.lost=(G.stats.lost||0)+1; emit('petdeath',{pet}); G.fx.push({kind:'pop',lane:pet.lane,p:pet.col+0.5,t:0,life:0.4,color:'#ccc'}); continue; } }
    if(pet.haste>0) pet.haste-=dt;   // 91 版：铃尾蛇加速，被控住时也照常倒计时
    if(pet.evoBusy){ pet.windup=0; pet.again=0; continue; }   // 87 版：进化演出中（飞到画面中间去了）不攻击
    if(pet.ring){ ringTick(pet, dt); continue; }   // 87 版：进化后的全屏环射期间不做普通攻击
    if(pet.spored>0) pet.spored-=dt;
    if(pet.zap>0) pet.zap-=dt;   // 第3章角色 v1：飘电水母的麻痹（停手用 stun，这里只管显示）
    if(G.disco && G.disco.phase==='on' && G.disco.cells.some(c=>c[0]===pet.lane&&c[1]===pet.col) && pet.def.shape!=='mine'){ if(!(pet.dance>0)) emit('dance',{pet}); pet.dance=0.2; }   // 第2章角色 v1：巴隆的舞池灯光，换位离开灯就停
    if(pet.dance>0){ pet.dance-=dt; pet.windup=0; pet.again=0; continue; }
    if(pet.stun>0){ pet.stun-=dt; pet.windup=0; pet.again=0; continue; }
    const d=pet.def;
    const pdt = mudAt(pet.lane,pet.col) ? dt/1.4 : dt;   // 第3章角色 v1：泥潭里攻击变慢 40%
    if(pet.again>0){ pet.again-=dt; if(pet.again<=0){ pet.second=true; petRelease(pet); } }
    if(pet.windup>0){ pet.windup-=pdt; if(pet.windup<=0) petRelease(pet); continue; }   // 攻击前摇中：等动画走到出手那一帧
    if(pet.dash){ petDashTick(pet, dt); continue; }   // 91 版：冲撞 / 冲锋中不做普通攻击
    if(d.monster && petSkillTick(pet, dt)) continue;
    if(d.fury && !pet.furyOn && pet.hp<=pet.maxHp*d.fury.at){ pet.furyOn=true; emit('petFury',{pet}); }
    // 草系 3 连：回血
    if(pet.group && pet.group.el==='grass' && pet.group.size>=3) pet.hp=Math.min(pet.maxHp, pet.hp+Math.min(pet.maxHp*0.01,6)*dt); // 每秒 1%，最多 6 点，防止草墙永动
    if(d.shape==='producer'){
      pet.timer-=dt;
      if(pet.timer<=0){
        let mul = (cellAt(pet.lane,pet.col)||{}).type==='flower' ? 1.2 : 1;
        if(pet.group && pet.group.el==='grass' && pet.group.size>=5) mul*=1.2;
        if(DATA.level.cond && DATA.level.cond.prod) mul*=DATA.level.cond.prod;   // 92 版：黄昏 / 夜晚等时段的产量减益（levels.js cond，关卡设计.md「难度和重玩」）
        pet.timer = d.prodInt;
        const lucky = d.lucky && Math.random()<d.lucky; if(lucky) mul*=2;   // 96 版：聚能花 3 星，20% 概率双倍
        G.orbs.push({lane:pet.lane,p:pet.col+0.5,value:Math.round(d.prod*mul),life:0,fall:0,pop:0.3,produced:true, lucky}); emit('produce',{pet, lucky});
      }
    } else if(d.shape==='shooter'){
      pet.timer-=pdt*petHasteK(pet);
      if(pet.timer<=0){
        const reach = d.toss ? 1e9 : inkAt(pet.lane,pet.col) ? pet.col+1+INK_REACH : 1e9;   // 第 3 章：墨里的远程只打 1.5 格内；投石不看墨
        const target = (d.toss ? !!lobTarget(pet) : G.enemies.some(e=>!e.dead&&(d.lob3 ? Math.abs(e.lane-pet.lane)<=1 : e.lane===pet.lane)&&e.p>pet.col+0.3&&e.p<COLS+0.3&&e.p-e.def.r<=reach)) || (!d.snipe && !d.lob && !d.toss && G.cells.some(c=>propAlive(c)&&c.marked&&c.lane===pet.lane&&c.col>pet.col&&c.col<reach));
        if(target){ pet.timer=petInt(pet); pet.windup=d.windup; emit('attackStart',{pet}); }
        else pet.timer=0.1;
      }
    } else if(d.shape==='melee'){
      pet.timer-=pdt*petHasteK(pet);
      if(pet.timer<=0){
        // 近战覆盖「前方 reach 格」：按怪物身体边缘判断，体型大的怪站得远也打得到
        if(meleeHits(pet).length || meleeProp(pet)){ pet.timer=petInt(pet); pet.windup=d.windup; emit('attackStart',{pet}); }
        else pet.timer=0.1;
      }
      if(pet.swing) pet.swing=Math.max(0,pet.swing-dt);
    } else if(d.shape==='support' && d.heal){   // 第2章角色 v1：菇背羊（宠物）每 6 秒给周围 3×3 回血
      pet.timer-=dt;
      if(pet.timer<=0){ pet.timer=d.heal.every; const list=G.pets.filter(q=>!q.dead&&Math.abs(q.lane-pet.lane)<=1&&Math.abs(q.col-pet.col)<=1&&q.def.shape!=='mine');
        const clean=[]; list.forEach(q=>{ q.hp=Math.min(q.maxHp, q.hp+d.heal.amt);
          if(d.heal.clean && (q.poison || q.zap>0 || q.spored>0)){ q.poison=null; if(q.zap>0||q.spored>0){ q.stun=Math.max(0, q.stun-Math.max(q.zap||0, q.spored||0)); q.zap=0; q.spored=0; }   /* 只减掉麻痹 / 孢子那部分，换位罚停照留 */ clean.push(q); } });   // 97 版：菇背羊 3 星回复时解除中毒、麻痹、孢子停手
        emit('petHeal',{pet, list, clean}); }
    } else if(d.shape==='mine'){
      if(pet.armT>0){ pet.armT-=dt; continue; }
      const trig=G.enemies.find(e=>!e.dead&&!isFly(e)&&e.lane===pet.lane&&e.p>=pet.col-0.1&&e.p<=pet.col+(e.def.range?1.9:1.1));   // 69 版：远程怪隔格停下，踩不到面前的波姆 → 触发距离按射程加长
      if(trig){
        const B=d.blast||1;   // 96 版：波姆 3 星爆炸前后 2 格（5×3）
        G.enemies.forEach(e=>{ if(!e.dead&&Math.abs(e.lane-pet.lane)<=1&&e.p>=pet.col-B&&e.p<=pet.col+1+B) hitEnemy(e,d.dmg,d.el); });
        G.cells.forEach(c=>{ if(propAlive(c)&&Math.abs(c.lane-pet.lane)<=1&&c.col>=pet.col-B&&c.col<=pet.col+B) damageProp(c,d.dmg,true); });
        G.fx.push({kind:'boom',lane:pet.lane,p:pet.col+0.5,t:0,life:0.5}); emit('boom',{pet});
        pet.booms=(pet.booms||0)+1; if(d.uses && pet.booms<d.uses) pet.armT=d.rearm; else pet.dead=true;   // 97 版：鼓气鲀 3 星炸完 6 秒后重新鼓气，能炸 2 次
      }
    }
  }
  // 弹道
  for(const pr of G.projs){
    pr.p += pr.speed*dt;
    if(pr.lob){ const t=pr.lob.tg;   // 91 版：抛物线，不被木箱挡；飞到目标身上才命中
      if(t && !t.dead){ pr.lob.p1=t.p; if(pr.p>=t.p-t.def.r*0.5){ emit('projhit',{pr,e:t}); if(t.def.shell) emit('deflect',{e:t}); hitEnemy(t,pr.dmg*(t.def.shell||1),pr.el,{slow:pr.slow,slowK:pr.slowK||0,src:pr.src}); pr.dead=true; G.fx.push({kind:'spark',lane:pr.lane,p:pr.p,t:0,life:0.2,color:EL[pr.el].color}); } }
      else { const e=G.enemies.filter(e=>!e.dead&&e.lane===pr.lane&&Math.abs(e.p-pr.p)<e.def.r+0.1).sort((a,b)=>a.p-b.p)[0];
        if(e){ emit('projhit',{pr,e}); if(e.def.shell) emit('deflect',{e}); hitEnemy(e,pr.dmg*(e.def.shell||1),pr.el,{slow:pr.slow,slowK:pr.slowK||0,src:pr.src}); pr.dead=true; } }
      if(pr.p>COLS+0.6) pr.dead=true; continue; }
    // 木箱挡弹道
    const c = G.cells.find(c=>c.type==='crate'&&c.hpNow>0&&c.lane===pr.lane&&pr.p>=c.col+0.2&&pr.p<=c.col+0.9);
    if(c){ pr.dead=true; damageProp(c, pr.dmg, true); continue; }
    const e = G.enemies.filter(e=>!e.dead&&e.lane===pr.lane&&Math.abs(e.p-pr.p)<e.def.r+0.1&&!(pr.hit&&pr.hit.has(e))).sort((a,b)=>a.p-b.p)[0];
    if(e){ emit('projhit',{pr,e}); if(e.def.shell) emit('deflect',{e}); hitEnemy(e,pr.dmg*(e.def.shell||1)*(pr.hitN?pr.pk:1),pr.el,{slow:pr.slow,slowK:pr.slowK||0,src:pr.src});
      pr.hitN=(pr.hitN||0)+1; if(pr.pierce && pr.hitN<pr.pierce) (pr.hit||(pr.hit=new Set())).add(e); else pr.dead=true; G.fx.push({kind:'spark',lane:pr.lane,p:pr.p,t:0,life:0.2,color:EL[pr.el].color});   // 97 版：绿莱姆 3 星穿透（第 2 个 85%）
      if(pr.splash){ const S=pr.splash, at=e.p, list=G.enemies.filter(o=>o!==e&&!o.dead&&o.lane===pr.lane&&!isFly(o)&&Math.abs(o.p-at)<=S.r+o.def.r*0.5);   // 96 版：泡泡鱼 3 星溅射（不触发二次溅射）
        emit('splash',{pr, e, list}); list.forEach(o=>hitEnemy(o, pr.dmg*S.k, pr.el, {src:pr.src})); } }
    if(pr.p>COLS+0.6) pr.dead=true;
    if(pr.maxP && pr.p>pr.maxP && !pr.dead){ pr.dead=true; emit('inkFizz',{pr}); }   // 第3章角色 v1：墨里吐出的弹打不远
  }
  // 87 版：进化环射的水弹（格坐标里朝任意方向飞，穿透，每只怪 / 木箱只打一次）
  for(const r of G.rprojs){
    r.lane+=r.vl*dt; r.p+=r.vp*dt; r.t+=dt;
    for(const e of G.enemies){ if(e.dead||r.hit.has(e)) continue;
      if(Math.abs(e.lane-r.lane)<0.42 && Math.abs(e.p-r.p)<e.def.r+0.18){ r.hit.add(e); emit('projhit',{pr:r,e}); hitEnemy(e,r.dmg,r.el,{src:r.src}); } }
    for(const c of G.cells){ if(!propAlive(c)||r.hit.has(c)) continue; if(Math.abs(r.lane-c.lane)<0.4 && r.p>=c.col+0.15 && r.p<=c.col+0.85){ r.hit.add(c); damageProp(c, r.dmg, true); } }
    if(r.lane<-0.8||r.lane>LANES-0.2||r.p<-0.8||r.p>COLS+0.8) r.dead=true;
  }
  G.rprojs=G.rprojs.filter(r=>!r.dead);
  for(const b of G.lobs){ if(b.side==='p' && b.e && !b.e.dead){ b.to=b.e.p; b.lane=b.e.lane; }   // 93 版：目标横爬换路也跟过去
    b.t+=dt;
    if(b.t>=b.dur){ b.done=true;
      if(b.side==='e'){ const q=petAt(b.lane, Math.floor(b.to)); if(q && !q.dead && q.def.shape!=='mine'){ hurtPet(q, b.dmg*(q.def.shellP||1)); if(q.def.shellBack && b.src && !b.src.dead){ hitEnemy(b.src, b.dmg*q.def.shellBack, 'none', {src:q}); emit('thorns',{e:b.src, pet:q, reflect:true}); } } emit('lobHit',{b, pet:q||null}); }   // 97 版：背壳蜥挡石头 50%（原来漏了，描述写的是远程都挡）；3 星反弹 50%
      else { const D=b.src.def.toss, list=G.enemies.filter(e=>!e.dead&&e.lane===b.lane&&(!isFly(e)||e===b.e)&&Math.abs(e.p-b.to)<=D.splash+e.def.r*0.5).sort((x,y)=>Math.abs(x.p-b.to)-Math.abs(y.p-b.to));
        list.forEach((e,i)=>{ if(i===0||D.sdmg) hitEnemy(e, i===0?b.dmg:D.sdmg, b.el, {src:b.src}); if(i===0 && D.clamp && !e.dead){ e.held=Math.max(e.held||0, knockable(e)?D.clamp:D.big); e.windup=0; } }); emit('lobHit',{b, list}); } } }
  G.lobs=G.lobs.filter(b=>!b.done);
  if(G.wave) waveTick(dt);
  if(G.ink.length) G.ink=G.ink.filter(c=>c.until>G.t);
  if(G.mud.length) G.mud=G.mud.filter(c=>c.until>G.t);
  if(G.pfire.length){ G.pfire=G.pfire.filter(z=>z.until>G.t && !z.src.dead);   // 96 版：喷火蜥 3 星的地面火：站在火里的地面敌人每秒受伤（橙色小号数字，和灼烧同一套）
    for(const z of G.pfire) for(const e of G.enemies) if(!e.dead&&!isFly(e)&&e.lane===z.lane&&e.p>=z.c0+0.1&&e.p-e.def.r*0.5<=z.c1){ const dd=z.dps*dt*elemMult(z.el,e.def.el); e.hp-=dd; e.ffAcc=(e.ffAcc||0)+dd; e.ffT=(e.ffT||0)+dt;
      if(e.ffT>=0.5){ emit('burnTick',{e,dmg:e.ffAcc}); e.ffT=0; e.ffAcc=0; } if(e.hp<=0) killEnemy(e); } }
  if(G.pink.length){ G.pink=G.pink.filter(z=>z.until>G.t);   // 93 版：喷墨章鱼（宠物）的墨区里敌人变慢
    for(const z of G.pink) if(!z.from || G.t>=z.from) for(const e of G.enemies) if(!e.dead&&!isFly(e)&&e.lane===z.lane&&e.p>=z.c0&&e.p<=z.c1+0.3){ e.slowK = e.slow>0 ? Math.min(e.slowK||0.85, z.k) : z.k; e.slow=Math.max(e.slow||0, 0.15); } }
  // 怪物
  for(const e of G.enemies){
    if(e.dead) continue;
    e.flash=Math.max(0,e.flash-dt);
    if(e.burn){ e.burn.t-=dt; e.hp-=e.burn.dps*dt; e.burnAcc=(e.burnAcc||0)+e.burn.dps*dt; e.burnTick=(e.burnTick||0)+dt;
      if(e.burnTick>=0.5 && e.burnAcc>=1){ emit('burnTick',{e,dmg:e.burnAcc}); e.burnTick=0; e.burnAcc=0; }
      if(e.burn.t<=0){ e.burn=null; e.burnTick=0; } if(e.hp<=0){ killEnemy(e); continue; } }
    if(e.venom){ e.venom.t-=dt; e.hp-=e.venom.dps*dt; e.vAcc=(e.vAcc||0)+e.venom.dps*dt; e.vTick=(e.vTick||0)+dt;
      if(e.vTick>=0.5 && e.vAcc>=1){ emit('venomTick',{e,dmg:e.vAcc}); e.vTick=0; e.vAcc=0; }
      if(e.venom.t<=0){ e.venom=null; e.vTick=0; } if(e.hp<=0){ killEnemy(e); continue; } }
    if(e.slow>0) e.slow-=dt;
    if(e.sticky>0) e.sticky-=dt;
    if(e.def.enrage && !e.rage && e.hp<=e.maxHp*e.def.enrage.at){ e.rage=true; emit('enrage',{e}); if(e.bs){ e.bs.sw=Math.min(e.bs.sw, e.def.boss.switchRage); e.bs.roar=Math.min(e.bs.roar, e.def.boss.roarRage); } }   // Boss 狂暴后新的间隔马上生效   // 棘背蜥：半血后发怒
    if(e.def.disco && e.rage && !e.ds.rg){ const B=e.def.disco, s=e.ds; s.rg=true; s.light=Math.min(s.light,B.lightRage); s.dance=Math.min(s.dance,B.danceRage); s.dash=Math.min(s.dash,B.dashRage); }
    // ===== 第2章角色 v1 =====
    if(e.danceT>0) e.danceT-=dt;   // 91 版：巴隆（宠物）的舞池灯光，只用来画彩色
    if(e.fall>0 && (e.daze>0||e.held>0)){ e.fall-=dt; if(e.fall<=0) emit('land',{e}); }   // 93 版：空投的蟹被钳 / 晕时照样落地
    if(e.daze>0){ e.daze-=dt; e.windup=0; continue; }      // 莽角羊撞完晕；巨喙鸟扑空落地
    if(e.held>0){ e.held-=dt; e.windup=0; continue; }      // 第3章角色 v1：被岩钳蟹（宠物）钳住
    if(e.def.kraken && e.rage && e.ks && !e.ks.rg){ const K=e.def.kraken, s=e.ks; s.rg=true; s.ink=Math.min(s.ink,K.inkRage); s.wave=Math.min(s.wave,K.waveRage); s.crew=Math.min(s.crew,K.crewRage); }
    if(e.haste>0) e.haste-=dt;                               // 铃尾蛇的铃声
    if(ch2Tick(e, dt)) continue;
    if(ch3Tick(e, dt)) continue;   // 第3章角色 v1
    if(e.def.boss && !e.def.disco && !e.def.kraken && bossTick(e, dt)) continue;
    if(e.hopT!=null){ e.hopT+=dt; e.p=e.hop0+(e.hop1-e.hop0)*Math.min(1,e.hopT/0.7); if(e.hopT>=0.7){ e.hopT=null; } else continue; }   // 73 版：长信翁飞越中，不挡、不咬   // 70 版：Boss 换路 / 吼叫时不走也不咬
    const spd = (e.def.charge && !e.charged ? e.def.charge.speed : e.def.speed)*(e.slow>0?(e.slowK||0.85):1)*(e.sticky>0?(e.stickyK||0.7):1)*(e.rage?e.def.enrage.speed:1)*(e.rush||1)*(e.haste>0?1.5:1);
    // 被谁挡住：同 lane、非地雷、身后的最近宠物
    const ext = e.def.range && e.p<=COLS-0.2 ? e.def.range-0.6 : 0;   // 69 版：远程的怪（喷火蜥）隔着停下，停的位置近战 1 格够不着；先走进棋盘再停（宠物放在最后两格时不能停在棋盘外）
    const inReach = c => e.p>c+0.2 && e.p<=c+1+e.def.r*0.6+ext;
    let blockers = isFly(e) ? [] : G.pets.filter(p=>!p.dead&&p.lane===e.lane&&p.def.shape!=='mine'&&inReach(p.col));
    if(e.def.trample){ for(const p of blockers) if(!isTank(p)){ e.tramp=e.tramp||new Set(); if(!e.tramp.has(p)){ e.tramp.add(p); emit('trample',{e,pet:p}); hurtPet(p, e.def.trample.dmg); } }   // 第2章角色 v1：践踏，只有坦克挡得住
      blockers=blockers.filter(isTank); }
    const blocker = blockers.sort((a,b)=>b.col-a.col)[0];
    const pb = isFly(e) ? null : G.cells.filter(c=>propAlive(c)&&c.lane===e.lane&&inReach(c.col)).sort((a,b)=>b.col-a.col)[0];
    const tgt = pb && (!blocker || pb.col>blocker.col) ? pb : blocker;   // 离怪最近的那个挡住它：宠物或道具
    if(tgt && e.def.hop && !e.hopped && tgt.def && tgt.def.shape){ e.hopped=true; e.hopT=0; e.hop0=e.p; e.hop1=tgt.col-0.05; e.windup=0; emit('hop',{e}); continue; }   // 73 版：遇到第一只宠物，飞越到它身后
    if(tgt && e.def.charge && !e.charged){ e.charged=true; const C=e.def.charge;   // 第2章角色 v1：莽角羊冲撞第一只挡路的宠物（或道具），然后自己晕
      if(tgt.type==='crate') damageProp(tgt, C.dmg, false); else hurtPet(tgt, C.dmg);
      emit('ram',{e, t:tgt}); e.daze=C.daze; e.windup=0; e.blocked=true; continue; }
    if(tgt && e.def.puff){ e.blocked=true; e.puffT=(e.puffT||0)+dt; if(e.puffT<dt*1.5) emit('puffStart',{e});   // 第3章角色 v1：鼓气鲀贴上去鼓气 → 炸开
      if(e.puffT>=e.def.puff.t){ const c0=tgt.type==='crate'?tgt.col:tgt.col, pets=G.pets.filter(p=>!p.dead&&Math.abs(p.lane-e.lane)<=1&&Math.abs(p.col-c0)<=1&&p.def.shape!=='mine');
        pets.forEach(p=>hurtPet(p, e.def.puff.dmg)); G.cells.forEach(c=>{ if(propAlive(c)&&Math.abs(c.lane-e.lane)<=1&&Math.abs(c.col-c0)<=1) damageProp(c, e.def.puff.dmg, false); });
        e.dead=true; G.kills++; emit('puffBoom',{e, pets, col:c0}); }
      continue; }
    if(tgt && e.def.butt && tgt.def && tgt.def.shape){ e.btT=(e.btT??e.def.butt.every*0.5)-dt;   // 第3章角色 v1：铁盔鱼顶退
      if(e.btT<=0){ e.btT=e.def.butt.every; e.windup=0; const pushed=pushPet(tgt, e.def.butt.dmg, e.def.butt.dmg); emit('butt',{e, pet:tgt, pushed}); e.blocked=true; continue; } }
    e.blocked=!!tgt;
    if(tgt){
      // 先起手（播攻击动画），到出手那一帧才扣血
      if(e.windup>0){ e.windup-=dt;
        if(e.windup<=0){ const bt=e.biteTarget, alive=bt && (bt.type==='crate' ? propAlive(bt) : !bt.dead), t=alive?bt:tgt;
          const hurt = q => { if(q.evoBusy) return; q.hp-=e.def.atk*(e.lv?1+e.def.grow.atk*e.lv:1)*(e.def.range && q.def.shellP ? q.def.shellP : 1); q.flash=0.12; if(q.hp<=0 && !q.dead){ q.dead=true; G.stats.lost=(G.stats.lost||0)+1; emit('petdeath',{pet:q}); G.fx.push({kind:'pop',lane:q.lane,p:q.col+0.5,t:0,life:0.4,color:'#ccc'}); } };   // 91 版：背壳蜥（宠物）挡远程
          if(t.type==='crate'){ e.bite=0.15; emit(e.def.range?'breath':'propBite',{e,c:t,pets:[]}); damageProp(t, e.def.atk, false); }
          else if(e.def.range){ const wall=pb?pb.col:-1, hits=G.pets.filter(p=>!p.dead&&p.lane===e.lane&&p.def.shape!=='mine'&&p.col>wall&&inReach(p.col));   // 喷火：范围内的宠物都烧到；道具后面的烧不到
            e.bite=0.15; emit('breath',{e,pets:hits}); hits.forEach(hurt);
            hits.forEach(q=>{ if(q.def.shellBack && !e.dead){ hitEnemy(e, e.def.atk*(e.lv?1+e.def.grow.atk*e.lv:1)*q.def.shellBack, 'none', {src:q}); emit('thorns',{e, pet:q, reflect:true}); } }); }   // 97 版：背壳蜥 3 星远程反弹 50%
          else { e.bite=0.15; emit('bite',{e,pet:t}); hurt(t);
            if(t.def.thorns && !e.dead){ hitEnemy(e, t.def.thorns, 'none', {src:t, burn:t.def.thornsBurn||null}); emit('thorns',{e, pet:t}); }   // 97 版：赤甲虫 3 星反伤带灼烧
            if(t.def.reflect && !e.dead && !t.dead){ hitEnemy(e, e.def.atk*(e.lv?1+e.def.grow.atk*e.lv:1)*t.def.reflect, 'none', {src:t}); emit('thorns',{e, pet:t, reflect:true}); }   // 96 版：硬壳南瓜 3 星，被咬反弹 20%   // 91 版：赤甲虫（宠物）带刺反伤
            if(e.def.poison && !t.dead){ const fresh=!t.poison; t.poison={dps:e.def.poison.dps, t:e.def.poison.t}; emit('poison',{pet:t, fresh}); }
            if(t.def.sticky){ e.sticky=t.def.sticky.t; e.stickyK=t.def.sticky.k; }
            if(t.def.glue && !e.dead){ e.glueN=(e.glueN||0)+1; if(e.glueN>=t.def.glue.n){ e.glueN=0; e.held=Math.max(e.held||0, knockable(e)?t.def.glue.t:t.def.glue.big); e.windup=0; emit('petGlue',{e, pet:t}); } }   // 97 版：厚壳蜗 3 星咬满 3 口粘住 1.5 秒   // 73 版：咬了厚壳蜗的怪变慢
            if(e.def.chain){ const C=e.def.chain, list=G.pets.filter(p=>p!==t&&!p.dead&&p.def.shape!=='mine'&&Math.abs(p.lane-t.lane)<=1&&Math.abs(p.col-t.col)<=1).slice(0,C.n);   // 第3章角色 v1：飘电水母放电
              list.forEach(p=>{ hurtPet(p, C.dmg); p.stun=Math.max(p.stun||0, C.stun); p.zap=C.stun; }); emit('zap',{e, pet:t, list}); }
            if(e.def.boss && e.def.boss.cleave){ const side=G.pets.filter(p=>!p.dead&&p.col===t.col&&Math.abs(p.lane-t.lane)===1&&p.def.shape!=='mine');   // 70 版：Boss 重击，同一列上下两路也受伤
              emit('slam',{e,pet:t,side}); side.forEach(hurt); } } } }
      e.atkT-=dt;
      if(e.atkT<=0 && !(e.windup>0)){ e.atkT=e.def.atkInt*(e.rage?e.def.enrage.atkInt:1)/(e.sticky>0?(e.stickyK||0.7):1); e.windup=e.def.windup; e.biteTarget=tgt; emit('biteStart',{e,pet:tgt}); }
    } else {
      e.windup=0;   // 挡路的宠物没了：这一口取消
      e.p -= spd*dt;
    }
    if(e.bite) e.bite=Math.max(0,e.bite-dt);
    if(e.p<0){
      if(G.bells[e.lane]){
        G.bells[e.lane]=false; G.bellsUsed++; emit('bell',{lane:e.lane});
        G.fx.push({kind:'bell',lane:e.lane,t:0,life:1.2});
        G.fx.push({kind:'banner',text:`第 ${e.lane+1} 路的警钟响了`,t:0,life:1.6,color:'#ffd25a'});
        G.enemies.forEach(o=>{ if(o.dead||o.lane!==e.lane) return; if(o.def.boss){ o.p=Math.max(o.p,3); hitEnemy(o, 1000, 'none'); } else killEnemy(o,true); });   // 70 版：警钟消灭不了 Boss，只把它打回第 3 格、扣 1000
      } else if(!G.over && !G.demo){ const lf=Math.max(0.3,Math.min(0.8,G.t/DATA.level.duration)); G.over={win:false, coins:Math.round((100+G.kills*5)*lf)}; G.overT=0; emit('lose'); }   // 95 版：失败按撑住的时间给 30%～80% 金币（结算一直这么写，原来实际不入账）
    }
  }
  // 清理
  const before=G.pets.length;
  G.pets=G.pets.filter(p=>!p.dead);
  if(G.pets.length!==before) recalcResonance();
  G.enemies=G.enemies.filter(e=>!e.dead);
  G.projs=G.projs.filter(p=>!p.dead);
  // 能量球：6 秒后自动收
  for(const o of G.orbs){ o.life+=dt; if(o.fall>0) o.fall=Math.max(0,o.fall-dt); if(o.pop) o.pop=Math.max(0,o.pop-dt); if(o.life>6) collectOrb(o); }
  G.orbs=G.orbs.filter(o=>!o.got);
  for(const f of G.fx) f.t+=dt;  G.fx=G.fx.filter(f=>f.t<f.life);
  for(const f of G.shardsFx) f.t+=dt;  G.shardsFx=G.shardsFx.filter(f=>f.t<f.life);
  // 胜利
  if(G.spawnIdx>=G.spawns.length && G.enemies.length===0 && !G.over && !G.demo) finish();
}
function collectOrb(o){ if(o.got) return; o.got=true; emit('collect',{o}); G.energy+=o.value; }   // 数字变化在能量槽上看，不在原地再飘一个 +25

function finish(){
  const stars = 1 + (G.bellsUsed===0?1:0) + (!(G.stats.lost>0)?1:0);   // 65 版：第三颗星 = 没有宠物倒下（原来是「触发火系 3 连」，前几关没有火系宠物拿不到）
  const coins=100+G.kills*5;   // 94 版：去掉经验（没有用处，用户 2026-11-23）
  // 65 版：每关首次通关只给一样东西（关卡设计.md）：宠物碎片（数量固定）或一个新机制
  const rw = DATA.level.first ? DATA.level.reward : null; let unlock=null;
  if(rw && rw.shard) G.shards[rw.shard[0]]=(G.shards[rw.shard[0]]||0)+rw.shard[1];
  const chest=!!(rw && rw.chest);   // 74 版（用户 2026-11-14）：章节终关宝箱不再直接并进结算金币，回地图点「终关奖励」自己打开领取（map.js）
  if(rw && rw.unlock && !PROFILE.unlock[rw.unlock]){ PROFILE.unlock[rw.unlock]=1; profileSave(); unlock=rw.unlock; }
  G.over={win:true, stars, coins: coins+(G.loot.gold||0), starGain:(G.loot.star||0), chest, unlock, summon: rw && rw.shard ? rw.shard[0] : null}; G.overT=0; emit('win',{stars});
}

// ---------- 教学（65 版；玩法与界面.md「第 1 章关卡与教学」）----------
// 做法：到了某一步，战斗停住（update 里不推进），提示玩家做一个动作，位置固定；做对了战斗继续。只在第一次打这一关时出现。
// 步骤写在 levels.js 的 tut 里：{at:秒, kind:'place', key, lane, col|'front'} / {kind:'orb', value} / {kind:'move', key, toLane}
const tutCur = () => { const c=G && G.tut && G.tut.cur; return c && !c.free ? c : null; };   // free = 不停住战斗的步骤（等待、脚本动作）
function tutBegin(s){
  const freeCol=(lane,c0,lo,hi)=>{ for(const d of [0,1,-1,2,-2,3,-3]){ const c=c0+d; if(c>=lo && c<=hi && inGrid(lane,c) && !petAt(lane,c) && !propAlive(cellAt(lane,c))) return c; } return -1; };
  if(s.kind==='place'){
    if(!DATA.level.loadout.includes(s.key)) return false;
    let c0=s.col;
    if(c0==='front'){ const mine=G.pets.filter(p=>p.lane===s.lane); c0=Math.max(s.min||3, mine.length?Math.max(...mine.map(p=>p.col))+1:0); }
    if(s.ahead){ const es=G.enemies.filter(e=>!e.dead&&e.key===s.ahead&&Math.abs(e.lane-s.lane)<=1); if(es.length) c0=Math.max(1, Math.floor(Math.min(...es.map(e=>e.p))-2.3)); }   // 波姆：放在怪群前面
    const c=freeCol(s.lane, Math.min(c0,COLS-2), 0, COLS-2); if(c<0) return false;
    s.L=s.lane; s.C=c; const d=DATA.pets[s.key]; G.cooldown[s.key]=0; if(G.energy<d.cost) G.energy=d.cost;
  } else if(s.kind==='orb'){
    const lane=DATA.level.lanes[Math.floor(DATA.level.lanes.length/2)];
    s.orb={lane, p:4.5, value:s.value||25, life:0, fall:1}; G.orbs.push(s.orb); emit('sky');
  } else if(s.kind==='card'){
    if(!DATA.level.loadout.includes(s.key)) return false; s.tapT=null;
  } else if(s.kind==='info'){
    s.ok=false; if(s.range){ const p=G.pets.find(q=>q.key===s.range); if(!p) return false; s.pet=p; }
  } else if(s.kind==='wait'){
    s.free=true;
  } else if(s.kind==='run'){
    s.free=true;
    if(s.run==='spawn'){ const def=DATA.enemies[s.type], hp0=s.hp||def.hp; const e={key:s.type, def, lane:s.lane, p:s.p, hp:hp0, maxHp:hp0, atkT:0, flash:0, burn:null, slow:0}; G.enemies.push(e); emit('spawn',{e}); }
    else if(s.run==='bellSetup'){   // 演示最后防线：场上只留聚能花，放一只怪走到它面前，两口咬掉
      for(const p of G.pets) if(p.key!=='flower'){ p.dead=true; emit('petdeath',{pet:p}); G.fx.push({kind:'pop',lane:p.lane,p:p.col+0.5,t:0,life:0.4,color:'#ccc'}); }
      G.pets=G.pets.filter(p=>!p.dead); G.projs=[]; recalcResonance();
      const f=G.pets.find(p=>p.key==='flower'), def=DATA.enemies.slime; if(!f) return false; f.hp=def.atk*2;
      const e={key:'slime', def, lane:f.lane, p:f.col+1.5, hp:def.hp, maxHp:def.hp, atkT:0, flash:0, burn:null, slow:0, rush:2.4};   /* rush：演示里这只走快一点 */ G.enemies.push(e); emit('spawn',{e}); }
    else if(s.run==='restart'){ PROFILE.demo=1; profileSave(); setLevel(DATA.level.id); newGame(); G.started=true; emit('start'); return false; }
  } else if(s.kind==='move'){
    if(G.swapCap<1) return false;
    /* 68 版（用户 2026-11-14：没放泡泡鱼，换位教学就跳过了）：别的路上没有这只宠物时，先像前面的关那样提示放一只，再教换位；这一步不再跳过 */
    const pet=G.pets.filter(p=>p.key===s.key && p.lane!==s.toLane).sort((a,b)=>Math.abs(a.lane-s.toLane)-Math.abs(b.lane-s.toLane))[0];
    if(!pet){ if(s.forced || !DATA.level.loadout.includes(s.key)) return false; s.forced=true;
      const ln=DATA.level.lanes.filter(l=>l!==s.toLane), lane=ln[Math.floor((ln.length-1)/2)];
      G.tut.steps.splice(G.tut.i, 0, {kind:'place', key:s.key, lane, col:1}); return 'again'; }
    let c=-1; for(const d of [0,1,-1,2,-2,3,-3,4,-4]){ const q=pet.col+d, o=petAt(s.toLane,q); if(q>=0 && q<=COLS-2 && !propAlive(cellAt(s.toLane,q)) && !(o && o.key===s.key)){ c=q; break; } }
    if(c<0) return false;
    s.pet=pet; s.L=s.toLane; s.C=c; if(G.swaps<1) G.swaps=1;   /* 目标格 = 同一排（那里已经是同一种宠物就换旁边一格）；有别的宠物就互换 */
  } else return false;
  if(!s.free){ G.selected=null; G.drag=null; }
  return true;
}
function tutDone(s){
  if(s.kind==='place'){ const p=petAt(s.L,s.C); return !!p && p.key===s.key; }
  if(s.kind==='orb') return !!s.orb.got;
  if(s.kind==='card') return s.tapT!=null && G.tut.t-s.tapT>2.6;   // 点了卡片，留 2.6 秒看说明
  if(s.kind==='info') return !!s.ok;
  if(s.kind==='run') return true;
  if(s.kind==='wait') return s.secs!=null ? G.tut.t>=s.secs : s.until==='noEnemy' ? G.enemies.length===0 : s.until==='petDead' ? (!G.pets.some(p=>p.key===s.key) || G.enemies.length===0) : s.until==='bell' ? G.enemies.length===0 : true;   // 场上没怪了也算过，免得卡住
  if(s.kind==='move') return s.pet.dead || (s.pet.lane===s.L && s.pet.col===s.C);
  return true;
}
function tutUpdate(dt){
  const T=G.tut; if(!T) return;
  if(T.cur){ T.t+=dt; if(tutDone(T.cur)){ emit('tutDone',{s:T.cur}); T.gap=T.cur.free?0:0.4; T.cur=null; T.i++; } return; }
  if(T.i>=T.steps.length){ G.tut=null; return; }
  if(T.gap>0){ T.gap-=dt; return; }
  const s=T.steps[T.i]; if(G.t<(s.at||0)) return;
  if(s.when){ const es=G.enemies.filter(e=>!e.dead&&e.key===s.when); if(es.length<3 || Math.min(...es.map(e=>e.p))>(s.whenP||7.5)) return; }   // 等这种怪成群走进场
  { const ok=tutBegin(s); if(ok==='again') return; if(!ok){ if(G.tut===T) T.i++; return; } }   // 条件不满足（比如这只宠物还没召唤）：跳过这一步；restart 会换掉整局，不再动旧的
  T.cur=s; T.t=0; emit('tutStep',{s});
}

// ---------- 输入（指针统一处理：鼠标与触屏）----------
let pointer={x:0,y:0,down:false};
function itemAt(x,y){ return L.items.find(it=>x>=it.x&&x<=it.x+it.w&&y>=it.y&&y<=it.y+it.h); }
function orbAt(x,y){
  // 用画面上能量真正所在的位置判定（花产出的能量会跳到旁边、落地会弹），判定圈比图标略大，取最近的一个
  let best=null, bd=L.cs*0.5;
  for(const o of G.orbs){ if(o.got) continue; const s=window.orbHitPos?window.orbHitPos(o):orbScreen(o); const d=Math.hypot(s.x-x,s.y-y); if(d<bd){ bd=d; best=o; } }
  return best;
}
// 能量从屏幕上方落下（不管横竖屏，「天上」都是屏幕上方）
function orbScreen(o){ const s=L.toScreen(o.lane,o.p); const off = o.fall*o.fall*L.cs*3.2; return {x:s.x, y:s.y-off-L.cs*0.1}; }   // 下落越来越快

function onDown(e){
  const x=PX(e),y=PY(e); pointer={x,y,down:true};
  if(!G.started){ G.started=true; emit('start'); return; }
  if(window.EVO && EVO.busy() && !G.over) return;   // 87 版：进化演出中不接受操作
  if(G.over){ const b=resultAgainRect(); if(b && x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){ emit('ui'); setLevel(DATA.level.id); newGame(); G.started=true; emit('start'); } return; }
  const ts=tutCur();
  if(ts && ts.kind==='info'){ if(G.tut.t>0.7){ ts.ok=true; emit('ui'); } return; }   // 说明浮窗：点任意位置继续
  const it=itemAt(x,y);
  if(it){
    if(it.id==='card'){
      const d=DATA.pets[it.key];
      emit('ui');
      if(ts && ts.kind==='card' && ts.key===it.key){ if(ts.tapT==null) ts.tapT=G.tut.t; return; }   // 只看说明，不选中
      if((ts && !(ts.kind==='place' && ts.key===it.key)) || (G.demo && !ts)){ emit('deny',{key:it.key, why:'tut'}); return; }
      if(G.energy>=d.cost && G.cooldown[it.key]<=0){ G.selected = G.selected===it.key?null:it.key; G.drag={kind:'card',key:it.key,x,y,sx:x,sy:y}; } else emit('deny',{key:it.key, why: G.cooldown[it.key]>0?'cd':'energy'});
    } else if(it.id==='shovel'){ G.selected = G.selected==='shovel'?null:'shovel'; }
    else if(it.id==='pause'){ G.paused=!G.paused; G.drag=null; emit('ui'); }
    else if(it.id==='mute'){ emit('ui'); emit('mute'); }
    else if(it.id==='speed'){ G.speed = G.speed===1?2:1; emit('ui'); }
    else if(it.id==='orient'){ orientMode = L.kind==='landscape'?'portrait':'landscape'; resize(); }
    else if(it.id==='energy'){ if(e.shiftKey||e.altKey) G.energy+=500; }
    return;
  }
  const o=orbAt(x,y); if(o){ collectOrb(o); return; }
  const {lane,col}=L.toCell(x,y);
  if(!inGrid(lane,col)){ G.selected=null; return; }
  if(G.selected==='shovel'){ shovel(lane,col); G.selected=null; return; }
  if(G.selected){ if(placePet(G.selected,lane,col)) G.selected=null; return; }
  if(ts && ts.kind!=='move') return;
  const pc=cellAt(lane,col); if(!ts && propAlive(pc) && !petAt(lane,col)){ pc.marked=!pc.marked; emit('ui'); return; }
  const pet=petAt(lane,col);
  if(pet && !G.demo && (!ts || ts.pet===pet)) G.drag={kind:'pet',pet,x,y,sx:x,sy:y};
}
function onMove(e){ pointer.x=PX(e); pointer.y=PY(e); if(G.drag){ G.drag.x=PX(e); G.drag.y=PY(e); } }
function onUp(e){
  pointer.down=false;
  const dr=G.drag; G.drag=null; if(!dr) return;
  const moved = Math.hypot(PX(e)-dr.sx,PY(e)-dr.sy)>12;
  const {lane,col}=L.toCell(PX(e),PY(e));
  if(dr.kind==='card' && moved){ placePet(dr.key,lane,col); G.selected=null; }   // 拖动后松手：放没放成都取消选中（轻点才是选中）
  if(dr.kind==='pet' && !moved && dr.pet.evoReady && window.EVO){ EVO.start(dr.pet); return; }   // 87 版：点一下可以进化的宠物 → 开始进化
  if(dr.kind==='pet' && moved){
    // 拖到底部卡槽区松手 = 卖掉（返还一半能量）
    if(PY(e) >= L.bar.y - 8){ if(!tutCur()){ shovel(dr.pet.lane, dr.pet.col); emit('sell',{pet:dr.pet}); } }
    else movePet(dr.pet,lane,col);
  }
}
cv.addEventListener('pointerdown',onDown);
window.addEventListener('pointermove',onMove);
window.addEventListener('pointerup',onUp);
window.addEventListener('keydown',e=>{
  // 横屏版界面还没按新风格做，先只开放竖屏
  if(e.key===' ') G.paused=!G.paused;
  if(e.key==='e'||e.key==='E') G.energy+=500;
  if(e.key==='r'||e.key==='R'){ setLevel(DATA.level.id); newGame(); G.started=true; }   // 和「再打一次」同一条路：重新判断是不是首通，不重复领奖励
  const n=parseInt(e.key); if(n>=1&&n<=DATA.level.loadout.length && !G.demo && !tutCur()){ const k=DATA.level.loadout[n-1]; G.selected=G.selected===k?null:k; }
});

