// render.ts — everything that draws to the canvas: the playfield, HUD, pause menu,
// level-up cards, and the class-select carousel, plus the layout geometry the pointer
// hit-testing shares. Reads game state and renders; it never drives the simulation.
import { TAU, clamp, rand } from './util.js';
import { ctx, W, H } from './canvas.js';
import { game, best, UP_NAME } from './state.js';
import { CLASSES, classStatBars, classActiveLabel } from './classes.js';
import { AIM_MODES, manualAim } from './targeting.js';
import { isMuted } from './audio.js';
import { keys } from './input.js';
import * as D from './difficulty.js';
import type { Player } from './types.js';

// ---- render ----
// the player ship hull (also reused for dash afterimages, #51). Builds the path only —
// caller sets style then fills.
function shipPath(x: number,y: number,r: number){ ctx.beginPath();
  ctx.moveTo(x,y-r); ctx.lineTo(x-r*0.8,y+r*0.7); ctx.lineTo(x,y+r*0.3); ctx.lineTo(x+r*0.8,y+r*0.7); ctx.closePath(); }
export function draw(){
  syncBottomHud();   // keep the DOM HUD strip below the canvas in sync (#41)
  ctx.clearRect(0,0,W,H);
  // starfield backdrop
  ctx.fillStyle='#06060b'; ctx.fillRect(0,0,W,H);
  ctx.globalAlpha=0.5;
  for(let i=0;i<40;i++){ const y=((i*97 + game.time*(1+i%3))%H); ctx.fillStyle=i%3?'#191933':'#12122a';
    ctx.fillRect((i*53)%W, y, 2, 2); }
  ctx.globalAlpha=1;

  if(game.state==='title'){ center('VOIDWAKE', 54, '#e8e8f0', H/2-40);
    center('a roguelike bullet hell', 18, '#8a5cff', H/2+6);
    center('press SPACE / click to choose a vessel', 15, '#7a7a98', H/2+50);
    if(best.wave>0) center('best run: wave '+best.wave+' - score '+best.score, 13, '#6a6a88', H/2+82);
    frameFooter(); return; }

  if(game.state==='classSelect'){ drawClassSelect(); return; }

  // screen shake: offset the whole world layer (menus/overlays stay put) (#5)
  ctx.save();
  if(game.shake>0){ const s=game.shake; ctx.translate(rand(-s,s), rand(-s,s)); }

  // particles
  for(const pt of game.particles){ ctx.globalAlpha=clamp(pt.life/24,0,1)*(pt.dim??1);
    ctx.fillStyle=`hsl(${pt.hue},90%,65%)`; ctx.fillRect(pt.x-1.5,pt.y-1.5,3,3); }
  ctx.globalAlpha=1;

  // player bullets — dimmed (see game.pBulletAlpha) so enemy fire reads clearly
  ctx.globalAlpha=game.pBulletAlpha;
  for(const b of game.pBullets){ ctx.fillStyle=b.crit?'#ffd24d':'#7cf7ff';
    ctx.shadowBlur=8; ctx.shadowColor=ctx.fillStyle;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.fill(); }
  ctx.shadowBlur=0; ctx.globalAlpha=1;

  // enemies
  // telegraphed hazards (#46) — drawn under enemies: pulsing red warning line during
  // the wind-up, then a bright white/red beam on the instant-fire frames.
  const HZLEN=Math.hypot(W,H);
  for(const h of game.hazards){ if(h.kind!=='line') continue;
    const ex=h.x+Math.cos(h.ang)*HZLEN, ey=h.y+Math.sin(h.ang)*HZLEN;
    if(h.tele>0){
      const a=0.30+(h.pulse||0)*0.55;   // static ~0.30, ramps toward ~0.85 at pulse peaks near the end
      ctx.globalAlpha=a; ctx.strokeStyle='hsl(0,90%,55%)'; ctx.lineWidth=h.width;
      ctx.beginPath();ctx.moveTo(h.x,h.y);ctx.lineTo(ex,ey);ctx.stroke();
      ctx.globalAlpha=Math.min(1,a+0.2); ctx.strokeStyle='hsl(0,95%,74%)'; ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(h.x,h.y);ctx.lineTo(ex,ey);ctx.stroke();
    } else if(h.active>0){
      // layered strokes instead of shadowBlur — a full-screen blurred line is very
      // expensive and hitched with several beams at once (#46 perf).
      ctx.globalAlpha=0.35; ctx.strokeStyle='hsl(0,90%,55%)'; ctx.lineWidth=h.width*2.4;
      ctx.beginPath();ctx.moveTo(h.x,h.y);ctx.lineTo(ex,ey);ctx.stroke();
      ctx.globalAlpha=1; ctx.strokeStyle='#fff'; ctx.lineWidth=h.width;
      ctx.beginPath();ctx.moveTo(h.x,h.y);ctx.lineTo(ex,ey);ctx.stroke();
    }
  }
  ctx.globalAlpha=1; ctx.shadowBlur=0;

  for(const e of game.enemies){ const c=`hsl(${e.hue},70%,${e.boss?60:55}%)`;
    ctx.fillStyle=c; ctx.strokeStyle='#000'; ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,TAU);ctx.fill();ctx.stroke();
    // per-body hp bar (bosses use the big top-of-screen bar instead, #3)
    if(!e.boss){ const w=e.r*2; ctx.fillStyle='#000'; ctx.fillRect(e.x-w/2,e.y-e.r-8,w,3);
      ctx.fillStyle=c; ctx.fillRect(e.x-w/2,e.y-e.r-8,w*clamp(e.hp/e.maxhp,0,1),3); } }

  // enemy bullets
  for(const b of game.eBullets){ ctx.fillStyle=`hsl(${b.hue},95%,68%)`;
    ctx.shadowBlur=6; ctx.shadowColor=ctx.fillStyle;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.fill(); }
  ctx.shadowBlur=0;

  // nova rings
  for(const f of game.novaFx){ ctx.globalAlpha=clamp(f.life,0,1)*0.7;
    ctx.strokeStyle='hsl(285,90%,72%)'; ctx.lineWidth=4; ctx.shadowBlur=14; ctx.shadowColor='hsl(285,90%,70%)';
    ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,TAU); ctx.stroke(); }
  ctx.globalAlpha=1; ctx.shadowBlur=0;

  // Scythe wedges — a filled sector that expands + fades in the blast direction (#42)
  for(const f of game.coneFx){ ctx.globalAlpha=clamp(f.life,0,1)*0.5;
    ctx.fillStyle='hsl(18,90%,58%)'; ctx.strokeStyle='hsl(18,95%,68%)'; ctx.lineWidth=3;
    ctx.shadowBlur=14; ctx.shadowColor='hsl(18,90%,62%)';
    const aim=f.aim||0, half=f.half||0;
    ctx.beginPath(); ctx.moveTo(f.x,f.y); ctx.arc(f.x,f.y,f.r,aim-half,aim+half); ctx.closePath();
    ctx.fill(); ctx.stroke(); }
  ctx.globalAlpha=1; ctx.shadowBlur=0;

  // laser beam (drawn under the ship)
  const pl=game.player;
  if(pl && pl.weapon==='laser' && pl.beam && pl.beam.active){
    const len=Math.hypot(W,H), glowW=pl.beamWidth*1.4, coreW=Math.max(2, pl.beamWidth*0.5); // thickens with Wide Lens
    // #47 perf: NO per-beam shadowBlur — a full-diagonal blurred stroke per beam
    // hitched hard with several Split Shot beams. The wide glow underlay already
    // reads as a glow, so we layer plain strokes (like the marksman beam, #46).
    // Batched into two passes (all glows, then all cores) so style/alpha is set
    // once instead of per beam. Opacity capped below a bullet's (#48).
    ctx.save(); ctx.lineCap='round';
    ctx.strokeStyle=`hsl(${pl.cls.hue},90%,62%)`; ctx.lineWidth=glowW; ctx.globalAlpha=game.beamAlpha*0.6;
    for(const ang of pl.beam.angs){
      ctx.beginPath(); ctx.moveTo(pl.x,pl.y); ctx.lineTo(pl.x+Math.cos(ang)*len, pl.y+Math.sin(ang)*len); ctx.stroke();
    }
    ctx.strokeStyle='#eaffff'; ctx.lineWidth=coreW; ctx.globalAlpha=game.beamAlpha;
    for(const ang of pl.beam.angs){
      ctx.beginPath(); ctx.moveTo(pl.x,pl.y); ctx.lineTo(pl.x+Math.cos(ang)*len, pl.y+Math.sin(ang)*len); ctx.stroke();
    }
    ctx.restore();
  }

  // dash afterimages under the ship — fading ghost hulls in the class hue (#51).
  // brighter + glowing so the dash trail reads clearly.
  for(const a of game.afterimages){ const l=clamp(a.life,0,1);
    ctx.fillStyle=`hsl(${a.hue},90%,66%)`; ctx.shadowBlur=12; ctx.shadowColor=`hsl(${a.hue},90%,66%)`;
    ctx.globalAlpha=l*0.8; shipPath(a.x,a.y,a.r*(0.7+0.3*l)); ctx.fill(); }
  ctx.globalAlpha=1; ctx.shadowBlur=0;

  // player (hidden during the death hold so the explosion stands alone) (#40)
  const p=game.player;
  if(p && game.state!=='dying'){
    const pc=`hsl(${(p.cls&&p.cls.hue)||265},70%,62%)`;
    const inv=p.iframes>0;
    // i-frames used to hard-blink the ship on/off, which was hard to track (#51).
    // Instead keep it solidly visible with a gentle shimmer + a pulsing shield ring.
    ctx.globalAlpha = inv ? 0.78+0.18*Math.sin(game.time*0.5) : 1;
    ctx.fillStyle=pc; ctx.shadowBlur=14; ctx.shadowColor=pc;
    shipPath(p.x,p.y,p.r); ctx.fill();
    ctx.shadowBlur=0; ctx.globalAlpha=1;
    if(inv){ ctx.strokeStyle=pc; ctx.globalAlpha=0.35+0.2*Math.sin(game.time*0.5);
      ctx.lineWidth=2; ctx.beginPath(); ctx.arc(p.x,p.y,p.r+5,0,TAU); ctx.stroke(); ctx.globalAlpha=1; }
    // hitbox dot when focusing
    if(keys['shift']){ ctx.fillStyle='#fff'; ctx.beginPath();ctx.arc(p.x,p.y,p.hitR,0,TAU);ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.3)';ctx.beginPath();ctx.arc(p.x,p.y,p.r+6,0,TAU);ctx.stroke(); }
    // XP strip stays on the top edge (thin, doesn't block the field); HP + active/heat
    // now live in the DOM strip below the canvas (see syncBottomHud, #41)
    if(game.state==='playing'||game.state==='upgrade') drawXpBar(p);
  }

  ctx.restore();   // end screen-shake transform (#5)

  // auto-aim mode indicator (#35) — drawn outside the shake so it stays legible
  if((game.state==='playing'||game.state==='upgrade') && game.player){
    ctx.textAlign='right'; ctx.font='11px ui-monospace,monospace'; ctx.fillStyle='#7a7a98';
    ctx.fillText('[T] AIM: '+AIM_MODES[game.aimIdx].label, W-14, 20);
    if(isMuted()){ ctx.fillStyle='#565879'; ctx.fillText('[M] MUTED', W-14, 36); }   // audio muted (#7)
    ctx.textAlign='left';
    drawBossBar();
    // MANUAL aim (#11): crosshair reticle at the cursor so the exact aim point is clear
    if(manualAim() && game.state==='playing') drawReticle(game.mouseX, game.mouseY, game.player);
  }

  if(game.state==='upgrade') drawUpgrade();
  if(game.state==='dead'){ ctx.fillStyle='rgba(6,6,11,.78)'; ctx.fillRect(0,0,W,H);
    center('YOU DIED', 52, '#ff4d6d', H/2-140);
    center('reached wave '+game.wave+'  ·  score '+game.score, 18, '#e8e8f0', H/2-86);
    center('best run: wave '+best.wave+' - score '+best.score, 14, '#8a8aa6', H/2-58);
    // run summary: every boon taken this run, same panel as the pause menu (#44)
    const bw=Math.min(460,W*0.72);
    drawRunBoons(W/2-bw/2, H/2-30, bw);
    center('press SPACE / click to try again', 15, '#7a7a98', H-48); }

  if(game.paused){ ctx.fillStyle='rgba(6,6,11,.72)';ctx.fillRect(0,0,W,H);
    const lx=Math.max(40,W*0.10);
    ctx.textAlign='left'; ctx.fillStyle='#e8e8f0'; ctx.font='bold 40px ui-monospace,monospace';
    ctx.fillText('PAUSED', lx, Math.max(72,H*0.16));                        // title top-left
    const b=pauseButtons();
    drawButton(b.resume,'▶  Resume', game.pauseHover==='resume');           // left column
    drawButton(b.quit,'✕  Quit to title', game.pauseHover==='quit');
    // right column: STATS panel on top, UPGRADES THIS RUN panel below it
    const panelW=Math.min(360,Math.max(260,W*0.34));
    const rx=W-panelW-Math.max(40,W*0.08), ry=b.resume.y;
    const statsBottom=drawPauseStats(rx, ry, panelW);
    drawRunBoons(rx, statsBottom+14, panelW); }
}

