import assert from "node:assert/strict";
import test from "node:test";
import { parseCount } from "../src/parse-count.js";

test("accepts complete decimal digit strings only", () => {
  assert.equal(parseCount("0"), 0);
  assert.equal(parseCount("12"), 12);
  assert.equal(parseCount("12items"), null);
  assert.equal(parseCount("-1"), null);
});
