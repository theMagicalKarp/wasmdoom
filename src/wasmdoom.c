#include <stddef.h>
#include <stdint.h>

#include "d_main.h"
#include "d_player.h"
#include "doomdef.h"
#include "doomstat.h"
#include "i_system.h"
#include "i_video.h"
#include "m_argv.h"
#include "p_local.h"
#include "r_main.h"
#include "r_state.h"
#include "s_sound.h"
#include "st_stuff.h"
#include "v_video.h"
#include "wasmdoom.h"
#include "wd_events.h"
#include "wd_iface.h"
#include "wd_save.h"

#define EXPORT(name) __attribute__((export_name(#name))) name

#define EVENTBUF_CAP 64
static event_t event_buf[EVENTBUF_CAP];
static unsigned event_head = 0, event_tail = 0;

// --- Flag staging ----------------------------------------------------------
// The host writes NUL-separated argv tokens (excluding argv[0]) into
// wd_argv_buf via the wasmdoom_argv_ptr() pointer, ending the list with an
// empty token (double NUL). wd_build_argv points myargv[] into the buffer so
// the engine's M_CheckParm sees the flags. WD_ARGV_BUF_CAP is mirrored on the
// JS side (no separate export, matching how EV_ERROR is mirrored).
#define WD_ARGV_BUF_CAP 4096
#define WD_ARGV_MAX 64
static char wd_argv_buf[WD_ARGV_BUF_CAP];
static char *wd_argv[WD_ARGV_MAX];

uint8_t *EXPORT(wasmdoom_argv_ptr)(void) { return (uint8_t *)wd_argv_buf; }

// The buffer is self-terminating: tokens are NUL-separated and the list ends
// with an empty token (a leading NUL, i.e. a double NUL). No flags ⇒ the first
// byte is NUL ⇒ argc == 1 (just argv[0]), matching the old ["wasmdoom"].
static void wd_build_argv(void) {
  int n = 0;
  wd_argv[n++] = "wasmdoom"; // argv[0], matches the previous hardcoded value
  char *p = wd_argv_buf;
  char *end = wd_argv_buf + WD_ARGV_BUF_CAP;
  while (p < end && *p && n < WD_ARGV_MAX - 1) {
    wd_argv[n++] = p;
    while (p < end && *p) {
      p++; // skip to the token's NUL terminator
    }
    if (p < end) {
      p++; // step past the NUL to the next token
    }
  }
  wd_argv[n] = NULL;
  myargc = n;
  myargv = wd_argv;
}

// --- WAD staging -----------------------------------------------------------
// The host allocates a buffer with wasmdoom_wad_alloc(len) (self-committing:
// the length is recorded), writes the IWAD bytes into it, then sets the
// gamemode via wasmdoom_init. w_wad.c reads lumps straight from this buffer.
static uint8_t *wd_wad_buf = NULL;
static int wd_wad_len = 0;

uint8_t *EXPORT(wasmdoom_wad_alloc)(int len) {
  if (wd_wad_buf) {
    I_Error("wasmdoom_wad_alloc: WAD already staged");
  }
  // memory.grow counts 64 KiB pages and returns the old size in pages (the
  // grown region starts at the old end of memory), or -1 on failure. This is
  // the engine's only dynamic allocation, so no general allocator is needed.
  size_t pages = ((size_t)len + 0xFFFF) >> 16;
  size_t old_pages = __builtin_wasm_memory_grow(0, pages);
  if (old_pages == (size_t)-1) {
    return NULL;
  }
  wd_wad_buf = (uint8_t *)(old_pages << 16);
  wd_wad_len = len;
  return wd_wad_buf;
}

const uint8_t *wd_wad_data(void) { return wd_wad_buf; }
int wd_wad_size(void) { return wd_wad_len; }

// Explicit engine entry point. Replaces the implicit _start -> main ->
// D_DoomMain path: the host stages flags + WAD, then calls this.
void EXPORT(wasmdoom_init)(void) {
  wd_build_argv();
  D_DoomMain();
  I_InitGraphics();
}

void EXPORT(wasmdoom_tick)(void) {
  I_AdvanceTime();

  while (event_head != event_tail) {
    event_t ev = event_buf[event_head++];
    event_head %= EVENTBUF_CAP;

    D_PostEvent(&ev);
  }

  D_DoomLoopTick();
}

