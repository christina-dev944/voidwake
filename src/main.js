import { TAU, rand, clamp, dist2, DANGER_HUE } from './util.js';
import { UPGRADES } from './upgrades.js';
import { CLASSES, DEFAULT_CLASS, BASE, classStatBars, classActiveLabel } from './classes.js';
import * as D from './difficulty.js';
import { sfx, resumeAudio, toggleMute, isMuted } from './audio.js';

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
// Responsive playfield: the canvas fills the viewport (square, capped), and the
// backing store scales with devicePixelRatio so it stays crisp at any browser zoom.
// W/H are the game-unit size (CSS px); drawing is done in game units via setTransform.
let W = 720, H = 720;
function resize(){
  const dpr = window.devicePixelRatio || 1;
  // canvas is centered with the side panel floating over the right margin, so keep
  // symmetric horizontal room for it (~500px) plus the thin top/bottom HUD rows
  const side = Math.max(400, Math.min(window.innerWidth - 500, window.innerHeight - 100, 1200));
  W = side; H = side;
  cv.style.width = side + 'px'; cv.style.height = side + 'px';
  cv.width = Math.round(side * dpr); cv.height = Math.round(side * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // tuck the side panel right up against the centered canvas's right edge
  const sideEl = document.getElementById('side');
  if(sideEl){ sideEl.style.left = Math.round(window.innerWidth/2 + side/2 + 14) + 'px'; sideEl.style.right = 'auto'; }
  if (game && game.player){ game.player.x = clamp(game.player.x, game.player.r, W-game.player.r);
    game.player.y = clamp(game.player.y, game.player.r, H-game.player.r); }
}

// ---- input ----
const keys = {};
addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  resumeAudio();   // first gesture unlocks WebAudio (#7)
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault();
  const k0=e.key.toLowerCase();
  if ((k0==='p'||k0==='escape') && (game.state==='playing'||game.paused)) game.paused = !game.paused;
  if (k0==='m') toggleMute();   // mute toggle (#7)
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// ---- game state ----
const game = {
  state: 'title', // title | classSelect | playing | upgrade | dying | dead
  wave: 0, score: 0, paused:false, dying: 0, // dying = frames to hold the world before the game-over screen (#40)
  player: null, enemies: [], pBullets: [], eBullets: [], particles: [],
  upgrades: [], upgradeChoices: [], time: 0, novaFx: [], coneFx: [], afterimages: [], hazards: [], eid: 0,
  cls: DEFAULT_CLASS, classIdx: 0, classScroll: 0, hoverIdx: -1,
  shake: 0, hitStop: 0, // game-feel: screen-shake magnitude (px) + frames to freeze the sim (#5)
  aimIdx: 0,            // auto-aim target mode (index into AIM_MODES) — persists across runs (#35)
  aimTarget: null,      // currently-locked auto-aim target — gives HIGH-HP mode stickiness (#49)
  aimLockTime: 0,       // game.time when the current HIGH-HP target was locked (dwell timer, #49)
  pauseHover: null,     // which pause button the cursor is over ('resume'|'quit'|null) (#36)
  // player bullets are dimmed so enemy fire stays readable (#29). Default 25%;
  // a settings slider will drive this once the settings menu (#28) lands.
  pBulletAlpha: 0.25,
  // the Lancer beam is a bright, always-on line, so its max opacity is capped
  // BELOW a discrete player bullet's — the ever-present beam sits quieter and
  // enemy fire stays readable (#48). Core = this; glow = a fraction of it.
  beamAlpha: 0.16,
};

// which upgrade categories each weapon draws from (besides 'all')
const WEAPON_UPGRADES = { bullet:['bullet'], homing:['bullet'], laser:['laser'] };

// persistent best run across sessions (#8) — best wave and best score, each kept
// independently so a long run and a high-scoring run both leave their mark.
const BEST_KEY='voidwake.best';
function loadBest(){ try{ const b=JSON.parse(localStorage.getItem(BEST_KEY));
  if(b && typeof b.wave==='number' && typeof b.score==='number') return b; }catch{} return {wave:0,score:0}; }
let best=loadBest();
function recordBest(){ let changed=false;
  if(game.wave>best.wave){ best.wave=game.wave; changed=true; }
  if(game.score>best.score){ best.score=game.score; changed=true; }
  if(changed){ try{ localStorage.setItem(BEST_KEY, JSON.stringify(best)); }catch{} } }

// id → display name, for showing the run's acquired boons in the pause menu (#31)
const UP_NAME = Object.fromEntries(UPGRADES.map(u=>[u.id,u.name]));

function newPlayer(cls=DEFAULT_CLASS) {
  const p = {
    x: W/2, y: H*0.75, r: 12, hitR: 4,
    hp: BASE.maxhp, maxhp: BASE.maxhp, speed: BASE.speed, focusSpeed: BASE.focusSpeed,
    lvl: 1, xp: 0, xpNext: 8,
    fireRate: BASE.fireRate, fireCd: 0, dmg: BASE.dmg, bulletSpeed: BASE.bulletSpeed, shots: 1, spread: 0,
    pierce: 0, crit: 0.05, life: 0, iframes: 0, boostT: 0,
    cls, weapon: cls.weapon||'bullet', range: cls.range||0,
    // active clone (so upgrades don't mutate the class def). `charges` starts full;
    // `activeCd` recharges the next charge when below max. maxCharges defaults to 1 (#51).
    active: cls.active ? {...cls.active} : null, activeCd: 0,
    charges: cls.active ? (cls.active.maxCharges||1) : 0,

    beamDps: cls.beamDps||0, beamWidth: 6, heatRate: 1.2, coolRate: 1.6, heatMax: 100,
    heat: 0, depleted: false, beam: null,
  };
  if (cls.stats) Object.assign(p, cls.stats); // class profile overrides base
  return p;
}

function rollUpgrades() {
  const cats = WEAPON_UPGRADES[game.player.weapon] || []; // boons valid for this weapon
  const pool = UPGRADES.filter(u => (u.for==='all' || cats.includes(u.for)) && (!u.req || u.req(game.player)));
  const out = [];
  for (let i=0;i<3 && pool.length;i++) out.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
  game.upgradeChoices = out;
}

// ---- spawning ----
function startWave(n) {
  game.wave = n;
  if(n%10===0){ game.enemies.push(makeEnemy(D.bossHp(n), n, true)); return; } // every 10th wave = a solo boss (#3)
  const count = D.enemyCount(n);
  for (let i=0;i<count;i++) game.enemies.push(makeEnemy(D.enemyHp(n), n, false));
}

// Enemy archetypes (#2). Each tweaks size, bulk (hpMul), speed, fire pattern pool,
// fire cadence (fireMul, <1 = faster), colour and movement style. `minWave` gates
// when a type starts appearing; `weight` biases the random pick, so grunts stay the
// backbone while tougher/faster types trickle in as a run deepens.
const ENEMY_TYPES = {
  grunt:  { r:16, hpMul:1.0,  spd:1.0,  patterns:['aimed','spread','spiral','ring'], move:'drift', fireMul:1.0, hue:()=>rand(180,320), minWave:1, weight:3 },
  weaver: { r:14, hpMul:0.8,  spd:1.15, patterns:['spread','aimed'],                 move:'weave', fireMul:1.0, hue:()=>rand(150,190), minWave:2, weight:2 },
  darter: { r:12, hpMul:0.45, spd:1.6,  patterns:['aimed'],                          move:'dart',  fireMul:0.7, hue:()=>rand(40,62),  minWave:4, weight:2 },
  brute:  { r:26, hpMul:2.6,  spd:0.55, patterns:['ring','spiral'],                  move:'drift', fireMul:1.3, hue:()=>rand(344,360), minWave:6, weight:1 },
  // marksman telegraphs a laser line at the player, then fires an instant hitscan
  // beam (#46). `telegraph` routes it to the hazard system instead of enemyShoot.
  marksman:{ r:15, hpMul:0.9, spd:0.7,  patterns:['aimed'], move:'drift', fireMul:1, hue:()=>rand(300,318), minWave:4, weight:2, telegraph:true },
};
function pickEnemyType(wave){
  const pool=[];
  for(const [id,d] of Object.entries(ENEMY_TYPES)) if(wave>=d.minWave) for(let i=0;i<d.weight;i++) pool.push(id);
  return pool[Math.floor(Math.random()*pool.length)] || 'grunt';
}

function makeEnemy(hp, wave, boss) {
  const x = rand(60, W-60), y = rand(-140,-40);
  if(boss){
    return { id:game.eid++, x:W/2, y:-100, r:34, hp, maxhp:hp, boss:true, kind:'boss', move:'drift', // enter from top-center (#3)
      vx:rand(-0.6,0.6), vy:rand(0.5,1.1), targetY:130,
      fireCd:rand(30,90), pattern:'spiral', ang:0, wave, hue:350, fireMul:1,
      atkIdx:0, atkIdx2:0, fireCd2:70, phase:1, laserCd:220 };  // two attack-track cursors/timers + phase + laser timer (#3)
  }
  const t = pickEnemyType(wave), d = ENEMY_TYPES[t];
  const HP = Math.max(1, Math.round(hp * d.hpMul));
  return {
    id: game.eid++,
    x, y, r: d.r, hp:HP, maxhp:HP, boss:false, kind:t, move:d.move, fireMul:d.fireMul,
    telegraph: !!d.telegraph,   // carry the type flag onto the instance (marksman laser, #46)
    vx: rand(-0.6,0.6)*d.spd, vy: rand(0.5,1.1)*d.spd,
    targetY: rand(60, H*0.42),
    fireCd: d.telegraph ? rand(80,130) : rand(30,90), // marksman waits longer before its first shot
    pattern: d.patterns[Math.floor(rand(0,d.patterns.length))],
    ang: 0, wave, hue: d.hue(),
  };
}

// ---- shooting ----
// Split-shot fan: shot 0 is dead-on the aim; extras alternate out around it
// (0, +1, -1, +2, -2 …). Keeping a center shot means a single enemy on the aim
// line is always covered, even with an even split. Units are multiples of the fan.
function shotOffset(i){ const k=(i+1)>>1; return i%2===1 ? k : -k; }

function playerShoot(p) {
  const target = pickTarget(p.x,p.y);
  let baseAng = -Math.PI/2;
  if (target) {
    let tx=target.x, ty=target.y;
    if(p.weapon!=='homing'){                 // lead a moving target so far/small enemies still get hit
      // use the enemy's ACTUAL per-tick movement (mvx/mvy), not its static vx/vy
      // fields — while descending it moves straight down, so vx would aim us off.
      const tt = Math.hypot(tx-p.x, ty-p.y)/p.bulletSpeed;
      tx += (target.mvx||0)*tt; ty += (target.mvy||0)*tt;
    }
    baseAng = Math.atan2(ty-p.y, tx-p.x);
  }
  const n = p.shots;
  // homing bolts leave the ship in a WIDE fan and fly straight for a moment before
  // they start tracking — the tight 0.12 combat spread is invisible on same-origin
  // bolts, so homing gets its own spawn fan. They curve back onto the target anyway.
  const homing = p.weapon==='homing';
  const fan = homing ? Math.max(p.spread, 0.28) : p.spread;
  // straight phase (~3.5× player radius, in ticks) so the fan is visible before it converges.
  const homeD = homing ? Math.max(8, Math.round((p.r*3.5)/p.bulletSpeed)) : 0;
  for (let i=0;i<n;i++) {
    const a = baseAng + shotOffset(i)*fan;
    const crit = Math.random() < p.crit;
    game.pBullets.push({ x:p.x, y:p.y, vx:Math.cos(a)*p.bulletSpeed, vy:Math.sin(a)*p.bulletSpeed,
      r:crit?6:4, dmg:p.dmg*(crit?2:1), crit, pierce:p.pierce,
      ttl: p.range ? Math.ceil(p.range/p.bulletSpeed) : 0,
      homing, homeDelay: homeD });
  }
  sfx.shoot();
}

// Lancer beam: auto-aims the nearest enemy and damages EVERY enemy along the ray
// each tick (piercing). An energy gauge throttles it — sustained fire drains the
// energy to empty and forces a recharge lockout, so it can't be held forever.
// (Internally still tracked as `heat` rising to heatMax; the HUD shows the inverse.)
function updateLaser(p){
  const target = pickTarget(p.x,p.y,true);   // laser passes dwell=true for HIGH-HP target stickiness (#49)
  const firing = !!target && !p.depleted;
  if(firing){
    p.heat = Math.min(p.heatMax, p.heat + p.heatRate);
    if(p.heat>=p.heatMax) p.depleted = true;
    const base = Math.atan2(target.y-p.y, target.x-p.x);
    const n=p.shots, spr=p.spread*1.7, width=p.beamWidth, perTick=p.beamDps/60; // Split Shot → angled beams
    const angs=[];
    for(let s=0;s<n;s++){
      const ang = base + shotOffset(s)*spr; angs.push(ang);   // beams fan around target (center beam stays on aim)
      const dx=Math.cos(ang), dy=Math.sin(ang);
      for(const e of game.enemies){               // damage enemies on this ray (death handled in enemy loop)
        const t=(e.x-p.x)*dx + (e.y-p.y)*dy; if(t<0) continue;
        const px=p.x+dx*t, py=p.y+dy*t;
        if(dist2(px,py,e.x,e.y) <= (e.r+width)**2){ e.hp-=perTick; if(Math.random()<0.2) burst(e.x,e.y,190,1,1.4); }
      }
    }
    p.beam = { angs, active:true };
  } else {
    p.beam = { active:false, angs:[] };
    p.heat = Math.max(0, p.heat - p.coolRate);
    if(p.depleted && p.heat<=0) p.depleted = false;
  }
}

// pattern/spdMul/hue overrides let the boss fire two layers at once at different speeds
// AND different colors, so the player can read fast vs slow shots by hue (#3)
function enemyShoot(e, pattern=e.pattern, spdMul=1, hue=e.hue) {
  const p = game.player;
  const aim = Math.atan2(p.y-e.y, p.x-e.x);
  const spd = D.bulletSpeed(game.wave) * (e.boss?1.2:1) * spdMul;
  const push = (a,s=spd) => game.eBullets.push({ x:e.x, y:e.y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, r:5, hue });
  switch(pattern) {
    case 'aimed': {
      push(aim);
      const flank = e.boss ? 2 : D.aimedExtra(game.wave);   // boss fans a wider aimed volley
      for(let i=1;i<=flank;i++){ push(aim - i*0.15); push(aim + i*0.15); }
      break;
    }
    case 'spread': { const k=D.spreadCount(game.wave)+(e.boss?4:0), half=(k-1)/2;
      for(let i=-half;i<=half;i++) push(aim+i*0.18); break; }
    case 'ring': { const k=D.ringCount(game.wave, e.boss); for(let i=0;i<k;i++) push(i/k*TAU); break; }
    case 'spiral': { const arms=e.boss?6:2; for(let a=0;a<arms;a++) push(e.ang + a/arms*TAU); e.ang+=0.4; break; }
  }
}

// Boss runs TWO simultaneous attack tracks at different bullet speeds (#3): a FAST,
// sharp track (aimed/spiral) that snipes, layered over a SLOW, space-filling track
// (rings/spreads) you weave through. Each has its own rotation, cadence and speed.
// FAST_SPD / SLOW_SPD are the easy knobs to play with the speed contrast.
const BOSS_FAST_SEQ=['spiral','aimed','spiral','aimed','spiral'], FAST_SPD=1.0, FAST_HUE=40;  // fast = warm amber
const BOSS_SLOW_SEQ=['ring','spread','ring','spread'],            SLOW_SPD=0.5, SLOW_HUE=200; // slow = cool cyan
const phaseMul = e => e.phase===3 ? 0.6 : e.phase===2 ? 0.8 : 1;   // more relentless each phase
function bossAttackFast(e){
  const pat = BOSS_FAST_SEQ[e.atkIdx % BOSS_FAST_SEQ.length]; e.atkIdx++;
  enemyShoot(e, pat, FAST_SPD, FAST_HUE);
  e.fireCd = Math.max(3, Math.round((pat==='aimed'?13:5) * phaseMul(e))); // wider gaps = ~9% fewer bullets
}
function bossAttackSlow(e){
  const pat = BOSS_SLOW_SEQ[e.atkIdx2 % BOSS_SLOW_SEQ.length]; e.atkIdx2++;
  enemyShoot(e, pat, SLOW_SPD, SLOW_HUE);
  e.fireCd2 = Math.max(6, Math.round((pat==='ring'?57:29) * phaseMul(e))); // wider gaps = ~9% fewer bullets
}
// Boss phase change (#3): wipe the screen's bullets, slam the screen, shift to a more
// menacing tint and restart the attack cycle — a clear "it's getting serious" beat.
function enterBossPhase(e, ph){
  e.phase=ph; e.atkIdx=0; e.fireCd=42;                       // brief regroup into the new phase
  e.hue = ph===2 ? 322 : ph===3 ? 274 : e.hue;
  for(let i=game.eBullets.length-1;i>=0;i--) game.eBullets.splice(i,1); // screen-clear on transition
  burst(e.x,e.y,e.hue,44,6); addShake(16); hitStop(6); sfx.bossKill();
  game.novaFx.push({ x:e.x, y:e.y, r:12, max:280, life:1 });
}
// Boss telegraphed lasers (#3, reusing #46): the boss doesn't freeze — the hazard
// origin follows it. The center beam tracks the player; phase 3 adds fixed flankers
// you must weave between. Beams emanate from the boss and hit on the instant frames.
function bossLaser(e){
  const p=game.player, base=Math.atan2(p.y-e.y, p.x-e.x);
  const n = e.phase>=3 ? 3 : 1;
  for(let i=0;i<n;i++){ const off=(i-(n-1)/2)*0.5;
    telegraphLine(e.x, e.y, base+off, { width:6, tele:100, active:10, dmg:16, owner:e.id, track:(i===0) }); }
  sfx.telegraph();
  e.laserCd = e.phase>=3 ? 150 : 240;
}

function nearestEnemy(x,y,exclude) {
  let best=null, bd=Infinity;
  for (const e of game.enemies){ if(exclude&&exclude.has(e.id)) continue;
    const d=dist2(x,y,e.x,e.y); if(d<bd){bd=d;best=e;} }
  return best;
}

// auto-aim target modes (#35) — the ship's weapon aims at whichever enemy this
// picks. Extensible: add an entry + a case in pickTarget. Cycled with [T].
const AIM_MODES = [ {id:'nearest', label:'NEAREST'}, {id:'highhp', label:'HIGH HP'} ];
const AIM_DWELL = 24;  // frames (~0.4s @60fps) a HIGH-HP laser target is held before re-evaluating (#49)
// choose the target for the current aim mode; ties fall back to nearest.
function pickTarget(x,y,dwell=false){
  if(!game.enemies.length){ game.aimTarget=null; return null; }
  let pick;
  if(AIM_MODES[game.aimIdx].id==='highhp'){
    // dwell timer (#49) — LASER ONLY (dwell flag): the beam drains its own target
    // below a tied enemy each tick, so re-picking highest HP every frame flickers.
    // Hold the target for AIM_DWELL frames (~0.2s) before re-evaluating. Discrete
    // weapons pass no dwell and just track the current highest HP each shot.
    // (A dead/despawned target re-picks immediately — no need to wait out the dwell.)
    const cur=game.aimTarget, alive = cur && cur.hp>0 && game.enemies.indexOf(cur)>=0;
    if(dwell && alive && game.time - game.aimLockTime < AIM_DWELL){ pick=cur; }
    else {
      let best=null, bh=-1, bd=Infinity;
      for(const e of game.enemies){ const d=dist2(x,y,e.x,e.y);
        if(e.hp>bh || (e.hp===bh && d<bd)){ bh=e.hp; bd=d; best=e; } }
      pick=best; if(dwell) game.aimLockTime=game.time;   // (re)start the dwell window
    }
  } else {
    pick = nearestEnemy(x,y);
  }
  game.aimTarget=pick;
  return pick;
}

// ---- game feel (#5) ----
// screen shake: keep the strongest recent impulse; decays each tick in update().
function addShake(m){ game.shake=Math.min(22,Math.max(game.shake,m)); }
// hit-stop: freeze the sim for a few frames on a big impact for extra weight.
function hitStop(frames){ game.hitStop=Math.max(game.hitStop,frames); }

// ---- particles ----
// `dim` scales a particle's opacity (1 = full). Short-range bullet fizzle passes
// game.pBulletAlpha so its puffs match the dimmed player bullets (#29).
function burst(x,y,hue,n=10,sp=3,dim=1){ for(let i=0;i<n;i++){ const a=rand(0,TAU),s=rand(0.5,sp);
  game.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(14,30),hue,dim}); } }
