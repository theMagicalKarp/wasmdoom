// Minimal WAD reader — just enough to enumerate lumps and spot music.

export interface Lump {
  name: string;
  data: Uint8Array;
}

// Read a WAD's lump directory. Format (all little-endian):
//   header: char id[4] ("IWAD"/"PWAD"), int32 numLumps, int32 dirOffset
//   each 16-byte entry: int32 filepos, int32 size, char name[8] (null-padded)
export function parseWad(buf: Uint8Array): Lump[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const id = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (id !== "IWAD" && id !== "PWAD") {
    throw new Error(`not a WAD file (magic "${id}")`);
  }
  const numLumps = view.getInt32(4, true);
  const dirOffset = view.getInt32(8, true);
  const lumps: Lump[] = [];
  for (let i = 0; i < numLumps; i++) {
    const entryOffset = dirOffset + i * 16;
    const dataOffset = view.getInt32(entryOffset, true);
    const dataSize = view.getInt32(entryOffset + 4, true);
    let name = "";
    for (let j = 0; j < 8; j++) {
      const ch = buf[entryOffset + 8 + j];
      if (ch === 0) {
        break;
      }
      name += String.fromCharCode(ch);
    }
    lumps.push({ name, data: buf.subarray(dataOffset, dataOffset + dataSize) });
  }
  return lumps;
}

// MUS lumps begin with the magic "MUS\x1a" (see src/music/mus.c).
export function isMus(d: Uint8Array): boolean {
  return (
    d.length >= 4 &&
    d[0] === 0x4d &&
    d[1] === 0x55 &&
    d[2] === 0x53 &&
    d[3] === 0x1a
  );
}
