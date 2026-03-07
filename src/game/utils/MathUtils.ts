const SIN_TABLE_SIZE = 256;
const sinTable = new Float32Array(SIN_TABLE_SIZE);
const cosTable = new Float32Array(SIN_TABLE_SIZE);

for (let i = 0; i < SIN_TABLE_SIZE; i++) {
  const angle = (i / SIN_TABLE_SIZE) * Math.PI * 2;
  sinTable[i] = Math.sin(angle);
  cosTable[i] = Math.cos(angle);
}

export function fastSin(angle: number): number {
  const idx = ((angle / (Math.PI * 2)) * SIN_TABLE_SIZE) & (SIN_TABLE_SIZE - 1);
  return sinTable[idx];
}

export function fastCos(angle: number): number {
  const idx = ((angle / (Math.PI * 2)) * SIN_TABLE_SIZE) & (SIN_TABLE_SIZE - 1);
  return cosTable[idx];
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
