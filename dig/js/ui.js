/* dig hero 界面（DOM）：顶部资源、岸上导航、商店 / 技能树 / 宠物 / 图鉴 / VIP、结算与广告弹窗。图片来自 assets/ui（LayerLab GUI）。 */
(function () {
  'use strict';
  const G = window.G, B = window.BAL, $ = id => document.getElementById(id), S = () => G.S;
  const IC = { coin: 'ui/i_coin.png', gem: 'ui/i_gem_1_purple.png', stam: 'ui/i_food_meat.png', hp: 'ui/i_heart.png', weapon: 'ui/i_equip_sword.png', shield: 'ui/i_equip_shield.png', helmet: 'ui/i_equip_helmet_1.png', armor: 'ui/i_bag.png', pick: 'ui/i_equip_pickax.png',
    dig: 'ui/i_equip_pickax.png', freq: 'ui/i_lightning_yellow.png', time: 'ui/i_food_meat.png', atk: 'ui/i_equip_swords.png', def: 'ui/i_equip_shield.png', coinL: 'ui/i_pouch.png', gemL: 'ui/i_gemstone.png',
    shop: 'ui/i_house.png', skill: 'ui/i_book_1.png', pet: 'ui/i_clover.png', codex: 'ui/i_book_open.png', vip: 'ui/i_star.png', chest: 'icons/Item_Chest_01_Wood.png', close: 'ui/icon_white_close.png' };
  const img = k => `<img src="assets/${IC[k] || k}" alt="">`;
  const f = B.fmt, STAT = { atk: '攻击', def: '防御', hp: '血量', stam: '体力', dig: '挖掘力' };
  const fv = v => v >= 100 || v === Math.floor(v) ? f(v) : v.toFixed(1);
  const ui = G.ui = {};
  let tab = null, treeTab = '探索', sel = null;

  ui.init = () => {
    $('hud').innerHTML = `<div class="res"><div class="pill t">${img('coin')}<span id="h-coin">0</span></div><div class="pill t">${img('gem')}<span id="h-gem">0</span></div><div class="depth t" id="h-depth"></div></div>
      <div class="bars" id="h-bars"><div class="bar" id="b-st">${img('stam')}<i></i><span class="t"></span></div><div class="bar hp" id="b-hp">${img('hp')}<i></i><span class="t"></span></div></div>
      <button id="back" class="t">回地面</button><div id="bossbar"><b class="t"></b><div class="bar"><i></i><span class="t"></span></div></div>`;
    $('back').onclick = () => G.endRun('back');
    $('shore').innerHTML = `<button id="chest" class="t">${img('chest')}<span>看广告开箱</span></button><button id="go" class="t">下去挖<small id="go-sub"></small></button>
      <div id="nav">${[['shop', '商店'], ['skill', '技能'], ['pet', '宠物'], ['codex', '图鉴'], ['vip', 'VIP']].map(([k, n]) => `<button data-k="${k}" class="t">${img(k)}${n}</button>`).join('')}</div>`;
    $('go').onclick = () => G.start();
    $('chest').onclick = () => G.watchAd(() => { const r = S().lastRun; S().coin += r.coin; S().gem += r.gem; S().chest = Date.now(); ui.toast('宝箱：金币 +' + f(r.coin) + '　宝石 +' + f(r.gem), 2200); });
    $('nav').onclick = e => { const b = e.target.closest('button'); if (b) { G.sfx.init(); G.sfx.play('poof', 0.4); ui.open(b.dataset.k); } };
    $('panel').onclick = onPanel;
  };
  /* ---------- 顶部 ---------- */
  const cache = {};
  const set = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } };
  const bar = (id, v, max) => { const k = id + Math.round(v / max * 200) + '|' + Math.ceil(v); if (cache[id + 'b'] === k) return; cache[id + 'b'] = k; const e = $(id); e.querySelector('i').style.width = Math.max(0, Math.min(100, v / max * 100)) + '%'; e.querySelector('span').textContent = f(Math.ceil(v)) + ' / ' + f(max); e.classList.toggle('low', v / max < 0.25); };
  ui.hud = (R, mode, hero, D) => {
    const run = mode === 'run';
    set('h-coin', f(S().coin + (run ? R.coin : 0))); set('h-gem', f(S().gem + (run ? R.gem : 0)));
    if (cache.run !== run) { cache.run = run; $('h-bars').style.display = $('back').style.display = run ? '' : 'none'; if (!run) $('bossbar').style.display = 'none'; }
    if (!run) { set('h-depth', S().best ? '最深 ' + S().best + ' 米' : ''); return; }
    set('h-depth', Math.max(0, hero.r + 1) + ' 米');
    bar('b-st', R.st, R.stMax); bar('b-hp', R.hp, R.hpMax);
    const boss = R.mons.find(m => m.boss && !m.dead && Math.abs(m.r - hero.r) <= 3), bb = $('bossbar');
    if (!!boss !== !!cache.boss) { cache.boss = !!boss; bb.style.display = boss ? 'block' : 'none'; if (boss) bb.querySelector('b').textContent = '守卫 ' + G.MON_NAME[boss.kind]; }
    if (boss) { const k = Math.round(boss.hp / boss.max * 300); if (cache.bossk !== k) { cache.bossk = k; bb.querySelector('i').style.width = Math.max(0, boss.hp / boss.max * 100) + '%'; bb.querySelector('span').textContent = f(Math.max(0, Math.ceil(boss.hp))) + ' / ' + f(boss.max); } }
    if (!S().tip && R.blocks >= 2) { S().tip = 1; const t = $('tip'); if (t) t.remove(); }
  };
  ui.showRun = () => { $('shore').style.display = 'none'; ui.close(); if (!S().tip && !$('tip')) { const d = document.createElement('div'); d.id = 'tip'; d.className = 't'; d.textContent = '按住屏幕拖动：往哪走，就往哪挖'; $('wrap').appendChild(d); } };
  ui.hideShore = () => { $('shore').style.display = 'none'; };
  ui.showShore = () => { $('shore').style.display = ''; const t = $('tip'); if (t) t.remove(); ui.refresh(); };
  ui.refresh = () => {
    const s = S(), can = k => s[B.GEAR[k].cur] >= B.gearPrice(k, (s.gear[k] || 0) + 1) && (s.gear[k] || 0) < B.MAX_TIER;
    dot('shop', Object.keys(B.GEAR).some(can)); dot('skill', allNodes().some(([l, j]) => { const n = G.skillNode(l, j); return n.open && n.lv < n.max && s[n.cur] >= n.cost; }));
    const st = Math.min(s.boss, B.STAGES - 1) * B.STAGE; $('go-sub').textContent = s.boss >= B.STAGES ? '10 层守卫已全部击败（当前版本到此）' : st > 0 ? '电梯从 ' + st + ' 米出发' : '';
    $('chest').style.display = (s.lastRun.coin > 0 && Date.now() - (s.chest || 0) > 4 * 3600e3) ? '' : 'none';
    if (tab) render();
  };
  function dot(k, on) { const b = $('nav').querySelector(`[data-k="${k}"]`); let d = b.querySelector('.dot'); if (on && !d) { d = document.createElement('i'); d.className = 'dot'; b.appendChild(d); } else if (!on && d) d.remove(); }
  const TREE = { '探索': ['dig', 'freq', 'time'], '战斗': ['atk', 'def', 'hp'], '经济': ['coin', 'gem'] };
  const lineLen = l => B.LINES[l] ? B.NODE_SEQ.length : B.SPECIAL[l].max / 3;
  const lineName = l => (B.LINES[l] || B.SPECIAL[l]).name;
  const lineIcon = l => ({ coin: 'coinL', gem: 'gemL', hp: 'hp' })[l] || l;
  function allNodes() { const a = []; for (const t in TREE) for (const l of TREE[t]) for (let j = 0; j < lineLen(l); j++) a.push([l, j]); return a; }

  /* ---------- 面板 ---------- */
  ui.open = k => { tab = k; sel = null; $('panel').classList.add('on'); render(); };
  ui.close = () => { tab = null; $('panel').classList.remove('on'); };
  const price = (cur, p, ok, extra) => `<button class="buy t ${ok ? '' : 'no'} ${extra || ''}">${img(cur)}${f(p)}</button>`;
  function render() {
    const s = S(), D = G.D(), P = $('panel'), sc = P.querySelector('.pbody') ? P.querySelector('.pbody').scrollTop : 0; let h = '', title = '';
    if (tab === 'shop') {
      title = '商店';
      h += `<div class="stats">${['atk', 'def', 'hp', 'stam', 'dig'].map(k => `<span>${img({ atk: 'weapon', def: 'shield', hp: 'hp', stam: 'stam', dig: 'pick' }[k])}${STAT[k]} ${fv(D[k])}</span>`).join('')}</div>`;
      for (const k in B.GEAR) {
        const g = B.GEAR[k], t = s.gear[k] || 0, max = t >= B.MAX_TIER, p = B.gearPrice(k, t + 1);
        h += `<div class="card" data-gear="${k}"><div class="ic">${img(k)}</div><div class="mid"><b>${g.name} ${t + 1} 档<small style="color:#b9aec9;font-size:.7rem">（${g.slot}）</small></b><span>${STAT[g.stat]} ${fv(B.gearVal(k, t))}${max ? '' : ` → <em>${fv(B.gearVal(k, t + 1))}</em>`}</span></div>${max ? '<div class="buy done">已满</div>' : price(g.cur, p, s[g.cur] >= p)}</div>`;
      }
    } else if (tab === 'skill') {
      title = '技能树';
      h += `<div class="tabs">${Object.keys(TREE).map(t => `<button class="tab ${t === treeTab ? 'on' : ''}" data-tree="${t}">${t}</button>`).join('')}</div><div class="tree">`;
      const lines = TREE[treeTab], rootOn = ((s.skill[lines[0]] || [])[0] || 0) > 0 || (s.skill[lines[0]] > 0);
      lines.forEach((l, li) => {
        if (li > 0 && !rootOn) { h += '<div class="line"></div>'; return; }   // 点了第一条线才冒出新枝
        h += `<div class="line"><h3>${lineName(l)}</h3>`; let shown = 0;
        for (let j = 0; j < lineLen(l); j++) {
          const n = G.skillNode(l, j); if (!n.open && shown >= 1) break; if (!n.open) shown++;
          if (j) h += `<i class="link ${n.open ? 'on' : ''}"></i>`;
          const can = n.open && n.lv < n.max && s[n.cur] >= n.cost;
          h += `<button class="node ${n.big ? 'big' : ''} ${n.open ? '' : 'lock'} ${n.lv >= n.max ? 'max' : ''} ${can ? 'can' : ''} ${sel && sel[0] === l && sel[1] === j ? 'sel' : ''}" data-node="${l},${j}">${img(n.open ? lineIcon(l) : 'ui/icon_color_lock_s.png')}<u class="t">${n.open ? n.lv + '/' + n.max : ''}</u></button>`;
        }
        h += '</div>';
      });
      h += '</div>';
    } else if (tab === 'pet') {
      title = '宠物';
      for (const k in B.PETS) { const p = B.PETS[k], own = s.pets.includes(k), v = B.VIP.find(x => x.pet === k);
        h += `<div class="card pet ${own ? '' : 'unk'}"><div class="ic"><canvas width="160" height="160" data-pet="${k}"></canvas></div><div class="mid"><b>${p.name}</b><span>${p.desc}</span></div>${own ? `<button class="buy t ${s.pet === k ? 'no' : 'green'}" data-setpet="${k}">${s.pet === k ? '跟随中' : '带上'}</button>` : `<div class="buy done" style="color:#cfc4dd">看 ${v.ads} 次广告</div>`}</div>`; }
    } else if (tab === 'codex') {
      title = '怪物图鉴';
      h += '<div class="grid">';
      for (const k of G.MON_KINDS) { const n = s.codex[k] || 0, next = B.CODEX_STEPS.find(x => n < x), got = B.CODEX_STEPS.filter(x => n >= x).length;
        h += `<div class="cell ${n ? '' : 'unk'}"><canvas width="160" height="160" data-mon="${k}"></canvas><b>${n ? G.MON_NAME[k] : '？？？'}</b><span>已击败 ${n}${next ? ' / ' + next : ''}</span><span>${got ? `<em>金币、宝石获取 +${got * 2}%</em>` : ''}${next ? `　击败 ${next} 只：+2%` : ''}</span></div>`; }
      h += '</div>';
    } else if (tab === 'vip') {
      title = 'VIP';
      const nx = B.VIP[s.vip], prev = s.vip ? B.VIP[s.vip - 1].ads : 0;
      h += `<div class="vipnow">VIP ${s.vip}　已看广告 ${s.ads} 次${nx ? `<div class="prog"><i style="width:${Math.min(100, (s.ads - prev) / (nx.ads - prev) * 100)}%"></i><span class="t">${s.ads} / ${nx.ads}</span></div>` : ''}</div>`;
      B.VIP.forEach((v, i) => { h += `<div class="card ${i < s.vip ? 'got' : ''}"><div class="ic">${img('vip')}</div><div class="mid"><b>VIP ${i + 1}</b><span>${v.text}</span></div><div class="buy done" style="color:${i < s.vip ? '#8dff6a' : '#cfc4dd'}">${i < s.vip ? '已领取' : '看 ' + v.ads + ' 次'}</div></div>`; });
    }
    let det = '';
    if (tab === 'skill' && sel) {
      const [l, j] = sel, n = G.skillNode(l, j), isLine = !!B.LINES[l];
      const now = isLine ? '当前合计 ×' + (+B.lineMult(s.skill[l]).toFixed(2)) : l === 'time' ? '当前 体力上限 +' + (s.skill.time || 0) * 50 + '%' : '当前 每秒挥击 ' + D.freq + ' 次';
      det = `<div class="card detail"><div class="ic">${img(lineIcon(l))}</div><div class="mid"><b>${lineName(l)}　${n.lv}/${n.max}</b><span>${n.text}</span><span>${now}</span></div>${!n.open ? '<div class="buy done" style="color:#cfc4dd">点满上一个</div>' : n.lv >= n.max ? '<div class="buy done">已点满</div>' : price(n.cur, n.cost, s[n.cur] >= n.cost)}</div>`;
    }
    P.innerHTML = `<div class="phead"><h2 class="t">${title}</h2><button class="close" data-close="1">${img('close')}</button></div><div class="pbody">${h}</div>${det}`;
    P.querySelector('.pbody').scrollTop = sc;
    P.querySelectorAll('canvas[data-mon]').forEach(c => G.portrait(c, c.dataset.mon));
    P.querySelectorAll('canvas[data-pet]').forEach(c => G.petPortrait(c, c.dataset.pet));
  }
  function onPanel(e) {
    const t = e.target, s = S();
    if (t.closest('[data-close]')) { ui.close(); return; }
    const tr = t.closest('[data-tree]'); if (tr) { treeTab = tr.dataset.tree; sel = null; render(); return; }
    const nd = t.closest('[data-node]'); if (nd) { const [l, j] = nd.dataset.node.split(','); sel = [l, +j]; render(); return; }
    const sp = t.closest('[data-setpet]'); if (sp) { G.setPet(sp.dataset.setpet); return; }
    const buy = t.closest('.buy'); if (!buy || buy.classList.contains('done') || tab === 'pet') return;
    const gear = t.closest('[data-gear]');
    let ok = false;
    if (gear) ok = G.buyGear(gear.dataset.gear); else if (tab === 'skill' && sel) ok = G.buySkill(sel[0], sel[1]);
    if (!ok) { G.sfx.play('fire_out', 0.4); const cur = gear ? B.GEAR[gear.dataset.gear].cur : sel ? G.skillNode(sel[0], sel[1]).cur : 'coin'; ui.toast(cur === 'coin' ? '金币不够' : '宝石不够（打怪掉宝石）'); }
  }

  /* ---------- 弹窗 ---------- */
  const pop = h => { const p = $('pop'); p.innerHTML = h; p.classList.add('on'); return p; };
  const unpop = () => $('pop').classList.remove('on');
  ui.result = (R, why) => {
    const dead = why === 'dead', k = dead ? 1 - B.P.dieLoss : 1;
    const p = pop(`<div class="box"><h2 class="t">${dead ? '被打倒了' : why === 'stam' ? '体力耗尽，安全返回' : '回到地面'}</h2><p>到达 ${R.deep} 米　击败 ${R.kills} 只怪</p>
      <div class="gain t"><div>${img('coin')}${f(R.coin * k)}${dead ? `<s>丢失 ${f(R.coin * (1 - k))}</s>` : ''}</div><div>${img('gem')}${f(R.gem * k)}${dead ? `<s>丢失 ${f(R.gem * (1 - k))}</s>` : ''}</div></div>
      <div class="btns"><button class="buy t green" id="r-ad">${dead ? '看广告 不丢失' : '看广告 ×2'}</button><button class="buy t" id="r-ok">收下</button></div></div>`);
    p.querySelector('#r-ok').onclick = () => { unpop(); G.collect(1, false); };
    p.querySelector('#r-ad').onclick = () => G.watchAd(() => { unpop(); G.collect(dead ? 1 : 2, true); });
  };
  ui.revive = () => {
    const p = pop(`<div class="box"><h2 class="t">血量归零</h2><p>看广告原地复活：体力、血量各恢复 50%（每趟 1 次）</p><div class="btns"><button class="buy t green" id="v-ad">看广告复活</button><button class="buy t no" id="v-no">不用了</button></div></div>`);
    p.querySelector('#v-ad').onclick = () => G.watchAd(() => { unpop(); G.revive(); });
    p.querySelector('#v-no').onclick = () => { unpop(); G.giveUp(); };
  };
  ui.offline = o => {
    const p = pop(`<div class="box"><h2 class="t">招财鱼带回了收获</h2><p>离线 ${o.h.toFixed(1)} 小时（每小时 1 趟收入，最多 8 小时）</p><div class="gain t"><div>${img('coin')}${f(o.coin)}</div><div>${img('gem')}${f(o.gem)}</div></div>
      <div class="btns"><button class="buy t green" id="o-ad">看广告 ×2</button><button class="buy t" id="o-ok">收下</button></div></div>`);
    const take = m => { unpop(); S().coin += o.coin * m; S().gem += o.gem * m; G.refresh(); };
    p.querySelector('#o-ok').onclick = () => take(1); p.querySelector('#o-ad').onclick = () => G.watchAd(() => take(2));
  };
  ui.ad = done => {   // 测试版：没有接广告 SDK，用 1.5 秒进度条代替
    const p = pop(`<div class="box adbox"><h2 class="t">广告</h2><p>测试版占位：正式版这里播放 TapTap 激励视频</p><div class="prog"><i style="width:0%;transition:width 1.5s linear"></i></div></div>`);
    requestAnimationFrame(() => { p.querySelector('i').style.width = '100%'; });
    setTimeout(() => { unpop(); done(); }, window.__FASTAD ? 30 : 1550);
  };
  let tt = 0;
  ui.toast = (s, ms) => { const t = $('toast'); t.textContent = s; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), ms || 1400); };
  let bt = 0;
  ui.banner = (a, b) => { const e = $('banner'); e.innerHTML = `<b class="t">${a}</b><span class="t">${b}</span>`; e.classList.add('on'); clearTimeout(bt); bt = setTimeout(() => e.classList.remove('on'), 2400); };
})();
