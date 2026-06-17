// AudioWorklet processor that drives MUS playback off the main thread.
//
// All synthesis lives in wasmdoom.music.wasm (built from src/music/*.c). The
// main thread compiles the module and posts the WebAssembly.Module here; we
// instantiate it with an empty import object (the synth is freestanding) and
// forward host calls into its exports.
//
// Marshalling is straightforward: for any call that takes bytes (setGenmidi,
// register), we ask the synth for a pointer via `wasmdoom_music_alloc`, write
// the bytes into wasm memory at that pointer, then call the consumer. For
// rendering, `wasmdoom_music_render(frames)` returns a pointer to an interleaved
// stereo float32 block of length 2*frames that we deinterleave into the output.
//
import {
  assertWasmdoomMusicExports,
  type WasmDoomMusicExports,
} from "@wasmdoom/lib/wasmdoom-music-exports.ts";

// AudioWorkletGlobalScope provides `sampleRate`, `AudioWorkletProcessor`, and
// `registerProcessor`; declare them locally since the DOM lib isn't loaded.
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;

export type MusicWorkletMessage =
  | { type: "init"; wasm: ArrayBuffer }
  | { type: "setGenmidi"; data: ArrayBuffer }
  | { type: "register"; handle: number; data: ArrayBuffer }
  | { type: "play"; handle: number; looping: boolean }
  | { type: "pause"; handle: number }
  | { type: "resume"; handle: number }
  | { type: "stop"; handle: number }
  | { type: "unregister"; handle: number }
  | { type: "setVolume"; volume: number };

class MusicProcessor extends AudioWorkletProcessor {
  private wasmDoomMusic: WasmDoomMusicExports | null = null;
  private pending: MusicWorkletMessage[] = [];

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<MusicWorkletMessage>) => {
      try {
        this.onMessage(e.data);
      } catch (err) {
        this.port.postMessage({
          debug: "onmessage-threw",
          type: e.data?.type,
          err: String(err),
          stack: (err as Error)?.stack ?? null,
        });
      }
    };
    this.port.start();
  }

  private onMessage(msg: MusicWorkletMessage): void {
    if (msg.type === "init") {
      // Synchronous compile from bytes — Module objects don't survive the
      // AudioWorklet port's structured clone, so the main thread sends the
      // raw wasm bytes and we compile here.
      const mod = new WebAssembly.Module(msg.wasm);
      const inst = new WebAssembly.Instance(mod, {});
      assertWasmdoomMusicExports(inst.exports);
      this.wasmDoomMusic = inst.exports;
      this.wasmDoomMusic.wasmdoom_music_init(sampleRate);
      for (const queued of this.pending) {
        this.dispatch(queued);
      }
      this.pending = [];
      return;
    }
    if (!this.wasmDoomMusic) {
      this.pending.push(msg);
      return;
    }
    this.dispatch(msg);
  }

  private dispatch(msg: MusicWorkletMessage): void {
    const synth = this.wasmDoomMusic!;
    switch (msg.type) {
      case "setGenmidi": {
        const ptr = this.stage(msg.data);
        if (ptr !== 0) {
          synth.wasmdoom_music_set_genmidi(ptr, msg.data.byteLength);
        }
        break;
      }
      case "register": {
        const ptr = this.stage(msg.data);
        if (ptr !== 0) {
          synth.wasmdoom_music_register(msg.handle, ptr, msg.data.byteLength);
        }
        break;
      }
      case "play":
        synth.wasmdoom_music_play(msg.handle, msg.looping ? 1 : 0);
        break;
      case "pause":
        synth.wasmdoom_music_pause(msg.handle);
        break;
      case "resume":
        synth.wasmdoom_music_resume(msg.handle);
        break;
      case "stop":
        synth.wasmdoom_music_stop(msg.handle);
        break;
      case "unregister":
        synth.wasmdoom_music_unregister(msg.handle);
        break;
      case "setVolume":
        synth.wasmdoom_music_set_volume(msg.volume);
        break;
    }
  }

  private stage(data: ArrayBuffer): number {
    const synth = this.wasmDoomMusic!;
    const ptr = synth.wasmdoom_music_alloc(data.byteLength);
    if (ptr === 0) {
      return 0;
    }
    new Uint8Array(synth.memory.buffer, ptr, data.byteLength).set(
      new Uint8Array(data),
    );
    return ptr;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length === 0) {
      return true;
    }
    const left = out[0];
    const frames = left.length;
    const right = out.length >= 2 ? out[1] : null;

    if (!this.wasmDoomMusic) {
      left.fill(0);
      if (right) {
        right.fill(0);
      }
      return true;
    }

    const ptr = this.wasmDoomMusic.wasmdoom_music_render(frames);
    const view = new Float32Array(
      this.wasmDoomMusic.memory.buffer,
      ptr,
      2 * frames,
    );
    for (let i = 0; i < frames; i++) {
      left[i] = view[2 * i];
      if (right) {
        right[i] = view[2 * i + 1];
      }
    }
    return true;
  }
}

registerProcessor("wasmdoom.music", MusicProcessor);
