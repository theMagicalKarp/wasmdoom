import {
  WASI,
  ConsoleStdout,
  OpenFile,
  File,
  PreopenDirectory,
} from "@bjorn3/browser_wasi_shim";
import { assertWasmdoomInstance } from "./wasi-instance.ts";
import { WASMDOOM_KEYS } from "./wasmdoom.ts";

const KEY_MAP = new Map([
  ["ArrowUp", WASMDOOM_KEYS.KEY_UPARROW],
  ["ArrowDown", WASMDOOM_KEYS.KEY_DOWNARROW],
  ["ArrowLeft", WASMDOOM_KEYS.KEY_LEFTARROW],
  ["ArrowRight", WASMDOOM_KEYS.KEY_RIGHTARROW],
  ["Enter", WASMDOOM_KEYS.KEY_ENTER],
]);

async function main() {
  const canvas = document.getElementById("screen");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("missing #screen canvas element");
  }
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("failed to get 2d rendering context");
  }

  const wadResp = await fetch("/wads/doom1.wad");
  const wadBytes = new Uint8Array(await wadResp.arrayBuffer());

  const stdin = new OpenFile(new File([]));
  const stdout = ConsoleStdout.lineBuffered((line) => console.log(line));
  const stderr = ConsoleStdout.lineBuffered((line) => console.warn(line));

  const cwd = new PreopenDirectory(
    "/",
    new Map<string, File>([
      ["doom1.wad", new File(wadBytes, { readonly: false })],
    ]),
  );

  const env = ["HOME=/", "DOOMWADDIR=/"];
  const wasi = new WASI(["wasmdoom"], env, [stdin, stdout, stderr, cwd]);

  let memory: WebAssembly.Memory;
  const doomHost = {
    wasmdoom_error(messagePtr: number, length: number) {
      const bytes = new Uint8Array(memory.buffer, messagePtr, length);
      console.error(`[doom_host] error: ${new TextDecoder().decode(bytes)}`);
    },
  };

  const { instance } = await WebAssembly.instantiateStreaming(
    fetch("/wasmdoom.wasm"),
    {
      wasi_snapshot_preview1: wasi.wasiImport,
      doom_host: doomHost,
    },
  );

  assertWasmdoomInstance(instance);
  wasi.start(instance);
  memory = instance.exports.memory;

  window.addEventListener("keydown", (event: KeyboardEvent) => {
    const doomkey = KEY_MAP.get(event.code);
    if (doomkey === undefined) {
      return;
    }
    event.preventDefault();
    instance.exports.wasmdoom_send_key(1, doomkey);
  });

  window.addEventListener("keyup", (event: KeyboardEvent) => {
    const doomkey = KEY_MAP.get(event.code);
    if (doomkey === undefined) {
      return;
    }
    event.preventDefault();
    instance.exports.wasmdoom_send_key(0, doomkey);
  });
  const SCREEN_WIDTH = 320;
  const SCREEN_HEIGHT = 200;
  instance.exports.wasmdoom_init();

  const FRAME_MS = 1000 / 30;

  const renderFrame = () => {
    assertWasmdoomInstance(instance);
    instance.exports.wasmdoom_tick();

    const buffer = instance.exports.memory.buffer;
    const indices = new Uint8Array(
      buffer,
      instance.exports.wasmdoom_get_framebuffer(),
      SCREEN_WIDTH * SCREEN_HEIGHT,
    );
    const palette = new Uint8Array(
      buffer,
      instance.exports.wasmdoom_get_palette(),
      256 * 3,
    );

    const imageData = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    for (let i = 0; i < SCREEN_WIDTH * SCREEN_HEIGHT; i++) {
      const p = indices[i] * 3;
      const o = i * 4;
      imageData.data[o + 0] = palette[p + 0]; // R
      imageData.data[o + 1] = palette[p + 1]; // G
      imageData.data[o + 2] = palette[p + 2]; // B
      imageData.data[o + 3] = 255; // A
    }
    ctx.putImageData(imageData, 0, 0);
  };

  let lastFrame = performance.now();
  function loop(now: number) {
    requestAnimationFrame(loop);
    if (now - lastFrame < FRAME_MS) return;
    lastFrame = now - ((now - lastFrame) % FRAME_MS);
    renderFrame();
  }
  requestAnimationFrame(loop);
}

main().catch((e) => {
  console.error(e);
});
