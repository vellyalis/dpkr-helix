import assert from "node:assert/strict";
import type { StoredOperationEvent, StoredOperationRun } from "../operations/operation-store.js";
import {
  agentOutputAvailable,
  agentOutputFromEvents,
  agentResultStateLabel,
  changedFilesFromEvents,
  countTerminalMatches,
  evidenceChecklist,
  filterRuns,
  formatRunDuration,
  groupActivityEvents,
  highlightTerminalSegments,
  nextActionForRun,
  RUN_QUEUE_ORDER,
  runGroup,
  runPresentation,
  sortRunsForRail,
  stoppableRelatedRun,
  summarizeRuns,
  terminalEntriesFromEvents,
  topLevelRuns,
  relatedRunIds,
} from "./runs-screen.js";

const runs = [
  run("completed", {
    state: "completed",
    assuranceStage: "verified",
    updatedAt: "2026-07-30T00:00:00Z",
  }),
  run("failed", {
    state: "failed",
    updatedAt: "2026-07-30T00:01:00Z",
  }),
  run("pending", {
    state: "completed",
    assuranceStage: "verification_pending",
    updatedAt: "2026-07-30T00:02:00Z",
  }),
  run("blocked", {
    state: "blocked",
    updatedAt: "2026-07-30T00:03:00Z",
  }),
  run("running", {
    state: "running",
    projectId: "project-a",
    source: "codex",
    updatedAt: "2026-07-30T00:04:00Z",
  }),
];

assert.deepEqual(sortRunsForRail(runs).map(({ id }) => id), [
  "running",
  "blocked",
  "failed",
  "pending",
  "completed",
]);
assert.deepEqual(RUN_QUEUE_ORDER, ["Now", "Action", "Review", "Archive"]);
assert.equal(runGroup(runs[2]!), "Review");
assert.equal(runGroup(runs[1]!), "Action");
assert.equal(runGroup(run("stopped-result", {
  state: "stopped",
  assuranceStage: "result_available",
})), "Archive");
assert.equal(nextActionForRun(run("stopped-result", {
  state: "stopped",
  assuranceStage: "result_available",
})), "No action required");
assert.deepEqual(runPresentation("completed", "verification_pending"), {
  label: "Result available — verification pending",
  tone: "warning",
});
assert.deepEqual(runPresentation("completed", "verified"), {
  label: "Verified",
  tone: "success",
});
assert.deepEqual(summarizeRuns(runs), {
  now: 1,
  action: 2,
  review: 1,
  archive: 1,
});
assert.equal(nextActionForRun(runs[1]!), "Inspect failure and retained evidence");
assert.equal(nextActionForRun(runs[2]!), "Review result and verification evidence");
assert.equal(nextActionForRun(runs[0]!), "No action required");
assert.equal(nextActionForRun(run("blocked-phase", {
  state: "blocked",
  phase: "waiting",
})), "Resolve the blocking condition");
assert.equal(nextActionForRun(run("reported", {
  state: "running",
  currentAction: "Read project state",
})), "Read project state");
assert.deepEqual(
  filterRuns(runs, {
    projectId: "project-a",
    source: "codex",
    kind: "",
    state: "running",
    assuranceStage: "",
    timeRange: "day",
  }, Date.parse("2026-07-30T00:05:00Z")).map(({ id }) => id),
  ["running"],
);
assert.equal(formatRunDuration(run("duration", {
  startedAt: "2026-07-30T00:00:00Z",
  finishedAt: "2026-07-30T01:02:03Z",
})), "1h 2m");

const events = [
  event(1, "process.output", { stream: "stdout", text: "one", truncated: false }),
  event(2, "process.output", { stream: "stdout", text: "two", truncated: false }),
  event(3, "process.output", { stream: "stderr", text: "three", truncated: false }),
  event(4, "file.changed", { relativePath: "src/a.ts", operation: "update" }),
  event(5, "file.changed", { relativePath: "src/a.ts", operation: "update" }),
];
const groups = groupActivityEvents(events);
assert.equal(groups.length, 4);
assert.deepEqual(
  {
    count: groups[0]?.count,
    firstSequence: groups[0]?.firstSequence,
    lastSequence: groups[0]?.lastSequence,
  },
  { count: 2, firstSequence: 1, lastSequence: 2 },
);
assert.deepEqual(changedFilesFromEvents(events), ["src/a.ts"]);

