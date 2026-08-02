import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { access, realpath } from "node:fs/promises";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { checkResourceAllowed, resourceUrlFromServerUrl } from "@modelcontextprotocol/sdk/shared/auth-utils.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import express from "express";
import type { Request, Response } from "express";
import * as z from "zod/v4";
import { applyPatch } from "./apply-patch.js";
import {
  isArtifactDownloadSupportedPlatform,
  registerArtifactTools,
} from "./artifact-tools.js";
import { loadConfig, type ServerConfig, type WidgetMode } from "./config.js";
import {
  createOpenAIIncomingArtifactAdapter,
  type IncomingArtifactAdapter,
} from "./incoming-artifacts.js";
import {
  logEvent,
  requestIp,
  requestPath,
  commandPreview,
  sessionIdPrefix,
} from "./logger.js";
import {
  editFileTool,
  findFilesTool,
  grepFilesTool,
  listDirectoryTool,
  readFileTool,
  runShellTool,
  writeFileTool,
} from "./pi-tools.js";
import { SingleUserOAuthProvider } from "./oauth-provider.js";
import {
  McpSessionRegistry,
  type McpSessionCloseResult,
} from "./mcp-sessions.js";
import {
  ProcessSessionManager,
  type ProcessSnapshot,
  type ProcessVerificationTarget,
} from "./process-sessions.js";
import {
  attachMcpToolResultProjection,
  installMcpToolOperationProjection,
  mcpSessionIdFromSourceRunId,
  McpToolOperationProjector,
} from "./operations/mcp-tool-operation-projector.js";
import {
  ProcessSessionOperationProjector,
  resolveProcessSessionCapabilities,
} from "./operations/process-session-projector.js";
import { LocalAgentOperationProjector } from "./operations/local-agent-operation-projector.js";
import { OperationEventBus } from "./operations/operation-event-bus.js";
import { OperationRunService } from "./operations/operation-run-service.js";
import { requestOperationStop } from "./operations/operation-stop.js";
import { OperationStore } from "./operations/operation-store.js";
import { OperationVerificationProjector } from "./operations/verification-projector.js";
import { readCurrentRepositoryFingerprint } from "./operations/repository-diff.js";
import { createReviewCheckpointManager } from "./review-checkpoints.js";
import { registerReviewTool } from "./review-tool.js";
import { repositoryContextOutputSchema } from "./repository-context-output.js";
import { shutdownHttpServer } from "./server-shutdown.js";
import { formatPathForPrompt } from "./skills.js";
import { isSameCanonicalPath } from "./roots.js";
import {
  ProjectRegistry,
  ProjectSelectorError,
} from "./projects/project-registry.js";
import { authorizeWorkspacePolicyOperation } from "./projects/project-policy.js";
import {
  createProjectErrorOutput,
  createProjectListOutput,
  formatProjectOpenResult,
  PROJECT_LIST_TOOL_ANNOTATIONS,
  PROJECT_OPEN_TOOL_ANNOTATIONS,
  PROJECT_OPEN_TOOL_VISIBILITY,
  projectViewOutputSchema,
  workspaceProjectOutputSchema,
} from "./projects/project-mcp.js";
import { createProjectStore } from "./projects/project-store.js";
import { createWorkspaceStore } from "./workspace-store.js";
import {
  createWorkspaceHandoffStore,
  DEVSPACE_SESSION_CONTINUITY_INSTRUCTION,
  formatWorkspaceHandoffForPrompt,
  WORKSPACE_HANDOFF_STATUSES,
  type WorkspaceHandoffStore,
} from "./workspace-handoff-store.js";
import {
  formatAgentsPath,
  WorkspaceRegistry,
  type Workspace,
  type WorkspaceContext,
} from "./workspaces.js";
import {
  isLocalAgentProvider,
  summarizeLocalAgentProfile,
} from "./local-agent-profiles.js";
import {
  formatLocalAgentProviderAvailabilitySummary,
  getLocalAgentProviderAvailabilitySnapshot,
  type LocalAgentProviderAvailability,
} from "./local-agent-availability.js";
import { renderLocalAgentTaskEnvelope } from "./local-agent-handoff.js";
import {
  createLocalAgentActionOutput,
  createLocalAgentCardSummary,
  createLocalAgentListOutput,
  createLocalAgentStatusOutput,
  LOCAL_AGENT_READ_TOOL_ANNOTATIONS,
  LOCAL_AGENT_RUN_TOOL_ANNOTATIONS,
  localAgentViewOutputSchema,
} from "./local-agent-mcp.js";
import {
  createDetachedLocalAgentWorkerSpawner,
  isLocalAgentActive,
  LocalAgentService,
} from "./local-agent-service.js";
import {
  createWindowsSystemUpdateController,
  type SystemUpdateController,
} from "./system-update.js";
import { registerSystemUpdateTools } from "./system-update-mcp.js";

type Transport = StreamableHTTPServerTransport;
// MCP clients can reconnect without closing the previous transport. Bound stale
// session retention so abandoned MCP servers do not accumulate for the life of the process.
const MCP_SESSION_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1_000;
const MCP_SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1_000;
// Some MCP hosts initialize a fresh transport for each tool call and never send
// DELETE. Each transport owns a full MCP server, so retain ample concurrency but
// bound abandoned transports before they can exhaust the runtime heap.
const MCP_SESSION_MAX_RETAINED = 64;
const WORKSPACE_APP_URI = "ui://devspace/workspace-app.html";
const WORKSPACE_APP_MANIFEST_ENTRY = "workspace-app.html";
const WRITE_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};
const EDIT_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};
const SHELL_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

export interface RunningServer {
  app: ReturnType<typeof createMcpExpressApp>;
  config: ServerConfig;
  localAgentProviders: LocalAgentProviderAvailability[];
  operations: {
    store: OperationStore;
    eventBus: OperationEventBus;
    requestStop: (runId: string) => ReturnType<typeof requestOperationStop>;
    resolveWorkspaceRoot: (workspaceId: string) => string | undefined;
  };
  close(): Promise<void>;
}

type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

interface WorkspaceAppManifestEntry {
  file: string;
  css?: string[];
  isEntry?: boolean;
}

type WorkspaceAppManifest = Record<string, WorkspaceAppManifestEntry>;

interface DiffStats {
  additions: number;
  removals: number;
}

type ToolWidgetKind =
  | "projects"
  | "agents"
  | "workspace"
  | "read"
  | "write"
  | "edit"
  | "search"
  | "directory"
  | "shell"
  | "show_changes";

interface ToolDefinitionMeta extends Record<string, unknown> {
  ui: {
    resourceUri: string;
    visibility: Array<"model" | "app">;
  };
}

type EmptyToolDefinitionMeta = Record<string, unknown> & {
  "ui/resourceUri"?: string;
};

interface ToolWidgetDescriptorMeta {
  _meta: ToolDefinitionMeta | EmptyToolDefinitionMeta;
}

function shouldAttachWidget(mode: WidgetMode, kind: ToolWidgetKind): boolean {
  switch (mode) {
    case "off":
      return false;
    case "changes":
      return kind === "workspace" || kind === "show_changes";
    case "full":
      return true;
  }
}

function toolWidgetDescriptorMeta(
  config: ServerConfig,
  kind: ToolWidgetKind,
  visibility: readonly ("model" | "app")[] = ["model"],
): ToolWidgetDescriptorMeta {
  if (!shouldAttachWidget(config.widgets, kind)) return { _meta: {} };

  return {
    _meta: {
      ui: {
        resourceUri: WORKSPACE_APP_URI,
        visibility: [...visibility],
      },
    },
  };
}

const toolNames = {
  listProjects: "list_projects",
  openProject: "open_project",
  delegateTask: "delegate_task",
  getAgentStatus: "get_agent_status",
  listAgents: "list_agents",
  continueAgent: "continue_agent",
  openWorkspace: "open_workspace",
  read: "read",
  write: "write",
  edit: "edit",
  grep: "grep",
  glob: "glob",
  ls: "ls",
  shell: "bash",
} as const;

interface ToolLogFields {
  tool: string;
  workspaceId?: string;
  path?: string;
  workingDirectory?: string;
  command?: string;
  commandLength?: number;
  success: boolean;
  durationMs: number;
  error?: string;
}

function serverInstructions(config: ServerConfig): string {
  const continuityInstruction = ` ${DEVSPACE_SESSION_CONTINUITY_INSTRUCTION}`;
  const localAgentInstruction = config.subagents
    ? ` When the user explicitly asks to delegate a focused implementation task, use ${toolNames.delegateTask} with a structured goal and acceptance criteria. Use ${toolNames.getAgentStatus} or ${toolNames.listAgents} to inspect result availability and ${toolNames.continueAgent} only for an explicit continuation. Treat agent final text as result available with verification pending until repository changes and required checks are independently inspected.`
    : "";
  const artifactInstruction = config.artifactsEnabled && isArtifactDownloadSupportedPlatform()
    ? " When the user supplies or generates a file that is not present on the dpkr helix host, use download_artifact with its native file value, the existing workspace ID, and a suitable relative destination path chosen from the user's request and project structure. The tool refuses to overwrite an existing destination and returns the normalized workspace-relative path. Use normal workspace tools when explicit inspection, replacement, movement, renaming, or deletion is needed. Do not recreate binary files with write/edit calls or place signed URLs, native file objects, base64 content, or invented host paths in shell commands or logs."
    : "";
  const showChangesInstruction =
    config.widgets === "changes"
      ? " If the turn successfully modifies files by creating, editing, overwriting, deleting, moving, or applying patches, call show_changes exactly once for that workspace after the final related file change and before your final response so the user can inspect the aggregate diff for that turn. Do not call it after every individual file change; do not skip it because individual file-change tools already returned diffs."
      : "";

  if (config.toolMode === "codex") {
    return `Use dpkr helix as a local coding workspace. For registered projects, call ${toolNames.listProjects} to discover stable IDs/slugs, then call ${toolNames.openProject}; reuse its workspaceId. For unregistered legacy folders, call ${toolNames.openWorkspace} once with the path and reuse its workspaceId. Use ${toolNames.read} for direct file reads, apply_patch for all file modifications, exec_command for inspection, tests, builds, and other commands, and write_stdin to poll or interact with running processes. Follow instructions returned by ${toolNames.openProject} or ${toolNames.openWorkspace}; read applicable instruction and skill files before working in their scope.${continuityInstruction}${localAgentInstruction}${artifactInstruction}${showChangesInstruction}`;
  }

  const inspection = config.toolMode !== "full"
    ? `In minimal tool mode, ${toolNames.grep}, ${toolNames.glob}, and ${toolNames.ls} are disabled; use ${toolNames.shell} with command-line tools such as grep, rg, find, ls, and tree for search and directory inspection. `
    : `Prefer ${toolNames.read}, ${toolNames.grep}, ${toolNames.glob}, and ${toolNames.ls} for file inspection. `;

  const skills = config.skillsEnabled
    ? `When ${toolNames.openWorkspace} returns available skills and a task matches a skill, use ${toolNames.read} to read that skill's path before proceeding. Skill paths may be outside the workspace, but ${toolNames.read} only permits advertised SKILL.md files and files under already-loaded skill directories. `
    : "";

  const agentsMd = `Follow instructions returned by ${toolNames.openWorkspace}. Before working under a path listed in availableAgentsFiles, use ${toolNames.read} to inspect that instruction file and follow it. `;

  return `Use dpkr helix as a local coding workspace. For registered projects, prefer ${toolNames.listProjects} to discover stable IDs/slugs, then call ${toolNames.openProject} once to obtain a workspaceId. For unregistered legacy folders, call ${toolNames.openWorkspace} once with the path. Reuse that same workspaceId for all later file, search, edit, write, show-changes, and shell tools in that folder; do not reopen unless switching folders/worktrees, changing checkout/worktree mode, the workspaceId is rejected as unknown, or the user explicitly asks to reopen. ${agentsMd}${skills}${inspection}Prefer ${toolNames.edit} for targeted modifications, ${toolNames.write} only for new files or complete rewrites, and ${toolNames.shell} for tests, builds, git inspection, package scripts, and commands that are better executed by the shell. Do not create or modify files with ${toolNames.shell}; avoid shell redirection, heredocs, tee, sed -i, perl -i, node/python/ruby scripts, or any command whose purpose is to write project files.${continuityInstruction}${localAgentInstruction}${artifactInstruction}${showChangesInstruction}`;
}

