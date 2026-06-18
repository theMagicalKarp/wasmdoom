// Parser/validator for the simulator's JSON command file.
//
// Wire shape:
//   {
//     "ticks": 600,
//     "flags": ["-warp", "1", "1", "-skill", "4"],
//     "commands": [
//       { "tick": 0,  "type": "keydown", "key": "Enter" },
//       { "tick": 10, "type": "mouse",   "buttons": 1, "dx": 5 },
//       { "tick": 30, "type": "snapshot", "name": "title" },
//       { "tick": 50, "type": "set",    "target": "player", "patch":  { "health": 200 } },
//       { "tick": 60, "type": "assert", "target": "player", "expect": { "health": 200 } },
//       { "tick": 90, "type": "set",    "target": "map_object", "index": 3, "patch": { "health": 1 } },
//       { "tick": 95, "type": "assert", "target": "player", "expect": { "x": 1024 }, "tol": 1 },
//       { "tick": 96, "type": "assert", "target": "settings", "expect": { "gamemap": 1 } },
//       { "tick": 97, "type": "set",    "target": "settings", "patch": { "sfx_volume": 3 } },
//       { "tick": 90, "type": "assert_event", "event": "ENEMY_KILLED", "expect": { "mobjType": 9, "byPlayer": 1 }, "count": 1 }
//     ]
//   }

import { resolveKey } from "./wasmdoom-keys.ts";
import { EVENT_SCHEMA } from "./wasmdoom-events.ts";
import { PLAYER_OFF, PLAYER_LEN, type Player } from "./player-layout.ts";
import { MAP_OBJECT_OFF, type MapObject } from "./map-object-layout.ts";
import {
  SETTINGS_OFF,
  SETTINGS_WRITABLE,
  type Settings,
} from "./settings-layout.ts";

export type StateTarget = "player" | "map_object" | "settings";

export type SimCommand =
  | { tick: number; type: "keydown"; key: number }
  | { tick: number; type: "keyup"; key: number }
  | {
      tick: number;
      type: "mouse";
      buttons: number;
      dx: number;
      dy: number;
    }
  | { tick: number; type: "snapshot"; name: string }
  | { tick: number; type: "wait" }
  | { tick: number; type: "set"; target: "player"; patch: Partial<Player> }
  | {
      tick: number;
      type: "set";
      target: "map_object";
      index: number;
      patch: Partial<MapObject>;
    }
  | { tick: number; type: "set"; target: "settings"; patch: Partial<Settings> }
  // tol is a non-negative fuzz applied to every numeric compare (default 0).
  // Required in practice for the float position/momentum fields.
  | {
      tick: number;
      type: "assert";
      target: "player";
      expect: Partial<Player>;
      tol: number;
    }
  | {
      tick: number;
      type: "assert";
      target: "map_object";
      index: number;
      expect: Partial<MapObject>;
      tol: number;
    }
  | {
      tick: number;
      type: "assert";
      target: "settings";
      expect: Partial<Settings>;
      tol: number;
    }
  // Assert a gameplay event fired on this exact tick. `event` is an EVENT name;
  // `expect` matches decoded payload fields: numeric fields (fixed/i32/u32) by
  // value within tol, string fields (e.g. HUD_MESSAGE message) by exact
  // equality. With no `count`, passes if >=1 emitted event matches; with
  // `count`, passes if exactly `count` match.
  | {
      tick: number;
      type: "assert_event";
      event: string;
      expect: Record<string, number | string>;
      tol: number;
      count?: number;
    };

export interface SimScript {
  ticks: number;
  // Doom command-line flags (excluding argv[0]), staged before init.
  flags?: string[];
  commands: SimCommand[];
}

// Writable fields per target (everything in the wire layout except `dirty`).
// The set/assert validators reject keys outside these sets.
const PLAYER_FIELDS = new Set(
  Object.keys(PLAYER_OFF).filter((k) => k !== "dirty"),
);
const MAP_OBJECT_FIELDS = new Set(
  Object.keys(MAP_OBJECT_OFF).filter((k) => k !== "dirty"),
);
// `assert` may read any settings field (incl. the read-only game state);
// `set` may only write the config subset.
const SETTINGS_READABLE = new Set(
  Object.keys(SETTINGS_OFF).filter((k) => k !== "dirty"),
);
const SETTINGS_WRITABLE_FIELDS = new Set<string>(SETTINGS_WRITABLE);
const PLAYER_ARRAY_LEN = PLAYER_LEN as Record<string, number>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(
      `${field} must be an integer (got ${JSON.stringify(value)})`,
    );
  }
  return value;
}

function expectNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number (got ${JSON.stringify(value)})`);
  }
  return value;
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string (got ${JSON.stringify(value)})`);
  }
  return value;
}

function fieldsFor(target: StateTarget, mode: "set" | "assert"): Set<string> {
  switch (target) {
    case "player":
      return PLAYER_FIELDS;
    case "map_object":
      return MAP_OBJECT_FIELDS;
    case "settings":
      return mode === "set" ? SETTINGS_WRITABLE_FIELDS : SETTINGS_READABLE;
  }
}

// Validate a `patch`/`expect` object for a set/assert command: keys must be
// real fields for the target, scalars must be numbers, and the player array
// fields (ammo/maxammo/powers) must be number arrays of the right length.
function parseStateFields(
  raw: unknown,
  target: StateTarget,
  ctx: string,
  mode: "set" | "assert",
): Record<string, number | number[]> {
  if (!isObject(raw)) {
    throw new Error(`${ctx} must be an object`);
  }
  const fields = fieldsFor(target, mode);
  const out: Record<string, number | number[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!fields.has(key)) {
      throw new Error(`${ctx}.${key}: unknown ${target} field`);
    }
    if (target === "player" && key in PLAYER_ARRAY_LEN) {
      const len = PLAYER_ARRAY_LEN[key];
      if (!Array.isArray(value) || value.length !== len) {
        throw new Error(`${ctx}.${key} must be an array of ${len} numbers`);
      }
      out[key] = value.map((v, i) => expectNumber(v, `${ctx}.${key}[${i}]`));
    } else {
      out[key] = expectNumber(value, `${ctx}.${key}`);
    }
  }
  if (Object.keys(out).length === 0) {
    throw new Error(`${ctx} must set at least one field`);
  }
  return out;
}

// Validate an `expect` object for an assert_event command: keys must be real
// payload fields for the event's EVENT_SCHEMA. String-typed fields take a string
// (matched by exact equality); every other field type takes a number.
function parseEventExpect(
  raw: unknown,
  event: string,
  ctx: string,
): Record<string, number | string> {
  if (!isObject(raw)) {
    throw new Error(`${ctx} must be an object`);
  }
  const fieldType = new Map(EVENT_SCHEMA[event].map((f) => [f.name, f.type]));
  const out: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const type = fieldType.get(key);
    if (type === undefined) {
      throw new Error(`${ctx}.${key}: unknown ${event} field`);
    }
    out[key] =
      type === "string"
        ? expectString(value, `${ctx}.${key}`)
        : expectNumber(value, `${ctx}.${key}`);
  }
  return out;
}

function parseTarget(raw: unknown, ctx: string): StateTarget {
  if (raw !== "player" && raw !== "map_object" && raw !== "settings") {
    throw new Error(`${ctx} must be "player", "map_object", or "settings"`);
  }
  return raw;
}

