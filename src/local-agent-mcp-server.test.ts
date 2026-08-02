import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "./config.js";
import {
  LOCAL_AGENT_READ_TOOL_ANNOTATIONS,
  LOCAL_AGENT_RUN_TOOL_ANNOTATIONS,
} from "./local-agent-mcp.js";
import { LocalAgentService } from "./local-agent-service.js";
import type {
  CreateLocalAgentRecordInput,
  LocalAgentListScope,
  LocalAgentRecord,
} from "./local-agent-store.js";
import { ProcessSessionManager } from "./process-sessions.js";
import { OperationStore } from "./operations/operation-store.js";
import { ProjectRegistry } from "./projects/project-registry.js";
import { SqliteProjectStore } from "./projects/project-store.js";
import { createReviewCheckpointManager } from "./review-checkpoints.js";
import { createMcpServer } from "./server.js";
import { SqliteWorkspaceHandoffStore } from "./workspace-handoff-store.js";
import { SqliteWorkspaceStore } from "./workspace-store.js";
import { WorkspaceRegistry } from "./workspaces.js";

interface TextToolResult {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

class FakeStore {
  readonly records = new Map<string, LocalAgentRecord>();
  createCount = 0;
  getCount = 0;

  list(scope: LocalAgentListScope = {}): LocalAgentRecord[] {
    return Array.from(this.records.values()).filter((record) => {
      if (scope.workspaceId) return record.workspaceId === scope.workspaceId;
      if (scope.workspaceRoot) return record.workspaceRoot === scope.workspaceRoot;
      return true;
    });
  }

  get(id: string): LocalAgentRecord | undefined {
    this.getCount += 1;
    return this.records.get(id);
  }

  create(input: CreateLocalAgentRecordInput): LocalAgentRecord {
    this.createCount += 1;
    const record: LocalAgentRecord = {
      id: `agt_${this.createCount}`,
      ...input,
      status: "starting",
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
    };
    this.records.set(record.id, record);
    return record;
  }

