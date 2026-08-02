export type OperationRunKind = "mcp_tool" | "process_session" | "local_agent";

export type OperationSource =
  | "mcp"
  | "codex"
  | "claude"
  | "opencode"
  | "pi"
  | "cursor"
  | "copilot";

export type OperationRunState =
  | "queued"
  | "running"
  | "blocked"
  | "stopping"
  | "stopped"
  | "failed"
  | "completed";

export type OperationAssuranceStage =
  | "working"
  | "result_available"
  | "verification_pending"
  | "verifying"
  | "verified"
  | "not_applicable";

export interface OperationRun {
  id: string;
  kind: OperationRunKind;
  source: OperationSource;
  sourceRunId?: string;
  parentRunId?: string;
  projectId?: string;
  workspaceId?: string;
  goalId?: string;
  title: string;
  state: OperationRunState;
  assuranceStage: OperationAssuranceStage;
  phase?: string;
  currentAction?: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  stoppable: boolean;
  failureCode?: string;
  failureSummary?: string;
}

export type OperationEventLevel = "debug" | "info" | "warning" | "error";

export type FileChangeOperation = "create" | "update" | "delete" | "move";

export type VerificationType = "typecheck" | "tests" | "build" | "review" | "goal_state";

export type EvidenceState = "not_run" | "running" | "passed" | "failed" | "not_applicable";

export interface OperationEvidence {
  type: VerificationType;
  state: EvidenceState;
  timestamp?: string;
  sourceEventSequence?: number;
  summary?: string;
  basisFingerprint?: string;
}

export interface OperationEventPayloadMap {
  "run.created": {
    kind: OperationRunKind;
    state: OperationRunState;
    assuranceStage: OperationAssuranceStage;
  };
  "run.state_changed": {
    previousState?: OperationRunState;
    state: OperationRunState;
    assuranceStage: OperationAssuranceStage;
    reasonCode?: string;
  };
  "workspace.opened": {
    workspaceId: string;
    projectId?: string;
    mode: "checkout" | "worktree";
  };
  "tool.started": {
    toolName: string;
  };
  "tool.completed": {
    toolName: string;
    durationMs?: number;
  };
  "tool.failed": {
    toolName: string;
    failureCode: string;
  };
  "file.read": {
    relativePath: string;
  };
  "file.changed": {
    relativePath: string;
    operation: FileChangeOperation;
    previousRelativePath?: string;
  };
  "process.started": {
    sessionId: number;
    tty: boolean;
  };
  "process.output": {
    stream: "stdout" | "stderr" | "combined";
    text: string;
    truncated: boolean;
  };
  "process.exited": {
    exitCode?: number;
    signal?: string;
    wallTimeMs: number;
  };
  "agent.status_changed": {
    agentId: string;
    status: "starting" | "running" | "idle" | "error" | "stopped";
  };
  "agent.message": {
    agentId: string;
    role: "assistant" | "system";
    text: string;
    truncated: boolean;
  };
  "agent.result_available": {
    agentId: string;
    text: string;
    truncated: boolean;
  };
  "agent.input_required": {
    agentId: string;
    question: string;
    truncated: boolean;
  };
  "verification.started": {
    type: VerificationType;
  };
  "verification.completed": {
    type: VerificationType;
    state: Extract<EvidenceState, "passed" | "failed" | "not_applicable">;
  };
  "review.finding": {
    findingId: string;
    severity: "S0" | "S1" | "S2" | "S3" | "info";
    summary: string;
    blocking: boolean;
  };
  "review.completed": {
    unresolvedBlockingCount: number;
  };
  "project_state.updated": {
    stateVersion?: number;
    goalId?: string;
    goalStatus?: string;
  };
  warning: {
    code: string;
  };
  failure: {
    code: string;
  };
}

export type OperationEventType = keyof OperationEventPayloadMap;

interface OperationEventBase<T extends OperationEventType> {
  runId: string;
  sequence: number;
  type: T;
  timestamp: string;
  level: OperationEventLevel;
  summary: string;
  payload: OperationEventPayloadMap[T];
}

export type OperationEvent<T extends OperationEventType = OperationEventType> =
  T extends OperationEventType ? OperationEventBase<T> : never;

export interface OperationEventCursor {
  cursor: number;
  runId: string;
  sequence: number;
}

export interface OperationRunDetail {
  run: OperationRun;
  evidence: OperationEvidence[];
  latestSequence: number;
  historyTruncated: boolean;
}
