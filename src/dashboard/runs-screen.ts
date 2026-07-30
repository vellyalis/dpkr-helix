import type {
  OperationAssuranceStage,
  OperationEvidence,
  OperationRunState,
  VerificationType,
} from "../operations/operation-contracts.js";
import type {
  StoredOperationEvent,
  StoredOperationRun,
} from "../operations/operation-store.js";

export type RunTone = "neutral" | "info" | "success" | "warning" | "danger";
export type RunGroup =
  | "Now"
  | "Action"
  | "Review"
  | "Archive";

export const RUN_QUEUE_ORDER: RunGroup[] = [
  "Now",
  "Action",
  "Review",
  "Archive",
];

export interface RunPresentation {
  label: string;
  tone: RunTone;
}

export interface RunSummaryCounts {
  now: number;
  action: number;
  review: number;
  archive: number;
}

export interface RunFilters {
  projectId: string;
  source: string;
  kind: string;
  state: string;
  assuranceStage: string;
  timeRange: "" | "hour" | "day" | "week";
}

export interface ActivityGroup {
  event: StoredOperationEvent;
  count: number;
  firstSequence: number;
  lastSequence: number;
}

export type TerminalAnsiColor =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "bright-black"
  | "bright-red"
  | "bright-green"
  | "bright-yellow"
  | "bright-blue"
  | "bright-magenta"
  | "bright-cyan"
  | "bright-white";

export interface TerminalTextStyle {
  foreground?: TerminalAnsiColor;
  background?: TerminalAnsiColor;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
}

export interface TerminalSegment {
  text: string;
  style: TerminalTextStyle;
  matched?: boolean;
}

export interface TerminalEntry {
  cursor: number;
  sequence: number;
  timestamp: string;
  stream: "stdout" | "stderr" | "combined" | "mcp" | "file" | "process";
  segments: TerminalSegment[];
  plainText: string;
  truncated: boolean;
}

export interface AgentOutputItem {
  cursor: number;
  sequence: number;
  timestamp: string;
  agentId: string;
  text: string;
  truncated: boolean;
}

export interface AgentOutputProjection {
  messages: AgentOutputItem[];
  finalResponse?: AgentOutputItem;
  agentId?: string;
  hasOutput: boolean;
  truncated: boolean;
}

export interface EvidenceChecklistItem extends OperationEvidence {
  missingRequirement?: string;
  sourceLabel: string;
}

const EVIDENCE_TYPES: VerificationType[] = [
  "typecheck",
  "tests",
  "build",
  "review",
  "goal_state",
];

const TERMINAL_ANSI_COLORS: TerminalAnsiColor[] = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "bright-black",
  "bright-red",
  "bright-green",
  "bright-yellow",
  "bright-blue",
  "bright-magenta",
  "bright-cyan",
  "bright-white",
];

export function isLiveRunState(state: OperationRunState): boolean {
  return state === "queued"
    || state === "running"
    || state === "blocked"
    || state === "stopping";
}

export function runPresentation(
  state: OperationRunState,
  assuranceStage: OperationAssuranceStage,
): RunPresentation {
  if (state === "queued") return { label: "Queued", tone: "neutral" };
  if (state === "running") return { label: "Running", tone: "info" };
  if (state === "blocked") return { label: "Blocked", tone: "warning" };
  if (state === "stopping") return { label: "Stopping", tone: "warning" };
  if (state === "stopped") return { label: "Stopped", tone: "neutral" };
  if (state === "failed") return { label: "Failed", tone: "danger" };
  if (assuranceStage === "verified") return { label: "Verified", tone: "success" };
  if (assuranceStage === "verifying") return { label: "Verifying", tone: "info" };
  if (assuranceStage === "verification_pending") {
    return { label: "Result available — verification pending", tone: "warning" };
  }
  if (assuranceStage === "result_available") {
    return { label: "Result available", tone: "info" };
  }
  return { label: "Completed", tone: "neutral" };
}

export function runGroup(run: StoredOperationRun): RunGroup {
  if (run.state === "queued" || run.state === "running") return "Now";
  if (
    run.state === "blocked"
    || run.state === "stopping"
    || run.state === "failed"
  ) {
    return "Action";
  }
  if (run.state === "stopped") return "Archive";
  if (
    run.assuranceStage === "result_available"
    || run.assuranceStage === "verification_pending"
    || run.assuranceStage === "verifying"
  ) {
    return "Review";
  }
  return "Archive";
}

