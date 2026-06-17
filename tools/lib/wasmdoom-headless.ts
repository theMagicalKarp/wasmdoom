// Node-side host that loads the Doom wasm and a WAD into linear memory.
//
// The engine wasm is freestanding: it has zero imports and is instantiated with
// an empty import object (mirroring web/src/doom-runtime.ts). There is no WASI
// layer and no `_initialize`; the host stages the WAD + argv into linear memory
// and calls `wasmdoom_init`. Engine crashes (I_Error -> __builtin_trap) surface
// as a wasm trap, which we convert to an EngineCrashError below.

import { readFile } from "node:fs/promises";
import {
  assertWasmdoomExports,
  type WasmdoomExports,
} from "@wasmdoom/lib/wasmdoom-exports.ts";
import { stageArgv } from "@wasmdoom/lib/wasmdoom-host.ts";
import { EVENT, readEvents } from "@wasmdoom/lib/wasmdoom-events.ts";
import {
  MAP_OBJECT_FIELD,
  MAP_OBJECT_OFF,
  MAP_OBJECT_REC,
  type MapObject,
} from "@wasmdoom/lib/map-object-layout.ts";
import {
  PLAYER_FIELD,
  PLAYER_LEN,
  PLAYER_OFF,
  PLAYER_REC,
  type Player,
} from "@wasmdoom/lib/player-layout.ts";

// Thrown when the wasm process calls exit() or aborts mid-tick. The engine's
// exit() traps the wasm, so callers see this instead of a raw RuntimeError and
// can distinguish engine crashes from other thrown values.
export class EngineCrashError extends Error {
  readonly exitCode: number;
  constructor(exitCode: number, message?: string) {
    super(message ?? `wasm engine exited with code ${exitCode}`);
    this.name = "EngineCrashError";
    this.exitCode = exitCode;
  }
}

export type ErrorRecord = {
  source: "exit";
  message: string;
};

// Decode a record's inline message bytes (EV_ERROR/EV_INFO/EV_WARNING all carry
// their text this way).
function eventText(payload: DataView): string {
  return new TextDecoder().decode(
    new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength),
  );
}

// Scan the outbound event buffer for the EV_ERROR record I_Error emits right
// before exit(), and decode its message. Safe to call after the tick/_start has
// thrown: proc_exit only throws, so wasm linear memory stays readable, and the
// buffer is cleared only at the start of the next tick (which never comes after
// a crash). readEvents does not consume the buffer, so the record survives.
// Returns null if no error record is present.
function readEngineError(exports: WasmdoomExports): string | null {
  for (const { tag, payload } of readEvents(exports)) {
    if (tag === EVENT.ERROR) {
      return eventText(payload);
    }
  }
  return null;
}

// Walk the outbound event buffer and print EV_INFO/EV_WARNING records, whose
// payloads are the message bytes inline. Call once per tick (the buffer is
// cleared at the start of the next tick) and after init. EV_ERROR is handled
// separately by readEngineError, so it is skipped here.
export function drainLogs(exports: WasmdoomExports): void {
  if (exports.wasmdoom_events_len() === 0) {
    return;
  }
  for (const { tag, payload } of readEvents(exports)) {
    if (tag === EVENT.INFO || tag === EVENT.WARNING) {
      const message = eventText(payload);
      if (tag === EVENT.WARNING) {
        console.warn(`[doom_engine] ${message}`);
      } else {
        console.log(`[doom_engine] ${message}`);
      }
    }
  }
  exports.wasmdoom_events_clear();
}

export type HeadlessDoom = {
  exports: WasmdoomExports;
  errors: ErrorRecord[];
};

