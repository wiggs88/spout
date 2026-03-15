import {
  Ore, ShipState,
  WORLD_WIDTH, WORLD_HEIGHT, GAME_WIDTH, GAME_HEIGHT,
  ORE_COUNTS, ORE_COLLECT_RADIUS, ORE_MIN_DISTANCES, ORE_COLORS,
} from '../../types/game';
import { TerrainSystem } from './TerrainSystem';
import { ARTIFACT_HOMES, ARTIFACT_ZONE_EXCLUSION } from './ArtifactSystem';

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

        // Keep ores out of artifact fractal zones
        const ar2 = ARTIFACT_ZONE_EXCLUSION * ARTIFACT_ZONE_EXCLUSION;
        let inZone = false;
        for (const h of ARTIFACT_HOMES) {
          const dax = x - h.x; const day = y - h.y;
          if (dax * dax + day * day < ar2) { inZone = true; break; }
        }
        if (inZone) continue;

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
        this.drawSquareOre(graphics, color, s);
      } else if (ore.tier === 2) {
        this.drawTriangleOre(graphics, color, s);
      } else if (ore.tier === 3) {
        const flash = Math.sin(time * FLASH_SPEED) * 0.5 + 0.5;
        this.drawRhombusOre(graphics, color, 0.6 + flash * 0.4, s);
      }

      graphics.restore();
    }
  }

  // Wobbly black outline — expands each perimeter point outward from centroid
  // by (base + sine harmonics), producing an organic halo.
  private drawWobblyOutline(g: Phaser.GameObjects.Graphics, pts: [number, number][], base: number, amp: number, freq: number): void {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const STEPS = 10;
    const outline: [number, number][] = [];

    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      for (let k = 0; k < STEPS; k++) {
        const t = k / STEPS;
        const x = p1[0] + (p2[0] - p1[0]) * t;
        const y = p1[1] + (p2[1] - p1[1]) * t;
        const dx = x - cx; const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const angle = Math.atan2(dy, dx);
        const w = base
          + Math.sin(angle * freq) * amp
          + Math.sin(angle * freq * 1.7 + 0.9) * amp * 0.6
          + Math.sin(angle * freq * 2.9 + 1.4) * amp * 0.3;
        outline.push([x + (dx / dist) * w, y + (dy / dist) * w]);
      }
    }

    g.fillStyle(0x000000, 1);
    g.beginPath();
    g.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length; i++) g.lineTo(outline[i][0], outline[i][1]);
    g.closePath();
    g.fillPath();
  }

  // Tier 1 — single square with wobbly outline
  private drawSquareOre(g: Phaser.GameObjects.Graphics, color: number, s: number): void {
    const h = 5 * s;
    this.drawWobblyOutline(g, [[-h, -h], [h, -h], [h, h], [-h, h]], 2.5, 1.8, 5);
    g.fillStyle(color, 0.92);
    g.fillRect(-h, -h, h * 2, h * 2);
  }

  // Tier 2 — single triangle with wobbly outline
  private drawTriangleOre(g: Phaser.GameObjects.Graphics, color: number, s: number): void {
    const h = 5 * s;
    const hw = h * 0.87;
    const pts: [number, number][] = [[0, -h], [hw, h * 0.5], [-hw, h * 0.5]];
    this.drawWobblyOutline(g, pts, 2.5, 1.8, 5);
    g.fillStyle(color, 0.92);
    g.beginPath();
    g.moveTo(0, -h); g.lineTo(hw, h * 0.5); g.lineTo(-hw, h * 0.5);
    g.closePath(); g.fillPath();
  }

  // Tier 3 — single rhombus with wobbly outline (pulsing alpha)
  private drawRhombusOre(g: Phaser.GameObjects.Graphics, color: number, alpha: number, s: number): void {
    const h = 6 * s;
    this.drawWobblyOutline(g, [[0, -h], [h, 0], [0, h], [-h, 0]], 2.5, 1.8, 5);
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(0, -h); g.lineTo(h, 0); g.lineTo(0, h); g.lineTo(-h, 0);
    g.closePath(); g.fillPath();
  }
}
