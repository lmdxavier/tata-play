'use strict';
/* =====================================================================
   75 版（用户 2026-11-15）：相邻关系的三段表现 —— 详见 docs/vfx-design.md「75 版」
   ① 相邻同属性加成：新宠物弹出一颗属性小弹（火球 / 水团 / 绿焰），伪 3D 抛物线（升空变大、头朝上 → 落下尾朝上）
      落到旁边宠物的「+%」标签上，数字往上滚；再由旁边的宠物反向弹回一颗给新宠物。
   ② 同属性 3 连：从新宠物开始沿连线依次点亮脚下光圈（亮起明显 → 淡到很淡常驻）；只有 2 只时不再画脚下光。
   ③ 稀有度链接：高稀有度宠物旁边有低稀有度宠物（同稀有度不连，炸弹类不算）时，高稀有度伸出触手扬起 → 啪地抽下 → 变成白色链子，
      被链接方（低稀有度）属性颜色的能量源源不断地从低稀有度流向高稀有度。只是表现，数值效果待定。
   顺序：新宠物和每个邻居是一条「轨道」，各轨道同时开始；轨道内部 弹出 → 弹回 → 3 连传导 → 触手链接 一步一步来。
   画法全部是贴图（属性弹序列帧、胶囊 / 圆点小图旋转拉伸），不画会变形的路径——不增加每帧的光栅重画和贴图上传。
   ===================================================================== */
