// 货架整理：纯逻辑（格子、层、移动 / 调换、消除、道具、各种特殊货架、关卡生成 + 推演验证）。不依赖 cc，Node 可跑（tools/test_sim.mjs）。
// 格子 = layers[0] 是前排（3 个位，-1 = 空），layers[1..] 是后层；前排都空了，下一层整排顶上来。
// v3：满格 = 调换；cap=1 单个台座（只用中间位）；lock=N 锁链格（再消 N 组解锁）；hid[li] 问号层（顶到前排才显示）。
// v4：glass 玻璃柜（钥匙那组消掉才碎，碎之前当锁着）；shut 卷帘门（游戏按时间设 closed[c]，关着当锁着）；temp 暂存格（底栏独立一格）；
//     Level.pos 每格在货架上的位置（异形货架）；slide 左右平移的一排；orders 顾客订单；moveLimit 步数限制关；tier 松紧档。
// v11（docs\设计.md「v10 方案」，2026-11-27 用户拍板）：
//   ice[li][s] 冰冻（1 = 冻住）：不能拿、不能被调换；只能本格消——另外两个一样的放进这格凑齐 3 个（冻住的也算）就连冰一起消；相邻消除没作用。
//   gift[li][s] 礼盒倒计时（>0）：不能动、不算三连；相邻格每消一组 -1，到 0 拆开变成里面的商品。
//   cap=4 四格宽货架：4 个位，必须 4 个一样才消；quad = 只能在宽格 4 个一组消的种类（带 ×4 标，普通格放 3 个不消）。
//   bomb[li][s] = 种类 × 100 + 剩余步数：1 锁格炸弹（到 0 锁住所在格 BOMB_LOCK 组）/ 2 扣时炸弹（到 0 扣 BOMB_SEC 秒）/ 3 爆盘炸弹（到 0 这关失败）；
//     炸弹跟着商品走；含炸弹的一组消掉 = 拆除。每走一步（成功放下 / 调换）前排的炸弹 -1，锁着的格不减。
//   cat 分类格：只收这一类商品；mix = 混搭（同类不同款 3 个也消），否则同款（3 个一模一样才消）。
//   alt 翻面货架的另一面（flipK 步翻一次，flipAt = 还剩几步翻）；altB = 另一面的炸弹。
// v13 传送带（docs\设计.md「传送带」）：belt = 盘子在带子上的序号（0..BELT_N-1），每盘一层 3 个位，和普通格一样拿 / 放 / 调换 / 凑 3 个消；
//   转出屏幕的盘子 closed（拿不到也放不上，游戏按时间设，推演按「每步 BELT_SPM 秒」设）；盘子拿空 / 消空 = gone（从带子上掉下去，不再能放）。
export const SLOTS = 3;
export const KEY = 100;          // 钥匙商品的种类号（画成钥匙）
export const BOMB_LOCK = 3;      // 锁格炸弹爆了：所在格上锁链，再消 3 组解开
export const BOMB_SEC = 15;      // 扣时炸弹爆了：扣 15 秒
export const BOMB_MORE = 5;      // 爆盘炸弹失败后续命：炸弹回到 5 步
export const BELT_N = 8;         // v13 传送带：一圈 8 个盘子
export const BELT_T = 12;        // 转一圈 12 秒
export const BELT_VIS = 0.5;     // 同时露在屏幕上的是半圈
export const BELT_SPM = 1.5;     // 推演：每走一步按 1.5 秒算带子转了多少
/** 盘子 i 在 t 秒时的相位（0 = 刚从屏幕一边进来，BELT_VIS = 从另一边出去，1 = 转回来） */
export const beltPhase = (i: number, t: number) => ((i / BELT_N + t / BELT_T) % 1 + 1) % 1;
export type Layer = number[];
export interface Cell {
  layers: Layer[]; cap?: number; lock?: number; hid?: boolean[]; ice?: number[][]; gift?: number[][]; glass?: boolean; shut?: number; temp?: boolean; side?: number;   // side：合作模式这格属于谁（0 房主 / 1 好友）
  bomb?: number[][]; cat?: number; mix?: boolean; alt?: Layer[]; altB?: number[][]; flipK?: number; flipAt?: number; quad?: number[];
  belt?: number; gone?: boolean;   // v13 传送带盘子
}
export type Mv = [number, number, number, number];   // [从格, 从位, 到格, 到位]
export type LvKind = 'easy' | 'normal' | 'hard';
export type Tier = 'loose' | 'some' | 'tight' | 'very';
export type Teach = '' | 'lock' | 'shape' | 'column' | 'ice' | 'gift' | 'shutter' | 'temp' | 'mystery' | 'slide' | 'glass' | 'steps' | 'orders'
  | 'wide' | 'bombLock' | 'catSame' | 'bombTime' | 'flip' | 'catMix' | 'bombBoom' | 'belt';
export interface Level {
  n: number; cells: Cell[]; pos: number[][]; cols: number; time: number; hard: boolean; type: LvKind; tier: Tier; kinds: number; tutorial: boolean;
  sol: Mv[]; steps: number; greedy: boolean; teach: Teach; slide: number[]; orders: number[]; moveLimit: number; temp: number; big: boolean; feats: string[];
  daily?: number;   // 每日一图：UTC 天数（0 = 普通关）
}
/** 生成选项：salt 换一套盘面（同关号不同图）；daily = 每日一图（不教学、不限步、不订单、不暂存格，机制只用第 12 关前教过的） */
export interface GenOpt { salt?: number; daily?: boolean; noFit?: boolean }
/** 每日一图只用这关之前教过的机制（锁链 / 台座 / 冰冻 / 礼盒 / 卷帘门）；每日挑战也是打过这关才开 */
export const DAILY_MAX_INTRO = 12;
export type Ev =
  | { t: 'move'; fc: number; fs: number; tc: number; ts: number; kind: number; swap: number }
  | { t: 'clear'; c: number; kind: number; mixed?: boolean; n?: number }   // mixed：混搭分类格消的不同款；n = 4：宽格
  | { t: 'shift'; c: number }
  | { t: 'unlock'; c: number }
  | { t: 'ice'; c: number; s: number; left: number }                          // left 0 = 冰碎（本格凑齐消掉 / 锤子）
  | { t: 'gift'; c: number; s: number; kind: number; left?: number; from?: number }   // left > 0：倒计时 -1（from = 哪格消的，飞光起点）；0 / 没有 = 拆开
  | { t: 'glass'; c: number }
  | { t: 'unshut'; c: number }
  | { t: 'defuse'; c: number; s: number; type: number }                       // 炸弹拆除（c = -1：道具拿走的）
  | { t: 'bomb'; c: number; s: number; type: number }                         // 炸弹爆了
  | { t: 'boom' }                                                              // 爆盘：这关失败
  | { t: 'flip'; c: number }
  | { t: 'gone'; c: number }                                                  // 传送带盘子空了，掉下去
  | { t: 'win' };

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ri = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
function shuffle<T>(a: T[], r: () => number) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
export const isTriple = (l: Layer) => l[0] >= 0 && l[0] === l[1] && l[1] === l[2];
const isEmpty = (l: Layer) => l.every(k => k < 0);
const z3 = () => [0, 0, 0]; const f3 = () => [0, 0, 0];
const zs = (L: Layer[]) => L.map(l => l.map(() => 0));
// ---------------- 商品分类（分类货架用；只收形状一眼能认出的，每类至少 3 种）----------------
export const CAT_NAMES = ['', 'food', 'potion', 'music', 'treasure', 'toy'];
const CAT_OF: Record<number, number> = { 0: 1, 1: 1, 2: 1, 6: 1, 9: 1, 12: 1, 15: 1, 18: 1, 28: 1, 4: 2, 30: 2, 31: 2, 32: 2, 33: 2,
  13: 3, 20: 3, 26: 3, 29: 3, 16: 4, 36: 4, 37: 4, 38: 4, 39: 4, 14: 5, 17: 5, 25: 5, 27: 5 };
export const catOf = (k: number) => CAT_OF[k] || 0;
export const catKinds = (cat: number) => Object.keys(CAT_OF).map(Number).filter(k => CAT_OF[k] === cat);
export const copyCell = (c: Cell): Cell => ({
  layers: c.layers.map(l => l.slice()), cap: c.cap || 3, lock: c.lock || 0, hid: c.hid ? c.hid.slice() : c.layers.map(() => false),
  ice: c.ice ? c.ice.map(l => l.slice()) : zs(c.layers), gift: c.gift ? c.gift.map(l => l.map(v => +v)) : zs(c.layers), bomb: c.bomb ? c.bomb.map(l => l.slice()) : zs(c.layers),
  glass: !!c.glass, shut: c.shut || 0, temp: !!c.temp, ...(c.side !== undefined ? { side: c.side } : {}),
  ...(c.cat ? { cat: c.cat, mix: !!c.mix } : {}), ...(c.quad ? { quad: c.quad.slice() } : {}),
  ...(c.belt !== undefined ? { belt: c.belt, gone: !!c.gone } : {}),
  ...(c.alt ? { alt: c.alt.map(l => l.slice()), altB: c.altB ? c.altB.map(l => l.slice()) : zs(c.alt), flipK: c.flipK || 4, flipAt: c.flipAt || c.flipK || 4 } : {}),
});
/** 相邻：同一排左右相邻，或上下两排水平距离 < 1（异形货架错半格也算） */
export function adjacency(pos: number[][] | undefined, n: number): number[][] {
  const out: number[][] = Array.from({ length: n }, () => []);
  if (!pos) return out;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const pa = pos[a], pb = pos[b]; if (!pa || !pb) continue;
    const dx = Math.abs(pa[0] - pb[0]), dy = Math.abs(pa[1] - pb[1]);
    if ((dy === 0 && Math.abs(dx - 1) < 0.01) || (Math.abs(dy - 1) < 0.01 && dx < 0.99)) { out[a].push(b); out[b].push(a); }
  }
  return out;
}

