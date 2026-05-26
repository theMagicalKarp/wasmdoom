import { test } from "node:test";
import assert from "node:assert/strict";
import { isMobileDevice, pathJoin } from "./utils.ts";

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

test("isMobileDevice: returns false when navigator is undefined", () => {
  assert.equal(isMobileDevice(undefined), false);
});

test("isMobileDevice: detects iPhone user agent", () => {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
  assert.equal(isMobileDevice({ userAgent: ua, maxTouchPoints: 5 }), true);
});

test("isMobileDevice: detects Android user agent", () => {
  const ua =
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0";
  assert.equal(isMobileDevice({ userAgent: ua, maxTouchPoints: 5 }), true);
});

test("isMobileDevice: detects iPad user agent", () => {
  const ua =
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
  assert.equal(isMobileDevice({ userAgent: ua }), true);
});

test("isMobileDevice: returns false for desktop Chrome on macOS", () => {
  const ua =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0";
  assert.equal(isMobileDevice({ userAgent: ua, maxTouchPoints: 0 }), false);
});

test("isMobileDevice: returns false for desktop Firefox on Windows", () => {
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0";
  assert.equal(isMobileDevice({ userAgent: ua, maxTouchPoints: 0 }), false);
});

test("isMobileDevice: returns true when maxTouchPoints > 1 even without mobile UA", () => {
  const ua =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
  assert.equal(isMobileDevice({ userAgent: ua, maxTouchPoints: 5 }), true);
});

test("isMobileDevice: returns false when maxTouchPoints is exactly 1", () => {
  assert.equal(isMobileDevice({ userAgent: "", maxTouchPoints: 1 }), false);
});

test("isMobileDevice: handles missing userAgent", () => {
  assert.equal(isMobileDevice({ maxTouchPoints: 0 }), false);
  assert.equal(isMobileDevice({ maxTouchPoints: 5 }), true);
});

test("isMobileDevice: handles missing maxTouchPoints", () => {
  const desktop = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
  assert.equal(isMobileDevice({ userAgent: desktop }), false);
});

test("isMobileDevice: detection is case-insensitive", () => {
  assert.equal(isMobileDevice({ userAgent: "android" }), true);
  assert.equal(isMobileDevice({ userAgent: "ANDROID" }), true);
});
