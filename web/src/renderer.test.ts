import { test } from "node:test";
import assert from "node:assert/strict";
import { indicesToRGBA } from "./renderer.ts";

test("indicesToRGBA expands one indexed pixel to RGBA with opaque alpha", () => {
  const palette = new Uint8Array([0x11, 0x22, 0x33]);
  const indices = new Uint8Array([0]);
  const out = new Uint8ClampedArray(4);
  indicesToRGBA(indices, palette, out);
  assert.deepEqual(Array.from(out), [0x11, 0x22, 0x33, 255]);
});

test("indicesToRGBA looks up the palette per pixel", () => {
  const palette = new Uint8Array([0, 0, 0, 10, 20, 30, 40, 50, 60]);
  const indices = new Uint8Array([2, 1, 0]);
  const out = new Uint8ClampedArray(12);
  indicesToRGBA(indices, palette, out);
  assert.deepEqual(
    Array.from(out),
    [40, 50, 60, 255, 10, 20, 30, 255, 0, 0, 0, 255],
  );
});

test("indicesToRGBA writes 255 alpha for every pixel", () => {
  const palette = new Uint8Array([7, 7, 7]);
  const indices = new Uint8Array([0, 0, 0, 0]);
  const out = new Uint8ClampedArray(16);
  indicesToRGBA(indices, palette, out);
  for (let i = 3; i < out.length; i += 4) {
    assert.equal(out[i], 255);
  }
});
