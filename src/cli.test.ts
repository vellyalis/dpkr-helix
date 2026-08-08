import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { loadConfig } from "./config.js";
import { databasePath } from "./db/client.js";
import { LocalAgentStore } from "./local-agent-store.js";
import { ProjectRegistry } from "./projects/project-registry.js";
import { SqliteProjectStore } from "./projects/project-store.js";
import { SqliteWorkspaceStore } from "./workspace-store.js";
import { WorkspaceRegistry } from "./workspaces.js";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

for (const flag of ["-v", "--version"]) {
  const output = execFileSync("node", ["--import", "tsx", "src/cli.ts", flag], {
    encoding: "utf8",
    env: { ...process.env, DEVSPACE_CONFIG_DIR: "/tmp/devspace-cli-version-test" },
  }).trim();

  assert.equal(output, packageJson.version);
}

const helpOutput = execFileSync("node", ["--import", "tsx", "src/cli.ts", "help"], {
  encoding: "utf8",
  env: { ...process.env, DEVSPACE_CONFIG_DIR: "/tmp/devspace-cli-help-test" },
});
for (const legacyCommand of [
  /devspace serve\s+Start the server/,
  /devspace init\s+Create or update/,
  /devspace doctor\s+Show config, runtime, and native dependency status/,
  /devspace config get\s+Print persisted config/,
  /devspace config set publicBaseUrl <url\|null>/,
  /devspace agents ls\s+List subagent sessions/,
  /devspace agents run <profile-or-provider-or-id>/,
  /devspace agents show <id>/,
]) {
  assert.match(helpOutput, legacyCommand);
}
assert.match(helpOutput, /devspace dashboard\s+Open the local dashboard/);

const root = mkdtempSync(join(tmpdir(), "devspace-cli-agents-test-"));
try {
  const configDir = join(root, ".devspace");
  const stateDir = join(root, ".state");
  const projectRoot = join(root, "project");
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(join(configDir, "agents"), { recursive: true });
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(
    join(configDir, "agents", "reviewer.md"),
    [
      "---",
      "name: reviewer",
      "description: Read-only reviewer.",
      "provider: codex",
      "model: gpt-5.4",
      "thinking: high",
      "---",
      "",
      "Review only.",
      "",
    ].join("\n"),
  );
  const store = new LocalAgentStore(stateDir);
  const current = store.update(
    store.create({
      workspaceId: "ws_current",
      workspaceRoot: projectRoot,
      profileName: "reviewer",
      provider: "codex",
      model: "gpt-5.4",
      thinking: "high",
    }).id,
    { status: "idle" },
  );
  const other = store.update(
    store.create({
      workspaceId: "ws_other",
      workspaceRoot: projectRoot,
      profileName: "reviewer",
      provider: "codex",
    }).id,
    { status: "running" },
  );
  store.close();

  const output = execFileSync("node", ["--import", "tsx", "src/cli.ts", "agents", "ls"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      DEVSPACE_CONFIG_DIR: configDir,
      DEVSPACE_ALLOWED_ROOTS: projectRoot,
      DEVSPACE_STATE_DIR: stateDir,
      DEVSPACE_WORKSPACE_ID: "ws_current",
      DEVSPACE_WORKSPACE_ROOT: projectRoot,
      DEVSPACE_SUBAGENTS: "1",
      DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    },
  });

  assert.match(output, new RegExp(`${current.id} idle reviewer codex gpt-5\\.4 thinking=high`));
  assert.doesNotMatch(output, /profile reviewer/);
  assert.doesNotMatch(output, new RegExp(other.id));

  assert.equal(loadConfig({
    DEVSPACE_CONFIG_DIR: configDir,
    DEVSPACE_ALLOWED_ROOTS: projectRoot,
    DEVSPACE_STATE_DIR: stateDir,
    DEVSPACE_SUBAGENTS: "1",
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
  }).subagents, true);
} finally {
  rmSync(root, { recursive: true, force: true });
}

