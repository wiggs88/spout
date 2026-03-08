import { PixelBuffer } from '../utils/PixelBuffer';
import { convChain } from '../utils/ConvChain';
import { CAVE_SAMPLE, SAMPLE_WIDTH, SAMPLE_HEIGHT } from '../data/caveSample';
import { debugConfig } from '../debug';
import { WORLD_WIDTH, WORLD_HEIGHT, TERRAIN_MAX_HP, ROCK_HP, GAME_WIDTH, GAME_HEIGHT } from '../../types/game';
import { ArtifactSystem } from './ArtifactSystem';

// Rest area detection radius (ship must be within this distance of center)
const REST_AREA_DETECT_RADIUS = 30;

export class TerrainSystem {
  buffer: PixelBuffer;
  private imageData: ImageData;
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private dirty: boolean = true;
  private lastViewX: number = -1;
  private lastViewY: number = -1;

  // Track the generated region (we generate in chunks as player ascends)
  private generatedUpTo: number;

  // Rest area (shop) locations
  readonly restAreas: { x: number; y: number }[] = [];


  constructor() {
    this.buffer = new PixelBuffer(WORLD_WIDTH, WORLD_HEIGHT);
    this.canvas = new OffscreenCanvas(GAME_WIDTH, GAME_HEIGHT);
    this.ctx = this.canvas.getContext('2d')!;
    this.imageData = this.ctx.createImageData(GAME_WIDTH, GAME_HEIGHT);
    this.generatedUpTo = WORLD_HEIGHT;
    this.generateInitial();
  }