const checklist = evidenceChecklist([
  {
    type: "tests",
    state: "passed",
    timestamp: "2026-07-30T00:00:00Z",
    sourceEventSequence: 12,
    summary: "Focused tests passed.",
  },
  {
    type: "review",
    state: "failed",
    summary: "One blocking finding remains.",
  },
]);
assert.deepEqual(checklist.map(({ type, state }) => [type, state]), [
  ["typecheck", "not_run"],
  ["tests", "passed"],
  ["build", "not_run"],
  ["review", "failed"],
  ["goal_state", "not_run"],
]);
assert.equal(checklist[1]?.sourceLabel, "Operation event 12");
assert.match(checklist[0]?.missingRequirement ?? "", /typecheck/i);
assert.match(checklist[3]?.missingRequirement ?? "", /did not pass/i);

const terminalEntries = terminalEntriesFromEvents([
  event(1, "process.output", {
    stream: "stdout",
    text: "\u001b[31mred\u001b[0m \u001b]0;hidden title\u0007plain\u0000\r\n",
    truncated: false,
  }),
  event(2, "process.output", {
    stream: "stderr",
    text: "\u001b[1;33mwarning",
    truncated: true,
  }),
  event(3, "process.output", {
    stream: "stderr",
    text: " continues\u001b[0m",
    truncated: false,
  }),
]);
assert.equal(terminalEntries.length, 3);
assert.equal(terminalEntries[0]?.plainText, "red plain\n");
assert.equal(terminalEntries[0]?.plainText.includes("\u001b"), false);
assert.equal(terminalEntries[0]?.segments[0]?.style.foreground, "red");
assert.equal(terminalEntries[0]?.segments[1]?.style.foreground, undefined);
assert.deepEqual(
  {
    foreground: terminalEntries[1]?.segments[0]?.style.foreground,
    bold: terminalEntries[1]?.segments[0]?.style.bold,
    carriesAcrossEvents: terminalEntries[2]?.segments[0]?.style.foreground,
  },
  { foreground: "yellow", bold: true, carriesAcrossEvents: "yellow" },
);
assert.equal(terminalEntries[1]?.truncated, true);
assert.equal(countTerminalMatches(terminalEntries, "plain"), 1);

const mcpTerminalEntries = terminalEntriesFromEvents([
  event(5, "tool.started", { toolName: "read" }),
  event(6, "file.read", { relativePath: "src/index.ts" }),
  event(7, "tool.completed", { toolName: "read", durationMs: 4 }),
  event(8, "file.changed", {
    relativePath: "src/index.ts",
    operation: "update",
  }),
  event(9, "process.started", { sessionId: 12, tty: false }),
  event(10, "process.exited", { exitCode: 0, wallTimeMs: 18 }),
]);
assert.deepEqual(
  mcpTerminalEntries.map(({ stream, plainText }) => [stream, plainText]),
  [
    ["mcp", "> read\n"],
    ["file", "[read] src/index.ts\n"],
    ["mcp", "[ok] read 4ms\n"],
    ["file", "[update] src/index.ts\n"],
    ["process", "$ process 12 started\n"],
    ["process", "[exit 0] 18ms\n"],
  ],
);

const c1TerminalEntries = terminalEntriesFromEvents([
  event(1, "process.output", {
    stream: "stdout",
    text: "\u009b32mgreen\u009b0m \u009d0;hidden title\u009csafe",
    truncated: false,
  }),
]);
assert.equal(c1TerminalEntries[0]?.plainText, "green safe");
assert.equal(c1TerminalEntries[0]?.segments[0]?.style.foreground, "green");
assert.equal(c1TerminalEntries[0]?.plainText.includes("hidden title"), false);

const highlighted = highlightTerminalSegments([
  {
    text: "ab",
    style: {
      foreground: "red",
      bold: false,
      dim: false,
      italic: false,
      underline: false,
      inverse: false,
    },
  },
  {
    text: "cd",
    style: {
      foreground: "green",
      bold: false,
      dim: false,
      italic: false,
      underline: false,
      inverse: false,
    },
  },
], "bc");
assert.equal(highlighted.filter(({ matched }) => matched).map(({ text }) => text).join(""), "bc");
assert.deepEqual(
  highlighted.filter(({ matched }) => matched).map(({ style }) => style.foreground),
  ["red", "green"],
);

