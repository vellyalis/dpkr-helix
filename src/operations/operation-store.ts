import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { openDatabase, type DatabaseHandle } from "../db/client.js";
import { assertNoForbiddenSensitiveContent } from "../sensitive-content.js";
import type {
  EvidenceState,
  OperationAssuranceStage,
  OperationEvent,
  OperationEventLevel,
  OperationEventPayloadMap,
  OperationEventType,
  OperationEvidence,
  OperationRun,
  OperationRunKind,
  OperationRunState,
  OperationSource,
  VerificationType,
} from "./operation-contracts.js";

const TERMINAL_STATES = new Set<OperationRunState>(["stopped", "failed", "completed"]);
const RUN_KINDS = new Set<OperationRunKind>(["mcp_tool", "process_session", "local_agent"]);
const RUN_SOURCES = new Set<OperationSource>([
  "mcp",
  "codex",
  "claude",
  "opencode",
  "pi",
  "cursor",
  "copilot",
]);
const RUN_STATES = new Set<OperationRunState>([
  "queued",
  "running",
  "blocked",
  "stopping",
  "stopped",
  "failed",
  "completed",
]);
const ASSURANCE_STAGES = new Set<OperationAssuranceStage>([
  "working",
  "result_available",
  "verification_pending",
  "verifying",
  "verified",
  "not_applicable",
]);
const EVENT_LEVELS = new Set<OperationEventLevel>(["debug", "info", "warning", "error"]);
const EVENT_TYPES = new Set<OperationEventType>([
  "run.created",
  "run.state_changed",
  "workspace.opened",
  "tool.started",
  "tool.completed",
  "tool.failed",
  "file.read",
  "file.changed",
  "process.started",
  "process.output",
  "process.exited",
  "agent.status_changed",
  "agent.message",
  "agent.result_available",
  "verification.started",
  "verification.completed",
  "review.finding",
  "review.completed",
  "project_state.updated",
  "warning",
  "failure",
]);
const VERIFICATION_TYPES = new Set<VerificationType>([
  "typecheck",
  "tests",
  "build",
  "review",
  "goal_state",
]);
const EVIDENCE_STATES = new Set<EvidenceState>([
  "not_run",
  "running",
  "passed",
  "failed",
  "not_applicable",
]);

export interface OperationStoreLimits {
  maxEventsPerRun: number;
  maxEventPayloadBytes: number;
  maxPayloadBytesPerRun: number;
  maxTextBytes: number;
  completedRunRetention: number;
  detailedCompletedRunRetention: number;
}

export const DEFAULT_OPERATION_STORE_LIMITS: Readonly<OperationStoreLimits> = {
  maxEventsPerRun: 1_000,
  maxEventPayloadBytes: 64 * 1_024,
  maxPayloadBytesPerRun: 4 * 1_024 * 1_024,
  maxTextBytes: 16 * 1_024,
  completedRunRetention: 200,
  detailedCompletedRunRetention: 50,
};

export interface CreateOperationRunInput {
  id?: string;
  kind: OperationRunKind;
  source: OperationSource;
  sourceRunId?: string;
  parentRunId?: string;
  projectId?: string;
  workspaceId?: string;
  goalId?: string;
  title: string;
  state?: OperationRunState;
  assuranceStage?: OperationAssuranceStage;
  phase?: string;
  currentAction?: string;
  startedAt?: string;
  stoppable?: boolean;
}

export interface StoredOperationRun extends OperationRun {
  latestSequence: number;
  retainedEventCount: number;
  retainedPayloadBytes: number;
  historyTruncated: boolean;
}

export interface OperationRunListOptions {
  projectId?: string;
  limit?: number;
}

export interface OperationCursorRange {
  oldest?: number;
  latest: number;
}

