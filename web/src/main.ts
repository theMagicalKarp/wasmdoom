import {
  WASI,
  ConsoleStdout,
  OpenFile,
  File,
  PreopenDirectory,
} from "@bjorn3/browser_wasi_shim";
import { assertWasiInstance } from "./wasi-instance.ts";

async function main() {
  const wadResp = await fetch("/wads/doom1.wad");
  const wadBytes = new Uint8Array(await wadResp.arrayBuffer());

  const stdin = new OpenFile(new File([]));
  const stdout = ConsoleStdout.lineBuffered((line) => console.log(line));
  const stderr = ConsoleStdout.lineBuffered((line) => console.warn(line));

  const cwd = new PreopenDirectory(
    "/",
    new Map<string, File>([
      ["doom1.wad", new File(wadBytes, { readonly: false })],
    ]),
  );

  const env = ["HOME=/", "DOOMWADDIR=/"];
  const wasi = new WASI(["wasmdoom"], env, [stdin, stdout, stderr, cwd]);

  const { instance } = await WebAssembly.instantiateStreaming(
    fetch("/wasmdoom.wasm"),
    { wasi_snapshot_preview1: wasi.wasiImport },
  );

  assertWasiInstance(instance);
  wasi.start(instance);
}

main().catch((e) => {
  console.error(e);
});
