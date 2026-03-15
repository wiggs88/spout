import { ShipState, WORLD_WIDTH, WORLD_HEIGHT, GAME_WIDTH, GAME_HEIGHT, TERRAIN_MAX_HP } from '../../types/game';
import { PixelBuffer } from '../utils/PixelBuffer';

// ── Types ──────────────────────────────────────────────────────────
type ArtifactShape = 'star' | 'squares' | 'coil' | 'pinwheel';

interface RopePoint {
  x: number;
  y: number;
  ox: number; // previous x (verlet)
  oy: number; // previous y (verlet)
}

interface Artifact {
  shape: ArtifactShape;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  pedestalX: number;
  pedestalY: number;
  state: 'idle' | 'carried' | 'placed';
  color: number;
  rope: RopePoint[];
  placedTime: number; // Phaser time when placed (0 = not yet placed)
}

// ── Layout constants ───────────────────────────────────────────────
const HUB_X = WORLD_WIDTH / 2;   // 1024
const HUB_Y = WORLD_HEIGHT / 2;  // 2048
const PEDESTAL_OFFSET = 70;
const CENTER_CIRCLE_RADIUS = 25;
const CORNER_ROOM_SIZE = 50;

// ── Artifact zone exclusion (exported for ore/enemy spawn exclusion) ──
export const ARTIFACT_ZONE_EXCLUSION = 225; // px radius kept clear of enemies/ores/rocks
export const ARTIFACT_HOMES: { x: number; y: number }[] = [
  { x: 200,  y: 200  },
  { x: 1848, y: 200  },
  { x: 200,  y: 3896 },
  { x: 1848, y: 3896 },
];

// ── Artifact definitions ───────────────────────────────────────────
const ARTIFACT_DEFS: {
  shape: ArtifactShape;
  homeX: number; homeY: number;
  pedestalDx: number; pedestalDy: number;
  color: number;
}[] = [
  { shape: 'star',     homeX: 200,  homeY: 200,  pedestalDx: -PEDESTAL_OFFSET, pedestalDy: -PEDESTAL_OFFSET, color: 0x00ffcc },
  { shape: 'squares',  homeX: 1848, homeY: 200,  pedestalDx:  PEDESTAL_OFFSET, pedestalDy: -PEDESTAL_OFFSET, color: 0xff44ff },
  { shape: 'coil',     homeX: 200,  homeY: 3896, pedestalDx: -PEDESTAL_OFFSET, pedestalDy:  PEDESTAL_OFFSET, color: 0xffcc00 },
  { shape: 'pinwheel', homeX: 1848, homeY: 3896, pedestalDx:  PEDESTAL_OFFSET, pedestalDy:  PEDESTAL_OFFSET, color: 0x4488ff },
];

// ── Rope physics (top-down, no gravity) ────────────────────────────
const ROPE_SEGMENTS = 8;
const ROPE_LENGTH = 28;
const SEGMENT_LENGTH = ROPE_LENGTH / ROPE_SEGMENTS;
const ROPE_DAMPING = 0.94;
const ROPE_ITERATIONS = 4;

// ── Interaction radii ──────────────────────────────────────────────
const COLLECT_RADIUS = 14;
const PLACE_RADIUS = 18;
const ARTIFACT_SIZE = 6; // visual half-size
const PEDESTAL_HALF = 12; // square pedestal half-size

// ════════════════════════════════════════════════════════════════════
export class ArtifactSystem {
  readonly artifacts: Artifact[] = [];
  private _allPlaced = false;
  private _playerInCircle = false;
  private _shakeEvents: { duration: number; intensity: number }[] = [];

  // Intro animation: null = normal rendering, otherwise controls element visibility/intensity
  introOverride: { ring: number; lines: number; towers: number; glow: number } | null = null;

  constructor() {
    for (const def of ARTIFACT_DEFS) {
      this.artifacts.push({
        shape: def.shape,
        x: def.homeX,
        y: def.homeY,
        homeX: def.homeX,
        homeY: def.homeY,
        pedestalX: HUB_X + def.pedestalDx,
        pedestalY: HUB_Y + def.pedestalDy,
        state: 'idle',
        color: def.color,
        rope: [],
        placedTime: 0,
      });
    }
  }

  get allPlaced(): boolean { return this._allPlaced; }
  get playerInCircle(): boolean { return this._playerInCircle; }

