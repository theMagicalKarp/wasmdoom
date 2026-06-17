// Optional input recorder. Captures the same keydown/keyup/mouse stream the
// engine consumes and emits it as a SimScript JSON object — the exact shape
// tools/lib/sim-commands.ts parses — so a browser play session can be replayed
// by the headless simulator.
//
// Off by default: createRecorder returns null unless the page is loaded with a
// `?record` query param. When active it installs window.__doomExport(), which
// downloads recording.json. Stamp model mirrors the simulator: a command at
// tick T is consumed by game tick T. We bump the tick counter *after* each
// wasmdoom_tick (endTick), so events captured before a frame's tick land on the
// tick that will actually consume them.

type RecordedCommand =
  | { tick: number; type: "keydown"; key: number }
  | { tick: number; type: "keyup"; key: number }
  | { tick: number; type: "mouse"; buttons: number; dx: number; dy: number };

export type Recorder = {
  // Record a key event (raw integer, may carry the 0x100 typechar sentinel).
  key(type: "keydown" | "keyup", code: number): void;
  // Record the per-frame mouse flush. Only emits when the button state changes
  // or there is non-zero motion (matches the simulator's persist-buttons,
  // reset-delta-each-tick model), keeping the script compact.
  mouse(buttons: number, dx: number, dy: number): void;
  // Advance the tick counter; call once per game tick, after wasmdoom_tick.
  endTick(): void;
};

export function createRecorder(opts: {
  flags: readonly string[];
}): Recorder | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (!new URLSearchParams(window.location.search).has("record")) {
    return null;
  }

  const flags = [...opts.flags];
  const commands: RecordedCommand[] = [];
  let completedTicks = 0;
  let lastButtons = 0;

  const recorder: Recorder = {
    key(type, code) {
      commands.push({ tick: completedTicks, type, key: code });
    },
    mouse(buttons, dx, dy) {
      if (buttons === lastButtons && dx === 0 && dy === 0) {
        return;
      }
      lastButtons = buttons;
      commands.push({ tick: completedTicks, type: "mouse", buttons, dx, dy });
    },
    endTick() {
      completedTicks++;
    },
  };

  const toScript = () => {
    const lastCmdTick = commands.length
      ? commands[commands.length - 1].tick
      : 0;
    const ticks = Math.max(completedTicks, lastCmdTick + 1, 1);
    return { ticks, flags, commands };
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(toScript(), null, 2) + "\n"], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "recording.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    console.log(
      `[recorder] exported ${commands.length} command(s) over ${toScript().ticks} ticks`,
    );
  };

  (window as unknown as { __doomExport?: () => void }).__doomExport = download;
  console.log(
    "[recorder] recording active — call window.__doomExport() to download recording.json",
  );

  return recorder;
}
