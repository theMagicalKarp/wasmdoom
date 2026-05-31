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

// "MThd" — standard MIDI header.
function isMidi(d: Uint8Array): boolean {
  return (
    d.length >= 4 &&
    d[0] === 0x4d &&
    d[1] === 0x54 &&
    d[2] === 0x68 &&
    d[3] === 0x64
  );
}

// "\x89PNG" — replacement graphics in modern PWADs.
function isPng(d: Uint8Array): boolean {
  return (
    d.length >= 4 &&
    d[0] === 0x89 &&
    d[1] === 0x50 &&
    d[2] === 0x4e &&
    d[3] === 0x47
  );
}

// DMX sound effect: u16 LE format tag = 0x03, then sample rate, sample count.
function isDmxSound(d: Uint8Array): boolean {
  return d.length >= 8 && d[0] === 0x03 && d[1] === 0x00;
}

const MAP_DATA_NAMES = new Set([
  "THINGS",
  "LINEDEFS",
  "SIDEDEFS",
  "VERTEXES",
  "SEGS",
  "SSECTORS",
  "NODES",
  "SECTORS",
  "REJECT",
  "BLOCKMAP",
  "BEHAVIOR",
  "SCRIPTS",
]);

// Doom (ExMy) and Doom 2 (MAPxx) map markers.
function isMapMarker(name: string): boolean {
  return /^E\dM\d$/.test(name) || /^MAP\d\d$/.test(name);
}

// Section start/end pairs delineate ranges of flats, patches, and sprites.
// Lumps inside the range take on the section's type unless a more specific
// classification already applies.
const SECTION_STARTS: Record<string, "flat" | "patch" | "sprite"> = {
  F_START: "flat",
  FF_START: "flat",
  F1_START: "flat",
  F2_START: "flat",
  F3_START: "flat",
  P_START: "patch",
  PP_START: "patch",
  P1_START: "patch",
  P2_START: "patch",
  P3_START: "patch",
  S_START: "sprite",
  SS_START: "sprite",
};

const SECTION_ENDS = new Set([
  "F_END",
  "FF_END",
  "F1_END",
  "F2_END",
  "F3_END",
  "P_END",
  "PP_END",
  "P1_END",
  "P2_END",
  "P3_END",
  "S_END",
  "SS_END",
]);

function classifyOne(lump: Lump): string {
  const { name, data } = lump;

  // Name-based markers take precedence — these are typically zero-size, so we
  // need to handle them before the empty-data fallback.
  if (name in SECTION_STARTS || SECTION_ENDS.has(name)) {
    return "marker";
  }
  if (isMapMarker(name)) {
    return "map";
  }

  if (data.length === 0) return "marker";

  if (isMus(data)) {
    return "music-mus";
  }
  if (isMidi(data)) {
    return "music-midi";
  }
  if (isPng(data)) {
    return "image-png";
  }
  if (isDmxSound(data)) {
    return "sound";
  }

  switch (name) {
    case "PLAYPAL":
      return "palette";
    case "COLORMAP":
      return "colormap";
    case "GENMIDI":
      return "genmidi";
    case "DMXGUS":
    case "DMXGUSC":
      return "dmxgus";
    case "ENDOOM":
      return "endoom";
    case "PNAMES":
      return "pnames";
    case "TEXTURE1":
    case "TEXTURE2":
      return "texture";
    case "DEHACKED":
      return "dehacked";
    case "DEMO1":
    case "DEMO2":
    case "DEMO3":
    case "DEMO4":
      return "demo";
  }

  if (MAP_DATA_NAMES.has(name)) return "map-data";

  return "unknown";
}

// Classify every lump. Section ranges (F_START..F_END etc.) override "unknown"
// entries inside them so anonymous graphic lumps get tagged flat/patch/sprite.
export function classifyLumps(lumps: Lump[]): string[] {
  const types = lumps.map(classifyOne);

  const stack: Array<{ kind: "flat" | "patch" | "sprite" }> = [];
  for (let i = 0; i < lumps.length; i++) {
    const name = lumps[i].name;
    if (name in SECTION_STARTS) {
      stack.push({ kind: SECTION_STARTS[name] });
    } else if (SECTION_ENDS.has(name)) {
      stack.pop();
    } else if (stack.length > 0 && types[i] === "unknown") {
      types[i] = stack[stack.length - 1].kind;
    }
  }

  return types;
}
