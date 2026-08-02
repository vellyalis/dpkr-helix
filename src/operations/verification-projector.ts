import type {
  EvidenceState,
  VerificationType,
} from "./operation-contracts.js";
import type { OperationRunService } from "./operation-run-service.js";
import type {
  OperationStore,
  StoredOperationRun,
} from "./operation-store.js";

type VerificationStore = Pick<
  OperationStore,
  "getEvidence" | "getRun" | "listRuns" | "upsertEvidence"
>;

export interface OperationVerificationTarget {
  runId: string;
  workspaceId: string;
  type: Extract<VerificationType, "typecheck" | "tests" | "build">;
}

export interface VerificationReconciliationReport {
  inspected: number;
  reconciled: number;
  failedRunIds: string[];
}

export class OperationVerificationProjector {
  constructor(
    private readonly runs: Pick<
      OperationRunService,
      "recordEvent" | "transitionAssurance"
    >,
    private readonly store: VerificationStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  started(target: OperationVerificationTarget): boolean {
    try {
      const run = this.requireEligibleTarget(target);
      if (
        run.assuranceStage !== "result_available"
        && run.assuranceStage !== "verification_pending"
        && run.assuranceStage !== "verified"
      ) {
        return false;
      }
      const timestamp = this.now();
      const event = this.runs.recordEvent(
        run.id,
        {
          type: "verification.started",
          timestamp,
          level: "info",
          summary: `${verificationLabel(target.type)} verification started.`,
          payload: { type: target.type },
        },
        {
          phase: "verification",
          currentAction: `Running ${verificationLabel(target.type)} verification`,
        },
      );
      if (!event.ok) return false;
      const transitioned = this.runs.transitionAssurance(
        run.id,
        "verifying",
        "verification_evidence",
        "verification_started",
      );
      if (!transitioned.ok) return false;
      try {
        this.store.upsertEvidence(run.id, {
          type: target.type,
          state: "running",
          timestamp,
          sourceEventSequence: event.value.sequence,
          summary: `${verificationLabel(target.type)} verification is running.`,
        });
        return true;
      } catch {
        this.runs.transitionAssurance(
          run.id,
          "verification_pending",
          "verification_evidence",
          "verification_evidence_store_failed",
        );
        return false;
      }
    } catch {
      return false;
    }
  }

  completed(
    target: OperationVerificationTarget,
    state: Extract<EvidenceState, "passed" | "failed">,
    basisFingerprint?: string,
  ): boolean {
    try {
      const run = this.requireEligibleTarget(target, "verifying");
      const timestamp = this.now();
      const event = this.runs.recordEvent(
        run.id,
        {
          type: "verification.completed",
          timestamp,
          level: state === "passed" ? "info" : "error",
          summary: `${verificationLabel(target.type)} verification ${state}.`,
          payload: { type: target.type, state },
        },
        {
          phase: "verification",
          currentAction: state === "passed"
            ? "Verification completed"
            : "Verification requires attention",
        },
      );
      if (!event.ok) {
        this.recoverPending(run.id, "verification_completion_event_failed");
        return false;
      }
      this.store.upsertEvidence(run.id, {
        type: target.type,
        state,
        timestamp,
        sourceEventSequence: event.value.sequence,
        summary: `${verificationLabel(target.type)} verification ${state}.`,
        basisFingerprint,
      });
      const transitioned = this.runs.transitionAssurance(
        run.id,
        state === "passed" ? "verified" : "verification_pending",
        "verification_evidence",
        state === "passed" ? "verification_passed" : "verification_failed",
      );
      if (transitioned.ok) return true;
      if (state === "passed") {
        this.runs.transitionAssurance(
          run.id,
          "verification_pending",
          "verification_evidence",
          "verification_incomplete",
        );
      }
      return false;
    } catch {
      this.recoverPending(target.runId, "verification_completion_projection_failed");
      return false;
    }
  }

  reconcileInterrupted(): VerificationReconciliationReport {
    let retainedRuns: StoredOperationRun[];
    try {
      retainedRuns = this.store.listRuns({ limit: 200 });
    } catch {
      return { inspected: 0, reconciled: 0, failedRunIds: [] };
    }

    const candidates = retainedRuns.filter((run) =>
      run.kind === "local_agent"
      && run.state === "completed"
      && run.assuranceStage === "verifying"
    );
    const report: VerificationReconciliationReport = {
      inspected: candidates.length,
      reconciled: 0,
      failedRunIds: [],
    };

    for (const run of candidates) {
      try {
        const timestamp = this.now();
        const warning = this.runs.recordEvent(run.id, {
          type: "warning",
          timestamp,
          level: "warning",
          summary: "Verification was interrupted before dpkr helix restarted.",
          payload: { code: "verification_interrupted_after_restart" },
        });
        const sourceEventSequence = warning.ok
          ? warning.value.sequence
          : undefined;
        for (const evidence of this.store.getEvidence(run.id)) {
          if (evidence.state !== "running") continue;
          this.store.upsertEvidence(run.id, {
            ...evidence,
            state: "not_run",
            timestamp,
            sourceEventSequence,
            summary: "Verification was interrupted before completion.",
          });
        }
        if (this.recoverPending(run.id, "verification_interrupted_after_restart")) {
          report.reconciled += 1;
        } else {
          report.failedRunIds.push(run.id);
        }
      } catch {
        report.failedRunIds.push(run.id);
      }
    }
    return report;
  }

  private requireEligibleTarget(
    target: OperationVerificationTarget,
    assuranceStage?: StoredOperationRun["assuranceStage"],
  ): StoredOperationRun {
    const run = this.store.getRun(target.runId);
    if (
      !run
      || run.kind !== "local_agent"
      || run.state !== "completed"
      || run.workspaceId !== target.workspaceId
      || (assuranceStage !== undefined && run.assuranceStage !== assuranceStage)
    ) {
      throw new Error("Verification target is not an eligible completed local-agent run.");
    }
    return run;
  }

  private recoverPending(runId: string, reasonCode: string): boolean {
    try {
      return this.runs.transitionAssurance(
        runId,
        "verification_pending",
        "verification_evidence",
        reasonCode,
      ).ok;
    } catch {
      return false;
    }
  }
}

function verificationLabel(
  type: OperationVerificationTarget["type"],
): string {
  return type === "typecheck" ? "Typecheck" : type === "tests" ? "Test" : "Build";
}
