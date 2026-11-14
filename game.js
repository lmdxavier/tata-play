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
    flower:  {cn:'聚能花', desc:'每 14 秒产出 25 能量。放在花丛格上产量 +20%。', rarity:'common', name:'Flower',  short:'花', el:'grass', shape:'producer', cost:50,  cd:5,  hp:300,  prod:25, prodInt:14, windup:0.17},
    goldfish:{cn:'泡泡鱼', desc:'向本路前方吐水弹，命中第一个敌人。水系连成 3 只时，水弹让敌人减速 15%，持续 2 秒。', rarity:'common', name:'Goldfish',short:'鱼', el:'water', shape:'shooter',  cost:100, cd:5,  hp:300,  dmg:20, int:1.4, projSpeed:6, windup:0.17},
    pug:     {cn:'火牙犬', desc:'咬前方 1 格内的所有敌人。火系连成 3 只时，攻击附带灼烧：每秒 4 点，持续 3 秒。', rarity:'common', name:'Pug',     short:'巴哥',el:'fire', shape:'melee',    cost:75,  cd:5,  hp:450,  dmg:40, int:1.0, reach:1, windup:0.36}   /* 出手 = Attack 动画里身体顶到最高点（0.367s），不是 Spine 自带的 0.167s 事件（那是蓄力开始） */,
    pumpkin: {cn:'硬壳南瓜', desc:'生命 2000，不攻击。挡住敌人，让后排继续输出。', rarity:'common', name:'Pumpkin', short:'南瓜',el:'grass', shape:'wall',    cost:50,  cd:20, hp:2000, windup:0.17},
    bomb:    {cn:'波姆', desc:'放下 3 秒后就绪。敌人走到它面前时爆炸，对周围 3×3 格造成 600 伤害。', rarity:'rare', name:'Bomb',    short:'雷', el:'fire',  shape:'mine',     cost:125, cd:30, hp:1,    dmg:600, arm:3, windup:0.17},
    lizard:  {cn:'喷火蜥', desc:'朝前方 2 格喷火，命中的敌人灼烧：每秒 6 点，持续 3 秒。', rarity:'rare', name:'Lizard_Fire',short:'火蜥',el:'fire',shape:'melee',  cost:150, cd:8,  hp:400,  dmg:30, int:1.5, reach:2, burn:{dps:6, t:3}, windup:0.28, monster:true},
  },
  enemies: {
    slime:  {cn:'绿莱姆', desc:'移动 0.25 格 / 秒，生命 200。咬挡路的宠物。', name:'Slime_Green', short:'史', el:'grass', hp:200,  speed:0.25, atk:10, atkInt:1.0, role:'minor', drop:0.07, r:0.30, windup:0.1},
    beetle: {cn:'赤甲虫', desc:'火系，生命 280。水系攻击对它伤害 +50%。', name:'Beetle_Red',  short:'甲', el:'fire',  hp:280,  speed:0.25, atk:12, atkInt:1.0, role:'minor', drop:0.07, r:0.30, windup:0.15},
    snail:  {cn:'厚壳蜗', desc:'移动 0.15 格 / 秒，生命 800。', name:'Snail_Green', short:'蜗', el:'grass', hp:800,  speed:0.15, atk:15, atkInt:1.5, role:'minor', drop:0.07, r:0.34, windup:0.13},
    fox:    {cn:'迅火狐', desc:'移动 0.5 格 / 秒，是绿莱姆的 2 倍。生命 170。', name:'Animal_Fox',  short:'狐', el:'fire',  hp:170,  speed:0.5,  atk:10, atkInt:0.8, role:'minor', drop:0.07, r:0.28, windup:0.09},
    lizard: {cn:'喷火蜥', desc:'隔 1 格停下，向前喷火 2 格，烧到最前面的宠物：每次 16 伤害。近战 1 格的宠物打不到它。', name:'Lizard_Fire', short:'火蜥', el:'fire', hp:360, speed:0.2, atk:16, atkInt:1.6, role:'minor', drop:0, r:0.32, windup:0.28, range:2},
    hornliz:{cn:'棘背蜥', desc:'生命 320。生命降到一半后移动速度 +80%，攻击间隔缩短 30%。', name:'Lizard_Horn', short:'棘', el:'grass', hp:320, speed:0.22, atk:14, atkInt:1.2, role:'minor', drop:0, r:0.32, windup:0.2, enrage:{at:0.5, speed:1.8, atkInt:0.7}},
    hornbug:{cn:'尖角虫', desc:'5 只一群一起出现。生命 260，移动比绿莱姆快 40%。', name:'Beetle_Blood', short:'角', el:'dark', hp:260, speed:0.35, atk:8, atkInt:0.9, role:'minor', drop:0, r:0.26, windup:0.15},
    bear:   {cn:'格鲁姆', desc:'生命 2600，每次攻击 40 伤害。', name:'Bear_Grizzly',short:'熊', el:'none',  hp:2600, speed:0.15, atk:40, atkInt:1.5, role:'elite', drop:0.21, r:0.44, windup:0.47},
  },
  level: {
    id:'1-5', title:'花田保卫战', loadout:['flower','goldfish','pug','pumpkin','bomb','lizard'],
    startEnergy:75, skyDrop:{every:12, value:25, firstAt:6},
    cells:[ {lane:1,col:2,type:'flower'}, {lane:3,col:2,type:'flower'}, {lane:2,col:6,type:'crate',kind:'barrel'}, {lane:4,col:5,type:'crate',kind:'box'} ],
    duration:240,
  },
};
// ---------- 65 版：关卡按 id 读取（数据在 levels.js），宠物拥有 / 机制解锁存档 ----------
const PET_ORDER = ['flower','goldfish','pug','pumpkin','bomb','lizard'];
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
function setLevel(id){
  const lv = (window.LEVELS||{})[id]; if(!lv) return false;
  const owned = PET_ORDER.filter(k=>PROFILE.owned[k]);
  DATA.level = { id, title:lv.title, lanes:lv.lanes.slice(), loadout:owned.slice(0,6), startEnergy:lv.startEnergy, skyDrop:lv.skyDrop, cells:lv.cells||[], duration:lv.duration,
    spawns:lv.spawns, reward:lv.reward||null, tut:lv.tut||null, boxShard:lv.boxShard||null, first:!levelCleared(id) };
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
const SHAPE_CN = {producer:'生产', shooter:'远程 · 直射', melee:'近战', wall:'坦克', mine:'地雷'};
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
    const n = DATA.level.loadout.length, pad = 6;
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
    t:0, speed:1, paused:false, over:null,
    energy: DATA.level.startEnergy,
    pets:[], enemies:[], projs:[], orbs:[], fx:[], shardsFx:[],
    cells: DATA.level.cells.map(c=>{ const h=c.type==='crate'?(c.hp||PROPS[c.kind].hp):c.hp; return {...c, hp:h, hpNow:h}; }),
    cooldown: Object.fromEntries(DATA.level.loadout.map(k=>[k,0])),
    spawns: buildSpawns(), spawnIdx:0,
    nextSky: DATA.level.skyDrop.firstAt,
    bells: Array.from({length:LANES}, (_,l)=>laneOn(l)),
    bellsUsed: 0,
    swaps: swapMax(), swapCap: swapMax(), swapRegen: 0,   // swapCap：这一局的换位上限（进关时定；通关当场解锁的下一局才生效）
    selected: null,       // 卡 key 或 'shovel'
    drag: null,
    groups: [], links: [],
    fire3Seen: false,
    kills: 0,
    shards: {}, pity: {},
    stats: {placed:0, moved:0},
    started: false,
    tut: (DATA.level.demo || (DATA.level.tut && DATA.level.first)) ? {steps:(DATA.level.demo||DATA.level.tut).map(s=>({...s})), i:0, cur:null, t:0, gap:0} : null,
    demo: !!DATA.level.demo,
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
function meleeProp(pet){ const pr=propAhead(pet.lane,pet.col+1,pet.col+pet.def.reach); if(!pr) return null;
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
  return m;
}

// ---------- 放置 / 移动 / 铲除 ----------
function canPlaceAt(lane,col){
  if(!inGrid(lane,col) || !laneOn(lane)) return false;
  const ts=tutCur(); if(ts && !(ts.kind==='place' && ts.L===lane && ts.C===col)) return false;   // 教学中：只能放在指定格
  if(petAt(lane,col)) return false;
  const c=cellAt(lane,col); if(c && c.type==='crate' && c.hpNow>0) return false;
  return true;
}
function placePet(key,lane,col){
  const def = DATA.pets[key];
  if(G.energy<def.cost || G.cooldown[key]>0 || !canPlaceAt(lane,col)) return false;
  { const ts=tutCur(); if(ts && ts.key!==key) return false; if(G.demo && !ts) return false; }   // 67 版：演示里只能按提示放，不能自己加宠物（用户加了一只把怪打死，演示卡住）
  G.energy -= def.cost; G.cooldown[key] = def.cd;
  const pet={key, def, lane, col, hp:def.hp, maxHp:def.hp, timer:def.shape==='producer'? def.prodInt*0.5 : 0.3,
               stun:0, armT: def.arm||0, flash:0, move:null, star:starOf(key)};
  G.pets.push(pet);
  G.stats.placed++; emit('place',{pet});
  recalcResonance();
  return true;
}
function movePet(pet,lane,col){
  if(G.swaps<1 || !inGrid(lane,col) || !laneOn(lane) || (pet.lane===lane&&pet.col===col)) return false;
  { const ts=tutCur(); if(ts && !(ts.kind==='move' && ts.pet===pet && ts.L===lane && ts.C===col)) return false; }
  const c=cellAt(lane,col); if(c && c.type==='crate' && c.hpNow>0) return false;
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
  if(opts && opts.burn){ e.burn = {dps:Math.max(e.burn?e.burn.dps:0, opts.burn.dps), t:opts.burn.t}; }
  if(opts && opts.slow){ e.slow = Math.max(e.slow||0, opts.slow); }
  if(e.hp<=0) killEnemy(e);
}
function killEnemy(e, silent){
  if(e.dead) return; e.dead=true; G.kills++; emit('death',{e,silent});
  G.fx.push({kind:'pop',lane:e.lane,p:e.p,t:0,life:0.4,color:EL[e.def.el].color});
  // 火系 5 连：灼烧死亡传火（灰盒里 5 连很难凑，先实现规则）
  if(e.burn && e.burn.t>0 && e.burnFromGroup5){
    const n = G.enemies.filter(o=>!o.dead&&Math.abs(o.lane-e.lane)<=1&&Math.abs(o.p-e.p)<1.2)[0];
    if(n) n.burn={dps:e.burn.dps,t:3};
  }
  if(silent || !e.def.drop || !DATA.pets[e.key]) return;   // 65 版：只有能收服成宠物的怪才掉碎片
  // 碎片掉落：看本关角色（drop），带保底 N = 2/p
  const k=e.key, p=e.def.drop, N=Math.round(2/p);
  G.pity[k]=(G.pity[k]||0)+1;
  if(Math.random()<p || G.pity[k]>=N){
    G.pity[k]=0;
    const n = Math.random()<0.5?1:2;
    G.shards[k]=(G.shards[k]||0)+n;
    G.shardsFx.push({lane:e.lane,p:e.p,t:0,life:0.9,n,key:k}); emit('shard',{e,n});
  }
}

// ---------- 攻击出手（前摇结束那一帧）----------
// 近战覆盖「前方 reach 格」：按怪物身体边缘判断，体型大的怪站得远也打得到
function meleeHits(pet){ const lo=pet.col+0.3, pr=propAhead(pet.lane,pet.col+1,pet.col+pet.def.reach), hi=pr ? pr.col+0.2 : pet.col+1+pet.def.reach;   // 道具挡住：道具后面的怪打不到
  return G.enemies.filter(e=>!e.dead&&e.lane===pet.lane&&e.p>=lo&&e.p-e.def.r<=hi); }
function petRelease(pet){
  const d=pet.def;
  if(d.shape==='shooter'){
    G.projs.push({lane:pet.lane,p:pet.col+0.8,speed:d.projSpeed,dmg:d.dmg*atkMul(pet),el:d.el,src:pet,
                  slow: pet.group&&pet.group.el==='water'&&pet.group.size>=3 ? 2 : 0}); emit('shoot',{pet});
    if(pet.key==='goldfish' && pet.star>=2 && !pet.second) pet.again=0.22;   // 2 星：每次连发 2 颗水弹（vfx-design.md 9.1）
    pet.second=false;
  } else if(d.shape==='melee'){
    const hits=meleeHits(pet), prop=meleeProp(pet); pet.swing=0.18;
    let burn = d.burn || null;
    if(pet.group && pet.group.el==='fire' && pet.group.size>=3) burn = {dps:Math.max(4,(burn||{}).dps||0), t:3};
    emit('melee',{pet,hits,prop});   // 出手时目标走开了也照样挥空（动画已经播了）
    if(prop) damageProp(prop, d.dmg*atkMul(pet), true);
    hits.forEach(e=>{ hitEnemy(e,d.dmg*atkMul(pet),d.el,{burn,src:pet}); if(pet.group&&pet.group.size>=5&&pet.group.el==='fire') e.burnFromGroup5=true; });
  }
}

// ---------- 更新 ----------
function update(dt){
  if(G.over) { G.fx.forEach(f=>f.t+=dt); return; }
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
    if(pet.stun>0){ pet.stun-=dt; pet.windup=0; pet.again=0; continue; }
    const d=pet.def;
    if(pet.again>0){ pet.again-=dt; if(pet.again<=0){ pet.second=true; petRelease(pet); } }
    if(pet.windup>0){ pet.windup-=dt; if(pet.windup<=0) petRelease(pet); continue; }   // 攻击前摇中：等动画走到出手那一帧
    // 草系 3 连：回血
    if(pet.group && pet.group.el==='grass' && pet.group.size>=3) pet.hp=Math.min(pet.maxHp, pet.hp+Math.min(pet.maxHp*0.01,6)*dt); // 每秒 1%，最多 6 点，防止草墙永动
    if(d.shape==='producer'){
      pet.timer-=dt;
      if(pet.timer<=0){
        let mul = (cellAt(pet.lane,pet.col)||{}).type==='flower' ? 1.2 : 1;
        if(pet.group && pet.group.el==='grass' && pet.group.size>=5) mul*=1.2;
        pet.timer = d.prodInt;
        G.orbs.push({lane:pet.lane,p:pet.col+0.5,value:Math.round(d.prod*mul),life:0,fall:0,pop:0.3,produced:true}); emit('produce',{pet});
      }
    } else if(d.shape==='shooter'){
      pet.timer-=dt;
      if(pet.timer<=0){
        const target = G.enemies.some(e=>!e.dead&&e.lane===pet.lane&&e.p>pet.col+0.3&&e.p<COLS+0.3) || G.cells.some(c=>propAlive(c)&&c.marked&&c.lane===pet.lane&&c.col>pet.col);
        if(target){ pet.timer=d.int; pet.windup=d.windup; emit('attackStart',{pet}); }
        else pet.timer=0.1;
      }
    } else if(d.shape==='melee'){
      pet.timer-=dt;
      if(pet.timer<=0){
        // 近战覆盖「前方 reach 格」：按怪物身体边缘判断，体型大的怪站得远也打得到
        if(meleeHits(pet).length || meleeProp(pet)){ pet.timer=d.int; pet.windup=d.windup; emit('attackStart',{pet}); }
        else pet.timer=0.1;
      }
      if(pet.swing) pet.swing=Math.max(0,pet.swing-dt);
    } else if(d.shape==='mine'){
      if(pet.armT>0){ pet.armT-=dt; continue; }
      const trig=G.enemies.find(e=>!e.dead&&e.lane===pet.lane&&e.p>=pet.col-0.1&&e.p<=pet.col+(e.def.range?1.9:1.1));   // 69 版：远程怪隔格停下，踩不到面前的波姆 → 触发距离按射程加长
      if(trig){
        G.enemies.forEach(e=>{ if(!e.dead&&Math.abs(e.lane-pet.lane)<=1&&e.p>=pet.col-1&&e.p<=pet.col+2) hitEnemy(e,d.dmg,d.el); });
        G.cells.forEach(c=>{ if(propAlive(c)&&Math.abs(c.lane-pet.lane)<=1&&c.col>=pet.col-1&&c.col<=pet.col+1) damageProp(c,d.dmg,true); });
        G.fx.push({kind:'boom',lane:pet.lane,p:pet.col+0.5,t:0,life:0.5}); emit('boom',{pet});
        pet.dead=true;
      }
    }
  }
  // 弹道
  for(const pr of G.projs){
    pr.p += pr.speed*dt;
    // 木箱挡弹道
    const c = G.cells.find(c=>c.type==='crate'&&c.hpNow>0&&c.lane===pr.lane&&pr.p>=c.col+0.2&&pr.p<=c.col+0.9);
    if(c){ pr.dead=true; damageProp(c, pr.dmg, true); continue; }
    const e = G.enemies.filter(e=>!e.dead&&e.lane===pr.lane&&Math.abs(e.p-pr.p)<e.def.r+0.1).sort((a,b)=>a.p-b.p)[0];
    if(e){ emit('projhit',{pr,e}); hitEnemy(e,pr.dmg,pr.el,{slow:pr.slow,src:pr.src}); pr.dead=true; G.fx.push({kind:'spark',lane:pr.lane,p:pr.p,t:0,life:0.2,color:EL[pr.el].color}); }
    if(pr.p>COLS+0.6) pr.dead=true;
  }
  // 怪物
  for(const e of G.enemies){
    if(e.dead) continue;
    e.flash=Math.max(0,e.flash-dt);
    if(e.burn){ e.burn.t-=dt; e.hp-=e.burn.dps*dt; e.burnAcc=(e.burnAcc||0)+e.burn.dps*dt; e.burnTick=(e.burnTick||0)+dt;
      if(e.burnTick>=0.5 && e.burnAcc>=1){ emit('burnTick',{e,dmg:e.burnAcc}); e.burnTick=0; e.burnAcc=0; }
      if(e.burn.t<=0){ e.burn=null; e.burnTick=0; } if(e.hp<=0){ killEnemy(e); continue; } }
    if(e.slow>0) e.slow-=dt;
    if(e.def.enrage && !e.rage && e.hp<=e.maxHp*e.def.enrage.at){ e.rage=true; emit('enrage',{e}); }   // 棘背蜥：半血后发怒
    const spd = e.def.speed*(e.slow>0?0.85:1)*(e.rage?e.def.enrage.speed:1)*(e.rush||1);
    // 被谁挡住：同 lane、非地雷、身后的最近宠物
    const ext = e.def.range && e.p<=COLS-0.2 ? e.def.range-0.6 : 0;   // 69 版：远程的怪（喷火蜥）隔着停下，停的位置近战 1 格够不着；先走进棋盘再停（宠物放在最后两格时不能停在棋盘外）
    const inReach = c => e.p>c+0.2 && e.p<=c+1+e.def.r*0.6+ext;
    const blocker = G.pets.filter(p=>!p.dead&&p.lane===e.lane&&p.def.shape!=='mine'&&inReach(p.col))
                          .sort((a,b)=>b.col-a.col)[0];
    const pb = G.cells.filter(c=>propAlive(c)&&c.lane===e.lane&&inReach(c.col)).sort((a,b)=>b.col-a.col)[0];
    const tgt = pb && (!blocker || pb.col>blocker.col) ? pb : blocker;   // 离怪最近的那个挡住它：宠物或道具
    e.blocked=!!tgt;
    if(tgt){
      // 先起手（播攻击动画），到出手那一帧才扣血
      if(e.windup>0){ e.windup-=dt;
        if(e.windup<=0){ const bt=e.biteTarget, alive=bt && (bt.type==='crate' ? propAlive(bt) : !bt.dead), t=alive?bt:tgt;
          const hurt = q => { q.hp-=e.def.atk; q.flash=0.12; if(q.hp<=0 && !q.dead){ q.dead=true; G.stats.lost=(G.stats.lost||0)+1; emit('petdeath',{pet:q}); G.fx.push({kind:'pop',lane:q.lane,p:q.col+0.5,t:0,life:0.4,color:'#ccc'}); } };
          if(t.type==='crate'){ e.bite=0.15; emit(e.def.range?'breath':'propBite',{e,c:t,pets:[]}); damageProp(t, e.def.atk, false); }
          else if(e.def.range){ const wall=pb?pb.col:-1, hits=G.pets.filter(p=>!p.dead&&p.lane===e.lane&&p.def.shape!=='mine'&&p.col>wall&&inReach(p.col));   // 喷火：范围内的宠物都烧到；道具后面的烧不到
            e.bite=0.15; emit('breath',{e,pets:hits}); hits.forEach(hurt); }
          else { e.bite=0.15; emit('bite',{e,pet:t}); hurt(t); } } }
      e.atkT-=dt;
      if(e.atkT<=0 && !(e.windup>0)){ e.atkT=e.def.atkInt*(e.rage?e.def.enrage.atkInt:1); e.windup=e.def.windup; e.biteTarget=tgt; emit('biteStart',{e,pet:tgt}); }
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
        G.enemies.forEach(o=>{ if(!o.dead&&o.lane===e.lane) killEnemy(o,true); });
      } else if(!G.over && !G.demo){ G.over={win:false}; G.overT=0; emit('lose'); }
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
  const exp=400, coins=100+G.kills*5;
  // 65 版：每关首次通关只给一样东西（关卡设计.md）：宠物碎片（数量固定）或一个新机制
  const rw = DATA.level.first ? DATA.level.reward : null; let unlock=null;
  if(rw && rw.shard) G.shards[rw.shard[0]]=(G.shards[rw.shard[0]]||0)+rw.shard[1];
  if(rw && rw.unlock && !PROFILE.unlock[rw.unlock]){ PROFILE.unlock[rw.unlock]=1; profileSave(); unlock=rw.unlock; }
  G.over={win:true, stars, exp, coins, unlock, summon: rw && rw.shard ? rw.shard[0] : null}; G.overT=0; emit('win',{stars});
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

