import assert from "node:assert/strict";
import { createServer as createHttpServer, request as httpRequest, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../config.js";
import { createLocalAgentStore } from "../local-agent-store.js";
import { OperationEventBus } from "../operations/operation-event-bus.js";
import { OperationRunService } from "../operations/operation-run-service.js";
import { OperationStore } from "../operations/operation-store.js";
import { createServer, type RunningServer } from "../server.js";
import { createAdminServer } from "./admin-server.js";

const root = await mkdtemp(join(tmpdir(), "devspace-admin-server-test-"));
let adminHttp: Server | undefined;
let publicHttp: Server | undefined;
let publicRuntime: RunningServer | undefined;
let operationStore: OperationStore | undefined;
try {
  const allowed = join(root, "allowed");
  const project = join(allowed, "repo");
  const stateDir = join(root, "state");
  const configDir = join(root, "config");
  await mkdir(join(project, ".git"), { recursive: true });
  await mkdir(stateDir, { recursive: true });
  await mkdir(configDir, { recursive: true });
  await writeFile(join(project, "README.md"), "kept\n");

  const adminPort = await getFreePort();
  const mcpPort = await getFreePort();
  const config = loadConfig({
    DEVSPACE_CONFIG_DIR: configDir,
    DEVSPACE_ALLOWED_ROOTS: allowed,
    DEVSPACE_STATE_DIR: stateDir,
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    DEVSPACE_DASHBOARD_TOKEN: "test-dashboard-token-long-enough",
    DEVSPACE_DASHBOARD_PORT: String(adminPort),
    PORT: String(mcpPort),
  });

  assert.equal(config.dashboard.host, "127.0.0.1");
  assert.notEqual(config.dashboard.port, config.port);

  operationStore = new OperationStore(stateDir, { maxEventsPerRun: 2 });
  const operationEventBus = new OperationEventBus();
  const operationRuns = new OperationRunService(operationStore, {
    eventBus: operationEventBus,
  });
  const started = operationRuns.startRun({
    id: "op_admin_test",
    kind: "mcp_tool",
    source: "mcp",
    title: "Admin route test",
    state: "running",
  });
  assert.equal(started.ok, true);
  const first = operationRuns.recordEvent("op_admin_test", {
    type: "tool.started",
    timestamp: new Date().toISOString(),
    level: "info",
    summary: "Tool started.",
    payload: { toolName: "read" },
  });
  assert.equal(first.ok, true);
  const second = operationRuns.recordEvent("op_admin_test", {
    type: "tool.completed",
    timestamp: new Date().toISOString(),
    level: "info",
    summary: "Tool completed.",
    payload: { toolName: "read" },
  });
  assert.equal(second.ok, true);
  let stopRequests = 0;
  const stopAudits: unknown[] = [];

  const admin = createAdminServer(config, {
    folderPicker: {
      isSupported: async () => false,
      chooseDirectory: async () => undefined,
    },
    operations: {
      store: operationStore,
      eventBus: operationEventBus,
      pollIntervalMs: 20,
      requestStop: (runId) => {
        stopRequests += 1;
        const run = operationStore?.getRun(runId);
        return run
          ? { ok: true, run }
          : { ok: false, code: "unknown_run" };
      },
      onStopAudit: (event) => stopAudits.push(event),
    },
  });
  adminHttp = admin.app.listen(config.dashboard.port, config.dashboard.host);
  const base = `http://${config.dashboard.host}:${config.dashboard.port}`;

  const publicServerSource = await readFile(new URL("../server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(publicServerSource, /admin-server/);
  assert.doesNotMatch(publicServerSource, /\/api\/projects/);
  assert.doesNotMatch(publicServerSource, /\/api\/operations/);
  publicRuntime = createServer(config);
  publicHttp = publicRuntime.app.listen(config.port, config.host);
  const publicAdminRouteMatrix = [
    { method: "POST", path: "/api/session" },
    { method: "GET", path: "/api/session" },
    { method: "DELETE", path: "/api/session" },
    { method: "GET", path: "/api/status" },
    { method: "GET", path: "/api/projects" },
    { method: "POST", path: "/api/projects" },
    { method: "POST", path: "/api/projects/scan" },
    { method: "PATCH", path: "/api/projects/project_test" },
    { method: "DELETE", path: "/api/projects/project_test" },
    { method: "GET", path: "/api/projects/project_test/git-status" },
    { method: "POST", path: "/api/folder-picker" },
    { method: "GET", path: "/api/agents?projectId=project_test" },
    { method: "GET", path: "/api/diagnostics/troubleshooting" },
    { method: "GET", path: "/dashboard" },
    { method: "GET", path: "/mcp-app-assets/dashboard.html" },
    { method: "GET", path: "/mcp-app-assets//dashboard.html" },
    { method: "GET", path: "/mcp-app-assets/%64ashboard.html" },
    { method: "GET", path: "/mcp-app-assets/dashboard%2ehtml" },
    { method: "GET", path: "/mcp-app-assets/assets/%2e%2e/dashboard.html" },
    { method: "GET", path: "/mcp-app-assets/%44ashboard.html" },
    { method: "GET", path: "/api/operations/runs" },
    { method: "GET", path: "/api/operations/runs/op_admin_test" },
    { method: "GET", path: "/api/operations/runs/op_admin_test/events" },
    { method: "GET", path: "/api/operations/runs/op_admin_test/repository-diff" },
    {
      method: "GET",
      path: "/api/operations/runs/op_admin_test/repository-diff/file?path=README.md",
    },
    { method: "POST", path: "/api/operations/runs/op_admin_test/stop" },
    { method: "GET", path: "/api/operations/stream?after=0" },
  ] as const;
  for (const route of publicAdminRouteMatrix) {
    const mutation = route.method !== "GET";
    const response = await fetch(
      `http://${config.host}:${config.port}${route.path}`,
      {
        method: route.method,
        headers: {
          host: `${config.host}:${config.port}`,
          origin: base,
          ...(mutation ? { "content-type": "application/json" } : {}),
        },
        body: mutation ? "{}" : undefined,
      },
    );
    assert.equal(
      response.status,
      404,
      `${route.method} ${route.path} must be absent from the public MCP listener`,
    );
  }
  await closeServer(publicHttp);
  publicHttp = undefined;
  await publicRuntime.close();
  publicRuntime = undefined;

  const badSession = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: {
      host: `${config.dashboard.host}:${config.dashboard.port}`,
      origin: base,
      "content-type": "application/json",
    },
    body: JSON.stringify({ token: "wrong-token" }),
  });
  assert.equal(badSession.status, 401);

  const missingSession = await fetch(`${base}/api/session`, {
    headers: {
      host: `${config.dashboard.host}:${config.dashboard.port}`,
    },
  });
  assert.equal(missingSession.status, 401);

  const session = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: {
      host: `${config.dashboard.host}:${config.dashboard.port}`,
      origin: base,
      "content-type": "application/json",
    },
    body: JSON.stringify({ token: config.dashboard.token }),
  });
  assert.equal(session.status, 200);
  const cookie = session.headers.get("set-cookie") ?? "";
  const sessionBody = await session.text();
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.doesNotMatch(sessionBody, /test-dashboard-token/);
  const csrfToken = (JSON.parse(sessionBody) as { ok: true; data: { csrfToken: string } }).data.csrfToken;
  assert.equal(session.headers.get("cache-control"), "no-store");

  const restoredSession = await fetch(`${base}/api/session`, {
    headers: {
      host: `${config.dashboard.host}:${config.dashboard.port}`,
      cookie,
    },
  });
  assert.equal(restoredSession.status, 200);
  assert.equal(restoredSession.headers.get("cache-control"), "no-store");
  assert.deepEqual(await restoredSession.json(), {
    ok: true,
    data: { csrfToken },
  });

  const status = await api(base, "/api/status", { cookie });
  assert.equal(status.ok, true);
  assert.equal(status.data.security.dashboardLoopback, true);
  assert.equal(status.data.security.publicAdminRoutes, "absent");
  assert.equal(status.data.storage.database.available, true);
  assert.equal(status.data.storage.database.schemaVersion, status.data.storage.database.latestSchemaVersion);
  assert.equal(status.data.storage.retention.maxEventsPerRun, 2);
  assert.deepEqual(status.data.allowedRootStatus, [{ path: allowed, available: true }]);

  const diagnosticsWithoutSession = await fetch(`${base}/api/diagnostics/troubleshooting`, {
    headers: { host: `${config.dashboard.host}:${config.dashboard.port}` },
  });
  assert.equal(diagnosticsWithoutSession.status, 401);
  const diagnostics = await fetch(`${base}/api/diagnostics/troubleshooting`, {
    headers: {
      host: `${config.dashboard.host}:${config.dashboard.port}`,
      cookie,
    },
  });
  assert.equal(diagnostics.status, 200);
  assert.match(diagnostics.headers.get("content-type") ?? "", /text\/markdown/);

  const noCsrf = await fetch(`${base}/api/projects`, {
    method: "POST",
    headers: {
      host: `${config.dashboard.host}:${config.dashboard.port}`,
      origin: base,
      cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({ path: project }),
  });
  assert.equal(noCsrf.status, 401);

  const wrongHost = await rawStatus(config.dashboard.port, {
    host: `example.com:${config.dashboard.port}`,
    cookie,
  });
  assert.equal(wrongHost, 403);

  const operationsWithoutSession = await fetch(`${base}/api/operations/runs`, {
    headers: { host: `${config.dashboard.host}:${config.dashboard.port}` },
  });
  assert.equal(operationsWithoutSession.status, 401);

  const snapshot = await api(base, "/api/operations/runs", { cookie });
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.data.runs[0].id, "op_admin_test");
  assert.equal(snapshot.data.runs[0].historyTruncated, true);
  assert.equal(snapshot.data.cursor, second.ok ? second.value.cursor : -1);

  const detail = await api(base, "/api/operations/runs/op_admin_test", { cookie });
  assert.equal(detail.data.run.id, "op_admin_test");
  assert.deepEqual(detail.data.evidence, []);

  const events = await api(base, "/api/operations/runs/op_admin_test/events?after=0", { cookie });
  assert.equal(events.data.events.length, 2);
  assert.equal(events.data.requiresSnapshot, true);
  assert.equal(events.data.historyTruncated, true);

  const invalidCursor = await fetch(`${base}/api/operations/runs/op_admin_test/events?after=nope`, {
    headers: {
      host: `${config.dashboard.host}:${config.dashboard.port}`,
      cookie,
    },
  });
  assert.equal(invalidCursor.status, 400);

  const stopWithoutCsrf = await fetch(`${base}/api/operations/runs/op_admin_test/stop`, {
    method: "POST",
    headers: {
      host: `${config.dashboard.host}:${config.dashboard.port}`,
      origin: base,
      cookie,
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(stopWithoutCsrf.status, 401);
  assert.equal(stopRequests, 0);

  const stopWithPid = await api(base, "/api/operations/runs/op_admin_test/stop", {
    method: "POST",
    cookie,
    csrfToken,
    body: { pid: 1234 },
  });
  assert.equal(stopWithPid.error.code, "OPERATION_STOP_INPUT_NOT_ALLOWED");
  assert.equal(stopRequests, 0);

  const stopped = await api(base, "/api/operations/runs/op_admin_test/stop", {
    method: "POST",
    cookie,
    csrfToken,
    body: {},
  });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.data.stopRequested, true);
  assert.match(stopped.data.message, /does not revert repository changes/);
  assert.equal(stopRequests, 1);
  assert.deepEqual(stopAudits, [{
    outcome: "requested",
    runId: "op_admin_test",
  }]);

  const streamCursor = snapshot.data.cursor as number;
  const streamAbort = new AbortController();
  const streamResponse = await fetch(`${base}/api/operations/stream?after=0`, {
    headers: {
      host: `${config.dashboard.host}:${config.dashboard.port}`,
      cookie,
      "last-event-id": String(streamCursor),
    },
    signal: streamAbort.signal,
  });
  assert.equal(streamResponse.status, 200);
  assert.match(streamResponse.headers.get("content-type") ?? "", /text\/event-stream/);
  const reader = streamResponse.body?.getReader();
  assert.ok(reader);
  await readSseUntil(reader, /event: ready/);
  const live = operationRuns.recordEvent("op_admin_test", {
    type: "warning",
    timestamp: new Date().toISOString(),
    level: "warning",
    summary: "Live update.",
    payload: { code: "live_update" },
  });
  assert.equal(live.ok, true);
  const liveText = await readSseUntil(reader, /event: operation/);
  assert.match(liveText, new RegExp(`id: ${live.ok ? live.value.cursor : -1}`));
  assert.match(liveText, /"summary":"Live update."/);
  const persistedOnly = operationStore.appendEvent("op_admin_test", {
    type: "agent.message",
    timestamp: new Date().toISOString(),
    level: "info",
    summary: "Persisted worker update.",
    payload: {
      agentId: "agt_admin_test",
      role: "assistant",
      text: "Worker output.",
      truncated: false,
    },
  });
  const persistedText = await readSseUntil(reader, /Persisted worker update/);
  assert.match(persistedText, new RegExp(`id: ${persistedOnly.event.cursor}`));
  const persistedBeforeBus = operationStore.appendEvent("op_admin_test", {
    type: "agent.message",
    timestamp: new Date().toISOString(),
    level: "info",
    summary: "Persisted before bus.",
    payload: {
      agentId: "agt_admin_test",
      role: "assistant",
      text: "First in cursor order.",
      truncated: false,
    },
  });
  const busAfterPersisted = operationRuns.recordEvent("op_admin_test", {
    type: "warning",
    timestamp: new Date().toISOString(),
    level: "warning",
    summary: "Bus after persisted.",
    payload: { code: "bus_after_persisted" },
  });
  assert.equal(busAfterPersisted.ok, true);
  const orderedText = await readSseUntil(reader, /Bus after persisted/);
  assert.ok(orderedText.indexOf("Persisted before bus.") < orderedText.indexOf("Bus after persisted."));
  assert.match(orderedText, new RegExp(`id: ${persistedBeforeBus.event.cursor}`));
  streamAbort.abort();

  const resetResponse = await fetch(`${base}/api/operations/stream?after=1`, {
    headers: {
      host: `${config.dashboard.host}:${config.dashboard.port}`,
      cookie,
    },
  });
  const resetText = await resetResponse.text();
  assert.match(resetText, /event: reset/);
  assert.match(resetText, /history_unavailable/);

  const registered = await api(base, "/api/projects", {
    method: "POST",
    cookie,
    csrfToken,
    body: { path: project, source: "manual" },
  });
  assert.equal(registered.ok, true);
  const projectId = registered.data.project.id as string;
  const agentStore = createLocalAgentStore(config);
  const agent = agentStore.create({
    workspaceRoot: project,
    profileName: "reviewer",
    provider: "codex",
  });
  agentStore.update(agent.id, {
    status: "idle",
    latestResponse: "Bearer supersecretvalue",
  });
  agentStore.close();

  const scan = await api(base, "/api/projects/scan", {
    method: "POST",
    cookie,
    csrfToken,
    body: {},
  });
  assert.equal(scan.ok, true);
  assert.equal(scan.data.candidates[0].alreadyRegistered, true);

  const updated = await api(base, `/api/projects/${projectId}`, {
    method: "PATCH",
    cookie,
    csrfToken,
    body: { permissionPreset: "design", defaultMode: "worktree", pinned: true },
  });
  assert.equal(updated.data.project.permissionPreset, "design");
  assert.equal(updated.data.project.defaultMode, "worktree");
  assert.equal(updated.data.project.pinned, true);

  const agents = await api(base, `/api/agents?projectId=${projectId}`, { cookie });
  assert.equal(agents.ok, true);
  assert.equal(agents.data.sessions[0].latestResponse, "[redacted sensitive output]");
  assert.doesNotMatch(JSON.stringify(agents), /supersecretvalue/);

  const forgot = await api(base, `/api/projects/${projectId}`, {
    method: "DELETE",
    cookie,
    csrfToken,
    body: {},
  });
  assert.equal(forgot.data.removed, true);
  assert.equal((await stat(join(project, "README.md"))).isFile(), true);

  await closeServer(adminHttp);
  adminHttp = undefined;
  await admin.close();
} finally {
  await closeServer(adminHttp);
  await closeServer(publicHttp);
  await publicRuntime?.close();
  operationStore?.close();
  await rmWithRetry(root);
}

async function readSseUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  pattern: RegExp,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await reader.read();
    if (result.done) break;
    text += decoder.decode(result.value, { stream: true });
    if (pattern.test(text)) return text;
  }
  throw new Error(`SSE pattern not observed: ${pattern}`);
}

async function api(
  base: string,
  path: string,
  options: { method?: string; cookie: string; csrfToken?: string; body?: unknown },
) {
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers: {
      host: new URL(base).host,
      origin: base,
      cookie: options.cookie,
      ...(options.csrfToken ? { "x-devspace-csrf": options.csrfToken } : {}),
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return await response.json() as any;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createHttpServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else if (typeof address === "object" && address) resolve(address.port);
        else reject(new Error("Unable to allocate test port."));
      });
    });
  });
}

function rawStatus(port: number, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: "127.0.0.1",
      port,
      path: "/api/status",
      method: "GET",
      headers,
    }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode ?? 0));
    });
    req.on("error", reject);
    req.end();
  });
}

function closeServer(server: Server | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

async function rmWithRetry(path: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EBUSY") {
        throw error;
      }
      if (attempt === 19) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}