uint8_t *EXPORT(wasmdoom_events_ptr)(void) { return event_buffer_ptr(); }
int EXPORT(wasmdoom_events_len)(void) { return event_buffer_len(); }
void EXPORT(wasmdoom_events_clear)(void) { event_buffer_clear(); }

// Save install: host writes a save's bytes directly into a slot's buffer
// (save_slot_data_ptr), then calls wasmdoom_save_commit(slot, data_len) to
// commit the length. The slot number is the save's identity; the engine's
// "doomsav<N>.dsg" filename is derived from it inside the store.
uint8_t *EXPORT(wasmdoom_save_slot_ptr)(int slot) {
  return save_slot_data_ptr(slot);
}
int EXPORT(wasmdoom_save_commit)(int slot, int data_len) {
  return save_slot_commit(slot, data_len);
}

void EXPORT(wasmdoom_keydown)(int keyCode) {
  evtype_t type = (keyCode & WASMDOOM_TYPECHAR_FLAG) ? ev_typechar : ev_keydown;
  int data1 = keyCode & ~WASMDOOM_TYPECHAR_FLAG;
  event_buf[event_tail] = (event_t){.type = type, .data1 = data1};
  event_tail++;
  event_tail %= EVENTBUF_CAP;
}

void EXPORT(wasmdoom_keyup)(int keyCode) {
  event_buf[event_tail] = (event_t){.type = ev_keyup, .data1 = keyCode};
  event_tail++;
  event_tail %= EVENTBUF_CAP;
}

void EXPORT(wasmdoom_send_mouse)(int buttons, int dx, int dy) {
  event_buf[event_tail] =
      (event_t){.type = ev_mouse, .data1 = buttons, .data2 = dx, .data3 = dy};
  event_tail++;
  event_tail %= EVENTBUF_CAP;
}

uint8_t *EXPORT(wasmdoom_get_framebuffer)(void) { return screens[0]; }

extern byte doom_palette[768];

// 768-byte RGB palette (256 entries) the host applies to the 8bpp framebuffer.
uint8_t *EXPORT(wasmdoom_get_palette)(void) { return doom_palette; }

// --- Player -----------------------------------------------------------------
// One player_t packed into the documented wd_player_t wire layout, same
// snapshot approach as the mobjs below (one buffer the host reads over linear
// memory, rather than ~30 per-field boundary crossings). See wd_iface.h.
_Static_assert(NUMAMMO == WD_NUMAMMO, "wd_player_t ammo size drift");
_Static_assert(NUMPOWERS == WD_NUMPOWERS, "wd_player_t powers size drift");

static wd_player_t wd_player_buf;

// Snapshot viewplayer into wd_player_buf and return 1, or return 0 if there is
// no player (e.g. the title screen). The mo-derived fields stay 0 when
// viewplayer->mo is null. Call before reading wasmdoom_player_snapshot_ptr().
int EXPORT(wasmdoom_snapshot_player)(void) {
  if (!viewplayer) {
    return 0;
  }
  wd_player_buf = (wd_player_t){
      .health = viewplayer->health,
      .armorpoints = viewplayer->armorpoints,
      .armortype = viewplayer->armortype,
      .readyweapon = viewplayer->readyweapon,
      .pendingweapon = viewplayer->pendingweapon,
      .backpack = viewplayer->backpack,
      .cheats = viewplayer->cheats,
      .killcount = viewplayer->killcount,
      .itemcount = viewplayer->itemcount,
      .secretcount = viewplayer->secretcount,
      .playerstate = viewplayer->playerstate,
      .damagecount = viewplayer->damagecount,
      .bonuscount = viewplayer->bonuscount,
      .attackdown = viewplayer->attackdown,
      .usedown = viewplayer->usedown,
      .refire = viewplayer->refire,
  };
  // Boolean arrays packed into one int: bit i mirrors the enum value i (same
  // shape as the cheats flags). Safe only while the count is <= 32 bits.
  for (int i = 0; i < NUMCARDS; i++) {
    wd_player_buf.cards |= (viewplayer->cards[i] ? 1 : 0) << i;
  }
  for (int i = 0; i < NUMWEAPONS; i++) {
    wd_player_buf.weapons |= (viewplayer->weaponowned[i] ? 1 : 0) << i;
  }
  for (int i = 0; i < NUMAMMO; i++) {
    wd_player_buf.ammo[i] = viewplayer->ammo[i];
    wd_player_buf.maxammo[i] = viewplayer->maxammo[i];
  }
  for (int i = 0; i < NUMPOWERS; i++) {
    wd_player_buf.powers[i] = viewplayer->powers[i];
  }
  if (viewplayer->mo) {
    wd_player_buf.x = viewplayer->mo->x;
    wd_player_buf.y = viewplayer->mo->y;
    wd_player_buf.z = viewplayer->mo->z;
    wd_player_buf.angle = viewplayer->mo->angle;
    wd_player_buf.momx = viewplayer->mo->momx;
    wd_player_buf.momy = viewplayer->mo->momy;
    wd_player_buf.momz = viewplayer->mo->momz;
  }
  // Engine-computed HUD face index; read-only, no dirty bit, never written
  // back.
  wd_player_buf.faceindex = ST_GetFaceIndex();
  return 1;
}

