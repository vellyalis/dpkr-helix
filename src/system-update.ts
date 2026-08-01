import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, win32 } from "node:path";

export const SYSTEM_UPDATE_PHASES = [
  "idle",
  "preflight",
  "applying",
  "up_to_date",
  "succeeded",
  "rolled_back",
  "rejected",
  "failed",
] as const;

export type SystemUpdatePhase = typeof SYSTEM_UPDATE_PHASES[number];

export interface SystemUpdateStatus extends Record<string, unknown> {
  available: boolean;
  phase: SystemUpdatePhase;
  active: boolean;
  message: string;
  requestId?: string;
  fromCommit?: string;
  targetCommit?: string;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  code?: string;
}

export interface SystemUpdateRequest extends Record<string, unknown> {
  accepted: boolean;
  requestId: string;
  status: SystemUpdateStatus;
  message: string;
}

export interface SystemUpdateController {
  getStatus(): Promise<SystemUpdateStatus>;
  requestUpdate(): Promise<SystemUpdateRequest>;
}

interface PortableSettings {
  schema?: unknown;
  sourceRoot?: unknown;
  tunnelMode?: unknown;
}

interface PersistedUpdateStatus {
  schema?: unknown;
  state?: unknown;
  requestId?: unknown;
  fromCommit?: unknown;
  targetCommit?: unknown;
  startedAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
  code?: unknown;
  updaterPid?: unknown;
}

interface SystemUpdateDependencies {
  platform: NodeJS.Platform;
  userHome: string;
  systemRoot?: string;
  access: typeof access;
  readFile: typeof readFile;
  spawn: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess;
  createRequestId: () => string;
  isProcessAlive: (pid: number) => boolean;
  now: () => number;
}

const ACTIVE_PHASES = new Set<SystemUpdatePhase>(["preflight", "applying"]);
const PENDING_LAUNCH_TTL_MS = 30_000;
const ACTIVE_STATUS_TTL_MS = 2 * 60 * 60 * 1_000;
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/;
const REQUEST_ID_PATTERN = /^[0-9a-f-]{16,64}$/i;
const STATUS_MESSAGES: Record<SystemUpdatePhase, string> = {
  idle: "No dpkr helix update has been requested on this installation.",
  preflight: "The candidate is being fetched and verified while the current service stays available.",
  applying: "The verified candidate is being installed. The MCP connection may reconnect briefly.",
  up_to_date: "This installation already matches origin/main.",
  succeeded: "The update completed and the replacement service passed health checks.",
  rolled_back: "The candidate failed after deployment began; the previous installation was restored.",
  rejected: "The update was rejected without replacing the running installation.",
  failed: "The update could not complete and requires local recovery.",
};

