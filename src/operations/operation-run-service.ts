import type {
  OperationAssuranceStage,
  OperationEventType,
  OperationEvidence,
  OperationRunKind,
  OperationRunState,
  OperationSource,
} from "./operation-contracts.js";
import { OperationEventBus } from "./operation-event-bus.js";
import type {
  AppendOperationEventInput,
  CreateOperationRunInput,
  OperationRunPatch,
  OperationStore,
  StoredOperationEvent,
  StoredOperationRun,
} from "./operation-store.js";

const TERMINAL_STATES = new Set<OperationRunState>(["stopped", "failed", "completed"]);

const STATE_TRANSITIONS: Readonly<Record<OperationRunState, ReadonlySet<OperationRunState>>> = {
  queued: new Set(["running", "blocked", "stopping", "stopped", "failed", "completed"]),
  running: new Set(["blocked", "stopping", "stopped", "failed", "completed"]),
  blocked: new Set(["running", "stopping", "stopped", "failed", "completed"]),
  stopping: new Set(["running", "stopped", "failed", "completed"]),
  stopped: new Set(),
  failed: new Set(),
  completed: new Set(),
};

const ASSURANCE_TRANSITIONS: Readonly<
  Record<OperationAssuranceStage, ReadonlySet<OperationAssuranceStage>>
> = {
  working: new Set([
    "result_available",
    "verification_pending",
    "verifying",
    "verified",
    "not_applicable",
  ]),
  result_available: new Set(["verification_pending", "verifying", "verified"]),
  verification_pending: new Set(["verifying", "verified"]),
  verifying: new Set(["verification_pending", "verified"]),
  verified: new Set(),
  not_applicable: new Set(),
};

type OperationStorePort = Pick<
  OperationStore,
  | "appendEvent"
  | "createRun"
  | "getEvidence"
  | "getRun"
  | "listActiveRuns"
  | "updateRun"
>;

export type OperationOwnerStatus = "available" | "missing" | "unknown";

export interface OperationOwnerReference {
  runId: string;
  kind: OperationRunKind;
  source: OperationSource;
  sourceRunId?: string;
  projectId?: string;
  workspaceId?: string;
}

export interface OperationOwnerCapabilities {
  ownerStatus: OperationOwnerStatus;
  stoppable: boolean;
}

export type OperationAssuranceAuthority = "operation_owner" | "verification_evidence";

export type OperationCapabilityResolver = (
  reference: OperationOwnerReference,
) => OperationOwnerCapabilities;

export type OperationProjectionIssueCode =
  | "capability_failure"
  | "invalid_assurance_transition"
  | "invalid_state_transition"
  | "store_failure"
  | "subscriber_failure"
  | "unknown_run";

export interface OperationProjectionIssue {
  code: OperationProjectionIssueCode;
  phase:
    | "append_event"
    | "capability_lookup"
    | "create_run"
    | "publish_event"
    | "read_evidence"
    | "read_run"
    | "reconcile_run"
    | "update_run";
}

export type OperationServiceResult<T> =
  | {
      ok: true;
      value: T;
      issues: OperationProjectionIssue[];
    }
  | {
      ok: false;
      issues: [OperationProjectionIssue, ...OperationProjectionIssue[]];
    };

export interface OperationRunServiceOptions {
  eventBus?: OperationEventBus;
  resolveCapabilities?: OperationCapabilityResolver;
  now?: () => string;
  onIssue?: (issue: OperationProjectionIssue) => void;
}

export interface OperationReconciliationReport {
  inspected: number;
  available: number;
  missing: number;
  unknown: number;
  failedRunIds: string[];
  issues: OperationProjectionIssue[];
}

export class OperationRunService {
  private readonly eventBus: OperationEventBus;
  private readonly resolveCapabilitiesFromOwner: OperationCapabilityResolver;
  private readonly now: () => string;
  private readonly onIssue?: (issue: OperationProjectionIssue) => void;

  constructor(
    private readonly store: OperationStorePort,
    options: OperationRunServiceOptions = {},
  ) {
    this.eventBus = options.eventBus ?? new OperationEventBus();
    this.resolveCapabilitiesFromOwner =
      options.resolveCapabilities ??
      (() => ({
        ownerStatus: "unknown",
        stoppable: false,
      }));
    this.now = options.now ?? (() => new Date().toISOString());
    this.onIssue = options.onIssue;
  }

