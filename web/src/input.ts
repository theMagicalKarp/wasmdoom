// All input wiring for Doom: keyboard, mouse with pointer-lock, and the
// nipplejs-based mobile controls. Owns the first-canvas-click handler
// because that single click both starts audio (browsers require a user
// gesture) and acquires pointer-lock on desktop — splitting them would
// fragment the gesture across modules.
//
// The only thing main.ts has to do per frame is call flushFrame(), which
// drains accumulated mouse delta + button state into wasmdoom_send_mouse.

import nipplejs from "nipplejs";
import type { DoomAudio } from "./doom-audio.ts";
import type { WasmdoomExports } from "./doom-runtime.ts";
import { isMobileDevice } from "./utils.ts";
import { Vector2 } from "./math.ts";

// Sentinel bit on wasmdoom_keydown's argument: when set, the low byte is
// delivered as a typed ASCII character (ev_typechar) rather than a game key
// (ev_keydown). Mirrors WASMDOOM_TYPECHAR_FLAG in src/wasmdoom.h.
const WASMDOOM_TYPECHAR_FLAG = 0x100;

// Key codes Doom's C side recognises. These mirror the values produced by
// the wasm module's input layer; treat them as a wire protocol.
const WASMDOOM_KEYS = {
  // Movement / view
  RIGHT: 0xae,
  LEFT: 0xac,
  UP: 0xad,
  DOWN: 0xaf,

  MOVE_FORWARD: 0xad,
  MOVE_BACKWARD: 0xaf,
  TURN_LEFT: 0xac,
  TURN_RIGHT: 0xae,
  STRAFE_LEFT: 0x2c,
  STRAFE_RIGHT: 0x2e,
  STRAFE_ON: 0x80 + 0x38,

  // Combat / interaction
  FIRE: 0x80 + 0x1d,
  USE: 0x20,
  RUN: 0x80 + 0x36,

  // Weapon select
  WEAPON_1: 0x31, // fist / chainsaw
  WEAPON_2: 0x32, // pistol
  WEAPON_3: 0x33, // shotgun
  WEAPON_4: 0x34, // chaingun
  WEAPON_5: 0x35, // rocket launcher
  WEAPON_6: 0x36, // plasma rifle
  WEAPON_7: 0x37, // BFG 9000

  // Menu / system
  MENU_OPEN: 0x1b,
  MENU_CONFIRM: 0xd,
  MENU_BACK: 0x7f,
  PAUSE: 0xff,
  VIEW_SIZE_UP: 0x3d,
  VIEW_SIZE_DOWN: 0x2d,

  // Automap
  AUTOMAP_TOGGLE: 0x9,
  AUTOMAP_FOLLOW: 0x66,
  AUTOMAP_GRID: 0x67,
  AUTOMAP_MARK: 0x6d,
  AUTOMAP_CLEARMARK: 0x63,
  AUTOMAP_GOBIG: 0x30,

  // Function-key features (F1-F12)
  HELP: 0x80 + 0x3b, // F1
  SAVE: 0x80 + 0x3c, // F2
  LOAD: 0x80 + 0x3d, // F3
  SOUND_VOLUME: 0x80 + 0x3e, // F4
  DETAIL: 0x80 + 0x3f, // F5
  QUICKSAVE: 0x80 + 0x40, // F6
  END_GAME: 0x80 + 0x41, // F7
  MESSAGES: 0x80 + 0x42, // F8
  QUICKLOAD: 0x80 + 0x43, // F9
  QUIT: 0x80 + 0x44, // F10
  GAMMA: 0x80 + 0x57, // F11
  SPY: 0x80 + 0x58, // F12
} as const;

const WASMDOOM_MOUSE_BUTTONS = {
  FIRE: 1 << 0,
  STRAFE: 1 << 1,
  USE: 1 << 2,
} as const;

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

export type Input = {
  // Drain accumulated mouse delta and button state into the wasm module.
  // Call once per frame. Resets the per-frame delta to zero.
  flushFrame(): void;
};

