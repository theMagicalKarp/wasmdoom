// The music synth wasm's exported surface (src/music/wasmdoom_music.c), shared
// by the offline renderer (tools/lib/wasmdoom.music.ts) and the browser
// AudioWorklet (web/src/music/music-worklet.ts). The module exports the full set
// below; each consumer calls only the subset it needs (the renderer polls
// `_active` to detect end-of-song; the worklet uses the pause/resume/stop/volume
// controls for live playback), but both validate against the same ABI.

export type WasmDoomMusicExports = {
  memory: WebAssembly.Memory;
  wasmdoom_music_init: (sampleRate: number) => void;
  wasmdoom_music_alloc: (len: number) => number;
  wasmdoom_music_set_genmidi: (ptr: number, len: number) => void;
  wasmdoom_music_register: (handle: number, ptr: number, len: number) => void;
  wasmdoom_music_play: (handle: number, looping: number) => void;
  wasmdoom_music_pause: (handle: number) => void;
  wasmdoom_music_resume: (handle: number) => void;
  wasmdoom_music_stop: (handle: number) => void;
  wasmdoom_music_unregister: (handle: number) => void;
  wasmdoom_music_set_volume: (volume: number) => void;
  wasmdoom_music_render: (frames: number) => number;
  wasmdoom_music_active: () => number;
};

export type WasmdoomMusicInstance = WebAssembly.Instance & {
  exports: WasmDoomMusicExports;
};

// Runtime source of truth for the function exports. `satisfies` rejects a name
// that isn't on WasmDoomMusicExports; it can't enforce completeness, so a future
// export must be added to both this list and the type above.
const WASMDOOM_MUSIC_EXPORT_NAMES = [
  "wasmdoom_music_init",
  "wasmdoom_music_alloc",
  "wasmdoom_music_set_genmidi",
  "wasmdoom_music_register",
  "wasmdoom_music_play",
  "wasmdoom_music_pause",
  "wasmdoom_music_resume",
  "wasmdoom_music_stop",
  "wasmdoom_music_unregister",
  "wasmdoom_music_set_volume",
  "wasmdoom_music_render",
  "wasmdoom_music_active",
] as const satisfies readonly (keyof WasmDoomMusicExports)[];

// Validate a freshly-instantiated music module's exports. The `asserts`
// signature narrows the argument in place, so a renamed or dropped C export
// surfaces here as a clear error instead of a cryptic failure deep inside
// rendering/playback.
export function assertWasmdoomMusicExports(
  exports: WebAssembly.Exports,
): asserts exports is WasmDoomMusicExports {
  if (!(exports.memory instanceof WebAssembly.Memory)) {
    throw new Error("music wasm: missing `memory` export");
  }
  for (const name of WASMDOOM_MUSIC_EXPORT_NAMES) {
    if (typeof exports[name] !== "function") {
      throw new Error(`music wasm: missing export \`${name}\``);
    }
  }
}
