# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Roadmap

Read **`TO-DO.md`** at project root for the full feature plan, build order, and current status. Check it at session start.

Read **`ARCHITECTURE.md`** for the full rendering pipeline, coordinate systems, CRT shader details, and common pitfalls. **Read this before touching rendering, fog, CRT, or camera code.**

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server on http://localhost:3000
npm run build        # TypeScript check + Vite production build (output: /dist)
npm run preview      # Preview production build
```

No test framework, linter, or formatter is configured.

## Architecture

Spout is a cave-flying game built with **React 18 + Phaser 3 + TypeScript**, bundled with Vite. It's entirely client-side with no backend, database, or auth.

### Two-Layer Design

**React UI Layer** (`src/components/`): Menu, HUD, shop overlay, and the canvas wrapper that bootstraps Phaser. React elements are DOM overlays positioned on top of the Phaser canvas — they are NOT affected by the CRT shader.

**Phaser Game Layer** (`src/game/`): All game logic lives here in a systems-based architecture. `GameScene` is the main scene that orchestrates all systems each frame.

### Rendering Pipeline (CRITICAL)

```
TerrainSystem.renderToTexture → CanvasTexture (CPU pixels, NO fog)
      ↓
Phaser Graphics → bombs, ores, beacons, items, ship, particles
      ↓
CRT PostFX Shader (GPU) → glitch, barrel, chromatic, FOG, scanlines, vignette
      ↓
React DOM → HUD, shop overlay (unaffected by shader)
```

**Fog lives ONLY in the CRT shader (`CRTPostFx.ts`).** It is a GPU post-process applied uniformly to the entire Phaser canvas. Do NOT add fog logic to `TerrainSystem.renderToTexture()`, Phaser Graphics drawing, or any other CPU-side code. This has caused multiple black-screen bugs when duplicated.

### CRT Shader Rules

The CRT shader (`CRTPostFx.ts`) is a Phaser `PostFXPipeline`. Its uniforms **cannot be set from `update()` or any code outside the render phase** — the WebGL context is not bound and `set1f()` will crash. Instead, store values as class fields and push them in `onPreRender()`. See `ARCHITECTURE.md` for the full pattern.

### React ↔ Phaser Communication

`GameCanvas.tsx` creates the Phaser instance. `GameScene` exposes callbacks (`onStateChange`, `onShopBuy`, `onShopUpgrade`, `onShopEquip`, `onShopUnequip`) that React components consume. React triggers game actions via direct method calls on the scene.

### Systems (`src/game/systems/`)

Each game subsystem is an independent class:
- **TerrainSystem** — Procedural cave generation via ConvChain + blur smoothing, scaled 8× from 256×512 to 2048×4096, with carved shafts, chambers, and rest areas. Renders terrain pixels to a CanvasTexture each frame (no fog).
- **PhysicsSystem** — Ship movement, gravity, collision with bounce-back
- **ParticleSystem** — Thrust particles using object pool (500 particles)
- **OreSystem** — Ore spawning by tier (1-4) with min-distance constraints. `collected[]` is 1-indexed.
- **ItemSystem** — Equipment activation, cooldowns, effects. Passive items (dynamo, flashlight) are queried by GameScene each frame.
- **ShopSystem** — Inventory, upgrades, equip slots (keys 1-3). Items must be both owned AND equipped to work.
- **BombSystem** — Bomb placement and multi-step explosions with chain reactions
- **CameraSystem** — Simple hard-follow camera (x, y offset)

### Key Files

- `src/types/game.ts` — Core interfaces and game constants (world size 2048×4096, gravity, max speed, fog params, etc.)
- `src/game/data/items.ts` — Item definitions, stats per level, ore costs (6 items × 3 upgrade levels)
- `src/game/effects/CRTPostFx.ts` — CRT post-processing shader (fog, barrel distortion, scanlines, etc.)
- `src/game/entities/Ship.ts` — Ship state and pixel-level triangle geometry
- `src/game/utils/PixelBuffer.ts` — Terrain pixel data storage (Uint8Array, HP per cell)
- `src/game/utils/ConvChain.ts` — Markov chain algorithm for cave pattern generation

## Design Rules

- **UI text/labels go in the React overlay** (HUD.tsx), not in Phaser graphics. Phaser handles game-world rendering only. Anything drawn in Phaser Graphics will be affected by the CRT shader (fog, barrel distortion, etc.).
- **Fog is GPU-only** — in the CRT shader. Never duplicate fog in terrain rendering or graphics code.
- All enemies and obstacles are **red with glow**. The shop/rest area color is `#44ff88` green.
- Rest area terrain carve shape must match the beacon outline (rounded rect, not ellipse).
- Shop direction marker and collection popups are React elements positioned via screen-ratio coords passed from GameScene.

## Coordinate Systems

| System | Range | Used by |
|--------|-------|---------|
| **World** | `(0..2048, 0..4096)` | Ship, ores, terrain, camera |
| **Screen** | `(0..512, 0..512)` | Phaser Graphics drawing |
| **UV** | `(0..1, 0..1)` | CRT shader fog |

Conversions: `screen = world - camera`, `UV = screen / 512`. Y-axis is down (going up = decreasing Y).

## Tech Stack

- TypeScript 5.5 (strict mode, `react-jsx` transform)
- React 18 with hooks (no class components)
- Phaser 3.80 (AUTO renderer, WebGL preferred for CRT effects)
- Vite 5.4 with @vitejs/plugin-react
