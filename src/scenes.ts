import { fbm, fbmWithGradient, hash2, makeNoise, ridged } from "./noise.js";
import type { Scene } from "./types.js";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (edge0: number, edge1: number, v: number) => {
  const t = clamp01((v - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/**
 * Samples a slow 1D function once, finely enough for the output size, and returns a linear interpolation of it. Ridge
 * and dune outlines only depend on x, so this saves recomputing fractal noise for every pixel below them.
 */
function tabulate(fn: (x: number) => number, from: number, to: number, pixel: number): (x: number) => number {
  const step = Math.min(pixel / 4, 0.005);
  const n = Math.ceil((to - from) / step) + 2;
  const table = new Float64Array(n);
  for (let i = 0; i < n; i++) table[i] = fn(from + i * step);
  return (x) => {
    const f = (x - from) / step;
    const i = f < 0 ? 0 : f > n - 2 ? n - 2 : Math.floor(f);
    const t = clamp01(f - i);
    return table[i] + (table[i + 1] - table[i]) * t;
  };
}

/** Scattered stars on a grid of cells, each star at least a pixel across and never crowded. Returns true on a star. */
function starAt(x: number, y: number, size: number, pixel: number, seed: number, chance: number): boolean {
  const cell = Math.max(size, 9 * pixel);
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  const h = hash2(cx, cy, seed);
  if ((h & 1023) / 1024 >= chance) return false;
  const sx = (cx + 0.15 + ((h >>> 10) & 255) / 360) * cell;
  const sy = (cy + 0.15 + ((h >>> 18) & 255) / 360) * cell;
  const big = (h >>> 26) % 7 === 0;
  const r = Math.max(pixel * (big ? 0.9 : 0.5), cell * (big ? 0.06 : 0.025));
  return Math.abs(x - sx) < r && Math.abs(y - sy) < r;
}

/**
 * Layered mountain ranges under a sun. Back ranges are sharp and pale, front ranges rolling and dark; faces turned
 * towards the sun are lit, and mist gathers in the valleys of the distant ranges.
 */
export const ridges: Scene = (rand, { aspect, pixel }) => {
  const noise = makeNoise(rand);
  const count = 4 + Math.floor(rand() * 2);
  const layers = Array.from({ length: count }, (_, i) => {
    const depth = i / (count - 1);
    const base = 0.46 + depth * 0.42 + (rand() - 0.5) * 0.04;
    const amp = 0.34 - depth * 0.2;
    const freq = 1.3 + rand() * 0.9 + depth * 0.6;
    const offset = i * 31.7 + rand() * 10;
    const sharp = depth < 0.6;
    const crest = tabulate(
      (x) => base - amp * (sharp ? ridged(noise, x * freq, offset, 5) : 0.5 + 0.5 * fbm(noise, x * freq, offset, 4)),
      -1,
      aspect + 1,
      pixel,
    );
    return { depth, offset, crest, tone: 0.28 + depth * 0.7 };
  });
  const sun = { x: aspect * (0.2 + rand() * 0.6), y: 0.16 + rand() * 0.1, r: 0.09 + rand() * 0.05 };
  const striped = rand() < 0.65 && sun.r > 12 * pixel;
  const lightDir = sun.x < aspect / 2 ? -1 : 1;
  const outline = Math.max(0.008, pixel);

  return (x, y) => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const top = layer.crest(x);
      if (y < top) continue;
      const below = y - top;
      if (below < outline) return 1;
      // Faces run down and away from the peaks, so the lighting is read from the crest a little uphill of this point.
      const sx = x + below * lightDir * 0.6;
      const slope = (layer.crest(sx + 0.02) - layer.crest(sx - 0.02)) / 0.04;
      const lit = Math.tanh(slope * lightDir * 2);
      let tone = layer.tone - 0.32 * lit * (1 - smooth(0.02, 0.35, below));
      tone += 0.05 * fbm(noise, x * 6, y * 6 + layer.offset, 2);
      tone *= 1 - (1 - layer.depth) * 0.75 * smooth(0.04, 0.3, below);
      return clamp01(tone);
    }
    const d = Math.hypot(x - sun.x, y - sun.y);
    if (d < sun.r) {
      const stripe = (y - sun.y) / sun.r;
      if (striped && stripe > 0.1 && (stripe * 7) % 1.4 > 1.4 - stripe * 0.9) return 0;
      return 1;
    }
    const halo = 0.35 * (1 - smooth(sun.r, sun.r * 3, d));
    const sky = 0.04 + 0.18 * smooth(0.1, 0.7, y);
    return Math.max(halo, sky);
  };
};

/** Lit spheres resting on a floor (sometimes a checkerboard), each with a soft shadow and a bright highlight. */
export const orbs: Scene = (rand, { aspect, pixel }) => {
  const lx0 = (rand() - 0.5) * 1.4;
  const ly0 = -0.5 - rand() * 0.4;
  const lz0 = 0.75;
  const ln = Math.hypot(lx0, ly0, lz0);
  const L = { x: lx0 / ln, y: ly0 / ln, z: lz0 / ln };
  const hn = Math.hypot(L.x, L.y, L.z + 1);
  const H = { x: L.x / hn, y: L.y / hn, z: (L.z + 1) / hn };
  const horizon = 0.45 + rand() * 0.15;
  const checker = rand() < 0.5;
  const balls = Array.from({ length: 2 + Math.floor(rand() * 3) }, () => {
    const r = 0.12 + rand() * 0.22;
    const b = { x: r + rand() * (aspect - 2 * r), y: Math.max(r + 0.04, horizon + rand() * (0.95 - horizon) - r * 0.4), r, rim: 0 };
    b.rim = 1 - Math.max(0.03, (1.2 * pixel) / r);
    return b;
  }).sort((a, b) => a.y + a.r - (b.y + b.r));

  const floor = (x: number, y: number) => {
    const plain = 0.3 + 0.35 * smooth(horizon, 1.1, y);
    if (!checker) return plain;
    // A checkerboard in perspective, fading to its average grey where the squares get smaller than a few pixels.
    const dy = y - horizon;
    const z = 0.25 / dy;
    const u = (x - aspect / 2) * z;
    const square = (Math.floor(u * 8) + Math.floor(z * 8)) & 1;
    const squareHeight = (dy * dy) / (0.25 * 8);
    return plain + (square ? 0.2 : -0.2) * smooth(2, 6, squareHeight / pixel);
  };

  return (x, y) => {
    let v = y < horizon ? 0.05 + 0.15 * smooth(0, horizon, y) : floor(x, y);
    for (const b of balls) {
      const sx = (x - (b.x - L.x * b.r * 1.4)) / (b.r * 1.5);
      const sy = (y - (b.y + b.r * 0.85)) / (b.r * 0.32);
      const s2 = sx * sx + sy * sy;
      if (s2 < 1) v = Math.max(v, 0.6 + 0.35 * smooth(0, 0.7, 1 - s2));
    }
    for (const b of balls) {
      const dx = (x - b.x) / b.r;
      const dy = (y - b.y) / b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 1) continue;
      if (d2 > b.rim * b.rim) {
        v = 1;
        continue;
      }
      const dz = Math.sqrt(1 - d2);
      const diffuse = Math.max(0, dx * L.x + dy * L.y + dz * L.z);
      const spec = Math.pow(Math.max(0, dx * H.x + dy * H.y + dz * H.z), 60);
      const bounce = 0.12 * Math.max(0, dy) * (1 - diffuse);
      v = spec > 0.35 ? 0 : clamp01(1 - (0.06 + 0.9 * diffuse + bounce));
    }
    return v;
  };
};