export async function loadHeadlessDoom(opts: {
  wadPath: string;
  wasmPath: string;
  // Doom command-line flags (excluding argv[0]), e.g. ["-warp", "1"].
  flags?: string[];
}): Promise<HeadlessDoom> {
  const [wadBytes, wasmBytes] = await Promise.all([
    readFile(opts.wadPath),
    readFile(opts.wasmPath),
  ]);

  const errors: ErrorRecord[] = [];

  // Freestanding wasm: no imports, no WASI. Instantiate with an empty import
  // object, just like the web runtime.
  const { instance } = await WebAssembly.instantiate(wasmBytes, {});
  assertWasmdoomExports(instance.exports);
  const exports = instance.exports;

  // Stage the IWAD straight into linear memory.
  const wadPtr = exports.wasmdoom_wad_alloc(wadBytes.length);
  if (wadPtr === 0) {
    throw new EngineCrashError(
      -1,
      `wasmdoom_wad_alloc(${wadBytes.length}) failed`,
    );
  }
  new Uint8Array(exports.memory.buffer, wadPtr, wadBytes.length).set(wadBytes);

  // Stage flag tokens as NUL-separated argv into the engine's buffer.
  try {
    stageArgv(exports.memory, exports.wasmdoom_argv_ptr(), opts.flags ?? []);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new EngineCrashError(-1, message);
  }

  // Run engine setup. Like a tick, it can I_Error → exit() mid-call, which traps
  // the wasm; convert any throw into an EngineCrashError, decoding the engine's
  // own error message from the event buffer when present.
  try {
    exports.wasmdoom_init();
    drainLogs(exports);
  } catch (err) {
    const engineError = readEngineError(exports);
    const message =
      engineError ??
      `wasm trapped during init: ${err instanceof Error ? err.message : String(err)}`;
    errors.push({ source: "exit", message });
    throw new EngineCrashError(-1, message);
  }

  return { exports, errors };
}

// Run a single tick, converting a wasm trap (the engine's exit()) into an
// EngineCrashError. wasmdoom_tick clears the event buffer itself at the start of
// each tick, so the EV_ERROR record from a crash survives for readEngineError.
export function tickSafely(doom: HeadlessDoom): void {
  try {
    doom.exports.wasmdoom_tick();
    drainLogs(doom.exports);
  } catch (err) {
    const engineError = readEngineError(doom.exports);
    const message =
      engineError ??
      `wasm trapped during tick: ${err instanceof Error ? err.message : String(err)}`;
    doom.errors.push({ source: "exit", message });
    throw new EngineCrashError(-1, message);
  }
}

export function readFramebuffer(doom: HeadlessDoom): {
  indices: Uint8Array;
  palette: Uint8Array;
} {
  const fbPtr = doom.exports.wasmdoom_get_framebuffer();
  const palPtr = doom.exports.wasmdoom_get_palette();
  const memory = doom.exports.memory.buffer;
  // 320x200 8-bit indexed framebuffer, 768-byte RGB palette (256 * 3).
  const indices = new Uint8Array(memory, fbPtr, 320 * 200).slice();
  const palette = new Uint8Array(memory, palPtr, 768).slice();
  return { indices, palette };
}

// Snapshots the live map_objects (monsters, items, projectiles, the player)
// into a flat array. Recomputes the view each call because wasm memory growth
// invalidates the backing ArrayBuffer. fixed_t fields are decoded to world
// units (16.16 -> float); angle stays raw BAM.
export function readMapObjects(doom: HeadlessDoom): MapObject[] {
  const count = doom.exports.wasmdoom_snapshot_map_objects();
  const base = doom.exports.wasmdoom_map_objects_ptr();
  const view = new DataView(
    doom.exports.memory.buffer,
    base,
    count * MAP_OBJECT_REC,
  );
  const out: MapObject[] = [];
  for (let i = 0; i < count; i++) {
    const o = i * MAP_OBJECT_REC;
    out.push({
      x: view.getInt32(o + MAP_OBJECT_OFF.x, true) / 65536,
      y: view.getInt32(o + MAP_OBJECT_OFF.y, true) / 65536,
      z: view.getInt32(o + MAP_OBJECT_OFF.z, true) / 65536,
      angle: view.getUint32(o + MAP_OBJECT_OFF.angle, true),
      type: view.getInt32(o + MAP_OBJECT_OFF.type, true),
      health: view.getInt32(o + MAP_OBJECT_OFF.health, true),
      flags: view.getInt32(o + MAP_OBJECT_OFF.flags, true),
    });
  }
  return out;
}

