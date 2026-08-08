import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ServerConfig } from "./config.js";
import {
  cleanupLocalAgentPromptFile,
  createDetachedLocalAgentWorkerSpawner,
  LOCAL_AGENT_WORKER_ACKNOWLEDGEMENT_TIMEOUT_MS,
  LOCAL_AGENT_WORKER_HEARTBEAT_INTERVAL_MS,
  LOCAL_AGENT_STALE_ACTIVE_AFTER_MS,
  LOCAL_AGENT_STALE_RECONCILIATION_INTERVAL_MS,
  LocalAgentService,
  type LocalAgentServiceOptions,
  writeLocalAgentPromptFile,
} from "./local-agent-service.js";
import type {
  CreateLocalAgentRecordInput,
  LocalAgentListScope,
  LocalAgentRecord,
} from "./local-agent-store.js";

class FakeStore {
  readonly records = new Map<string, LocalAgentRecord>();
  createCount = 0;
  updateCount = 0;
  touchCount = 0;

  list(scope: LocalAgentListScope = {}): LocalAgentRecord[] {
    return Array.from(this.records.values()).filter((record) => {
      if (scope.workspaceId) return record.workspaceId === scope.workspaceId;
      if (scope.workspaceRoot) return record.workspaceRoot === scope.workspaceRoot;
      return true;
    });
  }

  get(id: string): LocalAgentRecord | undefined {
    return this.records.get(id);
  }

  create(input: CreateLocalAgentRecordInput): LocalAgentRecord {
    this.createCount += 1;
    const record: LocalAgentRecord = {
      id: `agt_${this.createCount}`,
      ...input,
      status: "starting",
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
    };
    this.records.set(record.id, record);
    return record;
  }

  update(
    id: string,
    patch: Partial<Omit<LocalAgentRecord, "id" | "createdAt">>,
  ): LocalAgentRecord {
    const current = this.records.get(id);
    if (!current) throw new Error(`Unknown subagent id: ${id}`);
    this.updateCount += 1;
    const updated = {
      ...current,
      ...patch,
      updatedAt: `2026-07-29T00:00:0${this.updateCount}.000Z`,
    };
    this.records.set(id, updated);
    return updated;
  }

  touch(id: string): LocalAgentRecord {
    const current = this.records.get(id);
    if (!current) throw new Error(`Unknown subagent id: ${id}`);
    this.touchCount += 1;
    const updated = {
      ...current,
      updatedAt: `2026-07-29T00:00:${String(10 + this.touchCount).padStart(2, "0")}.000Z`,
    };
    this.records.set(id, updated);
    return updated;
  }
}

class CreateFailingStore extends FakeStore {
  override create(_input: CreateLocalAgentRecordInput): LocalAgentRecord {
    throw new Error("store create failed");
  }
}

const config = {} as ServerConfig;
const store = new FakeStore();
const prompts = new Map<string, string>();
const spawned: Array<{ id: string; promptFile: string }> = [];
const providerInputs: Array<{ provider: string; input: Record<string, unknown> }> = [];
const authorizationEvents: string[] = [];
const availabilityChecks: string[] = [];
const cleanedPromptFiles: string[] = [];
const observations: string[] = [];
let structuredOutcome: { disposition: "completed" | "needs_input"; report: string; question?: string } | undefined;

