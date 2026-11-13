// 54 版：图片加载失败自动重试（2026-11-13：国内朋友用 github.io 打开，图集偶尔被网络中断，
// 一张失败整个游戏就卡在「素材加载失败」）。
// 做法：接管所有 <img>/new Image() 的 src 和 onerror —— 失败后隔 0.5/1/1.5/2/2.5 秒带 ?r=n 重新请求，
// 5 次都失败才交给原来的 onerror（之后才挂上的 onerror 也会补调）。data:/blob: 地址不重试。必须在其他脚本之前加载。
(function(){
  var P = HTMLImageElement.prototype;
  var srcD = Object.getOwnPropertyDescriptor(P, 'src');
  var errD = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'onerror');
  if(!srcD || !errD) return;
  var MAX = 5;
  Object.defineProperty(P, 'onerror', { configurable:true,
    get: function(){ return this.__userErr || null; },
    set: function(f){ this.__userErr = f;
      // 已经彻底失败后才挂上的 onerror 也要补调一次，否则等它的 Promise 永远不结束
      if(f && this.__failed){ var im = this; setTimeout(function(){ f.call(im, new Event('error')); }, 0); } } });
  Object.defineProperty(P, 'src', { configurable:true,
    get: function(){ return srcD.get.call(this); },
    set: function(v){
      v = String(v); this.__base = v; this.__try = 0; this.__failed = false;
      if(!this.__hooked){ this.__hooked = true;
        errD.set.call(this, function(e){
          var b = this.__base || '';
          if(this.__try < MAX && !/^(data|blob):/.test(b)){
            var n = ++this.__try, im = this;
            setTimeout(function(){ if(im.__base === b) srcD.set.call(im, b + (b.indexOf('?') < 0 ? '?' : '&') + 'r=' + n); }, 500 * n);
            return;
          }
          this.__failed = true;
          if(this.__userErr) this.__userErr.call(this, e);
        });
      }
      srcD.set.call(this, v);
    } });
})();
