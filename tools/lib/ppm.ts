// Binary PPM (P6) writer. Doom's framebuffer is 8-bit palettized; we expand
// each index through the 768-byte RGB palette into a raw RGB stream.

export const DOOM_WIDTH = 320;
export const DOOM_HEIGHT = 200;

export function encodePpm(
  indices: Uint8Array,
  palette: Uint8Array,
): Uint8Array {
  if (indices.length !== DOOM_WIDTH * DOOM_HEIGHT) {
    throw new Error(
      `framebuffer must be ${DOOM_WIDTH * DOOM_HEIGHT} bytes, got ${indices.length}`,
    );
  }
  if (palette.length !== 768) {
    throw new Error(`palette must be 768 bytes, got ${palette.length}`);
  }

  const header = `P6\n${DOOM_WIDTH} ${DOOM_HEIGHT}\n255\n`;
  const headerBytes = new TextEncoder().encode(header);
  const pixelBytes = indices.length * 3;
  const output = new Uint8Array(headerBytes.length + pixelBytes);
  output.set(headerBytes, 0);

  let outOffset = headerBytes.length;
  for (let i = 0; i < indices.length; i++) {
    const paletteOffset = indices[i] * 3;
    output[outOffset++] = palette[paletteOffset];
    output[outOffset++] = palette[paletteOffset + 1];
    output[outOffset++] = palette[paletteOffset + 2];
  }
  return output;
}
