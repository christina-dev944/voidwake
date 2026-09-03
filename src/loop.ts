// loop.ts — the fixed-timestep game heartbeat. Runs the sim at a constant 60 ticks/sec
// independent of display refresh, drives the beam sound, and renders each frame.
// Importing this module starts the loop.
import { game } from './state.js';
import { sfx } from './audio.js';
import { animateParticles } from './effects.js';
import { update } from './update.js';
import { draw } from './render.js';

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
requestAnimationFrame(loop);