  /** Returns info about the nearest pedestal if the ship is within range, for UI tooltip. */
  getNearPedestal(shipX: number, shipY: number, camX: number, camY: number): {
    shape: ArtifactShape; color: number; screenX: number; screenY: number; placed: boolean;
  } | null {
    const TOOLTIP_RADIUS = 28;
    const r2 = TOOLTIP_RADIUS * TOOLTIP_RADIUS;
    for (const art of this.artifacts) {
      const dx = shipX - art.pedestalX;
      const dy = shipY - art.pedestalY;
      if (dx * dx + dy * dy < r2) {
        return {
          shape: art.shape,
          color: art.color,
          screenX: (art.pedestalX - camX) / GAME_WIDTH,
          screenY: (art.pedestalY - camY) / GAME_HEIGHT,
          placed: art.state === 'placed',
        };
      }
    }
    return null;
  }

  /** Returns screen-edge position (0–1 ratio) for the hub direction marker, or null if hub is on screen. */
  getHubMarkerScreenPos(camX: number, camY: number): { x: number; y: number } | null {
    if (this._allPlaced) return null; // no need once all artifacts placed

    const sx = HUB_X - camX;
    const sy = HUB_Y - camY;

    // If hub is visible on screen, no marker needed
    if (sx >= 0 && sx <= GAME_WIDTH && sy >= 0 && sy <= GAME_HEIGHT) return null;

    // Clamp to screen edge
    const inset = 14;
    const cx = Math.max(inset, Math.min(GAME_WIDTH - inset, sx));
    const cy = Math.max(inset, Math.min(GAME_HEIGHT - inset, sy));
    return { x: cx / GAME_WIDTH, y: cy / GAME_HEIGHT };
  }

  /** Drain pending camera shake events (called by GameScene each frame). */
  drainShakeEvents(): { duration: number; intensity: number }[] {
    const e = this._shakeEvents;
    this._shakeEvents = [];
    return e;
  }

  // ── Update ─────────────────────────────────────────────────────
  update(ship: ShipState, time: number): void {
    // Try to pick up any idle artifact near the ship or near the tail of carried chain
    const carried = this.artifacts.filter(a => a.state === 'carried');
    const anchorX = carried.length > 0
      ? carried[carried.length - 1].x
      : ship.x;
    const anchorY = carried.length > 0
      ? carried[carried.length - 1].y
      : ship.y;

    for (const art of this.artifacts) {
      if (art.state !== 'idle') continue;
      const dx = anchorX - art.x;
      const dy = anchorY - art.y;
      if (dx * dx + dy * dy < COLLECT_RADIUS * COLLECT_RADIUS) {
        art.state = 'carried';
        this.initRope(art, ship, carried);
        carried.push(art);
        this._shakeEvents.push({ duration: 180, intensity: 0.004 });
        break;
      }
      // Also check near ship directly
      const dx2 = ship.x - art.x;
      const dy2 = ship.y - art.y;
      if (dx2 * dx2 + dy2 * dy2 < COLLECT_RADIUS * COLLECT_RADIUS) {
        art.state = 'carried';
        this.initRope(art, ship, carried);
        carried.push(art);
        this._shakeEvents.push({ duration: 180, intensity: 0.004 });
        break;
      }
    }

    // Update rope physics for all carried artifacts (chained)
    for (let ci = 0; ci < carried.length; ci++) {
      const art = carried[ci];
      // First carried artifact attaches to ship, rest chain to previous artifact's tail
      const ancX = ci === 0 ? ship.x : carried[ci - 1].x;
      const ancY = ci === 0 ? ship.y : carried[ci - 1].y;
      this.updateRope(art, ancX, ancY);

      // Check placement at correct pedestal
      const tip = art.rope[art.rope.length - 1];
      const pdx = tip.x - art.pedestalX;
      const pdy = tip.y - art.pedestalY;
      if (pdx * pdx + pdy * pdy < PLACE_RADIUS * PLACE_RADIUS) {
        art.state = 'placed';
        art.x = art.pedestalX;
        art.y = art.pedestalY;
        art.rope = [];
        art.placedTime = time;
        this._allPlaced = this.artifacts.every(a => a.state === 'placed');
        this._shakeEvents.push({ duration: 350, intensity: 0.006 });
      }
    }

    // Check if player is in the center circle (only matters when all placed)
    if (this._allPlaced) {
      const dx = ship.x - HUB_X;
      const dy = ship.y - HUB_Y;
      this._playerInCircle = dx * dx + dy * dy < CENTER_CIRCLE_RADIUS * CENTER_CIRCLE_RADIUS;
    }
  }

