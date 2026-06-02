// Node-side host that loads the Doom wasm and a WAD into a WASI sandbox.
// Mirrors web/src/doom-runtime.ts but uses node:fs and stubs every audio
// import — we have no audio sink off-browser. The same memory-before-_start
// hazard the web runtime documents applies here: I_InitMusic fires during
// wasi.start() and reaches into host imports, so the host ref must be
// resolved before start() runs.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  WASI,
  WASIProcExit,
  ConsoleStdout,
  OpenFile,
  File,
  PreopenDirectory,
} from "@bjorn3/browser_wasi_shim";

export type WasmdoomExports = {
  memory: WebAssembly.Memory;
  _start: () => unknown;
  wasmdoom_init: () => void;
  wasmdoom_tick: () => void;
  wasmdoom_keydown: (keycode: number) => void;
  wasmdoom_keyup: (keycode: number) => void;
  wasmdoom_send_mouse: (buttons: number, dx: number, dy: number) => void;
  wasmdoom_get_framebuffer: () => number;
  wasmdoom_get_palette: () => number;
};

const REQUIRED_FUNCTIONS = [
  "wasmdoom_init",
  "wasmdoom_tick",
  "wasmdoom_keydown",
  "wasmdoom_keyup",
  "wasmdoom_send_mouse",
  "wasmdoom_get_framebuffer",
  "wasmdoom_get_palette",
] as const;

function assertWasmdoomExports(
  exports: WebAssembly.Exports,
): asserts exports is WasmdoomExports {
  const { memory, _start } = exports;
  if (!(memory instanceof WebAssembly.Memory)) {
    throw new Error("wasm module is missing a `memory` export");
  }
  if (typeof _start !== "function") {
    throw new Error("wasm module is missing a `_start` export");
  }
  for (const name of REQUIRED_FUNCTIONS) {
    if (typeof exports[name] !== "function") {
      throw new Error(`wasm module is missing a \`${name}\` export`);
    }
  }
}

// Thrown when the wasm process calls exit() or aborts mid-tick. We rebrand
// the upstream WASIProcExit so callers can distinguish engine crashes from
// other thrown values without importing the wasi shim.
export class EngineCrashError extends Error {
  readonly exitCode: number;
  constructor(exitCode: number, message?: string) {
    super(message ?? `wasm engine exited with code ${exitCode}`);
    this.name = "EngineCrashError";
    this.exitCode = exitCode;
  }
}

export type ErrorRecord = {
  source: "wasmdoom_error" | "stderr" | "exit";
  message: string;
};

export type HeadlessDoom = {
  exports: WasmdoomExports;
  errors: ErrorRecord[];
  // Controls the virtual clock the wasm sees via gettimeofday/clock_time_get.
  // Advance it between ticks to pace the simulation deterministically — Doom's
  // TryRunTics reads this to decide how many game-tics to run per frame.
  clock: { advanceMs(ms: number): void };
};

function readCString(
  memory: WebAssembly.Memory,
  ptr: number,
  len: number,
): string {
  const bytes = new Uint8Array(memory.buffer, ptr, len);
  return new TextDecoder("utf-8").decode(bytes);
}

