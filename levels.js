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
    tut:[ {kind:'place', key:'goldfish', lane:2, col:1, text:'把泡泡鱼拖到亮起的格子'},
          {kind:'orb', value:50, text:'点一下能量，把它收起来'},
          {kind:'place', key:'flower', lane:2, col:0, text:'聚能花每 14 秒产出 25 能量。把它拖到亮起的格子'} ] };

  // 1-2 史莱姆小径：1 路。多了火牙犬；绿莱姆两只连着来
  L['1-2'] = { title:'史莱姆小径', lanes:[2], startEnergy:150, skyDrop:{every:10, value:25, firstAt:8}, duration:74, marks:[5,28,52],
    spawns: seq('slime', [[5,2],[15,2],[16.6,2],[28,2],[29.6,2],[40,2],[41.6,2],[52,2],[53.6,2],[58,2],[62,2],[63.6,2]]),
    reward:{shard:['pumpkin',10]},
    tut:[ {at:8, kind:'place', key:'pug', lane:2, col:'front', min:3, text:'火牙犬咬面前 1 格的敌人。把它放到前面'} ] };

  // 1-3 三岔路口：3 路。多了硬壳南瓜；赤甲虫出场
  L['1-3'] = { title:'三岔路口', lanes:[1,2,3], startEnergy:175, skyDrop:{every:10, value:25, firstAt:6}, duration:112, marks:[8,48,88],
    spawns: [ ...seq('slime', [[8,2],[17,1],[26,3],[34,2],[52,1],[64,2],[74,3],[88,1],[90,3],[100,1],[100.8,3]]),
              ...seq('beetle', [[48,2],[60,3],[72,1],[89,2],[96,2],[104,2]]) ],
    reward:{unlock:'swap'},
    tut:[ {at:11, kind:'place', key:'pumpkin', lane:2, col:'front', min:4, text:'硬壳南瓜生命 2000。把它放在最前面挡住敌人'} ] };

  // 1-4 甲虫林：3 路。换位、预告主攻路、水克火；棘背蜥出场
  L['1-4'] = { title:'甲虫林', lanes:[1,2,3], startEnergy:175, skyDrop:{every:10, value:25, firstAt:6}, duration:126, marks:[8,56,86],
    spawns: [ ...seq('slime', [[8,2],[15,3],[31,1],[38,3],[63,2],[71,3],[87,2],[97,1],[109,2]]),
              ...seq('hornliz', [[23,2],[84,3],[101,1],[117,2]]),
              ...seq('beetle', [[56,1],[60,1],[66,1],[73,1],[93,2],[105,3],[113,2]]) ],
    events:[ {t:42, kind:'preview', lanes:[1], until:60, text:'预告：赤甲虫走最左一路'} ],
    reward:{shard:['bomb',15]},
    tut:[ {at:43, kind:'move', key:'goldfish', toLane:1, text:'水克火，伤害 +50%。把泡泡鱼拖到预告的那一路'} ] };

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
    tut:[ {at:112, when:'hornbug', whenP:7.4, kind:'place', key:'bomb', lane:2, col:5, ahead:'hornbug', text:'把波姆放在尖角虫前面。3 秒后就绪，炸周围 3×3 格，600 伤害'} ] };

  window.LEVELS = L;
  window.UNLOCK_CN = { swap:{name:'战斗中换位', desc:'拖动场上的宠物换格子。有 2 次，用掉后每 20 秒恢复 1 次'}, swap3:{name:'换位次数 +1', desc:'换位次数上限从 2 次变成 3 次'} };
})();
