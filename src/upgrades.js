// The roguelike meat: each boon mutates the player when picked.
export const UPGRADES = [
  { id:'rapid',  name:'Rapid Fire',    desc:'+30% fire rate',            apply:p=>p.fireRate=Math.max(3,p.fireRate*0.77) },
  { id:'multi',  name:'Split Shot',    desc:'+1 projectile',             apply:p=>{p.shots++; p.spread=Math.max(p.spread,0.12);} },
  { id:'heavy',  name:'Heavy Rounds',  desc:'+40% damage',               apply:p=>p.dmg*=1.4 },
  { id:'pierce', name:'Piercing',      desc:'bullets pierce +1 enemy',   apply:p=>p.pierce++ },
  { id:'swift',  name:'Swift Feet',    desc:'+18% move speed',           apply:p=>{p.speed*=1.18; p.focusSpeed*=1.18;} },
  { id:'vital',  name:'Vitality',      desc:'+30 max HP & heal 30',      apply:p=>{p.maxhp+=30; p.hp=Math.min(p.maxhp,p.hp+30);} },
  { id:'crit',   name:'Deadeye',       desc:'+12% crit chance (x2 dmg)', apply:p=>p.crit+=0.12 },
  { id:'velo',   name:'Velocity',      desc:'+25% bullet speed',         apply:p=>p.bulletSpeed*=1.25 },
  { id:'leech',  name:'Bloodpact',     desc:'heal 2 HP on kill',         apply:p=>p.leech=(p.leech||0)+2 },
  { id:'ward',   name:'Aegis',         desc:'+longer invuln on hit',     apply:p=>p.iframeMax=(p.iframeMax||40)+25 },
];
