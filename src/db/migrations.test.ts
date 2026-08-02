import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { databasePath, openDatabase } from "./client.js";

const root = await mkdtemp(join(tmpdir(), "devspace-migrations-test-"));

try {
  const freshStateDir = join(root, "fresh");
  const fresh = openDatabase(freshStateDir);
  assert.deepEqual(
    fresh.sqlite
      .prepare("select version from devspace_schema_migrations order by version")
      .pluck()
      .all(),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.deepEqual(
    tableColumns(fresh.sqlite, "registered_projects"),
    [
      "id",
      "slug",
      "name",
      "root",
      "root_key",
      "permission_preset",
      "default_mode",
      "pinned",
      "source",
      "created_at",
      "updated_at",
      "last_opened_at",
    ],
  );
  assert.equal(tableColumns(fresh.sqlite, "workspace_sessions").includes("project_id"), true);
  assert.deepEqual(tableColumns(fresh.sqlite, "workspace_handoffs"), [
    "root_key",
    "root",
    "status",
    "summary",
    "completed_json",
    "next_actions_json",
    "verification_json",
    "risks_json",
    "active_agents_json",
    "updated_at",
  ]);
  assert.deepEqual(tableColumns(fresh.sqlite, "operation_events"), [
    "cursor",
    "run_id",
    "sequence",
    "type",
    "timestamp",
    "level",
    "summary",
    "payload_json",
    "payload_bytes",
  ]);
  assert.equal(tableColumns(fresh.sqlite, "operation_runs").length, 23);
  assert.equal(tableColumns(fresh.sqlite, "operation_evidence").length, 7);
  assert.equal(tableColumns(fresh.sqlite, "operation_evidence").includes("basis_fingerprint"), true);
  assert.equal(tableColumns(fresh.sqlite, "local_agent_sessions").includes("disposition"), true);
  assert.equal(tableColumns(fresh.sqlite, "local_agent_sessions").includes("question"), true);
  fresh.close();

  const freshAgain = openDatabase(freshStateDir);
  assert.equal(
    freshAgain.sqlite.prepare("select count(*) from devspace_schema_migrations").pluck().get(),
    8,
  );
  freshAgain.close();

  const existingStateDir = join(root, "existing-v3");
  await mkdir(existingStateDir, { recursive: true });
  const existingSqlite = new Database(databasePath(existingStateDir));
  existingSqlite.exec(`
    create table devspace_schema_migrations (
      version integer primary key,
      name text not null,
      applied_at text not null
    );

    insert into devspace_schema_migrations (version, name, applied_at) values
      (1, 'workspace-state', '2026-01-01T00:00:00.000Z'),
      (2, 'oauth-state', '2026-01-01T00:00:00.000Z'),
      (3, 'local-agent-sessions', '2026-01-01T00:00:00.000Z');

    create table workspace_sessions (
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

    insert into workspace_sessions (
      id, root, status, mode, managed, created_at, last_used_at
    ) values (
      'ws_legacy', 'C:\\legacy', 'active', 'checkout', 'false',
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
  `);
  existingSqlite.close();

  const upgraded = openDatabase(existingStateDir);
  assert.equal(
    upgraded.sqlite
      .prepare("select count(*) from devspace_schema_migrations where version = 4")
      .pluck()
      .get(),
    1,
  );
  assert.equal(tableColumns(upgraded.sqlite, "workspace_sessions").includes("project_id"), true);
  assert.deepEqual(
    upgraded.sqlite
      .prepare("select id, root, project_id from workspace_sessions where id = ?")
      .get("ws_legacy"),
    { id: "ws_legacy", root: "C:\\legacy", project_id: null },
  );
  assert.equal(tableColumns(upgraded.sqlite, "registered_projects").length, 12);
  assert.equal(
    upgraded.sqlite
      .prepare("select count(*) from devspace_schema_migrations where version = 5")
      .pluck()
      .get(),
    1,
  );
  assert.equal(tableColumns(upgraded.sqlite, "workspace_handoffs").length, 10);
  assert.equal(
    upgraded.sqlite
      .prepare("select count(*) from devspace_schema_migrations where version = 6")
      .pluck()
      .get(),
    1,
  );
  assert.equal(tableColumns(upgraded.sqlite, "operation_runs").length, 23);
  assert.equal(tableColumns(upgraded.sqlite, "operation_events").length, 9);
  assert.equal(tableColumns(upgraded.sqlite, "operation_evidence").length, 7);
  upgraded.close();

  const failingV6StateDir = join(root, "failing-v6");
  await mkdir(failingV6StateDir, { recursive: true });
  const failingV6Sqlite = new Database(databasePath(failingV6StateDir));
  failingV6Sqlite.exec(`
    create table devspace_schema_migrations (
      version integer primary key,
      name text not null,
      applied_at text not null
    );

    insert into devspace_schema_migrations (version, name, applied_at) values
      (1, 'workspace-state', '2026-01-01T00:00:00.000Z'),
      (2, 'oauth-state', '2026-01-01T00:00:00.000Z'),
      (3, 'local-agent-sessions', '2026-01-01T00:00:00.000Z'),
      (4, 'registered-projects', '2026-01-01T00:00:00.000Z'),
      (5, 'workspace-handoffs', '2026-01-01T00:00:00.000Z');

    create table operation_runs (
      id text primary key
    );
  `);
  failingV6Sqlite.close();

  assert.throws(() => openDatabase(failingV6StateDir), /no such column: kind/);
  const afterV6Failure = new Database(databasePath(failingV6StateDir));
  assert.equal(
    afterV6Failure
      .prepare("select count(*) from devspace_schema_migrations where version = 6")
      .pluck()
      .get(),
    0,
  );
  assert.equal(
    afterV6Failure
      .prepare(
        "select count(*) from sqlite_master where type = 'table' and name = 'operation_events'",
      )
      .pluck()
      .get(),
    0,
  );
  afterV6Failure.close();

  const failingStateDir = join(root, "failing-v3");
  await mkdir(failingStateDir, { recursive: true });
  const failingSqlite = new Database(databasePath(failingStateDir));
  failingSqlite.exec(`
    create table devspace_schema_migrations (
      version integer primary key,
      name text not null,
      applied_at text not null
    );

    insert into devspace_schema_migrations (version, name, applied_at) values
      (1, 'workspace-state', '2026-01-01T00:00:00.000Z'),
      (2, 'oauth-state', '2026-01-01T00:00:00.000Z'),
      (3, 'local-agent-sessions', '2026-01-01T00:00:00.000Z');

    create table workspace_sessions (
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

    create table registered_projects (
      id text primary key
    );
  `);
  failingSqlite.close();

  assert.throws(() => openDatabase(failingStateDir), /no such column: pinned/);
  const afterFailure = new Database(databasePath(failingStateDir));
  assert.equal(
    afterFailure
      .prepare("select count(*) from devspace_schema_migrations where version = 4")
      .pluck()
      .get(),
    0,
  );
  assert.equal(tableColumns(afterFailure, "workspace_sessions").includes("project_id"), false);
  afterFailure.close();
} finally {
  await rm(root, { recursive: true, force: true });
}

function tableColumns(sqlite: Database.Database, table: string): string[] {
  return (sqlite.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>).map(
    (column) => column.name,
  );
}
