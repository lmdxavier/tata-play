'use strict';
/* =====================================================================
   塔塔 · 局外界面（13 版）：底部切换 战斗 / 宠物 / 营地
   宠物页按 docs/玩法与界面.md 第 2 节：
     竖屏 = 上方角色区约 40%（放大的动态角色）+ 下方面板（网格 ⇄ 详情）
     横屏 = 同一结构转成 左：网格 / 详情，右：角色区
   13 版改动（用户 2026-11-12）：
     - 界面素材换成 LayerLab GUI Pro - Fantasy Hero：角色区 = 稀有度渐变 + 花纹 + 光晕 + 法阵（照 Collection_Detail 预制体的颜色），
       不再用风景图；卡片 = CardFrame_Rectangle_02 分层卡（照 Collection_List）。
     - 进详情：在角色区（或面板标题栏）向下拉，详情随拉动距离逐渐淡入、网格同步淡出；拉到底或松手过阈值 = 完整详情，
       没过阈值松手平滑退回。拖动中直接跟手，不做缓动；松手后指数趋近目标，不回弹。
     - 升级 / 升星 / 进化（召唤）按钮固定在详情区上方，不随内容滚动。
   15 版（用户 2026-11-12 批评画风不符）：底栏改成 Fantasy Hero TabMenu_BottomFlush_02（图标也换成 Fantasy Hero 的 ItemIcon，
     不再用巴哥头像、village 公告板）；背景 B 去掉伪 3D 的 Background_01，改用平涂的 Background_Sample02 远景；
     卡片照 Collection_List 排：左上角标 = 元素、左下圆标 = 职能、名字和星级在右下、头像占满卡面；战斗 / 营地页的缎带、按钮换成 Fantasy Hero。
   16 版（用户 2026-11-12：卡片、底栏和 Fantasy Hero 原样不一样）：卡片、底栏改成严格照预制体还原——
     CardFrame_Rectangle_02_<色>.prefab、Label_Flag_01、BaseFrame_Basic_Circle_H58、Grade_Stars、TabMenu_BottomFlush_01，
     每层的贴图、九宫格、位置、尺寸、颜色都取自预制体（单位 u = 卡宽 / 320）；职能图标换成 Fantasy Hero 的 PictoIcon。
   17 版（用户 2026-11-12）：卡面宠物按自身宽高缩放（横向长的不再被裁掉）；BgDeco 放射纹按卡片缩小倍数补偿不透明度，游戏尺寸下也看得见。
   18 版（用户 2026-11-12：双击打开 index 卡死）：16、17 版读画布像素，file:// 下画布被视为跨域、一读就报错，整帧中断。
     改成游戏里完全不读像素：卡面头像的内容范围离线量好放在 card_bbox.js（tools/card_bbox.js 生成），放射纹加深改成叠画。
   19 版（用户 2026-11-12：照剑与远征：启程 玩法目录 / 英雄厅堂截图的配色试一版）：加一套“启程”配色——米白面板、暖灰深色、
     金色分隔线、卡片按稀有度用暖调（绿 / 蓝灰 / 紫 / 金橙）+ 浅色描边 + 投影；Fantasy Hero 原配色保留，可切换（左上“配色”按钮或 P 键）。
     20 版（用户 2026-11-12）：稀有度卡色按启程的 红 > 黄 > 紫（传说红、史诗黄、稀有紫；普通用蓝灰，启程没有这一档），颜色取自英雄厅堂截图；
     卡片加启程那种柔和的暖灰投影（卡片正下方，模糊）；卡底部渐变改用各稀有度深一号的颜色（原来统一深棕会把黄卡压成棕色）。
     所有颜色集中在 TH_FH / TH_AFK 两张表，绘制代码只读 MT_PAL / MT_UI / NAV_C / TH。
   只读 DATA / OWNED 和 render.js 的绘图工具，战斗逻辑不动。
   ===================================================================== */
const meta = n => img('meta/'+n+'.png');
const hero = n => img('hero/'+n+'.png');
const MT = {
  tab:'camp', inBattle:false,   // 32 版：营地是主界面（底栏正中），打开游戏先到营地
  sel:null, prevSel:null, detail:false, dp:0, swapT:0,
  snap:'mid', panelY:null, drag:null,
  gs:0, ds:0, sv:0, gmax:0, dmax:0,
  fEl:'all', fRole:'all',
  hits:[], toast:null, last:performance.now(), charV:{}, lay:null,
  theme:'afk',     // 配色：afk = 启程配色（19 版新加），fh = Fantasy Hero 原配色
  bgMode:'scene',  // 29 版默认 = 分层场景； 角色区背景两种方案对比（用户 2026-11-12 要求都做）：grad = 渐变纯色，scene = 场景远景
};
try{ const t=localStorage.getItem('tata_theme'); if(t==='afk'||t==='fh') MT.theme=t; }catch(e){}
try{ const m=localStorage.getItem('tata_petbg29'); if(m==='grad'||m==='scene') MT.bgMode=m; }catch(e){}
// 37 版（用户 2026-11-13：界面太扁，想要层次）：界面三档对比，选定后删掉另外两档。只在启程配色下生效。
//   flat = 36 版原样；depth = 描边 + 底部厚边 + 投影 + 图标 / 宠物出框 + 按下下沉；deco = depth + Fantasy RPG 包的装饰件（按启程配色重新着色）
MT.ui = 'depth';   // 44 版（用户 2026-11-13）：默认立体
try{ const u=localStorage.getItem('tata_ui44'); if(u==='flat'||u==='depth'||u==='deco') MT.ui=u; }catch(e){}
const PULL = 190;   // 向下拉多少（设计像素）= 完整详情
// 职能图标：Fantasy Hero PictoIcon（卡片左下圆标里就是它）；包里没有炸弹，地雷用 Critical（爆炸形）
const ROLE_ICON = {producer:'PictoIcon_Thunder', shooter:'PictoIcon_Bow', melee:'PictoIcon_Attack', wall:'PictoIcon_Shield', mine:'PictoIcon_Critical'};
const roleIcon = r => hero(ROLE_ICON[r]);
// PictoIcon 是白图：启程配色的浅底上按深色着色，选中（深底）时用浅色
const roleIco = (r, on) => MT.theme==='afk' ? heroT(ROLE_ICON[r], on?'#f4f0e7':'#8d8485') : roleIcon(r);
const ROLE_CN = {producer:'生产', shooter:'远程', melee:'近战', wall:'坦克', mine:'地雷'};
const EL_CN = {fire:'火', water:'水', grass:'草', none:'无'};
const POS_CN = {flower:'生产 · 能量', goldfish:'远程 · 单体直射', pug:'近战 · 前方群体', pumpkin:'坦克 · 阻挡', bomb:'地雷 · 范围爆发', lizard:'近战 · 喷火灼烧'};
// 升星后攻击方式的变化：照抄 docs/vfx-design.md 9.1（提案），那边改了这里跟着改
const STAR_ROUTE = {
  // 31 版（用户 2026-11-12：不要“偶尔、少量”这种描述，概率、数值直接写出来）：数值是提案，平衡时再调
  goldfish:['每次连发 2 颗水弹（同一路）','命中溅射周围 0.5 格，溅射伤害 40%'],
  pug:['每第 4 口变重咬：伤害 ×2，击退 0.5 格','攻击范围 前方 1 格 → 1×2'],
  lizard:['喷火范围 2 格 → 3 格','地面留火 2 秒，每秒 30% 伤害'],
  bomb:['装填时间 -30%','爆炸范围 3×3 → 5×3'],
  flower:['产能 +25%','每次产出 20% 概率双倍'],
  pumpkin:['生命 +40%','被咬时反弹 20% 伤害'],
};
const RAR_RANK = {legend:3, epic:2, rare:1, common:0};
// 稀有度配色：角色区 top / glow / bot 取自 Fantasy Hero 的 Collection_Detail_1~4 预制体；
// 卡片 card / cardG / cardSil 取自 CardFrame_Rectangle_02_Green / Blue / Purple / Yellow 预制体（Bg / BgGradient / 剪影）；等级角标取自 Label_Grade_Octagon_01_*
const MT_PAL = {
  common:{top:'#02ad6e', glow:'#0dc36a', bot:'#215746', card:'#1f5949', cardG:'#00a373', cardSil:'#27434a', lab:'#4c8868', labIn:'#50ab86', sil:'#2b5a46'},
  rare:  {top:'#4ba2b6', glow:'#48b0c6', bot:'#065475', card:'#065475', cardG:'#308ba0', cardSil:'#05435e', lab:'#3d558d', labIn:'#3d75b3', sil:'#283f66'},
  epic:  {top:'#9570d3', glow:'#a372da', bot:'#644e8c', card:'#7251a6', cardG:'#906cce', cardSil:'#4c3673', lab:'#9147c6', labIn:'#b363de', sil:'#4c3673'},
  legend:{top:'#b77f4d', glow:'#c18b52', bot:'#5c4248', card:'#936541', cardG:'#d29f5a', cardSil:'#704733', lab:'#b07a2a', labIn:'#ebb62d', sil:'#6a4a26'},
};
const MT_UI = {panel:'#241d38', pattern:'#2e2844', box:'#352952', boxHi:'#41356a', sub:'#b4a8d8', gold:'#ffd36a', border:'#1b142e', txt:'#fff', txt2:'#e6defa', stroke:'#1b142e'};
// ---------- 两套配色（切换时把数值拷进 MT_PAL / MT_UI / NAV_C，其余颜色读 TH） ----------
const TH_FH = {
  pal: JSON.parse(JSON.stringify(MT_PAL)), ui: {...MT_UI},
  nav: {off:{bg:'#3b304e', light:'#565076', shadow:'#332b47'}, on:{bg:'#7550d2', light:'#8f8fff', shadow:'#593da1'}, border:'#151428'},
  navLab:'#fff', navLabS:'#1b142e',
  card:{border:'#1b142e', front:'#31274c', flagBg:'#675fd8', flagG:'#9197ff', flagIn:'#9197ff', flagBd:'#23213e', roleBg:'#1e1c36', roleIc:'#ddd4f3',
        name:'#fff', nameOff:'#d8d0f0', stroke:'#1b142e', shadow:null},
  octBd:'#281f41', stageFade:'#241d38', panelGrad:'#1a1430', edge:'rgba(255,255,255,.10)', gold:null, handle:'rgba(255,255,255,.32)', rim:null,
  sep:'rgba(255,255,255,.08)', filtOn:'#7a5fc4', charStroke:'#1b142e', pill:'#241d38',
};
// 启程配色：取色自用户给的剑与远征：启程截图（面板 #e9e6dd、深色暖灰 #685d5b、金线 #dfad64、卡片红 #a5473a / 金橙 #c8874d / 紫 #745f8d、绿按钮 #749965）
const TH_AFK = {
  pal: {   // card = 卡底（下半，较亮），cardG = 卡顶渐变层（较深）；照启程卡片：红卡上深下亮、黄卡上橙下黄、紫卡薰衣草紫
    // 27 版（用户 2026-11-12 给截图指定）：普通用 Fantasy Hero 原配色的蓝（原配色「稀有」档：卡底 #065475、顶部 #308ba0、底部紫渐变 #31274c），取色自用户截图
    // 30 版（用户 2026-11-12：27 版的蓝绿和整体暖色不协调）：普通改成低饱和的灰蓝（色相约 214°），明度和稀有的薰衣草紫相当，比蓝绿淡、不发青
    // 31 版（用户 2026-11-12：30 版普通蓝有点淡，饱和度高一点）：明显的蓝（不偏青），和未解锁的灰蓝拉开
    common:{top:'#b4cdee', glow:'#eef4fc', bot:'#3f5f8f', card:'#6f9bd1', cardG:'#507fbd', front:'#44699f', cardSil:'#3d5d8c', lab:'#507fbd', labIn:'#6f9bd1', sil:'#355280'},
    rare:  {top:'#c3b3e2', glow:'#f4effa', bot:'#6c56a0', card:'#a084cf', cardG:'#8467b8', front:'#6a50a0', cardSil:'#5c4790', lab:'#8467b8', labIn:'#a084cf', sil:'#4f3d7c'},
    epic:  {top:'#f2d29a', glow:'#fff6e2', bot:'#b9773d', card:'#efc27a', cardG:'#cf8a46', front:'#c47e3a', cardSil:'#a06a32', lab:'#cf8a46', labIn:'#efc27a', sil:'#8a5a2a'},
    legend:{top:'#e08d84', glow:'#fde9e4', bot:'#8f2f33', card:'#bd3d41', cardG:'#a1343a', front:'#8c282d', cardSil:'#7c2428', lab:'#a1343a', labIn:'#bd3d41', sil:'#6c2024'},
  },
  // 26 版：未解锁的卡片不分稀有度，统一用 20～25 版普通卡的灰蓝
  // 30 版：未解锁 = 最淡、几乎不带颜色的浅灰（和普通的灰蓝拉开：普通有颜色，未解锁是“褪了色”）
  // 31 版（用户 2026-11-12：30 版浅灰太淡，改回原来的蓝灰，“刚好”）
  locked:{top:'#b9c7d4', glow:'#f1f4f7', bot:'#5f7489', card:'#8fa3b8', cardG:'#6f869c', front:'#5f7489', cardSil:'#56687a', lab:'#8fa3b8', labIn:'#a9bacb', sil:'#4d5e70'},
  ui: {panel:'#eae7de', pattern:'#e1dccf', box:'#f7f4ee', boxHi:'#ffffff', sub:'#8d8485', gold:'#b07a3a', border:'#4f4644', txt:'#4f4548', txt2:'#5e5557', stroke:false},
  nav: {off:{bg:'#685d5b', light:'#776c69', shadow:'#5f5553'}, on:{bg:'#f1ece1', light:'#ffffff', shadow:'#e2dccf'}, border:'#4f4644'},
  navLab:'#4f4548', navLabS:false,   // 53 版（用户 2026-11-13：「底部按钮的字体和颜色改成统一的剑与远征黑棕色」）：原来是绿 #5f8a57；改成和面板标题、关卡名同一个黑棕（ui.txt），同一字体同一字重，不描边
  card:{border:'#fbf8f1', front:'#3a2f2c', flagBg:'#f4f0e7', flagG:'#ffffff', flagIn:'#ffffff', flagBd:'#b9aea8', roleBg:'#4f4548', roleIc:'#f4f0e7',
        name:'#fff', nameOff:'#f0ebe0', stroke:'#3a2f2c', shadow:'rgba(84,64,50,.58)',
        flagBgA:'#4f4548', flagGA:'#5d5255', flagInA:'#6b6062', flagBdA:'#3a3133', sel:'#f2c35f', selGlow:'rgba(242,195,95,.75)'},
  octBd:'#4f4644', stageFade:'#6a5f58', panelGrad:'#ddd6c8', edge:null, gold:'#dfad64', handle:'rgba(79,70,68,.25)',
  // 22 版面板顶边（启程英雄厅堂「共鸣等级」那一圈），颜色取自截图
  rim:{shadow:'30,14,9', gold:'#d4a05a', inner:'#4f302b', edgeHi:'#fbeee0', back:'#8e7f82', stripe:'222,180,110', spark1:'#e8be6e', spark2:'#c9bcc6', back2:'#e3aa51', stripe2:'252,222,160',
       bar:{body:'#4f4647', left:'#5e5354', right:'#585051', dot:'#9a9192', arrow:'rgba(255,255,255,.75)'}},
  sep:'rgba(79,70,68,.12)', filtOn:'#685d5b', charStroke:'#3a302d', pill:'#4f4644',
};
let TH = TH_FH;
function applyTheme(){
  const T = MT.theme==='afk' ? TH_AFK : TH_FH;
  for(const r in T.pal) Object.assign(MT_PAL[r], T.pal[r]);
  Object.assign(MT_UI, T.ui); Object.assign(NAV_C.off, T.nav.off); Object.assign(NAV_C.on, T.nav.on); NAV_C.border=T.nav.border;
  TH=T; for(const k in CARDPORT) delete CARDPORT[k]; for(const k in SIL) delete SIL[k]; MT._th=MT.theme;
}
function mtToggleTheme(){ MT.theme = MT.theme==='afk'?'fh':'afk'; try{ localStorage.setItem('tata_theme', MT.theme); }catch(e){} applyTheme(); emit('ui'); }

// ---------- 名单：已获得的宠物 + 能用碎片召唤的怪物 ----------
let ROSTER = null;
function roster(){
  if(ROSTER) return ROSTER;
  // 65 版：名单 = 已召唤的宠物 + 已经拿到碎片、还没召唤的宠物（没见过的不提前露出）
  const all = PET_ORDER.filter(k=>PROFILE.owned[k] || shardHave(k)>0).map(k=>{ const d=DATA.pets[k], o=!!PROFILE.owned[k]; return {key:k, owned:o, d, el:d.el, role:d.shape, rar:d.rarity||'common', cn:d.cn, stars:o?starOf(k):0}; });
  const own = all.filter(e=>e.owned).sort((a,b)=>RAR_RANK[b.rar]-RAR_RANK[a.rar]), mons = all.filter(e=>!e.owned);
  ROSTER = [...own, ...mons];
  if(MT.sel && !ROSTER.some(e=>e.key===MT.sel)) MT.sel=null;
  if(!MT.sel) MT.sel = ROSTER[0].key;
  return ROSTER;
}
const entry = k => roster().find(e=>e.key===k);
const filtered = () => roster().filter(e=>(MT.fEl==='all'||e.el===MT.fEl) && (MT.fRole==='all'||e.role===MT.fRole));
const shardHave = k => (typeof OWNED!=='undefined' && OWNED[k]) || 0;
const petVis = k => PET_SPINE[k] ? newSpine(PET_SPINE[k]) : newMon(PET_MON[k]||ENEMY_MON[k],'Idle');   // 65 版：没召唤的宠物也用它自己的样子（原来未获得的一律当怪物）
const canSummon = k => !!DATA.pets[k] && !PROFILE.owned[k] && shardHave(k) >= RAR[DATA.pets[k].rarity||'common'].need;
// 69 版：升星。只开放战斗里已经做出变化的星级（其余的先不让升，免得花了碎片没效果）；所需碎片数先用召唤数
const STAR_OPEN = {goldfish:2};
const starNeed = k => RAR[DATA.pets[k].rarity||'common'].need;
const starOpen = k => !!PROFILE.owned[k] && starOf(k) < (STAR_OPEN[k]||1);
const canStarUp = k => !!DATA.pets[k] && starOpen(k) && shardHave(k) >= starNeed(k);
function starUp(k){
  if(!canStarUp(k)) return false;
  OWNED[k] -= starNeed(k); try{ localStorage.setItem('tata_shards', JSON.stringify(OWNED)); }catch(e){}
  PROFILE.stars=PROFILE.stars||{}; PROFILE.stars[k]=starOf(k)+1; PROFILE.tipStar=1; profileSave();
  ROSTER=null; delete CARDPORT[k]; MT.sel=k; MT.guide=null;
  { const lay=MT.lay, ch=lay&&lay.char; COMBO.play('升星', {x:ch?ch.x+ch.w/2:W/2, y:ch?ch.y+ch.h*0.55:H*0.3}, {scale:3}); }
  toast(DATA.pets[k].cn+'升到 '+starOf(k)+' 星');
  return true;
}
// 召唤：碎片够了点一下，变成自己的宠物
function summonPet(k){
  if(!canSummon(k)) return false;
  OWNED[k] -= RAR[DATA.pets[k].rarity||'common'].need; try{ localStorage.setItem('tata_shards', JSON.stringify(OWNED)); }catch(e){}
  PROFILE.owned[k]=1; profileSave();
  ROSTER=null; delete CARDPORT[k]; delete MT.charV[k]; MT.sel=k; MT.guide=null; MT.summonT=performance.now();
  if(!PROFILE.tipSummon){ PROFILE.tipSummon=1; profileSave(); }
  if(!PROFILE.tipPanel && MT.lay && !MT.lay.land){ MT.ptut=1; MT.ptutT=performance.now()+1400; }   // 第一次召唤完：教面板能上下拖（等光柱播完再出现）
  { const lay=MT.lay, ch=lay&&lay.char; COMBO.play('召唤', {x:ch?ch.x+ch.w/2:W/2, y:ch?ch.y+ch.h*0.55:H*0.3}, {scale:3}); }   // 光柱 + 上扬音（效果组合「召唤」）
  toast('召唤了'+DATA.pets[k].cn);
  return true;
}