  // ── Rope helpers (top-down, no gravity) ────────────────────────
  private initRope(art: Artifact, ship: ShipState, alreadyCarried: Artifact[]): void {
    // Anchor to the tail of the last carried artifact, or the ship
    const ancX = alreadyCarried.length > 0
      ? alreadyCarried[alreadyCarried.length - 1].x
      : ship.x;
    const ancY = alreadyCarried.length > 0
      ? alreadyCarried[alreadyCarried.length - 1].y
      : ship.y;

    art.rope = [];
    for (let i = 0; i <= ROPE_SEGMENTS; i++) {
      const t = i / ROPE_SEGMENTS;
      const x = ancX + (art.x - ancX) * t;
      const y = ancY + (art.y - ancY) * t;
      art.rope.push({ x, y, ox: x, oy: y });
    }
  }

  private updateRope(art: Artifact, anchorX: number, anchorY: number): void {
    const rope = art.rope;
    if (rope.length === 0) return;

    // Pin first point to anchor (ship or previous artifact)
    rope[0].ox = rope[0].x;
    rope[0].oy = rope[0].y;
    rope[0].x = anchorX;
    rope[0].y = anchorY;

    // Verlet integration — no gravity, just inertia + damping (top-down view)
    for (let i = 1; i < rope.length; i++) {
      const p = rope[i];
      const vx = (p.x - p.ox) * ROPE_DAMPING;
      const vy = (p.y - p.oy) * ROPE_DAMPING;
      p.ox = p.x;
      p.oy = p.y;
      p.x += vx;
      p.y += vy;
    }

    // Distance constraints
    for (let iter = 0; iter < ROPE_ITERATIONS; iter++) {
      for (let i = 0; i < rope.length - 1; i++) {
        const a = rope[i];
        const b = rope[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.001) continue;
        const diff = (dist - SEGMENT_LENGTH) / dist;
        const ox = dx * diff * 0.5;
        const oy = dy * diff * 0.5;

        if (i === 0) {
          b.x -= ox * 2;
          b.y -= oy * 2;
        } else {
          a.x += ox;
          a.y += oy;
          b.x -= ox;
          b.y -= oy;
        }
      }
    }

    // Artifact position = last rope point
    const last = rope[rope.length - 1];
    art.x = last.x;
    art.y = last.y;
  }

  // ── Rendering ──────────────────────────────────────────────────
  render(
    graphics: Phaser.GameObjects.Graphics,
    camX: number, camY: number, time: number,
  ): void {
    const pulse = Math.sin(time * 0.004) * 0.3 + 0.7;
    const glowPulse = Math.sin(time * 0.003) * 0.15 + 0.85;

    // Connection lines (behind everything)
    this.renderConnectionLines(graphics, camX, camY, pulse, time);

    // Center circle
    this.renderCenterCircle(graphics, camX, camY, time);

    // Pedestals
    for (const art of this.artifacts) {
      this.renderPedestal(graphics, art, camX, camY, pulse, time);
    }

    // Idle artifacts (at corners, glowing) — skip during intro
    if (!this.introOverride) {
      for (const art of this.artifacts) {
        if (art.state !== 'idle') continue;
        this.renderGlowingShape(
          graphics, art.x - camX, art.y - camY,
          art.shape, art.color, ARTIFACT_SIZE, pulse, glowPulse,
        );
      }
    }

    // Carried artifact + rope — skip during intro
    if (!this.introOverride) {
      for (const art of this.artifacts) {
        if (art.state !== 'carried') continue;
        this.renderRope(graphics, art, camX, camY);
        this.renderGlowingShape(
          graphics, art.x - camX, art.y - camY,
          art.shape, art.color, ARTIFACT_SIZE, pulse, glowPulse,
        );
      }
    }
  }

  // ── Sub-renderers ──────────────────────────────────────────────

