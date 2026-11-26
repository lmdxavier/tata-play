// v9（2026-11-27）异步对战 + 战力：客户端、服务器（_api/Pvp.ts 副本）、Node 测试共用的纯逻辑。数值见 huojia\docs\多人与排行.md「对战 / 战力具体数值」。
// 不 import 别的文件（Node strip-types 解析不了不带扩展名的 import）；名字 / 头像由调用方用 Daily.nameFor(seed) 算。
export const ELO0 = 1000, ELO_K = 32, PASSIVE_CAP = 50;      // 开局 1000；K = 32；每人每天被动掉分上限 50
export const PVP_FREE = 5, PVP_AD = 3, PVP_REFRESH = 3;      // 每天免费 5 场 + 看广告最多 3 场；「换一批」每天 3 次
export const PVP_UNLOCK = 12;                                // 打过第 12 关才开（和每日挑战一样）
export const PVP_AHEAD = 5;                                  // 比的关最多比我的进度高 5 关（且用到的机制我都学过）
export const POWER_BOTS = 120;                               // 战力榜机器人：120 − 真人数
export const DAILY_PTS_MAX = 350;

export function prng(seed: number) {   // mulberry32（和 SortSim / Daily 的 rng 同一种）
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r: () => number) => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
export const hash2 = (a: number, b: number) => (Math.imul(a ^ 0x9e3779b9, 2654435761) ^ Math.imul(b + 0x7f4a7c15, 40503)) >>> 0;

// ---- Elo ----
export const expectOf = (me: number, opp: number) => 1 / (1 + Math.pow(10, (opp - me) / 400));
/** score：1 赢 / 0 输 / 0.5 平；返回我这边加减（对手同步反向） */
export const eloDelta = (me: number, opp: number, score: number) => Math.round(ELO_K * (score - expectOf(me, opp)));
export const winLose = (me: number, opp: number) => ({ win: eloDelta(me, opp, 1), lose: eloDelta(me, opp, 0) });

// ---- 时间 ----
export const dayOfMs = (ms: number) => Math.floor(ms / 864e5);
export const weekOf = (day: number) => Math.floor((day + 3) / 7);       // UTC 周一 0 点换周（1970-01-01 是周四）
export const weekStart = (week: number) => week * 7 - 3;                 // 这周第一天（UTC 天数）
export const weekFrac = (ms: number) => Math.min(1, Math.max(0, (ms / 864e5 - weekStart(weekOf(dayOfMs(ms)))) / 7));

// ---- 战力 ----
/** 每日一图名次分：第 1 名 50 / 前 3 名 40 / 前 10 名 30 / 前 30% 20 / 参加 10 */
export const dailyPts = (rank: number, total: number) => rank === 1 ? 50 : rank <= 3 ? 40 : rank <= 10 ? 30 : rank <= Math.ceil(total * 0.3) ? 20 : 10;
/** 连续挑战加成（%）：连续每天至少打 1 场 → 每天 +2%，最多 +10%；streak = 截至今天连续的天数（昨天打了今天还没打也算，断一天清零） */
export const streakBonus = (streak: number) => Math.min(10, 2 * Math.max(0, streak));
export const liveStreak = (streak: number, lastDay: number, today: number) => lastDay >= today - 1 ? streak : 0;
export function powerOf(best: number, dsum: number, rating: number, streak: number) {
  return Math.round((Math.max(0, best) * 10 + Math.min(DAILY_PTS_MAX, dsum) + rating) * (1 + streakBonus(streak) / 100));
}
export interface PowerParts { lv: number; daily: number; rating: number; bonus: number; power: number }
export const powerParts = (best: number, dsum: number, rating: number, streak: number): PowerParts =>
  ({ lv: Math.max(0, best) * 10, daily: Math.min(DAILY_PTS_MAX, dsum), rating, bonus: streakBonus(streak), power: powerOf(best, dsum, rating, streak) });

// ---- 周结算：金币 + 段位（我定，2026-11-27） ----
export type Tier = 0 | 1 | 2 | 3;   // 0 铜牌 / 1 银牌 / 2 金牌 / 3 王冠
export const tierOf = (rank: number, total: number): Tier => rank <= 3 ? 3 : rank <= Math.ceil(total * 0.1) ? 2 : rank <= Math.ceil(total * 0.4) ? 1 : 0;
export const weekCoins = (rank: number, total: number) => rank === 1 ? 500 : rank <= 3 ? 300 : rank <= Math.ceil(total * 0.1) ? 200 : rank <= Math.ceil(total * 0.4) ? 100 : 50;
export const TIER_ICON = ['ic_medal_b', 'ic_medal_s', 'ic_medal_g', 'ic_crown'];
export const TIER_NAME: [string, string][] = [['铜牌', 'Bronze'], ['银牌', 'Silver'], ['金牌', 'Gold'], ['王冠', 'Crown']];
/** 结算后对战分往 1000 拉回一半 */
export const pullBack = (r: number) => Math.round(ELO0 + (r - ELO0) / 2);

