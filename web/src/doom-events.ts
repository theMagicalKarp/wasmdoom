// Decodes the tagged event buffer the wasm module fills each tick.
//
// The C side appends records into a static buffer during wasmdoom_init /
// wasmdoom_tick; the host drains them after each call. Each record is a u16
// tag, a u16 payload length, then payload bytes — all little-endian.
//
// Subsystems register handlers for the tags they care about. Unknown tags are
// silently ignored, so a new event type doesn't break old hosts.

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
} as const;

export type EventHandler = (view: DataView) => void;

export type EventDispatcher = {
  register(tag: number, handler: EventHandler): void;
  drain(): void;
};

export type EventBufferExports = {
  memory: WebAssembly.Memory;
  wasmdoom_events_ptr(): number;
  wasmdoom_events_len(): number;
};

export function createEventDispatcher(
  doom: EventBufferExports,
): EventDispatcher {
  const handlers = new Map<number, EventHandler>();

  function drain(): void {
    const len = doom.wasmdoom_events_len();
    if (len === 0) {
      return;
    }
    const base = doom.wasmdoom_events_ptr();
    // A header view walks the records; each handler gets its own view scoped to
    // just its payload, so reads start at offset 0 and can't run past the record.
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
      const handler = handlers.get(tag);
      if (handler) {
        handler(
          new DataView(doom.memory.buffer, base + payloadStart, payloadLen),
        );
      }
      offset = payloadStart + payloadLen;
    }
  }

  return {
    register(tag, handler) {
      handlers.set(tag, handler);
    },
    drain,
  };
}
