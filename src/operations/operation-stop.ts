import type { ProcessSessionManager } from "../process-sessions.js";
import { resolveProcessSessionReference } from "./process-session-projector.js";
import type {
  OperationRunService,
  OperationServiceResult,
} from "./operation-run-service.js";
import type {
  OperationStore,
  StoredOperationRun,
} from "./operation-store.js";

type OperationStopStore = Pick<OperationStore, "getRun">;
type OperationCapabilityService = Pick<OperationRunService, "getCapabilities">;
type ProcessStopOwner = Pick<ProcessSessionManager, "terminate">;

export type OperationStopFailureCode =
  | "unknown_run"
  | "not_stoppable"
  | "owner_unavailable"
  | "stop_failed";

export type OperationStopResult =
  | {
      ok: true;
      run: StoredOperationRun;
    }
  | {
      ok: false;
      code: OperationStopFailureCode;
      runId?: string;
    };

export function requestOperationStop(
  runId: string,
  store: OperationStopStore,
  capabilities: OperationCapabilityService,
  processes: ProcessStopOwner,
): OperationStopResult {
  let run: StoredOperationRun | undefined;
  try {
    run = store.getRun(runId);
  } catch {
    return { ok: false, code: "stop_failed" };
  }
  if (!run) return { ok: false, code: "unknown_run" };

  const target = resolveProcessSessionReference({
    runId: run.id,
    kind: run.kind,
    source: run.source,
    sourceRunId: run.sourceRunId,
    projectId: run.projectId,
    workspaceId: run.workspaceId,
  });
  if (!target) return { ok: false, code: "not_stoppable" };

  let capability: OperationServiceResult<{
    ownerStatus: "available" | "missing" | "unknown";
    stoppable: boolean;
  }>;
  try {
    capability = capabilities.getCapabilities(runId);
  } catch {
    return { ok: false, code: "stop_failed", runId: run.id };
  }
  if (!capability.ok) {
    return {
      ok: false,
      code: capability.issues[0]?.code === "unknown_run"
        ? "unknown_run"
        : "stop_failed",
      ...(capability.issues[0]?.code === "unknown_run" ? {} : { runId: run.id }),
    };
  }
  if (capability.value.ownerStatus !== "available") {
    return { ok: false, code: "owner_unavailable" };
  }
  if (!capability.value.stoppable) {
    return { ok: false, code: "not_stoppable" };
  }

  try {
    if (!processes.terminate(target.workspaceId, target.sessionId)) {
      return { ok: false, code: "owner_unavailable" };
    }
  } catch {
    return { ok: false, code: "stop_failed", runId: run.id };
  }
  try {
    return { ok: true, run: store.getRun(runId) ?? run };
  } catch {
    return { ok: true, run };
  }
}
