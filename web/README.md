# wasmdoom web frontend

Tiny Vite app that loads `zig-out/bin/wasmdoom.wasm` in the browser via a WASI
polyfill ([`@bjorn3/browser_wasi_shim`](https://github.com/bjorn3/browser_wasi_shim)),
runs it in a Web Worker, and shows stdout/stderr on the page.

## Run it

```sh
# from the repo root
zig build

# from this directory
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`) and click **Run**.

The wasm artifact is served live from `../zig-out/bin/wasmdoom.wasm` by a small
dev-server middleware in [vite.config.ts](vite.config.ts); rebuilding with
`zig build` and refreshing the page picks up the new binary.
