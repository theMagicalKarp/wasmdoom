#ifndef __WD_EVENTS_H__
#define __WD_EVENTS_H__

#include <stdint.h>

// Outbound event tags. Each record on the wire is a u16 tag, a u16 payload
// length, then payload bytes — all little-endian (wasm convention).
// Infrastructure events occupy tags 1-39, grouped in bands of 10 by subsystem
// like the gameplay events below; tag 0 stays "no tag".

// Band 1 -- diagnostics / logging
#define EV_INFO 1
#define EV_WARNING 2
#define EV_ERROR 3

// Band 10 -- sound
#define EV_SOUND_START 10
#define EV_SOUND_STOP 11
#define EV_SOUND_UPDATE 12

// Band 20 -- music
#define EV_MUSIC_SET_GENMIDI 20
#define EV_MUSIC_REGISTER 21
#define EV_MUSIC_PLAY 22
#define EV_MUSIC_PAUSE 23
#define EV_MUSIC_RESUME 24
#define EV_MUSIC_STOP 25
#define EV_MUSIC_UNREGISTER 26
#define EV_MUSIC_SET_VOLUME 27

// Band 30 -- persistence
#define EV_SAVE_WRITTEN 30

// Gameplay events. Tags 40-99 are reserved for future infrastructure events;
// gameplay events start at 100, grouped in bands of 10 by category. These are
// hand-mirrored by EVENT / EVENT_SCHEMA in lib/wasmdoom-events.ts and must be
// kept in lockstep when adding tags.

// Band 100 -- game / session state
#define EV_GAME_STATE_CHANGED 100
#define EV_LEVEL_LOADED 101
#define EV_LEVEL_COMPLETED 102
#define EV_LEVEL_EXIT_TRIGGERED 103

// Band 110 -- player lifecycle
#define EV_PLAYER_SPAWNED 110
#define EV_PLAYER_DIED 111
#define EV_PLAYER_RESPAWNED 112

// Band 120 -- combat: player-originated
#define EV_WEAPON_FIRED 120
#define EV_WEAPON_CHANGED 121
#define EV_PLAYER_DAMAGED 122

// Band 130 -- combat: world
#define EV_ENEMY_KILLED 130
#define EV_EXPLOSION 131
#define EV_ENEMY_AWAKENED 132
#define EV_ENEMY_DAMAGED 133

// Band 140 -- pickups / inventory
#define EV_ITEM_PICKED_UP 140
#define EV_KEY_OBTAINED 141

// Band 150 -- progression / world mechanisms
#define EV_SECRET_FOUND 150
#define EV_LOCKED_DOOR_BLOCKED 160
#define EV_DOOR 161
#define EV_SWITCH_ACTIVATED 162
#define EV_TELEPORT 163
#define EV_PLATFORM 164

// Band 170 -- HUD / feedback / settings
#define EV_HUD_MESSAGE 170
#define EV_FACE_CHANGED 171
#define EV_CHEAT_ACTIVATED 172
#define EV_SETTINGS_CHANGED 180

// Cheat ids carried by EV_CHEAT_ACTIVATED. The `param` field's meaning depends
// on the cheat: for toggles (god, noclip) it is the new on/off state (1/0); for
// CHEAT_POWERUP it is the power index; for CHEAT_CHANGE_LEVEL it is map*100 +
// episode; otherwise it is 0.
#define CHEAT_GOD 0          // 'iddqd'
#define CHEAT_AMMONOKEY 1    // 'idfa'
#define CHEAT_AMMO 2         // 'idkfa'
#define CHEAT_MUSIC 3        // 'idmus'
#define CHEAT_NOCLIP 4       // 'idclip' / 'idspispopd'
#define CHEAT_POWERUP 5      // 'idbehold<x>'
#define CHEAT_BEHOLD 6       // 'idbehold' (menu)
#define CHEAT_CHOPPERS 7     // 'idchoppers'
#define CHEAT_MYPOS 8        // 'idmypos'
#define CHEAT_CHANGE_LEVEL 9 // 'idclev'

