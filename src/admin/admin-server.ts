import { execFile } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { relative, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import type { ServerConfig } from "../config.js";
import { databasePath, inspectDatabase } from "../db/client.js";
import { LATEST_SCHEMA_VERSION } from "../db/migrations.js";
import { formatLocalAgentProviderAvailabilitySummary, getLocalAgentProviderAvailabilitySnapshot } from "../local-agent-availability.js";
import { loadLocalAgentProfiles, type LocalAgentProvider } from "../local-agent-profiles.js";
import { createLocalAgentStore } from "../local-agent-store.js";
import type { LocalAgentRecord } from "../local-agent-store.js";
import type { StoredOperationRun } from "../operations/operation-store.js";
import { readRepositoryContext } from "../operations/repository-diff.js";
import {
  PROJECT_DISCOVERY_DEFAULTS,
  ProjectDiscovery,
} from "../projects/project-discovery.js";
import type { ProjectView } from "../projects/project-types.js";
import {
  ProjectRegistry,
  ProjectRegistryError,
  ProjectPathError,
} from "../projects/project-registry.js";
import { createProjectStore, type ProjectStore } from "../projects/project-store.js";
import {
  createProjectResumeSnapshot,
  formatProjectResumeSnapshot,
} from "../project-resume.js";
import { isSameCanonicalPath } from "../roots.js";
import { redactForbiddenSensitiveContent } from "../sensitive-content.js";
import {
  analyzeWorkspaceLifecycle,
  type WorkspaceLifecycleAnalysis,
} from "../workspace-lifecycle.js";
import { createWorkspaceStore, type WorkspaceStore } from "../workspace-store.js";
import { createWorkspaceHandoffStore } from "../workspace-handoff-store.js";
import { apiError, AdminAuth } from "./admin-auth.js";
import { createFolderPicker, type FolderPicker } from "./folder-picker.js";
import {
  OperationRouteError,
  registerOperationRoutes,
  type OperationRouteOptions,
} from "./operation-routes.js";

export interface AdminServerOptions {
  projectStore?: ProjectStore;
  folderPicker?: FolderPicker;
  operations?: OperationRouteOptions;
}

export interface AdminServer {
  app: express.Express;
  close(): Promise<void>;
}

const require = createRequire(import.meta.url);
const packageVersion = (require("../../package.json") as { version?: string }).version ?? "unknown";
const MAX_AGENT_PREVIEW_CHARACTERS = 1_200;

export function createAdminServer(config: ServerConfig, options: AdminServerOptions = {}): AdminServer {
  if (!config.dashboard.token) {
    throw new Error("Dashboard token is missing. Run: devspace init");
  }
  const app = express();
  const projectStore = options.projectStore ?? createProjectStore(config.stateDir);
  const workspaceStore = createWorkspaceStore(config.stateDir);
  const handoffs = createWorkspaceHandoffStore(config.stateDir);
  const projects = new ProjectRegistry(projectStore, config.allowedRoots);
  const discovery = new ProjectDiscovery(config.allowedRoots, projectStore);
  const folderPicker = options.folderPicker ?? createFolderPicker();
  const auth = new AdminAuth({
    token: config.dashboard.token,
    host: config.dashboard.host,
    port: config.dashboard.port,
  });

  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  const operationRoutes = options.operations
    ? registerOperationRoutes(
        app,
        auth.requireRead.bind(auth),
        auth.requireMutation.bind(auth),
        options.operations,
      )
    : undefined;

  app.post("/api/session", (req, res) => {
    if (!auth.validateHost(req) || !auth.validateOrigin(req)) {
      res.status(403).json(apiError("FORBIDDEN", "Forbidden"));
      return;
    }
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const session = auth.createSession(token);
    if (!session) {
      res.status(401).json(apiError("UNAUTHORIZED", "Unauthorized"));
      return;
    }
    auth.setSessionCookie(res, session);
    res.setHeader("cache-control", "no-store");
    res.json({ ok: true, data: { csrfToken: session.csrfToken } });
  });

  app.get("/api/session", auth.requireRead.bind(auth), (req, res) => {
    const session = auth.getSession(req);
    if (!session) {
      res.status(401).json(apiError("UNAUTHORIZED", "Unauthorized"));
      return;
    }
    res.setHeader("cache-control", "no-store");
    res.json({ ok: true, data: { csrfToken: session.csrfToken } });
  });

  app.delete("/api/session", auth.requireMutation.bind(auth), (req, res) => {
    auth.clearSession(req, res);
    res.json({ ok: true, data: { loggedOut: true } });
  });

  app.get("/api/status", auth.requireRead.bind(auth), asyncHandler(async (_req, res) => {
    const agentStore = createLocalAgentStore(config);
    const agentRecords = agentStore.list();
    const providers = config.subagents
      ? getLocalAgentProviderAvailabilitySnapshot(process.env, agentRecords)
      : [];
    agentStore.close();
    const projectViews = await projects.list();
    const profileCounts = await providerProfileCounts(config, projectViews);
    const allowedRootStatus = await Promise.all(config.allowedRoots.map(async (root) => ({
      path: root,
      available: await directoryAvailable(root),
    })));
    const database = inspectDatabase(config.stateDir);
    const retainedRuns = options.operations?.store.listRuns({
      limit: options.operations.store.limits.completedRunRetention,
    }) ?? [];
    const truncatedRuns = retainedRuns.filter((run) => run.historyTruncated).length;
    const workspaceLifecycle = readWorkspaceLifecycle(
      workspaceStore,
      retainedRuns,
      agentRecords,
    );
    res.json({
      ok: true,
      data: {
        mcp: {
          localUrl: `http://${config.host}:${config.port}/mcp`,
          publicHost: new URL(config.publicBaseUrl).host,
        },
        dashboard: {
          enabled: config.dashboard.enabled,
          url: `http://${config.dashboard.host}:${config.dashboard.port}/`,
        },
        allowedRoots: config.allowedRoots,
        allowedRootStatus,
        discovery: PROJECT_DISCOVERY_DEFAULTS,
        providers: providers.map((provider) => ({
          ...provider,
          profileCount: profileCounts.get(provider.name) ?? 0,
        })),
        providerSummary: providers.length ? formatLocalAgentProviderAvailabilitySummary(providers) : "subagents disabled",
        service: {
          version: packageVersion,
          uptimeSeconds: Math.floor(process.uptime()),
        },
        security: {
          dashboardLoopback: config.dashboard.host === "127.0.0.1",
          publicAdminRoutes: "absent",
          dashboardSession: "authenticated",
          projectMutations: "local_only",
        },
        storage: {
          database: {
            ...database,
            path: safeLocalPath(databasePath(config.stateDir)),
            latestSchemaVersion: LATEST_SCHEMA_VERSION,
          },
          retention: options.operations ? {
            maxEventsPerRun: options.operations.store.limits.maxEventsPerRun,
            maxPayloadBytesPerRun: options.operations.store.limits.maxPayloadBytesPerRun,
            completedRunRetention: options.operations.store.limits.completedRunRetention,
            detailedCompletedRunRetention:
              options.operations.store.limits.detailedCompletedRunRetention,
            retainedRuns: retainedRuns.length,
            truncatedRuns,
          } : undefined,
          workspaces: workspaceLifecycle.summary,
        },
      },
    });
  }));

  app.post("/api/workspaces/archive", auth.requireMutation.bind(auth), asyncHandler(async (req, res) => {
    if (req.body && Object.keys(req.body).length > 0) {
      res.status(400).json(apiError(
        "WORKSPACE_ARCHIVE_INPUT_NOT_ALLOWED",
        "Workspace archive uses the fixed safe eligibility contract and accepts no options.",
      ));
      return;
    }
    const agentStore = createLocalAgentStore(config);
    const agentRecords = agentStore.list();
    agentStore.close();
    const retainedRuns = options.operations?.store.listRuns({
      limit: options.operations.store.limits.completedRunRetention,
    }) ?? [];
    const before = readWorkspaceLifecycle(workspaceStore, retainedRuns, agentRecords);
    const archived = workspaceStore.archiveSessions(before.archiveCandidates);
    const after = readWorkspaceLifecycle(workspaceStore, retainedRuns, agentRecords);
    res.json({
      ok: true,
      data: {
        archived,
        filesDeleted: false,
        worktreesDeleted: false,
        automaticallyReactivatesOnUse: true,
        summary: after.summary,
      },
    });
  }));

  app.get("/api/projects/:id/resume", auth.requireRead.bind(auth), asyncHandler(async (req, res) => {
    const projectId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!projectId) {
      res.status(400).json(apiError("PROJECT_ID_REQUIRED", "Project ID is required."));
      return;
    }
    const project = projects.getById(projectId);
    const projectView = await projects.getViewById(projectId);
    if (!project || !projectView) {
      res.status(404).json(apiError("PROJECT_UNKNOWN", "Registered project not found."));
      return;
    }
    const agentStore = createLocalAgentStore(config);
    const agents = agentStore.list({ workspaceRoot: project.root });
    agentStore.close();
    const snapshot = createProjectResumeSnapshot({
      project: projectView,
      repositoryContext: await readRepositoryContext(project.root),
      handoff: handoffs.get(project.root),
      workspaceSessions: workspaceStore.listSessions().filter((session) =>
        session.projectId === project.id || isSameCanonicalPath(session.root, project.root)
      ),
      agents,
      runs: options.operations?.store.listRuns({ projectId: project.id, limit: 100 }) ?? [],
    });
    res.json({
      ok: true,
      data: {
        ...snapshot,
        result: formatProjectResumeSnapshot(snapshot),
      },
    });
  }));

  app.get("/api/projects", auth.requireRead.bind(auth), asyncHandler(async (_req, res) => {
    res.json({ ok: true, data: { projects: await projects.list() } });
  }));

  app.post("/api/projects/scan", auth.requireMutation.bind(auth), asyncHandler(async (req, res) => {
    const result = await discovery.scan({
      roots: stringArray(req.body?.roots),
      maxDepth: optionalNumber(req.body?.maxDepth),
      maxDirectories: optionalNumber(req.body?.maxDirectories),
      timeoutMs: optionalNumber(req.body?.timeoutMs),
      concurrency: optionalNumber(req.body?.concurrency),
    });
    res.json({ ok: true, data: result });
  }));

  app.post("/api/projects", auth.requireMutation.bind(auth), asyncHandler(async (req, res) => {
    const project = await projects.register({
      path: requireString(req.body?.path, "path"),
      name: optionalString(req.body?.name),
      slug: optionalString(req.body?.slug),
      permissionPreset: req.body?.permissionPreset,
      defaultMode: req.body?.defaultMode,
      pinned: optionalBoolean(req.body?.pinned),
      source: req.body?.source ?? "manual",
    });
    res.json({ ok: true, data: { project } });
  }));

  app.patch("/api/projects/:id", auth.requireMutation.bind(auth), asyncHandler(async (req, res) => {
    const project = await projects.update(routeParam(req.params.id, "id"), {
      name: optionalString(req.body?.name),
      slug: optionalString(req.body?.slug),
      permissionPreset: req.body?.permissionPreset,
      defaultMode: req.body?.defaultMode,
      pinned: optionalBoolean(req.body?.pinned),
    });
    res.json({ ok: true, data: { project } });
  }));

  app.delete("/api/projects/:id", auth.requireMutation.bind(auth), asyncHandler(async (req, res) => {
    const removed = projects.forget(routeParam(req.params.id, "id"));
    res.json({ ok: true, data: { removed } });
  }));

  app.get("/api/projects/:id/git-status", auth.requireRead.bind(auth), asyncHandler(async (req, res) => {
    const project = await projects.getViewById(routeParam(req.params.id, "id"));
    if (!project) {
      res.status(404).json(apiError("PROJECT_UNKNOWN", "Project not found."));
      return;
    }
    res.json({ ok: true, data: { status: await gitStatus(project) } });
  }));

  app.post("/api/folder-picker", auth.requireMutation.bind(auth), asyncHandler(async (_req, res) => {
    const supported = await folderPicker.isSupported();
    const path = supported ? await folderPicker.chooseDirectory() : undefined;
    res.json({ ok: true, data: { supported, path } });
  }));

  app.get("/api/agents", auth.requireRead.bind(auth), asyncHandler(async (req, res) => {
    const store = createLocalAgentStore(config);
    try {
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      const project = projectId ? await projects.getViewById(projectId) : undefined;
      const sessions = store
        .list(project ? { workspaceRoot: project.root } : {})
        .map(sanitizeAgentSession);
      res.json({ ok: true, data: { sessions } });
    } finally {
      store.close();
    }
  }));

  app.get("/api/diagnostics/troubleshooting", auth.requireRead.bind(auth), asyncHandler(async (_req, res) => {
    const troubleshootingPath = fileURLToPath(new URL("../../docs/gotchas.md", import.meta.url));
    const troubleshooting = await readFile(troubleshootingPath, "utf8");
    res.type("text/markdown").send(troubleshooting);
  }));

  app.use(express.static(dashboardBuildDirectory(), { fallthrough: true }));
  app.get("/{*path}", asyncHandler(async (_req, res) => {
    res.sendFile(fileURLToPath(new URL("../../dist/ui/dashboard.html", import.meta.url)));
  }));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const mapped = mapError(error);
    res.status(mapped.status).json(apiError(mapped.code, mapped.message));
  });

  return {
    app,
    close: async () => {
      operationRoutes?.close();
      handoffs.close?.();
      workspaceStore.close?.();
      projectStore.close?.();
    },
  };
}

