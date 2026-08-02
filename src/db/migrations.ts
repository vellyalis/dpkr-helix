import type Database from "better-sqlite3";

interface Migration {
  version: number;
  name: string;
  up(sqlite: Database.Database): void;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: "workspace-state",
    up: migrateWorkspaceState,
  },
  {
    version: 2,
    name: "oauth-state",
    up: migrateOAuthState,
  },
  {
    version: 3,
    name: "local-agent-sessions",
    up: migrateLocalAgentSessions,
  },
  {
    version: 4,
    name: "registered-projects",
    up: migrateRegisteredProjects,
  },
  {
    version: 5,
    name: "workspace-handoffs",
    up: migrateWorkspaceHandoffs,
  },
  {
    version: 6,
    name: "operation-projection",
    up: migrateOperationProjection,
  },
  {
    version: 7,
    name: "verification-basis-fingerprint",
    up: migrateVerificationBasisFingerprint,
  },
];

export const LATEST_SCHEMA_VERSION = migrations.at(-1)?.version ?? 0;

export function migrateDatabase(sqlite: Database.Database): void {
  const migrate = sqlite.transaction(() => {
    sqlite.exec(`
      create table if not exists devspace_schema_migrations (
        version integer primary key,
        name text not null,
        applied_at text not null
      );
    `);

    const applied = new Set(
      (
        sqlite.prepare("select version from devspace_schema_migrations").all() as Array<{
          version: number;
        }>
      ).map((row) => row.version),
    );
    const recordMigration = sqlite.prepare(
      "insert into devspace_schema_migrations (version, name, applied_at) values (?, ?, ?)",
    );

    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      migration.up(sqlite);
      recordMigration.run(migration.version, migration.name, new Date().toISOString());
    }
  });

  migrate.immediate();
}

function migrateWorkspaceState(sqlite: Database.Database): void {
  sqlite.exec(`
    create table if not exists workspace_sessions (
      id text primary key,
      root text not null,
      status text not null default 'active',
      mode text not null default 'checkout',
      source_root text,
      base_ref text,
      base_sha text,
      managed text not null default 'false',
      created_at text not null,
      last_used_at text not null
    );

    create index if not exists workspace_sessions_root_idx
      on workspace_sessions(root, last_used_at desc);

    create index if not exists workspace_sessions_status_idx
      on workspace_sessions(status, last_used_at desc);

    create table if not exists loaded_agent_files (
      workspace_session_id text not null,
      path text not null,
      content_hash text not null,
      content text not null,
      loaded_at text not null,
      last_seen_at text not null,
      primary key (workspace_session_id, path),
      foreign key (workspace_session_id)
        references workspace_sessions(id)
        on delete cascade
    );

    create index if not exists loaded_agent_files_path_idx
      on loaded_agent_files(path);
  `);

  addColumnIfMissing(sqlite, "workspace_sessions", "mode", "text not null default 'checkout'");
  addColumnIfMissing(sqlite, "workspace_sessions", "source_root", "text");
  addColumnIfMissing(sqlite, "workspace_sessions", "base_ref", "text");
  addColumnIfMissing(sqlite, "workspace_sessions", "base_sha", "text");
  addColumnIfMissing(sqlite, "workspace_sessions", "managed", "text not null default 'false'");
}

function migrateOAuthState(sqlite: Database.Database): void {
  sqlite.exec(`
    create table if not exists oauth_clients (
      client_id text primary key,
      client_json text not null,
      issued_at integer not null
    );

    create index if not exists oauth_clients_issued_at_idx
      on oauth_clients(issued_at desc);

    create table if not exists oauth_access_tokens (
      token_hash text primary key,
      client_id text not null,
      scopes_json text not null,
      expires_at integer not null,
      resource text,
      foreign key (client_id) references oauth_clients(client_id) on delete cascade
    );

    create index if not exists oauth_access_tokens_client_id_idx
      on oauth_access_tokens(client_id);

    create index if not exists oauth_access_tokens_expires_at_idx
      on oauth_access_tokens(expires_at);

    create table if not exists oauth_refresh_tokens (
      token_hash text primary key,
      client_id text not null,
      scopes_json text not null,
      expires_at integer not null,
      resource text,
      foreign key (client_id) references oauth_clients(client_id) on delete cascade
    );

    create index if not exists oauth_refresh_tokens_client_id_idx
      on oauth_refresh_tokens(client_id);

    create index if not exists oauth_refresh_tokens_expires_at_idx
      on oauth_refresh_tokens(expires_at);
  `);
}

