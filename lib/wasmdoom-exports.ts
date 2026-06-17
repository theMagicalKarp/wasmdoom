// The Doom engine wasm's exported surface, kept in sync by hand with the
// WASMDOOM_EXPORT functions in src/wasmdoom.c (the same way the layout records
// mirror wd_iface.h). Shared by the headless host
// (tools/lib/wasmdoom-headless.ts) and the browser runtime
// (web/src/doom-runtime.ts) so their view of the engine ABI can't drift.

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
  wasmdoom_events_clear: () => void;
  wasmdoom_save_slot_ptr: (slot: number) => number;
  wasmdoom_save_commit: (slot: number, dataLen: number) => number;
  wasmdoom_snapshot_player: () => number; // packs player, 1 if present else 0
  wasmdoom_player_snapshot_ptr: () => number; // wd_player_t in linear memory
  wasmdoom_apply_player: () => number; // applies dirtied player fields, 1/0
  wasmdoom_snapshot_map_objects: () => number; // packs map_objects, returns count
  wasmdoom_map_objects_ptr: () => number; // wd_mobj_t[] in linear memory
  wasmdoom_apply_map_objects: () => number; // applies dirtied map_objects, count
  wasmdoom_snapshot_settings: () => void; // packs settings + game state
  wasmdoom_settings_ptr: () => number; // wd_settings_t in linear memory
  wasmdoom_apply_settings: () => void; // applies dirtied settings
};

export type WasmdoomInstance = WebAssembly.Instance & {
  exports: WasmdoomExports;
};

// Runtime source of truth for the function exports. `satisfies` rejects a name
// that isn't on WasmdoomExports; it can't enforce completeness, so a future
// export must be added to both this list and the type above.
const WASMDOOM_EXPORT_NAMES = [
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
  "wasmdoom_events_clear",
  "wasmdoom_save_slot_ptr",
  "wasmdoom_save_commit",
  "wasmdoom_snapshot_player",
  "wasmdoom_player_snapshot_ptr",
  "wasmdoom_apply_player",
  "wasmdoom_snapshot_map_objects",
  "wasmdoom_map_objects_ptr",
  "wasmdoom_apply_map_objects",
  "wasmdoom_snapshot_settings",
  "wasmdoom_settings_ptr",
  "wasmdoom_apply_settings",
] as const satisfies readonly (keyof WasmdoomExports)[];

// Validate a freshly-instantiated module's exports against WasmdoomExports. The
// `asserts` signature narrows the argument in place, so callers get a typed
// `exports` with no cast. A renamed or dropped C export surfaces here as a clear
// error instead of a cryptic failure at first use.
export function assertWasmdoomExports(
  exports: WebAssembly.Exports,
): asserts exports is WasmdoomExports {
  if (!(exports.memory instanceof WebAssembly.Memory)) {
    throw new Error("wasm module is missing a `memory` export");
  }
  for (const name of WASMDOOM_EXPORT_NAMES) {
    if (typeof exports[name] !== "function") {
      throw new Error(`wasm module is missing a \`${name}\` export`);
    }
  }
}
