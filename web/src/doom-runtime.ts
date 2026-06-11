// Loads and instantiates the Doom wasm module.
//
// The wasm is freestanding: it has zero imports and is instantiated with no
// import object (mirroring tools/lib/wasmdoom-headless.ts). There is no WASI
// layer and no `_initialize`; the caller stages the WAD bytes and any
// command-line flags directly into linear memory and calls `init()`, which
// runs the engine setup. All engine output — including logs — flows through
// the static event buffer the caller drains after each tick.

// Mirrors GameMode_t in src/doomdef.h. The host declares the IWAD's mode; the
// engine no longer probes a filesystem to identify it.
export type GameMode =
  | "shareware"
  | "registered"
  | "commercial"
  | "retail"
  | "indetermined";

// Maps a known IWAD filename to its game mode. Replaces the old filesystem
// IdentifyVersion probe: the host now tells the engine which IWAD this is.
export function gameModeForWad(filename: string): GameMode {
  switch (filename.toLowerCase()) {
    case "doom2.wad":
    case "doom2f.wad":
    case "plutonia.wad":
    case "tnt.wad":
    case "freedoom2.wad":
      return "commercial";
    case "doomu.wad":
    case "freedoom1.wad":
      return "retail";
    case "doom.wad":
      return "registered";
    case "doom1.wad":
      return "shareware";
    default:
      return "indetermined";
  }
}

// Mirrors WD_ARGV_BUF_CAP in src/wasmdoom.c (kept in sync by hand, like the
// event tags). The flag tokens written into the argv buffer must fit here.
export const ARGV_BUF_CAP = 4096;

// Writes Doom command-line flags into the engine's argv staging buffer as
// NUL-separated tokens followed by an extra trailing NUL (the empty token
// that terminates the self-terminating list).
export function stageArgv(
  memory: WebAssembly.Memory,
  argvPtr: number,
  flags: readonly string[],
): void {
  const encoder = new TextEncoder();
  const parts = flags.map((token) => encoder.encode(token));
  const total = parts.reduce((n, p) => n + p.length + 1, 0) + 1;
  if (total > ARGV_BUF_CAP) {
    throw new Error(
      `flags need ${total} bytes, exceeds ARGV_BUF_CAP (${ARGV_BUF_CAP})`,
    );
  }
  const buf = new Uint8Array(memory.buffer, argvPtr, ARGV_BUF_CAP);
  let off = 0;
  for (const part of parts) {
    buf.set(part, off);
    off += part.length;
    buf[off++] = 0; // NUL separator
  }
  buf[off] = 0; // empty token terminates the list
}

export type WasmdoomExports = {
  memory: WebAssembly.Memory;
  wasmdoom_init: () => void;
  wasmdoom_argv_ptr: () => number;
  wasmdoom_wad_alloc: (len: number) => number;
  wasmdoom_tick: () => void;
  wasmdoom_keydown: (keycode: number) => void;
  wasmdoom_keyup: (keycode: number) => void;
  wasmdoom_send_mouse: (buttons: number, dx: number, dy: number) => void;
  wasmdoom_get_framebuffer: () => number;
  wasmdoom_get_palette: () => number;
  wasmdoom_events_ptr: () => number;
  wasmdoom_events_len: () => number;
  wasmdoom_save_slot_ptr: (slot: number) => number;
  wasmdoom_save_commit: (slot: number, dataLen: number) => number;
};

export type WasmdoomInstance = WebAssembly.Instance & {
  exports: WasmdoomExports;
};

const REQUIRED_FUNCTIONS = [
  "wasmdoom_init",
  "wasmdoom_argv_ptr",
  "wasmdoom_wad_alloc",
  "wasmdoom_tick",
  "wasmdoom_keydown",
  "wasmdoom_keyup",
  "wasmdoom_send_mouse",
  "wasmdoom_get_framebuffer",
  "wasmdoom_get_palette",
  "wasmdoom_events_ptr",
  "wasmdoom_events_len",
  "wasmdoom_save_slot_ptr",
  "wasmdoom_save_commit",
] as const;

function assertWasmdoomInstance(
  instance: WebAssembly.Instance,
): asserts instance is WasmdoomInstance {
  const { memory } = instance.exports;
  if (!(memory instanceof WebAssembly.Memory)) {
    throw new Error("wasm module is missing a `memory` export");
  }
  for (const name of REQUIRED_FUNCTIONS) {
    if (typeof instance.exports[name] !== "function") {
      throw new Error(`wasm module is missing a \`${name}\` export`);
    }
  }
}

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
  assertWasmdoomInstance(instance);
  const { exports } = instance;

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
