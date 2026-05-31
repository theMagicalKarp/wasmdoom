import { test } from "node:test";
import assert from "node:assert/strict";

import { parseWad, classifyLumps, isMus, type Lump } from "./wad.ts";

// Assemble a WAD: 12-byte header, lump data packed back-to-back, then the
// 16-byte directory entries. Names longer than 8 chars are truncated, shorter
// ones null-padded — matching the on-disk format parseWad reads.
function buildWad(
  id: string,
  lumps: Array<{ name: string; data: Uint8Array }>,
): Uint8Array {
  const dirSize = lumps.length * 16;
  const dataSize = lumps.reduce((n, l) => n + l.data.length, 0);
  const buf = new Uint8Array(12 + dataSize + dirSize);
  const view = new DataView(buf.buffer);

  for (let i = 0; i < 4; i++) buf[i] = id.charCodeAt(i);
  view.setInt32(4, lumps.length, true);
  const dirOffset = 12 + dataSize;
  view.setInt32(8, dirOffset, true);

  let dataPos = 12;
  lumps.forEach((lump, i) => {
    const entry = dirOffset + i * 16;
    view.setInt32(entry, dataPos, true);
    view.setInt32(entry + 4, lump.data.length, true);
    for (let j = 0; j < 8 && j < lump.name.length; j++) {
      buf[entry + 8 + j] = lump.name.charCodeAt(j);
    }
    buf.set(lump.data, dataPos);
    dataPos += lump.data.length;
  });

  return buf;
}

// Build just the type list a WAD of named (mostly empty) lumps classifies to.
function classifyNames(lumps: Array<{ name: string; data?: Uint8Array }>) {
  const full: Lump[] = lumps.map((l) => ({
    name: l.name,
    data: l.data ?? new Uint8Array(0),
  }));
  return classifyLumps(full);
}

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

test("parseWad accepts IWAD and PWAD magics", () => {
  assert.deepEqual(parseWad(buildWad("IWAD", [])), []);
  assert.deepEqual(parseWad(buildWad("PWAD", [])), []);
});

test("parseWad rejects an unknown magic", () => {
  assert.throws(() => parseWad(buildWad("XWAD", [])), /not a WAD file/);
});

test("parseWad enumerates lumps in directory order", () => {
  const lumps = parseWad(
    buildWad("IWAD", [
      { name: "ONE", data: ascii("aa") },
      { name: "TWO", data: ascii("bbbb") },
    ]),
  );
  assert.equal(lumps.length, 2);
  assert.deepEqual(
    lumps.map((l) => l.name),
    ["ONE", "TWO"],
  );
});

test("parseWad reads a full 8-character name with no terminator", () => {
  const [lump] = parseWad(
    buildWad("IWAD", [{ name: "ABCDEFGH", data: ascii("x") }]),
  );
  assert.equal(lump.name, "ABCDEFGH");
});

test("parseWad stops a name at the first null byte", () => {
  const [lump] = parseWad(
    buildWad("IWAD", [{ name: "F_END", data: ascii("") }]),
  );
  assert.equal(lump.name, "F_END");
});

test("parseWad returns lump data as a view over the original buffer", () => {
  const buf = buildWad("IWAD", [{ name: "DATA", data: ascii("hello") }]);
  const [lump] = parseWad(buf);
  assert.deepEqual([...lump.data], [...ascii("hello")]);
  assert.equal(lump.data.buffer, buf.buffer, "subarray, not a copy");
});

test("parseWad handles a zero-size lump", () => {
  const [lump] = parseWad(
    buildWad("IWAD", [{ name: "EMPTY", data: ascii("") }]),
  );
  assert.equal(lump.data.length, 0);
});

test("isMus recognizes the MUS\\x1a magic", () => {
  assert.equal(isMus(new Uint8Array([0x4d, 0x55, 0x53, 0x1a])), true);
});

test("isMus rejects too-short or mismatched data", () => {
  assert.equal(isMus(new Uint8Array([0x4d, 0x55, 0x53])), false);
  assert.equal(isMus(ascii("MThd")), false);
  assert.equal(isMus(new Uint8Array(0)), false);
});

