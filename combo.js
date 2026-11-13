'use strict';
/* =====================================================================
   效果组合播放器（素材版 9）
   数据：assets/combos/combos.js（= 素材库\效果组合\组合数据.js，tools/build_combos.py 打包）
   代码只按组合名调用：COMBO.play('咬-命中-T2', {x,y,gx,gy, freeze:[...]})
   - 特效：按“内容框”缩放（大小格 = 可见内容宽度）；锚点 center = 内容中心对准位置，left = 内容左边从位置起沿前进方向铺；
           加色层用 lighter 按 ADD_ALPHA（0.4～0.6）叠；说明里带“地面”的层放在地面点并压扁成透视椭圆。
   - 顿帧/震屏（vfx-design 第 3 节）：T1 无；T2 局部 2 帧；T3 局部 3 帧 + 轻震；T4 全屏 4 帧 + 震屏。只有 T4 全屏。
   - 音效（6.3 节）：同一音效层 60ms 内只播一次（多出来的合并进正在响的那个，音量稍大）；
           同一音效层最多 4 个声部；k 个同时 → 每个 ×1/√k；每个角色固定一个声音，音高随机 ±3%（界面类不随机；旧组合仍有变体轮换）；
           优先级：界面/T4 > 命中、死亡 > 出手、操作、拾取，声部多时先丢低优先级。
   ===================================================================== */
