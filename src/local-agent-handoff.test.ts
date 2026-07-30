import assert from "node:assert/strict";
import { renderLocalAgentTaskEnvelope } from "./local-agent-handoff.js";

const rendered = renderLocalAgentTaskEnvelope({
  goal: "Implement the focused change.",
  context: "Use the current service owner.",
  relevantFiles: ["src/service.ts", "src/service.test.ts"],
  sourceDocuments: ["docs/requirements.md"],
  acceptanceCriteria: ["CLI behavior is preserved.", "MCP uses the same owner."],
  verification: ["npm test", "npm run typecheck"],
  rules: ["Do not push."],
});

assert.equal(
  rendered,
  [
    "Goal:",
    "Implement the focused change.",
    "",
    "Context:",
    "Use the current service owner.",
    "",
    "Relevant files:",
    "- src/service.ts",
    "- src/service.test.ts",
    "",
    "Source documents:",
    "- docs/requirements.md",
    "",
    "Acceptance criteria:",
    "- CLI behavior is preserved.",
    "- MCP uses the same owner.",
    "",
    "Verification:",
    "- npm test",
    "- npm run typecheck",
    "",
    "Rules:",
    "- Do not push.",
    "- Keep changes focused.",
    "- Do not perform unrelated refactors.",
    "- Report blockers clearly.",
  ].join("\n"),
);

assert.equal(
  renderLocalAgentTaskEnvelope({
    goal: "  Normalize line endings.\r\nKeep content bounded.  ",
    acceptanceCriteria: ["  First line\r\nsecond line  "],
  }),
  [
    "Goal:",
    "Normalize line endings.",
    "Keep content bounded.",
    "",
    "Context:",
    "Use repository context and referenced documents.",
    "",
    "Relevant files:",
    "- None specified.",
    "",
    "Source documents:",
    "- None specified.",
    "",
    "Acceptance criteria:",
    "- First line",
    "  second line",
    "",
    "Verification:",
    "- None specified.",
    "",
    "Rules:",
    "- Keep changes focused.",
    "- Do not perform unrelated refactors.",
    "- Report blockers clearly.",
  ].join("\n"),
);

assert.equal(
  renderLocalAgentTaskEnvelope({
    goal: "Deterministic output.",
    acceptanceCriteria: ["Same input yields the same text."],
  }),
  renderLocalAgentTaskEnvelope({
    goal: "Deterministic output.",
    acceptanceCriteria: ["Same input yields the same text."],
  }),
);

for (const unsafeEnvelope of [
  {
    goal: "Implement safely.",
    context: "dashboardToken=super-secret-value",
    acceptanceCriteria: ["No secret is forwarded."],
  },
  {
    goal: "Implement safely.",
    context: "user: pasted request\nassistant: pasted response",
    acceptanceCriteria: ["No transcript is forwarded."],
  },
]) {
  assert.throws(
    () => renderLocalAgentTaskEnvelope(unsafeEnvelope),
    /forbidden secret-like or transcript content/,
  );
}