  private generateInitial(): void {
    // Generate at 1/8 scale so ConvChain blob features become 64-80 px wide
    // chambers — navigable for the ship.  Then smooth the hard block edges
    // with a cellular-automaton majority pass to get organic curved walls.
    const SCALE = 8;
    const ccW = Math.ceil(WORLD_WIDTH  / SCALE); // 256
    const ccH = Math.ceil(WORLD_HEIGHT / SCALE); // 512

    const field = convChain(
      CAVE_SAMPLE, SAMPLE_WIDTH, SAMPLE_HEIGHT,
      ccW, ccH,
      3,    // N
      1.6,  // temperature
      3     // iterations
    );

    // Stamp each ConvChain cell → SCALE×SCALE block of terrain
    for (let cy = 0; cy < ccH; cy++) {
      const y0 = cy * SCALE;
      const y1 = Math.min(y0 + SCALE, WORLD_HEIGHT);
      for (let cx = 0; cx < ccW; cx++) {
        const hp = field[cy * ccW + cx] ? TERRAIN_MAX_HP : 0;
        const x0 = cx * SCALE;
        const x1 = Math.min(x0 + SCALE, WORLD_WIDTH);
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            this.buffer.data[y * WORLD_WIDTH + x] = hp;
          }
        }
      }
    }

    // Blur + threshold: average a 21×21 window around every pixel, then
    // re-threshold at 0.45.  This rounds ALL blob boundaries into smooth
    // organic curves — not just pixel corners — matching the reference images.
    this.smoothBlur(10, 0.45);

    // Winding shafts spread across the wider world to guarantee vertical connectivity
    this.carveConnectivityShafts();

    // Irregular blob starting chamber: several overlapping ellipses at
    // different offsets and sizes so it reads as a natural cave pocket,
    // not a perfect oval.
    this.carveStartingBlob(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);

    // Carve rest areas (shop locations) at depth intervals
    this.carveRestAreas();

    // Carve artifact corner rooms and expanded center hub
    ArtifactSystem.carveTerrain(this.buffer);

    // ── Grand corridor to flashlight chamber ─────────────────────
    // Wide entrance tapering into a pillared hallway, ending in a circular sanctum.
    const tunnelX = WORLD_WIDTH / 2; // 1024
    const sanctumY = 1750; // flashlight room center
    const entranceY = WORLD_HEIGHT / 2 - 100; // top of hub north channel

    // Wide entrance archway
    this.buffer.clearEllipse(tunnelX, entranceY, 30, 20);

    // Corridor with tapering width — wide at entrance, narrower in middle, opens at sanctum
    const corridorLen = entranceY - sanctumY;
    for (let i = 0; i <= corridorLen; i++) {
      const t = i / corridorLen; // 0 = entrance, 1 = sanctum
      // Width: wide → narrow → wide (hourglass profile)
      const narrowPoint = 0.5;
      const taper = t < narrowPoint
        ? 1 - (t / narrowPoint) * 0.5
        : 0.5 + ((t - narrowPoint) / (1 - narrowPoint)) * 0.5;
      const halfW = 10 + taper * 16;
      const y = entranceY - i;
      for (let x = tunnelX - halfW; x <= tunnelX + halfW; x++) {
        const xi = Math.floor(x);
        if (xi >= 0 && xi < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT) {
          this.buffer.data[y * WORLD_WIDTH + xi] = 0;
        }
      }
    }

    // Pillar niches along the corridor (symmetrical notches every 30px)
    const pillarSpacing = 30;
    const pillarCount = Math.floor(corridorLen / pillarSpacing);
    for (let p = 1; p < pillarCount; p++) {
      const py = entranceY - p * pillarSpacing;
      // Left and right alcoves
      this.buffer.clearEllipse(tunnelX - 22, py, 8, 6);
      this.buffer.clearEllipse(tunnelX + 22, py, 8, 6);
    }

    // Sanctum — large circular room for the flashlight
    this.buffer.clearEllipse(tunnelX, sanctumY, 50, 45);
    // Inner ring detail
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      this.buffer.clearEllipse(
        tunnelX + Math.cos(a) * 38,
        sanctumY + Math.sin(a) * 34,
        8, 8,
      );
    }
    // Small altar niche at the back (top of room)
    this.buffer.clearEllipse(tunnelX, sanctumY - 35, 15, 10);

    // Scatter indestructible rocks — placed last so they survive all carving.
    this.placeRocks();

    this.generatedUpTo = 0;
    this.dirty = true;
  }

  /**
   * Separable box-blur + threshold smoothing.
   *
   * Runs a horizontal then vertical sliding-window average over a (2R+1) wide
   * kernel, then rethresholds.  Because the kernel spans many pixels it rounds
   * the entire boundary of each blob — not just individual corners — producing
   * the wide smooth organic shapes seen in the ConvChain reference images.
   *
   * threshold < 0.5 biases toward open space (wider passages).
   * O(W × H) per axis — fast even at 2048 × 4096.
   */
  private smoothBlur(radius: number, threshold: number): void {
    const W = WORLD_WIDTH;
    const H = WORLD_HEIGHT;
    const data = this.buffer.data;

    // Horizontal pass → float buffer
    const hBuf = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let sum = 0;
      let count = 0;
      // Seed the window with the left edge
      for (let x = 0; x <= Math.min(radius, W - 1); x++) {
        sum += data[row + x] > 0 ? 1 : 0;
        count++;
      }
      for (let x = 0; x < W; x++) {
        const rx = x + radius + 1;
        if (rx < W) { sum += data[row + rx] > 0 ? 1 : 0; count++; }
        const lx = x - radius;
        if (lx > 0) { sum -= data[row + lx - 1] > 0 ? 1 : 0; count--; }
        hBuf[row + x] = sum / count;
      }
    }

    // Vertical pass over hBuf → back into data
    for (let x = 0; x < W; x++) {
      let sum = 0;
      let count = 0;
      for (let y = 0; y <= Math.min(radius, H - 1); y++) {
        sum += hBuf[y * W + x];
        count++;
      }
      for (let y = 0; y < H; y++) {
        const ry = y + radius + 1;
        if (ry < H) { sum += hBuf[ry * W + x]; count++; }
        const ly = y - radius;
        if (ly > 0) { sum -= hBuf[(ly - 1) * W + x]; count--; }
        data[y * W + x] = (sum / count) > threshold ? TERRAIN_MAX_HP : 0;
      }
    }
  }

  /**
   * Scatter ~55 indestructible rocks randomly across the world.
   * Each rock is a bumpy blob with radius 22–55 px (≥5× ship size).
   * Rocks are sparse — roughly one per 150 000 px² of world area.
   */
  private placeRocks(): void {
    const ROCK_COUNT  = 55;
    const spawnX      = WORLD_WIDTH  / 2;
    const spawnY      = WORLD_HEIGHT / 2;
    const clearR2     = 500 * 500; // keep rocks well away from start

    let placed = 0;
    let attempts = 0;
    while (placed < ROCK_COUNT && attempts < ROCK_COUNT * 40) {
      attempts++;
      const x      = Math.floor(80 + Math.random() * (WORLD_WIDTH  - 160));
      const y      = Math.floor(80 + Math.random() * (WORLD_HEIGHT - 160));
      const dx     = x - spawnX;
      const dy     = y - spawnY;
      if (dx * dx + dy * dy < clearR2) continue;

      // Only place where there is already solid cave wall — not in open space,
      // so rocks feel embedded in the rock rather than floating in caves.
      if (!this.buffer.isSolid(x, y)) continue;

      const radius = 22 + Math.random() * 33; // 22–55 px
      const seed   = x * 17.3 + y * 5.9;
      this.stampRock(x, y, radius, seed);
      placed++;
    }
  }

  /**
   * Stamp an indestructible rock blob using stacked sine harmonics to give
   * each rock a unique jagged silhouette.
   */
  private stampRock(cx: number, cy: number, radius: number, seed: number): void {
    const cxi = Math.round(cx);
    const cyi = Math.round(cy);

    const p1  = (seed * 2.3)  % (Math.PI * 2);
    const p2  = (seed * 5.7)  % (Math.PI * 2);
    const p3  = (seed * 11.1) % (Math.PI * 2);
    const p4  = (seed * 17.9) % (Math.PI * 2);

    const bound  = Math.ceil(radius * 1.35);
    const bound2 = bound * bound;

    for (let dy = -bound; dy <= bound; dy++) {
      for (let dx = -bound; dx <= bound; dx++) {
        if (dx * dx + dy * dy > bound2) continue;

        const angle = Math.atan2(dy, dx);
        // More harmonics + higher amplitude = rougher, more angular rocks
        const bump  = 1
          + Math.sin(angle * 2  + p1) * 0.22
          + Math.sin(angle * 5  + p2) * 0.14
          + Math.sin(angle * 9  + p3) * 0.08
          + Math.sin(angle * 15 + p4) * 0.04;
        const bR    = radius * bump;

        if (dx * dx + dy * dy <= bR * bR) {
          const px = cxi + dx;
          const py = cyi + dy;
          if (px >= 0 && px < WORLD_WIDTH && py >= 0 && py < WORLD_HEIGHT) {
            this.buffer.data[py * WORLD_WIDTH + px] = ROCK_HP;
          }
        }
      }
    }
  }

  /**
   * Carve an irregular blob-shaped starting chamber by unioning several
   * overlapping ellipses at varied offsets and radii.  The result looks like
   * a natural cave pocket rather than a geometric shape.
   */
  private carveStartingBlob(cx: number, cy: number): void {
    // ── Ancient chasm: symmetric, fractal-edged hub ──────────────
    // Central void with 4-fold symmetry and nested ring patterns.

    // Core octagon — slightly squashed for character
    this.buffer.clearEllipse(cx, cy, 120, 110);

    // Inner decorative ring — 8 evenly spaced alcoves at 45° intervals
    // Creates a gear/cog-like edge to the main chamber
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = 95;
      this.buffer.clearEllipse(
        cx + Math.cos(a) * r,
        cy + Math.sin(a) * r,
        30, 30,
      );
      // Smaller satellite alcoves (fractal detail)
      const r2 = 120;
      this.buffer.clearEllipse(
        cx + Math.cos(a) * r2,
        cy + Math.sin(a) * r2,
        18, 18,
      );
    }

    // 4 large pedestal bays at diagonal corners (45°, 135°, 225°, 315°)
    const off = 70;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      // Main bay
      this.buffer.clearEllipse(cx + sx * off, cy + sy * off, 40, 40);
      // Bridge connecting bay to core
      const steps = 8;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        this.buffer.clearEllipse(
          cx + sx * off * t,
          cy + sy * off * t,
          28 - t * 8, 28 - t * 8,
        );
      }
    }

    // 4 cardinal channels (N, S, E, W) — narrow passages between the bays
    // These give the chamber a cross/compass feel
    const channelLen = 100;
    const channelW = 14;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      for (let i = 0; i < channelLen; i++) {
        this.buffer.clearEllipse(
          cx + dx * i, cy + dy * i,
          channelW, channelW,
        );
      }
      // Small room at the end of each cardinal channel
      this.buffer.clearEllipse(
        cx + dx * channelLen,
        cy + dy * channelLen,
        22, 22,
      );
    }

    // Concentric ring detail — a subtle carved ring at r=75
    // Only carve thin arcs (not a full ring) for a broken/ancient look
    for (let a = 0; a < Math.PI * 2; a += 0.04) {
      const skip = Math.sin(a * 4) > 0.3; // skip segments for broken ring effect
      if (skip) continue;
      const r = 75;
      this.buffer.clearEllipse(
        cx + Math.cos(a) * r,
        cy + Math.sin(a) * r,
        4, 4,
      );
    }
  }

  /** Carve rest areas at regular depth intervals away from spawn (no shop at spawn). */
  private carveRestAreas(): void {
    const spawnY = WORLD_HEIGHT / 2;

    const spacing = 800;
    const count = 4;

    for (let i = 1; i <= count; i++) {
      const cy = spawnY - spacing * i;
      if (cy < 100) break;
      // Pick a random X near center with some variance
      const cx = WORLD_WIDTH / 2 + (Math.random() - 0.5) * 400;
      const cxClamped = Math.max(100, Math.min(WORLD_WIDTH - 100, Math.floor(cx)));

      // Carve a rounded-rectangle chamber matching the beacon outline
      this.buffer.clearRoundedRect(cxClamped, cy, 35, 25, 8);

      this.restAreas.push({ x: cxClamped, y: cy });
    }
  }

  /** Carve two winding 5 px-wide shafts top-to-bottom to guarantee connectivity. */
  private carveConnectivityShafts(): void {
    const rng = (seed: number) => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return { value: (seed >>> 0) / 0xffffffff, seed };
    };

    const shafts = [
      { startX: WORLD_WIDTH * 0.18, seed: 31337 },
      { startX: WORLD_WIDTH * 0.40, seed: 99991 },
      { startX: WORLD_WIDTH * 0.60, seed: 12345 },
      { startX: WORLD_WIDTH * 0.82, seed: 65535 },
    ];

    for (const shaft of shafts) {
      let pathX = shaft.startX;
      let s = shaft.seed;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const r = rng(s); s = r.seed;
        pathX += (r.value - 0.5) * 7;
        pathX = Math.max(20, Math.min(WORLD_WIDTH - 20, pathX));
        this.buffer.clearEllipse(pathX, y, 14, 8);
      }
    }
  }


  damage(x: number, y: number, amount: number = 1): boolean {
    const destroyed = this.buffer.damage(x, y, amount);
    if (destroyed) this.dirty = true;
    return destroyed;
  }

  /**
   * Carve an irregular blob circle into the terrain.
   * The radius varies with angle using stacked sine harmonics keyed to `seed`
   * so every bomb produces a uniquely shaped but deterministic crater.
   */
  explodeAt(cx: number, cy: number, radius: number, seed: number = 0): void {
    const cxi = Math.round(cx);
    const cyi = Math.round(cy);

    // Deterministic phase offsets — unique per bomb location
    const p1 = (seed * 2.3)  % (Math.PI * 2);
    const p2 = (seed * 5.7)  % (Math.PI * 2);
    const p3 = (seed * 9.1)  % (Math.PI * 2);

    const bound = Math.ceil(radius * 1.25);
    const bound2 = bound * bound;

    for (let dy = -bound; dy <= bound; dy++) {
      for (let dx = -bound; dx <= bound; dx++) {
        if (dx * dx + dy * dy > bound2) continue;

        const angle  = Math.atan2(dy, dx);
        const bump   = 1
          + Math.sin(angle * 3  + p1) * 0.14
          + Math.sin(angle * 7  + p2) * 0.08
          + Math.sin(angle * 13 + p3) * 0.04;
        const bumpR  = radius * bump;

        if (dx * dx + dy * dy <= bumpR * bumpR) {
          const px = cxi + dx;
          const py = cyi + dy;
          if (px >= 0 && px < WORLD_WIDTH && py >= 0 && py < WORLD_HEIGHT) {
            const idx = py * WORLD_WIDTH + px;
            if (this.buffer.data[idx] !== ROCK_HP) {
              this.buffer.data[idx] = 0;
            }
          }
        }
      }
    }
    this.dirty = true;
  }

  isSolid(x: number, y: number): boolean {
    return this.buffer.get(x, y) > debugConfig.wallThreshold;
  }

  markDirty(): void {
    this.dirty = true;
  }

  // Render the visible 512×512 viewport of terrain to a Phaser CanvasTexture.
  // This is a CPU per-pixel loop — it writes grayscale terrain + green rest-area tint.
  // FOG IS NOT APPLIED HERE — fog is handled by the CRT PostFX shader (GPU).
  // Do not add fog, visibility masking, or darkening to this method.
  renderToTexture(
    phaserTexture: Phaser.Textures.CanvasTexture,
    cameraX: number,
    cameraY: number,
  ): void {
    const pixels = this.imageData.data;
    const viewX = Math.floor(cameraX);
    const viewY = Math.floor(cameraY);

    // Skip the full pixel loop if nothing changed
    if (!this.dirty && viewX === this.lastViewX && viewY === this.lastViewY) return;
    this.lastViewX = viewX;
    this.lastViewY = viewY;

    for (let sy = 0; sy < GAME_HEIGHT; sy++) {
      const worldY = viewY + sy;
      for (let sx = 0; sx < GAME_WIDTH; sx++) {
        const worldX = viewX + sx;
        const idx = (sy * GAME_WIDTH + sx) * 4;
        const hp = this.buffer.get(worldX, worldY);

        if (hp > debugConfig.wallThreshold) {
          let r: number, g: number, b: number;
          if (hp === ROCK_HP) {
            const variation = ((worldX * 7 + worldY * 13) & 7);
            const shade = 210 + variation;
            r = shade; g = shade; b = shade;
          } else {
            const t = hp / TERRAIN_MAX_HP;
            const variation = ((worldX * 7 + worldY * 13) & 15) - 8;
            const shade = Math.min(255, Math.max(0, Math.floor(30 + t * 130 + variation)));
            r = shade; g = shade; b = shade;
          }

          // Tint walls near rest areas green
          const tint = this.getRestAreaTint(worldX, worldY);
          if (tint > 0) {
            r = Math.floor(r * (1 - tint * 0.4));
            g = Math.min(255, Math.floor(g * (1 + tint * 0.3)));
            b = Math.floor(b * (1 - tint * 0.3));
          }

          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = 255;
        } else {
          pixels[idx] = 0;
          pixels[idx + 1] = 0;
          pixels[idx + 2] = 0;
          pixels[idx + 3] = 255;
        }
      }
    }

    this.ctx.putImageData(this.imageData, 0, 0);
    phaserTexture.context.drawImage(this.canvas, 0, 0);
    phaserTexture.refresh();
    this.dirty = false;
  }

  /** Returns 0-1 tint strength for walls near rest areas (for green tinting). */
  private getRestAreaTint(x: number, y: number): number {
    const TINT_RADIUS = 50;
    const TINT_R2 = TINT_RADIUS * TINT_RADIUS;
    for (const area of this.restAreas) {
      const dx = x - area.x;
      const dy = y - area.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < TINT_R2) {
        return 1 - Math.sqrt(d2) / TINT_RADIUS;
      }
    }
    return 0;
  }

  /** Check if a position is within a rest area. */
  isNearRestArea(x: number, y: number): boolean {
    const r2 = REST_AREA_DETECT_RADIUS * REST_AREA_DETECT_RADIUS;
    for (const area of this.restAreas) {
      const dx = x - area.x;
      const dy = y - area.y;
      if (dx * dx + dy * dy < r2) return true;
    }
    return false;
  }

  /** Render pulsing beacon and border ring at each rest area. */
  renderRestAreaBeacons(
    graphics: Phaser.GameObjects.Graphics,
    camX: number, camY: number, time: number,
  ): void {
    const pulse = Math.sin(time * 0.003) * 0.3 + 0.7;
    const slowPulse = Math.sin(time * 0.0015) * 0.15 + 0.85;
    for (const area of this.restAreas) {
      const sx = area.x - camX;
      const sy = area.y - camY;
      if (sx < -60 || sx > GAME_WIDTH + 60 || sy < -60 || sy > GAME_HEIGHT + 60) continue;

      // Outer rounded rectangle marking the chamber boundary
      graphics.lineStyle(1, 0x44ff88, slowPulse * 0.2);
      graphics.strokeRoundedRect(sx - 35, sy - 25, 70, 50, 8);

      // Inner glow ring
      graphics.lineStyle(1, 0x44ff88, pulse * 0.35);
      graphics.strokeCircle(sx, sy, 8 + pulse * 3);

      // Center diamond marker (4 pixels in a diamond)
      graphics.fillStyle(0x44ff88, pulse * 0.9);
      graphics.fillRect(sx, sy - 2, 1, 1);
      graphics.fillRect(sx, sy + 2, 1, 1);
      graphics.fillRect(sx - 2, sy, 1, 1);
      graphics.fillRect(sx + 2, sy, 1, 1);
      graphics.fillStyle(0x44ff88, 1);
      graphics.fillRect(sx, sy, 1, 1);
    }
  }

  /** Returns the screen-space position (0–1 ratio) of the nearest rest area, or null if none. */
  getNearestRestAreaScreenPos(
    camX: number, camY: number,
    shipX: number, shipY: number,
  ): { x: number; y: number } | null {
    let nearest: { x: number; y: number } | null = null;
    let nearestDist2 = Infinity;
    for (const area of this.restAreas) {
      const dx = area.x - shipX;
      const dy = area.y - shipY;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestDist2) { nearestDist2 = d2; nearest = area; }
    }
    if (!nearest) return null;
    const sx = nearest.x - camX;
    const sy = nearest.y - camY;
    return { x: sx / GAME_WIDTH, y: sy / GAME_HEIGHT };
  }

  /**
   * Returns the screen-space position (0–1 ratio) for the shop direction marker,
   * clamped to the screen edge. Returns null if the nearest shop is on screen.
   */
  getShopMarkerScreenPos(
    camX: number, camY: number,
    shipX: number, shipY: number,
  ): { x: number; y: number } | null {
    // Find nearest rest area to the ship
    let nearest: { x: number; y: number } | null = null;
    let nearestDist2 = Infinity;
    for (const area of this.restAreas) {
      const dx = area.x - shipX;
      const dy = area.y - shipY;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestDist2) {
        nearestDist2 = d2;
        nearest = area;
      }
    }
    if (!nearest) return null;

    // Screen position of the nearest rest area
    const sx = nearest.x - camX;
    const sy = nearest.y - camY;

    // If the beacon is visible on screen, no marker needed
    if (sx >= 0 && sx <= GAME_WIDTH && sy >= 0 && sy <= GAME_HEIGHT) return null;

    // Clamp to screen edge and return as 0–1 ratio
    const inset = 14;
    const cx = Math.max(inset, Math.min(GAME_WIDTH - inset, sx));
    const cy = Math.max(inset, Math.min(GAME_HEIGHT - inset, sy));
    return { x: cx / GAME_WIDTH, y: cy / GAME_HEIGHT };
  }
}
