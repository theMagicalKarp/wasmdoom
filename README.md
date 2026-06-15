<div align="center">
  <img width="150" src="./docs/assets/logo.png" />
</div>

# wasmdoom _(wip)_

A WebAssembly port of id Software's original 1993 DOOM, built from the
[id-Software/DOOM](https://github.com/id-Software/DOOM) source release
(`linuxdoom-1.10`).

The engine compiles to freestanding `wasm32` with **zero imports** — no WASI, no
libc, no Emscripten. The host pushes the IWAD, command-line flags, and input
events directly into linear memory and drives the engine through its exported
tick/draw functions. Music is synthesized by a separate OPL3 emulator wasm
(`wasmdoom.music.wasm`), also freestanding.

_View the full working demo at
[https://themagicalkarp.github.io/wasmdoom/](https://themagicalkarp.github.io/wasmdoom/)._

## Repo layout

| Path              | What it is                                                                        |
| ----------------- | --------------------------------------------------------------------------------- |
| `src/`            | The C engine (see [docs/src-prefixes.md](docs/src-prefixes.md) for a map)         |
| `src/music/`      | OPL3 synth + MUS sequencer, built into the separate music wasm                    |
| `web/`            | Vite browser frontend ([web/README.md](web/README.md))                            |
| `tools/`          | Node CLI for WAD inspection, music rendering, and headless simulation             |
| `ci/simulations/` | Scripted gameplay runs used to validate WADs and engine behavior in CI            |
| `docs/`           | [Command-line flags](docs/flags.md), [source file prefixes](docs/src-prefixes.md) |
| `wads/`           | Redistributable IWADs used for development and CI                                 |

## Requirements

- [mise](https://mise.jdx.dev/) — manages the toolchain and runs project tasks

`mise install` provisions everything else (Zig 0.16, Node.js, and clang-format)
at the versions pinned in [`mise.toml`](mise.toml) and verified against
[`mise.lock`](mise.lock). List available tasks with `mise tasks`.

## Build

```sh
mise run wasm
```

Produces `zig-out/bin/wasmdoom.wasm` (engine) and
`zig-out/bin/wasmdoom.music.wasm` (music synth). Builds are `Debug` by default.
For an optimized build, use the `release` profile
(`MISE_ENV=release mise run
wasm`), which sets `ZIG_OPTIMIZE=ReleaseSmall`. Any
task can be run this way, and you can override the level ad hoc with
`ZIG_OPTIMIZE=ReleaseFast mise run wasm`.

## Run locally

```sh
mise run web:dev
```

The dev server serves the wasm artifacts live from `zig-out/bin/`, so a
`zig build` + page refresh picks up engine changes.

## Test

```sh
mise run check
```

Runs formatting checks, builds the wasm artifacts, runs the web and tools test
suites, smoke-tests the music pipeline, and replays every scripted simulation
under `ci/simulations/`.

## Tools

```sh
mise exec -- node tools/cli.ts list-lumps ./wads/doom1.wad
mise exec -- node tools/cli.ts render-music ./wads/doom1.wad --wasm ./zig-out/bin/wasmdoom.music.wasm --track E1M1 --out out/music
mise exec -- node tools/cli.ts simulate ./wads/doom1.wad --wasm ./zig-out/bin/wasmdoom.wasm --commands ci/simulations/doom1/<script>.json --out out/sim
```

`simulate` runs the engine headless against a JSON command script and captures
frames/state — the same harness CI uses to validate WADs.

## Formatting

```sh
mise run fix         # rewrite C, web, and tools sources in place
mise run fmt:check   # CI-friendly dry run (C only)
```

## WADs

The repo tracks three redistributable IWADs: `wads/doom1.wad` (the DOOM
shareware episode) and `wads/freedoom1.wad` / `wads/freedoom2.wad` (unmodified
[Freedoom](https://freedoom.github.io/) IWADs, BSD-licensed). Commercial WADs
(`doom.wad`, `doom2.wad`, etc.) are deliberately kept out of the repo.
