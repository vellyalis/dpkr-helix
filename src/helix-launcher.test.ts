import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import {
  buildCodexLaunchPlan,
  buildHandoffPrompt,
  findCodexInvocation,
  parseHelixArgs,
  selectDiscoveryMatches,
} from "./helix-launcher.js";
import type { WorkspaceHandoff } from "./workspace-handoff-store.js";

assert.deepEqual(parseHelixArgs([]), {
  command: "codex",
  passthrough: [],
});
assert.deepEqual(parseHelixArgs(["studyforge"]), {
  command: "codex",
  selector: "studyforge",
  passthrough: [],
});
assert.deepEqual(parseHelixArgs(["studyforge", "--", "-m", "gpt-5.6-sol"]), {
  command: "codex",
  selector: "studyforge",
  passthrough: ["-m", "gpt-5.6-sol"],
});
assert.deepEqual(parseHelixArgs(["codex", "--", "fix the tests"]), {
  command: "codex",
  selector: undefined,
  passthrough: ["fix the tests"],
});
assert.deepEqual(parseHelixArgs(["handoff", "studyforge", "--", "-m", "gpt-5.6-sol"]), {
  command: "continue",
  selector: "studyforge",
  passthrough: ["-m", "gpt-5.6-sol"],
});
assert.deepEqual(parseHelixArgs(["resume", "studyforge", "--picker"]), {
  command: "resume",
  selector: "studyforge",
  passthrough: ["--picker"],
});
assert.deepEqual(parseHelixArgs(["start"]), {
  command: "up",
  passthrough: [],
});
assert.deepEqual(parseHelixArgs(["-m", "gpt-5.6-sol"]), {
  command: "codex",
  passthrough: ["-m", "gpt-5.6-sol"],
});

const target = {
  root: "C:\\work\\studyforge",
  project: {
    id: "prj_studyforge",
    slug: "studyforge",
    name: "StudyForge",
    root: "C:\\work\\studyforge",
    rootKey: "c:\\work\\studyforge",
    permissionPreset: "develop" as const,
    defaultMode: "checkout" as const,
    pinned: true,
    source: "manual" as const,
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
  },
};
const invocation = {
  command: "C:\\Program Files\\Codex\\codex.exe",
  prefixArgs: [],
};

assert.deepEqual(
  buildCodexLaunchPlan(
    invocation,
    { command: "codex", selector: "studyforge", passthrough: ["--search"] },
    target,
  ),
  {
    command: invocation.command,
    args: ["-C", target.root, "--search"],
    cwd: target.root,
    label: "StudyForge",
  },
);

assert.deepEqual(
  buildCodexLaunchPlan(
    invocation,
    { command: "resume", selector: "studyforge", passthrough: ["-m", "gpt-5.6-sol"] },
    target,
  ).args,
  ["resume", "-C", target.root, "--last", "-m", "gpt-5.6-sol"],
);
assert.deepEqual(
  buildCodexLaunchPlan(
    invocation,
    { command: "resume", selector: "studyforge", passthrough: ["--picker"] },
    target,
  ).args,
  ["resume", "-C", target.root],
);

const handoff: WorkspaceHandoff = {
  root: target.root,
  status: "ready",
  summary: "Parser and storage changes are complete.",
  completed: ["Implemented the parser."],
  nextActions: ["Run the focused test."],
  verification: ["Typecheck passed."],
  risks: ["Reconcile Git before editing."],
  activeAgents: [],
  updatedAt: "2026-08-06T00:00:00.000Z",
};
const prompt = buildHandoffPrompt(handoff);
assert.match(prompt, /Continue this project from the dpkr helix persistent handoff/);
assert.match(prompt, /Parser and storage changes are complete/);
assert.match(prompt, /Treat this handoff as a resume aid, not as ground truth/);

const continuePlan = buildCodexLaunchPlan(
  invocation,
  { command: "continue", selector: "studyforge", passthrough: ["--search"] },
  target,
  handoff,
);
assert.deepEqual(continuePlan.args.slice(0, 4), ["-C", target.root, "--search", prompt]);
assert.throws(
  () => buildCodexLaunchPlan(
    invocation,
    { command: "continue", selector: "studyforge", passthrough: [] },
    target,
  ),
  /No persistent dpkr helix handoff exists/,
);

const discoveryCandidates = [
  {
    root: "C:\\work\\StudyForge",
    relativePath: "StudyForge",
    name: "StudyForge",
    slug: "studyforge",
    alreadyRegistered: false,
    gitMarker: "directory" as const,
  },
  {
    root: "C:\\work\\StudyForge-Legacy",
    relativePath: "StudyForge-Legacy",
    name: "StudyForge Legacy",
    slug: "studyforge-legacy",
    alreadyRegistered: false,
    gitMarker: "directory" as const,
  },
];
assert.deepEqual(
  selectDiscoveryMatches("studyforge", discoveryCandidates).map((candidate) => candidate.root),
  ["C:\\work\\StudyForge"],
);
assert.deepEqual(
  selectDiscoveryMatches("StudyForge Legacy", discoveryCandidates).map((candidate) => candidate.root),
  ["C:\\work\\StudyForge-Legacy"],
);

const executableFixture = join(
  tmpdir(),
  `dpkr-helix-launcher-test-${process.pid}-${Date.now()}`,
);
try {
  const appBin = join(executableFixture, "app-bin");
  const npmBin = join(executableFixture, "npm-bin");
  mkdirSync(appBin, { recursive: true });
  mkdirSync(join(npmBin, "node_modules", "@openai", "codex", "bin"), {
    recursive: true,
  });
  writeFileSync(join(appBin, "codex.exe"), "fixture");
  writeFileSync(join(npmBin, "codex.cmd"), "fixture");
  writeFileSync(
    join(npmBin, "node_modules", "@openai", "codex", "bin", "codex.js"),
    "fixture",
  );

  assert.deepEqual(
    findCodexInvocation(
      { PATH: [appBin, npmBin].join(delimiter) },
      "win32",
    ),
    { command: join(appBin, "codex.exe"), prefixArgs: [] },
  );

  rmSync(join(appBin, "codex.exe"));
  assert.deepEqual(
    findCodexInvocation(
      { PATH: npmBin },
      "win32",
    ),
    {
      command: process.execPath,
      prefixArgs: [join(npmBin, "node_modules", "@openai", "codex", "bin", "codex.js")],
    },
  );
} finally {
  rmSync(executableFixture, { recursive: true, force: true });
}

console.log("helix launcher tests passed");