function formatVisibleAgent(agent: {
  name: string;
  provider: string;
  model?: string;
  thinking?: string;
  providerAvailable?: boolean;
  providerUnavailableReason?: string;
}): string {
  const model = agent.model ? `, model ${agent.model}` : "";
  const thinking = agent.thinking ? `, thinking ${agent.thinking}` : "";
  const availability = agent.providerAvailable === false
    ? `, unavailable: ${agent.providerUnavailableReason ?? "provider unavailable"}`
    : "";
  return `${agent.name} (${agent.provider}${model}${thinking}${availability})`;
}

function formatUnavailableAgentProvider(provider: LocalAgentProviderAvailability): string {
  return `${provider.name} (${provider.reason ?? "unavailable"})`;
}

function resultOutputSchema(extra: z.ZodRawShape = {}): z.ZodRawShape {
  return {
    result: z
      .string()
      .describe(
        "Model-readable result text for follow-up reasoning and plain MCP hosts.",
      ),
    ...extra,
  };
}

const localAgentTextInputSchema = z.string().trim().min(1).max(8_000);
const localAgentListItemInputSchema = z.string().trim().min(1).max(2_000);
const localAgentListInputSchema = z.array(localAgentListItemInputSchema).max(100);
const localAgentTargetInputSchema = z.string().trim().min(1).max(200);

const workspaceSkillOutputSchema = z.object({
  name: z.string(),
  description: z.string(),
  path: z.string(),
});

const workspaceAgentsFileOutputSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const workspaceLocalAgentOutputSchema = z.object({
  name: z.string(),
  description: z.string(),
  provider: z.string(),
  model: z.string().optional(),
  thinking: z.string().optional(),
  providerAvailable: z.boolean().optional(),
  providerUnavailableReason: z.string().optional(),
});

const workspaceLocalAgentProviderOutputSchema = z.object({
  name: z.string(),
  available: z.boolean(),
  reason: z.string().optional(),
});

const workspaceAvailableAgentsFileOutputSchema = z.object({
  path: z.string(),
});

const workspaceHandoffOutputSchema = z.object({
  root: z.string(),
  status: z.enum(WORKSPACE_HANDOFF_STATUSES),
  summary: z.string(),
  completed: z.array(z.string()),
  nextActions: z.array(z.string()),
  verification: z.array(z.string()),
  risks: z.array(z.string()),
  activeAgents: z.array(z.string()),
  updatedAt: z.string(),
});

const workspaceOutputSchema = {
  result: z
    .string()
    .describe(
      "Model-readable result text for follow-up reasoning and plain MCP hosts.",
    ),
  workspaceId: z.string(),
  root: z.string(),
  mode: z.enum(["checkout", "worktree"]),
  sourceRoot: z.string().optional(),
  worktree: z
    .object({
      sourceRoot: z.string().optional(),
      path: z.string(),
      baseRef: z.string(),
      baseSha: z.string(),
      dirtySource: z.boolean(),
      detached: z.boolean(),
      managed: z.boolean(),
    })
    .optional(),
  project: workspaceProjectOutputSchema.optional(),
  agentsFiles: z.array(workspaceAgentsFileOutputSchema),
  availableAgentsFiles: z.array(workspaceAvailableAgentsFileOutputSchema),
  skills: z.array(workspaceSkillOutputSchema),
  agentProviders: z.array(workspaceLocalAgentProviderOutputSchema),
  agents: z.array(workspaceLocalAgentOutputSchema),
  skillDiagnostics: z.array(z.unknown()),
  handoff: workspaceHandoffOutputSchema.optional(),
  repositoryContext: repositoryContextOutputSchema,
  instruction: z.string(),
};

const projectOpenOutputSchema = {
  ...resultOutputSchema(),
  workspaceId: z.string().optional(),
  root: z.string().optional(),
  mode: z.enum(["checkout", "worktree"]).optional(),
  sourceRoot: z.string().optional(),
  worktree: workspaceOutputSchema.worktree,
  project: workspaceProjectOutputSchema.optional(),
  agentsFiles: z.array(workspaceAgentsFileOutputSchema).optional(),
  availableAgentsFiles: z.array(workspaceAvailableAgentsFileOutputSchema).optional(),
  skills: z.array(workspaceSkillOutputSchema).optional(),
  agentProviders: z.array(workspaceLocalAgentProviderOutputSchema).optional(),
  agents: z.array(workspaceLocalAgentOutputSchema).optional(),
  skillDiagnostics: z.array(z.unknown()).optional(),
  handoff: workspaceHandoffOutputSchema.optional(),
  repositoryContext: repositoryContextOutputSchema.optional(),
  instruction: z.string().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      candidates: z
        .array(z.object({
          id: z.string(),
          slug: z.string(),
          name: z.string(),
          root: z.string(),
        }))
        .optional(),
    })
    .optional(),
};

const handoffListItemSchema = z.string().trim().min(1).max(1000);

const reviewFileOutputSchema = z.object({
  path: z.string(),
  previousPath: z.string().optional(),
  type: z.enum(["change", "rename-pure", "rename-changed", "new", "deleted"]),
  additions: z.number(),
  removals: z.number(),
});

const reviewSummaryOutputSchema = z.object({
  files: z.number(),
  additions: z.number(),
  removals: z.number(),
});

function sendJsonRpcError(
  res: Response,
  status: number,
  code: number,
  message: string,
): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

function requestLogFields(req: Request, config: ServerConfig): Record<string, unknown> {
  return {
    ip: requestIp(req, config.logging.trustProxy),
    host: req.header("host"),
    userAgent: req.header("user-agent"),
    origin: req.header("origin"),
    referer: req.header("referer"),
    contentLength: req.header("content-length"),
  };
}

function logToolCall(config: ServerConfig, fields: ToolLogFields): void {
  if (!config.logging.toolCalls) return;

  const { command, ...safeFields } = fields;
  logEvent(config.logging, fields.success ? "info" : "warn", "tool_call", {
    ...safeFields,
    commandPreview: config.logging.shellCommands && command ? commandPreview(command) : undefined,
  });
}

export async function runAuthorizedWorkspaceProcess<T>(
  workspaces: WorkspaceRegistry,
  workspace: Workspace,
  workingDirectory: string | undefined,
  start: (cwd: string) => Promise<T>,
): Promise<T> {
  authorizeWorkspacePolicyOperation({
    source: workspace.policySource,
    operation: "shell",
  });
  const cwd = workspaces.resolveWorkingDirectory(workspace, workingDirectory);
  return start(cwd);
}

function contentText(content: ToolContent[]): string {
  return content
    .filter(
      (item): item is { type: "text"; text: string } => item.type === "text",
    )
    .map((item) => item.text)
    .join("\n");
}

function toolErrorPreview(content: ToolContent[]): string | undefined {
  const text = contentText(content).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function logFailedToolResponse(
  config: ServerConfig,
  fields: Omit<ToolLogFields, "success" | "durationMs" | "error">,
  content: ToolContent[],
  startedAt: number,
): void {
  logToolCall(config, {
    ...fields,
    success: false,
    durationMs: Math.round(performance.now() - startedAt),
    error: toolErrorPreview(content),
  });
}

function textBlock(text: string): ToolContent {
  return { type: "text", text };
}

function textSummary(content: ToolContent[]): {
  lines: number;
  characters: number;
} {
  const text = contentText(content);
  return {
    lines: text.length === 0 ? 0 : text.split("\n").length,
    characters: text.length,
  };
}

function contentLineCount(content: string): number {
  if (content.length === 0) return 0;
  return content.endsWith("\n")
    ? content.slice(0, -1).split("\n").length
    : content.split("\n").length;
}

function countDiffStats(diff: string | undefined): DiffStats {
  if (!diff) return { additions: 0, removals: 0 };

  let additions = 0;
  let removals = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    if (line.startsWith("-") && !line.startsWith("---")) removals++;
  }

  return { additions, removals };
}

function newFilePatch(path: string, content: string): string {
  const lines =
    content.length === 0
      ? []
      : content.endsWith("\n")
        ? content.slice(0, -1).split("\n")
        : content.split("\n");
  const hunkLength = lines.length;
  const hunkRange = hunkLength === 0 ? "+0,0" : `+1,${hunkLength}`;
  const body = lines.map((line) => `+${line}`).join("\n");

  return [
    `diff --git a/${path} b/${path}`,
    "new file mode 100644",
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${path}`,
    `@@ -0,0 ${hunkRange} @@`,
    body,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function assetBaseUrl(config: ServerConfig): string {
  return `${config.publicBaseUrl.replace(/\/+$/, "")}/mcp-app-assets`;
}

function uiManifestUrl(): URL {
  return new URL("../dist/ui/.vite/manifest.json", import.meta.url);
}

function readWorkspaceAppManifest(): WorkspaceAppManifest {
  return JSON.parse(readFileSync(uiManifestUrl(), "utf8")) as WorkspaceAppManifest;
}

function getWorkspaceAppManifestEntry(): WorkspaceAppManifestEntry {
  const manifest = readWorkspaceAppManifest();
  const entry = manifest[WORKSPACE_APP_MANIFEST_ENTRY]
    ?? manifest["src/ui/workspace-app.html"]
    ?? manifest["workspace-app"];

  if (!entry?.file) {
    throw new Error(`Missing ${WORKSPACE_APP_MANIFEST_ENTRY} in UI manifest.`);
  }

  return entry;
}

function assetUrl(baseUrl: string, assetPath: string): string {
  return `${baseUrl}/${assetPath.replace(/^\/+/, "")}`;
}

function workspaceAppHtml(config: ServerConfig): string {
  const baseUrl = assetBaseUrl(config);
  const entry = getWorkspaceAppManifestEntry();
  const stylesheets = (entry.css ?? [])
    .map(
      (stylesheet) =>
        `    <link rel="stylesheet" crossorigin href="${assetUrl(baseUrl, stylesheet)}" />`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>dpkr helix Workspace</title>
    <script type="module" crossorigin src="${assetUrl(baseUrl, entry.file)}"></script>
${stylesheets}
  </head>
  <body>
    <main id="app" class="shell">
      <section class="empty">Waiting for a tool result.</section>
    </main>
  </body>
</html>`;
}

function appCsp(config: ServerConfig): {
  resourceDomains: string[];
  connectDomains: string[];
} {
  const publicBaseUrl = config.publicBaseUrl.replace(/\/+$/, "");
  return {
    resourceDomains: [publicBaseUrl],
    connectDomains: [publicBaseUrl],
  };
}

function uiBuildDirectory(): string {
  return fileURLToPath(new URL("../dist/ui", import.meta.url));
}

function isPublicMcpAppAssetPath(path: string): boolean {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    return false;
  }

  const normalizedPath = posix
    .normalize(`/${decodedPath.replaceAll("\\", "/")}`)
    .replace(/\/+/g, "/");
  return (
    normalizedPath === "/workspace-app.html"
    || normalizedPath.startsWith("/assets/")
  );
}

