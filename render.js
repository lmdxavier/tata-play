'use strict';
/* =====================================================================
   塔塔 · M2 画面层（素材版 7：特效和音效改用 素材库\效果组合，见 combo.js）
   只读 G（逻辑状态）和 emit 事件，不改规则。
   素材：Village 地块 + 装饰、Pet Pack 1（Spine 4.3）、Enemy Monster 1、
         Icon Pack 图标；事件特效 + 音效 = 效果组合（combo.js）；没有组合的少数事件暂用 sfxgen（见 SFXDEF）。
   ===================================================================== */
const ASSET = 'assets/';
// 缓动：回弹、弹性，用来做 Q 弹的界面和奖励
const ease = { outBack:(k,s=1.7)=>1+(s+1)*Math.pow(k-1,3)+s*Math.pow(k-1,2), outCubic:k=>1-Math.pow(1-k,3), inQuad:k=>k*k };
const clamp01 = v=>Math.max(0,Math.min(1,v));
const IMG = {}; window.__IMG = IMG;
let IMG_STAMP=0;   // 35 版：每加载完一张图 +1，卡片缓存用它判断「当时缺图、现在到了」要重画
// 56 版（国内朋友反馈地图宝箱缺失）：懒加载的图重试全部失败后不再永久空着 —— 隔 5 秒以上再被画到时重新请求
function img(path){ let i=IMG[path];
  if(i && i.complete && !i.naturalWidth && performance.now()-(i.__t||0)>5000) i=null;
  if(!i){ i=new Image(); i.__t=performance.now(); i.onload=()=>{ IMG_STAMP++; }; i.src=ASSET+path; IMG[path]=i; } return i; }
const ok = i => i && i.complete && i.naturalWidth>0;
const icon = n => img('icons/'+n+'.png');
// village 素材（黑描边、浮雕）画风不符，15 版已删，不要再加回来

// 角色映射：宠物用 Spine，怪物（和怪物转宠物）用 Enemy Monster 播放器
const PET_SPINE = { flower:'Flower', goldfish:'Goldfish', pug:'Pug', pumpkin:'Pumpkin', bomb:'Bomb' };
const PET_MON   = { lizard:'Lizard_Fire' };
const ENEMY_MON = { slime:'Slime_Green', beetle:'Beetle_Red', snail:'Snail_Green', fox:'Animal_Fox', bear:'Bear_Grizzly', hornliz:'Lizard_Horn', hornbug:'Beetle_Blood' };
const PET_SIZE  = { flower:0.62, goldfish:0.66, pug:0.62, pumpkin:0.78, bomb:0.5, lizard:0.75 };   // 身高，单位：格
const PROJ_ICON = { water:'Economy_Water_01_Blue', fire:'Misc_Fire_01_Red', grass:'Misc_Leaf_01_Green' };

// ---------- 加载 ----------
// 56 版：一张图（每张自带 8 次重试）失败后再整轮重来，最多 3 轮；开场的宠物骨骼图集缺一张就会整局报错
const loadImage1 = src => new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; });
const loadImage = async src => { for(let k=0;k<3;k++){ const i=await loadImage1(k?src+(src.includes('?')?'&':'?')+'k='+k:src); if(i) return i; } return null; };
// 56 版：后台下载限制同时 4 个，免得在差网络上一下子挤满，界面按需要的图（比如地图宝箱）抢不到
async function pool(list, n, fn){ let i=0; await Promise.all(Array.from({length:Math.min(n,list.length)}, async()=>{ while(i<list.length){ const k=i++; await fn(list[k]); } })); }
let MONLIB = null, MONLIB_ORIG = null; const SPINE = {}; let SPR = null, SPR2 = null;
const PORTRAIT = {};       // 卡面头像（离屏画布）
let READY = false, LOADMSG = '加载素材…', LOAD_N = null;
// 55 版（2026-11-13，国内网络到海外服务器丢包，40MB 一次下不完）：开场只等营地要用的素材；
// 战斗特效图、音效、音乐在进游戏后后台加载。没加载完就点进战斗 → 先显示进度，加载完自动开始（meta.js startBattle）。
let BATTLE_READY = false, BATTLE_WAIT = false, BATTLE_WAIT_TAB = null, BATTLE_N = [0,0];
function loadScript(src, tries, ok){   // 失败自动重试（隔 1/2/3… 秒），最多 tries 次；ok() 检查数据真的到了（防下载被截断）
  return new Promise(res=>{ let n=0; const go=()=>{ const s=document.createElement('script'); s.src=src+(n?('?r='+n):'');
    s.onload=()=>{ if(!ok || ok()) res(true); else s.onerror(); }; s.onerror=()=>{ s.remove(); if(++n<tries) setTimeout(go, 1000*n); else { console.warn('加载失败', src); res(false); } };
    document.head.appendChild(s); }; go(); });
}
async function loadLater(){
  const vfx=Object.keys(window.VFX_META||{}).map(n=>'vfx/'+n+'.png'); let vd=0, cd=0, ct=0;
  const show=()=>{ BATTLE_N=[vd+cd, vfx.length+ct]; }; show();
  // 先让营地界面自己按需加载的图（图标、按钮等，img() 懒加载）下完，再开始后台大下载，免得抢网速、界面图标迟迟不出来
  for(let i=0;i<150;i++){ await new Promise(r=>setTimeout(r,200)); if(i>=3 && Object.values(IMG).every(im=>im.complete)) break; }
  // 营地也有音效（投喂、收取、按钮），音效数据和战斗图一起下，不排在后面
  const sfx = loadScript('assets/combos/audio.js', 8, ()=>!!window.COMBO_AUDIO).then(ok=>{ if(ok) COMBO.audioData(); });
  await Promise.all([
    pool(vfx, 2, async p=>{ if(!IMG[p]){ const i=await loadImage(ASSET+p); if(i) IMG[p]=i; } vd++; show(); }),
    COMBO.preload((d,t)=>{ cd=d; ct=t; show(); }, 3) ]);
  BATTLE_READY = true;
  // 等待期间换了页签 = 不想进了，不再自动拉进战斗
  if(BATTLE_WAIT){ const go = typeof MT!=='undefined' && MT.tab===BATTLE_WAIT_TAB && !MT.inBattle; BATTLE_WAIT=false; if(go) startBattle(); }
  await sfx;
  await loadScript('assets/bgm/bgm.js', 8, ()=>!!window.TATA_BGM);   // music.js 每 100ms 检查，数据到了自动解码播放
}
// 质感开关（按 Q 切换，用来和原版对比）：ink = 彩色线 + 补线 + 明暗；orig = 素材原样
let LOOK = 'ink';
// 宠物图集分辨率（按 H 切换）：高清 = 放大 4 倍的图集，原版 = 素材包原样（整只约 100 像素高）
let PET_HD = true;
async function buildSpine(name, dir, src){
  const P = (src||window.PET_DATA)[name]; const atlas = new spine.TextureAtlas(P.atlas);
  for(const page of atlas.pages){ const im = await loadImage(ASSET+dir+page.name); page.setTexture(new spine.CanvasTexture(im)); }
  const sj = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas));
  return { data: sj.readSkeletonData(P.json), h: P.json.skeleton.height, w: P.json.skeleton.width };
}
async function loadAll(){
  try {
    for(const name of Object.values(PET_SPINE)){ SPINE[name] = await buildSpine(name,'pets/'); SPINE[name].orig = await buildSpine(name,'pets/orig/');
      if(window.PET_DATA_HD && window.PET_DATA_HD[name]) SPINE[name].hd = await buildSpine(name,'pets_hd/',window.PET_DATA_HD); }   // 12 版：Real-ESRGAN 放大 4 倍的图集（tools/upscale_atlas.py）
    SPR = new spine.SkeletonRenderer(ctx); SPR.triangleRendering = true;
    // 只加载本关用到的怪物；ink 版贴图 = 换色线 + 饱和 +15%（离线处理好的 atlas_final）
    const used = [...Object.values(ENEMY_MON), ...Object.values(PET_MON)];
    const D = window.ENEMY_MONSTER_DATA, ORIG_HAS = ['Animal_Fox','Bear_Grizzly','Beetle_Red','Lizard_Fire','Slime_Green','Snail_Green'],   // 素材原样的图集（按 Q 对比用）只有这 6 只，其余的对比时也用处理过的图集
      pick = dir => ({...D, monsters:Object.fromEntries(used.map(n=>[n,{...D.monsters[n], atlas:(dir==='atlas/' && !ORIG_HAS.includes(n) ? 'atlas_final/' : dir)+n+'.png'}]))});
    MONLIB = await EnemyMonsters.load(pick('atlas_final/'), ASSET+'monsters/');
    MONLIB_ORIG = await EnemyMonsters.load(pick('atlas/'), ASSET+'monsters/');
    MONH = {};
    for(const n of used){ const m=MONLIB.create(n); m.play('Idle'); const b=m.bounds(false); MONB[n]={w:b.w,h:b.h,all:m.bounds(true)}; MONH[n]=b.h; }
    const list = [...PRELOAD];
    // 55 版：战斗特效图 vfx/*.png 移到 loadLater（只在战斗里用，画的时候 img()+ok() 会跳过还没到的）
    LOAD_N=[0,list.length]; LOADMSG = '加载图片…';
    await Promise.all(list.map(async p=>{ if(!IMG[p]) { const i = await loadImage(ASSET+p); if(i) IMG[p]=i; } LOAD_N[0]++; }));
    LOAD_N=null; LOADMSG = '加载场景…';
    await SCENE.load();   // 55 版：战斗特效（COMBO.preload，约 9MB）改到进游戏后后台加载，见 loadLater
    LOADMSG = '生成卡面…';
    await loadFont();
    makePortraits();
    READY = true;
    loadLater();
  } catch(err){ LOADMSG = '素材加载失败：'+err.message; console.error(err); }
}
let MONH = {}, MONB = {};

function newSpine(name, orig){
  const sd = orig ? SPINE[name].orig : (PET_HD && SPINE[name].hd) || SPINE[name]; const sk = new spine.Skeleton(sd.data); (sk.setupPose?sk.setupPose():sk.setToSetupPose());
  const sdata = new spine.AnimationStateData(sd.data); sdata.defaultMix = 0.12;
  const st = new spine.AnimationState(sdata); st.setAnimation(0,'Idle',true);
  return { kind:'spine', sk, st, sd, name };
}
function newMon(name, anim, orig){ const m = (orig?MONLIB_ORIG:MONLIB).create(name); m.play(anim||'Idle'); return { kind:'mon', m, name }; }

// =====================================================================
// 角色质感（用户选定参数）：总线宽 3.75%（占格子边长）、暗部 50%、亮边 5%、饱和 +15%（已烘焙进贴图）
//   每个角色每帧先画进离屏画布 → 原线比 3.75% 细的往外补一圈同色线（把整只角色往 8~12 个方向错开叠）
//   → 下半身往深紫渐暗 → 左上外沿一道细亮边 → 受击闪白 → 贴回主画布
//   宠物原线约 4% 已够粗，不补；怪物原线约 6 贴图像素，按显示大小算要补多少
// =====================================================================
const INK = { total:0.0375, shade:0.5, rim:0.05, monLinePx:6, petLine:0.04 };
const FXC = { A:null, B:null, U:null, size:0 };
function fxCanvas(n){
  if(FXC.size<n){ FXC.size=Math.ceil(n/64)*64; for(const k of ['A','B','U']){ const c=document.createElement('canvas'); c.width=c.height=FXC.size; FXC[k]=c; FXC[k+'g']=c.getContext('2d'); } SPR2=new spine.SkeletonRenderer(FXC.Ag); SPR2.triangleRendering=true; }
}
// 把角色画进离屏 A（设备像素）；返回 {cv, px, py, bw, bh}，(px,py) 是脚底在离屏里的位置
function renderChar(v, s, flip, o){
  const S=o.S||DPR, cs=o.cs||L.cs, hpx=o.hpx;
  // 离屏区域只比角色大一圈（攻击动作会伸出去一点）；区域越小越省
  // 离屏区域：怪物按「所有动作」的包围盒算（攻击会伸出去，熊的爪子不能被切掉）；宠物按骨架尺寸留余量
  const pad=cs*0.12+4/S; let bw,bh,px,py;
  const A=v.kind==='mon' && MONB[v.name] && MONB[v.name].all;
  if(A){ const half=Math.max(-A.x, A.x+A.w)*s+pad, up=-A.y*s+pad, down=Math.max(0,A.y+A.h)*s+pad;
    bw=Math.ceil(2*half*S); bh=Math.ceil((up+down)*S); px=bw/2; py=Math.ceil(up*S); }
  else { bw=Math.ceil(Math.max(cs*1.75, hpx*1.6)*S); bh=Math.ceil(Math.max(cs*1.5, hpx*1.5)*S); px=bw/2; py=Math.round(bh*0.86); }
  fxCanvas(Math.max(bw,bh)+4);
  let C=FXC.A, g=FXC.Ag;
  // 多清 2 像素：缩放贴回主画布时浏览器会采样到区域外一圈，残留的旧像素会变成角色脚下的细线
  g.setTransform(1,0,0,1,0,0); g.globalCompositeOperation='source-over'; g.globalAlpha=1; g.clearRect(0,0,bw+2,bh+2);
  g.setTransform(S,0,0,S,px,py);
  if(v.kind==='spine'){ g.save(); g.scale(flip?-s:s,-s); v.sk.x=0; v.sk.y=0; v.sk.updateWorldTransform(spine.Physics.update); SPR2.draw(v.sk); g.restore(); }
  else v.m.draw(g, 0, 0, { scale:s, flipX:!!flip, shadow:false, skipFx:true });
  g.setTransform(1,0,0,1,0,0);
  if(LOOK!=='orig'){
    // 1) 补线：原线比总线宽细多少，就往外膨胀多少（设备像素）
    const native = v.kind==='spine' ? INK.petLine*cs : INK.monLinePx*s;
    const r = Math.max(0, INK.total*cs - native)*S;
    if(r>0.35){
      const g2=FXC.Bg; g2.setTransform(1,0,0,1,0,0); g2.globalCompositeOperation='source-over'; g2.clearRect(0,0,bw+2,bh+2);
      const nd = r>2 ? 12 : 8;
      for(let k=0;k<nd;k++){ const t=k/nd*Math.PI*2; g2.drawImage(C, 0,0,bw,bh, Math.cos(t)*r, Math.sin(t)*r, bw,bh); }
      for(let k=0;k<nd;k+=2){ const t=(k+0.5)/nd*Math.PI*2; g2.drawImage(C, 0,0,bw,bh, Math.cos(t)*r*0.5, Math.sin(t)*r*0.5, bw,bh); }   // 半径一半处再叠一圈，补齐空隙
      g2.drawImage(C,0,0);
      C=FXC.B; g=g2;
    }
    // 2) 暗部：从身体中间往下渐暗（偏冷的深紫，不是黑）
    const top=py-hpx*S-cs*0.06*S;
    g.globalCompositeOperation='source-atop';
    const gr=g.createLinearGradient(0,top,0,py); gr.addColorStop(0,'rgba(255,250,230,0)'); gr.addColorStop(0.55,'rgba(40,20,60,0)'); gr.addColorStop(1,`rgba(40,20,70,${INK.shade})`);
    g.fillStyle=gr; g.fillRect(0,0,bw,bh);
    // 3) 亮边：外形减去往右下错开的外形 → 左上外沿一条细边
    const k=0.02*cs*S, ug=FXC.Ug;
    ug.setTransform(1,0,0,1,0,0); ug.globalCompositeOperation='source-over'; ug.clearRect(0,0,bw+2,bh+2); ug.drawImage(C,0,0);
    ug.globalCompositeOperation='destination-out'; ug.drawImage(C,k*0.75,k);
    ug.globalCompositeOperation='source-in'; ug.fillStyle=`rgba(255,255,240,${INK.rim+(o.rimBoost||0)})`; ug.fillRect(0,0,bw,bh);
    g.drawImage(FXC.U,0,0);
  } else g.globalCompositeOperation='source-atop';
  // 4) 受击闪白（整只角色变亮，不是叠一层光）
  if(o.flash>0){ g.fillStyle=`rgba(255,255,255,${Math.min(0.85,o.flash)})`; g.fillRect(0,0,bw,bh); }
  if(o.tint){ g.fillStyle=o.tint; g.fillRect(0,0,bw,bh); }
  g.globalCompositeOperation='source-over';
  return { cv:C, px, py, bw, bh };
}

// =====================================================================
// 58 版（用户 2026-11-13：换 WebGL 后仍卡、发烫）：活动角色在 GPU 上画
//   57 版角色仍走 renderChar（CPU 上 Spine 逐三角形裁剪 + 离屏叠十几遍补线 / 暗部 / 亮边），画完再整块上传给 GPU；
//   战斗里靠 44 版的 FC 帧缓存撑着，缓存满了就回到每帧现画 → 越打越卡、发烫。
//   现在：宠物 = Spine 网格直接交给 GPU，怪物 = 零件精灵，质感（补线 / 暗部 / 亮边 / 闪白 / 着色 / 剪影）在一个着色器里算（pixi-ctx.js __charBegin/__charEnd），
//   参数和 renderChar 完全一样，不用缓存，内存不再涨。卡面头像等一次性的图仍用 renderChar。
//   GPU 没准备好（刚打开那一下）、?gl=0、?glc=0 时回到 renderChar。
// =====================================================================
const GLC_OFF = /[?&]glc=0\b/.test(location.search);
// (x,y) = 脚底，坐标系 = 当前 ctx 变换；o 同 renderChar（S、cs、hpx、flash、tint、rimBoost）另加 alpha、sil（剪影颜色）
function charGL(v, s, flip, o, x, y){
  if(GLC_OFF || !ctx.__charBegin || !ctx.__charBegin()) return false;
  let ok=false;
  try{
    const S=o.S||DPR, cs=o.cs||L.cs, hpx=o.hpx, m=ctx.getTransform(), a=m.a, b=m.b, c=m.c, d=m.d, e=m.e, f=m.f;
    if(v.kind==='spine'){ v.sk.x=0; v.sk.y=0; v.sk.updateWorldTransform(spine.Physics.update);
      const sx=flip?-s:s, sy=-s;   // 骨架坐标 → 当前坐标：平移到脚底、缩放（y 朝上）
      ctx.__spine(v.sk, [a*sx, b*sx, c*sy, d*sy, a*x+c*y+e, b*x+d*y+f]); }
    else v.m.draw(ctx, x, y, { scale:s, flipX:!!flip, shadow:false, skipFx:true });
    const ink = LOOK!=='orig', native = v.kind==='spine' ? INK.petLine*cs : INK.monLinePx*s;
    const rD = ink ? Math.max(0, INK.total*cs - native)*S : 0, r = rD>0.35 ? rD : 0, k=0.02*cs*S;
    const sc = Math.sqrt(Math.abs(a*d-b*c))/S, top=y-hpx-cs*0.06;
    ok = ctx.__charEnd({ pad:(r+Math.max(k,1))*sc, r, nd: rD>2?12:8, look:ink, alpha:o.alpha, L:[a/S, b/S, c/S, d/S],
      shade:[b*x+d*top+f, b*x+d*y+f, INK.shade], rim:[k*0.75, k, INK.rim+(o.rimBoost||0)], flash:o.flash, tint:o.tint, sil:o.sil });
  } finally { if(ctx.__charAbort) ctx.__charAbort(); }   // 出错时不让后面的绘制都画进看不见的格子（正常结束时这里什么都不做）
  return ok;   // false = 角色太大放不进图集 → 调用方用 renderChar 画
}
// 画一个活动角色（营地、地图、宠物页）：GPU 能画就 GPU，否则照旧 renderChar 贴图
function drawLive(v, s, flip, o, x, y){
  if(charGL(v, s, flip, o, x, y)) return;
  const r=renderChar(v, s, flip, o);
  if(o.sil){ SILC2.width=r.bw; SILC2.height=r.bh; const g=SILC2.getContext('2d'); g.drawImage(r.cv,0,0,r.bw,r.bh,0,0,r.bw,r.bh);
    g.globalCompositeOperation='source-in'; g.fillStyle=o.sil; g.fillRect(0,0,r.bw,r.bh); ctx.drawImage(SILC2, x-r.px/DPR, y-r.py/DPR, r.bw/DPR, r.bh/DPR); return; }
  if(o.alpha!=null){ ctx.save(); ctx.globalAlpha*=o.alpha; }
  ctx.drawImage(r.cv, 0,0,r.bw,r.bh, x-r.px/DPR, y-r.py/DPR, r.bw/DPR, r.bh/DPR);
  if(o.alpha!=null) ctx.restore();
}
const SILC2 = document.createElement('canvas');

