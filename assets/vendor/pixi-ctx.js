// 57 版起：Pixi WebGL 渲染层（58 版加角色 GPU 绘制、GPU 离屏层，见文件末尾）（用户 2026-11-13 定：tata 改用 PixiJS + WebGL）
// ---------------------------------------------------------------------------------------------
// 整个游戏只有一块 WebGL 画布，由 PixiJS 8 绘制。原来的界面 / 场景代码仍按 Canvas 2D 的写法调用 ctx，
// 这里的 PixiCtx 接住这些调用，换成 Pixi 的显示对象，每帧末尾一次提交给 GPU：
//   · drawImage           → 精灵（同一张图集的贴图自动合批）
//   · 纯色 fillRect       → 白色精灵着色
//   · 文字 / 路径 / 渐变 / 阴影 / 滤镜 → 用浏览器自己的 2D 光栅化画进一小块离屏画布并缓存成贴图（和 Canvas 版逐像素一致），
//                            同样的内容下一帧直接复用
//   · clip                → 模板遮罩（容器嵌套，restore 时退出）
//   · globalCompositeOperation lighter / multiply / screen → Pixi 混合模式 add / multiply / screen
// 离屏画布（角色缓存、九宫格缓存等）仍用 2D 画，作为贴图上传；改动由下面的原型钩子自动检测、只在变了时重新上传。
// 同一帧里一张离屏画布先被贴到屏幕、后又被改写（例如 renderChar 反复用同一块画布）时，先把已排队的内容提交给 GPU 再改，保证顺序正确。
// 网址加 ?gl=0 回到 Canvas 2D（对比用）。
(function(){
'use strict';
if(/[?&]gl=0\b/.test(location.search) || !window.PIXI || typeof CanvasRenderingContext2D === 'undefined' || typeof HTMLCanvasElement === 'undefined'){ window.PIXICTX = null; return; }   // Node 假画布测试（perf_node / smoke_node）也走这里
const P = window.PIXI;

// ---------- 1. 离屏画布改动检测 ----------
let QID = 1;                 // 当前这一批的编号：每次提交 GPU 后 +1
let LIVE = null;             // 正在排队的 PixiCtx
const CP = CanvasRenderingContext2D.prototype;
for(const name of ['drawImage','fillRect','strokeRect','clearRect','fill','stroke','fillText','strokeText','putImageData','reset','drawFocusIfNeeded']){
  const f = CP[name]; if(typeof f !== 'function') continue;
  const img = name === 'drawImage';
  CP[name] = function(){ const c = this.canvas;
    if(c){ if(c.__q === QID && LIVE){ c.__vol = 1; LIVE._flush(); } c.__v = (c.__v|0) + 1; }
    // 把主画布（WebGL）拷进 2D 画布时（例如 44 版结算定格 RSNAP）：先把本帧已排队的内容提交给 GPU，再拷当前绘制缓冲
    if(img){ const s0 = arguments[0]; if(s0 && s0.__pxctx && LIVE) LIVE._flush(); }
    return f.apply(this, arguments); };
}
for(const k of ['width','height']){
  const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, k);
  if(d && d.set) Object.defineProperty(HTMLCanvasElement.prototype, k, { configurable:true, enumerable:d.enumerable, get:d.get,
    set(v){ if(this.__q === QID && LIVE){ this.__vol = 1; LIVE._flush(); } this.__v = (this.__v|0) + 1;
      if(+v === 0 && this.__pxs){ DEAD_SRC.push(this.__pxs); for(const t of this.__pxt.values()) DEAD_T.push(t); this.__pxs = null; this.__pxt = null; if(!LIVE) freeDead(); }   // 画布被丢弃（宽高设 0）：释放显存
      d.set.call(this, v); } });
}
let FONTGEN = 0;   // 字体加载完成后 +1，文字缓存随之失效（render.js 用 FontFace + document.fonts.add 加载，不触发 loadingdone，所以那里会主动调 PIXICTX.fontsChanged()）
if(document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', ()=>{ FONTGEN++; });

// ---------- 2. 小工具 ----------
const PCV = document.createElement('canvas'); PCV.width = PCV.height = 1; const PG = PCV.getContext('2d');   // 解析颜色、量文字
const COLORS = new Map();
function parseColor(s){
  let r = COLORS.get(s); if(r) return r;
  PG.fillStyle = '#000'; PG.fillStyle = s; const n = PG.fillStyle;
  if(n[0] === '#') r = { rgb: parseInt(n.slice(1), 16), a: 1 };
  else { const m = /rgba?\(([^)]+)\)/.exec(n), p = m ? m[1].split(',').map(Number) : [0,0,0,1];
    r = { rgb: (p[0]<<16)|(p[1]<<8)|p[2], a: p.length > 3 ? p[3] : 1 }; }
  if(COLORS.size > 4000) COLORS.clear(); COLORS.set(s, r); return r;
}
// Canvas 遇到无效的颜色 / 字体会保留上一次的有效值，这里照做
const VALID_COLOR = new Map(), VALID_FONT = new Map();
function validStyle(v){
  if(v instanceof Grad || v instanceof Pat) return true;
  if(typeof v !== 'string') return !!v && typeof v === 'object';
  let ok = VALID_COLOR.get(v); if(ok !== undefined) return ok;
  PG.fillStyle = '#010203'; PG.fillStyle = v; ok = PG.fillStyle !== '#010203' || /^#010203$/i.test(v.trim());
  if(VALID_COLOR.size > 4000) VALID_COLOR.clear(); VALID_COLOR.set(v, ok); return ok;
}
const IDS = new WeakMap(); let NEXT_ID = 1;
const oid = o => { let i = IDS.get(o); if(!i){ i = NEXT_ID++; IDS.set(o, i); } return i; };
const n2 = v => Math.round(v * 100) / 100;
const mul = (m, a, b, c, d, e, f) => [m[0]*a + m[2]*b, m[1]*a + m[3]*b, m[0]*c + m[2]*d, m[1]*c + m[3]*d, m[0]*e + m[2]*f + m[4], m[1]*e + m[3]*f + m[5]];
const BLEND = { 'source-over':'normal', 'lighter':'add', 'multiply':'multiply', 'screen':'screen', 'destination-out':'erase', 'lighten':'max', 'darken':'min' };
const isImg = S => typeof HTMLImageElement !== 'undefined' && S instanceof HTMLImageElement;
const srcW = S => isImg(S) ? S.naturalWidth : (S.videoWidth || S.width || 0);
const srcH = S => isImg(S) ? S.naturalHeight : (S.videoHeight || S.height || 0);
const iw0 = S => S.width, ih0 = S => S.height;

// 渐变 / 图案：记录下来（才能做缓存键），光栅化时再交给真正的 2D 上下文
class Grad { constructor(k, a){ this.k = k; this.a = a; this.s = []; } addColorStop(o, c){ this.s.push(o, c); }
  key(){ return this.k + this.a.map(n2).join(',') + '|' + this.s.join(','); }
  make(g){ const x = this.k === 'L' ? g.createLinearGradient(...this.a) : this.k === 'R' ? g.createRadialGradient(...this.a) : g.createConicGradient(...this.a);
    for(let i = 0; i < this.s.length; i += 2) x.addColorStop(this.s[i], this.s[i+1]); return x; } }
class Pat { constructor(img, rep){ this.img = img; this.rep = rep; this.m = null; }
  setTransform(m){ this.m = m ? [m.a, m.b, m.c, m.d, m.e, m.f] : null; }
  key(){ return 'P' + oid(this.img) + '.' + (this.img.__v|0) + this.rep + (this.m ? this.m.map(n2).join(',') : ''); }
  make(g){ const p = g.createPattern(this.img, this.rep); if(p && this.m) p.setTransform(new DOMMatrix(this.m)); return p; } }
const styleKey = s => typeof s === 'string' ? s : s && s.key ? s.key() : (s && typeof s === 'object') ? 'O' + oid(s) : String(s);
const realStyle = (g, s) => typeof s === 'string' ? s : s && s.make ? s.make(g) : s;

// ---------- 3. 路径：记录命令（含当时的变换），可展平成屏幕坐标多边形 ----------
function arcPts(out, m, cx, cy, rx, ry, rot, a0, a1, ccw, first){
  let d = a1 - a0; const T = Math.PI * 2;
  if(!ccw){ if(d >= T) d = T; else { d %= T; if(d < 0) d += T; if(d === 0 && a1 !== a0) d = T; } }
  else { if(-d >= T) d = -T; else { d %= T; if(d > 0) d -= T; if(d === 0 && a1 !== a0) d = -T; } }
  const sc = Math.sqrt(Math.abs(m[0]*m[3] - m[1]*m[2])) * Math.max(rx, ry);
  const n = Math.max(2, Math.min(256, Math.ceil(Math.abs(d) * Math.max(2, Math.sqrt(sc)) * 1.2)));
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for(let i = 0; i <= n; i++){
    const t = a0 + d * i / n, ex = Math.cos(t) * rx, ey = Math.sin(t) * ry;
    const x = cx + ex*cr - ey*sr, y = cy + ex*sr + ey*cr;
    out.push(m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]);
  }
}
class Path {
  constructor(){ this.c = []; }
  add(op, m, args){ this.c.push(op, m, args); }
  // 展平成屏幕坐标的子路径 [[x,y,x,y...], ...]
  flat(){
    const subs = []; let cur = null, ux = 0, uy = 0, sx = 0, sy = 0, pendM = null;
    const T = (m, x, y) => [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
    const start = (m, x, y) => { cur = []; subs.push(cur); const p = T(m, x, y); cur.push(p[0], p[1]); ux = sx = x; uy = sy = y; pendM = null; };
    const reopen = () => { if(!cur && pendM) start(pendM, sx, sy); };   // closePath 之后接着画：从上一段的起点开始
    const line = (m, x, y) => { reopen(); if(!cur) return start(m, x, y); const p = T(m, x, y); cur.push(p[0], p[1]); ux = x; uy = y; };
    const C = this.c;
    for(let i = 0; i < C.length; i += 3){
      const op = C[i], m = C[i+1], a = C[i+2];
      if(op === 'moveTo') start(m, a[0], a[1]);
      else if(op === 'lineTo') line(m, a[0], a[1]);
      else if(op === 'closePath'){ if(cur){ cur.closed = true; cur = null; pendM = m; ux = sx; uy = sy; } }
      else if(op === 'rect'){ const [x, y, w, h] = a; start(m, x, y); line(m, x+w, y); line(m, x+w, y+h); line(m, x, y+h); cur.closed = true; cur = null; ux = sx = x; uy = sy = y; }
      else if(op === 'roundRect'){ let [x, y, w, h, r] = a; r = Array.isArray(r) ? r : [r === undefined ? 0 : r];
        const R = v => typeof v === 'number' ? v : (v && v.x) || 0;
        const rr = r.length === 1 ? [R(r[0]),R(r[0]),R(r[0]),R(r[0])] : r.length === 2 ? [R(r[0]),R(r[1]),R(r[0]),R(r[1])] : r.length === 3 ? [R(r[0]),R(r[1]),R(r[2]),R(r[1])] : r.map(R);
        if(w < 0){ x += w; w = -w; } if(h < 0){ y += h; h = -h; }
        const k = Math.min(1, w / Math.max(1e-6, rr[0]+rr[1]), w / Math.max(1e-6, rr[2]+rr[3]), h / Math.max(1e-6, rr[0]+rr[3]), h / Math.max(1e-6, rr[1]+rr[2]));
        const [a1, b1, c1, d1] = rr.map(v => v * k);
        start(m, x + a1, y); cur.pop(); cur.pop();
        arcPts(cur, m, x+w-b1, y+b1, b1, b1, 0, -Math.PI/2, 0, false);
        arcPts(cur, m, x+w-c1, y+h-c1, c1, c1, 0, 0, Math.PI/2, false);
        arcPts(cur, m, x+d1, y+h-d1, d1, d1, 0, Math.PI/2, Math.PI, false);
        arcPts(cur, m, x+a1, y+a1, a1, a1, 0, Math.PI, Math.PI*1.5, false);
        cur.closed = true; cur = null; ux = sx = x; uy = sy = y; }
      else if(op === 'arc' || op === 'ellipse'){
        const e = op === 'ellipse', cx = a[0], cy = a[1], rx = a[2], ry = e ? a[3] : a[2], rot = e ? a[4] : 0, a0 = e ? a[5] : a[3], a1 = e ? a[6] : a[4], ccw = !!(e ? a[7] : a[5]);
        const tmp = []; arcPts(tmp, m, cx, cy, rx, ry, rot, a0, a1, ccw); reopen();
        if(!cur){ cur = []; subs.push(cur); const cr = Math.cos(rot), sr = Math.sin(rot); sx = cx + Math.cos(a0)*rx*cr - Math.sin(a0)*ry*sr; sy = cy + Math.cos(a0)*rx*sr + Math.sin(a0)*ry*cr; }
        for(let j = 0; j < tmp.length; j++) cur.push(tmp[j]);
        const cr = Math.cos(rot), sr = Math.sin(rot), ex = Math.cos(a1)*rx, ey = Math.sin(a1)*ry; ux = cx + ex*cr - ey*sr; uy = cy + ex*sr + ey*cr; }
      else if(op === 'arcTo'){ const [x1, y1, x2, y2, r] = a; reopen(); if(!cur){ start(m, x1, y1); continue; }
        const v1x = ux - x1, v1y = uy - y1, v2x = x2 - x1, v2y = y2 - y1, l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
        const cross = v1x*v2y - v1y*v2x;
        if(!r || l1 < 1e-9 || l2 < 1e-9 || Math.abs(cross) < 1e-9){ line(m, x1, y1); continue; }
        const ang = Math.acos(Math.max(-1, Math.min(1, (v1x*v2x + v1y*v2y) / (l1*l2)))), t = r / Math.tan(ang/2);
        const p1x = x1 + v1x/l1*t, p1y = y1 + v1y/l1*t, p2x = x1 + v2x/l2*t, p2y = y1 + v2y/l2*t;
        const bx = v1x/l1 + v2x/l2, by = v1y/l1 + v2y/l2, bl = Math.hypot(bx, by), dc = r / Math.sin(ang/2);
        const cx = x1 + bx/bl*dc, cy = y1 + by/bl*dc;
        line(m, p1x, p1y); const s0 = Math.atan2(p1y - cy, p1x - cx), s1 = Math.atan2(p2y - cy, p2x - cx);
        arcPts(cur, m, cx, cy, r, r, 0, s0, s1, cross > 0); ux = p2x; uy = p2y; }
      else if(op === 'quadraticCurveTo' || op === 'bezierCurveTo'){
        reopen(); if(!cur) start(m, a[0], a[1]);
        const q = op === 'quadraticCurveTo', x0 = ux, y0 = uy, n = 16;
        for(let j = 1; j <= n; j++){ const t = j/n, u = 1 - t; let x, y;
          if(q){ x = u*u*x0 + 2*u*t*a[0] + t*t*a[2]; y = u*u*y0 + 2*u*t*a[1] + t*t*a[3]; }
          else { x = u*u*u*x0 + 3*u*u*t*a[0] + 3*u*t*t*a[2] + t*t*t*a[4]; y = u*u*u*y0 + 3*u*u*t*a[1] + 3*u*t*t*a[3] + t*t*t*a[5]; }
          const p = T(m, x, y); cur.push(p[0], p[1]); }
        ux = q ? a[2] : a[4]; uy = q ? a[3] : a[5]; }
    }
    return subs;
  }
  key(ox, oy){ const C = this.c, o = [];
    for(let i = 0; i < C.length; i += 3){ const m = C[i+1]; o.push(C[i], n2(m[0]), n2(m[1]), n2(m[2]), n2(m[3]), n2(m[4]-ox), n2(m[5]-oy), C[i+2].map(v => typeof v === 'number' ? n2(v) : Array.isArray(v) ? v.join('/') : v).join(',')); }
    return o.join(';'); }
  replay(g, ox, oy){ g.beginPath(); const C = this.c;
    for(let i = 0; i < C.length; i += 3){ const m = C[i+1]; g.setTransform(m[0], m[1], m[2], m[3], m[4]-ox, m[5]-oy); g[C[i]](...C[i+2]); } }
}

// ---------- 3.9 图片登记（61 版：进战斗前预先上传显卡用） ----------
const ALLIMG = [];
{ const OI = window.Image; if(OI && !OI.__pxwrap){ const W = function(w, h){ const i = arguments.length ? new OI(w, h) : new OI(); ALLIMG.push(i); return i; }; W.prototype = OI.prototype; W.__pxwrap = true; window.Image = W; } }

// ---------- 4. 光栅化缓存（文字、路径、渐变、阴影） ----------
const RC = new Map(); let RC_PX = 0; const RC_MAX = 8e6;   // 约 32MB
function rcGet(key){ const e = RC.get(key); if(e){ RC.delete(key); RC.set(key, e); } return e; }
function rcPut(key, e){ RC.set(key, e); RC_PX += e.w * e.h;
  while(RC_PX > RC_MAX && RC.size > 1){ const [k, o] = RC.entries().next().value; RC.delete(k); RC_PX -= o.w * o.h; DEAD.push(o); } }
const DEAD = [], DEAD_T = [], DEAD_SRC = [], DEAD_G = [];
function freeDead(){
  if(DEAD.length){ for(const o of DEAD){ o.tex.destroy(true); o.cv.width = 0; o.cv.height = 0; } DEAD.length = 0; }   // 光栅画布也立即释放（iPhone Safari 有画布总内存上限）
  if(DEAD_T.length){ for(const t of DEAD_T) t.destroy(false); DEAD_T.length = 0; }
  if(DEAD_SRC.length){ for(const o of DEAD_SRC) o.destroy(); DEAD_SRC.length = 0; }
  if(DEAD_G.length){ for(const g of DEAD_G){ if(g.parent) g.parent.removeChild(g); g.destroy(); } DEAD_G.length = 0; }
}   // 淘汰的贴图：等这一批提交给 GPU 之后再销毁（本帧可能还在用）

let TXT = null;
function txtCanvas(w, h){
  if(!TXT){ TXT = document.createElement('canvas'); TXT.setAttribute('aria-hidden', 'true');
    TXT.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1'; (document.body || document.documentElement).appendChild(TXT); }
  if(TXT.width < w || TXT.height < h){ TXT.width = Math.max(TXT.width, Math.ceil(w / 64) * 64); TXT.height = Math.max(TXT.height, Math.ceil(h / 64) * 64); }
  return TXT;
}

// ---------- 5. PixiCtx ----------
const DEF = () => ({ m:[1,0,0,1,0,0], alpha:1, comp:'source-over', fill:'#000', stroke:'#000', lw:1, cap:'butt', join:'miter', miter:10,
  font:'10px sans-serif', align:'start', base:'alphabetic', shc:'rgba(0,0,0,0)', shb:0, shx:0, shy:0, filter:'none', smooth:true, smq:'low', dash:[], dashOff:0, dir:'inherit', ls:'0px' });

class PixiCtx {
  constructor(cv){
    this.canvas = cv; this.S = DEF(); this.stack = []; this.path = new Path();
    this.ready = false; this.live = false; this.first = true;
    this.stage = new P.Container();
    this.target = this.stage; this.clips = [];    // [{depth, subs}]
    this.sp = []; this.spi = 0; this.cl = []; this.cli = 0; this.snap = new Map(); this.frameNo = 0; this.mk = new Map();
    this.stats = { frames:0, flushes:0, sprites:0, raster:0, rasterMiss:0, uploads:0, drawCalls:0, upPx:0 };
    this.fstat = { flushes:0, sprites:0, raster:0, rasterMiss:0, uploads:0, drawCalls:0, upPx:0 };
    P.autoDetectRenderer({ preference:'webgl', canvas:cv, width:cv.width || 1, height:cv.height || 1, resolution:1, autoDensity:false,
      antialias:/[?&]aa=1\b/.test(location.search) || (() => { try{ return JSON.parse(localStorage.getItem('tata_opts') || '{}').aa === true; }catch(e){ return false; } })(),   // 61 版：默认关抗锯齿（用户 2026-11-14 真机对比「没看出什么区别所以默认可以关」；Pixi 官方对移动端的建议），?aa=1 打开对比
      backgroundAlpha:0, clearBeforeRender:true, preserveDrawingBuffer:false, powerPreference:'high-performance',
      gcMaxUnusedTime:20000, gcFrequency:10000 })   // 20 秒没画过的贴图释放显存（Pixi 默认 60 秒）
      .then(r => { this.r = r; this.ready = true;
        // 统计（?pxstat=1）：每帧 GPU 绘制调用次数、纹理上传像素
        if(/[?&](pxstat|perf)=1\b/.test(location.search) && r.gl){ const gl = r.gl, fs = this.fstat;
          for(const k of ['drawElements', 'drawArrays']){ const f = gl[k].bind(gl); gl[k] = function(){ fs.drawCalls = (fs.drawCalls|0) + 1; return f.apply(null, arguments); }; }
          for(const k of ['texImage2D', 'texSubImage2D']){ const f = gl[k].bind(gl); gl[k] = function(){ const a = arguments, src = a[a.length - 1]; fs.upPx = (fs.upPx|0) + ((src && src.width * src.height) || (a[3] * a[4]) || 0); return f.apply(null, a); }; } }
      })
      .catch(e => { console.error('WebGL 初始化失败', e); this.failed = true; });
  }
  // ----- 帧 -----
  __begin(){
    if(!this.ready){ this.live = false; return; }
    const cv = this.canvas;
    if(this.r.width !== cv.width || this.r.height !== cv.height) this.r.resize(cv.width, cv.height, 1);
    if(this._ch) this.__charAbort();   // 58 版兜底：上一帧有角色 / 离屏层没结束（出错）就丢掉，免得之后的绘制都画进看不见的地方
    if(this._ly){ const o = this._ly; this._ly = null; this.target = o.target; this.S.alpha = o.alpha; this.S.comp = o.comp; [this.S.shc, this.S.shb, this.S.shx, this.S.shy, this.S.filter] = o.sh; o.L.key = undefined; }
    this.live = true; LIVE = this; this.first = true; QID++; this.frameNo++; this._snapGC();
    for(const k in this.fstat) this.fstat[k] = 0;
    this._reset();
  }
  __end(){ if(!this.live) return; if(this.first && !this.stage.children.length){ this.r.render({ container:this.stage, clear:true }); this.first = false; }   // 整帧什么都没画（或整屏 clearRect）：也要清屏
    this._flush(); this.live = false; LIVE = null; this.stats.frames++; for(const k in this.fstat) this.stats[k] += this.fstat[k]; this.last = Object.assign({}, this.fstat); }
  _reset(){
    this.stage.removeChildren(); this.spi = 0; this.cli = 0; this.target = this.stage;
    // 58 版：角色格子 / 离屏层画到一半被提交（_flush）时：进入之前的外层裁剪重建在主画面上并更新它们的「外层目标」，
    //   之后的裁剪重建在格子 / 层里面，继续画进格子 / 层；角色格子重新挂回图集，它用到的池子对象挪到池子最前面，不被后面复用
    const B = this._ly || this._ch, cb = B ? B.cb : this.clips.length;
    let kids = null;
    if(this.atlas){
      if(this._ch){ kids = this._ch.c.children.slice(); }
      this.atlas.removeChildren(); this.atN = 0; this.atX = 2; this.atY = 2; this.atRow = 0; this.cci = 0; this.smi = 0; this.qi = 0;
      if(this._ch){ const c = this._ch.c; this.cci = this._keepFront(this.cc, [c], o => o); this.smi = this._keepFront(this.sm, kids, o => o.m); this.spi = this._keepFront(this.sp, kids, o => o);
        this.atlas.addChild(c); this.atN = 1; }
    }
    const enter = () => { B.target = this.target; this.target = B.L ? B.L.c : B.c; };
    for(let i = 0; i < this.clips.length; i++){ if(B && i === cb) enter(); const c = this.clips[i]; c.cont = this._pushClipCont(c.subs); }   // 提交后重建仍然生效的裁剪
    if(B && cb >= this.clips.length) enter();
  }
  _flush(){
    if(!this.live) return;
    if(this.lyPend && this.lyPend.length){ for(const L of this.lyPend) this.r.render({ container:L.c, target:L.rt, clear:true, clearColor:[0, 0, 0, 0] }); this.fstat.layerPasses = (this.fstat.layerPasses|0) + this.lyPend.length; if(!this._ly) this.lyPend.length = 0; }
    if(this.atN){ this._atRender(); }   // 58 版：本批的角色先画进角色图集，再画整屏（角色在整屏里只是一块带质感着色器的贴片）
    if(this.stage.children.length){
      this.r.render({ container:this.stage, clear:this.first });
      this.first = false; this.fstat.flushes++;
    }
    QID++; this._reset();
    freeDead();

  }
  // ----- 显示对象池 -----
  _sprite(tex){
    const o = this._ly ? this._ly.L : this;   // 58 版：画进 GPU 离屏层时用这一层自己的池子（层可能跨批保留）
    let s = o.sp[o.spi++]; if(!s){ s = new P.Sprite(); o.sp.push(s); }
    s.texture = tex; this.target.addChild(s); this.fstat.sprites++; return s;
  }
  // 裁剪：容器 + 模板遮罩。遮罩图形按形状缓存、不改形状复用（池子里的图形清空后重画成别的形状，
  // Pixi 不会刷新遮罩的 GPU 几何缓冲，会越界报 GL_INVALID_OPERATION）；同一批里同一形状用了几次就备几份
  _pushClipCont(subs){
    let e = this.cl[this.cli++];
    if(!e){ e = { c:new P.Container() }; this.cl.push(e); }
    const key = PixiCtx.subsKey(subs, 0, 0);
    let list = this.mk.get(key); if(!list){ list = { gs:[], f:-1, i:0 }; this.mk.set(key, list); } else { this.mk.delete(key); this.mk.set(key, list); }
    if(list.f !== QID){ list.f = QID; list.i = 0; }
    let g = list.gs[list.i++];
    if(!g){ g = new P.Graphics(); g.context.batchMode = 'no-batch'; let n = 0; for(const s of subs) if(s.length >= 6){ g.poly(s, true); n++; }
      if(!n) g.rect(-10, -10, 1, 1);   // 空路径裁剪 = 全部裁掉
      g.fill({ color:0xffffff }); list.gs.push(g); }
    while(this.mk.size > 400){ const [k, o] = this.mk.entries().next().value; if(o.f === QID) break; this.mk.delete(k); for(const x of o.gs) DEAD_G.push(x); }
    e.c.removeChildren(); e.c.mask = g;
    this.target.addChild(g); this.target.addChild(e.c); this.target = e.c; return e.c;
  }
  _place(s, m){
    const t = _MT; t.a = m[0]; t.b = m[1]; t.c = m[2]; t.d = m[3]; t.tx = m[4]; t.ty = m[5];
    s.setFromMatrix(t);
    const S = this.S; s.alpha = S.alpha; s.blendMode = BLEND[S.comp] || 'normal';
  }
  // ----- 贴图来源 -----
  _tex(S, sx, sy, sw, sh){
    const w = srcW(S), h = srcH(S); let src = S.__pxs;
    if(!src || src.__w !== w || src.__h !== h){
      if(src){ for(const o of S.__pxt.values()) DEAD_T.push(o); DEAD_SRC.push(src); }
      src = isImg(S) ? new P.ImageSource({ resource:S, width:w, height:h, resolution:1, autoGenerateMipmaps:MIP }) : new P.CanvasSource({ resource:S, width:w, height:h, resolution:1, autoGenerateMipmaps:MIPC });
      src.__w = w; src.__h = h; src.__uv = S.__v | 0; S.__pxs = src; S.__pxt = new Map(); this.fstat.uploads++;
    } else if((S.__v | 0) !== src.__uv){ src.update(); src.__uv = S.__v | 0; this.fstat.uploads++; }
    S.__q = QID;
    const k = sx + ',' + sy + ',' + sw + ',' + sh, M = S.__pxt; let t = M.get(k);
    if(!t){ if(M.size > 3000){ for(const o of M.values()) DEAD_T.push(o); M.clear(); }
      t = new P.Texture({ source:src, frame:new P.Rectangle(sx, sy, sw, sh) }); M.set(k, t); }
    return t;
  }
  get _shadow(){ const S = this.S; return (S.shb > 0 || S.shx || S.shy) && parseColor(S.shc).a > 0; }
  get _fx(){ return this._shadow || (this.S.filter && this.S.filter !== 'none'); }
  // ----- 光栅化：把一个 2D 操作画进对齐屏幕像素的小画布，缓存后当精灵贴 -----
  _raster(kind, bounds, keyBody, paint, dyn){   // dyn（61 版）：{s, tx, ty} —— bounds 是「标准大小、原点在文字锚点」的范围；光栅图只画一次，位置（可带小数）和缩放 s 交给 GPU
    if(!this.live) return;
    const S = this.S, cv = this.canvas;
    let pad = 2; if(this._shadow) pad += Math.ceil(S.shb * 1.6) + Math.ceil(Math.max(Math.abs(S.shx), Math.abs(S.shy)));
    if(S.filter && S.filter !== 'none'){ const b = /blur\(([\d.]+)px\)/.exec(S.filter); if(b) pad += Math.ceil(+b[1] * 3); }
    // 光栅图按内容自身的轮廓定原点（不按屏幕像素取整），精灵摆在精确的小数位置：
    // 同一个形状 / 文字只是平移时缓存键不变，可以直接复用（例如战场上缓慢飘动的云影，不用每帧重画、重传）。
    // 特别大的（超过约一屏半）才按屏幕裁掉，按整像素对齐。
    let x0 = bounds[0] - pad, y0 = bounds[1] - pad, x1 = bounds[2] + pad, y1 = bounds[3] + pad;
    if(!dyn && (x1 <= 0 || y1 <= 0 || x0 >= cv.width || y0 >= cv.height)) return;   // 完全在屏幕外
    let w = Math.ceil(x1 - x0), h = Math.ceil(y1 - y0);
    let px = x0, py = y0, qx = 0, qy = 0;   // px,py：精灵摆放的整像素位置；qx,qy：烘进光栅图的小数偏移（1/4 像素）
    if(dyn){ px = Math.floor(x0); py = Math.floor(y0); w += 1; h += 1; }
    else if(w * h > cv.width * cv.height * 1.5){
      const M = 64; x0 = Math.max(Math.floor(x0), -M); y0 = Math.max(Math.floor(y0), -M); x1 = Math.min(Math.ceil(x1), cv.width + M); y1 = Math.min(Math.ceil(y1), cv.height + M);
      w = x1 - x0; h = y1 - y0; px = x0; py = y0; }
    else {
      px = Math.floor(x0); py = Math.floor(y0); qx = Math.round((x0 - px) * 4) / 4; qy = Math.round((y0 - py) * 4) / 4;
      if(qx >= 1){ px++; qx = 0; } if(qy >= 1){ py++; qy = 0; }
      w += 1; h += 1; }
    if(w <= 0 || h <= 0) return;
    // 带阴影时透明度要烘进光栅（Canvas 是阴影、形状各自乘透明度再叠，和整体乘透明度不等价）
    const bake = this._shadow && S.alpha < 1, ba = bake ? Math.round(S.alpha * 64) / 64 : 1;
    const key = (dyn ? 'D' : '') + kind + '|' + w + 'x' + h + '|' + (this._shadow ? S.shc + S.shb + ',' + S.shx + ',' + S.shy + ',' + ba : '') + '|' + S.filter + '|' + qx + ',' + qy + '|' + keyBody(x0, y0);
    let e = rcGet(key);
    this.fstat.raster++;
    if(!e){
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      // 文字先画在挂在页面里的隐藏画布上：中文字体回退按页面语言（lang=zh）选字形，和原来直接画在主画布上一致
      // （脱离页面的画布会回退成日文字形，例如全角冒号跑到中间）
      const txt = kind[0] === 'T', tc = txt ? txtCanvas(w, h) : c, g = tc.getContext('2d');
      if(txt){ g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); }
      g.shadowColor = S.shc; g.shadowBlur = S.shb; g.shadowOffsetX = S.shx; g.shadowOffsetY = S.shy; g.filter = S.filter;
      g.imageSmoothingEnabled = S.smooth; g.imageSmoothingQuality = S.smq; g.globalAlpha = ba;
      if(dyn) paint(g, px, py); else paint(g, x0 - qx, y0 - qy); g.globalAlpha = 1;
      if(txt){ g.shadowColor = 'rgba(0,0,0,0)'; g.filter = 'none'; const cg = c.getContext('2d'); cg.drawImage(tc, 0, 0, w, h, 0, 0, w, h); }
      const src = new P.CanvasSource({ resource:c, width:w, height:h, resolution:1 });
      e = { w, h, cv:c, tex:new P.Texture({ source:src }) }; rcPut(key, e); this.fstat.rasterMiss++;
      if(window.__PXMISS) window.__PXMISS.push(w + 'x' + h + ' ' + key.slice(0, 160) + (txt ? '|' + key.slice(key.lastIndexOf('|') + 1, key.lastIndexOf('|') + 13) : ''));
    }
    const s = this._sprite(e.tex); const t = _MT; t.b = 0; t.c = 0;
    if(dyn){ t.a = dyn.s; t.d = dyn.s; t.tx = dyn.tx + px * dyn.s; t.ty = dyn.ty + py * dyn.s; } else { t.a = 1; t.d = 1; t.tx = px; t.ty = py; }
    s.setFromMatrix(t);
    s.alpha = bake ? 1 : S.alpha; s.blendMode = BLEND[S.comp] || 'normal'; s.tint = 0xffffff;
  }
  _strokeStyleKey(){ const S = this.S; return (typeof S.stroke === 'string' ? S.stroke : 'obj') + '|' + n2(S.lw) + S.cap + S.join + S.miter + '|' + S.dash.join(',') + ',' + S.dashOff; }
  _applyStroke(g){ const S = this.S; g.strokeStyle = realStyle(g, S.stroke); g.lineWidth = S.lw; g.lineCap = S.cap; g.lineJoin = S.join; g.miterLimit = S.miter; g.setLineDash(S.dash); g.lineDashOffset = S.dashOff; }
  _pathBounds(path, extra){
    const subs = path.flat(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for(const s of subs) for(let i = 0; i < s.length; i += 2){ const x = s[i], y = s[i+1]; if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y; }
    if(x0 === Infinity) return null; const r = [x0 - extra, y0 - extra, x1 + extra, y1 + extra]; r.subs = subs; return r;
  }
  // 缓存键：展平后的屏幕坐标轮廓（相对原点）——只平移时键不变
  static subsKey(subs, ox, oy){ const o = []; for(const s of subs){ for(let i = 0; i < s.length; i += 2) o.push(Math.round((s[i]-ox)*20), Math.round((s[i+1]-oy)*20)); o.push(s.closed ? 'z' : 'o'); } return o.join(','); }
  // 渐变 / 图案的缓存键：坐标换算到屏幕、相对原点
  static fillKey(st, fm, ox, oy){
    const lin = n2(fm[0]) + ',' + n2(fm[1]) + ',' + n2(fm[2]) + ',' + n2(fm[3]);
    if(typeof st === 'string') return st;
    if(st instanceof Grad){ const a = st.a, T = (x, y) => n2(fm[0]*x + fm[2]*y + fm[4] - ox) + ',' + n2(fm[1]*x + fm[3]*y + fm[5] - oy);
      let g;
      if(st.k === 'L'){
        // 线性渐变只跟沿渐变方向的位置有关：把起点沿垂直方向挪到过原点的线上再进键（同一个水平渐变用在不同高度的线上时键相同）
        const X0 = fm[0]*a[0] + fm[2]*a[1] + fm[4] - ox, Y0 = fm[1]*a[0] + fm[3]*a[1] + fm[5] - oy, X1 = fm[0]*a[2] + fm[2]*a[3] + fm[4] - ox, Y1 = fm[1]*a[2] + fm[3]*a[3] + fm[5] - oy;
        const dx = X1 - X0, dy = Y1 - Y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, k = X0*nx + Y0*ny;
        const sx = X0 - nx*k, sy = Y0 - ny*k; g = n2(sx) + ',' + n2(sy) + ',' + n2(dx) + ',' + n2(dy);
      } else g = st.k === 'R' ? T(a[0], a[1]) + ',' + n2(a[2]) + ',' + T(a[3], a[4]) + ',' + n2(a[5]) : T(a[1], a[2]) + ',' + n2(a[0]);
      return st.k + lin + '|' + g + '|' + st.s.join(','); }
    return styleKey(st) + lin + ',' + n2(fm[4] - ox) + ',' + n2(fm[5] - oy);
  }
  _lwDev(){ const m = this.S.m; return this.S.lw * Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3])); }

  // ===== Canvas 2D 接口 =====
  save(){ const S = this.S; this.stack.push(Object.assign({}, S, { m:S.m.slice(), dash:S.dash.slice(), _clips:this.clips.length })); }
  restore(){ const o = this.stack.pop(); if(!o) return; const n = o._clips; delete o._clips; this.S = o;
    while(this.clips.length > n){ this.clips.pop(); }
    // 58 版：在 GPU 离屏层 / 角色格子里时，外面的裁剪不算，退回到层 / 格子本身
    const B = this._ly || this._ch, cb = B ? B.cb : 0;
    this.target = this.clips.length > cb ? this.clips[this.clips.length - 1].cont : B ? (B.L ? B.L.c : B.c) : this.stage; }
  reset(){ this.S = DEF(); this.stack = []; this.clips = []; this.target = this.stage; this.path = new Path(); }
  // 变换
  setTransform(a, b, c, d, e, f){ if(a === undefined){ this.S.m = [1,0,0,1,0,0]; return; } if(typeof a === 'object'){ const o = a; this.S.m = [o.a ?? o.m11 ?? 1, o.b ?? o.m12 ?? 0, o.c ?? o.m21 ?? 0, o.d ?? o.m22 ?? 1, o.e ?? o.m41 ?? 0, o.f ?? o.m42 ?? 0]; return; } this.S.m = [a, b, c, d, e, f]; }
  resetTransform(){ this.S.m = [1,0,0,1,0,0]; }
  getTransform(){ const m = this.S.m; return typeof DOMMatrix !== 'undefined' ? new DOMMatrix(m) : { a:m[0], b:m[1], c:m[2], d:m[3], e:m[4], f:m[5] }; }
  transform(a, b, c, d, e, f){ this.S.m = mul(this.S.m, a, b, c, d, e, f); }
  translate(x, y){ const m = this.S.m; m[4] += m[0]*x + m[2]*y; m[5] += m[1]*x + m[3]*y; }
  scale(x, y){ const m = this.S.m; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; }
  rotate(a){ const c = Math.cos(a), s = Math.sin(a); this.S.m = mul(this.S.m, c, s, -s, c, 0, 0); }
  // 状态属性
  get globalAlpha(){ return this.S.alpha; } set globalAlpha(v){ v = +v; if(v >= 0 && v <= 1) this.S.alpha = v; }
  get globalCompositeOperation(){ return this.S.comp; } set globalCompositeOperation(v){ if(!BLEND[v] && !PixiCtx._warned[v]){ PixiCtx._warned[v] = 1; console.warn('PixiCtx: 不支持的混合模式', v); } this.S.comp = v; }
  get fillStyle(){ return this.S.fill; } set fillStyle(v){ if(validStyle(v)) this.S.fill = v; }
  get strokeStyle(){ return this.S.stroke; } set strokeStyle(v){ if(validStyle(v)) this.S.stroke = v; }
  get lineWidth(){ return this.S.lw; } set lineWidth(v){ v = +v; if(v > 0 && isFinite(v)) this.S.lw = v; }
  get lineCap(){ return this.S.cap; } set lineCap(v){ this.S.cap = v; }
  get lineJoin(){ return this.S.join; } set lineJoin(v){ this.S.join = v; }
  get miterLimit(){ return this.S.miter; } set miterLimit(v){ this.S.miter = v; }
  get font(){ return this.S.font; } set font(v){ if(VALID_FONT.has(v)){ if(VALID_FONT.get(v)) this.S.font = v; return; } PG.font = '1px x-invalid-probe'; const before = PG.font; PG.font = v; const ok = PG.font !== before || v === before; if(VALID_FONT.size > 2000) VALID_FONT.clear(); VALID_FONT.set(v, ok); if(ok) this.S.font = v; }
  get textAlign(){ return this.S.align; } set textAlign(v){ this.S.align = v; }
  get textBaseline(){ return this.S.base; } set textBaseline(v){ this.S.base = v; }
  get direction(){ return this.S.dir; } set direction(v){ this.S.dir = v; }
  get letterSpacing(){ return this.S.ls; } set letterSpacing(v){ this.S.ls = v; }
  get shadowColor(){ return this.S.shc; } set shadowColor(v){ this.S.shc = v; }
  get shadowBlur(){ return this.S.shb; } set shadowBlur(v){ this.S.shb = +v || 0; }
  get shadowOffsetX(){ return this.S.shx; } set shadowOffsetX(v){ this.S.shx = +v || 0; }
  get shadowOffsetY(){ return this.S.shy; } set shadowOffsetY(v){ this.S.shy = +v || 0; }
  get filter(){ return this.S.filter; } set filter(v){ this.S.filter = v || 'none'; }
  get imageSmoothingEnabled(){ return this.S.smooth; } set imageSmoothingEnabled(v){ this.S.smooth = !!v; }
  get imageSmoothingQuality(){ return this.S.smq; } set imageSmoothingQuality(v){ this.S.smq = v; }
  get lineDashOffset(){ return this.S.dashOff; } set lineDashOffset(v){ this.S.dashOff = +v || 0; }
  setLineDash(a){ this.S.dash = (a || []).slice(); } getLineDash(){ return this.S.dash.slice(); }
  createLinearGradient(...a){ return new Grad('L', a); }
  createRadialGradient(...a){ return new Grad('R', a); }
  createConicGradient(...a){ return new Grad('C', a); }
  createPattern(img, rep){ return new Pat(img, rep || 'repeat'); }
  measureText(t){ PG.font = this.S.font; PG.letterSpacing = this.S.ls; return PG.measureText(t); }
  // 路径
  beginPath(){ this.path = new Path(); }
  moveTo(x, y){ this.path.add('moveTo', this.S.m.slice(), [x, y]); }
  lineTo(x, y){ this.path.add('lineTo', this.S.m.slice(), [x, y]); }
  closePath(){ this.path.add('closePath', this.S.m.slice(), []); }
  rect(x, y, w, h){ this.path.add('rect', this.S.m.slice(), [x, y, w, h]); }
  roundRect(x, y, w, h, r){ this.path.add('roundRect', this.S.m.slice(), [x, y, w, h, r === undefined ? 0 : r]); }
  arc(x, y, r, a0, a1, ccw){ this.path.add('arc', this.S.m.slice(), [x, y, r, a0, a1, !!ccw]); }
  arcTo(x1, y1, x2, y2, r){ this.path.add('arcTo', this.S.m.slice(), [x1, y1, x2, y2, r]); }
  ellipse(x, y, rx, ry, rot, a0, a1, ccw){ this.path.add('ellipse', this.S.m.slice(), [x, y, rx, ry, rot, a0, a1, !!ccw]); }
  quadraticCurveTo(a, b, c, d){ this.path.add('quadraticCurveTo', this.S.m.slice(), [a, b, c, d]); }
  bezierCurveTo(a, b, c, d, e, f){ this.path.add('bezierCurveTo', this.S.m.slice(), [a, b, c, d, e, f]); }
  fill(a, b){
    let path = this.path, rule = 'nonzero'; if(a instanceof Path2D){ return this._p2d('fill', a, b); } if(typeof a === 'string') rule = a;
    const bd = this._pathBounds(path, 1); if(!bd) return;
    const S = this.S, fm = S.m.slice(), fs = S.fill;
    this._raster('F', bd, (ox, oy) => PixiCtx.fillKey(fs, fm, ox, oy) + '|' + rule + '|' + PixiCtx.subsKey(bd.subs, ox, oy),
      (g, ox, oy) => { path.replay(g, ox, oy); g.setTransform(fm[0], fm[1], fm[2], fm[3], fm[4]-ox, fm[5]-oy); g.fillStyle = realStyle(g, fs); g.fill(rule); });
  }
  stroke(p){
    if(p instanceof Path2D) return this._p2d('stroke', p);
    const path = this.path, ext = this._lwDev() * (this.S.join === 'miter' ? this.S.miter / 2 + 0.5 : 0.75) + 1;
    const bd = this._pathBounds(path, ext); if(!bd) return;
    const S = this.S, fm = S.m.slice(), sk = this._strokeStyleKey(), st = S.stroke;
    this._raster('S', bd, (ox, oy) => sk + '|' + PixiCtx.fillKey(st, fm, ox, oy) + '|' + PixiCtx.subsKey(bd.subs, ox, oy),
      (g, ox, oy) => { path.replay(g, ox, oy); g.setTransform(fm[0], fm[1], fm[2], fm[3], fm[4]-ox, fm[5]-oy); this._applyStroke(g); g.stroke(); });
  }
  _p2d(kind, p2, rule){   // Path2D：没法展平，按整屏光栅化（游戏里目前没有用到）
    const cv = this.canvas, S = this.S, fm = S.m.slice(), st = kind === 'fill' ? styleKey(S.fill) : this._strokeStyleKey();
    this._raster('P', [0, 0, cv.width, cv.height], (ox, oy) => oid(p2) + st + fm.map(n2).join(','), (g, ox, oy) => {
      g.setTransform(fm[0], fm[1], fm[2], fm[3], fm[4]-ox, fm[5]-oy);
      if(kind === 'fill'){ g.fillStyle = realStyle(g, S.fill); g.fill(p2, rule || 'nonzero'); } else { this._applyStroke(g); g.stroke(p2); } });
  }
  clip(a, b){
    let rule = typeof a === 'string' ? a : b; if(a instanceof Path2D){ console.warn('PixiCtx: clip(Path2D) 未支持'); return; }
    const subs = this.path.flat();
    const c = { subs, depth:this.stack.length }; c.cont = this.live ? this._pushClipCont(subs) : null; this.clips.push(c);
    if(!this.live) this.target = this.stage;
  }
  fillRect(x, y, w, h){
    if(!this.live || !w || !h) return;
    const S = this.S;
    if(typeof S.fill === 'string' && !this._fx){
      const c = parseColor(S.fill); if(c.a <= 0) return;
      const s = this._sprite(P.Texture.WHITE); this._place(s, mul(S.m, w, 0, 0, h, x, y)); s.tint = c.rgb; s.alpha = S.alpha * c.a; return;
    }
    const p = this.path; this.path = new Path(); this.rect(x, y, w, h); this.fill(); this.path = p;
  }
  strokeRect(x, y, w, h){ const p = this.path; this.path = new Path(); this.rect(x, y, w, h); this.stroke(); this.path = p; }
  clearRect(x, y, w, h){
    if(!this.live) return;
    const m = this.S.m, cv = this.canvas, p = [[x, y], [x+w, y], [x, y+h], [x+w, y+h]].map(([u, v]) => [m[0]*u + m[2]*v + m[4], m[1]*u + m[3]*v + m[5]]);
    const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
    if(Math.min(...xs) <= 0 && Math.min(...ys) <= 0 && Math.max(...xs) >= cv.width && Math.max(...ys) >= cv.height && !this.clips.length && !this._ly && !this._ch){
      this.stage.removeChildren(); this.spi = 0; this.cli = 0; this.target = this.stage;
      if(this.atlas){ this.atlas.removeChildren(); this.atN = 0; this.atX = 2; this.atY = 2; this.atRow = 0; this.cci = 0; this.smi = 0; this.qi = 0; } this.first = true; return; }
    const s = this._sprite(P.Texture.WHITE); this._place(s, mul(m, w, 0, 0, h, x, y)); s.alpha = 1; s.blendMode = 'erase'; s.tint = 0xffffff;
  }
  drawImage(S0, a, b, c, d, e, f, g, h){
    if(!this.live || !S0) return;
    const S = S0, iw = srcW(S), ih = srcH(S); if(!iw || !ih) return;
    if(isImg(S) && !S.complete) return;
    let sx, sy, sw, sh, dx, dy, dw, dh; const n = arguments.length;
    if(n === 3){ sx = 0; sy = 0; sw = iw; sh = ih; dx = a; dy = b; dw = iw; dh = ih; }
    else if(n === 5){ sx = 0; sy = 0; sw = iw; sh = ih; dx = a; dy = b; dw = c; dh = d; }
    else { sx = a; sy = b; sw = c; sh = d; dx = e; dy = f; dw = g; dh = h; }
    if(sw < 0){ sx += sw; sw = -sw; } if(sh < 0){ sy += sh; sh = -sh; } if(dw < 0){ dx += dw; dw = -dw; } if(dh < 0){ dy += dh; dh = -dh; }
    if(!sw || !sh || !dw || !dh || !isFinite(dx + dy + dw + dh + sx + sy + sw + sh)) return;
    const kx = dw / sw, ky = dh / sh;
    if(sx < 0){ dx -= sx * kx; dw += sx * kx; sw += sx; sx = 0; }
    if(sy < 0){ dy -= sy * ky; dh += sy * ky; sh += sy; sy = 0; }
    if(sx + sw > iw){ const o = sx + sw - iw; sw -= o; dw -= o * kx; }
    if(sy + sh > ih){ const o = sy + sh - ih; sh -= o; dh -= o * ky; }
    if(sw <= 0 || sh <= 0) return;
    const St = this.S;
    if(this._fx || !St.smooth){
      const m = St.m, cs = [[dx, dy], [dx+dw, dy], [dx, dy+dh], [dx+dw, dy+dh]].map(([u, v]) => [m[0]*u + m[2]*v + m[4], m[1]*u + m[3]*v + m[5]]);
      const bd = [Math.min(...cs.map(q => q[0])), Math.min(...cs.map(q => q[1])), Math.max(...cs.map(q => q[0])), Math.max(...cs.map(q => q[1]))];
      const fm = mul(m, 1, 0, 0, 1, dx, dy), id = oid(S), v = S.__v | 0, sm = St.smooth;
      this._raster('I', bd, (ox, oy) => id + '.' + v + (sm ? '' : 'n') + '|' + [sx, sy, sw, sh, dw, dh].map(n2).join(',') + '|' + n2(fm[0]) + ',' + n2(fm[1]) + ',' + n2(fm[2]) + ',' + n2(fm[3]) + ',' + n2(fm[4]-ox) + ',' + n2(fm[5]-oy),
        (gg, ox, oy) => { gg.setTransform(fm[0], fm[1], fm[2], fm[3], fm[4]-ox, fm[5]-oy); gg.drawImage(S, sx, sy, sw, sh, 0, 0, dw, dh); });
      return;
    }
    if(S.__vol && !isImg(S)){
      // 同一帧里会被反复改写的离屏画布（例如 renderChar 每个角色都画进同一块）：只把用到的这一小块拷进池子里的小画布再贴，
      // 原画布不进队列 → 不用中途提交 GPU，也不用每次整块重新上传
      const ix = Math.floor(sx), iy = Math.floor(sy), iw = Math.min(iw0(S) - ix, Math.ceil(sx + sw) - ix), ih = Math.min(ih0(S) - iy, Math.ceil(sy + sh) - iy);
      const c = this._snapCanvas(iw, ih), g = c.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, c.width, c.height); g.drawImage(S, ix, iy, iw, ih, 0, 0, iw, ih);
      const s = this._sprite(this._tex(c, sx - ix, sy - iy, sw, sh)); this._place(s, mul(St.m, dw / sw, 0, 0, dh / sh, dx, dy)); s.tint = 0xffffff;
      return;
    }
    const s = this._sprite(this._tex(S, sx, sy, sw, sh)); this._place(s, mul(St.m, dw / sw, 0, 0, dh / sh, dx, dy)); s.tint = 0xffffff;
  }
  // 快照池：按尺寸分桶（宽高各向上取到 32 的倍数），同一桶本帧第几次用第几块；3 秒没用过的整块释放
  _snapCanvas(w, h){
    const bw = Math.ceil(w / 32) * 32, bh = Math.ceil(h / 32) * 32, k = bw + 'x' + bh;
    let b = this.snap.get(k); if(!b){ b = { list:[], i:0, f:0 }; this.snap.set(k, b); }
    if(b.f !== this.frameNo){ b.f = this.frameNo; b.i = 0; }
    let c = b.list[b.i++]; if(!c){ c = document.createElement('canvas'); c.width = bw; c.height = bh; b.list.push(c); }
    c.__used = this.frameNo; return c;
  }
  _snapGC(){
    if(this.frameNo % 60) return;
    for(const [k, b] of this.snap){ b.list = b.list.filter(c => { if(this.frameNo - c.__used > 180){ c.width = 0; c.height = 0; return false; } return true; }); if(!b.list.length) this.snap.delete(k); }
  }
  _text(stroke, t, x, y, maxW){
    if(!this.live) return; t = String(t); if(!t) return;
    const S = this.S; PG.font = S.font; PG.letterSpacing = S.ls; PG.textAlign = S.align; PG.textBaseline = S.base; PG.direction = S.dir;
    const mt = PG.measureText(t); let L = mt.actualBoundingBoxLeft, R = mt.actualBoundingBoxRight, A = mt.actualBoundingBoxAscent, D = mt.actualBoundingBoxDescent;
    let k = 1; if(maxW !== undefined && mt.width > maxW && maxW > 0) k = maxW / mt.width;
    const lw = stroke ? S.lw : 0, m = S.m, ex = lw + 2;
    const cs = [[x - L*k - ex, y - A - ex], [x + R*k + ex, y - A - ex], [x - L*k - ex, y + D + ex], [x + R*k + ex, y + D + ex]].map(([u, v]) => [m[0]*u + m[2]*v + m[4], m[1]*u + m[3]*v + m[5]]);
    const bd = [Math.min(...cs.map(q => q[0])), Math.min(...cs.map(q => q[1])), Math.max(...cs.map(q => q[0])), Math.max(...cs.map(q => q[1]))];
    if(this._dyn && maxW === undefined && !m[1] && !m[2]){   // 61 版：会动的字（伤害数字、飘字）——按标准大小画一次，移动 / 缩放不再重画
      const ds = this._dyn, c0 = m[0] / ds, c3 = m[3] / ds, sty = stroke ? this._strokeStyleKey() + styleKey(S.stroke) : styleKey(S.fill), font = S.font, al = S.align, bs = S.base, dir = S.dir, ls = S.ls, st = stroke ? S.stroke : S.fill;
      const bx = [(-L - ex) * c0, (R + ex) * c0], by = [(-A - ex) * c3, (D + ex) * c3];
      this._raster(stroke ? 'TS' : 'TF', [Math.min(bx[0], bx[1]), Math.min(by[0], by[1]), Math.max(bx[0], bx[1]), Math.max(by[0], by[1])],
        () => FONTGEN + '|' + font + '|' + ls + al + bs + dir + '|' + sty + '|' + n2(c0) + ',' + n2(c3) + '|' + (typeof st === 'string' ? '' : n2(x) + ',' + n2(y)) + '|' + t,
        (g, ox, oy) => { g.font = font; g.letterSpacing = ls; g.textAlign = al; g.textBaseline = bs; g.direction = dir; g.setTransform(c0, 0, 0, c3, -ox - c0 * x, -oy - c3 * y);   // 锚点 (x, y) 落在光栅图的原点；渐变仍按用户坐标定位
          if(stroke){ this._applyStroke(g); g.strokeText(t, x, y); } else { g.fillStyle = realStyle(g, st); g.fillText(t, x, y); } },
        { s: ds, tx: m[0] * x + m[4], ty: m[3] * y + m[5] });
      return; }
    const fm = mul(m, 1, 0, 0, 1, x, y), sty = stroke ? this._strokeStyleKey() + styleKey(S.stroke) : styleKey(S.fill), font = S.font, al = S.align, bs = S.base, dir = S.dir, ls = S.ls, fill = S.fill;
    this._raster(stroke ? 'TS' : 'TF', bd, (ox, oy) => FONTGEN + '|' + font + '|' + ls + al + bs + dir + '|' + sty + '|' + n2(fm[0]) + ',' + n2(fm[1]) + ',' + n2(fm[2]) + ',' + n2(fm[3]) + ',' + n2(fm[4]-ox) + ',' + n2(fm[5]-oy) + '|' + (maxW ?? '') + '|' + ((stroke ? typeof S.stroke : typeof fill) === 'string' ? '' : n2(x) + ',' + n2(y)) + '|' + t,
      (g, ox, oy) => { g.font = font; g.letterSpacing = ls; g.textAlign = al; g.textBaseline = bs; g.direction = dir;
        // 渐变 / 图案按 m 的用户空间定位：这种情况在 (x, y) 画字，不把 (x, y) 并进变换
        const st = stroke ? S.stroke : fill, px = typeof st === 'string' ? 0 : x, py = typeof st === 'string' ? 0 : y;
        g.setTransform(fm[0], fm[1], fm[2], fm[3], fm[4]-ox - (fm[0]*px + fm[2]*py), fm[5]-oy - (fm[1]*px + fm[3]*py));
        if(stroke){ this._applyStroke(g); maxW === undefined ? g.strokeText(t, px, py) : g.strokeText(t, px, py, maxW); }
        else { g.fillStyle = realStyle(g, fill); maxW === undefined ? g.fillText(t, px, py) : g.fillText(t, px, py, maxW); } });
  }
  // 61 版：把已经下载好、还没上传显卡的图提前上传（同 Pixi 的 prepare）。filter(src 路径) 选图；budget 毫秒内做不完就下次再调；返回还剩几张
  __prewarm(filter, budget){
    if(!this.ready || !this.r || !this.r.texture || !this.r.texture.bindSource) return 0;
    const t0 = performance.now(); let left = 0;
    for(const im of ALLIMG){
      if(im.__pxs || im.__pw || !im.complete || !im.naturalWidth || (filter && !filter(im.src || ''))) continue;
      if(performance.now() - t0 > (budget || 8)){ left++; continue; }
      try{ const t = this._tex(im, 0, 0, im.naturalWidth, im.naturalHeight); t.source.autoGarbageCollect = false; this.r.texture.bindSource(t.source, 0); }catch(e){} im.__pw = 1;
    }
    return left;
  }
  __dynText(s){ this._dyn = s > 0 ? s : 0; }   // 61 版：之后的文字当「会动的字」画；s = 当前变换里属于动画的那部分缩放（没有缩放传 1），画完传 0 关掉
  fillText(t, x, y, w){ this._text(false, t, x, y, w); }
  strokeText(t, x, y, w){ this._text(true, t, x, y, w); }
  isPointInPath(){ return false; } isPointInStroke(){ return false; }
  getImageData(){ throw new Error('PixiCtx: 主画布不能读像素'); } putImageData(){ console.warn('PixiCtx: putImageData 未支持'); }
  getContextAttributes(){ return { alpha:true }; }
}
PixiCtx._warned = {};
const _MT = new P.Matrix();
// 图片缩小显示时用多级纹理（mipmap）：实测默认不开时和 Canvas 2D 更接近；?mip=1 打开对比
const MIP = /[?&]mip=1\b/.test(location.search), MIPC = /[?&]mipc=1\b/.test(location.search);