export type OperationRunPatch = Partial<
  Pick<
    OperationRun,
    | "parentRunId"
    | "projectId"
    | "workspaceId"
    | "goalId"
    | "title"
    | "state"
    | "assuranceStage"
    | "phase"
    | "currentAction"
    | "finishedAt"
    | "stoppable"
    | "failureCode"
    | "failureSummary"
  >
>;

export interface AppendOperationEventInput<T extends OperationEventType> {
  type: T;
  timestamp: string;
  level: OperationEventLevel;
  summary: string;
  payload: OperationEventPayloadMap[T];
}

export type StoredOperationEvent<T extends OperationEventType = OperationEventType> =
  OperationEvent<T> & {
  cursor: number;
  payloadBytes: number;
};

export interface AppendOperationEventResult<
  T extends OperationEventType = OperationEventType,
> {
  event: StoredOperationEvent<T | "warning">;
  payloadTruncated: boolean;
  historyTruncated: boolean;
}

export class OperationStore {
  private readonly database: DatabaseHandle;
  readonly limits: Readonly<OperationStoreLimits>;

  constructor(stateDir: string, limits: Partial<OperationStoreLimits> = {}) {
    this.limits = validateLimits({ ...DEFAULT_OPERATION_STORE_LIMITS, ...limits });
    this.database = openDatabase(stateDir);
  }

  createRun(input: CreateOperationRunInput): StoredOperationRun {
    assertAllowed("run kind", input.kind, RUN_KINDS);
    assertAllowed("run source", input.source, RUN_SOURCES);
    assertAllowed("run state", input.state ?? "queued", RUN_STATES);
    assertAllowed(
      "run assurance stage",
      input.assuranceStage ?? "working",
      ASSURANCE_STAGES,
    );
    assertIdentifier("run id", input.id);
    assertIdentifier("source run id", input.sourceRunId);
    assertIdentifier("parent run id", input.parentRunId);
    assertIdentifier("project id", input.projectId);
    assertIdentifier("workspace id", input.workspaceId);
    assertIdentifier("goal id", input.goalId);
    if (input.startedAt !== undefined) assertTimestamp("run startedAt", input.startedAt);
    assertBoundedSafeText(this.limits, "run title", input.title);
    assertOptionalRunText(this.limits, input);

    const now = new Date().toISOString();
    const id = input.id ?? `op_${randomUUID().replaceAll("-", "")}`;
    const startedAt = input.startedAt ?? now;
    const run: StoredOperationRun = {
      id,
      kind: input.kind,
      source: input.source,
      sourceRunId: input.sourceRunId,
      parentRunId: input.parentRunId,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      goalId: input.goalId,
      title: input.title.trim(),
      state: input.state ?? "queued",
      assuranceStage: input.assuranceStage ?? "working",
      phase: input.phase,
      currentAction: input.currentAction,
      startedAt,
      updatedAt: now,
      finishedAt: TERMINAL_STATES.has(input.state ?? "queued") ? now : undefined,
      stoppable: input.stoppable ?? false,
      latestSequence: 0,
      retainedEventCount: 0,
      retainedPayloadBytes: 0,
      historyTruncated: false,
    };

    const transaction = this.database.sqlite.transaction(() => {
      this.insertRun(run);
      this.enforceCompletedRetention();
      return this.requireRun(run.id);
    });
    return transaction.immediate();
  }

  getRun(id: string): StoredOperationRun | undefined {
    const row = this.database.sqlite
      .prepare("select * from operation_runs where id = ?")
      .get(id) as OperationRunRow | undefined;
    return row ? rowToRun(row) : undefined;
  }

  findRunBySource(
    kind: OperationRunKind,
    source: OperationSource,
    sourceRunId: string,
  ): StoredOperationRun | undefined {
    const row = this.database.sqlite
      .prepare(
        `select * from operation_runs
         where kind = ? and source = ? and source_run_id = ?
         order by updated_at desc, rowid desc
         limit 1`,
      )
      .get(kind, source, sourceRunId) as OperationRunRow | undefined;
    return row ? rowToRun(row) : undefined;
  }

