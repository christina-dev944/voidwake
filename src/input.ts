// input.ts — shared keyboard state. The keydown/keyup handlers (in main.js) write
// into this map; the sim reads it for movement/focus and the renderer reads it for
// the hold-Shift hitbox indicator. Kept as its own module so both sides share one
// source of truth without a main<->render import cycle.
export const keys: Record<string, boolean> = {};