const baseOptions: LocalAgentServiceOptions = {
  config,
  writeMode: "allowed",
  store,
  profileLoader: async () => [{
    name: "reviewer",
    description: "Reviews focused changes.",
    provider: "codex",
    model: "profile-model",
    thinking: "high",
    filePath: "reviewer.md",
    body: "Follow the reviewer profile.",
    disabled: false,
  }],
  providerAvailabilityChecker: (provider) => {
    availabilityChecks.push(provider);
  },
  providerRunner: async (provider, input) => {
    providerInputs.push({ provider, input: { ...input } });
    input.onAssistantMessage?.("streamed assistant text");
    return {
      provider,
      providerSessionId: "thread_2",
      finalResponse: "done",
      outcome: structuredOutcome,
      items: [],
    };
  },
  workerSpawner: (id, promptFile) => {
    spawned.push({ id, promptFile });
  },
  promptFileWriter: (prompt) => {
    const path = `prompt-${prompts.size + 1}.txt`;
    prompts.set(path, prompt);
    return path;
  },
  promptFileReader: async (path) => prompts.get(path) ?? "",
  promptFileCleanup: async (path) => {
    cleanedPromptFiles.push(path);
  },
  workerHeartbeatIntervalMs: false,
  staleActiveAfterMs: false,
  authorizer: async (input) => {
    authorizationEvents.push(`${input.scope.workspaceRoot}:${input.writeMode}`);
    return input.action();
  },
  observation: {
    created: (record) => observations.push(`created:${record.id}`),
    statusChanged: (record) => observations.push(`status:${record.status}`),
    assistantMessage: (_record, text) => observations.push(`message:${text}`),
    resultAvailable: (record) => observations.push(`result:${record.latestResponse}`),
    inputRequired: (record) => observations.push(`input:${record.question}`),
  },
};

const service = new LocalAgentService(baseOptions);
const started = await service.start({
  scope: { workspaceId: "ws_1", workspaceRoot: "C:\\repo" },
  target: "reviewer",
  prompt: "Review this change.",
  model: "override-model",
});

assert.equal(started.status, "starting");
assert.equal(started.profileName, "reviewer");
assert.equal(started.provider, "codex");
assert.equal(started.model, "override-model");
assert.equal(started.thinking, "high");
assert.deepEqual(spawned, [{ id: started.id, promptFile: "prompt-1.txt" }]);
assert.deepEqual(availabilityChecks, ["codex"]);
assert.equal(service.getStatus(started.id).id, started.id);
assert.deepEqual(service.list({ workspaceId: "ws_1" }).map((record) => record.id), [started.id]);

store.update(started.id, {
  status: "idle",
  providerSessionId: "thread_1",
  latestResponse: "previous",
});
const resumed = await service.start({
  scope: { workspaceId: "ignored", workspaceRoot: "C:\\ignored" },
  target: started.id,
  prompt: "Continue.",
  thinking: "medium",
});

assert.equal(store.createCount, 1);
assert.equal(resumed.status, "starting");
assert.equal(resumed.providerSessionId, "thread_1");
assert.equal(resumed.model, "override-model");
assert.equal(resumed.thinking, "medium");
assert.equal(resumed.latestResponse, undefined);
assert.deepEqual(spawned.at(-1), { id: started.id, promptFile: "prompt-2.txt" });
assert.match(authorizationEvents.at(-1) ?? "", /^C:\\repo:allowed$/);

await assert.rejects(
  service.startNew({
    scope: { workspaceId: "ws_other", workspaceRoot: "C:\\other" },
    target: started.id,
    prompt: "Must not cross workspace scope.",
  }),
  /use continue_agent/,
);
assert.equal(store.updateCount, 2);
assert.equal(spawned.length, 2);

await service.runWorker(started.id, "prompt-2.txt");
const completed = service.getStatus(started.id);
assert.equal(completed.status, "idle");
assert.equal(completed.providerSessionId, "thread_2");
assert.equal(completed.latestResponse, "done");
assert.equal(completed.disposition, undefined);
assert.deepEqual(cleanedPromptFiles, ["prompt-2.txt"]);
assert.equal(providerInputs.length, 1);
assert.equal(providerInputs[0]?.provider, "codex");
assert.equal(typeof providerInputs[0]?.input.onAssistantMessage, "function");
const { onAssistantMessage: _onAssistantMessage, ...providerInput } =
  providerInputs[0]?.input ?? {};
assert.deepEqual(providerInput, {
  prompt: "Follow the reviewer profile.\n\nTask:\nContinue.",
  workspace: "C:\\repo",
  providerSessionId: "thread_1",
  writeMode: "allowed",
  model: "override-model",
  thinking: "medium",
});
assert.deepEqual(observations.slice(0, 6), [
  `created:${started.id}`,
  "status:starting",
  "status:running",
  "message:streamed assistant text",
  "status:idle",
  "result:done",
]);

