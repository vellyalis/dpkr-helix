import assert from "node:assert/strict";
import {
  canCallServerTools,
  canSendMessages,
  projectContextUpdate,
  projectOpenAction,
  projectOpenCopyCommand,
  projectOpenFallbackMessage,
  tryCopyProjectOpenCommand,
} from "./project-actions.js";

const project = {
  id: "prj_123",
  slug: "aelyris",
  name: "Aelyris",
};

assert.equal(canCallServerTools({ serverTools: {} }), true);
assert.equal(canCallServerTools({}), false);
assert.equal(canCallServerTools(undefined), false);

assert.equal(canSendMessages({ message: { text: {} } }), true);
assert.equal(canSendMessages({ message: { structuredContent: {} } }), false);
assert.equal(canSendMessages(undefined), false);

assert.deepEqual(projectOpenAction(project, "worktree"), {
  name: "open_project",
  arguments: {
    project: "prj_123",
    mode: "worktree",
  },
});

assert.equal(
  projectOpenFallbackMessage(project, "checkout"),
  'Open dpkr helix project "Aelyris" by calling open_project with project="prj_123" (slug "aelyris") and mode="checkout".',
);
assert.match(projectOpenCopyCommand(project, "worktree"), /"name": "open_project"/);
assert.match(projectOpenCopyCommand(project, "worktree"), /"mode": "worktree"/);

assert.deepEqual(
  projectContextUpdate(
    { text: {} },
    project,
    "checkout",
    { workspaceId: "ws_123" },
  ),
  {
    content: [{
      type: "text",
      text: "dpkr helix opened project Aelyris in checkout mode.",
    }],
  },
);
assert.deepEqual(
  projectContextUpdate(
    { structuredContent: {} },
    project,
    "worktree",
    { workspaceId: "ws_123" },
  ),
  { structuredContent: { workspaceId: "ws_123" } },
);
assert.deepEqual(
  projectContextUpdate(
    { text: {}, structuredContent: {} },
    project,
    "worktree",
    { workspaceId: "ws_123" },
  ),
  {
    content: [{
      type: "text",
      text: "dpkr helix opened project Aelyris in worktree mode.",
    }],
    structuredContent: { workspaceId: "ws_123" },
  },
);
assert.equal(projectContextUpdate({}, project, "checkout", { workspaceId: "ws_123" }), undefined);

let copiedText = "";
assert.equal(
  await tryCopyProjectOpenCommand(
    { writeText: async (text) => { copiedText = text; } },
    "copy me",
  ),
  true,
);
assert.equal(copiedText, "copy me");
assert.equal(await tryCopyProjectOpenCommand(undefined, "copy me"), false);
assert.equal(
  await tryCopyProjectOpenCommand(
    { writeText: async () => { throw new Error("denied"); } },
    "copy me",
  ),
  false,
);
