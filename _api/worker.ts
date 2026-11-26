// tata-play 的 Cloudflare Worker：静态文件照旧由 assets 直接给（不经过这里）；只有 /api/ 开头的请求进来。
// 货架整理（huojia）：每日一图真榜（v6）+ 合作好友房（v7，HjRoom：WebSocket 转发，Durable Object 休眠 API）。2026-11-26，源码在 游戏开发\项目\huojia\server\，部署时复制到 tata-play 的 _api\。
// 存储：每天一个 Durable Object（SQLite），免费层可用、不用在后台建数据库。只存 昵称 / 头像号 / 用时，不收行为数据。
import { DurableObject } from 'cloudflare:workers';
import { verify, verifyRun } from './replay.ts';
import type { DayData } from './replay.ts';
import TABLE from './daily_table.json';
import LEVELS from './level_table.json';
import { nameFor, botsFor } from './Daily.ts';
import { ELO0, PVP_FREE, PVP_AD, PVP_REFRESH, PVP_UNLOCK, PASSIVE_CAP, prng, hash2, eloDelta, winLose, dayOfMs, weekOf, dailyPts, liveStreak, powerOf, powerParts, tierOf, weekCoins, pullBack, powerBots, eligible, botSecs, targets, RANGES } from './Pvp.ts';
import type { LvData, Offer, League } from './Pvp.ts';

interface Env { HJ_DAILY: DurableObjectNamespace<HjDaily>; HJ_ROOM: DurableObjectNamespace<HjRoom>; HJ_LEAGUE: DurableObjectNamespace<HjLeague> }
const T = TABLE as unknown as { from: number; to: number; days: Record<string, DayData> };

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '86400' };
const json = (o: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...extra } });
const dayNow = () => Math.floor(Date.now() / 864e5);
const UID = /^[0-9a-f]{16,32}$/;
// 昵称 / 头像不收客户端的：服务器按 uid 用同一个 nameFor 算（防止有人改包发脏话 / 广告；以后做改昵称要加审核）
const MAX_UID_PER_IP = 8;   // 同一 IP 一天最多几个 uid 上榜（防刷小号；手机运营商共用 IP，给宽一点）

export interface Row { name: string; face: number; secs: number; you?: boolean }
export interface BoardOut { day: number; total: number; top: Row[]; me: { rank: number; secs: number } | null; faster?: { secs: number; n: number } }

export class HjDaily extends DurableObject<Env> {
  sql: SqlStorage;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env); this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS s (uid TEXT PRIMARY KEY, name TEXT, face INTEGER, secs REAL, at INTEGER, n INTEGER)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS s_secs ON s (secs, at)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS ip (ip TEXT, uid TEXT, PRIMARY KEY (ip, uid))');
  }
  submit(day: number, uid: string, name: string, face: number, secs: number, ip: string): BoardOut | { error: string } {
    if (ip) {
      const known = this.sql.exec('SELECT 1 FROM ip WHERE ip = ? AND uid = ?', ip, uid).toArray().length > 0;
      if (!known) {
        const n = (this.sql.exec('SELECT COUNT(*) AS c FROM ip WHERE ip = ?', ip).one() as { c: number }).c;
        if (n >= MAX_UID_PER_IP) return { error: 'ip-limit' };
        this.sql.exec('INSERT INTO ip VALUES (?, ?)', ip, uid);
      }
    }
    const old = this.sql.exec('SELECT secs FROM s WHERE uid = ?', uid).toArray()[0] as { secs: number } | undefined;
    if (!old) this.sql.exec('INSERT INTO s VALUES (?, ?, ?, ?, ?, 1)', uid, name, face, secs, Date.now());
    else if (secs < old.secs) this.sql.exec('UPDATE s SET name = ?, face = ?, secs = ?, at = ?, n = n + 1 WHERE uid = ?', name, face, secs, Date.now(), uid);
    else this.sql.exec('UPDATE s SET name = ?, face = ?, n = n + 1 WHERE uid = ?', name, face, uid);
    return this.board(day, uid);
  }
  /** secs > 0：顺便算「比这个用时快的真人有几个」（服务器还没收到我这次成绩时，客户端靠它算名次，不靠前 5 估） */
  board(day: number, uid: string, secs = 0): BoardOut {
    const total = (this.sql.exec('SELECT COUNT(*) AS c FROM s').one() as { c: number }).c;
    const top = (this.sql.exec('SELECT uid, name, face, secs FROM s ORDER BY secs, at LIMIT 5').toArray() as unknown as (Row & { uid: string })[])
      .map(r => r.uid === uid ? { name: r.name, face: r.face, secs: r.secs, you: true } : { name: r.name, face: r.face, secs: r.secs });
    const mine = uid ? this.sql.exec('SELECT secs, at FROM s WHERE uid = ?', uid).toArray()[0] as { secs: number; at: number } | undefined : undefined;
    const me = mine ? { rank: 1 + (this.sql.exec('SELECT COUNT(*) AS c FROM s WHERE secs < ? OR (secs = ? AND at < ?)', mine.secs, mine.secs, mine.at).one() as { c: number }).c, secs: mine.secs } : null;
    const out: BoardOut = { day, total, top, me };
    if (secs > 0) out.faster = { secs, n: (this.sql.exec('SELECT COUNT(*) AS c FROM s WHERE secs < ? AND uid != ?', secs, uid).one() as { c: number }).c };
    return out;
  }
  /** v9：当天全部真人成绩（联赛 DO 换天时算每日名次分用） */
  all(): { uid: string; secs: number; at: number }[] { return this.sql.exec('SELECT uid, secs, at FROM s').toArray() as unknown as { uid: string; secs: number; at: number }[]; }
}

