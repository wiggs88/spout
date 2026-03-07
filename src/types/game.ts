export interface ShipState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // radians
  alive: boolean;
  health: number;          // 0–100
  invincibleFrames: number; // frames remaining of post-hit invincibility
}

export const SHIP_MAX_HEALTH      = 100;
export const SHIP_COLLISION_DAMAGE = 25;   // hp lost per wall hit
export const SHIP_REGEN_PER_SEC   = 4;    // hp regenerated per second

export interface Grain {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  red: boolean;
}

export const GAME_WIDTH = 512;
export const GAME_HEIGHT = 512;
export const WORLD_WIDTH = 2048;
export const WORLD_HEIGHT = 4096;

export const GRAVITY = 0.001;
export const THRUST_POWER = 0.04;
export const MAX_SPEED = 3;
export const ROTATION_SPEED = 0.05;
export const PARTICLE_COUNT = 500;
export const PARTICLES_PER_FRAME = 8;
export const PARTICLE_SPEED = 2.5;
export const PARTICLE_LIFE = 300;

export const TERRAIN_MAX_HP = 3;
export const ROCK_HP        = 255; // indestructible — damage() skips this value

export const SHIP_SIZE = 4;

// ── Ore constants ──────────────────────────────────────────────
export interface Ore {
  x: number;
  y: number;
  tier: number;   // 1–3
  active: boolean;
  rotation: number; // radians, random per ore
  scale: number;    // size variation (0.7–1.3)
}

export const ORE_COUNTS = [0, 120, 40, 20]; // index 0 unused; [tier] = count
export const ORE_COLLECT_RADIUS = 8;
export const ORE_MIN_DISTANCES = [0, 100, 350, 500]; // min distance from spawn per tier

export const ORE_COLORS: number[] = [
  0x000000,   // index 0 unused
  0x8B6B4A,   // tier 1 brown
  0xFFD700,   // tier 2 yellow
  0x4488FF,   // tier 3 blue
];

// ── Fog constants (used by CRT shader — see ARCHITECTURE.md) ────
export const FOG_RADIUS_DEFAULT = 0.22;
export const FOG_SOFTNESS       = 0.18;

// ── Energy constants ─────────────────────────────────────────
// Per-item energy costs are in src/game/data/items.ts (per level).
export const MAX_ENERGY        = 100;
export const ENERGY_REGEN     = 2;   // energy per second (passive regen)
