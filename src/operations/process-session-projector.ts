import { Buffer } from "node:buffer";
import type {
  ProcessSessionManager,
  ProcessSessionProjection,
  ProcessVerificationTarget,
} from "../process-sessions.js";
import { redactForbiddenSensitiveContent } from "../sensitive-content.js";
import { currentMcpOperationRunId } from "./mcp-tool-operation-projector.js";
import type {
  OperationOwnerCapabilities,
  OperationOwnerReference,
  OperationRunService,
} from "./operation-run-service.js";

const MAX_PROJECTED_OUTPUT_BYTES = 8 * 1_024;
const OUTPUT_TRUNCATION_MARKER = "\n... projected output truncated ...";
const OUTPUT_REDACTION_WINDOW_CHARACTERS = 128;

interface PendingProcessOutput {
  stream: "stdout" | "stderr" | "combined";
  text: string;
}

export interface ProcessSessionStopOutcome {
  runId: string;
  state: "stopped" | "failed" | "completed";
}

export interface ProcessSessionOperationProjectorOptions {
  onStopOutcome?: (outcome: ProcessSessionStopOutcome) => void;
  verification?: {
    started(target: ProcessVerificationTarget): boolean;
    completed(
      target: ProcessVerificationTarget,
      state: "passed" | "failed",
      basisFingerprint?: string,
    ): boolean;
  };
}

export class ProcessSessionOperationProjector implements ProcessSessionProjection {
  private readonly runIds = new Map<string, string>();
  private readonly stopRequestedKeys = new Set<string>();
  private readonly pendingOutput = new Map<string, PendingProcessOutput>();
  private readonly verificationTargets = new Map<string, ProcessVerificationTarget>();

  constructor(
    private readonly runs: OperationRunService,
    private readonly options: ProcessSessionOperationProjectorOptions = {},
  ) {}

  started(input: {
    sessionId: number;
    workspaceId: string;
    tty: boolean;
    verification?: ProcessVerificationTarget;
  }): void {
    const created = this.runs.startRun({
      kind: "process_session",
      source: "mcp",
      sourceRunId: sourceRunId(input.sessionId),
      parentRunId: currentMcpOperationRunId(),
      workspaceId: input.workspaceId,
      title: `Process session ${input.sessionId}`,
      state: "running",
      assuranceStage: "not_applicable",
    });
    if (!created.ok) return;

    this.runIds.set(runKey(input.workspaceId, input.sessionId), created.value.id);
    if (
      input.verification
      && this.options.verification?.started(input.verification)
    ) {
      this.verificationTargets.set(
        runKey(input.workspaceId, input.sessionId),
        input.verification,
      );
    }
    this.runs.recordEvent(created.value.id, {
      type: "process.started",
      timestamp: new Date().toISOString(),
      level: "info",
      summary: "Process session started.",
      payload: {
        sessionId: input.sessionId,
        tty: input.tty,
      },
    });
  }

  output(input: {
    sessionId: number;
    workspaceId: string;
    stream: "stdout" | "stderr" | "combined";
    text: string;
  }): void {
    const runId = this.runIds.get(runKey(input.workspaceId, input.sessionId));
    if (!runId || !input.text) return;

    const key = runKey(input.workspaceId, input.sessionId);
    const pending = this.pendingOutput.get(key);
    const combinedText = (pending?.text ?? "") + input.text;
    const combinedStream =
      pending && pending.stream !== input.stream ? "combined" : input.stream;
    const redacted = redactForbiddenSensitiveContent(combinedText);
    if (redacted.redacted) {
      this.pendingOutput.delete(key);
      this.recordOutput(runId, combinedStream, redacted.value, true);
      return;
    }

    const lastLineBreak = Math.max(
      combinedText.lastIndexOf("\n"),
      combinedText.lastIndexOf("\r"),
    );
    if (lastLineBreak >= 0) {
      const safe = boundProjectedOutput(combinedText.slice(0, lastLineBreak + 1));
      const remainder = combinedText.slice(lastLineBreak + 1);
      if (remainder) {
        this.pendingOutput.set(key, { stream: input.stream, text: remainder });
      }
      else this.pendingOutput.delete(key);
      this.recordOutput(runId, combinedStream, safe.text, safe.truncated);
      return;
    }

    const characters = Array.from(combinedText);
    if (characters.length <= OUTPUT_REDACTION_WINDOW_CHARACTERS) {
      this.pendingOutput.set(key, { stream: combinedStream, text: combinedText });
      return;
    }
    const splitAt = characters.length - OUTPUT_REDACTION_WINDOW_CHARACTERS;
    this.pendingOutput.set(key, {
      stream: combinedStream,
      text: characters.slice(splitAt).join(""),
    });
    const safe = boundProjectedOutput(characters.slice(0, splitAt).join(""));
    this.recordOutput(runId, combinedStream, safe.text, safe.truncated);
  }

  stopRequested(input: {
    sessionId: number;
    workspaceId: string;
    reason: "interrupt" | "terminate" | "shutdown";
  }): boolean {
    const runId = this.runIds.get(runKey(input.workspaceId, input.sessionId));
    if (!runId) return false;
    const transitioned = this.runs.transitionState(
      runId,
      "stopping",
      `process_${input.reason}`,
    );
    if (!transitioned.ok) return false;
    this.stopRequestedKeys.add(runKey(input.workspaceId, input.sessionId));
    return true;
  }

