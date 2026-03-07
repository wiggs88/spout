import { ShipState, GAME_WIDTH, GAME_HEIGHT } from '../../types/game';

export class CameraSystem {
  x: number = 0;
  y: number = 0;

  update(ship: ShipState): void {
    // Ship is always exactly centered
    this.x = ship.x - GAME_WIDTH / 2;
    this.y = ship.y - GAME_HEIGHT / 2;
  }
}
