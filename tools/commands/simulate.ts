import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Command } from "commander";

import {
  loadHeadlessDoom,
  readFramebuffer,
  readPlayer,
  readMapObjects,
  readSettings,
  type HeadlessDoom,
} from "#lib/wasmdoom-headless.ts";
import { replayScript, type EventRecord } from "#lib/replay.ts";
import { gameModeForWad } from "@wasmdoom/lib/wasmdoom-host.ts";
import { encodePpm } from "#lib/ppm.ts";
import {
  parseSimScript,
  type SimCommand,
  type StateTarget,
} from "@wasmdoom/lib/sim-commands.ts";
import type { DecodedEvent } from "@wasmdoom/lib/wasmdoom-events.ts";

interface SimulateOptions {
  wasm: string;
  commands: string;
  out: string;
  dump?: string;
  ticks?: string;
  fps?: string;
  quiet: boolean;
}

interface SnapshotRecord {
  name: string;
  tick: number;
  file: string;
}

interface StateAssertionRecord {
  kind: "state";
  tick: number;
  target: StateTarget;
  index?: number;
  field: string;
  expected: number | number[];
  actual: number | number[] | null;
  ok: boolean;
}

interface EventAssertionRecord {
  kind: "event";
  tick: number;
  event: string;
  expect: Record<string, number | string>;
  // How many of this tick's events matched the event name + expected fields.
  matched: number;
  // Expected match count when the command set `count`; null means ">=1".
  count: number | null;
  ok: boolean;
}

type AssertionRecord = StateAssertionRecord | EventAssertionRecord;

interface SimulateResult {
  wad: string;
  wasm: string;
  ticksRequested: number;
  ticksRun: number;
  snapshots: SnapshotRecord[];
  assertions: AssertionRecord[];
  assertionsFailed: number;
  events: EventRecord[];
  dumpDir: string | null;
  framesDumped: number;
  errors: { source: string; message: string }[];
  exitCode: number;
  crashed: boolean;
}

function withinTol(actual: number, expected: number, tol: number): boolean {
  return Math.abs(actual - expected) <= tol;
}

// Compare one asserted field. Arrays match elementwise (same length, each
// element within tol); a missing/mismatched-shape actual fails.
function fieldMatches(
  actual: number | number[] | undefined,
  expected: number | number[],
  tol: number,
): boolean {
  if (actual === undefined) {
    return false;
  }
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((e, i) => withinTol(actual[i], e, tol))
    );
  }
  return !Array.isArray(actual) && withinTol(actual, expected, tol);
}

// Read the asserted target post-tick and produce one record per expected field.
function evalAssert(
  doom: HeadlessDoom,
  cmd: Extract<SimCommand, { type: "assert" }>,
): StateAssertionRecord[] {
  let state: Record<string, number | number[]> | null;
  if (cmd.target === "player") {
    state = readPlayer(doom) as Record<string, number | number[]> | null;
  } else if (cmd.target === "settings") {
    state = readSettings(doom) as Record<string, number | number[]>;
  } else {
    const map_object = readMapObjects(doom)[cmd.index];
    state =
      (map_object as Record<string, number | number[]> | undefined) ?? null;
  }
  return Object.entries(cmd.expect).map(([field, expected]) => {
    const value = expected as number | number[];
    const actual = state ? state[field] : undefined;
    return {
      kind: "state",
      tick: cmd.tick,
      target: cmd.target,
      ...(cmd.target === "map_object" ? { index: cmd.index } : {}),
      field,
      expected: value,
      actual: actual ?? null,
      ok: fieldMatches(actual, value, cmd.tol),
    };
  });
}

// True if a decoded event matches every expected payload field: numeric
// expectations match within tol, string expectations (e.g. HUD_MESSAGE message)
// match by exact equality.
function eventMatches(
  ev: DecodedEvent,
  expect: Record<string, number | string>,
  tol: number,
): boolean {
  for (const [field, expected] of Object.entries(expect)) {
    const actual = ev.fields[field];
    if (typeof expected === "string") {
      if (actual !== expected) {
        return false;
      }
    } else if (
      typeof actual !== "number" ||
      !withinTol(actual, expected, tol)
    ) {
      return false;
    }
  }
  return true;
}

