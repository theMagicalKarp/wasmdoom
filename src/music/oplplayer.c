// MUS → OPL playback driver.
//
// Takes a stream of mus_events from the sequencer and drives an OPL3 instance
// using a GENMIDI instrument table. This is the moral equivalent of Chocolate
// Doom's i_oplmusic.c: 18-voice round-robin allocation, GENMIDI patch
// programming, MIDI-note → F-num/block, pitch bend, volume/pan controllers,
// and percussion (MUS channel 15 → GENMIDI percussion bank).
//
// The player does not produce audio itself — it only writes OPL registers.
// Pull samples from the OPL3 instance directly.

#include "oplplayer.h"

#include "utils.h"

#define NUM_VOICES OPLPLAYER_NUM_VOICES
#define NUM_MIDI_CHANNELS OPLPLAYER_NUM_MIDI_CHANNELS
#define PERCUSSION_CHANNEL OPLPLAYER_PERCUSSION_CHANNEL

// Per-voice OPL slot offset within its 9-channel bank (voices 0..8 live on
// port 0, voices 9..17 on port 1, addressed as `reg | 0x100`). The carrier
// slot for each voice is the modulator slot + 3.
static const uint8_t MOD_OFFSETS[9] = {
    0x00, 0x01, 0x02, 0x08, 0x09, 0x0a, 0x10, 0x11, 0x12,
};

// Chocolate Doom's volume_mapping_table: a perceptual curve mapping linear
// MIDI velocity/volume (0..127) to a scaled value (0..127) before combining
// channel-volume × velocity and reducing the operator's base attenuation.
static const uint8_t VOLUME_MAPPING[128] = {
    0,   1,   3,   5,   6,   8,   10,  11,  13,  14,  16,  17,  19,  20,  22,
    23,  25,  26,  27,  29,  30,  32,  33,  34,  36,  37,  39,  41,  43,  45,
    47,  49,  50,  52,  54,  55,  57,  59,  60,  61,  63,  64,  66,  67,  68,
    69,  71,  72,  73,  74,  75,  76,  77,  79,  80,  81,  82,  83,  84,  84,
    85,  86,  87,  88,  89,  90,  91,  92,  92,  93,  94,  95,  96,  96,  97,
    98,  99,  99,  100, 101, 101, 102, 103, 103, 104, 105, 105, 106, 107, 107,
    108, 109, 109, 110, 110, 111, 112, 112, 113, 113, 114, 114, 115, 115, 116,
    117, 117, 118, 118, 119, 119, 120, 120, 121, 121, 122, 122, 123, 123, 123,
    124, 124, 125, 125, 126, 126, 127, 127,
};

// MIDI note frequency table: freq[i] = 440 * 2^((i - 69) / 12) Hz, i.e. note 69
// (A4) = 440. Each entry is the float-rounded value of that formula; index 69
// is exactly 440 and the octave anchors (57=220, 81=880, ...) are exact powers.
static const float freq_table[128] = {
    8.175799369812012f,  8.661956787109375f,
    9.177023887634277f,  9.722718238830566f,
    10.300861358642578f, 10.913382530212402f,
    11.562325477600098f, 12.249856948852539f,
    12.978271484375f,    13.75f,
    14.567617416381836f, 15.433853149414062f,
    16.351598739624023f, 17.32391357421875f,
    18.354047775268555f, 19.445436477661133f,
    20.601722717285156f, 21.826765060424805f,
    23.124650955200195f, 24.499713897705078f,
    25.95654296875f,     27.5f,
    29.135234832763672f, 30.867706298828125f,
    32.70319747924805f,  34.6478271484375f,
    36.70809555053711f,  38.890872955322266f,
    41.20344543457031f,  43.65353012084961f,
    46.24930191040039f,  48.999427795410156f,
    51.9130859375f,      55.0f,
    58.270469665527344f, 61.73541259765625f,
    65.4063949584961f,   69.295654296875f,
    73.41619110107422f,  77.78174591064453f,
    82.40689086914062f,  87.30706024169922f,
    92.49860382080078f,  97.99885559082031f,
    103.826171875f,      110.0f,
    116.54093933105469f, 123.4708251953125f,
    130.8127899169922f,  138.59130859375f,
    146.83238220214844f, 155.56349182128906f,
    164.81378173828125f, 174.61412048339844f,
    184.99720764160156f, 195.99771118164062f,
    207.65234375f,       220.0f,
    233.08187866210938f, 246.941650390625f,
    261.6255798339844f,  277.1826171875f,
    293.6647644042969f,  311.1269836425781f,
    329.6275634765625f,  349.2282409667969f,
    369.9944152832031f,  391.99542236328125f,
    415.3046875f,        440.0f,
    466.16375732421875f, 493.88330078125f,
    523.2511596679688f,  554.365234375f,
    587.3295288085938f,  622.2539672851562f,
    659.255126953125f,   698.4564819335938f,
    739.9888305664062f,  783.9908447265625f,
    830.609375f,         880.0f,
    932.3275146484375f,  987.7666015625f,
    1046.5023193359375f, 1108.73046875f,
    1174.6590576171875f, 1244.5079345703125f,
    1318.51025390625f,   1396.9129638671875f,
    1479.9776611328125f, 1567.981689453125f,
    1661.21875f,         1760.0f,
    1864.655029296875f,  1975.533203125f,
    2093.004638671875f,  2217.4609375f,
    2349.318115234375f,  2489.015869140625f,
    2637.0205078125f,    2793.825927734375f,
    2959.955322265625f,  3135.96337890625f,
    3322.4375f,          3520.0f,
    3729.31005859375f,   3951.06640625f,
    4186.00927734375f,   4434.921875f,
    4698.63623046875f,   4978.03173828125f,
    5274.041015625f,     5587.65185546875f,
    5919.91064453125f,   6271.9267578125f,
    6644.875f,           7040.0f,
    7458.6201171875f,    7902.1328125f,
    8372.0185546875f,    8869.84375f,
    9397.2724609375f,    9956.0634765625f,
    10548.08203125f,     11175.3037109375f,
    11839.8212890625f,   12543.853515625f,
};