  private renderPedestal(
    g: Phaser.GameObjects.Graphics, art: Artifact,
    camX: number, camY: number, pulse: number, time: number,
  ): void {
    const sx = art.pedestalX - camX;
    const sy = art.pedestalY - camY;
    if (sx < -40 || sx > GAME_WIDTH + 40 || sy < -40 || sy > GAME_HEIGHT + 40) return;

    // Intro override: bright pedestal with glow
    if (this.introOverride) {
      const m = this.introOverride.towers * this.introOverride.glow;
      if (m <= 0) return;
      const a = Math.min(1, m);
      const h = PEDESTAL_HALF;
      g.lineStyle(1, art.color, a);
      g.strokeRect(sx - h, sy - h, h * 2, h * 2);
      g.lineStyle(1, art.color, a * 0.7);
      this.drawShape(g, sx, sy, art.shape, 6, false);
      if (m > 1) {
        g.fillStyle(art.color, Math.min(0.25, (m - 1) * 0.07));
        g.fillCircle(sx, sy, h + (m - 1) * 4);
      }
      return;
    }

    const placed = art.state === 'placed';
    const h = PEDESTAL_HALF;
    const shapeSize = 6;

    if (placed && art.placedTime > 0) {
      const elapsed = time - art.placedTime;

      // ── Placement animation ───────────────────────────────────
      // Phase 1 (0–700ms):    artifact vibrates/fizzles into spot
      // Phase 2 (300–1200ms): shape flickers in (slow, heavy flicker)
      // Phase 3 (1000–1800ms): box outline flickers in
      // Phase 4 (1800ms+):    normal pulsing placed state
      const ANIM_TOTAL = 1800;

      if (elapsed < ANIM_TOTAL) {
        // ── Phase 1: vibrate + fizzle (0–700ms) ────────────────
        if (elapsed < 700) {
          const vibrateT = 1 - elapsed / 700; // 1→0
          const vibStrength = vibrateT * vibrateT * 12; // quadratic ease-out

          // Fizzle sparks — scattered colored pixels radiating outward
          const sparkCount = Math.floor(vibrateT * 8);
          for (let i = 0; i < sparkCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = (1 - Math.random() * vibrateT) * 14;
            const sparkAlpha = Math.random() * vibrateT * 0.8;
            g.fillStyle(art.color, sparkAlpha);
            g.fillRect(
              Math.floor(sx + Math.cos(angle) * dist),
              Math.floor(sy + Math.sin(angle) * dist),
              1, 1,
            );
          }

          // Shape renders at jittering offset, fading in from chaos
          if (Math.random() < 0.6 + elapsed / 700 * 0.4) {
            const ox = (Math.random() - 0.5) * 2 * vibStrength;
            const oy = (Math.random() - 0.5) * 2 * vibStrength;
            const flickerAlpha = (0.3 + Math.random() * 0.7) * (elapsed / 700);
            g.fillStyle(art.color, flickerAlpha);
            this.drawShape(g, sx + ox, sy + oy, art.shape, shapeSize, true);
          }

          // Dim box during vibrate
          g.lineStyle(1, 0x888888, 0.4 + vibrateT * 0.2);
          g.strokeRect(sx - h, sy - h, h * 2, h * 2);
          return;
        }

        // ── Phase 2: shape flickers in (300–1200ms) ────────────
        if (elapsed < 1200) {
          const p = (elapsed - 300) / 900;
          // Aggressive flicker — low base probability, spiky
          const on = Math.random() < p * p * 1.5;
          if (on) {
            const flickAlpha = (0.4 + Math.random() * 0.6) * Math.min(1, p * 1.3);
            g.fillStyle(art.color, flickAlpha * pulse);
            this.drawShape(g, sx, sy, art.shape, shapeSize, true);
          }
        } else {
          // Shape fully settled
          g.fillStyle(art.color, pulse);
          this.drawShape(g, sx, sy, art.shape, shapeSize, true);
        }

        // ── Phase 3: box walls flicker in one at a time (1000–1800ms) ─
        // Each wall gets 200ms: top → right → bottom → left
        const walls = [
          // [startMs, x1, y1, x2, y2]
          [1000, sx - h, sy - h, sx + h, sy - h], // top
          [1200, sx + h, sy - h, sx + h, sy + h], // right
          [1400, sx + h, sy + h, sx - h, sy + h], // bottom
          [1600, sx - h, sy + h, sx - h, sy - h], // left
        ] as const;

        for (const [start, x1, y1, x2, y2] of walls) {
          if (elapsed < start) {
            // Not yet — draw dim placeholder
            g.lineStyle(1, 0x555555, 0.3);
          } else {
            const wp = Math.min(1, (elapsed - start) / 200);
            const on = Math.random() < wp * wp * 1.8;
            g.lineStyle(1, on ? art.color : 0x555555, on ? Math.min(1, wp * 1.3) : 0.3);
          }
          g.beginPath();
          g.moveTo(x1, y1);
          g.lineTo(x2, y2);
          g.strokePath();
        }
        return;
      }

      // ── Normal placed state (pulsing) ────────────────────────
      g.lineStyle(1, art.color, pulse);
      g.strokeRect(sx - h, sy - h, h * 2, h * 2);
      g.fillStyle(art.color, pulse);
      this.drawShape(g, sx, sy, art.shape, shapeSize, true);
      g.fillStyle(art.color, pulse * 0.5);
      g.fillRect(sx - h, sy - h, 1, 1);
      g.fillRect(sx + h - 1, sy - h, 1, 1);
      g.fillRect(sx - h, sy + h - 1, 1, 1);
      g.fillRect(sx + h - 1, sy + h - 1, 1, 1);
    } else if (!placed) {
      // Unplaced: dim box + ghost shape outline
      g.lineStyle(1, 0x888888, 0.6);
      g.strokeRect(sx - h, sy - h, h * 2, h * 2);
      g.lineStyle(1, 0x999999, 0.55);
      this.drawShape(g, sx, sy, art.shape, shapeSize, false);
    }
  }