// Evaluate an assert_event against the events that fired on its tick: count how
// many match the event name + expected fields. Pass = exactly `count` when set,
// else >= 1.
function evalAssertEvent(
  tickEvents: DecodedEvent[],
  cmd: Extract<SimCommand, { type: "assert_event" }>,
): EventAssertionRecord {
  const matched = tickEvents.filter(
    (ev) => ev.event === cmd.event && eventMatches(ev, cmd.expect, cmd.tol),
  ).length;
  const ok = cmd.count === undefined ? matched >= 1 : matched === cmd.count;
  return {
    kind: "event",
    tick: cmd.tick,
    event: cmd.event,
    expect: cmd.expect,
    matched,
    count: cmd.count ?? null,
    ok,
  };
}

async function run(wadPath: string, opts: SimulateOptions): Promise<void> {
  const scriptText = await readFile(opts.commands, "utf-8");
  const script = parseSimScript(JSON.parse(scriptText));
  const ticks =
    opts.ticks !== undefined ? Number.parseInt(opts.ticks, 10) : script.ticks;
  if (!Number.isInteger(ticks) || ticks <= 0) {
    throw new Error(`--ticks must be a positive integer (got ${opts.ticks})`);
  }

  const snapshotsDir = join(opts.out, "snapshots");
  await mkdir(snapshotsDir, { recursive: true });

  // When --dump is set, every tick gets its own report dir; zero-pad the tick
  // index so the folders sort lexically (00000, 00001, ...).
  const framePad = String(Math.max(ticks - 1, 0)).length;
  if (opts.dump) {
    await mkdir(opts.dump, { recursive: true });
  }

  const log = (msg: string) => {
    if (!opts.quiet) console.log(msg);
  };

  // Auto-declare the IWAD's game mode unless the script already sets -mode,
  // then append the script's own flags (e.g. -warp 1 1 -skill 4).
  const scriptFlags = script.flags ?? [];
  const flags = scriptFlags.includes("-mode")
    ? scriptFlags
    : ["-mode", gameModeForWad(basename(wadPath)), ...scriptFlags];

  log(`Loading ${opts.wasm} with ${wadPath}`);
  if (flags.length > 0) {
    log(`flags: ${flags.join(" ")}`);
  }
  const doom = await loadHeadlessDoom({
    wadPath,
    wasmPath: opts.wasm,
    flags,
  });

  const snapshots: SnapshotRecord[] = [];
  const assertions: AssertionRecord[] = [];
  let framesDumped = 0;

  // replayScript drives the engine (input dispatch + tick) and collects the
  // event stream; this onTick hook layers simulate's asserts/snapshots/dumps on
  // top, observing post-tick state exactly as before.
  const { events, ticksRun, crashed } = await replayScript(doom, script, {
    ticks,
    onTick: async ({ tick, cmds, tickEvents }) => {
      const pendingAsserts = cmds.filter(
        (c): c is Extract<SimCommand, { type: "assert" }> =>
          c.type === "assert",
      );
      const pendingAssertEvents = cmds.filter(
        (c): c is Extract<SimCommand, { type: "assert_event" }> =>
          c.type === "assert_event",
      );
      const pendingSnapshots = cmds.filter(
        (c): c is Extract<SimCommand, { type: "snapshot" }> =>
          c.type === "snapshot",
      );

      for (const cmd of pendingAsserts) {
        for (const record of evalAssert(doom, cmd)) {
          assertions.push(record);
          if (!record.ok) {
            const where =
              record.target === "map_object"
                ? `map_object[${record.index}].${record.field}`
                : `${record.target}.${record.field}`;
            console.error(
              `assert failed at tick ${tick}: ${where} expected ${JSON.stringify(record.expected)}, got ${JSON.stringify(record.actual)}`,
            );
          }
        }
      }

      // assert_event matches only events that fired on this exact tick (the
      // buffer is cleared each tick, so the tick is the natural boundary).
      for (const cmd of pendingAssertEvents) {
        const record = evalAssertEvent(tickEvents, cmd);
        assertions.push(record);
        if (!record.ok) {
          const want =
            record.count === null ? ">=1" : `exactly ${record.count}`;
          console.error(
            `assert_event failed at tick ${tick}: ${record.event} ` +
              `expect ${JSON.stringify(record.expect)} wanted ${want} match(es), got ${record.matched}`,
          );
        }
      }

      for (const { name } of pendingSnapshots) {
        const { indices, palette } = readFramebuffer(doom);
        const ppm = encodePpm(indices, palette);
        const file = join("snapshots", `${name}.ppm`);
        await writeFile(join(opts.out, file), ppm);
        snapshots.push({ name, tick, file });
        log(`snapshot ${name} at tick ${tick} -> ${file}`);
      }

      // Per-frame dump: one report dir per tick with post-tick player +
      // map_object state and a screenshot, matching how asserts/snapshots read
      // above.
      if (opts.dump) {
        const frameDir = join(opts.dump, String(tick).padStart(framePad, "0"));
        await mkdir(frameDir, { recursive: true });
        const player = readPlayer(doom); // null on title/intermission screens
        const map_objects = readMapObjects(doom);
        const settings = readSettings(doom);
        const { indices, palette } = readFramebuffer(doom);
        // This tick's decoded events (event name + named fields).
        const frameEvents = tickEvents.map((ev) => ({
          event: ev.event,
          fields: ev.fields,
        }));
        await Promise.all([
          writeFile(
            join(frameDir, "player.json"),
            JSON.stringify(player, null, 2) + "\n",
          ),
          writeFile(
            join(frameDir, "map_objects.json"),
            JSON.stringify(map_objects, null, 2) + "\n",
          ),
          writeFile(
            join(frameDir, "settings.json"),
            JSON.stringify(settings, null, 2) + "\n",
          ),
          writeFile(
            join(frameDir, "events.json"),
            JSON.stringify(frameEvents, null, 2) + "\n",
          ),
          writeFile(join(frameDir, "screen.ppm"), encodePpm(indices, palette)),
        ]);
        framesDumped++;
      }
    },
  });

  const assertionsFailed = assertions.filter((a) => !a.ok).length;
  const hadErrors = doom.errors.length > 0 || crashed || assertionsFailed > 0;
  const exitCode = hadErrors ? 1 : 0;

  const result: SimulateResult = {
    wad: wadPath,
    wasm: opts.wasm,
    ticksRequested: ticks,
    ticksRun,
    snapshots,
    assertions,
    assertionsFailed,
    events,
    dumpDir: opts.dump ?? null,
    framesDumped,
    errors: doom.errors,
    exitCode,
    crashed,
  };

  await writeFile(
    join(opts.out, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );

  log("");
  log(
    `Ran ${ticksRun}/${ticks} ticks, ${snapshots.length} snapshot(s), ` +
      `${assertions.length} assertion(s) (${assertionsFailed} failed), ` +
      (opts.dump ? `${framesDumped} frame dump(s) -> ${opts.dump}, ` : "") +
      `${doom.errors.length} error(s)`,
  );
  if (hadErrors) {
    for (const err of doom.errors) {
      console.error(`[${err.source}] ${err.message}`);
    }
    process.exitCode = 1;
  }
}

export function registerSimulate(program: Command): void {
  program
    .command("simulate")
    .description(
      "Run the Doom wasm headless against a JSON script and export snapshots",
    )
    .argument("<wad>", "path to the WAD file")
    .requiredOption("--wasm <path>", "path to wasmdoom.wasm")
    .requiredOption("--commands <path>", "path to the JSON command script")
    .requiredOption(
      "--out <dir>",
      "output directory for snapshots and result.json",
    )
    .option(
      "--dump <dir>",
      "write a per-frame report dir (player.json/map_objects.json/screen.ppm) for every tick",
    )
    .option("--ticks <n>", "override the script's ticks field")
    .option("--quiet", "suppress per-tick stdout chatter", false)
    .action(run);
}