// Linear-interpolated lookup of the MIDI note frequency. Linear interpolation
// between adjacent semitones has < 0.1% error (well under one cent).
static float note_to_freq(float note_semis) {
  float n = clamp_f(note_semis, 0.0f, 127.0f);
  int idx = (int)n;
  if (idx >= 127) {
    return freq_table[127];
  }
  float frac = n - (float)idx;
  float f0 = freq_table[idx];
  float f1 = freq_table[idx + 1];
  return f0 + (f1 - f0) * frac;
}

oplplayer_fnum_block oplplayer_note_to_fnum_block(float note_semis) {
  float freq = note_to_freq(note_semis);
  // freq = F-num × 49716 / 2^(20 - block). Pick the smallest block where
  // F-num fits in 10 bits.
  for (int block = 0; block <= 7; block++) {
    // F-num = round(freq * (1 << (20 - block)) / 49716)
    float scale = (float)(1 << (20 - block)) / 49716.0f;
    int fnum = (int)(freq * scale + 0.5f);
    if (fnum < 1024) {
      oplplayer_fnum_block r;
      r.fnum = fnum < 0 ? 0 : fnum;
      r.block = block;
      return r;
    }
  }
  oplplayer_fnum_block r;
  r.fnum = 1023;
  r.block = 7;
  return r;
}

// OPL register address for this voice's per-channel reg (0xA0/0xB0/0xC0)
// or per-operator reg (0x20/0x40/0x60/0x80/0xE0). Pass `carrier=1` to address
// the carrier operator slot, `carrier=0` for the modulator.
static int voice_reg(int voice_idx, int base) {
  int bank = voice_idx >= 9 ? 0x100 : 0;
  return bank | (base + (voice_idx % 9));
}

static int operator_reg(int voice_idx, int base, int carrier) {
  int bank = voice_idx >= 9 ? 0x100 : 0;
  int slot = MOD_OFFSETS[voice_idx % 9] + (carrier ? 3 : 0);
  return bank | (base + slot);
}

static void write_operator_regs(oplplayer *p, int voice_idx,
                                const genmidi_voice *pv) {
  opl3_chip *opl = p->opl;
  OPL3_WriteRegBuffered(opl, operator_reg(voice_idx, 0x20, 0), pv->mod.tvskm);
  OPL3_WriteRegBuffered(opl, operator_reg(voice_idx, 0x60, 0),
                        pv->mod.attackDecay);
  OPL3_WriteRegBuffered(opl, operator_reg(voice_idx, 0x80, 0),
                        pv->mod.sustainRelease);
  OPL3_WriteRegBuffered(opl, operator_reg(voice_idx, 0xe0, 0),
                        pv->mod.waveform);
  // Modulator level is part of the patch's timbre, not velocity-scaled.
  OPL3_WriteRegBuffered(opl, operator_reg(voice_idx, 0x40, 0),
                        (pv->mod.ksl & 0xc0) | (pv->mod.level & 0x3f));

  OPL3_WriteRegBuffered(opl, operator_reg(voice_idx, 0x20, 1), pv->car.tvskm);
  OPL3_WriteRegBuffered(opl, operator_reg(voice_idx, 0x60, 1),
                        pv->car.attackDecay);
  OPL3_WriteRegBuffered(opl, operator_reg(voice_idx, 0x80, 1),
                        pv->car.sustainRelease);
  OPL3_WriteRegBuffered(opl, operator_reg(voice_idx, 0xe0, 1),
                        pv->car.waveform);
  // Carrier 0x40 is set by write_voice_volume.
}