// Pointer to the wd_player_t filled by the most recent
// wasmdoom_snapshot_player().
uint8_t *EXPORT(wasmdoom_player_snapshot_ptr)(void) {
  return (uint8_t *)&wd_player_buf;
}

// Write host-overridden fields back into viewplayer. The host snapshots first
// (so untouched fields keep their current values), edits wd_player_buf in
// linear memory, sets the matching WD_PF_* bits in .dirty, then calls this --
// with no intervening tick. Only dirtied fields are applied; .dirty is cleared
// on return. Returns 0 if there is no player. cards/weapons are unpacked from
// their bitmasks (inverse of the snapshot pack); WD_PF_POS relinks the mobj in
// the blockmap via P_Unset/SetThingPosition rather than assigning x/y directly.
// Note: setting pendingweapon triggers the animated weapon switch; writing
// readyweapon directly mid-animation may look wrong.
int EXPORT(wasmdoom_apply_player)(void) {
  if (!viewplayer) {
    return 0;
  }
  uint32_t d = wd_player_buf.dirty;
  if (d & WD_PF_HEALTH) {
    viewplayer->health = wd_player_buf.health;
  }
  if (d & WD_PF_ARMORPOINTS) {
    viewplayer->armorpoints = wd_player_buf.armorpoints;
  }
  if (d & WD_PF_ARMORTYPE) {
    viewplayer->armortype = wd_player_buf.armortype;
  }
  if (d & WD_PF_READYWEAPON) {
    viewplayer->readyweapon = wd_player_buf.readyweapon;
  }
  if (d & WD_PF_PENDINGWEAPON) {
    viewplayer->pendingweapon = wd_player_buf.pendingweapon;
  }
  if (d & WD_PF_BACKPACK) {
    viewplayer->backpack = wd_player_buf.backpack;
  }
  if (d & WD_PF_CHEATS) {
    viewplayer->cheats = wd_player_buf.cheats;
  }
  if (d & WD_PF_KILLCOUNT) {
    viewplayer->killcount = wd_player_buf.killcount;
  }
  if (d & WD_PF_ITEMCOUNT) {
    viewplayer->itemcount = wd_player_buf.itemcount;
  }
  if (d & WD_PF_SECRETCOUNT) {
    viewplayer->secretcount = wd_player_buf.secretcount;
  }
  if (d & WD_PF_PLAYERSTATE) {
    viewplayer->playerstate = wd_player_buf.playerstate;
  }
  if (d & WD_PF_DAMAGECOUNT) {
    viewplayer->damagecount = wd_player_buf.damagecount;
  }
  if (d & WD_PF_BONUSCOUNT) {
    viewplayer->bonuscount = wd_player_buf.bonuscount;
  }
  if (d & WD_PF_ATTACKDOWN) {
    viewplayer->attackdown = wd_player_buf.attackdown;
  }
  if (d & WD_PF_USEDOWN) {
    viewplayer->usedown = wd_player_buf.usedown;
  }
  if (d & WD_PF_REFIRE) {
    viewplayer->refire = wd_player_buf.refire;
  }
  if (d & WD_PF_CARDS) {
    for (int i = 0; i < NUMCARDS; i++) {
      viewplayer->cards[i] = (wd_player_buf.cards >> i) & 1;
    }
  }
  if (d & WD_PF_WEAPONS) {
    for (int i = 0; i < NUMWEAPONS; i++) {
      viewplayer->weaponowned[i] = (wd_player_buf.weapons >> i) & 1;
    }
  }
  if (d & WD_PF_AMMO) {
    for (int i = 0; i < NUMAMMO; i++) {
      viewplayer->ammo[i] = wd_player_buf.ammo[i];
    }
  }
  if (d & WD_PF_MAXAMMO) {
    for (int i = 0; i < NUMAMMO; i++) {
      viewplayer->maxammo[i] = wd_player_buf.maxammo[i];
    }
  }
  if (d & WD_PF_POWERS) {
    for (int i = 0; i < NUMPOWERS; i++) {
      viewplayer->powers[i] = wd_player_buf.powers[i];
    }
  }
  if ((d & WD_PF_POS) && viewplayer->mo) {
    mobj_t *mo = viewplayer->mo;
    P_UnsetThingPosition(mo);
    mo->x = wd_player_buf.x;
    mo->y = wd_player_buf.y;
    mo->z = wd_player_buf.z;
    P_SetThingPosition(mo);
    mo->angle = wd_player_buf.angle;
    mo->momx = wd_player_buf.momx;
    mo->momy = wd_player_buf.momy;
    mo->momz = wd_player_buf.momz;
  }
  wd_player_buf.dirty = 0;
  return 1;
}

