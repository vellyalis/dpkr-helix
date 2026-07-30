import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWorkspaceHandoffStore,
  DEVSPACE_SESSION_CONTINUITY_INSTRUCTION,
  formatWorkspaceHandoffForPrompt,
} from "./workspace-handoff-store.js";

const stateDir = await mkdtemp(join(tmpdir(), "devspace-handoff-test-"));

try {
  const store = createWorkspaceHandoffStore(stateDir, "win32");
  assert.equal(store.get("C:\\Repo\\Project"), undefined);

  const created = store.upsert("C:\\Repo\\Project", {
    status: "in_progress",
    summary: "  Implement registry continuation.  ",
    completed: ["Read the design"],
    nextActions: ["Add the MCP tool"],
    verification: ["typecheck pending"],
    risks: ["Unverified migration"],
    activeAgents: ["agt_123"],
  });
  assert.equal(created.summary, "Implement registry continuation.");
  assert.equal(created.status, "in_progress");

  assert.deepEqual(store.get("c:\\repo\\project"), created);

  const updated = store.upsert("c:\\repo\\project", {
    status: "ready",
    summary: "Persistence is complete.",
    completed: ["Added migration", "Added store tests"],
    nextActions: ["Wire MCP tools"],
    verification: ["store test passed"],
  });
  assert.equal(updated.status, "ready");
  assert.deepEqual(updated.activeAgents, ["agt_123"]);
  assert.deepEqual(updated.risks, ["Unverified migration"]);
  assert.deepEqual(store.get("C:\\REPO\\PROJECT"), updated);

  assert.throws(
    () =>
      store.upsert("C:\\Repo\\Project", {
        status: "blocked",
        summary: "dashboardToken=super-secret-value",
      }),
    /forbidden secret-like/i,
  );
  assert.deepEqual(store.get("C:\\Repo\\Project"), updated);
  store.close?.();

  const reopened = createWorkspaceHandoffStore(stateDir, "win32");
  assert.deepEqual(reopened.get("C:\\Repo\\Project"), updated);
  const prompt = formatWorkspaceHandoffForPrompt(updated);
  assert.match(prompt, /Persistence is complete/);
  assert.match(prompt, /Wire MCP tools/);
  assert.match(prompt, /reconcile it with the repository/i);
  reopened.close?.();

  assert.match(DEVSPACE_SESSION_CONTINUITY_INSTRUCTION, /timeout-resistant work units/);
  assert.match(DEVSPACE_SESSION_CONTINUITY_INSTRUCTION, /call update_handoff/);
  assert.match(DEVSPACE_SESSION_CONTINUITY_INSTRUCTION, /Never store secrets/);
} finally {
  await rm(stateDir, { recursive: true, force: true });
}
