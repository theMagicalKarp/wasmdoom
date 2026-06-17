#ifndef __WD_IFACE_H__
#define __WD_IFACE_H__

#include <stddef.h>
#include <stdint.h>

// Stable, documented wire layout for the JS<->WASM boundary.
//
// This struct is deliberately decoupled from the internal engine structs
// (mobj_t etc.): those have compiler-determined offsets that drift as fields
// are added or reordered. The records below are the contract we own. JS reads
// them straight out of linear memory using the matching offset constants.

// One map object (mobj_t) snapshot.
typedef struct {
  int32_t x, y, z; // fixed_t, 16.16 fixed-point
  uint32_t angle;  // angle_t, BAM
  int32_t type;    // mobjtype_t
  int32_t health;
  int32_t flags;  // mobjflag_t bitfield
  uint32_t dirty; // host->engine: WD_MF_* bits to apply (0 on snapshot)
} wd_mobj_t;

_Static_assert(offsetof(wd_mobj_t, x) == 0, "wd_mobj_t layout drift");
_Static_assert(offsetof(wd_mobj_t, y) == 4, "wd_mobj_t layout drift");
_Static_assert(offsetof(wd_mobj_t, z) == 8, "wd_mobj_t layout drift");
_Static_assert(offsetof(wd_mobj_t, angle) == 12, "wd_mobj_t layout drift");
_Static_assert(offsetof(wd_mobj_t, type) == 16, "wd_mobj_t layout drift");
_Static_assert(offsetof(wd_mobj_t, health) == 20, "wd_mobj_t layout drift");
_Static_assert(offsetof(wd_mobj_t, flags) == 24, "wd_mobj_t layout drift");
_Static_assert(offsetof(wd_mobj_t, dirty) == 28, "wd_mobj_t layout drift");
_Static_assert(sizeof(wd_mobj_t) == 32, "wd_mobj_t layout drift");

// Dirty bits for wd_mobj_t.dirty: the host sets bit(s) for each field it wrote
// before calling wasmdoom_apply_map_objects().
enum {
  WD_MF_HEALTH = 1u << 0,
  WD_MF_FLAGS = 1u << 1,
  WD_MF_TYPE = 1u << 2,
  WD_MF_POS = 1u << 3,
};

#define WD_NUMAMMO 4
#define WD_NUMPOWERS 6

// One player_t snapshot. cards/weapons are packed bitmasks (bit i mirrors the
// enum value i, same shape as cheats); ammo/maxammo/powers are inline
// arrays; x..momz are mobj-derived (viewplayer->mo) and stay 0 when the player
// has no mobj.
typedef struct {
  int32_t health, armorpoints, armortype;
  int32_t readyweapon, pendingweapon, backpack, cheats;
  int32_t killcount, itemcount, secretcount, playerstate;
  int32_t damagecount, bonuscount, attackdown, usedown, refire;
  int32_t cards;   // bitmask, card_t
  int32_t weapons; // bitmask, weapontype_t
  int32_t ammo[WD_NUMAMMO];
  int32_t maxammo[WD_NUMAMMO];
  int32_t powers[WD_NUMPOWERS];
  int32_t x, y, z;          // fixed_t 16.16, mo-derived
  uint32_t angle;           // angle_t BAM, mo-derived
  int32_t momx, momy, momz; // fixed_t, mo-derived
  uint32_t dirty; // host->engine: WD_PF_* bits to apply (0 on snapshot)
} wd_player_t;

_Static_assert(offsetof(wd_player_t, cards) == 64, "wd_player_t layout drift");
_Static_assert(offsetof(wd_player_t, weapons) == 68,
               "wd_player_t layout drift");
_Static_assert(offsetof(wd_player_t, ammo) == 72, "wd_player_t layout drift");
_Static_assert(offsetof(wd_player_t, maxammo) == 88,
               "wd_player_t layout drift");
_Static_assert(offsetof(wd_player_t, powers) == 104,
               "wd_player_t layout drift");
_Static_assert(offsetof(wd_player_t, x) == 128, "wd_player_t layout drift");
_Static_assert(offsetof(wd_player_t, angle) == 140, "wd_player_t layout drift");
_Static_assert(offsetof(wd_player_t, momx) == 144, "wd_player_t layout drift");
_Static_assert(offsetof(wd_player_t, momz) == 152, "wd_player_t layout drift");
_Static_assert(offsetof(wd_player_t, dirty) == 156, "wd_player_t layout drift");
_Static_assert(sizeof(wd_player_t) == 160, "wd_player_t layout drift");