// ---------------- 合作好友房（v7） ----------------
// 一个房间号一个 Durable Object。只做转发 + 记住每人最近一次的盘面快照 / 还没被确认的送货（断线重连用）；不判对错（合作没有成绩，不防作弊）。
// 状态存 SQLite（kv 表）：休眠 API 下对象随时可能被回收，内存里的东西会丢。房间 6 小时没人动就清空（alarm）。
interface Give { id: number; fc: number; fs: number; tc: number; ts: number; kind: number }
interface RoomSt { created: number; diff: number; host: string; uids: (string | null)[]; left: boolean[]; round: number; seed: number; ended: boolean; snaps: (unknown[] | null)[]; gots: number[][]; cls: number[]; pcls: number[]; gives: Give[][]; time: number; last: number }
const ROOM_IDLE = 6 * 3600e3, MSG_MAX = 32768;
export class HjRoom extends DurableObject<Env> {
  sql: SqlStorage; st: RoomSt | null = null;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env); this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));   // 心跳不唤醒对象（不计费）
  }
  load(): RoomSt | null { if (this.st) return this.st; const r = this.sql.exec('SELECT v FROM kv WHERE k = ?', 'st').toArray()[0] as { v: string } | undefined; this.st = r ? JSON.parse(r.v) : null; return this.st; }
  save() { if (!this.st) return; this.st.last = Date.now(); this.sql.exec('INSERT OR REPLACE INTO kv VALUES (?, ?)', 'st', JSON.stringify(this.st)); }
  /** 建房：空房（或 6 小时没人动的旧房）才给 */
  async init(uid: string, diff: number): Promise<boolean> {
    const st = this.load();
    if (st && Date.now() - st.last < ROOM_IDLE) return false;   // 6 小时内用过的房号不重发（原来的人可能还开着页面在自动重连，会被拉进陌生人的局）
    this.st = { created: Date.now(), diff, host: uid, uids: [uid, null], left: [false, false], round: 0, seed: 0, ended: false, snaps: [null, null], gots: [[], []], cls: [0, 0], pcls: [0, 0], gives: [[], []], time: 0, last: Date.now() };
    this.save(); await this.ctx.storage.setAlarm(Date.now() + ROOM_IDLE); return true;
  }
  async alarm() { const st = this.load(); if (st && Date.now() - st.last < ROOM_IDLE) { await this.ctx.storage.setAlarm(st.last + ROOM_IDLE); return; } this.sql.exec('DELETE FROM kv'); this.st = null; for (const ws of this.ctx.getWebSockets()) try { ws.close(1000, 'expired'); } catch (e) { } }
  peerInfo(seat: number) { const st = this.st!; const uid = st.uids[seat]; if (!uid) return null; const nf = nameFor(parseInt(uid.slice(0, 8), 16)); return { uid, name: nf.name, face: nf.face, on: this.sockOf(seat).length > 0, left: !!(st.left && st.left[seat]) }; }
  sockOf(seat: number) { return this.ctx.getWebSockets().filter(w => { const a = w.deserializeAttachment() as { seat: number } | null; return a && a.seat === seat; }); }
  send(seat: number, o: unknown) { const s = JSON.stringify(o); for (const w of this.sockOf(seat)) try { w.send(s); } catch (e) { } }
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url); const uid = url.searchParams.get('uid') || '';
    const st = this.load();
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    const fail = (why: string) => { server.accept(); server.send(JSON.stringify({ t: 'err', why })); server.close(1000, why); return new Response(null, { status: 101, webSocket: client }); };
    if (!UID.test(uid)) return fail('uid');
    if (!st || Date.now() - st.last > ROOM_IDLE) return fail('no-room');
    let seat = st.uids.indexOf(uid);
    if (seat < 0) { if (st.uids[1] === null) { st.uids[1] = uid; seat = 1; } else return fail('full'); }
    st.left[seat] = false;
    for (const w of this.sockOf(seat)) { try { w.serializeAttachment(null); w.send(JSON.stringify({ t: 'err', why: 'replaced' })); w.close(1000, 'replaced'); } catch (e) { } }   // 同一个人开了新页面：旧的踢掉（发 err 让旧页面别自动重连回来抢）
    this.ctx.acceptWebSocket(server); server.serializeAttachment({ seat, uid });
    this.save();
    server.send(JSON.stringify({ t: 'hello', seat, code: url.searchParams.get('code') || '', diff: st.diff, round: st.round, peers: [this.peerInfo(0), this.peerInfo(1)] }));
    this.send(1 - seat, { t: 'peer', seat, peer: this.peerInfo(seat) });
    if (st.round > 0) server.send(JSON.stringify({ t: 'resume', seed: st.seed, diff: st.diff, round: st.round, snaps: st.snaps, gots: st.gots, cls: st.cls, pcls: st.pcls, gives: st.gives[seat], time: st.time, ended: st.ended }));
    else if (st.uids[0] && st.uids[1] && this.sockOf(0).length && this.sockOf(1).length) this.start();
    return new Response(null, { status: 101, webSocket: client });
  }
  start(diff?: number) {
    const st = this.st!; st.round++; st.seed = 1 + Math.floor(Math.random() * 2e9); if (diff !== undefined) st.diff = diff;
    st.snaps = [null, null]; st.gots = [[], []]; st.cls = [0, 0]; st.pcls = [0, 0]; st.gives = [[], []]; st.time = 0; st.ended = false; this.save();
    for (const s of [0, 1]) this.send(s, { t: 'start', seed: st.seed, diff: st.diff, round: st.round });
  }
  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    if (typeof data !== 'string' || data.length > MSG_MAX) return;
    const a = ws.deserializeAttachment() as { seat: number } | null; if (!a) return;
    const st = this.load(); if (!st) return;
    let o: any; try { o = JSON.parse(data); } catch (e) { return; }
    const seat = a.seat, peer = 1 - seat;
    if (o.t === 'm' && o.m && typeof o.m.t === 'string') {
      const m = o.m;
      if (m.r !== st.round || st.round <= 0) return;   // 上一局路上的消息：不存不转发
      if (m.t === 'act') {
        if (!Array.isArray(m.snap) || m.snap.length > 24) return;
        st.snaps[seat] = m.snap;
        if (Array.isArray(m.got)) { st.gots[seat] = m.got.filter((x: unknown) => typeof x === 'number').slice(-40); st.gives[seat] = st.gives[seat].filter(g => st.gots[seat].indexOf(g.id) < 0); }   // 我确认收到的送货：从「待我收」里删
        if (typeof m.cl === 'number') st.cls[seat] = m.cl; if (typeof m.pcl === 'number') st.pcls[seat] = m.pcl;
        if (m.give) {
          const g = m.give, I = (x: unknown, a: number, b: number) => typeof x === 'number' && Number.isInteger(x) && x >= a && x <= b;
          if (!(typeof g.id === 'number' && I(g.fc, 0, 63) && I(g.fs, 0, 2) && I(g.tc, 0, 63) && I(g.ts, 0, 2) && I(g.kind, 0, 200))) return;   // 只收 6 个整数，别的字段丢掉
          const clean = { id: g.id, fc: g.fc, fs: g.fs, tc: g.tc, ts: g.ts, kind: g.kind }; m.give = clean;
          if (!st.gives[peer].some(x => x.id === clean.id)) { st.gives[peer].push(clean); if (st.gives[peer].length > 60) st.gives[peer].shift(); }
        }
        if (seat === 0 && typeof m.time === 'number') st.time = m.time;
        this.save();
      } else if (m.t === 'time') { if (seat === 0 && typeof m.v === 'number') { st.time = m.v; this.save(); } }
      else if (m.t === 'end') { st.ended = true; this.save(); }
      if (['act', 'want', 'emo', 'time', 'end'].indexOf(m.t) >= 0) this.send(peer, { t: 'relay', m });
    } else if (o.t === 'again') { if (st.uids[0] && st.uids[1] && (st.ended || st.round === 0)) this.start(seat === 0 && typeof o.diff === 'number' ? Math.max(0, Math.min(2, o.diff | 0)) : undefined); }   // 这局结束了才开新局（不会把对方正在玩的局重开）
    else if (o.t === 'leave') { st.left[seat] = true; this.save(); ws.serializeAttachment(null); this.send(peer, { t: 'peer', seat, peer: { ...this.peerInfo(seat), on: false, left: true } }); try { ws.close(1000, 'leave'); } catch (e) { } }
  }
  async webSocketClose(ws: WebSocket) { const a = ws.deserializeAttachment() as { seat: number } | null; if (!a || !this.load()) return; this.save(); this.send(1 - a.seat, { t: 'peer', seat: a.seat, peer: { ...this.peerInfo(a.seat), on: this.sockOf(a.seat).some(w => w !== ws) } }); }
  async webSocketError(ws: WebSocket) { await this.webSocketClose(ws); }
}

