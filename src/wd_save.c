// In-memory save store, indexed by Doom's save-slot number. The host
// front-loads persisted saves before wasmdoom_init by writing each save's bytes
// directly into a slot's buffer (save_slot_data_ptr) and committing the length
// with wasmdoom_save_commit; the engine reads/writes the same slots at runtime.
// The engine addresses saves by filename ("doomsav<N>.dsg"); the trailing N is
// the slot, so this file is the single place that knows that convention.
// I_LoadGame becomes a pure in-memory lookup; I_SaveGame commits to the store
// and emits EV_SAVE_WRITTEN so the host can persist asynchronously.

#include <stddef.h>
#include <stdint.h>

#include "dstrings.h"
#include "wd_events.h"
#include "wd_save.h"

struct save_slot {
  uint8_t data[SAVE_BYTES_MAX];
  int data_len;
};

static struct save_slot slots[SAVE_SLOTS];

// Engine save filenames are SAVEGAMENAME "%d.dsg" (e.g. "doomsav3.dsg"); the
// trailing slot index is the save's identity. Returns the index, or -1 if the
// name doesn't match the convention or the index is out of range.
static int parse_slot(const char *name) {
  size_t prefix_len = strlen(SAVEGAMENAME);
  if (strncmp(name, SAVEGAMENAME, prefix_len) != 0) {
    return -1;
  }
  const char *p = name + prefix_len;
  if (*p < '0' || *p > '9') {
    return -1;
  }
  int slot = 0;
  while (*p >= '0' && *p <= '9') {
    slot = slot * 10 + (*p - '0');
    p++;
  }
  if (slot < 0 || slot >= SAVE_SLOTS) {
    return -1;
  }
  return slot;
}

uint8_t *save_slot_data_ptr(int slot) {
  if (slot < 0 || slot >= SAVE_SLOTS) {
    return NULL;
  }
  return slots[slot].data;
}

int save_slot_commit(int slot, int data_len) {
  if (slot < 0 || slot >= SAVE_SLOTS) {
    return 0;
  }
  if (data_len < 0 || data_len > SAVE_BYTES_MAX) {
    return 0;
  }
  // The host has already written the bytes straight into this slot's buffer;
  // recording the length both commits the save and marks the slot live.
  slots[slot].data_len = data_len;
  return 1;
}

void save_write(const char *name, const uint8_t *data, int data_len) {
  int slot = parse_slot(name);
  if (slot < 0 || data_len < 0 || data_len > SAVE_BYTES_MAX) {
    return;
  }
  memcpy(slots[slot].data, data, data_len);
  slots[slot].data_len = data_len;
  emit_save_written(slot, slots[slot].data, slots[slot].data_len);
}

int save_lookup(const char *name, const uint8_t **out_data) {
  int slot = parse_slot(name);
  if (slot < 0 || slots[slot].data_len <= 0) {
    return -1;
  }
  if (out_data) {
    *out_data = slots[slot].data;
  }
  return slots[slot].data_len;
}
