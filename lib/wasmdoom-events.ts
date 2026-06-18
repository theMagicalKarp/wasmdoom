// The engine's outbound event buffer: the tag enum (mirroring src/wd_events.h),
// the wire format, and the decoder shared by the browser host (web/src/main.ts,
// doom-audio.ts, doom-save.ts via createEventDispatcher) and the headless host
// (tools/lib/wasmdoom-headless.ts, which scans for log/error tags).
//
// The C side appends records into a static buffer during wasmdoom_init /
// wasmdoom_tick; the host drains them after each call. Each record is a u16 tag,
// a u16 payload length, then payload bytes — all little-endian.

export const EVENT = {
  // Infrastructure events (tags 1-39), grouped in bands of 10 by subsystem like
  // the gameplay events below.
  // Band 1 -- diagnostics / logging
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
  // Band 10 -- sound
  SOUND_START: 10,
  SOUND_STOP: 11,
  SOUND_UPDATE: 12,
  // Band 20 -- music
  MUSIC_SET_GENMIDI: 20,
  MUSIC_REGISTER: 21,
  MUSIC_PLAY: 22,
  MUSIC_PAUSE: 23,
  MUSIC_RESUME: 24,
  MUSIC_STOP: 25,
  MUSIC_UNREGISTER: 26,
  MUSIC_SET_VOLUME: 27,
  // Band 30 -- persistence
  SAVE_WRITTEN: 30,

  // Gameplay events (mirrors EV_* in src/wd_events.h). Grouped in bands of 10
  // by category. Add a row to EVENT_SCHEMA below for each.
  GAME_STATE_CHANGED: 100,
  LEVEL_LOADED: 101,
  LEVEL_COMPLETED: 102,
  LEVEL_EXIT_TRIGGERED: 103,
  PLAYER_SPAWNED: 110,
  PLAYER_DIED: 111,
  PLAYER_RESPAWNED: 112,
  WEAPON_FIRED: 120,
  WEAPON_CHANGED: 121,
  PLAYER_DAMAGED: 122,
  ENEMY_KILLED: 130,
  EXPLOSION: 131,
  ENEMY_AWAKENED: 132,
  ENEMY_DAMAGED: 133,
  ITEM_PICKED_UP: 140,
  KEY_OBTAINED: 141,
  SECRET_FOUND: 150,
  LOCKED_DOOR_BLOCKED: 160,
  DOOR: 161,
  SWITCH_ACTIVATED: 162,
  TELEPORT: 163,
  PLATFORM: 164,
  HUD_MESSAGE: 170,
  FACE_CHANGED: 171,
  CHEAT_ACTIVATED: 172,
  SETTINGS_CHANGED: 180,
} as const;

// Sentinel for "no attacker" in PLAYER_DIED / PLAYER_DAMAGED attackerType
// (mirrors EV_ATTACKER_NONE in src/wd_events.h).
export const EV_ATTACKER_NONE = 0xffffffff;

// A payload field's wire type. `fixed` is a fixed_t 16.16 decoded to world
// units (/65536, matching lib/player-layout.ts). `string` consumes the whole
// record (length = payloadLen, no NUL).
export type EventFieldType = "u32" | "i32" | "fixed" | "string";
export type EventField = { name: string; type: EventFieldType };

