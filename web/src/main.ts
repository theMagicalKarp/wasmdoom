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
import { Vector2 } from "./math.ts";

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

  bindButton(fireBtn, WASMDOOM_KEYS.FIRE);
  bindButton(useBtn, WASMDOOM_KEYS.USE);
  bindButton(useBtn, WASMDOOM_KEYS.MENU_CONFIRM);

  const leftJoystick = nipplejs.create({
    zone: leftZone,
    mode: "static",
    position: { left: "50%", top: "50%" },
    color: "white",
    size: 150,
    restJoystick: true,
    shape: "square",
  });

  const rightJoystick = nipplejs.create({
    zone: rightZone,
    mode: "static",
    position: { left: "50%", top: "50%" },
    color: "white",
    size: 150,
    restJoystick: true,
    shape: "square",
  });

  const active = {
    strafeRight: false,
    strafeLeft: false,
  };
  const THRESHOLD = 0.3;
  const TURN_SENSITIVITY = 200;
  const TURN_DEADZONE = 0.15;
  const MOVE_SENSITIVITY = 100;
  const MOVE_DEADZONE = 0.15;
  let joystick = new Vector2(0.0, 0.0);

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
    joystick = joystick.setY(y);
    setKey("strafeLeft", WASMDOOM_KEYS.STRAFE_LEFT, x < -THRESHOLD);
    setKey("strafeRight", WASMDOOM_KEYS.STRAFE_RIGHT, x > THRESHOLD);
  });

  leftJoystick.on("end", () => {
    joystick = joystick.setY(0);
    setKey("strafeLeft", WASMDOOM_KEYS.STRAFE_LEFT, false);
    setKey("strafeRight", WASMDOOM_KEYS.STRAFE_RIGHT, false);
  });

  rightJoystick.on("move", (evt) => {
    const data = evt.data;
    if (!data || !data.vector) return;
    joystick = joystick.setX(data.vector.x);
  });

  rightJoystick.on("end", () => {
    joystick = joystick.setX(0);
  });

  return {
    fetchJoystick(): Vector2 {
      let x = 0;
      let y = 0;

      if (Math.abs(joystick.x) >= TURN_DEADZONE) {
        x = Math.round(
          Math.sign(joystick.x) * joystick.x * joystick.x * TURN_SENSITIVITY,
        );
      }
      if (Math.abs(joystick.y) >= MOVE_DEADZONE) {
        y = Math.round(joystick.y * MOVE_SENSITIVITY);
      }

      return new Vector2(x, y);
    },
  };
}

const { BASE_URL } = import.meta.env;

const KEY_MAP = new Map([
  ["KeyW", WASMDOOM_KEYS.MOVE_FORWARD],
  ["KeyS", WASMDOOM_KEYS.MOVE_BACKWARD],
  ["KeyA", WASMDOOM_KEYS.STRAFE_LEFT],
  ["KeyD", WASMDOOM_KEYS.STRAFE_RIGHT],
  ["ArrowUp", WASMDOOM_KEYS.UP],
  ["ArrowDown", WASMDOOM_KEYS.DOWN],
  ["ArrowLeft", WASMDOOM_KEYS.LEFT],
  ["ArrowRight", WASMDOOM_KEYS.RIGHT],

  ["Enter", WASMDOOM_KEYS.MENU_CONFIRM],
  ["Space", WASMDOOM_KEYS.FIRE],
  ["ShiftLeft", WASMDOOM_KEYS.RUN],
  ["KeyE", WASMDOOM_KEYS.USE],
  ["Comma", WASMDOOM_KEYS.STRAFE_LEFT],
  ["Period", WASMDOOM_KEYS.STRAFE_RIGHT],
  ["Backspace", WASMDOOM_KEYS.MENU_BACK],
  ["KeyQ", WASMDOOM_KEYS.MENU_OPEN],
  ["Tab", WASMDOOM_KEYS.AUTOMAP_TOGGLE],
  ["Minus", WASMDOOM_KEYS.VIEW_SIZE_DOWN],
  ["Equal", WASMDOOM_KEYS.VIEW_SIZE_UP],

  ["KeyF", WASMDOOM_KEYS.AUTOMAP_FOLLOW],
  ["KeyG", WASMDOOM_KEYS.AUTOMAP_GRID],
  ["KeyM", WASMDOOM_KEYS.AUTOMAP_MARK],
  ["KeyC", WASMDOOM_KEYS.AUTOMAP_CLEARMARK],
  ["Digit0", WASMDOOM_KEYS.AUTOMAP_GOBIG],

  ["Digit1", WASMDOOM_KEYS.WEAPON_1],
  ["Digit2", WASMDOOM_KEYS.WEAPON_2],
  ["Digit3", WASMDOOM_KEYS.WEAPON_3],
  ["Digit4", WASMDOOM_KEYS.WEAPON_4],
  ["Digit5", WASMDOOM_KEYS.WEAPON_5],
  ["Digit6", WASMDOOM_KEYS.WEAPON_6],
  ["Digit7", WASMDOOM_KEYS.WEAPON_7],

  ["F1", WASMDOOM_KEYS.HELP],
  ["F2", WASMDOOM_KEYS.SAVE],
  ["F3", WASMDOOM_KEYS.LOAD],
  ["F4", WASMDOOM_KEYS.SOUND_VOLUME],
  ["F5", WASMDOOM_KEYS.DETAIL],
  ["F6", WASMDOOM_KEYS.QUICKSAVE],
  ["F7", WASMDOOM_KEYS.END_GAME],
  ["F8", WASMDOOM_KEYS.MESSAGES],
  ["F9", WASMDOOM_KEYS.QUICKLOAD],
  ["F10", WASMDOOM_KEYS.QUIT],
  ["F11", WASMDOOM_KEYS.GAMMA],
  ["F12", WASMDOOM_KEYS.SPY],
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
      ["doom1.wad", new File(wadBytes, { readonly: true })],
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
  let mouse = new Vector2(0.0, 0.0);

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

  const mobileControls = mobile ? setupMobileControls(instance) : undefined;

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      audio.suspend();
    } else {
      audio.resume();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) {
      return;
    }

    mouse = mouse.add(new Vector2(e.movementX, 0.0));
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
    if (mobileControls) {
      mouse = mouse.add(mobileControls.fetchJoystick());
    }
    instance.exports.wasmdoom_send_mouse(mouseButtons, mouse.x, mouse.y);
    mouse = Vector2.zero();
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
