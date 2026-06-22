import { test } from "node:test";
import assert from "node:assert/strict";
import { flagsFromQuery, resolveWad } from "./wad-route.ts";

test("resolveWad maps a slug to its IWAD filename at the root base", () => {
  assert.equal(resolveWad("/wad/freedoom", "/"), "freedoom1.wad");
  assert.equal(resolveWad("/wad/doom2", "/"), "doom2.wad");
});

test("resolveWad strips the deployment base before matching", () => {
  assert.equal(resolveWad("/wasmdoom/wad/tnt", "/wasmdoom/"), "tnt.wad");
  assert.equal(
    resolveWad("/wasmdoom/wad/freedoom2/", "/wasmdoom/"),
    "freedoom2.wad",
  );
});

test("resolveWad falls back to the default for unknown slugs and non-wad paths", () => {
  assert.equal(resolveWad("/wad/nope", "/"), "doom1.wad");
  assert.equal(resolveWad("/", "/"), "doom1.wad");
  assert.equal(resolveWad("/wasmdoom/", "/wasmdoom/"), "doom1.wad");
});

test("flagsFromQuery maps allowlisted params in a fixed order", () => {
  const params = new URLSearchParams("skill=4&warp=1&nomonsters");
  assert.deepEqual(flagsFromQuery(params), [
    "-skill",
    "4",
    "-warp",
    "1",
    "-nomonsters",
  ]);
});

test("flagsFromQuery accepts an episode+map warp pair", () => {
  assert.deepEqual(flagsFromQuery(new URLSearchParams("warp=2,5")), [
    "-warp",
    "2",
    "5",
  ]);
});

test("flagsFromQuery ignores unknown params and out-of-range values", () => {
  const params = new URLSearchParams("skill=99&turbo=5&bogus=1");
  assert.deepEqual(flagsFromQuery(params), []);
});

test("flagsFromQuery emits bare flags for presence-only params", () => {
  assert.deepEqual(flagsFromQuery(new URLSearchParams("fast&respawn")), [
    "-respawn",
    "-fast",
  ]);
});