// Named payload layout per event, and the emit_* helpers in src/wd_events.c.
// This is the third hand-mirrored table (with EV_* and EVENT) kept in lockstep
// when a tag is added; it is the one place asserts and the event dump read
// field names from. Keyed by EVENT name.
export const EVENT_SCHEMA: Record<string, EventField[]> = {
  GAME_STATE_CHANGED: [
    { name: "oldState", type: "u32" },
    { name: "newState", type: "u32" },
  ],
  LEVEL_LOADED: [
    { name: "episode", type: "u32" },
    { name: "map", type: "u32" },
    { name: "skill", type: "u32" },
  ],
  LEVEL_COMPLETED: [
    { name: "episode", type: "u32" },
    { name: "map", type: "u32" },
    { name: "secretExit", type: "u32" },
    { name: "leveltime", type: "u32" },
    { name: "kills", type: "u32" },
    { name: "maxkills", type: "u32" },
    { name: "items", type: "u32" },
    { name: "maxitems", type: "u32" },
    { name: "secrets", type: "u32" },
    { name: "maxsecret", type: "u32" },
  ],
  LEVEL_EXIT_TRIGGERED: [{ name: "secret", type: "u32" }],
  PLAYER_SPAWNED: [],
  PLAYER_DIED: [{ name: "attackerType", type: "u32" }],
  PLAYER_RESPAWNED: [],
  WEAPON_FIRED: [
    { name: "weapon", type: "u32" },
    { name: "ammoType", type: "u32" },
    { name: "ammoLeft", type: "i32" },
  ],
  WEAPON_CHANGED: [
    { name: "from", type: "u32" },
    { name: "to", type: "u32" },
  ],
  PLAYER_DAMAGED: [
    { name: "damage", type: "i32" },
    { name: "health", type: "i32" },
    { name: "armor", type: "i32" },
    { name: "attackerType", type: "u32" },
  ],
  ENEMY_KILLED: [
    { name: "mobjType", type: "u32" },
    { name: "x", type: "fixed" },
    { name: "y", type: "fixed" },
    { name: "byPlayer", type: "u32" },
  ],
  EXPLOSION: [
    { name: "x", type: "fixed" },
    { name: "y", type: "fixed" },
    { name: "damage", type: "i32" },
  ],
  ENEMY_AWAKENED: [{ name: "mobjType", type: "u32" }],
  ENEMY_DAMAGED: [
    { name: "mobjType", type: "u32" },
    { name: "damage", type: "i32" },
    { name: "healthLeft", type: "i32" },
  ],
  ITEM_PICKED_UP: [
    { name: "itemId", type: "u32" },
    { name: "messageId", type: "u32" },
  ],
  KEY_OBTAINED: [{ name: "card", type: "u32" }],
  SECRET_FOUND: [
    { name: "secretCount", type: "u32" },
    { name: "x", type: "fixed" },
    { name: "y", type: "fixed" },
  ],
  LOCKED_DOOR_BLOCKED: [{ name: "requiredKey", type: "u32" }],
  DOOR: [
    { name: "sectorIdx", type: "u32" },
    { name: "type", type: "u32" },
    { name: "direction", type: "i32" },
  ],
  SWITCH_ACTIVATED: [{ name: "lineIdx", type: "u32" }],
  TELEPORT: [
    { name: "mobjType", type: "u32" },
    { name: "x", type: "fixed" },
    { name: "y", type: "fixed" },
  ],
  PLATFORM: [
    { name: "sectorIdx", type: "u32" },
    { name: "type", type: "u32" },
  ],
  HUD_MESSAGE: [{ name: "message", type: "string" }],
  FACE_CHANGED: [
    { name: "faceindex", type: "u32" },
    { name: "priority", type: "u32" },
  ],
  CHEAT_ACTIVATED: [
    { name: "cheat", type: "u32" },
    { name: "param", type: "u32" },
  ],
  SETTINGS_CHANGED: [{ name: "dirtyMask", type: "u32" }],
};

// Reverse map tag number -> EVENT name, for decoding records back to names.
export const EVENT_NAME_BY_TAG: ReadonlyMap<number, string> = new Map(
  Object.entries(EVENT).map(([name, tag]) => [tag, name]),
);

export type DecodedEvent = {
  tag: number;
  // EVENT name, or null for a tag with no known schema (forward-compatible).
  event: string | null;
  fields: Record<string, number | string>;
  // Raw payload byte length (the only info available for an unknown tag).
  byteLength: number;
};

// Decode one record's payload into named fields using EVENT_SCHEMA. An unknown
// tag (or a known tag with no schema) yields the raw byte length and no fields,
// matching the "unknown tags are silently ignored" rule. fixed fields are
// decoded 16.16 -> world units; string consumes the remainder of the record.
export function decodeEvent(tag: number, payload: DataView): DecodedEvent {
  const event = EVENT_NAME_BY_TAG.get(tag) ?? null;
  const schema = event ? EVENT_SCHEMA[event] : undefined;
  const fields: Record<string, number | string> = {};
  if (!schema) {
    return { tag, event, fields, byteLength: payload.byteLength };
  }
  let offset = 0;
  for (const field of schema) {
    if (field.type === "string") {
      fields[field.name] = new TextDecoder().decode(
        new Uint8Array(
          payload.buffer,
          payload.byteOffset + offset,
          payload.byteLength - offset,
        ),
      );
      offset = payload.byteLength;
      continue;
    }
    if (field.type === "u32") {
      fields[field.name] = payload.getUint32(offset, true);
    } else if (field.type === "fixed") {
      fields[field.name] = payload.getInt32(offset, true) / 65536;
    } else {
      fields[field.name] = payload.getInt32(offset, true);
    }
    offset += 4;
  }
  return { tag, event, fields, byteLength: payload.byteLength };
}

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
