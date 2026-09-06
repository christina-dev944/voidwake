// effects.ts — game-feel: screen shake, hit-stop, and particle bursts (#5).
// Small, self-contained helpers that mutate the shared game state; the sim and
// renderer read game.shake / game.hitStop / game.particles.
import { TAU, rand } from './util.js';
import { game } from './state.js';

// screen shake: keep the strongest recent impulse; decays each tick in update().
export function addShake(m: number){ game.shake=Math.min(22,Math.max(game.shake,m)); }
// hit-stop: freeze the sim for a few frames on a big impact for extra weight.
export function hitStop(frames: number){ game.hitStop=Math.max(game.hitStop,frames); }

// `dim` scales a particle's opacity (1 = full). Short-range bullet fizzle passes
// game.pBulletAlpha so its puffs match the dimmed player bullets (#29).
export function burst(x: number,y: number,hue: number,n=10,sp=3,dim=1){ for(let i=0;i<n;i++){ const a=rand(0,TAU),s=rand(0.5,sp);
  // varied speed/size/lifetime per grain so a burst reads as debris, not a uniform puff;
  // faster grains fly further, and `max` lets the renderer fade+shrink over the full life.
  const life=rand(16,34), size=rand(1.3,3.2)+s*0.35, hj=hue+rand(-12,12);
  game.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life,max:life,size,hue:hj,dim}); } }
export function animateParticles(){ for(let i=game.particles.length-1;i>=0;i--){ const pt=game.particles[i];
  pt.x+=pt.vx;pt.y+=pt.vy;pt.vx*=0.92;pt.vy*=0.92;pt.life--;
  if(pt.life<=0)game.particles.splice(i,1); } }
