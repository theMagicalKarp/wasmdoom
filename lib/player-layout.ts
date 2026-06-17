// Mirror of the wd_player_t wire layout in src/wd_iface.h. Kept in sync by hand
// (like the WasmdoomExports type); the C side has _Static_asserts that fail the
// build if these offsets/size ever drift.

export const PLAYER_REC = 160; // sizeof(wd_player_t)
export const PLAYER_OFF = {
  health: 0,
  armorpoints: 4,
  armortype: 8,
  readyweapon: 12,
  pendingweapon: 16,
  backpack: 20,
  cheats: 24,
  killcount: 28,
  itemcount: 32,
  secretcount: 36,
  playerstate: 40,
  damagecount: 44,
  bonuscount: 48,
  attackdown: 52,
  usedown: 56,
  refire: 60,
  cards: 64, // bitmask, card_t
  weapons: 68, // bitmask, weapontype_t
  ammo: 72, // int32[NUMAMMO]
  maxammo: 88, // int32[NUMAMMO]
  powers: 104, // int32[NUMPOWERS]
  x: 128, // fixed_t 16.16, mo-derived
  y: 132,
  z: 136,
  angle: 140, // angle_t BAM, mo-derived
  momx: 144, // fixed_t, mo-derived
  momy: 148,
  momz: 152,
  dirty: 156, // host->engine: PLAYER_FIELD bits to apply (0 on snapshot)
} as const;

// Dirty bits for the `dirty` field, mirroring the WD_PF_* enum in
// src/wd_iface.h. The host ORs the bit for each field it wrote, then calls
// wasmdoom_apply_player(). Arrays and the cards/weapons bitmasks each get one
// bit (applied whole); POS covers x/y/z/angle/momx/momy/momz together.
export const PLAYER_FIELD = {
  health: 1 << 0,
  armorpoints: 1 << 1,
  armortype: 1 << 2,
  readyweapon: 1 << 3,
  pendingweapon: 1 << 4,
  backpack: 1 << 5,
  cheats: 1 << 6,
  killcount: 1 << 7,
  itemcount: 1 << 8,
  secretcount: 1 << 9,
  playerstate: 1 << 10,
  damagecount: 1 << 11,
  bonuscount: 1 << 12,
  attackdown: 1 << 13,
  usedown: 1 << 14,
  refire: 1 << 15,
  cards: 1 << 16,
  weapons: 1 << 17,
  ammo: 1 << 18,
  maxammo: 1 << 19,
  powers: 1 << 20,
  pos: 1 << 21, // x/y/z/angle/momx/momy/momz
} as const;

// Array lengths (NUMAMMO/NUMPOWERS from src/doomdef.h).
export const PLAYER_LEN = {
  ammo: 4,
  maxammo: 4,
  powers: 6,
} as const;

export type Player = {
  health: number;
  armorpoints: number;
  armortype: number;
  readyweapon: number; // weapontype_t
  pendingweapon: number; // weapontype_t
  backpack: number;
  cheats: number;
  killcount: number;
  itemcount: number;
  secretcount: number;
  playerstate: number; // playerstate_t
  damagecount: number;
  bonuscount: number;
  attackdown: number;
  usedown: number;
  refire: number;
  cards: number; // bitmask, card_t
  weapons: number; // bitmask, weapontype_t
  ammo: number[];
  maxammo: number[];
  powers: number[];
  x: number; // world units (fixed_t decoded to float)
  y: number;
  z: number;
  angle: number; // raw angle_t BAM
  momx: number; // world units (fixed_t decoded to float)
  momy: number;
  momz: number;
};
