import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { ServerConfig } from "./config.js";
import { runLocalAgentProvider } from "./local-agent-adapters.js";
import { assertLocalAgentProviderAvailable } from "./local-agent-availability.js";
import { normalizeLocalAgentFailure } from "./local-agent-failure.js";
import {
  isLocalAgentProvider,
  loadLocalAgentProfiles,
  type LocalAgentProfile,
  type LocalAgentProvider,
} from "./local-agent-profiles.js";
import {
  runAuthorizedLocalAgentAction,
  type AuthorizedLocalAgentActionInput,
  type LocalAgentPolicyScope,
} from "./local-agent-policy.js";
import {
  createLocalAgentStore,
  type CreateLocalAgentRecordInput,
  type LocalAgentListScope,
  type LocalAgentRecord,
} from "./local-agent-store.js";
import {
  formatAvailableLocalAgentTargets,
  resolveLocalAgentTarget,
} from "./local-agent-targets.js";
import { validateLocalAgentOutcome } from "./local-agent-outcome.js";
import { assertNoForbiddenSensitiveContent } from "./sensitive-content.js";
import type {
  LocalAgentRunInput,
  LocalAgentRunResult,
  LocalAgentWriteMode,
} from "./local-agent-runtime.js";

interface LocalAgentStoreOwner {
  list(scope?: LocalAgentListScope): LocalAgentRecord[];
  get(idOrPrefix: string): LocalAgentRecord | undefined;
  create(input: CreateLocalAgentRecordInput): LocalAgentRecord;
  update(
    id: string,
    patch: Partial<Omit<LocalAgentRecord, "id" | "createdAt">>,
  ): LocalAgentRecord;
  touch?(id: string): LocalAgentRecord;
  close?(): void;
}

export interface StartLocalAgentInput {
  scope: LocalAgentPolicyScope;
  target: string;
  prompt: string;
  model?: string;
  thinking?: string;
}

export interface ResumeLocalAgentInput {
  id: string;
  prompt: string;
  model?: string;
  thinking?: string;
}

export interface LocalAgentStatusOptions {
  waitMs?: number;
  pollMs?: number;
}

export type LocalAgentWorkerSpawner = (
  agentId: string,
  promptFile: string,
) => void | Promise<void>;

export const LOCAL_AGENT_WORKER_ACKNOWLEDGEMENT_TIMEOUT_MS = 30_000;
export const LOCAL_AGENT_WORKER_HEARTBEAT_INTERVAL_MS = 30_000;
export const LOCAL_AGENT_STALE_ACTIVE_AFTER_MS = 60 * 60 * 1_000;
export const LOCAL_AGENT_STALE_RECONCILIATION_INTERVAL_MS = 5 * 60 * 1_000;

export interface DetachedLocalAgentWorkerSpawnerOptions {
  acknowledgementTimeoutMs?: number;
}

type LocalAgentAuthorizer = <T>(input: AuthorizedLocalAgentActionInput<T>) => Promise<T>;

export interface LocalAgentObservation {
  created(record: LocalAgentRecord): void;
  statusChanged(record: LocalAgentRecord): void;
  assistantMessage(record: LocalAgentRecord, text: string): void;
  resultAvailable(record: LocalAgentRecord): void;
  inputRequired(record: LocalAgentRecord): void;
}

export interface LocalAgentServiceOptions {
  config: ServerConfig;
  writeMode: LocalAgentWriteMode;
  store?: LocalAgentStoreOwner;
  profileLoader?: (config: ServerConfig, workspaceRoot: string) => Promise<LocalAgentProfile[]>;
  providerAvailabilityChecker?: (provider: LocalAgentProvider) => void;
  providerRunner?: (
    provider: LocalAgentProvider,
    input: LocalAgentRunInput,
  ) => Promise<LocalAgentRunResult>;
  workerSpawner: LocalAgentWorkerSpawner;
  promptFileWriter?: (prompt: string) => string;
  promptFileReader?: (path: string) => Promise<string>;
  promptFileCleanup?: (path: string) => Promise<void>;
  authorizer?: LocalAgentAuthorizer;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
  workerHeartbeatIntervalMs?: number | false;
  staleActiveAfterMs?: number | false;
  staleReconciliationIntervalMs?: number | false;
  observation?: LocalAgentObservation;
}

