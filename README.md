<div align="center">
  <img width="150" src="./docs/assets/logo.png" />
</div>

# wasmdoom _(wip)_

A WebAssembly port of id Software's original 1993 DOOM, built from the
[id-Software/DOOM](https://github.com/id-Software/DOOM) source release
(`linuxdoom-1.10`).

_View the full working demo at [https://themagicalkarp.github.io/wasmdoom/](https://themagicalkarp.github.io/wasmdoom/)._

## Requirements

- [Zig 0.16](https://ziglang.org/)
- `clang-format` — only needed for the `fmt` / `fmt-check` build steps
- [Node.js](https://nodejs.org/) — only needed to build frontend demo

## Build

```sh
make wasm
```

## Test

```sh
make check
```

## Formatting

```sh
make fmt         # rewrite *.c / *.h in place
make fmt-check   # CI-friendly dry run
```

## WADs

`wads/freedoom1.wad` and `wads/freedoom2.wad` are unmodified copies of the
[Freedoom](https://freedoom.github.io/) IWADs, redistributed under the BSD
license — see `wads/FREEDOOM-LICENSE.txt`. Commercial WADs
(`doom.wad`, `doom2.wad`, etc.) are deliberately kept out of the repo.
