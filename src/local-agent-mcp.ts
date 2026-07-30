import * as z from "zod/v4";
import type { LocalAgentRecord } from "./local-agent-store.js";

export const LOCAL_AGENT_READ_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const LOCAL_AGENT_RUN_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;

export interface LocalAgentView {
  id: string;
  workspaceId?: string;
  profileName: string;
  provider: string;
  model?: string;
  thinking?: string;
  status: LocalAgentRecord["status"];
  latestResponse?: string;
  error?: string;
  resultAvailable: boolean;
  verificationStatus: "pending" | "not_available";
  createdAt: string;
  updatedAt: string;
}

export const localAgentViewOutputSchema = z.object({
  id: z.string(),
  workspaceId: z.string().optional(),
  profileName: z.string(),
  provider: z.string(),
  model: z.string().optional(),
  thinking: z.string().optional(),
  status: z.enum(["starting", "running", "idle", "error", "stopped"]),
  latestResponse: z.string().optional(),
  error: z.string().optional(),
  resultAvailable: z.boolean(),
  verificationStatus: z.enum(["pending", "not_available"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function createLocalAgentActionOutput(
  action: "started" | "continued" | "status",
  record: LocalAgentRecord,
): { result: string; agent: LocalAgentView } {
  const agent = toLocalAgentView(record, true);
  const verb = action === "started"
    ? "Started"
    : action === "continued"
      ? "Continued"
      : "Agent";
  return {
    result: [
      `${verb} local agent ${agent.id}.`,
      formatLocalAgentLine(agent),
      agent.latestResponse,
      agent.error ? `Error: ${agent.error}` : undefined,
      agent.resultAvailable ? "Result available — verification pending." : undefined,
    ].filter((line): line is string => Boolean(line)).join("\n"),
    agent,
  };
}

export function createLocalAgentListOutput(
  records: LocalAgentRecord[],
): {
  result: string;
  agents: LocalAgentView[];
  summary: { total: number; active: number; resultAvailable: number };
} {
  const agents = records.map((record) => toLocalAgentView(record, false));
  const summary = {
    total: agents.length,
    active: agents.filter((agent) => agent.status === "starting" || agent.status === "running").length,
    resultAvailable: agents.filter((agent) => agent.resultAvailable).length,
  };
  return {
    result: agents.length === 0
      ? "No local-agent sessions found for this workspace."
      : [
          `Local-agent sessions (${agents.length}):`,
          ...agents.map(formatLocalAgentLine),
        ].join("\n"),
    agents,
    summary,
  };
}

function toLocalAgentView(
  record: LocalAgentRecord,
  includeOutput: boolean,
): LocalAgentView {
  const resultAvailable = Boolean(record.latestResponse);
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    profileName: record.profileName,
    provider: record.provider,
    model: record.model,
    thinking: record.thinking,
    status: record.status,
    latestResponse: includeOutput ? record.latestResponse : undefined,
    error: includeOutput ? record.error : undefined,
    resultAvailable,
    verificationStatus: resultAvailable ? "pending" : "not_available",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function formatLocalAgentLine(agent: LocalAgentView): string {
  const model = agent.model ? ` model=${agent.model}` : "";
  const thinking = agent.thinking ? ` thinking=${agent.thinking}` : "";
  return `${agent.id} ${agent.status} ${agent.profileName} (${agent.provider}${model}${thinking})`;
}
