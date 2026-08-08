import assert from "node:assert/strict";
import {
  findActiveLocalAgentProviderCooldown,
  normalizeLocalAgentFailure,
  retryAtForLocalAgentFailure,
} from "./local-agent-failure.js";

const localReference = new Date(2026, 7, 8, 11, 50, 0, 0).getTime();
const usageFailure = normalizeLocalAgentFailure(
  "codex",
  new Error("You've hit your usage limit. Try again at 12:34 PM."),
  localReference,
);
assert.equal(usageFailure.code, "usage_limit");
assert.equal(
  usageFailure.retryAt,
  new Date(2026, 7, 8, 12, 34, 0, 0).toISOString(),
);

const rateFailure = normalizeLocalAgentFailure(
  "claude",
  { status: 429, message: "Too many requests. Retry in 2 minutes 5 seconds." },
  localReference,
);
assert.equal(rateFailure.code, "rate_limited");
assert.equal(
  rateFailure.retryAt,
  new Date(localReference + 125_000).toISOString(),
);

assert.equal(
  retryAtForLocalAgentFailure("usage_limit", "No reset time supplied.", localReference),
  new Date(localReference + 5 * 60 * 1_000).toISOString(),
);
assert.equal(
  normalizeLocalAgentFailure("codex", new Error("Not logged in."), localReference).code,
  "authentication_failed",
);

const failedAt = new Date(2026, 7, 8, 11, 55, 0, 0).toISOString();
const cooldown = findActiveLocalAgentProviderCooldown([
  {
    id: "agt_quota",
    provider: "codex",
    status: "error",
    error: "You've hit your usage limit. Try again at 12:34 PM.",
    failureCode: "usage_limit",
    updatedAt: failedAt,
  },
], "codex", localReference);
assert.deepEqual(cooldown, {
  provider: "codex",
  failureCode: "usage_limit",
  retryAt: new Date(2026, 7, 8, 12, 34, 0, 0).toISOString(),
  sourceAgentId: "agt_quota",
});

assert.equal(findActiveLocalAgentProviderCooldown([
  {
    id: "agt_quota",
    provider: "codex",
    status: "error",
    error: "You've hit your usage limit. Try again at 12:34 PM.",
    failureCode: "usage_limit",
    updatedAt: failedAt,
  },
  {
    id: "agt_success",
    provider: "codex",
    status: "idle",
    updatedAt: new Date(2026, 7, 8, 12, 0, 0, 0).toISOString(),
  },
], "codex", localReference), undefined);

assert.equal(findActiveLocalAgentProviderCooldown([
  {
    id: "agt_quota",
    provider: "codex",
    status: "error",
    error: "You've hit your usage limit. Try again at 12:34 PM.",
    failureCode: "usage_limit",
    updatedAt: failedAt,
  },
  {
    id: "agt_auth",
    provider: "codex",
    status: "error",
    error: "Authentication failed.",
    failureCode: "authentication_failed",
    updatedAt: new Date(2026, 7, 8, 12, 0, 0, 0).toISOString(),
  },
], "codex", localReference), undefined);

console.log("local agent failure tests passed");