// shared bordered panel backdrop for the pause-menu panels
function panelBox(x: number,y: number,w: number,h: number){
  ctx.fillStyle='rgba(18,18,42,0.55)'; roundRect(x,y,w,h,10); ctx.fill();
  ctx.strokeStyle='#2a2a48'; ctx.lineWidth=1.5; roundRect(x,y,w,h,10); ctx.stroke();
}

// player stat readout — right column of the pause menu; returns its bottom Y
function drawPauseStats(x: number,y: number,w: number){
  const p=game.player; if(!p) return y;
  const laser=p.weapon==='laser';
  const rows=[
    ['DMG',        laser ? p.beamDps+' dps' : Math.round(p.dmg)],
    ['Fire rate',  laser ? 'beam' : (60/p.fireRate).toFixed(1)+'/s'],
    ['Bullet spd', laser ? 'hitscan' : p.bulletSpeed.toFixed(1)],
    ['Move spd',   p.speed.toFixed(1)],
    ['Shots',      p.shots],
    ['Pierce',     p.pierce],
    ['Crit',       Math.round(p.crit*100)+'%'],
  ];
  const lh=20, panelH=52+rows.length*lh;
  panelBox(x,y,w,panelH);
  ctx.textAlign='left'; ctx.font='bold 12px ui-monospace,monospace'; ctx.fillStyle='#8a5cff';
  ctx.fillText('STATS', x+18, y+28);
  let yy=y+52; ctx.font='12px ui-monospace,monospace';
  for(const [k,v] of rows){
    ctx.textAlign='left';  ctx.fillStyle='#8a8aa6'; ctx.fillText(String(k), x+18, yy);
    ctx.textAlign='right'; ctx.fillStyle='#e8e8f0'; ctx.fillText(String(v), x+w-18, yy);
    yy+=lh;
  }
  ctx.textAlign='left';
  return y+panelH;
}

