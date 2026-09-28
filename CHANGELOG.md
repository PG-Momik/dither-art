# Changelog

## 1.0.0

First public release.

- Six scenes: `ridges`, `orbs`, `contours`, `sea`, `dunes` and `planet`.
- Four dithering methods: `bayer`, `blue-noise`, `floyd-steinberg` and `atkinson`.
- `toSVG` and `toRGBA` turn pixels into an SVG string or RGBA bytes for a canvas.
- `dither` dithers any grid of grey levels, such as your own images.
- Custom scenes: pass a `Scene` function as `options.scene`.
- Lines, outlines and stars stay at least a pixel wide, so small pictures remain readable.
- Clear errors for unknown scenes and methods and for non-finite sizes. Numeric seeds are read as strings.
- Pictures are pinned by snapshot tests and checked to be identical on Node, Bun and Deno.
