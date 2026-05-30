import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Override with WASMDOOM_WASM / WASMDOOM_MUSIC_WASM (absolute, or relative
// to this config file).
const wasmPath = resolve(
  __dirname,
  process.env.WASMDOOM_WASM ?? "../zig-out/bin/wasmdoom.wasm",
);
const musicWasmPath = resolve(
  __dirname,
  process.env.WASMDOOM_MUSIC_WASM ?? "../zig-out/bin/wasmdoom.music.wasm",
);

function serveWasmFile(urlPath: string, filePath: string): Plugin {
  const fileName = urlPath.replace(/^\//, "");
  return {
    name: `serve-${fileName}`,
    configureServer(server) {
      server.middlewares.use(urlPath, (_req, res, next) => {
        try {
          const stat = statSync(filePath);
          res.setHeader("Content-Type", "application/wasm");
          res.setHeader("Content-Length", stat.size);
          res.setHeader("Cache-Control", "no-store");
          createReadStream(filePath).pipe(res);
        } catch (err) {
          res.statusCode = 404;
          res.end(
            `${fileName} not found at ${filePath}. ` +
              `Run \`zig build\` from the repo root first.\n` +
              `(${(err as Error).message})`,
          );
          next();
        }
      });
    },
    generateBundle() {
      try {
        this.emitFile({
          type: "asset",
          fileName,
          source: readFileSync(filePath),
        });
      } catch (err) {
        this.error(
          `${fileName} not found at ${filePath}. ` +
            `Run \`zig build\` from the repo root first.\n` +
            `(${(err as Error).message})`,
        );
      }
    },
  };
}

export default defineConfig({
  // Served from "/" in dev; GitHub Pages deploys under a sub-path via BASE_PATH.
  base: process.env.BASE_PATH ?? "/",
  plugins: [
    serveWasmFile("/wasmdoom.wasm", wasmPath),
    serveWasmFile("/wasmdoom.music.wasm", musicWasmPath),
    // Workbox globs the finished dist/ in closeBundle, so the wasm emitted by
    // serveWasm() above and the WAD copied from public/ are both on disk in
    // time to be precached. SW is disabled in dev to keep the live-wasm
    // middleware (Cache-Control: no-store) working.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icons/apple-touch-icon-180.png", "icons/favicon.png"],
      manifest: {
        name: "wasmdoom",
        short_name: "DOOM",
        description: "Doom compiled to WebAssembly",
        display: "fullscreen",
        orientation: "landscape",
        background_color: "#000000",
        theme_color: "#000000",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,wasm,wad,png,svg,ico}"],
        // Need to support bigger wads.
        maximumFileSizeToCacheInBytes: 32 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: "0.0.0.0",
    fs: { allow: [".."] },
  },
});
