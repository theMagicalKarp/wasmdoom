// Single-tick linear append buffer for outbound events.
//
// The C side appends typed records during wasmdoom_init / wasmdoom_tick. The
// host drains [0, event_buffer_len()) after each call and then resets the
// cursor with event_buffer_clear(). No ring, no wrap-around — the consumer
// catches up every tick.

#include <stdint.h>

#include "wd_events.h"

// 8 KiB is comfortable for the heaviest known tick (level start: GENMIDI set,
// song register, a few SFX). Revisit if a record is ever dropped.
#define EVENT_BUFFER_CAP 8192

static uint8_t buffer[EVENT_BUFFER_CAP];
static int cursor = 0;

uint8_t *event_buffer_ptr(void) { return buffer; }
int event_buffer_len(void) { return cursor; }
void event_buffer_clear(void) { cursor = 0; }

// Reserve `len` bytes for the next record (header + payload). Returns a
// pointer into the buffer, or NULL on overflow.
static uint8_t *reserve(int len) {
  if (cursor + len > EVENT_BUFFER_CAP) {
    // TODO: Handle overflow
    return NULL;
  }
  uint8_t *out = buffer + cursor;
  cursor += len;
  return out;
}

static void write_u16(uint8_t *p, uint16_t v) {
  p[0] = (uint8_t)(v & 0xFF);
  p[1] = (uint8_t)((v >> 8) & 0xFF);
}

static void write_u32(uint8_t *p, uint32_t v) {
  p[0] = (uint8_t)(v & 0xFF);
  p[1] = (uint8_t)((v >> 8) & 0xFF);
  p[2] = (uint8_t)((v >> 16) & 0xFF);
  p[3] = (uint8_t)((v >> 24) & 0xFF);
}

static uint8_t *begin_record(uint16_t tag, uint16_t payload_len) {
  uint8_t *rec = reserve(4 + payload_len);
  if (!rec) {
    return NULL;
  }
  write_u16(rec, tag);
  write_u16(rec + 2, payload_len);
  return rec + 4;
}

void emit_log(uint16_t tag, const char *msg, int32_t len) {
  if (len < 0) {
    len = 0;
  }
  if (len > EV_LOG_MAX) {
    len = EV_LOG_MAX;
  }
  uint8_t *p = begin_record(tag, (uint16_t)len);
  if (!p) {
    return;
  }
  memcpy(p, msg, (size_t)len);
}

void emit_sound_start(int32_t handle, int32_t sfx_id, const uint8_t *data,
                      int32_t data_len, int32_t vol, int32_t sep,
                      int32_t pitch) {
  uint8_t *p = begin_record(EV_SOUND_START, 28);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
  write_u32(p + 4, (uint32_t)sfx_id);
  write_u32(p + 8, (uint32_t)(uintptr_t)data);
  write_u32(p + 12, (uint32_t)data_len);
  write_u32(p + 16, (uint32_t)vol);
  write_u32(p + 20, (uint32_t)sep);
  write_u32(p + 24, (uint32_t)pitch);
}

void emit_sound_stop(int32_t handle) {
  uint8_t *p = begin_record(EV_SOUND_STOP, 4);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
}

void emit_sound_update(int32_t handle, int32_t vol, int32_t sep,
                       int32_t pitch) {
  uint8_t *p = begin_record(EV_SOUND_UPDATE, 16);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
  write_u32(p + 4, (uint32_t)vol);
  write_u32(p + 8, (uint32_t)sep);
  write_u32(p + 12, (uint32_t)pitch);
}

void emit_music_set_genmidi(const uint8_t *data, int32_t len) {
  uint8_t *p = begin_record(EV_MUSIC_SET_GENMIDI, 8);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)(uintptr_t)data);
  write_u32(p + 4, (uint32_t)len);
}

void emit_music_register(int32_t handle, const uint8_t *data, int32_t len) {
  uint8_t *p = begin_record(EV_MUSIC_REGISTER, 12);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
  write_u32(p + 4, (uint32_t)(uintptr_t)data);
  write_u32(p + 8, (uint32_t)len);
}

void emit_music_play(int32_t handle, int32_t looping) {
  uint8_t *p = begin_record(EV_MUSIC_PLAY, 8);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
  write_u32(p + 4, (uint32_t)looping);
}

void emit_music_pause(int32_t handle) {
  uint8_t *p = begin_record(EV_MUSIC_PAUSE, 4);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
}

void emit_music_resume(int32_t handle) {
  uint8_t *p = begin_record(EV_MUSIC_RESUME, 4);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
}

void emit_music_stop(int32_t handle) {
  uint8_t *p = begin_record(EV_MUSIC_STOP, 4);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
}

void emit_music_unregister(int32_t handle) {
  uint8_t *p = begin_record(EV_MUSIC_UNREGISTER, 4);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)handle);
}

void emit_music_set_volume(int32_t volume) {
  uint8_t *p = begin_record(EV_MUSIC_SET_VOLUME, 4);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)volume);
}

void emit_save_written(int32_t slot, const uint8_t *data, int32_t data_len) {
  uint8_t *p = begin_record(EV_SAVE_WRITTEN, 12);
  if (!p) {
    return;
  }
  write_u32(p, (uint32_t)slot);
  write_u32(p + 4, (uint32_t)(uintptr_t)data);
  write_u32(p + 8, (uint32_t)data_len);
}