// ---------- 布局：竖屏上下、横屏左右（按当前方向算，不写死） ----------
// 53 版（用户 2026-11-13：「底部按钮和白色区域整体再减低15%，图标调整accordingly」）：竖屏底栏底板、按钮高度、按钮高出底栏的量、底边留白、选中抬高都 × NAV_K；
//   图标和文字按按钮高度算（图标下沿仍在按钮面 2/3 处），跟着一起变小。
const NAV_K = 0.85, NAV_BAR_H = Math.round(76*NAV_K), NAV_BOT = Math.round(6*NAV_K);
function metaLayout(){
  if(L.kind==='landscape'){
    const navW = 96, gw = Math.round((W-navW)*0.56);
    return { land:true, nav:{x:0,y:0,w:navW,h:H}, content:{x:navW,y:0,w:W-navW,h:H},
      char:{x:navW+gw, y:0, w:W-navW-gw, h:H}, panel:{x:navW, w:gw, bottom:H}, snaps:{mid:0} };
  }
  const navH = NAV_BAR_H + SAFE.b, charH = Math.round(H*0.40);   // 36 版：底栏下面垫上底部横条的安全区（底栏颜色铺到屏幕最底）
  return { land:false, nav:{x:0,y:H-navH,w:W,h:navH,pad:SAFE.b}, content:{x:0,y:0,w:W,h:H-navH},
    char:{x:0, y:0, w:W, h:charH}, panel:{x:0, w:W, bottom:H-navH},
    snaps:{full:SAFE.t, mid:charH-16}, top:SAFE.t };   // 36 版：面板拉满时停在刘海下面，拖动条不会藏到刘海后面
}
const HH = 52, FH = 82, AB = 66;   // 面板标题栏、筛选区、详情固定按钮栏高度

// ---------- 小工具 ----------
const inR = (r,x,y) => r && x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h;
function addHit(r, fn, clip){
  if(clip){ const x0=Math.max(r.x,clip.x), y0=Math.max(r.y,clip.y), x1=Math.min(r.x+r.w,clip.x+clip.w), y1=Math.min(r.y+r.h,clip.y+clip.h);
    if(x1<=x0||y1<=y0) return; r={x:x0,y:y0,w:x1-x0,h:y1-y0}; }
  MT.hits.push({r, fn});
}
function cover(im, r, ay){ if(!ok(im)) return; const s=Math.max(r.w/im.naturalWidth, r.h/im.naturalHeight), w=im.naturalWidth*s, h=im.naturalHeight*s;
  ctx.drawImage(im, r.x+(r.w-w)/2, r.y+(r.h-h)*(ay==null?0.5:ay), w, h); }
function toast(s){ MT.toast={s, t:1.6}; }
// 九宫格（Unity spriteBorder 顺序：左、下、右、上），k = 边框缩放
// 35 版（手机发烫、宠物页卡）起九宫格只拼一次、之后整张贴；36 版和 render.js 的 nine() 共用 nineCached（顺带消除缩放动画时的接缝线）
function mtNine4(im, x, y, w, h, bd, k){
  if(!ok(im) || w<=0.01 || h<=0.01) return;
  const m=ctx.getTransform(), kx=Math.hypot(m.a,m.b), ky=Math.hypot(m.c,m.d);
  if(nineCached(im, 'm|'+bd.join(',')+'|'+(k*kx).toFixed(4)+'|'+(k*ky).toFixed(4), x, y, w, h, ()=>mtNine4Raw(im, 0, 0, w, h, bd, k))) return;
  mtNine4Raw(im, x, y, w, h, bd, k);
}
function mtNine4Raw(im, x, y, w, h, bd, k){
  if(!ok(im)) return; const W0=im.naturalWidth, H0=im.naturalHeight; const [l,b,r,t]=bd;
  let kx=k, ky=k; if((l+r)*kx>w) kx=w/(l+r); if((t+b)*ky>h) ky=h/(t+b);
  const sx=[0,l,W0-r,W0], sy=[0,t,H0-b,H0], dx=[x,x+l*kx,x+w-r*kx,x+w], dy=[y,y+t*ky,y+h-b*ky,y+h];
  // 很多 Fantasy Hero 边框图左右（或上下）边框加起来等于整张图宽，中间可拉伸部分为 0：这时取交界处 1 像素拉伸，不能留空（13 版留空导致框中间透明）
  for(let i=0;i<3;i++) for(let j=0;j<3;j++){ let ssx=sx[i], sw=sx[i+1]-sx[i], ssy=sy[j], sh=sy[j+1]-sy[j]; const dw=dx[i+1]-dx[i], dh=dy[j+1]-dy[j];
    if(dw<=0.01||dh<=0.01) continue;
    if(sw<=0){ ssx=Math.min(W0-1, Math.max(0, sx[i]-0.5)); sw=1; }
    if(sh<=0){ ssy=Math.min(H0-1, Math.max(0, sy[j]-0.5)); sh=1; }
    ctx.drawImage(im, ssx,ssy,sw,sh, dx[i],dy[j],dw,dh); }
}
const heroT = (n, c) => tinted('hero/'+n+'.png', c);
// 25 版（用户 2026-11-12）：启程配色的卡片只有右上、左下缺角，左上、右下是直角（不照剑与远征）。
//   Fantasy Hero 卡框素材四个角都是 45° 切角（约 16 像素），这里把左上、右下两个角块（18×18）清掉，
//   用紧挨着的一列 / 一行像素拉伸铺满补成直角。只用 drawImage，不读像素（file:// 下读像素会出错，见 18 版）。
const SQ = {};
function sqCorners(src, key){
  if(!src || !ok(src)) return null; if(SQ[key]) return SQ[key];
  const W=src.naturalWidth||src.width, H=src.naturalHeight||src.height, cs=Math.min(18, Math.floor(W/2)-1, Math.floor(H/2)-1);
  const c=document.createElement('canvas'); c.width=W; c.height=H; const g=c.getContext('2d'); g.imageSmoothingEnabled=false;
  g.drawImage(src,0,0);
  g.clearRect(0,0,cs,cs); g.drawImage(src, cs,0,1,cs, 0,0,cs,cs); g.drawImage(src, 0,cs,cs,1, 0,0,cs,cs);
  g.clearRect(W-cs,H-cs,cs,cs); g.drawImage(src, W-cs-1,H-cs,1,cs, W-cs,H-cs,cs,cs); g.drawImage(src, W-cs,H-cs-1,cs,1, W-cs,H-cs,cs,cs);
  c.complete=true; c.naturalWidth=W; c.naturalHeight=H; return SQ[key]=c;
}
const cardT = (n, c) => isAFK() ? sqCorners(heroT(n,c), n+'|'+c) : heroT(n,c);
const cardRaw = n => isAFK() ? sqCorners(hero(n), n+'|raw') : hero(n);
// 花纹平铺（Pattern_512 着色后做成 canvas pattern，缓存）
const MT_PAT = {};
function mtPattern(color){
  if(MT_PAT[color]) return MT_PAT[color]; const t=heroT('Pattern_512', color); if(!t) return null;
  return MT_PAT[color]=ctx.createPattern(t, 'repeat');
}
// 62b：面板底纹（带 ax/ay 的两处）——面板被拖动时区域高度每帧都变，原来每帧按新尺寸重画一整块花纹再上传（宠物页拖动卡、显存图猛涨的最大来源）。
//       改成按「最高能到多高」画一次存起来，之后只贴这张图的上面一段；摆放对齐整数屏幕像素。
const MT_PATBIG = new Map();
function mtFillPatternBig(color, r, alpha, scale){
  const t=heroT('Pattern_512', color); if(!t) return false;
  const m=ctx.getTransform(); if(m.b || m.c || !(m.a>0) || !(m.d>0)) return false;
  const kx=m.a, ky=m.d, pw=Math.round(r.w*kx), need=Math.round(r.h*ky); if(pw<1 || need<1) return true;
  const ox=Math.round((r.ax-r.x)*kx), oy=Math.round((r.ay-r.y)*ky), k=color+'|'+scale+'|'+pw+'|'+ox+','+oy+'|'+kx+','+ky;
  let c=MT_PATBIG.get(k);
  if(!c || c.height<need){
    if(!c && MT_PATBIG.size>=6){ for(const q of MT_PATBIG.values()){ q.width=0; q.height=0; } MT_PATBIG.clear(); }
    const ph=Math.max(need, ctx.canvas.height+Math.ceil(48*ky)); if(pw*ph>2600*2600) return false;
    if(c){ c.width=0; c.height=0; } c=document.createElement('canvas'); c.width=pw; c.height=ph; const g=c.getContext('2d'), pat=g.createPattern(t,'repeat'); if(!pat) return false;
    const sx=kx*scale, sy=ky*scale; g.translate(ox,oy); g.scale(sx,sy); g.fillStyle=pat; g.fillRect(-ox/sx, -oy/sy, pw/sx, ph/sy); MT_PATBIG.set(k,c); }
  ctx.save(); ctx.globalAlpha*=alpha; ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(c, 0, 0, pw, need, Math.round(m.a*r.x+m.e), Math.round(m.d*r.y+m.f), pw, need); ctx.restore();
  return true;
}
function mtFillPattern(color, r, alpha, scale){
  if(r.ax!=null && typeof DYN_TEXT!=='undefined' && DYN_TEXT && ctx.__dynText && ctx.canvas && mtFillPatternBig(color, r, alpha, scale)) return;
  const p=mtPattern(color); if(!p) return; ctx.save(); ctx.globalAlpha*=alpha; ctx.beginPath(); ctx.rect(r.x,r.y,r.w,r.h); ctx.clip();
  // ax/ay = 花纹原点（默认区域左上角）；区域往外扩时传原来的原点，花纹不移位
  const ax=r.ax!=null?r.ax:r.x, ay=r.ay!=null?r.ay:r.y;
  ctx.translate(ax, ay); ctx.scale(scale, scale); ctx.fillStyle=p; ctx.fillRect((r.x-ax)/scale,(r.y-ay)/scale,r.w/scale,r.h/scale); ctx.restore();
}
// 换行：句末标点不单独放到下一行开头
function wrapCN(str, w, size){ const ls=wrapText(str, w, size);
  for(let i=1;i<ls.length;i++) while(ls[i] && '。，、；：！？）」%'.includes(ls[i][0])){ ls[i-1]+=ls[i][0]; ls[i]=ls[i].slice(1); }
  return ls.filter(Boolean); }
// 26 版（用户 2026-11-12）：启程配色下所有按钮带和卡片一样的柔和暖灰投影（在按钮下面垫一块圆角形状投影，九宫格分块画时不会叠出拼缝）
function btnShadow(x, y, w, h, r){
  if(!isAFK() || !TH.card.shadow) return;
  ctx.save(); ctx.shadowColor=TH.card.shadow; ctx.shadowBlur=Math.min(11, h*0.26+3)*DPR; ctx.shadowOffsetY=Math.min(5.5, h*0.12+1.8)*DPR;   // 38 版：加深
  ctx.fillStyle=MT_UI.panel; rr(x+2, y+2, w-4, h-4, r); ctx.fill(); ctx.restore();
}
const isAFK = () => MT.theme==='afk';

// ---------- 37 版：界面三档（扁平 / 立体 / 装饰） ----------
const UI_CN = {flat:'扁平', depth:'立体', deco:'装饰'};
function mtToggleUi(){ MT.ui = {flat:'depth', depth:'deco', deco:'flat'}[MT.ui]; try{ localStorage.setItem('tata_ui44', MT.ui); }catch(e){} emit('ui'); }
const uiD = () => isAFK() && MT.ui!=='flat';     // 立体效果生效（deco 也包含）
const uiDeco = () => isAFK() && MT.ui==='deco';
// 颜色全部取自 TH_AFK 已有的值，不新增颜色：描边 = 旗子深边 #3a3133，深色按钮侧面 = #4f4548，浅色按钮侧面 = 旗子浅边 #b9aea8
const D37 = {out:'#3a3133', outL:'#685d5b', sideD:'#4f4548', sideL:'#b9aea8', gold:'#dfad64', gold2:'#f2c35f'};
// 按下下沉：记住按下的位置；按下期间按钮压到底，松手后 0.18 秒回弹（略微过冲）。手指一拖动（变成滚动 / 拉面板）就取消。
MT.press = null;
function pressK(r){ const p=MT.press; if(!p || !uiD() || !inR(r,p.x,p.y)) return 0; if(!p.up) return 1;
  const k=(performance.now()-p.up)/180; if(k>=1) return 0; return Math.cos(k*Math.PI*1.25)*(1-k); }
// 立体块：底部一条更深的“侧面”厚边 + 深色描边 + 柔和投影（简单形状，代码画）。s = 下沉量（0 = 抬起，1 = 压到底）。返回按钮面的位置。
//   厚边 T 和描边粗细照塔塔冒险队底栏按钮量：按钮高 200（1170 宽截图）→ 外描边约 7、底边描边约 10，换算成按钮高的 9% / 3.4%
function dBox(x, y, w, h, r, face, side, out, s){
  const T=Math.max(2.5, Math.min(5, h*0.09)), lw=Math.max(1.25, Math.min(2.2, h*0.034)), fy=y+T*(s||0);
  btnShadow(x, y+T*0.5, w, h-T*0.5, r);
  ctx.save(); ctx.lineWidth=lw; ctx.strokeStyle=out;
  rr(x, y+T, w, h-T, r); ctx.fillStyle=side; ctx.fill(); ctx.stroke();
  rr(x, fy, w, h-T, r); ctx.fillStyle=face; ctx.fill(); ctx.stroke();
  ctx.restore();
  return {x, y:fy, w, h:h-T, T};
}
// 重新着色（Fantasy RPG 包的部件是白 / 灰图）：按原图明暗 L 在 dark → light 两色之间取色：颜色 = dark + min(1, L×gain)×(light − dark)，透明度不变。
//   原图的黑描边 → dark（启程的深暖灰），亮面 → light。只用合成，不读像素（file:// 下读像素会出错，见 18 版）。
const RECOL = {};
const hexRGB = h => [1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
function recolor(path, dark, light, gain){
  const k=path+'|'+dark+'|'+light+'|'+(gain||1); if(RECOL[k]) return RECOL[k]; const im=img(path); if(!ok(im)) return null;
  const W0=im.naturalWidth, H0=im.naturalHeight, d=hexRGB(dark), l=hexRGB(light);
  const diff='#'+l.map((v,i)=>Math.max(0,v-d[i]).toString(16).padStart(2,'0')).join('');
  const t=document.createElement('canvas'); t.width=W0; t.height=H0; const tg=t.getContext('2d');
  tg.fillStyle='#000'; tg.fillRect(0,0,W0,H0); tg.drawImage(im,0,0);                 // 明暗 L（压在黑底上）
  if(gain>1){ tg.globalCompositeOperation='lighter'; for(let i=1;i<gain;i++) tg.drawImage(t,0,0); }
  tg.globalCompositeOperation='multiply'; tg.fillStyle=diff; tg.fillRect(0,0,W0,H0); // L × (light − dark)
  const c=document.createElement('canvas'); c.width=W0; c.height=H0; const g=c.getContext('2d');
  g.fillStyle=dark; g.fillRect(0,0,W0,H0); g.globalCompositeOperation='lighter'; g.drawImage(t,0,0);
  g.globalCompositeOperation='destination-in'; g.drawImage(im,0,0);
  c.complete=true; c.naturalWidth=W0; c.naturalHeight=H0; return RECOL[k]=c;
}
// Fantasy RPG 的按钮 btn_rectangle_01_n_white（179×111，九宫格 左90 下55 右89 上56，取自包里的 .meta）：黑描边 + 倒角边线 + 四角斜切 + 底部暗边和投影
const RPG_BTN = 'rpg/btn_rectangle_01_n_white.png', RPG_BTN_BD = [90,55,89,56];
function rpgButton(x, y, w, h, face, out){ const im=recolor(RPG_BTN, out, face); if(!im) return; mtNine4(im, x, y, w, h, RPG_BTN_BD, h/111); }
// 按钮面上沿一条很淡的亮线（塔塔冒险队按钮面顶部有一条比面亮的细线）
function dHi(f, r){ ctx.save(); ctx.beginPath(); ctx.moveTo(f.x+r, f.y+2); ctx.lineTo(f.x+f.w-r, f.y+2); ctx.strokeStyle='rgba(255,255,255,.16)'; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore(); }
// （用户 2026-11-12 更正：要的是按钮加阴影，不是图标；图标阴影撤掉，函数保留为直接绘制）
function withIconShadow(size, fn){
  if(true){ fn(); return; }
  ctx.save(); ctx.shadowColor=TH.card.shadow; ctx.shadowBlur=size*0.22*DPR; ctx.shadowOffsetY=size*0.1*DPR; fn(); ctx.restore();
}
const drawIconSh = (im, cx, cy, size, alpha) => withIconShadow(size, ()=>drawImgC(im, cx, cy, size, alpha));
function iconCircle(im, cx, cy, d){
  ctx.fillStyle='#1d1630'; ctx.beginPath(); ctx.arc(cx,cy,d/2,0,7); ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.22)'; ctx.lineWidth=1.5; ctx.stroke();
  drawIconSh(im, cx, cy, d*0.66);
}
// Fantasy Hero 主按钮（Button_01_Mian_l，九宫格边框 左34 下53 右34 上36）
function heroButton(on, x, y, w, h, label){
  if(uiD()){   // 37 版：立体 = 原按钮 + 深色描边 + 底部厚边，按下下沉；装饰 = Fantasy RPG 倒角按钮按启程配色着色（可用 = 金 #dfad64、未开放 = 暖灰 #8d8485）
    const s=pressK({x,y,w,h});
    if(uiDeco()){ const dy=s*2; btnShadow(x+2, y+2, w-4, h*0.8, h*0.2); rpgButton(x, y+dy, w, h, on?D37.gold:MT_UI.sub, D37.out);
      text(label, x+w/2, y+h*0.45+dy, Math.min(h*0.36, 20), '#fff', 'center', 800, on?'#7a3d12':D37.out); return; }
    const f=dBox(x, y, w, h, h*0.2, on?D37.gold:MT_UI.sub, on?'#b07a3a':D37.sideD, D37.out, s); dHi(f, h*0.2);
    text(label, f.x+f.w/2, f.y+f.h*0.5, Math.min(h*0.36, 20), '#fff', 'center', 800, on?'#7a3d12':D37.out); return;
  }
  const k=h/120; btnShadow(x, y, w, h-2, h*0.28); mtNine4(hero(on?'Button_01_Mian_l_Bg_Yellow':'Button_01_Mian_l_Bg_Gary'), x, y, w, h, [34,53,34,36], k);
  text(label, x+w/2, y+h*0.43, Math.min(h*0.36, 20), '#fff', 'center', 800, on?'#7a3d12':'#2a2440');
}
// 等级角标（Label_Grade_Octagon）
function octBadge(pal, cx, cy, s){
  const w=s*38/47, x=cx-w/2, y=cy-s/2;
  drawImg(heroT('Label_Grade_Octagon_Bg', pal.lab), x, y, w, s);
  drawImg(heroT('Label_Grade_Octagon_InnerBorder', pal.labIn), x+w*(3/38), y+s*(4/47), w*(32/38), s*(39/47));
  drawImg(heroT('Label_Grade_Octagon_Border', TH.octBd), x, y, w, s);
}
const SIL = {};   // 未获得：剪影（颜色跟稀有度走，照 Fantasy Hero 卡片里的剪影）
function silOf(key, col){
  const k=key+col; if(SIL[k]) return SIL[k]; const src=MONPORT[key]||PORTRAIT[key]; if(!src) return null;
  const c=document.createElement('canvas'); c.width=src.width; c.height=src.height; const g=c.getContext('2d');
  g.drawImage(src,0,0); g.globalCompositeOperation='source-in'; g.fillStyle=col; g.fillRect(0,0,c.width,c.height);
  return SIL[k]=c;
}
// 卡片头像：按卡面要占满来放大，128 的战斗头像会糊，这里单独渲染 384（有高清图集时用高清图集），并记下有内容的范围
const CARDPORT = {};
function cardPortrait(e){
  const k=e.key; if(CARDPORT[k]) return CARDPORT[k];
  const N=384, c=document.createElement('canvas'); c.width=c.height=N; const g=c.getContext('2d');
  let v, s, h;
  if(PET_SPINE[k]){ v=newSpine(PET_SPINE[k]); v.st.update(0.3); v.st.apply(v.sk); s=Math.min(300/v.sd.h, 336/v.sd.w); h=v.sd.h*s; }
  else { const nm=PET_MON[k]||ENEMY_MON[k]; v=newMon(nm,'Idle'); v.m.update(0.2); const b=MONB[nm]; s=Math.min(300/b.h, 336/b.w); h=b.h*s; }
  const r=renderChar(v, s, v.kind==='mon', {S:1, cs:360, hpx:h});
  g.drawImage(r.cv, 0,0,r.bw,r.bh, N/2-r.px, N*0.875-r.py, r.bw, r.bh);
  if(!e.owned){ g.globalCompositeOperation='source-in'; g.fillStyle=(isAFK()&&TH.locked?TH.locked:MT_PAL[e.rar]).cardSil; g.fillRect(0,0,N,N); }   // 26 版：启程配色下未解锁剪影统一灰
  // 内容范围查 card_bbox.js（离线量好；游戏里不能读像素：双击打开 file:// 时读像素会报错卡死）
  const b=(window.CARD_BBOX||{})[k] || [N*0.1, N*0.2, N*0.9, N*0.9];
  return CARDPORT[k]={c, x0:b[0], y0:b[1], x1:b[2], y1:b[3]};
}
const portraitOf = e => e.owned ? PORTRAIT[e.key] : silOf(e.key, MT_PAL[e.rar].sil);