function animateParticles(){ for(let i=game.particles.length-1;i>=0;i--){ const pt=game.particles[i];
  pt.x+=pt.vx;pt.y+=pt.vy;pt.vx*=0.94;pt.vy*=0.94;pt.life--;
  if(pt.life<=0)game.particles.splice(i,1); } }

// ---- flow ----
function reset(cls=game.cls){ game.cls=cls; game.paused=false; game.dying=0; cv.style.cursor='default';
  game.enemies=[];game.pBullets=[];game.eBullets=[];game.particles=[];game.novaFx=[];game.coneFx=[];game.afterimages=[];game.hazards=[];game.upgrades=[];
  game.score=0;game.wave=0;game.player=newPlayer(cls);game.state='playing';startWave(1); }

// active-ability framework: trigger key fires the class's active if a charge is
// available. Charges regen one after another off a single recharge timer (#51) —
// spending from full starts the timer; further spends ride the in-progress one.
function useActive(p){ if(!p||!p.active||p.charges<=0) return;
  const maxCh=p.active.maxCharges||1, wasFull=p.charges===maxCh;
  applyActive(p.active, p); p.charges--;
  if(wasFull) p.activeCd=p.active.cooldown; }
// map an active's `effect` string to its behavior (keeps classes.js import-free)
function applyActive(a, p){
  if(a.effect==='nova') novaBlast(p, a.radius||160, a.dmg||120);
  else if(a.effect==='cone') coneBlast(p, a.range||220, a.angle||1.4, a.dmg||60);
}
// Reaper Scythe (#42): a sector blast aimed at the current target — clears enemy
// bullets and damages enemies inside the wedge (reach + central angle), where Nova
// hits a full ring. `angle` is the full central angle; half of it is the arc each side.
// Scythe cast also empowers the caster (#51): a brief window of i-frames plus a
// short speed dash (with an afterimage trail), so casting is an aggressive reposition.
const SCYTHE_INVULN=45, SCYTHE_BOOST_T=18, SCYTHE_BOOST_MULT=2.0;   // 0.75s i-frames, 0.3s dash @2x
function coneBlast(p, range, angle, dmg){
  const target=pickTarget(p.x,p.y);
  const aim = target ? Math.atan2(target.y-p.y, target.x-p.x) : -Math.PI/2; // default: straight up
  const half=angle/2, hue=(p.cls&&p.cls.hue)||18;
  const inWedge=(x,y,pad=0)=>{ const dx=x-p.x, dy=y-p.y, d=Math.hypot(dx,dy);
    if(d>range+pad) return false; if(d<8) return true;                  // point-blank always caught
    let da=Math.atan2(dy,dx)-aim; da=Math.atan2(Math.sin(da),Math.cos(da)); // wrap to [-PI,PI]
    return Math.abs(da)<=half; };
  for(let i=game.eBullets.length-1;i>=0;i--){ const b=game.eBullets[i];
    if(inWedge(b.x,b.y)){ burst(b.x,b.y,hue,2,1.6); game.eBullets.splice(i,1); } }
  for(const e of game.enemies){ if(inWedge(e.x,e.y,e.r)) e.hp-=dmg; } // death handled in enemy loop
  burst(p.x,p.y,hue,24,5);
  addShake(13); hitStop(5); sfx.nova();   // slight hit-stop for weight without stalling the dash (#51)
  p.iframes=Math.max(p.iframes,SCYTHE_INVULN); p.boostT=SCYTHE_BOOST_T;   // i-frames + dash on cast (#51)
  game.coneFx.push({ x:p.x, y:p.y, aim, half, r:12, max:range, life:1 });
}
// Nova: wipe enemy bullets near the player and damage enemies in the radius.
function novaBlast(p, radius, dmg){
  const r2=radius*radius;
  for(let i=game.eBullets.length-1;i>=0;i--){ const b=game.eBullets[i];
    if(dist2(b.x,b.y,p.x,p.y)<=r2){ burst(b.x,b.y,285,2,1.6); game.eBullets.splice(i,1); } }
  for(const e of game.enemies){ if(dist2(e.x,e.y,p.x,p.y)<=(radius+e.r)**2) e.hp-=dmg; } // death handled in enemy loop
  burst(p.x,p.y,285,32,5);
  addShake(11); hitStop(5); sfx.nova();   // nova lands with a shockwave (#5)
  game.novaFx.push({ x:p.x, y:p.y, r:12, max:radius, life:1 });
}

