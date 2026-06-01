import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldTick } from "./game-loop.ts";

const FRAME_MS = 1000 / 30;

test("shouldTick skips when not enough time has elapsed", () => {
  const result = shouldTick(100, 90, FRAME_MS);
  assert.equal(result.tick, false);
  assert.equal(result.nextLastFrame, 90);
});

test("shouldTick ticks at exactly one frame's elapsed time", () => {
  const result = shouldTick(100 + FRAME_MS, 100, FRAME_MS);
  assert.equal(result.tick, true);
  assert.equal(result.nextLastFrame, 100 + FRAME_MS);
});

test("shouldTick snaps to the most recent frame boundary on overshoot", () => {
  // Two frames late: nextLastFrame should be `now - overshoot`, which is
  // now - ((now-lastFrame) % frameMs).
  const lastFrame = 100;
  const now = lastFrame + FRAME_MS * 2 + 5;
  const result = shouldTick(now, lastFrame, FRAME_MS);
  assert.equal(result.tick, true);
  assert.equal(result.nextLastFrame, now - 5);
});

test("shouldTick keeps cadence under a long stall", () => {
  // Simulating 10 frames behind: we should still only "advance" by the
  // boundary, so the next call ticking one frame later still works.
  const lastFrame = 0;
  const now = FRAME_MS * 10 + 1;
  const result = shouldTick(now, lastFrame, FRAME_MS);
  assert.equal(result.tick, true);
  assert.equal(result.nextLastFrame, now - 1);
});
