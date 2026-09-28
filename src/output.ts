/** A colour for `toRGBA`: "#rgb", "#rgba", "#rrggbb", "#rrggbbaa", or [r, g, b, a?] with channels 0..255. */
export type Colour = string | readonly [number, number, number, number?];

export interface SvgOptions {
  /** Fill for ink pixels: any CSS colour. Default "currentColor", so the picture takes the surrounding text colour. */
  ink?: string;
  /** Fill for paper pixels. Default: none (transparent). */
  paper?: string;
  /** Displayed pixels per picture pixel, for the width and height attributes. Default 1. */
  scale?: number;
  /** Accessible name. Without one, the picture is marked decorative (aria-hidden). */
  title?: string;
}

export interface RgbaOptions {
  /** Default "#000" (opaque black). */
  ink?: Colour;
  /** Default transparent. */
  paper?: Colour;
}

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function checkGrid(pixels: ArrayLike<number>, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`width and height must be positive integers, got ${width} x ${height}`);
  }
  if (pixels.length !== width * height) {
    throw new RangeError(`expected ${width} x ${height} = ${width * height} pixels, got ${pixels.length}`);
  }
}

/**
 * The pixels as an SVG string: one path tracing each run of ink in a row as a one-pixel-thick stroke, in relative
 * steps to keep it short. Scales crisply to any size, works on the server, and can go straight into HTML or a data URL.
 */
export function toSVG(pixels: ArrayLike<number>, width: number, height: number, options: SvgOptions = {}): string {
  checkGrid(pixels, width, height);
  const { ink = "currentColor", paper, scale = 1, title } = options;
  if (!(scale > 0) || !Number.isFinite(scale)) throw new RangeError(`scale must be a positive number, got ${scale}`);
  let d = "";
  // The pen starts at (0, 0.5), the middle of the first row, and moves by relative steps from the end of each run.
  let penX = 0;
  let penY = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; ) {
      if (!pixels[row + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < width && pixels[row + x]) x++;
      d += d ? `m${start - penX} ${y - penY}h${x - start}` : `M${start} ${y + 0.5}h${x - start}`;
      penX = x;
      penY = y;
    }
  }
  const label = title ? ` role="img" aria-label="${escape(title)}"><title>${escape(title)}</title` : ` aria-hidden="true"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * scale}" ` +
    `height="${height * scale}" shape-rendering="crispEdges"${label}>` +
    (paper ? `<rect width="${width}" height="${height}" fill="${escape(paper)}"/>` : "") +
    (d ? `<path stroke="${escape(ink)}" d="${d}"/>` : "") +
    `</svg>`
  );
}

function parseColour(colour: Colour): [number, number, number, number] {
  if (typeof colour !== "string") {
    const [r, g, b, a = 255] = colour;
    return [r, g, b, a];
  }
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(colour)?.[1];
  if (!hex) throw new TypeError(`colours must be "#rgb", "#rgba", "#rrggbb", "#rrggbbaa" or [r, g, b, a?], got ${colour}`);
  const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
  const channel = (i: number) => (i * 2 < full.length ? parseInt(full.slice(i * 2, i * 2 + 2), 16) : 255);
  return [channel(0), channel(1), channel(2), channel(3)];
}

/**
 * The pixels as RGBA bytes, 4 per pixel. In a browser, `new ImageData(toRGBA(pixels), width, height)` gives something
 * you can `putImageData` onto a canvas.
 */
export function toRGBA(pixels: ArrayLike<number>, options: RgbaOptions = {}): Uint8ClampedArray<ArrayBuffer> {
  const ink = parseColour(options.ink ?? "#000");
  const paper = parseColour(options.paper ?? [0, 0, 0, 0]);
  const out = new Uint8ClampedArray(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) out.set(pixels[i] ? ink : paper, i * 4);
  return out;
}
