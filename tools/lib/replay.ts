// Shared tick-loop driver for sim scripts.
// Replay a parsed SimScript: dispatch input/set commands pre-tick,
// advance the engine one tick, and collect the decoded events. Keeping the
// dispatch in one place means the two commands can never drift in how they drive
// the engine (which would make their captured event streams disagree).

import {
  EngineCrashError,
  tickSafely,
  writePlayer,
  writeMapObjects,
  writeSettings,
  type HeadlessDoom,
} from "./wasmdoom-headless.ts";
import type { SimCommand, SimScript } from "@wasmdoom/lib/sim-commands.ts";
import type { DecodedEvent } from "@wasmdoom/lib/wasmdoom-events.ts";

// One decoded event, tagged with the tick it fired on (-1 for init-time events).
export interface EventRecord {
  tick: number;
  event: string | null;
  fields: Record<string, number | string>;
}

export interface TickContext {
  tick: number;
  // Commands scheduled for this tick. Input/set commands have already been
  // dispatched; the caller handles assert/snapshot/wait (observation-only).
  cmds: SimCommand[];
  // Events decoded from this tick (already appended to the returned stream).
  tickEvents: DecodedEvent[];
}

export interface ReplayResult {
  events: EventRecord[];
  ticksRun: number;
  crashed: boolean;
}

function groupByTick(commands: SimCommand[]): Map<number, SimCommand[]> {
  const map = new Map<number, SimCommand[]>();
  for (const cmd of commands) {
    const list = map.get(cmd.tick);
    if (list) {
      list.push(cmd);
    } else {
      map.set(cmd.tick, [cmd]);
    }
  }
  return map;
}

// Replay a parsed sim script tick-by-tick: dispatch keydown/keyup/mouse/set
// commands pre-tick, advance the engine, and collect every decoded event
// (init-time events tagged tick -1). The optional `onTick` hook runs after each
// tick with that tick's commands + events so callers can layer
// asserts/snapshots/dumps on top without re-implementing the input loop. Stops
// early with crashed=true on an engine crash.
export async function replayScript(
  doom: HeadlessDoom,
  script: SimScript,
  opts: {
    ticks: number;
    onTick?: (ctx: TickContext) => void | Promise<void>;
  },
): Promise<ReplayResult> {
  const byTick = groupByTick(script.commands);
  // Every decoded event, in fire order. Init-time events are tagged tick -1.
  const events: EventRecord[] = doom.initEvents.map((ev) => ({
    tick: -1,
    event: ev.event,
    fields: ev.fields,
  }));

  let mouseButtons = 0;
  let mouseDx = 0;
  let mouseDy = 0;
  let ticksRun = 0;
  let crashed = false;

  for (let tick = 0; tick < opts.ticks; tick++) {
    const cmds = byTick.get(tick) ?? [];
    for (const cmd of cmds) {
      switch (cmd.type) {
        case "keydown":
          doom.exports.wasmdoom_keydown(cmd.key);
          break;
        case "keyup":
          doom.exports.wasmdoom_keyup(cmd.key);
          break;
        case "mouse":
          mouseButtons = cmd.buttons;
          mouseDx += cmd.dx;
          mouseDy += cmd.dy;
          break;
        // set runs pre-tick so it takes effect this tick.
        case "set":
          if (cmd.target === "player") {
            writePlayer(doom, cmd.patch);
          } else if (cmd.target === "settings") {
            writeSettings(doom, cmd.patch);
          } else {
            writeMapObjects(doom, [[cmd.index, cmd.patch]]);
          }
          break;
        // Observation-only; the caller handles these post-tick via onTick.
        case "assert":
        case "assert_event":
        case "snapshot":
        case "wait":
          break;
      }
    }

    doom.exports.wasmdoom_send_mouse(mouseButtons, mouseDx, mouseDy);
    mouseDx = 0;
    mouseDy = 0;

    let tickEvents: DecodedEvent[];
    try {
      tickEvents = tickSafely(doom);
    } catch (err) {
      if (err instanceof EngineCrashError) {
        crashed = true;
        console.error(
          `engine crashed at tick ${tick}: exit code ${err.exitCode}`,
        );
        break;
      }
      throw err;
    }
    ticksRun = tick + 1;

    for (const ev of tickEvents) {
      events.push({ tick, event: ev.event, fields: ev.fields });
    }

    if (opts.onTick) {
      await opts.onTick({ tick, cmds, tickEvents });
    }
  }

  return { events, ticksRun, crashed };
}
