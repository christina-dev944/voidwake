// state.ts — the single shared game-state object plus cross-session persistence.
// Everything reads and mutates `game`; keeping it in one module (rather than
// buried in main.js) makes the source of truth for a run explicit.
import { UPGRADES } from './upgrades.js';
import { DEFAULT_CLASS } from './classes.js';
import type { GameState } from './types.js';

export const game: GameState = {
  state: 'title', // title | classSelect | playing | upgrade | dying | dead
  wave: 0, score: 0, paused:false, dying: 0, // dying = frames to hold the world before the game-over screen (#40)
  player: null, enemies: [], pBullets: [], eBullets: [], particles: [],
  upgrades: [], upgradeChoices: [], time: 0, novaFx: [], coneFx: [], afterimages: [], hazards: [], eid: 0,
  cls: DEFAULT_CLASS, classIdx: 0, classScroll: 0, hoverIdx: -1,
  shake: 0, hitStop: 0, // game-feel: screen-shake magnitude (px) + frames to freeze the sim (#5)
  aimIdx: 0,            // auto-aim target mode (index into AIM_MODES) — persists across runs (#35)
  aimTarget: null,      // currently-locked auto-aim target — gives HIGH-HP mode stickiness (#49)
  aimLockTime: 0,       // game.time when the current HIGH-HP target was locked (dwell timer, #49)
  mouseX: 360, mouseY: 360, // cursor in game units for MANUAL aim mode (#11); updated on pointermove
  pauseHover: null,     // which pause button the cursor is over ('resume'|'quit'|null) (#36)
  // player bullets are dimmed so enemy fire stays readable (#29). Default 25%;
  // a settings slider will drive this once the settings menu (#28) lands.
  pBulletAlpha: 0.25,
  // the Lancer beam is a bright, always-on line, so its max opacity is capped
  // BELOW a discrete player bullet's — the ever-present beam sits quieter and
  // enemy fire stays readable (#48). Core = this; glow = a fraction of it.
  beamAlpha: 0.16,
};

// which upgrade categories each weapon draws from (besides 'all')
export const WEAPON_UPGRADES: Record<string, string[]> = { bullet:['bullet'], homing:['bullet'], laser:['laser'] };

// persistent best run across sessions (#8) — best wave and best score, each kept
// independently so a long run and a high-scoring run both leave their mark.
const BEST_KEY='voidwake.best';
interface Best { wave: number; score: number; }
function loadBest(): Best { try{ const b=JSON.parse(localStorage.getItem(BEST_KEY) || 'null');
  if(b && typeof b.wave==='number' && typeof b.score==='number') return b; }catch{} return {wave:0,score:0}; }
export const best=loadBest();
export function recordBest(){ let changed=false;
  if(game.wave>best.wave){ best.wave=game.wave; changed=true; }
  if(game.score>best.score){ best.score=game.score; changed=true; }
  if(changed){ try{ localStorage.setItem(BEST_KEY, JSON.stringify(best)); }catch{} } }

// id → display name, for showing the run's acquired boons in the pause menu (#31)
export const UP_NAME = Object.fromEntries(UPGRADES.map(u=>[u.id,u.name]));
