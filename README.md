# wasmdoom _(wip)_

A WebAssembly port of id Software's original 1993 DOOM, built from the
[id-Software/DOOM](https://github.com/id-Software/DOOM) source release
(`linuxdoom-1.10`).

## Requirements

- [Zig 0.16](https://ziglang.org/)
- `clang-format` — only needed for the `fmt` / `fmt-check` build steps
- [`wasmtime`](https://wasmtime.dev/) and
  [Binaryen](https://github.com/WebAssembly/binaryen) _(`wasm-as`, `wasm-merge`)_
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