export class Board {
  cells: Cell[]; pos?: number[][]; adj: number[][]; closed: boolean[]; team = false;   // team：合作推演用（锁链按两人一共消的组数算）
  quad = new Set<number>(); moves = 0; boomed = false; beltSim = false;   // beltSim：推演用，带子按步数转
  constructor(cells: Cell[], pos?: number[][]) {
    this.cells = cells.map(copyCell); this.pos = pos; this.adj = adjacency(pos, cells.length); this.closed = cells.map(() => false);
    for (const c of this.cells) if (c.quad) for (const k of c.quad) this.quad.add(k);
  }
  clone() { const b = new Board(this.cells, this.pos); b.closed = this.closed.slice(); b.team = this.team; b.moves = this.moves; b.boomed = this.boomed; b.beltSim = this.beltSim; return b; }
  front(c: number) { return this.cells[c].layers[0]; }
  cap(c: number) { return this.cells[c].cap || 3; }
  /** 不能拿也不能放：锁链没解 / 玻璃没碎 / 卷帘门关着 */
  locked(c: number) { const x = this.cells[c]; return (x.lock || 0) > 0 || !!x.glass || this.closed[c] || !!x.gone; }
  /** 传送带：按 t 秒设哪些盘子转出了屏幕（拿不到） */
  beltAt(t: number) { this.cells.forEach((x, c) => { if (x.belt !== undefined && !x.gone) this.closed[c] = beltPhase(x.belt, t) >= BELT_VIS; }); }
  syncBelt() { if (this.beltSim) this.beltAt(this.moves * BELT_SPM); }
  hasBelt() { return this.cells.some(x => x.belt !== undefined); }
  /** 冰冻或礼盒：这个商品不能拿、不能被调换（冰冻的照样算进本格的三个） */
  blocked(c: number, li: number, s: number) { const x = this.cells[c]; return !!((x.ice && x.ice[li] && x.ice[li][s] > 0) || (x.gift && x.gift[li] && x.gift[li][s])); }
  slotsOf(c: number) { const k = this.cap(c); return k === 1 ? [1] : k === 4 ? [0, 1, 2, 3] : [0, 1, 2]; }
  /** 这种商品几个一组（宽格专用的 4 个，其他 3 个） */
  groupOf(kind: number) { return this.quad.has(kind) ? 4 : 3; }
  /** 分类格只收本类 */
  accepts(c: number, kind: number) { const x = this.cells[c]; if (x.quad && !this.quad.has(kind)) return false; return !x.cat || catOf(kind) === x.cat; }   // v14：宽格只收橙点（宽格专用）商品
  remaining() { let n = 0; for (const c of this.cells) { for (const l of c.layers) for (const k of l) if (k >= 0) n++; if (c.alt) for (const l of c.alt) for (const k of l) if (k >= 0) n++; } return n; }
  done() { return this.remaining() === 0; }
  canPlace(c: number) { if (this.locked(c)) return false; const f = this.front(c); return this.slotsOf(c).some(s => f[s] < 0); }
  /** 这一排（这格的规则下）会不会消：宽格 4 个一样；混搭格 3 个同类；普通 3 个一样且不是宽格专用的种类；礼盒挡着不消，冰冻的照算 */
  layerClears(c: number, l: Layer, g?: number[]) {
    const x = this.cells[c], cap = this.cap(c);
    if (cap === 1) return false;
    for (let s = 0; s < l.length; s++) if (l[s] < 0 || (g && g[s])) return false;
    if (cap === 4) { for (let s = 1; s < l.length; s++) if (l[s] !== l[0]) return false; return true; }
    if (x.mix) return l.every(k => catOf(k) === x.cat);
    return l[0] === l[1] && l[1] === l[2] && !this.quad.has(l[0]);
  }
  tripleAt(c: number) { const x = this.cells[c]; return this.layerClears(c, x.layers[0], x.gift![0]); }
  /** 把 (fc,fs) 的商品放到 tc 格的 ts 位（-1 = 第一个空位）；ts 上有东西 = 调换。返回事件；不能放返回 null */
  move(fc: number, fs: number, tc: number, ts = -1): Ev[] | null {
    this.syncBelt();
    if (fc === tc || this.boomed || this.locked(fc) || this.locked(tc)) return null;
    const kind = this.front(fc)[fs]; if (kind < 0 || this.blocked(fc, 0, fs) || !this.accepts(tc, kind)) return null;
    const tf = this.front(tc); const ok = this.slotsOf(tc);
    if (ts < 0) { const e = ok.find(s => tf[s] < 0); ts = e === undefined ? -1 : e; }
    if (ts < 0 || ok.indexOf(ts) < 0) return null;
    const other = tf[ts]; if (other === kind) return null;
    if (other >= 0 && (this.blocked(tc, 0, ts) || !this.accepts(fc, other) || this.slotsOf(fc).indexOf(fs) < 0)) return null;
    const Bf = this.cells[fc].bomb![0], Bt = this.cells[tc].bomb![0]; const bk = Bf[fs]; Bf[fs] = Bt[ts] || 0; Bt[ts] = bk || 0;   // 炸弹跟着商品走
    this.front(fc)[fs] = other; tf[ts] = kind;
    const ev: Ev[] = [{ t: 'move', fc, fs, tc, ts, kind, swap: other }];
    const i0 = ev.length;
    this.settle(tc, ev); this.settle(fc, ev);
    this.cascade(ev, i0);
    this.tick(ev);
    if (this.done()) ev.push({ t: 'win' });
    return ev;
  }
  /** 消掉、空了顶上来（顶上来的刚好凑齐也消）；消的那组里有冰 = 冰碎，有炸弹 = 拆除 */
  settle(c: number, ev: Ev[]) {
    const cell = this.cells[c], L = cell.layers, H = cell.hid!, I = cell.ice!, G = cell.gift!, B = cell.bomb!;
    for (let guard = 0; guard < 20; guard++) {
      if (this.tripleAt(c)) {
        const kind = L[0][0], w = L[0].length; const mixed = !!cell.mix && L[0].some(k => k !== kind);
        for (let s = 0; s < w; s++) {
          if (I[0][s] > 0) { I[0][s] = 0; ev.push({ t: 'ice', c, s, left: 0 }); }
          if (B[0][s]) { ev.push({ t: 'defuse', c, s, type: Math.floor(B[0][s] / 100) }); B[0][s] = 0; }
        }
        L[0] = L[0].map(() => -1);
        const e: Ev = { t: 'clear', c, kind }; if (mixed) e.mixed = true; if (w === 4) e.n = 4; ev.push(e);
        continue;
      }
      if (isEmpty(L[0]) && L.length > 1) { L.shift(); H.shift(); I.shift(); G.shift(); B.shift(); H[0] = false; ev.push({ t: 'shift', c }); continue; }
      break;
    }
    if (cell.belt !== undefined && !cell.gone && L.length === 1 && isEmpty(L[0])) { cell.gone = true; this.closed[c] = false; ev.push({ t: 'gone', c }); }   // 空盘不留：掉下去
  }
  /** 新的消除带来的连带：相邻礼盒倒计时 -1（到 0 拆开）、锁链计数、钥匙碎玻璃；拆开后可能又凑成三个 → 再来一轮 */
  cascade(ev: Ev[], from: number) {
    let i = from;
    for (let guard = 0; guard < 30 && i < ev.length; guard++) {
      const fresh = ev.slice(i).filter(e => e.t === 'clear') as { t: 'clear'; c: number; kind: number }[]; i = ev.length;
      if (!fresh.length) break;
      const touched = new Set<number>();
      for (const e of fresh) {
        if (e.c < 0) continue;
        for (const t of this.adj[e.c]) {
          if (this.locked(t)) continue;
          const cell = this.cells[t], G = cell.gift![0];
          for (let s = 0; s < G.length; s++) if (G[s] > 0) { G[s]--; ev.push({ t: 'gift', c: t, s, kind: cell.layers[0][s], left: G[s], from: e.c }); if (!G[s]) touched.add(t); }
        }
      }
      if (!this.team && this.cells.some(x => x.side !== undefined)) { for (const sd of [0, 1]) this.lockTick(ev, fresh.filter(e => this.cells[e.c].side === sd).length, sd); }   // 合作对局：每人的手机只算自己这块的消除，对方的消除由 act.clr 补上（CoopSync）
      else this.lockTick(ev, fresh.length);
      if (fresh.some(e => e.kind === KEY)) this.cells.forEach((cell, c) => { if (cell.glass) { cell.glass = false; ev.push({ t: 'glass', c }); touched.add(c); } });
      for (const t of touched) this.settle(t, ev);
    }
  }
  /** 每走一步：前排炸弹 -1（锁着的格不减）、翻面货架倒数，到 0 翻面（翻过来刚好凑齐也消） */
  tick(ev: Ev[]) {
    this.moves++;
    let fire = false;
    this.cells.forEach((x, c) => {
      const B = x.bomb![0]; if (this.locked(c)) return;
      for (let s = 0; s < B.length; s++) {
        if (!B[s] || x.layers[0][s] < 0) continue;
        const type = Math.floor(B[s] / 100); let n = B[s] % 100; if (n <= 0) continue;
        n--; B[s] = type * 100 + n; if (n > 0) continue;
        ev.push({ t: 'bomb', c, s, type });
        if (type === 1) { B[s] = 0; x.lock = (x.lock || 0) + BOMB_LOCK; }
        else if (type === 2) B[s] = 0;
        else { this.boomed = true; fire = true; }
      }
    });
    if (fire) { ev.push({ t: 'boom' }); return; }
    const flipped: number[] = [];
    this.cells.forEach((x, c) => {
      if (!x.alt || !x.flipK || this.locked(c)) return;
      x.flipAt = (x.flipAt || x.flipK) - 1;
      if (x.flipAt <= 0) { x.flipAt = x.flipK; this.flipCell(c); ev.push({ t: 'flip', c }); flipped.push(c); }
    });
    if (flipped.length) { const i0 = ev.length; for (const c of flipped) this.settle(c, ev); this.cascade(ev, i0); }
  }
  flipCell(c: number) {
    const x = this.cells[c]; const a = x.alt!, ab = x.altB || zs(a);
    x.alt = x.layers; x.altB = x.bomb;
    x.layers = a.length ? a : [[-1, -1, -1]]; x.bomb = a.length ? ab : [[0, 0, 0]];
    x.hid = x.layers.map(() => false); x.ice = zs(x.layers); x.gift = zs(x.layers);
  }
  /** 订单关交完自动清场：拿走一组（不管规则） */
  sweep(kind: number, count: number) { return this.take(kind, count); }
  /** 爆盘失败后续命：爆了的炸弹回到 n 步，可以接着走 */
  bombMore(n = BOMB_MORE) { this.cells.forEach(x => x.bomb!.forEach(l => l.forEach((v, s) => { if (v && v % 100 === 0) l[s] = Math.floor(v / 100) * 100 + n; }))); this.boomed = false; }
  /** 每消一组，所有锁链格计数 -n；到 0 解锁 */
  lockTick(ev: Ev[], n: number, side = -1) {
    if (!n) return;
    this.cells.forEach((cell, c) => { if ((cell.lock || 0) > 0 && (side < 0 || cell.side === side)) { cell.lock = Math.max(0, cell.lock! - n); if (cell.lock === 0) ev.push({ t: 'unlock', c }); } });
  }
  unlock(c: number) { this.cells[c].lock = 0; }
  // ---------------- 合作模式（v7）：送货 / 收货 ----------------
  /** 合作：把我的 (fc,fs) 送到对方 tc 格的 ts 空位（只能放空位，不能调换）。我这边：拿走后顶上来 / 连带照算；对方那格不在这里消（由对方的手机收货时算） */
  give(fc: number, fs: number, tc: number, ts: number): Ev[] | null {
    const A = this.cells[fc], B = this.cells[tc];
    if (A.side === undefined || B.side === undefined || A.side === B.side || this.locked(fc) || this.locked(tc)) return null;
    const kind = this.front(fc)[fs]; if (kind < 0 || this.blocked(fc, 0, fs)) return null;
    if (this.slotsOf(tc).indexOf(ts) < 0 || this.front(tc)[ts] >= 0) return null;
    this.front(fc)[fs] = -1; this.front(tc)[ts] = kind;
    const ev: Ev[] = [{ t: 'move', fc, fs, tc, ts, kind, swap: -1 }];
    this.settle(fc, ev); this.cascade(ev, 1);
    return ev;
  }
  /** 合作：收到对方送来的 kind，想放 (c,s)。那个位置被占了（两边同时操作）就放这格别的空位 → 我这边别的空位 → 都满了就塞到这格最后面一层（东西不会丢） */
  receive(c: number, s: number, kind: number): { ev: Ev[]; c: number; s: number; back: boolean } {
    const side = this.cells[c].side;
    const ok = (ci: number, si: number) => !this.locked(ci) && this.slotsOf(ci).indexOf(si) >= 0 && this.front(ci)[si] < 0;
    let tc = -1, ts = -1;
    if (ok(c, s)) { tc = c; ts = s; }
    else { const e = this.slotsOf(c).find(q => ok(c, q)); if (e !== undefined) { tc = c; ts = e; } }
    if (tc < 0) {
      let best = -1e9;
      this.cells.forEach((x, ci) => { if (x.side !== side || x.temp) return; for (const q of this.slotsOf(ci)) if (ok(ci, q)) { const sc = this.front(ci).filter(k => k === kind).length * 10 - Math.abs(ci - c); if (sc > best) { best = sc; tc = ci; ts = q; } } });
    }
    if (tc < 0) {   // 全满：塞到最后一层
      const x = this.cells[c]; x.layers.push([-1, kind, -1]); x.hid!.push(false); x.ice!.push([0, 0, 0]); x.gift!.push([0, 0, 0]); x.bomb!.push([0, 0, 0]);
      return { ev: [], c, s: -1, back: true };
    }
    this.front(tc)[ts] = kind;
    const ev: Ev[] = [{ t: 'move', fc: -1, fs: -1, tc, ts, kind, swap: -1 }];
    this.settle(tc, ev); this.cascade(ev, 1);
    if (this.done()) ev.push({ t: 'win' });
    return { ev, c: tc, s: ts, back: false };
  }
  counts(frontOnly = false) {
    const m = new Map<number, number>();
    this.cells.forEach((c, ci) => { if (this.locked(ci)) return; for (let i = 0; i < c.layers.length; i++) { if (frontOnly && i > 0) break; for (const k of c.layers[i]) if (k >= 0) m.set(k, (m.get(k) || 0) + 1); } });
    return m;
  }
  /** 从没锁的格里拿走 count 个 kind（前排优先），带走它身上的冰 / 礼盒 / 炸弹；后层拿空就去掉；返回位置 [格, 层, 位] 和事件 */
  private take(kind: number, count: number): { picks: [number, number, number][]; ev: Ev[] } {
    const picks: [number, number, number][] = [];
    for (let li = 0; li < 9 && picks.length < count; li++)
      for (let c = 0; c < this.cells.length && picks.length < count; c++) {
        if (this.locked(c)) continue;
        const l = this.cells[c].layers[li]; if (!l) continue;
        for (let s = 0; s < l.length && picks.length < count; s++) if (l[s] === kind) picks.push([c, li, s]);
      }
    const ev: Ev[] = [];
    for (const [c, li, s] of picks) { const x = this.cells[c]; x.layers[li][s] = -1; x.ice![li][s] = 0; x.gift![li][s] = 0; if (x.bomb![li][s]) { if (li === 0) ev.push({ t: 'defuse', c, s, type: Math.floor(x.bomb![li][s] / 100) }); x.bomb![li][s] = 0; } }
    const nd = ev.length;
    for (let k = 0; k < picks.length / this.groupOf(kind); k++) ev.push({ t: 'clear', c: -1, kind });
    const i0 = ev.length;
    for (let c = 0; c < this.cells.length; c++) {
      const x = this.cells[c], L = x.layers;
      for (let li = L.length - 1; li >= 1; li--) if (isEmpty(L[li])) { L.splice(li, 1); x.hid!.splice(li, 1); x.ice!.splice(li, 1); x.gift!.splice(li, 1); x.bomb!.splice(li, 1); }
      this.settle(c, ev);
    }
    this.cascade(ev, nd);
    ev.splice(nd, i0 - nd);   // 道具本身那几组只用来扣锁链 / 碎玻璃，不当成格子事件
    if (this.done()) ev.push({ t: 'win' });
    return { picks, ev };
  }
  /** 磁铁：前排最多的一种，凑齐一组直接消（不够从后层拿；锁着的格不拿；宽格专用的种类拿 4 个） */
  magnet(): { kind: number; picks: [number, number, number][]; ev: Ev[] } | null {
    const fc = this.counts(true), all = this.counts();
    let best = -1, bs = -1;
    for (const [k, n] of all) { if (n < this.groupOf(k)) continue; const s = (fc.get(k) || 0) * 100 + n; if (s > bs) { bs = s; best = k; } }
    if (best < 0) return null;
    const r = this.take(best, this.groupOf(best));
    return { kind: best, picks: r.picks, ev: r.ev };
  }
  /** 魔法：点中的那种商品（没锁的格里）按一组的倍数全部清掉 */
  wand(kind: number): { kind: number; picks: [number, number, number][]; ev: Ev[] } | null {
    const g = this.groupOf(kind); const n = this.counts().get(kind) || 0; if (n < g || kind < 0) return null;
    const r = this.take(kind, Math.floor(n / g) * g);
    return { kind, picks: r.picks, ev: r.ev };
  }
  /** 锤子：砸锁链 / 玻璃 / 卷帘门 / 冰 / 礼盒；砸普通商品 = 清掉这种的一组 */
  hammer(c: number, s: number): { what: string; kind: number; picks: [number, number, number][]; ev: Ev[] } | null {
    const x = this.cells[c]; const ev: Ev[] = [];
    if ((x.lock || 0) > 0) { x.lock = 0; ev.push({ t: 'unlock', c }); return { what: 'lock', kind: -1, picks: [], ev }; }
    if (x.glass) { x.glass = false; ev.push({ t: 'glass', c }); return { what: 'glass', kind: -1, picks: [], ev }; }
    if (x.shut) { x.shut = 0; this.closed[c] = false; ev.push({ t: 'unshut', c }); return { what: 'shut', kind: -1, picks: [], ev }; }
    const k = x.layers[0][s]; if (k < 0) return null;
    if (x.ice![0][s] > 0) { x.ice![0][s] = 0; ev.push({ t: 'ice', c, s, left: 0 }); this.settle(c, ev); this.cascade(ev, 1); if (this.done()) ev.push({ t: 'win' }); return { what: 'ice', kind: k, picks: [], ev }; }
    if (x.gift![0][s]) { x.gift![0][s] = 0; ev.push({ t: 'gift', c, s, kind: k }); this.settle(c, ev); this.cascade(ev, 1); if (this.done()) ev.push({ t: 'win' }); return { what: 'gift', kind: k, picks: [], ev }; }
    const g = this.groupOf(k);
    if ((this.counts().get(k) || 0) < g) return null;
    // 点中的这个一定拿走，再按顺序补齐一组；锁链 / 玻璃按「消了一组」算
    const pre: Ev[] = []; if (x.bomb![0][s]) { pre.push({ t: 'defuse', c, s, type: Math.floor(x.bomb![0][s] / 100) }); x.bomb![0][s] = 0; }
    x.layers[0][s] = -1; x.ice![0][s] = 0; x.gift![0][s] = 0;
    const r = this.take(k, g - 1);
    const picks: [number, number, number][] = [[c, 0, s], ...r.picks];
    const ev2: Ev[] = [{ t: 'clear', c: -1, kind: k }]; this.settle(c, ev2); this.cascade(ev2, 0); ev2.shift();
    const all = [...pre, ...r.ev.filter(e => e.t !== 'win'), ...ev2]; if (this.done()) all.push({ t: 'win' });
    return { what: 'item', kind: k, picks, ev: all };
  }
  /** 洗牌：没锁的格里、没冻住 / 不是礼盒 / 不带炸弹的商品打乱重发，每层个数不变（分类格不动）；不让任何一层天生凑齐 */
  shuffle(r: () => number, side = -1) {   // side ≥ 0：合作模式只洗自己那块
    const items: number[] = [], spots: [number, number, number][] = [];
    this.cells.forEach((c, ci) => { if (this.locked(ci) || c.cat || (side >= 0 && c.side !== side)) return; c.layers.forEach((l, li) => l.forEach((k, s) => { if (k >= 0 && !this.blocked(ci, li, s) && !c.bomb![li][s]) { items.push(k); spots.push([ci, li, s]); } })); });
    for (let tries = 0; tries < 50; tries++) {
      shuffle(items, r);
      spots.forEach(([c, li, s], i) => { this.cells[c].layers[li][s] = items[i]; });
      let ok = true; this.cells.forEach((c, ci) => { if (side >= 0 && c.side !== side) return; c.layers.forEach((l, li) => { if (this.layerClears(ci, l, c.gift![li])) ok = false; }); });   // 合作只查自己那块（对方那块可能画着我刚送过去、还没消的三个）
      if (ok) return;
    }
  }
  key() { return this.cells.map((c, i) => (c.lock || 0) + (c.glass ? 'G' : '') + (this.closed[i] ? 'S' : '') + (c.gone ? 'X' : '') + (c.alt ? 'F' + c.flipAt + ':' + c.alt.map(l => l.join(',')).join('|') : '') + '#' + c.layers.map((l, li) => l.map((k, s) => k + (c.ice![li][s] ? 'i' : '') + (c.gift![li][s] ? 'g' + c.gift![li][s] : '') + (c.bomb![li][s] ? 'b' + c.bomb![li][s] : '')).sort().join(',')).join('|')).sort().join('/'); }
}

