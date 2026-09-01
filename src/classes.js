// classes.js — selectable player classes (issue #19 framework + #20 Glass Cannon).
// A class defines a stat profile, a weapon behavior, and an optional active
// ability. newPlayer() in main.js applies `stats` over the base loadout, reads
// `weapon` when firing, and drives `active` through the cooldown framework.
//
//   stats   : partial overrides merged onto the base player (see newPlayer).
//   weapon  : 'bullet' (default projectiles). Future: 'laser', 'homing'.
//   range   : (optional) max bullet travel in px before it fizzles — short-range
//             classes trade reach for power. Omitted = unlimited (full screen).
//   active  : null, or { name, cooldown, trigger(game, p) }. cooldown is in
//             sim ticks (60/sec). trigger runs the effect; the framework handles
//             the cooldown gate + HUD. No active-bearing class ships yet — Mage
//             (#24) and Time-stop (#25) are the first to use it.

// Base player loadout — single source of truth, shared by newPlayer() (main.js)
// and the class-select stat readout so displayed numbers can never drift.
export const BASE = { dmg: 10, fireRate: 10, bulletSpeed: 9, maxhp: 100, speed: 4.4, focusSpeed: 2.0, range: 0 };

export const CLASSES = [
  {
    id: 'vanguard',
    name: 'Vanguard',
    desc: 'Balanced and basic auto fire.',
    hue: 265,
    weapon: 'bullet',
    stats: {},
    active: null,
  },
  {
    id: 'reaper',
    name: 'Reaper',
    desc: 'High damage short range, very fragile. Scythe carves a cone of death in your aim.',
    hue: 18,
    weapon: 'bullet',
    range: 300,
    // HP nerfed 70→55 (#42): now that it has a strong active, it leans harder into glass.
    stats: { dmg: 24, fireRate: 12, bulletSpeed: 7, maxhp: 55, hp: 55, speed: 4.3, focusSpeed: 2.0 },
    // Scythe: Nova-style burst but a SECTOR aimed at the target, not a full ring.
    // `angle` = full central angle (rad); range = reach. Resolved in main.js applyActive.
    // maxCharges 3 (#51): hold up to 3 casts; charges regen one at a time off `cooldown`.
    // range 200 -> 300 (+50%, #51 feedback).
    active: { name: 'Scythe', cooldown: 360, effect: 'cone', range: 300, angle: 1.0, dmg: 60, maxCharges: 3 },
  },
  {
    id: 'lancer',
    name: 'Lancer',
    desc: 'Continuous piercing beam. Mind the heat.',
    hue: 190,
    weapon: 'laser',
    beamDps: 60,    // damage/sec dealt to EVERY enemy the beam line crosses
    stats: { maxhp: 90, hp: 90, speed: 4.2, dmg: 15 }, // dmg shown on card = indicative
    active: null,
  },
  {
    id: 'mage',
    name: 'Mage',
    desc: 'Homing bolts, starts with +1 pierce. Nova clears bullets and enemies around you.',
    hue: 285,
    weapon: 'homing',
    // active `effect` is resolved to a function in main.js (applyActive) to avoid a
    // circular import; cooldown is in sim ticks (60/s). 480 = 8s.
    active: { name: 'Nova', cooldown: 480, effect: 'nova', radius: 160, dmg: 45 },
    stats: { dmg: 7, fireRate: 12, bulletSpeed: 4.5, maxhp: 85, hp: 85, speed: 4.2, pierce: 1 },
  },
];

export const DEFAULT_CLASS = CLASSES[0];
export const classById = id => CLASSES.find(c => c.id === id) || DEFAULT_CLASS;

// Numeric stats shown as horizontal bars on the class-select cards. Fixed order
// so rows line up across cards for comparison; each bar is normalized against the
// max value across all classes, so the bars stay meaningful as classes are added.
const RANGE_CAP = 720; // unlimited range renders as a full bar; finite is a fraction
const effective = cls => Object.assign({}, BASE, cls.stats || {});
const STAT_DEFS = [
  { label:'DMG',          get:(s)   => s.dmg },
  { label:'FIRE RATE',    get:(s)   => 60 / s.fireRate },   // shots/sec — higher is faster
  { label:'BULLET SPEED', get:(s)   => s.bulletSpeed },
  { label:'HP',           get:(s)   => s.maxhp },
  { label:'MOVE SPEED',   get:(s)   => s.speed },
  { label:'RANGE',        get:(s,c) => c.range || RANGE_CAP },
];

export function classStatBars(cls){
  const laser = cls.weapon === 'laser';
  return STAT_DEFS.map(def=>{
    // laser has no discrete shots/bullet-speed — show beam-appropriate readouts
    if(laser && def.label==='FIRE RATE')    return { label:'FIRE RATE',    frac:1, display:'beam' };
    if(laser && def.label==='BULLET SPEED') return { label:'BULLET SPEED', frac:1, display:'hitscan' };
    if(laser && def.label==='DMG'){
      const dps=cls.beamDps||0;
      return { label:'DMG', frac:1, display:dps+' dps' };
    }
    const val = def.get(effective(cls), cls);
    const max = Math.max(...CLASSES.map(c => def.get(effective(c), c)), 1);
    const display = def.label==='FIRE RATE' ? val.toFixed(1)+'/s'
                  : def.label==='RANGE'     ? (cls.range ? String(cls.range) : '∞')
                  : String(Math.round(val*10)/10);
    return { label:def.label, frac: Math.max(0.04, Math.min(1, val/max)), display };
  });
}

// Non-numeric extras rendered as a text line under the bars.
export const classActiveLabel = cls => cls.active ? cls.active.name : '—';
