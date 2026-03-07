import { ShipState, WORLD_WIDTH, WORLD_HEIGHT, GAME_WIDTH, GAME_HEIGHT } from '../../types/game';
import { TerrainSystem } from './TerrainSystem';
import { ParticleSystem } from './ParticleSystem';

const COLLECT_RADIUS = 10;
const DRAW_RADIUS    = 3;
const FLASH_SPEED    = 0.006;

const TOTAL_STEPS      = 7;   // expansion steps per explosion
const FINAL_RADIUS     = 80;  // px at last step
const FAST_STEPS       = 4;   // first N steps fire all in one frame
const FAST_DELAY_MS    = 0;   // 0 = same frame (while loop drains them instantly)
const SLOW_DELAY_MS    = 95;  // ms between the trailing steps
const CHAIN_DELAY_MS   = 80;  // short pause before a chain-triggered bomb starts

// Grid dimensions — one bomb per cell, even world coverage
const GRID_W = 14;
const GRID_H = 52;

interface Bomb {
  x: number;
  y: number;
  active: boolean;
}

interface ActiveExplosion {
  x: number;
  y: number;
  seed: number;       // drives the bumpy-circle harmonics
  step: number;       // how many steps have fired so far
  nextStepAt: number; // game time (ms) when the next step should fire
}

export class BombSystem {
  readonly bombs: Bomb[] = [];
  private activeExplosions: ActiveExplosion[] = [];

  /** Place one bomb per grid cell with 15% random skip for organic feel. */
  scatter(terrain: TerrainSystem): void {
    const spawnX  = WORLD_WIDTH  / 2;
    const spawnY  = WORLD_HEIGHT / 2;
    const clearR2 = 300 * 300;
    const MARGIN  = 60;

    const cellW = (WORLD_WIDTH  - MARGIN * 2) / GRID_W;
    const cellH = (WORLD_HEIGHT - MARGIN * 2) / GRID_H;

    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        if (Math.random() < 0.15) continue;

        const x = Math.floor(MARGIN + gx * cellW + Math.random() * cellW);
        const y = Math.floor(MARGIN + gy * cellH + Math.random() * cellH);

        const dx = x - spawnX;
        const dy = y - spawnY;
        if (dx * dx + dy * dy < clearR2) continue;
        if (terrain.isSolid(x, y)) continue;

        this.bombs.push({ x, y, active: true });
      }
    }
  }

  /** Returns the index of a collected bomb, or -1. */
  checkCollection(ship: ShipState): number {
    const r2 = COLLECT_RADIUS * COLLECT_RADIUS;
    for (let i = 0; i < this.bombs.length; i++) {
      const b = this.bombs[i];
      if (!b.active) continue;
      const dx = ship.x - b.x;
      const dy = ship.y - b.y;
      if (dx * dx + dy * dy <= r2) {
        b.active = false;
        return i;
      }
    }
    return -1;
  }

  /** Queue a bomb explosion — it will animate over ~500 ms. */
  explode(idx: number): void {
    const b    = this.bombs[idx];
    const seed = b.x * 13.7 + b.y * 7.3;
    // Fire initial particle burst immediately; terrain carving starts on first update
    this.activeExplosions.push({ x: b.x, y: b.y, seed, step: 0, nextStepAt: 0 });
  }

  /**
   * Advance all active explosions each frame.
   * Fast steps (1–FAST_STEPS) have 0 ms delay so the while-loop fires them
   * all in the same frame.  Slow steps drip out over ~95 ms each.
   * After every carve, nearby bombs are triggered as chain reactions.
   */
  update(terrain: TerrainSystem, particles: ParticleSystem, time: number): void {
    // Snapshot length — chain reactions append to the array mid-loop; we process
    // newly added ones in the next frame (they start with nextStepAt > time).
    const len = this.activeExplosions.length;
    for (let i = len - 1; i >= 0; i--) {
      const exp = this.activeExplosions[i];

      // Drain all steps whose scheduled time has passed (fires fast steps instantly)
      while (exp.step < TOTAL_STEPS && time >= exp.nextStepAt) {
        exp.step++;
        const t      = exp.step / TOTAL_STEPS;
        const radius = t * FINAL_RADIUS;

        terrain.explodeAt(exp.x, exp.y, radius, exp.seed);

        if (exp.step === 1) {
          particles.spawnExplosion(exp.x, exp.y);
          particles.spawnMediumSplat(exp.x, exp.y);
        }
        particles.spawnExplosionRing(exp.x, exp.y, radius, t);

        // Chain reaction: any bomb within the current blast radius goes off
        const r2 = radius * radius;
        for (const b of this.bombs) {
          if (!b.active) continue;
          const bdx = b.x - exp.x;
          const bdy = b.y - exp.y;
          if (bdx * bdx + bdy * bdy <= r2) {
            b.active = false;
            this.activeExplosions.push({
              x: b.x,
              y: b.y,
              seed: b.x * 13.7 + b.y * 7.3,
              step: 0,
              nextStepAt: time + CHAIN_DELAY_MS,
            });
          }
        }

        if (exp.step < TOTAL_STEPS) {
          const delay = exp.step < FAST_STEPS ? FAST_DELAY_MS : SLOW_DELAY_MS;
          exp.nextStepAt = time + delay;
        }
      }

      if (exp.step >= TOTAL_STEPS) {
        this.activeExplosions.splice(i, 1);
      }
    }
  }

  render(
    graphics: Phaser.GameObjects.Graphics,
    camX: number,
    camY: number,
    time: number
  ): void {
    const flash = Math.sin(time * FLASH_SPEED) * 0.5 + 0.5;

    for (const b of this.bombs) {
      if (!b.active) continue;

      const sx = b.x - camX;
      const sy = b.y - camY;
      if (sx < -12 || sx > GAME_WIDTH + 12 || sy < -12 || sy > GAME_HEIGHT + 12) continue;

      // Pulsing outer ring
      graphics.lineStyle(1, 0xffffff, 0.2 + flash * 0.3);
      graphics.strokeCircle(sx, sy, DRAW_RADIUS + 3 + flash * 2);

      // Solid inner dot
      graphics.fillStyle(0xffffff, 0.6 + flash * 0.4);
      graphics.fillCircle(sx, sy, DRAW_RADIUS);
    }
  }
}