// ---------- 大角色（只有角色区这一只播动画） ----------
function charInst(e){
  if(MT.charV[e.key]) return MT.charV[e.key];
  const v = petVis(e.key);
  return MT.charV[e.key]=v;
}
const SILC = document.createElement('canvas');
const BIG_PET_H = 0.8;   // 39 版：大角色区可见高度 = maxH × 这个比例
function drawBigChar(e, cx, fy, maxH, maxW, dt){
  const v=charInst(e);
  if(v.kind==='spine'){ v.st.update(dt); v.st.apply(v.sk); } else v.m.update(dt);
  const dm = v.kind==='spine' ? {h:v.sd.h, w:v.sd.w} : MONB[v.name];
  // 39 版（用户 2026-11-13：宠物大小、脚底很不统一）：和卡片同一规则——按可见内容（card_bbox.js，卡面头像里量的）统一可见高度，可见脚底压在 fy。
  //   卡面头像的缩放 sp = min(300/高, 336/宽)、脚底原点在 384×0.875，据此把像素范围换回角色自身单位。
  let s=Math.min(maxH/dm.h, maxW/dm.w), foot=0; const bb=(window.CARD_BBOX||{})[e.key];
  if(bb){ const sp=Math.min(300/dm.h, 336/dm.w), vh=(bb[3]-bb[1])/sp, Hv=Math.min(BIG_PET_H*maxH, maxW/cardAspectMax());
    s=Hv/vh; foot=(bb[3]-384*0.875)/sp*s; }
  const h=dm.h*s;
  groundShadow(cx, fy, h*0.95, 0.9);
  drawLive(v, s, v.kind==='mon', {hpx:h, cs:h/0.84, sil: e.owned ? null : MT_PAL[e.rar].sil}, cx, fy-foot);   // 58 版：GPU 画；未拥有 = 剪影
  return h;
}

// ---------- 角色区背景：渐变 + 花纹 + 光晕 + 法阵（Fantasy Hero Collection_Detail 的层次） ----------
function drawStageBg(rar, r, cx, cy, size, alpha){
  const P=MT_PAL[rar]; ctx.save(); ctx.globalAlpha=alpha;
  ctx.fillStyle=P.bot; ctx.fillRect(r.x,r.y,r.w,r.h);
  const tg=heroT('Image_Gradient_Top_01', P.top); if(tg) ctx.drawImage(tg, r.x, r.y, r.w, r.h*0.82);
  const bg=heroT('Image_Gradient_Bottom_03', P.bot); if(bg) ctx.drawImage(bg, r.x, r.y+r.h*0.55, r.w, r.h*0.45);
  ctx.restore();
  mtFillPattern('#ffffff', r, alpha*0.05, 0.6);
  ctx.save(); ctx.globalAlpha=alpha;
  const gl=heroT('Image_Glow_Circle_03', P.glow); if(gl){ ctx.globalAlpha=alpha*0.55; ctx.drawImage(gl, cx-size*0.62, cy-size*0.62, size*1.24, size*1.24); }
  const dc=hero('Image_BackDeco_01'); if(ok(dc)){ ctx.globalAlpha=alpha*0.9; ctx.translate(cx,cy); ctx.rotate(performance.now()/60000); ctx.drawImage(dc, -size/2, -size/2, size, size); }
  ctx.restore();
}

// 方案 B：场景远景（Background_Sample02：天空 → 远山 → 远处草坡，平涂无黑描边，符合 场景与美术.md 第 0 节）
//   原图草坡边（远景和近处地面的交界）约在 33% 高度，对在角色脚后方偏上，角色站在近处地面上；
//   底部渐暗接面板。剑与远征那种前景遮罩（波浪边 + 暗色前景）素材库里没有（Lobby_bg_bottom 上半是整片地面，不能当遮罩）。
// （13、14 版用的 Fantasy Hero Background_01 是低多边形伪 3D 的近景场景，画风不符，已删）
let MT_SCENE=null;
function sceneCanvas(){
  if(MT_SCENE) return MT_SCENE; const im=meta('Background_Sample02'); if(!ok(im)) return null;
  const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight; const g=c.getContext('2d');
  g.filter='saturate(0.85)'; g.drawImage(im,0,0); c.complete=true; c.naturalWidth=c.width; c.naturalHeight=c.height;
  return MT_SCENE=c;
}
function drawSceneBg(r, horizonY){
  const c=sceneCanvas(); if(!c){ ctx.fillStyle='#8cc8e8'; ctx.fillRect(r.x,r.y,r.w,r.h); return; }
  const HZ=0.33;
  const s=Math.max(r.w/c.width, (horizonY-r.y)/(c.height*HZ)), w=c.width*s, h=c.height*s;
  ctx.drawImage(c, r.x+(r.w-w)/2, horizonY-h*HZ, w, h);
  const bg=heroT('Image_Gradient_Bottom_01', TH.stageFade); if(bg) ctx.drawImage(bg, r.x, r.y+r.h*0.78, r.w, r.h*0.22);
}

// ---------- 宠物页背景 B：分层景深场景（29 版起；31 版按用户 2026-11-12 意见重写绘制方式）----------
// 30 版：去掉重复的锯齿林带，加单棵树、灌木、小山、前景、云、光点、摇摆（见 docs/场景与美术.md）。
// 31 版（用户：竖线很多、不止一两处；前景跟着面板滑下去消失；换宠物时前景从右边跳到左边）：
//  · 竖线的根因：画布实际缩放是 窗口 DPR × 竖屏缩放（还带小数的居中偏移），平铺图层的接缝落在小数像素上，
//    单个道具被图边切出硬边。改法：整个背景先画到一张和屏幕像素一一对应的离屏画布（接缝、宽度都对齐整像素），
//    再整张贴回；单个道具在 tools/make_bg31.py 里留透明边、碰图边的一侧渐隐。
//  · 前景固定在“面板在中间停靠位时”的位置，面板往下滑进详情时前景留在原地（被详情盖住），不跟着走。
//  · 换宠物 = 镜头往前走一整屏：前进时角色两侧和前景的树丛从左边出画、新的从右边进来（后退反过来）；
//    远的层按视差走得少。每只宠物的前景构图一样。
// 图层：tools/make_bg31.py 生成到 assets/bg/（Simple Sidescroll 分层图层 + 2D Minimal Environment 1 的树和灌木）。
// 单位 u = 角色高 / 160；每层按“原图 1 像素 ≤ 屏幕 1 像素”画（天空和模糊的前景除外）。
const bgi = n => img('bg/'+n+'.png');
const BGV = { S:1, ox:0, oy:0 };   // 当前离屏画布：设计坐标 → 离屏像素 的缩放和偏移
const snapX = x => (Math.round(x*BGV.S+BGV.ox)-BGV.ox)/BGV.S;   // 对齐到整像素
const snapW = w => Math.max(1, Math.round(w*BGV.S))/BGV.S;
const BGL = {
  // y = 层底边相对脚下地面线（u，往下为正）；h = 高；p = 视差；off = 错位
  ridge: {n:'far_ridge', y:-48, h:40, p:0.08, a:0.95},
  haze1: {n:'haze',      y:-36, h:34, p:0.06, a:0.9},
  farP:  {n:'far_pine',  y:-38, h:40, p:0.13, off:-90, a:0.92},
  haze2: {n:'haze',      y:-26, h:30, p:0.18, a:0.8},
  haze3: {n:'haze',      y:-10, h:26, p:0.3,  a:0.55},
  grass: {n:'grass',     y:-6,  h:44, p:0.8,  a:1},
};
// 平铺长条：宽度和每一份的起点都对齐整像素，首尾正好相接
function bgStrip(L, cx, fy, u, cam, r){
  const im=bgi(L.n); if(!ok(im)) return;
  const h=L.h*u, w=snapW(im.naturalWidth*h/im.naturalHeight), y=fy+L.y*u-h;
  let x0=snapX(cx-cam*L.p*u+(L.off||0)*u); x0-=Math.ceil((x0-r.x)/w)*w;
  ctx.globalAlpha=L.a; for(let x=x0; x<r.x+r.w; x+=w) ctx.drawImage(im, x, y, w, h); ctx.globalAlpha=1;
}
const PER = 1000;   // 中远景单个道具每 PER（u）重复一次
const BG_PROPS = {
  far:  {p:0.22, y:-16, sway:0.006, list:[['hill2',-270,46],['hill1',215,52],['hill2',540,40,1],['hill1',-640,44,1],
         ['ftree1',-150,62],['ftree2',92,70],['ftree3',335,56],['ftree2',-425,66],['ftree1',655,60],['ftree3',-775,58],['ftree2',850,64]]},
  mid:  {p:0.55, y:-4, sway:0.012, list:[['tree3',-170,150],['tree4',190,132],['tree1',430,120],['tree2',-480,140],['tree6',715,145],['tree5',-735,115],['tree4',-915,128],
         ['bush3',-118,34],['bush1',128,36],['bush2',305,28],['bush4',-335,30],['bush3',570,32],['bush1',-600,30],['bush2',860,30]]},
};
function bgProp(name, sx, by, h, sway, ph, flip, t){
  const im=bgi(name); if(!ok(im)) return; const w=im.naturalWidth*h/im.naturalHeight;
  ctx.save(); ctx.translate(sx, by);
  if(sway){ const k=Math.sin(t*1.1+ph)*sway+Math.sin(t*2.3+ph*1.7)*sway*0.35; ctx.transform(1,0,k,1,0,0); }   // 以底边为轴轻摆
  if(flip) ctx.scale(-1,1);
  ctx.drawImage(im, -w/2, -h, w, h); ctx.restore();
}
function bgBand(B, cx, fy, u, cam, r, t){
  for(const [n,x,h,flip] of B.list){
    const wx=((x-cam*B.p)%PER+PER*1.5)%PER-PER/2, sx=cx+wx*u, half=h*u*1.5;
    if(sx+half<r.x || sx-half>r.x+r.w) continue;
    bgProp(n, sx, fy+B.y*u, h*u, B.sway, x*0.37, flip, t);
  }
}
// 分页的近景：每走一步（一只宠物）移动 p × 一整屏；构图每页一样，前进时旧的从左边出、新的从右边进
function bgPaged(p, D, q, u, fn){ const span=p*D, o=-(((q*span)%span)+span)%span; fn(o*u); fn((o+span)*u); }
// 离屏画布：和屏幕物理像素一一对应
const BGC = {bg:document.createElement('canvas'), fg:document.createElement('canvas')};
// 58 版：WebGL 时画进 GPU 离屏层（pixi-ctx __layerBegin），不再每帧在 2D 画布上合成再整块上传；
//   key 不为空且和上次相同 → 返回 s.skip = true，调用方不用重画（营地地面只在镜头移动 / 图片到了时重画），2D 画法同样沿用上一次的画布。
function bgBegin(which, r, key){
  const m=ctx.getTransform(), S=m.a, x0=Math.floor(r.x*S+m.e), y0=Math.floor(r.y*S+m.f),
        w=Math.ceil((r.x+r.w)*S+m.e)-x0, h=Math.ceil((r.y+r.h)*S+m.f)-y0, c=BGC[which];
  const k = key==null ? null : key+'|'+x0+','+y0+','+w+','+h+'|'+S+','+(m.e-x0)+','+(m.f-y0);
  const ly = ctx.__layerBegin && ctx.__layerBegin(which, x0, y0, w, h, k);
  if(ly){ BGV.S=S; BGV.ox=m.e; BGV.oy=m.f; return {ly, skip:ly.skip}; }   // 层的内容和屏幕像素一一对应：对齐方式同 2D 离屏
  if(k!=null && c.__key===k) return {main:ctx, c, x0, y0, skip:true, keep:true};
  if(c.width!==w||c.height!==h){ c.width=w; c.height=h; }
  c.__key=k;
  const g=c.getContext('2d'); g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,w,h); g.setTransform(S,0,0,S,m.e-x0,m.f-y0);
  BGV.S=S; BGV.ox=m.e-x0; BGV.oy=m.f-y0;
  const main=ctx; ctx=g; return {main, c, x0, y0};
}
function bgEnd(s){ if(s.ly){ ctx.__layerEnd(s.ly); return; }
  if(!s.keep) ctx=s.main; ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(s.c, s.x0, s.y0); ctx.restore(); }
function camUpdate(r, u, t){
  // 镜头位置按“步”计：每换一只宠物走一步（stepPet 给方向；点网格按名单先后定方向），指数趋近
  if(MT.camSel!==MT.sel){
    if(MT.camSel!=null){ const own=roster().filter(e=>e.owned), a=own.findIndex(e=>e.key===MT.camSel), b=own.findIndex(e=>e.key===MT.sel);
      MT.camQT=(MT.camQT||0) + (MT.stepDir || Math.sign(b-a) || 1); }
    MT.stepDir=0; MT.camSel=MT.sel; }
  const tgt=MT.camQT||0, dt=Math.min(0.05, t-(MT.camT||t)); MT.camT=t;
  MT.camQ = MT.camQ==null ? tgt : MT.camQ + (tgt-MT.camQ)*(1-Math.exp(-dt*4.5));
  if(Math.abs(tgt-MT.camQ)<1e-4) MT.camQ=tgt;
  const D=r.w/u+80;   // 一步 = 一整屏（再多 80u，保证两侧灌木完全出画）
  return {q:MT.camQ, D, cam:MT.camQ*D + Math.sin(t/9)*6};
}
function drawDepthBg(r, cx, fy, charH, lay){
  const u=charH/160, t=performance.now()/1000, {q, D, cam}=camUpdate(r, u, t);
  // 前景底边固定在面板中间停靠位（面板滑下去进详情时前景不动）
  const bottom = lay.land ? r.y+r.h : lay.snaps.mid+12;
  const s=bgBegin('bg', r);
  try{
    const sky=bgi('sky');
    if(ok(sky)){ const hz=fy-30*u, h=Math.max(hz-r.y+30*u, 120*u), w=snapW(sky.naturalWidth*h/sky.naturalHeight); let x0=snapX(cx-w*0.33-cam*0.03*u); x0-=Math.ceil((x0-r.x)/w)*w;
      for(let x=x0;x<r.x+r.w;x+=w) ctx.drawImage(sky, x, hz+30*u-h, w, h); }
    else { ctx.fillStyle='#f0b26a'; ctx.fillRect(r.x,r.y,r.w,r.h); }
    // 云：慢慢往右飘
    for(const [n,x,y,h,sp] of [['cloud2',-260,-150,26,2.2],['cloud1',120,-178,30,1.6],['cloud4',420,-140,24,2.6],['cloud3',-560,-170,16,1.9],['cloud1',760,-160,22,2.0]]){
      const im=bgi(n); if(!ok(im)) continue; const hh=h*u, w=im.naturalWidth*hh/im.naturalHeight;
      const wx=((x+t*sp-cam*0.05)%PER+PER*1.5)%PER-PER/2, sx=cx+wx*u;
      if(sx+w<r.x || sx-w>r.x+r.w) continue; ctx.globalAlpha=0.75; ctx.drawImage(im, sx-w/2, fy+y*u-hh, w, hh); ctx.globalAlpha=1; }
    for(const k of ['ridge','haze1','farP','haze2']) bgStrip(BGL[k], cx, fy, u, cam, r);
    bgBand(BG_PROPS.far, cx, fy, u, cam, r, t);
    bgStrip(BGL.haze3, cx, fy, u, cam, r);
    bgBand(BG_PROPS.mid, cx, fy, u, cam, r, t);
    // 光束（天上的光，不随镜头走）+ 光点
    ctx.save(); ctx.globalCompositeOperation='screen';
    for(const [n,dx,sc,ph] of [['ray1',-118,1.0,0],['ray2',70,0.9,2.1],['ray1',175,0.75,4.2]]){ const im=bgi(n); if(!ok(im)) continue;
      const h=(fy-r.y+10*u)*sc, w=im.naturalWidth*h/im.naturalHeight; ctx.globalAlpha=0.38+0.14*Math.sin(t*0.6+ph);
      ctx.drawImage(im, cx+dx*u-w*0.3, fy+10*u-h, w, h); }
    const mo=bgi('motes'); if(ok(mo)){ const h=130*u, w=mo.naturalWidth*h/mo.naturalHeight;
      for(const [dx,sp,ph] of [[-150,7,0],[-20,5,1.7],[110,6,3.1],[240,8,4.4],[-280,6,2.2]]){
        const yy=((t*sp+ph*40)%(h/u))*u, x=cx+dx*u;
        for(const k of [0,1]){ const y=fy-yy+k*h; if(y-h>fy || y<r.y) continue; ctx.globalAlpha=0.35+0.3*Math.sin(t*1.3+ph+k); ctx.drawImage(mo, x-w/2, y-h, w, h); } } }
    ctx.restore();
    bgStrip(BGL.grass, cx, fy, u, cam, r);
    const gd=bgi('ground');
    if(ok(gd)){ const sc=u/3.2, w=snapW(gd.naturalWidth*sc), h=gd.naturalHeight*sc, top=fy-8*u-240*sc; let x0=snapX(cx-cam*u); x0-=Math.ceil((x0-r.x)/w)*w;
      for(let x=x0;x<r.x+r.w;x+=w) ctx.drawImage(gd, x, top, w, h);
      if(top+h<r.y+r.h){ ctx.fillStyle='#6b3f1f'; ctx.fillRect(r.x, top+h-1, r.w, r.y+r.h-top-h+1); } }
    // 角色两侧的灌木（和地面同一深度，一步走一整屏）
    bgPaged(1, D, q, u, o=>{ bgProp('bush3', cx-112*u+o, fy+6*u, 40*u, 0.018, 0.4, 0, t); bgProp('bush1', cx+118*u+o, fy+8*u, 36*u, 0.018, 2.0, 0, t); });
    // 暖色暗角
    const vg=ctx.createLinearGradient(0, r.y, 0, r.y+(fy-r.y)*0.55); vg.addColorStop(0,'rgba(74,36,22,.42)'); vg.addColorStop(1,'rgba(74,36,22,0)');
    ctx.fillStyle=vg; ctx.fillRect(r.x, r.y, r.w, fy-r.y);
    for(const sd of [0,1]){ const x0=sd?r.x+r.w:r.x, wv=Math.min(r.w*0.22, 90*u), g=ctx.createLinearGradient(x0,0,x0+(sd?-wv:wv),0);
      g.addColorStop(0,'rgba(58,28,18,.38)'); g.addColorStop(1,'rgba(58,28,18,0)'); ctx.fillStyle=g; ctx.fillRect(sd?x0-wv:x0, r.y, wv, r.h); }
  } finally { bgEnd(s); }
  return {u, cam, q, D, bottom, t};
}
// 前景（画在角色之后）：模糊的深色大树、灌木、底部波浪
function drawDepthFg(r, cx, fy, info){
  const {u, cam, q, D, bottom, t}=info, s=bgBegin('fg', r);
  try{
    { const im=bgi('fg_grass'); if(ok(im)){ const h=40*u, w=snapW(im.naturalWidth*h/im.naturalHeight); let x0=snapX(cx-cam*1.2*u-w*0.6); x0-=Math.ceil((x0-r.x)/w)*w;
      for(let x=x0;x<r.x+r.w;x+=w) ctx.drawImage(im, x, bottom-h-14*u, w, h); } }
    const half=r.w/2/u;
    bgPaged(1.4, D, q, u, o=>{
      bgProp('fg_tree',  cx+(-half-8)*u+o,  bottom+20*u, 250*u, 0.006, 1.1, 0, t);
      bgProp('fg_bush1', cx+(half-18)*u+o,  bottom+6*u,  70*u,  0.012, 2.6, 1, t);
      bgProp('fg_bush2', cx+(-half+60)*u+o, bottom+10*u, 52*u,  0.012, 0.3, 0, t); });
    const wv=bgi('fg_wave');
    if(ok(wv)){ const h=34*u, w=snapW(wv.naturalWidth*h/wv.naturalHeight); let x0=snapX(cx-cam*1.4*u-w*0.31); x0-=Math.ceil((x0-r.x)/w)*w;
      for(let x=x0;x<r.x+r.w;x+=w) ctx.drawImage(wv, x, bottom-h, w, h); }
  } finally { bgEnd(s); }
}

