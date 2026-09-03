// weapons.ts — all firing logic: the player's bullet/homing shots, the Lancer beam,
// generic enemy fire patterns, and the boss's dual attack tracks + telegraphed
// lasers. Reads/writes game.pBullets / game.eBullets; the sim calls these each tick.
import { TAU, dist2 } from './util.js';
import { game } from './state.js';
import { sfx } from './audio.js';
import { addShake, hitStop, burst } from './effects.js';
import { pickTarget } from './targeting.js';
import { telegraphLine } from './combat.js';
import * as D from './difficulty.js';
import type { Player, Enemy } from './types.js';

// Split-shot fan: shot 0 is dead-on the aim; extras alternate out around it
// (0, +1, -1, +2, -2 …). Keeping a center shot means a single enemy on the aim
// line is always covered, even with an even split. Units are multiples of the fan.
function shotOffset(i: number){ const k=(i+1)>>1; return i%2===1 ? k : -k; }

export function playerShoot(p: Player) {
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
export function updateLaser(p: Player){
  const target = pickTarget(p.x,p.y,true);   // laser passes dwell=true for HIGH-HP target stickiness (#49)
  const firing = !!target && !p.depleted;
  if(firing){
    p.heat = Math.min(p.heatMax, p.heat + p.heatRate);
    if(p.heat>=p.heatMax) p.depleted = true;
    const base = Math.atan2(target.y-p.y, target.x-p.x);
    const n=p.shots, spr=p.spread*1.7, width=p.beamWidth, perTick=p.beamDps/60; // Split Shot → angled beams
    const angs: number[]=[];
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
export function enemyShoot(e: Enemy, pattern: string=e.pattern, spdMul=1, hue: number=e.hue) {
  const p = game.player;
  const aim = Math.atan2(p.y-e.y, p.x-e.x);
  const spd = D.bulletSpeed(game.wave) * (e.boss?1.0:1) * spdMul;   // boss bullets no longer get a speed premium (#55): was 1.2, now same as normal enemies
  const push = (a: number,s=spd) => game.eBullets.push({ x:e.x, y:e.y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, r:5, hue });
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
const phaseMul = (e: Enemy) => e.phase===3 ? 0.6 : e.phase===2 ? 0.8 : 1;   // more relentless each phase
export function bossAttackFast(e: Enemy){
  const pat = BOSS_FAST_SEQ[e.atkIdx % BOSS_FAST_SEQ.length]; e.atkIdx++;
  enemyShoot(e, pat, FAST_SPD, FAST_HUE);
  e.fireCd = Math.max(3, Math.round((pat==='aimed'?13:5) * phaseMul(e))); // wider gaps = ~9% fewer bullets
}
export function bossAttackSlow(e: Enemy){
  const pat = BOSS_SLOW_SEQ[e.atkIdx2 % BOSS_SLOW_SEQ.length]; e.atkIdx2++;
  enemyShoot(e, pat, SLOW_SPD, SLOW_HUE);
  e.fireCd2 = Math.max(6, Math.round((pat==='ring'?57:29) * phaseMul(e))); // wider gaps = ~9% fewer bullets
}
// Boss phase change (#3): wipe the screen's bullets, slam the screen, shift to a more
// menacing tint and restart the attack cycle — a clear "it's getting serious" beat.
export function enterBossPhase(e: Enemy, ph: number){
  e.phase=ph; e.atkIdx=0; e.fireCd=42;                       // brief regroup into the new phase
  e.hue = ph===2 ? 322 : ph===3 ? 274 : e.hue;
  for(let i=game.eBullets.length-1;i>=0;i--) game.eBullets.splice(i,1); // screen-clear on transition
  burst(e.x,e.y,e.hue,44,6); addShake(16); hitStop(6); sfx.bossKill();
  game.novaFx.push({ x:e.x, y:e.y, r:12, max:280, life:1 });
}
// Boss telegraphed lasers (#3, reusing #46): the boss doesn't freeze — the hazard
// origin follows it. The center beam tracks the player; phase 3 adds fixed flankers
// you must weave between. Beams emanate from the boss and hit on the instant frames.
export function bossLaser(e: Enemy){
  const p=game.player, base=Math.atan2(p.y-e.y, p.x-e.x);
  const n = e.phase>=3 ? 3 : 1;
  for(let i=0;i<n;i++){ const off=(i-(n-1)/2)*0.5;
    telegraphLine(e.x, e.y, base+off, { width:6, tele:100, active:10, dmg:16, owner:e.id, track:(i===0) }); }
  sfx.telegraph();
  e.laserCd = e.phase>=3 ? 150 : 240;
}
