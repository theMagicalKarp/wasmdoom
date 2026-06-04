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
//
//-----------------------------------------------------------------------------

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "doomdef.h"
#include "i_sound.h"
#include "i_video.h"
#include "m_misc.h"

#include "d_net.h"
#include "g_game.h"

#ifdef __GNUG__
#pragma implementation "i_system.h"
#endif
#include "i_system.h"
#include "wasmdoom.h"
#include "z_zone.h"

int mb_used = 32;

void I_Tactile(int on, int off, int total) {}

ticcmd_t emptycmd;
ticcmd_t *I_BaseTiccmd(void) { return &emptycmd; }

int I_GetHeapSize(void) { return mb_used * 1024 * 1024; }

byte *I_ZoneBase(int *size) {
  *size = mb_used * 1024 * 1024;
  return (byte *)malloc(*size);
}

// Host-driven tick counter. Advanced once per wasmdoom_tick so the
// simulation freezes cleanly whenever the host stops calling us, instead
// of fast-forwarding off the wall clock on resume.
static uint32_t tickcount = 0;
void I_AdvanceTime(void) { tickcount++; }
int I_GetTime(void) { return tickcount; }

//
// I_Init
//
void I_Init(void) { I_InitSound(); }

//
// I_Quit
//
void I_Quit(void) {
  D_QuitNetGame();
  I_ShutdownSound();
  I_ShutdownMusic();
  M_SaveDefaults();
  I_ShutdownGraphics();
  exit(0);
}

void I_WaitVBL(int count) { usleep(count * (1000000 / 70)); }

void I_BeginRead(void) {}

void I_EndRead(void) {}

byte *I_AllocLow(int length) {
  byte *mem;

  mem = (byte *)malloc(length);
  memset(mem, 0, length);
  return mem;
}

//
// I_Error
//
void I_Error(char *error, ...) {
  va_list ap;
  fprintf(stderr, "Error: ");
  va_start(ap, error);
  vfprintf(stderr, error, ap);
  va_end(ap);
  fprintf(stderr, "\n");
  fflush(stderr);
  exit(1);
}

int I_SaveGame(char const *name, void *source, int length) {
  return wasmdoom_save_game(name, (const uint8_t *)source, length);
}

int I_LoadGame(char const *name, byte **buffer) {
  int size = wasmdoom_load_game(name, NULL, 0);
  if (size <= 0) {
    return 0;
  }
  byte *buf = Z_Malloc(size, PU_STATIC, NULL);
  if (wasmdoom_load_game(name, buf, size) != size) {
    Z_Free(buf);
    return 0;
  }
  *buffer = buf;
  return size;
}

int I_ReadSaveString(char const *name, char *buffer, int length) {
  int size = wasmdoom_load_game(name, (uint8_t *)buffer, length);
  if (size <= 0) {
    return -1;
  }
  return size < length ? size : length;
}
