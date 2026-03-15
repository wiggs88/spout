# Multiplayer Design

Co-op mode for 2–3 players sharing one ship. Each player has a distinct role. Built on the `multiplayer` branch, level design stays on `main` and merges in.

---

## Ship & Crew

- Ship triangle 10% larger than single-player (`SHIP_SIZE * 1.1`).
- Inside the triangle: one circle per player at each corner. Outline = empty slot, filled = occupied (in that player's color).
- 3 circles for 3 players, 2 for 2 players. Circles fill the triangle interior (can touch/overlap slightly).
- Each player picks a color from 3 low-saturated options (muted teal, muted rose, muted amber — TBD).

## Roles

### Pilot (1 player)
- Controls ship movement identically to single-player (WASD/arrows + thrust).
- No crosshair. No special ability beyond flying.

### Flashlight Operator (1 player)
- Mouse-controlled crosshair (small dot/reticle).
- Points the flashlight cone in any direction from the ship.
- Click to toggle light on/off.
- Flashlight is a **cone** added to the existing CRT fog shader:
  - Two new uniforms: `uFlashlightAngle` (radians) and `uFlashlightOn` (0 or 1).
  - Cone spread: ~40° half-angle (tunable).
  - Pixels inside the cone get an extended fog reveal radius. Pixels outside stay at the ship's small base radius.
  - Base ship light (~0.08 radius) always on so it's not pitch black.
  - Implementation: ~5–10 lines added to the existing fog section of `CRTPostFx.ts`. Store angle as class field, push in `onPreRender()`. No shader rewrite needed.

### Cave Miner (1 player, replaces thruster-as-weapon)
- Mouse-controlled crosshair (same as flashlight player).
- Click/hold to fire a directional carve spray toward the crosshair.
- Particles travel from ship in the aimed direction, damage terrain on contact.
- Effectively a "gun" that mines cave walls at range.
- Uses that player's energy bar (regenerates over time).

### Ship Movement Particles (cosmetic only)
- The current thruster particle effect stays for visual feedback on ship movement.
- Reduced to ~40% opacity, no terrain damage.
- Fires opposite to thrust direction as before — purely cosmetic.

## Energy

- Each player has their own energy bar (not shared).
- Flashlight drains energy while on. Miner drains on fire.
- Passive regen per player.
- HUD shows one energy bar per active player, color-coded.

## Abilities & Pickups

- **No shop.** ShopSystem/ShopOverlay removed from multiplayer.
- Items from the shop are scattered as **world pickups** (like the flashlight pickup in single-player).
- When the team picks one up, a UI prompt lets them assign it to a player.
- **Ship-wide passives** (no assignment needed):
  - Dynamo — energy regen boost, applies to all players.
  - Health pickup — restores ship HP.
  - Armor pickup — temporary damage reduction (new item).
- Items are fixed-level (no upgrades). Higher-tier pickups deeper in the map.

## Lobby

### Visual Style
- Terminal/monospace aesthetic (matches the shop overlay style).
- Single screen, no page navigation.

### Layout
```
┌─────────────────────────────────────────────┐
│  SPOUT // MULTIPLAYER                       │
│─────────────────────────────────────────────│
│                                             │
│  CREW                    SHIP               │
│                                             │
│  > PILOT .............. [  ]    ┌───────┐   │
│  > FLASHLIGHT ......... [  ]    │  ○ ○  │   │
│  > MINER .............. [  ]    │   ○   │   │
│                                 └───────┘   │
│                                             │
│  PRESENT:                                   │
│  ● player 1 (teal)     [READY]             │
│  ● player 2 (rose)     [    ]              │
│  ○ waiting...                               │
│                                             │
│                         [ LAUNCH ]          │
│─────────────────────────────────────────────│
│  room: AXKF-29B1                            │
└─────────────────────────────────────────────┘
```

### Flow
1. Player opens the page → they appear as "present" (connected, no role yet).
2. Player clicks a role → their colored circle fills the matching slot on the ship preview.
3. Each player clicks **READY** when set.
4. When all players are ready, **LAUNCH** becomes active. Any player can click it.
5. Minimum 2 players to launch. Pilot is required. If only 2 players, one gets both flashlight + miner (or flashlight is auto, miner is the 2nd role — TBD).

### Color Selection
- 3 low-saturated colors auto-assigned on join (first gets teal, second gets rose, third gets amber).
- Player can click to swap/cycle color if they want.

## Networking

- **WebSocket server** — lightweight (Node or Bun). Handles room creation, player presence, state sync.
- **Host-authoritative** — the first player (host) runs physics and game logic. Server relays input from other players to host, host broadcasts game state back.
- **Input forwarding** — each player sends only their role-specific input:
  - Pilot: movement keys + thrust
  - Flashlight: mouse angle + toggle
  - Miner: mouse angle + fire state
- **Room codes** — short alphanumeric code to share with friends.
- **Interpolation** — non-host players interpolate received state for smooth visuals despite latency.

---

## Implementation Phases

### Phase 1: Lobby & Player Model
- Player data model: id, color, role, energy, ready state.
- Lobby React screen (terminal style) with role selection + ship preview.
- Ship resize + crew circle rendering inside triangle.
- Color picker (auto-assign on join, click to cycle).
- Ready/Launch flow (local-only first, networking later).

### Phase 2: Role Mechanics (local, single-machine testing)
- Pilot input scoped (unchanged from single-player).
- Flashlight cone shader: add `uFlashlightAngle` + `uFlashlightOn` uniforms to CRT shader.
- Crosshair rendering for flashlight + miner roles.
- Miner directional carve spray (new particle emitter aimed at mouse angle).
- Cosmetic thrust particles (reduce opacity, remove damage).
- Per-player energy bars in HUD.

### Phase 3: Ability Pickups
- Remove ShopSystem from multiplayer branch.
- Scatter ability pickups across the map (reuse OreSystem placement pattern).
- Pickup assignment UI (which player gets it).
- Ship-wide pickups: health, armor, dynamo.

### Phase 4: Networking
- WebSocket server (room management, relay).
- Room creation + join via code.
- Input forwarding per role.
- Host-authoritative state sync.
- Client-side interpolation.
- Lobby presence (see who's connected in real-time).
