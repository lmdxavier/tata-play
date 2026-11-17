/* dig hero 怪物与守卫行为（v0.18，用户 18:21：怪不能都是同一个模板）
 * 史莱姆：一跳一格地蹦过来（能跳上 1 格台阶），前摇压扁蓄力 → 扑咬。
 * 绿蜗牛：慢慢爬，前摇后仰 → 顶一下；连挨几下就缩壳减伤。
 * 洞穴蝙蝠：穿过空腔飞到主角斜上方 → 尖叫升高（前摇）→ 俯冲 → 落在主角旁边歇一会（破绽）→ 飞开。
 * 守卫红甲虫王：顶咬 / 冲撞（撞墙晕 = 破绽）/ 跳起砸地（落点追主角 + 左右冲击波）轮换，半血咆哮进二阶段（更快、连招）。
 * v0.21 区域 2：行为按 B.AI[kind].type 复用（hop 史莱姆式 / crawl 蜗牛式 / fly 蝙蝠式）：角蜥 hop、响尾蛇 crawl、铁甲虫 crawl + 缩甲壳；
 *   守卫按 B.bossOf(kind) 取各自的招式表（堡垒龟：缩壳打滚冲撞、低跳重踏、挨打缩壳），守卫行 = 守卫自己的 m.r（不再写死第 48 行）。
 * 数字全在 balance.js 的 B.AI / B.BOSS / B.HOP。game.js 通过 MOBS.init(env) 把格子、主角、受伤等接口传进来。 */
