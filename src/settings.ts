// settings.ts — user-adjustable options (#28), persisted to localStorage. The menu
// UI lives in render.ts; this owns the values, their persistence, and pushing them
// into the live game state. First consumers are the bullet/beam opacity sliders that
// keep enemy fire readable (#29/#48) — their game.* fields now default from here.
import { clamp } from './util.js';
import { game } from './state.js';

export interface Settings { bulletOpacity: number; beamOpacity: number; }

// Defaults mirror the historical game.* starting values so a fresh player is unchanged.
const DEFAULTS: Settings = { bulletOpacity: 0.25, beamOpacity: 0.16 };
export const OPACITY_MIN = 0.05;   // never let projectiles go fully invisible
const KEY = 'voidwake.settings';

function load(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s.bulletOpacity === 'number' && typeof s.beamOpacity === 'number')
      return { bulletOpacity: clamp(s.bulletOpacity, OPACITY_MIN, 1), beamOpacity: clamp(s.beamOpacity, OPACITY_MIN, 1) };
  } catch {}
  return { ...DEFAULTS };
}

export const settings: Settings = load();

export function saveSettings(){ try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {} }

// push the current settings into the live game state (the renderer reads game.*).
export function applySettings(){
  game.pBulletAlpha = settings.bulletOpacity;
  game.beamAlpha = settings.beamOpacity;
}

applySettings();   // sync saved values into game state at module load