  private renderConnectionLines(
    g: Phaser.GameObjects.Graphics,
    camX: number, camY: number, pulse: number, time: number,
  ): void {
    const cx = HUB_X - camX;
    const cy = HUB_Y - camY;

    // Intro override: solid bright lines with glow
    if (this.introOverride) {
      const m = this.introOverride.lines * this.introOverride.glow;
      if (m <= 0) return;
      const a = Math.min(1, m);
      g.lineStyle(1, 0xffffff, a * 0.6);
      for (const art of this.artifacts) {
        const px = art.pedestalX - camX;
        const py = art.pedestalY - camY;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(cx, cy);
        g.strokePath();
      }
      if (m > 1) {
        g.lineStyle(3, 0xffffff, Math.min(0.25, (m - 1) * 0.07));
        for (const art of this.artifacts) {
          const px = art.pedestalX - camX;
          const py = art.pedestalY - camY;
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(cx, cy);
          g.strokePath();
        }
      }
      return;
    }

    for (const art of this.artifacts) {
      const px = art.pedestalX - camX;
      const py = art.pedestalY - camY;

      if (art.state === 'placed') {
        const elapsed = time - art.placedTime;
        // Line fills after pedestal animation (1800–3200ms), half speed = 1400ms fill duration
        const LINE_START = 1800;
        const LINE_END = 3200;
        if (art.placedTime > 0 && elapsed < LINE_END) {
          if (elapsed >= LINE_START) {
            const t = (elapsed - LINE_START) / (LINE_END - LINE_START);
            const ex = px + (cx - px) * t;
            const ey = py + (cy - py) * t;
            g.lineStyle(2, art.color, pulse * 0.7);
            g.beginPath();
            g.moveTo(px, py);
            g.lineTo(ex, ey);
            g.strokePath();
          }
          // No line before LINE_START (pedestal animation still playing)
        } else {
          // Fully drawn line
          g.lineStyle(2, art.color, pulse * 0.6);
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(cx, cy);
          g.strokePath();
        }
      } else {
        const segs = 12;
        g.lineStyle(1, 0x777777, 0.4);
        for (let i = 0; i < segs; i += 2) {
          const t0 = i / segs;
          const t1 = (i + 1) / segs;
          g.beginPath();
          g.moveTo(px + (cx - px) * t0, py + (cy - py) * t0);
          g.lineTo(px + (cx - px) * t1, py + (cy - py) * t1);
          g.strokePath();
        }
      }
    }
  }

  private renderCenterCircle(
    g: Phaser.GameObjects.Graphics,
    camX: number, camY: number, time: number,
  ): void {
    const cx = HUB_X - camX;
    const cy = HUB_Y - camY;
    if (cx < -40 || cx > GAME_WIDTH + 40 || cy < -40 || cy > GAME_HEIGHT + 40) return;

    // Intro override: render bright ring with glow
    if (this.introOverride) {
      const m = this.introOverride.ring * this.introOverride.glow;
      if (m <= 0) return;
      const a = Math.min(1, m);
      g.lineStyle(2, 0xffffff, a);
      g.strokeCircle(cx, cy, CENTER_CIRCLE_RADIUS);
      g.fillStyle(0xffffff, a * 0.1);
      g.fillCircle(cx, cy, CENTER_CIRCLE_RADIUS);
      if (m > 1) {
        g.fillStyle(0xffffff, Math.min(0.3, (m - 1) * 0.08));
        g.fillCircle(cx, cy, CENTER_CIRCLE_RADIUS + (m - 1) * 8);
      }
      return;
    }

    if (this._allPlaced) {
      const p = Math.sin(time * 0.005) * 0.3 + 0.7;
      g.fillStyle(0xffffff, p * 0.12);
      g.fillCircle(cx, cy, CENTER_CIRCLE_RADIUS);
      g.lineStyle(2, 0xffffff, p);
      g.strokeCircle(cx, cy, CENTER_CIRCLE_RADIUS);
      g.lineStyle(1, 0xffffff, p * 0.5);
      g.strokeCircle(cx, cy, CENTER_CIRCLE_RADIUS - 6);
    } else {
      g.lineStyle(1, 0x888888, 0.45);
      g.strokeCircle(cx, cy, CENTER_CIRCLE_RADIUS);
      g.fillStyle(0x666666, 0.3);
      g.fillCircle(cx, cy, 3);
    }
  }