// clickable pause-menu buttons (#36) — left column, hit-tested in the pointer handlers too
export function pauseButtons(){ const w=230,h=46, x=Math.max(40,W*0.10), y0=Math.max(120,H*0.30);
  return { resume:{x,y:y0,w,h}, quit:{x,y:y0+60,w,h} }; }
function drawButton(r: {x:number;y:number;w:number;h:number},label: string,hover: boolean){
  ctx.fillStyle=hover?'#1e1e3a':'#12122a'; roundRect(r.x,r.y,r.w,r.h,8); ctx.fill();
  ctx.strokeStyle=hover?'#8a5cff':'#3a3a5c'; ctx.lineWidth=2; roundRect(r.x,r.y,r.w,r.h,8); ctx.stroke();
  ctx.textAlign='left'; ctx.fillStyle='#e8e8f0'; ctx.font='bold 16px ui-monospace,monospace';
  ctx.fillText(label, r.x+18, r.y+r.h/2+6);
}

// pause-menu build readout (#31/#36): boons picked up this run, stacked "Name ×N",
// in a bordered panel below the STATS panel in the RIGHT column of the pause screen.
function drawRunBoons(px: number,py: number,panelW: number){
  const p=game.player; if(!p) return;
  const counts=new Map<string,number>();
  for(const id of game.upgrades) counts.set(id,(counts.get(id)||0)+1);
  const entries=[...counts.entries()].map(([id,c])=>({ name:UP_NAME[id]||id, c }));
  const cols = entries.length>18 ? 3 : entries.length>9 ? 2 : 1, perCol=Math.max(1,Math.ceil(entries.length/cols));
  const lh=22, panelH = 54 + (entries.length?perCol:1)*lh;
  panelBox(px,py,panelW,panelH);
  ctx.textAlign='left'; ctx.font='bold 12px ui-monospace,monospace'; ctx.fillStyle='#8a5cff';
  ctx.fillText('UPGRADES THIS RUN', px+18, py+28);
  if(!entries.length){ ctx.fillStyle='#565879'; ctx.font='13px ui-monospace,monospace';
    ctx.fillText('none yet', px+18, py+54); return; }
  ctx.font='13px ui-monospace,monospace'; ctx.fillStyle='#c8c8e0';
  const colW=(panelW-36)/cols;
  entries.forEach((en,i)=>{ const col=Math.floor(i/perCol), row=i%perCol;
    ctx.fillText(en.name+(en.c>1?'  ×'+en.c:''), px+18+col*colW, py+54+row*lh); });
}

