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
import { OperationEventBus } from "../operations/operation-event-bus.js";
import { McpToolOperationProjector } from "../operations/mcp-tool-operation-projector.js";
import { OperationRunService } from "../operations/operation-run-service.js";
import { OperationStore } from "../operations/operation-store.js";
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

const root = await mkdtemp(join(tmpdir(), "devspace-project-file-policy-test-"));
const outsideRoot = await mkdtemp(join(tmpdir(), "devspace-project-file-policy-outside-"));

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
    mkdir(join(designRoot, ".devspace"), { recursive: true }),
    mkdir(join(designRoot, ".git"), { recursive: true }),
    mkdir(join(developRoot, "src"), { recursive: true }),
    mkdir(legacyRoot, { recursive: true }),
    mkdir(agentDir, { recursive: true }),
  ]);

  await Promise.all([
    writeFile(join(inspectRoot, "README.md"), "inspect-before\n"),
    writeFile(join(designRoot, "docs", "existing.md"), "design-before\n"),
    writeFile(join(designRoot, "src", "code.ts"), "source-before\n"),
    writeFile(join(designRoot, ".env.production"), "env-before\n"),
    writeFile(join(designRoot, ".git", "config"), "git-before\n"),
    writeFile(join(developRoot, "src", "code.ts"), "develop-before\n"),
    writeFile(join(legacyRoot, "existing.txt"), "legacy-before\n"),
  ]);

  const linkType = process.platform === "win32" ? "junction" : "dir";
  await symlink(outsideRoot, join(designRoot, "docs", "outside-link"), linkType);
  await symlink(join(designRoot, "src"), join(designRoot, "docs", "src-link"), linkType);

  let ids = 0;
  const projectStore = new SqliteProjectStore(stateDir);
  const projects = new ProjectRegistry(projectStore, [allowedRoot], {
    createId: () => `prj_file_policy_${++ids}`,
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
    DEVSPACE_TOOL_MODE: "full",
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
  const operationStore = new OperationStore(stateDir);
  const operationBus = new OperationEventBus();
  const operationEvents: Array<{
    type: string;
    payload: unknown;
  }> = [];
  operationBus.subscribe((event) => {
    operationEvents.push({ type: event.type, payload: event.payload });
  });
  const operationRuns = new OperationRunService(operationStore, {
    eventBus: operationBus,
  });
  const mcpToolProjector = new McpToolOperationProjector(operationRuns, {
    resolveWorkspace: (workspaceId) => {
      const workspace = workspaces.getWorkspace(workspaceId);
      return {
        workspaceId: workspace.id,
        projectId: workspace.project?.id,
      };
    },
  });

  const server = createMcpServer(
    config,
    projects,
    workspaces,
    handoffs,
    createReviewCheckpointManager(),
    new ProcessSessionManager(),
    [],
    [],
    undefined,
    mcpToolProjector,
  );
  const client = new Client({ name: "devspace-file-policy-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    await assertReadOnlyToolsAllowed(
      client,
      inspectWorkspace.id,
      "README.md",
      "inspect-before",
    );
    await assertReadOnlyToolsAllowed(
      client,
      designWorkspace.id,
      "docs/existing.md",
      "design-before",
    );
    await assertReadOnlyToolsAllowed(
      client,
      developWorkspace.id,
      "src/code.ts",
      "develop-before",
    );
    await assertReadOnlyToolsAllowed(
      client,
      legacyWorkspace.id,
      "existing.txt",
      "legacy-before",
    );

    const inspectWrite = await call(client, "write", {
      workspaceId: inspectWorkspace.id,
      path: "denied.txt",
      content: "inspect-secret-content\n",
    });
    assertPolicyDenied(inspectWrite, "write", "Inspect Project", "inspect");
    assert.doesNotMatch(toolText(inspectWrite), /denied\.txt|inspect-secret-content/);
    await assertMissing(join(inspectRoot, "denied.txt"));

    const inspectEdit = await call(client, "edit", {
      workspaceId: inspectWorkspace.id,
      path: "README.md",
      edits: [{ oldText: "inspect-before", newText: "inspect-after" }],
    });
    assertPolicyDenied(inspectEdit, "edit", "Inspect Project", "inspect");
    assert.equal(await readFile(join(inspectRoot, "README.md"), "utf8"), "inspect-before\n");

    const inspectEscape = await call(client, "write", {
      workspaceId: inspectWorkspace.id,
      path: "../inspect-secret-token.md",
      content: "inspect-escape-content\n",
    });
    assertPolicyDenied(inspectEscape, "write", "Inspect Project", "inspect");
    assert.doesNotMatch(
      toolText(inspectEscape),
      /inspect-secret-token|inspect-escape-content/,
    );
    await assertMissing(join(allowedRoot, "inspect-secret-token.md"));

    assertSuccessful(await call(client, "write", {
      workspaceId: designWorkspace.id,
      path: "docs/new.md",
      content: "new design\n",
    }));
    assert.equal(await readFile(join(designRoot, "docs", "new.md"), "utf8"), "new design\n");

    assertSuccessful(await call(client, "edit", {
      workspaceId: designWorkspace.id,
      path: "docs/existing.md",
      edits: [{ oldText: "design-before", newText: "design-after" }],
    }));
    assert.equal(await readFile(join(designRoot, "docs", "existing.md"), "utf8"), "design-after\n");

    assertSuccessful(await call(client, "write", {
      workspaceId: designWorkspace.id,
      path: "PLAN.mdx",
      content: "root design\n",
    }));
    assertSuccessful(await call(client, "write", {
      workspaceId: designWorkspace.id,
      path: ".devspace/HANDOFF.md",
      content: "handoff design\n",
    }));

    const sourceWrite = await call(client, "write", {
      workspaceId: designWorkspace.id,
      path: "src/code.ts",
      content: "source-secret-content\n",
    });
    assertPolicyDenied(sourceWrite, "write", "Design Project", "design", true);
    assert.doesNotMatch(toolText(sourceWrite), /src\/code\.ts|source-secret-content/);
    assert.equal(await readFile(join(designRoot, "src", "code.ts"), "utf8"), "source-before\n");

    const envEdit = await call(client, "edit", {
      workspaceId: designWorkspace.id,
      path: ".env.production",
      edits: [{ oldText: "env-before", newText: "env-secret-content" }],
    });
    assertPolicyDenied(envEdit, "edit", "Design Project", "design", true);
    assert.doesNotMatch(toolText(envEdit), /\.env\.production|env-secret-content/);
    assert.equal(await readFile(join(designRoot, ".env.production"), "utf8"), "env-before\n");

    const gitWrite = await call(client, "write", {
      workspaceId: designWorkspace.id,
      path: ".git/config",
      content: "git-secret-content\n",
    });
    assertPolicyDenied(gitWrite, "write", "Design Project", "design", true);
    assert.equal(await readFile(join(designRoot, ".git", "config"), "utf8"), "git-before\n");

    const credentialWrite = await call(client, "write", {
      workspaceId: designWorkspace.id,
      path: "docs/client-secret.json",
      content: "credential-secret-content\n",
    });
    assertPolicyDenied(credentialWrite, "write", "Design Project", "design", true);
    assert.doesNotMatch(
      toolText(credentialWrite),
      /client-secret\.json|credential-secret-content/,
    );
    await assertMissing(join(designRoot, "docs", "client-secret.json"));

    const escapedWrite = await call(client, "write", {
      workspaceId: designWorkspace.id,
      path: "../escaped.md",
      content: "escaped-content\n",
    });
    assertPolicyDenied(escapedWrite, "write", "Design Project", "design", true);
    assert.doesNotMatch(toolText(escapedWrite), /\.\.\/escaped\.md|escaped-content/);
    await assertMissing(join(allowedRoot, "escaped.md"));

    const outsideLinkWrite = await call(client, "write", {
      workspaceId: designWorkspace.id,
      path: "docs/outside-link/outside.md",
      content: "outside-content\n",
    });
    assertPolicyDenied(outsideLinkWrite, "write", "Design Project", "design", true);
    assert.doesNotMatch(
      toolText(outsideLinkWrite),
      /docs\/outside-link|outside-content/,
    );
    await assertMissing(join(outsideRoot, "outside.md"));

    const sourceLinkWrite = await call(client, "write", {
      workspaceId: designWorkspace.id,
      path: "docs/src-link/linked.ts",
      content: "linked-source-content\n",
    });
    assertPolicyDenied(sourceLinkWrite, "write", "Design Project", "design", true);
    assert.doesNotMatch(toolText(sourceLinkWrite), /docs\/src-link|linked-source-content/);
    await assertMissing(join(designRoot, "src", "linked.ts"));

    assertSuccessful(await call(client, "write", {
      workspaceId: developWorkspace.id,
      path: "src/code.ts",
      content: "develop-write\n",
    }));
    assertSuccessful(await call(client, "edit", {
      workspaceId: developWorkspace.id,
      path: "src/code.ts",
      edits: [{ oldText: "develop-write", newText: "develop-edit" }],
    }));
    assert.equal(await readFile(join(developRoot, "src", "code.ts"), "utf8"), "develop-edit\n");

    const developEscape = await call(client, "edit", {
      workspaceId: developWorkspace.id,
      path: "../develop-secret-token.ts",
      edits: [{ oldText: "missing", newText: "develop-escape-content" }],
    });
    assertPolicyDenied(developEscape, "edit", "Develop Project", "develop", true);
    assert.doesNotMatch(
      toolText(developEscape),
      /develop-secret-token|develop-escape-content/,
    );
    await assertMissing(join(allowedRoot, "develop-secret-token.ts"));

    assertSuccessful(await call(client, "write", {
      workspaceId: legacyWorkspace.id,
      path: "new.txt",
      content: "legacy-write\n",
    }));
    assertSuccessful(await call(client, "edit", {
      workspaceId: legacyWorkspace.id,
      path: "existing.txt",
      edits: [{ oldText: "legacy-before", newText: "legacy-edit" }],
    }));
    assert.equal(await readFile(join(legacyRoot, "new.txt"), "utf8"), "legacy-write\n");
    assert.equal(await readFile(join(legacyRoot, "existing.txt"), "utf8"), "legacy-edit\n");

    const fileChanges = operationEvents
      .filter((event) => event.type === "file.changed")
      .map((event) => event.payload);
    assert.ok(fileChanges.some((payload) =>
      JSON.stringify(payload) === JSON.stringify({
        relativePath: "docs/new.md",
        operation: "create",
      })
    ));
    assert.ok(fileChanges.some((payload) =>
      JSON.stringify(payload) === JSON.stringify({
        relativePath: "docs/existing.md",
        operation: "update",
      })
    ));
    assert.ok(
      operationEvents.some((event) => event.type === "tool.failed"),
      "Denied real MCP mutations must project a generic tool failure.",
    );
    assert.doesNotMatch(
      JSON.stringify(operationEvents),
      /inspect-secret-content|source-secret-content|credential-secret-content/,
    );
  } finally {
    await client.close();
    await server.close();
    workspaceStore.close();
    handoffs.close();
    projectStore.close();
    operationStore.close();
  }
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(outsideRoot, { recursive: true, force: true });
}

async function assertReadOnlyToolsAllowed(
  client: Client,
  workspaceId: string,
  path: string,
  expectedText: string,
): Promise<void> {
  const read = await call(client, "read", { workspaceId, path });
  assertSuccessful(read);
  assert.match(toolText(read), new RegExp(expectedText));

  const grep = await call(client, "grep", {
    workspaceId,
    pattern: expectedText,
  });
  assertSuccessful(grep);
  assert.match(toolText(grep), new RegExp(expectedText));

  assertSuccessful(await call(client, "glob", {
    workspaceId,
    pattern: "**/*",
  }));
  assertSuccessful(await call(client, "ls", {
    workspaceId,
    path: ".",
  }));
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<TextToolResult> {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(typeof result, "object");
  assert.ok(result);
  return result as TextToolResult;
}

function assertSuccessful(result: TextToolResult): void {
  assert.notEqual(result.isError, true, toolText(result));
}

function assertPolicyDenied(
  result: TextToolResult,
  operation: "write" | "edit",
  projectName: string,
  preset: "inspect" | "design" | "develop",
  pathDenied = false,
): void {
  assert.equal(result.isError, true);
  const text = toolText(result);
  assert.match(text, new RegExp(`Operation "${operation}"`));
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