// 卡面头像：待机姿势画进 128×128，用同一套质感处理
let LASTSHARD = null;
// 碎片图标：怪物头像 + 右下角一个小碎片角标
const SHARD_RAR = { minor:'common', elite:'rare' };
const RAR = { common:{cn:'普通', need:10, frame:'Green'}, rare:{cn:'稀有', need:15, frame:'Blue'}, epic:{cn:'史诗', need:25, frame:'Purple'}, legend:{cn:'传说', need:40, frame:'Yellow'} };
const rarOf = k => RAR[DATA.pets[k] ? (DATA.pets[k].rarity||'common') : (SHARD_RAR[(DATA.enemies[k]||{}).role]||'common')];   // 65 版：碎片按宠物算（宠物碎片 / 能收服的怪）
const shardName = k => ((DATA.pets[k]||DATA.enemies[k]||{}).cn||k).replace(' · 精英','');
const shardPort = k => PORTRAIT[k] || MONPORT[k];
// 已收集的碎片（跨局累积；正式存档做好前先存浏览器本地，读不到就从 0 开始）
let OWNED = {}; try{ OWNED = JSON.parse(localStorage.getItem('tata_shards')||'{}')||{}; }catch(e){ OWNED={}; }
let BANKED = false;
// 38 版（用户 2026-11-13）：资源 = 金币 + 星星，跨局累积（正式存档做好前先存浏览器本地）；金币 = 胜利结算的 coins，星星以后由星之祭坛产出
let WALLET = {gold:0, star:0}; try{ Object.assign(WALLET, JSON.parse(localStorage.getItem('tata_wallet')||'{}')||{}); }catch(e){}
function walletSave(){ try{ localStorage.setItem('tata_wallet', JSON.stringify(WALLET)); }catch(e){} }
function bankCoins(){ if(!G.over || !G.over.coins || G.over._banked) return; G.over._banked=true; WALLET.gold+=G.over.coins; walletSave(); }
function bankShards(){ if(BANKED) return; BANKED=true; G.shardsBefore={...OWNED}; for(const [k,n] of Object.entries(G.shards)) OWNED[k]=(OWNED[k]||0)+n; try{ localStorage.setItem('tata_shards', JSON.stringify(OWNED)); }catch(e){} }
// 碎片图标：品质色物品框 + 怪物头像（不加和怪物无关的宝石）
// 碎片 = 菱形（把品质框转 45°）里放头像；完整角色是方形卡。很多手游的「灵魂石」也是这个区分方式
function shardIcon(key, cx, cy, size){
  const fr=gui('Frame/ItemFrame03_Single_'+rarOf(key).frame), d=size*0.71;   // 转 45° 后对角线 = size
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(Math.PI/4);
  nine(fr, -d/2, -d/2, d, d, 40, d*0.22);
  ctx.beginPath(); rr(-d/2+d*0.1, -d/2+d*0.1, d*0.8, d*0.8, d*0.14); ctx.clip();
  ctx.rotate(-Math.PI/4); const pc=shardPort(key); if(pc) ctx.drawImage(pc, -size*0.42, -size*0.47, size*0.84, size*0.84);
  ctx.restore();
}
// 碎片格（结算用）：头像框 + 右上角本局获得数 + 下方「已收集/召唤所需」进度条
function shardCard(key, gained, x, y, s){
  shardIcon(key, x+s/2, y+s/2, s*1.08);
  text(String(gained), x+s/2, y+s*0.86, s*0.24, '#fff');   // 和金币、经验一样：数字在下沿
  const have=(G.shardsBefore&&G.shardsBefore[key]||0)+gained, need=rarOf(key).need, bh=12;
  hpBar(x+s/2, y+s+5, s+6, Math.min(1,have/need), 'green', bh);
  text(have>=need?'可召唤':`${have}/${need}`, x+s/2, y+s+5+bh/2, 10, have>=need?'#ffe14d':'#fff');
}
const MONPORT = {};   // 怪物头像：碎片奖励、碎片飞行、顶部碎片计数都用它
function makeMonPortraits(){
  for(const [key,name] of Object.entries(ENEMY_MON)){
    const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d');
    const v=newMon(name,'Idle'); v.m.update(0.2); const b=MONB[name], s=Math.min(96/b.h, 108/b.w), h=b.h*s;
    const r2=renderChar(v, s, false, {S:1, cs:120, hpx:h}); g.drawImage(r2.cv, 0,0,r2.bw,r2.bh, 64-r2.px, 112-r2.py, r2.bw, r2.bh);
    MONPORT[key]=c;
  }
}
function makePortraits(){
  makeMonPortraits();
  for(const key of Object.keys(DATA.pets)){
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    let v, s, h;
    if(PET_SPINE[key]){ v = newSpine(PET_SPINE[key]); v.st.update(0.3); v.st.apply(v.sk); s = Math.min(100/v.sd.h, 112/v.sd.w); h=v.sd.h*s; }
    else { v = newMon(PET_MON[key],'Idle'); v.m.update(0.2); const b=MONB[PET_MON[key]]; s=Math.min(100/b.h, 112/b.w); h=b.h*s; }
    const r = renderChar(v, s, v.kind==='mon', {S:1, cs:120, hpx:h});
    g.drawImage(r.cv, 0,0,r.bw,r.bh, 64-r.px, 112-r.py, r.bw, r.bh);
    PORTRAIT[key] = c;
  }
}

// ---------- 实体 → 画面实例 ----------
const VIS = new WeakMap(); let VIS_ID = 0;
// 体型标准：所有角色按「待机姿势」缩放到基本占满一格（高 0.84 格、宽不超过 0.94 格）；精英大一号，地雷小一号
const FIT = { pet:[0.84,0.94], mine:[0.6,0.7], enemy:[0.84,0.94], elite:[1.06,1.2] };
function visOf(ent, isPet){
  let v = VIS.get(ent); if(v) return v;
  const orig = LOOK==='orig';
  if(isPet){ v = PET_SPINE[ent.key] ? newSpine(PET_SPINE[ent.key], orig) : newMon(PET_MON[ent.key],'Idle', orig); v.fit = ent.def.shape==='mine' ? FIT.mine : FIT.pet; }
  else { v = newMon(ENEMY_MON[ent.key],'Walk', orig); v.state='Walk'; v.fit = ent.def.role==='elite' ? FIT.elite : FIT.enemy; }
  v.hpGhost = 1; v.id = (VIS_ID++); VIS.set(ent, v); return v;
}
function charScale(v, mul){
  const cs=L.cs;
  if(v.kind==='spine'){ const sd=v.sd, s=cs*Math.min(v.fit[0]/sd.h, v.fit[1]/sd.w)*(mul||1); return [s, sd.h*s]; }
  const b=MONB[v.name], s=cs*Math.min(v.fit[0]/b.h, v.fit[1]/b.w)*(mul||1); return [s, b.h*s];
}
// =====================================================================
// 44 版（用户 2026-11-13：手机上战斗一会儿越来越卡）：角色动作帧共用缓存
//   原来每只角色每帧都走 renderChar 全套（Spine 逐三角形裁剪 + 补线 + 暗部 + 亮边），开销跟着场上单位数涨。
//   现在同一种角色、同一个动作、同一帧（每秒 30 帧）只渲染一次，结果裁掉空白后存进这一种角色的图集页，之后所有同种角色直接贴图；
//   受击闪白 / 着色在贴图前对这一小块单独叠（和 renderChar 第 4 步同样的做法）。Spine 动作切换的过渡期（0.12 秒）、弹跳缩放时不缓存，照旧实时画。
//   只有战斗里的角色用（drawV 的 o.fc）；营地 / 宠物页的角色大小各不相同，不走这里。网址加 ?fc=0 关掉（对比用）。
// =====================================================================
const FC = { on: !/[?&]fc=0/.test(location.search), fps: (()=>{ const m=/[?&]fcfps=(\d+)/.exec(location.search); return m?+m[1]:30; })(), PAGE:512, max:72e6, bytes:0, groups:new Map(), epoch:'', monB:{}, hit:0, miss:0 };
function fcClear(){ for(const g of FC.groups.values()) for(const p of g.pages){ p.cv.width=0; p.cv.height=0; } FC.groups.clear(); FC.bytes=0; }
function fcInfo(v){
  if(v.kind==='mon'){ const m=v.m; if(!m.clip) return null; const len=m.clip.len, t = m.loop && len>0 ? m.time%len : Math.min(m.time,len); return [m.state, Math.floor(t*FC.fps+1e-6)]; }
  const tr=v.st.tracks; if(tr.length!==1 || !tr[0] || tr[0].mixingFrom) return null;
  return [tr[0].animation.name, Math.floor(tr[0].getAnimationTime()*FC.fps+1e-6)];
}
const FC_V2 = [null,null];
// 这一帧角色在离屏区域里占的范围（设备像素），四周留出补线 + 亮边 + 抗锯齿的余量；量不出来就用整块
function fcCrop(v, s, flip, r, anim){
  const S=DPR, mg=Math.ceil(Math.max(0, INK.total*L.cs - (v.kind==='spine' ? INK.petLine*L.cs : INK.monLinePx*s))*S)+3; let x0,y0,x1,y1;   // 余量 = 补线往外膨胀的量 + 3 像素（Spine 接缝外扩 0.6、抗锯齿）
  if(v.kind==='mon'){ const k=v.name+'|'+anim; let b=FC.monB[k]; if(!b) b=FC.monB[k]=v.m.bounds(false);
    x0=r.px+(flip?-(b.x+b.w):b.x)*s*S; x1=x0+b.w*s*S; y0=r.py+b.y*s*S; y1=y0+b.h*s*S; }
  else { if(!FC_V2[0]){ FC_V2[0]=new spine.Vector2(); FC_V2[1]=new spine.Vector2(); } const o=FC_V2[0], z=FC_V2[1]; v.sk.getBounds(o, z, []);
    const a=o.x*s*S, b=(o.x+z.x)*s*S; x0=r.px+(flip?-b:a); x1=r.px+(flip?-a:b); y0=r.py-(o.y+z.y)*s*S; y1=r.py-o.y*s*S; }
  if(!(isFinite(x0)&&isFinite(y0)&&isFinite(x1)&&isFinite(y1)) || x1<=x0 || y1<=y0) return {x:0,y:0,w:r.bw,h:r.bh};
  x0=Math.max(0,Math.floor(x0)-mg); y0=Math.max(0,Math.floor(y0)-mg); x1=Math.min(r.bw,Math.ceil(x1)+mg); y1=Math.min(r.bh,Math.ceil(y1)+mg);
  return {x:x0, y:y0, w:x1-x0, h:y1-y0};
}
function fcAlloc(G, w, h){
  const P=FC.PAGE; if(w+2>P || h+2>P) return null;
  let p=G.pages[G.pages.length-1];
  if(p && p.x+w+2>P){ p.x=0; p.y+=p.rowH; p.rowH=0; }
  if(!p || p.y+h+2>P){
    if(FC.bytes+P*P*4>FC.max){   // 超出内存上限：先扔掉 2 秒以上没用过的角色种类；腾不出来就不缓存（实时画）
      const old=[...FC.groups.entries()].filter(([,g])=>g!==G && g.last<FRAMENO-120).sort((a,b)=>a[1].last-b[1].last);
      for(const [k,g] of old){ for(const q of g.pages){ q.cv.width=0; q.cv.height=0; FC.bytes-=P*P*4; } FC.groups.delete(k); if(FC.bytes+P*P*4<=FC.max) break; }
      if(FC.bytes+P*P*4>FC.max) return null;
    }
    const c=document.createElement('canvas'); c.width=c.height=P; p={cv:c, g:c.getContext('2d'), x:0, y:0, rowH:0}; G.pages.push(p); FC.bytes+=P*P*4;
  }
  const slot={p, x:p.x+1, y:p.y+1}; p.x+=w+2; p.rowH=Math.max(p.rowH,h+2); return slot;
}
// 取这一帧的缓存图；返回 null = 这次不能缓存（调用方照旧实时画）
function fcGet(v, s, h, flip){
  const inf=fcInfo(v); if(!inf) return null;
  const ep=L.cs+'|'+DPR+'|'+LOOK+'|'+PET_HD; if(ep!==FC.epoch){ fcClear(); FC.epoch=ep; }
  const gk=v.kind+'|'+v.name+'|'+s.toFixed(4)+'|'+(flip?1:0); let G=FC.groups.get(gk); if(!G){ G={pages:[], frames:new Map(), last:0}; FC.groups.set(gk,G); } G.last=FRAMENO;
  const fk=inf[0]+'|'+inf[1]; let f=G.frames.get(fk); if(f){ FC.hit++; return f; }
  FC.miss++;
  const r=renderChar(v, s, flip, {hpx:h}), c=fcCrop(v, s, flip, r, inf[0]), slot=fcAlloc(G, c.w, c.h);
  if(!slot) return {live:r};
  slot.p.g.drawImage(r.cv, c.x,c.y,c.w,c.h, slot.x,slot.y,c.w,c.h);
  f={cv:slot.p.cv, x:slot.x, y:slot.y, w:c.w, h:c.h, ox:r.px-c.x, oy:r.py-c.y}; G.frames.set(fk,f); return f;
}
function fcDraw(f, x, y, o){
  if(o.alpha!=null){ ctx.save(); ctx.globalAlpha*=o.alpha; }
  if(f.live){ const r=f.live; let C=r.cv;
    if(o.flash>0 || o.tint){ const g=C.getContext('2d'); g.setTransform(1,0,0,1,0,0); g.globalCompositeOperation='source-atop'; if(o.flash>0){ g.fillStyle=`rgba(255,255,255,${Math.min(0.85,o.flash)})`; g.fillRect(0,0,r.bw,r.bh); } if(o.tint){ g.fillStyle=o.tint; g.fillRect(0,0,r.bw,r.bh); } g.globalCompositeOperation='source-over'; }
    ctx.drawImage(C, 0,0,r.bw,r.bh, x-r.px/DPR, y-r.py/DPR, r.bw/DPR, r.bh/DPR); }
  else if(o.flash>0 || o.tint){
    fxCanvas(Math.max(f.w,f.h)+4); const g=FXC.Ug;
    g.setTransform(1,0,0,1,0,0); g.globalCompositeOperation='source-over'; g.globalAlpha=1; g.clearRect(0,0,f.w+2,f.h+2); g.drawImage(f.cv, f.x,f.y,f.w,f.h, 0,0,f.w,f.h);
    g.globalCompositeOperation='source-atop';
    if(o.flash>0){ g.fillStyle=`rgba(255,255,255,${Math.min(0.85,o.flash)})`; g.fillRect(0,0,f.w,f.h); }
    if(o.tint){ g.fillStyle=o.tint; g.fillRect(0,0,f.w,f.h); }
    g.globalCompositeOperation='source-over';
    ctx.drawImage(FXC.U, 0,0,f.w,f.h, x-f.ox/DPR, y-f.oy/DPR, f.w/DPR, f.h/DPR);
  } else ctx.drawImage(f.cv, f.x,f.y,f.w,f.h, x-f.ox/DPR, y-f.oy/DPR, f.w/DPR, f.h/DPR);
  if(o.alpha!=null) ctx.restore();
}
// 画一个角色实例，返回画出来的高度（像素）
let FRAMENO = 0;
function drawV(v, x, y, o){
  o = o||{}; const [s,h]=charScale(v, o.mul);
  if(charGL(v, s, !!o.flip, {hpx:h, flash:o.flash, tint:o.tint, alpha:o.alpha}, x, y)) return h;   // 58 版：GPU 画（不用 FC / 隔帧缓存）
  if(o.fc && FC.on && (o.mul==null || o.mul===1)){ const f=fcGet(v, s, h, !!o.flip); if(f){ fcDraw(f, x, y, o); return h; } }
  let r;
  if(o.cache && v.cache && !o.flash && !o.tint && v.cache.s===s && ((FRAMENO+(v.id||0))&1)){ r=v.cache; }
  else {
    r = renderChar(v, s, !!o.flip, {hpx:h, flash:o.flash, tint:o.tint});
    if(o.cache){ const c=v.cache && v.cache.cv.width>=r.bw && v.cache.cv.height>=r.bh ? v.cache.cv : document.createElement('canvas');
      if(c!==(v.cache&&v.cache.cv)){ c.width=r.bw; c.height=r.bh; }
      const g=c.getContext('2d'); g.clearRect(0,0,c.width,c.height); g.drawImage(r.cv,0,0,r.bw,r.bh,0,0,r.bw,r.bh);
      v.cache={cv:c, px:r.px, py:r.py, bw:r.bw, bh:r.bh, s}; r=v.cache; }
  }
  if(o.alpha!=null){ ctx.save(); ctx.globalAlpha*=o.alpha; }
  ctx.drawImage(r.cv, 0,0,r.bw,r.bh, x-r.px/DPR, y-r.py/DPR, r.bw/DPR, r.bh/DPR);
  if(o.alpha!=null) ctx.restore();
  return h;
}
// 接地影子：和场景道具同一种（软椭圆、略偏右）
function groundShadow(x, y, w, a){
  const cx=x+w*0.06, rx=w*0.5, ry=Math.max(3,w*0.13);
  // 61d：渐变颜色固定，淡出用整体透明度（原来把淡出系数写进渐变颜色，怪物倒地淡出的每一帧都重画一张再上传——真机记录里最多的一类重画）
  const g=ctx.createRadialGradient(cx,y,0,cx,y,rx); g.addColorStop(0,'rgba(10,20,30,0.36)'); g.addColorStop(0.6,'rgba(10,20,30,0.16)'); g.addColorStop(1,'rgba(10,20,30,0)');
  ctx.save(); if(a!==undefined && a<1) ctx.globalAlpha*=Math.max(0,a); ctx.translate(cx,y); ctx.scale(1,ry/rx); ctx.translate(-cx,-y); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,y,rx,0,7); ctx.fill(); ctx.restore();
}

function petPlay(pet, anim, then){
  const v = visOf(pet,true);
  if(v.kind==='spine'){ v.st.setAnimation(0,anim,anim==='Idle'||anim==='Walk'); if(then) v.st.addAnimation(0,then,true,0); }
  else v.m.play(anim==='Busking'?'Idle':anim, { onEnd: then ? ()=>v.m.play(then) : undefined, restart:true });
}