// Snapshots the current player into a struct, or null if there is no player
// yet (e.g. the title screen). Like readMapObjects, recomputes the view each call
// because wasm memory growth invalidates the backing ArrayBuffer. fixed_t
// position/momentum fields are decoded to world units (16.16 -> float); angle
// stays raw BAM. cards/weapons are packed bitmasks (bit i = card_t/weapontype_t
// value i).
export function readPlayer(doom: HeadlessDoom): Player | null {
  if (!doom.exports.wasmdoom_snapshot_player()) {
    return null;
  }
  const base = doom.exports.wasmdoom_player_snapshot_ptr();
  const view = new DataView(doom.exports.memory.buffer, base, PLAYER_REC);
  const arr = (off: number, len: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < len; i++) {
      out.push(view.getInt32(off + i * 4, true));
    }
    return out;
  };
  return {
    health: view.getInt32(PLAYER_OFF.health, true),
    armorpoints: view.getInt32(PLAYER_OFF.armorpoints, true),
    armortype: view.getInt32(PLAYER_OFF.armortype, true),
    readyweapon: view.getInt32(PLAYER_OFF.readyweapon, true),
    pendingweapon: view.getInt32(PLAYER_OFF.pendingweapon, true),
    backpack: view.getInt32(PLAYER_OFF.backpack, true),
    cheats: view.getInt32(PLAYER_OFF.cheats, true),
    killcount: view.getInt32(PLAYER_OFF.killcount, true),
    itemcount: view.getInt32(PLAYER_OFF.itemcount, true),
    secretcount: view.getInt32(PLAYER_OFF.secretcount, true),
    playerstate: view.getInt32(PLAYER_OFF.playerstate, true),
    damagecount: view.getInt32(PLAYER_OFF.damagecount, true),
    bonuscount: view.getInt32(PLAYER_OFF.bonuscount, true),
    attackdown: view.getInt32(PLAYER_OFF.attackdown, true),
    usedown: view.getInt32(PLAYER_OFF.usedown, true),
    refire: view.getInt32(PLAYER_OFF.refire, true),
    cards: view.getInt32(PLAYER_OFF.cards, true),
    weapons: view.getInt32(PLAYER_OFF.weapons, true),
    ammo: arr(PLAYER_OFF.ammo, PLAYER_LEN.ammo),
    maxammo: arr(PLAYER_OFF.maxammo, PLAYER_LEN.maxammo),
    powers: arr(PLAYER_OFF.powers, PLAYER_LEN.powers),
    x: view.getInt32(PLAYER_OFF.x, true) / 65536,
    y: view.getInt32(PLAYER_OFF.y, true) / 65536,
    z: view.getInt32(PLAYER_OFF.z, true) / 65536,
    angle: view.getUint32(PLAYER_OFF.angle, true),
    momx: view.getInt32(PLAYER_OFF.momx, true) / 65536,
    momy: view.getInt32(PLAYER_OFF.momy, true) / 65536,
    momz: view.getInt32(PLAYER_OFF.momz, true) / 65536,
  };
}

// fixed_t fields (encoded x65536 on the way in); the rest are written raw.
const PLAYER_FIXED_FIELDS = new Set(["x", "y", "z", "momx", "momy", "momz"]);
const PLAYER_POS_FIELDS = new Set([
  "x",
  "y",
  "z",
  "angle",
  "momx",
  "momy",
  "momz",
]);
const PLAYER_ARRAY_FIELDS = new Set(["ammo", "maxammo", "powers"]);

