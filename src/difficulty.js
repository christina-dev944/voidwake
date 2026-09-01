// difficulty.js — central late-game scaling curve (issue #1).
// v0.1 problem: HP grew linearly while player DPS grows multiplicatively via
// boons, so a good run coasted (first playtest reached wave 17 unthreatened).
// Fix: danger COMPOUNDS. Early waves stay gentle; HP, bullet speed, enemy
// aggression and air-density all ramp harder the deeper you descend.
// Everything here is one place to tune — balance is iterative (see issue #1).
import { rand } from './util.js';

// How many enemies spawn in a wave. Mild acceleration past wave 10, hard-capped
// so we never wall the screen (or the framerate) with bodies — late-game threat
// is meant to come from HP + bullets, not sheer count.
export function enemyCount(wave) {
  const accel = Math.floor(Math.max(0, wave - 10) * 0.4);
  return Math.min(34, 3 + Math.floor(wave * 1.6) + accel);
}

// Enemy HP: linear base * compounding multiplier. The 1.055^wave factor is the
// core fix — at wave 17 enemies are ~1.8x tankier than v0.1, and the gap widens
// every wave after, so runaway player DPS gets caught.
export function enemyHp(wave) {
  return Math.round((16 + wave * 6) * Math.pow(1.055, wave));
}

// Boss HP = 90x a normal enemy on that wave (#3), so it scales with the run.
export function bossHp(wave) {
  return enemyHp(wave) * 90;
}

// Enemy bullet speed. v0.1's 0.05/wave was nearly flat; 0.12/wave keeps late
// bullets genuinely hard to dodge, capped at 7.5 so it never becomes unfair.
export function bulletSpeed(wave) {
  return Math.min(7.5, 2.2 + wave * 0.12);
}

// Frames between an enemy's shots. Ramps down (more aggressive) with wave, with
// a hard floor so it never machine-guns. NOTE: this also fixes a latent v0.1 bug
// where `rand(45,90) - wave` went negative past wave ~45 → firing every frame.
export function fireCooldown(wave, boss) {
  if (boss) return 12;
  return Math.max(18, Math.round(70 - wave * 1.4 + rand(-8, 8)));
}

// Air density: bullet counts grow with wave so patterns get denser late, which
// is the real dodging pressure once HP alone can't threaten a fed player.
// NOTE (#30): the old discrete steps (ring +1 at w12, spread +2 at w12/w22)
// landed right after the wave-10 boss and stacked on the same wave, reading as a
// hard cliff at wave 11-12. Both now ramp gradually in +1 increments, staggered
// off that band, so density creeps up instead of jumping.
export function ringCount(wave, boss) {
  return (boss ? 18 : 10) + Math.floor(Math.max(0, wave - 3) / 6); // +1 @ w9, w15, w21...
}
export function spreadCount(wave) {
  return 5 + Math.floor(Math.max(0, wave - 8) / 6); // 5 -> 6 @ w14 -> 7 @ w20 ...
}
export function aimedExtra(wave) {
  // non-boss aimed shots gain flanking bullets deep in a run
  return wave >= 18 ? 2 : wave >= 9 ? 1 : 0;
}
