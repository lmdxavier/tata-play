'use strict';
/* =====================================================================
   87 版（用户 2026-11-15）：局内进化 —— 先做泡泡鱼（改成稀有）
   触发：稀有的泡泡鱼上下左右 4 格都被普通宠物链接（bonus.js 的稀有度链子）；每锁上一条，脚下属性光亮一档（bonus.js drawGround）；
         第一次满 4 条 → 宠物高亮闪烁 + 头顶箭头（和教学提示同一个箭头）→ 玩家点它开始演出。
   演出（真实时间，整段约 5.6 秒；期间战场速度 ×0.5，G.tscale）：
     整屏变暗 → 宠物从屏幕左侧沿弧线飞到画面中间、放大到画面高度的 1/3 → 变亮成白色剪影（轮廓完整）
     → 剪影过渡：轮廓变模糊、整体压扁收缩 → 换成进化后的剪影、舒展回弹、模糊散去（用户 18:22 补充）
     → 白色褪去、呈现进化后的样子（欢呼动作）→ 化成光球，沿弧线飞回原来的格子，近大远小缩到格子大小 → 场景恢复亮度
     → 落地后开始全屏环射（game.js ringStart：正上方起顺时针逐发，2 秒一圈，打两圈，配攻击动作）。
   能量、光都是程序画的柔光（不贴素材图）；角色用 drawLive（GPU 角色图集 + sil 剪影色）。
   ===================================================================== */
