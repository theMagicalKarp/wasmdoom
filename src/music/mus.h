#ifndef MUS_H
#define MUS_H

#include <stdint.h>

#define MUS_TICK_RATE 140

typedef enum {
  MUS_OK = 0,
  MUS_ERR_TOO_SHORT = -1,
  MUS_ERR_BAD_MAGIC = -2,
  MUS_ERR_OVERFLOW = -3,
} mus_result;

typedef enum {
  MUS_EVENT_RELEASE_NOTE = 0,
  MUS_EVENT_PLAY_NOTE,
  MUS_EVENT_PITCH_BEND,
  MUS_EVENT_SYS_EVENT,
  MUS_EVENT_CONTROLLER,
  MUS_EVENT_SCORE_END,
} mus_event_kind;

typedef struct {
  mus_event_kind kind;
  int channel;
  int note;       // for play/release
  int volume;     // for play; -1 means "reuse channel last velocity"
  int value;      // for pitchBend / controller
  int controller; // for sysEvent / controller
} mus_event;

typedef struct {
  int score_len;
  int score_start;
  int channels;
  int sec_channels;
  int instrument_count;
} mus_header;

typedef struct {
  const uint8_t *data;
  int len;
  int score_start;
  int pos;
  int delay; // ticks remaining until next event group fires
  int ended;
} mus_sequencer;

typedef void (*mus_event_cb)(void *ctx, const mus_event *ev);

// Parse the MUS header (does not store the data pointer).
mus_result mus_parse_header(const uint8_t *data, int len, mus_header *out);

// Initialise sequencer (validates header). Stores `data` by pointer; the
// caller must keep the bytes alive for the sequencer's lifetime.
mus_result mus_sequencer_init(mus_sequencer *seq, const uint8_t *data, int len);

void mus_sequencer_reset(mus_sequencer *seq);
int mus_sequencer_ended(const mus_sequencer *seq);

// Advance the sequencer by `ticks` ticks at the MUS rate, invoking `cb` for
// each event whose group fires within that window. With `loop=1`, scoreEnd
// rewinds to scoreStart and continues consuming the remaining ticks; without
// loop, scoreEnd ends the stream and a final MUS_EVENT_SCORE_END event is
// emitted exactly once.
//
// If looping wraps without any ticks elapsing in a full cycle (degenerate
// scores whose every delay is zero), the sequencer ends to avoid spinning.
void mus_sequencer_advance(mus_sequencer *seq, int ticks, int loop,
                           mus_event_cb cb, void *ctx);

#endif
