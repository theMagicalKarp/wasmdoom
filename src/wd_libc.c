// Minimal libc replacement — see wd_libc.h for rationale.

#include "wd_libc.h"

// --- Memory -------------------------------------------------
void *memset(void *s, int c, size_t n) {
  unsigned char *p = (unsigned char *)s;
  unsigned char b = (unsigned char)c;
  for (size_t i = 0; i < n; i++) {
    p[i] = b;
  }
  return s;
}

void *memcpy(void *dest, const void *src, size_t n) {
  unsigned char *d = (unsigned char *)dest;
  const unsigned char *s = (const unsigned char *)src;
  for (size_t i = 0; i < n; i++) {
    d[i] = s[i];
  }
  return dest;
}

// --- Strings ---------------------------------------------------------------

size_t strlen(const char *s) {
  size_t n = 0;
  while (s[n]) {
    n++;
  }
  return n;
}

char *strcpy(char *dest, const char *src) {
  char *d = dest;
  while ((*d++ = *src++) != 0) {
  }
  return dest;
}

char *strncpy(char *dest, const char *src, size_t n) {
  size_t i = 0;
  for (; i < n && src[i]; i++) {
    dest[i] = src[i];
  }
  for (; i < n; i++) {
    dest[i] = 0;
  }
  return dest;
}

int strcmp(const char *s1, const char *s2) {
  while (*s1 && *s1 == *s2) {
    s1++;
    s2++;
  }
  return (int)(unsigned char)*s1 - (int)(unsigned char)*s2;
}

int strncmp(const char *s1, const char *s2, size_t n) {
  for (size_t i = 0; i < n; i++) {
    unsigned char a = (unsigned char)s1[i];
    unsigned char b = (unsigned char)s2[i];
    if (a != b) {
      return (int)a - (int)b;
    }
    if (a == 0) {
      return 0;
    }
  }
  return 0;
}

static int ci(unsigned char c) {
  if (c >= 'A' && c <= 'Z') {
    return c + ('a' - 'A');
  }
  return c;
}

int strcasecmp(const char *s1, const char *s2) {
  for (;;) {
    int a = ci((unsigned char)*s1++);
    int b = ci((unsigned char)*s2++);
    if (a != b) {
      return a - b;
    }
    if (a == 0) {
      return 0;
    }
  }
}

int strncasecmp(const char *s1, const char *s2, size_t n) {
  for (size_t i = 0; i < n; i++) {
    int a = ci((unsigned char)s1[i]);
    int b = ci((unsigned char)s2[i]);
    if (a != b) {
      return a - b;
    }
    if (a == 0) {
      return 0;
    }
  }
  return 0;
}

// --- Misc ------------------------------------------------------------------

int abs(int x) { return x < 0 ? -x : x; }

int toupper(int c) {
  if (c >= 'a' && c <= 'z') {
    return c - ('a' - 'A');
  }
  return c;
}

int atoi(const char *s) {
  while (*s == ' ' || *s == '\t' || *s == '\n' || *s == '\r') {
    s++;
  }
  int sign = 1;
  if (*s == '-') {
    sign = -1;
    s++;
  } else if (*s == '+') {
    s++;
  }
  int v = 0;
  while (*s >= '0' && *s <= '9') {
    v = v * 10 + (*s - '0');
    s++;
  }
  return sign * v;
}

// --- printf family ---------------------------------------------------------
// Just enough of vsnprintf to cover what the engine prints: %d/%i/%u/%x/%X
// for signed/unsigned ints (with width, precision, '-' and '0' flags), %c,
// %s (with precision = max chars), and %%. No floats, no length modifiers
// (longs are 32-bit on wasm32 anyway).

typedef struct {
  char *buf;
  size_t cap; // 0 means "count only, don't write"
  size_t pos;
} wd_sink;

static void sink_putc(wd_sink *s, char c) {
  if (s->cap == 0) {
    s->pos++;
    return;
  }
  if (s->pos + 1 < s->cap) {
    s->buf[s->pos] = c;
  }
  s->pos++;
}

static void sink_pad(wd_sink *s, char pad, int n) {
  for (int i = 0; i < n; i++) {
    sink_putc(s, pad);
  }
}

static void emit_str(wd_sink *s, const char *str, int width, int precision,
                     int left_align) {
  int len = 0;
  while (str[len] && (precision < 0 || len < precision)) {
    len++;
  }
  int pad = width > len ? width - len : 0;
  if (!left_align) {
    sink_pad(s, ' ', pad);
  }
  for (int i = 0; i < len; i++) {
    sink_putc(s, str[i]);
  }
  if (left_align) {
    sink_pad(s, ' ', pad);
  }
}

