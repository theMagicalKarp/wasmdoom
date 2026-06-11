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

- [Zig 0.16](https://ziglang.org/)
- [Node.js](https://nodejs.org/) — for the web frontend and the `tools/` CLI
- `clang-format` — only needed for the `fmt` / `fmt-check` build steps

## Build

```sh
make wasm
```

Produces `zig-out/bin/wasmdoom.wasm` (engine) and
`zig-out/bin/wasmdoom.music.wasm` (music synth). Builds are `Debug` by default;
override with `ZIG_OPTIMIZE=ReleaseFast make wasm`.

## Run locally

```sh
cd web
npm install
npm run dev
```

The dev server serves the wasm artifacts live from `zig-out/bin/`, so a
`zig build` + page refresh picks up engine changes.

## Test

```sh
make check
```

Runs formatting checks, builds the wasm artifacts, runs the web and tools test
suites, smoke-tests the music pipeline, and replays every scripted simulation
under `ci/simulations/`.

## Tools

```sh
node tools/cli.ts list-lumps ./wads/doom1.wad
node tools/cli.ts render-music ./wads/doom1.wad --wasm ./zig-out/bin/wasmdoom.music.wasm --track E1M1 --out out/music
node tools/cli.ts simulate ./wads/doom1.wad --wasm ./zig-out/bin/wasmdoom.wasm --commands ci/simulations/doom1/<script>.json --out out/sim
```

`simulate` runs the engine headless against a JSON command script and captures
frames/state — the same harness CI uses to validate WADs.

## Formatting

```sh
make fix         # rewrite C, web, and tools sources in place
make fmt-check   # CI-friendly dry run (C only)
```

## WADs

The repo tracks three redistributable IWADs: `wads/doom1.wad` (the DOOM
shareware episode) and `wads/freedoom1.wad` / `wads/freedoom2.wad` (unmodified
[Freedoom](https://freedoom.github.io/) IWADs, BSD-licensed). Commercial WADs
(`doom.wad`, `doom2.wad`, etc.) are deliberately kept out of the repo.
