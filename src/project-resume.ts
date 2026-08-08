import type { LocalAgentRecord } from "./local-agent-store.js";
import type { RepositoryContext } from "./operations/repository-diff.js";
import type { StoredOperationRun } from "./operations/operation-store.js";
import type { ProjectView } from "./projects/project-types.js";
import type { WorkspaceHandoff } from "./workspace-handoff-store.js";
import type { WorkspaceSession } from "./workspace-store.js";
import { redactForbiddenSensitiveContent } from "./sensitive-content.js";

export interface ProjectResumeFailure {
  source: "local_agent" | "operation";
  id: string;
  code?: string;
  summary: string;
  occurredAt: string;
  retryAt?: string;
  recommendedAction: string;
}

export interface ProjectResumeSnapshot {
  project: Pick<
    ProjectView,
    | "id"
    | "slug"
    | "name"
    | "root"
    | "permissionPreset"
    | "defaultMode"
    | "availability"
    | "unavailableReason"
  >;
  repository: {
    state: RepositoryContext["state"];
    branch?: string;
    head?: string;
    dirtyCount: number;
    dirtyFiles: string[];
    message?: string;
  };
  handoff?: WorkspaceHandoff;
  workspaces: {
    total: number;
    active: number;
    archived: number;
    latestWorkspaceId?: string;
    latestMode?: string;
    lastUsedAt?: string;
  };
  activity: {
    activeRuns: Array<{
      id: string;
      title: string;
      state: string;
      currentAction?: string;
      updatedAt: string;
    }>;
    activeAgents: Array<{
      id: string;
      profileName: string;
      provider: string;
      status: string;
      updatedAt: string;
    }>;
  };
  verification?: {
    runId: string;
    stage: string;
    summary?: string;
    updatedAt: string;
  };
  latestFailure?: ProjectResumeFailure;
  nextAction: string;
  resumeInstruction: string;
}

const ACTIVE_RUN_STATES = new Set(["queued", "running", "blocked", "stopping"]);
const ACTIVE_AGENT_STATES = new Set(["starting", "running"]);

export function createProjectResumeSnapshot(input: {
  project: ProjectView;
  repositoryContext: RepositoryContext;
  handoff?: WorkspaceHandoff;
  workspaceSessions: readonly WorkspaceSession[];
  agents: readonly LocalAgentRecord[];
  runs: readonly StoredOperationRun[];
}): ProjectResumeSnapshot {
  const workspaceSessions = [...input.workspaceSessions]
    .sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt));
  const activeRuns = input.runs
    .filter((run) => ACTIVE_RUN_STATES.has(run.state))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5)
    .map((run) => ({
      id: run.id,
      title: boundText(run.title, 240),
      state: run.state,
      currentAction: run.currentAction ? boundText(run.currentAction, 300) : undefined,
      updatedAt: run.updatedAt,
    }));
  const activeAgents = input.agents
    .filter((agent) =>
      ACTIVE_AGENT_STATES.has(agent.status) && agent.disposition !== "needs_input"
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5)
    .map((agent) => ({
      id: agent.id,
      profileName: agent.profileName,
      provider: agent.provider,
      status: agent.status,
      updatedAt: agent.updatedAt,
    }));
  const latestVerificationRun = [...input.runs]
    .filter((run) =>
      run.assuranceStage === "verified"
      || run.assuranceStage === "verifying"
      || run.assuranceStage === "verification_pending"
      || run.assuranceStage === "result_available"
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const latestFailure = latestProjectFailure(input.agents, input.runs);
  const latestWorkspace = workspaceSessions[0];
  const dirtyFiles = input.repositoryContext.dirty.files
    .slice(0, 10)
    .map((file) => file.path);
  const nextAction = selectNextAction({
    handoff: input.handoff,
    activeRuns,
    activeAgents,
    latestFailure,
    dirtyCount: input.repositoryContext.dirty.total,
    projectAvailable: input.project.availability === "available",
  });

  return {
    project: {
      id: input.project.id,
      slug: input.project.slug,
      name: input.project.name,
      root: input.project.root,
      permissionPreset: input.project.permissionPreset,
      defaultMode: input.project.defaultMode,
      availability: input.project.availability,
      unavailableReason: input.project.unavailableReason,
    },
    repository: {
      state: input.repositoryContext.state,
      branch: input.repositoryContext.branch,
      head: input.repositoryContext.head,
      dirtyCount: input.repositoryContext.dirty.total,
      dirtyFiles,
      message: input.repositoryContext.message,
    },
    handoff: input.handoff,
    workspaces: {
      total: workspaceSessions.length,
      active: workspaceSessions.filter((session) => session.status === "active").length,
      archived: workspaceSessions.filter((session) => session.status === "archived").length,
      latestWorkspaceId: latestWorkspace?.id,
      latestMode: latestWorkspace?.mode,
      lastUsedAt: latestWorkspace?.lastUsedAt,
    },
    activity: {
      activeRuns,
      activeAgents,
    },
    verification: latestVerificationRun ? {
      runId: latestVerificationRun.id,
      stage: latestVerificationRun.assuranceStage,
      summary: latestVerificationRun.currentAction
        ? boundText(latestVerificationRun.currentAction, 300)
        : undefined,
      updatedAt: latestVerificationRun.updatedAt,
    } : undefined,
    latestFailure,
    nextAction,
    resumeInstruction: input.project.availability === "available"
      ? `Call open_project with project="${input.project.slug}" and reuse the returned workspaceId. Reconcile this snapshot with the newly returned repository context before editing.`
      : `Do not open this project until its availability problem is resolved: ${input.project.unavailableReason ?? input.project.availability}.`,
  };
}

