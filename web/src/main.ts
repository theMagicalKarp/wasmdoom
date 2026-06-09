import { createDoomAudio } from "./doom-audio.ts";
import { EVENT, createEventDispatcher } from "./doom-events.ts";
import { createDoomSaver } from "./doom-save.ts";
import { gameModeForWad, loadDoom } from "./doom-runtime.ts";
import { runGameLoop } from "./game-loop.ts";
import { createInput } from "./input.ts";
import { createDoomRenderer } from "./doom-renderer.ts";
import { pathJoin } from "./utils.ts";

const { BASE_URL } = import.meta.env;

async function main() {
  const canvas = document.getElementById("screen");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("missing #screen canvas element");
  }
  const wad = "doom1.wad";
  const renderer = createDoomRenderer(canvas);
  const saver = createDoomSaver({ namespace: wad });
  const audio = createDoomAudio();

  const doom = await loadDoom({
    wasmUrl: pathJoin(BASE_URL, "wasmdoom.wasm"),
  });

  // Push the IWAD bytes straight into linear memory (no WASI filesystem) and
  // declare its game mode.
  const wadResp = await fetch(pathJoin(BASE_URL, `wads/${wad}`));
  const wadBytes = new Uint8Array(await wadResp.arrayBuffer());
  doom.loadWad(wadBytes);

  // Front-load persisted saves before any tick runs so I_LoadGame is a pure
  // in-memory lookup with no host round-trip.
  saver.installAll(doom.exports);

  const events = createEventDispatcher(doom.exports);
  audio.register(events, doom.exports);
  saver.register(events, doom.exports);
  events.register(EVENT.ERROR, (view) => {
    const ptr = view.getUint32(0, true);
    const len = view.getUint32(4, true);
    const bytes = new Uint8Array(doom.exports.memory.buffer, ptr, len);
    console.error(`[doom_engine] ${new TextDecoder().decode(bytes)}`);
  });

  doom.init(["-mode", gameModeForWad(wad)]);
  events.drain();

  const input = createInput({ canvas, doom: doom.exports, audio });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      audio.suspend();
    } else {
      audio.resume();
    }
  });

  runGameLoop({
    fps: 35,
    tick: () => {
      input.flushFrame();
      // Drain in finally so an I_Error (which emits EV_ERROR then exit()s,
      // throwing WASIProcExit out of the tick) still gets its event logged
      // before the throw latches the loop off.
      try {
        doom.exports.wasmdoom_tick();
      } finally {
        events.drain();
      }
      renderer.drawFrame(doom.exports);
    },
  });
}

main().catch((e) => {
  console.error(e);
});
