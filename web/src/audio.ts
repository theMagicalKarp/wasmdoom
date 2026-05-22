// Web Audio host for wasmdoom SFX.
//
// The wasm platform layer (src/i_sound.c) pushes sound events to us via the
// `doom_host` imports below; we own the Web Audio graph and decode each unique
// DMX lump exactly once. See SOUND_PLAN.md for the full design.
//
// Doom SFX are DMX lumps: an 8-byte header (format, sample rate, sample count)
// followed by unsigned 8-bit mono PCM. Stock Doom is always 11025 Hz; the
// browser resamples to the device rate for us.

const DMX_HEADER_BYTES = 8;
const DMX_SAMPLE_RATE = 11025;

type Voice = {
  src: AudioBufferSourceNode;
  gain: GainNode;
  pan: StereoPannerNode;
};

export type DoomAudioImports = {
  wasmdoom_sound_start(
    handle: number,
    sfxId: number,
    ptr: number,
    len: number,
    vol: number,
    sep: number,
    pitch: number,
  ): void;
  wasmdoom_sound_stop(handle: number): void;
  wasmdoom_sound_update(
    handle: number,
    vol: number,
    sep: number,
    pitch: number,
  ): void;
  wasmdoom_sound_is_playing(handle: number): number;
};

export type DoomAudio = {
  // Spread into the `doom_host` import object before instantiation.
  imports: DoomAudioImports;
  // Call from a user gesture; browsers block audio until then.
  start(): void;
  suspend(): void;
  resume(): void;
};

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

// vol: 0-127, sep: 0-255 (0=left, 128=center, 255=right), pitch: 0-255 (128=1x).
function gainOf(vol: number): number {
  return clamp(vol / 127, 0, 1);
}
function panOf(sep: number): number {
  return clamp((sep - 128) / 127, -1, 1);
}
function rateOf(pitch: number): number {
  return Math.max(pitch, 1) / 128;
}

export function createDoomAudio(
  getMemory: () => WebAssembly.Memory,
): DoomAudio {
  let ctx: AudioContext | null = null;
  const sfxBuffers = new Map<number, AudioBuffer>();
  const voices = new Map<number, Voice>();

  function decodeSfx(
    audioCtx: AudioContext,
    ptr: number,
    len: number,
  ): AudioBuffer {
    const raw = new Uint8Array(getMemory().buffer, ptr, len);
    const sampleCount = Math.max(0, len - DMX_HEADER_BYTES);
    const buffer = audioCtx.createBuffer(1, sampleCount, DMX_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      channel[i] = (raw[DMX_HEADER_BYTES + i] - 128) / 128;
    }
    return buffer;
  }

  const imports: DoomAudioImports = {
    wasmdoom_sound_start(handle, sfxId, ptr, len, vol, sep, pitch) {
      if (!ctx) {
        return; // no audio until the first user gesture
      }

      let buffer = sfxBuffers.get(sfxId);
      if (!buffer) {
        buffer = decodeSfx(ctx, ptr, len);
        sfxBuffers.set(sfxId, buffer);
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rateOf(pitch);
      const pan = ctx.createStereoPanner();
      pan.pan.value = panOf(sep);
      const gain = ctx.createGain();
      gain.gain.value = gainOf(vol);

      src.connect(pan).connect(gain).connect(ctx.destination);
      src.onended = () => {
        voices.delete(handle);
      };
      voices.set(handle, { src, gain, pan });
      src.start();
    },

    wasmdoom_sound_stop(handle) {
      const voice = voices.get(handle);
      if (!voice) return;
      voice.src.onended = null;
      try {
        voice.src.stop();
      } catch {
        // already stopped/ended
      }
      voices.delete(handle);
    },

    wasmdoom_sound_update(handle, vol, sep, pitch) {
      const voice = voices.get(handle);
      if (!voice) {
        return;
      }
      voice.gain.gain.value = gainOf(vol);
      voice.pan.pan.value = panOf(sep);
      voice.src.playbackRate.value = rateOf(pitch);
    },

    wasmdoom_sound_is_playing(handle) {
      return voices.has(handle) ? 1 : 0;
    },
  };

  return {
    imports,
    start() {
      if (!ctx) {
        ctx = new AudioContext();
      }
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
    },
    suspend() {
      if (ctx && ctx.state === "running") {
        void ctx.suspend();
      }
    },
    resume() {
      if (ctx && ctx.state === "suspended") {
        void ctx.resume();
      }
    },
  };
}
