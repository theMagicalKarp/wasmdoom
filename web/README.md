# wasmdoom web frontend

Tiny Vite app that loads the freestanding `zig-out/bin/wasmdoom.wasm` (zero
imports — no WASI shim) in the browser, pushes the IWAD and command-line flags
straight into linear memory, and drives the engine via its exported tick/draw
functions. Engine logs surface as events and are written to the browser console.

## Run it

```sh
# from the repo root
zig build

# from this directory
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`); the game starts
automatically.

The wasm artifact is served live from `../zig-out/bin/wasmdoom.wasm` by a small
dev-server middleware in [vite.config.ts](vite.config.ts); rebuilding with
`zig build` and refreshing the page picks up the new binary.
