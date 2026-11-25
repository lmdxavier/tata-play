'use strict';
/* =====================================================================
   塔塔 · 关卡数据（65 版；逐关设计见 docs/关卡设计.md）
   每关：title 名字；lanes 开放的路（0..4，没开放的路用植物盖住）；startEnergy / skyDrop 能量；cells 特殊格和道具；
        duration 时长（进度条用）；marks 每一波开始的时间；spawns [秒, 怪, 路]；events 预告和大波提示；
        reward 首次通关给的那一样东西：{shard:[宠物, 数量]} 或 {unlock:'swap' | 'swap3'}；
        tut 教学步骤（只在第一次打这关时出现，game.js「教学」）。
   现在只给能打通的粗数值，不做平衡模拟（关卡设计.md 规则）。
   ===================================================================== */
(function(){
  const seq = (type, list) => list.map(([t,lane])=>[t,type,lane]);
  const L = {};

  // 1-1 森林入口：1 路。教放置、收能量、放聚能花；之后绿莱姆一只一只来
  L['1-1'] = { scene:'day', title:'森林入口', lanes:[2], startEnergy:100, skyDrop:{every:10, value:25, firstAt:12}, duration:58, marks:[3,36],
    spawns: seq('slime', [[3,2],[16,2],[27,2],[36,2],[43,2],[48,2]]),
    reward:{shard:['pug',10]},
    // 66 版（用户 2026-11-14：只有拖到哪的指示、没有说明 → 加浮窗说原因）：第一次进来先放一段带浮窗的演示，演示完重新开始，玩家自己打一局（只有拖动提示）
    demo:[ {kind:'orb', value:50, tip:'能量每隔一段时间会出现。点一下收取。'},
           {kind:'card', key:'flower', tip:'点一下卡片，看它的效果和需要的能量。'},
           {kind:'place', key:'flower', lane:2, col:0, tip:'花 50 能量，把聚能花拖到草地上。它会产出更多能量。'},
           {kind:'run', run:'spawn', type:'slime', lane:2, p:8.2, hp:40},   // 67 版：这只只有 60 血、离得近，两发打死，不让玩家干等
           {kind:'place', key:'goldfish', lane:2, col:1, tip:'能量够了。把远程攻击的泡泡鱼拖上去，打前面的敌人。'},
           {kind:'info', range:'goldfish', tip:'前方亮起的一片是它的攻击范围。'},
           {kind:'wait', until:'noEnemy'}, {kind:'wait', secs:0.3},
           {kind:'run', run:'bellSetup'},
           {kind:'wait', until:'petDead', key:'flower'},
           {kind:'info', bell:2, tip:'每一路最后有一口警钟。它能挡下一次进攻，并消灭这一路的敌人。'},
           {kind:'wait', until:'bell'}, {kind:'wait', secs:1.0},
           {kind:'info', tip:'接下来自己打一局。'},
           {kind:'run', run:'restart'} ],
    tut:[ {kind:'place', key:'goldfish', lane:2, col:1},
          {kind:'place', key:'flower', lane:2, col:0} ] };

  // 1-2 史莱姆小径：1 路。多了火牙犬；绿莱姆两只连着来
  L['1-2'] = { scene:'dawn', title:'史莱姆小径', lanes:[2], startEnergy:150, skyDrop:{every:10, value:25, firstAt:8}, duration:74, marks:[5,28,52],
    spawns: seq('slime', [[5,2],[15,2],[16.6,2],[28,2],[29.6,2],[40,2],[41.6,2],[52,2],[53.6,2],[58,2],[62,2],[63.6,2]]),
    reward:{shard:['pumpkin',10]},
    tut:[ {at:8, kind:'place', key:'pug', lane:2, col:'front', min:3, tip:'火牙犬只咬面前 1 格，但生命和攻击更高，适合放在前排。'} ] };

  // 1-3 三岔路口：3 路。多了硬壳南瓜；赤甲虫出场
  L['1-3'] = { scene:'noon', title:'三岔路口', lanes:[1,2,3], startEnergy:175, skyDrop:{every:10, value:25, firstAt:6}, duration:112, marks:[8,48,88],
    spawns: [ ...seq('slime', [[8,2],[17,1],[26,3],[34,2],[52,1],[64,2],[74,3],[88,1],[90,3],[100,1],[100.8,3]]),
              ...seq('beetle', [[48,2],[60,3],[72,1],[89,2],[96,2],[104,2]]) ],
    reward:{unlock:'swap'},
    tut:[ {at:11, kind:'place', key:'pumpkin', lane:2, col:'front', min:4, tip:'硬壳南瓜生命 2000，不攻击。放在最前面挡住敌人，后排继续输出。'} ] };

  // 1-4 甲虫林：3 路。换位、预告主攻路、水克火；棘背蜥出场
  L['1-4'] = { scene:'shade', title:'甲虫林', lanes:[1,2,3], startEnergy:175, skyDrop:{every:10, value:25, firstAt:6}, duration:126, marks:[8,56,86],
    spawns: [ ...seq('slime', [[8,2],[15,3],[31,1],[38,3],[63,2],[71,3],[87,2],[97,1],[109,2]]),
              ...seq('hornliz', [[23,2],[84,3],[101,1],[117,2]]),
              ...seq('beetle', [[56,1],[60,1],[66,1],[73,1],[93,2],[105,3],[113,2]]) ],
    events:[ {t:42, kind:'preview', lanes:[1], until:60, text:'预告：赤甲虫走最左一路'} ],
    reward:{shard:['bomb',15]},
    tut:[ {at:43, kind:'move', key:'goldfish', toLane:1, tip:'红色标记的一路要来赤甲虫。水克火，伤害 +50%：把泡泡鱼拖过去。'} ] };

  // 1-5 花田保卫战：5 路。多了波姆；能量桶；尖角虫成群
  L['1-5'] = { scene:'bloom', title:'花田保卫战', lanes:[0,1,2,3,4], startEnergy:200, skyDrop:{every:10, value:25, firstAt:5}, duration:200, marks:[16,70,112,172],
    cells:[ {lane:1,col:2,type:'flower'}, {lane:3,col:2,type:'flower'}, {lane:4,col:6,type:'crate',kind:'barrel'} ],
    spawns: [ ...seq('slime', [[16,2],[23,1],[30,3],[37,2],[44,0],[51,4],[71.5,4],[80.5,0],[89,0],[98.5,4],[126,1],[134,3],[142,0],[150,4],[174,2],[178,0],[182,4],[188,1],[192,3]]),
              ...seq('beetle', [[70,0],[79,4],[90.5,4],[97,0],[128,3],[138,1],[146,2],[154,2],[176,1],[180,3],[186,2],[194,2]]),
              ...seq('hornliz', [[92,2],[132,2],[152,0],[175,3],[184,1],[190,2]]),
              ...seq('hornbug', [[112,2],[112.4,1],[112.8,3],[113.4,2],[114.2,2], [173,0],[173.4,1],[173.8,0],[174.4,1],[175,0], [181,4],[181.4,3],[181.8,4],[182.4,3],[183,4]]) ],
    events:[ {t:58, kind:'preview', lanes:[0,4], until:84, text:'预告：下一波走最左、最右两路'},
             {t:165, kind:'banner', text:'一大波敌人正在接近', until:171} ],
    reward:{unlock:'swap3'},
    tut:[ {at:112, when:'hornbug', whenP:9.2, kind:'place', key:'bomb', lane:2, col:5, ahead:'hornbug', tip:'尖角虫成群来。把波姆放在它们前面：3 秒后就绪，炸周围 3×3 格，600 伤害。'} ] };

  // 1-6 林中空地：5 路。敌方喷火蜥（隔 1 格停下喷 2 格，火牙犬够不着）；宝石桶
  L['1-6'] = { scene:'after', title:'林中空地', lanes:[0,1,2,3,4], startEnergy:200, skyDrop:{every:10, value:25, firstAt:5}, duration:200, marks:[12,70,104,160],
    cells:[ {lane:2,col:2,type:'flower'}, {lane:3,col:6,type:'crate',kind:'box'}, {lane:0,col:5,type:'crate',kind:'barrel'} ], boxShard:'lizard',
    spawns: [ ...seq('slime', [[12,2],[20,1],[28,3],[40,0],[48,4],[75,1],[83,3],[110,2],[118,0],[126,4],[160,1],[164,3],[172,2],[178,0],[182,4]]),
              ...seq('lizard', [[34,2],[70,0],[78,4],[104,1],[112,3],[150,2],[166,0],[170,4]]),
              ...seq('beetle', [[60,2],[90,2],[98,1],[120,3],[140,1],[146,3],[162,2],[176,1],[180,3]]),
              ...seq('hornliz', [[130,2],[168,2],[186,2]]) ],
    events:[ {t:58, kind:'preview', lanes:[0,4], until:82, text:'预告：喷火蜥走最左、最右两路'},
             {t:153, kind:'banner', text:'一大波敌人正在接近', until:159} ],
    reward:{shard:['lizard',15]} };

  // 1-7 山坡小路：5 路。迅火狐（移动 0.5 格 / 秒，生命 170，走防守少的路）；通关给泡泡鱼升 2 星的碎片
  L['1-7'] = { cond:{name:'黄昏', prod:0.8}, scene:'dusk', title:'山坡小路', lanes:[0,1,2,3,4], startEnergy:250, skyDrop:{every:10, value:25, firstAt:5}, duration:205, marks:[10,50,110,160],
    cells:[ {lane:1,col:2,type:'flower'}, {lane:3,col:2,type:'flower'}, {lane:2,col:6,type:'crate',kind:'barrel'} ],
    spawns: [ ...seq('slime', [[10,2],[18,1],[26,3],[34,0],[42,4],[90,2],[98,1],[106,3],[140,0],[148,4],[176,2],[180,1],[184,3]]),
              ...seq('fox', [[50,1],[52,3],[76,0],[77.5,4],[80,0],[110,2],[112,2],[130,1],[131,3],[133,1],[160,0],[161,4],[168,2],[170,1],[171,3],[186,0],[188,4]]),
              ...seq('beetle', [[60,2],[95,0],[102,4],[125,2],[150,2],[165,1],[174,3],[182,2]]),
              ...seq('lizard', [[70,2],[118,1],[122,3],[156,2],[178,0],[183,4]]),
              ...seq('hornliz', [[136,2],[172,2]]) ],
    events:[ {t:42, kind:'preview', lanes:[1,3], until:58, text:'预告：迅火狐走第 2、第 4 路'},
             {t:68, kind:'preview', lanes:[0,4], until:84, text:'预告：迅火狐走最左、最右两路'},
             {t:153, kind:'banner', text:'一大波敌人正在接近', until:159} ],
    reward:{shard:['goldfish',10]} };

  // 1-8 林间夜路：5 路，夜里（不掉天降能量）。厚壳蜗（慢、血厚，后面跟着怪）；翠颈蛇（咬中的宠物中毒）。通关给厚壳蜗碎片（满）
  L['1-8'] = { cond:{name:'夜晚'}, scene:'A', title:'林间夜路', lanes:[0,1,2,3,4], startEnergy:325, skyDrop:null, duration:220, marks:[10,60,120,170],
    cells:[ {lane:1,col:2,type:'flower'}, {lane:3,col:2,type:'flower'}, {lane:2,col:6,type:'crate',kind:'barrel'} ],
    spawns: [ ...seq('slime', [[10,2],[17,1],[24,3],[31,0],[38,4],[64,2],[66,2],[90,0],[92,0],[96,4],[98,4],[124,1],[126,1],[130,3],[132,3],[172,0],[176,4],[182,2],[188,1],[194,3]]),
              ...seq('snail', [[60,2],[86,0],[94,4],[120,1],[128,3],[170,2],[180,0],[186,4]]),
              ...seq('snake', [[45,1],[52,3],[76,2],[104,0],[108,4],[140,2],[146,1],[150,3],[175,1],[184,3],[192,2]]),
              ...seq('beetle', [[70,1],[80,3],[112,2],[156,0],[160,4],[190,0]]),
              ...seq('fox', [[100,1],[101.5,3],[164,2],[166,2]]) ],
    events:[ {t:80, kind:'preview', lanes:[0,4], until:100, text:'预告：厚壳蜗走最左、最右两路'},
             {t:163, kind:'banner', text:'一大波敌人正在接近', until:169} ],
    reward:{shard:['snail',10]} };

  // 1-9 深林山谷：5 路，夜里（不掉天降能量）。宠物 7 只，开战前选 6 只上阵；长信翁（飞越遇到的第一只宠物）。通关给火牙犬碎片（升 2 星）
  L['1-9'] = { cond:{name:'夜晚'}, scene:'C', title:'深林山谷', lanes:[0,1,2,3,4], startEnergy:325, skyDrop:null, duration:230, marks:[10,60,120,175],
    cells:[ {lane:1,col:2,type:'flower'}, {lane:3,col:2,type:'flower'}, {lane:0,col:6,type:'crate',kind:'barrel'}, {lane:4,col:6,type:'crate',kind:'barrel'} ],
    spawns: [ ...seq('slime', [[10,2],[16,1],[22,3],[28,0],[34,4],[66,1],[68,3],[96,2],[124,0],[126,4],[178,1],[182,3],[188,2],[196,0],[200,4]]),
              ...seq('gull', [[44,2],[62,0],[70,4],[100,1],[104,3],[136,2],[150,0],[154,4],[176,2],[186,1],[192,3]]),
              ...seq('snail', [[56,2],[90,1],[94,3],[140,0],[146,4],[180,0],[184,4]]),
              ...seq('snake', [[50,1],[80,0],[84,4],[112,2],[130,1],[134,3],[190,2],[198,1]]),
              ...seq('hornliz', [[116,0],[120,4],[194,3]]),
              ...seq('fox', [[160,1],[161,3],[202,2]]) ],
    events:[ {t:38, kind:'preview', lanes:[2], until:52, text:'预告：长信翁走中路'},
             {t:168, kind:'banner', text:'一大波敌人正在接近', until:174} ],
    reward:{shard:['pug',10]} };

  // 1-10 森林之王：5 路。Boss 格鲁姆（重击带上下两路、换路、吼叫召绿莱姆、半血狂暴）。通关给章节宝箱（金币 500、星星 10）
  L['1-10'] = { cond:{name:'夜晚'}, scene:'B', title:'森林之王', lanes:[0,1,2,3,4], startEnergy:350, skyDrop:null, duration:290, marks:[10,60,140,200],   // 夜里不掉天降能量
    cells:[ {lane:1,col:2,type:'flower'}, {lane:3,col:2,type:'flower'}, {lane:0,col:6,type:'crate',kind:'barrel'}, {lane:4,col:6,type:'crate',kind:'barrel'} ],
    spawns: [ ...seq('slime', [[10,2],[16,1],[22,3],[28,0],[34,4],[40,2],[46,1],[52,3],[150,0],[158,4],[172,1],[180,3],[205,0],[210,4],[222,1],[230,3]]),
              ...seq('beetle', [[44,0],[50,4],[66,2],[90,1],[96,3],[165,0],[190,4],[215,2],[226,0]]),
              ...seq('fox', [[60,1],[61.5,3],[84,0],[85.5,4],[110,2],[112,1],[113,3],[200,1],[201,3]]),
              ...seq('lizard', [[72,2],[100,0],[104,4],[124,1],[128,3],[185,2],[218,4]]),
              ...seq('hornliz', [[78,2],[118,2],[195,0]]),
              ...seq('hornbug', [[130,0],[130.4,1],[130.8,0],[131.4,1],[132,0], [236,3],[236.4,4],[236.8,3],[237.4,4],[238,3]]),
              [140,'bear',2] ],
    events:[ {t:52, kind:'preview', lanes:[1,3], until:66, text:'预告：迅火狐走第 2、第 4 路'},
             {t:134, kind:'banner', text:'格鲁姆从中路过来', until:140} ],
    reward:{chest:{coin:500, star:10}} };   // 73 版：1-8、1-9 做完，一起开放

  // 80 版（用户 2026-11-15「一大波数量太少、横幅太长、等半天看不到」）：横幅只留 2 秒，横幅一消失怪就开始涌进来；
  // 最后一波原有的怪整体提前到横幅结束、间隔压到 0.7 倍；另加原数量 0.8 倍的小怪（有绿莱姆用绿莱姆，没有用本关最常见的怪），每 0.45 秒一只、各路轮流。合计约 1.8 倍。
  for(const lv of Object.values(L)){ const ev=(lv.events||[]).find(e=>e.kind==='banner'); if(!ev || !lv.spawns) continue;
    const t0=ev.t, go=t0+2; ev.until=go;
    const fin=lv.spawns.filter(s=>s[0]>=t0); if(!fin.length) continue;
    const f0=Math.min(...fin.map(s=>s[0])), cnt={};
    for(const s of lv.spawns) cnt[s[1]]=(cnt[s[1]]||0)+1;
    const weak = cnt.slime ? 'slime' : Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0], lanes=lv.lanes, ord=[2,0,4,1,3].filter(l=>lanes.includes(l)), n=Math.round(fin.length*0.8);
    const rest=lv.spawns.filter(s=>s[0]<t0), moved=fin.map(([t,ty,ln])=>[go+(t-f0)*0.7, ty, ln]), extra=[];
    for(let i=0;i<n;i++) extra.push([go+0.2+i*0.45, weak, ord[i%ord.length]]);
    lv.spawns=[...rest, ...moved, ...extra].sort((a,b)=>a[0]-b[0]);
    const last=lv.spawns[lv.spawns.length-1][0]; if(lv.duration<last+6) lv.duration=Math.ceil(last+6);
    if(lv.marks && lv.marks.length && lv.marks[lv.marks.length-1]>=t0) lv.marks[lv.marks.length-1]=go; }   // 进度条「第 4/4 波」在横幅结束时就跳


  window.LEVELS = L;
  window.UNLOCK_CN = { swap:{name:'战斗中换位', desc:'拖动场上的宠物换格子。有 2 次，用掉后每 20 秒恢复 1 次'}, swap3:{name:'换位次数 +1', desc:'换位次数上限从 2 次变成 3 次'} };
})();