export class LocalAgentService {
  private readonly config: ServerConfig;
  private readonly writeMode: LocalAgentWriteMode;
  private readonly store: LocalAgentStoreOwner;
  private readonly profileLoader: NonNullable<LocalAgentServiceOptions["profileLoader"]>;
  private readonly providerAvailabilityChecker: NonNullable<
    LocalAgentServiceOptions["providerAvailabilityChecker"]
  >;
  private readonly providerRunner: NonNullable<LocalAgentServiceOptions["providerRunner"]>;
  private readonly workerSpawner: LocalAgentWorkerSpawner;
  private readonly promptFileWriter: NonNullable<LocalAgentServiceOptions["promptFileWriter"]>;
  private readonly promptFileReader: NonNullable<LocalAgentServiceOptions["promptFileReader"]>;
  private readonly promptFileCleanup: NonNullable<LocalAgentServiceOptions["promptFileCleanup"]>;
  private readonly authorizer: LocalAgentAuthorizer;
  private readonly now: () => number;
  private readonly delay: (ms: number) => Promise<void>;
  private readonly workerHeartbeatIntervalMs: number | undefined;
  private readonly staleActiveAfterMs: number | undefined;
  private readonly staleReconciliationTimer: NodeJS.Timeout | undefined;
  private readonly observation?: LocalAgentObservation;

  constructor(options: LocalAgentServiceOptions) {
    this.config = options.config;
    this.writeMode = options.writeMode;
    this.store = options.store ?? createLocalAgentStore(options.config);
    this.now = options.now ?? Date.now;
    this.profileLoader = options.profileLoader ?? loadLocalAgentProfiles;
    this.providerAvailabilityChecker =
      options.providerAvailabilityChecker ?? ((provider) => {
        assertLocalAgentProviderAvailable(
          provider,
          process.env,
          this.store.list(),
          this.now(),
        );
      });
    this.providerRunner = options.providerRunner ?? runLocalAgentProvider;
    this.workerSpawner = options.workerSpawner;
    this.promptFileWriter = options.promptFileWriter ?? writeLocalAgentPromptFile;
    this.promptFileReader = options.promptFileReader ?? ((path) => readFile(path, "utf8"));
    this.promptFileCleanup = options.promptFileCleanup ?? cleanupLocalAgentPromptFile;
    this.authorizer = options.authorizer ?? runAuthorizedLocalAgentAction;
    this.delay = options.delay ?? sleep;
    this.workerHeartbeatIntervalMs = optionalDuration(
      options.workerHeartbeatIntervalMs,
      LOCAL_AGENT_WORKER_HEARTBEAT_INTERVAL_MS,
    );
    this.staleActiveAfterMs = optionalDuration(
      options.staleActiveAfterMs,
      LOCAL_AGENT_STALE_ACTIVE_AFTER_MS,
    );
    this.observation = options.observation;
    this.reconcileStaleActiveWorkers();
    const staleReconciliationIntervalMs = this.staleActiveAfterMs
      ? optionalDuration(
          options.staleReconciliationIntervalMs,
          LOCAL_AGENT_STALE_RECONCILIATION_INTERVAL_MS,
        )
      : undefined;
    this.staleReconciliationTimer = staleReconciliationIntervalMs
      ? setInterval(
          () => this.reconcileStaleActiveWorkers(),
          staleReconciliationIntervalMs,
        )
      : undefined;
    this.staleReconciliationTimer?.unref();
  }

  list(scope: LocalAgentListScope): LocalAgentRecord[] {
    return this.store.list(scope);
  }

  getStatus(id: string): LocalAgentRecord {
    const record = this.store.get(id);
    if (!record) throw new Error(`Unknown subagent id: ${id}`);
    return record;
  }

  async waitForStatus(
    id: string,
    options: LocalAgentStatusOptions = {},
  ): Promise<LocalAgentRecord> {
    const waitMs = options.waitMs ?? 15_000;
    const pollMs = Math.max(1, options.pollMs ?? 500);
    const deadline = this.now() + waitMs;
    let record = this.getStatus(id);

    while (isLocalAgentActive(record)) {
      const remainingMs = deadline - this.now();
      if (remainingMs <= 0) break;
      await this.delay(Math.min(pollMs, remainingMs));
      record = this.store.get(id) ?? record;
    }

    return record;
  }

