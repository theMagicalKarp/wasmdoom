// Host-side wrapper around the freestanding music wasm
// (zig-out/bin/wasmdoom.music.wasm, built from src/music/*.c).
//
// It drives the same marshalling contract the browser AudioWorklet uses
// (web/src/music/music-worklet.ts): alloc -> copy -> register -> play ->
// render in 2048-frame blocks until wasmdoom_music_active() goes false.

import { readFile } from "node:fs/promises";
import type { Lump } from "./wad";

export const SAMPLE_RATE = 44100;
export const CHANNELS = 2;
export const MAX_RENDER_FRAMES = 2048; // WASMDOOM_MUSIC_MAX_RENDER_FRAMES
export const SONG_MAX_SIZE = 128 * 1024; // WASMDOOM_MUSIC_SONG_MAX_SIZE
export const SAFETY_CAP_SECONDS = 600; // guard against a song that never ends
export const SILENCE_THRESHOLD = 1e-4; // peak below this counts as silent

export type WasmDoomMusicExports = {
  memory: WebAssembly.Memory;
  wasmdoom_music_init: (sampleRate: number) => void;
  wasmdoom_music_alloc: (len: number) => number;
  wasmdoom_music_set_genmidi: (ptr: number, len: number) => void;
  wasmdoom_music_register: (handle: number, ptr: number, len: number) => void;
  wasmdoom_music_play: (handle: number, looping: number) => void;
  wasmdoom_music_render: (frames: number) => number;
  wasmdoom_music_active: () => number;
};

export type WasmdoomMusicInstance = WebAssembly.Instance & {
  exports: WasmDoomMusicExports;
};

const REQUIRED_FUNCTIONS = [
  "wasmdoom_music_init",
  "wasmdoom_music_alloc",
  "wasmdoom_music_set_genmidi",
  "wasmdoom_music_register",
  "wasmdoom_music_play",
  "wasmdoom_music_render",
  "wasmdoom_music_active",
] as const;

function assertWasmdoomMusicInstance(
  instance: WebAssembly.Instance,
): asserts instance is WasmdoomMusicInstance {
  const { memory } = instance.exports;
  if (!(memory instanceof WebAssembly.Memory)) {
    throw new Error("wasm module is missing a `memory` export");
  }

  for (const name of REQUIRED_FUNCTIONS) {
    if (typeof instance.exports[name] !== "function") {
      throw new Error(`wasm module is missing a \`${name}\` export`);
    }
  }
}

export type RenderStatus =
  | "ok"
  | "silent"
  | "bad-header"
  | "too-large"
  | "truncated";

export interface RenderOutput {
  started: boolean;
  samples: Float32Array; // interleaved stereo
  frames: number;
  seconds: number; // frames / SAMPLE_RATE
  peak: number;
  truncated: boolean;
  ok: boolean; // started && peak > SILENCE_THRESHOLD
  status: RenderStatus;
}

export class WasmDoomMusic {
  readonly instance: WasmdoomMusicInstance;

  private constructor(instance: WasmdoomMusicInstance) {
    this.instance = instance;
  }

  static async init(wasmPath: string): Promise<WasmDoomMusic> {
    const module = new WebAssembly.Module(await readFile(wasmPath));
    const instance = new WebAssembly.Instance(module, {});
    assertWasmdoomMusicInstance(instance);

    instance.exports.wasmdoom_music_init(SAMPLE_RATE);

    return new WasmDoomMusic(instance);
  }

  private stage(data: Uint8Array): number {
    const ptr = this.instance.exports.wasmdoom_music_alloc(data.length);
    if (ptr === 0) {
      throw new Error(`alloc(${data.length}) failed (exceeds staging buffer)`);
    }
    new Uint8Array(this.instance.exports.memory.buffer, ptr, data.length).set(
      data,
    );
    return ptr;
  }

  loadGenmidi(lump: Lump): void {
    this.instance.exports.wasmdoom_music_set_genmidi(
      this.stage(lump.data),
      lump.data.length,
    );
  }

  // Result for a track that never produced samples (rejected before rendering).
  private notStarted(status: RenderStatus): RenderOutput {
    return {
      started: false,
      samples: new Float32Array(0),
      frames: 0,
      seconds: 0,
      peak: 0,
      truncated: false,
      ok: false,
      status,
    };
  }

  renderTrack(mus: Uint8Array): RenderOutput {
    // The song has to fit the wasm staging buffer; reject oversized lumps before
    // touching the synth.
    if (mus.length > SONG_MAX_SIZE) {
      return this.notStarted("too-large");
    }

    // Re-init per track so the OPL chip starts from a clean state; the parsed
    // GENMIDI bank persists across init (g_genmidi_loaded stays set).
    this.instance.exports.wasmdoom_music_init(SAMPLE_RATE);
    const handle = 1;
    this.instance.exports.wasmdoom_music_register(
      handle,
      this.stage(mus),
      mus.length,
    );
    this.instance.exports.wasmdoom_music_play(handle, 0); // looping=0 so the song ends

    // play() only marks the song active if its header parsed; if not, bail.
    if (this.instance.exports.wasmdoom_music_active() === 0) {
      return this.notStarted("bad-header");
    }

    const capFrames = SAMPLE_RATE * SAFETY_CAP_SECONDS;
    const blocks: Float32Array[] = [];
    let frames = 0;
    let peak = 0;
    let truncated = false;
    do {
      const ptr =
        this.instance.exports.wasmdoom_music_render(MAX_RENDER_FRAMES);
      const view = new Float32Array(
        this.instance.exports.memory.buffer,
        ptr,
        2 * MAX_RENDER_FRAMES,
      );
      const block = view.slice(); // copy out before the next render reuses it
      blocks.push(block);
      frames += MAX_RENDER_FRAMES;
      for (let i = 0; i < block.length; i++) {
        const magnitude = Math.abs(block[i]);
        if (magnitude > peak) peak = magnitude;
      }
      if (frames >= capFrames) {
        truncated = true;
        break;
      }
    } while (this.instance.exports.wasmdoom_music_active() !== 0);

    const samples = new Float32Array(frames * CHANNELS);
    let offset = 0;
    for (const block of blocks) {
      samples.set(block, offset);
      offset += block.length;
    }

    const ok = peak > SILENCE_THRESHOLD; // started is already true here
    const status: RenderStatus = !ok
      ? "silent"
      : truncated
        ? "truncated"
        : "ok";
    return {
      started: true,
      samples,
      frames,
      seconds: frames / SAMPLE_RATE,
      peak,
      truncated,
      ok,
      status,
    };
  }
}