export function sortRunsForRail(runs: StoredOperationRun[]): StoredOperationRun[] {
  return [...runs].sort((left, right) => {
    const priority = groupPriority(runGroup(left)) - groupPriority(runGroup(right));
    return priority || right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function filterRuns(
  runs: StoredOperationRun[],
  filters: RunFilters,
  now = Date.now(),
): StoredOperationRun[] {
  const minimumUpdatedAt = filters.timeRange
    ? now - {
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
      }[filters.timeRange]
    : undefined;
  return runs.filter((run) =>
    (!filters.projectId || run.projectId === filters.projectId)
    && (!filters.source || run.source === filters.source)
    && (!filters.kind || run.kind === filters.kind)
    && (!filters.state || run.state === filters.state)
    && (!filters.assuranceStage || run.assuranceStage === filters.assuranceStage)
    && (
      minimumUpdatedAt === undefined
      || Date.parse(run.updatedAt) >= minimumUpdatedAt
    )
  );
}

export function topLevelRuns(
  runs: StoredOperationRun[],
): StoredOperationRun[] {
  const runIds = new Set(runs.map(({ id }) => id));
  return runs.filter((run) =>
    !run.parentRunId || !runIds.has(run.parentRunId)
  );
}

export function relatedRunIds(
  runs: StoredOperationRun[],
  selectedRunId: string | undefined,
): string[] {
  if (!selectedRunId) return [];
  const selectedRun = runs.find((run) => run.id === selectedRunId);
  const rootRunId = selectedRun?.parentRunId
    && runs.some((run) => run.id === selectedRun.parentRunId)
    ? selectedRun.parentRunId
    : selectedRunId;
  return [
    rootRunId,
    ...runs
      .filter((run) => run.parentRunId === rootRunId)
      .map((run) => run.id),
  ];
}

export function stoppableRelatedRun(
  runs: StoredOperationRun[],
  selectedRunId: string | undefined,
): StoredOperationRun | undefined {
  if (!selectedRunId) return undefined;
  const selectedRun = runs.find((run) => run.id === selectedRunId);
  if (selectedRun?.stoppable && isLiveRunState(selectedRun.state)) {
    return selectedRun;
  }
  const relatedIds = new Set(relatedRunIds(runs, selectedRunId));
  return runs.find((run) =>
    relatedIds.has(run.id)
    && run.stoppable
    && isLiveRunState(run.state)
  );
}

export function summarizeRuns(runs: StoredOperationRun[]): RunSummaryCounts {
  return runs.reduce<RunSummaryCounts>((summary, run) => {
    const group = runGroup(run);
    if (group === "Now") summary.now += 1;
    if (group === "Action") summary.action += 1;
    if (group === "Review") summary.review += 1;
    if (group === "Archive") summary.archive += 1;
    return summary;
  }, { now: 0, action: 0, review: 0, archive: 0 });
}

export function nextActionForRun(run: StoredOperationRun): string {
  const currentAction = run.currentAction?.trim();
  if (currentAction) return currentAction;
  if (run.state === "queued" || run.state === "running") {
    const phase = run.phase?.trim();
    if (phase) return phase;
  }
  if (run.state === "queued") return "Wait for execution to start";
  if (run.state === "running") return "Follow live activity";
  if (run.state === "blocked") return "Resolve the blocking condition";
  if (run.state === "stopping") return "Wait for observed worker exit";
  if (run.state === "failed") return "Inspect failure and retained evidence";
  if (run.state === "stopped") return "No action required";
  if (run.assuranceStage === "verifying") return "Follow verification progress";
  if (
    run.assuranceStage === "result_available"
    || run.assuranceStage === "verification_pending"
  ) {
    return "Review result and verification evidence";
  }
  return "No action required";
}

export function groupActivityEvents(events: StoredOperationEvent[]): ActivityGroup[] {
  const ordered = [...events].sort((left, right) => left.cursor - right.cursor);
  const groups: ActivityGroup[] = [];
  for (const event of ordered) {
    const previous = groups.at(-1);
    if (
      event.type === "process.output"
      && previous?.event.type === "process.output"
      && previous.event.runId === event.runId
      && previous.event.payload.stream === event.payload.stream
      && previous.lastSequence + 1 === event.sequence
    ) {
      previous.event = event;
      previous.count += 1;
      previous.lastSequence = event.sequence;
      continue;
    }
    groups.push({
      event,
      count: 1,
      firstSequence: event.sequence,
      lastSequence: event.sequence,
    });
  }
  return groups;
}

export function changedFilesFromEvents(events: StoredOperationEvent[]): string[] {
  const paths = new Set<string>();
  for (const event of events) {
    if (event.type === "file.changed") paths.add(event.payload.relativePath);
  }
  return [...paths];
}

export function evidenceChecklist(
  evidence: OperationEvidence[],
): EvidenceChecklistItem[] {
  const byType = new Map(evidence.map((item) => [item.type, item]));
  return EVIDENCE_TYPES.map((type) => {
    const item = byType.get(type);
    if (!item) {
      return {
        type,
        state: "not_run",
        sourceLabel: "No explicit evidence retained",
        missingRequirement: missingEvidenceMessage(type),
      };
    }
    return {
      ...item,
      sourceLabel: item.sourceEventSequence === undefined
        ? "Stored evidence record"
        : `Operation event ${item.sourceEventSequence}`,
      missingRequirement: item.state === "not_run"
        ? missingEvidenceMessage(type)
        : item.state === "failed"
          ? `${evidenceLabel(type)} did not pass.`
          : undefined,
    };
  });
}

export function terminalEntriesFromEvents(
  events: StoredOperationEvent[],
): TerminalEntry[] {
  const style = defaultTerminalStyle();
  const entries: TerminalEntry[] = [];
  for (const event of [...events].sort((left, right) => left.cursor - right.cursor)) {
    const projection = terminalProjection(event);
    if (!projection) continue;
    const segments = event.type === "process.output"
      ? parseSafeAnsi(projection.text, style)
      : plainTerminalSegments(projection.text);
    entries.push({
      cursor: event.cursor,
      sequence: event.sequence,
      timestamp: event.timestamp,
      stream: projection.stream,
      segments,
      plainText: segments.map(({ text }) => text).join(""),
      truncated: event.type === "process.output" && event.payload.truncated,
    });
  }
  return entries;
}

export function agentOutputFromEvents(
  events: StoredOperationEvent[],
): AgentOutputProjection {
  const messages: AgentOutputItem[] = [];
  let finalResponse: AgentOutputItem | undefined;
  let agentId: string | undefined;
  let truncated = false;
  for (const event of [...events].sort((left, right) => left.cursor - right.cursor)) {
    if (
      event.type !== "agent.result_available"
      && (event.type !== "agent.message" || event.payload.role !== "assistant")
    ) {
      continue;
    }
    const item = {
      cursor: event.cursor,
      sequence: event.sequence,
      timestamp: event.timestamp,
      agentId: event.payload.agentId,
      text: event.payload.text,
      truncated: event.payload.truncated,
    };
    agentId = item.agentId;
    truncated ||= item.truncated;
    if (event.type === "agent.result_available") finalResponse = item;
    else messages.push(item);
  }
  return {
    messages,
    finalResponse,
    agentId,
    hasOutput: messages.length > 0 || finalResponse !== undefined,
    truncated,
  };
}

export function agentOutputAvailable(
  run: StoredOperationRun | undefined,
  projection: AgentOutputProjection,
): boolean {
  return run?.kind === "local_agent"
    && (projection.hasOutput || run.state === "failed");
}

export function agentResultStateLabel(
  run: StoredOperationRun,
  projection: AgentOutputProjection,
): string {
  if (projection.finalResponse) return "Result available";
  if (run.state === "failed") return "Provider failed";
  if (isLiveRunState(run.state)) return "Streaming";
  return "No result retained";
}

function missingEvidenceMessage(type: VerificationType): string {
  return `No explicit ${evidenceLabel(type).toLocaleLowerCase()} result is retained.`;
}

function evidenceLabel(type: VerificationType): string {
  return type === "goal_state" ? "Goal/Project State" : type;
}

export function countTerminalMatches(
  entries: TerminalEntry[],
  query: string,
): number {
  const normalized = query.toLocaleLowerCase().trim();
  if (!normalized) return 0;
  return entries.reduce((total, entry) => {
    const text = entry.plainText.toLocaleLowerCase();
    let count = 0;
    let offset = 0;
    while (offset <= text.length - normalized.length) {
      const match = text.indexOf(normalized, offset);
      if (match < 0) break;
      count += 1;
      offset = match + normalized.length;
    }
    return total + count;
  }, 0);
}

export function highlightTerminalSegments(
  segments: TerminalSegment[],
  query: string,
): TerminalSegment[] {
  const normalized = query.toLocaleLowerCase().trim();
  if (!normalized) return segments;
  const text = segments.map((segment) => segment.text).join("");
  const lowerText = text.toLocaleLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];
  let offset = 0;
  while (offset <= lowerText.length - normalized.length) {
    const start = lowerText.indexOf(normalized, offset);
    if (start < 0) break;
    ranges.push({ start, end: start + normalized.length });
    offset = start + normalized.length;
  }
  if (ranges.length === 0) return segments;

  const highlighted: TerminalSegment[] = [];
  let segmentStart = 0;
  for (const segment of segments) {
    const segmentEnd = segmentStart + segment.text.length;
    const boundaries = new Set([segmentStart, segmentEnd]);
    for (const range of ranges) {
      if (range.start > segmentStart && range.start < segmentEnd) {
        boundaries.add(range.start);
      }
      if (range.end > segmentStart && range.end < segmentEnd) {
        boundaries.add(range.end);
      }
    }
    const ordered = [...boundaries].sort((left, right) => left - right);
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const start = ordered[index]!;
      const end = ordered[index + 1]!;
      highlighted.push({
        text: segment.text.slice(start - segmentStart, end - segmentStart),
        style: segment.style,
        matched: ranges.some((range) => range.start < end && range.end > start),
      });
    }
    segmentStart = segmentEnd;
  }
  return highlighted;
}

export function formatRunDuration(run: StoredOperationRun, now = Date.now()): string {
  const start = Date.parse(run.startedAt);
  const end = run.finishedAt ? Date.parse(run.finishedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Unknown duration";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function shortRunId(id: string): string {
  return id.length <= 12 ? id : id.slice(-10);
}

function groupPriority(group: RunGroup): number {
  return RUN_QUEUE_ORDER.indexOf(group);
}

function terminalProjection(
  event: StoredOperationEvent,
): { stream: TerminalEntry["stream"]; text: string } | undefined {
  switch (event.type) {
    case "tool.started":
      return { stream: "mcp", text: `> ${event.payload.toolName}\n` };
    case "tool.completed":
      return {
        stream: "mcp",
        text: `[ok] ${event.payload.toolName}${
          event.payload.durationMs === undefined ? "" : ` ${event.payload.durationMs}ms`
        }\n`,
      };
    case "tool.failed":
      return { stream: "mcp", text: `[failed] ${event.payload.toolName}\n` };
    case "workspace.opened":
      return { stream: "mcp", text: `@ workspace ${event.payload.workspaceId}\n` };
    case "file.read":
      return { stream: "file", text: `[read] ${event.payload.relativePath}\n` };
    case "file.changed":
      return {
        stream: "file",
        text: `[${event.payload.operation}] ${event.payload.relativePath}\n`,
      };
    case "process.started":
      return {
        stream: "process",
        text: `$ process ${event.payload.sessionId} started${
          event.payload.tty ? " (tty)" : ""
        }\n`,
      };
    case "process.output":
      return { stream: event.payload.stream, text: event.payload.text };
    case "process.exited":
      return {
        stream: "process",
        text: `[exit ${
          event.payload.signal ?? event.payload.exitCode ?? "unknown"
        }] ${event.payload.wallTimeMs}ms\n`,
      };
    case "warning":
      return { stream: "mcp", text: `[warning] ${event.payload.code}\n` };
    default:
      return undefined;
  }
}

function plainTerminalSegments(text: string): TerminalSegment[] {
  return [{ text, style: defaultTerminalStyle() }];
}

function defaultTerminalStyle(): TerminalTextStyle {
  return {
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    inverse: false,
  };
}

function resetTerminalStyle(style: TerminalTextStyle): void {
  delete style.foreground;
  delete style.background;
  style.bold = false;
  style.dim = false;
  style.italic = false;
  style.underline = false;
  style.inverse = false;
}

function parseSafeAnsi(
  text: string,
  style: TerminalTextStyle,
): TerminalSegment[] {
  const segments: TerminalSegment[] = [];
  let buffer = "";
  const flush = (): void => {
    if (!buffer) return;
    segments.push({ text: buffer, style: { ...style } });
    buffer = "";
  };

  for (let index = 0; index < text.length;) {
    const code = text.charCodeAt(index);
    if (code === 0x1b) {
      flush();
      const consumed = consumeEscapeSequence(text, index, style);
      index = consumed > index ? consumed : index + 1;
      continue;
    }
    if (code === 0x9b) {
      flush();
      index = consumeCsiSequence(text, index + 1, style);
      continue;
    }
    if (
      code === 0x90
      || code === 0x98
      || code === 0x9d
      || code === 0x9e
      || code === 0x9f
    ) {
      flush();
      index = consumeControlString(text, index + 1);
      continue;
    }
    if (code === 0x0d) {
      if (text.charCodeAt(index + 1) === 0x0a) index += 1;
      buffer += "\n";
      index += 1;
      continue;
    }
    if (code === 0x0a || code === 0x09) {
      buffer += text[index];
      index += 1;
      continue;
    }
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      index += 1;
      continue;
    }
    buffer += text[index];
    index += 1;
  }
  flush();
  return segments;
}

function consumeEscapeSequence(
  text: string,
  start: number,
  style: TerminalTextStyle,
): number {
  const kind = text[start + 1];
  if (kind === "[") {
    return consumeCsiSequence(text, start + 2, style);
  }
  if (kind === "]" || kind === "P" || kind === "X" || kind === "^" || kind === "_") {
    return consumeControlString(text, start + 2);
  }
  return Math.min(text.length, start + 2);
}

function consumeCsiSequence(
  text: string,
  parametersStart: number,
  style: TerminalTextStyle,
): number {
  for (let index = parametersStart; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x40 || code > 0x7e) continue;
    if (text[index] === "m") {
      const raw = text.slice(parametersStart, index);
      const params = raw === ""
        ? [0]
        : raw.split(";").map((value) => Number.parseInt(value, 10));
      if (params.every(Number.isFinite)) applySgr(params, style);
    }
    return index + 1;
  }
  return text.length;
}