// ---- 战力榜机器人（冷启动；每周一套，周内慢慢涨到底） ----
export interface PBot { seed: number; power: number }
export function powerBots(week: number, realOthers: number, ms: number | null): PBot[] {
  const r = prng(hash2(week, 77001)); const out: PBot[] = [];
  const frac = ms === null ? 1 : weekFrac(ms);
  for (let i = 0; i < POWER_BOTS; i++) {
    const best = Math.round(14 + 150 * Math.pow(r(), 1.7)), rating = Math.round(ELO0 + gauss(r) * 110), dsum = Math.round(r() * r() * 300), st = Math.floor(r() * 6);
    const full = powerOf(best, dsum, rating, st);
    out.push({ seed: hash2(week, 91000 + i), power: Math.round(full * (0.86 + 0.14 * frac)) });
  }
  out.sort((a, b) => b.power - a.power);
  return out.slice(0, Math.max(0, POWER_BOTS - realOthers));
}

// ---- 对手 ----
/** 关卡表里每关：初始盘面 + 参考步数 + intro（用到的机制里最晚教的那关；普通关 = 0） */
export interface LvData { cells: unknown[]; pos: number[][]; steps: number; intro: number }
export const eligible = (n: number, d: { intro: number } | undefined, myBest: number) => !!d && n >= 3 && n <= myBest + PVP_AHEAD && d.intro <= myBest;
/** 机器人每参考步秒数：对战分越高越快（1000 分约 1.5 秒；+300 约 1.06 秒；−300 约 2.1 秒） */
export const botSpt = (rating: number) => 1.5 * Math.pow(2, (ELO0 - rating) / 600);
export function botSecs(seed: number, steps: number, rating: number) {
  const r = prng(hash2(seed, 31337)); const f = Math.exp(gauss(r) * 0.15);
  return Math.max(steps * 0.55, Math.round(steps * botSpt(rating) * f * 10) / 10);
}
/** 3 个对手的目标分：略低 / 持平 / 略高 */
export function targets(me: number, r: () => number) {
  return [me - 90 - Math.round(r() * 120), me - 40 + Math.round(r() * 80), me + 90 + Math.round(r() * 120)];
}
export const RANGES: [number, number][] = [[-260, -60], [-60, 60], [60, 260]];

export interface Offer { key: string; id: string; name: string; face: number; rating: number; power: number; n: number; secs: number; win: number; lose: number; bot: boolean; state: '' | 'go' | 'win' | 'lose'; at: number; delta?: number }
export interface League { rating: number; best: number; power: number; parts: PowerParts; streak: number; today: number; refreshLeft: number; offers: Offer[];
  board: { top: { name: string; face: number; power: number; you?: boolean; tier?: number }[]; total: number; ahead: number; me: number };
  defense: { n: number; delta: number } | null; settle: { week: number; rank: number; total: number; coins: number; tier: number } | null; tier: number; day: number }
/** 合并战力榜：服务器真人前 5 + 我（ahead = 战力比我高的真人数）+ 机器人；和周结算同一算法 */
export function mergePower(week: number, myPower: number, me: { name: string; face: number }, srv: League['board'] | null, ms: number | null) {
  const realOthers = srv ? Math.max(0, srv.total - 1) : 0;
  const bl = powerBots(week, realOthers, ms);
  const rank = 1 + (srv ? srv.ahead : 0) + bl.filter(b => b.power > myPower).length;
  type R = { name: string; face: number; power: number; me: boolean; seed: number; tier?: number };
  const rows: R[] = bl.map(b => ({ name: '', face: 0, power: b.power, me: false, seed: b.seed }));
  if (srv) for (const t of srv.top) if (!t.you) rows.push({ name: t.name, face: t.face, power: t.power, me: false, seed: -1, tier: t.tier });
  rows.sort((a, b) => b.power - a.power);
  if (rank <= 5) rows.splice(rank - 1, 0, { name: me.name, face: me.face, power: myPower, me: true, seed: -1 });
  return { top: rows.slice(0, 5).map((r, i) => ({ ...r, rank: i + 1 })), rank, total: realOthers + bl.length + 1 };
}
