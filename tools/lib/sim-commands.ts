// Parser/validator for the simulator's JSON command file.
//
// Wire shape:
//   {
//     "ticks": 600,
//     "commands": [
//       { "tick": 0,  "type": "keydown", "key": "Enter" },
//       { "tick": 10, "type": "mouse",   "buttons": 1, "dx": 5 },
//       { "tick": 30, "type": "snapshot", "name": "title" }
//     ]
//   }

import { resolveKey } from "./wasmdoom-keys.ts";

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
  | { tick: number; type: "wait" };

export interface SimScript {
  ticks: number;
  commands: SimCommand[];
}

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

  return { ticks, commands };
}
