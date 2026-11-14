'use strict';
/* =====================================================================
   塔塔 · 战场场景 v5（素材：LayerLab 2D Minimal - Environment 1，森林主题）
   参考包里自带的 Preview_Forest：俯视草地 + 正面画的树 / 灌木 / 石头 / 石像，粗彩色描边，
   树冠下有软影子，地上零星的小花和草丛。
   画法：
     地面 = 包里的 Field_Forest 颜色；上方远处用 DeepForest 色压深，像树林深处
     棋盘 = 同色系更亮的两种草色交替；四边用包里的 Road_up_Forest 草边压住棋盘边缘（草从外面盖进来一点）
     道具和角色按脚底 y 排序（格子永远在下面）；树冠成排在棋盘上方，怪物从树林里走出来
     动态：树 / 灌木随风摆（根部固定、越高摆越大，一阵风从左往右扫过）、云影飘过、落叶、阳光
   ===================================================================== */
const SCENE = (()=>{
  const E = window.ENV1, IM = {};
  const GROUND=[97,134,78], DEEP=[62,98,60];
  const rgb=(c,a=1)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
  function rng(seed){ return ()=>{ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  let PROPS=[], DECALS=[], PARTS=[], STATIC=null, KEY='', BAKED=new Map();

  async function load(){
    await Promise.all(Object.keys(E).map(async n=>{ const i=await loadImage('assets/env1/'+n+'.png'); if(i) IM[n]=i; }));   // 56 版：用 render.js 的 loadImage（多轮重试），原来失败一次这棵树 / 石头就永远不画
  }
  const SET = {
    big:   ['Tree_Yellow_Green_02','Tree_Yellow_Green_03','Tree_Yellow_Green_04','Tree_Yellow_Green_06','Tree_Yellow_Green_07','Tree_Yellow_Green_08','Tree_Yellow_Green_10','Tree_Yellow_Green_14','Tree_Yellow_Green_15','Tree_Yellow_Green_16'],
    back:  ['Tree_Green_01','Tree_Green_02','Tree_Green_03','Tree_Green_04','Tree_Green_06','Tree_Green_07','Tree_Green_08','Tree_Green_10','Tree_Green_14','Tree_Green_15','Tree_Green_16','Tree_Green_09','Tree_Green_05','Tree_Green_11','Tree_Green_13'],
    pine:  ['Tree_Yellow_Green_17','Tree_Yellow_Green_18','Tree_Yellow_Green_19','Tree_Green_17','Tree_Green_18'],
    mid:   ['Tree_Yellow_Green_01','Tree_Yellow_Green_05','Tree_Yellow_Green_09','Tree_Yellow_Green_11','Tree_Yellow_Green_12','Tree_Yellow_Green_13','Birch_Yellow_green_01','Birch_Yellow_green_02','Tree_Green_05','Tree_Green_11','Tree_Green_12','Tree_Green_13'],
    small: ['Small_Tree_Yellow_Green_01','Small_Tree_Yellow_Green_02','Small_Tree_Yellow_Green_03','Small_Tree_Green_01','Small_Tree_Green_02'],
    bush:  ['Bush_Yellow_Green_01','Bush_Yellow_Green_02','Bush_Yellow_Green_03','Bush_Green_01','Bush_Green_02','Bush_Green_03'],
    leaf:  ['Bush_Yellow_Green_04','Bush_Yellow_Green_05','Bush_Green_04','Bush_Green_05'],
    stone: ['Stone_Gray1_01','Stone_Gray1_02','Stone_Gray1_03','Stone_Gray1_04','Stone_Gray1_05','Stone_Gray1_06'],
    pebble:['Stone_Gray1_05','Stone_Gray1_06','Stone_Gray1_03'],
    shroom:['Mushroom_Wihte_01','Mushroom_Wihte_02','Mushroom_Wihte_03'],
    flower:['Forest_Flower_01','Forest_Flower_02'],
  };
  const SWAY = n=>/^Tree|^Birch/.test(n)?0.022 : /^Small_Tree/.test(n)?0.04 : /^Bush/.test(n)?0.03 : 0;

  /* ---------- 摆放 ---------- */
  function layout(){
    const cs=L.cs, ox=L.ox, oy=L.oy, bw=LANES*cs, bh=COLS*cs, by=oy+bh, xmin=0, xmax=W, K=cs/170;   // 只铺手机画面这么宽
    const R=rng(20261110);
    PROPS=[]; DECALS=[];
    const USED=new Map(); let last='';
    const pick=k=>{ const a=SET[k].filter(v=>v!==last); let best=null, bu=1e9;
      for(const v of a.map(v=>[R(),v]).sort((x,y)=>x[0]-y[0]).map(v=>v[1])){ const u=USED.get(v)||0; if(u<bu){ bu=u; best=v; } }
      return last=best; };
    // 实心部分的左右边（用来控制伸进棋盘多少）
    const solid=(q)=>{ const a=q.flip?1-q.m.x1:q.m.x0, b=q.flip?1-q.m.x0:q.m.x1; return [q.x+(a-0.5)*q.w, q.x+(b-0.5)*q.w]; };
    const add=(n,x,fy,o={})=>{ const m=E[n]; if(!m||!IM[n]) return null; const s=(o.s||1)*K*(0.94+R()*0.12);
      const q={n,m,im:IM[n],x,y:fy,w:m.w*s*(0.95+R()*0.1),h:m.h*s,flip:o.flip??(R()<0.5),tone:o.tone??1,ph:R()*6.28,sw:SWAY(n)*(o.sw??1),bri:0.95+R()*0.1};
      USED.set(n,(USED.get(n)||0)+1); PROPS.push(q); return q; };
    // 贴着棋盘左 / 右边放：实心部分最多伸进棋盘 lim
    const addSide=(n,side,fy,o={})=>{ const q=add(n,0,fy,o); if(!q) return null; const lim=(o.lim??0.12)*cs;
      if(side<0){ q.x=ox+lim-(solid(q)[1]-q.x); if(o.out) q.x-=o.out*cs; } else { q.x=ox+bw-lim-(solid(q)[0]-q.x); if(o.out) q.x+=o.out*cs; }
      return q; };
    const inBoard=(x,y,pad)=>x>ox-pad&&x<ox+bw+pad&&y>oy-pad&&y<by+pad;
    const decal=(n,x,y,s)=>{ const m=E[n]; if(!m||!IM[n]) return; DECALS.push({n,im:IM[n],x,y,w:m.w*K*s,h:m.h*K*s,flip:R()<0.5}); };
    const flowerPatch=(x,y,k)=>{ const f=pick('flower'); for(let i=0;i<k;i++){ const a=R()*6.28, r=Math.sqrt(R())*0.45*cs; decal(R()<0.8?f:pick('flower'), x+Math.cos(a)*r, y+Math.sin(a)*r*0.6, 0.9+R()*0.3); } };

    // 1) 棋盘上方：三排树冠（后排更深、更小），怪物从树林里走出来
    const rows=[{fy:oy+0.06*cs, set:'big', s:1.0, tone:1, gap:1.05},{fy:oy-0.5*cs, set:'back', s:0.95, tone:0.86, gap:0.95},{fy:oy-1.05*cs, set:'back', s:0.9, tone:0.74, gap:0.9}];
    rows.forEach((r,ri)=>{ let x=xmin-0.6*cs+R()*0.5*cs;
      while(x<xmax+0.8*cs){ const n=pick(r.set), q=add(n,x,r.fy-R()*0.12*cs,{s:r.s,tone:r.tone}); if(!q) break;
        x+=q.w*r.gap*(0.42+R()*0.14); }
      if(ri===0) for(const fx of [0.12,0.5,0.86]){ const n=pick(fx===0.5?'leaf':'bush'); add(n,xmin+fx*(xmax-xmin)+(R()-0.5)*0.5*cs,oy+0.14*cs,{s:0.8}); }   // 树脚下三处小灌木
    });
    // 2) 两侧：树为主，大小错落 —— 小树露得多，大树露一半；下面的树冠盖住上面的树干，像树林边缘
    //    树的实心部分最多伸进棋盘 0.12 格，其余伸到屏幕外；树脚下偶尔一丛灌木，中间穿插石像、木桶、蘑菇
    const m=ox;
    const fit=(n,maxW,smax)=>{ const e=E[n]; return Math.min(smax||1.2, maxW/(e.w*K*(e.x1-e.x0))); };
    // 每侧一串「大小 + 种类」的节奏，左右错开，不对称
    const RHY={ '-1':[['big',0.95],['pine',0.75],['small',1.0],['big',1.1],['mid',0.8],['pine',0.85],['big',1.0],['small',0.95],['mid',0.9]],
                 '1':[['mid',0.85],['big',1.05],['small',0.9],['pine',0.8],['big',0.95],['mid',0.75],['big',1.1],['pine',0.75],['small',1.0]] };
    for(const side of [-1,1]){
      let y=oy+(side<0?0.75:1.05)*cs, i=0;
      while(y<by+0.35*cs){
        const [set,sc]=RHY[side][i%RHY[side].length];
        const n=pick(set==='pine'?'pine':set);
        // 大树：保持大尺寸，露一半；小树 / 中树 / 松树：缩到大部分能露出来（露 75%~100%），这样有大有小
        const avail=m+0.12*cs, show=0.75+R()*0.25;
        const s2 = set==='big' ? sc : Math.min(sc, fit(n, avail/show));
        addSide(n,side,y,{lim:0.12,s:s2,tone:i%2?0.93:1});
        if(set==='big' && i%2===0) addSide(pick(R()<0.5?'bush':'leaf'),side,y+0.12*cs,{lim:0.1,s:fit('Bush_Green_02',m+0.1*cs,0.9)});   // 大树脚下偶尔一丛
        y+= (set==='big'?1.1:0.7)*cs + R()*0.3*cs; i++;
      }
    }
    // 46 版（用户 2026-11-13 Safari 网页截图：「两边太空了，多放一些素材，避免两边漏的多导致没放满」）：
    //   两边露得宽时（网页模式格子缩小，两侧各露一格多），贴棋盘那一排树外侧只剩空地。外侧每隔 0.8 格再补一排树，一直补到屏幕边：
    //   种类和里排错开、颜色逐排压暗（像树林深处）、上下位置和里排交错。两边只露半格（主屏幕全屏）时不加，画面和原来一样。
    for(const side of [-1,1]){
      for(let k=1; k*0.8*cs < m-0.1*cs; k++){
        const ORD=['mid','back','pine','big','small','back'];
        let y=oy+(0.3+0.45*((k+(side<0?0:1))%2))*cs, i=k*3+(side<0?0:2);
        while(y<by+0.8*cs){
          const set=ORD[i%ORD.length], n=pick(set);
          addSide(n,side,y,{lim:0,out:k*0.8+R()*0.15,s:(set==='small'?0.95:0.82)+R()*0.16,tone:Math.max(0.74,0.92-0.07*k)});
          y+=(0.7+R()*0.35)*cs; i++;
        }
      }
    }
    // 65 版：1 路 / 3 路关卡 —— 没开放的路不铺格子，摆满树、灌木、石头、蘑菇，像路两边的树林（参照塔塔冒险队 3 条线的战场）
    //   贴着开放的路的那一列：实心部分最多伸进去 0.06 格，不挡住格子；越靠外越暗
    { const on=l=>laneOn(l), lo=Math.min(...DATA.level.lanes), hi=Math.max(...DATA.level.lanes), ax0=ox+lo*cs, ax1=ox+(hi+1)*cs;
      const CYC=[['mid',1.0],['bush',0.95],['small',1.05],['leaf',0.95],['pine',0.9],['bush',1.0],['mid',0.9],['stone',0.8],['small',1.0],['shroom',0.7],['big',0.72],['leaf',1.0]];
      for(let l=0;l<LANES;l++){ if(on(l)) continue;
        const cx=ox+(l+0.5)*cs, dist=l<lo?lo-l:l-hi, tone=dist>1?0.9:1; let y=oy+(0.55+0.3*(l%2))*cs, i=l*5;
        while(y<by-0.05*cs){
          const [set,sc]=CYC[i%CYC.length], n=pick(set), big=/big|mid|pine|small/.test(set);
          const s2=Math.min(sc, fit(n, cs*(big?1.05:0.8)));
          const q=add(n, cx+(R()-0.5)*0.3*cs, y, {s:s2, tone});
          if(q){ const [sa,sb]=solid(q); if(l<lo && sb>ax0+0.06*cs) q.x-=sb-(ax0+0.06*cs); if(l>hi && sa<ax1-0.06*cs) q.x+=(ax1-0.06*cs)-sa; }
          if(R()<0.6) flowerPatch(cx+(R()-0.5)*0.6*cs, y+0.2*cs, 2+Math.floor(R()*3));
          y+=(big?0.78:0.5)*cs+R()*0.16*cs; i++;
        }
      }
    }
    // 石像、木桶、蘑菇：完整露出，摆在两棵树之间的前面
    const side1=(n,side,c,f)=>addSide(n,side,oy+c*cs,{lim:0.1,s:fit(n,(m+0.1*cs)*f,1.0),flip:side>0});
    side1('Mushroom_Wihte_03',-1,2.75,0.7); side1('Mushroom_Pink_02',1,5.1,0.7);
    { const N=night(); if(N && N.shroom){ side1('Mushroom_Pink_01',-1,4.6,0.6); side1('Mushroom_Yellow_02',1,3.5,0.6); side1('Mushroom_Wihte_01',-1,6.9,0.6); side1('Mushroom_Yellow_03',1,7.3,0.6); } }   // 71 版夜景 C：两边多几丛会发光的蘑菇
    // 右上那段空地：一根叠石石柱，脚下一块小石头
    side1('Stone_Gray1_11',1,2.2,1.0); side1('Stone_Gray1_06',1,2.38,0.55);
    // 底部两角（家门口两边，最靠前，不会被树挡住）：左边石像 + 蘑菇，右边木桶 + 石蛙
    side1('Stone_Gray1_08',-1,COLS+0.72,1.15); side1('Mushroom_Wihte_02',-1,COLS+0.86,0.55);
    side1('Stone_Gray1_04',1,COLS+0.62,0.85); side1('Stone_Gray1_09',1,COLS+0.85,1.0);
    // 3) 棋盘上方左右两角：各一棵完整可见的小树（在信息栏下面，露出树冠）
    // 4) 底边（家门口）：警钟之间点缀小花和草；下方一道矮树篱，被卡槽盖住一半，像花园的边
    for(let l=0;l<=LANES;l++){ const x=ox+l*cs; flowerPatch(x, by+0.62*cs, 3); }
    // 6) 地面点缀（画进静态底图）：小花一丛一丛，草丛零星；不进棋盘
    const area=(xmax-xmin)*H/(cs*cs);
    for(let i=0;i<area*0.07;i++){ const x=xmin+R()*(xmax-xmin), y=R()*(oy+0.1*cs); if(inBoard(x,y,0.3*cs)) continue; flowerPatch(x,y,3+Math.floor(R()*4)); }
    for(let i=0;i<area*0.1;i++){ const x=xmin+R()*(xmax-xmin), y=R()*(oy+0.1*cs); if(inBoard(x,y,0.2*cs)) continue; decal('Forest_Grass',x,y,0.9+R()*0.4); }
    BAKED.clear(); STATIC=null;
    const P=rng(7); PARTS=[]; for(let i=0;i<14*1;i++) PARTS.push({x:xmin+P()*(xmax-xmin),y:P()*H,a:P()*6.28,s:P(),v:P()});
  }

  /* ---------- 静态底图：地面、树林深处、棋盘、草边、地面点缀 ---------- */
  function rr(g,x,y,w,h,r){ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }
  function buildStatic(cells){
    const cs=L.cs, oy=L.oy, bh=COLS*cs, by=oy+bh;
    const LN=DATA.level.lanes, ox=L.ox+Math.min(...LN)*cs, bw=(Math.max(...LN)-Math.min(...LN)+1)*cs;   // 65 版：棋盘 = 开放的那几路（中间连着的一块）
    const c=document.createElement('canvas'); c.width=Math.round(W*DPR); c.height=Math.round(H*DPR); const g=c.getContext('2d');
    g.setTransform(DPR,0,0,DPR,0,0); g.imageSmoothingQuality='high';
    const xmin=0, span=W, R=rng(42);
    g.fillStyle=rgb(GROUND); g.fillRect(xmin,0,span,H);
    // 地面大块深浅（同色系 ±3%），很柔和
    for(let i=0;i<60*Math.max(1,span/W);i++){ const x=xmin+R()*span, y=R()*H, r=(0.8+R()*1.8)*cs, d=R()<0.5?-1:1;
      const gr=g.createRadialGradient(x,y,0,x,y,r); gr.addColorStop(0,`rgba(${d>0?'255,255,220':'30,60,30'},${0.05+R()*0.04})`); gr.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=gr; g.beginPath(); g.ellipse(x,y,r,r*0.7,R()*3,0,7); g.fill(); }
    // 树林深处：棋盘上方往上逐渐变成深林色
    const tg=g.createLinearGradient(0,oy-1.6*cs,0,oy+0.2*cs); tg.addColorStop(0,rgb(DEEP)); tg.addColorStop(1,rgb(DEEP,0)); g.fillStyle=tg; g.fillRect(xmin,0,span,oy+0.2*cs);
    // 地面点缀
    for(const d of DECALS){ g.save(); g.translate(d.x,d.y); if(d.flip) g.scale(-1,1); g.drawImage(d.im,-d.w/2,-d.h/2,d.w,d.h); g.restore(); }
    // 棋盘：底下一圈很淡的阴影，让它像略低一点的空地
    g.save(); g.shadowColor='rgba(30,55,25,.45)'; g.shadowBlur=0.25*cs*DPR; g.fillStyle='rgb(140,185,98)'; rr(g,ox,oy,bw,bh,0.1*cs); g.fill(); g.restore();
    const special=new Map((cells||[]).map(c=>[c.lane+','+c.col,c.type]));
    g.save(); rr(g,ox,oy,bw,bh,0.1*cs); g.clip();
    for(let l=0;l<LANES;l++) for(let c2=0;c2<COLS;c2++){ if(!laneOn(l)){ R(); for(let k=0;k<2;k++){ R();R();R();R();R(); } continue; }
      const r=L.cellRect(l,c2), dark=(l+c2)%2===1;
      const base=dark?[132,178,92]:[149,193,104], j=(R()-0.5)*3;
      const gr=g.createLinearGradient(0,r.y,0,r.y+cs); gr.addColorStop(0,rgb(base.map(v=>v+4+j))); gr.addColorStop(1,rgb(base.map(v=>v-4+j)));
      g.fillStyle=gr; g.fillRect(r.x,r.y,cs+0.5,cs+0.5);
      for(let k=0;k<2;k++){ const px=r.x+R()*cs, py=r.y+R()*cs, rad=(0.15+R()*0.2)*cs; g.fillStyle=`rgba(${R()<0.5?'255,255,210,.07':'30,70,20,.06'})`; g.beginPath(); g.ellipse(px,py,rad,rad*0.6,R()*3,0,7); g.fill(); }
      if(special.get(l+','+c2)==='flower'){   // 花丛格：一小片蓝花黄花 + 草丛（包里的花）
        const fl=[[0.22,0.25,'Forest_Flower_02'],[0.42,0.18,'Forest_Flower_01'],[0.72,0.24,'Forest_Flower_02'],[0.15,0.55,'Forest_Flower_01'],[0.84,0.5,'Forest_Flower_02'],[0.25,0.85,'Forest_Flower_02'],[0.55,0.9,'Forest_Flower_01'],[0.82,0.82,'Forest_Flower_02'],[0.5,0.32,'Forest_Grass']];
        for(const [fx,fy,n] of fl){ const m=E[n], s=cs/170*1.05; g.drawImage(IM[n], r.x+fx*cs-m.w*s/2, r.y+fy*cs-m.h*s/2, m.w*s, m.h*s); }
      }
    }
    g.restore();
    // 四边草边：包里的 Road_up_Forest，草从外面盖进棋盘一点点（上边朝下，下边朝上，左右竖着）
    const fr=IM.Road_up_Forest, fm=E.Road_up_Forest;
    if(fr){ const fh=0.2*cs, fw=fh*fm.w/fm.h, inset=fh*0.62;
      const strip=(len)=>{ for(let x=-len/2-fw; x<len/2+fw; x+=fw-1) g.drawImage(fr,x,-fh,fw,fh); };
      const side=(cx,cy,rot,len)=>{ g.save(); g.beginPath(); g.translate(cx,cy); g.rotate(rot); g.rect(-len/2-fh,-fh*1.5,len+fh*2,fh*2); g.clip(); strip(len); g.restore(); };
      side(ox+bw/2, oy+inset, 0, bw); side(ox+bw/2, by-inset, Math.PI, bw); side(ox+inset, oy+bh/2, -Math.PI/2, bh); side(ox+bw-inset, oy+bh/2, Math.PI/2, bh);
      // 四个角补一块草色圆角，盖住草边交接
      g.fillStyle=rgb(GROUND); for(const [x,y] of [[ox,oy],[ox+bw,oy],[ox,by],[ox+bw,by]]){ g.beginPath(); g.arc(x,y,fh*0.55,0,7); g.fill(); }
    }
    { const N=night(); if(N) nightPaint(g, c.width, c.height, N, null); }
    STATIC=c;
  }

  /* ---------- 71 版：夜景（预览中，用户选定后定稿） ----------
     做法参照 PvZ1 夜晚：整片场景压暗偏蓝紫；地面和道具在烘焙时一次乘好（每帧不多花），角色和特效、能量、界面不在这一步。
     env = 场景最终的乘色，chr = 角色、落叶等每帧再乘的一层（全屏一次）。烘焙时用 env / chr，叠上每帧那层后场景正好是 env。 */
  const NIGHTS = {
    A:{name:'A 冷色夜', env:[118,130,190], chr:[214,220,245]},
    B:{name:'B 月光夜', env:[78,92,160],  chr:[176,186,228], moon:true, fire:true},
    C:{name:'C 蘑菇夜', env:[96,108,172], chr:[196,202,238], fire:true, shroom:true},
  };
  let NIGHT_FORCE = (/[?&]night=([ABC])\b/.exec(location.search)||[])[1] || null;
  const nightKey = () => NIGHT_FORCE!==null ? NIGHT_FORCE : (DATA.level.night||'');
  const night = () => NIGHTS[nightKey()] || null;
  const bakeMul = N => N.env.map((v,i)=>Math.min(255, Math.round(v/N.chr[i]*255)));
  function nightPaint(g, w, h, N, mask){   // 乘色；mask 有值 = 只乘不透明的部分（道具）
    g.save(); g.setTransform(1,0,0,1,0,0); g.globalCompositeOperation='multiply'; g.fillStyle=rgb(bakeMul(N)); g.fillRect(0,0,w,h);
    if(mask){ g.globalCompositeOperation='destination-in'; g.drawImage(mask,0,0); } g.restore(); }

  /* ---------- 道具：按显示尺寸烘焙一次（高质量缩小）；后排压暗 ---------- */
  function bake(p){
    if(BAKED.has(p)) return BAKED.get(p);
    const S=DPR, pad=2, w=Math.max(1,Math.ceil(p.w*S)), h=Math.max(1,Math.ceil(p.h*S));
    // 分两步缩小，边缘更干净
    let src=p.im; if(src.width>w*2.2){ const t=document.createElement('canvas'); t.width=Math.ceil(w*2); t.height=Math.ceil(h*2); const tg=t.getContext('2d'); tg.imageSmoothingQuality='high'; tg.drawImage(src,0,0,t.width,t.height); src=t; }
    const a=document.createElement('canvas'); a.width=w+pad*2; a.height=h+pad*2; const g=a.getContext('2d'); g.imageSmoothingQuality='high';
    g.save(); if(p.flip){ g.translate(a.width,0); g.scale(-1,1); } if(p.bri!==1) g.filter=`brightness(${p.bri})`; g.drawImage(src,pad,pad,w,h); g.restore(); g.filter='none';
    if(p.tone<0.999){ g.globalCompositeOperation='source-atop'; g.fillStyle=rgb(DEEP.map(v=>v*0.55),(1-p.tone)*1.7); g.fillRect(0,0,a.width,a.height); g.globalCompositeOperation='source-over'; }
    { const N=night(); if(N){ const m=document.createElement('canvas'); m.width=a.width; m.height=a.height; m.getContext('2d').drawImage(a,0,0); nightPaint(g, a.width, a.height, N, m); m.width=0; m.height=0; } }
    const res={img:a,pad,S}; BAKED.set(p,res); return res;
  }
  function drawProp(ctx,p,t){
    const b=bake(p), dw=b.img.width/b.S, dh=b.img.height/b.S, pd=b.pad/b.S, footY=p.m.foot*p.h;
    // 摇动：根部固定、越高摆越大；两个频率叠加 + 一阵从左往右扫过的风
    const gust=Math.max(0,Math.sin(t*0.45 - p.x/(L.cs*6)))**6;
    const k=p.sw ? Math.sin(t*1.3+p.ph)*p.sw + Math.sin(t*2.9+p.ph*1.7)*p.sw*0.35 + gust*p.sw*1.8 : 0;
    ctx.save(); ctx.translate(p.x,p.y); ctx.transform(1,0,-k,1,0,0);
    ctx.drawImage(b.img,-dw/2,-footY-pd,dw,dh); ctx.restore();
  }

  /* ---------- 环境动态 ---------- */
  const FX_OFF = /[?&]fx=0\b/.test(location.search);   // 诊断开关：关掉云影和暖光，真机对比发热用
  function drawFx(ctx,t,dt,leaf){
    const xmin=0, span=W, cs=L.cs;
    // 云影：大块很淡的暗斑缓慢飘过
    const NT=night();
    ctx.save(); ctx.globalCompositeOperation='multiply';
    if(!FX_OFF && !NT) for(let i=0;i<3+Math.floor(span/W);i++){ const x=xmin+((t*10+i*230)%(span+500))-250, y=180+(i%3)*240; const r=cs*2.8; const g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,'rgba(110,130,150,.16)'); g.addColorStop(1,'rgba(110,130,150,0)'); ctx.fillStyle=g; ctx.fillRect(x-r,y-r,r*2,r*2); }
    ctx.restore();
    // 落叶：叶子贴图，边落边翻
    for(const p of PARTS){ p.y+=dt*(14+p.v*10); p.x+=Math.sin(t*1.5+p.a)*dt*14+dt*6; if(p.y>H+10){p.y=-10;p.x=xmin+Math.random()*span;}
      const sz=cs*(0.11+p.s*0.06);
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(t*1.2+p.a); ctx.scale(Math.cos(t*3+p.a*2),1); ctx.globalAlpha=0.8;
      if(leaf&&leaf.complete&&leaf.naturalWidth) ctx.drawImage(leaf,-sz/2,-sz/2,sz,sz); ctx.restore(); }
    if(NT) return;   // 71 版：夜里没有左上的暖光
    // 左上来的暖光
    const g=ctx.createLinearGradient(xmin,0,xmin+span*0.7,H); g.addColorStop(0,'rgba(255,240,190,.12)'); g.addColorStop(0.55,'rgba(255,240,190,0)'); ctx.fillStyle=g;
    if(FX_OFF) return;
    // 61 版：渐变过了 0.55 就全透明，只填有颜色的那一块（左上到斜线），不再整屏画一遍；画面不变
    { const dx=span*0.7, dy=H, q=0.55*(dx*dx+dy*dy), yL=Math.min(H, q/dy+2), yR=Math.min(H, Math.max(0,(q-dx*span)/dy+2));
      ctx.beginPath(); ctx.moveTo(xmin,0); ctx.lineTo(xmin+span,0); ctx.lineTo(xmin+span,yR); ctx.lineTo(xmin,yL); ctx.closePath(); ctx.fill(); }
  }

  return {
    load, THEMES:['forest'], get theme(){ return 'forest'; }, setTheme(){},
    NIGHTS, night, nightKey, setNight(k){ NIGHT_FORCE=k; },
    ensure(cells){ const key=[W,H,DPR,L.cs,DATA.level.id,DATA.level.lanes.join(''),nightKey()].join('|'); if(key!==KEY){ KEY=key; if(STATIC){ STATIC.width=0; STATIC.height=0; } for(const b of BAKED.values()){ b.img.width=0; b.img.height=0; } layout(); } if(!STATIC) buildStatic(cells); },
    drawGround(ctx){ ctx.drawImage(STATIC,0,0,W,H); },
    props(){ return PROPS; }, drawProp, drawFx,
  };
})();
