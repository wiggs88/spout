import { ShipState, GAME_WIDTH, GAME_HEIGHT, ORE_COLLECT_RADIUS } from '../../types/game';
import { getItemStats, HookStats, AuraStats, RocketStats, CarveStats, DynamoStats, FlashlightStats } from '../data/items';
import { TerrainSystem } from './TerrainSystem';
import { OreSystem } from './OreSystem';
import { ParticleSystem } from './ParticleSystem';
import { ShopSystem } from './ShopSystem';

// ── Grappling Hook state ───────────────────────────────────────
interface GrappleState {
  active: boolean;
  originX: number;
  originY: number;
  tipX: number;
  tipY: number;
  dirX: number;
  dirY: number;
  frame: number;
  hitTerrain: boolean;
  hitTerrainX: number;
  hitTerrainY: number;
}

// ── Rocket state ───────────────────────────────────────────────
interface RocketState {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export class ItemSystem {
  private shop: ShopSystem;

  // Cooldowns (ms timestamps)
  private grappleCooldownUntil = 0;
  private rocketCooldownUntil = 0;

  // Grapple
  private grapple: GrappleState = {
    active: false, originX: 0, originY: 0, tipX: 0, tipY: 0,
    dirX: 0, dirY: 0, frame: 0,
    hitTerrain: false, hitTerrainX: 0, hitTerrainY: 0,
  };

  // Aura
  auraActive = false;

  // Rocket
  private rocket: RocketState = { active: false, x: 0, y: 0, vx: 0, vy: 0 };

  // Carve (toggle)
  carveActive = false;
  private carveFrame = 0;

  constructor(shop: ShopSystem) {
    this.shop = shop;
  }

  // ── Helpers to get current stats for equipped items ───────────
  private getHookStats(): HookStats | null {
    const level = this.shop.getLevel('hook');
    if (level === 0 || !this.shop.isEquipped('hook')) return null;
    return getItemStats('hook', level) as HookStats;
  }

  private getAuraStats(): AuraStats | null {
    const level = this.shop.getLevel('aura');
    if (level === 0 || !this.shop.isEquipped('aura')) return null;
    return getItemStats('aura', level) as AuraStats;
  }

  private getRocketStats(): RocketStats | null {
    const level = this.shop.getLevel('rocket');
    if (level === 0 || !this.shop.isEquipped('rocket')) return null;
    return getItemStats('rocket', level) as RocketStats;
  }

  private getCarveStats(): CarveStats | null {
    const level = this.shop.getLevel('carve');
    if (level === 0 || !this.shop.isEquipped('carve')) return null;
    return getItemStats('carve', level) as CarveStats;
  }

  getDynamoStats(): DynamoStats | null {
    const level = this.shop.getLevel('dynamo');
    if (level === 0 || !this.shop.isEquipped('dynamo')) return null;
    return getItemStats('dynamo', level) as DynamoStats;
  }

  getFlashlightStats(): FlashlightStats | null {
    const level = this.shop.getLevel('flashlight');
    if (level === 0 || !this.shop.isEquipped('flashlight')) return null;
    return getItemStats('flashlight', level) as FlashlightStats;
  }

  // ── Input handling (keys map to slots 0/1/2) ─────────────────
  handleInput(
    key1: boolean, key2: boolean, key3: boolean,
    ship: ShipState, time: number, energy: { current: number },
  ): void {
    const keys = [key1, key2, key3];
    for (let slot = 0; slot < 3; slot++) {
      if (!keys[slot]) continue;
      const itemId = this.shop.getEquippedInSlot(slot);
      if (!itemId) continue;
      this.activateItem(itemId, ship, time, energy);
    }
  }

  private activateItem(
    itemId: string, ship: ShipState, time: number, energy: { current: number },
  ): void {
    if (!ship.alive) return;

    switch (itemId) {
      case 'hook': {
        const stats = this.getHookStats();
        if (!stats) return;
        if (this.grapple.active || time < this.grappleCooldownUntil) return;
        if (energy.current < stats.energyCost) return;
        energy.current -= stats.energyCost;
        this.grapple.active = true;
        this.grapple.originX = ship.x;
        this.grapple.originY = ship.y;
        this.grapple.dirX = Math.cos(ship.angle);
        this.grapple.dirY = Math.sin(ship.angle);
        this.grapple.tipX = ship.x;
        this.grapple.tipY = ship.y;
        this.grapple.frame = 0;
        this.grapple.hitTerrain = false;
        break;
      }
      case 'aura': {
        const stats = this.getAuraStats();
        if (!stats) return;
        if (!this.auraActive && energy.current < stats.drain) return;
        this.auraActive = !this.auraActive;
        break;
      }
      case 'rocket': {
        const stats = this.getRocketStats();
        if (!stats) return;
        if (this.rocket.active || time < this.rocketCooldownUntil) return;
        if (energy.current < stats.energyCost) return;
        energy.current -= stats.energyCost;
        this.rocket.active = true;
        this.rocket.x = ship.x + Math.cos(ship.angle) * 6;
        this.rocket.y = ship.y + Math.sin(ship.angle) * 6;
        this.rocket.vx = Math.cos(ship.angle) * stats.speed;
        this.rocket.vy = Math.sin(ship.angle) * stats.speed;
        break;
      }
      case 'carve': {
        const stats = this.getCarveStats();
        if (!stats) return;
        if (!this.carveActive && energy.current < stats.drain) return;
        this.carveActive = !this.carveActive;
        this.carveFrame = 0;
        break;
      }
      // Passive items (dynamo) don't activate on key press
    }
  }

