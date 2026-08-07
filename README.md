<div align="center">
  <img width="150" src="./docs/assets/logo.png" />
</div>

# wasmdoom

This is a project aimed at producing a small, portable WebAssembly artifact
which hosts the DOOM game engine. Ultimately this is meant to be a simple DOOM
state machine, where inputs can be fed in, and visual and audio information is
output.

Goals:

- **Little to no dependencies to run** — all you need is the ability to execute
  wasm, and you can run DOOM (you can even simulate/run DOOM without a keyboard
  and screen).
- **Small** — the artifact should be smaller than the original DOOM executable.
- **Easy to get started** — no functions are required to be implemented by the
  host on the wasm instance at startup.

A browser-based version which utilizes the wasm binary can be found at
[https://themagicalkarp.github.io/wasmdoom](https://themagicalkarp.github.io/wasmdoom),
and provides various wads/flags which can be defined:

- [Play Freedoom: Phase 1](https://themagicalkarp.github.io/wasmdoom/wad/freedoom1) -
  swap in a different IWAD via the URL path
- [Play Freedoom: Phase 2](https://themagicalkarp.github.io/wasmdoom/wad/freedoom2)
- [Warp straight to E1M9](https://themagicalkarp.github.io/wasmdoom/?warp=1,9) -
  jump to any level with `?warp=`
- [E1M2 with no monsters](https://themagicalkarp.github.io/wasmdoom/?warp=1,2&nomonsters=true)
- [E1M8 on Nightmare](https://themagicalkarp.github.io/wasmdoom/?warp=1,8&skill=5) -
  set difficulty with `skill=1–5`

And yes, this supports [Chex Quest](https://en.wikipedia.org/wiki/Chex_Quest)
_(and whatever other OG DOOM WADs you can get your hands on)_ they're just
omitted from this repo to avoid the headache of redistributing things I don't
hold the license for. To try them out in the web version,
[run this locally](#run-locally) and drop the WAD into the `wads/` folder. For
example, placing `chex.wad` there makes it available at
`http://localhost:5173/wad/chex`.

The logic for running the WebAssembly in the browser, and interfacing with the
HTML canvas, can be found in the [`./web`](web/README.md) folder.

# Why?

This mostly started as a prank I was planning for my work, where I'd host a DOOM
webpage on one of our internal developer websites. I mostly thought it'd be
funny to show a working version of DOOM during one of our demos.

And so I started doing research on the best way to run DOOM on a webpage that'd
offer some level of customizability. I mean, it's DOOM, surely someone has
developed a decent browser port, right?

To my surprise, I found the existing offerings to be pretty lacking, or more
involved than what I was looking for. I was pretty disappointed, but this sent
me down a rabbit hole which led me to creating this project.

Of the examples I found, I was left thinking "why isn't this easier?" DOOM
should be a solved problem.

## Huh? Hasn't DOOM been ported to WebAssembly before?

Well, yeah there's nothing original here, and there are countless examples out
there today that work. To name a few:

- https://github.com/jacobenget/doom.wasm
- https://github.com/cloudflare/doom-wasm
- https://github.com/lazarv/wasm-doom
- https://github.com/diekmann/wasm-fizzbuzz/tree/main/doom#but-can-it-run-doom
- https://github.com/UstymUkhman/webDOOM
- https://github.com/raz0red/webprboom
- https://github.com/VanIseghemThomas/wasmDOOM
- https://github.com/muhammedaksam/opentui-doom
- https://github.com/neilrackett/doom
- https://github.com/wasm3/pywasm3-doom-demo
- https://github.com/healeycodes/doom-checkboxes

Despite that, I found all of these to be lacking something I was looking for.

I wanted:

- Something that was portable, easy to run, and self-contained
- Working music and audio
- Free of visual bugs <sup>(a surprising amount don't support the icon melting
  screen wipes)</sup>
- Extendable
- Small

At the end of the day, most of the projects I reviewed felt like demos, and not
actually something meant for people to interface with. In addition, the compiled
wasm artifact here is the smallest (only ~300kb) and doesn't require any extra
dependencies such as [WASI](https://wasi.dev/).

## What this is

This led me to this project, and ultimately shaped some of the design decisions
under the hood.

The engine compiles to freestanding `wasm32` with **zero imports** — no WASI, no
libc, no Emscripten. The host pushes the IWAD, command-line flags, and input
events directly into linear memory and drives the engine through its exported
tick/draw functions. Music is synthesized by a separate OPL3 emulator wasm
(`wasmdoom.music.wasm`), also freestanding.

This port is entirely meant for single player only.

## Under the hood

This project's source code was directly copied from the
[id-Software/DOOM](https://github.com/id-Software/DOOM) repo (`linuxdoom-1.10`).
I chose this over ports like
[Chocolate DOOM](https://github.com/chocolate-doom/chocolate-doom) or
[doomgeneric](https://github.com/ozkl/doomgeneric) as an opportunity to
experience the OG codebase itself. I wanted to understand what people
loved/raved about in the source code. Doing so was a great opportunity to
understand what makes DOOM so great, and ultimately became one of the leading
design principles of this project: that reducing the surface area of our
dependencies makes for clean, long-living, and reliable software.

For example, early in development I was using [WASI](https://wasi.dev/) to
handle the shims for reading environment variables and the filesystem, but
ultimately found I didn't need them if I put in the work to replace those
components. That resulted in a smaller artifact and fewer requirements to run
this project (which really felt in the spirit of enabling DOOM to run anywhere,
something I wanted to help proliferate with this project).

Given this is the original DOOM, I aimed to avoid making direct edits to the
logic, so bugs which existed in the original source code likely still exist
here. Any edits I made were primarily for supporting running the code in a bare
WebAssembly instance. The goal here is to leave DOOM as-is.

## How to use

The engine is a state machine: you write bytes into linear memory, call exported
functions, and read bytes back out. There are no imports to satisfy, so
instantiation is one line in any wasm runtime.

### The flow

This is a bare bones JavaScript example, but essentially the same can be done
for any conceivable language that supports a WebAssembly runtime.

```js
const { instance } = await WebAssembly.instantiate(wasmBytes); // zero imports
const doom = instance.exports;

// 1. Stage the IWAD: allocate space inside the module, copy the bytes in.
const ptr = doom.wasmdoom_wad_alloc(wadBytes.length);
new Uint8Array(doom.memory.buffer, ptr, wadBytes.length).set(wadBytes);

// 2. Optionally stage command-line flags (see docs/flags.md): NUL-separated
//    tokens written at wasmdoom_argv_ptr(), ended by a double NUL.

// 3. Boot the engine.
doom.wasmdoom_init();

// 4. Run the loop at 35 Hz (DOOM's native tick rate).
setInterval(() => {
  doom.wasmdoom_keydown(keyCode); // push any pending input
  doom.wasmdoom_tick(); // advance the simulation one tic
  drainEvents(doom); // read what happened (see below)
  drawFrame(doom); // blit the framebuffer
}, 1000 / 35);
```

Video output is DOOM's plain 320×200 8-bit framebuffer:
`wasmdoom_get_framebuffer()` returns palette indices, and
`wasmdoom_get_palette()` returns the current 256-entry RGB palette to resolve
them against. Blit that however your platform likes the browser host does it
with a canvas in [`web/src/doom-renderer.ts`](web/src/doom-renderer.ts), and the
headless simulator just writes PNGs.

The browser frontend in [`./web`](web/README.md) is a complete worked example;
[`web/src/main.ts`](web/src/main.ts) is under 100 lines.

### Diagram

```
   host (browser, Node, …)                 wasmdoom.wasm (zero imports)
           │                                            │
           │  write IWAD + flags into linear memory     │
           │───────────────────────────────────────────▶│
           │  wasmdoom_init()                           │
           │───────────────────────────────────────────▶│
           │                                            │
╭─ every tick (35 Hz) ─────────────────────────────────────────────╮
│          │  wasmdoom_keydown / keyup / send_mouse     │          │
│          │───────────────────────────────────────────▶│          │
│          │  wasmdoom_tick()                           │          │
│          │───────────────────────────────────────────▶│          │
│          │  drain event buffer (logs, sound, music,   │          │
│          │  saves, gameplay events)                   │          │
│          │◀───────────────────────────────────────────│          │
│          │  read framebuffer + palette, blit          │          │
│          │◀───────────────────────────────────────────│          │
╰───────────────────────────────────────────────────────────────────╯
```

### The event system

Zero imports cuts both ways: the engine can never call the host. Everything it
wants to say including `printf`-style logging is appended to a single outbound
buffer during `wasmdoom_init` / `wasmdoom_tick`, and the host drains it after
each call:

1. Read `wasmdoom_events_len()` bytes at `wasmdoom_events_ptr()`.
2. Decode records: a `u16` tag, a `u16` payload length, then the payload (all
   little-endian).
3. Call `wasmdoom_events_clear()` to reset the cursor for the next tick.

Tags are defined in [`src/wd_events.h`](src/wd_events.h) and mirrored for
TypeScript hosts in [`lib/wasmdoom-events.ts`](lib/wasmdoom-events.ts). They
split into infrastructure events (logs, sound/music commands, save-game writes)
and gameplay events (level loaded, player died, enemy killed, secret found,
cheat activated, …) the latter exist purely so hosts can build things on top of
the game: overlays, stats, achievements, whatever. Large payloads like SFX and
song lumps aren't copied into the buffer; the record carries a pointer + length
into linear memory instead.

Input flows the other way through dedicated exports (`wasmdoom_keydown`,
`wasmdoom_keyup`, `wasmdoom_send_mouse`), which queue events the engine consumes
on the next tick.

### How audio works

The engine never produces an audio sample, it emits _intents_ through the event
buffer and leaves playback to the host:

- **SFX** - `SOUND_START` / `SOUND_UPDATE` / `SOUND_STOP` records carry a
  channel handle, a pointer to the sound's DMX lump in the WAD (an 8-byte header
  followed by 8-bit 11,025 Hz mono PCM), and volume/pan/pitch. The browser host
  decodes the lump once and plays it through Web Audio nodes
  ([`web/src/doom-audio.ts`](web/src/doom-audio.ts)).
- **Music** - `MUSIC_*` records hand over the WAD's GENMIDI lump (the OPL
  instrument bank) and MUS song lumps, plus play/pause/stop/volume commands. The
  host feeds these to the second artifact, `wasmdoom.music.wasm`, a freestanding
  OPL3 emulator + MUS sequencer that synthesizes stereo samples on demand. In
  the browser it runs inside an `AudioWorklet`; the `render-music` CLI tool
  drives the same wasm to write audio files offline.

```
wasmdoom.wasm (engine)      host (doom-audio.ts)         wasmdoom.music.wasm             Audio
      │                            │              (OPL3 + MUS sequencer, in Worklet)       │
      │  SOUND_START {channel, DMX │                            │                          │
      │  lump ptr+len, vol/sep/    │                            │                          │
      │  pitch}                    │  read + decode the DMX     │                          │
      │───────────────────────────▶│  lump from engine memory ────────────────────────────▶│  per-channel voice:
      │        (event buffer)      │                            │                          │  source ▸ pan ▸ gain
      │  SOUND_UPDATE / SOUND_STOP │                            │                          │
      │───────────────────────────▶│ retune / kill voice ─────────────────────────────────▶│
      │                            │                            │                          │
      │  MUSIC_SET_GENMIDI {ptr+   │                            │                          │
      │  len}                      │                            │                          │
      │  MUSIC_REGISTER {MUS ptr+  │  copy lumps out of engine  │                          │
      │  len}                      │  memory, postMessage ─────▶│  synthesize stereo       │
      │───────────────────────────▶│                            │  samples from GENMIDI    │
      │  MUSIC_PLAY / PAUSE /      │                            │  + MUS on demand         │
      │  RESUME / STOP /           │  forward command ─────────▶│      │                   │
      │  UNREGISTER / SET_VOLUME   │                            │      │  PCM sample       │
      │───────────────────────────▶│                            │      └─ stream ─────────▶│
      │                            │                            │                          ▼
      │                            │                            │                       speakers
```

This split keeps the engine deterministic and headless-friendly: a host without
speakers (like the CI simulator) simply ignores the sound events.

### Poking at game state

Beyond the event stream, the engine exposes a snapshot/apply interface for
reading and mutating live game state: the player (`wasmdoom_snapshot_player` /
`wasmdoom_apply_player`), global settings, and every map object on the level.
Each snapshot is a flat, documented struct the host reads straight out of linear
memory; to write, the host edits fields, sets the matching dirty bits, and calls
the apply export. The wire layouts live in [`src/wd_iface.h`](src/wd_iface.h).

## Development

### Repo layout

| Path              | What it is                                                                        |
| ----------------- | --------------------------------------------------------------------------------- |
| `src/`            | The C engine (see [docs/src-prefixes.md](docs/src-prefixes.md) for a map)         |
| `src/music/`      | OPL3 synth + MUS sequencer, built into the separate music wasm                    |
| `web/`            | Vite browser frontend ([web/README.md](web/README.md))                            |
| `tools/`          | Node CLI for WAD inspection, music rendering, and headless simulation             |
| `ci/simulations/` | Scripted gameplay runs used to validate WADs and engine behavior in CI            |
| `docs/`           | [Command-line flags](docs/flags.md), [source file prefixes](docs/src-prefixes.md) |
| `wads/`           | Redistributable IWADs used for development and CI                                 |

### Requirements

- [mise](https://mise.jdx.dev/) - manages the toolchain and runs project tasks

`mise install` provisions everything else (Zig 0.16, Node.js, and clang-format)
at the versions pinned in [`mise.toml`](mise.toml) and verified against
[`mise.lock`](mise.lock). List available tasks with `mise tasks`.

### Build

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

### Run locally

```sh
mise run web:dev
```

The dev server serves the wasm artifacts live from `zig-out/bin/`, so a
`zig build` + page refresh picks up engine changes.

### Test

```sh
mise run check
```

Runs formatting checks, builds the wasm artifacts, runs the web and tools test
suites, smoke-tests the music pipeline, and replays every scripted simulation
under `ci/simulations/`.

### Tools

```sh
mise exec -- node tools/cli.ts list-lumps ./wads/doom1.wad
mise exec -- node tools/cli.ts render-music ./wads/doom1.wad --wasm ./zig-out/bin/wasmdoom.music.wasm --track E1M1 --out out/music
mise exec -- node tools/cli.ts simulate ./wads/doom1.wad --wasm ./zig-out/bin/wasmdoom.wasm --commands ci/simulations/doom1/<script>.json --out out/sim
```

`simulate` runs the engine headless against a JSON command script and captures
frames/state, the same harness CI uses to validate WADs.

### Formatting

```sh
mise run fix         # rewrite C, web, and tools sources in place
mise run fmt:check   # CI-friendly dry run (C only)
```

### WADs

The repo tracks three redistributable IWADs: `wads/doom1.wad` (the DOOM
shareware episode) and `wads/freedoom1.wad` / `wads/freedoom2.wad` (unmodified
[Freedoom](https://freedoom.github.io/) IWADs, BSD-licensed). Commercial WADs
(`doom.wad`, `doom2.wad`, etc.) are deliberately kept out of the repo.

## Inspirations

- https://github.com/ozkl/doomgeneric
- While working on this project, as supplemental understanding of DOOM, I leaned
  on many of [decino](https://www.youtube.com/@decino)'s YouTube videos on the
  analysis, mechanics, and design of the game to provide better insight while
  working on this codebase. Would highly recommend them for anyone researching
  DOOM.
