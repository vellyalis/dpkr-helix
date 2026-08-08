import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalAgentStore } from "./local-agent-store.js";

const root = mkdtempSync(join(tmpdir(), "devspace-local-agent-store-test-"));
const aliasRoot = `${root}-alias`;
const stores: LocalAgentStore[] = [];

try {
  mkdirSync(join(root, "project"));
  symlinkSync(root, aliasRoot, process.platform === "win32" ? "junction" : "dir");
  const store = new LocalAgentStore(root);
  stores.push(store);
  const created = store.create({
    workspaceId: "ws_1",
    workspaceRoot: join(aliasRoot, "project"),
    profileName: "reviewer",
    provider: "codex",
    model: "gpt-5.4",
    thinking: "high",
  });

  assert.match(created.id, /^agt_[a-f0-9]{8}$/);
  assert.equal(created.status, "starting");
  assert.equal(store.get(created.id)?.thinking, "high");
  assert.equal(store.get(created.id)?.profileName, "reviewer");
  assert.equal(store.get(created.id.slice(0, 7))?.id, created.id);

  const updated = store.update(created.id, {
    status: "idle",
    latestResponse: "done",
    disposition: "needs_input",
    question: "Which target should be changed?",
    providerSessionId: "thread_123",
    thinking: "medium",
    error: "You've hit your usage limit. Try again in 10 minutes.",
    failureCode: "usage_limit",
  });

  assert.equal(updated.status, "idle");
  assert.equal(updated.thinking, "medium");
  assert.equal(updated.workspaceRoot, join(aliasRoot, "project"));
  assert.equal(store.get("thread_123")?.id, created.id);
  assert.equal(store.get(created.id)?.thinking, "medium");
  assert.equal(store.get(created.id)?.disposition, "needs_input");
  assert.equal(store.get(created.id)?.question, "Which target should be changed?");
  assert.equal(store.get(created.id)?.failureCode, "usage_limit");
  assert.match(store.get(created.id)?.retryAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(store.get(created.id)?.workspaceRoot, join(aliasRoot, "project"));
  assert.equal(store.update(created.id, {
    latestResponse: undefined,
    disposition: undefined,
    question: undefined,
    error: undefined,
    failureCode: undefined,
  }).latestResponse, undefined);
  assert.equal(store.get(created.id)?.failureCode, undefined);
  const touched = store.touch(created.id);
  assert.equal(touched.status, "idle");
  assert.equal(touched.providerSessionId, "thread_123");
  assert.equal(store.get(created.id)?.updatedAt, touched.updatedAt);
  assert.deepEqual(
    store.list({ workspaceRoot: join(root, "project") }).map((agent) => agent.latestResponse),
    [undefined],
  );
  assert.equal(created.workspaceRoot, join(aliasRoot, "project"));
  assert.deepEqual(store.list({ workspaceId: "ws_1" }).map((agent) => agent.id), [created.id]);
  assert.deepEqual(store.list({ workspaceId: "ws_other" }), []);
  assert.deepEqual(store.list({ workspaceRoot: join(root, "other") }), []);

  const otherStore = new LocalAgentStore(root);
  stores.push(otherStore);
  const createdFromOtherStore = otherStore.create({
    workspaceId: "ws_1",
    workspaceRoot: join(root, "project"),
    profileName: "explorer",
    provider: "claude",
  });

  assert.deepEqual(
    store.list({ workspaceId: "ws_1" }).map((agent) => agent.id).sort(),
    [created.id, createdFromOtherStore.id].sort(),
  );
} finally {
  for (const store of stores) {
    store.close();
  }
  rmSync(aliasRoot, { force: true });
  rmSync(root, { recursive: true, force: true });
}
