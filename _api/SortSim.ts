// 货架整理：纯逻辑（格子、层、移动 / 调换、消除、道具、各种特殊货架、关卡生成 + 推演验证）。不依赖 cc，Node 可跑（tools/test_sim.mjs）。
// 格子 = layers[0] 是前排（3 个位，-1 = 空），layers[1..] 是后层；前排都空了，下一层整排顶上来。
// v3：满格 = 调换；cap=1 单个台座（只用中间位）；lock=N 锁链格（再消 N 组解锁）；hid[li] 问号层（顶到前排才显示）。
// v4：ice[li][s] 冰冻层数（>0 不能拿、不能被调换、不算三连；同格 / 相邻格每消一组裂一层）；gift[li][s] 礼盒（同上不能动；相邻消除或顶到前排时拆开）；
//     glass 玻璃柜（钥匙那组消掉才碎，碎之前当锁着）；shut 卷帘门（游戏按时间设 closed[c]，关着当锁着）；temp 暂存格（底栏独立一格）；
//     Level.pos 每格在货架上的位置（异形货架）；slide 左右平移的一排；orders 顾客订单；moveLimit 步数限制关；tier 松紧档。
export const SLOTS = 3;
export const KEY = 100;          // 钥匙商品的种类号（画成钥匙）
export type Layer = number[];
export interface Cell { layers: Layer[]; cap?: number; lock?: number; hid?: boolean[]; ice?: number[][]; gift?: boolean[][]; glass?: boolean; shut?: number; temp?: boolean; }
export type Mv = [number, number, number, number];   // [从格, 从位, 到格, 到位]
export type LvKind = 'easy' | 'normal' | 'hard';
export type Tier = 'loose' | 'some' | 'tight' | 'very';
export type Teach = '' | 'lock' | 'shape' | 'column' | 'ice' | 'gift' | 'shutter' | 'temp' | 'mystery' | 'slide' | 'glass' | 'steps' | 'orders';
export interface Level {
  n: number; cells: Cell[]; pos: number[][]; cols: number; time: number; hard: boolean; type: LvKind; tier: Tier; kinds: number; tutorial: boolean;
  sol: Mv[]; steps: number; greedy: boolean; teach: Teach; slide: number[]; orders: number[]; moveLimit: number; temp: number; big: boolean; feats: string[];
  daily?: number;   // 每日一图：UTC 天数（0 = 普通关）
}
/** 生成选项：salt 换一套盘面（同关号不同图）；daily = 每日一图（不教学、不限步、不订单、不暂存格，机制只用第 12 关前教过的） */
export interface GenOpt { salt?: number; daily?: boolean }
/** 每日一图只用这关之前教过的机制（锁链 / 台座 / 冰冻 / 礼盒 / 卷帘门）；每日挑战也是打过这关才开 */
export const DAILY_MAX_INTRO = 12;
export type Ev =
  | { t: 'move'; fc: number; fs: number; tc: number; ts: number; kind: number; swap: number }
  | { t: 'clear'; c: number; kind: number }
  | { t: 'shift'; c: number }
  | { t: 'unlock'; c: number }
  | { t: 'ice'; c: number; s: number; left: number }
  | { t: 'gift'; c: number; s: number; kind: number }
  | { t: 'glass'; c: number }
  | { t: 'unshut'; c: number }
  | { t: 'win' };

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ri = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
function shuffle<T>(a: T[], r: () => number) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
export const isTriple = (l: Layer) => l[0] >= 0 && l[0] === l[1] && l[1] === l[2];
const isEmpty = (l: Layer) => l[0] < 0 && l[1] < 0 && l[2] < 0;
const z3 = () => [0, 0, 0]; const f3 = () => [false, false, false];
const copyCell = (c: Cell): Cell => ({
  layers: c.layers.map(l => l.slice()), cap: c.cap || 3, lock: c.lock || 0, hid: c.hid ? c.hid.slice() : c.layers.map(() => false),
  ice: c.ice ? c.ice.map(l => l.slice()) : c.layers.map(z3), gift: c.gift ? c.gift.map(l => l.slice()) : c.layers.map(f3),
  glass: !!c.glass, shut: c.shut || 0, temp: !!c.temp,
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
  cells: Cell[]; pos?: number[][]; adj: number[][]; closed: boolean[];
  constructor(cells: Cell[], pos?: number[][]) { this.cells = cells.map(copyCell); this.pos = pos; this.adj = adjacency(pos, cells.length); this.closed = cells.map(() => false); }
  clone() { const b = new Board(this.cells, this.pos); b.closed = this.closed.slice(); return b; }
  front(c: number) { return this.cells[c].layers[0]; }
  cap(c: number) { return this.cells[c].cap || 3; }
  /** 不能拿也不能放：锁链没解 / 玻璃没碎 / 卷帘门关着 */
  locked(c: number) { const x = this.cells[c]; return (x.lock || 0) > 0 || !!x.glass || this.closed[c]; }
  /** 冰冻或礼盒：这个商品不能拿、不能被调换、不算三连 */
  blocked(c: number, li: number, s: number) { const x = this.cells[c]; return !!((x.ice && x.ice[li] && x.ice[li][s] > 0) || (x.gift && x.gift[li] && x.gift[li][s])); }
  slotsOf(c: number) { return this.cap(c) === 1 ? [1] : [0, 1, 2]; }
  remaining() { let n = 0; for (const c of this.cells) for (const l of c.layers) for (const k of l) if (k >= 0) n++; return n; }
  done() { return this.remaining() === 0; }
  canPlace(c: number) { if (this.locked(c)) return false; const f = this.front(c); return this.slotsOf(c).some(s => f[s] < 0); }
  tripleAt(c: number) { const L = this.cells[c].layers[0]; return isTriple(L) && !this.blocked(c, 0, 0) && !this.blocked(c, 0, 1) && !this.blocked(c, 0, 2); }
  /** 把 (fc,fs) 的商品放到 tc 格的 ts 位（-1 = 第一个空位）；ts 上有东西 = 调换。返回事件；不能放返回 null */
  move(fc: number, fs: number, tc: number, ts = -1): Ev[] | null {
    if (fc === tc || this.locked(fc) || this.locked(tc)) return null;
    const kind = this.front(fc)[fs]; if (kind < 0 || this.blocked(fc, 0, fs)) return null;
    const tf = this.front(tc); const ok = this.slotsOf(tc);
    if (ts < 0) { const e = ok.find(s => tf[s] < 0); ts = e === undefined ? -1 : e; }
    if (ts < 0 || ok.indexOf(ts) < 0) return null;
    const other = tf[ts]; if (other === kind) return null;
    if (other >= 0 && this.blocked(tc, 0, ts)) return null;
    this.front(fc)[fs] = other; tf[ts] = kind;
    const ev: Ev[] = [{ t: 'move', fc, fs, tc, ts, kind, swap: other }];
    const i0 = ev.length;
    this.settle(tc, ev); this.settle(fc, ev);
    this.cascade(ev, i0);
    if (this.done()) ev.push({ t: 'win' });
    return ev;
  }
  /** 消三、空了顶上来（顶上来的刚好三个一样也消；顶到前排的礼盒拆开） */
  settle(c: number, ev: Ev[]) {
    const cell = this.cells[c], L = cell.layers, H = cell.hid!, I = cell.ice!, G = cell.gift!;
    for (let guard = 0; guard < 20; guard++) {
      if (this.tripleAt(c)) { const kind = L[0][0]; L[0] = [-1, -1, -1]; ev.push({ t: 'clear', c, kind }); continue; }
      if (isEmpty(L[0]) && L.length > 1) {
        L.shift(); H.shift(); I.shift(); G.shift(); H[0] = false; ev.push({ t: 'shift', c });
        for (let s = 0; s < SLOTS; s++) if (G[0][s]) { G[0][s] = false; ev.push({ t: 'gift', c, s, kind: L[0][s] }); }
        continue;
      }
      break;
    }
  }
  /** 新的消除带来的连带：相邻冰裂、礼盒拆开、锁链计数、钥匙碎玻璃；裂开 / 拆开后可能又凑成三个 → 再来一轮 */
  cascade(ev: Ev[], from: number) {
    let i = from;
    for (let guard = 0; guard < 30 && i < ev.length; guard++) {
      const fresh = ev.slice(i).filter(e => e.t === 'clear') as { t: 'clear'; c: number; kind: number }[]; i = ev.length;
      if (!fresh.length) break;
      const touched = new Set<number>();
      for (const e of fresh) {
        const near = e.c >= 0 ? [e.c, ...this.adj[e.c]] : [];
        for (const t of near) {
          if (this.locked(t)) continue;
          const cell = this.cells[t];
          for (let s = 0; s < SLOTS; s++) {
            if (cell.ice![0][s] > 0) { cell.ice![0][s]--; ev.push({ t: 'ice', c: t, s, left: cell.ice![0][s] }); touched.add(t); }
            else if (cell.gift![0][s]) { cell.gift![0][s] = false; ev.push({ t: 'gift', c: t, s, kind: cell.layers[0][s] }); touched.add(t); }
          }
        }
      }
      this.lockTick(ev, fresh.length);
      if (fresh.some(e => e.kind === KEY)) this.cells.forEach((cell, c) => { if (cell.glass) { cell.glass = false; ev.push({ t: 'glass', c }); touched.add(c); } });
      for (const t of touched) this.settle(t, ev);
    }
  }
  /** 每消一组，所有锁链格计数 -n；到 0 解锁 */
  lockTick(ev: Ev[], n: number) {
    if (!n) return;
    this.cells.forEach((cell, c) => { if ((cell.lock || 0) > 0) { cell.lock = Math.max(0, cell.lock! - n); if (cell.lock === 0) ev.push({ t: 'unlock', c }); } });
  }
  unlock(c: number) { this.cells[c].lock = 0; }
  counts(frontOnly = false) {
    const m = new Map<number, number>();
    this.cells.forEach((c, ci) => { if (this.locked(ci)) return; for (let i = 0; i < c.layers.length; i++) { if (frontOnly && i > 0) break; for (const k of c.layers[i]) if (k >= 0) m.set(k, (m.get(k) || 0) + 1); } });
    return m;
  }
  /** 从没锁的格里拿走 count 个 kind（前排优先），带走它身上的冰 / 礼盒；后层拿空就去掉；返回位置 [格, 层, 位] 和事件 */
  private take(kind: number, count: number): { picks: [number, number, number][]; ev: Ev[] } {
    const picks: [number, number, number][] = [];
    for (let li = 0; li < 9 && picks.length < count; li++)
      for (let c = 0; c < this.cells.length && picks.length < count; c++) {
        if (this.locked(c)) continue;
        const l = this.cells[c].layers[li]; if (!l) continue;
        for (let s = 0; s < SLOTS && picks.length < count; s++) if (l[s] === kind) picks.push([c, li, s]);
      }
    for (const [c, li, s] of picks) { const x = this.cells[c]; x.layers[li][s] = -1; x.ice![li][s] = 0; x.gift![li][s] = false; }
    const ev: Ev[] = [];
    for (let k = 0; k < picks.length / 3; k++) ev.push({ t: 'clear', c: -1, kind });
    const i0 = ev.length;
    for (let c = 0; c < this.cells.length; c++) {
      const x = this.cells[c], L = x.layers;
      for (let li = L.length - 1; li >= 1; li--) if (isEmpty(L[li])) { L.splice(li, 1); x.hid!.splice(li, 1); x.ice!.splice(li, 1); x.gift!.splice(li, 1); }
      this.settle(c, ev);
    }
    this.cascade(ev, 0);
    ev.splice(0, i0);   // 道具本身那几组只用来扣锁链 / 碎玻璃，不当成格子事件
    if (this.done()) ev.push({ t: 'win' });
    return { picks, ev };
  }
  /** 磁铁：前排最多的一种，凑齐 3 个直接消（不够从后层拿；锁着的格不拿） */
  magnet(): { kind: number; picks: [number, number, number][]; ev: Ev[] } | null {
    const fc = this.counts(true), all = this.counts();
    let best = -1, bs = -1;
    for (const [k, n] of all) { if (n < 3) continue; const s = (fc.get(k) || 0) * 100 + n; if (s > bs) { bs = s; best = k; } }
    if (best < 0) return null;
    const r = this.take(best, 3);
    return { kind: best, picks: r.picks, ev: r.ev };
  }
  /** 魔法：点中的那种商品（没锁的格里）按 3 的倍数全部清掉 */
  wand(kind: number): { kind: number; picks: [number, number, number][]; ev: Ev[] } | null {
    const n = this.counts().get(kind) || 0; if (n < 3 || kind < 0) return null;
    const r = this.take(kind, Math.floor(n / 3) * 3);
    return { kind, picks: r.picks, ev: r.ev };
  }
  /** 锤子：砸锁链 / 玻璃 / 卷帘门 / 冰 / 礼盒；砸普通商品 = 清掉这种的 3 个 */
  hammer(c: number, s: number): { what: string; kind: number; picks: [number, number, number][]; ev: Ev[] } | null {
    const x = this.cells[c]; const ev: Ev[] = [];
    if ((x.lock || 0) > 0) { x.lock = 0; ev.push({ t: 'unlock', c }); return { what: 'lock', kind: -1, picks: [], ev }; }
    if (x.glass) { x.glass = false; ev.push({ t: 'glass', c }); return { what: 'glass', kind: -1, picks: [], ev }; }
    if (x.shut) { x.shut = 0; this.closed[c] = false; ev.push({ t: 'unshut', c }); return { what: 'shut', kind: -1, picks: [], ev }; }
    const k = x.layers[0][s]; if (k < 0) return null;
    if (x.ice![0][s] > 0) { x.ice![0][s] = 0; ev.push({ t: 'ice', c, s, left: 0 }); this.settle(c, ev); this.cascade(ev, 1); if (this.done()) ev.push({ t: 'win' }); return { what: 'ice', kind: k, picks: [], ev }; }
    if (x.gift![0][s]) { x.gift![0][s] = false; ev.push({ t: 'gift', c, s, kind: k }); this.settle(c, ev); this.cascade(ev, 1); if (this.done()) ev.push({ t: 'win' }); return { what: 'gift', kind: k, picks: [], ev }; }
    if ((this.counts().get(k) || 0) < 3) return null;
    // 点中的这个一定拿走，再按顺序补 2 个；锁链 / 玻璃按「消了一组」算
    x.layers[0][s] = -1; x.ice![0][s] = 0; x.gift![0][s] = false;
    const r = this.take(k, 2);
    const picks: [number, number, number][] = [[c, 0, s], ...r.picks];
    const ev2: Ev[] = [{ t: 'clear', c: -1, kind: k }]; this.settle(c, ev2); this.cascade(ev2, 0); ev2.shift();
    const all = [...r.ev.filter(e => e.t !== 'win'), ...ev2]; if (this.done()) all.push({ t: 'win' });
    return { what: 'item', kind: k, picks, ev: all };
  }
  /** 洗牌：没锁的格里、没冻住 / 不是礼盒的商品打乱重发，每层个数不变；不让任何一层天生三个一样 */
  shuffle(r: () => number) {
    const items: number[] = [], spots: [number, number, number][] = [];
    this.cells.forEach((c, ci) => { if (this.locked(ci)) return; c.layers.forEach((l, li) => l.forEach((k, s) => { if (k >= 0 && !this.blocked(ci, li, s)) { items.push(k); spots.push([ci, li, s]); } })); });
    for (let tries = 0; tries < 50; tries++) {
      shuffle(items, r);
      spots.forEach(([c, li, s], i) => { this.cells[c].layers[li][s] = items[i]; });
      let ok = true; this.cells.forEach(c => c.layers.forEach(l => { if (isTriple(l)) ok = false; }));
      if (ok) return;
    }
  }
  key() { return this.cells.map((c, i) => (c.lock || 0) + (c.glass ? 'G' : '') + (this.closed[i] ? 'S' : '') + '#' + c.layers.map((l, li) => l.map((k, s) => k + (c.ice![li][s] ? 'i' + c.ice![li][s] : '') + (c.gift![li][s] ? 'g' : '')).sort().join(',')).join('|')).sort().join('/'); }
}

/** 走法打分（推演和提示共用）：凑三 > 拿空一格露出后层 > 凑对 > 放空格；调换只在能凑出三个时考虑；往别的种类里塞、拆对子扣分。冻住 / 礼盒当成「不同种类、不能动」 */
export function scoredMoves(b: Board, noise = 0, r: () => number = Math.random) {
  const out: { s: number; fc: number; fs: number; tc: number; ts: number }[] = [];
  const n = b.cells.length;
  const fl: number[] = [], lk: boolean[] = [], c3: boolean[] = [], deep: boolean[] = [], F: number[][] = [], bk: boolean[][] = [];
  for (let c = 0; c < n; c++) {
    const f = b.front(c); fl.push((f[0] >= 0 ? 1 : 0) + (f[1] >= 0 ? 1 : 0) + (f[2] >= 0 ? 1 : 0)); lk.push(b.locked(c)); c3.push(b.cap(c) === 3); deep.push(b.cells[c].layers.length > 1);
    const bb = [b.blocked(c, 0, 0), b.blocked(c, 0, 1), b.blocked(c, 0, 2)]; bk.push(bb);
    F.push([bb[0] && f[0] >= 0 ? -9 - c * 3 : f[0], bb[1] && f[1] >= 0 ? -10 - c * 3 : f[1], bb[2] && f[2] >= 0 ? -11 - c * 3 : f[2]]);   // 冻住的当成独一无二的种类（不和谁凑对）
  }
  const has = (k: number) => k >= 0 || k <= -9;
  for (let tc = 0; tc < n; tc++) {
    if (lk[tc]) continue;
    const tf = F[tc], cap1 = !c3[tc];
    let empty = -1; if (cap1) { if (!has(tf[1])) empty = 1; } else { for (let s = 0; s < 3; s++) if (!has(tf[s])) { empty = s; break; } }
    const hn = cap1 ? (has(tf[1]) ? 1 : 0) : fl[tc];
    let h0 = -1, h1 = -1; if (!cap1) for (let s = 0; s < 3; s++) if (has(tf[s])) { if (h0 === -1) h0 = tf[s]; else h1 = tf[s]; }
    for (let fc = 0; fc < n; fc++) {
      if (fc === tc || lk[fc]) continue; const ff = F[fc];
      for (let fs = 0; fs < 3; fs++) {
        const kd = ff[fs]; if (kd < 0) continue;
        if (empty >= 0) {
          let s: number;
          if (!cap1 && hn === 2 && h0 === kd && h1 === kd) s = 100;
          else if (cap1) s = 4;
          else if (hn === 0) s = 8;
          else if ((h0 === -1 || h0 === kd) && (h1 === -1 || h1 === kd)) s = 45;
          else s = -25;
          if (fl[fc] === 1) s += deep[fc] ? 28 : 6;
          if (s < 100 && c3[fc]) { let same = 0; for (let q = 0; q < 3; q++) if (ff[q] === kd) same++; if (same >= 2) s -= 35; }
          if ((hn === 0 || cap1) && fl[fc] === 1 && !deep[fc]) s -= 40;   // 单个挪到空格 = 白走
          out.push({ s: s + (noise ? r() * noise : 0), fc, fs, tc, ts: empty });
        } else {   // 满格：调换（只在能凑出三个时考虑）
          let ra = -2, rb = -2; if (c3[fc]) for (let q = 0; q < 3; q++) if (q !== fs) { if (ra === -2) ra = ff[q]; else rb = ff[q]; }
          for (let ts = cap1 ? 1 : 0; ts <= (cap1 ? 1 : 2); ts++) {
            const x = tf[ts]; if (x === kd || x <= -9) continue;
            let triT = false; if (!cap1) { const o1 = tf[(ts + 1) % 3], o2 = tf[(ts + 2) % 3]; triT = o1 === kd && o2 === kd; }
            const triF = c3[fc] && ra === x && rb === x && x >= 0;
            if (!triT && !triF) continue;
            out.push({ s: (triT && triF ? 140 : 95) + (noise ? r() * noise : 0), fc, fs, tc, ts });
          }
        }
      }
    }
  }
  out.sort((a, b) => b.s - a.s);
  return out;
}
/** 贪心随机推演：成功返回走法，失败 null */
export function rollout(b0: Board, r: () => number, noise: number): Mv[] | null {
  const b = b0.clone(); const max = b.remaining() * 3 + 10; const out: Mv[] = [];
  for (let step = 0; step < max; step++) {
    if (b.done()) return out;
    const ms = scoredMoves(b, noise, r); if (!ms.length) return null;
    const m = ms[0]; if (!b.move(m.fc, m.fs, m.tc, m.ts)) return null; out.push([m.fc, m.fs, m.tc, m.ts]);
  }
  return b.done() ? out : null;
}

// ---------------- 难度节奏（docs\设计.md「v4 方案」「难度方案 v4」） ----------------
/** 每种新东西第一次出现的关（那关是松关 + 开场教一次） */
export const INTRO = { lock: 3, shape: 4, column: 5, ice: 7, hourglass: 8, gift: 9, shutter: 12, temp: 14, hammer: 14, mystery: 16, slide: 18, glass: 22, steps: 24, orders: 26, wand: 28 };
const TEACH_AT: Record<number, Teach> = { 3: 'lock', 4: 'shape', 5: 'column', 7: 'ice', 9: 'gift', 12: 'shutter', 14: 'temp', 16: 'mystery', 18: 'slide', 22: 'glass', 24: 'steps', 26: 'orders' };
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
  if (teach === 'lock') f.lock = 1; else if (teach === 'column') f.column = 1; else if (teach === 'mystery') f.mystery = 1;
  else if (teach === 'ice') f.ice = 1; else if (teach === 'gift') f.gift = 1; else if (teach === 'shutter') f.shutter = 1;
  else if (teach === 'slide') f.slide = 1; else if (teach === 'glass') f.glass = 1;
  else if (!teach && n > INTRO.lock) {
    const r = rng(n * 131 + 7 + salt);
    const cand: [keyof typeof f, number, number][] = [['lock', INTRO.lock, 0.5], ['column', INTRO.column, 0.45], ['ice', INTRO.ice, 0.45], ['gift', INTRO.gift, 0.4],
      ['shutter', INTRO.shutter, 0.35], ['mystery', INTRO.mystery, 0.35], ['slide', INTRO.slide, 0.35], ['glass', INTRO.glass, 0.3]];
    let max = n < 30 || daily ? 2 : 3; if (!daily && (isStepsLv(n) || isOrdersLv(n))) max--;
    let got = 0;
    for (const [k, at, p] of shuffle(cand.slice(), r)) { if (got >= max) break; if (daily && at > DAILY_MAX_INTRO) continue; if (n > at && r() < p) { f[k] = 1; got++; } }
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
  return { cells, depth, free, unlock, hard, type, tier, teach, locks, lockN, cols, mystery, ice, iceL, gift, shut, slide: !!f.slide, glass: !!f.glass, temp,
    steps: !daily && isStepsLv(n), orders: !daily && isOrdersLv(n), shape: n >= INTRO.shape };
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
    const N = p.cells;
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
    let total = sizes.reduce((s, l) => s + l.reduce((a, b) => a + b, 0), 0);
    // 凑成 3 的倍数：从普通格后层减（连锁层不动）
    for (let c = 0; total % 3 !== 0 && c < 999; c++) { const ci = normal[c % normal.length], L = sizes[ci], li = L.length - 1; if (L.length > 1 && L[li] > 1 && !(li === 1 && chainCells.indexOf(ci) >= 0)) { L[li]--; total--; } }
    if (total % 3 !== 0) continue;
    const kinds = total / 3;
    if (p.locks && kinds - chainN < p.lockN * 2 + 3) continue;
    const pool = goodsPool(p.unlock, goodsN, r);
    const groups: number[] = []; for (let k = 0; k < kinds; k++) groups.push(pool[k % pool.length]);
    if (p.glass) groups[kinds - 1] = KEY;   // 最后一组换成钥匙（不会是连锁组：连锁组在最前面）
    const items: number[] = [];
    for (const g of groups.slice(chainCells.length)) items.push(g, g, g);
    shuffle(items, r);
    let ip = 0, bad = false;
    const cells: Cell[] = sizes.map((L, c) => {
      const col = isCol(c);
      const layers = L.map((cnt, li) => {
        const ch = li === 1 ? chainCells.indexOf(c) : -1;
        if (ch >= 0) { const g = groups[ch]; return [g, g, g]; }
        const l = [-1, -1, -1]; const ps = col ? [1] : shuffle([0, 1, 2], r).slice(0, cnt);
        for (const s of ps) l[s] = items[ip++];
        return l;
      });
      const hidOn = p.mystery > 0 && !col && L.length >= 2 && chainCells.indexOf(c) < 0 && r() < p.mystery;
      return { layers, cap: col ? 1 : 3, lock: lockCells.indexOf(c) >= 0 ? p.lockN : 0, hid: layers.map((_, li) => hidOn && li >= 1),
        ice: layers.map(z3), gift: layers.map(f3), glass: glassCells.indexOf(c) >= 0, shut: shutCells.indexOf(c) >= 0 ? 1 + shutCells.indexOf(c) : 0 };
    });
    // 钥匙不能在玻璃柜里（否则解不开）：和外面的普通商品换
    for (const gc of glassCells) cells[gc].layers.forEach((l, li) => l.forEach((k, s) => {
      if (k !== KEY) return;
      for (let g = 0; g < 200; g++) { const oc = normal[ri(r, 0, normal.length - 1)]; if (glassCells.indexOf(oc) >= 0 || chainCells.indexOf(oc) >= 0) continue; const ol = cells[oc].layers[0]; const os = ri(r, 0, 2); if (ol[os] >= 0 && ol[os] !== KEY) { l[s] = ol[os]; ol[os] = KEY; break; } }
    }));
    cells.forEach((c, ci) => c.layers.forEach((l, li) => { if (isTriple(l) && !(li === 1 && chainCells.indexOf(ci) >= 0)) bad = true; }));
    for (const gc of glassCells) if (cells[gc].layers.some(l => l.indexOf(KEY) >= 0)) bad = true;
    if (bad) continue;
    // 冰冻 / 礼盒：放在普通格的前排商品上（不放连锁格、锁、玻璃、卷帘门、台座）
    const plain = normal.filter(i => !used.has(i));
    const spots: [number, number][] = []; for (const c of plain) for (let s = 0; s < 3; s++) if (cells[c].layers[0][s] >= 0 && cells[c].layers[0][s] !== KEY) spots.push([c, s]);
    shuffle(spots, r);
    const perCell = new Map<number, number>();
    let si = 0;
    const place = (k: number, fn: (c: number, s: number) => void) => { let got = 0; for (; si < spots.length && got < k; si++) { const [c, s] = spots[si]; if ((perCell.get(c) || 0) >= 1) continue; perCell.set(c, 1); fn(c, s); got++; } return got === k; };
    if (!place(p.ice, (c, s) => { cells[c].ice![0][s] = p.iceL === 2 && r() < 0.5 ? 2 : 1; })) continue;
    if (!place(p.gift, (c, s) => { cells[c].gift![0][s] = true; })) continue;
    if (p.teach === 'mystery' && cells.filter(c => c.hid![1]).length < 3) continue;
    // 暂存格：底栏独立一格（不在货架形状里）
    const pos = shape.pos.map(q => q.slice());
    let temp = -1; if (p.temp) { cells.push({ layers: [[-1, -1, -1]], cap: 3, temp: true, ice: [z3()], gift: [f3()], hid: [false] }); temp = cells.length - 1; }
    const b = new Board(cells, pos);
    let sol: Mv[] | null = null; const rr = rng(n * 31 + attempt + salt);
    const g = rollout(b, rr, 0);
    for (let k = 0; k < 10 && !sol; k++) sol = k === 0 ? g : rollout(b, rr, 30);   // 解不出就换布局（多试推演比换布局慢）
    if (!sol) continue;
    for (let k = 0; k < 4; k++) { const s2 = rollout(b, rr, 10); if (s2 && s2.length < sol.length) sol = s2; }   // 取短的解：倒计时按它算
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
    const slide = p.slide ? (() => { const y = shape.rows.findIndex((L, i) => L === 2 && i > 0) >= 0 ? shape.rows.findIndex((L, i) => L === 2 && i > 0) : shape.rows.indexOf(2); return pos.map((q, i) => q[1] === y ? i : -1).filter(i => i >= 0); })() : [];
    const big = N >= 15 || p.depth >= 3;
    const tier: Tier = p.steps ? 'loose' : p.tier;
    const feats: string[] = [];
    if (p.locks) feats.push('lock'); if (p.cols) feats.push('column'); if (p.mystery) feats.push('mystery'); if (p.ice) feats.push('ice'); if (p.gift) feats.push('gift');
    if (p.shut) feats.push('shutter'); if (slide.length) feats.push('slide'); if (p.glass) feats.push('glass'); if (temp >= 0) feats.push('temp'); if (p.steps) feats.push('steps'); if (orders.length) feats.push('orders');
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