  listActiveRuns(): StoredOperationRun[] {
    return (
      this.database.sqlite
        .prepare(
          `select * from operation_runs
           where state not in ('stopped', 'failed', 'completed')
           order by updated_at desc`,
        )
        .all() as OperationRunRow[]
    ).map(rowToRun);
  }

  listRuns(options: OperationRunListOptions = {}): StoredOperationRun[] {
    assertIdentifier("project id", options.projectId);
    const limit = Math.min(Math.max(options.limit ?? 100, 1), this.limits.completedRunRetention);
    const rows = options.projectId
      ? this.database.sqlite
          .prepare(
            `select * from operation_runs
             where project_id = ?
             order by
               case when state in ('stopped', 'failed', 'completed') then 1 else 0 end,
               updated_at desc
             limit ?`,
          )
          .all(options.projectId, limit)
      : this.database.sqlite
          .prepare(
            `select * from operation_runs
             order by
               case when state in ('stopped', 'failed', 'completed') then 1 else 0 end,
               updated_at desc
             limit ?`,
          )
          .all(limit);
    return (rows as OperationRunRow[]).map(rowToRun);
  }

  updateRun(id: string, patch: OperationRunPatch): StoredOperationRun {
    assertAllowedOptional("run state", patch.state, RUN_STATES);
    assertAllowedOptional("run assurance stage", patch.assuranceStage, ASSURANCE_STAGES);
    assertIdentifier("parent run id", patch.parentRunId);
    assertIdentifier("project id", patch.projectId);
    assertIdentifier("workspace id", patch.workspaceId);
    assertIdentifier("goal id", patch.goalId);
    if (patch.finishedAt !== undefined) assertTimestamp("run finishedAt", patch.finishedAt);
    assertOptionalRunText(this.limits, patch);
    const transaction = this.database.sqlite.transaction(() => {
      const current = this.requireRun(id);
      const updated = mergeRunPatch(current, patch, new Date().toISOString());
      this.replaceRunProjection(updated);
      this.enforceCompletedRetention();
      return this.requireRun(id);
    });
    return transaction.immediate();
  }

