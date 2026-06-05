// Node-side host that loads the Doom wasm and a WAD into a WASI sandbox.

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
  wasmdoom_events_ptr: () => number;
  wasmdoom_events_len: () => number;
  wasmdoom_save_slot_ptr: (slot: number) => number;
  wasmdoom_save_commit: (slot: number, dataLen: number) => number;
};

const REQUIRED_FUNCTIONS = [
  "wasmdoom_init",
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
  source: "exit";
  message: string;
};

// Event tag for I_Error's EV_ERROR record. Kept in sync with EV_ERROR in
// src/wd_events.h; the headless host only cares about this one tag, so we scan
// for it directly rather than pulling in the full web-side dispatcher.
const EV_ERROR = 1;

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
    if (tag === EV_ERROR && payloadLen >= 8) {
      const msgPtr = view.getUint32(payloadStart, true);
      const msgLen = view.getUint32(payloadStart + 4, true);
      const bytes = new Uint8Array(exports.memory.buffer, msgPtr, msgLen);
      return new TextDecoder().decode(bytes);
    }
    offset = payloadStart + payloadLen;
  }
  return null;
}

export type HeadlessDoom = {
  exports: WasmdoomExports;
  errors: ErrorRecord[];
};

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

  const module = new WebAssembly.Module(wasmBytes);
  const instance = new WebAssembly.Instance(module, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });
  assertWasmdoomExports(instance.exports);
  const exports = instance.exports;

  let startCode: number;
  try {
    startCode = wasi.start(instance as Parameters<typeof wasi.start>[0]);
  } catch (err) {
    // wasi.start catches WASIProcExit internally and returns the code, so
    // anything thrown here is either a host-import throw or a wasm trap.
    if (err instanceof WASIProcExit) {
      const engineError = readEngineError(exports);
      const message =
        engineError ?? `process exited during _start with code ${err.code}`;
      errors.push({ source: "exit", message });
      throw new EngineCrashError(
        err.code,
        engineError ?? `wasm exited during init (code ${err.code})`,
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
    const engineError = readEngineError(exports);
    const message =
      engineError ?? `process exited during _start with code ${startCode}`;
    errors.push({ source: "exit", message });
    throw new EngineCrashError(
      startCode,
      engineError ?? `wasm exited during init (code ${startCode})`,
    );
  }

  return { exports, errors };
}

// Run a single tick, converting WASIProcExit into an EngineCrashError so the
// caller doesn't have to import the wasi shim. wasmdoom_tick clears the event
// buffer itself at the start of each tick.
export function tickSafely(doom: HeadlessDoom): void {
  try {
    doom.exports.wasmdoom_tick();
  } catch (err) {
    if (err instanceof WASIProcExit) {
      const engineError = readEngineError(doom.exports);
      const message =
        engineError ?? `process exited during tick with code ${err.code}`;
      doom.errors.push({ source: "exit", message });
      throw new EngineCrashError(err.code, message);
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