function consumeControlString(text: string, contentStart: number): number {
  for (let index = contentStart; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0x07 || code === 0x9c) return index + 1;
    if (code === 0x1b && text[index + 1] === "\\") return index + 2;
  }
  return text.length;
}

function applySgr(params: number[], style: TerminalTextStyle): void {
  for (let index = 0; index < params.length; index += 1) {
    const code = params[index]!;
    if (code === 0) resetTerminalStyle(style);
    else if (code === 1) style.bold = true;
    else if (code === 2) style.dim = true;
    else if (code === 3) style.italic = true;
    else if (code === 4) style.underline = true;
    else if (code === 7) style.inverse = true;
    else if (code === 22) {
      style.bold = false;
      style.dim = false;
    }
    else if (code === 23) style.italic = false;
    else if (code === 24) style.underline = false;
    else if (code === 27) style.inverse = false;
    else if (code >= 30 && code <= 37) style.foreground = TERMINAL_ANSI_COLORS[code - 30];
    else if (code === 39) delete style.foreground;
    else if (code >= 40 && code <= 47) style.background = TERMINAL_ANSI_COLORS[code - 40];
    else if (code === 49) delete style.background;
    else if (code >= 90 && code <= 97) {
      style.foreground = TERMINAL_ANSI_COLORS[8 + code - 90];
    }
    else if (code >= 100 && code <= 107) {
      style.background = TERMINAL_ANSI_COLORS[8 + code - 100];
    }
    else if (code === 38 || code === 48) {
      const mode = params[index + 1];
      index += mode === 2 ? 4 : mode === 5 ? 2 : 0;
    }
  }
}
