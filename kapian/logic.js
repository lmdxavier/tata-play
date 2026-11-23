// kapian v1 规则逻辑：不碰页面，Node 可直接 require。数值集中在 CFG / MON / ST。
(function (root) {
'use strict';
const CFG = {
  W: 7, H: 9, pHp: 12, pAtk: 2, rooms: 9,
  reinfStart: 18, reinfEvery: 6, reinfMax: 4,
  xpLv: [0, 2, 5], rest: 1, budA: 2.5, budB: 1.25, reserve: 2, campHeal: 5, campXp: 2, appleHeal: 3,
  start: [3, 8],
};
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const SLOTS = ['move', 'bump', 'hurt', 'wait'];
const SLOT_NAME = { move: '走动', bump: '撞击', hurt: '受伤', wait: '原地' };

// 怪：pat = 红格形状；st = 打死给的贴纸
const MON = {
  slime:   { n: '史莱姆', img: 'Slime_Green',    hp: 2, atk: 2, pat: 'melee',  cost: 1, st: null, tip: '打面前 1 格' },
  wolf:    { n: '灰狼',   img: 'Wolf_Gray',      hp: 3, atk: 2, pat: 'melee',  cost: 2, st: 'dash', spd: 2, tip: '一回合走 2 格，打面前 1 格' },
  owl:     { n: '猫头鹰', img: 'Bird_Owl',       hp: 2, atk: 2, pat: 'line',   cost: 2, st: 'arrow', range: 5, ranged: 1, tip: '射一整条线（5 格）' },
  flizard: { n: '火蜥蜴', img: 'Lizard_Fire',    hp: 3, atk: 2, pat: 'breath', cost: 2, st: 'fire', tip: '喷火：面前 2 格' },
  buffalo: { n: '野牛',   img: 'Buffalo_Wild',   hp: 4, atk: 3, pat: 'charge', cost: 3, st: 'push', range: 6, ranged: 1, tip: '冲锋到撞上东西；撞墙晕 2 回合' },
  snake:   { n: '青蛇',   img: 'Snake_Green',    hp: 3, atk: 1, pat: 'melee',  cost: 2, st: 'venom', poison: 2, tip: '打 1 + 2 层毒' },
  bear:    { n: '灰熊',   img: 'Bear_Grizzly',   hp: 7, atk: 3, pat: 'melee',  cost: 3, st: 'punch', slow: 1, tip: '隔一回合才走一步' },
  crab:    { n: '石蟹',   img: 'Crab_Rock',      hp: 4, atk: 2, pat: 'wide',   cost: 2, st: 'sweep', tip: '横扫面前一排 3 格' },
  puffer:  { n: '刺豚',   img: 'Blowfish_Angry', hp: 3, atk: 2, pat: 'melee',  cost: 2, st: 'thorns', thorns: 1, tip: '撞它会被扎 1' },
  turtle:  { n: '塔龟',   img: 'Turtle_Tower',   hp: 3, atk: 2, pat: 'melee',  cost: 2, st: 'shell', armor: 1, tip: '受到伤害 -1' },
  octo:    { n: '章鱼',   img: 'Octopus_Ringed', hp: 3, atk: 2, pat: 'lob',    cost: 3, st: 'ink', range: 4, ranged: 1, tip: '往你站的地方丢墨，砸一排 3 格（往侧面躲）' },
  goat:    { n: '蘑菇羊', img: 'Goat_Mushroom',  hp: 3, atk: 2, pat: 'melee',  cost: 2, st: 'heal', healer: 1, tip: '喘气时给周围怪回 1' },
  beetle:  { n: '红甲虫', img: 'Beetle_Red',     hp: 2, atk: 3, pat: 'bomb',   cost: 2, st: 'quake', tip: '上下左右贴身就点火，下回合炸周围 3×3，炸完自己死（不给贴纸）' },
  hlizard: { n: '角蜥',   img: 'Lizard_Horn',    hp: 3, atk: 1, pat: 'tongue', cost: 2, st: 'tongue', range: 3, ranged: 1, tip: '舌头把 3 格内的你拉到面前' },
  king:    { n: '史莱姆王', img: 'Slime_Purple', hp: 30, atk: 3, pat: 'boss',  cost: 0, st: null, boss: 1, tip: '十字长线 / 召唤 / 重砸' },
};
const POOL = [ // 每档都有四个位置的来源
  ['slime', 'wolf', 'owl', 'snake', 'buffalo', 'puffer', 'turtle', 'goat', 'beetle'],
  ['slime', 'wolf', 'owl', 'snake', 'buffalo', 'puffer', 'turtle', 'goat', 'beetle', 'flizard', 'crab', 'bear', 'hlizard', 'octo'],
  ['wolf', 'owl', 'snake', 'buffalo', 'puffer', 'turtle', 'goat', 'beetle', 'flizard', 'crab', 'bear', 'hlizard', 'octo'],
];

// 贴纸：数组下标 = 等级 1/2/3
const ST = {
  dash:   { slot: 'move', n: '冲刺', from: 'wolf',    max: [5, 4, 3], on: 'step', bonus: [0, 1, 1] },
  arrow:  { slot: 'move', n: '羽箭', from: 'owl',     max: [3, 3, 2], on: 'step', dmg: [2, 3, 3] },
  fire:   { slot: 'move', n: '火迹', from: 'flizard', dur: [3, 4, 4], dmg: [1, 2, 2] },
  push:   { slot: 'bump', n: '击退', from: 'buffalo', dist: [1, 1, 2], bonus: [2, 3, 3] },
  venom:  { slot: 'bump', n: '毒牙', from: 'snake',   stacks: [4, 5, 6] },
  punch:  { slot: 'bump', n: '重拳', from: 'bear',    max: [3, 2, 2], on: 'bump', base: [1, 1, 2], bonus: [3, 4, 5] },
  sweep:  { slot: 'bump', n: '横扫', from: 'crab',    dmg: [2, 2, 3], back: [0, 1, 1] },
  thorns: { slot: 'hurt', n: '反刺', from: 'puffer',  dmg: [3, 4, 5], red: [1, 1, 1] },
  shell:  { slot: 'hurt', n: '龟壳', from: 'turtle',  max: [6, 5, 4], on: 'turn' },
  ink:    { slot: 'hurt', n: '墨汁', from: 'octo',    rad: [1, 1, 2], dmg: [2, 2, 3] },
  heal:   { slot: 'wait', n: '回血', from: 'goat',    amt: [4, 5, 5], uses: [2, 2, 3] },
  quake:  { slot: 'wait', n: '震地', from: 'beetle',  max: [4, 4, 3], on: 'turn', dmg: [2, 3, 3], knock: [0, 0, 1] },
  tongue: { slot: 'wait', n: '舌头', from: 'hlizard', max: [4, 4, 3], on: 'turn', stun: [1, 1, 1], dmg: [1, 2, 2] },
};
function stDesc(id, lv) {
  const s = ST[id], i = lv - 1;
  switch (id) {
    case 'dash': return `走 ${s.max[i]} 步充满；充满后朝一条线走，4 格内有怪且中间没挡 → 直接冲到它面前撞` + (s.bonus[i] ? `，伤害 +${s.bonus[i]}` : '');
    case 'arrow': return `每走 ${s.max[i]} 步，自动朝走的方向射一箭，打第一个挡住的 ${s.dmg[i]}`;
    case 'fire': return `每走一步，离开的格子着火 ${s.dur[i]} 回合；怪走进火里、站在火上每回合各受 ${s.dmg[i]}`;
    case 'push': return `撞完把怪推开 ${s.dist[i]} 格；推不动（墙、石头、别的怪）它额外受 ${s.bonus[i]}，挡它的怪受 1`;
    case 'venom': return `撞击加 ${s.stacks[i]} 层毒（每回合末受 1，层数 -1）`;
    case 'punch': return `撞击伤害 +${s.base[i]}；撞 ${s.max[i]} 次充满，充满后下一撞再 +${s.bonus[i]} 并打断蓄力`;
    case 'sweep': return `撞击时目标左右两格各受 ${s.dmg[i]}` + (s.back[i] ? '，身后一格也受' : '');
    case 'thorns': return `被打时，打你的怪受 ${s.dmg[i]}` + (s.red[i] ? `，你受到的伤害 -${s.red[i]}` : '');
    case 'shell': return `每回合充 1，${s.max[i]} 格充满时挡掉一整下伤害`;
    case 'ink': return `每次被打，周围 ${s.rad[i]} 圈的怪蓄力全部打断（下回合不动），并各受 ${s.dmg[i]}`;
    case 'heal': return `原地等：回 ${s.amt[i]} 血；每个房间 ${s.uses[i]} 次`;
    case 'quake': return `原地等（充满）：周围 8 格的怪受 ${s.dmg[i]}` + (s.knock[i] ? '并被推开 1 格' : '') + `；冷却 ${s.max[i]} 回合`;
    case 'tongue': return `原地等（充满）：上下左右四条线上最近的怪被拉到身边、打断蓄力，各受 ${s.dmg[i]}；冷却 ${s.max[i]} 回合`;
  }
  return '';
}

// ---------- 随机 ----------
function rnd(S) { // mulberry32
  let t = (S.rng = (S.rng + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (S, n) => Math.floor(rnd(S) * n);
const pick = (S, a) => a[ri(S, a.length)];
function shuffle(S, a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(S, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- 基础 ----------
const inb = (x, y) => x >= 0 && y >= 0 && x < CFG.W && y < CFG.H;
const wall = (S, x, y) => !inb(x, y) || S.tiles[y * CFG.W + x] === 1;
function unitAt(S, x, y) { for (const u of S.units) if (u.x === x && u.y === y && u.hp > 0) return u; return null; }
const free = (S, x, y) => !wall(S, x, y) && !unitAt(S, x, y);
const mons = S => S.units.filter(u => u.k === 'm' && u.hp > 0);
const player = S => S.p;
function lv(S, slot) { const xp = S.slots[slot].xp; return xp >= CFG.xpLv[2] ? 3 : xp >= CFG.xpLv[1] ? 2 : 1; }
function act(S, slot) { return S.slots[slot].active; }
function ev(S, e) { if (S.log) S.log.push(e); }

function newRun(seed) {
  const S = {
    rng: (seed >>> 0) || 1, seed: seed >>> 0, room: 0, phase: 'play', over: null,
    slots: {}, seen: {}, tiles: [], units: [], fire: {}, pending: [], turn: 0, killed: {},
    p: null, log: [], nid: 1, stats: { kills: 0, dmgTaken: 0, turns: 0, picks: [] },
    hp: CFG.pHp, maxhp: CFG.pHp, doors: null, offers: null, pickLeft: 0,
  };
  for (const s of SLOTS) S.slots[s] = { active: null, reserve: [], xp: 0, charge: 0, uses: 0 };
  enterRoom(S, genRoom(S, 1, 'normal'));
  return S;
}

// ---------- 房间生成 ----------
function connected(t, sp) {
  const W = CFG.W, H = CFG.H, seen = new Set([sp[1] * W + sp[0]]), q = [sp];
  while (q.length) { const [x, y] = q.shift(); for (const d of DIRS) { const a = x + d[0], b = y + d[1]; if (inb(a, b) && !t[b * W + a] && !seen.has(b * W + a)) { seen.add(b * W + a); q.push([a, b]); } } }
  let floor = 0; for (let i = 0; i < W * H; i++) if (!t[i]) floor++;
  return seen.size === floor;
}
function genRoom(S, idx, type) {
  const W = CFG.W, H = CFG.H, sp = CFG.start;
  const spec = { idx, type, tiles: null, units: [], terrain: null };
  if (type === 'camp') { spec.tiles = new Array(W * H).fill(0); return spec; }
  for (let tries = 0; tries < 50; tries++) {
    const t = new Array(W * H).fill(0);
    const terrain = type === 'boss' ? 'open' : (rnd(S) < 0.5 ? 'walls' : 'open');
    const nW = terrain === 'walls' ? 8 + ri(S, 5) : 2 + ri(S, 3);
    let placed = 0, guard = 0;
    while (placed < nW && guard++ < 200) {
      let x = ri(S, W), y = ri(S, H - 2);
      const d = DIRS[ri(S, 4)], len = 1 + ri(S, 3);
      for (let k = 0; k < len && placed < nW; k++) {
        const xx = x + d[0] * k, yy = y + d[1] * k;
        if (!inb(xx, yy) || Math.abs(xx - sp[0]) + Math.abs(yy - sp[1]) <= 2) continue;
        if (t[yy * W + xx] === 0) { t[yy * W + xx] = 1; placed++; }
      }
    }
    if (!connected(t, sp)) continue;
    spec.tiles = t; spec.terrain = terrain;
    const occ = new Set([sp[1] * W + sp[0]]);
    const spot = (ymin, ymax) => {
      for (let g = 0; g < 200; g++) { const x = ri(S, W), y = ymin + ri(S, ymax - ymin + 1); const i = y * W + x; if (!t[i] && !occ.has(i)) { occ.add(i); return [x, y]; } }
      return null;
    };
    if (type === 'boss') {
      spec.units.push({ k: 'm', type: 'king', x: 3, y: 1 }); occ.add(1 * W + 3);
      for (let i = 0; i < 2; i++) { const p = spot(0, 3); if (p) spec.units.push({ k: 'm', type: 'slime', x: p[0], y: p[1] }); }
      for (let i = 0; i < 2; i++) { const p = spot(2, 6); if (p) spec.units.push({ k: 'r', x: p[0], y: p[1] }); }
      return spec;
    }
    const nR = ri(S, 3);
    for (let i = 0; i < nR; i++) { const p = spot(1, 7); if (!p) continue; t[p[1] * W + p[0]] = 1; const ok = connected(t, sp); t[p[1] * W + p[0]] = 0; if (ok) spec.units.push({ k: 'r', x: p[0], y: p[1] }); }
    if (rnd(S) < 0.45) { const p = spot(2, 7); if (p) spec.units.push({ k: 'a', x: p[0], y: p[1] }); }
    const pool = POOL[idx <= 3 ? 0 : idx <= 6 ? 1 : 2];
    const species = shuffle(S, pool.slice()).slice(0, 2 + ri(S, 2));
    let budget = Math.round((CFG.budA + idx * CFG.budB) * (type === 'elite' ? 1.5 : 1));
    let guard2 = 0;
    while (budget > 0 && guard2++ < 50) {
      const opts = species.filter(s => MON[s].cost <= budget);
      if (!opts.length) { if (budget >= 1) { species.push('slime'); continue; } break; }
      const s = pick(S, opts), p = spot(0, 5); if (!p) break;
      spec.units.push({ k: 'm', type: s, x: p[0], y: p[1] }); budget -= MON[s].cost;
    }
    if (type === 'elite') { const ms = spec.units.filter(u => u.k === 'm'); if (ms.length) pick(S, ms).elite = 1; }
    return spec;
  }
  throw new Error('genRoom failed');
}

function enterRoom(S, spec) {
  S.room = spec.idx; S.roomType = spec.type; S.tiles = spec.tiles.slice(); S.terrain = spec.terrain;
  S.units = []; S.fire = {}; S.pending = []; S.turn = 0; S.reinfN = 0; S.killed = {}; S.doors = null; S.offers = null;
  if (spec.type === 'camp') { S.phase = 'camp'; return; }
  S.p = { id: 0, k: 'p', x: CFG.start[0], y: CFG.start[1], hp: S.hp, maxhp: S.maxhp, poison: 0 };
  S.units.push(S.p);
  for (const u of spec.units) {
    const n = { id: S.nid++, k: u.k, x: u.x, y: u.y, hp: 1 };
    if (u.k === 'm') {
      const d = MON[u.type];
      Object.assign(n, { type: u.type, hp: d.hp, atk: d.atk, tele: null, rest: 0, stun: 0, poison: 0, cd: 2, elite: u.elite || 0 });
      if (u.elite) { n.hp = Math.ceil(d.hp * 1.6); n.atk = d.atk + 1; }
      n.maxhp = n.hp;
    }
    S.units.push(n);
  }
  for (const s of SLOTS) {
    const sl = S.slots[s], a = sl.active;
    sl.charge = a && ST[a].on === 'turn' ? ST[a].max[lv(S, s) - 1] : 0;
    sl.uses = a === 'heal' ? ST.heal.uses[lv(S, s) - 1] : 0;
  }
  S.phase = 'play';
  // 开场：能打到的怪先亮红格（让第一步就有信息）
  for (const m of mons(S)) { const t = canHit(S, m, m.x, m.y); if (t) m.tele = t; }
}

// ---------- 红格 ----------
function lineTiles(S, x, y, d, range, stopUnits) {
  const out = [];
  for (let k = 1; k <= range; k++) {
    const a = x + d[0] * k, b = y + d[1] * k;
    if (wall(S, a, b)) break;
    out.push([a, b]);
    if (stopUnits && unitAt(S, a, b)) break;
  }
  return out;
}
function patTiles(S, m, x, y, tele) {
  const d = tele && tele.dir != null ? DIRS[tele.dir] : null;
  const def = MON[m.type];
  switch (tele.kind) {
    case 'melee': return lineTiles(S, x, y, d, 1, true);
    case 'breath': return lineTiles(S, x, y, d, 2, false);
    case 'wide': {
      const fx = x + d[0], fy = y + d[1]; if (wall(S, fx, fy)) return [];
      const out = [[fx, fy]];
      for (const s of [-1, 1]) { const a = fx + d[1] * s, b = fy + d[0] * s; if (!wall(S, a, b)) out.push([a, b]); }
      return out;
    }
    case 'line': case 'tongue': case 'charge': return lineTiles(S, x, y, d, def.range, false); // 红格画满整个射程：退到线上照样挨打
    case 'lob': { const out = []; const v = tele.vert; for (let k = -1; k <= 1; k++) { const a = tele.ax + (v ? 0 : k), b = tele.ay + (v ? k : 0); if (!wall(S, a, b)) out.push([a, b]); } return out; }
    case 'bomb': case 'slam': { const out = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if ((a || b) && !wall(S, x + a, y + b)) out.push([x + a, y + b]); return out; }
    case 'cross': { let out = []; for (const dd of DIRS) out = out.concat(lineTiles(S, x, y, dd, 9, false)); return out; }
    case 'summon': return [];
  }
  return [];
}
function teleTiles(S, m) { return m.tele ? patTiles(S, m, m.x, m.y, m.tele) : []; }
// 怪站在 (x,y) 时能不能打到主角；能就返回红格描述
function canHit(S, m, x, y) {
  const p = S.p, def = MON[m.type];
  const hasP = ts => ts.some(t => t[0] === p.x && t[1] === p.y);
  const kind = def.pat;
  if (kind === 'lob') return Math.abs(p.x - x) + Math.abs(p.y - y) <= def.range ? { kind, ax: p.x, ay: p.y, vert: Math.abs(p.y - y) >= Math.abs(p.x - x) ? 1 : 0 } : null;
  if (kind === 'bomb') return Math.abs(p.x - x) + Math.abs(p.y - y) <= 1 ? { kind } : null; // 上下左右贴身才点火（你也撞得到它）
  if (kind === 'boss') {
    if (Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= 1) return { kind: 'slam' };
    if (hasP(patTiles(S, m, x, y, { kind: 'cross' }))) return { kind: 'cross' };
    return null;
  }
  for (let di = 0; di < 4; di++) { const t = { kind, dir: di }; if (hasP(patTiles(S, m, x, y, t))) return t; }
  return null;
}

// ---------- 伤害 ----------
function hurtMon(S, m, amt, src) {
  if (!m || m.hp <= 0 || m.k !== 'm') return 0;
  if (MON[m.type].armor && src !== 'poison' && src !== 'fire') amt = Math.max(0, amt - MON[m.type].armor);
  if (amt <= 0) { ev(S, { t: 'block', id: m.id }); return 0; }
  m.hp -= amt; ev(S, { t: 'dmg', id: m.id, n: amt, src });
  if (m.hp <= 0) {
    m.hp = 0; m.tele = null;
    ev(S, { t: 'die', id: m.id, src });
    if (src !== 'self') { S.killed[m.type] = (S.killed[m.type] || 0) + 1; S.stats.kills++; }
  }
  return amt;
}
function stunMon(S, m, n) {
  if (!m || m.hp <= 0) return;
  if (m.tele) ev(S, { t: 'interrupt', id: m.id });
  m.tele = null; m.stun = Math.max(m.stun, n || 1);
}
function hurtPlayer(S, amt, attacker, extra) {
  const p = S.p; if (p.hp <= 0) return;
  const sh = S.slots.hurt, L = lv(S, 'hurt'), a = extra && extra.passive ? null : sh.active; // 刺豚被动刺不触发受伤位
  if (a === 'shell' && sh.charge >= ST.shell.max[L - 1]) { sh.charge = 0; ev(S, { t: 'shell', id: 0 }); return; }
  if (a === 'thorns' && ST.thorns.red[L - 1]) amt = Math.max(1, amt - ST.thorns.red[L - 1]);
  p.hp -= amt; S.stats.dmgTaken += amt; ev(S, { t: 'dmg', id: 0, n: amt, by: attacker ? attacker.id : null });
  if (extra && extra.poison) p.poison += extra.poison;
  if (a) ev(S, { t: 'trig', slot: 'hurt' });
  if (a === 'thorns' && attacker && attacker.hp > 0) { ev(S, { t: 'thorns', from: 0, to: attacker.id }); hurtMon(S, attacker, ST.thorns.dmg[L - 1], 'thorns'); }
  if (a === 'ink') {
    const r = ST.ink.rad[L - 1]; ev(S, { t: 'ink', r });
    for (const m of mons(S)) if (Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) <= r) { stunMon(S, m, 1); hurtMon(S, m, ST.ink.dmg[L - 1], 'ink'); }
  }
  if (p.hp <= 0) { p.hp = 0; ev(S, { t: 'pdie' }); }
}
function moveUnit(S, u, x, y, kind) {
  ev(S, { t: kind || 'move', id: u.id, fx: u.x, fy: u.y, x, y }); u.x = x; u.y = y;
  const f = u.k === 'm' && S.fire[y * CFG.W + x];
  if (f) { ev(S, { t: 'burn', id: u.id }); hurtMon(S, u, f.d, 'fire'); }
}

// 把怪往 d 方向推 n 格；推不动额外伤害
function pushMon(S, m, d, n, bonus) {
  for (let k = 0; k < n && m.hp > 0; k++) {
    const a = m.x + d[0], b = m.y + d[1];
    if (free(S, a, b)) { moveUnit(S, m, a, b, 'push'); continue; }
    const blk = unitAt(S, a, b);
    ev(S, { t: 'slam', id: m.id, x: a, y: b });
    hurtMon(S, m, bonus, 'push');
    if (blk && blk.k === 'm') hurtMon(S, blk, 1, 'push');
    break;
  }
}

// ---------- 主角行动 ----------
function legal(S, a) {
  if (S.phase !== 'play' || S.over) return false;
  if (a.t === 'wait') return true;
  if (a.t !== 'move') return false;
  const d = DIRS[a.d], x = S.p.x + d[0], y = S.p.y + d[1];
  if (wall(S, x, y)) return false;
  const u = unitAt(S, x, y);
  return !u || u.k === 'm' || u.k === 'a';
}
function actions(S) { const out = [{ t: 'wait' }]; for (let d = 0; d < 4; d++) if (legal(S, { t: 'move', d })) out.push({ t: 'move', d }); return out; }

function bump(S, m, d, bonus) {
  const p = S.p, bs = S.slots.bump, a = bs.active, L = lv(S, 'bump');
  let dmg = CFG.pAtk + (bonus || 0), big = false;
  if (a === 'punch') { dmg += ST.punch.base[L - 1]; if (bs.charge >= ST.punch.max[L - 1]) { dmg += ST.punch.bonus[L - 1]; big = true; bs.charge = 0; } else bs.charge++; }
  ev(S, { t: 'bump', id: 0, to: m.id, d, big });
  if (a) ev(S, { t: 'trig', slot: 'bump' });
  const thorns = MON[m.type].thorns;
  hurtMon(S, m, dmg, 'bump');
  if (big) stunMon(S, m, 1);
  if (a === 'venom' && m.hp > 0) { m.poison += ST.venom.stacks[L - 1]; ev(S, { t: 'poison', id: m.id }); }
  if (a === 'sweep') {
    const sd = ST.sweep.dmg[L - 1];
    const tgt = [[m.x + d[1], m.y + d[0]], [m.x - d[1], m.y - d[0]]];
    if (ST.sweep.back[L - 1]) tgt.push([m.x + d[0], m.y + d[1]]);
    ev(S, { t: 'sweep', tiles: tgt });
    for (const [x, y] of tgt) { const u = unitAt(S, x, y); if (u && u.k === 'm') hurtMon(S, u, sd, 'bump'); }
  }
  if (a === 'push' && m.hp > 0) pushMon(S, m, d, ST.push.dist[L - 1], ST.push.bonus[L - 1]);
  if (thorns) hurtPlayer(S, thorns, null, { passive: true });
}

function shootArrow(S, d, dmg) {
  const p = S.p, path = [];
  for (let k = 1; k < 10; k++) {
    const x = p.x + d[0] * k, y = p.y + d[1] * k;
    if (wall(S, x, y)) break;
    path.push([x, y]);
    const u = unitAt(S, x, y);
    if (u) { ev(S, { t: 'arrow', path }); if (u.k === 'm') hurtMon(S, u, dmg, 'arrow'); return; }
  }
  ev(S, { t: 'arrow', path });
}

function waitHasTarget(S, w) { // 震地 / 舌头 没有目标时原地等不放、不进冷却
  const p = S.p;
  if (w === 'quake') return mons(S).some(m => Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) === 1);
  if (w === 'tongue') return DIRS.some(d => { for (let k = 1; k < 10; k++) { const x = p.x + d[0] * k, y = p.y + d[1] * k; if (wall(S, x, y)) return false; const u = unitAt(S, x, y); if (u) return u.k === 'm'; } return false; });
  return true;
}
function step(S, a) {
  if (!legal(S, a)) return false;
  const p = S.p;
  S.stats.turns++;
  if (a.t === 'wait') {
    ev(S, { t: 'wait' });
    const ws = S.slots.wait, w = ws.active, L = lv(S, 'wait');
    if (w === 'heal' && ws.uses > 0 && p.hp < p.maxhp) {
      ws.uses--; const h = Math.min(ST.heal.amt[L - 1], p.maxhp - p.hp); p.hp += h; ev(S, { t: 'trig', slot: 'wait' }); ev(S, { t: 'heal', id: 0, n: h });
    } else if (w && w !== 'heal' && ws.charge >= ST[w].max[L - 1] && waitHasTarget(S, w)) {
      ws.charge = 0; ev(S, { t: 'trig', slot: 'wait' });
      if (w === 'quake') {
        ev(S, { t: 'quake' });
        for (const m of mons(S)) if (Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) === 1) {
          hurtMon(S, m, ST.quake.dmg[L - 1], 'quake');
          if (ST.quake.knock[L - 1] && m.hp > 0) { const dx = Math.sign(m.x - p.x), dy = Math.sign(m.y - p.y); if (free(S, m.x + dx, m.y + dy)) moveUnit(S, m, m.x + dx, m.y + dy, 'push'); }
        }
      } else if (w === 'tongue') {
        for (let di = 0; di < 4; di++) {
          const d = DIRS[di];
          for (let k = 1; k < 10; k++) {
            const x = p.x + d[0] * k, y = p.y + d[1] * k;
            if (wall(S, x, y)) break;
            const u = unitAt(S, x, y); if (!u) continue;
            if (u.k === 'm') {
              ev(S, { t: 'tongue', x, y });
              if (k > 1) moveUnit(S, u, p.x + d[0], p.y + d[1], 'pull');
              if (ST.tongue.stun[L - 1]) stunMon(S, u, 1);
              if (ST.tongue.dmg[L - 1]) hurtMon(S, u, ST.tongue.dmg[L - 1], 'tongue');
            }
            break;
          }
        }
      }
    }
  } else {
    const d = DIRS[a.d], x = p.x + d[0], y = p.y + d[1];
    const u = unitAt(S, x, y);
    const ms = S.slots.move, mv = ms.active, Lm = lv(S, 'move');
    if (u && u.k === 'm') bump(S, u, d, 0);
    else if (u && u.k === 'a') { u.hp = 0; const h = Math.min(CFG.appleHeal, p.maxhp - p.hp); p.hp += h; ev(S, { t: 'eat', id: u.id }); ev(S, { t: 'heal', id: 0, n: h }); }
    else {
      let dashed = false;
      if (mv === 'dash' && ms.charge >= ST.dash.max[Lm - 1]) {
        for (let k = 1; k <= 4; k++) {
          const a2 = p.x + d[0] * k, b2 = p.y + d[1] * k;
          if (wall(S, a2, b2)) break;
          const t = unitAt(S, a2, b2); if (!t) continue;
          if (t.k === 'm' && k >= 2) {
            ms.charge = 0; dashed = true; ev(S, { t: 'trig', slot: 'move' });
            moveUnit(S, p, a2 - d[0], b2 - d[1], 'dash');
            bump(S, t, d, ST.dash.bonus[Lm - 1]);
          }
          break;
        }
      }
      if (!dashed) {
        const ox = p.x, oy = p.y;
        moveUnit(S, p, x, y);
        if (mv === 'fire') { S.fire[oy * CFG.W + ox] = { t: ST.fire.dur[Lm - 1], d: ST.fire.dmg[Lm - 1] }; ev(S, { t: 'fireset', x: ox, y: oy }); }
        if (mv === 'dash') ms.charge = Math.min(ST.dash.max[Lm - 1], ms.charge + 1);
        if (mv === 'arrow') { ms.charge++; if (ms.charge >= ST.arrow.max[Lm - 1]) { ms.charge = 0; ev(S, { t: 'trig', slot: 'move' }); shootArrow(S, d, ST.arrow.dmg[Lm - 1]); } }
      }
    }
  }
  if (p.hp <= 0 || !mons(S).length) return finish(S);
  monsterPhase(S);
  return finish(S);
}

function finish(S) {
  S.units = S.units.filter(u => u.hp > 0 || u.k === 'p');
  S.hp = S.p.hp;
  if (S.p.hp <= 0) { S.over = 'lose'; S.phase = 'over'; ev(S, { t: 'lose' }); return true; }
  if (!mons(S).length) {
    S.pending = [];
    if (S.roomType === 'boss') { S.over = 'win'; S.phase = 'over'; ev(S, { t: 'win' }); return true; }
    for (const u of S.units) if (u.k === 'a' && u.hp > 0) { u.hp = 0; const h = Math.min(CFG.appleHeal, S.p.maxhp - S.p.hp); S.p.hp += h; S.hp = S.p.hp; ev(S, { t: 'eat', id: u.id }); if (h) ev(S, { t: 'heal', id: 0, n: h }); } // 清空时地上的肉自动吃掉
    S.phase = 'reward'; makeOffers(S); ev(S, { t: 'clear' });
  }
  return true;
}

// ---------- 怪行动 ----------
function distMap(S) {
  const W = CFG.W, D = new Array(W * CFG.H).fill(99), p = S.p, q = [[p.x, p.y]];
  D[p.y * W + p.x] = 0;
  while (q.length) {
    const [x, y] = q.shift(), c = D[y * W + x];
    for (const d of DIRS) {
      const a = x + d[0], b = y + d[1];
      if (wall(S, a, b) || D[b * W + a] <= c + 1) continue;
      const u = unitAt(S, a, b);
      if (u && (u.k === 'r' || u.k === 'a')) continue; // 怪可以排队绕过同伴
      D[b * W + a] = c + 1; q.push([a, b]);
    }
  }
  return D;
}
function strike(S, m) {
  const t = m.tele, def = MON[m.type]; m.tele = null;
  ev(S, { t: 'strike', id: m.id, kind: t.kind });
  if (t.kind === 'summon') return;
  if (t.kind === 'charge') {
    const d = DIRS[t.dir]; let blk = null, hitWall = false;
    for (let k = 0; k < def.range; k++) {
      const a = m.x + d[0], b = m.y + d[1];
      if (wall(S, a, b)) { hitWall = true; break; }
      const u = unitAt(S, a, b); if (u) { blk = u; break; }
      moveUnit(S, m, a, b, 'charge');
      if (m.hp <= 0) return;
    }
    if (blk && blk.k === 'p') hurtPlayer(S, m.atk, m);
    else if (blk && blk.k === 'm') hurtMon(S, blk, m.atk, 'ff');
    else if (blk || hitWall) { ev(S, { t: 'stunwall', id: m.id }); m.stun = 1; } // 加上喘气 1 回合 = 晕 2 回合
    return;
  }
  if (t.kind === 'tongue') {
    const ts = patTiles(S, m, m.x, m.y, t);
    let u = null; for (const [x, y] of ts) { const z = unitAt(S, x, y); if (z) { u = z; break; } }
    if (u && (u.k === 'p' || u.k === 'm')) {
      const d = DIRS[t.dir], fx = m.x + d[0], fy = m.y + d[1];
      ev(S, { t: 'tonguem', id: m.id, x: u.x, y: u.y });
      if (u.x !== fx || u.y !== fy) moveUnit(S, u, fx, fy, 'pull');
      if (u.k === 'p') hurtPlayer(S, m.atk, m); else hurtMon(S, u, m.atk, 'ff');
    }
    return;
  }
  const ts = patTiles(S, m, m.x, m.y, t);
  if (t.kind === 'line') ev(S, { t: 'shot', id: m.id, path: ts });
  for (const [x, y] of ts) {
    const u = unitAt(S, x, y); if (!u || u === m) continue;
    if (u.k === 'p') hurtPlayer(S, m.atk, m, { poison: def.poison });
    else if (u.k === 'm') hurtMon(S, u, m.atk, 'ff');
  }
  if (t.kind === 'bomb') { m.hp = 0; ev(S, { t: 'die', id: m.id, src: 'self', boom: true }); }
}
function aiMove(S, m) {
  const def = MON[m.type];
  if (def.slow && S.turn % 2) return;
  const D = distMap(S), W = CFG.W, steps = def.spd || 1;
  for (let s = 0; s < steps; s++) {
    const score = (x, y) => (canHit(S, m, x, y) ? 0 : 1000) + D[y * W + x] + (def.ranged && D[y * W + x] <= 1 ? 3 : 0);
    let best = null, bs = score(m.x, m.y);
    for (const d of DIRS) {
      const a = m.x + d[0], b = m.y + d[1];
      if (!free(S, a, b)) continue;
      const sc = score(a, b);
      if (sc < bs) { bs = sc; best = [a, b]; }
    }
    if (!best) break;
    moveUnit(S, m, best[0], best[1]);
    if (m.hp <= 0) return;
    const t = canHit(S, m, m.x, m.y);
    if (t) { m.tele = t; ev(S, { t: 'tele', id: m.id }); return; }
  }
}
function spawnTile(S) {
  const p = S.p, c = [];
  for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
    if (!(y === 0 || x === 0 || x === CFG.W - 1)) continue;
    if (!free(S, x, y) || Math.abs(x - p.x) + Math.abs(y - p.y) < 3) continue;
    if (S.pending.some(q => q.x === x && q.y === y)) continue;
    c.push([x, y]);
  }
  return c.length ? pick(S, c) : null;
}
function addMon(S, type, x, y) {
  const d = MON[type];
  const n = { id: S.nid++, k: 'm', type, x, y, hp: d.hp, maxhp: d.hp, atk: d.atk, tele: null, rest: 1, stun: 0, poison: 0, cd: 2, elite: 0 };
  S.units.push(n); ev(S, { t: 'spawn', id: n.id }); return n;
}
function monsterPhase(S) {
  S.turn++;
  const p = S.p;
  // 0 增援落地
  for (const q of S.pending) { if (free(S, q.x, q.y)) addMon(S, q.type, q.x, q.y); }
  S.pending = [];
  // 1 火、毒
  for (const k of Object.keys(S.fire)) {
    const f = S.fire[k], x = k % CFG.W, y = Math.floor(k / CFG.W), u = unitAt(S, x, y);
    if (u && u.k === 'm') { ev(S, { t: 'burn', id: u.id }); hurtMon(S, u, f.d, 'fire'); }
    if (--f.t <= 0) delete S.fire[k];
  }
  if (p.poison > 0) { p.hp -= 1; p.poison--; S.stats.dmgTaken++; ev(S, { t: 'dmg', id: 0, n: 1, src: 'poison' }); if (p.hp <= 0) { p.hp = 0; return; } }
  // 2 打红格
  const struck = new Set();
  for (const m of mons(S)) {
    if (!m.tele || m.hp <= 0) continue;
    strike(S, m); struck.add(m.id); if (m.hp > 0) m.rest = CFG.rest;
    if (p.hp <= 0) return;
  }
  // 3 其余怪
  for (const m of mons(S)) {
    if (struck.has(m.id) || m.hp <= 0) continue;
    if (m.rest > 0) {
      m.rest--;
      if (MON[m.type].healer) for (const o of mons(S)) if (o !== m && Math.max(Math.abs(o.x - m.x), Math.abs(o.y - m.y)) <= 1 && o.hp < o.maxhp) { o.hp++; ev(S, { t: 'heal', id: o.id, n: 1 }); }
      continue;
    }
    if (m.stun > 0) { m.stun--; continue; }
    if (MON[m.type].boss) {
      const t = canHit(S, m, m.x, m.y);
      if (t) { m.tele = t; ev(S, { t: 'tele', id: m.id }); continue; }
      if (--m.cd <= 0) {
        m.cd = 4; m.tele = { kind: 'summon' }; ev(S, { t: 'tele', id: m.id });
        for (let i = 0; i < 2; i++) { const s = spawnTile(S); if (s) { S.pending.push({ x: s[0], y: s[1], type: 'slime' }); ev(S, { t: 'warn', x: s[0], y: s[1] }); } }
        continue;
      }
    }
    const t = canHit(S, m, m.x, m.y);
    if (t) { m.tele = t; ev(S, { t: 'tele', id: m.id }); continue; }
    aiMove(S, m);
  }
  // 3.5 毒（怪行动之后才跳，撞上毒的那回合怪照样出手）
  for (const m of mons(S)) if (m.poison > 0) { hurtMon(S, m, 1, 'poison'); m.poison--; }
  // 4 增援预告
  if (S.roomType !== 'boss' && S.turn >= CFG.reinfStart && (S.turn - CFG.reinfStart) % CFG.reinfEvery === 0 && S.reinfN < CFG.reinfMax) {
    const s = spawnTile(S); if (s) { S.reinfN++; S.pending.push({ x: s[0], y: s[1], type: 'slime' }); ev(S, { t: 'warn', x: s[0], y: s[1] }); }
  }
  // 5 按回合充能
  for (const s of SLOTS) { const sl = S.slots[s], a = sl.active; if (a && ST[a].on === 'turn') sl.charge = Math.min(ST[a].max[lv(S, s) - 1], sl.charge + 1); }
  S.units = S.units.filter(u => u.hp > 0 || u.k === 'p');
}

// ---------- 奖励、贴纸管理 ----------
function makeOffers(S) {
  const sp = Object.keys(S.killed).filter(k => MON[k].st);
  const offers = shuffle(S, sp).slice(0, 3).map(k => ({ t: 'st', id: MON[k].st }));
  // 至少 2 张能选：不够就从这一段会出的怪里补（路上捡到的）
  const pool = shuffle(S, POOL[S.room <= 3 ? 0 : S.room <= 6 ? 1 : 2].filter(k => MON[k].st && !offers.some(o => o.id === MON[k].st)));
  while (offers.length < 2 && pool.length) offers.push({ t: 'st', id: MON[pool.pop()].st, found: 1 });
  if (S.killed.slime || !offers.length) offers.push({ t: 'xp' });
  S.offers = offers; S.pickLeft = S.roomType === 'elite' ? 2 : 1;
}
function owned(S, id) { const sl = S.slots[ST[id].slot]; return sl.active === id || sl.reserve.includes(id); }
function slotFull(S, slot) { const sl = S.slots[slot]; return sl.active && sl.reserve.length >= CFG.reserve; }
// 拿贴纸。melt：满了时熔掉哪张（'new' = 熔掉新拿的这张；或已有贴纸 id）。xpSlot：选经验时给哪个位置
function takeOffer(S, i, opt) {
  opt = opt || {};
  if (S.phase !== 'reward') return false;
  const o = S.offers[i]; if (!o) return false;
  if (o.t === 'xp') { const s = opt.xpSlot || 'bump'; S.slots[s].xp += 1; S.stats.picks.push('xp:' + s); }
  else {
    const id = o.id, slot = ST[id].slot, sl = S.slots[slot];
    S.stats.picks.push(id);
    if (owned(S, id)) sl.xp += 2;
    else {
      if (!S.seen[id]) { S.seen[id] = 1; sl.xp += 1; }
      if (S.noSt) sl.xp += 0;
      else if (!sl.active) sl.active = id;
      else if (sl.reserve.length < CFG.reserve) sl.reserve.push(id);
      else {
        let mt = opt.melt || 'new';
        if (mt !== 'new' && sl.active !== mt && !sl.reserve.includes(mt)) mt = 'new';
        if (mt === 'new') sl.xp += 2;
        else if (sl.active === mt) { sl.active = id; sl.xp += 2; } // 熔掉生效中的那张 → 新的直接上场
        else { melt(S, slot, mt, true); sl.reserve.push(id); }
      }
    }
  }
  S.offers.splice(i, 1);
  if (--S.pickLeft <= 0 || !S.offers.length) toFork(S);
  return true;
}
function melt(S, slot, id, internal) {
  const sl = S.slots[slot];
  if (sl.active === id) { sl.active = sl.reserve.shift() || null; }
  else { const k = sl.reserve.indexOf(id); if (k < 0) return false; sl.reserve.splice(k, 1); }
  sl.xp += 2; return true;
}
function swap(S, slot, k) { // 备用第 k 张换上场
  const sl = S.slots[slot]; if (k < 0 || k >= sl.reserve.length) return false;
  const a = sl.active; sl.active = sl.reserve[k];
  if (a) sl.reserve[k] = a; else sl.reserve.splice(k, 1);
  return true;
}
function toFork(S) {
  S.phase = 'fork'; S.offers = null;
  const idx = S.room + 1;
  if (idx >= CFG.rooms) { S.doors = [genRoom(S, idx, 'boss')]; return; }
  const types = ['normal'];
  const r = rnd(S);
  if (idx >= 3 && r < 0.45) types.push('elite');
  else if (idx >= 4 && r < 0.8) types.push('camp');
  else types.push('normal');
  S.doors = shuffle(S, types).map(t => genRoom(S, idx, t));
}
function chooseDoor(S, i) {
  if (S.phase !== 'fork' || !S.doors[i]) return false;
  const p = S.p; S.hp = p ? p.hp : S.hp;
  enterRoom(S, S.doors[i]); return true;
}
function camp(S, choice) { // 'heal' 或 位置名
  if (S.phase !== 'camp') return false;
  if (choice === 'heal') S.hp = Math.min(S.maxhp, S.hp + CFG.campHeal);
  else if (SLOTS.includes(choice)) S.slots[choice].xp += CFG.campXp;
  else return false;
  S.p && (S.p.hp = S.hp);
  toFork(S); return true;
}

const API = { CFG, DIRS, SLOTS, SLOT_NAME, MON, ST, POOL, stDesc, newRun, genRoom, enterRoom, step, legal, actions, teleTiles, patTiles, canHit,
  unitAt, wall, mons, lv, takeOffer, melt, swap, chooseDoor, camp, owned, slotFull, rnd };
if (typeof module !== 'undefined') module.exports = API; else root.L = API;
})(typeof window !== 'undefined' ? window : globalThis);
