export type DitherScene = "ridges" | "orbs" | "contours" | "sea" | "dunes" | "planet";
export const DITHER_SCENES: readonly DitherScene[] = ["ridges", "orbs", "contours", "sea", "dunes", "planet"];

export type DitherMethod = "bayer" | "blue-noise" | "floyd-steinberg" | "atkinson";
export const DITHER_METHODS: readonly DitherMethod[] = ["bayer", "blue-noise", "floyd-steinberg", "atkinson"];

/** How much ink a point gets, 0 (paper) to 1 (solid ink). x runs 0..aspect (width / height), y runs 0..1 from the top. */
export type Field = (x: number, y: number) => number;

/** What a scene knows about the picture it is drawing. */
export interface SceneContext {
  /** Width / height. The field's x runs from 0 to this. */
  aspect: number;
  /** The size of one output pixel in field units (1 / height). Use it to keep lines and dots at least a pixel wide. */
  pixel: number;
}

/** A scene: given seeded randomness and the picture's shape, the grey level at every point. */
export type Scene = (rand: () => number, context: SceneContext) => Field;

export interface DitherOptions {
  /** A built-in scene name, or your own `Scene` function. Default: picked from the seed. */
  scene?: DitherScene | Scene;
  /** Ink amount multiplier. Default 1; zero, negative or `NaN` gives no ink. */
  density?: number;
  /** How grey becomes 1-bit. Default "bayer". */
  method?: DitherMethod;
}
