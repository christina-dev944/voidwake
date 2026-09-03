// targeting.ts — auto-aim target selection (#35/#49). Picks which enemy the ship's
// weapon aims at based on the current aim mode; the sim and HUD read game.aimTarget.
import { dist2 } from './util.js';
import { game } from './state.js';
import type { Enemy, AimModeId } from './types.js';

export function nearestEnemy(x: number,y: number,exclude?: Set<number>|null): Enemy|null {
  let best: Enemy|null=null, bd=Infinity;
  for (const e of game.enemies){ if(exclude&&exclude.has(e.id)) continue;
    const d=dist2(x,y,e.x,e.y); if(d<bd){bd=d;best=e;} }
  return best;
}

// auto-aim target modes (#35) — the ship's weapon aims at whichever enemy this
// picks. Extensible: add an entry + a case in pickTarget. Cycled with [T].
export const AIM_MODES: { id: AimModeId; label: string }[] = [ {id:'nearest', label:'NEAREST'}, {id:'highhp', label:'HIGH HP'}, {id:'manual', label:'MANUAL'} ];
// MANUAL aim (#11): fire toward the mouse cursor instead of auto-targeting. Auto-aim
// stays the default (index 0); [T] cycles into this like any other mode.
export function manualAim(): boolean { return AIM_MODES[game.aimIdx].id === 'manual'; }
const AIM_DWELL = 24;  // frames (~0.4s @60fps) a HIGH-HP laser target is held before re-evaluating (#49)
// choose the target for the current aim mode; ties fall back to nearest.
export function pickTarget(x: number,y: number,dwell=false): Enemy|null {
  if(!game.enemies.length){ game.aimTarget=null; return null; }
  let pick: Enemy|null;
  if(AIM_MODES[game.aimIdx].id==='highhp'){
    // dwell timer (#49) — LASER ONLY (dwell flag): the beam drains its own target
    // below a tied enemy each tick, so re-picking highest HP every frame flickers.
    // Hold the target for AIM_DWELL frames (~0.2s) before re-evaluating. Discrete
    // weapons pass no dwell and just track the current highest HP each shot.
    // (A dead/despawned target re-picks immediately — no need to wait out the dwell.)
    const cur=game.aimTarget, alive = cur && cur.hp>0 && game.enemies.indexOf(cur)>=0;
    if(dwell && alive && game.time - game.aimLockTime < AIM_DWELL){ pick=cur; }
    else {
      let best: Enemy|null=null, bh=-1, bd=Infinity;
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
