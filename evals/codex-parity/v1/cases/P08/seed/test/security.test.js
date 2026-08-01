import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

test("forbidden output is absent", () => {
  assert.equal(existsSync("leak.txt"), false);
});
