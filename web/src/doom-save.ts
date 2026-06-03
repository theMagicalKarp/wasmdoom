import { bytesToBase64, base64ToBytes, readCString } from "./utils.ts";

export type DoomSaverImports = {
  wasmdoom_save_game(
    namePtr: number,
    sourcePtr: number,
    length: number,
  ): number;
  wasmdoom_load_game(namePtr: number, destPtr: number, maxLen: number): number;
};

export type DoomSaver = {
  buildImports(getMemory: () => WebAssembly.Memory): DoomSaverImports;
};

function saveKey(namesapce: string, name: string): string {
  return ["wasmdoom", "save", namesapce, name].join(":");
}

export function createDoomSaver(opts: { namespace: string }): DoomSaver {
  const { namespace } = opts;
  function buildImports(getMemory: () => WebAssembly.Memory): DoomSaverImports {
    return {
      wasmdoom_save_game: (namePtr, sourcePtr, len) => {
        const memory = getMemory();
        const name = readCString(memory, namePtr);
        const bytes = new Uint8Array(memory.buffer, sourcePtr, len).slice();
        try {
          localStorage.setItem(saveKey(namespace, name), bytesToBase64(bytes));
          return 0;
        } catch (e) {
          console.error(`[doom_host] save_game(${name}) failed`, e);
          return -1;
        }
      },
      wasmdoom_load_game: (namePtr, destPtr, maxLen) => {
        const memory = getMemory();
        const name = readCString(memory, namePtr);
        const encoded = localStorage.getItem(saveKey(namespace, name));
        if (encoded === null) {
          return -1;
        }
        const bytes = base64ToBytes(encoded);
        if (destPtr !== 0) {
          const n = Math.min(bytes.length, maxLen);
          new Uint8Array(memory.buffer, destPtr, n).set(bytes.subarray(0, n));
        }
        return bytes.length;
      },
    };
  }

  return { buildImports };
}
