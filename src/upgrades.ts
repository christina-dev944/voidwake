// The roguelike meat: each boon mutates the player when picked.
// `for` gates which weapon can roll it: 'all' | 'bullet' | 'laser'.
// rollUpgrades() (main.js) filters by the player's weapon so a Lancer never gets
// offered bullet-only boons (fire rate, extra projectiles, pierce, bullet speed…).
import type { Upgrade } from './types.js';

export const UPGRADES: Upgrade[] = [
  // --- bullet weapons ---
  { id:'rapid',  for:'bullet', name:'Rapid Fire',   desc:'+30% fire rate',          apply:p=>p.fireRate=Math.max(3,p.fireRate*0.77) },
  // Split Shot is a flat ~2x DPS but the extra shots fan out, so it's harder to focus
  // on a straight-firing class. Homing removes that downside entirely, making it too
  // strong on the Mage — so weight it down to ~1/3 as likely there (#53).
  { id:'multi',  for:'all',    name:'Split Shot',   desc:'+1 projectile / beam',    apply:p=>{p.shots++; p.spread=Math.max(p.spread,0.12);}, weight:p=>p.weapon==='homing'?0.35:1 },
  { id:'heavy',  for:'bullet', name:'Heavy Rounds', desc:'+40% bullet damage',      apply:p=>p.dmg*=1.4 },
  { id:'pierce', for:'bullet', name:'Piercing',     desc:'bullets pierce +1 enemy', apply:p=>p.pierce++ },
  { id:'crit',   for:'bullet', name:'Deadeye',      desc:'+12% crit chance (x2)',   apply:p=>p.crit+=0.12 },
  { id:'velo',   for:'bullet', name:'Velocity',     desc:'+25% bullet speed',       apply:p=>p.bulletSpeed*=1.25 },

  // --- laser (Lancer) — tag marks a class-exclusive boon for the UI badge ---
  { id:'beam',   for:'laser', tag:'LANCER', name:'Beam Amplifier', desc:'+30% beam damage',        apply:p=>p.beamDps*=1.3 },
  { id:'wide',   for:'laser', tag:'LANCER', name:'Wide Lens',      desc:'+6 beam width',           apply:p=>p.beamWidth+=6 },
  { id:'coolant',for:'laser', tag:'LANCER', name:'Efficiency',     desc:'-30% energy drain',       apply:p=>p.heatRate*=0.7 },
  { id:'vent',   for:'laser', tag:'LANCER', name:'Heat Sink',      desc:'+40% cooldown recovery',  apply:p=>p.coolRate*=1.4 },
  { id:'capac',  for:'laser', tag:'LANCER', name:'Capacitor',      desc:'+25% energy capacity',    apply:p=>p.heatMax*=1.25 },

  // --- Mage (Nova) — gated on having the Nova active, so only the Mage rolls these ---
  { id:'novarng', for:'all', tag:'MAGE', req:p=>p.active&&p.active.effect==='nova', name:'Nova Radius',   desc:'+35% nova radius',    apply:p=>{ if(p.active) p.active.radius=(p.active.radius||0)*1.35; } },
  { id:'novacd',  for:'all', tag:'MAGE', req:p=>p.active&&p.active.effect==='nova', name:'Nova Recharge', desc:'-20% nova cooldown',  apply:p=>{ if(p.active) p.active.cooldown=Math.round(p.active.cooldown*0.8); } },

  // --- Reaper (Scythe) — gated on the cone active, so only the Reaper rolls this ---
  { id:'scythe',  for:'all', tag:'REAPER', req:p=>p.active&&p.active.effect==='cone', name:'Scythe Sweep',   desc:'+20% Scythe reach & +15% arc', apply:p=>{ if(p.active){ p.active.range=(p.active.range||0)*1.20; p.active.angle=Math.min(Math.PI*1.2, (p.active.angle||0)*1.15); } } },

  // --- shared (any weapon) ---
  { id:'swift',  for:'all', name:'Swift Feet', desc:'+18% move speed',       apply:p=>{p.speed*=1.18; p.focusSpeed*=1.18;} },
  { id:'vital',  for:'all', name:'Vitality',   desc:'+30 max HP & heal 30',  apply:p=>{p.maxhp+=30; p.hp=Math.min(p.maxhp,p.hp+30);} },
  // #32: both capped to close the Glass Cannon + Bloodpact + Aegis infinite-sustain
  // loop. Leech tops out at +4/kill so trash-farming can't outheal a wave; Aegis
  // i-frames cap at 90f (1.5s) so extra picks stop turning contact damage off.
  // req gates both off the roll once maxed (#32) so a full build stops being offered dead picks.
  { id:'leech',  for:'all', name:'Bloodpact',  desc:'heal 2 HP on kill (max +4)',   req:p=>(p.leech||0)<4, apply:p=>p.leech=Math.min(4,(p.leech||0)+2) },
  { id:'ward',   for:'all', name:'Aegis',      desc:'+longer invuln on hit (cap 1.5s)', req:p=>(p.iframeMax||40)<90,
    // descFn (main.js drawUpgrade) shows the live number: current i-frame window and
    // what this pick brings it to. Frames→seconds at 60fps; delta shrinks near the cap.
    descFn:p=>{ const cur=p.iframeMax||40, nxt=Math.min(90,cur+18), s=(f: number)=>(f/60).toFixed(2)+'s';
      return nxt>cur ? `invuln ${s(cur)} → ${s(nxt)} (+${((nxt-cur)/60).toFixed(2)}s)` : `invuln ${s(cur)} (maxed)`; },
    apply:p=>p.iframeMax=Math.min(90,(p.iframeMax||40)+18) },
];
