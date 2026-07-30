import type { LocalAgentRecord } from "../local-agent-store.js";
import type {
  OperationEvidence,
} from "../operations/operation-contracts.js";
import type {
  StoredOperationEvent,
  StoredOperationRun,
} from "../operations/operation-store.js";
import type {
  RepositoryDiffSummary,
  RepositoryFileDiff,
} from "../operations/repository-diff.js";
import type { DiscoveryResult } from "../projects/project-discovery.js";
import type { ProjectView } from "../projects/project-types.js";
import type { ProjectGitStatus } from "./projects-screen.js";

export interface DashboardStatus {
  mcp: { localUrl: string; publicHost: string };
  dashboard: { enabled: boolean; url: string };
  allowedRoots: string[];
  allowedRootStatus: Array<{ path: string; available: boolean }>;
  discovery: {
    maxDepth: number;
    maxDirectories: number;
    timeoutMs: number;
  };
  providers: Array<{
    name: string;
    available: boolean;
    reason?: string;
    profileCount: number;
  }>;
  providerSummary: string;
  service: {
    version: string;
    uptimeSeconds: number;
  };
  security: {
    dashboardLoopback: boolean;
    publicAdminRoutes: "absent" | "unknown";
    dashboardSession: "authenticated";
    projectMutations: "local_only";
  };
  storage: {
    database: {
      available: boolean;
      path: string;
      schemaVersion?: number;
      migrationCount?: number;
      latestSchemaVersion: number;
    };
    retention?: {
      maxEventsPerRun: number;
      maxPayloadBytesPerRun: number;
      completedRunRetention: number;
      detailedCompletedRunRetention: number;
      retainedRuns: number;
      truncatedRuns: number;
    };
  };
}

export interface OperationRunSnapshot {
  runs: StoredOperationRun[];
  cursor: number;
}

export interface DashboardOperationDetail {
  run: StoredOperationRun;
  evidence: OperationEvidence[];
  cursor: number;
}

export interface DashboardOperationEvents {
  events: StoredOperationEvent[];
  afterSequence: number;
  nextSequence: number;
  historyTruncated: boolean;
  requiresSnapshot: boolean;
}

export type OperationStreamState =
  | { kind: "ready"; cursor: number }
  | {
      kind: "reset";
      cursor: number;
      reason: "catchup_limit_exceeded" | "history_unavailable" | "store_unavailable";
    };

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

const BOOTSTRAP_TOKEN_STORAGE_KEY = "devspace.dashboard.bootstrap-token";
let csrfToken: string | undefined;
let sessionRecovery: Promise<boolean> | undefined;

