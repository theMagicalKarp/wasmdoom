export type WasiInstance = {
  exports: {
    memory: WebAssembly.Memory;
    _start: () => unknown;
  };
};

export function assertWasiInstance(
  instance: WebAssembly.Instance,
): asserts instance is WebAssembly.Instance & WasiInstance {
  const { memory, _start } = instance.exports;
  if (!(memory instanceof WebAssembly.Memory)) {
    throw new Error("wasm module is missing a `memory` export");
  }
  if (typeof _start !== "function") {
    throw new Error("wasm module is missing a `_start` export");
  }
}