export function createWindowsSystemUpdateController(
  overrides: Partial<SystemUpdateDependencies> = {},
): SystemUpdateController {
  const dependencies: SystemUpdateDependencies = {
    platform: process.platform,
    userHome: homedir(),
    systemRoot: process.env.SystemRoot,
    access,
    readFile,
    spawn: (command, args, options) => spawn(command, args, options),
    createRequestId: randomUUID,
    isProcessAlive: (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    },
    now: Date.now,
    ...overrides,
  };
  const devspaceDir = join(dependencies.userHome, ".devspace");
  const settingsPath = join(devspaceDir, "windows-bootstrap.json");
  const statusPath = join(devspaceDir, "windows-update.json");
  const setupPath = join(devspaceDir, "setup-windows.ps1");
  let pendingLaunch: { requestId: string; startedAtMs: number } | undefined;

  function applyPendingLaunch(status: SystemUpdateStatus): SystemUpdateStatus {
    if (!pendingLaunch) return status;
    if (status.requestId === pendingLaunch.requestId) {
      if (!status.active) pendingLaunch = undefined;
      return status;
    }
    if (dependencies.now() - pendingLaunch.startedAtMs >= PENDING_LAUNCH_TTL_MS) {
      pendingLaunch = undefined;
      return status;
    }
    return {
      available: true,
      phase: "preflight",
      active: true,
      requestId: pendingLaunch.requestId,
      startedAt: new Date(pendingLaunch.startedAtMs).toISOString(),
      message: STATUS_MESSAGES.preflight,
    };
  }

  async function inspectInstallation(): Promise<{
    status: SystemUpdateStatus;
    sourceRoot?: string;
  }> {
    if (dependencies.platform !== "win32") {
      return {
        status: unavailableStatus(
          "WINDOWS_PORTABLE_SETUP_REQUIRED",
          "ChatGPT-initiated updates are available only for the portable Windows installation.",
        ),
      };
    }

    try {
      await Promise.all([dependencies.access(settingsPath), dependencies.access(setupPath)]);
    } catch {
      return {
        status: unavailableStatus(
          "PORTABLE_SETUP_NOT_INSTALLED",
          "The managed Windows setup is missing. Run the portable installer before requesting updates.",
        ),
      };
    }

    let settings: PortableSettings;
    try {
      settings = JSON.parse(await dependencies.readFile(settingsPath, "utf8")) as PortableSettings;
    } catch {
      return {
        status: unavailableStatus(
          "PORTABLE_SETTINGS_INVALID",
          "The managed Windows settings are unreadable. Repair the portable installation first.",
        ),
      };
    }
    if (typeof settings.sourceRoot !== "string" || !settings.sourceRoot.trim()) {
      return {
        status: unavailableStatus(
          "SOURCE_ROOT_MISSING",
          "The managed source checkout is not recorded. Repair the portable installation first.",
        ),
      };
    }
    if (settings.tunnelMode !== "External") {
      return {
        status: unavailableStatus(
          "STABLE_ENDPOINT_REQUIRED",
          "ChatGPT-initiated updates require an External stable endpoint so the same connection can recover after restart.",
        ),
      };
    }

    let persisted: PersistedUpdateStatus | undefined;
    try {
      persisted = JSON.parse(await dependencies.readFile(statusPath, "utf8")) as PersistedUpdateStatus;
    } catch (error) {
      if (!isMissingFileError(error)) {
        return {
          sourceRoot: settings.sourceRoot,
          status: invalidStatus(),
        };
      }
    }

    return {
      sourceRoot: settings.sourceRoot,
      status: applyPendingLaunch(sanitizePersistedStatus(
        persisted,
        dependencies.isProcessAlive,
        dependencies.now(),
      )),
    };
  }

  return {
    async getStatus() {
      return (await inspectInstallation()).status;
    },

    async requestUpdate() {
      const installation = await inspectInstallation();
      const pending = pendingLaunch;
      if (
        pending
        && dependencies.now() - pending.startedAtMs < PENDING_LAUNCH_TTL_MS
      ) {
        const status = applyPendingLaunch(installation.status);
        return {
          accepted: false,
          requestId: pending.requestId,
          status,
          message: "An update is already starting; no duplicate process was started.",
        };
      }
      if (!installation.status.available || !installation.sourceRoot) {
        return {
          accepted: false,
          requestId: "unavailable",
          status: installation.status,
          message: installation.status.message,
        };
      }
      if (installation.status.active) {
        return {
          accepted: false,
          requestId: installation.status.requestId ?? "already-running",
          status: installation.status,
          message: "An update is already running; no duplicate process was started.",
        };
      }

      const requestId = dependencies.createRequestId();
      pendingLaunch = { requestId, startedAtMs: dependencies.now() };
      const powershell = dependencies.systemRoot
        ? win32.join(
            dependencies.systemRoot,
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe",
          )
        : "powershell.exe";
      try {
        await launchHiddenUpdater(
          dependencies,
          powershell,
          [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            setupPath,
            "-Mode",
            "LaunchUpdate",
            "-UpdateRequestId",
            requestId,
          ],
          installation.sourceRoot,
        );
      } catch {
        pendingLaunch = undefined;
        throw new Error("The managed updater could not be started. Retry or use the local setup command.");
      }

      return {
        accepted: true,
        requestId,
        status: {
          available: true,
          phase: "preflight",
          active: true,
          requestId,
          message: STATUS_MESSAGES.preflight,
        },
        message:
          "Update accepted. Preflight keeps the current service available; after verified deployment begins, reconnect and read update status.",
      };
    },
  };
}