function migrateRegisteredProjects(sqlite: Database.Database): void {
  sqlite.exec(`
    create table if not exists registered_projects (
      id text primary key,
      slug text not null unique,
      name text not null,
      root text not null,
      root_key text not null unique,
      permission_preset text not null default 'develop',
      default_mode text not null default 'checkout',
      pinned integer not null default 0,
      source text not null default 'manual',
      created_at text not null,
      updated_at text not null,
      last_opened_at text
    );

    create index if not exists registered_projects_pinned_last_opened_idx
      on registered_projects(pinned desc, last_opened_at desc, name asc);
  `);

  addColumnIfMissing(sqlite, "workspace_sessions", "project_id", "text");
}

function migrateWorkspaceHandoffs(sqlite: Database.Database): void {
  sqlite.exec(`
    create table if not exists workspace_handoffs (
      root_key text primary key,
      root text not null,
      status text not null,
      summary text not null,
      completed_json text not null,
      next_actions_json text not null,
      verification_json text not null,
      risks_json text not null,
      active_agents_json text not null,
      updated_at text not null
    );
  `);
}

function migrateOperationProjection(sqlite: Database.Database): void {
  sqlite.exec(`
    create table if not exists operation_runs (
      id text primary key,
      kind text not null,
      source text not null,
      source_run_id text,
      parent_run_id text,
      project_id text,
      workspace_id text,
      goal_id text,
      title text not null,
      state text not null,
      assurance_stage text not null,
      phase text,
      current_action text,
      started_at text not null,
      updated_at text not null,
      finished_at text,
      stoppable integer not null default 0,
      failure_code text,
      failure_summary text,
      latest_sequence integer not null default 0,
      retained_event_count integer not null default 0,
      retained_payload_bytes integer not null default 0,
      history_truncated integer not null default 0,
      check (latest_sequence >= 0),
      check (retained_event_count >= 0),
      check (retained_payload_bytes >= 0),
      check (stoppable in (0, 1)),
      check (history_truncated in (0, 1))
    );

    create index if not exists operation_runs_source_reference_idx
      on operation_runs(kind, source, source_run_id, updated_at desc);

    create index if not exists operation_runs_state_updated_idx
      on operation_runs(state, updated_at desc);

    create index if not exists operation_runs_project_updated_idx
      on operation_runs(project_id, updated_at desc);

    create table if not exists operation_events (
      cursor integer primary key autoincrement,
      run_id text not null,
      sequence integer not null,
      type text not null,
      timestamp text not null,
      level text not null,
      summary text not null,
      payload_json text not null,
      payload_bytes integer not null,
      check (sequence > 0),
      check (payload_bytes >= 0),
      foreign key (run_id) references operation_runs(id) on delete cascade
    );

    create unique index if not exists operation_events_run_sequence_unique_idx
      on operation_events(run_id, sequence);

    create table if not exists operation_evidence (
      run_id text not null,
      type text not null,
      state text not null,
      timestamp text,
      source_event_sequence integer,
      summary text,
      primary key (run_id, type),
      check (source_event_sequence is null or source_event_sequence > 0),
      foreign key (run_id) references operation_runs(id) on delete cascade
    );
  `);
}

function migrateVerificationBasisFingerprint(sqlite: Database.Database): void {
  addColumnIfMissing(sqlite, "operation_evidence", "basis_fingerprint", "text");
}

function migrateLocalAgentSessions(sqlite: Database.Database): void {
  sqlite.exec(`
    create table if not exists local_agent_sessions (
      id text primary key,
      workspace_id text,
      workspace_root text not null,
      profile_name text not null,
      provider text not null,
      model text,
      thinking text,
      provider_session_id text,
      status text not null,
      latest_response text,
      error text,
      created_at text not null,
      updated_at text not null
    );

    create index if not exists local_agent_sessions_workspace_id_idx
      on local_agent_sessions(workspace_id, updated_at desc);

    create index if not exists local_agent_sessions_workspace_root_idx
      on local_agent_sessions(workspace_root, updated_at desc);

    create index if not exists local_agent_sessions_provider_session_id_idx
      on local_agent_sessions(provider_session_id);
  `);

  addColumnIfMissing(sqlite, "local_agent_sessions", "thinking", "text");
}

function addColumnIfMissing(
  sqlite: Database.Database,
  table: "workspace_sessions" | "local_agent_sessions" | "operation_evidence",
  column: string,
  definition: string,
): void {
  const columns = sqlite.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((existingColumn) => existingColumn.name === column)) return;

  sqlite.exec(`alter table ${table} add column ${column} ${definition}`);
}
