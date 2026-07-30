import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { loadConfig } from "../config.js";
import { SqliteWorkspaceStore } from "../workspace-store.js";
import { WorkspaceRegistry } from "../workspaces.js";
import { ProjectRegistry } from "./project-registry.js";
import { SqliteProjectStore } from "./project-store.js";

const execFileAsync = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "devspace-project-workspace-test-"));

try {
  const allowedRoot = join(root, "allowed");
  const checkoutRoot = join(allowedRoot, "checkout-project");
  const checkoutSubdir = join(checkoutRoot, "src");
  const gitRoot = join(allowedRoot, "git-project");
  const legacyRoot = join(allowedRoot, "legacy-project");
  const nestedParentRoot = join(allowedRoot, "nested");
  const nestedChildRoot = join(nestedParentRoot, "child");
  const nestedChildSubdir = join(nestedChildRoot, "src");
  const agentDir = join(root, "agent");
  const stateDir = join(root, "state");
  await mkdir(checkoutSubdir, { recursive: true });
  await mkdir(join(gitRoot, "src"), { recursive: true });
  await mkdir(legacyRoot, { recursive: true });
  await mkdir(nestedChildSubdir, { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await writeFile(join(checkoutRoot, "README.md"), "checkout\n");
  await writeFile(join(checkoutSubdir, "index.ts"), "export {};\n");
  await writeFile(join(gitRoot, "README.md"), "git\n");
  await writeFile(join(gitRoot, "src", "index.ts"), "export {};\n");
  await git(gitRoot, ["init"]);
  await git(gitRoot, ["config", "user.email", "devspace@example.com"]);
  await git(gitRoot, ["config", "user.name", "DevSpace Test"]);
  await git(gitRoot, ["add", "."]);
  await git(gitRoot, ["-c", "commit.gpgsign=false", "commit", "-m", "Initial commit"]);

  const config = loadConfig({
    DEVSPACE_CONFIG_DIR: join(root, "config"),
    DEVSPACE_ALLOWED_ROOTS: allowedRoot,
    DEVSPACE_WORKTREE_ROOT: join(root, "worktrees"),
    DEVSPACE_AGENT_DIR: agentDir,
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    PORT: "1",
  });

  const firstProjectStore = new SqliteProjectStore(stateDir);
  const firstWorkspaceStore = new SqliteWorkspaceStore(stateDir);
  const firstProjects = new ProjectRegistry(firstProjectStore, config.allowedRoots);
  const checkoutProject = await firstProjects.register({
    path: checkoutRoot,
    permissionPreset: "design",
  });
  const gitProject = await firstProjects.register({
    path: gitRoot,
    permissionPreset: "inspect",
  });
  const nestedParentProject = await firstProjects.register({
    path: nestedParentRoot,
    permissionPreset: "inspect",
  });
  const nestedChildProject = await firstProjects.register({
    path: nestedChildRoot,
    permissionPreset: "develop",
  });
  const firstWorkspaces = new WorkspaceRegistry(config, firstWorkspaceStore, firstProjects);

  const checkout = await firstWorkspaces.openWorkspace(checkoutRoot);
  assert.equal(checkout.workspace.projectId, checkoutProject.id);
  assert.deepEqual(checkout.workspace.project, {
    id: checkoutProject.id,
    slug: checkoutProject.slug,
    name: checkoutProject.name,
    permissionPreset: "design",
    defaultMode: "checkout",
  });
  assert.deepEqual(checkout.workspace.policySource, {
    kind: "registered_project",
    project: checkout.workspace.project,
  });
  assert.equal(
    firstWorkspaceStore.getSession(checkout.workspace.id)?.projectId,
    checkoutProject.id,
  );

  const checkoutSubdirectory = await firstWorkspaces.openWorkspace(checkoutSubdir);
  assert.equal(checkoutSubdirectory.workspace.projectId, checkoutProject.id);
  assert.equal(checkoutSubdirectory.workspace.project?.permissionPreset, "design");
  assert.deepEqual(checkoutSubdirectory.workspace.policySource, {
    kind: "registered_project",
    project: checkoutSubdirectory.workspace.project,
  });

  const nestedCheckout = await firstWorkspaces.openWorkspace(nestedChildSubdir);
  assert.equal(nestedCheckout.workspace.projectId, nestedChildProject.id);
  assert.notEqual(nestedCheckout.workspace.projectId, nestedParentProject.id);
  assert.equal(nestedCheckout.workspace.policySource.kind, "registered_project");
  assert.equal(
    nestedCheckout.workspace.policySource.kind === "registered_project"
      ? nestedCheckout.workspace.policySource.project.permissionPreset
      : undefined,
    "develop",
  );

  const worktree = await firstWorkspaces.openWorkspace({
    path: join(gitRoot, "src"),
    mode: "worktree",
  });
  assert.equal(worktree.workspace.projectId, gitProject.id);
  assert.equal(worktree.workspace.project?.permissionPreset, "inspect");
  assert.deepEqual(worktree.workspace.policySource, {
    kind: "registered_project",
    project: worktree.workspace.project,
  });
  assert.equal(worktree.workspace.sourceRoot, gitRoot);
  assert.equal(
    firstWorkspaceStore.getSession(worktree.workspace.id)?.projectId,
    gitProject.id,
  );

  const legacySession = firstWorkspaceStore.createSession({
    id: "ws_legacy_without_project",
    root: legacyRoot,
  });
  assert.equal(legacySession.projectId, undefined);

  await firstProjects.update(checkoutProject.id, { permissionPreset: "inspect" });
  const refreshedCheckout = firstWorkspaces.getWorkspace(checkout.workspace.id);
  assert.equal(refreshedCheckout.project?.permissionPreset, "inspect");
  assert.equal(
    refreshedCheckout.policySource.kind === "registered_project"
      ? refreshedCheckout.policySource.project.permissionPreset
      : undefined,
    "inspect",
  );
  firstWorkspaceStore.close();
  firstProjectStore.close();

  const secondProjectStore = new SqliteProjectStore(stateDir);
  const secondWorkspaceStore = new SqliteWorkspaceStore(stateDir);
  const secondProjects = new ProjectRegistry(secondProjectStore, config.allowedRoots);
  const restoredWorkspaces = new WorkspaceRegistry(config, secondWorkspaceStore, secondProjects);
  const restoredCheckout = restoredWorkspaces.getWorkspace(checkout.workspace.id);
  assert.equal(restoredCheckout.projectId, checkoutProject.id);
  assert.equal(restoredCheckout.project?.permissionPreset, "inspect");
  assert.deepEqual(restoredCheckout.policySource, {
    kind: "registered_project",
    project: restoredCheckout.project,
  });

  const restoredWorktree = restoredWorkspaces.getWorkspace(worktree.workspace.id);
  assert.equal(restoredWorktree.projectId, gitProject.id);
  assert.equal(restoredWorktree.sourceRoot, gitRoot);
  assert.deepEqual(restoredWorktree.policySource, {
    kind: "registered_project",
    project: restoredWorktree.project,
  });

  const restoredLegacy = restoredWorkspaces.getWorkspace("ws_legacy_without_project");
  assert.equal(restoredLegacy.projectId, undefined);
  assert.equal(restoredLegacy.project, undefined);
  assert.deepEqual(restoredLegacy.policySource, { kind: "legacy" });

  assert.equal(secondProjects.forget(checkoutProject.id), true);
  const liveAfterForget = restoredWorkspaces.getWorkspace(checkout.workspace.id);
  assert.equal(liveAfterForget.projectId, undefined);
  assert.equal(liveAfterForget.project, undefined);
  assert.deepEqual(liveAfterForget.policySource, { kind: "legacy" });
  secondWorkspaceStore.close();
  secondProjectStore.close();

  const thirdProjectStore = new SqliteProjectStore(stateDir);
  const thirdWorkspaceStore = new SqliteWorkspaceStore(stateDir);
  const thirdProjects = new ProjectRegistry(thirdProjectStore, config.allowedRoots);
  const afterForgetWorkspaces = new WorkspaceRegistry(config, thirdWorkspaceStore, thirdProjects);
  const afterForget = afterForgetWorkspaces.getWorkspace(checkout.workspace.id);
  assert.equal(afterForget.projectId, undefined);
  assert.equal(afterForget.project, undefined);
  assert.deepEqual(afterForget.policySource, { kind: "legacy" });
  thirdWorkspaceStore.close();
  thirdProjectStore.close();
} finally {
  await rm(root, { recursive: true, force: true });
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}
