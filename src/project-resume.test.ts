import assert from "node:assert/strict";
import type { LocalAgentRecord } from "./local-agent-store.js";
import type { StoredOperationRun } from "./operations/operation-store.js";
import {
  createProjectResumeSnapshot,
  formatProjectResumeSnapshot,
} from "./project-resume.js";
import type { WorkspaceHandoff } from "./workspace-handoff-store.js";
import type { WorkspaceSession } from "./workspace-store.js";

const handoff: WorkspaceHandoff = {
  root: "C:\\repo",
  status: "in_progress",
  summary: "Resume the current implementation without restarting completed work.",
  completed: ["Repository inspection complete."],
  nextActions: ["Run the focused provider test, then inspect the diff."],
  verification: ["Typecheck passed."],
  risks: [],
  activeAgents: [],
  updatedAt: "2026-08-08T10:00:00.000Z",
};
const workspaceSessions: WorkspaceSession[] = [
  {
    id: "ws_old",
    root: "C:\\repo",
    projectId: "prj_resume",
    status: "archived",
    mode: "checkout",
    managed: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    lastUsedAt: "2026-08-02T00:00:00.000Z",
  },
  {
    id: "ws_current",
    root: "C:\\repo",
    projectId: "prj_resume",
    status: "active",
    mode: "checkout",
    managed: false,
    createdAt: "2026-08-08T09:00:00.000Z",
    lastUsedAt: "2026-08-08T10:30:00.000Z",
  },
];
const agents: LocalAgentRecord[] = [
  {
    id: "agt_quota",
    workspaceId: "ws_current",
    workspaceRoot: "C:\\repo",
    profileName: "codex-explorer",
    provider: "codex",
    status: "error",
    error: "You've hit your usage limit. Try again at 12:34 PM.",
    failureCode: "usage_limit",
    retryAt: "2026-08-08T03:34:00.000Z",
    createdAt: "2026-08-08T10:10:00.000Z",
    updatedAt: "2026-08-08T10:20:00.000Z",
  },
];
const runs: StoredOperationRun[] = [
  run("op_verified", {
    state: "completed",
    assuranceStage: "verified",
    updatedAt: "2026-08-08T10:15:00.000Z",
  }),
];

const snapshot = createProjectResumeSnapshot({
  project: {
    id: "prj_resume",
    slug: "resume-project",
    name: "Resume Project",
    root: "C:\\repo",
    permissionPreset: "develop",
    defaultMode: "checkout",
    pinned: true,
    source: "manual",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    availability: "available",
  },
  repositoryContext: {
    state: "available",
    basis: "current_worktree",
    refreshedAt: "2026-08-08T10:30:00.000Z",
    branch: "main",
    head: "a".repeat(40),
    fingerprint: "b".repeat(40),
    dirty: {
      total: 1,
      returned: 1,
      truncated: false,
      files: [{ path: "src/current.ts", operation: "modified", binary: false }],
    },
  },
  handoff,
  workspaceSessions,
  agents,
  runs,
});

assert.equal(snapshot.workspaces.total, 2);
assert.equal(snapshot.workspaces.active, 1);
assert.equal(snapshot.workspaces.archived, 1);
assert.equal(snapshot.workspaces.latestWorkspaceId, "ws_current");
assert.equal(snapshot.latestFailure?.source, "local_agent");
assert.equal(snapshot.latestFailure?.code, "usage_limit");
assert.match(snapshot.latestFailure?.recommendedAction ?? "", /did not switch providers automatically/i);
assert.equal(snapshot.verification?.stage, "verified");
assert.equal(snapshot.nextAction, "Run the focused provider test, then inspect the diff.");
assert.match(snapshot.resumeInstruction, /open_project/);
assert.match(formatProjectResumeSnapshot(snapshot), /Latest failure: local_agent agt_quota/);

const secretFailure = createProjectResumeSnapshot({
  project: {
    ...snapshot.project,
    pinned: false,
    source: "manual",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
  },
  repositoryContext: {
    state: "available",
    basis: "current_worktree",
    refreshedAt: "2026-08-08T10:30:00.000Z",
    dirty: { total: 0, returned: 0, truncated: false, files: [] },
  },
  workspaceSessions: [],
  agents: [{
    id: "agt_secret",
    workspaceRoot: "C:\\repo",
    profileName: "reviewer",
    provider: "codex",
    status: "error",
    error: "Provider failed with Bearer supersecretvalue12345",
    failureCode: "agent_failure",
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:25:00.000Z",
  }],
  runs: [],
});
assert.equal(secretFailure.latestFailure?.summary, "[redacted sensitive output]");
assert.doesNotMatch(formatProjectResumeSnapshot(secretFailure), /supersecretvalue/);

const dirtyFallback = createProjectResumeSnapshot({
  project: {
    ...snapshot.project,
    pinned: false,
    source: "manual",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
  },
  repositoryContext: {
    state: "available",
    basis: "current_worktree",
    refreshedAt: "2026-08-08T10:30:00.000Z",
    dirty: { total: 2, returned: 0, truncated: true, files: [] },
  },
  workspaceSessions: [],
  agents: [],
  runs: [],
});
assert.match(dirtyFallback.nextAction, /reconcile the current repository changes/i);

console.log("project resume tests passed");

function run(
  id: string,
  patch: Partial<StoredOperationRun> = {},
): StoredOperationRun {
  return {
    id,
    kind: "mcp_tool",
    source: "mcp",
    title: id,
    state: "queued",
    assuranceStage: "working",
    startedAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    stoppable: false,
    latestSequence: 0,
    retainedEventCount: 0,
    retainedPayloadBytes: 0,
    historyTruncated: false,
    ...patch,
  };
}
