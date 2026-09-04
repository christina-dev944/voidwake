// main.js — thin bootstrap: wires keyboard/pointer input to the game and runs the
// fixed-timestep loop. Everything else lives in its own module (state, canvas,
// entities, weapons, abilities, combat, effects, targeting, update, render, flow).
import { clamp } from './util.js';
import { CLASSES } from './classes.js';
import { resumeAudio, toggleMute } from './audio.js';
import { game } from './state.js';
import { cv, W, H } from './canvas.js';
import { AIM_MODES, manualAim } from './targeting.js';
import { useActive } from './abilities.js';
import { classCardRect, chevronRect, inRect, pauseButtons, settingsRects, sliderValue } from './render.js';
import { keys } from './input.js';
import { reset, quitRun, pickUpgrade } from './flow.js';
import { settings, saveSettings, applySettings } from './settings.js';

// settings overlay (#28): open/close + which slider (if any) the pointer is dragging
function openSettings(){ game.settingsOpen=true; cv.style.cursor='default'; }
function closeSettings(){ game.settingsOpen=false; cv.style.cursor='default'; }
let sliderGrab = -1;   // index into settingsRects().sliders, or -1
function setSliderFromX(i: number, mx: number){
  const s=settingsRects().sliders[i]; if(!s) return;
  const key=s.key, frac=(mx-s.track.x)/s.track.w;
  settings[key]=sliderValue(frac); applySettings(); saveSettings();
}

// ---- input ----
addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  resumeAudio();   // first gesture unlocks WebAudio (#7)
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault();
  const k0=e.key.toLowerCase();
  if (game.settingsOpen) return;   // settings swallows gameplay keys (Esc/S close it, handled below)
  if ((k0==='p'||k0==='escape') && (game.state==='playing'||game.paused)){ game.paused = !game.paused;
    // default cursor for the pause menu; back to the crosshair for manual aim on resume (#11)
    cv.style.cursor = (!game.paused && game.state==='playing' && manualAim()) ? 'crosshair' : 'default'; }
  if (k0==='m') toggleMute();   // mute toggle (#7)
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

addEventListener('keydown', e=>{
  const k=e.key.toLowerCase();
  if(game.settingsOpen){ if(k==='escape'||k==='s') closeSettings(); return; }   // settings overlay (#28)
  if((game.state==='title' || game.paused) && k==='s'){ openSettings(); return; } // open from title/pause
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
  if(game.state==='playing' && !game.paused && k==='t'){ game.aimIdx=(game.aimIdx+1)%AIM_MODES.length; // cycle aim mode (#35); MANUAL = aim at cursor (#11)
    cv.style.cursor = manualAim() ? 'crosshair' : 'default'; }   // OS crosshair marks the aim point in manual (#11)
});
function canvasXY(e: MouseEvent){ const rect=cv.getBoundingClientRect();
  return [ (e.clientX-rect.left)*(W/rect.width), (e.clientY-rect.top)*(H/rect.height) ]; }
function classAt(mx: number,my: number){ for(let i=0;i<CLASSES.length;i++){ const c=classCardRect(i);
  if(mx>=c.x&&mx<=c.x+c.w&&my>=c.y&&my<=c.y+c.h) return i; } return -1; }
// exact level-up card bounds (must match drawUpgrade's layout) so clicks land
// only on a card, not the gaps between them (#34)
function upgradeAt(mx: number,my: number){ for(let i=0;i<game.upgradeChoices.length;i++){
  const y=220+i*150, x=W/2-260; if(mx>=x&&mx<=x+520&&my>=y&&my<=y+120) return i; } return -1; }

// hover highlights the card under the cursor (no scroll — carousel scroll follows
// selection only, so cards don't slide out from under the pointer)
cv.addEventListener('pointermove', e=>{
  const [mx,my]=canvasXY(e);
  if(game.settingsOpen){                             // settings overlay takes pointer priority (#28)
    if(sliderGrab>=0) setSliderFromX(sliderGrab, mx);
    const s=settingsRects();
    const hot = inRect(mx,my,s.close) || inRect(mx,my,s.sound) || sliderGrab>=0 ||
      s.sliders.some(sl=>inRect(mx,my,{x:sl.track.x,y:sl.track.y-14,w:sl.track.w,h:sl.track.h+28}));
    cv.style.cursor = hot?'pointer':'default'; return;
  }
  if(game.paused){                                   // hover-highlight pause buttons (#36)
    const b=pauseButtons();                          // don't move the manual aim while paused (#11)
    game.pauseHover = inRect(mx,my,b.resume)?'resume':inRect(mx,my,b.settings)?'settings':inRect(mx,my,b.quit)?'quit':null;
    cv.style.cursor = game.pauseHover?'pointer':'default'; return;
  }
  if(game.state==='upgrade'){ cv.style.cursor = upgradeAt(mx,my)>=0 ? 'pointer':'default'; return; }
  if(game.state!=='classSelect'){
    if(game.state==='playing'){ game.mouseX=mx; game.mouseY=my;   // track the game-unit cursor for MANUAL aim (#11)
      cv.style.cursor = manualAim() ? 'crosshair' : 'default'; }  // OS crosshair pointer in manual aim (#11)
    else cv.style.cursor='default';
    return;
  }
  game.hoverIdx=classAt(mx,my);
  const overChevron = (game.classIdx>0 && inRect(mx,my,chevronRect(-1))) ||
                      (game.classIdx<CLASSES.length-1 && inRect(mx,my,chevronRect(1)));
  cv.style.cursor = (game.hoverIdx>=0 || overChevron) ? 'pointer' : 'default';
});
cv.addEventListener('pointerdown', e=>{
  resumeAudio();   // first gesture unlocks WebAudio (#7)
  const [mx,my]=canvasXY(e);
  if(game.settingsOpen){                             // settings overlay: sliders / sound / close (#28)
    const s=settingsRects();
    if(inRect(mx,my,s.close)){ closeSettings(); return; }
    const si=s.sliders.findIndex(sl=>inRect(mx,my,{x:sl.track.x,y:sl.track.y-14,w:sl.track.w,h:sl.track.h+28}));
    if(si>=0){ sliderGrab=si; setSliderFromX(si, mx); return; }   // grab to drag, and jump to the click point
    if(inRect(mx,my,s.sound)){ toggleMute(); return; }
    if(!inRect(mx,my,s.panel)) closeSettings();      // click outside the panel closes
    return;
  }
  if(game.paused){                                   // clickable pause menu (#36)
    const b=pauseButtons();
    if(inRect(mx,my,b.resume)) game.paused=false;
    else if(inRect(mx,my,b.settings)) openSettings();
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

// release a settings slider drag anywhere the pointer comes up (incl. off-canvas) (#28)
addEventListener('pointerup', ()=>{ sliderGrab=-1; });

// starting the loop (its own module) kicks off the fixed-timestep heartbeat
import './loop.js';

// Test seam: expose the live game object only when a harness opts in via a global
// flag. The real page never sets it, so this stays inert (and out of the way) in
// production; the headless smoke test flips it on to assert the sim advances.
const dbg = typeof window !== 'undefined' ? (window as any) : null;
if (dbg && dbg.__VOIDWAKE_DEBUG) dbg.__voidwake = { game };
