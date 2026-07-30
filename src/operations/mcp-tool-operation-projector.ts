import { AsyncLocalStorage } from "node:async_hooks";
import { isAbsolute } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, RequestId } from "@modelcontextprotocol/sdk/types.js";
import type {
  FileChangeOperation,
  OperationEventPayloadMap,
} from "./operation-contracts.js";
import type {
  OperationRunService,
  OperationServiceResult,
} from "./operation-run-service.js";
import type {
  AppendOperationEventInput,
  StoredOperationEvent,
  StoredOperationRun,
} from "./operation-store.js";

const TOOL_PROJECTION = Symbol("devspace.mcp-tool-projection");
const MCP_SESSION_SOURCE_PREFIX = "mcp-session:";
const TERMINAL_STATES = new Set(["completed", "failed", "stopped"]);
const mcpOperationContext = new AsyncLocalStorage<{ runId: string }>();

export interface McpToolFileChange {
  relativePath: string;
  operation: FileChangeOperation;
  previousRelativePath?: string;
}

export interface McpToolResultProjection {
  fileChanges?: McpToolFileChange[];
}

interface ProjectableCallToolResult extends CallToolResult {
  [TOOL_PROJECTION]?: McpToolResultProjection;
}

export interface McpToolWorkspaceContext {
  workspaceId: string;
  projectId?: string;
}

export interface McpToolInvocation {
  toolName: string;
  input: unknown;
  requestId?: RequestId;
}

type OperationRunPort = Pick<
  OperationRunService,
  "recordEvent" | "startRun" | "transitionState"
>;

export interface McpToolOperationProjectorOptions {
  resolveWorkspace?: (workspaceId: string) => McpToolWorkspaceContext | undefined;
  resolveSessionId?: () => string | undefined;
  findRunBySource?: (
    kind: "mcp_tool",
    source: "mcp",
    sourceRunId: string,
  ) => StoredOperationRun | undefined;
  now?: () => string;
  nowMs?: () => number;
}

export class McpToolOperationProjector {
  private readonly resolveWorkspace?: (
    workspaceId: string,
  ) => McpToolWorkspaceContext | undefined;
  private readonly resolveSessionId?: () => string | undefined;
  private readonly findRunBySource?: McpToolOperationProjectorOptions["findRunBySource"];
  private readonly now: () => string;
  private readonly nowMs: () => number;

  constructor(
    private readonly runs: OperationRunPort,
    options: McpToolOperationProjectorOptions = {},
  ) {
    this.resolveWorkspace = options.resolveWorkspace;
    this.resolveSessionId = options.resolveSessionId;
    this.findRunBySource = options.findRunBySource;
    this.now = options.now ?? (() => new Date().toISOString());
    this.nowMs = options.nowMs ?? (() => performance.now());
  }

  async invoke<T extends CallToolResult>(
    invocation: McpToolInvocation,
    handler: () => T | Promise<T>,
  ): Promise<T> {
    const startedAtMs = this.nowMs();
    const projection = this.start(invocation);
    const run = projection?.run;
    if (run) {
      this.safeRecord(run.id, {
        type: "tool.started",
        timestamp: this.now(),
        level: "info",
        summary: "MCP tool invocation started.",
        payload: { toolName: invocation.toolName },
      }, projection.sessionScoped
        ? {
            phase: phaseForTool(invocation.toolName),
            currentAction: currentActionForTool(invocation.toolName),
          }
        : {});
      this.recordInputContext(run.id, invocation);
    }

    let result: T;
    try {
      result = run
        ? await mcpOperationContext.run({ runId: run.id }, handler)
        : await handler();
    } catch (error) {
      if (run) {
        this.recordFailure(
          run.id,
          invocation.toolName,
          projection?.sessionScoped === true,
        );
      }
      throw error;
    }

    if (run) {
      try {
        this.recordResultContext(run.id, invocation.toolName, result);
        this.recordFileChanges(run.id, result);
        if (result.isError === true) {
          this.recordFailure(
            run.id,
            invocation.toolName,
            projection?.sessionScoped === true,
          );
        } else {
          this.safeRecord(run.id, {
            type: "tool.completed",
            timestamp: this.now(),
            level: "info",
            summary: "MCP tool invocation completed.",
            payload: {
              toolName: invocation.toolName,
              durationMs: elapsedMs(startedAtMs, this.nowMs()),
            },
          }, projection?.sessionScoped
            ? { phase: "waiting", currentAction: "Waiting for the MCP client" }
            : {});
          if (!projection?.sessionScoped) this.safeTransition(run.id, "completed");
        }
      } catch {
        // Observability must never change a canonical tool result.
      }
    }

    return result;
  }

