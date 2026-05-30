// The public synth module — wraps OPL3 + GENMIDI parser + MUS sequencer +
// OPL player into the API documented in synth.h. All state is file-static.

#include "wasmdoom_music.h"

#include "genmidi.h"
#include "mus.h"
#include "opl/opl3.h"
#include "oplplayer.h"
#include "utils.h"

#define EXPORT(name) __attribute__((export_name(#name))) name

#define STAGE_SIZE WASMDOOM_MUSIC_STAGE_SIZE
#define SONG_MAX_SIZE WASMDOOM_MUSIC_SONG_MAX_SIZE
#define MAX_RENDER_FRAMES WASMDOOM_MUSIC_MAX_RENDER_FRAMES

// --- storage ---------------------------------------------------------------
static uint8_t g_staging[STAGE_SIZE];

static uint8_t g_song_data[SONG_MAX_SIZE];
static int g_song_len;
static int g_song_handle;

static genmidi_instrument g_instruments[GENMIDI_INSTRUMENT_COUNT];
static int g_genmidi_loaded;

static float g_render_buf[2 * MAX_RENDER_FRAMES];

// --- runtime state ---------------------------------------------------------
static int g_sample_rate;
static opl3_chip g_opl;
static oplplayer g_player;
static mus_sequencer g_seq;
static int g_current_handle;
static int g_loop;
static int g_paused;
static double g_tick_accum;
static float g_volume_scale = 1.0f;

// --- helpers ---------------------------------------------------------------
static void event_callback(void *ctx, const mus_event *ev) {
  oplplayer_handle_event((oplplayer *)ctx, ev);
}

// --- exports ---------------------------------------------------------------
void EXPORT(wasmdoom_music_init)(int sample_rate) {
  if (sample_rate <= 0) {
    sample_rate = 44100;
  }
  g_sample_rate = sample_rate;
  OPL3_Reset(&g_opl, (uint32_t)sample_rate);
  oplplayer_init(&g_player, &g_opl);
  if (g_genmidi_loaded) {
    oplplayer_set_genmidi(&g_player, g_instruments, GENMIDI_INSTRUMENT_COUNT);
  }
  g_current_handle = 0;
  g_paused = 0;
  g_loop = 0;
  g_tick_accum = 0.0;
  g_volume_scale = 1.0f;
}

uint8_t *EXPORT(wasmdoom_music_alloc)(int len) {
  if (len < 0 || len > STAGE_SIZE) {
    return 0;
  }
  return g_staging;
}

void EXPORT(wasmdoom_music_set_genmidi)(const uint8_t *data, int len) {
  if (parseGenmidi(data, len, g_instruments) < 0) {
    g_genmidi_loaded = 0;
    return;
  }
  g_genmidi_loaded = 1;
  oplplayer_set_genmidi(&g_player, g_instruments, GENMIDI_INSTRUMENT_COUNT);
}

void EXPORT(wasmdoom_music_register)(int handle, const uint8_t *data, int len) {
  if (handle <= 0 || len <= 0 || len > SONG_MAX_SIZE) {
    return;
  }

  copy_bytes(g_song_data, data, len);
  g_song_len = len;
  g_song_handle = handle;
}

void EXPORT(wasmdoom_music_play)(int handle, int looping) {
  if (handle != g_song_handle || g_song_handle == 0) {
    return;
  }
  oplplayer_reset(&g_player);
  if (mus_sequencer_init(&g_seq, g_song_data, g_song_len) != MUS_OK) {
    g_current_handle = 0;
    return;
  }
  g_current_handle = handle;
  g_paused = 0;
  g_loop = looping ? 1 : 0;
  g_tick_accum = 0.0;
}

void EXPORT(wasmdoom_music_pause)(int handle) {
  if (g_current_handle == handle) {
    g_paused = 1;
  }
}

void EXPORT(wasmdoom_music_resume)(int handle) {
  if (g_current_handle == handle) {
    g_paused = 0;
  }
}

void EXPORT(wasmdoom_music_stop)(int handle) {
  if (g_current_handle == handle) {
    oplplayer_reset(&g_player);
    g_current_handle = 0;
  }
}

void EXPORT(wasmdoom_music_unregister)(int handle) {
  if (g_song_handle == handle) {
    g_song_handle = 0;
    g_song_len = 0;
  }
  if (g_current_handle == handle) {
    oplplayer_reset(&g_player);
    g_current_handle = 0;
  }
}

void EXPORT(wasmdoom_music_set_volume)(int volume) {
  // Doom's S_SetMusicVolume passes 0..15 (despite the i_sound.h signature
  // claiming 0..127); preserve the same /16 scaling the previous TS host
  // applied so the menu slider still maps to roughly 0..1.
  volume = clamp_i(volume, 0, 16);
  g_volume_scale = (float)volume / 16.0f;
}

const float *EXPORT(wasmdoom_music_render)(int frames) {
  if (frames <= 0) {
    return g_render_buf;
  }
  if (frames > MAX_RENDER_FRAMES) {
    frames = MAX_RENDER_FRAMES;
  }

  // Pre-zero so the early-return paths (no song / paused / no genmidi)
  // produce silence without further work.
  zero_floats(g_render_buf, 2 * frames);

  if (!g_genmidi_loaded || g_current_handle == 0 || g_paused) {
    return g_render_buf;
  }

  // Advance the sequencer by the integer-tick portion of this block.
  g_tick_accum +=
      (double)frames * (double)MUS_TICK_RATE / (double)g_sample_rate;
  int ticks = (int)g_tick_accum;
  if (ticks > 0) {
    g_tick_accum -= (double)ticks;
    mus_sequencer_advance(&g_seq, ticks, g_loop, event_callback, &g_player);
    if (mus_sequencer_ended(&g_seq))
      g_current_handle = 0;
  }

  // Render OPL samples (configured to native sample_rate via OPL3_Reset, so
  // GenerateResampled does the rate conversion internally).
  int16_t s[2];
  for (int i = 0; i < frames; i++) {
    OPL3_GenerateResampled(&g_opl, s);
    g_render_buf[2 * i + 0] = ((float)s[0] / 32768.0f) * g_volume_scale;
    g_render_buf[2 * i + 1] = ((float)s[1] / 32768.0f) * g_volume_scale;
  }
  return g_render_buf;
}

int EXPORT(wasmdoom_music_active)(void) { return g_current_handle != 0; }
