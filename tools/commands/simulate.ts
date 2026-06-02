import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";

import {
  EngineCrashError,
  loadHeadlessDoom,
  readFramebuffer,
  tickSafely,
} from "#lib/wasmdoom-headless.ts";
import { encodePpm } from "#lib/ppm.ts";
import { parseSimScript, type SimCommand } from "#lib/sim-commands.ts";

interface SimulateOptions {
  wasm: string;
  commands: string;
  out: string;
  ticks?: string;
  fps?: string;
  quiet: boolean;
}

interface SnapshotRecord {
  name: string;
  tick: number;
  file: string;
}

interface SimulateResult {
  wad: string;
  wasm: string;
  fps: number;
  ticksRequested: number;
  ticksRun: number;
  snapshots: SnapshotRecord[];
  errors: { source: string; message: string }[];
  exitCode: number;
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

async function run(wadPath: string, opts: SimulateOptions): Promise<void> {
  const scriptText = await readFile(opts.commands, "utf-8");
  const script = parseSimScript(JSON.parse(scriptText));
  const ticks =
    opts.ticks !== undefined ? Number.parseInt(opts.ticks, 10) : script.ticks;
  if (!Number.isInteger(ticks) || ticks <= 0) {
    throw new Error(`--ticks must be a positive integer (got ${opts.ticks})`);
  }

  const fps = opts.fps !== undefined ? Number.parseInt(opts.fps, 10) : 30;
  if (!Number.isInteger(fps) || fps <= 0) {
    throw new Error(`--fps must be a positive integer (got ${opts.fps})`);
  }
  const frameMs = 1000 / fps;

  const snapshotsDir = join(opts.out, "snapshots");
  await mkdir(snapshotsDir, { recursive: true });

  const log = (msg: string) => {
    if (!opts.quiet) console.log(msg);
  };

  log(`Loading ${opts.wasm} with ${wadPath}`);
  const doom = await loadHeadlessDoom({
    wadPath,
    wasmPath: opts.wasm,
    onStdout: (line) => log(`[stdout] ${line}`),
    onStderr: (line) => console.warn(`[stderr] ${line}`),
  });
  doom.exports.wasmdoom_init();

  const byTick = groupByTick(script.commands);
  const snapshots: SnapshotRecord[] = [];

  let mouseButtons = 0;
  let mouseDx = 0;
  let mouseDy = 0;
  let ticksRun = 0;
  let crashed = false;

  for (let tick = 0; tick < ticks; tick++) {
    // Advance the virtual clock one frame before ticking so the engine sees
    // ~35/fps game-tics of elapsed time per iteration, matching the browser's
    // fixed-rate loop. Each script tick is therefore one rendered frame.
    doom.clock.advanceMs(frameMs);

    const pendingSnapshots: { name: string }[] = [];
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

    for (const { name } of pendingSnapshots) {
      const { indices, palette } = readFramebuffer(doom);
      const ppm = encodePpm(indices, palette);
      const file = join("snapshots", `${name}.ppm`);
      await writeFile(join(opts.out, file), ppm);
      snapshots.push({ name, tick, file });
      log(`snapshot ${name} at tick ${tick} -> ${file}`);
    }
  }

  const hadErrors = doom.errors.length > 0 || crashed;
  const exitCode = hadErrors ? 1 : 0;

  const result: SimulateResult = {
    wad: wadPath,
    wasm: opts.wasm,
    fps,
    ticksRequested: ticks,
    ticksRun,
    snapshots,
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
    `Ran ${ticksRun}/${ticks} ticks, ${snapshots.length} snapshot(s), ${doom.errors.length} error(s)`,
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
    .option("--ticks <n>", "override the script's ticks field")
    .option("--fps <n>", "frames per second to pace the simulation", "30")
    .option("--quiet", "suppress per-tick stdout chatter", false)
    .action(run);
}