static void emit_int(wd_sink *s, unsigned int value, int negative, int base,
                     int upper, int width, int precision, int left_align,
                     int zero_pad, int sign_space) {
  char tmp[32];
  int n = 0;
  if (value == 0 && precision != 0) {
    tmp[n++] = '0';
  } else {
    const char *digits = upper ? "0123456789ABCDEF" : "0123456789abcdef";
    while (value) {
      tmp[n++] = digits[value % base];
      value /= base;
    }
  }
  while (n < precision) {
    tmp[n++] = '0';
  }

  int sign_len = (negative || sign_space) ? 1 : 0;
  int total = n + sign_len;
  int pad = width > total ? width - total : 0;

  if (!left_align && !zero_pad) {
    sink_pad(s, ' ', pad);
  }
  if (negative) {
    sink_putc(s, '-');
  } else if (sign_space) {
    sink_putc(s, ' ');
  }
  if (!left_align && zero_pad) {
    sink_pad(s, '0', pad);
  }
  for (int i = n - 1; i >= 0; i--) {
    sink_putc(s, tmp[i]);
  }
  if (left_align) {
    sink_pad(s, ' ', pad);
  }
}

static int parse_num(const char **fmt) {
  int v = 0;
  while (**fmt >= '0' && **fmt <= '9') {
    v = v * 10 + (**fmt - '0');
    (*fmt)++;
  }
  return v;
}

static int wd_vformat(wd_sink *s, const char *fmt, va_list ap) {
  while (*fmt) {
    if (*fmt != '%') {
      sink_putc(s, *fmt++);
      continue;
    }
    fmt++;

    int left_align = 0;
    int zero_pad = 0;
    int sign_space = 0;
    for (;;) {
      if (*fmt == '-') {
        left_align = 1;
        fmt++;
      } else if (*fmt == '0') {
        zero_pad = 1;
        fmt++;
      } else if (*fmt == ' ') {
        sign_space = 1;
        fmt++;
      } else if (*fmt == '+') {
        // not used by the engine; treat like default
        fmt++;
      } else {
        break;
      }
    }

    int width = 0;
    if (*fmt == '*') {
      width = va_arg(ap, int);
      fmt++;
    } else {
      width = parse_num(&fmt);
    }

    int precision = -1;
    if (*fmt == '.') {
      fmt++;
      if (*fmt == '*') {
        precision = va_arg(ap, int);
        fmt++;
      } else {
        precision = parse_num(&fmt);
      }
    }

    // skip length modifiers (l, h, z) — all the same size on wasm32
    while (*fmt == 'l' || *fmt == 'h' || *fmt == 'z') {
      fmt++;
    }

    char spec = *fmt;
    if (spec) {
      fmt++;
    }

    switch (spec) {
    case 'd':
    case 'i': {
      int v = va_arg(ap, int);
      unsigned int abs_v =
          v < 0 ? (unsigned int)-(long long)v : (unsigned int)v;
      emit_int(s, abs_v, v < 0, 10, 0, width, precision, left_align, zero_pad,
               sign_space);
      break;
    }
    case 'u': {
      unsigned int v = va_arg(ap, unsigned int);
      emit_int(s, v, 0, 10, 0, width, precision, left_align, zero_pad, 0);
      break;
    }
    case 'x': {
      unsigned int v = va_arg(ap, unsigned int);
      emit_int(s, v, 0, 16, 0, width, precision, left_align, zero_pad, 0);
      break;
    }
    case 'X': {
      unsigned int v = va_arg(ap, unsigned int);
      emit_int(s, v, 0, 16, 1, width, precision, left_align, zero_pad, 0);
      break;
    }
    case 'p': {
      unsigned int v = (unsigned int)(uintptr_t)va_arg(ap, void *);
      sink_putc(s, '0');
      sink_putc(s, 'x');
      emit_int(s, v, 0, 16, 0, width, precision, left_align, zero_pad, 0);
      break;
    }
    case 'c': {
      int c = va_arg(ap, int);
      char tmp[1] = {(char)c};
      // emit as a 1-char string so width/left-align work consistently
      int pad = width > 1 ? width - 1 : 0;
      if (!left_align) {
        sink_pad(s, ' ', pad);
      }
      sink_putc(s, tmp[0]);
      if (left_align) {
        sink_pad(s, ' ', pad);
      }
      break;
    }
    case 's': {
      const char *str = va_arg(ap, const char *);
      if (!str) {
        str = "(null)";
      }
      emit_str(s, str, width, precision, left_align);
      break;
    }
    case '%':
      sink_putc(s, '%');
      break;
    default:
      // unknown specifier: emit literally so debugging is obvious
      sink_putc(s, '%');
      if (spec) {
        sink_putc(s, spec);
      }
      break;
    }
  }

  if (s->cap > 0) {
    size_t term = s->pos < s->cap ? s->pos : s->cap - 1;
    s->buf[term] = 0;
  }
  return (int)s->pos;
}

int vsnprintf(char *str, size_t size, const char *fmt, va_list ap) {
  wd_sink s = {.buf = str, .cap = size, .pos = 0};
  return wd_vformat(&s, fmt, ap);
}

int snprintf(char *str, size_t size, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  int r = vsnprintf(str, size, fmt, ap);
  va_end(ap);
  return r;
}

int sprintf(char *str, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  // SIZE_MAX-style "unbounded" sink: pass a huge cap so the writer never
  // truncates. The engine's sprintf targets are sized for their format,
  // matching original DOOM semantics.
  wd_sink s = {.buf = str, .cap = (size_t)-1, .pos = 0};
  int r = wd_vformat(&s, fmt, ap);
  va_end(ap);
  return r;
}
