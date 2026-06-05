#include <stdint.h>
#include <stdio.h>

#include "d_main.h"
#include "doomdef.h"
#include "i_system.h"
#include "i_video.h"
#include "v_video.h"
#include "wasmdoom.h"
#include "wd_events.h"
#include "wd_save.h"

#define EXPORT(name) __attribute__((export_name(#name))) name

#define EVENTBUF_CAP 64
static event_t event_buf[EVENTBUF_CAP];
static unsigned event_head = 0, event_tail = 0;

void EXPORT(wasmdoom_init)(void) { I_InitGraphics(); }

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
