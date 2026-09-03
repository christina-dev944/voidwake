// flow.ts — run lifecycle and progression: starting/quitting a run, gaining XP and
// leveling into an upgrade choice, and applying the picked upgrade.
import { game } from './state.js';
import { cv } from './canvas.js';
import { newPlayer, startWave, rollUpgrades } from './entities.js';
import { sfx } from './audio.js';

export function reset(cls=game.cls){ game.cls=cls; game.paused=false; game.dying=0; cv.style.cursor='default';
  game.enemies=[];game.pBullets=[];game.eBullets=[];game.particles=[];game.novaFx=[];game.coneFx=[];game.afterimages=[];game.hazards=[];game.upgrades=[];
  game.score=0;game.wave=0;game.player=newPlayer(cls);game.state='playing';startWave(1); }

// abandon the current run and return to the title screen (pause-menu quit, #27).
export function quitRun(){ game.paused=false; game.state='title'; game.player=null;
  game.enemies=[];game.pBullets=[];game.eBullets=[];game.particles=[];game.novaFx=[];game.coneFx=[];game.afterimages=[];game.hazards=[]; }

export function gainXp(p, amt){
  p.xp+=amt;
  while(p.xp>=p.xpNext){ p.xp-=p.xpNext; p.lvl++; p.xpNext=Math.floor(p.xpNext*1.35+3);
    rollUpgrades(); game.state='upgrade'; sfx.levelUp(); }
}

export function pickUpgrade(i){
  const u=game.upgradeChoices[i]; if(!u)return;
  u.apply(game.player); game.upgrades.push(u.id);
  if(game.state==='upgrade'){ game.state='playing'; cv.style.cursor='default'; }
}