  private renderRope(
    g: Phaser.GameObjects.Graphics, art: Artifact,
    camX: number, camY: number,
  ): void {
    if (art.rope.length < 2) return;
    g.lineStyle(1, art.color, 0.5);
    g.beginPath();
    g.moveTo(art.rope[0].x - camX, art.rope[0].y - camY);
    for (let i = 1; i < art.rope.length; i++) {
      g.lineTo(art.rope[i].x - camX, art.rope[i].y - camY);
    }
    g.strokePath();
  }

  private renderGlowingShape(
    g: Phaser.GameObjects.Graphics,
    sx: number, sy: number,
    shape: ArtifactShape, color: number,
    size: number, pulse: number, glowPulse: number,
  ): void {
    if (sx < -20 || sx > GAME_WIDTH + 20 || sy < -20 || sy > GAME_HEIGHT + 20) return;

    // Soft glow halo (no ring outline)
    g.fillStyle(color, glowPulse * 0.12);
    g.fillCircle(sx, sy, size + 6);

    // Shape fill
    g.fillStyle(color, pulse);
    this.drawShape(g, sx, sy, shape, size, true);

    // Center bright dot
    g.fillStyle(0xffffff, pulse);
    g.fillRect(sx, sy, 1, 1);
  }

  // ── Shape drawing ──────────────────────────────────────────────
  // These approximate the 4 reference shapes at small pixel scale.

  private drawShape(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number,
    shape: ArtifactShape, size: number, fill: boolean,
  ): void {
    switch (shape) {
      case 'star':     this.drawStar(g, cx, cy, size, fill); break;
      case 'squares':  this.drawSquares(g, cx, cy, size, fill); break;
      case 'coil':     this.drawCoil(g, cx, cy, size, fill); break;
      case 'pinwheel': this.drawPinwheel(g, cx, cy, size, fill); break;
    }
  }

  /** 8-pointed star / asterisk */
  private drawStar(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number, size: number, fill: boolean,
  ): void {
    const spikes = 8;
    const inner = size * 0.35;
    if (fill) {
      for (let i = 0; i < spikes; i++) {
        const angle = (i / spikes) * Math.PI * 2 - Math.PI / 2;
        const nextAngle = ((i + 1) / spikes) * Math.PI * 2 - Math.PI / 2;
        const midAngle = (angle + nextAngle) / 2;
        g.fillTriangle(
          cx + Math.cos(angle) * size, cy + Math.sin(angle) * size,
          cx + Math.cos(midAngle) * inner, cy + Math.sin(midAngle) * inner,
          cx, cy,
        );
        g.fillTriangle(
          cx + Math.cos(nextAngle) * size, cy + Math.sin(nextAngle) * size,
          cx + Math.cos(midAngle) * inner, cy + Math.sin(midAngle) * inner,
          cx, cy,
        );
      }
    } else {
      g.beginPath();
      for (let i = 0; i < spikes; i++) {
        const outerA = (i / spikes) * Math.PI * 2 - Math.PI / 2;
        const innerA = ((i + 0.5) / spikes) * Math.PI * 2 - Math.PI / 2;
        const ox = cx + Math.cos(outerA) * size;
        const oy = cy + Math.sin(outerA) * size;
        const ix = cx + Math.cos(innerA) * inner;
        const iy = cy + Math.sin(innerA) * inner;
        if (i === 0) g.moveTo(ox, oy);
        else g.lineTo(ox, oy);
        g.lineTo(ix, iy);
      }
      g.closePath();
      g.strokePath();
    }
  }

  /** Two overlapping offset squares */
  private drawSquares(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number, size: number, fill: boolean,
  ): void {
    const big = size;
    const small = size * 0.55;
    const off = size * 0.35;
    if (fill) {
      // Back square (top-left offset)
      g.fillRect(cx - big + off * 0.2, cy - big + off * 0.2, big * 1.3, big * 1.3);
      // Front square (bottom-right offset)
      g.fillRect(cx - small + off, cy - small + off, small * 1.6, small * 1.6);
    } else {
      g.strokeRect(cx - big + off * 0.2, cy - big + off * 0.2, big * 1.3, big * 1.3);
      g.strokeRect(cx - small + off, cy - small + off, small * 1.6, small * 1.6);
    }
  }

