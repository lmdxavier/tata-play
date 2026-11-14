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
  L['1-1'] = { title:'森林入口', lanes:[2], startEnergy:100, skyDrop:{every:10, value:25, firstAt:12}, duration:58, marks:[3,36],
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
  L['1-2'] = { title:'史莱姆小径', lanes:[2], startEnergy:150, skyDrop:{every:10, value:25, firstAt:8}, duration:74, marks:[5,28,52],
    spawns: seq('slime', [[5,2],[15,2],[16.6,2],[28,2],[29.6,2],[40,2],[41.6,2],[52,2],[53.6,2],[58,2],[62,2],[63.6,2]]),
    reward:{shard:['pumpkin',10]},
    tut:[ {at:8, kind:'place', key:'pug', lane:2, col:'front', min:3, tip:'火牙犬只咬面前 1 格，但生命和攻击更高，适合放在前排。'} ] };

  // 1-3 三岔路口：3 路。多了硬壳南瓜；赤甲虫出场
  L['1-3'] = { title:'三岔路口', lanes:[1,2,3], startEnergy:175, skyDrop:{every:10, value:25, firstAt:6}, duration:112, marks:[8,48,88],
    spawns: [ ...seq('slime', [[8,2],[17,1],[26,3],[34,2],[52,1],[64,2],[74,3],[88,1],[90,3],[100,1],[100.8,3]]),
              ...seq('beetle', [[48,2],[60,3],[72,1],[89,2],[96,2],[104,2]]) ],
    reward:{unlock:'swap'},
    tut:[ {at:11, kind:'place', key:'pumpkin', lane:2, col:'front', min:4, tip:'硬壳南瓜生命 2000，不攻击。放在最前面挡住敌人，后排继续输出。'} ] };

  // 1-4 甲虫林：3 路。换位、预告主攻路、水克火；棘背蜥出场
  L['1-4'] = { title:'甲虫林', lanes:[1,2,3], startEnergy:175, skyDrop:{every:10, value:25, firstAt:6}, duration:126, marks:[8,56,86],
    spawns: [ ...seq('slime', [[8,2],[15,3],[31,1],[38,3],[63,2],[71,3],[87,2],[97,1],[109,2]]),
              ...seq('hornliz', [[23,2],[84,3],[101,1],[117,2]]),
              ...seq('beetle', [[56,1],[60,1],[66,1],[73,1],[93,2],[105,3],[113,2]]) ],
    events:[ {t:42, kind:'preview', lanes:[1], until:60, text:'预告：赤甲虫走最左一路'} ],
    reward:{shard:['bomb',15]},
    tut:[ {at:43, kind:'move', key:'goldfish', toLane:1, tip:'红色标记的一路要来赤甲虫。水克火，伤害 +50%：把泡泡鱼拖过去。'} ] };

  // 1-5 花田保卫战：5 路。多了波姆；能量桶；尖角虫成群
  L['1-5'] = { title:'花田保卫战', lanes:[0,1,2,3,4], startEnergy:200, skyDrop:{every:10, value:25, firstAt:5}, duration:200, marks:[16,70,112,172],
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
  L['1-6'] = { title:'林中空地', lanes:[0,1,2,3,4], startEnergy:200, skyDrop:{every:10, value:25, firstAt:5}, duration:200, marks:[12,70,104,160],
    cells:[ {lane:2,col:2,type:'flower'}, {lane:3,col:6,type:'crate',kind:'box'}, {lane:0,col:5,type:'crate',kind:'barrel'} ], boxShard:'lizard',
    spawns: [ ...seq('slime', [[12,2],[20,1],[28,3],[40,0],[48,4],[75,1],[83,3],[110,2],[118,0],[126,4],[160,1],[164,3],[172,2],[178,0],[182,4]]),
              ...seq('lizard', [[34,2],[70,0],[78,4],[104,1],[112,3],[150,2],[166,0],[170,4]]),
              ...seq('beetle', [[60,2],[90,2],[98,1],[120,3],[140,1],[146,3],[162,2],[176,1],[180,3]]),
              ...seq('hornliz', [[130,2],[168,2],[186,2]]) ],
    events:[ {t:58, kind:'preview', lanes:[0,4], until:82, text:'预告：喷火蜥走最左、最右两路'},
             {t:153, kind:'banner', text:'一大波敌人正在接近', until:159} ],
    reward:{shard:['lizard',15]} };

  // 1-7 山坡小路：5 路。迅火狐（移动 0.5 格 / 秒，生命 170，走防守少的路）；通关给泡泡鱼升 2 星的碎片
  L['1-7'] = { title:'山坡小路', lanes:[0,1,2,3,4], startEnergy:200, skyDrop:{every:10, value:25, firstAt:5}, duration:205, marks:[10,50,110,160],
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

  // 1-10 森林之王：5 路。Boss 格鲁姆（重击带上下两路、换路、吼叫召绿莱姆、半血狂暴）。通关给章节宝箱（金币 500、星星 10）
  L['1-10'] = { title:'森林之王', lanes:[0,1,2,3,4], startEnergy:250, skyDrop:{every:10, value:25, firstAt:5}, duration:290, marks:[10,60,140,200],
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
    reward:{chest:{coin:500, star:10}}, wip:true };   // 70 版：做好了但先不开放，等 1-8、1-9 做完一起上（用户 2026-11-14：不能跳过 8、9）

  window.LEVELS = L;
  window.UNLOCK_CN = { swap:{name:'战斗中换位', desc:'拖动场上的宠物换格子。有 2 次，用掉后每 20 秒恢复 1 次'}, swap3:{name:'换位次数 +1', desc:'换位次数上限从 2 次变成 3 次'} };
})();
