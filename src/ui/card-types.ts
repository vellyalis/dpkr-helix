import type { App } from "@modelcontextprotocol/ext-apps";

export type ToolName =
  | "list_projects"
  | "open_project"
  | "delegate_task"
  | "get_agent_status"
  | "list_agents"
  | "continue_agent"
  | "open_workspace"
  | "show_changes"
  | "apply_patch"
  | "exec_command"
  | "write_stdin"
  | "read"
  | "write"
  | "edit"
  | "grep"
  | "glob"
  | "ls"
  | "bash";

export type HostContext = NonNullable<ReturnType<App["getHostContext"]>>;

export type PatchOperation = "add" | "update" | "delete" | "move";
export type ProjectOpenMode = "checkout" | "worktree";
export type ReviewFileType =
  | "change"
  | "rename-pure"
  | "rename-changed"
  | "new"
  | "deleted";

export interface WorkspaceWorktreeCardView {
  path?: string;
  baseRef?: string;
  baseSha?: string;
  dirtySource?: boolean;
  detached?: boolean;
  managed?: boolean;
}

export interface WorkspaceAgentProviderCardView {
  name?: string;
  available?: boolean;
  reason?: string;
}

export interface WorkspaceAgentProfileCardView {
  name?: string;
  description?: string;
  provider?: string;
  model?: string;
  thinking?: string;
  providerAvailable?: boolean;
  providerUnavailableReason?: string;
}

export interface WorkspaceHandoffCardView {
  status?: "in_progress" | "blocked" | "ready" | "complete";
  summary?: string;
  completed?: string[];
  nextActions?: string[];
  verification?: string[];
  risks?: string[];
  activeAgents?: string[];
  updatedAt?: string;
}

export interface RepositoryContextCardView {
  state?: "available" | "unavailable";
  refreshedAt?: string;
  branch?: string;
  head?: string;
  dirty?: {
    total?: number;
    returned?: number;
    truncated?: boolean;
  };
  message?: string;
}

export interface ProjectCardView {
  id: string;
  slug: string;
  name: string;
  root: string;
  permissionPreset: "inspect" | "design" | "develop";
  defaultMode: ProjectOpenMode;
  pinned: boolean;
  source: "manual" | "discovered";
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  availability: "available" | "missing" | "not_allowed" | "invalid";
  unavailableReason?: string;
}

export interface AgentCardView {
  id: string;
  workspaceId?: string;
  profileName: string;
  provider: string;
  model?: string;
  thinking?: string;
  status: "starting" | "running" | "idle" | "error" | "stopped";
  latestResponse?: string;
  disposition?: "completed" | "needs_input";
  question?: string;
  error?: string;
  resultAvailable: boolean;
  verificationStatus: "pending" | "not_available";
  createdAt: string;
  updatedAt: string;
}

export interface ToolResultCard {
  tool: ToolName;
  workspaceId?: string;
  path?: string;
  root?: string;
  workspaceReused?: boolean;
  mode?: ProjectOpenMode;
  sourceRoot?: string;
  worktree?: WorkspaceWorktreeCardView;
  status?: string;
  summary?: Record<string, unknown>;
  projects?: ProjectCardView[];
  agents?: AgentCardView[];
  agent?: AgentCardView;
  project?: ProjectCardView | {
    id?: string;
    slug?: string;
    name?: string;
    permissionPreset?: string;
    defaultMode?: string;
  };
  files?: Array<{
    path?: string;
    previousPath?: string;
    operation?: PatchOperation;
    type?: ReviewFileType;
    additions?: number;
    removals?: number;
  }>;
  payload?: ToolPayload;
  agentsFiles?: Array<{
    path?: string;
    content?: string;
  }>;
  availableAgentsFiles?: Array<{
    path?: string;
  }>;
  skills?: Array<{
    name?: string;
    description?: string;
    path?: string;
  }>;
  agentProviders?: WorkspaceAgentProviderCardView[];
  agentProfiles?: WorkspaceAgentProfileCardView[];
  handoff?: WorkspaceHandoffCardView;
  repositoryContext?: RepositoryContextCardView;
  skillDiagnostics?: unknown[];
  instruction?: string;
}

