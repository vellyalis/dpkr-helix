import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "../config.js";
import { ProcessSessionManager } from "../process-sessions.js";
import { createReviewCheckpointManager } from "../review-checkpoints.js";
import { createMcpServer } from "../server.js";
import { SqliteWorkspaceHandoffStore } from "../workspace-handoff-store.js";
import { SqliteWorkspaceStore } from "../workspace-store.js";
import { WorkspaceRegistry } from "../workspaces.js";
import { ProjectRegistry } from "./project-registry.js";
import { SqliteProjectStore } from "./project-store.js";

interface TextToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

const root = await mkdtemp(join(tmpdir(), "devspace-project-patch-policy-test-"));
const outsideRoot = await mkdtemp(join(tmpdir(), "devspace-project-patch-policy-outside-"));

try {
  const allowedRoot = join(root, "allowed");
  const stateDir = join(root, "state");
  const agentDir = join(root, "agent");
  const inspectRoot = join(allowedRoot, "inspect");
  const designRoot = join(allowedRoot, "design");
  const developRoot = join(allowedRoot, "develop");
  const legacyRoot = join(allowedRoot, "legacy");

  await Promise.all([
    mkdir(inspectRoot, { recursive: true }),
    mkdir(join(designRoot, "docs"), { recursive: true }),
    mkdir(join(designRoot, "src"), { recursive: true }),
    mkdir(join(designRoot, ".git"), { recursive: true }),
    mkdir(join(developRoot, "src"), { recursive: true }),
    mkdir(legacyRoot, { recursive: true }),
    mkdir(agentDir, { recursive: true }),
  ]);

  await Promise.all([
    writeFile(join(inspectRoot, "README.md"), "inspect-before\n"),
    writeFile(join(designRoot, "docs", "allowed.md"), "design-before\n"),
    writeFile(join(designRoot, "docs", "move-source.md"), "move-before\n"),
    writeFile(join(designRoot, "src", "code.ts"), "source-before\n"),
    writeFile(join(designRoot, ".env.production"), "env-before\n"),
    writeFile(join(designRoot, ".git", "config"), "git-before\n"),
    writeFile(join(developRoot, "src", "code.ts"), "develop-before\n"),
    writeFile(join(legacyRoot, "legacy.txt"), "legacy-before\n"),
  ]);

  const linkType = process.platform === "win32" ? "junction" : "dir";
  await symlink(outsideRoot, join(designRoot, "docs", "outside-link"), linkType);
  await symlink(join(designRoot, "src"), join(designRoot, "docs", "src-link"), linkType);

  let ids = 0;
  const projectStore = new SqliteProjectStore(stateDir);
  const projects = new ProjectRegistry(projectStore, [allowedRoot], {
    createId: () => `prj_patch_policy_${++ids}`,
    now: () => "2026-07-29T00:00:00.000Z",
  });
  await projects.register({
    path: inspectRoot,
    name: "Inspect Project",
    slug: "inspect-project",
    permissionPreset: "inspect",
  });
  await projects.register({
    path: designRoot,
    name: "Design Project",
    slug: "design-project",
    permissionPreset: "design",
  });
  await projects.register({
    path: developRoot,
    name: "Develop Project",
    slug: "develop-project",
    permissionPreset: "develop",
  });

  const config = loadConfig({
    DEVSPACE_CONFIG_DIR: join(root, "config"),
    DEVSPACE_ALLOWED_ROOTS: allowedRoot,
    DEVSPACE_WORKTREE_ROOT: join(root, "worktrees"),
    DEVSPACE_AGENT_DIR: agentDir,
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    DEVSPACE_TOOL_MODE: "codex",
    DEVSPACE_WIDGETS: "off",
    PORT: "1",
  });
  const workspaceStore = new SqliteWorkspaceStore(stateDir);
  const handoffs = new SqliteWorkspaceHandoffStore(stateDir);
  const workspaces = new WorkspaceRegistry(config, workspaceStore, projects);
  const inspectWorkspace = (await workspaces.openWorkspace(inspectRoot)).workspace;
  const designWorkspace = (await workspaces.openWorkspace(designRoot)).workspace;
  const developWorkspace = (await workspaces.openWorkspace(developRoot)).workspace;
  const legacyWorkspace = (await workspaces.openWorkspace(legacyRoot)).workspace;

  const server = createMcpServer(
    config,
    projects,
    workspaces,
    handoffs,
    createReviewCheckpointManager(),
    new ProcessSessionManager(),
    [],
    [],
  );
  const client = new Client({ name: "devspace-patch-policy-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const inspectPatch = await callPatch(
      client,
      inspectWorkspace.id,
      `*** Begin Patch
*** Update File: README.md
@@
-inspect-before
+inspect-secret-content
*** End Patch`,
    );
    assertPolicyDenied(inspectPatch, "Inspect Project", "inspect");
    assert.doesNotMatch(toolText(inspectPatch), /README\.md|inspect-secret-content/);
    assert.equal(await readFile(join(inspectRoot, "README.md"), "utf8"), "inspect-before\n");

    assertSuccessful(await callPatch(
      client,
      designWorkspace.id,
      `*** Begin Patch
*** Add File: docs/new.md
+new design
*** Update File: docs/allowed.md
@@
-design-before
+design-after
*** End Patch`,
    ));
    assert.equal(await readFile(join(designRoot, "docs", "new.md"), "utf8"), "new design\n");
    assert.equal(await readFile(join(designRoot, "docs", "allowed.md"), "utf8"), "design-after\n");

    const mixedDenied = await callPatch(
      client,
      designWorkspace.id,
      `*** Begin Patch
*** Add File: docs/should-not-exist.md
+staged design
*** Update File: src/code.ts
@@
-source-before
+source-secret-content
*** End Patch`,
    );
    assertPolicyDenied(mixedDenied, "Design Project", "design", true);
    assert.doesNotMatch(
      toolText(mixedDenied),
      /should-not-exist|src\/code\.ts|staged design|source-secret-content/,
    );
    await assertMissing(join(designRoot, "docs", "should-not-exist.md"));
    assert.equal(await readFile(join(designRoot, "src", "code.ts"), "utf8"), "source-before\n");

    const moveDestinationDenied = await callPatch(
      client,
      designWorkspace.id,
      `*** Begin Patch
*** Update File: docs/move-source.md
*** Move to: src/moved.md
@@
-move-before
+move-after
*** End Patch`,
    );
    assertPolicyDenied(moveDestinationDenied, "Design Project", "design", true);
    assert.equal(
      await readFile(join(designRoot, "docs", "move-source.md"), "utf8"),
      "move-before\n",
    );
    await assertMissing(join(designRoot, "src", "moved.md"));

    const moveSourceDenied = await callPatch(
      client,
      designWorkspace.id,
      `*** Begin Patch
*** Update File: src/code.ts
*** Move to: docs/code.md
@@
-source-before
+source-after
*** End Patch`,
    );
    assertPolicyDenied(moveSourceDenied, "Design Project", "design", true);
    assert.equal(await readFile(join(designRoot, "src", "code.ts"), "utf8"), "source-before\n");
    await assertMissing(join(designRoot, "docs", "code.md"));

    for (const [path, existingPath, existingContent] of [
      [".env.production", join(designRoot, ".env.production"), "env-before\n"],
      [".git/config", join(designRoot, ".git", "config"), "git-before\n"],
    ] as const) {
      const denied = await callPatch(
        client,
        designWorkspace.id,
        `*** Begin Patch
*** Update File: ${path}
@@
-${existingContent.trim()}
+secret-after
*** End Patch`,
      );
      assertPolicyDenied(denied, "Design Project", "design", true);
      assert.equal(await readFile(existingPath, "utf8"), existingContent);
    }

    const credentialDenied = await callPatch(
      client,
      designWorkspace.id,
      `*** Begin Patch
*** Add File: docs/client-secret.json
+credential-secret-content
*** End Patch`,
    );
    assertPolicyDenied(credentialDenied, "Design Project", "design", true);
    assert.doesNotMatch(toolText(credentialDenied), /client-secret|credential-secret-content/);
    await assertMissing(join(designRoot, "docs", "client-secret.json"));

    const escapedDenied = await callPatch(
      client,
      designWorkspace.id,
      `*** Begin Patch
*** Add File: ../escaped.md
+escaped-content
*** End Patch`,
    );
    assertPolicyDenied(escapedDenied, "Design Project", "design", true);
    assert.doesNotMatch(toolText(escapedDenied), /\.\.\/escaped|escaped-content/);
    await assertMissing(join(allowedRoot, "escaped.md"));

    const outsideLinkDenied = await callPatch(
      client,
      designWorkspace.id,
      `*** Begin Patch
*** Add File: docs/outside-link/outside.md
+outside-content
*** End Patch`,
    );
    assertPolicyDenied(outsideLinkDenied, "Design Project", "design", true);
    assert.doesNotMatch(toolText(outsideLinkDenied), /outside-link|outside-content/);
    await assertMissing(join(outsideRoot, "outside.md"));

    const sourceLinkDenied = await callPatch(
      client,
      designWorkspace.id,
      `*** Begin Patch
*** Add File: docs/src-link/linked.ts
+linked-source-content
*** End Patch`,
    );
    assertPolicyDenied(sourceLinkDenied, "Design Project", "design", true);
    assert.doesNotMatch(toolText(sourceLinkDenied), /src-link|linked-source-content/);
    await assertMissing(join(designRoot, "src", "linked.ts"));

    assertSuccessful(await callPatch(
      client,
      developWorkspace.id,
      `*** Begin Patch
*** Update File: src/code.ts
@@
-develop-before
+develop-after
*** Add File: src/new.ts
+develop-new
*** End Patch`,
    ));
    assert.equal(await readFile(join(developRoot, "src", "code.ts"), "utf8"), "develop-after\n");
    assert.equal(await readFile(join(developRoot, "src", "new.ts"), "utf8"), "develop-new\n");

    const developEscapeDenied = await callPatch(
      client,
      developWorkspace.id,
      `*** Begin Patch
*** Add File: ../develop-token.ts
+develop-escape-content
*** End Patch`,
    );
    assertPolicyDenied(developEscapeDenied, "Develop Project", "develop", true);
    assert.doesNotMatch(toolText(developEscapeDenied), /develop-token|develop-escape-content/);
    await assertMissing(join(allowedRoot, "develop-token.ts"));

    assertSuccessful(await callPatch(
      client,
      legacyWorkspace.id,
      `*** Begin Patch
*** Update File: legacy.txt
@@
-legacy-before
+legacy-after
*** Add File: legacy-new.txt
+legacy-new
*** End Patch`,
    ));
    assert.equal(await readFile(join(legacyRoot, "legacy.txt"), "utf8"), "legacy-after\n");
    assert.equal(await readFile(join(legacyRoot, "legacy-new.txt"), "utf8"), "legacy-new\n");
  } finally {
    await client.close();
    await server.close();
    workspaceStore.close();
    handoffs.close();
    projectStore.close();
  }
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(outsideRoot, { recursive: true, force: true });
}

async function callPatch(
  client: Client,
  workspaceId: string,
  patch: string,
): Promise<TextToolResult> {
  const result = await client.callTool({
    name: "apply_patch",
    arguments: { workspaceId, patch },
  });
  assert.equal(typeof result, "object");
  assert.ok(result);
  return result as TextToolResult;
}

function assertSuccessful(result: TextToolResult): void {
  assert.notEqual(result.isError, true, toolText(result));
}

function assertPolicyDenied(
  result: TextToolResult,
  projectName: string,
  preset: "inspect" | "design" | "develop",
  pathDenied = false,
): void {
  assert.equal(result.isError, true);
  const text = toolText(result);
  assert.match(text, /Operation "patch"/);
  assert.match(text, new RegExp(projectName));
  assert.match(text, new RegExp(`preset "${preset}"`));
  assert.match(text, /dpkr helix dashboard/);
  if (pathDenied) assert.match(text, /allowed path scope/);
}

function toolText(result: TextToolResult): string {
  return result.content.map((item) => item.text ?? "").join("\n");
}

async function assertMissing(path: string): Promise<void> {
  await assert.rejects(
    () => access(path),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT",
  );
}