static void write_voice_volume(oplplayer *p, int voice_idx, int velocity) {
  oplplayer_voice_state *voice = &p->voices[voice_idx];
  const genmidi_voice *pv = voice->patchVoice;
  if (!pv) {
    return;
  }
  oplplayer_channel_state *ch = &p->channels[voice->channel];

  // Combine channel volume × velocity first, then look up the perceptual
  // curve — matches Chocolate Doom's CalculateVolume.
  int raw = (clamp_i(ch->volume, 0, 127) * clamp_i(velocity, 0, 127)) / 127;
  int combined = VOLUME_MAPPING[raw];
  int base = pv->car.level & 0x3f;
  int attenuation = 0x3f - (((0x3f - base) * combined) / 127);
  int reg = operator_reg(voice_idx, 0x40, 1);
  OPL3_WriteRegBuffered(p->opl, reg,
                        (pv->car.ksl & 0xc0) | (attenuation & 0x3f));
}

static void write_voice_c0(oplplayer *p, int voice_idx) {
  oplplayer_voice_state *voice = &p->voices[voice_idx];
  const genmidi_voice *pv = voice->patchVoice;
  if (!pv) {
    return;
  }
  int pan = p->channels[voice->channel].pan;
  int stereo = 0x30;
  if (pan < 48) {
    stereo = 0x10;
  } else if (pan > 80) {
    stereo = 0x20;
  }
  int reg = voice_reg(voice_idx, 0xc0);
  OPL3_WriteRegBuffered(p->opl, reg, (pv->feedback & 0x0f) | stereo);
}

static const genmidi_instrument *resolve_instrument(oplplayer *p, int channel,
                                                    int note) {
  if (!p->instruments) {
    return 0;
  }
  if (channel == PERCUSSION_CHANNEL) {
    // MUS percussion notes 35..81 map to GENMIDI instruments 128..174.
    int idx = 128 + (note - 35);
    if (idx < 128 || idx >= p->instrument_count) {
      return 0;
    }
    return &p->instruments[idx];
  }
  int idx = p->channels[channel].instrument;
  if (idx < 0 || idx >= p->instrument_count) {
    return 0;
  }
  return &p->instruments[idx];
}

static void write_voice_freq(oplplayer *p, int voice_idx, int key_on) {
  oplplayer_voice_state *voice = &p->voices[voice_idx];
  const genmidi_voice *pv = voice->patchVoice;
  if (!pv) {
    return;
  }
  oplplayer_channel_state *ch = &p->channels[voice->channel];

  const genmidi_instrument *instr =
      resolve_instrument(p, voice->channel, voice->note);
  float note_semis;
  if (instr && (instr->flags & GENMIDI_FLAG_FIXED_PITCH)) {
    note_semis = (float)instr->fixedNote + voice->freqOffset;
  } else {
    float bend_semis = ((float)ch->pitchBend - 128.0f) / 64.0f;
    note_semis = (float)voice->note + voice->freqOffset + bend_semis;
  }

  oplplayer_fnum_block fb = oplplayer_note_to_fnum_block(note_semis);
  uint16_t block_fnum =
      (uint16_t)(((fb.block & 0x07) << 2) | ((fb.fnum >> 8) & 0x03));
  voice->blockFnum = block_fnum;

  OPL3_WriteRegBuffered(p->opl, voice_reg(voice_idx, 0xa0),
                        (uint8_t)(fb.fnum & 0xff));
  OPL3_WriteRegBuffered(p->opl, voice_reg(voice_idx, 0xb0),
                        (uint8_t)((key_on ? 0x20 : 0x00) | block_fnum));
}

