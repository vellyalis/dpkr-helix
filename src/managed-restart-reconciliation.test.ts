import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { databasePath } from "./db/client.js";
import { LATEST_SCHEMA_VERSION } from "./db/migrations.js";
import { OperationRunService } from "./operations/operation-run-service.js";
import { OperationStore } from "./operations/operation-store.js";
import { ProjectRegistry } from "./projects/project-registry.js";
import { SqliteProjectStore } from "./projects/project-store.js";
import { SqliteWorkspaceHandoffStore } from "./workspace-handoff-store.js";
import { SqliteWorkspaceStore } from "./workspace-store.js";

const MANAGED_RUNTIME_READINESS_TIMEOUT_MS = 30_000;
const root = await mkdtemp(join(tmpdir(), "devspace-managed-restart-test-"));
const allowedRoot = join(root, "allowed");
const projectRoot = join(allowedRoot, "persisted-project");
const stateDir = join(root, "state");
const configDir = join(root, "config");
const agentDir = join(root, "agent");
const worktreeRoot = join(root, "worktrees");
const legacyWorkspaceId = "ws_legacy_v3";
const persistedWorkspaceId = "ws_restart_proof";
const operationRunId = "op_restart_proof";
let runtime: ManagedRuntimeProcess | undefined;

try {
  await Promise.all([
    mkdir(projectRoot, { recursive: true }),
    mkdir(stateDir, { recursive: true }),
    mkdir(configDir, { recursive: true }),
    mkdir(agentDir, { recursive: true }),
    mkdir(worktreeRoot, { recursive: true }),
  ]);
  createVersion3Database(stateDir, projectRoot, legacyWorkspaceId);

  const port = await getFreePort();
  const childEnv = managedRuntimeEnvironment({
    allowedRoot,
    agentDir,
    configDir,
    port,
    stateDir,
    worktreeRoot,
  });

  runtime = spawnManagedRuntime(childEnv);
  await waitForManagedRuntime(runtime, port);
  await stopManagedRuntime(runtime.child);
  runtime = undefined;

  const migrated = readMigrationSnapshot(stateDir, legacyWorkspaceId);
  assert.deepEqual(migrated.versions, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(migrated.versions.at(-1), LATEST_SCHEMA_VERSION);
  assert.deepEqual(migrated.legacyWorkspace, {
    id: legacyWorkspaceId,
    root: projectRoot,
    project_id: null,
  });

  const projectStore = new SqliteProjectStore(stateDir);
  const projects = new ProjectRegistry(projectStore, [allowedRoot]);
  const project = await projects.register({
    path: projectRoot,
    name: "Restart proof",
    slug: "restart-proof",
    permissionPreset: "design",
    defaultMode: "checkout",
    pinned: true,
  });
  projectStore.close();

  const workspaceStore = new SqliteWorkspaceStore(stateDir);
  workspaceStore.createSession({
    id: persistedWorkspaceId,
    root: projectRoot,
    projectId: project.id,
  });
  workspaceStore.close();

  const handoffStore = new SqliteWorkspaceHandoffStore(stateDir);
  const handoff = handoffStore.upsert(projectRoot, {
    status: "ready",
    summary: "Persisted restart proof.",
    completed: ["Seeded existing state"],
    nextActions: ["Resume after restart"],
    verification: ["Migration pending"],
    risks: ["Owner may be unavailable"],
    activeAgents: [],
  });
  handoffStore.close();

  const operationStore = new OperationStore(stateDir);
  const operationRuns = new OperationRunService(operationStore);
  const started = operationRuns.startRun({
    id: operationRunId,
    kind: "process_session",
    source: "mcp",
    sourceRunId: "process:41",
    projectId: project.id,
    workspaceId: persistedWorkspaceId,
    title: "Existing process operation",
    state: "running",
  });
  assert.equal(started.ok, true);
  operationStore.close();

  runtime = spawnManagedRuntime(childEnv);
  await waitForManagedRuntime(runtime, port);
  await stopManagedRuntime(runtime.child);
  runtime = undefined;

  const afterReconciliation = readPersistedSnapshot(stateDir, {
    handoffRoot: projectRoot,
    legacyWorkspaceId,
    operationRunId,
    persistedWorkspaceId,
    projectId: project.id,
  });
  assert.deepEqual(afterReconciliation.versions, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(afterReconciliation.project, {
    id: project.id,
    slug: "restart-proof",
    root: project.root,
    permission_preset: "design",
    default_mode: "checkout",
    pinned: 1,
  });
  assert.deepEqual(afterReconciliation.workspaces, [
    {
      id: legacyWorkspaceId,
      root: projectRoot,
      project_id: null,
      status: "active",
    },
    {
      id: persistedWorkspaceId,
      root: projectRoot,
      project_id: project.id,
      status: "active",
    },
  ]);
  assert.deepEqual(afterReconciliation.handoff, {
    root: projectRoot,
    status: handoff.status,
    summary: handoff.summary,
    completed_json: JSON.stringify(handoff.completed),
    next_actions_json: JSON.stringify(handoff.nextActions),
    verification_json: JSON.stringify(handoff.verification),
    risks_json: JSON.stringify(handoff.risks),
    active_agents_json: JSON.stringify(handoff.activeAgents),
  });
  assert.deepEqual(afterReconciliation.operation, {
    id: operationRunId,
    kind: "process_session",
    source: "mcp",
    source_run_id: "process:41",
    project_id: project.id,
    workspace_id: persistedWorkspaceId,
    state: "failed",
    failure_code: "owner_unavailable_after_restart",
    stoppable: 0,
    latest_sequence: 2,
    retained_event_count: 2,
  });
  assert.deepEqual(afterReconciliation.operationEvents, [
    {
      sequence: 1,
      type: "run.created",
      payload_json: JSON.stringify({
        kind: "process_session",
        state: "running",
        assuranceStage: "working",
      }),
    },
    {
      sequence: 2,
      type: "run.state_changed",
      payload_json: JSON.stringify({
        previousState: "running",
        state: "failed",
        assuranceStage: "working",
        reasonCode: "owner_unavailable_after_restart",
      }),
    },
  ]);

  runtime = spawnManagedRuntime(childEnv);
  await waitForManagedRuntime(runtime, port);
  await stopManagedRuntime(runtime.child);
  runtime = undefined;

  const afterRepeatedRestart = readPersistedSnapshot(stateDir, {
    handoffRoot: projectRoot,
    legacyWorkspaceId,
    operationRunId,
    persistedWorkspaceId,
    projectId: project.id,
  });
  assert.deepEqual(
    afterRepeatedRestart,
    afterReconciliation,
    "a repeated managed restart must not reapply migrations, replay reconciliation, or alter persisted state",
  );
} finally {
  if (runtime) await terminateManagedRuntime(runtime.child);
  await rm(root, { recursive: true, force: true });
}

interface RuntimeEnvironmentInput {
  allowedRoot: string;
  agentDir: string;
  configDir: string;
  port: number;
  stateDir: string;
  worktreeRoot: string;
}

interface SnapshotSelector {
  handoffRoot: string;
  legacyWorkspaceId: string;
  operationRunId: string;
  persistedWorkspaceId: string;
  projectId: string;
}

interface ManagedRuntimeProcess {
  child: ChildProcess;
  readiness: Promise<void>;
}

function managedRuntimeEnvironment(input: RuntimeEnvironmentInput): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DEVSPACE_AGENT_DIR: input.agentDir,
    DEVSPACE_ALLOWED_ROOTS: input.allowedRoot,
    DEVSPACE_ARTIFACTS: "0",
    DEVSPACE_CONFIG_DIR: input.configDir,
    DEVSPACE_DASHBOARD: "0",
    DEVSPACE_LOG_LEVEL: "silent",
    DEVSPACE_OAUTH_OWNER_TOKEN: "restart-proof-owner-token",
    DEVSPACE_SKILLS: "0",
    DEVSPACE_STATE_DIR: input.stateDir,
    DEVSPACE_SUBAGENTS: "0",
    DEVSPACE_WIDGETS: "off",
    DEVSPACE_WORKTREE_ROOT: input.worktreeRoot,
    HOST: "127.0.0.1",
    PORT: String(input.port),
  };
}

