// Mirror of the wd_mobj_t wire layout in src/wd_iface.h. Kept in sync by hand
// (like the WasmdoomExports type); the C side has _Static_asserts that fail the
// build if these offsets/size ever drift.

export const MAP_OBJECT_REC = 32; // sizeof(wd_mobj_t)
export const MAP_OBJECT_OFF = {
  x: 0, // fixed_t 16.16
  y: 4, // fixed_t 16.16
  z: 8, // fixed_t 16.16
  angle: 12, // angle_t BAM
  type: 16, // mobjtype_t
  health: 20,
  flags: 24, // mobjflag_t bitfield
  dirty: 28, // host->engine: MAP_OBJECT_FIELD bits to apply (0 on snapshot)
} as const;

// Dirty bits for the `dirty` field, mirroring the WD_MF_* enum in
// src/wd_iface.h. The host ORs the bit for each field it wrote on a record, then
// calls wasmdoom_apply_map_objects(). POS covers x/y/z/angle together.
export const MAP_OBJECT_FIELD = {
  health: 1 << 0,
  flags: 1 << 1,
  type: 1 << 2,
  pos: 1 << 3, // x/y/z/angle
} as const;

export type MapObject = {
  x: number; // world units (fixed_t decoded to float)
  y: number;
  z: number;
  angle: number; // raw angle_t BAM
  type: number; // mobjtype_t
  health: number;
  flags: number;
};