function setAssetHeaders(res: Response): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}

async function assertWorkspaceAppAssets(): Promise<void> {
  const entry = getWorkspaceAppManifestEntry();
  const candidates = [entry.file, ...(entry.css ?? [])].map(
    (assetPath) => new URL(`../dist/ui/${assetPath}`, import.meta.url),
  );

  for (const candidate of candidates) {
    await access(candidate);
  }
}

function processResult(snapshot: ProcessSnapshot): string {
  const status = snapshot.running
    ? `Process running with session ID ${snapshot.sessionId}.`
    : snapshot.signal
      ? `Process exited after signal ${snapshot.signal}.`
      : `Process exited with code ${snapshot.exitCode ?? "unknown"}.`;
  return snapshot.output ? `${snapshot.output.replace(/\n$/, "")}\n${status}` : status;
}

function processOutputSchema(): z.ZodRawShape {
  return resultOutputSchema({
    sessionId: z.number().optional(),
    running: z.boolean(),
    exitCode: z.number().int().optional(),
    signal: z.string().optional(),
    wallTimeMs: z.number().nonnegative(),
    outputTruncated: z.boolean(),
  });
}

function processToolResponse(
  tool: "exec_command" | "write_stdin",
  workspaceId: string,
  snapshot: ProcessSnapshot,
  summary: Record<string, unknown>,
) {
  const result = processResult(snapshot);
  const content = [textBlock(result)];
  const outputSummary = textSummary(snapshot.output ? [textBlock(snapshot.output)] : []);
  return {
    content,
    _meta: {
      tool,
      card: {
        workspaceId,
        summary: { ...summary, ...outputSummary },
        payload: { content },
      },
    },
    structuredContent: {
      result,
      sessionId: snapshot.sessionId,
      running: snapshot.running,
      exitCode: snapshot.exitCode,
      signal: snapshot.signal,
      wallTimeMs: snapshot.wallTimeMs,
      outputTruncated: snapshot.outputTruncated,
    },
  };
}

function createWorkspaceToolResult(input: {
  tool: "open_workspace" | "open_project";
  config: ServerConfig;
  context: WorkspaceContext;
  handoffs: WorkspaceHandoffStore;
  localAgentProviders: LocalAgentProviderAvailability[];
  prefixLines?: string[];
}) {
  const { workspace, agentsFiles, availableAgentsFiles, repositoryContext } = input.context;
  const handoff = input.handoffs.get(workspace.root);
  const visibleSkills = workspace.skills
    .filter((skill) => !skill.disableModelInvocation)
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      path: formatPathForPrompt(skill.filePath),
    }));
  const visibleAgentProviders = input.config.subagents ? input.localAgentProviders : [];
  const visibleAgents = workspace.agentProfiles.map((profile) => {
    const summary = summarizeLocalAgentProfile(profile);
    const availability = visibleAgentProviders.find((provider) => provider.name === summary.provider);
    return {
      ...summary,
      providerAvailable: availability?.available,
      providerUnavailableReason: availability?.reason,
    };
  });
  const loadedAgentsFiles = agentsFiles.map((file) => ({
    path: formatAgentsPath(file.path, workspace.root),
    content: file.content,
  }));
  const availableAgentsFileOutputs = availableAgentsFiles.map((file) => ({
    path: formatAgentsPath(file.path, workspace.root),
  }));
  const workspaceInstruction = input.config.skillsEnabled
    ? "Use this workspaceId in all subsequent tool calls for this project. Do not call open_workspace or open_project again for this same folder unless this workspaceId stops working, the user asks to reopen, or you switch to a different folder/worktree. Follow loaded agentsFiles instructions. Before working under a path listed in availableAgentsFiles, read that instruction file. When a task matches an available skill in skills, read its path before proceeding."
    : "Use this workspaceId in all subsequent tool calls for this project. Do not call open_workspace or open_project again for this same folder unless this workspaceId stops working, the user asks to reopen, or you switch to a different folder/worktree. Follow loaded agentsFiles instructions. Before working under a path listed in availableAgentsFiles, read that instruction file.";
  const instruction = `${workspaceInstruction} ${DEVSPACE_SESSION_CONTINUITY_INSTRUCTION}`;
  const resultText = [
    ...(input.prefixLines ?? [`Opened workspace ${workspace.id}`]),
    `Root: ${workspace.root}`,
    `Mode: ${workspace.mode}`,
    workspace.project ? `Project: ${workspace.project.name} (${workspace.project.slug})` : undefined,
    workspace.project ? `Preset: ${workspace.project.permissionPreset}` : undefined,
    loadedAgentsFiles.length > 0
      ? `Loaded project instructions: ${loadedAgentsFiles.map((file) => file.path).join(", ")}`
      : undefined,
    availableAgentsFileOutputs.length > 0
      ? `Available nested instructions: ${availableAgentsFileOutputs.map((file) => file.path).join(", ")}`
      : undefined,
    visibleSkills.length > 0
      ? `Available skills: ${visibleSkills.map((skill) => skill.name).join(", ")}`
      : undefined,
    visibleAgentProviders.some((provider) => provider.available)
      ? `Available subagent providers: ${visibleAgentProviders.filter((provider) => provider.available).map((provider) => provider.name).join(", ")}`
      : undefined,
    visibleAgentProviders.some((provider) => !provider.available)
      ? `Unavailable subagent providers: ${visibleAgentProviders.filter((provider) => !provider.available).map(formatUnavailableAgentProvider).join(", ")}`
      : undefined,
    visibleAgents.length > 0
      ? `Available subagent profiles: ${visibleAgents.map(formatVisibleAgent).join(", ")}`
      : undefined,
    handoff ? formatWorkspaceHandoffForPrompt(handoff) : "No persistent handoff exists yet. Initialize it with update_handoff before or after the first meaningful work unit.",
    instruction,
  ].filter(Boolean).join("\n");
  const content = [textBlock(resultText)];
  const responseContent = [
    ...content,
    textBlock(`Repository context: ${JSON.stringify(repositoryContext)}`),
  ];

  return {
    content: responseContent,
    _meta: {
      tool: input.tool,
      card: {
        workspaceId: workspace.id,
        root: workspace.root,
        path: workspace.root,
        project: workspace.project,
        summary: {
          mode: workspace.mode,
          preset: workspace.project?.permissionPreset,
          agentsFiles: loadedAgentsFiles.length,
          availableAgentsFiles: availableAgentsFileOutputs.length,
          skills: visibleSkills.length,
          agentProviders: visibleAgentProviders.length,
          agents: visibleAgents.length,
          skillDiagnostics: workspace.skillDiagnostics.length,
        },
      },
    },
    structuredContent: {
      result: resultText,
      workspaceId: workspace.id,
      root: workspace.root,
      mode: workspace.mode,
      sourceRoot: workspace.sourceRoot,
      worktree: workspace.worktree,
      project: workspace.project,
      agentsFiles: loadedAgentsFiles,
      availableAgentsFiles: availableAgentsFileOutputs,
      skills: visibleSkills,
      agentProviders: visibleAgentProviders,
      agents: visibleAgents,
      skillDiagnostics: workspace.skillDiagnostics,
      handoff,
      repositoryContext,
      instruction,
    },
  };
}

