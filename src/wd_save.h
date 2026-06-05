#ifndef __WD_SAVE_H__
#define __WD_SAVE_H__

#include <stdint.h>

// Bytes per save. This is the engine's own hard cap, not an estimate:
// G_DoSaveGame writes into a SAVEGAMESIZE (0x2c000 = 176 KiB) buffer.
// SAVE_SLOTS slots fit in linear memory at once (~1.4 MiB total).
#define SAVE_BYTES_MAX 0x2c000
#define SAVE_SLOTS 8

// Per-slot byte buffer the host writes a save into before calling
// save_slot_commit. The slot storage doubles as the staging area, so there is
// no extra copy. Returns NULL if `slot` is out of range. The pointer is stable
// for the lifetime of the module.
uint8_t *save_slot_data_ptr(int slot);

// Commit a save the host staged into slot `slot` via save_slot_data_ptr.
// Records the byte count and marks the slot live. Returns 1 on success, or 0 if
// `slot` or `data_len` are out of range.
int save_slot_commit(int slot, int data_len);

// Write a save and emit EV_SAVE_WRITTEN pointing into the in-memory store.
// `name` is an engine save filename ("doomsav<N>.dsg"); N selects the slot. The
// pointers in the event remain valid until the next wasmdoom_tick.
void save_write(const char *name, const uint8_t *data, int data_len);

// Look up a save by engine filename ("doomsav<N>.dsg"). Returns the byte count,
// or -1 if no save exists in that slot. If `out_data` is non-NULL, points it at
// the stored bytes.
int save_lookup(const char *name, const uint8_t **out_data);

#endif