  sessionClosed(sessionId: string): void {
    const sourceRunId = mcpSessionSourceRunId(sessionId);
    const run = this.findRunBySource?.("mcp_tool", "mcp", sourceRunId);
    if (!run || TERMINAL_STATES.has(run.state)) return;
    this.safeTransition(run.id, "completed", "mcp_session_closed");
  }

  private start(invocation: McpToolInvocation): {
    run: StoredOperationRun;
    sessionScoped: boolean;
  } | undefined {
    const context = workspaceContextFromInput(invocation.input, this.resolveWorkspace);
    const sessionId = this.resolveSessionId?.();
    const sourceRunId = sessionId ? mcpSessionSourceRunId(sessionId) : undefined;
    try {
      if (sourceRunId) {
        const existing = this.findRunBySource?.("mcp_tool", "mcp", sourceRunId);
        if (existing && !TERMINAL_STATES.has(existing.state)) {
          return { run: existing, sessionScoped: true };
        }
      }
      const result = this.runs.startRun({
        kind: "mcp_tool",
        source: "mcp",
        sourceRunId,
        workspaceId: context?.workspaceId,
        projectId: context?.projectId,
        title: sourceRunId
          ? "MCP client activity"
          : `MCP tool ${invocation.toolName}`,
        state: "running",
        assuranceStage: "not_applicable",
        phase: phaseForTool(invocation.toolName),
        currentAction: currentActionForTool(invocation.toolName),
      });
      return result.ok
        ? { run: result.value, sessionScoped: sourceRunId !== undefined }
        : undefined;
    } catch {
      return undefined;
    }
  }

  private recordInputContext(
    runId: string,
    invocation: McpToolInvocation,
  ): void {
    if (invocation.toolName !== "read") return;
    const path = asRecord(invocation.input)?.path;
    if (typeof path !== "string" || !safeRelativePath(path)) return;
    this.safeRecord(runId, {
      type: "file.read",
      timestamp: this.now(),
      level: "info",
      summary: "Workspace file read.",
      payload: { relativePath: path },
    });
  }

  private recordResultContext(
    runId: string,
    toolName: string,
    result: CallToolResult,
  ): void {
    if (
      result.isError === true
      || (toolName !== "open_workspace" && toolName !== "open_project")
    ) {
      return;
    }
    const structured = asRecord(result.structuredContent);
    const workspaceId =
      typeof structured?.workspaceId === "string"
        ? structured.workspaceId
        : undefined;
    const mode =
      structured?.mode === "checkout" || structured?.mode === "worktree"
        ? structured.mode
        : undefined;
    if (!workspaceId || !mode) return;
    const project = asRecord(structured?.project);
    const projectId = typeof project?.id === "string" ? project.id : undefined;
    this.safeRecord(
      runId,
      {
        type: "workspace.opened",
        timestamp: this.now(),
        level: "info",
        summary: "Workspace opened.",
        payload: { workspaceId, projectId, mode },
      },
      { workspaceId, projectId },
    );
  }

  private recordFileChanges(runId: string, result: CallToolResult): void {
    const projection = (result as ProjectableCallToolResult)[TOOL_PROJECTION];
    for (const change of projection?.fileChanges ?? []) {
      this.safeRecord(runId, {
        type: "file.changed",
        timestamp: this.now(),
        level: "info",
        summary: "Workspace file changed.",
        payload: {
          relativePath: change.relativePath,
          operation: change.operation,
          previousRelativePath: change.previousRelativePath,
        },
      });
    }
  }

  private recordFailure(
    runId: string,
    toolName: string,
    sessionScoped = false,
  ): void {
    this.safeRecord(runId, {
      type: "tool.failed",
      timestamp: this.now(),
      level: "error",
      summary: "MCP tool invocation failed.",
      payload: {
        toolName,
        failureCode: "tool_failed",
      },
    });
    if (!sessionScoped) this.safeTransition(runId, "failed", "tool_failed");
    else {
      this.safeRecord(runId, {
        type: "warning",
        timestamp: this.now(),
        level: "warning",
        summary: "The MCP client may continue after the failed tool call.",
        payload: { code: "mcp_tool_failed" },
      }, { phase: "waiting", currentAction: "Waiting for the MCP client" });
    }
  }