  /** Stacked horizontal rounded bars */
  private drawCoil(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number, size: number, fill: boolean,
  ): void {
    const bars = 5;
    const barH = (size * 2) / (bars * 1.5 + 0.5);
    const gap = barH * 0.5;
    const barW = size * 1.6;
    const startY = cy - (bars * (barH + gap) - gap) / 2;

    for (let i = 0; i < bars; i++) {
      const by = startY + i * (barH + gap);
      if (fill) {
        // Rounded bar approximation: rect with circle caps
        g.fillRect(cx - barW / 2 + barH / 2, by, barW - barH, barH);
        g.fillCircle(cx - barW / 2 + barH / 2, by + barH / 2, barH / 2);
        g.fillCircle(cx + barW / 2 - barH / 2, by + barH / 2, barH / 2);
      } else {
        g.strokeRect(cx - barW / 2, by, barW, barH);
      }
    }
  }

  /** Interlocking crescents / pac-man pinwheel */
  private drawPinwheel(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number, size: number, fill: boolean,
  ): void {
    const r = size * 0.7;
    const blades = 3;
    for (let i = 0; i < blades; i++) {
      const angle = (i / blades) * Math.PI * 2;
      const bx = cx + Math.cos(angle) * r * 0.5;
      const by = cy + Math.sin(angle) * r * 0.5;
      if (fill) {
        // Draw a fan/wedge shape
        g.beginPath();
        g.moveTo(cx, cy);
        const startA = angle - Math.PI * 0.4;
        const endA = angle + Math.PI * 0.4;
        g.arc(bx, by, r, startA, endA, false);
        g.closePath();
        g.fillPath();
      } else {
        g.beginPath();
        g.arc(bx, by, r, angle - Math.PI * 0.4, angle + Math.PI * 0.4, false);
        g.strokePath();
      }
    }
  }

  // ── Terrain carving (called by TerrainSystem) ──────────────────
  // Returns fractal zone descriptors so TerrainSystem can apply lighter-wall tinting.
  static carveTerrain(buffer: PixelBuffer): { x: number; y: number }[] {
    // Expand center hub — clear space around each pedestal + paths to center
    for (const def of ARTIFACT_DEFS) {
      const px = HUB_X + def.pedestalDx;
      const py = HUB_Y + def.pedestalDy;
      buffer.clearEllipse(px, py, 22, 22);
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        buffer.clearEllipse(
          HUB_X + def.pedestalDx * t,
          HUB_Y + def.pedestalDy * t,
          8, 8,
        );
      }
    }

    // Center circle area
    buffer.clearEllipse(HUB_X, HUB_Y, CENTER_CIRCLE_RADIUS + 8, CENTER_CIRCLE_RADIUS + 8);

    // Fractal corner rooms — one per artifact shape
    const zones: { x: number; y: number }[] = [];
    for (const def of ARTIFACT_DEFS) {
      const { homeX: hx, homeY: hy } = def;
      zones.push({ x: hx, y: hy });

      switch (def.shape) {
        case 'star':     ArtifactSystem.carveFlowerRoom(buffer, hx, hy);   break;
        case 'squares':  ArtifactSystem.carveSquareRoom(buffer, hx, hy);   break;
        case 'coil':     ArtifactSystem.carveRhombusRoom(buffer, hx, hy);  break;
        case 'pinwheel': ArtifactSystem.carveCircularRoom(buffer, hx, hy); break;
      }
    }