// --- Settings ---------------------------------------------------------------
// Global config + read-only game state (which map/skill we're on) packed into
// one wd_settings_t, same snapshot/apply shape as the player. The game-state
// fields are read-only context; only the config fields carry dirty bits, and on
// apply each routes through the engine's real setter so side effects (volume
// recompute, view resize) still happen. See wd_iface.h.
static wd_settings_t wd_settings_buf;

// Snapshot the current settings + game state into wd_settings_buf. Unlike the
// player there is no "missing" case -- the globals always exist -- so there is
// no return flag. Call before reading wasmdoom_settings_ptr().
void EXPORT(wasmdoom_snapshot_settings)(void) {
  extern int saveStringEnter; // m_menu.c: true while typing a save name
  wd_settings_buf = (wd_settings_t){
      .gamestate = gamestate,
      .gameepisode = gameepisode,
      .gamemap = gamemap,
      .gameskill = gameskill,
      .sfx_volume = snd_SfxVolume,
      .music_volume = snd_MusicVolume,
      .mouse_sensitivity = mouseSensitivity,
      .show_messages = showMessages,
      .screenblocks = screenblocks,
      .detail_level = detailLevel,
      .menuactive = menuactive,
      .save_string_enter = saveStringEnter,
  };
}

// Pointer to the wd_settings_t filled by the most recent
// wasmdoom_snapshot_settings().
uint8_t *EXPORT(wasmdoom_settings_ptr)(void) {
  return (uint8_t *)&wd_settings_buf;
}

// Write host-overridden config back into the engine. The host snapshots first,
// edits wd_settings_buf, sets the matching WD_SF_* bits in .dirty, then calls
// this. Only dirtied fields are applied; .dirty is cleared on return. Each
// field goes through its engine setter rather than a raw store so side effects
// fire. The read-only game-state fields have no dirty bit and are never written
// (changing the map/skill is a level-load action, out of scope here).
void EXPORT(wasmdoom_apply_settings)(void) {
  uint32_t d = wd_settings_buf.dirty;
  if (d & WD_SF_SFX_VOLUME) {
    S_SetSfxVolume(wd_settings_buf.sfx_volume);
  }
  if (d & WD_SF_MUSIC_VOLUME) {
    S_SetMusicVolume(wd_settings_buf.music_volume);
  }
  if (d & WD_SF_MOUSE_SENSITIVITY) {
    mouseSensitivity = wd_settings_buf.mouse_sensitivity;
  }
  if (d & WD_SF_SHOW_MESSAGES) {
    showMessages = wd_settings_buf.show_messages;
  }
  if (d & WD_SF_VIEWSIZE) {
    // screenSize is the options-menu's temp display variable for the view-size
    // thermo; it's normally only synced from screenblocks in M_Init /
    // M_SizeDisplay. Clamp to the same range M_SizeDisplay enforces (screenSize
    // 0-8, i.e. screenblocks 3-11) and keep screenSize in step so the menu
    // reflects host-applied changes.
    extern int screenSize;
    screenblocks = wd_settings_buf.screenblocks;
    if (screenblocks < 3) {
      screenblocks = 3;
    } else if (screenblocks > 11) {
      screenblocks = 11;
    }
    screenSize = screenblocks - 3;

    detailLevel = wd_settings_buf.detail_level;
    R_SetViewSize(screenblocks, detailLevel);
  }
  wd_settings_buf.dirty = 0;
}

