import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base64ToBytes,
  bytesToBase64,
  isMobileDevice,
  pathJoin,
  readCString,
} from "./utils.ts";

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

test("bytesToBase64: encodes an empty array", () => {
  assert.equal(bytesToBase64(new Uint8Array()), "");
});

test("bytesToBase64: encodes ASCII bytes", () => {
  const bytes = new Uint8Array([0x66, 0x6f, 0x6f]);
  assert.equal(bytesToBase64(bytes), "Zm9v");
});

test("bytesToBase64: encodes binary bytes including 0xff", () => {
  const bytes = new Uint8Array([0x00, 0x01, 0xfe, 0xff]);
  assert.equal(bytesToBase64(bytes), "AAH+/w==");
});

test("bytesToBase64: encodes payloads larger than the 0x8000 chunk size", () => {
  const bytes = new Uint8Array(0x8000 * 2 + 123);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = i & 0xff;
  }
  const encoded = bytesToBase64(bytes);
  const decoded = base64ToBytes(encoded);
  assert.deepEqual(decoded, bytes);
});

test("base64ToBytes: decodes an empty string", () => {
  assert.deepEqual(base64ToBytes(""), new Uint8Array());
});

test("base64ToBytes: decodes ASCII bytes", () => {
  assert.deepEqual(base64ToBytes("Zm9v"), new Uint8Array([0x66, 0x6f, 0x6f]));
});

test("base64ToBytes: decodes binary bytes including 0xff", () => {
  assert.deepEqual(
    base64ToBytes("AAH+/w=="),
    new Uint8Array([0x00, 0x01, 0xfe, 0xff]),
  );
});

test("base64ToBytes is inverse of bytesToBase64", () => {
  const bytes = new Uint8Array([0, 1, 2, 3, 127, 128, 200, 254, 255]);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

function makeMemory(bytes: ArrayLike<number>, offset = 0): WebAssembly.Memory {
  const memory = new WebAssembly.Memory({ initial: 1 });
  new Uint8Array(memory.buffer).set(bytes, offset);
  return memory;
}

test("readCString: reads an ASCII string terminated by NUL", () => {
  const memory = makeMemory([0x68, 0x69, 0x00, 0x78]);
  assert.equal(readCString(memory, 0), "hi");
});

test("readCString: returns an empty string when the first byte is NUL", () => {
  const memory = makeMemory([0x00, 0x61]);
  assert.equal(readCString(memory, 0), "");
});

test("readCString: honors the pointer offset", () => {
  const memory = makeMemory([0x00, 0x66, 0x6f, 0x6f, 0x00], 0);
  assert.equal(readCString(memory, 1), "foo");
});

test("readCString: decodes multi-byte UTF-8 sequences", () => {
  // "héllo" in UTF-8: 68 c3 a9 6c 6c 6f
  const memory = makeMemory([0x68, 0xc3, 0xa9, 0x6c, 0x6c, 0x6f, 0x00]);
  assert.equal(readCString(memory, 0), "héllo");
});

test("readCString: reads until end of memory if no NUL is present", () => {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const view = new Uint8Array(memory.buffer);
  view.fill(0x41);
  const result = readCString(memory, view.length - 4);
  assert.equal(result, "AAAA");
});