// 尸体（死亡动画播完才消失）、特效、碎片飞行
const BUMP = {energy:0, shard:0};
const DENY = {energy:0};   // 能量不够时，能量槽变红抖动
const CARDFX = {};          // 每张卡：按下、抖动（不能买）、刚好能买时扫光、冷却好了弹一下
const BTNFX = {};           // 圆按钮按下   // 资源图标被「打中」时弹一下
const corpses = [];   // {v, lane, p, t, isPet, flip}
const VFX = [];       // {name, lane, p, t, size, rot, alpha, dy}
const flyers = [];    // {from:{lane,p}, t, life, icon, to}
let shake = { t:0, amp:0 };
function vfx(name, lane, p, size, o){ VFX.push(Object.assign({name, lane, p, t:0, size, rot:0, alpha:1, dy:0}, o||{})); }

// ---------- 音效：主体是效果组合（combo.js）。下面 sfxgen 合成音只给还没有组合的事件（开场、按钮、木箱、警钟、精英出场、结算星星、提示）----------
// 每个按 audiometrics 的方法（峰值 -40dB 以上算有声）把 RMS 对齐到 LEGACY_DB 的目标响度，和组合同一套响度标准
// 每层：[事件, 增益dB, 延迟秒]。punch_body 是 rhythm 项目里测出来的「打肉低频后到」类型，给打击感加分量
// 8 版：开场、按钮、提示、结算星星、共鸣、木箱、精英出场 改用效果组合里的成品音效；只剩 车道警钟 还没找到合适素材，暂用合成音
const SFX_COMBO = { deny:'拒绝', start:'开场', ui:'界面-点击', alert:'提示', star:'结算星星', sparkle:'共鸣', crate:'木箱-受击', crateBreak:'木箱-破碎', elite:'精英出场' };
const SFXDEF = {
  bell:    [[{type:'impact', material:'metal', size:0.85, force:0.95, striker:'hard'}, 0]],
};
const LEGACY_DB = { bell:-27 };   // 其余按 界面 -33
const SND = { ac:null, bufs:{}, last:{}, muted:false, musicOff:false, queue:[], voices:0, pending:[] };   // muted = 音效关；musicOff = 音乐关（46 版分开，在暂停界面设置，记在本机）
try{ const o=JSON.parse(localStorage.getItem('tata_sound')||'{}')||{}; SND.muted=!!o.sfxOff; SND.musicOff=!!o.musicOff; }catch(e){}
function soundSave(){ try{ localStorage.setItem('tata_sound', JSON.stringify({sfxOff:SND.muted, musicOff:SND.musicOff})); }catch(e){} }
function audioInit(){
  if(SND.ac){ if(SND.ac.state==='suspended') SND.ac.resume(); return; }
  try { SND.ac = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){ return; }
  // 压缩器：把整体响度推上去、瞬态更结实，又不会爆音
  const comp = SND.ac.createDynamicsCompressor(); comp.threshold.value=-20; comp.knee.value=8; comp.ratio.value=4; comp.attack.value=0.003; comp.release.value=0.12;
  SND.master = SND.ac.createGain(); SND.master.gain.value = 1.15; SND.master.connect(comp); comp.connect(SND.ac.destination);
  COMBO.audioInit(SND.ac, SND.master);
  // 先生成开场和按钮音，再生成其余；每帧一个，避免卡顿
  const order = Object.keys(SFXDEF);
  for(let i=0;i<3;i++) for(const k of order) if(i===0 || !['start','win','lose'].includes(k)) SND.queue.push([k,i]);
}
function renderLayers(k, seed){
  const parts=[]; let len=0;
  for(const [ev,db,delay] of SFXDEF[k]){
    const r = SFX2.events.render(ev, seed + parts.length*101);
    if(!r.buf) continue; const off=Math.round((delay||0)*SFX2.SR); parts.push([r.buf, Math.pow(10,(db||0)/20), off]); len=Math.max(len, off+r.buf.length);
  }
  const out=new Float32Array(len); let pk=0;
  for(const [b,g,off] of parts) for(let n=0;n<b.length;n++){ out[off+n]+=b[n]*g; }
  for(let n=0;n<len;n++) pk=Math.max(pk,Math.abs(out[n]));
  // 响度对齐：有声部分 RMS → 目标响度（再经过和组合一样的 +6dB 总线）
  let sq=0, cnt=0; for(let n=0;n<len;n++){ const a=Math.abs(out[n]); if(a>pk*0.01){ sq+=out[n]*out[n]; cnt++; } }
  if(cnt){ const rms=Math.sqrt(sq/cnt), g=Math.pow(10,(LEGACY_DB[k]??-33)/20)/rms*Math.pow(10,6/20); for(let n=0;n<len;n++) out[n]*=g; pk*=g; }
  if(pk>0.95) for(let n=0;n<len;n++) out[n]*=0.95/pk;
  return out;
}
function audioPump(){
  if(!SND.ac || !SND.queue.length || !window.SFX2) return;
  const [k,i] = SND.queue.shift();
  try { const buf = renderLayers(k, 1000+i*7919+k.length*31); if(buf.length){ const b=SND.ac.createBuffer(1, buf.length, SFX2.SR); b.copyToChannel(buf,0); (SND.bufs[k]=SND.bufs[k]||[]).push(b); }
        // 开场音效如果是在生成好之前触发的，生成好后补放
        if(SND.pending.includes(k)){ SND.pending=SND.pending.filter(x=>x!==k); sfx(k); } }
  catch(e){ console.warn('音效', k, e.message); }
}
function sfx(k, vol, tries){
  const cn = SFX_COMBO[k];
  if(cn){   // 组合音效：开场那一下点击时音频还在解码，等解码好再补放（最多等 1 秒）
    if(!SND.ac || SND.muted) return;
    const files = ((window.COMBOS && window.COMBOS['组合'] || []).find(c=>c['名']===cn) || {})['音效层'] || [];
    const ready = files.every(s=>s['变体'].every(v=>COMBO._A.bufs[v['文件']]));
    if(ready) COMBO.play(cn, null, vol!=null?{vol}:undefined); else if((tries||0)<20) setTimeout(()=>sfx(k, vol, (tries||0)+1), 50);
    return;
  }
  if(!SND.ac || SND.muted) return; const list = SND.bufs[k];
  if(!list||!list.length){ if(k==='start') SND.pending.push(k); return; }
  const now = SND.ac.currentTime; if(SND.last[k] && now-SND.last[k] < 0.06) return; if(SND.voices>16) return;
  SND.last[k] = now;
  const s = SND.ac.createBufferSource(); s.buffer = list[Math.floor(Math.random()*list.length)];
  if(!['start','ui'].includes(k)) s.playbackRate.value = 0.95 + Math.random()*0.1;
  const g = SND.ac.createGain(); g.gain.value = vol==null?1:vol;
  s.connect(g); g.connect(SND.master); SND.voices++; s.onended=()=>SND.voices--; s.start();
}
window.addEventListener('pointerdown', audioInit, {capture:true});
window.addEventListener('keydown', audioInit, {capture:true});

// ---------- 事件 → 动画 / 特效 / 音效 ----------
// 打击感：顿帧、方向震屏、击退、受击压扁 + 闪白、伤害数字；特效每次命中 = 多层叠加：
//   命中闪（白核）→ 冲击环 → 主体序列帧（水花 / 星星 / 火）→ 速度线火花（受重力、有拖尾）→ 有形状的碎片（水滴、星星、叶子、碎石）
let HITSTOP = 0;
const DMG = [];      // 伤害数字 {lane,p,n,big,t}
const FLASH = [];    // 命中闪光 {x,y,t,img,size,life,color}
const PARTS = [];    // 粒子（屏幕坐标）
function hitFx(e, big){ const v=VIS.get(e); if(v){ v.squash=0.12; v.kb=(v.kb||0)+(big?0.14:0.06); v.hitFlash=0.11; } }
function hitPoint(e){ const v=VIS.get(e), f=feet(e.lane,e.p+((v&&v.kb)||0)+((v&&v.back)||0)); return {x:f.x, y:f.y-((v&&v.dh)?v.dh*0.5:L.cs*0.4)}; }
function shakeDir(amp, t, dir, hold){ if(amp*(dir?1:1) >= (shake.t>0?shake.amp:0)) shake={t:t||0.2, amp, dx:dir?dir.x:0, dy:dir?dir.y:0, t0:t||0.2, hold:!!hold}; }   // hold（game-test 试改）：前半段保持满幅，后半段再衰减
function flashAt(x,y,size,life,imgName,color){ FLASH.push({x,y,t:0,size,life:life||0.12,img:imgName||'Image_Effect_Light02',color}); }
const R01=()=>Math.random();
// 速度线火花：沿 dir 方向扇形喷出，带拖尾、受重力
function sparks(x,y,n,dir,spread,speed,color,life){
  const a0=Math.atan2(dir.y,dir.x);
  for(let i=0;i<n;i++){ const a=a0+(R01()-0.5)*spread, v=speed*(0.55+R01()*0.6)*L.cs;
    PARTS.push({kind:'streak', x,y, vx:Math.cos(a)*v, vy:Math.sin(a)*v, g:L.cs*5, t:0, life:(life||0.25)*(0.6+R01()*0.7), w:L.cs*(0.025+R01()*0.02), color}); }
}
// 有形状的碎片：贴图粒子，旋转、下落、落地弹一下
function chunks(x,y,n,imgPath,size,speed,o){
  o=o||{}; const floor=y+(o.floor??L.cs*0.4);
  for(let i=0;i<n;i++){ const a=(o.a0??-Math.PI/2)+(R01()-0.5)*(o.spread??2.4), v=speed*(0.5+R01()*0.7)*L.cs;
    PARTS.push({kind:'chunk', x,y, vx:Math.cos(a)*v, vy:Math.sin(a)*v, g:L.cs*(o.g??9), t:0, life:(o.life||0.6)*(0.7+R01()*0.6), img:imgPath, size:size*L.cs*(0.6+R01()*0.6),
      rot:R01()*6, vr:(R01()-0.5)*14, floor, bounce:o.bounce??0.35, add:!!o.add, fade:o.fade??0.35}); }
}
function vfxXY(name, x, y, size, o){ VFX.push(Object.assign({name, x, y, t:0, size, rot:0, alpha:1}, o||{})); }
function fwd(){ return L.forward; }

// 事件位置：x,y = 命中点（身体中间）；gx,gy = 脚下地面（“地面”层放这里）
function atE(e){ const v=VIS.get(e), p=hitPoint(e), g=feet(e.lane, e.p+((v&&v.kb)||0)+((v&&v.back)||0)); return {x:p.x, y:p.y, gx:g.x, gy:g.y, dir:fwd()}; }
function atPet(pet, h){ const f=feet(pet.lane,pet.col+0.5); return {x:f.x, y:f.y-L.cs*h, gx:f.x, gy:f.y, dir:fwd()}; }
const FX = {
  // 金鱼出手：嘴前小水花 + 短“啵”
  shoot(pet){ const s=feet(pet.lane,pet.col+0.8); COMBO.play('水弹-出手-T1', {x:s.x, y:s.y-L.cs*0.38, dir:fwd()}); },
  // 水弹命中 T1：无顿帧
  water(e){ COMBO.play('水弹-命中-T1', atE(e)); hitFx(e,false); },
  // 巴哥咬 T2：局部顿帧（巴哥 + 被咬的怪）
  bite(pet, e){ COMBO.play('咬-命中-T2', atE(e), {freeze:[visOf(pet,true), VIS.get(e)]}); hitFx(e,true); },
  // 火蜥蜴喷火 T2：火焰从嘴前沿前进方向铺 2 格；命中小火爆在第 2 格
  fire(pet, hits){ const m=feet(pet.lane,pet.col+0.8), far=hits.length?hits.reduce((a,b)=>b.p>a.p?b:a):null;   // 命中火爆放在打到的最远那只怪身上；没打到就只播火焰
    COMBO.play('喷火-T2', {x:m.x, y:m.y-L.cs*0.3, dir:fwd(), target2:far?atE(far):null}, {freeze:[visOf(pet,true), ...hits.map(e=>VIS.get(e))]});
    for(const e of hits) hitFx(e,false); },
  // 怪死亡 T2；精英升 T4（全屏顿帧 + 震屏），特效放大 1.5 倍
  // 61 版（用户 2026-11-14「Boss 死亡不需要震屏」）：精英死亡仍用 T4 的全屏顿帧，但不震屏
  death(e){ const elite=e.def.role==='elite'; COMBO.play('怪死亡', atE(e), elite?{tier:'T4', scale:1.5, noShake:true}:{freeze:[VIS.get(e)]}); },
  // 炸弹 T4：铺满 3 格 + 全屏顿帧 + 震屏
  boom(pet){ const s=L.toScreen(pet.lane,pet.col+0.5), gy=s.y+L.cs*FEET; COMBO.play('炸弹-爆炸-T4', {x:s.x, y:gy-L.cs*0.2, gx:s.x, gy, dir:fwd()}); },
};

HOOKS.push((type, d)=>{
  if(!READY) return;
  switch(type){
    case 'start': sfx('start'); break;
    case 'tutStep': sfx('alert'); TUT_T0=performance.now(); break;
    case 'enrage': { const v=visOf(d.e,false); v.squash=0.12; floatText(d.e.lane, d.e.p, '发怒', '#ff6a3d', 13); COMBO.play('发怒', atE(d.e)); break; }
    case 'place': { const v=visOf(d.pet,true); v.drop=0.16; break; }   // 落地那一刻才播「放置」（drawPet 里）
    case 'move': { const mv=d.pet.move, o=mv?feet(mv.fl,mv.fc+0.5):feet(d.lane,d.col+0.5); COMBO.play('移动', {x:o.x, y:o.y-L.cs*0.1});   // 拿起：轻嗖 + 小烟团
      for(const p of [d.pet,d.other]) if(p) petPlay(p,'Walk','Idle'); COMBO.later(0.36, ()=>{ const f=feet(d.lane,d.col+0.5); COMBO.play('放置', {x:f.x, y:f.y-L.cs*0.1}); }); break; }   // 落下复用「放置」
    case 'sell': { const p=d.pet, f=feet(p.lane,p.col+0.5); corpses.push({v:visOf(p,true), lane:p.lane, p:p.col+0.5, t:0, isPet:true});
      COMBO.play('卖出', {x:f.x, y:f.y-L.cs*0.25}); break; }
    case 'attackStart': petPlay(d.pet,'Attack','Idle'); break;   // 起手：只播动画
    case 'shoot': FX.shoot(d.pet); break;   // 出手那一帧
    case 'melee': {
      const p=d.pet; const v=visOf(p,true); v.lunge=0.15;   // 动画已在起手时开始，这里是出手那一帧
      if(p.key==='lizard') FX.fire(p, d.hits);
      else for(const e of d.hits) FX.bite(p, e);   // 咬空了不出声、不出特效
      break; }
    case 'projhit': FX.water(d.e); break;
    case 'burnTick': DMG.push({lane:d.e.lane, p:d.e.p, n:Math.round(d.dmg), burn:true, t:0, dx:(Math.random()-0.5)*0.4}); break;   // 灼烧：小号橙红数字
    case 'propBite': { const v=visOf(d.e,false); monAttackFx(d.e, v, d.c); v.freeze=Math.max(v.freeze||0, 2/60); break; }   // 怪咬道具（受击音和木屑由 crate 事件出）
    case 'propShard': { const s=L.toScreen(d.c.lane,d.c.col+0.5); COMBO.play('碎片-获得', {x:s.x, y:s.y}); flyers.push({from:{x:s.x,y:s.y}, t:-0.25, life:0.7, to:'shard', key:d.key}); LASTSHARD=d.key; break; }
    case 'hit': if(d.dmg>=1) DMG.push({lane:d.e.lane, p:d.e.p, n:Math.round(d.dmg), big:d.mult>1, t:0, dx:(Math.random()-0.5)*0.3}); break;
    case 'biteStart': { const v=visOf(d.e,false); v.state='Attack'; v.m.play('Attack',{restart:true, onEnd:()=>{ v.state=null; }}); break; }
    case 'bite': { const v=visOf(d.e,false);
      monAttackFx(d.e, v, d.pet);
      const pv=visOf(d.pet,true); pv.squash=0.1; pv.hitFlash=0.08;
      COMBO.play('怪咬宠物-T2', atPet(d.pet,0.55), {freeze:[v, pv]}); break; }
    case 'death': { const e=d.e; const v=visOf(e,false); v.m.play('Dead',{restart:true}); corpses.push({v, lane:e.lane, p:e.p, t:0, isPet:false});
      FX.death(e); break; }
    case 'petdeath': { const p=d.pet, f=feet(p.lane,p.col+0.5); corpses.push({v:visOf(p,true), lane:p.lane, p:p.col+0.5, t:0, isPet:true});
      COMBO.play('宠物死亡', atPet(p,0.3), {freeze:[visOf(p,true)]}); break; }
    case 'boom': FX.boom(d.pet); break;
    case 'crate': { const s=L.toScreen(d.c.lane,d.c.col+0.5), y=s.y+L.cs*FEET-L.cs*0.3;
      if(d.broken){ vfxXY('puff',s.x,y,1.1); sparks(s.x,y,9,{x:0,y:-1},4,4.5,'#d89a55',0.4); sfx('crateBreak'); shakeDir(0.03,0.15); }
      else { flashAt(s.x,y,0.6,0.08); sparks(s.x,y,3,{x:0,y:-1},2.5,3,'#d89a55',0.25); sfx('crate'); } break; }
    case 'collect': { const o=d.o, s=orbVisual(o); flyers.push({from:{x:s.x,y:s.y}, t:-0.08, life:0.5, to:'energy', value:o.value, side:Math.random()<0.5?-1:1}); PENDING.energy+=o.value; COMBO.play('能量-收取', {x:s.x, y:s.y}); break; }
    case 'shard': { const p=hitPoint(d.e); COMBO.play('碎片-获得', {x:p.x, y:p.y}); flyers.push({from:p, t:-0.25, life:0.7, to:'shard', key:d.e.key}); LASTSHARD=d.e.key; break; }
    case 'produce': { petPlay(d.pet,'Busking','Idle'); const f=feet(d.pet.lane,d.pet.col+0.5); COMBO.play('能量-产出', {x:f.x, y:f.y-L.cs*0.45}); break; }
    case 'sky': SKYLAND.push(...G.orbs.filter(o=>o.fall>0)); break;
    case 'spawn': if(d.e.def.role==='elite'){ sfx('elite'); shakeDir(0.03,0.3); } break;
    case 'bell': shakeDir(0.05,0.35); sfx('bell'); { const s=L.toScreen(d.lane,-0.45); vfxXY('ring_shockwave_white', s.x, s.y, 1.6); } break;
    case 'resonance': sfx('sparkle'); break;
    case 'win': bankShards(); bankCoins(); COMBO.play('胜利', {x:W/2, y:H*0.3, screen:true}); break;
    case 'lose': bankShards(); COMBO.play('失败', null); break;
    case 'ui': sfx('ui'); break;
    case 'deny': sfx('deny'); { const c=CARDFX[d.key]=CARDFX[d.key]||{}; c.shake=0.3; if(d.why==='energy') DENY.energy=0.35; } break;
    case 'mute': SND.muted=!SND.muted; break;
  }
});
// 怪物攻击特效：素材里的 Attack 部件是侧视朝左画的，这里单独画，并旋转到朝向被攻击的目标
const MONFX = [];
function monAttackFx(e, v, pet){
  // 只有挂在 Attack_bone 上的才是特效（熊的爪印）；史莱姆、狐狸等的 Attack 部件是身体，随动画本身播放
  const node=v.m.def.nodes.find(n=>n.spr && n.path && n.path.indexOf('Attack_bone/')===0); if(!node) return; const fr=v.m.def.frames[node.spr]; if(!fr) return;
  const from=hitPoint(e), f=feet(pet.lane,pet.col+0.5), to={x:f.x, y:f.y-L.cs*0.45};
  const dir=Math.atan2(to.y-from.y, to.x-from.x), [s]=charScale(v);
  MONFX.push({img:v.m.img, fr, x:from.x+(to.x-from.x)*0.7, y:from.y+(to.y-from.y)*0.7, rot:dir-Math.PI, s:s*0.9, t:0, life:0.3});
}
function drawMonFx(dt){
  for(const m of MONFX){ m.t+=dt; const k=m.t/m.life; if(k>=1){ m.done=true; continue; }
    const [ax,ay,w,h]=m.fr, sc=m.s*(0.8+0.35*Math.min(1,k*4)), a=k<0.6?1:1-(k-0.6)/0.4;
    ctx.save(); ctx.globalAlpha=a; ctx.translate(m.x,m.y); ctx.rotate(m.rot); ctx.drawImage(m.img, ax,ay,w,h, -w*sc/2,-h*sc/2, w*sc,h*sc); ctx.restore(); }
  for(let i=MONFX.length-1;i>=0;i--) if(MONFX[i].done) MONFX.splice(i,1);
}
const SKYLAND = [];   // 天降能量落地时补一个音效和小水波
const EV_SEEN = new Set();
function watchEvents(){
  for(const o of SKYLAND) if(o.fall<=0 && !o.landed){ o.landed=true; const s=orbScreen(o), gy=s.y+L.cs*0.2;
    COMBO.play('能量-掉落', {x:s.x, y:gy-L.cs*0.15, gx:s.x, gy}); }   // 金色星爆 + 贴地压扁的烟团
  for(let i=SKYLAND.length-1;i>=0;i--) if(SKYLAND[i].landed) SKYLAND.splice(i,1);
  EVENTS.forEach((ev,i)=>{ if(G.t>=ev.t && !EV_SEEN.has(i)){ EV_SEEN.add(i); if(ev.kind==='banner') COMBO.play('警钟', null); else sfx('alert'); } });
  if(G.t<1) EV_SEEN.clear();
}

