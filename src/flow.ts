// flow.ts — run lifecycle and progression: starting/quitting a run, gaining XP and
// leveling into an upgrade choice, and applying the picked upgrade.
import { game } from './state.js';
import { cv } from './canvas.js';
import { newPlayer, startWave, rollUpgrades } from './entities.js';
import { sfx } from './audio.js';
import type { Player, ClassDef } from './types.js';

export function reset(cls: ClassDef=game.cls){ game.cls=cls; game.paused=false; game.dying=0; cv.style.cursor='default';
  game.enemies=[];game.pBullets=[];game.eBullets=[];game.particles=[];game.novaFx=[];game.coneFx=[];game.afterimages=[];game.hazards=[];game.upgrades=[];
  game.upgradeChoices=[];game.pendingLevelUps=0;game.timeStop=0;game.timeStopMax=0;game.skylance=null;
  game.score=0;game.wave=0;game.player=newPlayer(cls);game.state='playing';startWave(1); }

// abandon the current run and return to the title screen (pause-menu quit, #27).
export function quitRun(){ game.paused=false; game.state='title'; game.player=null;
  game.enemies=[];game.pBullets=[];game.eBullets=[];game.particles=[];game.novaFx=[];game.coneFx=[];game.afterimages=[];game.hazards=[];
  game.upgradeChoices=[];game.pendingLevelUps=0;game.timeStop=0;game.timeStopMax=0;game.skylance=null; }

export function gainXp(p: Player, amt: number){
  p.xp+=amt;
  while(p.xp>=p.xpNext){ p.xp-=p.xpNext; p.lvl++; p.xpNext=Math.floor(p.xpNext*1.35+3);
    // non-blocking level-up (#26): the sim keeps running. The first level shows an
    // offer; any further levels queue behind it and roll one at a time as picks land.
    if(game.upgradeChoices.length===0) rollUpgrades(); else game.pendingLevelUps++;
    sfx.levelUp(); }
}

export function pickUpgrade(i: number){
  const u=game.upgradeChoices[i]; if(!u || !game.player)return;
  u.apply(game.player); game.upgrades.push(u.id);
  // consume this offer; roll the next queued set if any, else close the panel (#26)
  if(game.pendingLevelUps>0){ game.pendingLevelUps--; rollUpgrades(); }
  else game.upgradeChoices=[];
}
