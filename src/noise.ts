/** Seeded 2D gradient noise. Call it for a value; `withGradient` also writes the slope [d/dx, d/dy] into `out`. */
export interface Noise {
  (x: number, y: number): number;
  withGradient(x: number, y: number, out: number[]): number;
}

/** Seeded 2D gradient (Perlin) noise, roughly in [-1, 1]. */
export function makeNoise(rand: () => number): Noise {
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const GX = [1, -1, 0, 0, Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2];
  const GY = [0, 0, 1, -1, Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2, -Math.SQRT1_2];
  const SCALE = 1.41;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const fadeSlope = (t: number) => 30 * t * t * (t - 1) * (t - 1);

  const withGradient = (x: number, y: number, out: number[]) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const ha = perm[X + perm[Y]] & 7;
    const hb = perm[X + 1 + perm[Y]] & 7;
    const hc = perm[X + perm[Y + 1]] & 7;
    const hd = perm[X + 1 + perm[Y + 1]] & 7;
    const a = GX[ha] * xf + GY[ha] * yf;
    const b = GX[hb] * (xf - 1) + GY[hb] * yf;
    const c = GX[hc] * xf + GY[hc] * (yf - 1);
    const d = GX[hd] * (xf - 1) + GY[hd] * (yf - 1);
    const u = fade(xf);
    const v = fade(yf);
    const k = a - b - c + d;
    // value = a + u(b - a) + v(c - a) + uv·k, differentiated through both the corner dot products and the fade curves.
    out[0] =
      SCALE *
      (GX[ha] + u * (GX[hb] - GX[ha]) + v * (GX[hc] - GX[ha]) + u * v * (GX[ha] - GX[hb] - GX[hc] + GX[hd]) +
        fadeSlope(xf) * (b - a + v * k));
    out[1] =
      SCALE *
      (GY[ha] + u * (GY[hb] - GY[ha]) + v * (GY[hc] - GY[ha]) + u * v * (GY[ha] - GY[hb] - GY[hc] + GY[hd]) +
        fadeSlope(yf) * (c - a + u * k));
    return SCALE * (a + u * (b - a) + v * (c - a) + u * v * k);
  };

  const scratch = [0, 0];
  const noise = ((x: number, y: number) => withGradient(x, y, scratch)) as Noise;
  noise.withGradient = withGradient;
  return noise;
}

/** Fractal noise: `octaves` layers of noise, each at twice the frequency and half the strength. Roughly [-1, 1]. */
export function fbm(noise: Noise, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x, y);
    norm += amp;
    x = x * 2 + 17.3;
    y = y * 2 + 9.1;
    amp *= 0.5;
  }
  return sum / norm;
}

/** `fbm`, also writing its slope [d/dx, d/dy] into `out`. */
export function fbmWithGradient(noise: Noise, x: number, y: number, octaves: number, out: number[]): number {
  const g = [0, 0];
  let sum = 0;
  let gx = 0;
  let gy = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise.withGradient(x, y, g);
    gx += amp * freq * g[0];
    gy += amp * freq * g[1];
    norm += amp;
    x = x * 2 + 17.3;
    y = y * 2 + 9.1;
    amp *= 0.5;
    freq *= 2;
  }
  out[0] = gx / norm;
  out[1] = gy / norm;
  return sum / norm;
}

/** Ridged fractal noise: sharp creases where the noise crosses zero, like mountain ridges. In [0, 1]. */
export function ridged(noise: Noise, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const r = 1 - Math.abs(noise(x, y));
    sum += amp * r * r;
    norm += amp;
    x = x * 2 + 17.3;
    y = y * 2 + 9.1;
    amp *= 0.5;
  }
  return sum / norm;
}

/** A 32-bit hash of two integers, for placing things (like stars) on a grid of cells. */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
