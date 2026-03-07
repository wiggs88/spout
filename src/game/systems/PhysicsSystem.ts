import { ShipState, GRAVITY, THRUST_POWER, MAX_SPEED, ROTATION_SPEED, SHIP_COLLISION_DAMAGE, SHIP_MAX_HEALTH } from '../../types/game';
import { getShipPixels } from '../entities/Ship';
import { TerrainSystem } from './TerrainSystem';
import { clamp } from '../utils/MathUtils';

export interface InputState {
  left: boolean;
  right: boolean;
  thrust: boolean;
  reverse: boolean;
}

export class PhysicsSystem {
  update(ship: ShipState, input: InputState, terrain: TerrainSystem): void {
    if (!ship.alive) return;

    // Rotation
    if (input.left) ship.angle -= ROTATION_SPEED;
    if (input.right) ship.angle += ROTATION_SPEED;

    // Gravity
    ship.vy += GRAVITY;

    // Thrust
    if (input.thrust) {
      ship.vx += Math.cos(ship.angle) * THRUST_POWER;
      ship.vy += Math.sin(ship.angle) * THRUST_POWER;
    } else if (input.reverse) {
      ship.vx -= Math.cos(ship.angle) * THRUST_POWER * 0.5;
      ship.vy -= Math.sin(ship.angle) * THRUST_POWER * 0.5;
    } else {
      ship.vx *= 0.94;
      ship.vy *= 0.94;
    }

    // Speed cap
    ship.vx = clamp(ship.vx, -MAX_SPEED, MAX_SPEED);
    ship.vy = clamp(ship.vy, -MAX_SPEED, MAX_SPEED);

    // Move
    ship.x += ship.vx;
    ship.y += ship.vy;

    // World bounds (wrap horizontally)
    if (ship.x < 0) ship.x += terrain.buffer.width;
    if (ship.x >= terrain.buffer.width) ship.x -= terrain.buffer.width;

    // Invincibility countdown
    if (ship.invincibleFrames > 0) ship.invincibleFrames--;

    // Collision check
    const pixels = getShipPixels(ship);
    let hit = false;
    for (const p of pixels) {
      if (terrain.isSolid(p.x, p.y)) { hit = true; break; }
    }

    if (hit) {
      // Bounce ship back
      ship.vx = -ship.vx * 0.5;
      ship.vy = -ship.vy * 0.5;
      ship.x += ship.vx * 3;
      ship.y += ship.vy * 3;

      if (ship.invincibleFrames === 0) {
        ship.health = Math.max(0, ship.health - SHIP_COLLISION_DAMAGE);
        ship.invincibleFrames = 90; // 1.5 s at 60 fps
        if (ship.health <= 0) {
          ship.alive = false;
        }
      }
    }
  }
}
