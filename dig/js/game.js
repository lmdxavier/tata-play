/* dig hero 主逻辑（v0.4）：存档、地面小镇（走路 / 爬梯 / 点建筑）、下矿与回地面的过渡、一趟挖掘（地形生成、材料、食物、自动模式）、渲染。
 * 数值在 balance.js（BAL），小镇画面在 town.js，界面在 ui.js。设计见 docs/系统与数值.md。 */
(function () {
  'use strict';
  const B = window.BAL, A = window.ART, TW = window.TOWN, $ = id => document.getElementById(id);
  const G = window.G = {};
  const Q = new URLSearchParams(location.search);
  const SAVE_KEY = 'dighero_v4';
  const W = B.W;

  /* ---------- 存档 ---------- */
  const today = () => { const d = new Date(Date.now() + (G._dayShift || 0) * 864e5); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const fresh = () => ({ coin: 0, gem: 0, mat: {}, gear: {}, skill: { root: 1 }, codex: {}, seen: {}, ads: 0, vipAds: 0, vip: 0, staff: false, skin: null, ver: 18, pets: [], pet: null, boss: 0, best: 0, runs: 0,
    last: Date.now(), lastRun: { coin: 0, gem: 0 }, chestT: 0, ad: { day: today(), n: 0, used: {} }, sign: { n: 0, last: '' }, boost: 0, auto: false, loop: false, pity: { gel: 0, pearl: 0 }, tut: {}, bossMat: 0 });
  let S = fresh();
  let oldVer = 18;   // 读到的存档版本（fresh() 自带 ver 18，所以要看原始数据）
  try { const t = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (t && typeof t === 'object') { oldVer = +t.ver || 0; S = Object.assign(fresh(), t); } } catch (e) { }
  if (Q.get('reset') === '1') { S = fresh(); oldVer = 18; }
  // v0.18 存档迁移（VIP / 广告位改成系统与数值 16 节）：旧档的 ads = 所有广告位累计次数、vip = 旧表已领级数
  // → 累计次数记作新 VIP 进度（不让老玩家掉进度），已领级数清零重新按新表领（已有的宠物照旧保留，重领不重复给）；
  //   自动 / 挂机开关、旧 VIP6 送装备待选、旧广告计数一并复位，避免没领到新表对应级就能用
  if (oldVer < 18) {
    S.vipAds = Math.max(0, +S.vipAds || +S.ads || 0); S.vip = 0; S.auto = false; S.loop = false; S.staff = false; S.skin = null; delete S.giftPending;
    S.ad = { day: today(), n: 0, used: {} }; S.ver = 18;
  }
  if (!S.ad || typeof S.ad !== 'object' || !S.ad.used) S.ad = { day: today(), n: 0, used: {} };
  if (!Array.isArray(S.pets)) S.pets = [];
  G.S = S;
  G.save = () => { S.last = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { } };
  G.reset = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } location.href = location.pathname; };
  let D = B.derive(S);
  G.D = () => D;
  G.refresh = () => { D = B.derive(S); heroLook(); if (HERO && HERO.idx) HERO.nodeScale = D.giant ? { [HERO.idx.Tool_Pick]: D.giant.pick } : null; G.save(); if (G.ui) G.ui.refresh(); };

  /* ---------- 音效：一个动作一个固定文件（用户 2026-11-16 规则） ---------- */
  const SFX = (() => {
    let ac = null, unlocked = false; const buf = {}, last = {};
    const data = () => Object.assign({}, window.SFX_DATA || {}, window.SFX_COMBAT_DATA || {}, window.SFX_EXTRA_DATA || {}, window.SFX_PET_DATA || {}, window.SFX_MECH_DATA || {}, window.SFX_MON_DATA || {});
    function create() {   // 启动时就建好并解码（v0.4 等第一次点画布才建，界面按钮不触发，开头几个音效还没解码就丢了）
      if (ac) return; try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      const d = data();
      for (const k in d) { try { const b64 = d[k].files[0], bin = atob(b64), u = new Uint8Array(bin.length); for (let j = 0; j < bin.length; j++) u[j] = bin.charCodeAt(j); const p = ac.decodeAudioData(u.buffer, b => { buf[k] = b; }, () => { }); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
    }
    function init() {   // 每次用户手势都调：不是 running（suspended / iOS 的 interrupted）就恢复；第一次放一段静音解锁 iOS
      create(); if (!ac) return;
      if (ac.state !== 'running') { try { ac.resume(); } catch (e) { } }
      if (!unlocked) { try { const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, 22050); s.connect(ac.destination); s.start(0); unlocked = true; } catch (e) { } }
    }
    function play(k, vol, rate) {
      if (!ac || !buf[k] || G.mute) return; if (ac.state !== 'running') { try { ac.resume(); } catch (e) { } }
      const now = ac.currentTime; if (last[k] && now - last[k] < 0.05) return; last[k] = now;
      const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = buf[k]; s.playbackRate.value = rate || 1;
      g.gain.value = (vol === undefined ? 1 : vol) * ((data()[k] || {}).vol || 1) * 0.8; s.connect(g); g.connect(ac.destination); s.start();
    }
    // 手势监听挂在 window 捕获阶段：点界面按钮、画布、键盘都算；iOS 只认 touchend / click / pointerup 为“用户激活”
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, init, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && ac && ac.state !== 'running') { try { ac.resume(); } catch (e) { } } });
    return { init, play, create, state: () => ac ? ac.state : 'none', ready: () => Object.keys(buf).length };
  })();
  G.sfx = SFX;
  const PICK_SFX = { wood: 'pick_wood', copper: 'pick_stone', amber: 'pick_stone', silk: 'pick_soft', gel: 'pick_soft', pearl: 'pick_soft' };

  /* ---------- 画布 ---------- */
  const wrap = $('wrap'), cv = $('cv');
  let ctx = null, T = 48, OX = 0, VW = 0, VH = 0, dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(wrap.clientWidth * dpr), h = Math.round(wrap.clientHeight * dpr);
    if (w === VW && h === VH) return;
    VW = w; VH = h; cv.width = w; cv.height = h; T = Math.floor(w / W); OX = (w - T * W) >> 1;
    document.documentElement.style.fontSize = (wrap.clientWidth / 24) + 'px';
    if (A.img.coin) A.bake(T);
    if (TERRAIN.ready) TERRAIN.resize(T, OX, w);
    if (TW.ready) TW.bake(T, w, h - T * 1.9);   // 第三个参数 = 小镇视角地面以上露出的高度（远景要盖满）
  }

  /* ---------- 角色外观 ---------- */
  let HERO = null, DOLL = null, MLIB = null, SK = null, ST = null, SR = null, petCv = null, petG = null, PETS = {}, petName = null;
  const sprIdx = (part, name) => { const p = window.HERO_DATA.parts[part]; return p ? p.r[0].spr.indexOf(name) : -1; };
  function lookOf(gear, fight) {
    const g = s => B.GEAR[s][gear[s] || 0], eq = { Eye: 1, Hair: 1, Chest: sprIdx('Chest', g('armor').spr), Helmet: sprIdx('Helmet', g('helmet').spr), Shield: sprIdx('Shield', g('shield').spr) };
    const w = g('weapon');
    if (fight === false) eq.Pickaxe = 0; else if (w.part === 'Blunt') eq.Blunt = sprIdx('Blunt', w.spr); else eq.Sword = sprIdx('Sword', w.spr);
    return eq;
  }
  // 场上主角（不含铁匠铺纸娃娃：那里是看装备属性的）：VIP 整套外观只换头盔 + 衣服的图；拿着法杖时换成法杖
  function lookField(fight) {
    const eq = lookOf(S.gear, fight), sk = S.skin && B.SKIN[S.skin];
    if (sk && G.vipOwn('skin', S.skin)) { eq.Helmet = sprIdx('Helmet', sk.Helmet); eq.Chest = sprIdx('Chest', sk.Chest); }
    if (D.staff && fight !== false) { delete eq.Sword; delete eq.Blunt; eq.Staff = sprIdx('Staff', B.STAFF.spr); }
    return eq;
  }
  G.lookOf = lookOf;
  let lookKey = '';
  function heroLook(fight) {
    if (!HERO) return; const eq = lookField(mode === 'run' ? !!fight : true);
    const key = JSON.stringify(eq); if (key === lookKey) return; lookKey = key;
    HERO.setLook(eq, { Hair: [0.55, 0.33, 0.2] });
  }
  // 纸娃娃（界面里的 canvas）：用另一个 Hero 实例，不影响场上主角
  let dollKey = '';
  const DOLL_IDLE_ORDER = { Sword: 3.5, Blunt: 3.5 };   // 铁匠铺只卖剑和棍（balance.js GEAR.weapon）
  G.drawDoll = (c, gear, anim, dt) => {
    if (!DOLL) return; const eq = lookOf(gear, true), key = JSON.stringify(eq);
    if (key !== dollKey) { dollKey = key; DOLL.setLook(eq, { Hair: [0.55, 0.33, 0.2] }); }
    if (anim && DOLL.state !== anim) DOLL.play(anim, anim === 'Victory' ? { restart: true, onEnd: () => DOLL.play('Idle') } : {});
    DOLL.update(dt || 0.016);
    // v0.18 修：素材里武器层级 10 高于头 4，Idle 时剑横在下巴高度，铁匠铺放大看就是剑挡住脸。
    // Idle 时把武器画在衣服（3）之上、头（4）之下；Victory 等举剑动作保持素材原层级。只改纸娃娃这个实例。
    DOLL.setOrders(DOLL.state === 'Idle' ? DOLL_IDLE_ORDER : {});
    const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    DOLL.draw(g, c.width / 2, c.height * 0.9, { scale: c.height / 128 });
  };
  G.dollPlay = a => { if (DOLL) DOLL.play(a, { restart: true, onEnd: () => DOLL.play('Idle') }); };
  const MON_KINDS = ['Slime_Green', 'Snail_Green', 'Bat_Cave', 'Beetle_Red'];
  G.MON_KINDS = MON_KINDS; G.MON_NAME = {}; for (const k in B.MON) G.MON_NAME[k] = B.MON[k].name;
  async function loadPet(name) {
    if (PETS[name]) return PETS[name];
    const P = window.PET_DATA_HD[name], atlas = new spine.TextureAtlas(P.atlas);
    for (const page of atlas.pages) { const im = new Image(); await new Promise(r => { im.onload = im.onerror = r; im.src = 'assets/pets/' + page.name; }); page.setTexture(new spine.CanvasTexture(im)); }
    const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(P.json);
    return PETS[name] = { data };
  }
  async function setPetActor() {
    const n = S.pet; if (n === petName) return; petName = n; SK = null; if (!n) return;
    const p = await loadPet(n); if (petName !== n) return;
    const sk = new spine.Skeleton(p.data); (sk.setupPose ? sk.setupPose() : sk.setToSetupPose());
    const sd = new spine.AnimationStateData(p.data); sd.defaultMix = 0.12; ST = new spine.AnimationState(sd); ST.setAnimation(0, 'Idle', true); SK = sk; pet.anim = 'Idle';
    pet.x = hero.x - T * 0.8; pet.y = hero.y;
  }
  G.setPet = n => { S.pet = n; setPetActor(); G.refresh(); };
  const pet = { x: 0, y: 0, face: 1, anim: 'Idle', t: 0 };
  function petAnim(a, loop) { if (!ST || pet.anim === a) return; pet.anim = a; ST.setAnimation(0, a, loop !== false); if (loop === false) ST.addAnimation(0, 'Idle', true, 0); }

  /* ---------- 世界：区域按固定种子生成（每趟同一张图，矿和食物每趟重新长出来） ---------- */
  let R = null, mode = 'load', camY = 0, shake = 0, time = 0, trans = null;
  const fx = [], nums = [], drops = [], bits = [];
  const hero = { c: 3, r: -1, x: 0, y: 0, face: 1, mv: 0, alpha: 1, path: null, lvl: 0 };
  // v0.18 怪物与守卫行为（mobs.js）需要的接口
  let drawT0 = 0; const WARN_FILTER = 'sepia(0.85) saturate(3.2) hue-rotate(6deg) brightness(1.45)';   // 前摇闪黄光（原来闪红，在红甲虫 / 橙红史莱姆身上看不出来；受击是白闪，前摇用黄光区分）
  MOBS.init({
    R: () => R, hero, T: () => T, time: () => time, cell: (c, r) => cell(c, r), floorAt: (x, y) => TERRAIN.floorAt(x, y),
    hurt: (m, mult) => hurtHero(m, mult), air: () => hero.hopT > 0.04 && hero.hopT < B.HOP.t - 0.04,
    fx: (k, x, y, sc) => addFx(k, x, y, sc), sfx: (k, v) => SFX.play(k, v), shake: v => { shake = Math.max(shake, v); },
    cx: m => ((m.boss ? m.bx : m.c) + 0.5) * T, fy: m => (m.r + 1) * T, cy: m => (m.r + 0.5) * T,
  });
  G.hero = hero;
  const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const LAYOUT = {};
  function genArea(a) {   // 返回 { rows: [[{t, food, web}]×7]×50, mons: [{c,l,kind}], chest: {c,l}, straw: [] }
    if (LAYOUT[a]) return LAYOUT[a];
    const rnd = rng(9173 + a * 101), ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)), N = B.AREA;
    const rows = []; for (let l = 0; l < N; l++) { const row = []; for (let c = 0; c < W; c++) row.push({ t: 1 }); rows.push(row); }
    const busy = new Set(), set = (c, l, o) => { if (l < 0 || l >= N || c < 0 || c >= W) return; Object.assign(rows[l][c], o); busy.add(l * 10 + c); }, isBusy = (c, l) => busy.has(l * 10 + c);
    if (a === 0) set(3, 0, { t: 0, shaft: 1 });
    // 叉和中间岛
    let l = 3, side = rnd() < 0.5 ? 0 : 1; const spurRows = [];
    while (l < N - 7) {
      if (rnd() < 0.22) { const len = ri(2, 3), c0 = len === 3 ? 2 : ri(2, 3), th = rnd() < 0.35 ? 2 : 1; for (let c = c0; c < c0 + len; c++) for (let k = 0; k < th; k++) set(c, l + k, { t: 2 }); spurRows.push(l); }
      else {
        if (rnd() < 0.7) side = 1 - side;
        const len = ri(3, 6), thick = rnd() < 0.3 ? 2 : 1, slope = rnd() < 0.35 ? (rnd() < 0.5 ? 1 : -1) : 0;
        for (let i = 0; i < len; i++) { const c = side === 0 ? i : W - 1 - i, dl = slope ? slope * Math.min(1, Math.floor(i / 2)) : 0; for (let k = 0; k < thick; k++) set(c, l + dl + k, { t: 2 }); }
        spurRows.push(l);
        // 草莓：藏在叉尖下面（值得绕路）
        if (rnd() < 0.18 && l > 6) { const c = side === 0 ? len - 1 : W - len, ll = l + thick + (slope > 0 && len > 3 ? 1 : 0); if (!isBusy(c, ll)) set(c, ll, { t: 6, food: 'strawberry' }); }
      }
      l += ri(2, 5);
    }
    // 洞穴：放怪、蜘蛛网、宝箱位
    const mons = []; let chest = null; l = 4;
    while (l < N - 6) {
      if (!spurRows.includes(l)) {
        const w = ri(1, 3), c0 = ri(0, W - w); let ok = true; for (let c = c0; c < c0 + w; c++) if (isBusy(c, l)) ok = false;
        if (ok) {
          for (let c = c0; c < c0 + w; c++) set(c, l, { t: 0, cave: 1 });
          for (let c = c0; c < c0 + w; c++) if (rows[l + 1] && rows[l + 1][c].t === 0) rows[l + 1][c].t = 1;
          const roll = rnd(), mc = c0 + ri(0, w - 1);
          if (!chest && l >= 18 && l <= 36 && roll < 0.3) chest = { c: mc, l };
          else mons.push({ c: mc, l, kind: (l >= 15 && rnd() < 0.5) ? 'Snail_Green' : 'Slime_Green' });
          if (l >= 8 && w >= 2) { const wc = rnd() < 0.5 ? c0 : c0 + w - 1; if (wc !== mc) rows[l][wc].web = 1; }
          else if (l >= 8 && rnd() < 0.5) { const wc = c0 > 0 && !isBusy(c0 - 1, l) ? c0 - 1 : c0 + w < W && !isBusy(c0 + w, l) ? c0 + w : -1; if (wc >= 0) { set(wc, l, { t: 0, cave: 1, web: 1 }); } }
        }
      }
      l += ri(3, 6);
    }
    // 树根（0–25 米）、铜矿（12–45 米）：成团
    const clump = (t, lo, hi, n, sz) => { for (let i = 0; i < n; i++) { let c = ri(0, W - 1), ll = ri(lo, hi); for (let k = 0; k < sz(); k++) { if (rows[ll] && rows[ll][c] && rows[ll][c].t === 1 && !isBusy(c, ll)) set(c, ll, { t }); if (rnd() < 0.5) c = Math.max(0, Math.min(W - 1, c + (rnd() < 0.5 ? -1 : 1))); else ll++; } } };
    clump(4, 1, 25, 6, () => ri(2, 4)); clump(5, 12, 45, 8, () => ri(2, 3));
    // 食物：蘑菇每 4–6 行、苹果每 10–12 行
    const food = (kind, lo, step) => { for (let ll = lo; ll < N - 4; ll += step()) { const c = ri(0, W - 1); if (rows[ll][c].t === 1 && !isBusy(c, ll)) set(c, ll, { t: 6, food: kind }); } };
    food('mushroom', 2, () => ri(4, 6)); food('apple', 8, () => ri(10, 12));
    // 守卫房、守卫门
    for (let c = 0; c < W; c++) { rows[N - 3][c] = { t: c >= 2 && c <= 4 ? 0 : 1 }; rows[N - 2][c] = { t: c >= 2 && c <= 4 ? 0 : 1 }; rows[N - 1][c] = { t: 3 }; }
    for (let ll = N - 6; ll < N - 3; ll++) for (let c = 0; c < W; c++) if (rows[ll][c].t === 2) rows[ll][c].t = 1;
    // v0.18 加怪（区域 1 原来只有 4 只、21 米以下没有怪）：洞穴蝙蝠 3 只 + 绿蜗牛 1 只，各自挖一个 2 格的小洞；
    // 不用随机数（按固定行号往下找能放的位置），地形其余布局不变
    for (const [l0, kind] of [[13, 'Bat_Cave'], [28, 'Bat_Cave'], [33, 'Snail_Green'], [38, 'Bat_Cave']]) {
      let done = false;
      for (let ll = l0; ll < l0 + 4 && !done; ll++) for (let c0 = (l0 * 3) % 6, i = 0; i < 6 && !done; i++, c0 = (c0 + 1) % 6) {
        const okc = c => rows[ll][c].t === 1 && !isBusy(c, ll) && rows[ll + 1][c].t !== 0 && !rows[ll][c].food && rows[ll - 1][c].t !== 0;
        if (!okc(c0) || !okc(c0 + 1) || mons.some(m => Math.abs(m.l - ll) < 2)) continue;
        set(c0, ll, { t: 0, cave: 1 }); set(c0 + 1, ll, { t: 0, cave: 1 }); mons.push({ c: c0 + (ll % 2), l: ll, kind }); done = true;
      }
    }
    // v0.18 暗格宝箱位（光源节点）：洞穴空腔里没有怪、蜘蛛网、幸运宝箱的格子，浅段（6–25 米）、深段（26–45 米）各挑 1 个
    const dark = [];
    for (const [lo, hi] of [[6, 25], [26, 45]]) {
      const cand = []; for (let ll = lo; ll <= hi; ll++) for (let c = 0; c < W; c++) { const k = rows[ll][c]; if (k.cave && k.t === 0 && !k.web && !mons.some(m => m.c === c && m.l === ll) && !(chest && chest.c === c && chest.l === ll)) cand.push({ c, l: ll }); }
      if (cand.length) dark.push(cand[Math.floor(rnd() * cand.length)]);
    }
    return LAYOUT[a] = { rows, mons, chest, dark };
  }
  // 图鉴 / 材料“去哪拿”里的深度从区域 1 的真实地形算（怪最浅出现在哪一行、材料方块 / 蜘蛛网出现在哪几行），不手写
  (function () {
    const L = genArea(0), mon = {}, mat = {}, add = (k, l) => { const r = mat[k] || (mat[k] = [l, l]); r[0] = Math.min(r[0], l); r[1] = Math.max(r[1], l); };
    for (const m of L.mons) mon[m.kind] = Math.min(mon[m.kind] === undefined ? 1e9 : mon[m.kind], m.l);
    mon.Beetle_Red = B.AREA - 2;   // 守卫站的那一行（同 newRun 里的 spawn）
    L.rows.forEach((row, l) => row.forEach(k => { if (k.t === 4) add('wood', l); if (k.t === 5) add('copper', l); if (k.web) add('silk', l); }));
    B.fillDepths({ mon, mat });
  })();
  function newRun() {
    TERRAIN.reset(); bolts.length = 0; clearPetFx(); MOBS.reset();
    R = { rows: new Map(), mons: [], st: D.stam, stMax: D.stam, hp: D.hp, hpMax: D.hp, coin: 0, gem: 0, mat: {}, t: 0, deep: 0, on: false, over: null, revived: false, petT: 0, kills: 0, blocks: 0, auto: null, autoStop: 0, swings: 0, ate: 0, firstBoss: false };
    const L = genArea(0);
    L.rows.forEach((row, l) => R.rows.set(l, row.map(k => { const t = k.t, hp = t === 3 || t === 0 ? 0 : B.cellHp(t, l); return { t, hp, max: hp, food: k.food, web: k.web, cave: k.cave, shaft: k.shaft, v: (l * 7 + 3) % 4 }; })));
    for (const m of L.mons) spawn(m.c, m.l, m.kind, false);
    if (!S.boss) spawn(3, B.AREA - 2, 'Beetle_Red', true);
    if (D.chest && L.chest) { const k = R.rows.get(L.chest.l)[L.chest.c]; k.chest = 1; }
    if (D.dark) { const M = B.MECH.lamp, n = Math.min(L.dark.length, M.dark[0] + Math.floor(Math.random() * (M.dark[1] - M.dark[0] + 1))); for (let i = 0; i < n; i++) R.rows.get(L.dark[i].l)[L.dark[i].c].dchest = 1; }   // 暗格宝箱：每趟 1–2 个（浅的那个每趟都有）
    R.boom = { t: D.boom ? D.boom.cd : 0, fly: [] };   // 回旋镐：冷却计时 + 飞行中的镐（n 把）
    if (HERO && HERO.idx) HERO.nodeScale = D.giant ? { [HERO.idx.Tool_Pick]: D.giant.pick } : null;
    fx.length = nums.length = drops.length = bits.length = 0;
  }
  function spawn(c, r, kind, boss) {
    const m = MLIB.create(kind); m.play('Idle'); m.update(Math.random());
    const mo = { c, r, kind, hp: B.monHp(kind, r), max: B.monHp(kind, r), atk: B.monAtk(kind, r), boss, m, at: 0.6, flash: 0, dead: 0, face: -1 };
    MOBS.setup(mo); R.mons.push(mo);
    const k = R.rows.get(r); if (k) k[c].mon = 1;
  }
  const WALL = { t: 9 }, EMPTY = { t: 0 }, DEEP = { t: 9 };
  function cell(c, r) {
    if (c < 0 || c >= W) return WALL;
    if (r < 0) return EMPTY;
    const row = R && R.rows.get(r); return row ? row[c] : DEEP;
  }
  G.cell = (c, r) => cell(c, r);

  /* ---------- 镜头 ---------- */
  const townCam = () => -Math.round(VH - T * 1.9);   // 地面离底边 1.9 格：下矿按钮整个在地面以下，不挡洞口
  const runCam = () => hero.y - VH * 0.42;
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  /* ---------- 小镇：走路、爬梯、点建筑 ---------- */
  const TL = TW.L, lvlY = lvl => lvl ? TL.plat.y * T : 0;
  function townPath(tx, tl) {   // 从当前位置走到 (tx 格, tl 层)
    const p = [];
    if (hero.lvl !== tl) { p.push({ x: TL.ladder.x * T, y: lvlY(hero.lvl) }); p.push({ x: TL.ladder.x * T, y: lvlY(tl), climb: 1 }); }
    p.push({ x: tx * T, y: lvlY(tl) });
    return p;
  }
  G.goto = (where) => {   // where: 'smithy' | 'house' | 'hole' | {x,lvl}
    if (mode !== 'shore' || trans) return;
    SFX.init();
    if (where === 'smithy') { hero.path = townPath(TL.smithy.door, 0); hero.then = () => enterDoor('smithy'); }
    else if (where === 'house') { hero.path = townPath(TL.house.door, 1); hero.then = () => enterDoor('house'); }
    else if (where === 'hole') { hero.path = townPath(TL.hole.x0 - 0.45, 0); hero.then = dive; }
    else { hero.path = townPath(Math.max(0.35, Math.min(6.75, where.x)), where.lvl); hero.then = null; }
  };
  G.dive = () => G.goto('hole');
  let door = { k: null, t: 0, open: 0 };
  function enterDoor(k) {
    door = { k, t: 0, open: 1, dir: 1 }; SFX.play('door', 0.9); hero.face = 1;
    trans = { k: 'enter', t: 0, door: k };
  }
  G.exitDoor = () => {   // 界面关掉后从门里走出来
    if (!door.k) return; trans = { k: 'exit', t: 0, door: door.k };
  };
  function updateTown(dt) {
    // 门
    if (trans && (trans.k === 'enter' || trans.k === 'exit')) {
      trans.t += dt; const t = trans.t;
      if (trans.k === 'enter') { door.open = Math.min(1, t / 0.18); hero.alpha = Math.max(0, 1 - Math.max(0, t - 0.12) / 0.22); if (t > 0.36) { trans = null; G.ui.open(door.k === 'smithy' ? 'shop' : 'skill'); } }
      else { door.open = 1; hero.alpha = Math.min(1, t / 0.22); if (t > 0.3) { door.open = Math.max(0, 1 - (t - 0.3) / 0.18); } if (t > 0.5) { trans = null; door.k = null; SFX.play('door', 0.5, 0.9); } }
      return;
    }
    // 手动摇杆
    const [dx, dy] = dir();
    if (dx || dy) hero.path = null;
    if (hero.path && hero.path.length) {
      const p = hero.path[0], ddx = p.x - hero.x, ddy = p.y - hero.y, sp = (p.climb ? 3.8 : 4.2) * T * dt, d = Math.hypot(ddx, ddy);
      if (d <= sp) { hero.x = p.x; hero.y = p.y; hero.path.shift(); if (p.climb) hero.lvl = p.y < -T ? 1 : 0; }
      else { hero.x += ddx / d * sp; hero.y += ddy / d * sp; }
      if (Math.abs(ddx) > 1) hero.face = ddx > 0 ? 1 : -1;
      hero.climb = !!p.climb;
      const a = hero.climb ? 'Walk' : 'Run'; if (HERO.state !== a) HERO.play(a);
      if (!hero.path.length) { hero.path = null; hero.climb = false; HERO.play('Idle'); if (hero.then) { const f = hero.then; hero.then = null; f(); } }
    } else if (dx || dy) {
      const onLadder = Math.abs(hero.x - TL.ladder.x * T) < T * 0.35;
      if (dy && onLadder) { hero.climb = true; hero.x += (TL.ladder.x * T - hero.x) * Math.min(1, dt * 10); hero.y = Math.max(TL.plat.y * T, Math.min(0, hero.y + dy * 2.6 * T * dt)); hero.lvl = hero.y < TL.plat.y * T * 0.5 ? 1 : 0; if (HERO.state !== 'Walk') HERO.play('Walk'); }
      else if (dx && (!hero.climb || hero.y === 0 || hero.y === TL.plat.y * T)) {
        hero.climb = false; hero.face = dx; const lo = hero.lvl ? TL.plat.x0 + 0.25 : 0.3; hero.x = Math.max(lo * T, Math.min(6.75 * T, hero.x + dx * 3.4 * T * dt)); if (HERO.state !== 'Run') HERO.play('Run');
      }
    } else if (HERO.state === 'Run' || HERO.state === 'Walk') HERO.play('Idle');
    // 从洞口上方经过：小跳过去
    hero.hop = 0;
    if (!hero.lvl && !hero.climb) { const u = (hero.x / T - (TL.hole.x0 - 0.15)) / (TL.hole.x1 - TL.hole.x0 + 0.3); if (u > 0 && u < 1) hero.hop = -Math.sin(u * Math.PI) * T * 0.55; }
  }
  // 下矿：走到洞口 → 起跳 → 落进洞里，镜头跟到地下
  function dive() {
    if (mode !== 'shore') return; G.ui.hideShore();
    D = B.derive(S); newRun(); heroLook(false);
    trans = { k: 'dive', t: 0, x0: hero.x, cam0: camY }; hero.face = 1; HERO.play('Jump', { restart: true }); SFX.play('jump_A', 0.6);
  }
  function updateDive(dt) {
    trans.t += dt; const t = trans.t, hx = (TL.hole.x0 + 0.5) * T;
    if (t < 0.2) { hero.y = 0; }
    else if (t < 0.55) { const u = (t - 0.2) / 0.35; hero.x = trans.x0 + (hx - trans.x0) * u; hero.y = -Math.sin(u * Math.PI * 0.75) * T * 0.75; }
    else { hero.x = hx; if (trans.vy === undefined) trans.vy = -T * 1.5; trans.vy += T * 30 * dt; hero.y = Math.min(T, hero.y + trans.vy * dt); }
    const tc = Math.min(1, Math.max(0, (t - 0.4) / 0.7)); camY = trans.cam0 + ((T - VH * 0.42) - trans.cam0) * ease(tc);
    if (t > 0.38 && !trans.wh) { trans.wh = 1; SFX.play('whoosh', 0.5); }
    if (hero.y >= T && !trans.landed) { trans.landed = t; addFx('puff', hero.x, T * 0.95, T / 110); SFX.play('land', 0.9); shake = 0.12; HERO.play('Idle'); }
    if (trans.landed && t > 1.12) {
      trans = null; mode = 'run'; hero.c = 3; hero.r = 0; place(); R.on = true; G.ui.showRun(); S.runs++;
      G.ui.banner(B.AREA_NAME[B.areaOf(hero.r)], B.depthM(B.areaOf(hero.r) * B.AREA) + ' 米'); SFX.play('banner', 0.6);   // 横幅 = 区域起点深度，和顶部深度同一口径（B.depthM）
    }
  }
  // 回地面：镜头快速往上拉（中段速度线遮住跳切），主角从洞口跳出来，收获飞到顶部
  function rise() {
    mode = 'rise'; trans = { k: 'rise', t: 0, cam0: camY, cut: false }; SFX.play('whoosh', 0.8); G.ui.hideRun(); if (R && R.boom) R.boom.fly.length = 0;   // 回地面：飞行中的回旋镐清掉
  }
  function updateRise(dt) {
    trans.t += dt; const t = trans.t, tc = townCam();
    if (t < 0.3) { const u = t / 0.3; camY = trans.cam0 - u * u * VH * 1.3; }
    else {
      if (!trans.cut) { trans.cut = true; newRun(); hero.x = (TL.hole.x0 + 0.5) * T; hero.y = T; hero.lvl = 0; hero.alpha = 1; pet.x = hero.x; pet.y = T; TERRAIN.update(tc + VH, VH); }
      const u = Math.min(1, (t - 0.3) / 0.45); camY = tc + VH * 1.0 * Math.pow(1 - u, 3);
    }
    if (t >= 0.75 && !trans.pop) { trans.pop = 1; HERO.play('Jump', { restart: true }); SFX.play('jump_A', 0.6); heroLook(); }
    if (trans.pop) { const u = Math.min(1, (t - 0.75) / 0.45), hx = (TL.hole.x0 + 0.5) * T; hero.x = hx + (TL.hole.x0 - 0.45 - TL.hole.x0 - 0.5) * T * u; hero.face = -1; hero.y = T * (1 - u) - Math.sin(u * Math.PI) * T * 1.3; }
    if (t >= 1.2 && !trans.land) { trans.land = 1; hero.y = 0; addFx('puff', hero.x, -T * 0.05, T / 120); SFX.play('land', 0.8); HERO.play('Idle'); toShore(true); }   // toShore 里清 trans（v0.4 漏了，上岸后所有点击被挡住）
  }
  function toShore(fromRise) {
    mode = 'shore'; trans = null; D = B.derive(S); clearPetFx(); if (ST) { ST.setAnimation(0, 'Idle', true); pet.anim = 'Idle'; } if (!fromRise) { newRun(); hero.x = (TL.hole.x0 - 0.45) * T; hero.y = 0; hero.lvl = 0; camY = townCam(); pet.x = hero.x - T * 0.9; pet.y = 0; HERO.play('Idle'); }
    heroLook(); hero.alpha = 1; hero.path = null; G.ui.showShore(fromRise ? G.lastGain : null);
    if (G.looping() && fromRise) setTimeout(() => { if (mode === 'shore' && !trans && G.looping() && !document.getElementById('pop').classList.contains('on') && !G.ui.tab()) G.dive(); }, 1800);
  }
  G.townHit = (px, py) => {   // 画布像素 → 世界格
    const x = (px * dpr - OX) / T, y = (py * dpr + camY) / T;
    const h = TW.hit(x, y); if (h) return G.goto(h);
    if (y < TL.plat.y + 0.4 && x > TL.plat.x0 - 0.1 && y > TL.plat.y - 3) return G.goto({ x, lvl: 1 });
    if (y > -3) G.goto({ x, lvl: 0 });
  };

  /* ---------- 一趟 ---------- */
  function place() { hero.x = (hero.c + 0.5) * T; hero.y = (hero.r + 1) * T; }
  function fade(fn) { const f = $('fade'); f.classList.add('on'); setTimeout(() => { fn(); setTimeout(() => f.classList.remove('on'), 120); }, 260); }
  G.fade = fade;
  function endRun(why) {   // 'stam' 体力耗尽 | 'dead' 血量归零 | 'back' 主动返回
    if (!R.on || R.over) return; R.over = why; R.on = false; input.dx = input.dy = 0;
    if (why === 'dead') { HERO.play('Dead1', { restart: true }); SFX.play('hero_die'); } else HERO.play(why === 'stam' ? 'Stun' : 'Victory');
    if (why === 'dead' && G.adLeft('revive')) { setTimeout(() => G.ui.revive(), 700); return; }   // v0.18：复活每天 3 次（不再每趟 1 次），用完就不弹，直接结算
    setTimeout(() => G.ui.result(R, why), why === 'back' ? 250 : 800);
  }
  G.endRun = endRun;
  G.revive = () => { R.revived = true; R.over = null; R.on = true; R.hp = R.hpMax; hero.hurtT = 0; hero.hopT = 0; MOBS.calm(1.5); addFx('star', hero.x, hero.y - T * 0.5, T / 70); SFX.play('claim', 0.7); HERO.play('Idle'); };   // 16 节：原地满血继续
  G.giveUp = () => { R.revived = true; G.ui.result(R, 'dead'); };
  G.keepK = () => R.over === 'dead' ? D.keep : 1;
  G.collect = (mult, keep) => {   // mult：结算双倍广告 = 2（金币、宝石、材料都 ×2，琥珀除外）
    const k = (R.over === 'dead' && !keep) ? D.keep : 1, boost = S.boost > 0 ? 2 : 1, m = k * (mult || 1) * boost;
    const c = Math.floor(R.coin * m), g = Math.floor(R.gem * m), mat = {};
    for (const id in R.mat) { mat[id] = Math.floor(R.mat[id] * k * (id === 'amber' ? 1 : boost * (mult || 1))) || (R.mat[id] > 0 && k >= 0.7 ? 1 : 0); S.mat[id] = (S.mat[id] || 0) + mat[id]; if (mat[id]) S.seen[id] = 1; }
    if (R.mat.amber) { mat.amber = R.mat.amber; }
    S.coin += c; S.gem += g; if (S.boost > 0) S.boost--;
    S.lastRun = { coin: Math.floor(R.coin), gem: Math.floor(R.gem) }; S.best = Math.max(S.best, R.deep);
    G.lastGain = { coin: c, gem: g, mat }; G.save(); rise();
  };
  function addNum(x, y, text, col, big) { x = Math.max(T * 0.95, Math.min(T * 6.05, x)); nums.push({ x, y, text, col, t: 0, big }); if (nums.length > 40) nums.shift(); }
  function addFx(k, x, y, sc, o) { fx.push(Object.assign({ k, x, y, t: 0, sc: sc || 1 }, o || {})); if (fx.length > 60) fx.shift(); }   // o：rot 旋转、flip 横翻、add 叠加混合（v0.18 巨镐弧线）
  function drop(kind, x, y, n) { for (let i = 0; i < Math.min(6, n); i++) drops.push({ kind, x, y, vx: (Math.random() - 0.5) * T * 5, vy: -T * (3 + Math.random() * 3), t: -i * 0.03 }); if (drops.length > 80) drops.splice(0, drops.length - 80); }
  function gain(kind, v, x, y) { if (kind === 'coin') R.coin += v; else R.gem += v; addNum(x, y - T * 0.3, '+' + B.fmt(v), kind === 'coin' ? '#ffd84a' : '#e58bff'); }
  function gainMat(id, n, x, y) { R.mat[id] = (R.mat[id] || 0) + n; drop('m_' + id, x, y, 1); addNum(x, y - T * 0.65, '+' + n + ' ' + B.MAT[id].name, '#9df07a'); SFX.play(PICK_SFX[id] || 'pick_soft', 0.8); }
  G.gainMat = gainMat;

  function baseDig(k, r, mult) {   // 一下对这格的挖掘伤害（不算重击）；mult = 机制倍数（回旋镐 60%、巨镐侧格 50%），表土制霸照样一下碎
    let d = D.dig * (D.full && R.st > R.stMax * 0.5 ? 1 + B.P.fullBonus : 1) * (mult || 1);
    if (B.areaOf(r) === 0 && k.t !== 2) { d *= D.soil; if (D.soilx) d = Math.max(d, k.max); }
    return d;
  }
  function digDmg(k, r) {
    let d = baseDig(k, r);
    R.swings++; if (D.heavy && R.swings % 4 === 0) { d *= D.heavy; R.heavyHit = true; } else R.heavyHit = false;
    return d;
  }
  function hitBlock(c, r, dmg, quiet, mute) {   // mute：不放普通挖土声（巨镐那一下统一放 giant_hit）
    const k = cell(c, r); if (!(k.t === 1 || k.t === 2 || k.t === 4 || k.t === 5 || k.t === 6)) return;
    k.hp -= dmg; const x = (c + 0.5) * T, y = (r + 0.5) * T;
    const hx = x + (hero.x - x) * 0.45, hy = y + (hero.y - T * 0.45 - y) * 0.45;
    if (k.hp <= 0) {
      const t = k.t, info = B.CELL[t]; chips(c, r, x, y, t === 2 ? 9 : 6, 1); k.t = 0; R.blocks++;
      addFx('puff', x, y, T / 110); SFX.play(t === 2 ? 'chunk_fall' : 'dig_rock_block', t === 2 ? 1 : 0.8); if (t === 2) shake = 0.18;
      const v = B.dirtCoin(r) * info.coin * D.coinM; if (v > 0) { drop('coin', x, y, t === 5 ? 4 : 2); gain('coin', v, x, y); }
      if (info.mat) gainMat(info.mat, 1 + D.oreX, x, y);
      if (t === 6 && k.food) { const F = B.FOOD[k.food], h = R.stMax * F.heal; R.st = Math.min(R.stMax, R.st + h); R.ate++; drop('f_' + k.food, x, y, 1); addNum(x, y - T * 0.65, '+' + Math.round(F.heal * 100) + '% 体力', '#7cf06a', true); SFX.play('eat', 0.9); addFx('star', x, y, T / 90); k.food = null; }
      if (k.chest) openChest(c, r);
    } else if (!quiet) { if (!mute) SFX.play('dig_dirt', 0.7, k.t === 2 ? 0.8 : 1); chips(c, r, hx, hy, 3, 0.6); }
    if (R.heavyHit && !quiet) { addFx('ring', hx, hy, T / 120); shake = Math.max(shake, 0.1); }
    TERRAIN.cellChanged(c, r);
  }
  function openChest(c, r) {
    const x = (c + 0.5) * T, y = (r + 0.5) * T, v = B.dirtCoin(r) * 10 * D.coinM; cell(c, r).chest = 0;
    addFx('coinburst', x, y, T / 70); drop('coin', x, y, 6); gain('coin', v, x, y); SFX.play('chest', 0.9);
  }
  function chips(c, r, x, y, n, pow) {
    for (let i = 0; i < n; i++) {
      const im = TERRAIN.chip(c, r, (Math.random() * 6) | 0); if (!im) return;
      bits.push({ im, x: x + (Math.random() - 0.5) * T * 0.4, y: y + (Math.random() - 0.5) * T * 0.4, vx: (Math.random() - 0.5) * T * 4.5 * pow, vy: -T * (1.5 + Math.random() * 2.5) * pow, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, t: 0, s: 0.55 + Math.random() * 0.6 });
    }
    if (bits.length > 50) bits.splice(0, bits.length - 50);
  }
  function hitMon(m, dmg) {
    if (m.dead) return; let crit = false; if (D.crit && Math.random() < 0.15) { dmg *= 2.5; crit = true; }
    const mul = MOBS.dmgMul(m); dmg *= mul;   // v0.18：蜗牛缩壳 −75%、守卫撞墙晕着 ×1.5
    m.hp -= dmg; m.flash = 0.12; const x = (m.c + 0.5) * T, y = (m.r + 0.4) * T;
    addNum(x + (Math.random() < 0.5 ? -1 : 1) * T * (0.25 + Math.random() * 0.3), y - T * (0.35 + Math.random() * 0.35), (crit ? '暴击 ' : '') + B.fmt(Math.max(1, dmg)), crit ? '#ffb02e' : mul < 1 ? '#b9b3a6' : mul > 1 ? '#ffd84a' : '#ffffff', m.boss || crit || mul > 1); addFx('ring', x, y + T * 0.1, T / 240); SFX.play('mon_hit', 0.85);
    if (m.hp <= 0) {
      m.dead = 0.001; m.m.play('Dead', { restart: true, speed: 2.2 }); SFX.play('poof', 0.8); R.kills++;
      const row = R.rows.get(m.r); if (row) row[m.c].mon = 0;
      S.codex[m.kind] = (S.codex[m.kind] || 0) + 1; S.seen[m.kind] = 1;
      const M = B.MON[m.kind];
      drop('gem', x, y, m.boss ? 6 : 2); gain('gem', M.gem * D.gemM, x, y - T * 0.25); gain('coin', B.monCoin(m.kind, m.r) * D.coinM, x, y + T * 0.05); addFx('smoke', x, y, T / 150);
      if (D.kill) { R.st = Math.min(R.stMax, R.st + R.stMax * 0.08); addNum(x, y - T * 0.9, '+8% 体力', '#7cf06a'); }
      if (m.boss) {
        addFx('star', x, y, T / 50); shake = 0.35; SFX.play('chunk_fall');
        if (!S.boss) { S.boss = 1; R.firstBoss = true; gainMat('amber', 1, x, y); G.ui.banner('红甲虫王 已击败', '获得 甲虫琥珀 · 前方：沙岩层（下个版本开放）'); }
        D = B.derive(S); G.save();
      } else if (M.mat) {
        const p = M.mat === 'gel' ? D.slimeP : M.p, pk = S.pity[M.mat] || 0;
        if (Math.random() < p || pk + 1 >= M.pity) { S.pity[M.mat] = 0; gainMat(M.mat, 1, x, y); } else S.pity[M.mat] = pk + 1;
      }
    } else if (!MOBS.onHit(m) && m.m.state !== 'Attack') m.m.play('Hit', { restart: true, onEnd: () => m.m.play('Idle') });
  }
  function hurtHero(m, mult) {   // mult：招式伤害倍数（守卫冲撞 1.5 等，B.BOSS）
    if (!R.on) return; let d = B.hurt(m.atk * (mult || 1), D.def); if (R.petShield) { d *= 1 - R.petShield; R.petShield = 0; } R.hp -= d; hero.hurtT = 0.25; shake = Math.max(shake, 0.12);   // 花花专属「花盾」：回血后下一次受伤 −50%
    addNum(hero.x, hero.y - T * 1.0, '-' + B.fmt(d), '#ff5a4d'); SFX.play('hero_hurt', 0.8);
    if (D.counter && !m.dead) setTimeout(() => { if (R.on && !m.dead) { hitMon(m, D.atk * 2); } }, 120);
    if (R.hp <= 0) { R.hp = 0; endRun('dead'); }
  }

  /* ---------- v0.18 挖掘机制线：巨镐、回旋镐、光源（强度全在 B.MECH，区域 1 只开第一形态） ---------- */
  const monAt = (c, r) => R.mons.find(q => !q.dead && q.c === c && q.r === r);
  const solid = t => t === 1 || t === 2 || t === 4 || t === 5 || t === 6;
  // 巨镐：主格照常（上面已打），挥击方向的两侧各 side 格吃 sideK；rows > 1（以后的 3×3 进化）时往前再打几排。d = 主格这一下的伤害（含重击），null = 这一下是打怪
  function giantSwing(c, r, d) {
    const G2 = D.giant, dx = c - hero.c, dy = r - hero.r, px = dy ? 1 : 0, py = dy ? 0 : 1;   // 往下挖 → 左右；往旁边挖 → 上下
    const mult = d === null ? 1 : d / Math.max(1e-9, baseDig(cell(c, r), r));   // 主格的重击倍数也带给侧格
    for (let o = 0; o < G2.rows; o++) for (let s = -G2.side; s <= G2.side; s++) {
      if (!o && !s) continue; const cc = c + dx * o + px * s, rr = r + dy * o + py * s, k = cell(cc, rr), K = s ? G2.sideK : 1;
      if (rr < 0) continue;
      const m = monAt(cc, rr); if (m) { hitMon(m, D.atk * K); continue; }
      if (d !== null && solid(k.t)) hitBlock(cc, rr, baseDig(k, rr, K) * mult, false, true);
    }
    const hx = (c + 0.5) * T - dx * T * 0.2, hy = (r + 0.5) * T - dy * T * 0.2;   // 月牙的实体在鼓起那一侧，中心往主角方向挪，弧线正好扫过目标那一排
    // 弧线素材本身是往右鼓的月牙：往下挖转 90° 变成脚下横扫三格，朝左就先横翻
    const left = dy ? hero.face < 0 : dx < 0, rot = dy ? (left ? -1 : 1) * Math.PI / 2 : 0;
    addFx('arc', hx, hy, T * 3.2 / 173, { rot, flip: left, add: 1, sx: 0.45 });   // 弦长约 3.2 格盖住三格，鼓出深度压到约 1.8 格
    SFX.play('giant_hit', 0.75); shake = Math.max(shake, 0.06);
  }
  // 回旋镐：冷却到了就朝最近挥击的方向扔；沿途找目标（怪 / 实心格），打到第 pierce+1 个就折返；玄武岩（basalt=false）弹回不掉血；守卫门、屏幕边直接折返
  function boomPlan(dx, dy) {
    const B0 = D.boom, hits = []; let end = 0;
    for (let i = 1; i <= B0.range; i++) {
      const c = hero.c + dx * i, r = hero.r + dy * i, k = cell(c, r), m = monAt(c, r);
      if (m) { hits.push({ i, m }); end = i; if (hits.length > B0.pierce) break; continue; }
      if (k.t === 9 || k.t === 3) { end = i - 0.45; break; }
      if (k.t === 2 && !B0.basalt) { hits.push({ i, c, r, clink: 1 }); end = i - 0.35; break; }
      if (solid(k.t)) { hits.push({ i, c, r }); end = i; if (hits.length > B0.pierce) break; continue; }
      end = i;
    }
    return { hits, end };
  }
  const hcen = h => h.m ? [(h.m.c + 0.5) * T, (h.m.r + 0.5) * T] : [(h.c + 0.5) * T, (h.r + 0.5) * T];
  function boomHit(h) {
    const B0 = D.boom;
    if (h.m) { if (!h.m.dead) hitMon(h.m, D.atk * B0.dmg); return; }
    const k = cell(h.c, h.r);
    if (h.clink || (k.t === 2 && !B0.basalt)) { SFX.play('dig_dirt', 0.5, 0.6); addFx('ring', (h.c + 0.5) * T, (h.r + 0.5) * T, T / 200); return; }   // 玄武岩叉：叮一下弹回，不掉血
    if (!solid(k.t)) return;
    hitBlock(h.c, h.r, baseDig(k, h.r, B0.dmg)); addFx('ring', (h.c + 0.5) * T, (h.r + 0.5) * T, T / 220);
  }
  function updBoom(dt) {
    const Bm = R.boom, B0 = D.boom; if (!Bm || !B0) return;
    if (R.on && !Bm.fly.length) {
      Bm.t -= dt;
      if (Bm.t <= 0 && !hero.mv) {
        const [dx, dy] = hero.dig || [0, 1];
        for (let n = 0; n < B0.n; n++) {   // n > 1（以后的双镐 / 三镐）：扇形错开，这里先按同一方向
          const P = boomPlan(dx, dy), ox = (hero.c + 0.5) * T, oy = (hero.r + 0.5) * T;
          Bm.fly.push({ x: hero.x, y: hero.y - T * 0.5, dx, dy, ex: ox + dx * P.end * T, ey: oy + dy * P.end * T, hits: P.hits, hi: 0, ph: 'out', hold: 0, rot: 0, trail: [] });
        }
        SFX.play('boom_throw', 0.8);
      }
    }
    for (let i = Bm.fly.length - 1; i >= 0; i--) {
      const f = Bm.fly[i], sp = B0.speed * T * dt; f.rot += dt * B0.spin * Math.PI * 2 * (f.dx < 0 ? -1 : 1);
      f.trail.unshift({ x: f.x, y: f.y, rot: f.rot }); if (f.trail.length > 6) f.trail.pop();
      if (f.ph === 'out') {
        const ddx = f.ex - f.x, ddy = f.ey - f.y, d = Math.hypot(ddx, ddy);
        // 沿途经过目标格中心：去程打一下
        while (f.hi < f.hits.length) { const h = f.hits[f.hi], [cx, cy] = hcen(h); if (d > sp && Math.hypot(cx - f.x, cy - f.y) > sp + T * 0.38) break; if (R.on) boomHit(h); f.hi++; }
        if (d <= sp) { f.x = f.ex; f.y = f.ey; f.ph = 'hold'; } else { f.x += ddx / d * sp; f.y += ddy / d * sp; }
      } else if (f.ph === 'hold') {
        f.hold += dt; if (f.hold >= B0.linger) { f.ph = 'back'; if (B0.hits > 1 && R.on && f.hits.length) boomHit(f.hits[f.hits.length - 1]); f.hi = f.hits.length - 2; }
      } else {
        const tx = hero.x, ty = hero.y - T * 0.5, ddx = tx - f.x, ddy = ty - f.y, d = Math.hypot(ddx, ddy), bs = sp * 1.1;
        while (f.hi >= 0 && B0.hits > 1) { const h = f.hits[f.hi], [cx, cy] = hcen(h); if (Math.hypot(cx - f.x, cy - f.y) > bs + T * 0.38) break; if (R.on) boomHit(h); f.hi--; }
        if (d <= Math.max(bs, T * 0.3)) { Bm.fly.splice(i, 1); if (!Bm.fly.length) { Bm.t = B0.cd; SFX.play('boom_catch', 0.8); } }
        else { f.x += ddx / d * bs; f.y += ddy / d * bs; }
      }
    }
  }
  // 光源：暗格宝箱只在头灯半径内显形、才能开（0 = 看不见，1 = 完全显形，边缘 0.6 格淡入）
  function darkVis(c, r) { const d = Math.hypot((c + 0.5) * T - hero.x, (r + 0.5) * T - (hero.y - T * 0.5)) / T; return Math.max(0, Math.min(1, (D.lampR - d) / 0.6 + 0.0001)); }
  function neediest() {   // “最缺”的区域 1 材料：下一件装备 / 还没点的机制节点里差得最多的那种；都不缺就给手里最少的
    const have = k => (S.mat[k] || 0) + (R.mat[k] || 0), short = {};
    const add = m => { for (const k in m || {}) { if (k === 'amber') continue; const lack = m[k] - have(k); if (lack > 0) short[k] = Math.max(short[k] || 0, lack); } };
    for (const sl of B.SLOTS) { const g = B.GEAR[sl][(S.gear[sl] || 0) + 1]; if (g && !g.next) add(g.mat); }
    for (const n of B.SK) if (n.mat && (S.skill[n.id] || 0) < n.max) add(n.mat);
    const ks = Object.keys(short); if (ks.length) return ks.sort((a, b) => short[b] - short[a])[0];
    return B.MAT_ORDER.filter(k => k !== 'amber').sort((a, b) => have(a) - have(b))[0];
  }
  G.neediest = () => neediest();
  function openDark(c, r) {
    const k = cell(c, r), M = B.MECH.lamp, x = (c + 0.5) * T, y = (r + 0.5) * T; k.dchest = 0; k.dopen = time;
    addFx('star', x, y, T / 80); addFx('coinburst', x, y, T / 90); SFX.play('dark_chest', 0.9);
    drop('gem', x, y, 4); gain('gem', M.gem, x, y); const mk = neediest(); gainMat(mk, M.matN, x, y);
  }

  /* ---------- 自动模式 ---------- */
  G.toggleAuto = () => { if (!G.vipOwn('auto')) return false; S.auto = !S.auto; if (!S.auto && R) R.auto = null; G.save(); return true; };
  function autoDir() {   // 自动模式下的方向；该停时返回 null 并提示
    if (!R.auto) return null;
    const [dx, dy] = R.auto, h = hero, n = cell(h.c + dx, h.r + dy);
    let stop = false;
    if (dx && n.t === 9) stop = true;
    if (dy && (n.t === 2 || n.t === 3)) stop = true;
    if (stop) { R.auto = null; R.autoStop = time; SFX.play('ding', 0.6); return null; }
    return R.auto;
  }

  /* ---------- 输入：摇杆（地下）/ 点击或摇杆（小镇） ---------- */
  const input = { dx: 0, dy: 0, id: null, ox: 0, oy: 0, moved: false };
  const stick = $('stick'), knob = $('knob');
  wrap.addEventListener('pointerdown', e => {
    if (e.target.closest('.ui,button,.panel')) return; SFX.init(); if (mode !== 'run' && mode !== 'shore') return; if (trans) return;
    input.id = e.pointerId; input.moved = false; const b = wrap.getBoundingClientRect(); input.ox = e.clientX - b.left; input.oy = e.clientY - b.top;
    if (mode === 'run') { stick.style.display = 'block'; stick.style.left = input.ox + 'px'; stick.style.top = input.oy + 'px'; knob.style.transform = 'translate(-50%,-50%)'; }
  });
  window.addEventListener('pointermove', e => {
    if (e.pointerId !== input.id) return; const b = wrap.getBoundingClientRect(); let dx = e.clientX - b.left - input.ox, dy = e.clientY - b.top - input.oy;
    const len = Math.hypot(dx, dy), max = wrap.clientWidth * 0.11;
    if (mode === 'shore' && !input.moved && len > max * 0.35) { input.moved = true; stick.style.display = 'block'; stick.style.left = input.ox + 'px'; stick.style.top = input.oy + 'px'; }
    if (len > max) { dx *= max / len; dy *= max / len; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    if (len < max * 0.3) { input.dx = input.dy = 0; return; }
    if (Math.abs(dx) > Math.abs(dy)) { input.dx = Math.sign(dx); input.dy = 0; } else { input.dx = 0; input.dy = Math.sign(dy); }
    if (mode === 'run' && S.auto && R && input.dy >= 0) R.auto = [input.dx, input.dy];
  });
  const up = e => {
    if (e.pointerId !== input.id) return; input.id = null; input.dx = input.dy = 0; stick.style.display = 'none';
    if (mode === 'shore' && !input.moved) G.townHit(input.ox, input.oy);
  };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  const keys = {};
  // 弹窗（#pop.on）或面板（#panel.on）打开时，键盘 / 摇杆不让主角走动、挖矿（修复 B 线发现：开着弹窗按方向键主角还在走）
  const uiBlocked = () => { const pp = document.getElementById('pop'), pn = document.getElementById('panel'); return !!((pp && pp.classList.contains('on')) || (pn && pn.classList.contains('on'))); };
  window.addEventListener('keydown', e => { SFX.init(); if (uiBlocked()) return; keys[e.key] = 1; if (mode === 'run' && S.auto) { const k = e.key; if (k === 'ArrowLeft' || k === 'a') R.auto = [-1, 0]; if (k === 'ArrowRight' || k === 'd') R.auto = [1, 0]; if (k === 'ArrowDown' || k === 's') R.auto = [0, 1]; } });
  window.addEventListener('keyup', e => { keys[e.key] = 0; });
  function dir() {
    if (uiBlocked()) { for (const k in keys) keys[k] = 0; return G.bot && mode === 'run' ? G.bot() : [0, 0]; }   // 开着弹窗 / 面板：清掉按住的键，不动（测试机器人照常）
    if (input.dx || input.dy) return [input.dx, input.dy];
    if (keys.ArrowLeft || keys.a) return [-1, 0]; if (keys.ArrowRight || keys.d) return [1, 0]; if (keys.ArrowDown || keys.s) return [0, 1]; if (keys.ArrowUp || keys.w) return [0, -1];
    if (G.bot && mode === 'run') return G.bot();
    return [0, 0];
  }

  /* ---------- 每帧逻辑 ---------- */
  function update(dt) {
    time += dt;
    if (HERO) HERO.update(dt);
    if (SK && mode === 'run' && R && !trans) petFollowRun(dt);   // v0.18 宠物收尾：地下只站 / 飞在空格里（见 petFollowRun）
    else if (SK && trans && trans.k === 'rise') petFollowRise();
    else if (SK) {
      let tx = hero.x - hero.face * T * 0.78, ty = hero.y;
      if (trans && trans.k === 'dive') { tx = (TL.hole.x0 - 0.5) * T; ty = 0; }   // 下矿：宠物走到洞口左边的地面上等（不跟着斜穿进土里），开挖后由 petFollowRun 接手
      if (mode === 'shore' && !(trans && (trans.k === 'dive' || trans.k === 'rise'))) {   // 宠物只在地面这一层走（进出门的过渡也算在小镇里）（狗不爬梯子）：人在平台上 / 正在爬梯，就在梯子脚下等
        if (hero.lvl || hero.climb) tx = (TL.ladder.x + 0.75) * T;
        tx = Math.max(0.4 * T, Math.min(6.7 * T, tx)); const h0 = (TL.hole.x0 - 0.1) * T, h1 = (TL.hole.x1 + 0.1) * T;
        if (tx > h0 && tx < h1) tx = (tx - h0 < h1 - tx) ? h0 - T * 0.05 : h1 + T * 0.05;   // 不停在洞口上
        ty = 0;
      }
      const dx = tx - pet.x, dy = ty - pet.y, d = Math.hypot(dx, dy);
      if (d > T * 3) { pet.x = tx; pet.y = ty; } else if (d > 2) { const sp = Math.min(d, T * 9 * dt); pet.x += dx / d * sp; pet.y += dy / d * sp; if (Math.abs(dx) > 3) pet.face = dx > 0 ? 1 : -1; if (pet.anim === 'Idle') petAnim('Walk'); }
      else if (pet.anim === 'Walk') petAnim('Idle');
    }
    if (SK) { ST.update(dt); ST.apply(SK); SK.x = 0; SK.y = 0; SK.updateWorldTransform(spine.Physics ? spine.Physics.update : undefined); }
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i], v = A.VFX[f.k]; f.t += dt; if (f.t * v[3] >= v[0]) fx.splice(i, 1); }
    for (let i = nums.length - 1; i >= 0; i--) { nums[i].t += dt; if (nums[i].t > 0.9) nums.splice(i, 1); }
    for (let i = bits.length - 1; i >= 0; i--) { const b = bits[i]; b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += T * 16 * dt; b.rot += b.vr * dt; if (b.t > 0.75) bits.splice(i, 1); }
    for (let i = drops.length - 1; i >= 0; i--) {
      const p = drops[i]; p.t += dt; if (p.t < 0) continue;
      if (p.t < 0.28) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += T * 22 * dt; }
      else { const tx = (p.kind === 'gem' ? 2.6 : 0.55) * T, ty = camY + T * 0.62, k = Math.min(1, dt * 11); p.x += (tx - p.x) * k; p.y += (ty - p.y) * k; if (Math.hypot(tx - p.x, ty - p.y) < T * 0.25 || p.t > 1.2) { drops.splice(i, 1); if (p.kind === 'coin' || p.kind === 'gem') SFX.play(p.kind === 'coin' ? 'pickup_coin' : 'pickup_gem', 0.35); } }
    }
    if (shake > 0) shake = Math.max(0, shake - dt);
    if (trans && trans.k === 'dive') { updateDive(dt); return; }
    if (mode === 'shore') { updateTown(dt); if (!trans) camY += (townCam() - camY) * Math.min(1, dt * 8); return; }
    if (trans && trans.k === 'rise') { updateRise(dt); return; }
    if (!R) return;
    const footT = (o, x, y) => { const f = TERRAIN.floorAt(x, y) - y; o.vo = o.vo === undefined ? f : o.vo + (f - o.vo) * Math.min(1, dt * 14); };
    footT(hero, hero.x, hero.y);   // 宠物的落脚偏移在 petFollowRun 里按所在格算
    for (const m of R.mons) {   // v0.18：各种怪的行为在 mobs.js（史莱姆蹦、蜗牛爬 + 缩壳、蝙蝠俯冲、守卫三招轮换）
      if (Math.abs(m.r - hero.r) > 12) continue;
      if (m.flash > 0) m.flash -= dt;
      if (m.dead) { m.m.update(dt); m.dead += dt; continue; }
      if (!R.on) { m.m.update(dt); continue; }
      MOBS.update(m, dt);
    }
    if (R.on) MOBS.tick(dt);
    R.mons = R.mons.filter(m => !(m.dead > 0.7)); updateBolts(dt); updatePetFx(dt);
    const ty = runCam(); camY += (ty - camY) * Math.min(1, dt * 7);
    updBoom(dt);   // v0.18 回旋镐（R.on 为假时只飞回、不打、不再扔）
    if (hero.hurtT > 0) hero.hurtT -= dt;   // 受伤发白 0.25 秒（放在 R.on 判断前：结算 / 被打倒时也照样消退）
    if (!R.on) return;
    R.t += dt; petWeb(dt); petTick(dt);
    if (R.floatT > 0) R.floatT -= dt; else R.st -= B.drain(Math.max(0, hero.r)) * dt;   // v0.18 泡泡鱼专属「浮力」：吐泡泡后几秒不掉体力
    if (R.st <= 0) { R.st = 0; endRun('stam'); return; }
    if (hero.hopT > 0) {   // v0.18 小跳中：不能挖、不能走（落地再说）
      hero.hopT -= dt; if (hero.hopT <= 0) { hero.hopT = 0; SFX.play('land', 0.35); HERO.play('Idle'); } else return;
    }
    if (hero.mv > 0) {
      hero.mv -= dt; const k = Math.max(0, hero.mv / 0.15);
      hero.x = hero.tx + (hero.fx - hero.tx) * k; hero.y = hero.ty + (hero.fy - hero.ty) * k;
      if (hero.mv <= 0) { hero.x = hero.tx; hero.y = hero.ty; hero.mv = 0; R.deep = Math.max(R.deep, B.depthM(hero.r)); arrive(); }
      else return;
    }
    // 下面空了就往下掉
    const below = cell(hero.c, hero.r + 1);
    if (below.t === 0 && !R.mons.some(q => !q.dead && q.c === hero.c && q.r === hero.r + 1)) { move(0, 1); return; }
    let [dx, dy] = dir();
    const manual = !!(dx || dy);
    if (!manual && S.auto && R.auto) { const a = autoDir(); if (a) [dx, dy] = a; }
    // 身边有怪：没输入（或自动模式）时自动打，包括正上方
    const adjM = R.mons.find(q => !q.dead && Math.abs(q.c - hero.c) + Math.abs(q.r - hero.r) === 1);
    if (adjM && (!manual || (dx === adjM.c - hero.c && dy === adjM.r - hero.r))) { swing(dt, 'mon', adjM, adjM.r - hero.r); if (adjM.c !== hero.c) hero.face = adjM.c > hero.c ? 1 : -1; return; }
    // VIP 法杖：3 格内、中间是空的同一行 / 同一列有怪 → 站定放魔法弹（没输入 / 自动模式 / 输入朝着它时；手动往别处走就不打）
    if (D.staff) { const rm = staffTarget(); if (rm) { const sx = Math.sign(rm.c - hero.c), sy = Math.sign(rm.r - hero.r); if (!manual || (dx === sx && dy === sy)) { swing(dt, 'mon', rm, sy); if (sx) hero.face = sx; return; } } }
    if (!dx && !dy) { stopSwing(); if (HERO.state !== 'Idle') HERO.play('Idle'); return; }
    if (dy < 0) { stopSwing(); hero.hopT = B.HOP.t; HERO.play('Jump', { restart: true }); return; }   // 往上：上面没有怪 → 原地小跳（v0.18：躲守卫的冲撞和冲击波；不往上挖）
    if (dx) hero.face = dx;
    const c = hero.c + dx, r = hero.r + dy, k = cell(c, r), m = R.mons.find(q => q.c === c && q.r === r && !q.dead);
    if (m) { swing(dt, 'mon', m, dy); return; }
    if (k.t === 9 || k.t === 3) { stopSwing(); if (HERO.state !== 'Idle') HERO.play('Idle'); if (k.t === 3 && time - (hero.bumpT || 0) > 1.5) { hero.bumpT = time; SFX.play('dig_dirt', 0.5, 0.6); G.ui.toast(S.boss ? '前方：沙岩层（下个版本开放）' : '先击败守卫“红甲虫王”'); } return; }
    if (k.t === 1 || k.t === 2 || k.t >= 4) { swing(dt, 'block', { c, r }, dy); return; }
    if (R.mons.some(q => q.dead && q.c === c && q.r === r)) return;
    stopSwing(); move(dx, dy);
  }
  function move(dx, dy) {
    hero.fx = hero.x; hero.fy = hero.y; hero.c += dx; hero.r += dy; hero.tx = (hero.c + 0.5) * T; hero.ty = (hero.r + 1) * T; hero.mv = 0.15;
    if (HERO.state !== 'Run') HERO.play('Run'); if (dy) SFX.play('land', 0.25);
  }
  function arrive() {   // 走进一格：蜘蛛网、宝箱
    const k = cell(hero.c, hero.r);
    if (k.web) { k.web = 0; gainMat('silk', 1 + (D.oreX ? 1 : 0), hero.x, hero.y - T * 0.5); addFx('puff', hero.x, hero.y - T * 0.5, T / 140); }
    if (k.dchest && darkVis(hero.c, hero.r) > 0) openDark(hero.c, hero.r);
  }
  function stopSwing() { if (hero.swinging) { hero.swinging = null; hero.sw = 0; HERO.aim = 0; } }
  function swing(dt, kind, tg, dy) {
    const key = kind + tg.c + ',' + tg.r;
    if (hero.swinging !== key) { hero.swinging = key; hero.sw = 0; heroLook(kind === 'mon'); HERO.play('Attack', { range: [0.75, 1.2], speed: 0.45 * D.freq, restart: true }); SFX.play('swing', 0.35); }
    HERO.aim = dy > 0 ? -62 : dy < 0 ? 70 : 0; hero.dig = dy > 0 ? [0, 1] : dy < 0 ? hero.dig : [tg.c > hero.c ? 1 : tg.c < hero.c ? -1 : hero.face, 0];   // 回旋镐朝最近一次挥击的方向扔
    const p0 = hero.sw; hero.sw += dt * D.freq;
    if (p0 < 0.55 && hero.sw >= 0.55) {
      if (kind === 'mon') { if (D.staff) castBolt(tg); else { hitMon(tg, D.atk); if (D.giant) giantSwing(tg.c, tg.r, null); } }   // 拿法杖打怪是远程魔力弹，巨镐只管近战挥击
      else { const k = cell(tg.c, tg.r), d = digDmg(k, tg.r); hitBlock(tg.c, tg.r, d, false, !!D.giant); if (D.pierce && dy > 0) hitBlock(tg.c, tg.r + 1, d * 0.5, true); if (D.giant) giantSwing(tg.c, tg.r, d); }
    }
    if (hero.sw >= 1) { hero.sw -= 1; SFX.play('swing', 0.3); }
  }

  /* ---------- VIP 法杖：远程魔法弹 ---------- */
  const bolts = [];
  function staffTarget() {   // 最近的、中间格子都空着的同一行 / 同一列的怪（不含正相邻：那由上面的近战逻辑处理）
    let best = null, bd = 99;
    for (const m of R.mons) {
      if (m.dead) continue; const dc = m.c - hero.c, dr = m.r - hero.r, d = Math.abs(dc) + Math.abs(dr);
      if ((dc && dr) || d < 2 || d > D.staffRange || d >= bd) continue;   // 射程：基础 2 格 + 技能树「法杖射程」
      const sx = Math.sign(dc), sy = Math.sign(dr); let ok = true;
      for (let i = 1; i < d; i++) { const c = hero.c + sx * i, r = hero.r + sy * i, k = cell(c, r); if (k.t !== 0 || R.mons.some(q => !q.dead && q.c === c && q.r === r)) { ok = false; break; } }
      if (ok) { best = m; bd = d; }
    }
    return best;
  }
  function castBolt(m) {
    const x = hero.x + hero.face * T * 0.35, y = hero.y - T * 0.62;
    bolts.push({ m, x, y, dmg: D.atk * D.staffK, t: 0, pierce: D.staffPierce, split: D.staffSplit, dx: Math.sign(m.c - hero.c), dy: Math.sign(m.r - hero.r), left: D.staffRange - (Math.abs(m.c - hero.c) + Math.abs(m.r - hero.r)) }); SFX.play('swing', 0.5, 1.4);
  }
  function updateBolts(dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i], m = b.m; b.t += dt;
      const tx = (m.c + 0.5) * T, ty = (m.r + 0.45) * T, dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy), sp = T * B.STAFF.speed * dt;
      if (m.dead || !R || !R.on && R.over) { bolts.splice(i, 1); continue; }
      if (d <= sp) { bolts.splice(i, 1); addFx('ring', tx, ty, T / 160); hitMon(m, b.dmg); boltAfter(b, m, tx, ty); continue; }
      b.x += dx / d * sp; b.y += dy / d * sp;
    }
  }
  // 法杖分支（技能树）：穿透 = 沿原方向在剩余射程里找下一只（中间格子要空）；分裂 = 命中处分出 2 颗小弹打 splitR 格内别的怪
  function boltAfter(b, m, x, y) {
    if (b.pierce > 0 && b.left > 0) {
      for (let i = 1; i <= b.left; i++) {
        const c = m.c + b.dx * i, r = m.r + b.dy * i, q = R.mons.find(q => !q.dead && q.c === c && q.r === r);
        if (q) { bolts.push({ m: q, x, y, dmg: b.dmg * B.STAFF.pierceK, t: 0, pierce: b.pierce - 1, split: false, dx: b.dx, dy: b.dy, left: b.left - i }); break; }
        if (cell(c, r).t !== 0) break;
      }
    }
    if (b.split) {
      const near = R.mons.filter(q => !q.dead && q !== m && Math.abs(q.c - m.c) + Math.abs(q.r - m.r) <= B.STAFF.splitR).sort((p, q) => (Math.abs(p.c - m.c) + Math.abs(p.r - m.r)) - (Math.abs(q.c - m.c) + Math.abs(q.r - m.r))).slice(0, 2);
      for (const q of near) bolts.push({ m: q, x, y, dmg: b.dmg * B.STAFF.splitK, t: 0, pierce: 0, split: false, small: 1, dx: 0, dy: 0, left: 0 });
    }
  }
  function drawBolts(ox, cy) {
    if (!bolts.length) return; const im = matImg('hero/parts/' + B.STAFF.ball + '.png'); if (!im.width) return;
    const z = T * 0.42;
    for (const b of bolts) { const zz = b.small ? z * 0.6 : z; ctx.globalAlpha = 1; ctx.save(); ctx.translate(Math.round(ox + b.x), Math.round(b.y - cy)); ctx.rotate(b.t * 9); ctx.drawImage(im, -zz / 2, -zz / 2, zz, zz); ctx.restore(); }
  }

  /* ---------- v0.18 宠物收尾：地下跟随只站 / 飞在空格里（项目规则“跟随的宠物只走它能走的面”） ---------- */
  // 以前固定跟在主角身后 0.78 格，主角在 1 格宽竖井里时宠物叠在岩石上。现在：
  // ① 可站的格 = 空格（t=0）且没有活着的怪；第 −1 行是地面上的空气（洞口两边能站），再往上不去；
  // ② 目标 = 主角身边 2 格内、从主角那格沿空格走得到的格里打分最低的：路程 + 在主角前面 +0.5 + 比主角低 +1 + 离开同一行每格 +0.5；
  //    走路的宠物（挖挖狗 / 炸弹崽 / 花花）脚下悬空 +2（优先站在地上），飞的（南瓜灯 / 泡泡鱼，B.PETS[k].fly）不罚；当前目标 −0.4 防来回换；
  //    竖井里身边没有能站的地方 → 选主角头顶上那格（竖井上方空的地方）跟着；一个空格都没有才和主角同一格（往身后偏 0.3 格）；
  // ③ 移动：沿空格 4 连通的最短路一格一格走（先对齐当前格再拐弯，不斜穿墙角）；找不到路 / 离得太远（> 6 步）就直接到位；
  // ④ 画的落脚：脚下是实心 → 贴着真实地表（TERRAIN.floorAt）；悬空 → 停在格子底边；飞的宠物离地 0.12 格、上下轻轻浮动。
  const petCellOk = (c, r) => c >= 0 && c < W && r >= -1 && cell(c, r).t === 0 && !monAt(c, r);
  const petHole = c => c >= TL.hole.x0 && c < TL.hole.x1;
  const petStand = (c, r) => r === -1 ? !petHole(c) : cell(c, r + 1).t !== 0;
  function petBfs(c0, r0, goal, maxD) {   // 空格 4 连通 BFS（主角那格也能过）；goal(c, r) 为真就返回路径；maxD 步数上限
    const key = (c, r) => c + ',' + r, seen = new Map([[key(c0, r0), null]]), q = [[c0, r0, 0]], pass = (c, r) => petCellOk(c, r) || (c === hero.c && r === hero.r);
    while (q.length) {
      const [c, r, d] = q.shift();
      if (goal(c, r)) { const path = [[c, r]]; let k = seen.get(key(c, r)); while (k) { path.unshift(k); k = seen.get(key(k[0], k[1])); } return path; }
      if (d >= maxD) continue;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr, kk = key(nc, nr); if (seen.has(kk) || !pass(nc, nr)) continue; seen.set(kk, [c, r]); q.push([nc, nr, d + 1]); }
    }
    return null;
  }
  function petPickCell() {
    const fly = D.pet && D.pet.fly, hc = hero.c, hr = hero.r; let best = null, bs = 1e9;
    for (let r = hr - 2; r <= hr + 2; r++) for (let c = hc - 2; c <= hc + 2; c++) {
      if ((c === hc && r === hr) || !petCellOk(c, r)) continue;
      const p = petBfs(hc, hr, (x, y) => x === c && y === r, 4); if (!p) continue;
      const dc = c - hc, dr = r - hr;
      let sc = p.length - 1 + (dc * hero.face > 0 ? 0.5 : 0) + (dr > 0 ? 1 : 0) + Math.abs(dr) * 0.5 + (!fly && !petStand(c, r) ? 2 : 0);
      if (pet.tc === c && pet.tr === r) sc -= 0.4;
      if (sc < bs) { bs = sc; best = [c, r]; }
    }
    return best;
  }
  function petFollowRun(dt) {
    const P = D.pet || {}, tg = petPickCell(), ax = c => (c + 0.5) * T, ay = r => (r + 1) * T;
    let gx, gy, path = null;
    if (tg) { pet.tc = tg[0]; pet.tr = tg[1]; gx = ax(tg[0]); gy = ay(tg[1]); }
    else { pet.tc = pet.tr = null; gx = hero.x - hero.face * T * 0.3; gy = hero.y; }   // 一个空格都没有：和主角同一格，往身后偏一点
    const pc = Math.floor(pet.x / T), pr = Math.round(pet.y / T) - 1, inOk = petCellOk(pc, pr) || (pc === hero.c && pr === hero.r);
    if (inOk && tg) path = petBfs(pc, pr, (c, r) => c === tg[0] && r === tg[1], 6);
    let mx = 0, moving = false;
    if (!inOk || (tg && !path) || Math.hypot(gx - pet.x, gy - pet.y) > T * 4) { pet.x = gx; pet.y = gy; }   // 起步在土里 / 走不到 / 太远：直接到位
    else {
      let nx = gx, ny = gy;   // 下一个落点：路径上的下一格；拐弯前先回到当前格的中线
      if (path && path.length > 1) {
        const [c1, r1] = path[1];
        if (c1 !== pc && Math.abs(pet.y - ay(pr)) > 1) { nx = ax(pc); ny = ay(pr); }
        else if (r1 !== pr && Math.abs(pet.x - ax(pc)) > 1) { nx = ax(pc); ny = ay(pr); }
        else { nx = ax(c1); ny = ay(r1); }
      }
      const dx = nx - pet.x, dy = ny - pet.y, d = Math.hypot(dx, dy);
      if (d > 1) { const sp = Math.min(d, T * 7 * dt); pet.x += dx / d * sp; pet.y += dy / d * sp; mx = dx; moving = true; }
      else { pet.x = nx; pet.y = ny; }
    }
    if (moving) { if (Math.abs(mx) > 0.5) pet.face = mx > 0 ? 1 : -1; if (pet.anim === 'Idle') petAnim('Walk'); }
    else { if (pet.anim === 'Walk') petAnim('Idle'); if (pet.anim === 'Idle' && Math.abs(hero.x - pet.x) > 2) pet.face = hero.x > pet.x ? 1 : -1; }
    // 落脚偏移
    const cc = Math.floor(pet.x / T), cr = Math.round(pet.y / T) - 1, stand = petStand(cc, cr) && Math.abs(pet.y - ay(cr)) < T * 0.25;
    let f = 0;
    if (P.fly) f = -T * 0.12 + Math.sin(time * 2.6) * T * 0.04;
    else if (stand && cr >= 0) { f = TERRAIN.floorAt(pet.x, pet.y) - pet.y; f = Math.max(-T * 0.35, Math.min(T * 0.35, f)); }
    pet.vo = pet.vo === undefined ? f : pet.vo + (f - pet.vo) * Math.min(1, dt * 14);
  }
  function petFollowRise() {   // 回地面：切镜头前宠物原地不动；切到洞口后沿主角跳出来的同一条弧线晚 0.14 秒跟出洞（不穿土）
    if (!trans.cut) return;
    const tr = trans.trail || (trans.trail = []); tr.push([trans.t, hero.x, hero.y]);
    const tt = trans.t - 0.14; let p = tr[0]; for (const q of tr) if (q[0] <= tt) p = q;
    pet.x = p[1]; pet.y = p[2]; pet.face = -1; pet.vo = 0; if (pet.anim === 'Walk') petAnim('Idle');
  }

  /* ---------- VIP 宠物 挖挖狗：身边 1 格内的蜘蛛网自动收 ---------- */
  function petWeb(dt) {
    if (!D.pet || !D.pet.web || !SK || !R.on) return; R.webT = (R.webT || 0) + dt; if (R.webT < 0.3) return; R.webT = 0;
    const wr = D.pet.webR || 1;   // v0.18 探索类「收集范围」：1 → 2 格
    for (let dy = -wr; dy <= wr; dy++) for (let dx = -wr; dx <= wr; dx++) {
      if (!dx && !dy) continue; const c = hero.c + dx, r = hero.r + dy; if (c < 0 || c >= W) continue; const k = cell(c, r);
      if (k.web && k.t === 0) { k.web = 0; const x = (c + 0.5) * T, y = (r + 0.5) * T; gainMat('silk', 1 + (D.oreX ? 1 : 0), x, y); addFx('puff', x, y, T / 140); petAct('Attack'); return; }
    }
  }

  /* ---------- v0.18 宠物机制：每只一个专注的主动机制（B.PETS 的 kind / cd），只在挖矿中、没在过渡时触发 ---------- */
  // 链路：冷却到 → 有目标才放（没目标就等着，冷却保持满）→ 宠物播 Attack / Busking → 特效 + 固定音效 → 生效 → 宠物回 Idle
  const petQ = [], pbombs = [];   // 延时生效的动作、飞行中的炸弹（都按游戏时间走，冻结时间时一起停）
  function petAct(a) {   // 强制从头播一次动作，播完回 Idle（按游戏时间，不用 setTimeout）
    if (!ST || !SK) return; const an = SK.data.findAnimation(a); if (!an) return;
    ST.setAnimation(0, a, false); ST.addAnimation(0, 'Idle', true, 0); pet.anim = a; pet.actT = Math.min(an.duration, 1.1);   // Busking 是一段长舞，最多播 1.1 秒就回 Idle
  }
  const digOk = k => k.t === 1 || k.t === 2 || k.t === 4 || k.t === 5 || k.t === 6;
  function petBlockTarget(ex) {   // 主角正在挖的那格 → 脚下 → 面朝的一边 → 背后；ex = 已选过的格（双爪 / 连环炸的第 2 个目标用）
    const no = (c, r) => ex && ex.c === c && ex.r === r;
    const sw = hero.swinging; if (sw && sw.startsWith('block')) { const [c, r] = sw.slice(5).split(',').map(Number); if (digOk(cell(c, r)) && !no(c, r)) return { c, r }; }
    for (const [dx, dy] of [[0, 1], [hero.face, 0], [-hero.face, 0]]) { const c = hero.c + dx, r = hero.r + dy; if (c < 0 || c >= W || no(c, r)) continue; if (digOk(cell(c, r)) && !monAt(c, r)) return { c, r }; }
    return null;
  }
  function petAdjMon(ex) {   // 正在打的怪优先，其次任意相邻的怪；ex = 已选过的怪
    const sw = hero.swinging; if (sw && sw.startsWith('mon')) { const [c, r] = sw.slice(3).split(',').map(Number); const m = monAt(c, r); if (m && m !== ex && Math.abs(c - hero.c) + Math.abs(r - hero.r) === 1) return m; }
    return R.mons.find(q => !q.dead && q !== ex && Math.abs(q.c - hero.c) + Math.abs(q.r - hero.r) === 1) || null;
  }
  const blockDmg = (c, r, k) => { const t = cell(c, r).t; return D.dig * k * (B.areaOf(r) === 0 && t !== 2 ? D.soil : 1); };
  function petHitBlock(c, r, dmg) { R.heavyHit = false; hitBlock(c, r, dmg); }
  function petTick(dt) {
    const P = D.pet; if (!P || !P.kind || !SK) return;
    R.petCd = (R.petCd || 0) + dt; if (hero.mv > 0) return;
    // v0.18 回复类「救急」：血量（花花）/ 体力（泡泡鱼）低于 30% 时不等冷却立刻放一次、回双倍，每趟 1 次
    let x2 = 1; if (P.rescue && !R.petRescued && ((P.kind === 'heal' && R.hp < R.hpMax * B.PET_RESCUE) || (P.kind === 'stam' && R.st < R.stMax * B.PET_RESCUE))) { R.petRescued = true; x2 = 2; }
    if (x2 === 1 && R.petCd < P.cd) return;
    const hx = hero.x, hy = hero.y - T * 0.5, face = x => { if (Math.abs(x - pet.x) > 2) pet.face = x > pet.x ? 1 : -1; };
    if (P.kind === 'dig') {   // 挖挖狗：刨开身边 1 格
      const tg = petBlockTarget(); if (!tg) return;
      const x = (tg.c + 0.5) * T; face(x); petAct(P.anim);
      const tgs = [tg]; if (P.n > 1) { const t2 = petBlockTarget(tg); if (t2) tgs.push(t2); }   // 挖挖狗专属「双爪」：同时刨第 2 格
      tgs.forEach((g, i) => petQ.push({ t: 0.22 + i * 0.12, fn: () => { if (!digOk(cell(g.c, g.r))) return; addFx('ppuff', (g.c + 0.5) * T, (g.r + 0.6) * T, T / 125); petHitBlock(g.c, g.r, blockDmg(g.c, g.r, P.k)); } }));
    } else if (P.kind === 'bomb') {   // 炸弹崽：往面前 1 格扔炸弹（相邻的怪优先，其次正在挖的方块）
      const m = petAdjMon(), tg = m ? { c: m.c, r: m.r } : petBlockTarget(); if (!tg) return;
      const x = (tg.c + 0.5) * T; face(x); petAct(P.anim); SFX.play('whoosh', 0.55);
      pbombs.push({ x0: pet.x + pet.face * T * 0.2, y0: pet.y + (pet.vo || 0) - T * 0.55, c: tg.c, r: tg.r, t: -0.12 });   // 出手动作 0.12 秒后离手
      if (P.n > 1) {   // 炸弹崽专属「连环炸」：第 2 颗炸另一个目标（另一只相邻的怪 → 另一格方块），没有就补炸同一格
        const m2 = petAdjMon(m), t2 = m2 ? { c: m2.c, r: m2.r } : (petBlockTarget(tg) || tg);
        pbombs.push({ x0: pet.x + pet.face * T * 0.2, y0: pet.y + (pet.vo || 0) - T * 0.55, c: t2.c, r: t2.r, t: -0.3 });
      }
    } else if (P.kind === 'fire') {   // 南瓜灯：身边一圈火光，1 格内（含斜角）的怪都挨一下
      const fr = 1 + (P.rng || 0), ms = R.mons.filter(q => !q.dead && Math.abs(q.c - hero.c) <= fr && Math.abs(q.r - hero.r) <= fr); if (!ms.length) return;   // 攻击类「范围扩大」：1 → 2 格
      face(hx); petAct(P.anim); SFX.play('pet_fire', 0.8);
      petQ.push({ t: 0.15, fn: () => { addFx('ring', pet.x, pet.y + (pet.vo || 0) - T * 0.4, T * (2.6 + 2 * (P.rng || 0)) / 128); R.flare = 1; shake = Math.max(shake, 0.08); for (const q of ms) if (!q.dead) { addFx('pfire', (q.c + 0.5) * T, (q.r + 0.45) * T, T * 1.5 / 256); hitMon(q, D.atk * P.mon); if (P.burn && !q.dead) { q.burnT = P.burn.t; q.burnI = 1; } } } });   // 南瓜灯专属「灼烧」：记在怪身上，updatePetFx 每秒结算   // 南瓜灯为中心的一圈光波 + 每只被烧到的怪身上一团火
    } else if (P.kind === 'heal') {   // 花花：回血（满血时等着）
      if (R.hp >= R.hpMax) return;
      face(hx); petAct(P.anim); SFX.play('pet_heal', 0.8);
      petQ.push({ t: 0.1, fn: () => { if (P.shield) R.petShield = P.shield; const h = Math.max(1, Math.round(R.hpMax * P.heal * x2)), v = Math.min(h, R.hpMax - R.hp); R.hp = Math.min(R.hpMax, R.hp + h); addFx('pheal', hero.x, hero.y - T * 1.0, T * 1.35 / 150); addNum(hero.x, hero.y - T * 0.9, '+' + B.fmt(Math.max(1, v)), '#7cf06a', true); } });
    } else if (P.kind === 'stam') {   // 泡泡鱼：吐泡泡回体力（体力满时等着）
      if (R.st >= R.stMax * 0.995) return;
      face(hx); petAct(P.anim); SFX.play('pet_bubble', 0.8);
      addFx('pbubble', pet.x + pet.face * T * 0.25, pet.y + (pet.vo || 0) - T * 0.7, T * 0.8 / 60);
      petQ.push({ t: 0.25, fn: () => { R.st = Math.min(R.stMax, R.st + R.stMax * P.stam * x2); if (P.float) R.floatT = P.float; addFx('pbubble', hero.x, hero.y - T * 0.85, T * 1.1 / 60); addNum(hero.x, hero.y - T * 0.9, '+' + +(P.stam * x2 * 100).toFixed(1) + '% 体力', '#ffe066', true); } });
    }
    R.petCd = 0;
  }
  function updatePetFx(dt) {   // 挖矿模式每帧（含结算框弹着时），生效只在 R.on 时
    if (pet.actT > 0) { pet.actT -= dt; if (pet.actT <= 0 && pet.anim !== 'Walk' && pet.anim !== 'Idle') { ST.setAnimation(0, 'Idle', true); pet.anim = 'Idle'; } }
    if (R.flare > 0) R.flare = Math.max(0, R.flare - dt / 0.8);
    for (let i = petQ.length - 1; i >= 0; i--) { const q = petQ[i]; q.t -= dt; if (q.t <= 0) { petQ.splice(i, 1); if (R.on) q.fn(); } }
    for (let i = pbombs.length - 1; i >= 0; i--) {
      const b = pbombs[i]; b.t += dt; if (b.t < B.PET_BOMB_FLY) continue; pbombs.splice(i, 1); if (!R.on) continue;
      const x = (b.c + 0.5) * T, y = (b.r + 0.5) * T, P = D.pet || {};
      addFx('pboom', x, y - T * 0.15, T * 2 / 160); SFX.play('pet_bomb', 0.75); shake = Math.max(shake, 0.16);
      const boom1 = (c, r) => { const m = monAt(c, r); if (m) hitMon(m, D.atk * (P.mon || 2)); else if (digOk(cell(c, r))) petHitBlock(c, r, blockDmg(c, r, P.blk || 4)); };
      boom1(b.c, b.r);
      if (P.rng) for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = b.c + dc, r = b.r + dr; if (c < 0 || c >= W || r < 0 || (c === hero.c && r === hero.r)) continue; boom1(c, r); addFx('pboom', (c + 0.5) * T, (r + 0.5) * T - T * 0.15, T * 1.2 / 160); }   // 攻击类「范围扩大」：炸十字 5 格（不炸主角那格）
    }
    if (R.on) for (const q of R.mons) if (q.burnT > 0 && !q.dead) {   // 南瓜灯专属「灼烧」：每秒受 攻击 ×0.3
      q.burnT -= dt; q.burnI -= dt; if (q.burnI <= 0) { q.burnI += 1; addFx('pfire', (q.c + 0.5) * T, (q.r + 0.45) * T, T * 0.9 / 256); hitMon(q, D.atk * B.PET_BURN.k); }
    }
  }
  function drawPetBombs(ox, cy) {
    const im = A.img.bomb; if (!pbombs.length || !im || !im.width) return; const z = T * 0.5;
    for (const b of pbombs) {
      if (b.t < 0) continue; const u = b.t / B.PET_BOMB_FLY, tx = (b.c + 0.5) * T, ty = (b.r + 0.5) * T;
      const x = b.x0 + (tx - b.x0) * u, y = b.y0 + (ty - b.y0) * u - T * 1.1 * 4 * u * (1 - u);
      ctx.save(); ctx.translate(Math.round(ox + x), Math.round(y - cy)); ctx.rotate(u * 7); ctx.drawImage(im, -z / 2, -z / 2, z, z); ctx.restore();
    }
  }
  function clearPetFx() { petQ.length = 0; pbombs.length = 0; pet.actT = 0; }

  /* ---------- 绘制 ---------- */
  const MATIMG = {};
  function matImg(k) { if (MATIMG[k]) return MATIMG[k]; const im = new Image(); im.src = 'assets/' + (k.startsWith('m_') ? B.MAT[k.slice(2)].img : k.startsWith('f_') ? B.FOOD[k.slice(2)].img : k); return MATIMG[k] = im; }
  function draw() {
    if (ctx.__begin) ctx.__begin();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.fillStyle = '#0d0716'; ctx.fillRect(0, 0, VW, VH);
    if (!R || !A.ready) { if (ctx.__end) ctx.__end(); return; }
    const sx = shake > 0 ? Math.round((Math.random() - 0.5) * shake * T * 0.5) : 0, sy = shake > 0 ? Math.round((Math.random() - 0.5) * shake * T * 0.5) : 0;
    const cy = Math.round(camY) + sy, ox = OX + sx;
    TERRAIN.update(cy, VH);
    TERRAIN.drawBG(ctx, cy, VW, VH);
    TW.drawBack(ctx, cy, VW, VH); TW.drawFx(ctx, cy, T, time); drawDoors(cy, ox); TW.drawOver(ctx, cy, VW, VH);
    TERRAIN.draw(ctx, cy, ox, VH);
    TERRAIN.drawProps(ctx, cy, ox, VH, time);
    const r0 = Math.max(0, Math.floor(cy / T)), r1 = Math.floor((cy + VH) / T);
    // 嵌在土里的东西：树根、矿、食物（随挖掘缩小）；蜘蛛网、宝箱
    for (let r = r0; r <= r1; r++) {
      const row = R.rows.get(r); if (!row) continue;
      for (let c = 0; c < W; c++) {
        const k = row[c], x = ox + (c + 0.5) * T, y = (r + 0.5) * T - cy;
        if (k.t === 3 && c === 3) { const lw = T * 0.46, lh = lw * A.img.lock.height / A.img.lock.width; ctx.drawImage(A.img.lock, Math.round(x - lw / 2), Math.round(y - lh / 2), Math.round(lw), Math.round(lh)); }
        let im = null, z = 0.62, rot = 0;
        if (k.t === 4) { im = matImg(c % 2 ? 'mat/branch.png' : 'mat/branch_dead.png'); z = 0.78; rot = ((c * 7 + r * 3) % 5 - 2) * 0.35; }
        else if (k.t === 5) { im = matImg('mat/copper.png'); z = 0.58; rot = ((c + r) % 3 - 1) * 0.3; }
        else if (k.t === 6 && k.food) { im = matImg(B.FOOD[k.food].img); z = 0.56; }
        if (im && im.width) { const hh = ((c * 73856093) ^ (r * 19349663)) >>> 0, jx = ((hh % 7) - 3) * T * 0.06, jy = (((hh >> 3) % 7) - 3) * T * 0.05, js = 0.85 + ((hh >> 6) % 5) * 0.07; rot += (((hh >> 9) % 9) - 4) * 0.12; if (k.t === 4 && (hh >> 12) % 2) rot += Math.PI * 0.5; const q = 0.55 + 0.45 * Math.max(0, k.hp / k.max), s = T * z * q * js; ctx.save(); ctx.translate(Math.round(x + jx), Math.round(y + jy)); ctx.rotate(rot); ctx.globalAlpha = k.t === 4 ? 0.92 : 1; ctx.drawImage(im, -s / 2, -s / 2, s, s); ctx.restore(); ctx.globalAlpha = 1; }
        if (k.web) { const w = matImg('mat/spider_web.png'); if (w.width) { const s = T * 0.82, left = c === 0 || cell(c - 1, r).t !== 0; ctx.save(); ctx.translate(Math.round(x + (left ? -1 : 1) * T * 0.1), Math.round(y - T * 0.08)); if (!left) ctx.scale(-1, 1); ctx.globalAlpha = 0.88; ctx.drawImage(w, -s / 2, -s / 2, s, s); ctx.restore(); ctx.globalAlpha = 1; } }
        if (k.dchest || k.dopen) {   // v0.18 暗格宝箱：只在头灯半径内显形；第一次照到冒星星；打开后开盖图淡出
          const ch = k.dchest ? A.img.dchest : A.img.dchestOpen, vis = k.dchest ? darkVis(c, r) : Math.max(0, 1 - (time - k.dopen) / 0.9);
          if (k.dchest && vis > 0 && !k.dseen) { k.dseen = 1; addFx('star', x - ox, y + cy, T / 110); }
          if (!k.dchest && vis <= 0) k.dopen = 0;
          if (ch && ch.width && vis > 0) { const s = T * 0.62, hh = s * ch.height / ch.width, bob = k.dchest ? Math.sin(time * 3 + c) * T * 0.02 : -T * 0.1 * (1 - vis); ctx.globalAlpha = vis; ctx.drawImage(ch, Math.round(x - s / 2), Math.round(y + T * 0.48 - hh + bob), Math.round(s), Math.round(hh)); ctx.globalAlpha = 1; }
        }
        if (k.chest) { const ch = A.img.chest; if (ch && ch.width) { const s = T * 0.66, bob = Math.sin(time * 3 + c) * T * 0.02; ctx.drawImage(ch, Math.round(x - s / 2), Math.round(y + T * 0.5 - s + bob), s, s); } }
      }
    }
    MOBS.drawUnder(ctx, ox, cy); const mdt = Math.min(0.05, time - (drawT0 || time)); drawT0 = time;
    for (const m of R.mons) {
      m.barY = undefined;   // 血条的屏幕位置每帧重算；出屏不画（原来出屏后停在旧位置）
      const y0 = (m.r + 1) * T; if (y0 - cy < -T * 3 || y0 - cy > VH + T * 3) continue;
      const P = MOBS.pose(m, mdt), x = ox + P.x, y = P.y - cy, sc = (m.boss ? 1.6 : m.fly ? 0.7 : 0.86) * T / 190;
      const a = m.dead ? Math.max(0, 1 - m.dead / 0.7) : 1;
      if (P.warn && !m.dead) ctx.filter = WARN_FILTER; else if (m.flash > 0) ctx.filter = 'brightness(2.2)';   // 前摇闪黄光优先于受击白闪（原来主角一直在打它，白闪盖掉了前摇提示）
      ctx.save(); ctx.translate(Math.round(x), Math.round(y - T * 0.02 - P.ph)); if (P.rot) ctx.rotate(P.rot * Math.PI / 180); if (P.ph) ctx.translate(0, P.ph); if (P.sx !== 1 || P.sy !== 1) ctx.scale(P.sx, P.sy);
      m.m.draw(ctx, 0, 0, { scale: sc, flipX: m.face > 0, alpha: a, shadow: !m.fly || m.dead > 0 });
      ctx.restore();
      if (m.flash > 0 || P.warn) ctx.filter = 'none';
      m.barY = y - (m.fly ? T * 0.1 : 0); m.barX = x;   // 血条位置另用 barX / barY：原来写进 m.sy，和 mobs.js 的竖向缩放 m.sy 撞名，R.on=false 时不再重置 → 史莱姆被拉成整屏竖条
    }
    if (trans && (trans.k === 'dive' || trans.k === 'rise')) TW.drawFront(ctx, cy, VW, VH);
    if (SK && petCv) {
      const PZ = petCv.width; petG.setTransform(1, 0, 0, 1, 0, 0); petG.clearRect(0, 0, PZ, PZ);
      const sc = T * 0.62 / 100; petG.setTransform(sc * pet.face, 0, 0, -sc, PZ / 2, PZ * 0.8); SR.draw(SK);
      let pvo = mode === 'run' ? (pet.vo || 0) : 0, pa = hero.alpha;
      if (mode === 'shore' && !(trans && (trans.k === 'dive' || trans.k === 'rise'))) { const u = (pet.x / T - (TL.hole.x0 - 0.15)) / (TL.hole.x1 - TL.hole.x0 + 0.3); if (u > 0 && u < 1) pvo = -Math.sin(u * Math.PI) * T * 0.5; }   // 宠物过洞口也小跳，不悬在洞上
      if (mode === 'shore' && (hero.lvl || hero.climb)) pa = 1;   // 人进平台上的屋子时，在梯子脚下等的宠物不跟着消失
      ctx.globalAlpha = pa; ctx.drawImage(petCv, Math.round(ox + pet.x - PZ / 2), Math.round(pet.y + pvo - cy - PZ * 0.8 + T * 0.02)); ctx.globalAlpha = 1;
    }
    if (HERO && hero.alpha > 0.01) {
      if (hero.hurtT > 0) ctx.filter = 'brightness(1.8)';
      const vo = mode === 'run' ? (hero.vo || 0) - (hero.hopT > 0 ? Math.sin((1 - hero.hopT / B.HOP.t) * Math.PI) * B.HOP.h * T : 0) : (hero.hop || 0);
      HERO.draw(ctx, ox + hero.x, hero.y + vo - cy + T * 0.01, { scale: T / 118, flipX: hero.face < 0, alpha: hero.alpha });
      if (hero.hurtT > 0) ctx.filter = 'none';
    }
    if (mode === 'run' && R.boom && R.boom.fly.length && A.img.pick.width) {   // v0.18 回旋镐：镐图旋转飞行 + 残影拖尾
      const im = A.img.pick, s = T * 0.78, hh = s * im.height / im.width;
      for (const f of R.boom.fly) {
        for (let j = f.trail.length - 1; j >= 1; j -= 1) { const q = f.trail[j]; ctx.globalAlpha = 0.34 * (1 - j / f.trail.length); ctx.save(); ctx.translate(Math.round(ox + q.x), Math.round(q.y - cy)); ctx.rotate(q.rot); ctx.drawImage(im, -s / 2, -hh / 2, s, hh); ctx.restore(); }
        ctx.globalAlpha = 1; ctx.save(); ctx.translate(Math.round(ox + f.x), Math.round(f.y - cy)); ctx.rotate(f.rot); ctx.drawImage(im, -s / 2, -hh / 2, s, hh); ctx.restore();
      }
    }
    if (!(trans && (trans.k === 'dive' || trans.k === 'rise'))) TW.drawFront(ctx, cy, VW, VH);
    for (const b of bits) { const z = b.im.width * b.s, a = b.t > 0.5 ? Math.max(0, 1 - (b.t - 0.5) / 0.25) : 1; ctx.globalAlpha = a; ctx.save(); ctx.translate(Math.round(ox + b.x), Math.round(b.y - cy)); ctx.rotate(b.rot); ctx.drawImage(b.im, -z / 2, -z / 2, z, z); ctx.restore(); }
    ctx.globalAlpha = 1; MOBS.drawOver(ctx, ox, cy);
    for (const f of fx) {
      const v = A.VFX[f.k], i = Math.min(v[0] - 1, Math.floor(f.t * v[3])), w = v[1] * f.sc, h = v[2] * f.sc;
      if (f.rot || f.flip || f.add || f.sx) { ctx.save(); if (f.add) ctx.globalCompositeOperation = 'lighter'; ctx.translate(Math.round(ox + f.x), Math.round(f.y - cy)); if (f.rot) ctx.rotate(f.rot); if (f.flip || f.sx) ctx.scale((f.flip ? -1 : 1) * (f.sx || 1), 1); ctx.drawImage(A.img[f.k], i * v[1], 0, v[1], v[2], -w / 2, -h / 2, w, h); ctx.restore(); }
      else ctx.drawImage(A.img[f.k], i * v[1], 0, v[1], v[2], Math.round(ox + f.x - w / 2), Math.round(f.y - cy - h / 2), w, h);
    }
    const K = 80 / T, lights = TERRAIN.propLights(time);
    lights.push({ x: hero.x * K, y: (hero.y + (hero.vo || 0)) * K - 40, r: (mode === 'run' ? D.lampR : B.MECH.lamp.base) * 80 * (D.pet && D.pet.light && SK ? D.pet.light * (1 + 0.6 * (R.flare || 0)) : 1), k: 0.75, c: [1.0, 0.9, 0.74] });   // v0.18 光源节点：头灯半径（格 × 80 世界像素）；南瓜灯：照亮范围 +50%
    drawBolts(ox, cy); drawPetBombs(ox, cy);
    TERRAIN.drawLight(ctx, cy, ox, VW, VH, lights, time);
    if (mode === 'run' && D.dark && A.img.sparkle.width) {   // 暗格宝箱的闪光（叠加，画在光照之后才亮）
      const v = A.VFX.sparkle, fr = Math.floor(time * v[3]) % v[0];
      ctx.globalCompositeOperation = 'lighter';
      for (let r = r0; r <= r1; r++) { const row = R.rows.get(r); if (!row) continue; for (let c = 0; c < W; c++) { if (!row[c].dchest) continue; const a = darkVis(c, r); if (a <= 0) continue; const s = T * 0.95; ctx.globalAlpha = a * 0.9; ctx.drawImage(A.img.sparkle, fr * v[1], 0, v[1], v[2], Math.round(ox + (c + 0.5) * T - s / 2), Math.round((r + 0.5) * T - cy - s / 2), Math.round(s), Math.round(s)); } }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    for (const m of R.mons) {
      if (m.dead || m.hp >= m.max || m.boss || m.barY === undefined) continue;
      const x = m.barX, y = m.barY, w = T * 0.7, h = Math.max(3, T * 0.07), bx = Math.round(x - w / 2), by = Math.round(y - T * 0.98);
      ctx.fillStyle = 'rgba(20,10,30,0.8)'; ctx.fillRect(bx - 1, by - 1, w + 2, h + 2); ctx.fillStyle = '#ff5a4d'; ctx.fillRect(bx, by, Math.round(w * Math.max(0, m.hp / m.max)), h);
    }
    // 自动模式停下时：三个方向的箭头闪烁
    if (mode === 'run' && S.auto && !R.auto && R.on && A.img.arrow) {
      const a = 0.7 + 0.3 * Math.sin(time * 8), s = T * 0.5, hx = ox + hero.x, hy = hero.y - cy - T * 0.5;
      ctx.globalAlpha = a;
      for (const [ddx, ddy, rot] of [[-1, 0, Math.PI], [1, 0, 0], [0, 1, Math.PI / 2]]) { if (cell(hero.c + ddx, hero.r + ddy).t === 9) continue; ctx.save(); ctx.translate(hx + ddx * T * 0.78, hy + ddy * T * 0.78); ctx.rotate(rot + Math.PI); ctx.drawImage(A.img.arrow, -s / 2, -s / 2, s, s); ctx.restore(); }
      ctx.globalAlpha = 1;
    }
    for (const p of drops) { if (p.t < 0) continue; const z = T * (p.kind.length > 3 ? 0.46 : 0.34), im = A.img[p.kind] || matImg(p.kind); if (im && im.width) ctx.drawImage(im, Math.round(ox + p.x - z / 2), Math.round(p.y - cy - z / 2), z, z); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const n of nums) {
      const fs = Math.round(T * (n.big ? 0.4 : 0.3)); ctx.font = `700 ${fs}px UINum, sans-serif`; ctx.globalAlpha = n.t > 0.6 ? Math.max(0, 1 - (n.t - 0.6) / 0.3) : 1;
      const x = Math.round(ox + n.x), y = Math.round(n.y - cy - T * 0.9 * Math.min(1, n.t * 1.6));
      ctx.lineWidth = Math.max(3, fs * 0.22); ctx.strokeStyle = '#2a1436'; ctx.strokeText(n.text, x, y); ctx.fillStyle = n.col; ctx.fillText(n.text, x, y);
    }
    ctx.globalAlpha = 1;
    // 回地面：速度线 + 白闪（遮住中段的跳切）
    if (trans && trans.k === 'rise') {
      const t = trans.t, k = t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.3) / 0.3);
      if (k > 0) {
        ctx.globalAlpha = k * 0.42; ctx.fillStyle = '#fff6e0'; ctx.fillRect(0, 0, VW, VH);
        for (let i = 0; i < 22; i++) {
          const side = i % 2 ? 1 : -1, u = ((i * 37) % 11) / 11, x = VW / 2 + side * VW * (0.26 + u * 0.24), h = VH * (0.08 + ((i * 53) % 7) / 50), y = ((i * 97 + time * 3200) % (VH + h)) - h, w = Math.max(1.5, T * 0.018 * (1 + i % 2));
          const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalAlpha = k * (0.5 + u * 0.4); ctx.fillStyle = g; ctx.fillRect(Math.round(x), Math.round(y), w, h);
        }
        ctx.globalAlpha = 1;
      }
    }
    if (ctx.__end) ctx.__end();
  }
  const DARK = new Map();
  function doorDark(im) {   // 门图的剪影：形状和门一样，填成屋里的暗色，边缘保留一点原图描边
    let c = DARK.get(im); if (c) return c;
    c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d');
    g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(28,18,12,0.94)'; g.fillRect(0, 0, c.width, c.height);
    DARK.set(im, c); return c;
  }
  function drawDoors(cy, ox) {   // 门：开合 = 门板绕左边铰链横向收窄，露出里面的黑
    const T0 = T, I = TW.img;
    for (const [k, im, x, y, w, h] of [['smithy', I.t_Wide_Door_02, TL.smithy.door - 0.65, 0, 1.3, 1.3], ['house', I.t_Door_04, TL.house.door - 0.31, TL.house.y - 0.04, 0.62, 1.24]]) {
      if (!im || !im.width) continue;
      const X = ox + x * T0, Y = (y - h) * T0 - cy, Wd = w * T0, Hd = h * T0, o = door.k === k ? door.open : 0;
      if (o > 0) { const d = doorDark(im); ctx.drawImage(d, Math.round(X), Math.round(Y), Math.round(Wd), Math.round(Hd)); }   // 门里的黑按门的原形（拱门就是拱形），不画直角矩形
      ctx.drawImage(im, Math.round(X), Math.round(Y), Math.round(Wd * (1 - 0.82 * o)), Math.round(Hd));
    }
  }

  /* ---------- 广告（测试版占位）、VIP、签到、离线（v0.18 按系统与数值 16 节） ---------- */
  function adDay() { if (!S.ad || S.ad.day !== today()) S.ad = { day: today(), n: 0, used: {} }; return S.ad; }   // 本地日期跨天，所有广告位次数重置
  // 每个广告位今天还剩几次；'vip' = VIP 页的广告（B.VIP_DAY = 0 时不限）
  G.adLeft = slot => { const a = adDay(), used = a.used[slot] || 0; if (slot === 'vip') return B.VIP_DAY > 0 ? Math.max(0, B.VIP_DAY - used) : Infinity; return Math.max(0, (B.ADCAP[slot] || 0) - used); };
  // 占位接口：cb 只在看完后调；只有 'vip' 广告位加 VIP 进度（独立计数）；播放期间游戏暂停（过渡、体力、怪都停住，和正式广告 SDK 一样）
  G.watchAd = (slot, cb) => { if (!G.adLeft(slot)) { G.refresh(); return; } G.paused = true; G.ui.ad(() => { G.paused = false; const a = adDay(); a.n++; a.used[slot] = (a.used[slot] || 0) + 1; S.ads = (S.ads || 0) + 1; if (slot === 'vip') S.vipAds = (S.vipAds || 0) + 1; G.save(); cb && cb(); G.refresh(); }); };
  G.vipReady = () => { const v = B.VIP[S.vip]; return v && S.vipAds >= v.ads ? 1 : 0; };
  // 拥有某个 VIP 奖励：key = auto / loop / staff / skin（+ 套装 id）/ pet（+ 宠物名）
  G.vipOwn = (key, id) => B.VIP.some((v, i) => i < S.vip && v[key] && (id === undefined || v[key] === id));
  G.looping = () => !!(S.loop && S.auto && G.vipOwn('loop') && G.vipOwn('auto'));
  G.claimVip = () => {   // 领下一级 VIP 奖励（按顺序领）
    const v = B.VIP[S.vip]; if (!v || S.vipAds < v.ads) return null; S.vip++;
    if (v.pet && !S.pets.includes(v.pet)) { S.pets.push(v.pet); }
    if (v.pet) { S.pet = v.pet; setPetActor(); }   // 新宠物领到就跟着（宠物页可以换）
    if (v.auto) S.auto = true;
    if (v.loop) S.loop = true;
    if (v.staff) S.staff = true;   // 领到就拿在手上（VIP 页可以收起）
    if (v.skin) S.skin = v.skin;   // 领到就穿上（VIP 页可以脱下）
    G.refresh(); return v;
  };
  G.setStaff = on => { if (!G.vipOwn('staff')) return; S.staff = !!on; G.refresh(); };
  G.setSkin = id => { if (id && !G.vipOwn('skin', id)) return; S.skin = id || null; G.refresh(); };
  G.signReady = () => S.sign.n < B.SIGN.length && S.sign.last !== today();
  G.claimSign = () => {
    if (!G.signReady()) return null; const s = B.SIGN[S.sign.n]; S.sign.n++; S.sign.last = today();
    if (s.coin) S.coin += s.coin; if (s.gem) S.gem += s.gem; if (s.boost) S.boost += s.boost;
    if (s.mat) for (const k in s.mat) { S.mat[k] = (S.mat[k] || 0) + s.mat[k]; S.seen[k] = 1; }
    if (s.pet && !S.pets.includes(s.pet)) { S.pets.push(s.pet); if (!S.pet) { S.pet = s.pet; setPetActor(); } }
    if (s.gear) { const slot = B.SLOTS.find(k => (S.gear[k] || 0) < 3) || 'weapon'; S.gear[slot] = 3; s.gotSlot = slot; }
    G.refresh(); return s;
  };
  G.chestLeftMs = () => Math.max(0, B.AD_CHEST_H * 3600e3 - (Date.now() - (S.chestT || 0)));
  G.chestReady = () => G.chestLeftMs() <= 0 && G.adLeft('chest') > 0;
  G.openAdChest = () => G.chestReady() && G.watchAd('chest', () => { const r = S.lastRun; S.coin += Math.max(60, r.coin); S.gem += Math.max(3, r.gem); S.chestT = Date.now(); G.ui.claimFx([{ k: 'coin', n: Math.max(60, r.coin) }, { k: 'gem', n: Math.max(3, r.gem) }], '广告宝箱'); });
  G.offline = () => {
    if (!S.pets.length || !S.lastRun || !S.lastRun.coin) return null;   // 有宠物才有（系统与数值 12 节）
    const h = Math.min(B.OFFLINE_H, (Date.now() - S.last) / 3600e3); if (h < 0.1) return null;
    return { pet: S.pet || S.pets[0], h, coin: Math.floor(S.lastRun.coin * h), gem: Math.floor(S.lastRun.gem * h) };
  };

  // 缺料补给：有配方（还没买的装备）正好差 1 个这种材料时，看广告补 1 个（每天 2 次）
  G.supplyOk = k => G.adLeft('supply') > 0 && B.SLOTS.some(sl => B.GEAR[sl].some((g, t) => !g.next && (S.gear[sl] || 0) < t && g.mat && g.mat[k] && g.mat[k] - (S.mat[k] || 0) === 1));
  G.supply = (k, cb) => { if (!G.supplyOk(k)) return; G.watchAd('supply', () => { S.mat[k] = (S.mat[k] || 0) + 1; S.seen[k] = 1; G.save(); cb && cb(); }); };

  /* ---------- 买东西 ---------- */
  G.canGear = (slot, t) => { const g = B.GEAR[slot][t]; if (!g || g.next || (S.gear[slot] || 0) >= t) return false; if (S.coin < g.coin) return false; for (const k in g.mat || {}) if ((S.mat[k] || 0) < g.mat[k]) return false; return true; };
  G.buyGear = (slot, t) => {
    if (!G.canGear(slot, t)) return false; const g = B.GEAR[slot][t]; S.coin -= g.coin; for (const k in g.mat || {}) S.mat[k] -= g.mat[k];
    S.gear[slot] = t; SFX.play('buy', 0.9); setTimeout(() => SFX.play('equip', 0.9), 260); G.refresh(); return true;
  };
  G.skLv = id => S.skill[id] || 0;
  G.skCost = id => { const n = B.SKI[id]; return { cur: n.cur, n: B.skCost(n, G.skLv(id)), gem: n.gem || 0, mat: n.mat || null }; };   // v0.18：机制节点还要材料（n.mat）
  const matOk = m => { for (const k in m || {}) if ((S.mat[k] || 0) < m[k]) return false; return true; };
  G.canSkill = id => { const n = B.SKI[id], l = G.skLv(id); if (l >= n.max || !B.skOpen(S, n)) return false; const c = G.skCost(id); return S[c.cur] >= c.n && S.gem >= (c.cur === 'gem' ? c.n : c.gem) && matOk(c.mat); };
  G.buySkill = id => { if (!G.canSkill(id)) return false; const c = G.skCost(id); S[c.cur] -= c.n; if (c.gem) S.gem -= c.gem; for (const k in c.mat || {}) S.mat[k] -= c.mat[k]; S.skill[id] = G.skLv(id) + 1; SFX.play('buy', 0.8); G.refresh(); return true; };

  /* ---------- 主循环 ---------- */
  let lastT = 0, frozen = false;
  function frame(t) {
    requestAnimationFrame(frame); resize();
    let dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
    if (G.paused || frozen) dt = 0;
    if (G.speed) { for (let i = 0; i < G.speed; i++) update(dt); } else update(dt);
    draw(); if (G.ui) G.ui.hud(R, mode, hero, D, dt);
  }
  G.step = (sec) => { for (let t = 0; t < sec; t += 1 / 60) update(1 / 60); };
  G.freeze = v => { frozen = v; };
  G.autoBot = () => {   // 测试机器人：走 S 形，遇怪就打；旁边一格有食物 / 蜘蛛网顺手拿
    const h = hero, b = cell(h.c, h.r + 1).t;
    if (MOBS.danger()) return [0, -1];   // v0.18：冲撞 / 冲击波马上到 → 小跳
    for (const d of [-1, 1]) { const k = cell(h.c + d, h.r); if ((k.t === 6 && k.food) || k.web || k.chest) return [d, 0]; }
    const adj = R.mons.find(m => !m.dead && Math.abs(m.c - h.c) + Math.abs(m.r - h.r) === 1); if (adj) return [adj.c - h.c, adj.r - h.r];
    const near = R.mons.find(m => !m.dead && !m.boss && m.r === h.r && Math.abs(m.c - h.c) <= 4); if (near) return [Math.sign(near.c - h.c), 0];
    if (h.r >= B.AREA - 3 && R.mons.some(m => m.boss && !m.dead)) { const bm = R.mons.find(m => m.boss && !m.dead); if (bm.r === h.r + 1 && Math.abs(bm.c - h.c) > 0) return [Math.sign(bm.c - h.c), 0]; }
    for (const d of [-1, 1]) { const k = cell(h.c + d, h.r + 1); if (k.web) return [d, 0]; }
    if (b === 3) return h.c === 3 ? [0, 0] : [h.c > 3 ? -1 : 1, 0];
    if (b === 2 && !G.botStraight) { for (let d = 1; d < 7; d++) for (const sg of [-1, 1]) { const c = h.c + sg * d; if (c >= 0 && c < W && cell(c, h.r + 1).t !== 2 && cell(c, h.r).t !== 2) return [sg, 0]; } }
    return [0, 1];
  };
  G.state = () => ({ mode, R, hero, D, T, camY, trans, VH, VW, bolts, pet, pbombs, petQ });
  // 测试用：跳过过渡直接开始 / 结算（数值机器人用）
  G._quickStart = () => { D = B.derive(S); newRun(); trans = null; mode = 'run'; hero.c = 3; hero.r = 0; place(); R.on = true; S.runs++; G.ui.showRun(); };
  G._quickCollect = () => { const k = R.over === 'dead' ? D.keep : 1; S.coin += Math.floor(R.coin * k); S.gem += Math.floor(R.gem * k); for (const id in R.mat) { const n = Math.floor(R.mat[id] * k) || (R.mat[id] ? 1 : 0); S.mat[id] = (S.mat[id] || 0) + n; S.seen[id] = 1; } S.best = Math.max(S.best, R.deep); const out = { deep: R.deep, t: R.t, coin: R.coin, gem: R.gem, mat: Object.assign({}, R.mat), over: R.over, kills: R.kills }; $('pop').classList.remove('on'); toShore(false); return out; };
  G._testSpawn = (c, r, kind) => spawn(c, r, kind, false);   // 测试用：放一只怪（截图定位）
  G.townCam = townCam;
  G.portrait = (c, kind) => { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); const m = MLIB.create(kind); m.play('Idle'); m.update(0.3); m.draw(g, c.width / 2, c.height * 0.86, { scale: c.width / (B.MON[kind].boss ? 330 : 260), flipX: true }); };
  G.petPortrait = async (c, name) => { const p = await loadPet(name); const sk = new spine.Skeleton(p.data); (sk.setupPose ? sk.setupPose() : sk.setToSetupPose()); sk.updateWorldTransform(spine.Physics ? spine.Physics.update : undefined);
    const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); const k = c.width / 150; g.setTransform(k, 0, 0, -k, c.width / 2, c.height * 0.82); const r = new spine.SkeletonRenderer(g); r.triangleRendering = true; r.draw(sk); g.setTransform(1, 0, 0, 1, 0, 0); };
  G.heroScreen = () => ({ x: (OX + hero.x) / dpr, y: (hero.y - camY - T * 1.2) / dpr });

  async function boot() {
    const off = G.offline(); resize(); SFX.create();
    ctx = (window.PIXICTX && location.protocol !== 'file:' && Q.get('gl') !== '0') ? window.PIXICTX.create(cv) : cv.getContext('2d');
    TERRAIN.init({ cell: (c, r) => cell(c, r), stageOf: r => B.stageOf(r) });
    await Promise.all([A.load(), TERRAIN.load(), TW.load()]); A.bake(T); TERRAIN.ready = true; TERRAIN.resize(T, OX, VW); TW.bake(T, VW, VH - T * 1.9);
    HERO = Hero.create(window.HERO_DATA, 'assets/hero/', lookField(true), { Hair: [0.55, 0.33, 0.2] }); await HERO.ready();
    DOLL = Hero.create(window.HERO_DATA, 'assets/hero/', lookOf(S.gear, true), { Hair: [0.55, 0.33, 0.2] }); await DOLL.ready(); DOLL.play('Idle');
    // v0.18 修（守卫受击姿势歪）：LayerLab 甲虫类的 Hit 片段里有 4 条只有一个关键帧的常量轨道（Body_bone / Head_bone 转 9.5°、头挪位），
    // 受击期间整只歪着、头缩进壳里；而攻击间隔 < 片段长 0.58 秒，打守卫时一直处在 Hit 里，看起来一直是歪的。
    // 其他 6 类怪的 Hit 都只有后退 + 压扁 + 闪白、结束回原位。这里统一去掉 Hit 里“单关键帧的位置 / 旋转 / 缩放轨道”，只留闪白和弹性动作。
    for (const c of Object.values(window.ENEMY_MONSTER_DATA.categories)) { const h = c.anims.Hit; if (h) h.tracks = h.tracks.filter(t => t.k === 'on' || t.k === 'spr' || t.c.length > 1); }
    MLIB = await EnemyMonsters.load(window.ENEMY_MONSTER_DATA, 'assets/monsters/');
    petCv = document.createElement('canvas'); petCv.width = petCv.height = Math.ceil(T * 1.6); petG = petCv.getContext('2d'); SR = new spine.SkeletonRenderer(petG); SR.triangleRendering = true;
    try { await document.fonts.load('700 20px UINum'); } catch (e) { }
    G.ui.init(); toShore(false); await setPetActor(); $('loading').style.display = 'none';
    if (off) G.ui.offline(off);
    requestAnimationFrame(frame);
  }
  window.addEventListener('load', boot);
  document.addEventListener('visibilitychange', () => { if (document.hidden) G.save(); });
})();