static void silence_voice(oplplayer *p, int voice_idx) {
  oplplayer_voice_state *voice = &p->voices[voice_idx];
  // Clear key-on and zero the block/fnum so any residual oscillator is
  // muted promptly even if the operator has a long release.
  OPL3_WriteRegBuffered(p->opl, voice_reg(voice_idx, 0xb0), 0);
  voice->inUse = 0;
  voice->released = 0;
  voice->patchVoice = 0;
  voice->blockFnum = 0;
}

static void release_voice(oplplayer *p, int voice_idx) {
  oplplayer_voice_state *voice = &p->voices[voice_idx];
  if (!voice->inUse) {
    return;
  }
  voice->released = 1;
  // Clear the key-on bit while preserving block+F-num.
  OPL3_WriteRegBuffered(p->opl, voice_reg(voice_idx, 0xb0),
                        (uint8_t)voice->blockFnum);
}

static int alloc_voice(oplplayer *p) {
  // Prefer a slot that isn't holding any voice.
  for (int i = 0; i < NUM_VOICES; i++) {
    if (!p->voices[i].inUse) {
      return i;
    }
  }
  // Else steal the oldest released voice.
  int best_idx = -1;
  uint32_t best_age = 0;
  for (int i = 0; i < NUM_VOICES; i++) {
    if (p->voices[i].released) {
      if (best_idx < 0 || p->voices[i].age < best_age) {
        best_age = p->voices[i].age;
        best_idx = i;
      }
    }
  }
  if (best_idx >= 0) {
    silence_voice(p, best_idx);
    return best_idx;
  }
  // Else steal the oldest active voice.
  best_idx = 0;
  best_age = p->voices[0].age;
  for (int i = 1; i < NUM_VOICES; i++) {
    if (p->voices[i].age < best_age) {
      best_age = p->voices[i].age;
      best_idx = i;
    }
  }
  silence_voice(p, best_idx);
  return best_idx;
}

static void program_voice(oplplayer *p, int voice_idx, int channel, int note,
                          int velocity, const genmidi_instrument *instr,
                          const genmidi_voice *pv, int is_second_voice) {
  oplplayer_voice_state *voice = &p->voices[voice_idx];
  voice->inUse = 1;
  voice->released = 0;
  voice->channel = (uint8_t)channel;
  voice->note = (uint8_t)note;
  voice->patchVoice = pv;
  voice->isSecondVoice = (uint8_t)is_second_voice;
  voice->age = ++p->age_counter;

  // Per-voice frequency offset: patch's base note + second-voice detune.
  float freq_offset = (float)pv->baseNote;
  if (is_second_voice) {
    freq_offset += ((float)instr->fineTuning - 128.0f) / 64.0f;
  }
  voice->freqOffset = freq_offset;

  write_operator_regs(p, voice_idx, pv);
  write_voice_volume(p, voice_idx, velocity);
  write_voice_c0(p, voice_idx);
  write_voice_freq(p, voice_idx, 1);
}

static void play_note(oplplayer *p, int channel, int note, int volume) {
  oplplayer_channel_state *ch = &p->channels[channel];
  int velocity = volume < 0 ? ch->lastVelocity : volume;
  ch->lastVelocity = (uint8_t)velocity;

  const genmidi_instrument *instr = resolve_instrument(p, channel, note);
  if (!instr) {
    return;
  }

  int v1 = alloc_voice(p);
  program_voice(p, v1, channel, note, velocity, instr, &instr->voice1, 0);

  if (instr->flags & GENMIDI_FLAG_DOUBLE_VOICE) {
    int v2 = alloc_voice(p);
    program_voice(p, v2, channel, note, velocity, instr, &instr->voice2, 1);
  }
}

static void release_note(oplplayer *p, int channel, int note) {
  for (int i = 0; i < NUM_VOICES; i++) {
    oplplayer_voice_state *voice = &p->voices[i];
    if (voice->inUse && !voice->released && voice->channel == channel &&
        voice->note == note) {
      release_voice(p, i);
    }
  }
}

static void refresh_channel_freq(oplplayer *p, int channel) {
  for (int i = 0; i < NUM_VOICES; i++) {
    if (p->voices[i].inUse && p->voices[i].channel == channel) {
      write_voice_freq(p, i, !p->voices[i].released);
    }
  }
}

static void refresh_channel_volume(oplplayer *p, int channel) {
  for (int i = 0; i < NUM_VOICES; i++) {
    if (p->voices[i].inUse && p->voices[i].channel == channel) {
      write_voice_volume(p, i, p->channels[channel].lastVelocity);
    }
  }
}

