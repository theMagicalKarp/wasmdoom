// Key codes Doom's C side recognises. These mirror the wire protocol the
// wasm module's input layer expects. Duplicated from web/src/input.ts so
// the headless simulator does not depend on the web build.

export const WASMDOOM_KEYS = {
  // Movement / view
  RIGHT: 0xae,
  LEFT: 0xac,
  UP: 0xad,
  DOWN: 0xaf,

  MOVE_FORWARD: 0xad,
  MOVE_BACKWARD: 0xaf,
  TURN_LEFT: 0xac,
  TURN_RIGHT: 0xae,
  STRAFE_LEFT: 0x2c,
  STRAFE_RIGHT: 0x2e,
  STRAFE_ON: 0x80 + 0x38,

  // Combat / interaction
  FIRE: 0x80 + 0x1d,
  USE: 0x20,
  RUN: 0x80 + 0x36,

  // Weapon select
  WEAPON_1: 0x31,
  WEAPON_2: 0x32,
  WEAPON_3: 0x33,
  WEAPON_4: 0x34,
  WEAPON_5: 0x35,
  WEAPON_6: 0x36,
  WEAPON_7: 0x37,

  // Menu / system
  MENU_OPEN: 0x1b,
  MENU_CONFIRM: 0xd,
  MENU_BACK: 0x7f,
  PAUSE: 0xff,
  VIEW_SIZE_UP: 0x3d,
  VIEW_SIZE_DOWN: 0x2d,

  // Automap
  AUTOMAP_TOGGLE: 0x9,
  AUTOMAP_FOLLOW: 0x66,
  AUTOMAP_GRID: 0x67,
  AUTOMAP_MARK: 0x6d,
  AUTOMAP_CLEARMARK: 0x63,
  AUTOMAP_GOBIG: 0x30,

  // Function-key features (F1-F12)
  HELP: 0x80 + 0x3b,
  SAVE: 0x80 + 0x3c,
  LOAD: 0x80 + 0x3d,
  SOUND_VOLUME: 0x80 + 0x3e,
  DETAIL: 0x80 + 0x3f,
  QUICKSAVE: 0x80 + 0x40,
  END_GAME: 0x80 + 0x41,
  MESSAGES: 0x80 + 0x42,
  QUICKLOAD: 0x80 + 0x43,
  QUIT: 0x80 + 0x44,
  GAMMA: 0x80 + 0x57,
  SPY: 0x80 + 0x58,
} as const;

export const WASMDOOM_MOUSE_BUTTONS = {
  FIRE: 1 << 0,
  STRAFE: 1 << 1,
  USE: 1 << 2,
} as const;

export type WasmdoomKeyName = keyof typeof WASMDOOM_KEYS;

// Sentinel bit on a keydown value: when set, the low byte is delivered as a
// typed ASCII character (ev_typechar) rather than a game key. Mirrors
// WASMDOOM_TYPECHAR_FLAG in src/wasmdoom.h.
export const WASMDOOM_TYPECHAR_FLAG = 0x100;

// Resolve a symbolic name ("FIRE", "fire", "Enter") or numeric key to the
// raw integer the wasm engine expects. Returns null for unknown names.
// Numeric values may carry the typechar sentinel (0x100..0x1ff), so recorded
// typed-character events round-trip.
export function resolveKey(input: string | number): number | null {
  if (typeof input === "number") {
    return Number.isInteger(input) &&
      input >= 0 &&
      input <= (WASMDOOM_TYPECHAR_FLAG | 0xff)
      ? input
      : null;
  }
  const upper = input.toUpperCase();
  const value = (WASMDOOM_KEYS as Record<string, number>)[upper];
  return typeof value === "number" ? value : null;
}
