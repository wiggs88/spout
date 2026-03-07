import { ShipState, WORLD_WIDTH, WORLD_HEIGHT, SHIP_SIZE, SHIP_MAX_HEALTH } from '../../types/game';

export function createShip(): ShipState {
  return {
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2, // facing up
    alive: true,
    health: SHIP_MAX_HEALTH,
    invincibleFrames: 0,
  };
}

export function getShipPixels(ship: ShipState): { x: number; y: number }[] {
  const pixels: { x: number; y: number }[] = [];
  const cos = Math.cos(ship.angle);
  const sin = Math.sin(ship.angle);

  // Ship shape: a small triangle/arrow
  // Nose
  const noseX = ship.x + cos * SHIP_SIZE;
  const noseY = ship.y + sin * SHIP_SIZE;
  // Left wing
  const lwX = ship.x + cos * (-SHIP_SIZE) - sin * SHIP_SIZE * 0.7;
  const lwY = ship.y + sin * (-SHIP_SIZE) + cos * SHIP_SIZE * 0.7;
  // Right wing
  const rwX = ship.x + cos * (-SHIP_SIZE) + sin * SHIP_SIZE * 0.7;
  const rwY = ship.y + sin * (-SHIP_SIZE) - cos * SHIP_SIZE * 0.7;

  // Rasterize the triangle outline pixels for collision
  addLinePixels(pixels, noseX, noseY, lwX, lwY);
  addLinePixels(pixels, noseX, noseY, rwX, rwY);
  addLinePixels(pixels, lwX, lwY, rwX, rwY);

  return pixels;
}

function addLinePixels(
  pixels: { x: number; y: number }[],
  x0: number, y0: number,
  x1: number, y1: number
): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const steps = Math.max(dx, dy);
  if (steps === 0) {
    pixels.push({ x: Math.floor(x0), y: Math.floor(y0) });
    return;
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pixels.push({
      x: Math.floor(x0 + (x1 - x0) * t),
      y: Math.floor(y0 + (y1 - y0) * t),
    });
  }
}
