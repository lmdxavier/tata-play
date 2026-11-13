'use strict';
/* =====================================================================
   塔塔 · 营地（39 版：可拖动的大地图，用户 2026-11-13）
   - 地图：俯视 3/4 视角的一整块林地（参照塔塔冒险队营地）。中间开放一小块空地，宠物在空地上活动；
     四周是成片的树（2D Minimal Environment 1 的树，原图自带地上的影子），按脚的位置和宠物、建筑前后排序。
     手指 / 鼠标按住空白处拖动地图（带惯性），地图边界外是更多的树，以后扩建往外开。
   - 建筑：LayerLab 2D Buildings - Town（assets/camp/，Merged Shadows 版，影子在图里）：
     星之祭坛（产星星）、星之仓库（按星星存量显示 4 档装满程度）、鲁特小屋、喷泉、女神猫像。
     宠物不会走进建筑后面被挡住的那一块（OBS），也不会走出空地。
   - 星之祭坛：每打完一局战斗攒星星（胜利 +3、失败 +1，最多存 20 颗；docs/玩法与界面.md「设施产出按打了几局算，不按真实时间」），
     祭坛上方冒出带数量的气泡；点祭坛 = 星星飞到右上角资源条，WALLET.star 增加（tata_wallet，和金币同一份存档）。
     新营地第一次打开时祭坛里先有 5 颗（让玩家马上看到怎么收）。存档键 tata_altar。
   - 宠物：已获得的宠物全部在营地里自己活动。每只有性格（速度、各种行为的偏好），行为分单独和成对两类，
     随机挑选、互相牵连，所以每次看都不一样（行为表见 docs/玩法与界面.md「营地 32 版」）。
   - 投喂：左下角的食物格每 10 分钟 +1，最多 10 个（按真实时间，存在浏览器本地）；
     把食物拖到宠物身上 = 喂它：宠物咬一口（投喂-吃）→ 冒小爱心（投喂-爱心，爱心图标往上飘）→ 开心地跳一会。
     奖励（经验、碎片等）用户之后再设计：喂完发出 emit('campFeed', {key})，现在没有接任何奖励。
   - 特效、音效只引用组合名（素材库\效果组合）；爱心、气泡、食物图标都是 Fantasy Hero 界面包的图（和宠物页同一套）。
   只读 DATA / ROSTER，不改战斗；只往 HOOKS 里挂一个监听（数打了几局）。
   ===================================================================== */
