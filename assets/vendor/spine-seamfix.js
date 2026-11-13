// 修 Spine 网格的「三角形接缝」：spine-canvas 把网格拆成一个个三角形分别裁剪绘制，
// 每个三角形边缘都有抗锯齿的半透明，相邻两块拼起来就露出一条细缝（看起来像身上的白线）。
// 做法：裁剪区域往外扩约 0.6 像素，让相邻三角形互相盖住接缝；贴图映射不变。
(function(){
  if(!window.spine || !spine.SkeletonRenderer) return;
  const P = spine.SkeletonRenderer.prototype;
  P.drawTriangle = function(img, x0,y0,u0,v0, x1,y1,u1,v1, x2,y2,u2,v2){
    const ctx=this.ctx, w=img.width-1, h=img.height-1;
    u0*=w; v0*=h; u1*=w; v1*=h; u2*=w; v2*=h;
    // 往外扩：按当前缩放把 0.6 像素换算成骨骼坐标
    const m=ctx.getTransform(), sc=Math.sqrt(Math.abs(m.a*m.d-m.b*m.c))||1, e=0.6/sc;
    const cx=(x0+x1+x2)/3, cy=(y0+y1+y2)/3;
    const grow=(x,y)=>{ const dx=x-cx, dy=y-cy, L=Math.hypot(dx,dy)||1; return [x+dx/L*e, y+dy/L*e]; };
    const a=grow(x0,y0), b=grow(x1,y1), c=grow(x2,y2);
    ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.lineTo(c[0],c[1]); ctx.closePath();
    let X1=x1-x0, Y1=y1-y0, X2=x2-x0, Y2=y2-y0, U1=u1-u0, V1=v1-v0, U2=u2-u0, V2=v2-v0;
    let det=U1*V2-U2*V1; if(det===0) return; det=1/det;
    const A=(V2*X1-V1*X2)*det, B=(V2*Y1-V1*Y2)*det, C=(U1*X2-U2*X1)*det, D=(U1*Y2-U2*Y1)*det,
          E=x0-A*u0-C*v0, F=y0-B*u0-D*v0;
    ctx.save(); ctx.transform(A,B,C,D,E,F); ctx.clip(); ctx.drawImage(img,0,0); ctx.restore();
  };
})();