async function launchHiddenUpdater(
  dependencies: SystemUpdateDependencies,
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = dependencies.spawn(command, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout?.resume();
    child.stderr?.resume();
    let settled = false;
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve();
      else reject(new Error(`Update launcher exited with code ${code ?? "unknown"}.`));
    });
  });
}

function sanitizePersistedStatus(
  status: PersistedUpdateStatus | undefined,
  isProcessAlive: (pid: number) => boolean,
  nowMs: number,
): SystemUpdateStatus {
  if (!status) {
    return {
      available: true,
      phase: "idle",
      active: false,
      message: STATUS_MESSAGES.idle,
    };
  }
  if (status.schema !== "dpkr-helix-windows-update/v1" || !isUpdatePhase(status.state)) {
    return invalidStatus();
  }

  const persistedPhase = status.state;
  const updaterPid = typeof status.updaterPid === "number"
    && Number.isSafeInteger(status.updaterPid)
    && status.updaterPid > 0
    ? status.updaterPid
    : undefined;
  const interrupted = ACTIVE_PHASES.has(persistedPhase)
    && (
      updaterPid === undefined
      || !isProcessAlive(updaterPid)
    );
  const stale = !interrupted
    && ACTIVE_PHASES.has(persistedPhase)
    && isActiveStatusStale(status, nowMs);
  const phase: SystemUpdatePhase = interrupted ? "failed" : persistedPhase;
  return {
    available: true,
    phase,
    active: ACTIVE_PHASES.has(phase),
    message: interrupted
      ? "The previous updater stopped before recording a terminal result; a new explicit update request may retry safely."
      : stale
        ? "The updater process is still running but has not reported progress; do not retry while it remains active."
      : STATUS_MESSAGES[phase],
    ...optionalValidatedString("requestId", status.requestId, REQUEST_ID_PATTERN),
    ...optionalValidatedString("fromCommit", status.fromCommit, COMMIT_PATTERN),
    ...optionalValidatedString("targetCommit", status.targetCommit, COMMIT_PATTERN),
    ...optionalDate("startedAt", status.startedAt),
    ...optionalDate("updatedAt", status.updatedAt),
    ...optionalDate("completedAt", status.completedAt),
    ...(interrupted
      ? { code: "UPDATE_INTERRUPTED" }
      : stale
        ? { code: "UPDATE_STATUS_STALE" }
      : typeof status.code === "string" && /^[A-Z0-9_]{1,64}$/.test(status.code)
        ? { code: status.code }
        : {}),
  };
}

function isActiveStatusStale(status: PersistedUpdateStatus, nowMs: number): boolean {
  const timestamp = typeof status.updatedAt === "string"
    ? Date.parse(status.updatedAt)
    : typeof status.startedAt === "string"
      ? Date.parse(status.startedAt)
      : Number.NaN;
  return Number.isFinite(timestamp) && nowMs - timestamp > ACTIVE_STATUS_TTL_MS;
}

function invalidStatus(): SystemUpdateStatus {
  return {
    available: true,
    phase: "failed",
    active: false,
    code: "UPDATE_STATUS_INVALID",
    message: "The previous update status is invalid; a new explicit update request may retry safely.",
  };
}

function unavailableStatus(code: string, message: string): SystemUpdateStatus {
  return {
    available: false,
    phase: "idle",
    active: false,
    code,
    message,
  };
}

function isUpdatePhase(value: unknown): value is SystemUpdatePhase {
  return typeof value === "string" && (SYSTEM_UPDATE_PHASES as readonly string[]).includes(value);
}

function optionalValidatedString<K extends string>(
  key: K,
  value: unknown,
  pattern: RegExp,
): Partial<Record<K, string>> {
  return typeof value === "string" && pattern.test(value)
    ? { [key]: value } as Partial<Record<K, string>>
    : {};
}

function optionalDate<K extends string>(key: K, value: unknown): Partial<Record<K, string>> {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return {};
  return { [key]: value } as Partial<Record<K, string>>;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
