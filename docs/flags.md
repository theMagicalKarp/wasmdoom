# Command-Line Flags

The DOOM engine reads command-line-style flags out of `myargv[]` via
[`M_CheckParm`](../src/m_argv.c) — a simple case-insensitive linear scan that
returns the argv index where a flag appears (or `0` if missing). Flags that take
a value just look at `myargv[p + 1]` (and sometimes `myargv[p + 2]`) directly;
there is no separate "with args" helper.

In wasmdoom there is no real command line. The JS host writes NUL-separated argv
tokens into `wd_argv_buf` (terminated by a double-NUL), and
[`wd_build_argv`](../src/wasmdoom.c) points `myargv[]` at them before
`D_DoomMain` runs. So in practice "passing a flag" means having the host write
the right bytes into that buffer at startup. See
[src/wasmdoom.c](../src/wasmdoom.c) for the staging mechanism.

The id Software port supported dozens of flags; most have been stripped out of
wasmdoom along with the file/network/dev-tooling code paths they fed. What's
left is the table below.

## Summary

| Category          | Flag                          | Args             | Effect                                                           |
| ----------------- | ----------------------------- | ---------------- | ---------------------------------------------------------------- |
| Game mode         | [`-mode`](#-mode)             | 1 string         | Picks the IWAD/game variant (replaces id's IWAD auto-detection). |
| Gameplay modifier | [`-nomonsters`](#-nomonsters) | none             | Skip monster spawning at level setup.                            |
| Gameplay modifier | [`-respawn`](#-respawn)       | none             | Monsters respawn after being killed.                             |
| Gameplay modifier | [`-fast`](#-fast)             | none             | Faster projectiles and more aggressive monsters.                 |
| Gameplay modifier | [`-turbo`](#-turbo)           | 1 int (optional) | Scales player move speed, percent (default 200, clamped 10–400). |
| Level / skill     | [`-skill`](#-skill)           | 1 digit `1`–`5`  | Sets starting skill and forces autostart.                        |
| Level / skill     | [`-episode`](#-episode)       | 1 digit          | Sets starting episode and forces autostart.                      |
| Level / skill     | [`-warp`](#-warp)             | 1 or 2 ints      | Jumps directly to a map and forces autostart.                    |

## Game mode

### `-mode`

`-mode <shareware|registered|commercial|retail>` — sets the `gamemode` global,
which gates which episodes/maps/menus/text strings are available.

In the original DOOM, `IdentifyVersion` sniffed the loaded IWAD to figure this
out. wasmdoom strips all of that out — the file-system probing, the
`$DOOMWADDIR` env var, the `-shdev`/`-regdev`/`-comdev` developer aliases, the
French-edition special case, the Freedoom fallback chain — so `-mode` is now the
**only** way the engine learns what kind of WAD the host has loaded. If you
don't pass it, `gamemode` stays `indetermined` and the engine prints
`"Game mode indeterminate."`.

Used at [`d_main.c:503`](../src/d_main.c).

## Gameplay modifiers

### `-nomonsters`

No argument. Sets the `nomonsters` global, which causes `P_SpawnMapThing` and
friends to skip monster spawns at level setup. Used at
[`d_main.c:630`](../src/d_main.c).

### `-respawn`

No argument. Sets `respawnparm` — once a monster is killed it gets queued for
respawn (the Nightmare-skill behavior, available at any skill). Used at
[`d_main.c:631`](../src/d_main.c).

### `-fast`

No argument. Sets `fastparm` — increases projectile speeds and shortens monster
state timing (also the Nightmare default, but here forced on at any skill). Used
at [`d_main.c:632`](../src/d_main.c).

### `-turbo`

`-turbo [percent]` — scales the player's `forwardmove[]` and `sidemove[]` tables
by the given percentage. The argument is optional: if omitted, the default is
**200%**. The value is clamped to `[10, 400]`. The engine prints
`"turbo scale: N%"` on startup.

Used at [`d_main.c:691`](../src/d_main.c).

## Level / skill selection

These three flags all force `autostart = true`, which makes `D_DoomMain` boot
straight into a game instead of stopping at the title screen.

### `-skill`

`-skill <1-5>` — sets the starting skill level. **Watch the off-by-one:** the
parser does `startskill = myargv[p+1][0] - '1'`, so `1` maps to `sk_baby` (0),
`2` → `sk_easy`, …, `5` → `sk_nightmare`. Only the first character is read, so
`"42"` is parsed as `4 - 1 = 3` (`sk_hard`).

Used at [`d_main.c:715`](../src/d_main.c).

### `-episode`

`-episode <digit>` — sets the starting episode. The parser does
`startepisode = myargv[p+1][0] - '0'`, so this is **not** off-by-one (digit `1`
→ episode 1). Only the first character is read. Also resets `startmap` to 1.

Used at [`d_main.c:721`](../src/d_main.c).

### `-warp`

`-warp <map>` (commercial) or `-warp <episode> <map>` (other modes) — jumps
directly to a level. The two forms are picked based on `gamemode`:

- **Commercial (Doom 2):** one argument, parsed with `atoi`, so multi-digit maps
  like `31` work.
- **Shareware / registered / retail:** two arguments, both read as single digits
  via `myargv[p+N][0] - '0'`. `-warp 2 5` boots into E2M5.

If `-warp` is used in non-commercial mode without a second argument, the parser
reads past `myargv[p+1]` — `-warp 3` would dereference whatever follows it in
argv (UB-ish; just pass both digits).

Used at [`d_main.c:728`](../src/d_main.c).
