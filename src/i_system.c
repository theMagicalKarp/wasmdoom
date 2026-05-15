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
#include <time.h>

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

int mb_used = 16;

void I_Tactile(int on, int off, int total) {}

ticcmd_t emptycmd;
ticcmd_t *I_BaseTiccmd(void) { return &emptycmd; }

int I_GetHeapSize(void) { return mb_used * 1024 * 1024; }

byte *I_ZoneBase(int *size) {
  *size = mb_used * 1024 * 1024;
  return (byte *)malloc(*size);
}

//
// I_GetTime
// returns time in 1/70th second tics
//
static uint64_t basetime_ns = 0;
int I_GetTime(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  uint64_t now_ns = (uint64_t)ts.tv_sec * 1000000000ull + (uint64_t)ts.tv_nsec;

  if (basetime_ns == 0) {
    basetime_ns = now_ns;
    return 0;
  }
  return (int)((now_ns - basetime_ns) * 70ull / 1000000000ull);
}

//
// I_Init
//
void I_Init(void) {
  // TODO: Expose to Hosts
}

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