function registerCodexProcessTools(
  server: McpServer,
  config: ServerConfig,
  workspaces: WorkspaceRegistry,
  processSessions: ProcessSessionManager,
  resolveVerification?: (input: {
    workspaceId: string;
    workspaceRoot: string;
    agentId: string;
    type: ProcessVerificationTarget["type"];
  }) => ProcessVerificationTarget,
): void {
  registerAppTool(
    server,
    "exec_command",
    {
      title: "Execute command",
      description:
        "Run a command inside an open workspace. Returns its result when it exits during the yield window, otherwise returns a sessionId for write_stdin. Use this for file inspection, tests, builds, package scripts, and long-running processes. Call open_workspace first and pass workspaceId.",
      inputSchema: {
        workspaceId: z.string().describe("Workspace identifier returned by open_workspace."),
        cmd: z.string().min(1).describe("Shell command to execute."),
        tty: z
          .boolean()
          .optional()
          .describe("Allocate a pseudo-terminal for interactive commands. Defaults to false."),
        columns: z.number().int().min(1).max(1_000).optional().describe("Initial PTY width. Defaults to 80."),
        rows: z.number().int().min(1).max(1_000).optional().describe("Initial PTY height. Defaults to 24."),
        workingDirectory: z
          .string()
          .optional()
          .describe("Working directory relative to the workspace root. Defaults to the workspace root."),
        yieldTimeMs: z
          .number()
          .int()
          .min(0)
          .max(30_000)
          .optional()
          .describe("Milliseconds to wait before returning a running session. Defaults to 10000."),
        maxOutputTokens: z
          .number()
          .int()
          .positive()
          .max(100_000)
          .optional()
          .describe("Approximate output token budget. Defaults to 10000."),
        verification: z
          .object({
            agentId: z.string().trim().min(1).max(200),
            type: z.enum(["typecheck", "tests", "build"]),
          })
          .optional()
          .describe(
            "Associate this real command result with a completed local-agent result. dpkr helix derives pass/fail from the canonical process exit; the client cannot submit an outcome.",
          ),
      },
      outputSchema: processOutputSchema(),
      ...toolWidgetDescriptorMeta(config, "shell"),
      annotations: SHELL_TOOL_ANNOTATIONS,
    },
    async ({
      workspaceId,
      cmd,
      tty,
      columns,
      rows,
      workingDirectory,
      yieldTimeMs,
      maxOutputTokens,
      verification,
    }) => {
      const startedAt = performance.now();
      const workspace = workspaces.getWorkspace(workspaceId);
      const snapshot = await runAuthorizedWorkspaceProcess(
        workspaces,
        workspace,
        workingDirectory,
        (cwd) => {
          const verificationTarget = verification
            ? resolveVerification?.({
                workspaceId,
                workspaceRoot: workspace.root,
                agentId: verification.agentId,
                type: verification.type,
              })
            : undefined;
          if (verification && !verificationTarget) {
            throw new Error("Operation verification is unavailable.");
          }
          return processSessions.start({
            workspaceId,
            command: cmd,
            cwd,
            workspaceRoot: workspace.root,
            tty,
            columns,
            rows,
            yieldTimeMs,
            maxOutputTokens,
            verification: verificationTarget,
          });
        },
      );

      logToolCall(config, {
        tool: "exec_command",
        workspaceId,
        workingDirectory: workingDirectory ?? ".",
        command: cmd,
        commandLength: cmd.length,
        success: true,
        durationMs: Math.round(performance.now() - startedAt),
      });

      return processToolResponse("exec_command", workspaceId, snapshot, {
        command: cmd,
        workingDirectory: workingDirectory ?? ".",
        running: snapshot.running,
        exitCode: snapshot.exitCode,
        wallTimeMs: snapshot.wallTimeMs,
      });
    },
  );

  registerAppTool(
    server,
    "write_stdin",
    {
      title: "Write to process",
      description:
        "Poll or write characters to a process returned by exec_command. Omit chars or pass an empty string to poll. Pass \\u0003 to send Ctrl-C.",
      inputSchema: {
        workspaceId: z.string().describe("Workspace identifier used to start the process."),
        sessionId: z.number().describe("Process session identifier returned by exec_command."),
        chars: z.string().optional().describe("Characters to write. Omit or pass an empty string to poll."),
        columns: z.number().int().min(1).max(1_000).optional().describe("Resize a PTY to this width."),
        rows: z.number().int().min(1).max(1_000).optional().describe("Resize a PTY to this height."),
        yieldTimeMs: z
          .number()
          .int()
          .min(0)
          .max(30_000)
          .optional()
          .describe("Milliseconds to wait for process output or completion. Defaults to 10000."),
        maxOutputTokens: z
          .number()
          .int()
          .positive()
          .max(100_000)
          .optional()
          .describe("Approximate output token budget. Defaults to 10000."),
      },
      outputSchema: processOutputSchema(),
      ...toolWidgetDescriptorMeta(config, "shell"),
      annotations: SHELL_TOOL_ANNOTATIONS,
    },
    async ({ workspaceId, sessionId, chars, columns, rows, yieldTimeMs, maxOutputTokens }) => {
      const startedAt = performance.now();
      workspaces.getWorkspace(workspaceId);
      const snapshot = await processSessions.write({
        workspaceId,
        sessionId,
        chars,
        columns,
        rows,
        yieldTimeMs,
        maxOutputTokens,
      });

      logToolCall(config, {
        tool: "write_stdin",
        workspaceId,
        success: true,
        durationMs: Math.round(performance.now() - startedAt),
      });

      return processToolResponse("write_stdin", workspaceId, snapshot, {
        sessionId,
        charactersWritten: chars?.length ?? 0,
        running: snapshot.running,
        exitCode: snapshot.exitCode,
        wallTimeMs: snapshot.wallTimeMs,
      });
    },
  );
}

async function pathExistsForProjection(path: string): Promise<boolean | undefined> {
  try {
    await access(path);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? false : undefined;
  }
}