// central player-damage path (bullets + hazards, #46): honours i-frames, jolts the
// screen, and runs the death hold when HP hits 0. Callers gate on iframes themselves
// where they need to, but this re-checks so it's always safe to call.
function hurtPlayer(dmg, opts={}){
  const p=game.player; if(!p||p.iframes>0) return;
  p.hp-=dmg; p.iframes=p.iframeMax||40; burst(p.x,p.y,DANGER_HUE,20,4);
  addShake(8); if(!opts.noHitStop) hitStop(3);
  if(p.hp<=0){ game.state='dying'; game.dying=55; addShake(20); hitStop(10);
    burst(p.x,p.y,DANGER_HUE,60,7); sfx.death(); recordBest(); }
  else sfx.hurt();
}
// is the player inside a live hazard zone? (line = perpendicular distance to the
// forward ray; circle/rect stubs ready for future telegraph shapes.)
function hazardHitsPlayer(h,p){
  if(h.kind==='line'){
    const dx=Math.cos(h.ang), dy=Math.sin(h.ang), rx=p.x-h.x, ry=p.y-h.y;
    if(rx*dx+ry*dy < 0) return false;               // behind the emitter
    return Math.abs(rx*dy - ry*dx) <= h.width + p.hitR;
  }
  if(h.kind==='circle') return dist2(p.x,p.y,h.x,h.y) <= (h.radius+p.hitR)**2;
  return false;
}
// Marksman/boss laser: mark a beam line at (x,y)→ang, warn for `tele` frames, then
// deal `dmg` for `active` frames (an "instant" shot). Reusable by bosses (#3/#46).
// `owner` ties it to the firing enemy so the shot cancels if that enemy dies.
function telegraphLine(x,y,ang,{width=5,tele=90,active:act=9,dmg=14,hue=0,owner=null,track=false}={}){
  game.hazards.push({ kind:'line', x, y, ang, width, tele, maxTele:tele, active:act, dmg, hue, owner, track, pulse:0, pulsePhase:0 });
}

// abandon the current run and return to the title screen (pause-menu quit, #27).
function quitRun(){ game.paused=false; game.state='title'; game.player=null;
  game.enemies=[];game.pBullets=[];game.eBullets=[];game.particles=[];game.novaFx=[];game.coneFx=[];game.afterimages=[];game.hazards=[]; }

function gainXp(p, amt){
  p.xp+=amt;
  while(p.xp>=p.xpNext){ p.xp-=p.xpNext; p.lvl++; p.xpNext=Math.floor(p.xpNext*1.35+3);
    rollUpgrades(); game.state='upgrade'; sfx.levelUp(); }
}

function pickUpgrade(i){
  const u=game.upgradeChoices[i]; if(!u)return;
  u.apply(game.player); game.upgrades.push(u.id);
  if(game.state==='upgrade'){ game.state='playing'; cv.style.cursor='default'; }
}

addEventListener('keydown', e=>{
  const k=e.key.toLowerCase();
  if(game.paused && k==='q'){ quitRun(); return; } // quit-to-title from pause menu
  if(game.state==='upgrade'){ const n=parseInt(e.key); if(n>=1&&n<=3) pickUpgrade(n-1); }
  if((game.state==='title'||game.state==='dead') && (k===' '||k==='enter')){ game.classIdx=CLASSES.indexOf(game.cls); if(game.classIdx<0)game.classIdx=0; game.classScroll=game.classIdx; game.state='classSelect'; return; }
  if(game.state==='classSelect'){
    if(k==='arrowleft'||k==='a') game.classIdx=clamp(game.classIdx-1,0,CLASSES.length-1);
    else if(k==='arrowright'||k==='d') game.classIdx=clamp(game.classIdx+1,0,CLASSES.length-1);
    else if(k===' '||k==='enter') reset(CLASSES[game.classIdx]);
    else { const n=parseInt(e.key); if(n>=1&&n<=CLASSES.length){ game.classIdx=n-1; reset(CLASSES[n-1]); } }
    return;
  }
  if(game.state==='playing' && !game.paused && k===' ') useActive(game.player);   // not while paused
  if(game.state==='playing' && !game.paused && k==='t') game.aimIdx=(game.aimIdx+1)%AIM_MODES.length; // cycle auto-aim mode (#35)
});
function canvasXY(e){ const rect=cv.getBoundingClientRect();
  return [ (e.clientX-rect.left)*(W/rect.width), (e.clientY-rect.top)*(H/rect.height) ]; }