  startRun(
    input: Omit<CreateOperationRunInput, "assuranceStage" | "stoppable"> & {
      assuranceStage?: Extract<OperationAssuranceStage, "working" | "not_applicable">;
    },
  ): OperationServiceResult<StoredOperationRun> {
    if (
      input.assuranceStage !== undefined &&
      input.assuranceStage !== "working" &&
      input.assuranceStage !== "not_applicable"
    ) {
      return this.failed(this.issue("invalid_assurance_transition", "create_run"));
    }

    let created: StoredOperationRun;
    try {
      created = this.store.createRun({ ...input, stoppable: false });
    } catch {
      return this.failed(this.issue("store_failure", "create_run"));
    }

    const issues: OperationProjectionIssue[] = [];
    const capability = this.resolveCapabilitiesForRun(created);
    issues.push(...capability.issues);
    if (capability.value.stoppable) {
      try {
        created = this.store.updateRun(created.id, { stoppable: true });
      } catch {
        issues.push(this.issue("store_failure", "update_run"));
      }
    }

    const createdEvent = this.appendAndPublish(created.id, {
      type: "run.created",
      timestamp: this.now(),
      level: "info",
      summary: "Operation run created.",
      payload: {
        kind: created.kind,
        state: created.state,
        assuranceStage: created.assuranceStage,
      },
    });
    issues.push(...createdEvent.issues);

    return { ok: true, value: created, issues };
  }

  recordEvent<T extends OperationEventType>(
    runId: string,
    input: AppendOperationEventInput<T>,
    projection: Pick<
      OperationRunPatch,
      "phase" | "currentAction" | "workspaceId" | "projectId"
    > = {},
  ): OperationServiceResult<StoredOperationEvent<T | "warning">> {
    return this.appendAndPublish(runId, input, projection);
  }

  transitionState(
    runId: string,
    state: OperationRunState,
    reasonCode?: string,
  ): OperationServiceResult<StoredOperationEvent<"run.state_changed" | "warning">> {
    const current = this.readRun(runId);
    if (!current.ok) return current;
    if (current.value.state === state) {
      return this.failed(this.issue("invalid_state_transition", "update_run"));
    }
    if (!STATE_TRANSITIONS[current.value.state].has(state)) {
      return this.failed(this.issue("invalid_state_transition", "update_run"));
    }

    const patch: OperationRunPatch = {
      state,
      stoppable:
        state === "running" && current.value.state === "stopping"
          ? true
          : state === "stopping" || TERMINAL_STATES.has(state)
          ? false
          : current.value.stoppable,
    };
    if (state === "failed") {
      patch.failureCode = reasonCode ?? "operation_failed";
      patch.failureSummary = "The operation owner reported a failure.";
    }

    return this.appendAndPublish(
      runId,
      {
        type: "run.state_changed",
        timestamp: this.now(),
        level: state === "failed" ? "error" : "info",
        summary: `Operation state changed to ${state}.`,
        payload: {
          previousState: current.value.state,
          state,
          assuranceStage: current.value.assuranceStage,
          reasonCode,
        },
      },
      patch,
    );
  }

  transitionAssurance(
    runId: string,
    assuranceStage: OperationAssuranceStage,
    authority: OperationAssuranceAuthority,
    reasonCode?: string,
  ): OperationServiceResult<StoredOperationEvent<"run.state_changed" | "warning">> {
    const current = this.readRun(runId);
    if (!current.ok) return current;
    if (current.value.assuranceStage === assuranceStage) {
      return this.failed(this.issue("invalid_assurance_transition", "update_run"));
    }
    if (!ASSURANCE_TRANSITIONS[current.value.assuranceStage].has(assuranceStage)) {
      return this.failed(this.issue("invalid_assurance_transition", "update_run"));
    }
    if (
      (assuranceStage === "verifying" || assuranceStage === "verified") &&
      authority !== "verification_evidence"
    ) {
      return this.failed(this.issue("invalid_assurance_transition", "update_run"));
    }
    if (assuranceStage === "verified") {
      let evidence: OperationEvidence[];
      try {
        evidence = this.store.getEvidence(runId);
      } catch {
        return this.failed(this.issue("store_failure", "read_evidence"));
      }
      if (!hasSufficientVerificationEvidence(current.value, evidence)) {
        return this.failed(this.issue("invalid_assurance_transition", "update_run"));
      }
    }

    return this.appendAndPublish(
      runId,
      {
        type: "run.state_changed",
        timestamp: this.now(),
        level: "info",
        summary: `Operation assurance changed to ${assuranceStage}.`,
        payload: {
          state: current.value.state,
          assuranceStage,
          reasonCode,
        },
      },
      { assuranceStage },
    );
  }

  getCapabilities(
    runId: string,
  ): OperationServiceResult<OperationOwnerCapabilities> {
    const current = this.readRun(runId);
    if (!current.ok) return current;
    const resolved = this.resolveCapabilitiesForRun(current.value);
    return { ok: true, value: resolved.value, issues: resolved.issues };
  }

