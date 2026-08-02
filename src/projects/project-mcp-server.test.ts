import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "../config.js";
import { ProcessSessionManager } from "../process-sessions.js";
import { createReviewCheckpointManager } from "../review-checkpoints.js";
import { createMcpServer } from "../server.js";
import { SqliteWorkspaceHandoffStore } from "../workspace-handoff-store.js";
import { SqliteWorkspaceStore } from "../workspace-store.js";
import { WorkspaceRegistry } from "../workspaces.js";
import {
  PROJECT_LIST_TOOL_ANNOTATIONS,
  PROJECT_OPEN_TOOL_ANNOTATIONS,
  PROJECT_OPEN_TOOL_VISIBILITY,
} from "./project-mcp.js";
import { ProjectRegistry } from "./project-registry.js";
import { SqliteProjectStore } from "./project-store.js";

interface TextToolResult {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  _meta?: {
    card?: {
      payload?: { diff?: string; patch?: string };
    };
  };
  isError?: boolean;
}

const workspaceAppDistRoot = new URL("../../dist/ui/", import.meta.url);
const workspaceAppManifestDir = new URL(".vite/", workspaceAppDistRoot);
const workspaceAppAssetsDir = new URL("assets/", workspaceAppDistRoot);
const workspaceAppManifestUrl = new URL("manifest.json", workspaceAppManifestDir);
const workspaceAppScriptUrl = new URL("workspace-app-clean-test.js", workspaceAppAssetsDir);
const workspaceAppStylesheetUrl = new URL("workspace-app-clean-test.css", workspaceAppAssetsDir);
const root = await mkdtemp(join(tmpdir(), "devspace-project-mcp-server-test-"));
const execFileAsync = promisify(execFile);
let createdWorkspaceAppFixture = false;

