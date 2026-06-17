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
//       { "tick": 95, "type": "assert", "target": "player", "expect": { "x": 1024 }, "tol": 1 }
//     ]
//   }

import { resolveKey } from "./wasmdoom-keys.ts";
import { PLAYER_OFF, PLAYER_LEN, type Player } from "./player-layout.ts";
import { MAP_OBJECT_OFF, type MapObject } from "./map-object-layout.ts";

export type StateTarget = "player" | "map_object";

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

// Validate a `patch`/`expect` object for a set/assert command: keys must be
// real fields for the target, scalars must be numbers, and the player array
// fields (ammo/maxammo/powers) must be number arrays of the right length.
function parseStateFields(
  raw: unknown,
  target: StateTarget,
  ctx: string,
): Record<string, number | number[]> {
  if (!isObject(raw)) {
    throw new Error(`${ctx} must be an object`);
  }
  const fields = target === "player" ? PLAYER_FIELDS : MAP_OBJECT_FIELDS;
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

function parseTarget(raw: unknown, ctx: string): StateTarget {
  if (raw !== "player" && raw !== "map_object") {
    throw new Error(`${ctx} must be "player" or "map_object"`);
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