function spawnManagedRuntime(env: NodeJS.ProcessEnv): ManagedRuntimeProcess {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", managedChildSource()],
    {
      cwd: new URL("..", import.meta.url),
      env,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    },
  );
  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout?.on("data", (chunk: Buffer) => retainOutput(stdout, chunk));
  child.stderr?.on("data", (chunk: Buffer) => retainOutput(stderr, chunk));

  const readiness = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      reject(
        new Error(
          `managed runtime exited before readiness (${signal ?? code ?? "unknown"})\n`
            + `${stdout.join("")}${stderr.join("")}`,
        ),
      );
    });
    child.on("message", (message) => {
      if (
        typeof message === "object"
        && message !== null
        && "type" in message
        && message.type === "ready"
      ) {
        resolve();
      }
    });
  });
  return { child, readiness };
}

async function waitForManagedRuntime(
  runtime: ManagedRuntimeProcess,
  port: number,
): Promise<void> {
  try {
    await Promise.race([
      runtime.readiness,
      timeout(
        MANAGED_RUNTIME_READINESS_TIMEOUT_MS,
        `managed runtime readiness timed out after ${MANAGED_RUNTIME_READINESS_TIMEOUT_MS}ms`,
      ),
    ]);

    const health = await fetch(`http://127.0.0.1:${port}/healthz`, {
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, name: "devspace" });
  } catch (error) {
    await terminateManagedRuntime(runtime.child);
    throw error;
  }
}