test("classifyLumps tags music by magic bytes", () => {
  const types = classifyLumps([
    { name: "D_E1M1", data: new Uint8Array([0x4d, 0x55, 0x53, 0x1a]) },
    { name: "D_E1M2", data: ascii("MThd\0\0") },
  ]);
  assert.deepEqual(types, ["music-mus", "music-midi"]);
});

test("classifyLumps tags PNG and DMX sounds by magic bytes", () => {
  const types = classifyLumps([
    { name: "TITLEPIC", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
    {
      name: "DSPISTOL",
      data: new Uint8Array([0x03, 0x00, 0x11, 0x2b, 0, 0, 0, 0]),
    },
  ]);
  assert.deepEqual(types, ["image-png", "sound"]);
});

test("classifyLumps tags well-known engine lumps by name", () => {
  assert.deepEqual(
    classifyNames([
      { name: "PLAYPAL", data: ascii("x") },
      { name: "COLORMAP", data: ascii("x") },
      { name: "GENMIDI", data: ascii("x") },
      { name: "DMXGUS", data: ascii("x") },
      { name: "ENDOOM", data: ascii("x") },
      { name: "PNAMES", data: ascii("x") },
      { name: "TEXTURE1", data: ascii("x") },
      { name: "DEHACKED", data: ascii("x") },
      { name: "DEMO1", data: ascii("x") },
    ]),
    [
      "palette",
      "colormap",
      "genmidi",
      "dmxgus",
      "endoom",
      "pnames",
      "texture",
      "dehacked",
      "demo",
    ],
  );
});

test("classifyLumps tags map markers and their data lumps", () => {
  assert.deepEqual(
    classifyNames([
      { name: "E1M1" },
      { name: "THINGS", data: ascii("x") },
      { name: "LINEDEFS", data: ascii("x") },
    ]),
    ["map", "map-data", "map-data"],
  );
  assert.equal(classifyNames([{ name: "MAP07" }])[0], "map");
});

test("classifyLumps treats empty non-marker lumps as markers", () => {
  assert.equal(classifyNames([{ name: "WHATEVER" }])[0], "marker");
});

test("classifyLumps labels unrecognized lumps unknown", () => {
  assert.equal(
    classifyNames([{ name: "RANDOM", data: ascii("junk!") }])[0],
    "unknown",
  );
});

test("classifyLumps overrides unknown lumps inside a section range", () => {
  const types = classifyNames([
    { name: "F_START" },
    { name: "FLOOR0_1", data: ascii("flatdata") },
    { name: "F_END" },
    { name: "P_START" },
    { name: "WALL00_1", data: ascii("patchdata") },
    { name: "P_END" },
    { name: "S_START" },
    { name: "TROOA1", data: ascii("spritedat") },
    { name: "S_END" },
  ]);
  assert.deepEqual(types, [
    "marker",
    "flat",
    "marker",
    "marker",
    "patch",
    "marker",
    "marker",
    "sprite",
    "marker",
  ]);
});

test("classifyLumps does not override a recognized lump inside a section", () => {
  // A real graphic (DMX/PNG/etc.) keeps its specific type, not the section's.
  const types = classifyLumps([
    { name: "S_START", data: new Uint8Array(0) },
    { name: "SOUNDISH", data: new Uint8Array([0x03, 0x00, 0, 0, 0, 0, 0, 0]) },
    { name: "S_END", data: new Uint8Array(0) },
  ]);
  assert.deepEqual(types, ["marker", "sound", "marker"]);
});

test("classifyLumps leaves unknown lumps outside any section untouched", () => {
  const types = classifyNames([
    { name: "F_START" },
    { name: "FLAT1", data: ascii("flatdata") },
    { name: "F_END" },
    { name: "LOOSE", data: ascii("loosedat") },
  ]);
  assert.deepEqual(types, ["marker", "flat", "marker", "unknown"]);
});
