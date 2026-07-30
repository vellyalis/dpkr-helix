import type { Request, Response, Router } from "express";
import type { OperationEventBus } from "../operations/operation-event-bus.js";
import type {
  OperationStore,
  StoredOperationEvent,
} from "../operations/operation-store.js";
import type {
  OperationStopFailureCode,
  OperationStopResult,
} from "../operations/operation-stop.js";
import {
  readRepositoryDiffSummary,
  readRepositoryFileDiff,
} from "../operations/repository-diff.js";

const DEFAULT_READ_LIMIT = 100;
const MAX_READ_LIMIT = 1_000;
const SSE_CATCHUP_LIMIT = 1_000;
const SSE_POLL_INTERVAL_MS = 1_000;
const MAX_SSE_CLIENTS = 16;

type OperationReadStore = Pick<
  OperationStore,
  | "getCursorRange"
  | "getEvidence"
  | "getRun"
  | "listEvents"
  | "listEventsAfterCursor"
  | "listRuns"
  | "limits"
>;

export interface OperationRouteOptions {
  store: OperationReadStore;
  eventBus: OperationEventBus;
  onSlowConsumer?: (cursor: number) => void;
  pollIntervalMs?: number;
  requestStop: (runId: string) => OperationStopResult;
  resolveWorkspaceRoot?: (workspaceId: string) => string | undefined;
  onStopAudit?: (event: OperationStopAuditEvent) => void;
}

export type OperationStopAuditEvent =
  | { outcome: "requested"; runId: string }
  | { outcome: "failed"; runId: string; code: "stop_failed" }
  | { outcome: "rejected"; code: OperationStopFailureCode };

export interface OperationRouteController {
  close(): void;
}

