import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { databasePath } from "../db/client.js";
import { OperationStore } from "./operation-store.js";

const stateDir = await mkdtemp(join(tmpdir(), "devspace-operation-store-test-"));
const stores: OperationStore[] = [];

try {
  const limits = {
    maxEventsPerRun: 3,
    maxEventPayloadBytes: 160,
    maxPayloadBytesPerRun: 220,
    maxTextBytes: 256,
    completedRunRetention: 2,
    detailedCompletedRunRetention: 1,
  };
  const store = new OperationStore(stateDir, limits);
  stores.push(store);
  const run = store.createRun({
    kind: "process_session",
    source: "mcp",
    sourceRunId: "process:42",
    title: "Build project",
    state: "running",
    assuranceStage: "working",
    stoppable: true,
  });
  assert.match(run.id, /^op_[a-f0-9]{32}$/);
  const reusedEphemeralSource = store.createRun({
    kind: "process_session",
    source: "mcp",
    sourceRunId: "process:ephemeral",
    title: "First process incarnation",
  });
  assert.notEqual(
    store.createRun({
      kind: "process_session",
      source: "mcp",
      sourceRunId: "process:ephemeral",
      title: "Second process incarnation",
    }).id,
    reusedEphemeralSource.id,
  );
  const olderAgentTurn = store.createRun({
    kind: "local_agent",
    source: "codex",
    sourceRunId: "agt_resume_tie",
    title: "Older agent turn",
  });
  const newerAgentTurn = store.createRun({
    kind: "local_agent",
    source: "codex",
    sourceRunId: "agt_resume_tie",
    title: "Newer agent turn",
  });
  const tieBreakerDatabase = new Database(databasePath(stateDir));
  tieBreakerDatabase
    .prepare(
      "update operation_runs set updated_at = ? where id in (?, ?)",
    )
    .run(
      "2026-07-29T00:00:00.000Z",
      olderAgentTurn.id,
      newerAgentTurn.id,
    );
  tieBreakerDatabase.close();
  const tieBreakerReader = new OperationStore(stateDir, limits);
  assert.equal(
    tieBreakerReader.findRunBySource(
      "local_agent",
      "codex",
      "agt_resume_tie",
    )?.id,
    newerAgentTurn.id,
  );
  tieBreakerReader.close();
  assert.throws(
    () =>
      store.createRun({
        kind: "local_agent",
        source: "codex",
        sourceRunId: "Bearer abcdefghijklmnopqrstuvwxyz",
        title: "Unsafe owner reference",
      }),
    /forbidden secret-like/i,
  );

  const first = store.appendEvent(run.id, {
    type: "process.started",
    timestamp: "2026-07-29T00:00:01.000Z",
    level: "info",
    summary: "Process started.",
    payload: { sessionId: 42, tty: false },
  });
  const second = store.appendEvent(
    run.id,
    {
      type: "process.output",
      timestamp: "2026-07-29T00:00:02.000Z",
      level: "info",
      summary: "Output received.",
      payload: { stream: "stdout", text: "a".repeat(200), truncated: false },
    },
    { currentAction: "Running build" },
  );
  assert.equal(first.event.sequence, 1);
  assert.equal(second.event.sequence, 2);
  assert.ok(second.event.cursor > first.event.cursor);
  assert.equal(second.payloadTruncated, true);
  assert.equal(second.event.type, "warning");
  assert.deepEqual(second.event.payload, { code: "operation_event_payload_truncated" });
  assert.equal(store.getRun(run.id)?.currentAction, "Running build");

  store.appendEvent(run.id, {
    type: "tool.completed",
    timestamp: "2026-07-29T00:00:03.000Z",
    level: "info",
    summary: "First step completed.",
    payload: { toolName: "build" },
  });
  const fourth = store.appendEvent(run.id, {
    type: "verification.started",
    timestamp: "2026-07-29T00:00:04.000Z",
    level: "info",
    summary: "Tests started.",
    payload: { type: "tests" },
  });
  assert.equal(fourth.event.sequence, 4);
  assert.equal(fourth.historyTruncated, true);
  assert.deepEqual(
    store.listEvents(run.id).map((event) => event.sequence),
    [2, 3, 4],
  );
  assert.deepEqual(
    store.listEvents(run.id, { afterSequence: 2 }).map((event) => event.sequence),
    [3, 4],
  );
  assert.ok((store.getRun(run.id)?.retainedPayloadBytes ?? Infinity) <= 220);
  assert.equal(store.getRun(run.id)?.historyTruncated, true);

  const failureInjector = new Database(databasePath(stateDir));
  failureInjector.exec(`
    create trigger operation_store_test_abort
    before update on operation_runs
    when new.current_action = 'force rollback'
    begin
      select raise(abort, 'forced projection failure');
    end;
  `);
  failureInjector.close();
  assert.throws(
    () =>
      store.appendEvent(
        run.id,
        {
          type: "tool.completed",
          timestamp: "2026-07-29T00:00:04.500Z",
          level: "info",
          summary: "This event must roll back.",
          payload: { toolName: "rollback-proof" },
        },
        { currentAction: "force rollback" },
      ),
    /forced projection failure/,
  );
  assert.equal(store.getRun(run.id)?.latestSequence, 4);
  assert.deepEqual(
    store.listEvents(run.id).map((event) => event.sequence),
    [2, 3, 4],
  );
  const triggerCleanup = new Database(databasePath(stateDir));
  triggerCleanup.exec("drop trigger operation_store_test_abort");
  triggerCleanup.close();

  const evidence = store.upsertEvidence(run.id, {
    type: "tests",
    state: "running",
    timestamp: "2026-07-29T00:00:04.000Z",
    sourceEventSequence: 4,
    summary: "Focused tests are running.",
  });
  assert.equal(evidence.state, "running");
  assert.equal(
    store.upsertEvidence(run.id, {
      type: "tests",
      state: "passed",
      timestamp: "2026-07-29T00:00:05.000Z",
      sourceEventSequence: 4,
      summary: "Focused tests passed.",
      basisFingerprint: "1".repeat(40),
    }).state,
    "passed",
  );
  assert.deepEqual(store.getEvidence(run.id).map((item) => item.state), ["passed"]);
  assert.throws(
    () =>
      store.upsertEvidence(run.id, {
        type: "build",
        state: "passed",
        sourceEventSequence: 99,
      }),
    /has not been allocated/,
  );
  assert.throws(
    () =>
      store.appendEvent(run.id, {
        type: "agent.message",
        timestamp: "2026-07-29T00:00:06.000Z",
        level: "info",
        summary: "Provider message.",
        payload: {
          agentId: "agt_1",
          role: "assistant",
          text: "Bearer abcdefghijklmnopqrstuvwxyz",
          truncated: false,
        },
      }),
    /forbidden secret-like/i,
  );
  assert.equal(store.getRun(run.id)?.latestSequence, 4);

  const secondConnection = new OperationStore(stateDir, limits);
  stores.push(secondConnection);
  const crossConnection = secondConnection.appendEvent(run.id, {
    type: "verification.completed",
    timestamp: "2026-07-29T00:00:07.000Z",
    level: "info",
    summary: "Tests passed.",
    payload: { type: "tests", state: "passed" },
  });
  assert.equal(crossConnection.event.sequence, 5);
  assert.ok(crossConnection.event.cursor > fourth.event.cursor);
  assert.deepEqual(
    secondConnection
      .listEventsAfterCursor(fourth.event.cursor)
      .map((event) => [event.runId, event.sequence]),
    [[run.id, 5]],
  );
  secondConnection.close();
  stores.pop();
  store.close();
  stores.pop();

  const reopened = new OperationStore(stateDir, limits);
  stores.push(reopened);
  assert.equal(
    reopened.findRunBySource("process_session", "mcp", "process:42")?.id,
    run.id,
  );
  assert.deepEqual(
    reopened.listEvents(run.id).map((event) => event.sequence),
    [3, 4, 5],
  );
  assert.equal(reopened.getEvidence(run.id)[0]?.state, "passed");
  assert.equal(reopened.getEvidence(run.id)[0]?.basisFingerprint, "1".repeat(40));

  const completed = (id: string, second: number) => {
    const created = reopened.createRun({
      id,
      kind: "mcp_tool",
      source: "mcp",
      title: id,
      startedAt: `2026-07-29T00:01:0${second}.000Z`,
      state: "running",
    });
    reopened.appendEvent(created.id, {
      type: "tool.completed",
      timestamp: `2026-07-29T00:01:0${second}.000Z`,
      level: "info",
      summary: `${id} completed.`,
      payload: { toolName: "read" },
    });
    return reopened.updateRun(created.id, {
      state: "completed",
      assuranceStage: "not_applicable",
      finishedAt: `2026-07-29T00:01:0${second}.000Z`,
    });
  };
  completed("op_completed_1", 1);
  completed("op_completed_2", 2);
  completed("op_completed_3", 3);

  assert.equal(reopened.getRun("op_completed_1"), undefined);
  assert.equal(reopened.getRun("op_completed_2")?.historyTruncated, true);
  assert.deepEqual(reopened.listEvents("op_completed_2"), []);
  assert.deepEqual(
    reopened.listEvents("op_completed_3").map((event) => event.sequence),
    [1],
  );
  assert.equal(reopened.getRun(run.id)?.state, "running");
  const directlyCompleted = reopened.createRun({
    id: "op_completed_direct",
    kind: "mcp_tool",
    source: "mcp",
    title: "Direct terminal creation",
    state: "completed",
    assuranceStage: "not_applicable",
  });
  assert.equal(directlyCompleted.state, "completed");
  assert.equal(reopened.getRun("op_completed_2"), undefined);
  assert.equal(reopened.getRun("op_completed_direct")?.state, "completed");
  reopened.close();
  stores.pop();

  assert.throws(
    () =>
      new OperationStore(stateDir, {
        maxEventPayloadBytes: 1_024,
        maxPayloadBytesPerRun: 512,
      }),
    /maxPayloadBytesPerRun/,
  );
} finally {
  for (const store of stores) store.close();
  await rm(stateDir, { recursive: true, force: true });
}
