import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { createReviewBundle, reviewBundleOutputSchema } from "./review-bundle.js";

const currentFingerprint = "a".repeat(40);
const files = Array.from({ length: 201 }, (_, index) => ({
  path: `src/file-${index}.ts`,
  type: "change" as const,
  additions: 1,
  removals: 0,
  binary: index === 0,
}));
const review = {
  result: "Changed 201 files (+201 -0).",
  summary: { files: 201, additions: 201, removals: 0 },
  files,
  patch: "🙂".repeat(40_000),
};
const repositoryContext = {
  state: "available" as const,
  basis: "current_worktree" as const,
  refreshedAt: "2026-08-02T00:00:00.000Z",
  branch: "main",
  head: "c".repeat(40),
  fingerprint: currentFingerprint,
  dirty: {
    total: 1,
    returned: 1,
    truncated: false,
    files: [{ path: "asset.bin", operation: "untracked" as const, binary: true }],
  },
};

const bundle = createReviewBundle({
  review,
  repositoryContext,
  agentId: "agt_review",
  evidence: [
    { type: "typecheck", state: "passed", basisFingerprint: currentFingerprint },
    { type: "tests", state: "passed", basisFingerprint: "b".repeat(40) },
    { type: "build", state: "passed" },
    { type: "review", state: "failed" },
  ],
});
reviewBundleOutputSchema.parse(bundle);
assert.equal(bundle.turnChanges.filesReturned, 200);
assert.equal(bundle.turnChanges.filesTruncated, true);
assert.equal(bundle.turnChanges.patchTruncated, true);
assert.ok(bundle.turnChanges.patchBytes <= 128 * 1_024);
assert.equal(Buffer.byteLength(bundle.turnChanges.patch, "utf8"), bundle.turnChanges.patchBytes);
assert.deepEqual(
  bundle.verification.items.map(({ freshness }) => freshness),
  ["fresh", "stale", "unknown_legacy", "failed", "missing"],
);
assert.equal(bundle.workspaceChanges.files[0]?.binary, true);

assert.equal(
  createReviewBundle({
    review: { ...review, files: [], patch: "" },
    repositoryContext: { ...repositoryContext, fingerprint: "b".repeat(40) },
    agentId: "agt_review",
    evidence: [{ type: "tests", state: "passed", basisFingerprint: "b".repeat(40) }],
  }).verification.items.find(({ type }) => type === "tests")?.freshness,
  "fresh",
);
