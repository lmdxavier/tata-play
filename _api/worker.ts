// tata-play 的 Cloudflare Worker：静态文件照旧由 assets 直接给（不经过这里）；只有 /api/ 开头的请求进来。
// 现在只有货架整理（huojia）的每日一图真榜。2026-11-26 v6，源码在 游戏开发\项目\huojia\server\，部署时复制到 tata-play 的 _api\。
// 存储：每天一个 Durable Object（SQLite），免费层可用、不用在后台建数据库。只存 昵称 / 头像号 / 用时，不收行为数据。
import { DurableObject } from 'cloudflare:workers';
import { verify } from './replay.ts';
import type { DayData } from './replay.ts';
import TABLE from './daily_table.json';
import { nameFor } from './Daily.ts';

interface Env { HJ_DAILY: DurableObjectNamespace<HjDaily> }
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
      return json({ error: 'not-found' }, 404);
    } catch (e) {
      return json({ error: 'server', msg: String(e).slice(0, 200) }, 500);
    }
  },
};