  private safeRecord<T extends keyof OperationEventPayloadMap>(
    runId: string,
    event: AppendOperationEventInput<T>,
    projection: {
      workspaceId?: string;
      projectId?: string;
      phase?: string;
      currentAction?: string;
    } = {},
  ): OperationServiceResult<StoredOperationEvent<T | "warning">> | undefined {
    try {
      return this.runs.recordEvent(runId, event, projection);
    } catch {
      return undefined;
    }
  }

  private safeTransition(
    runId: string,
    state: "completed" | "failed",
    reasonCode?: string,
  ): void {
    try {
      this.runs.transitionState(runId, state, reasonCode);
    } catch {
      // Projection must not change the canonical MCP tool result.
    }
  }
}

export function currentMcpOperationRunId(): string | undefined {
  return mcpOperationContext.getStore()?.runId;
}

export function mcpSessionSourceRunId(sessionId: string): string {
  return `${MCP_SESSION_SOURCE_PREFIX}${sessionId}`;
}

export function mcpSessionIdFromSourceRunId(
  sourceRunId: string | undefined,
): string | undefined {
  if (!sourceRunId?.startsWith(MCP_SESSION_SOURCE_PREFIX)) return undefined;
  const sessionId = sourceRunId.slice(MCP_SESSION_SOURCE_PREFIX.length);
  return sessionId || undefined;
}

export function attachMcpToolResultProjection<T extends CallToolResult>(
  result: T,
  projection: McpToolResultProjection,
): T {
  try {
    Object.defineProperty(result, TOOL_PROJECTION, {
      value: projection,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  } catch {
    // Projection metadata must never change a canonical tool result.
  }
  return result;
}

export function installMcpToolOperationProjection(
  server: McpServer,
  projector: McpToolOperationProjector,
): void {
  const registerTool = server.registerTool.bind(server);
  server.registerTool = ((
    name: string,
    config: unknown,
    handler: unknown,
  ) => {
    if (typeof handler !== "function") {
      return registerTool(name, config as never, handler as never);
    }
    const wrapped = (...parameters: unknown[]) => {
      const input = parameters[0];
      const extra = asRecord(parameters[1]);
      return projector.invoke(
        {
          toolName: name,
          input,
          requestId: isRequestId(extra?.requestId) ? extra.requestId : undefined,
        },
        () => handler(...parameters) as CallToolResult | Promise<CallToolResult>,
      );
    };
    return registerTool(name, config as never, wrapped as never);
  }) as McpServer["registerTool"];
}

function workspaceContextFromInput(
  input: unknown,
  resolveWorkspace:
    | ((workspaceId: string) => McpToolWorkspaceContext | undefined)
    | undefined,
): McpToolWorkspaceContext | undefined {
  const workspaceId = asRecord(input)?.workspaceId;
  if (typeof workspaceId !== "string" || !resolveWorkspace) return undefined;
  try {
    return resolveWorkspace(workspaceId);
  } catch {
    return undefined;
  }
}

function elapsedMs(startedAtMs: number, finishedAtMs: number): number {
  return Math.max(0, Math.round(finishedAtMs - startedAtMs));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function isRequestId(value: unknown): value is RequestId {
  return typeof value === "number" || typeof value === "string";
}

function safeRelativePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return path.length > 0
    && Buffer.byteLength(path, "utf8") <= 1_024
    && !isAbsolute(path)
    && !normalized.split("/").includes("..");
}

function phaseForTool(toolName: string): string {
  if (toolName === "write" || toolName === "edit" || toolName === "apply_patch") {
    return "editing";
  }
  if (toolName === "exec_command" || toolName === "bash" || toolName === "write_stdin") {
    return "executing";
  }
  return "inspecting";
}

function currentActionForTool(toolName: string): string {
  if (toolName === "write" || toolName === "edit" || toolName === "apply_patch") {
    return `Editing through ${toolName}`;
  }
  if (toolName === "exec_command" || toolName === "bash" || toolName === "write_stdin") {
    return `Running ${toolName}`;
  }
  return `Using ${toolName}`;
}
