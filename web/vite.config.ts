import { defineConfig, type Plugin } from "vite";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Override with WASMDOOM_WASM (absolute, or relative to this config file).
const wasmPath = resolve(
  __dirname,
  process.env.WASMDOOM_WASM ?? "../zig-out/bin/wasmdoom.wasm",
);

function serveWasm(): Plugin {
  return {
    name: "serve-wasmdoom-wasm",
    configureServer(server) {
      server.middlewares.use("/wasmdoom.wasm", (_req, res, next) => {
        try {
          const stat = statSync(wasmPath);
          res.setHeader("Content-Type", "application/wasm");
          res.setHeader("Content-Length", stat.size);
          res.setHeader("Cache-Control", "no-store");
          createReadStream(wasmPath).pipe(res);
        } catch (err) {
          res.statusCode = 404;
          res.end(
            `wasmdoom.wasm not found at ${wasmPath}. ` +
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
          fileName: "wasmdoom.wasm",
          source: readFileSync(wasmPath),
        });
      } catch (err) {
        this.error(
          `wasmdoom.wasm not found at ${wasmPath}. ` +
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
  plugins: [serveWasm()],
  server: {
    host: "0.0.0.0",
    fs: { allow: [".."] },
  },
});
