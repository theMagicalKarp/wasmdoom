#!/usr/bin/env node
import { Command } from "commander";

import { registerRenderMusic } from "./commands/render-music.ts";

const program = new Command();
program
  .name("wasmdoom-tools")
  .description("Developer tools for wasmdoom")
  .version("0.0.0");

registerRenderMusic(program);

try {
  await program.parseAsync();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
