'use strict';
/* =====================================================================
   第 2 章角色 v1（_dev，未合并）：测试入口。只在网址带下面参数时生效，存档只在内存里（index.html 头部）。
   ?ch2=1        沙盒：全部宠物，能量 3000；右上「刷怪」面板选路、点怪物名刷出来（第 2 章 10 只 + 第 1 章几只对照）
   ?ch2=2-3      直接打第 2 章草案关（2-1 ~ 2-10，宠物按打到这关时手里该有的给）
   ?ch2demo=goat 机制演示：每只怪 / 新宠物一段自动布好阵的演示，循环播放；顶部写机制，底部可切换
   ===================================================================== */
(function(){
  const m=/[?&](ch2demo|ch2)=([^&]+)/.exec(location.search); if(!m) return;
  const MODE = m[1]==='ch2demo' ? 'demo' : (m[2]==='1' ? 'sandbox' : 'level'); let ARG=decodeURIComponent(m[2]);
  window.CH2 = {mode:MODE, arg:ARG};
  try{ FIRST_RUN=false; }catch(e){}
  const NEW = ['goat','cat','bellsnake','mushgoat','redbird','wildox','toucan','mushsnake','shellliz','disco'];
  const OLD = ['slime','beetle','fox','snake','gull','hornliz'];
  // 草案关：打到这一关时手里该有的宠物（关卡设计.md「第 2 章角色 v1」）
  const BASE=['flower','goldfish','pug','pumpkin','bomb','lizard','snail'];
  const OWN = {'2-1':[], '2-2':['fox'], '2-3':['fox'], '2-4':['fox'], '2-5':['fox','mushgoat'], '2-6':['fox','mushgoat'], '2-7':['fox','mushgoat'], '2-8':['fox','mushgoat','bear'], '2-9':['fox','mushgoat','bear'], '2-10':['fox','mushgoat','bear']};
  function setupProfile(owned){
    try{ cheatSkip(10); }catch(e){}
    PROFILE.owned={}; for(const k of owned) PROFILE.owned[k]=1; PROFILE.unlock={swap:1, swap3:1}; PROFILE.stars={goldfish:2, pug:2}; PROFILE.tipPick=1;
    PROFILE.loadout = owned.includes('fox') ? ['flower','goldfish','pug','pumpkin','fox', owned.includes('mushgoat')?'mushgoat':'bomb'] : ['flower','goldfish','pug','pumpkin','bomb','lizard'];
    profileSave(); try{ ROSTER=null; }catch(e){}
  }
  const spawnE = (key, lane, p, hp) => { const def=DATA.enemies[key]; const e={key, def, lane, p:p??COLS+0.4, hp:hp||def.hp, maxHp:def.hp, atkT:0, flash:0, burn:null, slow:0}; G.enemies.push(e); emit('spawn',{e}); return e; };
  const put = (k,l,c) => { G.energy=99999; for(const q in G.cooldown) G.cooldown[q]=0; if(G.cooldown[k]==null) G.cooldown[k]=0; const ok=placePet(k,l,c); if(ok){ const p=petAt(l,c); if(p) p.timer=Math.min(p.timer, 0.3); } return ok; };
  window.CH2.spawn=spawnE;

  // ---------- 机制演示 ----------
  const DEMO = {
    goat:{t:'莽角羊：进场冲刺，撞上第一只挡路的宠物 100 伤害，然后自己晕 2 秒。第 2 路前面有厚壳蜗吃这一下；第 4 路直接撞在泡泡鱼上。', run(){ put('flower',1,0); put('goldfish',1,1); put('snail',1,3); put('flower',3,0); put('goldfish',3,1); put('goldfish',3,2); spawnE('goat',1,7.5); spawnE('goat',3,7.5); }},
    cat:{t:'灰原喵：每 5 秒叼走场上一颗没收的能量（最多 3 颗）；打死它，叼走的能量全部掉出来。', run(){ put('flower',1,0); put('flower',3,0); put('goldfish',2,1); put('goldfish',2,2);
      for(const [l,p] of [[1,1.5],[3,1.5],[2,4.5]]) G.orbs.push({lane:l,p,value:25,life:1.5,fall:0,pop:0}); spawnE('cat',2,7.4); }},
    bellsnake:{t:'铃尾蛇：每 6 秒摇铃，本路和上下相邻路、前后 2 格内的其他敌人移动速度 +50%，持续 3 秒（脚下黄圈）。', run(){ for(const l of [1,2,3]) put('goldfish',l,0); spawnE('bellsnake',2,7.2); spawnE('slime',1,6.8); spawnE('slime',3,6.6); spawnE('slime',2,7.8); }},
    mushgoat:{t:'菇背羊：每 5 秒给本路和上下相邻路、前后 1.5 格内的敌人回复 60 生命（脚下绿圈）。', run(){ for(const l of [1,2,3]){ put('goldfish',l,0); put('goldfish',l,1); } spawnE('mushgoat',2,7.4); spawnE('slime',1,6.9); spawnE('slime',3,6.9); spawnE('slime',2,6.5); }},
    redbird:{t:'掠空鸟：飞在空中，不停、不咬，直接飞向警钟。第 2 路只有近战，拦不住；第 4 路的泡泡鱼能把它打下来。', run(){ put('pug',1,4); put('pumpkin',1,5); put('goldfish',3,1); put('goldfish',3,2); spawnE('redbird',1,7.4); spawnE('redbird',3,7.4); }},
    wildox:{t:'蛮角牛（精英）：从宠物身上踩过去，每只 150 伤害，不停下。第 2 路没有坦克被一路踩过；第 4 路的硬壳南瓜把它挡住。', run(){ put('goldfish',1,1); put('pug',1,4); put('goldfish',1,3); put('goldfish',3,1); put('pug',3,4); put('pumpkin',3,5); spawnE('wildox',1,7.2); spawnE('wildox',3,7.2); }},
    toucan:{t:'巨喙鸟：盯上本路最贵的宠物，盘旋 2.5 秒后叼走。第 2 路没动，喷火蜥被叼走；第 4 路在盘旋时把喷火蜥换到别的格子，它扑空落地。', run(){ put('flower',1,0); put('pug',1,1); put('lizard',1,3); put('flower',3,0); put('pug',3,1); put('lizard',3,3); spawnE('toucan',1,6.5); spawnE('toucan',3,6.5); G.swaps=9; G.swapCap=9; CH2.swapDemo=true; }},
    mushsnake:{t:'伞顶蛇：被打死时孢子炸开，本路和上下相邻路、前后 1 格内的宠物停手 2.5 秒（头上转星星）。', run(){ for(const l of [1,2,3]){ put('goldfish',l,0); put('pug',l,3); } spawnE('mushsnake',2,5.0); spawnE('slime',1,7.2); spawnE('slime',3,7.2); }},
    shellliz:{t:'背壳蜥：壳挡子弹，吐弹的宠物打它只有 25% 伤害。第 2 路只有泡泡鱼，打不动；第 4 路的迅火狐、火牙犬照常打。', run(){ put('goldfish',1,1); put('goldfish',1,2); put('goldfish',3,1); put('fox',3,3); put('pug',3,4); spawnE('shellliz',1,7.5); spawnE('shellliz',3,7.5); }},
    disco:{t:'巴隆（Boss）：践踏 + 舞池灯光（站在灯里的宠物跳舞停手，换位离开就恢复）+ 伴舞（叫 3 只莽角羊）+ 节拍冲刺（4 拍后往前冲 3 格）。演示里技能间隔缩短。', run(){
      for(const l of [0,1,2,3,4]){ put('flower',l,0); put('goldfish',l,1); put(l===2?'bear':'pug',l,4); } put('pumpkin',1,5); put('pumpkin',3,5); put('mushgoat',2,2);
      const e=spawnE('disco',2,7.2); e.ds={light:1.5, dance:9, dash:5, pose:0, dsh:null}; }},
    fox:{t:'迅火狐（宠物，第 2 章给）：每 0.6 秒挥爪横扫本路和上下相邻两路的前方 1 格，每次 22 伤害。', run(){ put('fox',2,3); put('goldfish',2,0); spawnE('slime',1,6.5); spawnE('slime',2,6.8); spawnE('slime',3,6.2); spawnE('beetle',2,7.6); }},
    mushgoat_pet:{t:'菇背羊（宠物，收服后）：不攻击，每 6 秒给周围 3×3 格内的宠物回复 80 生命。', run(){ put('mushgoat',2,2); put('pumpkin',2,3); put('pug',1,3); put('pug',3,3); for(const p of G.pets) if(p.key!=='mushgoat') p.hp=p.maxHp*0.45; for(const l of [1,2,3]) spawnE('slime',l,5); }},
    bear_pet:{t:'格鲁姆（宠物）【提案】：生命 2400，挡得住践踏；每 2.4 秒拍击前方 1 格，90 伤害并击退 0.6 格。', run(){ put('bear',2,4); put('goldfish',2,1); spawnE('wildox',2,7.4); spawnE('goat',1,8); put('goldfish',1,1); }},
  };
  const DEMO_KEYS = Object.keys(DEMO);
  const CN = k => k==='mushgoat_pet' ? '菇背羊(宠物)' : k==='bear_pet' ? '格鲁姆(宠物)' : k==='fox' ? '迅火狐(宠物)' : DATA.enemies[k].cn;

  // ---------- 界面（DOM，叠在画布上；只在测试入口出现）----------
  const css = document.createElement('style'); css.textContent = `
    #ch2p{position:fixed;z-index:50;right:6px;top:calc(env(safe-area-inset-top,0px) + 128px);font:600 12px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#fff;user-select:none}
    #ch2p button{font:inherit;border:0;border-radius:8px;padding:5px 7px;margin:2px;background:#4a3b6b;color:#fff;box-shadow:0 2px 0 #2a2140}
    #ch2p button.on{background:#e8902a;box-shadow:0 2px 0 #8a4f10}
    #ch2p .box{background:rgba(30,24,44,.86);border-radius:10px;padding:6px;max-width:250px;margin-top:4px}
    #ch2p .row{display:flex;flex-wrap:wrap}
    #ch2t{position:fixed;z-index:50;left:6px;right:6px;bottom:calc(env(safe-area-inset-bottom,0px) + 90px);background:rgba(30,24,44,.72);color:#fff;border-radius:8px;padding:4px 8px;font:600 11px/1.4 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;pointer-events:none}`;
  document.head.appendChild(css);
  function ui(){
    const p=document.createElement('div'); p.id='ch2p'; document.body.appendChild(p);
    for(const ev of ['pointerdown','pointerup','pointermove','touchstart','touchend','mousedown','mouseup','click']) p.addEventListener(ev, e=>e.stopPropagation());
    const tog=document.createElement('button'); p.appendChild(tog);
    const box=document.createElement('div'); box.className='box'; p.appendChild(box);
    let open = MODE==='sandbox';
    const sync=()=>{ box.style.display=open?'block':'none'; tog.textContent= MODE==='demo' ? (open?'收起演示列表':'演示列表') : (open?'收起刷怪':'刷怪'); };
    tog.onclick=()=>{ open=!open; sync(); }; sync();
    const row=(parent)=>{ const r=document.createElement('div'); r.className='row'; parent.appendChild(r); return r; };
    const btn=(r, label, fn)=>{ const b=document.createElement('button'); b.textContent=label; b.onclick=fn; r.appendChild(b); return b; };
    if(MODE==='demo'){
      const r=row(box), bs={}; for(const k of DEMO_KEYS){ bs[k]=btn(r, CN(k), ()=>{ CH2.switchDemo(k); open=false; sync(); }); }
      CH2.mark=()=>{ for(const k in bs) bs[k].className = k===ARG ? 'on' : ''; }; CH2.mark();
      return; }
    let lane=-1; const lr=row(box); const lb=[];
    lb.push(btn(lr,'随机路',()=>{ lane=-1; lb.forEach((b,i)=>b.className=i===0?'on':''); }));
    for(let i=0;i<5;i++) lb.push(btn(lr,'第'+(i+1)+'路',()=>{ lane=i; lb.forEach((b,j)=>b.className=j===i+1?'on':''); }));
    lb[0].className='on';
    const pickLane=()=> lane>=0 && laneOn(lane) ? lane : DATA.level.lanes[Math.floor(Math.random()*DATA.level.lanes.length)];
    const r1=row(box); for(const k of NEW) btn(r1, DATA.enemies[k].cn, ()=>{ if(G && MT.inBattle) spawnE(k, pickLane()); });
    const r2=row(box); for(const k of OLD) btn(r2, DATA.enemies[k].cn, ()=>{ if(G && MT.inBattle) spawnE(k, pickLane()); });
    const r3=row(box);
    btn(r3,'能量 +1000',()=>{ G.energy+=1000; });
    btn(r3,'冷却清零',()=>{ for(const q in G.cooldown) G.cooldown[q]=0; });
    btn(r3,'清场',()=>{ for(const e of G.enemies) killEnemy(e,true); });
    const sp=btn(r3,'速度 ×1',()=>{ G.speed = G.speed>=4?1:G.speed*2; sp.textContent='速度 ×'+G.speed; });
  }
  function title(text){ let t=document.getElementById('ch2t'); if(!t){ t=document.createElement('div'); t.id='ch2t'; document.body.appendChild(t); } t.textContent=text; }

  // ---------- 启动 ----------
  let started=false, demoT=0;
  function go(){
    if(MODE==='sandbox'){ setupProfile([...BASE,'fox','mushgoat','bear']); startBattle('2-T'); }
    else if(MODE==='level'){ if(!LEVELS[ARG]){ alert('没有这一关：'+ARG); return; } setupProfile([...BASE, ...(OWN[ARG]||[])]); startBattle(ARG); }
    else { setupProfile([...BASE,'fox','mushgoat','bear']); startBattle('2-D'); }
    started=true; ui();
  }
  function demoSetup(){
    const D=DEMO[ARG]||DEMO.goat; title(D.t);
    if(G.pick && G.pick.on) pickDone();
    for(const k of PET_ORDER) if(G.cooldown[k]==null) G.cooldown[k]=0;
    G.swaps=9; G.swapCap=9; D.run(); G.energy=99999; demoT=0; CH2.swapDone=false;
  }
  setInterval(()=>{
    if(!started){ if(typeof READY!=='undefined' && READY && typeof BATTLE_READY!=='undefined' && BATTLE_READY && typeof MT!=='undefined') go(); return; }
    if(MODE==='sandbox' && G && G.pick && !G.pick.on && !G._ch2){ G._ch2=1; G.energy=3000; }
    if(MODE!=='demo' || !MT.inBattle || !G) return;
    if(!G._ch2){ G._ch2=1; demoSetup(); }
  }, 100);
  // 演示切换不重新加载页面
  window.CH2.switchDemo = k => { if(!DEMO[k]) return; ARG=k; history.replaceState(null,'','?ch2demo='+k); CH2.swapDemo=false; newGame(); G.started=true; G._ch2=0; if(CH2.mark) CH2.mark(); };
  // 演示：怪全没了（或超过 30 秒）就重来一遍；巨喙鸟演示里第 4 路在盘旋 1.2 秒时自动把喷火蜥换走
  HOOKS.push((type,d)=>{ if(MODE!=='demo') return;
    if(type==='lock' && CH2.swapDemo && d.pet.lane===3) setTimeout(()=>{ if(d.pet.dead || !G.pets.includes(d.pet)) return; G.swaps=Math.max(G.swaps,1); movePet(d.pet, 4, d.pet.col); }, 1200/Math.max(1,G.speed));
  });
  const tick=()=>{ if(MODE==='demo' && started && MT.inBattle && G && G._ch2){ demoT+=0.25*(G.paused?0:1);
      if(G.enemies.length===0){ if(G._empty==null) G._empty=G.t; } else G._empty=null;
      const done = (G._empty!=null && G.t-G._empty>2.5) || G.t>(ARG==='disco'?50:28) || G.over;   // 怪清完再停 2.5 秒（看完叼走、掉能量），按游戏时间算
      if(done){ newGame(); G.started=true; G._ch2=0; } } };
  setInterval(tick, 250);
})();