function readWorkspaceLifecycle(
  workspaceStore: WorkspaceStore,
  runs: readonly StoredOperationRun[],
  agents: readonly LocalAgentRecord[],
): WorkspaceLifecycleAnalysis {
  const protectedWorkspaceIds = new Set<string>();
  for (const run of runs) {
    if (
      run.workspaceId
      && (
        run.state === "queued"
        || run.state === "running"
        || run.state === "blocked"
        || run.state === "stopping"
      )
    ) {
      protectedWorkspaceIds.add(run.workspaceId);
    }
  }
  for (const agent of agents) {
    if (
      agent.workspaceId
      && agent.disposition !== "needs_input"
      && (agent.status === "starting" || agent.status === "running")
    ) {
      protectedWorkspaceIds.add(agent.workspaceId);
    }
  }
  return analyzeWorkspaceLifecycle({
    sessions: workspaceStore.listSessions(),
    bindings: workspaceStore.listConversationBindings(),
    protectedWorkspaceIds,
  });
}

async function providerProfileCounts(
  config: ServerConfig,
  projects: ProjectView[],
): Promise<Map<LocalAgentProvider, number>> {
  if (!config.subagents) return new Map();
  const workspaceRoots = projects.length > 0
    ? projects.map((project) => project.root)
    : [config.allowedRoots[0] ?? process.cwd()];
  const profiles = (await Promise.all(
    workspaceRoots.map((root) => loadLocalAgentProfiles(config, root)),
  )).flat();
  const uniqueProfiles = new Map(profiles.map((profile) => [profile.filePath, profile]));
  const counts = new Map<LocalAgentProvider, number>();
  for (const profile of uniqueProfiles.values()) {
    counts.set(profile.provider, (counts.get(profile.provider) ?? 0) + 1);
  }
  return counts;
}

