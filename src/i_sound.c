//-----------------------------------------------------------------------------
//
// Copyright (C) 1993-1996 by id Software, Inc.
//
// This source is available for distribution and/or modification
// only under the terms of the DOOM Source Code License as
// published by id Software. All rights reserved.
//
// The source is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// FITNESS FOR A PARTICULAR PURPOSE. See the DOOM Source Code License
// for more details.
//
// DESCRIPTION:
//	System interface for sound.
//
//-----------------------------------------------------------------------------

#include <stdint.h>

#include "z_zone.h"

#include "i_sound.h"
#include "sounds.h"
#include "w_wad.h"
#include "wd_events.h"

// Opaque play handles; 0 is reserved to mean "failed to start".
static int next_handle = 1;

// Voice lifetime is tracked on the C side so I_SoundIsPlaying needs no host
// round-trip. DMX lumps have a known sample count (lump_len - 8 bytes of
// header) and play at an effective 11025 Hz, so a voice's end tick is
// deterministic from data we already have.
//
// Slot is keyed by handle % MAX_VOICES; collisions just overwrite the older
// voice's bookkeeping. Doom's numChannels stays well under MAX_VOICES, and a
// stale handle is harmless — find_voice() ignores any slot whose recorded
// handle doesn't match.
#define DMX_HEADER_BYTES 8
#define DMX_SAMPLE_RATE 11025
#define MAX_VOICES 32

struct voice_meta {
  int handle;
  int end_tick;
  int stopped;
};

static struct voice_meta voices[MAX_VOICES];

static struct voice_meta *voice_slot(int handle) {
  return &voices[(unsigned)handle % MAX_VOICES];
}

static struct voice_meta *find_voice(int handle) {
  struct voice_meta *slot = voice_slot(handle);
  return slot->handle == handle ? slot : 0;
}

//
// SFX API
//
void I_SetChannels() {}

void I_SetSfxVolume(int volume) {}

void I_SetMusicVolume(int volume) { emit_music_set_volume(volume); }

//
// Retrieve the raw data lump index
//  for a given SFX name.
//
int I_GetSfxLumpNum(sfxinfo_t *sfx) {
  char namebuf[16];
  snprintf(namebuf, sizeof(namebuf), "ds%s", sfx->name);
  return W_GetNumForName(namebuf);
}

int I_StartSound(int id, int vol, int sep, int pitch, int priority) {
  sfxinfo_t *sfx = &S_sfx[id];
  if (sfx->lumpnum < 0) {
    sfx->lumpnum = I_GetSfxLumpNum(sfx);
  }

  void *data = W_CacheLumpNum(sfx->lumpnum, PU_STATIC);
  int len = W_LumpLength(sfx->lumpnum);

  int handle = next_handle++;
  if (next_handle <= 0) {
    next_handle = 1;
  }

  int samples = len > DMX_HEADER_BYTES ? len - DMX_HEADER_BYTES : 0;
  int effective_pitch = pitch < 1 ? 1 : pitch;
  int effective_samples = (int)((long long)samples * 128 / effective_pitch);
  int duration_ticks =
      (effective_samples * TICRATE + DMX_SAMPLE_RATE - 1) / DMX_SAMPLE_RATE;

  struct voice_meta *slot = voice_slot(handle);
  slot->handle = handle;
  slot->end_tick = I_GetTime() + duration_ticks;
  slot->stopped = 0;

  emit_sound_start(handle, id, (const uint8_t *)data, len, vol, sep, pitch);
  return handle;
}

void I_StopSound(int handle) {
  struct voice_meta *slot = find_voice(handle);
  if (slot) {
    slot->stopped = 1;
  }
  emit_sound_stop(handle);
}

int I_SoundIsPlaying(int handle) {
  struct voice_meta *slot = find_voice(handle);
  if (!slot || slot->stopped) {
    return 0;
  }
  return I_GetTime() < slot->end_tick;
}

void I_UpdateSound(void) {}

void I_SubmitSound(void) {}

void I_UpdateSoundParams(int handle, int vol, int sep, int pitch) {
  emit_sound_update(handle, vol, sep, pitch);
}

void I_ShutdownSound(void) {}

void I_InitSound() { I_InitMusic(); }

//
// MUSIC API.
//
// Init/parsing of GENMIDI and the OPL3 chip live in the music wasm module
// (wasmdoom.music.wasm). This file just emits typed records into the outbound
// event buffer; the host drains them after each tick and feeds them to the
// music worklet.
static int next_music_handle = 1;

void I_InitMusic(void) {
  int lump = W_CheckNumForName("GENMIDI");
  if (lump >= 0) {
    void *data = W_CacheLumpNum(lump, PU_STATIC);
    emit_music_set_genmidi((const uint8_t *)data, W_LumpLength(lump));
  }
}
void I_ShutdownMusic(void) {}

int I_RegisterSong(void *data) {
  const uint8_t *p = data;
  // MUS header: scoreLen @4 (u16le), scoreStart @6 (u16le); total = start+len.
  int score_len = p[4] | (p[5] << 8);
  int score_start = p[6] | (p[7] << 8);
  int len = score_start + score_len;
  int handle = next_music_handle++;
  if (next_music_handle <= 0) {
    next_music_handle = 1;
  }
  emit_music_register(handle, p, len);
  return handle;
}

void I_PlaySong(int handle, int looping) { emit_music_play(handle, looping); }

void I_PauseSong(int handle) { emit_music_pause(handle); }

void I_ResumeSong(int handle) { emit_music_resume(handle); }

void I_StopSong(int handle) { emit_music_stop(handle); }

void I_UnRegisterSong(int handle) { emit_music_unregister(handle); }

// Is the song playing?
int I_QrySongPlaying(int handle) { return 0; }
