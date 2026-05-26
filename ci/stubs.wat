;; No-op host stubs so `wasmtime run` can instantiate the wasm in CI.
;; Merged into wasmdoom.wasm with Binaryen's wasm-merge; see .github/workflows/ci.yml.
(module
  (func (export "wasmdoom_error") (param i32 i32))
  (func (export "wasmdoom_draw"))
  (func (export "wasmdoom_sound_start") (param i32 i32 i32 i32 i32 i32 i32))
  (func (export "wasmdoom_sound_stop") (param i32))
  (func (export "wasmdoom_sound_update") (param i32 i32 i32 i32))
  (func (export "wasmdoom_sound_is_playing") (param i32) (result i32)
    (i32.const 0))
)
