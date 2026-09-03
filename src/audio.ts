// audio.js — tiny procedural WebAudio SFX, no asset files (#7).
// A single AudioContext is created lazily on the first user gesture (browsers
// block audio before that). Every sound is synthesized from oscillators and
// short noise bursts, so the game ships zero binary audio.

let ctx=null, master=null, muted=false;
try { muted = localStorage.getItem('voidwake.muted')==='1'; } catch {}

function ensure(){
  if(ctx) return ctx;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
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

// One 1-second white-noise buffer, generated once and shared by every noise() call
// (playing a random slice). Avoids allocating + filling a fresh buffer per SFX, which
// hitched when many fired at once (e.g. a screen full of marksman shots, #46).
let noiseBuf=null;
function sharedNoise(c){
  if(noiseBuf && noiseBuf.length===c.sampleRate) return noiseBuf;
  const n=c.sampleRate; noiseBuf=c.createBuffer(1,n,c.sampleRate);
  const d=noiseBuf.getChannelData(0); for(let i=0;i<n;i++) d[i]=Math.random()*2-1;
  return noiseBuf;
}
// a filtered white-noise burst — the basis for hits/explosions. `freqTo` sweeps
// the filter cutoff over the burst (e.g. high→low = a "boom" closing down).
function noise(dur, {gain=0.2, freq=1200, q=1, type='lowpass', freqTo=null}={}){
  if(muted) return; const c=ensure(); if(!c) return;
  const t=c.currentTime;
  const src=c.createBufferSource(); src.buffer=sharedNoise(c);
  const off=Math.max(0, Math.random()*(1-Math.min(0.99,dur)));  // random slice for variety
  const f=c.createBiquadFilter(); f.type=type; f.Q.value=q;
  f.frequency.setValueAtTime(freq,t);
  if(freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(1,freqTo), t+dur);
  const g=c.createGain(); g.gain.setValueAtTime(gain,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t, off, dur); // start(when, offset, duration) auto-stops
}

// Lancer beam: a sustained hum + sizzle held while the laser fires (#43). The nodes
// are persistent (built once on first fire) and never stop — instead their gains ramp
// in/out via setTargetAtTime so starting/stopping the beam doesn't click. laser(on)
// is called every frame from the loop; it drives the ramp toward on/off.
let beam=null;
function beamEnsure(){
  const c=ensure(); if(!c) return null;
  if(beam) return beam;
  const osc=c.createOscillator(); osc.type='sawtooth'; osc.frequency.value=170; // the electric hum
  const sub=c.createOscillator(); sub.type='sine';     sub.frequency.value=85;  // weight under it
  const oscG=c.createGain(); oscG.gain.value=0;
  const len=c.sampleRate, b=c.createBuffer(1,len,c.sampleRate), d=b.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  const nsrc=c.createBufferSource(); nsrc.buffer=b; nsrc.loop=true;          // looping sizzle
  const bp=c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=2600; bp.Q.value=0.7;
  const nG=c.createGain(); nG.gain.value=0;
  osc.connect(oscG); sub.connect(oscG); oscG.connect(master);
  nsrc.connect(bp); bp.connect(nG); nG.connect(master);
  osc.start(); sub.start(); nsrc.start();
  beam={oscG,nG,osc};
  return beam;
}

export const sfx = {
  shoot(){ tone(700+Math.random()*50, 0.06, {gain:0.045, slideTo:500}); },   // soft pew (auto-fire → kept quiet)
  hurt(){ tone(110,0.2,{type:'sawtooth',gain:0.17,slideTo:42}); noise(0.12,{gain:0.1,freq:380}); },   // lower, heavier
  enemyKill(){ noise(0.10,{gain:0.13,freq:1500,q:0.7}); },
  // Big layered explosion with an UPWARD flourish so a boss kill reads as a victory,
  // not the downward sawtooth buzz it used to share with hurt/death (#43).
  bossKill(){
    noise(0.08,{gain:0.16,freq:7000,q:0.5});             // bright opening crack
    noise(0.6, {gain:0.32,freq:3200,freqTo:120,q:0.6});  // broadband boom sweeping down
    tone(80, 0.55,{type:'sine',    gain:0.30,slideTo:34});  // deep sub-thump (sine, NOT sawtooth)
    tone(180,0.5, {type:'triangle',gain:0.14,slideTo:520}); // rising flourish — the distinguishing cue
  },
  // Hold the beam sound while firing; energy depletion drops the pitch as a warning growl.
  laser(on, depleted=false){
    const b = (on && !muted) ? beamEnsure() : beam;   // don't spin up nodes just to silence
    if(!b || !ctx) return;
    const t=ctx.currentTime, live = on && !muted;
    // quieter overall, and the tonal hum kept well under the airy sizzle so the pitch
    // barely registers; depletion nudges pitch only slightly (was a loud 170→115 drop).
    b.oscG.gain.setTargetAtTime(live?0.006:0, t, 0.02);
    b.nG.gain.setTargetAtTime(live?0.011:0, t, 0.02);
    if(live) b.osc.frequency.setTargetAtTime(depleted?150:170, t, 0.04);
  },
  levelUp(){ tone(523,0.12,{type:'square',gain:0.11}); setTimeout(()=>tone(784,0.16,{type:'square',gain:0.11}),90); },
  // invulnerability cues (#51): rising "shield up" on start, descending "shield down"
  // on end so you can hear exactly when you're vulnerable again.
  invulnStart(){ tone(480,0.16,{type:'sine',gain:0.09,slideTo:900,attack:0.008}); },
  invulnEnd(){ tone(760,0.14,{type:'sine',gain:0.07,slideTo:340}); },
  // ability charge refill (#54): a clean RISING square blip per charge — deliberately
  // distinct from the downward triangle "pew" of shoot(), and louder than before.
  chargeRefill(){ tone(540,0.1,{type:'square',gain:0.09,slideTo:920}); },
  // …and a fuller two-note "ready" chime when the last charge fills (fully recharged).
  chargeFull(){ tone(700,0.1,{type:'square',gain:0.12,slideTo:1040});
    setTimeout(()=>tone(1046,0.14,{type:'triangle',gain:0.11,slideTo:1320}),80); },
  // explosion: bright crack → broadband boom whose filter sweeps down, over a
  // clean SINE sub-thump (deliberately no sawtooth tone, so it reads as a blast,
  // not the sawtooth "hurt" buzz).
  nova(){ noise(0.09,{gain:0.12,freq:6000,q:0.5}); noise(0.55,{gain:0.19,freq:2200,freqTo:110,q:0.6}); tone(72,0.4,{type:'sine',gain:0.17,slideTo:30}); },
  death(){ noise(0.7,{gain:0.34,freq:800,q:0.5}); tone(180,0.7,{type:'sawtooth',gain:0.24,slideTo:40}); },
  // #46 telegraph: soft low tone when the warning line appears…
  telegraph(){ tone(240,0.22,{type:'sine',gain:0.05,slideTo:300,attack:0.02}); },
  // …a quiet high beep at each pulse peak (fired on the beat, so it accelerates)…
  teleBeep(){ tone(1040,0.05,{type:'sine',gain:0.05}); },
  // …then a sharp zap when it fires the instant beam.
  laserFire(){ tone(880,0.14,{type:'sawtooth',gain:0.12,slideTo:180}); noise(0.14,{gain:0.14,freq:5000,freqTo:800,q:0.7}); },
};
