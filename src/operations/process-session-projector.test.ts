import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProcessSessionManager } from "../process-sessions.js";
import { OperationRunService } from "./operation-run-service.js";
import { OperationStore } from "./operation-store.js";
import { OperationVerificationProjector } from "./verification-projector.js";
import {
  ProcessSessionOperationProjector,
  resolveProcessSessionCapabilities,
} from "./process-session-projector.js";

const stateDir = await mkdtemp(join(tmpdir(), "devspace-process-projector-test-"));
const store = new OperationStore(stateDir);
let manager: ProcessSessionManager;
const service = new OperationRunService(store, {
  resolveCapabilities: (reference) =>
    resolveProcessSessionCapabilities(manager, reference),
});
const stopOutcomes: Array<{
  runId: string;
  state: "stopped" | "failed" | "completed";
}> = [];
const projector = new ProcessSessionOperationProjector(service, {
  onStopOutcome: (outcome) => stopOutcomes.push(outcome),
  verification: new OperationVerificationProjector(service, store),
});
manager = new ProcessSessionManager({
  projection: projector,
  completedSessionTtlMs: 5_000,
});
const node = process.platform === "win32"
  ? `"${process.execPath}"`
  : JSON.stringify(process.execPath);

try {
  const completed = await manager.start({
    workspaceId: "workspace-projection",
    cwd: process.cwd(),
    command: `${node} -e "console.log('projected-output')"`,
    yieldTimeMs: 2_000,
  });
  assert.equal(completed.running, false);

  const completedRun = store.findRunBySource(
    "process_session",
    "mcp",
    "process:1",
  );
  assert.ok(completedRun);
  assert.equal(completedRun.workspaceId, "workspace-projection");
  assert.equal(completedRun.state, "completed");
  assert.equal(completedRun.assuranceStage, "not_applicable");
  assert.equal(completedRun.stoppable, false);
  assert.deepEqual(
    store.listEvents(completedRun.id).map((event) => event.type),
    [
      "run.created",
      "process.started",
      "process.output",
      "process.exited",
      "run.state_changed",
    ],
  );
  assert.equal(
    store.listEvents(completedRun.id).find((event) => event.type === "process.output")
      ?.payload.text.includes("projected-output"),
    true,
  );

  const agentRun = service.startRun({
    kind: "local_agent",
    source: "codex",
    sourceRunId: "agt_process_verification",
    workspaceId: "workspace-projection",
    title: "Local agent verification target",
    state: "completed",
  });
  assert.equal(agentRun.ok, true);
  if (!agentRun.ok) throw new Error("Expected verification target.");
  assert.equal(
    service.transitionAssurance(
      agentRun.value.id,
      "result_available",
      "operation_owner",
    ).ok,
    true,
  );
  const verified = await manager.start({
    workspaceId: "workspace-projection",
    cwd: process.cwd(),
    command: `${node} -e "console.log('verified-command')"`,
    yieldTimeMs: 2_000,
    verification: {
      runId: agentRun.value.id,
      workspaceId: "workspace-projection",
      type: "tests",
    },
  });
  assert.equal(verified.exitCode, 0);
  assert.equal(store.getRun(agentRun.value.id)?.assuranceStage, "verified");
  assert.deepEqual(
    store.getEvidence(agentRun.value.id).map(({ type, state }) => ({
      type,
      state,
    })),
    [{ type: "tests", state: "passed" }],
  );

  const safeProjection = new ProcessSessionOperationProjector(service);
  safeProjection.started({
    sessionId: 99,
    workspaceId: "workspace-projection",
    tty: false,
  });
  safeProjection.output({
    sessionId: 99,
    workspaceId: "workspace-projection",
    stream: "stdout",
    text: "Bearer abcde",
  });
  safeProjection.output({
    sessionId: 99,
    workspaceId: "workspace-projection",
    stream: "stderr",
    text: "fghijklmnopqrstuvwxyz",
  });
  safeProjection.output({
    sessionId: 99,
    workspaceId: "workspace-projection",
    stream: "stderr",
    text: "🙂".repeat(10_000),
  });
  safeProjection.exited({
    sessionId: 99,
    workspaceId: "workspace-projection",
    exitCode: 1,
    wallTimeMs: 10,
  });

  const safeRun = store.findRunBySource("process_session", "mcp", "process:99");
  assert.ok(safeRun);
  assert.equal(safeRun.state, "failed");
  const safeOutput = store.listEvents(safeRun.id)
    .filter((event) => event.type === "process.output");
  const redactedOutput = safeOutput.find((event) => event.payload.text.includes("redacted"));
  assert.deepEqual(redactedOutput?.payload, {
    stream: "combined",
    text: "[redacted sensitive output]",
    truncated: true,
  });
  const boundedOutput = safeOutput.filter((event) => event.payload.stream === "stderr");
  assert.ok(boundedOutput.length >= 1);
  assert.equal(boundedOutput.some((event) => event.payload.truncated), true);
  assert.ok(
    boundedOutput.every(
      (event) => Buffer.byteLength(event.payload.text, "utf8") <= 8 * 1_024,
    ),
  );
  assert.doesNotMatch(JSON.stringify(safeOutput), /abcdefghijkl/);

  safeProjection.started({
    sessionId: 100,
    workspaceId: "workspace-projection",
    tty: false,
  });
  safeProjection.stopRequested({
    sessionId: 100,
    workspaceId: "workspace-projection",
    reason: "interrupt",
  });
  safeProjection.exited({
    sessionId: 100,
    workspaceId: "workspace-projection",
    exitCode: 0,
    wallTimeMs: 10,
  });
  assert.equal(
    store.findRunBySource("process_session", "mcp", "process:100")?.state,
    "completed",
  );

  safeProjection.started({
    sessionId: 101,
    workspaceId: "workspace-projection",
    tty: false,
  });
  safeProjection.exited({
    sessionId: 101,
    workspaceId: "workspace-projection",
    signal: "SIGKILL",
    wallTimeMs: 10,
  });
  assert.equal(
    store.findRunBySource("process_session", "mcp", "process:101")?.state,
    "failed",
  );

  const stoppable = await manager.start({
    workspaceId: "workspace-projection",
    cwd: process.cwd(),
    command: `${node} -e "setInterval(() => {}, 1000)"`,
    yieldTimeMs: 5,
  });
  assert.equal(stoppable.running, true);
  assert.equal(stoppable.sessionId, 3);
  const stoppingRun = store.findRunBySource(
    "process_session",
    "mcp",
    "process:3",
  );
  assert.ok(stoppingRun);
  assert.equal(stoppingRun.stoppable, true);
  manager.terminate("workspace-projection", 3);
  assert.equal(store.getRun(stoppingRun.id)?.stoppable, false);
  const stopped = await manager.write({
    workspaceId: "workspace-projection",
    sessionId: 3,
    yieldTimeMs: 2_000,
  });
  assert.equal(stopped.running, false);
  assert.equal(store.getRun(stoppingRun.id)?.state, "stopped");
  assert.deepEqual(
    store.listEvents(stoppingRun.id)
      .filter((event) => event.type === "run.state_changed")
      .map((event) => event.payload.state),
    ["stopping", "stopped"],
  );
  assert.deepEqual(stopOutcomes, [{ runId: stoppingRun.id, state: "stopped" }]);

  safeProjection.started({
    sessionId: 102,
    workspaceId: "workspace-projection",
    tty: false,
  });
  assert.equal(
    safeProjection.stopRequested({
      sessionId: 102,
      workspaceId: "workspace-projection",
      reason: "terminate",
    }),
    true,
  );
  safeProjection.stopFailed({
    sessionId: 102,
    workspaceId: "workspace-projection",
    reason: "terminate",
  });
  const recoveredRun = store.findRunBySource(
    "process_session",
    "mcp",
    "process:102",
  );
  assert.equal(recoveredRun?.state, "running");
  assert.equal(recoveredRun?.stoppable, true);

  const missing = resolveProcessSessionCapabilities(manager, {
    runId: "run-missing",
    kind: "process_session",
    source: "mcp",
    sourceRunId: "process:999",
    workspaceId: "workspace-projection",
  });
  assert.deepEqual(missing, { ownerStatus: "missing", stoppable: false });
  assert.deepEqual(
    resolveProcessSessionCapabilities(manager, {
      runId: "run-unknown",
      kind: "process_session",
      source: "mcp",
      sourceRunId: "invalid",
      workspaceId: "workspace-projection",
    }),
    { ownerStatus: "unknown", stoppable: false },
  );

  const projectionFailureManager = new ProcessSessionManager({
    projection: {
      started: () => {
        throw new Error("projection unavailable");
      },
      output: () => {
        throw new Error("projection unavailable");
      },
      stopRequested: () => {
        throw new Error("projection unavailable");
      },
      exited: () => {
        throw new Error("projection unavailable");
      },
    },
  });
  try {
    const unaffected = await projectionFailureManager.start({
      workspaceId: "workspace-projection",
      cwd: process.cwd(),
      command: `${node} -e "console.log('canonical-success')"`,
      yieldTimeMs: 2_000,
    });
    assert.equal(unaffected.exitCode, 0);
    assert.match(unaffected.output, /canonical-success/);

    const refusedStop = await projectionFailureManager.start({
      workspaceId: "workspace-projection",
      cwd: process.cwd(),
      command: `${node} -e "setInterval(() => {}, 1000)"`,
      yieldTimeMs: 5,
    });
    assert.equal(refusedStop.running, true);
    assert.throws(
      () => projectionFailureManager.terminate(
        "workspace-projection",
        refusedStop.sessionId!,
      ),
      /projection unavailable/,
    );
    assert.equal(
      projectionFailureManager.getSessionStatus(
        "workspace-projection",
        refusedStop.sessionId!,
      ),
      "running",
    );
  } finally {
    projectionFailureManager.shutdown();
  }
} finally {
  manager.shutdown();
  store.close();
  await rm(stateDir, { recursive: true, force: true });
}
