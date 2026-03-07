import { Grain, ShipState, PARTICLE_COUNT, PARTICLES_PER_FRAME, PARTICLE_SPEED, PARTICLE_LIFE, GRAVITY } from '../../types/game';
import { TerrainSystem } from './TerrainSystem';

export class ParticleSystem {
  particles: Grain[];
  private freeList: number[] = [];

  constructor() {
    this.particles = new Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles[i] = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 1, red: false };
      this.freeList.push(i);
    }
  }

  spawnThrust(ship: ShipState): void {
    if (!ship.alive) return;

    // Spawn particles behind the ship (opposite to facing direction)
    const backAngle = ship.angle + Math.PI;
    const cos = Math.cos(backAngle);
    const sin = Math.sin(backAngle);

    for (let i = 0; i < PARTICLES_PER_FRAME; i++) {
      if (this.freeList.length === 0) break;

      const idx = this.freeList.pop()!;
      const grain = this.particles[idx];

      // Spread angle slightly
      const spread = (Math.random() - 0.5) * 0.5;
      const angle = backAngle + spread;

      grain.active = true;
      grain.x = ship.x - cos * 5;
      grain.y = ship.y - sin * 5;
      grain.vx = Math.cos(angle) * PARTICLE_SPEED + ship.vx * 0.3;
      grain.vy = Math.sin(angle) * PARTICLE_SPEED + ship.vy * 0.3;
      grain.life = PARTICLE_LIFE;
      grain.damage = 1;
      grain.red = false;
    }
  }

  update(terrain: TerrainSystem): void {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const grain = this.particles[i];
      if (!grain.active) continue;

      // Gravity
      grain.vy += GRAVITY * 0.5;

      // Move
      grain.x += grain.vx;
      grain.y += grain.vy;

      // Terrain collision
      const px = Math.floor(grain.x);
      const py = Math.floor(grain.y);

      if (terrain.isSolid(px, py)) {
        // Damage terrain — explosion particles carry higher damage
        terrain.damage(px, py, grain.damage);
        terrain.markDirty();

        // Bounce with energy loss
        // Check which axis caused collision
        const prevX = Math.floor(grain.x - grain.vx);
        const prevY = Math.floor(grain.y - grain.vy);

        if (terrain.isSolid(px, prevY)) {
          grain.vx *= -0.4;
          grain.x += grain.vx;
        }
        if (terrain.isSolid(prevX, py)) {
          grain.vy *= -0.4;
          grain.y += grain.vy;
        }
        if (terrain.isSolid(px, py)) {
          // Still stuck, just reverse both
          grain.vx *= -0.3;
          grain.vy *= -0.3;
          grain.x += grain.vx * 2;
          grain.y += grain.vy * 2;
        }

        grain.life -= 10;
      }

      // World bounds
      if (grain.x < 0 || grain.x >= terrain.buffer.width ||
          grain.y < 0 || grain.y >= terrain.buffer.height) {
        grain.active = false;
        this.freeList.push(i);
        continue;
      }

      // Lifetime
      grain.life--;
      if (grain.life <= 0) {
        grain.active = false;
        this.freeList.push(i);
      }
    }

    // Simple particle-particle collision (check nearby pairs)
    this.particleCollisions();
  }

  /**
   * Fire particles outward from the perimeter of the current explosion ring.
   * Called once per expansion step so the burst tracks the growing edge.
   */
  spawnExplosionRing(cx: number, cy: number, radius: number, intensity: number): void {
    const count = Math.floor(40 + 30 * intensity);
    for (let i = 0; i < count; i++) {
      if (this.freeList.length === 0) break;
      const idx   = this.freeList.pop()!;
      const grain = this.particles[idx];
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4;
      grain.active = true;
      grain.x  = cx + Math.cos(angle) * radius;
      grain.y  = cy + Math.sin(angle) * radius;
      grain.vx = Math.cos(angle) * speed;
      grain.vy = Math.sin(angle) * speed;
      grain.life   = PARTICLE_LIFE * (0.4 + Math.random() * 0.6);
      grain.damage = 5;
      grain.red = false;
    }
  }

  /** Fire particles outward in all directions — visual burst for bomb explosions. */
  spawnExplosion(x: number, y: number): void {
    const RAYS = 200;
    for (let i = 0; i < RAYS; i++) {
      if (this.freeList.length === 0) break;
      const idx = this.freeList.pop()!;
      const grain = this.particles[idx];
      const angle = (i / RAYS) * Math.PI * 2 + Math.random() * 0.15;
      const speed = Math.random() < 0.4
        ? 8 + Math.random() * 6
        : 2 + Math.random() * 4;
      grain.active = true;
      grain.x = x;
      grain.y = y;
      grain.vx = Math.cos(angle) * speed;
      grain.vy = Math.sin(angle) * speed;
      grain.life = PARTICLE_LIFE * (1.5 + Math.random());
      grain.damage = 5;
      grain.red = false;
    }
  }

  /** Small explosion — ~1/3 scale of spawnExplosion. Used by rockets. */
  spawnSmallExplosion(x: number, y: number): void {
    const RAYS = 50;
    for (let i = 0; i < RAYS; i++) {
      if (this.freeList.length === 0) break;
      const idx = this.freeList.pop()!;
      const grain = this.particles[idx];
      const angle = (i / RAYS) * Math.PI * 2 + Math.random() * 0.2;
      const speed = Math.random() < 0.4
        ? 3 + Math.random() * 3
        : 1 + Math.random() * 2;
      grain.active = true;
      grain.x = x;
      grain.y = y;
      grain.vx = Math.cos(angle) * speed;
      grain.vy = Math.sin(angle) * speed;
      grain.life = PARTICLE_LIFE * (0.5 + Math.random() * 0.5);
      grain.damage = 3;
      grain.red = false;
    }
  }

  /** Magma blob splat — slow-spreading red particles that erode walls. */
  spawnBlobSplat(x: number, y: number): void {
    const RAYS = 80;
    for (let i = 0; i < RAYS; i++) {
      if (this.freeList.length === 0) break;
      const idx = this.freeList.pop()!;
      const grain = this.particles[idx];
      const angle = (i / RAYS) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 0.3 + Math.random() * 1.2;
      grain.active = true;
      grain.x = x;
      grain.y = y;
      grain.vx = Math.cos(angle) * speed;
      grain.vy = Math.sin(angle) * speed;
      grain.life = PARTICLE_LIFE * (1.5 + Math.random() * 1.5);
      grain.damage = 8;
      grain.red = true;
    }
  }

  /** Medium red splat — 3/4 intensity of blob splat. Used by bomb explosions. */
  spawnMediumSplat(x: number, y: number): void {
    const RAYS = 60;
    for (let i = 0; i < RAYS; i++) {
      if (this.freeList.length === 0) break;
      const idx = this.freeList.pop()!;
      const grain = this.particles[idx];
      const angle = (i / RAYS) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 0.3 + Math.random() * 1.1;
      grain.active = true;
      grain.x = x;
      grain.y = y;
      grain.vx = Math.cos(angle) * speed;
      grain.vy = Math.sin(angle) * speed;
      grain.life = PARTICLE_LIFE * (1.3 + Math.random() * 1.2);
      grain.damage = 6;
      grain.red = true;
    }
  }

  /** Small red splat — 1/4 intensity of blob splat. Used by enemy projectile wall hits. */
  spawnSmallSplat(x: number, y: number): void {
    const RAYS = 20;
    for (let i = 0; i < RAYS; i++) {
      if (this.freeList.length === 0) break;
      const idx = this.freeList.pop()!;
      const grain = this.particles[idx];
      const angle = (i / RAYS) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 0.2 + Math.random() * 0.8;
      grain.active = true;
      grain.x = x;
      grain.y = y;
      grain.vx = Math.cos(angle) * speed;
      grain.vy = Math.sin(angle) * speed;
      grain.life = PARTICLE_LIFE * (0.8 + Math.random() * 0.7);
      grain.damage = 2;
      grain.red = true;
    }
  }

  private particleCollisions(): void {
    // Only check a subset for performance
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const a = this.particles[i];
      if (!a.active) continue;

      for (let j = i + 1; j < Math.min(i + 10, PARTICLE_COUNT); j++) {
        const b = this.particles[j];
        if (!b.active) continue;

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (dx * dx + dy * dy < 4) {
          // Swap velocities
          const tvx = a.vx;
          const tvy = a.vy;
          a.vx = b.vx;
          a.vy = b.vy;
          b.vx = tvx;
          b.vy = tvy;
        }
      }
    }
  }
}
