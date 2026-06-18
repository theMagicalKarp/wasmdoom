// Single-tick linear append buffer for outbound events.
//
// The C side appends typed records during wasmdoom_init / wasmdoom_tick. The
// host drains [0, event_buffer_len()) after each call and then resets the
// cursor with event_buffer_clear(). No ring, no wrap-around — the consumer
// catches up every tick.

#include <stdint.h>

#include "wd_events.h"

// 8 KiB is comfortable for the heaviest known tick (level start: GENMIDI set,
// song register, a few SFX). Revisit if a record is ever dropped.
#define EVENT_BUFFER_CAP 8192

static uint8_t buffer[EVENT_BUFFER_CAP];
static int cursor = 0;

uint8_t *event_buffer_ptr(void) { return buffer; }
int event_buffer_len(void) { return cursor; }
void event_buffer_clear(void) { cursor = 0; }

// Reserve `len` bytes for the next record (header + payload). Returns a
// pointer into the buffer, or NULL on overflow.
static uint8_t *reserve(int len) {
  if (cursor + len > EVENT_BUFFER_CAP) {
    // TODO: Handle overflow
    return NULL;
  }
  uint8_t *out = buffer + cursor;
  cursor += len;
  return out;
}

static void write_u16(uint8_t *p, uint16_t v) {
  p[0] = (uint8_t)(v & 0xFF);
  p[1] = (uint8_t)((v >> 8) & 0xFF);
}

static void write_u32(uint8_t *p, uint32_t v) {
  p[0] = (uint8_t)(v & 0xFF);
  p[1] = (uint8_t)((v >> 8) & 0xFF);
  p[2] = (uint8_t)((v >> 16) & 0xFF);
  p[3] = (uint8_t)((v >> 24) & 0xFF);
}

static uint8_t *begin_record(uint16_t tag, uint16_t payload_len) {
  uint8_t *rec = reserve(4 + payload_len);
  if (!rec) {
    return NULL;
  }
  write_u16(rec, tag);
  write_u16(rec + 2, payload_len);
  return rec + 4;
}

void emit_log(uint16_t tag, const char *msg, int32_t len) {
  if (len < 0) {
    len = 0;
  }
  if (len > EV_LOG_MAX) {
    len = EV_LOG_MAX;
  }
  uint8_t *p = begin_record(tag, (uint16_t)len);
  if (!p) {
    return;
  }
  memcpy(p, msg, (size_t)len);
}

void emit_sound_start(int32_t handle, int32_t sfx_id, const uint8_t *data,
                      int32_t data_len, int32_t vol, int32_t sep,
                      int32_t pitch) {
  uint8_t *p = begin_record(EV_SOUND_START, 28);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
  write_u32(p + 4, (uint32_t)sfx_id);
  write_u32(p + 8, (uint32_t)(uintptr_t)data);
  write_u32(p + 12, (uint32_t)data_len);
  write_u32(p + 16, (uint32_t)vol);
  write_u32(p + 20, (uint32_t)sep);
  write_u32(p + 24, (uint32_t)pitch);
}

void emit_sound_stop(int32_t handle) {
  uint8_t *p = begin_record(EV_SOUND_STOP, 4);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
}

void emit_sound_update(int32_t handle, int32_t vol, int32_t sep,
                       int32_t pitch) {
  uint8_t *p = begin_record(EV_SOUND_UPDATE, 16);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
  write_u32(p + 4, (uint32_t)vol);
  write_u32(p + 8, (uint32_t)sep);
  write_u32(p + 12, (uint32_t)pitch);
}

void emit_music_set_genmidi(const uint8_t *data, int32_t len) {
  uint8_t *p = begin_record(EV_MUSIC_SET_GENMIDI, 8);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)(uintptr_t)data);
  write_u32(p + 4, (uint32_t)len);
}

void emit_music_register(int32_t handle, const uint8_t *data, int32_t len) {
  uint8_t *p = begin_record(EV_MUSIC_REGISTER, 12);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
  write_u32(p + 4, (uint32_t)(uintptr_t)data);
  write_u32(p + 8, (uint32_t)len);
}

void emit_music_play(int32_t handle, int32_t looping) {
  uint8_t *p = begin_record(EV_MUSIC_PLAY, 8);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
  write_u32(p + 4, (uint32_t)looping);
}

