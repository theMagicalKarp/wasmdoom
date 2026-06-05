#ifndef __WASMDOOM__
#define __WASMDOOM__

// Sentinel bit on the int passed to wasmdoom_keydown: when set, the low byte
// is treated as a typed ASCII character (ev_typechar) instead of a game key
// (ev_keydown). All doom keycodes fit in 0–0xFF, so this bit is free.
#define WASMDOOM_TYPECHAR_FLAG 0x100

#endif
