import {
  spawn,
  spawnSync,
  type SpawnOptions,
} from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { dashboardUrl, openBrowser } from "./admin/browser-open.js";
import { loadConfig, type ServerConfig } from "./config.js";
import {
  createWindowsSystemUpdateController,
  type SystemUpdateStatus,
} from "./system-update.js";
import {
  findCodexInvocation,
  type ExecutableInvocation,
} from "./helix-command.js";

interface WindowsBootstrapState {
  desiredState?: unknown;
  runtimePackageSha256?: unknown;
  runtimeFingerprint?: unknown;
}

interface WindowsRuntimeState {
  schema?: unknown;
  devspacePid?: unknown;
  runtimePackageSha256?: unknown;
  devspaceRuntimeFingerprint?: unknown;
}

interface WindowsRecoveryState {
  state?: unknown;
  code?: unknown;
}

const require = createRequire(import.meta.url);
const TERMINAL_UPDATE_PHASES = new Set([
  "up_to_date",
  "succeeded",
  "rolled_back",
  "rejected",
  "failed",
]);

export function readPackageVersion(): string {
  const packageJson = require("../package.json") as { version?: unknown };
  if (typeof packageJson.version !== "string") {
    throw new Error("Unable to read dpkr helix package version.");
  }
  return packageJson.version;
}

export async function ensureHelixRunning(config: ServerConfig): Promise<void> {
  const localUrl = buildLocalHealthUrl(config);
  if (await probeHttp(localUrl, 2_500) === 200) return;

  console.log("dpkr helix is offline; starting the managed runtime...");
  const code = await runManagedSetup("Start", [
    "-SkipVerification",
    "-SkipBrowserLaunch",
  ]);
  if (code !== 0) {
    throw new Error(`Managed dpkr helix start failed with exit code ${code}.`);
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await probeHttp(localUrl, 2_500) === 200) return;
    await delay(500);
  }
  throw new Error("dpkr helix did not become healthy after managed Start.");
}

export async function runManagedSetup(
  mode: "Start" | "Stop",
  extraArgs: string[] = [],
): Promise<number> {
  const paths = managedWindowsPaths();
  assertWindowsManagedScript(paths.setup, "setup-windows.ps1");
  return runInherited(paths.powershell, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    paths.setup,
    "-Mode",
    mode,
    ...extraArgs,
  ], { cwd: dirname(paths.setup) });
}

export async function runManagedRecovery(): Promise<number> {
  const paths = managedWindowsPaths();
  assertWindowsManagedScript(paths.recovery, "setup-windows-recovery.ps1");
  return runInherited(paths.powershell, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    paths.recovery,
    "-Mode",
    "Run",
  ], { cwd: dirname(paths.recovery) });
}

export async function runDoctor(): Promise<number> {
  await printStatus();
  const helixCli = join(dirname(require.resolve("../package.json")), "dist", "cli.js");
  if (isFile(helixCli)) {
    console.log("\nLocal dpkr helix doctor:");
    const helixCode = await runInherited(
      process.execPath,
      [helixCli, "doctor"],
      { cwd: process.cwd() },
    );
    if (helixCode !== 0) return helixCode;
  }
  const invocation = findCodexInvocation();
  console.log("\nOfficial Codex doctor:");
  return runInherited(
    invocation.command,
    [...invocation.prefixArgs, "doctor"],
    { cwd: process.cwd() },
  );
}

export function openDashboard(): void {
  const config = loadConfig();
  if (!config.dashboard.enabled) {
    throw new Error("Dashboard is disabled in dpkr helix configuration.");
  }
  if (!config.dashboard.token) {
    throw new Error("Dashboard token is missing. Run `devspace init`.");
  }
  const target = dashboardUrl(
    config.dashboard.host,
    config.dashboard.port,
    config.dashboard.token,
  );
  openBrowser(target.url);
  console.log(`Opened ${target.sanitizedUrl}`);
}

export async function runUpdateAndWait(): Promise<number> {
  const controller = createWindowsSystemUpdateController();
  const request = await controller.requestUpdate();
  console.log(request.message);
  let previousPhase: string | undefined;

  while (true) {
    const status = await controller.getStatus();
    if (status.phase !== previousPhase) {
      console.log(`[${status.phase}] ${status.message}`);
      previousPhase = status.phase;
    }
    if (TERMINAL_UPDATE_PHASES.has(status.phase)) {
      return status.phase === "succeeded" || status.phase === "up_to_date" ? 0 : 1;
    }
    if (!status.active && !request.accepted) {
      return status.phase === "idle" ? 1 : 0;
    }
    await delay(1_000);
  }
}

