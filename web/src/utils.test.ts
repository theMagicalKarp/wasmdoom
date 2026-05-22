import { test } from "node:test";
import assert from "node:assert/strict";
import { pathJoin } from "./utils.ts";

test("joins segments with a single slash", () => {
  assert.equal(pathJoin("a", "b", "c"), "a/b/c");
});

test("collapses a trailing slash on the base against the next segment", () => {
  assert.equal(
    pathJoin("/wasmdoom/", "wads/doom1.wad"),
    "/wasmdoom/wads/doom1.wad",
  );
});

test("collapses leading slashes on inner segments", () => {
  assert.equal(
    pathJoin("/wasmdoom/", "/wads/", "/doom1.wad"),
    "/wasmdoom/wads/doom1.wad",
  );
});

test("collapses a root base against an absolute segment", () => {
  assert.equal(pathJoin("/", "wasmdoom.wasm"), "/wasmdoom.wasm");
  assert.equal(pathJoin("/", "/wasmdoom.wasm"), "/wasmdoom.wasm");
});

test("collapses runs of more than two slashes", () => {
  assert.equal(pathJoin("a///", "///b"), "a/b");
});

test("ignores empty segments", () => {
  assert.equal(pathJoin("a", "", "b"), "a/b");
  assert.equal(pathJoin("", "a", ""), "a");
});

test("preserves a leading slash", () => {
  assert.equal(pathJoin("/a", "b"), "/a/b");
});

test("preserves a single trailing slash", () => {
  assert.equal(pathJoin("a/", "b/"), "a/b/");
});

test("returns an empty string with no segments", () => {
  assert.equal(pathJoin(), "");
});
