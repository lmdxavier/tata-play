'use strict';
/* =====================================================================
   75 版（用户 2026-11-15）：相邻关系的三段表现 —— 详见 docs/vfx-design.md「75 版」
   ① 相邻同属性加成：新宠物弹出一颗属性小弹（火球 / 水团 / 绿焰），伪 3D 抛物线（升空变大、头朝上 → 落下尾朝上）
      落到旁边宠物的「+%」标签上，数字往上滚；再由旁边的宠物反向弹回一颗给新宠物。
   ② 同属性 3 连：从新宠物开始沿连线依次点亮脚下光圈（亮起明显 → 淡到很淡常驻）；只有 2 只时不再画脚下光。
   ③ 稀有度链接：高稀有度宠物旁边有低稀有度宠物（同稀有度不连，炸弹类不算）时，高稀有度伸出触手扬起 → 啪地抽下 → 收成持续波动的柔光带（77 版，照守山门），
      被链接方（低稀有度）属性颜色的能量源源不断地从低稀有度流向高稀有度。只是表现，数值效果待定。
   79 版（用户 2026-11-15 在演示页 _dev\链子对比\链接特效设计.html 定稿）：链子从高稀有度身上伸出（力从发出端传到末端、整条甩动后平静），
      弹射改成程序画的 3D 能量球（角色身上 → 对方加成条，抛物线 + 斜镜头透视、拖尾、落下融化），加成条白闪鼓起 + 火花。参数见 docs/vfx-design.md「78 版」节末。
   顺序（84 版改）：先所有弹球（各邻居同时 弹出 → 弹回），全部落下后 3 连依次点亮，3 连结束后才甩触手链接；86 版起链接一条一条来，顺序 上 → 下 → 左 → 右。
   画法全部是贴图（属性弹序列帧、胶囊 / 圆点小图旋转拉伸），不画会变形的路径——不增加每帧的光栅重画和贴图上传。
   ===================================================================== */