const COMBO = (()=>{
  const DATA = window.COMBOS, BY = {};
  for(const c of DATA['组合']) BY[c['名']] = c;
  const FRAME = 1/60;
  const TIER = {
    T1:{freeze:0,        shake:null},
    T2:{freeze:2*FRAME,  shake:null},
    T3:{freeze:3*FRAME,  shake:[0.025,0.18]},
    T4:{global:4*FRAME,  shake:[0.1,0.4]},
  };
  const TARGET_DB = DATA['目标响度'];          // 档 → 目标响度；改档时按差值补音量
  const ADD_ALPHA = {forest:0.45, default:0.5};   // 加色层强度：亮场景低一点（草地 0.45）
  const GROUND_SQUASH = 0.45;                  // 地面层压扁比例（和 v6 地面波纹一致）

  // ---------- 图片 ----------
  const IMGS = {};
  const url = p => 'assets/combos/img/' + p.split('/').map(encodeURIComponent).join('/');
  function im(p){ if(!IMGS[p]){ const i=new Image(); i.src=url(p); IMGS[p]=i; } return IMGS[p]; }
  const okI = i => i && i.complete && i.naturalWidth>0;
  function preload(onStep){   // 55 版：onStep(已完成, 总数) 用来显示进度
    const list=[];
    for(const c of DATA['组合']) for(const l of c['特效层']) (l['类型']==='图集'?[l['素材']]:l['帧']).forEach(p=>list.push(p));
    const all=[...new Set(list)]; let done=0; const step=()=>{ done++; if(onStep) onStep(done, all.length); }; if(onStep) onStep(0, all.length);
    return Promise.all(all.map(p=>new Promise(res=>{ const i=im(p); if(okI(i)){ step(); return res(); } i.onload=i.onerror=()=>{ step(); res(); }; })));
  }
  const nFrames = l => l['类型']==='图集' ? (l['帧范围'][1]-l['帧范围'][0]) : l['帧'].length;
  const isGround = l => /地面|压扁/.test(l['说明']||'');
  // 画一层的第 fi 帧；位置 (x,y) 是锚点；rot 只给 left 锚点（沿前进方向铺）
  function drawLayer(l, fi, x, y, o){
    const cs=L.cs, box=l['内容框'], bw=box[2]-box[0], s=l['大小格']*cs*(o.scale||1)/bw;
    let image, sx=0, sy=0, fw, fh;
    if(l['类型']==='图集'){ image=im(l['素材']); if(!okI(image)) return; fw=l['帧宽']; fh=l['帧高'];
      const cols=Math.max(1,Math.floor(image.naturalWidth/fw)), f=l['帧范围'][0]+fi; sx=(f%cols)*fw; sy=Math.floor(f/cols)*fh; }
    else { image=im(l['帧'][fi]); if(!okI(image)) return; fw=image.naturalWidth; fh=image.naturalHeight; }
    const cx = l['锚点']==='left' ? box[0] : (box[0]+box[2])/2, cy=(box[1]+box[3])/2;
    ctx.save();
    const a0=(o.alpha??1)*(l['不透明度']??1);
    if(l['加色']){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=a0*(ADD_ALPHA[SCENE.theme]??ADD_ALPHA.default); }
    else ctx.globalAlpha=a0;
    ctx.translate(x,y);
    if(l['锚点']==='left' && o.dir) ctx.rotate(Math.atan2(o.dir.y,o.dir.x));
    if(o.rot) ctx.rotate(o.rot);
    if(o.squashY) ctx.scale(1,o.squashY);
    ctx.scale(s,s);
    ctx.drawImage(image, sx,sy,fw,fh, -fw/2-cx, -fh/2-cy, fw, fh);
    ctx.restore();
  }

  // ---------- 正在播放的特效层 ----------
  const LIVE = [];   // {l, t, x, y, o, pass}  pass: ground=地面层（画在角色下面）/ world / screen
  function spawnLayers(c, at, o){
    for(const l of c['特效层']){
      let x=at.x, y=at.y, squashY=null;
      let pass = at.screen ? 'screen' : 'world';
      if(l['位置']==='target2'){ if(!at.target2) continue; x=at.target2.x; y=at.target2.y; }   // 没打到东西：不播命中点的层
      else if(isGround(l) && at.gx!=null && !at.screen){ x=at.gx; y=at.gy; squashY=GROUND_SQUASH; pass='ground'; }
      LIVE.push({l, t:-(l['延迟ms']||0)/1000, x, y, o:{dir:at.dir, scale:o.scale, alpha:o.alpha, squashY}, pass});
    }
  }
  // 按游戏时间推进的延迟任务（顿帧、暂停、2 倍速时和画面同步）
  const LATER = [];
  function later(sec, fn){ LATER.push({t:sec, fn}); }
  function draw(dt, pass){
    if(pass==='world'){ for(const j of LATER){ j.t-=dt; if(j.t<=0 && !j.done){ j.done=true; j.fn(); } } for(let i=LATER.length-1;i>=0;i--) if(LATER[i].done) LATER.splice(i,1); }
    for(const v of LIVE){
      if(v.pass!==pass) continue;
      v.t+=dt; if(v.t<0) continue;
      let fi=Math.floor(v.t*v.l['fps']); const n=nFrames(v.l);
      if(fi>=n){ v.done=true; continue; }
      drawLayer(v.l, fi, v.x, v.y, v.o);
    }
    for(let i=LIVE.length-1;i>=0;i--) if(LIVE[i].done) LIVE.splice(i,1);
  }
  // 循环层（弹体）：按时间取帧
  function drawLoop(name, x, y, t, o){
    const c=BY[name]; if(!c) return;
    for(const l of c['特效层']){ const fi=Math.floor(t*l['fps'])%nFrames(l); drawLayer(l, fi, x, y, o||{}); }
  }

  // ---------- 音频 ----------
  const A = { ac:null, bus:null, bufs:{}, keys:{}, voices:[] };
  function b64buf(s){ const bin=atob(s), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u.buffer; }
  function audioInit(ac, out){
    if(A.ac) return; A.ac=ac;
    A.bus=ac.createGain(); A.bus.gain.value=Math.pow(10,6/20);   // 组合库整体压低了 6dB，这里补回（之后进总线压缩器）
    A.bus.connect(out);
    audioData();
  }
  // 55 版：音效数据（COMBO_AUDIO）改为后台加载，可能比 audioInit 晚到；到了再调一次，只解码还没解码过的
  const A_DONE = {};
  function audioData(){
    if(!A.ac) return; const src=window.COMBO_AUDIO||{};
    for(const p of Object.keys(src)){ if(A_DONE[p]) continue; A_DONE[p]=1;
      A.ac.decodeAudioData(b64buf(src[p])).then(b=>{ A.bufs[p]=b; }).catch(e=>console.warn('音效解码失败', p, e)); }
  }
  const priOf = (c, tier) => (c['类']==='界面' || tier==='T4') ? 3 : /出手|移动|放置|产出|掉落|收取|获得|卖出/.test(c['名']) ? 1 : 2;
  function playLayer(c, li, opt){
    if(typeof SND!=='undefined' && SND.muted) return;
    const ac=A.ac, s=c['音效层'][li], key=c['名']+'#'+li, now=ac.currentTime;
    const st=A.keys[key]=A.keys[key]||{last:-1, vi:0, ri:0};
    A.voices=A.voices.filter(v=>v.end>now);
    const mine=A.voices.filter(v=>v.key===key);
    // 60ms 内重复 / 已满 4 个声部：合并进最近的那个，音量稍大（每次 +1dB，最多 +3dB）
    if((st.last>=0 && now-st.last<0.06) || mine.length>=4){
      const v=mine[mine.length-1]; if(v && v.boost<3){ v.boost+=1; v.g.gain.setTargetAtTime(v.base*Math.pow(10,v.boost/20)/Math.sqrt(v.k), now, 0.01); }
      return;
    }
    const pri=priOf(c, opt.tier||c['强度']), total=A.voices.length;
    if((pri===1 && total>=8) || (pri===2 && total>=12)) return;   // 单位多时先压出手音
    const vr=s['变体'][st.vi++ % s['变体'].length], buf=A.bufs[vr['文件']]; if(!buf) return;
    const rates=s['播放速度']&&s['播放速度'].length?s['播放速度']:[1];
    let rate=rates[st.ri++ % rates.length];
    if(c['类']!=='界面') rate*=1+(Math.random()*2-1)*(rates.length>1?0.01:0.03);   // 8 版：每个角色固定一个声音，只做 ±3% 轻微变调（旧组合的速度表轮换时只再抖 ±1%）
    let db=vr['音量dB'];
    const lt=s['档']||c['强度'];   // 只有 T 档的音效层跟着改档（界面、拾取层不动）
    if(opt.tier && /^T\d$/.test(lt) && TARGET_DB[opt.tier]!=null && TARGET_DB[lt]!=null) db+=TARGET_DB[opt.tier]-TARGET_DB[lt];
    const base=Math.pow(10,db/20)*(opt.vol??1);
    const k=mine.length+1;
    for(const v of mine){ v.k=k; v.g.gain.setTargetAtTime(v.base*Math.pow(10,v.boost/20)/Math.sqrt(k), now, 0.01); }
    const src=ac.createBufferSource(); src.buffer=buf; src.playbackRate.value=rate;
    const g=ac.createGain(); g.gain.value=base/Math.sqrt(k);
    src.connect(g); g.connect(A.bus); src.start(now);
    st.last=now;
    A.voices.push({key, g, base, k, boost:0, end:now+buf.duration/rate});
  }
  function sound(c, opt){
    if(!A.ac || (typeof SND!=='undefined' && SND.muted)) return;
    c['音效层'].forEach((s,li)=>{ const d=(s['延迟ms']||0); if(d>0) later(d/1000, ()=>playLayer(c,li,opt)); else playLayer(c,li,opt); });
  }

  // ---------- 对外 ----------
  // at: {x,y} 事件位置；gx,gy 地面点；target2 第二个位置；dir 前进方向；screen 画在界面层
  // opt: {freeze:[可视对象...] 局部顿帧对象, tier 改档（如精英死亡 T2→T4）, scale, vol, silent, noFx}
  function play(name, at, opt){
    opt=opt||{}; const c=BY[name]; if(!c){ console.warn('没有这个组合', name); return; }
    if(!opt.noFx && at) spawnLayers(c, at, opt);
    if(!opt.silent) sound(c, opt);
    const tier=opt.tier||c['强度'], T=TIER[tier];
    if(T && (c['类']==='攻击' || c['类']==='死亡')){
      if(T.global) HITSTOP=Math.max(HITSTOP, T.global);
      else if(T.freeze && opt.freeze) for(const v of opt.freeze) if(v) v.freeze=Math.max(v.freeze||0, T.freeze);
      if(T.shake) shakeDir(T.shake[0], T.shake[1], T.global?null:(at&&at.dir));
    }
  }
  return { play, draw, drawLoop, later, preload, audioInit, audioData, has:n=>!!BY[n], _A:A, _LIVE:LIVE };
})();
