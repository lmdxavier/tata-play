'use strict';
/* =====================================================================
   塔塔 · 章节关卡地图（_dev 独立开发版，接进游戏见 接入说明.md）
   设计依据：docs/玩法与界面.md「章节地图【已定】」+ 用户 2026-11-13 选的推荐方案：
   - 竖屏，横向连续滚动（左右拖，带惯性），每章一条地图；一屏约 3 关。
   - 从上到下：左上章节名 + 终关奖励、右上资源条 → 远景（天空、远山、远林，视差慢移）
     → 一排树墙压住远景和地面的分界（落差方案 A）→ 俯视草地上一条上下起伏的土路，关卡节点在路上
     → 下方信息卡（选中关卡的路数、精英 / Boss、首通奖励、开始按钮）→ 底栏（游戏原有）。
   - 节点（学塔塔冒险队）：已通关 = 绿色底座；没打过 = 灰色底座；最前面那一关（当前关）脚下有呼吸光圈。
     点节点 = 选中（宠物沿路跑过去，下方信息卡换成这一关），点「开始战斗」才进战斗；锁住的点了晃一下并提示先过哪关。
     精英 / Boss 节点上方冒出怪物头像气泡，送新宠物的节点冒出剪影气泡（学 PvZ2），终关底座大一号、旁边放宝箱。
   - 打开地图时镜头对准选中的关；胜利回来：新一关的底座弹出来，宠物沿路跑到新一关（王国保卫战 / Candy Crush 的做法）。
   素材：远景 = Simple Sidescroll map01（tools/make_map_assets.py 调色）；地面、路、树、灌木、石头 = 2D Minimal Environment 1
   （和战斗、营地同一套，读游戏已有的 assets/env1/）；底座、宝箱 = Fantasy Hero（界面主素材）。
   画法：地面 + 路 + 贴地小草小花先画进离屏画布（按设备像素对齐，防竖线），树和灌木每帧按脚的位置排前后、从脚部轻摆。
   依赖游戏的全局函数（render.js / meta.js / game.js）：img ok drawImg drawImgC text rr heroButton heroT mtNine4 btnShadow
     toast sfx addHit inR newSpine newMon renderChar drawLive groundShadow shardIcon coinIcon icon silOf drawResBar seeded ease clamp01
   ===================================================================== */