/** 走法打分（推演和提示共用）：凑齐 > 拿空一格露出后层 > 凑对 > 放空格；调换只在能凑出三个时考虑；往别的种类里塞、拆对子扣分。
 *  礼盒 = 不同种类、不能动；冰冻 = 本来的种类但不能动（把同款送进冰格就能消）；炸弹那组优先消；宽格只放宽格专用的种类；分类格只放本类 */
export function scoredMoves(b: Board, noise = 0, r: () => number = Math.random) {
  const out: { s: number; fc: number; fs: number; tc: number; ts: number }[] = [];
  const n = b.cells.length;
  const fl: number[] = [], lk: boolean[] = [], cap: number[] = [], deep: boolean[] = [], F: number[][] = [], mv: boolean[][] = [], bomb: boolean[][] = [], iceK: number[] = [];
  for (let c = 0; c < n; c++) {
    const x = b.cells[c], f = x.layers[0], G = x.gift![0], I = x.ice![0], B = x.bomb![0];
    lk.push(b.locked(c)); cap.push(b.cap(c)); deep.push(x.layers.length > 1);
    const Fc: number[] = [], mc: boolean[] = [], bc: boolean[] = []; let cnt = 0, ik = -1;
    for (let s = 0; s < f.length; s++) {
      const k = f[s]; if (k >= 0) cnt++;
      Fc.push(k >= 0 && G[s] ? -9 - c * 4 - s : k);   // 礼盒当成独一无二的种类（不和谁凑对）
      mc.push(k >= 0 && !G[s] && !I[s]); bc.push(k >= 0 && !!B[s]);
      if (k >= 0 && I[s]) ik = k;
    }
    F.push(Fc); mv.push(mc); bomb.push(bc); fl.push(cnt); iceK.push(ik);
  }
  const has = (k: number) => k >= 0 || k <= -9;
  const nearGift: boolean[] = b.cells.map((_, c) => b.adj[c].some(t => !lk[t] && b.cells[t].gift![0].some(v => v > 0)));   // 旁边有礼盒：在这里消能拆礼盒
  for (let tc = 0; tc < n; tc++) {
    if (lk[tc]) continue;
    const x = b.cells[tc], tf = F[tc], slots = b.slotsOf(tc), c1 = cap[tc] === 1, w4 = cap[tc] === 4, mix = !!x.mix;
    let empty = -1; for (const s of slots) if (!has(tf[s])) { empty = s; break; }
    const items: number[] = []; for (const s of slots) if (has(tf[s])) items.push(tf[s]);
    const tBomb = bomb[tc].some(v => v);
    for (let fc = 0; fc < n; fc++) {
      if (fc === tc || lk[fc]) continue; const ff = F[fc];
      for (let fs = 0; fs < ff.length; fs++) {
        const kd = ff[fs]; if (kd < 0 || !mv[fc][fs] || !b.accepts(tc, kd)) continue;
        const quad = b.quad.has(kd);
        if (empty >= 0) {
          const same = items.every(k => mix ? k >= 0 && catOf(k) === x.cat : k === kd);
          const fill = !c1 && same && items.length === slots.length - 1 && (w4 || mix || !quad);
          let s: number;
          if (fill) s = 100;
          else if (c1) s = 4;
          else if (items.length === 0) s = w4 && !quad ? -30 : 8;
          else if (same) s = w4 ? 50 : quad ? 20 : 45;
          else s = -25;
          if (w4 && !quad) s -= 40;                         // 宽格塞普通种类 = 堵死
          if (quad && !w4 && !fill) s -= 12;                 // 宽格专用的种类往宽格送
          if (fl[fc] === 1) s += deep[fc] ? 28 : 6;
          if (iceK[fc] >= 0 && iceK[fc] !== kd) s += 30;     // 把冰格里的杂货挪走，给同款腾位
          if (iceK[tc] >= 0 && iceK[tc] === kd) s += 70;     // 同款送进冰格（冰格里还有杂货也送：杂货另外挪走）
          if (fill && nearGift[tc]) s += 25;
          if (bomb[fc][fs]) s += fill ? 60 : same && items.length ? 20 : 0;
          if (tBomb && fill) s += 60;
          if (s < 100 && cap[fc] === 3) { let sm = 0; for (let q = 0; q < 3; q++) if (ff[q] === kd) sm++; if (sm >= 2) s -= 35; }
          if ((items.length === 0 || c1) && fl[fc] === 1 && !deep[fc]) s -= 40;   // 单个挪到空格 = 白走
          out.push({ s: s + (noise ? r() * noise : 0), fc, fs, tc, ts: empty });
        } else if (!c1 && !w4 && cap[fc] === 3) {   // 满格：调换（只在能凑出三个时考虑）
          let ra = -2, rb = -2; for (let q = 0; q < 3; q++) if (q !== fs) { if (ra === -2) ra = ff[q]; else rb = ff[q]; }
          const eqT = (a: number) => mix ? a >= 0 && catOf(a) === x.cat : a === kd;
          for (let ts = 0; ts <= 2; ts++) {
            const o = tf[ts]; if (o === kd || o <= -9 || !mv[tc][ts] || !b.accepts(fc, o)) continue;
            const triT = eqT(tf[(ts + 1) % 3]) && eqT(tf[(ts + 2) % 3]) && (mix || !quad);
            const fx = b.cells[fc]; const triF = o >= 0 && (fx.mix ? [ra, rb, o].every(k => k >= 0 && catOf(k) === fx.cat) : ra === o && rb === o && !b.quad.has(o));
            if (!triT && !triF) continue;
            out.push({ s: (triT && triF ? 140 : 95) + (bomb[fc][fs] && triT ? 60 : 0) + (noise ? r() * noise : 0), fc, fs, tc, ts });
          }
        }
      }
    }
  }
  out.sort((a, b) => b.s - a.s);
  return out;
}
/** 按解法回放，跟踪一开始在 c 格前排 s 位的那个商品，返回它在第几步被消掉（没消掉 = 0）。炸弹按这个定步数 */
export function clearStep(b0: Board, sol: Mv[], c: number, s: number): number {
  const b = b0.clone(); let pc = c, ps = s, hidden = false;
  for (let i = 0; i < sol.length; i++) {
    const [fc, fs, tc, ts] = sol[i];
    if (!hidden) { if (fc === pc && fs === ps) { pc = tc; ps = ts; } else if (tc === pc && ts === ps) { pc = fc; ps = fs; } }
    const ev = b.move(fc, fs, tc, ts); if (!ev) return 0;
    for (const e of ev) { if (e.t === 'clear' && e.c === pc && !hidden) return i + 1; if (e.t === 'flip' && e.c === pc) hidden = !hidden; }
  }
  return 0;
}
/** 贪心随机推演：成功返回走法，失败 null */
export function rollout(b0: Board, r: () => number, noise: number): Mv[] | null {
  const b = b0.clone(); const max = b.remaining() * 3 + 10; const out: Mv[] = [];
  for (let step = 0; step < max; step++) {
    if (b.done()) return out;
    b.syncBelt();
    const ms = scoredMoves(b, noise, r); if (!ms.length) return null;
    const m = ms[0]; if (!b.move(m.fc, m.fs, m.tc, m.ts)) return null; out.push([m.fc, m.fs, m.tc, m.ts]);
    if (b.boomed) return null;
  }
  return b.done() ? out : null;
}

