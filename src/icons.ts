// Upgrade icons — game-icons.net (CC BY 3.0). The SVGs live as files in ./icons/
// and are bundled inline via Vite's `?raw` import (see src/svg.d.ts). CREDITS.md
// attributes each artist. To add an icon for a new upgrade: drop <name>.svg in
// ./icons/, import it below, and map the upgrade id to it in UPGRADE_ICONS.
import machineGun from './icons/machine-gun.svg?raw';
import splitArrows from './icons/split-arrows.svg?raw';
import heavyBullets from './icons/heavy-bullets.svg?raw';
import slicingArrow from './icons/slicing-arrow.svg?raw';
import bullseye from './icons/bullseye.svg?raw';
import fastArrow from './icons/fast-arrow.svg?raw';
import ringedBeam from './icons/ringed-beam.svg?raw';
import microscopeLens from './icons/microscope-lens.svg?raw';
import overdrive from './icons/overdrive.svg?raw';
import fireRing from './icons/fire-ring.svg?raw';
import sandsOfTime from './icons/sands-of-time.svg?raw';
import scythe from './icons/scythe.svg?raw';
import wingfoot from './icons/wingfoot.svg?raw';
import heartPlus from './icons/heart-plus.svg?raw';
import cutPalm from './icons/cut-palm.svg?raw';
import shieldEchoes from './icons/shield-echoes.svg?raw';
// menu/HUD glyphs — Phosphor Icons (MIT), a traditional UI icon set, for the pause +
// settings GUI (#76). Fill-based like game-icons but in a 256 viewBox (handled per-icon).
import phPlay from './icons/ph-play.svg?raw';
import phGear from './icons/ph-gear.svg?raw';
import phSignOut from './icons/ph-sign-out.svg?raw';
import phX from './icons/ph-x.svg?raw';
import phEye from './icons/ph-eye.svg?raw';
import phSpeaker from './icons/ph-speaker-high.svg?raw';
import phController from './icons/ph-game-controller.svg?raw';

// upgrade id -> raw SVG markup (a 512x512 <svg> with fill="currentColor").
export const UPGRADE_ICONS: Record<string, string> = {
  rapid: machineGun, multi: splitArrows, heavy: heavyBullets, pierce: slicingArrow,
  crit: bullseye, velo: fastArrow, beam: ringedBeam, wide: microscopeLens,
  reactor: overdrive, novarng: fireRing, novacd: sandsOfTime, scythe: scythe,
  swift: wingfoot, vital: heartPlus, leech: cutPalm, ward: shieldEchoes,
};

// menu/GUI icon id -> raw SVG (pause + settings menus, #76). Kept separate from
// UPGRADE_ICONS so the two id namespaces don't collide; iconPath() reads both.
export const UI_ICONS: Record<string, string> = {
  resume: phPlay, settings: phGear, quit: phSignOut, close: phX,
  display: phEye, sound: phSpeaker, controls: phController,
};

// Inline the icon for an HTML card, tagged with a class so CSS can size/tint it.
// currentColor makes the glyph inherit the card's CSS `color`.
export function iconSvg(id: string, cls = 'lu-icon'): string {
  const raw = UPGRADE_ICONS[id];
  if (!raw) return '';
  return raw.replace('<svg', `<svg class="${cls}" aria-hidden="true"`);
}

// Canvas variant (pause boons list, menu glyphs): a Path2D built from every `d` in the
// icon, in its OWN viewBox space (game-icons are 512, Phosphor 256), plus that box size
// so callers can scale to any pixel size. Cached per id.
const _cache: Record<string, { path: Path2D; vb: number } | null> = {};
function build(id: string){
  if (id in _cache) return _cache[id];
  const raw = UPGRADE_ICONS[id] ?? UI_ICONS[id];
  if (!raw) return (_cache[id] = null);
  const path = new Path2D();
  for (const m of raw.matchAll(/ d="([^"]+)"/g)) path.addPath(new Path2D(m[1]));
  const vbm = raw.match(/viewBox="0 0 ([\d.]+)/);
  return (_cache[id] = { path, vb: vbm ? parseFloat(vbm[1]) : 512 });
}
export function iconPath(id: string): Path2D | null { return build(id)?.path ?? null; }
export function iconViewBox(id: string): number { return build(id)?.vb ?? 512; }
