import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ROUNDING } from "../src/config.js";
import { roundInvoice } from "../src/round.js";

test("uses the configured partner default", () => {
  assert.equal(DEFAULT_ROUNDING, "half-up");
  assert.equal(roundInvoice(2.5, DEFAULT_ROUNDING), 3);
});

test("retains both supported algorithms", () => {
  assert.equal(roundInvoice(2.5, "half-up"), 3);
  assert.equal(roundInvoice(2.5, "bankers"), 2);
});
