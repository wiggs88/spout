import { ShipState, WORLD_WIDTH, WORLD_HEIGHT, GAME_WIDTH, GAME_HEIGHT } from '../../types/game';
import { TerrainSystem } from './TerrainSystem';
import { ParticleSystem } from './ParticleSystem';

// ── Constants ────────────────────────────────────────────────────
const LEECH_COUNT = 25;
const MIN_DIST_FROM_SPAWN = 200;    // don't spawn near player start
const MIN_DIST_FROM_REST = 60;      // don't spawn near rest areas
const MIN_DIST_BETWEEN = 80;        // spread leeches apart
const DETECT_RADIUS = 80;           // distance to wake up
const CHASE_SPEED = 0.8;            // px per frame
const ATTACH_RADIUS = 6;            // distance to latch onto ship
const SLOW_MULTIPLIER = 0.35;       // ship speed multiplier when attached
const WALL_PULL_FORCE = 0.3;        // pull toward nearest wall per frame
const THRUSTER_RANGE = 30;          // distance from thrust center where damage applies
const THRUSTER_DPS = 2;             // damage per frame from thruster
const AURA_DPS = 0.5;              // damage per frame from aura
const LEECH_HP = 120;              // ~2s of thruster to kill
const SENTRY_HP = 90;              // ~1.5s of thruster to kill
const HIT_FLASH_FRAMES = 6;          // frames of white flash on damage
const IMPACT_PARTICLE_COUNT = 14;   // particles per projectile impact
const IMPACT_PARTICLE_LIFE = 15;    // frames impact particles live
const LEECH_SIZE = 3;               // half-size for rendering

// ── Wall Grabber Constants ───────────────────────────────────────
const GRABBER_COUNT = 18;
const GRABBER_DETECT_RADIUS = 70;   // shoots tether when player enters
const GRABBER_TETHER_SPEED = 3;     // px per frame tether extends
const GRABBER_TETHER_MAX = 80;      // max tether length
const GRABBER_PULL_FORCE = 0.6;     // pull strength toward grabber
const GRABBER_DAMAGE = 15;          // % damage when tether connects
const GRABBER_COOLDOWN = 300;       // frames between grabs (~5s)
const GRABBER_TETHER_HOLD = 90;     // frames the tether holds before releasing (~1.5s)
const GRABBER_SIZE = 3;             // half-size for rendering
const GRABBER_HP = 80;              // destroyable

// ── Sentry Constants ─────────────────────────────────────────────
const SENTRY_COUNT = 12;
const SENTRY_DETECT_RADIUS = 120;   // triggers when player enters
const SENTRY_FIRE_INTERVAL = 120;   // frames between shots (2s at 60fps)
const SENTRY_BULLET_SPEED = 1.8;
const SENTRY_BULLET_DAMAGE = 15;    // % of max health
const SENTRY_BULLET_LIFETIME = 180; // frames (~3s)
const SENTRY_PATROL_SPEED = 0.4;    // px per frame
const SENTRY_PATROL_RANGE = 40;     // wander distance from home
const SENTRY_SIZE = 4;              // body radius
const SENTRY_WING_SIZE = 3;         // diamond wing size
const SENTRY_MIN_DIST_FROM_SPAWN = 300;
const SENTRY_MIN_DIST_BETWEEN = 120;

// ── Bullet Tower Constants ───────────────────────────────────────
const TOWER_COUNT = 10;
const TOWER_DETECT_RADIUS = 100;    // wakes when player enters
const TOWER_BULLET_SPEED = 1.5;
const TOWER_BULLET_DAMAGE = 5;      // % per bullet
const TOWER_BULLET_LIFETIME = 150;  // frames (~2.5s)
const TOWER_FIRE_RATE = 8;          // frames between bullets in a burst
const TOWER_BURST_COUNT = 8;        // bullets per arc sweep
const TOWER_BURST_COOLDOWN = 120;   // frames between bursts (~2s)
const TOWER_ROTATE_SPEED = 0.02;    // radians per frame
const TOWER_SIZE = 4;               // half-size for rendering
const TOWER_HP = 100;
const TOWER_MIN_DIST_FROM_SPAWN = 350;
const TOWER_MIN_DIST_BETWEEN = 150;

// ── Missile Tower Constants ──────────────────────────────────────
const MTOWER_COUNT = 8;
const MTOWER_DETECT_RADIUS = 150;   // large radius — fires from far away
const MTOWER_MISSILE_SPEED = 1.0;   // slow but homing
const MTOWER_MISSILE_TURN = 0.025;  // radians per frame — how fast missiles steer
const MTOWER_MISSILE_DAMAGE = 50;   // % per missile — very dangerous
const MTOWER_MISSILE_LIFETIME = 300; // frames (~5s)
const MTOWER_FIRE_COOLDOWN = 180;   // frames between missiles (~3s)
const MTOWER_SIZE = 5;              // half-size for rendering (triangle)
const MTOWER_HP = 100;
const MTOWER_MIN_DIST_FROM_SPAWN = 400;
const MTOWER_MIN_DIST_BETWEEN = 180;

interface Missile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  active: boolean;
}

interface MissileTower {
  x: number;
  y: number;
  hp: number;
  active: boolean;
  hitFlash: number;
  state: 'sleep' | 'awake';
  fireCooldown: number;
  missiles: Missile[];
}

interface TowerBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  active: boolean;
}

interface BulletTower {
  x: number;
  y: number;
  hp: number;
  active: boolean;
  hitFlash: number;
  state: 'sleep' | 'awake';
  rotAngle: number;           // current rotation angle
  burstTimer: number;         // frames until next burst
  burstCount: number;         // bullets remaining in current burst
  fireTimer: number;          // frames until next bullet in burst
  bullets: TowerBullet[];
}

interface SentryBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  active: boolean;
}

interface CaveSentry {
  x: number;
  y: number;
  homeX: number;              // patrol center
  homeY: number;
  vx: number;
  vy: number;
  hp: number;
  active: boolean;
  hitFlash: number;
  state: 'patrol' | 'alert';
  fireCooldown: number;       // frames until next shot
  patrolAngle: number;        // current patrol direction
  patrolTimer: number;        // frames until direction change
  bullets: SentryBullet[];
}

interface WallGrabber {
  x: number;
  y: number;
  hp: number;
  active: boolean;
  hitFlash: number;
  attachAngle: number;              // direction it faces (away from wall)
  state: 'idle' | 'shooting' | 'holding' | 'retracting';
  tetherTipX: number;
  tetherTipY: number;
  tetherDirX: number;              // direction tether shoots
  tetherDirY: number;
  tetherLength: number;
  holdTimer: number;               // frames remaining while holding
  cooldown: number;                // frames until can fire again
  damageDealt: boolean;            // only damage once per grab
}

interface WallLeech {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  active: boolean;
  hitFlash: number;
  state: 'dormant' | 'chasing' | 'attached';
  attachAngle: number;              // angle the leech faces on the wall
  wallX: number;                    // nearest wall position (for pull)
  wallY: number;
}

// ── Magma Tower Constants ────────────────────────────────────────
const MAGMA_COUNT = 10;
const MAGMA_DETECT_RADIUS = 100;    // shoots when player enters
const MAGMA_BLOB_SPEED = 1.2;       // px per frame
const MAGMA_BLOB_LIFETIME = 180;    // frames (~3s) before blob fizzles
const MAGMA_FIRE_COOLDOWN = 90;     // frames between shots (~1.5s)
const MAGMA_MAX_BLOBS = 5;          // total ammo
const MAGMA_BLOB_DAMAGE = 10;       // % damage on player hit
const MAGMA_CARVE_RADIUS = 8;       // terrain carve radius on impact
const MAGMA_SIZE = 4;               // half-size for rendering
const MAGMA_HP = 80;
const MAGMA_MIN_DIST_FROM_SPAWN = 250;
const MAGMA_MIN_DIST_BETWEEN = 100;
const MAGMA_RESIDUE_LIFE = 300;     // frames residue glows (~5s)

interface MagmaBlob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  active: boolean;
}

interface MagmaResidue {
  x: number;
  y: number;
  radius: number;
  life: number;
}

interface MagmaTower {
  x: number;
  y: number;
  hp: number;
  active: boolean;
  hitFlash: number;
  attachAngle: number;        // direction it faces (away from wall)
  blobsLeft: number;          // ammo remaining
  fireCooldown: number;
  blobs: MagmaBlob[];
  residues: MagmaResidue[];
}

interface ImpactParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export class EnemySystem {
  readonly leeches: WallLeech[] = [];
  readonly sentries: CaveSentry[] = [];
  readonly grabbers: WallGrabber[] = [];
  readonly towers: BulletTower[] = [];
  readonly missileTowers: MissileTower[] = [];
  readonly magmaTowers: MagmaTower[] = [];
  readonly deathEvents: { x: number; y: number }[] = [];
  readonly blobImpactEvents: { x: number; y: number }[] = [];
  readonly projectileWallHits: { x: number; y: number }[] = [];
  private impacts: ImpactParticle[] = [];

