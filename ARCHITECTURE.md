# ARCHITECTURE.md

How Spout works internally. Read this before making changes to rendering, fog, the CRT shader, or the game loop.

---

## Rendering Pipeline

The game renders in two distinct layers that compose on screen:

```
┌─────────────────────────────────────────────────┐
│  React DOM Layer (HUD.tsx, ShopOverlay.tsx)      │  ← HTML elements on top
│  position: absolute over the canvas              │
├─────────────────────────────────────────────────┤
│  Phaser Canvas (single <canvas>)                 │
│                                                  │
│  ┌─ terrainImage (Phaser.Image) ──────────────┐ │
│  │  CPU-rendered terrain pixels via ImageData  │ │  ← Bottom: terrain texture
│  └─────────────────────────────────────────────┘ │
│  ┌─ graphics (Phaser.Graphics) ───────────────┐ │
│  │  Bombs → Ores → Beacons → Items → Ship →   │ │  ← Top: all game objects
│  │  Particles                                  │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌─ CRT PostFX Pipeline (GPU shader) ─────────┐ │
│  │  Applied AFTER all Phaser rendering:        │ │  ← Final pass: post-processing
│  │  Glitch → Barrel → Chromatic → FOG →        │ │
│  │  Scanlines → Vignette → Noise               │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Key Rules

1. **Fog lives ONLY in the CRT shader.** It is a GPU post-process applied to the entire viewport. Do NOT add fog logic to terrain rendering, the graphics layer, or any CPU-side code. The shader's `smoothstep` fog uniformly darkens everything — terrain, ship, ores, particles, beacons — based on distance from the ship's screen position.

2. **The CRT shader processes the entire Phaser camera output.** It sees one flat image (terrain + graphics composited). It cannot selectively fog some objects and not others. Everything in the Phaser canvas is fogged equally.

3. **React HUD elements are NOT affected by the CRT shader.** They are HTML DOM elements layered on top of the canvas via CSS. Health bars, ore counters, shop overlay, etc. are always fully visible regardless of fog, barrel distortion, or scanlines.

4. **Terrain is re-rendered every frame.** `TerrainSystem.renderToTexture()` writes 512×512 pixels to an `ImageData` buffer, copies it to a Phaser `CanvasTexture`, and refreshes. This is brute-force but works because the viewport is small.

---

## CRT Shader (CRTPostFx.ts) — Critical Rules

The CRT shader is a `Phaser.Renderer.WebGL.Pipelines.PostFXPipeline`. It has strict usage rules:

### Uniform Setting Pattern

**You CANNOT call `set1f()` from `update()` or any code outside the render phase.** The WebGL context is not bound, and it will crash with `Cannot read properties of undefined (reading 'set1f')`.

Instead, the class stores uniform values as TypeScript fields and pushes them to the GPU in `onPreRender()`:

```typescript
// CORRECT: Store values, apply in onPreRender
class CRTPostFx extends PostFXPipeline {
  private _fogRadius = 0;

