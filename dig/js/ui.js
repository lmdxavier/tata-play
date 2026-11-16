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
      <div class="bars" id="h-bars"><div class="bar" id="b-st">${img('stam')}<i></i><span class="t"></span></div><div class="bar hp" id="b-hp">${img('hp')}<i></i><span class="t"></span></div></div>
      <button id="back" class="t">回地面</button><button id="auto" class="t">${img('auto')}<span>自动</span></button><div id="bossbar"><b class="t"></b><div class="bar"><i></i><span class="t"></span></div></div>`;
    $('wrap').appendChild($('auto'));
    $('back').onclick = () => { snd('ui_tap'); G.endRun('back'); };
    $('auto').onclick = () => {
      if (S().vip < 2) { snd('ui_tap'); ui.toast('自动模式：VIP 2 解锁（累计看 3 次广告）'); return; }
      G.toggleAuto(); snd('ui_tap'); ui.toast(S().auto ? '自动模式：按一下方向，就一直往那边挖' : '自动模式已关闭');
    };
    $('shore').innerHTML = `<div class="side l">${sideBtn('vip', 'VIP')}${sideBtn('sign', '签到')}${sideBtn('codex', '图鉴')}</div>
      <div class="side r">${sideBtn('chest', '宝箱')}${sideBtn('pet', '宠物')}</div>
      <div class="tag t" id="tag-smithy">铁匠铺<small>装备</small><i class="dot"></i></div><div class="tag t" id="tag-house">技能屋<small>技能树</small><i class="dot"></i></div>
      <button id="go" class="t">下矿</button><div id="loop" class="t">挂机中 · 点这里停止</div>`;
    $('go').onclick = () => { snd('ui_tap'); G.dive(); };
    $('shore').querySelectorAll('.side button').forEach(b => b.onclick = () => {
      const k = b.dataset.k; if (k === 'chest') { if (G.chestReady()) G.openAdChest(); else { snd('ui_tap'); ui.toast(G.adLeft('chest') ? '宝箱还在准备：' + chestLeft() : '今天的广告宝箱领完了，明天再来'); } return; }
      ui.open(k);
    });
    $('tag-smithy').onclick = () => G.goto('smithy'); $('tag-house').onclick = () => G.goto('house');
    $('loop').onclick = () => { S().loop = false; G.save(); ui.refresh(); };
    $('panel').addEventListener('click', onPanel);
  };
  const sideBtn = (k, n) => `<button data-k="${k}" class="t">${img(k)}<span>${n}</span><i class="dot"></i><u></u></button>`;
  const chestLeft = () => { const ms = Math.max(0, 4 * 3600e3 - (Date.now() - (S().chestT || 0))); const h = Math.floor(ms / 3600e3), m = Math.ceil((ms % 3600e3) / 60e3); return h ? h + ' 小时 ' + m + ' 分' : m + ' 分钟'; };

  /* ---------- 每帧：顶部、名牌位置 ---------- */
  const cache = {};
  const set = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } };
  const bar = (id, v, max) => { const k = id + Math.round(v / max * 200) + '|' + Math.ceil(v); if (cache[id + 'b'] === k) return; cache[id + 'b'] = k; const e = $(id); e.querySelector('i').style.width = Math.max(0, Math.min(100, v / max * 100)) + '%'; e.querySelector('span').textContent = f(Math.ceil(v)) + ' / ' + f(Math.ceil(max)); e.classList.toggle('low', v / max < 0.25); };
  let counting = 0;
  ui.hud = (R, mode, hero, D, dt) => {
    const run = mode === 'run', s = S();
    const lg = mode === 'rise' && G.lastGain ? G.lastGain : null;
    if (!counting) { set('h-coin', f(s.coin - (lg ? lg.coin : 0))); set('h-gem', f(s.gem - (lg ? lg.gem : 0))); }
    set('h-rc', run && R && R.coin >= 1 ? '+' + f(R.coin) : ''); set('h-rg', run && R && R.gem >= 1 ? '+' + f(R.gem) : '');
    const bst = s.boost > 0 ? '收益×2 剩 ' + s.boost + ' 趟' : ''; if (cache.bst !== bst) { cache.bst = bst; $('h-boost').style.display = bst ? '' : 'none'; $('h-boost').querySelector('span').textContent = bst; }
    if (cache.run !== run) { cache.run = run; $('h-bars').style.display = $('back').style.display = $('auto').style.display = run ? '' : 'none'; if (!run) $('bossbar').style.display = 'none'; }
    if (run && R) {
      set('h-depth', Math.max(0, hero.r + 1) + ' 米'); bar('b-st', R.st, R.stMax); bar('b-hp', R.hp, R.hpMax);
      const a = s.vip >= 2 ? (s.auto ? 'on' : 'off') : 'lock'; if (cache.auto !== a) { cache.auto = a; $('auto').className = 't ' + a; }
      const boss = R.mons.find(m => m.boss && !m.dead && Math.abs(m.r - hero.r) <= 3), bb = $('bossbar');
      if (!!boss !== !!cache.boss) { cache.boss = !!boss; bb.style.display = boss ? 'block' : 'none'; if (boss) bb.querySelector('b').textContent = '守卫 ' + G.MON_NAME[boss.kind]; }
      if (boss) { const k = Math.round(boss.hp / boss.max * 300); if (cache.bossk !== k) { cache.bossk = k; bb.querySelector('i').style.width = Math.max(0, boss.hp / boss.max * 100) + '%'; bb.querySelector('span').textContent = f(Math.max(0, Math.ceil(boss.hp))) + ' / ' + f(boss.max); } }
      if (!s.tut.move && R.blocks >= 2) { s.tut.move = 1; const t = $('tip'); if (t) t.remove(); }
    } else set('h-depth', s.best ? '最深 ' + s.best + ' 米' : '');
    if (mode === 'shore') {   // 建筑名牌跟着镜头（世界格 → CSS 像素）
      const st = G.state(), k = $('cv').clientWidth / st.VW, T = st.T * k, ox = ($('cv').clientWidth - 7 * T) / 2;
      const pos = (id, x, y) => { $(id).style.transform = `translate(${Math.round(ox + x * T)}px, ${Math.round((y * st.T - st.camY) * k)}px) translate(-50%, -100%)`; };
      pos('tag-smithy', 1.42, -3.62); pos('tag-house', 5.84, -7.15);
    }
    if (tab === 'shop' && $('doll')) G.drawDoll($('doll'), preview ? Object.assign({}, s.gear, { [preview.slot]: preview.t }) : s.gear, null, dt);
  };
  ui.showRun = () => { $('shore').style.display = 'none'; ui.close(true); if (!S().tut.move && !$('tip')) { const d = document.createElement('div'); d.id = 'tip'; d.className = 't'; d.textContent = '按住屏幕拖动：往哪走，就往哪挖'; $('wrap').appendChild(d); } };
  ui.hideRun = () => { $('bossbar').style.display = 'none'; cache.boss = false; };
  ui.hideShore = () => { $('shore').style.display = 'none'; ui.close(true); };
  ui.showShore = (gain) => { $('shore').style.display = ''; const t = $('tip'); if (t) t.remove(); ui.refresh(); if (gain) flyGain(gain); };
  ui.refresh = () => {
    const s = S();
    const canShop = B.SLOTS.some(sl => B.GEAR[sl].some((g, t) => G.canGear(sl, t))), canSk = B.SK.some(n => B.skSeen(s, n) && G.canSkill(n.id));
    $('tag-smithy').classList.toggle('red', canShop); $('tag-house').classList.toggle('red', canSk);
    sideDot('vip', G.vipReady() > 0 || !!s.giftPending, s.vip < B.VIP.length ? `${s.ads}/${B.VIP[s.vip].ads}` : '满');
    sideDot('sign', G.signReady(), G.signReady() ? '可领' : ''); sideDot('codex', false, ''); sideDot('pet', false, '');
    sideDot('chest', G.chestReady(), G.chestReady() ? '看广告' : G.adLeft('chest') ? chestShort() : '明天');
    $('shore').querySelector('[data-k="vip"] span').textContent = 'VIP ' + s.vip;
    $('loop').style.display = s.loop && s.auto ? '' : 'none';
    if (tab) render();
  };
  const chestShort = () => { const ms = Math.max(0, 4 * 3600e3 - (Date.now() - (S().chestT || 0))); const h = Math.floor(ms / 3600e3), m = Math.ceil((ms % 3600e3) / 60e3); return h ? h + '时' + m + '分' : m + '分'; };
  function sideDot(k, on, txt) { const b = $('shore').querySelector(`[data-k="${k}"]`); b.querySelector('.dot').style.display = on ? '' : 'none'; const u = b.querySelector('u'); u.textContent = txt || ''; u.style.display = txt ? '' : 'none'; }

  /* ---------- 面板 ---------- */
  let preview = null, sel = 'root', ctab = 'mon', shopTab = 'weapon', treePan = { x: 0, y: 0 };
  ui.open = k => { tab = k; preview = null; snd('ui_open'); $('panel').classList.add('on'); render(); if (k === 'shop' && !S().tut.drag) setTimeout(tutDrag, 450); };
  ui.close = quiet => { if (!tab) return; tab = null; preview = null; const t = $('tut'); if (t) t.remove(); $('panel').classList.remove('on'); if (!quiet) { snd('ui_close'); G.exitDoor(); } };
  ui.tab = () => tab;
  const mulfix = h => h.replace(/×/g, '<i class="mul">×</i>');
  const head = t => `<div class="phead"><h2 class="t">${t}</h2><button class="close" data-close="1">${img('close')}</button></div>`;
  const costHtml = (coin, mat) => {
    const s = S(); let h = `<span class="${s.coin >= coin ? '' : 'lack'}">${img('coin')}${f(coin)}</span>`;
    for (const k in mat || {}) h += `<span class="m ${(s.mat[k] || 0) >= mat[k] ? 'ok' : 'lack'}" data-mat="${k}">${img(k)}${mat[k]}</span>`;
    return h;
  };
  function render() {
    const s = S(), D = G.D(), P = $('panel'); let h = '';
    const sc = P.querySelector('.pbody') ? P.querySelector('.pbody').scrollTop : 0;
    if (tab === 'shop') {
      const pg = preview ? Object.assign({}, s.gear, { [preview.slot]: preview.t }) : s.gear;
      const statBox = sl => { const st = B.SLOT[sl].stat, m = D.mult[st], b0 = B.GEAR[sl][s.gear[sl] || 0].v, b1 = B.GEAR[sl][pg[sl] || 0].v, up = b1 !== b0;
        return `<div class="stat"><b>${img(st)}${STAT[st]}</b><em class="t">${fv(b1 * m)}${up ? `<i class="${b1 > b0 ? 'up' : 'down'}">${b1 > b0 ? '▲' : '▼'}${fv(Math.abs(b1 - b0) * m)}</i>` : ''}</em><small>基础 ${fv(b1)} × 技能 ${m.toFixed(m % 1 ? 2 : 0)}</small></div>`; };
      h += head('铁匠铺') + `<div class="pbody shop"><div class="dollrow"><div class="col">${statBox('weapon')}${statBox('shield')}</div><canvas id="doll" width="320" height="320"></canvas><div class="col">${statBox('helmet')}${statBox('armor')}</div></div>
        <div class="slots">${B.SLOTS.map(sl => { const g = B.GEAR[sl][pg[sl] || 0]; return `<div class="slot ${preview && preview.slot === sl ? 'pv' : ''}" data-slot="${sl}"><img src="${part(g.spr)}"><small>${B.SLOT[sl].name}</small></div>`; }).join('')}</div>
        <div class="bag">${B.MAT_ORDER.filter(k => s.seen[k] || s.mat[k]).map(k => `<span data-mat="${k}">${img(k)}${s.mat[k] || 0}</span>`).join('') || '<em>材料：挖树根和铜矿、收蜘蛛网、打怪掉落</em>'}</div>
        <div class="tabs">${B.SLOTS.map(sl => `<button class="tab ${sl === shopTab ? 'on' : ''}" data-stab="${sl}">${B.SLOT[sl].name}${B.GEAR[sl].some((g, t) => G.canGear(sl, t)) ? '<i class="dot"></i>' : ''}</button>`).join('')}</div>
        <div class="items">${B.GEAR[shopTab].map((g, t) => {
          const own = (s.gear[shopTab] || 0) >= t, wear = (s.gear[shopTab] || 0) === t, st = B.SLOT[shopTab].stat;
          if (g.next) return `<div class="item next"><img src="${part(g.spr)}"><b>${g.name}</b><span>${STAT[st]} ${g.v}</span><small>打败红甲虫王后<br>沙岩层开放</small></div>`;
          return `<div class="item ${wear ? 'wear' : own ? 'own' : G.canGear(shopTab, t) ? 'can' : 'no'} ${preview && preview.slot === shopTab && preview.t === t ? 'pv' : ''}" data-item="${t}"><img src="${part(g.spr)}" draggable="false"><b>${g.name}</b><span>${STAT[st]} ${g.v}</span>
            ${wear ? '<small class="on">穿着</small>' : own ? '<small>已拥有</small>' : `<div class="cost">${costHtml(g.coin, g.mat)}</div>`}</div>`; }).join('')}</div>
        <p class="hint">点装备 = 预览　拖到上面的装备槽 = 买下穿上</p></div>`;
    } else if (tab === 'skill') {
      h += head('技能屋') + `<div class="pbody tree" id="tree"><svg id="links"></svg><div id="nodes"></div></div><div class="detail" id="detail"></div><button id="sk-go" class="t">下矿</button>`;
    } else if (tab === 'pet') {
      h += head('宠物') + '<div class="pbody">';
      for (const k in B.PETS) { const p = B.PETS[k], own = s.pets.includes(k), v = B.VIP.find(x => x.pet === k), sg = B.SIGN.findIndex(x => x.pet === k);
        h += `<div class="card pet ${own ? '' : 'unk'}"><div class="ic"><canvas width="160" height="160" data-pet="${k}"></canvas></div><div class="mid"><b>${p.name}</b><span>${p.desc}</span>${own ? '' : `<span class="src">获得：${v ? 'VIP ' + (B.VIP.indexOf(v) + 1) + '（累计看 ' + v.ads + ' 次广告）' : '签到第 ' + (sg + 1) + ' 天'}</span>`}</div>${own ? `<button class="buy t ${s.pet === k ? 'no' : 'green'}" data-setpet="${k}">${s.pet === k ? '跟随中' : '带上'}</button>` : ''}</div>`; }
      h += '</div>';
    } else if (tab === 'codex') {
      h += head('图鉴') + `<div class="tabs"><button class="tab ${ctab === 'mon' ? 'on' : ''}" data-ctab="mon">怪物</button><button class="tab ${ctab === 'mat' ? 'on' : ''}" data-ctab="mat">材料</button></div><div class="pbody"><div class="grid">`;
      if (ctab === 'mon') for (const k of G.MON_KINDS) { const M = B.MON[k], n = s.codex[k] || 0;
        h += `<div class="cell ${n ? '' : 'unk'}" data-mat="${M.mat}"><canvas width="160" height="160" data-mon="${k}"></canvas><b>${n ? M.name : '？？？'}</b><span>${M.boss ? '50 米守卫' : (M.from || 0) + ' 米起'} · 击败 ${n}</span><span class="drop">掉落 ${img(M.mat)}${B.MAT[M.mat].name}${M.boss ? '（首杀必掉）' : ' ' + Math.round((k === 'Slime_Green' ? D.slimeP : M.p) * 100) + '%'}</span></div>`; }
      else for (const k of B.MAT_ORDER) { const M = B.MAT[k], seen = s.seen[k] || s.mat[k];
        h += `<div class="cell mat ${seen ? '' : 'unk'}" data-mat="${k}"><img class="big" src="${src(k)}"><b>${M.name}</b><span>拥有 ${s.mat[k] || 0}</span><span class="drop">${M.src}</span></div>`; }
      h += '</div></div>';
    } else if (tab === 'vip') {
      const nx = B.VIP[s.vip];
      h += head('VIP') + `<div class="pbody"><div class="vipnow t">累计看广告 <b>${s.ads}</b> 次${nx ? (s.ads >= nx.ads ? `　VIP ${s.vip + 1} 可以领取` : `　离 VIP ${s.vip + 1} 还差 ${nx.ads - s.ads} 次`) : '　已全部解锁'}</div>
        <button class="buy t green wide" id="vip-ad" ${G.adLeft('vip') ? '' : 'disabled'}>${G.adLeft('vip') ? '看一次广告（VIP 进度 +1）' : '今天这个广告位已用完'}</button>`;
      if (s.giftPending) h += `<div class="card"><div class="mid"><b>VIP 6 礼物：选一个部位</b><span>送 1 件比现在高 1 档的装备</span></div></div><div class="slots gift">${B.SLOTS.map(sl => { const t = Math.min(3, (s.gear[sl] || 0) + 1), g = B.GEAR[sl][t]; return `<div class="slot" data-gift="${sl}"><img src="${part(g.spr)}"><small>${g.name}</small></div>`; }).join('')}</div>`;
      B.VIP.forEach((v, i) => { const got = i < s.vip, ready = !got && s.ads >= v.ads && i === s.vip;
        h += `<div class="card ${got ? 'got' : ''}"><div class="ic vipi">${img(vipIc(v))}<b class="t">${i + 1}</b></div><div class="mid"><b>VIP ${i + 1}　<small>累计 ${v.ads} 次</small></b><span>${v.text}</span></div>${got ? '<button class="buy t done">已领</button>' : ready ? '<button class="buy t green" data-vip="1">领取<i class="dot"></i></button>' : `<button class="buy t no">${s.ads}/${v.ads}</button>`}</div>`; });
      h += '</div>';
    } else if (tab === 'sign') {
      const ready = G.signReady(), n = s.sign.n;
      h += head('7 天签到') + `<div class="pbody"><div class="days">${B.SIGN.map((d, i) => `<div class="day ${i < n ? 'got' : i === n && ready ? 'now' : ''}"><b>第 ${i + 1} 天</b>${signIcon(d)}<span>${d.text}</span>${i < n ? '<i class="ok">✓</i>' : ''}</div>`).join('')}</div>
        ${ready ? '<button class="buy t green wide" id="sign-go">领取今天的奖励</button>' : ''}
        <p class="tomorrow t">${n >= B.SIGN.length ? '7 天奖励已全部领取' : (ready ? '今天可领：' : '明天可领：') + B.SIGN[n].text}${ready && n + 1 < B.SIGN.length ? '<br><small>明天可领：' + B.SIGN[n + 1].text + '</small>' : ''}</p><p class="hint">漏签不清零，下次来接着领</p></div>`;
    }
    P.innerHTML = mulfix(h);
    const pb = P.querySelector('.pbody'); if (pb && tab !== 'skill') pb.scrollTop = sc;
    if (tab === 'skill') renderTree();
    P.querySelectorAll('canvas[data-mon]').forEach(c => G.portrait(c, c.dataset.mon));
    P.querySelectorAll('canvas[data-pet]').forEach(c => G.petPortrait(c, c.dataset.pet));
    if (tab === 'shop') bindDrag();
  }
  const signIcon = d => d.coin ? img('coin', 'si') : d.gem ? img('gem', 'si') : d.mat ? img(Object.keys(d.mat)[0], 'si') : d.pet ? img('pet', 'si') : d.boost ? img('boost', 'si') : img('chest', 'si');

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
    if ((b = q('[data-gift]'))) { const sl = b.dataset.gift; G.giftGear(sl); const g = B.GEAR[sl][S().gear[sl]]; claimFx([{ part: g.spr, n: g.name }], 'VIP 6 礼物'); return; }
    if (q('#vip-ad')) { G.watchAd('vip', () => ui.toast('VIP 进度 +1')); return; }
    if (q('#sign-go')) { const s = G.claimSign(); if (s) claimSignFx(s); return; }
    if (q('#sk-go')) { snd('ui_tap'); ui.close(true); G.exitDoor(); setTimeout(() => G.goto('hole'), 560); return; }
  }

  /* ---------- 铁匠铺：拖到装备槽 = 买下穿上 ---------- */
  let dragMoved = false;
  function bindDrag() {
    $('panel').querySelectorAll('.item[data-item]').forEach(el => el.onpointerdown = e => {
      const t = +el.dataset.item; if ((S().gear[shopTab] || 0) >= t) return;
      dragMoved = false; const im = el.querySelector('img'), r = im.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY; let ghost = null;
      const mv = ev => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (!dragMoved && Math.hypot(dx, dy) > 8) { dragMoved = true; ghost = im.cloneNode(); ghost.className = 'ghost'; ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px'; document.body.appendChild(ghost); const tu = $('tut'); if (tu) tu.style.display = 'none'; }
        if (ghost) { ghost.style.left = (ev.clientX - r.width / 2) + 'px'; ghost.style.top = (ev.clientY - r.height / 2) + 'px'; const s = slotAt(ev.clientX, ev.clientY); $('panel').querySelectorAll('.slot').forEach(x => x.classList.toggle('hover', x === s)); }
      };
      const upf = ev => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', upf);
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
  const NG = 3.12;   // 节点间距（rem）
  function renderTree() {
    const s = S(), box = $('tree'), N = $('nodes'), L = $('links'); if (!box) return;
    const seen = B.SK.filter(n => B.skSeen(s, n));
    let h = '', lines = '';
    const xy = n => [n.x * NG, n.y * NG];
    for (const n of seen) for (const [rid] of n.req || []) { const p = B.SKI[rid]; if (!seen.includes(p)) continue; const [x1, y1] = xy(p), [x2, y2] = xy(n), on = G.skLv(n.id) > 0;
      lines += `<line x1="${x1}rem" y1="${y1}rem" x2="${x2}rem" y2="${y2}rem" class="${on ? 'on' : ''}" style="${on ? 'stroke:' + B.BR_COL[n.br] : ''}"/>`; }
    for (const n of seen) { const l = G.skLv(n.id), open = B.skOpen(s, n), can = G.canSkill(n.id), [x, y] = xy(n);
      h += `<button class="sk ${n.mech ? 'mech' : ''} ${l >= n.max ? 'max' : ''} ${open ? '' : 'lock'} ${can ? 'can' : ''} ${l ? 'got' : ''} ${sel === n.id ? 'sel' : ''}" data-sk="${n.id}" style="left:${x}rem;top:${y}rem;--c:${B.BR_COL[n.br]}"><i></i><img src="assets/sk/${n.ic}.png">${n.max > 1 ? `<u class="t">${l}/${n.max}</u>` : ''}${can ? '<b class="dot"></b>' : ''}</button>`; }
    N.innerHTML = h; L.innerHTML = lines;
    const apply = () => { const tr = `translate(${treePan.x}px, ${treePan.y}px)`; N.style.transform = L.style.transform = tr; };
    apply();
    let pd = null;
    box.onpointerdown = e => { pd = { x: e.clientX, y: e.clientY, px: treePan.x, py: treePan.y, m: false }; };
    box.onpointermove = e => { if (!pd) return; const dx = e.clientX - pd.x, dy = e.clientY - pd.y; if (Math.hypot(dx, dy) > 6) pd.m = true; if (pd.m) { treePan.x = Math.max(-260, Math.min(260, pd.px + dx)); treePan.y = Math.max(-220, Math.min(260, pd.py + dy)); apply(); } };
    box.onpointerup = e => { const m = pd && pd.m; pd = null; if (m) return; const b = e.target.closest('[data-sk]'); if (b) { sel = b.dataset.sk; snd('ui_tap'); renderTree(); } };
    renderDetail();
  }
  function renderDetail() {
    const n = B.SKI[sel], s = S(), l = G.skLv(n.id), open = B.skOpen(s, n), mx = l >= n.max, c = G.skCost(n.id);
    let req = ''; if (!open) req = (n.req || []).filter(([id, lv]) => G.skLv(id) < lv).map(([id, lv]) => `${B.SKI[id].name} 到 ${lv} 级`).concat(n.boss && !s.boss ? ['打败红甲虫王'] : []).join('、');
    $('detail').innerHTML = mulfix(`<div class="dcard" style="--c:${B.BR_COL[n.br]}"><img src="assets/sk/${n.ic}.png"><div class="mid"><b>${n.name}${n.mech ? '<small class="mk">机制</small>' : ''}<small>${n.max > 1 ? '　' + l + ' / ' + n.max + ' 级' : n.id === 'root' ? '' : l ? '　已拥有' : '　未拥有'}</small></b>
      <span>${n.desc(l)}</span>${!mx && n.max > 1 ? `<span class="nx">下一级：${n.desc(l + 1).replace(/（现在.*）/, '')}</span>` : ''}${req ? `<span class="req">需要：${req}</span>` : ''}</div>
      ${n.id === 'root' ? '' : mx ? '<button class="buy t done">已满</button>' : `<button class="buy t ${G.canSkill(n.id) ? 'green' : 'no'}" id="sk-buy">${img(c.cur)}${f(c.n)}${c.gem ? '<br>' + img('gem') + f(c.gem) : ''}</button>`}</div>`);
    const b = $('sk-buy'); if (b) b.onclick = () => { if (G.buySkill(n.id)) { renderTree(); const el = $('nodes').querySelector(`[data-sk="${n.id}"]`); if (el) el.classList.add('pulse'); } else { snd('ui_close'); ui.toast(!open ? '还没解锁：' + req : (c.cur === 'gem' ? '宝石' : '金币') + '还差 ' + f(Math.max(0, c.n - s[c.cur]))); } };
  }

  /* ---------- 材料“去哪拿” ---------- */
  function matSource(k) {
    const M = B.MAT[k], s = S();
    const p = pop(`<div class="box src"><img class="mi" src="${src(k)}"><h2 class="t">${M.name}</h2><p>拥有 <b>${s.mat[k] || 0}</b></p><p class="where">${M.src}</p>${M.mon ? `<canvas width="150" height="150" data-mon="${M.mon}"></canvas>` : ''}<div class="btns"><button class="buy t" id="src-ok">知道了</button></div></div>`, true);
    const c = p.querySelector('canvas'); if (c) G.portrait(c, c.dataset.mon);
    p.querySelector('#src-ok').onclick = () => { snd('ui_close'); unpop(); };
  }

  /* ---------- 弹窗 ---------- */
  const pop = (h, quiet) => { const p = $('pop'); p.innerHTML = mulfix(h); p.classList.add('on'); if (!quiet) snd('ui_open'); return p; };
  const unpop = () => $('pop').classList.remove('on');
  const gainRow = (coin, gem, mat, lost) => `<div class="gain t"><div>${img('coin')}${f(coin)}${lost ? `<s>丢失 ${f(lost.coin)}</s>` : ''}</div><div>${img('gem')}${f(gem)}${lost ? `<s>丢失 ${f(lost.gem)}</s>` : ''}</div></div>
    ${Object.keys(mat).length ? `<div class="gmat t">${Object.entries(mat).map(([k, n]) => `<span>${img(k)}×${n}</span>`).join('')}</div>` : ''}`;
  ui.result = (R, why) => {
    const s = S(), dead = why === 'dead', k = dead ? G.keepK() : 1, bst = s.boost > 0 ? 2 : 1;
    const mat = {}; for (const id in R.mat) mat[id] = Math.max(R.mat[id] > 0 && k >= 0.7 ? 1 : 0, Math.floor(R.mat[id] * k * (id === 'amber' ? 1 : bst)));
    const p = pop(`<div class="box"><h2 class="t">${dead ? '被打倒了' : why === 'stam' ? '体力耗尽，安全返回' : '回到地面'}</h2><p>到达 ${R.deep} 米　击败 ${R.kills} 只怪${R.ate ? '　吃了 ' + R.ate + ' 个食物' : ''}</p>
      ${gainRow(R.coin * k * bst, R.gem * k * bst, mat, dead && k < 1 ? { coin: R.coin * (1 - k), gem: R.gem * (1 - k) } : null)}
      ${bst > 1 ? `<p class="bst">收益增益生效 ×2（还剩 ${s.boost} 趟）</p>` : ''}
      <div class="btns">${dead && k < 1 ? `<button class="buy t green" id="r-ad" ${G.adLeft('keep') ? '' : 'disabled'}>看广告 不丢失</button>` : `<button class="buy t green" id="r-ad" ${G.adLeft('boost') ? '' : 'disabled'}>看广告<small>之后 5 趟收益 ×2</small></button>`}<button class="buy t" id="r-ok">收下</button></div></div>`);
    const ok = () => { snd('ui_tap'); unpop(); G.collect(1, false); };
    p.querySelector('#r-ok').onclick = ok;
    p.querySelector('#r-ad').onclick = () => { if (dead && k < 1) G.watchAd('keep', () => { unpop(); G.collect(1, true); }); else G.watchAd('boost', () => { S().boost += 5; unpop(); G.collect(1, false); }); };
    if (s.loop && s.auto) setTimeout(() => { if ($('pop').classList.contains('on') && p.querySelector('#r-ok')) ok(); }, 3000);
  };
  ui.revive = () => {
    const p = pop(`<div class="box"><h2 class="t">血量归零</h2><p>看广告原地复活：血量回满，体力至少回到一半（每趟 1 次）</p><div class="btns"><button class="buy t green" id="v-ad" ${G.adLeft('revive') ? '' : 'disabled'}>看广告复活</button><button class="buy t no" id="v-no">不用了</button></div></div>`);
    p.querySelector('#v-ad').onclick = () => G.watchAd('revive', () => { unpop(); G.revive(); });
    p.querySelector('#v-no').onclick = () => { snd('ui_close'); unpop(); G.giveUp(); };
  };
  ui.offline = o => {
    const p = pop(`<div class="box"><h2 class="t">招财鱼带回了收获</h2><p>离线 ${o.h.toFixed(1)} 小时（每小时 1 趟收入）</p>${gainRow(o.coin, o.gem, {})}
      <div class="btns"><button class="buy t green" id="o-ad" ${G.adLeft('offline') ? '' : 'disabled'}>看广告 ×2</button><button class="buy t" id="o-ok">收下</button></div></div>`);
    const take = m => { unpop(); S().coin += o.coin * m; S().gem += o.gem * m; claimFx([{ k: 'coin', n: o.coin * m }, { k: 'gem', n: o.gem * m }], '离线收获'); };
    p.querySelector('#o-ok').onclick = () => take(1); p.querySelector('#o-ad').onclick = () => G.watchAd('offline', () => take(2));
  };
  ui.ad = done => {   // 测试版：没接广告 SDK，用 1.5 秒进度条代替
    const p = pop(`<div class="box adbox"><h2 class="t">广告</h2><p>测试版占位：正式版这里播放 TapTap 激励视频</p><div class="prog"><i style="width:0%;transition:width 1.5s linear"></i></div></div>`, true);
    requestAnimationFrame(() => requestAnimationFrame(() => { p.querySelector('i').style.width = '100%'; }));
    setTimeout(() => { unpop(); done(); }, window.__FASTAD ? 30 : 1550);
  };

  /* ---------- 领取动画：弹出卡片（光芒旋转、图标逐个弹出），点一下收起，金币宝石飞向顶部 ---------- */
  function claimFx(items, title, onDone) {
    snd('claim', 0.9);
    const p = pop(`<div class="claim"><h2 class="t">${title}</h2><div class="rays"></div><div class="its">${items.map((it, i) => `<div class="ci" style="animation-delay:${0.1 + i * 0.12}s">${it.canvas ? `<canvas width="220" height="220" data-cpet="${it.canvas}"></canvas>` : it.part ? `<img src="${part(it.part)}">` : img(it.k)}<b class="t">${it.n !== undefined ? (typeof it.n === 'number' ? '×' + f(it.n) : it.n) : ''}</b></div>`).join('')}</div><p class="t tapon">点任意处收下</p></div>`, true);
    p.querySelectorAll('canvas[data-cpet]').forEach(c => G.petPortrait(c, c.dataset.cpet));
    const close = () => {
      p.onclick = null; const from = [...p.querySelectorAll('.ci')].map(e => e.getBoundingClientRect());
      unpop(); snd('ui_close');
      items.forEach((it, i) => { if (it.k === 'coin' || it.k === 'gem') fly(src(it.k), from[i], $(it.k === 'coin' ? 'h-coin' : 'h-gem').parentNode, 4); });
      G.refresh(); onDone && onDone();
    };
    setTimeout(() => { p.onclick = close; }, 400);
  }
  ui.claimFx = claimFx;
  const vipIc = v => v.pet ? 'pet' : v.auto || v.loop ? 'auto' : v.off12 ? 'off' : 'chest';
  function claimVipFx(v) {
    if (v.pet) claimFx([{ canvas: v.pet, n: B.PETS[v.pet].name }], 'VIP ' + S().vip + ' 奖励：新宠物', () => ui.toast(B.PETS[v.pet].name + ' 已跟随你（宠物页可以换）'));
    else claimFx([{ k: vipIc(v), n: v.text }], 'VIP ' + S().vip + ' 奖励', () => { if (v.loop) { S().loop = true; G.save(); ui.refresh(); } });
  }
  function claimSignFx(d) {
    const it = []; if (d.coin) it.push({ k: 'coin', n: d.coin }); if (d.gem) it.push({ k: 'gem', n: d.gem }); if (d.mat) for (const k in d.mat) it.push({ k, n: d.mat[k] });
    if (d.pet) it.push({ canvas: d.pet, n: B.PETS[d.pet].name }); if (d.boost) it.push({ k: 'boost', n: '收益 ×2 · ' + d.boost + ' 趟' });
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