  /** Place all enemies throughout the map. */
  scatter(terrain: TerrainSystem): void {
    this.scatterLeeches(terrain);
    this.scatterSentries(terrain);
    this.scatterGrabbers(terrain);
    this.scatterTowers(terrain);
    this.scatterMissileTowers(terrain);
    this.scatterMagmaTowers(terrain);
  }

  /** Place leeches on wall edges. */
  private scatterLeeches(terrain: TerrainSystem): void {
    const spawnX = WORLD_WIDTH / 2;
    const spawnY = WORLD_HEIGHT / 2;
    const restAreas = terrain.restAreas;

    let placed = 0;
    let attempts = 0;

    while (placed < LEECH_COUNT && attempts < LEECH_COUNT * 200) {
      attempts++;
      const x = Math.floor(40 + Math.random() * (WORLD_WIDTH - 80));
      const y = Math.floor(40 + Math.random() * (WORLD_HEIGHT - 80));

      // Must be in open space (not solid)
      if (terrain.isSolid(x, y)) continue;

      // Must be adjacent to a wall (at least one solid neighbor)
      const wallDir = this.findAdjacentWall(x, y, terrain);
      if (!wallDir) continue;

      // Min distance from spawn
      const dsx = x - spawnX;
      const dsy = y - spawnY;
      if (dsx * dsx + dsy * dsy < MIN_DIST_FROM_SPAWN * MIN_DIST_FROM_SPAWN) continue;

      // Min distance from rest areas
      let tooCloseToRest = false;
      for (const area of restAreas) {
        const drx = x - area.x;
        const dry = y - area.y;
        if (drx * drx + dry * dry < MIN_DIST_FROM_REST * MIN_DIST_FROM_REST) {
          tooCloseToRest = true;
          break;
        }
      }
      if (tooCloseToRest) continue;

      // Min distance from other leeches
      let tooClose = false;
      for (const leech of this.leeches) {
        const dlx = x - leech.x;
        const dly = y - leech.y;
        if (dlx * dlx + dly * dly < MIN_DIST_BETWEEN * MIN_DIST_BETWEEN) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      this.leeches.push({
        x, y,
        vx: 0, vy: 0,
        hp: LEECH_HP,
        active: true,
        hitFlash: 0,
        state: 'dormant',
        attachAngle: wallDir.angle,
        wallX: x + wallDir.dx,
        wallY: y + wallDir.dy,
      });
      placed++;
    }
  }

  /** Place sentries in open cave areas. */
  private scatterSentries(terrain: TerrainSystem): void {
    const spawnX = WORLD_WIDTH / 2;
    const spawnY = WORLD_HEIGHT / 2;
    const restAreas = terrain.restAreas;

    let placed = 0;
    let attempts = 0;

    while (placed < SENTRY_COUNT && attempts < SENTRY_COUNT * 300) {
      attempts++;
      const x = Math.floor(60 + Math.random() * (WORLD_WIDTH - 120));
      const y = Math.floor(60 + Math.random() * (WORLD_HEIGHT - 120));

      // Must be in open space
      if (terrain.isSolid(x, y)) continue;

      // Need some open space around it (not too tight a corridor)
      let openCount = 0;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const cx = Math.floor(x + Math.cos(angle) * 12);
        const cy = Math.floor(y + Math.sin(angle) * 12);
        if (!terrain.isSolid(cx, cy)) openCount++;
      }
      if (openCount < 5) continue; // need mostly open space

      // Min distance from spawn
      const dsx = x - spawnX;
      const dsy = y - spawnY;
      if (dsx * dsx + dsy * dsy < SENTRY_MIN_DIST_FROM_SPAWN * SENTRY_MIN_DIST_FROM_SPAWN) continue;

      // Min distance from rest areas
      let tooCloseToRest = false;
      for (const area of restAreas) {
        const drx = x - area.x;
        const dry = y - area.y;
        if (drx * drx + dry * dry < MIN_DIST_FROM_REST * MIN_DIST_FROM_REST) {
          tooCloseToRest = true;
          break;
        }
      }
      if (tooCloseToRest) continue;

      // Min distance from other sentries
      let tooClose = false;
      for (const sentry of this.sentries) {
        const dlx = x - sentry.x;
        const dly = y - sentry.y;
        if (dlx * dlx + dly * dly < SENTRY_MIN_DIST_BETWEEN * SENTRY_MIN_DIST_BETWEEN) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      this.sentries.push({
        x, y,
        homeX: x, homeY: y,
        vx: 0, vy: 0,
        hp: SENTRY_HP,
        active: true,
        hitFlash: 0,
        state: 'patrol',
        fireCooldown: SENTRY_FIRE_INTERVAL,
        patrolAngle: Math.random() * Math.PI * 2,
        patrolTimer: 60 + Math.floor(Math.random() * 120),
        bullets: [],
      });
      placed++;
    }
  }

  /** Place grabbers on walls facing open space. */
  private scatterGrabbers(terrain: TerrainSystem): void {
    const spawnX = WORLD_WIDTH / 2;
    const spawnY = WORLD_HEIGHT / 2;
    const restAreas = terrain.restAreas;

    let placed = 0;
    let attempts = 0;

    while (placed < GRABBER_COUNT && attempts < GRABBER_COUNT * 200) {
      attempts++;
      const x = Math.floor(40 + Math.random() * (WORLD_WIDTH - 80));
      const y = Math.floor(40 + Math.random() * (WORLD_HEIGHT - 80));

      // Must be on a wall (solid)
      if (!terrain.isSolid(x, y)) continue;

      // Find an open neighbor — that's the direction it faces
      const openDir = this.findAdjacentOpen(x, y, terrain);
      if (!openDir) continue;

      // Min distance from spawn
      const dsx = x - spawnX;
      const dsy = y - spawnY;
      if (dsx * dsx + dsy * dsy < MIN_DIST_FROM_SPAWN * MIN_DIST_FROM_SPAWN) continue;

      // Min distance from rest areas
      let tooCloseToRest = false;
      for (const area of restAreas) {
        const drx = x - area.x;
        const dry = y - area.y;
        if (drx * drx + dry * dry < MIN_DIST_FROM_REST * MIN_DIST_FROM_REST) {
          tooCloseToRest = true;
          break;
        }
      }
      if (tooCloseToRest) continue;

      // Min distance from other grabbers
      let tooClose = false;
      for (const g of this.grabbers) {
        const dlx = x - g.x;
        const dly = y - g.y;
        if (dlx * dlx + dly * dly < MIN_DIST_BETWEEN * MIN_DIST_BETWEEN) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      this.grabbers.push({
        x, y,
        hp: GRABBER_HP,
        active: true,
        hitFlash: 0,
        attachAngle: openDir.angle,
        state: 'idle',
        tetherTipX: x, tetherTipY: y,
        tetherDirX: openDir.dx, tetherDirY: openDir.dy,
        tetherLength: 0,
        holdTimer: 0,
        cooldown: 0,
        damageDealt: false,
      });
      placed++;
    }
  }

  /** Place magma towers on walls facing open space. */
  private scatterMagmaTowers(terrain: TerrainSystem): void {
    const spawnX = WORLD_WIDTH / 2;
    const spawnY = WORLD_HEIGHT / 2;
    const restAreas = terrain.restAreas;

    let placed = 0;
    let attempts = 0;

    while (placed < MAGMA_COUNT && attempts < MAGMA_COUNT * 200) {
      attempts++;
      const x = Math.floor(40 + Math.random() * (WORLD_WIDTH - 80));
      const y = Math.floor(40 + Math.random() * (WORLD_HEIGHT - 80));

      // Must be on a wall (solid)
      if (!terrain.isSolid(x, y)) continue;

      // Find an open neighbor — that's the direction it faces
      const openDir = this.findAdjacentOpen(x, y, terrain);
      if (!openDir) continue;

      // Min distance from spawn
      const dsx = x - spawnX;
      const dsy = y - spawnY;
      if (dsx * dsx + dsy * dsy < MAGMA_MIN_DIST_FROM_SPAWN * MAGMA_MIN_DIST_FROM_SPAWN) continue;

      // Min distance from rest areas
      let tooCloseToRest = false;
      for (const area of restAreas) {
        const drx = x - area.x;
        const dry = y - area.y;
        if (drx * drx + dry * dry < MIN_DIST_FROM_REST * MIN_DIST_FROM_REST) {
          tooCloseToRest = true;
          break;
        }
      }
      if (tooCloseToRest) continue;

      // Min distance from other magma towers and grabbers
      let tooClose = false;
      for (const m of this.magmaTowers) {
        const dlx = x - m.x;
        const dly = y - m.y;
        if (dlx * dlx + dly * dly < MAGMA_MIN_DIST_BETWEEN * MAGMA_MIN_DIST_BETWEEN) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        for (const g of this.grabbers) {
          const dlx = x - g.x;
          const dly = y - g.y;
          if (dlx * dlx + dly * dly < MAGMA_MIN_DIST_BETWEEN * MAGMA_MIN_DIST_BETWEEN) {
            tooClose = true;
            break;
          }
        }
      }
      if (tooClose) continue;

      this.magmaTowers.push({
        x, y,
        hp: MAGMA_HP,
        active: true,
        hitFlash: 0,
        attachAngle: openDir.angle,
        blobsLeft: MAGMA_MAX_BLOBS,
        fireCooldown: MAGMA_FIRE_COOLDOWN,
        blobs: [],
        residues: [],
      });
      placed++;
    }
  }

  /** Find an open (non-solid) neighbor and return direction toward it. */
  private findAdjacentOpen(
    x: number, y: number, terrain: TerrainSystem,
  ): { dx: number; dy: number; angle: number } | null {
    const dirs = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    ];
    for (const d of dirs) {
      // Check a few pixels out to find open space
      for (let dist = 1; dist <= 4; dist++) {
        if (!terrain.isSolid(x + d.dx * dist, y + d.dy * dist)) {
          return { dx: d.dx, dy: d.dy, angle: Math.atan2(d.dy, d.dx) };
        }
      }
    }
    return null;
  }

  /** Place bullet towers in open cave areas. */
  private scatterTowers(terrain: TerrainSystem): void {
    const spawnX = WORLD_WIDTH / 2;
    const spawnY = WORLD_HEIGHT / 2;
    const restAreas = terrain.restAreas;

    let placed = 0;
    let attempts = 0;

    while (placed < TOWER_COUNT && attempts < TOWER_COUNT * 300) {
      attempts++;
      const x = Math.floor(60 + Math.random() * (WORLD_WIDTH - 120));
      const y = Math.floor(60 + Math.random() * (WORLD_HEIGHT - 120));

      // Must be in open space
      if (terrain.isSolid(x, y)) continue;

      // Need open space around it
      let openCount = 0;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const cx = Math.floor(x + Math.cos(angle) * 15);
        const cy = Math.floor(y + Math.sin(angle) * 15);
        if (!terrain.isSolid(cx, cy)) openCount++;
      }
      if (openCount < 6) continue;

      // Min distance from spawn
      const dsx = x - spawnX;
      const dsy = y - spawnY;
      if (dsx * dsx + dsy * dsy < TOWER_MIN_DIST_FROM_SPAWN * TOWER_MIN_DIST_FROM_SPAWN) continue;

      // Min distance from rest areas
      let tooCloseToRest = false;
      for (const area of restAreas) {
        const drx = x - area.x;
        const dry = y - area.y;
        if (drx * drx + dry * dry < MIN_DIST_FROM_REST * MIN_DIST_FROM_REST) {
          tooCloseToRest = true;
          break;
        }
      }
      if (tooCloseToRest) continue;

      // Min distance from other towers and sentries
      let tooClose = false;
      for (const tower of this.towers) {
        const dlx = x - tower.x;
        const dly = y - tower.y;
        if (dlx * dlx + dly * dly < TOWER_MIN_DIST_BETWEEN * TOWER_MIN_DIST_BETWEEN) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      for (const sentry of this.sentries) {
        const dlx = x - sentry.x;
        const dly = y - sentry.y;
        if (dlx * dlx + dly * dly < TOWER_MIN_DIST_BETWEEN * TOWER_MIN_DIST_BETWEEN) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      this.towers.push({
        x, y,
        hp: TOWER_HP,
        active: true,
        hitFlash: 0,
        state: 'sleep',
        rotAngle: Math.random() * Math.PI * 2,
        burstTimer: TOWER_BURST_COOLDOWN,
        burstCount: 0,
        fireTimer: 0,
        bullets: [],
      });
      placed++;
    }
  }

  /** Place missile towers in open cave areas (like bullet towers but rarer). */
  private scatterMissileTowers(terrain: TerrainSystem): void {
    const spawnX = WORLD_WIDTH / 2;
    const spawnY = WORLD_HEIGHT / 2;
    const restAreas = terrain.restAreas;

    let placed = 0;
    let attempts = 0;

    while (placed < MTOWER_COUNT && attempts < MTOWER_COUNT * 300) {
      attempts++;
      const x = Math.floor(60 + Math.random() * (WORLD_WIDTH - 120));
      const y = Math.floor(60 + Math.random() * (WORLD_HEIGHT - 120));

      if (terrain.isSolid(x, y)) continue;

      // Need open space around it
      let openCount = 0;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const cx = Math.floor(x + Math.cos(angle) * 15);
        const cy = Math.floor(y + Math.sin(angle) * 15);
        if (!terrain.isSolid(cx, cy)) openCount++;
      }
      if (openCount < 6) continue;

      // Min distance from spawn
      const dsx = x - spawnX;
      const dsy = y - spawnY;
      if (dsx * dsx + dsy * dsy < MTOWER_MIN_DIST_FROM_SPAWN * MTOWER_MIN_DIST_FROM_SPAWN) continue;

      // Min distance from rest areas
      let tooCloseToRest = false;
      for (const area of restAreas) {
        const drx = x - area.x;
        const dry = y - area.y;
        if (drx * drx + dry * dry < MIN_DIST_FROM_REST * MIN_DIST_FROM_REST) {
          tooCloseToRest = true;
          break;
        }
      }
      if (tooCloseToRest) continue;

      // Min distance from other missile towers, bullet towers, and sentries
      let tooClose = false;
      for (const mt of this.missileTowers) {
        const dlx = x - mt.x;
        const dly = y - mt.y;
        if (dlx * dlx + dly * dly < MTOWER_MIN_DIST_BETWEEN * MTOWER_MIN_DIST_BETWEEN) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        for (const tower of this.towers) {
          const dlx = x - tower.x;
          const dly = y - tower.y;
          if (dlx * dlx + dly * dly < MTOWER_MIN_DIST_BETWEEN * MTOWER_MIN_DIST_BETWEEN) {
            tooClose = true;
            break;
          }
        }
      }
      if (!tooClose) {
        for (const sentry of this.sentries) {
          const dlx = x - sentry.x;
          const dly = y - sentry.y;
          if (dlx * dlx + dly * dly < MTOWER_MIN_DIST_BETWEEN * MTOWER_MIN_DIST_BETWEEN) {
            tooClose = true;
            break;
          }
        }
      }
      if (tooClose) continue;

      this.missileTowers.push({
        x, y,
        hp: MTOWER_HP,
        active: true,
        hitFlash: 0,
        state: 'sleep',
        fireCooldown: MTOWER_FIRE_COOLDOWN,
        missiles: [],
      });
      placed++;
    }
  }

  /** Find a solid neighbor and return direction toward it. */
  private findAdjacentWall(
    x: number, y: number, terrain: TerrainSystem,
  ): { dx: number; dy: number; angle: number } | null {
    const dirs = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
      { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
      { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
    ];
    for (const d of dirs) {
      // Check a few pixels in that direction
      for (let dist = 1; dist <= 3; dist++) {
        if (terrain.isSolid(x + d.dx * dist, y + d.dy * dist)) {
          return { dx: d.dx * dist, dy: d.dy * dist, angle: Math.atan2(d.dy, d.dx) };
        }
      }
    }
    return null;
  }

  /** Per-frame update — AI, movement, player collision. */
  update(ship: ShipState, terrain: TerrainSystem, time: number): void {
    for (const leech of this.leeches) {
      if (!leech.active) continue;
      if (leech.hitFlash > 0) leech.hitFlash--;

      switch (leech.state) {
        case 'dormant':
          this.updateDormant(leech, ship);
          break;
        case 'chasing':
          this.updateChasing(leech, ship, terrain);
          break;
        case 'attached':
          this.updateAttached(leech, ship, terrain);
          break;
      }
    }

    for (const sentry of this.sentries) {
      if (!sentry.active) continue;
      if (sentry.hitFlash > 0) sentry.hitFlash--;
      this.updateSentry(sentry, ship, terrain);
      this.updateSentryBullets(sentry, ship, terrain);
    }

    for (const grabber of this.grabbers) {
      if (!grabber.active) continue;
      if (grabber.hitFlash > 0) grabber.hitFlash--;
      this.updateGrabber(grabber, ship);
    }

    for (const tower of this.towers) {
      if (!tower.active) continue;
      if (tower.hitFlash > 0) tower.hitFlash--;
      this.updateTower(tower, ship, terrain);
    }

    for (const mt of this.missileTowers) {
      if (!mt.active) continue;
      if (mt.hitFlash > 0) mt.hitFlash--;
      this.updateMissileTower(mt, ship, terrain);
    }

    for (const mg of this.magmaTowers) {
      if (mg.hitFlash > 0) mg.hitFlash--;
      this.updateMagmaTower(mg, ship, terrain);
    }

    // Update impact particles
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const p = this.impacts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) this.impacts.splice(i, 1);
    }
  }

