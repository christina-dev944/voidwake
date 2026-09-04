// canvas.ts — the drawing surface and its game-unit dimensions.
// Owns the <canvas>, its 2D context, and the logical playfield size W/H that the
// rest of the game draws in. W/H are exported as live bindings; resize() is their
// sole writer, so importers always read the current size.
import { clamp } from './util.js';
import { game } from './state.js';

export const cv = document.getElementById('c') as HTMLCanvasElement;
export const ctx = cv.getContext('2d') as CanvasRenderingContext2D;

// Responsive playfield: the canvas fills the viewport (square, capped), and the
// backing store scales with devicePixelRatio so it stays crisp at any browser zoom.
// W/H are the game-unit size (CSS px); drawing is done in game units via setTransform.
export let W = 720, H = 720;

export function resize(){
  const dpr = window.devicePixelRatio || 1;
  // canvas is centered with the side panel floating over the right margin, so keep
  // symmetric horizontal room for it (~500px) plus the thin top/bottom HUD rows
  const side = Math.max(400, Math.min(window.innerWidth - 500, window.innerHeight - 100, 1200));
  W = side; H = side;
  cv.style.width = side + 'px'; cv.style.height = side + 'px';
  cv.width = Math.round(side * dpr); cv.height = Math.round(side * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // tuck the side panel right up against the centered canvas's right edge, as wide as
  // the right margin allows (up to 300px), and match its height to the canvas so the
  // bottom-pinned controls line up with the bottom of the PLAY area, not the page (#26).
  const sideEl = document.getElementById('side');
  if(sideEl){
    const canvasRight = window.innerWidth/2 + side/2;
    const sideW = Math.round(Math.max(232, Math.min(300, window.innerWidth - canvasRight - 24)));
    sideEl.style.left = Math.round(canvasRight + 14) + 'px'; sideEl.style.right = 'auto';
    sideEl.style.width = sideW + 'px';
    const r = cv.getBoundingClientRect();
    sideEl.style.top = Math.round(r.top) + 'px';
    sideEl.style.height = Math.round(r.height) + 'px';
  }
  if (game && game.player){ game.player.x = clamp(game.player.x, game.player.r, W-game.player.r);
    game.player.y = clamp(game.player.y, game.player.r, H-game.player.r); }
}

addEventListener('resize', resize);
resize();
