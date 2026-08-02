import assert from "node:assert/strict";
import type { ToolResultCard } from "./card-types.js";
import { toolIcons } from "./icons.js";
import { getToolDisplay, getToolHeaderSummary } from "./tool-display.js";

const displayCases: Array<[ToolResultCard, { title: string; tone: string }]> = [
  [{
    tool: "delegate_task",
    agent: {
      id: "agt_1",
      profileName: "codex-implementer",
      provider: "codex",
      status: "starting",
      resultAvailable: false,
      verificationStatus: "not_available",
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
    },
  }, { title: "Delegated task", tone: "agent" }],
  [{
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
  }, { title: "Agent result available", tone: "agent" }],
  [{ tool: "list_projects", summary: { total: 2 } }, { title: "Registered projects", tone: "workspace" }],
  [{
    tool: "open_project",
    project: { id: "prj_1", slug: "alpha", name: "Alpha" },
    summary: { mode: "checkout", preset: "develop" },
  }, { title: "Opened project", tone: "workspace" }],
  [{ tool: "open_workspace", root: "/tmp/project" }, { title: "Opened workspace", tone: "workspace" }],
  [{ tool: "read", path: "src/read.ts" }, { title: "Read file", tone: "read" }],
  [{ tool: "write", path: "src/write.ts" }, { title: "Wrote file", tone: "write" }],
  [{ tool: "edit", path: "src/edit.ts" }, { title: "Edited file", tone: "edit" }],
  [{
    tool: "apply_patch",
    files: [{ path: "src/new.ts", operation: "add" }],
  }, { title: "Added 1 file", tone: "write" }],
  [{
    tool: "grep",
    summary: { pattern: "needle", scope: "src" },
  }, { title: "Searched files", tone: "search" }],
  [{ tool: "ls", path: "src" }, { title: "Listed directory", tone: "directory" }],
  [{ tool: "bash", summary: { command: "npm test", exitCode: 0 } }, { title: "Ran command", tone: "shell" }],
];

for (const [card, expected] of displayCases) {
  assert.deepEqual(pickDisplay(getToolDisplay(card)), expected);
}

assert.equal(getToolDisplay({ tool: "open_workspace", root: "/tmp/project" }).label, "/tmp/project");
assert.equal(
  getToolDisplay({ tool: "grep", summary: { pattern: "needle", scope: "src" } }).label,
  "needle in src",
);

assert.deepEqual(
  pickDisplay(getToolDisplay({
    tool: "show_changes",
    files: [
      { path: "src/a.ts", operation: "update" },
      { path: "src/b.ts", operation: "update" },
    ],
  })),
  { title: "Edited 2 files", tone: "review" },
);

assert.deepEqual(
  pickDisplay(getToolDisplay({
    tool: "show_changes",
    files: [
      { path: "src/a.ts", operation: "add" },
      { path: "src/b.ts", operation: "update" },
    ],
  })),
  { title: "Changed 2 files", tone: "review" },
);

assert.equal(
  getToolDisplay({ tool: "exec_command", summary: { running: true, command: "npm test" } }).title,
  "Command running",
);
assert.equal(
  getToolDisplay({ tool: "exec_command", summary: { running: false, exitCode: 1 } }).title,
  "Command failed",
);
assert.equal(
  getToolDisplay({ tool: "write_stdin", summary: { running: false, exitCode: 0 } }).title,
  "Process finished",
);

assert.deepEqual(
  pickDisplay(getToolDisplay({ tool: "glob", summary: { lines: 1, pattern: "**/*.ts" } })),
  { title: "Found files", tone: "search" },
);

assert.deepEqual(
  getToolHeaderSummary({ tool: "glob", summary: { lines: 1 } }),
  { kind: "empty" },
);

assert.equal(
  getToolDisplay({
    tool: "apply_patch",
    files: [{ path: "src/removed.ts", operation: "delete" }],
  }).icon,
  toolIcons.deleteFile,
);

assert.deepEqual(
  getToolHeaderSummary({ tool: "show_changes", summary: { additions: 14, removals: 1 } }),
  { kind: "diff", additions: 14, removals: 1 },
);

assert.deepEqual(
  getToolHeaderSummary({
    tool: "list_agents",
    summary: { active: 1, inputRequired: 1, resultAvailable: 2 },
  }),
  { kind: "text", text: "1 active · 1 input required · 2 results" },
);

assert.deepEqual(
  getToolHeaderSummary({ tool: "list_projects", summary: { available: 2, unavailable: 1 } }),
  { kind: "text", text: "2 available · 1 unavailable" },
);

assert.deepEqual(
  getToolHeaderSummary({ tool: "open_project", summary: { mode: "checkout", preset: "design" } }),
  { kind: "text", text: "checkout · design" },
);

assert.equal(
  getToolDisplay({
    tool: "open_project",
    project: { id: "prj_1", slug: "alpha", name: "Alpha" },
  }).label,
  "Alpha (alpha)",
);

assert.deepEqual(
  getToolHeaderSummary({
    tool: "open_workspace",
    summary: { mode: "worktree", agentsFiles: 1, skills: 4 },
  }),
  { kind: "text", text: "worktree · 1 instruction · 4 skills" },
);

assert.deepEqual(
  getToolHeaderSummary({ tool: "exec_command", summary: { lines: 3, wallTimeMs: 1_500 } }),
  { kind: "text", text: "3 lines · 1.5s" },
);

assert.deepEqual(
  getToolHeaderSummary({ tool: "grep", summary: { lines: 2 } }),
  { kind: "text", text: "2 lines" },
);

assert.deepEqual(
  getToolHeaderSummary({ tool: "read", summary: { lines: 1 } }),
  { kind: "text", text: "1 line" },
);

assert.deepEqual(
  getToolHeaderSummary({ tool: "ls", summary: { lines: 0 } }),
  { kind: "text", text: "0 lines" },
);

assert.deepEqual(
  getToolHeaderSummary({ tool: "open_workspace" }),
  { kind: "empty" },
);

function pickDisplay(display: ReturnType<typeof getToolDisplay>) {
  return {
    title: display.title,
    tone: display.tone,
  };
}