// ---------------- 难度节奏（docs\设计.md「v4 方案」「难度方案 v4」） ----------------
/** 每种新东西第一次出现的关（那关是松关 + 开场教一次） */
export const INTRO = { lock: 3, shape: 4, column: 5, ice: 7, hourglass: 8, gift: 9, shutter: 12, temp: 14, hammer: 14, mystery: 16, slide: 18, glass: 22, steps: 24, orders: 26, wand: 28,
  wide: 31, bombLock: 33, catSame: 35, bombTime: 37, flip: 39, catMix: 41, bombBoom: 43, belt: 45 };   // v13 传送带：45 关教   // v11 新机制：单数关（双数关会撞上步数 / 订单关）
export const NEW_FEATS = ['wide', 'bombLock', 'catSame', 'bombTime', 'flip', 'catMix', 'bombBoom'] as const;
const TEACH_AT: Record<number, Teach> = { 3: 'lock', 4: 'shape', 5: 'column', 7: 'ice', 9: 'gift', 12: 'shutter', 14: 'temp', 16: 'mystery', 18: 'slide', 22: 'glass', 24: 'steps', 26: 'orders',
  31: 'wide', 33: 'bombLock', 35: 'catSame', 37: 'bombTime', 39: 'flip', 41: 'catMix', 43: 'bombBoom', 45: 'belt' };
export const teachOf = (n: number): Teach => TEACH_AT[n] || '';
export const isStepsLv = (n: number) => n >= INTRO.steps && (n - INTRO.steps) % 6 === 0;
export const isOrdersLv = (n: number) => n >= INTRO.orders && (n - INTRO.orders) % 6 === 0;
/** 时间系数：关卡时间 = 玩家每参考步秒数 × 参考步数 × 系数 */
export const TIER_K: Record<Tier, number> = { loose: 1.3, some: 1.0, tight: 0.9, very: 0.8 };
/** 步数限制关：给的步数 = 参考步数 × 系数（实测玩家实际步数约是参考步数的 1.4 倍） */
export const MOVES_K = 1.6;
let tightMemo: Map<number, Tier> | null = null;
/** 紧关表：第 10 关第一个紧关；之后隔 3–5 关一个，「有点紧 / 紧 / 很紧」轮换；教学关、步数关不紧（往后挪一关），不连续 5 关没有紧关 */
function tightTable(): Map<number, Tier> {
  if (tightMemo) return tightMemo;
  const m = new Map<number, Tier>(); m.set(10, 'tight');
  const gaps = [4, 3, 5, 4, 3, 4], grades: Tier[] = ['some', 'very', 'tight'];
  let p = 10;
  for (let i = 0; p < 2000; i++) {
    let q = p + gaps[i % gaps.length];
    while (teachOf(q) || isStepsLv(q)) q--;   // 往前挪，保证间隔不超过 5
    if (q <= p + 1) { q = p + gaps[i % gaps.length]; while (teachOf(q) || isStepsLv(q)) q++; }
    m.set(q, grades[i % grades.length]); p = q;
  }
  tightMemo = m; return m;
}
export function tierOf(n: number): Tier { if (n < 10) return 'loose'; return tightTable().get(n) || 'loose'; }
/** 玩家每「参考步」秒数的默认值（v3_cal 用户实测：中小货架约 1.25、大货架约 2.0） */
export const SPT_DEFAULT = { small: 1.25, big: 2.0 };
export function timeFor(steps: number, tier: Tier, spt: number) { return Math.max(30, Math.ceil(steps * spt * TIER_K[tier] / 5) * 5); }