  update(
    id: string,
    patch: Partial<Omit<LocalAgentRecord, "id" | "createdAt">>,
  ): LocalAgentRecord {
    const current = this.records.get(id);
    if (!current) throw new Error(`Unknown subagent id: ${id}`);
    const updated = {
      ...current,
      ...patch,
      updatedAt: "2026-07-29T00:01:00.000Z",
    };
    this.records.set(id, updated);
    return updated;
  }
}

const root = await mkdtemp(join(tmpdir(), "devspace-agent-mcp-server-test-"));
const execFileAsync = promisify(execFile);

try {
  const allowedRoot = join(root, "allowed");
  const developRoot = join(allowedRoot, "develop");
  const inspectRoot = join(allowedRoot, "inspect");
  const stateDir = join(root, "state");
  await mkdir(developRoot, { recursive: true });
  await mkdir(inspectRoot, { recursive: true });
  await execFileAsync("git", ["init"], { cwd: developRoot });
  await execFileAsync("git", ["config", "user.email", "devspace@example.com"], { cwd: developRoot });
  await execFileAsync("git", ["config", "user.name", "DevSpace Test"], { cwd: developRoot });
  await writeFile(join(developRoot, "README.md"), "baseline\n");
  await execFileAsync("git", ["add", "README.md"], { cwd: developRoot });
  await execFileAsync("git", ["commit", "-m", "Initial commit"], { cwd: developRoot });

  const config = loadConfig({
    DEVSPACE_CONFIG_DIR: join(root, "config"),
    DEVSPACE_ALLOWED_ROOTS: allowedRoot,
    DEVSPACE_STATE_DIR: stateDir,
    DEVSPACE_WORKTREE_ROOT: join(root, "worktrees"),
    DEVSPACE_AGENT_DIR: join(root, "agent"),
    DEVSPACE_SUBAGENTS: "1",
    DEVSPACE_TOOL_MODE: "codex",
    DEVSPACE_WIDGETS: "changes",
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    PORT: "1",
  });
  const projectStore = new SqliteProjectStore(stateDir);
  const projects = new ProjectRegistry(projectStore, config.allowedRoots);
  await projects.register({
    path: developRoot,
    name: "Develop Project",
    slug: "develop-project",
    permissionPreset: "develop",
  });
  await projects.register({
    path: inspectRoot,
    name: "Inspect Project",
    slug: "inspect-project",
    permissionPreset: "inspect",
  });
  const workspaceStore = new SqliteWorkspaceStore(stateDir);
  const handoffs = new SqliteWorkspaceHandoffStore(stateDir);
  const workspaces = new WorkspaceRegistry(config, workspaceStore, projects);
  const developWorkspace = (await workspaces.openWorkspace(developRoot)).workspace;
  const inspectWorkspace = (await workspaces.openWorkspace(inspectRoot)).workspace;
  const reviewCheckpoints = createReviewCheckpointManager();
  await reviewCheckpoints.initializeWorkspace({
    workspaceId: developWorkspace.id,
    root: developWorkspace.root,
  });
  const operationStore = new OperationStore(stateDir);
  const store = new FakeStore();
  const prompts: string[] = [];
  const spawns: Array<{ id: string; promptFile: string }> = [];
  const localAgents = new LocalAgentService({
    config,
    writeMode: "allowed",
    store,
    profileLoader: async () => [
      {
        name: "codex-implementer",
        description: "Focused implementer.",
        provider: "codex",
        filePath: "codex-implementer.md",
        body: "Implement carefully.",
        disabled: false,
      },
      {
        name: "unavailable-agent",
        description: "Unavailable provider.",
        provider: "claude",
        filePath: "unavailable-agent.md",
        body: "",
        disabled: false,
      },
    ],
    providerAvailabilityChecker: (provider) => {
      if (provider === "claude") throw new Error("Provider unavailable.");
    },
    providerRunner: async () => {
      throw new Error("Provider runner is not used in this server adapter test.");
    },
    promptFileWriter: (prompt) => {
      prompts.push(prompt);
      return `prompt-${prompts.length}.txt`;
    },
    promptFileReader: async () => "",
    promptFileCleanup: async () => {},
    workerSpawner: (id, promptFile) => {
      spawns.push({ id, promptFile });
    },
  });
  const server = createMcpServer(
    config,
    projects,
    workspaces,
    handoffs,
    reviewCheckpoints,
    new ProcessSessionManager(),
    [{ name: "codex", available: true }],
    [],
    localAgents,
    undefined,
    operationStore,
  );
  const client = new Client({ name: "devspace-agent-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    for (const name of ["delegate_task", "get_agent_status", "list_agents", "continue_agent", "exec_command", "show_changes"]) {
      assert.ok(tools.tools.some((tool) => tool.name === name), `${name} should be registered`);
    }
    assert.deepEqual(
      tools.tools.find((tool) => tool.name === "delegate_task")?.annotations,
      LOCAL_AGENT_RUN_TOOL_ANNOTATIONS,
    );
    assert.deepEqual(
      tools.tools.find((tool) => tool.name === "get_agent_status")?.annotations,
      LOCAL_AGENT_READ_TOOL_ANNOTATIONS,
    );

    const delegated = asTextToolResult(await client.callTool({
      name: "delegate_task",
      arguments: {
        workspaceId: developWorkspace.id,
        goal: "Implement the change.",
        acceptanceCriteria: ["The service is shared."],
        relevantFiles: ["src/local-agent-service.ts"],
        verification: ["npm test"],
      },
    }));
    assert.equal(delegated.isError, undefined);
    assert.match(delegated.content[0]?.text ?? "", /Started local agent agt_1/);
    assert.equal(
      (delegated.structuredContent?.agent as { profileName?: string } | undefined)?.profileName,
      "codex-implementer",
    );
    assert.deepEqual(spawns, [{ id: "agt_1", promptFile: "prompt-1.txt" }]);
    assert.match(prompts[0] ?? "", /Goal:\nImplement the change\./);
    assert.match(prompts[0] ?? "", /Acceptance criteria:\n- The service is shared\./);

    const getsBeforeDeniedVerification = store.getCount;
    const deniedVerification = asTextToolResult(await client.callTool({
      name: "exec_command",
      arguments: {
        workspaceId: inspectWorkspace.id,
        cmd: "node --version",
        verification: { agentId: "agt_1", type: "tests" },
      },
    }));
    assert.equal(deniedVerification.isError, true);
    assert.equal(store.getCount, getsBeforeDeniedVerification);

    const mutationsBeforeInvalid = store.createCount;
    const unsafeEnvelope = asTextToolResult(await client.callTool({
      name: "delegate_task",
      arguments: {
        workspaceId: developWorkspace.id,
        goal: "Must not start.",
        context: "dashboardToken=super-secret-value",
        acceptanceCriteria: ["No mutation."],
      },
    }));
    assert.equal(unsafeEnvelope.isError, true);
    assert.equal(JSON.stringify(unsafeEnvelope).includes("super-secret-value"), false);
    assert.equal(store.createCount, mutationsBeforeInvalid);
    assert.equal(prompts.length, 1);

    const unsafeModel = asTextToolResult(await client.callTool({
      name: "delegate_task",
      arguments: {
        workspaceId: developWorkspace.id,
        goal: "Must not start.",
        acceptanceCriteria: ["No mutation."],
        model: "dashboardToken=super-secret-value",
      },
    }));
    assert.equal(unsafeModel.isError, true);
    assert.equal(JSON.stringify(unsafeModel).includes("super-secret-value"), false);
    assert.equal(store.createCount, mutationsBeforeInvalid);
    assert.equal(prompts.length, 1);

    const crossWorkspaceId = asTextToolResult(await client.callTool({
      name: "delegate_task",
      arguments: {
        workspaceId: inspectWorkspace.id,
        target: "agt_1",
        goal: "Must not resume another workspace.",
        acceptanceCriteria: ["No mutation."],
      },
    }));
    assert.equal(crossWorkspaceId.isError, true);
    assert.equal(store.createCount, mutationsBeforeInvalid);
    assert.equal(spawns.length, 1);

    const invalidTarget = asTextToolResult(await client.callTool({
      name: "delegate_task",
      arguments: {
        workspaceId: developWorkspace.id,
        target: "missing-profile",
        goal: "Must not start.",
        acceptanceCriteria: ["No mutation."],
      },
    }));
    assert.equal(invalidTarget.isError, true);
    assert.equal(store.createCount, mutationsBeforeInvalid);

    const unavailable = asTextToolResult(await client.callTool({
      name: "delegate_task",
      arguments: {
        workspaceId: developWorkspace.id,
        target: "unavailable-agent",
        goal: "Must not start.",
        acceptanceCriteria: ["No mutation."],
      },
    }));
    assert.equal(unavailable.isError, true);
    assert.equal(store.createCount, mutationsBeforeInvalid);

    const denied = asTextToolResult(await client.callTool({
      name: "delegate_task",
      arguments: {
        workspaceId: inspectWorkspace.id,
        goal: "Must not start.",
        acceptanceCriteria: ["No mutation."],
      },
    }));
    assert.equal(denied.isError, true);
    assert.equal(store.createCount, mutationsBeforeInvalid);

    store.update("agt_1", {
      status: "idle",
      providerSessionId: "thread_1",
      latestResponse: "Initial result.",
    });
    const status = asTextToolResult(await client.callTool({
      name: "get_agent_status",
      arguments: { id: "agt_1" },
    }));
    assert.equal(status.isError, undefined);
    assert.match(status.content[0]?.text ?? "", /verification pending/);
    assert.equal(JSON.stringify(status.structuredContent).includes("thread_1"), false);

    const listed = asTextToolResult(await client.callTool({
      name: "list_agents",
      arguments: { workspaceId: developWorkspace.id },
    }));
    assert.equal(listed.isError, undefined);
    assert.equal((listed.structuredContent?.summary as { total?: number } | undefined)?.total, 1);
    assert.equal(JSON.stringify(listed.structuredContent).includes("Initial result."), false);

    store.records.set("agt_wrong_root", {
      ...store.get("agt_1")!,
      id: "agt_wrong_root",
      workspaceRoot: inspectRoot,
    });
    await writeFile(join(developRoot, "README.md"), "baseline\nchanged\n");
    const wrongRootReview = asTextToolResult(await client.callTool({
      name: "show_changes",
      arguments: { workspaceId: developWorkspace.id, agentId: "agt_wrong_root" },
    }));
    assert.equal(wrongRootReview.isError, true);
    const review = asTextToolResult(await client.callTool({
      name: "show_changes",
      arguments: { workspaceId: developWorkspace.id, agentId: "agt_1" },
    }));
    assert.equal(review.isError, undefined);
    assert.match(review.content[0]?.text ?? "", /Changed 1 file/);
    assert.match(review.content[1]?.text ?? "", /^Review bundle: /);
    const reviewBundle = review.structuredContent?.reviewBundle as {
      currentFingerprint?: string;
      verification?: { items?: Array<{ freshness?: string }> };
    } | undefined;
    assert.equal(typeof reviewBundle?.currentFingerprint, "string");
    assert.equal(reviewBundle?.verification?.items?.every(({ freshness }) => freshness === "missing"), true);

    store.update("agt_1", { disposition: "needs_input", question: "Which supported target should be changed?", latestResponse: "Inspected both targets." });
    const question = asTextToolResult(await client.callTool({ name: "get_agent_status", arguments: { id: "agt_1" } }));
    assert.match(question.content[0]?.text ?? "", /Input required: Which supported target/);
    assert.doesNotMatch(question.content[0]?.text ?? "", /verification pending/i);
    assert.equal((question.structuredContent?.agent as { disposition?: string }).disposition, "needs_input");

    const continued = asTextToolResult(await client.callTool({
      name: "continue_agent",
      arguments: { id: "agt_1", prompt: "Continue with focused tests." },
    }));
    assert.equal(continued.isError, undefined);
    assert.match(continued.content[0]?.text ?? "", /Continued local agent agt_1/);
    assert.equal(store.get("agt_1")?.providerSessionId, "thread_1");
    assert.equal(store.get("agt_1")?.question, undefined);
    assert.equal(prompts.at(-1), "Continue with focused tests.");
  } finally {
    await client.close();
    await server.close();
    localAgents.close();
    operationStore.close();
  }

  const disabledConfig = loadConfig({
    DEVSPACE_CONFIG_DIR: join(root, "disabled-config"),
    DEVSPACE_ALLOWED_ROOTS: allowedRoot,
    DEVSPACE_STATE_DIR: join(root, "disabled-state"),
    DEVSPACE_SUBAGENTS: "0",
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    PORT: "1",
  });
  const disabledProjectStore = new SqliteProjectStore(disabledConfig.stateDir);
  const disabledWorkspaceStore = new SqliteWorkspaceStore(disabledConfig.stateDir);
  const disabledHandoffs = new SqliteWorkspaceHandoffStore(disabledConfig.stateDir);
  const disabledServer = createMcpServer(
    disabledConfig,
    new ProjectRegistry(disabledProjectStore, disabledConfig.allowedRoots),
    new WorkspaceRegistry(
      disabledConfig,
      disabledWorkspaceStore,
      new ProjectRegistry(disabledProjectStore, disabledConfig.allowedRoots),
    ),
    disabledHandoffs,
    createReviewCheckpointManager(),
    new ProcessSessionManager(),
    [],
    [],
  );
  const disabledClient = new Client({ name: "devspace-disabled-agent-test", version: "0.0.0" });
  const [disabledClientTransport, disabledServerTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([
      disabledServer.connect(disabledServerTransport),
      disabledClient.connect(disabledClientTransport),
    ]);
    const names = (await disabledClient.listTools()).tools.map((tool) => tool.name);
    for (const name of ["delegate_task", "get_agent_status", "list_agents", "continue_agent"]) {
      assert.equal(names.includes(name), false, `${name} must be absent when subagents are disabled`);
    }
  } finally {
    await disabledClient.close();
    await disabledServer.close();
    disabledHandoffs.close();
    disabledWorkspaceStore.close();
    disabledProjectStore.close();
  }

  handoffs.close();
  workspaceStore.close();
  projectStore.close();
} finally {
  await rm(root, { recursive: true, force: true });
}

function asTextToolResult(result: unknown): TextToolResult {
  assert.equal(typeof result, "object");
  assert.ok(result);
  const record = result as Record<string, unknown>;
  assert.ok(Array.isArray(record.content));
  return record as unknown as TextToolResult;
}
