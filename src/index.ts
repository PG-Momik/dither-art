export { hashSeed } from "./hash.js";
export { seededRandom } from "./random.js";
export { BAYER } from "./bayer.js";
export { blueNoiseMap, dither } from "./methods.js";
export { ridges, orbs, contours, sea, dunes, planet } from "./scenes.js";
export { toSVG, toRGBA, type SvgOptions, type RgbaOptions, type Colour } from "./output.js";
export type { DitherScene, DitherMethod, Field, Scene, SceneContext, DitherOptions } from "./types.js";
export { DITHER_SCENES, DITHER_METHODS } from "./types.js";

import { hashSeed } from "./hash.js";
import { seededRandom } from "./random.js";
import { checkMethod, dither } from "./methods.js";
import { ridges, orbs, contours, sea, dunes, planet } from "./scenes.js";
import type { DitherScene, DitherOptions, Scene } from "./types.js";
import { DITHER_SCENES } from "./types.js";

const SCENES: Record<DitherScene, Scene> = { ridges, orbs, contours, sea, dunes, planet };

/** The scene a seed gets when none is asked for. */
export function sceneForSeed(seed: string): DitherScene {
  return DITHER_SCENES[hashSeed(`${seed}:scene`) % DITHER_SCENES.length];
}

function size(value: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`${name} must be a finite number, got ${value}`);
  return Math.max(1, Math.floor(value));
}

/**
 * The picture as a width x height grid of pixels, row by row: 1 = ink, 0 = paper. `density` scales how much ink
 * there is (1 = the scene as designed); `method` picks the dithering algorithm.
 */
export function ditherPixels(
  width: number,
  height: number,
  seed: string,
  options: DitherOptions = {},
): Uint8Array<ArrayBuffer> {
  const w = size(width, "width");
  const h = size(height, "height");
  const key = String(seed);
  const { scene = sceneForSeed(key), density = 1, method = "bayer" } = options;
  checkMethod(method);
  const draw = typeof scene === "function" ? scene : Object.hasOwn(SCENES, scene) ? SCENES[scene] : undefined;
  if (!draw) {
    throw new TypeError(`unknown scene ${JSON.stringify(scene)}; expected one of ${DITHER_SCENES.join(", ")}, or a Scene function`);
  }
  const aspect = w / h;
  const field = draw(seededRandom(hashSeed(key)), { aspect, pixel: 1 / h });
  const scale = Number.isFinite(density) && density > 0 ? density : 0;
  const ink = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) ink[y * w + x] = field(((x + 0.5) / w) * aspect, (y + 0.5) / h) * scale;
  }
  return dither(ink, w, h, method);
}