/** 关卡参数（从关卡号算） */
export function params(n: number, opt: GenOpt = {}) {
  const salt = opt.salt || 0, daily = !!opt.daily;
  const tier: Tier = daily ? 'loose' : tierOf(n); const teach: Teach = daily ? '' : teachOf(n);
  const type: LvKind = tier === 'loose' ? 'easy' : tier === 'some' ? 'normal' : 'hard';
  const hard = tier === 'tight' || tier === 'very';
  let cells: number, depth: number;
  if (n <= 2) { cells = 6; depth = 2; }
  else if (n <= 6) { cells = n <= 4 ? 7 : 9; depth = 2; }
  else if (n <= 12) { cells = 10 + (n % 3); depth = 2; }
  else if (n <= 25) { cells = 11 + (n % 3); depth = 3; }
  else if (n <= 50) { cells = 13 + (n % 3); depth = 3; }
  else { cells = 14 + (n % 4); depth = 3; }
  if (tier === 'very') cells += 3; else if (tier === 'tight') cells += 2;
  cells = Math.min(17, cells);
  if (n === 3) cells = 6;   // 锁链教学关：小
  const free = n <= 4 ? 4 : 3;
  const unlock = Math.min(n < 40 ? 30 : 40, 8 + Math.floor(n * 0.8));
  // 特殊货架：教学关只出本关教的；其他关按概率挑，最多 2 种（30 关后 3 种），步数 / 订单关少一种
  const f = { lock: 0, column: 0, mystery: 0, ice: 0, gift: 0, shutter: 0, slide: 0, glass: 0 };
  const picked: (keyof typeof f)[] = [];
  if (teach === 'lock') f.lock = 1; else if (teach === 'column') f.column = 1; else if (teach === 'mystery') f.mystery = 1;
  else if (teach === 'ice') f.ice = 1; else if (teach === 'gift') f.gift = 1; else if (teach === 'shutter') f.shutter = 1;
  else if (teach === 'slide') f.slide = 1; else if (teach === 'glass') f.glass = 1;
  else if (!teach && n > INTRO.lock) {
    const r = rng(n * 131 + 7 + salt);
    const cand: [keyof typeof f, number, number][] = [['lock', INTRO.lock, 0.5], ['column', INTRO.column, 0.45], ['ice', INTRO.ice, 0.45], ['gift', INTRO.gift, 0.4],
      ['shutter', INTRO.shutter, 0.35], ['mystery', INTRO.mystery, 0.35], ['slide', INTRO.slide, 0.35], ['glass', INTRO.glass, 0.3]];
    let max = n < 30 || daily ? 2 : 3; if (!daily && (isStepsLv(n) || isOrdersLv(n))) max--;
    let got = 0;
    for (const [k, at, p] of shuffle(cand.slice(), r)) { if (got >= max) break; if (daily && at > DAILY_MAX_INTRO) continue; if (n > at && r() < p) { f[k] = 1; got++; picked.push(k); } }
  }
  // v11 新机制（31 关起，每种首次那关教一次）：每关最多 1 种（55%）；有新机制时旧机制少 1 种（别太乱）。用单独的随机数，不改旧机制的抽法
  let nf: string = (NEW_FEATS as readonly string[]).indexOf(teach) >= 0 ? teach : '';
  if (!nf && !teach && !daily && n > INTRO.wide) {
    const r2 = rng(n * 977 + 31 + salt);
    if (r2() < 0.55) { const ok = NEW_FEATS.filter(k => n > INTRO[k] && !(k === 'bombTime' && isStepsLv(n))); if (ok.length) nf = ok[Math.floor(r2() * ok.length)]; }
    const max0 = (n < 30 ? 2 : 3) - (isStepsLv(n) || isOrdersLv(n) ? 1 : 0);
    if (nf && picked.length >= max0) f[picked[picked.length - 1]] = 0;
  }
  // v13 传送带：45 关教；之后没抽到别的新机制的关里 30% 出（单独的随机数，不改别的关）；步数关不出（它靠时间）
  if (teach === 'belt') nf = 'belt';
  else if (!nf && !teach && !daily && n > INTRO.belt && !isStepsLv(n) && rng(n * 613 + 97 + salt)() < 0.3) {
    nf = 'belt'; const max0 = 3 - (isOrdersLv(n) ? 1 : 0); if (picked.length >= max0) f[picked[picked.length - 1]] = 0;
  }
  const locks = f.lock ? (tier === 'very' && n >= 30 ? 2 : 1) : 0;
  const lockN = n === INTRO.lock ? 3 : 3 + (n % 4);
  const cols = f.column ? (tier === 'very' && n >= 40 ? 2 : 1) : 0;
  const mystery = f.mystery ? (teach === 'mystery' ? 0.6 : 0.35) : 0;
  const ice = f.ice ? (teach === 'ice' ? 3 : 2 + (n % 3)) : 0;
  const iceL = n < 20 ? 1 : 2;
  const gift = f.gift ? (teach === 'gift' ? 3 : 2 + (n % 2)) : 0;
  const shut = f.shutter ? (n >= 40 ? 2 : 1) + (teach === 'shutter' ? 1 : 0) : 0;
  const temp = !daily && n >= INTRO.temp;
  return { cells: nf === 'belt' ? Math.max(6, cells - 3) : cells, belt: nf === 'belt' ? BELT_N : 0, depth, free, unlock, hard, type, tier, teach, locks, lockN, cols, mystery, ice, iceL, gift, shut, slide: !!f.slide, glass: !!f.glass, temp,
    nf, wide: nf === 'wide', quadN: nf === 'wide' ? (teach ? 2 : n >= 60 ? 3 + n % 2 : 3) : 0,   // v14：多层轮换，种类变多
    bombT: nf === 'bombLock' ? 1 : nf === 'bombTime' ? 2 : nf === 'bombBoom' ? 3 : 0, bombs: nf.startsWith('bomb') ? (teach ? 1 : 1 + (n >= 60 ? n % 2 : 0)) : 0,
    cat: nf === 'catSame' ? 1 : nf === 'catMix' ? 2 : 0, flips: nf === 'flip' ? (teach ? 1 : 1 + (n >= 60 ? n % 2 : 0)) : 0, flipK: teach === 'flip' ? 4 : 3 + (n % 3),
    giftN: teach === 'gift' ? 2 : n >= 40 ? 3 + (n % 2) : 2 + (n % 2),
    steps: !daily && isStepsLv(n), orders: !daily && isOrdersLv(n), shape: n >= INTRO.shape };
}

// ---------------- v15 货架排版（HuojiaGame.layout 和关卡生成共用）----------------
// 用户 2026-11-28 01:52（32 关截图）：货架缩到 0.58，手机上点不准 →「要有下限，不够就打回来重新设计」。
// 规则：最小屏（设计尺寸 720×1280）上货架缩放 ≥ MIN_K；暂存格不再单独占一行：有宽货架 → 放宽货架同一排右边；
// 否则放进最后一排的空位（那排不满、在整面货架宽度以内）；都放不下才单独一排。生成时低于 MIN_K 就换形状 / 少一格重来。
export const MIN_K = 0.85;
export const LAY = { baseW: 214, baseH: 128, gx: 4, gy: 4, pad: 14, sign: 72, wideW: 280 };
/** 每格在货架上的格位（x 以「格宽 + 间距」为单位，可以是小数；y = 第几排），盘子 = null。宽货架 + 暂存格同排时两个都挪开 */
export function layoutPos(L: { cells: Cell[]; pos: number[][]; temp: number; slide: number[] }): ([number, number] | null)[] {
  const n = L.cells.length, out: ([number, number] | null)[] = [];
  for (let c = 0; c < n; c++) out.push(L.cells[c].belt !== undefined || c === L.temp || !L.pos[c] ? null : [L.pos[c][0], L.pos[c][1]]);
  const t = L.temp; if (t < 0) return out;
  const ux = LAY.baseW + LAY.gx;
  const W = L.cells.findIndex(x => x.cap === 4 && !!x.quad);
  if (W >= 0 && out[W]) {   // 宽格（280）+ 暂存格（214）并排，整排居中
    const tot = LAY.wideW + LAY.gx + LAY.baseW;
    out[W] = [(-tot / 2 + LAY.wideW / 2) / ux, out[W]![1]]; out[t] = [(tot / 2 - LAY.baseW / 2) / ux, out[W]![1]]; return out;
  }
  const sh = out.filter(q => q) as [number, number][];
  const minX = Math.min(...sh.map(q => q[0])), maxX = Math.max(...sh.map(q => q[0])), maxY = Math.max(...sh.map(q => q[1]));
  const last = out.map((q, c) => ({ q, c })).filter(o => o.q && o.q[1] === maxY);
  if (!last.some(o => L.slide.indexOf(o.c) >= 0)) {
    const xs = last.map(o => o.q![0]);
    const r = Math.max(...xs) + 1, l = Math.min(...xs) - 1;
    if (r <= maxX + 1e-6) { out[t] = [r, maxY]; return out; }
    if (l >= minX - 1e-6) { out[t] = [l, maxY]; return out; }
  }
  out[t] = [(minX + maxX) / 2, maxY + 1]; return out;
}
/** 货架在屏幕上的缩放（和 HuojiaGame.layout 同一套算法）。W/H = 设计尺寸下的可见区域（最小屏 720×1280） */
export function fitK(L: { n: number; cells: Cell[]; pos: number[][]; temp: number; slide: number[]; orders: number[] }, W = 720, H = 1280, topCut = -1) {
  const P = layoutPos(L); const sh = P.map((q, c) => ({ q, c })).filter(o => o.q) as { q: [number, number]; c: number }[];
  const hw = (c: number) => (L.cells[c].cap === 4 && L.cells[c].quad ? LAY.wideW : L.cells[c].cap === 1 ? 128 : LAY.baseW) / 2 / (LAY.baseW + LAY.gx) + (L.slide.indexOf(c) >= 0 ? 0.5 : 0);
  const minX = Math.min(...sh.map(o => o.q[0] - hw(o.c))), maxX = Math.max(...sh.map(o => o.q[0] + hw(o.c))), maxY = Math.max(...sh.map(o => o.q[1]));
  const sg = L.cells.some(x => x.cap === 4 && x.quad) ? LAY.sign : 0;
  const ux = LAY.baseW + LAY.gx, uy = LAY.baseH + LAY.gy;
  const needW = (maxX - minX) * ux + LAY.pad * 2, needH = (maxY + 1) * uy - LAY.gy + LAY.pad * 2 + sg;
  const belt = L.cells.some(x => x.belt !== undefined);
  const top = H - 18, aT = top - (topCut >= 0 ? topCut : L.orders.length ? 262 : 160), aB = (L.n >= 3 ? 182 : 120) + (belt ? 180 + 30 + 12 : 0);
  return { k: Math.min(1.5, (Math.min(W, 760) - 12) / needW, (aT - aB) / needH), needW, needH, aT, aB, minX, maxX, maxY, sg };
}

/** 货架形状：每排 1–3 格，居中或阶梯对齐。返回每格 [x, y]（x 以格宽为单位，可以是半格；y 从上往下第几排），按从上到下、从左到右排好 */
export function makeShape(count: number, r: () => number, irregular: boolean, needTwo: boolean): { pos: number[][]; rows: number[] } {
  const build = (lens: number[], stair: boolean) => {
    const pos: number[][] = [];
    lens.forEach((L, y) => { const side = stair && L < 3 ? (y % 2 ? 1 : -1) : 0; const x0 = side < 0 ? -1 : side > 0 ? 1 - (L - 1) : -(L - 1) / 2; for (let j = 0; j < L; j++) pos.push([x0 + j, y]); });
    return pos;
  };
  if (!irregular) {
    const cols = count <= 4 ? 2 : 3; const lens: number[] = []; for (let k = count; k > 0; k -= cols) lens.push(Math.min(cols, k));
    return { pos: build(lens, false), rows: lens };
  }
  const minR = Math.ceil(count / 3);
  for (let tries = 0; tries < 200; tries++) {
    const R = Math.min(7, ri(r, Math.max(2, minR), minR + 2));
    if (count < R || count > R * 3) continue;
    const lens = Array(R).fill(1); let left = count - R;
    for (let g = 0; left > 0 && g < 500; g++) { const i = ri(r, 0, R - 1); if (lens[i] < 3) { lens[i]++; left--; } }
    if (left) continue;
    if (lens.every(L => L === 3) && tries < 150) continue;          // 规整矩形不要
    if (lens.filter(L => L === 1).length > 1) continue;              // 单格的排最多一排
    if (lens[0] === 1 && lens.length > 2 && tries < 150) continue;   // 顶上一格看着像漏了
    if (needTwo && lens.indexOf(2) < 0) continue;
    const stair = r() < 0.25;
    return { pos: build(lens, stair), rows: lens };
  }
  return makeShape(count, r, false, false);
}
/** 同形不同色的商品（药水、罐头、蘑菇、宝石）：同一关尽量只出一种（用户：看得眼花） */
const SHAPE_GROUP: Record<number, number> = { 4: 1, 30: 1, 31: 1, 32: 1, 33: 1, 3: 2, 34: 2, 7: 3, 35: 3, 38: 4, 39: 4 };
function goodsPool(unlock: number, goodsN: number, r: () => number) {
  const all = shuffle(Array.from({ length: Math.min(unlock, goodsN) }, (_, i) => i), r);
  const first: number[] = [], later: number[] = []; const seen = new Set<number>();
  for (const g of all) { const sg = SHAPE_GROUP[g]; if (sg && seen.has(sg)) later.push(g); else { first.push(g); if (sg) seen.add(sg); } }
  return first.concat(later);
}