function registerLocalAgentTools(
  server: McpServer,
  config: ServerConfig,
  workspaces: WorkspaceRegistry,
  localAgents: LocalAgentService,
): void {
  registerAppTool(
    server,
    toolNames.delegateTask,
    {
      title: "Delegate task",
      description:
        "Explicitly delegate one focused implementation task in an open workspace to a configured local-agent profile or provider. The default target is codex-implementer. Project policy, target validity, and provider availability are checked before prompt, session, or worker side effects.",
      inputSchema: {
        workspaceId: z.string().describe("Workspace identifier returned by open_workspace or open_project."),
        target: localAgentTargetInputSchema
          .optional()
          .describe("Configured profile or raw provider. Defaults to codex-implementer."),
        goal: localAgentTextInputSchema.describe("Concrete task goal."),
        context: z.string().trim().min(1).max(16_000).optional(),
        relevantFiles: localAgentListInputSchema.optional(),
        acceptanceCriteria: localAgentListInputSchema.min(1),
        rules: localAgentListInputSchema.optional(),
        verification: localAgentListInputSchema.optional(),
        sourceDocuments: localAgentListInputSchema.optional(),
        model: localAgentTargetInputSchema.optional(),
        thinking: localAgentTargetInputSchema.optional(),
      },
      outputSchema: resultOutputSchema({
        agent: localAgentViewOutputSchema,
      }),
      ...toolWidgetDescriptorMeta(config, "agents"),
      annotations: LOCAL_AGENT_RUN_TOOL_ANNOTATIONS,
    },
    async ({
      workspaceId,
      target,
      model,
      thinking,
      ...envelope
    }) => {
      const startedAt = performance.now();
      const workspace = workspaces.getWorkspace(workspaceId);
      const prompt = renderLocalAgentTaskEnvelope(envelope);
      const record = await localAgents.startNew({
        scope: {
          workspaceId: workspace.id,
          workspaceRoot: workspace.root,
        },
        target: target ?? "codex-implementer",
        prompt,
        model,
        thinking,
      });
      const output = createLocalAgentActionOutput("started", record);
      logToolCall(config, {
        tool: toolNames.delegateTask,
        workspaceId,
        success: true,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return {
        content: [textBlock(output.result)],
        _meta: {
          tool: toolNames.delegateTask,
          card: {
            agent: output.agent,
            summary: createLocalAgentCardSummary(output.agent),
            payload: { content: [textBlock(output.result)] },
          },
        },
        structuredContent: output,
      };
    },
  );

  registerAppTool(
    server,
    toolNames.getAgentStatus,
    {
      title: "Get agent status",
      description:
        "Read one local-agent session status, optionally waiting up to 30 seconds for completion, input, error, or stop. A timed-out wait returns the current active state; provider results are not verified implementation.",
      inputSchema: {
        id: z.string().trim().min(1).max(200),
        waitMs: z.number().int().min(0).max(30_000).optional()
          .describe("Optional bounded wait in milliseconds. Omit or use 0 for an immediate read."),
      },
      outputSchema: resultOutputSchema({
        agent: localAgentViewOutputSchema,
        timedOut: z.boolean(),
      }),
      ...toolWidgetDescriptorMeta(config, "agents"),
      annotations: LOCAL_AGENT_READ_TOOL_ANNOTATIONS,
    },
    async ({ id, waitMs }) => {
      const shouldWait = waitMs !== undefined && waitMs > 0;
      const record = shouldWait
        ? await localAgents.waitForStatus(id, { waitMs })
        : localAgents.getStatus(id);
      const output = createLocalAgentStatusOutput(
        record,
        shouldWait && isLocalAgentActive(record),
      );
      return {
        content: [textBlock(output.result)],
        _meta: {
          tool: toolNames.getAgentStatus,
          card: {
            agent: output.agent,
            summary: createLocalAgentCardSummary(output.agent),
            payload: { content: [textBlock(output.result)] },
          },
        },
        structuredContent: output,
      };
    },
  );

  registerAppTool(
    server,
    toolNames.listAgents,
    {
      title: "List agents",
      description:
        "List local-agent sessions scoped to one open workspace. Final response bodies are omitted from the list; call get_agent_status for one session.",
      inputSchema: {
        workspaceId: z.string().describe("Workspace identifier returned by open_workspace or open_project."),
      },
      outputSchema: resultOutputSchema({
        agents: z.array(localAgentViewOutputSchema),
        summary: z.object({
          total: z.number().int().nonnegative(),
          active: z.number().int().nonnegative(),
          inputRequired: z.number().int().nonnegative(),
          resultAvailable: z.number().int().nonnegative(),
        }),
      }),
      ...toolWidgetDescriptorMeta(config, "agents"),
      annotations: LOCAL_AGENT_READ_TOOL_ANNOTATIONS,
    },
    async ({ workspaceId }) => {
      const workspace = workspaces.getWorkspace(workspaceId);
      const output = createLocalAgentListOutput(localAgents.list({
        workspaceId: workspace.id,
        workspaceRoot: workspace.root,
      }));
      return {
        content: [textBlock(output.result)],
        _meta: {
          tool: toolNames.listAgents,
          card: {
            agents: output.agents,
            summary: output.summary,
            payload: { content: [textBlock(output.result)] },
          },
        },
        structuredContent: output,
      };
    },
  );

  registerAppTool(
    server,
    toolNames.continueAgent,
    {
      title: "Continue agent",
      description:
        "Explicitly answer or continue an existing local-agent session through its persisted provider session ID. The prior input question is cleared before the same agent returns to running. Current project policy and provider availability are checked before prompt, state, or worker side effects.",
      inputSchema: {
        id: z.string().trim().min(1).max(200),
        prompt: z.string().trim().min(1).max(32_000),
        model: localAgentTargetInputSchema.optional(),
        thinking: localAgentTargetInputSchema.optional(),
      },
      outputSchema: resultOutputSchema({
        agent: localAgentViewOutputSchema,
      }),
      ...toolWidgetDescriptorMeta(config, "agents"),
      annotations: LOCAL_AGENT_RUN_TOOL_ANNOTATIONS,
    },
    async ({ id, prompt, model, thinking }) => {
      const record = await localAgents.resume({ id, prompt, model, thinking });
      const output = createLocalAgentActionOutput("continued", record);
      return {
        content: [textBlock(output.result)],
        _meta: {
          tool: toolNames.continueAgent,
          card: {
            agent: output.agent,
            summary: createLocalAgentCardSummary(output.agent),
            payload: { content: [textBlock(output.result)] },
          },
        },
        structuredContent: output,
      };
    },
  );
}

export function createMcpServer(
  config: ServerConfig,
  projects: ProjectRegistry,
  workspaces: WorkspaceRegistry,
  handoffs: WorkspaceHandoffStore,
  reviewCheckpoints: ReturnType<typeof createReviewCheckpointManager>,
  processSessions: ProcessSessionManager,
  localAgentProviders: LocalAgentProviderAvailability[],
  incomingArtifactAdapters: readonly IncomingArtifactAdapter[],
  localAgents?: LocalAgentService,
  mcpToolProjector?: McpToolOperationProjector,
  operationStore?: OperationStore,
  systemUpdate?: SystemUpdateController,
): McpServer {
  const server = new McpServer(
    {
      name: "devspace",
      title: "dpkr helix",
      version: "0.1.0",
      description:
        "Secure local coding workspace for MCP clients. Provides workspace-scoped file, search, edit, write, and shell tools.",
    },
    {
      instructions: serverInstructions(config),
    },
  );

  registerAppResource(
    server,
    "dpkr helix Diff Card",
    WORKSPACE_APP_URI,
    {
      description: "Interactive card for viewing dpkr helix file diffs.",
      _meta: {
        ui: {
          csp: appCsp(config),
        },
      },
    },
    async () => {
      await assertWorkspaceAppAssets();
      return {
        contents: [
          {
            uri: WORKSPACE_APP_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: workspaceAppHtml(config),
            _meta: {
              ui: {
                csp: appCsp(config),
              },
            },
          },
        ],
      };
    },
  );
  if (mcpToolProjector) {
    installMcpToolOperationProjection(server, mcpToolProjector);
  }

  if (config.subagents) {
    if (!localAgents) {
      throw new Error("LocalAgentService is required when subagents are enabled.");
    }
    registerLocalAgentTools(server, config, workspaces, localAgents);
  }

  if (systemUpdate) {
    registerSystemUpdateTools(
      server,
      systemUpdate,
      (fields) => logToolCall(config, fields),
    );
  }

  registerAppTool(
    server,
    toolNames.listProjects,
    {
      title: "List projects",
      description:
        "List registered dpkr helix projects by stable ID, slug, and exact display name. Use this before open_project so the user does not need to provide an absolute path.",
      inputSchema: {
        includeUnavailable: z
          .boolean()
          .optional()
          .describe("Include missing, not-allowed, or invalid projects. Defaults to false."),
        pinnedFirst: z
          .boolean()
          .optional()
          .describe("Sort pinned projects first. Defaults to true."),
      },
      outputSchema: resultOutputSchema({
        projects: z.array(projectViewOutputSchema),
        summary: z.object({
          total: z.number().int().nonnegative(),
          available: z.number().int().nonnegative(),
          unavailable: z.number().int().nonnegative(),
        }),
      }),
      ...toolWidgetDescriptorMeta(config, "projects"),
      annotations: PROJECT_LIST_TOOL_ANNOTATIONS,
    },
    async ({ includeUnavailable, pinnedFirst }) => {
      const startedAt = performance.now();
      const output = createProjectListOutput(await projects.list(), {
        includeUnavailable,
        pinnedFirst,
      });
      logToolCall(config, {
        tool: toolNames.listProjects,
        success: true,
        durationMs: Math.round(performance.now() - startedAt),
      });

      return {
        content: [textBlock(output.result)],
        _meta: {
          tool: toolNames.listProjects,
          card: {
            summary: output.summary,
            projects: output.projects,
          },
        },
        structuredContent: output,
      };
    },
  );

  registerAppTool(
    server,
    toolNames.openProject,
    {
      title: "Open project",
      description:
        "Open a registered dpkr helix project by exact project ID, exact slug, or unambiguous exact display name. If mode is omitted, the registered project's default workspace mode is used. Ambiguous or unavailable projects return an error without opening a workspace.",
      inputSchema: {
        project: z
          .string()
          .describe("Project ID, exact slug, or unambiguous exact display name returned by list_projects."),
        mode: z
          .enum(["checkout", "worktree"])
          .optional()
          .describe("Overrides the registered default mode. Use worktree for an isolated managed worktree."),
        baseRef: z
          .string()
          .optional()
          .describe("Git ref to base a worktree on. Only used with mode=\"worktree\". Defaults to HEAD."),
      },
      outputSchema: projectOpenOutputSchema,
      ...toolWidgetDescriptorMeta(config, "projects", PROJECT_OPEN_TOOL_VISIBILITY),
      annotations: PROJECT_OPEN_TOOL_ANNOTATIONS,
    },
    async ({ project: selector, mode, baseRef }) => {
      const startedAt = performance.now();
      try {
        const project = projects.resolveSelector(selector);
        const projectView = await projects.getViewById(project.id);
        if (!projectView || projectView.availability !== "available") {
          const output = createProjectErrorOutput(
            projectView ? `PROJECT_${projectView.availability.toUpperCase()}` : "PROJECT_NOT_FOUND",
            projectView?.unavailableReason ?? `Registered project is not available: ${selector}`,
          );
          logToolCall(config, {
            tool: toolNames.openProject,
            path: project.root,
            success: false,
            durationMs: Math.round(performance.now() - startedAt),
            error: output.error.code,
          });
          return {
            isError: true,
            content: [textBlock(output.result)],
            _meta: {
              tool: toolNames.openProject,
              card: {
                project: projectView,
                summary: { status: output.error.code },
                payload: { content: [textBlock(output.result)] },
              },
            },
            structuredContent: output,
          };
        }

        const openMode = mode ?? project.defaultMode;
        const context = await workspaces.openWorkspace({
          path: project.root,
          mode: openMode,
          baseRef,
        });
        if (config.widgets === "changes") {
          void reviewCheckpoints.initializeWorkspace({
            workspaceId: context.workspace.id,
            root: context.workspace.root,
          });
        }
        const prefix = formatProjectOpenResult({
          workspaceId: context.workspace.id,
          root: context.workspace.root,
          mode: context.workspace.mode,
          project: context.workspace.project ?? {
            id: project.id,
            slug: project.slug,
            name: project.name,
            permissionPreset: project.permissionPreset,
            defaultMode: project.defaultMode,
          },
        }).split("\n");
        const response = createWorkspaceToolResult({
          tool: toolNames.openProject,
          config,
          context,
          handoffs,
          localAgentProviders,
          prefixLines: prefix,
        });
        logToolCall(config, {
          tool: toolNames.openProject,
          workspaceId: context.workspace.id,
          path: context.workspace.root,
          success: true,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return response;
      } catch (error) {
        if (error instanceof ProjectSelectorError) {
          const output = createProjectErrorOutput(
            error.code,
            error.message,
            error.candidates,
          );
          logToolCall(config, {
            tool: toolNames.openProject,
            success: false,
            durationMs: Math.round(performance.now() - startedAt),
            error: output.error.code,
          });
          return {
            isError: true,
            content: [textBlock(output.result)],
            _meta: {
              tool: toolNames.openProject,
              card: {
                summary: { status: output.error.code },
                payload: { content: [textBlock(output.result)] },
              },
            },
            structuredContent: output,
          };
        }
        throw error;
      }
    },
  );

  registerAppTool(
    server,
    "open_workspace",
    {
      title: "Open workspace",
      description:
        "Open a local project directory as a coding workspace. Call this once per project folder or worktree before reading, editing, searching, writing, showing changes, or running commands. Reuse the returned workspaceId for later calls in the same folder; do not call open_workspace again unless switching folders/worktrees, changing checkout/worktree mode, the workspaceId is rejected as unknown, or the user explicitly asks to reopen. By default this opens the actual checkout; set mode=\"worktree\" when the user asks for an isolated or parallel coding session. Returns a workspaceId, loaded root project instructions, and nested instruction file paths the model should read before working in those directories.",
      inputSchema: {
        path: z
          .string()
          .describe(
            "Absolute path, or a leading-tilde home path such as ~/project, to a local project directory inside an allowed root.",
          ),
        mode: z
          .enum(["checkout", "worktree"])
          .optional()
          .describe(
            "Defaults to checkout. Use checkout to work in the actual directory. Use worktree to create an isolated managed Git worktree for parallel work.",
          ),
        baseRef: z
          .string()
          .optional()
          .describe("Git ref to base a worktree on. Only used with mode=\"worktree\". Defaults to HEAD."),
      },
      outputSchema: workspaceOutputSchema,
      ...toolWidgetDescriptorMeta(config, "workspace"),
      annotations: { readOnlyHint: true },
    },
    async ({ path, mode, baseRef }) => {
      const startedAt = performance.now();
      const context = await workspaces.openWorkspace({ path, mode, baseRef });
      if (config.widgets === "changes") {
        void reviewCheckpoints.initializeWorkspace({
          workspaceId: context.workspace.id,
          root: context.workspace.root,
        });
      }
      const response = createWorkspaceToolResult({
        tool: toolNames.openWorkspace,
        config,
        context,
        handoffs,
        localAgentProviders,
      });
      logToolCall(config, {
        tool: "open_workspace",
        workspaceId: context.workspace.id,
        path: context.workspace.root,
        success: true,
        durationMs: Math.round(performance.now() - startedAt),
      });

      return response;
    },
  );

  registerAppTool(
    server,
    "get_handoff",
    {
      title: "Get workspace handoff",
      description:
        "Read the persistent resume handoff for an open workspace. Reconcile it with Git, code, configuration, and current test evidence before acting because the saved handoff may be stale after external changes.",
      inputSchema: {
        workspaceId: z.string().describe("Workspace identifier returned by open_workspace."),
      },
      outputSchema: resultOutputSchema({
        handoff: workspaceHandoffOutputSchema.optional(),
      }),
      _meta: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ workspaceId }) => {
      const workspace = workspaces.getWorkspace(workspaceId);
      const handoff = handoffs.get(workspace.root);
      const result = handoff
        ? formatWorkspaceHandoffForPrompt(handoff)
        : "No persistent handoff exists for this workspace yet.";
      return {
        content: [{ type: "text" as const, text: result }],
        structuredContent: { result, handoff },
      };
    },
  );

  registerAppTool(
    server,
    "update_handoff",
    {
      title: "Update workspace handoff",
      description:
        "Persist the exact resume state for this workspace after each meaningful completed or interrupted work unit and before the final response. Record facts, verification, active agent IDs, risks, and next actions only. Omitted list fields preserve their previous values. Never include secrets, credentials, file contents, or full chat transcripts.",
      inputSchema: {
        workspaceId: z.string().describe("Workspace identifier returned by open_workspace."),
        status: z.enum(WORKSPACE_HANDOFF_STATUSES),
        summary: z.string().trim().min(1).max(4000),
        completed: z.array(handoffListItemSchema).max(50).optional(),
        nextActions: z.array(handoffListItemSchema).max(20).optional(),
        verification: z.array(handoffListItemSchema).max(50).optional(),
        risks: z.array(handoffListItemSchema).max(20).optional(),
        activeAgents: z.array(handoffListItemSchema).max(20).optional(),
      },
      outputSchema: resultOutputSchema({
        handoff: workspaceHandoffOutputSchema,
      }),
      _meta: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ workspaceId, ...input }) => {
      const workspace = workspaces.getWorkspace(workspaceId);
      const handoff = handoffs.upsert(workspace.root, input);
      const result = formatWorkspaceHandoffForPrompt(handoff);
      return {
        content: [{ type: "text" as const, text: result }],
        structuredContent: { result, handoff },
      };
    },
  );

  registerAppTool(
    server,
    toolNames.read,
    {
      title: "Read file",
      description:
        [
          "Read a file inside an open workspace. Use this for file inspection instead of shell commands like cat or sed. Call open_workspace first and pass workspaceId.",
          "Use this tool to inspect relevant AGENTS.md or CLAUDE.md files listed by open_workspace before working in nested directories.",
          config.skillsEnabled
            ? "If available skills were returned and a task matches one, read that skill's path before proceeding. Skill paths may be outside the workspace; only advertised SKILL.md files and files under already-loaded skill directories are readable."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      inputSchema: {
        workspaceId: z
          .string()
          .describe("Workspace identifier returned by open_workspace."),
        path: z
          .string()
          .describe(
            config.skillsEnabled
              ? "File path to read, relative to the workspace root. May also be an advertised skill path from open_workspace skills."
              : "File path to read, relative to the workspace root.",
          ),
        offset: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("1-indexed line number to start reading from."),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Maximum number of lines to read."),
      },
      outputSchema: resultOutputSchema(),
      ...toolWidgetDescriptorMeta(config, "read"),
      annotations: { readOnlyHint: true },
    },
    async ({ workspaceId, ...input }) => {
      const startedAt = performance.now();
      const workspace = workspaces.getWorkspace(workspaceId);
      authorizeWorkspacePolicyOperation({
        source: workspace.policySource,
        operation: "read",
      });
      const readPath = workspaces.resolveReadPath(workspace, input.path);
      const response = await readFileTool(
        { ...input, path: readPath.absolutePath },
        {
          cwd: workspace.root,
          root: workspace.root,
          readRoots: readPath.readRoots,
        },
      );

      if (response.isError) {
        logFailedToolResponse(config, {
          tool: toolNames.read,
          workspaceId,
          path: input.path,
        }, response.content, startedAt);
        return response;
      }
      workspaces.markReadPathLoaded(workspace, readPath);

      const summary = {
        ...textSummary(response.content),
        offset: input.offset ?? 1,
        limited: input.limit !== undefined,
      };
      logToolCall(config, {
        tool: toolNames.read,
        workspaceId,
        path: input.path,
        success: true,
        durationMs: Math.round(performance.now() - startedAt),
      });

      return {
        ...response,
        _meta: {
          tool: toolNames.read,
          card: {
            workspaceId,
            path: input.path,
            summary,
            payload: { content: response.content },
          },
        },
        structuredContent: {
          result: contentText(response.content),
        },
      };
    },
  );

  if (config.toolMode !== "codex") {
  registerAppTool(
    server,
    toolNames.write,
    {
      title: "Write file",
      description:
        `Create or completely overwrite a file inside an open workspace. Prefer ${toolNames.edit} for targeted changes to existing files. Call open_workspace first and pass workspaceId.`,
      inputSchema: {
        workspaceId: z
          .string()
          .describe("Workspace identifier returned by open_workspace."),
        path: z
          .string()
          .describe("File path to write, relative to the workspace root."),
        content: z.string().describe("Complete new file content."),
      },
      outputSchema: resultOutputSchema(),
      ...toolWidgetDescriptorMeta(config, "write"),
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ workspaceId, ...input }) => {
      const startedAt = performance.now();
      const workspace = workspaces.getWorkspace(workspaceId);
      const destination = await workspaces.resolveAuthorizedMutationPath(
        workspace,
        "write",
        input.path,
      );
      const existedBeforeWrite = await pathExistsForProjection(destination.absolutePath);
      const response = await writeFileTool(
        { ...input, path: destination.absolutePath },
        {
          cwd: destination.canonicalRoot,
          root: destination.canonicalRoot,
        },
      );

      if (response.isError) {
        logFailedToolResponse(config, {
          tool: toolNames.write,
          workspaceId,
          path: input.path,
        }, response.content, startedAt);
        return response;
      }

      const patch = newFilePatch(input.path, input.content);
      const stats = countDiffStats(patch);
      const summary = {
        ...stats,
        lines: contentLineCount(input.content),
        characters: input.content.length,
      };
      logToolCall(config, {
        tool: toolNames.write,
        workspaceId,
        path: input.path,
        success: true,
        durationMs: Math.round(performance.now() - startedAt),
      });

      return attachMcpToolResultProjection({
        ...response,
        _meta: {
          tool: toolNames.write,
          card: {
            workspaceId,
            path: input.path,
            summary,
            payload: {
              content: response.content,
              patch,
            },
          },
        },
        structuredContent: {
          result: contentText(response.content),
        },
      }, {
        fileChanges: [{
          relativePath: destination.relativePath,
          operation: existedBeforeWrite === false ? "create" : "update",
        }],
      });
    },
  );

  registerAppTool(
    server,
    toolNames.edit,
    {
      title: "Edit file",
      description:
        `Edit one file inside an open workspace by replacing exact text blocks. Prefer this over ${toolNames.write} for targeted changes. Each oldText must match a unique, non-overlapping region of the original file; merge nearby changes into one edit and keep oldText as small as possible while still unique. Call open_workspace first and pass workspaceId.`,
      inputSchema: {
        workspaceId: z
          .string()
          .describe("Workspace identifier returned by open_workspace."),
        path: z
          .string()
          .describe("File path to edit, relative to the workspace root."),
        edits: z
          .array(
            z.object({
              oldText: z
                .string()
                .describe(
                  "Exact text to replace. Must match uniquely in the original file.",
                ),
              newText: z.string().describe("Replacement text."),
            }),
          )
          .min(1),
      },
      outputSchema: resultOutputSchema({
        status: z.literal("applied"),
      }),
      ...toolWidgetDescriptorMeta(config, "edit"),
      annotations: EDIT_TOOL_ANNOTATIONS,
    },
    async ({ workspaceId, ...input }) => {
      const startedAt = performance.now();
      const workspace = workspaces.getWorkspace(workspaceId);
      const destination = await workspaces.resolveAuthorizedMutationPath(
        workspace,
        "edit",
        input.path,
      );
      const response = await editFileTool(
        { ...input, path: destination.absolutePath },
        {
          cwd: destination.canonicalRoot,
          root: destination.canonicalRoot,
        },
      );

      if (response.isError) {
        logFailedToolResponse(config, {
          tool: toolNames.edit,
          workspaceId,
          path: input.path,
        }, response.content, startedAt);
        return response;
      }

      const stats = countDiffStats(
        response.details?.patch ?? response.details?.diff,
      );
      const summary = {
        ...stats,
        editCount: input.edits.length,
      };
      const editResultText = `Edited ${input.path} (+${stats.additions} -${stats.removals}).`;
      const editContent = [textBlock(editResultText)];
      logToolCall(config, {
        tool: toolNames.edit,
        workspaceId,
        path: input.path,
        success: true,
        durationMs: Math.round(performance.now() - startedAt),
      });

      return attachMcpToolResultProjection({
        content: editContent,
        _meta: {
          tool: toolNames.edit,
          card: {
            workspaceId,
            path: input.path,
            summary,
            payload: {
              diff: response.details?.diff,
              patch: response.details?.patch,
            },
          },
        },
        structuredContent: {
          status: "applied",
          result: contentText(editContent),
        },
      }, {
        fileChanges: [{
          relativePath: destination.relativePath,
          operation: "update",
        }],
      });
    },
  );
  }

  if (config.toolMode === "codex") {
    registerAppTool(
      server,
      "apply_patch",
      {
        title: "Apply patch",
        description:
          "Apply one Codex-style patch inside an open workspace. Supports adding, overwriting, updating, deleting, and moving files. Use this for all file modifications. Paths must be relative to the workspace. Call open_workspace first and pass workspaceId.",
        inputSchema: {
          workspaceId: z
            .string()
            .describe("Workspace identifier returned by open_workspace."),
          patch: z
            .string()
            .describe("Patch text enclosed by *** Begin Patch and *** End Patch markers."),
        },
        outputSchema: resultOutputSchema({
          additions: z.number(),
          removals: z.number(),
          files: z.array(
            z.object({
              path: z.string(),
              previousPath: z.string().optional(),
              operation: z.enum(["add", "update", "delete", "move"]),
            }),
          ),
        }),
        ...toolWidgetDescriptorMeta(config, "edit"),
        annotations: EDIT_TOOL_ANNOTATIONS,
      },
      async ({ workspaceId, patch }) => {
        const startedAt = performance.now();
        const workspace = workspaces.getWorkspace(workspaceId);
        authorizeWorkspacePolicyOperation({
          source: workspace.policySource,
          operation: "patch",
        });
        const applied = await applyPatch(workspace.root, patch, {
          resolvePath: async (path) =>
            (
              await workspaces.resolveAuthorizedMutationPath(
                workspace,
                "patch",
                path,
              )
            ).absolutePath,
        });
        const paths = applied.files.map((file) => file.path).join(", ");
        const result = `Applied patch to ${applied.files.length} file(s): ${paths}`;
        const content = [textBlock(result)];
        const displayPath = applied.files.length === 1
          ? applied.files[0]?.path
          : `${applied.files.length} files`;

        logToolCall(config, {
          tool: "apply_patch",
          workspaceId,
          success: true,
          durationMs: Math.round(performance.now() - startedAt),
        });

        return attachMcpToolResultProjection({
          content,
          _meta: {
            tool: "apply_patch",
            card: {
              workspaceId,
              path: displayPath,
              summary: {
                files: applied.files.length,
                additions: applied.additions,
                removals: applied.removals,
              },
              files: applied.files,
              payload: { patch: applied.patch },
            },
          },
          structuredContent: {
            result,
            additions: applied.additions,
            removals: applied.removals,
            files: applied.files,
          },
        }, {
          fileChanges: applied.files.map((file) => ({
            relativePath: file.path,
            operation: file.operation === "add" ? "create" : file.operation,
            previousRelativePath: file.previousPath,
          })),
        });
      },
    );
  }

  if (config.widgets === "changes") {
    registerReviewTool({
      server,
      workspaces,
      reviewCheckpoints,
      toolMeta: toolWidgetDescriptorMeta(config, "show_changes"),
      localAgents,
      operationStore,
      logToolCall: (fields) => logToolCall(config, fields),
    });
  }

  if (config.toolMode === "full") {
    registerAppTool(
      server,
      toolNames.grep,
      {
        title: "Grep",
        description:
          "Search file contents inside an open workspace. Use this before broad reads when looking for symbols, text, or usage sites. Respects project ignore rules. Call open_workspace first and pass workspaceId.",
        inputSchema: {
          workspaceId: z
            .string()
            .describe("Workspace identifier returned by open_workspace."),
          pattern: z.string().describe("Search pattern."),
          path: z
            .string()
            .optional()
            .describe(
              "Optional path or glob scope relative to the workspace root.",
            ),
          include: z.string().optional().describe("Optional include glob."),
        },
        outputSchema: resultOutputSchema(),
        ...toolWidgetDescriptorMeta(config, "search"),
        annotations: { readOnlyHint: true },
      },
      async ({ workspaceId, ...input }) => {
        const startedAt = performance.now();
        const workspace = workspaces.getWorkspace(workspaceId);
        authorizeWorkspacePolicyOperation({
          source: workspace.policySource,
          operation: "search",
        });
        if (input.path) workspaces.resolvePath(workspace, input.path);
        const response = await grepFilesTool(input, {
          cwd: workspace.root,
          root: workspace.root,
        });

        if (response.isError) {
          logFailedToolResponse(config, {
            tool: toolNames.grep,
            workspaceId,
            path: input.path,
          }, response.content, startedAt);
          return response;
        }

        const summary = {
          pattern: input.pattern,
          scope: input.path ?? ".",
          ...textSummary(response.content),
        };
        logToolCall(config, {
          tool: toolNames.grep,
          workspaceId,
          path: input.path,
          success: true,
          durationMs: Math.round(performance.now() - startedAt),
        });

        return {
          ...response,
          _meta: {
            tool: toolNames.grep,
            card: {
              workspaceId,
              path: input.path,
              summary,
              payload: { content: response.content },
            },
          },
          structuredContent: {
            result: contentText(response.content),
          },
        };
      },
    );

    registerAppTool(
      server,
      toolNames.glob,
      {
        title: "Glob",
        description:
          "Find files by glob pattern inside an open workspace. Use this to discover filenames or narrow file sets before reading. Respects project ignore rules. Call open_workspace first and pass workspaceId.",
        inputSchema: {
          workspaceId: z
            .string()
            .describe("Workspace identifier returned by open_workspace."),
          pattern: z.string().describe("File glob pattern."),
          path: z
            .string()
            .optional()
            .describe("Optional path scope relative to the workspace root."),
        },
        outputSchema: resultOutputSchema(),
        ...toolWidgetDescriptorMeta(config, "search"),
        annotations: { readOnlyHint: true },
      },
      async ({ workspaceId, ...input }) => {
        const startedAt = performance.now();
        const workspace = workspaces.getWorkspace(workspaceId);
        authorizeWorkspacePolicyOperation({
          source: workspace.policySource,
          operation: "search",
        });
        if (input.path) workspaces.resolvePath(workspace, input.path);
        const response = await findFilesTool(input, {
          cwd: workspace.root,
          root: workspace.root,
        });

        if (response.isError) {
          logFailedToolResponse(config, {
            tool: toolNames.glob,
            workspaceId,
            path: input.path,
          }, response.content, startedAt);
          return response;
        }

        const summary = {
          pattern: input.pattern,
          scope: input.path ?? ".",
          ...textSummary(response.content),
        };
        logToolCall(config, {
          tool: toolNames.glob,
          workspaceId,
          path: input.path,
          success: true,
          durationMs: Math.round(performance.now() - startedAt),
        });

        return {
          ...response,
          _meta: {
            tool: toolNames.glob,
            card: {
              workspaceId,
              path: input.path,
              summary,
              payload: { content: response.content },
            },
          },
          structuredContent: {
            result: contentText(response.content),
          },
        };
      },
    );

    registerAppTool(
      server,
      toolNames.ls,
      {
        title: "Ls",
        description:
          "List a directory inside an open workspace. Use this for directory inspection before reading files. Call open_workspace first and pass workspaceId.",
        inputSchema: {
          workspaceId: z
            .string()
            .describe("Workspace identifier returned by open_workspace."),
          path: z
            .string()
            .describe(
              "Directory path to list, relative to the workspace root.",
            ),
        },
        outputSchema: resultOutputSchema(),
        ...toolWidgetDescriptorMeta(config, "directory"),
        annotations: { readOnlyHint: true },
      },
      async ({ workspaceId, ...input }) => {
        const startedAt = performance.now();
        const workspace = workspaces.getWorkspace(workspaceId);
        authorizeWorkspacePolicyOperation({
          source: workspace.policySource,
          operation: "list",
        });
        workspaces.resolvePath(workspace, input.path);
        const response = await listDirectoryTool(input, {
          cwd: workspace.root,
          root: workspace.root,
        });

        if (response.isError) {
          logFailedToolResponse(config, {
            tool: toolNames.ls,
            workspaceId,
            path: input.path,
          }, response.content, startedAt);
          return response;
        }

        const summary = textSummary(response.content);
        logToolCall(config, {
          tool: toolNames.ls,
          workspaceId,
          path: input.path,
          success: true,
          durationMs: Math.round(performance.now() - startedAt),
        });

        return {
          ...response,
          _meta: {
            tool: toolNames.ls,
            card: {
              workspaceId,
              path: input.path,
              summary,
              payload: { content: response.content },
            },
          },
          structuredContent: {
            result: contentText(response.content),
          },
        };
      },
    );
  }

  if (config.toolMode !== "codex") {
  registerAppTool(
    server,
    toolNames.shell,
    {
      title: "Bash",
      description: config.toolMode !== "full"
        ? `Run a shell command inside an open workspace. Use only for tests, builds, git inspection, package scripts, search, file discovery, and directory inspection. In minimal tool mode, ${toolNames.grep}, ${toolNames.glob}, and ${toolNames.ls} are disabled; use command-line tools such as grep, rg, find, ls, and tree for those read-only inspection actions. Do not use ${toolNames.shell} to create or modify files. Do not use shell redirection, heredocs, tee, sed -i, perl -i, node/python/ruby scripts, or generated scripts to write project files; use ${toolNames.edit} for targeted changes and ${toolNames.write} for new files or full rewrites. Prefer ${toolNames.read} for direct file reads. Call open_workspace first and pass workspaceId. This is powerful local execution and should only be exposed behind strong authentication.`
        : `Run a shell command inside an open workspace. Use only for tests, builds, git inspection, package scripts, and commands that are better executed by the shell. Do not use ${toolNames.shell} to create or modify files. Do not use shell redirection, heredocs, tee, sed -i, perl -i, node/python/ruby scripts, or generated scripts to write project files; use ${toolNames.edit} for targeted changes and ${toolNames.write} for new files or full rewrites. Prefer ${toolNames.read}, ${toolNames.grep}, ${toolNames.glob}, and ${toolNames.ls} for file inspection. Call open_workspace first and pass workspaceId. This is powerful local execution and should only be exposed behind strong authentication.`,
      inputSchema: {
        workspaceId: z
          .string()
          .describe("Workspace identifier returned by open_workspace."),
        command: z
          .string()
          .describe(
            `Shell command to run. Must not create or modify project files; use ${toolNames.edit} or ${toolNames.write} for file changes.`,
          ),
        workingDirectory: z
          .string()
          .optional()
          .describe(
            "Optional working directory relative to the workspace root. Defaults to the workspace root.",
          ),
        timeout: z
          .number()
          .positive()
          .max(300)
          .optional()
          .describe("Timeout in seconds. Defaults to 30, max 300."),
      },
      outputSchema: resultOutputSchema(),
      ...toolWidgetDescriptorMeta(config, "shell"),
      annotations: SHELL_TOOL_ANNOTATIONS,
    },
    async ({ workspaceId, workingDirectory, ...input }) => {
      const startedAt = performance.now();
      const workspace = workspaces.getWorkspace(workspaceId);
      const response = await runAuthorizedWorkspaceProcess(
        workspaces,
        workspace,
        workingDirectory,
        (cwd) => runShellTool(input, {
          cwd,
          root: workspace.root,
        }),
      );

      if (response.isError) {
        logFailedToolResponse(config, {
          tool: toolNames.shell,
          workspaceId,
          workingDirectory: workingDirectory ?? ".",
          command: input.command,
          commandLength: input.command.length,
        }, response.content, startedAt);
        return response;
      }

      const summary = {
        command: input.command,
        workingDirectory: workingDirectory ?? ".",
        ...textSummary(response.content),
      };
      logToolCall(config, {
        tool: toolNames.shell,
        workspaceId,
        workingDirectory: workingDirectory ?? ".",
        command: input.command,
        commandLength: input.command.length,
        success: true,
        durationMs: Math.round(performance.now() - startedAt),
      });

      return {
        ...response,
        _meta: {
          tool: toolNames.shell,
          card: {
            workspaceId,
            path: workingDirectory,
            summary,
            payload: { content: response.content },
          },
        },
        structuredContent: {
          result: contentText(response.content),
        },
      };
    },
  );
  }

  if (config.toolMode === "codex") {
    registerCodexProcessTools(
      server,
      config,
      workspaces,
      processSessions,
      localAgents && operationStore
        ? ({ workspaceId, workspaceRoot, agentId, type }) => {
            const agent = localAgents.getStatus(agentId);
            if (
              agent.workspaceId !== workspaceId
              || !isSameCanonicalPath(agent.workspaceRoot, workspaceRoot)
              || agent.status !== "idle"
              || agent.latestResponse === undefined
              || agent.disposition === "needs_input"
              || !isLocalAgentProvider(agent.provider)
            ) {
              throw new Error(
                "Verification requires a completed local-agent result in the same workspace.",
              );
            }
            const run = operationStore.findRunBySource(
              "local_agent",
              agent.provider,
              agent.id,
            );
            if (
              !run
              || run.workspaceId !== workspaceId
              || run.state !== "completed"
              || (
                run.assuranceStage !== "result_available"
                && run.assuranceStage !== "verification_pending"
                && run.assuranceStage !== "verified"
              )
            ) {
              throw new Error(
                "No eligible result-available operation run exists for this agent.",
              );
            }
            return { runId: run.id, workspaceId, type };
          }
        : undefined,
    );
  }

  if (config.artifactsEnabled && isArtifactDownloadSupportedPlatform()) {
    registerArtifactTools(server, {
      config,
      workspaces,
      incomingArtifactAdapters,
    });
  }

  return server;
}

export interface CreateServerOptions {
  incomingArtifactAdapters?: readonly IncomingArtifactAdapter[];
  localAgents?: LocalAgentService;
  systemUpdate?: SystemUpdateController;
}

export function createServer(
  config = loadConfig(),
  options: CreateServerOptions = {},
): RunningServer {
  const incomingArtifactAdapters = options.incomingArtifactAdapters
    ?? [createOpenAIIncomingArtifactAdapter()];
  const systemUpdate = options.systemUpdate ?? createWindowsSystemUpdateController();
  const allowedHosts = config.allowedHosts.includes("*")
    ? undefined
    : Array.from(new Set([config.host, ...config.allowedHosts]));
  const app = createMcpExpressApp({
    host: config.host,
    ...(allowedHosts ? { allowedHosts } : {}),
  });
  const transports = new McpSessionRegistry<Transport>();
  const mcpUrl = new URL("/mcp", config.publicBaseUrl);
  const resourceServerUrl = resourceUrlFromServerUrl(mcpUrl);
  const oauthProvider = new SingleUserOAuthProvider(config.oauth, mcpUrl, config.stateDir);
  const bearerAuth = requireBearerAuth({
    verifier: oauthProvider,
    requiredScopes: [config.oauth.scopes[0] ?? "devspace"],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceServerUrl),
  });
  const projectStore = createProjectStore(config.stateDir);
  const projects = new ProjectRegistry(projectStore, config.allowedRoots);
  const workspaceStore = createWorkspaceStore(config.stateDir);
  const handoffStore = createWorkspaceHandoffStore(config.stateDir);
  const workspaces = new WorkspaceRegistry(config, workspaceStore, projects);
  const reviewCheckpoints = createReviewCheckpointManager();
  const operationStore = new OperationStore(config.stateDir);
  const operationEventBus = new OperationEventBus();
  let processSessions: ProcessSessionManager;
  const operationRuns = new OperationRunService(operationStore, {
    eventBus: operationEventBus,
    resolveCapabilities: (reference) => {
      const mcpSessionId = mcpSessionIdFromSourceRunId(reference.sourceRunId);
      if (reference.kind === "mcp_tool" && reference.source === "mcp" && mcpSessionId) {
        return {
          ownerStatus: transports.has(mcpSessionId) ? "available" : "missing",
          stoppable: false,
        };
      }
      return resolveProcessSessionCapabilities(processSessions, reference);
    },
    onIssue: (issue) => {
      logEvent(config.logging, "warn", "operation_projection_issue", {
        code: issue.code,
        phase: issue.phase,
      });
    },
  });
  const verificationProjector = new OperationVerificationProjector(
    operationRuns,
    operationStore,
  );
  const processProjector = new ProcessSessionOperationProjector(operationRuns, {
    verification: verificationProjector,
    onStopOutcome: ({ runId, state }) => {
      logEvent(
        config.logging,
        state === "failed" ? "warn" : "info",
        state === "failed" ? "operation_stop_failed" : "operation_stop_completed",
        { runId, state },
      );
    },
  });
  processSessions = new ProcessSessionManager({
    projection: processProjector,
    captureVerificationBasisFingerprint: readCurrentRepositoryFingerprint,
  });
  operationRuns.reconcileActiveRuns();
  const verificationReconciliation = verificationProjector.reconcileInterrupted();
  if (verificationReconciliation.failedRunIds.length > 0) {
    logEvent(config.logging, "warn", "operation_verification_reconciliation_failed", {
      inspected: verificationReconciliation.inspected,
      failed: verificationReconciliation.failedRunIds.length,
    });
  }
  const localAgentProviders = config.subagents
    ? getLocalAgentProviderAvailabilitySnapshot()
    : [];
  const localAgents = options.localAgents ?? (
    config.subagents
      ? new LocalAgentService({
          config,
          writeMode: "allowed",
          observation: new LocalAgentOperationProjector(
            operationRuns,
            operationStore,
          ),
          workerSpawner: createDetachedLocalAgentWorkerSpawner(
            fileURLToPath(new URL("./cli.js", import.meta.url)),
          ),
        })
      : undefined
  );

  const logSessionCloseResults = (
    reason: "capacity" | "idle_timeout" | "server_shutdown",
    results: McpSessionCloseResult[],
  ) => {
    for (const result of results) {
      if (result.error) {
        logEvent(config.logging, "warn", "mcp_session_close_failed", {
          reason,
          sessionIdPrefix: sessionIdPrefix(result.sessionId),
          error:
            result.error instanceof Error
              ? result.error.message
              : String(result.error),
        });
        continue;
      }

      logEvent(
        config.logging,
        reason === "capacity" ? "debug" : "info",
        "mcp_session_closed",
        {
          reason,
          sessionIdPrefix: sessionIdPrefix(result.sessionId),
        },
      );
    }
  };

  const trimMcpSessions = () => {
    void transports
      .closeExcess(MCP_SESSION_MAX_RETAINED)
      .then((results) => logSessionCloseResults("capacity", results));
  };

  const sessionCleanupTimer = setInterval(() => {
    void transports
      .closeIdle(MCP_SESSION_IDLE_TIMEOUT_MS)
      .then((results) => logSessionCloseResults("idle_timeout", results));
  }, MCP_SESSION_CLEANUP_INTERVAL_MS);
  sessionCleanupTimer.unref();

  if (config.logging.trustProxy) {
    app.set("trust proxy", "loopback");
  }

  app.use((req, res, next) => {
    const requestId = randomUUID();
    const startedAt = performance.now();
    res.locals.requestId = requestId;

    res.on("finish", () => {
      const path = requestPath(req);
      if (!config.logging.requests) return;
      if (!config.logging.assets && path.startsWith("/mcp-app-assets")) return;

      logEvent(config.logging, "info", "http_request", {
        requestId,
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
        ...requestLogFields(req, config),
      });
    });

    next();
  });

  app.use(
    mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl: new URL(config.publicBaseUrl),
      baseUrl: new URL(config.publicBaseUrl),
      resourceServerUrl,
      scopesSupported: config.oauth.scopes,
      resourceName: "dpkr helix",
    }),
  );

  app.use("/mcp-app-assets", (req, res, next) => {
    if (!isPublicMcpAppAssetPath(req.path)) {
      res.sendStatus(404);
      return;
    }
    next();
  });

  app.options("/mcp-app-assets/{*asset}", (_req, res) => {
    setAssetHeaders(res);
    res.sendStatus(204);
  });

  app.use(
    "/mcp-app-assets",
    express.static(uiBuildDirectory(), {
      immutable: true,
      maxAge: "1y",
      fallthrough: false,
      setHeaders: setAssetHeaders,
    }),
  );

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, name: "devspace" });
  });

  app.all("/mcp", async (req, res) => {
    const requestId = res.locals.requestId as string | undefined;
    const sessionId = req.header("mcp-session-id");
    const initializeRequest = req.method === "POST" && isInitializeRequest(req.body);

    await new Promise<void>((resolve, reject) => {
      bearerAuth(req, res, (error?: unknown) => {
        if (error) reject(error);
        else resolve();
      });
    });
    if (res.headersSent) return;

    if (!req.auth?.resource || !checkResourceAllowed({ requestedResource: req.auth.resource, configuredResource: resourceServerUrl })) {
      logEvent(config.logging, "warn", "auth_denied", {
        requestId,
        method: req.method,
        path: requestPath(req),
        reason: "invalid_oauth_resource",
        ...requestLogFields(req, config),
      });
      sendJsonRpcError(res, 401, -32001, "Unauthorized");
      return;
    }

    logEvent(config.logging, "debug", "mcp_request", {
      requestId,
      method: req.method,
      sessionIdPresent: Boolean(sessionId),
      sessionIdPrefix: sessionIdPrefix(sessionId),
      isInitialize: initializeRequest,
    });

    let activeSessionId: string | undefined;
    try {
      let transport: Transport | undefined;
      let mcpToolProjector: McpToolOperationProjector | undefined;

      if (sessionId) {
        transport = transports.beginRequest(sessionId);
        if (!transport) {
          sendJsonRpcError(res, 404, -32000, "Unknown MCP session");
          return;
        }
        activeSessionId = sessionId;
      } else if (initializeRequest) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            if (transport) {
              transports.register(newSessionId, transport);
              transports.beginRequest(newSessionId);
              activeSessionId = newSessionId;
              trimMcpSessions();
            }
            logEvent(config.logging, "debug", "mcp_session_created", {
              requestId,
              sessionIdPrefix: sessionIdPrefix(newSessionId),
              ...requestLogFields(req, config),
            });
          },
        });

        transport.onclose = () => {
          const closedSessionId = transport?.sessionId;
          if (closedSessionId) mcpToolProjector?.sessionClosed(closedSessionId);
          if (closedSessionId && transports.remove(closedSessionId)) {
            logEvent(config.logging, "info", "mcp_session_closed", {
              reason: "transport_close",
              sessionIdPrefix: sessionIdPrefix(closedSessionId),
            });
          }
        };

        mcpToolProjector = new McpToolOperationProjector(operationRuns, {
          resolveWorkspace: (workspaceId) => {
            const workspace = workspaces.getWorkspace(workspaceId);
            return {
              workspaceId: workspace.id,
              projectId: workspace.project?.id,
            };
          },
          resolveSessionId: () => transport?.sessionId,
          findRunBySource: (kind, source, sourceRunId) =>
            operationStore.findRunBySource(kind, source, sourceRunId),
        });
        const server = createMcpServer(
          config,
          projects,
          workspaces,
          handoffStore,
          reviewCheckpoints,
          processSessions,
          localAgentProviders,
          incomingArtifactAdapters,
          localAgents,
          mcpToolProjector,
          operationStore,
          systemUpdate,
        );
        await server.connect(transport);
      } else {
        sendJsonRpcError(res, 400, -32000, "No valid MCP session");
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logEvent(config.logging, "error", "mcp_request_error", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        sendJsonRpcError(res, 500, -32603, "Internal server error");
      }
    } finally {
      if (activeSessionId) {
        transports.endRequest(activeSessionId);
        trimMcpSessions();
      }
    }
  });

  let closePromise: Promise<void> | undefined;
  return {
    app,
    config,
    localAgentProviders,
    operations: {
      store: operationStore,
      eventBus: operationEventBus,
      requestStop: (runId) =>
        requestOperationStop(runId, operationStore, operationRuns, processSessions),
      resolveWorkspaceRoot: (workspaceId) =>
        workspaces.getWorkspace(workspaceId).root,
    },
    close: () => {
      closePromise ??= (async () => {
        clearInterval(sessionCleanupTimer);
        const results = await transports.closeAll();
        logSessionCloseResults("server_shutdown", results);
        processSessions.shutdown();
        operationStore.close();
        localAgents?.close();
        oauthProvider.close();
        workspaceStore.close?.();
        handoffStore.close?.();
        projectStore.close?.();
      })();
      return closePromise;
    },
  };
}

