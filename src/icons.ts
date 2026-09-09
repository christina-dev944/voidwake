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
// menu/HUD glyphs (game-icons.net, CC BY 3.0) — pause + settings GUI (#76)
import playButton from './icons/play-button.svg?raw';
import gears from './icons/gears.svg?raw';
import exitDoor from './icons/exit-door.svg?raw';
import crossMark from './icons/cross-mark.svg?raw';
import eyeball from './icons/eyeball.svg?raw';
import speaker from './icons/speaker.svg?raw';
import consoleController from './icons/console-controller.svg?raw';

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
  resume: playButton, settings: gears, quit: exitDoor, close: crossMark,
  display: eyeball, sound: speaker, controls: consoleController,
};

// Inline the icon for an HTML card, tagged with a class so CSS can size/tint it.
// currentColor makes the glyph inherit the card's CSS `color`.
export function iconSvg(id: string, cls = 'lu-icon'): string {
  const raw = UPGRADE_ICONS[id];
  if (!raw) return '';
  return raw.replace('<svg', `<svg class="${cls}" aria-hidden="true"`);
}

// Canvas variant (pause boons list): a Path2D built from every `d` in the icon,
// in the source 512x512 space. Cached per id; callers scale/translate/fill.
const _paths: Record<string, Path2D | null> = {};
export function iconPath(id: string): Path2D | null {
  if (id in _paths) return _paths[id];
  const raw = UPGRADE_ICONS[id] ?? UI_ICONS[id];
  if (!raw) return (_paths[id] = null);
  const path = new Path2D();
  for (const m of raw.matchAll(/ d="([^"]+)"/g)) path.addPath(new Path2D(m[1]));
  return (_paths[id] = path);
}
export const ICON_VIEWBOX = 512;
