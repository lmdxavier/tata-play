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
   第 2 章场景 v1（_dev，未合并）：主题（THEMES）= 地面色、格子色、草边、各类道具的素材表、两侧固定道具、落叶。
     第 1 章 = forest（数值和 73 版完全一样）；第 2 章默认 autumn（金秋牧场），候选 blossom（樱粉花谷）。
     关卡 id 以 2- 开头自动用第 2 章主题；关卡数据里写 theme 可以指定；网址 ?theme=autumn|blossom 强制（预览对比用）。
   ===================================================================== */
const SCENE = (()=>{
  const E = window.ENV1, IM = {}, IM2 = {};
  let GROUND=[97,134,78], DEEP=[62,98,60];
  const rgb=(c,a=1)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
  function rng(seed){ return ()=>{ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  let PROPS=[], DECALS=[], PARTS=[], STATIC=null, KEY='', BAKED=new Map();

  // 第 2 章场景 v1：第 2 章才用的道具图（秋叶树、粉树、枯树、秋花）不挡开场，开场后后台加载；没加载完时第 2 章的关先等它（ensure 里判断）
  const C2_ONLY = n => /^(Town_|Tree_Orange|Tree_Yellow_\d|Small_Tree_Orange|Small_Tree_Yellow_\d|Birch_Yellow_\d|Dead_Tree|Tree_Bare|Tree_Pink|Autumn_Flower|Road_up_Autumn)/.test(n);
  const SRC_OF = n => /^Town_/.test(n) ? 'assets/scene2/town/'+n.slice(5)+'.png' : 'assets/env1/'+n+'.png';   // 第 2 章场景 v2：Town 包的摆件放在 scene2/town
  const SCENE2_IMG = ['fringe_autumn','fringe_blossom','leaf_orange','leaf_red','leaf_yellow','leaf_pink'];
  let LATE_DONE = false, LATE_P = null;
  function loadLate(){ if(LATE_P) return LATE_P;
    LATE_P = Promise.all([...Object.keys(E).filter(C2_ONLY).map(async n=>{ const i=await loadImage(SRC_OF(n)); if(i) IM[n]=i; }),
      ...SCENE2_IMG.map(async n=>{ const i=await loadImage('assets/scene2/'+n+'.png'); if(i) IM2[n]=i; })]).then(()=>{ LATE_DONE=true; KEY=''; });
    return LATE_P; }
  async function load(){
    await Promise.all(Object.keys(E).filter(n=>!C2_ONLY(n)).map(async n=>{ const i=await loadImage(SRC_OF(n)); if(i) IM[n]=i; }));   // 56 版：用 render.js 的 loadImage（多轮重试），原来失败一次这棵树 / 石头就永远不画
    loadLate();
  }
  const SET_FOREST = {
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
  const nums = (pre, list) => list.map(i=>pre+String(i).padStart(2,'0'));
  /* 第 2 章场景 v1：主题表。数值说明见 _dev/第2章场景/v1/说明.md
     cell = 两种格子色（亮 / 暗），board = 棋盘底（格子缝里透出的颜色），blob = 地面大块深浅（亮 / 暗），fringe = 收边草（IM 名或 scene2 图），
     extras(side1, N) = 两侧固定道具（石像、木桶、蘑菇），leaves = 落叶贴图（scene2）。 */
  // 第 2 章场景 v2（用户 2026-11-15：「两个完全能做不同的章节了，树不太动，就分别加一些植物以外的其他放置物」）：
  //   每个主题一组 LayerLab 2D Buildings - Town 的摆件（小屋、集市、猫神像、喷泉……），每关按种子从组里挑 4 个放进两侧固定的 4 个位置，
  //   每关摆的不一样；Boss 关（disco）固定放一座音乐厅。Town 摆件最大只放到原图 0.6 倍（两侧露得宽时不会比树还大）。
  const placeTown=(side1,R,pool,slots,special)=>{ const a=pool.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(R()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    if(special) a.unshift(special);
    slots.forEach(([side,c],i)=>{ const [n,f]=a[i]; side1('Town_'+n, side, c+(R()-0.5)*0.2, f*1.15, 0.6); }); };
  const THEMES = {
    forest:{ name:'森林', GROUND:[97,134,78], DEEP:[62,98,60], cell:[[149,193,104],[132,178,92]], board:'rgb(140,185,98)', boardShadow:'rgba(30,55,25,.45)',
      blob:['255,255,220','30,60,30'], cblob:['255,255,210,.07','30,70,20,.06'], fringe:'Road_up_Forest', grass:'Forest_Grass', set:SET_FOREST,
      flowerCell:['Forest_Flower_02','Forest_Flower_01','Forest_Grass'] },
    // 金秋牧场：Environment 1 包里的 Autumn 一套（Preview_Autumn）——橙黄秋叶树、白桦、黄灌木、褐石；地面比包里的 Field_Autumn 略降饱和，格子是浅麦秆色
    autumn:{ name:'金秋牧场', GROUND:[232,156,76], DEEP:[176,96,58], cell:[[244,207,132],[231,187,106]], board:'rgb(236,196,118)', boardShadow:'rgba(120,60,20,.42)',
      blob:['255,240,200','150,70,20'], cblob:['255,250,220,.10','150,80,20,.06'], fringe:'fringe_autumn', grass:null, pebble:true,
      leaves:['leaf_orange','leaf_yellow','leaf_red','leaf_orange'], leafBase:18,
      propMul:[255,246,238],
      set:{
        big:  [...nums('Tree_Orange_',[2,3,4,6,7,8,9,15]), ...nums('Tree_Yellow_',[2,3,4,6,7,8,9,15])],
        back: [...nums('Tree_Orange_',[2,3,4,5,6,7,8,9,10]), ...nums('Tree_Yellow_',[2,3,4,5,6,7,8,9,10])],
        pine: [...nums('Tree_Orange_',[16,17,18,19]), ...nums('Tree_Yellow_',[16,17,18,19])],
        mid:  [...nums('Tree_Orange_',[1,11,12,13,14]), ...nums('Tree_Yellow_',[1,11,12,13,14]), 'Birch_Yellow_01','Birch_Yellow_02'],
        small:[...nums('Small_Tree_Orange_',[1,2,3]), ...nums('Small_Tree_Yellow_',[1,2,3])],
        bush: ['Bush_Yellow_01','Bush_Yellow_02','Bush_Yellow_03'],
        leaf: ['Bush_Yellow_04','Bush_Yellow_05'],
        stone:['Stone_Brown_01','Stone_Brown_02','Stone_Brown_04','Stone_Brown_05','Stone_Brown_03','Stone_Brown_07'],
        pebble:['Stone_Brown_06','Stone_Brown_07','Stone_Brown_03'],
        shroom:['Mushroom_Wihte_01','Mushroom_Wihte_02','Mushroom_Wihte_03','Mushroom_Yellow_02'],
        flower:['Autumn_Flower_01','Autumn_Flower_02'],
        bare: ['Dead_Tree_White_01','Dead_Tree_White_02','Tree_Bare_01','Dead_Tree_Brown_01','Dead_Tree_Brown_02'],
      },
      flowerCell:['Autumn_Flower_01','Autumn_Flower_02','Autumn_Flower_01'],
      extras(side1, COLS, N, R){
        side1('Mushroom_Yellow_03',-1,2.75,0.7); side1('Mushroom_Wihte_02',1,5.1,0.7);
        if(N.shroom || N.shrooms){ side1('Mushroom_Pink_01',-1,4.6,0.6); side1('Mushroom_Yellow_02',1,3.5,0.6); side1('Mushroom_Wihte_01',-1,6.9,0.6); side1('Mushroom_Yellow_01',1,7.3,0.6); }
        side1('Stone_Gray2_12',1,2.2,1.0); side1('Stone_Brown_06',1,2.38,0.55);   // 右上：苔色石像 + 小石头
        side1('Stone_Brown_01',-1,COLS+0.72,1.1); side1('Mushroom_Yellow_02',-1,COLS+0.86,0.55);   // 左下：褐色大石 + 黄蘑菇
        side1('Ork',1,COLS+0.6,0.8); side1('Stone_Brown_03',1,COLS+0.86,0.75);   // 右下：木桶（牧场）+ 小石
        // v2：牧场的小屋、木棚、木料槽、木座猫神像、石蛙、木摊集市（木头暖色一档）
        placeTown(side1, R, [['Lute_House_01',1.0],['Lute_House_02',1.0],['Rhythm_Hall_01',1.0],['Rhythm_Storage_01_00',0.85],['Goddess_Cat_Statue_02',0.9],['Statue_Frog',0.75],['Market_01',1.05]],
          [[1,3.75],[-1,1.65],[-1,5.95],[1,7.05]], N.disco ? ['Rhythm_Hall_02',1.05] : null);
      },
      top:['Lute_House_01','Lute_House_02','Rhythm_Hall_01','Market_01'] },
    // 樱粉花谷：Environment 1 的粉色树（Tree_Pink 一套）+ 白桦、嫩绿小树和灌木、浅色石头、粉白蘑菇；地面是偏蓝的薄荷绿，和第 1 章的黄绿草地分开
    blossom:{ name:'樱粉花谷', GROUND:[88,150,124], DEEP:[52,102,92], cell:[[179,213,177],[162,200,162]], board:'rgb(169,205,169)'   /* 89 版（用户 2026-11-15）：格子往粉色调一点（原 (162,218,170)/(142,202,152) 向樱粉 (255,190,210) 混 18%），和第 1 章绿地拉开 */, boardShadow:'rgba(20,60,50,.45)',
      blob:['235,255,240','20,60,50'], cblob:['240,255,240,.08','20,70,50,.06'], fringe:'fringe_blossom', grass:'DeepForest_Grass',
      leaves:['leaf_pink','leaf_pink','leaf_pink','leaf_pink'], leafBase:14,
      set:{
        big:  nums('Tree_Pink_',[2,3,4,6,7,8,9,10,15]),
        back: [...nums('Tree_Pink_',[2,3,4,5,6,7,8,9,10,15]), 'Tree_Green_06','Tree_Green_07','Tree_Green_08'],
        pine: [...nums('Tree_Pink_',[16,17,18,19]), 'Tree_Green_17','Tree_Green_18'],
        mid:  [...nums('Tree_Pink_',[1,5,11,12,13,14]), 'Birch_Green_01','Birch_Green_02'],
        small:['Small_Tree_Green_01','Small_Tree_Green_02','Small_Tree_Green_03'],
        bush: ['Bush_Green_01','Bush_Green_02','Bush_Green_03'],
        leaf: ['Bush_Green_04','Bush_Green_05'],
        stone:['Stone_Yellow_01','Stone_Yellow_02','Stone_Yellow_04','Stone_Yellow_07','Stone_Yellow_03','Stone_Yellow_05'],
        pebble:['Stone_Yellow_05','Stone_Yellow_06','Stone_Yellow_03'],
        shroom:['Mushroom_Pink_01','Mushroom_Pink_02','Mushroom_Pink_03','Mushroom_Wihte_03'],
        flower:['DeepForest_Flower_01','DeepForest_Flower_02','Forest_Flower_01'],
        bare: ['Dead_Tree_White_01','Dead_Tree_White_02','Tree_Bare_01'],
      },
      flowerCell:['DeepForest_Flower_02','DeepForest_Flower_01','DeepForest_Grass'],
      extras(side1, COLS, N, R){
        side1('Mushroom_Pink_03',-1,2.75,0.7); side1('Mushroom_Pink_02',1,5.1,0.7);
        side1('Birch_Green_01',-1,5.55,0.7);
        if(N.shroom || N.shrooms){ side1('Mushroom_Pink_01',-1,4.6,0.6); side1('Mushroom_Wihte_02',1,3.5,0.6); side1('Mushroom_Wihte_01',-1,6.9,0.6); side1('Mushroom_Pink_02',1,7.3,0.6); }
        side1('Stone_Gray1_12',1,2.2,1.0); side1('Stone_Yellow_06',1,2.38,0.55);
        side1('Stone_Yellow_02',-1,COLS+0.72,1.0); side1('Mushroom_Wihte_02',-1,COLS+0.86,0.55);
        side1('Stone_Gray1_10',1,COLS+0.66,1.0); side1('Mushroom_Pink_01',1,COLS+0.86,0.5);
        // v2：花谷的白石猫神像、喷泉、粉色爱心屋、彩色帐篷集市、水晶石台、齿轮石像（粉彩梦幻一档）
        placeTown(side1, R, [['Goddess_Cat_Statue_01',0.9],['Goddess_Cat_Statue_03',0.9],['Fountain',1.0],['Lute_House_04',1.0],['Lute_House_05',1.0],['Market_03',1.05],['Market_04',1.05],['Star_Altar_02',0.9],['Statue_Gear',0.75]],
          [[1,3.75],[-1,1.65],[-1,6.45],[1,7.05]], N.disco ? ['Rhythm_Hall_05',1.05] : null);
      },
      top:['Lute_House_05','Lute_House_04','Market_04','Fountain'] },
  };
  let THEME_FORCE = (/[?&]theme=(\w+)\b/.exec(location.search)||[])[1] || null;
  let CH2_THEME = 'blossom';   // 89 版（用户 2026-11-15）：第 2 章 = 樱粉花谷；金秋那套保留给后面的章节
  const themeKey = () => { if(THEME_FORCE && THEMES[THEME_FORCE]) return THEME_FORCE; const lv=DATA.level||{}; if(lv.theme && THEMES[lv.theme]) return lv.theme; return /^2-/.test(String(lv.id||'')) ? CH2_THEME : 'forest'; };
  let T = THEMES.forest, SET = SET_FOREST;
  const SWAY = n=>/^Tree|^Birch/.test(n)?0.022 : /^Small_Tree/.test(n)?0.04 : /^Bush/.test(n)?0.03 : 0;

  /* ---------- 摆放 ---------- */
  function layout(){
    const cs=L.cs, ox=L.ox, oy=L.oy, bw=LANES*cs, bh=COLS*cs, by=oy+bh, xmin=0, xmax=W, K=cs/170;   // 只铺手机画面这么宽
    const R=rng(20261110 + [...String(DATA.level.id||'')].reduce((h,ch)=>h*31+ch.charCodeAt(0),0) % 9973 * (DATA.level.id==='1-1'?0:1));   // 72 版：每关一个种子，树、石头、花的摆法各不一样（规则不变）
    PROPS=[]; DECALS=[];
    const USED=new Map(); let last='';
    if(T!==THEMES.forest){ SET={...T.set}; if(mood().bare && SET.bare){ SET.mid=[...SET.mid, ...SET.bare]; SET.small=[...SET.small, ...SET.bare.slice(0,2)]; } }   // 第 2 章 v1：深秋 / 夜里的几关混进枯树
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
    const side1=(n,side,c,f,smax)=>addSide(n,side,oy+c*cs,{lim:0.1,s:fit(n,(m+0.1*cs)*f,smax||1.0),flip:side>0});
    if(T.extras) T.extras(side1, COLS, mood(), R); else {
    side1('Mushroom_Wihte_03',-1,2.75,0.7); side1('Mushroom_Pink_02',1,5.1,0.7);
    { const N=mood(); if(N.shroom){ side1('Mushroom_Pink_01',-1,4.6,0.6); side1('Mushroom_Yellow_02',1,3.5,0.6); side1('Mushroom_Wihte_01',-1,6.9,0.6); side1('Mushroom_Yellow_03',1,7.3,0.6); } }   // 71 版夜景 C：两边多几丛会发光的蘑菇
    // 右上那段空地：一根叠石石柱，脚下一块小石头
    side1('Stone_Gray1_11',1,2.2,1.0); side1('Stone_Gray1_06',1,2.38,0.55);
    // 底部两角（家门口两边，最靠前，不会被树挡住）：左边石像 + 蘑菇，右边木桶 + 石蛙
    side1('Stone_Gray1_08',-1,COLS+0.72,1.15); side1('Mushroom_Wihte_02',-1,COLS+0.86,0.55);
    side1('Stone_Gray1_04',1,COLS+0.62,0.85); side1('Stone_Gray1_09',1,COLS+0.85,1.0); }
    // 第 2 章场景 v2：主题有 top 组时，棋盘正上方那排树里放一座主建筑（左或右三分之一处，每关随机），再给所有 Town 摆件让出视线：
    //   同一位置挡在摆件前面（脚底更靠下、左右重叠）的树和灌木去掉，摆件后面的树保留。竖屏两侧只露半格，不让开的话摆件整个被树盖住。
    if(T.top){ const n='Town_'+T.top[Math.floor(R()*T.top.length)], e=E[n];
      if(e&&IM[n]){ const s=Math.min(0.6, 1.25*cs/(e.w*K*(e.x1-e.x0))), x=ox+(R()<0.5?0.27:0.73)*bw+(R()-0.5)*0.4*cs; add(n,x,oy+0.12*cs,{s,flip:R()<0.5}); } }
    { const TW=PROPS.filter(q=>/^Town_/.test(q.n));
      if(TW.length){ const keep=q=>{ if(/^Town_/.test(q.n) || !/^(Tree|Small_Tree|Birch|Dead_Tree|Bush)/.test(q.n)) return true;
          const [a,b]=solid(q); return !TW.some(t=>{ const [ta,tb]=solid(t), ov=Math.min(b,tb)-Math.max(a,ta);
            return ov>0.3*(tb-ta) && q.y>t.y-0.3*cs && q.y<t.y+0.9*cs; }); };
        PROPS=PROPS.filter(keep); } }
    // 3) 棋盘上方左右两角：各一棵完整可见的小树（在信息栏下面，露出树冠）
    // 4) 底边（家门口）：警钟之间点缀小花和草；下方一道矮树篱，被卡槽盖住一半，像花园的边
    for(let l=0;l<=LANES;l++){ const x=ox+l*cs; flowerPatch(x, by+0.62*cs, 3); }
    // 6) 地面点缀（画进静态底图）：小花一丛一丛，草丛零星；不进棋盘
    const area=(xmax-xmin)*H/(cs*cs);
    for(let i=0;i<area*0.07*(mood().flowers||1);i++){ const x=xmin+R()*(xmax-xmin), y=R()*(oy+0.1*cs); if(inBoard(x,y,0.3*cs)) continue; flowerPatch(x,y,3+Math.floor(R()*4)); }
    if(T.grass!==null) for(let i=0;i<area*0.1;i++){ const x=xmin+R()*(xmax-xmin), y=R()*(oy+0.1*cs); if(inBoard(x,y,0.2*cs)) continue; decal(T.grass||'Forest_Grass',x,y,0.9+R()*0.4); }
    if(T.pebble) for(let i=0;i<area*0.03;i++){ const x=xmin+R()*(xmax-xmin), y=R()*(oy+0.1*cs); if(inBoard(x,y,0.3*cs)) continue; decal(SET.pebble[Math.floor(R()*SET.pebble.length)],x,y,0.45+R()*0.2); }   // 第 2 章 v1：金秋没有草丛贴图，零星小碎石
    BAKED.clear(); STATIC=null;
    const P=rng(7); PARTS=[]; for(let i=0;i<40;i++) PARTS.push({x:xmin+P()*(xmax-xmin),y:P()*H,a:P()*6.28,s:P(),v:P()});
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
    const BL=T.blob, CB=T.cblob;
    // 地面大块深浅（同色系 ±3%），很柔和
    for(let i=0;i<60*Math.max(1,span/W);i++){ const x=xmin+R()*span, y=R()*H, r=(0.8+R()*1.8)*cs, d=R()<0.5?-1:1;
      const gr=g.createRadialGradient(x,y,0,x,y,r); gr.addColorStop(0,`rgba(${d>0?BL[0]:BL[1]},${0.05+R()*0.04})`); gr.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=gr; g.beginPath(); g.ellipse(x,y,r,r*0.7,R()*3,0,7); g.fill(); }
    // 树林深处：棋盘上方往上逐渐变成深林色
    const tg=g.createLinearGradient(0,oy-1.6*cs,0,oy+0.2*cs); tg.addColorStop(0,rgb(DEEP)); tg.addColorStop(1,rgb(DEEP,0)); g.fillStyle=tg; g.fillRect(xmin,0,span,oy+0.2*cs);
    // 地面点缀
    for(const d of DECALS){ g.save(); g.translate(d.x,d.y); if(d.flip) g.scale(-1,1); g.drawImage(d.im,-d.w/2,-d.h/2,d.w,d.h); g.restore(); }
    // 棋盘：底下一圈很淡的阴影，让它像略低一点的空地
    g.save(); g.shadowColor=T.boardShadow; g.shadowBlur=0.25*cs*DPR; g.fillStyle=T.board; rr(g,ox,oy,bw,bh,0.1*cs); g.fill(); g.restore();
    const special=new Map((cells||[]).map(c=>[c.lane+','+c.col,c.type]));
    g.save(); rr(g,ox,oy,bw,bh,0.1*cs); g.clip();
    for(let l=0;l<LANES;l++) for(let c2=0;c2<COLS;c2++){ if(!laneOn(l)){ R(); for(let k=0;k<2;k++){ R();R();R();R();R(); } continue; }
      const r=L.cellRect(l,c2), dark=(l+c2)%2===1;
      const base=dark?T.cell[1]:T.cell[0], j=(R()-0.5)*3;
      const gr=g.createLinearGradient(0,r.y,0,r.y+cs); gr.addColorStop(0,rgb(base.map(v=>v+4+j))); gr.addColorStop(1,rgb(base.map(v=>v-4+j)));
      g.fillStyle=gr; g.fillRect(r.x,r.y,cs+0.5,cs+0.5);
      for(let k=0;k<2;k++){ const px=r.x+R()*cs, py=r.y+R()*cs, rad=(0.15+R()*0.2)*cs; g.fillStyle=`rgba(${R()<0.5?CB[0]:CB[1]})`; g.beginPath(); g.ellipse(px,py,rad,rad*0.6,R()*3,0,7); g.fill(); }
      if(special.get(l+','+c2)==='flower'){   // 花丛格：一小片蓝花黄花 + 草丛（包里的花）
        const [F2,F1,FG]=T.flowerCell, fl=[[0.22,0.25,F2],[0.42,0.18,F1],[0.72,0.24,F2],[0.15,0.55,F1],[0.84,0.5,F2],[0.25,0.85,F2],[0.55,0.9,F1],[0.82,0.82,F2],[0.5,0.32,FG]];
        for(const [fx,fy,n] of fl){ const m=E[n], s=cs/170*1.05; g.drawImage(IM[n], r.x+fx*cs-m.w*s/2, r.y+fy*cs-m.h*s/2, m.w*s, m.h*s); }
      }
    }
    g.restore();
    // 四边草边：包里的 Road_up_Forest，草从外面盖进棋盘一点点（上边朝下，下边朝上，左右竖着）
    const fr=IM[T.fringe]||IM2[T.fringe], fm=E.Road_up_Forest;   // 第 2 章 v1：收边草按主题换色（scene2/fringe_*，和 Road_up_Forest 同形状）
    if(fr){ const fh=0.2*cs, fw=fh*fm.w/fm.h, inset=fh*0.62;
      const strip=(len)=>{ for(let x=-len/2-fw; x<len/2+fw; x+=fw-1) g.drawImage(fr,x,-fh,fw,fh); };
      const side=(cx,cy,rot,len)=>{ g.save(); g.beginPath(); g.translate(cx,cy); g.rotate(rot); g.rect(-len/2-fh,-fh*1.5,len+fh*2,fh*2); g.clip(); strip(len); g.restore(); };
      side(ox+bw/2, oy+inset, 0, bw); side(ox+bw/2, by-inset, Math.PI, bw); side(ox+inset, oy+bh/2, -Math.PI/2, bh); side(ox+bw-inset, oy+bh/2, Math.PI/2, bh);
      // 四个角补一块草色圆角，盖住草边交接
      g.fillStyle=rgb(GROUND); for(const [x,y] of [[ox,oy],[ox+bw,oy],[ox,by],[ox+bw,by]]){ g.beginPath(); g.arc(x,y,fh*0.55,0,7); g.fill(); }
    }
    { const N=mood(); if(N.env) moodPaint(g, c.width, c.height, N, null); }
    STATIC=c;
  }

  /* ---------- 72 版：每关的场景氛围（明暗、滤镜、环境动态、摆放）；场景与美术.md「72 版」 ----------
     env = 场景最终乘色（地面和道具烘焙时一次乘好，每帧不多花）；chr = 角色、落叶每帧再乘的一层（全屏一次），烘焙时用 env / chr。
     light = 左上来的光（颜色、强度），clouds = 云影，leaves = 落叶数量倍数，flowers = 战场外小花密度倍数，
     mist = 两侧晨雾，flecks = 树荫下的光斑，fire = 萤火虫，moon = 月光，shroom = 两边加几丛发光蘑菇。
     原则（用户 2026-11-14）：场景动态和亮点不能比宠物、敌人更抢眼；两侧不挡视线的地方可以强，战场中间的一律减弱。 */
  const MOODS = {
    day:  {name:'白天'},
    dawn: {name:'清晨', env:[224,236,255], chr:[246,249,255], light:{c:[225,238,255], a:0.10}, clouds:false, leaves:0.5, mist:true},
    noon: {name:'正午', light:{c:[255,240,190], a:0.17}, leaves:0.8},
    shade:{name:'林荫', env:[200,222,198], chr:[238,246,236], light:{c:[255,245,200], a:0.06}, leaves:1.2, flecks:true},
    bloom:{name:'花田', env:[255,250,236], light:{c:[255,236,200], a:0.14}, leaves:0.6, flowers:3},
    after:{name:'午后', env:[255,236,206], chr:[255,248,234], light:{c:[255,214,140], a:0.18}, leaves:1},
    dusk: {name:'黄昏', env:[255,190,160], chr:[255,226,208], light:{c:[255,150,90], a:0.24}, clouds:false, leaves:0.6},
    A:    {name:'夜 A', env:[118,130,190], chr:[214,220,245], light:null, clouds:false, leaves:0.4},
    C:    {name:'夜 C', env:[96,108,172],  chr:[196,202,238], light:null, clouds:false, leaves:0.3, fire:true, shroom:true},
    B:    {name:'夜 B', env:[78,92,160],   chr:[176,186,228], light:null, clouds:false, leaves:0.3, moon:true, fire:true},
    /* 第 2 章场景 v1：10 关的氛围（_dev/第2章场景/v1/说明.md 有表）。和第 1 章的区别：前半段是秋天白天的几种光，
       中段加「秋风」（树摆得大、落叶多）、「秋雨」（阴天、细雨），最后两关是暮色和 Boss 巴隆的「迪斯科之夜」（两侧彩色舞台光）。
       新字段：wind 风力（树摆幅 / 频率 / 阵风、落叶横飘），rain 细雨，disco 彩色舞台光，shrooms 两边多几丛蘑菇（白天，不发光），bare 混进枯树 */
    c2day:  {name:'晴天', light:{c:[255,236,190], a:0.13}, leaves:1},
    c2mist: {name:'晨雾', env:[228,234,250], chr:[247,249,255], light:{c:[228,238,255], a:0.10}, clouds:false, leaves:0.5, mist:true},
    c2noon: {name:'正午', light:{c:[255,244,200], a:0.18}, leaves:0.8},
    c2shade:{name:'林荫蘑菇', env:[212,222,204], chr:[240,246,236], light:{c:[255,240,190], a:0.07}, leaves:0.9, flecks:true, shrooms:true},
    c2gale: {name:'大风', env:[250,244,236], light:{c:[255,236,200], a:0.12}, leaves:2.4, wind:{a:1.7, f:1.35, g:1.6, drift:3.2}},
    c2after:{name:'午后', env:[255,232,200], chr:[255,247,232], light:{c:[255,206,130], a:0.2}, leaves:1},
    c2dusk: {name:'晚霞', env:[250,180,190], chr:[255,226,224], light:{c:[255,128,150], a:0.2}, clouds:false, leaves:0.7},
    c2rain: {name:'细雨', env:[168,180,204], chr:[224,230,242], light:null, clouds:false, leaves:0.4, rain:true, bare:true},
    c2twi:  {name:'暮色', env:[156,128,186], chr:[222,212,240], light:null, clouds:false, leaves:0.4, fire:true, shroom:true, bare:true},
    c2disco:{name:'迪斯科之夜', env:[66,72,142], chr:[182,188,232], light:null, clouds:false, leaves:0.3, disco:true, shroom:true, bare:true},
  };
  const NOWIND={a:1,f:1,g:1,drift:1}; let WIND=NOWIND;
  const DEF_LIGHT={c:[255,240,190], a:0.12};
  let MOOD_FORCE = (/[?&]scene=(\w+)\b/.exec(location.search)||[])[1] || null;
  const moodKey = () => MOOD_FORCE!==null ? MOOD_FORCE : (DATA.level.scene||'day');
  const mood = () => MOODS[moodKey()] || MOODS.day;
  const tinted = M => !!M.env;
  const bakeMul = N => N.env.map((v,i)=>Math.min(255, Math.round(v/(N.chr||[255,255,255])[i]*255)));
  function moodPaint(g, w, h, N, mask){   // 乘色；mask 有值 = 只乘不透明的部分（道具）
    g.save(); g.setTransform(1,0,0,1,0,0); g.globalCompositeOperation='multiply'; g.fillStyle=rgb(bakeMul(N)); g.fillRect(0,0,w,h);
    if(mask){ g.globalCompositeOperation='destination-in'; g.drawImage(mask,0,0); } g.restore(); }

  /* ---------- 道具：按显示尺寸烘焙一次（高质量缩小）；后排压暗 ---------- */
  function bake(p){
    if(BAKED.has(p)) return BAKED.get(p);
    const S=DPR, pad=2, w=Math.max(1,Math.ceil(p.w*S)), h=Math.max(1,Math.ceil(p.h*S));
    // 分两步缩小，边缘更干净
    let src=p.im; if(src.width>w*2.2){ const t=document.createElement('canvas'); t.width=Math.ceil(w*2); t.height=Math.ceil(h*2); const tg=t.getContext('2d'); tg.imageSmoothingQuality='high'; tg.drawImage(src,0,0,t.width,t.height); src=t; }
    const a=document.createElement('canvas'); a.width=w+pad*2; a.height=h+pad*2; const g=a.getContext('2d'); g.imageSmoothingQuality='high';
    g.save(); if(p.flip){ g.translate(a.width,0); g.scale(-1,1); } { const f=[]; if(p.bri!==1) f.push(`brightness(${p.bri})`); if(/^Town_/.test(p.n)) f.push('saturate(0.8)'); if(f.length) g.filter=f.join(' '); }   /* 第 2 章场景 v2：Town 摆件原图饱和度高，压到 0.8，不抢角色 */ g.drawImage(src,pad,pad,w,h); g.restore(); g.filter='none';
    if(p.tone<0.999){ g.globalCompositeOperation='source-atop'; g.fillStyle=rgb(DEEP.map(v=>v*0.55),(1-p.tone)*1.7); g.fillRect(0,0,a.width,a.height); g.globalCompositeOperation='source-over'; }
    if(T.propMul){ const m=document.createElement('canvas'); m.width=a.width; m.height=a.height; m.getContext('2d').drawImage(a,0,0);
      g.save(); g.globalCompositeOperation='multiply'; g.fillStyle=rgb(T.propMul); g.fillRect(0,0,a.width,a.height); g.globalCompositeOperation='destination-in'; g.drawImage(m,0,0); g.restore(); m.width=0; m.height=0; }   // 第 2 章 v1：秋叶树饱和度高，整体轻压一点，不抢角色
    { const N=mood(); if(N.env){ const m=document.createElement('canvas'); m.width=a.width; m.height=a.height; m.getContext('2d').drawImage(a,0,0); moodPaint(g, a.width, a.height, N, m); m.width=0; m.height=0; } }
    const res={img:a,pad,S}; BAKED.set(p,res); return res;
  }
  function drawProp(ctx,p,t){
    const b=bake(p), dw=b.img.width/b.S, dh=b.img.height/b.S, pd=b.pad/b.S, footY=p.m.foot*p.h;
    // 摇动：根部固定、越高摆越大；两个频率叠加 + 一阵从左往右扫过的风
    const gust=Math.max(0,Math.sin(t*0.45 - p.x/(L.cs*6)))**6;
    const WD=WIND, k=p.sw ? (Math.sin(t*1.3*WD.f+p.ph)*p.sw + Math.sin(t*2.9*WD.f+p.ph*1.7)*p.sw*0.35 + gust*p.sw*1.8*WD.g)*WD.a : 0;   // 第 2 章 v1：秋风那关摆得更大、更快（WIND 由氛围的 wind 决定；其余关 = 1，和原来一样）
    ctx.save(); ctx.translate(p.x,p.y); ctx.transform(1,0,-k,1,0,0);
    ctx.drawImage(b.img,-dw/2,-footY-pd,dw,dh); ctx.restore();
  }

  /* ---------- 环境动态 ---------- */
  const FX_OFF = /[?&]fx=0\b/.test(location.search);   // 诊断开关：关掉云影和暖光，真机对比发热用
  function drawFx(ctx,t,dt,leaf){
    const xmin=0, span=W, cs=L.cs;
    // 云影：大块很淡的暗斑缓慢飘过
    const MD=mood();
    ctx.save(); ctx.globalCompositeOperation='multiply';
    if(!FX_OFF && MD.clouds!==false) for(let i=0;i<3+Math.floor(span/W);i++){ const x=xmin+((t*10+i*230)%(span+500))-250, y=180+(i%3)*240; const r=cs*2.8; const g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,'rgba(110,130,150,.16)'); g.addColorStop(1,'rgba(110,130,150,0)'); ctx.fillStyle=g; ctx.fillRect(x-r,y-r,r*2,r*2); }
    ctx.restore();
    // 落叶：叶子贴图，边落边翻
    const LV=T.leaves ? T.leaves.map(n=>IM2[n]).filter(Boolean) : null, nLeaf=Math.min(PARTS.length, Math.round((T.leafBase||14)*(MD.leaves??1))), bx0=L.ox+Math.min(...DATA.level.lanes)*cs, bx1=L.ox+(Math.max(...DATA.level.lanes)+1)*cs, by0=L.oy, by1=L.oy+COLS*cs;
    for(let li=0; li<nLeaf; li++){ const p=PARTS[li]; p.y+=dt*(14+p.v*10); p.x+=Math.sin(t*1.5+p.a)*dt*14+dt*6*WIND.drift; if(p.y>H+10){p.y=-10;p.x=xmin+Math.random()*span;}
      const sz=cs*(0.11+p.s*0.06);
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(t*1.2+p.a); ctx.scale(Math.cos(t*3+p.a*2),1); ctx.globalAlpha=(p.x>bx0&&p.x<bx1&&p.y>by0&&p.y<by1) ? 0.45 : 0.8;   // 72 版：飘过战场中间时淡一些
      const lf = LV&&LV.length ? LV[li%LV.length] : leaf;   // 第 2 章 v1：秋叶三色 / 粉花瓣（scene2/leaf_*）
      if(lf&&(lf.complete!==false)&&(lf.naturalWidth||lf.width)) ctx.drawImage(lf,-sz/2,-sz/2,sz,sz); ctx.restore(); }
    const LT = MD.light===undefined ? DEF_LIGHT : MD.light; if(!LT) return;   // 夜里没有左上的光
    // 左上来的光（颜色、强度按每关氛围）
    const g=ctx.createLinearGradient(xmin,0,xmin+span*0.7,H); g.addColorStop(0,rgb(LT.c,LT.a)); g.addColorStop(0.55,rgb(LT.c,0)); ctx.fillStyle=g;
    if(FX_OFF) return;
    // 61 版：渐变过了 0.55 就全透明，只填有颜色的那一块（左上到斜线），不再整屏画一遍；画面不变
    { const dx=span*0.7, dy=H, q=0.55*(dx*dx+dy*dy), yL=Math.min(H, q/dy+2), yR=Math.min(H, Math.max(0,(q-dx*span)/dy+2));
      ctx.beginPath(); ctx.moveTo(xmin,0); ctx.lineTo(xmin+span,0); ctx.lineTo(xmin+span,yR); ctx.lineTo(xmin,yL); ctx.closePath(); ctx.fill(); }
  }

  /* ---------- 第 2 章场景 v1：角色乘色之后画的环境效果（render.js drawNight 里调用）：细雨、迪斯科彩光 ----------
     原则同 72 版：两侧可以明显，战场（格子）上方一律减弱。 */
  const RAIN=[]; let DISCO=null; const SPR={};
  // 每帧只贴图（Pixi 合批），不每帧画路径：路径在 pixi-ctx 里要先光栅化成贴图，位置一变就得重画（发热）
  function spr(k, w, h, paint){ if(SPR[k]) return SPR[k]; const c=document.createElement('canvas'); c.width=w; c.height=h; paint(c.getContext('2d'), w, h);
    c.complete=true; c.naturalWidth=w; c.naturalHeight=h; return SPR[k]=c; }
  const dropImg = () => spr('drop', 8, 96, (g,w,h)=>{ const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'rgba(236,244,255,0)'); gr.addColorStop(1,'rgba(236,244,255,1)');
    g.fillStyle=gr; g.beginPath(); g.moveTo(w*0.5,0); g.lineTo(w*0.85,h-w*0.4); g.arc(w*0.5,h-w*0.4,w*0.35,0,Math.PI); g.lineTo(w*0.15,h-w*0.4); g.closePath(); g.fill(); });
  const ringImg = () => spr('ring', 96, 40, (g,w,h)=>{ g.strokeStyle='rgba(236,244,255,1)'; g.lineWidth=4; g.beginPath(); g.ellipse(w/2,h/2,w/2-3,h/2-3,0,0,7); g.stroke(); });
  const beamImg = c => spr('beam'+c, 128, 512, (g,w,h)=>{   // 舞台光束：顶上窄、往下变宽变淡
    const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,c.replace('A','0.9')); gr.addColorStop(0.55,c.replace('A','0.35')); gr.addColorStop(1,c.replace('A','0'));
    g.fillStyle=gr; g.beginPath(); g.moveTo(w*0.44,0); g.lineTo(w*0.56,0); g.lineTo(w,h); g.lineTo(0,h); g.closePath(); g.fill();
    g.globalCompositeOperation='destination-in'; const sg=g.createLinearGradient(0,0,w,0); sg.addColorStop(0,'rgba(0,0,0,0)'); sg.addColorStop(0.5,'rgba(0,0,0,1)'); sg.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=sg; g.fillRect(0,0,w,h); });
  function drawLate(ctx,t,dt){
    const MD=mood(), cs=L.cs, ln=DATA.level.lanes, bx0=L.ox+Math.min(...ln)*cs, bx1=L.ox+(Math.max(...ln)+1)*cs, by0=L.oy, by1=L.oy+COLS*cs;
    const inB=(x,y)=>x>bx0&&x<bx1&&y>by0&&y<by1;
    if(MD.rain){   // 细雨：斜着落的雨丝，落地一圈小水花；格子上方更淡
      const di=dropImg(), ri=ringImg();
      if(!RAIN.length) for(let i=0;i<130;i++) RAIN.push({x:Math.random()*(W+cs*2), y:Math.random()*H, v:0.85+Math.random()*0.3, l:0.32+Math.random()*0.18, end:Math.random()*H*1.1, sp:-1});
      ctx.save();
      for(const r of RAIN){
        if(r.sp<0){ r.y+=dt*cs*8*r.v; r.x-=dt*cs*1.7*r.v; if(r.y>r.end){ r.sp=0; r.sx=r.x; r.sy=r.y; }
          const len=cs*r.l, wd=Math.max(1.5,cs*0.034);
          ctx.globalAlpha=inB(r.x,r.y)?0.3:0.55; ctx.save(); ctx.translate(r.x,r.y); ctx.rotate(0.21); ctx.drawImage(di,-wd/2,-len,wd,len); ctx.restore(); }
        else { r.sp+=dt*2.4; const k=Math.min(1,r.sp), w=cs*0.26*(0.35+k);
          ctx.globalAlpha=(1-k)*(inB(r.sx,r.sy)?0.24:0.45); ctx.drawImage(ri, r.sx-w/2, r.sy-w*0.21, w, w*0.42);
          if(r.sp>=1){ r.sp=-1; r.x=Math.random()*(W+cs*2); r.y=-Math.random()*cs*2; r.end=Math.random()*H*1.1; } } }
      ctx.restore(); }
    if(MD.disco){   // Boss 巴隆的迪斯科之夜：从棋盘上方的树林里打下几束彩色舞台光，慢慢左右扫，跟着节拍轻轻一亮；树林、两边、家门口有彩色光斑
      const glow=(typeof img==='function')?img('gui/Glow_Circle01.png'):null;
      if(!DISCO){ const C=['rgba(255,95,180,A)','rgba(95,214,255,A)','rgba(255,216,74,A)','rgba(155,123,255,A)']; DISCO=C.map((c,i)=>({c, hex:['#ff5fb4','#5fd6ff','#ffd84a','#9b7bff'][i], ph:i*1.7, sp:0.32+i*0.06, x:(i+0.5)/C.length})); }
      const beat=Math.pow(Math.max(0,Math.sin(t*Math.PI*2*1.05)),6);   // 约 126 拍 / 分
      ctx.save(); ctx.globalCompositeOperation='lighter';
      for(const d of DISCO){ const bi=beamImg(d.c), x=W*(0.08+0.84*d.x), y=by0-cs*1.1, ang=Math.sin(t*d.sp+d.ph)*0.42, len=(COLS+1.4)*cs, wd=cs*2.6;
        ctx.globalAlpha=0.13+beat*0.05; ctx.save(); ctx.translate(x,y); ctx.rotate(ang); ctx.drawImage(bi,-wd/2,0,wd,len); ctx.restore();
        if(glow && (glow.naturalWidth||glow.width)){ const gi=tinted('gui/Glow_Circle01.png',d.hex); if(gi){
          const s=cs*1.9; ctx.globalAlpha=0.5+beat*0.25; ctx.drawImage(gi, x-s/2, y-s*0.3, s, s*0.6);   // 光源：树林里
          const fx=d.x<0.5? bx0*0.5+Math.sin(t*0.6+d.ph)*cs*0.3 : (bx1+W)*0.5+Math.sin(t*0.6+d.ph)*cs*0.3, fy=by0+(0.2+0.6*((d.x*7+t*0.05)%1))*(by1-by0), s2=cs*1.4;
          ctx.globalAlpha=0.32+beat*0.15; ctx.drawImage(gi, fx-s2/2, fy-s2*0.35, s2, s2*0.7); } } }   // 两边树丛里的彩色光斑
      ctx.restore(); }
  }

  return {
    load, THEMES:Object.keys(THEMES), get theme(){ return themeKey(); }, setTheme(k){ THEME_FORCE=k||null; }, setCh2Theme(k){ if(THEMES[k]) CH2_THEME=k; }, themeName(){ return THEMES[themeKey()].name; },
    MOODS, mood, moodKey, setMood(k){ MOOD_FORCE=k; }, lateReady:()=>LATE_DONE,
    ensure(cells){ const tk=themeKey(), key=[W,H,DPR,L.cs,DATA.level.id,DATA.level.lanes.join(''),moodKey(),tk].join('|'); if(key!==KEY){ KEY=key; T=THEMES[tk]; SET=SET_FOREST; GROUND=T.GROUND; DEEP=T.DEEP; WIND=mood().wind||NOWIND; if(tk!=='forest') loadLate(); if(STATIC){ STATIC.width=0; STATIC.height=0; } for(const b of BAKED.values()){ b.img.width=0; b.img.height=0; } layout(); } if(!STATIC) buildStatic(cells); },
    drawLate,
    drawGround(ctx){ ctx.drawImage(STATIC,0,0,W,H); },
    props(){ return PROPS; }, drawProp, drawFx,
  };
})();
