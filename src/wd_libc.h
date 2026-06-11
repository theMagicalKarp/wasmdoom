// Minimal libc replacement for the freestanding wasm32 build.
//
// Provides only the symbols the engine still calls after the WASI-libc
// purge. Force-included into every engine TU via build.zig's -include flag
// so all callers see the same prototypes — without this, variadic functions
// like sprintf get implicit declarations that differ per TU, and wasm-ld
// rejects the signature mismatch at link time.

#ifndef __WD_LIBC__
#define __WD_LIBC__

#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>

#ifndef NULL
#define NULL ((void *)0)
#endif

// --- Memory ----------------------------------------------------------------
void *memset(void *s, int c, size_t n);
void *memcpy(void *dest, const void *src, size_t n);

// --- Strings ---------------------------------------------------------------
size_t strlen(const char *s);
char *strcpy(char *dest, const char *src);
char *strncpy(char *dest, const char *src, size_t n);
int strcmp(const char *s1, const char *s2);
int strncmp(const char *s1, const char *s2, size_t n);
int strcasecmp(const char *s1, const char *s2);
int strncasecmp(const char *s1, const char *s2, size_t n);

// --- Format ----------------------------------------------------------------
int sprintf(char *str, const char *fmt, ...);
int snprintf(char *str, size_t size, const char *fmt, ...);
int vsnprintf(char *str, size_t size, const char *fmt, va_list ap);

// --- Misc ------------------------------------------------------------------
int atoi(const char *s);
int abs(int x);
int toupper(int c);

// alloca on wasm: clang lowers __builtin_alloca to a normal stack adjustment,
// no libc symbol required. The macro keeps the legacy call sites unchanged.
#define alloca(n) __builtin_alloca(n)

#endif // __WD_LIBC__