  // ── Update ─────────────────────────────────────────────────
  update(
    ship: ShipState,
    terrain: TerrainSystem,
    ores: OreSystem,
    particles: ParticleSystem,
    time: number,
    energy: { current: number },
  ): void {
    this.updateGrapple(ship, terrain, ores, time);
    this.updateAura(ship, ores, energy);
    this.updateRocket(terrain, particles, time);
    this.updateCarve(ship, terrain, energy);
  }

  // ── Grapple ────────────────────────────────────────────────
  private updateGrapple(
    ship: ShipState, terrain: TerrainSystem, ores: OreSystem, time: number,
  ): void {
    if (!this.grapple.active) return;
    const stats = this.getHookStats();
    if (!stats) { this.grapple.active = false; return; }

    this.grapple.frame++;
    const totalFrames = stats.frames * 2;

    if (this.grapple.frame <= stats.frames) {
      const t = this.grapple.frame / stats.frames;
      const reach = t * stats.range;
      this.grapple.tipX = this.grapple.originX + this.grapple.dirX * reach;
      this.grapple.tipY = this.grapple.originY + this.grapple.dirY * reach;

      const checkX = Math.floor(this.grapple.tipX);
      const checkY = Math.floor(this.grapple.tipY);
      if (terrain.isSolid(checkX, checkY)) {
        this.grapple.hitTerrain = true;
        this.grapple.hitTerrainX = checkX;
        this.grapple.hitTerrainY = checkY;
        const dx = checkX - ship.x;
        const dy = checkY - ship.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
          ship.vx += (dx / dist) * 0.8;
          ship.vy += (dy / dist) * 0.8;
        }
      }

      const grabbed = ores.collectInRadius(this.grapple.tipX, this.grapple.tipY, 10);
      if (grabbed.length > 0) {
        this.grapple.frame = stats.frames + 1;
      }
    } else {
      const t = (this.grapple.frame - stats.frames) / stats.frames;
      const reach = (1 - t) * stats.range;
      this.grapple.tipX = this.grapple.originX + this.grapple.dirX * reach;
      this.grapple.tipY = this.grapple.originY + this.grapple.dirY * reach;

      if (this.grapple.hitTerrain) {
        const dx = this.grapple.hitTerrainX - ship.x;
        const dy = this.grapple.hitTerrainY - ship.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
          ship.vx += (dx / dist) * 0.4;
          ship.vy += (dy / dist) * 0.4;
        }
      }
    }