const failingWorkerStore = new FakeStore();
const failingWorker = failingWorkerStore.create({
  workspaceRoot: "C:\\repo",
  profileName: "reviewer",
  provider: "codex",
});
const failingWorkerCleanup: string[] = [];
const failingWorkerService = new LocalAgentService({
  ...baseOptions,
  store: failingWorkerStore,
  providerRunner: async () => {
    throw new Error("provider failed");
  },
  promptFileReader: async () => "Run failing provider.",
  promptFileCleanup: async (path) => {
    failingWorkerCleanup.push(path);
  },
});
await failingWorkerService.runWorker(failingWorker.id, "failing-prompt.txt");
assert.equal(failingWorkerStore.get(failingWorker.id)?.status, "error");
assert.equal(failingWorkerStore.get(failingWorker.id)?.error, "provider failed");
assert.deepEqual(failingWorkerCleanup, ["failing-prompt.txt"]);

const settled = await service.waitForStatus(started.id, { waitMs: 0 });
assert.equal(settled.status, "idle");

const unavailableStore = new FakeStore();
let unavailablePromptWrites = 0;
const unavailableService = new LocalAgentService({
  ...baseOptions,
  store: unavailableStore,
  providerAvailabilityChecker: () => {
    throw new Error("provider unavailable");
  },
  promptFileWriter: () => {
    unavailablePromptWrites += 1;
    return "unexpected";
  },
});
await assert.rejects(
  unavailableService.start({
    scope: { workspaceRoot: "C:\\repo" },
    target: "reviewer",
    prompt: "Do not start.",
  }),
  /provider unavailable/,
);
assert.equal(unavailableStore.createCount, 0);
assert.equal(unavailablePromptWrites, 0);

const createFailureCleanup: string[] = [];
const createFailureService = new LocalAgentService({
  ...baseOptions,
  store: new CreateFailingStore(),
  promptFileCleanup: async (path) => {
    createFailureCleanup.push(path);
  },
});
await assert.rejects(
  createFailureService.startNew({
    scope: { workspaceRoot: "C:\\repo" },
    target: "reviewer",
    prompt: "Fail while creating state.",
  }),
  /store create failed/,
);
assert.deepEqual(createFailureCleanup, ["prompt-3.txt"]);

const spawnFailureStore = new FakeStore();
const spawnFailureCleanup: string[] = [];
const spawnFailureService = new LocalAgentService({
  ...baseOptions,
  store: spawnFailureStore,
  workerSpawner: () => {
    throw new Error("worker spawn failed");
  },
  promptFileCleanup: async (path) => {
    spawnFailureCleanup.push(path);
  },
});
await assert.rejects(
  spawnFailureService.startNew({
    scope: { workspaceRoot: "C:\\repo" },
    target: "reviewer",
    prompt: "Fail while spawning.",
  }),
  /worker spawn failed/,
);
assert.equal(spawnFailureStore.get("agt_1")?.status, "error");
assert.equal(spawnFailureStore.get("agt_1")?.error, "worker spawn failed");
assert.deepEqual(spawnFailureCleanup, ["prompt-4.txt"]);

const missingProfileStore = new FakeStore();
const missingProfile = missingProfileStore.create({
  workspaceRoot: "C:\\repo",
  profileName: "deleted-profile",
  provider: "codex",
});
const missingProfilePrompts: string[] = [];
const missingProfileService = new LocalAgentService({
  ...baseOptions,
  store: missingProfileStore,
  profileLoader: async () => [],
  promptFileWriter: (prompt) => {
    missingProfilePrompts.push(prompt);
    return "unexpected-prompt.txt";
  },
});
await assert.rejects(
  missingProfileService.resume({
    id: missingProfile.id,
    prompt: "Must not continue.",
  }),
  /Unknown subagent profile/,
);
assert.equal(missingProfileStore.updateCount, 0);
assert.deepEqual(missingProfilePrompts, []);

