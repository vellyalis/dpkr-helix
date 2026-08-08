import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./db/client.js";
import { LocalAgentStore } from "./local-agent-store.js";
import { OperationStore } from "./operations/operation-store.js";
import {
  analyzeWorkspaceLifecycle,
  DEFAULT_WORKSPACE_ARCHIVE_AFTER_DAYS,
} from "./workspace-lifecycle.js";
import { SqliteWorkspaceStore } from "./workspace-store.js";

const root = mkdtempSync(join(tmpdir(), "devspace-workspace-lifecycle-test-"));
const stateDir = join(root, "state");
const workspaces = new SqliteWorkspaceStore(stateDir);
const operations = new OperationStore(stateDir);
const agents = new LocalAgentStore(stateDir);

try {
  for (const input of [
    { id: "ws_old", root: join(root, "old") },
    { id: "ws_bound", root: join(root, "bound") },
    { id: "ws_run", root: join(root, "run") },
    { id: "ws_agent", root: join(root, "agent") },
    { id: "ws_recent", root: join(root, "recent") },
    { id: "ws_worktree", root: join(root, "worktree"), mode: "worktree" as const },
    { id: "ws_ephemeral", root: join(root, ".tmp", "evaluation") },
  ]) {
    workspaces.createSession(input);
  }
  workspaces.setConversationBinding({
    conversationScopeId: "conversation-a",
    targetKey: "project:bound:checkout",
    workspaceSessionId: "ws_bound",
  });
  operations.createRun({
    id: "op_workspace_active",
    kind: "mcp_tool",
    source: "mcp",
    workspaceId: "ws_run",
    title: "Active workspace operation",
    state: "running",
  });
  agents.create({
    workspaceId: "ws_agent",
    workspaceRoot: join(root, "agent"),
    profileName: "reviewer",
    provider: "codex",
  });

  const now = Date.parse("2026-08-08T12:00:00.000Z");
  const old = "2026-07-20T00:00:00.000Z";
  const recent = "2026-08-08T11:00:00.000Z";
  const database = openDatabase(stateDir);
  try {
    const oldUpdate = database.sqlite.prepare(
      "update workspace_sessions set created_at = ?, last_used_at = ? where id != 'ws_recent'",
    ).run(old, old);
    const recentUpdate = database.sqlite.prepare(
      "update workspace_sessions set created_at = ?, last_used_at = ? where id = 'ws_recent'",
    ).run(recent, recent);
    assert.equal(oldUpdate.changes, 6);
    assert.equal(recentUpdate.changes, 1);
  } finally {
    database.close();
  }

  const persistedSessions = workspaces.listSessions();
  assert.equal(persistedSessions.find(({ id }) => id === "ws_old")?.createdAt, old);
  assert.equal(persistedSessions.find(({ id }) => id === "ws_recent")?.createdAt, recent);
  const analysis = analyzeWorkspaceLifecycle({
    sessions: persistedSessions,
    bindings: workspaces.listConversationBindings(),
    now,
  });
  assert.equal(analysis.summary.archiveAfterDays, DEFAULT_WORKSPACE_ARCHIVE_AFTER_DAYS);
  assert.equal(analysis.summary.totalSessions, 7);
  assert.equal(analysis.summary.boundSessions, 1);
  assert.equal(analysis.summary.worktreeSessions, 1);
  assert.equal(analysis.summary.ephemeralSessions, 7);
  assert.equal(analysis.summary.createdLast24Hours, 1);
  assert.deepEqual(
    analysis.archiveCandidates.map(({ id }) => id).sort(),
    ["ws_agent", "ws_ephemeral", "ws_old", "ws_run"],
  );

  const archived = workspaces.archiveSessions(analysis.archiveCandidates);
  assert.equal(archived, 2);
  assert.equal(workspaces.getSession("ws_old")?.status, "archived");
  assert.equal(workspaces.getSession("ws_ephemeral")?.status, "archived");
  assert.equal(workspaces.getSession("ws_bound")?.status, "active");
  assert.equal(workspaces.getSession("ws_run")?.status, "active");
  assert.equal(workspaces.getSession("ws_agent")?.status, "active");
  assert.equal(workspaces.getSession("ws_worktree")?.status, "active");
  assert.equal(workspaces.getSession("ws_recent")?.status, "active");

  workspaces.touchSession("ws_old");
  assert.equal(workspaces.getSession("ws_old")?.status, "active");
} finally {
  agents.close();
  operations.close();
  workspaces.close();
  rmSync(root, { recursive: true, force: true });
}

console.log("workspace lifecycle tests passed");