// ---------- 22～23 版：启程英雄厅堂那种面板顶边（用户 2026-11-12；21 版凭印象做错，22 版逐像素量截图重做） ----------
// 量自截图（585 宽，换算到 390 宽设计像素）：
//   面板顶边 = 左低右高的斜弧：左端比中间低约 10，中间一大段平，右端比中间高约 10；顶边一条 1px 浅色亮线。
//   拖动条 = 扁平深灰圆角条，宽约 50%、高 17，条底贴在面板顶边上；无描边、无高光，左右两块很淡的斜切色块。
//   条上方 = 深色横向暗影（约 23 高，两侧渐隐）+ 正中一个很薄的金色 ∧（宽约 20%、高约 13，金线约 2.5 宽，里面暗紫褐）；
//   原图 ∧ 顶上是头盔，用户要求不做头盔，顶点平滑过渡。
// 23 版：用户指出原图是两层（24 版起曲线改用拟合，见下）、弧度对不上，重新逐列量截图（585 宽，y = 截图像素；换算到 390 宽 ×0.667，以条下米白边 y≈1057 为 0）：
//   前层（米白面板）上沿：x0:1076 x20:1070 x40:1066 x60:1060 x80:1058 x100:1056 x140:1053 | 条 | x460:1058 x500:1054 x540:1050 x575:1046 x583:1044
//     → 波浪：左端很低、很快升起，中段略凹，右端再翘起。
//   后层（紫灰带 #8e7f82）上沿：x0:1046 x50:1042 x110~150:1040，几乎是直线、往右略升；只在左半边露出，条右侧没有。
//   后层上有从左上斜向右下的浅金细纹（左侧最浓，往右淡到没有），上沿一排小菱形亮点（金、淡紫交替）。
// 24 版：23 版用样条硬穿过每个量出的点，JPG 量点有 1~2 像素误差，曲线就歪歪扭扭（用户 2026-11-12 指出）。
//   改为：逐列取亮度过渡的亚像素位置（左 0~144、右 446~584，每 3 列一个，共 96 点），用 5 次多项式拟合成一条光滑曲线
//   （最大误差 0.33 像素，只有一个拐点）。后层上沿同样用 2 次曲线拟合。系数已换算到 390 宽设计像素（t = 0..1）。
const RIM_FC = [-142.0715, 439.0675, -622.5936, 443.5767, -139.6921, 12.4126];
const RIM_BC = [87.9218, -37.9913, -7.3498];
const rimPoly = (c, t) => c.reduce((a,v)=>a*t+v, 0);
function rimSpline(P, t){ return rimPoly(P, Math.min(1, Math.max(0, t))); }
const RIM_F = RIM_FC, RIM_B = RIM_BC;
// 25 版（用户 2026-11-12：右边用一样的方法倒过来、用原图的黄）：右侧金色后层上沿，逐列量 x443~542（再往右被场景物体挡住）
//   x443:1042 x479:1039.1 x500:1036.2 x524:1031.8 x542:1028.2，2 次曲线拟合（最大误差 0.19），外推到右边约 1016，与原图一致。
//   曲线最低点在 t≈0.713（藏在条下面），往左按平处理。
const RIM_GC = [-212.0858, 302.5493, -117.5615], RIM_G_T0 = 0.7133;
const rimGold0 = t => rimPoly(RIM_GC, Math.max(RIM_G_T0, Math.min(1, t)));
// 两层后层在条下面（t 0.25~0.75）平滑收进米白边：条淡出时（详情页）不露竖直切口；条在时露出的部分不变
const rimMix = (a,b,k) => a+(b-a)*k;
const sstep = (a,b,t) => { const k=Math.min(1,Math.max(0,(t-a)/(b-a))); return k*k*(3-2*k); };
const rimBackTop = t => rimMix(rimPoly(RIM_BC, Math.min(1,Math.max(0,t))), rimOff(t)+0.5, sstep(0.27, 0.44, t));
const rimGold   = t => rimMix(rimGold0(t), rimOff(t)+0.5, 1-sstep(0.56, 0.73, t));
function rimOff(t){ return rimPoly(RIM_FC, t); }
// 后层：左侧紫灰带（只画左半边，右端藏在拖动条下面）+ 斜纹 + 小亮点；画在面板之前，面板盖住它的下半
function drawRimBackLayer(lay, y){
  const R=TH.rim, p=lay.panel, xEnd=p.x+p.w*0.5, N=Math.ceil(p.w/4);
  ctx.save(); ctx.beginPath();
  for(let i=0;i<=N;i++){ const t=0.5*i/N, xx=p.x+p.w*t, yy=y+rimBackTop(t); if(i===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy); }
  ctx.lineTo(xEnd, y+20); ctx.lineTo(p.x, y+20); ctx.closePath();
  ctx.fillStyle=R.back; ctx.fill(); ctx.clip();
  // 斜纹：从左上斜向右下，间距约 3.3，左侧浓、往右淡
  const g=ctx.createLinearGradient(p.x,0,p.x+p.w*0.34,0);
  // 原图最左一小块是纯紫灰，斜纹约从 x=30（585 宽）开始，到条左端前淡没
  g.addColorStop(0, `rgba(${R.stripe},0)`); g.addColorStop(0.13, `rgba(${R.stripe},0)`); g.addColorStop(0.3, `rgba(${R.stripe},.42)`); g.addColorStop(0.62, `rgba(${R.stripe},.36)`); g.addColorStop(1, `rgba(${R.stripe},0)`);
  ctx.strokeStyle=g; ctx.lineWidth=0.9;
  for(let k=-12;k<14;k++){ const y0=y-14+k*3.3; ctx.beginPath(); ctx.moveTo(p.x, y0); ctx.lineTo(p.x+p.w*0.4, y0+p.w*0.4*0.16); ctx.stroke(); }
  ctx.restore();
  // 右侧金色后层：和左侧同样的做法左右倒过来（斜纹从右上斜向左下，最右一小块纯色，往左淡没；原图右边没有小亮点）
  { const x0=p.x+p.w*0.5, N2=Math.ceil(p.w/4);
    ctx.save(); ctx.beginPath();
    for(let i=0;i<=N2;i++){ const t=0.5+0.5*i/N2, xx=p.x+p.w*t, yy=y+rimGold(t); if(i===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy); }
    ctx.lineTo(p.x+p.w, y+20); ctx.lineTo(x0, y+20); ctx.closePath();
    ctx.fillStyle=R.back2; ctx.fill(); ctx.clip();
    const g2=ctx.createLinearGradient(p.x+p.w, 0, p.x+p.w*0.66, 0);
    g2.addColorStop(0, `rgba(${R.stripe2},0)`); g2.addColorStop(0.13, `rgba(${R.stripe2},0)`); g2.addColorStop(0.3, `rgba(${R.stripe2},.42)`); g2.addColorStop(0.62, `rgba(${R.stripe2},.36)`); g2.addColorStop(1, `rgba(${R.stripe2},0)`);
    ctx.strokeStyle=g2; ctx.lineWidth=0.9;
    for(let k=-16;k<14;k++){ const y0=y-28+k*3.3, xr=p.x+p.w; ctx.beginPath(); ctx.moveTo(xr, y0); ctx.lineTo(xr-p.w*0.4, y0+p.w*0.4*0.16); ctx.stroke(); }
    ctx.restore(); }
  // 上沿小菱形亮点
  for(let i=0, xx=p.x+16; xx<p.x+p.w*0.25; i++, xx+=11){ const yy=y+rimBackTop((xx-p.x)/p.w)-2, d=1.2;
    ctx.globalAlpha=0.7; ctx.fillStyle = i%2 ? R.spark2 : R.spark1; ctx.beginPath(); ctx.moveTo(xx,yy-d*1.4); ctx.lineTo(xx+d,yy); ctx.lineTo(xx,yy+d*1.4); ctx.lineTo(xx-d,yy); ctx.closePath(); ctx.fill(); ctx.globalAlpha=1; }
}
function rimTrace(lay, y){ const p=lay.panel, N=Math.ceil(p.w/2); for(let i=0;i<=N;i++){ const xx=p.x+p.w*i/N, yy=y+rimOff(i/N); if(i===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy); } }
const RIM_BAR_H = 17;
// 面板顶边的浅色亮线（原图米白面板最上沿一条 1px 更亮的线）
// 38 版（用户 2026-11-13）：面板上沿的弧形边、拖动条也加投影（同一套暖灰投影，往上散开，面板像压在场景上面）
//   withBack = 连左右两层后层（紫灰 / 金色）的上沿一起算
function rimShadow(lay, y, withBack){
  if(!isAFK() || !TH.card.shadow) return;
  const p=lay.panel, N=Math.ceil(p.w/3), bot=Math.max(y+4, Math.min(y+60, p.bottom));
  ctx.save(); ctx.beginPath();
  for(let i=0;i<=N;i++){ const t=i/N; let yy=rimOff(t); if(withBack) yy=Math.min(yy, t<=0.5 ? rimBackTop(t) : rimGold(t));
    if(i===0) ctx.moveTo(p.x, y+yy); else ctx.lineTo(p.x+p.w*t, y+yy); }
  ctx.lineTo(p.x+p.w, bot); ctx.lineTo(p.x, bot); ctx.closePath();
  ctx.shadowColor=TH.card.shadow; ctx.shadowBlur=10*DPR; ctx.shadowOffsetY=-2*DPR; ctx.fillStyle=MT_UI.panel; ctx.fill(); ctx.restore();
}
function drawRimEdge(lay, y){ ctx.save(); ctx.beginPath(); rimTrace(lay, y+0.5); ctx.strokeStyle=TH.rim.edgeHi; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore(); }
// 拖动条：扁平深灰，条底贴面板顶边；中间放原来的下拉小箭头
function drawRimBar(lay, y, alpha, flip){
  const B=TH.rim.bar, p=lay.panel, w=Math.min(200, p.w*0.5), h=RIM_BAR_H, x=p.x+p.w/2-w/2, by=y-h+2.7, r=h/2, sk=h*0.9;
  if(isAFK() && TH.card.shadow && alpha>0){ ctx.save(); ctx.globalAlpha=alpha; ctx.shadowColor=TH.card.shadow; ctx.shadowBlur=7*DPR; ctx.shadowOffsetY=2.5*DPR;
    ctx.fillStyle=B.body; rr(x, by, w, h, r); ctx.fill(); ctx.restore(); }   // 38 版：拖动条投影
  ctx.save(); ctx.globalAlpha=alpha;
  rr(x, by, w, h, r); ctx.clip();
  ctx.fillStyle=B.body; ctx.fillRect(x, by, w, h);
  ctx.fillStyle=B.left;  ctx.beginPath(); ctx.moveTo(x,by); ctx.lineTo(x+w*0.2+sk,by); ctx.lineTo(x+w*0.2,by+h); ctx.lineTo(x,by+h); ctx.closePath(); ctx.fill();
  ctx.fillStyle=B.right; ctx.beginPath(); ctx.moveTo(x+w*0.8+sk,by); ctx.lineTo(x+w,by); ctx.lineTo(x+w,by+h); ctx.lineTo(x+w*0.8,by+h); ctx.closePath(); ctx.fill();
  ctx.fillStyle=B.dot; ctx.beginPath(); ctx.arc(x+r*0.9, by+h/2, 1.7, 0, Math.PI*2); ctx.fill();
  // 下拉提示箭头（原来在名字下方，现在条占了那个位置，放进条中间）
  const cx=p.x+p.w/2, cy=by+h/2+Math.sin(performance.now()/300)*1.2;
  ctx.strokeStyle=B.arrow; ctx.lineWidth=2.2; ctx.lineCap='round'; ctx.lineJoin='round';
  const fs=1-2*(flip||0);   // 1 = 朝下，-1 = 朝上（拉到底），中间平滑翻转
  ctx.beginPath(); ctx.moveTo(cx-7,cy-2.5*fs); ctx.lineTo(cx,cy+2.5*fs); ctx.lineTo(cx+7,cy-2.5*fs); ctx.stroke();
  ctx.restore();
}

// ---------- 角色区 ----------
function drawCharArea(lay, dt){
  const r = lay.land ? lay.char : {...lay.char, h:Math.max(lay.char.h, panelTop(lay)+16)}, e=entry(MT.sel);
  ctx.save(); ctx.beginPath(); ctx.rect(r.x,r.y,r.w,r.h); ctx.clip();
  const baseH = lay.land ? r.h : lay.char.h-16;   // 角色大小、位置只按默认角色区算：面板拖动、进出详情时角色原地不动
  // 横屏：角色放在右侧区域中部偏下（14 版放在 80% 高度，上方大片空着）
  const fy = r.y + baseH - baseH*(lay.land?0.32:0.17), cx = r.x + r.w/2;
  const charH = lay.land ? Math.min(baseH*0.42, r.w*0.55) : baseH*0.5;
  const decoS = Math.min(r.w*0.92, charH*2.1), decoY = fy - charH*0.5;
  // 换角色：背景颜色交叉淡入
  let sw=1; if(MT.swapT>0){ MT.swapT=Math.max(0,MT.swapT-dt); sw=1-MT.swapT/0.3; }
  const pe=MT.prevSel&&entry(MT.prevSel);
  let dInfo=null;
  if(MT.bgMode==='scene') dInfo=drawDepthBg(r, cx, fy, charH, lay);
  else if(pe && sw<1 && pe.rar!==e.rar){ drawStageBg(pe.rar, r, cx, decoY, decoS, 1); drawStageBg(e.rar, r, cx, decoY, decoS, sw); }
  else drawStageBg(e.rar, r, cx, decoY, decoS, 1);
  if(uiD()) drawStage(cx, fy, charH, r);
  let sc=1; if(sw<1) sc = 1 + 0.08*Math.sin(sw*Math.PI);
  ctx.save(); ctx.translate(cx,fy); ctx.scale(sc,sc); ctx.translate(-cx,-fy);
  drawBigChar(e, cx, fy, charH, r.w*(lay.land?0.5:0.6), dt);
  ctx.restore();
  if(dInfo) drawDepthFg(r, cx, fy, dInfo);
  text(e.cn, cx, fy+22, 20, e.owned?'#fff':'#d8d0f0', 'center', 800, TH.charStroke);
  const a = MT.dp;
  // 网格状态：下拉提示（随下拉淡出）
  // 下拉提示：名字下方一个小箭头（13 版的文字和名字叠在一起，去掉文字）
  if(a<1 && !(TH.rim && !lay.land)){ ctx.globalAlpha=(1-a)*0.75; const hy=fy+44+Math.sin(performance.now()/300)*2;
    ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(cx-9,hy-4); ctx.lineTo(cx,hy+4); ctx.lineTo(cx+9,hy-4); ctx.stroke(); ctx.globalAlpha=1; }
  // 背景方案切换（只为对比两种方案，选定后删掉）：网格状态左上角
  if(a<0.5){ const b={x:r.x+10, y:r.y+10+(lay.top||0), w:84, h:30}; ctx.globalAlpha=1-a*2;
    cmpPill(b, MT.bgMode==='grad'?'背景 A 渐变':'背景 B 场景');
    // 配色切换（对比用，选定后删掉）
    const b2={x:b.x+b.w+8, y:b.y, w:84, h:30};
    cmpPill(b2, MT.theme==='afk'?'配色：启程':'配色：原版');
    // 37 版：界面三档切换（对比用，选定后删掉；也可按 U 键）
    const b3={x:b2.x+b2.w+8, y:b.y, w:84, h:30};
    cmpPill(b3, '界面：'+UI_CN[MT.ui]); ctx.globalAlpha=1;
    if(a<0.01){ addHit(b, mtToggleBg); addHit(b2, mtToggleTheme); addHit(b3, mtToggleUi); } }
  // 详情：两角信息 + 两侧箭头（随下拉淡入）
  if(a>0){ ctx.globalAlpha=a;
    // 52 版（用户 2026-11-13：「卡牌详情上面的信息进到刘海范围了」）：原来 top = r.y+14，没加安全区。改成和其他页签顶部一行同一条线：安全区下沿 + 10
    const top=r.y+10+(lay.top||0), lx=r.x+14, P=MT_PAL[e.rar];
    // 30 版（用户 2026-11-12）：左边的职能八角标和右边的职能图标重复，去掉；稀有度用对应颜色的框框起来，左移和星星对齐
    { const fs=14, bw=RAR[e.rar].cn.length*fs+22, bh=24, P2=MT_PAL[e.rar];
      rr(lx, top, bw, bh, 8); ctx.fillStyle=P2.card; ctx.fill(); ctx.strokeStyle=P2.lab; ctx.lineWidth=2; rr(lx+1, top+1, bw-2, bh-2, 7); ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1; rr(lx+3, top+3, bw-6, bh-6, 5); ctx.stroke();
      text(RAR[e.rar].cn, lx+bw/2, top+bh/2+0.5, fs, '#fff', 'center', 800, P2.front||'#1b142e'); }
    for(let i=0;i<5;i++) drawIconSh(hero('Grade_Star'), lx+8+i*17, top+38, 16, i<e.stars?1:0.25);
    const rx=r.x+r.w-14; let ix=rx-17;
    if(e.role){ iconCircle(roleIcon(e.role), ix, top+17, 34); ix-=40; }
    if(PROJ_ICON[e.el]) iconCircle(icon(PROJ_ICON[e.el]), ix, top+17, 34);
    text(e.owned ? POS_CN[e.key]||ROLE_CN[e.role] : `${EL_CN[e.el]}系 · 未获得`, rx, top+50, 13, '#fff', 'right', 800, '#1b142e');
    const ay=r.y+baseH*0.45;
    drawImgC(gui('IconMisc/Icon_Arrow_Prev1'), r.x+26, ay, 34); drawImgC(gui('IconMisc/Icon_Arrow_Next1'), r.x+r.w-26, ay, 34);
    ctx.globalAlpha=1;
    if(MT.detail && a>0.99){ addHit({x:r.x, y:ay-30, w:56, h:60}, ()=>stepPet(-1)); addHit({x:r.x+r.w-56, y:ay-30, w:56, h:60}, ()=>stepPet(1)); }
  }
  ctx.restore();
}