  setFogParams(radius: number) { this._fogRadius = radius; }   // called from update()
  onPreRender() { this.set1f('uFogRadius', this._fogRadius); } // called by Phaser
}
```

```typescript
// WRONG: Will crash at runtime
class CRTPostFx extends PostFXPipeline {
  setFogParams(radius: number) { this.set1f('uFogRadius', radius); } // ← CRASH
}
```

### Shader Uniforms

| Uniform | Default | Set by | Purpose |
|---------|---------|--------|---------|
| `uTime` | 0 | `updateTime(time)` | Drives scanline animation, glitch noise |
| `uGlitch` | 0 | `setGlitch(amount)` | 0 = no glitch, 0.6 = heavy tearing/noise |
| `uShipScreenX/Y` | 0.5 | `setFogParams(...)` | Ship position in UV space (0-1) |
| `uFogRadius` | 0 | `setFogParams(...)` | Fog visibility radius. 0 = no fog (full vis) |
| `uFogSoftness` | 0 | `setFogParams(...)` | Width of the fog gradient edge |

**When `uFogRadius = 0`, fog is disabled entirely** (the shader skips the fog calculation). This is the default state before any `setFogParams` call, ensuring the screen is visible on startup.

### Registration

The pipeline is registered in `GameScene.create()`:
```typescript
renderer.pipelines.addPostPipeline('CRTPostFx', CRTPostFx);
this.cameras.main.setPostPipeline('CRTPostFx');
```

It's wrapped in try/catch so the game works without WebGL (Canvas fallback, no CRT effects).

---

## Fog System

Fog is a radial visibility mask centered on the ship. Everything outside the radius is black.

### How It Works

The shader computes: `fog = smoothstep(fogRadius, fogRadius - fogSoftness, dist)` where `dist` is the UV-space distance from the current pixel to the ship's screen position.

- `dist < fogRadius - fogSoftness` → fully lit (fog = 1)
- `dist > fogRadius` → fully dark (fog = 0)
- Between → smooth gradient

### Constants (in `types/game.ts`)

- `FOG_RADIUS_DEFAULT = 0.22` — base visibility (~113px of 512px viewport)
- `FOG_SOFTNESS = 0.18` — wide gradient (only ~20px of fully-clear area)

### Flashlight Interaction

The Flashlight is a passive item that overrides `FOG_RADIUS_DEFAULT`:
- Level 1: `fogRadius = 0.30`
- Level 2: `fogRadius = 0.45`
- Level 3: `fogRadius = 1.50` (effectively no fog)

`GameScene.update()` queries `items.getFlashlightStats()` every frame and passes the result to `crt.setFogParams()`.

### Intro Sequence

During the intro (before `gameStarted`), `updateIntro()` animates the fog radius:
- Phase 0 (0–500ms): `fogRadius = 0.001` (blackout)
- Phase 1 (500–3000ms): `fogRadius = 0.04 → 0.08` (ship glow)
- Phase 2 (3000–5000ms): `fogRadius = 0.08 → 0.22` (environment reveal)
- Phase 3 (5000ms+): `fogRadius = 0.22` (normal)

---

## Coordinate Systems

Three coordinate systems are used:

| System | Range | Used by |
|--------|-------|---------|
| **World** | `(0..2048, 0..4096)` | Ship position, ore positions, terrain data |
| **Screen** | `(0..512, 0..512)` | Phaser Graphics drawing, pixel positions on canvas |
| **UV** | `(0..1, 0..1)` | CRT shader fog calculations |

### Conversions

```
screen = world - camera
UV = screen / viewport_size
```

Where camera = `(cam.x, cam.y)` = top-left corner of the viewport in world space.

The ship is always centered: `cam.x = ship.x - GAME_WIDTH/2`, `cam.y = ship.y - GAME_HEIGHT/2`.

### Y-Axis Direction

Phaser uses **Y-down** (positive Y = downward). The ship spawns at `WORLD_HEIGHT/2 = 2048`. Going "up" means decreasing Y. Score = `startY - ship.y` (positive when ascending).

---

## React ↔ Phaser Communication

### Phaser → React (every frame)

`GameScene.notifyState()` calls the `onStateChange` callback with a full state snapshot. This fires every frame (60fps). React 18 batches these updates internally.

### React → Phaser (on user action)

Shop actions (`buy`, `upgrade`, `equip`, `unequip`) are wired as callbacks on the scene. React calls `gameSceneRef.current.onShopBuy(itemId)` etc. These are set up in `GameScene.create()`.

### Positioning HUD Over Canvas

The Phaser canvas scales via `Phaser.Scale.FIT`. The actual canvas bounds on screen are computed via `getBoundingClientRect()` in `GameCanvas.tsx` and passed to HUD as `canvasBounds`. All HUD element positions are computed from these bounds.

---

## Game Loop (GameScene.update)

```
update(time)
├── if !gameStarted
│   ├── updateIntro(time)          // animate CRT fog + glitch
│   ├── read input
│   ├── if intro ready + input → gameStarted = true
│   └── else → renderFrame() + return
│
├── set CRT fog params (flashlight or default)
├── read input
├── if gameOver + R → restart()
├── if TAB → toggle shop
├── if P → debug ore cheat
├── if shopOpen → renderFrame() + return
│
├── if !gameOver
│   ├── physics (movement, collision, bounce)
│   ├── death check
│   ├── health regen
│   ├── energy regen (base + dynamo)
│   ├── particle spawning (thrust)
│   ├── bomb collection
│   ├── ore collection
│   ├── near-shop check
│   ├── item input (keys 1-3)
│   ├── item update (hook, aura, rocket, carve)
│   ├── enemy update (AI, movement, bullets, tethers)
│   ├── enemy combat (rocket hits, aura damage, thruster damage)
│   ├── enemy death events → particle explosions
│   └── score update
│
├── bomb explosions update
├── particle update
├── camera update
├── renderFrame()
└── notifyState()
```

---

## Systems Overview

| System | Responsibility | State owned |
|--------|---------------|-------------|
| **TerrainSystem** | Cave generation, terrain pixel rendering, rest area management | `PixelBuffer` (2048×4096), rest area positions |
| **PhysicsSystem** | Ship movement, gravity, collision, bounce | None (mutates `ShipState` directly) |
| **ParticleSystem** | Particle pool, thrust/explosion spawning, particle-terrain collision | 500 `Grain` objects + free list |
| **OreSystem** | Ore placement, rendering, collection | Ore array, `collected[]` counts |
| **ItemSystem** | Item activation, cooldowns, effects (hook/aura/rocket/carve) | Grapple/rocket/carve state, cooldown timestamps |
| **ShopSystem** | Inventory, upgrades, equip slots | `PlayerInventory` (owned items, equipped slots) |
| **BombSystem** | Bomb placement, multi-step explosions, chain reactions | Bomb array, active explosions |
| **EnemySystem** | Enemy/obstacle spawning, AI, combat, rendering | Leech/Sentry/Grabber/BulletTower/MissileTower/MagmaTower arrays, death/impact events |
| **CameraSystem** | Viewport position (hard follow) | `(x, y)` offset |

---

## Item System Pattern

### Active Items (hook, aura, rocket, carve)

Activated via key press (keys 1-3 mapped to equip slots). Each has:
- **Stats lookup**: `getItemStats(id, level)` from `items.ts`, cast to the specific stat type
- **Energy cost**: deducted on activation (hook, rocket) or drained per second (aura, carve)
- **Cooldown**: timestamp-based for hook and rocket
- **Toggle**: aura and carve are toggle-on/toggle-off

### Passive Items (dynamo, flashlight)

Always active when equipped. Queried by GameScene each frame:
- `getDynamoStats()` → energy regen bonus
- `getFlashlightStats()` → fog radius override

**Items must be both owned AND equipped** to have any effect. Owning an item without equipping it does nothing.

---

## Energy System

Energy is stored as `{ current: number }` — a mutable ref object passed by reference to `ItemSystem.handleInput()` and `update()`. Items read and deduct energy within the same call.

- Base regen: `ENERGY_REGEN = 2` per second
- Dynamo bonus: `+3/5/8` per second at levels 1/2/3
- Max: `MAX_ENERGY = 100`
- Costs: hook 12-18, rocket 18-22, aura 8-12/sec, carve 12-18/sec

---

## Ore Indexing Convention

`OreSystem.collected` is **1-indexed**: `collected[0]` is unused, tiers 1-4 are at indices 1-4.

`ShopSystem` costs are **0-indexed**: `[tier1, tier2, tier3, tier4]`.

The bridge: `GameScene.onShopBuy` passes `oreSystem.collected.slice(1)` (strips index 0) to the shop, then writes results back with offset.

---

## Enemy System (EnemySystem.ts)

All enemies/obstacles are **red** (`0xff2222`) **with glow**. HP-based damage, no regen. Lives in `EnemySystem.ts`.

### Combat

| Method | DPS | Notes |
|--------|-----|-------|
| **Thruster** | 2 DPS | Two check zones: ship center + 12px behind, 30px radius each |
| **Aura** | 0.5 DPS | Damages all enemies within aura pull range |
| **Rocket** | Instant kill | Kills on blast radius contact |

Death events are queued in `deathEvents[]` and drained by GameScene to spawn explosion particles.

### Enemy Types

| Type | HP | Behavior |
|------|-----|----------|
| **Wall Leech** (25 spawned) | 120 | Dormant on walls → chases at 0.8px/frame when player is within 80px → attaches on contact (35% speed, pulls to wall) |
| **Cave Sentry** (12 spawned) | 90 | Patrols near home → fires bullets (15% dmg) every 2s when player is within 120px |
| **Wall Grabber** (18 spawned) | 80 | Static on walls → shoots tether at passing player (70px) → grabs and pulls for 1.5s (15% dmg), 5s cooldown |
| **Bullet Tower** (10 spawned) | 100 | Sleeps at 50% opacity → wakes when player enters 100px → rotates and fires 8-bullet bursts (5% dmg each, 0.25s invincibility) |
| **Missile Tower** (8 spawned) | 100 | Sleeps → wakes at 150px → fires slow homing missiles (50% dmg) every 3s. Missiles are indestructible, blink before expiring at 5s. Triangle shape with fill animation (empty→full = cooldown→ready) |
| **Magma Tower** (10 spawned) | 80 | Wall-mounted blob cluster (brain-like). 5 ammo blobs, fires every 1.5s at 100px range. Blobs splat on walls/player, spawning red erosion particles that eat terrain over time. 10% dmg on player hit. Goes dormant when out of ammo |

### Visual Effects

- **Hit flash**: all enemies flash white (`0xffffff`) for 6 frames when taking damage. Stored as `hitFlash` counter on each enemy, decayed each frame.
- **Red impact sparks**: projectile hits on the player spawn small red burst particles (14 particles, glow halo).
- **Red erosion particles**: `Grain.red` flag makes particles render in red tones. Spawned at varying intensities when projectiles hit walls or on bomb explosions. These particles erode terrain via `terrain.damage()` on contact.
- **Event queues**: `deathEvents[]`, `blobImpactEvents[]`, `projectileWallHits[]` — drained by GameScene each frame to spawn appropriate particle effects.

### Spawning

`scatter(terrain)` places all enemies during `create()`/`restart()`. Each type has its own placement logic:
- **Leeches/Grabbers/Magma Towers**: wall-adjacent pixels (solid pixel with open neighbor)
- **Sentries/Bullet Towers/Missile Towers**: open space with surrounding terrain nearby
- All skip spawn area and rest areas, enforce min-distance between same type

### GameScene Integration

After `items.update()`, GameScene calls:
1. `enemies.update(ship, terrain, time)` — AI, movement, bullets, tethers, blob updates
2. `enemies.checkRocketHit(x, y, blastRadius)` — if rocket is active
3. `enemies.applyAuraDamage(shipX, shipY, auraRadius)` — if aura is active
4. `enemies.applyThrusterDamage(shipX, shipY, shipAngle)` — if thrusting
5. `enemies.drainDeathEvents()` → spawn explosion particles
6. `enemies.drainBlobImpacts()` → spawn red blob splat erosion particles
7. `enemies.drainProjectileWallHits()` → spawn small red splat erosion particles

Rendering happens in `renderFrame()` after ores, before beacons.

---

## Common Pitfalls

### "Everything is black"
Fog radius is 0 or near-0. Check that `setFogParams` is being called with a valid radius > 0. The CRT shader defaults to `uFogRadius = 0` which means no fog (full visibility), but if you explicitly set it to a tiny value like 0.001, the smoothstep will black out almost everything.

### "CRT set1f crashes"
You called `set1f()` outside `onPreRender()`. Store the value and let `onPreRender()` push it to the GPU.

### "Fog only affects terrain, not ores/ship"
You added fog to `TerrainSystem.renderToTexture()` instead of the CRT shader. The terrain texture is one Phaser Image; the graphics layer (ores, ship, particles) is a separate Phaser Graphics object. CPU-side fog on terrain doesn't affect the graphics layer. The CRT shader processes both layers together.

### "Double fog / too dark"
Fog is applied in two places. It should ONLY be in the CRT shader. Remove any fog from `renderToTexture()`, and do not add a `drawFogOverlay()` or similar.

### "UI elements are behind the fog"
The CRT shader processes the entire Phaser canvas. React DOM elements sit on top of the canvas in CSS stacking order and are never affected by the shader. If you draw UI text/elements using Phaser Graphics, they WILL be fogged. UI text/labels go in React (HUD.tsx), not in Phaser.

### "Intro is black forever"
Check that `introStartTime` is being set. If `time` on the first frame is 0 and `introStartTime` is also 0, elapsed = 0 and phase 0 runs indefinitely... except time advances each frame, so this should resolve. More likely: `renderToTexture` is being called twice (once in `updateIntro`, once in `renderFrame`) and the second call overwrites the first with different fog params.

### "Item has no effect even though I own it"
Items must be equipped to a slot (1-3). `getFlashlightStats()` and `getDynamoStats()` check both `getLevel(id) > 0` AND `isEquipped(id)`.
