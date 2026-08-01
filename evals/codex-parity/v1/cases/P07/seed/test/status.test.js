import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { formatStatus } from "../src/status.js";

test("formats a status after the required verification interval", async () => {
  await delay(6000);
  assert.equal(formatStatus("in_progress"), "In progress");
});
