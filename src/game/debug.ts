/**
 * Mutable debug config read directly by the Phaser render loop each frame.
 * React components update this object; no prop-passing needed.
 */
export const debugConfig = {
  /** Terrain cells with hp <= this value are treated as empty (visual + collision). */
  wallThreshold: 0,
};
