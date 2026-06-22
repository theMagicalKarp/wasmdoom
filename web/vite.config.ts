import { defineConfig, type Plugin } from "vite";
import {
  copyFileSync,
  createReadStream,
  readFileSync,
  statSync,
} from "node:fs";
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

// GitHub Pages has no SPA fallback: an unmatched path like /wasmdoom/wad/doom1
// is served its 404.html. Copy index.html to 404.html so those /wad/<slug>
// routes boot the app (asset URLs are absolute via `base`, so they resolve from
// any depth). The dev server already falls back to index.html, so build-only.
function spaFallback(): Plugin {
  return {
    name: "spa-404-fallback",
    apply: "build",
    writeBundle(opts) {
      const dir = opts.dir;
      if (dir) {
        copyFileSync(resolve(dir, "index.html"), resolve(dir, "404.html"));
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
    spaFallback(),
  ],
  server: {
    host: "0.0.0.0",
    fs: { allow: [".."] },
  },
});
