// Mirror of the wd_settings_t wire layout in src/wd_iface.h. Kept in sync by
// hand (like the WasmdoomExports type); the C side has _Static_asserts that fail
// the build if these offsets/size ever drift.

export const SETTINGS_REC = 52; // sizeof(wd_settings_t)
export const SETTINGS_OFF = {
  // Read-only game state (no dirty bit; ignored by wasmdoom_apply_settings).
  gamestate: 0, // gamestate_t
  gameepisode: 4,
  gamemap: 8,
  gameskill: 12, // skill_t
  // Writable config.
  sfx_volume: 16,
  music_volume: 20,
  mouse_sensitivity: 24,
  show_messages: 28,
  screenblocks: 32,
  detail_level: 36,
  menuactive: 40, // read-only (no dirty bit); menu overlayed?
  save_string_enter: 44, // read-only (no dirty bit); typing a save name?
  dirty: 48, // host->engine: SETTINGS_FIELD bits to apply (0 on snapshot)
} as const;

// Dirty bits for the `dirty` field, mirroring the WD_SF_* enum in
// src/wd_iface.h. The host ORs the bit for each writable field it wrote, then
// calls wasmdoom_apply_settings(). screenblocks and detail_level share the
// viewsize bit because R_SetViewSize takes both together. The read-only game
// state fields have no bit and cannot be written.
export const SETTINGS_FIELD = {
  sfx_volume: 1 << 0,
  music_volume: 1 << 1,
  mouse_sensitivity: 1 << 2,
  show_messages: 1 << 3,
  screenblocks: 1 << 4, // viewsize: screenblocks + detail_level
  detail_level: 1 << 4, // viewsize: screenblocks + detail_level
} as const;

// The writable config fields (everything with a dirty bit). writeSettings and
// the sim "set" validator reject keys outside this set.
export const SETTINGS_WRITABLE = [
  "sfx_volume",
  "music_volume",
  "mouse_sensitivity",
  "show_messages",
  "screenblocks",
  "detail_level",
] as const;

export type Settings = {
  gamestate: number; // gamestate_t, read-only
  gameepisode: number; // read-only
  gamemap: number; // read-only
  gameskill: number; // skill_t, read-only
  sfx_volume: number;
  music_volume: number;
  mouse_sensitivity: number;
  show_messages: number;
  screenblocks: number;
  detail_level: number;
  menuactive: number; // read-only, menu overlayed?
  save_string_enter: number; // read-only, typing a save name?
};
