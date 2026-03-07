import {
  Ore, ShipState,
  WORLD_WIDTH, WORLD_HEIGHT, GAME_WIDTH, GAME_HEIGHT,
  ORE_COUNTS, ORE_COLLECT_RADIUS, ORE_MIN_DISTANCES, ORE_COLORS,
} from '../../types/game';
import { TerrainSystem } from './TerrainSystem';

const FLASH_SPEED = 0.005; // tier 4 pulse rate

export interface OreCollectEvent {
  tier: number;
  x: number;
  y: number;
}

export class OreSystem {
  readonly ores: Ore[] = [];
  readonly collected: number[] = [0, 0, 0, 0]; // index 0 unused, tiers 1-3
  // Populated each frame by checkCollection/collectInRadius, drained by GameScene
  readonly collectEvents: OreCollectEvent[] = [];

  /** Place ores IN solid terrain — they must be carved out to reach. */
  scatter(terrain: TerrainSystem): void {
    const spawnX = WORLD_WIDTH / 2;
    const spawnY = WORLD_HEIGHT / 2;

    for (let tier = 1; tier <= 3; tier++) {
      const count = ORE_COUNTS[tier];
      const minDist = ORE_MIN_DISTANCES[tier];
      const minDist2 = minDist * minDist;
      let placed = 0;
      let attempts = 0;

      while (placed < count && attempts < count * 80) {
        attempts++;
        const x = Math.floor(40 + Math.random() * (WORLD_WIDTH - 80));
        const y = Math.floor(40 + Math.random() * (WORLD_HEIGHT - 80));
        const dx = x - spawnX;
        const dy = y - spawnY;
        if (dx * dx + dy * dy < minDist2) continue;

        // Must be inside solid terrain
        if (!terrain.isSolid(x, y)) continue;

        this.ores.push({
          x, y, tier, active: true,
          rotation: Math.random() * Math.PI * 2,
          scale: 0.7 + Math.random() * 0.6,
        });
        placed++;
      }
    }
  }

  /** Check touch-based collection against the ship. */
  checkCollection(ship: ShipState): void {
    const r2 = ORE_COLLECT_RADIUS * ORE_COLLECT_RADIUS;
    for (const ore of this.ores) {
      if (!ore.active) continue;
      const dx = ship.x - ore.x;
      const dy = ship.y - ore.y;
      if (dx * dx + dy * dy <= r2) {
        ore.active = false;
        this.collected[ore.tier]++;
        this.collectEvents.push({ tier: ore.tier, x: ore.x, y: ore.y });
      }
    }
  }

  /** Collect ores within a radius of (cx,cy). Returns collected ores. */
  collectInRadius(cx: number, cy: number, radius: number): Ore[] {
    const r2 = radius * radius;
    const result: Ore[] = [];
    for (const ore of this.ores) {
      if (!ore.active) continue;
      const dx = cx - ore.x;
      const dy = cy - ore.y;
      if (dx * dx + dy * dy <= r2) {
        ore.active = false;
        this.collected[ore.tier]++;
        this.collectEvents.push({ tier: ore.tier, x: ore.x, y: ore.y });
        result.push(ore);
      }
    }
    return result;
  }