const policyRoot = mkdtempSync(join(tmpdir(), "devspace-cli-agent-policy-test-"));
try {
  const configDir = join(policyRoot, "config");
  const stateDir = join(policyRoot, "state");
  const allowedRoot = join(policyRoot, "allowed");
  const inspectRoot = join(allowedRoot, "inspect");
  const promptFile = join(policyRoot, "prompt.txt");
  mkdirSync(join(configDir, "agents"), { recursive: true });
  mkdirSync(inspectRoot, { recursive: true });
  writeFileSync(promptFile, "blocked worker prompt\n");
  writeFileSync(
    join(configDir, "agents", "reviewer.md"),
    [
      "---",
      "name: reviewer",
      "description: Read-only reviewer.",
      "provider: codex",
      "---",
      "",
      "Review only.",
      "",
    ].join("\n"),
  );

  const config = loadConfig({
    DEVSPACE_CONFIG_DIR: configDir,
    DEVSPACE_ALLOWED_ROOTS: allowedRoot,
    DEVSPACE_STATE_DIR: stateDir,
    DEVSPACE_WORKTREE_ROOT: join(policyRoot, "worktrees"),
    DEVSPACE_AGENT_DIR: join(configDir, "agents"),
    DEVSPACE_SUBAGENTS: "1",
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    PORT: "1",
  });
  const projectStore = new SqliteProjectStore(stateDir);
  const projects = new ProjectRegistry(projectStore, config.allowedRoots, {
    createId: () => "prj_cli_inspect",
    now: () => "2026-07-29T00:00:00.000Z",
  });
  await projects.register({
    path: inspectRoot,
    name: "Inspect Project",
    slug: "inspect-project",
    permissionPreset: "inspect",
  });
  const workspaceStore = new SqliteWorkspaceStore(stateDir);
  const workspace = (
    await new WorkspaceRegistry(config, workspaceStore, projects).openWorkspace(inspectRoot)
  ).workspace;
  workspaceStore.close();
  projectStore.close();

  const env = {
    ...process.env,
    DEVSPACE_CONFIG_DIR: configDir,
    DEVSPACE_ALLOWED_ROOTS: allowedRoot,
    DEVSPACE_STATE_DIR: stateDir,
    DEVSPACE_WORKTREE_ROOT: join(policyRoot, "worktrees"),
    DEVSPACE_AGENT_DIR: join(configDir, "agents"),
    DEVSPACE_WORKSPACE_ID: workspace.id,
    DEVSPACE_WORKSPACE_ROOT: inspectRoot,
    DEVSPACE_SUBAGENTS: "1",
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    PORT: "1",
  };

  const blockedNew = spawnSync(
    "node",
    ["--import", "tsx", "src/cli.ts", "agents", "run", "reviewer", "blocked new task"],
    { cwd: process.cwd(), encoding: "utf8", env, windowsHide: true },
  );
  assert.equal(blockedNew.status, 1);
  assert.match(blockedNew.stderr, /Operation "delegate_write"/);
  assert.match(blockedNew.stderr, /Inspect Project/);
  assert.match(blockedNew.stderr, /preset "inspect"/);
  assert.match(blockedNew.stderr, /dpkr helix dashboard/);
  let policyStore = new LocalAgentStore(stateDir);
  assert.deepEqual(policyStore.list({ workspaceId: workspace.id }), []);

  const existing = policyStore.update(
    policyStore.create({
      workspaceId: workspace.id,
      workspaceRoot: inspectRoot,
      profileName: "reviewer",
      provider: "codex",
      model: "original-model",
      thinking: "medium",
    }).id,
    { status: "idle" },
  );
  policyStore.close();

  const blockedContinue = spawnSync(
    "node",
    [
      "--import",
      "tsx",
      "src/cli.ts",
      "agents",
      "run",
      existing.id,
      "--model",
      "changed-model",
      "blocked continuation",
    ],
    { cwd: process.cwd(), encoding: "utf8", env, windowsHide: true },
  );
  assert.equal(blockedContinue.status, 1);
  assert.match(blockedContinue.stderr, /Operation "delegate_write"/);
  policyStore = new LocalAgentStore(stateDir);
  const afterContinue = policyStore.get(existing.id);
  assert.equal(afterContinue?.status, "idle");
  assert.equal(afterContinue?.model, "original-model");
  assert.equal(afterContinue?.thinking, "medium");
  assert.equal(afterContinue?.updatedAt, existing.updatedAt);
  policyStore.close();

  policyStore = new LocalAgentStore(stateDir);
  const staleSibling = policyStore.update(
    policyStore.create({
      workspaceId: workspace.id,
      workspaceRoot: inspectRoot,
      profileName: "reviewer",
      provider: "codex",
    }).id,
    { status: "running" },
  );
  policyStore.close();
  const staleUpdatedAt = "2026-01-01T00:00:00.000Z";
  const sqlite = new Database(databasePath(stateDir));
  sqlite
    .prepare("update local_agent_sessions set updated_at = ? where id = ?")
    .run(staleUpdatedAt, staleSibling.id);
  sqlite.close();

  const blockedWorker = spawnSync(
    "node",
    [
      "--import",
      "tsx",
      "src/local-agent-worker.ts",
      existing.id,
      "--prompt-file",
      promptFile,
    ],
    { cwd: process.cwd(), encoding: "utf8", env, windowsHide: true },
  );
  assert.equal(blockedWorker.status, 1);
  assert.match(blockedWorker.stderr, /Operation "delegate_write"/);
  policyStore = new LocalAgentStore(stateDir);
  const afterWorker = policyStore.get(existing.id);
  assert.equal(afterWorker?.status, "idle");
  assert.equal(afterWorker?.updatedAt, existing.updatedAt);
  const staleAfterWorker = policyStore.get(staleSibling.id);
  assert.equal(staleAfterWorker?.status, "running");
  assert.equal(staleAfterWorker?.updatedAt, staleUpdatedAt);
  policyStore.close();
} finally {
  rmSync(policyRoot, { recursive: true, force: true });
}
