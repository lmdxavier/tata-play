'use strict';
/* 背景音乐（29 版起；用户 2026-11-12 给的两首：素材库\音乐\tata BGM）
   局外界面（战斗入口 / 宠物 / 营地）= main，战斗中 = battle；切换时 0.8 秒交叉淡化，回到局外从头放。
   战斗结束（胜利 / 失败）时战斗音乐压低到 30%，让结算音效听得清。
   31 版（用户 2026-11-12）：音乐有点小 → 音量 0.5 → 0.8（文件已对齐 -18 LUFS，×0.8 ≈ -20 LUFS，比音效低约 2dB）；
     暂停时音乐暂停（记住播放位置，继续时从原处接着放），不是淡下去。
   音乐不进音效的总线压缩器（否则会被打击音效压得一抽一抽），单独接到输出。 */
const MUSIC = { vol:0.8, bufs:{}, cur:null, out:null, decoding:false };
function musicDecode(){
  if(MUSIC.decoding || !SND.ac || !window.TATA_BGM) return; MUSIC.decoding=true;
  MUSIC.out = SND.ac.createGain(); MUSIC.out.gain.value = MUSIC.vol; MUSIC.out.connect(SND.ac.destination);
  for(const [k,v] of Object.entries(window.TATA_BGM)){
    const bin=atob(v.b64), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
    SND.ac.decodeAudioData(u.buffer).then(b=>{ MUSIC.bufs[k]=b; }).catch(e=>console.warn('音乐解码失败', k, e));
  }
}
function musicWant(){ if(!MT.inBattle) return {k:'main', g:1, pause:false}; return {k:'battle', g:G.over?0.3:1, pause:!!(G.paused && !G.over)}; }
// 当前播放位置（秒）：前奏只放一次，之后在 [loopStart, loopEnd) 里循环
function musicPos(c){ const d=window.TATA_BGM[c.k], el=SND.ac.currentTime-c.t0; return el<d.loopEnd ? el : d.loopStart + (el-d.loopStart)%(d.loopEnd-d.loopStart); }
function musicStart(k, g, offset, fade){
  const now=SND.ac.currentTime, d=window.TATA_BGM[k], b=MUSIC.bufs[k], src=SND.ac.createBufferSource(), gain=SND.ac.createGain();
  src.buffer=b; src.loop=true; src.loopStart=d.loopStart; src.loopEnd=Math.min(d.loopEnd, b.duration);
  gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(g, now+fade);
  src.connect(gain); gain.connect(MUSIC.out); src.start(now, offset);
  return {k, g, src, gain, t0:now-offset, paused:false};
}
function musicTick(){
  if(!SND.ac) return; musicDecode();
  const w=musicWant(), now=SND.ac.currentTime, c=MUSIC.cur;
  { const mv=SND.musicOff?0:MUSIC.vol; if(MUSIC._mv!==mv){ MUSIC._mv=mv; MUSIC.out.gain.setTargetAtTime(mv, now, 0.1); } }   // 44 版：只在静音状态变化时调度（原来每 100ms 加一条，事件一直累积）
  if(c && c.k===w.k){
    // 46 版（用户 2026-11-13：「暂停改成静音那种淡入淡出的效果，而不是戛然而止」）：暂停时音乐约 0.4 秒淡出再停（原来 0.1 秒），继续时 0.4 秒淡入（原来 0.25 秒），和静音开关一样的手感
    if(w.pause && !c.paused){ c.pos=musicPos(c); c.gain.gain.setTargetAtTime(0, now, 0.1); c.src.stop(now+0.5); c.paused=true; return; }
    if(!w.pause && c.paused){ MUSIC.cur=musicStart(c.k, w.g, c.pos, 0.4); return; }
    if(!c.paused && c.g!==w.g){ c.g=w.g; c.gain.gain.setTargetAtTime(w.g, now, 0.4); }
    return; }
  const b=MUSIC.bufs[w.k]; if(!b) return;
  if(c && !c.paused){ c.gain.gain.cancelScheduledValues(now); c.gain.gain.setValueAtTime(c.gain.gain.value, now); c.gain.gain.linearRampToValueAtTime(0, now+0.8); c.src.stop(now+0.85); }
  MUSIC.cur=musicStart(w.k, w.g, 0, c?0.8:1.2);
  if(w.pause){ MUSIC.cur.pos=0; MUSIC.cur.src.stop(); MUSIC.cur.paused=true; }
}
setInterval(musicTick, 100);
