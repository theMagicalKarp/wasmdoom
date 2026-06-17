// Web Audio host for wasmdoom SFX and music.
//
// The wasm engine drops sound/music records into its outbound event buffer
// each tick; we register handlers with the event dispatcher and turn those
// records into Web Audio operations. Music is synthesized in an AudioWorklet
// from the WAD's GENMIDI/MUS lumps.
//
// Doom SFX are DMX lumps: an 8-byte header (format, sample rate, sample count)
// followed by unsigned 8-bit mono PCM. Stock Doom is always 11025 Hz; the
// browser resamples to the device rate for us.

import { EVENT, type EventDispatcher } from "@wasmdoom/lib/wasmdoom-events.ts";
import type { MusicWorkletMessage } from "./music/music-worklet.ts";
import workletURL from "./music/music-worklet.ts?worker&url";
import { pathJoin } from "./utils.ts";

const { BASE_URL } = import.meta.env;

const DMX_HEADER_BYTES = 8;
const DMX_SAMPLE_RATE = 11025;
const MUSIC_WORKLET_NAME = "wasmdoom.music";
const MUSIC_WASM_URL = "wasmdoom.music.wasm";

type Voice = {
  src: AudioBufferSourceNode;
  gain: GainNode;
  pan: StereoPannerNode;
};

export type AudioWasmExports = {
  memory: WebAssembly.Memory;
};