// 37 版立体档：角色脚下的“舞台”（参照塔塔冒险队宠物详情：角色站的地方一块更亮的椭圆地面 + 脚下一块深色椭圆投影，扁平角色因此有了地面）。
//   亮地面 = 暖白 #fff6e2（启程史诗档的 glow）径向渐隐，宽约 3 个角色高、扁度 0.2；投影 = 角色描边色 #3a302d，宽约 1.1 个角色高、扁度 0.18。
//   都是柔边，A（渐变）/ B（场景）两种背景下叠在地面上。
function drawStage(cx, fy, charH, r){
  const rx=Math.min(r.w*0.48, charH*1.5), ry=rx*0.2;
  ctx.save(); ctx.translate(cx, fy); ctx.scale(1, ry/rx);
  let g=ctx.createRadialGradient(0,0,0,0,0,rx); g.addColorStop(0,'rgba(255,246,226,.42)'); g.addColorStop(0.55,'rgba(255,246,226,.2)'); g.addColorStop(1,'rgba(255,246,226,0)');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,rx,0,7); ctx.fill(); ctx.restore();
  const sx=charH*0.55, sy=sx*0.18;
  ctx.save(); ctx.translate(cx, fy); ctx.scale(1, sy/sx);
  g=ctx.createRadialGradient(0,0,0,0,0,sx); g.addColorStop(0,'rgba(58,48,45,.5)'); g.addColorStop(0.7,'rgba(58,48,45,.32)'); g.addColorStop(1,'rgba(58,48,45,0)');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,sx,0,7); ctx.fill(); ctx.restore();
}
// 左上对比按钮：立体 / 装饰档加深色描边 + 底部厚边，按下下沉
function cmpPill(b, label){
  if(uiD()){ const f=dBox(b.x, b.y, b.w, b.h, 9, TH.pill, D37.out, D37.out, pressK(b)); dHi(f, 9);
    text(label, f.x+f.w/2, f.y+f.h/2, 11, '#fff', 'center', 800, false); return; }
  mtNine4(heroT('BaseFrame_Basic_Rectangle_H50',TH.pill), b.x, b.y, b.w, b.h, [25,25,25,25], 0.5);
  text(label, b.x+b.w/2, b.y+b.h/2, 11, '#fff', 'center', 800, false);
}
// ---------- 面板 ----------
// 26 版（用户 2026-11-12）：启程配色竖屏下拉进详情时，面板真的往下滑，拉到底只在底部留两层弧形边和拖动条（箭头朝上）；
//   不再是网格淡出、详情淡入。下拉距离 = 面板从中间停靠位滑到底部只剩一条边的距离，面板跟手。
const slideMode = lay => isAFK() && lay && !lay.land;
// 59 版（用户 2026-11-13「拉到下方，太靠下了」+ 截图）：底栏按钮高出底栏后，条被按钮挡住；改成条底在未选中按钮上沿之上 10（条底比面板顶低 2.7）
const slideKeep = () => 2.7 + Math.max(0, NAV_V.up) + 10;
// 27 版（用户 2026-11-12）：拉到底时拖动条下面不留空，条底正好压在底部导航栏上沿（条底比面板顶低 2.7）
const pullDist = lay => slideMode(lay) ? Math.max(60, lay.panel.bottom - slideKeep() - lay.snaps.mid) : PULL;
function panelTop(lay){ return lay.land ? 0 : MT.panelY + (slideMode(lay) ? MT.dp*pullDist(lay) : 0); }
// 面板后方的详情区：从中间停靠位的面板顶，到拉到底时拖动条上方
function detailBehindRect(lay){ const top=lay.snaps.mid+8, bottom=lay.panel.bottom-slideKeep()-RIM_BAR_H-8; return {x:lay.panel.x, y:top, w:lay.panel.w, h:Math.max(0,bottom-top)}; }
function drawDetailBehind(lay){
  const r=detailBehindRect(lay), e=entry(MT.sel), live=MT.detail && MT.dp>0.99, p=lay.panel, py=lay.snaps.mid, ext=16;
  // 信息面板底：上沿弧线（和网格面板同一条），米白底 + 花纹 + 底部渐变，顶边浅色亮线
  rimShadow(lay, py, false);
  ctx.save(); ctx.beginPath(); rimTrace(lay, py); ctx.lineTo(p.x+p.w, p.bottom); ctx.lineTo(p.x, p.bottom); ctx.closePath(); ctx.clip();
  ctx.fillStyle=MT_UI.panel; ctx.fillRect(p.x, py-ext, p.w, p.bottom-py+ext);
  mtFillPattern(MT_UI.pattern, {x:p.x, y:py-ext, w:p.w, h:p.bottom-py+ext, ax:p.x, ay:py}, 1, 0.5);
  const gb=heroT('Image_Gradient_Bottom_01', TH.panelGrad), ph=p.bottom-py; if(gb) ctx.drawImage(gb, p.x, p.bottom-ph*0.4, p.w, ph*0.4);
  ctx.restore(); drawRimEdge(lay, py);
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  drawActionBar(e, r.x, r.y, r.w, live);
  const dv={x:r.x, y:r.y+AB, w:r.w, h:r.h-AB};
  ctx.beginPath(); ctx.rect(dv.x, dv.y, dv.w, Math.max(0,dv.h)); ctx.clip();
  drawDetail(e, dv); ctx.restore();
}
function drawPanel(lay, dt){
  const p=lay.panel, y=panelTop(lay), x=p.x, w=p.w, h=p.bottom-y;
  if(h<=0) return;
  // 26 版（用户 2026-11-12）：详情信息面板一直在网格面板后面（固定在中间停靠位），网格面板下拉时把它露出来，不是同一块面板换内容。
  //   信息面板 = 原来的米白底 + 花纹 + 同样的上沿弧线，但没有两边灰紫 / 金色区域；网格面板保留灰紫 / 金色后层。
  if(slideMode(lay)) drawDetailBehind(lay);
  if(TH.rim && !lay.land){ rimShadow(lay, y, true); drawRimBackLayer(lay, y); rimShadow(lay, y, false); }
  ctx.save(); ctx.beginPath();
  if(lay.land) ctx.rect(x,y,w,h);
  else if(TH.rim){ rimTrace(lay, y); ctx.lineTo(x+w, y+h+30); ctx.lineTo(x, y+h+30); ctx.closePath(); }
  else rr(x,y,w,h+30,20);
  ctx.clip();
  // 24 版修：启程顶边是弧线，中段比 panelY 高约 3、右端高约 10，底色和花纹要从弧线最高处铺起，否则后层紫灰会从缝里透出来
  const ext = (TH.rim && !lay.land) ? 16 : 0;
  ctx.fillStyle=MT_UI.panel; ctx.fillRect(x,y-ext,w,h+ext);
  mtFillPattern(MT_UI.pattern, {x, y:y-ext, w, h:h+ext, ax:x, ay:y}, 1, 0.5);
  const gb=heroT('Image_Gradient_Bottom_01', TH.panelGrad); if(gb) ctx.drawImage(gb, x, p.bottom-h*0.4, w, h*0.4);
  if(!lay.land && TH.edge){ ctx.fillStyle=TH.edge; ctx.fillRect(x, y, w, 1.5); }
  const e=entry(MT.sel), a=MT.dp;
  // 标题栏：网格标题 ⇄ 详情标题 交叉淡入
  if(a<1){ ctx.globalAlpha=1-a;
    if(!lay.land && !TH.rim){ ctx.fillStyle=TH.handle; rr(x+w/2-22, y+7, 44, 5, 3); ctx.fill(); }
    if(!isAFK()){ const all=roster(), own=all.filter(q=>q.owned).length;   // 启程配色：用户 2026-11-12 要求删掉「宠物」和几分之几
      text('宠物', x+16, y+29, 20, MT_UI.txt, 'left', 800, MT_UI.stroke);
      text(`${own}/${all.length}`, x+w-16, y+29, 16, MT_UI.sub, 'right', 800, MT_UI.stroke); }
    ctx.globalAlpha=1; }
  if(a>0 && !slideMode(lay)){ ctx.globalAlpha=a;
    const b={x:x+10, y:y+10, w:40, h:36}; drawImgC(MT.theme==='afk'?tinted('gui/IconMisc/Icon_Back.png', MT_UI.txt):gui('IconMisc/Icon_Back'), b.x+b.w/2, b.y+b.h/2, 28); if(a>0.99) addHit(b, exitDetail);
    text(e.cn, x+56, y+29, 19, MT_UI.txt, 'left', 800, MT_UI.stroke); if(!e.owned) text('未获得', x+w-16, y+29, 14, MT_UI.sub, 'right', 800, false);
    ctx.globalAlpha=1; }
  // 内容：网格往上淡出，详情从下方淡入
  const GH = isAFK() ? 14 : HH;   // 网格状态的标题栏高度：启程配色没有标题，只留拖动条下方一点空
  const gridTop=y+GH+FH, gview={x, y:gridTop, w, h:p.bottom-gridTop};
  const sl=slideMode(lay);
  if(a<1 || sl){ ctx.save(); if(!sl){ ctx.globalAlpha=1-a; ctx.translate(0, -a*28); }
    drawFilters(x, y+GH, w, a<0.01);
    ctx.beginPath(); ctx.rect(gview.x, gview.y, gview.w, Math.max(0,gview.h)); ctx.clip();
    drawGrid(gview, lay, a<0.01); ctx.restore(); }
  if(a>0 && !sl){ ctx.save(); ctx.globalAlpha=a; const off=(1-a)*36; ctx.translate(0, off);
    const live=a>0.99;
    drawActionBar(e, x, y+HH, w, live);
    const dTop=y+HH+AB, dview={x, y:dTop, w, h:p.bottom-dTop};
    ctx.beginPath(); ctx.rect(dview.x, dview.y-off, dview.w, Math.max(0,dview.h)); ctx.clip();
    drawDetail(e, dview); ctx.restore(); }
  ctx.restore();
  if(TH.rim && !lay.land){ drawRimEdge(lay, y); if(sl) drawRimBar(lay, y, 1, a); else if(a<1) drawRimBar(lay, y, 1-a, 0); }
  else if(TH.gold && !lay.land){ ctx.save(); ctx.strokeStyle=TH.gold; ctx.lineWidth=2.5; rr(x+1,y+1,w-2,h+30,20); ctx.beginPath(); ctx.moveTo(x+1,y+21); ctx.arcTo(x+1,y+1,x+21,y+1,20); ctx.lineTo(x+w-21,y+1); ctx.arcTo(x+w-1,y+1,x+w-1,y+21,20); ctx.stroke(); ctx.restore(); }
}

// 装饰档：选中的筛选页签下沿压一条 Fantasy RPG 的金线 + 菱形饰（Frame_Tabmenu_Focus_01：FocusTab2 发光 192×41 + FocusTab1 线 176×26，
//   两层同心；原版页签宽 178，金线宽 176 ≈ 页签宽）。白图按启程金色 #dfad64 着色，发光层同色、半透明。线的中心（原图第 9.5 行）压在按钮下沿。
function tabFocus(cx, by, w){
  const s=w/176, l1=tinted('rpg/frame_tabmenu_focus_01_White1.png', D37.gold), l2=tinted('rpg/frame_tabmenu_focus_01_White2.png', D37.gold2);
  const y0=by-9.5*s;
  if(l2){ ctx.save(); ctx.globalAlpha*=0.55; ctx.drawImage(l2, cx-96*s, y0-7.5*s, 192*s, 41*s); ctx.restore(); }
  if(l1) ctx.drawImage(l1, cx-88*s, y0, 176*s, 26*s);
}
function drawFilters(x, y, w, live){
  const rows=[
    [['all','全部',null], ['fire','',icon(PROJ_ICON.fire)], ['water','',icon(PROJ_ICON.water)], ['grass','',icon(PROJ_ICON.grass)]],
    [['all','全部',null], ...Object.keys(ROLE_CN).map(k=>[k,'',roleIcon(k)])],
  ];
  rows.forEach((row,ri)=>{ const cur = ri===0?MT.fEl:MT.fRole, pad=12, gap=6, cw=(w-pad*2-gap*(row.length-1))/row.length, cy=y+4+ri*38;
    row.forEach(([id,lab,im],i)=>{ const r={x:x+pad+i*(cw+gap), y:cy, w:cw, h:32}, on=cur===id;
      let f=r;
      if(uiD()){   // 37 版：立体 = 描边 + 底部厚边（选中深色、未选中浅色），按下下沉
        f=dBox(r.x, r.y, r.w, r.h, 9, on?TH.filtOn:MT_UI.box, on?D37.sideD:D37.sideL, on?D37.out:D37.outL, pressK(r)); if(on) dHi(f, 9);
        /* 39 版（用户 2026-11-13）：去掉选中页签下沿的金线 + 菱形饰（tabFocus 不再调用） */ }
      else { btnShadow(r.x, r.y, r.w, r.h, 9); mtNine4(heroT('BaseFrame_Basic_Rectangle_H50', on?TH.filtOn:MT_UI.box), r.x, r.y, r.w, r.h, [25,25,25,25], 0.5); }
      if(ri===1 && id!=='all') im=roleIco(id, on);
      if(im) drawIconSh(im, f.x+f.w/2, f.y+f.h/2, 22, on?1:0.7); else text(lab, f.x+f.w/2, f.y+f.h/2, 13, on?'#fff':MT_UI.sub, 'center', 800, false);
      if(live) addHit(r, ()=>{ if(ri===0) MT.fEl=id; else MT.fRole=id; MT.gs=0; emit('ui'); }); }); });
}

const CARD_AR = 1.2075;   // 49 版（用户 2026-11-13：属性图标挪到旗子右边后「卡牌再稍微高 5% 避免太拥挤」）：1.15 → 1.15×1.05
const BADGE_T = 5, BADGE_SIDE = '#2a2325', BADGE_IC = 46;   // 42 版：卡片左上旗子、属性圆底的立体厚边（u）、厚边颜色、图标大小   // 卡高 / 卡宽
function gridGeom(view, lay){
  const pad=12, gap=8, cols = lay.land ? Math.max(4, Math.min(7, Math.floor((view.w-pad*2)/96))) : 4;
  const cw=(view.w-pad*2-gap*(cols-1))/cols, ch=cw*CARD_AR;   // 42 版（用户 2026-11-13：卡片太高、多余高度改矮）：原 428/320，改 1.15
  // 37 版立体档：行距加上宠物出框的高度 + 卡片底部厚边，出框的头不盖住上一行的星星、碎片数
  const gy = gap;   // 38 版（用户 2026-11-13）：卡片不出框、不加厚边
  return {pad, gap, gy, cols, cw, ch};
}
function drawGrid(view, lay, live){
  const list=filtered(), G2=gridGeom(view, lay);
  const rows=Math.ceil(list.length/G2.cols), contentH=G2.pad+rows*(G2.ch+G2.gy)+12;
  MT.gmax=Math.max(0, contentH-view.h);
  if(!list.length){ text('没有符合条件的宠物', view.x+view.w/2, view.y+40, 14, MT_UI.sub, 'center', 800, false); return; }
  list.forEach((e,i)=>{ const c=i%G2.cols, rw=Math.floor(i/G2.cols);
    const x=view.x+G2.pad+c*(G2.cw+G2.gap), y=view.y+G2.pad+rw*(G2.ch+G2.gy)-MT.gs;
    if(y>view.y+view.h || y+G2.ch+G2.gy<view.y) return;
    // 选中时轻微缩弹（用户 2026-11-12）：先缩约 5% 再回弹约 2%，0.45 秒衰减到原大小
    const k=(performance.now()-(MT.selT0||0))/450;
    if(e.key===MT.sel && k>=0 && k<1){ const sc=1-0.07*Math.sin(Math.PI*k*3)*(1-k)*(1-k), cx=x+G2.cw/2, cy=y+G2.ch/2;
      ctx.save(); ctx.translate(cx,cy); ctx.scale(sc,sc); ctx.translate(-cx,-cy); drawPetCardC(e, x, y, G2.cw, G2.ch); ctx.restore(); }
    else drawPetCardC(e, x, y, G2.cw, G2.ch);
    if(live) addHit({x, y, w:G2.cw, h:G2.ch}, ()=>{ if(e.owned) selectPet(e.key); else sfx('deny'); }, view); });   // 30 版：未解锁的不能选中
}
// 卡片：严格照 Fantasy Hero CardFrame_Rectangle_02_<色>.prefab（卡 320×428，u = 卡宽 / 320；Unity 坐标 y 向上，下面已换成从上往下）
//   Bg_Mask（Bg 九宫格，同时是遮罩）⊃ BgGradient（顶部，高 190）、BgDeco（放射纹）、角色
//   → FrontGradient（底部，高 189）→ InnerBorder → Border（高 +3）→ Label_Flag_01（左上）→ 圆框 + 职能 PictoIcon（左下）→ 名字（右下，48 号右对齐）→ 星星（0.6 倍，右对齐）
const CARD_CV = document.createElement('canvas'), CARD_MK = document.createElement('canvas');
// BgDeco（白色蛛网放射纹，原图不透明度最高只有 4%）：原版 1:1 显示时线条清楚；卡片缩小后细线被平均掉、几乎看不见。
// 按缩小倍数 es（屏幕像素 / 原图像素）把不透明度乘约 1/es（最多 3 倍）补回来，让游戏尺寸下的观感接近原版。
// 用叠画实现（不透明度很低时叠 n 次 ≈ 乘 n），不读像素。
const DECO_B = {};
function bgDecoBoost(es){
  const im=hero('CardFrame_Rectangle_02_BgDeco'); if(!ok(im)) return null;
  const f=Math.max(1, Math.min(3, Math.round(4/es)/4)); if(DECO_B[f]) return DECO_B[f];
  const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight; const g=c.getContext('2d');
  for(let n=f; n>0; n--){ g.globalAlpha=Math.min(1,n); g.drawImage(im,0,0); } g.globalAlpha=1;
  c.complete=true; c.naturalWidth=c.width; c.naturalHeight=c.height; return DECO_B[f]=c;
}
// 35 版（用户 2026-11-13：手机发烫、宠物页卡）：每张卡原来每帧都重画（约 60 次贴图 + 一次离屏遮罩），一屏 10 张 ≈ 640 次 / 帧。
//   改成每张卡画一次存进离屏画布，之后每帧只贴一次；卡的内容、选中、配色、尺寸、清晰度、图片加载进度任一变化就重画。
//   选中金框的呼吸光每帧现画（在卡片背后）；原配色的选中黄框也会动，选中那张不缓存。
const CARD_CACHE = new Map();
function drawPetCardC(e, x, y, w, h){
  const sel=e.key===MT.sel;
  if(sel && !isAFK()) return drawPetCard(e, x, y, w, h);
  if(sel) drawCardSelGlow(x, y, w, h);
  const cp=cardPortrait(e), pad=Math.ceil(w*0.16)+4;
  const key=[e.owned?1:0, e.rar, e.stars||1, shardHave(e.key), sel?1:0, MT.theme, MT.ui, w.toFixed(2), h.toFixed(2), DPR.toFixed(3), IMG_STAMP, cp?cp.c.width:0].join('|');
  let c=CARD_CACHE.get(e.key);
  if(!c || c.key!==key){
    c=c||{cv:document.createElement('canvas')}; c.key=key;
    const cw=Math.ceil((w+pad*2)*DPR), ch=Math.ceil((h+pad*2)*DPR);
    if(c.cv.width!==cw||c.cv.height!==ch){ c.cv.width=cw; c.cv.height=ch; }
    const g=c.cv.getContext('2d'); g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,cw,ch); g.setTransform(DPR,0,0,DPR,pad*DPR,pad*DPR);
    const save=ctx; ctx=g; try{ drawPetCard(e, 0, 0, w, h, true); } finally { ctx=save; }
    CARD_CACHE.set(e.key, c);
  }
  // 缓存图按设备像素 1:1 贴、位置对齐整像素（不然会被二次插值、比原来糊一点）；缩放动画中按原尺寸缩放贴
  const m=ctx.getTransform();
  if(m.b===0 && m.c===0 && Math.abs(m.a-DPR)<1e-3 && Math.abs(m.d-DPR)<1e-3){
    ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(c.cv, Math.round(m.a*(x-pad)+m.e), Math.round(m.d*(y-pad)+m.f)); ctx.restore(); }
  else ctx.drawImage(c.cv, 0, 0, c.cv.width, c.cv.height, x-pad, y-pad, c.cv.width/DPR, c.cv.height/DPR);
}
// 装饰档：卡片右下（唯一没有旗子、属性圆标、缺角的直角）压一个 Fantasy RPG 角饰 frame_cardframe_00_White5（113×113，带铆钉），
//   按启程金色重新着色（深 = #4f4548 描边、亮 = #f2c35f，原图明暗 ×2 后取色，主体落在 #dfad64 附近）。
//   原版卡 426 宽配 113 的角饰（≈ 卡宽 26%）；这里缩到卡宽 20%，星星仍压在它上面。未获得的卡不加（只有剪影和碎片数）。
function cardCorner(x, y, w, h, u){
  const im=recolor('rpg/frame_cardframe_00_White5.png', D37.sideD, D37.gold2, 2); if(!im) return;
  const s=w*0.20; ctx.drawImage(im, x+w-s+1.2*u, y+h-s+1.2*u, s, s);
}
// 42 版（用户 2026-11-13）：碎片收集进度条放在卡片里面底部（照塔塔冒险队：深底 + 青色填充 + 居中 有/需要）。
//   素材 Fantasy Hero Slider_Border_Rectangle_01（Bg / Fill / Border），按参考图着色。已获得 = 升下一星的碎片（满 5 星显示「满星」）；
//   未获得 = 召唤所需碎片，够了显示「可召唤」、黄色填充。升星所需碎片数还没设计，先用召唤数（RAR need）占位。
function drawCardBar(e, x, y, w, h, u){
  const bx=x+CARD_BAR.side*u, bw=w-CARD_BAR.side*2*u, bh=CARD_BAR.h*u, by=y+h-CARD_BAR.bottom*u-bh, k=bh/32;
  const have=shardHave(e.key), need=RAR[e.rar].need, maxed=e.owned && (e.stars||1)>=5;
  const up=e.owned && canStarUp(e.key);
  const p=maxed?1:Math.max(0, Math.min(1, have/need)), full=maxed || up || (!e.owned && have>=need);
  mtNine4(heroT('Slider_Border_Rectangle_01_Bg', '#2a2d44'), bx, by, bw, bh, [12,12,12,12], k);
  if(p>0){ const ins=3*k, fw=Math.max(9*k, (bw-ins*2)*p);
    mtNine4(full ? hero('Slider_Border_Rectangle_01_Fill_Yellow') : heroT('Slider_Border_Rectangle_01_Fill_White', '#6ff3ff'), bx+ins, by+ins, fw, bh-ins*2, [4,10,4,10], k); }
  mtNine4(heroT('Slider_Border_Rectangle_01_Border', '#141522'), bx, by, bw, bh, [12,12,12,12], k);
  const t = maxed ? '满星' : up ? '可升星' : (!e.owned && have>=need) ? '可召唤' : `${have}/${need}`;
  text(t, bx+bw/2, by+bh/2+1*u, 24*u, '#fff', 'center', 800, '#141522');
}
function drawCardSelGlow(x, y, w, h){
  const u=w/320, C=TH.card, a=0.85+0.15*Math.sin(performance.now()/220), d=1.2;
  ctx.save(); ctx.globalAlpha*=a; ctx.shadowColor=C.selGlow; ctx.shadowBlur=w*0.05*DPR;
  mtNine4(cardT('CardFrame_Rectangle_02_Bg', C.sel), x-d, y-d, w+d*2, h+d*2, [28,30,28,30], u); ctx.restore();
}
// 37 版立体档：宠物头部伸出卡片上沿（学塔塔冒险队：角色从卡片 / 按钮里伸出来）。
//   CARD_POP = 头顶高出卡片上沿多少（卡高的比例）；CARD_SIDE = 卡片底部厚边（u，卡宽 320 制）。
//   头顶位置用 card_bbox.js 的内容范围算：宠物大小不变（17 版用户认可的缩放规则），整体上移到头顶 = 卡片上沿 − CARD_POP×卡高；
//   出框部分只露上沿以上（左右照卡内边裁），下面照旧被卡框裁切。未获得的剪影卡不出框。
// 38 版（用户 2026-11-13）：宠物卡片不破框——宠物大小、长宽差别大，卡框是统一它们的限制；出框和厚边都撤掉
// 39 版（用户 2026-11-13：火蜥蜴很小、上下空很多，金鱼基本占满；高度和脚底起点差很多）：
//   所有宠物按可见内容（card_bbox.js）统一成同一个高度、脚底压在同一条线上，水平居中。
//   统一高度 = 最宽的那只（宽高比最大）刚好放得下卡宽 94% 时的高度，上限卡高 70%——新宠物加进 card_bbox.js 后自动重算，任何宠物都不会被左右裁掉。
// 42 版（用户 2026-11-13：宠物变小了）：卡片变矮 + 底部进度条放进卡里；宠物统一高度 = min(卡宽 80%, 卡宽 97% ÷ 最大宽高比)（约卡宽 80%），
//   脚底压在卡内进度条上方 CARD_BAR.gap 处
const CARD_PET = { HW:0.80, W:0.97 };
const CARD_BAR = { side:20, h:34, bottom:16, gap:6 };   // 卡内底部碎片进度条（u，卡宽 320 制）
let CARD_ASPECT_MAX = 0;
function cardAspectMax(){ if(CARD_ASPECT_MAX) return CARD_ASPECT_MAX; const B=window.CARD_BBOX||{}; let a=1;
  for(const k in B){ const b=B[k]; a=Math.max(a, (b[2]-b[0])/Math.max(1,b[3]-b[1])); } return CARD_ASPECT_MAX=a; }