export function registerOperationRoutes(
  router: Router,
  requireRead: (req: Request, res: Response, next: () => void) => void,
  requireMutation: (req: Request, res: Response, next: () => void) => void,
  options: OperationRouteOptions,
): OperationRouteController {
  const clients = new Set<() => void>();

  router.get("/api/operations/runs", requireRead, (req, res) => {
    const limit = readLimit(req.query.limit);
    const projectId = singleString(req.query.projectId);
    const cursor = options.store.getCursorRange().latest;
    res.setHeader("cache-control", "no-store");
    res.json({
      ok: true,
      data: {
        runs: options.store.listRuns({ projectId, limit }),
        cursor,
      },
    });
  });

  router.get("/api/operations/runs/:runId", requireRead, (req, res) => {
    const runId = routeParam(req.params.runId);
    const cursor = options.store.getCursorRange().latest;
    const run = options.store.getRun(runId);
    if (!run) {
      res.status(404).json(operationError("OPERATION_RUN_UNKNOWN", "Operation run not found."));
      return;
    }
    res.setHeader("cache-control", "no-store");
    res.json({
      ok: true,
      data: {
        run,
        evidence: options.store.getEvidence(runId),
        cursor,
      },
    });
  });

  router.get("/api/operations/runs/:runId/events", requireRead, (req, res) => {
    const runId = routeParam(req.params.runId);
    const run = options.store.getRun(runId);
    if (!run) {
      res.status(404).json(operationError("OPERATION_RUN_UNKNOWN", "Operation run not found."));
      return;
    }
    const afterSequence = nonNegativeInteger(req.query.after, "after", 0);
    const events = options.store.listEvents(runId, {
      afterSequence,
      limit: readLimit(req.query.limit),
    });
    const firstRetainedSequence = options.store.listEvents(runId, { limit: 1 })[0]?.sequence;
    res.setHeader("cache-control", "no-store");
    res.json({
      ok: true,
      data: {
        events,
        afterSequence,
        nextSequence: events.at(-1)?.sequence ?? afterSequence,
        historyTruncated: run.historyTruncated,
        requiresSnapshot:
          run.historyTruncated &&
          firstRetainedSequence !== undefined &&
          afterSequence < firstRetainedSequence - 1,
      },
    });
  });

  router.get(
    "/api/operations/runs/:runId/repository-diff",
    requireRead,
    async (req, res) => {
      const context = repositoryContext(req, res, options);
      if (!context) return;
      res.setHeader("cache-control", "no-store");
      res.json({
        ok: true,
        data: await readRepositoryDiffSummary(context.workspaceRoot),
      });
    },
  );

  router.get(
    "/api/operations/runs/:runId/repository-diff/file",
    requireRead,
    async (req, res) => {
      const context = repositoryContext(req, res, options);
      if (!context) return;
      const path = singleString(req.query.path);
      if (!path) {
        res.status(400).json(operationError(
          "OPERATION_DIFF_PATH_REQUIRED",
          "A changed repository path is required.",
        ));
        return;
      }
      res.setHeader("cache-control", "no-store");
      res.json({
        ok: true,
        data: await readRepositoryFileDiff(context.workspaceRoot, path),
      });
    },
  );

  router.post("/api/operations/runs/:runId/stop", requireMutation, (req, res) => {
    const runId = routeParam(req.params.runId);
    if (!isEmptyJsonObject(req.body)) {
      res.status(400).json(operationError(
        "OPERATION_STOP_INPUT_NOT_ALLOWED",
        "Stop accepts an empty JSON object only.",
      ));
      return;
    }
    const result = options.requestStop(runId);
    if (!result.ok) {
      auditStop(
        options,
        result.code === "stop_failed" && result.runId
          ? { outcome: "failed", runId: result.runId, code: result.code }
          : { outcome: "rejected", code: result.code },
      );
      const mapped = stopFailure(result.code);
      res.status(mapped.status).json(operationError(mapped.code, mapped.message));
      return;
    }
    auditStop(options, { outcome: "requested", runId: result.run.id });
    res.setHeader("cache-control", "no-store");
    res.status(202).json({
      ok: true,
      data: {
        stopRequested: true,
        run: result.run,
        message: "Stop ends the active worker. It does not revert repository changes.",
      },
    });
  });

  router.get("/api/operations/stream", requireRead, (req, res) => {
    if (clients.size >= MAX_SSE_CLIENTS) {
      res.setHeader("retry-after", "1");
      res.status(503).json(operationError(
        "OPERATION_STREAM_CAPACITY",
        "Operation stream capacity reached. Reconnect from the last cursor.",
      ));
      return;
    }
    const headerCursor = optionalNonNegativeInteger(req.header("last-event-id"), "Last-Event-ID");
    const queryCursor = optionalNonNegativeInteger(req.query.after, "after");
    let deliveredCursor = headerCursor ?? queryCursor ?? 0;
    const range = options.store.getCursorRange();

    res.status(200);
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.setHeader("connection", "keep-alive");
    res.flushHeaders();

    let closed = false;
    let polling = false;
    let unsubscribe: () => void = () => undefined;
    let timer: NodeJS.Timeout | undefined;

    const close = () => {
      if (closed) return;
      closed = true;
      unsubscribe();
      if (timer) clearInterval(timer);
      clients.delete(close);
      if (!res.writableEnded) res.end();
    };
    clients.add(close);
    req.on("close", close);

    const write = (event: string, cursor: number, data: unknown): boolean => {
      if (closed || res.writableEnded) return false;
      let accepted: boolean;
      try {
        accepted = res.write(
          `id: ${cursor}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
        );
      } catch {
        close();
        return false;
      }
      if (!accepted) {
        try {
          options.onSlowConsumer?.(deliveredCursor);
        } catch {
          // Diagnostics must not keep a backpressured client connected.
        } finally {
          close();
        }
        return false;
      }
      return true;
    };

    const deliver = (event: StoredOperationEvent): void => {
      if (event.cursor <= deliveredCursor) return;
      if (write("operation", event.cursor, event)) deliveredCursor = event.cursor;
    };

    const catchUp = (): void => {
      if (closed || polling) return;
      polling = true;
      try {
        const events = options.store.listEventsAfterCursor(
          deliveredCursor,
          SSE_CATCHUP_LIMIT + 1,
        );
        if (events[0] && events[0].cursor > deliveredCursor + 1) {
          resetAndClose("history_unavailable");
          return;
        }
        if (events.length > SSE_CATCHUP_LIMIT) {
          resetAndClose("catchup_limit_exceeded");
          return;
        }
        for (const event of events) {
          deliver(event);
          if (closed) return;
        }
      } catch {
        resetAndClose("store_unavailable");
      } finally {
        polling = false;
      }
    };

    const resetAndClose = (
      reason: "catchup_limit_exceeded" | "history_unavailable" | "store_unavailable",
    ): void => {
      let latest = deliveredCursor;
      try {
        latest = options.store.getCursorRange().latest;
      } catch {
        // The acknowledged cursor remains the only safe recovery point.
      }
      write("reset", latest, { reason, cursor: latest });
      close();
    };

    if (
      deliveredCursor > range.latest ||
      (range.oldest !== undefined && deliveredCursor < range.oldest - 1)
    ) {
      resetAndClose("history_unavailable");
      return;
    }

    unsubscribe = options.eventBus.subscribe(() => {
      catchUp();
    });
    catchUp();
    if (closed) return;
    write("ready", deliveredCursor, { cursor: deliveredCursor });
    timer = setInterval(catchUp, options.pollIntervalMs ?? SSE_POLL_INTERVAL_MS);
    timer.unref();
  });

  return {
    close: () => {
      for (const close of [...clients]) close();
    },
  };
}

function readLimit(value: unknown): number {
  return Math.min(nonNegativeInteger(value, "limit", DEFAULT_READ_LIMIT) || DEFAULT_READ_LIMIT, MAX_READ_LIMIT);
}

function optionalNonNegativeInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  return nonNegativeInteger(value, name, 0);
}

function nonNegativeInteger(value: unknown, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const text = Array.isArray(value) ? undefined : String(value);
  if (!text || !/^\d+$/.test(text)) throw new OperationRouteError(`${name} must be a non-negative integer.`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) throw new OperationRouteError(`${name} is out of range.`);
  return parsed;
}

function singleString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function repositoryContext(
  req: Request,
  res: Response,
  options: OperationRouteOptions,
): { workspaceRoot: string } | undefined {
  const runId = routeParam(req.params.runId);
  const run = options.store.getRun(runId);
  if (!run) {
    res.status(404).json(operationError(
      "OPERATION_RUN_UNKNOWN",
      "Operation run not found.",
    ));
    return undefined;
  }
  if (!run.workspaceId) {
    res.status(409).json(operationError(
      "OPERATION_REPOSITORY_UNAVAILABLE",
      "This run is not linked to a workspace.",
    ));
    return undefined;
  }
  let workspaceRoot: string | undefined;
  try {
    workspaceRoot = options.resolveWorkspaceRoot?.(run.workspaceId);
  } catch {
    // The route reports the current unavailable state without leaking a path.
  }
  if (!workspaceRoot) {
    res.status(409).json(operationError(
      "OPERATION_REPOSITORY_UNAVAILABLE",
      "The run workspace is currently unavailable.",
    ));
    return undefined;
  }
  return { workspaceRoot };
}

function routeParam(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !value) throw new OperationRouteError("runId is required.");
  return value;
}

function isEmptyJsonObject(value: unknown): boolean {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value).length === 0
  );
}

function stopFailure(code: OperationStopFailureCode): {
  status: number;
  code: string;
  message: string;
} {
  switch (code) {
    case "unknown_run":
      return { status: 404, code: "OPERATION_RUN_UNKNOWN", message: "Operation run not found." };
    case "not_stoppable":
      return { status: 409, code: "OPERATION_NOT_STOPPABLE", message: "Operation is not stoppable." };
    case "owner_unavailable":
      return { status: 409, code: "OPERATION_OWNER_UNAVAILABLE", message: "Operation owner is unavailable." };
    default:
      return { status: 500, code: "OPERATION_STOP_FAILED", message: "Operation stop failed." };
  }
}

function auditStop(
  options: OperationRouteOptions,
  event: OperationStopAuditEvent,
): void {
  try {
    options.onStopAudit?.(event);
  } catch {
    // Audit diagnostics must not change the canonical stop result.
  }
}

export class OperationRouteError extends Error {}

function operationError(code: string, message: string) {
  return { ok: false, error: { code, message } };
}
