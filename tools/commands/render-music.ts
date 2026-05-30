import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";

import { isMus, type Lump, parseWad } from "#lib/wad.ts";
import { buildWav } from "#lib/wav.ts";
import {
  type RenderOutput,
  SONG_MAX_SIZE,
  WasmDoomMusic,
} from "#lib/wasmdoom.music.ts";

interface Options {
  wasm: string;
  out: string;
  validateOnly: boolean;
  track?: string;
}

interface TrackResult {
  name: string;
  seconds: number;
  peak: number;
  ok: boolean;
  note: string;
}

// Map the library's verdict to the human-readable note shown in the report.
function noteFor(track: Lump, render: RenderOutput): string {
  switch (render.status) {
    case "too-large":
      return `too large (${track.data.length} > ${SONG_MAX_SIZE} bytes)`;
    case "bad-header":
      return "failed to start (bad MUS header?)";
    case "silent":
      return "silent";
    case "truncated":
      return "ok (truncated at safety cap)";
    case "ok":
      return "ok";
  }
}

async function run(wadPath: string, opts: Options): Promise<void> {
  const wad = parseWad(new Uint8Array(await readFile(wadPath)));
  const genmidi = wad.find((lump) => lump.name === "GENMIDI");
  if (!genmidi) {
    throw new Error(`${wadPath}: no GENMIDI lump (needed for the OPL synth)`);
  }
  const tracks = wad.filter((lump) => isMus(lump.data));
  if (tracks.length === 0) {
    throw new Error(`${wadPath}: no MUS music lumps found`);
  }

  let selected = tracks;
  if (opts.track) {
    const wanted = opts.track.toUpperCase();
    selected = tracks.filter((track) => {
      const name = track.name.toUpperCase();
      return name === wanted || name === `D_${wanted}`;
    });
    if (selected.length === 0) {
      throw new Error(
        `no music lump matches "${opts.track}". Available: ${tracks
          .map((track) => track.name)
          .join(", ")}`,
      );
    }
  }

  const wasmDoomMusic = await WasmDoomMusic.init(opts.wasm);
  wasmDoomMusic.loadGenmidi(genmidi);

  if (!opts.validateOnly) {
    await mkdir(opts.out, { recursive: true });
  }

  console.log(
    `Rendering ${selected.length} track(s) from ${wadPath} via ${opts.wasm}\n`,
  );
  const results: TrackResult[] = [];
  for (const track of selected) {
    const render = wasmDoomMusic.renderTrack(track.data);
    if (render.started && !opts.validateOnly) {
      await writeFile(
        join(opts.out, `${track.name}.wav`),
        buildWav(render.samples),
      );
    }
    results.push({
      name: track.name,
      seconds: render.seconds,
      peak: render.peak,
      ok: render.ok,
      note: noteFor(track, render),
    });
  }

  for (const result of results) {
    const status = result.ok ? "ok " : "FAIL";
    console.log(
      `  [${status}] ${result.name.padEnd(8)} ${result.seconds.toFixed(1).padStart(6)}s  ` +
        `peak ${result.peak.toFixed(4)}  ${result.note}`,
    );
  }

  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} track(s) OK` +
      (opts.validateOnly
        ? " (validate-only, no files written)"
        : ` -> ${opts.out}/`),
  );
  if (failed.length > 0) {
    console.error(
      `\n${failed.length} track(s) failed: ${failed.map((result) => result.name).join(", ")}`,
    );
    process.exitCode = 1;
  }
}

export function registerRenderMusic(program: Command): void {
  program
    .command("render-music")
    .description(
      "Render every MUS music lump in a WAD to WAV via the music wasm",
    )
    .argument("<wad>", "path to the WAD file")
    .requiredOption("--wasm <path>", "path to wasmdoom.music.wasm")
    .option("--out <dir>", "output directory for WAV files", "music-out")
    .option(
      "--track <name>",
      "render only this track, e.g. D_E1M1 or e1m1 (default: all)",
    )
    .option(
      "--validate-only",
      "render and validate without writing files",
      false,
    )
    .action(run);
}
