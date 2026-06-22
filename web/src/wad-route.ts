// URL-driven configuration for the web demo: the path picks the IWAD
// (/wad/<slug>) and the query string supplies engine flags (?skill=4&warp=1).
// Both are pure functions of the URL so they stay testable without a DOM.
import { DEFAULT_WAD, wadForSlug } from "@wasmdoom/lib/wasmdoom-host.ts";

// Resolves the IWAD filename from location.pathname. `base` is
// import.meta.env.BASE_URL ("/" in dev, "/wasmdoom/" on Pages); it is stripped
// before matching `wad/<slug>`. Unknown slugs and non-/wad paths fall back to
// the default IWAD.
export function resolveWad(pathname: string, base: string): string {
  const trim = (s: string) => s.replace(/^\/+/, "");
  const rest = trim(pathname).slice(trim(base).length);
  const match = trim(rest).match(/^wad\/([^/]+)\/?$/);
  return (match && wadForSlug(match[1])) || DEFAULT_WAD;
}

function int(value: string | null, min: number, max: number): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

// Translates the query string into engine command-line flags using a curated
// allowlist (only params M_CheckParm honors in src/). Unknown params and
// out-of-range values are ignored. Flags are emitted in a fixed order so
// recordings made from the same URL are deterministic.
export function flagsFromQuery(params: URLSearchParams): string[] {
  const flags: string[] = [];

  const skill = int(params.get("skill"), 1, 5);
  if (skill !== null) {
    flags.push("-skill", String(skill));
  }

  // -warp takes one map number, or an episode+map pair. Accept either spelling
  // (warp=5 or warp=2,5) by pulling out up to two integer groups.
  const warp = params.get("warp");
  if (warp !== null) {
    const nums = warp.match(/\d+/g)?.slice(0, 2);
    if (nums && nums.length > 0) {
      flags.push("-warp", ...nums);
    }
  }

  const episode = int(params.get("episode"), 1, 9);
  if (episode !== null) {
    flags.push("-episode", String(episode));
  }

  const turbo = int(params.get("turbo"), 10, 400);
  if (turbo !== null) {
    flags.push("-turbo", String(turbo));
  }

  for (const flag of ["nomonsters", "respawn", "fast"]) {
    if (params.has(flag)) {
      flags.push(`-${flag}`);
    }
  }

  return flags;
}
