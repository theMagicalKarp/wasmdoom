// Renders Doom's 320x200 indexed framebuffer to a 2D canvas.
//
// Doom stores the screen as one palette index per pixel and a separate
// 256-entry RGB palette. This module owns reading both out of wasm memory,
// converting to RGBA, and blitting via putImageData. Callers just hand us
// the wasm exports each frame.

import type { WasmdoomExports } from "./doom-runtime.ts";

const SCREEN_WIDTH = 320;
const SCREEN_HEIGHT = 200;
const PIXELS = SCREEN_WIDTH * SCREEN_HEIGHT;
const PALETTE_BYTES = 256 * 3;

export type DoomRenderer = {
  drawFrame(doom: WasmdoomExports): void;
};

// Expand indexed pixels (one byte per pixel) into RGBA bytes (four per
// pixel) using a 256*3 palette. Exported for testing.
export function indicesToRGBA(
  indices: Uint8Array,
  palette: Uint8Array,
  out: Uint8ClampedArray,
): void {
  for (let i = 0; i < indices.length; i++) {
    const p = indices[i] * 3;
    const o = i * 4;
    out[o + 0] = palette[p + 0];
    out[o + 1] = palette[p + 1];
    out[o + 2] = palette[p + 2];
    out[o + 3] = 255;
  }
}

export function createDoomRenderer(canvas: HTMLCanvasElement): DoomRenderer {
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("failed to get 2d rendering context");
  }
  const imageData = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);

  return {
    drawFrame(doom) {
      // Views into wasm memory; recomputed each frame because wasm growth
      // invalidates the backing ArrayBuffer.
      const framebuffer = new Uint8Array(
        doom.memory.buffer,
        doom.wasmdoom_get_framebuffer(),
        PIXELS,
      );
      const palette = new Uint8Array(
        doom.memory.buffer,
        doom.wasmdoom_get_palette(),
        PALETTE_BYTES,
      );
      indicesToRGBA(framebuffer, palette, imageData.data);
      ctx.putImageData(imageData, 0, 0);
    },
  };
}
