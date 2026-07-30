import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProcessSessionManager } from "../process-sessions.js";
import { OperationRunService } from "./operation-run-service.js";
import { requestOperationStop } from "./operation-stop.js";
import { OperationStore } from "./operation-store.js";
import {
  ProcessSessionOperationProjector,
  resolveProcessSessionCapabilities,
} from "./process-session-projector.js";

const root = await mkdtemp(join(tmpdir(), "devspace-operation-stop-test-"));
const store = new OperationStore(root);
let manager: ProcessSessionManager | undefined;
try {
  let processes: ProcessSessionManager;
  const runs = new OperationRunService(store, {
    resolveCapabilities: (reference) =>
      resolveProcessSessionCapabilities(processes, reference),
  });
  processes = new ProcessSessionManager({
    projection: new ProcessSessionOperationProjector(runs),
  });
  manager = processes;

  const active = await manager.start({
    workspaceId: "workspace-stop",
    cwd: root,
    command: `${JSON.stringify(process.execPath)} -e "setInterval(() => {}, 1000)"`,
    yieldTimeMs: 5,
  });
  assert.equal(active.running, true);
  const processRun = store.findRunBySource(
    "process_session",
    "mcp",
    `process:${active.sessionId}`,
  );
  assert.ok(processRun);
  assert.equal(processRun.stoppable, true);

  let terminateCalls = 0;
  const countingOwner = {
    terminate: (workspaceId: string, sessionId: number) => {
      terminateCalls += 1;
      return manager!.terminate(workspaceId, sessionId);
    },
  };
  const requested = requestOperationStop(processRun.id, store, runs, countingOwner);
  assert.equal(requested.ok, true);
  assert.equal(requested.ok && requested.run.state, "stopping");
  assert.equal(requested.ok && requested.run.stoppable, false);
  const duplicateWhileStopping = requestOperationStop(
    processRun.id,
    store,
    runs,
    countingOwner,
  );
  assert.deepEqual(duplicateWhileStopping, { ok: false, code: "not_stoppable" });
  assert.equal(terminateCalls, 1);
  await waitFor(() => store.getRun(processRun.id)?.state === "stopped");
  assert.equal(store.getRun(processRun.id)?.stoppable, false);
  assert.deepEqual(
    store.listEvents(processRun.id)
      .filter((event) => event.type === "run.state_changed")
      .map((event) => event.payload.state),
    ["stopping", "stopped"],
  );

  const repeated = requestOperationStop(processRun.id, store, runs, countingOwner);
  assert.equal(repeated.ok, false);
  assert.ok(
    !repeated.ok
    && (repeated.code === "not_stoppable" || repeated.code === "owner_unavailable"),
  );
  assert.deepEqual(
    requestOperationStop("op_unknown", store, runs, manager),
    { ok: false, code: "unknown_run" },
  );

  const agent = runs.startRun({
    kind: "local_agent",
    source: "codex",
    sourceRunId: "agt_stop_test",
    workspaceId: "workspace-stop",
    title: "Non-stoppable agent",
    state: "running",
  });
  assert.equal(agent.ok, true);
  if (!agent.ok) throw new Error("Expected local-agent run.");
  assert.deepEqual(
    requestOperationStop(agent.value.id, store, runs, manager),
    { ok: false, code: "not_stoppable" },
  );

  const second = await manager.start({
    workspaceId: "workspace-stop",
    cwd: root,
    command: `${JSON.stringify(process.execPath)} -e "setInterval(() => {}, 1000)"`,
    yieldTimeMs: 5,
  });
  const secondRun = store.findRunBySource(
    "process_session",
    "mcp",
    `process:${second.sessionId}`,
  );
  assert.ok(secondRun);
  const nonCanonical = runs.startRun({
    kind: "process_session",
    source: "codex",
    sourceRunId: `process:${second.sessionId}`,
    workspaceId: "workspace-stop",
    title: "Non-canonical process reference",
    state: "running",
  });
  assert.equal(nonCanonical.ok, true);
  if (!nonCanonical.ok) throw new Error("Expected non-canonical process run.");
  const callsBeforeNonCanonical = terminateCalls;
  assert.deepEqual(
    requestOperationStop(nonCanonical.value.id, store, runs, countingOwner),
    { ok: false, code: "not_stoppable" },
  );
  assert.equal(terminateCalls, callsBeforeNonCanonical);

  const failed = requestOperationStop(secondRun.id, store, runs, {
    terminate: () => {
      throw new Error("Injected stop failure.");
    },
  });
  assert.deepEqual(failed, {
    ok: false,
    code: "stop_failed",
    runId: secondRun.id,
  });
  assert.equal(store.getRun(secondRun.id)?.state, "running");
  manager.terminate("workspace-stop", second.sessionId!);
  await waitFor(() => store.getRun(secondRun.id)?.state === "stopped");
} finally {
  manager?.shutdown();
  store.close();
  await rm(root, { recursive: true, force: true });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for operation state.");
}

console.log("operation stop tests passed");