const CHAPTER_MAP = (()=>{
  const D = window.MAP_DATA;
  const BASE = () => window.MAP_BASE || 'map/';          // 相对 assets/：游戏里放 assets/map/；测试页指到 _dev 目录
  const mi = n => img(BASE()+n+'.png');
  const envImg = n => img('env1/'+n+'.png');
  const KEY = 'tata_map';
  const GROUND = [138,183,96], DEEP = [62,98,60], ROAD = [184,148,117];   // 地面 = 战斗棋盘两种亮格的中间色；树林深处 = 战斗场景 DEEP；路 = Road_Forest
  const rgb = (c,a=1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // ---------- 进度存档 ----------
  const P = { cleared:{}, sel:null, ch:1 };
  try{ Object.assign(P, JSON.parse(localStorage.getItem(KEY)||'{}')||{}); }catch(e){}
  const save = () => { try{ localStorage.setItem(KEY, JSON.stringify(P)); }catch(e){} };
  const chap = () => D.chapters.find(c=>c.id===P.ch) || D.chapters[0];
  const levels = () => chap().levels;
  const frontierIdx = () => { const L=levels(); const i=L.findIndex(l=>!P.cleared[l.id]); return i<0 ? L.length-1 : i; };
  const unlocked = i => i <= frontierIdx();
  const selIdx = () => { const L=levels(); let i=L.findIndex(l=>l.id===P.sel); if(i<0 || !unlocked(i)) i=frontierIdx(); return i; };

  const S = { cam:null, vel:0, drag:null, t:0, last:0, geo:null, gkey:'', bake:null, bkey:'',
              pet:null, petKey:null, petS:null, petTo:null, petFace:1, anim:null, shake:{}, pop:{}, popup:false, playing:null, lay:null };

  // ---------- 几何：世界坐标单位 u（竖屏设计宽 390 时 1u = 1 像素），y 从内容区顶部算 ----------
  const NODE_DX = 132, ROAD_W = 34, CARD_H = 184, OVER = 160, RUBBER = 90;   // OVER：地面层两端多画的宽度；RUBBER：拖过头最多露出多少
  const ZIG = [0.72, 0.22, 0.82, 0.36, 0.92, 0.14, 0.66, 0.30, 0.86, 0.48];
  function geometry(c){
    const u = Math.min(c.w/390, c.h/640), chU = c.h/u, k = `${c.w}|${c.h}|${P.ch}`;   // 按宽、高取小：横屏 / 矮屏不会把卡片和字放大到盖住地图
    if(S.geo && S.gkey===k) return S.geo;
    if(S.geo){ S.cam=null; S.petS=null; S.petTo=null; S.follow=null; }   // 尺寸变了（转屏、窗口缩放）：节点在路上的位置跟着变，宠物和镜头重新对准选中的关
    const wallY = Math.round(chU*0.31), cardTop = chU - CARD_H - Math.max(10, (typeof navOver==='function'?navOver():0)/u + 12),   /* 52 版：底栏图标高出底栏后，关卡卡片跟着上移，不被图标压住 */ groundTop = wallY - 52;
    const yA = wallY + (cardTop-wallY)*0.30, yB = cardTop - (cardTop-wallY)*0.20;
    const L = levels(), nodes = L.map((l,i)=>({ l, i, x:104+i*NODE_DX, y:yA+(yB-yA)*ZIG[i%ZIG.length], big:!!l.boss }));
    const width = nodes[nodes.length-1].x + 190;
    // 路：Catmull-Rom 曲线穿过所有节点，两端伸出地图外
    const pts = [{x:-60, y:nodes[0].y-10}, ...nodes, {x:width+60, y:(yA+yB)/2}];
    const path = []; for(let i=0;i<pts.length-1;i++){ const p0=pts[Math.max(0,i-1)], p1=pts[i], p2=pts[i+1], p3=pts[Math.min(pts.length-1,i+2)];
      for(let s=0;s<16;s++){ const t=s/16, t2=t*t, t3=t2*t;
        path.push({x:0.5*((2*p1.x)+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
                   y:0.5*((2*p1.y)+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3)}); } }
    path.push(pts[pts.length-1]);
    let acc=0; path.forEach((p,i)=>{ if(i) acc+=Math.hypot(p.x-path[i-1].x, p.y-path[i-1].y); p.s=acc; });
    nodes.forEach((n,i)=>{ n.s = path[(i+1)*16].s; });
    S.geo = { u, chU, wallY, cardTop, groundTop, nodes, width, path, props:makeProps(nodes, path, wallY, cardTop, chU, width), decals:null };
    S.geo.decals = makeDecals(S.geo); S.gkey = k; S.bkey = ''; return S.geo;
  }
  const at = (path, s) => { let i=1; while(i<path.length-1 && path[i].s<s) i++; const a=path[i-1], b=path[i], k=clamp01((s-a.s)/Math.max(0.001,b.s-a.s));
    return {x:a.x+(b.x-a.x)*k, y:a.y+(b.y-a.y)*k, dx:b.x-a.x, dy:b.y-a.y}; };
  const distPath = (path, x, y) => { let m=1e9; for(let i=1;i<path.length;i++){ const a=path[i-1], b=path[i], vx=b.x-a.x, vy=b.y-a.y, l=vx*vx+vy*vy||1, t=clamp01(((x-a.x)*vx+(y-a.y)*vy)/l);
    m=Math.min(m, Math.hypot(a.x+vx*t-x, a.y+vy*t-y)); } return m; };

  // ---------- 摆放（固定种子，每次打开一样）----------
  const SET = {
    wallBack: ['Tree_Green_01','Tree_Green_02','Tree_Green_03','Tree_Green_04','Tree_Green_06','Tree_Green_07','Tree_Green_08','Tree_Green_10','Tree_Green_14','Tree_Green_15','Tree_Green_16'],
    wallFront:['Tree_Yellow_Green_02','Tree_Yellow_Green_03','Tree_Yellow_Green_04','Tree_Yellow_Green_06','Tree_Yellow_Green_07','Tree_Yellow_Green_08','Tree_Yellow_Green_10','Tree_Yellow_Green_15','Tree_Yellow_Green_17','Tree_Yellow_Green_18','Tree_Green_17','Tree_Green_18','Birch_Yellow_green_01'],
    mid:      ['Tree_Yellow_Green_01','Tree_Yellow_Green_05','Tree_Yellow_Green_09','Tree_Yellow_Green_12','Tree_Green_05','Tree_Green_11','Tree_Green_13','Birch_Yellow_green_02','Tree_Yellow_Green_19'],
    small:    ['Small_Tree_Yellow_Green_01','Small_Tree_Yellow_Green_02','Small_Tree_Yellow_Green_03','Small_Tree_Green_01','Small_Tree_Green_02'],
    bush:     ['Bush_Yellow_Green_01','Bush_Yellow_Green_02','Bush_Yellow_Green_03','Bush_Green_01','Bush_Green_02','Bush_Green_03','Bush_Yellow_Green_04','Bush_Green_04'],
    stone:    ['Stone_Gray1_01','Stone_Gray1_02','Stone_Gray1_03','Stone_Gray1_04','Stone_Gray2_02','Stone_Gray2_03'],
    shroom:   ['Mushroom_Wihte_01','Mushroom_Wihte_02','Mushroom_Pink_01','Mushroom_Yellow_02'],
  };
  const ASPECT = {};   // 素材宽高比（加载后读真实尺寸；没加载完先按 1）
  const ar = n => { const im=envImg(n); return ok(im) ? im.naturalWidth/im.naturalHeight : (ASPECT[n]||1); };
  function makeProps(nodes, path, wallY, cardTop, chU, width){
    const R = seeded(20261113), pick = a => a[Math.floor(R()*a.length)], out = [];
    const add = (n, x, y, h, kind) => out.push({n, x, y, h, kind, flip:R()<0.5, ph:R()*6.28});
    // 树墙：后排深绿密排、前排黄绿高低错落（树冠盖住远景和地面的分界线）
    for(let x=-70; x<width+70; x+=30+R()*22) add(pick(SET.wallBack), x, wallY-14+R()*10, 74+R()*26, 'tree');
    for(let x=-50; x<width+60; x+=58+R()*48) add(pick(SET.wallFront), x, wallY+6+R()*20, 80+R()*34, 'tree');
    // 地面上零散的树、灌木、石头（离路和节点远一点，疏密错落）
    // 不挡节点：脚在节点下方（画在节点前面）的东西，整棵的高度范围都不能盖到底座、关卡号和气泡
    const clearNodes = (x,y,h,r) => nodes.every(n=>{ if(Math.hypot(n.x-x,(n.y-y)*1.6)<=70) return false;
      return !(Math.abs(n.x-x) < r+40 && y > n.y-24 && y-h < n.y+30); });
    const ok2 = (x,y,r,h) => distPath(path,x,y) > ROAD_W/2 + r && clearNodes(x,y,h,r) && out.every(q=>q.kind==='tree' && q.y<wallY+40 ? true : Math.hypot(q.x-x,q.y-y)>r*0.9);
    const scatter = (set, kind, count, hmin, hmax, ymin, ymax, r) => { let tries=0, n=0;
      while(n<count && tries<count*40){ tries++; const x=R()*width, y=ymin+R()*(ymax-ymin), h=hmin+R()*(hmax-hmin); if(!ok2(x,y,r,h)) continue; add(pick(set), x, y, h, kind); n++; } };
    const per = width/400;
    scatter(SET.mid,   'tree', Math.round(5*per), 88, 118, wallY+40, cardTop-10, 46);
    scatter(SET.small, 'tree', Math.round(4*per), 46, 64,  wallY+40, cardTop+10, 30);
    scatter(SET.bush,  'bush', Math.round(9*per), 26, 40,  wallY+34, cardTop+30, 26);
    scatter(SET.stone, 'stone',Math.round(4*per), 16, 26,  wallY+40, cardTop+20, 20);
    scatter(SET.shroom,'stone',Math.round(3*per), 12, 18,  wallY+40, cardTop+20, 14);
    // 信息卡上沿露出的前景：一排灌木和小树，卡片两侧也看得到
    for(let x=-20; x<width+40; x+=70+R()*60){ const b=R()<0.6, y=cardTop+22+R()*30, h=b?36+R()*14:58+R()*16; if(clearNodes(x,y,h,b?22:28)) add(pick(b?SET.bush:SET.small), x, y, h, b?'bush':'tree'); }
    return out;
  }
  function makeDecals(g){   // 贴地的小草、小花、小石子：画进地面层，不参与前后排序
    const R = seeded(77031), out = [];
    for(let i=0;i<g.width/7;i++){ const x=R()*g.width, y=g.wallY+20+R()*(g.chU-g.wallY-20); if(distPath(g.path,x,y)<ROAD_W/2+6) continue;
      const r=R(); out.push({n: r<0.62?'Forest_Grass':r<0.8?'Forest_Flower_01':r<0.93?'Forest_Flower_02':'Stone_Gray1_05', x, y, h: r<0.62?8+R()*4 : r<0.93?8+R()*3 : 7+R()*3, flip:R()<0.5}); }
    return out;
  }

  // ---------- 地面层（离屏画布，设备像素一一对应）----------
  function bakeGround(g, S0){
    const k = `${S.gkey}|${S0}`; if(S.bake && S.bkey===k) return S.bake;
    const need = ['Road_up_Forest','Forest_Grass','Forest_Flower_01','Forest_Flower_02','Stone_Gray1_05'].map(envImg).concat([mi('lip')]);
    if(!need.every(ok)) return null;
    // 两端各多画 OVER（拖过头回弹时不露出底色）
    const sc = g.u*S0, cw = Math.ceil((g.width+OVER*2)*sc)+2, ch = Math.ceil((g.chU-g.groundTop)*sc)+2;
    const cv = document.createElement('canvas'); cv.width=cw; cv.height=ch; const x = cv.getContext('2d');
    x.setTransform(sc,0,0,sc,OVER*sc,-g.groundTop*sc);
    x.fillStyle = rgb(GROUND); x.fillRect(-OVER-10, g.groundTop, g.width+OVER*2+20, g.chU-g.groundTop+10);
    // 树墙下面是树林深处：上沿深、往下渐渐变回草地色
    const gr = x.createLinearGradient(0, g.groundTop, 0, g.wallY+70); gr.addColorStop(0, rgb(DEEP)); gr.addColorStop(0.55, rgb(DEEP,0.85)); gr.addColorStop(1, rgb(DEEP,0));
    x.fillStyle = gr; x.fillRect(-OVER-10, g.groundTop, g.width+OVER*2+20, g.wallY+70-g.groundTop);
    // 路：Road_Forest 的颜色，两边压上 Road_up_Forest 草边（主色已换成地面色，草从路边盖进来一点）
    x.lineJoin='round'; x.lineCap='round';
    x.beginPath(); g.path.forEach((p,i)=>i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y));
    x.strokeStyle='rgba(120,92,66,.35)'; x.lineWidth=ROAD_W+3; x.stroke();
    x.strokeStyle=rgb(ROAD); x.lineWidth=ROAD_W; x.stroke();
    // 草边按短段（原图的 1/12 宽）沿曲线贴，弯道处不会伸出直线头；每段取原图里接着的那一截，花纹连续
    const lip = mi('lip'), lh = 11, lk = lh/lip.naturalHeight, segW = lip.naturalWidth/12, sw = segW*lk;
    for(const side of [-1,1]){
      let j = side<0 ? 5 : 0;
      for(let s=0; s<g.path[g.path.length-1].s; s+=sw*0.8, j++){
        const p = at(g.path, s), a = Math.atan2(p.dy,p.dx), nx = -Math.sin(a), ny = Math.cos(a);   // n = 路的法线（朝下）
        const off = (ROAD_W/2 - 3.5 + lh/2) * side, sx = (j%11)*segW;
        x.save(); x.translate(p.x - nx*off, p.y - ny*off); x.rotate(a); if(side<0) x.scale(1,-1);
        x.drawImage(lip, sx, 0, segW*1.25, lip.naturalHeight, -sw/2, -lh/2, sw*1.25, lh); x.restore(); } }
    // 大片的深浅草斑（低饱和地面上稍有变化，不是一整块平涂）：画在单独一层、把路面挖掉后再叠上来，
    // 这样路边草边（主色 = 地面色）和旁边的草地一起变深浅，不会露出一块块方形接缝
    { const pc=document.createElement('canvas'); pc.width=cw; pc.height=ch; const y=pc.getContext('2d'); y.setTransform(sc,0,0,sc,0,-g.groundTop*sc);
      const R = seeded(4242);
      for(let i=0;i<g.width/90;i++){ const cx=R()*g.width, cy=g.wallY+60+R()*(g.chU-g.wallY-60), rx=50+R()*80;
        y.save(); y.translate(cx,cy); y.scale(1,0.45); const rg=y.createRadialGradient(0,0,0,0,0,rx);
        const light=R()<0.55; rg.addColorStop(0, light?'rgba(170,205,118,.45)':'rgba(96,140,74,.22)'); rg.addColorStop(1, light?'rgba(170,205,118,0)':'rgba(96,140,74,0)');
        y.fillStyle=rg; y.beginPath(); y.arc(0,0,rx,0,7); y.fill(); y.restore(); }
      y.globalCompositeOperation='destination-out'; y.lineJoin='round'; y.lineCap='round'; y.lineWidth=ROAD_W-9;
      y.beginPath(); g.path.forEach((p,i)=>i?y.lineTo(p.x,p.y):y.moveTo(p.x,p.y)); y.stroke();
      x.save(); x.setTransform(1,0,0,1,0,0); x.drawImage(pc,0,0); x.restore(); }
    for(const d of g.decals){ const im=envImg(d.n), w=d.h*im.naturalWidth/im.naturalHeight;
      if(d.flip){ x.save(); x.translate(d.x,0); x.scale(-1,1); x.drawImage(im, -w/2, d.y-d.h, w, d.h); x.restore(); } else x.drawImage(im, d.x-w/2, d.y-d.h, w, d.h); }
    S.bake = {cv, sc}; S.bkey = k; return S.bake;
  }

  // ---------- 远景：天空 → 最远林带 → 远林，按视差慢移、横向平铺 ----------
  function drawFar(c, g, cam){
    const u=g.u, F=chap().far;
    const band = (im, bottom, h, k) => { if(!ok(im)) return; const w=h*im.naturalWidth/im.naturalHeight, off=((cam*k)%w+w)%w;
      for(let x=-off; x<c.w/u; x+=w) ctx.drawImage(im, c.x+x*u, c.y+(bottom-h)*u, w*u+1, h*u); };
    ctx.fillStyle='#c9fcfe'; ctx.fillRect(c.x, c.y, c.w, (g.groundTop+4)*u);
    band(mi(F.sky), g.wallY-18, g.wallY-18, 0.06);
    band(mi(F.far1), g.wallY-58, 66, 0.16);
    band(mi(F.far2), g.groundTop+18, 86, 0.32);
  }

  // ---------- 宠物：出战页选中的那只（营地、宠物页同一套 Spine） ----------
  function petKey(){ try{ const e=roster().find(q=>q.key===MT.sel && q.owned); if(e) return e.key; }catch(e){} return 'pug'; }
  function ensurePet(){
    const k=petKey(); if(S.pet && S.petKey===k) return S.pet;
    S.petKey=k; S.pet = PET_SPINE[k] ? newSpine(PET_SPINE[k]) : newMon(PET_MON[k],'Idle'); S.petAnim=null; return S.pet; }
  function petPlay(a){ const v=S.pet; if(!v || S.petAnim===a) return; S.petAnim=a;
    if(v.kind==='spine') v.st.setAnimation(0, a, true); else v.m.play(a==='Walk'?'Walk':'Idle', {restart:true}); }
  function drawPet(x, y, dt, u){
    const v=ensurePet(), key=S.petKey; if(v.kind==='spine'){ v.st.update(dt); v.st.apply(v.sk); } else v.m.update(dt);
    const dm = v.kind==='spine' ? {h:v.sd.h, w:v.sd.w} : MONB[v.name]; if(!dm) return;
    const h=(PET_SIZE[key]||0.65)*108*u, s=h/dm.h, faceR=S.petFace>0, flip = v.kind==='mon' ? faceR : !faceR;
    groundShadow(x, y, h*0.8, 0.8);
    drawLive(v, s, flip, {hpx:h, cs:h/(PET_SIZE[key]||0.65)}, x, y);
  }

  // ---------- 气泡（Fantasy Hero BubbleFrame_01，和营地同一套）----------
  function bubble(cx, by, size, draw){
    const w=size*1.1, h=size, x=cx-w/2, y=by-h, k=size/72, bg=MT_UI.box, sh='#cdbfb3';
    btnShadow(x, y, w, h, h*0.3);
    mtNine4(heroT('BubbleFrame_01_Bg', bg), x, y, w, h, [26,26,26,25], k);
    mtNine4(heroT('BubbleFrame_01_BgShadow', sh), x+1.6*k, y+h-17.8*k, w-3.23*k, 13*k, [23,0,23,0], k);
    drawImg(heroT('BubbleFrame_01_ArrowBg', bg), cx-11.2*k, y+h-10.2*k, 31*k, 37*k);
    drawImg(heroT('BubbleFrame_01_ArrowShadow', sh), cx-11.2*k, y+h-8.85*k, 31*k, 30*k);
    draw(cx, y+h*0.47, h*0.8);
  }

  // ---------- 节点 ----------
  function nodeState(i){ return P.cleared[levels()[i].id] ? 'done' : unlocked(i) ? 'cur' : 'lock'; }
  function nodeW(n){ return (n.big?74:58); }
  function drawNode(n, sx, sy, u){
    const st=nodeState(n.i), im=mi(st==='done'?'node_green':'node_gray'); if(!ok(im)) return;
    let pop = S.pop[n.l.id]; const pk = pop!=null ? ease.outBack(clamp01(pop/0.45)) : 1;
    const sh = S.shake[n.l.id] ? Math.sin(S.shake[n.l.id]*60)*4*u*S.shake[n.l.id]/0.35 : 0;
    const w=nodeW(n)*u*pk, h=w*im.naturalHeight/im.naturalWidth*0.58;
    groundShadow(sx+sh, sy+h*0.32, w*1.05, 0.7);
    ctx.drawImage(im, sx+sh-w/2, sy-h/2, w, h);
    if(st==='lock'){ ctx.save(); ctx.globalAlpha=0.18; ctx.fillStyle='#2a2440'; ctx.beginPath(); ctx.ellipse(sx+sh, sy-h*0.06, w*0.46, h*0.4, 0, 0, 7); ctx.fill(); ctx.restore(); }
  }
  function drawRing(sx, sy, w, a, col){
    const g=heroT('Image_Glow_Circle_03', col); if(!ok(g)) return;
    ctx.save(); ctx.globalAlpha=a; ctx.globalCompositeOperation='lighter'; ctx.drawImage(g, sx-w/2, sy-w*0.3, w, w*0.6); ctx.restore(); }

  // ---------- 主绘制 ----------
  function draw(lay){
    const now=performance.now(), dt=Math.min(0.05,(now-(S.last||now))/1000); S.last=now; S.t+=dt; S.lay=lay;
    const c=lay.content, g=geometry(c), u=g.u, L=levels(), m=ctx.getTransform(), S0=m.a;
    const vw=c.w/u, maxCam=Math.max(0, g.width-vw), si=selIdx();
    if(S.cam==null){ S.cam=clamp(g.nodes[si].x-vw*0.42, 0, maxCam); }
    if(S.petS==null){ S.petS=g.nodes[si].s; }
    // 解锁动画：胜利回来先停在打过的那关，0.5 秒后新关弹出、宠物跑过去
    if(S.anim){ const A=S.anim; A.t+=dt;
      if(A.t>0.5 && !A.popped){ A.popped=true; S.pop[A.to]=0; sfx('star'); }
      if(A.t>0.9 && !A.go){ A.go=true; const ni=L.findIndex(l=>l.id===A.to); if(ni>=0){ P.sel=A.to; save(); S.petTo=g.nodes[ni].s; } }
      if(A.t>3) S.anim=null; }
    for(const k in S.pop){ S.pop[k]+=dt; if(S.pop[k]>0.6) delete S.pop[k]; }
    for(const k in S.shake){ S.shake[k]-=dt; if(S.shake[k]<=0) delete S.shake[k]; }
    // 镜头：拖动中跟手；松手后惯性；超出两端时回弹；宠物在跑时镜头跟着
    S.cam=clamp(S.cam, -RUBBER, maxCam+RUBBER);
    if(!S.drag){ S.cam+=S.vel*dt; S.vel*=Math.pow(0.03,dt);
      if(S.cam<0){ S.cam+=(0-S.cam)*Math.min(1,dt*12); S.vel=0; } if(S.cam>maxCam){ S.cam+=(maxCam-S.cam)*Math.min(1,dt*12); S.vel=0; }
      if(S.follow!=null){ S.cam+=(clamp(S.follow-vw*0.45,0,maxCam)-S.cam)*Math.min(1,dt*5); } }
    // 宠物沿路移动
    if(S.petTo!=null){ const d=S.petTo-S.petS, step=Math.min(Math.abs(d), 300*dt);
      if(Math.abs(d)<0.5){ S.petS=S.petTo; S.petTo=null; S.follow=null; S.followOff=false; petPlay('Idle'); }
      else { S.petS+=Math.sign(d)*step; S.petFace=Math.sign(at(g.path,S.petS).dx*Math.sign(d))||S.petFace; petPlay('Walk'); S.follow = S.followOff||S.drag ? null : at(g.path,S.petS).x; } }   // 宠物跑的时候玩家拖过地图：这一趟不再拉回镜头
    else petPlay('Idle');
    const camS = Math.round(S.cam*u*S0)/(u*S0);   // 对齐到设备像素：地面层和树、节点用同一个镜头位置
    const X = wx => c.x+(wx-camS)*u, Y = wy => c.y+wy*u;

    ctx.save(); ctx.beginPath(); ctx.rect(c.x,c.y,c.w,c.h); ctx.clip();
    drawFar(c, g, camS);
    const B=bakeGround(g, S0);
    if(B){ ctx.save(); ctx.setTransform(1,0,0,1,0,0); const sx=Math.round((camS+OVER)*u*S0), dx=Math.round(m.a*c.x+m.e), dy=Math.round(m.a*(c.y+g.groundTop*u)+m.f), w=Math.min(B.cv.width-sx, Math.ceil(c.w*S0)+1);
      if(w>0) ctx.drawImage(B.cv, sx, 0, w, B.cv.height, dx, dy, w, B.cv.height); ctx.restore(); }
    else { ctx.fillStyle=rgb(GROUND); ctx.fillRect(c.x, Y(g.groundTop), c.w, c.h); }
    // 当前关脚下的呼吸光圈、选中关的金色光圈（贴地，画在底座下面）
    const fi=frontierIdx(), fn=g.nodes[fi];
    if(nodeState(fi)==='cur') drawRing(X(fn.x), Y(fn.y), nodeW(fn)*u*2.1, 0.55+0.35*Math.sin(S.t*3.2), '#ffe27a');
    // 前后排序：树、灌木、石头、底座、宠物、宝箱都按脚的 y
    const items=[], vis = (x,w) => X(x)+w*u > c.x-20 && X(x)-w*u < c.x+c.w+20;
    for(const q of g.props){ const w=q.h*ar(q.n); if(vis(q.x, w)) items.push({y:q.y, f:()=>drawProp(q, X(q.x), Y(q.y), u)}); }
    for(const n of g.nodes){ if(!vis(n.x, 80)) continue; items.push({y:n.y-1, f:()=>drawNode(n, X(n.x), Y(n.y), u)});
      if(n.l.boss){ const ch=mi('chest'); items.push({y:n.y-6, f:()=>{ if(ok(ch)){ const s=44*u; groundShadow(X(n.x+44), Y(n.y-6), s*0.9, 0.7); drawImgC(ch, X(n.x+44), Y(n.y-6)-s*0.42, s); } }}); } }
    const pp=at(g.path, S.petS); items.push({y:pp.y+0.5, f:()=>drawPet(X(pp.x), Y(pp.y)+2*u, dt, u)});
    items.sort((a,b)=>a.y-b.y).forEach(it=>it.f());
    // 关卡号、精英 / Boss / 新宠物气泡
    for(const n of g.nodes){ if(!vis(n.x,80)) continue; const st=nodeState(n.i), sx=X(n.x), sy=Y(n.y);
      text(n.l.id, sx, sy+19*u, (n.big?17:15)*u, st==='lock'?'#e8e4ee':'#fff', 'center', 800, st==='lock'?'#5a566a':'#2c3a2a');
      const bob=Math.sin(S.t*2.4+n.i)*2*u, onPet = Math.abs(pp.x-n.x)<20;
      const top = sy - (onPet ? 66 : 20)*u + bob;
      if(n.l.elite || n.l.boss){ const key=n.l.boss||n.l.elite; bubble(sx, top, (n.l.boss?44:36)*u, (cx,cy,s)=>{ const pc=MONPORT[key]; if(pc) ctx.drawImage(pc, cx-s*0.62, cy-s*0.74, s*1.24, s*1.24); }); }
      else if(n.l.newPet && !P.cleared[n.l.id]){ bubble(sx, top, 36*u, (cx,cy,s)=>{ const sil=silOf(n.l.newPet, '#6b5f5d'); if(sil) ctx.drawImage(sil, cx-s*0.62, cy-s*0.74, s*1.24, s*1.24); }); } }
    // 地图右端：下一章入口
    const nx=chap().id+1, nc=D.chapters.find(q=>q.id===nx);
    if(nc && S.cam>maxCam-60){ const bw=118*u, bh=36*u, bx=c.x+c.w-bw-10*u, by=Y(g.wallY+34)-bh/2, a=clamp01((S.cam-(maxCam-60))/60);
      ctx.save(); ctx.globalAlpha=a; ctx.save(); rr(bx,by,bw,bh,bh/2); ctx.fillStyle='rgba(58,49,51,.82)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#2a2224'; ctx.stroke(); ctx.restore();
      text(`第 ${nx} 章  ›`, bx+bw/2, by+bh/2+1, 15*u, '#fff', 'center', 800, '#2a2224'); ctx.restore();
      if(a>0.6) addHit({x:bx,y:by,w:bw,h:bh}, ()=>{ sfx('deny'); toast(P.cleared[L[L.length-1].id] ? `第 ${nx} 章「${nc.name}」即将开放` : `先通关 ${L[L.length-1].id}`); }); }
    ctx.restore();
    drawHud(lay, c, g, u);
    drawCard(c, g, u, L[selIdx()]);
  }
  function drawProp(q, x, y, u){ const im=envImg(q.n); if(!ok(im)) return; const h=q.h*u, w=h*im.naturalWidth/im.naturalHeight;
    ctx.save(); ctx.translate(x, y);
    const sw = q.kind==='tree'?0.012:q.kind==='bush'?0.02:0; if(sw){ const k=Math.sin(S.t*1.1+q.ph)*sw+Math.sin(S.t*2.3+q.ph*1.7)*sw*0.35; ctx.transform(1,0,k,1,0,0); }
    if(q.flip) ctx.scale(-1,1); ctx.drawImage(im, -w/2, -h, w, h); ctx.restore(); }

  // ---------- 顶部：章节名 + 进度、终关奖励、资源条 ----------
  function drawHud(lay, c, g, u){
    const ch=chap(), L=levels(), n=L.filter(l=>P.cleared[l.id]).length, top=c.y+(lay.top||0);
    // 右上角是资源条（金币、星星），章节名放第二行
    text(`第 ${ch.id} 章  ${ch.name}`, c.x+14*u, top+64*u, 20*u, '#fff', 'left', 800, '#2c3a2a');
    ctx.font=`800 ${20*u}px ${FONT}`; const tw=ctx.measureText(`第 ${ch.id} 章  ${ch.name}`).width;
    text(`${n}/${L.length}`, c.x+14*u+tw+10*u, top+65*u, 14*u, '#fff', 'left', 800, '#2c3a2a');
    // 终关奖励：宝箱按钮，点开 / 收起奖励列表
    const bx=c.x+12*u, by=top+86*u, bw=96*u, bh=34*u;
    ctx.save(); rr(bx,by,bw,bh,bh/2); ctx.fillStyle='rgba(58,49,51,.82)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#2a2224'; ctx.stroke(); ctx.restore();
    drawImgC(mi('chest'), bx+16*u, by+bh/2-2*u, 38*u);
    text('终关奖励', bx+60*u, by+bh/2+1, 13*u, '#fff', 'center', 800, '#2a2224');
    addHit({x:bx,y:by,w:bw,h:bh}, ()=>{ S.popup=!S.popup; sfx('ui'); });
    if(S.popup){ const items=ch.final||[], pw=(items.length*58+20)*u, ph=78*u, px=bx, py=by+bh+8*u;
      btnShadow(px, py, pw, ph, 12*u); ctx.save(); rr(px,py,pw,ph,12*u); ctx.fillStyle=MT_UI.panel; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=MT_UI.border||'#4f4644'; ctx.stroke(); ctx.restore();
      text(`${L[L.length-1].id} 首次通关`, px+pw/2, py+14*u, 12*u, MT_UI.txt, 'center', 800, false);
      items.forEach((r,i)=>rewardIcon(r, px+(20+29+i*58)*u, py+46*u, 40*u));
      addHit({x:px,y:py,w:pw,h:ph}, ()=>{ S.popup=false; }); }
    if(typeof drawResBar==='function') drawResBar(lay);
  }
  function rewardIcon(r, cx, cy, s){
    const n = r[0]==='shard' ? r[2] : r[1];
    if(r[0]==='coin') drawImgC(coinIcon(), cx, cy, s*0.9); else if(r[0]==='star') drawImgC(icon('Star_Altar_05_Star'), cx, cy, s*0.9); else shardIcon(r[1], cx, cy, s*1.05);
    text(`×${n}`, cx+s*0.46, cy+s*0.36, s*0.36, '#fff', 'right', 800, '#3a3133');
  }

  // ---------- 下方信息卡 ----------
  function drawCard(c, g, u, l){
    /* 53 版：去掉路数后，没有精英 / Boss / 解锁的关卡第二行是空的 → 卡片矮 34（下沿不动、上沿下移），不留一行空白 */
    const cut=(l.boss||l.elite||l.unlock)?0:34, w=Math.min(c.w-24*u, 420*u), x=c.x+(c.w-w)/2, y=c.y+(g.cardTop+cut)*u, h=(CARD_H-cut)*u, done=!!P.cleared[l.id];
    btnShadow(x, y, w, h, 16*u); ctx.save(); rr(x,y,w,h,16*u); ctx.fillStyle=MT_UI.panel; ctx.fill(); ctx.lineWidth=2.5; ctx.strokeStyle=MT_UI.border||'#4f4644'; ctx.stroke(); ctx.restore();
    addHit({x,y,w,h}, ()=>{});   // 卡片上点空白处不穿透到地图
    // 第一行：关卡号 + 名字；右边状态
    text(l.id, x+18*u, y+30*u, 26*u, MT_UI.txt, 'left', 800, false);
    ctx.font=`800 ${26*u}px ${FONT}`; const iw=ctx.measureText(l.id).width;
    text(l.name, x+18*u+iw+10*u, y+31*u, 18*u, MT_UI.txt, 'left', 800, false);
    const tag = done ? '已通关' : '未通关', tc = done ? '#5f8a57' : '#b07a3a';
    ctx.font=`800 ${12*u}px ${FONT}`; const tw=ctx.measureText(tag).width+18*u;
    ctx.save(); rr(x+w-tw-14*u, y+19*u, tw, 22*u, 11*u); ctx.fillStyle=tc; ctx.fill(); ctx.restore(); text(tag, x+w-14*u-tw/2, y+30.5*u, 12*u, '#fff', 'center', 800, false);
    // 第二行：精英 / Boss、通关解锁
    let cx=x+18*u; const cy=y+64*u;
    const chip = (s, lead) => { ctx.font=`800 ${13*u}px ${FONT}`; const lw=lead?24*u:0, cw=ctx.measureText(s).width+20*u+lw;
      ctx.save(); rr(cx, cy-13*u, cw, 26*u, 13*u); ctx.fillStyle=MT_UI.box; ctx.fill(); ctx.lineWidth=1.5; ctx.strokeStyle='rgba(79,70,68,.22)'; ctx.stroke(); ctx.restore();
      if(lead) lead(cx+15*u, cy); text(s, cx+10*u+lw+(cw-20*u-lw)/2, cy+1, 13*u, MT_UI.txt, 'center', 800, false); cx+=cw+8*u; };
    /* 53 版（用户 2026-11-13：「一条路删掉」）：路数是设计讨论里的细节，玩家不需要，不显示 */
    if(l.boss||l.elite){ const key=l.boss||l.elite, nm=(DATA.enemies[key]&&DATA.enemies[key].cn||key).replace(/ · .*/,'');
      chip(`${l.boss?'Boss':'精英'} ${nm}`, (px,py)=>{ const pc=MONPORT[key]; if(pc) ctx.drawImage(pc, px-12*u, py-14*u, 24*u, 24*u); }); }
    if(l.unlock) chip(`通关解锁：${l.unlock}`);
    // 第三行：奖励 + 开始按钮
    const rw = done ? l.again : l.first;
    text(done?'再次通关':'首次通关', x+18*u, y+(102-cut)*u, 12*u, MT_UI.sub, 'left', 800, false);
    (rw||[]).forEach((r,i)=>rewardIcon(r, x+(40+i*62)*u, y+(142-cut)*u, 42*u));
    const bw=132*u, bh=54*u, bx=x+w-bw-14*u, by=y+h-bh-16*u;
    heroButton(true, bx, by, bw, bh, '开始战斗');
    addHit({x:bx,y:by,w:bw,h:bh}, ()=>start(l.id));
  }

  // ---------- 操作 ----------
  function start(id){ S.playing=id; sfx('ui'); if(typeof CHAPTER_MAP.onStart==='function') CHAPTER_MAP.onStart(id); }
  function tapAt(x, y){
    const g=S.geo, c=S.lay&&S.lay.content; if(!g||!c) return; const u=g.u, camS=S.cam;
    if(S.popup){ S.popup=false; return; }
    let best=null, bd=1e9;
    for(const n of g.nodes){ const sx=c.x+(n.x-camS)*u, sy=c.y+n.y*u, d=Math.hypot(x-sx, (y-sy)*1.3); if(d<bd){ bd=d; best=n; }
      if(n.l.elite||n.l.boss||n.l.newPet){ const by=sy-40*u; const d2=Math.hypot(x-sx, y-by); if(d2<bd){ bd=d2; best=n; } } }
    if(!best || bd>42*u) return;
    const i=best.i;
    if(!unlocked(i)){ S.shake[best.l.id]=0.35; sfx('deny'); toast(`先通关 ${levels()[frontierIdx()].id}`); return; }
    sfx('ui'); P.sel=best.l.id; save(); S.petTo=best.s; S.followOff=false;
    if(S.anim) S.anim.go=true;   // 解锁动画还没把宠物送到新关：以玩家点的为准
  }
  function down(x, y, pid){ if(S.drag) return; S.drag={pid, sx:x, sy:y, cam0:S.cam, moved:false, samples:[{x, t:performance.now()}]}; S.vel=0; S.follow=null; S.followOff=true; }
  function move(x, y){ const d=S.drag; if(!d || !S.geo) return; const u=S.geo.u, dx=x-d.sx;
    if(!d.moved && Math.hypot(dx, y-d.sy)>8) d.moved=true; if(!d.moved) return;
    const maxCam=Math.max(0, S.geo.width-S.lay.content.w/u); let v=d.cam0-dx/u; if(v<0) v*=0.35; else if(v>maxCam) v=maxCam+(v-maxCam)*0.35; S.cam=clamp(v, -RUBBER, maxCam+RUBBER);
    d.samples.push({x, t:performance.now()}); if(d.samples.length>10) d.samples.shift(); }
  function up(x, y){ const d=S.drag; S.drag=null; if(!d) return;
    if(!d.moved){ tapAt(x, y); return; }
    const now=performance.now(), s=d.samples.filter(q=>now-q.t<100); if(s.length>1){ const a=s[0], b=s[s.length-1]; S.vel=-(b.x-a.x)/Math.max(30,b.t-a.t)*1000/S.geo.u; } }
  // 胜利后调用：记通关，回到地图时播解锁动画
  function markCleared(id){
    const L=levels(), i=L.findIndex(l=>l.id===id); if(i<0) return;
    const first=!P.cleared[id]; P.cleared[id]=true; save(); if(!first) return;
    const nxt=L[i+1]; S.cam=null; P.sel=id; S.petS=null; S.petTo=null; S.follow=null; S.followOff=false;
    if(nxt) S.anim={t:0, from:id, to:nxt.id};
  }
  function reset(){ P.cleared={}; P.sel=null; save(); S.cam=null; S.petS=null; S.petTo=null; S.anim=null; S.follow=null; S.followOff=false; }
  function preset(n){ reset(); levels().slice(0,n).forEach(l=>P.cleared[l.id]=true); save(); }   // 测试用：前 n 关算已通关
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));

  // ---------- 接进游戏：战斗页换成地图；地图上的拖动、点击在 meta.js 之前拦下（营地同样做法）----------
  const on = () => typeof MT!=='undefined' && typeof READY!=='undefined' && READY && !MT.inBattle && MT.tab==='battle';
  window.addEventListener('pointerdown', e=>{ if(!on()) return; const x=PX(e), y=PY(e);
    if(MT.hits.some(q=>inR(q.r,x,y))) return;   // 按钮、底栏交给 meta.js
    e.stopImmediatePropagation(); MT.press=null; down(x, y, e.pointerId); }, {capture:true});
  const live = e => { if(!S.drag || e.pointerId!==S.drag.pid) return false; if(!on()){ S.drag=null; return false; } return true; };   // 拖到一半切走页面 / 进了战斗：放掉，不再吃事件
  window.addEventListener('pointermove', e=>{ if(!live(e)) return; e.stopImmediatePropagation(); move(PX(e), PY(e)); }, {capture:true});
  window.addEventListener('pointerup', e=>{ if(!live(e)) return; e.stopImmediatePropagation(); up(PX(e), PY(e)); }, {capture:true});
  window.addEventListener('pointercancel', ()=>{ S.drag=null; }, {capture:true});
  window.addEventListener('blur', ()=>{ S.drag=null; });
  window.addEventListener('wheel', e=>{ if(!on() || !S.geo) return; const mx=Math.max(0, S.geo.width-S.lay.content.w/S.geo.u); S.cam=clamp(S.cam+(e.deltaX||e.deltaY)*0.8/S.geo.u, 0, mx); S.vel=0; S.follow=null; S.followOff=true; }, {passive:true});
  document.addEventListener('DOMContentLoaded', ()=>{
    if(typeof drawBattleEntry==='function') drawBattleEntry = lay => CHAPTER_MAP.draw(lay);   // meta.js 的战斗页入口换成地图
    if(typeof HOOKS!=='undefined') HOOKS.push(type=>{ if(type==='win' && S.playing) markCleared(S.playing); });
  });

  const API = { draw, markCleared, reset, preset, onStart:(id)=>{ if(typeof startBattle==='function') startBattle(); },
    get progress(){ return JSON.parse(JSON.stringify(P)); }, S };
  return API;
})();
window.CHAPTER_MAP = CHAPTER_MAP;