// ---------- 58 版：角色在 GPU 上画（不再用 2D 画布逐三角形 + 离屏叠十几遍） ----------
// 每批（一次提交）里：
//   1) 每个角色原样画进一张共用的「角色图集」渲染贴图（2048²）的一格：宠物 = Spine 网格（skeleton 顶点直接进 GPU），怪物 = 零件精灵；
//      格子里的像素和直接画在屏幕上完全对齐（只整像素平移），所以采样结果和画在屏幕上一样。
//   2) 屏幕上在角色的位置放一块贴片，用一个着色器一次算完 57 版 renderChar 的全部质感：补线（同色外扩）→ 暗部渐变 → 左上亮边 → 受击闪白 / 着色 / 剪影 → 透明度。
//   整批只多一次切换渲染目标（每个角色一个滤镜会每次都切，手机 GPU 上每切一次都要整屏读写，所以不用 Pixi 的滤镜）。
// render.js 的 charGL() 调用；__charBegin 返回 false 时（WebGL 没准备好、角色过大）调用方回到 2D 画法。
const AT = 2048;
const CH_VS = `precision highp float;
in vec2 aPosition; in vec2 aUV;
out vec2 vUV; out vec2 vPos;
uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix;
void main(){ mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0); vUV = aUV; vPos = aPosition; }`;
const CH_FS = `precision highp float;
in vec2 vUV; in vec2 vPos;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uCell;    // 本格在图集里的范围（uv），采样夹在格内
uniform vec4 uL;       // 离屏设备像素偏移 → 屏幕像素（2×2，列优先 a b c d）
uniform vec4 uP;       // 补线半径(设备像素, 0=不补) / 方向数 8|12 / 质感开(1) / 透明度
uniform vec4 uShade;   // 暗部渐变：起点 y、终点 y（屏幕像素）、最深透明度、-
uniform vec4 uRim;     // 亮边：错开量 x、y（设备像素）、透明度、-
uniform vec4 uFlash;   // 闪白：rgb（0~1）、透明度
uniform vec4 uTint;    // 着色：rgb、透明度
uniform vec4 uSil;     // 剪影：rgb、透明度（<0 = 不用）
vec4 S(vec2 o){ vec2 uv = vUV + vec2(uL.x * o.x + uL.z * o.y, uL.y * o.x + uL.w * o.y) / ${AT}.0; return texture(uTexture, clamp(uv, uCell.xy, uCell.zw)); }
vec4 dil(vec2 b){
  vec4 acc = vec4(0.0); float r = uP.x, nd = uP.y;
  if(r > 0.0){
    for(int k = 0; k < 12; k++){ if(float(k) >= nd) break; float t = float(k) / nd * 6.2831853; vec4 s = S(b - vec2(cos(t), sin(t)) * r); acc = s + acc * (1.0 - s.a); }
    for(int k = 0; k < 12; k += 2){ if(float(k) >= nd) break; float t = (float(k) + 0.5) / nd * 6.2831853; vec4 s = S(b - vec2(cos(t), sin(t)) * r * 0.5); acc = s + acc * (1.0 - s.a); }
  }
  vec4 s = S(b); return s + acc * (1.0 - s.a);
}
void main(){
  vec4 c = dil(vec2(0.0));
  if(c.a <= 0.0){ finalColor = vec4(0.0); return; }
  if(uP.z > 0.5){
    float t = clamp((vPos.y - uShade.x) / (uShade.y - uShade.x), 0.0, 1.0), u = clamp((t - 0.55) / 0.45, 0.0, 1.0), ga = uShade.z * u;
    vec3 gc = mix(vec3(40.0, 20.0, 60.0), vec3(40.0, 20.0, 70.0), u) / 255.0;
    c.rgb = c.rgb * (1.0 - ga) + gc * ga * c.a;
    float ra = uRim.z * clamp(c.a * (1.0 - dil(-uRim.xy).a), 0.0, 1.0);
    c = vec4(vec3(1.0, 1.0, 240.0 / 255.0) * ra * c.a, ra * c.a) + c * (1.0 - ra);
  }
  if(uFlash.a > 0.0) c = vec4(uFlash.rgb * uFlash.a * c.a, uFlash.a * c.a) + c * (1.0 - uFlash.a);
  if(uTint.a > 0.0) c = vec4(uTint.rgb * uTint.a * c.a, uTint.a * c.a) + c * (1.0 - uTint.a);
  if(uSil.a >= 0.0) c = vec4(uSil.rgb * uSil.a * c.a, uSil.a * c.a);
  finalColor = c * uP.w;
}`;
let CH_PROG = null, SR = null, SPV = null;
const QUAD_IDX = new Uint32Array([0, 1, 2, 0, 2, 3]);
const rgb3 = n => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
Object.assign(PixiCtx.prototype, {
  _atInit(){
    this.rt = P.RenderTexture.create({ width:AT, height:AT, resolution:1, antialias:false });
    this.atlas = new P.Container(); this.atN = 0; this.atX = 2; this.atY = 2; this.atRow = 0;
    this.cc = []; this.cci = 0; this.sm = []; this.smi = 0; this.qd = []; this.qi = 0;
    CH_PROG = P.GlProgram.from({ vertex:CH_VS, fragment:CH_FS, name:'tata-char' });
  },
  _atAlloc(w, h){
    if(this.atX + w + 2 > AT){ this.atX = 2; this.atY += this.atRow + 2; this.atRow = 0; }
    if(this.atY + h + 2 > AT) return null;
    const c = { x:this.atX, y:this.atY }; this.atX += w + 2; if(h > this.atRow) this.atRow = h; return c;
  },
  _atRender(){
    this.r.render({ container:this.atlas, target:this.rt, clear:true, clearColor:[0, 0, 0, 0] });
    this.fstat.charPasses = (this.fstat.charPasses|0) + 1;
  },
  // 角色开始：之后的 drawImage / __spine 都画进图集里的一个容器（先按屏幕坐标放，结束时量范围再挪进格子）
  __charBegin(){
    if(!this.live || this._ch || this._ly || this.noChar) return false;
    if(!this.atlas){ if(this.r.context && this.r.context.webGLVersion === 1){ this.noChar = true; return false; } this._atInit(); }
    let c = this.cc[this.cci++]; if(!c){ c = new P.Container(); this.cc.push(c); }
    c.removeChildren(); c.position.set(0, 0); this.atlas.addChild(c); this.atN++;
    this._ch = { target:this.target, c, alpha:this.S.alpha, comp:this.S.comp, cb:this.clips.length };
    this.target = c; this.S.alpha = 1; this.S.comp = 'source-over';
    return true;
  },
  // 出错时放弃当前角色（render.js 的 charGL 在 finally 里调用）
  __charAbort(){ const ch = this._ch; if(!ch) return; this._ch = null; this.target = ch.target; this.S.alpha = ch.alpha; this.S.comp = ch.comp; if(ch.c.parent) this.atlas.removeChild(ch.c); this.atN = this.atlas.children.length; },
  _keepFront(pool, objs, get){ let n = 0; for(let i = 0; i < pool.length && n < objs.length; i++){ if(objs.includes(get(pool[i]))){ const t = pool[n]; pool[n] = pool[i]; pool[i] = t; n++; } } return n; },
  // 本批图集满了：先把之前的角色和屏幕内容提交，当前这个角色（和它用到的池子对象）留到下一批
  _atOverflow(c){
    this.atlas.removeChild(c); this.atN--;
    const kids = c.children.slice();
    this._flush();
    this.cci = this._keepFront(this.cc, [c], o => o);
    this.smi = this._keepFront(this.sm, kids, o => o.m);
    this.spi = this._keepFront(this.sp, kids, o => o);
    c.removeChildren(); for(const k of kids) c.addChild(k);
    this.atlas.addChild(c); this.atN = 1;
  },
  // 角色结束：量范围、放进格子，在屏幕上放贴片。p = {pad, r, nd, look, alpha, L:[a,b,c,d], shade:[y0,y1,a], rim:[x,y,a], flash, tint, sil}
  __charEnd(p){
    const ch = this._ch; if(!ch) return false; this._ch = null;
    this.target = ch.target; this.S.alpha = ch.alpha; this.S.comp = ch.comp;
    const c = ch.c; if(!c.children.length){ this.atlas.removeChild(c); this.atN--; return true; }
    const B = c.getLocalBounds(), pad = Math.ceil((p.pad || 0) + 3);
    if(!(B.width > 0 && B.height > 0) || !isFinite(B.minX + B.minY + B.maxX + B.maxY)){ this.atlas.removeChild(c); this.atN--; return true; }
    // 格子按完整范围分配（不能夹到屏幕：容器里的东西会整只画进图集，超出格子会弄脏隔壁格子）
    const X0 = Math.floor(B.minX) - pad, Y0 = Math.floor(B.minY) - pad, X1 = Math.ceil(B.maxX) + pad, Y1 = Math.ceil(B.maxY) + pad;
    const w = X1 - X0, h = Y1 - Y0;
    if(X1 <= 0 || Y1 <= 0 || X0 >= this.canvas.width || Y0 >= this.canvas.height){ this.atlas.removeChild(c); this.atN--; return true; }   // 整只在屏幕外
    if(w > AT - 8 || h > AT - 8){ this.atlas.removeChild(c); this.atN--; return false; }   // 太大：调用方回到 2D 画法
    let cell = this._atAlloc(w, h); if(!cell){ this._atOverflow(c); cell = this._atAlloc(w, h); }
    c.position.set(cell.x - X0, cell.y - Y0);
    const chs = { X0, Y0, w, h, cell, alpha:ch.alpha };
    let q = this.qd[this.qi++];
    if(!q){
      const ug = new P.UniformGroup({ uCell:{ value:new Float32Array(4), type:'vec4<f32>' }, uL:{ value:new Float32Array(4), type:'vec4<f32>' },
        uP:{ value:new Float32Array(4), type:'vec4<f32>' }, uShade:{ value:new Float32Array(4), type:'vec4<f32>' }, uRim:{ value:new Float32Array(4), type:'vec4<f32>' },
        uFlash:{ value:new Float32Array(4), type:'vec4<f32>' }, uTint:{ value:new Float32Array(4), type:'vec4<f32>' }, uSil:{ value:new Float32Array(4), type:'vec4<f32>' } });
      const geometry = new P.MeshGeometry({ positions:new Float32Array(8), uvs:new Float32Array(8), indices:QUAD_IDX });
      const shader = new P.Shader({ glProgram:CH_PROG, resources:{ uTexture:this.rt.source, cu:ug } });
      q = { m:new P.Mesh({ geometry, shader }), ug, pos:new Float32Array(8), uv:new Float32Array(8) };
      this.qd.push(q);
    }
    const U = q.ug.uniforms, pos = q.pos, uv = q.uv;
    pos[0] = X0; pos[1] = Y0; pos[2] = X0 + w; pos[3] = Y0; pos[4] = X0 + w; pos[5] = Y0 + h; pos[6] = X0; pos[7] = Y0 + h;
    const u0 = cell.x / AT, v0 = cell.y / AT, u1 = (cell.x + w) / AT, v1 = (cell.y + h) / AT;
    uv[0] = u0; uv[1] = v0; uv[2] = u1; uv[3] = v0; uv[4] = u1; uv[5] = v1; uv[6] = u0; uv[7] = v1;
    const g = q.m.geometry; g.positions = pos; g.uvs = uv;
    // 夹在格内：留半个像素，双线性采样不取到隔壁格
    U.uCell[0] = (cell.x + 0.5) / AT; U.uCell[1] = (cell.y + 0.5) / AT; U.uCell[2] = (cell.x + w - 0.5) / AT; U.uCell[3] = (cell.y + h - 0.5) / AT;
    U.uL.set(p.L); U.uP[0] = p.r || 0; U.uP[1] = p.nd || 8; U.uP[2] = p.look ? 1 : 0; U.uP[3] = chs.alpha * (p.alpha == null ? 1 : p.alpha);
    if(p.shade){ U.uShade[0] = p.shade[0]; U.uShade[1] = p.shade[1]; U.uShade[2] = p.shade[2]; }
    if(p.rim){ U.uRim[0] = p.rim[0]; U.uRim[1] = p.rim[1]; U.uRim[2] = p.rim[2]; }
    U.uFlash[0] = U.uFlash[1] = U.uFlash[2] = 1; U.uFlash[3] = p.flash > 0 ? Math.min(0.85, p.flash) : 0;
    const col = (s, out) => { if(!s){ out[3] = -1; return; } const c = parseColor(s), k = rgb3(c.rgb); out[0] = k[0]; out[1] = k[1]; out[2] = k[2]; out[3] = c.a; };
    col(p.tint, U.uTint); if(U.uTint[3] < 0) U.uTint[3] = 0;
    col(p.sil, U.uSil);
    q.ug.update();
    q.m.blendMode = BLEND[ch.comp] || 'normal'; q.m.alpha = 1;
    this.target.addChild(q.m); this.fstat.chars = (this.fstat.chars|0) + 1; return true;
  },
  // Spine 骨架（spine-canvas 4.3 的数据）直接变成 GPU 网格。m = 骨架坐标 → 屏幕像素的矩阵。
  // 和 spine-canvas 的 drawTriangles 一样：只用颜色的透明度（不着色、不管混合模式和裁剪附件）
  __spine(sk, m){
    if(!SR){ SR = new spine.SkeletonRenderer(PG); SPV = { pos:new Float32Array(4096), uv:new Float32Array(4096), idx:new Uint32Array(6144) }; }
    const RA = spine.RegionAttachment, MA = spine.MeshAttachment, QT = spine.SkeletonRenderer.QUAD_TRIANGLES, sc = sk.color;
    const order = sk.drawOrder.appliedPose || sk.drawOrder;
    let curImg = null, curA = -1, nv = 0, ni = 0;
    const emit = () => {
      if(!ni) return;
      let o = this.sm[this.smi++];
      if(!o){ o = { m:new P.Mesh({ geometry:new P.MeshGeometry({ positions:new Float32Array(8), uvs:new Float32Array(8), indices:new Uint32Array(3) }), texture:P.Texture.WHITE }) }; this.sm.push(o); }
      const g = o.m.geometry;
      g.positions = SPV.pos.slice(0, nv * 2); g.uvs = SPV.uv.slice(0, nv * 2); g.indices = SPV.idx.slice(0, ni);
      o.m.texture = this._tex(curImg, 0, 0, srcW(curImg), srcH(curImg));
      const t = _MT; t.a = m[0]; t.b = m[1]; t.c = m[2]; t.d = m[3]; t.tx = m[4]; t.ty = m[5]; o.m.setFromMatrix(t);
      o.m.alpha = curA; o.m.blendMode = 'normal'; o.m.tint = 0xffffff;
      this.target.addChild(o.m); this.fstat.sprites++;
      nv = 0; ni = 0;
    };
    for(let i = 0; i < order.length; i++){
      const slot = order[i], pose = slot.appliedPose || slot, att = pose.attachment; if(!att) continue;
      let vt, tris, img;
      if(att instanceof RA){ const sq = att.sequence, k = sq.resolveIndex(pose), uvs = sq.getUVs(k), off = att.getOffsets(pose);
        vt = SR.computeRegionVertices(slot, att, off, uvs, false); tris = QT; const rg = sq.regions[k]; img = rg && rg.texture && rg.texture.getImage(); }
      else if(att instanceof MA){ const sq = att.sequence, k = sq.resolveIndex(pose), uvs = sq.getUVs(k);
        vt = SR.computeMeshVertices(slot, att, uvs, false); tris = att.triangles; const rg = sq.regions[k]; img = rg && rg.texture && rg.texture.getImage(); }
      else continue;
      if(!img) continue;
      const pc = pose.color, ac = att.color, a = sc.a * pc.a * ac.a; if(a <= 0) continue;
      let n = 0; for(let j = 0; j < tris.length; j++) if(tris[j] + 1 > n) n = tris[j] + 1;
      if(img !== curImg || a !== curA || (nv + n) * 2 > SPV.pos.length || ni + tris.length > SPV.idx.length){ emit(); curImg = img; curA = a; }
      if(n * 2 > SPV.pos.length || tris.length > SPV.idx.length){   // 超大网格：扩容
        const k2 = Math.max(n * 2, tris.length) * 2; SPV.pos = new Float32Array(k2); SPV.uv = new Float32Array(k2); SPV.idx = new Uint32Array(k2 * 2); }
      for(let j = 0; j < n; j++){ const b = j * 8; SPV.pos[(nv + j) * 2] = vt[b]; SPV.pos[(nv + j) * 2 + 1] = vt[b + 1]; SPV.uv[(nv + j) * 2] = vt[b + 6]; SPV.uv[(nv + j) * 2 + 1] = vt[b + 7]; }
      for(let j = 0; j < tris.length; j++) SPV.idx[ni + j] = nv + tris[j];
      nv += n; ni += tris.length;
    }
    emit();
  },
});

