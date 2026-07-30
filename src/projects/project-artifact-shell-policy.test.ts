import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  isArtifactDownloadSupportedPlatform,
  registerArtifactTools,
} from "../artifact-tools.js";
import { ArtifactError } from "../artifact-error.js";
import { loadConfig } from "../config.js";
import type { IncomingArtifactAdapter } from "../incoming-artifacts.js";
import {
  ProcessSessionManager,
  type ProcessSnapshot,
  type StartCommandInput,
  type WriteStdinInput,
} from "../process-sessions.js";
import { createReviewCheckpointManager } from "../review-checkpoints.js";
import {
  createMcpServer,
  runAuthorizedWorkspaceProcess,
} from "../server.js";
import { SqliteWorkspaceHandoffStore } from "../workspace-handoff-store.js";
import { SqliteWorkspaceStore } from "../workspace-store.js";
import { WorkspaceRegistry } from "../workspaces.js";
import { WorkspacePolicyDeniedError } from "./project-policy.js";
import { ProjectRegistry } from "./project-registry.js";
import { SqliteProjectStore } from "./project-store.js";

interface TextToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface ArtifactToolInput {
  file: unknown;
  workspaceId: string;
  path: string;
}

type ArtifactToolCallback = (input: ArtifactToolInput) => Promise<unknown>;

