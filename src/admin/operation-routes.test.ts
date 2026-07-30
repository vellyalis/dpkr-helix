import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { OperationEventBus } from "../operations/operation-event-bus.js";
import type {
  StoredOperationEvent,
  StoredOperationRun,
} from "../operations/operation-store.js";
import { DEFAULT_OPERATION_STORE_LIMITS } from "../operations/operation-store.js";
import type { OperationStopResult } from "../operations/operation-stop.js";
import { registerOperationRoutes } from "./operation-routes.js";

type Handler = (req: any, res: any, next?: () => void) => unknown;
const handlers = new Map<string, Handler>();
const router = {
  get(path: string, _auth: Handler, handler: Handler) {
    handlers.set(path, handler);
  },
  post(path: string, _auth: Handler, handler: Handler) {
    handlers.set(path, handler);
  },
};
const bus = new OperationEventBus();
const storedEvents: StoredOperationEvent[] = [];
let currentRun: StoredOperationRun | undefined;
let slowCursor: number | undefined;
let stopCalls = 0;
let stopResult: OperationStopResult = { ok: false, code: "not_stoppable" };
const stopAudits: unknown[] = [];
const controller = registerOperationRoutes(
  router as any,
  (_req, _res, next) => next(),
  (_req, _res, next) => next(),
  {
    store: {
      limits: DEFAULT_OPERATION_STORE_LIMITS,
      getCursorRange: () => ({ latest: 0 }),
      getEvidence: () => [],
      getRun: () => currentRun,
      listEvents: () => [],
      listEventsAfterCursor: (cursor) => storedEvents.filter((event) => event.cursor > cursor),
      listRuns: () => [],
    },
    eventBus: bus,
    onSlowConsumer: (cursor) => {
      slowCursor = cursor;
    },
    pollIntervalMs: 60_000,
    requestStop: () => {
      stopCalls += 1;
      return stopResult;
    },
    resolveWorkspaceRoot: () => process.cwd(),
    onStopAudit: (event) => {
      stopAudits.push(event);
      throw new Error("Injected audit failure.");
    },
  },
);

const request = Object.assign(new EventEmitter(), {
  query: { after: "0" },
  header: () => undefined,
});
const writes: string[] = [];
let ended = false;
const response = {
  writableEnded: false,
  status() {
    return this;
  },
  setHeader() {},
  flushHeaders() {},
  write(value: string) {
    writes.push(value);
    return !value.includes("event: operation");
  },
  end() {
    ended = true;
    this.writableEnded = true;
  },
};

handlers.get("/api/operations/stream")?.(request, response);
assert.match(writes[0] ?? "", /event: ready/);
const backpressuredEvent = {
  cursor: 1,
  runId: "op_slow",
  sequence: 1,
  type: "warning",
  timestamp: new Date().toISOString(),
  level: "warning",
  summary: "Backpressure.",
  payload: { code: "backpressure" },
  payloadBytes: 2,
} satisfies StoredOperationEvent;
storedEvents.push(backpressuredEvent);
bus.publish(backpressuredEvent);
assert.equal(ended, true);
assert.equal(slowCursor, 0);

let stopStatus = 0;
let stopBody: unknown;
const stopResponse = {
  status(value: number) {
    stopStatus = value;
    return this;
  },
  json(value: unknown) {
    stopBody = value;
    return this;
  },
  setHeader() {},
};
handlers.get("/api/operations/runs/:runId/stop")?.(
  { params: { runId: "op_stop" }, body: { pid: 1234 } },
  stopResponse,
);
assert.equal(stopStatus, 400);
assert.equal(stopCalls, 0);
handlers.get("/api/operations/runs/:runId/stop")?.(
  { params: { runId: "op_stop" }, body: {} },
  stopResponse,
);
assert.equal(stopStatus, 409);
assert.deepEqual(stopBody, {
  ok: false,
  error: {
    code: "OPERATION_NOT_STOPPABLE",
    message: "Operation is not stoppable.",
  },
});
assert.equal(stopCalls, 1);
assert.deepEqual(stopAudits, [{ outcome: "rejected", code: "not_stoppable" }]);

stopResult = { ok: false, code: "stop_failed", runId: "op_stop" };
handlers.get("/api/operations/runs/:runId/stop")?.(
  { params: { runId: "op_stop" }, body: {} },
  stopResponse,
);
assert.equal(stopStatus, 500);
assert.deepEqual(stopAudits.at(-1), {
  outcome: "failed",
  runId: "op_stop",
  code: "stop_failed",
});

let repositoryStatus = 0;
let repositoryBody: any;
const repositoryResponse = {
  status(value: number) {
    repositoryStatus = value;
    return this;
  },
  json(value: unknown) {
    repositoryBody = value;
    return this;
  },
  setHeader() {},
};
await handlers.get("/api/operations/runs/:runId/repository-diff")?.(
  { params: { runId: "unknown" }, query: {} },
  repositoryResponse,
);
assert.equal(repositoryStatus, 404);
assert.equal(repositoryBody.error.code, "OPERATION_RUN_UNKNOWN");

currentRun = run("op_no_workspace");
await handlers.get("/api/operations/runs/:runId/repository-diff")?.(
  { params: { runId: currentRun.id }, query: {} },
  repositoryResponse,
);
assert.equal(repositoryStatus, 409);
assert.equal(repositoryBody.error.code, "OPERATION_REPOSITORY_UNAVAILABLE");

currentRun = run("op_missing_workspace", { workspaceId: "ws_missing" });
repositoryStatus = 200;
await handlers.get("/api/operations/runs/:runId/repository-diff/file")?.(
  { params: { runId: currentRun.id }, query: { path: "../secret" } },
  repositoryResponse,
);
assert.equal(repositoryStatus, 200);
assert.equal(repositoryBody.data.state, "unavailable");
assert.match(repositoryBody.data.message, /not in the current repository change set/i);

controller.close();
console.log("operation route tests passed");

function run(
  id: string,
  patch: Partial<StoredOperationRun> = {},
): StoredOperationRun {
  return {
    id,
    kind: "mcp_tool",
    source: "mcp",
    title: id,
    state: "completed",
    assuranceStage: "not_applicable",
    startedAt: "2026-07-30T00:00:00Z",
    updatedAt: "2026-07-30T00:00:00Z",
    finishedAt: "2026-07-30T00:00:01Z",
    stoppable: false,
    latestSequence: 0,
    retainedEventCount: 0,
    retainedPayloadBytes: 0,
    historyTruncated: false,
    ...patch,
  };
}
