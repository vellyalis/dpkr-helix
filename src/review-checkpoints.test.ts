import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { createReviewCheckpointManager } from "./review-checkpoints.js";

const execFileAsync = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "devspace-review-checkpoints-test-"));
const otherRoot = await mkdtemp(join(tmpdir(), "devspace-review-checkpoints-other-test-"));

try {
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "devspace@example.com"]);
  await git(root, ["config", "user.name", "DevSpace Test"]);
  await writeFile(join(root, "README.md"), "hello\n");
  await git(root, ["add", "README.md"]);
  await git(root, ["commit", "-m", "Initial commit"]);

  await git(otherRoot, ["init"]);
  await git(otherRoot, ["config", "user.email", "devspace@example.com"]);
  await git(otherRoot, ["config", "user.name", "DevSpace Test"]);
  await writeFile(join(otherRoot, "README.md"), "other\n");
  await git(otherRoot, ["add", "README.md"]);
  await git(otherRoot, ["commit", "-m", "Initial commit"]);

  const manager = createReviewCheckpointManager();
  await manager.initializeWorkspace({ workspaceId: "ws_review", root });

  const clean = await manager.reviewChanges({ workspaceId: "ws_review", root });
  assert.equal(clean.summary.files, 0);
  assert.equal(clean.patch, "");
  assert.match(clean.result, /No changes/);

  await writeFile(join(root, "README.md"), "hello\nworld\n");
  await writeFile(join(root, "new.txt"), "new\n");

  const firstReview = await manager.reviewChanges({
    workspaceId: "ws_review",
    root,
    markReviewed: false,
  });
  assert.equal(firstReview.summary.files, 2);
  assert.equal(firstReview.summary.additions, 2);
  assert.equal(firstReview.summary.removals, 0);
  assert.equal(firstReview.files.some((file) => file.path === "README.md"), true);
  assert.equal(firstReview.files.some((file) => file.path === "new.txt"), true);
  assert.match(firstReview.patch, /world/);

  const stillUnreviewed = await manager.reviewChanges({
    workspaceId: "ws_review",
    root,
    markReviewed: true,
  });
  assert.equal(stillUnreviewed.summary.files, 2);

  const afterReviewed = await manager.reviewChanges({ workspaceId: "ws_review", root });
  assert.equal(afterReviewed.summary.files, 0);

  const restartedManager = createReviewCheckpointManager();
  await restartedManager.initializeWorkspace({ workspaceId: "ws_review", root });
  await writeFile(join(root, "third.txt"), "third\n");
  const afterRestart = await restartedManager.reviewChanges({ workspaceId: "ws_review", root });
  assert.equal(afterRestart.summary.files, 1);
  assert.equal(afterRestart.files[0]?.path, "third.txt");

  await Promise.all([
    restartedManager.initializeWorkspace({ workspaceId: "ws_concurrent", root }),
    restartedManager.initializeWorkspace({ workspaceId: "ws_concurrent", root }),
  ]);
  const concurrent = await restartedManager.reviewChanges({ workspaceId: "ws_concurrent", root });
  assert.equal(concurrent.summary.files, 0);

  await assert.rejects(
    () => restartedManager.initializeWorkspace({ workspaceId: "ws_review", root: otherRoot }),
    /workspace root mismatch/i,
  );

  const fallbackManager = createReviewCheckpointManager();
  await fallbackManager.initializeWorkspace({ workspaceId: "ws_fallback", root });
  await writeFile(join(root, "fallback.txt"), "fallback\n");
  await git(root, ["update-ref", "-d", "refs/devspace/review/ws_fallback/baseline"]);

  const fallbackAfterRestart = createReviewCheckpointManager();
  await fallbackAfterRestart.initializeWorkspace({ workspaceId: "ws_fallback", root });
  const fallbackReview = await fallbackAfterRestart.reviewChanges({
    workspaceId: "ws_fallback",
    root,
  });
  assert.equal(fallbackReview.files.some((file) => file.path === "fallback.txt"), true);
  assert.match(fallbackReview.result, /checkpoint was missing/i);
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(otherRoot, { recursive: true, force: true });
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}