/** 生成第 n 关（同一关号永远一样）。goodsN = 商品图种类数 */
export function makeLevel(n: number, goodsN: number, opt: GenOpt = {}): Level {
  const salt = opt.salt || 0;
  const base = { slide: [] as number[], orders: [] as number[], moveLimit: 0, temp: -1, feats: [] as string[] };
  if (n === 1) {   // 新手：拖一下触发三连锁——消掉 → 后层三个一样顶上来又消 → 再顶上来再消 → 过关
    return { ...base, n, cols: 2, pos: [[-0.5, 0], [0.5, 0]], time: 0, hard: false, type: 'easy', tier: 'loose', kinds: 3, tutorial: true, sol: [[1, 1, 0, 2]], steps: 1, greedy: true, teach: '', big: false, cells: [
      { layers: [[0, 0, -1], [1, 1, 1], [2, 2, 2]] }, { layers: [[-1, 0, -1]] }] };
  }
  const p = params(n, opt);
  const chainN = n <= 12 ? 1 : 2;   // 每关埋「一步触发连锁」的格子：第 2 层是三个一样的，前排清空它就顶上来自动消
  for (let attempt = 0; attempt < 600; attempt++) {
    const r = rng(n * 7919 + attempt * 104729 + 17 + salt);
    const N = Math.max(6, p.cells - Math.floor(attempt / 150));   // v15：缩放过不了 MIN_K 就先换形状，150 次还不行少一格
    const shape = makeShape(N, r, p.shape, p.slide);
    const ids = shuffle(Array.from({ length: N }, (_, i) => i), r);
    const colCells = ids.slice(0, p.cols);
    const isCol = (c: number) => colCells.indexOf(c) >= 0;
    const sizes: number[][] = [];    // 每格每层的商品数
    for (let c = 0; c < N; c++) {
      if (isCol(c)) { const d = n === INTRO.column ? 5 : ri(r, 4, 6); sizes.push(Array(d).fill(1)); }
      else sizes.push([SLOTS]);
    }
    for (let k = 0, g = 0; k < p.free && g < 999; k++, g++) { const c = ri(r, 0, N - 1); if (!isCol(c) && sizes[c][0] > 1) sizes[c][0]--; else k--; }
    const normal = sizes.map((_, i) => i).filter(i => !isCol(i));
    const backLayers = Math.round(normal.length * (p.depth - 1) * (0.55 + r() * 0.2));
    for (let k = 0, g = 0; k < backLayers && g < 999; k++, g++) {
      const c = normal[ri(r, 0, normal.length - 1)]; if (sizes[c].length >= p.depth) { k--; continue; }
      sizes[c].push(r() < 0.6 ? 3 : 2);
    }
    const chainCells: number[] = [];
    for (const c of shuffle(normal.filter(i => sizes[i].length >= 2), r)) { if (chainCells.length >= chainN) break; sizes[c][1] = 3; sizes[c][0] = 1; chainCells.push(c); }   // 前排只放 1 个：拿走它 = 一步触发连锁
    if (chainCells.length < chainN) continue;
    const used = new Set<number>([...chainCells]);
    const pick = (k: number) => { const out: number[] = []; for (const c of shuffle(normal.filter(i => !used.has(i)), r)) { if (out.length >= k) break; out.push(c); used.add(c); } return out.length === k ? out : null; };
    const lockCells = pick(p.locks); if (!lockCells) continue;
    for (const c of lockCells) { sizes[c][0] = 3; if (sizes[c].length < 2) sizes[c].push(3); }   // 锁链格：前排满 + 至少一层后层
    const glassCells = pick(p.glass ? 1 : 0); if (!glassCells) continue;
    for (const c of glassCells) { sizes[c][0] = 3; if (sizes[c].length < 2) sizes[c].push(3); }
    const shutCells = pick(p.shut); if (!shutCells) continue;
    for (const c of shutCells) if (sizes[c][0] < 2) sizes[c][0] = 2;
    const catCells = pick(p.cat ? 1 : 0); if (!catCells) continue;   // 分类格：最多 2 层、每层 2 个（混搭格 3 个同类一摆好就消）
    for (const c of catCells) sizes[c] = sizes[c].length > 1 ? [2, 2] : [2];
    const W = p.wide ? N : -1;   // 四格宽货架：单独一排放在货架最下面
    // v14 宽格多层轮换（用户 2026-11-27 22:16）：每层放一种橙点商品 2–3 个，消完一种露出下一种；其余几个散到别的格
    const wideCnt: number[] = p.wide ? Array.from({ length: p.quadN }, (_, li) => p.teach === 'wide' ? (li === 0 ? 3 : 2) : ri(r, 2, 3)) : [];
    if (p.wide) sizes.push(wideCnt);
    const B0 = sizes.length; for (let i = 0; i < p.belt; i++) sizes.push([SLOTS]);   // v13 传送带：每盘开局都是满的 3 个
    let total = sizes.reduce((s, l) => s + l.reduce((a, b) => a + b, 0), 0);
    // 凑成 3 的倍数：从普通格后层减（连锁层不动）
    const Q = p.quadN;   // 宽格专用的种类数（每种 4 个）
    for (let c = 0; (total - 4 * Q) % 3 !== 0 && c < 999; c++) { const ci = normal[c % normal.length], L = sizes[ci], li = L.length - 1; if (L.length > 1 && L[li] > 1 && !(li === 1 && chainCells.indexOf(ci) >= 0)) { L[li]--; total--; } }
    if ((total - 4 * Q) % 3 !== 0) continue;
    const kinds = (total - 4 * Q) / 3;
    if (p.locks && kinds - chainN < p.lockN * 2 + 3) continue;
    const pool = goodsPool(p.unlock, goodsN, r);
    const groups: number[] = []; for (let k = 0; k < kinds; k++) groups.push(pool[k % pool.length]);
    if (p.glass) groups[kinds - 1] = KEY;   // 最后一组换成钥匙（不会是连锁组：连锁组在最前面）
    let catC = 0;
    if (p.cat) {   // 分类格：保证这关有这一类的 3 种（换掉普通组，不动连锁组 / 钥匙）
      const lim = Math.min(p.unlock, goodsN); const cands = [1, 3, 5, 4, 2].filter(cc => catKinds(cc).filter(k => k < lim).length >= 3);
      if (!cands.length) continue;
      catC = cands[ri(r, 0, cands.length - 1)];
      let gi = chainN;
      for (const k of shuffle(catKinds(catC).filter(k => k < lim), r).slice(0, 3)) { if (groups.indexOf(k) >= 0) continue; while (gi < kinds && (groups[gi] === KEY || catOf(groups[gi]) === catC)) gi++; if (gi >= kinds) break; groups[gi++] = k; }
      if (new Set(groups.filter(k => catOf(k) === catC)).size < 3) continue;
    }
    const quadK: number[] = []; for (const k of pool) { if (quadK.length >= Q) break; if (groups.indexOf(k) < 0 && !catOf(k)) quadK.push(k); }   // 宽格专用：和普通组不重复、不是分类商品
    if (quadK.length < Q) continue;
    const items: number[] = [];
    for (const g of groups.slice(chainCells.length)) items.push(g, g, g);
    quadK.forEach((k, li) => { for (let i = wideCnt[li]; i < 4; i++) items.push(k); });
    const wideL: Layer[] = quadK.map((k, li) => { const l = [-1, -1, -1, -1]; for (const s of shuffle([0, 1, 2, 3], r).slice(0, wideCnt[li])) l[s] = k; return l; });
    shuffle(items, r);
    let ip = 0, bad = false;
    const cells: Cell[] = sizes.map((L, c) => {
      const col = isCol(c);
      const layers = L.map((cnt, li) => {
        const ch = li === 1 ? chainCells.indexOf(c) : -1;
        if (ch >= 0) { const g = groups[ch]; return [g, g, g]; }
        const wd = c === W; if (wd) return wideL[li].slice(); const l = [-1, -1, -1]; const ps = col ? [1] : shuffle(wd ? [0, 1, 2, 3] : [0, 1, 2], r).slice(0, cnt);
        for (const s of ps) l[s] = items[ip++];
        return l;
      });
      const hidOn = p.mystery > 0 && !col && L.length >= 2 && chainCells.indexOf(c) < 0 && r() < p.mystery && c !== W && catCells.indexOf(c) < 0;
      return { layers, cap: col ? 1 : c === W ? 4 : 3, ...(c === W ? { quad: quadK } : {}), ...(p.belt && c >= B0 ? { belt: c - B0 } : {}), lock: lockCells.indexOf(c) >= 0 ? p.lockN : 0, hid: layers.map((_, li) => hidOn && li >= 1),
        ice: zs(layers), gift: zs(layers), glass: glassCells.indexOf(c) >= 0, shut: shutCells.indexOf(c) >= 0 ? 1 + shutCells.indexOf(c) : 0 };
    });
    // 钥匙不能在玻璃柜里（否则解不开）：和外面的普通商品换
    for (const gc of glassCells) cells[gc].layers.forEach((l, li) => l.forEach((k, s) => {
      if (k !== KEY) return;
      for (let g = 0; g < 200; g++) { const oc = normal[ri(r, 0, normal.length - 1)]; if (glassCells.indexOf(oc) >= 0 || chainCells.indexOf(oc) >= 0) continue; const ol = cells[oc].layers[0]; const os = ri(r, 0, 2); if (ol[os] >= 0 && ol[os] !== KEY) { l[s] = ol[os]; ol[os] = KEY; break; } }
    }));
    cells.forEach((c, ci) => c.layers.forEach((l, li) => { if (ci !== W && isTriple(l) && !(li === 1 && chainCells.indexOf(ci) >= 0)) bad = true; }));
    for (const gc of glassCells) if (cells[gc].layers.some(l => l.indexOf(KEY) >= 0)) bad = true;
    if (bad) continue;
    for (const ci of catCells) {   // 分类格：里面的东西和别的格里的本类商品对换（个数不变）
      const x = cells[ci]; x.cat = catC; x.mix = p.cat === 2;
      x.layers.forEach(l => l.forEach((k, s) => {
        if (k < 0 || catOf(k) === catC) return;
        for (let g = 0; g < 400; g++) {
          const oc = normal[ri(r, 0, normal.length - 1)]; if (oc === ci || chainCells.indexOf(oc) >= 0 || glassCells.indexOf(oc) >= 0) continue;
          const ol = cells[oc].layers[ri(r, 0, cells[oc].layers.length - 1)]; const os = ri(r, 0, ol.length - 1);
          if (ol[os] >= 0 && catOf(ol[os]) === catC) { l[s] = ol[os]; ol[os] = k; break; }
        }
      }));
      if (x.layers.some(l => l.some(k => k >= 0 && catOf(k) !== catC))) bad = true;
    }
    if (catCells.length) cells.forEach((c, ci) => c.layers.forEach((l, li) => { if (ci !== W && isTriple(l) && !(li === 1 && chainCells.indexOf(ci) >= 0)) bad = true; }));
    if (bad) continue;
    if (W >= 0) cells[W].layers[0].forEach((k, s, l) => {   // 宽格前排一开始只放宽格专用的种类（别一上来就堵着）
      if (k < 0 || quadK.indexOf(k) >= 0) return;
      for (let g = 0; g < 400; g++) {
        const oc = normal[ri(r, 0, normal.length - 1)]; if (chainCells.indexOf(oc) >= 0 || glassCells.indexOf(oc) >= 0 || catCells.indexOf(oc) >= 0) continue;
        const ol = cells[oc].layers[ri(r, 0, cells[oc].layers.length - 1)]; const os = ri(r, 0, ol.length - 1);
        if (quadK.indexOf(ol[os]) >= 0) { l[s] = ol[os]; ol[os] = k; break; }
      }
    });
    if (W >= 0 && cells.some((c, ci) => c.layers.some((l, li) => isTriple(l) && ci !== W && quadK.indexOf(l[0]) < 0 && !(li === 1 && chainCells.indexOf(ci) >= 0)))) continue;
    const flipCells: number[] = [];   // 翻面货架：后面那层变成背面
    if (p.flips) {
      for (const ci of shuffle(normal.filter(i => !used.has(i) && cells[i].layers.length >= 2 && !cells[i].hid!.some(h => h)), r)) {
        if (flipCells.length >= p.flips) break;
        const x = cells[ci]; x.alt = x.layers.slice(1); x.layers = [x.layers[0]]; x.hid = [false]; x.ice = [z3()]; x.gift = [f3()]; x.flipK = p.flipK; x.flipAt = p.flipK; flipCells.push(ci); used.add(ci);
      }
      if (flipCells.length < p.flips) continue;
    }
    const pos0 = shape.pos.map(q => q.slice()); if (W >= 0) pos0.push([0, Math.max(...pos0.map(q => q[1])) + 1]);
    // 冰冻 / 礼盒：放在普通格的前排商品上（不放连锁格、锁、玻璃、卷帘门、台座）
    const plain = normal.filter(i => !used.has(i));
    const spots: [number, number][] = []; for (const c of plain) for (let s = 0; s < 3; s++) if (cells[c].layers[0][s] >= 0 && cells[c].layers[0][s] !== KEY) spots.push([c, s]);
    shuffle(spots, r);
    const perCell = new Map<number, number>();
    let si = 0;
    const place = (k: number, fn: (c: number, s: number) => void) => { let got = 0; for (; si < spots.length && got < k; si++) { const [c, s] = spots[si]; if ((perCell.get(c) || 0) >= 1 || cells[c].layers[0][s] < 0) continue; perCell.set(c, 1); fn(c, s); got++; } return got === k; };
    // v11 冰冻：同款至少还有 1 个在别的格的前排（不然推演和玩家都只能干等），冰格前排最多 2 个
    const frontHas = (k: number, not: number) => normal.some(o => o !== not && !used.has(o) && cells[o].layers[0].indexOf(k) >= 0);
    let icePl = 0;
    for (let q = si; q < spots.length && icePl < p.ice; q++) { const [c, s] = spots[q]; if (perCell.has(c)) continue; const k = cells[c].layers[0][s]; if (!frontHas(k, c)) continue;
      const L0 = cells[c].layers[0]; if (L0.filter(v => v >= 0).length > 2) { const o = [0, 1, 2].find(t => t !== s && L0[t] >= 0)!; const oc = plain.find(pc => pc !== c && !perCell.has(pc) && cells[pc].layers[0].some(v => v < 0) && cells[pc].layers[0].filter(v => v === L0[o]).length < 2); if (oc !== undefined) { const os = cells[oc].layers[0].indexOf(-1); cells[oc].layers[0][os] = L0[o]; L0[o] = -1; } }
      if (p.iceL === 2) r(); cells[c].ice![0][s] = 1; perCell.set(c, 1); icePl++; }
    if (icePl < p.ice) continue;
    // v11 礼盒：倒计时不超过旁边格子能消的组数的一半（旁边没东西可消就永远拆不开）
    const giftAt = (c: number) => { let cap = 0; for (const t of adjacency(pos0, cells.length)[c]) if (!glassCells.includes(t)) cap += cells[t].layers.reduce((a, l) => a + l.filter(v => v >= 0).length, 0); return Math.max(1, Math.min(p.giftN, Math.floor(cap / 6))); };
    if (!place(p.gift, (c, s) => { cells[c].gift![0][s] = giftAt(c); })) continue;
    if (p.teach === 'mystery' && cells.filter(c => c.hid![1]).length < 3) continue;
    // 暂存格：底栏独立一格（不在货架形状里）
    const pos = shape.pos.map(q => q.slice());
    if (W >= 0) pos.push([0, Math.max(...pos.map(q => q[1])) + 1]);
    for (let i = 0; i < p.belt; i++) pos.push([100 + i * 2, 100]);   // 盘子不在货架形状里（离得远 = 不和谁相邻）
    let temp = -1; if (p.temp) { cells.push({ layers: [[-1, -1, -1]], cap: 3, temp: true, ice: [z3()], gift: [f3()], hid: [false] }); temp = cells.length - 1; }
    const slide = p.slide ? (() => { const y = shape.rows.findIndex((L, i) => L === 2 && i > 0) >= 0 ? shape.rows.findIndex((L, i) => L === 2 && i > 0) : shape.rows.indexOf(2); return pos.map((q, i) => q[1] === y ? i : -1).filter(i => i >= 0); })() : [];
    if (!opt.noFit && fitK({ n, cells, pos, temp, slide, orders: p.orders ? [0] : [] }).k < MIN_K - 1e-9) continue;   // v15 缩放下限
    const b = new Board(cells, pos); b.beltSim = p.belt > 0;
    let sol: Mv[] | null = null; const rr = rng(n * 31 + attempt + salt);
    const g = rollout(b, rr, 0);
    for (let k = 0; k < 10 && !sol; k++) sol = k === 0 ? g : rollout(b, rr, 30);   // 解不出就换布局（多试推演比换布局慢）
    if (!sol) continue;
    for (let k = 0; k < 4; k++) { const s2 = rollout(b, rr, 10); if (s2 && s2.length < sol.length) sol = s2; }   // 取短的解：倒计时按它算
    if (p.bombs) {   // 炸弹：挑标准解里第 3–16 步被消掉的前排商品（离第 8 步越近越好，每格最多 1 颗）；步数 = 那一步 + 余量（爆盘 6、其他 4、教学关再 +4）
      const cand: [number, number, number][] = [];
      for (const c of plain) { if (perCell.has(c)) continue; for (let s = 0; s < 3; s++) { const k = cells[c].layers[0][s]; if (k < 0 || k === KEY || cells[c].ice![0][s] || cells[c].gift![0][s]) continue; const d = clearStep(b, sol, c, s); if (d >= 3 && d <= 16) cand.push([c, s, d]); } }
      cand.sort((a, bb) => Math.abs(a[2] - 8) - Math.abs(bb[2] - 8) || a[0] - bb[0] || a[1] - bb[1]);
      const got = new Set<number>();
      for (const [c, s, d] of cand) { if (got.size >= p.bombs) break; if (got.has(c)) continue; got.add(c); cells[c].bomb = zs(cells[c].layers); cells[c].bomb![0][s] = p.bombT * 100 + Math.max(p.teach ? 10 : 7, d + (p.bombT === 3 ? 6 : 4) + (p.teach ? 4 : 0)); }
      if (got.size < p.bombs) continue;
    }
    // 顾客订单：挑 3–4 种（优先在后层的），按解法回放算「订单全满」要几步
    let orders: number[] = [];
    let steps = Math.min(sol.length, Math.ceil(total * 0.8));   // 人看得到整面货架，步数按「推演短解」和「每个商品 0.8 步」取小
    if (p.orders) {
      const back = new Set<number>(); cells.forEach(c => c.layers.forEach((l, li) => { if (li >= 1) l.forEach(k => { if (k >= 0 && k !== KEY) back.add(k); }); }));
      const cand = shuffle(Array.from(new Set(groups.filter(k => k !== KEY))), r).sort((a, bb) => (back.has(bb) ? 1 : 0) - (back.has(a) ? 1 : 0));
      orders = cand.slice(0, n < 40 ? 3 : 4); if (orders.length < 3) continue;
      const rb = b.clone(); const need = orders.slice(); let at = sol.length;
      for (let i = 0; i < sol.length && need.length; i++) { const ev = rb.move(...sol[i])!; for (const e of ev) if (e.t === 'clear') { const j = need.indexOf(e.kind); if (j >= 0) need.splice(j, 1); } if (!need.length) at = i + 1; }
      steps = Math.max(8, Math.min(at, Math.ceil(total * 0.8)));
    }
    // slide 在前面算好了（v15 缩放检查要用）
    const big = N >= 15 || p.depth >= 3;
    const tier: Tier = p.steps ? 'loose' : p.tier;
    const feats: string[] = [];
    if (p.locks) feats.push('lock'); if (p.cols) feats.push('column'); if (p.mystery) feats.push('mystery'); if (p.ice) feats.push('ice'); if (p.gift) feats.push('gift');
    if (p.shut) feats.push('shutter'); if (slide.length) feats.push('slide'); if (p.glass) feats.push('glass'); if (temp >= 0) feats.push('temp'); if (p.steps) feats.push('steps'); if (orders.length) feats.push('orders'); if (p.nf) feats.push(p.nf);
    return { n, cells, pos, cols: 3, steps, time: timeFor(steps, tier, big ? SPT_DEFAULT.big : SPT_DEFAULT.small), hard: p.hard && !p.steps, type: p.steps ? 'easy' : p.type, tier,
      kinds: new Set(items).size, tutorial: false, sol, greedy: !!g, teach: p.teach, slide, orders, moveLimit: p.steps ? Math.ceil(steps * MOVES_K) : 0, temp, big, feats };
  }
  throw new Error('level gen failed ' + n);
}

