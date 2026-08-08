import assert from "node:assert/strict";
import {
  checkLocalAgentProviderAvailability,
  formatLocalAgentProviderAvailabilitySummary,
  getLocalAgentProviderAvailabilitySnapshot,
} from "./local-agent-availability.js";

assert.equal(checkLocalAgentProviderAvailability("codex").available, true);
assert.equal(checkLocalAgentProviderAvailability("codex").state, "available");

{
  const availability = checkLocalAgentProviderAvailability("pi", {
    ...process.env,
    PI_COMMAND: "/definitely/missing/devspace-pi",
  });
  assert.equal(availability.available, false);
  assert.equal(availability.state, "unavailable");
  assert.match(availability.reason ?? "", /executable not found/);
}

{
  const now = new Date(2026, 7, 8, 11, 50, 0, 0).getTime();
  const availability = checkLocalAgentProviderAvailability("codex", process.env, [{
    id: "agt_quota",
    workspaceRoot: "C:\\repo",
    profileName: "reviewer",
    provider: "codex",
    status: "error",
    error: "You've hit your usage limit. Try again at 12:34 PM.",
    failureCode: "usage_limit",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  }], now);
  assert.equal(availability.available, false);
  assert.equal(availability.state, "cooldown");
  assert.equal(availability.failureCode, "usage_limit");
  assert.equal(availability.sourceAgentId, "agt_quota");
  assert.match(availability.retryAt ?? "", /^2026-/);
}

{
  const snapshot = getLocalAgentProviderAvailabilitySnapshot({
    ...process.env,
    PI_COMMAND: "/definitely/missing/devspace-pi",
  });
  assert.deepEqual(
    snapshot.map((provider) => provider.name),
    ["codex", "claude", "opencode", "pi", "cursor", "copilot"],
  );
  assert.equal(snapshot.find((provider) => provider.name === "pi")?.available, false);
}

assert.equal(
  formatLocalAgentProviderAvailabilitySummary([
    { name: "codex", available: true, state: "available" },
    { name: "pi", available: false, state: "unavailable", reason: "pi executable not found" },
  ]),
  "available: codex; unavailable: pi (pi executable not found)",
);