const changedProviderStore = new FakeStore();
const changedProvider = changedProviderStore.create({
  workspaceRoot: "C:\\repo",
  profileName: "reviewer",
  provider: "codex",
});
const changedProviderService = new LocalAgentService({
  ...baseOptions,
  store: changedProviderStore,
  profileLoader: async () => [{
    name: "reviewer",
    description: "Changed provider.",
    provider: "claude",
    filePath: "reviewer.md",
    body: "",
    disabled: false,
  }],
});
await assert.rejects(
  changedProviderService.resume({
    id: changedProvider.id,
    prompt: "Must not cross providers.",
  }),
  /profile provider changed/,
);
assert.equal(changedProviderStore.updateCount, 0);

const deniedStore = new FakeStore();
let deniedAvailabilityChecks = 0;
const deniedService = new LocalAgentService({
  ...baseOptions,
  store: deniedStore,
  providerAvailabilityChecker: () => {
    deniedAvailabilityChecks += 1;
  },
  authorizer: async () => {
    throw new Error("policy denied");
  },
});
await assert.rejects(
  deniedService.start({
    scope: { workspaceRoot: "C:\\repo" },
    target: "reviewer",
    prompt: "Do not start.",
  }),
  /policy denied/,
);
assert.equal(deniedStore.createCount, 0);
assert.equal(deniedAvailabilityChecks, 0);

const deniedWorkerStore = new FakeStore();
const deniedWorker = deniedWorkerStore.create({
  workspaceRoot: "C:\\repo",
  profileName: "reviewer",
  provider: "codex",
});
const deniedWorkerCleanup: string[] = [];
const deniedWorkerService = new LocalAgentService({
  ...baseOptions,
  store: deniedWorkerStore,
  authorizer: async () => {
    throw new Error("worker policy denied");
  },
  promptFileCleanup: async (path) => {
    deniedWorkerCleanup.push(path);
  },
});
await assert.rejects(
  deniedWorkerService.runWorker(deniedWorker.id, "owned-prompt.txt"),
  /worker policy denied/,
);
assert.equal(deniedWorkerStore.get(deniedWorker.id)?.status, "starting");
assert.deepEqual(deniedWorkerCleanup, ["owned-prompt.txt"]);

assert.equal(LOCAL_AGENT_WORKER_HEARTBEAT_INTERVAL_MS, 30_000);
assert.equal(LOCAL_AGENT_STALE_ACTIVE_AFTER_MS, 60 * 60 * 1_000);
assert.equal(LOCAL_AGENT_STALE_RECONCILIATION_INTERVAL_MS, 5 * 60 * 1_000);

const staleWorkerStore = new FakeStore();
const staleWorker = staleWorkerStore.create({
  workspaceRoot: "C:\\repo",
  profileName: "reviewer",
  provider: "codex",
});
const staleWorkerStatuses: string[] = [];
const staleWorkerService = new LocalAgentService({
  ...baseOptions,
  store: staleWorkerStore,
  staleActiveAfterMs: 60_000,
  now: () => Date.parse("2026-07-29T02:00:00.000Z"),
  observation: {
    created: () => undefined,
    statusChanged: (record) => staleWorkerStatuses.push(record.status),
    assistantMessage: () => undefined,
    resultAvailable: () => undefined,
    inputRequired: () => undefined,
  },
});
assert.equal(staleWorkerStore.get(staleWorker.id)?.status, "error");
assert.match(
  staleWorkerStore.get(staleWorker.id)?.error ?? "",
  /reconciled as interrupted/,
);
assert.deepEqual(staleWorkerStatuses, ["error"]);
staleWorkerService.close();

const periodicStore = new FakeStore();
const periodicWorker = periodicStore.create({
  workspaceRoot: "C:\\repo",
  profileName: "reviewer",
  provider: "codex",
});
let periodicNow = Date.parse("2026-07-29T00:00:00.000Z");
const periodicService = new LocalAgentService({
  ...baseOptions,
  store: periodicStore,
  staleActiveAfterMs: 1_000,
  staleReconciliationIntervalMs: 5,
  now: () => periodicNow,
});
assert.equal(periodicStore.get(periodicWorker.id)?.status, "starting");
periodicNow += 2_000;
await new Promise((resolvePeriodicSweep) => setTimeout(resolvePeriodicSweep, 30));
assert.equal(periodicStore.get(periodicWorker.id)?.status, "error");
periodicService.close();