function managedChildSource(): string {
  return `
import { createServer } from ${JSON.stringify(new URL("./server.ts", import.meta.url).href)};
import { shutdownHttpServer } from ${JSON.stringify(new URL("./server-shutdown.ts", import.meta.url).href)};

const runtime = createServer();
const httpServer = runtime.app.listen(runtime.config.port, runtime.config.host, () => {
  process.send?.({ type: "ready" });
});
let stopping = false;
process.on("message", (message) => {
  if (message !== "shutdown" || stopping) return;
  stopping = true;
  void shutdownHttpServer(httpServer, runtime.close).then(
    () => process.exit(0),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
});
`;
}

async function stopManagedRuntime(child: ChildProcess): Promise<void> {
  const exit = waitForChildExit(child);
  let result: { code: number | null; signal: NodeJS.Signals | null };
  try {
    child.send?.("shutdown");
    result = await Promise.race([
      exit,
      timeout(10_000, "managed runtime shutdown timed out"),
    ]);
  } catch (error) {
    await terminateManagedRuntime(child);
    throw error;
  }
  assert.deepEqual(result, { code: 0, signal: null });
}

async function terminateManagedRuntime(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  const exit = waitForChildExit(child);
  child.kill();
  try {
    await Promise.race([
      exit,
      timeout(5_000, "managed runtime termination timed out"),
    ]);
  } catch {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
    await Promise.race([
      exit,
      timeout(5_000, "managed runtime forced termination timed out"),
    ]);
  }
}

function waitForChildExit(
  child: ChildProcess,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({
      code: child.exitCode,
      signal: child.signalCode,
    });
  }
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function retainOutput(target: string[], chunk: Buffer): void {
  target.push(chunk.toString("utf8"));
  const retained = target.join("");
  if (retained.length > 8_192) {
    target.splice(0, target.length, retained.slice(-8_192));
  }
}

function timeout(milliseconds: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds);
    timer.unref();
  });
}

