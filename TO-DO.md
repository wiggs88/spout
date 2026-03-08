# TO-DO.md

Roadmap and feature plan for Spout. Read this at the start of each session.

---

## Status Key
- [ ] Not started
- [~] In progress
- [x] Complete

---

## 1. Intro Narrative / Game Boot

- [x] Remove the current controls start screen
- [x] Black screen → ship "loads up": contour lines flicker/jitter on and off, gradually assembling into the final triangular shape
- [x] Once ship is assembled, the environment around it starts flickering into view
- [x] Environment is dark — only a small area around the ship is visible (ties into fog system)
- [x] No controls text shown during intro — the game teaches through play

**Complete.** 4-phase intro via CRT shader (fog + glitch) in `GameScene.updateIntro()`. Ship assembly uses pixel flickering with jitter in `renderFrame()`.

---

## 2. Fog / Visibility System

- [x] Ship has a base visibility radius — only terrain/objects within that radius are visible
- [x] Soft gradient fade at the edge of the visibility circle (no hard cutoff)
- [x] Everything outside the radius is black/hidden
- [ ] Visibility is blocked by walls — light doesn't pass through solid terrain
- [x] This replaces the current full-visibility rendering

**Implementation notes:** This is a core rendering change. The terrain texture render (`TerrainSystem.renderToTexture`) currently draws all visible pixels. The fog system needs to mask pixels based on distance from ship, with a smooth falloff. Consider a radial gradient mask applied per-pixel during the terrain render pass, or a separate fog overlay texture. Wall occlusion (light doesn't go through walls) is the hard part — may need raycasting or a simpler distance-from-ship-through-open-space check.

**Future idea:** The CRT barrel distortion currently warps the full frame, but with fog limiting visibility to a small center area, the round "fishbowl" feel is lost. Consider gradually increasing barrel distortion as the viewport shrinks (more fog = more warp) so the visible area still feels round. Conversely, as the flashlight expands visibility, reduce the warp back to normal. This is a visual polish item — test when fog + flashlight are both working.

---

## 3. Flashlight Item

- [x] New equippable item: Flashlight (passive, always on when equipped)
- [x] 3 upgrade levels:
  - Lvl 1: 2× base visibility radius
  - Lvl 2: 4× base visibility radius
  - Lvl 3: Full visibility (current game behavior, no fog)
- [x] Light emits from the ship, fades at max distance (soft falloff like fog)
- [ ] Light is blocked by walls/rocks — it illuminates surfaces it can reach, not through them
- [x] Works in concert with the fog system — flashlight expands the fog radius

**Basic flashlight complete.** Implemented in `items.ts`, fog radius scales per level. Wall occlusion (light blocked by terrain) is a future polish item.

---

## 4. UI Updates

- [x] Ore collection popup: "+1" floats up with ore color, black pill background, 1.8s linger
- [x] Ore events passed from GameScene → React via `oreCollects` state field
- [x] Shop rework: terminal-aesthetic card UI with dashed borders and + corners
  - Two tabs: SHOP (green, buy/upgrade) and SHIP (white, equip toggle)
  - 3×2 card grid, level indicator boxes, ORE BALANCE footer
  - ESC key added to close shop (alongside TAB)
- [x] Reduced from 4 ore tiers to 3: brown (squares), yellow (triangles), blue (rhombuses)
  - Red tier removed, costs rescaled across all items

**Complete.** Shop in `ShopOverlay.tsx`, popups in `HUD.tsx` `OreCollectPopups` component.

---

## 5. Obstacles & Enemies

All enemies/obstacles are **RED** and **glow**. Player destroys them with rockets, thruster, or repel aura. All use HP-based damage (no regen). Implemented in `EnemySystem.ts`.

### Enemies

#### Enemy 1: Wall Leech (lumpy square)
- [x] Dormant on cave walls, activates when player is nearby (80px)
- [x] Detaches and follows player (0.8 px/frame, slides along terrain)
- [x] On contact: grabs player, slows to 35% speed, pulls toward nearest wall
- [x] 120 HP. Dies from: thruster (~2s), 1 rocket (instant), aura (~4s)

#### Enemy 2: Cave Sentry (circle + two diamond wings)
- [x] Roams open cave areas on a patrol path (wanders near home position)
- [x] Triggers when player enters 120px radius
- [x] Fires bullets at player: 1 every 2 seconds, each does 15% damage
- [x] 90 HP. Same kill methods as Wall Leech

#### Enemy 3: Magma Tower (blob cluster on wall)
- [x] Static, mounted on wall facing open space (like Wall Grabber placement)
- [x] Brain-like visual: overlapping wobbly circles, lobes disappear as ammo depletes
- [x] 100px detect radius, fires blobs at player every 1.5s
- [x] 5 blobs total (limited ammo) — goes dormant when spent
- [x] Blobs attach to first thing hit (wall or player), then explode into red erosion particles
- [x] Wall hit: 80 red particles spread and erode terrain over time
- [x] Player hit: 10% damage + same erosion effect at player position
- [x] 80 HP, destroyable. Stops shooting when player leaves range

### Obstacles

#### Obstacle 1: Wall Grabber (box on wall)
- [x] Static, mounted inside wall facing open space
- [x] Shoots a tether line when player passes by (70px, directional)
- [x] Tether grabs and pulls player to wall for 1.5s, 15% damage on connect
- [x] 80 HP, destroyable. 5s cooldown between grabs

#### Obstacle 2: Bullet Tower (box in open chasm)
- [x] Sleep state: 50% opacity red. Awake: 100% opacity
- [x] Wakes when player enters 100px radius
- [x] Rotates and fires 8-bullet bursts (bullet-hell style), 2s between bursts
- [x] Each bullet: 5% damage, brief invincibility (0.25s)
- [x] 100 HP, destroyable

#### Obstacle 3: Missile Tower (triangle shape)
- [x] Sleep/awake mechanic like Obstacle 2 (150px detect radius)
- [x] Fires slow homing missiles (turn rate 0.025 rad/frame) every 3s
- [x] Each missile: 50% damage, 0.75s invincibility. Missiles are indestructible
- [x] Missiles blink/fade during last second before expiring (5s lifetime)
- [x] 100 HP, destroyable. 8 spawned
- [x] Fill animation: outlined when on cooldown, fills from bottom as it recharges

**Complete.** All enemies/obstacles live in `EnemySystem.ts`. HP-based damage, no regen. Thruster does 2 DPS, aura does 0.5 DPS, rockets instant-kill. Spawn counts: 25 leeches, 12 sentries, 18 grabbers, 10 towers, 8 missile towers, 10 magma towers.

### Visual Polish (applied to all enemies)
- [x] Hit flash: all enemies flash white for 6 frames when taking damage
- [x] Red impact sparks: projectile hits on player spawn glowing red burst particles
- [x] Red erosion: enemy projectiles hitting walls spawn red particles that erode terrain
  - Magma blobs: 100% intensity (80 particles, damage 8)
  - Bomb pickups: 75% intensity (60 particles, damage 6)
  - Sentry/tower bullets, homing missiles: 25% intensity (20 particles, damage 2)
- [x] Red particle rendering: particles with `red` flag render in red tones instead of white/grey

---

## 6. Game Flow / Level Design

- [x] Center hub: 4 pedestals at diagonal offsets from spawn (1024, 2048)
- [x] 4 artifacts at map corners — star/squares/coil/pinwheel shapes
- [x] Artifacts carried via rope physics (top-down Verlet, chains if multiple held)
- [x] Place artifact on matching pedestal to progress
- [x] Center circle activates when all 4 placed (win condition TBD)
- [x] Ancient chasm starting area — symmetrical hub with alcoves, fractal ring, pedestal bays
- [x] Grand flashlight corridor — hourglass tunnel north of spawn, pillared hallway, circular sanctum
- [x] Flashlight pickup at sanctum center (1024, 1750) — auto-equips on collect
- [x] Hub power-up intro sequence — ring → lines → towers flicker on with glow + screenshake
- [x] Hub direction marker (HUD, screen-edge arrow like shop marker)
- [x] Item bar hidden until items equipped; new items flicker in on equip
- [ ] Win sequence when player enters activated center circle
- [ ] Enemy placement tuning — deliberate zones vs fully random
- [ ] Tutorial flow — first Wall Leech encounter design
- [ ] Locked door / key mechanic (removed for now, design TBD)

---

## 7. Multiplayer Fork (Future)

**Not started — planned after single-player is complete.**

- Two-player co-op: one controls movement, other controls items/abilities
- Story intro before gameplay
- Potential expansion: teams of 2 competing to find the gem
- Session-based: drop-in/drop-out, massive terrain
- Will need networking layer (WebSocket or WebRTC)
- Separate branch/fork from the single-player version

---

## 8. Vision & Integration

Spout is designed to be a **mini-game inside a larger project** — played via an arcade cabinet in the parent game. The parent project uses the same stack (Phaser + TypeScript + React).

When single-player Spout is complete:
- Package it for embedding (likely as a self-contained component/module)
- Create an integration API for the parent game to launch/close Spout
- Share assets/theme if needed
- The multiplayer version (#7) is a separate standalone release

---

## 9. Housekeeping

- [x] Set up git repo (init, .gitignore, initial commit)

---

## Suggested Build Order

1. ~~**Fog system** (#2)~~ ✓
2. ~~**Flashlight item** (#3)~~ ✓ (implemented in items.ts, fog radius per level)
3. ~~**Intro sequence** (#1)~~ ✓
4. ~~**UI popups & shop rework** (#4)~~ ✓
5. ~~**Enemies & obstacles** (#5)~~ ✓ (All complete: Wall Leech, Cave Sentry, Wall Grabber, Bullet Tower, Missile Tower, Magma Tower)
6. **Game flow / level design** (#6) — ties everything together
7. **Multiplayer** (#7) — after single-player is solid
8. **Integration** (#8) — after single-player is complete
