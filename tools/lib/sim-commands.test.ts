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
