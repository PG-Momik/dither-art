import { BAYER } from "./bayer.js";
import { seededRandom } from "./random.js";
import { DITHER_METHODS, type DitherMethod } from "./types.js";

/** Turns a grid of grey levels (0..1, row by row) into 1-bit pixels. */
export type Quantize = (grey: Float32Array, w: number, h: number) => Uint8Array<ArrayBuffer>;

/** Ordered dithering against the 8x8 Bayer matrix: a regular crosshatch, stable when the size changes. */
export const bayer: Quantize = (grey, w, h) => {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[y * w + x] = grey[y * w + x] > BAYER[(y & 7) * 8 + (x & 7)] ? 1 : 0;
  }
  return out;
};

const BLUE_SIZE = 64;
let blueNoise: Float32Array | undefined;

/**
 * A 64x64 blue-noise threshold map made with Ulichney's void-and-cluster method: every threshold level is spread as
 * evenly as possible, so dithering against it gives fine grain with no visible pattern. Built once, on first use.
 */
export function blueNoiseMap(): Float32Array {
  if (blueNoise) return blueNoise;
  const n = BLUE_SIZE;
  const total = n * n;
  const sigma = 1.5;
  // Gaussian energy that one set pixel adds to every other pixel, wrapping around the edges.
  const kernel = new Float32Array(total);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = Math.min(x, n - x);
      const dy = Math.min(y, n - y);
      kernel[y * n + x] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
    }
  }
  const bits = new Uint8Array(total);
  const energy = new Float32Array(total);
  const toggle = (i: number, on: boolean) => {
    bits[i] = on ? 1 : 0;
    const ix = i % n;
    const iy = (i / n) | 0;
    const sign = on ? 1 : -1;
    for (let y = 0; y < n; y++) {
      const ky = ((y - iy + n) % n) * n;
      for (let x = 0; x < n; x++) energy[y * n + x] += sign * kernel[ky + ((x - ix + n) % n)];
    }
  };
  const tightestCluster = () => {
    let best = -1;
    for (let i = 0; i < total; i++) if (bits[i] && (best < 0 || energy[i] > energy[best])) best = i;
    return best;
  };
  const largestVoid = () => {
    let best = -1;
    for (let i = 0; i < total; i++) if (!bits[i] && (best < 0 || energy[i] < energy[best])) best = i;
    return best;
  };

  // Start from a sparse random pattern and relax it until the tightest cluster is also the largest void.
  const rand = seededRandom(0x5eed);
  const initial = Math.floor(total / 10);
  for (let placed = 0; placed < initial; ) {
    const i = Math.floor(rand() * total);
    if (!bits[i]) {
      toggle(i, true);
      placed++;
    }
  }
  for (;;) {
    const cluster = tightestCluster();
    toggle(cluster, false);
    const hole = largestVoid();
    toggle(hole, true);
    if (hole === cluster) break;
  }
  const prototype = bits.slice();
  const prototypeEnergy = energy.slice();

  const rank = new Float32Array(total);
  // Rank the prototype's pixels by removing the tightest clusters first.
  for (let r = initial - 1; r >= 0; r--) {
    const i = tightestCluster();
    toggle(i, false);
    rank[i] = r;
  }
  // Then rank the rest by filling the largest voids.
  bits.set(prototype);
  energy.set(prototypeEnergy);
  for (let r = initial; r < total; r++) {
    const i = largestVoid();
    toggle(i, true);
    rank[i] = r;
  }
  for (let i = 0; i < total; i++) rank[i] = (rank[i] + 0.5) / total;
  blueNoise = rank;
  return rank;
}

/** Thresholding against blue noise: fine, even grain with no grid, and as stable as Bayer when the size changes. */
export const blueNoiseDither: Quantize = (grey, w, h) => {
  const map = blueNoiseMap();
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + x] = grey[y * w + x] > map[(y % BLUE_SIZE) * BLUE_SIZE + (x % BLUE_SIZE)] ? 1 : 0;
    }
  }
  return out;
};

/**
 * Error diffusion: each pixel is rounded to 0 or 1 and the rounding error is shared with the neighbours still to come,
 * weighted by `taps` as [dx, dy, weight]. Rows alternate direction (serpentine), which avoids diagonal "worms".
 */
function diffuse(taps: ReadonlyArray<readonly [number, number, number]>): Quantize {
  return (grey, w, h) => {
    const buf = Float32Array.from(grey, (v) => (v < 0 ? 0 : v > 1 ? 1 : v));
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const forward = y % 2 === 0;
      for (let step = 0; step < w; step++) {
        const x = forward ? step : w - 1 - step;
        const i = y * w + x;
        const bit = buf[i] > 0.5 ? 1 : 0;
        out[i] = bit;
        const err = buf[i] - bit;
        for (const [dx, dy, weight] of taps) {
          const nx = forward ? x + dx : x - dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny < h) buf[ny * w + nx] += err * weight;
        }
      }
    }
    return out;
  };
}

/** Floyd–Steinberg (1976): the classic error diffusion, smooth tones and fine detail. */
export const floydSteinberg = diffuse([
  [1, 0, 7 / 16],
  [-1, 1, 3 / 16],
  [0, 1, 5 / 16],
  [1, 1, 1 / 16],
]);

/** Atkinson (the original Macintosh): passes on only 3/4 of the error, for crisp, high-contrast pictures. */
export const atkinson = diffuse([
  [1, 0, 1 / 8],
  [2, 0, 1 / 8],
  [-1, 1, 1 / 8],
  [0, 1, 1 / 8],
  [1, 1, 1 / 8],
  [0, 2, 1 / 8],
]);

const METHODS: Record<DitherMethod, Quantize> = {
  bayer,
  "blue-noise": blueNoiseDither,
  "floyd-steinberg": floydSteinberg,
  atkinson,
};

/** Throws a readable error for anything that is not a method name. */
export function checkMethod(method: unknown): asserts method is DitherMethod {
  if (!DITHER_METHODS.includes(method as DitherMethod)) {
    throw new TypeError(`unknown dither method ${JSON.stringify(method)}; expected one of ${DITHER_METHODS.join(", ")}`);
  }
}

/**
 * Dithers any grid of ink amounts (0 = paper, 1 = solid ink, row by row) to 1-bit pixels: use it on your own images
 * or generated fields. Values outside 0..1 are clamped, and `NaN` counts as paper.
 */
export function dither(
  ink: ArrayLike<number>,
  width: number,
  height: number,
  method: DitherMethod = "bayer",
): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`width and height must be positive integers, got ${width} x ${height}`);
  }
  if (ink.length !== width * height) {
    throw new RangeError(`expected ${width} x ${height} = ${width * height} values, got ${ink.length}`);
  }
  checkMethod(method);
  const grey = new Float32Array(ink.length);
  for (let i = 0; i < ink.length; i++) {
    const v = ink[i];
    grey[i] = v > 0 ? (v < 1 ? v : 1) : 0;
  }
  return METHODS[method](grey, width, height);
}