async function isMainModule(): Promise<boolean> {
  if (!process.argv[1]) return false;

  const modulePath = await realpath(fileURLToPath(import.meta.url));
  const entrypointPath = await realpath(process.argv[1]);
  return modulePath === entrypointPath;
}

if (await isMainModule()) {
  const { app, config, close, localAgentProviders } = createServer();
  const httpServer = app.listen(config.port, config.host, () => {
    console.log(
      `devspace listening on http://${config.host}:${config.port}/mcp`,
    );
    console.log(`allowed roots: ${config.allowedRoots.join(", ")}`);
    console.log("auth: oauth owner-token flow required");
    console.log(`logging: ${config.logging.level} ${config.logging.format}`);
    console.log(`request logging: ${config.logging.requests ? "enabled" : "disabled"}`);
    console.log(`asset logging: ${config.logging.assets ? "enabled" : "disabled"}`);
    console.log(`trust proxy: ${config.logging.trustProxy ? "enabled" : "disabled"}`);
    const artifactDownloadStatus = !config.artifactsEnabled
      ? "disabled"
      : isArtifactDownloadSupportedPlatform()
        ? "enabled"
        : `unsupported on ${process.platform}`;
    console.log(`native artifact download: ${artifactDownloadStatus}`);
    if (config.subagents) {
      console.log(`subagent providers: ${formatLocalAgentProviderAvailabilitySummary(localAgentProviders)}`);
    }
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await shutdownHttpServer(httpServer, close);
    process.exit(0);
  };
  const handleShutdown = () => {
    void shutdown().catch((error) => {
      console.error("devspace shutdown failed", error);
      process.exit(1);
    });
  };
  process.once("SIGINT", handleShutdown);
  process.once("SIGTERM", handleShutdown);
}
