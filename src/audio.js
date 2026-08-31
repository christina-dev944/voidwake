// audio.js — tiny procedural WebAudio SFX, no asset files (#7).
// A single AudioContext is created lazily on the first user gesture (browsers
// block audio before that). Every sound is synthesized from oscillators and
// short noise bursts, so the game ships zero binary audio.

let ctx=null, master=null, muted=false;
try { muted = localStorage.getItem('voidwake.muted')==='1'; } catch {}

function ensure(){
  if(ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  return ctx;
}

// call from any user gesture so the context is allowed to make sound
export function resumeAudio(){ const c=ensure(); if(c && c.state==='suspended') c.resume(); }
export function toggleMute(){ muted=!muted; try{ localStorage.setItem('voidwake.muted', muted?'1':'0'); }catch{} return muted; }
export function isMuted(){ return muted; }

// a pitched blip with a quick attack + exponential decay; optional pitch slide
function tone(freq, dur, {type='triangle', gain=0.2, slideTo=null, attack=0.005}={}){
  if(muted) return; const c=ensure(); if(!c) return;
  const t=c.currentTime, o=c.createOscillator(), g=c.createGain();
  o.type=type; o.frequency.setValueAtTime(freq,t);
  if(slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1,slideTo), t+dur);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(gain, t+attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.02);
}

// a filtered white-noise burst — the basis for hits/explosions
function noise(dur, {gain=0.2, freq=1200, q=1, type='lowpass'}={}){
  if(muted) return; const c=ensure(); if(!c) return;
  const t=c.currentTime, n=Math.floor(c.sampleRate*dur);
  const buf=c.createBuffer(1,n,c.sampleRate), d=buf.getChannelData(0);
  for(let i=0;i<n;i++) d[i]=Math.random()*2-1;
  const src=c.createBufferSource(); src.buffer=buf;
  const f=c.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q;
  const g=c.createGain(); g.gain.setValueAtTime(gain,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t+dur);
}

export const sfx = {
  shoot(){ tone(700+Math.random()*50, 0.06, {gain:0.045, slideTo:500}); },   // soft pew (auto-fire → kept quiet)
  hurt(){ tone(200,0.18,{type:'sawtooth',gain:0.16,slideTo:80}); noise(0.12,{gain:0.1,freq:500}); },
  enemyKill(){ noise(0.10,{gain:0.13,freq:1500,q:0.7}); },
  bossKill(){ noise(0.5,{gain:0.3,freq:700,q:0.6}); tone(140,0.5,{type:'sawtooth',gain:0.2,slideTo:50}); },
  levelUp(){ tone(523,0.12,{type:'square',gain:0.11}); setTimeout(()=>tone(784,0.16,{type:'square',gain:0.11}),90); },
  nova(){ tone(300,0.35,{type:'sine',gain:0.2,slideTo:1200}); noise(0.3,{gain:0.11,freq:2200}); },
  death(){ noise(0.7,{gain:0.34,freq:800,q:0.5}); tone(180,0.7,{type:'sawtooth',gain:0.24,slideTo:40}); },
};
