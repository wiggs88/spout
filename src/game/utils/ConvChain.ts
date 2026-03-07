/**
 * ConvChain — Markov-chain binary pattern synthesis.
 *
 * Learns the N×N pattern statistics of a sample bitmap and generates a new
 * bitmap of arbitrary size that reproduces those statistics. The process is
 * Metropolis MCMC: each pixel flip is accepted or rejected based on how much
 * it improves the match to the learned patterns.
 *
 * Reference: https://github.com/mxgmn/ConvChain
 *
 * @param sample        Source bitmap (true = solid, false = empty), row-major.
 * @param sampleWidth   Width of sample in pixels.
 * @param sampleHeight  Height of sample in pixels.
 * @param outputWidth   Desired output width.
 * @param outputHeight  Desired output height.
 * @param N             Pattern side length (3 = 3×3 windows; good default).
 * @param temperature   Sampling temperature — lower = stricter pattern match.
 * @param iterations    MCMC passes over the whole output grid (2–3 is enough).
 * @returns             Uint8Array (1 = solid, 0 = empty), row-major.
 */
export function convChain(
  sample: boolean[],
  sampleWidth: number,
  sampleHeight: number,
  outputWidth: number,
  outputHeight: number,
  N: number,
  temperature: number,
  iterations: number
): Uint8Array {
  const SW = sampleWidth;
  const SH = sampleHeight;
  const W  = outputWidth;
  const H  = outputHeight;

  // ── 1. Extract N×N pattern weights from sample (wrapping at edges) ────────
  const patternCount = 1 << (N * N);
  const weights = new Float64Array(patternCount);

  for (let sy = 0; sy < SH; sy++) {
    for (let sx = 0; sx < SW; sx++) {
      let idx = 0;
      for (let dy = 0; dy < N; dy++) {
        for (let dx = 0; dx < N; dx++) {
          if (sample[((sy + dy) % SH) * SW + ((sx + dx) % SW)]) {
            idx |= 1 << (dy * N + dx);
          }
        }
      }
      weights[idx]++;
    }
  }

  // ── 2. Initialise output (biased toward solid — caves are mostly rock) ─────
  const field = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    field[i] = Math.random() < 0.5 ? 1 : 0;
  }

  // ── 3. Metropolis MCMC ─────────────────────────────────────────────────────
  const total  = W * H;
  const invT   = 1.0 / temperature;

  for (let iter = 0; iter < iterations; iter++) {
    for (let n = 0; n < total; n++) {
      const r   = (Math.random() * total) | 0;
      const x   = r % W;
      const y   = (r / W) | 0;
      const cur = field[r];

      let q = 1.0;

      // Evaluate every N×N window that contains pixel (x, y).
      // A window whose top-left is (x-dx, y-dy) contains (x,y) at local
      // position (dx, dy), which maps to bit position dy*N+dx.
      for (let dy = 0; dy < N; dy++) {
        for (let dx = 0; dx < N; dx++) {
          const wx     = x - dx;
          const wy     = y - dy;
          const bitPos = dy * N + dx;

          // Build pattern index for this window, treating pixel (x,y) as 0.
          // Out-of-bounds neighbours are treated as solid (world boundary = rock).
          let idx = 0;
          for (let py = 0; py < N; py++) {
            for (let px = 0; px < N; px++) {
              if (px === dx && py === dy) continue; // skip the pixel being sampled
              const gx = wx + px;
              const gy = wy + py;
              if (gx < 0 || gx >= W || gy < 0 || gy >= H || field[gy * W + gx]) {
                idx |= 1 << (py * N + px);
              }
            }
          }

          // +1 smoothing avoids division by zero for unseen patterns.
          const w0 = weights[idx] + 1;
          const w1 = weights[idx | (1 << bitPos)] + 1;
          q *= cur === 1 ? w0 / w1 : w1 / w0;
        }
      }

      if (Math.pow(q, invT) > Math.random()) {
        field[r] ^= 1;
      }
    }
  }

  return field;
}