// Thin XP progress strip along the very top edge — fills left→right toward the
// next level, resets on level-up (#38). Unobtrusive; the LVL count lives in the HUD.
// Boss health bar as 3 stacked bars (#3): each phase drains one full bar of a lighter
// red, revealing the next background beneath it. Phase 1 dark-red over red, phase 2
// red over light-red, phase 3 light-red over black; when the 3rd empties, the boss dies.
function drawBossBar(){
  const boss=game.enemies.find(e=>e.boss); if(!boss) return;
  const bw=Math.min(560,W*0.6), bh=12, bx=(W-bw)/2, by=30;
  const f=clamp(boss.hp/boss.maxhp,0,1);
  const DARK='hsl(0,85%,30%)', RED='hsl(0,88%,48%)', LIGHT='hsl(0,80%,70%)', BLACK='#06060b';
  let bg, fill, stack;
  if(f>2/3){ bg=RED;   fill=DARK;  stack=(f-2/3)/(1/3); }   // stack 1 draining
  else if(f>1/3){ bg=LIGHT; fill=RED;   stack=(f-1/3)/(1/3); }   // stack 2 draining
  else { bg=BLACK; fill=LIGHT; stack=f/(1/3); }            // stack 3 → death at empty
  ctx.fillStyle=bg;   ctx.fillRect(bx,by,bw,bh);
  ctx.fillStyle=fill; ctx.fillRect(bx,by,bw*clamp(stack,0,1),bh);
  ctx.strokeStyle='#3a3a5c'; ctx.lineWidth=1.5; ctx.strokeRect(bx,by,bw,bh);
  ctx.textAlign='left'; ctx.font='bold 11px ui-monospace,monospace'; ctx.fillStyle='#e8e8f0';
  ctx.fillText('BOSS', bx, by-5);
  ctx.textAlign='right'; ctx.fillStyle='#8a8aa6'; ctx.fillText('PHASE '+boss.phase+'/3', bx+bw, by-5);
  ctx.textAlign='left';
}
// MANUAL-aim reticle (#11): a small ring + gapped crosshair in the class hue at the cursor.
function drawReticle(mx: number, my: number, p: Player){
  const pc=`hsl(${(p.cls&&p.cls.hue)||265},80%,66%)`;
  ctx.strokeStyle=pc; ctx.lineWidth=1.5; ctx.globalAlpha=0.9;
  ctx.beginPath(); ctx.arc(mx,my,9,0,TAU); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(mx-14,my); ctx.lineTo(mx-4,my); ctx.moveTo(mx+4,my); ctx.lineTo(mx+14,my);
  ctx.moveTo(mx,my-14); ctx.lineTo(mx,my-4); ctx.moveTo(mx,my+4); ctx.lineTo(mx,my+14);
  ctx.stroke(); ctx.globalAlpha=1;
}
function drawXpBar(p: Player){
  const frac=clamp(p.xp/p.xpNext,0,1);
  ctx.fillStyle='#181830'; ctx.fillRect(0,0,W,4);
  ctx.fillStyle='hsl(258,100%,70%)'; ctx.fillRect(0,0,W*frac,4);
}

