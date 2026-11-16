/* 建筑立体感对比页：三档切换（现在 / 加结构 / 加阴影），只在小镇画面显示；网址加 ?town=0|1|2 直接打开某一档 */
(function () {
  'use strict';
  const NAMES = ['现在', '加结构', '加阴影'];
  const box = document.createElement('div'); box.id = 'tmode'; box.className = 't';
  const set = m => { window.TOWN_MODE && TOWN_MODE(m); [...box.children].forEach((b, i) => b.classList.toggle('on', i === m)); try { history.replaceState(null, '', location.pathname + '?town=' + m); } catch (e) {} };
  NAMES.forEach((n, i) => { const b = document.createElement('button'); b.textContent = n; for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown']) b.addEventListener(ev, e => e.stopPropagation()); b.addEventListener('click', e => { e.stopPropagation(); set(i); }); box.appendChild(b); });
  document.getElementById('wrap').appendChild(box);
  const m0 = Math.max(0, Math.min(2, +(new URLSearchParams(location.search).get('town') || 0) || 0));
  const wait = setInterval(() => { if (window.TOWN && TOWN.ready && TOWN._last) { clearInterval(wait); set(m0); } }, 100);
  setInterval(() => { const st = window.G && G.state && G.state(); box.style.display = st && st.mode === 'shore' && !st.trans ? 'flex' : 'none'; [...box.children].forEach((b, i) => b.classList.toggle('on', window.TOWN && TOWN.mode === i)); }, 250);
})();
