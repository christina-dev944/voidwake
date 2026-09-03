// main.js — thin bootstrap: wires keyboard/pointer input to the game and runs the
// fixed-timestep loop. Everything else lives in its own module (state, canvas,
// entities, weapons, abilities, combat, effects, targeting, update, render, flow).
import { clamp } from './util.js';
import { CLASSES } from './classes.js';
import { resumeAudio, toggleMute } from './audio.js';
import { game } from './state.js';
import { cv, W, H } from './canvas.js';
import { AIM_MODES } from './targeting.js';
import { useActive } from './abilities.js';
import { classCardRect, chevronRect, inRect, pauseButtons } from './render.js';
import { keys } from './input.js';
import { reset, quitRun, pickUpgrade } from './flow.js';

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

// starting the loop (its own module) kicks off the fixed-timestep heartbeat
import './loop.js';

// Test seam: expose the live game object only when a harness opts in via a global
// flag. The real page never sets it, so this stays inert (and out of the way) in
// production; the headless smoke test flips it on to assert the sim advances.
const dbg = typeof window !== 'undefined' ? (window as any) : null;
if (dbg && dbg.__VOIDWAKE_DEBUG) dbg.__voidwake = { game };