  async start(input: StartLocalAgentInput): Promise<LocalAgentRecord> {
    assertSafeLocalAgentRequest([
      ["target", input.target],
      ["prompt", input.prompt],
      ["model", input.model ?? ""],
      ["thinking", input.thinking ?? ""],
    ]);
    const existing = this.store.get(input.target);
    if (existing) {
      return this.resume({
        id: existing.id,
        prompt: input.prompt,
        model: input.model,
        thinking: input.thinking,
      });
    }

    return this.startNew(input);
  }

  async startNew(input: StartLocalAgentInput): Promise<LocalAgentRecord> {
    assertSafeLocalAgentRequest([
      ["target", input.target],
      ["prompt", input.prompt],
      ["model", input.model ?? ""],
      ["thinking", input.thinking ?? ""],
    ]);
    if (this.store.get(input.target)) {
      throw new Error(
        "delegate_task accepts a profile or provider target; use continue_agent for an existing agent.",
      );
    }

    const profiles = await this.profileLoader(this.config, input.scope.workspaceRoot);
    const target = resolveLocalAgentTarget(
      input.target,
      profiles,
      input.model,
      input.thinking,
    );
    if (!target) {
      throw new Error(
        `Unknown subagent profile, provider, or id: ${input.target}. Available ${formatAvailableLocalAgentTargets(profiles)}`,
      );
    }

    return this.authorizer({
      config: this.config,
      scope: input.scope,
      writeMode: this.writeMode,
      action: async () => {
        this.providerAvailabilityChecker(target.provider);
        const promptFile = this.promptFileWriter(input.prompt);
        let record: LocalAgentRecord | undefined;
        try {
          record = this.store.create({
            workspaceId: input.scope.workspaceId,
            workspaceRoot: input.scope.workspaceRoot,
            profileName: target.name,
            provider: target.provider,
            model: target.model,
            thinking: target.thinking,
          });
          this.observe(() => this.observation?.created(record!));
          await this.workerSpawner(record.id, promptFile);
          return record;
        } catch (error) {
          try {
            if (record) this.recordLaunchError(record.id, error);
          } finally {
            await this.promptFileCleanup(promptFile);
          }
          throw error;
        }
      },
    });
  }

  async resume(input: ResumeLocalAgentInput): Promise<LocalAgentRecord> {
    assertSafeLocalAgentRequest([
      ["id", input.id],
      ["prompt", input.prompt],
      ["model", input.model ?? ""],
      ["thinking", input.thinking ?? ""],
    ]);
    const existing = this.getStatus(input.id);
    return this.authorizer({
      config: this.config,
      scope: {
        workspaceId: existing.workspaceId,
        workspaceRoot: existing.workspaceRoot,
      },
      writeMode: this.writeMode,
      action: async () => {
        if (!isLocalAgentProvider(existing.provider)) {
          throw new Error(`Unknown subagent provider for existing session: ${existing.provider}`);
        }
        const profiles = await this.profileLoader(this.config, existing.workspaceRoot);
        const isRawProviderSession = existing.profileName === existing.provider;
        if (isRawProviderSession) {
          this.providerAvailabilityChecker(existing.provider);
        } else {
          const profile = profiles.find((candidate) => candidate.name === existing.profileName);
          if (!profile) {
            throw new Error(`Unknown subagent profile for existing session: ${existing.profileName}`);
          }
          if (profile.provider !== existing.provider) {
            throw new Error(
              `Subagent profile provider changed for existing session: ${existing.profileName}`,
            );
          }
          this.providerAvailabilityChecker(profile.provider);
        }
        const promptFile = this.promptFileWriter(input.prompt);
        let updated: LocalAgentRecord | undefined;
        try {
          updated = this.store.update(existing.id, {
            status: "starting",
            model: input.model ?? existing.model,
            thinking: input.thinking ?? existing.thinking,
            latestResponse: undefined,
            disposition: undefined,
            question: undefined,
            error: undefined,
            failureCode: undefined,
          });
          this.observe(() => this.observation?.statusChanged(updated!));
          await this.workerSpawner(existing.id, promptFile);
          return updated;
        } catch (error) {
          try {
            if (updated) this.recordLaunchError(existing.id, error);
          } finally {
            await this.promptFileCleanup(promptFile);
          }
          throw error;
        }
      },
    });
  }

