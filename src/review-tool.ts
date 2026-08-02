import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import * as z from "zod/v4";
import type { LocalAgentService } from "./local-agent-service.js";
import { isLocalAgentProvider } from "./local-agent-profiles.js";
import type { OperationEvidence } from "./operations/operation-contracts.js";
import type { OperationStore } from "./operations/operation-store.js";
import { readRepositoryContext } from "./operations/repository-diff.js";
import { authorizeWorkspacePolicyOperation } from "./projects/project-policy.js";
import {
  createReviewBundle,
  formatReviewBundleForPrompt,
  reviewBundleOutputSchema,
} from "./review-bundle.js";
import type { ReviewCheckpointManager } from "./review-checkpoints.js";
import { isSameCanonicalPath } from "./roots.js";
import type { WorkspaceRegistry } from "./workspaces.js";

interface ReviewToolLogFields {
  tool: "show_changes";
  workspaceId: string;
  success: true;
  durationMs: number;
}

export function registerReviewTool(input: {
  server: McpServer;
  workspaces: WorkspaceRegistry;
  reviewCheckpoints: ReviewCheckpointManager;
  toolMeta: { _meta: Record<string, unknown> };
  localAgents?: Pick<LocalAgentService, "getStatus">;
  operationStore?: Pick<OperationStore, "findRunBySource" | "getEvidence">;
  logToolCall?: (fields: ReviewToolLogFields) => void;
}): void {
  registerAppTool(
    input.server,
    "show_changes",
    {
      title: "Show changes",
      description:
        "Show aggregate file changes for an open workspace. If the current turn successfully modified files, call this exactly once after the final related file change and before your final response so the user can inspect the combined diff for the turn. Optionally associate one same-workspace local-agent result to inspect verification freshness.",
      inputSchema: {
        workspaceId: z
          .string()
          .describe("Workspace identifier returned by open_workspace."),
        agentId: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional()
          .describe("Optional same-workspace local-agent identifier for verification evidence."),
      },
      outputSchema: {
        result: z.string(),
        reviewBundle: reviewBundleOutputSchema,
      },
      ...input.toolMeta,
      annotations: { readOnlyHint: true },
    },
    async ({ workspaceId, agentId }) => {
      const startedAt = performance.now();
      const workspace = input.workspaces.getWorkspace(workspaceId);
      authorizeWorkspacePolicyOperation({
        source: workspace.policySource,
        operation: "read",
      });
      const verification = agentId
        ? resolveVerificationEvidence({
            workspaceId,
            workspaceRoot: workspace.root,
            agentId,
            localAgents: input.localAgents,
            operationStore: input.operationStore,
          })
        : {};

      const review = await input.reviewCheckpoints.reviewChanges({
        workspaceId,
        root: workspace.root,
        since: "last_shown",
        markReviewed: true,
      });
      const repositoryContext = await readRepositoryContext(workspace.root);
      const reviewBundle = createReviewBundle({
        review,
        repositoryContext,
        agentId,
        evidence: verification.evidence,
        evidenceMessage: verification.message,
      });
      const content = [
        { type: "text" as const, text: review.result },
        { type: "text" as const, text: formatReviewBundleForPrompt(reviewBundle) },
      ];

      input.logToolCall?.({
        tool: "show_changes",
        workspaceId,
        success: true,
        durationMs: Math.round(performance.now() - startedAt),
      });

      return {
        content,
        _meta: {
          tool: "show_changes",
          card: {
            workspaceId,
            summary: review.summary,
            files: review.files,
            payload: { patch: review.patch },
          },
        },
        structuredContent: {
          result: review.result,
          reviewBundle,
        },
      };
    },
  );
}

function resolveVerificationEvidence(input: {
  workspaceId: string;
  workspaceRoot: string;
  agentId: string;
  localAgents?: Pick<LocalAgentService, "getStatus">;
  operationStore?: Pick<OperationStore, "findRunBySource" | "getEvidence">;
}): { evidence?: OperationEvidence[]; message?: string } {
  if (!input.localAgents || !input.operationStore) {
    throw new Error("Local-agent verification evidence is unavailable.");
  }

  const agent = input.localAgents.getStatus(input.agentId);
  if (
    agent.workspaceId !== input.workspaceId
    || !isSameCanonicalPath(agent.workspaceRoot, input.workspaceRoot)
    || !isLocalAgentProvider(agent.provider)
  ) {
    throw new Error("Local agent does not belong to this workspace.");
  }

  try {
    const run = input.operationStore.findRunBySource(
      "local_agent",
      agent.provider,
      agent.id,
    );
    if (!run) return { evidence: [] };
    if (run.workspaceId !== input.workspaceId) {
      throw new Error("Local-agent operation does not belong to this workspace.");
    }
    return { evidence: input.operationStore.getEvidence(run.id) };
  } catch (error) {
    if (error instanceof Error && /does not belong/.test(error.message)) throw error;
    return { evidence: [], message: "Verification evidence could not be read." };
  }
}
