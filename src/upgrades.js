// The roguelike meat: each boon mutates the player when picked.
// `for` gates which weapon can roll it: 'all' | 'bullet' | 'laser'.
// rollUpgrades() (main.js) filters by the player's weapon so a Lancer never gets
// offered bullet-only boons (fire rate, extra projectiles, pierce, bullet speed…).
export const UPGRADES = [
  // --- bullet weapons ---
  { id:'rapid',  for:'bullet', name:'Rapid Fire',   desc:'+30% fire rate',          apply:p=>p.fireRate=Math.max(3,p.fireRate*0.77) },
  { id:'multi',  for:'bullet', name:'Split Shot',   desc:'+1 projectile',           apply:p=>{p.shots++; p.spread=Math.max(p.spread,0.12);} },
  { id:'heavy',  for:'bullet', name:'Heavy Rounds', desc:'+40% bullet damage',      apply:p=>p.dmg*=1.4 },
  { id:'pierce', for:'bullet', name:'Piercing',     desc:'bullets pierce +1 enemy', apply:p=>p.pierce++ },
  { id:'crit',   for:'bullet', name:'Deadeye',      desc:'+12% crit chance (x2)',   apply:p=>p.crit+=0.12 },
  { id:'velo',   for:'bullet', name:'Velocity',     desc:'+25% bullet speed',       apply:p=>p.bulletSpeed*=1.25 },

  // --- laser (Lancer) ---
  { id:'beam',   for:'laser',  name:'Beam Amplifier', desc:'+30% beam damage',        apply:p=>p.beamDps*=1.3 },
  { id:'wide',   for:'laser',  name:'Wide Lens',      desc:'wider beam',              apply:p=>p.beamWidth+=5 },
  { id:'coolant',for:'laser',  name:'Coolant',        desc:'-30% heat buildup',       apply:p=>p.heatRate*=0.7 },
  { id:'vent',   for:'laser',  name:'Heat Sink',      desc:'+40% cooldown recovery',  apply:p=>p.coolRate*=1.4 },
  { id:'capac',  for:'laser',  name:'Capacitor',      desc:'+25% overheat threshold', apply:p=>p.heatMax*=1.25 },

  // --- shared (any weapon) ---
  { id:'swift',  for:'all', name:'Swift Feet', desc:'+18% move speed',       apply:p=>{p.speed*=1.18; p.focusSpeed*=1.18;} },
  { id:'vital',  for:'all', name:'Vitality',   desc:'+30 max HP & heal 30',  apply:p=>{p.maxhp+=30; p.hp=Math.min(p.maxhp,p.hp+30);} },
  { id:'leech',  for:'all', name:'Bloodpact',  desc:'heal 2 HP on kill',     apply:p=>p.leech=(p.leech||0)+2 },
  { id:'ward',   for:'all', name:'Aegis',      desc:'+longer invuln on hit', apply:p=>p.iframeMax=(p.iframeMax||40)+25 },
];