  private updateDormant(leech: WallLeech, ship: ShipState): void {
    const dx = ship.x - leech.x;
    const dy = ship.y - leech.y;
    if (dx * dx + dy * dy < DETECT_RADIUS * DETECT_RADIUS) {
      leech.state = 'chasing';
    }
  }

  private updateChasing(leech: WallLeech, ship: ShipState, terrain: TerrainSystem): void {
    const dx = ship.x - leech.x;
    const dy = ship.y - leech.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      leech.vx = (dx / dist) * CHASE_SPEED;
      leech.vy = (dy / dist) * CHASE_SPEED;
    }

    // Move, but bounce off terrain
    const newX = leech.x + leech.vx;
    const newY = leech.y + leech.vy;

    if (!terrain.isSolid(Math.floor(newX), Math.floor(newY))) {
      leech.x = newX;
      leech.y = newY;
    } else {
      // Try sliding along one axis
      if (!terrain.isSolid(Math.floor(newX), Math.floor(leech.y))) {
        leech.x = newX;
        leech.vy = 0;
      } else if (!terrain.isSolid(Math.floor(leech.x), Math.floor(newY))) {
        leech.y = newY;
        leech.vx = 0;
      }
      // else stuck — stay put
    }

    // World wrap horizontal
    if (leech.x < 0) leech.x += WORLD_WIDTH;
    if (leech.x >= WORLD_WIDTH) leech.x -= WORLD_WIDTH;

