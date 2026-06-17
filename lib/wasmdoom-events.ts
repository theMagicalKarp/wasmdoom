// The engine's outbound event buffer: the tag enum (mirroring src/wd_events.h),
// the wire format, and the decoder shared by the browser host (web/src/main.ts,
// doom-audio.ts, doom-save.ts via createEventDispatcher) and the headless host
// (tools/lib/wasmdoom-headless.ts, which scans for log/error tags).
//
// The C side appends records into a static buffer during wasmdoom_init /
// wasmdoom_tick; the host drains them after each call. Each record is a u16 tag,
// a u16 payload length, then payload bytes — all little-endian.

export const EVENT = {
  ERROR: 1,
  SOUND_START: 2,
  SOUND_STOP: 3,
  SOUND_UPDATE: 4,
  MUSIC_SET_GENMIDI: 5,
  MUSIC_REGISTER: 6,
  MUSIC_PLAY: 7,
  MUSIC_PAUSE: 8,
  MUSIC_RESUME: 9,
  MUSIC_STOP: 10,
  MUSIC_UNREGISTER: 11,
  MUSIC_SET_VOLUME: 12,
  SAVE_WRITTEN: 13,
  INFO: 14,
  WARNING: 15,
} as const;

export type EventBufferExports = {
  memory: WebAssembly.Memory;
  wasmdoom_events_ptr(): number;
  wasmdoom_events_len(): number;
  wasmdoom_events_clear(): void;
};

// Walk the outbound event records *without* consuming the buffer. Each yielded
// payload view is scoped to that record, so reads start at offset 0 and can't
// run past it; a truncated trailing record stops iteration. The caller decides
// whether and when to call wasmdoom_events_clear() — the dispatcher clears after
// draining, while the crash-path reader leaves the buffer intact.
export function* readEvents(
  doom: EventBufferExports,
): Generator<{ tag: number; payload: DataView }> {
  const len = doom.wasmdoom_events_len();
  if (len === 0) {
    return;
  }
  const base = doom.wasmdoom_events_ptr();
  const header = new DataView(doom.memory.buffer, base, len);
  let offset = 0;
  while (offset + 4 <= len) {
    const tag = header.getUint16(offset, true);
    const payloadLen = header.getUint16(offset + 2, true);
    const payloadStart = offset + 4;
    if (payloadStart + payloadLen > len) {
      // Truncated record; stop here. Should not happen if the C side is
      // well-behaved.
      break;
    }
    yield {
      tag,
      payload: new DataView(
        doom.memory.buffer,
        base + payloadStart,
        payloadLen,
      ),
    };
    offset = payloadStart + payloadLen;
  }
}

export type EventHandler = (view: DataView) => void;

export type EventDispatcher = {
  register(tag: number, handler: EventHandler): void;
  drain(): void;
};

// Subsystems register handlers for the tags they care about. Unknown tags are
// silently ignored, so a new event type doesn't break old hosts. drain() walks
// every record then clears the buffer; it leaves an empty buffer untouched.
export function createEventDispatcher(
  doom: EventBufferExports,
): EventDispatcher {
  const handlers = new Map<number, EventHandler>();

  function drain(): void {
    if (doom.wasmdoom_events_len() === 0) {
      return;
    }
    for (const { tag, payload } of readEvents(doom)) {
      handlers.get(tag)?.(payload);
    }
    doom.wasmdoom_events_clear();
  }

  return {
    register(tag, handler) {
      handlers.set(tag, handler);
    },
    drain,
  };
}