export type DoomAudio = {
  // Register handlers for sound/music events on the dispatcher. The exports
  // ref is captured so handlers can read SFX/MUS bytes from wasm memory each
  // time a record fires.
  register(events: EventDispatcher, doom: AudioWasmExports): void;
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

export function createDoomAudio(): DoomAudio {
  let ctx: AudioContext | null = null;
  const sfxBuffers = new Map<number, AudioBuffer>();
  const voices = new Map<number, Voice>();

  // Music state. Messages that arrive before the worklet finishes loading are
  // queued and flushed once it's ready; `S_Start` runs before the first user
  // gesture, so set_genmidi/register are routinely buffered.
  let musicNode: AudioWorkletNode | null = null;
  let musicQueue: Array<{
    msg: MusicWorkletMessage;
    transfer: Transferable[];
  }> = [];

  function postMusic(
    msg: MusicWorkletMessage,
    transfer: Transferable[] = [],
  ): void {
    if (musicNode) {
      musicNode.port.postMessage(msg, transfer);
    } else {
      musicQueue.push({ msg, transfer });
    }
  }

  async function setupMusicWorklet(audioCtx: AudioContext): Promise<void> {
    const musicWasmUrl = pathJoin(BASE_URL, MUSIC_WASM_URL);
    console.log("[wasmdoom] music setup starting", {
      workletURL,
      musicWasmUrl,
    });

    // AudioWorklet is only exposed in a secure context. localhost counts, but a
    // bare LAN IP over plain HTTP (e.g. the dev server's 0.0.0.0 host) does not,
    // so audioCtx.audioWorklet is undefined there. Bail with a clear message.
    if (!audioCtx.audioWorklet) {
      console.error(
        "[wasmdoom] AudioWorklet unavailable (music disabled): the page must " +
          "be loaded from a secure context. Use http://localhost instead of a " +
          "LAN IP, or serve over HTTPS.",
      );
      return;
    }

    let musicWasm: ArrayBuffer;
    try {
      const resp = await fetch(musicWasmUrl);
      musicWasm = await resp.arrayBuffer();
    } catch (err) {
      console.error("[wasmdoom] music wasm failed to fetch:", err);
      return;
    }

    try {
      await audioCtx.audioWorklet.addModule(workletURL);
    } catch (err) {
      console.error("[wasmdoom] music worklet failed to load:", err);
      return;
    }

    let node: AudioWorkletNode;
    try {
      node = new AudioWorkletNode(audioCtx, MUSIC_WORKLET_NAME, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
    } catch (err) {
      console.error("[wasmdoom] AudioWorkletNode construction failed:", err);
      return;
    }
    node.port.onmessage = (e) => console.log("[music]", e.data);
    node.onprocessorerror = (e) =>
      console.error("[wasmdoom] worklet processor error:", e);
    node.connect(audioCtx.destination);
    node.port.postMessage({ type: "init", wasm: musicWasm }, [musicWasm]);
    musicNode = node;
    for (const { msg, transfer } of musicQueue) {
      node.port.postMessage(msg, transfer);
    }
    musicQueue = [];
  }

  function register(events: EventDispatcher, doom: AudioWasmExports): void {
    function copyMemoryRange(ptr: number, len: number): ArrayBuffer {
      const src = new Uint8Array(doom.memory.buffer, ptr, len);
      const buf = new ArrayBuffer(len);
      new Uint8Array(buf).set(src);
      return buf;
    }

    function decodeSfx(
      audioCtx: AudioContext,
      ptr: number,
      len: number,
    ): AudioBuffer {
      const raw = new Uint8Array(doom.memory.buffer, ptr, len);
      const sampleCount = Math.max(0, len - DMX_HEADER_BYTES);
      const buffer = audioCtx.createBuffer(1, sampleCount, DMX_SAMPLE_RATE);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < sampleCount; i++) {
        channel[i] = (raw[DMX_HEADER_BYTES + i] - 128) / 128;
      }
      return buffer;
    }

    events.register(EVENT.SOUND_START, (view) => {
      const handle = view.getInt32(0, true);
      const sfxId = view.getInt32(4, true);
      const ptr = view.getUint32(8, true);
      const len = view.getInt32(12, true);
      const vol = view.getInt32(16, true);
      const sep = view.getInt32(20, true);
      const pitch = view.getInt32(24, true);

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
    });

    events.register(EVENT.SOUND_STOP, (view) => {
      const handle = view.getInt32(0, true);
      const voice = voices.get(handle);
      if (!voice) return;
      voice.src.onended = null;
      try {
        voice.src.stop();
      } catch {
        // already stopped/ended
      }
      voices.delete(handle);
    });

    events.register(EVENT.SOUND_UPDATE, (view) => {
      const handle = view.getInt32(0, true);
      const vol = view.getInt32(4, true);
      const sep = view.getInt32(8, true);
      const pitch = view.getInt32(12, true);
      const voice = voices.get(handle);
      if (!voice) return;
      voice.gain.gain.value = gainOf(vol);
      voice.pan.pan.value = panOf(sep);
      voice.src.playbackRate.value = rateOf(pitch);
    });

    events.register(EVENT.MUSIC_SET_GENMIDI, (view) => {
      const ptr = view.getUint32(0, true);
      const len = view.getInt32(4, true);
      if (len <= 0) return;
      const data = copyMemoryRange(ptr, len);
      postMusic({ type: "setGenmidi", data }, [data]);
    });

    events.register(EVENT.MUSIC_REGISTER, (view) => {
      const handle = view.getInt32(0, true);
      const ptr = view.getUint32(4, true);
      const len = view.getInt32(8, true);
      if (len <= 0) return;
      const data = copyMemoryRange(ptr, len);
      postMusic({ type: "register", handle, data }, [data]);
    });

    events.register(EVENT.MUSIC_PLAY, (view) => {
      const handle = view.getInt32(0, true);
      const looping = view.getInt32(4, true);
      postMusic({ type: "play", handle, looping: looping !== 0 });
    });

    events.register(EVENT.MUSIC_PAUSE, (view) => {
      const handle = view.getInt32(0, true);
      postMusic({ type: "pause", handle });
    });

    events.register(EVENT.MUSIC_RESUME, (view) => {
      const handle = view.getInt32(0, true);
      postMusic({ type: "resume", handle });
    });

    events.register(EVENT.MUSIC_STOP, (view) => {
      const handle = view.getInt32(0, true);
      postMusic({ type: "stop", handle });
    });

    events.register(EVENT.MUSIC_UNREGISTER, (view) => {
      const handle = view.getInt32(0, true);
      postMusic({ type: "unregister", handle });
    });

    events.register(EVENT.MUSIC_SET_VOLUME, (view) => {
      const volume = view.getInt32(0, true);
      postMusic({ type: "setVolume", volume });
    });
  }

  return {
    register,
    start() {
      if (!ctx) {
        ctx = new AudioContext();
        // Kick off the worklet load; messages keep queueing until it's ready.
        void setupMusicWorklet(ctx);
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