const BONUS = (()=>{
  const RANK = {common:0, rare:1, epic:2, legend:3};
  const rankOf = p => RANK[p.def.rarity||'common']||0;
  const ELC = {fire:'#ff7a3d', water:'#3fb4ff', grass:'#6be05a', light:'#ffd84a', dark:'#b07cff', none:'#e6e6e6'};
  const T = {land:0.2, fly:0.40, gap:0.14, hop:0.2, hold:0.3, up:0.3, strike:0.1, settle:0.34, roll:0.32};
  const S = new WeakMap();
  const st = p => { let s=S.get(p); if(!s){ s={shown:p.nSame||0, inbound:0, roll:null, pop:0, glow:0, lit:false, wait:0}; S.set(p,s); } return s; };
  const ids = new WeakMap(); let nid=1; const idOf = p => { let i=ids.get(p); if(!i){ i=nid++; ids.set(p,i); } return i; };
  let clock=0; const jobs=[], queue=[], bolts=[], pulses=[], bursts=[], links=new Map(), pending=new Map();
  let landRun=0, landLast=-9;   // 80 版：0.7 秒内连续落下的次数 → 音调逐个升高
  const at = (d,fn) => jobs.push({t:clock+d, fn});
  const alive = p => G.pets.includes(p);
  const adj = (a,b) => Math.abs(a.lane-b.lane)+Math.abs(a.col-b.col)===1;
  const mine = p => p.def.shape==='mine';
  const sameEl = (a,b) => !mine(a) && !mine(b) && a.def.el===b.def.el;
  const linkable = (a,b) => !mine(a) && !mine(b) && rankOf(a)!==rankOf(b);
  const DIRS = [[0,1],[1,0],[0,-1],[-1,0]];
  const nbrs = p => { const r=[]; for(const [dl,dc] of DIRS){ const o=petAt(p.lane+dl,p.col+dc); if(o && o!==p) r.push(o); } return r; };
  const ftOf = p => feet(p.lane, p.col+0.5);
  const labelPos = p => { const f=ftOf(p); return {x:f.x, y:f.y+L.cs*0.16}; };
  const bodyPos = (p,h) => { const f=ftOf(p); return {x:f.x, y:f.y-L.cs*h}; };
  const eOut = k => 1-Math.pow(1-k,3);
  const snd = (name, p, o) => { try{ COMBO.play(name, {x:p.x, y:p.y}, o); }catch(e){} };
  // 80 版（用户 2026-11-15 拿塔塔冒险队弹珠做参照：「爽感不够」）：爆点 = 白闪核 + 放射光线 + 冲击环，全部程序画的柔光（能量不用贴图素材）
  // big 0～1：0.35 小（加成落下）/ 0.6 中（3 连点亮）/ 1 大（链子锁上）
  const burst = (x, y, col, big) => bursts.push({x, y, col, big, t:0, rot:Math.random()*6.28, n:big>=0.9?12:big>=0.5?9:7});
  const freezeV = (v, s) => { if(v) v.freeze=Math.max(v.freeze||0, s); };

  // ---------- 小图：胶囊、圆点（每种颜色只画一次） ----------
  const CAP=new Map();
  function capImg(color){ let c=CAP.get(color); if(!c){ c=document.createElement('canvas'); c.width=64; c.height=16; const g=c.getContext('2d'); g.strokeStyle=color; g.lineCap='round'; g.lineWidth=14; g.beginPath(); g.moveTo(8,8); g.lineTo(56,8); g.stroke(); CAP.set(color,c); } return c; }
  function seg(im, p, q, w){ const dx=q.x-p.x, dy=q.y-p.y, len=Math.hypot(dx,dy); ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(Math.atan2(dy,dx)); ctx.drawImage(im, -w/2, -w/2, len+w, w); ctx.restore(); }

  // ---------- 序列 ----------
  // 84 版（用户 2026-11-15）：顺序改成按类别分三段 —— 先所有弹球（各邻居同时弹出 → 弹回），全部弹完再 3 连依次点亮，最后才甩链子
  function startSeq(P, delay){
    const s=st(P); s.shown=0; s.roll=null;
    const grp = P.group && P.group.size>=3 && !mine(P) ? P.group : null;
    const done=new Set(), ns=nbrs(P), same=ns.filter(n=>sameEl(P,n));
    let t=T.land+(delay||0);
    // ① 弹球
    for(const n of same){ st(n).inbound++; s.inbound++; at(t, ()=>launch(P,n)); at(t+T.fly+T.gap, ()=>launch(n,P)); }
    if(same.length) t+=2*(T.fly+T.gap);
    // ② 3 连：从 P 经每个同组邻居往外依次点亮（多条分支同时传）
    if(grp){ let dmax=0; for(const n of same) if(grp.members.includes(n)) dmax=Math.max(dmax, chain(P, n, grp, t, done)); t+=dmax; }
    // ③ 稀有度链接：86 版（用户 2026-11-15）改成一条一条依次甩，顺序按屏幕方向 上 → 下 → 左 → 右（按画面位置判断，横竖屏都对）；
    //    前一条碰到对方（TE）后再隔 LINK_GAP 甩下一条
    const f0=ftOf(P), dirRank = n => { const f=ftOf(n), dx=f.x-f0.x, dy=f.y-f0.y; return Math.abs(dy)>=Math.abs(dx) ? (dy<0?0:1) : (dx<0?2:3); };
    let tk=t;
    for(const n of ns.filter(n=>linkable(P,n)).sort((a,b)=>dirRank(a)-dirRank(b))){
      const hi=rankOf(P)>rankOf(n)?P:n, lo=hi===P?n:P, k=idOf(hi)+'>'+idOf(lo), tt=tk;
      pending.set(k, clock+tt+0.5); links.delete(k);
      at(tt, ()=>{ pending.delete(k); if(alive(hi)&&alive(lo)&&adj(hi,lo)) whip(hi,lo,k); });
      tk+=TE+LINK_GAP;
    }
  }
  function launch(a, b){
    if(!alive(a)||!alive(b)){ const sb=S.get(b); if(sb) sb.inbound=Math.max(0,sb.inbound-1); return; }
    const A=bodyPos(a,HB); snd('加成-弹出', A, {fixed:true});   // 81 版：S_UI_BT_COMMON 原版，固定音调
      // 79 版：从角色身体正中弹出，起点不再有加成条反应
    const va=visOf(a,true); va.squash=Math.max(va.squash||0, 0.09); burst(A.x, A.y, bcol(a.def.el), 0.25);   // 80 版：发射那一下身体一缩、身上亮一圈
    bolts.push({a, b, el:a.def.el, t:0, A, Bp:labelPos(b), landed:false, id0:idOf(a)*0.37+clock});
  }
  function land(bt){
    const b=bt.b, s=st(b); s.inbound=Math.max(0,s.inbound-1);
    if(!alive(b)) return;
    const B=labelPos(b), to=Math.min(b.nSame||0, s.shown+1);
    if(to!==s.shown){ s.roll={from:s.shown, to, t:0}; s.shown=to; }
    s.hit=clock; bt.Bp=B;   // 79 版：加成条白闪、鼓起再弹两下、迸火花（drawLabel / drawHit）
    if(clock-landLast<0.7) landRun=Math.min(landRun+1, 7); else landRun=0; landLast=clock;
    snd('加成-落下', B, {rate:Math.pow(2, landRun*2/12), fixed:true});   // 81 版：SFX_Object_Place_Shiny_2，只按次数升调、不再随机抖   // 80 版：连续落下每次升一个全音（最多 7 级）
    // 83 版：用户「弹射落下的效果恢复成最开始的花火样子」→ 去掉 80 版加的爆光和顿帧，只留 79 版的白闪 + 12 颗火花（drawHit）
  }
  // 从新宠物 P 经邻居 n 往外依次点亮（不回头经过 P）；返回这一段用的时间
  function chain(P, n, grp, t0, done){
    const depth=new Map([[n,1]]), order=[[n,P]], seen=new Set([P,n]);
    for(let i=0;i<order.length;i++){ const [a]=order[i];
      for(const o of nbrs(a)) if(!seen.has(o) && grp.members.includes(o)){ seen.add(o); depth.set(o, depth.get(a)+1); order.push([o,a]); } }
    let maxD=0;
    if(!done.has(P)){ done.add(P); st(P).wait++; at(t0, ()=>light(P, 0)); }
    for(const [m,from] of order){ if(done.has(m)) continue; done.add(m); const d=depth.get(m); maxD=Math.max(maxD,d); st(m).wait++;
      at(t0+(d-1)*T.hop, ()=>{ if(alive(m)&&alive(from)) pulses.push({a:from, b:m, el:m.def.el, t:0}); });
      at(t0+d*T.hop, ()=>light(m, d)); }
    return maxD ? maxD*T.hop+T.hold : 0;
  }
  // 84 版（用户 2026-11-15）：3 连沿连线每点亮一只响一下（85 版换回 SFX_Object_Place_Shiny_2，升调、变响幅度保持 84），和点亮同一帧；
  // 升调、变响要明显：第 n 只升 n 个全音（最多 7 级 = 高 14 个半音），音量从 -3dB 起每只 +2dB（最多 +6dB）；solo = 不和前一声分摊音量
  function light(m, n){ const s=st(m); s.wait=Math.max(0,s.wait-1); if(!alive(m)) return; s.lit=true; s.glow=1; n=n||0;
    const k=Math.min(n,7); snd('三连-传导', ftOf(m), {rate:Math.pow(2, 2*k/12), vol:Math.pow(10, Math.min(6, -3+2*k)/20), fixed:true, solo:true});
    const f=ftOf(m); flashAt(f.x, f.y-L.cs*0.05, 1.1, 0.2, undefined, ELC[m.def.el]); sparks(f.x, f.y-L.cs*0.1, 12, {x:0,y:-1}, 1.6, 3.6, ELC[m.def.el], 0.45);   // 80 版：火花 5 → 12
    const bp=bodyPos(m,HB); burst(bp.x, bp.y, ELC[m.def.el], 0.6);
    const v=visOf(m,true); v.pop=0.25; }
  function whip(hi, lo, k){ links.set(k, {hi, lo, t:0, hit:false, id:idOf(hi)*7+idOf(lo)}); const v=visOf(hi,true); v.squash=0.1; }

  // ---------- 每帧 ----------
  function update(dt){
    clock+=dt;
    if(queue.length) for(const q of queue.splice(0)) if(alive(q.p)) startSeq(q.p, q.d);
    if(jobs.length){ const due=jobs.filter(j=>j.t<=clock).sort((a,b)=>a.t-b.t); if(due.length){ for(const j of due) jobs.splice(jobs.indexOf(j),1); for(const j of due) j.fn(); } }
    for(const p of G.pets){ const s=st(p), want=p.nSame||0;
      if(s.inbound===0 && s.shown!==want){ s.roll={from:s.shown, to:want, t:0}; s.shown=want; }
      if(s.roll){ s.roll.t+=dt; if(s.roll.t>=T.roll) s.roll=null; }
      if(s.pop>0) s.pop=Math.max(0,s.pop-dt);
      if(s.glow>0) s.glow=Math.max(0,s.glow-dt*1.25);
      const big=p.group&&p.group.size>=3&&!mine(p); if(!big) s.lit=false; else if(!s.lit && s.wait===0) s.lit=true; }
    for(let i=bolts.length-1;i>=0;i--){ const b=bolts[i]; b.t+=dt; if(!b.landed && b.t>=T.fly){ b.landed=true; land(b); } if(b.t>=T.fly+0.6) bolts.splice(i,1); }   // 落下后再留 0.6 秒画融化和火花
    for(let i=pulses.length-1;i>=0;i--){ pulses[i].t+=dt; if(pulses[i].t>=T.hop) pulses.splice(i,1); }
    for(let i=bursts.length-1;i>=0;i--){ bursts[i].t+=dt; if(bursts[i].t>=BU.life) bursts.splice(i,1); }
    // 链接：和当前相邻关系对齐（铲掉 / 移开就断；其他原因出现的新相邻直接抽一次）
    const want=new Set();
    for(const p of G.pets){ if(mine(p)) continue; for(const o of [petAt(p.lane+1,p.col), petAt(p.lane,p.col+1)]) if(o && linkable(p,o)){ const hi=rankOf(p)>rankOf(o)?p:o, lo=hi===p?o:p; want.add(idOf(hi)+'>'+idOf(lo));
      const k=idOf(hi)+'>'+idOf(lo); if(!links.has(k) && !(pending.has(k) && pending.get(k)>clock) && !(hi.move||lo.move)) whip(hi,lo,k); } }
    for(const k of [...links.keys()]) if(!want.has(k)) links.delete(k);
    for(const lk of links.values()){ lk.t+=dt; if(!lk.hit && lk.t>=TE){ lk.hit=true; impact(lk); } }   // 79 版：伸出 0.3 秒碰到对方 → 啪
    // 87 版（用户 2026-11-15）：高稀有度宠物每锁上一条链子，脚下属性光亮一档；第一次满 4 条 → 可以进化（evo.js）
    for(const p of G.pets){ const s=st(p); let n=0; for(const lk of links.values()) if(lk.hi===p && lk.hit) n++;
      if(n>(s.lc||0)) s.lcBump=1; s.lc=n; if(s.lcBump>0) s.lcBump=Math.max(0, s.lcBump-dt*1.4);
      if(n>=4 && p.def.evo && !p.evo && !p.evoReady && !p.evoUsed){ p.evoReady=true; emit('evoReady',{pet:p}); } }
  }
  function impact(lk){ const P=bodyPos(lk.lo,HB), B=bodyPos(lk.hi,HB), d=Math.hypot(P.x-B.x,P.y-B.y)||1, u={x:(P.x-B.x)/d, y:(P.y-B.y)/d};
    const lv=visOf(lk.lo,true), hv=visOf(lk.hi,true); lv.squash=0.12; lv.hitFlash=0.08;
    try{ COMBO.play('触手-抽打', {x:P.x, y:P.y}, {freeze:[lv, hv]}); }catch(e){}
    freezeV(lv, 0.09); freezeV(hv, 0.09); lv.hitFlash=0.12; lv.squash=0.2;   // 80 版：锁上那一下两只都顿住 0.09 秒，被锁方白闪、压扁更狠
    const col=ELC[lk.lo.def.el]||ELC.none;
    flashAt(P.x, P.y, 1.3, 0.14); vfxXY('ring_shockwave_white', P.x, P.y, 1.1); burst(P.x, P.y, col, 1);
    sparks(P.x, P.y, 9, u, 2.6, 4.8, '#ffffff', 0.32); sparks(P.x, P.y, 9, {x:-u.x,y:-u.y}, 1.6, 3.6, col, 0.4); shakeDir(0.045, 0.16, u); }

  // ---------- 画：地面光圈（drawAuras 位置） ----------
  function drawGround(){ const cs=L.cs;
    for(const p of G.pets){ const s=S.get(p); if(!s || !((s.lc||0)>0 || s.lcBump>0 || p.evoReady)) continue;   // 87 版：链接数越多越亮（1～4 条），刚锁上那一下再冲亮
      const t=tinted('gui/Frame/ItemFrame00~03_BgGlow.png', EL_HEX[p.def.el]); if(!t) continue;
      const n=Math.min(4, s.lc||0), b=eOut(s.lcBump||0), rd=p.evoReady ? 0.5+0.5*Math.sin(clock*Math.PI*2*1.6) : 0;
      const a=Math.min(1, 0.2+0.2*n+0.5*b+0.15*rd), f=ftOf(p), sz=cs*(1.25+0.12*n+0.3*b+0.12*rd);   // 1 条 0.4 → 4 条 1.0，范围也一条比一条大
      ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=a; ctx.translate(f.x, f.y-cs*0.05); ctx.scale(1, 0.42); ctx.drawImage(t, -sz/2, -sz/2, sz, sz);
      ctx.globalAlpha=Math.min(1, 0.22*n+0.4*b); ctx.drawImage(t, -sz*0.36, -sz*0.36, sz*0.72, sz*0.72);   // 中心再叠一层更亮的核，条数越多越亮
      ctx.restore(); }
    for(const p of G.pets){ const s=S.get(p); if(!s || !(s.lit || s.glow>0)) continue;
      const t=tinted('gui/Frame/ItemFrame00~03_BgGlow.png', EL_HEX[p.def.el]); if(!t) continue;
      const g=eOut(s.glow), f=ftOf(p), sz=cs*1.24*(1+0.3*g);
      ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.16+0.84*g;
      ctx.translate(f.x, f.y-cs*0.05); ctx.scale(1, 0.42); ctx.drawImage(t, -sz/2, -sz/2, sz, sz); ctx.restore(); }
  }
  // ---------- 画：加成标签（drawPet 里，原来的「+N%」） ----------
  function drawLabel(pet, f){
    const s=st(pet); let from=s.shown, to=s.shown, k=1;
    if(s.roll){ from=s.roll.from; to=s.roll.to; k=Math.min(1, s.roll.t/T.roll); }
    if(from<=0 && to<=0) return;
    const cs=L.cs, w=cs*0.5, h=cs*0.2, cy=f.y+cs*0.06+h/2, lab=gui('Label/Label_Parallelogram_'+PARA[pet.def.el]);
    const ht=s.hit==null?9:clock-s.hit, a = from<=0 ? Math.min(1,k*3) : to<=0 ? 1-k : 1, pop = ht<1.2 ? 1+0.38*Math.exp(-ht/0.18)*Math.cos(ht*2*Math.PI*1.6) : 1;   /* 81 版：用户「加成条变大太快了，放慢一倍」→ 时间全部 ×2 */   // 79 版：被能量球砸中时鼓起 1.38 倍、来回弹两下
    ctx.save(); ctx.globalAlpha*=a; if(pop!==1){ ctx.translate(f.x,cy); ctx.scale(pop,pop); ctx.translate(-f.x,-cy); }
    nine(lab, f.x-w/2, cy-h/2, w, h, 18, h*0.45);
    if(!s.roll) text('+'+to*8+'%', f.x, cy, cs*0.13, '#fff');
    else { const e=eOut(k), dy=h*0.75, a0=ctx.globalAlpha;
      if(from>0){ ctx.globalAlpha=a0*(1-e); numText('+'+from*8+'%', f.x, cy-dy*e, cs*0.13, '#fff'); }
      if(to>0){ ctx.globalAlpha=a0*e; numText('+'+to*8+'%', f.x, cy+dy*(1-e), cs*0.13, to>from?'#fff3a0':'#fff'); } }
    ctx.restore();
  }
  // ---------- 画：空中（角色之后） ----------
  function drawAir(){
    for(const lk of links.values()) drawLink(lk);   // 79 版：伸出 → 甩动 → 平静的柔光链子 + 能量
    for(const p of pulses) drawPulse(p);
    for(const b of bolts) drawBolt(b);
    for(const b of bursts) drawBurst(b);
  }
  // ---------- 80 版：爆点 ----------
  // 0～0.05 秒白核猛地胀到最大 → 光线从中心射出（细长、头尖尾宽的柔光条，长度先冲出去再收）→ 冲击环外扩变细淡出；全部 lighter 叠加
  const BU={life:0.42, core:0.9, ray:1.15, ring:1.0};
  let RAY=new Map();
  function rayImg(col){ let c=RAY.get(col); if(c) return c; c=document.createElement('canvas'); c.width=128; c.height=24; const g=c.getContext('2d'), C=rgbOf(col), W=mixW(C,0.8);
    const gr=g.createLinearGradient(0,0,128,0); gr.addColorStop(0,`rgba(${W},1)`); gr.addColorStop(0.35,`rgba(${mixW(C,0.4)},0.85)`); gr.addColorStop(1,`rgba(${C},0)`);
    g.fillStyle=gr; g.beginPath(); g.moveTo(0,4); g.quadraticCurveTo(64,0,128,12); g.quadraticCurveTo(64,24,0,20); g.closePath(); g.fill();   // 根部宽、梢尖
    RAY.set(col,c); return c; }
  let RING=new Map();
  function ringImg(col){ let c=RING.get(col); if(c) return c; c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d'), C=rgbOf(col), gr=g.createRadialGradient(64,64,40,64,64,64);
    gr.addColorStop(0,`rgba(${C},0)`); gr.addColorStop(0.55,`rgba(${mixW(C,0.7)},0.95)`); gr.addColorStop(0.75,`rgba(${C},0.6)`); gr.addColorStop(1,`rgba(${C},0)`);
    g.fillStyle=gr; g.fillRect(0,0,128,128); RING.set(col,c); return c; }
  function drawBurst(b){
    const cs=L.cs, t=b.t, k=t/BU.life, S=cs*b.big;
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const ce=t<0.05? t/0.05 : Math.exp(-(t-0.05)/0.07), cr=S*BU.core*(0.55+0.45*Math.min(1,t/0.05));   // 白核
    if(ce>0.02){ ctx.globalAlpha=ce; soft(softImg('#ffffff'), b.x, b.y, cr*1.6); ctx.globalAlpha=0.8*ce; soft(softImg(b.col), b.x, b.y, cr*2.6); }
    const RI=rayImg(b.col), out=1-Math.pow(1-Math.min(1,k/0.45),3), fade=k<0.3?1:Math.max(0,1-(k-0.3)/0.7);   // 光线
    for(let i=0;i<b.n;i++){ const a=b.rot+i/b.n*Math.PI*2+(i%2?0.13:0), long=(i%2?0.62:1)*(0.85+0.3*Math.abs(Math.sin(i*7.3+b.rot)));
      const len=S*BU.ray*long*(0.35+0.65*out), r0=S*0.12+S*0.25*out, w=S*(i%2?0.07:0.11)*(1-0.5*k);
      ctx.globalAlpha=0.9*fade; ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(a); ctx.drawImage(RI, r0, -w/2, len, w); ctx.restore(); }
    const rk=Math.min(1,k/0.8), rr=S*BU.ring*(0.25+0.95*(1-Math.pow(1-rk,2.4)));   // 冲击环
    if(rk<1){ ctx.globalAlpha=0.85*(1-rk); ctx.save(); ctx.translate(b.x,b.y); ctx.scale(1,0.72); ctx.drawImage(ringImg(b.col), -rr, -rr, rr*2, rr*2); ctx.restore(); }
    ctx.restore();
  }
  // ---------- 79 版：同系加成弹射 = 程序画的能量球（演示页 drawBolt 样子 B + 路径 2） ----------
  // 角色身体正中 → 对方加成条；水平匀速、高度抛物线（真 3D：高度朝屏幕外，主要表现为变大，0.3 的比例在屏幕上往上），影子留在地面原处；
  // 拖尾按 3D 路程取固定长度再投影；落下 0.12 秒内压扁、下沉、变透明融进「+%」；加成条白闪、鼓起、迸 12 颗火花。
  const BB={bs:0.13, tl:1.45, sp:2.5, q:1.05, ti:0.30, pf:2.9, bh:1.05}, MELT=0.12;   // 球直径 / 拖尾（3D 格）/ 转速（圈/秒）/ Q 弹 / 镜头倾斜 / 镜头距离 / 最高
  const BCOL={fire:'#ffa23a', water:'#3fb4ff', grass:'#6be05a'}, TCOL={fire:'#ff5a14', water:'#1f8fe0', grass:'#3cb83a'};   // 火系球用金橙（#ff7a3d 画成球偏棕）
  const bcol = el => BCOL[el]||ELC[el]||ELC.none, tcol = el => TCOL[el]||hexOf(darkC(bcol(el),0.15));
  const EN=new Map(); let SHW=null, STAR=null; const SPK=new Map();
  function energyImgs(col){ let r=EN.get(col); if(r) return r; const S=128, m=S/2, C=rgbOf(col), Lt=mixW(C,0.55), Wt=mixW(C,0.85), mk=()=>{ const c=document.createElement('canvas'); c.width=c.height=S; return c; };
    const body=mk(), g1=body.getContext('2d'), gr=g1.createRadialGradient(m,m,0,m,m,60);   // 能量体：中心近白 → 浅色 → 本色 → 一圈亮边 → 透明
    gr.addColorStop(0,`rgba(${Wt},1)`); gr.addColorStop(0.3,`rgba(${Lt},0.95)`); gr.addColorStop(0.68,`rgba(${C},0.75)`); gr.addColorStop(0.86,`rgba(${Lt},0.9)`); gr.addColorStop(0.93,`rgba(${C},0.5)`); gr.addColorStop(1,`rgba(${C},0)`);
    g1.fillStyle=gr; g1.fillRect(0,0,S,S);
    const sw=mk(), g2=sw.getContext('2d'); g2.lineCap='round';   // 里面流动的光纹
    for(const [rr,a0,a1,w,al] of [[34,0.2,2.0,7,0.75],[24,3.3,4.9,5,0.6],[42,3.6,5.2,4,0.45]]){ g2.strokeStyle=`rgba(${Wt},${al})`; g2.lineWidth=w; g2.beginPath(); g2.arc(m,m,rr,a0,a1); g2.stroke(); }
    const hi=mk(), g3=hi.getContext('2d'); g3.fillStyle='rgba(255,255,255,0.7)'; g3.beginPath(); g3.ellipse(m-17,m-21,11,6,-0.6,0,7); g3.fill();
    r={body, sw, hi}; EN.set(col,r); return r; }
  function shadowImg(){ if(SHW) return SHW; const c=document.createElement('canvas'); c.width=c.height=64; const g=c.getContext('2d'), gr=g.createRadialGradient(32,32,0,32,32,32);
    gr.addColorStop(0,'rgba(10,20,30,0.36)'); gr.addColorStop(0.6,'rgba(10,20,30,0.16)'); gr.addColorStop(1,'rgba(10,20,30,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64); return SHW=c; }
  function starImg(){ if(STAR) return STAR; const c=document.createElement('canvas'); c.width=c.height=64; const g=c.getContext('2d'), m=32;   // 四角小星
    g.beginPath(); for(let i=0;i<8;i++){ const r=i%2?9:30, a=i*Math.PI/4-Math.PI/2; g[i?'lineTo':'moveTo'](m+Math.cos(a)*r, m+Math.sin(a)*r); } g.closePath();
    g.fillStyle='#fff6c8'; g.fill(); g.lineJoin='round'; g.lineWidth=3; g.strokeStyle='rgba(255,200,80,0.9)'; g.stroke(); return STAR=c; }
  function sparkImg(col){ let c=SPK.get(col); if(c) return c; c=document.createElement('canvas'); c.width=64; c.height=16; const g=c.getContext('2d'), C=rgbOf(col), gr=g.createLinearGradient(0,0,64,0);   // 火花：属性色尾 → 近白亮头
    gr.addColorStop(0,`rgba(${C},0)`); gr.addColorStop(0.55,`rgba(${C},0.95)`); gr.addColorStop(0.85,`rgba(${mixW(C,0.6)},1)`); gr.addColorStop(1,'rgba(255,255,235,1)'); g.fillStyle=gr; g.beginPath(); g.ellipse(32,8,31,6,0,0,7); g.fill(); SPK.set(col,c); return c; }
  const backOut = k => { const c=1.9; return 1+(c+1)*Math.pow(k-1,3)+c*Math.pow(k-1,2); };
  const jel = (tau,A) => tau<0?0:A*Math.exp(-tau/0.13)*Math.sin(tau*2*Math.PI*6.5);   // 果冻回弹：先猛后收
  function drawHit(L0, tau, col){   // 加成条收到能量：白闪 + 12 颗火花（鼓起在 drawLabel 里）
    if(tau<0||tau>0.6) return; const cs=L.cs, ht=1+0.38*Math.exp(-tau/0.18)*Math.cos(tau*2*Math.PI*1.6), fs=cs*0.9*ht;
    ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.9*Math.exp(-tau/0.07); ctx.drawImage(softImg('#ffffff'), L0.x-fs/2, L0.y-fs*0.35, fs, fs*0.7);
    const SP=sparkImg(col), S=starImg();
    for(let i=0;i<12;i++){ const rnd=k2=>{ const x=Math.sin((i+1)*12.9898+k2*78.233)*43758.5453; return x-Math.floor(x); };   // 每颗火花固定种子的方向、速度、寿命
      const a=(i+rnd(1)*0.7)/12*Math.PI*2, v0=cs*(0.9+1.1*rnd(2)), life=0.3+0.22*rnd(3), q=tau/life; if(q>=1) continue;
      const dd=v0*life*(1-Math.pow(1-q,2.2))/2.2, vx=Math.cos(a)*1.7, vy=Math.sin(a)*0.75;   // 迸出后很快减速；加成条是横的，横向散得开
      const x=L0.x+vx*dd, y=L0.y+vy*dd+cs*0.12*q*q, sp=Math.pow(1-q,2.2), len=cs*(0.05+0.16*sp), wd=cs*0.05*(1-q*0.6);
      ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=Math.pow(1-q,1.2); ctx.save(); ctx.translate(x,y); ctx.rotate(Math.atan2(vy*sp+0.12*q, vx*sp)); ctx.drawImage(SP,-len,-wd/2,len,wd); ctx.restore();   // 越慢越短，最后缩成小点淡出（普通混合，亮草地上不被冲白）
      if(i<4){ ctx.globalCompositeOperation='lighter'; const r=cs*0.045*(1-q); ctx.save(); ctx.translate(x,y); ctx.rotate(tau*8+i); ctx.drawImage(S,-r,-r,r*2,r*2); ctx.restore(); } }
    ctx.restore(); }
  function drawBolt(bt){
    const cs=L.cs, FLY=T.fly, t=bt.t, col=bcol(bt.el), A=bt.A, Bp=bt.landed?bt.Bp:labelPos(bt.b), H=cs*BB.bh, F=cs*BB.pf, TI=BB.ti, R0=cs*BB.bs/2, Q=BB.q;
    if(bt.landed) drawHit(Bp, t-FLY, col);
    if(t>FLY+MELT) return;
    const ux=Bp.x-A.x, uy=Bp.y-A.y, ang=Math.atan2(uy,ux);
    const stp = tt => { if(tt<=FLY){ const k=Math.max(0,tt/FLY); return {x:A.x+ux*k, y:A.y+uy*k, z:4*H*k*(1-k)}; } return {x:Bp.x, y:Bp.y, z:0}; };
    const P0=stp(t), sc=F/(F-P0.z), zn=P0.z/H, P={x:P0.x, y:P0.y-P0.z*TI};   // 斜镜头：高度主要表现为变大，另有 TI 的比例在屏幕上往上
    const shw=R0*2.1*(1-0.3*Math.min(1,zn)); ctx.save(); ctx.globalAlpha=Math.max(0.15,0.8-0.5*zn); ctx.drawImage(shadowImg(), P0.x-shw/2, P0.y-shw*0.13+R0*0.4, shw, shw*0.26); ctx.restore();   // 影子留在地面原处
    { const Lt=cs*BB.tl, tr=[{x:P.x,y:P.y,s:sc,f:0}]; let acc=0, prev=P0;   // 拖尾：按 3D 路程取固定长度再投影，粗细按各点高度
      for(let tt=Math.min(t,FLY)-0.004; tt>=0 && acc<Lt; tt-=0.004){ const q=stp(tt), d=Math.hypot(q.x-prev.x,q.y-prev.y,q.z-prev.z); acc+=d; prev=q; tr.push({x:q.x, y:q.y-q.z*TI, s:F/(F-q.z), f:Math.min(1,acc/Lt)}); }
      const fo=t>FLY? 1-(t-FLY)/MELT : 1, tb=xsImg(tcol(bt.el),PTRAIL,'t'), step=Math.max(1,Math.floor(tr.length/18));
      ctx.save();
      for(let i=0;i+step<tr.length;i+=step){ const p=tr[i], q=tr[i+step], f=(p.f+q.f)/2; if(Math.hypot(q.x-p.x,q.y-p.y)<0.5) continue;
        ctx.globalAlpha=0.9*Math.pow(1-f,0.8)*fo; strip(tb, p, q, R0*1.8*p.s*Math.pow(1-f,0.9)); }
      ctx.globalCompositeOperation='lighter'; const spw=softImg(hexOf(mixW(rgbOf(col),0.7)));
      for(let j=0;j<8;j++){ const b0=Math.floor(t/0.035)*0.035-j*0.035, age=t-b0; if(b0<0||b0>FLY||age>0.3) continue;   // 路上掉的小星点
        const q=stp(b0), hh=Math.sin(b0*91.7+bt.id0*13), vv=Math.cos(b0*57.3+bt.id0*7), a2=1-age/0.3, r=cs*0.035*(F/(F-q.z))*a2;
        ctx.globalAlpha=0.85*a2*fo; ctx.drawImage(spw, q.x+hh*cs*0.12*age/0.3-r, q.y-q.z*TI+vv*cs*0.12*age/0.3+cs*0.1*age-r, r*2, r*2); }
      ctx.restore(); }
    const appear=t<0.12? Math.max(0,backOut(t/0.12)) : 1, J=Q*jel(t,0.22), m=t>FLY? Math.min(1,(t-FLY)/MELT) : 0, out=1-m;   // 弹出回弹过头；果冻晃；融化进度
    const R=R0*sc*appear; if(out<=0.01 || R<=0.1) return;
    const spin=t*BB.sp*2*Math.PI, so=softImg(col), d0=R*2*128/124, E=energyImgs(col);
    ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.55*out; ctx.drawImage(so, P.x-R*2.3, P.y-R*2.3, R*4.6, R*4.6); ctx.restore();   // 外晕
    ctx.save(); ctx.translate(P.x, P.y+R*0.6*m); ctx.scale(1+0.6*m*Q, 1-0.85*m); ctx.rotate(ang); ctx.scale(1+J, 1-J*0.8); ctx.rotate(-ang);   // 拉伸 / 压扁 / 融化
    ctx.globalAlpha=0.9*out; ctx.drawImage(E.body, -d0*0.62, -d0*0.62, d0*1.24, d0*1.24);
    ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.55*out; ctx.drawImage(E.body, -d0*0.5, -d0*0.5, d0, d0);
    ctx.save(); ctx.rotate(spin); ctx.globalAlpha=0.9*out; ctx.drawImage(E.sw, -d0/2, -d0/2, d0, d0); ctx.restore();
    ctx.save(); ctx.rotate(-spin*0.6); ctx.globalAlpha=0.5*out; ctx.drawImage(E.sw, -d0*0.4, -d0*0.4, d0*0.8, d0*0.8); ctx.restore();
    ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=0.8*out; ctx.drawImage(E.hi, -d0/2, -d0/2, d0, d0); ctx.restore();
  }
  function drawPulse(p){
    const k=Math.min(1,p.t/T.hop), A=ftOf(p.a), B=ftOf(p.b), cs=L.cs, e=k*k*(3-2*k);
    const x=A.x+(B.x-A.x)*e, y=A.y+(B.y-A.y)*e-cs*0.06, g=softImg(ELC[p.el]);
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const tx=A.x+(B.x-A.x)*Math.max(0,e-0.35), ty=A.y+(B.y-A.y)*Math.max(0,e-0.35)-cs*0.06;
    ctx.globalAlpha=0.9; seg(capImg(ELC[p.el]), {x:tx,y:ty}, {x,y}, cs*0.12);
    ctx.globalAlpha=0.9; soft(g, x, y, cs*0.45);
    ctx.restore();
  }
  // ---------- 79 版：稀有度链子（演示页 drawLink 原样搬过来，参数 = 用户 13:20 定稿） ----------
  // 伸出：从高稀有度身体正中朝对方伸出（0.3 秒碰到 → 啪），梢一直自由、跟着整条甩，约 1 秒平静下来才贴到对方身上；
  // 力的传导：链子上每一点取发出端「早 0.32×位置」秒的状态，波从发出端传到末端，停也从发出端先停；
  // 伸出 / 剧烈时整条加宽发光（圆形柔光点沿路径盖章）+ 末端光头；平静后是细柔光带 + 沿线流动的能量（低稀有度 → 高稀有度）。
  // 所有渐变只烘一次成小图，每帧只做平移 / 缩放 / 旋转。
  const NB=32, HB=0.33, TE=0.3, TC=1.0, DLY=0.32, LINK_GAP=0.15;   // HB：两端挂在身体正中（脚下往上 0.33 格）；TE：伸到对方用时；TC：剧烈 → 平静
  const LK={cw:0.060, xw:1.0, gw:1.5, gb:0.14, hd:0.28, wa:0.19, ew:1.25, el:0.48};   // 81 版：用户 2026-11-15 16:39 在演示页定：实心 0.035→0.060、能量宽 1.3→1.25、能量长 0.34→0.48、球直径 0.10→0.13   // 实心宽 / 伸出时实心加粗 / 光晕宽 / 光晕亮度 / 末端光头 / 甩动幅度 / 能量宽（倍）/ 能量长（格）
  const XS=new Map(), SOFT=new Map();
  const rgbOf = c => { const n=parseInt(c.slice(1),16); return [n>>16,(n>>8)&255,n&255]; };
  const mixW = (c,k) => c.map(v=>Math.round(v+(255-v)*k));
  const darkC = (c,k) => rgbOf(c).map(v=>Math.round(v*(1-k)));
  const hexOf = a => '#'+a.map(v=>v.toString(16).padStart(2,'0')).join('');
  const sm01 = x => x<=0?0:x>=1?1:x*x*(3-2*x);
  const fade01 = s => Math.min(1, Math.min(s,1-s)/0.28);
  const PBAND = d=>[0.45*Math.exp(-d*d*4), 0.85*Math.exp(-Math.pow(d/0.3,4)), 0.9*Math.exp(-Math.pow(d/0.09,2))];   // 链子截面：实心约占总宽 29%
  const PEN = d=>[0, 0.95*Math.exp(-Math.pow(d/0.62,4)), 1*Math.exp(-Math.pow(d/0.3,2))];   // 能量截面：实心约占 62%
  const PTRAIL = d=>[0.55*Math.exp(-d*d*3), 0.95*Math.exp(-Math.pow(d/0.5,4)), 0.9*Math.exp(-Math.pow(d/0.18,2))];   // 弹射拖尾截面
  function xsImg(color, prof, key){ const kk=key+color; let c=XS.get(kk); if(c) return c;   // 截面：纵向 64px 平滑渐变（33 个色标），横向 4px
    c=document.createElement('canvas'); c.width=4; c.height=64; const g=c.getContext('2d'), C=rgbOf(color), Lt=mixW(C,0.6), gr=g.createLinearGradient(0,0,0,64);
    for(let q=0;q<=32;q++){ const d=Math.abs(q/32*2-1), [glow,main,core]=prof(d), al=1-(1-glow)*(1-main)*(1-core), wC=core/(glow+main+core+1e-6), rgb=C.map((v,j)=>Math.round(v+(Lt[j]-v)*wC));
      gr.addColorStop(q/32, `rgba(${rgb},${al.toFixed(3)})`); }
    g.fillStyle=gr; g.fillRect(0,0,4,64); XS.set(kk,c); return c; }
  function softImg(color){ let c=SOFT.get(color); if(c) return c;   // 柔光点：中心偏白 → 属性色 → 透明
    c=document.createElement('canvas'); c.width=c.height=64; const g=c.getContext('2d'), C=rgbOf(color), W=mixW(C,0.75), gr=g.createRadialGradient(32,32,0,32,32,32);
    gr.addColorStop(0,`rgba(${W},1)`); gr.addColorStop(0.22,`rgba(${W},0.85)`); gr.addColorStop(0.5,`rgba(${C},0.35)`); gr.addColorStop(1,`rgba(${C},0)`);
    g.fillStyle=gr; g.fillRect(0,0,64,64); SOFT.set(color,c); return c; }
  function strip(im, p, q, w){ const dx=q.x-p.x, dy=q.y-p.y, len=Math.hypot(dx,dy); ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(Math.atan2(dy,dx)); ctx.drawImage(im, 0, -w/2, len, w); ctx.restore(); }   // 首尾正好相接，不重叠
  function soft(im, x, y, sz){ ctx.drawImage(im, x-sz/2, y-sz/2, sz, sz); }
  const calmAt = tau => tau<0?0:1-Math.pow(Math.min(1,tau/TC),2);   // 剧烈程度：1 → 0，越来越快地平静
  const phAt = tau => { const u=Math.min(1,Math.max(0,tau)/TC); return 1.4*tau+16*TC*(1-Math.pow(1-u,3))/3; };   // 一开始摆得快，慢慢降到 1.4
  function drawLink(lk){
    const cs=L.cs, t=lk.t, col=ELC[lk.lo.def.el]||ELC.none, B=bodyPos(lk.hi,HB), E=bodyPos(lk.lo,HB), dx=E.x-B.x, dy=E.y-B.y, D=Math.hypot(dx,dy)||1, tx=dx/D, ty=dy/D;
    const Lx=eOut(Math.min(1,t/TE)), bnd=sm01(Math.pow(Math.min(1,t/TC),1.3)), calm=calmAt(t), pts=[];   // Lx：伸出进度（先快后慢）；bnd：梢贴到对方的程度
    for(let i=0;i<=NB;i++){ const s=i/NB, sl=s*Lx, tau=t-sl*DLY, c=calmAt(tau);
      const env=(1-bnd)*Math.sin(Math.PI/2*s)+bnd*Math.sin(Math.PI*s);
      const A=tau<0?0:cs*(0.035+LK.wa*c), ph=phAt(tau)+lk.id*1.7-sl*Math.PI*2.2*(1-c);   // 平静后保留约 1.1 个波长的轻微波动
      const sw=tau<0?0:cs*LK.wa*0.84*c*Math.sin(tau*2*Math.PI*3.2);   // 整条甩动，也是从发出端传过去
      const w=env*(A*Math.sin(ph)+sw);
      pts.push({x:B.x+dx*sl-ty*w, y:B.y+dy*sl+tx*w, s, c}); }
    const W=cs*LK.cw/0.29, band=xsImg(col,PBAND,'b'), so=softImg(col);
    const fa = s => { const f0=Math.min(1,s/0.28), f1=Math.min(1,(1-s)/0.28); return Math.min(f0, 1-bnd*(1-f1)); };   // 伸出时梢是亮的，贴上后两端都淡进身体
    ctx.save();
    for(let i=0;i<NB;i++){ const sm=(pts[i].s+pts[i+1].s)/2, e=Math.max((pts[i].c+pts[i+1].c)/2, t<TE?1:0); ctx.globalAlpha=0.9*fa(sm); strip(band, pts[i], pts[i+1], W*(1+(LK.xw-1)*e)); }
    ctx.globalCompositeOperation='lighter';
    for(let i=0;i<NB;i++){ const p=pts[i], q=pts[i+1], e=Math.max((p.c+q.c)/2, t<TE?1:0); if(e<0.03) continue; const sm=(p.s+q.s)/2;   // 剧烈时的宽光晕：圆形柔光点沿路径密集盖章（分段宽条急弯处会散成尖刺）
      const sz=W*(1+(LK.gw-1)*e)*(1+(LK.xw-1)*e), sg=Math.hypot(q.x-p.x,q.y-p.y), n=Math.max(1,Math.ceil(sg/(sz*0.25)));
      ctx.globalAlpha=LK.gb*e*Math.min(1,sm/0.15+0.2);
      for(let j=0;j<n;j++){ const f=j/n; ctx.drawImage(so, p.x+(q.x-p.x)*f-sz/2, p.y+(q.y-p.y)*f-sz/2, sz, sz); } }
    { const tip=pts[NB], e=Math.max(calm,1-bnd), hs=cs*LK.hd/2*(0.45+0.55*e);   // 末端光头
      if(e>0.03 && hs>0.5){ ctx.globalAlpha=0.9*e; soft(so, tip.x, tip.y, hs*2); ctx.globalAlpha=0.7*e; soft(softImg('#ffffff'), tip.x, tip.y, hs*0.9); } }
    const on=sm01((t-TC*0.8)/0.4);   // 能量：平静下来后才开始流
    if(on>0){
      const en=xsImg(col,PEN,'e'), EW=cs*LK.cw*LK.ew/0.62, len=LK.el/(D/cs), ef=s=>Math.pow(fade01(s),1.6);   // 能量靠近两端身体比链子淡得快
      const P=[0,1].map(j=>1.12-((clock*0.5+lk.id*0.37+j*0.5)%1)*1.24);
      for(const pos of P){
        for(let i=0;i<NB;i++){ const sm=(pts[i].s+pts[i+1].s)/2, d=sm-pos; if(d<-0.02||d>len) continue;
          const v=(d<0? Math.max(0,1+d/0.02) : Math.pow(1-d/len,1.6))*ef(sm)*on; if(v<0.02) continue; ctx.globalAlpha=0.95*v; strip(en, pts[i], pts[i+1], EW*(0.75+0.25*v)); }
        if(pos>0 && pos<1){ const f=pos*NB, i0=Math.min(NB-1,f|0), fr=f-i0, x=pts[i0].x+(pts[i0+1].x-pts[i0].x)*fr, y=pts[i0].y+(pts[i0+1].y-pts[i0].y)*fr, hs=cs*LK.cw*LK.ew*1.15;
          ctx.globalAlpha=0.9*ef(pos)*on; soft(so, x, y, hs*2); } }
      if(P.some(p=>p<0.02&&p>-0.08) && !(lk.gt!=null && clock-lk.gt<0.3)) lk.gt=clock;   // 到达：高稀有度身上轻轻亮一下
      const h=lk.gt==null?0:Math.exp(-(clock-lk.gt)*4);
      ctx.globalAlpha=(0.12+0.36*h)*on; soft(so, B.x, B.y, cs*(0.4+0.1*h)); }
    ctx.restore();
  }

  HOOKS.push((type, d)=>{
    if(type==='place'){ queue.push({p:d.pet, d:0}); if(window.HAPTIC) HAPTIC.tap(); }   // 80 版：放下 / 换位时手机「哒」一下（iPhone）
    else if(type==='move'){ queue.push({p:d.pet, d:0.25}); if(window.HAPTIC) HAPTIC.tap(); }
    else if(type==='start'){ jobs.length=0; bolts.length=0; pulses.length=0; bursts.length=0; links.clear(); pending.clear(); }
  });
  return {update, drawGround, drawLabel, drawAir};
})();