const root = await mkdtemp(join(tmpdir(), "devspace-project-side-effect-policy-test-"));
const outsideRoot = await mkdtemp(join(tmpdir(), "devspace-project-side-effect-outside-"));

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
    mkdir(join(developRoot, "src"), { recursive: true }),
    mkdir(legacyRoot, { recursive: true }),
    mkdir(agentDir, { recursive: true }),
  ]);

  const linkType = process.platform === "win32" ? "junction" : "dir";
  await symlink(outsideRoot, join(designRoot, "docs", "outside-link"), linkType);

  let ids = 0;
  const projectStore = new SqliteProjectStore(stateDir);
  const projects = new ProjectRegistry(projectStore, [allowedRoot], {
    createId: () => `prj_side_effect_policy_${++ids}`,
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

  const baseEnv = {
    DEVSPACE_CONFIG_DIR: join(root, "config"),
    DEVSPACE_ALLOWED_ROOTS: allowedRoot,
    DEVSPACE_WORKTREE_ROOT: join(root, "worktrees"),
    DEVSPACE_AGENT_DIR: agentDir,
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    DEVSPACE_WIDGETS: "off",
    PORT: "1",
  };
  const fullConfig = loadConfig({
    ...baseEnv,
    DEVSPACE_TOOL_MODE: "full",
  });
  const workspaceStore = new SqliteWorkspaceStore(stateDir);
  const handoffs = new SqliteWorkspaceHandoffStore(stateDir);
  const workspaces = new WorkspaceRegistry(fullConfig, workspaceStore, projects);
  const inspectWorkspace = (await workspaces.openWorkspace(inspectRoot)).workspace;
  const designWorkspace = (await workspaces.openWorkspace(designRoot)).workspace;
  const developWorkspace = (await workspaces.openWorkspace(developRoot)).workspace;
  const legacyWorkspace = (await workspaces.openWorkspace(legacyRoot)).workspace;

  await testArtifactAuthorization({
    config: fullConfig,
    workspaces,
    inspectWorkspaceId: inspectWorkspace.id,
    designWorkspaceId: designWorkspace.id,
    developWorkspaceId: developWorkspace.id,
    legacyWorkspaceId: legacyWorkspace.id,
    designRoot,
    developRoot,
    legacyRoot,
    outsideRoot,
  });

  await testBashAuthorization({
    config: fullConfig,
    projects,
    workspaces,
    handoffs,
    inspectWorkspaceId: inspectWorkspace.id,
    designWorkspaceId: designWorkspace.id,
    developWorkspaceId: developWorkspace.id,
    legacyWorkspaceId: legacyWorkspace.id,
    inspectRoot,
    designRoot,
  });

  await testExecAuthorization({
    config: loadConfig({
      ...baseEnv,
      DEVSPACE_TOOL_MODE: "codex",
    }),
    projects,
    workspaces,
    handoffs,
    inspectWorkspaceId: inspectWorkspace.id,
    designWorkspaceId: designWorkspace.id,
    developWorkspaceId: developWorkspace.id,
    legacyWorkspaceId: legacyWorkspace.id,
  });

  workspaceStore.close();
  handoffs.close();
  projectStore.close();
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(outsideRoot, { recursive: true, force: true });
}

async function testArtifactAuthorization(input: {
  config: ReturnType<typeof loadConfig>;
  workspaces: WorkspaceRegistry;
  inspectWorkspaceId: string;
  designWorkspaceId: string;
  developWorkspaceId: string;
  legacyWorkspaceId: string;
  designRoot: string;
  developRoot: string;
  legacyRoot: string;
  outsideRoot: string;
}): Promise<void> {
  let callback: ArtifactToolCallback | undefined;
  let canHandleCalls = 0;
  let openCalls = 0;
  const adapter: IncomingArtifactAdapter = {
    id: "policy-test",
    canHandle: () => {
      canHandleCalls += 1;
      return true;
    },
    async open() {
      openCalls += 1;
      return {
        name: "artifact.bin",
        size: 8,
        stream: Readable.from([Buffer.from("artifact")]),
      };
    },
  };
  const server = {
    registerTool(
      name: string,
      _descriptor: Record<string, unknown>,
      toolCallback: ArtifactToolCallback,
    ) {
      assert.equal(name, "download_artifact");
      callback = toolCallback;
      return {};
    },
  };

  registerArtifactTools(server as never, {
    config: input.config,
    workspaces: input.workspaces,
    incomingArtifactAdapters: [adapter],
  });
  assert.ok(callback);

  await expectPolicyDenied(
    callback({
      file: { native: true },
      workspaceId: input.inspectWorkspaceId,
      path: "docs/inspect.bin",
    }),
    "artifact_write",
    "Inspect Project",
    "inspect",
  );
  assert.equal(canHandleCalls, 0);
  assert.equal(openCalls, 0);

  await expectPolicyDenied(
    callback({
      file: { native: true },
      workspaceId: input.designWorkspaceId,
      path: "src/design.bin",
    }),
    "artifact_write",
    "Design Project",
    "design",
    true,
  );
  await expectPolicyDenied(
    callback({
      file: { native: true },
      workspaceId: input.designWorkspaceId,
      path: "docs/client-secret.bin",
    }),
    "artifact_write",
    "Design Project",
    "design",
    true,
  );
  await expectPolicyDenied(
    callback({
      file: { native: true },
      workspaceId: input.designWorkspaceId,
      path: "docs/outside-link/outside.bin",
    }),
    "artifact_write",
    "Design Project",
    "design",
    true,
  );
  assert.equal(canHandleCalls, 0);
  assert.equal(openCalls, 0);
  await assertMissing(join(input.designRoot, "src", "design.bin"));
  await assertMissing(join(input.designRoot, "docs", "client-secret.bin"));
  await assertMissing(join(input.outsideRoot, "outside.bin"));

  const designDestination = await input.workspaces.resolveAuthorizedMutationPath(
    input.workspaces.getWorkspace(input.designWorkspaceId),
    "artifact_write",
    "docs/allowed.bin",
  );
  assert.equal(designDestination.relativePath, "docs/allowed.bin");
  const developDestination = await input.workspaces.resolveAuthorizedMutationPath(
    input.workspaces.getWorkspace(input.developWorkspaceId),
    "artifact_write",
    "src/develop.bin",
  );
  assert.equal(developDestination.relativePath, "src/develop.bin");
  const legacyDestination = await input.workspaces.resolveAuthorizedMutationPath(
    input.workspaces.getWorkspace(input.legacyWorkspaceId),
    "artifact_write",
    "legacy.bin",
  );
  assert.equal(legacyDestination.relativePath, "legacy.bin");

  const allowedDownload = callback({
    file: { native: true },
    workspaceId: input.designWorkspaceId,
    path: "docs/allowed.bin",
  });
  if (isArtifactDownloadSupportedPlatform()) {
    await allowedDownload;
    assert.equal(canHandleCalls, 1);
    assert.equal(openCalls, 1);
    assert.equal(await readFile(join(input.designRoot, "docs", "allowed.bin"), "utf8"), "artifact");
  } else {
    await assert.rejects(
      allowedDownload,
      (error: unknown) =>
        error instanceof ArtifactError && error.code === "artifact_platform_unsupported",
    );
    assert.equal(canHandleCalls, 0);
    assert.equal(openCalls, 0);
    await assertMissing(join(input.designRoot, "docs", "allowed.bin"));
  }

  await assertMissing(join(input.developRoot, "src", "develop.bin"));
  await assertMissing(join(input.legacyRoot, "legacy.bin"));
}

async function testBashAuthorization(input: {
  config: ReturnType<typeof loadConfig>;
  projects: ProjectRegistry;
  workspaces: WorkspaceRegistry;
  handoffs: SqliteWorkspaceHandoffStore;
  inspectWorkspaceId: string;
  designWorkspaceId: string;
  developWorkspaceId: string;
  legacyWorkspaceId: string;
  inspectRoot: string;
  designRoot: string;
}): Promise<void> {
  let directStartCalls = 0;
  await expectPolicyDenied(
    runAuthorizedWorkspaceProcess(
      input.workspaces,
      input.workspaces.getWorkspace(input.inspectWorkspaceId),
      undefined,
      async () => {
        directStartCalls += 1;
      },
    ),
    "shell",
    "Inspect Project",
    "inspect",
  );
  await expectPolicyDenied(
    runAuthorizedWorkspaceProcess(
      input.workspaces,
      input.workspaces.getWorkspace(input.designWorkspaceId),
      "../outside",
      async () => {
        directStartCalls += 1;
      },
    ),
    "shell",
    "Design Project",
    "design",
  );
  assert.equal(directStartCalls, 0);

  const server = createMcpServer(
    input.config,
    input.projects,
    input.workspaces,
    input.handoffs,
    createReviewCheckpointManager(),
    new ProcessSessionManager(),
    [],
    [],
  );
  const client = new Client({ name: "devspace-bash-policy-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const markerCommand =
      `node -e "require('node:fs').writeFileSync('shell-started.txt','spawned')"`;

    const inspect = await call(client, "bash", {
      workspaceId: input.inspectWorkspaceId,
      command: markerCommand,
    });
    assertPolicyDeniedResult(inspect, "shell", "Inspect Project", "inspect", markerCommand);
    await assertMissing(join(input.inspectRoot, "shell-started.txt"));

    const design = await call(client, "bash", {
      workspaceId: input.designWorkspaceId,
      command: markerCommand,
    });
    assertPolicyDeniedResult(design, "shell", "Design Project", "design", markerCommand);
    await assertMissing(join(input.designRoot, "shell-started.txt"));

    const inspectEscape = await call(client, "bash", {
      workspaceId: input.inspectWorkspaceId,
      command: markerCommand,
      workingDirectory: "../outside",
    });
    assertPolicyDeniedResult(
      inspectEscape,
      "shell",
      "Inspect Project",
      "inspect",
      markerCommand,
    );

    const develop = await call(client, "bash", {
      workspaceId: input.developWorkspaceId,
      command: `node -e "console.log('develop-shell-ok')"`,
    });
    assertSuccessful(develop);
    assert.match(toolText(develop), /develop-shell-ok/);

    const legacy = await call(client, "bash", {
      workspaceId: input.legacyWorkspaceId,
      command: `node -e "console.log('legacy-shell-ok')"`,
    });
    assertSuccessful(legacy);
    assert.match(toolText(legacy), /legacy-shell-ok/);
  } finally {
    await client.close();
    await server.close();
  }
}

async function testExecAuthorization(input: {
  config: ReturnType<typeof loadConfig>;
  projects: ProjectRegistry;
  workspaces: WorkspaceRegistry;
  handoffs: SqliteWorkspaceHandoffStore;
  inspectWorkspaceId: string;
  designWorkspaceId: string;
  developWorkspaceId: string;
  legacyWorkspaceId: string;
}): Promise<void> {
  let startCalls = 0;
  const processSessions = {
    async start(_input: StartCommandInput): Promise<ProcessSnapshot> {
      startCalls += 1;
      return {
        output: "mock-process-started\n",
        outputTruncated: false,
        running: false,
        exitCode: 0,
        wallTimeMs: 1,
      };
    },
    async write(_input: WriteStdinInput): Promise<ProcessSnapshot> {
      throw new Error("write_stdin is not part of this test");
    },
  } as unknown as ProcessSessionManager;
  const server = createMcpServer(
    input.config,
    input.projects,
    input.workspaces,
    input.handoffs,
    createReviewCheckpointManager(),
    processSessions,
    [],
    [],
  );
  const client = new Client({ name: "devspace-exec-policy-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const secretCommand = "should-not-spawn --secret-value";

    const inspect = await call(client, "exec_command", {
      workspaceId: input.inspectWorkspaceId,
      cmd: secretCommand,
      workingDirectory: "../outside",
    });
    assertPolicyDeniedResult(inspect, "shell", "Inspect Project", "inspect", secretCommand);
    assert.equal(startCalls, 0);

    const design = await call(client, "exec_command", {
      workspaceId: input.designWorkspaceId,
      cmd: secretCommand,
    });
    assertPolicyDeniedResult(design, "shell", "Design Project", "design", secretCommand);
    assert.equal(startCalls, 0);

    const develop = await call(client, "exec_command", {
      workspaceId: input.developWorkspaceId,
      cmd: "mock-develop-command",
    });
    assertSuccessful(develop);
    assert.equal(startCalls, 1);

    const legacy = await call(client, "exec_command", {
      workspaceId: input.legacyWorkspaceId,
      cmd: "mock-legacy-command",
    });
    assertSuccessful(legacy);
    assert.equal(startCalls, 2);
  } finally {
    await client.close();
    await server.close();
  }
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

async function expectPolicyDenied(
  promise: Promise<unknown>,
  operation: "artifact_write" | "shell",
  projectName: string,
  preset: "inspect" | "design",
  pathDenied = false,
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof WorkspacePolicyDeniedError);
    assert.match(error.message, new RegExp(`Operation "${operation}"`));
    assert.match(error.message, new RegExp(projectName));
    assert.match(error.message, new RegExp(`preset "${preset}"`));
    assert.match(error.message, /dpkr helix dashboard/);
    if (pathDenied) assert.match(error.message, /allowed path scope/);
    assert.doesNotMatch(error.message, /client-secret|outside-link|src\/design/);
    return true;
  });
}

function assertPolicyDeniedResult(
  result: TextToolResult,
  operation: "shell",
  projectName: string,
  preset: "inspect" | "design",
  secretCommand: string,
): void {
  assert.equal(result.isError, true);
  const text = toolText(result);
  assert.match(text, new RegExp(`Operation "${operation}"`));
  assert.match(text, new RegExp(projectName));
  assert.match(text, new RegExp(`preset "${preset}"`));
  assert.match(text, /dpkr helix dashboard/);
  assert.doesNotMatch(text, new RegExp(escapeRegExp(secretCommand)));
  assert.doesNotMatch(text, /\.\.\/outside/);
}

function assertSuccessful(result: TextToolResult): void {
  assert.notEqual(result.isError, true, toolText(result));
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