const agentOutput = agentOutputFromEvents([
  event(0, "agent.message", {
    agentId: "agent-1",
    role: "system",
    text: "Never expose this system content.",
    truncated: false,
  }),
  event(1, "agent.message", {
    agentId: "agent-1",
    role: "assistant",
    text: "Working safely.",
    truncated: false,
  }),
  event(2, "agent.result_available", {
    agentId: "agent-1",
    text: "Result text.",
    truncated: true,
  }),
]);
assert.equal(agentOutput.hasOutput, true);
assert.equal(agentOutput.agentId, "agent-1");
assert.deepEqual(agentOutput.messages.map(({ text }) => text), ["Working safely."]);
assert.equal(agentOutput.messages.some(({ text }) => text.includes("system content")), false);
assert.equal(agentOutput.finalResponse?.text, "Result text.");
assert.equal(agentOutput.truncated, true);
assert.equal(agentOutputAvailable(run("agent-result", {
  kind: "local_agent",
  state: "completed",
}), agentOutput), true);
assert.equal(agentOutputAvailable(run("agent-failure", {
  kind: "local_agent",
  state: "failed",
}), agentOutputFromEvents([])), true);
assert.equal(agentOutputAvailable(run("mcp-failure", {
  kind: "mcp_tool",
  state: "failed",
}), agentOutputFromEvents([])), false);
assert.equal(agentResultStateLabel(run("agent-result", {
  kind: "local_agent",
  state: "completed",
}), agentOutput), "Result available");
assert.equal(agentResultStateLabel(run("agent-failure", {
  kind: "local_agent",
  state: "failed",
}), agentOutputFromEvents([])), "Provider failed");

const mcpSessionRun = run("mcp-session", {
  sourceRunId: "mcp-session:test-session",
});
const childProcessRun = run("child-process", {
  kind: "process_session",
  parentRunId: mcpSessionRun.id,
});
const orphanProcessRun = run("orphan-process", {
  kind: "process_session",
  parentRunId: "missing-parent",
});
const nestedRuns = [mcpSessionRun, childProcessRun, orphanProcessRun];
assert.deepEqual(topLevelRuns(nestedRuns).map(({ id }) => id), [
  "mcp-session",
  "orphan-process",
]);
assert.deepEqual(relatedRunIds(nestedRuns, mcpSessionRun.id), [
  "mcp-session",
  "child-process",
]);
assert.deepEqual(relatedRunIds(nestedRuns, childProcessRun.id), [
  "mcp-session",
  "child-process",
]);
assert.equal(stoppableRelatedRun(nestedRuns, mcpSessionRun.id), undefined);
const stoppableChildRun = {
  ...childProcessRun,
  state: "running" as const,
  stoppable: true,
};
const stoppableNestedRuns = [mcpSessionRun, stoppableChildRun, orphanProcessRun];
assert.equal(
  stoppableRelatedRun(stoppableNestedRuns, mcpSessionRun.id)?.id,
  "child-process",
);
assert.equal(
  stoppableRelatedRun(stoppableNestedRuns, stoppableChildRun.id)?.id,
  "child-process",
);
assert.equal(
  stoppableRelatedRun([
    mcpSessionRun,
    { ...stoppableChildRun, state: "stopped" as const },
    orphanProcessRun,
  ], mcpSessionRun.id),
  undefined,
);

console.log("runs screen tests passed");

function run(id: string, patch: Partial<StoredOperationRun> = {}): StoredOperationRun {
  return {
    id,
    kind: "mcp_tool",
    source: "mcp",
    title: id,
    state: "queued",
    assuranceStage: "working",
    startedAt: "2026-07-30T00:00:00Z",
    updatedAt: "2026-07-30T00:00:00Z",
    stoppable: false,
    latestSequence: 0,
    retainedEventCount: 0,
    retainedPayloadBytes: 0,
    historyTruncated: false,
    ...patch,
  };
}

function event(
  sequence: number,
  type: StoredOperationEvent["type"],
  payload: StoredOperationEvent["payload"],
): StoredOperationEvent {
  return {
    runId: "running",
    cursor: sequence,
    sequence,
    type,
    timestamp: "2026-07-30T00:00:00Z",
    level: "info",
    summary: type,
    payload,
    payloadBytes: 1,
  } as StoredOperationEvent;
}