function classAt(mx,my){ for(let i=0;i<CLASSES.length;i++){ const c=classCardRect(i);
  if(mx>=c.x&&mx<=c.x+c.w&&my>=c.y&&my<=c.y+c.h) return i; } return -1; }
// exact level-up card bounds (must match drawUpgrade's layout) so clicks land
// only on a card, not the gaps between them (#34)
function upgradeAt(mx,my){ for(let i=0;i<game.upgradeChoices.length;i++){
  const y=220+i*150, x=W/2-260; if(mx>=x&&mx<=x+520&&my>=y&&my<=y+120) return i; } return -1; }

// hover highlights the card under the cursor (no scroll — carousel scroll follows
// selection only, so cards don't slide out from under the pointer)
cv.addEventListener('pointermove', e=>{
  const [mx,my]=canvasXY(e);
  if(game.paused){                                   // hover-highlight pause buttons (#36)
    const b=pauseButtons();
    game.pauseHover = inRect(mx,my,b.resume)?'resume':inRect(mx,my,b.quit)?'quit':null;
    cv.style.cursor = game.pauseHover?'pointer':'default'; return;
  }
  if(game.state==='upgrade'){ cv.style.cursor = upgradeAt(mx,my)>=0 ? 'pointer':'default'; return; }
  if(game.state!=='classSelect'){ cv.style.cursor='default'; return; }
  game.hoverIdx=classAt(mx,my);
  const overChevron = (game.classIdx>0 && inRect(mx,my,chevronRect(-1))) ||
                      (game.classIdx<CLASSES.length-1 && inRect(mx,my,chevronRect(1)));
  cv.style.cursor = (game.hoverIdx>=0 || overChevron) ? 'pointer' : 'default';
});
cv.addEventListener('pointerdown', e=>{
  resumeAudio();   // first gesture unlocks WebAudio (#7)
  const [mx,my]=canvasXY(e);
  if(game.paused){                                   // clickable pause menu (#36)
    const b=pauseButtons();
    if(inRect(mx,my,b.resume)) game.paused=false;
    else if(inRect(mx,my,b.quit)) quitRun();
    game.pauseHover=null; cv.style.cursor='default';
    return;
  }
  if(game.state==='title'||game.state==='dead'){ game.classIdx=CLASSES.indexOf(game.cls); if(game.classIdx<0)game.classIdx=0; game.classScroll=game.classIdx; game.state='classSelect'; return; }
  if(game.state==='classSelect'){
    // chevrons page the selection; keeps far-off classes reachable by mouse
    if(game.classIdx>0 && inRect(mx,my,chevronRect(-1))){ game.classIdx--; return; }
    if(game.classIdx<CLASSES.length-1 && inRect(mx,my,chevronRect(1))){ game.classIdx++; return; }
    const i=classAt(mx,my); if(i>=0) reset(CLASSES[i]); // click a card → lock in + launch
    return;
  }
  if(game.state==='upgrade'){
    const idx=upgradeAt(mx,my); if(idx>=0) pickUpgrade(idx);
  }
});

// ---- update ----
function update(){
  game.time++;
  const p = game.player;
  if(!p) return;
  if(p.iframes>0) p.iframes--;
  // recharge the next active charge; on full recharge, roll into the next one so
  // stacks regen one after another (Amumu-Q style) until back at max (#51).
  if(p.active && p.charges < (p.active.maxCharges||1)){
    if(--p.activeCd<=0){
      p.charges++;
      p.activeCd = p.charges < (p.active.maxCharges||1) ? p.active.cooldown : 0;
    }
  }

  // movement
  const focus = keys['shift'];
  let sp = focus? p.focusSpeed : p.speed;
  if(p.boostT>0) sp*=SCYTHE_BOOST_MULT;           // Scythe dash (#51)
  let dx=0,dy=0;
  if(keys['a']||keys['arrowleft'])dx--; if(keys['d']||keys['arrowright'])dx++;
  if(keys['w']||keys['arrowup'])dy--; if(keys['s']||keys['arrowdown'])dy++;
  if(dx&&dy){dx*=0.707;dy*=0.707;}
  p.x=clamp(p.x+dx*sp,p.r,W-p.r); p.y=clamp(p.y+dy*sp,p.r,H-p.r);
  if(p.boostT>0){ p.boostT--;                     // leave a fading afterimage trail while dashing (#51)
    game.afterimages.push({ x:p.x, y:p.y, r:p.r, hue:(p.cls&&p.cls.hue)||18, life:1 }); }
  const hitR = focus? p.hitR : p.hitR+3;

  // fire — laser is a continuous beam, everything else fires discrete bullets
  if(p.weapon==='laser'){ updateLaser(p); }
  else { p.fireCd--; if(p.fireCd<=0 && game.enemies.length){ playerShoot(p); p.fireCd=p.fireRate; } }

  // player bullets
  for(let i=game.pBullets.length-1;i>=0;i--){ const b=game.pBullets[i];
    if(b.homing){
      // fly straight during the delay (initial spread AND the coast after piercing),
      // so bolts keep momentum and shoot THROUGH before curving back
      if(b.homeDelay>0){ b.homeDelay--; }
      else { const t=nearestEnemy(b.x,b.y);                 // nearest — can loop back to a lone enemy (boomerang)
        if(t){ const cur=Math.atan2(b.vy,b.vx), want=Math.atan2(t.y-b.y,t.x-b.x);
          let d=want-cur; while(d>Math.PI)d-=TAU; while(d<-Math.PI)d+=TAU;
          const a=cur+clamp(d,-0.11,0.11), sp=Math.hypot(b.vx,b.vy);
          b.vx=Math.cos(a)*sp; b.vy=Math.sin(a)*sp; } } }
    b.x+=b.vx;b.y+=b.vy;
    if(b.ttl && --b.ttl<=0){ burst(b.x,b.y,190,3,1.4,game.pBulletAlpha); game.pBullets.splice(i,1); continue; } // short-range fizzle — dimmed to match the bullet
    if(b.x<-20||b.x>W+20||b.y<-20||b.y>H+20){game.pBullets.splice(i,1);continue;}
    if(b.hitCd>0){ b.hitCd--; }                             // brief re-hit lockout after a pierce (prevents overlap multi-hits)
    else for(const e of game.enemies){
      if(b.hits && b.hits.has(e.id)) continue;              // straight pierce: hit each enemy once (cleave a line)
      if(dist2(b.x,b.y,e.x,e.y)<(e.r+b.r)**2){
        e.hp-=b.dmg; burst(b.x,b.y,b.crit?45:280,b.crit?10:6,3);   // punchier impact sparks (#5)
        if(b.pierce>0){ b.pierce--;
          if(b.homing){ b.hitCd=14; b.homeDelay=Math.max(b.homeDelay,12); } // punch through, then boomerang back (may re-hit same enemy)
          else { (b.hits||(b.hits=new Set())).add(e.id); } }
        else { game.pBullets.splice(i,1); }
        break;
      }
    }
  }

  // enemies
  for(let i=game.enemies.length-1;i>=0;i--){ const e=game.enemies[i];
    const ox=e.x, oy=e.y;
    if(e.aimCd>0){ e.aimCd--; }                // hold still while telegraphing so the beam stays attached (#46)
    else if(e.y<e.targetY){ e.y+=e.vy; }       // dive-in phase (all types descend to their slot)
    else if(e.move==='dart'){                  // darter: chase the player's x, creep downward, hover low
      const pl=game.player; if(pl) e.x+=clamp((pl.x-e.x)*0.045,-2.8,2.8);
      if(e.y<H*0.72) e.y+=0.5; e.x=clamp(e.x,20,W-20);
    } else if(e.move==='weave'){               // weaver: wide horizontal sweep, gentle bob
      e.x+=e.vx*2.2; e.y+=Math.sin(game.time*0.03+i)*0.6; if(e.x<40||e.x>W-40)e.vx*=-1;
    } else {                                    // drift: original settle-and-strafe (grunt, brute, boss)
      e.x+=e.vx; e.y+=Math.sin(game.time*0.02+i)*0.4; if(e.x<40||e.x>W-40)e.vx*=-1;
    }
    e.mvx=e.x-ox; e.mvy=e.y-oy;   // actual displacement this tick — used for auto-aim leading (#35)
    if(e.boss){ const ph = e.hp>e.maxhp*0.66 ? 1 : e.hp>e.maxhp*0.33 ? 2 : 3; if(ph>e.phase) enterBossPhase(e, ph); // HP-gated phases (#3)
      if(e.phase>=2 && e.y>=e.targetY){ e.laserCd--; if(e.laserCd<=0) bossLaser(e); }      // telegraphed lasers from phase 2
      if(e.y>0){ e.fireCd2--; if(e.fireCd2<=0) bossAttackSlow(e); } }                        // slow track fires from entry, same as the fast track
    e.fireCd--; if(e.fireCd<=0 && e.y>0){
      if(e.telegraph){                                     // marksman: mark a beam line at the player, then instant-fire (#46)
        if(e.y < e.targetY){ e.fireCd = 10; }              // don't aim until fully settled on screen
        else {
          const pl=game.player, ang=Math.atan2(pl.y-e.y, pl.x-e.x);
          const trk = game.wave>=10, teleFrames = trk?120:90; // harder variant winds up ~2s and tracks
          telegraphLine(e.x, e.y, ang, { width:5, tele:teleFrames, active:9, dmg:14, owner:e.id, track:trk });
          e.aimCd = teleFrames + 12;  // frozen through the warning + brief beam so the line stays on the enemy
          sfx.telegraph(); e.fireCd = Math.round(D.fireCooldown(game.wave,false)*3.2); // slow, readable cadence
        }
      } else if(e.boss){ bossAttackFast(e); }                // fast attack track (slow track runs in the boss block above) (#3)
      else { enemyShoot(e); e.fireCd = Math.round(D.fireCooldown(game.wave, e.boss)*(e.fireMul||1)); }
    }
    if(e.hp<=0){ burst(e.x,e.y,e.hue,e.boss?40:16,e.boss?6:4); game.enemies.splice(i,1);
      if(e.boss){ addShake(14); hitStop(8); sfx.bossKill(); game.eBullets.length=0; } else sfx.enemyKill();   // boss death clears the screen of bullets (#3); shake/kill SFX (#5/#7)
      game.score += e.boss?500:50; if(p.leech)p.hp=Math.min(p.maxhp,p.hp+p.leech);
      gainXp(p, e.boss?6:2); }
  }

  // enemy bullets
  for(let i=game.eBullets.length-1;i>=0;i--){ const b=game.eBullets[i];
    b.x+=b.vx;b.y+=b.vy;
    if(b.x<-20||b.x>W+20||b.y<-20||b.y>H+20){game.eBullets.splice(i,1);continue;}
    if(p.iframes<=0 && dist2(b.x,b.y,p.x,p.y)<(hitR+b.r)**2){
      game.eBullets.splice(i,1); hurtPlayer(8);
    }
  }

  // telegraphed hazards (#46): red warning zone during `tele`, then a live danger
  // window for `active` frames. Line hazards = the marksman/boss laser.
  for(let i=game.hazards.length-1;i>=0;i--){ const h=game.hazards[i];
    const owner = h.owner!=null ? game.enemies.find(e=>e.id===h.owner) : null;
    if(h.owner!=null && !owner){ game.hazards.splice(i,1); continue; }   // owner died → cancel shot
    if(owner){ h.x=owner.x; h.y=owner.y; }                               // keep the beam origin glued to the enemy body
    if(h.tele>0){ h.tele--;
      // static for the first ~2/3, then pulse increasingly fast over the last third;
      // a quiet beep fires at each pulse peak (so the beeping accelerates too).
      const frac=(h.maxTele-h.tele)/h.maxTele;
      if(h.track && frac<2/3) h.ang=Math.atan2(p.y-h.y, p.x-h.x); // higher waves: follow the player, then lock at 2/3
      if(frac>=2/3){ const u=(frac-2/3)/(1/3), f=3+u*10, prev=h.pulsePhase;   // 3Hz → 13Hz
        h.pulsePhase=prev+(2*Math.PI*f)/60; h.pulse=(1-Math.cos(h.pulsePhase))/2;
        if(Math.floor(h.pulsePhase/Math.PI)>Math.floor(prev/Math.PI) && Math.floor(h.pulsePhase/Math.PI)%2===1) sfx.teleBeep();
      } else h.pulse=0;
      if(h.tele===0){ sfx.laserFire(); } // fires as the warning ends — no shake/jolt on fire
    }
    else if(h.active>0){ h.active--;
      if(p.iframes<=0 && hazardHitsPlayer(h,p)) hurtPlayer(h.dmg, {noHitStop:true}); // no hit stop on beam hit
    } else game.hazards.splice(i,1);
  }

  // particles + nova rings
  animateParticles();
  for(let i=game.novaFx.length-1;i>=0;i--){ const f=game.novaFx[i];
    f.r+=(f.max-f.r)*0.25; f.life-=0.05; if(f.life<=0) game.novaFx.splice(i,1); }
  for(let i=game.coneFx.length-1;i>=0;i--){ const f=game.coneFx[i];
    f.r+=(f.max-f.r)*0.25; f.life-=0.05; if(f.life<=0) game.coneFx.splice(i,1); }
  for(let i=game.afterimages.length-1;i>=0;i--){ const a=game.afterimages[i];   // dash trail (#51)
    a.life-=0.08; if(a.life<=0) game.afterimages.splice(i,1); }

  // wave clear
  if(game.enemies.length===0 && game.state==='playing'){ startWave(game.wave+1); game.score+=100; }

  // hud
  document.getElementById('h-wave').textContent=game.wave;
  document.getElementById('h-lvl').textContent=p.lvl;
  document.getElementById('h-score').textContent=game.score;
}

