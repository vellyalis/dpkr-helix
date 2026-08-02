import type { LocalAgentRecord } from "../local-agent-store.js";
import type { StoredOperationRun } from "../operations/operation-store.js";
import type { ProjectView } from "../projects/project-types.js";

export type AgentPresentationState =
  | "running"
  | "input_required"
  | "result_available"
  | "failed"
  | "stale"
  | "stopped";

export interface AgentScreenRecord {
  session: LocalAgentRecord;
  linkedRun?: StoredOperationRun;
  project?: ProjectView;
  state: AgentPresentationState;
  resumable: boolean;
}

export interface AgentSummary {
  running: number;
  inputRequired: number;
  resultAvailable: number;
  failed: number;
  stale: number;
}

const ACTIVE_AGENT_STATES = new Set(["starting", "running"]);

export function buildAgentScreenRecords(
  sessions: LocalAgentRecord[],
  runs: StoredOperationRun[],
  projects: ProjectView[],
): AgentScreenRecord[] {
  return sessions
    .map((session) => {
      const linkedRun = runs
        .filter((run) => run.kind === "local_agent" && run.sourceRunId === session.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const project = projects.find((candidate) =>
        linkedRun?.projectId === candidate.id
        || isWithinRoot(session.workspaceRoot, candidate.root)
      );
      const state = agentPresentationState(session, linkedRun);
      return {
        session,
        linkedRun,
        project,
        state,
        resumable: Boolean(
          session.providerSessionId
          && !ACTIVE_AGENT_STATES.has(session.status)
          && state !== "stale",
        ),
      };
    })
    .sort((a, b) => b.session.updatedAt.localeCompare(a.session.updatedAt));
}

export function summarizeAgents(records: AgentScreenRecord[]): AgentSummary {
  return records.reduce<AgentSummary>((summary, record) => {
    if (record.state === "running") summary.running += 1;
    if (record.state === "input_required") summary.inputRequired += 1;
    if (record.state === "result_available") summary.resultAvailable += 1;
    if (record.state === "failed") summary.failed += 1;
    if (record.state === "stale") summary.stale += 1;
    return summary;
  }, {
    running: 0,
    inputRequired: 0,
    resultAvailable: 0,
    failed: 0,
    stale: 0,
  });
}

export function filterAgentRecords(
  records: AgentScreenRecord[],
  search: string,
): AgentScreenRecord[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return records;
  return records.filter(({ session, linkedRun, project, state }) => [
    session.id,
    session.providerSessionId,
    session.profileName,
    session.provider,
    session.model,
    session.thinking,
    session.disposition,
    session.question,
    session.workspaceId,
    session.workspaceRoot,
    project?.name,
    project?.slug,
    linkedRun?.id,
    linkedRun?.state,
    linkedRun?.assuranceStage,
    state,
  ].some((value) => value?.toLocaleLowerCase().includes(query)));
}

export function agentPresentationState(
  session: LocalAgentRecord,
  linkedRun?: StoredOperationRun,
): AgentPresentationState {
  if (
    ACTIVE_AGENT_STATES.has(session.status)
    && linkedRun?.failureCode === "owner_unavailable_after_restart"
  ) {
    return "stale";
  }
  if (session.status === "error" || linkedRun?.state === "failed") return "failed";
  if (ACTIVE_AGENT_STATES.has(session.status)) return "running";
  if (session.disposition === "needs_input") return "input_required";
  if (
    session.latestResponse !== undefined
    || linkedRun?.assuranceStage === "result_available"
    || linkedRun?.assuranceStage === "verification_pending"
    || linkedRun?.assuranceStage === "verifying"
    || linkedRun?.assuranceStage === "verified"
  ) {
    return "result_available";
  }
  return "stopped";
}

function isWithinRoot(path: string, root: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(root);
  return normalizedPath === normalizedRoot
    || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function normalizePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  return /^[A-Za-z]:/.test(normalized) ? normalized.toLocaleLowerCase() : normalized;
}
