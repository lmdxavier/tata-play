// tata-play 的 Cloudflare Worker：静态文件照旧由 assets 直接给（不经过这里）；只有 /api/ 开头的请求进来。
// 货架整理（huojia）：每日一图真榜（v6）+ 合作好友房（v7，HjRoom：WebSocket 转发，Durable Object 休眠 API）。2026-11-26，源码在 游戏开发\项目\huojia\server\，部署时复制到 tata-play 的 _api\。
// 存储：每天一个 Durable Object（SQLite），免费层可用、不用在后台建数据库。只存 昵称 / 头像号 / 用时，不收行为数据。
import { DurableObject } from 'cloudflare:workers';
import { verify } from './replay.ts';
import type { DayData } from './replay.ts';
import TABLE from './daily_table.json';
import { nameFor } from './Daily.ts';

interface Env { HJ_DAILY: DurableObjectNamespace<HjDaily>; HJ_ROOM: DurableObjectNamespace<HjRoom> }
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
