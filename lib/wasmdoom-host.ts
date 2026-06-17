// Host-side helpers for booting the engine wasm, shared by the headless host
// (tools/lib/wasmdoom-headless.ts) and the browser runtime
// (web/src/doom-runtime.ts): both declare the IWAD's game mode and stage Doom's
// command-line flags into the engine's argv buffer the same way.

// Mirrors GameMode_t in src/doomdef.h. The host declares the IWAD's mode; the
// engine no longer probes a filesystem to identify it.
export type GameMode =
  | "shareware"
  | "registered"
  | "commercial"
  | "retail"
  | "indetermined";

// Maps a known IWAD filename to its game mode. Replaces the old filesystem
// IdentifyVersion probe: the host now tells the engine which IWAD this is.
export function gameModeForWad(filename: string): GameMode {
  switch (filename.toLowerCase()) {
    case "doom2.wad":
    case "doom2f.wad":
    case "plutonia.wad":
    case "tnt.wad":
    case "freedoom2.wad":
      return "commercial";
    case "doomu.wad":
    case "freedoom1.wad":
      return "retail";
    case "doom.wad":
      return "registered";
    case "doom1.wad":
      return "shareware";
    default:
      return "indetermined";
  }
}

// Mirrors WD_ARGV_BUF_CAP in src/wasmdoom.c (kept in sync by hand, like the
// event tags). The flag tokens written into the argv buffer must fit here.
export const ARGV_BUF_CAP = 4096;

// Writes Doom command-line flags into the engine's argv staging buffer as
// NUL-separated tokens followed by an extra trailing NUL (the empty token
// that terminates the self-terminating list).
export function stageArgv(
  memory: WebAssembly.Memory,
  argvPtr: number,
  flags: readonly string[],
): void {
  const encoder = new TextEncoder();
  const parts = flags.map((token) => encoder.encode(token));
  const total = parts.reduce((n, p) => n + p.length + 1, 0) + 1;
  if (total > ARGV_BUF_CAP) {
    throw new Error(
      `flags need ${total} bytes, exceeds ARGV_BUF_CAP (${ARGV_BUF_CAP})`,
    );
  }
  const buf = new Uint8Array(memory.buffer, argvPtr, ARGV_BUF_CAP);
  let off = 0;
  for (const part of parts) {
    buf.set(part, off);
    off += part.length;
    buf[off++] = 0; // NUL separator
  }
  buf[off] = 0; // empty token terminates the list
}