/** 每日一图：同一天全世界同一张图（UTC 天数做种子）。盘面规模取第 30–50 关（13–15 格、3 层），机制只用第 12 关前教过的 */
export function dailyN(day: number) { return 30 + (((day * 2654435761) >>> 0) % 21); }
export function makeDaily(day: number, goodsN: number): Level {
  const n = dailyN(day);
  const lv = makeLevel(n, goodsN, { salt: 500009 + (((day * 40503) >>> 0) % 900000), daily: true });
  lv.daily = day; lv.teach = ''; lv.hard = false;
  return lv;
}

// ---------------- 合作模式（v7，docs\多人与排行.md「合作 v7」） ----------------
/** 合作关：两块货架拼在一个 Board 里（前 nA 格 = 房主 side 0，后面 = 好友 side 1；好友那块的 pos.y 整体 +100，不和房主的格子相邻）。
 *  diff：0 简单 / 1 中等 / 2 困难（「我要」提示：图标 / 颜色 / 只说需要帮助；盘面也一档比一档大、机制多） */
export interface CoopLevel extends Level { nA: number; diff: number; seed: number; split: number[] }
export const COOP_DY = 100;
export const COOP_SPT = [2.3, 2.0, 2.7];   // 每参考步给几秒（两人边说边找，比单人慢）；机器人局模拟调过
/** 合作推演：两块货架当一个盘面走，但跨边只能放空位（不能调换）—— 和真人能做的一样 */
export function coopMoves(b: Board, noise = 0, r: () => number = Math.random) {
  return scoredMoves(b, noise, r).filter(m => b.cells[m.fc].side === b.cells[m.tc].side || b.front(m.tc)[m.ts] < 0);
}
export function coopRollout(b0: Board, r: () => number, noise: number): Mv[] | null {
  const b = b0.clone(); b.team = true; const max = b.remaining() * 3 + 10; const out: Mv[] = [];
  for (let step = 0; step < max; step++) {
    if (b.done()) return out;
    const ms = coopMoves(b, noise, r); if (!ms.length) return null;
    const m = ms[0]; if (!b.move(m.fc, m.fs, m.tc, m.ts)) return null; out.push([m.fc, m.fs, m.tc, m.ts]);
  }
  return b.done() ? out : null;
}
/** 一边自己能不能消完（不能 = 合作才有意义）：每种商品在这边的个数都是 3 的倍数才可能 */
export function sideAlone(cells: Cell[], side: number) {
  const n = new Map<number, number>(); for (const c of cells) if (c.side === side) for (const l of c.layers) for (const k of l) if (k >= 0) n.set(k, (n.get(k) || 0) + 1);
  for (const v of n.values()) if (v % 3) return false;
  return true;
}
export function makeCoop(seed: number, diff: number, goodsN: number): CoopLevel {
  diff = Math.max(0, Math.min(2, diff | 0));
  const P = [
    { cells: [8, 9], depth: 2, back: [0.45, 0.6], split: 3, mech: 0, pool: ['lock', 'ice'] },
    { cells: [9, 10], depth: 2, back: [0.6, 0.8], split: 4, mech: 1, pool: ['lock', 'ice', 'gift', 'column'] },
    { cells: [9, 10], depth: 3, back: [0.35, 0.5], split: 5, mech: 2, pool: ['lock', 'ice', 'gift', 'column', 'mystery'] },
  ][diff];
  for (let attempt = 0; attempt < 400; attempt++) {
    const r = rng(seed * 9973 + attempt * 104729 + diff * 31337 + 5);
    const feats = shuffle(P.pool.slice(), r).slice(0, P.mech + (diff === 0 && r() < 0.5 ? 1 : 0));
    const has = (f: string) => feats.indexOf(f) >= 0;
    // 两边各自的格子 / 层数
    const side: { N: number; sizes: number[][]; isCol: boolean[]; shape: { pos: number[][]; rows: number[] } }[] = [];
    for (let sd = 0; sd < 2; sd++) {
      const N = ri(r, P.cells[0], P.cells[1]);
      const shape = makeShape(N, r, false, false);
      const isCol = Array(N).fill(false); if (has('column')) isCol[ri(r, 0, N - 1)] = true;
      const sizes: number[][] = [];
      for (let c = 0; c < N; c++) sizes.push(isCol[c] ? Array(ri(r, 3, 4)).fill(1) : [SLOTS]);
      const normal = sizes.map((_, i) => i).filter(i => !isCol[i]);
      for (let k = 0, g = 0; k < 4 && g < 999; g++) { const c = normal[ri(r, 0, normal.length - 1)]; if (sizes[c][0] > 1) { sizes[c][0]--; k++; } }   // 每边 4 个空位：收货要地方放
      const backN = Math.round(normal.length * (P.depth - 1) * (P.back[0] + r() * (P.back[1] - P.back[0])));
      for (let k = 0, g = 0; k < backN && g < 999; g++) { const c = normal[ri(r, 0, normal.length - 1)]; if (sizes[c].length >= P.depth) continue; sizes[c].push(r() < 0.6 ? 3 : 2); k++; }
      side.push({ N, sizes, isCol, shape });
    }
    const tot = side.map(x => x.sizes.reduce((a, l) => a + l.reduce((p, q) => p + q, 0), 0));
    // 凑总数为 3 的倍数：从后层减
    for (let g = 0; (tot[0] + tot[1]) % 3 && g < 99; g++) { const sd = g % 2; const x = side[sd]; const c = ri(r, 0, x.N - 1); const L = x.sizes[c]; if (!x.isCol[c] && L.length > 1 && L[L.length - 1] > 1) { L[L.length - 1]--; tot[sd]--; } }
    if ((tot[0] + tot[1]) % 3) continue;
    const K = (tot[0] + tot[1]) / 3;
    // 拆开的组：一边 2 个一边 1 个；其余整组放一边
    const S = P.split; const a: number[] = []; for (let i = 0; i < S; i++) a.push(r() < 0.5 ? 1 : 2);
    const fix = (from: number, to: number, cnt: number) => { const idx = a.map((v, i) => v === from ? i : -1).filter(i => i >= 0); if (idx.length < cnt) return false; for (let q = 0; q < cnt; q++) a[idx[q]] = to; return true; };
    const need = (((tot[0] - a.reduce((p, q) => p + q, 0)) % 3) + 3) % 3;   // 让房主这边总数 - 拆组个数 = 3 的倍数（1→2 加 1，2→1 减 1）
    if (need === 1 && !fix(1, 2, 1)) fix(2, 1, 2);
    if (need === 2 && !fix(2, 1, 1)) fix(1, 2, 2);
    const sumA = a.reduce((p, q) => p + q, 0);
    if ((tot[0] - sumA) % 3 !== 0) continue;
    const wholeA = (tot[0] - sumA) / 3, wholeB = (tot[1] - (S * 3 - sumA)) / 3;
    if (wholeA < 2 || wholeB < 2 || wholeA + wholeB + S !== K) continue;
    const pool = goodsPool(goodsN, goodsN, r);
    const kinds: number[] = []; for (let i = 0; i < K; i++) kinds.push(pool[i % pool.length]);   // 种类不够就重复（同 makeLevel）
    const itemsA: number[] = [], itemsB: number[] = [];
    for (let i = 0; i < S; i++) { const k = kinds[i]; for (let q = 0; q < a[i]; q++) itemsA.push(k); for (let q = a[i]; q < 3; q++) itemsB.push(k); }
    for (let i = 0; i < wholeA; i++) { const k = kinds[S + i]; itemsA.push(k, k, k); }
    for (let i = 0; i < wholeB; i++) { const k = kinds[S + wholeA + i]; itemsB.push(k, k, k); }
    shuffle(itemsA, r); shuffle(itemsB, r);
    const cells: Cell[] = []; const pos: number[][] = []; let bad = false;
    for (let sd = 0; sd < 2; sd++) {
      const x = side[sd], items = sd === 0 ? itemsA : itemsB; let ip = 0;
      const lockC = has('lock') ? ri(r, 0, x.N - 1) : -1;
      for (let c = 0; c < x.N; c++) {
        const layers = x.sizes[c].map(cnt => { const l = [-1, -1, -1]; const ps = x.isCol[c] ? [1] : shuffle([0, 1, 2], r).slice(0, cnt); for (const s of ps) l[s] = items[ip++]; return l; });
        if (layers.some(l => isTriple(l))) bad = true;
        const hidOn = has('mystery') && !x.isCol[c] && layers.length >= 2 && r() < 0.4;
        cells.push({ layers, cap: x.isCol[c] ? 1 : 3, lock: c === lockC && !x.isCol[c] ? 3 + ri(r, 0, 1) : 0, hid: layers.map((_, li) => hidOn && li >= 1),
          ice: layers.map(z3), gift: layers.map(f3), glass: false, shut: 0, side: sd });
        pos.push([x.shape.pos[c][0], x.shape.pos[c][1] + sd * COOP_DY]);
      }
      if (ip !== items.length) bad = true;
    }
    if (bad) continue;
    // 冰冻 / 礼盒：每边 2 个，放前排（不放锁链格、台座）
    for (const f of ['ice', 'gift']) if (has(f)) for (let sd = 0; sd < 2; sd++) {
      const spots: [number, number][] = []; cells.forEach((c, ci) => { if (c.side !== sd || c.lock || c.cap === 1) return; for (let s = 0; s < 3; s++) if (c.layers[0][s] >= 0 && !c.ice![0][s] && !c.gift![0][s]) spots.push([ci, s]); });
      shuffle(spots, r); const used = new Set<number>();
      for (const [ci, s] of spots) { if (used.size >= 2) break; if (used.has(ci)) continue; used.add(ci); if (f === 'ice') cells[ci].ice![0][s] = 1; else cells[ci].gift![0][s] = 1; }
    }
    if (sideAlone(cells, 0) || sideAlone(cells, 1)) continue;
    const b = new Board(cells, pos);
    const rr = rng(seed * 31 + attempt + diff);
    let sol: Mv[] | null = coopRollout(b, rr, 0);
    for (let k = 0; k < 8 && !sol; k++) sol = coopRollout(b, rr, 30);
    if (!sol) continue;
    for (let k = 0; k < 4; k++) { const s2 = coopRollout(b, rr, 10); if (s2 && s2.length < sol.length) sol = s2; }
    const nA = side[0].N;
    const steps = Math.min(sol.length, Math.ceil(b.remaining() * 0.8));   // 参考步数：推演解（跨边送得多、偏长）和「每个商品 0.8 步」取小
    const time = Math.max(90, Math.ceil(steps * COOP_SPT[diff] / 5) * 5);
    const split = kinds.slice(0, S);
    return { n: 0, cells, pos, cols: 3, time, hard: diff === 2, type: (['easy', 'normal', 'hard'] as LvKind[])[diff], tier: 'loose', kinds: K, tutorial: false,
      sol, steps, greedy: true, teach: '', slide: [], orders: [], moveLimit: 0, temp: -1, big: true, feats, nA, diff, seed, split };
  }
  throw new Error('coop gen failed ' + seed + '/' + diff);
}
