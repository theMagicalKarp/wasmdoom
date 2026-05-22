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
#include "i_system.h"
#include "m_argv.h"
#include "m_misc.h"
#include "w_wad.h"
#include "wasmdoom.h"

#include "doomdef.h"

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

void I_SetMusicVolume(int volume) {}

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

void I_InitSound() {}

//
// MUSIC API.
//
void I_InitMusic(void) {}
void I_ShutdownMusic(void) {}

void I_PlaySong(int handle, int looping) {}

void I_PauseSong(int handle) {}

void I_ResumeSong(int handle) {}

void I_StopSong(int handle) {}

void I_UnRegisterSong(int handle) {}

int I_RegisterSong(void *data) { return 0; }

// Is the song playing?
int I_QrySongPlaying(int handle) { return 0; }