// ---------------- 异步对战 + 战力（v9，2026-11-27） ----------------
// 全服一个 Durable Object（hj-league）：存每人 对战分 / 进度 / 推关成绩（每关最好用时，服务器重放过）/ 对手 / 被挑战记录 / 每日一图名次分 / 周结算。
// 人少时一个对象够用（几千人内）；人多了再按 uid 分片。机器人对手的用时生成时就存进 offer，提交时照存的比。
// 数值全在 Pvp.ts（和客户端同一份）。每次请求先 tick()：换天把昨天（往前最多 7 天）的每日一图名次折成名次分；换周按战力结算、对战分拉回一半。
const LT = LEVELS as unknown as { max: number; lv: Record<string, LvData> };
const PVP_MAX_DAY = PVP_FREE + PVP_AD, PVP_WALL_SLACK = 20;
interface PRow { uid: string; rating: number; best: number; vbest: number; streak: number; lastDay: number; power: number; dsum: number; tier: number; week: number }
interface OffRow { day: number; refresh: number; battles: number; fought: string[]; offers: Offer[]; last?: { key: string; state: string; delta: number } }
export class HjLeague extends DurableObject<Env> {
  sql: SqlStorage;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env); this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS p (uid TEXT PRIMARY KEY, rating INTEGER, best INTEGER, vbest INTEGER, streak INTEGER, lastDay INTEGER, power INTEGER, dsum INTEGER, tier INTEGER, week INTEGER, created INTEGER)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS p_rating ON p (rating)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS p_power ON p (week, power)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS rec (uid TEXT, n INTEGER, secs REAL, at INTEGER, PRIMARY KEY (uid, n))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS off (uid TEXT PRIMARY KEY, v TEXT)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS def (uid TEXT, day INTEGER, n INTEGER, loss INTEGER, delta INTEGER, PRIMARY KEY (uid, day))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS dp (uid TEXT, day INTEGER, pts INTEGER, PRIMARY KEY (uid, day))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS st (week INTEGER, uid TEXT, rank INTEGER, total INTEGER, coins INTEGER, tier INTEGER, PRIMARY KEY (week, uid))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS ipu (ip TEXT, day INTEGER, uid TEXT, PRIMARY KEY (ip, day, uid))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v INTEGER)');
  }
  now() { const sh = this.kv('shift'); return Date.now() + (sh > 0 ? sh : 0); }
  today() { return dayOfMs(this.now()); }
  kv(k: string, v?: number): number { if (v !== undefined) { this.sql.exec('INSERT OR REPLACE INTO kv VALUES (?, ?)', k, v); return v; } const r = this.sql.exec('SELECT v FROM kv WHERE k = ?', k).toArray()[0] as { v: number } | undefined; return r ? r.v : -1; }
  /** 测试用：把服务器时间往后拨（只有 wrangler dev 本地才开，见 fetch 里的 hjtest 判断） */
  async testShift(ms: number) { this.kv('shift', (this.kv('shift') > 0 ? this.kv('shift') : 0) + ms); }
  pRow(uid: string): PRow | null { return (this.sql.exec('SELECT * FROM p WHERE uid = ?', uid).toArray()[0] as unknown as PRow) || null; }
  powerFor(p: PRow, today: number) { return powerOf(p.best, p.dsum, p.rating, liveStreak(p.streak, p.lastDay, today)); }
  savePower(p: PRow, today: number) { p.power = this.powerFor(p, today); this.sql.exec('UPDATE p SET rating = ?, best = ?, vbest = ?, streak = ?, lastDay = ?, power = ?, dsum = ?, tier = ?, week = ? WHERE uid = ?', p.rating, p.best, p.vbest, p.streak, p.lastDay, p.power, p.dsum, p.tier, p.week, p.uid); }
  /** 取 / 建玩家；ip 限新号：同一 IP 每天最多 8 个新 uid */
  player(uid: string, ip: string, create: boolean): PRow | 'ip-limit' | null {
    const p = this.pRow(uid); if (p || !create) return p;
    const day = this.today();
    if (ip) { const n = (this.sql.exec('SELECT COUNT(*) AS c FROM ipu WHERE ip = ? AND day = ?', ip, day).one() as { c: number }).c; if (n >= 8) return 'ip-limit'; this.sql.exec('INSERT OR IGNORE INTO ipu VALUES (?, ?, ?)', ip, day, uid); }
    const dsum = this.dsumOf(uid, day);
    this.sql.exec('INSERT INTO p VALUES (?, ?, 0, 0, 0, -9, 0, ?, 0, ?, ?)', uid, ELO0, dsum, weekOf(day), this.now());
    const q = this.pRow(uid)!; this.savePower(q, day); return q;
  }
  dsumOf(uid: string, today: number) { return (this.sql.exec('SELECT COALESCE(SUM(pts), 0) AS s FROM dp WHERE uid = ? AND day >= ? AND day < ?', uid, today - 7, today).one() as { s: number }).s; }
  /** 换天 / 换周的维护（懒执行：每个请求先跑一次） */
  async tick() {
    const today = this.today();
    let done = this.kv('dayDone'); if (done < 0) done = this.kv('dayDone', today - 1);
    if (done < today - 1) {
      let upTo = today - 1;
      for (let d = Math.max(done + 1, today - 7); d <= today - 1; d++) if (!(await this.finalizeDaily(d))) { upTo = d - 1; break; }   // 拉不到那天的榜：下次再算，不跳过
      this.kv('dayDone', Math.max(done, upTo));
      for (const p of this.sql.exec('SELECT * FROM p').toArray() as unknown as PRow[]) { p.dsum = this.dsumOf(p.uid, today); this.savePower(p, today); }
      this.sql.exec('DELETE FROM ipu WHERE day < ?', today - 1); this.sql.exec('DELETE FROM def WHERE day < ?', today - 8); this.sql.exec('DELETE FROM dp WHERE day < ?', today - 9);
    }
    const wk = weekOf(today); let wd = this.kv('weekDone'); if (wd < 0) wd = this.kv('weekDone', wk - 1);
    if (wd < wk - 1) { this.settleWeek(wk - 1, today); this.kv('weekDone', wk - 1); }
  }
  async finalizeDaily(d: number): Promise<boolean> {
    const data = T.days[String(d)]; if (!data) return true;
    let rows: { uid: string; secs: number; at: number }[] = [];
    try { rows = await this.env.HJ_DAILY.get(this.env.HJ_DAILY.idFromName('hj-daily-' + d)).all(); } catch (e) { return false; }
    const bl = botsFor(d, data.steps, Math.max(0, rows.length - 1), null);
    const total = rows.length + bl.length;
    rows.forEach(r => {
      const faster = rows.filter(o => o.secs < r.secs || (o.secs === r.secs && o.at < r.at)).length;
      const rank = 1 + faster + bl.filter(b => b.secs < r.secs).length;
      this.sql.exec('INSERT OR REPLACE INTO dp VALUES (?, ?, ?)', r.uid, d, dailyPts(rank, total));
    });
    return true;
  }
  settleWeek(w: number, today: number) {
    const ps = (this.sql.exec('SELECT * FROM p WHERE week = ? ORDER BY power DESC', w).toArray() as unknown as PRow[]);
    const bl = powerBots(w, Math.max(0, ps.length - 1), null); const total = ps.length + bl.length;
    ps.forEach(p => {
      const rank = 1 + ps.filter(o => o.power > p.power).length + bl.filter(b => b.power > p.power).length;
      const tier = tierOf(rank, total);
      this.sql.exec('INSERT OR REPLACE INTO st VALUES (?, ?, ?, ?, ?, ?)', w, p.uid, rank, total, weekCoins(rank, total), tier);
      p.tier = tier;
    });
    for (const p of this.sql.exec('SELECT * FROM p').toArray() as unknown as PRow[]) {
      const s = ps.find(o => o.uid === p.uid); p.tier = s ? s.tier : 0;   // 上周没参加：段位清零
      p.rating = pullBack(p.rating); this.savePower(p, today);
    }
    this.sql.exec('DELETE FROM st WHERE week < ?', w - 4);
  }
  claimBest(p: PRow, claim: number) { if (Number.isInteger(claim) && claim > p.best) p.best = Math.max(p.best, Math.min(claim, p.vbest + 20, 100000)); }
  offRow(uid: string, today: number): OffRow {
    const r = this.sql.exec('SELECT v FROM off WHERE uid = ?', uid).toArray()[0] as { v: string } | undefined;
    let o: OffRow = r ? JSON.parse(r.v) : { day: today, refresh: 0, battles: 0, fought: [], offers: [] };
    if (o.day !== today) o = { day: today, refresh: 0, battles: 0, fought: [], offers: o.offers, last: o.last };
    return o;
  }
  saveOff(uid: string, o: OffRow) { this.sql.exec('INSERT OR REPLACE INTO off VALUES (?, ?)', uid, JSON.stringify(o)); }
  /** 刷 3 个对手：略低 / 持平 / 略高（按对战分）；先找真人（有我能打的关），没有就机器人 */
  genOffers(p: PRow, o: OffRow, today: number) {
    const r = prng(hash2(this.now() & 0x7fffffff, p.rating)); const tg = targets(p.rating, r);
    const myB = Math.max(PVP_UNLOCK, p.best);
    const levels = Object.keys(LT.lv).map(Number).filter(n => eligible(n, LT.lv[n], myB));
    const botLv = levels.filter(n => n >= Math.max(3, myB - 8)); const pickLv = botLv.length ? botLv : levels;
    const used = new Set<string>([p.uid, ...o.fought]); const offers: Offer[] = [];
    for (let i = 0; i < 3; i++) {
      let off: Offer | null = null;
      const cands = this.sql.exec('SELECT * FROM p WHERE rating >= ? AND rating <= ? AND uid != ? ORDER BY RANDOM() LIMIT 12', p.rating + RANGES[i][0], p.rating + RANGES[i][1], p.uid).toArray() as unknown as PRow[];
      for (const c of cands) {
        if (used.has(c.uid)) continue;
        let bestN = 0, bestK = 1e9, bestS = 0;
        for (const rr of this.sql.exec('SELECT n, secs FROM rec WHERE uid = ?', c.uid).toArray() as { n: number; secs: number }[]) {
          const d = LT.lv[rr.n]; if (!eligible(rr.n, d, myB)) continue; const k = rr.secs / d.steps;
          if (k < bestK || (k === bestK && rr.n > bestN)) { bestK = k; bestN = rr.n; bestS = rr.secs; }
        }
        if (!bestN) continue;
        const nf = nameFor(parseInt(c.uid.slice(0, 8), 16)); const wl = winLose(p.rating, c.rating);
        off = { key: Math.floor(r() * 2 ** 31).toString(36), id: c.uid, name: nf.name, face: nf.face, rating: c.rating, power: this.powerFor(c, today), n: bestN, secs: bestS, win: wl.win, lose: wl.lose, bot: false, state: '', at: 0 };
        used.add(c.uid); break;
      }
      if (!off && pickLv.length) {
        const seed = Math.floor(r() * 2 ** 31), rating = tg[i], n = pickLv[Math.floor(r() * pickLv.length)];
        const nf = nameFor(seed); const wl = winLose(p.rating, rating); const br = prng(seed);
        const bb = Math.max(PVP_UNLOCK, Math.round(myB + (br() - 0.5) * 6));   // 机器人战力和我接近，高低主要看对战分（卡片按对战分排：略低 / 持平 / 略高）
        off = { key: Math.floor(r() * 2 ** 31).toString(36), id: 'b' + seed, name: nf.name, face: nf.face, rating, power: powerOf(bb, Math.round(br() * br() * 80), rating, Math.floor(br() * 3)), n, secs: botSecs(seed, LT.lv[n].steps, rating), win: wl.win, lose: wl.lose, bot: true, state: '', at: 0 };
      }
      if (off) offers.push(off);
    }
    o.offers = offers;
  }
  /** 开打后一直没交（关页面 / 断网）：超过对手用时 + 3 分钟算输 */
  expire(p: PRow, o: OffRow, today: number) {
    let ch = false;
    o.offers.forEach((f, i) => { if (f.state === 'go' && this.now() - f.at > (f.secs + 180) * 1000) { this.resolve(p, o, i, 0, today); ch = true; } });
    return ch;
  }
  /** 出结果：score 1 赢 / 0 输 / 0.5 平；返回我这边的加减 */
  resolve(p: PRow, o: OffRow, slot: number, score: number, today: number): number {
    const f = o.offers[slot];
    const d = score === 1 ? f.win : score === 0 ? f.lose : eloDelta(p.rating, f.rating, 0.5);
    f.state = score > 0 ? 'win' : 'lose'; f.delta = d;   // 平局也记 'win'（只表示出过结果；结果看 delta）
    o.last = { key: f.key, state: score === 1 ? 'win' : score === 0.5 ? 'draw' : 'lose', delta: d };
    p.rating = Math.max(100, p.rating + d);
    p.streak = p.lastDay === today ? p.streak : p.lastDay === today - 1 ? p.streak + 1 : 1; p.lastDay = today; p.week = weekOf(today);
    this.savePower(p, today);
    if (!f.bot) {
      const q = this.pRow(f.id);
      if (q) {
        const dr = (this.sql.exec('SELECT * FROM def WHERE uid = ? AND day = ?', q.uid, today).toArray()[0] as { n: number; loss: number; delta: number } | undefined) || { n: 0, loss: 0, delta: 0 };
        let od = -d; if (od < 0) od = -Math.min(-od, Math.max(0, PASSIVE_CAP - dr.loss));   // 被动掉分每天最多 50
        q.rating = Math.max(100, q.rating + od); this.savePower(q, today);
        this.sql.exec('INSERT OR REPLACE INTO def VALUES (?, ?, ?, ?, ?)', q.uid, today, dr.n + 1, dr.loss + (od < 0 ? -od : 0), dr.delta + od);
      }
    }
    o.fought.push(f.id);
    return d;
  }
  boardOf(p: PRow, today: number): League['board'] {
    const wk = weekOf(today);
    const total = (this.sql.exec('SELECT COUNT(*) AS c FROM p WHERE week = ?', wk).one() as { c: number }).c;
    const top = (this.sql.exec('SELECT uid, power, tier FROM p WHERE week = ? ORDER BY power DESC LIMIT 5', wk).toArray() as { uid: string; power: number; tier: number }[])
      .map(r => { const nf = nameFor(parseInt(r.uid.slice(0, 8), 16)); return r.uid === p.uid ? { name: nf.name, face: nf.face, power: r.power, tier: r.tier, you: true } : { name: nf.name, face: nf.face, power: r.power, tier: r.tier }; });
    const ahead = (this.sql.exec('SELECT COUNT(*) AS c FROM p WHERE week = ? AND power > ? AND uid != ?', wk, p.power, p.uid).one() as { c: number }).c;
    return { top, total, ahead, me: p.power };
  }
  out(p: PRow, o: OffRow, today: number, extra: Record<string, unknown> = {}): League & Record<string, unknown> {
    const wk = weekOf(today);
    const dr = this.sql.exec('SELECT n, delta FROM def WHERE uid = ? AND day = ?', p.uid, today - 1).toArray()[0] as { n: number; delta: number } | undefined;
    const s = this.sql.exec('SELECT * FROM st WHERE week = ? AND uid = ?', wk - 1, p.uid).toArray()[0] as { week: number; rank: number; total: number; coins: number; tier: number } | undefined;
    const st = liveStreak(p.streak, p.lastDay, today);
    return { rating: p.rating, best: p.best, power: p.power, parts: powerParts(p.best, p.dsum, p.rating, st), streak: st, today: o.battles, refreshLeft: Math.max(0, PVP_REFRESH - o.refresh),
      offers: o.offers, board: this.boardOf(p, today), defense: dr ? { n: dr.n, delta: dr.delta } : null,
      settle: s ? { week: s.week, rank: s.rank, total: s.total, coins: s.coins, tier: s.tier } : null, tier: p.tier, day: today, foughtToday: p.lastDay === today, vbest: p.vbest, ...extra };
  }
  // ---- 接口 ----
  async me(uid: string, claim: number, ip: string) {
    await this.tick(); const today = this.today();
    const p = this.player(uid, ip, true); if (p === 'ip-limit' || !p) return { error: 'ip-limit' };
    this.claimBest(p, claim); p.week = weekOf(today); this.savePower(p, today);
    const o = this.offRow(uid, today); this.expire(p, o, today);
    if (!o.offers.length || o.offers.every(f => f.state === 'win' || f.state === 'lose')) this.genOffers(p, o, today);
    this.saveOff(uid, o); return this.out(p, o, today);
  }
  async rec(uid: string, n: number, secs: number, moves: unknown, claim: number, ip: string) {
    await this.tick(); const today = this.today();
    const d = LT.lv[n]; if (!d) return { error: 'no-level' };
    const why = verifyRun(d, moves, secs, Math.max(240, d.steps * 6 + 60)); if (why) return { error: 'verify', why };
    const p = this.player(uid, ip, true); if (p === 'ip-limit' || !p) return { error: 'ip-limit' };
    const s = Math.round(secs * 10) / 10;
    const old = this.sql.exec('SELECT secs FROM rec WHERE uid = ? AND n = ?', uid, n).toArray()[0] as { secs: number } | undefined;
    if (!old || s < old.secs) this.sql.exec('INSERT OR REPLACE INTO rec VALUES (?, ?, ?, ?)', uid, n, s, this.now());
    p.vbest = Math.max(p.vbest, n); p.best = Math.max(p.best, n); this.claimBest(p, claim); p.week = weekOf(today); this.savePower(p, today);
    return { ok: true, best: p.best, power: p.power };
  }
  async refresh(uid: string) {
    await this.tick(); const today = this.today();
    const p = this.pRow(uid); if (!p) return { error: 'no-player' };
    const o = this.offRow(uid, today); if (this.expire(p, o, today)) this.saveOff(uid, o);   // 超时判输已写进分数：提前返回前也要存，否则下次再判一次
    if (o.offers.some(f => f.state === 'go')) return { error: 'busy' };
    if (o.refresh >= PVP_REFRESH) return { error: 'refresh-limit' };
    o.refresh++; this.genOffers(p, o, today); this.saveOff(uid, o); return this.out(p, o, today);
  }
  async start(uid: string, slot: number, key: string) {
    await this.tick(); const today = this.today();
    const p = this.pRow(uid); if (!p) return { error: 'no-player' };
    const o = this.offRow(uid, today); if (this.expire(p, o, today)) { this.genOffers(p, o, today); this.saveOff(uid, o); }
    const f = o.offers[slot]; if (!f || f.state || f.key !== key) return { error: 'slot' };   // 客户端的对手单过期了（多标签页 / 校验失败后换了一批）
    if (o.offers.some(x => x.state === 'go')) return { error: 'busy' };
    if (o.battles >= PVP_MAX_DAY) return { error: 'limit' };
    o.battles++; f.state = 'go'; f.at = this.now(); this.saveOff(uid, o);
    return { ok: true, n: f.n, secs: f.secs, key: f.key, today: o.battles };
  }
  /** 打完：用时 < 对手 → 重放验证后算赢；= 平；> 输。forfeit = 主动退出 / 超过对手用时 */
  async submit(uid: string, slot: number, key: string, secs: number, moves: unknown, forfeit: boolean) {
    await this.tick(); const today = this.today();
    const p = this.pRow(uid); if (!p) return { error: 'no-player' };
    const o = this.offRow(uid, today);
    if (o.last && o.last.key === key) return { error: 'done', state: o.last.state, delta: o.last.delta };   // 已出结果（超时判输后才交上来 / 断网重交）
    const f = o.offers[slot]; if (!f || f.key !== key) return { error: 'slot' };
    if (f.state === 'win' || f.state === 'lose') return { error: 'done', state: f.state, delta: f.delta };   // 已出结果（比如超时判输后才交上来）
    if (f.state !== 'go') return { error: 'slot' };
    const oldPower = p.power; let score = 0;
    if (!forfeit) {
      if (typeof secs !== 'number' || !isFinite(secs) || secs <= 0) return { error: 'secs' };
      const s = Math.round(secs * 10) / 10;
      if (s <= f.secs) {   // 赢 / 平都要重放验证（独立检查 2026-11-27：平局原来不验证，发对手用时就永远不输）
        const wall = (this.now() - f.at) / 1000;
        // 墙钟：用时不能比开打到现在还长；也不能短太多（对战不能暂停：切后台停表想棋 → 拒收。开场横幅 + 网络约 3–5 秒，给 PVP_WALL_SLACK）
        const why = s > wall + 3 ? 'wall' : wall - s > PVP_WALL_SLACK ? 'paused' : verifyRun(LT.lv[f.n], moves, s, f.secs);
        if (why) { const d = this.resolve(p, o, slot, 0, today); this.genOffers(p, o, today); this.saveOff(uid, o); return this.out(p, o, today, { error: 'verify', why, delta: d }); }
        score = s < f.secs ? 1 : 0.5;
      } else score = 0;
    }
    const d = this.resolve(p, o, slot, score, today);
    const res = { result: score === 1 ? 'win' : score === 0.5 ? 'draw' : 'lose', delta: d, oldPower, opp: { name: f.name, face: f.face, secs: f.secs, n: f.n } };
    this.genOffers(p, o, today); this.saveOff(uid, o);
    return this.out(p, o, today, res);
  }
}

