// update.ts — the per-tick simulation step: player movement/fire, projectile and
// enemy updates, boss phases, hazards, pickups/particles, wave clears, and the HUD
// sync. The single place the game world advances one fixed timestep.
import { TAU, clamp, dist2 } from './util.js';
import { W, H } from './canvas.js';
import { game } from './state.js';
import { keys } from './input.js';
import { sfx } from './audio.js';
import { burst, addShake, hitStop, animateParticles } from './effects.js';
import { nearestEnemy } from './targeting.js';
import { playerShoot, updateLaser, enemyShoot, bossAttackFast, bossAttackSlow, enterBossPhase, bossLaser } from './weapons.js';
import { hurtPlayer, hazardHitsPlayer, telegraphLine } from './combat.js';
import { startWave } from './entities.js';
import { gainXp } from './flow.js';
import { SCYTHE_BOOST_MULT } from './abilities.js';
import * as D from './difficulty.js';

// ---- update ----
export function update(){
  game.time++;
  const p = game.player;
  if(!p) return;
  // Time-stop (#25): while active, the enemy world is frozen (movement, firing,
  // enemy bullets and hazards all pause below) — the player still moves and shoots.
  const frozen = game.timeStop>0;
  if(frozen && --game.timeStop<=0){ game.timeStopMax=0; sfx.timeResume(); }
  if(p.iframes>0) p.iframes--;
  // sound cue on the invuln window opening/closing (#51)
  const isInv=p.iframes>0;
  if(isInv && !p._invPrev) sfx.invulnStart();
  else if(!isInv && p._invPrev) sfx.invulnEnd();
  p._invPrev=isInv;
  // recharge the next active charge; on full recharge, roll into the next one so
  // stacks regen one after another (Amumu-Q style) until back at max (#51).
  if(p.active && p.charges < (p.active.maxCharges||1)){
    if(--p.activeCd<=0){
      const maxCh=p.active.maxCharges||1;
      p.charges++;
      const full=p.charges>=maxCh;
      full ? sfx.chargeFull() : sfx.chargeRefill();   // subtle per-charge tick, fuller cue when fully recharged (#54)
      p.activeCd = full ? 0 : p.active.cooldown;
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
    if(!frozen){                               // Time-stop (#25): enemies neither move nor fire while frozen
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
          const ang=Math.atan2(p.y-e.y, p.x-e.x);
          const trk = game.wave>=10, teleFrames = trk?120:90; // harder variant winds up ~2s and tracks
          telegraphLine(e.x, e.y, ang, { width:5, tele:teleFrames, active:9, dmg:14, owner:e.id, track:trk });
          e.aimCd = teleFrames + 12;  // frozen through the warning + brief beam so the line stays on the enemy
          sfx.telegraph(); e.fireCd = Math.round(D.fireCooldown(game.wave,false)*3.2); // slow, readable cadence
        }
      } else if(e.boss){ bossAttackFast(e); }                // fast attack track (slow track runs in the boss block above) (#3)
      else { enemyShoot(e); e.fireCd = Math.round(D.fireCooldown(game.wave, e.boss)*(e.fireMul||1)); }
    }
    } else { e.mvx=0; e.mvy=0; }   // frozen: no displacement, so auto-aim leading doesn't chase a still target
    // death still resolves while frozen — the player can freely damage/kill enemies during the stop
    if(e.hp<=0){ burst(e.x,e.y,e.hue,e.boss?40:16,e.boss?6:4); game.enemies.splice(i,1);
      if(e.boss){ addShake(14); hitStop(8); sfx.bossKill(); game.eBullets.length=0; } else sfx.enemyKill();   // boss death clears the screen of bullets (#3); shake/kill SFX (#5/#7)
      game.score += e.boss?500:50; if(p.leech)p.hp=Math.min(p.maxhp,p.hp+p.leech);
      gainXp(p, e.boss?6:2); }
  }

  // enemy bullets — frozen bullets hang inert in the air (no travel, no collision)
  // during Time-stop (#25), so the stop is a safe reposition window.
  for(let i=game.eBullets.length-1;i>=0;i--){ const b=game.eBullets[i];
    if(frozen) continue;
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
    if(frozen) continue;                                                 // Time-stop (#25): telegraphs/beams pause too
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
  document.getElementById('h-wave')!.textContent=String(game.wave);
  document.getElementById('h-lvl')!.textContent=String(p.lvl);
  document.getElementById('h-score')!.textContent=String(game.score);
}