const BONUS = (()=>{
  const RANK = {common:0, rare:1, epic:2, legend:3};
  const rankOf = p => RANK[p.def.rarity||'common']||0;
  const ELC = {fire:'#ff7a3d', water:'#3fb4ff', grass:'#6be05a', light:'#ffd84a', dark:'#b07cff', none:'#e6e6e6'};
  const BOLT = {fire:{n:8,w:200,h:86}, water:{n:8,w:200,h:104}, grass:{n:8,w:200,h:86}};
  const T = {land:0.2, fly:0.5, gap:0.14, hop:0.2, hold:0.3, up:0.3, strike:0.1, settle:0.34, roll:0.32};
  const S = new WeakMap();
  const st = p => { let s=S.get(p); if(!s){ s={shown:p.nSame||0, inbound:0, roll:null, pop:0, glow:0, lit:false, wait:0}; S.set(p,s); } return s; };
  const ids = new WeakMap(); let nid=1; const idOf = p => { let i=ids.get(p); if(!i){ i=nid++; ids.set(p,i); } return i; };
  let clock=0; const jobs=[], queue=[], bolts=[], pulses=[], links=new Map(), pending=new Map();
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
  const snd = (name, p) => { try{ COMBO.play(name, {x:p.x, y:p.y}); }catch(e){} };

  // ---------- 小图：胶囊、圆点（每种颜色只画一次） ----------
  const CAP=new Map(), DOT=new Map();
  function capImg(color){ let c=CAP.get(color); if(!c){ c=document.createElement('canvas'); c.width=64; c.height=16; const g=c.getContext('2d'); g.strokeStyle=color; g.lineCap='round'; g.lineWidth=14; g.beginPath(); g.moveTo(8,8); g.lineTo(56,8); g.stroke(); CAP.set(color,c); } return c; }
  function dotImg(color){ let c=DOT.get(color); if(!c){ c=document.createElement('canvas'); c.width=c.height=32; const g=c.getContext('2d'); g.fillStyle=color; g.beginPath(); g.arc(16,16,14,0,7); g.fill(); DOT.set(color,c); } return c; }
  function seg(im, p, q, w){ const dx=q.x-p.x, dy=q.y-p.y, len=Math.hypot(dx,dy); ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(Math.atan2(dy,dx)); ctx.drawImage(im, -w/2, -w/2, len+w, w); ctx.restore(); }
  const glowImg = color => tinted('gui/Image_Effect_Light02.png', color);

  // ---------- 序列 ----------
  function startSeq(P, delay){
    const s=st(P); s.shown=0; s.roll=null;
    const grp = P.group && P.group.size>=3 && !mine(P) ? P.group : null;
    const done=new Set(); let chainSound=false;
    for(const n of nbrs(P)){
      let t=T.land+(delay||0);
      if(sameEl(P,n)){
        st(n).inbound++; s.inbound++;
        at(t, ()=>launch(P,n)); t+=T.fly+T.gap;
        at(t, ()=>launch(n,P)); t+=T.fly+T.gap;
        if(grp && grp.members.includes(n)){
          const t0=t, d=chain(P, n, grp, t0, done);
          if(d>0){ if(!chainSound){ chainSound=true; at(t0, ()=>snd('三连-传导', ftOf(P))); } t+=d; }
        }
      }
      if(linkable(P,n)){
        const hi=rankOf(P)>rankOf(n)?P:n, lo=hi===P?n:P, k=idOf(hi)+'>'+idOf(lo);
        pending.set(k, clock+t+0.5); links.delete(k);
        at(t, ()=>{ pending.delete(k); if(alive(hi)&&alive(lo)&&adj(hi,lo)) whip(hi,lo,k); });
      }
    }
  }
  function launch(a, b){
    if(!alive(a)||!alive(b)){ const sb=S.get(b); if(sb) sb.inbound=Math.max(0,sb.inbound-1); return; }
    const A=labelPos(a); st(a).pop=0.3; flashAt(A.x, A.y, 0.4, 0.12, undefined, ELC[a.def.el]); snd('加成-弹出', A);
    bolts.push({a, b, el:BOLT[a.def.el]?a.def.el:'fire', t:0});
  }
  function land(bt){
    const b=bt.b, s=st(b); s.inbound=Math.max(0,s.inbound-1);
    if(!alive(b)) return;
    const B=labelPos(b), to=Math.min(b.nSame||0, s.shown+1);
    if(to!==s.shown){ s.roll={from:s.shown, to, t:0}; s.shown=to; }
    s.pop=0.3; flashAt(B.x, B.y, 0.75, 0.16, undefined, ELC[bt.el]); sparks(B.x, B.y, 6, {x:0,y:-1}, 2.6, 3.2, ELC[bt.el], 0.32);
    snd('加成-落下', B);
  }
  // 从新宠物 P 经邻居 n 往外依次点亮（不回头经过 P）；返回这一段用的时间
  function chain(P, n, grp, t0, done){
    const depth=new Map([[n,1]]), order=[[n,P]], seen=new Set([P,n]);
    for(let i=0;i<order.length;i++){ const [a]=order[i];
      for(const o of nbrs(a)) if(!seen.has(o) && grp.members.includes(o)){ seen.add(o); depth.set(o, depth.get(a)+1); order.push([o,a]); } }
    let maxD=0;
    if(!done.has(P)){ done.add(P); st(P).wait++; at(t0, ()=>light(P)); }
    for(const [m,from] of order){ if(done.has(m)) continue; done.add(m); const d=depth.get(m); maxD=Math.max(maxD,d); st(m).wait++;
      at(t0+(d-1)*T.hop, ()=>{ if(alive(m)&&alive(from)) pulses.push({a:from, b:m, el:m.def.el, t:0}); });
      at(t0+d*T.hop, ()=>light(m)); }
    return maxD ? maxD*T.hop+T.hold : 0;
  }
  function light(m){ const s=st(m); s.wait=Math.max(0,s.wait-1); if(!alive(m)) return; s.lit=true; s.glow=1;
    const f=ftOf(m); flashAt(f.x, f.y-L.cs*0.05, 0.9, 0.18, undefined, ELC[m.def.el]); sparks(f.x, f.y-L.cs*0.1, 5, {x:0,y:-1}, 1.2, 2.6, ELC[m.def.el], 0.4);
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
    for(let i=bolts.length-1;i>=0;i--){ const b=bolts[i]; b.t+=dt; if(b.t>=T.fly){ bolts.splice(i,1); land(b); } }
    for(let i=pulses.length-1;i>=0;i--){ pulses[i].t+=dt; if(pulses[i].t>=T.hop) pulses.splice(i,1); }
    // 链接：和当前相邻关系对齐（铲掉 / 移开就断；其他原因出现的新相邻直接抽一次）
    const want=new Set();
    for(const p of G.pets){ if(mine(p)) continue; for(const o of [petAt(p.lane+1,p.col), petAt(p.lane,p.col+1)]) if(o && linkable(p,o)){ const hi=rankOf(p)>rankOf(o)?p:o, lo=hi===p?o:p; want.add(idOf(hi)+'>'+idOf(lo));
      const k=idOf(hi)+'>'+idOf(lo); if(!links.has(k) && !(pending.has(k) && pending.get(k)>clock) && !(hi.move||lo.move)) whip(hi,lo,k); } }
    for(const k of [...links.keys()]) if(!want.has(k)) links.delete(k);
    for(const lk of links.values()){ lk.t+=dt; if(!lk.hit && lk.t>=T.up+T.strike){ lk.hit=true; impact(lk); } }
  }
  function impact(lk){ const P=bodyPos(lk.lo,0.2), B=bodyPos(lk.hi,0.24), d=Math.hypot(P.x-B.x,P.y-B.y)||1, u={x:(P.x-B.x)/d, y:(P.y-B.y)/d};
    const lv=visOf(lk.lo,true), hv=visOf(lk.hi,true); lv.squash=0.12; lv.hitFlash=0.08;
    try{ COMBO.play('触手-抽打', {x:P.x, y:P.y}, {freeze:[lv, hv]}); }catch(e){}
    flashAt(P.x, P.y, 0.8, 0.12); vfxXY('ring_shockwave_white', P.x, P.y, 0.8); sparks(P.x, P.y, 7, u, 2.4, 4.2, '#ffffff', 0.3); shakeDir(0.02, 0.12, u); }

  // ---------- 画：地面光圈（drawAuras 位置） ----------
  function drawGround(){ const cs=L.cs;
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
    const a = from<=0 ? Math.min(1,k*3) : to<=0 ? 1-k : 1, pop = s.pop>0 ? 1+0.3*Math.sin((1-s.pop/0.3)*Math.PI) : 1;
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
    for(const lk of links.values()) drawLink(lk);
    for(const p of pulses) drawPulse(p);
    for(const b of bolts) drawBolt(b);
  }
  function drawBolt(b){
    const cs=L.cs, k=Math.min(1,b.t/T.fly), A=labelPos(b.a), B=labelPos(b.b);
    const D=Math.hypot(B.x-A.x,B.y-A.y), Hh=cs*0.9+D*0.35, z=4*Hh*k*(1-k), zn=z/Hh;
    const gx=A.x+(B.x-A.x)*k, gy=A.y+(B.y-A.y)*k;
    groundShadow(gx, gy, cs*(0.34-0.16*zn), 0.85-0.45*zn);   // 影子留在地面，越高越小越淡
    const vx=B.x-A.x, vy=(B.y-A.y)-4*Hh*(1-2*k), sp=Math.hypot(vx,vy);
    const m=BOLT[b.el], im=img('bonus/bolt_'+b.el+'.png'); if(!ok(im)) return;
    const fi=Math.floor(b.t*16)%m.n, wd=cs*(0.78+0.42*zn), ht=wd*m.h/m.w, st2=1+Math.min(0.25, sp/(cs*40));   // 越高越大（离镜头近）；快的时候略拉长
    ctx.save(); ctx.translate(gx, gy-z); ctx.rotate(Math.atan2(vy,vx)+Math.PI); ctx.scale(st2, 1/st2);   // 贴图头朝左 → 转到速度方向：升空时头朝上，落下时尾朝上
    ctx.drawImage(im, fi*m.w, 0, m.w, m.h, -wd*0.2, -ht/2, wd, ht); ctx.restore();
  }
  function drawPulse(p){
    const k=Math.min(1,p.t/T.hop), A=ftOf(p.a), B=ftOf(p.b), cs=L.cs, e=k*k*(3-2*k);
    const x=A.x+(B.x-A.x)*e, y=A.y+(B.y-A.y)*e-cs*0.06, g=glowImg(ELC[p.el]);
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const tx=A.x+(B.x-A.x)*Math.max(0,e-0.35), ty=A.y+(B.y-A.y)*Math.max(0,e-0.35)-cs*0.06;
    ctx.globalAlpha=0.9; seg(capImg(ELC[p.el]), {x:tx,y:ty}, {x,y}, cs*0.12);
    if(g){ ctx.globalAlpha=1; drawImgC(g, x, y, cs*0.7); }
    ctx.restore();
  }
  // 触手 / 链子：沿二次曲线取点，用胶囊小图逐段摆
  const N=20;
  const qb=(P0,C,P2,s)=>{ const a=1-s; return {x:a*a*P0.x+2*a*s*C.x+s*s*P2.x, y:a*a*P0.y+2*a*s*C.y+s*s*P2.y}; };
  function drawLink(lk){
    const cs=L.cs, B=bodyPos(lk.hi,0.24), E=bodyPos(lk.lo,0.2), dx=E.x-B.x, dy=E.y-B.y, D=Math.hypot(dx,dy)||1, ux=dx/D, uy=dy/D;
    let nx=-uy, ny=ux; if(ny>0.05 || (Math.abs(ny)<=0.05 && nx>0)){ nx=-nx; ny=-ny; }   // 法线取朝上（朝画面里侧）那一边
    const M={x:(B.x+E.x)/2, y:(B.y+E.y)/2}, sway=Math.sin(clock*2.2+lk.id)*cs*0.035;
    const rise={P2:{x:B.x-ux*D*0.25+nx*cs*0.9, y:B.y-uy*D*0.25+ny*cs*0.9-cs*0.6}, C:{x:B.x+nx*cs*0.7, y:B.y+ny*cs*0.7-cs*0.3}};
    const imp={P2:E, C:{x:M.x+nx*cs*0.5, y:M.y+ny*cs*0.5-cs*0.25}};
    const rest={P2:E, C:{x:M.x+nx*cs*0.42+sway, y:M.y+ny*cs*0.42+cs*0.1}};   // 链子往一侧弯出去，不从宠物脸上直穿
    const t=lk.t, pts=[]; let wk=0;   // wk：0 = 触手，1 = 链子
    if(t<T.up){ const e=eOut(t/T.up), wob=Math.sin(t*28)*cs*0.06*(1-e);
      const P2={x:B.x+(rise.P2.x-B.x)*e+wob, y:B.y+(rise.P2.y-B.y)*e}, C={x:B.x+(rise.C.x-B.x)*e, y:B.y+(rise.C.y-B.y)*e};
      for(let i=0;i<=N;i++) pts.push(qb(B,C,P2,i/N)); }
    else if(t<T.up+T.strike){ const u=(t-T.up)/T.strike;
      for(let i=0;i<=N;i++){ const s=i/N, ks=Math.max(0,Math.min(1,u*1.5-s*0.5)), q=ks*ks;   // 根部先动、梢后到：鞭梢甩出去
        const p0=qb(B,rise.C,rise.P2,s), p1=qb(B,imp.C,imp.P2,s), r0=Math.hypot(p0.x-B.x,p0.y-B.y), r1=Math.hypot(p1.x-B.x,p1.y-B.y);
        const a0=Math.atan2(p0.y-B.y,p0.x-B.x); let da=Math.atan2(p1.y-B.y,p1.x-B.x)-a0; while(da>Math.PI) da-=2*Math.PI; while(da<-Math.PI) da+=2*Math.PI;
        const a=a0+da*q, r=r0+(r1-r0)*q; pts.push({x:B.x+Math.cos(a)*r, y:B.y+Math.sin(a)*r}); } }
    else { const u=Math.min(1,(t-T.up-T.strike)/T.settle), sp=1-Math.cos(u*Math.PI*2.5)*Math.exp(-5*u); wk=eOut(u);
      const C={x:imp.C.x+(rest.C.x-imp.C.x)*sp, y:imp.C.y+(rest.C.y-imp.C.y)*sp};
      for(let i=0;i<=N;i++) pts.push(qb(B,C,E,i/N)); }
    const wOf=s=>cs*((0.2-0.14*s)*(1-wk)+0.075*wk);
    const OUT=capImg(wk>0.5?'#5a5470':'#4a2a6e'), BODY=capImg(wk>0.5?'#ffffff':'#b77cf0'), HI=capImg(wk>0.5?'#ffffff':'#ecd9ff');   // 触手：紫色、深紫描边、浅色高光、粉色吸盘；变成链子后换成白色
    ctx.save(); ctx.globalAlpha=1-0.5*wk;
    for(let i=0;i<N;i++) seg(OUT, pts[i], pts[i+1], wOf(i/N)+cs*0.03);
    ctx.globalAlpha=1;
    for(let i=0;i<N;i++) seg(BODY, pts[i], pts[i+1], wOf(i/N));
    if(wk<1){ ctx.globalAlpha=0.8*(1-wk);
      for(let i=0;i<N-2;i++){ const w=wOf(i/N); seg(HI, {x:pts[i].x+nx*w*0.2, y:pts[i].y+ny*w*0.2}, {x:pts[i+1].x+nx*w*0.2, y:pts[i+1].y+ny*w*0.2}, w*0.3); }
      const dot=dotImg('#ffd3ea'); for(let i=2;i<N-3;i+=3){ const w=wOf(i/N); ctx.drawImage(dot, pts[i].x-nx*w*0.25-w*0.17, pts[i].y-ny*w*0.25-w*0.17, w*0.34, w*0.34); } }   // 吸盘
    // 能量：被链接方的属性色，从低稀有度（曲线末端）流向高稀有度（起点）
    if(wk>0){ const col=ELC[lk.lo.def.el], C2=capImg(col), g=glowImg(col), ph=clock*0.85;
      for(let i=0;i<N;i++){ const s=(i+0.5)/N; let I=0; for(let j=0;j<3;j++){ const pos=1-((ph+j/3)%1); I=Math.max(I, Math.exp(-Math.pow((s-pos)/0.09,2))); }
        const a=(0.22+0.3*s+0.7*I)*wk; if(a<0.03) continue; ctx.globalAlpha=Math.min(1,a); seg(C2, pts[i], pts[i+1], wOf(s)*(0.75+0.35*I)); }
      if(g){ ctx.globalCompositeOperation='lighter';
        for(let j=0;j<3;j++){ const pos=1-((ph+j/3)%1), q=qb(B, {x:pts[N>>1].x*2-(B.x+E.x)/2, y:pts[N>>1].y*2-(B.y+E.y)/2}, E, pos); ctx.globalAlpha=0.9*wk; drawImgC(g, q.x, q.y, cs*0.55); }
        ctx.globalAlpha=(0.35+0.25*Math.sin(clock*5.3))*wk; drawImgC(g, B.x, B.y, cs*0.7); } }   // 高稀有度身上一团吸收光
    ctx.restore();
  }

  HOOKS.push((type, d)=>{
    if(type==='place') queue.push({p:d.pet, d:0});
    else if(type==='move'){ queue.push({p:d.pet, d:0.25}); }
    else if(type==='start'){ jobs.length=0; bolts.length=0; pulses.length=0; links.clear(); pending.clear(); }
  });
  return {update, drawGround, drawLabel, drawAir};
})();
