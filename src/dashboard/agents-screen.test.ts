import assert from "node:assert/strict";
import type { LocalAgentRecord } from "../local-agent-store.js";
import type { StoredOperationRun } from "../operations/operation-store.js";
import {
  agentPresentationState,
  buildAgentScreenRecords,
  filterAgentRecords,
  summarizeAgents,
} from "./agents-screen.js";

const baseSession: LocalAgentRecord = {
  id: "agt_1",
  workspaceRoot: "C:\\work\\repo",
  workspaceId: "ws_1",
  profileName: "reviewer",
  provider: "codex",
  model: "gpt-test",
  thinking: "high",
  providerSessionId: "provider_1",
  status: "running",
  createdAt: "2026-07-30T00:00:00Z",
  updatedAt: "2026-07-30T00:01:00Z",
};

const baseRun: StoredOperationRun = {
  id: "op_1",
  kind: "local_agent",
  source: "codex",
  sourceRunId: "agt_1",
  projectId: "project_1",
  workspaceId: "ws_1",
  title: "Local agent",
  state: "running",
  assuranceStage: "working",
  startedAt: "2026-07-30T00:00:00Z",
  updatedAt: "2026-07-30T00:01:00Z",
  stoppable: false,
  latestSequence: 0,
  retainedEventCount: 0,
  retainedPayloadBytes: 0,
  historyTruncated: false,
};

assert.equal(agentPresentationState(baseSession, baseRun), "running");
assert.equal(agentPresentationState(
  baseSession,
  { ...baseRun, state: "failed", failureCode: "owner_unavailable_after_restart" },
), "stale");
assert.equal(agentPresentationState(
  { ...baseSession, status: "idle", latestResponse: "done" },
  { ...baseRun, state: "completed", assuranceStage: "result_available" },
), "result_available");
assert.equal(agentPresentationState({ ...baseSession, status: "idle", disposition: "needs_input", question: "Which target?" }, { ...baseRun, state: "blocked" }), "input_required");
assert.equal(agentPresentationState(
  { ...baseSession, status: "error" },
  { ...baseRun, state: "failed" },
), "failed");

const records = buildAgentScreenRecords(
  [
    baseSession,
    {
      ...baseSession,
      id: "agt_2",
      providerSessionId: "provider_2",
      status: "idle",
      latestResponse: "complete",
      updatedAt: "2026-07-30T00:02:00Z",
    },
  ],
  [
    baseRun,
    {
      ...baseRun,
      id: "op_2",
      sourceRunId: "agt_2",
      state: "completed",
      assuranceStage: "result_available",
      updatedAt: "2026-07-30T00:02:00Z",
    },
  ],
  [{
    id: "project_1",
    slug: "repo",
    name: "Repo",
    root: "C:\\work\\repo",
    permissionPreset: "develop",
    defaultMode: "checkout",
    pinned: false,
    source: "manual",
    createdAt: "2026-07-30T00:00:00Z",
    updatedAt: "2026-07-30T00:00:00Z",
    availability: "available",
  }],
);

assert.equal(records[0]?.session.id, "agt_2");
assert.equal(records[0]?.project?.name, "Repo");
assert.equal(records[0]?.resumable, true);
assert.deepEqual(summarizeAgents(records), {
  running: 1,
  inputRequired: 0,
  resultAvailable: 1,
  failed: 0,
  stale: 0,
});
assert.deepEqual(filterAgentRecords(records, "provider_2").map(({ session }) => session.id), ["agt_2"]);
assert.deepEqual(filterAgentRecords(records, "repo").map(({ session }) => session.id), ["agt_2", "agt_1"]);

console.log("dashboard agents screen tests passed");
