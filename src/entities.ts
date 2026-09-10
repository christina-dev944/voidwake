// entities.ts — factories and spawning: the player, per-wave upgrade rolls, enemy
// archetypes, and wave/enemy/boss construction. Owns ENEMY_TYPES and the spawn
// weighting; the sim just calls startWave / rollUpgrades and reads game.enemies.
import { rand } from './util.js';
import { BASE, DEFAULT_CLASS } from './classes.js';
import { UPGRADES } from './upgrades.js';
import { game, WEAPON_UPGRADES } from './state.js';
import * as D from './difficulty.js';
import { W, H } from './canvas.js';
import type { ClassDef, Player, Enemy, Upgrade } from './types.js';

export function newPlayer(cls: ClassDef = DEFAULT_CLASS): Player {
  const p: Player = {
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
  const p = game.player; if(!p) return;
  const cats = WEAPON_UPGRADES[p.weapon] || []; // boons valid for this weapon
  const pool = UPGRADES.filter(u => (u.for==='all' || cats.includes(u.for)) && (!u.req || u.req(p)));
  const weights = pool.map(u => u.weight ? u.weight(p) : 1); // per-boon roll bias (#53)
  const out: Upgrade[] = [];
  for (let i=0;i<3 && pool.length;i++){
    const idx = weightedPick(weights);
    out.push(pool[idx]); pool.splice(idx,1); weights.splice(idx,1); // sample without replacement
  }
  game.upgradeChoices = out;
}
// weighted index pick over parallel weights[]; falls back to the last on rounding drift.
function weightedPick(weights: number[]): number {
  let r = Math.random() * weights.reduce((a,b)=>a+b,0);
  for (let i=0;i<weights.length;i++){ r-=weights[i]; if(r<=0) return i; }
  return weights.length-1;
}

// ---- spawning ----
export function startWave(n: number) {
  game.wave = n;
  if(n%10===0){ game.enemies.push(makeEnemy(D.bossHp(n), n, true)); return; } // every 10th wave = a solo boss (#3)
  const count = D.enemyCount(n);
  for (let i=0;i<count;i++) game.enemies.push(makeEnemy(D.enemyHp(n), n, false));
}

// Enemy archetypes. Each type owns ONE signature attack + a distinct colour, so a
// threat reads at a glance (#79) — no more shared random pattern pool. `pattern` names
// the bullet formation it fires (aimed/spread/ring; specials use telegraph/zone/spinner
// instead). `shape`/`bulletR`/`bulletSpdMul` (#68) give the bolts a distinct look/feel;
// `fireMul` (>1 = slower) tunes cadence. `minWave` gates entry, `weight` biases spawns.
interface EnemyType { r:number; hpMul:number; spd:number; pattern:string; move:string; fireMul:number; hue:()=>number; minWave:number; weight:number; telegraph?:boolean; zone?:boolean; spinner?:boolean; shape?:string; bulletR?:number; bulletSpdMul?:number; bulletCount?:number; }
const ENEMY_TYPES: Record<string, EnemyType> = {
  // grunt — the baseline: plain AIMED round bolts, cyan. fireMul 0.87 = ~50% faster
  // than its old 1.3 cadence (#79 follow-up).
  grunt:  { r:16, hpMul:1.0,  spd:1.0,  pattern:'aimed',  move:'drift', fireMul:0.87, hue:()=>rand(185,205), minWave:1, weight:3 },
  // weaver — the SPREAD type, green: sweeps sideways and fans a 3-shot arc. fireMul 1.75
  // ≈ half the grunt's fire rate (#79 follow-up).
  weaver: { r:14, hpMul:0.8,  spd:1.15, pattern:'spread', move:'weave', fireMul:1.75, hue:()=>rand(110,140), minWave:2, weight:2, bulletCount:3 },
  // brute — slow, beefy AIMED tank, red. Shares the aimed formation with the grunt but
  // reads totally differently: big, red, sluggish (#79 — keeps its normal aimed fire).
  brute:  { r:26, hpMul:2.6,  spd:0.55, pattern:'aimed',  move:'drift', fireMul:1.3,  hue:()=>rand(348,360), minWave:6, weight:1 },
  // marksman telegraphs a laser line at the player, then fires an instant hitscan
  // beam (#46). `telegraph` routes it to the hazard system instead of enemyShoot.
  marksman:{ r:15, hpMul:0.9, spd:0.7,  pattern:'aimed', move:'drift', fireMul:1, hue:()=>rand(300,318), minWave:4, weight:2, telegraph:true },
  // mortar lobs a telegraphed circular zone at the player's position, forcing a
  // reposition rather than a bullet-dodge (#61). Slow + a bit beefy so the zone
  // pressure is the threat; `zone` routes it to telegraphCircle instead of a shot.
  mortar: { r:18, hpMul:1.4, spd:0.6,  pattern:'aimed', move:'drift', fireMul:1, hue:()=>rand(24,40),  minWave:8, weight:2, zone:true },
  // archer (#68): fragile chaser that snipes fast ARROW bolts, yellow — the "fast" niche
  // (replaces the retired darter). Arrows read as precise threats, not clutter.
  archer: { r:13, hpMul:0.55, spd:1.25, pattern:'aimed', move:'dart',  fireMul:0.85, hue:()=>rand(48,64),  minWave:4, weight:2, shape:'arrow', bulletR:4, bulletSpdMul:1.55 },
  // spinner (#79 rework): a spinning emitter that slings fast diamond bolts off
  // TANGENTIALLY, biased horizontal, so they sweep sideways as it rotates. `spinner`
  // routes it to spinnerShoot. Fast cadence (fireMul 1.0) + 25% faster bullets.
  spinner:{ r:15, hpMul:1.1,  spd:0.9,  pattern:'aimed', move:'weave', fireMul:1.0,  hue:()=>rand(212,232), minWave:7, weight:2, spinner:true, shape:'diamond', bulletR:6, bulletSpdMul:1.25 },
  // warden (#68): slow tank that rolls out slow RINGS of big ORB bullets, purple — a
  // creeping wall to weave. Big orbs = big hitboxes.
  warden: { r:24, hpMul:2.2,  spd:0.45, pattern:'ring',  move:'drift', fireMul:1.5,  hue:()=>rand(280,300), minWave:9, weight:1, shape:'orb', bulletR:9, bulletSpdMul:0.6 },
};
function pickEnemyType(wave: number): string {
  const pool: string[]=[];
  for(const [id,d] of Object.entries(ENEMY_TYPES)) if(wave>=d.minWave) for(let i=0;i<d.weight;i++) pool.push(id);
  return pool[Math.floor(Math.random()*pool.length)] || 'grunt';
}

function makeEnemy(hp: number, wave: number, boss: boolean): Enemy {
  const x = rand(60, W-60), y = rand(-140,-40);
  if(boss){
    return { id:game.eid++, x:W/2, y:-100, r:34, hp, maxhp:hp, boss:true, kind:'boss', move:'drift', // enter from top-center (#3)
      vx:rand(-0.6,0.6), vy:rand(0.5,1.1), targetY:130, aimCd:0,
      fireCd:rand(30,90), pattern:'spiral', ang:0, wave, hue:350, fireMul:1,
      atkIdx:0, atkIdx2:0, fireCd2:70, phase:1, laserCd:220 };  // two attack-track cursors/timers + phase + laser timer (#3)
  }
  const t = pickEnemyType(wave), d = ENEMY_TYPES[t];
  const HP = Math.max(1, Math.round(hp * d.hpMul));
  return {
    id: game.eid++,
    x, y, r: d.r, hp:HP, maxhp:HP, boss:false, kind:t, move:d.move, fireMul:d.fireMul,
    telegraph: !!d.telegraph,   // carry the type flag onto the instance (marksman laser, #46)
    zone: !!d.zone,             // mortar zone AoE (#61)
    spinner: !!d.spinner,       // spinner tangential emitter (#79)
    shape: d.shape, bulletR: d.bulletR, bulletSpdMul: d.bulletSpdMul, bulletCount: d.bulletCount,  // bullet look/feel/count overrides (#68/#79)
    aimCd: 0,
    vx: rand(-0.6,0.6)*d.spd, vy: rand(0.5,1.1)*d.spd,
    targetY: rand(60, H*0.42),
    fireCd: (d.telegraph||d.zone||d.spinner) ? rand(80,130) : rand(30,90), // marksman/mortar/spinner wind up before their first attack
    pattern: d.pattern,         // each type has one signature formation now (#79)
    ang: 0, wave, hue: d.hue(),
  };
}
