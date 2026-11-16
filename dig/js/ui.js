/* dig hero 界面（v0.4，DOM）：顶部资源与两条、小镇侧边按钮和建筑名牌、铁匠铺（纸娃娃 + 商店）、技能屋（网状技能树）、宠物 / 图鉴 / VIP / 签到、
 * 结算与广告弹窗、领取动画、材料“去哪拿”。音效：打开 ui_open、关闭 ui_close、点选 ui_tap（每个动作固定一个）。 */
(function () {
  'use strict';
  const G = window.G, B = window.BAL, $ = id => document.getElementById(id), S = () => G.S;
  const IC = { coin: 'ui/i_coin.png', gem: 'ui/i_gem_1_purple.png', stam: 'ui/i_food_meat.png', hp: 'ui/i_heart.png', atk: 'ui/i_equip_sword.png', def: 'ui/i_equip_shield.png', dig: 'ui/i_equip_pickax.png',
    vip: 'sk/Economy_Star_04_Yellow.png', sign: 'sk/Item_Scroll_01_Red.png', codex: 'sk/Item_Book_03_Blue.png', pet: 'sk/Misc_CatPawPad_01.png', chest: 'sk/Item_Chest_04_Wood.png', auto: 'sk/Economy_Energy_02_Green.png', boost: 'sk/Item_Gem_Fish_01_Gold.png',
    close: 'ui/icon_white_close.png', off: 'sk/Item_Hourglass_01_Gold.png', lock: 'ui/icon_color_lock_s.png' };
  const src = k => 'assets/' + (IC[k] || (B.MAT[k] ? B.MAT[k].img : k));
  const img = (k, cls) => `<img src="${src(k)}" alt=""${cls ? ` class="${cls}"` : ''}>`;
  const f = B.fmt, STAT = { atk: '攻击', def: '防御', hp: '血量', stam: '体力' };
  const fv = v => v >= 100 || v === Math.floor(v) ? f(v) : v.toFixed(1);
  const part = spr => `assets/hero/parts/${spr}.png`;
  const ui = G.ui = {};
  const snd = (k, v) => G.sfx.play(k, v === undefined ? 0.8 : v);
  let tab = null;

  ui.init = () => {
    $('hud').innerHTML = `<div class="res"><div class="pill t">${img('coin')}<span id="h-coin">0</span><b class="rg" id="h-rc"></b></div><div class="pill t">${img('gem')}<span id="h-gem">0</span><b class="rg" id="h-rg"></b></div><div class="boost t" id="h-boost">${img('boost')}<span></span></div><div class="depth t" id="h-depth"></div></div>
      <div class="bars" id="h-bars"><div class="bar hp" id="b-hp">${img('hp')}<i></i><span class="t"></span></div><div class="bar" id="b-st">${img('stam')}<i></i><span class="t"></span></div></div>
      <button id="back" class="t">回地面</button><button id="auto" class="t">${img('auto')}<span>自动</span></button><div id="bossbar"><b class="t"></b><div class="bar"><i></i><span class="t"></span></div></div>`;
    $('wrap').appendChild($('auto'));
    $('back').onclick = () => { snd('ui_tap'); G.endRun('back'); };
    $('auto').onclick = () => {
      if (!G.vipOwn('auto')) { snd('ui_tap'); ui.toast('自动模式：VIP ' + B.vipLv('auto') + ' 解锁'); return; }
      G.toggleAuto(); snd('ui_tap'); ui.toast(S().auto ? '自动模式：按一下方向，就一直往那边挖' : '自动模式已关闭');
    };
    $('shore').innerHTML = `<div class="side l">${sideBtn('vip', 'VIP')}${sideBtn('sign', '签到')}${sideBtn('codex', '图鉴')}</div>
      <div class="side r">${sideBtn('chest', '宝箱')}${sideBtn('pet', '宠物')}</div>
      <div class="tag t" id="tag-smithy">铁匠铺<i class="dot"></i></div><div class="tag t" id="tag-house">技能屋<i class="dot"></i></div>
      <button id="go" class="t">开始挖掘</button><div id="loop" class="t">挂机中 · 点这里停止</div>`;
    $('go').onclick = () => { if (popOn()) return; snd('ui_tap'); G.dive(); };
    $('shore').querySelectorAll('.side button').forEach(b => b.onclick = () => {
      if (popOn()) return;
      const k = b.dataset.k; if (k === 'chest') { if (G.chestReady()) { snd('ui_open'); G.openAdChest(); }   /* 宝箱的广告框打开时放 ui_open，领取框收起时 ui_close，成对 */ else { snd('ui_tap'); ui.toast(G.adLeft('chest') ? '宝箱还在准备：' + chestLeft() : '今天的宝箱领完了'); } return; }
      ui.open(k);
    });
    $('tag-smithy').onclick = () => { if (!popOn()) G.goto('smithy'); }; $('tag-house').onclick = () => { if (!popOn()) G.goto('house'); };
    $('loop').onclick = () => { S().loop = false; G.save(); ui.refresh(); };   // 挂机中点一下 = 停止（VIP 页可以再打开）
    $('panel').addEventListener('click', onPanel);
  };
  const sideBtn = (k, n) => `<button data-k="${k}" class="t">${img(k)}<span>${n}</span><i class="dot"></i></button>`;
  const chestLeft = () => { const ms = G.chestLeftMs(); const h = Math.floor(ms / 3600e3), m = Math.ceil((ms % 3600e3) / 60e3); return h ? h + ' 小时 ' + m + ' 分' : m + ' 分钟'; };

  /* ---------- 每帧：顶部、名牌位置 ---------- */
  const cache = {};
  // 顶栏一排放不下时整排等比缩小字号（不折行、不截断）；只在内容变了时量一次（用户 18:18：窄屏要跟着缩，不能挤到下一行）
  const fitRes = () => { const r = $('hud') && $('hud').querySelector('.res'); if (!r) return; r.style.transform = ''; r.style.width = ''; const need = r.scrollWidth, have = r.clientWidth; if (need <= have + 1) return; const f = Math.max(0.62, have / need); r.style.transformOrigin = 'left center'; r.style.width = (100 / f) + '%'; r.style.transform = 'scale(' + f + ')'; };   // 子元素用 rem，改字号缩不动 → 整排 scale，宽度反向放大保持占满
  let fitQ = 0; const fitSoon = () => { if (!fitQ) fitQ = requestAnimationFrame(() => { fitQ = 0; fitRes(); }); };
  window.addEventListener('resize', fitSoon);
  const set = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; if (/^h-/.test(id)) fitSoon(); } };
  const bar = (id, v, max) => { const k = id + Math.round(v / max * 200) + '|' + Math.ceil(v); if (cache[id + 'b'] === k) return; cache[id + 'b'] = k; const e = $(id); e.querySelector('i').style.width = Math.max(0, Math.min(100, v / max * 100)) + '%'; e.querySelector('span').textContent = f(Math.ceil(v)) + ' / ' + f(Math.ceil(max)); e.classList.toggle('low', v / max < 0.25); };
  let counting = 0;
  ui.hud = (R, mode, hero, D, dt) => {
    const run = mode === 'run', s = S();
    const lg = mode === 'rise' && G.lastGain ? G.lastGain : null;
    if (!counting) { set('h-coin', f(s.coin - (lg ? lg.coin : 0))); set('h-gem', f(s.gem - (lg ? lg.gem : 0))); }
    set('h-rc', run && R && R.coin >= 1 ? '+' + f(R.coin) : ''); set('h-rg', run && R && R.gem >= 1 ? '+' + f(R.gem) : '');
    $('h-boost').style.display = 'none';   // 用户 18:17：收益 ×2 只在结算界面显示，主屏顶栏不挂
    if (cache.run !== run) { cache.run = run; $('h-depth').parentNode.classList.toggle('run', run); /* v0.18：挖矿时深度加底框（ui.css .res.run） */ $('h-bars').style.display = $('back').style.display = $('auto').style.display = run ? '' : 'none'; if (!run) $('bossbar').style.display = 'none'; }
    if (run && R) {
      set('h-depth', B.depthM(hero.r) + ' 米'); bar('b-st', R.st, R.stMax); bar('b-hp', R.hp, R.hpMax);
      const a = G.vipOwn('auto') ? (s.auto ? 'on' : 'off') : 'lock'; if (cache.auto !== a) { cache.auto = a; $('auto').className = 't ' + a; }
      const boss = R.mons.find(m => m.boss && !m.dead && Math.abs(m.r - hero.r) <= 3), bb = $('bossbar');
      if (!!boss !== !!cache.boss) { cache.boss = !!boss; bb.style.display = boss ? 'block' : 'none'; if (boss) bb.querySelector('b').textContent = '守卫 ' + G.MON_NAME[boss.kind]; }
      if (boss) { const k = Math.round(boss.hp / boss.max * 300); if (cache.bossk !== k) { cache.bossk = k; bb.querySelector('i').style.width = Math.max(0, boss.hp / boss.max * 100) + '%'; bb.querySelector('span').textContent = f(Math.max(0, Math.ceil(boss.hp))) + ' / ' + f(boss.max); } }
      if (!s.tut.move && R.blocks >= 2) { s.tut.move = 1; const t = $('tip'); if (t) t.remove(); }
    } else set('h-depth', s.best ? '最深 ' + s.best + ' 米' : '');
    if (mode === 'shore') {   // 建筑名牌跟着镜头（世界格 → CSS 像素）
      const st = G.state(), k = $('cv').clientWidth / st.VW, T = st.T * k, ox = ($('cv').clientWidth - 7 * T) / 2;
      const pos = (id, x, y) => { $(id).style.transform = `translate(${Math.round(ox + x * T)}px, ${Math.round((y * st.T - st.camY) * k)}px) translate(-50%, -100%)`; };
      const TL = window.TOWN.L; pos('tag-smithy', TL.smithy.x0 + 1.3, TL.smithy.y - 3.62); pos('tag-house', 5.84, TL.house.y - 3.05);   // 跟着布局表走，不写死
    }
    if (tab === 'shop' && $('doll')) G.drawDoll($('doll'), preview ? Object.assign({}, s.gear, { [preview.slot]: preview.t }) : s.gear, null, dt);
  };
  ui.showRun = () => { $('shore').style.display = 'none'; ui.close(true); if (!S().tut.move && !$('tip')) { const d = document.createElement('div'); d.id = 'tip'; d.className = 't'; d.textContent = '按住屏幕拖动：往哪走，就往哪挖'; $('wrap').appendChild(d); } };
  ui.hideRun = () => { $('bossbar').style.display = 'none'; cache.boss = false; const t = $('tip'); if (t) t.remove(); };
  ui.hideShore = () => { $('shore').style.display = 'none'; ui.close(true); };
  ui.showShore = (gain) => { $('shore').style.display = ''; const t = $('tip'); if (t) t.remove(); ui.refresh(); if (gain) flyGain(gain); };
  ui.refresh = () => {
    const s = S();
    const canShop = B.SLOTS.some(sl => B.GEAR[sl].some((g, t) => G.canGear(sl, t))), canSk = B.SK.some(n => B.skSeen(s, n) && G.canSkill(n.id));
    $('tag-smithy').classList.toggle('red', canShop); $('tag-house').classList.toggle('red', canSk);
    sideDot('vip', G.vipReady() > 0);
    sideDot('sign', G.signReady(), G.signReady() ? '可领' : ''); sideDot('codex', false, ''); sideDot('pet', false, '');
    sideDot('chest', G.chestReady()); $('shore').querySelector('[data-k="chest"]').classList.toggle('off', !G.adLeft('chest'));   // 今天的广告宝箱用完 = 按钮变灰
    $('shore').querySelector('[data-k="vip"] span').textContent = 'VIP ' + s.vip;
    $('loop').style.display = G.looping() ? '' : 'none';
    if (tab) render();
  };
  const chestShort = () => { const ms = G.chestLeftMs(); const h = Math.floor(ms / 3600e3), m = Math.ceil((ms % 3600e3) / 60e3); return h ? h + '时' + m + '分' : m + '分'; };
  function sideDot(k, on) { const b = $('shore').querySelector(`[data-k="${k}"]`); b.querySelector('.dot').style.display = on ? '' : 'none'; }   // v0.6：按钮下不再写说明小字（用户：可领用红点表示）

  /* ---------- 面板 ---------- */
  let preview = null, sel = 'root', ctab = 'mon', shopTab = 'weapon', treePan = { x: 0, y: 0 }, fitTree = true;
  ui.open = k => { if (k === 'skill' && tab !== 'skill') fitTree = true; tab = k; preview = null; snd('ui_open'); $('panel').dataset.tab = k; $('panel').classList.add('on'); render(); if (k === 'shop' && !S().tut.drag) setTimeout(tutDrag, 450); };
  ui.close = quiet => { if (!tab) return; tab = null; preview = null; const t = $('tut'); if (t) t.remove(); $('panel').classList.remove('on'); if (!quiet) { snd('ui_close'); G.exitDoor(); } };
  ui.tab = () => tab;
  // 只处理标签之间的文字：① 数字和单位（10 秒、+2 格、50%、×1.5）包成不换行的一段（v0.18 修复：原来会拆成“每 10 / 秒”）；② × 换成对齐用的 <i class="mul">
  const NW = /([+\-−×]?\s?\d+(?:\.\d+)?%?(?:\s?(?:秒|格|次|趟|米|天|小时|分钟|个|级|件|只|颗))?)/g;
  const mulfix = h => h.split(/(<[^>]*>)/).map(t => t[0] === '<' || !/\d/.test(t) ? t.replace(/×/g, '<i class="mul">×</i>') : t.replace(NW, m => /\s/.test(m.trim()) || m.length > 2 ? `<nb>${m}</nb>` : m).replace(/×/g, '<i class="mul">×</i>')).join('');
  const head = t => `<div class="phead"><h2 class="t">${t}</h2><button class="close" data-close="1">${img('close')}</button></div>`;
  const costHtml = (coin, mat) => {
    const s = S(); let h = `<span class="${s.coin >= coin ? '' : 'lack'}">${img('coin')}${f(coin)}</span>`;
    for (const k in mat || {}) h += `<span class="m ${(s.mat[k] || 0) >= mat[k] ? 'ok' : 'lack'}" data-mat="${k}">${img(k)}${mat[k]}</span>`;
    return h;
  };
  function render() {
    const s = S(), D = G.D(), P = $('panel'); let h = '';
    const scEl = P.querySelector(tab === 'shop' ? '.items' : '.pbody'), sc = scEl ? scEl.scrollTop : 0;   // v0.7：铁匠铺只有商品区滚动
    if (tab === 'shop') {
      const pg = preview ? Object.assign({}, s.gear, { [preview.slot]: preview.t }) : s.gear;
      const statBox = sl => { const st = B.SLOT[sl].stat, m = D.mult[st], b0 = B.GEAR[sl][s.gear[sl] || 0].v, b1 = B.GEAR[sl][pg[sl] || 0].v, up = b1 !== b0;
        return `<div class="stat">${img(st, 'si')}<div class="sv"><b>${STAT[st]}</b><em class="t">${fv(b1 * m)}${up ? `<i class="${b1 > b0 ? 'up' : 'down'}">${b1 > b0 ? '▲' : '▼'}${fv(Math.abs(b1 - b0) * m)}</i>` : ''}</em></div><small>基础${fv(b1)}×技能${m.toFixed(m % 1 ? 2 : 0)}</small></div>`; };
      h += head('铁匠铺') + `<div class="pbody shop"><div class="dollrow"><div class="col">${statBox('weapon')}${statBox('shield')}</div><canvas id="doll" width="320" height="320"></canvas><div class="col">${statBox('helmet')}${statBox('armor')}</div></div>
        <div class="slots">${B.SLOTS.map(sl => { const g = B.GEAR[sl][pg[sl] || 0]; return `<div class="slot ${preview && preview.slot === sl ? 'pv' : ''}" data-slot="${sl}"><img src="${part(g.spr)}"></div>`; }).join('')}</div>
        <div class="bag">${B.MAT_ORDER.filter(k => s.seen[k] || s.mat[k]).map(k => `<span data-mat="${k}">${img(k)}${s.mat[k] || 0}</span>`).join('')}</div>
        <div class="tabs">${B.SLOTS.map(sl => `<button class="tab ${sl === shopTab ? 'on' : ''}" data-stab="${sl}">${B.SLOT[sl].name}${B.GEAR[sl].some((g, t) => G.canGear(sl, t)) ? '<i class="dot"></i>' : ''}</button>`).join('')}</div>
        <div class="items">${B.GEAR[shopTab].map((g, t) => {
          const own = (s.gear[shopTab] || 0) >= t, wear = (s.gear[shopTab] || 0) === t, st = B.SLOT[shopTab].stat;
          if (g.next) return `<div class="item next"><img src="${part(g.spr)}"><b>${g.name}</b><span>${STAT[st]} ${g.v}</span><small>打败红甲虫王后<br>沙岩层开放</small></div>`;
          return `<div class="item ${wear ? 'wear' : own ? 'own' : G.canGear(shopTab, t) ? 'can' : 'no'} ${preview && preview.slot === shopTab && preview.t === t ? 'pv' : ''}" data-item="${t}"><img src="${part(g.spr)}" draggable="false"><b>${g.name}</b><span>${STAT[st]} ${g.v}</span>
            ${wear ? '<small class="on">穿着</small>' : own ? '<small>已拥有</small>' : `<div class="cost">${costHtml(g.coin, g.mat)}</div>`}</div>`; }).join('')}</div></div>`;
    } else if (tab === 'skill') {
      h += head('技能屋') + `<div class="pbody tree" id="tree"><svg id="links"></svg><div id="nodes"></div></div><div class="detail" id="detail"></div>`;
    } else if (tab === 'pet') {
      h += head('宠物') + '<div class="pbody">';
      for (const k in B.PETS) { const p = B.PETS[k], own = s.pets.includes(k), v = B.VIP.find(x => x.pet === k), sg = B.SIGN.findIndex(x => x.pet === k);
        h += `<div class="card pet ${own ? '' : 'unk'}"><div class="ic kslot"><canvas width="160" height="160" data-pet="${k}"></canvas></div><div class="mid"><b>${p.name}</b><span>${p.desc}</span>${own ? '' : `<span class="src">${img('lock')}${v ? 'VIP ' + (B.VIP.indexOf(v) + 1) : '签到第 ' + (sg + 1) + ' 天'}</span>`}</div>${own ? `<button class="buy t ${s.pet === k ? 'no' : 'green'}" data-setpet="${k}">${s.pet === k ? '跟随中' : '带上'}</button>` : ''}</div>`; }
      h += '</div>';
    } else if (tab === 'codex') {
      h += head('图鉴') + `<div class="tabs"><button class="tab ${ctab === 'mon' ? 'on' : ''}" data-ctab="mon">怪物</button><button class="tab ${ctab === 'mat' ? 'on' : ''}" data-ctab="mat">材料</button></div><div class="pbody"><div class="grid">`;
      if (ctab === 'mon') for (const k of G.MON_KINDS) { const M = B.MON[k], n = s.codex[k] || 0;
        h += `<div class="cell ${n ? '' : 'unk'}"${M.mat ? ` data-mat="${M.mat}"` : ''}><div class="kslot"><canvas width="160" height="160" data-mon="${k}"></canvas></div><b>${n ? M.name : '？？？'}</b><span>${M.boss ? M.from + ' 米守卫' : (M.from || 0) + ' 米起'} · 击败 ${n}</span>${M.mat ? `<span class="drop">掉落 ${img(M.mat)}${B.MAT[M.mat].name}${M.boss ? '（首杀必掉）' : ' ' + Math.round((k === 'Slime_Green' ? D.slimeP : M.p) * 100) + '%'}</span>` : ''}</div>`; }
      else for (const k of B.MAT_ORDER) { const M = B.MAT[k], seen = s.seen[k] || s.mat[k];
        h += `<div class="cell mat ${seen ? '' : 'unk'}" data-mat="${k}"><div class="kslot"><img class="big" src="${src(k)}"></div><b>${M.name}</b><span>拥有 ${s.mat[k] || 0}</span><span class="drop">${M.src}</span></div>`; }
      h += '</div></div>';
    } else if (tab === 'vip') {   // v0.18（系统与数值 16 节）：顶部 = 当前 VIP + 进度 + 看广告（可连续看）；下面每级一张卡：领取 / 已领 / 穿上·脱下 / 拿上·收起
      const tg = B.VIP.find(v => v.ads > s.vipAds), left = G.adLeft('vip');
      h += head('VIP') + `<div class="pbody"><div class="card vipnow"><div class="ic vipi">${img('vip')}</div><div class="mid"><b>VIP ${s.vip}</b>${tg ? `<div class="prog"><i style="width:${Math.min(100, s.vipAds / tg.ads * 100)}%"></i><span class="t">${s.vipAds} / ${tg.ads}</span></div>` : ''}</div>${tg && left ? '<button class="buy t green" id="vip-ad">看广告</button>' : ''}</div>`;
      B.VIP.forEach((v, i) => { const got = i < s.vip, ready = !got && i === s.vip && s.vipAds >= v.ads;
        let btn;
        if (got && v.skin) btn = s.skin === v.skin ? `<button class="buy t lite" data-skin="">脱下</button>` : `<button class="buy t green" data-skin="${v.skin}">穿上</button>`;
        else if (got && v.staff) btn = s.staff ? '<button class="buy t lite" data-staff="0">收起</button>' : '<button class="buy t green" data-staff="1">拿上</button>';
        else if (got) btn = '<button class="buy t done">已领</button>';
        else if (ready) btn = '<button class="buy t green" data-vip="1">领取<i class="dot"></i></button>';
        else btn = `<button class="buy t no">${Math.min(s.vipAds, v.ads)}/${v.ads}</button>`;
        h += `<div class="card ${got && !v.skin && !v.staff ? 'got' : ''}" data-vipi="${i}"><div class="ic vipi">${vipIcon(v)}<b class="t">${i + 1}</b></div><div class="mid"><b>${v.name}</b><span>${vipDesc(v)}</span></div>${btn}</div>`; });
      h += '</div>';
    } else if (tab === 'sign') {
      const ready = G.signReady(), n = s.sign.n;
      h += head('7 天签到') + `<div class="pbody"><div class="days">${B.SIGN.map((d, i) => `<div class="day ${i < n ? 'got' : i === n && ready ? 'now' : ''}"><b>第 ${i + 1} 天</b>${signIcon(d)}<span>${d.text}</span>${i < n ? '<i class="ok">✓</i>' : ''}</div>`).join('')}</div>
        ${ready ? '<button class="buy t green wide" id="sign-go">领取</button>' : ''}</div>`;
    }
    P.innerHTML = mulfix(h);
    const pb = P.querySelector(tab === 'shop' ? '.items' : '.pbody'); if (pb && tab !== 'skill') pb.scrollTop = sc;
    if (tab === 'skill') renderTree();
    P.querySelectorAll('canvas[data-mon]').forEach(c => G.portrait(c, c.dataset.mon));
    P.querySelectorAll('canvas[data-pet]').forEach(c => G.petPortrait(c, c.dataset.pet));
    if (tab === 'shop') { bindDrag(); bindScrollThumb(P.querySelector('.items')); }
    else if (tab !== 'skill') bindScrollThumb(P.querySelector('.pbody'));   // v0.18：其余面板的滚动区也用棕色滑块
  }
  const signIcon = d => d.coin ? img('coin', 'si') : d.gem ? img('gem', 'si') : d.mat ? img(Object.keys(d.mat)[0], 'si') : d.pet ? `<canvas class="si pi" width="160" height="160" data-pet="${d.pet}"></canvas>` : d.boost ? img('boost', 'si') : img('chest', 'si');

  function onPanel(e) {
    const t = e.target, q = sel => t.closest(sel);
    if (q('[data-close]')) return ui.close();
    let b;
    if ((b = q('[data-stab]'))) { shopTab = b.dataset.stab; preview = null; snd('ui_tap'); render(); return; }
    if ((b = q('[data-ctab]'))) { ctab = b.dataset.ctab; snd('ui_tap'); render(); return; }
    if ((b = q('[data-mat]'))) { if (q('.item') && dragMoved) return; snd('ui_tap'); matSource(b.dataset.mat); return; }
    if ((b = q('[data-item]'))) { if (dragMoved) return; const it = +b.dataset.item, cur = S().gear[shopTab] || 0; snd('ui_tap'); preview = it === cur ? null : { slot: shopTab, t: it }; render(); return; }
    if ((b = q('[data-setpet]'))) { snd('ui_tap'); G.setPet(b.dataset.setpet); return; }
    if ((b = q('[data-vip]'))) { const v = G.claimVip(); if (v) claimVipFx(v); return; }
    if ((b = q('[data-skin]'))) { snd('ui_tap'); G.setSkin(b.dataset.skin); return; }
    if ((b = q('[data-staff]'))) { snd('ui_tap'); G.setStaff(b.dataset.staff === '1'); return; }
    if (q('#vip-ad')) { snd('ui_tap'); vipAd(); return; }
    if (q('#sign-go')) { const s = G.claimSign(); if (s) claimSignFx(s); return; }
  }

  /* ---------- 铁匠铺：拖到装备槽 = 买下穿上 ---------- */
  let dragMoved = false;
  // v0.15（用户 17:03）：商品区不显示系统滚动条；滑动时才在右边出现一根符合画风的棕色圆头滑块，停下 0.8 秒后淡出
  // v0.18：通用——box = 滚动区，滑块挂在它的定位父元素上（铁匠铺 = .pbody.shop，其余面板 = #panel）
  function bindScrollThumb(box) {
    const host = box && box.offsetParent; if (!host) return;
    const th = document.createElement('i'); th.className = 'sthumb'; host.appendChild(th); let hide = 0, armed = false; setTimeout(() => { armed = true; }, 120);   // 重画时恢复滚动位置也会触发 scroll，不算玩家在滑
    const place = () => { const H = box.clientHeight, SH = box.scrollHeight; if (SH <= H + 2) { th.classList.remove('on'); return; }
      const h = Math.max(28, H * H / SH), y = box.offsetTop + 6 + (H - 12 - h) * (box.scrollTop / (SH - H));
      th.style.height = h + 'px'; th.style.top = y + 'px'; th.style.left = (box.offsetLeft + box.offsetWidth - 9) + 'px'; };
    box.addEventListener('scroll', () => { if (!armed) return; place(); th.classList.add('on'); clearTimeout(hide); hide = setTimeout(() => th.classList.remove('on'), 800); }, { passive: true });
  }
  function bindDrag() {
    $('panel').querySelectorAll('.item[data-item]').forEach(el => el.onpointerdown = e => {
      const t = +el.dataset.item, owned = (S().gear[shopTab] || 0) >= t;
      // v0.7：只有商品区滚动。商品区放不下时：按下就快速上下划 = 滚动商品区；按住约 0.15 秒再拖（或横着拖）= 拖去装备槽
      const box = el.closest('.items'), over = box && box.scrollHeight > box.clientHeight + 2, t0 = performance.now(), st0 = box ? box.scrollTop : 0;
      dragMoved = false; const im = el.querySelector('img'), r = im.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY; let ghost = null, scrolling = false;
      const mv = ev => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (scrolling) { box.scrollTop = st0 - dy; return; }
        if (!dragMoved && Math.hypot(dx, dy) > 8 && over && (owned || (performance.now() - t0 < 150 && Math.abs(dy) > Math.abs(dx)))) { scrolling = true; dragMoved = true; box.scrollTop = st0 - dy; return; }
        if (owned) return;
        if (!dragMoved && Math.hypot(dx, dy) > 8) { dragMoved = true; ghost = im.cloneNode(); ghost.className = 'ghost'; ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px'; document.body.appendChild(ghost); const tu = $('tut'); if (tu) tu.style.display = 'none'; }
        if (ghost) { ghost.style.left = (ev.clientX - r.width / 2) + 'px'; ghost.style.top = (ev.clientY - r.height / 2) + 'px'; const s = slotAt(ev.clientX, ev.clientY); $('panel').querySelectorAll('.slot').forEach(x => x.classList.toggle('hover', x === s)); }
      };
      const upf = ev => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', upf);
        if (scrolling) { setTimeout(() => { dragMoved = false; }, 60); return; }
        if (!ghost) return; const s = slotAt(ev.clientX, ev.clientY);
        if (s && s.dataset.slot === shopTab && G.canGear(shopTab, t)) { ghost.remove(); buyFx(t); }
        else {
          if (s && s.dataset.slot === shopTab) { snd('ui_close'); el.classList.add('shake'); el.querySelectorAll('.lack').forEach(x => x.classList.add('flash')); ui.toast(missText(shopTab, t), 2200); setTimeout(() => el.classList.remove('shake'), 450); }
          else if (s) { snd('ui_close'); ui.toast('要拖到「' + B.SLOT[shopTab].name + '」槽'); }
          ghost.style.transition = 'left .22s, top .22s, opacity .22s'; ghost.style.left = r.left + 'px'; ghost.style.top = r.top + 'px'; ghost.style.opacity = '0'; const g = ghost; setTimeout(() => g.remove(), 240);
          $('panel').querySelectorAll('.slot').forEach(x => x.classList.remove('hover')); const tu = $('tut'); if (tu) tu.style.display = '';
        }
        setTimeout(() => { dragMoved = false; }, 60);
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', upf);
    });
  }
  const slotAt = (x, y) => [...$('panel').querySelectorAll('.slot[data-slot]')].find(s => { const r = s.getBoundingClientRect(); return x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 10 && y <= r.bottom + 10; });
  function missText(sl, t) { const g = B.GEAR[sl][t], s = S(), m = []; if (s.coin < g.coin) m.push('金币还差 ' + f(g.coin - s.coin)); for (const k in g.mat || {}) if ((s.mat[k] || 0) < g.mat[k]) m.push(B.MAT[k].name + '还差 ' + (g.mat[k] - (s.mat[k] || 0))); return '买不了：' + m.join('，'); }
  function buyFx(t) {
    const coin0 = S().coin; G.buyGear(shopTab, t); preview = null; S().tut.drag = 1; G.save(); const tut = $('tut'); if (tut) tut.remove();
    render(); const sl = $('panel').querySelector(`.slot[data-slot="${shopTab}"]`);
    if (sl) { sl.classList.add('bought'); const st = document.createElement('i'); st.className = 'burst'; sl.appendChild(st); }
    countDown($('h-coin'), coin0, S().coin, 'spend');
    G.dollPlay('Victory'); ui.toast('买下并穿上：' + B.GEAR[shopTab][t].name);
  }
  function countDown(el, a, b, cls) { counting++; const t0 = performance.now(); el.parentNode.classList.add(cls || 'gainp'); const step = now => { const k = Math.min(1, (now - t0) / 550); el.textContent = f(a + (b - a) * k); if (k < 1) requestAnimationFrame(step); else { el.parentNode.classList.remove(cls || 'gainp'); counting--; cache[el.id] = null; } }; requestAnimationFrame(step); }
  function tutDrag() {   // 第一次进铁匠铺：闪烁箭头教“拖到装备槽”
    if (tab !== 'shop' || S().tut.drag || $('tut')) return;
    const it = $('panel').querySelector('.item.can') || $('panel').querySelector('.item.no'), sl = $('panel').querySelector(`.slot[data-slot="${shopTab}"]`); if (!it || !sl) return;
    const a = it.querySelector('img').getBoundingClientRect(), b = sl.getBoundingClientRect(), w = $('wrap').getBoundingClientRect();
    const d = document.createElement('div'); d.id = 'tut'; d.innerHTML = `<i class="hand"></i>`;
    d.style.left = (a.left + a.width / 2 - w.left) + 'px'; d.style.top = (a.top + a.height / 2 - w.top) + 'px';
    d.style.setProperty('--dx', (b.left + b.width / 2 - a.left - a.width / 2) + 'px'); d.style.setProperty('--dy', (b.top + b.height / 2 - a.top - a.height / 2) + 'px');
    $('wrap').appendChild(d);
  }

  /* ---------- 技能屋：网状技能树 ---------- */
  // 节点间距（rem）：v0.18 修复——原来横竖都是 3.12，菱形上下左右顶角相碰，级数角标（挂在菱形下角）被正下方的节点盖住。
  // 竖向拉开到下方节点顶角离角标底边 ≥ .3rem，横向只放宽到左右顶角不相碰（再宽 7 列在 390 宽屏放不下）（tools/test/petsk.js 查角标不被遮挡）
  const NGX = 3.2, NGY = 3.96;
  function renderTree() {
    const s = S(), box = $('tree'), N = $('nodes'), L = $('links'); if (!box) return;
    const seen = B.SK.filter(n => B.skSeen(s, n));
    let h = '', lines = '';
    const xy = n => [n.x * NGX, n.y * NGY];
    for (const n of seen) for (const [rid] of n.req || []) { const p = B.SKI[rid]; if (!seen.includes(p)) continue; const [x1, y1] = xy(p), [x2, y2] = xy(n), on = G.skLv(rid) >= 1;   /* 用户 17:49：前置点了 1 级就算满足 */   // v0.10：前置满足 = 实线（分支色），没满足 = 虚线
      const R = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;   // v0.10：SVG 属性不认 rem，连线一直没画出来 → 换算成 px
      lines += `<line x1="${x1 * R}" y1="${y1 * R}" x2="${x2 * R}" y2="${y2 * R}" class="${on ? 'on' : ''}" style="${on ? 'stroke:' + B.BR_COL[n.br] : ''}"/>`; }
    for (const n of seen) { const l = G.skLv(n.id), open = B.skOpen(s, n), can = G.canSkill(n.id), [x, y] = xy(n);
      h += `<button class="sk ${n.mech ? 'mech' : ''} ${l >= n.max ? 'max' : ''} ${open ? '' : 'lock'} ${can ? 'can' : ''} ${l ? 'got' : ''} ${sel === n.id ? 'sel' : ''}" data-sk="${n.id}" style="left:${x}rem;top:${y}rem;--c:${B.BR_COL[n.br]}"><i></i><img src="assets/sk/${n.ic}.png" draggable="false">${n.max > 1 ? `<u class="t">${l}/${n.max}</u>` : ''}${can ? '<b class="dot"></b>' : ''}</button>`; }
    N.innerHTML = h; L.innerHTML = lines;
    // v0.18 宠物分支：拖动范围按露出来的节点算（宠物分支在上下两头，固定的 ±260 拖不到），至少保留原来的范围
    const RR = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16, xs = seen.map(n => n.x), ys = seen.map(n => n.y), ux = NGX * RR, uy = NGY * RR;
    // 原点（节点 0,0）在框里的位置：取节点层当前位置减掉当前平移；可拖到最外圈节点离框边 ≥ 1 个格距
    const bb = box.getBoundingClientRect(), nb = N.getBoundingClientRect(), ox = nb.left - bb.left - treePan.x, oy = nb.top - bb.top - treePan.y, m = ux * 0.9;
    const cx = v => Math.max(Math.min(-260, box.clientWidth - m - ox - Math.max(...xs) * ux), Math.min(Math.max(260, m - ox - Math.min(...xs) * ux), v));
    const cy = v => Math.max(Math.min(-220, box.clientHeight - m - oy - Math.max(...ys) * uy), Math.min(Math.max(260, m - oy - Math.min(...ys) * uy), v));
    if (fitTree) {   // v0.18：打开技能屋时把露出来的节点整体居中（节点多了以后左右会出屏）
      fitTree = false;
      treePan.x = cx(-(Math.min(...xs) + Math.max(...xs)) / 2 * ux);
      treePan.y = cy(-(Math.min(...ys) + Math.max(...ys)) / 2 * uy + box.clientHeight * 0.08);
    }
    const apply = () => { const tr = `translate(${treePan.x}px, ${treePan.y}px)`; N.style.transform = L.style.transform = tr; };
    apply();
    let pd = null;
    box.onpointerdown = e => { pd = { x: e.clientX, y: e.clientY, px: treePan.x, py: treePan.y, m: false }; };
    box.onpointermove = e => { if (!pd) return; const dx = e.clientX - pd.x, dy = e.clientY - pd.y; if (Math.hypot(dx, dy) > 6) pd.m = true; if (pd.m) { treePan.x = cx(pd.px + dx); treePan.y = cy(pd.py + dy); apply(); } };
    box.onpointerup = e => { const m = pd && pd.m; pd = null; if (m) return; const b = e.target.closest('[data-sk]'); if (b) { sel = b.dataset.sk; snd('ui_tap'); renderTree(); } };
    renderDetail();
  }
  function renderDetail() {
    const n = B.SKI[sel], s = S(), l = G.skLv(n.id), open = B.skOpen(s, n), mx = l >= n.max, c = G.skCost(n.id);
    let req = ''; if (!open) req = (n.req || []).filter(([id]) => G.skLv(id) < 1).map(([id]) => B.SKI[id].name).concat(n.boss && !s.boss ? ['打败红甲虫王'] : []).join('、');
    // v0.10（用户 16:48）：固定 3 行 = 名字 + 级数 / 效果（最多 2 行）；不写“机制”、不写“现在 ×”、不重复“下一级”、前置条件交给连线（没满足 = 虚线）
    $('detail').innerHTML = mulfix(`<div class="dcard" style="--c:${B.BR_COL[n.br]}"><img src="assets/sk/${n.ic}.png"><div class="mid"><b>${n.name}${n.max > 1 ? `<small>　${l} / ${n.max}</small>` : ''}</b><span>${n.desc(l)}</span></div>
      ${n.id === 'root' ? '' : mx ? '<button class="buy t done">已满</button>' : `<button class="buy t ${G.canSkill(n.id) ? 'green' : 'no'}" id="sk-buy">${img(c.cur)}${f(c.n)}${c.gem ? '<br>' + img('gem') + f(c.gem) : ''}${c.mat ? '<em class="skm">' + Object.keys(c.mat).map(k => `<span class="m ${(s.mat[k] || 0) >= c.mat[k] ? 'ok' : 'lack'}" data-mat="${k}">${img(k)}${c.mat[k]}</span>`).join('') + '</em>' : ''}</button>`}</div>`);
    const b = $('sk-buy'); if (b) b.onclick = e => { if (e.target.closest('[data-mat]')) return; /* v0.18：点材料 = 弹“去哪拿”（onPanel 处理），不买 */ if (G.buySkill(n.id)) { renderTree(); const el = $('nodes').querySelector(`[data-sk="${n.id}"]`); if (el) el.classList.add('pulse'); } else { snd('ui_close'); ui.toast(!open ? '还没解锁：' + req : s[c.cur] < c.n ? (c.cur === 'gem' ? '宝石' : '金币') + '还差 ' + f(Math.max(0, c.n - s[c.cur])) : c.gem && s.gem < c.gem ? '宝石还差 ' + f(c.gem - s.gem) : '材料不够：' + Object.keys(c.mat || {}).filter(k => (s.mat[k] || 0) < c.mat[k]).map(k => B.MAT[k].name + ' 还差 ' + (c.mat[k] - (s.mat[k] || 0))).join('、')); } };
  }

  /* ---------- 材料“去哪拿” ---------- */
  function matSource(k) {
    const M = B.MAT[k], s = S();
    const p = pop(`<div class="box src"><h2 class="t">${M.name}</h2><div class="kboard in"><div class="row"><div class="kslot"><img class="mi" src="${src(k)}"></div>${M.mon ? `<div class="kslot"><canvas width="150" height="150" data-mon="${M.mon}"></canvas></div>` : ''}</div><p>拥有 <b>${s.mat[k] || 0}</b></p><p class="where">${M.src}</p><div class="btns">${G.supplyOk(k) ? `<button class="buy t green" id="src-ad">看广告<small>${M.name} +1</small></button>` : ''}<button class="buy t lite" id="src-ok">知道了</button></div></div></div>`, true);
    const c = p.querySelector('canvas'); if (c) G.portrait(c, c.dataset.mon);
    p.querySelector('#src-ok').onclick = () => { snd('ui_close'); unpop(); };
    const sa = p.querySelector('#src-ad'); if (sa) sa.onclick = () => G.supply(k, () => claimFx([{ k, n: 1 }], '缺料补给'));   // 缺料补给：配方正好差 1 个时，看广告补 1 个（每天 2 次）
  }

  /* ---------- 弹窗 ---------- */
  // v0.18 修复：弹窗是一个共用的 #pop。每次打开 / 关闭都换序号并清掉上一个弹窗挂在 #pop 上的 onclick——
  // 原来领取框的“点任意处收下”回调会留在 #pop 上，被下一个弹窗（或 400ms 后才挂上的定时器）误触发，关掉新弹窗、找不到旧卡片报错
  let popSeq = 0;
  const pop = (h, quiet) => { const p = $('pop'); popSeq++; p.onclick = null; p.innerHTML = mulfix(h); p.classList.add('on'); if (!quiet) snd('ui_open'); return p; };
  const unpop = () => { popSeq++; const p = $('pop'); p.onclick = null; p.classList.remove('on'); };
  const popOn = () => $('pop').classList.contains('on');
  const gainRow = (coin, gem, mat, lost) => `<div class="gain t"><div>${img('coin')}${f(coin)}${lost ? `<s>丢失 ${f(lost.coin)}</s>` : ''}</div><div>${img('gem')}${f(gem)}${lost ? `<s>丢失 ${f(lost.gem)}</s>` : ''}</div></div>
    ${Object.keys(mat).length ? `<div class="gmat t">${Object.entries(mat).map(([k, n]) => `<span>${img(k)}×${n}</span>`).join('')}</div>` : ''}`;
  ui.result = (R, why) => {
    const s = S(), dead = why === 'dead', k = dead ? G.keepK() : 1, bst = s.boost > 0 ? 2 : 1;
    const mat = {}; for (const id in R.mat) mat[id] = Math.max(R.mat[id] > 0 && k >= 0.7 ? 1 : 0, Math.floor(R.mat[id] * k * (id === 'amber' ? 1 : bst)));
    const p = pop(`<div class="box"><h2 class="t">${dead ? '被打倒了' : why === 'stam' ? '体力耗尽，安全返回' : '回到地面'}</h2><div class="kboard in"><p>到达 ${R.deep} 米　击败 ${R.kills} 只怪${R.ate ? '　吃了 ' + R.ate + ' 个食物' : ''}</p>
      ${gainRow(R.coin * k * bst, R.gem * k * bst, mat, dead && k < 1 ? { coin: R.coin * (1 - k), gem: R.gem * (1 - k) } : null)}
      ${bst > 1 ? `<p class="bst">收益 ×2${s.boost > 1 ? ' · 还剩 ' + (s.boost - 1) + ' 趟' : ''}</p>` : ''}
      <div class="btns">${G.adLeft('double') ? '<button class="buy t green" id="r-ad">看广告<small>收获 ×2</small></button>' : ''}<button class="buy t lite" id="r-ok">收下</button></div></div></div>`);   // 结算双倍：每天 5 次，用完按钮就不出现
    const ok = () => { snd('ui_tap'); unpop(); G.collect(1, false); };
    p.querySelector('#r-ok').onclick = ok;
    const ad = p.querySelector('#r-ad'); if (ad) ad.onclick = () => G.watchAd('double', () => { unpop(); G.collect(2); });
    if (G.looping()) setTimeout(() => { if ($('pop').classList.contains('on') && p.querySelector('#r-ok')) ok(); }, 3000);
  };
  ui.revive = () => {
    const p = pop(`<div class="box"><h2 class="t">血量归零</h2><div class="kboard in"><p>原地复活：血量回满</p><div class="btns"><button class="buy t green" id="v-ad">看广告复活</button><button class="buy t lite" id="v-no">不用了</button></div></div></div>`);
    p.querySelector('#v-ad').onclick = () => G.watchAd('revive', () => { unpop(); G.revive(); });
    p.querySelector('#v-no').onclick = () => { snd('ui_close'); unpop(); G.giveUp(); };
    if (G.looping()) setTimeout(() => { if ($('pop').classList.contains('on') && p.querySelector('#v-no')) p.querySelector('#v-no').click(); }, 3000);   // 挂机循环：3 秒没操作就不复活，照常结算
  };
  ui.offline = o => {
    const p = pop(`<div class="box"><h2 class="t">${(B.PETS[o.pet] || { name: '宠物' }).name}带回了收获</h2><div class="kboard in"><p>离线 ${o.h.toFixed(1)} 小时</p>${gainRow(o.coin, o.gem, {})}
      <div class="btns">${G.adLeft('offline') ? '<button class="buy t green" id="o-ad">看广告<small>收获 ×2</small></button>' : ''}<button class="buy t lite" id="o-ok">收下</button></div></div></div>`);
    const take = m => { unpop(); S().coin += o.coin * m; S().gem += o.gem * m; claimFx([{ k: 'coin', n: o.coin * m }, { k: 'gem', n: o.gem * m }], '离线收获'); };
    p.querySelector('#o-ok').onclick = () => take(1); const oa = p.querySelector('#o-ad'); if (oa) oa.onclick = () => G.watchAd('offline', () => take(2));
  };
  ui.ad = done => {   // 测试版：没接广告 SDK，用 1.5 秒进度条代替
    const p = pop(`<div class="box adbox"><h2 class="t">广告</h2><div class="kboard in"><div class="prog"><i style="width:0%;transition:width 1.5s linear"></i></div></div></div>`, true);
    requestAnimationFrame(() => requestAnimationFrame(() => { p.querySelector('i').style.width = '100%'; }));
    setTimeout(() => { unpop(); done(); }, window.__FASTAD ? 30 : 1550);
  };

  /* ---------- 领取动画：弹出卡片（光芒旋转、图标逐个弹出），点一下收起，金币宝石飞向顶部 ---------- */
  function claimFx(items, title, onDone) {
    snd('claim', 0.9);
    const p = pop(`<div class="claim"><h2 class="t">${title}</h2><div class="rays"></div><div class="its">${items.map((it, i) => `<div class="ci" style="animation-delay:${0.1 + i * 0.12}s">${it.canvas ? `<canvas width="220" height="220" data-cpet="${it.canvas}"></canvas>` : it.part ? `<img src="${part(it.part)}">` : img(it.k)}<b class="t">${it.n !== undefined ? (typeof it.n === 'number' ? '×' + f(it.n) : it.n) : ''}</b></div>`).join('')}</div><p class="t tapon">点任意处收下</p></div>`, true);
    p.querySelectorAll('canvas[data-cpet]').forEach(c => G.petPortrait(c, c.dataset.cpet));
    const my = popSeq;   // 这个领取框的序号：弹窗被替换 / 关掉后，旧回调一律不执行
    const close = () => {
      if (my !== popSeq || !popOn()) return;
      const from = [...p.querySelectorAll('.ci')].map(e => e.getBoundingClientRect());
      unpop(); snd('ui_close');
      items.forEach((it, i) => { const to = $(it.k === 'coin' ? 'h-coin' : 'h-gem'); if ((it.k === 'coin' || it.k === 'gem') && from[i] && to) fly(src(it.k), from[i], to.parentNode, 4); });
      G.refresh(); onDone && onDone();
    };
    setTimeout(() => { if (my === popSeq) p.onclick = close; }, 400);
  }
  ui.claimFx = claimFx;
  /* ---------- VIP：图标、说明、连续看广告、领取动画 ---------- */
  const vipIcon = v => v.pet ? `<canvas width="160" height="160" data-pet="${v.pet}"></canvas>` : v.skin ? `<img src="${part(B.SKIN[v.skin].Helmet)}">` : v.staff ? `<img src="${part(B.STAFF.spr)}">` : img(v.loop ? 'off' : 'auto');
  const vipDesc = v => v.pet ? B.PETS[v.pet].desc : v.skin ? '整套外观，属性不变' : v.text;
  // 连续看：看完一个自动问下一个——3 秒后自动接着看，玩家点“停下”就停
  let streakT = 0;
  function vipAd() { if (!G.adLeft('vip') || !B.VIP.find(v => v.ads > S().vipAds)) return; G.watchAd('vip', vipNext); }
  function vipNext() {
    const s = S(), nx = B.VIP[s.vip], tg = B.VIP.find(v => v.ads > s.vipAds); clearInterval(streakT);
    if (!tg || !G.adLeft('vip')) { if (nx && s.vipAds >= nx.ads) ui.toast('VIP ' + (s.vip + 1) + ' 可领取'); return; }
    const title = nx && s.vipAds >= nx.ads ? 'VIP ' + (s.vip + 1) + ' 可领取' : 'VIP 进度 +1';
    const p = pop(`<div class="box vipstreak"><h2 class="t">${title}</h2><div class="kboard in"><div class="prog"><i style="width:${Math.min(100, s.vipAds / tg.ads * 100)}%"></i><span class="t">${s.vipAds} / ${tg.ads}</span></div>
      <div class="btns"><button class="buy t green" id="vs-go">继续看 3</button><button class="buy t lite" id="vs-stop">停下</button></div></div></div>`, true);
    let n = 3; const cd = p.querySelector('#vs-go');
    const go = () => { clearInterval(streakT); unpop(); vipAd(); };
    streakT = setInterval(() => { if (!p.querySelector('#vs-go') || !$('pop').classList.contains('on')) { clearInterval(streakT); return; } n--; if (n <= 0) go(); else cd.textContent = '继续看 ' + n; }, 1000);
    p.querySelector('#vs-go').onclick = () => { snd('ui_tap'); go(); };
    p.querySelector('#vs-stop').onclick = () => { clearInterval(streakT); snd('ui_close'); unpop(); };
  }
  ui.vipNext = vipNext;
  function claimVipFx(v) {
    const t = 'VIP ' + S().vip + ' 奖励';
    if (v.pet) claimFx([{ canvas: v.pet, n: B.PETS[v.pet].name }], t, () => ui.toast(B.PETS[v.pet].name + ' 已跟随你'));
    else if (v.skin) claimFx([{ part: B.SKIN[v.skin].Helmet }, { part: B.SKIN[v.skin].Chest }], t + '：' + v.name);
    else if (v.staff) claimFx([{ part: B.STAFF.spr, n: v.name }], t);
    else claimFx([{ k: v.loop ? 'off' : 'auto', n: v.name }], t);
  }
  function claimSignFx(d) {
    const it = []; if (d.coin) it.push({ k: 'coin', n: d.coin }); if (d.gem) it.push({ k: 'gem', n: d.gem }); if (d.mat) for (const k in d.mat) it.push({ k, n: d.mat[k] });
    if (d.pet) it.push({ canvas: d.pet, n: B.PETS[d.pet].name }); if (d.boost) it.push({ k: 'boost', n: '收益 ×2（' + d.boost + ' 趟）' });
    if (d.gear) { const g = B.GEAR[d.gotSlot][3]; it.push({ part: g.spr, n: g.name }); }
    claimFx(it, '签到第 ' + S().sign.n + ' 天');
  }
  function fly(srcImg, from, to, n) {
    const w = $('wrap').getBoundingClientRect(), t = to.getBoundingClientRect();
    for (let i = 0; i < n; i++) { const e = document.createElement('img'); e.src = srcImg; e.className = 'flyer'; e.style.left = (from.left + from.width / 2 - w.left) + 'px'; e.style.top = (from.top + from.height / 2 - w.top) + 'px'; $('wrap').appendChild(e);
      setTimeout(() => { e.style.transform = `translate(${t.left + 18 - from.left - from.width / 2}px, ${t.top + t.height / 2 - from.top - from.height / 2}px) scale(.6)`; e.style.opacity = '0.3'; }, 30 + i * 70);
      setTimeout(() => { e.remove(); if (i === 0) { to.classList.add('pulse'); setTimeout(() => to.classList.remove('pulse'), 300); } }, 650 + i * 70); }
  }
  // 回到地面：收获从主角头顶飞到顶部计数（数字滚动），材料在头顶冒出来
  function flyGain(g) {
    const h = G.heroScreen(), w = $('wrap').getBoundingClientRect(), from = { left: w.left + h.x - 10, top: w.top + h.y - 10, width: 20, height: 20 };
    const s = S(), c1 = s.coin, c0 = c1 - g.coin, g1 = s.gem, g0 = g1 - g.gem;
    counting++; $('h-coin').textContent = f(c0); $('h-gem').textContent = f(g0);
    setTimeout(() => {
      counting--;
      if (g.coin) { fly(src('coin'), from, $('h-coin').parentNode, 5); setTimeout(() => countDown($('h-coin'), c0, c1), 450); } else cache['h-coin'] = null;
      if (g.gem) { fly(src('gem'), from, $('h-gem').parentNode, 3); setTimeout(() => countDown($('h-gem'), g0, g1), 450); } else cache['h-gem'] = null;
      let i = 0; for (const k in g.mat) { if (!g.mat[k]) continue; const e = document.createElement('div'); e.className = 'matpop t'; e.innerHTML = `${img(k)}+${g.mat[k]}`; e.style.left = h.x + 'px'; e.style.top = (h.y - 16 - i * 30) + 'px'; e.style.animationDelay = (i * 0.12) + 's'; $('wrap').appendChild(e); setTimeout(() => e.remove(), 1900 + i * 120); i++; }
      if (g.coin || g.gem) G.sfx.play('pickup_coin', 0.5);
    }, 120);
  }

  let tt = 0;
  ui.toast = (s, ms) => { const t = $('toast'); t.textContent = s; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), ms || 1600); };
  let bt = 0;
  ui.banner = (a, b) => { const e = $('banner'); e.innerHTML = `<b class="t">${a}</b><span class="t">${b}</span>`; e.classList.add('on'); clearTimeout(bt); bt = setTimeout(() => e.classList.remove('on'), 2600); };
})();
