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
import type { Recorder } from "./recorder.ts";
import { isMobileDevice } from "./utils.ts";
import { Vector2 } from "./math.ts";
// Key codes, the typechar sentinel, and mouse-button bits are the wire protocol
// shared with the headless tools/simulator — sourced from @wasmdoom/lib so the
// browser and the simulator can never drift. (WASMDOOM_TYPECHAR_FLAG also mirrors
// the C side in src/wasmdoom.h.)
import {
  WASMDOOM_KEYS,
  WASMDOOM_MOUSE_BUTTONS,
  WASMDOOM_TYPECHAR_FLAG,
} from "@wasmdoom/lib/wasmdoom-keys.ts";

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
  recorder?: Recorder | null;
}): Input {
  const { canvas, doom, audio, recorder } = opts;
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
      recorder?.key("keydown", doomkey);
      consumed = true;
    }
    if (event.key.length === 1) {
      const code = event.key.charCodeAt(0);
      if (code >= 32 && code <= 126) {
        doom.wasmdoom_keydown(WASMDOOM_TYPECHAR_FLAG | code);
        recorder?.key("keydown", WASMDOOM_TYPECHAR_FLAG | code);
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
    recorder?.key("keyup", doomkey);
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
      recorder?.mouse(mouseButtons, mouse.x, mouse.y);
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

  let leftStart: Vector2 | null = null;
  leftJoystick.on("move", (evt) => {
    const data = evt.data;
    if (!data || !data.vector) {
      return;
    }

    const current = Vector2.from(data.vector);
    if (leftStart === null) {
      leftStart = current;
    }
    const distance = current.sub(leftStart);

    joystick = joystick.setY(distance.y);
    setStrafe("left", WASMDOOM_KEYS.STRAFE_LEFT, distance.x < -TURN_THRESHOLD);
    setStrafe("right", WASMDOOM_KEYS.STRAFE_RIGHT, distance.x > TURN_THRESHOLD);
  });

  leftJoystick.on("end", () => {
    joystick = joystick.setY(0);
    setStrafe("left", WASMDOOM_KEYS.STRAFE_LEFT, false);
    setStrafe("right", WASMDOOM_KEYS.STRAFE_RIGHT, false);
    leftStart = null;
  });

  let rightStart: Vector2 | null = null;
  rightJoystick.on("move", (evt) => {
    const data = evt.data;
    if (!data || !data.vector) {
      return;
    }

    const current = Vector2.from(data.vector);

    if (rightStart === null) {
      rightStart = current;
    }

    joystick = joystick.setX(current.sub(rightStart).x);
  });

  rightJoystick.on("end", () => {
    joystick = joystick.setX(0);
    rightStart = null;
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
