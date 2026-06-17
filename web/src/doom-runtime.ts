// Loads and instantiates the Doom wasm module.
//
// The wasm is freestanding: it has zero imports and is instantiated with no
// import object (mirroring tools/lib/wasmdoom-headless.ts). There is no WASI
// layer and no `_initialize`; the caller stages the WAD bytes and any
// command-line flags directly into linear memory and calls `init()`, which
// runs the engine setup. All engine output — including logs — flows through
// the static event buffer the caller drains after each tick.

import {
  assertWasmdoomExports,
  type WasmdoomExports,
} from "@wasmdoom/lib/wasmdoom-exports.ts";
import { stageArgv } from "@wasmdoom/lib/wasmdoom-host.ts";

// Re-exported so the rest of the web frontend keeps importing the engine ABI
// type and game-mode helper from the runtime module it already depends on.
export type { WasmdoomExports } from "@wasmdoom/lib/wasmdoom-exports.ts";
export { gameModeForWad, type GameMode } from "@wasmdoom/lib/wasmdoom-host.ts";

// A handle to an instantiated-but-not-yet-started engine. Load the WAD, then
// call init() with any command-line flags to run engine setup.
export type Doom = {
  exports: WasmdoomExports;
  // Copy the IWAD bytes into linear memory and declare its game mode.
  loadWad(bytes: Uint8Array): void;
  // Run engine setup with the given Doom flags (e.g. ["-warp", "1", "1"]) and
  // the WAD's game mode. Call once, after registering event handlers so the
  // setup events (GENMIDI, etc.) can be drained.
  init(flags?: string[]): void;
};

export async function loadDoom(opts: { wasmUrl: string }): Promise<Doom> {
  const { instance } = await WebAssembly.instantiateStreaming(
    fetch(opts.wasmUrl),
  );
  const { exports } = instance;
  assertWasmdoomExports(exports);

  return {
    exports,
    loadWad(bytes) {
      const ptr = exports.wasmdoom_wad_alloc(bytes.length);
      if (ptr === 0) {
        throw new Error(`wasmdoom_wad_alloc(${bytes.length}) failed`);
      }
      new Uint8Array(exports.memory.buffer, ptr, bytes.length).set(bytes);
    },
    init(flags = []) {
      stageArgv(exports.memory, exports.wasmdoom_argv_ptr(), flags);
      exports.wasmdoom_init();
    },
  };
}
