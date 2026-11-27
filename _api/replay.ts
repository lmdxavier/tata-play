// 货架整理 · 成绩重放校验（服务器和 Node 测试共用）。2026-11-26 v6 每日一图；2026-11-27 v9 普通关推关成绩 / 对战也用（verifyRun 带上限）。见 huojia\docs\多人与排行.md。
// 每步 = [从格, 从位, 到格, 到位, 毫秒]，毫秒 = 客户端 lvT（关卡游戏时间，卷帘门就按它开关）。
// 卷帘门客户端会因为「正拿着 / 正在演连锁」推迟关门：从卷帘门格拿出来的那一步不查它关没关（拿起时开着、拿着不放门就不关）；
// 放进去的格只在关门窗口中间（两头各让 1.5 秒）才当关着。
import { Board } from './SortSim.ts';
import type { Cell } from './SortSim.ts';

export const SHUT_OPEN = 8, SHUT_CLOSED = 6, SHUT_MARGIN = 1.5;
export const capFor = (steps: number) => Math.max(240, Math.ceil(steps * 5 / 30) * 30);   // 和 Daily.ts 一样
export const MIN_SECS_PER_MOVE = 0.4;   // 平均每步下限（真人约 0.6–1.5 秒；独立检查 2026-11-26：0.2 太松）
export const MIN_GAP_MS = 150;         // 相邻两步至少隔这么久（一次拖放本身就要 0.2 秒以上）
export const MAX_MOVES = 1500;

export interface DayData { cells: Cell[]; pos: number[][]; steps: number }
export interface RunData { cells: unknown[]; pos: number[][]; steps: number }
export type Step = [number, number, number, number, number];

const shutClosed = (shut: number, t: number) => {
  const per = SHUT_OPEN + SHUT_CLOSED, ph = (t + (shut - 1) * 5) % per;
  return ph >= SHUT_OPEN + SHUT_MARGIN && ph <= per - SHUT_MARGIN;
};

/** 返回 '' = 通过；否则是不通过的原因 */
export function verify(day: DayData, moves: unknown, secs: unknown): string { return verifyRun(day, moves, secs, capFor(day.steps)); }
/** 通用：cap = 用时上限（秒） */
export function verifyRun(day: RunData, moves: unknown, secs: unknown, cap: number): string {
  if (typeof secs !== 'number' || !isFinite(secs)) return 'secs';
  if (!Array.isArray(moves) || !moves.length || moves.length > MAX_MOVES) return 'moves';
  const n = day.cells.length; let lastT = 0;
  const b = new Board(day.cells as Cell[], day.pos);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i] as Step;
    if (!Array.isArray(m) || m.length !== 5 || !m.every(x => Number.isInteger(x))) return 'step' + i;
    const [fc, fs, tc, ts, ms] = m;
    if (fc < 0 || fc >= n || tc < 0 || tc >= n || fs < 0 || fs > 3 || ts < 0 || ts > 3) return 'range' + i;
    if (ms < lastT || ms > 3600e3) return 'time' + i;
    if (i > 0 && ms - lastT < MIN_GAP_MS) return 'gap' + i;
    lastT = ms;
    const t = ms / 1000;
    b.closed = b.cells.map((c, k) => k !== fc && !!c.shut && shutClosed(c.shut, t));
    if (!b.move(fc, fs, tc, ts)) return 'illegal' + i;
  }
  if (!b.done()) return 'unfinished';
  if (secs > cap) return 'cap';
  if (secs < lastT / 1000 - 1) return 'fast-clock';
  if (secs < moves.length * MIN_SECS_PER_MOVE || secs < 5) return 'too-fast';
  return '';
}
