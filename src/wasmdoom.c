#include <stdint.h>
#include <stdio.h>

#include "d_main.h"
#include "doomdef.h"
#include "i_video.h"
#include "v_video.h"
#include "wasmdoom.h"

#define EXPORT(name) __attribute__((export_name(#name))) name

#define EVENTBUF_CAP 64
static event_t event_buf[EVENTBUF_CAP];
static unsigned event_head = 0, event_tail = 0;

void EXPORT(wasmdoom_init)(void) { I_InitGraphics(); }

void EXPORT(wasmdoom_tick)(void) {
  while (event_head != event_tail) {
    event_t ev = event_buf[event_head++];
    event_head %= EVENTBUF_CAP;

    D_PostEvent(&ev);
  }

  D_DoomLoopTick();
}

void EXPORT(wasmdoom_keydown)(int keyCode) {
  event_buf[event_tail] = (event_t){.type = ev_keydown, .data1 = keyCode};
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