const heartbeatStore = new FakeStore();
const heartbeatWorker = heartbeatStore.create({
  workspaceRoot: "C:\\repo",
  profileName: "reviewer",
  provider: "codex",
});
const heartbeatService = new LocalAgentService({
  ...baseOptions,
  store: heartbeatStore,
  workerHeartbeatIntervalMs: 5,
  providerRunner: async () => {
    await new Promise((resolveHeartbeat) => setTimeout(resolveHeartbeat, 30));
    return {
      provider: "codex",
      providerSessionId: "thread_heartbeat",
      finalResponse: "heartbeat complete",
      items: [],
    };
  },
  promptFileReader: async () => "Run long enough to emit a heartbeat.",
  promptFileCleanup: async () => undefined,
});
await heartbeatService.runWorker(heartbeatWorker.id, "heartbeat-prompt.txt");
assert.equal(heartbeatStore.get(heartbeatWorker.id)?.status, "idle");
assert.ok(heartbeatStore.touchCount > 0);

const ownedPrompt = writeLocalAgentPromptFile("temporary prompt");
const ownedDirectory = dirname(ownedPrompt);
assert.equal(existsSync(ownedPrompt), true);
await cleanupLocalAgentPromptFile(ownedPrompt);
assert.equal(existsSync(ownedDirectory), false);

const unrelatedDirectory = mkdtempSync(join(tmpdir(), "devspace-unrelated-test-"));
const unrelatedPrompt = join(unrelatedDirectory, "prompt.txt");
writeFileSync(unrelatedPrompt, "must remain");
try {
  await cleanupLocalAgentPromptFile(unrelatedPrompt);
  assert.equal(existsSync(unrelatedPrompt), true);
} finally {
  await rm(unrelatedDirectory, { recursive: true, force: true });
}

const workerFixtureDirectory = mkdtempSync(join(tmpdir(), "devspace-worker-ready-test-"));
const readyWorkerScript = join(workerFixtureDirectory, "ready-worker.cjs");
const delayedReadyWorkerScript = join(workerFixtureDirectory, "delayed-ready-worker.cjs");
const failingWorkerScript = join(workerFixtureDirectory, "failing-worker.cjs");
writeFileSync(
  readyWorkerScript,
  'process.send?.({ type: "devspace-agent-worker-ready", id: process.argv[4] });\nprocess.disconnect?.();\n',
);
writeFileSync(
  delayedReadyWorkerScript,
  'setTimeout(() => { process.send?.({ type: "devspace-agent-worker-ready", id: process.argv[4] }); process.disconnect?.(); }, 75);\n',
);
writeFileSync(failingWorkerScript, "process.exit(7);\n");
try {
  assert.equal(LOCAL_AGENT_WORKER_ACKNOWLEDGEMENT_TIMEOUT_MS, 30_000);
  await createDetachedLocalAgentWorkerSpawner(readyWorkerScript)("agt_ready", "prompt.txt");
  await createDetachedLocalAgentWorkerSpawner(delayedReadyWorkerScript, {
    acknowledgementTimeoutMs: 1_000,
  })("agt_delayed", "prompt.txt");
  await assert.rejects(
    Promise.resolve(
      createDetachedLocalAgentWorkerSpawner(failingWorkerScript)("agt_fail", "prompt.txt"),
    ),
    /exited before launch acknowledgement/,
  );
} finally {
  await rm(workerFixtureDirectory, { recursive: true, force: true });
}

structuredOutcome = { disposition: "needs_input", report: "Inspected both targets.", question: "Which target?" };
await service.resume({ id: started.id, prompt: "Check targets." });
await service.runWorker(started.id, spawned.at(-1)!.promptFile);
assert.equal(service.getStatus(started.id).question, "Which target?");
structuredOutcome = { disposition: "completed", report: "Updated the selected target." };
const continuedStructured = await service.resume({ id: started.id, prompt: "Use the first target." });
assert.equal(continuedStructured.providerSessionId, "thread_2");
assert.equal(continuedStructured.question, undefined);
await service.runWorker(started.id, spawned.at(-1)!.promptFile);
assert.equal(service.getStatus(started.id).disposition, "completed");
