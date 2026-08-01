import assert from "node:assert/strict";
import test from "node:test";
import { parseRetryDelay } from "../src/backoff.js";

test("accepts exact non-negative integer strings", () => {
  assert.equal(parseRetryDelay("0"), 0);
  assert.equal(parseRetryDelay("250"), 250);
});
