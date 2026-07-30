import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OperationEventBus } from "./operation-event-bus.js";
import { OperationRunService } from "./operation-run-service.js";
import { OperationStore } from "./operation-store.js";

const stateDir = await mkdtemp(join(tmpdir(), "devspace-operation-service-test-"));
const stores: OperationStore[] = [];

try {
  const store = new OperationStore(stateDir);
  stores.push(store);
  const bus = new OperationEventBus();
  const published: Array<{ runId: string; sequence: number; type: string }> = [];
  const unsubscribe = bus.subscribe((event) => {
    published.push({ runId: event.runId, sequence: event.sequence, type: event.type });
  });
  bus.subscribe(() => {
    throw new Error("subscriber failure");
  });
  bus.subscribe((event) => {
    published.push({ runId: event.runId, sequence: event.sequence, type: event.type });
  });
  bus.subscribe(async () => {
    await Promise.resolve();
    throw new Error("async subscriber failure");
  });

  const nowValues = [
    "2026-07-29T01:00:00.000Z",
    "2026-07-29T01:00:01.000Z",
    "2026-07-29T01:00:02.000Z",
    "2026-07-29T01:00:03.000Z",
    "2026-07-29T01:00:04.000Z",
    "2026-07-29T01:00:05.000Z",
    "2026-07-29T01:00:06.000Z",
    "2026-07-29T01:00:07.000Z",
    "2026-07-29T01:00:08.000Z",
    "2026-07-29T01:00:09.000Z",
  ];
  const issues: string[] = [];
  const service = new OperationRunService(store, {
    eventBus: bus,
    now: () => nowValues.shift() ?? "2026-07-29T01:01:00.000Z",
    onIssue: (issue) => issues.push(issue.code),
    resolveCapabilities: (reference) => {
      if (reference.sourceRunId === "process:missing") {
        return { ownerStatus: "missing", stoppable: false };
      }
      if (reference.sourceRunId === "process:unknown") {
        return { ownerStatus: "unknown", stoppable: false };
      }
      return { ownerStatus: "available", stoppable: true };
    },
  });

  const processResult = service.startRun({
    kind: "process_session",
    source: "mcp",
    sourceRunId: "process:1",
    workspaceId: "ws_1",
    title: "Build project",
    state: "running",
    assuranceStage: "working",
  });
  assert.equal(processResult.ok, true);
  if (!processResult.ok) throw new Error("Expected process run creation.");
  const processRunId = processResult.value.id;
  assert.equal(processResult.value.stoppable, true);
  assert.deepEqual(processResult.issues.map((issue) => issue.code), ["subscriber_failure"]);
  assert.deepEqual(
    store.listEvents(processRunId).map((event) => [event.sequence, event.type]),
    [[1, "run.created"]],
  );
  assert.deepEqual(
    published.filter((event) => event.runId === processRunId),
    [
      { runId: processRunId, sequence: 1, type: "run.created" },
      { runId: processRunId, sequence: 1, type: "run.created" },
    ],
  );

  const blocked = service.transitionState(processRunId, "blocked", "awaiting_input");
  assert.equal(blocked.ok, true);
  assert.equal(store.getRun(processRunId)?.state, "blocked");
  assert.equal(store.getRun(processRunId)?.assuranceStage, "working");
  assert.equal(service.transitionState(processRunId, "running").ok, true);
  assert.equal(
    service.recordEvent(processRunId, {
      type: "tool.completed",
      timestamp: "2026-07-29T01:00:03.500Z",
      level: "info",
      summary: "Build completed.",
      payload: { toolName: "build" },
    }, {
      phase: "verification",
      currentAction: "Running tests",
    }).ok,
    true,
  );
  assert.equal(store.getRun(processRunId)?.currentAction, "Running tests");

  const completed = service.transitionState(processRunId, "completed");
  assert.equal(completed.ok, true);
  assert.equal(store.getRun(processRunId)?.state, "completed");
  assert.equal(store.getRun(processRunId)?.assuranceStage, "working");
  assert.equal(store.getRun(processRunId)?.stoppable, false);
  assert.equal(
    service.transitionAssurance(processRunId, "result_available", "operation_owner").ok,
    true,
  );
  assert.equal(store.getRun(processRunId)?.state, "completed");
  assert.equal(store.getRun(processRunId)?.assuranceStage, "result_available");
  assert.equal(
    service.transitionAssurance(processRunId, "verification_pending", "operation_owner").ok,
    true,
  );
  assert.equal(
    service.transitionAssurance(processRunId, "verifying", "operation_owner").ok,
    false,
  );
  assert.equal(
    service.transitionAssurance(
      processRunId,
      "verifying",
      "verification_evidence",
    ).ok,
    true,
  );
  assert.equal(
    service.transitionAssurance(processRunId, "verified", "verification_evidence").ok,
    false,
  );
  store.upsertEvidence(processRunId, {
    type: "tests",
    state: "passed",
    timestamp: "2026-07-29T01:00:07.500Z",
  });
  assert.equal(
    service.transitionAssurance(processRunId, "verified", "verification_evidence").ok,
    true,
  );
  const invalidAssurance = service.transitionAssurance(
    processRunId,
    "working",
    "verification_evidence",
  );
  assert.equal(invalidAssurance.ok, false);
  assert.equal(invalidAssurance.issues[0].code, "invalid_assurance_transition");
  const invalidState = service.transitionState(processRunId, "running");
  assert.equal(invalidState.ok, false);
  assert.equal(invalidState.issues[0].code, "invalid_state_transition");
  assert.equal(service.getCapabilities(processRunId).ok, true);
  const terminalCapabilities = service.getCapabilities(processRunId);
  assert.equal(terminalCapabilities.ok && terminalCapabilities.value.stoppable, false);

  const blockedCompletion = service.startRun({
    kind: "mcp_tool",
    source: "mcp",
    title: "Await approval",
    state: "blocked",
  });
  assert.equal(blockedCompletion.ok, true);
  if (!blockedCompletion.ok) throw new Error("Expected blocked run creation.");
  assert.equal(service.transitionState(blockedCompletion.value.id, "completed").ok, true);

  const goalRun = service.startRun({
    kind: "mcp_tool",
    source: "mcp",
    goalId: "GOAL_TEST",
    title: "Verify goal",
    state: "completed",
    assuranceStage: "working",
  });
  assert.equal(goalRun.ok, true);
  if (!goalRun.ok) throw new Error("Expected goal-linked run creation.");
  store.upsertEvidence(goalRun.value.id, { type: "tests", state: "passed" });
  assert.equal(
    service.transitionAssurance(goalRun.value.id, "verified", "verification_evidence").ok,
    false,
  );
  store.upsertEvidence(goalRun.value.id, { type: "goal_state", state: "passed" });
  assert.equal(
    service.transitionAssurance(goalRun.value.id, "verified", "verification_evidence").ok,
    true,
  );

  const agentResult = service.startRun({
    kind: "local_agent",
    source: "codex",
    sourceRunId: "agt_12345678",
    workspaceId: "ws_1",
    title: "Review change",
    state: "running",
  });
  assert.equal(agentResult.ok, true);
  if (!agentResult.ok) throw new Error("Expected agent run creation.");
  assert.equal(agentResult.value.stoppable, false);
  assert.equal(service.getCapabilities(agentResult.value.id).ok, true);
  const agentCapabilities = service.getCapabilities(agentResult.value.id);
  assert.equal(agentCapabilities.ok && agentCapabilities.value.stoppable, false);

  const missing = service.startRun({
    kind: "process_session",
    source: "mcp",
    sourceRunId: "process:missing",
    title: "Orphaned process",
    state: "running",
  });
  const unknown = service.startRun({
    kind: "process_session",
    source: "mcp",
    sourceRunId: "process:unknown",
    title: "Unresolved process",
    state: "running",
  });
  assert.equal(missing.ok, true);
  assert.equal(unknown.ok, true);
  if (!missing.ok || !unknown.ok) throw new Error("Expected reconciliation fixtures.");

  const reconciliation = service.reconcileActiveRuns();
  assert.equal(reconciliation.missing, 1);
  assert.equal(reconciliation.unknown, 1);
  assert.equal(reconciliation.available, 1);
  assert.deepEqual(reconciliation.failedRunIds, [missing.value.id]);
  assert.equal(store.getRun(missing.value.id)?.state, "failed");
  assert.equal(
    store.getRun(missing.value.id)?.failureCode,
    "owner_unavailable_after_restart",
  );
  assert.equal(store.getRun(unknown.value.id)?.state, "running");
  assert.equal(store.getRun(agentResult.value.id)?.state, "running");

  const staleCapability = service.startRun({
    kind: "process_session",
    source: "mcp",
    sourceRunId: "process:stale",
    title: "Stale capability",
    state: "running",
  });
  assert.equal(staleCapability.ok, true);
  if (!staleCapability.ok) throw new Error("Expected stale-capability fixture.");
  assert.equal(store.getRun(staleCapability.value.id)?.stoppable, true);
  const unknownCapabilityService = new OperationRunService(store, {
    resolveCapabilities: () => ({ ownerStatus: "unknown", stoppable: false }),
  });
  unknownCapabilityService.reconcileActiveRuns();
  assert.equal(store.getRun(staleCapability.value.id)?.state, "running");
  assert.equal(store.getRun(staleCapability.value.id)?.stoppable, false);

  const capabilityFailureService = new OperationRunService(store, {
    resolveCapabilities: () => {
      throw new Error("owner lookup unavailable");
    },
    onIssue: () => {
      throw new Error("diagnostic sink unavailable");
    },
  });
  const capabilityFailure = capabilityFailureService.getCapabilities(agentResult.value.id);
  assert.equal(capabilityFailure.ok, true);
  assert.equal(capabilityFailure.ok && capabilityFailure.value.ownerStatus, "unknown");
  assert.equal(capabilityFailure.ok && capabilityFailure.value.stoppable, false);
  assert.deepEqual(
    capabilityFailure.issues.map((issue) => issue.code),
    ["capability_failure"],
  );

  const appendFailureStore = {
    appendEvent: () => {
      throw new Error("store unavailable");
    },
    createRun: store.createRun.bind(store),
    getEvidence: store.getEvidence.bind(store),
    getRun: store.getRun.bind(store),
    listActiveRuns: store.listActiveRuns.bind(store),
    updateRun: store.updateRun.bind(store),
  };
  const appendFailureService = new OperationRunService(appendFailureStore);
  const runWithMissingCreatedEvent = appendFailureService.startRun({
    kind: "mcp_tool",
    source: "mcp",
    title: "Read file",
    state: "running",
  });
  assert.equal(runWithMissingCreatedEvent.ok, true);
  assert.deepEqual(
    runWithMissingCreatedEvent.issues.map((issue) => issue.code),
    ["store_failure"],
  );
  if (!runWithMissingCreatedEvent.ok) throw new Error("Run creation must survive event failure.");
  assert.equal(store.getRun(runWithMissingCreatedEvent.value.id)?.state, "running");

  const createFailureService = new OperationRunService({
    ...appendFailureStore,
    createRun: () => {
      throw new Error("store unavailable");
    },
  });
  const createFailure = createFailureService.startRun({
    kind: "mcp_tool",
    source: "mcp",
    title: "Read file",
  });
  assert.equal(createFailure.ok, false);
  assert.equal(createFailure.issues[0].code, "store_failure");
  const invalidInitialAssurance = service.startRun({
    kind: "local_agent",
    source: "codex",
    title: "Invalid trusted result",
    assuranceStage: "verified",
  } as unknown as Parameters<typeof service.startRun>[0]);
  assert.equal(invalidInitialAssurance.ok, false);
  assert.equal(
    invalidInitialAssurance.issues[0].code,
    "invalid_assurance_transition",
  );
  assert.equal(service.transitionState("op_missing", "running").ok, false);
  assert.ok(issues.includes("subscriber_failure"));

  unsubscribe();
  const publicationAfterUnsubscribe = bus.publish(store.listEvents(processRunId)[0]!);
  assert.deepEqual(publicationAfterUnsubscribe, { delivered: 1, failed: 2 });
  await new Promise<void>((resolve) => setImmediate(resolve));
} finally {
  for (const store of stores) store.close();
  await rm(stateDir, { recursive: true, force: true });
}