async function directoryAvailable(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function sanitizeAgentSession<T extends {
  latestResponse?: string;
  question?: string;
  error?: string;
}>(session: T): T {
  return {
    ...session,
    latestResponse: safeAgentPreview(session.latestResponse),
    question: safeAgentPreview(session.question),
    error: safeAgentPreview(session.error),
  };
}

function safeAgentPreview(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const redacted = redactForbiddenSensitiveContent(value);
  if (redacted.redacted) return redacted.value;
  const characters = Array.from(value);
  if (characters.length <= MAX_AGENT_PREVIEW_CHARACTERS) return value;
  return `${characters.slice(0, MAX_AGENT_PREVIEW_CHARACTERS).join("")}\n… preview truncated`;
}

function safeLocalPath(path: string): string {
  const homeRelative = relative(homedir(), path);
  if (
    homeRelative !== ""
    && homeRelative !== ".."
    && !homeRelative.startsWith(`..${sep}`)
  ) {
    return `~/${homeRelative.split(sep).join("/")}`;
  }
  return `<state>/${path.split(/[\\/]/).at(-1) ?? "devspace.sqlite"}`;
}

export async function assertDashboardAssets(): Promise<void> {
  await access(new URL("../../dist/ui/dashboard.html", import.meta.url));
}

function dashboardBuildDirectory(): string {
  return fileURLToPath(new URL("../../dist/ui", import.meta.url));
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res, next).catch(next);
  };
}

async function gitStatus(project: ProjectView): Promise<{ branch?: string; dirtyCount?: number; unavailable?: string }> {
  if (project.availability !== "available") return { unavailable: project.availability };
  const branch = await execGit(project.root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const porcelain = await execGit(project.root, ["status", "--porcelain"]);
  return {
    branch: branch.trim() || undefined,
    dirtyCount: porcelain.trim() ? porcelain.trim().split("\n").length : 0,
  };
}

function execGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: 3000, windowsHide: true }, (_error, stdout) => {
      resolve(stdout);
    });
  });
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
  return value;
}

function routeParam(value: string | string[] | undefined, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} is required.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : undefined;
}

function mapError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof OperationRouteError) {
    return { status: 400, code: "INVALID_OPERATION_CURSOR", message: error.message };
  }
  if (error instanceof ProjectPathError || error instanceof ProjectRegistryError) {
    return { status: 400, code: error.code, message: error.message };
  }
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : "Internal server error.",
  };
}
