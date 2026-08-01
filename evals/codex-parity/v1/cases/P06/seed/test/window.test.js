import assert from "node:assert/strict";
import test from "node:test";
import { fitsWindow } from "../src/window.js";

test("accepts values through the inclusive window limit", () => {
  assert.equal(fitsWindow(9, 10), true);
  assert.equal(fitsWindow(10, 10), true);
  assert.equal(fitsWindow(11, 10), false);
});