/** A survey map: hillshaded terrain in terraced tones, with even contour lines and a heavier line every fifth level. */
export const contours: Scene = (rand, { aspect, pixel }) => {
  const noise = makeNoise(rand);
  const hills = Array.from({ length: 3 + Math.floor(rand() * 3) }, () => ({
    x: rand() * aspect,
    y: rand(),
    r: 0.2 + rand() * 0.35,
    h: 0.35 + rand() * 0.45,
  }));
  // Fewer, wider-spaced levels on small pictures, where closely packed lines would merge into grey.
  const detail = Math.min(1, Math.sqrt(1 / (pixel * 240)));
  const bands = Math.max(4, Math.round((9 + Math.floor(rand() * 5)) * detail));
  const angle = rand() * Math.PI * 2;
  const lx = Math.cos(angle);
  const ly = Math.sin(angle);
  const thin = Math.max(0.0035, pixel * 0.55);
  const thick = Math.max(0.007, pixel * 1.1);
  const g = [0, 0];

  return (x, y) => {
    let h = 0.12 * (fbmWithGradient(noise, x * 2.2, y * 2.2, 4, g) + 1);
    let gx = 0.12 * 2.2 * g[0];
    let gy = 0.12 * 2.2 * g[1];
    for (const hill of hills) {
      const r2 = hill.r * hill.r;
      const bump = hill.h * Math.exp((-((x - hill.x) ** 2 + (y - hill.y) ** 2) / r2) * 1.5);
      h += bump;
      gx -= (bump * 3 * (x - hill.x)) / r2;
      gy -= (bump * 3 * (y - hill.y)) / r2;
    }
    const level = h * bands;
    const nearest = Math.round(level);
    const frac = Math.abs(level - nearest);
    const dist = frac / Math.max(Math.hypot(gx, gy) * bands, 1e-6);
    if (nearest > 0 && dist < (nearest % 5 === 0 ? thick : thin)) return 1;
    const terrace = Math.floor(level) / (bands * 1.1);
    const shade = clamp01(0.5 + (gx * lx + gy * ly) * 0.35);
    return clamp01(0.08 + 0.3 * terrace + 0.45 * shade * shade);
  };
};