// Sync the DOM HUD strip below the canvas (HP + active/heat), so these bars live
// OUTSIDE the playfield and never obscure the bottom while dodging (#41).
const el = (id: string) => document.getElementById(id) as HTMLElement;
const HUD2 = {
  root:   el('hud2'),
  hpfill: el('hpfill'),
  hptext: el('hptext'),
  statlbl:el('statlbl'),
  statbar:el('statbar'),
  statfill:el('statfill'),
  statseg:el('statseg'),
};
function syncBottomHud(){
  const p=game.player;
  const show = p && (game.state==='playing'||game.state==='upgrade'||game.state==='dying');
  HUD2.root.style.visibility = show ? 'visible' : 'hidden';
  if(!show) return;
  const frac=clamp(p.hp/p.maxhp,0,1);
  HUD2.hpfill.style.width=(frac*100)+'%';
  HUD2.hpfill.style.background=`hsl(${frac*120},72%,48%)`;
  HUD2.hptext.textContent=Math.max(0,Math.ceil(p.hp))+' / '+p.maxhp;
  HUD2.statseg.style.display='none';              // only the multi-charge bar shows segment dividers
  if(p.active){                                   // active-ability charges/cooldown (#39, #51)
    const maxCh=p.active.maxCharges||1, cd=p.active.cooldown||1;
    HUD2.statbar.style.visibility='visible';
    if(maxCh>1){                                  // one continuous energy bar split into maxCh segments (#51)
      // total charge = full charges + the fraction of the one currently recharging.
      const partial=p.charges>=maxCh?0:(1-p.activeCd/cd);
      const totalFrac=clamp((p.charges+partial)/maxCh,0,1);
      HUD2.statlbl.textContent='[SPACE] '+p.active.name;
      HUD2.statlbl.style.color=p.charges>0?'#7cf7ff':'#8a8aa6';
      HUD2.statfill.style.width=(totalFrac*100)+'%';
      // full charges are bright; the still-recharging partial segment stays dim so
      // it's clear it isn't ready yet (#51). Boundary is where the full charges end.
      const bright='#7cf7ff', dim='#3d6d78';
      const b = totalFrac>0 ? clamp((p.charges/maxCh)/totalFrac,0,1)*100 : 0;
      HUD2.statfill.style.background=`linear-gradient(90deg, ${bright} 0, ${bright} ${b}%, ${dim} ${b}%, ${dim} 100%)`;
      HUD2.statseg.style.display='block';         // dark divider lines at each segment boundary
      const segs=[]; for(let i=1;i<maxCh;i++){ const pc=i/maxCh*100;
        segs.push(`linear-gradient(90deg,transparent calc(${pc}% - 1px),#0c0c18 calc(${pc}% - 1px),#0c0c18 calc(${pc}% + 1px),transparent calc(${pc}% + 1px))`); }
      HUD2.statseg.style.backgroundImage=segs.join(',');
    } else {                                      // single-charge active: ready / countdown
      const ready=p.activeCd<=0, prog=clamp(1-p.activeCd/cd,0,1);
      HUD2.statlbl.textContent='[SPACE] '+p.active.name+(ready?' READY':' '+Math.ceil(p.activeCd/60)+'s');
      HUD2.statlbl.style.color=ready?'#7cf7ff':'#8a8aa6';
      HUD2.statfill.style.width=(prog*100)+'%';
      HUD2.statfill.style.background=ready?'#7cf7ff':'#4a6fa0';
    }
  } else if(p.weapon==='laser'){                   // Lancer energy bar (#50)
    // energy = the inverse of internal heat: full when idle, DRAINS as you fire,
    // refills when you stop; empty (heat maxed) = the depleted lockout. Label is a
    // fixed string so the bar never shifts when the state flips (#50 point 1).
    const energy=clamp(1 - p.heat/p.heatMax,0,1);
    HUD2.statlbl.textContent='ENERGY';
    HUD2.statlbl.style.color=p.depleted?'#ff4d6d':'#8a8aa6';
    HUD2.statbar.style.visibility='visible';
    HUD2.statfill.style.width=(energy*100)+'%';
    // green (full) → red (empty); solid red during the empty lockout.
    HUD2.statfill.style.background=p.depleted?'#ff4d6d':`hsl(${energy*120},85%,55%)`;
  } else {                                         // no status bar for plain-bullet classes
    HUD2.statlbl.textContent=''; HUD2.statbar.style.visibility='hidden';
  }
}

