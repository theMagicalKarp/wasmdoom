#ifndef __WD_EVENTS_H__
#define __WD_EVENTS_H__

#include <stdint.h>

// Outbound event tags. Each record on the wire is a u16 tag, a u16 payload
// length, then payload bytes — all little-endian (wasm convention).
#define EV_ERROR 1
#define EV_SOUND_START 2
#define EV_SOUND_STOP 3
#define EV_SOUND_UPDATE 4
#define EV_MUSIC_SET_GENMIDI 5
#define EV_MUSIC_REGISTER 6
#define EV_MUSIC_PLAY 7
#define EV_MUSIC_PAUSE 8
#define EV_MUSIC_RESUME 9
#define EV_MUSIC_STOP 10
#define EV_MUSIC_UNREGISTER 11
#define EV_MUSIC_SET_VOLUME 12
#define EV_SAVE_WRITTEN 13

uint8_t *event_buffer_ptr(void);
int event_buffer_len(void);
void event_buffer_clear(void);

void emit_error(const char *msg, int32_t len);
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

#endif