try {
  createdWorkspaceAppFixture = await ensureWorkspaceAppFixture();
  const allowedRoot = join(root, "allowed");
  const stateDir = join(root, "state");
  const agentDir = join(root, "agent");
  const checkoutRoot = join(allowedRoot, "checkout");
  const worktreeRoot = join(allowedRoot, "worktree");
  const legacyRoot = join(allowedRoot, "legacy");
  const missingRoot = join(allowedRoot, "missing");
  await mkdir(checkoutRoot, { recursive: true });
  await mkdir(worktreeRoot, { recursive: true });
  await mkdir(legacyRoot, { recursive: true });
  await mkdir(missingRoot, { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await writeFile(join(legacyRoot, "README.md"), "# Legacy workspace\n");
  await git(legacyRoot, ["init"]);
  await git(legacyRoot, ["config", "user.email", "devspace@example.com"]);
  await git(legacyRoot, ["config", "user.name", "DevSpace Test"]);
  await git(legacyRoot, ["add", "README.md"]);
  await git(legacyRoot, ["-c", "commit.gpgsign=false", "commit", "-m", "Initial commit"]);
  await git(worktreeRoot, ["init"]);
  await git(worktreeRoot, ["config", "user.email", "devspace@example.com"]);
  await git(worktreeRoot, ["config", "user.name", "DevSpace Test"]);
  await git(worktreeRoot, ["-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "Initial commit"]);

  let ids = 0;
  const projectStore = new SqliteProjectStore(stateDir);
  const projects = new ProjectRegistry(projectStore, [allowedRoot], {
    createId: () => `prj_registered_${++ids}`,
    now: () => "2026-07-28T00:00:00.000Z",
  });
  const checkout = await projects.register({
    path: checkoutRoot,
    name: "Shared Name",
    slug: "checkout-project",
    permissionPreset: "develop",
    defaultMode: "checkout",
    pinned: true,
  });
  const worktree = await projects.register({
    path: worktreeRoot,
    name: "Shared Name",
    slug: "worktree-project",
    permissionPreset: "inspect",
    defaultMode: "worktree",
  });
  const missing = await projects.register({
    path: missingRoot,
    name: "Missing Project",
    slug: "missing-project",
  });
  await rm(missingRoot, { recursive: true, force: true });

  const config = loadConfig({
    DEVSPACE_CONFIG_DIR: join(root, "config"),
    DEVSPACE_ALLOWED_ROOTS: allowedRoot,
    DEVSPACE_WORKTREE_ROOT: join(root, "worktrees"),
    DEVSPACE_AGENT_DIR: agentDir,
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    DEVSPACE_WIDGETS: "full",
    PORT: "1",
  });
  const workspaceStore = new SqliteWorkspaceStore(stateDir);
  const handoffs = new SqliteWorkspaceHandoffStore(stateDir);
  const workspaces = new WorkspaceRegistry(config, workspaceStore, projects);
  const reviewCheckpoints = createReviewCheckpointManager();
  const server = createMcpServer(
    config,
    projects,
    workspaces,
    handoffs,
    reviewCheckpoints,
    new ProcessSessionManager(),
    [],
    [],
  );
  const client = new Client({ name: "devspace-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const tools = await client.listTools();
    const listTool = tools.tools.find((tool) => tool.name === "list_projects");
    const openTool = tools.tools.find((tool) => tool.name === "open_project");
    const openWorkspaceTool = tools.tools.find((tool) => tool.name === "open_workspace");
    const readTool = tools.tools.find((tool) => tool.name === "read");
    const editTool = tools.tools.find((tool) => tool.name === "edit");
    const writeTool = tools.tools.find((tool) => tool.name === "write");
    assert.ok(listTool, "list_projects is registered in the MCP tool catalog");
    assert.ok(openTool, "open_project is registered in the MCP tool catalog");
    assert.ok(openWorkspaceTool, "legacy open_workspace remains in the MCP tool catalog");
    assert.ok(readTool, "workspace-scoped read remains in the MCP tool catalog");
    assert.ok(editTool, "legacy edit remains in the MCP tool catalog");
    assert.ok(writeTool, "legacy write remains in the MCP tool catalog");
    assert.match(
      readTool.description ?? "",
      /Advertising a skill never expands the user's or task's granted read scope/,
    );
    assert.deepEqual(listTool.annotations, PROJECT_LIST_TOOL_ANNOTATIONS);
    assert.deepEqual(openTool.annotations, PROJECT_OPEN_TOOL_ANNOTATIONS);
    assert.deepEqual(openTool._meta?.ui, {
      resourceUri: "ui://devspace/workspace-app.html",
      visibility: [...PROJECT_OPEN_TOOL_VISIBILITY],
    });
    assert.deepEqual(listTool._meta?.ui, {
      resourceUri: "ui://devspace/workspace-app.html",
      visibility: ["model"],
    });
    const appResource = await client.readResource({
      uri: "ui://devspace/workspace-app.html",
    });
    assert.equal(appResource.contents[0]?.uri, "ui://devspace/workspace-app.html");
    assert.match(appResource.contents[0]?.mimeType ?? "", /text\/html/);
    assert.equal("text" in (appResource.contents[0] ?? {}), true);
    assert.match(
      String(appResource.contents[0] && "text" in appResource.contents[0] ? appResource.contents[0].text : ""),
      /<html/i,
    );
    assert.ok("includeUnavailable" in (listTool.inputSchema.properties ?? {}));
    assert.ok("projects" in (listTool.outputSchema?.properties ?? {}));
    assert.deepEqual(openTool.inputSchema.required, ["project"]);
    assert.ok("project" in (openTool.inputSchema.properties ?? {}));
    assert.ok("baseRef" in (openTool.inputSchema.properties ?? {}));
    assert.ok("workspaceId" in (openTool.outputSchema?.properties ?? {}));
    assert.ok("project" in (openTool.outputSchema?.properties ?? {}));
    assert.ok("repositoryContext" in (openTool.outputSchema?.properties ?? {}));
    assert.ok("repositoryContext" in (openWorkspaceTool.outputSchema?.properties ?? {}));
    for (const remoteMutationTool of [
      "register_project",
      "update_project",
      "set_project_preset",
      "forget_project",
    ]) {
      assert.equal(
        tools.tools.some((tool) => tool.name === remoteMutationTool),
        false,
        `${remoteMutationTool} must remain local-dashboard-only`,
      );
    }
    for (const tool of tools.tools) {
      assert.equal(
        "permissionPreset" in (tool.inputSchema.properties ?? {}),
        false,
        `${tool.name} must not accept a remote permissionPreset mutation input`,
      );
    }

    const listResult = asTextToolResult(await client.callTool({ name: "list_projects", arguments: {} }));
    assert.equal(listResult.isError, undefined);
    assert.equal(listResult.content[0]?.type, "text");
    assert.match(listResult.content[0]?.text ?? "", /Registered projects/);
    assert.equal((listResult.structuredContent?.summary as { total?: number } | undefined)?.total, 3);
    assert.equal((listResult.structuredContent?.projects as unknown[] | undefined)?.length, 2);
    assert.equal(JSON.stringify(listResult.structuredContent), JSON.stringify(listResult.structuredContent).replace(/rootKey/g, ""));

    const unavailable = asTextToolResult(await client.callTool({
      name: "open_project",
      arguments: { project: missing.id },
    }));
    assert.equal(unavailable.isError, true);
    assert.equal(unavailable.content[0]?.type, "text");
    assert.match(unavailable.content[0]?.text ?? "", /Project path does not exist/);
    assert.equal(unavailable.structuredContent?.workspaceId, undefined);

    const ambiguous = asTextToolResult(await client.callTool({
      name: "open_project",
      arguments: { project: "Shared Name" },
    }));
    assert.equal(ambiguous.isError, true);
    assert.match(ambiguous.content[0]?.text ?? "", /Project display name is ambiguous/);
    assert.equal(ambiguous.structuredContent?.workspaceId, undefined);

    const openedCheckout = asTextToolResult(await client.callTool({
      name: "open_project",
      arguments: { project: checkout.slug },
    }));
    assert.equal(openedCheckout.isError, undefined);
    assert.match(openedCheckout.content[0]?.text ?? "", /Opened project Shared Name \(checkout-project\)/);
    assert.equal(openedCheckout.structuredContent?.mode, "checkout");
    assert.equal(
      (openedCheckout.structuredContent?.repositoryContext as { state?: string } | undefined)?.state,
      "unavailable",
    );
    assert.deepEqual(openedCheckout.structuredContent?.project, {
      id: checkout.id,
      slug: checkout.slug,
      name: checkout.name,
      permissionPreset: "develop",
      defaultMode: "checkout",
    });

    const openedWorktree = asTextToolResult(await client.callTool({
      name: "open_project",
      arguments: { project: worktree.id, baseRef: "HEAD" },
    }));
    assert.equal(openedWorktree.isError, undefined);
    assert.match(openedWorktree.content[0]?.text ?? "", /Mode: worktree/);
    assert.equal(openedWorktree.structuredContent?.mode, "worktree");
    assert.deepEqual(openedWorktree.structuredContent?.project, {
      id: worktree.id,
      slug: worktree.slug,
      name: worktree.name,
      permissionPreset: "inspect",
      defaultMode: "worktree",
    });

    const openedLegacy = asTextToolResult(await client.callTool({
      name: "open_workspace",
      arguments: { path: legacyRoot },
    }));
    assert.equal(openedLegacy.isError, undefined);
    assert.match(openedLegacy.content[0]?.text ?? "", /Opened workspace/);
    assert.equal(openedLegacy.structuredContent?.mode, "checkout");
    assert.equal(openedLegacy.structuredContent?.project, undefined);
    assert.doesNotMatch(openedLegacy.content[0]?.text ?? "", /Repository context:/);
    assert.match(openedLegacy.content[1]?.text ?? "", /Repository context: \{/);
    assert.equal(
      (openedLegacy.structuredContent?.repositoryContext as { state?: string } | undefined)?.state,
      "available",
    );
    assert.equal(
      typeof (openedLegacy.structuredContent?.repositoryContext as { fingerprint?: unknown } | undefined)?.fingerprint,
      "string",
    );
    assert.match(
      String(openedLegacy.structuredContent?.instruction ?? ""),
      /If a narrower read boundary excludes a skill path, do not read or activate that skill/,
    );
    const legacyWorkspaceId = openedLegacy.structuredContent?.workspaceId;
    assert.equal(typeof legacyWorkspaceId, "string");

    const legacyRead = asTextToolResult(await client.callTool({
      name: "read",
      arguments: {
        workspaceId: legacyWorkspaceId,
        path: "README.md",
      },
    }));
    assert.equal(legacyRead.isError, undefined);
    assert.match(legacyRead.content[0]?.text ?? "", /# Legacy workspace/);
    assert.match(
      String(legacyRead.structuredContent?.result ?? ""),
      /# Legacy workspace/,
      "plain MCP clients can consume a useful structured read result without MCP Apps metadata",
    );

    const legacyEdit = asTextToolResult(await client.callTool({
      name: "edit",
      arguments: {
        workspaceId: legacyWorkspaceId,
        path: "README.md",
        edits: [{ oldText: "# Legacy workspace", newText: "# Legacy workspace\n\nEdited through MCP." }],
      },
    }));
    assert.equal(legacyEdit.isError, undefined);
    assert.equal(legacyEdit.structuredContent?.status, "applied");
    assert.match(legacyEdit._meta?.card?.payload?.diff ?? "", /Edited through MCP/);

    const legacyWrite = asTextToolResult(await client.callTool({
      name: "write",
      arguments: {
        workspaceId: legacyWorkspaceId,
        path: "notes.txt",
        content: "Created through MCP.\n",
      },
    }));
    assert.equal(legacyWrite.isError, undefined);
    assert.match(legacyWrite._meta?.card?.payload?.patch ?? "", /Created through MCP/);

    const legacyChanges = await reviewCheckpoints.reviewChanges({
      workspaceId: String(legacyWorkspaceId),
      root: legacyRoot,
      markReviewed: false,
    });
    assert.equal(
      legacyChanges.summary.files,
      0,
      "inline MCP Apps file cards advance the canonical review checkpoint",
    );
  } finally {
    await client.close();
    await server.close();
    workspaceStore.close();
    handoffs.close();
    projectStore.close();
  }
} finally {
  if (createdWorkspaceAppFixture) {
    await removeWorkspaceAppFixture();
  }
  await rm(root, { recursive: true, force: true });
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

function asTextToolResult(result: unknown): TextToolResult {
  assert.equal(typeof result, "object");
  assert.ok(result);
  const record = result as Record<string, unknown>;
  assert.ok("content" in record);
  assert.ok(Array.isArray(record.content));
  return record as unknown as TextToolResult;
}

async function ensureWorkspaceAppFixture(): Promise<boolean> {
  try {
    await access(workspaceAppManifestUrl);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(workspaceAppManifestDir, { recursive: true });
  await mkdir(workspaceAppAssetsDir, { recursive: true });
  let scriptCreated = false;
  let stylesheetCreated = false;

  try {
    await writeFile(workspaceAppScriptUrl, "export {};\n", { flag: "wx" });
    scriptCreated = true;
    await writeFile(workspaceAppStylesheetUrl, "/* clean-checkout test fixture */\n", { flag: "wx" });
    stylesheetCreated = true;
    await writeFile(
      workspaceAppManifestUrl,
      JSON.stringify({
        "workspace-app.html": {
          file: "assets/workspace-app-clean-test.js",
          css: ["assets/workspace-app-clean-test.css"],
          isEntry: true,
        },
      }),
      { flag: "wx" },
    );
    return true;
  } catch (error) {
    if (stylesheetCreated) await rm(workspaceAppStylesheetUrl, { force: true });
    if (scriptCreated) await rm(workspaceAppScriptUrl, { force: true });
    await removeEmptyFixtureDirectories();
    throw error;
  }
}

async function removeWorkspaceAppFixture(): Promise<void> {
  await rm(workspaceAppManifestUrl, { force: true });
  await rm(workspaceAppScriptUrl, { force: true });
  await rm(workspaceAppStylesheetUrl, { force: true });
  await removeEmptyFixtureDirectories();
}

async function removeEmptyFixtureDirectories(): Promise<void> {
  for (const directory of [
    workspaceAppManifestDir,
    workspaceAppAssetsDir,
    workspaceAppDistRoot,
    new URL("../", workspaceAppDistRoot),
  ]) {
    try {
      await rmdir(directory);
    } catch (error) {
      if (!["ENOENT", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        throw error;
      }
    }
  }
}
