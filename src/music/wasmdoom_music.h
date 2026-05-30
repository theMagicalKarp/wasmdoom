// Public API of the music WASM module.
//
// The synth lives in its own wasm artifact (wasmdoom.music.wasm) so that any
// host can drive Doom's MUS playback by routing the eight `wasmdoom_music_*`
// imports the game declares into the corresponding exports below. Aside from
// memory, all state is file-static inside synth.c — there are no globals to
// be threaded through callers.
//
// Marshalling contract:
//   1. Host calls `wasmdoom_music_alloc(len)` to obtain a writable pointer
//      into wasm linear memory (a fixed staging buffer).
//   2. Host copies `len` bytes to that pointer.
//   3. Host calls `wasmdoom_music_set_genmidi` or `wasmdoom_music_register`
//      with the same pointer/length; the synth parses or copies the bytes
//      into its own internal slots, so the staging buffer can be reused by
//      the next call.
//
// Rendering: `wasmdoom_music_render(frames)` returns a pointer to an
// internal float32 buffer of length `2*frames` (interleaved stereo). Always
// succeeds — produces silence when no song is playing or before init.

#ifndef SYNTH_H
#define SYNTH_H

#include <stdint.h>

// 128 KB comfortably holds the largest stock id-WAD MUS lump (~72 KB) plus
// headroom; both buffers must clear it since the host stages a song's bytes
// before wasmdoom_music_register copies them into the song slot.
#define WASMDOOM_MUSIC_STAGE_SIZE (128 * 1024)
#define WASMDOOM_MUSIC_SONG_MAX_SIZE (128 * 1024)
#define WASMDOOM_MUSIC_MAX_RENDER_FRAMES 2048

void wasmdoom_music_init(int sample_rate);
uint8_t *wasmdoom_music_alloc(int len);
void wasmdoom_music_set_genmidi(const uint8_t *data, int len);
void wasmdoom_music_register(int handle, const uint8_t *data, int len);
void wasmdoom_music_play(int handle, int looping);
void wasmdoom_music_pause(int handle);
void wasmdoom_music_resume(int handle);
void wasmdoom_music_stop(int handle);
void wasmdoom_music_unregister(int handle);
void wasmdoom_music_set_volume(int volume);
const float *wasmdoom_music_render(int frames);

// Returns nonzero while a song is actively playing. A non-looping song clears
// this once its sequencer reaches the end (see wasmdoom_music_render); headless
// hosts use it to know when a rendered track is complete.
int wasmdoom_music_active(void);

#endif
