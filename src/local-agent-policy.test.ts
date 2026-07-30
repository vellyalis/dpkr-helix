import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import {
  resolveLocalAgentPolicySource,
  runAuthorizedLocalAgentAction,
} from "./local-agent-policy.js";
import { WorkspacePolicyDeniedError } from "./projects/project-policy.js";
import { ProjectRegistry } from "./projects/project-registry.js";
import { SqliteProjectStore } from "./projects/project-store.js";
import { SqliteWorkspaceStore } from "./workspace-store.js";
import { WorkspaceRegistry } from "./workspaces.js";

const root = await mkdtemp(join(tmpdir(), "devspace-local-agent-policy-test-"));
let projectStore: SqliteProjectStore | undefined;
let workspaceStore: SqliteWorkspaceStore | undefined;

try {
  const allowedRoot = join(root, "allowed");
  const stateDir = join(root, "state");
  const agentDir = join(root, "agent");
  const inspectRoot = join(allowedRoot, "inspect");
  const designRoot = join(allowedRoot, "design");
  const developRoot = join(allowedRoot, "develop");
  const changingRoot = join(allowedRoot, "changing");
  const forgottenRoot = join(allowedRoot, "forgotten");
  const legacyRoot = join(allowedRoot, "legacy");
  const detachedWorktreeRoot = join(root, "worktrees", "inspect-detached");
  await Promise.all([
    mkdir(inspectRoot, { recursive: true }),
    mkdir(designRoot, { recursive: true }),
    mkdir(developRoot, { recursive: true }),
    mkdir(changingRoot, { recursive: true }),
    mkdir(forgottenRoot, { recursive: true }),
    mkdir(legacyRoot, { recursive: true }),
    mkdir(detachedWorktreeRoot, { recursive: true }),
    mkdir(agentDir, { recursive: true }),
  ]);

  const config = loadConfig({
    DEVSPACE_CONFIG_DIR: join(root, "config"),
    DEVSPACE_STATE_DIR: stateDir,
    DEVSPACE_ALLOWED_ROOTS: allowedRoot,
    DEVSPACE_WORKTREE_ROOT: join(root, "worktrees"),
    DEVSPACE_AGENT_DIR: agentDir,
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    PORT: "1",
  });
  let ids = 0;
  projectStore = new SqliteProjectStore(stateDir);
  const projects = new ProjectRegistry(projectStore, config.allowedRoots, {
    createId: () => `prj_local_agent_policy_${++ids}`,
    now: () => "2026-07-29T00:00:00.000Z",
  });
  const inspectProject = await projects.register({
    path: inspectRoot,
    name: "Inspect Project",
    permissionPreset: "inspect",
  });
  const designProject = await projects.register({
    path: designRoot,
    name: "Design Project",
    permissionPreset: "design",
  });
  const developProject = await projects.register({
    path: developRoot,
    name: "Develop Project",
    permissionPreset: "develop",
  });
  const changingProject = await projects.register({
    path: changingRoot,
    name: "Changing Project",
    permissionPreset: "develop",
  });
  const forgottenProject = await projects.register({
    path: forgottenRoot,
    name: "Forgotten Project",
    permissionPreset: "inspect",
  });

  workspaceStore = new SqliteWorkspaceStore(stateDir);
  workspaceStore.createSession({
    id: "ws_detached_inspect",
    root: detachedWorktreeRoot,
    projectId: inspectProject.id,
    mode: "worktree",
    sourceRoot: inspectRoot,
    managed: true,
  });
  const workspaces = new WorkspaceRegistry(config, workspaceStore, projects);
  const inspectWorkspace = (await workspaces.openWorkspace(inspectRoot)).workspace;
  const designWorkspace = (await workspaces.openWorkspace(designRoot)).workspace;
  const developWorkspace = (await workspaces.openWorkspace(developRoot)).workspace;
  const changingWorkspace = (await workspaces.openWorkspace(changingRoot)).workspace;
  const forgottenWorkspace = (await workspaces.openWorkspace(forgottenRoot)).workspace;

  let actionCalls = 0;
  for (const [workspace, projectName, preset] of [
    [inspectWorkspace, inspectProject.name, "inspect"],
    [designWorkspace, designProject.name, "design"],
  ] as const) {
    await assert.rejects(
      runAuthorizedLocalAgentAction({
        config,
        scope: { workspaceId: workspace.id, workspaceRoot: workspace.root },
        writeMode: "allowed",
        action: () => {
          actionCalls += 1;
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof WorkspacePolicyDeniedError);
        assert.match(error.message, /Operation "delegate_write"/);
        assert.match(error.message, new RegExp(projectName));
        assert.match(error.message, new RegExp(`preset "${preset}"`));
        assert.match(error.message, /dpkr helix dashboard/);
        return true;
      },
    );
  }
  assert.equal(actionCalls, 0);

  await assert.rejects(
    runAuthorizedLocalAgentAction({
      config,
      scope: { workspaceRoot: inspectRoot },
      writeMode: "allowed",
      action: () => {
        actionCalls += 1;
      },
    }),
    (error: unknown) =>
      error instanceof WorkspacePolicyDeniedError
      && error.decision.denial.project.id === inspectProject.id,
  );
  assert.equal(actionCalls, 0);

  await assert.rejects(
    runAuthorizedLocalAgentAction({
      config,
      scope: { workspaceRoot: detachedWorktreeRoot },
      writeMode: "allowed",
      action: () => {
        actionCalls += 1;
      },
    }),
    (error: unknown) =>
      error instanceof WorkspacePolicyDeniedError
      && error.decision.denial.project.id === inspectProject.id,
  );
  assert.equal(actionCalls, 0);

  if (process.platform === "win32") {
    await assert.rejects(
      runAuthorizedLocalAgentAction({
        config,
        scope: { workspaceRoot: detachedWorktreeRoot.toUpperCase() },
        writeMode: "allowed",
        action: () => {
          actionCalls += 1;
        },
      }),
      (error: unknown) =>
        error instanceof WorkspacePolicyDeniedError
        && error.decision.denial.project.id === inspectProject.id,
    );
    assert.equal(actionCalls, 0);
  }

  const developResult = await runAuthorizedLocalAgentAction({
    config,
    scope: { workspaceId: developWorkspace.id, workspaceRoot: developWorkspace.root },
    writeMode: "allowed",
    action: () => {
      actionCalls += 1;
      return "develop-started";
    },
  });
  assert.equal(developResult, "develop-started");
  assert.equal(actionCalls, 1);

  const readOnlyResult = await runAuthorizedLocalAgentAction({
    config,
    scope: { workspaceId: inspectWorkspace.id, workspaceRoot: inspectWorkspace.root },
    writeMode: "read_only",
    action: () => {
      actionCalls += 1;
      return "read-only-started";
    },
  });
  assert.equal(readOnlyResult, "read-only-started");
  assert.equal(actionCalls, 2);

  await assert.rejects(
    runAuthorizedLocalAgentAction({
      config,
      scope: { workspaceId: developWorkspace.id, workspaceRoot: developWorkspace.root },
      writeMode: "full_access",
      action: () => {
        actionCalls += 1;
      },
    }),
    (error: unknown) =>
      error instanceof WorkspacePolicyDeniedError
      && error.decision.denial.operation === "delegate_full_access",
  );
  assert.equal(actionCalls, 2);

  const legacyResult = await runAuthorizedLocalAgentAction({
    config,
    scope: { workspaceRoot: legacyRoot },
    writeMode: "full_access",
    action: () => {
      actionCalls += 1;
      return "legacy-started";
    },
  });
  assert.equal(legacyResult, "legacy-started");
  assert.equal(actionCalls, 3);

  await projects.update(changingProject.id, { permissionPreset: "inspect" });
  await assert.rejects(
    runAuthorizedLocalAgentAction({
      config,
      scope: { workspaceId: changingWorkspace.id, workspaceRoot: changingWorkspace.root },
      writeMode: "allowed",
      action: () => {
        actionCalls += 1;
      },
    }),
    (error: unknown) =>
      error instanceof WorkspacePolicyDeniedError
      && error.decision.denial.preset === "inspect",
  );
  assert.equal(actionCalls, 3);

  projects.forget(forgottenProject.id);
  assert.deepEqual(
    await resolveLocalAgentPolicySource(config, {
      workspaceId: forgottenWorkspace.id,
      workspaceRoot: forgottenWorkspace.root,
    }),
    { kind: "legacy" },
  );
  await runAuthorizedLocalAgentAction({
    config,
    scope: { workspaceId: forgottenWorkspace.id, workspaceRoot: forgottenWorkspace.root },
    writeMode: "allowed",
    action: () => {
      actionCalls += 1;
    },
  });
  assert.equal(actionCalls, 4);

  await assert.rejects(
    runAuthorizedLocalAgentAction({
      config,
      scope: { workspaceId: developWorkspace.id, workspaceRoot: inspectRoot },
      writeMode: "allowed",
      action: () => {
        actionCalls += 1;
      },
    }),
    /does not match the persisted workspace/,
  );
  assert.equal(actionCalls, 4);

  await assert.rejects(
    runAuthorizedLocalAgentAction({
      config,
      scope: { workspaceId: "ws_unknown", workspaceRoot: legacyRoot },
      writeMode: "allowed",
      action: () => {
        actionCalls += 1;
      },
    }),
    /Unknown workspaceId/,
  );
  assert.equal(actionCalls, 4);

  assert.equal(developProject.permissionPreset, "develop");
} finally {
  workspaceStore?.close();
  projectStore?.close();
  await rm(root, { recursive: true, force: true });
}
