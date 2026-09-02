// Headless browser stub for running the built game in Node (no real DOM/canvas).
//
// The game draws to a <canvas>, reads keyboard events, and runs on
// requestAnimationFrame — none of which exist in Node. Rather than launch a real
// browser (Chromium needs system libs the CI/container lacks), we fake just enough
// of the browser for the bundle to boot and its simulation loop to run:
//   - a no-op canvas 2D context (a Proxy that swallows every draw call),
//   - captured event listeners so a test can synthesize key presses,
//   - a virtual clock so the fixed-timestep loop actually ticks (synchronous frame
//     calls all share one real millisecond, so real time never advances).
//
// installDomStub() sets the globals and returns handles to drive and inspect a run.
// Call it BEFORE importing the game bundle.

export function installDomStub() {
  const listeners = {};                                  // type -> [handler]
  const add = (type, fn) => { (listeners[type] ??= []).push(fn); };
  const fire = (type, ev) => { (listeners[type] || []).forEach(fn => fn(ev)); };

  let ctxCalls = 0;                                       // count draw calls as a "did we render" signal
  const ctx = new Proxy({}, {
    get(_, p) {
      if (p === 'measureText') return () => ({ width: 0 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'getImageData') return () => ({ data: [] });
      if (p === 'canvas') return canvasEl;
      return typeof p === 'string' ? (() => { ctxCalls++; }) : undefined;
    },
    set() { return true; },                               // ignore fillStyle=, lineWidth=, etc.
  });

  const mkEl = (extra = {}) => ({
    style: {}, textContent: '', addEventListener: add,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 720, height: 720, right: 720, bottom: 720 }),
    width: 720, height: 720, ...extra,
  });
  const canvasEl = mkEl();
  const els = { c: canvasEl, side: mkEl(), 'h-wave': mkEl(), 'h-lvl': mkEl(), 'h-score': mkEl() };

  // virtual clock: the loop only ticks the sim once ~16.7ms of "time" has passed,
  // so we advance it a frame's worth per rendered frame.
  let clock = 1000;
  let rafCb = null;

  globalThis.window = globalThis;
  globalThis.devicePixelRatio = 1;
  globalThis.innerWidth = 1400;
  globalThis.innerHeight = 900;
  globalThis.addEventListener = add;
  globalThis.performance = { now: () => clock };
  globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
  globalThis.localStorage = {
    _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); },
  };
  globalThis.document = {
    getElementById: (id) => els[id] ?? mkEl(),
    addEventListener: add, createElement: () => mkEl(),
    querySelectorAll: () => [], querySelector: () => null, body: mkEl(),
  };
  // Vite prepends a modulepreload polyfill to the production bundle that touches
  // these on load; the game itself never uses them.
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });

  // run n animation frames, advancing the virtual clock so each frame ticks the sim.
  const advanceFrames = (n, msPerFrame = 1000 / 60) => {
    for (let i = 0; i < n && rafCb; i++) {
      clock += msPerFrame;
      const cb = rafCb; rafCb = null;
      cb(clock);
    }
  };

  return { listeners, fire, els, advanceFrames, get ctxCalls() { return ctxCalls; } };
}