function cardPlace(e, cp, w, h){
  const ch2=cp.y1-cp.y0, N=cp.c.width;
  const u=w/320, foot=h-(CARD_BAR.bottom+CARD_BAR.h+CARD_BAR.gap)*u;
  const H=Math.min(CARD_PET.HW*w, CARD_PET.W*w/cardAspectMax()), sc=H/ch2;
  return {dx:w/2-(cp.x0+cp.x1)/2*sc, dy:foot-cp.y1*sc, ds:N*sc};
}
function drawPetCard(e, x, y, w, h, noGlow){
  const P=(!e.owned && isAFK() && TH.locked) ? TH.locked : MT_PAL[e.rar], sel=e.key===MT.sel, u=w/320, C=TH.card;
  // 启程配色选中框（用户 2026-11-12：改成和卡片一样的缺角形状）：卡片背后垫一层卡底形状（同一张缺角九宫格）染金，往外扩一圈，带金色外发光、轻微呼吸
  // 26 版（用户 2026-11-12：金边太粗，改成和以前一样）：以前的方形选中框线宽约 1 设计像素（从 24 版实际画面量），这里外扩 1.2
  if(sel && isAFK() && !noGlow){ const a=0.85+0.15*Math.sin(performance.now()/220), d=1.2;
    ctx.save(); ctx.globalAlpha*=a; ctx.shadowColor=C.selGlow; ctx.shadowBlur=w*0.05*DPR;
    mtNine4(cardT('CardFrame_Rectangle_02_Bg', C.sel), x-d, y-d, w+d*2, h+d*2, [28,30,28,30], u); ctx.restore(); }
  // 投影：照启程卡片，卡片正下方一层柔和暖灰（canvas shadow 的模糊、偏移按屏幕像素算，要乘 DPR）
  const sd = 0;   // 38 版（用户 2026-11-13）：三档都只用平面投影，不加底部厚边
  if(C.shadow){ ctx.save(); ctx.shadowColor=C.shadow; ctx.shadowBlur=w*0.1*DPR; ctx.shadowOffsetY=w*0.06*DPR;
    ctx.fillStyle=MT_UI.panel; rr(x+3*u, y+3*u+sd, w-6*u, h-6*u, 26*u); ctx.fill(); ctx.restore(); }
  // 37 版立体档：卡片底部厚边 = 同一张缺角卡形，染该稀有度卡底最深的那一档颜色（front），往下错开 CARD_SIDE
  if(sd) mtNine4(cardT('CardFrame_Rectangle_02_Bg', P.front||C.front), x, y+sd, w, h, [28,30,28,30], u);
  // 1) 遮罩内的内容画到离屏画布，再用 Bg 的形状裁（Unity Mask 按 Bg 贴图的透明度裁）
  const pw=Math.ceil(w*DPR), ph=Math.ceil(h*DPR); if(CARD_CV.width!==pw||CARD_CV.height!==ph){ CARD_CV.width=pw; CARD_CV.height=ph; }
  const g=CARD_CV.getContext('2d'); g.setTransform(DPR,0,0,DPR,0,0); g.clearRect(0,0,w,h);
  const save=ctx; ctx=g;   // 复用 mtNine4 / drawImg 等工具画到离屏画布
  try{
    mtNine4(cardT('CardFrame_Rectangle_02_Bg', P.card), 0, 0, w, h, [28,30,28,30], u);
    mtNine4(cardT('CardFrame_Rectangle_02_BgGradient', P.cardG), 4*u, 3.5*u, w-8*u, 190*u, [24,0,24,0], u);
    const dc=bgDecoBoost(u*DPR); if(dc) g.drawImage(dc, 4*u, 3.5*u, w-8*u, h-190*u);
    // 角色：预制体里是 423×408 的大图、中心在卡中心下方 67，头身占满卡面、被卡框裁掉
    //   我们的角色按有内容的范围放，按自身宽高缩放：高不超过卡高 0.86、宽不超过卡宽 0.95（用户认可金鱼的大小，金鱼正好卡在这两条线上），
    //   取更严的那条；水平居中，竖直放在卡高 0.1～0.96 这一段的中间（矮宽的宠物不会被裁掉一半）
    const cp=cardPortrait(e); if(cp && cp.x1>cp.x0){ const pl=cardPlace(e, cp, w, h); g.drawImage(cp.c, pl.dx, pl.dy, pl.ds, pl.ds); }
    // 遮罩形状先完整画到另一张画布，再一次性 destination-in（九宫格分 9 块直接 destination-in 会互相清空）
    if(CARD_MK.width!==pw||CARD_MK.height!==ph){ CARD_MK.width=pw; CARD_MK.height=ph; }
    const mg=CARD_MK.getContext('2d'); mg.setTransform(DPR,0,0,DPR,0,0); mg.clearRect(0,0,w,h);
    ctx=mg; mtNine4(cardT('CardFrame_Rectangle_02_Bg', '#ffffff'), 0, 0, w, h, [28,30,28,30], u); ctx=g;
    g.setTransform(1,0,0,1,0,0); g.globalCompositeOperation='destination-in'; g.drawImage(CARD_MK,0,0); g.globalCompositeOperation='source-over';
  } finally { ctx=save; }
  ctx.drawImage(CARD_CV, 0,0,pw,ph, x,y,w,h);
  // 2) 遮罩外的层
  mtNine4(cardT('CardFrame_Rectangle_02_FrontGradient', P.front||C.front), x+4*u, y+h-5*u-189*u, w-8*u, 189*u, [24,0,24,0], u);
  mtNine4(cardRaw('CardFrame_Rectangle_02_InnerBorder'), x+4*u, y+4*u, w-8*u, h-9*u, [24,26,24,26], u);
  if(!isAFK()) mtNine4(cardT('CardFrame_Rectangle_02_Border', C.border), x, y-1.5*u, w, h+3*u, [28,32,28,31], u);   // 启程配色：用户要求去掉白色外框
  // 37 版立体档：出框——同一张头像再画一遍在卡框前面，只画卡片上沿以上 + 上沿内侧 14u（盖住内描边那一圈，头像在框前、不被线切过脖子）；
  //   左右到卡片外沿为止（出框部分的左右切口和卡边对齐），画在旗子、属性圆标之前，旗子和圆标仍压在最上面
  if(uiDeco() && e.owned) cardCorner(x, y, w, h, u);
  // 3) 左上 Label_Flag_01（66×76，中心距左 33、距顶 36.5）：原版放等级数字；等级还没设计，先放元素图标
  // 53 版（用户 2026-11-13：「旗帜和属性的圆形视觉上还是不一样大，调整成两个的高度一致，圆的大小保留，旗帜缩小」）：
  //   圆不动（直径 BD = 66×0.86 u）；旗子整体等比缩小到外轮廓（含描边、厚边）上下沿都和圆标一样：旗高 = BD + 描边，fk = 旗高 / 76，旗子各层和里面的图标都按 fu = u×fk 画。
  if(isAFK()){ const BD=66*0.86*u, olF=3.5*u, fk=(BD+olF)/(76*u), fu=u*fk, fx=x, fy=y-1.5*u, fw=66*fu, fh=76*fu, icy=fy+fh/2-7.7*fu;
    // 启程配色（用户 2026-11-12）：左上旗子改成原职能圆底的深棕色，里面放职能图标；属性图标放在旗子右边
    // 42 版（用户 2026-11-13：旗子和属性圆底大小不一样、旗宽应和圆宽一样、都改成立体效果）：
    //   旗子宽 = 圆底直径 = 66u；两者都加立体厚边——同形状染深色（BADGE_SIDE）往下错开 BADGE_T，外圈再垫一圈深色描边；两个图标一样大（BADGE_IC）
    // 50 版（用户 2026-11-13：「旗帜的立体度和属性的立体度不统一，两个折中一下做出同等程度的立体度」）：49 版旗子没有厚边、圆标厚边 10u。
    //   两个都用 5u 厚边 + 同一圈深色描边（BADGE_T 10 → 5）
    const T=BADGE_T*u, ol=3.5*u, side=BADGE_SIDE, out=D37.out;
    if(e.role){
      // 49 版（用户 2026-11-13：「旗帜是因为本来就是立体的额外加了阴影所以立体过头了吗？如果是就去掉」）：是。Label_Flag_01 素材自带渐变、内描边、外描边三层，
      //   42 版又在下面垫了一层厚边 + 一圈深色描边，叠起来过头。49 版两层都去掉；50 版折中：厚边减半，和属性圆标一样。
      mtNine4(heroT('Label_Flag_01_Bg', out), fx-ol, fy+T, fw+ol*2, fh+ol, [3,23,3,11], fu);   // 厚边底下的描边
      mtNine4(heroT('Label_Flag_01_Bg', side), fx, fy+T, fw, fh, [3,23,3,11], fu);              // 厚边
      mtNine4(heroT('Label_Flag_01_Bg', C.flagBgA), fx, fy, fw, fh, [3,23,3,11], fu);
      mtNine4(heroT('Label_Flag_01_Gradient', C.flagGA), fx+3*fu, fy+4*fu, fw-6*fu, 67*fu, [3,0,3,0], fu);
      mtNine4(heroT('Label_Flag_01_InnerBorder', C.flagInA), fx+3*fu, fy+2.5*fu, fw-6*fu, fh-8*fu, [3,20,3,7], fu);
      mtNine4(heroT('Label_Flag_01_Border', C.flagBdA), fx, fy, fw, fh, [3,26,3,10], fu);
      drawImgC(heroT(ROLE_ICON[e.role], C.roleIc), fx+fw/2, icy, BADGE_IC*fu); }
    if(e.owned && PROJ_ICON[e.el]){ const d=BD, cx=fx+fw+ol+5*u+d/2, cy2=fy+ol+d/2;   /* 51 版（用户 2026-11-13：「属性的圆最高点和旗帜一样吗」「怎么感觉更高都超出卡牌框了」）：49～50 版圆心对齐旗子里的图标，圆的描边上沿比旗子上沿高 1.6u、高出卡框 3.1u。改成圆（含描边）的最高点 = 旗子最高点 */   // 49 版（用户 2026-11-13：「属性的图标放在旗帜右边」，原来在旗子下面）：圆底中心和旗子里的职能图标同高，略小于旗宽，和右上的星星留开
      drawImgC(heroT('BaseFrame_Basic_Circle_H58', out), cx, cy2+T, d+ol*2);
      drawImgC(heroT('BaseFrame_Basic_Circle_H58', side), cx, cy2+T, d);
      drawImgC(heroT('BaseFrame_Basic_Circle_H58', out), cx, cy2, d+ol*2);
      drawImgC(heroT('BaseFrame_Basic_Circle_H58', C.flagBgA), cx, cy2, d);
      drawImgC(icon(PROJ_ICON[e.el]), cx, cy2, BADGE_IC*u); } }
  else if(e.owned && PROJ_ICON[e.el]){ const fx=x, fy=y-1.5*u, fw=66*u, fh=76*u;
    mtNine4(heroT('Label_Flag_01_Bg', C.flagBg), fx, fy, fw, fh, [3,23,3,11], u);
    mtNine4(heroT('Label_Flag_01_Gradient', C.flagG), fx+3*u, fy+4*u, fw-6*u, 67*u, [3,0,3,0], u);
    mtNine4(heroT('Label_Flag_01_InnerBorder', C.flagIn), fx+3*u, fy+2.5*u, fw-6*u, fh-8*u, [3,20,3,7], u);
    mtNine4(heroT('Label_Flag_01_Border', C.flagBd), fx, fy, fw, fh, [3,26,3,10], u);
    drawImgC(icon(PROJ_ICON[e.el]), fx+fw/2, fy+fh/2-7.7*u, 44*u); }
  // 4) 左下圆框（58，中心距左 46.9、距底 46.4）+ 职能 PictoIcon（128×0.35，#ddd4f3）
  if(e.role && !isAFK()){ const cx=x+33*u, cy=y+76*u+2*u+29*u;   // 42 版：左下要放进度条，挪到左上旗子下面
    drawImgC(heroT('BaseFrame_Basic_Circle_H58', C.roleBg), cx, cy, 58*u);
    drawImgC(heroT(ROLE_ICON[e.role], C.roleIc), cx, cy, 44.8*u); }
  // 5) 名字：右边距 21、中心距底 87.4、48 号；6) 星星：54×55×0.6，右对齐到右边距 21、中心距底 40
  const nameCol = e.owned ? C.name : C.nameOff;
  if(!isAFK()) text(e.cn, x+w-21*u, y+h-87.4*u, 48*u, nameCol, 'right', 800, C.stroke);   // 启程配色：用户要求小网格不显示名字
  // 28 版（用户 2026-11-12）：启程配色星星改成和右上属性图标一样大（66×44.8/58 ≈ 51），下边距不变（星底距卡底 23.5）
  // 42 版（用户 2026-11-13）：星级放右上角，5 格（亮 = 已有、暗 = 未有），从右往左数，间距小、相邻略重叠（照参考图那排星）；先画最左边，右边的压在上面
  if(e.owned){ const n=Math.min(5, e.stars||1), ss=40*u, step=29*u, cy=y+28*u, rx=x+w-25*u;
    for(let i=4;i>=0;i--) drawIconSh(hero('Grade_Star'), rx-i*step, cy, ss, i<n?1:0.3); }
  drawCardBar(e, x, y, w, h, u);
  // 选中：Fantasy Hero ItemFrame_Square_02_Single_Focus（黄框，角形和卡框一致）
  if(sel && isAFK()){}   // 启程配色的选中框画在卡片背后（见函数开头）
  else if(sel){ const f=hero('ItemFrame_Square_02_Single_Focus'); const a=0.8+0.2*Math.sin(performance.now()/220); ctx.globalAlpha*=a;
    mtNine4(f, x-5*u, y-6.5*u, w+10*u, h+13*u, [106,108,106,104], u*0.42); ctx.globalAlpha/=a; }
}

// 31 版（用户 2026-11-12：图标画风不一致、钟表用了两次、攻击图案和职能重复）：全部换成 Fantasy Hero PictoIcon 单色图标（和职能图标同一套），
//   每项一个、互不重复，也不用职能（Thunder/Bow/Attack/Shield/Critical）、底栏、筛选已用的图案
// 38 版（用户 2026-11-13：图标改回彩色立体）：全部用 LayerLab 2D Minimal - Icon Pack（宠物卡属性图标、战斗能量图标同一套），一项一个、不重复，
//   避开职能已用的剑、闪电、弓、盾图案：费用 = 战斗里的能量、伤害 = 肌肉、攻击间隔 = 快进、产能 = 电池、范围 = 靶、冷却 = 沙漏、能力 = 书
// 39 版：费用不在这里写，直接读战斗的 energyIcon()（render.js ENERGY_ICON），保证永远一致
const STAT_ICON = {hp:'Economy_Heart_Red', dmg:'Stat_Attack_01', int:'Item_Clock_01_Gold', prod:'Item_Battery_03_Yellow', range:'UI_ETC_Target_02_Blue', cd:'Item_Hourglass_01_Blue', ability:'Item_Scroll_01_Blue'};   // 39 版用户从候选里选定（2026-11-13）
const iconAny = n => n.includes('/') ? img(n) : icon(n);   // 39 版：名字不带 / 时是 icons/ 下的图
const statIco = k => k==='cost' ? energyIcon() : iconAny(STAT_ICON[k]);
function statRows(e){
  const d=e.d, rows=[['费用', `${d.cost}`, statIco('cost')]];
  if(d.hp>1) rows.push(['生命', `${d.hp}`, statIco('hp')]);
  if(d.dmg) rows.push(['伤害', `${d.dmg}`, statIco('dmg')]);
  if(d.int) rows.push(['攻击间隔', `${d.int} 秒`, statIco('int')]);
  if(d.prod) rows.push(['产能', `${d.prod} / ${d.prodInt} 秒`, statIco('prod')]);
  const range = {shooter:'本路前方', melee:`前方 ${d.reach||1} 格`, mine:'周围 3×3'}[d.shape]||'—';
  if(range!=='—') rows.push(['范围', range, statIco('range')]);
  rows.push(['冷却', `${d.cd} 秒`, statIco('cd')]);
  return rows;
}
// 详情固定按钮栏：不随详情内容滚动
function drawActionBar(e, x, y, w, live){
  const pad=14, bh=50, by=y+6;
  if(e.owned){
    const gap=8, bw=(w-pad*2-gap*2)/3;
    ['升级','升星','进化'].forEach((lab,i)=>{ const bx=x+pad+i*(bw+gap), up=i===1 && canStarUp(e.key);
      if(up){ const pu=1+0.03*Math.sin(performance.now()/180); ctx.save(); ctx.translate(bx+bw/2, by+bh/2); ctx.scale(pu,pu); heroButton(true, -bw/2, -bh/2, bw, bh, lab); ctx.restore(); }
      else heroButton(false, bx, by, bw, bh, lab);
      if(live) addHit({x:bx,y:by,w:bw,h:bh}, ()=>{ if(up) starUp(e.key); else { emit('deny'); toast(i===1 && starOpen(e.key) ? `还差 ${starNeed(e.key)-shardHave(e.key)} 个碎片` : '暂未开放'); } }); });
  } else {
    const have=shardHave(e.key), need=RAR[e.rar].need, ok2=have>=need, bw=Math.min(240, w-pad*2), bx=x+w/2-bw/2;
    const pu = ok2 ? 1+0.03*Math.sin(performance.now()/180) : 1;   // 碎片够了：按钮轻轻跳，提示可以点
    ctx.save(); ctx.translate(bx+bw/2, by+bh/2); ctx.scale(pu,pu); heroButton(ok2, -bw/2, -bh/2, bw, bh, '召唤'); ctx.restore();
    if(live) addHit({x:bx,y:by,w:bw,h:bh}, ()=>{ if(ok2) summonPet(e.key); else { emit('deny'); toast(`还差 ${need-have} 个碎片`); } });
  }
  ctx.fillStyle=TH.sep; ctx.fillRect(x+pad, y+AB-1, w-pad*2, 1);
}
function mtBox(x, y, w, h){ btnShadow(x, y, w, h, 12);   // 31 版（用户 2026-11-12）：属性、能力、升星等所有框都加和按钮同样的投影
  mtNine4(heroT('BaseFrame_Basic_Rectangle_H50', MT_UI.box), x, y, w, h, [25,25,25,25], 0.6); }
function drawDetail(e, view){
  const pad=14, x=view.x, w=view.w; let y=view.y+10-MT.ds; const y0=y;
  // 38 版（用户 2026-11-13）：删掉「稀有 · 火系 · 地雷」一行，和上方角色区的稀有度、属性、职能重复
  if(e.owned){
    // 27 版（用户 2026-11-12）：属性格控制在 2 行——不超过 4 项 2 列，超过 4 项 3 列（再多就加列，保证 2 行）
    const rows=statRows(e), cols=Math.max(rows.length>4?3:2, Math.ceil(rows.length/2)), gap=cols>2?8:10, bw=(w-pad*2-gap*(cols-1))/cols, bh=50;
    rows.forEach(([lab,val,im],i)=>{ const bx=x+pad+(i%cols)*(bw+gap), by=y+Math.floor(i/cols)*(bh+gap);
      mtBox(bx, by, bw, bh); drawIconSh(im, bx+22, by+bh/2, 28);
      text(lab, bx+42, by+16, 12, MT_UI.sub, 'left', 800, false); text(val, bx+42, by+34, 16, MT_UI.txt, 'left', 800, MT_UI.stroke); });
    y += Math.ceil(rows.length/cols)*(bh+gap)+6;
    text('能力', x+pad, y+10, 15, MT._behind?'#ffe3a6':MT_UI.gold, 'left', 800, MT_UI.stroke); y+=22;
    const lines=wrapCN(e.d.desc, w-pad*2-80, 13), ah=Math.max(78, 24+lines.length*19);
    mtBox(x+pad, y, w-pad*2, ah);
    // 31 版：能力图标 = 圆底（和卡片属性圆底同一张 BaseFrame_Basic_Circle_H58、同色）+ 技能书，等比例不变形
    drawImgC(heroT('BaseFrame_Basic_Circle_H58', TH.card.flagBgA||'#4f4548'), x+pad+37, y+ah/2, 48);
    drawImgC(iconAny(STAT_ICON.ability), x+pad+37, y+ah/2, 48*44.8/58);
    lines.forEach((l,i)=>text(l, x+pad+74, y+ah/2-(lines.length-1)*9.5+i*19, 13, MT_UI.txt, 'left', 800, false));
    y+=ah+16;
    const route=STAR_ROUTE[e.key];
    if(route){ text('升星', x+pad, y+10, 15, MT._behind?'#ffe3a6':MT_UI.gold, 'left', 800, MT_UI.stroke); y+=22;
      route.forEach((t,i)=>{ const bh2=40, by=y+i*(bh2+8); mtBox(x+pad, by, w-pad*2, bh2);
        for(let k=0;k<i+2;k++) drawIconSh(hero('Grade_Star'), x+pad+16+k*15, by+bh2/2, 16);
        text(t, x+pad+16+(i+2)*15+6, by+bh2/2, 13, MT_UI.txt, 'left', 800, false); });
      y+=route.length*48+8; }
  } else {
    const have=shardHave(e.key), need=RAR[e.rar].need;
    mtBox(x+pad, y, w-pad*2, 84);
    shardIcon(e.key, x+pad+46, y+42, 60);
    text('碎片', x+pad+90, y+24, 13, MT_UI.sub, 'left', 800, false);
    hpBar(x+pad+90+(w-pad*2-110)/2, y+38, w-pad*2-110, have/need, have>=need?'yellow':'blue', 18);
    text(`${have}/${need}`, x+pad+90+(w-pad*2-110)/2, y+47, 12, '#fff');
    y+=98;
    const lines=wrapCN(have>=need ? '碎片已集齐。点「召唤」，它就能上场。' : `集齐 ${need} 个碎片后可以召唤。`, w-pad*2, 13);
    lines.forEach((l,i)=>text(l, x+pad, y+8+i*19, 13, MT_UI.txt2, 'left', 800, false)); y+=lines.length*19+18;
  }
  MT.dmax=Math.max(0, (y-y0)+8-view.h);
}

