// Loads and instantiates the Doom wasm module.
//
// Fetches the WAD, builds a WASI sandbox with the WAD exposed in /,
// instantiates the wasm with no `doom_host` imports, and runs `_start`. The
// engine accumulates outbound events into a static buffer the caller drains
// after each tick.

import {
  WASI,
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

export type WasmdoomInstance = WebAssembly.Instance & {
  exports: WasmdoomExports;
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

function assertWasmdoomInstance(
  instance: WebAssembly.Instance,
): asserts instance is WasmdoomInstance {
  const { memory, _start } = instance.exports;
  if (!(memory instanceof WebAssembly.Memory)) {
    throw new Error("wasm module is missing a `memory` export");
  }
  if (typeof _start !== "function") {
    throw new Error("wasm module is missing a `_start` export");
  }
  for (const name of REQUIRED_FUNCTIONS) {
    if (typeof instance.exports[name] !== "function") {
      throw new Error(`wasm module is missing a \`${name}\` export`);
    }
  }
}

export type Doom = {
  exports: WasmdoomExports;
};

export async function loadDoom(opts: {
  wadUrl: string;
  wasmUrl: string;
}): Promise<Doom> {
  const wadResp = await fetch(opts.wadUrl);
  const wadBytes = new Uint8Array(await wadResp.arrayBuffer());

  const stdin = new OpenFile(new File([]));
  const stdout = ConsoleStdout.lineBuffered((line) => console.log(line));
  const stderr = ConsoleStdout.lineBuffered((line) => console.warn(line));
  const cwd = new PreopenDirectory(
    "/",
    new Map<string, File>([
      ["doom1.wad", new File(wadBytes, { readonly: true })],
    ]),
  );
  const env = ["HOME=/", "DOOMWADDIR=/"];
  const wasi = new WASI(["wasmdoom"], env, [stdin, stdout, stderr, cwd]);

  const { instance } = await WebAssembly.instantiateStreaming(
    fetch(opts.wasmUrl),
    { wasi_snapshot_preview1: wasi.wasiImport },
  );
  assertWasmdoomInstance(instance);
  wasi.start(instance);

  return { exports: instance.exports };
}
