import { Buffer } from "node:buffer";
import {
  isLocalAgentProvider,
  type LocalAgentProvider,
} from "../local-agent-profiles.js";
import type { LocalAgentObservation } from "../local-agent-service.js";
import type { LocalAgentRecord } from "../local-agent-store.js";
import { redactForbiddenSensitiveContent } from "../sensitive-content.js";
import type { OperationRunService } from "./operation-run-service.js";
import type { OperationStore, StoredOperationRun } from "./operation-store.js";

const MAX_AGENT_TEXT_BYTES = 8 * 1_024;
const AGENT_TEXT_REDACTION_WINDOW_CHARACTERS = 128;
const AGENT_TEXT_TRUNCATION_MARKER = "\n... projected agent text truncated ...";
const TERMINAL_STATES = new Set(["completed", "failed", "stopped"]);

type LocalAgentRunLookup = Pick<OperationStore, "findRunBySource">;

export class LocalAgentOperationProjector implements LocalAgentObservation {
  private readonly pendingMessages = new Map<string, string>();

  constructor(
    private readonly runs: OperationRunService,
    private readonly lookup: LocalAgentRunLookup,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  created(record: LocalAgentRecord): void {
    this.isolate(() => {
      const run = this.startRun(record);
      if (run) this.recordStatus(run.id, record);
    });
  }

  statusChanged(record: LocalAgentRecord): void {
    this.isolate(() => {
      const run = this.ensureActiveRun(record);
      if (!run) return;
      this.recordStatus(run.id, record);
      if (record.status === "error" || record.status === "stopped") {
        this.flushMessage(run.id, record.id);
        this.runs.transitionState(
          run.id,
          record.status === "error" ? "failed" : "stopped",
          record.status === "error" ? "local_agent_failed" : "local_agent_stopped",
        );
      }
    });
  }

  assistantMessage(record: LocalAgentRecord, text: string): void {
    this.isolate(() => {
      if (!text) return;
      const run = this.ensureActiveRun(record);
      if (!run) return;
      const combined = (this.pendingMessages.get(run.id) ?? "") + text;
      const redacted = redactForbiddenSensitiveContent(combined);
      if (redacted.redacted) {
        this.pendingMessages.delete(run.id);
        this.recordMessage(run.id, record.id, redacted.value, true);
        return;
      }

      const lastLineBreak = Math.max(
        combined.lastIndexOf("\n"),
        combined.lastIndexOf("\r"),
      );
      if (lastLineBreak >= 0) {
        const safe = boundAgentText(combined.slice(0, lastLineBreak + 1));
        const remainder = combined.slice(lastLineBreak + 1);
        if (remainder) this.pendingMessages.set(run.id, remainder);
        else this.pendingMessages.delete(run.id);
        this.recordMessage(run.id, record.id, safe.text, safe.truncated);
        return;
      }

      const characters = Array.from(combined);
      if (characters.length <= AGENT_TEXT_REDACTION_WINDOW_CHARACTERS) {
        this.pendingMessages.set(run.id, combined);
        return;
      }
      const splitAt = characters.length - AGENT_TEXT_REDACTION_WINDOW_CHARACTERS;
      this.pendingMessages.set(run.id, characters.slice(splitAt).join(""));
      const safe = boundAgentText(characters.slice(0, splitAt).join(""));
      this.recordMessage(run.id, record.id, safe.text, safe.truncated);
    });
  }

  resultAvailable(record: LocalAgentRecord): void {
    this.isolate(() => {
      const run = this.ensureActiveRun(record);
      if (!run || record.latestResponse === undefined) return;
      this.flushMessage(run.id, record.id);
      const safe = boundAgentText(record.latestResponse);
      this.runs.recordEvent(run.id, {
        type: "agent.result_available",
        timestamp: this.now(),
        level: "info",
        summary: "Local-agent result is available.",
        payload: {
          agentId: record.id,
          text: safe.text,
          truncated: safe.truncated,
        },
      });
      this.runs.transitionAssurance(
        run.id,
        "result_available",
        "operation_owner",
        "local_agent_result_available",
      );
      this.runs.transitionState(run.id, "completed");
    });
  }

  private ensureActiveRun(record: LocalAgentRecord): StoredOperationRun | undefined {
    const source = sourceFor(record);
    if (!source) return undefined;
    const current = this.lookup.findRunBySource(
      "local_agent",
      source,
      record.id,
    );
    return !current || TERMINAL_STATES.has(current.state)
      ? this.startRun(record)
      : current;
  }

  private startRun(record: LocalAgentRecord): StoredOperationRun | undefined {
    const source = sourceFor(record);
    if (!source) return undefined;
    const created = this.runs.startRun({
      kind: "local_agent",
      source,
      sourceRunId: record.id,
      workspaceId: record.workspaceId,
      title: `Local agent ${record.id}`,
      state: "running",
      assuranceStage: "working",
    });
    return created.ok ? created.value : undefined;
  }

  private recordStatus(runId: string, record: LocalAgentRecord): void {
    this.runs.recordEvent(runId, {
      type: "agent.status_changed",
      timestamp: this.now(),
      level: record.status === "error" ? "error" : "info",
      summary: `Local-agent status changed to ${record.status}.`,
      payload: {
        agentId: record.id,
        status: record.status,
      },
    });
  }

  private flushMessage(runId: string, agentId: string): void {
    const pending = this.pendingMessages.get(runId);
    if (pending) {
      const safe = boundAgentText(pending);
      this.recordMessage(runId, agentId, safe.text, safe.truncated);
    }
    this.pendingMessages.delete(runId);
  }

  private recordMessage(
    runId: string,
    agentId: string,
    text: string,
    truncated: boolean,
  ): void {
    this.runs.recordEvent(runId, {
      type: "agent.message",
      timestamp: this.now(),
      level: "info",
      summary: "Local-agent assistant message received.",
      payload: {
        agentId,
        role: "assistant",
        text,
        truncated,
      },
    });
  }

  private isolate(action: () => void): void {
    try {
      action();
    } catch {
      // Projection/store failures must not change local-agent behavior.
    }
  }
}

function sourceFor(record: LocalAgentRecord): LocalAgentProvider | undefined {
  return isLocalAgentProvider(record.provider) ? record.provider : undefined;
}

function boundAgentText(text: string): { text: string; truncated: boolean } {
  const redacted = redactForbiddenSensitiveContent(text);
  if (redacted.redacted) return { text: redacted.value, truncated: true };
  if (Buffer.byteLength(text, "utf8") <= MAX_AGENT_TEXT_BYTES) {
    return { text, truncated: false };
  }

  const availableBytes =
    MAX_AGENT_TEXT_BYTES - Buffer.byteLength(AGENT_TEXT_TRUNCATION_MARKER, "utf8");
  let retained = "";
  let retainedBytes = 0;
  for (const character of Array.from(text)) {
    const bytes = Buffer.byteLength(character, "utf8");
    if (retainedBytes + bytes > availableBytes) break;
    retained += character;
    retainedBytes += bytes;
  }
  return {
    text: retained + AGENT_TEXT_TRUNCATION_MARKER,
    truncated: true,
  };
}