// =====================================================================
// 第2章角色 v1（_dev，未合并）：测试关 + 第 2 章 10 关草案（出怪表见 _dev/第2章角色/v1/说明.md）
// 场景先用第 1 章现有的（第 2 章场景另一条线在做）；数值只保证能玩，没做平衡
// =====================================================================
(function(){
  const L = window.LEVELS, seq = (type, list) => list.map(([t,lane])=>[t,type,lane]);
  const ALL=[0,1,2,3,4], CELLS=[ {lane:1,col:2,type:'flower'}, {lane:3,col:2,type:'flower'} ];
  // 按时间段均匀撒怪：from~to 秒内放 n 只，路按 lanes 轮流
  const spread = (type, from, to, n, lanes) => Array.from({length:n}, (_,i)=>[+(from+(to-from)*(n<=1?0:i/(n-1))).toFixed(1), type, lanes[i%lanes.length]]);
  const FAR = [[99999,'slime',2]];   // 测试关：一只永远不出来的怪，防止开局就判胜
  L['2-T'] = { scene:'day', title:'第 2 章角色测试', lanes:ALL, startEnergy:3000, skyDrop:{every:6, value:25, firstAt:3}, duration:600, marks:[], cells:CELLS, spawns:FAR };
  L['2-D'] = { scene:'day', title:'机制演示', lanes:ALL, startEnergy:99999, skyDrop:null, duration:600, marks:[], cells:[], spawns:FAR };

  L['2-1'] = { scene:'c2day', title:'花谷入口', lanes:ALL, startEnergy:150, skyDrop:{every:12, value:25, firstAt:6}, duration:200, marks:[8,60,120,160], cells:CELLS,
    spawns:[ ...spread('slime',8,170,18,[2,1,3,0,4]), ...spread('goat',40,175,8,[1,3,2,0,4]), ...spread('beetle',70,165,6,[0,4,2]) ],
    events:[ {t:150, kind:'banner', text:'一大波敌人正在接近', until:156} ], reward:{shard:['fox',15]} };
  L['2-2'] = { scene:'c2mist', title:'晨雾花坡', lanes:ALL, startEnergy:150, skyDrop:{every:11, value:25, firstAt:6}, duration:210, marks:[8,60,120,170], cells:CELLS,
    spawns:[ ...spread('slime',8,180,16,[2,1,3,0,4]), ...spread('goat',30,170,7,[3,1,4,0,2]), ...spread('cat',45,185,7,[2,0,4,1,3]), ...spread('beetle',90,175,5,[1,3]) ],
    events:[ {t:160, kind:'banner', text:'一大波敌人正在接近', until:166} ], reward:{shard:['flower',10]} };
  L['2-3'] = { scene:'c2noon', title:'铃声花径', lanes:ALL, startEnergy:175, skyDrop:{every:11, value:25, firstAt:6}, duration:220, marks:[8,60,120,180], cells:CELLS,
    spawns:[ ...spread('slime',8,195,18,[2,1,3,0,4]), ...spread('goat',40,190,6,[1,3,2]), ...spread('cat',60,190,4,[0,4]), ...spread('bellsnake',50,195,7,[2,1,3,0,4]), ...spread('hornbug',140,141.6,5,[2,2,1,3,2]) ],
    events:[ {t:170, kind:'banner', text:'一大波敌人正在接近', until:176} ], reward:{shard:['lizard',15]} };
  L['2-4'] = { scene:'c2shade', title:'蘑菇花荫', lanes:ALL, startEnergy:250, skyDrop:{every:11, value:25, firstAt:6}, duration:230, marks:[8,60,130,190], cells:CELLS,
    spawns:[ ...spread('slime',8,205,18,[2,1,3,0,4]), ...spread('mushgoat',50,200,6,[2,1,3]), ...spread('goat',30,200,7,[0,4,2,1,3]), ...spread('bellsnake',90,205,4,[1,3]), ...spread('cat',70,180,3,[2,0,4]) ],
    events:[ {t:180, kind:'banner', text:'一大波敌人正在接近', until:186} ], reward:{shard:['mushgoat',15]} };
  L['2-5'] = { scene:'c2gale', title:'落樱风岭', lanes:ALL, startEnergy:200, skyDrop:{every:11, value:25, firstAt:6}, duration:240, marks:[8,60,130,200], cells:CELLS,
    spawns:[ ...spread('slime',8,215,16,[2,1,3,0,4]), ...spread('redbird',35,220,10,[1,3,0,4,2]), ...spread('cat',60,210,4,[2,1,3]), ...spread('mushgoat',90,215,4,[2,0,4]), ...spread('beetle',50,200,6,[0,4,1,3]), ...spread('gull',150,215,3,[1,3,2]) ],
    events:[ {t:30, kind:'preview', lanes:[1,3], until:45, text:'预告：掠空鸟走第 2、第 4 路'}, {t:190, kind:'banner', text:'一大波敌人正在接近', until:196} ], reward:{shard:['goldfish',15]} };
  L['2-6'] = { scene:'c2after', title:'花溪石滩', lanes:ALL, startEnergy:250, skyDrop:{every:12, value:25, firstAt:6}, duration:240, marks:[8,60,130,200], cells:CELLS,
    spawns:[ ...spread('slime',8,215,16,[2,1,3,0,4]), ...spread('shellliz',40,220,9,[2,1,3,0,4]), ...spread('redbird',60,215,6,[0,4,2]), ...spread('goat',30,210,6,[1,3]), ...spread('bellsnake',100,220,4,[2,0,4]) ],
    events:[ {t:190, kind:'banner', text:'一大波敌人正在接近', until:196} ], reward:{shard:['pumpkin',10]} };
  L['2-7'] = { cond:{name:'晚霞', prod:0.8}, scene:'c2dusk', title:'晚霞花道', lanes:ALL, startEnergy:300, skyDrop:{every:11, value:25, firstAt:6}, duration:250, marks:[8,70,140,205], cells:CELLS,
    spawns:[ ...spread('slime',8,225,16,[2,1,3,0,4]), ...spread('shellliz',40,220,6,[1,3,2]), ...spread('mushgoat',60,215,4,[0,4]), ...spread('cat',50,200,4,[2,1,3]), ...spread('goat',30,225,6,[0,4,2]), [120,'wildox',2], [205,'wildox',1], [210,'wildox',3] ],
    events:[ {t:110, kind:'preview', lanes:[2], until:122, text:'预告：蛮角牛走中路'}, {t:198, kind:'banner', text:'一大波敌人正在接近', until:204} ], reward:{shard:['bear',25]} };
  L['2-8'] = { cond:{name:'细雨'}, scene:'c2rain', title:'花雨小径', lanes:ALL, startEnergy:325, skyDrop:null, duration:260, marks:[8,70,140,210], cells:CELLS,
    spawns:[ ...spread('slime',8,235,16,[2,1,3,0,4]), ...spread('toucan',45,230,8,[1,3,2,0,4]), ...spread('redbird',70,225,5,[0,4,2]), ...spread('goat',30,230,6,[1,3]), ...spread('shellliz',90,230,4,[2,0,4]), ...spread('cat',60,200,3,[1,3,2]) ],
    events:[ {t:40, kind:'preview', lanes:[1], until:52, text:'预告：巨喙鸟走第 2 路'}, {t:205, kind:'banner', text:'一大波敌人正在接近', until:211} ], reward:{shard:['fox',15]} };
  L['2-9'] = { cond:{name:'暮色', prod:0.8}, scene:'c2twi', title:'暮色花谷', lanes:ALL, startEnergy:325, skyDrop:null, duration:270, marks:[8,70,150,215], cells:CELLS,
    spawns:[ ...spread('slime',8,245,16,[2,1,3,0,4]), ...spread('mushsnake',40,240,9,[2,1,3,0,4]), ...spread('bellsnake',60,240,5,[1,3,2]), ...spread('mushgoat',80,240,4,[0,4]), ...spread('goat',30,240,6,[2,1,3]), ...spread('toucan',110,230,4,[0,4]), [150,'wildox',2], [225,'wildox',0], [228,'wildox',4] ],
    events:[ {t:215, kind:'banner', text:'一大波敌人正在接近', until:221} ], reward:{shard:['bomb',15]} };
  L['2-10'] = { cond:{name:'夜晚'}, scene:'c2disco', title:'巴隆的舞会', lanes:ALL, startEnergy:375, skyDrop:null, duration:300, marks:[10,70,140,200], cells:CELLS,
    spawns:[ ...spread('slime',10,260,18,[2,1,3,0,4]), ...spread('cat',40,200,4,[1,3]), ...spread('bellsnake',60,250,5,[0,4,2]), ...spread('redbird',80,240,5,[1,3,2]), ...spread('shellliz',100,250,4,[0,4]), ...spread('goat',30,120,5,[2,1,3]), [140,'disco',2] ],
    events:[ {t:134, kind:'banner', text:'巴隆从中路过来', until:140} ], reward:{chest:{coin:800, star:15}} };
})();

