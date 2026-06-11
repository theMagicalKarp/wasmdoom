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

#include "doomdef.h"
#include "i_sound.h"
#include "i_video.h"
#include "m_misc.h"
#include "wd_events.h"

#include "d_net.h"
#include "g_game.h"

#include "i_system.h"
#include "wd_save.h"
#include "z_zone.h"

void I_Tactile(int on, int off, int total) {}

ticcmd_t emptycmd;
ticcmd_t *I_BaseTiccmd(void) { return &emptycmd; }

#define MB_USED 32
// The zone heap lives in BSS rather than coming from malloc: it exists for
// the lifetime of the module, so there is nothing to free, and a static
// buffer keeps it out of the wd_libc bump heap. Aligned to match the bump
// allocator's guarantee since zone memory subdivides this block.
#define ZONE_HEAP_SIZE (MB_USED * 1024 * 1024)
static byte zone_heap[ZONE_HEAP_SIZE] __attribute__((aligned(16)));

int I_GetHeapSize(void) { return ZONE_HEAP_SIZE; }

byte *I_ZoneBase(int *size) {
  *size = ZONE_HEAP_SIZE;
  return zone_heap;
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
  I_ShutdownGraphics();
}

void I_WaitVBL(int count) {}

void I_BeginRead(void) {}

void I_EndRead(void) {}

//
// I_Error / I_Info / I_Warning
//
// Log sinks that replace the old fprintf(stdout/stderr, ...) calls. The
// message is formatted into a stack buffer and emit_log copies the bytes
// inline into the event buffer, so several records can fire within one tick
// before the host drains without aliasing a shared buffer.
static void log_vformat(uint16_t tag, char *fmt, va_list ap) {
  char msg[EV_LOG_MAX + 1];
  int len = vsnprintf(msg, sizeof(msg), fmt, ap);
  if (len < 0) {
    len = 0;
  }
  if (len > (int)sizeof(msg) - 1) {
    len = (int)sizeof(msg) - 1;
  }
  emit_log(tag, msg, len);
}

void I_Error(char *error, ...) {
  va_list ap;
  va_start(ap, error);
  log_vformat(EV_ERROR, error, ap);
  va_end(ap);

  __builtin_trap();
}

void I_Info(char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  log_vformat(EV_INFO, fmt, ap);
  va_end(ap);
}

void I_Warning(char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  log_vformat(EV_WARNING, fmt, ap);
  va_end(ap);
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
