#ifndef __WASMDOOM__
#define __WASMDOOM__

#include <stdint.h>

// Sentinel bit on the int passed to wasmdoom_keydown: when set, the low byte
// is treated as a typed ASCII character (ev_typechar) instead of a game key
// (ev_keydown). All doom keycodes fit in 0–0xFF, so this bit is free.
#define WASMDOOM_TYPECHAR_FLAG 0x100

#define IMPORT(mod, name)                                                      \
  __attribute__((import_module(#mod), import_name(#name)))

IMPORT(doom_host, wasmdoom_error)
extern void wasmdoom_error(const char *message, int32_t length);

IMPORT(doom_host, wasmdoom_draw)
extern void wasmdoom_draw();

IMPORT(doom_host, wasmdoom_sound_start)
extern void wasmdoom_sound_start(int handle, int sfx_id, const uint8_t *data,
                                 int data_len, int vol, int sep, int pitch);

IMPORT(doom_host, wasmdoom_sound_stop)
extern void wasmdoom_sound_stop(int handle);

IMPORT(doom_host, wasmdoom_sound_update)
extern void wasmdoom_sound_update(int handle, int vol, int sep, int pitch);

IMPORT(doom_host, wasmdoom_sound_is_playing)
extern int wasmdoom_sound_is_playing(int handle);

IMPORT(doom_host, wasmdoom_music_set_genmidi)
extern void wasmdoom_music_set_genmidi(const uint8_t *data, int len);

IMPORT(doom_host, wasmdoom_music_register)
extern void wasmdoom_music_register(int handle, const uint8_t *data, int len);

IMPORT(doom_host, wasmdoom_music_play)
extern void wasmdoom_music_play(int handle, int looping);

IMPORT(doom_host, wasmdoom_music_pause)
extern void wasmdoom_music_pause(int handle);

IMPORT(doom_host, wasmdoom_music_resume)
extern void wasmdoom_music_resume(int handle);

IMPORT(doom_host, wasmdoom_music_stop)
extern void wasmdoom_music_stop(int handle);

IMPORT(doom_host, wasmdoom_music_unregister)
extern void wasmdoom_music_unregister(int handle);

IMPORT(doom_host, wasmdoom_music_set_volume)
extern void wasmdoom_music_set_volume(int volume);

IMPORT(doom_host, wasmdoom_save_game)
extern int wasmdoom_save_game(char const *name, const uint8_t *source, int len);

IMPORT(doom_host, wasmdoom_load_game)
// Returns size of saved data in bytes, or -1 if no save exists.
// If dest is non-NULL, copies up to max_len bytes into dest.
extern int wasmdoom_load_game(char const *name, uint8_t *dest, int max_len);

#endif
