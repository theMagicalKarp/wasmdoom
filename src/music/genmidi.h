#ifndef GENMIDI_H
#define GENMIDI_H

#include <stdint.h>

#define GENMIDI_MAGIC "#OPL_II#"
#define GENMIDI_INSTRUMENT_COUNT 175
#define GENMIDI_RECORD_SIZE 36
#define GENMIDI_HEADER_SIZE 8

#define GENMIDI_FLAG_FIXED_PITCH 0x01
#define GENMIDI_FLAG_DOUBLE_VOICE 0x04

typedef struct {
  uint8_t tvskm;
  uint8_t attackDecay;
  uint8_t sustainRelease;
  uint8_t waveform;
  uint8_t ksl;
  uint8_t level;
} genmidi_op;

typedef struct {
  uint8_t feedback;
  int16_t baseNote;

  genmidi_op mod;
  genmidi_op car;
} genmidi_voice;

typedef struct {
  uint16_t flags;
  uint8_t fineTuning;
  uint8_t fixedNote;

  genmidi_voice voice1;
  genmidi_voice voice2;
} genmidi_instrument;

typedef enum {
  GENMIDI_OK = 0,
  GENMIDI_ERR_TOO_SHORT = -1,
  GENMIDI_ERR_BAD_MAGIC = -2,
} genmidi_result;

// Parse a GENMIDI lump (`data`, `len` bytes) into `out`, which must hold at
// least GENMIDI_INSTRUMENT_COUNT instruments. Returns GENMIDI_OK on success,
// or a negative genmidi_result on a truncated lump or bad magic.
genmidi_result parseGenmidi(const uint8_t *data, int len,
                            genmidi_instrument *out);

#endif