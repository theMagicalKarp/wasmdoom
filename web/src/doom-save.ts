// localStorage-backed persistence for Doom saves, keyed by save-slot number.
//
// Two responsibilities:
//   - installAll: before the engine starts, copy every persisted save into the
//     wasm module's in-memory save store by writing it straight into the slot's
//     buffer.
//   - register: when the engine emits EV_SAVE_WRITTEN during a tick, copy the
//     bytes out and persist them to localStorage.
//
// The slot number is a save's identity end to end; the engine's "doomsav<N>.dsg"
// filename never crosses this boundary (the wasm store derives it from N).

import { EVENT, type EventDispatcher } from "@wasmdoom/lib/wasmdoom-events.ts";
import { bytesToBase64, base64ToBytes } from "./utils.ts";

export type SaveWasmExports = {
  memory: WebAssembly.Memory;
  wasmdoom_save_slot_ptr(slot: number): number;
  wasmdoom_save_commit(slot: number, dataLen: number): number;
};

const SAVE_SLOTS = 8;
const SAVE_DATA_CAP = 0x2c000;

export type DoomSaver = {
  installAll(doom: SaveWasmExports): void;
  register(events: EventDispatcher, doom: SaveWasmExports): void;
};

function saveKey(namespace: string, slot: number): string {
  return ["wasmdoom", "save", namespace, String(slot)].join(":");
}

export function createDoomSaver(opts: { namespace: string }): DoomSaver {
  const { namespace } = opts;

  function installAll(doom: SaveWasmExports): void {
    for (let slot = 0; slot < SAVE_SLOTS; slot++) {
      const encoded = localStorage.getItem(saveKey(namespace, slot));
      if (encoded === null) {
        continue;
      }
      let data: Uint8Array;
      try {
        data = base64ToBytes(encoded);
      } catch (e) {
        console.error(`[doom_host] could not decode save slot ${slot}:`, e);
        continue;
      }
      if (data.length > SAVE_DATA_CAP) {
        console.error(
          `[doom_host] save slot ${slot} too large (${data.length} > ${SAVE_DATA_CAP})`,
        );
        continue;
      }
      // Write the bytes straight into the slot's buffer, then commit the length.
      // The slot storage is the staging area, so there's no copy.
      const dataPtr = doom.wasmdoom_save_slot_ptr(slot);
      new Uint8Array(doom.memory.buffer, dataPtr, data.length).set(data);
      doom.wasmdoom_save_commit(slot, data.length);
    }
  }

  function register(events: EventDispatcher, doom: SaveWasmExports): void {
    events.register(EVENT.SAVE_WRITTEN, (view) => {
      const slot = view.getUint32(0, true);
      const dataPtr = view.getUint32(4, true);
      const dataLen = view.getUint32(8, true);
      // Copy out before the buffer is reused on the next tick.
      const bytes = new Uint8Array(
        doom.memory.buffer,
        dataPtr,
        dataLen,
      ).slice();
      try {
        localStorage.setItem(saveKey(namespace, slot), bytesToBase64(bytes));
      } catch (e) {
        console.error(`[doom_host] save_game(slot ${slot}) failed`, e);
      }
    });
  }

  return { installAll, register };
}
