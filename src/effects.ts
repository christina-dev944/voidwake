// effects.ts — game-feel: screen shake, hit-stop, and particle bursts (#5).
// Small, self-contained helpers that mutate the shared game state; the sim and
// renderer read game.shake / game.hitStop / game.particles.
import { TAU, rand } from './util.js';
import { game } from './state.js';

// screen shake: keep the strongest recent impulse; decays each tick in update().
export function addShake(m){ game.shake=Math.min(22,Math.max(game.shake,m)); }
// hit-stop: freeze the sim for a few frames on a big impact for extra weight.
export function hitStop(frames){ game.hitStop=Math.max(game.hitStop,frames); }

// `dim` scales a particle's opacity (1 = full). Short-range bullet fizzle passes
// game.pBulletAlpha so its puffs match the dimmed player bullets (#29).
export function burst(x,y,hue,n=10,sp=3,dim=1){ for(let i=0;i<n;i++){ const a=rand(0,TAU),s=rand(0.5,sp);
  game.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(14,30),hue,dim}); } }
export function animateParticles(){ for(let i=game.particles.length-1;i>=0;i--){ const pt=game.particles[i];
  pt.x+=pt.vx;pt.y+=pt.vy;pt.vx*=0.94;pt.vy*=0.94;pt.life--;
  if(pt.life<=0)game.particles.splice(i,1); } }
