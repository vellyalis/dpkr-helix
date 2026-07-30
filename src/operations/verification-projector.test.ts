import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OperationRunService } from "./operation-run-service.js";
import { OperationStore } from "./operation-store.js";
import { OperationVerificationProjector } from "./verification-projector.js";

const stateDir = await mkdtemp(join(tmpdir(), "devspace-verification-projector-test-"));
const store = new OperationStore(stateDir);
const runs = new OperationRunService(store, {
  now: () => "2026-07-30T02:10:00.000Z",
});
const projector = new OperationVerificationProjector(
  runs,
  store,
  () => "2026-07-30T02:10:01.000Z",
);

function resultAvailableAgent(sourceRunId: string) {
  const created = runs.startRun({
    kind: "local_agent",
    source: "codex",
    sourceRunId,
    workspaceId: "workspace-verification",
    title: `Local agent ${sourceRunId}`,
    state: "completed",
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("Expected local-agent run.");
  assert.equal(
    runs.transitionAssurance(
      created.value.id,
      "result_available",
      "operation_owner",
    ).ok,
    true,
  );
  return created.value.id;
}

try {
  const passedRunId = resultAvailableAgent("agt_passed");
  assert.deepEqual(store.getEvidence(passedRunId), []);
  assert.equal(store.getRun(passedRunId)?.assuranceStage, "result_available");

  const passedTarget = {
    runId: passedRunId,
    workspaceId: "workspace-verification",
    type: "tests" as const,
  };
  assert.equal(projector.started(passedTarget), true);
  assert.equal(store.getRun(passedRunId)?.assuranceStage, "verifying");
  assert.deepEqual(
    store.getEvidence(passedRunId).map(({ type, state }) => ({ type, state })),
    [{ type: "tests", state: "running" }],
  );
  assert.equal(projector.completed(passedTarget, "passed"), true);
  assert.equal(store.getRun(passedRunId)?.assuranceStage, "verified");
  assert.deepEqual(
    store.getEvidence(passedRunId).map(({ type, state }) => ({ type, state })),
    [{ type: "tests", state: "passed" }],
  );
  assert.deepEqual(
    store.listEvents(passedRunId)
      .filter((event) =>
        event.type === "verification.started"
        || event.type === "verification.completed"
      )
      .map((event) => event.type),
    ["verification.started", "verification.completed"],
  );

  const failedRunId = resultAvailableAgent("agt_failed");
  const failedTarget = {
    runId: failedRunId,
    workspaceId: "workspace-verification",
    type: "build" as const,
  };
  assert.equal(projector.started(failedTarget), true);
  assert.equal(projector.completed(failedTarget, "failed"), true);
  assert.equal(store.getRun(failedRunId)?.assuranceStage, "verification_pending");
  assert.deepEqual(
    store.getEvidence(failedRunId).map(({ type, state }) => ({ type, state })),
    [{ type: "build", state: "failed" }],
  );

  const wrongWorkspaceRunId = resultAvailableAgent("agt_wrong_workspace");
  assert.equal(
    projector.started({
      runId: wrongWorkspaceRunId,
      workspaceId: "workspace-other",
      type: "typecheck",
    }),
    false,
  );
  assert.equal(
    store.getRun(wrongWorkspaceRunId)?.assuranceStage,
    "result_available",
  );
  assert.deepEqual(store.getEvidence(wrongWorkspaceRunId), []);

  const storeFailureRunId = resultAvailableAgent("agt_store_failure");
  let failEvidenceWrite = false;
  const storeFailureProjector = new OperationVerificationProjector(
    runs,
    {
      getEvidence: (runId) => store.getEvidence(runId),
      getRun: (runId) => store.getRun(runId),
      listRuns: (options) => store.listRuns(options),
      upsertEvidence: (runId, evidence) => {
        if (failEvidenceWrite && evidence.state !== "running") {
          throw new Error("evidence unavailable");
        }
        return store.upsertEvidence(runId, evidence);
      },
    },
    () => "2026-07-30T02:10:02.000Z",
  );
  const storeFailureTarget = {
    runId: storeFailureRunId,
    workspaceId: "workspace-verification",
    type: "tests" as const,
  };
  assert.equal(storeFailureProjector.started(storeFailureTarget), true);
  failEvidenceWrite = true;
  assert.equal(storeFailureProjector.completed(storeFailureTarget, "passed"), false);
  assert.equal(
    store.getRun(storeFailureRunId)?.assuranceStage,
    "verification_pending",
  );

  const interruptedRunId = resultAvailableAgent("agt_interrupted");
  const interruptedTarget = {
    runId: interruptedRunId,
    workspaceId: "workspace-verification",
    type: "build" as const,
  };
  assert.equal(projector.started(interruptedTarget), true);
  assert.equal(store.getRun(interruptedRunId)?.assuranceStage, "verifying");
  const reconciliation = new OperationVerificationProjector(
    runs,
    store,
    () => "2026-07-30T02:10:03.000Z",
  ).reconcileInterrupted();
  assert.equal(reconciliation.inspected, 1);
  assert.equal(reconciliation.reconciled, 1);
  assert.deepEqual(reconciliation.failedRunIds, []);
  assert.equal(
    store.getRun(interruptedRunId)?.assuranceStage,
    "verification_pending",
  );
  assert.deepEqual(
    store.getEvidence(interruptedRunId).map(({ type, state, summary }) => ({
      type,
      state,
      summary,
    })),
    [{
      type: "build",
      state: "not_run",
      summary: "Verification was interrupted before completion.",
    }],
  );
  assert.equal(
    store.listEvents(interruptedRunId).some((event) =>
      event.type === "warning"
      && event.payload.code === "verification_interrupted_after_restart"
    ),
    true,
  );
} finally {
  store.close();
  await rm(stateDir, { recursive: true, force: true });
}