// ---- render ----
// the player ship hull (also reused for dash afterimages, #51). Builds the path only —
// caller sets style then fills.
function shipPath(x,y,r){ ctx.beginPath();
  ctx.moveTo(x,y-r); ctx.lineTo(x-r*0.8,y+r*0.7); ctx.lineTo(x,y+r*0.3); ctx.lineTo(x+r*0.8,y+r*0.7); ctx.closePath(); }
function draw(){
  syncBottomHud();   // keep the DOM HUD strip below the canvas in sync (#41)
  ctx.clearRect(0,0,W,H);
  // starfield backdrop
  ctx.fillStyle='#06060b'; ctx.fillRect(0,0,W,H);
  ctx.globalAlpha=0.5;
  for(let i=0;i<40;i++){ const y=((i*97 + game.time*(1+i%3))%H); ctx.fillStyle=i%3?'#191933':'#12122a';
    ctx.fillRect((i*53)%W, y, 2, 2); }
  ctx.globalAlpha=1;

  if(game.state==='title'){ center('VOIDWAKE', 54, '#e8e8f0', H/2-40);
    center('a roguelike bullet hell', 18, '#8a5cff', H/2+6);
    center('press SPACE / click to choose a vessel', 15, '#7a7a98', H/2+50);
    if(best.wave>0) center('best run: wave '+best.wave+' - score '+best.score, 13, '#6a6a88', H/2+82);
    frameFooter(); return; }

  if(game.state==='classSelect'){ drawClassSelect(); return; }

  // screen shake: offset the whole world layer (menus/overlays stay put) (#5)
  ctx.save();
  if(game.shake>0){ const s=game.shake; ctx.translate(rand(-s,s), rand(-s,s)); }

  // particles
  for(const pt of game.particles){ ctx.globalAlpha=clamp(pt.life/24,0,1)*(pt.dim??1);
    ctx.fillStyle=`hsl(${pt.hue},90%,65%)`; ctx.fillRect(pt.x-1.5,pt.y-1.5,3,3); }
  ctx.globalAlpha=1;

  // player bullets — dimmed (see game.pBulletAlpha) so enemy fire reads clearly
  ctx.globalAlpha=game.pBulletAlpha;
  for(const b of game.pBullets){ ctx.fillStyle=b.crit?'#ffd24d':'#7cf7ff';
    ctx.shadowBlur=8; ctx.shadowColor=ctx.fillStyle;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.fill(); }
  ctx.shadowBlur=0; ctx.globalAlpha=1;

  // enemies
  // telegraphed hazards (#46) — drawn under enemies: pulsing red warning line during
  // the wind-up, then a bright white/red beam on the instant-fire frames.
  const HZLEN=Math.hypot(W,H);
  for(const h of game.hazards){ if(h.kind!=='line') continue;
    const ex=h.x+Math.cos(h.ang)*HZLEN, ey=h.y+Math.sin(h.ang)*HZLEN;
    if(h.tele>0){
      const a=0.30+(h.pulse||0)*0.55;   // static ~0.30, ramps toward ~0.85 at pulse peaks near the end
      ctx.globalAlpha=a; ctx.strokeStyle='hsl(0,90%,55%)'; ctx.lineWidth=h.width;
      ctx.beginPath();ctx.moveTo(h.x,h.y);ctx.lineTo(ex,ey);ctx.stroke();
      ctx.globalAlpha=Math.min(1,a+0.2); ctx.strokeStyle='hsl(0,95%,74%)'; ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(h.x,h.y);ctx.lineTo(ex,ey);ctx.stroke();
    } else if(h.active>0){
      // layered strokes instead of shadowBlur — a full-screen blurred line is very
      // expensive and hitched with several beams at once (#46 perf).
      ctx.globalAlpha=0.35; ctx.strokeStyle='hsl(0,90%,55%)'; ctx.lineWidth=h.width*2.4;
      ctx.beginPath();ctx.moveTo(h.x,h.y);ctx.lineTo(ex,ey);ctx.stroke();
      ctx.globalAlpha=1; ctx.strokeStyle='#fff'; ctx.lineWidth=h.width;
      ctx.beginPath();ctx.moveTo(h.x,h.y);ctx.lineTo(ex,ey);ctx.stroke();
    }
  }
  ctx.globalAlpha=1; ctx.shadowBlur=0;

  for(const e of game.enemies){ const c=`hsl(${e.hue},70%,${e.boss?60:55}%)`;
    ctx.fillStyle=c; ctx.strokeStyle='#000'; ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,TAU);ctx.fill();ctx.stroke();
    // per-body hp bar (bosses use the big top-of-screen bar instead, #3)
    if(!e.boss){ const w=e.r*2; ctx.fillStyle='#000'; ctx.fillRect(e.x-w/2,e.y-e.r-8,w,3);
      ctx.fillStyle=c; ctx.fillRect(e.x-w/2,e.y-e.r-8,w*clamp(e.hp/e.maxhp,0,1),3); } }

  // enemy bullets
  for(const b of game.eBullets){ ctx.fillStyle=`hsl(${b.hue},95%,68%)`;
    ctx.shadowBlur=6; ctx.shadowColor=ctx.fillStyle;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.fill(); }
  ctx.shadowBlur=0;

  // nova rings
  for(const f of game.novaFx){ ctx.globalAlpha=clamp(f.life,0,1)*0.7;
    ctx.strokeStyle='hsl(285,90%,72%)'; ctx.lineWidth=4; ctx.shadowBlur=14; ctx.shadowColor='hsl(285,90%,70%)';
    ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,TAU); ctx.stroke(); }
  ctx.globalAlpha=1; ctx.shadowBlur=0;

  // Scythe wedges — a filled sector that expands + fades in the blast direction (#42)
  for(const f of game.coneFx){ ctx.globalAlpha=clamp(f.life,0,1)*0.5;
    ctx.fillStyle='hsl(18,90%,58%)'; ctx.strokeStyle='hsl(18,95%,68%)'; ctx.lineWidth=3;
    ctx.shadowBlur=14; ctx.shadowColor='hsl(18,90%,62%)';
    ctx.beginPath(); ctx.moveTo(f.x,f.y); ctx.arc(f.x,f.y,f.r,f.aim-f.half,f.aim+f.half); ctx.closePath();
    ctx.fill(); ctx.stroke(); }
  ctx.globalAlpha=1; ctx.shadowBlur=0;

  // laser beam (drawn under the ship)
  const pl=game.player;
  if(pl && pl.weapon==='laser' && pl.beam && pl.beam.active){
    const len=Math.hypot(W,H), glowW=pl.beamWidth*1.4, coreW=Math.max(2, pl.beamWidth*0.5); // thickens with Wide Lens
    // #47 perf: NO per-beam shadowBlur — a full-diagonal blurred stroke per beam
    // hitched hard with several Split Shot beams. The wide glow underlay already
    // reads as a glow, so we layer plain strokes (like the marksman beam, #46).
    // Batched into two passes (all glows, then all cores) so style/alpha is set
    // once instead of per beam. Opacity capped below a bullet's (#48).
    ctx.save(); ctx.lineCap='round';
    ctx.strokeStyle=`hsl(${pl.cls.hue},90%,62%)`; ctx.lineWidth=glowW; ctx.globalAlpha=game.beamAlpha*0.6;
    for(const ang of pl.beam.angs){
      ctx.beginPath(); ctx.moveTo(pl.x,pl.y); ctx.lineTo(pl.x+Math.cos(ang)*len, pl.y+Math.sin(ang)*len); ctx.stroke();
    }
    ctx.strokeStyle='#eaffff'; ctx.lineWidth=coreW; ctx.globalAlpha=game.beamAlpha;
    for(const ang of pl.beam.angs){
      ctx.beginPath(); ctx.moveTo(pl.x,pl.y); ctx.lineTo(pl.x+Math.cos(ang)*len, pl.y+Math.sin(ang)*len); ctx.stroke();
    }
    ctx.restore();
  }

  // dash afterimages under the ship — fading ghost hulls in the class hue (#51).
  // brighter + glowing so the dash trail reads clearly.
  for(const a of game.afterimages){ const l=clamp(a.life,0,1);
    ctx.fillStyle=`hsl(${a.hue},90%,66%)`; ctx.shadowBlur=12; ctx.shadowColor=`hsl(${a.hue},90%,66%)`;
    ctx.globalAlpha=l*0.8; shipPath(a.x,a.y,a.r*(0.7+0.3*l)); ctx.fill(); }
  ctx.globalAlpha=1; ctx.shadowBlur=0;

  // player (hidden during the death hold so the explosion stands alone) (#40)
  const p=game.player;
  if(p && game.state!=='dying'){
    const pc=`hsl(${(p.cls&&p.cls.hue)||265},70%,62%)`;
    const inv=p.iframes>0;
    // i-frames used to hard-blink the ship on/off, which was hard to track (#51).
    // Instead keep it solidly visible with a gentle shimmer + a pulsing shield ring.
    ctx.globalAlpha = inv ? 0.78+0.18*Math.sin(game.time*0.5) : 1;
    ctx.fillStyle=pc; ctx.shadowBlur=14; ctx.shadowColor=pc;
    shipPath(p.x,p.y,p.r); ctx.fill();
    ctx.shadowBlur=0; ctx.globalAlpha=1;
    if(inv){ ctx.strokeStyle=pc; ctx.globalAlpha=0.35+0.2*Math.sin(game.time*0.5);
      ctx.lineWidth=2; ctx.beginPath(); ctx.arc(p.x,p.y,p.r+5,0,TAU); ctx.stroke(); ctx.globalAlpha=1; }
    // hitbox dot when focusing
    if(keys['shift']){ ctx.fillStyle='#fff'; ctx.beginPath();ctx.arc(p.x,p.y,p.hitR,0,TAU);ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.3)';ctx.beginPath();ctx.arc(p.x,p.y,p.r+6,0,TAU);ctx.stroke(); }
    // XP strip stays on the top edge (thin, doesn't block the field); HP + active/heat
    // now live in the DOM strip below the canvas (see syncBottomHud, #41)
    if(game.state==='playing'||game.state==='upgrade') drawXpBar(p);
  }

  ctx.restore();   // end screen-shake transform (#5)

  // auto-aim mode indicator (#35) — drawn outside the shake so it stays legible
  if((game.state==='playing'||game.state==='upgrade') && game.player){
    ctx.textAlign='right'; ctx.font='11px ui-monospace,monospace'; ctx.fillStyle='#7a7a98';
    ctx.fillText('[T] AIM: '+AIM_MODES[game.aimIdx].label, W-14, 20);
    if(isMuted()){ ctx.fillStyle='#565879'; ctx.fillText('[M] MUTED', W-14, 36); }   // audio muted (#7)
    ctx.textAlign='left';
    drawBossBar();
  }

  if(game.state==='upgrade') drawUpgrade();
  if(game.state==='dead'){ ctx.fillStyle='rgba(6,6,11,.78)'; ctx.fillRect(0,0,W,H);
    center('YOU DIED', 52, '#ff4d6d', H/2-140);
    center('reached wave '+game.wave+'  ·  score '+game.score, 18, '#e8e8f0', H/2-86);
    center('best run: wave '+best.wave+' - score '+best.score, 14, '#8a8aa6', H/2-58);
    // run summary: every boon taken this run, same panel as the pause menu (#44)
    const bw=Math.min(460,W*0.72);
    drawRunBoons(W/2-bw/2, H/2-30, bw);
    center('press SPACE / click to try again', 15, '#7a7a98', H-48); }

  if(game.paused){ ctx.fillStyle='rgba(6,6,11,.72)';ctx.fillRect(0,0,W,H);
    const lx=Math.max(40,W*0.10);
    ctx.textAlign='left'; ctx.fillStyle='#e8e8f0'; ctx.font='bold 40px ui-monospace,monospace';
    ctx.fillText('PAUSED', lx, Math.max(72,H*0.16));                        // title top-left
    const b=pauseButtons();
    drawButton(b.resume,'▶  Resume', game.pauseHover==='resume');           // left column
    drawButton(b.quit,'✕  Quit to title', game.pauseHover==='quit');
    // right column: STATS panel on top, UPGRADES THIS RUN panel below it
    const panelW=Math.min(360,Math.max(260,W*0.34));
    const rx=W-panelW-Math.max(40,W*0.08), ry=b.resume.y;
    const statsBottom=drawPauseStats(rx, ry, panelW);
    drawRunBoons(rx, statsBottom+14, panelW); }
}

