// entities.ts — factories and spawning: the player, per-wave upgrade rolls, enemy
// archetypes, and wave/enemy/boss construction. Owns ENEMY_TYPES and the spawn
// weighting; the sim just calls startWave / rollUpgrades and reads game.enemies.
import { rand } from './util.js';
import { BASE, DEFAULT_CLASS } from './classes.js';
import { UPGRADES } from './upgrades.js';
import { game, WEAPON_UPGRADES } from './state.js';
import * as D from './difficulty.js';
import { W, H } from './canvas.js';

export function newPlayer(cls=DEFAULT_CLASS) {
  const p = {
    x: W/2, y: H*0.75, r: 12, hitR: 4,
    hp: BASE.maxhp, maxhp: BASE.maxhp, speed: BASE.speed, focusSpeed: BASE.focusSpeed,
    lvl: 1, xp: 0, xpNext: 8,
    fireRate: BASE.fireRate, fireCd: 0, dmg: BASE.dmg, bulletSpeed: BASE.bulletSpeed, shots: 1, spread: 0,
    pierce: 0, crit: 0.05, life: 0, iframes: 0, boostT: 0,
    cls, weapon: cls.weapon||'bullet', range: cls.range||0,
    // active clone (so upgrades don't mutate the class def). `charges` starts full;
    // `activeCd` recharges the next charge when below max. maxCharges defaults to 1 (#51).
    active: cls.active ? {...cls.active} : null, activeCd: 0,
    charges: cls.active ? (cls.active.maxCharges||1) : 0,

    beamDps: cls.beamDps||0, beamWidth: 6, heatRate: 1.2, coolRate: 1.6, heatMax: 100,
    heat: 0, depleted: false, beam: null,
  };
  if (cls.stats) Object.assign(p, cls.stats); // class profile overrides base
  return p;
}

export function rollUpgrades() {
  const cats = WEAPON_UPGRADES[game.player.weapon] || []; // boons valid for this weapon
  const pool = UPGRADES.filter(u => (u.for==='all' || cats.includes(u.for)) && (!u.req || u.req(game.player)));
  const out = [];
  for (let i=0;i<3 && pool.length;i++) out.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
  game.upgradeChoices = out;
}

// ---- spawning ----
export function startWave(n) {
  game.wave = n;
  if(n%10===0){ game.enemies.push(makeEnemy(D.bossHp(n), n, true)); return; } // every 10th wave = a solo boss (#3)
  const count = D.enemyCount(n);
  for (let i=0;i<count;i++) game.enemies.push(makeEnemy(D.enemyHp(n), n, false));
}

// Enemy archetypes (#2). Each tweaks size, bulk (hpMul), speed, fire pattern pool,
// fire cadence (fireMul, <1 = faster), colour and movement style. `minWave` gates
// when a type starts appearing; `weight` biases the random pick, so grunts stay the
// backbone while tougher/faster types trickle in as a run deepens.
const ENEMY_TYPES = {
  grunt:  { r:16, hpMul:1.0,  spd:1.0,  patterns:['aimed','spread','spiral','ring'], move:'drift', fireMul:1.0, hue:()=>rand(180,320), minWave:1, weight:3 },
  weaver: { r:14, hpMul:0.8,  spd:1.15, patterns:['spread','aimed'],                 move:'weave', fireMul:1.0, hue:()=>rand(150,190), minWave:2, weight:2 },
  darter: { r:12, hpMul:0.45, spd:1.6,  patterns:['aimed'],                          move:'dart',  fireMul:0.7, hue:()=>rand(40,62),  minWave:4, weight:2 },
  brute:  { r:26, hpMul:2.6,  spd:0.55, patterns:['ring','spiral'],                  move:'drift', fireMul:1.3, hue:()=>rand(344,360), minWave:6, weight:1 },
  // marksman telegraphs a laser line at the player, then fires an instant hitscan
  // beam (#46). `telegraph` routes it to the hazard system instead of enemyShoot.
  marksman:{ r:15, hpMul:0.9, spd:0.7,  patterns:['aimed'], move:'drift', fireMul:1, hue:()=>rand(300,318), minWave:4, weight:2, telegraph:true },
};
function pickEnemyType(wave){
  const pool=[];
  for(const [id,d] of Object.entries(ENEMY_TYPES)) if(wave>=d.minWave) for(let i=0;i<d.weight;i++) pool.push(id);
  return pool[Math.floor(Math.random()*pool.length)] || 'grunt';
}

function makeEnemy(hp, wave, boss) {
  const x = rand(60, W-60), y = rand(-140,-40);
  if(boss){
    return { id:game.eid++, x:W/2, y:-100, r:34, hp, maxhp:hp, boss:true, kind:'boss', move:'drift', // enter from top-center (#3)
      vx:rand(-0.6,0.6), vy:rand(0.5,1.1), targetY:130,
      fireCd:rand(30,90), pattern:'spiral', ang:0, wave, hue:350, fireMul:1,
      atkIdx:0, atkIdx2:0, fireCd2:70, phase:1, laserCd:220 };  // two attack-track cursors/timers + phase + laser timer (#3)
  }
  const t = pickEnemyType(wave), d = ENEMY_TYPES[t];
  const HP = Math.max(1, Math.round(hp * d.hpMul));
  return {
    id: game.eid++,
    x, y, r: d.r, hp:HP, maxhp:HP, boss:false, kind:t, move:d.move, fireMul:d.fireMul,
    telegraph: !!d.telegraph,   // carry the type flag onto the instance (marksman laser, #46)
    vx: rand(-0.6,0.6)*d.spd, vy: rand(0.5,1.1)*d.spd,
    targetY: rand(60, H*0.42),
    fireCd: d.telegraph ? rand(80,130) : rand(30,90), // marksman waits longer before its first shot
    pattern: d.patterns[Math.floor(rand(0,d.patterns.length))],
    ang: 0, wave, hue: d.hue(),
  };
}
