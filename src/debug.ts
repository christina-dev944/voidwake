// debug.ts — an F3-style developer overlay (#74). Toggled by game.debug (F3 in main.ts).
// A translucent top-left readout of live runtime info for tuning/QA: frame rate, entity
// counts, wave/time, and the player's position + stats. Draw-only — it reads `game` and
// never mutates the sim. FPS is sampled from the rAF timestamps (loop.ts calls sampleFps)
// because the fixed-step tick count isn't the display refresh rate.
import { ctx } from './canvas.js';
import { game } from './state.js';

let lastT = 0, frameMs = 0;
// Exponential moving average of the real inter-frame time, so the FPS reading is stable
// instead of jittering every frame. Fed the rAF timestamp once per rendered frame.
export function sampleFps(now: number){
  if(lastT){ const dt=now-lastT; frameMs += (dt-frameMs)*0.1; }
  lastT = now;
}

export function drawDebug(){
  const p=game.player;
  const fps = frameMs>0 ? 1000/frameMs : 0;
  const lines: string[] = [
    `VOIDWAKE debug  ·  ${game.state}${game.paused?' (paused)':''}`,
    `${fps.toFixed(0)} fps   ${frameMs.toFixed(1)} ms/frame`,
    `wave ${game.wave}   time ${(game.time/60).toFixed(1)}s   score ${game.score}`,
    `enemies ${game.enemies.length}   pBullets ${game.pBullets.length}   eBullets ${game.eBullets.length}`,
    `particles ${game.particles.length}   hazards ${game.hazards.length}   nova ${game.novaFx.length}`,
  ];
  if(p){
    lines.push(`pos ${p.x.toFixed(0)},${p.y.toFixed(0)}   hp ${Math.max(0,Math.ceil(p.hp))}/${p.maxhp}   iframes ${p.iframes}`);
    lines.push(`lvl ${p.lvl}   xp ${Math.round(p.xp)}/${p.xpNext}`);
    lines.push(`${p.weapon}   dmg ${p.weapon==='laser'?p.beamDps+'dps':Math.round(p.dmg)}   spd ${p.speed.toFixed(1)}`);
    lines.push(`shots ${p.shots}   pierce ${p.pierce}   crit ${Math.round(p.crit*100)}%`);
    if(p.weapon==='laser') lines.push(`heat ${(p.heat/p.heatMax*100).toFixed(0)}%${p.depleted?' DEPLETED':''}`);
    if(p.active) lines.push(`active ${p.active.name}   ch ${p.charges}/${p.active.maxCharges||1}   cd ${(p.activeCd/60).toFixed(1)}s`);
  }

  ctx.save();
  ctx.font='11px ui-monospace,monospace'; ctx.textAlign='left'; ctx.textBaseline='top';
  const lh=15, pad=8; let maxw=0;
  for(const l of lines) maxw=Math.max(maxw, ctx.measureText(l).width);
  const bw=maxw+pad*2, bh=lines.length*lh+pad*2;
  ctx.fillStyle='rgba(6,6,11,0.74)'; ctx.fillRect(6,6,bw,bh);
  ctx.strokeStyle='rgba(124,247,255,0.25)'; ctx.lineWidth=1; ctx.strokeRect(6.5,6.5,bw,bh);
  ctx.fillStyle='#7cf7ff';
  lines.forEach((l,i)=>ctx.fillText(l, 6+pad, 6+pad+i*lh));
  ctx.restore();
}