  async runWorker(id: string, promptFile: string): Promise<void> {
    const record = this.getStatus(id);
    let heartbeat: NodeJS.Timeout | undefined;
    try {
      await this.authorizer({
        config: this.config,
        scope: {
          workspaceId: record.workspaceId,
          workspaceRoot: record.workspaceRoot,
        },
        writeMode: this.writeMode,
        action: async () => {
          const running = this.store.update(record.id, {
            status: "running",
            error: undefined,
            failureCode: undefined,
          });
          this.observe(() => this.observation?.statusChanged(running));
          heartbeat = this.startWorkerHeartbeat(record.id);
          try {
            const profiles = await this.profileLoader(this.config, record.workspaceRoot);
            const profile = profiles.find((candidate) => candidate.name === record.profileName);
            const prompt = await this.promptFileReader(promptFile);
            const result = profile
              ? await this.runProfile(profile, record, prompt)
              : await this.runRawProvider(record, prompt);
            const outcome = result.outcome
              ? validateLocalAgentOutcome(result.outcome)
              : undefined;
            if (outcome) {
              assertNoForbiddenSensitiveContent("Local-agent outcome", [
                ["report", outcome.report],
                ["question", outcome.question ?? ""],
              ]);
            }
            const completed = this.store.update(record.id, {
              providerSessionId: result.providerSessionId ?? undefined,
              status: "idle",
              latestResponse: outcome ? outcome.report : result.finalResponse,
              disposition: outcome?.disposition,
              question: outcome?.question,
              error: undefined,
              failureCode: undefined,
            });
            this.observe(() => this.observation?.statusChanged(completed));
            this.observe(() => outcome?.disposition === "needs_input"
              ? this.observation?.inputRequired(completed)
              : this.observation?.resultAvailable(completed));
          } catch (error) {
            const failure = normalizeLocalAgentFailure(
              isLocalAgentProvider(record.provider) ? record.provider : undefined,
              error,
              this.now(),
            );
            const failed = this.store.update(record.id, {
              status: "error",
              error: failure.message,
              failureCode: failure.code,
            });
            this.observe(() => this.observation?.statusChanged(failed));
          }
        },
      });
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      await this.promptFileCleanup(promptFile);
    }
  }

  close(): void {
    if (this.staleReconciliationTimer) {
      clearInterval(this.staleReconciliationTimer);
    }
    this.store.close?.();
  }

  private recordLaunchError(id: string, error: unknown): void {
    const current = this.store.get(id);
    const provider = current && isLocalAgentProvider(current.provider)
      ? current.provider
      : undefined;
    const failure = normalizeLocalAgentFailure(provider, error, this.now());
    const failed = this.store.update(id, {
      status: "error",
      error: failure.message,
      failureCode: failure.code,
    });
    this.observe(() => this.observation?.statusChanged(failed));
  }

  private startWorkerHeartbeat(id: string): NodeJS.Timeout | undefined {
    if (!this.workerHeartbeatIntervalMs || !this.store.touch) return undefined;
    const timer = setInterval(() => {
      try {
        this.store.touch?.(id);
      } catch {
        // A heartbeat must never interrupt provider execution.
      }
    }, this.workerHeartbeatIntervalMs);
    timer.unref();
    return timer;
  }

  private reconcileStaleActiveWorkers(): void {
    if (!this.staleActiveAfterMs) return;
    const cutoff = this.now() - this.staleActiveAfterMs;
    let records: LocalAgentRecord[];
    try {
      records = this.store.list();
    } catch {
      return;
    }

    for (const record of records) {
      if (!isLocalAgentActive(record)) continue;
      const updatedAt = Date.parse(record.updatedAt);
      if (!Number.isFinite(updatedAt) || updatedAt > cutoff) continue;
      try {
        const current = this.store.get(record.id);
        if (
          !current
          || !isLocalAgentActive(current)
          || current.updatedAt !== record.updatedAt
        ) {
          continue;
        }
        const failed = this.store.update(current.id, {
          status: "error",
          disposition: undefined,
          question: undefined,
          error: "Local agent worker stopped reporting activity and was reconciled as interrupted.",
          failureCode: "temporary_failure",
        });
        this.observe(() => this.observation?.statusChanged(failed));
      } catch {
        // Reconciliation must not prevent the service from starting.
      }
    }
  }