    return zones;
  }

  // ── Irregular fill circle ───────────────────────────────────────
  // Fills a circle of `baseR` radius with `value`, but the outer edge
  // varies by 0–3 px using stacked sine harmonics so the boundary is
  // bumpy rather than a perfect ring.
  private static fillIrregularCircle(
    buffer: PixelBuffer, cx: number, cy: number, baseR: number, value: number,
  ): void {
    const MAX_VAR = 12;
    const maxR = baseR + MAX_VAR;
    const x0 = Math.max(0, Math.floor(cx - maxR));
    const x1 = Math.min(buffer.width - 1, Math.ceil(cx + maxR));
    const y0 = Math.max(0, Math.floor(cy - maxR));
    const y1 = Math.min(buffer.height - 1, Math.ceil(cy + maxR));

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxR) continue;
        const angle = Math.atan2(dy, dx);
        // Many non-harmonic frequencies so the pattern never feels periodic
        const v = (
          Math.sin(angle * 11) * 0.30 +
          Math.sin(angle * 19) * 0.25 +
          Math.sin(angle *  7) * 0.20 +
          Math.sin(angle * 29) * 0.15 +
          Math.sin(angle * 41) * 0.10 +
          1  // shift to 0–2 range before scaling
        ) * 6; // final range 0–12 px
        if (dist <= baseR + v) {
          buffer.data[py * buffer.width + px] = value;
        }
      }
    }
  }

  // ── Recursive branch carver ─────────────────────────────────────
  // Draws a branch from (x,y) in direction `angle` for `length` px,
  // then recursively splits into `branches` children, each scaled by
  // `scale` and fanned by ±`spread` rad. Width tapers with depth.
  private static carveBranch(
    buffer: PixelBuffer,
    x: number, y: number,
    angle: number, length: number,
    depth: number, maxDepth: number,
    scale: number, spread: number, branches: number,
    baseWidth: number,
  ): void {
    if (depth > maxDepth || length < 3) return;

    const w = Math.max(2, baseWidth * Math.pow(scale, depth));
    const ex = x + Math.cos(angle) * length;
    const ey = y + Math.sin(angle) * length;

    // Carve the segment as a chain of ellipses
    const steps = Math.ceil(length / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      buffer.clearEllipse(x + Math.cos(angle) * length * t, y + Math.sin(angle) * length * t, w, w);
    }

    // Fan out children symmetrically
    for (let b = 0; b < branches; b++) {
      const offset = branches === 1 ? 0 : (b / (branches - 1) - 0.5) * 2 * spread;
      ArtifactSystem.carveBranch(
        buffer, ex, ey,
        angle + offset, length * scale,
        depth + 1, maxDepth,
        scale, spread, branches, baseWidth,
      );
    }
  }

  // ── Flower room (top-left): Vogel golden-angle sunflower spiral ──
  // The golden angle (~137.5°) places each point so no two share a radial
  // line — this naturally packs ~130 clearings into a dense flower disk.
  private static carveFlowerRoom(buffer: PixelBuffer, cx: number, cy: number): void {
    ArtifactSystem.fillIrregularCircle(buffer, cx, cy, 92, TERRAIN_MAX_HP);
    buffer.clearEllipse(cx, cy, 14, 14);

    const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ≈ 137.5°
    const N = 130;
    for (let n = 1; n <= N; n++) {
      const angle = n * goldenAngle;
      const r = 7.2 * Math.sqrt(n);
      buffer.clearEllipse(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, 5, 5);
    }
  }

  // ── Square room (top-right): H-tree fractal ──────────────────────
  // 4 root arms at cardinal directions; each node spawns two perpendicular
  // children at half the length. Creates a dense fractal cross grid.
  private static carveSquareRoom(buffer: PixelBuffer, cx: number, cy: number): void {
    ArtifactSystem.fillIrregularCircle(buffer, cx, cy, 95, TERRAIN_MAX_HP);
    buffer.clearEllipse(cx, cy, 14, 14);

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      // spread = π/2 → children go ±90° = perpendicular (H-tree)
      ArtifactSystem.carveBranch(buffer, cx, cy, angle, 44, 0, 6, 0.5, Math.PI / 2, 2, 5);
    }
  }

  // ── Rhombus room (bottom-left): 6-fold 60° recursive fractal ─────
  // 6 root arms at 60° intervals; each splits at ±60°.
  // 60° angles create equilateral-triangle/rhombus tiling geometry.
  private static carveRhombusRoom(buffer: PixelBuffer, cx: number, cy: number): void {
    ArtifactSystem.fillIrregularCircle(buffer, cx, cy, 92, TERRAIN_MAX_HP);
    buffer.clearEllipse(cx, cy, 14, 14);

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      ArtifactSystem.carveBranch(buffer, cx, cy, angle, 42, 0, 5, 0.52, Math.PI / 3, 2, 5);
    }
  }

  // ── Circular room (bottom-right): mandala rings + radial spokes ──
  // Concentric carved rings at r=20,38,56,74 connected by 12 radial
  // spokes; small satellite clearings at each intersection.
  private static carveCircularRoom(buffer: PixelBuffer, cx: number, cy: number): void {
    ArtifactSystem.fillIrregularCircle(buffer, cx, cy, 88, TERRAIN_MAX_HP);
    buffer.clearEllipse(cx, cy, 14, 14);

    const rings = [20, 38, 56, 74];
    const SPOKES = 12;

    for (const r of rings) {
      // Continuous ring carved as dense ellipse chain
      const steps = Math.ceil((r * Math.PI * 2) / 5);
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        buffer.clearEllipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 4, 4);
      }
      // Larger node at each spoke/ring intersection
      for (let s = 0; s < SPOKES; s++) {
        const a = (s / SPOKES) * Math.PI * 2;
        buffer.clearEllipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 6, 6);
      }
    }

    // Radial spokes connecting all rings
    for (let s = 0; s < SPOKES; s++) {
      const a = (s / SPOKES) * Math.PI * 2;
      for (let r = 10; r <= 77; r += 2) {
        buffer.clearEllipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3, 3);
      }
    }
  }
}