// =====================================================================
// 以下是素材版 3 的场景与界面：全部用素材拼，代码只做摆放、着色和九宫格拉伸
// 参考：GUI Pro Super Casual 自带的 Play / Result 演示界面 + 塔塔冒险队战斗界面
// =====================================================================
const gui = n => img('gui/'+n+'.png');
// 39 版（用户 2026-11-13：费用图标和战斗里不一样）：能量图标只在这里定义一次，战斗（卡片价格、能量条、能量球、飞行）和宠物详情的「费用」都每帧读它；
//   以后要换（包括局内换），只改 ENERGY_ICON.path，所有地方自动一致。
const ENERGY_ICON = { path:'gui/UI_Etc/ResourceBar_Single_Icon_Energy.png' }; window.ENERGY_ICON = ENERGY_ICON;
const energyIcon = () => img(ENERGY_ICON.path);
// 41 版（用户 2026-11-13：金币和星星大小、画风不一致）：金币图标也只定义一次，营地资源条、结算奖励都读它；图都裁掉透明边，按可见大小显示
const COIN_ICON = { path:'icons/Economy_Coin_03_Gold_trim.png' };   // 用户 2026-11-13 从候选选定（Minimal Economy_Coin_03_Gold，裁掉透明边） window.COIN_ICON = COIN_ICON;
const coinIcon = () => img(COIN_ICON.path);
const PRELOAD = [
  'env1/Ork.png','env1/Stone_Gray1_06.png',
  ...['Economy_Energy_01_Yellow','Economy_Gem_01_Purple','Item_Bell_01_Gold','Item_Bell_01_Silver','Gear_Weapons_Shovel_01','Misc_Fire_01_Red','Misc_Leaf_01_Green','Economy_Water_01_Blue','Misc_Snowflake_01','Misc_Clover_01_Green','Misc_Sun_01','Misc_Leaf_01_Green'].map(n=>'icons/'+n+'.png'),
  ...['Frame/ItemFrame03_Single_Red','Frame/ItemFrame03_Single_Blue','Frame/ItemFrame03_Single_Green','Frame/ItemFrame03_Single_Yellow','Frame/ItemFrame03_Single_Purple','Frame/ItemFrame03_Single_Gray','Frame/ItemFrame03_Single_Navy',
      'Frame/ItemFrame02_Single_Navy','Frame/ItemFrame00~03_BgGlow','Frame/ItemFrame00~03_FocusLine','Frame/BasicFrame_Round24','Frame/CardFrame04_Glow',
      'UI_Etc/ResourceBar_Single_Bg','UI_Etc/ResourceBar_Single_Icon_Energy','UI_Etc/ResourceBar_Single_Icon_Monster','UI_Etc/ResourceBar_Single_Icon_Gem','UI_Etc/ResourceBar_Single_Icon_Coin',
      'UI_Etc/Alert_Circle_l_Bg','UI_Etc/Alert_Circle_l_Border','UI_Etc/Alert_Circle_Icon_Exclamation',
      'Button/Button_Round03_Dark','Button/Button01_l_Yellow','Button/Button01_l_Green',
      'Slider/Slider_Basic01_Bg_Single','Slider/Slider_Basic01_Fill_Green','Slider/Slider_Basic01_Fill_Yellow','Slider/Slider_Basic01_Fill_Blue','Slider/Slider_Basic01_Fill_White','Slider/Slider_Basic02_Bg','Slider/Slider_Basic02_Fill_Green',
      'Slider/Slider_StageHorizontal_Icon_s_Yellow','Slider/Slider_StageHorizontal_Icon_s_White1',
      'Label/Title_Ribbon01_Blue','Label/Title_Ribbon01_Red','Label/Title_Ribbon01_Orange','Label/Label_Parallelogram_Red','Label/Label_Parallelogram_Blue','Label/Label_Parallelogram_Green','Label/Label_Parallelogram_Yellow',
      'Popup/Popup01_Basic_Single',
      'Image_Effect_Star01_Blue','Image_Effect_Star01_Yellow','Image_Effect_Light02','Image_Warning1','Image_Warning2','IconMisc/Icon_Pause','IconMisc/Icon_Megaphone','IconMisc/Icon_Star_On','IconMisc/Icon_Star_Off','IconMisc/Icon_Coin','IconMisc/Icon_Gem','IconMisc/Icon_Skip','IconMisc/Icon_Timer','IconMisc/Icon_Back','IconMisc/Icon_Close01'
     ].map(n=>'gui/'+n+'.png'),
];

// ---------- 字体：GUI 包自带的 Sen ExtraBold（数字和英文），中文用系统粗体 ----------
const FONT = '"Sen", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
async function loadFont(){
  try { const bin = atob(window.FONT_SEN||''); const u8 = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
        const f = new FontFace('Sen', u8.buffer); await f.load(); document.fonts.add(f); if(window.PIXICTX && PIXICTX.fontsChanged) PIXICTX.fontsChanged(); } catch(e){ console.warn('字体', e.message); }
}

