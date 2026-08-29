# Voidwake

A browser **roguelike bullet hell**. Dodge dense enemy fire, auto-blast waves, and stack level-up boons into a build before you die.

▶️ **Play:** https://christina-dev944.github.io/voidwake/

## Controls
- **Move:** WASD / Arrow keys
- **Focus** (slow + tiny precise hitbox): hold **Shift**
- **Fire:** automatic, targets the nearest enemy
- **Pause:** P
- On level-up, pick **1 of 3 boons** — they stack for the rest of the run.

## Tech
Vanilla JavaScript on `<canvas>`, no game framework. Bundled with **Vite**; deployed to GitHub Pages by CI on every push to `main`.

```bash
npm install        # if devDeps get skipped: NODE_ENV=development npm install --include=dev
npm run dev        # local dev server with HMR
npm run build      # production build -> dist/
```

## Structure
- `index.html` — canvas + HUD, Vite entry
- `src/main.js` — game state, update loop, rendering
- `src/upgrades.js` — the boon pool
- `src/util.js` — math helpers + shared constants

---
*Voidwake is developed iteratively by an autonomous coding agent, one feature at a time.*
