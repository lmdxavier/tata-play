// 每日一图（v5，2026-11-26 用户拍板，见 docs\多人与排行.md）：全服同一张图（种子 = UTC 日期）、比过关用时、不能用道具 / 续时；
// 每天前 3 次算成绩，看广告 +1 次；按当天最好成绩排名；次日结算金币。纯逻辑，Node 能跑。
// v6：真榜（Cloudflare，Net.ts）+ 机器人补位：机器人数 = 180 − 真人数（真人多了机器人逐步减少），合并排名见 mergeBoard。
/** 和 SortSim.rng 同一个算法（mulberry32）；不 import，Node 测试不带扩展名解析不了 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const DAILY_FREE = 3, DAILY_AD = 1;
export const DAILY_BOTS = 180;
export const dayOf = (ms: number) => Math.floor(ms / 864e5);
export const dayStr = (day: number) => new Date(day * 864e5).toISOString().slice(0, 10);
/** 离下一张图（UTC 0 点）还有几秒 */
export const secsToNext = (ms: number) => Math.max(0, Math.ceil(((dayOf(ms) + 1) * 864e5 - ms) / 1000));
/** 时间上限：超过就算这次没完成（防止挂着不动）。按参考步数给得很宽 */
export const capFor = (steps: number) => Math.max(240, Math.ceil(steps * 5 / 30) * 30);

export interface Bot { name: string; face: number; secs: number }
const NA = ['Mia', 'Leo', 'Kai', 'Luna', 'Zoe', 'Max', 'Ava', 'Finn', 'Ivy', 'Noah', 'Ella', 'Sam', 'Nora', 'Jay', 'Lily', 'Owen', 'Ruby', 'Theo', 'Aria', 'Ben',
  'Yuki', 'Hana', 'Mei', 'Rin', 'Sora', 'Lea', 'Tom', 'Emi', 'Ana', 'Dani', 'Lucas', 'Sofia', 'Omar', 'Lina', 'Ravi', 'Maya', 'Ezra', 'Nina', 'Ali', 'Tara'];
const NB = ['Fox', 'Cat', 'Bee', 'Star', 'Moon', 'Pop', 'Joy', 'Sky', 'Pixel', 'Berry', 'Cookie', 'Mochi', 'Panda', 'Bunny', 'Sun', 'Leaf'];
/** 当天全部机器人（同一天永远一样）：用时按「参考步数 × 1.75 秒」为中位数的对数正态分布，最快约中位数的 6 成 */
export function bots(day: number, steps: number): Bot[] {
  const r = rng(day * 977 + 3); const med = Math.max(25, steps * 1.75); const out: Bot[] = []; const used = new Set<string>();
  for (let i = 0; i < DAILY_BOTS; i++) {
    let name = '';
    for (let g = 0; g < 20; g++) {
      const a = NA[Math.floor(r() * NA.length)], b = NB[Math.floor(r() * NB.length)], k = r();
      name = k < 0.35 ? a + '_' + (10 + Math.floor(r() * 90)) : k < 0.65 ? a + b : k < 0.85 ? b + a : a;
      if (!used.has(name)) break;
    }
    used.add(name);
    const u = Math.max(1e-6, r()), v = r(); let z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    if (z < -2.1) z = -2.1 + r() * 0.9;   // 最快的几个不压在同一个下限上（v5 初版前 3 名同一个成绩，一看就是假的）
    const secs = Math.round(med * Math.exp(z * 0.28) * 10) / 10;
    out.push({ name, face: Math.floor(r() * 8), secs });
  }
  // 成绩不重复（榜上两个人用时一模一样看着假）：按快慢排好，和前一名一样的往后挪 0.1–0.3 秒
  const byT = out.slice().sort((a, b) => a.secs - b.secs);
  for (let i = 1; i < byT.length; i++) if (byT[i].secs <= byT[i - 1].secs) byT[i].secs = Math.round((byT[i - 1].secs + 0.1 + Math.floor(r() * 3) / 10) * 10) / 10;
  return out;
}
/** 现在已经「打过」的机器人：UTC 0 点有 35%，一天里越来越多，到 24 点全部（看着像有人陆续在玩） */
export function visibleBots(day: number, steps: number, ms: number): Bot[] {
  const all = bots(day, steps); const f = Math.min(1, Math.max(0, ms / 864e5 - day));
  return all.slice(0, Math.round(all.length * (0.35 + 0.65 * f)));
}
/** 由 uid 定的默认昵称 / 头像（和机器人同一套名字，混在榜上不突兀） */
export function nameFor(seed: number) {
  const r = rng(seed); const a = NA[Math.floor(r() * NA.length)], b = NB[Math.floor(r() * NB.length)], k = r();
  return { name: k < 0.5 ? a + '_' + (10 + Math.floor(r() * 90)) : a + b, face: Math.floor(r() * 8) };
}
/** 名次：比我快的人数 + 1（同成绩算我在前） */
export const rankOf = (secs: number, list: Bot[]) => 1 + list.filter(b => b.secs < secs).length;
/** 次日结算金币 */
export function rewardOf(rank: number, total: number) { return rank === 1 ? 300 : rank <= 3 ? 200 : rank <= 10 ? 120 : rank <= Math.ceil(total * 0.3) ? 60 : 30; }