  appendEvent<T extends OperationEventType>(
    runId: string,
    input: AppendOperationEventInput<T>,
    runPatch: OperationRunPatch = {},
  ): AppendOperationEventResult<T> {
    assertAllowed("event type", input.type, EVENT_TYPES);
    assertAllowed("event level", input.level, EVENT_LEVELS);
    assertTimestamp("event timestamp", input.timestamp);
    assertAllowedOptional("run state", runPatch.state, RUN_STATES);
    assertAllowedOptional(
      "run assurance stage",
      runPatch.assuranceStage,
      ASSURANCE_STAGES,
    );
    if (runPatch.finishedAt !== undefined) {
      assertTimestamp("run finishedAt", runPatch.finishedAt);
    }
    assertBoundedSafeText(this.limits, "event summary", input.summary);
    assertOptionalRunText(this.limits, runPatch);

    let payload: OperationEventPayloadMap[T] | OperationEventPayloadMap["warning"] =
      input.payload;
    let type: T | "warning" = input.type;
    let level: OperationEventLevel = input.level;
    let summary = input.summary.trim();
    let payloadJson = stringifyPayload(payload);
    let payloadBytes = byteLength(payloadJson);
    let payloadTruncated = false;

    if (payloadBytes > this.limits.maxEventPayloadBytes) {
      type = "warning";
      level = "warning";
      summary = "Operation event payload exceeded the retained event limit.";
      payload = { code: "operation_event_payload_truncated" };
      payloadJson = JSON.stringify(payload);
      payloadBytes = byteLength(payloadJson);
      payloadTruncated = true;
    } else {
      assertNoForbiddenSensitiveContent("Operation event", [
        ["summary", summary],
        ["payload", payloadJson],
      ]);
    }

    const transaction = this.database.sqlite.transaction(() => {
      const current = this.requireRun(runId);
      const sequence = current.latestSequence + 1;
      const insert = this.database.sqlite
        .prepare(
          `insert into operation_events (
            run_id, sequence, type, timestamp, level, summary, payload_json, payload_bytes
          ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          runId,
          sequence,
          type,
          input.timestamp,
          level,
          summary,
          payloadJson,
          payloadBytes,
        );

      const projected = mergeRunPatch(current, runPatch, input.timestamp);
      projected.latestSequence = sequence;
      projected.retainedEventCount += 1;
      projected.retainedPayloadBytes += payloadBytes;
      this.replaceRunProjection(projected);
      const historyTruncated = this.trimRunEvents(runId);
      this.enforceCompletedRetention();
      const retainedRun = this.requireRun(runId);

      return {
        event: {
          cursor: Number(insert.lastInsertRowid),
          runId,
          sequence,
          type,
          timestamp: input.timestamp,
          level,
          summary,
          payload,
          payloadBytes,
        } as StoredOperationEvent<T | "warning">,
        payloadTruncated,
        historyTruncated: retainedRun.historyTruncated || historyTruncated,
      };
    });

    return transaction.immediate();
  }

  listEvents(
    runId: string,
    options: { afterSequence?: number; afterCursor?: number; limit?: number } = {},
  ): StoredOperationEvent[] {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), this.limits.maxEventsPerRun);
    const rows = this.database.sqlite
      .prepare(
        `select * from operation_events
         where run_id = ? and sequence > ? and cursor > ?
         order by sequence asc
         limit ?`,
      )
      .all(runId, options.afterSequence ?? 0, options.afterCursor ?? 0, limit) as OperationEventRow[];
    return rows.map(rowToEvent);
  }

  listEventsAfterCursor(afterCursor: number, limit = 100): StoredOperationEvent[] {
    const boundedLimit = Math.min(Math.max(limit, 1), this.limits.maxEventsPerRun);
    const rows = this.database.sqlite
      .prepare(
        `select * from operation_events
         where cursor > ?
         order by cursor asc
         limit ?`,
      )
      .all(afterCursor, boundedLimit) as OperationEventRow[];
    return rows.map(rowToEvent);
  }

  getCursorRange(): OperationCursorRange {
    const row = this.database.sqlite
      .prepare(
        `select
           (select min(cursor) from operation_events) as oldest,
           coalesce(
             (select seq from sqlite_sequence where name = 'operation_events'),
             0
           ) as latest`,
      )
      .get() as { oldest: number | null; latest: number | null };
    return {
      oldest: row.oldest ?? undefined,
      latest: row.latest ?? 0,
    };
  }

  upsertEvidence(runId: string, evidence: OperationEvidence): OperationEvidence {
    assertAllowed("evidence type", evidence.type, VERIFICATION_TYPES);
    assertAllowed("evidence state", evidence.state, EVIDENCE_STATES);
    if (evidence.timestamp !== undefined) {
      assertTimestamp("evidence timestamp", evidence.timestamp);
    }
    if (evidence.summary !== undefined) {
      assertBoundedSafeText(this.limits, "evidence summary", evidence.summary);
    }
    const current = this.requireRun(runId);
    if (
      evidence.sourceEventSequence !== undefined &&
      evidence.sourceEventSequence > current.latestSequence
    ) {
      throw new Error("Evidence cannot reference an event sequence that has not been allocated.");
    }

    this.database.sqlite
      .prepare(
        `insert into operation_evidence (
          run_id, type, state, timestamp, source_event_sequence, summary
        ) values (?, ?, ?, ?, ?, ?)
        on conflict(run_id, type) do update set
          state = excluded.state,
          timestamp = excluded.timestamp,
          source_event_sequence = excluded.source_event_sequence,
          summary = excluded.summary`,
      )
      .run(
        runId,
        evidence.type,
        evidence.state,
        evidence.timestamp ?? null,
        evidence.sourceEventSequence ?? null,
        evidence.summary?.trim() ?? null,
      );
    return { ...evidence, summary: evidence.summary?.trim() };
  }

  getEvidence(runId: string): OperationEvidence[] {
    return (
      this.database.sqlite
        .prepare("select * from operation_evidence where run_id = ? order by type")
        .all(runId) as OperationEvidenceRow[]
    ).map(rowToEvidence);
  }

  close(): void {
    this.database.close();
  }

  private insertRun(run: StoredOperationRun): void {
    this.database.sqlite
      .prepare(
        `insert into operation_runs (
          id, kind, source, source_run_id, parent_run_id, project_id, workspace_id, goal_id,
          title, state, assurance_stage, phase, current_action, started_at, updated_at,
          finished_at, stoppable, failure_code, failure_summary, latest_sequence,
          retained_event_count, retained_payload_bytes, history_truncated
        ) values (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )`,
      )
      .run(...runToSqlValues(run));
  }

  private requireRun(id: string): StoredOperationRun {
    const run = this.getRun(id);
    if (!run) throw new Error(`Unknown operation run: ${id}`);
    return run;
  }

  private replaceRunProjection(run: StoredOperationRun): void {
    this.database.sqlite
      .prepare(
        `update operation_runs set
          parent_run_id = ?, project_id = ?, workspace_id = ?, goal_id = ?, title = ?,
          state = ?, assurance_stage = ?, phase = ?, current_action = ?, updated_at = ?,
          finished_at = ?, stoppable = ?, failure_code = ?, failure_summary = ?,
          latest_sequence = ?, retained_event_count = ?, retained_payload_bytes = ?,
          history_truncated = ?
         where id = ?`,
      )
      .run(
        run.parentRunId ?? null,
        run.projectId ?? null,
        run.workspaceId ?? null,
        run.goalId ?? null,
        run.title,
        run.state,
        run.assuranceStage,
        run.phase ?? null,
        run.currentAction ?? null,
        run.updatedAt,
        run.finishedAt ?? null,
        run.stoppable ? 1 : 0,
        run.failureCode ?? null,
        run.failureSummary ?? null,
        run.latestSequence,
        run.retainedEventCount,
        run.retainedPayloadBytes,
        run.historyTruncated ? 1 : 0,
        run.id,
      );
  }

  private trimRunEvents(runId: string): boolean {
    const run = this.requireRun(runId);
    let count = run.retainedEventCount;
    let bytes = run.retainedPayloadBytes;
    if (
      count <= this.limits.maxEventsPerRun &&
      bytes <= this.limits.maxPayloadBytesPerRun
    ) {
      return false;
    }

    const oldest = this.database.sqlite
      .prepare(
        `select cursor, payload_bytes from operation_events
         where run_id = ?
         order by sequence asc`,
      )
      .all(runId) as Array<{ cursor: number; payload_bytes: number }>;
    const remove: number[] = [];
    for (const event of oldest) {
      if (
        count <= this.limits.maxEventsPerRun &&
        bytes <= this.limits.maxPayloadBytesPerRun
      ) {
        break;
      }
      remove.push(event.cursor);
      count -= 1;
      bytes -= event.payload_bytes;
    }

    const removeEvent = this.database.sqlite.prepare(
      "delete from operation_events where cursor = ?",
    );
    for (const cursor of remove) removeEvent.run(cursor);

    this.database.sqlite
      .prepare(
        `update operation_runs
         set retained_event_count = ?, retained_payload_bytes = ?, history_truncated = 1
         where id = ?`,
      )
      .run(count, bytes, runId);
    return remove.length > 0;
  }

  private enforceCompletedRetention(): void {
    const terminal = this.database.sqlite
      .prepare(
        `select id from operation_runs
         where state in ('stopped', 'failed', 'completed')
         order by coalesce(finished_at, updated_at) desc, id desc`,
      )
      .all() as Array<{ id: string }>;

    const deleteRun = this.database.sqlite.prepare("delete from operation_runs where id = ?");
    for (const run of terminal.slice(this.limits.completedRunRetention)) {
      deleteRun.run(run.id);
    }

    const expireDetails = this.database.sqlite.prepare(
      `delete from operation_events where run_id = ?`,
    );
    const expireEvidence = this.database.sqlite.prepare(
      `delete from operation_evidence where run_id = ?`,
    );
    const markExpired = this.database.sqlite.prepare(
      `update operation_runs
       set retained_event_count = 0, retained_payload_bytes = 0, history_truncated = 1
       where id = ?`,
    );
    for (const run of terminal.slice(
      this.limits.detailedCompletedRunRetention,
      this.limits.completedRunRetention,
    )) {
      expireDetails.run(run.id);
      expireEvidence.run(run.id);
      markExpired.run(run.id);
    }
  }
}

interface OperationRunRow {
  id: string;
  kind: string;
  source: string;
  source_run_id: string | null;
  parent_run_id: string | null;
  project_id: string | null;
  workspace_id: string | null;
  goal_id: string | null;
  title: string;
  state: string;
  assurance_stage: string;
  phase: string | null;
  current_action: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
  stoppable: number;
  failure_code: string | null;
  failure_summary: string | null;
  latest_sequence: number;
  retained_event_count: number;
  retained_payload_bytes: number;
  history_truncated: number;
}

interface OperationEventRow {
  cursor: number;
  run_id: string;
  sequence: number;
  type: string;
  timestamp: string;
  level: string;
  summary: string;
  payload_json: string;
  payload_bytes: number;
}

interface OperationEvidenceRow {
  type: string;
  state: string;
  timestamp: string | null;
  source_event_sequence: number | null;
  summary: string | null;
}

function rowToRun(row: OperationRunRow): StoredOperationRun {
  return {
    id: row.id,
    kind: row.kind as OperationRunKind,
    source: row.source as OperationSource,
    sourceRunId: row.source_run_id ?? undefined,
    parentRunId: row.parent_run_id ?? undefined,
    projectId: row.project_id ?? undefined,
    workspaceId: row.workspace_id ?? undefined,
    goalId: row.goal_id ?? undefined,
    title: row.title,
    state: row.state as OperationRunState,
    assuranceStage: row.assurance_stage as OperationAssuranceStage,
    phase: row.phase ?? undefined,
    currentAction: row.current_action ?? undefined,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at ?? undefined,
    stoppable: row.stoppable === 1,
    failureCode: row.failure_code ?? undefined,
    failureSummary: row.failure_summary ?? undefined,
    latestSequence: row.latest_sequence,
    retainedEventCount: row.retained_event_count,
    retainedPayloadBytes: row.retained_payload_bytes,
    historyTruncated: row.history_truncated === 1,
  };
}

function rowToEvent(row: OperationEventRow): StoredOperationEvent {
  return {
    cursor: row.cursor,
    runId: row.run_id,
    sequence: row.sequence,
    type: row.type as OperationEventType,
    timestamp: row.timestamp,
    level: row.level as OperationEventLevel,
    summary: row.summary,
    payload: JSON.parse(row.payload_json) as OperationEventPayloadMap[OperationEventType],
    payloadBytes: row.payload_bytes,
  } as StoredOperationEvent;
}

function rowToEvidence(row: OperationEvidenceRow): OperationEvidence {
  return {
    type: row.type as VerificationType,
    state: row.state as EvidenceState,
    timestamp: row.timestamp ?? undefined,
    sourceEventSequence: row.source_event_sequence ?? undefined,
    summary: row.summary ?? undefined,
  };
}

function mergeRunPatch(
  current: StoredOperationRun,
  patch: OperationRunPatch,
  updatedAt: string,
): StoredOperationRun {
  const merged = { ...current, ...patch, updatedAt };
  if (TERMINAL_STATES.has(merged.state) && !merged.finishedAt) merged.finishedAt = updatedAt;
  return merged;
}

function runToSqlValues(run: StoredOperationRun): unknown[] {
  return [
    run.id,
    run.kind,
    run.source,
    run.sourceRunId ?? null,
    run.parentRunId ?? null,
    run.projectId ?? null,
    run.workspaceId ?? null,
    run.goalId ?? null,
    run.title,
    run.state,
    run.assuranceStage,
    run.phase ?? null,
    run.currentAction ?? null,
    run.startedAt,
    run.updatedAt,
    run.finishedAt ?? null,
    run.stoppable ? 1 : 0,
    run.failureCode ?? null,
    run.failureSummary ?? null,
    run.latestSequence,
    run.retainedEventCount,
    run.retainedPayloadBytes,
    run.historyTruncated ? 1 : 0,
  ];
}

function validateLimits(limits: OperationStoreLimits): Readonly<OperationStoreLimits> {
  assertIntegerInRange("maxEventsPerRun", limits.maxEventsPerRun, 1, 100_000);
  assertIntegerInRange("maxEventPayloadBytes", limits.maxEventPayloadBytes, 64, 1_048_576);
  assertIntegerInRange(
    "maxPayloadBytesPerRun",
    limits.maxPayloadBytesPerRun,
    limits.maxEventPayloadBytes,
    100 * 1_024 * 1_024,
  );
  assertIntegerInRange("maxTextBytes", limits.maxTextBytes, 64, 64 * 1_024);
  assertIntegerInRange("completedRunRetention", limits.completedRunRetention, 1, 10_000);
  assertIntegerInRange(
    "detailedCompletedRunRetention",
    limits.detailedCompletedRunRetention,
    0,
    limits.completedRunRetention,
  );
  return Object.freeze({ ...limits });
}

function assertIntegerInRange(
  name: string,
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}.`);
  }
}

function assertOptionalRunText(
  limits: Readonly<OperationStoreLimits>,
  input: Partial<CreateOperationRunInput & OperationRunPatch>,
): void {
  const values: Array<[string, string | undefined]> = [
    ["title", input.title],
    ["phase", input.phase],
    ["currentAction", input.currentAction],
    ["failureCode", input.failureCode],
    ["failureSummary", input.failureSummary],
  ];
  for (const [name, value] of values) {
    if (value !== undefined) assertBoundedSafeText(limits, `run ${name}`, value);
  }
}

function assertBoundedSafeText(
  limits: Readonly<OperationStoreLimits>,
  name: string,
  value: string,
): void {
  if (!value.trim()) throw new Error(`${name} must not be empty.`);
  if (byteLength(value) > limits.maxTextBytes) {
    throw new Error(`${name} exceeds the configured text byte limit.`);
  }
  assertNoForbiddenSensitiveContent("Operation store", [[name, value]]);
}

function stringifyPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Operation event payload must be an object.");
  }
  try {
    return JSON.stringify(payload);
  } catch (error) {
    throw new Error("Operation event payload must be JSON serializable.", { cause: error });
  }
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function assertAllowed<T extends string>(name: string, value: T, allowed: ReadonlySet<T>): void {
  if (!allowed.has(value)) throw new Error(`Invalid operation ${name}.`);
}

function assertAllowedOptional<T extends string>(
  name: string,
  value: T | undefined,
  allowed: ReadonlySet<T>,
): void {
  if (value !== undefined) assertAllowed(name, value, allowed);
}

function assertIdentifier(name: string, value: string | undefined): void {
  if (value === undefined) return;
  if (!value.trim() || byteLength(value) > 512) {
    throw new Error(`Operation ${name} must contain 1 through 512 bytes.`);
  }
  assertNoForbiddenSensitiveContent("Operation identifier", [[name, value]]);
}

function assertTimestamp(name: string, value: string): void {
  if (byteLength(value) > 64 || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Operation ${name} must be a valid bounded timestamp.`);
  }
}