function drawUpgrade(){
  ctx.fillStyle='rgba(6,6,11,.82)'; ctx.fillRect(0,0,W,H);
  center('LEVEL UP', 40, '#8a5cff', 150);
  center('choose a boon  (1 / 2 / 3 or click)', 14, '#7a7a98', 190);
  game.upgradeChoices.forEach((u,i)=>{
    const y=220+i*150, x=W/2-260, w=520, h=120;
    // class-exclusive boons get a class-tinted, glowing card + a badge
    const exHue = u.tag ? (CLASSES.find(c=>c.name.toUpperCase()===u.tag)?.hue ?? 45) : null;
    const accent = exHue!=null ? `hsl(${exHue},85%,64%)` : '#8a5cff';
    ctx.fillStyle = exHue!=null ? `hsl(${exHue},42%,13%)` : '#14142a';
    if(exHue!=null){ ctx.save(); ctx.shadowBlur=18; ctx.shadowColor=accent; }
    roundRect(x,y,w,h,10); ctx.fill();
    if(exHue!=null) ctx.restore();
    ctx.strokeStyle=accent; ctx.lineWidth=exHue!=null?3:2; roundRect(x,y,w,h,10); ctx.stroke();
    ctx.textAlign='left';
    ctx.fillStyle=accent; ctx.font='bold 22px ui-monospace,monospace';
    ctx.fillText((i+1)+'. '+u.name, x+24, y+48);   // tighter number↔name gap (single space)
    ctx.fillStyle='#c8c8e0'; ctx.font='16px ui-monospace,monospace';
    // dynamic desc (e.g. Aegis shows live invuln duration); flush-left with the name
    ctx.fillText(u.descFn&&game.player?u.descFn(game.player):u.desc, x+24, y+82);
    if(u.tag){
      const label=u.tag+' EXCLUSIVE'; ctx.font='bold 11px ui-monospace,monospace';
      const bw=ctx.measureText(label).width+20, bx=x+w-bw-16, by=y+14, bh=20;
      ctx.fillStyle=accent; roundRect(bx,by,bw,bh,10); ctx.fill();
      ctx.fillStyle='#0a0a12'; ctx.textAlign='center'; ctx.fillText(label, bx+bw/2, by+14); ctx.textAlign='left';
    }
  });
  ctx.textAlign='left';
}

