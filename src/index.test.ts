import { describe, expect, it } from "vitest";
import {
  blueNoiseMap,
  dither,
  DITHER_METHODS,
  DITHER_SCENES,
  ditherPixels,
  hashSeed,
  sceneForSeed,
  seededRandom,
  toRGBA,
  toSVG,
  type Scene,
} from "./index";
import snapshot from "./pictures.snapshot.json";

const ink = (pixels: Uint8Array) => pixels.reduce((sum, p) => sum + p, 0) / pixels.length;

describe("ditherPixels", () => {
  it("is deterministic: the same seed and size give the same picture", () => {
    expect(ditherPixels(80, 40, "kathmandu-college")).toEqual(ditherPixels(80, 40, "kathmandu-college"));
  });

  it("gives different seeds different pictures", () => {
    for (const scene of DITHER_SCENES) {
      expect(ditherPixels(80, 40, "a", { scene })).not.toEqual(ditherPixels(80, 40, "b", { scene }));
    }
  });

  it("returns a width x height grid of 0/1 pixels", () => {
    const pixels = ditherPixels(33, 17, "x");
    expect(pixels).toHaveLength(33 * 17);
    expect(pixels.every((p) => p === 0 || p === 1)).toBe(true);
  });

  it.each(DITHER_SCENES)("draws %s with some ink and some paper, at any shape", (scene) => {
    for (const seed of ["a", "b", "tu-central-campus"]) {
      for (const [w, h] of [
        [120, 60],
        [60, 120],
        [300, 40],
      ]) {
        const share = ink(ditherPixels(w, h, seed, { scene }));
        expect(share).toBeGreaterThan(0.05);
        expect(share).toBeLessThan(0.95);
      }
    }
  });

  it("uses more ink at a higher density", () => {
    expect(ink(ditherPixels(120, 60, "a", { density: 1.5 }))).toBeGreaterThan(
      ink(ditherPixels(120, 60, "a", { density: 0.5 })),
    );
  });

  it("picks a stable scene per seed and uses every scene across seeds", () => {
    expect(sceneForSeed("pulchowk")).toBe(sceneForSeed("pulchowk"));
    const seen = new Set(Array.from({ length: 60 }, (_, i) => sceneForSeed(`college-${i}`)));
    expect(seen.size).toBe(DITHER_SCENES.length);
  });

  it.each(DITHER_METHODS)("dithers with %s: 0/1 pixels, ink following density", (method) => {
    const light = ink(ditherPixels(120, 60, "a", { method, density: 0.5 }));
    const dark = ink(ditherPixels(120, 60, "a", { method, density: 1.5 }));
    expect(light).toBeGreaterThan(0.02);
    expect(dark).toBeGreaterThan(light);
    expect(ditherPixels(33, 17, "x", { method }).every((p) => p === 0 || p === 1)).toBe(true);
  });

  it("keeps the average grey level whatever the method", () => {
    const shares = DITHER_METHODS.map((method) => ink(ditherPixels(160, 100, "tone", { scene: "orbs", method })));
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThan(0.08);
  });

  it("treats an invalid density as no ink", () => {
    expect(ink(ditherPixels(40, 20, "a", { density: Number.NaN }))).toBe(0);
    expect(ink(ditherPixels(40, 20, "a", { density: -1 }))).toBe(0);
  });

  it("floors sizes and keeps them at least 1", () => {
    expect(ditherPixels(10.9, 5.2, "a")).toHaveLength(10 * 5);
    expect(ditherPixels(0, -3, "a")).toHaveLength(1);
  });

  it("rejects sizes that are not finite numbers", () => {
    expect(() => ditherPixels(Number.NaN, 10, "a")).toThrow(RangeError);
    expect(() => ditherPixels(10, Number.POSITIVE_INFINITY, "a")).toThrow(/height must be a finite number/);
  });

  it("rejects unknown scenes and methods with a readable message", () => {
    // @ts-expect-error: testing a bad name from plain JavaScript
    expect(() => ditherPixels(10, 10, "a", { scene: "nope" })).toThrow(/unknown scene "nope"; expected one of ridges/);
    // @ts-expect-error: testing a bad name from plain JavaScript
    expect(() => ditherPixels(10, 10, "a", { method: "nope" })).toThrow(/unknown dither method "nope"/);
    // @ts-expect-error: not an own property, so not a scene
    expect(() => ditherPixels(10, 10, "a", { scene: "toString" })).toThrow(/unknown scene/);
  });

  it("gives numeric seeds their own pictures instead of all sharing one", () => {
    // @ts-expect-error: plain JavaScript callers may pass numbers
    expect(ditherPixels(40, 20, 1, { scene: "ridges" })).not.toEqual(ditherPixels(40, 20, 2, { scene: "ridges" }));
  });

  it("draws a custom scene, with seeded randomness and the picture's shape", () => {
    const calls: { aspect: number; pixel: number }[] = [];
    const halves: Scene = (rand, context) => {
      calls.push(context);
      const split = rand() * context.aspect;
      return (x) => (x < split ? 1 : 0);
    };
    const a = ditherPixels(40, 20, "a", { scene: halves });
    expect(a).toEqual(ditherPixels(40, 20, "a", { scene: halves }));
    expect(a).not.toEqual(ditherPixels(40, 20, "b", { scene: halves }));
    expect(calls[0]).toEqual({ aspect: 2, pixel: 1 / 20 });
  });

  // Every seed's picture depends on these: change them only on purpose, with a major version bump. To see a change
  // on purpose, run `npm run build && node scripts/snapshot.mjs --update` and look at `npm run gallery`.
  it.each(Object.entries(snapshot))("draws exactly the same picture as before: %s", (key, expected) => {
    const [scene, method, size] = key.split(" ");
    const [w, h] = size.split("x").map(Number);
    const pixels = ditherPixels(w, h, "snapshot", { scene: scene as never, method: method as never });
    expect(hashSeed(pixels.join(""))).toBe(expected);
  });
});

