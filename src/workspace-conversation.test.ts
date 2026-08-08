import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { loadConfig } from "./config.js";
import { databasePath } from "./db/client.js";
import {
  SqliteWorkspaceStore,
  workspaceConversationScopeStorageKey,
} from "./workspace-store.js";
import { WorkspaceRegistry } from "./workspaces.js";

const execFileAsync = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "dpkr-helix-conversation-workspace-test-"));
const projectRoot = join(root, "project");
const stateDir = join(root, "state");

try {
  await mkdir(projectRoot, { recursive: true });
  await writeFile(join(projectRoot, "README.md"), "hello\n");
  await git(projectRoot, ["init"]);
  await git(projectRoot, ["config", "user.email", "devspace@example.com"]);
  await git(projectRoot, ["config", "user.name", "DevSpace Test"]);
  await git(projectRoot, ["add", "."]);
  await git(projectRoot, ["commit", "-m", "Initial commit"]);

  const config = loadConfig({
    DEVSPACE_CONFIG_DIR: join(root, "config"),
    DEVSPACE_ALLOWED_ROOTS: root,
    DEVSPACE_WORKTREE_ROOT: join(root, "worktrees"),
    DEVSPACE_AGENT_DIR: join(root, "agent"),
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    PORT: "1",
  });

  const firstStore = new SqliteWorkspaceStore(stateDir);
  const firstRegistry = new WorkspaceRegistry(config, firstStore);

  const first = await firstRegistry.openWorkspace(
    projectRoot,
    { conversationScopeId: "conversation-a" },
  );
  assert.match(first.workspace.id, /^ws_[a-f0-9]{10}$/);
  assert.equal(first.workspaceReused, false);

  const reused = await firstRegistry.openWorkspace(
    projectRoot,
    { conversationScopeId: "conversation-a" },
  );
  assert.equal(reused.workspace.id, first.workspace.id);
  assert.equal(reused.workspaceReused, true);

  const otherConversation = await firstRegistry.openWorkspace(
    projectRoot,
    { conversationScopeId: "conversation-b" },
  );
  assert.notEqual(otherConversation.workspace.id, first.workspace.id);
  assert.equal(otherConversation.workspaceReused, false);

  const explicitOpen = await firstRegistry.openWorkspace(projectRoot);
  assert.notEqual(explicitOpen.workspace.id, first.workspace.id);
  assert.equal(explicitOpen.workspaceReused, false);

  const concurrent = await Promise.all([
    firstRegistry.openWorkspace(projectRoot, { conversationScopeId: "conversation-concurrent" }),
    firstRegistry.openWorkspace(projectRoot, { conversationScopeId: "conversation-concurrent" }),
  ]);
  assert.equal(concurrent[0].workspace.id, concurrent[1].workspace.id);
  assert.equal(concurrent.some((context) => context.workspaceReused), true);
  assert.equal(concurrent.some((context) => !context.workspaceReused), true);

  const inspection = new Database(databasePath(stateDir), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const storedScopes = inspection
      .prepare("select conversation_scope_id from workspace_conversation_bindings")
      .pluck()
      .all() as string[];
    assert.equal(storedScopes.includes("conversation-a"), false);
    assert.equal(
      storedScopes.includes(workspaceConversationScopeStorageKey("conversation-a")),
      true,
    );
    assert.equal(storedScopes.every((scope) => /^sha256:[a-f0-9]{64}$/.test(scope)), true);
  } finally {
    inspection.close();
  }

  const firstWorktree = await firstRegistry.openWorkspace(
    { path: projectRoot, mode: "worktree" },
    { conversationScopeId: "conversation-a" },
  );
  const secondWorktree = await firstRegistry.openWorkspace(
    { path: projectRoot, mode: "worktree" },
    { conversationScopeId: "conversation-a" },
  );
  assert.notEqual(firstWorktree.workspace.id, secondWorktree.workspace.id);
  assert.equal(firstWorktree.workspaceReused, false);
  assert.equal(secondWorktree.workspaceReused, false);

  firstStore.close();

  const secondStore = new SqliteWorkspaceStore(stateDir);
  const secondRegistry = new WorkspaceRegistry(config, secondStore);
  const restored = await secondRegistry.openWorkspace(
    projectRoot,
    { conversationScopeId: "conversation-a" },
  );
  assert.equal(restored.workspace.id, first.workspace.id);
  assert.equal(restored.workspaceReused, true);
  secondStore.close();
} finally {
  await rm(root, { recursive: true, force: true });
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}
