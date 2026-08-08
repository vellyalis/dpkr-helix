import assert from "node:assert/strict";
import {
  isEditTool,
  isExpandableCard,
  isInitiallyExpandedCard,
  isPatchTool,
  isShellTool,
  isToolName,
} from "./card-types.js";

for (const tool of [
  "list_projects",
  "open_project",
  "delegate_task",
  "get_agent_status",
  "list_agents",
  "continue_agent",
  "apply_patch",
  "exec_command",
  "write_stdin",
]) {
  assert.equal(isToolName(tool), true, `${tool} should be a recognized card tool`);
}

assert.equal(isPatchTool("apply_patch"), true);
assert.equal(isEditTool("apply_patch"), false);
assert.equal(isShellTool("exec_command"), true);
assert.equal(isShellTool("write_stdin"), true);
assert.equal(isEditTool("exec_command"), false);
assert.equal(isShellTool("apply_patch"), false);

assert.equal(
  isExpandableCard({ tool: "apply_patch", payload: { patch: "diff --git a/a b/a" } }),
  true,
);
assert.equal(isExpandableCard({ tool: "apply_patch" }), false);
assert.equal(
  isExpandableCard({
    tool: "list_projects",
    projects: [{
      id: "prj_1",
      slug: "alpha",
      name: "Alpha",
      root: "/tmp/alpha",
      permissionPreset: "develop",
      defaultMode: "checkout",
      pinned: false,
      source: "manual",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
      availability: "available",
    }],
  }),
  true,
);
assert.equal(isExpandableCard({ tool: "open_project", project: { id: "prj_1" } }), true);
assert.equal(
  isExpandableCard({
    tool: "open_workspace",
    repositoryContext: {
      state: "available",
      branch: "main",
      dirty: { total: 0 },
    },
  }),
  true,
);
assert.equal(
  isExpandableCard({
    tool: "open_project",
    workspaceId: "ws_1234567890",
    handoff: { status: "ready", summary: "Continue from the next action." },
  }),
  true,
);
assert.equal(
  isExpandableCard({
    tool: "get_agent_status",
    agent: {
      id: "agt_1",
      profileName: "codex-implementer",
      provider: "codex",
      status: "idle",
      resultAvailable: true,
      verificationStatus: "pending",
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:01:00.000Z",
    },
  }),
  true,
);

assert.equal(
  isInitiallyExpandedCard({
    tool: "open_workspace",
    repositoryContext: { state: "available", dirty: { total: 0 } },
  }),
  true,
);
assert.equal(
  isInitiallyExpandedCard({
    tool: "apply_patch",
    files: [{ path: "single.ts", operation: "update" }],
    payload: { patch: "diff --git a/single.ts b/single.ts" },
  }),
  true,
);
assert.equal(
  isInitiallyExpandedCard({
    tool: "apply_patch",
    files: [
      { path: "a.ts", operation: "update" },
      { path: "b.ts", operation: "update" },
    ],
    payload: { patch: "diff --git a/a.ts b/a.ts" },
  }),
  false,
);
