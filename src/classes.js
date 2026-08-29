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

// Fixed-order stat rows for the class-select cards. Same rows for every class so
// they line up column-wise for at-a-glance comparison. [label, value] pairs.
export function classStats(cls){
  const s = Object.assign({}, BASE, cls.stats || {});
  return [
    ['DMG',    String(s.dmg)],
    ['FIRE',   (60 / s.fireRate).toFixed(1) + '/s'],
    ['BULLET', String(s.bulletSpeed)],
    ['HP',     String(s.maxhp)],
    ['MOVE',   String(s.speed)],
    ['RANGE',  cls.range ? String(cls.range) : '∞'],
    ['ACTIVE', cls.active ? cls.active.name : '—'],
  ];
}