// Sentinel for "no attacker" in PLAYER_DIED / PLAYER_DAMAGED attackerType.
#define EV_ATTACKER_NONE 0xFFFFFFFFu

uint8_t *event_buffer_ptr(void);
int event_buffer_len(void);
void event_buffer_clear(void);

// Largest log message emit_log copies inline. payload_len is a u16 on the
// wire, and log lines are short; longer messages are truncated. Callers
// formatting into a local buffer should size it EV_LOG_MAX + 1 so their
// truncation point matches the sink's.
#define EV_LOG_MAX 512
// emit_log carries the message bytes inline in the payload, so multiple log
// records can coexist in one tick's buffer without aliasing a shared
// sender-side scratch buffer. tag is EV_ERROR/EV_INFO/EV_WARNING.
void emit_log(uint16_t tag, const char *msg, int32_t len);
void emit_sound_start(int32_t handle, int32_t sfx_id, const uint8_t *data,
                      int32_t data_len, int32_t vol, int32_t sep,
                      int32_t pitch);
void emit_sound_stop(int32_t handle);
void emit_sound_update(int32_t handle, int32_t vol, int32_t sep, int32_t pitch);
void emit_music_set_genmidi(const uint8_t *data, int32_t len);
void emit_music_register(int32_t handle, const uint8_t *data, int32_t len);
void emit_music_play(int32_t handle, int32_t looping);
void emit_music_pause(int32_t handle);
void emit_music_resume(int32_t handle);
void emit_music_stop(int32_t handle);
void emit_music_unregister(int32_t handle);
void emit_music_set_volume(int32_t volume);
void emit_save_written(int32_t slot, const uint8_t *data, int32_t data_len);

// --- Gameplay events --------------------------------------------------------
void emit_game_state_changed(uint32_t old_state, uint32_t new_state);
void emit_level_loaded(uint32_t episode, uint32_t map, uint32_t skill);
void emit_level_completed(uint32_t episode, uint32_t map, uint32_t secret_exit,
                          uint32_t leveltime, uint32_t kills, uint32_t maxkills,
                          uint32_t items, uint32_t maxitems, uint32_t secrets,
                          uint32_t maxsecret);
void emit_level_exit_triggered(uint32_t secret);
void emit_player_spawned(void);
void emit_player_died(uint32_t attacker_type);
void emit_player_respawned(void);
void emit_weapon_fired(uint32_t weapon, uint32_t ammo_type, int32_t ammo_left);
void emit_weapon_changed(uint32_t from, uint32_t to);
void emit_player_damaged(int32_t damage, int32_t health, int32_t armor,
                         uint32_t attacker_type);
void emit_enemy_killed(uint32_t mobj_type, int32_t x, int32_t y,
                       uint32_t by_player);
void emit_explosion(int32_t x, int32_t y, int32_t damage);
void emit_enemy_awakened(uint32_t mobj_type);
void emit_enemy_damaged(uint32_t mobj_type, int32_t damage,
                        int32_t health_left);
void emit_item_picked_up(uint32_t item_id, uint32_t message_id);
void emit_key_obtained(uint32_t card);
void emit_secret_found(uint32_t secret_count, int32_t x, int32_t y);
void emit_locked_door_blocked(uint32_t required_key);
void emit_door(uint32_t sector_idx, uint32_t type, int32_t direction);
void emit_switch_activated(uint32_t line_idx);
void emit_teleport(uint32_t mobj_type, int32_t x, int32_t y);
void emit_platform(uint32_t sector_idx, uint32_t type);
void emit_hud_message(const char *msg, int32_t len);
void emit_face_changed(uint32_t faceindex, uint32_t priority);
void emit_cheat_activated(uint32_t cheat, uint32_t param);
void emit_settings_changed(uint32_t dirty_mask);

#endif
