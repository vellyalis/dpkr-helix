import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const workspaceSessions = sqliteTable(
  "workspace_sessions",
  {
    id: text("id").primaryKey(),
    root: text("root").notNull(),
    projectId: text("project_id"),
    status: text("status").notNull().default("active"),
    mode: text("mode").notNull().default("checkout"),
    sourceRoot: text("source_root"),
    baseRef: text("base_ref"),
    baseSha: text("base_sha"),
    managed: text("managed").notNull().default("false"),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at").notNull(),
  },
  (table) => [
    index("workspace_sessions_root_idx").on(table.root, table.lastUsedAt),
    index("workspace_sessions_status_idx").on(table.status, table.lastUsedAt),
  ],
);

export const workspaceHandoffs = sqliteTable("workspace_handoffs", {
  rootKey: text("root_key").primaryKey(),
  root: text("root").notNull(),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
  completedJson: text("completed_json").notNull(),
  nextActionsJson: text("next_actions_json").notNull(),
  verificationJson: text("verification_json").notNull(),
  risksJson: text("risks_json").notNull(),
  activeAgentsJson: text("active_agents_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const registeredProjects = sqliteTable(
  "registered_projects",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    root: text("root").notNull(),
    rootKey: text("root_key").notNull().unique(),
    permissionPreset: text("permission_preset").notNull().default("develop"),
    defaultMode: text("default_mode").notNull().default("checkout"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    source: text("source").notNull().default("manual"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastOpenedAt: text("last_opened_at"),
  },
  (table) => [
    index("registered_projects_pinned_last_opened_idx").on(
      table.pinned,
      table.lastOpenedAt,
      table.name,
    ),
  ],
);

export const loadedAgentFiles = sqliteTable(
  "loaded_agent_files",
  {
    workspaceSessionId: text("workspace_session_id")
      .notNull()
      .references(() => workspaceSessions.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    contentHash: text("content_hash").notNull(),
    content: text("content").notNull(),
    loadedAt: text("loaded_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceSessionId, table.path] }),
    index("loaded_agent_files_path_idx").on(table.path),
  ],
);

export const workspaceConversationBindings = sqliteTable(
  "workspace_conversation_bindings",
  {
    conversationScopeId: text("conversation_scope_id").notNull(),
    targetKey: text("target_key").notNull(),
    workspaceSessionId: text("workspace_session_id")
      .notNull()
      .references(() => workspaceSessions.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationScopeId, table.targetKey] }),
    index("workspace_conversation_bindings_workspace_idx").on(table.workspaceSessionId),
  ],
);

export const oauthClients = sqliteTable(
  "oauth_clients",
  {
    clientId: text("client_id").primaryKey(),
    clientJson: text("client_json").notNull(),
    issuedAt: integer("issued_at").notNull(),
  },
);

export const oauthAccessTokens = sqliteTable(
  "oauth_access_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    scopesJson: text("scopes_json").notNull(),
    expiresAt: integer("expires_at").notNull(),
    resource: text("resource"),
  },
);

export const oauthRefreshTokens = sqliteTable(
  "oauth_refresh_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    scopesJson: text("scopes_json").notNull(),
    expiresAt: integer("expires_at").notNull(),
    resource: text("resource"),
  },
);

export const localAgentSessions = sqliteTable(
  "local_agent_sessions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    workspaceRoot: text("workspace_root").notNull(),
    profileName: text("profile_name").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    thinking: text("thinking"),
    providerSessionId: text("provider_session_id"),
    status: text("status").notNull(),
    latestResponse: text("latest_response"),
    disposition: text("disposition"),
    question: text("question"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("local_agent_sessions_workspace_id_idx").on(table.workspaceId, table.updatedAt),
    index("local_agent_sessions_workspace_root_idx").on(table.workspaceRoot, table.updatedAt),
    index("local_agent_sessions_provider_session_id_idx").on(table.providerSessionId),
  ],
);

export const operationRuns = sqliteTable(
  "operation_runs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    source: text("source").notNull(),
    sourceRunId: text("source_run_id"),
    parentRunId: text("parent_run_id"),
    projectId: text("project_id"),
    workspaceId: text("workspace_id"),
    goalId: text("goal_id"),
    title: text("title").notNull(),
    state: text("state").notNull(),
    assuranceStage: text("assurance_stage").notNull(),
    phase: text("phase"),
    currentAction: text("current_action"),
    startedAt: text("started_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    finishedAt: text("finished_at"),
    stoppable: integer("stoppable", { mode: "boolean" }).notNull().default(false),
    failureCode: text("failure_code"),
    failureSummary: text("failure_summary"),
    latestSequence: integer("latest_sequence").notNull().default(0),
    retainedEventCount: integer("retained_event_count").notNull().default(0),
    retainedPayloadBytes: integer("retained_payload_bytes").notNull().default(0),
    historyTruncated: integer("history_truncated", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    index("operation_runs_source_reference_idx").on(
      table.kind,
      table.source,
      table.sourceRunId,
      table.updatedAt,
    ),
    index("operation_runs_state_updated_idx").on(table.state, table.updatedAt),
    index("operation_runs_project_updated_idx").on(table.projectId, table.updatedAt),
  ],
);

export const operationEvents = sqliteTable(
  "operation_events",
  {
    cursor: integer("cursor").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => operationRuns.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    timestamp: text("timestamp").notNull(),
    level: text("level").notNull(),
    summary: text("summary").notNull(),
    payloadJson: text("payload_json").notNull(),
    payloadBytes: integer("payload_bytes").notNull(),
  },
  (table) => [
    uniqueIndex("operation_events_run_sequence_unique_idx").on(table.runId, table.sequence),
  ],
);

export const operationEvidence = sqliteTable(
  "operation_evidence",
  {
    runId: text("run_id")
      .notNull()
      .references(() => operationRuns.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    state: text("state").notNull(),
    timestamp: text("timestamp"),
    sourceEventSequence: integer("source_event_sequence"),
    summary: text("summary"),
    basisFingerprint: text("basis_fingerprint"),
  },
  (table) => [primaryKey({ columns: [table.runId, table.type] })],
);

export type WorkspaceSessionRow = typeof workspaceSessions.$inferSelect;
export type NewWorkspaceSessionRow = typeof workspaceSessions.$inferInsert;
export type WorkspaceHandoffRow = typeof workspaceHandoffs.$inferSelect;
export type NewWorkspaceHandoffRow = typeof workspaceHandoffs.$inferInsert;
export type RegisteredProjectRow = typeof registeredProjects.$inferSelect;
export type NewRegisteredProjectRow = typeof registeredProjects.$inferInsert;
export type LoadedAgentFileRow = typeof loadedAgentFiles.$inferSelect;
export type NewLoadedAgentFileRow = typeof loadedAgentFiles.$inferInsert;
export type WorkspaceConversationBindingRow = typeof workspaceConversationBindings.$inferSelect;
export type NewWorkspaceConversationBindingRow = typeof workspaceConversationBindings.$inferInsert;
export type LocalAgentSessionRow = typeof localAgentSessions.$inferSelect;
export type NewLocalAgentSessionRow = typeof localAgentSessions.$inferInsert;
export type OperationRunRow = typeof operationRuns.$inferSelect;
export type NewOperationRunRow = typeof operationRuns.$inferInsert;
export type OperationEventRow = typeof operationEvents.$inferSelect;
export type NewOperationEventRow = typeof operationEvents.$inferInsert;
export type OperationEvidenceRow = typeof operationEvidence.$inferSelect;
export type NewOperationEvidenceRow = typeof operationEvidence.$inferInsert;