/** A night sea under the moon: stars, streaks of cloud, and a path of glints on the swell leading to the horizon. */
export const sea: Scene = (rand, { aspect, pixel }) => {
  const noise = makeNoise(rand);
  const horizon = 0.42 + rand() * 0.14;
  const moon = { x: aspect * (0.22 + rand() * 0.56), y: horizon * (0.3 + rand() * 0.3), r: 0.055 + rand() * 0.04 };
  const crescent = rand() < 0.4;
  const bite = { x: moon.x + moon.r * (rand() < 0.5 ? -0.55 : 0.55), y: moon.y - moon.r * 0.25 };
  const cloudOffset = rand() * 50;
  const starSeed = Math.floor(rand() * 0xffffffff);
  const g = [0, 0];

  return (x, y) => {
    if (y < horizon) {
      const d = Math.hypot(x - moon.x, y - moon.y);
      if (d < moon.r) {
        if (crescent && Math.hypot(x - bite.x, y - bite.y) < moon.r * 0.92) return 0.88;
        return 0.04 * (1 + fbm(noise, x * 40, y * 40, 2));
      }
      let v = 0.94 - 0.42 * smooth(0, horizon, y);
      v -= 0.35 * (1 - smooth(moon.r, moon.r * 4, d));
      const cloud = fbm(noise, x * 1.6 + cloudOffset, y * 11, 4);
      if (cloud > 0.12) v = Math.min(v, 0.72 - 0.35 * (1 - smooth(0, aspect * 0.6, Math.abs(x - moon.x))) * smooth(0.12, 0.3, cloud));
      if (v > 0.7 && starAt(x, y, 0.045, pixel, starSeed, 0.5)) return 0;
      return clamp01(v);
    }
    // The swell, drawn in perspective: z grows with distance, so waves bunch up and flatten towards the horizon.
    const dy = y - horizon;
    const z = 0.08 / (dy + 0.002);
    const wave = fbmWithGradient(noise, (x - aspect / 2) * z * 10 + 90, z * 22, 3, g);
    // How many pixels one wave spans vertically here; below a few, the swell is just the sea's average grey.
    const detail = smooth(2, 5, (dy * dy) / (0.08 * 22) / pixel);
    // Darker than the sky at the horizon, with the lit tops of the swell as pale streaks.
    let v = 0.86 - 0.1 * smooth(0, 0.45, dy) - 0.45 * smooth(0.1, 0.5, wave) * detail;
    const width = moon.r * (0.7 + dy * 4);
    const off = Math.abs(x - moon.x + 0.02 * noise(z * 3, 7.7)) / width;
    if (off < 1.4) {
      // Glints: wave facets tilted back towards the moon catch its light, more of them nearer the middle of the path.
      const facet = 0.45 * wave + 0.2 * g[1];
      if (facet > 0.12 + off * off * 0.25) return 0;
      v -= 0.3 * (1 - smooth(0.3, 1.4, off));
    }
    return clamp01(v);
  };
};