(function () {
  'use strict';
  const B = window.BAL, A = window.ART;
  const MOBS = window.MOBS = {};
  let E = null;
  MOBS.init = env => { E = env; };
  const lerp = (a, b, u) => a + (b - a) * u, sgn = v => v > 0 ? 1 : v < 0 ? -1 : 0;
  const PH = (m, arr) => Array.isArray(arr) ? arr[m.p2 ? 1 : 0] : arr;

  /* ---------- 素材：冲击星爆序列帧、落点准星、红色冲撞箭头 ---------- */
  const IMG = {};
  function img(k, src) { const im = new Image(); im.src = 'assets/' + src; return IMG[k] = im; }
  img('impact', 'vfx/impact_star.png'); img('cross', 'sk/Misc_Crosshair_01_Red.png'); img('arrow', 'ui/icon_white_arrow_back.png');
  A.img.impact = IMG.impact; A.VFX.impact = [14, 160, 146, 30];   // craftpix 卡通爆炸 Fx07（星形冲击），烘成 160px 一帧的横条
  let redArrow = null;
  function arrowRed() {   // 白色箭头图标染成警示红（只染一次）
    if (redArrow) return redArrow; const a = IMG.arrow; if (!a.width) return null;
    const c = document.createElement('canvas'); c.width = a.width; c.height = a.height; const g = c.getContext('2d');
    g.drawImage(a, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ff4433'; g.fillRect(0, 0, c.width, c.height);
    return redArrow = c;
  }

  /* ---------- 格子占用 ---------- */
  const R = () => E.R(), H = () => E.hero;
  function monAt(c, r, ex) { for (const q of R().mons) if (q !== ex && !q.dead && q.c === c && q.r === r) return q; return null; }
  const heroAt = (c, r) => H().c === c && H().r === r;
  const open = (c, r) => E.cell(c, r).t === 0;
  const free = (c, r, m) => open(c, r) && !monAt(c, r, m) && !heroAt(c, r);
  const support = (c, r, m) => E.cell(c, r + 1).t !== 0 || heroAt(c, r + 1) || !!monAt(c, r + 1, m);
  const adj = m => Math.abs(m.c - H().c) + Math.abs(m.r - H().r) === 1;
  function flag() { }   // 格子上的 mon 标记只给 terrain.js 判断“怪物洞”摆装饰用，按出生位置记，怪走动时不改

  /* 沿空腔找去主角身边的第一步（BFS）；走不到 / 太远返回 null。fly = 飞行（四向、不受重力）；hop = 能跳上 1 格台阶 */
  function nextStep(m, fly, hop, maxLen) {
    const h = H(), key = (c, r) => (r + 10) * 16 + c, prev = new Map(); prev.set(key(m.c, m.r), null);
    let q = [[m.c, m.r]];
    for (let d = 0; d <= maxLen && q.length; d++) {
      const nq = [];
      for (const [c, r] of q) {
        const goal = fly ? (Math.abs(c - h.c) <= 1 && Math.abs(r - h.r) <= 1 && !(c === h.c && r === h.r) && r <= h.r) : Math.abs(c - h.c) + Math.abs(r - h.r) === 1;
        if (goal) {
          const k0 = key(m.c, m.r); let node = prev.get(key(c, r)); if (!node) return [0, 0];
          while (node[2] !== k0) node = prev.get(node[2]);
          return [node[0] - m.c, node[1] - m.r];
        }
        const mv = [];
        if (fly) mv.push([1, 0], [-1, 0], [0, 1], [0, -1]);
        else if (!(c === m.c && r === m.r ? support(c, r, m) : (E.cell(c, r + 1).t !== 0 || heroAt(c, r + 1)))) mv.push([0, 1]);   // 脚下空：只能往下掉
        else { mv.push([1, 0], [-1, 0]); if (hop) mv.push([1, -1], [-1, -1]); }
        for (const [dc, dr] of mv) {
          const nc = c + dc, nr = r + dr, k = key(nc, nr); if (prev.has(k) || !free(nc, nr, m)) continue;
          if (dr < 0 && !fly && !free(c, r - 1, m)) continue;   // 跳台阶要头顶有空
          prev.set(k, [nc, nr, key(c, r)]); nq.push([nc, nr]);
        }
      }
      q = nq;
    }
    return null;
  }

  /* ---------- 生成时初始化 ---------- */
  MOBS.setup = m => {
    m.ai = B.AI[m.kind] || null; m.st = m.boss ? 'sleep' : 'idle'; m.t = 0.3 + Math.random() * 0.4; m.mv = 0; m.fc = m.c; m.fr = m.r;
    m.sx = 1; m.sy = 1; m.rot = 0; m.ox = 0; m.oy = 0; m.warn = 0; m.fo = 0; m.hits = []; m.shellCd = 0; m.fly = !!(B.MON[m.kind] || {}).fly;
    if (m.boss) { m.seqI = 0; m.p2 = false; m.bx = m.c; m.walkN = 0; }
  };
  function startMove(m, dc, dr, dur, kind) {
    flag(m.c, m.r, 0); m.fc = m.c; m.fr = m.r; m.c += dc; m.r += dr; m.mv = dur; m.mvT = dur; m.mvKind = kind; flag(m.c, m.r, 1);
    if (dc) m.face = dc;
  }
  function anim(m, a, opt) { if (m.m.state !== a || (opt && opt.restart)) m.m.play(a, opt || {}); }
  function faceHero(m) { const d = H().c - m.c; if (d) m.face = sgn(d); }

  /* ---------- 受伤修正（game.js hitMon 调）：蜗牛缩壳减伤、守卫撞晕时受伤加成 ---------- */
  MOBS.dmgMul = m => {
    if (m.st === 'shell') return 1 - (m.boss ? B.bossOf(m.kind).shell.dr : m.ai.shellDR);
    if (m.boss && m.st === 'stun') return B.bossOf(m.kind).charge.stunTaken;
    return 1;
  };
  MOBS.onHit = m => {   // 已扣血之后调；返回 true = 自己处理了受击动画
    if (m.boss) {
      if (m.st === 'sleep') wakeBoss(m);
      const SH = B.bossOf(m.kind).shell;   // v0.21 堡垒龟：短时间挨够几下就缩壳（不在撞晕的破绽里缩）
      if (SH && m.st !== 'shell') { const now = E.time(); m.hits = m.hits.filter(t => now - t < SH.win); m.hits.push(now); }   // 每一下都记（出招中挨的也算），只在空档里缩
      if (SH && (m.st === 'idle' || m.st === 'rec' || m.st === 'walk') && !m.mv && (m.shellCd || 0) <= 0) {
        if (m.hits.length >= SH.hits) { m.st = 'shell'; m.t = SH.t; m.hits = []; m.shellCd = SH.t + SH.cd; anim(m, 'Idle', { restart: true }); E.sfx(B.bossOf(m.kind).sfx.shell, 0.9); }
      }
      return m.st !== 'idle' && m.st !== 'sleep';
    }
    if (m.ai && m.ai.shellHits && m.st !== 'shell' && m.shellCd <= 0) {
      const now = E.time(); m.hits = m.hits.filter(t => now - t < m.ai.shellWin); m.hits.push(now);
      if (m.hits.length >= m.ai.shellHits) { m.st = 'shell'; m.t = m.ai.shellT; m.hits = []; m.m.play('Idle', { restart: true }); shellPose(m); E.sfx('snail_shell', 0.8); return true; }
    }
    if (m.st === 'shell') return true;
    return m.st === 'wind' || m.st === 'act';   // 出招中被打不打断（不播受击动画，只闪白）
  };
  MOBS.calm = (t) => {   // 复活后：怪都退回休息，给主角 t 秒喘息
    for (const m of R().mons) { if (m.dead) continue; if (m.boss) { if (m.st !== 'sleep' && m.st !== 'shell') { m.st = 'rec'; m.t = t; m.warn = 0; m.ox = m.oy = 0; m.sx = m.sy = 1; m.rot = 0; } } else if (m.st !== 'shell') { m.st = 'rec'; m.t = t; m.warn = 0; m.ox = m.oy = 0; m.sx = m.sy = 1; m.rot = 0; } }
    waves.length = 0;
  };

  /* 缩壳：只显示壳，身子、头、四肢藏起来（素材本身没有缩壳动画，用部件显隐组合）。drop = 壳单独显示时挪到身子原来的位置、落到地面（格）
   * 蜗牛：Up + Front 两个部件；铁甲虫：藏头只剩甲壳；堡垒龟：藏头和四肢只剩石堡 */
  const SHELLS = {
    Snail_Green: { hide: { Body: 1, Hit: 1, Hit_2: 1, Attack: 1, Up_Hit: 1, Front_Hit: 1 }, show: { Up: 1, Front: 1 }, drop: [0.2, 0.2] },
    Beetle_Iron: { hide: { Head: 1, Attack: 1, Hit: 1 }, show: { Body: 1 }, drop: [0, 0.04] },
    Turtle_Tower: { hide: { Arm: 1, Arm2: 1, Leg: 1, Leg2: 1, Eye: 1, Arm_Hit: 1, Arm2_Hit: 1, Leg_Hit: 1, Leg2_Hit: 1, Hit: 1 }, show: { Body: 1, Up: 1 }, drop: [0, 0.06] },
  };
  function shellPose(m) { const S = SHELLS[m.kind]; if (!S) return; const N = m.m.def.nodes, on = m.m.s.on; for (let i = 0; i < N.length; i++) { if (S.hide[N[i].name]) on[i] = 0; else if (S.show[N[i].name]) on[i] = 1; } }
  /* ---------- 普通怪 ---------- */
  function updateMon(m, dt) {
    const ai = m.ai, T = E.T(); if (!ai) { m.m.update(dt); return; }
    m.m.update(dt); if (m.st === 'shell') shellPose(m);
    if (m.shellCd > 0) m.shellCd -= dt;
    m.warn = 0; m.ox = m.oy = 0; m.sx = m.sy = 1; m.rot = 0;
    if (m.mv > 0) { m.mv -= dt; if (m.mv <= 0) { m.mv = 0; if (m.mvKind === 'hop') { m.land = 0.12; } } }
    if (m.land > 0) { m.land -= dt; const k = Math.max(0, m.land / 0.12); m.sy = 1 - 0.18 * k; m.sx = 1 + 0.14 * k; }
    // 重力（飞行怪不受）
    if (!m.fly && !m.mv && !support(m.c, m.r, m) && free(m.c, m.r + 1, m)) { startMove(m, 0, 1, 0.13, 'fall'); return; }
    if (m.mv) return;
    m.t -= dt;
    const h = H(), busyHero = h.mv > 0;
    switch (m.st) {
      case 'shell': { const dr = SHELLS[m.kind].drop; m.oy = dr[1] * E.T(); m.ox = (m.face || -1) * dr[0] * E.T(); } m.rot = Math.sin(E.time() * 9) * 3; if (m.t <= 0) { m.st = 'idle'; m.t = 0.4; m.shellCd = ai.shellCd; anim(m, 'Idle', { restart: true }); } return;
      case 'rec': if (m.t <= 0) { m.st = 'idle'; m.t = 0; } break;
      case 'perch':   // 蝙蝠歇在主角旁边（破绽）
        if (m.t <= 0) { const up = [[0, -1], [sgn(m.c - h.c) || 1, 0], [0, 1]].find(([dc, dr]) => free(m.c + dc, m.r + dr, m)); if (up) startMove(m, up[0], up[1], ai.fly, 'fly'); m.st = 'rec'; m.t = ai.cd; anim(m, 'Walk'); }
        return;
      case 'wind': return windMon(m, dt);
      case 'act': return actMon(m, dt);
    }
    if (m.st !== 'idle' || m.t > 0) return;
    // 能出手：史莱姆 / 蜗牛要贴身；蝙蝠在主角身边 8 格里（不在主角正下方）
    const canHit = m.fly ? (Math.abs(m.c - h.c) <= 1 && Math.abs(m.r - h.r) <= 1 && m.r <= h.r && !heroAt(m.c, m.r)) : adj(m);
    if (canHit && !busyHero) { m.st = 'wind'; m.t = ai.wind; m.lc = h.c; m.lr = h.r; faceHero(m); if (m.fly) E.sfx('bat_cry', 0.7); return; }
    // 追：沿空腔找路
    const st = nextStep(m, m.fly, ai.type === 'hop', ai.sight + 1);
    if (!st || (!st[0] && !st[1])) { anim(m, 'Idle'); return; }
    if (ai.type === 'hop') { startMove(m, st[0], st[1], ai.hop, 'hop'); anim(m, 'Walk', { restart: true }); if (ai.sfxHop !== null) E.sfx(ai.sfxHop || 'slime_hop', 0.35); m.st = 'idle'; m.t = ai.rest; }
    else if (ai.type === 'crawl') { startMove(m, st[0], st[1], ai.step, 'crawl'); anim(m, 'Walk'); m.t = 0; }
    else { startMove(m, st[0], st[1], ai.fly, 'fly'); anim(m, 'Walk'); m.t = 0.05; }
  }
  function windMon(m, dt) {
    const ai = m.ai, h = H(), u = 1 - Math.max(0, m.t) / ai.wind;
    m.warn = u; faceHero(m);
    if (ai.type === 'hop') { m.sy = 1 - 0.28 * u; m.sx = 1 + 0.22 * u; }                 // 压扁蓄力（角蜥：伏低蓄力）
    else if (ai.type === 'crawl') { m.rot = -10 * u * (m.face || 1); m.ox = -m.face * 0.12 * u * E.T(); if (m.kind === 'Snake_Bell') m.ox += Math.sin(E.time() * 60) * 0.025 * u * E.T(); }   // 后仰（响尾蛇：后仰 + 抖动 = 摇尾示警）
    else { m.oy = -0.35 * u * E.T(); m.lc = h.c; m.lr = h.r; }                                       // 蝙蝠升高，盯着主角
    const still = m.fly ? (Math.abs(m.c - h.c) <= 1 && Math.abs(m.r - h.r) <= 1 && m.r <= h.r) : adj(m);
    if (!still) { m.st = 'idle'; m.t = 0.2; return; }   // 主角走开了：前摇作废（躲开）
    if (m.t > 0) return;
    m.st = 'act'; m.t = 0; m.u = 0; m.hit = false;
    if (ai.type === 'hop') { anim(m, 'Attack', { restart: true }); }
    else if (ai.type === 'crawl') { if (m.kind === 'Beetle_Iron') anim(m, 'Walk', { restart: true, speed: 3 }); else anim(m, 'Attack', { restart: true, onEnd: () => anim(m, 'Idle') }); E.sfx('mon_attack', 0.5); }   // 铁甲虫的 Attack 片段是翻跟头，改用快走 + 代码前顶（用角顶）
    else { anim(m, 'Attack', { restart: true }); E.sfx('bat_swoop', 0.8); }
  }
  function actMon(m, dt) {
    const ai = m.ai, h = H(), T = E.T(); m.u += dt;
    if (ai.type === 'hop') {   // 扑咬：往主角那边扑 0.4 格再弹回
      const u = Math.min(1, m.u / ai.lunge), k = Math.sin(u * Math.PI), up = ai.hopH < 0.2 ? 0.08 : 0.25;   // 角蜥贴地扑（不跳高）
      m.ox = (h.c - m.c) * 0.42 * k * T; m.oy = -up * k * T + (h.r - m.r) * 0.3 * k * T; m.sy = 1 + 0.12 * k; m.sx = 1 - 0.08 * k;
      if (!m.hit && u >= 0.5) { m.hit = true; E.sfx(ai.sfxHit || 'slime_land', ai.hitVol || 0.8); if (adj(m) && !E.air()) { E.hurt(m, 1); if (ai.sfxHit) E.fx('impact', h.x, h.y - T * 0.5, T / 420); } }
      if (u >= 1) { m.st = 'rec'; m.t = ai.cd; anim(m, 'Idle'); }
    } else if (ai.type === 'crawl') {   // 顶 / 咬：Attack 片段的事件点（0.13 秒）判定
      const k = Math.sin(Math.min(1, m.u / 0.35) * Math.PI); m.ox = m.face * (ai.reach || 0.15) * k * T;
      if (!m.hit && m.u >= 0.14) { m.hit = true; if (adj(m)) { E.hurt(m, 1); if (ai.reach) E.fx('impact', h.x, h.y - T * 0.5, T / 420); } }
      if (m.u >= 0.5) { m.st = 'rec'; m.t = ai.cd; }
    } else {   // 蝙蝠俯冲：飞到锁定的格子再弹回一半，然后落在主角旁边歇着
      const u = Math.min(1, m.u / ai.swoop), k = Math.sin(u * Math.PI * 0.5);
      const tx = (m.lc - m.c) * 0.75, ty = (m.lr - m.r) * 0.75;
      m.ox = tx * k * T; m.oy = (ty * k - 0.35 * (1 - k)) * T;
      if (!m.hit && u >= 1) {
        m.hit = true; if (heroAt(m.lc, m.lr)) E.hurt(m, 1);
        // 落到主角旁边（同一行优先）：主角能直接打到它
        const spots = [[m.lc - 1, m.lr], [m.lc + 1, m.lr], [m.lc, m.lr - 1]].filter(([c, r]) => (c === m.c && r === m.r) || free(c, r, m)).sort((a, b) => (Math.abs(a[0] - m.c) + Math.abs(a[1] - m.r)) - (Math.abs(b[0] - m.c) + Math.abs(b[1] - m.r)));
        if (spots.length && !(spots[0][0] === m.c && spots[0][1] === m.r)) { const [c, r] = spots[0]; startMove(m, c - m.c, r - m.r, 0.12, 'fly'); }
        m.st = 'perch'; m.t = ai.perch; anim(m, 'Idle', { restart: true });
      }
    }
  }

  /* ---------- 守卫红甲虫王 ---------- */
  function runOf(m) {   // 第 48 行里和守卫连通的空格范围（主角挖开的侧道也算）
    let a = m.c, b = m.c; while (open(a - 1, m.r) && !monAt(a - 1, m.r, m)) a--; while (open(b + 1, m.r) && !monAt(b + 1, m.r, m)) b++; return [a, b];
  }
  const BSFX = (m, k, d) => { const x = B.bossOf(m.kind).sfx; return (x && x[k]) || d; };   // v0.21 每个守卫自己的叫声（缺省 = 红甲虫王的）
  function wakeBoss(m) { m.st = 'idle'; m.t = 0.5; E.sfx(BSFX(m, 'wake', 'boss_growl'), 0.8); E.shake(0.12); }
  function bossNext(m) {
    const h = H(), BS = B.bossOf(m.kind), seq = BS.seq[m.p2 ? 1 : 0], mv = seq[m.seqI % seq.length], [a, b] = runOf(m), onRow = h.r === m.r && h.c >= a - 1 && h.c <= b + 1;
    if (mv === 'near') {
      if (adj(m)) { m.seqI++; return startBoss(m, 'bite'); }
      if (onRow && m.walkN < 3) { const d = sgn(h.c - m.c); if (d && free(m.c + d, m.r, m)) { m.walkN++; startMove(m, d, 0, PH(m, BS.walk), 'walk'); m.bx = m.c; anim(m, 'Walk'); m.st = 'walk'; return; } }
      m.walkN = 0; m.seqI++; return bossNext(m);   // 走不过去（主角不在这一行 / 被挡）→ 直接下一招
    }
    m.walkN = 0; m.seqI++;
    if (mv === 'charge') {
      let d = sgn(h.c - m.c); if (!d) d = (m.c - a) > (b - m.c) ? -1 : 1;
      if (Math.abs(h.c - m.c) < 3 && free(m.c - d, m.r, m)) { m.dir = d; m.backN = 0; m.st = 'back'; return; }   // 离得太近：先往后退开再冲
      if (!free(m.c + d, m.r, m) && !heroAt(m.c + d, m.r)) d = -d;
      if (Math.abs(h.c - m.c) < 2 || (!free(m.c + d, m.r, m) && !heroAt(m.c + d, m.r))) return startBoss(m, 'slam');   // 贴墙退不开 → 改成砸地
      m.dir = d; return startBoss(m, 'charge');
    }
    return startBoss(m, 'slam');
  }
  function startBoss(m, mv) {
    const BS = B.bossOf(m.kind); m.move = mv; m.st = 'wind'; m.hit = false; m.bx = m.c;
    m.windT = m.t = PH(m, BS[mv].wind) * (m.combo ? 0.6 : 1); faceHero(m);
    if ((mv === 'charge' || mv === 'slam') && E.hopTip) E.hopTip();   // v0.19 第一次碰到贴地招式：手势提示“往上划 = 小跳”
    if (mv === 'charge') { m.face = m.dir; E.sfx('boss_growl', 0.8); anim(m, 'Walk', { restart: true, speed: 2.2 }); }
    else if (mv === 'slam') { m.tc = slamTarget(m); anim(m, 'Idle'); }
    else anim(m, 'Idle');
  }
  function slamTarget(m) { const [a, b] = runOf(m), h = H(); return Math.max(a, Math.min(b, h.c)); }
  function updateBoss(m, dt) {
    const BS = B.bossOf(m.kind), T = E.T(), h = H();
    m.m.update(dt); m.warn = 0; m.ox = m.oy = 0; m.sx = m.sy = 1; m.rot = 0; m.ph = 0;
    if (m.mv > 0) { m.mv -= dt; if (m.mv <= 0) m.mv = 0; }
    if (m.st === 'sleep') { if (h.r >= m.r - BS.wake && h.r <= m.r + 1 && R().on) wakeBoss(m); return; }
    if (m.shellCd > 0) m.shellCd -= dt;
    if (!m.p2 && m.hp <= m.max * BS.rage && (m.st === 'idle' || m.st === 'walk' || m.st === 'rec' || m.st === 'stun')) {
      m.p2 = true; m.st = 'roar'; m.t = BS.roar; m.seqI = 0; anim(m, 'Idle'); E.sfx(BSFX(m, 'rage', 'boss_rage'), 0.9, BSFX(m, 'rageRate', 1)); E.shake(0.3); E.fx('ring', E.cx(m), E.cy(m) - T * 0.5, T / 70);
    }
    m.t -= dt;
    switch (m.st) {
      case 'roar': m.warn = 1; m.sx = 1 + 0.06 * Math.sin(E.time() * 40); m.sy = 1 + 0.08 * Math.abs(Math.sin(E.time() * 20)); if (m.t <= 0) { m.st = 'idle'; m.t = 0.2; } return;
      case 'back':   // 冲撞前后撤（倒着走，脸朝主角）
        if (!m.mv) {
          if (Math.abs(h.c - m.c) < 3 && m.backN < 3 && free(m.c - m.dir, m.r, m)) { m.backN++; startMove(m, -m.dir, 0, 0.3, 'walk'); m.face = m.dir; anim(m, 'Walk', { speed: 1.6 }); }
          else { m.bx = m.c; const d = sgn(h.c - m.c) || m.dir; if (Math.abs(h.c - m.c) < 2 || (!free(m.c + d, m.r, m) && !heroAt(m.c + d, m.r))) startBoss(m, 'slam'); else { m.dir = d; startBoss(m, 'charge'); } }
        }
        return;
      case 'walk': if (!m.mv) { m.bx = m.c; m.st = 'idle'; m.t = 0.12; anim(m, 'Idle'); } return;
      case 'idle': case 'rec':
        if (m.t <= 0 && !m.mv) { if (m.chain) { m.chain = false; m.combo = true; startBoss(m, 'slam'); m.combo = false; } else bossNext(m); }
        return;
      case 'stun':
        m.rot = 14 * (m.face || 1) * Math.sin(Math.min(1, (PH(m, BS.charge.stun) - m.t) * 6)); m.sy = 0.92;
        if ((m.starT = (m.starT || 0) - dt) <= 0) { m.starT = 0.45; E.fx('star', E.cx(m) + (Math.random() - 0.5) * T * 0.7, E.cy(m) - T * 1.1, T / 95); }
        if (m.t <= 0) { m.st = 'idle'; m.t = PH(m, BS.gap); anim(m, 'Idle', { restart: true }); }
        return;
      case 'shell':   // v0.21 堡垒龟缩壳：只剩石堡，微微晃，受伤 −80%；时间到伸出来接着打
        shellPose(m); m.oy = SHELLS[m.kind].drop[1] * T; m.rot = Math.sin(E.time() * 9) * 2;
        if (m.t <= 0) { m.st = 'idle'; m.t = 0.3; anim(m, 'Idle', { restart: true }); }
        return;
      case 'wind': return windBoss(m, dt);
      case 'act': return actBoss(m, dt);
    }
  }
  function windBoss(m, dt) {
    const BS = B.bossOf(m.kind), T = E.T(), u = 1 - Math.max(0, m.t) / m.windT; m.warn = u;
    if (m.move === 'bite') { faceHero(m); m.ox = -m.face * 0.24 * u * T; m.oy = -0.06 * u * T; m.rot = -16 * u * (m.face || 1); m.sx = 1 - 0.06 * u; m.sy = 1 + 0.06 * u; if (!adj(m)) { m.st = 'idle'; m.t = 0.15; return; } }   // 顶咬前摇：往后缩、抬头后仰（身子拉高，不压扁），和砸地的深蹲区分开
    else if (m.move === 'charge' && BS.charge.spin) {   // v0.21 堡垒龟：缩进石堡，原地越转越快（脚下扬土）
      shellPose(m); m.oy = SHELLS[m.kind].drop[1] * T; m.ph = 0.42 * T; m.spin = (m.spin || 0) + dt * 900 * u * u * m.dir; m.rot = m.spin;
      if ((m.dustT = (m.dustT || 0) - dt) <= 0) { m.dustT = 0.18; E.fx('puff', E.cx(m) - m.dir * T * 0.45, E.fy(m) - T * 0.1, T / 220); }
    } else if (m.move === 'charge') {   // 后蹬刨地：身子往后缩、前倾，脚下扬土
      m.ox = -m.dir * 0.22 * u * T; m.rot = 8 * m.dir * u; m.sx = 1 + 0.08 * u; m.sy = 1 - 0.08 * u;
      if ((m.dustT = (m.dustT || 0) - dt) <= 0) { m.dustT = 0.22; E.fx('puff', E.cx(m) - m.dir * T * 0.5, E.fy(m) - T * 0.1, T / 220); }
    } else {   // 下蹲蓄力；落点准星跟着主角，起跳前 0.15 秒锁定
      m.sy = 1 - 0.34 * u; m.sx = 1 + 0.2 * u; m.ox = Math.sin(E.time() * 55) * 0.035 * u * T; if (m.t > 0.15) m.tc = slamTarget(m); faceHero(m);   // 砸地前摇：深蹲压扁 + 越蹲越抖（蓄力），落点看地上的红标记
    }
    if (m.t > 0) return;
    m.st = 'act'; m.t = 0; m.u = 0; m.hit = false; m.n = (m.n || 0);
    if (m.move === 'bite') { E.sfx('boss_bite', 0.9); anim(m, 'Walk', { restart: true, speed: 3 }); }
    else if (m.move === 'charge') { E.sfx('boss_dash', 0.9); if (!BS.charge.spin) anim(m, 'Walk', { restart: true, speed: 3.2 }); m.bx = m.c; }
    else { E.sfx('boss_jump', 0.9); anim(m, 'Walk', { restart: true, speed: 2.5 }); m.x0 = m.c; m.r0 = m.r; flag(m.c, m.r, 0); m.air = true; }   // 甲虫 Attack 片段自带的跳跃太高（会穿进守卫房顶上的土），砸地改用代码弧线 + 空中翻一圈
  }
  function actBoss(m, dt) {
    const BS = B.bossOf(m.kind), T = E.T(), h = H(); m.u += dt;
    if (m.move === 'bite') {
      const L = BS.bite.lunge, u = Math.min(1, m.u / L), k = Math.sin(u * Math.PI);
      m.ox = (h.c - m.c) * 0.45 * k * T; m.oy = (h.r - m.r) * 0.45 * k * T; m.sx = 1 + 0.1 * k;
      if (!m.hit && u >= 0.5) { m.hit = true; if (adj(m)) { E.hurt(m, BS.bite.dmg); E.fx('impact', h.x, h.y - T * 0.5, T / 320); } }
      if (u >= 1) {
        m.n++; anim(m, 'Idle');
        if (m.n < PH(m, BS.bite.times) && adj(m)) { m.combo = true; startBoss(m, 'bite'); m.combo = false; return; }
        m.n = 0; m.st = 'rec'; m.t = PH(m, BS.bite.rec) + PH(m, BS.gap);
      }
      return;
    }
    if (m.move === 'charge') {
      if (BS.charge.spin) { shellPose(m); m.oy = SHELLS[m.kind].drop[1] * T; m.ph = 0.42 * T; m.spin = (m.spin || 0) + dt * 900 * m.dir; m.rot = m.spin; }   // 打滚：一直转
      const sp = PH(m, BS.charge.speed) * dt; let nx = m.bx + m.dir * sp;
      // 撞到主角：主角在这一行、没跳起来 → 撞到就停（不晕）
      if (!m.hit && h.r === m.r && !E.air() && (m.dir > 0 ? nx + 0.75 >= h.c && m.bx < h.c : nx - 0.75 <= h.c && m.bx > h.c)) {
        m.hit = true; E.hurt(m, BS.charge.dmg); E.fx('impact', h.x, h.y - T * 0.5, T / 260); E.shake(0.2);
        m.bx = h.c - m.dir; setBossCell(m, Math.round(m.bx)); m.st = 'rec'; m.t = 0.5 + PH(m, BS.gap); m.spin = 0; anim(m, 'Idle', { restart: true }); return;
      }
      // 前面是墙 / 土 / 别的怪 → 撞墙晕
      const ahead = Math.round(m.bx) + m.dir;
      if (m.dir > 0 ? nx > Math.round(m.bx) : nx < Math.round(m.bx)) { if (!open(ahead, m.r) || monAt(ahead, m.r, m)) {
        m.bx = Math.round(m.bx); if (heroAt(m.bx, m.r)) m.bx -= m.dir;   // 主角跳过去后正好贴墙：守卫停在主角跟前撞墙（不和主角重叠）
        setBossCell(m, m.bx); m.st = 'stun'; m.t = PH(m, BS.charge.stun); m.starT = 0.1; m.spin = 0;
        E.sfx('boss_crash', 0.9); E.shake(0.32); E.fx('impact', (m.bx + 0.5 + m.dir * 0.55) * T, E.fy(m) - T * 0.55, T / 220); E.fx('smoke', (m.bx + 0.5 + m.dir * 0.5) * T, E.fy(m) - T * 0.4, T / 140);
        anim(m, 'Hit', { restart: true, onEnd: () => { if (m.st === 'stun') anim(m, 'Idle'); } }); return;
      } }
      m.bx = nx; setBossCell(m, Math.round(m.bx));
      if ((m.dustT = (m.dustT || 0) - dt) <= 0) { m.dustT = 0.08; E.fx('puff', (m.bx + 0.5 - m.dir * 0.6) * T, E.fy(m) - T * 0.12, T / 260); }
      return;
    }
    // 跳起砸地
    const air = PH(m, BS.slam.air), u = Math.min(1, m.u / air);
    m.bx = lerp(m.x0, m.tc, u); m.oy = -Math.sin(u * Math.PI) * BS.slam.h * T; if (m.tc !== m.x0) m.face = sgn(m.tc - m.x0);
    if (BS.slam.noFlip) { m.rot = -10 * Math.sin(u * Math.PI) * (m.face || 1); m.sy = 1 + 0.08 * Math.sin(u * Math.PI); }   // v0.21 堡垒龟：抬身重踏，不翻跟头
    else { m.rot = -360 * Math.min(1, u * 1.15) * (m.face || 1); m.ph = 0.55 * T; }   // 绕身体中心翻一圈
    if (u < 1) return;
    m.air = false; let land = m.tc;
    if (heroAt(land, m.r)) { if (!E.air()) E.hurt(m, BS.slam.dmg); const back = land - (sgn(m.tc - m.x0) || -m.face || 1); land = free(back, m.r, m) ? back : (free(land + (land - back), m.r, m) ? land + (land - back) : m.x0); }
    else if (monAt(land, m.r, m)) land = m.x0;
    m.bx = land; flag(m.c, m.r, 0); m.c = land; flag(m.c, m.r, 1);
    E.sfx('boss_slam', 1); E.shake(0.38); const lx = (land + 0.5) * T, ly = E.fy(m);
    E.fx('impact', lx, ly - T * 0.35, T / 200); E.fx('ring', lx, ly - T * 0.1, T / 60); E.fx('smoke', lx, ly - T * 0.3, T / 120);
    for (const d of [-1, 1]) waves.push({ x: land + 0.5, dir: d, go: 0, hit: false, t: 0, m });
    m.n++;
    if (m.n < PH(m, BS.slam.times)) { m.st = 'rec'; m.t = 0.35; m.chain = true; anim(m, 'Idle'); return; }
    m.n = 0; m.st = 'rec'; m.t = PH(m, BS.slam.rec) + PH(m, BS.gap); anim(m, 'Idle', { restart: true });
  }
  function setBossCell(m, c) { if (c === m.c) return; flag(m.c, m.r, 0); m.c = c; flag(m.c, m.r, 1); }

  /* 冲击波：沿第 48 行往两边跑，碰到墙 / 土停；碰到没跳起来的主角扣血 */
  const waves = [];
  function updateWaves(dt) {
    const h = H();
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i], BS = B.bossOf(w.m.kind); w.t += dt; const step = BS.slam.wave * dt; w.x += w.dir * step; w.go += step;
      const c = Math.floor(w.x);
      if (w.go > BS.slam.waveLen || !open(c, w.m.r) && !heroAt(c, w.m.r)) { waves.splice(i, 1); continue; }
      if (!w.hit && h.r === w.m.r && h.c === c && !E.air()) { w.hit = true; E.hurt(w.m, BS.slam.waveDmg); }
      if ((w.dustT = (w.dustT || 0) - dt) <= 0) { w.dustT = 0.07; E.fx('puff', w.x * E.T(), (w.m.r + 1) * E.T() - E.T() * 0.12, E.T() / 300); }
    }
  }
  MOBS.danger = () => {   // 机器人用：马上要被冲撞 / 冲击波打到 → 该跳了
    const h = H(), m = R().mons.find(q => q.boss && !q.dead && q.r === h.r); if (!m) return false;
    for (const w of waves) if (!w.hit && Math.abs(w.x - (h.c + 0.5)) < 1.2 && sgn(h.c + 0.5 - w.x) === w.dir) return true;
    if (m.move === 'charge' && ((m.st === 'wind' && m.t < 0.15) || (m.st === 'act' && Math.abs(m.bx - h.c) < 2.2)) && sgn(h.c - m.bx) === m.dir) return true;
    return false;
  };

  /* ---------- 每帧入口（game.js 对每只活着的怪调）---------- */
  MOBS.update = (m, dt) => { if (m.boss) updateBoss(m, dt); else updateMon(m, dt); };
  MOBS.tick = dt => updateWaves(dt);
  MOBS.reset = () => { waves.length = 0; };

  /* 画的位置：脚底世界坐标 + 姿势 */
  MOBS.pose = (m, dt) => {
    const T = E.T();
    let x, y;
    if (m.boss) { const bx = m.mv > 0 && m.mvKind === 'walk' ? lerp(m.fc, m.c, 1 - m.mv / m.mvT) : m.bx; x = (bx + 0.5) * T; y = (m.r + 1) * T; }
    else {
      const u = m.mv > 0 ? 1 - m.mv / m.mvT : 1, uu = m.mvKind === 'fall' ? u * u : u;
      x = lerp((m.fc + 0.5) * T, (m.c + 0.5) * T, uu); y = lerp((m.fr + 1) * T, (m.r + 1) * T, uu);
      if (m.mv > 0 && m.mvKind === 'hop') y -= Math.sin(u * Math.PI) * m.ai.hopH * T;
    }
    if (!m.fly && !(m.mv > 0)) { const f = E.floorAt(x, (m.r + 1) * T) - (m.r + 1) * T; m.fo += (f - m.fo) * Math.min(1, (dt || 0.016) * 14); }
    let lift = 0; if (m.fly) lift = (m.st === 'perch' ? 0.12 : (m.ai ? m.ai.hover : 0.3)) * T + Math.sin(E.time() * 5 + m.c) * T * 0.05;
    return { x: x + m.ox, y: y + (m.fly ? 0 : m.fo) + m.oy - lift, sx: m.sx, sy: m.sy, rot: m.rot, ph: m.ph || 0, warn: m.warn > 0 && (m.warn > 0.97 || Math.floor(E.time() * (m.warn > 0.6 ? 14 : 8)) % 2 === 0) };
  };

  /* 地面提示（画在怪下面、贴在地面上）：冲撞路线红箭头；砸地 / 蝙蝠俯冲的落点 = 红色地面标记
   * （照《洛克人 EXE》格子变红、《空洞骑士》《塞尔达》地面落点圈的做法：标记画在挨打的那格地上，不画在怪身上；
   *  收缩圈表示还在瞄准，锁定后变成实心亮红、不再动 = 诚实提示，躲出这格就打不到） */
  let redCross = null;
  function crossRed() {   // 准星素材（红 + 深色描边）只取形状，染成统一的警示红，外面再垫一圈深色描边保证在橙红土和暗洞里都看得清
    if (redCross) return redCross; const a = IMG.cross; if (!a.width) return null;
    const pad = 6, c = document.createElement('canvas'); c.width = a.width + pad * 2; c.height = a.height + pad * 2; const g = c.getContext('2d');
    const t = document.createElement('canvas'); t.width = a.width; t.height = a.height; const tg = t.getContext('2d');
    tg.drawImage(a, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = '#2a0805'; tg.fillRect(0, 0, t.width, t.height);
    for (let dx = -pad; dx <= pad; dx += 2) for (let dy = -pad; dy <= pad; dy += 2) if (dx * dx + dy * dy <= pad * pad) g.drawImage(t, pad + dx, pad + dy);
    tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, t.width, t.height); tg.drawImage(a, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = '#ff2416'; tg.fillRect(0, 0, t.width, t.height);
    g.drawImage(t, pad, pad);
    return redCross = c;
  }
  let redGlow = null;
  function glowRed() {   // 地面红光（一张 64px 径向渐变贴图，压扁后贴在那格地面上）
    if (redGlow) return redGlow; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,40,24,0.85)'); gr.addColorStop(0.6, 'rgba(255,30,16,0.55)'); gr.addColorStop(1, 'rgba(255,20,10,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return redGlow = c;
  }
  // 画一个地面落点标记：x = 格中心（屏幕），fy = 那格的地面线（屏幕）；u = 前摇进度 0→1；locked = 已锁定
  function groundMark(ctx, x, fy, u, locked) {
    const T = E.T(), cr = crossRed(), gl = glowRed(); if (!cr) return;
    const pulse = locked ? 1 : 0.75 + 0.25 * Math.abs(Math.sin(E.time() * 12));
    ctx.globalAlpha = (locked ? 0.95 : 0.7) * pulse; ctx.drawImage(gl, Math.round(x - T * 0.75), Math.round(fy - T * 0.24), Math.round(T * 1.5), Math.round(T * 0.48));   // 比主角脚底宽，主角站在上面也露得出来
    const s = T * (locked ? 1.0 : 1.0 + 0.6 * (1 - u)), sh = s * 0.42;   // 瞄准时从大圈收到一格宽，锁定后定住
    ctx.globalAlpha = locked ? 1 : 0.65 + 0.35 * pulse; ctx.drawImage(cr, Math.round(x - s / 2), Math.round(fy - sh / 2), Math.round(s), Math.round(sh)); ctx.globalAlpha = 1;
  }
  MOBS.drawUnder = (ctx, ox, cy) => {
    const T = E.T(), r = R(); if (!r) return;
    for (const q of r.mons) {   // 蝙蝠俯冲前摇：落点标记在它锁定的那格（就是主角站的格）地面上
      if (!q.fly || q.dead || q.st !== 'wind' || !q.ai) continue;
      groundMark(ctx, ox + (q.lc + 0.5) * T, (q.lr + 1) * T - cy, 1 - Math.max(0, q.t) / q.ai.wind, q.t <= 0.15);
    }
    const m = r.mons.find(q => q.boss && !q.dead && q.st === 'wind'); if (!m) return;
    const fy = (m.r + 1) * T - cy, blink = 0.55 + 0.45 * Math.abs(Math.sin(E.time() * 10));
    if (m.move === 'charge') {
      const ar = arrowRed(); if (!ar) return; let c = m.c + m.dir; const s = T * 0.42;
      ctx.globalAlpha = blink;
      for (let i = 0; i < 8 && (open(c, m.r) || heroAt(c, m.r)) && !monAt(c, m.r, m); i++, c += m.dir) { ctx.save(); ctx.translate(Math.round(ox + (c + 0.5) * T), Math.round(fy - T * 0.3)); if (m.dir > 0) ctx.scale(-1, 1); ctx.drawImage(ar, -s / 2, -s / 2, s, s); ctx.restore(); }
      ctx.globalAlpha = 1;
    } else if (m.move === 'slam') groundMark(ctx, ox + (m.tc + 0.5) * T, fy, 1 - Math.max(0, m.t) / m.windT, m.t <= 0.15);
  };
  MOBS.drawOver = (ctx, ox, cy) => {   // 冲击波：白色冲击环压扁成贴地的一道
    const T = E.T(), ring = A.img.ring, V = A.VFX.ring; if (!ring || !ring.width) return;
    for (const w of waves) {
      const i = Math.min(V[0] - 1, Math.floor(w.t * 40) % V[0]), sw = T * 0.95, sh = T * 0.5, x = ox + w.x * T, y = (w.m.r + 1) * T - cy - T * 0.2;
      ctx.globalAlpha = Math.max(0.3, 1 - w.go / B.bossOf(w.m.kind).slam.waveLen * 0.6); ctx.drawImage(ring, i * V[1], 0, V[1], V[2], Math.round(x - sw / 2), Math.round(y - sh / 2), Math.round(sw), Math.round(sh)); ctx.globalAlpha = 1;
    }
  };
})();
