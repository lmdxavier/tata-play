// 57 版：双击 index.html（file://）打开时用的图片数据包加载器。
// WebGL 不允许上传 file:// 读来的本地图片（浏览器当作跨域），所以 file:// 下改用 assets/_filepack 里的 data: 地址
// （tools/build_filepack.py 生成）。网页（http/https）不走这里，照常读图片文件。必须在 net-retry.js 之后、其他脚本之前加载。
(function(){
  if(location.protocol !== 'file:') return;
  document.write('<script src="assets/_filepack/index.js"><\/script>');
  document.write('<script>(window.TATA_FILEPACK_LIST||[]).forEach(function(n){ document.write(\'<script src="assets/_filepack/\'+n+\'"><\\/script>\'); });<\/script>');
  var P = HTMLImageElement.prototype, d = Object.getOwnPropertyDescriptor(P, 'src');
  var base = location.href.replace(/[?#].*$/, '').replace(/[^\/]*$/, '');
  Object.defineProperty(P, 'src', { configurable:true, get:function(){ return d.get.call(this); },
    set:function(v){
      var s = String(v), pk = window.TATA_FILEPACK;
      if(pk && !/^(data|blob):/.test(s)){
        var h; try { h = new URL(s, base).href; } catch(e){ h = s; }
        if(h.indexOf(base) === 0){ var rel = decodeURIComponent(h.slice(base.length).replace(/[?#].*$/, '')); if(pk[rel]) s = pk[rel]; else console.warn('图片包里没有', rel); }
      }
      d.set.call(this, s);
    } });
})();
