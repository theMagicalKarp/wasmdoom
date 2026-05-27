import { test } from "node:test";
import assert from "node:assert/strict";
import { Vector2 } from "./math.ts";

test("constructor defaults both components to zero", () => {
  const v = new Vector2();
  assert.equal(v.x, 0);
  assert.equal(v.y, 0);
});

test("constructor stores the given components", () => {
  const v = new Vector2(3, -4);
  assert.equal(v.x, 3);
  assert.equal(v.y, -4);
});

test("zero returns the origin vector", () => {
  assert.ok(Vector2.zero().equals(new Vector2(0, 0)));
});

test("add sums components", () => {
  assert.ok(new Vector2(1, 2).add(new Vector2(3, 4)).equals(new Vector2(4, 6)));
});

test("add does not mutate either operand", () => {
  const a = new Vector2(1, 2);
  const b = new Vector2(3, 4);
  a.add(b);
  assert.ok(a.equals(new Vector2(1, 2)));
  assert.ok(b.equals(new Vector2(3, 4)));
});

test("sub subtracts components", () => {
  assert.ok(
    new Vector2(5, 3).sub(new Vector2(2, 8)).equals(new Vector2(3, -5)),
  );
});

test("sub does not mutate either operand", () => {
  const a = new Vector2(5, 3);
  const b = new Vector2(2, 8);
  a.sub(b);
  assert.ok(a.equals(new Vector2(5, 3)));
  assert.ok(b.equals(new Vector2(2, 8)));
});

test("setX replaces only x", () => {
  assert.ok(new Vector2(1, 2).setX(9).equals(new Vector2(9, 2)));
});

test("setY replaces only y", () => {
  assert.ok(new Vector2(1, 2).setY(9).equals(new Vector2(1, 9)));
});

test("setX returns a new instance, leaving the original unchanged", () => {
  const original = new Vector2(1, 2);
  const updated = original.setX(9);
  assert.notEqual(updated, original);
  assert.ok(original.equals(new Vector2(1, 2)));
});

test("equals is true for matching components", () => {
  assert.equal(new Vector2(1, 2).equals(new Vector2(1, 2)), true);
});

test("equals is false when a component differs", () => {
  assert.equal(new Vector2(1, 2).equals(new Vector2(1, 3)), false);
  assert.equal(new Vector2(1, 2).equals(new Vector2(0, 2)), false);
});

test("equals distinguishes +0 and -0 like ===", () => {
  // strict === treats -0 === 0 as true
  assert.equal(new Vector2(0, 0).equals(new Vector2(-0, -0)), true);
});

test("toString formats as an ordered pair", () => {
  assert.equal(new Vector2(3, -4).toString(), "(3, -4)");
});