// ---------- 动作 ----------
function selectPet(k){ MT.selT0=performance.now(); if(MT.sel!==k){ MT.prevSel=MT.sel; MT.sel=k; MT.swapT=0.3; } emit('ui'); if(MT.lay && !MT.lay.land && MT.snap==='full') MT.snap='mid'; }
function enterDetail(){ MT.detail=true; MT.ds=0; MT.sv=0; if(MT.lay && !MT.lay.land) MT.snap='mid'; emit('ui'); }
function exitDetail(){ MT.detail=false; MT.sv=0; emit('ui'); }
function stepPet(d){ let list=filtered().filter(e=>e.owned); if(!list.some(e=>e.key===MT.sel)) list=roster().filter(e=>e.owned);   // 30 版：左右切换只在已获得的之间
  const i=list.findIndex(e=>e.key===MT.sel); MT.prevSel=MT.sel; MT.selT0=performance.now(); MT.stepDir=d; MT.sel=list[(i+d+list.length)%list.length].key; MT.swapT=0.3; MT.ds=0; emit('ui'); }
function mtToggleBg(){ MT.bgMode = MT.bgMode==='grad'?'scene':'grad'; try{ localStorage.setItem('tata_petbg29', MT.bgMode); }catch(e){} emit('ui'); }
let BATTLE_ID = '1-1';
function goSummon(k){ MT.tab='pets'; ROSTER=null; roster(); MT.sel=k; MT.guide=k; enterDetail(); }
function startBattle(id){ if(id) BATTLE_ID=id;
  if(!(window.LEVELS||{})[BATTLE_ID] || (LEVELS[BATTLE_ID].wip && !/[?&]wip=1\b/.test(location.search))){ emit('deny'); toast('暂未开放'); return; }   // 70 版：wip 的关只在网址带 ?wip=1 时能进（测试用）
  { const k=PET_ORDER.find(canSummon); if(k){ goSummon(k); toast(DATA.pets[k].cn+'的碎片已集齐，先召唤它'); return; } }   // 有宠物可以召唤：先去召唤，下一关要用
  if(L.kind==='landscape'){ orientMode='portrait'; resize(); }   // 战斗的横屏界面还没做（进去会报错停住，64 版就有）：进战斗先回竖屏
  if(!BATTLE_READY){ BATTLE_WAIT=true; BATTLE_WAIT_TAB=MT.tab; emit('ui'); return; }   // 55 版：战斗特效还在后台加载 → 先显示进度，加载完自动开始（render.js loadLater）
  setLevel(BATTLE_ID); if(window.CHAPTER_MAP) CHAPTER_MAP.S.playing=BATTLE_ID;
  MT.inBattle=true; newGame(); G.started=true; emit('start'); }
// 结算后离开战斗：这关给的碎片够召唤 → 直接到宠物页那只宠物的详情；否则回地图
function leaveBattle(){ const k=G.over && G.over.win && G.over.summon; MT.inBattle=false; MT.tab='battle'; MT.drag=null; MT.hits.length=0; if(COMBO._LIVE) COMBO._LIVE.length=0;   // 上一次局外画面留下的点击区域、拖动状态清掉，免得这一下松手点到别处
  if(k && (canSummon(k) || canStarUp(k))) goSummon(k); emit('ui'); }

// ---------- 其他两个页面（下一步做；先放可进战斗的入口） ----------
function drawBattleEntry(lay){
  // 31 版（用户 2026-11-12）：背景改成实际的战斗场景（同一关的地面、道具、环境动态），不再用别的图
  const c=lay.content; ctx.save(); ctx.beginPath(); ctx.rect(c.x,c.y,c.w,c.h); ctx.clip();
  if(G && G.cells){ SCENE.ensure(G.cells); ENV_T+=1/60; SCENE.drawGround(ctx);
    for(const pp of SCENE.props().filter(pp=>!pp.flat).sort((a,b)=>a.y-b.y)) SCENE.drawProp(ctx,pp,ENV_T);
    SCENE.drawFx(ctx, ENV_T, 1/60, icon('Misc_Leaf_01_Green')); }
  ctx.restore();
  heroRibbon('Title_Ribbon_01_Blue', c.x+c.w/2, c.y+c.h*0.3, Math.min(c.w*0.8,300), 72, `${DATA.level.id} ${DATA.level.title}`, 20);
  const b={x:c.x+c.w/2-100, y:c.y+c.h*0.62, w:200, h:66}; const pulse=1+0.03*Math.sin(performance.now()/180);
  ctx.save(); ctx.translate(b.x+b.w/2, b.y+b.h/2); ctx.scale(pulse,pulse); heroButton(true, -b.w/2, -b.h/2, b.w, b.h, '开始战斗'); ctx.restore();
  addHit(b, startBattle);
}
// 32 版（用户 2026-11-12）：营地 = 和宠物页背景 B 同风格的分层场景 + 宠物自由活动 + 投喂（camp.js）
function drawCamp(lay){ CAMP.draw(lay); }

// ---------- 底部（横屏：左侧）菜单 ----------
// Fantasy Hero 缎带（Title_Ribbon：左右两端是九宫格边，中间拉伸）
const RIB_BD = {Title_Ribbon_01_Blue:[108,0,108,0], Title_Ribbon_03_Purple:[253,0,256,0]};
function heroRibbon(n, cx, cy, w, h, label, size){
  const im=hero(n); if(!ok(im)) return; const k=h/im.naturalHeight;
  mtNine4(im, cx-w/2, cy-h/2, w, h, RIB_BD[n], k); text(label, cx, cy-h*0.06, size, '#fff', 'center', 800, '#1b142e');
}
// 底栏：严格照 Fantasy Hero TabMenu_BottomFlush_01.prefab（Collection_List 用的就是它）。u = 屏宽 / 1080（原版画布宽）
//   未选中：高 175，Bg #3b304e、顶部亮边 Light #565076、内阴影 #332b47、边框 #151428，图标中心距顶 85、不显示文字
//   选中：高 189，Bg #7550d2、Light #8f8fff、内阴影 #593da1，图标中心距顶 58，文字中心距顶 142（36 号）
const NAV_C = { off:{bg:'#3b304e', light:'#565076', shadow:'#332b47'}, on:{bg:'#7550d2', light:'#8f8fff', shadow:'#593da1'}, border:'#151428' };
const NAV_ICON = {battle:'ItemIcon_Battle', pets:'ItemIcon_Card_1', camp:'ItemIcon_Shop'};
const navIco = id => NAV_ICON[id].includes('/') ? img(NAV_ICON[id]) : hero(NAV_ICON[id]);   // 39 版：营地图标候选来自别的包
function navTab(r, on, u){
  const C=on?NAV_C.on:NAV_C.off;
  mtNine4(heroT('Tab_BottomFlush_01_White_Bg', C.bg), r.x, r.y, r.w, r.h, [29,5,29,25], u);
  mtNine4(heroT('Tab_BottomFlush_01_White_Light', C.light), r.x+4.1*u, r.y+4.07*u, r.w-8.2*u, 20*u, [25,0,25,0], u);
  mtNine4(heroT('Tab_BottomFlush_01_White_InnerShadow', C.shadow), r.x+4.1*u, r.y+16.9*u, r.w-8.2*u, r.h-17.2*u, [7,13,7,17], u);
  mtNine4(heroT('Tab_BottomFlush_01_White_Border', NAV_C.border), r.x, r.y, r.w, r.h, [29,4,29,26], u);
}
// 37 版立体 / 装饰档底栏：照塔塔冒险队营地底栏（1170×2532 截图逐像素量，按钮外框 1170 宽下约 213×200）：
//   ① 每个页签是单独一块圆角按钮：深色描边 + 底部更深的厚边 + 柔和投影；选中仍是浅色（#f1ece1）、抬高、显示文字，未选中深暖灰（#685d5b）。
//   ② 图标放大并伸出按钮上沿。量出来：图标高 ≈ 按钮高 0.63～0.74（取 0.70）；伸出上沿 = 战斗 0、塔塔猫耳 3/200、糖果机 15/200，
//      即按钮高的 0～7.5%（取最大的 0.08；文档里目测的“1/4～1/3”是估计，实际量出来小得多）。
//   ③ 按下下沉、松开回弹。装饰档：按钮本体换成 Fantasy RPG 倒角按钮（四角斜切 + 倒角边线 + 底部暗边），按启程颜色重新着色。
const NAV_ICON_H = 0.70, NAV_POP = 0.08;
// 47 版（用户 2026-11-13：「底部按钮可以再高一些，现在太扁了不好点。超出那个白色的线一些。图标进一步超出一些，你先做个效果我看看」）：
//   up = 按钮上沿高出底栏上沿多少（负数 = 在底栏里面）；pop = 图标伸出按钮上沿 / 按钮高。
//   试看用：网址加 ?nav=0（46 版原样）/ 1 / 2 切换；不加参数 = 1。底栏本身高度不变，内容区不动。
const NAV_VARS = { 0:{up:-12*NAV_K, pop:0.08}, 1:{up:8*NAV_K, pop:0.22}, 2:{up:16*NAV_K, pop:0.32} };   // 53 版：up 跟着 × NAV_K
// 底栏按钮和图标高出底栏上沿多少（竖屏）：营地的投喂圆钮等贴着底栏的东西要让开这一段
function navOver(){ const up=NAV_V.up+6*NAV_K; return Math.max(0, up + (NAV_BAR_H-NAV_BOT+up)*NAV_V.pop); }   /* 59 版：按选中页签（再抬高 6×NAV_K）的图标高度算，地图页卡片不再贴着图标 */
const NAV_V = NAV_VARS[(/[?&]nav=(\d)/.exec(location.search)||[])[1]] || NAV_VARS[1];
function navDepth(lay, tabs){
  const n=lay.nav, deco=uiDeco();
  tabs.forEach(([id,lab],i)=>{
    const on=MT.tab===id, im=navIco(id);
    let r, hit;
    if(!lay.land){ const pd=n.pad||0, m=8, gap=8, bw=(n.w-m*2-gap*2)/3, lift=on?6*NAV_K:0, top=n.y-NAV_V.up-lift;
      r={x:n.x+m+i*(bw+gap), y:top, w:bw, h:n.y+n.h-pd-NAV_BOT-top}; hit={x:n.x+i*n.w/3, y:Math.min(n.y, top), w:n.w/3, h:n.y+n.h-Math.min(n.y, top)}; }
    else { const m=8, bh=Math.min(96, (n.h-90)/3-16), gap=16, y0=n.y+(n.h-(bh*3+gap*2))/2+i*(bh+gap)+8, lift=on?5:0;
      r={x:n.x+m+(on?0:3), y:y0-lift, w:n.w-m*2-(on?0:6), h:bh+lift}; hit={x:n.x, y:y0-12, w:n.w, h:bh+24}; }
    const s=pressK(hit), C=on?NAV_C.on:NAV_C.off, rad=Math.min(14, r.h*0.2);
    let f;
    if(deco){ const T=Math.max(2.5, Math.min(5, r.h*0.09)); btnShadow(r.x+2, r.y+2, r.w-4, r.h*0.8, rad);   // RPG 按钮自带底部暗边和投影；垫的投影只到按钮面，免得浅色垫底从按钮半透明的底边透出来
      f={x:r.x, y:r.y+T*s, w:r.w, h:r.h-T}; rpgButton(r.x, f.y, r.w, r.h-T*(s>0?s:0), C.bg, D37.out); }
    else { f=dBox(r.x, r.y, r.w, r.h, rad, C.bg, on?D37.sideL:D37.sideD, D37.out, s); dHi(f, rad); }
        // 48 版（用户 2026-11-13：「图标的下方应该在按钮下方 1/3 的位置，不能空太多」「如果图标太大放不下就稍微减低一点按钮的高度」）：
    //   竖屏：图标下沿固定在按钮面从上往下 2/3 处，上沿伸出按钮；文字在下面 1/3 里居中。图标被宽度限制缩小时也贴着 2/3 这条线，不往上飘。
    if(ok(im)){ const NP=lay.land?NAV_POP:NAV_V.pop, ih=lay.land ? r.h*NAV_ICON_H : f.h*2/3 + r.h*NP,
      iw=Math.min(ih*im.naturalWidth/im.naturalHeight, f.w*0.86), ih2=iw*im.naturalHeight/im.naturalWidth;
      const iy=lay.land ? f.y-r.h*NP + (ih-ih2)/2 : f.y+f.h*2/3-ih2; ctx.drawImage(im, f.x+f.w/2-iw/2, iy, iw, ih2); }
    if(on) text(lab, f.x+f.w/2, lay.land ? f.y+f.h-Math.min(13, f.h*0.2) : f.y+f.h*5/6-1, Math.min(15, f.h*0.24), TH.navLab, 'center', 800, TH.navLabS);
    addHit(hit, ()=>{ if(MT.tab!==id){ MT.tab=id; emit('ui'); } });
  });
}
function drawNav(lay){
  const n=lay.nav, u=lay.land ? n.w/200 : W/1080;
  // 37 版立体 / 装饰档：底栏底板改成面板底部的米灰（TH_AFK.panelGrad #ddd6c8，低饱和的“底”），深色按钮的描边、厚边才看得出来（用户 2026-11-13：低饱和底 + 立体物件）
  ctx.fillStyle=uiD()?TH.panelGrad:NAV_C.border; ctx.fillRect(n.x,n.y,n.w,n.h);
  const tabs=[['battle','战斗'], ['camp','营地'], ['pets','宠物']];   // 32 版（用户 2026-11-12）：营地放在底栏正中
  if(uiD()) navDepth(lay, tabs);
  else tabs.forEach(([id,lab],i)=>{
    const on=MT.tab===id, im=navIco(id);
    let r, hit;
    if(!lay.land){ const tw=n.w/tabs.length, pd=n.pad||0, th=(on?189.4:174.9)*u; r={x:n.x+i*tw, y:n.y+n.h-pd-th, w:tw, h:th+pd}; hit={x:n.x+i*tw, y:n.y, w:tw, h:n.h}; btnShadow(r.x+4, r.y, r.w-8, r.h, 16); navTab(r, on, u); }
    else { // 横屏：同一块页签旋转 90°，平边贴屏幕左边
      const th=Math.min(120,(n.h-80)/tabs.length), y0=n.y+(n.h-th*tabs.length)/2+i*th, tw=(on?189.4:174.9)*u;
      r={x:n.x, y:y0, w:tw, h:th}; hit={x:n.x, y:y0, w:n.w, h:th};
      ctx.save(); ctx.translate(r.x, r.y+r.h); ctx.rotate(-Math.PI/2); navTab({x:0,y:0,w:r.h,h:r.w}, on, u); ctx.restore(); }
    const sz=128*u;
    if(!lay.land){ drawImgC(im, r.x+r.w/2, r.y+(on?57.8:85.1)*u, sz); if(on) text(lab, r.x+r.w/2, r.y+141.7*u, 36*u, TH.navLab, 'center', 800, TH.navLabS); }
    else { drawImgC(im, r.x+r.w-(on?57.8:85.1)*u, r.y+r.h/2-(on?10:0), sz); if(on) text(lab, r.x+r.w-57.8*u, r.y+r.h/2+sz*0.42, 14, TH.navLab, 'center', 800, TH.navLabS); }
    addHit(hit, ()=>{ if(MT.tab!==id){ MT.tab=id; emit('ui'); } });
  });
  // 横竖屏切换（检查用；战斗里本来就有）
  const ob = lay.land ? {x:n.x+n.w/2-18, y:n.y+n.h-46, w:36, h:36} : {x:W-42, y:10+(lay.top||0), w:32, h:32};
  if(lay.land || MT.tab!=='pets' || (MT.dp<0.01 && MT.snap!=='full' && MT.panelY>60)){ ctx.globalAlpha=0.8; nine(gui('Button/Button_Round03_Dark'), ob.x, ob.y, ob.w, ob.h, 30, 10); drawImgC(icon('UI_Common_Refrash_01_White'), ob.x+ob.w/2, ob.y+ob.h/2, ob.w*0.55); ctx.globalAlpha=1;
    addHit(ob, ()=>{ orientMode = L.kind==='landscape'?'portrait':'landscape'; resize(); MT.panelY=null; }); }
}

// 38 版（用户 2026-11-13）：营地右上角资源条——金币、星星。竖屏在横竖屏切换按钮左边，横屏贴右上角。
//   做法照塔塔冒险队：深色胶囊 + 描边 + 投影，图标比胶囊大、压在胶囊左端往外凸，白色粗体数字加深色描边。
const RES_ITEMS = [['gold','Economy_Coin_02_Gold'], ['star','Star_Altar_05_Star']];
function drawResBar(lay){
  const h=26, w=88, ic=34, gap=ic*0.5+8, top=(lay.land?12:13)+(lay.top||0);
  let right = lay.land ? W-12 : W-52;
  for(let i=RES_ITEMS.length-1;i>=0;i--){ const [k,n]=RES_ITEMS[i], x=right-w, y=top;
    // 40 版（用户 2026-11-13：图标已经很凸了，背景就不要凸了）：胶囊去掉投影和顶部高光线，只留平的深色底 + 描边
    ctx.save(); rr(x, y, w, h, h/2); ctx.fillStyle='rgba(58,49,51,.82)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#2a2224'; ctx.stroke(); ctx.restore();
    drawImgC(k==='gold'?coinIcon():icon(n), x+3, y+h/2, ic);   // 41 版：金币读 COIN_ICON
    const v=Math.max(0, Math.floor((typeof WALLET!=='undefined' && WALLET[k])||0)).toLocaleString('en-US');
    text(v, x+w-11, y+h/2+1, 15, '#fff', 'right', 800, '#2a2224');
    right = x - gap; }
}

// ---------- 主绘制 ----------
function drawMeta(){
  const now=performance.now(), dt=Math.min(0.05,(now-MT.last)/1000); MT.last=now;
  ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#14111f'; ctx.fillRect(0,0,cv.width,cv.height); ctx.restore();
  if(!READY){ text(LOADMSG,W/2,H/2,18,'#fff'); return; }
  if(MT._th!==MT.theme) applyTheme();
  if(typeof audioPump==='function') audioPump();
  ctx.save(); ctx.beginPath(); ctx.rect(0,0,W,H); ctx.clip();
  const lay=metaLayout(); MT.lay=lay; MT.hits.length=0; roster();
  if(MT.tab==='pets'){
    const md=MT.drag&&MT.drag.mode;
    // 面板位置：拖动中直接跟手（不缓动），松手后指数趋近停靠位，不过冲、不回弹
    if(!lay.land){ const tgt=lay.snaps[MT.snap]!=null?lay.snaps[MT.snap]:lay.snaps.mid; if(MT.panelY==null) MT.panelY=tgt;
      if(md!=='pp'){ MT.panelY += (tgt-MT.panelY)*Math.min(1, dt*16); if(Math.abs(tgt-MT.panelY)<0.3) MT.panelY=tgt; } }
    // 详情进度 dp：下拉时跟手，松手后趋近 0 / 1
    if(md!=='pp' && md!=='pull'){ const tgt=MT.detail?1:0; MT.dp += (tgt-MT.dp)*Math.min(1, dt*14); if(Math.abs(tgt-MT.dp)<0.003) MT.dp=tgt; }
    // 惯性滚动
    if(md!=='scroll'){ const k=MT.detail?'ds':'gs', mx=MT.detail?MT.dmax:MT.gmax; MT[k]+=MT.sv*dt; MT.sv*=Math.pow(0.04,dt);
      if(MT[k]<0){ MT[k]*=Math.max(0,1-dt*14); MT.sv=0; } if(MT[k]>mx){ MT[k]=mx+(MT[k]-mx)*Math.max(0,1-dt*14); MT.sv=0; } }
    drawCharArea(lay, dt);   // 59 版（用户 2026-11-13）：面板拉满时刘海那一条也画原本的场景背景，不留黑底
    drawPanel(lay, dt);
  } else if(MT.tab==='battle') drawBattleEntry(lay); else { drawCamp(lay); drawResBar(lay); }
  if(MT.tab!=='camp' && CAMP.S.drag){ CAMP.cancel(); if(MT.drag && MT.drag.camp) MT.drag=null; }   // 32 版：离开营地时手里的食物放回去
  drawNav(lay);
  if(MT.toast){ MT.toast.t-=dt; const a=Math.min(1,MT.toast.t*3); if(a<=0) MT.toast=null; else { ctx.globalAlpha=a; ctx.font=`800 14px ${FONT}`; const tw=ctx.measureText(MT.toast.s).width+44; pill(W/2-tw/2, H*0.5-18, tw, 36); text(MT.toast.s, W/2, H*0.5, 14, '#fff', 'center', 800, false); ctx.globalAlpha=1; } }
  ctx.restore();
}

