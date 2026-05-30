import { test } from "node:test";
import assert from "node:assert/strict";

import { buildWav } from "./wav.ts";
import { CHANNELS, SAMPLE_RATE } from "./wasmdoom.music.ts";

// One stereo frame = two interleaved float samples.
const oneFrame = new Float32Array([0, 0]);

test("emits a 44-byte header plus 2 bytes per sample", () => {
  const wav = buildWav(new Float32Array(8));
  assert.equal(wav.length, 44 + 8 * 2);
});

test("writes the RIFF/WAVE/fmt /data chunk ids", () => {
  const wav = buildWav(oneFrame);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.toString("ascii", 12, 16), "fmt ");
  assert.equal(wav.toString("ascii", 36, 40), "data");
});

test("describes 16-bit PCM stereo at the synth sample rate", () => {
  const wav = buildWav(oneFrame);
  assert.equal(wav.readUInt32LE(16), 16, "fmt chunk size");
  assert.equal(wav.readUInt16LE(20), 1, "PCM format tag");
  assert.equal(wav.readUInt16LE(22), CHANNELS);
  assert.equal(wav.readUInt32LE(24), SAMPLE_RATE);
  assert.equal(wav.readUInt32LE(28), SAMPLE_RATE * CHANNELS * 2, "byte rate");
  assert.equal(wav.readUInt16LE(32), CHANNELS * 2, "block align");
  assert.equal(wav.readUInt16LE(34), 16, "bits per sample");
});

test("riff/data chunk sizes match the payload", () => {
  const samples = new Float32Array(10);
  const wav = buildWav(samples);
  const dataLen = samples.length * 2;
  assert.equal(wav.readUInt32LE(4), 36 + dataLen, "RIFF size");
  assert.equal(wav.readUInt32LE(40), dataLen, "data size");
});

test("scales floats to int16 and clamps out-of-range values", () => {
  const wav = buildWav(new Float32Array([0, 1, -1, 2, -2, 0.5]));
  assert.equal(wav.readInt16LE(44 + 0), 0);
  assert.equal(wav.readInt16LE(44 + 2), 32767, "1.0 -> max");
  assert.equal(wav.readInt16LE(44 + 4), -32767, "-1.0 -> -max");
  assert.equal(wav.readInt16LE(44 + 6), 32767, "clamp above 1.0");
  assert.equal(wav.readInt16LE(44 + 8), -32767, "clamp below -1.0");
  assert.equal(wav.readInt16LE(44 + 10), Math.round(0.5 * 32767));
});

test("preserves interleaved sample order", () => {
  const wav = buildWav(new Float32Array([0.25, -0.25]));
  assert.equal(wav.readInt16LE(44), Math.round(0.25 * 32767));
  assert.equal(wav.readInt16LE(46), Math.round(-0.25 * 32767));
});
