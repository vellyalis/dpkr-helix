import assert from "node:assert/strict";
import {
  mkdtemp,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "../git.js";
import {
  readRepositoryDiffSummary,
  readRepositoryFileDiff,
} from "./repository-diff.js";

const root = await mkdtemp(join(tmpdir(), "devspace-repository-diff-"));
const outside = await mkdtemp(join(tmpdir(), "devspace-repository-diff-outside-"));

try {
  await git(root, ["init"]);
  await git(root, ["config", "user.name", "DevSpace Test"]);
  await git(root, ["config", "user.email", "devspace-test@example.invalid"]);
  await writeFile(join(root, "rename-me.txt"), "same\n", "utf8");
  await writeFile(join(root, "modify.txt"), "before\n", "utf8");
  await writeFile(join(root, "delete.txt"), "delete\n", "utf8");
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "baseline"]);

  await rename(join(root, "rename-me.txt"), join(root, "renamed.txt"));
  await git(root, ["add", "-A", "--", "rename-me.txt", "renamed.txt"]);
  await writeFile(join(root, "modify.txt"), "after\n", "utf8");
  await unlink(join(root, "delete.txt"));
  await writeFile(join(root, "added.txt"), "added\n", "utf8");
  await git(root, ["add", "--", "added.txt"]);
  await writeFile(join(root, "untracked.txt"), "untracked\n", "utf8");

  const summary = await readRepositoryDiffSummary(root);
  assert.equal(summary.state, "available");
  assert.deepEqual(
    new Map(summary.files.map((file) => [file.path, file.operation])),
    new Map([
      ["added.txt", "added"],
      ["delete.txt", "deleted"],
      ["modify.txt", "modified"],
      ["renamed.txt", "renamed"],
      ["untracked.txt", "untracked"],
    ]),
  );
  assert.equal(
    summary.files.find(({ path }) => path === "renamed.txt")?.previousPath,
    "rename-me.txt",
  );
  assert.equal(
    summary.files.find(({ path }) => path === "untracked.txt")?.additions,
    undefined,
  );
  assert.equal(summary.statsIncomplete, true);
  assert.equal(summary.additions >= 2, true);
  assert.equal(summary.removals >= 2, true);

  const modified = await readRepositoryFileDiff(root, "modify.txt");
  assert.equal(modified.state, "available");
  assert.match(modified.patch ?? "", /-before/);
  assert.match(modified.patch ?? "", /\+after/);

  const untracked = await readRepositoryFileDiff(root, "untracked.txt");
  assert.equal(untracked.state, "available");
  assert.match(untracked.patch ?? "", /--- \/dev\/null/);
  assert.match(untracked.patch ?? "", /\+untracked/);

  const unlisted = await readRepositoryFileDiff(root, "../outside.txt");
  assert.equal(unlisted.state, "unavailable");
  assert.match(unlisted.message ?? "", /not in the current repository change set/i);

  const unavailable = await readRepositoryDiffSummary(outside);
  assert.equal(unavailable.state, "unavailable");
  assert.match(unavailable.message ?? "", /git repository/i);
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
}

console.log("repository diff tests passed");