const CAMP = (()=>{
  const FOOD_MAX = 10, FOOD_MS = 10*60*1000, FOOD_KEY = 'tata_campfood';
  // 性格：speed = 走路速度（u/秒）；solo = 单独行为的权重；soc = 和别的宠物一起做的事的偏好
  const PERS = {
    pug:     {speed:34, solo:{wander:3, idle:1.5, rest:1,   happy:1,   social:4},   soc:{fight:4,   chase:3, greet:1, dance:1,   follow:1}},
    bomb:    {speed:40, solo:{wander:3.5, idle:1, rest:0.6, happy:1.5, social:3.5}, soc:{chase:4,   dance:3, fight:1.5, greet:1, follow:1}},
    goldfish:{speed:26, solo:{wander:3, idle:2, rest:1,     happy:1,   social:3},   soc:{greet:3,   follow:3, dance:1, chase:1, fight:0.4}},
    flower:  {speed:20, solo:{wander:2, idle:2, rest:2,     happy:2.5, social:2.5}, soc:{dance:4,   greet:3, follow:1, chase:0.5, fight:0.2}},
    pumpkin: {speed:16, solo:{wander:1.5, idle:2, rest:4,   happy:0.8, social:1.5}, soc:{greet:2,   follow:2, dance:1, fight:1, chase:0.3}},
    lizard:  {speed:26, solo:{wander:2.5, idle:2, rest:2.5, happy:0.5, social:2.5}, soc:{fight:4,   greet:1, chase:1.5, follow:0.5, dance:0.2}},
  };
  // ---------- 营地体型（用户 2026-11-13：按现实合理调整，不再统一大小） ----------
  // 营地里每种宠物「看得见的身高」= CAMP_H × 体型系数（u，竖屏一屏约 400u 宽）。以巴哥 = 1 为准：
  //   巴哥（小型犬）1.0；火蜥蜴是「龙」类，比狗大 → 1.35（身体又长，看起来大一圈）；
  //   南瓜（一颗大南瓜）和彩虹花（一株大花）差不多大 → 都是 1.05；鱼缸金鱼是桌上的小鱼缸 → 0.8；炸弹是圆炸弹 → 0.7；
  //   未获得的（以后进营地）：史莱姆 0.75、甲虫 0.7、蜗牛 0.65、狐狸比小狗略大 1.1、灰熊最大 1.7。
  const CAMP_H = 60;
  const BODY = { pug:1.0, lizard:1.35, pumpkin:1.05, flower:1.05, goldfish:0.8, bomb:0.7, slime:0.75, beetle:0.7, snail:0.65, fox:1.1, bear:1.7 };
  // 可见内容占骨架绘制高度的比例（h = 可见高 / visH）和可见宽 / 绘制高：2026-11-13 用 renderChar 画 Idle、读不透明像素量出来的
  //   （运行时不能读像素：file:// 打开时画布跨域会报错）。炸弹的骨架范围比身体大很多（引线火花），所以 visH 只有 0.59。
  const VIS = { flower:[0.89,0.795], goldfish:[0.905,0.72], pug:[0.875,0.97], pumpkin:[0.99,0.85], bomb:[0.59,0.775], lizard:[0.925,1.045],
                slime:[0.925,0.84], beetle:[0.885,0.975], snail:[0.935,1.015], fox:[0.975,1.145], bear:[0.975,1.15] };
  const visOf = k => VIS[k] || [0.9, 0.9];
  const petVis = p => CAMP_H*(BODY[p.key]||1);                  // 看得见的身高（u）
  const petH   = p => petVis(p)/visOf(p.key)[0];                 // 骨架绘制高度（u）
  const petR   = p => Math.max(18, petH(p)*visOf(p.key)[1]/2);   // 看得见的半宽（u），用来算互相让开的距离
  const DEF_PERS = {speed:26, solo:{wander:3, idle:2, rest:1.5, happy:1, social:2.5}, soc:{greet:2, dance:1, chase:1, fight:1, follow:1}};
  const persOf = k => PERS[k] || DEF_PERS;
  const rnd = (a,b) => a+Math.random()*(b-a);
  const pick = w => { let s=0; for(const k in w) s+=w[k]; let r=Math.random()*s; for(const k in w){ r-=w[k]; if(r<=0) return k; } return Object.keys(w)[0]; };

  const S = { pets:null, pairs:[], hearts:[], fly:null, drag:null, map:null, last:0, G:null, down:null, cam:{x:0, y:20}, vel:{x:0, y:0}, pan:null, stars:[], bump:{}, lay:null };

  // ---------- 食物：每 10 分钟 +1，最多 10 个 ----------
  let FOOD = null;
  function foodLoad(){
    if(FOOD) return FOOD;
    let f=null; try{ f=JSON.parse(localStorage.getItem(FOOD_KEY)||'null'); }catch(e){}
    FOOD = (f && typeof f.n==='number' && typeof f.t==='number') ? f : {n:FOOD_MAX, t:Date.now()};
    foodTick(); return FOOD;
  }
  function foodSave(){ try{ localStorage.setItem(FOOD_KEY, JSON.stringify(FOOD)); }catch(e){} }
  function foodTick(){
    const now=Date.now();
    if(FOOD.t>now) FOOD.t=now;   // 系统时间被往回调：从现在重新计
    if(FOOD.n>=FOOD_MAX){ FOOD.n=FOOD_MAX; FOOD.t=now; return; }
    const k=Math.floor((now-FOOD.t)/FOOD_MS);
    if(k>0){ FOOD.n=Math.min(FOOD_MAX, FOOD.n+k); FOOD.t = FOOD.n>=FOOD_MAX ? now : FOOD.t+k*FOOD_MS; foodSave(); }
  }
  function foodUse(){ if(FOOD.n>=FOOD_MAX) FOOD.t=Date.now(); FOOD.n--; foodSave(); }

  // ---------- 地图（世界坐标，单位 u；原点 = 空地中心，y 往下为正） ----------
  // u 和以前一样：竖屏 min(宽/400, 高/720)，横屏 min(宽/400, 高/560)，所以竖屏一屏约 400u 宽。
  const WORLD = {hw:600, hh:620};            // 能拖到的范围（镜头中心最多走到这里减半屏）
  const CLR = {cx:0, cy:10, rx:182, ry:300}; // 空地：树的脚不进这里
  const PA  = {cx:0, cy:30, rx:138, ry:232}; // 宠物脚能站的范围（空地里面再收一圈）
  const PAX = {cx:PA.cx, cy:PA.cy-36, rx:PA.rx+30, ry:PA.ry+40};   // 宠物身体占的范围（约 60u 宽、70u 高）：树冠不能盖到这里
  const EDGE = 0;
  const camImg = n => img('camp/'+n+'.png');
  const envImg = n => img('env1/'+n+'.png');
  const ENVM = n => (window.ENV1 && ENV1[n]) || {w:200, h:300, foot:0.87};
  // 建筑：x, y = 脚（地面接触线）的世界坐标；w = 显示宽度（u）。图是 Merged Shadows 版，底部带影子，footK = 脚在图里的高度比例
  const BUILD = [
    {id:'house',   n:'Lute_House_01',         x: -94, y:-150, w:110, nw:228, nh:270, footK:0.93},
    {id:'storage', n:'Star_Storage_02_00',    x:  96, y:-146, w:100, nw:219, nh:245, footK:0.90},   // 41 版（用户 2026-11-13）：仓库换 02 石底款
    {id:'altar',   n:'Star_Altar_01_Bottom',  x:   0, y: -62, w:100, nw:218, nh:184, footK:0.90},
    {id:'statue',  n:'Goddess_Cat_Statue_01', x: 106, y: 172, w: 66, nw:201, nh:281, footK:0.93},
    {id:'fountain',n:'Fountain',              x:-102, y: 180, w: 86, nw:210, nh:221, footK:0.86},
  ];
  for(const b of BUILD){ b.h=b.w*b.nh/b.nw; }
  const bTop = b => b.y - b.h*b.footK;               // 图顶（祭坛另加漂浮的水晶）
  // 宠物不能站的地方：建筑后面会被挡住的那一块（宠物约 60u 宽、70u 高）+ 建筑底座
  const OBS = BUILD.map(b=>({x0:b.x-b.w*0.5-18, x1:b.x+b.w*0.5+18, y0:bTop(b)-4, y1:b.y+10}));
  // 休息的地方：空地边上的树荫、建筑旁边
  const REST = [{x:-130,y:-40},{x:135,y:-30},{x:-140,y:90},{x:140,y:80},{x:-40,y:225},{x:50,y:230},{x:-170,y:-200},{x:175,y:-205}];

  function viewOf(lay){ const c=lay.content, u=lay.land ? Math.min(c.w/400, c.h/560) : Math.min(c.w/400, c.h/720); return {c, u, hw:c.w/2/u, hh:c.h/2/u}; }
  function clampCam(v){
    const mx=Math.max(0, WORLD.hw-v.hw), my=Math.max(0, WORLD.hh-v.hh);
    S.cam.x=Math.max(-mx, Math.min(mx, S.cam.x)); S.cam.y=Math.max(-my, Math.min(my, S.cam.y));
  }
  // g：和以前的营地同一套接口（cx = 世界 x=0 在屏幕上的位置，yTop..yBot = 宠物能站范围在屏幕上的上下边），宠物逻辑不用改
  function geo(lay){
    const v=viewOf(lay), {c,u}=v; if(!S.camInit){ S.camInit=true; S.cam.y = lay.land ? -10 : 20; } clampCam(v);
    const ox=c.x+c.w/2-S.cam.x*u, oy=c.y+c.h/2-S.cam.y*u, bottom=c.y+c.h;
    const yTop=oy+(PA.cy-PA.ry)*u, yBot=oy+(PA.cy+PA.ry)*u;
    const box = lay.land ? {x:c.x+18, y:bottom-18-84, w:84, h:84} : {x:c.x+14, y:bottom-Math.max(14, (typeof navOver==='function'?navOver():0)+8)-80, w:80, h:80}   /* 47 版：底栏按钮 / 图标高出底栏后，投喂圆钮跟着上移，不被图标压住 */;
    return {c, u, ox, oy, cx:ox, bottom, yTop, yBot, half:PA.rx, box, v};
  }
  const yOf = (g, d) => g.yTop + d*(g.yBot-g.yTop);
  const kOf = d => 1;                                  // 俯视地图：不分远近大小
  const dOf = (g, y) => clamp01((y-g.yTop)/(g.yBot-g.yTop));
  const wyOfD = d => PA.cy-PA.ry + d*2*PA.ry;          // 宠物深度 d → 世界 y
  const dOfWy = y => clamp01((y-(PA.cy-PA.ry))/(2*PA.ry));
  const SX = (g, x) => g.ox + x*g.u, SY = (g, y) => g.oy + y*g.u;
  const inEll = (E, x, y, m) => { const nx=(x-E.cx)/(E.rx+(m||0)), ny=(y-E.cy)/(E.ry+(m||0)); return nx*nx+ny*ny<1; };

  // ---------- 树林、灌木、空地上的小东西（确定性随机，只生成一次） ----------
  const TREE_N = ['Tree_Green_03','Tree_Green_04','Tree_Green_05','Tree_Green_06','Tree_Green_07','Tree_Green_08','Tree_Green_09','Tree_Green_10','Tree_Green_15','Tree_Green_17','Tree_Green_19'];
  function buildMap(){
    const R=seeded(39), trees=[], bushes=[], flat=[], tufts=[];
    const hitsClear = (x, y, w, h, foot) => {   // 树的脚进了空地、或树冠会盖住宠物能站的地方（或压到建筑上）就不种
      const top=y-h*foot;
      if(inEll(CLR,x,y) || inEll(CLR,x-w*0.25,y) || inEll(CLR,x+w*0.25,y)) return true;
      const pts=[[x,top+h*0.12],[x-w*0.36,y-h*0.45],[x+w*0.36,y-h*0.45],[x-w*0.3,top+h*0.25],[x+w*0.3,top+h*0.25],[x-w*0.3,y-h*0.1],[x+w*0.3,y-h*0.1]];
      if(pts.some(([px,py])=>inEll(PAX,px,py))) return true;
      for(const b of BUILD){ if(y>b.y-6 && x+w*0.4>b.x-b.w*0.5 && x-w*0.4<b.x+b.w*0.5 && top<b.y && y>bTop(b)) return true; }
      return false;
    };
    const SXs=56, SYs=40;
    for(let gy=-WORLD.hh-90, row=0; gy<=WORLD.hh+260; gy+=SYs, row++){
      for(let gx=-WORLD.hw-120+(row%2)*SXs/2; gx<=WORLD.hw+120; gx+=SXs){
        const x=gx+(R()-0.5)*SXs*0.7, y=gy+(R()-0.5)*SYs*0.6;
        let n=TREE_N[Math.floor(R()*TREE_N.length)]; if(R()<0.28) n=n.replace('Tree_Green','Tree_Yellow_Green');
        const m=ENVM(n), h=rnd2(R,130,180)*(n.endsWith('_17')||n.endsWith('_19')?1.12:1), w=h*m.w/m.h;
        if(hitsClear(x,y,w,h,m.foot)) continue;
        trees.push({n, x, y, h, w, foot:m.foot, flip:R()<0.5, ph:R()*6});
      }
    }
    // 空地边上一圈灌木（树林和空地之间的过渡），不进宠物范围
    for(let i=0;i<34;i++){ const a=i/34*Math.PI*2+R()*0.12, rr=0.96+R()*0.1, x=CLR.cx+Math.cos(a)*CLR.rx*rr, y=CLR.cy+Math.sin(a)*CLR.ry*rr;
      if(inEll(PA,x,y,8) || BUILD.some(b=>Math.abs(x-b.x)<b.w*0.6 && y<b.y+14 && y>bTop(b)-10)) continue;
      const n=['Bush_Green_01','Bush_Green_02','Bush_Green_03','Bush_Yellow_Green_01','Bush_Green_02'][i%5], m=ENVM(n), h=rnd2(R,30,44)*(n.endsWith('_03')?1.15:1);
      bushes.push({n, x, y, h, w:h*m.w/m.h, foot:m.foot, flip:R()<0.5, ph:R()*6, bush:true}); }
    // 空地上的碎石、蘑菇（贴地，画在宠物下面），小草小花
    const okSpot = (x,y) => inEll(CLR,x,y,-16) && !OBS.some(o=>x>o.x0-6 && x<o.x1+6 && y>o.y0 && y<o.y1+10);
    const FL=['Stone_Gray1_03','Stone_Gray1_07','Stone_Brown_02','Mushroom_Pink_01','Mushroom_Wihte_02','Mushroom_Yellow_01','Stone_Gray1_10','Mushroom_Pink_02'];
    for(let i=0, k=0; i<60 && k<14; i++){ const x=(R()*2-1)*CLR.rx, y=CLR.cy+(R()*2-1)*CLR.ry; if(!okSpot(x,y)) continue;
      const n=FL[k%FL.length], m=ENVM(n); const h=n.startsWith('Mush')?rnd2(R,13,18):rnd2(R,10,16); flat.push({n, x, y, h, w:h*m.w/m.h, foot:m.foot||0.9, flip:R()<0.5}); k++; }
    const TF=['Forest_Grass','Forest_Flower_01','Forest_Grass','Forest_Flower_02'];
    for(let i=0, k=0; i<260 && k<70; i++){ const x=(R()*2-1)*(CLR.rx+40), y=CLR.cy+(R()*2-1)*(CLR.ry+30); if(!inEll(CLR,x,y,10) || !okSpot(x*0.98,y)) continue;
      const n=TF[k%4], m=ENVM(n), h=rnd2(R,7,11); tufts.push({n, x, y, h, w:h*m.w/m.h, flip:R()<0.5}); k++; }
    trees.sort((a,b)=>a.y-b.y);
    return {trees, bushes, flat, tufts};
  }
  const rnd2 = (R,a,b) => a+R()*(b-a);

  // ---------- 星之祭坛：按打了几局攒星星 ----------
  const ALT_KEY='tata_altar', ALT_MAX=20, ALT_WIN=3, ALT_LOSE=1, ALT_FIRST=5, STORE_CAP=100;
  let ALT=null;
  function altLoad(){ if(ALT) return ALT; let a=null; try{ a=JSON.parse(localStorage.getItem(ALT_KEY)||'null'); }catch(e){}
    ALT=(a && typeof a.buf==='number') ? a : {buf:ALT_FIRST}; if(!a) altSave(); return ALT; }
  function altSave(){ try{ localStorage.setItem(ALT_KEY, JSON.stringify(ALT)); }catch(e){} }
  function altAdd(n){ altLoad(); ALT.buf=Math.min(ALT_MAX, ALT.buf+n); altSave(); }
  try{ if(typeof HOOKS!=='undefined') HOOKS.push((type)=>{ if(type==='win') altAdd(ALT_WIN); else if(type==='lose') altAdd(ALT_LOSE); }); }catch(e){}
  const wal = () => (typeof WALLET!=='undefined' ? WALLET : {star:0});
  // 资源条上星星图标的位置（和 meta.js drawResBar 同一套算法：星星是最右边那个胶囊，图标在胶囊左端）
  function starIconPos(lay){ const top=(lay.land?12:13)+(lay.top||0), right=lay.land?W-12:W-52; return {x:right-88+3, y:top+13}; }
  function collect(g){
    const A=altLoad(); if(A.buf<=0){ sfx('deny'); toast(`打一局战斗攒星星：胜利 +${ALT_WIN}，失败 +${ALT_LOSE}`); return; }
    const n=A.buf, b=BUILD.find(q=>q.id==='altar'), from={x:SX(g,b.x), y:SY(g,bTop(b)-22)}, to=starIconPos(S.lay);
    const k=Math.min(n, 8); let left=n;
    for(let i=0;i<k;i++){ const amt=i===k-1?left:Math.floor(n/k); left-=amt;
      S.stars.push({fx:from.x+rnd(-14,14), fy:from.y+rnd(-8,8), to, t:-i*0.07, dur:0.62, amt, arc:rnd(40,80), first:i===0}); }
    A.buf=0; altSave(); S.bump.altar=0; COMBO.play('能量-收取', null);
  }
  // ---------- 宠物 ----------
  function owned(){ return roster().filter(e=>e.owned); }
  function makePet(e, i, n, g){
    const v = PET_SPINE[e.key] ? newSpine(PET_SPINE[e.key]) : newMon(PET_MON[e.key],'Idle');
    const span=g.half-30;
    return { key:e.key, e, v, pers:persOf(e.key), x:-span+2*span*(i+0.5)/n+rnd(-10,10), d:rnd(0.45,0.9),
      face:Math.random()<0.5?1:-1, st:'idle', t:rnd(0.5,2.5), anim:null, ts:1, tgt:null, bub:null, hop:0, hopT:0, squash:0, pair:null, eat:null, want:false };
  }
  function ensurePets(g){
    const list=owned();
    if(!S.pets || S.pets.length!==list.length){ S.pets=list.map((e,i)=>makePet(e,i,list.length,g)); S.pairs=[]; for(const p of S.pets) clampPet(p,g); }
  }
  // 播放动画：同名不重播；怪物（火蜥蜴）没有 Busking，开心时用 Idle + 跳一下
  function play(p, anim, loop, ts){
    p.ts=ts||1;
    if(p.v.kind==='spine'){
      if(p.anim===anim && loop) return; p.anim=anim;
      p.v.st.setAnimation(0, anim, loop!==false);
      if(loop===false) p.v.st.addAnimation(0, 'Idle', true, 0);
    } else {
      const a = anim==='Busking' ? 'Idle' : anim; if(p.anim===a && loop) return; p.anim=a;
      p.v.m.play(a, {restart:true, onEnd: loop===false ? ()=>{ p.v.m.play('Idle'); p.anim='Idle'; } : undefined});
      if(anim==='Busking') hop(p, 9);
    }
  }
  function hop(p, h){ p.hop=h; p.hopT=0; }
  const busy = p => p.pair || p.eat || p.st==='eatwait';
  function bubble(p, icon, dur){ p.bub={icon, t:0, dur:dur||1.6}; }
  // 走到某点：返回是否已到。
  // 39～41 版的抽搐（用户 2026-11-13）根因：① 走路目标可能在能站的范围外（追逐、跟着走的目标没收进范围），
  //   每帧往外走一步、又被 clampPet 拉回来；② 两只走向对方或目标被别的宠物占着时，「往目标走一步」和事后的「互相挤开」每帧抵消，
  //   原地踏步、位置来回抖，挤过头时 dx 变号、朝向也跟着翻。
  // 修法：目标先收进范围；路上有别的宠物就在走的方向上绕开（每对只定一次往哪边绕），目标被占就当作到了停下；
  //   挤开只在两只都站着不动时做（见 update 末尾），走路的宠物不再被挤。朝向只看「要去的方向」，不看绕路和挤开。
  const ZR = 2*PA.ry;   // 深度 d 换算成 u
  // 转身：两次转身至少隔 TURN 秒（宠物不会 0.1 秒内左右各转一次）。走路的朝向每帧重新判断（faceTo），
  // 一次性的转身（到了以后面对搭档、看向食物等）如果刚转过身，就记下来，等够了时间再转（update 末尾）。
  const TURN = 0.35;
  function turnTo(p, f){ if(f===p.face){ p._pend=null; return; } if((p._lfT||0)<TURN) p._pend=f; else { p.face=f; p._pend=null; } }
  // 绕建筑：直线去目标会穿过建筑挡住的范围（OBS）时，先走到那块范围的一个角（选「当前位置→角→目标」最短、且走得到的角），
  // 选定后不换（除非直线已经不穿过了），所以不会在两个角之间来回。空地本身是椭圆（凸的），里面两点的直线不会出界，不用绕。
  function segHit(x0, y0, x1, y1, o){   // 线段是否穿过矩形内部（Liang–Barsky）
    let t0=0, t1=1; const dx=x1-x0, dy=y1-y0;
    for(const [pp,qq] of [[-dx, x0-o.x0],[dx, o.x1-x0],[-dy, y0-o.y0],[dy, o.y1-y0]]){
      if(Math.abs(pp)<1e-9){ if(qq<=0) return false; continue; }
      const r=qq/pp; if(pp<0){ if(r>t1) return false; if(r>t0) t0=r; } else { if(r<t0) return false; if(r<t1) t1=r; } }
    return t1-t0>1e-6;
  }
  function route(p, tx, td){
    const m=Math.max(0, petR(p)-30), x0=p.x, y0=wyOfD(p.d), x1=tx, y1=wyOfD(td);
    const ob=OBS.map(o=>({x0:o.x0-m, x1:o.x1+m, y0:o.y0, y1:o.y1})).find(o=>segHit(x0,y0,x1,y1,o));
    if(!ob){ p.wp=null; return; }
    // 最短路：起点、目标、4 个角（往外让 3u）之间连「不穿过这块范围」的线，求起点到目标的最短路，下一站就是路上第一个角。
    // 最短路随位置连续变化，不会这一帧去上面的角、下一帧去下面的角
    const e=3, N=[[x0,y0],[x1,y1],[ob.x0-e,ob.y0-e],[ob.x1+e,ob.y0-e],[ob.x1+e,ob.y1+e],[ob.x0-e,ob.y1+e]];
    const D=N.map(()=>1e9), prev=N.map(()=>-1), used=N.map(()=>false); D[0]=0;
    for(let k=0;k<N.length;k++){ let u=-1; for(let i=0;i<N.length;i++) if(!used[i] && (u<0 || D[i]<D[u])) u=i; if(D[u]>=1e9) break; used[u]=true;
      for(let v=0;v<N.length;v++){ if(used[v] || segHit(N[u][0],N[u][1],N[v][0],N[v][1],ob)) continue; const l=D[u]+Math.hypot(N[v][0]-N[u][0], N[v][1]-N[u][1]); if(l<D[v]){ D[v]=l; prev[v]=u; } } }
    if(prev[1]<0){ p.wp=null; return; }
    let v=1; while(prev[v]!==0) v=prev[v];
    if(v===1){ p.wp=null; return; }
    const vx=N[v][0]-x0, vz=N[v][1]-y0, l=Math.hypot(vx,vz); if(l<0.5){ p.wp=null; return; }
    p.wp={ux:vx/l, uz:vz/l};
  }
  function stepTo(p, tx, td, sp, dt, g, mate){
    const t=okT(g, tx, td, p); tx=t.x; td=t.d;
    const dx=tx-p.x, dz=(td-p.d)*ZR, dist=Math.hypot(dx, dz);
    if(dist<2){ p.x=tx; p.d=td; p.avoid=null; return true; }
    const fx0=dx/dist;   // 朝向用：去最终目标的左右方向
    // 朝向只看「要去的方向」，而且只在目标还远（> 10u）、不是几乎正上正下走时才改：快到了、目标被收进范围后跑到身后几 u 时不翻
    const faceTo = () => { if(dist>10 && Math.abs(fx0)>0.35){ const f=Math.sign(dx); p._pend=null; if(f!==p.face && (p._lfT||0)<TURN) return; p.face=f; } };   // 走路时每帧都会再判断，所以晚一点转也不会丢
    route(p, tx, td);
    // 基本方向：要绕建筑就先朝建筑的角走，否则直接朝目标；下面绕开别的宠物都在这个方向上加偏转
    const bx0 = p.wp ? p.wp.ux : dx/dist, bz0 = p.wp ? p.wp.uz : dz/dist; let ux=bx0, uz=bz0, w=0;
    // 前方挡路的宠物（不算搭档、不算自己）：沿走的方向 0～(间距+8)、横向小于间距
    let blk=null, ba=1e9;
    for(const q of S.pets){ if(q===p || q===mate || (p.pair && q.pair===p.pair)) continue;
      const gap=(petR(p)+petR(q))*0.9, rx=q.x-p.x, rz=(q.d-p.d)*ZR, al=rx*ux+rz*uz, lat=ux*rz-uz*rx;
      if(al>0 && al<gap+8 && Math.abs(lat)<gap && al<ba){ ba=al; blk={q, gap, lat}; } }
    if(blk){
      const q=blk.q, tq=Math.hypot(tx-q.x, (td-q.d)*ZR);
      if(tq<blk.gap || Math.hypot(q.x-p.x,(q.d-p.d)*ZR)>=dist){ p.avoid=null; faceTo(); return true; }   // 目标被占 / 它就站在目标上：到这儿就行
      // 往哪边绕：一旦定下就保持，直到前面 0.4 秒都没有挡路的（前面同时有两只时不会每帧换着绕、走成锯齿）；
      // 挡路的不在正前方就往远离它的一边，正对着就往自己的右手边（两只对走会错开）
      if(!p.avoid) p.avoid={q, side: Math.abs(blk.lat)>6 ? -Math.sign(blk.lat) : 1, free:0}; else { p.avoid.q=q; p.avoid.free=0; }
      w=1.6*(1-ba/(blk.gap+8))+0.4;
    } else if(p.avoid && (p.avoid.free+=dt)>0.4) p.avoid=null;
    const s=Math.min(dist, sp*dt);
    const dirOf = side => { if(!w) return [bx0,bz0]; const nx=bx0+(-bz0)*side*w, nz=bz0+bx0*side*w, nl=Math.hypot(nx,nz); return [nx/nl, nz/nl]; };
    [ux,uz]=dirOf(p.avoid?p.avoid.side:0);
    // 这一步被范围（墙、建筑）挡掉、在基本方向上前进不到 40%（绕别的宠物绕到了墙边）：停在这儿当作到了，
    // 不贴着墙原地踏步、被推来推去
    const c=okT(g, p.x+ux*s, p.d+uz*s/ZR, p);
    if((c.x-p.x)*bx0+(c.d-p.d)*ZR*bz0 < s*0.4){ faceTo(); return true; }
    p.x=c.x; p.d=c.d; p._mv=true;
    faceTo();   // 朝向 = 要去的方向
    return false;
  }
  // 能站的范围：空地里的椭圆（PA），再避开建筑后面会被挡住的那一块（OBS）
  function okX(g, x){ return Math.max(-PA.rx, Math.min(PA.rx, x)); }
  // 建筑挡住的范围按宠物的半宽加宽（OBS 默认按约 30u 半宽算；火蜥蜴、熊更宽）
  function inObs(x, wy, m){ return OBS.find(o=>x>o.x0-m && x<o.x1+m && wy>o.y0 && wy<o.y1); }
  function okW(x, wy, p){ const m=p ? Math.max(0, petR(p)-30) : 0;
    for(let it=0; it<3; it++){
      const nx=(x-PA.cx)/PA.rx, ny=(wy-PA.cy)/PA.ry, r=Math.hypot(nx,ny); if(r>1){ x=PA.cx+nx/r*PA.rx; wy=PA.cy+ny/r*PA.ry; }
      const o0=inObs(x, wy, m); if(!o0) break; const o={x0:o0.x0-m, x1:o0.x1+m, y0:o0.y0, y1:o0.y1};
      // 推到最近的一条边外面
      const ds=[[x-o.x0,'l'],[o.x1-x,'r'],[wy-o.y0,'t'],[o.y1-wy,'b']].sort((a,b)=>a[0]-b[0])[0][1];
      if(ds==='l') x=o.x0-0.5; else if(ds==='r') x=o.x1+0.5; else if(ds==='t') wy=o.y0-0.5; else wy=o.y1+0.5;
    }
    return {x, wy};
  }
  function okT(g, x, d, p){ const r=okW(x, wyOfD(clamp01(d)), p); return {x:r.x, d:dOfWy(r.wy)}; }   // 所有走路目标都过这一道
  function clampPet(p, g){ const t=okT(g, p.x, p.d, p); p.x=t.x; p.d=t.d; }

  // ---------- 单独行为 ----------
  function nextSolo(p, g){
    const w={...p.pers.solo};
    if(S.pets.filter(q=>q!==p && !busy(q)).length===0) w.social=0;
    const k=pick(w);
    if(k==='social' && startSocial(p, g)) return;
    if(k==='wander' || k==='social'){
      p.st='walk'; p.t=9; p.tgt=okT(g, p.x+rnd(-160,160), p.d+rnd(-0.35,0.35), p);
      play(p,'Walk',true, p.pers.speed/26);
    } else if(k==='idle'){ p.st='idle'; p.t=rnd(1.8,4); play(p,'Idle',true); }
    else if(k==='rest'){
      // 找个地方歇着：大树树荫下，或者凑到别的正在休息的宠物旁边
      const mates=S.pets.filter(q=>q!==p && q.st==='rest');
      let spot;
      if(mates.length && Math.random()<0.6){ const m=mates[Math.floor(Math.random()*mates.length)]; spot={x:m.x+(Math.random()<0.5?-1:1)*rnd(34,48), d:clamp01(m.d+rnd(-0.08,0.08))}; }
      else { const wy=wyOfD(p.d), t=REST.slice().sort((a,b)=>Math.hypot(a.x-p.x,a.y-wy)-Math.hypot(b.x-p.x,b.y-wy))[Math.random()<0.7?0:1]; /* 去附近的树荫下、建筑旁边 */ spot={x:t.x+rnd(-20,20), d:dOfWy(t.y+rnd(-14,14))}; }
      p.st='torest'; p.t=12; p.tgt=okT(g, spot.x, spot.d, p); play(p,'Walk',true, p.pers.speed/30);
    } else { p.st='happy'; p.t=rnd(1.8,2.6); play(p,'Busking',true); bubble(p,'music',1.6); }
  }

  // ---------- 成对行为：打闹 / 追逐 / 打招呼 / 一起跳舞 / 跟着走 ----------
  function startSocial(a, g){
    const cands=S.pets.filter(q=>q!==a && !busy(q) && (q.st!=='rest' || Math.random()<0.4));
    if(!cands.length) return false;
    // 越近越容易凑到一起
    const b=cands.sort((p,q)=>Math.abs(p.x-a.x)-Math.abs(q.x-a.x))[Math.random()<0.7?0:Math.floor(Math.random()*cands.length)];
    const w={}; for(const k in a.pers.soc) w[k]=a.pers.soc[k]*(b.pers.soc[k]||0.5);
    const kind=pick(w);
    const P={kind, a, b, ph:'meet', t:0, n:0};
    a.pair=b.pair=P; S.pairs.push(P); a.st=b.st='pair';   // 原来在休息的被拉去玩：不再是趴着的姿势
    if(kind==='chase'){ P.ph='chase'; P.dur=rnd(2.6,3.8); play(a,'Walk',true,1.7); play(b,'Walk',true,1.6); bubble(b,'warn',1.0); }
    else if(kind==='follow'){ P.ph='lead'; P.legs=Math.floor(rnd(2,4)); legTarget(P, g); }
    else { const mx=(a.x+b.x)/2, md=clamp01((a.d+b.d)/2); const gap=({dance:42, greet:32, fight:30}[kind]||30)*(petR(a)+petR(b))/60;   /* 按两只的实际宽度放大缩小 */ /* 中心距 = 2×gap：宠物约 60u 宽，跳舞并排不重叠，打闹刚好碰到 */
      const mc=okX(g, mx), m2=Math.max(-g.half+EDGE+gap, Math.min(g.half-EDGE-gap, mc)); P.ma=okT(g, m2-gap, md, a); P.mb=okT(g, m2+gap, md, b); if(a.x>b.x){ const t=P.ma; P.ma=P.mb; P.mb=t; }
      play(a,'Walk',true,a.pers.speed/26); play(b,'Walk',true,b.pers.speed/26); }
    return true;
  }
  function legTarget(P, g){ const a=P.a; P.tg=okT(g, a.x+rnd(-150,150), a.d+rnd(-0.3,0.3), a); play(a,'Walk',true,a.pers.speed/26); play(P.b,'Walk',true,P.b.pers.speed/24); }
  function endPair(P, how){
    if(P.ended) return; P.ended=true;   // 同一帧可能满足两个结束条件：只结束一次
    const g=S.G;
    const {a,b}=P; a.pair=b.pair=null; S.pairs=S.pairs.filter(q=>q!==P);
    for(const p of [a,b]) if(!p.eat){ p.st='idle'; p.t=rnd(0.6,1.6); play(p,'Idle',true); }
    if(how==='happy'){ for(const p of [a,b]) if(!p.eat){ p.st='happy'; p.t=rnd(1.4,2.2); play(p,'Busking',true); bubble(p,'music',1.4); } }
    if(how==='sulk'){ const p=Math.random()<0.5?a:b, o=p===a?b:a; if(!o.eat){ o.st='happy'; o.t=1.8; play(o,'Busking',true); bubble(o,'music',1.4); }
      if(!p.eat){ p.st='walk'; p.t=9; p.tgt=okT(g, p.x+(p.x<o.x?-1:1)*rnd(90,140), p.d+rnd(-0.2,0.2), p); play(p,'Walk',true,0.7); p.slow=true; } }
  }
  function updPair(P, dt, g){
    const {a,b}=P; P.t+=dt;
    if(P.kind==='chase'){
      // b 往远离 a 的方向跑，a 追；追上了就换人追（一次）或者一起开心
      // 逃跑方向在开始（或换人）时定一次，不每帧按左右重算（以前追的一方一越过，逃的一方就掉头，来回抖）；
      // 逃到空地边、建筑边跑不动了（0.25 秒几乎没动）= 被追上
      if(!P.dir){ const vx=b.x-a.x, vz=(b.d-a.d)*ZR, l=Math.hypot(vx,vz)||1; P.dir={x:vx/l, z:vz/l}; P.corner=0; }
      const x0=b.x, d0=b.d, spb=b.pers.speed*1.35+8;
      // 逃跑目标被空地边、建筑收回来以后如果已经不在「远离」的方向上（只能往回或横着走），就算跑不动了，不往追的那只身上跑
      const ft=okT(g, b.x+P.dir.x*60, b.d+P.dir.z*60/ZR, b), fvx=ft.x-b.x, fvz=(ft.d-b.d)*ZR, fl=Math.hypot(fvx,fvz);
      const bs = (fl<6 || fvx*P.dir.x+fvz*P.dir.z < fl*0.5) ? true : stepTo(b, ft.x, ft.d, spb, dt, g, a); play(b, bs?'Idle':'Walk', true, bs?1:1.6);   // 走不动就站着，不原地踏步
      if(Math.hypot(b.x-x0,(b.d-d0)*ZR) < spb*dt*0.3) P.corner+=dt; else P.corner=0;
      // 追的一方追到「贴着」的距离就停（不追到对方身上：以前目标就是对方的位置，追上后在它身上来回打转）
      const cd=(petR(a)+petR(b))*0.8, vx=b.x-a.x, vz=(b.d-a.d)*ZR, vl=Math.hypot(vx,vz)||1;
      const as = vl<=cd+1 ? true : stepTo(a, b.x-vx/vl*cd, b.d-vz/vl*cd/ZR, a.pers.speed*1.5+10, dt, g, b); play(a, as?'Idle':'Walk', true, as?1:1.7);
      const near=Math.hypot(a.x-b.x, (a.d-b.d)*ZR)<cd+3 || P.corner>0.25;
      P.t2=(P.t2||0)+dt;
      if(near && P.t2>0.8){ if(!P.swapped && Math.random()<0.5){ P.swapped=true; P.a=b; P.b=a; P.t2=0; P.dir=null; bubble(P.b,'warn',0.9); hop(P.b,7); } else { endPair(P,'happy'); return; } }
      else if(P.t2>P.dur || P.t>8){ endPair(P,'happy'); return; }
      return;
    }
    if(P.kind==='follow'){
      // 带路的照常绕开别的宠物（也绕开跟着的那只，不从它身上穿过去）。
      // 跟着的：以前目标是「带路的身后 40u」，带路的一转身目标就跳到另一边，跟着的来回跑 → 改成「牵绳」：
      // 离得比绳长 1.3 倍还远才走，走到带路的旁边（自己这一侧、绳长处）就停，面朝带路的；目标不会跳边。
      const done=stepTo(a, P.tg.x, P.tg.d, a.pers.speed, dt, g);
      const L=(petR(a)+petR(b))*1.05, vx=b.x-a.x, vz=(b.d-a.d)*ZR, dl=Math.hypot(vx,vz)||1;
      if(dl>L*1.3) P.bgo=true;
      if(P.bgo){ const arrived=stepTo(b, a.x+vx/dl*L, a.d+vz/dl*L/ZR, Math.max(b.pers.speed, a.pers.speed)*1.05, dt, g);
        if(arrived){ P.bgo=false; } }
      if(P.bgo) play(b,'Walk',true,b.pers.speed/24); else { play(b,'Idle',true); if(Math.abs(vx)>16) turnTo(b, -Math.sign(vx)); }
      if(done || P.t>16){ if(--P.legs<=0 || P.t>16) endPair(P, Math.random()<0.5?'happy':null); else legTarget(P, g); }
      return;
    }
    if(P.ph==='meet'){
      const da=stepTo(a, P.ma.x, P.ma.d, a.pers.speed, dt, g, b), db=stepTo(b, P.mb.x, P.mb.d, b.pers.speed, dt, g, a);
      if(da) play(a,'Idle',true); if(db) play(b,'Idle',true);
      if((da&&db) || P.t>7){ P.ph='go'; P.t=0; turnTo(a, Math.sign(b.x-a.x)||a.face); turnTo(b, Math.sign(a.x-b.x)||b.face);
        if(P.kind==='fight'){ bubble(a,'fight',1.0); bubble(b,'fight',1.0); P.n=Math.floor(rnd(2,5)); P.next=0.6; P.turn=0; }
        else if(P.kind==='greet'){ bubble(a,'like',1.5); bubble(b,'like',1.5); play(a,'Busking',true); play(b,'Busking',true); }
        else if(P.kind==='dance'){ turnTo(b, a.face);   /* 并排一起朝同一边跳：跟带头的 a 朝向一致 */ play(a,'Busking',true); play(b,'Busking',true); bubble(a,'music',2); bubble(b,'music',2); P.joined=[]; } }
      return;
    }
    // go
    if(P.kind==='fight'){
      if(P.t>=P.next && P.n>0){
        const at=P.turn%2?b:a, df=at===a?b:a; P.turn++; P.n--; P.next=P.t+rnd(0.7,0.95);
        play(at,'Attack',false); const wu=(DATA.pets[at.key]&&DATA.pets[at.key].windup)||0.2;   // 出手时刻 = 战斗里量好的 Attack 接触帧
        P.hit={t:P.t+wu, at, df};
      }
      if(P.hit && P.t>=P.hit.t){ const {at,df}=P.hit; P.hit=null; const mx=(at.x+df.x)/2, my=yOf(g,(at.d+df.d)/2), k=kOf(df.d);
        COMBO.play('营地-打闹', {x:g.cx+mx*g.u, y:my-28*g.u*k}, {scale:64*g.u*k/L.cs});
        hop(df,5); df.x+= (df.x-at.x>0?1:-1)*4; if(df.v.kind==='mon') { df.v.m.play('Hit',{restart:true, onEnd:()=>df.v.m.play('Idle')}); df.anim='Hit'; } }
      if(P.n<=0 && !P.hit && P.t>P.next+0.2) endPair(P, Math.random()<0.6?'happy':'sulk');
    } else if(P.kind==='greet'){ if(P.t>1.6) endPair(P,null); }
    else if(P.kind==='dance'){
      // 一起跳舞时，附近闲着的宠物可能跟着跳（喜欢跳舞的更容易）
      if(!P.joinTried && P.t>0.6){ P.joinTried=true;
        for(const q of S.pets) if(q!==a && q!==b && !busy(q) && Math.abs(q.x-a.x)<160 && Math.random()<0.15*q.pers.soc.dance){
          q.st='happy'; q.t=P.t+rnd(1.6,2.6); play(q,'Busking',true); bubble(q,'music',1.6); } }
      if(P.t>3.2) endPair(P,null);
    }
  }

  // ---------- 每帧 ----------
  const SLOTS = [{x:-46, d:0.02}, {x:46, d:0.02}, {x:-104, d:-0.1}, {x:104, d:-0.1}];
  function assignSlots(g){   // 拿起食物时：离得最近的 4 只分到站位
    const fx=(S.drag.x-g.cx)/g.u, free=[...SLOTS];
    const c=S.pets.filter(p=>!p.eat && Math.abs(p.x-fx)<170).sort((a,b)=>Math.abs(a.x-fx)-Math.abs(b.x-fx)).slice(0,4);
    for(const p of S.pets) p.slot=null;
    for(const p of c){ const side=Math.sign(p.x-fx)||1; let i=free.findIndex(s=>Math.sign(s.x)===side); if(i<0) i=0; p.slot=free.splice(i,1)[0]; }
  }
  function update(dt, g){
    if(S.drag && S.drag.on && !S.drag.slotted){ S.drag.slotted=true; assignSlots(g); }
    for(const p of S.pets) p._mv=false;   // 这一帧有没有走路（stepTo 里置 true）
    for(const P of S.pairs.slice()) updPair(P, dt, g);
    for(const p of S.pets){
      p.hopT+=dt; if(p.bub){ p.bub.t+=dt; if(p.bub.t>p.bub.dur) p.bub=null; }
      if(p.eat){ updEat(p, dt, g); continue; }
      // 有人拿着食物：附近的宠物丢下手里的事（打闹、跳舞也停下），看过去、凑过来（正在睡的一半会被叫醒）
      if(S.drag && S.drag.on && p.pair && Math.abs((S.drag.x-g.cx)/g.u-p.x)<170) endPair(p.pair, null);
      if(p.pair) { clampPet(p,g); continue; }
      if(S.drag && S.drag.on){ const fx=(S.drag.x-g.cx)/g.u, fd=dOf(g, S.drag.y+40*g.u);
        const near=Math.abs(fx-p.x)<170;
        if(near && p.st==='rest' && p.wake==null) p.wake=Math.random()<0.5;
        if(near && (p.st!=='rest' || p.wake)){
          if(!p.want){ p.want=true; bubble(p,'warn',1.2); }
          turnTo(p, Math.sign(fx-p.x)||p.face);
          // 最多 4 只凑到食物旁边的固定站位（左右各两个、前后错开、间距 ≥ 60u），其余的原地转头看
          const sl=p.slot;
          if(sl){ const t=okT(g, fx+sl.x, fd+sl.d, p); if(!stepTo(p, t.x, t.d, p.pers.speed*1.1, dt, g)) play(p,'Walk',true,p.pers.speed/24); else { play(p,'Idle',true); turnTo(p, Math.sign(fx-p.x)||p.face); } }
          else play(p,'Idle',true);
          clampPet(p,g); continue; }
      } else if(p.want){ p.want=false; p.st='idle'; p.t=rnd(0.4,1.2); play(p,'Idle',true); }
      p.t-=dt;
      // 走路有超时（目标万一到不了，最多走 9～12 秒就停下）
      if(p.st==='walk'){ if(stepTo(p, p.tgt.x, p.tgt.d, p.pers.speed*(p.slow?0.6:1), dt, g) || p.t<=0){ p.slow=false; p.st='idle'; p.t=rnd(0.8,2.2); play(p,'Idle',true); } }
      else if(p.st==='torest'){ if(stepTo(p, p.tgt.x, p.tgt.d, p.pers.speed, dt, g) || p.t<=0){ p.st='rest'; p.t=rnd(7,12); play(p,'Idle',true,0.4); } }
      else if(p.t<=0) nextSolo(p, g);
      else if(p.st==='idle' && p.t<1.2 && p.t>0.6 && !p.flipped && p._lfT>1){   // 发呆时偶尔转身：离下一个动作至少 0.6 秒，不会刚转身又马上转回去
        p.flipped=true; if(Math.random()<0.4) p.face*=-1; }
      if(p.st!=='idle') p.flipped=false;
      clampPet(p,g);
    }
    // 站着不动的宠物互相轻轻挤开（中心距小于两只半宽之和的 0.85 就推开），不叠成一团。
    // 只挤这一帧没走路的：走路的靠 stepTo 绕开，不然「走一步、挤回去」每帧抵消就是抽搐（39～41 版的问题）。
    // 同一对（打闹、跳舞）之间不挤；一只在对子里、一只不在，只挪不在对子里的那只。
    const still = p => !p._mv && !p.eat && p.st!=='eatwait';
    for(let i=0;i<S.pets.length;i++) for(let j=i+1;j<S.pets.length;j++){ const p=S.pets[i], q=S.pets[j];
      if(!still(p) || !still(q) || (p.pair && p.pair===q.pair) || (p.pair && q.pair)) continue;
      const gap=(petR(p)+petR(q))*0.85, dx=q.x-p.x, dz=(q.d-p.d)*ZR, dist=Math.hypot(dx,dz); if(dist>=gap) continue;
      const nx = dist>0.01 ? dx/dist : (i%2?1:-1), nz = dist>0.01 ? dz/dist : 0, mv=Math.min(gap-dist, 40*dt);
      const wp = p.pair ? 0 : q.pair ? 1 : 0.5, wq = 1-wp;
      p.x-=nx*mv*wp; p.d=clamp01(p.d-nz*mv*wp/ZR); q.x+=nx*mv*wq; q.d=clamp01(q.d+nz*mv*wq/ZR); }
    for(const p of S.pets) if(!p.pair) clampPet(p,g);   // 挤开之后再收回能站的范围
    for(const p of S.pets){   // 记录上次转身到现在多久；等着的转身到时间就转
      if(p.face!==p._lf){ p._lf=p.face; p._lfT=0; } else p._lfT=(p._lfT||0)+dt;
      if(p._pend!=null && p._lfT>=TURN){ if(p._pend!==p.face){ p.face=p._pend; p._lf=p.face; p._lfT=0; } p._pend=null; } }
  }

  // ---------- 投喂 ----------
  function feed(p, g){
    if(p.pair){ const P=p.pair; endPair(P,null); }
    p.st='eatwait'; p.want=false; p.bub=null;
    const fx=(S.drag.x-g.cx)/g.u; p.face=Math.sign(fx-p.x)||p.face; p._pend=null;   // 喂食：马上转向食物
    const k=kOf(p.d), h=petVis(p), mouth={x:g.cx+(p.x+p.face*h*0.22)*g.u, y:yOf(g,p.d)-h*0.55*g.u};
    S.fly={from:{x:S.drag.x, y:S.drag.y}, to:mouth, t:0, dur:0.16, back:false};
    p.eat={t:-0.16, k};
    play(p,'Idle',true);
    foodUse();
    for(const q of S.pets){ q.wake=null; q.slot=null; if(q!==p && q.want){ q.want=false; if(Math.random()<0.35){ q.st='happy'; q.t=1.4; play(q,'Busking',true); } } }
  }
  function updEat(p, dt, g){
    const E=p.eat, wu=(DATA.pets[p.key]&&DATA.pets[p.key].windup)||0.2; E.t+=dt;
    if(E.t>=0 && !E.bit){ E.bit=true; play(p,'Attack',false); }
    if(E.bit && !E.chomp && E.t>=wu){ E.chomp=true; S.fly=null;
      COMBO.play('投喂-吃', null); hop(p,4); }
    if(E.chomp && !E.love && E.t>=wu+0.35){ E.love=true; const k=kOf(p.d), h=petVis(p), x=g.cx+p.x*g.u, y=yOf(g,p.d)-h*g.u*0.95;
      COMBO.play('投喂-爱心', {x, y}, {scale:64*g.u*k/L.cs});
      for(let i=0;i<4;i++) S.hearts.push({x:x+rnd(-10,10)*g.u*k, y:y+rnd(-4,6)*g.u, t:-i*0.12, life:1.2, s:rnd(22,28)*g.u*k, sw:rnd(-1,1), ph:rnd(0,6)});
      play(p,'Busking',true); emit('campFeed', {key:p.key}); }
    if(E.love && E.t>=wu+2.2){ p.eat=null; p.st='idle'; p.t=rnd(0.6,1.4); play(p,'Idle',true); }
  }

  // ---------- 绘制 ----------
  // 地面：铺满整张地图的草地（离屏画布、整像素对齐，防竖线）；树林那一圈地面压暗，空地显得亮、树林显得深
  const GROUND = (()=>{ try{ const m=/[?&]cg=(\w+)/.exec(location.search); if(m) return m[1]; }catch(e){} return 'floor'; })();
  function drawGround(g, t){
    // 58 版：地面不会动，只在镜头位置 / 大小 / 图片加载变了时重画（以前每帧整屏重画再上传）
    const r=g.c, u=g.u, s=bgBegin('bg', r, ['camp', GROUND, r.x, r.y, r.w, r.h, g.ox, g.oy, u, IMG_STAMP, S.map&&S.map.id, S.map&&S.map.tufts.length, S.map&&S.map.flat.length].join(','));
    const snapY = y => (Math.round(y*BGV.S+BGV.oy)-BGV.oy)/BGV.S;
    if(!s.skip) try{
      if(GROUND==='field'){
        const im=envImg('Field_Forest'); ctx.fillStyle='#618650'; ctx.fillRect(r.x, r.y, r.w, r.h);
        if(ok(im)){ const w=snapW(96*u); let x0=snapX(g.ox-4000*u); x0-=Math.ceil((x0-r.x)/w)*w; let y0=snapY(g.oy-4000*u); y0-=Math.ceil((y0-r.y)/w)*w;
          for(let y=y0;y<r.y+r.h;y+=w) for(let x=x0;x<r.x+r.w;x+=w) ctx.drawImage(im, x, y, w, w); }
      } else {
        // 和以前营地同一张草坪（assets/bg/floor.png，可上下左右平铺），每一行横向错开 0.37 个宽度，不对齐成格子
        const fl=bgi('floor'); ctx.fillStyle='#c8832f'; ctx.fillRect(r.x, r.y, r.w, r.h);
        if(ok(fl)){ const sc=u/3.2, w=snapW(fl.naturalWidth*sc), th=fl.naturalHeight*sc, y0=g.oy-(WORLD.hh+600)*u;
          let i=Math.floor((r.y-y0)/th);
          for(;;i++){ const y=snapY(y0+i*th), y2=snapY(y0+(i+1)*th); if(y>=r.y+r.h) break; const off=(((i*0.37)%1)+1)%1*w;
            let xx=snapX(g.ox-3000*u+off); xx-=Math.ceil((xx-r.x)/w)*w; for(let x=xx;x<r.x+r.w;x+=w) ctx.drawImage(fl, x, y, w, y2-y); } }
      }
      // 树林下面的地面压暗（空地中心最亮）
      ctx.save(); ctx.translate(SX(g,CLR.cx), SY(g,CLR.cy)); ctx.scale(1, CLR.ry/CLR.rx);
      const R0=CLR.rx*u, gr=ctx.createRadialGradient(0,0,R0*0.55,0,0,R0*1.45);
      const dk = GROUND==='field' ? '18,42,24' : '58,32,16';
      gr.addColorStop(0,`rgba(${dk},0)`); gr.addColorStop(0.45,`rgba(${dk},.06)`); gr.addColorStop(0.62,`rgba(${dk},.30)`); gr.addColorStop(1,`rgba(${dk},.52)`);
      ctx.fillStyle=gr; ctx.fillRect(-6000*u, -6000*u, 12000*u, 12000*u); ctx.restore();
      // 空地上的小草小花、碎石、小蘑菇：贴在地上，画在宠物下面（38 版规则：flat 的东西不参与前后排序）
      for(const q of S.map.tufts) drawFlat(q, g);
      for(const q of S.map.flat) drawFlat(q, g);
    } finally { bgEnd(s); }
    else bgEnd(s);   // 沿用上次的地面
  }
  function drawFlat(q, g){ const im=envImg(q.n); if(!ok(im)) return; const u=g.u, h=q.h*u, w=q.w*u, x=SX(g,q.x), y=SY(g,q.y);
    if(x+w<g.c.x || x-w>g.c.x+g.c.w || y<g.c.y-10 || y-h>g.c.y+g.c.h) return; drawImg(im, x-w/2, y-h*(q.foot||1), w, h, q.flip); }
  // 树、灌木：脚对齐世界坐标，以脚为轴轻摆；原图自带地上的影子
  function drawTree(q, g, t){ const im=envImg(q.n); if(!ok(im)) return; const u=g.u, h=q.h*u, w=q.w*u, x=SX(g,q.x), y=SY(g,q.y);
    ctx.save(); ctx.translate(x, y);
    const sw=q.bush?0.012:0.006; const k=Math.sin(t*1.1+q.ph)*sw+Math.sin(t*2.3+q.ph*1.7)*sw*0.35; ctx.transform(1,0,k,1,0,0);
    if(q.flip) ctx.scale(-1,1); ctx.drawImage(im, -w/2, -h*q.foot, w, h); ctx.restore(); }
  const visible = (g, x, y, w, h, foot) => { const sx=SX(g,x), sy=SY(g,y), W2=w*g.u/2, top=sy-h*g.u*foot, bot=top+h*g.u;
    return sx+W2>g.c.x && sx-W2<g.c.x+g.c.w && bot>g.c.y && top<g.c.y+g.c.h; };
  function storageFrame(){ const n=Math.max(0, wal().star||0); return n<=0 ? 0 : n<STORE_CAP/3 ? 1 : n<STORE_CAP*2/3 ? 2 : 3; }
  function bumpK(id){ const b=S.bump[id]; if(b==null) return 1; return 1+0.08*Math.sin(Math.min(1,b/0.35)*Math.PI)*(1-Math.min(1,b/0.35)); }
  function drawBuilding(b, g, t){
    const u=g.u, x=SX(g,b.x), y=SY(g,b.y), w=b.w*u, h=b.h*u, sq=bumpK(b.id);
    const n = b.id==='storage' ? 'Star_Storage_02_0'+storageFrame() : b.n, im=camImg(n); if(!ok(im)) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(1/sq*(sq>1?1.02:1), sq);   // 点一下：轻轻弹一下
    ctx.drawImage(im, -w/2, -h*b.footK, w, h);
    if(b.id==='altar'){   // 漂浮的水晶：原图里在 (54, 0)，整张 218×236，底座从第 52 行开始
      const st=camImg('Star_Altar_01_Star'); if(ok(st)){ const s=w/218, bob=Math.sin(t*2.2)*3*u, top=-h*b.footK-52*s;
        ctx.drawImage(st, -w/2+54*s, top+bob-4*u, 100*s, 127*s); } }
    ctx.restore();
    b._scr={x, y, w, h:h*b.footK+(b.id==='altar'?w/218*52:0)};
  }
  // 气泡底框（Fantasy Hero BubbleFrame_01 的层次，和宠物的心情气泡同一套），宽 w 高 h，小尖角在下方正中
  function bubbleFrame(cx, by, w, h){
    const x=cx-w/2, y=by-h, k=h/72, bg=MT_UI.box, sh='#cdbfb3';
    btnShadow(x, y, w, h, h*0.3);
    mtNine4(heroT('BubbleFrame_01_Bg', bg), x, y, w, h, [26,26,26,25], k);
    mtNine4(heroT('BubbleFrame_01_BgShadow', sh), x+(w-(w-3.23*k))/2, y+h-11.3*k-6.5*k, w-3.23*k, 13*k, [23,0,23,0], k);
    drawImg(heroT('BubbleFrame_01_ArrowBg', bg), cx+4.3*k-15.5*k, y+h+8.29*k-18.5*k, 31*k, 37*k);
    drawImg(heroT('BubbleFrame_01_ArrowShadow', sh), cx+4.3*k-15.5*k, y+h+6.15*k-15*k, 31*k, 30*k);
    return {x, y, w, h};
  }
  // 祭坛上方：攒到的星星（图标 + 数量），一上一下轻轻浮动
  function drawAltarBubble(g, t){
    const A=altLoad(), b=BUILD.find(q=>q.id==='altar'); if(!b._scr) return; b._bub=null; if(A.buf<=0) return;
    const sz=Math.max(30, 34*g.u), bob=Math.sin(t*3)*2.5, cx=b._scr.x, by=b._scr.y-b._scr.h-14*g.u+bob;
    ctx.save(); const r=bubbleFrame(cx, by, sz*1.62, sz);
    drawImgC(icon('Star_Altar_05_Star'), r.x+r.w*0.3, r.y+r.h*0.47, sz*0.74);
    text(String(A.buf), r.x+r.w*0.68, r.y+r.h*0.5, sz*0.46, A.buf>=ALT_MAX?'#d0613a':'#5b4a40', 'center', 800);
    ctx.restore(); b._bub=r;
  }
  function drawStars(dt){
    for(const s of S.stars){ s.t+=dt; if(s.t<0) continue; const k=Math.min(1, s.t/s.dur), e=ease.inQuad(k)*0.6+ease.outCubic(k)*0.4;
      const x=s.fx+(s.to.x-s.fx)*e, y=s.fy+(s.to.y-s.fy)*e-Math.sin(k*Math.PI)*s.arc, sz=30-10*k;
      drawImgC(icon('Star_Altar_05_Star'), x, y, sz*(k<0.15?ease.outBack(k/0.15):1));
      if(k>=1 && !s.done){ s.done=true; starBank(s); } }
    S.stars=S.stars.filter(s=>!s.done);
  }
  function starBank(s){ const w=wal(); w.star=(w.star||0)+s.amt; try{ walletSave(); }catch(e){} if(s.first) sfx('star'); }
  const BUB_ICON = {music:'PictoIcon_Music', like:'PictoIcon_Like', fight:'PictoIcon_Attack', warn:'PictoIcon_Warning'};
  // 气泡：照 Fantasy Hero BubbleFrame_01.prefab 的层次（Bg 九宫格 → 底部 BgShadow → 下方小尖角 ArrowBg → ArrowShadow），颜色换成启程配色
  function drawBubble(cx, by, size, icon, a){
    const w=size*1.16, h=size, x=cx-w/2, y=by-h, k=size/72, bg=MT_UI.box, sh='#cdbfb3';
    ctx.save(); ctx.globalAlpha*=a;
    btnShadow(x, y, w, h, h*0.3);
    mtNine4(heroT('BubbleFrame_01_Bg', bg), x, y, w, h, [26,26,26,25], k);
    mtNine4(heroT('BubbleFrame_01_BgShadow', sh), x+ (w-(w-3.23*k))/2, y+h-11.3*k-6.5*k, w-3.23*k, 13*k, [23,0,23,0], k);
    drawImg(heroT('BubbleFrame_01_ArrowBg', bg), cx+4.3*k-15.5*k, y+h+8.29*k-18.5*k, 31*k, 37*k);
    drawImg(heroT('BubbleFrame_01_ArrowShadow', sh), cx+4.3*k-15.5*k, y+h+6.15*k-15*k, 31*k, 30*k);
    drawImgC(heroT(BUB_ICON[icon], '#6b5f5d'), cx, y+h*0.46, h*0.58);
    ctx.restore();
  }
  function drawPet(p, g, dt){
    const k=kOf(p.d), h=petH(p)*g.u, hv=petVis(p)*g.u, fx=g.cx+p.x*g.u, fy=yOf(g,p.d);
    const v=p.v; let ts=p.ts;
    if(v.kind==='spine'){ v.st.update(dt*ts); v.st.apply(v.sk); } else v.m.update(dt*ts);
    const dm = v.kind==='spine' ? {h:v.sd.h, w:v.sd.w} : MONB[v.name];
    const s=h/dm.h, faceR = p.face>0, flip = v.kind==='mon' ? faceR : !faceR;
    const hopY = p.hop ? Math.max(0, Math.sin(Math.min(1,p.hopT/0.38)*Math.PI))*p.hop*g.u*k : 0;
    if(p.hop && p.hopT>0.38) p.hop=0;
    groundShadow(fx, fy, Math.max(petR(p)*2.1, petVis(p)*0.7)*g.u*(1-hopY/(60*g.u)), 0.85);
    const rest = p.st==='rest' && !p.want ? 1 : 0; p.squash += (rest-p.squash)*Math.min(1,dt*3);
    const sy=1-0.05*p.squash+0.012*p.squash*Math.sin(performance.now()/900), sx=1+0.03*p.squash;   // 休息：身体放低一点、慢慢呼吸
    ctx.save(); ctx.translate(fx, fy-hopY); ctx.scale(sx, sy);
    drawLive(v, s, flip, {hpx:h, cs:110*g.u}, 0, 0); ctx.restore();   // 描边粗细按同一个格子大小算：大宠物不会线更粗
    p._scr={x:fx, y:fy, h:hv, k};
  }
  function drawFoodBox(g){
    const b=g.box, F=foodLoad(), cx=b.x+b.w/2, cy=b.y+b.h/2, d=b.w;
    btnShadow(b.x+4, b.y+4, b.w-8, b.h-8, b.w/2);
    drawImgC(heroT('BaseFrame_Basic_Circle_H98', '#4f4548'), cx, cy, d);
    drawImgC(heroT('BaseFrame_Basic_Circle_H98', '#5d5255'), cx, cy, d*0.86);
    // 补充进度：一圈金色细环（满 10 个时不显示）
    if(F.n<FOOD_MAX){ const fr=clamp01((Date.now()-F.t)/FOOD_MS); ctx.save(); ctx.strokeStyle='rgba(255,255,255,.14)'; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(cx,cy,d*0.455,0,7); ctx.stroke();
      ctx.strokeStyle='#e8be6e'; ctx.lineCap='round'; ctx.beginPath(); ctx.arc(cx,cy,d*0.455,-Math.PI/2,-Math.PI/2+fr*Math.PI*2); ctx.stroke(); ctx.restore(); }
    const lift = S.drag&&S.drag.on ? 0.5 : 1;
    drawImgC(hero('ItemIcon_Meat'), cx, cy-d*0.04, d*0.66, F.n>0?lift:0.3);
    // 数量（右下角小圆标）
    const bx=b.x+b.w-d*0.12, by=b.y+b.h-d*0.14, bd=d*0.38;
    drawImgC(heroT('BaseFrame_Basic_Circle_H58', F.n>0?'#c47e3a':'#8d8485'), bx, by, bd);
    text(String(F.n), bx, by+0.5, bd*0.52, '#fff', 'center', 800, '#4f2f1a');
    if(F.n<FOOD_MAX){ const left=FOOD_MS-((Date.now()-F.t)%FOOD_MS), m=Math.floor(left/60000), s=Math.floor(left/1000)%60;
      text(`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`, cx, b.y-9, 12, '#fff', 'center', 800, '#3a2f2c'); }
  }

  function draw(lay){
    const now=performance.now(), gap=(now-(S.last||now))/1000, dt=Math.min(0.05, gap); S.last=now; S.lay=lay;
    if(gap>0.3){ for(const s of S.stars) if(!s.done){ s.done=true; starBank(s); } S.stars=[]; }   // 离开营地又回来：没飞完的星星直接入账
    if(!S.map) S.map=buildMap();
    // 惯性：松手后地图继续滑一小段
    if(!S.pan && (Math.abs(S.vel.x)>2 || Math.abs(S.vel.y)>2)){ S.cam.x+=S.vel.x*dt; S.cam.y+=S.vel.y*dt; const f=Math.exp(-dt*5); S.vel.x*=f; S.vel.y*=f; }
    const g=geo(lay); S.G=g; foodLoad(); foodTick(); altLoad();
    if(!S.pre){ S.pre=1;   // 先把营地要用的图都请求一遍（不然第一次冒气泡、爱心时图还没加载，会空一下）
      for(const n of [...Object.values(BUB_ICON), 'ItemIcon_Heart','ItemIcon_Meat','BubbleFrame_01_Bg','BubbleFrame_01_BgShadow','BubbleFrame_01_ArrowBg','BubbleFrame_01_ArrowShadow','BaseFrame_Basic_Circle_H98','BaseFrame_Basic_Circle_H58']) hero(n);
      bgi('floor'); icon('Star_Altar_05_Star');
      for(const b of BUILD) camImg(b.n); for(let i=0;i<4;i++) camImg('Star_Storage_02_0'+i); camImg('Star_Altar_01_Star');
      for(const q of [...S.map.trees, ...S.map.bushes, ...S.map.flat, ...S.map.tufts]) envImg(q.n); }
    ensurePets(g);
    const t=now/1000;
    for(const k in S.bump){ S.bump[k]+=dt; if(S.bump[k]>0.4) delete S.bump[k]; }
    update(dt, g);
    ctx.save(); ctx.beginPath(); ctx.rect(g.c.x, g.c.y, g.c.w, g.c.h); ctx.clip();
    drawGround(g, t);
    // 有高度的东西（树、灌木、建筑、宠物）按脚的位置前后排序
    const items=[];
    for(const q of S.map.trees) if(visible(g, q.x, q.y, q.w, q.h, q.foot)) items.push({y:SY(g,q.y), f:()=>drawTree(q,g,t)});
    for(const q of S.map.bushes) if(visible(g, q.x, q.y, q.w, q.h, q.foot)) items.push({y:SY(g,q.y), f:()=>drawTree(q,g,t)});
    for(const b of BUILD) items.push({y:SY(g,b.y)-0.01, f:()=>drawBuilding(b,g,t)});
    for(const p of S.pets) items.push({y:yOf(g,p.d), f:()=>drawPet(p,g,dt)});
    items.sort((a,b)=>a.y-b.y).forEach(it=>it.f());
    // 树林越往外越暗一点（空地外一圈开始），看起来林子深、空地亮；宠物和建筑都在空地里，不受影响
    { ctx.save(); ctx.translate(SX(g,CLR.cx), SY(g,CLR.cy)); ctx.scale(1, CLR.ry/CLR.rx);
      const R0=CLR.rx*g.u, gr=ctx.createRadialGradient(0,0,R0*1.08,0,0,R0*2.3);
      gr.addColorStop(0,'rgba(14,34,30,0)'); gr.addColorStop(0.5,'rgba(14,34,30,.14)'); gr.addColorStop(1,'rgba(14,34,30,.28)');
      ctx.fillStyle=gr; ctx.fillRect(-6000*g.u, -6000*g.u, 12000*g.u, 12000*g.u); ctx.restore(); }
    COMBO.draw(dt, 'ground'); COMBO.draw(dt, 'world');
    drawAltarBubble(g, t);
    // 爱心：往上飘、左右轻摆、先弹出再淡出
    for(const h of S.hearts){ h.t+=dt; if(h.t<0) continue; const k=h.t/h.life; if(k>=1){ h.done=true; continue; }
      const sc=k<0.2?ease.outBack(k/0.2):1, a=k<0.7?1:1-(k-0.7)/0.3;
      drawImgC(hero('ItemIcon_Heart'), h.x+Math.sin(h.t*5+h.ph)*5*g.u*h.sw, h.y-k*48*g.u, h.s*sc, a); }
    for(let i=S.hearts.length-1;i>=0;i--) if(S.hearts[i].done) S.hearts.splice(i,1);
    // 气泡（画在所有宠物之上）
    for(const p of S.pets) if(p.bub && p._scr){ const b=p.bub, a=Math.min(1, b.t*6, (b.dur-b.t)*5), pop=b.t<0.18?ease.outBack(b.t/0.18):1;
      const sz=Math.max(26, 30*g.u*p._scr.k)*pop; drawBubble(p._scr.x+p.face*p._scr.h*0.18, p._scr.y-p._scr.h*1.02-6*g.u, sz, b.icon, a); }
    drawFoodBox(g);
    // 拿着的食物 / 飞向嘴里 / 飞回食物格
    const fs=Math.min(58, 46*g.u);
    if(S.drag && S.drag.on){ const tgt=hitPet(S.drag.x, S.drag.y);
      for(const p of S.pets){ const on=p===tgt; if(on && !p.hl){ hop(p,5); bubble(p,'warn',0.8); } p.hl=on; }   // 食物移到哪只身上，那只蹦一下
      drawImgC(hero('ItemIcon_Meat'), S.drag.x, S.drag.y, fs*(tgt?1.12:1)); }
    if(S.fly){ const f=S.fly; f.t+=dt; const k=Math.min(1,f.t/f.dur), e=ease.outCubic(k);
      const x=f.from.x+(f.to.x-f.from.x)*e, y=f.from.y+(f.to.y-f.from.y)*e-Math.sin(k*Math.PI)*(f.back?30:10);
      drawImgC(hero('ItemIcon_Meat'), x, y, fs*(f.back?1-0.3*k:1-0.35*k)); if(k>=1 && f.back) S.fly=null; }
    ctx.restore();
    drawStars(dt);   // 飞向资源条的星星：不裁在营地范围里（横屏时资源条可能在范围外）
  }

  // ---------- 输入 ----------
  function hitPet(x, y){
    let best=null, bd=1e9;
    for(const p of S.pets||[]){ const s=p._scr; if(!s) continue; const cy=s.y-s.h*0.5, dx=x-s.x, dy=y-cy, r=Math.max(s.h*0.62, 30);
      const d=Math.hypot(dx, dy*0.9); if(d<r && d<bd && !p.eat){ bd=d; best=p; } }
    return best;
  }
  function hitBuilding(x, y){
    const a=BUILD.find(q=>q.id==='altar'); if(a._bub){ const r=a._bub; if(x>r.x-6 && x<r.x+r.w+6 && y>r.y-6 && y<r.y+r.h+14) return a; }
    // 前面的（脚更靠下的）先判
    for(const b of BUILD.slice().sort((p,q)=>q.y-p.y)){ const s=b._scr; if(!s) continue; if(x>s.x-s.w*0.42 && x<s.x+s.w*0.42 && y>s.y-s.h && y<s.y) return b; }
    return null;
  }
  const inBox = (x,y) => { const b=S.G&&S.G.box; return b && Math.hypot(x-(b.x+b.w/2), y-(b.y+b.h/2))<b.w*0.6; };
  function down(x, y){
    const now=performance.now(); S.down={x, y, t:now};
    if(inBox(x,y)){ if(foodLoad().n>0){ S.drag={on:true, x, y}; COMBO.play('移动', null); } else { sfx('deny'); toast(`${fmtLeft()} 后 +1`); } return; }
    // 按在别处：准备拖地图（移动超过 8 像素才算拖，否则松手时当作点击）
    S.pan={x0:x, y0:y, cx:S.cam.x, cy:S.cam.y, moved:false, lx:x, ly:y, lt:now}; S.vel={x:0, y:0};
  }
  function fmtLeft(){ const left=FOOD_MS-((Date.now()-FOOD.t)%FOOD_MS), m=Math.floor(left/60000), s=Math.floor(left/1000)%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
  // 中途离开营地、切窗口、触摸被系统取消：食物从手里的位置飞回食物格
  function cancel(){ S.pan=null; if(!S.drag) return; const b=S.G&&S.G.box; if(b) S.fly={from:{x:S.drag.x, y:S.drag.y}, to:{x:b.x+b.w/2, y:b.y+b.h/2}, t:0, dur:0.22, back:true};
    S.drag=null; S.down=null; for(const q of S.pets||[]){ q.hl=false; q.wake=null; q.slot=null; } }
  function move(x, y){
    if(S.drag && S.drag.on){ S.drag.x=x; S.drag.y=y; return; }
    const P=S.pan; if(!P || !S.G) return; const u=S.G.u, now=performance.now();
    if(!P.moved && Math.hypot(x-P.x0, y-P.y0)>8) P.moved=true;
    if(P.moved){ S.cam.x=P.cx-(x-P.x0)/u; S.cam.y=P.cy-(y-P.y0)/u; clampCam(S.G.v);
      const dtm=Math.max(8, now-P.lt)/1000; S.vel.x=S.vel.x*0.6+(-(x-P.lx)/u/dtm)*0.4; S.vel.y=S.vel.y*0.6+(-(y-P.ly)/u/dtm)*0.4; P.lx=x; P.ly=y; P.lt=now; }
  }
  function up(x, y){
    const g=S.G;
    if(S.drag && S.drag.on){ S.drag.x=x; S.drag.y=y; const p=hitPet(x,y);
      if(p) feed(p, g);
      else { const b=g.box; S.fly={from:{x,y}, to:{x:b.x+b.w/2, y:b.y+b.h/2}, t:0, dur:0.22, back:true}; sfx('ui'); }
      S.drag=null; for(const q of S.pets){ q.hl=false; q.wake=null; q.slot=null; } return; }
    const P=S.pan; S.pan=null;
    if(P && P.moved){ if(performance.now()-P.lt>90){ S.vel.x=0; S.vel.y=0; }   // 停住了再松手：不滑
      const sp=Math.hypot(S.vel.x, S.vel.y), mx=900; if(sp>mx){ S.vel.x*=mx/sp; S.vel.y*=mx/sp; } S.down=null; return; }
    S.vel={x:0, y:0};
    // 点一下：宠物蹦一下、开心地扭一扭；点祭坛 = 收星星；点别的建筑轻轻弹一下
    const d=S.down; if(d && Math.hypot(x-d.x,y-d.y)<10){ const p=hitPet(x,y);
      if(p && !p.eat){ if(p.pair) endPair(p.pair,null); p.st='happy'; p.t=1.6; play(p,'Busking',true); hop(p,10); bubble(p,'music',1.2); sfx('ui'); }
      else if(!p){ const b=hitBuilding(x,y); if(b){ S.bump[b.id]=0; if(b.id==='altar') collect(g); else sfx('ui'); } } }
    S.down=null;
  }
  return { draw, down, move, up, cancel, S, PERS, _dbg:{BUILD, OBS, PA}, food:()=>foodLoad(), altar:()=>altLoad(), collect:()=>S.G&&collect(S.G) };
})();
