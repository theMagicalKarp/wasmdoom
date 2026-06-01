import { createDoomAudio } from "./audio.ts";
import { loadDoom } from "./doom-runtime.ts";
import { runGameLoop } from "./game-loop.ts";
import { createInput } from "./input.ts";
import { createDoomRenderer } from "./renderer.ts";
import { pathJoin } from "./utils.ts";

const { BASE_URL } = import.meta.env;

async function main() {
  const canvas = document.getElementById("screen");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("missing #screen canvas element");
  }
  const renderer = createDoomRenderer(canvas);
  const audio = createDoomAudio();

  const doom = await loadDoom({
    wadUrl: pathJoin(BASE_URL, "wads/doom1.wad"),
    wasmUrl: pathJoin(BASE_URL, "wasmdoom.wasm"),
    buildHost: (host) => ({
      ...audio.buildImports(host.getMemory),
      wasmdoom_error(ptr, len) {
        const bytes = new Uint8Array(host.getMemory().buffer, ptr, len);
        console.error(`[doom_host] error: ${new TextDecoder().decode(bytes)}`);
      },
      wasmdoom_draw: () => renderer.drawFrame(host.getExports()),
    }),
  });

  const input = createInput({ canvas, doom: doom.exports, audio });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      audio.suspend();
    } else {
      audio.resume();
    }
  });

  doom.exports.wasmdoom_init();
  runGameLoop({
    fps: 30,
    tick: () => {
      input.flushFrame();
      doom.exports.wasmdoom_tick();
    },
  });
}

main().catch((e) => {
  console.error(e);
});
