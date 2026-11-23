// 分赃背包 · 界面（灰盒原型：色块 + emoji + 名字）
(function () {
  'use strict';
  const FZ = window.FZ, BOT = window.FZBOT, CFG = FZ.CFG, ITEMS = FZ.ITEMS;
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), elTop = $('top'), elOpp = $('opp'), elMid = $('mid'), elInfo = $('info'), elMe = $('me'), elBag = $('bag'), elBtns = $('btns'), elFx = $('fx'), elOv = $('overlay');
  const Q = new URLSearchParams(location.search);
  const S = {
    phase: 'title', G: null, A: [], B: [], tray: [], trash: [], sel: null, hold: false, orig: {}, old: new Set(), skip: false,
    mode: null, took: null, confirmLeft: false, scale: 1, cell: 46, disp: { hp: 0, ohp: 0, psn: 0, opsn: 0 }, msg: null, stealSel: null, hot: null,
    stats: { maxHit: 0, t0: 0 }, warn: null, speed: +(Q.get('speed') || 1),
  };
  window.__S = S; // 给测试读状态用，游戏本身不靠它

  // ---------- 声音（简单合成音；启动就建好，任何触摸都尝试恢复）----------
  const SND = { ctx: null, on: Q.get('mute') !== '1' };
  window.SND_COUNT = 0; window.__SND = SND; // 给测试数发声次数、看音频状态
  try { SND.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* 没有声音也能玩 */ }
  function resumeAudio() { const c = SND.ctx; if (c && c.state !== 'running' && SND.on) c.resume().catch(() => {}); }
  ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, resumeAudio, true));
  function beep(freq, dur, type, vol, slide) {
    const c = SND.ctx; if (!SND.on || !c || c.state !== 'running') return;
    window.SND_COUNT++;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'triangle'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol || 0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol) {
    const c = SND.ctx; if (!SND.on || !c || c.state !== 'running') return;
    window.SND_COUNT++;
    const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; g.gain.value = vol; src.connect(g); g.connect(c.destination); src.start();
  }
  const seq = (fs, gap, dur, type, vol) => fs.forEach((f, i) => setTimeout(() => beep(f, dur, type, vol), i * gap));
  const sfx = {
    tick: (i) => beep(330 * Math.pow(1.07, Math.min(i, 22)), 0.09, 'triangle', 0.1),
    mult: () => beep(880, 0.13, 'sine', 0.1, 1320), block: () => beep(220, 0.08, 'square', 0.05), heal: () => beep(523, 0.15, 'sine', 0.08, 784),
    poison: () => beep(180, 0.14, 'sawtooth', 0.05, 120), hit: () => { noise(0.15, 0.2); beep(110, 0.15, 'square', 0.1, 55); },
    pick: () => beep(440, 0.05, 'triangle', 0.06), place: () => beep(300, 0.05, 'square', 0.04), merge: () => seq([523, 784], 90, 0.14, 'triangle', 0.1),
    bad: () => beep(140, 0.18, 'sawtooth', 0.07), roul: () => beep(600, 0.03, 'square', 0.04), roll: (f) => beep(f, 0.04, 'square', 0.04),
    win: () => seq([523, 659, 784, 1047], 120, 0.2, 'triangle', 0.12), lose: () => seq([392, 330, 262, 196], 150, 0.25, 'sawtooth', 0.08),
    crit: () => { beep(1047, 0.1, 'square', 0.08); beep(1568, 0.16, 'triangle', 0.1); },
    boom: () => { noise(0.4, 0.3); beep(80, 0.4, 'sawtooth', 0.15, 30); }, refl: () => beep(1200, 0.18, 'sine', 0.1, 400), good: () => seq([659, 880], 100, 0.15, 'triangle', 0.1),
  };

  // ---------- 排版：固定 390 宽的竖屏舞台，整体缩放 ----------
  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    let scale = vw / 390, H = vh / scale;
    if (H < 640) { scale = vh / 640; H = 640; }
    if (H > 860) H = 860;
    S.scale = scale; S.cell = Math.floor(Math.min(60, 46 + (H - 640) / 5));
    stage.style.height = H + 'px';
    stage.style.setProperty('--cell', S.cell + 'px'); stage.style.setProperty('--tile', Math.floor(Math.min(50, 46 + (H - 640) / 12)) + 'px');
    stage.style.transform = `translate(${Math.round((vw - 390 * scale) / 2)}px, ${Math.round((vh - H * scale) / 2)}px) scale(${scale})`;
    $('bagwrap').style.height = (4 * S.cell + 6) + 'px';
    if (S.G) renderBag();
  }
  window.addEventListener('resize', fit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
  window.addEventListener('scroll', () => window.scrollTo(0, 0));
  ['gesturestart', 'gesturechange', 'dblclick'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // ---------- 小工具 ----------
  const fmt = FZ.fmt;
  const dead = (id) => id !== S.runId; // 这一局已经被重开了：还没演完的东西直接作废
  const ABORT = { abort: true };
  const wait = (ms) => S.skip ? Promise.resolve() : new Promise((r) => { const t = setTimeout(r, ms / S.speed); S.wake = () => { clearTimeout(t); r(); }; });
  const stars = (it) => it.lv > 1 ? '★'.repeat(it.lv) : '';
  function pos(el) { const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(); return { x: (r.left + r.width / 2 - s.left) / S.scale, y: (r.top + r.height / 2 - s.top) / S.scale }; }
  function float(el, text, cls, dy) {
    if (S.skip || !el) return;
    const p = pos(el), d = document.createElement('div');
    d.className = 'float ' + cls; d.textContent = text; d.style.left = p.x + 'px'; d.style.top = (p.y + (dy || 0)) + 'px';
    elFx.appendChild(d); setTimeout(() => d.remove(), 750);
  }
  function anim(el, cls) { if (!el || S.skip) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function itemInfo(it) {
    const d = ITEMS[it.id], sz = d.w * d.h > 1 ? `，占 ${d.w}×${d.h} 格` : '';
    return `<span><b>${d.name}${it.lv > 1 ? ' ' + it.lv + ' 级' : ''}</b>（${FZ.TAGNAME[d.tag]}${sz}）：${FZ.desc(it)}</span>`;
  }
  function tileHTML(it, where, style, cls) {
    const d = ITEMS[it.id], c = ['tile', 't-' + d.tag, 'lv' + it.lv];
    if (S.sel === it.uid) c.push('sel');
    if (cls) c.push(cls);
    const sz = (where !== 'bag' && where !== 'opp' && d.w * d.h > 1) ? `<span class="sz">${d.w}×${d.h}</span>` : '';
    const fz = it.id === 'barrel' ? `<span class="fz">💥${it.fuse}</span>` : '';
    return `<div class="${c.join(' ')}" data-uid="${it.uid}" data-where="${where}" style="${style || ''}"><span class="ic">${d.icon}</span><span class="nm">${d.name}</span><span class="lv">${stars(it)}</span>${sz}${fz}</div>`;
  }
  function findAny(uid) {
    const G = S.G; if (!G) return null;
    let it = G.bag.items.find((i) => i.uid === uid); if (it) return { it, where: 'bag' };
    it = S.tray.find((i) => i.uid === uid); if (it) return { it, where: 'tray' };
    it = S.A.find((i) => i.uid === uid); if (it) return { it, where: 'A' };
    it = S.B.find((i) => i.uid === uid); if (it) return { it, where: 'B' };
    if (G.opp) { it = G.opp.bag.items.find((i) => i.uid === uid); if (it) return { it, where: 'opp' }; }
    return null;
  }

  // ---------- 画各个区域 ----------
  const NODE_ICON = { small: '客', regular: '熟', boss: '头', chest: '箱', rest: '歇' };
  function renderTop() {
    const G = S.G; let h = '';
    FZ.RUN.forEach((n, i) => { const k = n.t === 'guest' ? n.kind : n.t; h += `<div class="nd ${G && i < G.node ? 'done' : ''} ${G && i === G.node ? 'cur' : ''}">${NODE_ICON[k]}</div>`; });
    h += `<div class="sp"></div><div class="tbtn" data-act="help">?</div><div class="tbtn" data-act="sound">${SND.on ? '🔊' : '🔇'}</div>`;
    elTop.innerHTML = h;
  }
  function hpBar(cur, max, mine) { cur = Math.max(0, Math.round(cur)); return `<div class="hp ${mine ? 'mine' : ''}"><i style="width:${Math.max(0, Math.min(100, 100 * cur / max))}%"></i><span>${cur} / ${max}</span></div>`; }
  function rewardText(kind) {
    const r = CFG.reward[kind], a = [];
    if (r.heal) a.push(`回 ${r.heal} 血`); if (r.maxHp) a.push(`血上限 +${r.maxHp}`); if (r.steal) a.push('从他包里拿 1 件'); if (r.expand) a.push(`背包变成 ${r.expand[0]}×${r.expand[1]}`);
    return a.join('、');
  }
  function renderOpp() {
    const G = S.G, o = G && G.opp;
    if (!o) { elOpp.innerHTML = `<div class="oinfo"><div class="oname">${S.msg && S.msg.title || ''}</div><div class="osub">${S.msg && S.msg.sub || ''}</div></div>`; return; }
    const t = FZ.TASTES[FZ.tasteNow(o)], nx = FZ.tasteNext(o), left = o.stay - o.round;
    const oc = 22, w = o.bag.cols * oc + (o.bag.cols - 1) * 2, hgt = o.bag.rows * oc + (o.bag.rows - 1) * 2;
    let g = '';
    for (let y = 0; y < o.bag.rows; y++) for (let x = 0; x < o.bag.cols; x++) g += `<div class="cellbg" style="left:${x * (oc + 2)}px;top:${y * (oc + 2)}px;width:${oc}px;height:${oc}px"></div>`;
    for (const it of o.bag.items) { const d = ITEMS[it.id]; g += tileHTML(it, 'opp', `left:${it.x * (oc + 2)}px;top:${it.y * (oc + 2)}px;width:${d.w * (oc + 2) - 2}px;height:${d.h * (oc + 2) - 2}px`, 'inopp'); }
    const gone = S.disp.ohp <= 0 ? '已经被你打跑了' : left <= 0 ? (o.final ? '轮数到了，他带着东西走了' : '待够了，已经走了') : null;
    const stay = gone || (o.final ? `必须在 ${left} 轮内打跑他` : left <= 1 ? '这是他待的最后 1 轮' : `他还待 ${left} 轮`);
    elOpp.innerHTML = `<div class="oinfo">
      <div class="oname">${o.name}<span class="okind ${o.kind === 'boss' ? 'boss' : ''}">${FZ.KIND[o.kind]}</span></div>
      ${hpBar(S.disp.ohp, o.maxHp)}
      <div class="otaste">口味 <b>${t.name}</b>：${t.text}${nx ? `<span class="osub">（下一轮变成${FZ.TASTES[nx].name}）</span>` : ''}</div>
      <div class="osub">${stay}${S.disp.opsn ? ` · <span class="psn">☠ 中毒 ${S.disp.opsn} 层</span>` : ''}</div>
      <div class="osub">${gone ? '' : o.final ? '打跑他就赢了' : '打跑奖励：' + rewardText(o.kind)}</div>
    </div><div class="obag"><div class="olab">他的包（可点）</div><div class="g" style="width:${w}px;height:${hgt}px">${g}</div></div>`;
  }
  function pileHTML(key, items) {
    const G = S.G, p = FZ.probA(FZ.tasteNow(G.opp), S.A, S.B), pct = Math.round(100 * (key === 'A' ? p : 1 - p));
    let cls = 'pile'; if (S.hot === key) cls += ' hot';
    if (S.took) cls += S.took === key ? ' took' : ' kept';
    const lab = S.took ? (S.took === key ? '他拿走了' : '归你') : '他拿这堆';
    return `<div class="${cls}" data-zone="pile${key}"><div class="ph"><span>${lab}</span><span class="pct" data-pct="${key}">${S.took ? '' : pct + '%'}</span></div><div class="tiles">${items.map((it) => tileHTML(it, key)).join('')}</div></div>`;
  }
  function renderMid() {
    const G = S.G;
    if (S.phase === 'split' || S.phase === 'reveal') { elMid.innerHTML = pileHTML('A', S.A) + pileHTML('B', S.B); return; }
    if (S.phase === 'arrange') {
      const head = S.mode === 'chest' ? '箱子里的，全归你' : S.mode === 'loot' ? '从他包里拿来的' : '到手的';
      elMid.innerHTML = `<div class="tray" data-zone="tray"><div class="ph">${head}（拖进背包，或者点一下选中再点格子）</div><div class="tiles">${S.tray.map((it) => tileHTML(it, 'tray', '', S.mode === 'fight' && S.old.has(it.uid) ? 'old' : '')).join('')}</div></div>
        <div class="trash ${S.hot === 'trash' ? 'hot' : ''}" data-zone="trash"><span class="big">🗑️</span><span>丢掉</span>${S.trash.length ? `<span>已丢 ${S.trash.length} 件<br>点这里捡回</span>` : ''}</div>`;
      return;
    }
    if (S.phase === 'steal') {
      const list = G.opp.bag.items.filter((i) => i.id !== 'barrel');
      elMid.innerHTML = `<div class="tray" data-zone="stealbox"><div class="ph">从他包里挑 1 件带走</div><div class="tiles">${list.map((it) => tileHTML(it, 'steal', '', S.stealSel === it.uid ? 'sel' : '')).join('')}</div></div>`;
      return;
    }
    if (S.phase === 'msg') { elMid.innerHTML = `<div class="msg"><div class="t">${S.msg.title}</div><div>${S.msg.text}</div></div>`; return; }
    if (S.phase === 'fight' || S.phase === 'after') return; // 结算时由 play() 自己画
    elMid.innerHTML = '';
  }
  function setInfo(html, warn) { elInfo.innerHTML = '<div>' + html + '</div>'; elInfo.classList.toggle('warn', !!warn); }
  function renderInfo() {
    if (S.warn) { setInfo(S.warn, true); return; }
    if (S.stealSel != null) { const f = findAny(S.stealSel); if (f) { setInfo(itemInfo(f.it)); return; } }
    if (S.sel != null) { const f = findAny(S.sel); if (f) { setInfo(itemInfo(f.it) + (S.phase === 'split' && (f.where === 'A' || f.where === 'B') ? '<span style="color:#b9a892">　再点一下挪到另一堆</span>' : '')); return; } }
    const G = S.G; let t = '';
    if (S.phase === 'split') t = `分成两堆。按<b>${G.opp.name}</b>的口味哪堆分高，他越爱拿；他拿走一堆，剩下归你。点物品看说明，再点一下挪到另一堆（也可拖）。`;
    else if (S.phase === 'reveal') t = `${G.opp.name}在挑……`;
    else if (S.phase === 'arrange') t = S.mode === 'fight' ? '背包从左到右、从上到下逐件出手。两件一样的叠起来合成升级（数值翻倍）。带白点的旧东西每轮只能挪 2 件。' : '这次旧东西可以随便挪。两件一样的叠起来合成升级（数值翻倍）。摆好了点继续。';
    else if (S.phase === 'fight') t = '背包从左到右、从上到下逐件出手。伤害 = 攻击 × 倍率。你的武器每下 15% 暴击。你先出手，打跑了他就不挨打。';
    else if (S.phase === 'steal') t = `${S.msg.text}点一件看说明，再点下面的按钮带走。`;
    setInfo(t);
  }
  function movedOld() {
    let n = 0;
    for (const uid of S.old) { const f = findAny(uid); if (!f) continue; if (f.where === 'tray') n++; else if (f.where === 'bag') { const o = S.orig[uid]; if (f.it.x !== o.x || f.it.y !== o.y) n++; } }
    return n;
  }
  function renderMe() {
    const G = S.G; if (!G) { elMe.innerHTML = ''; return; }
    const mv = S.phase === 'arrange' && S.mode === 'fight' ? `<span class="mv">旧东西还能挪 ${CFG.oldMoves - movedOld()} 件</span>` : '';
    elMe.innerHTML = `<span>你</span>${hpBar(S.disp.hp, G.maxHp, true)}${S.disp.psn ? `<span class="psn">☠ ${S.disp.psn}</span>` : ''}${mv}`;
  }
  function renderBag(preview) {
    const G = S.G; if (!G) { elBag.innerHTML = ''; return; }
    const b = G.bag, c = S.cell, p = c + 2;
    elBag.style.width = (b.cols * p - 2) + 'px'; elBag.style.height = (b.rows * p - 2) + 'px';
    let h = '';
    const pv = {}; if (preview) for (const k of preview.cells) pv[k] = preview.cls;
    for (let y = 0; y < b.rows; y++) for (let x = 0; x < b.cols; x++) h += `<div class="cellbg ${pv[x + ',' + y] || ''}" data-cx="${x}" data-cy="${y}" style="left:${x * p}px;top:${y * p}px;width:${c}px;height:${c}px"></div>`;
    const arranging = S.phase === 'arrange' && S.mode === 'fight';
    for (const it of b.items) {
      const d = ITEMS[it.id];
      h += tileHTML(it, 'bag', `left:${it.x * p}px;top:${it.y * p}px;width:${d.w * p - 2}px;height:${d.h * p - 2}px`, 'inbag' + (arranging && S.old.has(it.uid) ? ' old' : '') + (S.dragUid === it.uid ? ' dragging' : ''));
    }
    elBag.innerHTML = h;
  }
  function btn(label, act, cls) { return `<div class="btn ${cls || ''}" data-act="${act}">${label}</div>`; }
  function renderBtns() {
    const G = S.G; let h = '';
    if (S.phase === 'split') h = btn(S.A.length && S.B.length ? '分好了，让他挑' : '每堆至少要有 1 件', 'split', S.A.length && S.B.length ? '' : 'off');
    else if (S.phase === 'reveal') h = btn('……', 'none', 'off');
    else if (S.phase === 'arrange') {
      if (S.mode === 'fight') {
        const o = G.opp;
        if (o.stay - o.round >= 2 && !o.final) h += btn(S.hold ? '留手：开着<br>武器这轮不出手' : '留手：关着<br>点了武器不出手', 'hold', 'sec' + (S.hold ? ' on' : ''));
        h += btn(S.confirmLeft ? `还有 ${S.tray.length} 件没放<br>再点一次就丢掉并开打` : '开打', 'fight');
      } else h = btn(S.confirmLeft ? `还有 ${S.tray.length} 件没放<br>再点一次就丢掉` : '继续', 'cont');
    } else if (S.phase === 'fight') h = btn('跳过', 'skip', 'sec') + btn('……', 'none', 'off');
    else if (S.phase === 'after') h = btn('继续', 'after');
    else if (S.phase === 'steal') h = btn(S.stealSel != null ? '就拿这件' : '先点一件', 'steal', S.stealSel != null ? '' : 'off');
    else if (S.phase === 'msg') h = btn('继续', 'msg');
    elBtns.innerHTML = h;
  }
  function render() { renderTop(); renderOpp(); renderMid(); renderInfo(); renderMe(); renderBag(); renderBtns(); }
  function warn(t) { S.warn = t; renderInfo(); clearTimeout(S.warnT); S.warnT = setTimeout(() => { S.warn = null; renderInfo(); }, 2600); }

  // ---------- 流程 ----------
  function syncDisp() { const G = S.G; S.disp.hp = G.hp; S.disp.psn = G.poison; S.disp.ohp = G.opp ? G.opp.hp : 0; S.disp.opsn = G.opp ? G.opp.poison : 0; }
  function touchPhase() { S.guardUntil = Date.now() + 320 / S.speed; } // 刚换画面的一小会儿不收按钮，防连点
  function setPhase(p) { touchPhase(); S.phase = p; S.sel = null; S.stealSel = null; S.hot = null; S.warn = null; render(); }
  function banner(html, ms) {
    return new Promise((res) => { const d = document.createElement('div'); d.className = 'banner'; d.innerHTML = html; stage.appendChild(d); setTimeout(() => { d.remove(); res(); }, ms / S.speed); });
  }
  function start() {
    const seed = Q.get('seed') ? +Q.get('seed') + (S.runN || 0) : (Date.now() % 1000000007); // 网址带编号时，每再来一局编号 +1
    S.runN = (S.runN || 0) + 1;
    S.runId = (S.runId || 0) + 1; S.skip = true; if (S.wake) S.wake(); S.skip = false;
    stage.querySelectorAll('.banner, #ghost').forEach((e) => e.remove()); elFx.innerHTML = ''; drag = null; S.dragUid = null; S.lastRes = null; S.msgNext = null; S.confirmRestart = false;
    S.G = FZ.newRun(seed, { fair: Q.get('fair') === '1' });
    S.stats = { maxHit: 0, t0: Date.now(), seed };
    S.tray = []; S.trash = []; S.A = []; S.B = []; S.took = null; S.msg = null;
    elOv.classList.remove('show');
    advance();
  }
  async function advance() {
    const rid = S.runId, G = S.G, node = FZ.nextNode(G);
    S.took = null; S.A = []; S.B = []; S.tray = []; S.trash = [];
    if (!node) return end();
    syncDisp();
    if (node.t === 'guest') {
      const o = G.opp, t = FZ.TASTES[FZ.tasteNow(o)];
      S.phase = 'idle'; render();
      await banner(`<div class="t">${FZ.KIND[o.kind]} ${o.name} 来了</div>口味 <b>${t.name}</b>：${t.text}<br>${o.final ? `最后一个头目，${o.stay} 轮内必须打跑他` : `待 ${o.stay} 轮，打跑他才有奖励`}`, 1500);
      if (dead(rid)) return;
      return beginRound();
    }
    if (node.t === 'chest') {
      const items = FZ.applyChest(G);
      S.msg = { title: '宝箱', sub: node.expand ? `捡到一个大点的包：背包变成 ${node.expand[0]}×${node.expand[1]}。箱子里的东西不用分，全归你。` : '箱子里的东西不用分，全归你。' };
      S.tray = items; S.mode = 'chest'; sfx.good(); return startArrange();
    }
    const h = FZ.applyRest(G); syncDisp(); sfx.heal();
    S.msg = { title: '歇一会儿', sub: '', text: `烤烤火，回了 ${h} 血。` };
    setPhase('msg'); S.msgNext = advance;
  }
  function beginRound() {
    const G = S.G, table = FZ.dealTable(G);
    S.took = null; S.A = []; S.B = []; S.tray = []; S.trash = [];
    table.forEach((it, i) => (i % 2 === 0 ? S.A : S.B).push(it));
    syncDisp(); setPhase('split');
  }
  async function confirmSplit() {
    const G = S.G; if (!S.A.length || !S.B.length || S.phase !== 'split') return;
    const rid = S.runId, want = BOT.wantOf(G, S.A, S.B), ch = FZ.oppChoose(G, S.A, S.B, want);
    S.lastChoice = ch;
    const A0 = S.A.slice(), B0 = S.B.slice();
    S.phase = 'reveal'; S.sel = null; render();
    // 悬念：在两堆之间跳，越跳越慢，停在他拿的那堆
    let n = 9 + Math.floor(Math.random() * 3); if ((n % 2 === 1) !== (ch.took === 'A')) n++;
    for (let i = 1; i <= n; i++) { S.hot = i % 2 === 1 ? 'A' : 'B'; renderMid(); sfx.roul(); await wait(70 + i * i * 4); if (dead(rid)) return; }
    S.hot = null; S.took = ch.took; renderMid(); ch.took === want || !want ? sfx.good() : sfx.bad();
    await wait(900);
    if (dead(rid)) return;
    const his = ch.took === 'A' ? A0 : B0, mine = ch.took === 'A' ? B0 : A0;
    const before = {}; for (const it of G.opp.bag.items) before[it.uid] = it.lv;
    FZ.oppTake(G, his.slice());
    S.tray = mine.slice(); S.A = []; S.B = []; S.took = null; S.mode = 'fight';
    startArrange();
    // 他新装进包里的（或合成升级的）闪一下
    for (const it of G.opp.bag.items) if (before[it.uid] !== it.lv) anim(elOpp.querySelector(`[data-uid="${it.uid}"]`), 'big');
  }
  function startArrange() {
    const G = S.G;
    S.old = new Set(G.bag.items.map((i) => i.uid)); S.orig = {};
    for (const it of G.bag.items) S.orig[it.uid] = { x: it.x, y: it.y };
    S.trash = []; S.hold = false; S.confirmLeft = false; S.arrN = (S.arrN || 0) + 1;
    setPhase('arrange');
  }
  // 摆放阶段的每个动作：超出「旧东西只能挪 2 件」就整个撤回
  const snap = () => ({ items: S.G.bag.items.map((i) => Object.assign({}, i)), tray: S.tray.map((i) => Object.assign({}, i)), trash: S.trash.map((i) => Object.assign({}, i)) });
  function act(fn) {
    const s = snap(), r = fn();
    if (r === false) { S.G.bag.items = s.items; S.tray = s.tray; S.trash = s.trash; return false; }
    if (S.mode === 'fight' && movedOld() > CFG.oldMoves) { S.G.bag.items = s.items; S.tray = s.tray; S.trash = s.trash; warn('旧东西（左下角带白点的）每轮只能挪 2 件。'); sfx.bad(); return false; }
    S.confirmLeft = false; return true;
  }
  function takeOut(f) { if (f.where === 'tray') S.tray.splice(S.tray.indexOf(f.it), 1); else FZ.removeItem(S.G.bag, f.it.uid); }
  function placeAt(uid, x, y) {
    return act(() => {
      const f = findAny(uid); if (!f || (f.where !== 'tray' && f.where !== 'bag')) return false;
      const bag = S.G.bag, d = ITEMS[f.it.id];
      if (x < 0 || y < 0 || x + d.w > bag.cols || y + d.h > bag.rows) return false;
      const g = FZ.buildGrid(bag), bl = [];
      for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) { const o = g[(y + dy) * bag.cols + x + dx]; if (o >= 0 && bag.items[o].uid !== uid && bl.indexOf(bag.items[o]) < 0) bl.push(bag.items[o]); }
      if (!bl.length) { if (f.where === 'tray') { takeOut(f); bag.items.push(f.it); } f.it.x = x; f.it.y = y; sfx.place(); return true; }
      if (bl.length === 1) {
        const t = bl[0], td = ITEMS[t.id];
        if (FZ.canMerge(t, f.it)) { takeOut(f); FZ.mergeInto(t, f.it); S.sel = t.uid; S.mergedUid = t.uid; sfx.merge(); return true; }
        if (td.w === d.w && td.h === d.h) { // 一样大的互换
          if (f.where === 'bag') { const ox = f.it.x, oy = f.it.y; f.it.x = t.x; f.it.y = t.y; t.x = ox; t.y = oy; }
          else { takeOut(f); FZ.removeItem(bag, t.uid); f.it.x = t.x; f.it.y = t.y; bag.items.push(f.it); t.x = -1; t.y = -1; S.tray.push(t); }
          sfx.place(); return true;
        }
      }
      return false;
    });
  }
  function mergeOnto(uid, targetUid) {
    return act(() => { const f = findAny(uid), t = findAny(targetUid); if (!f || !t || !FZ.canMerge(t.it, f.it)) return false; if (['tray', 'bag'].indexOf(f.where) < 0 || ['tray', 'bag'].indexOf(t.where) < 0) return false; takeOut(f); FZ.mergeInto(t.it, f.it); S.sel = t.it.uid; S.mergedUid = t.it.uid; sfx.merge(); return true; });
  }
  function toTrash(uid) {
    const f = findAny(uid); if (!f || (f.where !== 'tray' && f.where !== 'bag')) return false;
    if (!FZ.canDiscard(f.it)) { warn('火药桶爆炸前不能丢，只能放在包里。'); sfx.bad(); return false; }
    return act(() => { takeOut(f); S.trash.push(f.it); S.sel = null; sfx.place(); return true; });
  }
  function toTray(uid) { return act(() => { const f = findAny(uid); if (!f || f.where !== 'bag') return false; takeOut(f); f.it.x = -1; f.it.y = -1; S.tray.push(f.it); sfx.place(); return true; }); }
  function fromTrash() { // 捡回：旧东西原位还空着就放回原位（不算挪），否则进到手区
    if (!S.trash.length) return;
    act(() => { const it = S.trash.pop(), o = S.orig[it.uid]; if (o && FZ.canPlace(S.G.bag, it.id, o.x, o.y, -1)) { it.x = o.x; it.y = o.y; S.G.bag.items.push(it); } else { it.x = -1; it.y = -1; S.tray.push(it); } sfx.pick(); return true; });
  }
  function leftoverOk() {
    if (S.tray.some((i) => !FZ.canDiscard(i))) { warn('火药桶不能丢，得放进包里（没位置就先丢别的）。'); sfx.bad(); return false; }
    if (S.tray.length && !S.confirmLeft) { S.confirmLeft = true; renderBtns(); return false; }
    S.tray = []; return true;
  }

  // ---------- 打：照着逻辑给的记录一下一下演 ----------
  function calcHTML(me, op, tot) {
    const row = (who, s, t, dim) => `<div class="row ${dim ? 'dim' : ''}"><span class="who">${who}</span>攻击 <b>${fmt(Math.round(s.atk * 10) / 10)}</b> × 倍率 <b>${fmt(s.mult)}</b>${s.block ? ` · 挡 ${s.block}` : ''}<span class="tot">${t}</span></div>`;
    return row('你', me, tot.me, false) + row('他', op, tot.op, tot.opDim);
  }
  const wait0 = wait;
  async function play(res) {
    const G = S.G, o = G.opp;
    S.skip = false;
    const cur = { me: { atk: 0, mult: 1, block: 0 }, op: { atk: 0, mult: 1, block: 0 } }, tot = { me: '?', op: '?', opDim: true }, logs = [];
    const draw = () => { elMid.innerHTML = `<div class="calc">${calcHTML(cur.me, cur.op, tot)}<div class="log">${logs.slice(-3).map((l) => `<div>${l}</div>`).join('')}</div></div>`; };
    const log = (t) => { logs.push(t); draw(); }; S.playLog = log;
    const tileOf = (uid, side) => (side === 'me' ? elBag : elOpp).querySelector(`[data-uid="${uid}"]`);
    const glowEmpty = () => { if (S.skip) return; elBag.querySelectorAll('.cellbg').forEach((c) => { if (!FZ.itemAt(G.bag, +c.dataset.cx, +c.dataset.cy)) { c.classList.add('glow'); setTimeout(() => c.classList.remove('glow'), 420); } }); };
    async function trace(list, side) {
      const d = Math.max(70, Math.min(250, 3000 / Math.max(1, list.length)));
      let k = 0;
      for (const e of list) {
        const el = tileOf(e.u, side), c = cur[side];
        c.atk = e.atk; c.mult = e.mult; c.block = e.block;
        const f = findAny(e.u), id = f ? f.it.id : '';
        const rapid = e.of >= 3;
        if (e.k === 'atk') { const big = side === 'me' && (id === 'great' || (id === 'lone' && e.big)); if (big) { anim(el, 'big'); glowEmpty(); float(el, (e.crit ? '暴击 +' : '+') + Math.round(e.v), 'bigtxt', -6); } else if (e.crit) { anim(el, 'big'); float(el, '暴击 +' + Math.round(e.v), 'crit', -8); } else { anim(el, rapid ? 'rapid' : 'pop'); float(el, '+' + Math.round(e.v), 'atk', -6); } e.crit ? sfx.crit() : sfx.tick(k); if (rapid && e.n === e.of - 1) float(el, `连发 ×${e.of}`, 'combo', -24); }
        else if (e.k === 'mult') { anim(el, 'pop'); float(el, '倍率 +' + fmt(e.v), 'mult', -6); sfx.mult(); if (id === 'cloak' && side === 'me') glowEmpty(); }
        else if (e.k === 'xmult') { anim(el, 'big'); float(el, '倍率 ×' + fmt(e.v), 'mult', -6); e.v < 1 ? sfx.bad() : sfx.mult(); }
        else if (e.k === 'block') { anim(el, 'pop'); float(el, '挡 +' + e.v, 'block', -6); sfx.block(); }
        else if (e.k === 'heal') { anim(el, 'pop'); float(el, '回 +' + e.v, 'heal', -6); sfx.heal(); }
        else if (e.k === 'poison') { anim(el, 'pop'); float(el, '毒 +' + e.v, 'poison', 8); sfx.poison(); }
        else if (e.k === 'tick') { anim(el, 'pop'); float(el, '毒多发作 ' + e.v + ' 次', 'poison', -6); sfx.poison(); }
        else if (e.k === 'fizz') { float(el, '没排在最后', 'block', -6); }
        k++; draw();
        await wait(rapid ? d * 0.55 : d);
      }
    }
    async function roll(side, total) {
      if (!S.skip) for (let i = 1; i <= 10; i++) { tot[side] = Math.round(total * i / 10); draw(); sfx.roll(400 + i * 60); await wait(45); }
      tot[side] = total; draw();
    }
    const hurtOpp = (n, cls, txt) => { S.disp.ohp -= n; renderOpp(); if (n > 0) { float(elOpp, txt || '-' + n, cls || 'dmg'); anim(elOpp, 'shake'); } };
    const hurtMe = (n, txt) => { S.disp.hp -= n; renderMe(); if (n > 0) { float(elMe, txt || '-' + n, 'dmg'); anim($('bagwrap'), 'shake'); } };
    const rid = S.runId, wait = async (ms) => { await wait0(ms); if (dead(rid)) throw ABORT; }; // 重开后，上一局没演完的在下一次等待处中断
    draw();
    await wait(250);
    // 我出手
    await trace(res.traceMe, 'me');
    if (res.hold) log('你留手了：武器这一轮没出手。');
    await roll('me', res.me.total);
    if (res.me.total > S.stats.maxHit) S.stats.maxHit = res.me.total;
    await wait(200);
    if (res.me.total > 0 || !res.hold) { sfx.hit(); hurtOpp(res.toOpp); log(`你打出 <span class="hl">${res.me.total}</span>${res.op.block && res.me.total ? `，他挡掉 ${Math.min(res.op.block, res.me.total)}` : ''}，${o.name}掉 <span class="hl">${res.toOpp}</span> 血。`); }
    await wait(550);
    const finish = async () => {
      if (res.boomMe) { sfx.boom(); hurtMe(res.boomMe, '💥-' + res.boomMe); log(`<span class="bad">你包里的火药桶炸了，掉 ${res.boomMe} 血。</span>`); await wait(500); }
      if (res.boomOpp) { sfx.boom(); hurtOpp(res.boomOpp, 'dmg', '💥-' + res.boomOpp); log(`<span class="good">他包里的火药桶炸了，他掉 ${res.boomOpp} 血。</span>`); await wait(500); }
    };
    if (res.killedBy === 'hit') { log(`<span class="good">打跑了！他这一下没来得及出手。</span>`); await finish(); return; }
    // 他出手
    tot.opDim = false;
    await trace(res.traceOp, 'op');
    await roll('op', res.op.total);
    await wait(200);
    if (res.reflToMe) { sfx.refl(); hurtMe(res.reflToMe, '反弹 -' + res.reflToMe); log(`<span class="bad">他把你的攻击反弹回来，你掉 ${res.reflToMe} 血。</span>`); await wait(350); }
    if (res.op.total > 0) { sfx.hit(); hurtMe(res.toMe); log(`他打出 <span class="hl">${res.op.total}</span>${res.me.block ? `，你挡掉 ${Math.min(res.me.block, res.op.total)}` : ''}，<span class="${res.toMe ? 'bad' : 'good'}">你掉 ${res.toMe} 血。</span>`); }
    else log('他这一轮没有攻击。');
    await wait(400);
    if (res.reflToOpp) { sfx.refl(); anim(elBag, 'flash-blue'); hurtOpp(res.reflToOpp, 'refl', '反弹 -' + res.reflToOpp); log(`<span class="good">你把他的攻击反弹回去，他掉 ${res.reflToOpp} 血。</span>`); await wait(500); }
    if (S.disp.hp <= 0 || S.disp.ohp <= 0) { if (S.disp.ohp <= 0 && S.disp.hp > 0) log('<span class="good">他被反弹打跑了！</span>'); await finish(); return; }
    if (res.healMe || res.healOpp) { sfx.heal(); S.disp.hp += res.healMe; S.disp.ohp += res.healOpp; renderMe(); renderOpp(); if (res.healMe) float(elMe, '+' + res.healMe, 'heal'); if (res.healOpp) float(elOpp, '+' + res.healOpp, 'heal'); log(`${res.healMe ? `你回 ${res.healMe} 血。` : ''}${res.healOpp ? `他回 ${res.healOpp} 血。` : ''}`); await wait(350); }
    if (res.poisonToOpp || res.me.poisonOut) {
      S.disp.opsn = o.poison; sfx.poison(); anim(elOpp, 'flash-green'); hurtOpp(res.poisonToOpp, 'poison', '☠ 毒发 -' + res.poisonToOpp);
      log(`<span class="good">他身上 ${o.poison} 层毒${res.me.ticks > 1 ? `，发作 ${res.me.ticks} 次` : ''}，掉 ${res.poisonToOpp} 血。</span>`); await wait(500);
    }
    if (res.poisonToMe) { S.disp.psn = G.poison; sfx.poison(); hurtMe(res.poisonToMe, '☠ -' + res.poisonToMe); log(`<span class="bad">你身上 ${G.poison} 层毒，掉 ${res.poisonToMe} 血。</span>`); await wait(450); }
    if (S.disp.hp > 0 && S.disp.ohp <= 0) log('<span class="good">他被毒倒了！</span>');
    await finish();
  }
  async function doFight() {
    const rid = S.runId, G = S.G; if (S.phase !== 'arrange' || !leftoverOk()) return;
    touchPhase(); S.phase = 'fight'; S.sel = null; S.warn = null; render();
    const res = FZ.fightRound(G, { hold: S.hold, trace: true });
    S.lastRes = res;
    try { await play(res); } catch (e) { if (e === ABORT) return; throw e; }
    if (dead(rid)) return;
    S.skip = false; syncDisp();
    if (S.disp.ohp < 0) S.disp.ohp = 0;
    renderOpp(); renderMe(); renderBag();
    const o = G.opp;
    const tail = res.next === 'round' ? `${o.name}还剩 ${Math.max(0, o.hp)} 血，再来一轮。` : res.next === 'leave' ? `${o.name}待够了，带着东西走了。没打跑，没有奖励。` : res.next === 'lose' ? (res.escaped ? '轮数到了，头目带着东西走了……' : '你倒下了……') : '';
    if (tail && S.playLog) S.playLog(`<span class="hl">${tail}</span>`);
    touchPhase(); S.phase = 'after'; renderBtns(); renderInfo();
  }
  function afterFight() {
    const G = S.G, res = S.lastRes;
    if (res.next === 'round') return beginRound();
    if (res.next === 'leave') return advance();
    if (res.next === 'lose' || res.next === 'win') return end();
    // 打跑了
    const o = G.opp, r = FZ.applyReward(G); syncDisp(); S.disp.ohp = 0; sfx.good();
    const parts = []; if (r.maxHp) parts.push(`血上限 +${r.maxHp}`); if (r.heal) parts.push(`回 ${r.heal} 血`); if (r.expand) parts.push(`背包变成 ${r.expand[0]}×${r.expand[1]}`);
    const text = `打跑了${o.name}！${parts.join('，')}。`;
    const can = r.steal && o.bag.items.some((i) => i.id !== 'barrel');
    if (can) { S.msg = { text }; setPhase('steal'); }
    else { S.msg = { title: '打跑了', text }; setPhase('msg'); S.msgNext = advance; }
  }
  function doSteal() {
    const G = S.G; if (S.stealSel == null) return;
    const it = G.opp.bag.items.find((i) => i.uid === S.stealSel); if (!it) return;
    const c = Object.assign({}, it); c.uid = FZ.makeItem('scrap').uid; c.x = -1; c.y = -1;
    FZ.removeItem(G.opp.bag, it.uid);
    S.tray = [c]; S.mode = 'loot'; S.msg = { title: `打跑了${G.opp.name}`, sub: '' };
    startArrange();
  }
  function end() {
    const G = S.G, win = G.over === 'win', mins = Math.max(1, Math.round((Date.now() - S.stats.t0) / 60000));
    win ? sfx.win() : sfx.lose();
    const nd = FZ.RUN[Math.min(G.node, FZ.RUN.length - 1)];
    elOv.innerHTML = `<h1>${win ? '赢了！' : '这一局到此为止'}</h1>
      <div class="p">${win ? '最后的头目被你打跑了。' : G.hp > 0 ? '轮数到了，没能打跑最后的头目，他带着东西走了。' : `倒在第 ${G.node + 1} / ${FZ.RUN.length} 个节点（${nd.t === 'guest' ? FZ.KIND[nd.kind] : ''}）。`}</div>
      <div class="stat">打跑的客人：${G.stats.kills} 个<br>让他走掉的：${G.stats.escaped} 个<br>打了 ${G.rounds} 轮，最高一下打出 <b style="color:#ffd66b">${S.stats.maxHit}</b><br>用时约 ${mins} 分钟</div>
      <div class="grow"></div><div class="small">原型 ${window.__BUILD} · 这一局的编号 ${S.stats.seed}</div>
      <div class="btn" data-act="start">再来一局</div>`;
    elOv.classList.add('show'); S.phase = 'end';
  }
  function showTitle() {
    elOv.innerHTML = `<h1>分赃背包</h1><div class="small">玩法原型 ${window.__BUILD}（色块和 emoji 都是占位）</div>
      <div class="p"><b>分</b>　把桌上的东西分成两堆。对手按显示的概率先拿走一堆，剩下的归你。<br>
      <b>摆</b>　把到手的放进背包。放在哪、挨着谁，效果不一样。<br>
      <b>打</b>　两边背包自动逐件出手。伤害 = 攻击 × 倍率。你先出手。</div>
      <div class="p">客人待够轮数就走，打跑他才有奖励。<br>血打光就输；最后的头目必须打跑。</div>
      <div class="grow"></div><div class="btn" data-act="start">开始</div>`;
    elOv.classList.add('show');
  }
  function showHelp() {
    S.prevOv = { html: elOv.innerHTML, show: elOv.classList.contains('show') };
    elOv.innerHTML = `<h2>怎么玩</h2>
      <div class="p"><b>分</b>　每堆至少 1 件。每堆上面的百分比 = 对手拿它的概率，按他的口味算。他拿走的会装进他自己的包，用来打你。<br>
      <b>摆</b>　两件一样的（同名同级）叠在一起合成升 1 级，数值翻倍（概率、次数不变），最高 3 级；破烂不能合。带白点的旧东西每轮只能挪 2 件（宝箱、拿他一件时随便挪）。放不下的丢掉。<br>
      <b>打</b>　背包从左到右、从上到下逐件出手。伤害 = 攻击 × 倍率；倍率对下毒和反弹也生效。你的武器每次出手有 15% 概率暴击（这一下 ×2）。小数舍去。你先出手：打跑了他，他这轮就打不到你；两边同时倒下算你输。<br>
      <b>留手</b>　这一轮武器和铁砧不出手（盾、回血、毒、反弹照常），免得太早打跑他、少分一次东西。他待几轮不变。<br>
      <b>毒</b>　每层每轮掉 1 血，无视格挡，不会自己消；换客人时，他身上的留一半给下一位，你身上的清掉。</div>
      <div class="grow"></div><div class="btn sec" style="flex:0 0 auto" data-act="restart">这局不要了，重新开一局</div><div class="btn" style="flex:0 0 auto" data-act="closehelp">知道了</div>`;
    elOv.classList.add('show');
  }

  // ---------- 点和拖 ----------
  let drag = null;
  function zoneAt(cx, cy) {
    const inR = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; };
    const br = elBag.getBoundingClientRect(), b = S.G && S.G.bag;
    if (b && cx >= br.left - 4 && cx <= br.right + 4 && cy >= br.top - 4 && cy <= br.bottom + 4) {
      const fx = (cx - br.left) / br.width * b.cols, fy = (cy - br.top) / br.height * b.rows;
      return { k: 'bag', fx, fy, x: Math.max(0, Math.min(b.cols - 1, Math.floor(fx))), y: Math.max(0, Math.min(b.rows - 1, Math.floor(fy))) };
    }
    for (const z of ['trash', 'tray', 'pileA', 'pileB']) if (inR(elMid.querySelector(`[data-zone="${z}"]`))) return { k: z };
    return null;
  }
  function dropCell(z, it, grab) { // 拖到背包上时，这件东西左上角落在哪一格
    const d = ITEMS[it.id];
    if (grab) return { x: z.x - grab.dx, y: z.y - grab.dy };
    return { x: Math.round(z.fx - d.w / 2), y: Math.round(z.fy - d.h / 2) };
  }
  function previewFor(uid, x, y) {
    const f = findAny(uid), bag = S.G.bag, d = ITEMS[f.it.id], cells = [];
    for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) cells.push((x + dx) + ',' + (y + dy));
    let cls = 'no';
    if (FZ.canPlace(bag, f.it.id, x, y, uid)) cls = 'ok';
    else if (x >= 0 && y >= 0 && x + d.w <= bag.cols && y + d.h <= bag.rows) {
      const g = FZ.buildGrid(bag), bl = [];
      for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) { const o = g[(y + dy) * bag.cols + x + dx]; if (o >= 0 && bag.items[o].uid !== uid && bl.indexOf(bag.items[o]) < 0) bl.push(bag.items[o]); }
      if (bl.length === 1) { if (FZ.canMerge(bl[0], f.it)) cls = 'mg'; else if (ITEMS[bl[0].id].w === d.w && ITEMS[bl[0].id].h === d.h) cls = 'ok'; }
    }
    return { cells, cls };
  }
  stage.addEventListener('pointerdown', (e) => {
    if (drag) return; // 已经有一根手指在按着了
    const a = e.target.closest('[data-act]');
    if (a) { onAct(a.dataset.act); return; }
    if (elOv.classList.contains('show')) return;
    if (S.phase === 'fight') { return; }
    const t = e.target.closest('.tile');
    if (t) {
      const uid = +t.dataset.uid, where = t.dataset.where;
      const draggable = (S.phase === 'split' && (where === 'A' || where === 'B')) || (S.phase === 'arrange' && (where === 'tray' || where === 'bag'));
      let grab = null;
      if (where === 'bag') { const r = t.getBoundingClientRect(), f = findAny(uid), d = ITEMS[f.it.id]; grab = { dx: Math.min(d.w - 1, Math.floor((e.clientX - r.left) / r.width * d.w)), dy: Math.min(d.h - 1, Math.floor((e.clientY - r.top) / r.height * d.h)) }; }
      drag = { pid: e.pointerId, uid, where, x0: e.clientX, y0: e.clientY, moved: false, draggable, grab, wasSel: S.sel === uid, prevSel: S.sel };
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* 老浏览器 */ }
      return;
    }
    drag = { pid: e.pointerId, empty: true, x0: e.clientX, y0: e.clientY, prevSel: S.sel };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || drag.empty || !drag.draggable || e.pointerId !== drag.pid) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8 * S.scale) return;
      drag.moved = true; S.sel = drag.uid; S.dragUid = drag.uid; sfx.pick();
      const f = findAny(drag.uid), d = ITEMS[f.it.id], g = document.createElement('div');
      g.id = 'ghost'; g.innerHTML = tileHTML(f.it, 'ghost', `width:${d.w * (S.cell + 2) - 2}px;height:${d.h * (S.cell + 2) - 2}px`);
      stage.appendChild(g); drag.ghost = g; render();
    }
    const s = stage.getBoundingClientRect();
    drag.ghost.style.left = ((e.clientX - s.left) / S.scale) + 'px'; drag.ghost.style.top = ((e.clientY - s.top) / S.scale) + 'px';
    const z = zoneAt(e.clientX, e.clientY), f = findAny(drag.uid);
    let hot = null, pv = null;
    if (z && S.phase === 'split' && (z.k === 'pileA' || z.k === 'pileB')) hot = z.k.slice(4);
    if (z && S.phase === 'arrange') { if (z.k === 'trash') hot = 'trash'; if (z.k === 'bag') { const c = dropCell(z, f.it, drag.where === 'bag' ? drag.grab : null); pv = previewFor(drag.uid, c.x, c.y); } }
    if (hot !== S.hot) { S.hot = hot; renderMid(); }
    const key = pv ? pv.cells.join('|') + pv.cls : '';
    if (key !== drag.pvKey) { drag.pvKey = key; renderBag(pv); }
  });
  function endDrag(e, cancel) {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag; drag = null;
    if (d.ghost) d.ghost.remove();
    S.dragUid = null; S.hot = null;
    const z = cancel ? null : zoneAt(e.clientX, e.clientY);
    if (d.empty) { // 点了空地方
      if (S.phase === 'arrange' && z) {
        if (z.k === 'bag' && S.sel != null) { const f = findAny(S.sel); if (f && (f.where === 'tray' || f.where === 'bag')) { const dd = ITEMS[f.it.id]; let ok = false; for (const [ax, ay] of [[z.x, z.y], [z.x - dd.w + 1, z.y], [z.x, z.y - dd.h + 1], [z.x - dd.w + 1, z.y - dd.h + 1]]) { if (FZ.canPlace(S.G.bag, f.it.id, ax, ay, f.it.uid)) { ok = placeAt(S.sel, ax, ay); break; } } if (!ok && !S.warn) { warn('这里放不下。'); } } }
        else if (z.k === 'trash') { if (S.sel != null && findAny(S.sel) && ['tray', 'bag'].indexOf(findAny(S.sel).where) >= 0) toTrash(S.sel); else fromTrash(); }
        else if (z.k === 'tray' && S.sel != null) { const f = findAny(S.sel); if (f && f.where === 'bag') toTray(S.sel); }
      } else if (S.phase === 'split' && z && S.sel != null && (z.k === 'pileA' || z.k === 'pileB')) moveToPile(S.sel, z.k.slice(4));
      else S.sel = null;
      render(); return;
    }
    if (!d.moved) { // 点了一件东西
      if (d.where === 'steal') { S.stealSel = d.uid; sfx.pick(); render(); return; }
      if (S.phase === 'split' && (d.where === 'A' || d.where === 'B')) { if (d.wasSel) moveToPile(d.uid, d.where === 'A' ? 'B' : 'A'); else { S.sel = d.uid; sfx.pick(); } render(); return; }
      if (S.phase === 'arrange' && d.prevSel != null && d.prevSel !== d.uid && (d.where === 'bag' || d.where === 'tray')) {
        const a = findAny(d.prevSel), b = findAny(d.uid);
        if (a && b && ['tray', 'bag'].indexOf(a.where) >= 0) {
          if (FZ.canMerge(b.it, a.it)) { mergeOnto(d.prevSel, d.uid); afterMerge(); render(); return; }
        }
      }
      S.sel = S.sel === d.uid ? null : d.uid; sfx.pick(); render(); return;
    }
    // 拖完松手
    if (z && S.phase === 'split' && (z.k === 'pileA' || z.k === 'pileB')) moveToPile(d.uid, z.k.slice(4));
    else if (z && S.phase === 'arrange') {
      const f = findAny(d.uid);
      if (z.k === 'trash') toTrash(d.uid);
      else if (z.k === 'tray') { if (f.where === 'bag') toTray(d.uid); else { const over = document.elementFromPoint(e.clientX, e.clientY), tt = over && over.closest('.tile'); if (tt && +tt.dataset.uid !== d.uid) { mergeOnto(d.uid, +tt.dataset.uid); afterMerge(); } } }
      else if (z.k === 'bag') { const c = dropCell(z, f.it, d.where === 'bag' ? d.grab : null); if (!placeAt(d.uid, c.x, c.y) && !S.warn) { warn('这里放不下。'); sfx.bad(); } afterMerge(); }
    }
    S.sel = findAny(d.uid) ? d.uid : S.sel; if (S.sel != null && !findAny(S.sel)) S.sel = null;
    render();
  }
  function afterMerge() { if (S.mergedUid == null) return; const uid = S.mergedUid; S.mergedUid = null; setTimeout(() => { const el = stage.querySelector(`.tile[data-uid="${uid}"]`); if (el) { anim(el, 'big'); float(el, '合成！升级', 'combo', -10); } }, 30); }
  stage.addEventListener('pointerup', (e) => endDrag(e, false));
  stage.addEventListener('pointercancel', (e) => endDrag(e, true));
  function moveToPile(uid, to) {
    const from = to === 'A' ? S.B : S.A, dst = to === 'A' ? S.A : S.B, i = from.findIndex((x) => x.uid === uid);
    if (i < 0) return; dst.push(from.splice(i, 1)[0]); S.sel = uid; sfx.place();
  }
  function onAct(a) {
    resumeAudio();
    if (['split', 'fight', 'after', 'cont', 'msg', 'steal'].indexOf(a) >= 0 && Date.now() < (S.guardUntil || 0)) return;
    if (a === 'restart') { if (!S.confirmRestart) { S.confirmRestart = true; const b = elOv.querySelector('[data-act="restart"]'); if (b) b.textContent = '再点一次：这一局作废，重新开'; return; } return start(); }
    if (a === 'start') return start();
    if (a === 'help') { S.confirmRestart = false; return showHelp(); }
    if (a === 'closehelp') { if (S.prevOv && S.prevOv.show) elOv.innerHTML = S.prevOv.html; else elOv.classList.remove('show'); return; }
    if (a === 'sound') { SND.on = !SND.on; if (SND.ctx) { SND.on ? resumeAudio() : SND.ctx.suspend().catch(() => {}); } renderTop(); return; }
    if (a === 'split') return confirmSplit();
    if (a === 'hold') { S.hold = !S.hold; S.confirmLeft = false; sfx.pick(); renderBtns(); return; }
    if (a === 'fight') return doFight();
    if (a === 'skip') { S.skip = true; if (S.wake) S.wake(); return; }
    if (a === 'after') return afterFight();
    if (a === 'steal') return doSteal();
    if (a === 'cont') { if (S.phase === 'arrange' && leftoverOk()) advance(); return; }
    if (a === 'msg') { const f = S.msgNext; S.msgNext = null; if (f) f(); return; }
  }

  fit(); render(); showTitle();
  if (Q.get('auto') === '1') start();
})();
