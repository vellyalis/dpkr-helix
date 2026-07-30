import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { loadConfig } from "../config.js";
import { SqliteWorkspaceStore } from "../workspace-store.js";
import { WorkspaceRegistry } from "../workspaces.js";
import {
  createProjectErrorOutput,
  createProjectListOutput,
  formatProjectOpenResult,
  PROJECT_LIST_TOOL_ANNOTATIONS,
  PROJECT_OPEN_TOOL_ANNOTATIONS,
  PROJECT_OPEN_TOOL_VISIBILITY,
  projectViewOutputSchema,
} from "./project-mcp.js";
import { ProjectRegistry, ProjectSelectorError } from "./project-registry.js";
import { SqliteProjectStore } from "./project-store.js";

const root = await mkdtemp(join(tmpdir(), "devspace-project-mcp-test-"));
const execFileAsync = promisify(execFile);
let store: SqliteProjectStore | undefined;
let workspaceStore: SqliteWorkspaceStore | undefined;

try {
  const allowedRoot = join(root, "allowed");
  const stateDir = join(root, "state");
  const agentDir = join(root, "agent");
  const firstRoot = join(allowedRoot, "first");
  const secondRoot = join(allowedRoot, "second");
  const missingRoot = join(allowedRoot, "missing");
  await mkdir(firstRoot, { recursive: true });
  await mkdir(secondRoot, { recursive: true });
  await mkdir(missingRoot, { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await git(secondRoot, ["init"]);
  await git(secondRoot, ["config", "user.email", "devspace@example.com"]);
  await git(secondRoot, ["config", "user.name", "DevSpace Test"]);
  await git(secondRoot, ["-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "Initial commit"]);

  let ids = 0;
  store = new SqliteProjectStore(stateDir);
  const registry = new ProjectRegistry(store, [allowedRoot], {
    createId: () => `prj_mcp_${++ids}`,
    now: () => "2026-07-28T00:00:00.000Z",
  });
  const first = await registry.register({
    path: firstRoot,
    name: "Shared Name",
    slug: "first-project",
    permissionPreset: "design",
    defaultMode: "checkout",
    pinned: true,
  });
  const second = await registry.register({
    path: secondRoot,
    name: "Shared Name",
    slug: "second-project",
    permissionPreset: "inspect",
    defaultMode: "worktree",
  });
  const missing = await registry.register({ path: missingRoot, name: "Gone" });
  await rm(missingRoot, { recursive: true, force: true });

  assert.deepEqual(PROJECT_LIST_TOOL_ANNOTATIONS, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });
  assert.deepEqual(PROJECT_OPEN_TOOL_ANNOTATIONS, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  });
  assert.deepEqual(PROJECT_OPEN_TOOL_VISIBILITY, ["model", "app"]);

  const output = createProjectListOutput(await registry.list());
  assert.equal(output.projects.length, 2);
  assert.equal(output.projects.some((project) => "rootKey" in project), false);
  assert.equal(output.summary.total, 3);
  assert.equal(output.summary.available, 2);
  assert.equal(output.summary.unavailable, 1);
  assert.match(output.result, /Registered projects/);
  assert.match(output.result, /unavailable project hidden/);
  projectViewOutputSchema.parse(output.projects[0]);

  const withUnavailable = createProjectListOutput(await registry.list(), {
    includeUnavailable: true,
  });
  assert.equal(withUnavailable.projects.length, 3);
  assert.equal(withUnavailable.projects.find((project) => project.id === missing.id)?.availability, "missing");

  assert.equal(registry.resolveSelector(first.id).id, first.id);
  assert.equal(registry.resolveSelector(second.slug).id, second.id);
  assert.throws(
    () => registry.resolveSelector("shared name"),
    (error: unknown) =>
      error instanceof ProjectSelectorError
      && error.code === "PROJECT_AMBIGUOUS"
      && error.candidates.map((candidate) => candidate.id).sort().join(",") === [first.id, second.id].sort().join(","),
  );

  const ambiguous = createProjectErrorOutput("PROJECT_AMBIGUOUS", "Project display name is ambiguous", [
    { id: first.id, slug: first.slug, name: first.name, root: first.root },
    { id: second.id, slug: second.slug, name: second.name, root: second.root },
  ]);
  assert.match(ambiguous.result, new RegExp(first.id));
  assert.equal(ambiguous.error.candidates?.length, 2);

  const config = loadConfig({
    DEVSPACE_CONFIG_DIR: join(root, "config"),
    DEVSPACE_ALLOWED_ROOTS: allowedRoot,
    DEVSPACE_WORKTREE_ROOT: join(root, "worktrees"),
    DEVSPACE_AGENT_DIR: agentDir,
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    PORT: "1",
  });
  workspaceStore = new SqliteWorkspaceStore(stateDir);
  const workspaces = new WorkspaceRegistry(config, workspaceStore, registry);
  const defaultMode = registry.resolveSelector(second.slug).defaultMode;
  assert.equal(defaultMode, "worktree");
  const opened = await workspaces.openWorkspace({
    path: registry.resolveSelector(second.slug).root,
    mode: defaultMode,
    baseRef: "HEAD",
  });
  assert.equal(opened.workspace.mode, "worktree");
  assert.equal(opened.workspace.projectId, second.id);
  assert.equal(opened.workspace.project?.defaultMode, "worktree");
  assert.ok(opened.workspace.worktree?.managed);
  assert.match(
    formatProjectOpenResult({
      workspaceId: opened.workspace.id,
      root: opened.workspace.root,
      mode: opened.workspace.mode,
      project: opened.workspace.project!,
    }),
    /Opened project Shared Name \(second-project\)/,
  );
} finally {
  workspaceStore?.close();
  store?.close();
  await rm(root, { recursive: true, force: true });
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}
