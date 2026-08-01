import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GLYPH_GAP,
  GLYPH_HEIGHT,
  GLYPH_WIDTH,
  MARQUEE_TEXT,
  buildGrid,
} from "./marquee.ts";

// Renders a grid back to ASCII art, one string per row, so failures read as
// pictures rather than boolean soup.
function render(grid: boolean[][]): string[] {
  return grid.map((row) => row.map((lit) => (lit ? "#" : ".")).join(""));
}

const advance = GLYPH_WIDTH + GLYPH_GAP;

test("buildGrid: renders a known glyph bitmap", () => {
  assert.deepEqual(render(buildGrid("A")), [
    ".###.",
    "#...#",
    "#...#",
    "#####",
    "#...#",
    "#...#",
    "#...#",
  ]);
});

test("buildGrid: renders the star separator", () => {
  assert.deepEqual(render(buildGrid("*")), [
    "..#..",
    "#.#.#",
    ".###.",
    "#####",
    ".###.",
    "#.#.#",
    "..#..",
  ]);
});

test("buildGrid: renders the two-bar equals glyph", () => {
  assert.deepEqual(render(buildGrid("=")), [
    ".....",
    ".....",
    "#####",
    ".....",
    "#####",
    ".....",
    ".....",
  ]);
});

test("buildGrid: lower case renders the same glyph as upper case", () => {
  assert.deepEqual(buildGrid("a"), buildGrid("A"));
});

test("buildGrid: is always GLYPH_HEIGHT rows", () => {
  for (const text of ["", " ", "A", "WASD MOVE * TAB MAP"]) {
    assert.equal(
      buildGrid(text).length,
      GLYPH_HEIGHT,
      `for ${JSON.stringify(text)}`,
    );
  }
});

test("buildGrid: width is glyphs plus one gap column between them", () => {
  assert.equal(buildGrid("A")[0].length, GLYPH_WIDTH);
  assert.equal(buildGrid("AB")[0].length, 2 * GLYPH_WIDTH + GLYPH_GAP);
  assert.equal(buildGrid("ABCDE")[0].length, 5 * GLYPH_WIDTH + 4 * GLYPH_GAP);
});

test("buildGrid: rows are all the same width", () => {
  const grid = buildGrid("Q MENU");
  const width = grid[0].length;
  for (const row of grid) {
    assert.equal(row.length, width);
  }
});

test("buildGrid: the gap column between glyphs is unlit", () => {
  // "II" — both glyphs are lit in their last and first columns, so a lit gap
  // column would fuse them.
  const grid = buildGrid("II");
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    assert.equal(grid[row][GLYPH_WIDTH], false, `row ${row}`);
  }
});

test("buildGrid: places the second glyph after the gap", () => {
  const pair = buildGrid("AB");
  const b = buildGrid("B");
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    assert.deepEqual(
      pair[row].slice(advance, advance + GLYPH_WIDTH),
      b[row],
      `row ${row}`,
    );
  }
});

test("buildGrid: space is blank but still occupies a glyph cell", () => {
  const grid = buildGrid(" ");
  assert.equal(grid[0].length, GLYPH_WIDTH);
  assert.ok(grid.every((row) => row.every((lit) => !lit)));
});

test("buildGrid: unknown characters degrade to blank", () => {
  const grid = buildGrid("~");
  assert.equal(grid[0].length, GLYPH_WIDTH);
  assert.ok(grid.every((row) => row.every((lit) => !lit)));
  // Blank, but still laid out — it does not collapse the string.
  assert.equal(buildGrid("A~A")[0].length, 3 * GLYPH_WIDTH + 2 * GLYPH_GAP);
});

test("buildGrid: empty string yields empty rows, not a ragged grid", () => {
  const grid = buildGrid("");
  assert.equal(grid.length, GLYPH_HEIGHT);
  assert.ok(grid.every((row) => row.length === 0));
});

test("buildGrid: every character of the marquee text is in the font", () => {
  // A missing glyph degrades silently to a blank, so assert the real string
  // renders something in each cell it should.
  for (const ch of new Set(MARQUEE_TEXT.replace(/ /g, ""))) {
    const grid = buildGrid(ch);
    assert.ok(
      grid.some((row) => row.some((lit) => lit)),
      `no glyph for ${JSON.stringify(ch)}`,
    );
  }
});