async function getFreePort(): Promise<number> {
  const server = createHttpServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral TCP port.");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

function createVersion3Database(
  stateDir: string,
  workspaceRoot: string,
  workspaceId: string,
): void {
  const sqlite = new Database(databasePath(stateDir));
  try {
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(`
      create table devspace_schema_migrations (
        version integer primary key,
        name text not null,
        applied_at text not null
      );

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

      create index workspace_sessions_root_idx
        on workspace_sessions(root, last_used_at desc);
      create index workspace_sessions_status_idx
        on workspace_sessions(status, last_used_at desc);

      create table loaded_agent_files (
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

      create index loaded_agent_files_path_idx on loaded_agent_files(path);

      create table oauth_clients (
        client_id text primary key,
        client_json text not null,
        issued_at integer not null
      );

      create index oauth_clients_issued_at_idx on oauth_clients(issued_at desc);

      create table oauth_access_tokens (
        token_hash text primary key,
        client_id text not null,
        scopes_json text not null,
        expires_at integer not null,
        resource text,
        foreign key (client_id) references oauth_clients(client_id) on delete cascade
      );

      create index oauth_access_tokens_client_id_idx on oauth_access_tokens(client_id);
      create index oauth_access_tokens_expires_at_idx on oauth_access_tokens(expires_at);

      create table oauth_refresh_tokens (
        token_hash text primary key,
        client_id text not null,
        scopes_json text not null,
        expires_at integer not null,
        resource text,
        foreign key (client_id) references oauth_clients(client_id) on delete cascade
      );

      create index oauth_refresh_tokens_client_id_idx on oauth_refresh_tokens(client_id);
      create index oauth_refresh_tokens_expires_at_idx on oauth_refresh_tokens(expires_at);

      create table local_agent_sessions (
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

      create index local_agent_sessions_workspace_id_idx
        on local_agent_sessions(workspace_id, updated_at desc);
      create index local_agent_sessions_workspace_root_idx
        on local_agent_sessions(workspace_root, updated_at desc);
      create index local_agent_sessions_provider_session_id_idx
        on local_agent_sessions(provider_session_id);
    `);
    sqlite
      .prepare(
        "insert into devspace_schema_migrations (version, name, applied_at) values (?, ?, ?)",
      )
      .run(1, "workspace-state", "2026-01-01T00:00:00.000Z");
    sqlite
      .prepare(
        "insert into devspace_schema_migrations (version, name, applied_at) values (?, ?, ?)",
      )
      .run(2, "oauth-state", "2026-01-01T00:00:00.000Z");
    sqlite
      .prepare(
        "insert into devspace_schema_migrations (version, name, applied_at) values (?, ?, ?)",
      )
      .run(3, "local-agent-sessions", "2026-01-01T00:00:00.000Z");
    sqlite
      .prepare(
        `insert into workspace_sessions (
          id, root, status, mode, managed, created_at, last_used_at
        ) values (?, ?, 'active', 'checkout', 'false', ?, ?)`,
      )
      .run(
        workspaceId,
        workspaceRoot,
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
      );
  } finally {
    sqlite.close();
  }
}

function readMigrationSnapshot(
  stateDir: string,
  legacyWorkspaceId: string,
): {
  versions: number[];
  legacyWorkspace: { id: string; root: string; project_id: string | null } | undefined;
} {
  const sqlite = new Database(databasePath(stateDir), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return {
      versions: sqlite
        .prepare("select version from devspace_schema_migrations order by version")
        .pluck()
        .all() as number[],
      legacyWorkspace: sqlite
        .prepare("select id, root, project_id from workspace_sessions where id = ?")
        .get(legacyWorkspaceId) as
        | { id: string; root: string; project_id: string | null }
        | undefined,
    };
  } finally {
    sqlite.close();
  }
}

function readPersistedSnapshot(stateDir: string, selector: SnapshotSelector) {
  const sqlite = new Database(databasePath(stateDir), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return {
      versions: sqlite
        .prepare("select version from devspace_schema_migrations order by version")
        .pluck()
        .all() as number[],
      project: sqlite
        .prepare(
          `select id, slug, root, permission_preset, default_mode, pinned
           from registered_projects where id = ?`,
        )
        .get(selector.projectId),
      workspaces: sqlite
        .prepare(
          `select id, root, project_id, status from workspace_sessions
           where id in (?, ?) order by id`,
        )
        .all(selector.legacyWorkspaceId, selector.persistedWorkspaceId),
      handoff: sqlite
        .prepare(
          `select root, status, summary, completed_json, next_actions_json,
             verification_json, risks_json, active_agents_json
           from workspace_handoffs where root = ?`,
        )
        .get(selector.handoffRoot),
      operation: sqlite
        .prepare(
          `select id, kind, source, source_run_id, project_id, workspace_id,
             state, failure_code, stoppable, latest_sequence, retained_event_count
           from operation_runs where id = ?`,
        )
        .get(selector.operationRunId),
      operationEvents: sqlite
        .prepare(
          `select sequence, type, payload_json from operation_events
           where run_id = ? order by sequence`,
        )
        .all(selector.operationRunId),
    };
  } finally {
    sqlite.close();
  }
}
