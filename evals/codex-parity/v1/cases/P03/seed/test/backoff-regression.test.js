import assert from "node:assert/strict";
import test from "node:test";
import { parseRetryDelay } from "../src/backoff.js";

test("rejects partial or out-of-range values", () => {
  assert.equal(parseRetryDelay("250ms", 700), 700);
  assert.equal(parseRetryDelay("-1", 700), 700);
  assert.equal(parseRetryDelay("", 700), 700);
  assert.equal(parseRetryDelay("30001", 700), 700);
});
