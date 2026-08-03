import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  SYSTEM_UPDATE_PHASES,
  type SystemUpdateController,
  type SystemUpdateStatus,
} from "./system-update.js";

export const SYSTEM_UPDATE_TOOL_NAMES = {
  status: "get_dpkr_helix_update_status",
  apply: "update_dpkr_helix",
} as const;

const STATUS_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const APPLY_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

const SYSTEM_UPDATE_STATUS_SCOPES = [
  "installation",
  "current_attempt",
  "last_attempt",
] as const;

type PresentedSystemUpdateStatus = SystemUpdateStatus & {
  statusScope: typeof SYSTEM_UPDATE_STATUS_SCOPES[number];
  canRequestUpdate: boolean;
};

const statusOutputSchema = z.object({
  available: z.boolean(),
  phase: z.enum(SYSTEM_UPDATE_PHASES),
  active: z.boolean(),
  statusScope: z.enum(SYSTEM_UPDATE_STATUS_SCOPES),
  canRequestUpdate: z.boolean(),
  message: z.string(),
  requestId: z.string().optional(),
  fromCommit: z.string().optional(),
  targetCommit: z.string().optional(),
  startedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  completedAt: z.string().optional(),
  code: z.string().optional(),
});

interface SystemUpdateToolLog {
  tool: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

export function registerSystemUpdateTools(
  server: McpServer,
  systemUpdate: SystemUpdateController,
  log: (fields: SystemUpdateToolLog) => void,
): void {
  registerAppTool(
    server,
    SYSTEM_UPDATE_TOOL_NAMES.status,
    {
      title: "Get dpkr helix update status",
      description:
        "Read the sanitized state of the most recent dpkr helix self-update. Terminal phases and codes describe only that historical attempt, not the current source state. If the user explicitly asks to update and canRequestUpdate is true, call update_dpkr_helix even after a rejected attempt; it runs fresh preflight checks. Use this after reconnecting from an update or when the user asks whether an update completed. It never returns credentials or local source paths.",
      inputSchema: {},
      outputSchema: statusOutputSchema,
      _meta: {},
      annotations: STATUS_TOOL_ANNOTATIONS,
    },
    async () => {
      const startedAt = performance.now();
      const status = presentStatus(await systemUpdate.getStatus());
      log({
        tool: SYSTEM_UPDATE_TOOL_NAMES.status,
        success: true,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return {
        content: [{ type: "text" as const, text: formatStatus(status) }],
        structuredContent: status,
      };
    },
  );

  registerAppTool(
    server,
    SYSTEM_UPDATE_TOOL_NAMES.apply,
    {
      title: "Update dpkr helix",
      description:
        "Apply the latest verified origin/main to this managed Windows installation. Call only after the user explicitly asks to update dpkr helix. A new request rechecks current preflight conditions even when the last recorded attempt was rejected. The updater rejects dirty, non-main, diverged, or noncanonical source; verifies the candidate before stopping the current service; runs without a visible console; and rolls back the previous installation if deployment fails. The MCP connection may reconnect once after verified apply begins.",
      inputSchema: {},
      outputSchema: z.object({
        accepted: z.boolean(),
        requestId: z.string(),
        status: statusOutputSchema,
        message: z.string(),
      }),
      _meta: {},
      annotations: APPLY_TOOL_ANNOTATIONS,
    },
    async () => {
      const startedAt = performance.now();
      try {
        const result = await systemUpdate.requestUpdate();
        const presentedResult = {
          ...result,
          status: presentStatus(result.status),
        };
        log({
          tool: SYSTEM_UPDATE_TOOL_NAMES.apply,
          success: true,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return {
          content: [{ type: "text" as const, text: result.message }],
          structuredContent: presentedResult,
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown updater error";
        const message = "The managed update request could not be started. Check local dpkr helix logs, then retry.";
        log({
          tool: SYSTEM_UPDATE_TOOL_NAMES.apply,
          success: false,
          durationMs: Math.round(performance.now() - startedAt),
          error: detail,
        });
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );
}

function presentStatus(status: SystemUpdateStatus): PresentedSystemUpdateStatus {
  return {
    ...status,
    statusScope: status.active
      ? "current_attempt"
      : status.phase === "idle"
        ? "installation"
        : "last_attempt",
    canRequestUpdate: status.available && !status.active,
  };
}

function formatStatus(status: PresentedSystemUpdateStatus): string {
  const lines = [
    status.statusScope === "last_attempt"
      ? `dpkr helix last update attempt: ${status.phase}`
      : `dpkr helix update: ${status.phase}`,
    status.message,
  ];
  if (status.statusScope === "last_attempt") {
    lines.push("This is a historical result and does not report the current source state.");
  }
  lines.push(`Can start a new update request: ${status.canRequestUpdate ? "yes" : "no"}`);
  if (status.statusScope === "last_attempt" && status.canRequestUpdate) {
    lines.push("A new explicit update request will run current preflight checks.");
  }
  if (status.fromCommit) lines.push(`From: ${status.fromCommit}`);
  if (status.targetCommit) lines.push(`Target: ${status.targetCommit}`);
  if (status.code) {
    lines.push(`${status.statusScope === "last_attempt" ? "Last attempt code" : "Code"}: ${status.code}`);
  }
  return lines.join("\n");
}