// --- Thinkers / mobjs -------------------------------------------------------
// Thinkers are a heterogeneous doubly-linked list (thinkercap sentinel); only
// the ones running P_MobjThinker are map objects. Rather than per-field getters
// (count * fields boundary crossings per tick), pack the mobjs we care about
// into one buffer the host reads as a flat wd_mobj_t[] over linear memory. See
// wd_iface.h for the documented layout.
#define WD_MOBJ_CAP 4096 // worst-case mobjs/level; extras are dropped
static wd_mobj_t wd_mobj_buf[WD_MOBJ_CAP];

// Snapshots the current mobjs into wd_mobj_buf and returns the count. Call this
// each time before reading wasmdoom_map_objects_ptr().
int EXPORT(wasmdoom_snapshot_map_objects)(void) {
  // Off a level (e.g. title/menu/intermission) the thinker list is not set up:
  // thinkercap is zero-initialized, so walking it runs off into linear memory
  // and never reaches the sentinel. Mirror wasmdoom_snapshot_player's guard.
  if (gamestate != GS_LEVEL) {
    return 0;
  }
  int n = 0;
  for (thinker_t *th = thinkercap.next; th != &thinkercap && n < WD_MOBJ_CAP;
       th = th->next) {
    if (th->function.acp1 != (actionf_p1)P_MobjThinker) {
      continue;
    }
    mobj_t *mo = (mobj_t *)th;
    wd_mobj_buf[n] = (wd_mobj_t){.x = mo->x,
                                 .y = mo->y,
                                 .z = mo->z,
                                 .angle = mo->angle,
                                 .type = mo->type,
                                 .health = mo->health,
                                 .flags = mo->flags};
    n++;
  }
  return n;
}

// Pointer to the wd_mobj_t[] filled by the most recent
// wasmdoom_snapshot_map_objects().
uint8_t *EXPORT(wasmdoom_map_objects_ptr)(void) {
  return (uint8_t *)wd_mobj_buf;
}

// Write host-overridden mobj fields back into the live thinker list. Re-walks
// the list in the same order as the snapshot, so record n maps to the same mobj
// the host read at index n -- valid only with no intervening tick. For each
// record with dirty bits set, applies the marked WD_MF_* fields and clears that
// record's .dirty. WD_MF_POS relinks the mobj in the blockmap via
// P_Unset/SetThingPosition. Returns the mobj count (same as the snapshot).
int EXPORT(wasmdoom_apply_map_objects)(void) {
  // Same guard as the snapshot: no thinker list off a level. The host walks the
  // list in the same order it snapshotted, so an empty snapshot means nothing
  // to apply here either.
  if (gamestate != GS_LEVEL) {
    return 0;
  }
  int n = 0;
  for (thinker_t *th = thinkercap.next; th != &thinkercap && n < WD_MOBJ_CAP;
       th = th->next) {
    if (th->function.acp1 != (actionf_p1)P_MobjThinker) {
      continue;
    }
    mobj_t *mo = (mobj_t *)th;
    uint32_t d = wd_mobj_buf[n].dirty;
    if (d) {
      if (d & WD_MF_HEALTH) {
        mo->health = wd_mobj_buf[n].health;
      }
      if (d & WD_MF_FLAGS) {
        mo->flags = wd_mobj_buf[n].flags;
      }
      if (d & WD_MF_TYPE) {
        mo->type = wd_mobj_buf[n].type;
      }
      if (d & WD_MF_POS) {
        P_UnsetThingPosition(mo);
        mo->x = wd_mobj_buf[n].x;
        mo->y = wd_mobj_buf[n].y;
        mo->z = wd_mobj_buf[n].z;
        P_SetThingPosition(mo);
        mo->angle = wd_mobj_buf[n].angle;
      }
      wd_mobj_buf[n].dirty = 0;
    }
    n++;
  }
  return n;
}
