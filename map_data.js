'use strict';
/* =====================================================================
   塔塔 · 章节地图数据（只放数据，画法在 map.js）
   - 每章一条横向地图；关卡按顺序解锁（打完上一关才能打下一关）。
   - 65 版：1-1～1-5 的战斗数据在 levels.js（按 id 读取），这里的 first 和 levels.js 的 reward 对应；1-6 以后还是占位。
   - 奖励写法：['coin', 数量] 金币；['star', 数量] 星星；['shard', 怪物 key, 数量] 怪物碎片。
   - elite / boss：节点上方冒出这只怪的头像气泡（只露精英和 Boss，普通怪不提前公布）。
   - newPet：这关的碎片够召唤一只新宠物，节点上方冒出它的剪影气泡（学 PvZ2 在节点上直接画出这关送的植物）。
   - unlock：通关后解锁的新机制（玩法与界面.md：机制逐关解锁，例：通关后解锁战斗中换位）。
   ===================================================================== */
window.MAP_DATA = {
  chapters: [
    { id:1, name:'翠绿森林',
      far:{sky:'ch1_sky', far1:'ch1_far1', far2:'ch1_far2'},   // 远景三层（tools/make_map_assets.py 生成）
      final:[['coin',500], ['star',10]],   // 章节终关奖励（地图左上角「终关奖励」里显示）
      levels:[
        {id:'1-1',  name:'森林入口',     lanes:1, first:[['shard','pug',10]],     again:[['coin',20]], newPet:'pug'},
        {id:'1-2',  name:'史莱姆小径',   lanes:1, first:[['shard','pumpkin',10]], again:[['coin',20]], newPet:'pumpkin'},
        {id:'1-3',  name:'三岔路口',     lanes:3, first:[],                        again:[['coin',25]], unlock:'战斗中换位'},
        {id:'1-4',  name:'甲虫林',       lanes:3, first:[['shard','bomb',15]],    again:[['coin',25]], newPet:'bomb'},
        {id:'1-5',  name:'花田保卫战',   lanes:5, first:[],                        again:[['coin',30]], unlock:'换位次数 +1'},
        {id:'1-6',  name:'林中空地',     lanes:5, first:[['shard','lizard',15]],  again:[['coin',30]], newPet:'lizard'},
        {id:'1-7',  name:'山坡小路',     lanes:5, first:[['shard','goldfish',10]],          again:[['coin',35]]},
        {id:'1-8',  name:'林间夜路',     lanes:5, first:[['shard','snail',10]],          again:[['coin',35]], newPet:'snail'},
        {id:'1-9',  name:'深林山谷',     lanes:5, first:[['shard','pug',10]],          again:[['coin',40]]},
        {id:'1-10', name:'森林之王',     lanes:5, first:[['coin',500],['star',10]],          again:[['coin',50]], boss:'bear'},
      ] },
    { id:2, name:'风车农场', soon:true },
  ],
};