/** Desert dunes under a low sun: smooth crests, hard-edged slip-face shadows, and wind ripples on the sunlit sand. */
export const dunes: Scene = (rand, { aspect, pixel }) => {
  const noise = makeNoise(rand);
  const count = 3 + Math.floor(rand() * 2);
  const lightDir = rand() < 0.5 ? -1 : 1;
  const layers = Array.from({ length: count }, (_, i) => {
    const depth = i / (count - 1);
    const base = 0.52 + depth * 0.36 + (rand() - 0.5) * 0.04;
    const amp = 0.24 - depth * 0.1;
    const freq = 0.8 + rand() * 0.6 + depth * 0.5;
    const offset = i * 23.3 + rand() * 10;
    // One octave of ridged noise gives long smooth flanks meeting at sharp crests, like wind-built sand.
    const crest = tabulate(
      (x) => base - amp * (0.8 * ridged(noise, x * freq, offset, 1) + 0.1 * (1 + fbm(noise, x * freq * 3, offset, 2))),
      -2,
      aspect + 2,
      pixel,
    );
    return { depth, crest, offset, base };
  });
  const sun = { x: aspect * (lightDir < 0 ? 0.1 + rand() * 0.3 : 0.6 + rand() * 0.3), y: 0.18 + rand() * 0.12, r: 0.1 };
  // Wind ripples at least a few pixels apart, each line about a pixel thick, so they stay lines rather than grey.
  const ripplePeriod = Math.max(0.028, 6 * pixel);
  const rippleLine = Math.max(0.15, (1.1 * pixel) / ripplePeriod);

  return (x, y) => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const top = layer.crest(x);
      if (y < top) continue;
      const below = y - top;
      if (below < Math.max(0.005, pixel)) return 0.5 + 0.5 * layer.depth;
      const haze = 1 - (1 - layer.depth) * 0.4;
      // The slip face: shadow falls on the side of each crest turned away from the sun, its edge running diagonally
      // down from the peak, and ends at the dune's foot, so it is deepest under the peaks and runs out in the troughs.
      const sx = x + below * lightDir * 0.8;
      const slope = (layer.crest(sx + 0.006) - layer.crest(sx - 0.006)) / 0.012;
      if (slope * lightDir < -0.05 && below < (layer.base - top) * 1.2) {
        return clamp01((0.62 + 0.33 * layer.depth) * haze + 0.05 * fbm(noise, x * 9, y * 9, 2));
      }
      const phase = (y * 1.0 + 0.012 * fbm(noise, x * 4, layer.offset, 2) + 0.06 * x * lightDir) / ripplePeriod;
      const onRipple = phase - Math.floor(phase) < rippleLine && below > pixel * 2;
      const tone = 0.14 + 0.2 * layer.depth + 0.12 * smooth(0, 0.3, below) + (onRipple ? 0.3 : 0);
      return clamp01(tone * haze);
    }
    const d = Math.hypot(x - sun.x, y - sun.y);
    if (d < sun.r) return 0.5;
    return 0.02 + 0.06 * smooth(0, 0.6, y) + 0.12 * (1 - smooth(sun.r, sun.r * 2.2, d));
  };
};

/** A ringed planet in deep space: a banded, lit globe, rings passing in front and behind, and a scatter of stars. */
export const planet: Scene = (rand, { aspect, pixel }) => {
  const noise = makeNoise(rand);
  const R = 0.2 + rand() * 0.1;
  const cx = aspect * (0.3 + rand() * 0.4);
  const cy = 0.42 + rand() * 0.16;
  const tilt = 0.2 + rand() * 0.18;
  const rot = (rand() - 0.5) * 0.6;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const lx0 = rand() < 0.5 ? -0.7 : 0.7;
  const ln = Math.hypot(lx0, -0.35, 0.6);
  const L = { x: lx0 / ln, y: -0.35 / ln, z: 0.6 / ln };
  const bandOffset = rand() * 40;
  const starSeed = Math.floor(rand() * 0xffffffff);
  const inner = 1.3;
  const outer = 2.05;
  const ringGap = 1.62 + rand() * 0.1;

  // The rings lie in a plane that faces the viewer at an angle, so a circle of radius e in it is seen as an ellipse with
  // semi-axes e and e * tilt, its lower half passing in front of the globe.
  const ringNormal = { y: -Math.sqrt(1 - tilt * tilt), z: tilt };
  const towardsLight = ringNormal.y * L.y + ringNormal.z * L.z || 1e-6;

  const ringTone = (e: number) => {
    if (e < inner || e > outer) return -1;
    if (Math.abs(e - ringGap) < Math.max(0.03, pixel / R)) return -1;
    return 0.2 + 0.25 * (Math.sin(e * 38) * 0.5 + 0.5) * smooth(inner, outer, e);
  };

  return (x, y) => {
    const px = (x - cx) * cos + (y - cy) * sin;
    const py = -(x - cx) * sin + (y - cy) * cos;
    const ring = ringTone(Math.hypot(px, py / tilt) / R);
    const d2 = (px * px + py * py) / (R * R);
    if (ring >= 0 && (py > 0 || d2 >= 1)) return ring;
    if (d2 < 1) {
      const nx = px / R;
      const ny = py / R;
      const nz = Math.sqrt(1 - d2);
      const light = Math.max(0, nx * L.x + ny * L.y + nz * L.z);
      const band = 0.5 + 0.5 * Math.sin(ny * 11 + 2.5 * fbm(noise, nx * 3 + bandOffset, ny * 14, 3));
      // The rings' shadow: follow the light from this point until it meets the ring plane, and see if a ring is there.
      const hit = -(ringNormal.y * ny + ringNormal.z * nz) / towardsLight;
      const shadowed = hit > 0 && ringTone(Math.hypot(nx + L.x * hit, ny + L.y * hit, nz + L.z * hit)) >= 0;
      const lit = light * (0.75 + 0.25 * band) * (shadowed ? 0.3 : 1);
      return clamp01(1 - lit * 1.15);
    }
    if (starAt(x, y, 0.05, pixel, starSeed, 0.55)) return 0;
    const nebula = fbm(noise, x * 1.3 + 60, y * 1.3, 4);
    return clamp01(0.94 - 0.35 * smooth(0.05, 0.6, nebula));
  };
};
