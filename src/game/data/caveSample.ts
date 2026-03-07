/**
 * 32×32 cave sample for ConvChain — large smooth organic blobs.
 *
 * The sample uses large overlapping ovals (~43 % open) with smooth curved
 * edges and wrapping so it tiles seamlessly.  ConvChain learns the 3×3
 * neighbourhood statistics and reproduces them at full game resolution,
 * producing wide interconnected cave chambers with naturally curved walls —
 * matching the organic blob style shown in the ConvChain reference images.
 *
 * true = solid rock   false = open/navigable space
 */

export const SAMPLE_WIDTH  = 32;
export const SAMPLE_HEIGHT = 32;

function buildSample(): boolean[] {
  const W = SAMPLE_WIDTH;
  const H = SAMPLE_HEIGHT;
  const s = new Array<boolean>(W * H).fill(true);

  /**
   * Clear an ellipse using toroidal (wrapping) distance so the sample tiles
   * seamlessly — critical for ConvChain pattern extraction at the edges.
   */
  const clearOval = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let dx = Math.abs(x - cx);
        let dy = Math.abs(y - cy);
        if (dx > W / 2) dx = W - dx; // wrap horizontally
        if (dy > H / 2) dy = H - dy; // wrap vertically
        if ((dx / rx) * (dx / rx) + (dy / ry) * (dy / ry) <= 1) {
          s[y * W + x] = false;
        }
      }
    }
  };

  // Five large blobs, all overlapping with the central blob so the cave
  // system is fully connected.  Radii are large relative to the 32×32 grid
  // so ConvChain learns "wide open space" patterns, not thin tunnels.
  clearOval(8,  8,  7, 6); // top-left
  clearOval(24, 8,  6, 6); // top-right
  clearOval(16, 16, 8, 7); // centre — largest, acts as the hub
  clearOval(7,  25, 6, 5); // bottom-left
  clearOval(25, 24, 6, 6); // bottom-right

  return s;
}

export const CAVE_SAMPLE: boolean[] = buildSample();
