// MUS (Doom music) reader and sequencer.
//
// MUS is a packed MIDI-derived format used by id Software. The lump is a
// header followed by a packed event stream:
//
//   0   4  magic "MUS\x1a"
//   4   2  scoreLen      (u16le) — bytes of event data
//   6   2  scoreStart    (u16le) — file offset of first event byte
//   8   2  channels      (u16le) — primary channel count
//   10  2  secChannels   (u16le)
//   12  2  instrumentCnt (u16le)
//   14  2  reserved
//   16  n  u16le instrument numbers (instrumentCnt of them)
//   ...    event stream begins at scoreStart, runs `scoreLen` bytes
//
// Each event begins with a status byte: [last:1][type:3][channel:4] (channel
// 15 is percussion). The status is followed by a type-specific payload, and
// if the `last` bit is set, by a variable-length delay in ticks (7-bit
// groups, high bit = continue). Tempo is 140 ticks/second. scoreEnd (type 6)
// terminates the song; on loop=1 the sequencer rewinds toscoreStart.
//
// https://doomwiki.org/wiki/MUS

#include "mus.h"

#define MUS_HEADER_FIXED_LEN 16

static int read_u16le(const uint8_t *p) { return p[0] | (p[1] << 8); }

static int mus_check_magic(const uint8_t *data) {
  return data[0] == 'M' && data[1] == 'U' && data[2] == 'S' && data[3] == 0x1a;
}

mus_result mus_parse_header(const uint8_t *data, int len, mus_header *out) {
  if (len < MUS_HEADER_FIXED_LEN) {
    return MUS_ERR_TOO_SHORT;
  }
  if (!mus_check_magic(data)) {
    return MUS_ERR_BAD_MAGIC;
  }

  int score_len = read_u16le(data + 4);
  int score_start = read_u16le(data + 6);
  int channels = read_u16le(data + 8);
  int sec_channels = read_u16le(data + 10);
  int instrument_count = read_u16le(data + 12);

  int table_end = MUS_HEADER_FIXED_LEN + instrument_count * 2;
  if (table_end > len) {
    return MUS_ERR_OVERFLOW;
  }

  if (score_start < 0 || score_len < 0) {
    return MUS_ERR_OVERFLOW;
  }

  if (score_start + score_len > len) {
    return MUS_ERR_OVERFLOW;
  }

  out->score_len = score_len;
  out->score_start = score_start;
  out->channels = channels;
  out->sec_channels = sec_channels;
  out->instrument_count = instrument_count;
  return MUS_OK;
}

mus_result mus_sequencer_init(mus_sequencer *seq, const uint8_t *data,
                              int len) {
  mus_header hdr;
  mus_result r = mus_parse_header(data, len, &hdr);
  if (r != MUS_OK) {
    return r;
  }

  seq->data = data;
  seq->len = len;
  seq->score_start = hdr.score_start;
  seq->pos = hdr.score_start;
  seq->delay = 0;
  seq->ended = 0;
  return MUS_OK;
}

void mus_sequencer_reset(mus_sequencer *seq) {
  seq->pos = seq->score_start;
  seq->delay = 0;
  seq->ended = 0;
}

int mus_sequencer_ended(const mus_sequencer *seq) { return seq->ended; }

static int read_delay(mus_sequencer *seq) {
  int result = 0;
  while (1) {
    uint8_t b = seq->data[seq->pos++];
    result = (result << 7) | (b & 0x7f);
    if (!(b & 0x80)) {
      return result;
    }
  }
}

void mus_sequencer_advance(mus_sequencer *seq, int ticks, int loop,
                           mus_event_cb cb, void *ctx) {
  int remaining = ticks;
  int progress_since_last_reset = 0;

  while (remaining > 0) {
    if (seq->ended) {
      return;
    }

    if (seq->delay > 0) {
      int consume = remaining < seq->delay ? remaining : seq->delay;
      seq->delay -= consume;
      remaining -= consume;
      progress_since_last_reset = 1;
      if (seq->delay > 0) {
        break;
      }
    }

    uint8_t status = seq->data[seq->pos++];
    int last = (status & 0x80) != 0;
    int type = (status >> 4) & 0x07;
    int channel = status & 0x0f;

    mus_event ev;
    ev.channel = channel;
    ev.note = 0;
    ev.volume = -1;
    ev.value = 0;
    ev.controller = 0;

    switch (type) {
    case 0: {
      ev.kind = MUS_EVENT_RELEASE_NOTE;
      ev.note = seq->data[seq->pos++] & 0x7f;
      break;
    }
    case 1: {
      ev.kind = MUS_EVENT_PLAY_NOTE;
      uint8_t note_byte = seq->data[seq->pos++];
      int has_volume = (note_byte & 0x80) != 0;
      ev.note = note_byte & 0x7f;
      ev.volume = has_volume ? (seq->data[seq->pos++] & 0x7f) : -1;
      break;
    }
    case 2: {
      ev.kind = MUS_EVENT_PITCH_BEND;
      ev.value = seq->data[seq->pos++];
      break;
    }
    case 3: {
      ev.kind = MUS_EVENT_SYS_EVENT;
      ev.controller = seq->data[seq->pos++] & 0x7f;
      break;
    }
    case 4: {
      ev.kind = MUS_EVENT_CONTROLLER;
      ev.controller = seq->data[seq->pos++] & 0x7f;
      ev.value = seq->data[seq->pos++] & 0x7f;
      break;
    }
    case 6: {
      ev.kind = MUS_EVENT_SCORE_END;
      cb(ctx, &ev);
      if (loop) {
        mus_sequencer_reset(seq);
        progress_since_last_reset = 0;
        continue;
      }
      seq->ended = 1;
      return;
    }
    default:
      // Unknown event types (5, 7) have no body in any known MUS lump,
      // but be defensive and end the stream.
      seq->ended = 1;
      return;
    }

    cb(ctx, &ev);
    if (last) {
      seq->delay = read_delay(seq);
    }
  }
}