export interface DailyRec { day: number; tries: number; ad: boolean; best: number; steps: number; pend: { day: number; best: number; steps: number } | null; carry: number }
/** 本机记录（localStorage）：今天打了几次、看没看广告加次数、最好成绩；换天时把昨天的成绩挂到 pend 等结算 */
export class DailyStore {
  d: DailyRec = { day: 0, tries: 0, ad: false, best: 0, steps: 0, pend: null, carry: 0 };
  private key: string;
  constructor(key: string) { this.key = key; try { const s = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; if (s) this.d = Object.assign(this.d, JSON.parse(s)); } catch (e) { } }
  save() { try { if (typeof localStorage !== 'undefined') localStorage.setItem(this.key, JSON.stringify(this.d)); } catch (e) { } }
  /** 换天：返回 true = 有昨天（或更早）的成绩待结算 */
  roll(today: number) {
    if (this.d.day >= today) return !!this.d.pend;   // 时钟往回调：不重置（否则来回调时间就能无限刷次数）
    if (this.d.day && this.d.best > 0) {
      const p = this.d.pend; if (p) this.d.carry = (this.d.carry || 0) + rewardOf(rankOf(p.best, bots(p.day, p.steps)), DAILY_BOTS + 1);   // 上一笔没领就又换天：先折成金币存着，不丢
      this.d.pend = { day: this.d.day, best: this.d.best, steps: this.d.steps };
    }
    this.d.day = today; this.d.tries = 0; this.d.ad = false; this.d.best = 0; this.d.steps = 0; this.save();
    return !!this.d.pend;
  }
  get total() { return DAILY_FREE + (this.d.ad ? DAILY_AD : 0); }
  get left() { return Math.max(0, this.total - this.d.tries); }
  get canAd() { return !this.d.ad && this.d.tries >= DAILY_FREE; }
  /** 记一次成绩；返回是否刷新了最好成绩 */
  finish(secs: number) { const nb = !this.d.best || secs < this.d.best; if (nb) this.d.best = secs; this.save(); return nb; }
}

// ---------------- v6：真榜 + 机器人合并 ----------------
export interface SrvRow { name: string; face: number; secs: number; you?: boolean }
export interface SrvBoard { day: number; total: number; top: SrvRow[]; me: { rank: number; secs: number } | null; faster?: { secs: number; n: number } }
export interface MRow { name: string; face: number; secs: number; me: boolean; rank: number }
/** 当天参与排名的机器人：真人越多越少（180 − 真人数）；ms = null 表示全天（次日结算 / 预计奖励用），否则按时间逐渐出现 */
export function botsFor(day: number, steps: number, realTotal: number, ms: number | null): Bot[] {
  const all = ms === null ? bots(day, steps) : visibleBots(day, steps, ms);
  return all.slice(0, Math.max(0, Math.min(all.length, DAILY_BOTS - realTotal)));
}
/** 合并榜：服务器真人（前 5 + 我的真名次）+ 机器人 + 我。srv = null（离线 / 还没拉到）= 只有机器人，和 v5 一样 */
export function mergeBoard(day: number, steps: number, myBest: number, me: { name: string; face: number }, srv: SrvBoard | null, ms: number | null): { top: MRow[]; rank: number; total: number; real: number } {
  const srvHasMe = !!(srv && srv.me);
  const realOthers = srv ? srv.total - (srvHasMe ? 1 : 0) : 0;
  const bl = botsFor(day, steps, realOthers, ms);   // 和 v5 一样：180 个机器人 + 我；每多一个真人少一个机器人
  let realFaster = 0;
  if (srv && myBest) realFaster = srv.me && srv.me.secs === myBest ? srv.me.rank - 1
    : srv.faster && srv.faster.secs === myBest ? srv.faster.n                       // 服务器还没收到我这次：问过「比这个用时快的有几个」
    : srv.top.filter(r => !r.you && r.secs < myBest).length;                         // 都没有（旧数据）：只能数前 5 里比我快的
  const rank = myBest ? 1 + realFaster + bl.filter(b => b.secs < myBest).length : 0;
  const total = realOthers + bl.length + (myBest ? 1 : 0);
  type R = { name: string; face: number; secs: number; me: boolean };
  const rows: R[] = bl.map(b => ({ name: b.name, face: b.face, secs: b.secs, me: false }));
  if (srv) for (const r of srv.top) if (!r.you) rows.push({ name: r.name, face: r.face, secs: r.secs, me: false });
  rows.sort((a, b) => a.secs - b.secs);
  if (myBest && rank <= 5) rows.splice(rank - 1, 0, { name: me.name, face: me.face, secs: myBest, me: true });   // 我按算出的名次插进去（打平时和服务器先后一致，前 5 名次号不重复）
  const top: MRow[] = rows.slice(0, 5).map((r, i) => ({ ...r, rank: i + 1 }));
  return { top, rank, total, real: realOthers + (myBest ? 1 : 0) };
}
