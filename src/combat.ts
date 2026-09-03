// combat.ts — shared low-level combat primitives used by weapons, abilities, and the
// sim: dealing damage to the player, hazard hit-tests, and telegraphed laser lines.
// Kept separate so both weapons.ts and abilities.ts can depend on it without a cycle.
import { dist2, DANGER_HUE } from './util.js';
import { game, recordBest } from './state.js';
import { addShake, hitStop, burst } from './effects.js';
import { sfx } from './audio.js';

// central player-damage path (bullets + hazards, #46): honours i-frames, jolts the
// screen, and runs the death hold when HP hits 0. Callers gate on iframes themselves
// where they need to, but this re-checks so it's always safe to call.
export function hurtPlayer(dmg, opts:{noHitStop?:boolean}={}){
  const p=game.player; if(!p||p.iframes>0) return;
  p.hp-=dmg; p.iframes=p.iframeMax||40; burst(p.x,p.y,DANGER_HUE,20,4);
  addShake(8); if(!opts.noHitStop) hitStop(3);
  if(p.hp<=0){ game.state='dying'; game.dying=55; addShake(20); hitStop(10);
    burst(p.x,p.y,DANGER_HUE,60,7); sfx.death(); recordBest(); }
  else sfx.hurt();
}
// is the player inside a live hazard zone? (line = perpendicular distance to the
// forward ray; circle/rect stubs ready for future telegraph shapes.)
export function hazardHitsPlayer(h,p){
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
export function telegraphLine(x,y,ang,{width=5,tele=90,active:act=9,dmg=14,hue=0,owner=null,track=false}={}){
  game.hazards.push({ kind:'line', x, y, ang, width, tele, maxTele:tele, active:act, dmg, hue, owner, track, pulse:0, pulsePhase:0 });
}
