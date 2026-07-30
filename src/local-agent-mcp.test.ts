import assert from "node:assert/strict";
import {
  createLocalAgentActionOutput,
  createLocalAgentListOutput,
} from "./local-agent-mcp.js";
import type { LocalAgentRecord } from "./local-agent-store.js";

const record: LocalAgentRecord = {
  id: "agt_1234",
  workspaceId: "ws_1",
  workspaceRoot: "/repo",
  profileName: "codex-implementer",
  provider: "codex",
  model: "gpt-5.5",
  thinking: "medium",
  status: "idle",
  latestResponse: "Implemented the requested change.",
  providerSessionId: "thread_private",
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:01:00.000Z",
};

const status = createLocalAgentActionOutput("status", record);
assert.equal(status.agent.resultAvailable, true);
assert.equal(status.agent.verificationStatus, "pending");
assert.equal("providerSessionId" in status.agent, false);
assert.match(status.result, /Result available — verification pending/);
assert.doesNotMatch(status.result, /verified/i);

const list = createLocalAgentListOutput([record]);
assert.deepEqual(list.summary, { total: 1, active: 0, resultAvailable: 1 });
assert.equal(list.agents[0]?.latestResponse, undefined);
assert.equal(list.agents[0]?.error, undefined);
assert.equal("providerSessionId" in (list.agents[0] ?? {}), false);

assert.equal(
  createLocalAgentListOutput([]).result,
  "No local-agent sessions found for this workspace.",
);
