#include <stdint.h>
#include <stdio.h>

#include "d_main.h"
#include "doomdef.h"
#include "i_video.h"
#include "v_video.h"

#define EXPORT(name) __attribute__((export_name(#name))) name
#define IMPORT(mod, name)                                                      \
  __attribute__((import_module(#mod), import_name(#name)))

#define KEYBUF_CAP 64
static event_t key_buf[KEYBUF_CAP];
static unsigned key_head = 0, key_tail = 0;

IMPORT(doom_host, wasmdoom_error)
extern void wasmdoom_error(const char *message, int32_t length);

void EXPORT(wasmdoom_init)(void) { I_InitGraphics(); }

void EXPORT(wasmdoom_tick)(void) {
  while (key_head != key_tail) {
    event_t keyData = key_buf[key_head++];
    key_head %= KEYBUF_CAP;

    D_PostEvent(&keyData);
  }

  D_DoomLoopTick();
}

void EXPORT(wasmdoom_send_key)(int pressed, int keyCode) {
  key_buf[key_tail] =
      (event_t){.type = pressed == 1 ? ev_keydown : ev_keyup, .data1 = keyCode};
  key_tail++;
  key_tail %= KEYBUF_CAP;
}

uint8_t *EXPORT(wasmdoom_get_framebuffer)(void) { return screens[0]; }

extern byte doom_palette[768];

// 768-byte RGB palette (256 entries) the host applies to the 8bpp framebuffer.
uint8_t *EXPORT(wasmdoom_get_palette)(void) { return doom_palette; }
