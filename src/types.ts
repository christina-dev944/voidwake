// types.ts — shared entity/state interfaces (#57 tightening phase). One place that
// describes the shape of everything the sim touches, so property access is checked
// across every module instead of each file inferring its own loose object literals.
// No runtime code lives here — types only.

// ---- string-literal unions (compile-time checked, zero runtime cost) ----
export type GameStateName = 'title' | 'classSelect' | 'playing' | 'upgrade' | 'dying' | 'dead';
export type Weapon = 'bullet' | 'homing' | 'laser';
export type PauseButton = 'resume' | 'quit';
export type HazardKind = 'line' | 'circle';
export type ActiveEffect = 'nova' | 'cone';
export type AimModeId = 'nearest' | 'highhp';

// ---- stats / classes ----
// The tunable stat block a class profile overrides onto the base player loadout.
export interface StatBlock {
  dmg: number; fireRate: number; bulletSpeed: number; maxhp: number;
  speed: number; focusSpeed: number; range: number;
  hp?: number; pierce?: number;
}

// An active ability definition (Nova, Scythe). `effect` maps to behavior in
// abilities.ts; the numeric fields are the tunables upgrades mutate on the clone.
export interface ActiveDef {
  name: string; cooldown: number; effect: ActiveEffect;
  radius?: number; dmg?: number; range?: number; angle?: number; maxCharges?: number;
}

// A selectable class/vessel (CLASSES entries).
export interface ClassDef {
  id: string; name: string; desc: string; hue: number; weapon: Weapon;
  stats: Partial<StatBlock>; active: ActiveDef | null;
  range?: number; beamDps?: number; activeDesc?: string;
}

// A roguelike boon (UPGRADES entries).
export interface Upgrade {
  id: string; for: string; name: string; desc: string;
  apply: (p: Player) => void;
  tag?: string;
  req?: (p: Player) => boolean | undefined | null | ActiveDef;
  descFn?: (p: Player) => string;
  // relative roll weight (default 1); higher = more likely to be offered. A function
  // so it can depend on the build, e.g. Split Shot is rarer on homing weapons (#53).
  weight?: (p: Player) => number;
}

// ---- entities ----
// The Lancer beam render/hit state, rebuilt each tick by updateLaser.
export interface Beam { active: boolean; angs: number[]; }

export interface Player {
  x: number; y: number; r: number; hitR: number;
  hp: number; maxhp: number; speed: number; focusSpeed: number;
  lvl: number; xp: number; xpNext: number;
  fireRate: number; fireCd: number; dmg: number; bulletSpeed: number; shots: number; spread: number;
  pierce: number; crit: number; life: number; iframes: number; boostT: number;
  cls: ClassDef; weapon: Weapon; range: number;
  active: ActiveDef | null; activeCd: number; charges: number;
  beamDps: number; beamWidth: number; heatRate: number; coolRate: number; heatMax: number;
  heat: number; depleted: boolean; beam: Beam | null;
  // added by upgrades / runtime
  leech?: number; iframeMax?: number; _invPrev?: boolean;
}

// Shared enemy shape. `boss` discriminates the two arms so boss-only attack-track
// fields are only reachable after an `if(e.boss)` narrow — a grunt can't read .phase.
interface EnemyBase {
  id: number; x: number; y: number; r: number; hp: number; maxhp: number;
  kind: string; move: string; fireMul: number;
  vx: number; vy: number; targetY: number; fireCd: number;
  pattern: string; ang: number; wave: number; hue: number;
  aimCd: number;                // marksman telegraph freeze (0 = free to act)
  telegraph?: boolean;
  mvx?: number; mvy?: number;   // per-tick displacement (auto-aim leading), set each tick
}
export interface NormalEnemy extends EnemyBase { boss: false; }
export interface BossEnemy extends EnemyBase {
  boss: true;
  atkIdx: number; atkIdx2: number; fireCd2: number; phase: number; laserCd: number;
}
export type Enemy = NormalEnemy | BossEnemy;

// Player projectile.
export interface PBullet {
  x: number; y: number; vx: number; vy: number; r: number; dmg: number;
  crit: boolean; pierce: number; ttl: number; homing: boolean; homeDelay: number;
  hitCd: number;            // re-hit lockout after a pierce (0 = can hit)
  hits?: Set<number>;
}

// Enemy projectile.
export interface EBullet { x: number; y: number; vx: number; vy: number; r: number; hue: number; }

// A telegraphed danger zone (marksman/boss laser line; circle stub).
export interface Hazard {
  kind: HazardKind; x: number; y: number; ang: number; width: number;
  tele: number; maxTele: number; active: number; dmg: number; hue: number;
  owner: number | null; track: boolean; pulse: number; pulsePhase: number;
  radius?: number;
}

export interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; hue: number; dim?: number;
}

// Expanding ring/wedge visual (Nova ring + Scythe cone share the animator).
export interface Fx {
  x: number; y: number; r: number; max: number; life: number;
  aim?: number; half?: number;
}

// Fading dash ghost hull.
export interface Afterimage { x: number; y: number; r: number; hue: number; life: number; }

// ---- the single shared game-state object ----
export interface GameState {
  state: GameStateName;
  wave: number; score: number; paused: boolean; dying: number;
  player: Player | null;
  enemies: Enemy[]; pBullets: PBullet[]; eBullets: EBullet[]; particles: Particle[];
  upgrades: string[]; upgradeChoices: Upgrade[]; time: number;
  novaFx: Fx[]; coneFx: Fx[]; afterimages: Afterimage[]; hazards: Hazard[]; eid: number;
  cls: ClassDef; classIdx: number; classScroll: number; hoverIdx: number;
  shake: number; hitStop: number;
  aimIdx: number; aimTarget: Enemy | null; aimLockTime: number;
  pauseHover: PauseButton | null;
  pBulletAlpha: number; beamAlpha: number;
}
