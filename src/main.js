import { TAU, rand, clamp, dist2, DANGER_HUE } from './util.js';
import { UPGRADES } from './upgrades.js';
import { CLASSES, classStatBars, classActiveLabel } from './classes.js';
import * as D from './difficulty.js';
import { sfx, resumeAudio, toggleMute, isMuted } from './audio.js';
import { game, best, recordBest, UP_NAME } from './state.js';
import { cv, ctx, W, H } from './canvas.js';
import { addShake, hitStop, burst, animateParticles } from './effects.js';
import { nearestEnemy, pickTarget, AIM_MODES } from './targeting.js';
import { newPlayer, rollUpgrades, startWave } from './entities.js';
import { hurtPlayer, hazardHitsPlayer, telegraphLine } from './combat.js';
import { playerShoot, updateLaser, enemyShoot, bossAttackFast, bossAttackSlow, enterBossPhase, bossLaser } from './weapons.js';
import { useActive, SCYTHE_BOOST_MULT } from './abilities.js';
import { draw, classCardRect, chevronRect, inRect, pauseButtons } from './render.js';
import { keys } from './input.js';
import { reset, quitRun, gainXp, pickUpgrade } from './flow.js';

// ---- input ----
addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  resumeAudio();   // first gesture unlocks WebAudio (#7)
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault();
  const k0=e.key.toLowerCase();
  if ((k0==='p'||k0==='escape') && (game.state==='playing'||game.paused)) game.paused = !game.paused;
  if (k0==='m') toggleMute();   // mute toggle (#7)
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });




addEventListener('keydown', e=>{
  const k=e.key.toLowerCase();
  if(game.paused && k==='q'){ quitRun(); return; } // quit-to-title from pause menu
  if(game.state==='upgrade'){ const n=parseInt(e.key); if(n>=1&&n<=3) pickUpgrade(n-1); }
  if((game.state==='title'||game.state==='dead') && (k===' '||k==='enter')){ game.classIdx=CLASSES.indexOf(game.cls); if(game.classIdx<0)game.classIdx=0; game.classScroll=game.classIdx; game.state='classSelect'; return; }
  if(game.state==='classSelect'){
    if(k==='arrowleft'||k==='a') game.classIdx=clamp(game.classIdx-1,0,CLASSES.length-1);
    else if(k==='arrowright'||k==='d') game.classIdx=clamp(game.classIdx+1,0,CLASSES.length-1);
    else if(k===' '||k==='enter') reset(CLASSES[game.classIdx]);
    else { const n=parseInt(e.key); if(n>=1&&n<=CLASSES.length){ game.classIdx=n-1; reset(CLASSES[n-1]); } }
    return;
  }
  if(game.state==='playing' && !game.paused && k===' ') useActive(game.player);   // not while paused
  if(game.state==='playing' && !game.paused && k==='t') game.aimIdx=(game.aimIdx+1)%AIM_MODES.length; // cycle auto-aim mode (#35)
});
function canvasXY(e){ const rect=cv.getBoundingClientRect();
  return [ (e.clientX-rect.left)*(W/rect.width), (e.clientY-rect.top)*(H/rect.height) ]; }
function classAt(mx,my){ for(let i=0;i<CLASSES.length;i++){ const c=classCardRect(i);
  if(mx>=c.x&&mx<=c.x+c.w&&my>=c.y&&my<=c.y+c.h) return i; } return -1; }
// exact level-up card bounds (must match drawUpgrade's layout) so clicks land
// only on a card, not the gaps between them (#34)
function upgradeAt(mx,my){ for(let i=0;i<game.upgradeChoices.length;i++){
  const y=220+i*150, x=W/2-260; if(mx>=x&&mx<=x+520&&my>=y&&my<=y+120) return i; } return -1; }

