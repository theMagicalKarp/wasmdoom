#include <stddef.h>
#include <stdint.h>

#include "d_main.h"
#include "doomdef.h"
#include "i_system.h"
#include "i_video.h"
#include "m_argv.h"
#include "v_video.h"
#include "wasmdoom.h"
#include "wd_events.h"
#include "wd_save.h"

#define EXPORT(name) __attribute__((export_name(#name))) name

#define EVENTBUF_CAP 64
static event_t event_buf[EVENTBUF_CAP];
static unsigned event_head = 0, event_tail = 0;

// --- Flag staging ----------------------------------------------------------
// The host writes NUL-separated argv tokens (excluding argv[0]) into
// wd_argv_buf via the wasmdoom_argv_ptr() pointer, ending the list with an
// empty token (double NUL). wd_build_argv points myargv[] into the buffer so
// the engine's M_CheckParm sees the flags. WD_ARGV_BUF_CAP is mirrored on the
// JS side (no separate export, matching how EV_ERROR is mirrored).
#define WD_ARGV_BUF_CAP 4096
#define WD_ARGV_MAX 64
static char wd_argv_buf[WD_ARGV_BUF_CAP];
static char *wd_argv[WD_ARGV_MAX];

uint8_t *EXPORT(wasmdoom_argv_ptr)(void) { return (uint8_t *)wd_argv_buf; }

// The buffer is self-terminating: tokens are NUL-separated and the list ends
// with an empty token (a leading NUL, i.e. a double NUL). No flags ⇒ the first
// byte is NUL ⇒ argc == 1 (just argv[0]), matching the old ["wasmdoom"].
static void wd_build_argv(void) {
  int n = 0;
  wd_argv[n++] = "wasmdoom"; // argv[0], matches the previous hardcoded value
  char *p = wd_argv_buf;
  char *end = wd_argv_buf + WD_ARGV_BUF_CAP;
  while (p < end && *p && n < WD_ARGV_MAX - 1) {
    wd_argv[n++] = p;
    while (p < end && *p) {
      p++; // skip to the token's NUL terminator
    }
    if (p < end) {
      p++; // step past the NUL to the next token
    }
  }
  wd_argv[n] = NULL;
  myargc = n;
  myargv = wd_argv;
}

// --- WAD staging -----------------------------------------------------------
// The host allocates a buffer with wasmdoom_wad_alloc(len) (self-committing:
// the length is recorded), writes the IWAD bytes into it, then sets the
// gamemode via wasmdoom_init. w_wad.c reads lumps straight from this buffer.
static uint8_t *wd_wad_buf = NULL;
static int wd_wad_len = 0;

uint8_t *EXPORT(wasmdoom_wad_alloc)(int len) {
  if (wd_wad_buf) {
    I_Error("wasmdoom_wad_alloc: WAD already staged");
  }
  // memory.grow counts 64 KiB pages and returns the old size in pages (the
  // grown region starts at the old end of memory), or -1 on failure. This is
  // the engine's only dynamic allocation, so no general allocator is needed.
  size_t pages = ((size_t)len + 0xFFFF) >> 16;
  size_t old_pages = __builtin_wasm_memory_grow(0, pages);
  if (old_pages == (size_t)-1) {
    return NULL;
  }
  wd_wad_buf = (uint8_t *)(old_pages << 16);
  wd_wad_len = len;
  return wd_wad_buf;
}

const uint8_t *wd_wad_data(void) { return wd_wad_buf; }
int wd_wad_size(void) { return wd_wad_len; }

// Explicit engine entry point. Replaces the implicit _start -> main ->
// D_DoomMain path: the host stages flags + WAD, then calls this.
void EXPORT(wasmdoom_init)(void) {
  wd_build_argv();
  D_DoomMain();
  I_InitGraphics();
}

void EXPORT(wasmdoom_tick)(void) {
  event_buffer_clear();
  I_AdvanceTime();

  while (event_head != event_tail) {
    event_t ev = event_buf[event_head++];
    event_head %= EVENTBUF_CAP;

    D_PostEvent(&ev);
  }

  D_DoomLoopTick();
}

uint8_t *EXPORT(wasmdoom_events_ptr)(void) { return event_buffer_ptr(); }
int EXPORT(wasmdoom_events_len)(void) { return event_buffer_len(); }

// Save install: host writes a save's bytes directly into a slot's buffer
// (save_slot_data_ptr), then calls wasmdoom_save_commit(slot, data_len) to
// commit the length. The slot number is the save's identity; the engine's
// "doomsav<N>.dsg" filename is derived from it inside the store.
uint8_t *EXPORT(wasmdoom_save_slot_ptr)(int slot) {
  return save_slot_data_ptr(slot);
}
int EXPORT(wasmdoom_save_commit)(int slot, int data_len) {
  return save_slot_commit(slot, data_len);
}

void EXPORT(wasmdoom_keydown)(int keyCode) {
  evtype_t type = (keyCode & WASMDOOM_TYPECHAR_FLAG) ? ev_typechar : ev_keydown;
  int data1 = keyCode & ~WASMDOOM_TYPECHAR_FLAG;
  event_buf[event_tail] = (event_t){.type = type, .data1 = data1};
  event_tail++;
  event_tail %= EVENTBUF_CAP;
}

void EXPORT(wasmdoom_keyup)(int keyCode) {
  event_buf[event_tail] = (event_t){.type = ev_keyup, .data1 = keyCode};
  event_tail++;
  event_tail %= EVENTBUF_CAP;
}

void EXPORT(wasmdoom_send_mouse)(int buttons, int dx, int dy) {
  event_buf[event_tail] =
      (event_t){.type = ev_mouse, .data1 = buttons, .data2 = dx, .data3 = dy};
  event_tail++;
  event_tail %= EVENTBUF_CAP;
}

uint8_t *EXPORT(wasmdoom_get_framebuffer)(void) { return screens[0]; }

extern byte doom_palette[768];

// 768-byte RGB palette (256 entries) the host applies to the 8bpp framebuffer.
uint8_t *EXPORT(wasmdoom_get_palette)(void) { return doom_palette; }