// =====================================================================
// 93 版：第 3 章「阳光海滩」10 关（出怪表来自 _dev/第3章角色/v1；场景氛围和关卡名来自 _dev/第3章场景/v1；数值见 docs/关卡设计.md「93 版」）
// =====================================================================
(function(){
  const L = window.LEVELS;
  const ALL=[0,1,2,3,4], CELLS=[ {lane:1,col:2,type:'flower'}, {lane:3,col:2,type:'flower'} ];
  const spread = (type, from, to, n, lanes) => Array.from({length:n}, (_,i)=>[+(from+(to-from)*(n<=1?0:i/(n-1))).toFixed(1), type, lanes[i%lanes.length]]);
  const FAR = [[99999,'slime',2]];
  const BIG = t => ({t, kind:'banner', text:'一大波敌人正在接近', until:t+6});
  L['3-T'] = { scene:'day', title:'第 3 章角色测试', lanes:ALL, startEnergy:3000, skyDrop:{every:6, value:25, firstAt:3}, duration:600, marks:[], cells:CELLS, spawns:FAR };
  L['3-D'] = { scene:'day', title:'机制演示', lanes:ALL, startEnergy:99999, skyDrop:null, duration:600, marks:[], cells:[], spawns:FAR };

  L['3-1'] = { scene:'c3sun', title:'椰林海滩', lanes:ALL, startEnergy:200, skyDrop:{every:12, value:25, firstAt:6}, duration:200, marks:[8,60,120,160], cells:CELLS,
    spawns:[ ...spread('slime',8,170,14,[2,1,3,0,4]), ...spread('crab',35,180,10,[2,1,3,0,4]), ...spread('beetle',70,165,5,[0,4,2]), ...spread('goat',90,175,4,[1,3]) ],
    events:[ BIG(152) ], reward:{shard:['crab',15]} };
  L['3-2'] = { scene:'c3fog', title:'起雾的海湾', lanes:ALL, startEnergy:200, skyDrop:{every:12, value:25, firstAt:6}, duration:210, marks:[8,60,120,170], cells:CELLS,
    spawns:[ ...spread('slime',8,180,14,[2,1,3,0,4]), ...spread('crab',30,180,6,[1,3,2]), ...spread('puffer',45,190,8,[2,0,4,1,3]), ...spread('cat',60,170,3,[1,3]), ...spread('beetle',90,180,4,[0,4]) ],
    events:[ BIG(162) ], reward:{shard:['pumpkin',15]} };
  L['3-3'] = { scene:'c3ebb', title:'退潮礁石滩', lanes:ALL, startEnergy:200, skyDrop:{every:12, value:25, firstAt:6}, duration:220, marks:[8,60,120,180], cells:CELLS,
    spawns:[ ...spread('slime',8,195,14,[2,1,3,0,4]), ...spread('inkocto',40,200,7,[2,1,3,0,4]), ...spread('crab',30,190,6,[0,4,2]), ...spread('puffer',80,195,4,[1,3]), ...spread('shellliz',100,200,4,[2,0,4]) ],
    events:[ {t:34, kind:'preview', lanes:[2], until:46, text:'预告：喷墨章鱼走中路'}, BIG(172) ], reward:{shard:['lizard',20]} };
  L['3-4'] = { scene:'c3glare', title:'正午沙滩', lanes:ALL, startEnergy:175, skyDrop:{every:13, value:25, firstAt:6}, duration:230, marks:[8,60,130,190], cells:CELLS,
    spawns:[ ...spread('slime',8,205,14,[2,1,3,0,4]), ...spread('jelly',40,210,8,[2,1,3,0,4]), ...spread('inkocto',70,200,4,[1,3]), ...spread('crab',30,205,5,[0,4,2]), ...spread('bellsnake',100,205,3,[2,0,4]) ],
    events:[ BIG(182) ], reward:{shard:['jelly',15]} };
  L['3-5'] = { scene:'c3surge', title:'大浪拍岸', lanes:ALL, startEnergy:200, skyDrop:{every:16, value:25, firstAt:6}, duration:240, marks:[8,60,130,200], cells:CELLS,
    spawns:[ ...spread('slime',8,215,14,[2,1,3,0,4]), ...spread('helmfish',40,220,8,[2,1,3,0,4]), ...spread('jelly',70,210,4,[0,4]), ...spread('puffer',60,215,4,[1,3]), ...spread('redbird',90,215,4,[0,4,2]) ],
    events:[ BIG(192) ], reward:{shard:['flower',20]} };
  L['3-6'] = { scene:'c3lagoon', title:'碧水浅湾', lanes:ALL, startEnergy:200, skyDrop:{every:17, value:25, firstAt:6}, duration:240, marks:[8,60,130,200], cells:CELLS,
    spawns:[ ...spread('slime',8,215,14,[2,1,3,0,4]), ...spread('turtle',45,210,6,[1,3,2,0,4]), ...spread('helmfish',70,215,4,[2,0,4]), ...spread('crab',30,220,6,[1,3]), ...spread('mushgoat',100,215,3,[0,4,2]) ],
    events:[ {t:40, kind:'preview', lanes:[1], until:52, text:'预告：炮台龟走第 2 路'}, BIG(192) ], reward:{shard:['bomb',20]} };
  L['3-7'] = { cond:{name:'夕阳', prod:0.8}, scene:'c3sunset', title:'落日海岸', lanes:ALL, startEnergy:225, skyDrop:{every:14, value:25, firstAt:6}, duration:250, marks:[8,70,140,205], cells:CELLS,
    spawns:[ ...spread('slime',8,225,14,[2,1,3,0,4]), ...spread('parrot',40,225,8,[1,3,2,0,4]), ...spread('turtle',90,210,3,[0,4,2]), ...spread('jelly',60,220,4,[1,3]), ...spread('inkocto',80,220,4,[2,0,4]), ...spread('goat',30,200,4,[1,3]) ],
    events:[ {t:34, kind:'preview', lanes:[1], until:46, text:'预告：船长鹦鹉走第 2 路'}, BIG(198) ], reward:{shard:['turtle',25]} };
  L['3-8'] = { cond:{name:'暴风雨'}, scene:'c3storm', title:'暴风雨海岸', lanes:ALL, startEnergy:250, skyDrop:null, duration:260, marks:[8,70,140,210], cells:CELLS,
    spawns:[ ...spread('slime',8,235,14,[2,1,3,0,4]), ...spread('mudfish',40,235,8,[2,1,3,0,4]), ...spread('parrot',80,225,4,[0,4]), ...spread('helmfish',60,230,4,[1,3]), ...spread('puffer',100,230,4,[2,0,4]), [150,'wildox',2], [228,'wildox',1] ],
    events:[ {t:144, kind:'preview', lanes:[2], until:156, text:'预告：蛮角牛走中路'}, BIG(205) ], reward:{shard:['redbird',15]} };
  L['3-9'] = { cond:{name:'夜晚', prod:0.8}, scene:'c3glow', title:'荧光海滩', lanes:ALL, startEnergy:300, skyDrop:null, duration:270, marks:[8,70,150,215], cells:CELLS,
    spawns:[ ...spread('slime',8,245,14,[2,1,3,0,4]), ...spread('beast',40,240,7,[2,1,3,0,4]), ...spread('puffer',90,230,3,[1,3]), ...spread('mudfish',60,240,4,[0,4]), ...spread('jelly',80,235,4,[2,1,3]), ...spread('turtle',110,220,3,[0,4]), [160,'wildox',2], [232,'wildox',3] ],
    events:[ BIG(215) ], reward:{shard:['mushgoat',15]} };
  L['3-10'] = { cond:{name:'夜晚'}, scene:'c3ink', title:'奥库塔的墨潮', lanes:ALL, startEnergy:375, skyDrop:null, duration:300, marks:[10,70,140,200], cells:CELLS,
    spawns:[ ...spread('slime',10,260,16,[2,1,3,0,4]), ...spread('crab',30,200,6,[1,3,0,4]), ...spread('inkocto',50,220,4,[1,3]), ...spread('jelly',70,240,4,[0,4]), ...spread('helmfish',90,250,3,[2,1,3]), ...spread('beast',110,250,3,[0,4,2]), [140,'kraken',2] ],
    events:[ {t:134, kind:'banner', text:'奥库塔从中路过来', until:140} ], reward:{chest:{coin:1000, star:20}} };
})();