function parseCommand(raw: unknown, index: number): SimCommand {
  if (!isObject(raw)) {
    throw new Error(`commands[${index}] must be an object`);
  }
  const tick = expectInt(raw.tick, `commands[${index}].tick`);
  if (tick < 0) {
    throw new Error(`commands[${index}].tick must be >= 0`);
  }
  if (typeof raw.type !== "string") {
    throw new Error(`commands[${index}].type must be a string`);
  }

  switch (raw.type) {
    case "keydown":
    case "keyup": {
      if (typeof raw.key !== "string" && typeof raw.key !== "number") {
        throw new Error(
          `commands[${index}].key must be a string name or integer`,
        );
      }
      const key = resolveKey(raw.key);
      if (key === null) {
        throw new Error(
          `commands[${index}].key: unknown key ${JSON.stringify(raw.key)}`,
        );
      }
      return { tick, type: raw.type, key };
    }
    case "mouse": {
      const buttons =
        raw.buttons === undefined
          ? 0
          : expectInt(raw.buttons, `commands[${index}].buttons`);
      const dx =
        raw.dx === undefined ? 0 : expectInt(raw.dx, `commands[${index}].dx`);
      const dy =
        raw.dy === undefined ? 0 : expectInt(raw.dy, `commands[${index}].dy`);
      return { tick, type: "mouse", buttons, dx, dy };
    }
    case "snapshot": {
      const name =
        raw.name === undefined
          ? `tick-${tick}`
          : typeof raw.name === "string"
            ? raw.name
            : null;
      if (name === null) {
        throw new Error(`commands[${index}].name must be a string`);
      }
      if (!/^[A-Za-z0-9._-]+$/.test(name)) {
        throw new Error(
          `commands[${index}].name must match [A-Za-z0-9._-]+ (got ${JSON.stringify(name)})`,
        );
      }
      return { tick, type: "snapshot", name };
    }
    case "wait":
      return { tick, type: "wait" };
    case "set": {
      const target = parseTarget(raw.target, `commands[${index}].target`);
      const patch = parseStateFields(
        raw.patch,
        target,
        `commands[${index}].patch`,
        "set",
      );
      if (target === "map_object") {
        const idx = expectInt(raw.index, `commands[${index}].index`);
        if (idx < 0) {
          throw new Error(`commands[${index}].index must be >= 0`);
        }
        return { tick, type: "set", target, index: idx, patch };
      }
      return { tick, type: "set", target, patch };
    }
    case "assert": {
      const target = parseTarget(raw.target, `commands[${index}].target`);
      const expect = parseStateFields(
        raw.expect,
        target,
        `commands[${index}].expect`,
        "assert",
      );
      let tol = 0;
      if (raw.tol !== undefined) {
        tol = expectNumber(raw.tol, `commands[${index}].tol`);
        if (tol < 0) {
          throw new Error(`commands[${index}].tol must be >= 0`);
        }
      }
      if (target === "map_object") {
        const idx = expectInt(raw.index, `commands[${index}].index`);
        if (idx < 0) {
          throw new Error(`commands[${index}].index must be >= 0`);
        }
        return { tick, type: "assert", target, index: idx, expect, tol };
      }
      return { tick, type: "assert", target, expect, tol };
    }
    case "assert_event": {
      if (typeof raw.event !== "string" || !(raw.event in EVENT_SCHEMA)) {
        throw new Error(
          `commands[${index}].event must be a known EVENT name (got ${JSON.stringify(raw.event)})`,
        );
      }
      const event = raw.event;
      const expect =
        raw.expect === undefined
          ? {}
          : parseEventExpect(raw.expect, event, `commands[${index}].expect`);
      let tol = 0;
      if (raw.tol !== undefined) {
        tol = expectNumber(raw.tol, `commands[${index}].tol`);
        if (tol < 0) {
          throw new Error(`commands[${index}].tol must be >= 0`);
        }
      }
      if (raw.count === undefined) {
        return { tick, type: "assert_event", event, expect, tol };
      }
      const count = expectInt(raw.count, `commands[${index}].count`);
      if (count < 0) {
        throw new Error(`commands[${index}].count must be >= 0`);
      }
      return { tick, type: "assert_event", event, expect, tol, count };
    }
    default:
      throw new Error(
        `commands[${index}].type: unknown command type ${JSON.stringify(raw.type)}`,
      );
  }
}

export function parseSimScript(input: unknown): SimScript {
  if (!isObject(input)) {
    throw new Error("script must be a JSON object");
  }
  const ticks = expectInt(input.ticks, "ticks");
  if (ticks <= 0) {
    throw new Error("ticks must be > 0");
  }

  let flags: string[] | undefined;
  if (input.flags !== undefined) {
    if (
      !Array.isArray(input.flags) ||
      !input.flags.every((f) => typeof f === "string")
    ) {
      throw new Error("flags must be an array of strings");
    }
    flags = input.flags;
  }

  if (!Array.isArray(input.commands)) {
    throw new Error("commands must be an array");
  }

  const commands: SimCommand[] = input.commands.map(parseCommand);

  for (let i = 1; i < commands.length; i++) {
    if (commands[i].tick < commands[i - 1].tick) {
      throw new Error(
        `commands must be sorted by tick (commands[${i}].tick=${commands[i].tick} < commands[${i - 1}].tick=${commands[i - 1].tick})`,
      );
    }
  }
  for (let i = 0; i < commands.length; i++) {
    if (commands[i].tick >= ticks) {
      throw new Error(
        `commands[${i}].tick=${commands[i].tick} is past ticks=${ticks}`,
      );
    }
  }

  return { ticks, flags, commands };
}
