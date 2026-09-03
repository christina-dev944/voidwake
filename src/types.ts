// types.ts — shared entity/state interfaces (#57 tightening phase). One place that
// describes the shape of everything the sim touches, so property access is checked
// across every module instead of each file inferring its own loose object literals.
// No runtime code lives here — types only.

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
  name: string; cooldown: number; effect: string;
  radius?: number; dmg?: number; range?: number; angle?: number; maxCharges?: number;
}

// A selectable class/vessel (CLASSES entries).
export interface ClassDef {
  id: string; name: string; desc: string; hue: number; weapon: string;
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
  cls: ClassDef; weapon: string; range: number;
  active: ActiveDef | null; activeCd: number; charges: number;
  beamDps: number; beamWidth: number; heatRate: number; coolRate: number; heatMax: number;
  heat: number; depleted: boolean; beam: Beam | null;
  // added by upgrades / runtime
  leech?: number; iframeMax?: number; _invPrev?: boolean;
}

export interface Enemy {
  id: number; x: number; y: number; r: number; hp: number; maxhp: number;
  boss: boolean; kind: string; move: string; fireMul: number;
  vx: number; vy: number; targetY: number; fireCd: number;
  pattern: string; ang: number; wave: number; hue: number;
  telegraph?: boolean;
  mvx?: number; mvy?: number;   // per-tick displacement (auto-aim leading)
  aimCd?: number;               // marksman telegraph freeze
  // boss-only tracks
  atkIdx?: number; atkIdx2?: number; fireCd2?: number; phase?: number; laserCd?: number;
}

// Player projectile.
export interface PBullet {
  x: number; y: number; vx: number; vy: number; r: number; dmg: number;
  crit: boolean; pierce: number; ttl: number; homing: boolean; homeDelay: number;
  hitCd?: number; hits?: Set<number>;
}

// Enemy projectile.
export interface EBullet { x: number; y: number; vx: number; vy: number; r: number; hue: number; }

// A telegraphed danger zone (marksman/boss laser line; circle stub).
export interface Hazard {
  kind: string; x: number; y: number; ang: number; width: number;
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
  state: string;
  wave: number; score: number; paused: boolean; dying: number;
  player: Player | null;
  enemies: Enemy[]; pBullets: PBullet[]; eBullets: EBullet[]; particles: Particle[];
  upgrades: string[]; upgradeChoices: Upgrade[]; time: number;
  novaFx: Fx[]; coneFx: Fx[]; afterimages: Afterimage[]; hazards: Hazard[]; eid: number;
  cls: ClassDef; classIdx: number; classScroll: number; hoverIdx: number;
  shake: number; hitStop: number;
  aimIdx: number; aimTarget: Enemy | null; aimLockTime: number;
  pauseHover: string | null;
  pBulletAlpha: number; beamAlpha: number;
}