// Override the live player. Snapshots first so untouched fields keep their
// current values, writes only the fields present in `patch` into the shared
// buffer, ORs the matching PLAYER_FIELD dirty bits, and calls
// wasmdoom_apply_player so the engine writes them back into viewplayer. Returns
// false if there is no player. Must run with no tick between this and the call.
// fixed_t position/momentum fields are encoded (world units -> 16.16); angle is
// raw BAM; cards/weapons are packed bitmasks (bit i = card_t/weapontype_t i).
// Note: set `pendingweapon` (not `readyweapon`) to trigger an animated switch.
export function writePlayer(
  doom: HeadlessDoom,
  patch: Partial<Player>,
): boolean {
  if (!doom.exports.wasmdoom_snapshot_player()) {
    return false;
  }
  const base = doom.exports.wasmdoom_player_snapshot_ptr();
  const view = new DataView(doom.exports.memory.buffer, base, PLAYER_REC);
  let dirty = 0;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    const off = PLAYER_OFF[key as keyof typeof PLAYER_OFF];
    if (PLAYER_ARRAY_FIELDS.has(key)) {
      const len = PLAYER_LEN[key as keyof typeof PLAYER_LEN];
      const elems = value as number[];
      for (let i = 0; i < len; i++) {
        view.setInt32(off + i * 4, elems[i] | 0, true);
      }
      dirty |= PLAYER_FIELD[key as keyof typeof PLAYER_FIELD];
    } else if (PLAYER_POS_FIELDS.has(key)) {
      if (PLAYER_FIXED_FIELDS.has(key)) {
        view.setInt32(off, Math.round((value as number) * 65536), true);
      } else {
        view.setUint32(off, (value as number) >>> 0, true); // angle, raw BAM
      }
      dirty |= PLAYER_FIELD.pos;
    } else {
      view.setInt32(off, (value as number) | 0, true);
      dirty |= PLAYER_FIELD[key as keyof typeof PLAYER_FIELD];
    }
  }
  view.setUint32(PLAYER_OFF.dirty, dirty >>> 0, true);
  doom.exports.wasmdoom_apply_player();
  return true;
}

// Override live map_objects, keyed by their index in the most recent snapshot
// order. Snapshots first (which establishes that order and zeroes every
// record's dirty field), writes the patched fields, ORs the MAP_OBJECT_FIELD
// dirty bits per record, and calls wasmdoom_apply_map_objects. Indices out of
// range are ignored. Returns the map_object count. x/y/z are encoded (world
// units -> 16.16); angle is raw BAM. Must run with no tick between this and the
// call.
export function writeMapObjects(
  doom: HeadlessDoom,
  patches: Iterable<readonly [number, Partial<MapObject>]>,
): number {
  const count = doom.exports.wasmdoom_snapshot_map_objects();
  const base = doom.exports.wasmdoom_map_objects_ptr();
  const view = new DataView(
    doom.exports.memory.buffer,
    base,
    count * MAP_OBJECT_REC,
  );
  for (const [index, patch] of patches) {
    if (index < 0 || index >= count) {
      continue;
    }
    const recOff = index * MAP_OBJECT_REC;
    let dirty = 0;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        continue;
      }
      const off = recOff + MAP_OBJECT_OFF[key as keyof typeof MAP_OBJECT_OFF];
      if (key === "angle") {
        view.setUint32(off, (value as number) >>> 0, true);
        dirty |= MAP_OBJECT_FIELD.pos;
      } else if (key === "x" || key === "y" || key === "z") {
        view.setInt32(off, Math.round((value as number) * 65536), true);
        dirty |= MAP_OBJECT_FIELD.pos;
      } else {
        view.setInt32(off, (value as number) | 0, true);
        dirty |= MAP_OBJECT_FIELD[key as keyof typeof MAP_OBJECT_FIELD];
      }
    }
    view.setUint32(recOff + MAP_OBJECT_OFF.dirty, dirty >>> 0, true);
  }
  doom.exports.wasmdoom_apply_map_objects();
  return count;
}
