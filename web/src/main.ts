import { createDoomAudio } from "./doom-audio.ts";
import { EVENT, createEventDispatcher } from "@wasmdoom/lib/wasmdoom-events.ts";
import { createDoomSaver } from "./doom-save.ts";
import { gameModeForWad, loadDoom } from "./doom-runtime.ts";
import { runGameLoop } from "./game-loop.ts";
import { createInput } from "./input.ts";
import { createDoomRenderer } from "./doom-renderer.ts";
import { createRecorder } from "./recorder.ts";
import { flagsFromQuery, resolveWad } from "./wad-route.ts";
import { pathJoin } from "./utils.ts";

const { BASE_URL } = import.meta.env;

async function main() {
  const canvas = document.getElementById("screen");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("missing #screen canvas element");
  }
  const loadingOverlay = document.getElementById("loading-overlay");
  // The path selects the IWAD (/wad/<slug>); "/" boots the default.
  const wad = resolveWad(window.location.pathname, BASE_URL);
  const renderer = createDoomRenderer(canvas);
  const saver = createDoomSaver({ namespace: wad });
  const audio = createDoomAudio();

  const doom = await loadDoom({
    wasmUrl: pathJoin(BASE_URL, "wasmdoom.wasm"),
  });

  // Push the IWAD bytes straight into linear memory and declare its game mode.
  const wadResp = await fetch(pathJoin(BASE_URL, `wads/${wad}`));
  const wadBytes = new Uint8Array(await wadResp.arrayBuffer());
  doom.loadWad(wadBytes);

  // Front-load persisted saves before any tick runs so I_LoadGame is a pure
  // in-memory lookup with no host round-trip.
  saver.installAll(doom.exports);

  const events = createEventDispatcher(doom.exports);
  audio.register(events, doom.exports);
  saver.register(events, doom.exports);
  // EV_ERROR/EV_INFO/EV_WARNING carry their message bytes inline in the
  // payload, so decode the view directly.
  const decodeLog = (view: DataView) =>
    new TextDecoder().decode(
      new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
    );
  events.register(EVENT.ERROR, (view) =>
    console.error(`[doom_engine] ${decodeLog(view)}`),
  );
  events.register(EVENT.INFO, (view) =>
    console.log(`[doom_engine] ${decodeLog(view)}`),
  );
  events.register(EVENT.WARNING, (view) =>
    console.warn(`[doom_engine] ${decodeLog(view)}`),
  );

  // Query params (?skill=4&warp=1&nomonsters) become engine flags; the recorder
  // captures them so headless replays reuse the same initialization.
  const params = new URLSearchParams(window.location.search);
  const flags = ["-mode", gameModeForWad(wad), ...flagsFromQuery(params)];
  doom.init(flags);
  events.drain();

  // Off unless the page is loaded with ?record; emits the same SimScript JSON
  // the headless simulator replays.
  const recorder = createRecorder({ flags });
  const input = createInput({ canvas, doom: doom.exports, audio, recorder });

  // Engine is initialized and the first frame is about to render; drop the
  // boot spinner that covered the download + init.
  loadingOverlay?.classList.add("hidden");

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
      // Drain in finally so an I_Error (which emits EV_ERROR then traps,
      // throwing a RuntimeError out of the tick) still gets its event logged
      // before the throw latches the loop off.
      try {
        doom.exports.wasmdoom_tick();
        recorder?.endTick();
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
