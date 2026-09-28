// Renders the README images into docs/ and the social preview into site/. Run with `npm run gallery`.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { DITHER_METHODS, DITHER_SCENES, ditherPixels } from "../dist/index.js";

const OUT = new URL("../docs/", import.meta.url);

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (bytes) => {
  let c = -1;
  for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
};

/** A 1-bit greyscale PNG: ink is black, paper white. */
function png(pixels, width, height) {
  const stride = Math.ceil(width / 8);
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!pixels[y * width + x]) raw[y * (stride + 1) + 1 + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 1; // bit depth
  header[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Lays several pictures out in a row with a white gap, into one pixel grid. */
function strip(pictures, width, height, gap = 8) {
  const total = pictures.length * width + (pictures.length - 1) * gap;
  const out = new Uint8Array(total * height);
  pictures.forEach((pixels, i) => {
    for (let y = 0; y < height; y++) out.set(pixels.subarray(y * width, (y + 1) * width), y * total + i * (width + gap));
  });
  return [out, total, height];
}

mkdirSync(OUT, { recursive: true });
const save = (name, [pixels, w, h]) => writeFileSync(new URL(name, OUT), png(pixels, w, h));
const seeds = (process.argv[2] ?? "moss,ember,tide").split(",");

for (const scene of DITHER_SCENES) {
  save(`scene-${scene}.png`, strip(seeds.map((seed) => ditherPixels(280, 160, seed, { scene })), 280, 160));
}
save(
  "methods.png",
  strip(DITHER_METHODS.map((method) => ditherPixels(210, 140, "moss", { scene: "orbs", method })), 210, 140),
);
save("hero.png", [ditherPixels(880, 280, "dither-art", { scene: "ridges", method: "floyd-steinberg" }), 880, 280]);

// The link preview for the site: 1200x630, drawn at half size and doubled so the pixels stay crisp.
const og = ditherPixels(600, 315, "dither-art", { scene: "ridges" });
const big = new Uint8Array(1200 * 630);
for (let y = 0; y < 630; y++) for (let x = 0; x < 1200; x++) big[y * 1200 + x] = og[(y >> 1) * 600 + (x >> 1)];
writeFileSync(new URL("../site/og.png", import.meta.url), png(big, 1200, 630));
console.log(`wrote ${DITHER_SCENES.length + 2} images to docs/ and site/og.png`);
