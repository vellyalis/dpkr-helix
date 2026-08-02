import assert from "node:assert/strict";
import type { RunResult, ThreadOptions, TurnOptions } from "@openai/codex-sdk";
import {
  CodexSdkLocalAgentRuntime,
  createCodexSdkLocalAgentRuntime,
} from "./local-agent-runtime.js";
import { MAX_LOCAL_AGENT_QUESTION_CHARACTERS, MAX_LOCAL_AGENT_REPORT_CHARACTERS, validateLocalAgentOutcome } from "./local-agent-outcome.js";

const emptyTurn = (finalResponse: string): RunResult => ({
  finalResponse,
  items: [],
  usage: null,
});

class FakeThread {
  prompts: string[] = [];
  turnOptions: Array<TurnOptions | undefined> = [];

  constructor(readonly id: string | null) {}

  async run(prompt: string, options?: TurnOptions): Promise<RunResult> {
    this.prompts.push(prompt);
    this.turnOptions.push(options);
    if (prompt === "invalid") return emptyTurn("unstructured prose");
    return emptyTurn(JSON.stringify(prompt === "continue" ? { disposition: "needs_input", report: "inspected", question: "Which target?" } : { disposition: "completed", report: `response:${prompt}`, question: null }));
  }
}

class FakeCodex {
  started: ThreadOptions[] = [];
  resumed: Array<{ id: string; options?: ThreadOptions }> = [];
  readonly startThreadInstance = new FakeThread("new-thread");
  readonly resumeThreadInstance = new FakeThread("resumed-thread");

  startThread(options?: ThreadOptions): FakeThread {
    this.started.push(options ?? {});
    return this.startThreadInstance;
  }

  resumeThread(id: string, options?: ThreadOptions): FakeThread {
    this.resumed.push({ id, options });
    return this.resumeThreadInstance;
  }
}

const codex = new FakeCodex();
const runtime = new CodexSdkLocalAgentRuntime(codex);
const observedMessages: string[] = [];
const readOnly = await runtime.run({
  prompt: "inspect only",
  workspace: "/tmp/project",
  onAssistantMessage: (text) => observedMessages.push(text),
});

assert.equal(readOnly.provider, "codex");
assert.equal(readOnly.providerSessionId, "new-thread");
assert.equal(readOnly.finalResponse, "response:inspect only");
assert.equal(readOnly.outcome?.disposition, "completed");
assert.deepEqual(observedMessages, ["response:inspect only"]);
assert.deepEqual(codex.startThreadInstance.prompts, ["inspect only"]);
assert.equal(typeof codex.startThreadInstance.turnOptions[0]?.outputSchema, "object");
assert.deepEqual(codex.started[0], {
  workingDirectory: "/tmp/project",
  sandboxMode: "read-only",
  approvalPolicy: "never",
  model: undefined,
  modelReasoningEffort: undefined,
});

await runtime.run({
  prompt: "make change",
  workspace: "/tmp/project",
  writeMode: "allowed",
  model: "gpt-5.4",
  thinking: "high",
});

assert.deepEqual(codex.started[1], {
  workingDirectory: "/tmp/project",
  sandboxMode: "workspace-write",
  approvalPolicy: "never",
  model: "gpt-5.4",
  modelReasoningEffort: "high",
});

const resumed = await runtime.run({
  prompt: "continue",
  workspace: "/tmp/project",
  providerSessionId: "existing-thread",
  writeMode: "full_access",
  onAssistantMessage: () => {
    throw new Error("projection failure");
  },
});

assert.equal(resumed.providerSessionId, "resumed-thread");
assert.equal(resumed.finalResponse, "inspected");
assert.equal(resumed.outcome?.question, "Which target?");
assert.deepEqual(codex.resumeThreadInstance.prompts, ["continue"]);
assert.deepEqual(codex.resumed, [
  {
    id: "existing-thread",
    options: {
      workingDirectory: "/tmp/project",
      sandboxMode: "danger-full-access",
      approvalPolicy: "never",
      model: undefined,
      modelReasoningEffort: undefined,
    },
  },
]);

const created = await createCodexSdkLocalAgentRuntime(undefined, () => new FakeCodex());
assert.equal(created.provider, "codex");

await assert.rejects(runtime.run({ prompt: "invalid", workspace: "/tmp/project" }), /invalid structured local-agent outcome/);

assert.equal(validateLocalAgentOutcome({ disposition: "completed", report: "x".repeat(MAX_LOCAL_AGENT_REPORT_CHARACTERS) }).report.length, MAX_LOCAL_AGENT_REPORT_CHARACTERS);
assert.equal(validateLocalAgentOutcome({ disposition: "needs_input", report: "", question: "x".repeat(MAX_LOCAL_AGENT_QUESTION_CHARACTERS) }).question?.length, MAX_LOCAL_AGENT_QUESTION_CHARACTERS);
for (const invalid of [
  { disposition: "completed", report: "" },
  { disposition: "completed", report: "done", question: "extra" },
  { disposition: "needs_input", report: "", question: " " },
  { disposition: "completed", report: "x".repeat(MAX_LOCAL_AGENT_REPORT_CHARACTERS + 1) },
  { disposition: "needs_input", report: "", question: "x".repeat(MAX_LOCAL_AGENT_QUESTION_CHARACTERS + 1) },
]) assert.throws(() => validateLocalAgentOutcome(invalid), /invalid structured local-agent outcome/);
