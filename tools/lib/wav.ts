// Build a 16-bit PCM stereo WAV from interleaved float32 samples.

import { CHANNELS, SAMPLE_RATE } from "./wasmdoom.music.ts";

const clamp = (num: number, min: number, max: number) =>
  Math.min(Math.max(num, min), max);

export function buildWav(samples: Float32Array): Buffer {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // PCM fmt chunk size
  buf.writeUInt16LE(1, 20); // format = PCM
  buf.writeUInt16LE(CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28); // byte rate
  buf.writeUInt16LE(CHANNELS * 2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataLen, 40);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = clamp(samples[i], -1, 1);
    buf.writeInt16LE(Math.round(s * 32767), o);
    o += 2;
  }
  return buf;
}
