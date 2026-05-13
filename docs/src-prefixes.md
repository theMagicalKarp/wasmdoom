# DOOM `src/` File Prefixes

The original id Software DOOM source uses two-letter (occasionally longer) prefixes to group files by subsystem. Each subsystem typically has a `_local.h` (private API), a public header, and one or more `.c` implementation files. This naming convention is consistent and very useful for navigating the codebase.

| Prefix      | Subsystem                | What it does                                                                                                                                     |
| ----------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `am_`       | **A**uto**m**ap          | The in-game map overlay (toggled with Tab). See [am_map.c](../src/am_map.c).                                                                        |
| `d_`        | **D**OOM (top-level)     | Game-wide types, the main loop, network packet layer, and event/ticcmd plumbing. See [d_main.c](../src/d_main.c), [d_net.c](../src/d_net.c).           |
| `doom*`     | **DOOM** definitions     | Shared constants, enums, fixed-point types, and global game state. [doomdef.h](../src/doomdef.h), [doomdata.h](../src/doomdata.h), [doomstat.h](../src/doomstat.h), [doomtype.h](../src/doomtype.h). |
| `dstrings`  | **D**OOM **strings**     | Localized/printable strings (level names, menu text, obituaries). [dstrings.c](../src/dstrings.c).                                                  |
| `f_`        | **F**inale / screen Fx   | End-of-episode story screens (`f_finale`) and the melt-style screen wipe transition (`f_wipe`). [f_finale.c](../src/f_finale.c), [f_wipe.c](../src/f_wipe.c). |
| `g_`        | **G**ame                 | Top-level game flow: starting/loading/saving games, demo recording/playback, applying ticcmds. See [g_game.c](../src/g_game.c).                     |
| `hu_`       | **H**eads-**U**p display | The on-screen messages and chat overlay (NOT the status bar). [hu_stuff.c](../src/hu_stuff.c), [hu_lib.c](../src/hu_lib.c).                            |
| `i_`        | **I**nterface (platform) | Platform/OS-specific code: video, sound, input, timing, network sockets, main(). Replacing these is what porting DOOM means. [i_main.c](../src/i_main.c), [i_video.c](../src/i_video.c), [i_sound.c](../src/i_sound.c), [i_system.c](../src/i_system.c), [i_net.c](../src/i_net.c). |
| `info`      | Thing/state tables       | The giant data tables describing every actor type (`mobjinfo_t`) and every animation frame (`state_t`). [info.c](../src/info.c), [info.h](../src/info.h). |
| `m_`        | **M**iscellaneous / **M**enu | Mixed utility bag: the main menu (`m_menu`), command-line args (`m_argv`), cheat codes (`m_cheat`), fixed-point math (`m_fixed`), RNG (`m_random`), bbox helpers (`m_bbox`), byte-swap (`m_swap`), misc file I/O and config (`m_misc`). |
| `p_`        | **P**lay (sim)           | The game simulation: thinkers, monster AI (`p_enemy`), player movement (`p_user`), collision/movement (`p_map`, `p_maputl`), line specials & doors/floors/lights, save games (`p_saveg`), level setup (`p_setup`), tic loop (`p_tick`). The largest subsystem. |
| `r_`        | **R**enderer             | The software 3D renderer: BSP traversal (`r_bsp`), wall segments (`r_segs`), flats (`r_plane`), sprites (`r_things`), column/span drawers (`r_draw`), texture/lump loading (`r_data`), sky (`r_sky`), and the main pipeline (`r_main`). |
| `s_`        | **S**ound (engine)       | High-level sound manager: starting/stopping SFX, music playback, 3D positional volume/pan. Sits above the platform `i_sound`. [s_sound.c](../src/s_sound.c). |
| `sounds`    | **Sound** definitions    | The data table of sound effects and music tracks (`sfxinfo_t`, `musicinfo_t`). [sounds.c](../src/sounds.c).                                         |
| `st_`       | **St**atus bar           | The bottom HUD with face, health, ammo, keys, armor. [st_stuff.c](../src/st_stuff.c), [st_lib.c](../src/st_lib.c).                                     |
| `tables`    | Math **tables**          | Precomputed sine/cosine/tangent and angle lookup tables used by the renderer and play sim. [tables.c](../src/tables.c).                             |
| `v_`        | **V**ideo (framebuffer)  | Software framebuffer drawing primitives: patches, blits, palette ops. Sits above the platform `i_video`. [v_video.c](../src/v_video.c).             |
| `w_`        | **W**AD                  | WAD file loader and lump cache ("Where's All the Data"). [w_wad.c](../src/w_wad.c).                                                                 |
| `wi_`       | **W**rap-up / **I**ntermission | The between-level stats screen ("kills/items/secrets", par time, next level). [wi_stuff.c](../src/wi_stuff.c).                                |
| `z_`        | **Z**one allocator       | DOOM's custom memory allocator with PU_STATIC / PU_CACHE purgeable tags. Everything dynamic is allocated through this. [z_zone.c](../src/z_zone.c). |

## Suffix conventions

- `*_local.h` — Subsystem-internal header. Included only by the `.c` files inside that subsystem (e.g. [p_local.h](../src/p_local.h), [r_local.h](../src/r_local.h)).
- `*_defs.h` / `*_state.h` — Shared type and global-state declarations for a subsystem (e.g. [r_defs.h](../src/r_defs.h), [r_state.h](../src/r_state.h)).
- Files without an underscore prefix (`info`, `sounds`, `tables`, `doomdef`, `doomstat`, `doomdata`, `doomtype`, `dstrings`) are usually pure data tables or game-wide definitions rather than a subsystem with behavior.

## Quick mental model

```
   i_*       <- platform layer (swap for each port)
    |
   v_*  s_*  i_net   <- portable wrappers
    |    |     |
   r_*  hu_*  st_*  wi_*  f_*  am_*  m_menu  <- presentation
    |
   p_*       <- game simulation (thinkers, AI, physics)
    |
   g_*       <- game flow (start/save/load, demos)
    |
   d_main    <- main loop, ties it all together
    |
   w_*  z_*  m_* tables info sounds dstrings  <- foundations (data, memory, utils)
```