export async function loadHeadlessDoom(opts: {
  wadPath: string;
  wasmPath: string;
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
}): Promise<HeadlessDoom> {
  const [wadBytes, wasmBytes] = await Promise.all([
    readFile(opts.wadPath),
    readFile(opts.wasmPath),
  ]);

  const errors: ErrorRecord[] = [];

  const stdin = new OpenFile(new File([]));
  const stdout = ConsoleStdout.lineBuffered((line) => {
    opts.onStdout?.(line);
  });
  const stderr = ConsoleStdout.lineBuffered((line) => {
    opts.onStderr?.(line);
    // Doom's I_Error writes "Error: ..." to stderr right before exit(1).
    if (line.startsWith("Error:")) {
      errors.push({ source: "stderr", message: line });
    }
  });
  // Expose the WAD inside the sandbox under its real basename so the engine's
  // IdentifyVersion picks the right gamemode (doom1.wad → shareware,
  // freedoom2.wad → commercial, etc.).
  const wadName = basename(opts.wadPath).toLowerCase();
  const cwd = new PreopenDirectory(
    "/",
    new Map<string, File>([
      [wadName, new File(new Uint8Array(wadBytes), { readonly: true })],
    ]),
  );
  const env = ["HOME=/", "DOOMWADDIR=/"];
  const wasi = new WASI(["wasmdoom"], env, [stdin, stdout, stderr, cwd]);

  let exports: WasmdoomExports | null = null;
  const getMemory = (): WebAssembly.Memory => {
    if (exports === null) {
      throw new Error("doom host import called before wasm was ready");
    }
    return exports.memory;
  };

  // TODO: We should expose this to the host to implement.
  // Virtual clock. Doom's I_GetTime calls gettimeofday, which the wasi shim
  // services via clock_time_get reading Date.now(). Headless runs far faster
  // than real time, so the real clock barely advances and TryRunTics hits its
  // `counts = 1` floor — the game crawls one tic per call. Override
  // clock_time_get to report a controllable virtual time that the caller steps
  // one frame at a time (advanceMs), so the engine advances at its native
  // cadence deterministically. Both realtime and monotonic ids share the value.
  const CREEP_MS = 0.01;
  let virtualTimeMs = 0;
  wasi.wasiImport.clock_time_get = (
    _id: number,
    _precision: bigint,
    timePtr: number,
  ): number => {
    virtualTimeMs += CREEP_MS;
    const view = new DataView(getMemory().buffer);
    view.setBigUint64(timePtr, BigInt(Math.round(virtualTimeMs * 1e6)), true);
    return 0;
  };
  const clock = {
    advanceMs(ms: number): void {
      virtualTimeMs += ms;
    },
  };

  const doomHost = {
    wasmdoom_error(ptr: number, len: number): void {
      const message = readCString(getMemory(), ptr, len);
      errors.push({ source: "wasmdoom_error", message });
    },
    wasmdoom_draw(): void {},
    // Audio/music stubs — the wasm calls into these but headless has no sink.
    wasmdoom_sound_start(): void {},
    wasmdoom_sound_stop(): void {},
    wasmdoom_sound_update(): void {},
    wasmdoom_sound_is_playing(): number {
      return 0;
    },
    wasmdoom_music_set_genmidi(): void {},
    wasmdoom_music_register(): void {},
    wasmdoom_music_play(): void {},
    wasmdoom_music_pause(): void {},
    wasmdoom_music_resume(): void {},
    wasmdoom_music_stop(): void {},
    wasmdoom_music_unregister(): void {},
    wasmdoom_music_set_volume(): void {},
  };

  const module = new WebAssembly.Module(wasmBytes);
  const instance = new WebAssembly.Instance(module, {
    wasi_snapshot_preview1: wasi.wasiImport,
    doom_host: doomHost,
  });
  assertWasmdoomExports(instance.exports);
  exports = instance.exports;

  let startCode: number;
  try {
    startCode = wasi.start(instance as Parameters<typeof wasi.start>[0]);
  } catch (err) {
    // wasi.start catches WASIProcExit internally and returns the code, so
    // anything thrown here is either a host-import throw or a wasm trap.
    if (err instanceof WASIProcExit) {
      errors.push({
        source: "exit",
        message: `process exited during _start with code ${err.code}`,
      });
      throw new EngineCrashError(
        err.code,
        `wasm exited during init (code ${err.code})`,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    errors.push({
      source: "exit",
      message: `wasm trap during _start: ${message}`,
    });
    throw new EngineCrashError(-1, `wasm trapped during init: ${message}`);
  }
  if (startCode !== 0) {
    errors.push({
      source: "exit",
      message: `process exited during _start with code ${startCode}`,
    });
    throw new EngineCrashError(
      startCode,
      `wasm exited during init (code ${startCode})`,
    );
  }

  return { exports, errors, clock };
}

// Run a single tick, converting WASIProcExit into an EngineCrashError so the
// caller doesn't have to import the wasi shim.
export function tickSafely(doom: HeadlessDoom): void {
  try {
    doom.exports.wasmdoom_tick();
  } catch (err) {
    if (err instanceof WASIProcExit) {
      doom.errors.push({
        source: "exit",
        message: `process exited during tick with code ${err.code}`,
      });
      throw new EngineCrashError(err.code);
    }
    throw err;
  }
}

export function readFramebuffer(doom: HeadlessDoom): {
  indices: Uint8Array;
  palette: Uint8Array;
} {
  const fbPtr = doom.exports.wasmdoom_get_framebuffer();
  const palPtr = doom.exports.wasmdoom_get_palette();
  const memory = doom.exports.memory.buffer;
  // 320x200 8-bit indexed framebuffer, 768-byte RGB palette (256 * 3).
  const indices = new Uint8Array(memory, fbPtr, 320 * 200).slice();
  const palette = new Uint8Array(memory, palPtr, 768).slice();
  return { indices, palette };
}
