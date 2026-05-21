export type WasmdoomExports = {
  memory: WebAssembly.Memory;
  _start: () => unknown;
  wasmdoom_init: () => void;
  wasmdoom_tick: () => void;
  wasmdoom_keydown: (keycode: number) => void;
  wasmdoom_keyup: (keycode: number) => void;
  wasmdoom_send_mouse: (buttons: number, dx: number, dy: number) => void;
  wasmdoom_get_framebuffer: () => number;
  wasmdoom_get_palette: () => number;
};

export type WasmdoomInstance = WebAssembly.Instance & {
  exports: WasmdoomExports;
};

const REQUIRED_FUNCTIONS = [
  "wasmdoom_init",
  "wasmdoom_tick",
  "wasmdoom_keydown",
  "wasmdoom_keyup",
  "wasmdoom_send_mouse",
  "wasmdoom_get_framebuffer",
  "wasmdoom_get_palette",
] as const;

export function assertWasmdoomInstance(
  instance: WebAssembly.Instance,
): asserts instance is WasmdoomInstance {
  const { memory, _start } = instance.exports;
  if (!(memory instanceof WebAssembly.Memory)) {
    throw new Error("wasm module is missing a `memory` export");
  }
  if (typeof _start !== "function") {
    throw new Error("wasm module is missing a `_start` export");
  }

  for (const name of REQUIRED_FUNCTIONS) {
    if (typeof instance.exports[name] !== "function") {
      throw new Error(`wasm module is missing a \`${name}\` export`);
    }
  }
}
