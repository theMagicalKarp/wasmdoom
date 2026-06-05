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
#include "wd_events.h"

#include "d_net.h"
#include "g_game.h"

#ifdef __GNUG__
#pragma implementation "i_system.h"
#endif
#include "i_system.h"
#include "wd_save.h"
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
  // static so the buffer outlives this frame: emit_error stores a pointer into
  // it, and the host reads from wasm memory after exit() unwinds.
  static char msg[1024];
  va_list ap;
  va_start(ap, error);
  int len = vsnprintf(msg, sizeof(msg), error, ap);
  va_end(ap);
  if (len < 0) {
    len = 0;
  }
  if (len > (int)sizeof(msg) - 1) {
    len = (int)sizeof(msg) - 1;
  }

  emit_error(msg, len);

  exit(1);
}

int I_SaveGame(char const *name, void *source, int length) {
  save_write(name, (const uint8_t *)source, length);
  return 0;
}

int I_LoadGame(char const *name, byte **buffer) {
  const uint8_t *data;
  int size = save_lookup(name, &data);
  if (size <= 0) {
    return 0;
  }
  byte *buf = Z_Malloc(size, PU_STATIC, NULL);
  memcpy(buf, data, size);
  *buffer = buf;
  return size;
}

int I_ReadSaveString(char const *name, char *buffer, int length) {
  const uint8_t *data;
  int size = save_lookup(name, &data);
  if (size <= 0) {
    return -1;
  }
  int n = size < length ? size : length;
  memcpy(buffer, data, n);
  return n;
}
