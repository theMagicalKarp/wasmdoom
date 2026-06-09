#ifndef __WASMDOOM__
#define __WASMDOOM__

// Sentinel bit on the int passed to wasmdoom_keydown: when set, the low byte
// is treated as a typed ASCII character (ev_typechar) instead of a game key
// (ev_keydown). All doom keycodes fit in 0–0xFF, so this bit is free.
#define WASMDOOM_TYPECHAR_FLAG 0x100

#include <stdint.h>

// The IWAD the host staged into linear memory via wasmdoom_wad_alloc. The WAD
// subsystem reads lumps straight from this buffer instead of POSIX file I/O.
const uint8_t *wd_wad_data(void);
int wd_wad_size(void);

#endif