export async function printStatus(): Promise<void> {
  const config = loadConfig();
  const devspaceDir = join(homedir(), ".devspace");
  const bootstrap = await readJsonIfExists<WindowsBootstrapState>(
    join(devspaceDir, "windows-bootstrap.json"),
  );
  const runtime = await readJsonIfExists<WindowsRuntimeState>(
    join(devspaceDir, "windows-runtime.json"),
  );
  const recovery = await readJsonIfExists<WindowsRecoveryState>(
    join(devspaceDir, "windows-recovery.json"),
  );
  const update = await createWindowsSystemUpdateController().getStatus();
  const localUrl = buildLocalHealthUrl(config);
  const localHealth = await probeHttp(localUrl, 3_000);
  const publicHealth = await probeHttp(
    `${config.publicBaseUrl.replace(/\/+$/, "")}/healthz`,
    8_000,
  );
  const codex = readCodexStatus();
  const taskInstalled = process.platform === "win32" && isRecoveryTaskInstalled();
  const runtimePid = safePositiveInteger(runtime?.devspacePid);
  const processRunning = runtimePid ? isProcessRunning(runtimePid) : false;
  const attested = runtime?.schema === "devspace-windows-runtime/v3"
    && typeof bootstrap?.runtimePackageSha256 === "string"
    && bootstrap.runtimePackageSha256 === runtime.runtimePackageSha256
    && typeof bootstrap.runtimeFingerprint === "string"
    && bootstrap.runtimeFingerprint === runtime.devspaceRuntimeFingerprint;

  console.log(`dpkr helix ${readPackageVersion()}`);
  console.log(
    `service   ${localHealth === 200 && processRunning ? "healthy" : "unhealthy"}${runtimePid ? ` (PID ${runtimePid})` : ""}`,
  );
  console.log(
    `runtime   ${attested ? "v3 attested" : String(runtime?.schema ?? "unavailable")}`,
  );
  console.log(`local     ${formatHttpStatus(localHealth)} ${localUrl}`);
  console.log(`public    ${formatHttpStatus(publicHealth)} ${config.publicBaseUrl}`);
  console.log(`desired   ${String(bootstrap?.desiredState ?? "unknown")}`);
  console.log(
    `recovery  ${taskInstalled ? "task ready" : "task missing"} · ${String(recovery?.code ?? recovery?.state ?? "no result")}`,
  );
  console.log(`update    ${formatUpdateStatus(update)}`);
  console.log(`codex     ${codex.version} · ${codex.login}`);
}

export async function runInherited(
  command: string,
  args: readonly string[],
  options: Pick<SpawnOptions, "cwd" | "env">,
): Promise<number> {
  return new Promise<number>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: "inherit",
      shell: false,
      windowsHide: false,
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (typeof code === "number") {
        resolvePromise(code);
        return;
      }
      resolvePromise(signal ? 130 : 1);
    });
  });
}

function readCodexStatus(): { version: string; login: string } {
  try {
    const invocation = findCodexInvocation();
    return {
      version: captureCommand(invocation, ["--version"]) ?? "unavailable",
      login: captureCommand(invocation, ["login", "status"])
        ?? "login status unavailable",
    };
  } catch {
    return {
      version: "unavailable",
      login: "official Codex CLI not found",
    };
  }
}

function captureCommand(
  invocation: ExecutableInvocation,
  args: string[],
): string | undefined {
  const result = spawnSync(
    invocation.command,
    [...invocation.prefixArgs, ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      timeout: 10_000,
    },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" · ");
  return output || undefined;
}

function isRecoveryTaskInstalled(): boolean {
  const schtasks = join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "schtasks.exe",
  );
  if (!isFile(schtasks)) return false;
  const result = spawnSync(
    schtasks,
    ["/Query", "/TN", "\\dpkr helix Recovery", "/FO", "LIST"],
    {
      stdio: "ignore",
      windowsHide: true,
      shell: false,
      timeout: 10_000,
    },
  );
  return result.status === 0;
}

function managedWindowsPaths(): {
  powershell: string;
  setup: string;
  recovery: string;
} {
  if (process.platform !== "win32") {
    throw new Error(
      "Managed lifecycle commands are available only on the portable Windows installation.",
    );
  }
  const root = process.env.SystemRoot ?? "C:\\Windows";
  const dir = join(homedir(), ".devspace");
  const powershell = join(
    root,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  return {
    powershell: isFile(powershell) ? powershell : "powershell.exe",
    setup: join(dir, "setup-windows.ps1"),
    recovery: join(dir, "setup-windows-recovery.ps1"),
  };
}

function assertWindowsManagedScript(path: string, name: string): void {
  if (!isFile(path)) {
    throw new Error(
      `Managed ${name} is missing. Repair the portable dpkr helix installation first.`,
    );
  }
}

async function probeHttp(
  url: string,
  timeoutMs: number,
): Promise<number | undefined> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "dpkr-helix-launcher/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.status;
  } catch {
    return undefined;
  }
}

function buildLocalHealthUrl(config: ServerConfig): string {
  const host = config.host === "0.0.0.0" || config.host === "::"
    ? "127.0.0.1"
    : config.host;
  const formatted = host.includes(":") && !host.startsWith("[")
    ? `[${host}]`
    : host;
  return `http://${formatted}:${config.port}/healthz`;
}

async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function formatUpdateStatus(status: SystemUpdateStatus): string {
  const code = status.code ? ` · ${status.code}` : "";
  return `${status.phase}${code}`;
}

function formatHttpStatus(status: number | undefined): string {
  return status === undefined ? "unreachable" : String(status);
}

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function safePositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