// =====================================================================
// 99 版：第 2、3 章出怪改成「分波」（用户 2026-11-24 实测：怪重复、太短、一大波没体现；规则见 docs/关卡设计.md「99 版」）
// 上面两段里 spawns / marks / 一大波横幅 / duration 被这里整个覆盖；cells、氛围、奖励、预告文字照旧。
//   每一波 = 几秒内出完的一团，波之间留喘息；进度条的点 = 每一波开始；最后一大波最大，打完就赢。
//   wave 写法：[开始秒, [[怪, 只数, 指定路?], ...], 选项]；选项 big=一大波（横幅 2 秒后涌进来）、x=额外单只 [秒,怪,路]、pk=尖角虫群 [秒,路]
// =====================================================================
(function(){
  const L = window.LEVELS, ORD=[2,1,3,0,4];
  let rot=0, K=1;   // K = 本章时间拉伸（波的开始时间 × K，同一波里的间隔不变）
  function burst(t, groups, gap){
    const out=[], qs=groups.map(([ty,n,ln])=>({ty,n,ln,k:0})); let i=0, left=qs.reduce((a,q)=>a+q.n,0);
    while(left>0) for(const q of qs) if(q.k<q.n){ const lane = q.ln ? q.ln[q.k%q.ln.length] : ORD[(rot+i)%5]; out.push([+(t+i*gap).toFixed(2), q.ty, lane]); q.k++; i++; left--; }
    rot+=2; return out; }
  const pack = (t, lane) => Array.from({length:5}, (_,i)=>[+(t+i*0.35).toFixed(2), 'hornbug', lane]);
  function build(id, plan, opt={}){
    const lv=L[id], spawns=[], marks=[], ev=(lv.events||[]).filter(e=>e.kind!=='banner'); rot=0;
    for(const [t0, g, o={}] of plan){ const t=Math.round(t0*K), dt=t-t0;
      if(o.big){ ev.push({t, kind:'banner', text:'一大波敌人正在接近', until:t+2}); marks.push(t+2); spawns.push(...burst(t+2.2, g, 0.5)); }
      else { marks.push(t); if(g.length) spawns.push(...burst(t, g, o.gap||1.8)); }
      for(const s of (o.x||[])) spawns.push([s[0]+dt, s[1], s[2]]);
      for(const [pt,pl] of (o.pk||[])) spawns.push(...pack(pt+dt,pl));
    }
    if(opt.boss){ const bt=Math.round(opt.boss[0]*K), bty=opt.boss[1], btext=opt.boss[2]; ev.push({t:bt, kind:'banner', text:btext, until:bt+2}); spawns.push([bt+2.5, bty, 2]); }
    for(const p of (opt.pv||[])) { const e=ev.find(x=>x.kind==='preview' && x.text===p[2]); if(e){ e.t=Math.round(p[0]*K); e.until=e.t+12; e.lanes=p[1]; } }
    spawns.sort((a,b)=>a[0]-b[0]); lv.spawns=spawns; lv.marks=marks; lv.events=ev.sort((a,b)=>a.t-b.t);
    lv.duration=Math.ceil(spawns[spawns.length-1][0]+18);
  }
  const B={big:true};

  // ---------------- 第 2 章（约 5 分钟）----------------
  K=1.2;
  build('2-1', [ [12,[['slime',2]],{gap:4}], [32,[['snake',2],['slime',2]]], [55,[['goat',2],['beetle',1]]], [82,[['goat',2],['beetle',2],['slime',2]]],
    [110,[['snake',3],['beetle',2],['goat',2]]], [140,[['goat',3],['hornliz',2],['slime',2]]], [172,[['goat',3],['beetle',3],['snake',3]]],
    [205,[['goat',5],['beetle',4],['snake',4],['slime',4],['hornliz',2]],B] ]);
  build('2-2', [ [12,[['slime',2]],{gap:4}], [32,[['cat',1],['slime',2],['hornliz',1]]], [58,[['cat',2],['goat',2],['gull',1]]], [85,[['hornliz',2],['gull',2],['slime',2]]],
    [112,[['cat',2],['goat',3],['hornliz',2]]], [142,[['gull',3],['cat',2],['slime',2],['goat',2]]], [175,[['goat',4],['hornliz',3],['cat',2],['gull',2]]],
    [210,[['goat',5],['cat',3],['hornliz',4],['gull',3],['slime',4]],B] ]);
  build('2-3', [ [12,[['slime',2]],{gap:4}], [32,[['bellsnake',1],['snake',2]]], [58,[['bellsnake',2],['slime',3]]], [85,[['snake',3],['beetle',2]],{pk:[[92,1]]}],
    [115,[['bellsnake',2],['goat',3],['snake',2]]], [145,[['bellsnake',2],['beetle',3],['slime',2]],{pk:[[150,3]]}], [178,[['bellsnake',3],['goat',3],['snake',3],['beetle',2]]],
    [212,[['bellsnake',3],['snake',4],['beetle',4],['goat',3],['slime',4]],{big:true, pk:[[216,2]]}] ]);
  build('2-4', [ [12,[['slime',2]],{gap:4}], [35,[['mushgoat',1],['hornliz',2]]], [60,[['mushgoat',1],['beetle',3],['slime',2]]], [88,[['cat',2],['hornliz',2],['mushgoat',1],['goat',2]]],
    [118,[['mushgoat',2],['beetle',3],['snake',3]]], [150,[['hornliz',3],['cat',2],['mushgoat',2],['slime',2]]], [182,[['mushgoat',2],['goat',3],['beetle',3],['hornliz',3]]],
    [218,[['mushgoat',3],['beetle',5],['hornliz',4],['goat',3],['slime',4]],B] ]);
  build('2-5', [ [12,[['slime',2]],{gap:4}], [32,[['redbird',2,[1,3]],['slime',1]]], [58,[['redbird',2,[1,3]],['beetle',2]]], [85,[['goat',3],['gull',2],['slime',2]]],
    [115,[['redbird',3],['slime',4],['goat',3],['beetle',3]],B], [150,[['mushgoat',2],['redbird',2],['fox',3]]], [180,[['gull',3],['redbird',3],['beetle',3],['goat',2]]],
    [215,[['redbird',4],['goat',4],['fox',3],['beetle',4],['mushgoat',2],['slime',3]],B] ], {pv:[[20,[1,3],'预告：掠空鸟走第 2、第 4 路']]});
  build('2-6', [ [12,[['slime',2]],{gap:4}], [32,[['shellliz',1],['slime',2]]], [58,[['shellliz',2],['goat',2],['snake',1]]], [85,[['snail',2],['redbird',2],['bellsnake',1]]],
    [118,[['shellliz',3],['beetle',4],['goat',3],['slime',3]],B], [152,[['snail',2],['shellliz',2],['bellsnake',2],['redbird',2]]], [182,[['shellliz',3],['snake',3],['goat',3],['redbird',2]]],
    [218,[['shellliz',4],['snail',2],['bellsnake',3],['beetle',4],['goat',3],['slime',3]],B] ]);
  build('2-7', [ [12,[['slime',2]],{gap:4}], [32,[['cat',2],['hornliz',2]]], [58,[['mushgoat',1],['goat',2],['beetle',2]]], [85,[['snake',3],['cat',1],['slime',2]],{pk:[[90,0]]}],
    [118,[['mushgoat',2],['goat',2]],{x:[[119,'wildox',2]]}], [150,[['goat',4],['beetle',4],['hornliz',3],['slime',3]],B], [185,[['mushgoat',2],['cat',2],['snake',3]],{pk:[[190,4]]}],
    [220,[['goat',4],['beetle',4],['hornliz',3],['mushgoat',2],['slime',3]],{big:true, x:[[224,'wildox',1],[228,'wildox',3]]}] ], {pv:[[106,[2],'预告：蛮角牛走中路']]});
  build('2-8', [ [12,[['slime',2]],{gap:4}], [35,[['toucan',1,[1]],['goat',2]]], [60,[['toucan',1],['fox',3],['slime',1]]], [88,[['redbird',2],['shellliz',2],['snake',2]]],
    [120,[['toucan',2],['fox',3],['goat',3],['slime',3],['snake',2]],B], [155,[['shellliz',2],['toucan',2],['beetle',3]]], [185,[['redbird',3],['fox',3],['goat',3]]],
    [220,[['toucan',3],['shellliz',3],['fox',4],['goat',3],['snake',3],['slime',3]],B] ], {pv:[[23,[1],'预告：巨喙鸟走第 2 路']]});
  build('2-9', [ [12,[['slime',2]],{gap:4}], [35,[['mushsnake',2],['snake',1]]], [60,[['mushsnake',2],['bellsnake',2],['slime',2]]], [88,[['gull',3],['hornliz',2],['toucan',1]]],
    [120,[['mushsnake',3],['bellsnake',2],['hornliz',3],['slime',3],['goat',3]],{big:true, x:[[124,'wildox',2]]}], [158,[['toucan',2],['gull',2],['mushgoat',2]]], [188,[['mushsnake',3],['hornliz',3],['snake',3]]],
    [222,[['mushsnake',4],['bellsnake',3],['hornliz',4],['goat',3],['mushgoat',2],['slime',3]],{big:true, x:[[226,'wildox',0],[229,'wildox',4]]}] ]);
  build('2-10', [ [12,[['slime',2]],{gap:4}], [35,[['cat',1],['bellsnake',1],['slime',1]]], [62,[['redbird',1],['shellliz',1],['slime',2]]], [92,[['goat',2],['mushgoat',1],['hornliz',2]]],
    [150,[['redbird',2],['slime',3]]], [180,[['shellliz',2],['goat',3]]], [215,[['goat',4],['bellsnake',3],['redbird',3],['shellliz',2],['slime',3]],B] ], {boss:[125,'disco','巴隆从中路过来']});

  // ---------------- 第 3 章（约 5～5.5 分钟）----------------
  K=1.25;
  build('3-1', [ [12,[['slime',2]],{gap:4}], [32,[['crab',2],['slime',1]]], [58,[['crab',2],['goat',2],['snake',1]]], [85,[['crab',3],['beetle',2],['slime',2]]],
    [115,[['goat',3],['crab',3],['snake',2]]], [145,[['crab',3],['hornliz',2],['beetle',3]]], [178,[['crab',4],['goat',3],['snake',3]]],
    [212,[['crab',5],['beetle',4],['goat',3],['hornliz',3],['slime',4]],B] ]);
  build('3-2', [ [12,[['slime',2]],{gap:4}], [32,[['puffer',1],['beetle',2]]], [58,[['puffer',2],['crab',2],['slime',2]]], [85,[['cat',2],['shellliz',2],['puffer',1]]],
    [115,[['puffer',2],['crab',3],['goat',3]]], [148,[['shellliz',2],['cat',2],['puffer',2],['slime',2]]], [180,[['puffer',3],['crab',3],['beetle',3]]],
    [215,[['puffer',3],['crab',4],['goat',3],['shellliz',3],['slime',4]],B] ]);
  build('3-3', [ [12,[['slime',2]],{gap:4}], [42,[['inkocto',1,[2]],['snake',2]]], [68,[['inkocto',1],['redbird',2],['slime',2]]], [95,[['puffer',2],['crab',3],['inkocto',1]]],
    [125,[['inkocto',2],['crab',4],['goat',3],['slime',3]]], [160,[['redbird',3],['puffer',2],['shellliz',2]]], [190,[['inkocto',2],['crab',3],['beetle',3]]],
    [225,[['inkocto',3],['puffer',3],['crab',4],['redbird',3],['goat',3],['slime',3]],B] ], {pv:[[30,[2],'预告：喷墨章鱼走中路']]});
  build('3-4', [ [12,[['slime',2]],{gap:4}], [32,[['jelly',2],['beetle',1]]], [58,[['jelly',2],['inkocto',1],['slime',2]]], [85,[['bellsnake',2],['crab',3]],{pk:[[90,2]]}],
    [115,[['jelly',3],['goat',3],['slime',2]]], [148,[['inkocto',2],['jelly',2],['crab',3]]], [180,[['jelly',3],['bellsnake',2],['snake',3]]],
    [215,[['jelly',4],['crab',4],['inkocto',2],['goat',3],['slime',4]],{big:true, pk:[[219,1]]}] ]);
  build('3-5', [ [12,[['slime',2]],{gap:4}], [32,[['helmfish',2],['snake',1]]], [58,[['helmfish',2],['puffer',2],['slime',1]]], [85,[['redbird',2],['jelly',2],['crab',2]]],
    [115,[['helmfish',3],['crab',3],['goat',3],['slime',3]],B], [152,[['puffer',2],['jelly',2],['helmfish',2],['redbird',2]]], [184,[['helmfish',3],['crab',3],['beetle',3]]],
    [220,[['helmfish',4],['jelly',3],['puffer',3],['crab',3],['redbird',2],['slime',3]],B] ]);
  build('3-6', [ [12,[['slime',2]],{gap:4}], [40,[['turtle',1,[1]],['crab',2]]], [66,[['helmfish',2],['mushgoat',1],['slime',2]]], [92,[['turtle',2],['crab',3],['beetle',2]]],
    [122,[['helmfish',3],['crab',3],['goat',3],['slime',3]],B], [158,[['turtle',2],['mushgoat',2],['jelly',2]]], [190,[['helmfish',3],['crab',3],['puffer',2]]],
    [225,[['turtle',2],['helmfish',3],['crab',4],['mushgoat',2],['goat',3],['slime',3]],B] ], {pv:[[28,[1],'预告：炮台龟走第 2 路']]});
  build('3-7', [ [12,[['slime',2]],{gap:4}], [36,[['parrot',1,[1]],['crab',2]]], [62,[['parrot',2],['jelly',2],['slime',1]]], [90,[['inkocto',2],['turtle',1],['goat',2]]],
    [120,[['parrot',3],['crab',3],['goat',3],['slime',3]],B], [156,[['turtle',2],['jelly',2],['parrot',2]]], [188,[['inkocto',2],['parrot',3],['helmfish',3]]],
    [222,[['parrot',4],['jelly',3],['turtle',2],['crab',4],['goat',3],['slime',3]],B] ], {pv:[[24,[1],'预告：船长鹦鹉走第 2 路']]});
  build('3-8', [ [12,[['slime',2]],{gap:4}], [34,[['mudfish',2],['snake',1]]], [60,[['mudfish',2],['helmfish',2],['slime',1]]], [88,[['puffer',2],['parrot',2],['mudfish',1]]],
    [120,[['mudfish',3],['crab',3],['helmfish',3],['slime',3]],B], [152,[['mudfish',2],['puffer',2]],{x:[[153,'wildox',2]]}], [185,[['parrot',3],['helmfish',3],['crab',3]]],
    [220,[['mudfish',4],['helmfish',3],['puffer',3],['crab',4],['slime',3]],{big:true, x:[[224,'wildox',1]]}] ], {pv:[[140,[2],'预告：蛮角牛走中路']]});
  build('3-9', [ [12,[['slime',2]],{gap:4}], [34,[['beast',2],['jelly',1]]], [60,[['beast',2],['mudfish',2],['slime',1]]], [88,[['turtle',2],['jelly',2],['puffer',2]]],
    [120,[['beast',3],['crab',3],['jelly',3],['slime',3]],{big:true, x:[[124,'wildox',2]]}], [158,[['mudfish',2],['turtle',2],['beast',2]]], [190,[['beast',3],['helmfish',3],['crab',3]]],
    [225,[['beast',4],['jelly',3],['turtle',2],['mudfish',2],['crab',4],['slime',3]],{big:true, x:[[229,'wildox',3]]}] ]);
  build('3-10', [ [12,[['slime',2]],{gap:4}], [35,[['inkocto',2],['jelly',2]]], [62,[['helmfish',2],['crab',3],['slime',2]]], [92,[['beast',2],['puffer',2],['mudfish',2]]],
    [150,[['crab',3],['slime',2]]], [180,[['helmfish',2],['jelly',2]]], [215,[['crab',4],['beast',2],['jelly',3],['helmfish',2],['slime',3]],B] ], {boss:[125,'kraken','奥库塔从中路过来']});
})();

