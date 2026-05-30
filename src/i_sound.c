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
#include "wasmdoom.h"

#ifdef SNDSERV
FILE *sndserver = 0;
char *sndserver_filename = "./sndserver";
#endif

// Opaque play handles; 0 is reserved to mean "failed to start".
static int next_handle = 1;

//
// SFX API
//
void I_SetChannels() {}

void I_SetSfxVolume(int volume) {}

void I_SetMusicVolume(int volume) { wasmdoom_music_set_volume(volume); }

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

  wasmdoom_sound_start(handle, id, (const uint8_t *)data, len, vol, sep, pitch);
  return handle;
}

void I_StopSound(int handle) { wasmdoom_sound_stop(handle); }

int I_SoundIsPlaying(int handle) { return wasmdoom_sound_is_playing(handle); }

void I_UpdateSound(void) {}

void I_SubmitSound(void) {}

void I_UpdateSoundParams(int handle, int vol, int sep, int pitch) {
  wasmdoom_sound_update(handle, vol, sep, pitch);
}

void I_ShutdownSound(void) {}

void I_InitSound() { I_InitMusic(); }

//
// MUSIC API.
//
// Init/parsing of GENMIDI and the OPL3 chip live in the music wasm module
// (wasmdoom.music.wasm). This file only marshals bytes across the eight host
// imports declared in wasmdoom.h.
static int next_music_handle = 1;

void I_InitMusic(void) {
  int lump = W_CheckNumForName("GENMIDI");
  if (lump >= 0) {
    void *data = W_CacheLumpNum(lump, PU_STATIC);
    wasmdoom_music_set_genmidi((const uint8_t *)data, W_LumpLength(lump));
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
  wasmdoom_music_register(handle, p, len);
  return handle;
}

void I_PlaySong(int handle, int looping) {
  wasmdoom_music_play(handle, looping);
}

void I_PauseSong(int handle) { wasmdoom_music_pause(handle); }

void I_ResumeSong(int handle) { wasmdoom_music_resume(handle); }

void I_StopSong(int handle) { wasmdoom_music_stop(handle); }

void I_UnRegisterSong(int handle) { wasmdoom_music_unregister(handle); }

// Is the song playing?
int I_QrySongPlaying(int handle) { return 0; }