// ---------- 画图小工具 ----------
function rr(x,y,w,h,r){ r=Math.max(0,Math.min(r,w/2,h/2)); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
// 游戏字：白字 + 深色描边（Super Casual 的统一字效）
const DYN_TEXT = !/[?&]dyn=0\b/.test(location.search);   // 61 版：会动的字不每帧重画（?dyn=0 回到原样）
function text(s,x,y,size,color,align,weight,stroke){
  ctx.font=`800 ${size}px ${FONT}`; ctx.textAlign=align||'center'; ctx.textBaseline='middle';
  if(stroke!==false){ ctx.lineJoin='round'; ctx.lineWidth=Math.max(2,size*0.22); ctx.strokeStyle=stroke||'#1e2236'; ctx.strokeText(s,x,y); }
  ctx.fillStyle=color||'#fff'; ctx.fillText(s,x,y);
}
// 61 版：会变的数字（能量、伤害）按「位图字体」的办法画——每个数字字符的图只画一次存起来，数字怎么变、怎么缩放都只是摆这几张图，
//        不再每出现一个新数值就重画一张再上传（真机记录里每秒 10 来次重画、显存图一路涨的来源）。先描完所有字符的边再填色，和整串一起画的叠放顺序一样。
const NUMADV = new Map();
function numText(s, x, y, size, color, align, scale){
  s=String(s); scale=scale||1;
  if(!(DYN_TEXT && ctx.__dynText)){ text(s, x, y, size*scale, color, align); return; }
  size=Math.round(size*4)/4; ctx.font=`800 ${size}px ${FONT}`;
  let w=0; const adv=[]; for(const ch of s){ const k=size+ch; let a=NUMADV.get(k); if(a===undefined){ a=ctx.measureText(ch).width; if(NUMADV.size>4000) NUMADV.clear(); NUMADV.set(k,a); } adv.push(a); w+=a; }
  ctx.save(); ctx.translate(x,y); if(scale!==1) ctx.scale(scale,scale); ctx.__dynText(scale);
  const x0 = align==='left' ? 0 : align==='right' ? -w : -w/2; ctx.textAlign='left'; ctx.textBaseline='middle';
  ctx.lineJoin='round'; ctx.lineWidth=Math.max(2,size*0.22); ctx.strokeStyle='#1e2236';
  let cx=x0, i=0; for(const ch of s){ ctx.strokeText(ch, cx, 0); cx+=adv[i++]; }
  ctx.fillStyle=color||'#fff'; cx=x0; i=0; for(const ch of s){ ctx.fillText(ch, cx, 0); cx+=adv[i++]; }
  ctx.__dynText(0); ctx.restore();
}
// 61 版：火花线条用一张小胶囊图旋转 / 拉伸来摆，不再每条线每帧各画一张图
const STREAK = new Map();
function streakImg(color){ let c=STREAK.get(color); if(!c){ c=document.createElement('canvas'); c.width=48; c.height=12; const g=c.getContext('2d'); g.strokeStyle=color; g.lineCap='round'; g.lineWidth=10; g.beginPath(); g.moveTo(6,6); g.lineTo(42,6); g.stroke(); if(STREAK.size>64) STREAK.clear(); STREAK.set(color,c); } return c; }
function drawImg(im, x, y, w, h, flip, alpha){
  if(!ok(im)) return;
  if(flip||alpha!=null){ ctx.save(); if(alpha!=null) ctx.globalAlpha*=alpha; if(flip){ ctx.translate(x+w,y); ctx.scale(-1,1); ctx.drawImage(im,0,0,w,h); } else ctx.drawImage(im,x,y,w,h); ctx.restore(); }
  else ctx.drawImage(im,x,y,w,h);
}
function drawImgH(im, cx, by, h, flip, alpha){ if(!ok(im)) return 0; const w = h*im.naturalWidth/im.naturalHeight; drawImg(im, cx-w/2, by-h, w, h, flip, alpha); return w; }
function drawImgC(im, cx, cy, size, alpha){ if(!ok(im)) return; const s=size/Math.max(im.naturalWidth,im.naturalHeight); drawImg(im, cx-im.naturalWidth*s/2, cy-im.naturalHeight*s/2, im.naturalWidth*s, im.naturalHeight*s, false, alpha); }
// 九宫格
// 36 版（用户 2026-11-13：手机上卡片冷却结束、点暂停时有横线竖线闪过，电脑上没有）：
//   九宫格是 9 块分开贴的，按钮 / 卡片 / 弹窗做缩放动画时，块与块的接缝落在半个像素上，手机 GPU 会露出细缝（横线、竖线）。
//   根本改法：九宫格先在离屏画布上按当前清晰度拼成一整张，再一次贴上去 —— 一张图没有接缝，怎么缩放都不会露线。
//   轴对齐时贴图位置对齐整设备像素（最多挪 0.5 个物理像素）；有旋转（碎片菱形）时按当前变换整张贴。
const NINE_CACHE = new WeakMap(), NINE_MAPS = []; let NINE_CNT = 0;
function nineCached(im, key, x, y, w, h, paint){
  if(w<=0.01 || h<=0.01) return true;
  const m=ctx.getTransform(), kx=Math.hypot(m.a,m.b), ky=Math.hypot(m.c,m.d);
  if(!(kx>0 && ky>0)) return false;
  const pw=Math.max(1, Math.round(w*kx)), ph=Math.max(1, Math.round(h*ky));
  if(pw*ph > 2600*2600) return false;
  let per=NINE_CACHE.get(im); if(!per){ per=new Map(); NINE_CACHE.set(im, per); NINE_MAPS.push(per); }
  const k=pw+'x'+ph+'|'+key; let c=per.get(k);
  if(!c){
    if(NINE_CNT>800){ for(const q of NINE_MAPS){ for(const cc of q.values()){ cc.width=0; cc.height=0; } q.clear(); } NINE_CNT=0; }   // 44 版：原来只清当前这张图的缓存，其他图的一直留着   // 尺寸一直在变的动画：别无限增长
    c=document.createElement('canvas'); c.width=pw; c.height=ph; const g=c.getContext('2d');
    g.setTransform(pw/w, 0, 0, ph/h, 0, 0); const save=ctx; ctx=g; try{ paint(); } finally { ctx=save; }
    per.set(k, c); NINE_CNT++;
  }
  if(m.b===0 && m.c===0 && m.a>0 && m.d>0){ ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(c, Math.round(m.a*x+m.e), Math.round(m.d*y+m.f)); ctx.restore(); }
  else ctx.drawImage(c, x, y, w, h);
  return true;
}
function nine(im, x, y, w, h, b, db){
  if(!ok(im)) return;
  const W0=im.naturalWidth, H0=im.naturalHeight, dbv=db==null?b:db;
  const kx=Math.hypot(ctx.getTransform().a, ctx.getTransform().b), ky=Math.hypot(ctx.getTransform().c, ctx.getTransform().d);
  if(nineCached(im, 'n|'+b+'|'+(Math.min(dbv,w/2)*kx).toFixed(3)+'|'+(Math.min(dbv,h/2)*ky).toFixed(3), x, y, w, h, ()=>nineRaw(im, 0, 0, w, h, b, db))) return;
  nineRaw(im, x, y, w, h, b, db);
}
function nineRaw(im, x, y, w, h, b, db){
  if(!ok(im)) return; const W0=im.naturalWidth, H0=im.naturalHeight; const bx=Math.min(b,W0/2-0.5), by=Math.min(b,H0/2-0.5);
  db = db==null ? b : db; const dbx=Math.min(db*bx/b,w/2), dby=Math.min(db*by/b,h/2);
  const sx=[0,bx,W0-bx,W0], sy=[0,by,H0-by,H0], dx=[x,x+dbx,x+w-dbx,x+w], dy=[y,y+dby,y+h-dby,y+h];
  for(let i=0;i<3;i++) for(let j=0;j<3;j++){ const sw=sx[i+1]-sx[i], sh=sy[j+1]-sy[j], dw=dx[i+1]-dx[i], dh=dy[j+1]-dy[j];
    if(sw>0&&sh>0&&dw>0&&dh>0) ctx.drawImage(im, sx[i],sy[j],sw,sh, dx[i],dy[j],dw,dh); }
}
// 白色素材着色（Super Casual 的很多部件是白底，按 Unity 里的做法乘上颜色）
const TINT = {};
function tinted(path, color){
  const k=path+'|'+color; if(TINT[k]) return TINT[k]; const im=img(path); if(!ok(im)) return null;
  const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight; const g=c.getContext('2d');
  g.drawImage(im,0,0); g.globalCompositeOperation='multiply'; g.fillStyle=color; g.fillRect(0,0,c.width,c.height);
  g.globalCompositeOperation='destination-in'; g.drawImage(im,0,0); TINT[k]=c; c.complete=true; c.naturalWidth=c.width; c.naturalHeight=c.height; return c;
}
function seeded(seed){ let a=seed>>>0; return ()=>{ a=(a+0x6D2B79F5)|0; let t=Math.imul(a^a>>>15,1|a); t=(t+Math.imul(t^t>>>7,61|t))^t; return ((t^t>>>14)>>>0)/4294967296; }; }

// ---------- 战场 ----------
const FEET = 0.28;
function feet(lane,p){ const s=L.toScreen(lane,p); return {x:s.x, y:s.y + FEET*L.cs}; }
// 战场地面和道具在 scene.js（场景试验-1f 的画法）
function drawCrate(c){
  const cs=L.cs, f=feet(c.lane,c.col+0.5); c.flash=Math.max(0,(c.flash||0)-1/60);
  groundShadow(f.x, f.y, cs*0.62);
  if(c.marked){ const r=L.cellRect(c.lane,c.col), tf=tinted('gui/Frame/ItemFrame00~03_FocusLine.png','#ffd23a'); if(tf){ ctx.globalAlpha=0.65+0.35*Math.sin(G.t*6); nine(tf, r.x+2, r.y+2, cs-4, cs-4, 20, cs*0.22); ctx.globalAlpha=1; } }
  const P=PROPS[c.kind]; drawImgH(img(P.img), f.x+(c.flash>0?(Math.random()-0.5)*cs*0.05:0), f.y+cs*0.04, cs*P.h);   // 和场景同一套素材（2D Minimal）
  if(P.badge) drawImgC(P.energy ? energyIcon() : icon(P.badge),   /* 39 版：能量桶的奖励图标 = 战斗能量图标（ENERGY_ICON），永远一致 */ f.x, f.y-cs*P.h-cs*0.06+Math.sin(G.t*3+c.col)*cs*0.03, cs*0.3);   // 奖励图标：打碎能拿什么
  if(c.hpNow<c.hp) hpBar(f.x, f.y-cs*(P.h+0.3), cs*0.56, c.hpNow/c.hp, 'yellow');
}
function hpBar(cx, y, w, f, kind, hh){
  // 血条：深色底（GUI 包的槽）+ 纯色填充，剩多少就是多少，不用渐变图、不留残影
  const h=hh||Math.min(12,Math.max(8, w*0.16)); f=Math.max(0,Math.min(1,f));
  nine(gui('Slider/Slider_Basic01_Bg_Single'), cx-w/2, y, w, h, 11, h/2);
  const ix=cx-w/2+h*0.2, iy=y+h*0.2, iw=w-h*0.4, ih=h-h*0.4;
  const col = kind==='green' ? ['#5ee05a','#3aa83a'] : kind==='yellow' ? ['#ffd23a','#e0a314'] : kind==='blue' ? ['#4fb4ff','#2a7fd6'] : ['#ff5468','#c92c40'];
  if(f>0){ ctx.save(); rr(ix, iy, iw, ih, ih/2); ctx.clip();
    ctx.fillStyle=col[1]; ctx.fillRect(ix, iy, iw*f, ih);                 // 纯色（下半略深，有一点厚度）
    ctx.fillStyle=col[0]; ctx.fillRect(ix, iy, iw*f, ih*0.55);
    ctx.fillStyle='rgba(255,255,255,.35)'; ctx.fillRect(ix, iy+ih*0.12, iw*f, Math.max(1,ih*0.16));   // 一道细高光
    ctx.restore(); }
}

const EL_HEX = {fire:'#ff6a3d', water:'#3fa8ff', grass:'#5fe05a', light:'#ffd84a', dark:'#b07cff', none:'#cccccc'};
function drawAuras(){
  const cs=L.cs;
  for(const pet of G.pets){ if(!pet.nSame) continue;
    const f=feet(pet.lane,pet.col+0.5), big=pet.group&&pet.group.size>=3; const t=tinted('gui/Frame/ItemFrame00~03_BgGlow.png', EL_HEX[pet.def.el]); if(!t) continue;
    ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha = big ? 0.55+0.2*Math.sin(G.t*5) : 0.35;
    ctx.translate(f.x, f.y-cs*0.05); ctx.scale(1, 0.42); ctx.drawImage(t, -cs*0.62, -cs*0.62, cs*1.24, cs*1.24); ctx.restore();
  }
}
const PARA = {fire:'Red', water:'Blue', grass:'Green', light:'Yellow', dark:'Blue', none:'Blue'};
function drawPet(pet, dt){
  const v = visOf(pet,true), cs=L.cs;
  if(v.freeze>0){ v.freeze-=dt; dt=0; }   // 局部顿帧：只冻结这只宠物（T2/T3）
  let f = feet(pet.lane,pet.col+0.5);
  if(pet.move){ const a=feet(pet.move.fl,pet.move.fc+0.5), k=Math.min(1,pet.move.t/0.4), e=1-(1-k)*(1-k);
    f = {x:a.x+(f.x-a.x)*e, y:a.y+(f.y-a.y)*e - Math.sin(k*Math.PI)*cs*0.3}; }
  if(G.drag && G.drag.kind==='pet' && G.drag.pet===pet && Math.hypot(G.drag.x-G.drag.sx,G.drag.y-G.drag.sy)>8) return;   // 正在被拖走
  if(v.lunge){ v.lunge=Math.max(0,v.lunge-dt); const k=Math.sin(v.lunge/0.15*Math.PI)*cs*0.12; f={x:f.x+L.forward.x*k, y:f.y+L.forward.y*k}; }
  const ground=feet(pet.lane,pet.col+0.5);
  groundShadow(f.x, pet.move?ground.y+(f.y-ground.y)*0.3+cs*0.0:f.y, cs*(pet.def.shape==='mine'?0.5:0.68));
  const alpha = pet.def.shape==='mine' && pet.armT>0 ? 0.55+0.25*Math.sin(G.t*10) : 1;
  if(v.kind==='spine'){ v.st.update(dt); v.st.apply(v.sk); } else v.m.update(dt);
  let mul=1; if(v.pop){ v.pop=Math.max(0,v.pop-dt); mul*=1+Math.sin(v.pop/0.25*Math.PI)*0.1; }
  if(v.drop>0){ v.drop-=dt; const k=clamp01(1-v.drop/0.16); f={x:f.x, y:f.y-cs*0.45*(1-ease.inQuad(k))};
    if(v.drop<=0){ v.squash=0.12; v.pop=0.25; COMBO.play('放置', {x:f.x, y:f.y-cs*0.1}); } }
  v.hitFlash=Math.max(0,(v.hitFlash||0)-dt);
  ctx.save(); if(v.squash){ v.squash=Math.max(0,v.squash-dt); const k=v.squash/0.12; ctx.translate(f.x,f.y); ctx.scale(1+0.12*k,1-0.14*k); ctx.translate(-f.x,-f.y); }
  v.dh = drawV(v, f.x, f.y, {alpha, flip:v.kind==='mon', mul, flash:v.hitFlash>0?0.75:0, cache:!pet.move&&!v.pop&&!v.lunge, fc:true});
  ctx.restore();
  const hpF=pet.hp/pet.maxHp; v.hpGhost += (hpF-v.hpGhost)*Math.min(1,dt*3);
  if(hpF<1 && pet.def.shape!=='mine') hpBar(f.x, f.y-cs*0.06, cs*0.5, hpF, 'green', 7);   // 宠物血条在脚下，和怪物头顶的血条分开
  if(pet.nSame>0){ const lab=gui('Label/Label_Parallelogram_'+PARA[pet.def.el]); const w=cs*0.5, h=cs*0.2;
    nine(lab, f.x-w/2, f.y+cs*0.06, w, h, 18, h*0.45); text('+'+pet.nSame*8+'%', f.x, f.y+cs*0.06+h/2, cs*0.13, '#fff'); }
  if(pet.def.shape==='mine' && pet.armT>0) text('装填 '+Math.ceil(pet.armT), f.x, f.y-cs*0.5, cs*0.15, '#fff');
}

function drawEnemy(e, dt){
  const v = visOf(e,false), cs=L.cs;
  if(v.freeze>0){ v.freeze-=dt; dt=0; }   // 局部顿帧：只冻结这只怪
  if(v.kb){ v.kb=Math.max(0, v.kb-dt*1.2); }
  // 被挡住时画面上稍微退后一点，不和宠物叠成一团（逻辑位置不变）
  v.back = (v.back||0) + ((e.blocked?0.14:0) - (v.back||0))*Math.min(1,dt*8);
  const f=feet(e.lane, e.p + (v.kb||0) + v.back);
  if(!v.state){ const want = (e.blocked || tutCur()) ? 'Idle' : 'Walk'; if(v.cur!==want){ v.m.play(want); v.cur=want; } } else v.cur=null;
  v.m.update(dt*(e.slow>0?0.85:1)*(e.def.speed>0.4||e.rage?1.5:1));
  groundShadow(f.x, f.y, cs*(e.def.role==='elite'?0.95:0.68));
  v.hitFlash=Math.max(0,(v.hitFlash||0)-dt);
  ctx.save(); if(v.squash){ v.squash=Math.max(0,v.squash-dt); const k=v.squash/0.12; ctx.translate(f.x,f.y); ctx.scale(1+0.16*k,1-0.18*k); ctx.translate(-f.x,-f.y); }
  const fl = Math.max(v.hitFlash>0?0.8:0, e.flash>0?0.6:0);
  v.dh = drawV(v, f.x, f.y, {fc:true, flash:fl, tint: e.slow>0 ? 'rgba(120,190,255,.22)' : e.rage ? `rgba(255,60,40,${0.2+0.08*Math.sin(G.t*10)})` : e.burn ? `rgba(255,110,40,${0.12+0.08*Math.sin(G.t*14)})` : null});
  ctx.restore();
  const hpF=e.hp/e.maxHp; v.hpGhost += (hpF-v.hpGhost)*Math.min(1,dt*3);
  const hy=f.y-v.dh-8;
  if(hpF<1 && e.def.role!=='elite') hpBar(f.x, hy, cs*0.62, hpF, 'red', 9);   // 精英的血条在顶部
  // 9 版：删掉灼烧的小火苗序列帧和火星粒子（画风不搭，用户要求删除）；灼烧状态只保留身上的淡橙色闪烁
  if(e.slow>0) drawImgC(icon('Misc_Snowflake_01'), f.x+cs*0.24, f.y-v.dh*0.5, cs*0.22);
}

function drawCorpses(dt){
  for(const c of corpses){ let cdt=dt; if(c.v.freeze>0){ c.v.freeze-=dt; cdt=0; }   // 死亡的局部顿帧
    c.t+=cdt; const f=feet(c.lane,c.p);
    if(c.isPet){ const k=Math.min(1,c.t/0.3); drawV(c.v, f.x, f.y, {alpha:1-k, mul:1-0.6*k, flip:c.v.kind==='mon'}); }
    else { c.v.m.update(cdt); const fade=c.t>0.7?Math.max(0,1-(c.t-0.7)/0.3):1; groundShadow(f.x,f.y,L.cs*0.6,fade); drawV(c.v, f.x, f.y, {fc:true, alpha:fade, flash:c.t<0.08?0.9:0}); }
  }
  for(let i=corpses.length-1;i>=0;i--) if(corpses[i].t>(corpses[i].isPet?0.3:1.0)) corpses.splice(i,1);
}

function drawProj(p){
  const f=feet(p.lane,p.p); COMBO.drawLoop('水弹-飞行', f.x, f.y-L.cs*0.38, G.t, {rot:Math.atan2(L.forward.y,L.forward.x)+Math.PI});   // 组合「水弹-飞行」循环播放；贴图头朝左 → 转到前进方向
}

function drawVFX(dt){
  const cs=L.cs, M=window.VFX_META;
  for(const v of VFX){
    v.t+=dt; if(v.t<0) continue; const m=M[v.name]; if(!m){ v.done=true; continue; } const fi=Math.floor(v.t*m.fps); if(fi>=m.frames){ v.done=true; continue; }
    const im=img('vfx/'+v.name+'.png'); if(!ok(im)) continue;
    let x=v.x, y=v.y; if(x==null){ const s=L.toScreen(v.lane,v.p); x=s.x; y=s.y+cs*FEET+(v.dy||0)*cs; }
    const size=v.size*cs; const h=size*m.h/Math.max(m.w,m.h), w=size*m.w/Math.max(m.w,m.h);
    ctx.save(); ctx.globalAlpha=v.alpha; if(m.additive) ctx.globalCompositeOperation='lighter';
    ctx.translate(x,y); if(v.dir) ctx.rotate(Math.atan2(L.forward.y,L.forward.x)); if(v.rot) ctx.rotate(v.rot);
    if(v.squashY) ctx.scale(1,v.squashY); if(v.flipX) ctx.scale(-1,1);
    ctx.drawImage(im, fi*m.w, 0, m.w, m.h, -w/2, -h/2, w, h); ctx.restore();
  }
  for(let i=VFX.length-1;i>=0;i--) if(VFX[i].done) VFX.splice(i,1);
  // 命中闪：白核 1~2 帧到位，0.1~0.18 秒淡出（快进慢出）；可带颜色
  for(const f of FLASH){ f.t+=dt; const k=f.t/f.life; if(k>=1){ f.done=true; continue; }
    const e=1-Math.pow(1-k,3), im=f.color?tinted('gui/'+f.img+'.png', f.color):gui(f.img);
    ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=(1-k)*(1-k); drawImgC(im, f.x, f.y, cs*f.size*(0.55+0.65*e)); ctx.restore(); }
  for(let i=FLASH.length-1;i>=0;i--) if(FLASH[i].done) FLASH.splice(i,1);
  // 粒子
  for(const p of PARTS){
    p.t+=dt; if(p.t>=p.life){ p.done=true; continue; } const k=p.t/p.life;
    p.vy+=p.g*dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
    if(p.kind==='streak'){
      const sp=Math.hypot(p.vx,p.vy), len=Math.min(cs*0.5, sp*0.045)*(1-k*0.5), ux=p.vx/(sp||1), uy=p.vy/(sp||1);
      ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
      ctx.globalAlpha=1-k; const lw=p.w*(1-k*0.6);
      if(DYN_TEXT && ctx.__dynText){ ctx.translate(p.x,p.y); ctx.rotate(Math.atan2(uy,ux)); ctx.drawImage(streakImg(p.color), -len-lw/2, -lw/2, len+lw, lw);
        const lw2=p.w*0.45*(1-k); if(lw2>0.05) ctx.drawImage(streakImg('#ffffff'), -len*0.5-lw2/2, -lw2/2, len*0.5+lw2, lw2); }
      else { ctx.strokeStyle=p.color; ctx.lineWidth=lw; ctx.beginPath(); ctx.moveTo(p.x-ux*len,p.y-uy*len); ctx.lineTo(p.x,p.y); ctx.stroke();
        ctx.strokeStyle='#ffffff'; ctx.lineWidth=p.w*0.45*(1-k); ctx.beginPath(); ctx.moveTo(p.x-ux*len*0.5,p.y-uy*len*0.5); ctx.lineTo(p.x,p.y); ctx.stroke(); }
      ctx.restore();
    } else {
      if(p.y>p.floor && p.vy>0){ p.y=p.floor; p.vy*=-p.bounce; p.vx*=0.6; p.vr*=0.5; }
      p.rot+=p.vr*dt; const a = k>1-p.fade ? (1-k)/p.fade : 1; const s=p.size*(k<0.1?0.5+5*k:1);
      ctx.save(); if(p.add) ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=a; ctx.translate(p.x,p.y); ctx.rotate(p.rot); drawImgC(img(p.img), 0, 0, s); ctx.restore();
    }
  }
  for(let i=PARTS.length-1;i>=0;i--) if(PARTS[i].done) PARTS.splice(i,1);
}

function orbVisual(o){
  // 天降：一边下落一边晃，落地后弹两下（每次触地压扁）；花产出：从花上跳出一道弧线落到旁边，再弹
  const cs=L.cs, s=orbScreen(o); let x=s.x, y=s.y, sx=1, sy=1, rot=0, tb=-1;
  if(o.fall>0){ rot=Math.sin(o.life*9)*0.25; x+=Math.sin(o.life*5)*cs*0.06; }
  else if(o.produced){ const k=clamp01(o.life/0.45); x+=cs*0.32*ease.outCubic(k); y-=Math.sin(k*Math.PI)*cs*0.6; tb=o.life-0.45; }
  else { if(o.landAt==null) o.landAt=o.life; tb=o.life-o.landAt; }
  if(tb>=0){ const h=Math.abs(Math.sin(tb*Math.PI*2.6))*Math.exp(-tb*4.5); y-=h*cs*0.3; const sq=Math.exp(-tb*7)*Math.max(0,Math.cos(tb*Math.PI*2.6)); sx=1+0.24*sq; sy=1-0.22*sq;
    if(tb>0.8) y+=Math.sin(o.life*4)*cs*0.035; }
  return {x,y,sx,sy,rot};
}
window.orbHitPos = o => orbVisual(o);   // 点击判定和画面用同一个位置
function drawOrbs(){
  const cs=L.cs;
  for(const o of G.orbs){ const v=orbVisual(o); const r=cs*0.3;
    const blink=o.life>4.6?(Math.sin(o.life*22)>0?0.5:1):1, breathe=1+0.08*Math.sin(o.life*6);
    ctx.save(); ctx.globalAlpha=blink;
    const gl=gui('Frame/CardFrame04_Glow'); if(ok(gl)){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.55*blink; const g2=r*1.5*breathe; ctx.drawImage(gl,v.x-g2,v.y-g2,g2*2,g2*2); ctx.restore(); }
    ctx.translate(v.x,v.y); ctx.rotate(v.rot); ctx.scale(v.sx,v.sy); drawImgC(energyIcon(), 0, 0, r*1.8); ctx.restore(); }
}
const PENDING = { energy:0 };   // 已经收了、还在飞的能量：飞到了才加到显示的数字上
const DISP = { energy:null };
function flyTarget(kind){ const it=L.items.find(i=>i.id==='energy'); if(kind==='energy') return {x:it.x+it.h*0.5, y:it.y+it.h/2}; return {x:L.shardPos.x-30, y:L.shardPos.y}; }
function drawFlyers(dt){
  for(const f of flyers){ f.t+=dt; const to=flyTarget(f.to);
    if(f.t<0){ if(f.to==='energy'){ const pre=1+0.35*Math.sin((f.t/0.08+1)*Math.PI); drawImgC(energyIcon(), f.from.x, f.from.y, L.cs*0.54*pre); } continue; }   // 点中：先鼓一下
    const k=Math.min(1,f.t/f.life), e=ease.inQuad(k);                                                     // 越飞越快
    const side=f.side||1, bend=Math.sin(k*Math.PI)*L.cs*1.2;
    const x=f.from.x+(to.x-f.from.x)*e + side*bend*0.6, y=f.from.y+(to.y-f.from.y)*e - bend*0.5; const s=L.cs*(0.54-0.24*k);
    if(f.to==='energy') drawImgC(energyIcon(), x, y, s); else shardIcon(f.key, x, y, s*1.2);
    if(k>=1){ f.done=true; BUMP[f.to]=0.25;
      if(f.to==='energy') PENDING.energy=Math.max(0,PENDING.energy-(f.value||0)); } }

  for(let i=flyers.length-1;i>=0;i--) if(flyers[i].done) flyers.splice(i,1);
}
function drawBells(){
  const cs=L.cs;
  for(let lane=0;lane<LANES;lane++){ if(!laneOn(lane)) continue; const s=L.toScreen(lane,-0.45), on=G.bells[lane]; const ring=G.fx.find(x=>x.kind==='bell'&&x.lane===lane);
    ctx.save(); ctx.translate(s.x, s.y); if(ring) ctx.rotate(Math.sin(ring.t*30)*0.5*(1-ring.t/1.2));
    drawImgC(icon(on?'Item_Bell_01_Gold':'Item_Bell_01_Silver'), 0, 0, cs*0.5, on?1:0.5); ctx.restore(); }
}
function drawPreviewLanes(){
  const cs=L.cs; if(G.over) return;
  for(const ev of EVENTS) if(ev.kind==='preview'&&G.t>=ev.t&&G.t<ev.until){
    for(const lane of ev.lanes){
      const t=tinted('gui/Frame/BasicFrame_Round24.png','#ff3b3b'); const r1=L.cellRect(lane,COLS-1), r2=L.cellRect(lane,0);
      if(t){ ctx.globalAlpha=0.10+0.06*Math.sin(G.t*6); nine(t, r1.x+3, r1.y+3, cs-6, r2.y+cs-r1.y-6, 20, cs*0.3); ctx.globalAlpha=1; }
      const s=L.toScreen(lane,COLS-0.4), bob=Math.sin(G.t*8)*cs*0.04;
      drawImgC(gui('UI_Etc/Alert_Circle_l_Bg'), s.x, s.y+bob, cs*0.5); const bd=tinted('gui/UI_Etc/Alert_Circle_l_Bg.png','#ff3d4f'); if(bd) drawImgC(bd, s.x, s.y+bob, cs*0.44);
      drawImgC(gui('UI_Etc/Alert_Circle_Icon_Exclamation'), s.x, s.y+bob, cs*0.24);
    }
  }
}
function drawPlacement(){
  const cs=L.cs;
  const sel = G.drag&&G.drag.kind==='card' ? G.drag.key : (G.selected&&G.selected!=='shovel'?G.selected:null);
  const dragPet = G.drag&&G.drag.kind==='pet';
  const focus = gui('Frame/ItemFrame00~03_FocusLine');
  if(sel || dragPet){
    ctx.globalAlpha=0.16; for(let lane=0;lane<LANES;lane++) for(let col=0;col<COLS;col++){ if(sel ? !canPlaceAt(lane,col) : !laneOn(lane)) continue; const r=L.cellRect(lane,col); nine(focus, r.x+cs*0.1, r.y+cs*0.1, cs*0.8, cs*0.8, 20, cs*0.18); } ctx.globalAlpha=1;
    const p = dragPet ? {x:G.drag.x,y:G.drag.y} : pointer; const {lane,col}=L.toCell(p.x,p.y);
    if(inGrid(lane,col)){ const r=L.cellRect(lane,col); const good = sel ? canPlaceAt(lane,col) : (G.swaps>=1 && laneOn(lane) && !(tutCur() && !(tutCur().L===lane && tutCur().C===col)));
      const t=tinted('gui/Frame/ItemFrame00~03_FocusLine.png', good?'#ffffff':'#ff4d4d'); if(t) nine(t, r.x+2, r.y+2, cs-4, cs-4, 20, cs*0.22);
      const key = sel || (dragPet && G.drag.pet.key);
      if(good && key && (sel || Math.hypot(G.drag.x-G.drag.sx,G.drag.y-G.drag.sy)>8)) drawRange(DATA.pets[key], lane, col); }
  }
}
// 攻击范围：直射 = 本路前方到底（被道具挡住就停在道具）；近战 = 前方 reach 格；地雷 = 3×3。生产、坦克不显示
function rangeCells(def, lane, col){
  const out=[]; let block=null;
  const line=(to)=>{ for(let c=col+1;c<=Math.min(COLS-1,to);c++){ if(propAlive(cellAt(lane,c))){ block=[lane,c]; break; } out.push([lane,c]); } };
  if(def.shape==='shooter') line(COLS-1);
  else if(def.shape==='melee') line(col+def.reach);
  else if(def.shape==='mine'){ for(let l=lane-1;l<=lane+1;l++) for(let c=col-1;c<=col+1;c++) if(inGrid(l,c)) out.push([l,c]); }
  return {out, block};
}
function drawRange(def, lane, col){
  // 学塔塔冒险队：明亮的浅黄色连续光带（同一路连续的格子连成一条），不按元素换色（火系橙色叠草地会发褐）
  const cs=L.cs, {out, block}=rangeCells(def, lane, col); if(!out.length && !block) return;
  const fill=tinted('gui/Frame/BasicFrame_Round24.png', '#f4ff4a');
  if(fill){ ctx.globalAlpha=0.6+0.08*Math.sin(G.t*5);
    const byLane={}; for(const [l,c] of out) (byLane[l]=byLane[l]||[]).push(c);
    for(const l in byLane){ const cols=byLane[l].sort((a,b)=>a-b); let s=cols[0], prev=cols[0];
      for(let i=1;i<=cols.length;i++){ if(i<cols.length && cols[i]===prev+1){ prev=cols[i]; continue; }
        const r1=L.cellRect(+l,s), r2=L.cellRect(+l,prev), x0=Math.min(r1.x,r2.x), y0=Math.min(r1.y,r2.y), x1=Math.max(r1.x+r1.w,r2.x+r2.w), y1=Math.max(r1.y+r1.h,r2.y+r2.h);
        nine(fill, x0+2, y0+2, x1-x0-4, y1-y0-4, 20, cs*0.22); if(i<cols.length){ s=cols[i]; prev=cols[i]; } } }
    ctx.globalAlpha=1; }
  if(block){ const r=L.cellRect(block[0],block[1]), tb=tinted('gui/Frame/ItemFrame00~03_FocusLine.png','#ff8a3d'); if(tb) nine(tb, r.x+2, r.y+2, cs-4, cs-4, 20, cs*0.22); }   // 挡住攻击的道具：橙框
}
// 手指拖着的那只：画在最上层，不透明（半透明会透出底下的格子）
function drawDragGhost(){
  const cs=L.cs, ghostKey = G.drag ? (G.drag.kind==='card'?G.drag.key:G.drag.pet.key) : null;
  if(ghostKey && PORTRAIT[ghostKey] && Math.hypot(G.drag.x-G.drag.sx,G.drag.y-G.drag.sy)>8) ctx.drawImage(PORTRAIT[ghostKey], G.drag.x-cs*0.5, G.drag.y-cs*0.85, cs, cs);
}
function drawDamage(dt){
  const cs=L.cs;
  for(const d of DMG){ d.t+=dt; const k=d.t/0.55; if(k>=1){ d.done=true; continue; } const s=L.toScreen(d.lane,d.p);
    const pop = k<0.15 ? 0.7+2*k : 1; const sz=cs*(d.big?0.3:d.burn?0.17:0.22)*pop;
    ctx.globalAlpha = k>0.6 ? 1-(k-0.6)/0.4 : 1;
    const dx=s.x+d.dx*cs, dy=s.y+cs*FEET-cs*0.95-k*cs*0.45, dc=d.big?'#ffe14d':d.burn?'#ff6a3d':'#ffffff';
    if(DYN_TEXT && ctx.__dynText) numText(d.n, dx, dy, sz/pop, dc, 'center', pop);   // 61 版：数字图只画一次，弹出缩放和上飘交给显卡
    else text(String(d.n), dx, dy, sz, dc);
    ctx.globalAlpha=1; }
  for(let i=DMG.length-1;i>=0;i--) if(DMG[i].done) DMG.splice(i,1);
}
function drawTexts(){
  const cs=L.cs;
  for(const f of G.fx){ if(f.kind!=='text') continue; const k=f.t/f.life; const s=L.toScreen(f.lane,f.p);
    ctx.globalAlpha=1-k*k;
    if(DYN_TEXT && ctx.__dynText){ ctx.save(); ctx.translate(s.x, s.y-cs*0.55-k*cs*0.4); ctx.__dynText(1); text(f.text, 0, 0, Math.max(12,cs*0.2), f.color); ctx.__dynText(0); ctx.restore(); }
    else text(f.text, s.x, s.y-cs*0.55-k*cs*0.4, Math.max(12,cs*0.2), f.color);
    ctx.globalAlpha=1; }
}

// ---------- 界面 ----------
const CARD_COLOR = {fire:'Red', water:'Blue', grass:'Green', light:'Yellow', dark:'Purple', none:'Navy'};
function roundBtn(it, iconImg, label, active){
  const b=BTNFX[it.id]=BTNFX[it.id]||{p:0}; b.p=Math.max(0,b.p-1/60); const sc=b.p>0? 1-0.12*Math.sin((1-b.p/0.16)*Math.PI) : 1;
  ctx.save(); ctx.translate(it.x+it.w/2, it.y+it.h/2); ctx.scale(sc,sc); ctx.translate(-(it.x+it.w/2), -(it.y+it.h/2));
  nine(gui('Button/Button_Round03_Dark'), it.x, it.y, it.w, it.h, 40, it.w*0.3);
  if(iconImg) drawImgC(iconImg, it.x+it.w/2, it.y+it.h*0.46, it.w*0.48);
  if(label) text(label, it.x+it.w/2, it.y+it.h*0.46, it.w*0.34, '#fff');
  if(active){ const t=tinted('gui/Frame/ItemFrame00~03_FocusLine.png','#ffd84a'); if(t) nine(t, it.x-2, it.y-2, it.w+4, it.h+4, 20, it.w*0.3); }
  ctx.restore();
}
function pill(x,y,w,h){ const t=tinted('gui/UI_Etc/ResourceBar_Single_Bg.png','#1b2033'); if(t){ ctx.globalAlpha=0.72; nine(t,x,y,w,h,12,h/2); ctx.globalAlpha=1; } }
function drawCard(it, d, key, sel){
  const bg = gui('Frame/ItemFrame03_Single_'+CARD_COLOR[d.el]);
  nine(bg, it.x, it.y, it.w, it.h, 40, it.w*0.24);
  // 50 版（用户 2026-11-13：「战斗卡的角色起始位置也不一样，按照宠物界面改」）：和宠物页卡片同一套摆法（meta.js 的 cardPortrait / CARD_PET）——
  //   按角色有内容的范围算：大小统一、左右按内容居中、脚底都踩在价格条上方同一条线上。原来是整张方形头像直接贴，各角色留白不同，脚的位置高低不一。
  const cp = typeof cardPortrait==='function' ? cardPortrait({key, owned:true}) : null;
  if(cp && cp.x1>cp.x0){ const Hh=Math.min(CARD_PET.HW*it.w, CARD_PET.W*it.w/cardAspectMax()), sc=Hh/(cp.y1-cp.y0), foot=it.y+it.h*0.82, ds=cp.c.width*sc;
    ctx.drawImage(cp.c, it.x+it.w/2-(cp.x0+cp.x1)/2*sc, foot-cp.y1*sc, ds, ds); }
  else if(PORTRAIT[key]){ const s=it.w*0.98; ctx.drawImage(PORTRAIT[key], it.x+(it.w-s)/2, it.y-it.h*0.04, s, s); }
  // 50 版（用户 2026-11-13：「稀有度不需要显示，把那个宝石删掉」）：右上角稀有度宝石去掉
  // 价格：卡片下沿的深色小药丸 + 能量图标
  if(sel){ const t=tinted('gui/Frame/ItemFrame00~03_FocusLine.png','#ffe14d'); if(t) nine(t, it.x-4, it.y-4, it.w+8, it.h+8, 20, it.w*0.26); }
  const ph=it.h*0.26, pw=it.w*0.86, px=it.x+(it.w-pw)/2, py=it.y+it.h-ph*0.62;
  pill(px, py, pw, ph);
  drawImgC(energyIcon(), px+ph*0.48, py+ph*0.48, ph*1.05);
  text(d.cost, px+pw*0.6, py+ph*0.5, ph*0.66, '#fff');
}
function drawUI2(){
  // 顶部和底部各一条渐暗，让悬浮的界面在任何地图上都看得清
  let g=ctx.createLinearGradient(0,0,0,L.hud.h+20); g.addColorStop(0,'rgba(10,14,30,.55)'); g.addColorStop(1,'rgba(10,14,30,0)'); ctx.fillStyle=g; ctx.fillRect(0,0,W,L.hud.h+20);
  const b=L.bar; g=ctx.createLinearGradient(0,b.y-24,0,H); g.addColorStop(0,'rgba(10,14,30,0)'); g.addColorStop(0.35,'rgba(10,14,30,.62)'); g.addColorStop(1,'rgba(10,14,30,.8)'); ctx.fillStyle=g; ctx.fillRect(0,b.y-24,W,H-b.y+24);
  for(const it of L.items){
    if(it.id==='energy'){ pill(it.x+it.h*0.35, it.y+it.h*0.12, it.w-it.h*0.35, it.h*0.76);
      BUMP.energy=Math.max(0,BUMP.energy-1/60); const bk=BUMP.energy/0.25, bump=bk>0? Math.sin(bk*Math.PI)*0.35 : 0;   // 被打中：弹一下
      const target=G.energy-PENDING.energy; if(DISP.energy==null||!G.started) DISP.energy=target; DISP.energy+=(target-DISP.energy)*0.18; if(Math.abs(target-DISP.energy)<0.5) DISP.energy=target;   // 数字滚动
      const sh=DENY.energy>0? Math.sin(DENY.energy*60)*4*DENY.energy/0.35 : 0; DENY.energy=Math.max(0,DENY.energy-1/60);   // 能量不够：变红抖动
      drawImgC(energyIcon(), it.x+it.h*0.42+sh, it.y+it.h/2, it.h*1.05*(1+bump));
      numText(Math.round(DISP.energy), it.x+it.h*0.85+(it.w-it.h*0.85)/2+sh, it.y+it.h/2, it.h*0.5, DENY.energy>0?'#ff6b6b':'#fff', 'center', 1+bump*0.4); }
    if(it.id==='card'){ const d=DATA.pets[it.key]; const okE=G.energy>=d.cost; const cd=G.cooldown[it.key]; const sel=G.selected===it.key;
      const c=CARDFX[it.key]=CARDFX[it.key]||{}; const dt1=1/60;
      if(c.prevCd>0 && cd<=0) c.ready=0.3; c.prevCd=cd;
      c.press=Math.max(0,(c.press||0)-dt1); c.shake=Math.max(0,(c.shake||0)-dt1); c.ready=Math.max(0,(c.ready||0)-dt1);
      let sc=1; if(c.press>0){ const k=1-c.press/0.18; sc = k<0.35 ? 1-0.1*(k/0.35) : 0.9+0.1*ease.outBack((k-0.35)/0.65, 3); }   // 按下缩、松开回弹过头一点
      if(c.ready>0) sc*=1+Math.sin((1-c.ready/0.3)*Math.PI)*0.12;
      const sx=c.shake>0? Math.sin(c.shake*55)*5*c.shake/0.3 : 0;
      ctx.save(); if(sel) ctx.translate(0,-it.h*0.1); ctx.translate(it.x+it.w/2+sx, it.y+it.h/2); ctx.scale(sc,sc); ctx.translate(-(it.x+it.w/2), -(it.y+it.h/2));
      drawCard(it, d, it.key, sel);
      if(cd>0 || !okE){ const t=tinted('gui/Frame/BasicFrame_Round24.png','#0d1020'); if(t){ const f = cd>0 ? cd/d.cd : 1;
        // 36 版：冷却快结束时遮罩只剩卡底一条细带，看起来像一道黑线闪过 → 最后 8% 的冷却里遮罩逐渐变淡，不留细带；裁剪不再上下多扩 2 像素
        ctx.globalAlpha = (cd>0?0.6:0.42) * (cd>0 && okE ? Math.min(1, f/0.08) : 1);
        ctx.save(); ctx.beginPath(); ctx.rect(it.x-2, it.y+it.h*(1-f), it.w+4, it.h*f); ctx.clip(); nine(t, it.x+2, it.y+2, it.w-4, it.h-4, 20, it.w*0.22); ctx.restore(); ctx.globalAlpha=1; }
        if(cd>0) text(Math.ceil(cd), it.x+it.w/2, it.y+it.h*0.42, it.w*0.32, '#fff'); }
      ctx.restore(); }
    if(it.id==='pause') roundBtn(it, gui('IconMisc/Icon_Pause'), null, G.paused);
    if(it.id==='speed') roundBtn(it, null, '×'+G.speed, G.speed>1);
    if(it.id==='mute'){ roundBtn(it, gui('IconMisc/Icon_Megaphone'), null, false); if(SND.muted) drawImgC(gui('IconMisc/Icon_Close01'), it.x+it.w*0.72, it.y+it.h*0.3, it.w*0.36); }
  }
  // 换阵次数：黄色菱形
  const sb=L.swapBox, sN=G.swapCap||0, sW=sN?56+sN*19-2:0; if(sN){ pill(sb.x, sb.y, sW, sb.h); text('换位', sb.x+26, sb.y+sb.h/2, 12, '#cfe3ff', 'center', 800, false); }   // 65 版：1-3 通关后才有；宽度跟着次数走
  for(let i=0;i<sN;i++) drawImgC(gui(i<G.swaps?'Slider/Slider_StageHorizontal_Icon_s_Yellow':'Slider/Slider_StageHorizontal_Icon_s_White1'), sb.x+56+i*19, sb.y+sb.h/2, 18, i<G.swaps?1:0.35);
  // 波次：「第 N/4 波」+ 进度条（走过的波次点亮）；精英 / Boss 出场后，这条换成它的血条
  const wb=L.waveBar, dur=DATA.level.duration; const clock=`${Math.floor(G.t/60)}:${String(Math.floor(G.t%60)).padStart(2,'0')}`;
  const nWave=WAVE_MARKS.filter(m=>G.t>=m).length, boss=G.enemies.find(e=>e.def.role==='elite'&&!e.dead);
  numText(clock, W/2, 30+(L.hudTop||0), 22, '#fff', 'center');   // 61d：计时每秒变一次，按字符贴图，不再每秒重画一张
  if(boss){
    text(shardName(boss.key), W/2, wb.y-7, 12, '#ffd36b', 'center', 800, false);
    hpBar(wb.x+wb.w/2, wb.y, wb.w, boss.hp/boss.maxHp, 'red', 14);
    drawImgC(gui('UI_Etc/ResourceBar_Single_Icon_Monster'), wb.x+wb.w, wb.y+7, 24);
  } else {
    text(nWave===0?'准备':`第 ${nWave}/${WAVE_MARKS.length} 波`, W/2, wb.y-7, 12, '#cfe3ff', 'center', 800, false);
    hpBar(wb.x+wb.w/2, wb.y, wb.w, G.t/dur, 'green', 14);
    WAVE_MARKS.forEach((m,i)=>{ const x=wb.x+wb.w*m/dur, last=i===WAVE_MARKS.length-1, on=G.t>=m;
      drawImgC(gui(last?'UI_Etc/ResourceBar_Single_Icon_Monster':(on?'Slider/Slider_StageHorizontal_Icon_s_Yellow':'Slider/Slider_StageHorizontal_Icon_s_White1')), x, wb.y+7, last?24:14, on?1:0.8); });
  }
  const total=Object.values(G.shards).reduce((a,b)=>a+b,0);
  if(total>0){ pill(L.shardPos.x-34, L.shardPos.y-11, 68, 22); BUMP.shard=Math.max(0,BUMP.shard-1/60); shardIcon(LASTSHARD||Object.keys(G.shards)[0], L.shardPos.x-22, L.shardPos.y, 24*(1+BUMP.shard)); text(total, L.shardPos.x+10, L.shardPos.y, 13, '#fff'); }
}
const ACT = { red:['#ffb0a8','#ff3b4e','#5a0a1c'], gold:['#fff6a8','#ffb21e','#5a2a00'], gray:['#ffffff','#a3abbd','#262b3a'] };
function actionText(s, cx, cy, size, pal, scale){
  const [c0,c1,ol]=ACT[pal]; ctx.save(); ctx.translate(cx,cy); if(scale) ctx.scale(scale,scale);
  const dyn = scale && scale!==1 && DYN_TEXT && ctx.__dynText; if(dyn) ctx.__dynText(scale);   // 61 版：弹出缩放期间不每帧重画大字
  ctx.font=`900 ${size}px ${FONT}`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.lineJoin='round';
  ctx.fillStyle='rgba(0,0,0,.35)'; ctx.fillText(s, 0, size*0.1);                                   // 投影
  ctx.lineWidth=size*0.26; ctx.strokeStyle=ol; ctx.strokeText(s, 0, 0);                            // 外描边
  const g=ctx.createLinearGradient(0,-size*0.5,0,size*0.45); g.addColorStop(0,c0); g.addColorStop(0.55,c1); g.addColorStop(1,c1);
  ctx.fillStyle=g; ctx.fillText(s, 0, 0);
  if(dyn) ctx.__dynText(0);
  ctx.restore();
}
// 大波来袭：不是结算缎带，是战斗中的警告——红色三角警示牌弹出 + 红色大字 + 屏幕边缘红光脉冲
function drawWaveWarning(t, life){
  const k=Math.min(1,t/0.25), pop=k<1? 1.35-0.35*(1-(1-k)*(1-k)) : 1, fade=t>life-0.4?(life-t)/0.4:1;
  ctx.save(); ctx.globalAlpha=Math.max(0,fade);
  const pulse=0.5+0.5*Math.sin(t*9);                                                                // 边缘红光
  for(const [x0,y0,x1,y1] of [[0,0,0,H*0.18],[0,H,0,H*0.82]]){ const g=ctx.createLinearGradient(x0,y0,x1,y1); g.addColorStop(0,'rgba(255,40,60,1)'); g.addColorStop(1,'rgba(255,40,60,0)'); ctx.fillStyle=g;
    ctx.globalAlpha=Math.max(0,fade)*(0.28+0.18*pulse); ctx.fillRect(0,Math.min(y0,y1),W,Math.abs(y1-y0)); ctx.globalAlpha=Math.max(0,fade); }   // 61 版：闪烁用整体透明度，渐变图不用每帧重画
  const cy=H*0.42, band=ctx.createLinearGradient(0,0,W,0); band.addColorStop(0,'rgba(40,0,12,0)'); band.addColorStop(0.2,'rgba(40,0,12,.55)'); band.addColorStop(0.8,'rgba(40,0,12,.55)'); band.addColorStop(1,'rgba(40,0,12,0)');
  ctx.fillStyle=band; ctx.fillRect(0, cy-36, W, 72);
  const tri=gui('Image_Warning1'), ex=gui('Image_Warning2'), ts=58*pop*(1+0.06*pulse);
  if(ok(tri)){ drawImgC(tri, W/2, cy-62, ts); drawImgC(ex, W/2, cy-58, ts*0.48); }
  actionText('一大波敌人正在接近', W/2, cy+6, 26, 'red', pop);
  ctx.restore();
}
function ribbon(color, cx, cy, w, label, size){ const im=gui('Label/Title_Ribbon01_'+color); if(!ok(im)) return; const h=w*im.naturalHeight/im.naturalWidth; ctx.drawImage(im, cx-w/2, cy-h/2, w, h); text(label, cx, cy-h*0.08, size||h*0.3, '#fff'); }
function bigButton(color, x, y, w, h, label){ nine(gui('Button/Button01_l_'+color), x, y, w, h, 38, h*0.42); text(label, x+w/2, y+h*0.44, h*0.38, '#fff'); }
function drawResult2(){
  G.overT=(G.overT||0)+1/60;
  ctx.fillStyle='rgba(8,10,24,.72)'; ctx.fillRect(0,0,W,H);
  const o=G.over, cx=W/2, top=H*0.2;
  const gl=gui('Frame/CardFrame04_Glow'); if(o.win && ok(gl)){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.5; ctx.drawImage(gl, cx-W*0.45, top-W*0.3, W*0.9, W*0.9); ctx.restore(); }
  const ta=Math.min(1,(G.overT||0)/0.3); actionText(o.win?'胜利！':'失败', cx, top, 44, o.win?'gold':'gray', 1.3-0.3*ta);
  if(o.win){ for(let i=0;i<3;i++){ const on=i<o.stars, s=i===1?64:52, x=cx+(i-1)*64, y=top+82-(i===1?10:0);
      drawImgC(gui('IconMisc/Icon_Star_Off'), x, y, s);
      const t0=0.45+i*0.32, k=clamp01((G.overT-t0)/0.22); if(on && k>0){ if(!o['s'+i]){ o['s'+i]=1; sfx('star'); shakeDir(0.012,0.12); }
        drawImgC(gui('IconMisc/Icon_Star_On'), x, y, s*(1+1.2*(1-ease.outBack(k,2.2)))); } }
    const lost=G.stats.lost||0, lines=[[true,'通关'],[G.bellsUsed===0, G.bellsUsed?`警钟响了 ${G.bellsUsed} 次`:'没响警钟'],[lost===0, lost?`${lost} 只宠物倒下`:'没有宠物倒下']];
    lines.forEach(([on,t],i)=>{ drawImgC(gui(on?'IconMisc/Icon_Star_On':'IconMisc/Icon_Star_Off'), cx-70, top+140+i*24, 16); text(t, cx-56, top+140+i*24, 13, on?'#fff':'#9aa3b8', 'left', 800, false); });
  } else { const f=Math.max(0.3,Math.min(0.8,G.t/DATA.level.duration)); text(`撑到 ${Math.floor(G.t)} 秒，仍拿到 ${Math.round(f*100)}% 奖励`, cx, top+90, 15, '#fff'); }
  // 奖励：一排方格
  const f = o.win ? 1 : Math.max(0.3,Math.min(0.8,G.t/DATA.level.duration));
  const rewards=[['COIN', Math.round((100+G.kills*5)*f), 'Yellow'], ['IconMisc/Icon_Star_On', Math.round(400*f), 'Blue']];
  for(const [k,n] of Object.entries(G.shards)) rewards.push([null, n, null, null, k]);
  const UL = o.win && o.unlock && window.UNLOCK_CN ? UNLOCK_CN[o.unlock] : null;
  text('奖励', cx, top+226, 14, '#cfe3ff', 'center', 800, false);
  const rs=Math.min(64,(W-40)/rewards.length-10), rx0=cx-(rewards.length*(rs+10)-10)/2;
  REWARD_RECTS.length=0;
  rewards.forEach(([ic,n,col,nm,mk],i)=>{ const x=rx0+i*(rs+10), y=top+246; REWARD_RECTS.push({x,y,w:rs,h:rs+20,kind:mk?'shard':(i===0?'coin':'exp'),key:mk,n});
    const k=clamp01((G.overT-1.3-i*0.1)/0.25); if(k<=0) return; ctx.save(); const sc=ease.outBack(k,2); ctx.translate(x+rs/2,y+rs/2); ctx.scale(sc,sc); ctx.translate(-(x+rs/2),-(y+rs/2));
    if(mk) shardCard(mk, n, x, y, rs);
    else { nine(gui('Frame/ItemFrame03_Single_'+col), x, y, rs, rs, 40, rs*0.24); drawImgC(ic==='COIN'?coinIcon():gui(ic), x+rs/2, y+rs*0.44, rs*0.56);
      text(String(n), x+rs/2, y+rs*0.84, rs*(String(n).length>4?0.17:0.24), '#fff'); }
    ctx.restore(); });
  if(UL){ const k=clamp01((G.overT-1.6)/0.25), y=top+246+rs+22; if(k>0){ ctx.globalAlpha=k; if(!o._ul){ o._ul=1; sfx('sparkle'); }
      text('解锁：'+UL.name, cx, y, 16, '#ffe14d'); text(UL.desc, cx, y+22, 12, '#dfe7ff', 'center', 800, false); ctx.globalAlpha=1; } }
  const b=resultButton(); bigButton(o.win?'Yellow':'Green', b.x, b.y, b.w, b.h, o.win?'继续':'再来一局');
  drawRewardTip();
}
// 结算奖励：点一下弹说明（名字、品质、收集进度），点别处关
cv.addEventListener('pointerdown', e=>{ const x=PX(e), y=PY(e); const it=L.items.find(i=>x>=i.x&&x<=i.x+i.w&&y>=i.y&&y<=i.y+i.h); if(!it) return;
  if(it.id==='card'){ (CARDFX[it.key]=CARDFX[it.key]||{}).press=0.18; } else if(['pause','speed','mute'].includes(it.id)) (BTNFX[it.id]=BTNFX[it.id]||{}).p=0.16; }, {capture:true});
const REWARD_RECTS = []; let RTIP = null;
cv.addEventListener('pointerdown', e=>{ if(!G.over) return; const x=PX(e), y=PY(e);
  const h=REWARD_RECTS.find(q=>x>=q.x&&x<=q.x+q.w&&y>=q.y&&y<=q.y+q.h); RTIP = h && RTIP!==h ? h : null; }, {capture:true});
function drawRewardTip(){
  if(!RTIP) return; const q=REWARD_RECTS.find(z=>z.kind===RTIP.kind&&z.key===RTIP.key); if(!q){ RTIP=null; return; }
  let title, rows;
  if(q.kind==='shard'){ const rr0=rarOf(q.key), have=(G.shardsBefore&&G.shardsBefore[q.key]||0)+q.n;
    title=shardName(q.key)+' 碎片'; rows=[`${rr0.cn} · 已收集 ${have}/${rr0.need}`, have>=rr0.need?'已经可以召唤成宠物':`再收集 ${rr0.need-have} 片可召唤成宠物`]; }
  else if(q.kind==='coin'){ title='金币'; rows=['用来购买道具和进化宠物']; }
  else { title='经验'; rows=['分给本局出战的宠物，用来升级']; }
  const w=Math.min(220,W-20), h=24+16+rows.length*18; let x=q.x+q.w/2-w/2, y=q.y-h-10; if(x<8) x=8; if(x+w>W-8) x=W-8-w;
  const bg=tinted('gui/Frame/BasicFrame_Round24.png','#121729'); if(bg){ ctx.globalAlpha=0.92; nine(bg, x, y, w, h, 20, 14); ctx.globalAlpha=1; }
  text(title, x+12, y+18, 14, '#ffe14d', 'left'); rows.forEach((s,i)=>text(s, x+12, y+40+i*18, 12, '#dfe7ff', 'left', 800, false));
}
function resumeButton(){ return {x:W/2-80, y:H*0.42-38, w:160, h:56}; }
function quitButton(){ return {x:W/2-80, y:H*0.42+32, w:160, h:56}; }
function soundButtons(){ const y=H*0.42+104, w=106, h=46, g=8; return [{key:'musicOff', cn:'音乐', icon:'IconMisc/Icon_Music', x:W/2-g/2-w, y, w, h}, {key:'muted', cn:'音效', icon:'IconMisc/Icon_Megaphone', x:W/2+g/2, y, w, h}]; }
// 返回营地：结束这一局（不结算），回到局外的营地页
function optButtons(){ const y=H*0.42+104+54, w=106, h=46, g=8; return [{key:'fps', x:W/2-g/2-w, y, w, h}, {key:'res', x:W/2+g/2, y, w, h}, {key:'aa', x:W/2-g/2-w, y:y+54, w:w*2+g, h}]; }
function optToggle(k){ if(k==='fps') OPTS.fps = OPTS.fps===60 ? 30 : 60; else if(k==='aa') OPTS.aa = !OPTS.aa; else { OPTS.res = OPTS.res===2 ? 1.5 : 2; resize(); } optsSave(); }
function optLabel(k){ return k==='fps' ? '帧率 '+OPTS.fps : k==='res' ? '画质 '+(OPTS.res===2?'高':'标准') : '抗锯齿 '+(OPTS.aa?'开':'关')+(OPTS.aa!==AA_LIVE?'（重开生效）':''); }
function quitBattle(){ G.paused=false; G.started=false; if(typeof MT!=='undefined'){ MT.inBattle=false; MT.tab='camp'; } emit('ui'); }
// 暂停时：点「继续」恢复；其他点击都不进游戏（暂停中不能偷偷布阵）
cv.addEventListener('pointerdown', e=>{ if(!G.paused||G.over) return; const x=PX(e), y=PY(e), b=resumeButton(), pz=L.items.find(i=>i.id==='pause');
  const q=quitButton(); if(x>=q.x&&x<=q.x+q.w&&y>=q.y&&y<=q.y+q.h){ quitBattle(); e.stopImmediatePropagation(); return; }
  for(const s of soundButtons()) if(x>=s.x&&x<=s.x+s.w&&y>=s.y&&y<=s.y+s.h){ SND[s.key]=!SND[s.key]; soundSave(); emit('ui'); e.stopImmediatePropagation(); return; }
  for(const s of optButtons()) if(x>=s.x&&x<=s.x+s.w&&y>=s.y&&y<=s.y+s.h){ optToggle(s.key); emit('ui'); e.stopImmediatePropagation(); return; }
  if((x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h) || (pz&&x>=pz.x&&x<=pz.x+pz.w&&y>=pz.y&&y<=pz.y+pz.h)){ G.paused=false; emit('ui'); }
  e.stopImmediatePropagation(); }, {capture:true});
function resultButton(){ return {x:W/2-90, y:H*0.2+370, w:180, h:62}; }
// 65 版：胜利 = 主按钮「继续」（回地图 / 去召唤），下面「再打一次」；失败 = 主按钮「再来一局」，下面「返回」
function resultAgainRect(){ return G.over && G.over.win ? (typeof backRect==='function'?backRect():null) : resultButton(); }
function resultLeaveRect(){ return G.over && G.over.win ? resultButton() : (typeof backRect==='function'?backRect():null); }

// 拖动宠物时，底部卡槽区变成「卖出区」
function drawSellZone(){
  if(!(G.drag && G.drag.kind==='pet' && Math.hypot(G.drag.x-G.drag.sx,G.drag.y-G.drag.sy)>8) || tutCur()) return;
  const b=L.bar, over = G.drag.y >= b.y-8, refund=Math.floor(G.drag.pet.def.cost*0.5);
  const t=tinted('gui/Frame/BasicFrame_Round24.png', over?'#e8344a':'#7a1d2b'); if(t){ ctx.globalAlpha=over?0.92:0.78; nine(t, 8, b.y+4, W-16, b.h-12, 20, 18); ctx.globalAlpha=1; }
  const fl=tinted('gui/Frame/ItemFrame00~03_FocusLine.png', over?'#ffffff':'#ff9aa5'); if(fl) nine(fl, 8, b.y+4, W-16, b.h-12, 20, 18);
  drawImgC(energyIcon(), W/2-70, b.y+b.h/2-4, 34*(over?1.15:1));   // 41 版：卖掉退回的是能量（费用的一半），原来误用金币图标
  text(`拖到这里卖掉  +${refund}`, W/2+14, b.y+b.h/2-4, 17, '#fff');
}
// ---------- 教学提示（65 版）：目标格子高光 + 半透明的宠物沿箭头从卡牌滑到格子，演示「拖过去」；上方一行说明 ----------
// 素材：格子框 ItemFrame FocusLine、光晕 CardFrame04_Glow、箭头 IconMisc/Icon_Arrow_Next2（白色无描边，着暖黄），都是界面里已经在用的
let TUT_T0 = 0;
function drawTutorial(){
  const s=tutCur(); if(!s || G.over || G.paused) return;
  const cs=L.cs, tt=(performance.now()-TUT_T0)/1000, pulse=0.5+0.5*Math.sin(tt*5);
  const glow=gui('Frame/CardFrame04_Glow'), arrow=tinted('gui/IconMisc/Icon_Arrow_Next2.png','#ffe9a0');
  const ring=(x,y,r)=>{ if(ok(glow)){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.45+0.3*pulse; ctx.drawImage(glow, x-r, y-r, r*2, r*2); ctx.restore(); } };
  const cellMark=(lane,col)=>{ const r=L.cellRect(lane,col); ring(r.x+cs/2, r.y+cs/2, cs*0.95);
    const t=tinted('gui/Frame/ItemFrame00~03_FocusLine.png','#ffe14d'); if(t){ const g=cs*0.04*pulse; ctx.globalAlpha=0.75+0.25*pulse; nine(t, r.x+2-g, r.y+2-g, cs-4+g*2, cs-4+g*2, 20, cs*0.22); ctx.globalAlpha=1; } };
  // 从 a 到 b：一串向前流动的箭头 + 半透明的宠物头像沿路滑过去
  const path=(a,b,key)=>{ const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy), ang=Math.atan2(dy,dx), n=Math.max(2,Math.floor(len/(cs*0.55)));
    if(arrow) for(let i=0;i<n;i++){ const k=((i+ (tt*1.6)%1)/n), x=a.x+dx*k, y=a.y+dy*k, al=Math.sin(k*Math.PI);
      ctx.save(); ctx.globalAlpha=0.9*al; ctx.translate(x,y); ctx.rotate(ang); const h=cs*0.36, w=h*arrow.width/arrow.height; ctx.drawImage(arrow, -w/2, -h/2, w, h); ctx.restore(); }
    const dragging = G.drag && Math.hypot(G.drag.x-G.drag.sx, G.drag.y-G.drag.sy)>8;
    if(!dragging && PORTRAIT[key]){ const c=(tt%1.8)/1.8, k=c<0.75 ? ease.outCubic(c/0.75) : 1, al=c<0.1 ? c/0.1 : c>0.85 ? Math.max(0,(1-c)/0.15) : 1;
      ctx.save(); ctx.globalAlpha=0.6*al; ctx.drawImage(PORTRAIT[key], a.x+dx*k-cs*0.5, a.y+dy*k-cs*0.72, cs, cs); ctx.restore(); } };
  if(s.kind==='place'){ const it=L.items.find(i=>i.id==='card'&&i.key===s.key), r=L.cellRect(s.L,s.C); cellMark(s.L,s.C);
    if(it) path({x:it.x+it.w/2, y:it.y+it.h*0.3}, {x:r.x+cs/2, y:r.y+cs/2}, s.key); }
  else if(s.kind==='move'){ const r0=L.cellRect(s.pet.lane,s.pet.col), r=L.cellRect(s.L,s.C); cellMark(s.L,s.C);
    path({x:r0.x+cs/2, y:r0.y+cs/2}, {x:r.x+cs/2, y:r.y+cs/2}, s.key); }
  else if(s.kind==='orb' && !s.orb.got){ const p=window.orbHitPos?orbHitPos(s.orb):orbScreen(s.orb); ring(p.x, p.y, cs*0.75);
    if(arrow && s.orb.fall<=0){ const bob=Math.sin(tt*6)*cs*0.06, h=cs*0.34, w=h*arrow.width/arrow.height; ctx.save(); ctx.globalAlpha=0.9; ctx.translate(p.x, p.y-cs*0.62+bob); ctx.rotate(Math.PI/2); ctx.drawImage(arrow, -w/2, -h/2, w, h); ctx.restore(); } }
  if(s.text){ ctx.font=`800 14px ${FONT}`; const y=L.hud.h+30, lines=wrapTut(s.text, W-64), w=Math.min(W-24, Math.max(...lines.map(q=>ctx.measureText(q).width))+44), h=16+lines.length*20;
    pill(W/2-w/2, y-h/2, w, h); lines.forEach((q,i)=>text(q, W/2, y-(lines.length-1)*10+i*20, 14, '#fff', 'center', 800, false)); }
}
function wrapTut(s, maxW){ const out=[]; let cur=''; for(const ch of s){ if(ctx.measureText(cur+ch).width>maxW && cur && !'，。、：；！？）'.includes(ch)){ out.push(cur); cur=''; } cur+=ch; }   // 标点不放在行首 if(cur) out.push(cur);
  if(out.length===2 && out[1].length<=2){ const all=s, cut=Math.ceil(all.length/2); return [all.slice(0,cut), all.slice(cut)]; }   // 不让最后一行只剩一两个字
  return out; }
