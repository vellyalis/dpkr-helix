import { eq } from "drizzle-orm";
import { openDatabase, type DatabaseHandle } from "./db/client.js";
import {
  workspaceHandoffs,
  type WorkspaceHandoffRow,
} from "./db/schema.js";
import { createProjectRootKey } from "./projects/project-registry.js";
import { assertNoForbiddenSensitiveContent } from "./sensitive-content.js";

export const WORKSPACE_HANDOFF_STATUSES = [
  "in_progress",
  "blocked",
  "ready",
  "complete",
] as const;

export type WorkspaceHandoffStatus = (typeof WORKSPACE_HANDOFF_STATUSES)[number];

export interface WorkspaceHandoff {
  root: string;
  status: WorkspaceHandoffStatus;
  summary: string;
  completed: string[];
  nextActions: string[];
  verification: string[];
  risks: string[];
  activeAgents: string[];
  updatedAt: string;
}

export interface WorkspaceHandoffInput {
  status: WorkspaceHandoffStatus;
  summary: string;
  completed?: string[];
  nextActions?: string[];
  verification?: string[];
  risks?: string[];
  activeAgents?: string[];
}

export interface WorkspaceHandoffStore {
  get(root: string): WorkspaceHandoff | undefined;
  upsert(root: string, input: WorkspaceHandoffInput): WorkspaceHandoff;
  close?(): void;
}

export const DEVSPACE_SESSION_CONTINUITY_INSTRUCTION =
  "Use timeout-resistant work units: keep each inspection, edit, test, build, agent poll, and review step narrow; run independent verification commands separately; and use process sessions plus short polls for genuinely long commands. Before starting work, reconcile the returned handoff with Git, code, configuration, and current test evidence, then continue from its nextActions instead of restarting. After every meaningful completed or interrupted work unit, and again before the final response, call update_handoff with the exact completed work, verification, active agent IDs, risks, and next actions. Never store secrets, credentials, file contents, or full chat transcripts in a handoff.";

export class SqliteWorkspaceHandoffStore implements WorkspaceHandoffStore {
  private readonly database: DatabaseHandle;

  constructor(
    stateDir: string,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {
    this.database = openDatabase(stateDir);
  }

  get(root: string): WorkspaceHandoff | undefined {
    const rootKey = createProjectRootKey(root, this.platform);
    const row = this.database.db
      .select()
      .from(workspaceHandoffs)
      .where(eq(workspaceHandoffs.rootKey, rootKey))
      .get();

    return row ? rowToWorkspaceHandoff(row) : undefined;
  }

  upsert(root: string, input: WorkspaceHandoffInput): WorkspaceHandoff {
    assertSafeWorkspaceHandoff(input);
    const rootKey = createProjectRootKey(root, this.platform);
    const existing = this.get(root);
    const updatedAt = new Date().toISOString();
    const completed = input.completed ?? existing?.completed ?? [];
    const nextActions = input.nextActions ?? existing?.nextActions ?? [];
    const verification = input.verification ?? existing?.verification ?? [];
    const risks = input.risks ?? existing?.risks ?? [];
    const activeAgents = input.activeAgents ?? existing?.activeAgents ?? [];
    const values = {
      rootKey,
      root,
      status: input.status,
      summary: input.summary.trim(),
      completedJson: JSON.stringify(completed),
      nextActionsJson: JSON.stringify(nextActions),
      verificationJson: JSON.stringify(verification),
      risksJson: JSON.stringify(risks),
      activeAgentsJson: JSON.stringify(activeAgents),
      updatedAt,
    };

    this.database.db
      .insert(workspaceHandoffs)
      .values(values)
      .onConflictDoUpdate({
        target: workspaceHandoffs.rootKey,
        set: {
          root: values.root,
          status: values.status,
          summary: values.summary,
          completedJson: values.completedJson,
          nextActionsJson: values.nextActionsJson,
          verificationJson: values.verificationJson,
          risksJson: values.risksJson,
          activeAgentsJson: values.activeAgentsJson,
          updatedAt: values.updatedAt,
        },
      })
      .run();

    return {
      root,
      status: input.status,
      summary: values.summary,
      completed,
      nextActions,
      verification,
      risks,
      activeAgents,
      updatedAt,
    };
  }

  close(): void {
    this.database.close();
  }
}

export function createWorkspaceHandoffStore(
  stateDir: string,
  platform: NodeJS.Platform = process.platform,
): WorkspaceHandoffStore {
  return new SqliteWorkspaceHandoffStore(stateDir, platform);
}

export function formatWorkspaceHandoffForPrompt(handoff: WorkspaceHandoff): string {
  const lines = [
    `Persistent handoff updated ${handoff.updatedAt} (${handoff.status}).`,
    `Summary: ${handoff.summary || "No summary recorded."}`,
    formatList("Completed", handoff.completed),
    formatList("Next actions", handoff.nextActions),
    formatList("Verification", handoff.verification),
    formatList("Risks", handoff.risks),
    formatList("Active agents", handoff.activeAgents),
    "Treat this handoff as a resume aid, not as ground truth: reconcile it with the repository before acting.",
  ];

  return lines.filter(Boolean).join("\n");
}

function rowToWorkspaceHandoff(row: WorkspaceHandoffRow): WorkspaceHandoff {
  if (!WORKSPACE_HANDOFF_STATUSES.includes(row.status as WorkspaceHandoffStatus)) {
    throw new Error(`Invalid persisted workspace handoff status: ${row.status}`);
  }

  return {
    root: row.root,
    status: row.status as WorkspaceHandoffStatus,
    summary: row.summary,
    completed: parseStringArray(row.completedJson, "completed_json"),
    nextActions: parseStringArray(row.nextActionsJson, "next_actions_json"),
    verification: parseStringArray(row.verificationJson, "verification_json"),
    risks: parseStringArray(row.risksJson, "risks_json"),
    activeAgents: parseStringArray(row.activeAgentsJson, "active_agents_json"),
    updatedAt: row.updatedAt,
  };
}

function parseStringArray(value: string, column: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid persisted workspace handoff ${column}`, { cause: error });
  }

  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid persisted workspace handoff ${column}`);
  }

  return parsed;
}

function assertSafeWorkspaceHandoff(input: WorkspaceHandoffInput): void {
  const fields: Array<[string, string]> = [
    ["summary", input.summary],
    ...toNamedValues("completed", input.completed),
    ...toNamedValues("nextActions", input.nextActions),
    ...toNamedValues("verification", input.verification),
    ...toNamedValues("risks", input.risks),
    ...toNamedValues("activeAgents", input.activeAgents),
  ];

  assertNoForbiddenSensitiveContent("Workspace handoff", fields);
}

function toNamedValues(name: string, values: string[] | undefined): Array<[string, string]> {
  return (values ?? []).map((value, index) => [`${name}[${index}]`, value]);
}

function formatList(label: string, values: string[]): string {
  return values.length > 0 ? `${label}: ${values.join(" | ")}` : "";
}