void emit_music_pause(int32_t handle) {
  uint8_t *p = begin_record(EV_MUSIC_PAUSE, 4);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
}

void emit_music_resume(int32_t handle) {
  uint8_t *p = begin_record(EV_MUSIC_RESUME, 4);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
}

void emit_music_stop(int32_t handle) {
  uint8_t *p = begin_record(EV_MUSIC_STOP, 4);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
}

void emit_music_unregister(int32_t handle) {
  uint8_t *p = begin_record(EV_MUSIC_UNREGISTER, 4);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
}

void emit_music_set_volume(int32_t volume) {
  uint8_t *p = begin_record(EV_MUSIC_SET_VOLUME, 4);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)volume);
}

void emit_save_written(int32_t slot, const uint8_t *data, int32_t data_len) {
  uint8_t *p = begin_record(EV_SAVE_WRITTEN, 12);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)slot);
  write_u32(p + 4, (uint32_t)(uintptr_t)data);
  write_u32(p + 8, (uint32_t)data_len);
}

// --- Gameplay events --------------------------------------------------------
void emit_game_state_changed(uint32_t old_state, uint32_t new_state) {
  uint8_t *p = begin_record(EV_GAME_STATE_CHANGED, 8);
  if (!p) {
    return;
  }
  write_u32(p, old_state);
  write_u32(p + 4, new_state);
}

void emit_level_loaded(uint32_t episode, uint32_t map, uint32_t skill) {
  uint8_t *p = begin_record(EV_LEVEL_LOADED, 12);
  if (!p) {
    return;
  }
  write_u32(p, episode);
  write_u32(p + 4, map);
  write_u32(p + 8, skill);
}

void emit_level_completed(uint32_t episode, uint32_t map, uint32_t secret_exit,
                          uint32_t leveltime, uint32_t kills, uint32_t maxkills,
                          uint32_t items, uint32_t maxitems, uint32_t secrets,
                          uint32_t maxsecret) {
  uint8_t *p = begin_record(EV_LEVEL_COMPLETED, 40);
  if (!p) {
    return;
  }
  write_u32(p, episode);
  write_u32(p + 4, map);
  write_u32(p + 8, secret_exit);
  write_u32(p + 12, leveltime);
  write_u32(p + 16, kills);
  write_u32(p + 20, maxkills);
  write_u32(p + 24, items);
  write_u32(p + 28, maxitems);
  write_u32(p + 32, secrets);
  write_u32(p + 36, maxsecret);
}

void emit_level_exit_triggered(uint32_t secret) {
  uint8_t *p = begin_record(EV_LEVEL_EXIT_TRIGGERED, 4);
  if (!p) {
    return;
  }
  write_u32(p, secret);
}

void emit_player_spawned(void) { begin_record(EV_PLAYER_SPAWNED, 0); }

void emit_player_died(uint32_t attacker_type) {
  uint8_t *p = begin_record(EV_PLAYER_DIED, 4);
  if (!p) {
    return;
  }
  write_u32(p, attacker_type);
}

void emit_player_respawned(void) { begin_record(EV_PLAYER_RESPAWNED, 0); }

void emit_weapon_fired(uint32_t weapon, uint32_t ammo_type, int32_t ammo_left) {
  uint8_t *p = begin_record(EV_WEAPON_FIRED, 12);
  if (!p) {
    return;
  }
  write_u32(p, weapon);
  write_u32(p + 4, ammo_type);
  write_u32(p + 8, (uint32_t)ammo_left);
}

void emit_weapon_changed(uint32_t from, uint32_t to) {
  uint8_t *p = begin_record(EV_WEAPON_CHANGED, 8);
  if (!p) {
    return;
  }
  write_u32(p, from);
  write_u32(p + 4, to);
}

void emit_player_damaged(int32_t damage, int32_t health, int32_t armor,
                         uint32_t attacker_type) {
  uint8_t *p = begin_record(EV_PLAYER_DAMAGED, 16);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)damage);
  write_u32(p + 4, (uint32_t)health);
  write_u32(p + 8, (uint32_t)armor);
  write_u32(p + 12, attacker_type);
}

void emit_enemy_killed(uint32_t mobj_type, int32_t x, int32_t y,
                       uint32_t by_player) {
  uint8_t *p = begin_record(EV_ENEMY_KILLED, 16);
  if (!p) {
    return;
  }
  write_u32(p, mobj_type);
  write_u32(p + 4, (uint32_t)x);
  write_u32(p + 8, (uint32_t)y);
  write_u32(p + 12, by_player);
}