// Dirty bits for wd_player_t.dirty: the host sets bit(s) for each field it
// wrote before calling wasmdoom_apply_player().
// Arrays (ammo/maxammo/powers) and the packed bitmasks
// (cards/weapons) each get one bit and are applied whole. WD_PF_POS covers
// x/y/z/angle/momx/momy/momz together (the engine relinks the mobj on apply).
enum {
  WD_PF_HEALTH = 1u << 0,
  WD_PF_ARMORPOINTS = 1u << 1,
  WD_PF_ARMORTYPE = 1u << 2,
  WD_PF_READYWEAPON = 1u << 3,
  WD_PF_PENDINGWEAPON = 1u << 4,
  WD_PF_BACKPACK = 1u << 5,
  WD_PF_CHEATS = 1u << 6,
  WD_PF_KILLCOUNT = 1u << 7,
  WD_PF_ITEMCOUNT = 1u << 8,
  WD_PF_SECRETCOUNT = 1u << 9,
  WD_PF_PLAYERSTATE = 1u << 10,
  WD_PF_DAMAGECOUNT = 1u << 11,
  WD_PF_BONUSCOUNT = 1u << 12,
  WD_PF_ATTACKDOWN = 1u << 13,
  WD_PF_USEDOWN = 1u << 14,
  WD_PF_REFIRE = 1u << 15,
  WD_PF_CARDS = 1u << 16,
  WD_PF_WEAPONS = 1u << 17,
  WD_PF_AMMO = 1u << 18,
  WD_PF_MAXAMMO = 1u << 19,
  WD_PF_POWERS = 1u << 20,
  WD_PF_POS = 1u << 21,
};

// Global game settings + read-only game state, packed into one record the host
// reads/writes the same way as wd_player_t. The first four fields (gamestate..
// gameskill) are read-only context (which map/skill we're on); they have no
// dirty bit and are ignored by wasmdoom_apply_settings. The remaining fields
// are writable config; on apply each goes through the engine's real setter
// (S_SetSfxVolume etc.) rather than a raw store, so side effects still fire.
typedef struct {
  int32_t gamestate;   // gamestate_t, read-only
  int32_t gameepisode; // read-only
  int32_t gamemap;     // read-only
  int32_t gameskill;   // skill_t, read-only
  int32_t sfx_volume;
  int32_t music_volume;
  int32_t mouse_sensitivity;
  int32_t show_messages;
  int32_t screenblocks;
  int32_t detail_level;
  uint32_t dirty; // host->engine: WD_SF_* bits to apply (0 on snapshot)
} wd_settings_t;

_Static_assert(offsetof(wd_settings_t, gamestate) == 0,
               "wd_settings_t layout drift");
_Static_assert(offsetof(wd_settings_t, gameepisode) == 4,
               "wd_settings_t layout drift");
_Static_assert(offsetof(wd_settings_t, gamemap) == 8,
               "wd_settings_t layout drift");
_Static_assert(offsetof(wd_settings_t, gameskill) == 12,
               "wd_settings_t layout drift");
_Static_assert(offsetof(wd_settings_t, sfx_volume) == 16,
               "wd_settings_t layout drift");
_Static_assert(offsetof(wd_settings_t, music_volume) == 20,
               "wd_settings_t layout drift");
_Static_assert(offsetof(wd_settings_t, mouse_sensitivity) == 24,
               "wd_settings_t layout drift");
_Static_assert(offsetof(wd_settings_t, show_messages) == 28,
               "wd_settings_t layout drift");
_Static_assert(offsetof(wd_settings_t, screenblocks) == 32,
               "wd_settings_t layout drift");
_Static_assert(offsetof(wd_settings_t, detail_level) == 36,
               "wd_settings_t layout drift");
_Static_assert(offsetof(wd_settings_t, dirty) == 40,
               "wd_settings_t layout drift");
_Static_assert(sizeof(wd_settings_t) == 44, "wd_settings_t layout drift");

// Dirty bits for wd_settings_t.dirty: the host sets bit(s) for each writable
// field it wrote before calling wasmdoom_apply_settings(). screenblocks and
// detail_level share WD_SF_VIEWSIZE because R_SetViewSize takes both together
// (same idea as WD_PF_POS grouping the position fields).
enum {
  WD_SF_SFX_VOLUME = 1u << 0,
  WD_SF_MUSIC_VOLUME = 1u << 1,
  WD_SF_MOUSE_SENSITIVITY = 1u << 2,
  WD_SF_SHOW_MESSAGES = 1u << 3,
  WD_SF_VIEWSIZE = 1u << 4, // screenblocks + detail_level
};

#endif
