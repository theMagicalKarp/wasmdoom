import {
  WASI,
  ConsoleStdout,
  OpenFile,
  File,
  PreopenDirectory,
} from "@bjorn3/browser_wasi_shim";
import nipplejs from "nipplejs";
import { assertWasmdoomInstance } from "./wasi-instance.ts";
import { WASMDOOM_KEYS, WASMDOOM_MOUSE_BUTTONS } from "./wasmdoom.ts";
import { createDoomAudio } from "./audio.ts";
import { isMobileDevice, pathJoin } from "./utils.ts";

type DoomInstance = {
  exports: {
    wasmdoom_keydown(key: number): void;
    wasmdoom_keyup(key: number): void;
  };
};

function setupMobileControls(instance: DoomInstance) {
  const container = document.getElementById("mobile-controls");
  const leftZone = document.getElementById("joystick-left-zone");
  const rightZone = document.getElementById("joystick-right-zone");
  const fireBtn = document.getElementById("fire-btn");
  const useBtn = document.getElementById("use-btn");
  if (!container || !leftZone || !rightZone || !fireBtn || !useBtn) return;

  container.classList.add("visible");

  const bindButton = (btn: HTMLElement, key: number) => {
    const press = (e: Event) => {
      e.preventDefault();
      btn.classList.add("pressed");
      instance.exports.wasmdoom_keydown(key);
    };
    const release = (e: Event) => {
      e.preventDefault();
      btn.classList.remove("pressed");
      instance.exports.wasmdoom_keyup(key);
    };
    btn.addEventListener("touchstart", press, { passive: false });
    btn.addEventListener("touchend", release, { passive: false });
    btn.addEventListener("touchcancel", release, { passive: false });
    btn.addEventListener("mousedown", press);
    btn.addEventListener("mouseup", release);
    btn.addEventListener("mouseleave", release);
  };

  bindButton(fireBtn, WASMDOOM_KEYS.KEY_FIRE);
  bindButton(useBtn, WASMDOOM_KEYS.KEY_USE);
  bindButton(useBtn, WASMDOOM_KEYS.KEY_ENTER);

  const leftJoystick = nipplejs.create({
    zone: leftZone,
    mode: "static",
    position: { left: "90px", bottom: "30%" },
    color: "white",
    size: 140,
    restJoystick: true,
  });

  const rightJoystick = nipplejs.create({
    zone: rightZone,
    mode: "static",
    position: { right: "90px", bottom: "30%" },
    color: "white",
    size: 140,
    restJoystick: true,
  });

  const active = {
    up: false,
    down: false,
    left: false,
    right: false,
    strafeRight: false,
    strafeLeft: false,
  };
  const THRESHOLD = 0.3;

  const setKey = (slot: keyof typeof active, key: number, want: boolean) => {
    if (active[slot] === want) return;
    active[slot] = want;
    if (want) {
      instance.exports.wasmdoom_keydown(key);
    } else {
      instance.exports.wasmdoom_keyup(key);
    }
  };

  leftJoystick.on("move", (evt) => {
    const data = evt.data;
    if (!data || !data.vector) return;
    const { x, y } = data.vector;
    setKey("up", WASMDOOM_KEYS.KEY_UPARROW, y > THRESHOLD);
    setKey("down", WASMDOOM_KEYS.KEY_DOWNARROW, y < -THRESHOLD);
    setKey("strafeLeft", WASMDOOM_KEYS.KEY_STRAFELEFT, x < -THRESHOLD);
    setKey("strafeRight", WASMDOOM_KEYS.KEY_STRAFERIGHT, x > THRESHOLD);
  });

  leftJoystick.on("end", () => {
    setKey("up", WASMDOOM_KEYS.KEY_UPARROW, false);
    setKey("down", WASMDOOM_KEYS.KEY_DOWNARROW, false);
    setKey("strafeLeft", WASMDOOM_KEYS.KEY_STRAFELEFT, false);
    setKey("strafeRight", WASMDOOM_KEYS.KEY_STRAFERIGHT, false);
  });

  rightJoystick.on("move", (evt) => {
    const data = evt.data;
    if (!data || !data.vector) return;
    const { x } = data.vector;
    setKey("left", WASMDOOM_KEYS.KEY_LEFTARROW, x < -THRESHOLD);
    setKey("right", WASMDOOM_KEYS.KEY_RIGHTARROW, x > THRESHOLD);
  });

  rightJoystick.on("end", () => {
    setKey("left", WASMDOOM_KEYS.KEY_LEFTARROW, false);
    setKey("right", WASMDOOM_KEYS.KEY_RIGHTARROW, false);
  });
}

const { BASE_URL } = import.meta.env;