// 战斗结算加一个「返回」（回到战斗页）
function backRect(){ const b=resultButton(); return {x:b.x, y:b.y+b.h+14, w:b.w, h:54}; }
const _drawBattle = draw;
// 66 版（用户 2026-11-14）：宠物页的两处浮窗说明，各只出现一次
//   ① 第一次来召唤：说明碎片怎么来、集满能做什么。② 第一次召唤完：面板默认显示全部宠物，往上拖更大、往下拖看详情；玩家拖上去、再拖下来看到详情就结束
function drawPetGuide(){
  const lay=MT.lay; if(!lay || lay.land) return; const now=performance.now(), tt=now/1000;
  const arrow=tinted('gui/IconMisc/Icon_Arrow_Next2.png','#ffe9a0');
  const flow=(x,y0,y1)=>{ if(!arrow) return; const n=3, dy=y1-y0; for(let i=0;i<n;i++){ const k=((i+(tt*1.4)%1)/n), al=Math.sin(k*Math.PI), h=20, w=h*arrow.width/arrow.height;
      ctx.save(); ctx.globalAlpha=0.95*al; ctx.translate(x, y0+dy*k); ctx.rotate(dy<0?-Math.PI/2:Math.PI/2); ctx.drawImage(arrow, -w/2, -h/2, w, h); ctx.restore(); } };
  if(MT.guide && MT.sel===MT.guide && canSummon(MT.guide) && !PROFILE.tipSummon && MT.detail){
    tutBubble('战斗中有概率获得碎片。集满后点「召唤」，它就成为你的宠物。', W/2, H*0.66, 'center'); return; }
  if(MT.guide && MT.sel===MT.guide && canStarUp(MT.guide) && !PROFILE.tipStar && MT.detail){
    tutBubble('碎片集齐后，点「升星」。'+DATA.pets[MT.guide].cn+'升到 '+(starOf(MT.guide)+1)+' 星：'+(STAR_ROUTE[MT.guide]?STAR_ROUTE[MT.guide][starOf(MT.guide)-1]:'')+'。', W/2, H*0.66, 'center'); return; }
  if(!MT.ptut || now<MT.ptutT) return;
  if(MT.ptut===1 && MT.detail){ exitDetail(); return; }   // 先回到显示全部宠物的样子
  const py=MT.panelY!=null ? MT.panelY : lay.snaps.mid;
  if(MT.ptut===1){ if(MT.snap==='full' && !MT.drag){ MT.ptut=2; return; }
    flow(W/2, py-6, py-70); tutBubble('这里显示全部宠物。向上拖，空间更大；向下拖，看详细信息。', W/2, py+260, 'center'); }
  else { if(MT.detail && !MT.drag){ MT.ptut=0; PROFILE.tipPanel=1; profileSave(); return; }
    flow(W/2, py+40, py+110); tutBubble('再向下拖，看这只宠物的详细信息。', W/2, Math.max(py+190, H*0.5), 'center'); }
}
let FIRST_RUN = true;   // 1-1 还没通关 = 新玩家：每次打开都直接进 1-1（中途刷新、关掉重开也一样），通关后才从营地开始
// 测试用：网址加 ?skip=3（或控制台 TATA.skip(3)）= 前 3 关算已通关，对应的宠物、机制直接给；?reset=1 = 清空进度从 1-1 重来
function cheatSkip(n){ const ids=MAP_DATA.chapters[0].levels.map(l=>l.id).slice(0,n); CHAPTER_MAP.preset(n);
  PROFILE={owned:{flower:1, goldfish:1}, unlock:{}}; for(const id of ids){ const rw=(LEVELS[id]||{}).reward; if(!rw) continue; if(rw.shard && DATA.pets[rw.shard[0]]){ const k=rw.shard[0]; if(PROFILE.owned[k]){ PROFILE.stars=PROFILE.stars||{}; PROFILE.stars[k]=starOf(k)+1; } else PROFILE.owned[k]=1; } if(rw.unlock) PROFILE.unlock[rw.unlock]=1; }
  profileSave(); ROSTER=null; FIRST_RUN=false; MT.tab='battle'; }
{ const q=/[?&]skip=(\d+)/.exec(location.search); if(q) document.addEventListener('DOMContentLoaded', ()=>cheatSkip(+q[1])); }
draw = function(){
  if(window.NIGHT_DEMO && FIRST_RUN && READY && !MT.inBattle){ FIRST_RUN=false; cheatSkip(7); startBattle('1-6'); }   // 71 版：夜景预览，直接进一局（存档只在内存里）
  if(FIRST_RUN && READY && !MT.inBattle){ FIRST_RUN=false; if(!levelCleared('1-1')){ MT.tab='battle'; startBattle('1-1'); } }   // 65 版：第一次打开直接进 1-1，不进营地
  if(!MT.inBattle){ drawMeta();
    if(MT.tab==='pets'){ const now=performance.now(), cdt=Math.min(0.05,(now-(MT.fxT||now))/1000); MT.fxT=now; COMBO.draw(cdt,'world'); drawPetGuide(); } else MT.fxT=0;   // 65 版：宠物页上的召唤特效
    if(BATTLE_WAIT && MT.tab!==BATTLE_WAIT_TAB) BATTLE_WAIT=false;   // 换页签 = 取消等待
    if(BATTLE_WAIT){ ctx.save(); ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,H); text('加载战斗素材… '+BATTLE_N[0]+'/'+BATTLE_N[1],W/2,H/2,18,'#fff'); ctx.restore(); }
    return; }
  _drawBattle();
  if(G.over && READY){ const b=backRect(); ctx.save(); ctx.beginPath(); ctx.rect(0,0,W,H); ctx.clip(); bigButton('Blue', b.x, b.y, b.w, b.h, G.over.win?'再打一次':'返回'); ctx.restore(); }
};
const _updateBattle = update;
update = function(dt){ if(MT.inBattle) _updateBattle(dt); };

// ---------- 输入（局外时整段拦下，不进战斗的处理） ----------
// 手势：先判断方向（移动超过 8 像素后锁定），再按区域决定做什么：
//   网格状态，角色区 / 标题栏 上下拖（pp）：往上 = 面板上拉盖满；往下 = 详情随距离淡入（PULL 像素到完整）
//   详情状态，角色区 / 标题栏 上下拖（pull）：往上拉 = 详情逐渐淡出回网格
//   面板内容区上下拖 = 滚动；详情状态在角色区左右拖 = 换宠物
function regionAt(x,y){
  const lay=MT.lay; if(!lay || MT.tab!=='pets') return 'other';
  if(inR(lay.nav,x,y)) return 'other';
  if(lay.land){ if(inR(lay.char,x,y)) return 'char'; if(x>=lay.panel.x && x<=lay.panel.x+lay.panel.w) return y<HH?'header':'body'; return 'other'; }
  if(slideMode(lay) && MT.dp>0.5){ const dr=detailBehindRect(lay);   // 面板拉到底：详情区上下拖 = 滚动，其余当角色区（上下拖收回、左右换宠物、点一下收回）
    if(y>=dr.y+AB && y<dr.y+dr.h) return 'body'; return y<lay.panel.bottom ? 'char' : 'other'; }   // 面板拉到底：整块都当角色区（上下拖收回、左右换宠物、点一下收回）
  if(y<panelTop(lay)) return 'char';
  if(y<MT.panelY+(isAFK()&&!MT.detail?14:HH)+(MT.detail?0:FH)) return 'header';   // 59 版（用户 2026-11-13）：两排筛选按钮这一块也是拖面板（和拖动条一样），不滚动卡片；点按钮照常筛选
  if(y<lay.panel.bottom) return 'body';
  return 'other';
}
function mtVel(d){ // 最近 100ms 的平均速度（像素/秒）
  const now=performance.now(), s=d.samples.filter(q=>now-q.t<100); if(s.length<2) return 0;
  const a=s[0], b=s[s.length-1]; return (b.y-a.y)/Math.max(30,b.t-a.t)*1000; }   // 至少按 30ms 算，避免同一毫秒内的事件算出极大速度
function mtPP(d, dy){   // 网格状态下的上下拖：面板位置 + 详情进度连成一条
  const lay=MT.lay;
  if(lay.land){ MT.dp=clamp01(dy/PULL); return; }
  const s=lay.snaps, v=d.p0+dy;
  if(v<=s.mid){ MT.panelY=Math.max(s.full, v); MT.dp=0; }
  else { MT.panelY=s.mid; MT.dp=clamp01((v-s.mid)/pullDist(lay)); }
}
window.addEventListener('pointerdown', e=>{
  if(!READY) return; const x=PX(e), y=PY(e);
  if(MT.inBattle){ const lr=G.over && resultLeaveRect(); if(lr && (G.overT||0)>0.6 && inR(lr,x,y)){ leaveBattle(); e.stopImmediatePropagation(); } return; }
  e.stopImmediatePropagation();
  MT.press={x, y, up:0};   // 37 版：按钮按下下沉
  // 32 版：营地页（除了底栏、横竖屏按钮）交给 camp.js：拖食物喂宠物、点宠物
  //   只认第一根手指（pointerId）；正在营地里拖的时候，别的手指按下一律不管，免得拖拽状态被顶掉、食物悬在空中
  if(MT.drag && MT.drag.camp){ if(e.pointerId!==MT.drag.pid) return; CAMP.cancel(); MT.drag=null; }   // 同一根手指又按下 = 上次的松开没收到（如在窗口外松开）：先把上次的收掉
  if(MT.tab==='camp' && !MT.hits.some(q=>inR(q.r,x,y))){ MT.drag={camp:true, pid:e.pointerId}; CAMP.down(x,y); return; }
  const now=performance.now();
  MT.drag={region:regionAt(x,y), sx:x, sy:y, mode:null, p0:MT.panelY, dp0:MT.dp, s0:MT.detail?MT.ds:MT.gs, samples:[{y,t:now}]};
  MT.sv=0;
}, {capture:true});
window.addEventListener('pointermove', e=>{
  if(MT.inBattle) return; e.stopImmediatePropagation();
  if(MT.press && !MT.press.up && Math.hypot(PX(e)-MT.press.x, PY(e)-MT.press.y)>8) MT.press=null;   // 拖动了就不算按按钮
  const d=MT.drag; if(!d) return; if(d.camp){ if(e.pointerId===d.pid) CAMP.move(PX(e),PY(e)); return; }
  const x=PX(e), y=PY(e), dx=x-d.sx, dy=y-d.sy, now=performance.now();
  d.samples.push({y,t:now}); if(d.samples.length>12) d.samples.shift();
  if(!d.mode){
    if(Math.hypot(dx,dy)<8) return;
    const vert=Math.abs(dy)>=Math.abs(dx), rg=d.region;
    if(vert && (rg==='char'||rg==='header')) d.mode = MT.detail ? 'pull' : 'pp';
    else if(vert && rg==='body') d.mode='scroll';
    else if(!vert && rg==='char' && MT.detail) d.mode='swipeX';
    else d.mode='none';

  }
  if(d.mode==='pp') mtPP(d, dy);
  else if(d.mode==='pull') MT.dp=clamp01(d.dp0+dy/pullDist(MT.lay));
  else if(d.mode==='scroll'){ const k=MT.detail?'ds':'gs', mx=MT.detail?MT.dmax:MT.gmax; let v=d.s0-dy; if(v<0) v*=0.3; else if(v>mx) v=mx+(v-mx)*0.3; MT[k]=v; }
}, {capture:true});
window.addEventListener('pointerup', e=>{
  if(MT.inBattle) return; e.stopImmediatePropagation();
  if(MT.press && !MT.press.up) MT.press.up=performance.now();   // 松手回弹
  const d=MT.drag; if(!d) return; if(d.camp){ if(e.pointerId!==d.pid) return; MT.drag=null; CAMP.up(PX(e),PY(e)); return; }
  const x=PX(e), y=PY(e), dx=x-d.sx, vy=mtVel(d);
  if(!d.mode){ MT.drag=null; const h=[...MT.hits].reverse().find(q=>inR(q.r,x,y)); if(h){ h.fn(); return; }
    if(d.region==='char'){ MT.detail?exitDetail():enterDetail(); } return; }
  if(d.mode==='pp'){
    if(MT.dp>0.35 || (vy>600 && MT.dp>0.05)) enterDetail();
    else { MT.detail=false;
      if(!MT.lay.land){ const s=MT.lay.snaps, proj=MT.panelY+vy*0.12; MT.snap = proj < (s.full+s.mid)/2 ? 'full' : 'mid'; } }
  } else if(d.mode==='pull'){
    if(MT.dp<0.65 || vy<-600) exitDetail(); else MT.detail=true;
  } else if(d.mode==='scroll') MT.sv=-vy;
  else if(d.mode==='swipeX' && Math.abs(dx)>40) stepPet(dx<0?1:-1);
  MT.drag=null;
}, {capture:true});
window.addEventListener('pointercancel', ()=>{ MT.press=null; if(MT.drag){ if(MT.drag.camp) CAMP.cancel(); MT.drag=null; } }, {capture:true});
// 32 版：切走窗口时，营地里拿着的食物放回去
window.addEventListener('blur', ()=>{ if(MT.drag && MT.drag.camp){ CAMP.cancel(); MT.drag=null; } });
window.addEventListener('wheel', e=>{ if(MT.inBattle || MT.tab!=='pets') return; const rg=regionAt(PX(e),PY(e)); if(rg!=='body' && rg!=='header') return; const k=MT.detail?'ds':'gs', mx=MT.detail?MT.dmax:MT.gmax; MT[k]=Math.max(0,Math.min(mx, MT[k]+e.deltaY*0.6)); }, {passive:true});
window.addEventListener('keydown', e=>{ if(e.key==='h'||e.key==='H'||e.key==='q'||e.key==='Q'){ MT.charV={}; for(const k in SIL) delete SIL[k]; }
  if(e.key==='o'||e.key==='O'){ orientMode = L.kind==='landscape'?'portrait':'landscape'; resize(); MT.panelY=null; }
  if((e.key==='b'||e.key==='B') && !MT.inBattle) mtToggleBg();
  if((e.key==='p'||e.key==='P') && !MT.inBattle) mtToggleTheme();
  if((e.key==='u'||e.key==='U') && !MT.inBattle) mtToggleUi(); });
window.addEventListener('resize', ()=>{ MT.panelY=null; });
window.TATA.meta = MT;

// ---------- 39 版：图标候选面板（只在网址带 ?pick=1 时出现，正式游戏里没有） ----------
// 每项点一下就在真实界面里换上；选好后把面板底部那行编号告诉 Claude。
(function(){
  if(!/[?&]pick=1/.test(location.search)) return;
  const I='icons/', E='gui/UI_Etc/ResourceBar_Single_Icon_Energy.png';
  const C = [
    ['cost','费用（战斗能量同步换）', [E, I+'Economy_Energy_01_Yellow.png', I+'Economy_Energy_02_Yellow.png', 'hero/ItemIcon_Energy_Blue.png']],
    ['hp','生命', ['Stat_HP_01','Economy_Heart_Red','Economy_Heart_02_Red','Economy_Heart_03_Red','Stat_HP_Regen_01']],
    ['dmg','伤害', ['Stat_Power_01','Stat_Attack_01','Stat_Attack_02','Misc_Fist_01_Gold','Misc_Fist_02_Yellow','Stat_Critical_01','Gear_Weapons_Hammer_01','Gear_Weapons_Axe_01']],
    ['int','攻击间隔', ['UI_Common_Speed_01_Yellow','Stat_AttackSpeed_01','UI_Common_Speed_02_White','Item_Clock_01_Gold','Stat_MoveSpeed_01']],
    ['prod','产能', ['Item_Battery_03_Yellow','Stat_GoldGainIncrease_01','Item_Battery_01_Gold','Economy_Elixir_01_Yellow','Misc_Clover_01_Gold']],
    ['range','范围', ['UI_ETC_Target_01','UI_ETC_Target_02_Blue','Misc_Crosshair_01_Red','Misc_Crosshair_01_Yellow','Item_Compass_01_Gold','Item_Telescope']],
    ['cd','冷却', ['Item_Hourglass_01_Gold','Item_Hourglass_02_Yellow','Item_Hourglass_01_Blue','Item_Clock_01_Silver','Item_Clock_02_Yellow']],
    ['ability','能力', ['Item_Book_02_Blue','Stat_Skill_01','Item_Book_05_Purple','Item_Scroll_01_Blue','Item_MagicOrb','Item_Book_03_Yellow']],
    ['coin','金币（资源条、结算同步换）', ['coin_pick/01_Minimal_Coin_02_Gold.png','icons/Economy_Coin_03_Gold_trim.png','coin_pick/03_Minimal_Coin_04_Gold.png','coin_pick/05_FH_ItemIcon_Coin_Gold.png','coin_pick/06_FH_ResourceBar_01_Coin.png','coin_pick/07_FH_Icon_Coin_01.png','coin_pick/08_FH_Icon_Coin_02.png','coin_pick/09_FH_ShopItem_Coin_1.png','coin_pick/10_GUIPro_ResourceBar_Coin.png','coin_pick/11_GUIPro_Icon_Coin.png','coin_pick/12_GUIPro_ItemIcon_Money_Coin.png','coin_pick/13_Casual_Coin01_Gold.png']],
    ['camp','营地页签', ['ItemIcon_Shop','town_icon/Lute_House_01.png','town_icon/Castle.png','town_icon/Fountain.png',I+'UI_Common_Home_01_Red.png',I+'Building_Castle_01.png','hero/ItemIcon_Map.png']],
  ];
  const url = (k,v) => 'assets/' + (v.includes('/') ? v : (k==='camp' ? 'hero/'+v+'.png' : I+v+'.png'));
  const cur = {}; C.forEach(([k,,list])=>{ const v = k==='cost' ? ENERGY_ICON.path : k==='coin' ? COIN_ICON.path : k==='camp' ? NAV_ICON.camp : STAT_ICON[k]; cur[k]=Math.max(1, list.indexOf(v)+1); });   // 默认 = 当前正式图标
  try{ Object.assign(cur, JSON.parse(localStorage.getItem('tata_pick')||'{}')); }catch(_){}
  function apply(k){ const row=C.find(r=>r[0]===k), v=row[2][cur[k]-1]; if(!v) return;
    if(k==='cost') ENERGY_ICON.path=v; else if(k==='coin') COIN_ICON.path=v; else if(k==='camp') NAV_ICON.camp=v; else STAT_ICON[k]=v; }
  const box=document.createElement('div');
  box.style.cssText='position:fixed;left:6px;right:6px;bottom:96px;z-index:99;background:rgba(20,22,30,.9);color:#fff;border-radius:10px;padding:6px 8px;font:13px/1.3 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.4)';
  document.body.appendChild(box);
  let sel=localStorage && (()=>{ try{ return localStorage.getItem('tata_pick_row')||'dmg'; }catch(_){ return 'dmg'; } })(), open=true;
  function render(){
    C.forEach(([k])=>apply(k));
    const used={}; let dup=[];
    C.forEach(([k,,list])=>{ if(k==='camp'||k==='coin') return; const v=k==='cost'?ENERGY_ICON.path:list[cur[k]-1]; if(used[v]) dup.push(used[v]+'/'+k); used[v]=k; });
    const row=C.find(r=>r[0]===sel);
    box.innerHTML = `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <b style="cursor:pointer" data-t="1">${open?'▾':'▸'} 图标候选</b>
      ${open? C.map(([k,lab])=>`<span data-k="${k}" style="cursor:pointer;padding:2px 6px;border-radius:6px;background:${k===sel?'#e0a84a':'#3a3e4c'}">${lab.replace(/（.*/,'')}</span>`).join(''):''}
    </div>` + (open? `<div style="margin-top:6px">${row[1]}：</div><div style="display:flex;gap:6px;overflow-x:auto;padding:4px 0">
      ${row[2].map((v,i)=>`<div data-i="${i+1}" style="cursor:pointer;flex:none;text-align:center;padding:3px;border-radius:8px;border:2px solid ${cur[sel]===i+1?'#ffd25a':'transparent'};background:#2b2f3b">
        <img src="${url(sel,v)}" style="width:40px;height:40px;object-fit:contain;display:block"><span>${i+1}</span></div>`).join('')}
    </div><div style="opacity:.85">当前：${C.map(([k,lab])=>lab.replace(/（.*/,'')+' '+cur[k]).join(' · ')}${dup.length?`<br><span style="color:#ff8a8a">重复了：${dup.join('、')}</span>`:''}</div>` : '');
    try{ localStorage.setItem('tata_pick', JSON.stringify(cur)); localStorage.setItem('tata_pick_row', sel); }catch(_){}
  }
  ['pointerdown','pointerup','pointermove','mousedown','mouseup','touchstart','touchend','touchmove','wheel'].forEach(t=>box.addEventListener(t, e=>e.stopPropagation()));
  box.addEventListener('click', e=>{ e.stopPropagation(); const t=e.target.closest('[data-t],[data-k],[data-i]'); if(!t) return;
    if(t.dataset.t) open=!open; else if(t.dataset.k) sel=t.dataset.k; else cur[sel]=+t.dataset.i; render(); });
  render();
})();