export function createInput(opts: {
  canvas: HTMLCanvasElement;
  doom: WasmdoomExports;
  audio: DoomAudio;
}): Input {
  const { canvas, doom, audio } = opts;
  const mobile = isMobileDevice(
    typeof navigator === "undefined" ? undefined : navigator,
  );

  let mouseButtons = 0;
  let mouse = Vector2.zero();

  window.addEventListener("keydown", (event) => {
    let consumed = false;
    const doomkey = KEY_MAP.get(event.code);
    if (doomkey !== undefined) {
      doom.wasmdoom_keydown(doomkey);
      consumed = true;
    }
    if (event.key.length === 1) {
      const code = event.key.charCodeAt(0);
      if (code >= 32 && code <= 126) {
        doom.wasmdoom_keydown(WASMDOOM_TYPECHAR_FLAG | code);
        consumed = true;
      }
    }
    if (consumed) {
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    const doomkey = KEY_MAP.get(event.code);
    if (doomkey === undefined) {
      return;
    }
    event.preventDefault();
    doom.wasmdoom_keyup(doomkey);
  });

  canvas.addEventListener("click", () => {
    audio.start();
    if (!mobile) {
      canvas.requestPointerLock();
    }
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) {
      return;
    }
    mouse = mouse.add(new Vector2(e.movementX, 0));
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

  const mobileControls = mobile ? attachMobileControls(doom) : null;

  return {
    flushFrame() {
      if (mobileControls) {
        mouse = mouse.add(mobileControls.fetchJoystick());
      }
      doom.wasmdoom_send_mouse(mouseButtons, mouse.x, mouse.y);
      mouse = Vector2.zero();
    },
  };
}

type MobileControls = {
  fetchJoystick(): Vector2;
};

const TURN_THRESHOLD = 0.3;
const TURN_SENSITIVITY = 200;
const TURN_DEADZONE = 0.15;
const MOVE_SENSITIVITY = 100;
const MOVE_DEADZONE = 0.15;

function attachMobileControls(doom: WasmdoomExports): MobileControls | null {
  const container = document.getElementById("mobile-controls");
  const leftZone = document.getElementById("joystick-left-zone");
  const rightZone = document.getElementById("joystick-right-zone");
  const fireBtn = document.getElementById("fire-btn");
  const useBtn = document.getElementById("use-btn");
  if (!container || !leftZone || !rightZone || !fireBtn || !useBtn) {
    return null;
  }

  container.classList.add("visible");

  bindButton(fireBtn, doom, WASMDOOM_KEYS.FIRE);
  bindButton(useBtn, doom, WASMDOOM_KEYS.USE);
  bindButton(useBtn, doom, WASMDOOM_KEYS.MENU_CONFIRM);

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

  const strafe = { left: false, right: false };
  let joystick = Vector2.zero();

  const setStrafe = (side: "left" | "right", key: number, want: boolean) => {
    if (strafe[side] === want) return;
    strafe[side] = want;
    if (want) {
      doom.wasmdoom_keydown(key);
    } else {
      doom.wasmdoom_keyup(key);
    }
  };

  leftJoystick.on("move", (evt) => {
    const data = evt.data;
    if (!data || !data.vector) return;
    const { x, y } = data.vector;
    joystick = joystick.setY(y);
    setStrafe("left", WASMDOOM_KEYS.STRAFE_LEFT, x < -TURN_THRESHOLD);
    setStrafe("right", WASMDOOM_KEYS.STRAFE_RIGHT, x > TURN_THRESHOLD);
  });

  leftJoystick.on("end", () => {
    joystick = joystick.setY(0);
    setStrafe("left", WASMDOOM_KEYS.STRAFE_LEFT, false);
    setStrafe("right", WASMDOOM_KEYS.STRAFE_RIGHT, false);
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

function bindButton(btn: HTMLElement, doom: WasmdoomExports, key: number) {
  const press = (e: Event) => {
    e.preventDefault();
    btn.classList.add("pressed");
    doom.wasmdoom_keydown(key);
  };
  const release = (e: Event) => {
    e.preventDefault();
    btn.classList.remove("pressed");
    doom.wasmdoom_keyup(key);
  };
  btn.addEventListener("touchstart", press, { passive: false });
  btn.addEventListener("touchend", release, { passive: false });
  btn.addEventListener("touchcancel", release, { passive: false });
  btn.addEventListener("mousedown", press);
  btn.addEventListener("mouseup", release);
  btn.addEventListener("mouseleave", release);
}
