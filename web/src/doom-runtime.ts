// Loads and instantiates the Doom wasm module.
//
// Fetches the WAD, builds a WASI sandbox with the WAD exposed in /, wires
// the caller's host imports, instantiates the wasm, and runs `_start`.
//
// The memory-before-_start hazard is owned here: `wasi.start()` runs the C
// program's I_InitMusic during startup, which calls back into the host
// imports (audio, in particular) — those imports need to read wasm memory
// before _start returns. We solve that by handing buildHost a `host` ref
// object whose `getMemory`/`getExports` resolve as soon as the wasm is
// instantiated but before `_start` runs.

import {
  WASI,
  ConsoleStdout,
  OpenFile,
  File,
  PreopenDirectory,
} from "@bjorn3/browser_wasi_shim";
import type { DoomAudioImports } from "./doom-audio.ts";

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

export type DoomHostImports = DoomAudioImports & {
  wasmdoom_error(messagePtr: number, length: number): void;
  wasmdoom_draw(): void;
  wasmdoom_save_game(
    namePtr: number,
    sourcePtr: number,
    length: number,
  ): number;
  wasmdoom_load_game(namePtr: number, destPtr: number, maxLen: number): number;
};

// Live references to the running wasm. Both throw if read before the
// instance has been created.
export type RuntimeHost = {
  getMemory(): WebAssembly.Memory;
  getExports(): WasmdoomExports;
};

export type Doom = {
  exports: WasmdoomExports;
};

export async function loadDoom(opts: {
  wadUrl: string;
  wasmUrl: string;
  buildHost(host: RuntimeHost): DoomHostImports;
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

  let exports: WasmdoomExports | null = null;
  const host: RuntimeHost = {
    getMemory: () => {
      if (exports === null) {
        throw new Error("doom host import called before wasm was ready");
      }
      return exports.memory;
    },
    getExports: () => {
      if (exports === null) {
        throw new Error("doom host import called before wasm was ready");
      }
      return exports;
    },
  };

  const imports = opts.buildHost(host);
  const { instance } = await WebAssembly.instantiateStreaming(
    fetch(opts.wasmUrl),
    {
      wasi_snapshot_preview1: wasi.wasiImport,
      doom_host: imports,
    },
  );
  assertWasmdoomInstance(instance);
  // Resolve `host` before `wasi.start` runs `_start`; I_InitMusic calls
  // into host imports during start-up and they read wasm memory.
  exports = instance.exports;
  wasi.start(instance);

  return { exports };
}