export async function bootstrapSession(): Promise<void> {
  csrfToken = undefined;
  const token = new URLSearchParams(location.hash.replace(/^#/, "")).get("token");
  if (token) {
    storeBootstrapToken(token);
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    try {
      await createSession(token);
    } catch (error) {
      if (isUnauthorized(error)) removeBootstrapToken();
      throw error;
    }
    return;
  }

  try {
    csrfToken = (await request<{ csrfToken: string }>("/api/session", {
      csrf: false,
    })).csrfToken;
    return;
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
  }

  const storedToken = readBootstrapToken();
  if (!storedToken) return;

  await recoverSession(storedToken);
}

export function getCsrfToken(): string | undefined {
  return csrfToken;
}

export async function getStatus(): Promise<DashboardStatus> {
  return request<DashboardStatus>("/api/status");
}

export async function getProjects(): Promise<ProjectView[]> {
  return (await request<{ projects: ProjectView[] }>("/api/projects")).projects;
}

export async function getProjectGitStatus(id: string): Promise<ProjectGitStatus> {
  return (await request<{ status: ProjectGitStatus }>(
    `/api/projects/${encodeURIComponent(id)}/git-status`,
  )).status;
}

export async function getOperationSnapshot(projectId?: string): Promise<OperationRunSnapshot> {
  const suffix = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  return request<OperationRunSnapshot>(`/api/operations/runs${suffix}`);
}

export async function getOperationRuns(projectId?: string): Promise<StoredOperationRun[]> {
  return (await getOperationSnapshot(projectId)).runs;
}

export async function getOperationRunDetail(runId: string): Promise<DashboardOperationDetail> {
  return request<DashboardOperationDetail>(
    `/api/operations/runs/${encodeURIComponent(runId)}`,
  );
}

export async function getOperationEvents(
  runId: string,
  afterSequence = 0,
): Promise<DashboardOperationEvents> {
  return request<DashboardOperationEvents>(
    `/api/operations/runs/${encodeURIComponent(runId)}/events?after=${afterSequence}&limit=1000`,
  );
}

export async function getOperationRepositoryDiff(
  runId: string,
): Promise<RepositoryDiffSummary> {
  return request<RepositoryDiffSummary>(
    `/api/operations/runs/${encodeURIComponent(runId)}/repository-diff`,
  );
}

export async function getOperationRepositoryFileDiff(
  runId: string,
  path: string,
): Promise<RepositoryFileDiff> {
  return request<RepositoryFileDiff>(
    `/api/operations/runs/${encodeURIComponent(runId)}/repository-diff/file?path=${
      encodeURIComponent(path)
    }`,
  );
}

export async function stopOperationRun(runId: string): Promise<{
  stopRequested: true;
  run: StoredOperationRun;
  message: string;
}> {
  return request(`/api/operations/runs/${encodeURIComponent(runId)}/stop`, {
    method: "POST",
    body: {},
  });
}

export function openOperationStream(
  afterCursor: number,
  callbacks: {
    onEvent(event: StoredOperationEvent): void;
    onState(state: OperationStreamState): void;
    onDisconnect(): void;
  },
): () => void {
  const source = new EventSource(`/api/operations/stream?after=${afterCursor}`);
  source.addEventListener("operation", (message) => {
    callbacks.onEvent(JSON.parse((message as MessageEvent<string>).data) as StoredOperationEvent);
  });
  source.addEventListener("ready", (message) => {
    callbacks.onState({
      kind: "ready",
      cursor: (JSON.parse((message as MessageEvent<string>).data) as { cursor: number }).cursor,
    });
  });
  source.addEventListener("reset", (message) => {
    const reset = JSON.parse((message as MessageEvent<string>).data) as {
      cursor: number;
      reason: Extract<OperationStreamState, { kind: "reset" }>["reason"];
    };
    callbacks.onState({
      kind: "reset",
      cursor: reset.cursor,
      reason: reset.reason,
    });
    source.close();
  });
  source.onerror = () => callbacks.onDisconnect();
  return () => source.close();
}

export async function scanProjects(): Promise<DiscoveryResult> {
  return request<DiscoveryResult>("/api/projects/scan", { method: "POST", body: {} });
}

export async function registerProject(path: string, source: "manual" | "discovered" = "manual"): Promise<ProjectView> {
  return (await request<{ project: ProjectView }>("/api/projects", { method: "POST", body: { path, source } })).project;
}

export async function updateProject(id: string, patch: Record<string, unknown>): Promise<ProjectView> {
  return (await request<{ project: ProjectView }>(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
  })).project;
}

export async function forgetProject(id: string): Promise<void> {
  await request<{ removed: boolean }>(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE", body: {} });
}

export async function chooseFolder(): Promise<{ supported: boolean; path?: string }> {
  return request("/api/folder-picker", { method: "POST", body: {} });
}

export async function getAgents(projectId?: string): Promise<LocalAgentRecord[]> {
  const suffix = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  return (await request<{ sessions: LocalAgentRecord[] }>(`/api/agents${suffix}`)).sessions;
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    csrf?: boolean;
    recoverSession?: boolean;
  } = {},
): Promise<T> {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.csrf !== false && csrfToken) headers.set("x-devspace-csrf", csrfToken);
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    credentials: "same-origin",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const result = await response.json() as ApiResult<T>;
  if (!result.ok) {
    const error = new DashboardApiError(response.status, result.error.code, result.error.message);
    if (
      isUnauthorized(error)
      && options.csrf !== false
      && options.recoverSession !== false
      && await recoverSession()
    ) {
      return request<T>(path, { ...options, recoverSession: false });
    }
    throw error;
  }
  return result.data;
}

async function createSession(token: string): Promise<void> {
  const result = await request<{ csrfToken: string }>("/api/session", {
    method: "POST",
    body: { token },
    csrf: false,
  });
  csrfToken = result.csrfToken;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof DashboardApiError && error.status === 401;
}

async function recoverSession(token = readBootstrapToken()): Promise<boolean> {
  csrfToken = undefined;
  if (!token) return false;
  if (sessionRecovery) return sessionRecovery;

  sessionRecovery = (async () => {
    try {
      await createSession(token);
      return true;
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
      removeBootstrapToken();
      return false;
    }
  })();

  try {
    return await sessionRecovery;
  } finally {
    sessionRecovery = undefined;
  }
}

function storeBootstrapToken(token: string): void {
  try {
    sessionStorage.setItem(BOOTSTRAP_TOKEN_STORAGE_KEY, token);
  } catch {
    // A valid HttpOnly session cookie still supports normal page reloads when
    // browser storage is unavailable.
  }
}

function readBootstrapToken(): string | undefined {
  try {
    return sessionStorage.getItem(BOOTSTRAP_TOKEN_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function removeBootstrapToken(): void {
  try {
    sessionStorage.removeItem(BOOTSTRAP_TOKEN_STORAGE_KEY);
  } catch {
    // Storage may be unavailable; there is nothing else to clear client-side.
  }
}

class DashboardApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DashboardApiError";
  }
}