  /** Pull active ores toward (cx,cy) by pullSpeed px. Returns ores that reached the ship. */
  pullOresInRadius(cx: number, cy: number, range: number, pullSpeed: number, collectDist: number): void {
    const range2 = range * range;
    const cd2 = collectDist * collectDist;
    for (const ore of this.ores) {
      if (!ore.active) continue;
      const dx = cx - ore.x;
      const dy = cy - ore.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > range2) continue;

      // Close enough to collect
      if (dist2 <= cd2) {
        ore.active = false;
        this.collected[ore.tier]++;
        continue;
      }

      // Pull toward ship
      const dist = Math.sqrt(dist2);
      ore.x += (dx / dist) * pullSpeed;
      ore.y += (dy / dist) * pullSpeed;
    }
  }

  render(
    graphics: Phaser.GameObjects.Graphics,
    camX: number,
    camY: number,
    time: number,
  ): void {
    for (const ore of this.ores) {
      if (!ore.active) continue;

      const sx = ore.x - camX;
      const sy = ore.y - camY;
      if (sx < -20 || sx > GAME_WIDTH + 20 || sy < -20 || sy > GAME_HEIGHT + 20) continue;

      const color = ORE_COLORS[ore.tier];
      const s = ore.scale;

      // Apply rotation: translate to ore center, rotate, draw at origin, restore
      graphics.save();
      graphics.translateCanvas(sx, sy);
      graphics.rotateCanvas(ore.rotation);

      if (ore.tier === 1) {
        this.drawSquareCluster(graphics, 0, 0, color, s);
      } else if (ore.tier === 2) {
        this.drawTriangleCluster(graphics, 0, 0, color, s);
      } else if (ore.tier === 3) {
        const flash = Math.sin(time * FLASH_SPEED) * 0.5 + 0.5;
        this.drawRhombusCluster(graphics, 0, 0, color, 0.55 + flash * 0.45, s);
      }

      graphics.restore();
    }
  }

  // Tier 1 — cluster of squares
  private drawSquareCluster(g: Phaser.GameObjects.Graphics, cx: number, cy: number, color: number, s: number): void {
    // Black outlines (1px larger on each side)
    const o = 1;
    g.fillStyle(0x000000, 0.9);
    g.fillRect(cx - 5 * s - o, cy - 5 * s - o, 6 * s + o * 2, 6 * s + o * 2);
    g.fillRect(cx + 2 * s - o, cy - 3 * s - o, 4 * s + o * 2, 4 * s + o * 2);
    g.fillRect(cx - 3 * s - o, cy + 2 * s - o, 4 * s + o * 2, 4 * s + o * 2);
    g.fillRect(cx + 3 * s - o, cy + 3 * s - o, 3 * s + o * 2, 3 * s + o * 2);
    g.fillRect(cx - 6 * s - o, cy - 2 * s - o, 2 * s + o * 2, 2 * s + o * 2);
    // Colored fill
    g.fillStyle(color, 0.85);
    g.fillRect(cx - 5 * s, cy - 5 * s, 6 * s, 6 * s);
    g.fillRect(cx + 2 * s, cy - 3 * s, 4 * s, 4 * s);
    g.fillRect(cx - 3 * s, cy + 2 * s, 4 * s, 4 * s);
    g.fillStyle(color, 0.5);
    g.fillRect(cx + 3 * s, cy + 3 * s, 3 * s, 3 * s);
    g.fillRect(cx - 6 * s, cy - 2 * s, 2 * s, 2 * s);
  }

  // Tier 2 — cluster of triangles
  private drawTriangleCluster(g: Phaser.GameObjects.Graphics, cx: number, cy: number, color: number, s: number): void {
    g.lineStyle(1, 0x000000, 0.9);
    g.fillStyle(color, 0.85);
    this.drawTri(g, cx, cy - 2 * s, 10 * s, true);
    g.fillStyle(color, 0.7);
    this.drawTri(g, cx + 6 * s, cy + 2 * s, 6 * s, true);
    g.fillStyle(color, 0.5);
    this.drawTri(g, cx - 5 * s, cy + 3 * s, 5 * s, true);
  }

  private drawTri(g: Phaser.GameObjects.Graphics, cx: number, cy: number, h: number, outline: boolean = false): void {
    const hh = h / 2;
    const hw = h * 0.58;
    g.beginPath();
    g.moveTo(cx, cy - hh);
    g.lineTo(cx + hw, cy + hh);
    g.lineTo(cx - hw, cy + hh);
    g.closePath();
    if (outline) g.strokePath();
    g.fillPath();
  }

  // Tier 4 — cluster of rhombuses (pulsing)
  private drawRhombusCluster(g: Phaser.GameObjects.Graphics, cx: number, cy: number, color: number, alpha: number, s: number): void {
    g.lineStyle(1, 0x000000, 0.9);
    g.fillStyle(color, alpha);
    this.drawRhombus(g, cx, cy, 10 * s, true);
    g.fillStyle(color, alpha * 0.7);
    this.drawRhombus(g, cx + 7 * s, cy - 1 * s, 6 * s, true);
    g.fillStyle(color, alpha * 0.5);
    this.drawRhombus(g, cx - 5 * s, cy + 4 * s, 5 * s, true);
  }

  private drawRhombus(g: Phaser.GameObjects.Graphics, cx: number, cy: number, size: number, outline: boolean = false): void {
    const half = size / 2;
    g.beginPath();
    g.moveTo(cx, cy - half);
    g.lineTo(cx + half, cy);
    g.lineTo(cx, cy + half);
    g.lineTo(cx - half, cy);
    g.closePath();
    if (outline) g.strokePath();
    g.fillPath();
  }
}
