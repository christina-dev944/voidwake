// Headless smoke test: boot the *built* game bundle in a stubbed DOM, drive it
// through a real run (title -> class select -> playing), tick the simulation, and
// assert it actually advances without throwing. Guards against a refactor silently
// breaking the game even though typecheck + build stay green.
//
// Requires `npm run build` first (it loads dist/assets/index-*.js). CI builds before
// running this; locally run `npm run build && npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { installDomStub } from './dom-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(here, '..', 'dist', 'assets');

function newestBundle() {
  let files;
  try { files = readdirSync(assetsDir); }
  catch { throw new Error(`dist/ not found — run \`npm run build\` before the tests (looked in ${assetsDir})`); }
  const bundles = files.filter(f => /^index-.*\.js$/.test(f));
  assert.ok(bundles.length, `no built bundle in ${assetsDir} — run \`npm run build\` first`);
  return pathToFileURL(join(assetsDir, bundles.sort().at(-1)));
}

test('built game boots, starts a run, and the simulation advances', async () => {
  const dom = installDomStub();
  globalThis.window.__VOIDWAKE_DEBUG = true;   // opt in to the game's test seam

  // importing the bundle runs its top-level code against the stub (listeners, first frame)
  await import(newestBundle());
  dom.advanceFrames(5);                        // render the title screen a few frames

  const game = globalThis.window.__voidwake?.game;
  assert.ok(game, 'game object not exposed — test seam missing (window.__voidwake)');
  assert.equal(game.state, 'title');

  // Enter -> class select, Enter -> lock in a class and start the run
  dom.fire('keydown', { key: 'Enter' });
  assert.equal(game.state, 'classSelect', 'Enter at title should open class select');
  dom.fire('keydown', { key: 'Enter' });
  assert.equal(game.state, 'playing', 'Enter at class select should start a run');
  assert.equal(game.wave, 1);
  assert.ok(game.player, 'a player should be spawned');
  assert.ok(game.enemies.length > 0, 'wave 1 should spawn enemies');

  // hold "move right" and let the fixed-timestep sim run ~2 seconds of frames
  const startX = game.player.x;
  dom.fire('keydown', { key: 'd' });
  const framesBefore = dom.ctxCalls;
  dom.advanceFrames(120);

  // the simulation actually advanced (not just one tick)
  assert.ok(game.time > 100, `sim should tick each frame (time=${game.time})`);
  assert.ok(game.player.x > startX, 'holding "d" should move the ship right');
  assert.ok(game.pBullets.length > 0, 'the ship should auto-fire bullets');
  assert.ok(game.player.hp > 0, 'the player should still be alive after 2s');
  assert.ok(dom.ctxCalls > framesBefore, 'the render loop should keep drawing each frame');

  // HUD is wired to the live state (also covers the number->textContent fix)
  assert.equal(dom.els['h-wave'].textContent, '1', 'HUD wave should reflect game state');
});
