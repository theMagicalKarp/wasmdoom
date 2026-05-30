#ifndef MUSIC_UTILS_H
#define MUSIC_UTILS_H

#include <stdint.h>

static inline float clamp_f(float v, float lo, float hi) {
  if (v < lo) {
    return lo;
  }
  if (v > hi) {
    return hi;
  }
  return v;
}

static inline int clamp_i(int v, int lo, int hi) {
  if (v < lo) {
    return lo;
  }
  if (v > hi) {
    return hi;
  }
  return v;
}

static inline void copy_bytes(uint8_t *dst, const uint8_t *src, int n) {
  for (int i = 0; i < n; i++) {
    dst[i] = src[i];
  }
}

static inline void zero_floats(float *p, int n) {
  for (int i = 0; i < n; i++) {
    p[i] = 0.0f;
  }
}

#endif
