# wasmdoom _(wip)_

A WebAssembly port of id Software's original 1993 DOOM, built from the
[id-Software/DOOM](https://github.com/id-Software/DOOM) source release
(`linuxdoom-1.10`).

## Requirements

- [Zig 0.16](https://ziglang.org/)
- `clang-format` — only needed for the `fmt` / `fmt-check` build steps

## Build

```sh
zig build
```

## Formatting

```sh
zig build fmt         # rewrite i_*.c / i_*.h in place
zig build fmt-check   # CI-friendly dry run
```