  private runProfile(
    profile: LocalAgentProfile,
    record: LocalAgentRecord,
    prompt: string,
  ): Promise<LocalAgentRunResult> {
    const body = profile.body.trim();
    const fullPrompt = body ? `${body}\n\nTask:\n${prompt}` : prompt;
    return this.providerRunner(profile.provider, {
      prompt: fullPrompt,
      workspace: record.workspaceRoot,
      providerSessionId: record.providerSessionId,
      writeMode: this.writeMode,
      model: record.model ?? profile.model,
      thinking: record.thinking ?? profile.thinking,
      onAssistantMessage: (text) => {
        this.observe(() => this.observation?.assistantMessage(record, text));
      },
    });
  }

  private runRawProvider(
    record: LocalAgentRecord,
    prompt: string,
  ): Promise<LocalAgentRunResult> {
    if (record.profileName !== record.provider || !isLocalAgentProvider(record.provider)) {
      throw new Error(`Subagent profile not found: ${record.profileName}`);
    }
    return this.providerRunner(record.provider, {
      prompt,
      workspace: record.workspaceRoot,
      providerSessionId: record.providerSessionId,
      writeMode: this.writeMode,
      model: record.model,
      thinking: record.thinking,
      onAssistantMessage: (text) => {
        this.observe(() => this.observation?.assistantMessage(record, text));
      },
    });
  }

  private observe(action: () => void): void {
    try {
      action();
    } catch {
      // Observability must not change the canonical local-agent lifecycle.
    }
  }
}

export function createDetachedLocalAgentWorkerSpawner(
  workerFilePath: string,
  options: DetachedLocalAgentWorkerSpawnerOptions = {},
): LocalAgentWorkerSpawner {
  const acknowledgementTimeoutMs = Math.max(
    1,
    options.acknowledgementTimeoutMs
      ?? LOCAL_AGENT_WORKER_ACKNOWLEDGEMENT_TIMEOUT_MS,
  );

  return (agentId, promptFile) => {
    const child = spawn(process.execPath, [
      ...process.execArgv,
      workerFilePath,
      agentId,
      "--prompt-file",
      promptFile,
    ], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: process.env,
      windowsHide: true,
    });
    return new Promise<void>((resolveReady, rejectReady) => {
      const timeout = setTimeout(() => {
        child.kill();
        rejectReady(new Error(
          `Local agent worker did not acknowledge launch within ${acknowledgementTimeoutMs}ms: ${agentId}`,
        ));
      }, acknowledgementTimeoutMs);

      const fail = (error: Error) => {
        clearTimeout(timeout);
        rejectReady(error);
      };
      child.once("error", fail);
      child.once("exit", (code) => {
        fail(new Error(`Local agent worker exited before launch acknowledgement: ${code ?? "unknown"}`));
      });
      child.once("message", (message) => {
        if (
          typeof message !== "object" ||
          message === null ||
          (message as { type?: unknown }).type !== "devspace-agent-worker-ready" ||
          (message as { id?: unknown }).id !== agentId
        ) {
          return;
        }
        clearTimeout(timeout);
        child.removeAllListeners("error");
        child.removeAllListeners("exit");
        if (child.connected) child.disconnect();
        child.unref();
        resolveReady();
      });
    });
  };
}

export function writeLocalAgentPromptFile(prompt: string): string {
  const directory = mkdtempSync(join(tmpdir(), "devspace-agent-prompt-"));
  const filePath = join(directory, "prompt.txt");
  writeFileSync(filePath, prompt, { mode: 0o600 });
  return filePath;
}

export async function cleanupLocalAgentPromptFile(promptFile: string): Promise<void> {
  const resolvedFile = resolve(promptFile);
  const directory = dirname(resolvedFile);
  const tempRoot = resolve(tmpdir());
  if (
    basename(resolvedFile) !== "prompt.txt" ||
    dirname(directory) !== tempRoot ||
    !basename(directory).startsWith("devspace-agent-prompt-")
  ) {
    return;
  }
  await rm(directory, { recursive: true, force: true });
}

export function isLocalAgentActive(record: LocalAgentRecord): boolean {
  return record.disposition !== "needs_input"
    && (record.status === "starting" || record.status === "running");
}

function assertSafeLocalAgentRequest(fields: ReadonlyArray<readonly [string, string]>): void {
  assertNoForbiddenSensitiveContent("Local-agent request", fields);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function optionalDuration(
  value: number | false | undefined,
  fallback: number,
): number | undefined {
  if (value === false) return undefined;
  return Math.max(1, value ?? fallback);
}
