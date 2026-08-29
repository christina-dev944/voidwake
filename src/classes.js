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
    desc: 'Balanced auto-fire. No weaknesses, no tricks.',
    hue: 265,
    weapon: 'bullet',
    stats: {},
    active: null,
  },
  {
    id: 'glass',
    name: 'Glass Cannon',
    desc: 'Short range, brutal damage, fragile.',
    hue: 18,
    weapon: 'bullet',
    range: 300,
    stats: { dmg: 24, fireRate: 12, bulletSpeed: 7, maxhp: 70, hp: 70, speed: 4.0, focusSpeed: 1.8 },
    active: null,
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
  { label:'DMG',    get:(s)   => s.dmg },
  { label:'FIRE',   get:(s)   => 60 / s.fireRate },   // shots/sec — higher is faster
  { label:'BULLET', get:(s)   => s.bulletSpeed },
  { label:'HP',     get:(s)   => s.maxhp },
  { label:'MOVE',   get:(s)   => s.speed },
  { label:'RANGE',  get:(s,c) => c.range || RANGE_CAP },
];

export function classStatBars(cls){
  return STAT_DEFS.map(def=>{
    const val = def.get(effective(cls), cls);
    const max = Math.max(...CLASSES.map(c => def.get(effective(c), c)), 1);
    const display = def.label==='FIRE'  ? val.toFixed(1)+'/s'
                  : def.label==='RANGE' ? (cls.range ? String(cls.range) : '∞')
                  : String(Math.round(val*10)/10);
    return { label:def.label, frac: Math.max(0.04, Math.min(1, val/max)), display };
  });
}

// Non-numeric extras rendered as a text line under the bars.
export const classActiveLabel = cls => cls.active ? cls.active.name : '—';