const KEY_MAP = new Map([
  ["KeyW", WASMDOOM_KEYS.KEY_UPARROW],
  ["KeyS", WASMDOOM_KEYS.KEY_DOWNARROW],
  ["KeyA", WASMDOOM_KEYS.KEY_STRAFELEFT],
  ["KeyD", WASMDOOM_KEYS.KEY_STRAFERIGHT],
  ["ArrowUp", WASMDOOM_KEYS.KEY_UPARROW],
  ["ArrowDown", WASMDOOM_KEYS.KEY_DOWNARROW],
  ["ArrowLeft", WASMDOOM_KEYS.KEY_LEFTARROW],
  ["ArrowRight", WASMDOOM_KEYS.KEY_RIGHTARROW],

  ["Enter", WASMDOOM_KEYS.KEY_ENTER],
  ["Space", WASMDOOM_KEYS.KEY_USE],
  ["ShiftLeft", WASMDOOM_KEYS.KEY_SPEED],
  ["KeyZ", WASMDOOM_KEYS.KEY_FIRE],
  ["Comma", WASMDOOM_KEYS.KEY_STRAFELEFT],
  ["Period", WASMDOOM_KEYS.KEY_STRAFERIGHT],
  ["Escape", WASMDOOM_KEYS.KEY_BACKSPACE],
  ["Tab", WASMDOOM_KEYS.KEY_MAP],
  ["Digit1", WASMDOOM_KEYS.KEY_ONE],
  ["Digit2", WASMDOOM_KEYS.KEY_TWO],
  ["Digit3", WASMDOOM_KEYS.KEY_THREE],
  ["Digit4", WASMDOOM_KEYS.KEY_FOUR],
  ["Digit5", WASMDOOM_KEYS.KEY_FIVE],
  ["Digit6", WASMDOOM_KEYS.KEY_SIX],
  ["Digit7", WASMDOOM_KEYS.KEY_SEVEN],

  ["F1", WASMDOOM_KEYS.KEY_FN_ONE],
  ["F2", WASMDOOM_KEYS.KEY_FN_TWO],
  ["F3", WASMDOOM_KEYS.KEY_FN_THREE],
  ["F4", WASMDOOM_KEYS.KEY_FN_FOUR],
  ["F5", WASMDOOM_KEYS.KEY_FN_FIVE],
  ["F6", WASMDOOM_KEYS.KEY_FN_SIX],
  ["F7", WASMDOOM_KEYS.KEY_FN_SEVEN],
  ["F8", WASMDOOM_KEYS.KEY_FN_EIGHT],
  ["F9", WASMDOOM_KEYS.KEY_FN_NINE],
  ["F10", WASMDOOM_KEYS.KEY_FN_TEN],
  ["F11", WASMDOOM_KEYS.KEY_FN_ELEVEN],
  ["F12", WASMDOOM_KEYS.KEY_FN_TWELVE],
]);

const MOUSE_BUTTON_MAP = [
  WASMDOOM_MOUSE_BUTTONS.FIRE,
  WASMDOOM_MOUSE_BUTTONS.STRAFE,
  WASMDOOM_MOUSE_BUTTONS.USE,
];

async function main() {
  const canvas = document.getElementById("screen");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("missing #screen canvas element");
  }
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("failed to get 2d rendering context");
  }

  const wadResp = await fetch(pathJoin(BASE_URL, "wads/doom1.wad"));
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
  const audio = createDoomAudio(() => memory);
  const doomHost = {
    wasmdoom_error(messagePtr: number, length: number) {
      const bytes = new Uint8Array(memory.buffer, messagePtr, length);
      console.error(`[doom_host] error: ${new TextDecoder().decode(bytes)}`);
    },
    wasmdoom_draw() {
      assertWasmdoomInstance(instance);
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
    },
    ...audio.imports,
  };

  const { instance } = await WebAssembly.instantiateStreaming(
    fetch(pathJoin(BASE_URL, "wasmdoom.wasm")),
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
    instance.exports.wasmdoom_keydown(doomkey);
  });

  window.addEventListener("keyup", (event: KeyboardEvent) => {
    const doomkey = KEY_MAP.get(event.code);
    if (doomkey === undefined) {
      return;
    }
    event.preventDefault();
    instance.exports.wasmdoom_keyup(doomkey);
  });

  let mouseButtons = 0;
  let mouseDX = 0;
  let mouseDY = 0;

  const mobile = isMobileDevice(
    typeof navigator === "undefined" ? undefined : navigator,
  );

  canvas.addEventListener("click", () => {
    audio.start();
    if (!mobile) {
      canvas.requestPointerLock();
    }
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  if (mobile) {
    setupMobileControls(instance);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      audio.suspend();
    } else {
      audio.resume();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    mouseDX += e.movementX;
    mouseDY -= e.movementY;
  });
  document.addEventListener("mousedown", (e) => {
    if (document.pointerLockElement !== canvas) {
      return;
    }
    const bit = MOUSE_BUTTON_MAP[e.button];
    if (bit !== undefined) {
      mouseButtons |= bit;
    }
  });
  document.addEventListener("mouseup", (e) => {
    if (document.pointerLockElement !== canvas) {
      return;
    }
    const bit = MOUSE_BUTTON_MAP[e.button];
    if (bit !== undefined) {
      mouseButtons &= ~bit;
    }
  });

  const SCREEN_WIDTH = 320;
  const SCREEN_HEIGHT = 200;
  instance.exports.wasmdoom_init();

  const FRAME_MS = 1000 / 30;

  const renderFrame = () => {
    assertWasmdoomInstance(instance);
    instance.exports.wasmdoom_send_mouse(mouseButtons, mouseDX, mouseDY);
    mouseDX = 0;
    mouseDY = 0;
    instance.exports.wasmdoom_tick();
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