  stopFailed(input: {
    sessionId: number;
    workspaceId: string;
    reason: "interrupt" | "terminate" | "shutdown";
  }): void {
    const key = runKey(input.workspaceId, input.sessionId);
    const runId = this.runIds.get(key);
    if (!runId) return;
    this.stopRequestedKeys.delete(key);
    this.runs.transitionState(runId, "running", `process_${input.reason}_failed`);
  }

  exited(input: {
    sessionId: number;
    workspaceId: string;
    exitCode?: number;
    signal?: string;
    wallTimeMs: number;
    verification?: ProcessVerificationTarget;
    basisFingerprint?: string;
  }): void {
    const key = runKey(input.workspaceId, input.sessionId);
    const runId = this.runIds.get(key);
    if (!runId) return;
    const stopRequested = this.stopRequestedKeys.has(key);
    this.flushOutput(key, runId);

    this.runs.recordEvent(runId, {
      type: "process.exited",
      timestamp: new Date().toISOString(),
      level: input.exitCode === 0 && !input.signal ? "info" : "error",
      summary: "Process session exited.",
      payload: {
        exitCode: input.exitCode,
        signal: input.signal,
        wallTimeMs: input.wallTimeMs,
      },
    });
    const finalState =
      stopRequested && (input.signal !== undefined || input.exitCode !== 0)
        ? "stopped"
        : input.exitCode === 0 && input.signal === undefined
          ? "completed"
          : "failed";
    const transitioned = this.runs.transitionState(
      runId,
      finalState,
      stopRequested && (input.signal !== undefined || input.exitCode !== 0)
        ? "process_stop_completed"
        : input.signal
          ? "process_signaled"
          : input.exitCode === 0
            ? undefined
            : "process_exit_nonzero",
    );
    if (stopRequested && transitioned.ok) {
      try {
        this.options.onStopOutcome?.({ runId, state: finalState });
      } catch {
        // Audit diagnostics must not change canonical process projection.
      }
    }
    const verificationTarget = this.verificationTargets.get(key);
    if (verificationTarget) {
      this.options.verification?.completed(
        verificationTarget,
        input.exitCode === 0 && input.signal === undefined ? "passed" : "failed",
        input.basisFingerprint,
      );
    }
    this.runIds.delete(key);
    this.stopRequestedKeys.delete(key);
    this.verificationTargets.delete(key);
  }

  private flushOutput(key: string, runId: string): void {
    const pending = this.pendingOutput.get(key);
    if (pending) {
      const safe = boundProjectedOutput(pending.text);
      this.recordOutput(runId, pending.stream, safe.text, safe.truncated);
    }
    this.pendingOutput.delete(key);
  }

  private recordOutput(
    runId: string,
    stream: "stdout" | "stderr" | "combined",
    text: string,
    truncated: boolean,
  ): void {
    this.runs.recordEvent(runId, {
      type: "process.output",
      timestamp: new Date().toISOString(),
      level: "info",
      summary: "Process output received.",
      payload: { stream, text, truncated },
    });
  }
}

export function resolveProcessSessionCapabilities(
  manager: ProcessSessionManager,
  reference: OperationOwnerReference,
): OperationOwnerCapabilities {
  const target = resolveProcessSessionReference(reference);
  if (!target) return { ownerStatus: "unknown", stoppable: false };

  const status = manager.getSessionStatus(target.workspaceId, target.sessionId);
  if (status === "missing") return { ownerStatus: "missing", stoppable: false };
  return { ownerStatus: "available", stoppable: status === "running" };
}

export interface ProcessSessionReference {
  workspaceId: string;
  sessionId: number;
}

export function resolveProcessSessionReference(
  reference: OperationOwnerReference,
): ProcessSessionReference | undefined {
  if (
    reference.kind !== "process_session"
    || reference.source !== "mcp"
    || reference.workspaceId === undefined
    || reference.sourceRunId === undefined
  ) {
    return undefined;
  }
  const match = /^process:([1-9]\d*)$/.exec(reference.sourceRunId);
  if (!match) return undefined;
  const sessionId = Number(match[1]);
  if (!Number.isSafeInteger(sessionId)) return undefined;
  return { workspaceId: reference.workspaceId, sessionId };
}

function runKey(workspaceId: string, sessionId: number): string {
  return `${workspaceId}\u0000${sessionId}`;
}

function sourceRunId(sessionId: number): string {
  return `process:${sessionId}`;
}

function boundProjectedOutput(text: string): { text: string; truncated: boolean } {
  const redacted = redactForbiddenSensitiveContent(text);
  if (redacted.redacted) {
    return { text: redacted.value, truncated: true };
  }
  if (Buffer.byteLength(text, "utf8") <= MAX_PROJECTED_OUTPUT_BYTES) {
    return { text, truncated: false };
  }

  const availableBytes =
    MAX_PROJECTED_OUTPUT_BYTES - Buffer.byteLength(OUTPUT_TRUNCATION_MARKER, "utf8");
  let retained = "";
  let retainedBytes = 0;
  for (const character of Array.from(text)) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (retainedBytes + characterBytes > availableBytes) break;
    retained += character;
    retainedBytes += characterBytes;
  }
  return {
    text: retained + OUTPUT_TRUNCATION_MARKER,
    truncated: true,
  };
}
