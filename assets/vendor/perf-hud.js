// 57 版：真机性能面板。网址加 ?perf=1 显示（左上角）：帧率、每帧绘制耗时（JS，毫秒）、最慢一帧、
// 绘制方式（WebGL / Canvas）、每帧 GPU 绘制调用次数、每帧纹理上传量。加 &gl=0 可在同一版本里对比 Canvas 2D。
(function(){
  if(!/[?&]perf=1\b/.test(location.search)) return;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:4px;top:calc(env(safe-area-inset-top) + 4px);z-index:99;background:rgba(0,0,0,.7);color:#fff;font:11px/1.35 monospace;padding:4px 6px;border-radius:4px;pointer-events:none;white-space:pre';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(el));
  let n = 0, sum = 0, max = 0, t0 = performance.now(), last = 0;
  window.PERF_HUD = {
    frame(ms){ n++; sum += ms; if(ms > max) max = ms; const t = performance.now(); if(t - t0 < 500) return;
      const pc = window.PIXICTX && PIXICTX.main, s = pc && pc.stats, f = s ? s.frames - (last || 0) : 0;
      let gl = 'Canvas 2D';
      if(pc && pc.ready && f > 0){ gl = `WebGL  调用 ${(s.drawCalls / s.frames).toFixed(0)}/帧  上传 ${(s.upPx / s.frames / 1e3).toFixed(0)}K像素/帧\n精灵 ${(s.sprites / s.frames).toFixed(0)}  光栅 ${(s.raster / s.frames).toFixed(0)}（新 ${(s.rasterMiss / s.frames).toFixed(1)}）`;
        for(const k in s) s[k] = 0; }
      const fc = typeof FC !== 'undefined' && FC.bytes !== undefined ? `  角色缓存 ${(FC.bytes / 1048576).toFixed(0)}MB` : '';
      el.textContent = `${(n * 1000 / (t - t0)).toFixed(0)} 帧/秒  绘制 ${(sum / n).toFixed(1)}ms  最慢 ${max.toFixed(1)}ms${fc}\n${gl}`;
      n = 0; sum = 0; max = 0; t0 = t; }
  };
})();
