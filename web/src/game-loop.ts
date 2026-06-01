// Drives a fixed-rate game tick via requestAnimationFrame.
//
// rAF fires at the display rate (usually 60+ Hz); Doom wants 30 Hz, so each
// callback decides whether enough wall-clock time has passed to tick. We
// snap lastFrame to the nearest frame boundary so a slow tick doesn't drift
// the cadence forward forever. A single render failure latches the loop off
// — Doom isn't recoverable mid-frame.

// Pure FPS-gate decision. Returns whether this rAF callback should run the
// tick, and the new lastFrame timestamp to remember either way. Exported
// for testing.
export function shouldTick(
  now: number,
  lastFrame: number,
  frameMs: number,
): { tick: boolean; nextLastFrame: number } {
  const elapsed = now - lastFrame;
  if (elapsed < frameMs) {
    return { tick: false, nextLastFrame: lastFrame };
  }
  return { tick: true, nextLastFrame: now - (elapsed % frameMs) };
}

export function runGameLoop(opts: { fps: number; tick: () => void }): void {
  const frameMs = 1000 / opts.fps;
  let lastFrame = performance.now();
  let failed = false;

  function loop(now: number) {
    if (failed) {
      return;
    }
    requestAnimationFrame(loop);
    const decision = shouldTick(now, lastFrame, frameMs);
    lastFrame = decision.nextLastFrame;
    if (!decision.tick) {
      return;
    }
    try {
      opts.tick();
    } catch (err) {
      console.error("[wasmdoom] tick failure:", err);
      failed = true;
    }
  }
  requestAnimationFrame(loop);
}