    // Check if close enough to attach
    if (dist < ATTACH_RADIUS && ship.invincibleFrames === 0) {
      leech.state = 'attached';
    }
  }

  private updateAttached(leech: WallLeech, ship: ShipState, terrain: TerrainSystem): void {
    // Follow ship
    leech.x = ship.x;
    leech.y = ship.y;

    // Slow the ship
    ship.vx *= SLOW_MULTIPLIER;
    ship.vy *= SLOW_MULTIPLIER;

    // Find nearest wall and pull toward it
    const wallDir = this.findNearestWallDirection(ship.x, ship.y, terrain);
    if (wallDir) {
      ship.vx += wallDir.dx * WALL_PULL_FORCE;
      ship.vy += wallDir.dy * WALL_PULL_FORCE;
    }
  }

  // ── Sentry AI ───────────────────────────────────────────────────

  private updateSentry(sentry: CaveSentry, ship: ShipState, terrain: TerrainSystem): void {
    const dx = ship.x - sentry.x;
    const dy = ship.y - sentry.y;
    const dist2 = dx * dx + dy * dy;
    const detectR2 = SENTRY_DETECT_RADIUS * SENTRY_DETECT_RADIUS;

    if (dist2 < detectR2) {
      sentry.state = 'alert';
      // Fire at player
      sentry.fireCooldown--;
      if (sentry.fireCooldown <= 0) {
        this.sentryFire(sentry, ship);
        sentry.fireCooldown = SENTRY_FIRE_INTERVAL;
      }
    } else {
      sentry.state = 'patrol';
      sentry.fireCooldown = SENTRY_FIRE_INTERVAL; // reset cooldown when not alert
    }

    // Patrol movement — wander near home
    sentry.patrolTimer--;
    if (sentry.patrolTimer <= 0) {
      sentry.patrolAngle = Math.random() * Math.PI * 2;
      sentry.patrolTimer = 60 + Math.floor(Math.random() * 120);
    }

    // Drift toward patrol direction
    let targetVx = Math.cos(sentry.patrolAngle) * SENTRY_PATROL_SPEED;
    let targetVy = Math.sin(sentry.patrolAngle) * SENTRY_PATROL_SPEED;

    // Pull back toward home if too far
    const dhx = sentry.homeX - sentry.x;
    const dhy = sentry.homeY - sentry.y;
    const homeDist2 = dhx * dhx + dhy * dhy;
    if (homeDist2 > SENTRY_PATROL_RANGE * SENTRY_PATROL_RANGE) {
      const homeDist = Math.sqrt(homeDist2);
      targetVx += (dhx / homeDist) * SENTRY_PATROL_SPEED * 0.5;
      targetVy += (dhy / homeDist) * SENTRY_PATROL_SPEED * 0.5;
    }

    sentry.vx += (targetVx - sentry.vx) * 0.05;
    sentry.vy += (targetVy - sentry.vy) * 0.05;

    const newX = sentry.x + sentry.vx;
    const newY = sentry.y + sentry.vy;

    if (!terrain.isSolid(Math.floor(newX), Math.floor(newY))) {
      sentry.x = newX;
      sentry.y = newY;
    } else {
      sentry.vx *= -0.5;
      sentry.vy *= -0.5;
      sentry.patrolAngle += Math.PI; // reverse direction
    }
  }

  private sentryFire(sentry: CaveSentry, ship: ShipState): void {
    const dx = ship.x - sentry.x;
    const dy = ship.y - sentry.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    sentry.bullets.push({
      x: sentry.x,
      y: sentry.y,
      vx: (dx / dist) * SENTRY_BULLET_SPEED,
      vy: (dy / dist) * SENTRY_BULLET_SPEED,
      life: SENTRY_BULLET_LIFETIME,
      active: true,
    });
  }

  private updateSentryBullets(sentry: CaveSentry, ship: ShipState, terrain: TerrainSystem): void {
    for (const bullet of sentry.bullets) {
      if (!bullet.active) continue;

      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      bullet.life--;

      if (bullet.life <= 0) {
        bullet.active = false;
        continue;
      }

      // Hit terrain
      if (terrain.isSolid(Math.floor(bullet.x), Math.floor(bullet.y))) {
        this.projectileWallHits.push({ x: bullet.x - bullet.vx, y: bullet.y - bullet.vy });
        bullet.active = false;
        continue;
      }

      // Hit player
      if (ship.alive && ship.invincibleFrames === 0) {
        const dx = bullet.x - ship.x;
        const dy = bullet.y - ship.y;
        if (dx * dx + dy * dy < 36) { // ~6px radius
          bullet.active = false;
          this.spawnImpact(ship.x, ship.y);
          ship.health -= SENTRY_BULLET_DAMAGE;
          ship.invincibleFrames = 30; // brief invincibility (0.5s)
          if (ship.health <= 0) {
            ship.health = 0;
            ship.alive = false;
          }
        }
      }
    }

    // Clean up dead bullets
    sentry.bullets = sentry.bullets.filter(b => b.active);
  }

  // ── Wall Grabber AI ─────────────────────────────────────────────

  private updateGrabber(grabber: WallGrabber, ship: ShipState): void {
    switch (grabber.state) {
      case 'idle': {
        if (grabber.cooldown > 0) {
          grabber.cooldown--;
          break;
        }
        // Check if player is in range and in the direction we face
        const dx = ship.x - grabber.x;
        const dy = ship.y - grabber.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < GRABBER_DETECT_RADIUS * GRABBER_DETECT_RADIUS) {
          // Check if player is roughly in front (dot product with facing direction)
          const dist = Math.sqrt(dist2);
          if (dist > 0) {
            const dot = (dx / dist) * grabber.tetherDirX + (dy / dist) * grabber.tetherDirY;
            if (dot > 0.3) { // roughly in the direction we face
              grabber.state = 'shooting';
              grabber.tetherLength = 0;
              grabber.tetherTipX = grabber.x;
              grabber.tetherTipY = grabber.y;
              grabber.damageDealt = false;
              // Aim at player
              grabber.tetherDirX = dx / dist;
              grabber.tetherDirY = dy / dist;
            }
          }
        }
        break;
      }
      case 'shooting': {
        // Extend tether toward player
        grabber.tetherLength += GRABBER_TETHER_SPEED;
        grabber.tetherTipX = grabber.x + grabber.tetherDirX * grabber.tetherLength;
        grabber.tetherTipY = grabber.y + grabber.tetherDirY * grabber.tetherLength;

        // Check if tether hit player
        const dx = grabber.tetherTipX - ship.x;
        const dy = grabber.tetherTipY - ship.y;
        if (dx * dx + dy * dy < 64) { // ~8px radius
          grabber.state = 'holding';
          grabber.holdTimer = GRABBER_TETHER_HOLD;
          // Damage on connect
          if (!grabber.damageDealt && ship.invincibleFrames === 0) {
            this.spawnImpact(ship.x, ship.y);
            ship.health -= GRABBER_DAMAGE;
            ship.invincibleFrames = 30;
            grabber.damageDealt = true;
            if (ship.health <= 0) {
              ship.health = 0;
              ship.alive = false;
            }
          }
        }

        // Max range — retract if missed
        if (grabber.tetherLength >= GRABBER_TETHER_MAX) {
          grabber.state = 'retracting';
        }
        break;
      }
      case 'holding': {
        // Pull player toward grabber
        const dx = grabber.x - ship.x;
        const dy = grabber.y - ship.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 2) {
          ship.vx += (dx / dist) * GRABBER_PULL_FORCE;
          ship.vy += (dy / dist) * GRABBER_PULL_FORCE;
        }

        // Update tether tip to follow player
        grabber.tetherTipX = ship.x;
        grabber.tetherTipY = ship.y;

        grabber.holdTimer--;
        if (grabber.holdTimer <= 0) {
          grabber.state = 'retracting';
        }
        break;
      }
      case 'retracting': {
        grabber.tetherLength -= GRABBER_TETHER_SPEED * 2;
        if (grabber.tetherLength <= 0) {
          grabber.tetherLength = 0;
          grabber.state = 'idle';
          grabber.cooldown = GRABBER_COOLDOWN;
        }
        grabber.tetherTipX = grabber.x + grabber.tetherDirX * grabber.tetherLength;
        grabber.tetherTipY = grabber.y + grabber.tetherDirY * grabber.tetherLength;
        break;
      }
    }
  }

  // ── Bullet Tower AI ─────────────────────────────────────────────

  private updateTower(tower: BulletTower, ship: ShipState, terrain: TerrainSystem): void {
    // Update bullets regardless of state
    this.updateTowerBullets(tower, ship, terrain);

    const dx = ship.x - tower.x;
    const dy = ship.y - tower.y;
    const dist2 = dx * dx + dy * dy;
    const detectR2 = TOWER_DETECT_RADIUS * TOWER_DETECT_RADIUS;

    if (dist2 < detectR2) {
      tower.state = 'awake';
    } else {
      tower.state = 'sleep';
      tower.burstTimer = TOWER_BURST_COOLDOWN;
      tower.burstCount = 0;
      return;
    }

    // Rotate continuously
    tower.rotAngle += TOWER_ROTATE_SPEED;

    // Burst firing logic
    if (tower.burstCount > 0) {
      // Mid-burst: fire bullets at intervals
      tower.fireTimer--;
      if (tower.fireTimer <= 0) {
        this.towerFireBullet(tower);
        tower.burstCount--;
        tower.fireTimer = TOWER_FIRE_RATE;
      }
    } else {
      // Between bursts
      tower.burstTimer--;
      if (tower.burstTimer <= 0) {
        tower.burstCount = TOWER_BURST_COUNT;
        tower.fireTimer = 0; // fire first bullet immediately
        tower.burstTimer = TOWER_BURST_COOLDOWN;
      }
    }
  }

  private towerFireBullet(tower: BulletTower): void {
    const angle = tower.rotAngle;
    tower.bullets.push({
      x: tower.x,
      y: tower.y,
      vx: Math.cos(angle) * TOWER_BULLET_SPEED,
      vy: Math.sin(angle) * TOWER_BULLET_SPEED,
      life: TOWER_BULLET_LIFETIME,
      active: true,
    });
  }

  private updateTowerBullets(tower: BulletTower, ship: ShipState, terrain: TerrainSystem): void {
    for (const bullet of tower.bullets) {
      if (!bullet.active) continue;

      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      bullet.life--;

      if (bullet.life <= 0) {
        bullet.active = false;
        continue;
      }

      if (terrain.isSolid(Math.floor(bullet.x), Math.floor(bullet.y))) {
        this.projectileWallHits.push({ x: bullet.x - bullet.vx, y: bullet.y - bullet.vy });
        bullet.active = false;
        continue;
      }

      if (ship.alive && ship.invincibleFrames === 0) {
        const dx = bullet.x - ship.x;
        const dy = bullet.y - ship.y;
        if (dx * dx + dy * dy < 36) {
          bullet.active = false;
          this.spawnImpact(ship.x, ship.y);
          ship.health -= TOWER_BULLET_DAMAGE;
          ship.invincibleFrames = 15; // very brief — bullet hell style
          if (ship.health <= 0) {
            ship.health = 0;
            ship.alive = false;
          }
        }
      }
    }

    tower.bullets = tower.bullets.filter(b => b.active);
  }

  // ── Missile Tower AI ────────────────────────────────────────────

  private updateMissileTower(mt: MissileTower, ship: ShipState, terrain: TerrainSystem): void {
    // Update missiles regardless of state
    this.updateMissiles(mt, ship, terrain);

    const dx = ship.x - mt.x;
    const dy = ship.y - mt.y;
    const dist2 = dx * dx + dy * dy;
    const detectR2 = MTOWER_DETECT_RADIUS * MTOWER_DETECT_RADIUS;

    if (dist2 < detectR2) {
      mt.state = 'awake';
    } else {
      mt.state = 'sleep';
      mt.fireCooldown = MTOWER_FIRE_COOLDOWN;
      return;
    }

    // Fire missiles on cooldown
    mt.fireCooldown--;
    if (mt.fireCooldown <= 0) {
      this.missileTowerFire(mt, ship);
      mt.fireCooldown = MTOWER_FIRE_COOLDOWN;
    }
  }

  private missileTowerFire(mt: MissileTower, ship: ShipState): void {
    const dx = ship.x - mt.x;
    const dy = ship.y - mt.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    mt.missiles.push({
      x: mt.x,
      y: mt.y,
      vx: (dx / dist) * MTOWER_MISSILE_SPEED,
      vy: (dy / dist) * MTOWER_MISSILE_SPEED,
      life: MTOWER_MISSILE_LIFETIME,
      active: true,
    });
  }

  private updateMissiles(mt: MissileTower, ship: ShipState, terrain: TerrainSystem): void {
    for (const m of mt.missiles) {
      if (!m.active) continue;

      // Homing: steer toward player
      const dx = ship.x - m.x;
      const dy = ship.y - m.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        // Current heading
        const curAngle = Math.atan2(m.vy, m.vx);
        // Desired heading
        const targetAngle = Math.atan2(dy, dx);
        // Angle difference (wrapped to [-PI, PI])
        let diff = targetAngle - curAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        // Clamp turn rate
        const turn = Math.max(-MTOWER_MISSILE_TURN, Math.min(MTOWER_MISSILE_TURN, diff));
        const newAngle = curAngle + turn;
        m.vx = Math.cos(newAngle) * MTOWER_MISSILE_SPEED;
        m.vy = Math.sin(newAngle) * MTOWER_MISSILE_SPEED;
      }

      m.x += m.vx;
      m.y += m.vy;
      m.life--;

      if (m.life <= 0) {
        m.active = false;
        continue;
      }

      // Hit terrain
      if (terrain.isSolid(Math.floor(m.x), Math.floor(m.y))) {
        this.projectileWallHits.push({ x: m.x - m.vx, y: m.y - m.vy });
        m.active = false;
        continue;
      }

      // Hit player
      if (ship.alive && ship.invincibleFrames === 0) {
        const hx = m.x - ship.x;
        const hy = m.y - ship.y;
        if (hx * hx + hy * hy < 49) { // ~7px radius
          m.active = false;
          this.spawnImpact(ship.x, ship.y);
          ship.health -= MTOWER_MISSILE_DAMAGE;
          ship.invincibleFrames = 45; // 0.75s invincibility — big hit
          if (ship.health <= 0) {
            ship.health = 0;
            ship.alive = false;
          }
        }
      }
    }

    // Clean up dead missiles
    mt.missiles = mt.missiles.filter(m => m.active);
  }

  // ── Magma Tower AI ─────────────────────────────────────────────

  private updateMagmaTower(mg: MagmaTower, ship: ShipState, terrain: TerrainSystem): void {
    // Update blobs regardless of tower being alive
    this.updateMagmaBlobs(mg, ship, terrain);

    // Decay residues
    for (let i = mg.residues.length - 1; i >= 0; i--) {
      mg.residues[i].life--;
      if (mg.residues[i].life <= 0) mg.residues.splice(i, 1);
    }

    if (!mg.active) return;
    if (mg.blobsLeft <= 0) return; // out of ammo

    const dx = ship.x - mg.x;
    const dy = ship.y - mg.y;
    const dist2 = dx * dx + dy * dy;

    if (dist2 > MAGMA_DETECT_RADIUS * MAGMA_DETECT_RADIUS) {
      mg.fireCooldown = Math.min(mg.fireCooldown, MAGMA_FIRE_COOLDOWN / 2);
      return;
    }

    mg.fireCooldown--;
    if (mg.fireCooldown <= 0) {
      this.magmaTowerFire(mg, ship);
      mg.fireCooldown = MAGMA_FIRE_COOLDOWN;
    }
  }

  private magmaTowerFire(mg: MagmaTower, ship: ShipState): void {
    if (mg.blobsLeft <= 0) return;
    const dx = ship.x - mg.x;
    const dy = ship.y - mg.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    // Fire from the open-space side of the tower
    const startX = mg.x + Math.cos(mg.attachAngle) * 4;
    const startY = mg.y + Math.sin(mg.attachAngle) * 4;

    mg.blobs.push({
      x: startX,
      y: startY,
      vx: (dx / dist) * MAGMA_BLOB_SPEED,
      vy: (dy / dist) * MAGMA_BLOB_SPEED,
      life: MAGMA_BLOB_LIFETIME,
      active: true,
    });
    mg.blobsLeft--;
  }

  private updateMagmaBlobs(mg: MagmaTower, ship: ShipState, terrain: TerrainSystem): void {
    for (const b of mg.blobs) {
      if (!b.active) continue;

      b.x += b.vx;
      b.y += b.vy;
      b.life--;

      if (b.life <= 0) {
        b.active = false;
        continue;
      }

      // Hit terrain — blob splats and erodes over time
      if (terrain.isSolid(Math.floor(b.x), Math.floor(b.y))) {
        b.active = false;
        // Step back to last open position for the splat center
        const splatX = b.x - b.vx;
        const splatY = b.y - b.vy;
        this.blobImpactEvents.push({ x: splatX, y: splatY });
        mg.residues.push({ x: splatX, y: splatY, radius: MAGMA_CARVE_RADIUS, life: MAGMA_RESIDUE_LIFE });
        this.spawnImpact(splatX, splatY);
        continue;
      }

      // Hit player
      if (ship.alive && ship.invincibleFrames === 0) {
        const hx = b.x - ship.x;
        const hy = b.y - ship.y;
        if (hx * hx + hy * hy < 49) { // ~7px radius
          b.active = false;
          this.blobImpactEvents.push({ x: ship.x, y: ship.y });
          mg.residues.push({ x: ship.x, y: ship.y, radius: MAGMA_CARVE_RADIUS, life: MAGMA_RESIDUE_LIFE });
          this.spawnImpact(ship.x, ship.y);
          ship.health -= MAGMA_BLOB_DAMAGE;
          ship.invincibleFrames = 30;
          if (ship.health <= 0) {
            ship.health = 0;
            ship.alive = false;
          }
        }
      }
    }

    mg.blobs = mg.blobs.filter(b => b.active);
  }

  /** Find direction to nearest wall from position. */
  private findNearestWallDirection(
    x: number, y: number, terrain: TerrainSystem,
  ): { dx: number; dy: number } | null {
    let bestDist = Infinity;
    let bestDx = 0;
    let bestDy = 0;

    // Sample in 8 directions
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      for (let dist = 1; dist <= 60; dist++) {
        const checkX = Math.floor(x + dirX * dist);
        const checkY = Math.floor(y + dirY * dist);
        if (terrain.isSolid(checkX, checkY)) {
          if (dist < bestDist) {
            bestDist = dist;
            bestDx = dirX;
            bestDy = dirY;
          }
          break;
        }
      }
    }

    return bestDist < Infinity ? { dx: bestDx, dy: bestDy } : null;
  }

  // ── Combat ─────────────────────────────────────────────────────

  /** Check if a rocket blast hits any enemies. Returns true if any were hit. */
  checkRocketHit(x: number, y: number, blastRadius: number): boolean {
    let hit = false;
    const r2 = blastRadius * blastRadius;
    for (const leech of this.leeches) {
      if (!leech.active) continue;
      const dx = leech.x - x;
      const dy = leech.y - y;
      if (dx * dx + dy * dy < r2) {
        this.killLeech(leech);
        hit = true;
      }
    }
    for (const sentry of this.sentries) {
      if (!sentry.active) continue;
      const dx = sentry.x - x;
      const dy = sentry.y - y;
      if (dx * dx + dy * dy < r2) {
        this.killSentry(sentry);
        hit = true;
      }
    }
    for (const grabber of this.grabbers) {
      if (!grabber.active) continue;
      const dx = grabber.x - x;
      const dy = grabber.y - y;
      if (dx * dx + dy * dy < r2) {
        this.killGrabber(grabber);
        hit = true;
      }
    }
    for (const tower of this.towers) {
      if (!tower.active) continue;
      const dx = tower.x - x;
      const dy = tower.y - y;
      if (dx * dx + dy * dy < r2) {
        this.killTower(tower);
        hit = true;
      }
    }
    for (const mt of this.missileTowers) {
      if (!mt.active) continue;
      const dx = mt.x - x;
      const dy = mt.y - y;
      if (dx * dx + dy * dy < r2) {
        this.killMissileTower(mt);
        hit = true;
      }
    }
    for (const mg of this.magmaTowers) {
      if (!mg.active) continue;
      const dx = mg.x - x;
      const dy = mg.y - y;
      if (dx * dx + dy * dy < r2) {
        this.killMagmaTower(mg);
        hit = true;
      }
    }
    return hit;
  }

  /** Apply aura damage to enemies in radius. Called each frame while aura is active. */
  applyAuraDamage(cx: number, cy: number, radius: number): void {
    const r2 = radius * radius;
    for (const leech of this.leeches) {
      if (!leech.active) continue;
      const dx = leech.x - cx;
      const dy = leech.y - cy;
      if (dx * dx + dy * dy < r2) {
        leech.hp -= AURA_DPS;
        leech.hitFlash = HIT_FLASH_FRAMES;
        if (leech.hp <= 0) this.killLeech(leech);
        // Push away from center while in aura
        if (leech.state === 'chasing') {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0) {
            leech.vx = (dx / dist) * 1.5;
            leech.vy = (dy / dist) * 1.5;
          }
        }
      }
    }
    for (const sentry of this.sentries) {
      if (!sentry.active) continue;
      const dx = sentry.x - cx;
      const dy = sentry.y - cy;
      if (dx * dx + dy * dy < r2) {
        sentry.hp -= AURA_DPS;
        sentry.hitFlash = HIT_FLASH_FRAMES;
        if (sentry.hp <= 0) this.killSentry(sentry);
      }
    }
    for (const grabber of this.grabbers) {
      if (!grabber.active) continue;
      const dx = grabber.x - cx;
      const dy = grabber.y - cy;
      if (dx * dx + dy * dy < r2) {
        grabber.hp -= AURA_DPS;
        grabber.hitFlash = HIT_FLASH_FRAMES;
        if (grabber.hp <= 0) this.killGrabber(grabber);
      }
    }
    for (const tower of this.towers) {
      if (!tower.active) continue;
      const dx = tower.x - cx;
      const dy = tower.y - cy;
      if (dx * dx + dy * dy < r2) {
        tower.hp -= AURA_DPS;
        tower.hitFlash = HIT_FLASH_FRAMES;
        if (tower.hp <= 0) this.killTower(tower);
      }
    }
    for (const mt of this.missileTowers) {
      if (!mt.active) continue;
      const dx = mt.x - cx;
      const dy = mt.y - cy;
      if (dx * dx + dy * dy < r2) {
        mt.hp -= AURA_DPS;
        mt.hitFlash = HIT_FLASH_FRAMES;
        if (mt.hp <= 0) this.killMissileTower(mt);
      }
    }
    for (const mg of this.magmaTowers) {
      if (!mg.active) continue;
      const dx = mg.x - cx;
      const dy = mg.y - cy;
      if (dx * dx + dy * dy < r2) {
        mg.hp -= AURA_DPS;
        mg.hitFlash = HIT_FLASH_FRAMES;
        if (mg.hp <= 0) this.killMagmaTower(mg);
      }
    }
  }

  /** Apply thruster damage. Checks area around and behind ship. */
  applyThrusterDamage(shipX: number, shipY: number, shipAngle: number): void {
    const backX = shipX - Math.cos(shipAngle) * 12;
    const backY = shipY - Math.sin(shipAngle) * 12;
    const r2 = THRUSTER_RANGE * THRUSTER_RANGE;

    for (const leech of this.leeches) {
      if (!leech.active) continue;
      const dx1 = leech.x - shipX;
      const dy1 = leech.y - shipY;
      const dx2 = leech.x - backX;
      const dy2 = leech.y - backY;
      if (dx1 * dx1 + dy1 * dy1 < r2 || dx2 * dx2 + dy2 * dy2 < r2) {
        leech.hp -= THRUSTER_DPS;
        leech.hitFlash = HIT_FLASH_FRAMES;
        if (leech.hp <= 0) this.killLeech(leech);
      }
    }
    for (const sentry of this.sentries) {
      if (!sentry.active) continue;
      const dx1 = sentry.x - shipX;
      const dy1 = sentry.y - shipY;
      const dx2 = sentry.x - backX;
      const dy2 = sentry.y - backY;
      if (dx1 * dx1 + dy1 * dy1 < r2 || dx2 * dx2 + dy2 * dy2 < r2) {
        sentry.hp -= THRUSTER_DPS;
        sentry.hitFlash = HIT_FLASH_FRAMES;
        if (sentry.hp <= 0) this.killSentry(sentry);
      }
    }
    for (const grabber of this.grabbers) {
      if (!grabber.active) continue;
      const dx1 = grabber.x - shipX;
      const dy1 = grabber.y - shipY;
      const dx2 = grabber.x - backX;
      const dy2 = grabber.y - backY;
      if (dx1 * dx1 + dy1 * dy1 < r2 || dx2 * dx2 + dy2 * dy2 < r2) {
        grabber.hp -= THRUSTER_DPS;
        grabber.hitFlash = HIT_FLASH_FRAMES;
        if (grabber.hp <= 0) this.killGrabber(grabber);
      }
    }
    for (const tower of this.towers) {
      if (!tower.active) continue;
      const dx1 = tower.x - shipX;
      const dy1 = tower.y - shipY;
      const dx2 = tower.x - backX;
      const dy2 = tower.y - backY;
      if (dx1 * dx1 + dy1 * dy1 < r2 || dx2 * dx2 + dy2 * dy2 < r2) {
        tower.hp -= THRUSTER_DPS;
        tower.hitFlash = HIT_FLASH_FRAMES;
        if (tower.hp <= 0) this.killTower(tower);
      }
    }
    for (const mt of this.missileTowers) {
      if (!mt.active) continue;
      const dx1 = mt.x - shipX;
      const dy1 = mt.y - shipY;
      const dx2 = mt.x - backX;
      const dy2 = mt.y - backY;
      if (dx1 * dx1 + dy1 * dy1 < r2 || dx2 * dx2 + dy2 * dy2 < r2) {
        mt.hp -= THRUSTER_DPS;
        mt.hitFlash = HIT_FLASH_FRAMES;
        if (mt.hp <= 0) this.killMissileTower(mt);
      }
    }
    for (const mg of this.magmaTowers) {
      if (!mg.active) continue;
      const dx1 = mg.x - shipX;
      const dy1 = mg.y - shipY;
      const dx2 = mg.x - backX;
      const dy2 = mg.y - backY;
      if (dx1 * dx1 + dy1 * dy1 < r2 || dx2 * dx2 + dy2 * dy2 < r2) {
        mg.hp -= THRUSTER_DPS;
        mg.hitFlash = HIT_FLASH_FRAMES;
        if (mg.hp <= 0) this.killMagmaTower(mg);
      }
    }
  }

  /** Check if any leech is attached to the ship. */
  hasAttachedLeech(): boolean {
    return this.leeches.some(l => l.active && l.state === 'attached');
  }

  private killLeech(leech: WallLeech): void {
    this.deathEvents.push({ x: leech.x, y: leech.y });
    leech.active = false;
    leech.state = 'dormant';
  }

  private killSentry(sentry: CaveSentry): void {
    this.deathEvents.push({ x: sentry.x, y: sentry.y });
    sentry.active = false;
    sentry.bullets = [];
  }

  private killGrabber(grabber: WallGrabber): void {
    this.deathEvents.push({ x: grabber.x, y: grabber.y });
    grabber.active = false;
    grabber.state = 'idle';
  }

  private killTower(tower: BulletTower): void {
    this.deathEvents.push({ x: tower.x, y: tower.y });
    tower.active = false;
    tower.bullets = [];
  }

  private killMissileTower(mt: MissileTower): void {
    this.deathEvents.push({ x: mt.x, y: mt.y });
    mt.active = false;
    mt.missiles = [];
  }

  private killMagmaTower(mg: MagmaTower): void {
    this.deathEvents.push({ x: mg.x, y: mg.y });
    mg.active = false;
    mg.blobs = [];
  }

  /** Spawn red impact particles at a position. */
  private spawnImpact(x: number, y: number): void {
    for (let i = 0; i < IMPACT_PARTICLE_COUNT; i++) {
      const angle = (i / IMPACT_PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 0.3 + Math.random() * 0.7;
      this.impacts.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: IMPACT_PARTICLE_LIFE,
      });
    }
  }

  /** Drain and return death events (GameScene spawns particles). */
  drainDeathEvents(): { x: number; y: number }[] {
    if (this.deathEvents.length === 0) return [];
    const events = this.deathEvents.slice();
    this.deathEvents.length = 0;
    return events;
  }

  /** Drain projectile wall hit events (GameScene spawns small splats). */
  drainProjectileWallHits(): { x: number; y: number }[] {
    if (this.projectileWallHits.length === 0) return [];
    const events = this.projectileWallHits.slice();
    this.projectileWallHits.length = 0;
    return events;
  }

  /** Drain blob impact events (GameScene spawns erosion particles). */
  drainBlobImpacts(): { x: number; y: number }[] {
    if (this.blobImpactEvents.length === 0) return [];
    const events = this.blobImpactEvents.slice();
    this.blobImpactEvents.length = 0;
    return events;
  }

  // ── Render ─────────────────────────────────────────────────────

  render(
    g: Phaser.GameObjects.Graphics,
    camX: number, camY: number,
    time: number,
  ): void {
    for (const leech of this.leeches) {
      if (!leech.active) continue;

      const sx = leech.x - camX;
      const sy = leech.y - camY;
      if (sx < -20 || sx > GAME_WIDTH + 20 || sy < -20 || sy > GAME_HEIGHT + 20) continue;

      const pulse = Math.sin(time * 0.005) * 0.5 + 0.5;
      const col = leech.hitFlash > 0 ? 0xffffff : 0xff2222;
      const colGlow = leech.hitFlash > 0 ? 0xffffff : 0xff4444;

      switch (leech.state) {
        case 'dormant': {
          g.fillStyle(col, 0.5 + pulse * 0.2);
          g.fillRect(sx - LEECH_SIZE, sy - LEECH_SIZE, LEECH_SIZE * 2, LEECH_SIZE * 2);
          g.lineStyle(1, colGlow, 0.1 + pulse * 0.1);
          g.strokeRect(sx - LEECH_SIZE - 1, sy - LEECH_SIZE - 1, LEECH_SIZE * 2 + 2, LEECH_SIZE * 2 + 2);
          break;
        }
        case 'chasing': {
          g.fillStyle(col, 0.8 + pulse * 0.2);
          g.fillRect(sx - LEECH_SIZE, sy - LEECH_SIZE, LEECH_SIZE * 2, LEECH_SIZE * 2);
          g.lineStyle(1, colGlow, 0.2 + pulse * 0.3);
          g.strokeCircle(sx, sy, LEECH_SIZE + 2 + pulse * 2);
          break;
        }
        case 'attached': {
          const flash = Math.sin(time * 0.02) > 0 ? 1 : 0.4;
          g.fillStyle(col, flash);
          g.fillRect(sx - LEECH_SIZE, sy - LEECH_SIZE, LEECH_SIZE * 2, LEECH_SIZE * 2);
          g.lineStyle(1, leech.hitFlash > 0 ? 0xffffff : 0xff0000, flash * 0.5);
          g.strokeCircle(sx, sy, LEECH_SIZE + 3);
          break;
        }
      }
    }

    // ── Sentries ──
    for (const sentry of this.sentries) {
      if (!sentry.active) continue;

      const sx = sentry.x - camX;
      const sy = sentry.y - camY;
      if (sx < -20 || sx > GAME_WIDTH + 20 || sy < -20 || sy > GAME_HEIGHT + 20) continue;

      const pulse = Math.sin(time * 0.005) * 0.5 + 0.5;
      const isAlert = sentry.state === 'alert';
      const alpha = isAlert ? (0.8 + pulse * 0.2) : (0.4 + pulse * 0.15);
      const col = sentry.hitFlash > 0 ? 0xffffff : 0xff2222;
      const colGlow = sentry.hitFlash > 0 ? 0xffffff : 0xff4444;

      // Body — circle
      g.fillStyle(col, alpha);
      g.fillCircle(sx, sy, SENTRY_SIZE);

      // Two diamond wings
      const wingOffset = SENTRY_SIZE + SENTRY_WING_SIZE;
      for (const side of [-1, 1]) {
        const wx = sx + side * wingOffset;
        g.fillStyle(col, alpha * 0.9);
        g.fillTriangle(
          wx - SENTRY_WING_SIZE, sy,
          wx, sy - SENTRY_WING_SIZE,
          wx + SENTRY_WING_SIZE, sy,
        );
        g.fillTriangle(
          wx - SENTRY_WING_SIZE, sy,
          wx, sy + SENTRY_WING_SIZE,
          wx + SENTRY_WING_SIZE, sy,
        );
      }

      // Glow ring
      g.lineStyle(1, colGlow, isAlert ? (0.3 + pulse * 0.3) : (0.1 + pulse * 0.1));
      g.strokeCircle(sx, sy, SENTRY_SIZE + 3 + pulse * 2);

      // Render bullets
      for (const bullet of sentry.bullets) {
        if (!bullet.active) continue;
        const bx = bullet.x - camX;
        const by = bullet.y - camY;
        if (bx < -5 || bx > GAME_WIDTH + 5 || by < -5 || by > GAME_HEIGHT + 5) continue;

        g.fillStyle(0xff4444, 0.9);
        g.fillCircle(bx, by, 1.5);
        // Bullet trail
        g.lineStyle(1, 0xff2222, 0.3);
        g.lineBetween(bx, by, bx - bullet.vx * 2, by - bullet.vy * 2);
      }
    }

    // ── Wall Grabbers ──
    for (const grabber of this.grabbers) {
      if (!grabber.active) continue;

      const sx = grabber.x - camX;
      const sy = grabber.y - camY;
      if (sx < -100 || sx > GAME_WIDTH + 100 || sy < -100 || sy > GAME_HEIGHT + 100) continue;

      const pulse = Math.sin(time * 0.004) * 0.5 + 0.5;
      const isActive = grabber.state !== 'idle';
      const col = grabber.hitFlash > 0 ? 0xffffff : 0xff2222;
      const colGlow = grabber.hitFlash > 0 ? 0xffffff : 0xff4444;

      // Body — box on wall
      g.fillStyle(col, isActive ? 0.9 : (0.4 + pulse * 0.2));
      g.fillRect(sx - GRABBER_SIZE, sy - GRABBER_SIZE, GRABBER_SIZE * 2, GRABBER_SIZE * 2);

      // Glow
      g.lineStyle(1, colGlow, isActive ? 0.4 : (0.1 + pulse * 0.1));
      g.strokeRect(sx - GRABBER_SIZE - 1, sy - GRABBER_SIZE - 1, GRABBER_SIZE * 2 + 2, GRABBER_SIZE * 2 + 2);

      // Tether line
      if (grabber.state === 'shooting' || grabber.state === 'holding' || grabber.state === 'retracting') {
        const tx = grabber.tetherTipX - camX;
        const ty = grabber.tetherTipY - camY;

        // Tether line — flickers when holding
        const tetherAlpha = grabber.state === 'holding'
          ? (Math.sin(time * 0.015) > 0 ? 0.8 : 0.4)
          : 0.6;
        g.lineStyle(1, 0xff4444, tetherAlpha);
        g.lineBetween(sx, sy, tx, ty);

        // Tether tip dot
        if (grabber.state === 'shooting') {
          g.fillStyle(0xff6666, 0.9);
          g.fillCircle(tx, ty, 1.5);
        }
      }
    }

    // ── Bullet Towers ──
    for (const tower of this.towers) {
      if (!tower.active) continue;

      const sx = tower.x - camX;
      const sy = tower.y - camY;
      if (sx < -20 || sx > GAME_WIDTH + 20 || sy < -20 || sy > GAME_HEIGHT + 20) continue;

      const pulse = Math.sin(time * 0.005) * 0.5 + 0.5;
      const isAwake = tower.state === 'awake';
      const alpha = isAwake ? 1 : 0.5;
      const col = tower.hitFlash > 0 ? 0xffffff : 0xff2222;
      const colGlow = tower.hitFlash > 0 ? 0xffffff : 0xff4444;

      // Body — box
      g.fillStyle(col, alpha);
      g.fillRect(sx - TOWER_SIZE, sy - TOWER_SIZE, TOWER_SIZE * 2, TOWER_SIZE * 2);

      // Rotation indicator — line showing current fire direction
      if (isAwake) {
        const lineLen = TOWER_SIZE + 3;
        g.lineStyle(1, tower.hitFlash > 0 ? 0xffffff : 0xff6666, 0.7);
        g.lineBetween(
          sx, sy,
          sx + Math.cos(tower.rotAngle) * lineLen,
          sy + Math.sin(tower.rotAngle) * lineLen,
        );
      }

      // Glow
      g.lineStyle(1, colGlow, isAwake ? (0.3 + pulse * 0.3) : (0.1 + pulse * 0.1));
      g.strokeCircle(sx, sy, TOWER_SIZE + 2 + pulse * 2);

      // Render bullets
      for (const bullet of tower.bullets) {
        if (!bullet.active) continue;
        const bx = bullet.x - camX;
        const by = bullet.y - camY;
        if (bx < -5 || bx > GAME_WIDTH + 5 || by < -5 || by > GAME_HEIGHT + 5) continue;

        g.fillStyle(0xff6644, 0.8);
        g.fillCircle(bx, by, 1);
      }
    }

    // ── Missile Towers ──
    for (const mt of this.missileTowers) {
      if (!mt.active) continue;

      const sx = mt.x - camX;
      const sy = mt.y - camY;
      if (sx < -20 || sx > GAME_WIDTH + 20 || sy < -20 || sy > GAME_HEIGHT + 20) continue;

      const isAwake = mt.state === 'awake';
      const alpha = isAwake ? 1 : 0.5;
      const col = mt.hitFlash > 0 ? 0xffffff : 0xff2222;

      // Triangle vertices
      const topX = sx, topY = sy - MTOWER_SIZE;
      const blX = sx - MTOWER_SIZE, blY = sy + MTOWER_SIZE;
      const brX = sx + MTOWER_SIZE, brY = sy + MTOWER_SIZE;

      // Fill level: 1 = full (ready to fire), 0 = empty (just fired)
      const fillRatio = 1 - mt.fireCooldown / MTOWER_FIRE_COOLDOWN;
      const totalH = MTOWER_SIZE * 2; // triangle height top→bottom

      if (fillRatio >= 0.99) {
        // Fully charged — solid fill
        g.fillStyle(col, alpha);
        g.fillTriangle(topX, topY, blX, blY, brX, brY);
      } else {
        // Outline only
        g.lineStyle(1, col, alpha);
        g.lineBetween(topX, topY, blX, blY);
        g.lineBetween(blX, blY, brX, brY);
        g.lineBetween(brX, brY, topX, topY);

        // Partial fill rising from bottom
        if (fillRatio > 0.01) {
          const fillH = fillRatio * totalH;
          const cutY = blY - fillH;
          const t = fillH / totalH;
          const halfW = MTOWER_SIZE * (1 - t);
          g.fillStyle(col, alpha * 0.8);
          g.fillTriangle(
            sx - halfW, cutY,
            blX, blY,
            brX, brY,
          );
          g.fillTriangle(
            sx - halfW, cutY,
            sx + halfW, cutY,
            brX, brY,
          );
        }
      }

      // Render missiles
      for (const m of mt.missiles) {
        if (!m.active) continue;
        const mx = m.x - camX;
        const my = m.y - camY;
        if (mx < -10 || mx > GAME_WIDTH + 10 || my < -10 || my > GAME_HEIGHT + 10) continue;

        // Flash during last second (60 frames)
        const dying = m.life < 60;
        if (dying && Math.floor(m.life / 4) % 2 === 0) continue; // blink off

        // Missile — small triangle pointing in travel direction
        const angle = Math.atan2(m.vy, m.vx);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const mSize = 3;
        const mAlpha = dying ? 0.5 + (m.life / 60) * 0.4 : 0.9;

        g.fillStyle(0xff4422, mAlpha);
        g.fillTriangle(
          mx + cos * mSize, my + sin * mSize,              // nose
          mx - cos * mSize - sin * 1.5, my - sin * mSize + cos * 1.5, // tail-left
          mx - cos * mSize + sin * 1.5, my - sin * mSize - cos * 1.5, // tail-right
        );

        // Missile trail
        g.lineStyle(1, 0xff6633, dying ? 0.2 : 0.4);
        g.lineBetween(mx, my, mx - m.vx * 4, my - m.vy * 4);
      }
    }

    // ── Magma Towers ──
    for (const mg of this.magmaTowers) {
      if (!mg.active) continue;

      const sx = mg.x - camX;
      const sy = mg.y - camY;
      if (sx < -20 || sx > GAME_WIDTH + 20 || sy < -20 || sy > GAME_HEIGHT + 20) continue;

      const col = mg.hitFlash > 0 ? 0xffffff : 0xff2222;
      const colDark = mg.hitFlash > 0 ? 0xdddddd : 0xcc1111;
      const pulse = Math.sin(time * 0.006) * 0.3 + 0.7;
      const S = MAGMA_SIZE * 2; // 2x base size

      // Body — brain-like blob cluster
      const blobAlpha = mg.blobsLeft > 0 ? pulse : 0.3;

      // Core mass — always visible
      const coreWobble = Math.sin(time * 0.004) * 0.8;
      g.fillStyle(colDark, blobAlpha * 0.7);
      g.fillCircle(sx + coreWobble, sy - coreWobble * 0.5, S * 0.5);

      // Each ammo blob is a distinct lobe at a fixed angle, wobbling independently
      // Positions are seeded per-index so they look organic but stable
      for (let i = 0; i < mg.blobsLeft; i++) {
        // Fixed base angle evenly spread, offset so they don't overlap the core perfectly
        const baseAngle = (i / MAGMA_MAX_BLOBS) * Math.PI * 2 + 0.3;
        // Wobble in position
        const wobX = Math.sin(time * 0.005 + i * 2.1) * 1.5;
        const wobY = Math.cos(time * 0.007 + i * 3.3) * 1.5;
        // Wobble in size
        const sizeWob = Math.sin(time * 0.009 + i * 1.7) * 0.15 + 1;
        // Distance from center — spread out
        const dist = S * 0.55 + Math.sin(time * 0.003 + i * 4.1) * 1;

        const bx = sx + Math.cos(baseAngle) * dist + wobX;
        const by = sy + Math.sin(baseAngle) * dist + wobY;
        const blobR = S * 0.4 * sizeWob;

        // Lobe fill
        g.fillStyle(col, blobAlpha * 0.85);
        g.fillCircle(bx, by, blobR);
        // Darker crease where lobe meets core — gives brain-fold look
        g.lineStyle(1, colDark, blobAlpha * 0.4);
        g.strokeCircle(bx, by, blobR * 0.7);
      }

      // Render flying blobs
      for (const b of mg.blobs) {
        if (!b.active) continue;
        const bx = b.x - camX;
        const by = b.y - camY;
        if (bx < -10 || bx > GAME_WIDTH + 10 || by < -10 || by > GAME_HEIGHT + 10) continue;

        // Blob glow
        g.fillStyle(0xff3311, 0.3);
        g.fillCircle(bx, by, 4);
        // Blob core
        g.fillStyle(0xff4422, 0.9);
        g.fillCircle(bx, by, 2);
        // Trail
        g.lineStyle(1, 0xff3311, 0.3);
        g.lineBetween(bx, by, bx - b.vx * 3, by - b.vy * 3);
      }
    }

    // ── Impact particles ──
    for (const p of this.impacts) {
      const px = p.x - camX;
      const py = p.y - camY;
      if (px < -5 || px > GAME_WIDTH + 5 || py < -5 || py > GAME_HEIGHT + 5) continue;
      const alpha = p.life / IMPACT_PARTICLE_LIFE;
      // Glow halo
      g.fillStyle(0xff4444, alpha * 0.3);
      g.fillCircle(px, py, 3);
      // Bright core
      g.fillStyle(0xff6644, alpha);
      g.fillRect(Math.floor(px), Math.floor(py), 1, 1);
    }
  }
}
