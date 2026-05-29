#ifndef OPLPLAYER_H
#define OPLPLAYER_H

#include <stdint.h>

#include "genmidi.h"
#include "mus.h"
#include "opl/opl3.h"

#define OPLPLAYER_NUM_VOICES 18
#define OPLPLAYER_NUM_MIDI_CHANNELS 16
#define OPLPLAYER_PERCUSSION_CHANNEL 15

typedef struct {
  uint8_t instrument;
  uint8_t volume;
  uint8_t pan;
  uint8_t pitchBend;
  uint8_t lastVelocity;
} oplplayer_channel_state;

typedef struct {
  uint8_t inUse;
  uint8_t released;
  uint8_t channel;
  uint8_t note;
  const genmidi_voice *patchVoice;
  uint8_t isSecondVoice;
  float freqOffset;
  uint16_t blockFnum;
  uint32_t age;
} oplplayer_voice_state;

typedef struct {
  int fnum;
  int block;
} oplplayer_fnum_block;

typedef struct {
  opl3_chip *opl;
  const genmidi_instrument *instruments;
  int instrument_count;
  oplplayer_voice_state voices[OPLPLAYER_NUM_VOICES];
  oplplayer_channel_state channels[OPLPLAYER_NUM_MIDI_CHANNELS];
  uint32_t age_counter;
} oplplayer;

oplplayer_fnum_block oplplayer_note_to_fnum_block(float note_semis);

void oplplayer_init(oplplayer *p, opl3_chip *opl);
void oplplayer_set_genmidi(oplplayer *p, const genmidi_instrument *instruments,
                           int count);
void oplplayer_reset(oplplayer *p);
void oplplayer_handle_event(oplplayer *p, const mus_event *ev);
int oplplayer_active_voice_count(const oplplayer *p);

#endif