// 开始界面：点一下开始（浏览器要求先点一下才能出声）
function drawStartOverlay(){
  ctx.fillStyle='rgba(8,10,24,.55)'; ctx.fillRect(0,0,W,H);
  ribbon('Blue', W/2, H*0.36, Math.min(W*0.8,300), DATA.level.id+' '+DATA.level.title, 20);
  const pulse=1+0.04*Math.sin(performance.now()/180);
  ctx.save(); ctx.translate(W/2, H*0.52); ctx.scale(pulse,pulse); bigButton('Yellow', -90, -31, 180, 62, '开始'); ctx.restore();
  text('拖动卡牌放置宠物 · 拖动宠物换位 · 拖回卡槽卖掉', W/2, H*0.62, 12, '#dfe7ff', 'center', 800, false);
  text('点一下底部的卡牌可以看它的说明', W/2, H*0.62+20, 12, '#dfe7ff', 'center', 800, false);
}
// ---------- 浮窗说明：鼠标悬停 / 手机长按 ----------
const TIP = { x:0, y:0, type:'mouse', down:false, longT:0, show:false };
cv.addEventListener('pointermove', e=>{ TIP.x=PX(e); TIP.y=PY(e); TIP.type=e.pointerType; if(TIP.type==='mouse') TIP.show=true; });
cv.addEventListener('pointerdown', e=>{ const x=PX(e), y=PY(e); const it=L.items.find(i=>i.id==='card'&&x>=i.x&&x<=i.x+i.w&&y>=i.y&&y<=i.y+i.h);
  TIP.card = it ? (TIP.card===it.key && !G.selected ? null : it.key) : null;   // 点卡显示说明（买不起也能看），点别处关闭
  // 点地面效果（花丛格、木桶、警钟）也弹说明；格子上有宠物时不弹（场上角色不出浮窗），手里选着卡时不弹（那是在放置）
  TIP.cell = null;
  if(!it && !G.selected && G.started && !G.over){ const {lane,col}=L.toCell(x,y);
    if(inGrid(lane,col) && !petAt(lane,col)){ const c=cellAt(lane,col); if(c && (c.type!=='crate'||c.hpNow>0)) TIP.cell={info:CELL_INFO[c.type==='crate'?c.kind:c.type], r:L.cellRect(lane,col), t:0}; }
    const bs=L.toScreen(0,-0.45); if(Math.abs(y-bs.y)<L.cs*0.35 && x>L.ox && x<L.ox+LANES*L.cs) TIP.cell={info:CELL_INFO.bell, r:{x:x-L.cs/2, y:bs.y-L.cs/2, w:L.cs, h:L.cs}, t:0}; }
});
window.addEventListener('pointerup', ()=>{ TIP.down=false; if(TIP.type!=='mouse') TIP.show=false; });
cv.addEventListener('pointerleave', ()=>{ if(TIP.type==='mouse') TIP.show=false; });
function tipTarget(x,y){
  const cs=L.cs;
  for(const it of L.items) if(it.id==='card' && x>=it.x&&x<=it.x+it.w&&y>=it.y&&y<=it.y+it.h) return {kind:'pet', def:DATA.pets[it.key], card:true};
  let best=null, bd=cs*0.5;
  for(const e of G.enemies){ const v=VIS.get(e); const f=feet(e.lane,e.p); const cy=f.y-(v&&v.dh?v.dh*0.45:cs*0.4); const d=Math.hypot(x-f.x,y-cy); if(d<bd){ bd=d; best={kind:'enemy', e}; } }
  if(best) return best;
  const {lane,col}=L.toCell(x,y);
  if(inGrid(lane,col)){ const p=petAt(lane,col); if(p) return {kind:'pet', def:p.def, pet:p};
    const c=cellAt(lane,col); if(c && (c.type!=='crate'||c.hpNow>0)) return {kind:'cell', info:CELL_INFO[c.type==='crate'?c.kind:c.type], cell:c}; }
  const bs=L.toScreen(0,-0.45); if(Math.abs(y-bs.y)<cs*0.35 && x>L.ox && x<L.ox+LANES*cs) return {kind:'cell', info:CELL_INFO.bell};
  return null;
}
function wrapText(str, maxW, size){ ctx.font=`800 ${size}px ${FONT}`; const out=[]; let line=''; for(const ch of str){ if(ctx.measureText(line+ch).width>maxW && line){ out.push(line); line=ch; } else line+=ch; } if(line) out.push(line); return out; }
function drawTooltip(){
  // 只给底部卡牌显示说明：点一下卡（选中）时在卡上方弹出；场上的宠物、怪物经常要拖，不弹窗
  if(G.over || !G.started || (!TIP.card && !TIP.cell)) return;
  if(G.drag && Math.hypot(G.drag.x-G.drag.sx,G.drag.y-G.drag.sy)>8){ TIP.card=null; TIP.cell=null; return; }
  let card, t;
  if(TIP.card){ card=L.items.find(i=>i.id==='card' && i.key===TIP.card); if(!card) return; t={kind:'pet', def:DATA.pets[TIP.card], card:true}; }
  else { card=TIP.cell.r; t={kind:'cell', info:TIP.cell.info}; TIP.cell.t+=1/60; if(TIP.cell.t>3.5){ TIP.cell=null; return; } }   // 地面说明 3.5 秒后自动关
  const ELN={fire:'火',water:'水',grass:'草',light:'光',dark:'暗',none:'无'};
  let title='', icon2=null, rows=[], desc='', elc='#fff';
  if(t.kind==='pet'){ const d=t.def; title=d.cn; elc=EL_HEX[d.el]; icon2=PORTRAIT[Object.keys(DATA.pets).find(k=>DATA.pets[k]===d)];
    rows.push(`${ELN[d.el]}系 · ${SHAPE_CN[d.shape]}${d.rarity==='rare'?' · 稀有':''}`);
    const st=[`费用 ${d.cost}`]; if(d.hp>1) st.push(`生命 ${t.pet?Math.ceil(t.pet.hp)+'/':''}${d.hp}`); if(d.dmg) st.push(`伤害 ${d.dmg}${d.int?' / '+d.int+'秒':''}`); rows.push(st.join('   '));
    if(t.pet && t.pet.nSame) rows.push(`相邻同属性 ${t.pet.nSame} 只：攻击 +${t.pet.nSame*8}%`);
    desc=d.desc; }
  else if(t.kind==='enemy'){ const e=t.e, d=e.def; title=d.cn; elc=EL_HEX[d.el];
    const adv={fire:'水',grass:'火',water:'草'}[d.el];
    rows.push(`${ELN[d.el]}系${adv?` · 怕${adv}系`:''}`); rows.push(`生命 ${Math.ceil(e.hp)}/${d.hp}   攻击 ${d.atk}`); desc=d.desc; }
  else { title=t.info.cn; desc=t.info.desc; elc='#ffe14d'; }
  const w=Math.min(250, W-20), pad=12, lines=wrapText(desc, w-pad*2, 12), h=pad*2+26+rows.length*18+lines.length*17+6;
  let x=card.x+card.w/2-w/2, y=card.y-h-18; if(x+w>W-6) x=W-6-w; if(x<6) x=6; if(y<L.hud.h) y=card.y+card.h+10;   // 上面放不下就放到下面
  const bg=tinted('gui/Frame/BasicFrame_Round24.png','#121729'); if(bg){ ctx.globalAlpha=0.9; nine(bg, x, y, w, h, 20, 14); ctx.globalAlpha=1; }
  ctx.fillStyle=elc; ctx.globalAlpha=0.9; rr(x+12, y, w-24, 3, 2); ctx.fill(); ctx.globalAlpha=1;   // 顶部一条属性色细线
  let cy=y+pad+12;
  if(icon2) ctx.drawImage(icon2, x+pad-4, cy-16, 32, 32);
  text(title, x+pad+(icon2?34:0), cy, 16, elc, 'left');
  cy+=24; ctx.textAlign='left';
  for(const r of rows){ text(r, x+pad, cy, 12, '#cfe3ff', 'left', 800, false); cy+=18; }
  cy+=4; for(const l of lines){ text(l, x+pad, cy, 12, '#ffffff', 'left', 800, false); cy+=17; }
}