export function formatProjectResumeSnapshot(snapshot: ProjectResumeSnapshot): string {
  const lines = [
    `Current project: ${snapshot.project.name} (${snapshot.project.slug})`,
    `Availability: ${snapshot.project.availability}${snapshot.project.unavailableReason ? ` — ${snapshot.project.unavailableReason}` : ""}`,
    snapshot.repository.state === "available"
      ? `Repository: branch=${snapshot.repository.branch ?? "unknown"}; head=${snapshot.repository.head ?? "unknown"}; changed files=${snapshot.repository.dirtyCount}`
      : `Repository: unavailable — ${snapshot.repository.message ?? "current state could not be read"}`,
    snapshot.handoff
      ? `Handoff: ${snapshot.handoff.status}; updated ${snapshot.handoff.updatedAt}; ${snapshot.handoff.summary}`
      : "Handoff: none recorded.",
    snapshot.activity.activeRuns.length > 0
      ? `Active runs: ${snapshot.activity.activeRuns.map((run) => `${run.id} (${run.state}: ${run.currentAction ?? run.title})`).join(" | ")}`
      : "Active runs: none.",
    snapshot.activity.activeAgents.length > 0
      ? `Active agents: ${snapshot.activity.activeAgents.map((agent) => `${agent.id} (${agent.provider}/${agent.status})`).join(" | ")}`
      : "Active agents: none.",
    snapshot.verification
      ? `Latest verification: ${snapshot.verification.stage} on ${snapshot.verification.runId} at ${snapshot.verification.updatedAt}.`
      : "Latest verification: none retained.",
    snapshot.latestFailure
      ? `Latest failure: ${snapshot.latestFailure.source} ${snapshot.latestFailure.id}; code=${snapshot.latestFailure.code ?? "unknown"}; ${snapshot.latestFailure.summary}${snapshot.latestFailure.retryAt ? ` Retry after ${snapshot.latestFailure.retryAt}.` : ""} ${snapshot.latestFailure.recommendedAction}`
      : "Latest failure: none retained.",
    `Next action: ${snapshot.nextAction}`,
    snapshot.resumeInstruction,
  ];
  return lines.join("\n");
}

function latestProjectFailure(
  agents: readonly LocalAgentRecord[],
  runs: readonly StoredOperationRun[],
): ProjectResumeFailure | undefined {
  const failures: ProjectResumeFailure[] = [];
  for (const agent of agents) {
    if (agent.status !== "error" || !agent.error) continue;
    failures.push({
      source: "local_agent",
      id: agent.id,
      code: agent.failureCode,
      summary: safeFailureSummary(agent.error),
      occurredAt: agent.updatedAt,
      retryAt: agent.retryAt,
      recommendedAction: agentFailureAction(agent),
    });
  }
  for (const run of runs) {
    if (run.state !== "failed") continue;
    failures.push({
      source: "operation",
      id: run.id,
      code: run.failureCode,
      summary: safeFailureSummary(
        run.failureSummary ?? run.currentAction ?? "The operation failed; inspect retained evidence.",
      ),
      occurredAt: run.updatedAt,
      recommendedAction: "Inspect the retained operation events and evidence before retrying. Do not assume a retry will be safe.",
    });
  }
  return failures.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];
}

function agentFailureAction(agent: LocalAgentRecord): string {
  if (agent.failureCode === "usage_limit" || agent.failureCode === "rate_limited") {
    return "Helix did not switch providers automatically. Retry after the stated reset time, or explicitly choose another configured provider/profile.";
  }
  if (agent.failureCode === "authentication_failed") {
    return "Repair the provider sign-in or credential state, then start a new explicit run.";
  }
  if (agent.failureCode === "policy_denied") {
    return "Review the project permission preset and requested write mode before retrying.";
  }
  if (agent.failureCode === "provider_unavailable") {
    return "Check the provider installation and availability diagnostics before starting another worker.";
  }
  if (agent.failureCode === "invalid_configuration") {
    return "Correct the configured profile, model, or provider settings before retrying.";
  }
  return "Inspect the agent status and retained operation evidence before retrying.";
}

function selectNextAction(input: {
  handoff?: WorkspaceHandoff;
  activeRuns: ProjectResumeSnapshot["activity"]["activeRuns"];
  activeAgents: ProjectResumeSnapshot["activity"]["activeAgents"];
  latestFailure?: ProjectResumeFailure;
  dirtyCount: number;
  projectAvailable: boolean;
}): string {
  if (!input.projectAvailable) return "Resolve the project availability problem.";
  const recorded = input.handoff?.nextActions.find((action) => action.trim().length > 0);
  if (recorded) return boundText(recorded, 600);
  if (input.activeRuns.length > 0) {
    return `Continue observing ${input.activeRuns[0]!.id}: ${input.activeRuns[0]!.currentAction ?? input.activeRuns[0]!.title}`;
  }
  if (input.activeAgents.length > 0) {
    return `Inspect ${input.activeAgents[0]!.id} before starting another agent.`;
  }
  if (input.latestFailure) return input.latestFailure.recommendedAction;
  if (input.dirtyCount > 0) return "Inspect and reconcile the current repository changes before making new edits.";
  return "Open the project, reconcile the repository with the handoff, and continue from the current goal.";
}

function boundText(value: string, maximum: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`;
}

function safeFailureSummary(value: string): string {
  const redacted = redactForbiddenSensitiveContent(value);
  return boundText(redacted.value, 500);
}