// shared bordered panel backdrop for the pause-menu panels
function panelBox(x,y,w,h){
  ctx.fillStyle='rgba(18,18,42,0.55)'; roundRect(x,y,w,h,10); ctx.fill();
  ctx.strokeStyle='#2a2a48'; ctx.lineWidth=1.5; roundRect(x,y,w,h,10); ctx.stroke();
}

// player stat readout — right column of the pause menu; returns its bottom Y
function drawPauseStats(x,y,w){
  const p=game.player; if(!p) return y;
  const laser=p.weapon==='laser';
  const rows=[
    ['DMG',        laser ? p.beamDps+' dps' : Math.round(p.dmg)],
    ['Fire rate',  laser ? 'beam' : (60/p.fireRate).toFixed(1)+'/s'],
    ['Bullet spd', laser ? 'hitscan' : p.bulletSpeed.toFixed(1)],
    ['Move spd',   p.speed.toFixed(1)],
    ['Shots',      p.shots],
    ['Pierce',     p.pierce],
    ['Crit',       Math.round(p.crit*100)+'%'],
  ];
  const lh=20, panelH=52+rows.length*lh;
  panelBox(x,y,w,panelH);
  ctx.textAlign='left'; ctx.font='bold 12px ui-monospace,monospace'; ctx.fillStyle='#8a5cff';
  ctx.fillText('STATS', x+18, y+28);
  let yy=y+52; ctx.font='12px ui-monospace,monospace';
  for(const [k,v] of rows){
    ctx.textAlign='left';  ctx.fillStyle='#8a8aa6'; ctx.fillText(k, x+18, yy);
    ctx.textAlign='right'; ctx.fillStyle='#e8e8f0'; ctx.fillText(String(v), x+w-18, yy);
    yy+=lh;
  }
  ctx.textAlign='left';
  return y+panelH;
}

// clickable pause-menu buttons (#36) — left column, hit-tested in the pointer handlers too
function pauseButtons(){ const w=230,h=46, x=Math.max(40,W*0.10), y0=Math.max(120,H*0.30);
  return { resume:{x,y:y0,w,h}, quit:{x,y:y0+60,w,h} }; }
function drawButton(r,label,hover){
  ctx.fillStyle=hover?'#1e1e3a':'#12122a'; roundRect(r.x,r.y,r.w,r.h,8); ctx.fill();
  ctx.strokeStyle=hover?'#8a5cff':'#3a3a5c'; ctx.lineWidth=2; roundRect(r.x,r.y,r.w,r.h,8); ctx.stroke();
  ctx.textAlign='left'; ctx.fillStyle='#e8e8f0'; ctx.font='bold 16px ui-monospace,monospace';
  ctx.fillText(label, r.x+18, r.y+r.h/2+6);
}

