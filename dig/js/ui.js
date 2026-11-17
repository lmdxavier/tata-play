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
  // v0.20 面板线：全界面统一的数字格式（用户 23:03「数字跑到框外头去了」）。<1万：整数原样，小数 <10 最多 2 位、<100 最多 1 位；
  // ≥1万 用中文单位 万 / 亿 / 万亿 / 亿亿，最多 4 位有效数字（1.23万、12.3万、123万、1234万），往下截断不进位（不显示比实际多）；mul = 前面加 ×
  const UNIT = ['万', '亿', '万亿', '亿亿'];
  const cut = (x, d) => { const k = Math.pow(10, d), v = Math.floor(x * k + 1e-6) / k; return d ? String(parseFloat(v.toFixed(d))) : String(v); };
  const fmtNum = (n, mul) => {
    if (typeof n !== 'number' || isNaN(n)) n = 0; const pre = (mul ? '×' : '') + (n < 0 ? '−' : ''); n = Math.abs(n); const n0 = n;
    if (!isFinite(n)) return pre + '∞';
    if (n < 1e4) { const r = Math.round(n * 100) / 100; return pre + (n >= 100 || r === Math.round(r) ? cut(n, 0) : n < 10 ? String(r) : String(Math.round(n * 10) / 10)); }
    let i = -1; while (n >= 1e4 && i < UNIT.length - 1) { n /= 1e4; i++; }
    if (n >= 1e4) return pre + n0.toExponential(2).replace('e+', 'e');
    return pre + cut(n, n < 10 ? 2 : n < 100 ? 1 : 0) + UNIT[i];
  };
  const f = fmtNum, STAT = { atk: '攻击', def: '防御', hp: '血量', stam: '体力' };
  // v0.20 面板修复线（一般-6）：人物属性（挖掘力 / 攻击 / 防御 / 血量 / 体力）全游戏同一个取整口径——最多 1 位小数（<100），再走 fmtNum。
  // 铁匠铺属性卡、技能屋属性栏和说明卡、下矿后的体力条 / 血条都用它，不再一处 10.5 一处 11
  // bfix（检查报告严重-1：体力条「98.5 / 100」）：属性一律显示整数——上限 / 面板值往下取整（157.5 显示 157，不显示比实际多），
  // 条上的当前值往上取整（还剩 0.4 体力显示 1，不显示 0）；消耗 / 回复内部可以是小数，显示不出现小数点
  const statN = v => fmtNum(Math.floor(v + 1e-6));
  const statUp = v => Math.ceil(v - 1e-6);
  const fv = statN;
  const part = spr => `assets/hero/parts/${spr}.png`;
  /* v0.20 修复线（一般-9）：装备图按图里不透明部分（bbox）放大到框的 75%——部件图四周透明边很多，原来 object-fit 后一把剑只有 25×10 像素。
   * 启动预加载时每张部件图读一次 alpha 算 bbox 存进 BBOX；框大小由 CSS 定，图按 bbox 等比放进框的 75%（容器查询单位 cqw / cqh），不变形。
   * file:// 下读不了像素（画布被污染）→ 退回整图 contain。 */
  const BBOX = {};
  const absUrl = u => new URL(u, location.href).href;
  function bboxOf(im) {
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height; if (!w || !h) return null;
    try { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1, w, h]; } catch (e) { return null; }
  }
  const gearImg = spr => {   // .gi = 框（大小由 CSS 定）；.gb = bbox 那一块，按 contain 放到框的 75%（容器查询单位）；img 按 bbox 偏移铺满原图
    const b = BBOX[absUrl(part(spr))];
    if (!b) return `<span class="gi"><img class="gf" src="${part(spr)}" alt="" draggable="false"></span>`;
    const [x, y, bw, bh, nw, nh] = b, P = v => (v * 100).toFixed(2) + '%';
    return `<span class="gi"><span class="gb" style="--ar:${(bw / bh).toFixed(4)}"><img src="${part(spr)}" alt="" draggable="false" style="left:${P(-x / bw)};top:${P(-y / bh)};width:${P(nw / bw)};height:${P(nh / bh)}"></span></span>`;
  };
  const ui = G.ui = {};
  const BOSS_KIND = Object.keys(B.MON).find(k => B.MON[k].boss);
  ui.fmtNum = fmtNum; ui.statN = statN;
  const snd = (k, v) => G.sfx.play(k, v === undefined ? 0.8 : v);
  let tab = null;

  ui.init = () => {
    $('hud').innerHTML = `<div class="res"><div class="pill t">${img('coin')}<span id="h-coin">0</span><b class="rg" id="h-rc"></b></div><div class="pill t">${img('gem')}<span id="h-gem">0</span><b class="rg" id="h-rg"></b></div><div class="boost t" id="h-boost">${img('boost')}<span></span></div><div class="depth t" id="h-depth"></div></div>
      <div class="bars" id="h-bars"><div class="bar hp" id="b-hp">${img('hp')}<i></i><span class="t"></span></div><div class="bar" id="b-st">${img('stam')}<i></i><span class="t"></span></div></div>
      <button id="back" class="t">回地面</button><button id="auto" class="t">${img('auto')}<span>自动</span><i class="alock">${img('lock')}</i><b class="avip t">VIP ${B.vipLv('auto')}</b></button><div id="bossbar"><b class="t"></b><div class="bar"><i></i><span class="t"></span></div></div>`;
    $('wrap').appendChild($('auto'));
    $('back').onclick = () => { snd('ui_tap'); G.endRun('back'); };
    $('auto').onclick = () => {
      if (!G.vipOwn('auto')) { vipAt('auto'); return; }   // v0.20 修复线：没解锁 = 按钮上挂锁和 VIP 角标；点了直接打开 VIP 页那一级，不弹字
      G.toggleAuto(); snd('ui_tap'); if (S().auto && !S().tut.auto) { S().tut.auto = 1; G.save(); ui.toast('按一下方向，就一直往那边挖'); }   // v0.20：按钮本身有开 / 关状态；用法说明只在第一次打开时出一次
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
    preloadUi();
  };
  /* v0.20（用户 iPhone：切出去再回来，技能屋图标全空白、过几秒才慢慢出来）：面板每次重画都新建 <img>，图片不在页面的“已加载图片表”里时
   * iOS 要重新请求 / 校验缓存（GitHub Pages 缓存 10 分钟后要逐个 304 校验）再解码。照常见做法：启动时把界面会用到的图全部预加载、
   * 一直持有 Image 对象（同一网址的新 <img> 直接复用，不再发请求）并 decode()；切回前台时再 decode 一遍，第一帧就有图。 */
  const held = ui._imgs = [];
  function uiUrls() {
    const u = new Set(); const add = x => x && u.add(new URL(x, location.href).href);
    for (const k in IC) add(src(k)); for (const k in B.MAT) add(src(k));
    B.SK.forEach(n => add(`assets/sk/${n.ic}.png`));
    for (const sl of B.SLOTS) B.GEAR[sl].forEach(g => add(part(g.spr)));
    for (const k in B.SKIN) { add(part(B.SKIN[k].Helmet)); add(part(B.SKIN[k].Chest)); } add(part(B.STAFF.spr));
    for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules; } catch (e) { continue; } for (const r of rs) { const t = r.cssText, re = /url\(["']?([^"')]+\.(?:png|jpg|webp))["']?\)/g; let m; while ((m = re.exec(t))) add(new URL(m[1], sh.href || location.href).href); } }   // 面板底纹、按钮框等 CSS 背景图
    return [...u];
  }
  function preloadUi() {
    const parts = new Set(); for (const sl of B.SLOTS) B.GEAR[sl].forEach(g => parts.add(absUrl(part(g.spr))));
    let bbQ = 0; const bbDone = () => { if (!bbQ) bbQ = setTimeout(() => { bbQ = 0; if (tab === 'shop' && !press) render(); }, 60); };   // 算完 bbox 时铁匠铺开着就重画一次（拖拽中不重画）
    for (const url of uiUrls()) { const im = new Image(); im.decoding = 'async'; im.src = url; held.push(im);
      if (parts.has(url)) im.addEventListener('load', () => { BBOX[url] = bboxOf(im); bbDone(); }, { once: true });
      if (im.decode) im.decode().catch(() => { }); }
    // 宠物头像的骨骼贴图也先载好（宠物 / VIP / 签到页第一次打开不再空白）；v0.20 修复线：启动就开始，不再等 1.2 秒
    for (const k in B.PETS) { const c = document.createElement('canvas'); c.width = c.height = 32; const pr = G.petPortrait(c, k); if (pr && pr.catch) pr.catch(() => { }); }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) held.forEach(im => { if (im.decode) im.decode().catch(() => { }); }); });
  const sideBtn = (k, n) => `<button data-k="${k}" class="t">${img(k)}<span>${n}</span><i class="dot"></i></button>`;
  const chestLeft = () => { const ms = G.chestLeftMs(); const h = Math.floor(ms / 3600e3), m = Math.ceil((ms % 3600e3) / 60e3); return h ? h + ' 小时 ' + m + ' 分' : m + ' 分钟'; };

  /* ---------- 每帧：顶部、名牌位置 ---------- */
  const cache = {};
  // 顶栏一排放不下时整排等比缩小字号（不折行、不截断）；只在内容变了时量一次（用户 18:18：窄屏要跟着缩，不能挤到下一行）
  const fitRes = () => { const r = $('hud') && $('hud').querySelector('.res'); if (!r) return; r.style.transform = ''; r.style.width = ''; const need = r.scrollWidth, have = r.clientWidth; if (need <= have + 1) return; const f = Math.max(0.62, have / need); r.style.transformOrigin = 'left center'; r.style.width = (100 / f) + '%'; r.style.transform = 'scale(' + f + ')'; };   // 子元素用 rem，改字号缩不动 → 整排 scale，宽度反向放大保持占满
  let fitQ = 0; const fitSoon = () => { if (!fitQ) fitQ = requestAnimationFrame(() => { fitQ = 0; fitRes(); }); };
  window.addEventListener('resize', fitSoon);
  let tagAvoid = null; window.addEventListener('resize', () => { tagAvoid = null; });
  const set = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; if (/^h-/.test(id)) fitSoon(); } };
  const bar = (id, v, max) => { const k = id + Math.round(v / max * 200) + '|' + statUp(v) + '|' + max; if (cache[id + 'b'] === k) return; cache[id + 'b'] = k; const e = $(id); e.querySelector('i').style.width = Math.max(0, Math.min(100, v / max * 100)) + '%'; e.querySelector('span').textContent = fmtNum(Math.max(0, statUp(v))) + ' / ' + statN(max);   /* v0.20 修复线：和铁匠铺 / 技能屋同一口径（statN），不再对上限向上取整 */ e.classList.toggle('low', v / max < 0.25); };
  ui.hud = (R, mode, hero, D, dt) => {
    const run = mode === 'run', s = S();
    if (runPause && tab && !popOn()) G.paused = true;   // 挖矿中开着 VIP 页：看完广告（watchAd 会解除暂停）也保持暂停，关面板才继续
    lootTick(dt, mode); lootHud(s, dt);   // v0.20 顶栏金币 / 宝石 = 存档 − 还在飞的（LOOT.pend），飞到才加，数字滚动
    set('h-rc', run && R && R.coin >= 1 ? '+' + f(Math.floor(R.coin)) : ''); set('h-rg', run && R && R.gem >= 1 ? '+' + f(Math.floor(R.gem)) : '');   // v0.20 tfix：显示取整（收下时 G.collect 也是取整进存档；原来结算框写 22.5、到手 22）
    $('h-boost').style.display = 'none';   // 用户 18:17：收益 ×2 只在结算界面显示，主屏顶栏不挂
    if (cache.run !== run) { cache.run = run; $('h-depth').parentNode.classList.toggle('run', run); /* v0.18：挖矿时深度加底框（ui.css .res.run） */ $('h-bars').style.display = $('back').style.display = $('auto').style.display = run ? '' : 'none'; if (!run) $('bossbar').style.display = 'none'; }
    if (run && R) {
      set('h-depth', f(B.depthM(hero.r)) + ' 米'); bar('b-st', R.st, R.stMax); bar('b-hp', R.hp, R.hpMax);
      const a = G.vipOwn('auto') ? (s.auto ? 'on' : 'off') : 'lock'; if (cache.auto !== a) { cache.auto = a; $('auto').className = 't ' + a; }
      const boss = R.mons.find(m => m.boss && !m.dead && Math.abs(m.r - hero.r) <= 3), bb = $('bossbar');
      if (!!boss !== !!cache.boss) { cache.boss = !!boss; bb.style.display = boss ? 'block' : 'none'; if (boss) bb.querySelector('b').textContent = '守卫 ' + G.MON_NAME[boss.kind]; }
      if (boss) { const k = Math.round(boss.hp / boss.max * 300); if (cache.bossk !== k) { cache.bossk = k; bb.querySelector('i').style.width = Math.max(0, boss.hp / boss.max * 100) + '%'; bb.querySelector('span').textContent = f(Math.max(0, Math.ceil(boss.hp))) + ' / ' + f(boss.max); } }
      const ht = $('hoptut'); if (ht) {   // v0.20 tfix（review 建议-3）：小跳手势只在头顶是空格时有意义：头顶变成土 / 有怪就立刻收起；位置跟着主角
        if (G.cell(hero.c, hero.r - 1).t !== 0 || R.mons.some(m => !m.dead && m.c === hero.c && m.r === hero.r - 1)) ui.hopTipOff();
        else { const hs = G.heroScreen(), st = G.state(); ht.style.left = Math.round(hs.x) + 'px'; ht.style.top = Math.round(hs.y + st.T * 0.3 * $('cv').clientWidth / st.VW) + 'px'; }   // 同 game.js hopTip：主角头顶 0.9 格
      }
      const mt = $('movetut'); if (mt) { if (!s.tut.move && R.blocks >= 2) { s.tut.move = 1; mt.remove(); } else { const hs = G.heroScreen(); mt.style.left = Math.round(hs.x) + 'px'; mt.style.top = Math.round(hs.y + 1.6 * remPx()) + 'px'; } }   // v0.20 修复线：挖了 2 下后手势消失
    }
    { const tr = G.state().trans, hide = mode === 'rise' || !!(tr && (tr.k === 'rise' || tr.k === 'dive')); if (cache.dhide !== hide) { cache.dhide = hide; $('h-depth').style.visibility = hide ? 'hidden' : ''; } }   // v0.20 tfix：下矿 / 回地面过渡中顶栏不挂“最深 X 米”（顶栏只放玩家要用的；占位不变，落地后原样出现）
    if (!(run && R) && cache['h-depth'] !== 'b' + s.best) { cache['h-depth'] = 'b' + s.best; $('h-depth').innerHTML = s.best ? `<small>最深</small><span>${f(s.best)} 米</span>` : ''; fitSoon(); }   // v0.20 修复线（一般-1）：走 fmtNum；顶栏按最长格式留宽（ui.css .depth min-width），不再整排缩小
    if (mode === 'shore') {   // 建筑名牌跟着镜头（世界格 → CSS 像素）
      const st = G.state(), k = $('cv').clientWidth / st.VW, T = st.T * k, ox = ($('cv').clientWidth - 7 * T) / 2;
      // v0.20 修复线：名牌跟着建筑，但不能压到侧边按钮、顶栏（顶部安全区高的机型侧边按钮整列下移，原来「技能屋」会压到「宠物」）——
      // 和侧边按钮重叠时横向让开到按钮内侧 8px，太靠上时压到顶栏下 8px。侧边按钮 / 顶栏的位置只在尺寸变化时量一次
      if (!tagAvoid) { const w = $('wrap').getBoundingClientRect(), rb = s2 => { const r = $('shore').querySelector(s2).getBoundingClientRect(); return { l: r.left - w.left, t: r.top - w.top, r: r.right - w.left, b: r.bottom - w.top }; }; tagAvoid = { L: rb('.side.l'), R: rb('.side.r'), top: $('hud').querySelector('.res').getBoundingClientRect().bottom - w.top }; }
      const pos = (id, x, y) => { const e = $(id), tw = e.offsetWidth, th = e.offsetHeight + .45 * remPx(); let X = ox + x * T, Y = (y * st.T - st.camY) * k;
        Y = Math.max(Y, tagAvoid.top + 8 + e.offsetHeight);
        for (const [sd, S] of [['L', tagAvoid.L], ['R', tagAvoid.R]]) if (X + tw / 2 > S.l - 8 && X - tw / 2 < S.r + 8 && Y - e.offsetHeight < S.b + 8 && Y + th - e.offsetHeight > S.t - 8) X = sd === 'R' ? S.l - 8 - tw / 2 : S.r + 8 + tw / 2;
        e.style.transform = `translate(${Math.round(X)}px, ${Math.round(Y)}px) translate(-50%, -100%)`; };
      const TL = window.TOWN.L; pos('tag-smithy', TL.smithy.x0 + 1.3, TL.smithy.y - 3.62); pos('tag-house', 5.84, TL.house.y - 3.05);   // 跟着布局表走，不写死
    }
    if (tab === 'shop' && $('doll')) G.drawDoll($('doll'), preview ? Object.assign({}, s.gear, { [preview.slot]: preview.t }) : s.gear, null, dt);
  };
  // v0.20 修复线：第一次下矿的操作教程改成手势动画（复用铁匠铺教程 / 小跳教学的光点手势：在主角身上按住往下划），不写字；挖了 2 下后消失
  ui.showRun = () => { $('shore').style.display = 'none'; ui.close(true); if (!S().tut.move && !$('movetut')) { const d = document.createElement('div'); d.id = 'movetut'; d.className = 'hoptut move'; d.innerHTML = '<i class="hand"></i>'; d.style.setProperty('--dx', '0px'); d.style.setProperty('--dy', '3.4rem'); $('wrap').appendChild(d); } };
  ui.hideRun = () => { $('bossbar').style.display = 'none'; cache.boss = false; const t = $('movetut'); if (t) t.remove(); ui.hopTipOff(); };
  // v0.19 守卫第一次出冲撞 / 砸地：主角头顶一个往上划的手势（不写字），玩家第一次小跳后不再出现
  ui.hopTip = (x, y) => {
    if ($('hoptut')) return; const d = document.createElement('div'); d.id = 'hoptut'; d.className = 'hoptut'; d.innerHTML = '<i class="hand"></i>';
    d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.setProperty('--dx', '0px'); d.style.setProperty('--dy', '-3.2rem'); $('wrap').appendChild(d);
    clearTimeout(ui._hopT); ui._hopT = setTimeout(() => { const e = $('hoptut'); if (e) e.remove(); }, 2600);
  };
  ui.hopTipOff = () => { const e = $('hoptut'); if (!e) return false; e.remove(); return true; };
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
  ui.open = k => { if (k === 'skill' && tab !== 'skill') { fitTree = true; knownSeen = null; } tab = k; preview = null; snd('ui_open'); $('panel').dataset.tab = k; $('panel').classList.add('on'); render(); if (k === 'shop' && !S().tut.drag) setTimeout(tutDrag, 450); };
  ui.close = quiet => { if (!tab) return; tab = null; preview = null; const t = $('tut'); if (t) t.remove(); $('panel').classList.remove('on'); if (runPause) { runPause = false; G.paused = false; $('wrap').classList.remove('pnrun'); } if (!quiet) { snd('ui_close'); G.exitDoor(); } };
  ui.tab = () => tab;
  // 打开 VIP 页并把解锁 key 的那一级滚到眼前、闪一下。挖矿中打开时暂停这一趟（G.paused），关掉面板再继续
  let runPause = false;
  function vipAt(key) {
    const i = B.VIP.findIndex(v => v[key]); if (G.state().mode === 'run') { runPause = true; G.paused = true; $('wrap').classList.add('pnrun'); }
    ui.open('vip'); const c = $('panel').querySelector(`[data-vipi="${i}"]`), pb = $('panel').querySelector('.pbody'); if (!c || !pb) return;
    pb.scrollTop = Math.max(0, c.offsetTop - pb.offsetTop - (pb.clientHeight - c.offsetHeight) / 2); c.classList.add('focus'); setTimeout(() => c.classList.remove('focus'), 1500);
  }
  ui.vipAt = vipAt;
  // 只处理标签之间的文字：① 数字和单位（10 秒、+2 格、50%、×1.5）包成不换行的一段（v0.18 修复：原来会拆成“每 10 / 秒”）；② × 换成对齐用的 <i class="mul">
  const NW = /([+\-−×]?\s?\d+(?:\.\d+)?%?(?:\s?(?:秒|格|次|趟|米|天|小时|分钟|个|级|件|只|颗))?)/g;
  const mulfix = h => h.split(/(<[^>]*>)/).map(t => t[0] === '<' || !/\d/.test(t) ? t.replace(/×/g, '<i class="mul">×</i>') : t.replace(NW, m => /\s/.test(m.trim()) || m.length > 2 ? `<nb>${m}</nb>` : m).replace(/×/g, '<i class="mul">×</i>')).join('');
  const head = t => `<div class="phead"><h2 class="t">${t}</h2><button class="close" data-close="1">${img('close')}</button></div>`;
  const costHtml = (coin, mat) => {
    const s = S(); let h = `<span class="${s.coin >= coin ? '' : 'lack'}">${img('coin')}${f(coin)}</span>`;
    for (const k in mat || {}) h += `<span class="m ${matShow(k) >= mat[k] ? 'ok' : 'lack'}" data-mat="${k}" data-need="${mat[k]}">${img(k)}<i>${f(matShow(k))}/${f(mat[k])}</i></span>`;   // bfix 一般-2：显示存档 − 还在飞的，飞到才变   // v0.20（用户 23:13）：铁匠铺不再常驻整排材料，每件商品直接显示「拥有/需要」
    return h;
  };
  // v0.20：装数字的框放不下时自动缩小字号（不折行、不出框、不挤别的元素）；.fit 元素要 display:block + overflow:hidden + nowrap，宽度由父框定
  const FS_MIN = 11;
  function fitText(root) {
    (root || document).querySelectorAll('.fit').forEach(e => { e.style.fontSize = ''; const need = e.scrollWidth, have = e.clientWidth; if (have > 0 && need > have + .5) { const fs = parseFloat(getComputedStyle(e).fontSize); e.style.fontSize = Math.max(Math.min(fs, FS_MIN), fs * Math.max(.45, have / need) * .97) + 'px'; } });   // v0.20 修复线（一般-5）：缩字号不低于 11px（框按最长格式留宽，正常不会缩到这里）
  }
  ui.fitText = fitText;
  function render() {
    const s = S(), D = G.D(), P = $('panel'); let h = '';
    const scEl = P.querySelector(tab === 'shop' ? '.items' : '.pbody'), sc = scEl ? scEl.scrollTop : 0;   // v0.7：铁匠铺只有商品区滚动
    if (tab === 'shop') {
      const pg = preview ? Object.assign({}, s.gear, { [preview.slot]: preview.t }) : s.gear;
      // v0.20 修复线：属性值 / 差值分两段（放不下时差值换到下一行，不缩到看不清）；「基础×技能」两段各自不拆、放不下就换行（一般-5）
      const statBox = sl => { const st = B.SLOT[sl].stat, m = D.mult[st], b0 = B.GEAR[sl][s.gear[sl] || 0].v, b1 = B.GEAR[sl][pg[sl] || 0].v, up = b1 !== b0;
        return `<div class="stat" data-st="${st}">${img(st, 'si')}<div class="sv"><b>${STAT[st]}</b><em class="t"><span class="n fit">${fv(b1 * m)}</span>${up ? `<i class="${b1 > b0 ? 'up' : 'down'}">${b1 > b0 ? '▲' : '▼'}${fv(Math.abs(b1 - b0) * m)}</i>` : ''}</em></div><small><nb>基础${fv(b1)}</nb><nb>×技能${f(m)}</nb></small></div>`; };
      h += head('铁匠铺') + `<div class="pbody shop"><div class="dollrow"><div class="col">${statBox('weapon')}${statBox('shield')}</div><canvas id="doll" width="320" height="320"></canvas><div class="col">${statBox('helmet')}${statBox('armor')}</div></div>
        <div class="slots">${B.SLOTS.map(sl => { const g = B.GEAR[sl][s.gear[sl] || 0];   /* v0.20（用户 23:08）：装备槽永远是真正穿着的（s.gear），预览只给纸娃娃试穿和属性差值，买下后才换 */ return `<div class="slot" data-slot="${sl}">${gearImg(g.spr)}</div>`; }).join('')}</div>
        <div class="tabs">${B.SLOTS.map(sl => `<button class="tab ${sl === shopTab ? 'on' : ''}" data-stab="${sl}">${B.SLOT[sl].name}${B.GEAR[sl].some((g, t) => G.canGear(sl, t)) ? '<i class="dot"></i>' : ''}</button>`).join('')}</div>
        <div class="items">${B.GEAR[shopTab].map((g, t) => {
          const own = (s.gear[shopTab] || 0) >= t, wear = (s.gear[shopTab] || 0) === t, st = B.SLOT[shopTab].stat;
          if (g.next) return `<div class="item next">${gearImg(g.spr)}<b>${g.name}</b><span class="fit">${STAT[st]} ${f(g.v)}</span><small class="lk">${img('lock')}${s.boss ? '' : `<canvas width="80" height="80" data-mon="${BOSS_KIND}"></canvas>`}</small></div>`;   // v0.20 修复线（一般-8）：不写「沙岩层开放」，锁 + 守卫头像
          return `<div class="item ${wear ? 'wear' : own ? 'own' : G.canGear(shopTab, t) ? 'can' : 'no'} ${preview && preview.slot === shopTab && preview.t === t ? 'pv' : ''}" data-item="${t}">${gearImg(g.spr)}<b>${g.name}</b><span class="fit">${STAT[st]} ${f(g.v)}</span>
            ${wear ? '<small class="on">穿着</small>' : own ? '<small>已拥有</small>' : `<div class="cost">${costHtml(g.coin, g.mat)}</div>`}</div>`; }).join('')}</div></div>`;
    } else if (tab === 'skill') {
      h += head('技能屋') + `<div class="skstats" id="skstats"></div><div class="pbody tree" id="tree"><svg id="links"></svg><div id="nodes"></div></div><div class="detail" id="detail"></div>`;
    } else if (tab === 'pet') {
      h += head('宠物') + '<div class="pbody">';
      for (const k in B.PETS) { const p = B.PETS[k], own = s.pets.includes(k), v = B.VIP.find(x => x.pet === k), sg = B.SIGN.findIndex(x => x.pet === k);
        h += `<div class="card pet ${own ? '' : 'unk'}"><div class="ic kslot"><canvas width="160" height="160" data-pet="${k}"></canvas></div><div class="mid"><b>${p.name}</b><span>${own ? B.petDesc(B.derive(Object.assign({}, s, { pet: k })).pet || p) : p.desc}</span>${own ? '' : `<span class="src">${img('lock')}${v ? 'VIP ' + (B.VIP.indexOf(v) + 1) : '签到第 ' + (sg + 1) + ' 天'}</span>`}</div>${own ? `<button class="buy t ${s.pet === k ? 'no' : 'green'}" data-setpet="${k}">${s.pet === k ? '跟随中' : '带上'}</button>` : ''}</div>`; }
      h += '</div>';
    } else if (tab === 'codex') {
      h += head('图鉴') + `<div class="tabs"><button class="tab ${ctab === 'mon' ? 'on' : ''}" data-ctab="mon">怪物</button><button class="tab ${ctab === 'mat' ? 'on' : ''}" data-ctab="mat">材料</button></div><div class="pbody"><div class="grid">`;
      if (ctab === 'mon') for (const k of G.MON_KINDS) { const M = B.MON[k], n = s.codex[k] || 0;
        h += `<div class="cell ${n ? '' : 'unk'}"${M.mat ? ` data-mat="${M.mat}"` : ''}><div class="kslot"><canvas width="160" height="160" data-mon="${k}"></canvas></div><b>${n ? M.name : '？？？'}</b><span>${M.boss ? M.from + ' 米守卫' : (M.from || 0) + ' 米起'}${n ? ' · 击败 ' + f(n) : ''}</span>${M.mat ? `<span class="drop">掉落 ${img(M.mat)}${B.MAT[M.mat].name}${M.boss ? '（首杀必掉）' : ' ' + Math.round((k === 'Slime_Green' ? D.slimeP : M.p) * 100) + '%'}</span>` : ''}</div>`; }
      else for (const k of B.MAT_ORDER) { const M = B.MAT[k], seen = s.seen[k] || s.mat[k];
        h += `<div class="cell mat ${seen ? '' : 'unk'}" data-mat="${k}"><div class="kslot"><img class="big" src="${src(k)}"></div><b>${M.name}</b><span>拥有 ${f(s.mat[k] || 0)}</span><span class="drop">${M.src}</span></div>`; }
      h += '</div></div>';
    } else if (tab === 'vip') {   // v0.18（系统与数值 16 节）：顶部 = 当前 VIP + 进度 + 看广告（可连续看）；下面每级一张卡：领取 / 已领 / 穿上·脱下 / 拿上·收起
      const tg = B.VIP.find(v => v.ads > s.vipAds), left = G.adLeft('vip');
      h += head('VIP') + `<div class="pbody"><div class="card vipnow"><div class="ic vipi">${img('vip')}</div><div class="mid"><b>VIP ${s.vip}</b>${tg ? `<div class="prog"><i style="width:${Math.min(100, s.vipAds / tg.ads * 100)}%"></i><span class="t">${f(s.vipAds)} / ${f(tg.ads)}</span></div>` : ''}</div>${tg && left ? '<button class="buy t green" id="vip-ad">看广告</button>' : ''}</div>`;
      B.VIP.forEach((v, i) => { const got = i < s.vip, ready = !got && i === s.vip && s.vipAds >= v.ads;
        let btn;
        if (got && v.skin) btn = s.skin === v.skin ? `<button class="buy t lite" data-skin="">脱下</button>` : `<button class="buy t green" data-skin="${v.skin}">穿上</button>`;
        else if (got && v.staff) btn = s.staff ? '<button class="buy t lite" data-staff="0">收起</button>' : '<button class="buy t green" data-staff="1">拿上</button>';
        else if (got) btn = '<button class="buy t done">已领</button>';
        else if (ready) btn = '<button class="buy t green" data-vip="1">领取<i class="dot"></i></button>';
        else btn = `<button class="buy t no">${f(Math.min(s.vipAds, v.ads))}/${f(v.ads)}</button>`;
        h += `<div class="card ${got && !v.skin && !v.staff ? 'got' : ''}" data-vipi="${i}"><div class="ic vipi">${vipIcon(v)}<b class="t">${i + 1}</b></div><div class="mid"><b>${v.name}</b><span>${vipDesc(v)}</span></div>${btn}</div>`; });
      h += '</div>';
    } else if (tab === 'sign') {
      const ready = G.signReady(), n = s.sign.n;
      h += head('7 天签到') + `<div class="pbody"><div class="days">${B.SIGN.map((d, i) => `<div class="day ${i < n ? 'got' : i === n && ready ? 'now' : ''}"><b>第 ${i + 1} 天</b>${signIcon(d)}<span>${d.text}</span>${i < n ? '<i class="ok">✓</i>' : ''}</div>`).join('')}</div>
        ${ready ? '<button class="buy t green wide" id="sign-go">领取</button>' : ''}</div>`;
    }
    P.innerHTML = mulfix(h); if (press && press.ghost) P.appendChild(press.ghost);   // v0.20：拖拽中被别处刷新面板时，浮起的卡片留着
    const pb = P.querySelector(tab === 'shop' ? '.items' : '.pbody'); if (pb && tab !== 'skill') pb.scrollTop = sc;
    if (tab === 'skill') renderTree();
    P.querySelectorAll('canvas[data-mon]').forEach(c => c.closest('.lk') ? portraitFit(c, c.dataset.mon) : G.portrait(c, c.dataset.mon));
    P.querySelectorAll('canvas[data-pet]').forEach(c => G.petPortrait(c, c.dataset.pet));
    if (tab === 'shop') fitShop();
    fitText(P);
    if (tab === 'shop') { bindDrag(); bindScrollThumb(P.querySelector('.items')); }
    else if (tab !== 'skill') bindScrollThumb(P.querySelector('.pbody'));   // v0.18：其余面板的滚动区也用棕色滑块
  }
  // 小头像：先画到离屏画布，按不透明部分裁边后居中放进 c（守卫的骨骼原点不在图中间，直接画会偏到一边）
  function portraitFit(c, kind) {
    const o = document.createElement('canvas'); o.width = o.height = 240; G.portrait(o, kind);
    const b = bboxOf(o) || [0, 0, 240, 240], g = c.getContext('2d'), s = Math.min(c.width / b[2], c.height / b[3]) * .92;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(o, b[0], b[1], b[2], b[3], (c.width - b[2] * s) / 2, (c.height - b[3] * s) / 2, b[2] * s, b[3] * s);
  }
  /* v0.20 修复线（一般-10）：铁匠铺下面有空就分给商品卡的装备图（每排最多 +3.2rem）和装备槽（最多 +1.2rem），不留整块空白；放不下（要滚动）时保持原尺寸 */
  function fitShop() {
    const P = $('panel'), it = P.querySelector('.items'); if (!it) return;
    P.style.removeProperty('--giAdd'); P.style.removeProperty('--slotAdd');
    const free = P.getBoundingClientRect().bottom - parseFloat(getComputedStyle(P).paddingBottom) - it.getBoundingClientRect().bottom - 8;
    if (free < 4 || it.scrollHeight > it.clientHeight + 2) return;
    const R = remPx(), rows = Math.max(1, Math.ceil(it.querySelectorAll('.item:not(.ghost)').length / 3)), sa = Math.min(free * .25, 1.2 * R), ga = Math.min((free - sa) / rows, 3.2 * R);
    P.style.setProperty('--slotAdd', Math.floor(sa) + 'px'); P.style.setProperty('--giAdd', Math.floor(ga) + 'px');
  }
  window.addEventListener('resize', () => { if (tab === 'shop') { fitShop(); fitText($('panel')); } });
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
  // v0.20（用户 iPhone 反馈：竖着 / 斜着拖会变成滚动列表；拖的只是小武器图、被手指挡住）：
  // 长按 DRAG.hold 毫秒 = 卡片“浮起”进入拖拽（按住期间卡片微缩 + 金色描边一圈渐满，满了放 pick_soft）；没按满就移动 = 正常滚动列表（原生滚动，带惯性）；
  // 浮起的是整张卡片的复制（放大 DRAG.scale、投影），卡片底边在手指上方 DRAG.gap rem，不被手指挡住；浮起后拦掉 touchmove，任何方向都能拖；
  // 放进对应部位的槽 = 买下穿上；槽外 / 别的槽 / 买不起 = 飞回原位（放下音 pick_soft 低一档）。参考见 docs/v0.20各线笔记/panel.md
  const DRAG = ui.DRAG = { hold: 1000, show: 120, slop: 10, gap: 2.2, scale: 1.08, back: 220 };   // v0.20 修复线：gap 1.4 → 2.2rem，手指肚不盖住卡片底边的价格行
  let press = null;
  window.addEventListener('touchmove', e => { if (press && press.lifted && e.cancelable) e.preventDefault(); }, { passive: false });   // 浮起后不让页面 / 列表滚动
  const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  function bindDrag() {
    const box = $('panel').querySelector('.items'); if (!box) return;
    box.oncontextmenu = e => e.preventDefault();   // 长按不弹系统菜单
    box.querySelectorAll('.item[data-item]').forEach(el => el.onpointerdown = e => {
      if (press || (e.pointerType === 'mouse' && e.button !== 0)) return;
      dragMoved = false; tutHide(true);   // v0.20 修复线（一般-7）：一按下任何商品就先藏起教程光圈，不和真正的长按描边叠在一起；松手没买再出来
      const t = +el.dataset.item; if ((S().gear[shopTab] || 0) >= t) return;   // 已拥有 / 穿着：只能点（预览）和滚动
      const r = el.getBoundingClientRect(), p = press = { el, t, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, lifted: false, r };
      const ns = 'http://www.w3.org/2000/svg', sv = document.createElementNS(ns, 'svg'), rc = document.createElementNS(ns, 'rect');
      sv.setAttribute('class', 'lp'); sv.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`); sv.setAttribute('width', r.width); sv.setAttribute('height', r.height);
      rc.setAttribute('x', 1.5); rc.setAttribute('y', 1.5); rc.setAttribute('width', r.width - 3); rc.setAttribute('height', r.height - 3); rc.setAttribute('rx', .8 * remPx()); rc.setAttribute('pathLength', 1);
      sv.appendChild(rc); el.appendChild(sv); p.ring = sv;
      rc.style.transition = `stroke-dashoffset ${DRAG.hold - DRAG.show}ms linear ${DRAG.show}ms`;
      requestAnimationFrame(() => { if (press === p) { el.classList.add('hold'); sv.classList.add('go'); } });
      p.timer = setTimeout(() => lift(p), DRAG.hold);
      window.addEventListener('pointermove', pmove); window.addEventListener('pointerup', pup); window.addEventListener('pointercancel', pcancel);
    });
  }
  function tutHide(on) { const tu = $('tut'); if (tu) tu.style.display = on ? 'none' : ''; }
  window.addEventListener('pointerup', () => { if (!press) setTimeout(() => { if (!press) tutHide(false); }, 0); }, true);   // 点已拥有的卡（不进 press）松手后教程也回来
  function pressEnd() { const p = press; if (!p) return; if (!p.lifted) tutHide(false); clearTimeout(p.timer); window.removeEventListener('pointermove', pmove); window.removeEventListener('pointerup', pup); window.removeEventListener('pointercancel', pcancel); if (p.ring) p.ring.remove(); p.el.classList.remove('hold', 'lift-src'); press = null; }
  function pmove(ev) {
    const p = press; if (!p || ev.pointerId !== p.id) return; p.x = ev.clientX; p.y = ev.clientY;
    if (!p.lifted) { if (Math.hypot(p.x - p.x0, p.y - p.y0) > DRAG.slop) pressEnd(); return; }   // 没按满就动了 = 滚动列表，交给浏览器
    placeGhost(p);
  }
  function ghostCenter(p) { const w = $('panel').getBoundingClientRect(), h = p.r.height * DRAG.scale; return { x: p.x, y: Math.max(w.top + h / 2, p.y - DRAG.gap * remPx() - h / 2) }; }
  function placeGhost(p) {
    const c = ghostCenter(p), w = $('panel').getBoundingClientRect(); p.ghost.style.left = (c.x - w.left - p.r.width / 2) + 'px'; p.ghost.style.top = (c.y - w.top - p.r.height / 2) + 'px';
    const sl = slotAt(c.x, c.y) || slotAt(p.x, p.y); $('panel').querySelectorAll('.slot').forEach(x => x.classList.toggle('hover', x === sl)); p.over = sl;
  }
  function lift(p) {
    if (press !== p || tab !== 'shop' || !p.el.isConnected) return pressEnd();
    p.lifted = true; dragMoved = true; snd('pick_soft', 0.9); if (navigator.vibrate) navigator.vibrate(12);
    const w = $('panel').getBoundingClientRect(), g = p.el.cloneNode(true); g.querySelectorAll('.lp, .dot').forEach(x => x.remove()); g.classList.remove('hold'); g.classList.add('ghost'); g.removeAttribute('data-item');
    g.style.width = p.r.width + 'px'; g.style.height = p.r.height + 'px'; g.style.left = (p.r.left - w.left) + 'px'; g.style.top = (p.r.top - w.top) + 'px';
    $('panel').appendChild(g); p.ghost = g; p.el.classList.remove('hold'); p.el.classList.add('lift-src'); if (p.ring) { p.ring.remove(); p.ring = null; }
    const tu = $('tut'); if (tu) tu.style.display = 'none';
    g.style.transition = 'left .14s ease-out, top .14s ease-out'; requestAnimationFrame(() => { g.classList.add('up'); placeGhost(p); setTimeout(() => { if (p.ghost) p.ghost.style.transition = 'none'; }, 150); });
  }
  function pcancel(ev) { const p = press; if (!p || ev.pointerId !== p.id) return; if (p.lifted) flyBack(p, null); else pressEnd(); }
  function pup(ev) {
    const p = press; if (!p || ev.pointerId !== p.id) return;
    if (!p.lifted) { pressEnd(); return; }   // 没按满就松手 = 普通点击（click 事件做预览）
    p.x = ev.clientX; p.y = ev.clientY; const c = ghostCenter(p), s = slotAt(c.x, c.y) || slotAt(p.x, p.y), t = p.t;
    if (s && s.dataset.slot === shopTab && G.canGear(shopTab, t)) {   // 放进槽：卡片缩进槽里再买
      const g = p.ghost, b = s.getBoundingClientRect(), w = $('panel').getBoundingClientRect(); pressEnd();
      g.style.transition = 'left .16s ease-in, top .16s ease-in, transform .16s ease-in, opacity .16s'; g.style.left = (b.left + b.width / 2 - w.left - p.r.width / 2) + 'px'; g.style.top = (b.top + b.height / 2 - w.top - p.r.height / 2) + 'px'; g.style.transform = 'scale(.35)'; g.style.opacity = '0';
      setTimeout(() => { g.remove(); if (tab === 'shop') buyFx(t); }, 170);
    } else {
      // v0.20（用户 23:14：玩家自己看得到结果的不弹字）：买不起 = 卡片摇一下 + 缺的「拥有/需要」红字闪；放错槽 = 正确的槽闪一下。都不弹提示条（提示条在纸娃娃上面会挡人）
      if (s && s.dataset.slot === shopTab) { snd('deny'); p.el.classList.add('shake'); p.el.querySelectorAll('.lack').forEach(x => x.classList.add('flash')); const el = p.el; setTimeout(() => el.classList.remove('shake'), 450); }
      else if (s) { snd('deny'); const ok = $('panel').querySelector(`.slot[data-slot="${shopTab}"]`); if (ok) { ok.classList.remove('hint'); void ok.offsetWidth; ok.classList.add('hint'); setTimeout(() => ok.classList.remove('hint'), 900); } }
      flyBack(p, s);
    }
    setTimeout(() => { dragMoved = false; }, 60);
  }
  function flyBack(p, s) {   // 飞回原位：缩回 1 倍、回到卡片原来的位置后再显示原卡片
    const g = p.ghost, el = p.el, w = $('panel').getBoundingClientRect(), r = el.isConnected ? el.getBoundingClientRect() : p.r; press = null; clearTimeout(p.timer);
    window.removeEventListener('pointermove', pmove); window.removeEventListener('pointerup', pup); window.removeEventListener('pointercancel', pcancel);
    snd('drop', 0.8);   /* v0.20 修复线：放下 / 飞回 = drop（和浮起的 pick_soft 同一组布料音） */ $('panel').querySelectorAll('.slot').forEach(x => x.classList.remove('hover'));
    if (g) { g.style.transition = `left ${DRAG.back}ms ease-out, top ${DRAG.back}ms ease-out, transform ${DRAG.back}ms ease-out`; g.classList.remove('up'); g.style.left = (r.left - w.left) + 'px'; g.style.top = (r.top - w.top) + 'px'; }
    setTimeout(() => { if (g) g.remove(); el.classList.remove('lift-src'); const tu = $('tut'); if (tu) tu.style.display = ''; }, DRAG.back + 20);
    setTimeout(() => { dragMoved = false; }, 60);
  }
  const slotAt = (x, y) => [...$('panel').querySelectorAll('.slot[data-slot]')].find(s => { const r = s.getBoundingClientRect(); return x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 10 && y <= r.bottom + 10; });
  function buyFx(t) {
    const st = B.SLOT[shopTab].stat, v0 = B.GEAR[shopTab][S().gear[shopTab] || 0].v * G.D().mult[st];
    const coin0 = S().coin; G.buyGear(shopTab, t); preview = null; S().tut.drag = 1; G.save(); const tut = $('tut'); if (tut) tut.remove();
    render(); const sl = $('panel').querySelector(`.slot[data-slot="${shopTab}"]`);
    if (sl) { sl.classList.add('bought'); const bu = document.createElement('i'); bu.className = 'burst'; sl.appendChild(bu); }
    const sb = $('panel').querySelector(`.stat[data-st="${st}"]`); if (sb) { sb.classList.add('bump'); rollNum(sb.querySelector('em .n'), v0, B.GEAR[shopTab][t].v * G.D().mult[st]); }   // 属性数字从旧值滚到新值
    countDown($('h-coin'), coin0, S().coin, 'spend');
    G.dollPlay('Victory');   // v0.20（用户 23:14）：不再弹「买下并穿上」提示条——槽换图、纸娃娃换装举剑、音效、数字跳动已经够了
  }
  // v0.20：数字滚动统一由 lootHud 做（显示值追着“存档 − 还在飞的”），这里只给计数框加一下花钱 / 收钱的闪动样式
  function countDown(el, a, b, cls) { const c = cls || 'gainp', pn = el.parentNode; pn.classList.remove(c); void pn.offsetWidth; pn.classList.add(c); setTimeout(() => pn.classList.remove(c), 550); }
  function tutDrag() {   // 第一次进铁匠铺：光点在卡片上按住（圈一圈渐满 = 长按 1 秒）→ 卡片影子浮起 → 拖到装备槽（v0.20 改成演示“长按再拖”）
    if (tab !== 'shop' || S().tut.drag || $('tut')) return;
    const it = $('panel').querySelector('.item.can') || $('panel').querySelector('.item.no'), sl = $('panel').querySelector(`.slot[data-slot="${shopTab}"]`); if (!it || !sl) return;
    const a = it.getBoundingClientRect(), b = sl.getBoundingClientRect(), w = $('wrap').getBoundingClientRect();
    const d = document.createElement('div'); d.id = 'tut'; d.style.setProperty('--hold', DRAG.hold + 'ms');
    d.innerHTML = `<div class="tcard" style="width:${a.width}px;height:${a.height}px;left:${-a.width / 2}px;top:${-a.height / 2}px"></div><i class="hand"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" pathLength="1"/></svg></i>`;
    d.style.left = (a.left + a.width / 2 - w.left) + 'px'; d.style.top = (a.top + a.height / 2 - w.top) + 'px';
    d.style.setProperty('--dx', (b.left + b.width / 2 - a.left - a.width / 2) + 'px'); d.style.setProperty('--dy', (b.top + b.height / 2 - a.top - a.height / 2) + 'px');
    d.style.setProperty('--ly', -(a.height * DRAG.scale / 2 + DRAG.gap * remPx()) + 'px');   // 浮起的卡片在手指上方（和真实拖拽同一偏移）；卡片中心对准槽时手指在槽下面
    $('wrap').appendChild(d);
  }

  /* ---------- 技能屋：网状技能树 ---------- */
  // 节点间距（rem）：v0.18 修复——原来横竖都是 3.12，菱形上下左右顶角相碰，级数角标（挂在菱形下角）被正下方的节点盖住。
  // 竖向拉开到下方节点顶角离角标底边 ≥ .3rem，横向只放宽到左右顶角不相碰（再宽 7 列在 390 宽屏放不下）（tools/test/petsk.js 查角标不被遮挡）
  const NGX = 3.2, NGY = 3.96; let knownSeen = null;
  function renderTree() {
    const s = S(), box = $('tree'), N = $('nodes'), L = $('links'); if (!box) return;
    const seen = B.SK.filter(n => B.skSeen(s, n));
    let h = '', lines = '';
    const xy = n => [n.x * NGX, n.y * NGY];
    for (const n of seen) for (const [rid] of n.req || []) { const p = B.SKI[rid]; if (!seen.includes(p)) continue; const [x1, y1] = xy(p), [x2, y2] = xy(n), on = G.skLv(rid) >= 1;   /* 用户 17:49：前置点了 1 级就算满足 */   // v0.10：前置满足 = 实线（分支色），没满足 = 虚线
      const R = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;   // v0.10：SVG 属性不认 rem，连线一直没画出来 → 换算成 px
      lines += `<line data-to="${n.id}" x1="${x1 * R}" y1="${y1 * R}" x2="${x2 * R}" y2="${y2 * R}" class="${on ? 'on' : ''}" style="${on ? 'stroke:' + B.BR_COL[n.br] : ''}"/>`; }
    for (const n of seen) { const l = G.skLv(n.id), open = B.skOpen(s, n), can = G.canSkill(n.id), [x, y] = xy(n);
      h += `<button class="sk ${n.mech ? 'mech' : ''} ${l >= n.max ? 'max' : ''} ${open ? '' : 'lock'} ${can ? 'can' : ''} ${l ? 'got' : ''} ${sel === n.id ? 'sel' : ''}" data-sk="${n.id}" style="left:${x}rem;top:${y}rem;--c:${B.BR_COL[n.br]}"><i></i><img src="assets/sk/${n.ic}.png" draggable="false">${n.max > 1 ? `<u class="t">${l}/${n.max}</u>` : ''}${open ? '' : `<em class="lkb">${img('lock')}${n.boss && !s.boss ? `<canvas width="60" height="60" data-mon="${BOSS_KIND}"></canvas>` : ''}</em>`}</button>`; }   /* v0.20 修复线：红点只挂入口（名牌 / 页签），能买的节点用 .can 高亮代替 */
    N.innerHTML = h; L.innerHTML = lines; N.querySelectorAll('.lkb canvas').forEach(c => portraitFit(c, c.dataset.mon));   // 没解锁 = 锁角标；要先打守卫的再带守卫小头像
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
    // v0.20 修复线：买完露出新节点时，把新节点平移进视野（离框边 ≥ 0.7 格），0.45 秒滑过去；玩家不用自己拖
    const fresh = knownSeen ? seen.filter(n => !knownSeen.has(n.id)) : []; knownSeen = new Set(seen.map(n => n.id));
    if (fresh.length) {
      const mg = ux * .7, W = box.clientWidth, Hh = box.clientHeight, fit1 = (vs, lo, hi) => { const a = Math.min(...vs), b = Math.max(...vs); let d = 0; if (b > hi) d = hi - b; if (a + d < lo) d = lo - a; return d; };
      const dx = fit1(fresh.map(n => ox + treePan.x + n.x * ux), mg, W - mg), dy = fit1(fresh.map(n => oy + treePan.y + n.y * uy), mg, Hh - mg);
      if (dx || dy) { apply(); const nx = cx(treePan.x + dx), ny = cy(treePan.y + dy); requestAnimationFrame(() => { N.style.transition = L.style.transition = 'transform .45s ease-out'; treePan.x = nx; treePan.y = ny; apply(); setTimeout(() => { N.style.transition = L.style.transition = ''; }, 500); }); }
    }
    apply();
    let pd = null;
    box.onpointerdown = e => { pd = { x: e.clientX, y: e.clientY, px: treePan.x, py: treePan.y, m: false }; };
    box.onpointermove = e => { if (!pd) return; const dx = e.clientX - pd.x, dy = e.clientY - pd.y; if (Math.hypot(dx, dy) > 6) pd.m = true; if (pd.m) { treePan.x = cx(pd.px + dx); treePan.y = cy(pd.py + dy); apply(); } };
    box.onpointerup = e => { const m = pd && pd.m; pd = null; if (m) return; const b = e.target.closest('[data-sk]'); if (b) { sel = b.dataset.sk; snd('ui_tap'); renderTree(); } };
    renderStats(); renderDetail();
  }
  /* v0.20（用户：技能树里看不到人物属性，买了 +100% 不知道加了多少）：顶部属性栏 + 说明卡「当前 → 买后」 */
  const KSTAT = [['dig'], ['atk'], ['def'], ['hp'], ['stam']];   // 和铁匠铺属性卡同样的图标
  const SKIC = { '挖掘力': 'dig', '攻击': 'atk', '防御': 'def', '血量': 'hp', '体力': 'stam', '金币获取': 'coin', '宝石获取': 'gem' };   // 说明卡数值行的图标；没有专门图标的用节点自己的图标
  const pctS = v => f(Math.round(v * 1000) / 10) + '%';
  // 说明卡里能显示的数值：[名字, 从 derive 结果取值（取不到 = null）, 格式]
  const SKV = [
    ['挖掘力', D => D.dig, statN], ['挥镐速度', D => D.freq, v => f(v) + ' 次/秒'], ['重击倍率', D => D.heavy || null, v => f(v, 1)], ['浅层方块伤害', D => D.soil, v => f(v, 1)],
    ['攻击', D => D.atk, statN], ['防御', D => D.def, statN], ['血量', D => D.hp, statN], ['体力', D => D.stam, statN],
    ['金币获取', D => D.coinM, pctS], ['宝石获取', D => D.gemM, pctS], ['倒下保住收获', D => D.keep, pctS], ['每块多掉材料', D => D.oreX, v => f(v) + ' 个'], ['史莱姆黏液掉率', D => D.slimeP, pctS],
    ['回旋镐冷却', D => D.boom ? D.boom.cd : null, v => f(v) + ' 秒'], ['巨镐旁格伤害', D => D.giant ? D.giant.sideK : null, pctS], ['照亮半径', D => D.lampR, v => f(v) + ' 格'],
    ['法杖射程', D => D.staff ? D.staffRange : null, v => f(v) + ' 格'], ['法杖伤害', D => D.staff ? D.staffK : null, pctS],
    ['宠物伤害', D => D.pet ? (D.pet.k || D.pet.mon || null) : null, v => f(v, 1)], ['宠物炸方块', D => D.pet ? D.pet.blk || null : null, v => f(v, 1)], ['宠物冷却', D => D.pet ? D.pet.cd : null, v => f(v) + ' 秒'],
    ['宠物回血', D => D.pet ? D.pet.heal || null : null, pctS], ['宠物回体力', D => D.pet ? D.pet.stam || null : null, pctS], ['宠物收蛛网范围', D => D.pet && D.pet.webR ? D.pet.webR : null, v => f(v) + ' 格'], ['宠物范围', D => D.pet ? D.pet.rng || null : null, v => '+' + f(v) + ' 格'],
  ];
  const deriveAt = (id, lv) => { const s = S(); return B.derive(Object.assign({}, s, { skill: Object.assign({}, s.skill, { [id]: lv }) })); };
  // 这个节点从 a 级到 b 级会变的数值：[[名字, 前, 后], ...]；机制节点（只开功能、不改数值）不显示
  function skDiff(n, a, b) {
    if (n.mech || n.id === 'root' || a < 0 || b > n.max) return [];
    const D0 = deriveAt(n.id, a), D1 = deriveAt(n.id, b), out = [];
    for (const [name, get, fm] of SKV) { const v0 = get(D0), v1 = get(D1); if (v0 === null || v1 === null || v0 === undefined || v1 === undefined) continue; const s0 = fm(v0), s1 = fm(v1); if (s0 !== s1) out.push([name, s0, s1]); }
    return out;
  }
  let lastStats = null, bumpNext = false;
  function renderStats() {
    const el = $('skstats'); if (!el) return; const D = G.D(), now = {};
    for (const [k] of KSTAT) now[k] = D[k];
    el.innerHTML = KSTAT.map(([k]) => `<div class="ks koct" data-ks="${k}">${img(k)}<em class="fit">${statN(now[k])}</em></div>`).join('');   // 用户 23:15：图标 + 数字，不写字
    if (bumpNext && lastStats) for (const [k] of KSTAT) if (lastStats[k] !== now[k]) { const c = el.querySelector(`[data-ks="${k}"]`); c.classList.add('bump'); rollNum(c.querySelector('em'), lastStats[k], now[k]); }
    lastStats = now; fitText(el);
  }
  // 数字滚动：中间值按目标值的小数位数取整（v0.20 修复线：攻击 5→9 滚动时不再出现 6.78）；fm = 目标值用的格式
  const decOf = v => { const s = String(Math.round(Math.abs(v) * 100) / 100), i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
  function rollNum(e, a, b, fm) { fm = fm || statN; const d = Math.max(decOf(a), decOf(b)), k10 = Math.pow(10, d), t0 = performance.now(); const step = t => { const k = Math.min(1, (t - t0) / 600), q = 1 - Math.pow(1 - k, 3); e.textContent = fm(k < 1 ? Math.round((a + (b - a) * q) * k10) / k10 : b); fitText(e.parentNode); if (k < 1 && e.isConnected) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  function renderDetail() {
    const n = B.SKI[sel], s = S(), l = G.skLv(n.id), open = B.skOpen(s, n), mx = l >= n.max, c = G.skCost(n.id);
    let req = ''; if (!open) req = (n.req || []).filter(([id]) => G.skLv(id) < 1).map(([id]) => B.SKI[id].name).concat(n.boss && !s.boss ? ['打败红甲虫王'] : []).join('、');
    // v0.20：会变的数值一行一个「图标 当前 → 买后」；满级显示现在的值；最多 2 行
    const df = mx ? skDiff(n, l - 1, l).map(([a, , c]) => [a, c]) : skDiff(n, l, l + 1);
    const dic = d => SKIC[d[0]] ? img(SKIC[d[0]]) : `<img src="assets/sk/${n.ic}.png" alt="">`;   // 用户 23:15：图标 + 数字 + 箭头，不写属性名
    const dd = df.slice(0, 2).map(d => d.length === 2 ? `<i class="dv fit">${dic(d)}<u>${d[1]}</u></i>` : `<i class="dv fit">${dic(d)}<u class="${bumpNext ? 'bump' : ''}">${d[1]}</u><b class="ar">→</b><em>${d[2]}</em></i>`).join('');
    // v0.10（用户 16:48）：固定 3 行 = 名字 + 级数 / 效果（最多 2 行）；不写“机制”、不写“现在 ×”、不重复“下一级”、前置条件交给连线（没满足 = 虚线）
    $('detail').innerHTML = mulfix(`<div class="dcard" style="--c:${B.BR_COL[n.br]}"><img src="assets/sk/${n.ic}.png"><div class="mid"><b>${n.name}${n.max > 1 ? `<small>　${l} / ${n.max}</small>` : ''}</b><span>${n.desc(l)}</span>${dd}</div>
      ${n.id === 'root' ? '' : mx ? '<button class="buy t done">已满</button>' : `<button class="buy t ${G.canSkill(n.id) ? 'green' : 'no'}" id="sk-buy"><span class="${s[c.cur] >= c.n ? '' : 'lack'}">${img(c.cur)}${f(c.n)}</span>${c.gem ? `<br><span class="${s.gem >= c.gem ? '' : 'lack'}">${img('gem')}${f(c.gem)}</span>` : ''}${c.mat ? '<em class="skm">' + Object.keys(c.mat).map(k => `<span class="m ${matShow(k) >= c.mat[k] ? 'ok' : 'lack'}" data-mat="${k}" data-need="${c.mat[k]}">${img(k)}<i>${f(matShow(k))}/${f(c.mat[k])}</i></span>`).join('') + '</em>' : ''}</button>`}</div>`);
    const b = $('sk-buy'); if (b) b.onclick = e => { if (e.target.closest('[data-mat]')) return; /* v0.18：点材料 = 弹“去哪拿”（onPanel 处理），不买 */ bumpNext = true; const ok = G.buySkill(n.id); bumpNext = false;   /* buySkill → G.refresh → 整个面板重画，属性栏和说明卡在那次重画里跳数字 */
      if (ok) { const el = $('nodes').querySelector(`[data-sk="${n.id}"]`); if (el) el.classList.add('pulse'); } else skDeny(n, b, open); };
  }

  /* v0.20 修复线（一般-3）：技能买不了不弹字，和铁匠铺统一——按钮和节点摇一下 + 缺的价格 / 材料闪红；没解锁 = 前置节点和连向它的虚线闪一下（画面上本来就是虚线 + 灰节点） */
  function skDeny(n, btn, open) {
    snd('deny', 0.8); const shake = el => { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 450); };
    shake(btn); shake($('nodes').querySelector(`[data-sk="${n.id}"]`));
    if (open) { btn.querySelectorAll('.lack').forEach(x => { x.classList.remove('flash'); void x.offsetWidth; x.classList.add('flash'); }); return; }
    (n.req || []).filter(([id]) => G.skLv(id) < 1).forEach(([id]) => { const e = $('nodes').querySelector(`[data-sk="${id}"]`); if (e) { e.classList.remove('need'); void e.offsetWidth; e.classList.add('need'); } });
    $('links').querySelectorAll(`line[data-to="${n.id}"]:not(.on)`).forEach(l => { l.classList.remove('need'); void l.getBBox(); l.classList.add('need'); });
  }

  /* ---------- 材料“去哪拿” ---------- */
  function matSource(k) {
    const M = B.MAT[k], s = S();
    const p = pop(`<div class="box src"><h2 class="t">${M.name}</h2><div class="kboard in"><div class="row"><div class="kslot"><img class="mi" src="${src(k)}"></div>${M.mon ? `<div class="kslot"><canvas width="150" height="150" data-mon="${M.mon}"></canvas></div>` : ''}</div><p>拥有 <b>${f(s.mat[k] || 0)}</b></p><p class="where">${M.src}</p><div class="btns">${G.supplyOk(k) ? `<button class="buy t green" id="src-ad">看广告<small>${M.name} +1</small></button>` : ''}<button class="buy t lite" id="src-ok">知道了</button></div></div></div>`, true);
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
  // v0.20：数字都走 fmtNum；材料只列本趟拿到的（数量 > 0），多了自动换行（.gmat flex-wrap），不撑出框
  const gainRow = (coin, gem, mat, lost) => { const ms = Object.entries(mat).filter(([, n]) => n > 0); return `<div class="gain t"><div>${img('coin')}${fmtNum(coin)}${lost ? `<s>−${fmtNum(lost.coin)}</s>` : ''}</div><div>${img('gem')}${fmtNum(gem)}${lost ? `<s>−${fmtNum(lost.gem)}</s>` : ''}</div></div>
    ${ms.length ? `<div class="gmat t">${ms.map(([k, n]) => `<span>${img(k)}×${fmtNum(n)}</span>`).join('')}</div>` : ''}`; };
  ui.result = (R, why) => {
    const s = S(), dead = why === 'dead', k = dead ? G.keepK() : 1, bst = s.boost > 0 ? 2 : 1;
    const mat = {}; for (const id in R.mat) mat[id] = Math.max(R.mat[id] > 0 && k >= 0.7 ? 1 : 0, Math.floor(R.mat[id] * k * (id === 'amber' ? 1 : bst)));
    const p = pop(`<div class="box"><h2 class="t">${dead ? '被打倒了' : why === 'stam' ? '体力耗尽' : '回到地面'}</h2><div class="kboard in"><p class="rstat t">${img('sk/Gear_Weapons_Pickaxe_01.png')}${fmtNum(R.deep)} 米${R.kills ? img('sk/Misc_Crosshair_01_Red.png') + '×' + fmtNum(R.kills) : ''}${R.ate ? img('sk/Consumable_Food_Meat_01.png') + '×' + fmtNum(R.ate) : ''}</p>
      ${gainRow(Math.floor(R.coin * k * bst), Math.floor(R.gem * k * bst), mat, dead && k < 1 ? { coin: Math.ceil(R.coin * (1 - k)), gem: Math.ceil(R.gem * (1 - k)) } : null)}
      ${bst > 1 ? `<p class="bst rstat">${img('boost')}×2${s.boost > 1 ? '　' + img('sk/Item_Hourglass_01_Gold.png') + fmtNum(s.boost - 1) : ''}</p>` : ''}
      <div class="btns">${G.adLeft('double') ? '<button class="buy t green" id="r-ad">看广告<small>×2</small></button>' : ''}<button class="buy t lite" id="r-ok">收下</button></div></div></div>`);   // 结算双倍：每天 5 次，用完按钮就不出现
    const ok = () => { snd('ui_close'); unpop(); G.collect(1, false); lootWait(G.lastGain, 'rise'); };   // v0.20 tfix：结算框打开 ui_open、收起 ui_close（成对；原来收下放 ui_tap）   // v0.20：收下 = 进存档，同时记成“还在飞的”，顶栏不先跳到新数
    p.querySelector('#r-ok').onclick = ok;
    const ad = p.querySelector('#r-ad'); if (ad) ad.onclick = () => G.watchAd('double', () => { snd('ui_close'); unpop(); G.collect(2); lootWait(G.lastGain, 'rise'); });
    if (G.looping()) setTimeout(() => { if ($('pop').classList.contains('on') && p.querySelector('#r-ok')) ok(); }, 3000);
  };
  ui.revive = () => {
    const p = pop(`<div class="box"><h2 class="t">血量归零</h2><div class="kboard in"><p class="rstat t">${img('hp')}${img('stam')}100%</p><div class="btns"><button class="buy t green" id="v-ad">看广告复活</button><button class="buy t lite" id="v-no">不用了</button></div></div></div>`);
    p.querySelector('#v-ad').onclick = () => G.watchAd('revive', () => { unpop(); G.revive(); });
    p.querySelector('#v-no').onclick = () => { snd('ui_close'); unpop(); G.giveUp(); };
    if (G.looping()) setTimeout(() => { if ($('pop').classList.contains('on') && p.querySelector('#v-no')) p.querySelector('#v-no').click(); }, 3000);   // 挂机循环：3 秒没操作就不复活，照常结算
  };
  ui.offline = o => {
    const p = pop(`<div class="box"><h2 class="t">${(B.PETS[o.pet] || { name: '宠物' }).name}带回了收获</h2><div class="kboard in"><p class="rstat t">${img('sk/Item_Clock_01_Silver.png')}${fmtNum(Math.round(o.h * 10) / 10)} 小时</p>${gainRow(o.coin, o.gem, {})}
      <div class="btns">${G.adLeft('offline') ? '<button class="buy t green" id="o-ad">看广告<small>×2</small></button>' : ''}<button class="buy t lite" id="o-ok">收下</button></div></div></div>`);
    const take = m => { if (m === 1) snd('ui_tap'); unpop(); S().coin += o.coin * m; S().gem += o.gem * m; claimFx([{ k: 'coin', n: o.coin * m }, { k: 'gem', n: o.gem * m }], '离线收获'); };
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
    const sum = k => items.filter(it => it.k === k && typeof it.n === 'number').reduce((a, it) => a + it.n, 0), mat = {}; items.forEach(it => { if (B.MAT[it.k] && typeof it.n === 'number') mat[it.k] = (mat[it.k] || 0) + it.n; });
    const wt = lootWait({ coin: sum('coin'), gem: sum('gem'), mat }, 'claim');   // v0.20：调用前已加进存档 → 先记成“还在飞的”
    const p = pop(`<div class="claim"><h2 class="t">${title}</h2><div class="rays"></div><div class="its">${items.map((it, i) => `<div class="ci" style="animation-delay:${0.1 + i * 0.12}s">${it.canvas ? `<canvas width="220" height="220" data-cpet="${it.canvas}"></canvas>` : it.part ? `<img src="${part(it.part)}">` : img(it.k)}<b class="t">${it.n !== undefined ? (typeof it.n === 'number' ? '×' + fmtNum(it.n) : it.n) : ''}</b></div>`).join('')}</div><i class="tapgest"></i></div>`, true);
    p.querySelectorAll('canvas[data-cpet]').forEach(c => G.petPortrait(c, c.dataset.cpet));
    const my = popSeq;   // 这个领取框的序号：弹窗被替换 / 关掉后，旧回调一律不执行
    if (wt) wt.seq = my;
    const close = () => {
      if (my !== popSeq || !popOn()) return;
      const from = [...p.querySelectorAll('.ci')].map(e => e.getBoundingClientRect());
      unpop(); snd('ui_close');
      const w = $('wrap').getBoundingClientRect();
      // bfix 一般-3：宠物 / 装备 / 外观 / 法杖 / 自动模式 / 收益 ×2 也从卡片上弹出，飞向各自的入口（入口鼓一下 + ding），和金币同一套节奏
      const spec = it => it.canvas ? { to: 'pet', pet: it.canvas, html: '<canvas width="120" height="120"></canvas>' } : it.part ? { to: 'smithy', html: `<img src="${part(it.part)}" alt="">` } : (it.k === 'auto' || it.k === 'off') ? { to: 'auto', html: img(it.k) } : it.k === 'boost' ? { to: 'go', html: img('boost') } : (isMoney(it.k) || B.MAT[it.k]) && typeof it.n === 'number' ? { k: it.k } : null;
      items.forEach((it, i) => { const sp = spec(it); if (from[i] && sp) lootBurst(sp, it.n, { x: from[i].left + from[i].width / 2 - w.left, y: from[i].top + from[i].height * 0.4 - w.top }, from[i].height * 0.55, i * 0.08, sp.to ? null : wt); });
      if (wt) lootUnwait(wt);
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
    if (!tg || !G.adLeft('vip')) return;   // v0.20：VIP 卡上的「领取」按钮和红点已经看得到，不再弹「可领取」
    const title = nx && s.vipAds >= nx.ads ? 'VIP ' + (s.vip + 1) + ' 可领取' : 'VIP 进度 +1';
    const p = pop(`<div class="box vipstreak"><h2 class="t">${title}</h2><div class="kboard in"><div class="prog"><i style="width:${Math.min(100, s.vipAds / tg.ads * 100)}%"></i><span class="t">${f(s.vipAds)} / ${f(tg.ads)}</span></div>
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
    if (v.pet) claimFx([{ canvas: v.pet, n: B.PETS[v.pet].name }], t);   // v0.20：领取卡已经显示了宠物，不再弹「已跟随你」
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
  /* ---------- v0.20 收益飞入（loot 线；照 tata render.js drawLoot / drawFlyers / PENDING 的节奏，分镜见 docs/v0.20各线笔记/loot.md）----------
   * 存档里的金币 / 宝石一进账就同时记进 LOOT.pend（还在飞的），顶栏显示 = 存档 − pend；每个图标飞到才把自己那份从 pend 里减掉，
   * 显示值每帧追着目标值滚动（LOOT.disp），所以顶栏全程不会先跳到新数。所有领取（结算收下、离线、签到、宝箱、补给）都走这里。 */
  // bfix：T1–T4 缩短（检查报告建议：点收下到顶栏开始涨约 2.8 秒）——落地后停顿 0.85 → 0.6 秒（含弹出 0.34 + 小弹 0.12 + 停 0.14），飞 0.55 秒
  const LT = { T1: 0.34, T2: 0.46, T3: 0.6, T4: 1.15, H: 0.55, gap: 0.045, wave: 0.42, bump: 0.25, roll: 11 };   // 弹出落地 / 落地小弹 / 停一下 / 飞向计数（秒）；H 弹出弧高（格）；gap 相邻图标错开；wave 小镇落地一批放满后下一批晚多少秒；roll 数字追赶速度
  const LOOT = { pend: { coin: 0, gem: 0 }, pendMat: {}, disp: { coin: null, gem: null }, items: [], waits: [], bump: new Map(), sndT: {} };
  const LOOT_SND = { coin: 'pickup_coin', gem: 'pickup_gem', wood: 'pick_wood', copper: 'pick_stone', amber: 'pick_stone' };   // 到达音效：一种东西一个固定文件（材料按木 / 石 / 软三类，同游戏里拾取）；入口奖励（宠物 / 装备 / 自动 / 收益 ×2）一律 ding
  // 材料没有字：数量用飞的个数表达（用户「能用画面表达就不写字」），最多 8 个
  const lootN = (k, v) => v <= 0 ? 0 : k === 'coin' ? (v < 40 ? 5 : v < 200 ? 8 : v < 1000 ? 11 : 15) : k === 'gem' ? (v <= 3 ? Math.ceil(v) : v < 15 ? 5 : v < 60 ? 8 : 10) : Math.min(8, Math.ceil(v));   // 数量按收益多少分档
  const lootTc = () => $('wrap').clientWidth / B.W;   // 一格的 CSS 像素
  const lootRem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const isMoney = k => k === 'coin' || k === 'gem';
  // 存档里减掉还在飞的材料（铁匠铺商品卡上的材料数，飞到才加）
  const matShow = k => Math.max(0, (S().mat[k] || 0) - Math.round(LOOT.pendMat[k] || 0));
  ui.matShow = matShow;
  function lootWait(g, kind) {   // 已进存档、图标还没出发的数额：先记进 pend（结算“收下”到回到小镇之间、领取卡片展示期间）
    const mat = {}; for (const k in (g && g.mat) || {}) if (g.mat[k] > 0) mat[k] = g.mat[k];
    if (!g || !(g.coin > 0 || g.gem > 0 || Object.keys(mat).length)) return null;
    const w = { coin: g.coin > 0 ? g.coin : 0, gem: g.gem > 0 ? g.gem : 0, mat, kind, age: 0, seq: -1, shore: 0 };
    LOOT.pend.coin += w.coin; LOOT.pend.gem += w.gem; for (const k in mat) LOOT.pendMat[k] = (LOOT.pendMat[k] || 0) + mat[k]; LOOT.waits.push(w); return w;
  }
  function lootUnwait(w) { const i = LOOT.waits.indexOf(w); if (i >= 0) LOOT.waits.splice(i, 1); }   // 图标已出发：pend 交给各个图标，飞到时各减各的
  const panOn = () => $('panel').classList.contains('on');
  const shown = e => { if (!e) return null; const r = e.getBoundingClientRect(); return r.width && r.height && getComputedStyle(e).display !== 'none' ? e : null; };
  // 入口奖励的去处（一般-3）：宠物 → 宠物按钮；装备 / 外观 / 法杖 → 铁匠铺名牌；自动模式 / 挂机 → 自动按钮（小镇上没有就开始挖掘）；收益 ×2 → 开始挖掘
  const ENT = { pet: () => shown($('shore').querySelector('[data-k="pet"]')), smithy: () => shown($('tag-smithy')), auto: () => shown($('auto')) || shown($('go')), go: () => shown($('go')) };
  function lootTarget(it) {
    const k = it.k;
    if (isMoney(k)) { const e = $('h-' + k); return e && e.parentNode.querySelector('img'); }
    if (panOn()) {   // 一般-2：面板开着时小镇上的入口都被盖住——材料飞进面板里对应的材料数（看得见的那一个），入口奖励等关了面板再飞
      if (it.to) return null;
      const m = [...$('panel').querySelectorAll('.m[data-mat="' + k + '"]')].find(e => { const r = e.getBoundingClientRect(), box = e.closest('.items, .pbody'), br = box ? box.getBoundingClientRect() : r; return r.width && r.top >= br.top - 1 && r.bottom <= br.bottom + 1; });   // 商品卡 / 技能说明卡上看得见的那一个
      return m ? (m.querySelector('img') || m) : null;
    }
    if ($('shore').style.display === 'none') return null;
    return it.to ? ENT[it.to]() : ENT.smithy();   // 材料都在铁匠铺用
  }
  function matSpans(k) {   // 材料飞到后把面板里这种材料的数字改成新值（商品卡 have/need、红绿）
    $('panel').querySelectorAll('.m[data-mat="' + k + '"][data-need]').forEach(e => { const have = matShow(k), need = +e.dataset.need; e.classList.toggle('ok', have >= need); e.classList.toggle('lack', have < need); const sp = e.querySelector('i'); if (sp) sp.textContent = f(have) + '/' + f(need); });
  }
  // 一批图标：spec = { k: 金币 / 宝石 / 材料键 } 或 { to: 入口, html: 图 }；from = 出发点（#wrap 内 CSS 像素）；
  // land(i) = 第 i 个的落点（不给就在 from 附近随机散开 spread）；delay = 整批推迟（秒）；w = 对应的 lootWait（已记 pend）
  function lootBurst(spec, v, from, spread, delay, w, land) {
    const k = spec.k, n = spec.to ? 1 : lootN(k, v); if (!n) return 0;
    const money = isMoney(k); if (!w) { if (money) LOOT.pend[k] += v; else if (k && B.MAT[k]) LOOT.pendMat[k] = (LOOT.pendMat[k] || 0) + v; }
    const Tc = lootTc(), W = $('wrap').clientWidth, rem = lootRem(), size = rem * (spec.to ? 2.6 : money ? 1.9 : 2.1), share = spec.to ? 0 : v / n;
    for (let i = 0; i < n; i++) {
      const e = document.createElement('div'); e.className = 'lfly'; e.style.width = e.style.height = size + 'px';
      e.innerHTML = spec.html || `<img src="${src(k)}" alt="">`; $('wrap').appendChild(e);
      if (spec.pet) { const c = e.querySelector('canvas'); if (c) G.petPortrait(c, spec.pet); }
      const L = land ? land(i) : null, side = from.side || (Math.random() < 0.5 ? -1 : 1);
      const gx = L ? L.x : Math.max(Tc * 0.45, Math.min(W - Tc * 0.45, from.x + side * spread * (0.25 + Math.random() * 0.9))), gy = L ? L.y : from.y + spread * (0.5 + Math.random() * 0.5);
      LOOT.items.push({ k, to: spec.to, e, x0: from.x, y0: from.y, gx, gy, t: -(delay + (L && L.d !== undefined ? L.d : i * LT.gap)), side, share, size, money, sc: L && L.s || 1 });
      e.style.transform = 'translate(-999px,-999px)';
    }
    return n;
  }
  function lootArrive(it, tg) {
    it.e.remove(); it.done = true;
    if (it.money) LOOT.pend[it.k] = Math.max(0, LOOT.pend[it.k] - it.share);
    else if (it.k && B.MAT[it.k]) { LOOT.pendMat[it.k] = Math.max(0, (LOOT.pendMat[it.k] || 0) - it.share); matSpans(it.k); }
    if (tg) LOOT.bump.set(tg, { t: LT.bump, big: it.money || !!it.to });
    const sk = it.to ? 'ding' : LOOT_SND[it.k] || 'pick_soft', now = performance.now(); if (now - (LOOT.sndT[sk] || 0) > 55) { LOOT.sndT[sk] = now; snd(sk, it.money ? 0.45 : 0.6); }   // 连续到达时 55ms 内只响一声，免得糊成一片
  }
  function lootTick(dt, mode) {
    // 记了 pend 却没有图标出发的情况兜底：领取卡片被别的弹窗顶掉 / 回地面过渡没调到 showShore —— 直接把数加上，不让顶栏一直少一截
    for (const w of LOOT.waits.slice()) {
      w.age += dt; if (mode === 'shore' && !G.state().trans) w.shore += dt;
      if ((w.kind === 'claim' && w.seq >= 0 && w.seq !== popSeq) || (w.kind === 'rise' && w.shore > 1.5) || w.age > 60) { LOOT.pend.coin = Math.max(0, LOOT.pend.coin - w.coin); LOOT.pend.gem = Math.max(0, LOOT.pend.gem - w.gem); for (const k in w.mat) { LOOT.pendMat[k] = Math.max(0, (LOOT.pendMat[k] || 0) - w.mat[k]); matSpans(k); } lootUnwait(w); }
    }
    const Tc = lootTc(), wr = $('wrap').getBoundingClientRect(), pan = panOn();
    for (const it of LOOT.items) {
      if (it.park) {   // 一般-2/3：入口被面板盖住 → 先收着，面板关了再从屏幕中间弹出、飞过去
        if (pan || $('shore').style.display === 'none') continue;
        it.park = false; it.x0 = it.gx = wr.width / 2; it.y0 = wr.height * 0.42; it.gy = it.y0 + Tc * 0.4; it.t = -(it.pi || 0) * 0.12; it.e.style.visibility = '';
      }
      it.t += dt; const t = it.t; if (t < 0) continue;
      let x, y, s = it.sc, sx = 1, sy = 1;
      if (t < LT.T1) { const k = t / LT.T1; x = it.x0 + (it.gx - it.x0) * k; y = it.y0 + (it.gy - it.y0) * k - Math.sin(Math.PI * k) * Tc * LT.H; s = it.sc * (0.55 + 0.45 * Math.min(1, k * 2.2)); }   // 弹出：弧线落到旁边
      else if (t < LT.T3) { const k = Math.min(1, (t - LT.T1) / (LT.T2 - LT.T1)); x = it.gx; y = it.gy - (t < LT.T2 ? Math.sin(Math.PI * k) * Tc * 0.12 : 0); if (t < LT.T1 + 0.07) { sy = 1 - 0.22 * Math.sin(Math.PI * (t - LT.T1) / 0.07); sx = 1 / sy; } }   // 落地压扁、小弹一下、停一下
      else {
        const tg = lootTarget(it);
        if (!tg && pan && (it.to || !it.money)) { it.park = true; it.pi = LOOT.items.filter(q => q.park).length; it.e.style.visibility = 'hidden'; continue; }
        const r = tg ? tg.getBoundingClientRect() : null;
        const tx = r ? r.left + r.width / 2 - wr.left : wr.width / 2, ty = r ? r.top + r.height / 2 - wr.top : -20, ts = r ? Math.min(r.width, r.height) / it.size : 0.4;
        const k = Math.min(1, (t - LT.T3) / (LT.T4 - LT.T3)), e = k * k, bend = Math.sin(k * Math.PI) * Tc * 0.9;   // ease.inQuad：越飞越快；左右随机弯
        x = it.gx + (tx - it.gx) * e + it.side * bend * 0.5; y = it.gy + (ty - it.gy) * e - bend * 0.4; s = it.sc + (Math.min(1, ts) - it.sc) * k;
        if (k >= 1) { lootArrive(it, tg); continue; }
      }
      it.e.style.transform = `translate(${(x - it.size / 2).toFixed(1)}px,${(y - it.size / 2).toFixed(1)}px) scale(${(s * sx).toFixed(3)},${(s * sy).toFixed(3)})`;
    }
    if (LOOT.items.some(it => it.done)) LOOT.items = LOOT.items.filter(it => !it.done);
    for (const k of ['coin', 'gem']) if (!LOOT.waits.some(w => w[k] > 0) && !LOOT.items.some(it => it.k === k)) LOOT.pend[k] = 0;   // 浮点误差清零
    for (const k in LOOT.pendMat) if (!LOOT.waits.some(w => w.mat[k] > 0) && !LOOT.items.some(it => it.k === k)) delete LOOT.pendMat[k];
    for (const [tg, b] of LOOT.bump) {   // 目标鼓一下（tata BUMP：0.25 秒，sin 弧线）
      const nb = Math.max(0, b.t - dt), sc = nb > 0 ? 1 + (b.big ? 0.35 : 0.12) * Math.sin(Math.PI * nb / LT.bump) : 1;
      tg.style.scale = sc === 1 ? '' : sc.toFixed(3);   // 用独立的 scale 属性，不覆盖顶栏图标原来的 translateY
      if (nb > 0) b.t = nb; else LOOT.bump.delete(tg);
    }
  }
  function lootHud(s, dt) {   // 顶栏数字：显示值追着（存档 − 还在飞的）滚动；花钱时同样往下滚
    for (const k of ['coin', 'gem']) {
      if (LOOT.pend[k] > s[k]) LOOT.pend[k] = Math.max(0, s[k]);   // 一般-4：飞入途中花掉了还在飞的钱 → 飞的部分最多只剩存档那么多，顶栏不会出现负数（花的部分立即扣，剩下的飞到再加）
      const tg = Math.max(0, s[k] - LOOT.pend[k]); let d = LOOT.disp[k];
      if (d === null) d = tg; else { d += (tg - d) * Math.min(1, dt * LT.roll); if (Math.abs(tg - d) < 0.5) d = tg; }
      LOOT.disp[k] = d; set('h-' + k, fmtNum(Math.max(0, Math.floor(d + 1e-6))));
    }
  }
  // 回到小镇（回地面过渡结束 showShore）：本趟收益从主角头顶弹出、落在主角左边的地面上排开（一般-1：按格子排，不叠成一团、不盖主角），再飞到顶栏 / 铁匠铺
  // 落点：主角左边 0.95 格起每 0.5 格一个，前后两排（后排高 0.24 格、缩到 0.85），12 个一批；多了下一批晚 LT.wave 秒，等前一批飞走再落
  function flyGain(g) {
    const w = LOOT.waits.find(q => q.kind === 'rise'), h = G.heroScreen(), Tc = lootTc(), from = { x: h.x + Tc * 0.25, y: h.y + Tc * 0.2, side: -1 };
    const PER = 6, slots = Math.max(2, Math.min(PER, Math.floor((h.x - Tc * 1.65) / (Tc * 0.5)) + 1));   // 最左一个离屏幕边 ≥ 0.45 格   // 小屏 / 主角靠左时一排放得下几个
    const list = []; const add = (k, v) => { const n = lootN(k, v); for (let i = 0; i < n; i++) list.push(k); };
    add('coin', g.coin); add('gem', g.gem); for (const k in g.mat) if (g.mat[k] > 0) add(k, g.mat[k]);
    const order = [], kinds = [...new Set(list)]; let left = list.slice(); while (left.length) for (const k of kinds) { const i = left.indexOf(k); if (i >= 0) { order.push(k); left.splice(i, 1); } }   // 几种东西轮流摆，不按种类挤在一起
    const pos = {}; order.forEach((k, j) => { const per = slots * 2, wv = Math.floor(j / per), q = j % per, row = q % 2, col = Math.floor(q / 2); (pos[k] = pos[k] || []).push({ x: h.x - Tc * (0.95 + 0.5 * col + row * 0.25), y: h.y + Tc * (1.15 - row * 0.24), s: row ? 0.85 : 1, d: wv * LT.wave + q * LT.gap }); });
    lootBurst({ k: 'coin' }, g.coin, from, 0, 0, w, i => pos.coin[i]); lootBurst({ k: 'gem' }, g.gem, from, 0, 0, w, i => pos.gem[i]);
    for (const k in g.mat) if (g.mat[k] > 0) lootBurst({ k }, g.mat[k], from, 0, 0, w, i => pos[k][i]);
    if (w) lootUnwait(w);
  }
  ui._lootStep = sec => { for (let t = 0; t < sec - 1e-9; t += 1 / 60) { lootTick(1 / 60, G.state().mode); lootHud(S(), 1 / 60); } };   // 测试：冻结时间时逐帧推进飞入和数字
  ui._loot = LOOT;

  let tt = 0;
  ui.toast = (s, ms) => { const t = $('toast'); t.textContent = s; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), ms || 1600); };
  let bt = 0;
  ui.banner = (a, b) => { const e = $('banner'); e.innerHTML = `<b class="t">${a}</b>${b ? `<span class="t">${b}</span>` : ''}`; e.classList.add('on'); clearTimeout(bt); bt = setTimeout(() => e.classList.remove('on'), 2600); };
})();
