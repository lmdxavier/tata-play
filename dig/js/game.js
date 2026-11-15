/* dig hero 主逻辑：存档、一趟挖掘、输入、渲染。数值全部来自 balance.js（BAL）。界面在 ui.js。 */
(function () {
  'use strict';
  const B = window.BAL, A = window.ART, $ = id => document.getElementById(id);
  const G = window.G = {};
  const Q = new URLSearchParams(location.search);
  const SAVE_KEY = 'dighero_v1';
  const W = B.W;

  /* ---------- 存档 ---------- */
  const fresh = () => ({ coin: 0, gem: 0, gear: {}, skill: {}, codex: {}, ads: 0, vip: 0, pets: [], pet: null, boss: 0, best: 0, runs: 0, last: Date.now(), lastRun: { coin: 0, gem: 0 }, chest: 0, tip: 0 });
  let S = fresh();
  try { const t = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (t && typeof t === 'object') S = Object.assign(fresh(), t); } catch (e) { }
  if (Q.get('reset') === '1') S = fresh();
  G.S = S;
  G.save = () => { S.last = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { } };
  G.reset = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } location.href = location.pathname; };
  let D = B.derive(S);
  G.D = () => D;
  G.refresh = () => { D = B.derive(S); heroLook(); G.save(); if (G.ui) G.ui.refresh(); };

  /* ---------- 音效 ---------- */
  const SFX = (() => {
    let ac = null; const buf = {}, last = {};
    const data = () => Object.assign({}, window.SFX_DATA || {}, window.SFX_COMBAT_DATA || {}, window.SFX_EXTRA_DATA || {});
    function init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      const d = data();
      for (const k in d) { buf[k] = []; d[k].files.forEach((b64, i) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let j = 0; j < bin.length; j++) u[j] = bin.charCodeAt(j); ac.decodeAudioData(u.buffer, b => { buf[k][i] = b; }, () => { }); }); }
    }
    function play(k, vol, rate) {
      if (!ac || !buf[k] || G.mute) return; const now = ac.currentTime; if (last[k] && now - last[k] < 0.045) return; last[k] = now;
      const list = buf[k].filter(Boolean); if (!list.length) return;
      const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = list[Math.floor(Math.random() * list.length)];
      s.playbackRate.value = (rate || 1) * (0.94 + Math.random() * 0.12); g.gain.value = (vol === undefined ? 1 : vol) * ((data()[k] || {}).vol || 1) * 0.8;
      s.connect(g); g.connect(ac.destination); s.start();
    }
    return { init, play };
  })();
  G.sfx = SFX;

  /* ---------- 画布 ---------- */
  const wrap = $('wrap'), cv = $('cv');
  let ctx = null, T = 48, OX = 0, VW = 0, VH = 0, dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(wrap.clientWidth * dpr), h = Math.round(wrap.clientHeight * dpr);
    if (w === VW && h === VH) return;
    VW = w; VH = h; cv.width = w; cv.height = h; T = Math.floor(w / W); OX = (w - T * W) >> 1;
    document.documentElement.style.fontSize = (wrap.clientWidth / 24) + 'px';
    if (A.img.sky) A.bake(T);
    if (TERRAIN.ready) TERRAIN.resize(T, OX, w);
  }

  /* ---------- 角色 ---------- */
  let HERO = null, MLIB = null, SK = null, ST = null, SR = null, petCv = null, petG = null, PETS = {}, petName = null;
  const CHEST = [10, 13, 20, 36, 32, 7, 35, 49, 40, 45, 50, 55], HELM = [-1, 16, 3, 57, 74, 10, 20, 30, 40, 50, 60, 70];
  let lookKey = '';
  function heroLook(fight) {
    if (!HERO) return;
    const g = S.gear, eq = { Eye: 1, Hair: 1, Chest: CHEST[Math.min(11, g.armor || 0)] };
    const h = HELM[Math.min(11, g.helmet || 0)]; if (h >= 0) eq.Helmet = h;
    if (g.shield) eq.Shield = (g.shield * 3) % 17;
    if (fight) eq.Sword = ((g.weapon || 0) * 5 + 1) % 32; else eq.Pickaxe = Math.min(2, Math.ceil((g.pick || 0) / 2));
    const key = JSON.stringify(eq); if (key === lookKey) return; lookKey = key;
    HERO.setLook(eq, { Hair: [0.55, 0.33, 0.2] }); HERO.ready();
  }
  const MON_KINDS = ['Slime_Green', 'Snail_Green', 'Beetle_Red', 'Snake_Green', 'Goat_Angry', 'Animal_Fox', 'Bear_Grizzly'];
  G.MON_KINDS = MON_KINDS;
  G.MON_NAME = { Slime_Green: '绿史莱姆', Snail_Green: '绿蜗牛', Beetle_Red: '红甲虫', Snake_Green: '青蛇', Goat_Angry: '怒山羊', Animal_Fox: '狐狸', Bear_Grizzly: '灰熊' };
  G.stageKinds = s => [MON_KINDS[s % 7], MON_KINDS[(s + 1) % 7], MON_KINDS[(s + 4) % 7]];   // [小怪, 小怪, 守卫]
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
  }
  G.setPet = n => { S.pet = n; setPetActor(); G.refresh(); };
  const pet = { x: 0, y: 0, face: 1, anim: 'Idle', t: 0 };
  function petAnim(a, loop) { if (!ST || pet.anim === a) return; pet.anim = a; ST.setAnimation(0, a, loop !== false); if (loop === false) ST.addAnimation(0, 'Idle', true, 0); }

  /* ---------- 一趟 ---------- */
  let R = null, mode = 'load', camY = 0, shake = 0, time = 0;
  const fx = [], nums = [], drops = [];
  const hero = { c: 3, r: -1, x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, mv: 0, face: 1, sw: 0, swinging: null, hurtT: 0, fall: 0 };
  function newRun() {
    TERRAIN.reset();
    const start = Math.min(S.boss, B.STAGES - 1) * B.STAGE;
    R = { start, rows: new Map(), mons: [], st: D.stam, stMax: D.stam, hp: D.hp, hpMax: D.hp, coin: 0, gem: 0, t: 0, deep: start, on: false, over: null, revived: false, petT: 0, kills: 0, blocks: 0 };
    hero.c = 3; hero.r = start - 1; hero.mv = 0; hero.swinging = null; hero.sw = 0; hero.face = 1; hero.hurtT = 0; hero.dead = false;
    place(); pet.x = hero.x - T * 0.8; pet.y = hero.y; fx.length = nums.length = drops.length = 0;
    for (let r = start; r < start + 14; r++) row(r);
  }
  function place() { hero.x = (hero.c + 0.5) * T; hero.y = (hero.r + 1) * T; }
  const hash = (c, r) => { let h = (c * 374761393 + r * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
  function row(r) {
    let cells = R.rows.get(r); if (cells) return cells;
    const s = B.stageOf(r), l = r - s * B.STAGE; cells = [];
    for (let c = 0; c < W; c++) cells.push({ t: 1, hp: B.blockHp(s), max: B.blockHp(s), v: hash(c, r) % 4, s });
    if (l === B.STAGE - 1) for (const c of cells) { c.t = 3; c.v &= 1; }
    else if (l === B.STAGE - 3) { for (let c = 2; c <= 4; c++) cells[c].t = 0; }
    else if (l === B.STAGE - 2) { for (let c = 2; c <= 4; c++) cells[c].t = 0; const b = B.boss(s); spawn(3, r, G.stageKinds(s)[2], b.hp, b.atk, s, true); }
    else if (l % B.SPUR_EVERY === B.SPUR_EVERY - 1 && l < B.STAGE - 5) {
      const left = (Math.floor(l / B.SPUR_EVERY) % 2) === 0;
      for (let i = 0; i < B.SPUR_LEN; i++) { const c = cells[left ? i : W - 1 - i]; c.t = 2; c.hp = c.max = B.spurHp(s); }
    } else if (l < B.STAGE - 4 && l % B.SPUR_EVERY === (hash(7, Math.floor(r / B.SPUR_EVERY)) % 2) && !(r === R.start)) {
      const c = hash(11, r) % W; cells[c].t = 0; spawn(c, r, G.stageKinds(s)[hash(5, r) % 2], B.monHp(s), B.monAtk(s), s, false);
    }
    R.rows.set(r, cells); return cells;
  }
  function spawn(c, r, kind, hp, atk, s, boss) {
    const m = MLIB.create(kind); m.play('Idle'); m.update(Math.random());
    R.mons.push({ c, r, kind, hp, max: hp, atk, s, boss, m, at: 0.4, flash: 0, dead: 0, face: -1 });
  }
  function cell(c, r) {
    if (c < 0 || c >= W) return WALL;
    if (r < R.start) return (r < 0 || R.start === 0 || c === 3) ? EMPTY : OLD;
    return row(r)[c];
  }
  const WALL = { t: 9 }, EMPTY = { t: 0 }, OLD = { t: 8 };
  const monAt = (c, r) => R.mons.find(m => m.c === c && m.r === r && !m.dead) || (R.mons.find(m => m.boss && !m.dead && m.r === r && Math.abs(m.c - c) <= 0 ) || null);

  function start() {
    if (mode !== 'shore') return; SFX.init();
    D = B.derive(S); const keep = R && !R.on && R.start === Math.min(S.boss, B.STAGES - 1) * B.STAGE && R.stMax === D.stam && R.hpMax === D.hp;
    if (!keep) newRun();
    G.ui.hideShore();
    if (R.start > 0) { fade(() => { hero.c = 3; hero.r = R.start - 1; place(); pet.x = hero.x; pet.y = hero.y; mode = 'run'; R.on = true; camY = hero.y - VH * 0.42; hero.fall = 0.3; G.ui.showRun(); G.ui.toast('电梯直达 ' + R.start + ' 米'); }); }
    else { mode = 'run'; R.on = true; G.ui.showRun(); }
    S.runs++; heroLook(false);
  }
  G.start = start;
  function fade(fn) { const f = $('fade'); f.classList.add('on'); setTimeout(() => { fn(); setTimeout(() => f.classList.remove('on'), 120); }, 260); }
  G.fade = fade;

  function endRun(why) {   // why: 'stam' 体力耗尽 | 'dead' 血量归零 | 'back' 主动返回
    if (!R.on || R.over) return; R.over = why; R.on = false; input.dx = input.dy = 0;
    if (why === 'dead') { HERO.play('Dead1', { restart: true }); SFX.play('hero_die'); } else HERO.play(why === 'stam' ? 'Stun' : 'Victory');
    if (why === 'dead' && !R.revived) { setTimeout(() => G.ui.revive(), 700); return; }
    setTimeout(() => G.ui.result(R, why), why === 'back' ? 250 : 800);
  }
  G.endRun = endRun;
  G.revive = () => { R.revived = true; R.over = null; R.on = true; R.hp = R.hpMax * 0.5; R.st = Math.max(R.st, R.stMax * 0.5); HERO.play('Idle'); hero.dead = false; };
  G.giveUp = () => { R.revived = true; G.ui.result(R, 'dead'); };
  /* 结算：mult = 广告倍数；keep = 死亡时是否保住 30% */
  G.collect = (mult, keep) => {
    const k = (R.over === 'dead' && !keep) ? 1 - B.P.dieLoss : 1, c = Math.floor(R.coin * k * mult), g = Math.floor(R.gem * k * mult);
    S.coin += c; S.gem += g; S.lastRun = { coin: Math.max(S.lastRun.coin, Math.floor(R.coin)), gem: Math.max(S.lastRun.gem, Math.floor(R.gem)) };
    S.best = Math.max(S.best, R.deep); G.save();
    fade(() => { toShore(); });
  };
  function toShore() { mode = 'shore'; D = B.derive(S); newRun(); hero.c = R.start > 0 ? 4 : 3; hero.r = -1; place(); pet.x = hero.x - T * 0.9; pet.y = hero.y; camY = shoreCam(); HERO.play('Idle'); heroLook(false); hero.aim = 0; G.ui.showShore(); }
  const shoreCam = () => -Math.round(VH * 0.5);

  /* ---------- 广告（测试版占位） ---------- */
  G.watchAd = (cb) => { G.ui.ad(() => { S.ads++; checkVip(); cb && cb(); G.refresh(); }); };
  function checkVip() {
    while (S.vip < B.VIP.length && S.ads >= B.VIP[S.vip].ads) {
      const v = B.VIP[S.vip]; S.vip++;
      if (v.pet && !S.pets.includes(v.pet)) { S.pets.push(v.pet); if (!S.pet) { S.pet = v.pet; setPetActor(); } }
      if (v.gift) { const best = Math.max(0, ...Object.keys(B.GEAR).map(k => S.gear[k] || 0)); S.gear[v.gift] = Math.min(B.MAX_TIER, Math.max((S.gear[v.gift] || 0) + 1, best + 1)); }
      G.ui.toast('VIP ' + S.vip + '：' + v.text, 2600);
    }
  }
  G.buyGear = k => { const t = (S.gear[k] || 0) + 1, p = B.gearPrice(k, t), cur = B.GEAR[k].cur; if (t > B.MAX_TIER || S[cur] < p) return false; S[cur] -= p; S.gear[k] = t; SFX.play('pickup_gem'); G.refresh(); return true; };
  G.skillNode = (line, j) => {   // 统一描述一个技能节点
    if (B.LINES[line]) { const lv = (S.skill[line] || [])[j] || 0, max = B.nodeClicks(j), [t, x] = B.NODE_SEQ[j]; return { lv, max, cost: B.nodeCost(line, j), cur: B.LINES[line].cur, text: t === 's' ? '每级 +20%' : '+' + ((x - 1) * 100) + '%', big: t === 'b', open: j === 0 || ((S.skill[line] || [])[j - 1] || 0) >= B.nodeClicks(j - 1) }; }
    const sp = B.SPECIAL[line], l = S.skill[line] || 0, lv = Math.max(0, Math.min(3, l - j * 3));
    return { lv, max: 3, cost: B.specialCost(line, Math.min(sp.max - 1, l)), cur: sp.cur, text: line === 'time' ? '每级 体力上限 +50%' : '每级 每秒挥击 +0.5 次', big: false, open: l >= j * 3 };
  };
  G.buySkill = (line, j) => {
    const n = G.skillNode(line, j); if (!n.open || n.lv >= n.max || S[n.cur] < n.cost) return false; S[n.cur] -= n.cost;
    if (B.LINES[line]) { const a = S.skill[line] || (S.skill[line] = []); a[j] = (a[j] || 0) + 1; } else S.skill[line] = (S.skill[line] || 0) + 1;
    SFX.play('pickup_coin'); G.refresh(); return true;
  };
  G.offline = () => {   // 招财鱼：离线每小时 1 趟收入，最多 8 小时
    if (!S.pets.includes('Goldfish') || !S.lastRun.coin) return null;
    const h = Math.min(8, (Date.now() - S.last) / 3600e3); if (h < 0.1) return null;
    return { h, coin: Math.floor(S.lastRun.coin * h), gem: Math.floor(S.lastRun.gem * h) };
  };

  /* ---------- 输入 ---------- */
  const input = { dx: 0, dy: 0, id: null, ox: 0, oy: 0 };
  const stick = $('stick'), knob = $('knob');
  wrap.addEventListener('pointerdown', e => {
    if (e.target.closest('.ui,button,.panel')) return; SFX.init(); if (mode !== 'run') return;
    input.id = e.pointerId; const b = wrap.getBoundingClientRect(); input.ox = e.clientX - b.left; input.oy = e.clientY - b.top;
    stick.style.display = 'block'; stick.style.left = input.ox + 'px'; stick.style.top = input.oy + 'px'; knob.style.transform = 'translate(-50%,-50%)';
  });
  window.addEventListener('pointermove', e => {
    if (e.pointerId !== input.id) return; const b = wrap.getBoundingClientRect(); let dx = e.clientX - b.left - input.ox, dy = e.clientY - b.top - input.oy;
    const len = Math.hypot(dx, dy), max = wrap.clientWidth * 0.11; if (len > max) { dx *= max / len; dy *= max / len; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    if (len < max * 0.3) { input.dx = input.dy = 0; return; }
    if (Math.abs(dx) > Math.abs(dy)) { input.dx = Math.sign(dx); input.dy = 0; } else { input.dx = 0; input.dy = dy > 0 ? 1 : 0; }
  });
  const up = e => { if (e.pointerId !== input.id) return; input.id = null; input.dx = input.dy = 0; stick.style.display = 'none'; };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  const keys = {};
  window.addEventListener('keydown', e => { keys[e.key] = 1; SFX.init(); }); window.addEventListener('keyup', e => { keys[e.key] = 0; });
  function dir() {
    if (input.dx || input.dy) return [input.dx, input.dy];
    if (keys.ArrowLeft || keys.a) return [-1, 0]; if (keys.ArrowRight || keys.d) return [1, 0]; if (keys.ArrowDown || keys.s) return [0, 1];
    return G.bot ? G.bot() : [0, 0];
  }

  /* ---------- 每帧逻辑 ---------- */
  function addNum(x, y, text, col, big) { nums.push({ x, y, text, col, t: 0, big }); if (nums.length > 40) nums.shift(); }
  function addFx(k, x, y, sc, rot) { fx.push({ k, x, y, t: 0, sc: sc || 1 }); if (fx.length > 60) fx.shift(); }
  function drop(kind, x, y, n) { for (let i = 0; i < Math.min(6, n); i++) drops.push({ kind, x, y, vx: (Math.random() - 0.5) * T * 5, vy: -T * (3 + Math.random() * 3), t: -i * 0.03 }); if (drops.length > 80) drops.splice(0, drops.length - 80); }
  function gain(kind, v, x, y) { if (kind === 'coin') R.coin += v; else R.gem += v; addNum(x, y - T * 0.3, '+' + B.fmt(v), kind === 'coin' ? '#ffd84a' : '#e58bff'); }

  function hitBlock(c, r, dmg) {
    const k = cell(c, r); if (k.t !== 1 && k.t !== 2) return;
    k.hp -= dmg; const x = (c + 0.5) * T, y = (r + 0.5) * T;
    const hx = x + (hero.x - x) * 0.45, hy = y + (hero.y - T * 0.45 - y) * 0.45;   // 碎屑从镐子敲的那一面飞出来
    if (k.hp <= 0) {
      const spur = k.t === 2; chips(c, r, x, y, spur ? 9 : 6, 1); k.t = 0; R.blocks++;
      addFx('puff', x, y, T / 110); SFX.play(spur ? 'chunk_fall' : 'dig_rock_block', spur ? 1 : 0.8); if (spur) shake = 0.18;
      const v = B.blockCoin(k.s) * D.coinM; drop('coin', x, y, 3); gain('coin', v, x, y);
    } else { SFX.play('dig_dirt', 0.7, k.t === 2 ? 0.75 : 1); chips(c, r, hx, hy, 3, 0.6); }
    TERRAIN.cellChanged(c, r);
  }
  // 碎土块：用这格材质的贴图（terrain.js 生成），被敲下来往外蹦、落地前淡出
  const bits = [];
  function chips(c, r, x, y, n, pow) {
    for (let i = 0; i < n; i++) {
      const im = TERRAIN.chip(c, r, (Math.random() * 6) | 0); if (!im) return;
      bits.push({ im, x: x + (Math.random() - 0.5) * T * 0.4, y: y + (Math.random() - 0.5) * T * 0.4, vx: (Math.random() - 0.5) * T * 4.5 * pow + (x - hero.x) * 0.0, vy: -T * (1.5 + Math.random() * 2.5) * pow, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, t: 0, s: 0.55 + Math.random() * 0.6 });
    }
    if (bits.length > 50) bits.splice(0, bits.length - 50);
  }
  function hitMon(m, dmg, crit) {
    if (m.dead) return; m.hp -= dmg; m.flash = 0.12; const x = (m.c + 0.5) * T, y = (m.r + 0.4) * T;
    addNum(x + (Math.random() - 0.5) * T * 0.4, y - T * 0.2, B.fmt(Math.max(1, dmg)), '#ffffff', m.boss); addFx('ring', x, y + T * 0.1, T / 150); SFX.play('mon_hit', 0.8);
    if (m.hp <= 0) {
      m.dead = 0.001; m.m.play('Dead', { restart: true, speed: 2.2 }); SFX.play('mon_die'); R.kills++;
      S.codex[m.kind] = (S.codex[m.kind] || 0) + 1;
      if (m.boss) {
        const b = B.boss(m.s); drop('gem', x, y, 6); drop('coin', x, y, 6); gain('gem', b.gem * D.gemM, x, y - T * 0.3); gain('coin', b.coin * D.coinM, x, y);
        addFx('star', x, y, T / 50); shake = 0.35;
        for (let c = 2; c <= 4; c++) { const k = row(m.r + 1)[c]; k.t = 0; addFx('puff', (c + 0.5) * T, (m.r + 1.5) * T, T / 100); chips(c, m.r + 1, (c + 0.5) * T, (m.r + 1.5) * T, 5, 1); TERRAIN.cellChanged(c, m.r + 1); }
        SFX.play('chunk_fall');
        if (S.boss < m.s + 1) { S.boss = m.s + 1; G.ui.banner('第 ' + (m.s + 1) + ' 层守卫已击败', '电梯通到 ' + S.boss * B.STAGE + ' 米'); }
        D = B.derive(S); G.save();
      } else { drop('gem', x, y, 2); gain('gem', B.monGem(m.s) * D.gemM, x, y - T * 0.25); gain('coin', B.monCoin(m.s) * D.coinM, x, y + T * 0.05); addFx('smoke', x, y, T / 150); }
    } else if (m.m.state !== 'Attack') m.m.play('Hit', { restart: true, onEnd: () => m.m.play('Idle') });
  }
  function hurtHero(m) {
    if (!R.on) return; const d = B.hurt(m.atk, D.def); R.hp -= d; hero.hurtT = 0.25; shake = Math.max(shake, 0.12);
    addNum(hero.x, hero.y - T * 1.0, '-' + B.fmt(d), '#ff5a4d'); SFX.play('hero_hurt', 0.8);
    if (R.hp <= 0) { R.hp = 0; endRun('dead'); }
  }

  function update(dt) {
    time += dt;
    if (HERO) HERO.update(dt);
    // 宠物跟随
    if (SK) {
      const tx = hero.x - hero.face * T * 0.78, ty = hero.y, dx = tx - pet.x, dy = ty - pet.y, d = Math.hypot(dx, dy);
      if (d > T * 3) { pet.x = tx; pet.y = ty; } else if (d > 2) { const sp = Math.min(d, T * 9 * dt); pet.x += dx / d * sp; pet.y += dy / d * sp; if (Math.abs(dx) > 3) pet.face = dx > 0 ? 1 : -1; if (pet.anim === 'Idle') petAnim('Walk'); }
      else if (pet.anim === 'Walk') petAnim('Idle');
      ST.update(dt); ST.apply(SK); SK.x = 0; SK.y = 0; SK.updateWorldTransform(spine.Physics ? spine.Physics.update : undefined);
    }
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i], v = A.VFX[f.k]; f.t += dt; if (f.t * v[3] >= v[0]) fx.splice(i, 1); }
    for (let i = nums.length - 1; i >= 0; i--) { nums[i].t += dt; if (nums[i].t > 0.8) nums.splice(i, 1); }
    for (let i = bits.length - 1; i >= 0; i--) { const b = bits[i]; b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += T * 16 * dt; b.rot += b.vr * dt; if (b.t > 0.75) bits.splice(i, 1); }
    // 角色踩在真正的土面上（地形是不规则的，逻辑格子的地面只是个参考）
    const footT = (o, x, y) => { const f = TERRAIN.floorAt(x, y) - y; o.vo = o.vo === undefined ? f : o.vo + (f - o.vo) * Math.min(1, dt * 14); };
    footT(hero, hero.x, hero.y); footT(pet, pet.x, pet.y);
    for (let i = drops.length - 1; i >= 0; i--) {
      const p = drops[i]; p.t += dt; if (p.t < 0) continue;
      if (p.t < 0.28) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += T * 22 * dt; }
      else { const tx = OX + T * (p.kind === 'coin' ? 0.55 : 2.6), ty = camY + T * 0.62, k = Math.min(1, dt * 11); p.x += (tx - p.x) * k; p.y += (ty - p.y) * k; if (Math.hypot(tx - p.x, ty - p.y) < T * 0.25 || p.t > 1.2) { drops.splice(i, 1); if (i % 2 === 0) SFX.play(p.kind === 'coin' ? 'pickup_coin' : 'pickup_gem', 0.35); } }
    }
    if (shake > 0) shake = Math.max(0, shake - dt);
    if (!R) return;
    for (const m of R.mons) {
      if (Math.abs(m.r - hero.r) > 12) continue;
      m.m.update(dt); if (m.flash > 0) m.flash -= dt;
      if (m.dead) { m.dead += dt; continue; }
      if (!R.on) continue;
      const adj = Math.abs(m.c - hero.c) + Math.abs(m.r - hero.r) === 1 && !hero.mv;
      if (adj) {
        if (m.c !== hero.c) m.face = hero.c > m.c ? 1 : -1;
        m.at -= dt;
        if (m.at <= 0) { m.at = m.boss ? 1.2 : 1.0; m.m.play('Attack', { restart: true, onEvent: () => { if (Math.abs(m.c - hero.c) + Math.abs(m.r - hero.r) === 1 && !m.dead) hurtHero(m); }, onEnd: () => m.m.play('Idle') }); SFX.play('mon_attack', 0.6); }
      } else m.at = Math.min(m.at, 0.45);
    }
    R.mons = R.mons.filter(m => !(m.dead > 0.7));
    if (mode === 'shore') { camY += (shoreCam() - camY) * Math.min(1, dt * 8); return; }
    // 镜头
    const ty = hero.y - VH * 0.42; camY += (ty - camY) * Math.min(1, dt * 7);
    if (!R.on) return;
    R.t += dt;
    const s = B.stageOf(hero.r + (hero.r < R.start ? 1 : 0));
    R.st -= B.drain(s) * dt; if (hero.hurtT > 0) hero.hurtT -= dt;
    if (R.st <= 0) { R.st = 0; endRun('stam'); return; }
    if (hero.fall > 0) { hero.fall -= dt; return; }
    // 移动补间
    if (hero.mv > 0) {
      hero.mv -= dt; const k = Math.max(0, hero.mv / 0.15);
      hero.x = hero.tx + (hero.fx - hero.tx) * k; hero.y = hero.ty + (hero.fy - hero.ty) * k;
      if (hero.mv <= 0) { hero.x = hero.tx; hero.y = hero.ty; hero.mv = 0; R.deep = Math.max(R.deep, hero.r + 1); if (hero.r + 16 > R.start) for (let r = hero.r; r < hero.r + 14; r++) row(r); }
      else return;
    }
    const [dx, dy] = dir();
    if (!dx && !dy) { stopSwing(); if (HERO.state !== 'Idle') HERO.play('Idle'); return; }
    if (dx) hero.face = dx;
    const c = hero.c + dx, r = hero.r + dy, k = cell(c, r), m = k.t === 9 ? null : R.mons.find(q => q.c === c && q.r === r && !q.dead);
    if (m) { swing(dt, 'mon', m, dy); return; }
    if (k.t === 9 || k.t === 8 || k.t === 3) { stopSwing(); if (HERO.state !== 'Idle') HERO.play('Idle'); if (k.t === 3 && time - (hero.bumpT || 0) > 1.5) { hero.bumpT = time; k.shake = 0.15; SFX.play('dig_dirt', 0.5, 0.6); G.ui.toast('先击败这一层的守卫'); } return; }
    if (k.t === 1 || k.t === 2) { swing(dt, 'block', { c, r }, dy); return; }
    if (R.mons.some(q => q.dead && q.c === c && q.r === r)) return;
    stopSwing(); hero.fx = hero.x; hero.fy = hero.y; hero.c = c; hero.r = r; hero.tx = (c + 0.5) * T; hero.ty = (r + 1) * T; hero.mv = 0.15;
    if (HERO.state !== 'Run') HERO.play('Run'); if (dy) SFX.play('land', 0.25);
  }
  function stopSwing() { if (hero.swinging) { hero.swinging = null; hero.sw = 0; HERO.aim = 0; } }
  function swing(dt, kind, tg, dy) {
    const key = kind + (tg.c) + ',' + (tg.r);
    if (hero.swinging !== key) { hero.swinging = key; hero.sw = 0; hero.hit = false; heroLook(kind === 'mon'); HERO.play('Attack', { range: [0.75, 1.2], speed: 0.45 * D.freq, restart: true }); SFX.play('swing', 0.35); }
    HERO.aim = dy ? -62 : 0;
    const p0 = hero.sw; hero.sw += dt * D.freq;
    if (p0 < 0.55 && hero.sw >= 0.55) {
      if (kind === 'mon') hitMon(tg, D.atk); else hitBlock(tg.c, tg.r, D.dig * (R.st > R.stMax * 0.5 ? 1 + B.P.fullBonus : 1));
    }
    if (hero.sw >= 1) { hero.sw -= 1; SFX.play('swing', 0.3); }
    // 宠物帮忙：每秒 1 次
    if (D.pet && SK) {
      R.petT += dt;
      if (R.petT >= 1 && ((kind === 'mon' && D.pet.atk) || (kind === 'block' && D.pet.dig))) {
        R.petT = 0; petAnim('Attack', false); pet.anim = 'Atk'; setTimeout(() => { pet.anim = 'Idle'; }, 500);
        if (kind === 'mon') hitMon(tg, D.atk * D.pet.atk); else hitBlock(tg.c, tg.r, D.dig * D.pet.dig);
      }
    }
  }

  /* ---------- 绘制 ---------- */
  function drawShoreBack() {
    const gy = Math.round(-camY);   // 地面线的屏幕 y
    if (gy <= 0) return;
    const I = A.img;
    ctx.fillStyle = '#42f2ff'; ctx.fillRect(0, 0, VW, gy);
    let h = VW * I.sky.height / I.sky.width * 1.25; ctx.drawImage(I.sky, -VW * 0.1, gy - h - T * 1.9, VW * 1.25, h); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, gy - T * 1.92, VW, T * 1.92);
    h = VW * 0.62 * I.hill1.height / I.hill1.width; ctx.globalAlpha = 0.75; ctx.drawImage(I.hill1, -VW * 0.08, gy - h * 0.92, VW * 0.62, h); ctx.drawImage(I.hill1, VW * 0.5, gy - h * 1.05, VW * 0.7, h * 1.15); ctx.globalAlpha = 1;
    h = VW * 0.8 * I.hill2.height / I.hill2.width; ctx.drawImage(I.hill2, VW * 0.3, gy - h * 0.8, VW * 0.8, h); ctx.drawImage(I.hill2, -VW * 0.45, gy - h * 0.7, VW * 0.8, h);
    h = VW * 0.75 * I.bush.height / I.bush.width; ctx.drawImage(I.bush, -VW * 0.2, gy - h * 0.7, VW * 0.75, h); ctx.drawImage(I.bush, VW * 0.55, gy - h * 0.62, VW * 0.75, h);
    const mw = T * 2.5, mh = mw * I.market.height / I.market.width; ctx.drawImage(I.market, OX + T * 0.05, gy - mh + T * 0.1, mw, mh);
  }
  function draw() {
    if (ctx.__begin) ctx.__begin();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.fillStyle = '#0d0716'; ctx.fillRect(0, 0, VW, VH);
    if (!R || !A.ready) { if (ctx.__end) ctx.__end(); return; }
    const sx = shake > 0 ? Math.round((Math.random() - 0.5) * shake * T * 0.5) : 0, sy = shake > 0 ? Math.round((Math.random() - 0.5) * shake * T * 0.5) : 0;
    const cy = Math.round(camY) + sy, ox = OX + sx, CQ = TERRAIN.CQ();
    TERRAIN.update(cy, VH);
    drawShoreBack();
    TERRAIN.drawBG(ctx, cy, VW, VH);
    TERRAIN.draw(ctx, cy, ox, VH);
    TERRAIN.drawProps(ctx, cy, ox, VH, time);
    // 守卫门：门中间的锁
    const r0 = Math.floor(cy / T), r1 = Math.floor((cy + VH) / T);
    for (let r = Math.max(0, r0); r <= r1; r++) if (cell(3, r).t === 3) { const lw = T * 0.46, lh = lw * A.img.lock.height / A.img.lock.width; ctx.drawImage(A.img.lock, Math.round(ox + 3.5 * T - lw / 2), Math.round((r + 0.5) * T - cy - lh / 2), Math.round(lw), Math.round(lh)); }
    // 怪物（脚踩在真正的土面上）
    for (const m of R.mons) {
      const y0 = (m.r + 1) * T; if (y0 - cy < -T * 3 || y0 - cy > VH + T * 3) continue;
      const x = ox + (m.c + 0.5) * T, y = TERRAIN.floorAt((m.c + 0.5) * T, y0) - cy, sc = (m.boss ? 1.55 : 0.86) * T / 190;
      const a = m.dead ? Math.max(0, 1 - m.dead / 0.7) : 1;
      if (m.flash > 0) ctx.filter = 'brightness(2.2)';
      m.m.draw(ctx, x, y - T * 0.02, { scale: sc, flipX: m.face > 0, alpha: a });
      if (m.flash > 0) ctx.filter = 'none';
      m.sy = y;
    }
    // 宠物
    if (SK && petCv) {
      const PZ = petCv.width; petG.setTransform(1, 0, 0, 1, 0, 0); petG.clearRect(0, 0, PZ, PZ);
      const sc = T * 0.62 / 100; petG.setTransform(sc * pet.face, 0, 0, -sc, PZ / 2, PZ * 0.8); SR.draw(SK);
      ctx.drawImage(petCv, Math.round(ox + pet.x - PZ / 2), Math.round(pet.y + (pet.vo || 0) - cy - PZ * 0.8 + T * 0.02));
    }
    // 主角
    if (HERO) { if (hero.hurtT > 0) ctx.filter = 'brightness(1.8)'; HERO.draw(ctx, ox + hero.x, hero.y + (hero.vo || 0) - cy + T * 0.01, { scale: T / 118, flipX: hero.face < 0 }); if (hero.hurtT > 0) ctx.filter = 'none'; }
    // 碎土块
    for (const b of bits) { const z = b.im.width * b.s, a = b.t > 0.5 ? Math.max(0, 1 - (b.t - 0.5) / 0.25) : 1; ctx.globalAlpha = a; ctx.save(); ctx.translate(Math.round(ox + b.x), Math.round(b.y - cy)); ctx.rotate(b.rot); ctx.drawImage(b.im, -z / 2, -z / 2, z, z); ctx.restore(); }
    ctx.globalAlpha = 1;
    // 特效
    for (const f of fx) { const v = A.VFX[f.k], i = Math.min(v[0] - 1, Math.floor(f.t * v[3])), w = v[1] * f.sc, h = v[2] * f.sc; ctx.drawImage(A.img[f.k], i * v[1], 0, v[1], v[2], Math.round(ox + f.x - w / 2), Math.round(f.y - cy - h / 2), w, h); }
    // 光照：环境光 + 光源（道具、主角身上的光）；乘整个场景，界面类的东西画在后面
    const K = 80 / T, lights = TERRAIN.propLights(time);
    lights.push({ x: hero.x * K, y: (hero.y + (hero.vo || 0)) * K - 40, r: 250, k: 0.75, c: [1.0, 0.9, 0.74] });
    TERRAIN.drawLight(ctx, cy, ox, VW, VH, lights, time);
    // 怪物血条
    for (const m of R.mons) {
      if (m.dead || m.hp >= m.max || m.boss || m.sy === undefined) continue;
      const x = ox + (m.c + 0.5) * T, y = m.sy, w = T * 0.7, h = Math.max(3, T * 0.07), bx = Math.round(x - w / 2), by = Math.round(y - T * 0.98);
      ctx.fillStyle = 'rgba(20,10,30,0.8)'; ctx.fillRect(bx - 1, by - 1, w + 2, h + 2); ctx.fillStyle = '#ff5a4d'; ctx.fillRect(bx, by, Math.round(w * Math.max(0, m.hp / m.max)), h);
    }
    // 掉落
    for (const p of drops) { if (p.t < 0) continue; const z = T * 0.34; ctx.drawImage(A.img[p.kind], Math.round(ox + p.x - z / 2), Math.round(p.y - cy - z / 2), z, z); }
    // 数字
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const n of nums) {
      const fs = Math.round(T * (n.big ? 0.46 : 0.34)); ctx.font = `700 ${fs}px UINum, sans-serif`; ctx.globalAlpha = n.t > 0.55 ? Math.max(0, 1 - (n.t - 0.55) / 0.25) : 1;
      const x = Math.round(ox + n.x), y = Math.round(n.y - cy - T * 0.9 * Math.min(1, n.t * 1.6));
      ctx.lineWidth = Math.max(3, fs * 0.22); ctx.strokeStyle = '#2a1436'; ctx.strokeText(n.text, x, y); ctx.fillStyle = n.col; ctx.fillText(n.text, x, y);
    }
    ctx.globalAlpha = 1;
    if (ctx.__end) ctx.__end();
  }

  /* ---------- 主循环 ---------- */
  let lastT = 0, frozen = false;
  function frame(t) {
    requestAnimationFrame(frame); resize();
    let dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
    if (G.paused || frozen) dt = 0;
    if (G.speed) { for (let i = 0; i < G.speed; i++) update(dt); } else update(dt);
    draw(); if (G.ui) G.ui.hud(R, mode, hero, D);
  }
  G.step = (sec) => { for (let t = 0; t < sec; t += 1 / 60) update(1 / 60); };   // 测试用：快进
  G.freeze = v => { frozen = v; };
  G.cell = (c, r) => cell(c, r);
  G.autoBot = () => {   // 自动测试用的机器人：走 S 形，遇怪就打，守卫打完再下去
    const h = hero, adj = R.mons.find(m => !m.dead && Math.abs(m.c - h.c) + Math.abs(m.r - h.r) === 1 && m.r >= h.r);
    if (adj) return [adj.c - h.c, adj.r - h.r];
    const b = cell(h.c, h.r + 1).t, gate2 = [2, 3].some(k => h.r + k >= 0 && cell(3, h.r + k).t === 3) && R.mons.some(m => m.boss && !m.dead && m.r > h.r);
    if (gate2 && h.c !== 2) return [h.c > 2 ? -1 : 1, 0];
    if (b === 3) return h.c === 3 ? [0, 0] : [h.c > 3 ? -1 : 1, 0];
    if (b === 2 && !G.botStraight) { for (let d = 1; d < 7; d++) for (const sg of [-1, 1]) { const c = h.c + sg * d; if (c >= 0 && c < W && cell(c, h.r + 1).t !== 2) return [sg, 0]; } }
    return [0, 1];
  };
  G.state = () => ({ mode, R, hero, D, T, camY });

  G.portrait = (c, kind) => { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); const m = MLIB.create(kind); m.play('Idle'); m.update(0.3); m.draw(g, c.width / 2, c.height * 0.86, { scale: c.width / 260, flipX: true }); };
  G.petPortrait = async (c, name) => { const p = await loadPet(name); const sk = new spine.Skeleton(p.data); (sk.setupPose ? sk.setupPose() : sk.setToSetupPose()); sk.updateWorldTransform(spine.Physics ? spine.Physics.update : undefined);
    const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); const k = c.width / 150; g.setTransform(k, 0, 0, -k, c.width / 2, c.height * 0.82); const r = new spine.SkeletonRenderer(g); r.triangleRendering = true; r.draw(sk); g.setTransform(1, 0, 0, 1, 0, 0); };

  async function boot() {
    const off = G.offline(); resize();
    // 双击 index.html（file://）时 WebGL 读不了本地图片，自动退回 Canvas 2D；放到网站上才走 WebGL
    ctx = (window.PIXICTX && location.protocol !== 'file:') ? window.PIXICTX.create(cv) : cv.getContext('2d');
    TERRAIN.init({ cell: (c, r) => cell(c, r), stageOf: r => B.stageOf(r) });
    await Promise.all([A.load(), TERRAIN.load()]); A.bake(T); TERRAIN.ready = true; TERRAIN.resize(T, OX, VW);
    HERO = Hero.create(window.HERO_DATA, 'assets/hero/', { Eye: 1, Hair: 1, Chest: 10, Pickaxe: 0 }, { Hair: [0.55, 0.33, 0.2] }); heroLook(false); await HERO.ready();
    MLIB = await EnemyMonsters.load(window.ENEMY_MONSTER_DATA, 'assets/monsters/');
    petCv = document.createElement('canvas'); petCv.width = petCv.height = Math.ceil(T * 1.6); petG = petCv.getContext('2d'); SR = new spine.SkeletonRenderer(petG); SR.triangleRendering = true;
    await setPetActor();
    try { await document.fonts.load('700 20px UINum'); } catch (e) { }
    checkVip(); newRun(); G.ui.init(); toShore(); $('loading').style.display = 'none';
    if (off) G.ui.offline(off);
    requestAnimationFrame(frame);
  }
  window.addEventListener('load', boot);
  document.addEventListener('visibilitychange', () => { if (document.hidden) G.save(); });
})();
