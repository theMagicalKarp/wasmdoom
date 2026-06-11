// Node-side host that loads the Doom wasm and a WAD into linear memory.
//
// The engine wasm is freestanding: it has zero imports and is instantiated with
// an empty import object (mirroring web/src/doom-runtime.ts). There is no WASI
// layer and no `_initialize`; the host stages the WAD + argv into linear memory
// and calls `wasmdoom_init`. Engine crashes (I_Error -> __builtin_trap) surface
// as a wasm trap, which we convert to an EngineCrashError below.

import { readFile } from "node:fs/promises";

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

function assertWasmdoomExports(
  exports: WebAssembly.Exports,
): asserts exports is WasmdoomExports {
  const { memory } = exports;
  if (!(memory instanceof WebAssembly.Memory)) {
    throw new Error("wasm module is missing a `memory` export");
  }
  for (const name of REQUIRED_FUNCTIONS) {
    if (typeof exports[name] !== "function") {
      throw new Error(`wasm module is missing a \`${name}\` export`);
    }
  }
}

// Thrown when the wasm process calls exit() or aborts mid-tick. The engine's
// exit() traps the wasm, so callers see this instead of a raw RuntimeError and
// can distinguish engine crashes from other thrown values.
export class EngineCrashError extends Error {
  readonly exitCode: number;
  constructor(exitCode: number, message?: string) {
    super(message ?? `wasm engine exited with code ${exitCode}`);
    this.name = "EngineCrashError";
    this.exitCode = exitCode;
  }
}

export type ErrorRecord = {
  source: "exit";
  message: string;
};

// Log tags, kept in sync with src/wd_events.h. All three carry their message
// bytes inline in the payload. The headless host only cares about these tags,
// so we scan for them directly rather than pulling in the full web-side
// dispatcher.
const EV_ERROR = 1;
const EV_INFO = 14;
const EV_WARNING = 15;

// Scan the outbound event buffer for the EV_ERROR record I_Error emits right
// before exit(), and decode its message. Safe to call after the tick/_start has
// thrown: proc_exit only throws, so wasm linear memory stays readable, and the
// buffer is cleared only at the start of the next tick (which never comes after
// a crash). Returns null if no error record is present.
function readEngineError(exports: WasmdoomExports): string | null {
  const len = exports.wasmdoom_events_len();
  if (len === 0) {
    return null;
  }
  const base = exports.wasmdoom_events_ptr();
  const view = new DataView(exports.memory.buffer, base, len);
  let offset = 0;
  while (offset + 4 <= len) {
    const tag = view.getUint16(offset, true);
    const payloadLen = view.getUint16(offset + 2, true);
    const payloadStart = offset + 4;
    if (payloadStart + payloadLen > len) {
      break;
    }
    if (tag === EV_ERROR) {
      const bytes = new Uint8Array(
        exports.memory.buffer,
        base + payloadStart,
        payloadLen,
      );
      return new TextDecoder().decode(bytes);
    }
    offset = payloadStart + payloadLen;
  }
  return null;
}

// Walk the outbound event buffer and print EV_INFO/EV_WARNING records, whose
// payloads are the message bytes inline. Call once per tick (the buffer is
// cleared at the start of the next tick) and after init. EV_ERROR is handled
// separately by readEngineError, so it is skipped here.
export function drainLogs(exports: WasmdoomExports): void {
  const len = exports.wasmdoom_events_len();
  if (len === 0) {
    return;
  }
  const base = exports.wasmdoom_events_ptr();
  const view = new DataView(exports.memory.buffer, base, len);
  let offset = 0;
  while (offset + 4 <= len) {
    const tag = view.getUint16(offset, true);
    const payloadLen = view.getUint16(offset + 2, true);
    const payloadStart = offset + 4;
    if (payloadStart + payloadLen > len) {
      break;
    }
    if (tag === EV_INFO || tag === EV_WARNING) {
      const bytes = new Uint8Array(
        exports.memory.buffer,
        base + payloadStart,
        payloadLen,
      );
      const message = new TextDecoder().decode(bytes);
      if (tag === EV_WARNING) {
        console.warn(`[doom_engine] ${message}`);
      } else {
        console.log(`[doom_engine] ${message}`);
      }
    }
    offset = payloadStart + payloadLen;
  }
}

export type HeadlessDoom = {
  exports: WasmdoomExports;
  errors: ErrorRecord[];
};

export async function loadHeadlessDoom(opts: {
  wadPath: string;
  wasmPath: string;
  // Doom command-line flags (excluding argv[0]), e.g. ["-warp", "1"].
  flags?: string[];
}): Promise<HeadlessDoom> {
  const [wadBytes, wasmBytes] = await Promise.all([
    readFile(opts.wadPath),
    readFile(opts.wasmPath),
  ]);

  const errors: ErrorRecord[] = [];

  // Freestanding wasm: no imports, no WASI. Instantiate with an empty import
  // object, just like the web runtime.
  const { instance } = await WebAssembly.instantiate(wasmBytes, {});
  assertWasmdoomExports(instance.exports);
  const exports = instance.exports;

  // Stage the IWAD straight into linear memory.
  const wadPtr = exports.wasmdoom_wad_alloc(wadBytes.length);
  if (wadPtr === 0) {
    throw new EngineCrashError(
      -1,
      `wasmdoom_wad_alloc(${wadBytes.length}) failed`,
    );
  }
  new Uint8Array(exports.memory.buffer, wadPtr, wadBytes.length).set(wadBytes);

  // Stage flag tokens as NUL-separated argv into the engine's buffer.
  try {
    stageArgv(exports.memory, exports.wasmdoom_argv_ptr(), opts.flags ?? []);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new EngineCrashError(-1, message);
  }

  // Run engine setup. Like a tick, it can I_Error → exit() mid-call, which traps
  // the wasm; convert any throw into an EngineCrashError, decoding the engine's
  // own error message from the event buffer when present.
  try {
    exports.wasmdoom_init();
    drainLogs(exports);
  } catch (err) {
    const engineError = readEngineError(exports);
    const message =
      engineError ??
      `wasm trapped during init: ${err instanceof Error ? err.message : String(err)}`;
    errors.push({ source: "exit", message });
    throw new EngineCrashError(-1, message);
  }

  return { exports, errors };
}

// Run a single tick, converting a wasm trap (the engine's exit()) into an
// EngineCrashError. wasmdoom_tick clears the event buffer itself at the start of
// each tick, so the EV_ERROR record from a crash survives for readEngineError.
export function tickSafely(doom: HeadlessDoom): void {
  try {
    doom.exports.wasmdoom_tick();
    drainLogs(doom.exports);
  } catch (err) {
    const engineError = readEngineError(doom.exports);
    const message =
      engineError ??
      `wasm trapped during tick: ${err instanceof Error ? err.message : String(err)}`;
    doom.errors.push({ source: "exit", message });
    throw new EngineCrashError(-1, message);
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