  reconcileActiveRuns(): OperationReconciliationReport {
    let activeRuns: StoredOperationRun[];
    try {
      activeRuns = this.store.listActiveRuns();
    } catch {
      const issue = this.issue("store_failure", "reconcile_run");
      return {
        inspected: 0,
        available: 0,
        missing: 0,
        unknown: 0,
        failedRunIds: [],
        issues: [issue],
      };
    }

    const report: OperationReconciliationReport = {
      inspected: activeRuns.length,
      available: 0,
      missing: 0,
      unknown: 0,
      failedRunIds: [],
      issues: [],
    };

    for (const run of activeRuns) {
      const capability = this.resolveCapabilitiesForRun(run);
      report.issues.push(...capability.issues);
      report[capability.value.ownerStatus] += 1;

      if (capability.value.ownerStatus === "missing") {
        const failed = this.transitionState(
          run.id,
          "failed",
          "owner_unavailable_after_restart",
        );
        report.issues.push(...failed.issues);
        if (failed.ok) report.failedRunIds.push(run.id);
        continue;
      }

      if (capability.value.stoppable !== run.stoppable) {
        try {
          this.store.updateRun(run.id, { stoppable: capability.value.stoppable });
        } catch {
          report.issues.push(this.issue("store_failure", "reconcile_run"));
        }
      }
    }

    return report;
  }

  private readRun(runId: string): OperationServiceResult<StoredOperationRun> {
    try {
      const run = this.store.getRun(runId);
      if (!run) return this.failed(this.issue("unknown_run", "read_run"));
      return { ok: true, value: run, issues: [] };
    } catch {
      return this.failed(this.issue("store_failure", "read_run"));
    }
  }

  private appendAndPublish<T extends OperationEventType>(
    runId: string,
    input: AppendOperationEventInput<T>,
    patch: OperationRunPatch = {},
  ): OperationServiceResult<StoredOperationEvent<T | "warning">> {
    let event: StoredOperationEvent<T | "warning">;
    try {
      event = this.store.appendEvent(runId, input, patch).event;
    } catch {
      return this.failed(this.issue("store_failure", "append_event"));
    }

    const issues: OperationProjectionIssue[] = [];
    try {
      const publication = this.eventBus.publish(event);
      if (publication.failed > 0) {
        issues.push(this.issue("subscriber_failure", "publish_event"));
      }
    } catch {
      issues.push(this.issue("subscriber_failure", "publish_event"));
    }
    return { ok: true, value: event, issues };
  }

  private resolveCapabilitiesForRun(run: StoredOperationRun): {
    value: OperationOwnerCapabilities;
    issues: OperationProjectionIssue[];
  } {
    let resolved: OperationOwnerCapabilities;
    try {
      resolved = this.resolveCapabilitiesFromOwner(toOwnerReference(run));
    } catch {
      return {
        value: { ownerStatus: "unknown", stoppable: false },
        issues: [this.issue("capability_failure", "capability_lookup")],
      };
    }

    return {
      value: {
        ownerStatus: resolved.ownerStatus,
        stoppable:
          resolved.ownerStatus === "available" &&
          run.state !== "stopping" &&
          !TERMINAL_STATES.has(run.state) &&
          run.kind === "process_session" &&
          resolved.stoppable,
      },
      issues: [],
    };
  }

  private issue(
    code: OperationProjectionIssueCode,
    phase: OperationProjectionIssue["phase"],
  ): OperationProjectionIssue {
    const issue = { code, phase };
    try {
      this.onIssue?.(issue);
    } catch {
      // Diagnostics must never become an operation failure path.
    }
    return issue;
  }

  private failed<T>(issue: OperationProjectionIssue): OperationServiceResult<T> {
    return { ok: false, issues: [issue] };
  }
}

function hasSufficientVerificationEvidence(
  run: StoredOperationRun,
  evidence: OperationEvidence[],
): boolean {
  if (evidence.some((item) => item.state === "failed" || item.state === "running" || item.state === "not_run")) {
    return false;
  }
  if (run.goalId !== undefined) {
    return evidence.some((item) => item.type === "goal_state" && item.state === "passed");
  }
  return evidence.some((item) => item.state === "passed");
}

function toOwnerReference(run: StoredOperationRun): OperationOwnerReference {
  return {
    runId: run.id,
    kind: run.kind,
    source: run.source,
    sourceRunId: run.sourceRunId,
    projectId: run.projectId,
    workspaceId: run.workspaceId,
  };
}