// =====================================================================
// 100 版：每只怪整个游戏只出现在 5 关（用户 2026-11-25；规则见 docs/关卡设计.md「100 版」）
//   1-1～1-3 不算；连续最多 2 关，之后要空 1～2 关；最多只能空 2 关（前期的怪不会拖到后期）。绿莱姆也算。Boss 只在自己那关。
//   出场表 APPEAR 由 tools/test/roster_plan.py 排出（每关约 5 种怪），tools/test/roster_check.js 检查，发布前必须过。
//   连带：格鲁姆吼叫叫绿莱姆 → 1-10 有绿莱姆；巴隆叫莽角羊 → 2-10 有莽角羊；奥库塔叫船长鹦鹉、船长鹦鹉带岩钳蟹 → 3-10、鹦鹉的关都有岩钳蟹。
//   做法：上面各关原有的出怪时间、路不动；不在本关出场表里的怪，按生命值等量换成本关该出的老怪（先补本关缺的那几种）；
//   尖角虫换进来时 5 只一群；蛮角牛（精英）不当替补，缺时在最后一波加 1 只；预告里提到已不出场的怪，预告删掉。
// =====================================================================
(function(){
  const L = window.LEVELS;
  const APPEAR = {
    slime:['1-4','1-5','1-7','1-10','2-3'],   beetle:['1-4','1-6','1-7','1-9','2-2'],   hornliz:['1-4','1-5','1-7','1-9','2-1'],
    hornbug:['1-5','1-6','1-8','2-1','2-3'],  lizard:['1-6','1-8','1-10','2-2','2-5'],  fox:['1-7','1-9','2-1','2-4','2-6'],
    snake:['1-8','1-10','2-2','2-5','2-8'],   snail:['1-8','2-1','2-3','2-4','2-7'],     gull:['1-9','1-10','2-2','2-4','2-6'],
    goat:['2-1','2-3','2-5','2-8','2-10'],    cat:['2-2','2-5','2-7','2-8','3-1'],       bellsnake:['2-3','2-4','2-6','2-7','2-10'],
    mushgoat:['2-4','2-6','2-9','3-2','3-5'], redbird:['2-5','2-7','2-10','3-2','3-3'],  shellliz:['2-6','2-8','2-9','3-1','3-3'],
    wildox:['2-7','2-9','3-1','3-2','3-4'],   toucan:['2-8','2-9','3-1','3-4','3-5'],    mushsnake:['2-9','2-10','3-2','3-3','3-6'],
    crab:['3-1','3-4','3-7','3-8','3-10'],    puffer:['3-2','3-3','3-5','3-6','3-8'],    inkocto:['3-3','3-4','3-6','3-7','3-9'],
    jelly:['3-4','3-5','3-7','3-8','3-10'],   helmfish:['3-5','3-6','3-8','3-9'],        turtle:['3-6','3-7','3-9','3-10'],
    parrot:['3-7','3-8','3-10'],              mudfish:['3-8','3-9'],                     beast:['3-9','3-10'],
    bear:['1-10'], disco:['2-10'], kraken:['3-10'],
  };
  window.MON_APPEAR = APPEAR;
  const FREE = ['1-1','1-2','1-3'], E = (typeof DATA!=='undefined' && DATA.enemies) || {};
  const hp0 = k => (E[k] && E[k].hp) || 300, unit = k => k==='hornbug' ? 5 : 1, isBig = k => E[k] && E[k].role==='elite';
  // 101 版：有特殊本事的怪不按生命值 1:1 换（掠空鸟直接飞向警钟、铃尾蛇给周围加速…），按「威胁」折算，且一关里同种有上限
  //   （100 版 2-7 换进 28 只掠空鸟 + 25 只铃尾蛇、3-2 换进 27 只掠空鸟，fastbot 在 99 能过的关输掉）
  const W = {hornliz:1.2, redbird:2.5, bellsnake:1.8, mushgoat:1.5, toucan:1.5, cat:1.3, puffer:1.4, fox:1.2, gull:1.2, parrot:2, turtle:1.3, inkocto:1.2, mudfish:1.2};
  const CAP = {redbird:8, bellsnake:8, mushgoat:8, toucan:6, cat:8, puffer:10, parrot:4, turtle:6, fox:14};
  const hp = k => hp0(k)*(W[k]||1);
  const ids = Object.keys(L).filter(id=>/^\d+-\d+$/.test(id) && !FREE.includes(id));
  for(const id of ids){
    const lv=L[id]; if(!lv.spawns) continue;
    const ros=Object.keys(APPEAR).filter(k=>APPEAR[k].includes(id));
    const keep=lv.spawns.filter(s=>ros.includes(s[1])), gone=lv.spawns.filter(s=>!ros.includes(s[1])).sort((a,b)=>a[0]-b[0]);
    const have=new Set(keep.map(s=>s[1]));
    const intro=Object.keys(APPEAR).find(k=>APPEAR[k][0]===id);
    const minors=ros.filter(k=>!isBig(k));
    let pool=[...minors.filter(k=>!have.has(k)), ...minors.filter(k=>have.has(k) && k!==intro)];
    if(!pool.length) pool=minors.slice();
    const add=[], got={}; let bud=0;   // 每次挑「已换进来的生命值最少」的那种，几种老怪分到的生命值差不多
    const cnt={}; for(const s of keep) cnt[s[1]]=(cnt[s[1]]||0)+1;
    const open=k=>!(CAP[k] && (cnt[k]||0)+unit(k) > CAP[k]);
    let early=false;   // 开头 40 秒（前段小波）只换成没有特殊本事、不快的怪：100 版 1-9 开头换进迅火狐，fastbot 92 秒就输
    const next=()=>{ let c=pool.filter(open); if(early){ const pl=c.filter(k=>!W[k]); if(pl.length) c=pl; } const q=c.length?c:[pool.reduce((a,b)=>(W[b]||1)<(W[a]||1)?b:a)];
      return q.reduce((a,b)=>(got[b]||0)<(got[a]||0)?b:a); };
    for(const s of gone){ bud+=hp0(s[1]); let off=0; early = s[0] < 40;   // 一只换成几只时依次错开 0.7 秒，不叠在同一点（被换掉的怪按原生命值算预算）
      for(let ty=pool.length?next():null; ty && bud >= 0.6*hp(ty)*unit(ty); ty=next()){
        cnt[ty]=(cnt[ty]||0)+unit(ty);
        for(let i=0;i<unit(ty);i++) add.push([+(s[0]+off+i*0.35).toFixed(2), ty, s[2]]);
        off+=0.7+(unit(ty)-1)*0.35;
        bud-=hp(ty)*unit(ty); got[ty]=(got[ty]||0)+hp(ty)*unit(ty); have.add(ty); } }
    // 出场表里有、但换完还没出现的：最后一波补上（精英 1 只，其余 3 只，尖角虫一群）
    const lastT=(lv.marks&&lv.marks.length) ? lv.marks[lv.marks.length-1] : lv.spawns[lv.spawns.length-1][0];
    const lanes=lv.lanes||[2]; let li=0, ft=lastT+1;   // 几种依次错开，路轮流
    for(const ty of ros) if(!have.has(ty) && E[ty] && !(E[ty].boss)){ const n=isBig(ty)?1:(ty==='hornbug'?5:3), one=ty==='hornbug'||isBig(ty), ln=lanes[(li++)%lanes.length];
      for(let i=0;i<n;i++) add.push([+(ft+i*(ty==='hornbug'?0.35:1.2)).toFixed(2), ty, one ? ln : lanes[(li++)%lanes.length]]); ft+=n*(ty==='hornbug'?0.35:1.2)+1.5; have.add(ty); }
    lv.spawns=[...keep, ...add].sort((a,b)=>a[0]-b[0]);
    const last=lv.spawns[lv.spawns.length-1][0]; if(lv.duration<last+6) lv.duration=Math.ceil(last+6);
    if(lv.events){ const gn=new Set(Object.keys(APPEAR).filter(m=>!ros.includes(m)).map(m=>E[m]&&E[m].cn).filter(Boolean));
      lv.events=lv.events.filter(e=>e.kind!=='preview' || ![...gn].some(n=>(e.text||'').includes(n))); }
  }
})();