export interface ToolContent {
  type: "text" | "image";
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface ToolPayload {
  content?: ToolContent[];
  diff?: string;
  patch?: string;
}

export function isToolName(value: unknown): value is ToolName {
  return (
    value === "list_projects" ||
    value === "open_project" ||
    value === "delegate_task" ||
    value === "get_agent_status" ||
    value === "list_agents" ||
    value === "continue_agent" ||
    value === "open_workspace" ||
    value === "show_changes" ||
    value === "apply_patch" ||
    value === "exec_command" ||
    value === "write_stdin" ||
    value === "read" ||
    value === "write" ||
    value === "edit" ||
    value === "grep" ||
    value === "glob" ||
    value === "ls" ||
    value === "bash"
  );
}

export function isReadTool(tool: ToolName): boolean {
  return tool === "read";
}

export function isWriteTool(tool: ToolName): boolean {
  return tool === "write";
}

export function isEditTool(tool: ToolName): boolean {
  return tool === "edit";
}

export function isPatchTool(tool: ToolName): boolean {
  return tool === "apply_patch";
}

export function isSearchTool(tool: ToolName): boolean {
  return tool === "grep" || tool === "glob";
}

export function isShellTool(tool: ToolName): boolean {
  return tool === "bash" || tool === "exec_command" || tool === "write_stdin";
}

export function isReviewTool(tool: ToolName): boolean {
  return tool === "show_changes";
}

export function isAgentTool(tool: ToolName): boolean {
  return (
    tool === "delegate_task" ||
    tool === "get_agent_status" ||
    tool === "list_agents" ||
    tool === "continue_agent"
  );
}

export function isToolResultCard(value: unknown): value is Omit<ToolResultCard, "tool"> {
  return Boolean(value && typeof value === "object");
}

export function payloadText(payload: ToolPayload | undefined): string {
  return (
    payload?.content
      ?.map((item) => {
        if (item.type === "text") return item.text ?? "";
        return `[${item.mimeType ?? "image"} image payload]`;
      })
      .filter(Boolean)
      .join("\n\n") ?? ""
  );
}

export function summaryNumber(
  summary: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = summary?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function isExpandableCard(card: ToolResultCard): boolean {
  if (card.tool === "list_projects") return Boolean(card.projects?.length);
  if (card.tool === "open_project") {
    return Boolean(
      card.project
      || card.workspaceId
      || card.worktree
      || card.handoff
      || card.repositoryContext
      || card.payload,
    );
  }
  if (isAgentTool(card.tool)) return Boolean(card.agent || card.agents?.length || card.payload);

  if (card.tool === "open_workspace") {
    return (
      Number(card.summary?.agentsFiles ?? 0) > 0 ||
      Number(card.summary?.skills ?? 0) > 0 ||
      Number(card.summary?.skillDiagnostics ?? 0) > 0 ||
      Boolean(card.agentsFiles?.length) ||
      Boolean(card.availableAgentsFiles?.length) ||
      Boolean(card.skills?.length) ||
      Boolean(card.agentProviders?.length) ||
      Boolean(card.agentProfiles?.length) ||
      Boolean(card.skillDiagnostics?.length) ||
      Boolean(card.worktree) ||
      Boolean(card.handoff) ||
      Boolean(card.repositoryContext) ||
      Boolean(card.instruction)
    );
  }

  if (isReviewTool(card.tool)) return Boolean(card.files?.length || card.payload?.patch);
  if (isPatchTool(card.tool)) return Boolean(card.payload?.patch);

  return Boolean(card.payload);
}

export function isInitiallyExpandedCard(card: ToolResultCard): boolean {
  if (card.tool === "open_workspace") return isExpandableCard(card);
  if (card.tool === "open_project") return isExpandableCard(card);
  if (card.tool === "list_projects" || isAgentTool(card.tool)) {
    return isExpandableCard(card);
  }
  if (isReviewTool(card.tool)) return isExpandableCard(card);
  if (isPatchTool(card.tool)) {
    return card.files?.length === 1 && isExpandableCard(card);
  }
  return false;
}
