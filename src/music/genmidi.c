// GENMIDI lump parser.
//
// The GENMIDI lump in id-format WADs holds the OPL instrument table used by
// the DOS Doom OPL music driver. Layout (little-endian throughout):
//
//   offset  size   field
//   0       8      magic "#OPL_II#"
//   8       6300   175 x 36-byte instrument records
//   6308    5600   175 x 32-byte ASCII instrument names (optional, ignored)
//
// Each 36-byte instrument record:
//
//   0    u16    flags (bit 0 = fixed pitch, bit 2 = double voice)
//   2    u8     fine tuning (0x80 = no detune)
//   3    u8     fixed-pitch MIDI note (used when flags bit 0 set)
//   4    16     voice 1
//   20   16     voice 2
//
// Each 16-byte voice is two operators (modulator then carrier) plus a
// feedback/connection byte and a signed semitone offset:
//
//   0..5    operator (mod) -- six raw OPL register payloads
//   6       feedback/connection (OPL reg 0xC0 payload)
//   7..12   operator (car)
//   13      unused
//   14      i16    base note offset
//
// Ref: https://doomwiki.org/wiki/GENMIDI

#include "genmidi.h"

// Freestanding wasm target lacks <string.h>; forward-declare what we use.
int memcmp(const void *s1, const void *s2, unsigned long n);

static genmidi_op parse_op(const uint8_t *p) {
  genmidi_op op;
  op.tvskm = p[0];
  op.attackDecay = p[1];
  op.sustainRelease = p[2];
  op.waveform = p[3];
  op.ksl = p[4];
  op.level = p[5];
  return op;
}

static genmidi_voice parse_voice(const uint8_t *p) {
  genmidi_voice v;
  v.mod = parse_op(p + 0);
  v.feedback = p[6];
  v.car = parse_op(p + 7);
  // p[13] is unused
  v.baseNote = (int16_t)(p[14] | (p[15] << 8));
  return v;
}

genmidi_result parseGenmidi(const uint8_t *data, int len,
                            genmidi_instrument *out) {
  if (len <
      GENMIDI_HEADER_SIZE + GENMIDI_INSTRUMENT_COUNT * GENMIDI_RECORD_SIZE) {
    return GENMIDI_ERR_TOO_SHORT;
  }

  if (memcmp(data, GENMIDI_MAGIC, GENMIDI_HEADER_SIZE) != 0) {
    return GENMIDI_ERR_BAD_MAGIC;
  }

  for (int i = 0; i < GENMIDI_INSTRUMENT_COUNT; i++) {
    const uint8_t *rec = data + GENMIDI_HEADER_SIZE + i * GENMIDI_RECORD_SIZE;
    out[i].flags = (uint16_t)(rec[0] | (rec[1] << 8));
    out[i].fineTuning = rec[2];
    out[i].fixedNote = rec[3];
    out[i].voice1 = parse_voice(rec + 4);
    out[i].voice2 = parse_voice(rec + 20);
  }
  return GENMIDI_OK;
}