const stub = (env: Env, day: number) => env.HJ_DAILY.get(env.HJ_DAILY.idFromName('hj-daily-' + day));

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (url.pathname === '/api/ping') return json({ ok: true, day: dayNow(), table: [T.from, T.to] });
      if (url.pathname === '/api/hj/daily/board' && req.method === 'GET') {
        const day = +(url.searchParams.get('day') || dayNow()), uid = url.searchParams.get('uid') || '', secs = +(url.searchParams.get('secs') || 0);
        if (!Number.isInteger(day) || day < dayNow() - 7 || day > dayNow()) return json({ error: 'day' }, 400);
        if (uid && !UID.test(uid)) return json({ error: 'uid' }, 400);
        if (!(secs >= 0 && secs < 1e5)) return json({ error: 'secs' }, 400);
        return json(await stub(env, day).board(day, uid, secs), 200, { 'cache-control': 'no-store' });
      }
      if (url.pathname === '/api/hj/daily/submit' && req.method === 'POST') {
        const len = +(req.headers.get('content-length') || 0); if (len > 65536) return json({ error: 'size' }, 413);
        const b = await req.json() as { day: number; uid: string; name: string; face: number; secs: number; moves: unknown };
        const now = Date.now(), today = dayNow();
        // 当天的图；刚过 UTC 0 点 2 分钟内也收昨天的（最后一步和网络延迟）
        if (!(b.day === today || (b.day === today - 1 && now - today * 864e5 < 120e3))) return json({ error: 'day' }, 400);
        if (typeof b.uid !== 'string' || !UID.test(b.uid)) return json({ error: 'uid' }, 400);
        const data = T.days[String(b.day)]; if (!data) return json({ error: 'no-table' }, 503);
        const why = verify(data, b.moves, b.secs); if (why) return json({ error: 'verify', why }, 422);
        const nf = nameFor(parseInt(b.uid.slice(0, 8), 16));
        const secs = Math.round(b.secs * 10) / 10;
        const r = await stub(env, b.day).submit(b.day, b.uid, nf.name, nf.face, secs, req.headers.get('CF-Connecting-IP') || '');
        return 'error' in r ? json(r, 429) : json(r);
      }
      // ---- 异步对战 + 战力（v9）----
      if (url.pathname.startsWith('/api/hj/pvp/')) {
        const L = env.HJ_LEAGUE.get(env.HJ_LEAGUE.idFromName('hj-league')); const ip = req.headers.get('CF-Connecting-IP') || '';
        const act = url.pathname.slice('/api/hj/pvp/'.length);
        const send = (r: any) => r && r.error ? json(r, r.error === 'ip-limit' ? 429 : r.error === 'verify' ? 422 : 400) : json(r, 200, { 'cache-control': 'no-store' });
        if (act === 'me' && req.method === 'GET') {
          const uid = url.searchParams.get('uid') || ''; if (!UID.test(uid)) return json({ error: 'uid' }, 400);
          return send(await L.me(uid, +(url.searchParams.get('best') || 0) | 0, ip));
        }
        if (req.method !== 'POST') return json({ error: 'method' }, 405);
        const len = +(req.headers.get('content-length') || 0); if (len > 65536) return json({ error: 'size' }, 413);
        const b = await req.json() as { uid: string; n: number; slot: number; key: string; secs: number; moves: unknown; best: number; ms: number };
        if (typeof b.uid !== 'string' || !UID.test(b.uid)) return json({ error: 'uid' }, 400);
        if (act === 'rec') { if (!Number.isInteger(b.n)) return json({ error: 'n' }, 400); return send(await L.rec(b.uid, b.n, b.secs, b.moves, +b.best | 0, ip)); }
        if (act === 'refresh') return send(await L.refresh(b.uid));
        if (act === 'start') return send(await L.start(b.uid, +b.slot | 0, String(b.key || '')));
        if (act === 'submit') return send(await L.submit(b.uid, +b.slot | 0, String(b.key || ''), b.secs, b.moves, false));
        if (act === 'forfeit') return send(await L.submit(b.uid, +b.slot | 0, String(b.key || ''), 0, null, true));
        if (act === 'testshift' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname)) { await L.testShift(+b.ms || 0); return json({ ok: true }); }   // 只在本地 wrangler dev：拨时间测换天 / 换周
        return json({ error: 'not-found' }, 404);
      }
      // ---- 合作好友房（v7）----
      if (url.pathname === '/api/hj/room/new' && req.method === 'POST') {
        const b = await req.json() as { uid: string; diff: number };
        if (typeof b.uid !== 'string' || !UID.test(b.uid)) return json({ error: 'uid' }, 400);
        const diff = Math.max(0, Math.min(2, +b.diff | 0));
        for (let i = 0; i < 12; i++) {
          const code = String(1000 + Math.floor(Math.random() * 9000));
          if (await env.HJ_ROOM.get(env.HJ_ROOM.idFromName('hj-room-' + code)).init(b.uid, diff)) return json({ code });
        }
        return json({ error: 'busy' }, 503);
      }
      if (url.pathname === '/api/hj/room/ws') {
        if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'upgrade' }, 426);
        const code = url.searchParams.get('code') || ''; if (!/^\d{4}$/.test(code)) return json({ error: 'code' }, 400);
        return env.HJ_ROOM.get(env.HJ_ROOM.idFromName('hj-room-' + code)).fetch(req);
      }
      return json({ error: 'not-found' }, 404);
    } catch (e) {
      return json({ error: 'server', msg: String(e).slice(0, 200) }, 500);
    }
  },
};