static void refresh_channel_pan(oplplayer *p, int channel) {
  for (int i = 0; i < NUM_VOICES; i++) {
    if (p->voices[i].inUse && p->voices[i].channel == channel) {
      write_voice_c0(p, i);
    }
  }
}

static void handle_controller(oplplayer *p, int channel, int controller,
                              int value) {
  oplplayer_channel_state *ch = &p->channels[channel];
  switch (controller) {
  case 0: // instrument
    ch->instrument = (uint8_t)(value & 0x7f);
    break;
  case 3: // channel volume
    ch->volume = (uint8_t)(value & 0x7f);
    refresh_channel_volume(p, channel);
    break;
  case 4: // pan
    ch->pan = (uint8_t)(value & 0x7f);
    refresh_channel_pan(p, channel);
    break;
    // Other controllers (modulation, expression, reverb, chorus, sustain,
    // soft pedal) are intentionally ignored — OPL has no equivalent.
  }
}

static void handle_sys_event(oplplayer *p, int channel, int controller) {
  switch (controller) {
  case 10: // all sounds off
  case 11: // all notes off
    for (int i = 0; i < NUM_VOICES; i++) {
      if (p->voices[i].inUse && p->voices[i].channel == channel) {
        silence_voice(p, i);
      }
    }
    break;
  case 14: // reset all controllers
    p->channels[channel].volume = 127;
    p->channels[channel].pan = 64;
    p->channels[channel].pitchBend = 128;
    refresh_channel_freq(p, channel);
    refresh_channel_volume(p, channel);
    refresh_channel_pan(p, channel);
    break;
  }
}

void oplplayer_init(oplplayer *p, opl3_chip *opl) {
  p->opl = opl;
  p->instruments = 0;
  p->instrument_count = 0;
  p->age_counter = 0;
  for (int i = 0; i < NUM_VOICES; i++) {
    p->voices[i].inUse = 0;
    p->voices[i].released = 0;
    p->voices[i].channel = 0;
    p->voices[i].note = 0;
    p->voices[i].patchVoice = 0;
    p->voices[i].isSecondVoice = 0;
    p->voices[i].freqOffset = 0.0f;
    p->voices[i].blockFnum = 0;
    p->voices[i].age = 0;
  }
  for (int i = 0; i < NUM_MIDI_CHANNELS; i++) {
    p->channels[i].instrument = 0;
    p->channels[i].volume = 127;
    p->channels[i].pan = 64;
    p->channels[i].pitchBend = 128;
    p->channels[i].lastVelocity = 100;
  }
  // Enable OPL3 mode (newm=1) so stereo and the second bank work.
  OPL3_WriteRegBuffered(opl, 0x105, 0x01);
}

void oplplayer_set_genmidi(oplplayer *p, const genmidi_instrument *instruments,
                           int count) {
  p->instruments = instruments;
  p->instrument_count = count;
}

void oplplayer_reset(oplplayer *p) {
  for (int i = 0; i < NUM_VOICES; i++) {
    if (p->voices[i].inUse) {
      silence_voice(p, i);
    }
  }
  for (int i = 0; i < NUM_MIDI_CHANNELS; i++) {
    p->channels[i].instrument = 0;
    p->channels[i].volume = 127;
    p->channels[i].pan = 64;
    p->channels[i].pitchBend = 128;
    p->channels[i].lastVelocity = 100;
  }
}

void oplplayer_handle_event(oplplayer *p, const mus_event *ev) {
  if (!p->instruments) {
    return;
  }
  switch (ev->kind) {
  case MUS_EVENT_PLAY_NOTE:
    play_note(p, ev->channel, ev->note, ev->volume);
    break;
  case MUS_EVENT_RELEASE_NOTE:
    release_note(p, ev->channel, ev->note);
    break;
  case MUS_EVENT_PITCH_BEND:
    p->channels[ev->channel].pitchBend = (uint8_t)ev->value;
    refresh_channel_freq(p, ev->channel);
    break;
  case MUS_EVENT_CONTROLLER:
    handle_controller(p, ev->channel, ev->controller, ev->value);
    break;
  case MUS_EVENT_SYS_EVENT:
    handle_sys_event(p, ev->channel, ev->controller);
    break;
  case MUS_EVENT_SCORE_END:
    break;
  }
}

int oplplayer_active_voice_count(const oplplayer *p) {
  int n = 0;
  for (int i = 0; i < NUM_VOICES; i++) {
    if (p->voices[i].inUse && !p->voices[i].released) {
      n++;
    }
  }
  return n;
}