// ---------- 主绘制 ----------
const RSNAP = { on: !/[?&]rsnap=0/.test(location.search), cv:null, over:null, key:'' };
const rsnapKey = () => cv.width+'x'+cv.height+'|'+W+'|'+H;
let lastDraw = performance.now();
function draw(){
  const now=performance.now(); let dt=Math.min(0.05,(now-lastDraw)/1000); lastDraw=now;
  const adt = !G.started ? dt : G.paused||G.over ? (G.over?dt:0) : HITSTOP>1e-6 ? 0 : dt*G.speed;
  if(!READY){ ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#2b3a2a'; ctx.fillRect(0,0,cv.width,cv.height); ctx.restore(); text(LOADMSG+(LOAD_N?(' '+LOAD_N[0]+'/'+LOAD_N[1]):''),W/2,H/2,18,'#fff'); return; }
  audioPump();
  SCENE.ensure(G.cells);
  ENV_T += dt; FRAMENO++;
  // 44 版（用户 2026-11-13：结算界面也很卡）：结算弹出、战场上的特效都播完后，把战场定格成一张图，之后每帧只贴这张图 + 画结算面板
  if(!G.over && RSNAP.cv){ RSNAP.cv.width=0; RSNAP.cv.height=0; RSNAP.cv=null; }
  if(G.over && RSNAP.cv && RSNAP.over===G.over && RSNAP.key===rsnapKey()){
    ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(RSNAP.cv,0,0); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(0,0,W,H); ctx.clip();
    COMBO.draw(adt,'world'); COMBO.draw(dt,'screen'); drawFlyers(dt);
    drawResult2(); drawTooltip();
    ctx.restore(); return;
  }
  // 电脑上：中间一个手机大小的画面，两边纯色（竖屏版不往两边扩）
  if(X0PX>0.01 || Y0PX>0.01 || shake.t>0){ ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#14171f'; ctx.fillRect(0,0,cv.width,cv.height); ctx.restore(); }   // 61 版：画面铺满整块画布时（手机竖屏）这层底色完全被地面盖住，不画（少画一遍整屏）；震屏时地面会挪开露边，照画
  ctx.save(); ctx.beginPath(); ctx.rect(0,0,W,H); ctx.clip();
  // 方向震屏：沿打击方向来回，衰减
  if(shake.t>0){ shake.t-=dt; const k=Math.max(0,shake.t/shake.t0), e=shake.hold ? (k>0.5 ? 1 : 4*k*k) : k*k, a=shake.amp*L.cs*e, w=Math.sin(shake.t*70);
    let sx, sy; if(shake.dx||shake.dy){ sx=shake.dx*a*w+(Math.random()-0.5)*a*0.4; sy=shake.dy*a*w+(Math.random()-0.5)*a*0.4; } else { sx=(Math.random()-0.5)*a*2; sy=(Math.random()-0.5)*a*2; }
    if(!/[?&]shake=0\b/.test(location.search)){ const q=ctx.getTransform().a||1; sx=Math.round(sx*q)/q; sy=Math.round(sy*q)/q; }   // game-test 试改：震屏偏移对齐到整数个屏幕像素（?shake=0 回到原样）
    ctx.translate(sx, sy); }
  SCENE.drawGround(ctx); COMBO.draw(adt,'ground'); drawPreviewLanes(); drawPlacement(); drawAuras();   // 放置提示框在地面层，不盖在角色身上
  // 道具、角色、木箱按脚底 y 排序：前面的挡住后面的
  const list=[];
  for(const p of SCENE.props()) if(!p.flat) list.push([p.y, ()=>SCENE.drawProp(ctx,p,ENV_T)]);
  for(const p of G.pets) list.push([feet(p.lane,p.col+0.5).y+0.01, ()=>drawPet(p,adt)]);
  for(const e of G.enemies) list.push([feet(e.lane,e.p).y+0.02, ()=>drawEnemy(e,adt)]);
  for(const c of G.cells) if(c.type==='crate' && c.hpNow>0) list.push([feet(c.lane,c.col+0.5).y, ()=>drawCrate(c)]);
  for(const pr of G.projs) list.push([feet(pr.lane,pr.p).y+0.03, ()=>drawProj(pr)]);
  list.push([L.toScreen(0,-0.45).y+L.cs*0.25, drawBells]);
  list.sort((a,b)=>a[0]-b[0]);
  for(const [,fn] of list) fn();
  drawCorpses(adt); drawMonFx(adt);
  SCENE.drawFx(ctx, ENV_T, dt, icon('Misc_Leaf_01_Green'));
  drawVFX(adt); COMBO.draw(adt,'world'); COMBO.draw(dt,'screen'); drawDamage(adt); drawOrbs(); drawTexts();
  if(G.started && !G.over) watchEvents();
  drawUI2(); drawSellZone(); drawTutorial(); drawDragGhost(); drawFlyers(dt);   // 拖着的宠物画在卖出区上面，不被挡住
  const bn=[...G.fx.filter(f=>f.kind==='banner'), ...EVENTS.filter(ev=>G.t>=ev.t&&G.t<ev.until&&ev.text).map(ev=>({text:ev.text,big:ev.kind==='banner'}))];
  /* 65 版：教学提示出现时，同一位置的预告文字先不画，免得叠在一起 */
  if(!G.over && !G.paused && !tutCur()) bn.slice(0,2).forEach((b,i)=>{ const y=L.hud.h+30+i*46; if(b.big){ const ev=EVENTS.find(e=>e.kind==='banner'&&G.t>=e.t&&G.t<e.until); if(ev) drawWaveWarning(G.t-ev.t, ev.until-ev.t); }
    else { ctx.font=`800 14px ${FONT}`; const w=Math.min(W-30, ctx.measureText(b.text).width+44); pill(W/2-w/2, y-17, w, 34); text(b.text, W/2, y, 14, b.color&&b.color!=='#fff'?b.color:'#fff', 'center', 800, false); } });
  if(G.paused&&!G.over){ ctx.fillStyle='rgba(38,30,28,.6)'; ctx.fillRect(0,0,W,H);
    // 31 版：继续 / 返回营地；46 版：音乐 / 音效开关。
    // 47 版（用户 2026-11-13：「暂停界面能换成剑与远征配色吗」）：和局外界面同一套启程配色（meta.js 的 TH_AFK / D37）——米白面板 + 深暖灰描边和厚边 + 一圈金线，
    //   主按钮启程绿、次按钮深暖灰，字不用蓝紫描边。原来是 Super Casual 的亮蓝弹窗 + 亮绿 / 亮蓝按钮。
    const U=TH_AFK.ui, pw=Math.min(W-60,300), ph=250+64+54+54, px=W/2-pw/2, py=H*0.42-125;
    const pf=dBox(px, py, pw, ph, 22, U.panel, D37.sideL, D37.out, 0);
    ctx.save(); ctx.strokeStyle=D37.gold; ctx.lineWidth=1.5; rr(pf.x+6, pf.y+6, pf.w-12, pf.h-12, 17); ctx.stroke(); ctx.restore();
    text('暂停', W/2, py+44, 24, U.txt, 'center', 800, false);
    const ab=(r,label,face,side,col,size)=>{ const f=dBox(r.x, r.y, r.w, r.h, 14, face, side, D37.out, 0); dHi(f,14); if(label) text(label, f.x+f.w/2, f.y+f.h/2+1, size||r.h*0.36, col||'#fff', 'center', 800, side); return f; };
    ab(resumeButton(), '继续', '#749965', '#587a4c');
    ab(quitButton(), '返回营地', '#685d5b', '#4f4548');
    for(const s of soundButtons()){ const on=!SND[s.key], f=ab(s, '', on?'#749965':'#cfc8bc', on?'#587a4c':'#b9aea8');
      drawImgC(gui(s.icon), f.x+21, f.y+f.h/2, 22, on?1:0.5); text(s.cn+(on?' 开':' 关'), f.x+f.w/2+12, f.y+f.h/2+1, 15, on?'#fff':'#8d8485', 'center', 800, on?'#587a4c':false); }
    for(const s of optButtons()){ const f=ab(s, '', '#685d5b', '#4f4548'); text(optLabel(s.key), f.x+f.w/2, f.y+f.h/2+1, 15, '#fff', 'center', 800, '#4f4548'); } }
  if(G.over && RSNAP.on && (G.overT||0)>1.6 && shake.t<=0 && ((G.overT||0)>4 || !(flyers.length||corpses.length||VFX.length||PARTS.length||FLASH.length||DMG.length||MONFX.length||COMBO._LIVE.length))){
    if(!RSNAP.cv) RSNAP.cv=document.createElement('canvas'); const c=RSNAP.cv; if(c.width!==cv.width||c.height!==cv.height){ c.width=cv.width; c.height=cv.height; }
    const g=c.getContext('2d'); g.setTransform(1,0,0,1,0,0); g.globalCompositeOperation='copy'; g.drawImage(cv,0,0); g.globalCompositeOperation='source-over';
    RSNAP.over=G.over; RSNAP.key=rsnapKey();
  }
  if(G.over) drawResult2();
  if(!G.started) drawStartOverlay(); else drawTooltip();
  if(DBG_VIEW){ const d=VIEW_DBG; ctx.fillStyle='rgba(0,0,0,.7)'; ctx.fillRect(4,H*0.3,W-8,64); text(`inner ${d.iw}x${d.ih}  vh ${d.vh}  screen ${d.sw}x${d.sh}`, 10, H*0.3+14, 11, '#fff', 'left', 800, false); text(`used ${d.rw}x${d.rh}  standalone ${d.sa}  dpr ${window.devicePixelRatio}`, 10, H*0.3+32, 11, '#fff', 'left', 800, false); text(`safe t${SAFE.t.toFixed(0)} b${SAFE.b.toFixed(0)}  W${W} H${H.toFixed(0)} cs${L.cs.toFixed(1)}`, 10, H*0.3+50, 11, '#fff', 'left', 800, false); }
  if(LOOKMSG.t>0){ LOOKMSG.t-=dt; ctx.globalAlpha=Math.min(1,LOOKMSG.t*2); pill(W/2-80, H*0.5-18, 160, 36); text(LOOKMSG.s, W/2, H*0.5, 14, '#fff', 'center', 800, false); ctx.globalAlpha=1; }
  ctx.restore();
}
let ENV_T = 0; const LOOKMSG = {t:0, s:''};
// 对比开关：Q 切换「新质感 / 原版素材」，T 切换场景主题（草地 / 夜晚 / 雪地 / 火山）
window.addEventListener('keydown', e=>{
  if(e.key==='q'||e.key==='Q'){ LOOK = LOOK==='ink'?'orig':'ink'; for(const x of [...G.pets,...G.enemies]) VIS.delete(x); makePortraits(); LOOKMSG.t=1.5; LOOKMSG.s=LOOK==='ink'?'新质感':'原版素材'; }
  if(e.key==='h'||e.key==='H'){ PET_HD=!PET_HD; for(const x of [...G.pets,...G.enemies]) VIS.delete(x); makePortraits(); LOOKMSG.t=1.5; LOOKMSG.s=PET_HD?'高清图集':'原版图集'; }
  if(e.key==='t'||e.key==='T'){ const a=SCENE.THEMES, i=a.indexOf(SCENE.theme); SCENE.setTheme(a[(i+1)%a.length]); }
});

// ---------- 启动 ----------
let lastT=performance.now(), acc=0; const STEP=1/60;
// 35 版（用户 2026-11-13：手机发烫、宠物页卡）：营地、宠物等界面页没人操作时降到 30 帧（手游界面页的常见做法），
//   一有触摸 / 拖动 / 滚动惯性就恢复 60 帧，0.8 秒没操作再降回去；战斗中一直 60 帧
let LAST_INPUT=0, LAST_DRAW=0;
const PREWARM = {done:false, on:!/[?&]pw=0\b/.test(location.search), pick:src=>/\/(combos\/img|vfx|monsters|pets|pets_hd|env1)\//.test(src)};
for(const ev of ['pointerdown','pointermove','wheel','keydown']) window.addEventListener(ev, e=>{ if(ev!=='pointermove' || e.buttons || e.pointerType==='touch') LAST_INPUT=performance.now(); }, {capture:true, passive:true});
function frame(now){
  const idleUI = !(typeof MT!=='undefined' && MT.inBattle) && now-LAST_INPUT>800 && !(typeof MT!=='undefined' && (MT.drag || Math.abs(MT.sv||0)>1));
  if((idleUI || OPTS.fps===30) && now-LAST_DRAW < 1000/30-4){ requestAnimationFrame(frame); return; }   // 61 版：设置里选 30 帧时全程隔帧画（逻辑仍按固定步长算，速度不变）
  if(!PREWARM.done && READY && BATTLE_READY && PREWARM.on && ctx.__prewarm){ if(!ctx.__prewarm(PREWARM.pick, 6)) PREWARM.done=true; }   // 61 版：战斗用的图下载完后，每帧抽几毫秒提前上传显卡，免得第一次用到时卡
  LAST_DRAW=now;
  acc += Math.min(0.1,(now-lastT)/1000); lastT=now;
  if(READY && G.started) while(acc>=STEP){ if(HITSTOP>1e-6){ HITSTOP-=STEP; acc-=STEP; continue; } if(!G.paused) for(let i=0;i<G.speed;i++) update(STEP); acc-=STEP; } else acc=0;
  const PT0=performance.now(); if(ctx.__begin) ctx.__begin(); draw(); if(ctx.__end) ctx.__end();   // 57 版：一帧的绘制结束后统一交给 WebGL
  if(window.PERF_HUD) PERF_HUD.frame(performance.now()-PT0);
  requestAnimationFrame(frame);
}
resize(); newGame(); loadAll(); requestAnimationFrame(frame);
window.TATA = {skip:n=>cheatSkip(n), msg:()=>LOADMSG, G:()=>G, DATA, newGame, placePet, movePet, update, ready:()=>READY, setOrient:(m)=>{orientMode=m;resize();}, SND};
