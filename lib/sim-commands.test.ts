import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSimScript } from "./sim-commands.ts";

test("parses a valid script", () => {
  const script = parseSimScript({
    ticks: 100,
    commands: [
      { tick: 0, type: "keydown", key: "FIRE" },
      { tick: 5, type: "keyup", key: "fire" },
      { tick: 10, type: "mouse", buttons: 1, dx: 4 },
      { tick: 20, type: "snapshot", name: "title" },
      { tick: 30, type: "wait" },
    ],
  });
  assert.equal(script.ticks, 100);
  assert.equal(script.commands.length, 5);
  assert.equal(script.commands[0].type, "keydown");
  assert.equal((script.commands[2] as { dy: number }).dy, 0);
});

test("accepts numeric key values", () => {
  const script = parseSimScript({
    ticks: 10,
    commands: [{ tick: 0, type: "keydown", key: 0x20 }],
  });
  assert.equal((script.commands[0] as { key: number }).key, 0x20);
});

test("accepts numeric keys carrying the typechar sentinel", () => {
  const script = parseSimScript({
    ticks: 10,
    commands: [{ tick: 0, type: "keydown", key: 0x100 | 0x61 }],
  });
  assert.equal((script.commands[0] as { key: number }).key, 0x161);
});

test("parses optional startup flags", () => {
  const script = parseSimScript({
    ticks: 10,
    flags: ["-warp", "1", "1", "-skill", "4"],
    commands: [],
  });
  assert.deepEqual(script.flags, ["-warp", "1", "1", "-skill", "4"]);
});

test("rejects non-string flags", () => {
  assert.throws(
    () => parseSimScript({ ticks: 10, flags: ["-warp", 1], commands: [] }),
    /flags must be an array of strings/,
  );
});

test("parses set player and map_object commands", () => {
  const script = parseSimScript({
    ticks: 100,
    commands: [
      {
        tick: 5,
        type: "set",
        target: "player",
        patch: { health: 200, ammo: [50, 0, 0, 0] },
      },
      {
        tick: 6,
        type: "set",
        target: "map_object",
        index: 3,
        patch: { health: 1 },
      },
    ],
  });
  const setPlayer = script.commands[0] as {
    target: string;
    patch: Record<string, unknown>;
  };
  assert.equal(setPlayer.target, "player");
  assert.equal(setPlayer.patch.health, 200);
  assert.deepEqual(setPlayer.patch.ammo, [50, 0, 0, 0]);
  const setMapObject = script.commands[1] as { index: number };
  assert.equal(setMapObject.index, 3);
});

test("parses assert with default and explicit tol", () => {
  const script = parseSimScript({
    ticks: 100,
    commands: [
      { tick: 5, type: "assert", target: "player", expect: { health: 100 } },
      {
        tick: 6,
        type: "assert",
        target: "player",
        expect: { x: 1024 },
        tol: 1.5,
      },
    ],
  });
  assert.equal((script.commands[0] as { tol: number }).tol, 0);
  assert.equal((script.commands[1] as { tol: number }).tol, 1.5);
});

test("rejects unknown state target", () => {
  assert.throws(
    () =>
      parseSimScript({
        ticks: 10,
        commands: [
          { tick: 0, type: "set", target: "enemy", patch: { health: 1 } },
        ],
      }),
    /must be "player", "map_object", or "settings"/,
  );
});

test("rejects unknown state fields", () => {
  assert.throws(
    () =>
      parseSimScript({
        ticks: 10,
        commands: [
          { tick: 0, type: "set", target: "player", patch: { hp: 1 } },
        ],
      }),
    /unknown player field/,
  );
});

test("rejects map_object set/assert without an index", () => {
  assert.throws(
    () =>
      parseSimScript({
        ticks: 10,
        commands: [
          { tick: 0, type: "set", target: "map_object", patch: { health: 1 } },
        ],
      }),
    /index must be an integer/,
  );
});

test("rejects array fields of the wrong length", () => {
  assert.throws(
    () =>
      parseSimScript({
        ticks: 10,
        commands: [
          { tick: 0, type: "set", target: "player", patch: { ammo: [1, 2] } },
        ],
      }),
    /must be an array of 4 numbers/,
  );
});

test("rejects negative tol", () => {
  assert.throws(
    () =>
      parseSimScript({
        ticks: 10,
        commands: [
          {
            tick: 0,
            type: "assert",
            target: "player",
            expect: { health: 1 },
            tol: -1,
          },
        ],
      }),
    /tol must be >= 0/,
  );
});

test("accepts settings set/assert without an index", () => {
  const script = parseSimScript({
    ticks: 10,
    commands: [
      { tick: 0, type: "set", target: "settings", patch: { sfx_volume: 3 } },
      { tick: 1, type: "assert", target: "settings", expect: { gamemap: 1 } },
    ],
  });
  assert.equal(script.commands.length, 2);
});

test("assert may read read-only settings game state", () => {
  const script = parseSimScript({
    ticks: 10,
    commands: [
      {
        tick: 0,
        type: "assert",
        target: "settings",
        expect: { gameskill: 2 },
      },
    ],
  });
  assert.equal(script.commands.length, 1);
});

test("rejects set on a read-only settings field", () => {
  assert.throws(
    () =>
      parseSimScript({
        ticks: 10,
        commands: [
          { tick: 0, type: "set", target: "settings", patch: { gamemap: 2 } },
        ],
      }),
    /unknown settings field/,
  );
});

test("defaults snapshot name to tick-<n>", () => {
  const script = parseSimScript({
    ticks: 10,
    commands: [{ tick: 5, type: "snapshot" }],
  });
  assert.equal((script.commands[0] as { name: string }).name, "tick-5");
});

test("rejects unknown key names", () => {
  assert.throws(
    () =>
      parseSimScript({
        ticks: 10,
        commands: [{ tick: 0, type: "keydown", key: "NOT_A_KEY" }],
      }),
    /unknown key/,
  );
});

test("rejects out-of-order ticks", () => {
  assert.throws(
    () =>
      parseSimScript({
        ticks: 10,
        commands: [
          { tick: 5, type: "wait" },
          { tick: 3, type: "wait" },
        ],
      }),
    /sorted by tick/,
  );
});

test("rejects ticks beyond the total budget", () => {
  assert.throws(
    () =>
      parseSimScript({
        ticks: 5,
        commands: [{ tick: 5, type: "wait" }],
      }),
    /past ticks/,
  );
});

test("rejects unsafe snapshot names", () => {
  assert.throws(
    () =>
      parseSimScript({
        ticks: 10,
        commands: [{ tick: 0, type: "snapshot", name: "../escape" }],
      }),
    /name must match/,
  );
});

test("rejects unknown command types", () => {
  assert.throws(
    () =>
      parseSimScript({
        ticks: 10,
        commands: [{ tick: 0, type: "wobble" }],
      }),
    /unknown command type/,
  );
});
