// Hashes every scene x method at two sizes. Compares against src/pictures.snapshot.json, or rewrites it with --update.
// Runs under Node, Bun and Deno, to check that every engine draws exactly the same pictures.
import { readFileSync, writeFileSync } from "node:fs";
import { DITHER_METHODS, DITHER_SCENES, ditherPixels, hashSeed } from "../dist/index.js";

const FILE = new URL("../src/pictures.snapshot.json", import.meta.url);
const SIZES = [
  [120, 60],
  [97, 131],
];

function pictureHashes() {
  const hashes = {};
  for (const scene of DITHER_SCENES) {
    for (const method of DITHER_METHODS) {
      for (const [w, h] of SIZES) {
        hashes[`${scene} ${method} ${w}x${h}`] = hashSeed(ditherPixels(w, h, "snapshot", { scene, method }).join(""));
      }
    }
  }
  return hashes;
}

const actual = pictureHashes();
if (process.argv.includes("--update")) {
  writeFileSync(FILE, `${JSON.stringify(actual, null, 2)}\n`);
  console.log(`updated ${Object.keys(actual).length} picture hashes`);
} else {
  const expected = JSON.parse(readFileSync(FILE, "utf8"));
  const wrong = Object.keys(expected).filter((key) => expected[key] !== actual[key]);
  if (wrong.length || Object.keys(actual).length !== Object.keys(expected).length) {
    console.error(`pictures differ from the snapshot: ${wrong.join(", ") || "different set of cases"}`);
    process.exit(1);
  }
  console.log(`all ${Object.keys(expected).length} pictures match the snapshot`);
}
