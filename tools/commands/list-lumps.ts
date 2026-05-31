import { readFile } from "node:fs/promises";
import type { Command } from "commander";

import { classifyLumps, parseWad } from "#lib/wad.ts";

type Format = "text" | "json";

interface Options {
  format: string;
}

interface LumpEntry {
  name: string;
  size: number;
  type: string;
}

interface Report {
  path: string;
  type: "IWAD" | "PWAD";
  numLumps: number;
  lumps: LumpEntry[];
  summary: {
    totalSize: number;
    typeCounts: Record<string, number>;
    hasGenmidi: boolean;
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildReport(path: string, buf: Uint8Array): Report {
  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  const type = magic as "IWAD" | "PWAD";

  const lumps = parseWad(buf);
  const types = classifyLumps(lumps);
  const entries: LumpEntry[] = lumps.map((lump, i) => ({
    name: lump.name,
    size: lump.data.length,
    type: types[i],
  }));

  let totalSize = 0;
  let hasGenmidi = false;
  const typeCounts: Record<string, number> = {};
  for (const entry of entries) {
    totalSize += entry.size;
    typeCounts[entry.type] = (typeCounts[entry.type] ?? 0) + 1;
    if (entry.name === "GENMIDI") {
      hasGenmidi = true;
    }
  }

  return {
    path,
    type,
    numLumps: entries.length,
    lumps: entries,
    summary: { totalSize, typeCounts, hasGenmidi },
  };
}

interface Column {
  header: string;
  align: "left" | "right";
  values: string[];
}

function printTable(cols: Column[]): void {
  const widths = cols.map((c) =>
    Math.max(c.header.length, ...c.values.map((v) => v.length)),
  );
  const pad = (value: string, width: number, align: "left" | "right") =>
    align === "right" ? value.padStart(width) : value.padEnd(width);

  const headerRow = cols
    .map((c, i) => pad(c.header, widths[i], c.align))
    .join("  ");
  const separatorRow = widths.map((w) => "-".repeat(w)).join("  ");
  console.log(`  ${headerRow}`);
  console.log(`  ${separatorRow}`);

  const rowCount = cols[0]?.values.length ?? 0;
  for (let r = 0; r < rowCount; r++) {
    const row = cols
      .map((c, i) => pad(c.values[r], widths[i], c.align))
      .join("  ");
    console.log(`  ${row}`);
  }
}

function printText(report: Report): void {
  console.log(`WAD:   ${report.path}`);
  console.log(`Type:  ${report.type}`);
  console.log(`Lumps: ${report.numLumps}`);
  console.log("");

  printTable([
    {
      header: "NAME",
      align: "left",
      values: report.lumps.map((l) => l.name || "(unnamed)"),
    },
    {
      header: "SIZE",
      align: "right",
      values: report.lumps.map((l) => l.size.toLocaleString("en-US")),
    },
    {
      header: "TYPE",
      align: "left",
      values: report.lumps.map((l) => l.type),
    },
  ]);

  console.log("");
  console.log("Summary:");
  console.log(`  total size:  ${formatBytes(report.summary.totalSize)}`);
  console.log(
    `  GENMIDI:     ${report.summary.hasGenmidi ? "present" : "missing"}`,
  );
  console.log("  by type:");
  const sorted = Object.entries(report.summary.typeCounts).sort(
    (a, b) => b[1] - a[1],
  );
  const typeW = Math.max(...sorted.map(([t]) => t.length));
  const countW = Math.max(
    ...sorted.map(([, n]) => n.toLocaleString("en-US").length),
  );
  for (const [t, n] of sorted) {
    console.log(
      `    ${t.padEnd(typeW)}  ${n.toLocaleString("en-US").padStart(countW)}`,
    );
  }
}

async function run(wadPath: string, opts: Options): Promise<void> {
  if (opts.format !== "text" && opts.format !== "json") {
    throw new Error(`--format must be "text" or "json" (got "${opts.format}")`);
  }
  const format = opts.format as Format;

  const buf = new Uint8Array(await readFile(wadPath));
  const report = buildReport(wadPath, buf);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printText(report);
  }
}

export function registerListLumps(program: Command): void {
  program
    .command("list-lumps")
    .description("Report the lump directory of a WAD file")
    .argument("<wad>", "path to the WAD file")
    .option("--format <fmt>", "output format: text or json", "text")
    .action(run);
}