// hover highlights the card under the cursor (no scroll — carousel scroll follows
// selection only, so cards don't slide out from under the pointer)
cv.addEventListener('pointermove', e=>{
  const [mx,my]=canvasXY(e);
  if(game.paused){                                   // hover-highlight pause buttons (#36)
    const b=pauseButtons();
    game.pauseHover = inRect(mx,my,b.resume)?'resume':inRect(mx,my,b.quit)?'quit':null;
    cv.style.cursor = game.pauseHover?'pointer':'default'; return;
  }
  if(game.state==='upgrade'){ cv.style.cursor = upgradeAt(mx,my)>=0 ? 'pointer':'default'; return; }
  if(game.state!=='classSelect'){ cv.style.cursor='default'; return; }
  game.hoverIdx=classAt(mx,my);
  const overChevron = (game.classIdx>0 && inRect(mx,my,chevronRect(-1))) ||
                      (game.classIdx<CLASSES.length-1 && inRect(mx,my,chevronRect(1)));
  cv.style.cursor = (game.hoverIdx>=0 || overChevron) ? 'pointer' : 'default';
});
cv.addEventListener('pointerdown', e=>{
  resumeAudio();   // first gesture unlocks WebAudio (#7)
  const [mx,my]=canvasXY(e);
  if(game.paused){                                   // clickable pause menu (#36)
    const b=pauseButtons();
    if(inRect(mx,my,b.resume)) game.paused=false;
    else if(inRect(mx,my,b.quit)) quitRun();
    game.pauseHover=null; cv.style.cursor='default';
    return;
  }
  if(game.state==='title'||game.state==='dead'){ game.classIdx=CLASSES.indexOf(game.cls); if(game.classIdx<0)game.classIdx=0; game.classScroll=game.classIdx; game.state='classSelect'; return; }
  if(game.state==='classSelect'){
    // chevrons page the selection; keeps far-off classes reachable by mouse
    if(game.classIdx>0 && inRect(mx,my,chevronRect(-1))){ game.classIdx--; return; }
    if(game.classIdx<CLASSES.length-1 && inRect(mx,my,chevronRect(1))){ game.classIdx++; return; }
    const i=classAt(mx,my); if(i>=0) reset(CLASSES[i]); // click a card → lock in + launch
    return;
  }
  if(game.state==='upgrade'){
    const idx=upgradeAt(mx,my); if(idx>=0) pickUpgrade(idx);
  }
});

// ---- update ----
function update(){
  game.time++;
  const p = game.player;
  if(!p) return;
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
          const pl=game.player, ang=Math.atan2(pl.y-e.y, pl.x-e.x);
          const trk = game.wave>=10, teleFrames = trk?120:90; // harder variant winds up ~2s and tracks
          telegraphLine(e.x, e.y, ang, { width:5, tele:teleFrames, active:9, dmg:14, owner:e.id, track:trk });
          e.aimCd = teleFrames + 12;  // frozen through the warning + brief beam so the line stays on the enemy
          sfx.telegraph(); e.fireCd = Math.round(D.fireCooldown(game.wave,false)*3.2); // slow, readable cadence
        }
      } else if(e.boss){ bossAttackFast(e); }                // fast attack track (slow track runs in the boss block above) (#3)
      else { enemyShoot(e); e.fireCd = Math.round(D.fireCooldown(game.wave, e.boss)*(e.fireMul||1)); }
    }
    if(e.hp<=0){ burst(e.x,e.y,e.hue,e.boss?40:16,e.boss?6:4); game.enemies.splice(i,1);
      if(e.boss){ addShake(14); hitStop(8); sfx.bossKill(); game.eBullets.length=0; } else sfx.enemyKill();   // boss death clears the screen of bullets (#3); shake/kill SFX (#5/#7)
      game.score += e.boss?500:50; if(p.leech)p.hp=Math.min(p.maxhp,p.hp+p.leech);
      gainXp(p, e.boss?6:2); }
  }

  // enemy bullets
  for(let i=game.eBullets.length-1;i>=0;i--){ const b=game.eBullets[i];
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
  document.getElementById('h-wave').textContent=String(game.wave);
  document.getElementById('h-lvl').textContent=String(p.lvl);
  document.getElementById('h-score').textContent=String(game.score);
}

// ---- loop ----
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

// Test seam: expose the live game object only when a harness opts in via a global
// flag. The real page never sets it, so this stays inert (and out of the way) in
// production; the headless smoke test flips it on to assert the sim advances.
const dbg = typeof window !== 'undefined' ? /** @type {any} */ (window) : null;
if (dbg && dbg.__VOIDWAKE_DEBUG) dbg.__voidwake = { game };