// pause-menu build readout (#31/#36): boons picked up this run, stacked "Name ×N",
// in a bordered panel below the STATS panel in the RIGHT column of the pause screen.
function drawRunBoons(px,py,panelW){
  const p=game.player; if(!p) return;
  const counts=new Map();
  for(const id of game.upgrades) counts.set(id,(counts.get(id)||0)+1);
  const entries=[...counts.entries()].map(([id,c])=>({ name:UP_NAME[id]||id, c }));
  const cols = entries.length>18 ? 3 : entries.length>9 ? 2 : 1, perCol=Math.max(1,Math.ceil(entries.length/cols));
  const lh=22, panelH = 54 + (entries.length?perCol:1)*lh;
  panelBox(px,py,panelW,panelH);
  ctx.textAlign='left'; ctx.font='bold 12px ui-monospace,monospace'; ctx.fillStyle='#8a5cff';
  ctx.fillText('UPGRADES THIS RUN', px+18, py+28);
  if(!entries.length){ ctx.fillStyle='#565879'; ctx.font='13px ui-monospace,monospace';
    ctx.fillText('none yet', px+18, py+54); return; }
  ctx.font='13px ui-monospace,monospace'; ctx.fillStyle='#c8c8e0';
  const colW=(panelW-36)/cols;
  entries.forEach((en,i)=>{ const col=Math.floor(i/perCol), row=i%perCol;
    ctx.fillText(en.name+(en.c>1?'  ×'+en.c:''), px+18+col*colW, py+54+row*lh); });
}

// Thin XP progress strip along the very top edge — fills left→right toward the
// next level, resets on level-up (#38). Unobtrusive; the LVL count lives in the HUD.
// Boss health bar as 3 stacked bars (#3): each phase drains one full bar of a lighter
// red, revealing the next background beneath it. Phase 1 dark-red over red, phase 2
// red over light-red, phase 3 light-red over black; when the 3rd empties, the boss dies.
function drawBossBar(){
  const boss=game.enemies.find(e=>e.boss); if(!boss) return;
  const bw=Math.min(560,W*0.6), bh=12, bx=(W-bw)/2, by=30;
  const f=clamp(boss.hp/boss.maxhp,0,1);
  const DARK='hsl(0,85%,30%)', RED='hsl(0,88%,48%)', LIGHT='hsl(0,80%,70%)', BLACK='#06060b';
  let bg, fill, stack;
  if(f>2/3){ bg=RED;   fill=DARK;  stack=(f-2/3)/(1/3); }   // stack 1 draining
  else if(f>1/3){ bg=LIGHT; fill=RED;   stack=(f-1/3)/(1/3); }   // stack 2 draining
  else { bg=BLACK; fill=LIGHT; stack=f/(1/3); }            // stack 3 → death at empty
  ctx.fillStyle=bg;   ctx.fillRect(bx,by,bw,bh);
  ctx.fillStyle=fill; ctx.fillRect(bx,by,bw*clamp(stack,0,1),bh);
  ctx.strokeStyle='#3a3a5c'; ctx.lineWidth=1.5; ctx.strokeRect(bx,by,bw,bh);
  ctx.textAlign='left'; ctx.font='bold 11px ui-monospace,monospace'; ctx.fillStyle='#e8e8f0';
  ctx.fillText('BOSS', bx, by-5);
  ctx.textAlign='right'; ctx.fillStyle='#8a8aa6'; ctx.fillText('PHASE '+boss.phase+'/3', bx+bw, by-5);
  ctx.textAlign='left';
}
function drawXpBar(p){
  const frac=clamp(p.xp/p.xpNext,0,1);
  ctx.fillStyle='#181830'; ctx.fillRect(0,0,W,4);
  ctx.fillStyle='hsl(258,100%,70%)'; ctx.fillRect(0,0,W*frac,4);
}

// Sync the DOM HUD strip below the canvas (HP + active/heat), so these bars live
// OUTSIDE the playfield and never obscure the bottom while dodging (#41).
const HUD2 = {
  root:   document.getElementById('hud2'),
  hpfill: document.getElementById('hpfill'),
  hptext: document.getElementById('hptext'),
  statlbl:document.getElementById('statlbl'),
  statbar:document.getElementById('statbar'),
  statfill:document.getElementById('statfill'),
  statseg:document.getElementById('statseg'),
};
function syncBottomHud(){
  const p=game.player;
  const show = p && (game.state==='playing'||game.state==='upgrade'||game.state==='dying');
  HUD2.root.style.visibility = show ? 'visible' : 'hidden';
  if(!show) return;
  const frac=clamp(p.hp/p.maxhp,0,1);
  HUD2.hpfill.style.width=(frac*100)+'%';
  HUD2.hpfill.style.background=`hsl(${frac*120},72%,48%)`;
  HUD2.hptext.textContent=Math.max(0,Math.ceil(p.hp))+' / '+p.maxhp;
  HUD2.statseg.style.display='none';              // only the multi-charge bar shows segment dividers
  if(p.active){                                   // active-ability charges/cooldown (#39, #51)
    const maxCh=p.active.maxCharges||1, cd=p.active.cooldown||1;
    HUD2.statbar.style.visibility='visible';
    if(maxCh>1){                                  // one continuous energy bar split into maxCh segments (#51)
      // total charge = full charges + the fraction of the one currently recharging.
      const partial=p.charges>=maxCh?0:(1-p.activeCd/cd);
      const totalFrac=clamp((p.charges+partial)/maxCh,0,1);
      HUD2.statlbl.textContent='[SPACE] '+p.active.name;
      HUD2.statlbl.style.color=p.charges>0?'#7cf7ff':'#8a8aa6';
      HUD2.statfill.style.width=(totalFrac*100)+'%';
      // full charges are bright; the still-recharging partial segment stays dim so
      // it's clear it isn't ready yet (#51). Boundary is where the full charges end.
      const bright='#7cf7ff', dim='#3d6d78';
      const b = totalFrac>0 ? clamp((p.charges/maxCh)/totalFrac,0,1)*100 : 0;
      HUD2.statfill.style.background=`linear-gradient(90deg, ${bright} 0, ${bright} ${b}%, ${dim} ${b}%, ${dim} 100%)`;
      HUD2.statseg.style.display='block';         // dark divider lines at each segment boundary
      const segs=[]; for(let i=1;i<maxCh;i++){ const pc=i/maxCh*100;
        segs.push(`linear-gradient(90deg,transparent calc(${pc}% - 1px),#0c0c18 calc(${pc}% - 1px),#0c0c18 calc(${pc}% + 1px),transparent calc(${pc}% + 1px))`); }
      HUD2.statseg.style.backgroundImage=segs.join(',');
    } else {                                      // single-charge active: ready / countdown
      const ready=p.activeCd<=0, prog=clamp(1-p.activeCd/cd,0,1);
      HUD2.statlbl.textContent='[SPACE] '+p.active.name+(ready?' READY':' '+Math.ceil(p.activeCd/60)+'s');
      HUD2.statlbl.style.color=ready?'#7cf7ff':'#8a8aa6';
      HUD2.statfill.style.width=(prog*100)+'%';
      HUD2.statfill.style.background=ready?'#7cf7ff':'#4a6fa0';
    }
  } else if(p.weapon==='laser'){                   // Lancer energy bar (#50)
    // energy = the inverse of internal heat: full when idle, DRAINS as you fire,
    // refills when you stop; empty (heat maxed) = the depleted lockout. Label is a
    // fixed string so the bar never shifts when the state flips (#50 point 1).
    const energy=clamp(1 - p.heat/p.heatMax,0,1);
    HUD2.statlbl.textContent='ENERGY';
    HUD2.statlbl.style.color=p.depleted?'#ff4d6d':'#8a8aa6';
    HUD2.statbar.style.visibility='visible';
    HUD2.statfill.style.width=(energy*100)+'%';
    // green (full) → red (empty); solid red during the empty lockout.
    HUD2.statfill.style.background=p.depleted?'#ff4d6d':`hsl(${energy*120},85%,55%)`;
  } else {                                         // no status bar for plain-bullet classes
    HUD2.statlbl.textContent=''; HUD2.statbar.style.visibility='hidden';
  }
}

function drawUpgrade(){
  ctx.fillStyle='rgba(6,6,11,.82)'; ctx.fillRect(0,0,W,H);
  center('LEVEL UP', 40, '#8a5cff', 150);
  center('choose a boon  (1 / 2 / 3 or click)', 14, '#7a7a98', 190);
  game.upgradeChoices.forEach((u,i)=>{
    const y=220+i*150, x=W/2-260, w=520, h=120;
    // class-exclusive boons get a class-tinted, glowing card + a badge
    const exHue = u.tag ? (CLASSES.find(c=>c.name.toUpperCase()===u.tag)?.hue ?? 45) : null;
    const accent = exHue!=null ? `hsl(${exHue},85%,64%)` : '#8a5cff';
    ctx.fillStyle = exHue!=null ? `hsl(${exHue},42%,13%)` : '#14142a';
    if(exHue!=null){ ctx.save(); ctx.shadowBlur=18; ctx.shadowColor=accent; }
    roundRect(x,y,w,h,10); ctx.fill();
    if(exHue!=null) ctx.restore();
    ctx.strokeStyle=accent; ctx.lineWidth=exHue!=null?3:2; roundRect(x,y,w,h,10); ctx.stroke();
    ctx.textAlign='left';
    ctx.fillStyle=accent; ctx.font='bold 22px ui-monospace,monospace';
    ctx.fillText((i+1)+'. '+u.name, x+24, y+48);   // tighter number↔name gap (single space)
    ctx.fillStyle='#c8c8e0'; ctx.font='16px ui-monospace,monospace';
    // dynamic desc (e.g. Aegis shows live invuln duration); flush-left with the name
    ctx.fillText(u.descFn?u.descFn(game.player):u.desc, x+24, y+82);
    if(u.tag){
      const label=u.tag+' EXCLUSIVE'; ctx.font='bold 11px ui-monospace,monospace';
      const bw=ctx.measureText(label).width+20, bx=x+w-bw-16, by=y+14, bh=20;
      ctx.fillStyle=accent; roundRect(bx,by,bw,bh,10); ctx.fill();
      ctx.fillStyle='#0a0a12'; ctx.textAlign='center'; ctx.fillText(label, bx+bw/2, by+14); ctx.textAlign='left';
    }
  });
  ctx.textAlign='left';
}

