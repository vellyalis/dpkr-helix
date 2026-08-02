import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocalAgentRecord } from "../local-agent-store.js";
import { LocalAgentOperationProjector } from "./local-agent-operation-projector.js";
import { OperationRunService } from "./operation-run-service.js";
import { OperationStore } from "./operation-store.js";

const stateDir = await mkdtemp(join(tmpdir(), "devspace-agent-projector-test-"));
const store = new OperationStore(stateDir);
const runs = new OperationRunService(store);
const projector = new LocalAgentOperationProjector(runs, store);
const record: LocalAgentRecord = {
  id: "agt_fixture",
  workspaceId: "ws_fixture",
  workspaceRoot: "C:\\fixture",
  profileName: "reviewer",
  provider: "codex",
  status: "starting",
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z",
};

try {
  projector.created(record);
  projector.statusChanged({ ...record, status: "running" });
  projector.assistantMessage(record, "Bearer abc");
  projector.assistantMessage(record, "defgh\nsafe line\n");
  projector.resultAvailable({
    ...record,
    status: "idle",
    latestResponse: "Final result.",
  });

  const completed = store.findRunBySource("local_agent", "codex", record.id);
  assert.ok(completed);
  assert.equal(completed.workspaceId, "ws_fixture");
  assert.equal(completed.state, "completed");
  assert.equal(completed.assuranceStage, "result_available");
  const completedEvents = store.listEvents(completed.id);
  assert.ok(completedEvents.some((event) =>
    event.type === "agent.message"
    && JSON.stringify(event.payload).includes("[redacted sensitive output]")
  ));
  assert.ok(completedEvents.some((event) =>
    event.type === "agent.result_available"
    && JSON.stringify(event.payload).includes("Final result.")
  ));
  assert.doesNotMatch(JSON.stringify(completedEvents), /abcdefgh/);

  projector.statusChanged({ ...record, status: "starting" });
  const resumed = store.findRunBySource("local_agent", "codex", record.id);
  assert.ok(resumed);
  assert.notEqual(resumed.id, completed.id);
  assert.equal(resumed.state, "running");
  projector.statusChanged({
    ...record,
    status: "error",
    error: "secret provider failure detail",
  });
  const failed = store.findRunBySource("local_agent", "codex", record.id);
  assert.ok(failed);
  assert.equal(failed.state, "failed");
  assert.doesNotMatch(
    JSON.stringify(store.listEvents(failed.id)),
    /secret provider failure detail/,
  );

  const inputRecord = { ...record, id: "agt_input" };
  projector.created(inputRecord);
  projector.inputRequired({
    ...inputRecord,
    status: "idle",
    disposition: "needs_input",
    question: "Which target should be changed?",
  });
  const blocked = store.findRunBySource("local_agent", "codex", inputRecord.id);
  assert.ok(blocked);
  assert.deepEqual([blocked.state, blocked.assuranceStage], ["blocked", "working"]);
  assert.equal(store.listEvents(blocked.id).some((event) => event.type === "agent.input_required"), true);
  projector.statusChanged({ ...inputRecord, status: "starting" });
  assert.equal(store.getRun(blocked.id)?.state, "running");
  projector.resultAvailable({ ...inputRecord, status: "idle", disposition: "completed", latestResponse: "Done." });
  assert.equal(store.getRun(blocked.id)?.state, "completed");

  const activeBeforeUnknown = store.listActiveRuns().length;
  projector.created({ ...record, id: "agt_unknown", provider: "unknown" });
  assert.equal(store.listActiveRuns().length, activeBeforeUnknown);

  store.close();
  assert.doesNotThrow(() => {
    projector.statusChanged({ ...record, id: "agt_store_closed", status: "running" });
  });
} finally {
  try {
    store.close();
  } catch {
    // The projection-failure proof intentionally closes the store first.
  }
  await rm(stateDir, { recursive: true, force: true });
}
