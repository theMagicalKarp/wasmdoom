#ifndef __WASMDOOM__
#define __WASMDOOM__

#include <stdint.h>

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

#endif
