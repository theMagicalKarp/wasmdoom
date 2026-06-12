import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EVENT,
  createEventDispatcher,
  type EventBufferExports,
} from "./doom-events.ts";

// Stand-in for the wasm module: a real WebAssembly.Memory plus exports that
// the dispatcher reads each drain pass.
function makeFakeDoom(): {
  doom: EventBufferExports;
  write(records: Uint8Array): void;
} {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const bufferBase = 1024;
  let length = 0;
  const doom: EventBufferExports = {
    memory,
    wasmdoom_events_ptr: () => bufferBase,
    wasmdoom_events_len: () => length,
    wasmdoom_events_clear: () => {},
  };
  return {
    doom,
    write(records: Uint8Array): void {
      new Uint8Array(memory.buffer).set(records, bufferBase);
      length = records.length;
    },
  };
}

function record(tag: number, payload: number[]): Uint8Array {
  const buf = new ArrayBuffer(4 + payload.length);
  const view = new DataView(buf);
  view.setUint16(0, tag, true);
  view.setUint16(2, payload.length, true);
  new Uint8Array(buf, 4).set(payload);
  return new Uint8Array(buf);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function u32(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
}

test("drain calls clear when the buffer is empty", () => {
  const { doom } = makeFakeDoom();
  const events = createEventDispatcher(doom);
  events.drain();
  // No-op: empty buffer means no clear is needed.
});

test("drain dispatches one record to the registered handler", () => {
  const { doom, write } = makeFakeDoom();
  const events = createEventDispatcher(doom);
  const got: { tag: number; value: number }[] = [];

  events.register(EVENT.SOUND_STOP, (view) => {
    got.push({ tag: EVENT.SOUND_STOP, value: view.getInt32(0, true) });
  });

  write(record(EVENT.SOUND_STOP, u32(42)));
  events.drain();

  assert.deepEqual(got, [{ tag: EVENT.SOUND_STOP, value: 42 }]);
});

test("drain walks multiple records in order", () => {
  const { doom, write } = makeFakeDoom();
  const events = createEventDispatcher(doom);
  const seen: number[] = [];

  events.register(EVENT.SOUND_STOP, (view) => {
    seen.push(view.getInt32(0, true));
  });

  write(
    concat([
      record(EVENT.SOUND_STOP, u32(1)),
      record(EVENT.SOUND_STOP, u32(2)),
      record(EVENT.SOUND_STOP, u32(3)),
    ]),
  );
  events.drain();

  assert.deepEqual(seen, [1, 2, 3]);
});

test("drain ignores records with no registered handler", () => {
  const { doom, write } = makeFakeDoom();
  const events = createEventDispatcher(doom);
  const seen: number[] = [];

  events.register(EVENT.SOUND_STOP, (view) => {
    seen.push(view.getInt32(0, true));
  });

  write(
    concat([
      record(EVENT.MUSIC_PLAY, [...u32(99), ...u32(1)]),
      record(EVENT.SOUND_STOP, u32(7)),
    ]),
  );
  events.drain();

  assert.deepEqual(seen, [7]);
});

test("drain decodes a sound_start payload's seven fields", () => {
  const { doom, write } = makeFakeDoom();
  const events = createEventDispatcher(doom);
  let payload: {
    handle: number;
    sfxId: number;
    ptr: number;
    len: number;
    vol: number;
    sep: number;
    pitch: number;
  } | null = null;

  events.register(EVENT.SOUND_START, (view) => {
    payload = {
      handle: view.getInt32(0, true),
      sfxId: view.getInt32(4, true),
      ptr: view.getUint32(8, true),
      len: view.getInt32(12, true),
      vol: view.getInt32(16, true),
      sep: view.getInt32(20, true),
      pitch: view.getInt32(24, true),
    };
  });

  write(
    record(EVENT.SOUND_START, [
      ...u32(11),
      ...u32(22),
      ...u32(0x10000),
      ...u32(2048),
      ...u32(96),
      ...u32(128),
      ...u32(130),
    ]),
  );
  events.drain();

  assert.deepEqual(payload, {
    handle: 11,
    sfxId: 22,
    ptr: 0x10000,
    len: 2048,
    vol: 96,
    sep: 128,
    pitch: 130,
  });
});

test("drain does not clear the buffer (wasmdoom_tick owns clearing)", () => {
  const { doom, write } = makeFakeDoom();
  const events = createEventDispatcher(doom);

  let calls = 0;
  events.register(EVENT.SOUND_STOP, () => {
    calls++;
  });

  write(record(EVENT.SOUND_STOP, u32(1)));
  // The dispatcher leaves the buffer intact; the C side clears it at the start
  // of each tick. So draining again without a fresh tick re-dispatches.
  events.drain();
  events.drain();
  assert.equal(calls, 2);
});
