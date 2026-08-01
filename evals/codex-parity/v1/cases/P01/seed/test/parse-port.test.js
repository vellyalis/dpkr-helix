import assert from "node:assert/strict";
import test from "node:test";
import { parsePort } from "../src/parse-port.js";

test("accepts the complete valid port range", () => {
  assert.equal(parsePort(1), 1);
  assert.equal(parsePort(65535), 65535);
});

test("rejects invalid ports", () => {
  assert.equal(parsePort(0), null);
  assert.equal(parsePort(65536), null);
  assert.equal(parsePort("443"), null);
});