const EVO = (()=>{
  const T = { dim:0.35, flyS:0.25, flyE:1.05, whS:1.3, whE:1.8, mA:1.8, mSw:2.3, mE:2.9, revS:3.1, revE:3.6, orbS:4.3, orbF:4.65, land:5.3, undS:4.65, undE:5.45, end:5.6 };
  const DIM = 0.74;   // 变暗程度（黑紫色遮罩透明度）
  let cur = null;
  const seg = (t,a,b) => Math.max(0, Math.min(1, (t-a)/(b-a)));
  const sm = k => k*k*(3-2*k);
  const eOut = k => 1-Math.pow(1-k,3), eIn = k => k*k*k;
  const back = k => { const c=1.9; return 1+(c+1)*Math.pow(k-1,3)+c*Math.pow(k-1,2); };   // 回弹（略冲过头再回来）
  const lerp = (a,b,k) => a+(b-a)*k;
  const qb = (p0,p1,p2,k) => ({x:(1-k)*(1-k)*p0.x+2*(1-k)*k*p1.x+k*k*p2.x, y:(1-k)*(1-k)*p0.y+2*(1-k)*k*p1.y+k*k*p2.y});

  // ---------- 程序画的柔光小图（每种只画一次） ----------
  const IM = {};
  function glowImg(core, edge){ const k='g'+core+edge; if(IM[k]) return IM[k]; const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d'), gr=g.createRadialGradient(64,64,0,64,64,64);
    gr.addColorStop(0, core); gr.addColorStop(0.25, core.replace(/[\d.]+\)$/, '0.75)')); gr.addColorStop(0.55, edge); gr.addColorStop(1, edge.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle=gr; g.fillRect(0,0,128,128); return IM[k]=c; }
  function rayImg(){ if(IM.ray) return IM.ray; const c=document.createElement('canvas'); c.width=256; c.height=32; const g=c.getContext('2d'), gr=g.createLinearGradient(0,0,256,0);
    gr.addColorStop(0,'rgba(255,255,255,0.95)'); gr.addColorStop(0.3,'rgba(190,235,255,0.6)'); gr.addColorStop(1,'rgba(90,190,255,0)');
    g.fillStyle=gr; g.beginPath(); g.moveTo(0,10); g.quadraticCurveTo(128,6,256,16); g.quadraticCurveTo(128,26,0,22); g.closePath(); g.fill(); return IM.ray=c; }
  function ringImg(){ if(IM.ring) return IM.ring; const c=document.createElement('canvas'); c.width=c.height=256; const g=c.getContext('2d'), gr=g.createRadialGradient(128,128,70,128,128,128);
    gr.addColorStop(0,'rgba(140,210,255,0)'); gr.addColorStop(0.55,'rgba(235,250,255,0.95)'); gr.addColorStop(0.75,'rgba(120,200,255,0.55)'); gr.addColorStop(1,'rgba(80,170,255,0)');
    g.fillStyle=gr; g.fillRect(0,0,256,256); return IM.ring=c; }
  const WHITE = () => glowImg('rgba(255,255,255,1)', 'rgba(150,215,255,0.45)');
  const BLUE  = () => glowImg('rgba(220,245,255,1)', 'rgba(63,168,255,0.5)');
  const PURE  = () => glowImg('rgba(255,255,255,1)', 'rgba(255,255,255,0.35)');
  const HALO  = () => glowImg('rgba(110,195,255,0.85)', 'rgba(50,120,255,0.35)');   // 背后的光：中心不发白，白剪影的边才看得清
  function soft(im, x, y, sz, a){ if(a<=0) return; ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=Math.min(1,a); ctx.drawImage(im, x-sz/2, y-sz/2, sz, sz); ctx.restore(); }

  // ---------- 粒子（屏幕坐标，画在遮罩上面） ----------
  const parts = [], rings = [];
  function sparkle(x, y, n, spd, life, up){ for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2, v=spd*(0.4+Math.random()*0.8);
    parts.push({x, y, vx:Math.cos(a)*v, vy:Math.sin(a)*v-(up||0), t:0, life:life*(0.6+Math.random()*0.6), s:0.5+Math.random()*0.8}); } }
  function shock(x, y, r0, r1, life, sq){ rings.push({x, y, r0, r1, t:0, life, sq:sq||1}); }
  function stepFx(dt){
    for(const p of parts){ p.t+=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=Math.pow(0.15,dt); p.vy=p.vy*Math.pow(0.15,dt)-20*dt; }
    for(let i=parts.length-1;i>=0;i--) if(parts[i].t>=parts[i].life) parts.splice(i,1);
    for(const r of rings) r.t+=dt; for(let i=rings.length-1;i>=0;i--) if(rings[i].t>=rings[i].life) rings.splice(i,1);
  }
  function drawFx(){ const cs=L.cs;
    for(const r of rings){ const k=r.t/r.life, rr=lerp(r.r0, r.r1, eOut(k)); ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.9*(1-k); ctx.translate(r.x,r.y); ctx.scale(1,r.sq); ctx.drawImage(ringImg(), -rr, -rr, rr*2, rr*2); ctx.restore(); }
    for(const p of parts){ const k=p.t/p.life, a=k<0.15?k/0.15:1-(k-0.15)/0.85; soft(WHITE(), p.x, p.y, cs*0.22*p.s*(1-0.4*k), a); }
  }

  // ---------- 角色 ----------
  // 用 drawLive（GPU 角色图集）；squash = [sx, sy] 以脚底为中心缩放；sil = 剪影颜色
  function drawChar(v, x, y, s, o){
    const h=v.sd.h*s; ctx.save();
    if(o.rot){ ctx.translate(x, y-h*0.5); ctx.rotate(o.rot); ctx.translate(-x, -(y-h*0.5)); }
    if(o.sq){ ctx.translate(x, y-h*0.5); ctx.scale(o.sq[0], o.sq[1]); ctx.translate(-x, -(y-h*0.5)); }   // 以身体中心压扁 / 拉伸
    drawLive(v, s, !!o.flip, {hpx:h, alpha:o.alpha, sil:o.sil, flash:o.flash, cs:L.cs}, x, y);
    ctx.restore();
  }
  // 白色剪影：blur = 模糊半径（像素）—— 一圈错开的半透明剪影叠出发虚的边，中间一张实的
  // base = 先画本来的样子（描边圈在它下面、白色在它上面），用于「变白」和「白色褪去」
  function drawSil(v, x, y, s, o, a, blur, base){
    if(a<=0.003){ if(base) drawChar(v, x, y, s, o); return; }
    if(blur>0.5){ const n=10; for(let i=0;i<n;i++){ const t=i/n*Math.PI*2; drawChar(v, x+Math.cos(t)*blur, y+Math.sin(t)*blur, s, {...o, sil:`rgba(245,251,255,${(0.22*a).toFixed(3)})`}); }   // 外圈淡、内圈浓 → 边缘发虚
      for(let i=0;i<8;i++){ const t=(i+0.5)/8*Math.PI*2; drawChar(v, x+Math.cos(t)*blur*0.55, y+Math.sin(t)*blur*0.55, s, {...o, sil:`rgba(255,255,255,${(0.4*a).toFixed(3)})`}); } }
    const core = blur>0.5 ? Math.max(0, 1-blur/(L.cs*0.12)) : 1;
    if(core>0.01){ const ro=Math.max(1.5, L.cs*0.035), n=10;   // 白剪影外一圈亮蓝描边：轮廓完整、看得清（模糊时跟着淡掉）
      for(let i=0;i<n;i++){ const t=i/n*Math.PI*2; drawChar(v, x+Math.cos(t)*ro, y+Math.sin(t)*ro, s, {...o, sil:`rgba(70,165,255,${(a*Math.pow(core,4)).toFixed(3)})`}); }
      if(base) drawChar(v, x, y, s, o); }
    else if(base) drawChar(v, x, y, s, o);
    drawChar(v, x, y, s, {...o, sil:`rgba(255,255,255,${(a*(0.45+0.55*core)).toFixed(3)})`});   // 模糊时本体也变淡，边缘才看起来发虚；蓝描边按 core² 先淡掉，不会透出来
  }

  function start(pet){
    if(cur || !pet || !pet.evoReady || pet.evo || !pet.def.evo || !G.pets.includes(pet)) return false;
    if(!SPINE[pet.def.evo.spine]){ return false; }
    pet.evoReady=false; pet.evoUsed=true; pet.evoBusy=true; G.tscale=0.5; G.drag=null; G.selected=null;
    const vA=newSpine(PET_SPINE[pet.key]), vB=newSpine(pet.def.evo.spine);
    vA.st.setAnimation(0,'Walk',true); vB.st.setAnimation(0,'Idle',true);
    const f=feet(pet.lane,pet.col+0.5);
    cur={pet, g:G, t:0, vA, vB, cell:{x:f.x, y:f.y}, trail:[], did:{}};
    parts.length=0; rings.length=0;
    sparkle(f.x, f.y-L.cs*0.4, 14, L.cs*2.2, 0.5, L.cs*0.6); shock(f.x, f.y-L.cs*0.35, L.cs*0.2, L.cs*0.9, 0.4, 0.8);
    snd('共鸣', f);
    emit('evoStart',{pet});
    return true;
  }
  const snd = (name, at, o) => { try{ COMBO.play(name, {x:at.x, y:at.y}, Object.assign({noFx:true}, o||{})); }catch(e){} };
  function once(k, fn){ if(!cur.did[k]){ cur.did[k]=1; fn(); } }

  // 每帧（真实时间 dt）；在 draw() 最后调用，画在所有东西上面
  function drawOverlay(dt){
    stepFx(dt);
    if(!cur){ if(parts.length||rings.length) drawFx(); return; }
    const pet=cur.pet;
    if(cur.g!==G || !G.pets.includes(pet)){ abort(); return; }
    if(!G.paused && !window.__EVO_HOLD) cur.t+=dt;   // __EVO_HOLD：自动截图时冻住演出时间
    const t=cur.t, cs=L.cs;
    // 遮罩
    const dk = seg(t,0,T.dim)*(1-sm(seg(t,T.undS,T.undE)));
    if(dk>0){ ctx.save(); ctx.globalAlpha=DIM*sm(dk); ctx.fillStyle='#0b0814'; ctx.fillRect(-20,-20,W+40,H+40); ctx.restore(); }
    // 舞台：画面正中，角色高 = 画面高度 1/3
    const vA=cur.vA, vB=cur.vB, hT=H/3, s=hT/vA.sd.h, cx=W/2, cy=H*0.5+hT*0.42;   // cy = 脚底
    const body = {x:cx, y:cy-hT*0.5};
    for(const v of [vA,vB]){ v.st.update(dt); v.st.apply(v.sk); }
    // ① 从左侧弧线飞入
    if(t>=T.flyS && t<T.orbF){
      const k=eOut(seg(t,T.flyS,T.flyE)), P0={x:-W*0.28, y:H*0.62}, P1={x:W*0.12, y:H*0.22}, P2={x:cx, y:cy};
      const p = t<T.flyE ? qb(P0,P1,P2,k) : {x:cx, y:cy};
      const sc = t<T.flyE ? s*lerp(0.45,1,k) : s;
      if(t<T.flyE){ cur.trail.push({x:p.x, y:p.y-hT*0.5*sc/s, t}); }
      else once('arrive', ()=>{ vA.st.setAnimation(0,'Idle',true); vA.st.update(0); });
      for(const q of cur.trail){ const a=1-(t-q.t)/0.35; if(a>0) soft(BLUE(), q.x, q.y, hT*0.55*a, 0.35*a); }
      cur.trail=cur.trail.filter(q=>t-q.t<0.35);
      // 背后的光（变亮时变大）
      const wk=sm(seg(t,T.whS,T.whE)), mk=seg(t,T.mA,T.mE), rk=seg(t,T.revS,T.revE);
      const halo = t<T.flyE ? 0.3*k : 0.3+0.35*wk-0.3*sm(rk);
      soft(HALO(), body.x, body.y, hT*(1.6+0.4*wk+0.15*Math.sin(t*5)), halo);
      // 放射光线（白剪影 → 呈现之间转着）
      const ra = sm(seg(t,T.whS+0.2,T.whE+0.2))*(1-sm(seg(t,T.revE,T.orbS)));
      if(ra>0.01){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.translate(body.x, body.y); const R=rayImg(), n=14;
        for(let i=0;i<n;i++){ const a=t*0.5+i/n*Math.PI*2, len=hT*(i%2?0.95:1.35)*(0.9+0.1*Math.sin(t*3+i)), w=hT*(i%2?0.07:0.11);
          ctx.save(); ctx.rotate(a); ctx.globalAlpha=0.55*ra; ctx.drawImage(R, hT*0.18, -w/2, len, w); ctx.restore(); }
        ctx.restore(); }
      const tilt = t<T.flyE ? -0.35*(1-k) : 0;
      // ② 变成白色剪影；③ 模糊 + 压扁 → 换成进化后 → 舒展 + 模糊散去；④ 白色褪去
      if(t<T.whS){ drawChar(vA, p.x, p.y, sc, {rot:tilt}); if(t>=T.flyE) once('land1', ()=>{ shock(cx, cy-hT*0.05, hT*0.2, hT*0.7, 0.45, 0.35); }); }
      else if(t<T.mA){ drawSil(vA, cx, cy, s, {}, sm(wk), 0, true); once('wh', ()=>snd('提示', body)); }
      else if(t<T.mSw){ const a=sm(seg(t,T.mA,T.mSw)), blur=cs*0.2*a, sq=[1+0.2*a, 1-0.36*a], ss=s*(1-0.12*a);
        soft(PURE(), body.x, body.y, hT*(0.9+0.5*a), 0.3*a); drawSil(vA, cx, cy, ss, {sq}, 1, blur); }
      else if(t<T.mE){ const b=seg(t,T.mSw,T.mE), e=back(b), blur=cs*0.2*(1-sm(b)), sq=[lerp(1.2,1,e), lerp(0.64,1,e)], ss=s*lerp(0.88,1,e);
        once('swap', ()=>{ snd('召唤', body); shock(body.x, body.y, hT*0.25, hT*1.25, 0.55, 1); sparkle(body.x, body.y, 26, hT*1.6, 0.9, hT*0.3); });
        soft(PURE(), body.x, body.y, hT*1.4*(1-b), 0.45*(1-b)); drawSil(vB, cx, cy, ss, {sq}, 1, blur); }
      else if(t<T.revS){ drawSil(vB, cx, cy, s, {}, 1, 0); }
      else { // 呈现：白色褪去，播欢呼
        once('rev', ()=>{ vB.st.setAnimation(0,'Busking',false); vB.st.addAnimation(0,'Idle',true,0); snd('升星', body); shock(body.x, body.y, hT*0.3, hT*1.5, 0.6, 1); sparkle(body.x, body.y, 30, hT*1.4, 1.1, hT*0.5); });
        const ok=sm(seg(t,T.orbS-0.05,T.orbF)), sc2=s*lerp(1,0.25,eIn(seg(t,T.orbS,T.orbF)));
        drawSil(vB, cx, cy-hT*0.5*(1-sc2/s), sc2, {}, Math.max(1-sm(rk), ok), 0, true);
        if(t>=T.orbS) soft(WHITE(), body.x, body.y, hT*lerp(0.2,0.75,sm(seg(t,T.orbS,T.orbF))), 0.95*sm(seg(t,T.orbS,T.orbF))); }
    }
    // ⑤ 光球飞回格子（近大远小：从画面中间的大小缩到格子大小）
    if(t>=T.orbF && t<T.land){
      once('orbGo', ()=>{ cur.trail=[]; snd('加成-弹出', body); });
      const f=feet(pet.lane,pet.col+0.5), tgt={x:f.x, y:f.y-cs*0.38};
      const k=sm(seg(t,T.orbF,T.land)), mid={x:(body.x+tgt.x)/2+(tgt.x<body.x?-1:1)*W*0.12, y:Math.min(body.y,tgt.y)-H*0.14};
      const p=qb(body,mid,tgt,k), sz=lerp(hT*0.75, cs*0.75, eOut(k));
      cur.trail.push({x:p.x, y:p.y, sz, t}); cur.trail=cur.trail.filter(q=>t-q.t<0.22);
      for(const q of cur.trail){ const a=1-(t-q.t)/0.22; soft(BLUE(), q.x, q.y, q.sz*0.8*a, 0.55*a); }
      soft(BLUE(), p.x, p.y, sz*1.35, 0.8); soft(WHITE(), p.x, p.y, sz, 1);
    }
    // ⑥ 落地：变回战场上的宠物（进化后的样子），开始环射
    if(t>=T.land) once('land', ()=>{ const f=feet(pet.lane,pet.col+0.5), b={x:f.x, y:f.y-cs*0.38};
      pet.evo=true; pet.evoBusy=false; VIS.delete(pet); const v=visOf(pet,true); v.pop=0.25; v.squash=0.12; v.hitFlash=0.25;
      G.tscale=1; shock(b.x, f.y-cs*0.05, cs*0.25, cs*1.3, 0.5, 0.42); sparkle(b.x, b.y, 18, cs*2.4, 0.6, cs*0.8);
      snd('加成-落下', b, {fixed:true}); try{ flashAt(b.x, b.y, 1.6, 0.2, undefined, '#3fa8ff'); shakeDir(0.03, 0.18); }catch(e){}
      emit('evoDone',{pet}); ringStart(pet); });
    drawFx();
    if(t>=T.end) cur=null;
  }
  function abort(){ if(cur){ const p=cur.pet; p.evoBusy=false; if(cur.g===G) G.tscale=1; } cur=null; parts.length=0; rings.length=0; }

  // ---------- 战场层：待进化的高亮提示、环射水弹 ----------
  function drawWorld(){
    const cs=L.cs;
    for(const pet of G.pets){ if(!pet.evoReady) continue;
      const f=feet(pet.lane,pet.col+0.5), tt=ENV_T;   // 闪烁在 render.js drawPet（flash），脚下光在 bonus.js drawGround
      const arrow=tinted('gui/IconMisc/Icon_Arrow_Next2.png','#ffe9a0');   // 和教学提示同一个箭头
      if(arrow){ const bob=Math.sin(tt*6)*cs*0.06, h=cs*0.34, w=h*arrow.width/arrow.height; ctx.save(); ctx.globalAlpha=0.95; ctx.translate(f.x, f.y-cs*1.0+bob); ctx.rotate(Math.PI/2); ctx.drawImage(arrow, -w/2, -h/2, w, h); ctx.restore(); } }
    for(const r of G.rprojs){ const f=feet(r.lane, r.p), y=f.y-cs*0.38, k=Math.min(1, r.t/0.08), dx=Math.cos(r.ang), dy=Math.sin(r.ang);   // 87 版：比普通水弹大 1.7 倍，带柔光和拖尾
      for(let j=3;j>=1;j--) soft(BLUE(), f.x-dx*cs*0.22*j, y-dy*cs*0.22*j, cs*(0.5-0.09*j), 0.4*k*(1-j/4));
      soft(HALO(), f.x, y, cs*0.75, 0.45*k);
      COMBO.drawLoop('水弹-飞行', f.x, y, G.t, {rot:r.ang+Math.PI, scale:1.7, alpha:k}); }   // 贴图头朝左 → 转到飞行方向
  }
  return { _cur:()=>cur, start, busy:()=>!!cur, hides:p=>!!(cur && cur.pet===p && cur.t<T.land), drawOverlay, drawWorld, abort, T };
})();
window.EVO = EVO;