void emit_explosion(int32_t x, int32_t y, int32_t damage) {
  uint8_t *p = begin_record(EV_EXPLOSION, 12);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)x);
  write_u32(p + 4, (uint32_t)y);
  write_u32(p + 8, (uint32_t)damage);
}

void emit_enemy_awakened(uint32_t mobj_type) {
  uint8_t *p = begin_record(EV_ENEMY_AWAKENED, 4);
  if (!p) {
    return;
  }
  write_u32(p, mobj_type);
}

void emit_enemy_damaged(uint32_t mobj_type, int32_t damage,
                        int32_t health_left) {
  uint8_t *p = begin_record(EV_ENEMY_DAMAGED, 12);
  if (!p) {
    return;
  }
  write_u32(p, mobj_type);
  write_u32(p + 4, (uint32_t)damage);
  write_u32(p + 8, (uint32_t)health_left);
}

void emit_item_picked_up(uint32_t item_id, uint32_t message_id) {
  uint8_t *p = begin_record(EV_ITEM_PICKED_UP, 8);
  if (!p) {
    return;
  }
  write_u32(p, item_id);
  write_u32(p + 4, message_id);
}

void emit_key_obtained(uint32_t card) {
  uint8_t *p = begin_record(EV_KEY_OBTAINED, 4);
  if (!p) {
    return;
  }
  write_u32(p, card);
}

void emit_secret_found(uint32_t secret_count, int32_t x, int32_t y) {
  uint8_t *p = begin_record(EV_SECRET_FOUND, 12);
  if (!p) {
    return;
  }
  write_u32(p, secret_count);
  write_u32(p + 4, (uint32_t)x);
  write_u32(p + 8, (uint32_t)y);
}

void emit_locked_door_blocked(uint32_t required_key) {
  uint8_t *p = begin_record(EV_LOCKED_DOOR_BLOCKED, 4);
  if (!p) {
    return;
  }
  write_u32(p, required_key);
}

void emit_door(uint32_t sector_idx, uint32_t type, int32_t direction) {
  uint8_t *p = begin_record(EV_DOOR, 12);
  if (!p) {
    return;
  }
  write_u32(p, sector_idx);
  write_u32(p + 4, type);
  write_u32(p + 8, (uint32_t)direction);
}

void emit_switch_activated(uint32_t line_idx) {
  uint8_t *p = begin_record(EV_SWITCH_ACTIVATED, 4);
  if (!p) {
    return;
  }
  write_u32(p, line_idx);
}

void emit_teleport(uint32_t mobj_type, int32_t x, int32_t y) {
  uint8_t *p = begin_record(EV_TELEPORT, 12);
  if (!p) {
    return;
  }
  write_u32(p, mobj_type);
  write_u32(p + 4, (uint32_t)x);
  write_u32(p + 8, (uint32_t)y);
}

void emit_platform(uint32_t sector_idx, uint32_t type) {
  uint8_t *p = begin_record(EV_PLATFORM, 8);
  if (!p) {
    return;
  }
  write_u32(p, sector_idx);
  write_u32(p + 4, type);
}

void emit_hud_message(const char *msg, int32_t len) {
  if (len < 0) {
    len = 0;
  }
  if (len > EV_LOG_MAX) {
    len = EV_LOG_MAX;
  }
  uint8_t *p = begin_record(EV_HUD_MESSAGE, (uint16_t)len);
  if (!p) {
    return;
  }
  memcpy(p, msg, (size_t)len);
}

void emit_face_changed(uint32_t faceindex, uint32_t priority) {
  uint8_t *p = begin_record(EV_FACE_CHANGED, 8);
  if (!p) {
    return;
  }
  write_u32(p, faceindex);
  write_u32(p + 4, priority);
}

void emit_cheat_activated(uint32_t cheat, uint32_t param) {
  uint8_t *p = begin_record(EV_CHEAT_ACTIVATED, 8);
  if (!p) {
    return;
  }
  write_u32(p, cheat);
  write_u32(p + 4, param);
}

void emit_settings_changed(uint32_t dirty_mask) {
  uint8_t *p = begin_record(EV_SETTINGS_CHANGED, 4);
  if (!p) {
    return;
  }
  write_u32(p, dirty_mask);
}
