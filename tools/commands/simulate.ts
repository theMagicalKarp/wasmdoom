import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Command } from "commander";

import {
  EngineCrashError,
  loadHeadlessDoom,
  readFramebuffer,
  readPlayer,
  readMapObjects,
  writePlayer,
  writeMapObjects,
  tickSafely,
  type HeadlessDoom,
} from "#lib/wasmdoom-headless.ts";
import { gameModeForWad } from "@wasmdoom/lib/wasmdoom-host.ts";
import { encodePpm } from "#lib/ppm.ts";
import {
  parseSimScript,
  type SimCommand,
  type StateTarget,
} from "@wasmdoom/lib/sim-commands.ts";

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

interface AssertionRecord {
  tick: number;
  target: StateTarget;
  index?: number;
  field: string;
  expected: number | number[];
  actual: number | number[] | null;
  ok: boolean;
}

interface SimulateResult {
  wad: string;
  wasm: string;
  ticksRequested: number;
  ticksRun: number;
  snapshots: SnapshotRecord[];
  assertions: AssertionRecord[];
  assertionsFailed: number;
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
): AssertionRecord[] {
  let state: Record<string, number | number[]> | null;
  if (cmd.target === "player") {
    state = readPlayer(doom) as Record<string, number | number[]> | null;
  } else {
    const map_object = readMapObjects(doom)[cmd.index];
    state =
      (map_object as Record<string, number | number[]> | undefined) ?? null;
  }
  return Object.entries(cmd.expect).map(([field, expected]) => {
    const value = expected as number | number[];
    const actual = state ? state[field] : undefined;
    return {
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

  const byTick = groupByTick(script.commands);
  const snapshots: SnapshotRecord[] = [];
  const assertions: AssertionRecord[] = [];

  let mouseButtons = 0;
  let mouseDx = 0;
  let mouseDy = 0;
  let ticksRun = 0;
  let framesDumped = 0;
  let crashed = false;

  for (let tick = 0; tick < ticks; tick++) {
    const pendingSnapshots: { name: string }[] = [];
    const pendingAsserts: Extract<SimCommand, { type: "assert" }>[] = [];
    const cmds = byTick.get(tick);
    if (cmds) {
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
          // set runs pre-tick so it takes effect this tick; assert runs
          // post-tick (below) so it observes the tick's result.
          case "set":
            if (cmd.target === "player") {
              writePlayer(doom, cmd.patch);
            } else {
              writeMapObjects(doom, [[cmd.index, cmd.patch]]);
            }
            break;
          case "assert":
            pendingAsserts.push(cmd);
            break;
          case "snapshot":
            pendingSnapshots.push({ name: cmd.name });
            break;
          case "wait":
            break;
        }
      }
    }

    doom.exports.wasmdoom_send_mouse(mouseButtons, mouseDx, mouseDy);
    mouseDx = 0;
    mouseDy = 0;

    try {
      tickSafely(doom);
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

    for (const cmd of pendingAsserts) {
      for (const record of evalAssert(doom, cmd)) {
        assertions.push(record);
        if (!record.ok) {
          const where =
            record.target === "map_object"
              ? `map_object[${record.index}].${record.field}`
              : `player.${record.field}`;
          console.error(
            `assert failed at tick ${tick}: ${where} expected ${JSON.stringify(record.expected)}, got ${JSON.stringify(record.actual)}`,
          );
        }
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
      const { indices, palette } = readFramebuffer(doom);
      await Promise.all([
        writeFile(
          join(frameDir, "player.json"),
          JSON.stringify(player, null, 2) + "\n",
        ),
        writeFile(
          join(frameDir, "map_objects.json"),
          JSON.stringify(map_objects, null, 2) + "\n",
        ),
        writeFile(join(frameDir, "screen.ppm"), encodePpm(indices, palette)),
      ]);
      framesDumped++;
    }
  }

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