// ---- class select ----
// Carousel: fixed-width cards; the selected index sits centered, others flank it.
// `classScroll` eases toward `classIdx` (in drawClassSelect) for a smooth slide.
const CARD_W=350, CARD_GAP=22, CARD_H=340;
function classCardRect(i){
  return { x: W/2 - CARD_W/2 + (i - game.classScroll)*(CARD_W+CARD_GAP), y:H/2-170, w:CARD_W, h:CARD_H };
}
function chevronRect(dir){ const w=36,h=90; return dir<0 ? {x:10,y:H/2-h/2,w,h} : {x:W-10-w,y:H/2-h/2,w,h}; }
function inRect(mx,my,r){ return mx>=r.x&&mx<=r.x+r.w&&my>=r.y&&my<=r.y+r.h; }
function drawClassSelect(){
  ctx.fillStyle='#06060b'; ctx.fillRect(0,0,W,H);
  // ease the carousel toward the selected card
  game.classScroll += (game.classIdx - game.classScroll)*0.2;
  if(Math.abs(game.classIdx-game.classScroll)<0.002) game.classScroll=game.classIdx;
  center('CHOOSE YOUR VESSEL', 34, '#8a5cff', 120);
  center('← → / chevrons to browse  ·  click a vessel to launch', 14, '#7a7a98', 158);
  CLASSES.forEach((cls,i)=>{
    const r=classCardRect(i), sel=i===game.classIdx, hue=cls.hue;
    if(r.x>W || r.x+r.w<0) return;              // cull off-screen cards
    const hov = i===game.hoverIdx && !sel;
    if(sel){
      ctx.save();
      ctx.shadowBlur=30; ctx.shadowColor=`hsl(${hue},85%,62%)`;      // strong outer glow
      ctx.fillStyle=`hsl(${hue},48%,17%)`;                            // bright tinted fill
      roundRect(r.x,r.y,r.w,r.h,12); ctx.fill();
      ctx.restore();
      ctx.strokeStyle=`hsl(${hue},92%,70%)`; ctx.lineWidth=4;         // bright thick border
      roundRect(r.x,r.y,r.w,r.h,12); ctx.stroke();
    } else {
      ctx.fillStyle = hov ? '#16162e' : '#0d0d1c';                    // brighten on hover
      roundRect(r.x,r.y,r.w,r.h,12); ctx.fill();
      ctx.strokeStyle = hov ? `hsl(${hue},60%,55%)` : `hsl(${hue},38%,40%)`; ctx.lineWidth = hov?2.5:1.5;
      roundRect(r.x,r.y,r.w,r.h,12); ctx.stroke();
    }
    // ship glyph
    const cx=r.x+r.w/2, cy=r.y+62;
    ctx.fillStyle=`hsl(${hue},70%,62%)`; ctx.shadowBlur=sel?18:6; ctx.shadowColor=ctx.fillStyle;
    ctx.beginPath(); ctx.moveTo(cx,cy-16); ctx.lineTo(cx-13,cy+12); ctx.lineTo(cx,cy+5); ctx.lineTo(cx+13,cy+12); ctx.closePath(); ctx.fill();
    ctx.shadowBlur=0;
    // name — centered within THIS card (not the screen)
    ctx.textAlign='center'; ctx.fillStyle='#e8e8f0'; ctx.font='bold 20px ui-monospace,monospace';
    ctx.fillText((i+1)+'. '+cls.name, cx, r.y+108);
    // description — LEFT-aligned inside the card padding
    wrapText(cls.desc, r.x+18, r.y+134, r.w-36, 16, '#b4b4d0', 12);
    // stats — horizontal bar charts; fixed rows, aligned across all cards
    const padL=r.x+16, labelW=104, valW=54, barX=padL+labelW, barW=r.w-16*2-labelW-valW, barH=8;
    let sy=r.y+168;
    for(const b of classStatBars(cls)){
      ctx.textAlign='left'; ctx.font='11px ui-monospace,monospace';
      ctx.fillStyle='#8a8aa6'; ctx.fillText(b.label, padL, sy+8);
      ctx.fillStyle='#26264a'; ctx.fillRect(barX, sy+1, barW, barH);                 // track
      ctx.fillStyle=`hsl(${hue},70%,58%)`; ctx.fillRect(barX, sy+1, barW*b.frac, barH); // fill
      ctx.textAlign='right'; ctx.fillStyle='#c8c8e0'; ctx.font='10px ui-monospace,monospace';
      ctx.fillText(b.display, r.x+r.w-14, sy+8);
      sy+=20;
    }
    // active ability (non-numeric) as a text line under the bars
    ctx.textAlign='left'; ctx.font='11px ui-monospace,monospace';
    ctx.fillStyle='#8a8aa6'; ctx.fillText('ACTIVE', padL, sy+8);
    ctx.textAlign='right'; ctx.fillStyle='#c8c8e0'; ctx.fillText(classActiveLabel(cls), r.x+r.w-14, sy+8);
    ctx.textAlign='left';
  });
  // chevrons + position dots (only meaningful with more than one class)
  drawChevron(-1, game.classIdx>0);
  drawChevron(1, game.classIdx<CLASSES.length-1);
  const dn=CLASSES.length, dgap=16, dy=H/2+192, dx0=W/2-(dn-1)*dgap/2;
  for(let i=0;i<dn;i++){ ctx.beginPath(); ctx.arc(dx0+i*dgap, dy, i===game.classIdx?4:2.5, 0, TAU);
    ctx.fillStyle = i===game.classIdx?'#e8e8f0':'#44465f'; ctx.fill(); }
  frameFooter();
}
function drawChevron(dir, active){
  const r=chevronRect(dir), cx=r.x+r.w/2, cy=r.y+r.h/2, s=12;
  ctx.strokeStyle = active?'#c8c8e0':'#242440'; ctx.lineWidth=4; ctx.lineCap='round';
  ctx.beginPath();
  if(dir<0){ ctx.moveTo(cx+s*0.5,cy-s); ctx.lineTo(cx-s*0.5,cy); ctx.lineTo(cx+s*0.5,cy+s); }
  else     { ctx.moveTo(cx-s*0.5,cy-s); ctx.lineTo(cx+s*0.5,cy); ctx.lineTo(cx-s*0.5,cy+s); }
  ctx.stroke(); ctx.lineCap='butt';
}
// left-aligned word wrap; x is the left edge.
function wrapText(text,x,y,maxw,lineH,color,size){
  ctx.fillStyle=color; ctx.font=size+'px ui-monospace,monospace'; ctx.textAlign='left';
  const words=text.split(' '); let line='', yy=y;
  for(const w of words){ const test=line?line+' '+w:w;
    if(ctx.measureText(test).width>maxw && line){ ctx.fillText(line,x,yy); line=w; yy+=lineH; }
    else line=test; }
  if(line) ctx.fillText(line,x,yy);
}

function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function center(t,size,color,y){ ctx.textAlign='center'; ctx.fillStyle=color;
  ctx.font=`bold ${size}px ui-monospace,monospace`; ctx.fillText(t,W/2,y); ctx.textAlign='left'; }
function frameFooter(){ center('v0.2', 12, '#3a3a55', H-24); }

// ---- loop ----
// Fixed timestep: sim runs at a constant 60 ticks/sec regardless of the display's
// refresh rate, so the game feels identical on 60/120/144/240Hz panels. (Before this,
// update() ran once per rAF frame with per-frame constants → 2-4x too fast on high-Hz
// displays, and a speed spike whenever the tab/pause backlog fast-forwarded.)
const STEP = 1000/60;   // ms per simulation tick — all tuning constants are per-tick
const MAX_STEPS = 5;    // cap catch-up per frame; prevents post-pause/tab-switch spikes
let acc = 0, last = performance.now();
function tick(){
  if(game.paused) return;
  // decay screen shake in EVERY state (incl. dying/dead) with a fast falloff, so it
  // settles quickly and the game-over screen isn't left jittering (#5/#40)
  if(game.shake>0.3) game.shake*=0.72; else game.shake=0;
  if(game.hitStop>0){ game.hitStop--; return; }   // freeze the whole sim for a few frames (#5)
  if(game.state==='playing') update();
  else if(game.state==='upgrade') animateParticles(); // frozen sim, particles still settle
  else if(game.state==='dying'){ animateParticles(); if(--game.dying<=0) game.state='dead'; } // hold, then game over (#40)
}
function loop(now){
  let frame = now - last; last = now;
  if(frame > 250) frame = STEP;   // tab was hidden / long stall → resume, don't fast-forward
  acc += frame;
  let steps = 0;
  while(acc >= STEP && steps < MAX_STEPS){ tick(); acc -= STEP; steps++; }
  if(steps === MAX_STEPS) acc = 0; // drop leftover backlog instead of spiraling
  // drive the Lancer beam sound every frame (not just in update) so it cuts out on
  // pause / death / upgrade — states where the sim, and updateLaser, don't run (#43)
  const p=game.player;
  const beamOn = !game.paused && game.state==='playing' && p && p.weapon==='laser' && p.beam && p.beam.active;
  sfx.laser(beamOn, p && p.depleted);
  draw();
  requestAnimationFrame(loop);
}
addEventListener('resize', resize); resize();
requestAnimationFrame(loop);