// ---- class select ----
// Carousel: fixed-width cards; the selected index sits centered, others flank it.
// `classScroll` eases toward `classIdx` (in drawClassSelect) for a smooth slide.
const CARD_W=350, CARD_GAP=22, CARD_H=384;
export function classCardRect(i: number){
  return { x: W/2 - CARD_W/2 + (i - game.classScroll)*(CARD_W+CARD_GAP), y:H/2-CARD_H/2, w:CARD_W, h:CARD_H };
}
export function chevronRect(dir: number){ const w=36,h=90; return dir<0 ? {x:10,y:H/2-h/2,w,h} : {x:W-10-w,y:H/2-h/2,w,h}; }
export function inRect(mx: number,my: number,r: {x:number;y:number;w:number;h:number}){ return mx>=r.x&&mx<=r.x+r.w&&my>=r.y&&my<=r.y+r.h; }
function drawClassSelect(){
  ctx.fillStyle='#06060b'; ctx.fillRect(0,0,W,H);
  // ease the carousel toward the selected card
  game.classScroll += (game.classIdx - game.classScroll)*0.2;
  if(Math.abs(game.classIdx-game.classScroll)<0.002) game.classScroll=game.classIdx;
  center('CHOOSE YOUR VESSEL', 34, '#8a5cff', 120);
  center('← → / chevrons to browse  ·  click a vessel to launch', 14, '#7a7a98', 158);
  CLASSES.forEach((cls,i)=>{
    const r=classCardRect(i), sel=i===game.classIdx, hue=cls.hue;
    if(r.x>W || r.x+r.w<0) return;              // cull off-screen cards
    const hov = i===game.hoverIdx && !sel;
    if(sel){
      ctx.save();
      ctx.shadowBlur=30; ctx.shadowColor=`hsl(${hue},85%,62%)`;      // strong outer glow
      ctx.fillStyle=`hsl(${hue},48%,17%)`;                            // bright tinted fill
      roundRect(r.x,r.y,r.w,r.h,12); ctx.fill();
      ctx.restore();
      ctx.strokeStyle=`hsl(${hue},92%,70%)`; ctx.lineWidth=4;         // bright thick border
      roundRect(r.x,r.y,r.w,r.h,12); ctx.stroke();
    } else {
      ctx.fillStyle = hov ? '#16162e' : '#0d0d1c';                    // brighten on hover
      roundRect(r.x,r.y,r.w,r.h,12); ctx.fill();
      ctx.strokeStyle = hov ? `hsl(${hue},60%,55%)` : `hsl(${hue},38%,40%)`; ctx.lineWidth = hov?2.5:1.5;
      roundRect(r.x,r.y,r.w,r.h,12); ctx.stroke();
    }
    // ship glyph
    const cx=r.x+r.w/2, cy=r.y+62;
    ctx.fillStyle=`hsl(${hue},70%,62%)`; ctx.shadowBlur=sel?18:6; ctx.shadowColor=ctx.fillStyle;
    ctx.beginPath(); ctx.moveTo(cx,cy-16); ctx.lineTo(cx-13,cy+12); ctx.lineTo(cx,cy+5); ctx.lineTo(cx+13,cy+12); ctx.closePath(); ctx.fill();
    ctx.shadowBlur=0;
    // name — centered within THIS card (not the screen)
    ctx.textAlign='center'; ctx.fillStyle='#e8e8f0'; ctx.font='bold 20px ui-monospace,monospace';
    ctx.fillText((i+1)+'. '+cls.name, cx, r.y+108);
    // description — LEFT-aligned inside the card padding
    wrapText(cls.desc, r.x+18, r.y+136, r.w-36, 18, '#b4b4d0', 14);
    // stats — horizontal bar charts; fixed rows, aligned across all cards
    const padL=r.x+16, labelW=104, valW=54, barX=padL+labelW, barW=r.w-16*2-labelW-valW, barH=8;
    let sy=r.y+196;
    for(const b of classStatBars(cls)){
      ctx.textAlign='left'; ctx.font='11px ui-monospace,monospace';
      ctx.fillStyle='#8a8aa6'; ctx.fillText(b.label, padL, sy+8);
      ctx.fillStyle='#26264a'; ctx.fillRect(barX, sy+1, barW, barH);                 // track
      ctx.fillStyle=`hsl(${hue},70%,58%)`; ctx.fillRect(barX, sy+1, barW*b.frac, barH); // fill
      ctx.textAlign='right'; ctx.fillStyle='#c8c8e0'; ctx.font='10px ui-monospace,monospace';
      ctx.fillText(b.display, r.x+r.w-14, sy+8);
      sy+=20;
    }
    // active ability (non-numeric) as a text line under the bars
    ctx.textAlign='left'; ctx.font='11px ui-monospace,monospace';
    ctx.fillStyle='#8a8aa6'; ctx.fillText('ACTIVE', padL, sy+8);
    ctx.textAlign='right'; ctx.fillStyle='#c8c8e0'; ctx.fillText(classActiveLabel(cls), r.x+r.w-14, sy+8);
    ctx.textAlign='left';
  });
  // chevrons + position dots (only meaningful with more than one class)
  drawChevron(-1, game.classIdx>0);
  drawChevron(1, game.classIdx<CLASSES.length-1);
  const cardBottom=H/2+CARD_H/2;
  const dn=CLASSES.length, dgap=16, dy=cardBottom+22, dx0=W/2-(dn-1)*dgap/2;
  for(let i=0;i<dn;i++){ ctx.beginPath(); ctx.arc(dx0+i*dgap, dy, i===game.classIdx?4:2.5, 0, TAU);
    ctx.fillStyle = i===game.classIdx?'#e8e8f0':'#44465f'; ctx.fill(); }
  // ability-detail panel for the selected class — explains how its active works (#56)
  const selCls=CLASSES[game.classIdx];
  if(selCls.active && selCls.activeDesc){
    const ph=118, pw=Math.min(700, W-48), px=W/2-pw/2, py=Math.min(dy+16, H-ph-40), pad=16, hue=selCls.hue;
    ctx.fillStyle='rgba(12,12,26,0.92)'; roundRect(px,py,pw,ph,10); ctx.fill();
    ctx.strokeStyle=`hsl(${hue},60%,55%)`; ctx.lineWidth=1.5; roundRect(px,py,pw,ph,10); ctx.stroke();
    const maxCh=selCls.active.maxCharges||1;
    ctx.textAlign='left'; ctx.font='bold 15px ui-monospace,monospace'; ctx.fillStyle=`hsl(${hue},82%,68%)`;
    ctx.fillText('◆ '+selCls.active.name.toUpperCase()+(maxCh>1?'   ·   '+maxCh+' CHARGES':''), px+pad, py+28);
    wrapText(selCls.activeDesc, px+pad, py+52, pw-pad*2, 18, '#c4c4dc', 14);
    ctx.textAlign='left';
  }
  frameFooter();
}
function drawChevron(dir: number, active: boolean){
  const r=chevronRect(dir), cx=r.x+r.w/2, cy=r.y+r.h/2, s=12;
  ctx.strokeStyle = active?'#c8c8e0':'#242440'; ctx.lineWidth=4; ctx.lineCap='round';
  ctx.beginPath();
  if(dir<0){ ctx.moveTo(cx+s*0.5,cy-s); ctx.lineTo(cx-s*0.5,cy); ctx.lineTo(cx+s*0.5,cy+s); }
  else     { ctx.moveTo(cx-s*0.5,cy-s); ctx.lineTo(cx+s*0.5,cy); ctx.lineTo(cx-s*0.5,cy+s); }
  ctx.stroke(); ctx.lineCap='butt';
}
// left-aligned word wrap; x is the left edge.
function wrapText(text: string,x: number,y: number,maxw: number,lineH: number,color: string,size: number){
  ctx.fillStyle=color; ctx.font=size+'px ui-monospace,monospace'; ctx.textAlign='left';
  const words=text.split(' '); let line='', yy=y;
  for(const w of words){ const test=line?line+' '+w:w;
    if(ctx.measureText(test).width>maxw && line){ ctx.fillText(line,x,yy); line=w; yy+=lineH; }
    else line=test; }
  if(line) ctx.fillText(line,x,yy);
}

function roundRect(x: number,y: number,w: number,h: number,r: number){ ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function center(t: string,size: number,color: string,y: number){ ctx.textAlign='center'; ctx.fillStyle=color;
  ctx.font=`bold ${size}px ui-monospace,monospace`; ctx.fillText(t,W/2,y); ctx.textAlign='left'; }
function frameFooter(){ center('v0.2', 12, '#3a3a55', H-24); }