// ---------- 58 版：GPU 离屏层（代替每帧重画再整块上传的 2D 离屏画布：营地地面、宠物页远景 / 前景） ----------
// __layerBegin(id, x0, y0, w, h, key)：之后的绘制画进这一层的渲染贴图（屏幕像素 x0,y0 起、w×h，和屏幕一一对应）；
//   key 和上次一样 → 返回 {skip:true}，调用方不用再画，直接沿用上次的内容（营地地面只在镜头移动时重画）。
// __layerEnd(h)：把这一层按当前透明度 / 混合模式贴到屏幕 (x0,y0)。
Object.assign(PixiCtx.prototype, {
  __layerBegin(id, x0, y0, w, h, key){
    if(!this.live || this._ly || this._ch || !(w > 0 && h > 0)) return null;
    if(!this.layers){ this.layers = new Map(); this.lyPend = [];
      // iOS 切后台常会丢 WebGL 上下文，恢复后渲染贴图里的内容没了：所有层都要重画
      this.canvas.addEventListener('webglcontextrestored', () => { for(const L of this.layers.values()) L.key = undefined; }); }
    let L = this.layers.get(id);
    if(!L){ L = { c:new P.Container(), rt:null, key:undefined, sp:[], spi:0, tex:null }; this.layers.set(id, L); }
    // 渲染贴图只增不减（按 64 取整），用左上角 w×h：宠物页拖动面板时不用每帧重建
    if(!L.rt || L.rt.width < w || L.rt.height < h){ if(L.rt) L.rt.destroy(true);
      L.rt = P.RenderTexture.create({ width:Math.ceil(w / 64) * 64, height:Math.ceil(h / 64) * 64, resolution:1, antialias:false }); L.key = undefined; L.tex = null; }
    if(!L.tex || L.tw !== w || L.th !== h){ if(L.tex) L.tex.destroy(false); L.tex = new P.Texture({ source:L.rt.source, frame:new P.Rectangle(0, 0, w, h) }); L.tw = w; L.th = h; L.key = undefined; }
    L.x0 = x0; L.y0 = y0;
    if(key != null && key === L.key) return { L, skip:true };
    L.key = key; L.c.removeChildren(); L.spi = 0; L.c.position.set(-x0, -y0);
    const S0 = this.S;
    this._ly = { L, target:this.target, alpha:S0.alpha, comp:S0.comp, cb:this.clips.length, sh:[S0.shc, S0.shb, S0.shx, S0.shy, S0.filter] };
    this.target = L.c; S0.alpha = 1; S0.comp = 'source-over'; S0.shc = 'rgba(0,0,0,0)'; S0.shb = 0; S0.shx = 0; S0.shy = 0; S0.filter = 'none';   // 和独立的 2D 离屏一样：不继承阴影 / 滤镜
    if(!this.lyPend.includes(L)) this.lyPend.push(L);
    return { L, skip:false };
  },
  __layerEnd(h){
    if(!h) return; const L = h.L;
    if(!h.skip && this._ly && this._ly.L === L){ const o = this._ly; this._ly = null; this.target = o.target; const S0 = this.S; S0.alpha = o.alpha; S0.comp = o.comp; [S0.shc, S0.shb, S0.shx, S0.shy, S0.filter] = o.sh; }
    const s = this._sprite(L.tex); const t = _MT; t.a = 1; t.b = 0; t.c = 0; t.d = 1; t.tx = L.x0; t.ty = L.y0; s.setFromMatrix(t);
    s.alpha = this.S.alpha; s.blendMode = BLEND[this.S.comp] || 'normal'; s.tint = 0xffffff;
  },
});

window.PIXICTX = {
  create(cv){ cv.__pxctx = true; const c = new PixiCtx(cv); window.PIXICTX.main = c; return c; },
  _Path:Path,
  fontsChanged(){ FONTGEN++; },
  cacheInfo(){ return { rasterEntries:RC.size, rasterMB:+(RC_PX*4/1048576).toFixed(1) }; },
};
})();