    if (this.grapple.frame >= totalFrames) {
      this.grapple.active = false;
      this.grappleCooldownUntil = time + stats.cooldown;
    }
  }

  // ── Aura ───────────────────────────────────────────────────
  private updateAura(ship: ShipState, ores: OreSystem, energy: { current: number }): void {
    if (!this.auraActive || !ship.alive) return;
    const stats = this.getAuraStats();
    if (!stats) { this.auraActive = false; return; }

    energy.current -= stats.drain / 60;
    if (energy.current <= 0) {
      energy.current = 0;
      this.auraActive = false;
      return;
    }
    ores.pullOresInRadius(ship.x, ship.y, stats.pullRange, stats.pullSpeed, ORE_COLLECT_RADIUS);
  }

  // ── Rocket ─────────────────────────────────────────────────
  private updateRocket(
    terrain: TerrainSystem, particles: ParticleSystem, time: number,
  ): void {
    if (!this.rocket.active) return;
    const stats = this.getRocketStats();
    if (!stats) { this.rocket.active = false; return; }

    this.rocket.x += this.rocket.vx;
    this.rocket.y += this.rocket.vy;

    const px = Math.floor(this.rocket.x);
    const py = Math.floor(this.rocket.y);

    if (px < 0 || px >= terrain.buffer.width || py < 0 || py >= terrain.buffer.height) {
      this.rocket.active = false;
      this.rocketCooldownUntil = time + stats.cooldown;
      return;
    }

    if (terrain.isSolid(px, py)) {
      const seed = this.rocket.x * 11.3 + this.rocket.y * 7.7;
      terrain.explodeAt(this.rocket.x, this.rocket.y, stats.blastRadius, seed);
      particles.spawnSmallExplosion(this.rocket.x, this.rocket.y);
      this.rocket.active = false;
      this.rocketCooldownUntil = time + stats.cooldown;
    }
  }

  // ── Carve ──────────────────────────────────────────────────
  private updateCarve(
    ship: ShipState, terrain: TerrainSystem, energy: { current: number },
  ): void {
    if (!this.carveActive || !ship.alive) return;
    const stats = this.getCarveStats();
    if (!stats) { this.carveActive = false; return; }

    energy.current -= stats.drain / 60;
    if (energy.current <= 0) {
      energy.current = 0;
      this.carveActive = false;
      return;
    }

    this.carveFrame++;
    const fullCycle = stats.halfCycle * 2;
    const phase = this.carveFrame % fullCycle;
    const t = phase < stats.halfCycle
      ? phase / stats.halfCycle
      : 1 - (phase - stats.halfCycle) / stats.halfCycle;
    const currentRadius = t * stats.radius;

    if (currentRadius > 2 && this.carveFrame % 8 === 0) {
      const seed = ship.x * 9.1 + ship.y * 13.3;
      terrain.explodeAt(ship.x, ship.y, currentRadius, seed);
    }
  }

  // ── Render ─────────────────────────────────────────────────
  render(
    graphics: Phaser.GameObjects.Graphics,
    camX: number,
    camY: number,
    time: number,
    ship: ShipState,
  ): void {
    this.renderGrapple(graphics, camX, camY, ship);
    this.renderAura(graphics, camX, camY, time, ship);
    this.renderRocket(graphics, camX, camY);
    this.renderCarve(graphics, camX, camY, ship);
  }

  private renderGrapple(
    g: Phaser.GameObjects.Graphics, camX: number, camY: number, ship: ShipState,
  ): void {
    if (!this.grapple.active) return;
    g.lineStyle(1, 0xffffff, 0.8);
    g.lineBetween(ship.x - camX, ship.y - camY, this.grapple.tipX - camX, this.grapple.tipY - camY);
  }

  private renderAura(
    g: Phaser.GameObjects.Graphics, camX: number, camY: number,
    time: number, ship: ShipState,
  ): void {
    if (!this.auraActive || !ship.alive) return;
    const stats = this.getAuraStats();
    if (!stats) return;
    const sx = ship.x - camX;
    const sy = ship.y - camY;
    const pulse = Math.sin(time * 0.004) * 0.5 + 0.5;
    g.lineStyle(1, 0xffffff, 0.1 + pulse * 0.15);
    g.strokeCircle(sx, sy, stats.pullRange + pulse * 4);
  }

  private renderRocket(
    g: Phaser.GameObjects.Graphics, camX: number, camY: number,
  ): void {
    if (!this.rocket.active) return;
    const sx = this.rocket.x - camX;
    const sy = this.rocket.y - camY;
    if (sx < -5 || sx > GAME_WIDTH + 5 || sy < -5 || sy > GAME_HEIGHT + 5) return;
    g.fillStyle(0xffffff, 1);
    g.fillCircle(sx, sy, 2);
  }

  private renderCarve(
    g: Phaser.GameObjects.Graphics, camX: number, camY: number, ship: ShipState,
  ): void {
    if (!this.carveActive || !ship.alive) return;
    const stats = this.getCarveStats();
    if (!stats) return;
    const sx = ship.x - camX;
    const sy = ship.y - camY;
    const fullCycle = stats.halfCycle * 2;
    const phase = this.carveFrame % fullCycle;
    const t = phase < stats.halfCycle
      ? phase / stats.halfCycle
      : 1 - (phase - stats.halfCycle) / stats.halfCycle;
    const currentRadius = t * stats.radius;
    const alpha = 0.15 + t * 0.25;
    g.lineStyle(1, 0xffffff, alpha);
    g.strokeCircle(sx, sy, currentRadius);
  }

  // ── State queries for HUD ──────────────────────────────────
  getSlotCooldowns(time: number): boolean[] {
    const cooldowns: boolean[] = [];
    for (let slot = 0; slot < 3; slot++) {
      const itemId = this.shop.getEquippedInSlot(slot);
      if (!itemId) { cooldowns.push(false); continue; }
      switch (itemId) {
        case 'hook':
          cooldowns.push(this.grapple.active || time < this.grappleCooldownUntil);
          break;
        case 'rocket':
          cooldowns.push(this.rocket.active || time < this.rocketCooldownUntil);
          break;
        default:
          cooldowns.push(false);
      }
    }
    return cooldowns;
  }

  getSlotToggles(): Record<string, boolean> {
    return { aura: this.auraActive, carve: this.carveActive };
  }

  // ── State queries for enemy combat integration ────────────────
  getRocketState(): { active: boolean; x: number; y: number } {
    return { active: this.rocket.active, x: this.rocket.x, y: this.rocket.y };
  }

  getRocketBlastRadius(): number {
    const stats = this.getRocketStats();
    return stats ? stats.blastRadius : 0;
  }

  isAuraActive(): boolean {
    return this.auraActive;
  }

  getAuraRadius(): number {
    const stats = this.getAuraStats();
    return stats ? stats.pullRange : 0;
  }
}