describe("dither", () => {
  it("dithers your own grey levels, keeping their average", () => {
    const ramp = Array.from({ length: 64 * 64 }, (_, i) => (i % 64) / 63);
    for (const method of DITHER_METHODS) {
      expect(Math.abs(ink(dither(ramp, 64, 64, method)) - 0.5)).toBeLessThan(0.03);
    }
  });

  it("clamps out-of-range values and treats NaN as paper", () => {
    expect(ink(dither([2, 5, -1, Number.NaN], 2, 2, "floyd-steinberg"))).toBe(0.5);
  });

  it("checks the grid", () => {
    expect(() => dither([0, 1, 0], 2, 2)).toThrow(/expected 2 x 2 = 4 values, got 3/);
    expect(() => dither([0, 1], 2.5, 1)).toThrow(RangeError);
    // @ts-expect-error: bad method
    expect(() => dither([0], 1, 1, "nope")).toThrow(/unknown dither method/);
  });
});

describe("toSVG", () => {
  it("draws each run of ink as one stroke, in relative steps", () => {
    const svg = toSVG([1, 1, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1], 4, 3);
    expect(svg).toContain('viewBox="0 0 4 3"');
    expect(svg).toContain('d="M0 0.5h2m1 0h1m-4 2h4"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('aria-hidden="true"');
  });

  it("scales, fills paper, and takes an accessible title, escaping attribute text", () => {
    const svg = toSVG([1, 0], 2, 1, { scale: 3, paper: "#fff", ink: 'red"', title: "Hills & sun" });
    expect(svg).toContain('width="6" height="3"');
    expect(svg).toContain('<rect width="2" height="1" fill="#fff"/>');
    expect(svg).toContain('stroke="red&quot;"');
    expect(svg).toContain('role="img" aria-label="Hills &amp; sun"><title>Hills &amp; sun</title>');
  });

  it("leaves out the path when there is no ink, and checks its input", () => {
    expect(toSVG([0, 0], 2, 1)).not.toContain("<path");
    expect(() => toSVG([0, 0], 3, 1)).toThrow(RangeError);
    expect(() => toSVG([0], 1, 1, { scale: 0 })).toThrow(RangeError);
  });
});

describe("toRGBA", () => {
  it("paints ink and paper, 4 bytes per pixel", () => {
    expect(Array.from(toRGBA([1, 0]))).toEqual([0, 0, 0, 255, 0, 0, 0, 0]);
    expect(Array.from(toRGBA([1, 0], { ink: "#c41e3a", paper: "#fff8" }))).toEqual([196, 30, 58, 255, 255, 255, 255, 136]);
    expect(Array.from(toRGBA([1], { ink: [1, 2, 3] }))).toEqual([1, 2, 3, 255]);
  });

  it("rejects colours it cannot read", () => {
    expect(() => toRGBA([1], { ink: "red" })).toThrow(TypeError);
  });
});

describe("building blocks", () => {
  it("has a blue-noise map that uses every threshold level exactly once", () => {
    expect(new Set(blueNoiseMap()).size).toBe(64 * 64);
  });

  it("has a seeded random generator in [0, 1)", () => {
    const rand = seededRandom(hashSeed("x"));
    const values = Array.from({ length: 1000 }, rand);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(seededRandom(hashSeed("x"))()).toBe(values[0]);
  });
});
