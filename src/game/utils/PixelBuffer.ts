export class PixelBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height);
  }

  get(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.data[y * this.width + x];
  }

  set(x: number, y: number, value: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.data[y * this.width + x] = value;
  }

  isSolid(x: number, y: number): boolean {
    return this.get(x, y) > 0;
  }

  damage(x: number, y: number, amount: number = 1): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    const idx = y * this.width + x;
    const current = this.data[idx];
    if (current <= 0) return false;
    if (current === 255) return false; // indestructible rock — never damaged
    this.data[idx] = Math.max(0, current - amount);
    return this.data[idx] === 0;
  }

  fillRect(x: number, y: number, w: number, h: number, value: number): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + w);
    const y1 = Math.min(this.height, y + h);
    for (let py = y0; py < y1; py++) {
      const rowOffset = py * this.width;
      for (let px = x0; px < x1; px++) {
        this.data[rowOffset + px] = value;
      }
    }
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    this.fillRect(x, y, w, h, 0);
  }

  clearEllipse(cx: number, cy: number, rx: number, ry: number): void {
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + ry));
    for (let py = y0; py <= y1; py++) {
      const dy = (py - cy) / ry;
      const rowOffset = py * this.width;
      for (let px = x0; px <= x1; px++) {
        const dx = (px - cx) / rx;
        if (dx * dx + dy * dy <= 1) {
          this.data[rowOffset + px] = 0;
        }
      }
    }
  }

  /** Clear a rounded rectangle centered at (cx, cy) with given half-widths and corner radius. */
  clearRoundedRect(cx: number, cy: number, hw: number, hh: number, r: number): void {
    const left = Math.max(0, Math.floor(cx - hw));
    const right = Math.min(this.width - 1, Math.ceil(cx + hw));
    const top = Math.max(0, Math.floor(cy - hh));
    const bottom = Math.min(this.height - 1, Math.ceil(cy + hh));

    // Inner rect boundaries (where corners start)
    const innerLeft = cx - hw + r;
    const innerRight = cx + hw - r;
    const innerTop = cy - hh + r;
    const innerBottom = cy + hh - r;
    const r2 = r * r;

    for (let py = top; py <= bottom; py++) {
      const rowOffset = py * this.width;
      for (let px = left; px <= right; px++) {
        // Check if in a corner region
        let cornerDx = 0;
        let cornerDy = 0;
        if (px < innerLeft) cornerDx = px - innerLeft;
        else if (px > innerRight) cornerDx = px - innerRight;
        if (py < innerTop) cornerDy = py - innerTop;
        else if (py > innerBottom) cornerDy = py - innerBottom;

        // If in a corner, check distance to corner center
        if (cornerDx !== 0 && cornerDy !== 0) {
          if (cornerDx * cornerDx + cornerDy * cornerDy > r2) continue;
        }

        this.data[rowOffset + px] = 0;
      }
    }
  }
}
