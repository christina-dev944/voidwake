// abilities.ts — active abilities: the charge/cooldown framework and the two blast
// shapes it maps to (Nova ring, Reaper Scythe cone). Kept import-free of classes.js
// by mapping an active's `effect` string to behavior here.
import { dist2 } from './util.js';
import { game } from './state.js';
import { sfx } from './audio.js';
import { addShake, hitStop, burst } from './effects.js';
import { pickTarget, manualAim } from './targeting.js';
import type { Player, ActiveDef } from './types.js';

// active-ability framework: trigger key fires the class's active if a charge is
// available. Charges regen one after another off a single recharge timer (#51) —
// spending from full starts the timer; further spends ride the in-progress one.
export function useActive(p: Player|null){ if(!p||!p.active||p.charges<=0) return;
  const maxCh=p.active.maxCharges||1, wasFull=p.charges===maxCh;
  applyActive(p.active, p); p.charges--;
  if(wasFull) p.activeCd=p.active.cooldown; }
// map an active's `effect` string to its behavior (keeps classes.js import-free)
function applyActive(a: ActiveDef, p: Player){
  if(a.effect==='nova') novaBlast(p, a.radius||160, a.dmg||120);
  else if(a.effect==='cone') coneBlast(p, a.range||220, a.angle||1.4, a.dmg||60);
  else if(a.effect==='timestop') timeStop(p, a.duration||150);
  else if(a.effect==='skylance') skylanceCast(p);
}
// Lancer Skylance (#60): begin a short wind-up; the beam turns on in update.ts when
// `charge` reaches 0 and stays on for SKY_ACTIVE ticks (~0.6s), dealing damage per tick
// to everything in the vertical column above the player (like the normal laser), rather
// than one instant hit. Can't be aimed — the up direction is fixed; it tracks the
// player's live x, so hold under a target to land the full damage.
// TOTAL damage = SKY_SECONDS of the player's beam DPS (scales with Beam Amplifier),
// spread evenly across the on-duration — i.e. Skylance is worth 10s of normal beam
// (600 at base beamDps 60). The lane is a bit thicker than the beam and SCALES with
// beam width (Wide Lens, #60).
const SKY_CHARGE=26, SKY_SECONDS=10, SKY_ACTIVE=36;
function skylanceCast(p: Player){
  const total=p.beamDps*SKY_SECONDS;
  // lane scales with beam width but GENTLY (#60 feedback: Wide Lens widened it too much).
  // Base ≈49 at beamWidth 6; each +6 Wide Lens adds only ~9px (was ~48px).
  const width=Math.round(40 + p.beamWidth*1.5);
  game.skylance={ charge:SKY_CHARGE, maxCharge:SKY_CHARGE, active:0, activeMax:SKY_ACTIVE,
    perTick: total/SKY_ACTIVE, width };
  addShake(4); sfx.skylanceCharge();   // the beam turns on (with its held SFX) in update.ts on release
}
// Time-stop (#25): halt the enemy world for `dur` ticks — enemies, their bullets and
// telegraphed hazards all freeze (handled in update.ts) while the player keeps moving
// and firing. A pure utility effect: no damage, it buys breathing room and a free window
// to line up hits. The frozen field is tinted in render.ts.
// SHELVED as a class active (felt out of place on the Vanguard) — kept fully wired for
// reuse as a CONSUMABLE later (shop/drops, #63/#15). Trigger it by calling applyActive
// with an effect:'timestop' def, or call timeStop() directly from the consumable code.
export function timeStop(_p: Player, dur: number){
  game.timeStop=dur; game.timeStopMax=dur;
  addShake(6); sfx.timeStop();   // the full-screen freeze tint (render.ts) is the visual
}
// Reaper Scythe (#42): a sector blast aimed at the current target — clears enemy
// bullets and damages enemies inside the wedge (reach + central angle), where Nova
// hits a full ring. `angle` is the full central angle; half of it is the arc each side.
// Scythe cast also empowers the caster (#51): a brief window of i-frames plus a
// short speed dash (with an afterimage trail), so casting is an aggressive reposition.
const SCYTHE_INVULN=45, SCYTHE_BOOST_T=18;
export const SCYTHE_BOOST_MULT=2.0;   // 0.75s i-frames, 0.3s dash @2x (dash mult read by the sim)
function coneBlast(p: Player, range: number, angle: number, dmg: number){
  const manual = manualAim();
  const target = manual ? null : pickTarget(p.x,p.y);
  // MANUAL (#11): the Scythe carves toward the cursor; auto: toward the target, else up.
  const aim = manual ? Math.atan2(game.mouseY-p.y, game.mouseX-p.x)
            : target ? Math.atan2(target.y-p.y, target.x-p.x) : -Math.PI/2;
  const half=angle/2, hue=(p.cls&&p.cls.hue)||18;
  const inWedge=(x: number,y: number,pad=0)=>{ const dx=x-p.x, dy=y-p.y, d=Math.hypot(dx,dy);
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
function novaBlast(p: Player, radius: number, dmg: number){
  const r2=radius*radius;
  for(let i=game.eBullets.length-1;i>=0;i--){ const b=game.eBullets[i];
    if(dist2(b.x,b.y,p.x,p.y)<=r2){ burst(b.x,b.y,285,2,1.6); game.eBullets.splice(i,1); } }
  for(const e of game.enemies){ if(dist2(e.x,e.y,p.x,p.y)<=(radius+e.r)**2) e.hp-=dmg; } // death handled in enemy loop
  burst(p.x,p.y,285,32,5);
  addShake(11); hitStop(5); sfx.nova();   // nova lands with a shockwave (#5)
  game.novaFx.push({ x:p.x, y:p.y, r:12, max:radius, life:1 });
}
