import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "../git.js";
import {
  readRepositoryContext,
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
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "nested", "inside.txt"), "inside\n", "utf8");
  await writeFile(join(root, "sibling.txt"), "sibling\n", "utf8");
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "baseline"]);

  const cleanContext = await readRepositoryContext(root);
  assert.equal(cleanContext.state, "available");
  assert.equal(cleanContext.dirty.total, 0);
  assert.equal(cleanContext.manifest, undefined);
  assert.equal(
    cleanContext.fingerprint,
    (await git(root, ["rev-parse", "HEAD^{tree}"])).stdout.trim(),
  );
  await writeFile(join(root, "sibling.txt"), "changed sibling\n", "utf8");
  await writeFile(join(root, "sibling-untracked.txt"), "outside scope\n", "utf8");
  const nestedContext = await readRepositoryContext(join(root, "nested"));
  assert.equal(nestedContext.dirty.total, 0);
  assert.equal(nestedContext.fingerprint, cleanContext.fingerprint);
  await writeFile(join(root, "sibling.txt"), "sibling\n", "utf8");
  await unlink(join(root, "sibling-untracked.txt"));
  await git(root, ["checkout", "--detach"]);

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

  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      scripts: Object.fromEntries(
        Array.from({ length: 102 }, (_, index) => [
          `script-${String(index).padStart(3, "0")}`,
          "echo test",
        ]),
      ),
    }),
    "utf8",
  );
  await Promise.all(
    Array.from({ length: 201 }, (_, index) =>
      writeFile(
        join(root, `extra-${String(index).padStart(3, "0")}.txt`),
        "extra\n",
        "utf8",
      )
    ),
  );
  await writeFile(join(root, "binary-untracked.bin"), Buffer.from([0, 1, 2]));

  const indexBefore = await readFile(join(root, ".git", "index"));
  const headBefore = (await git(root, ["rev-parse", "HEAD"])).stdout;
  const refsBefore = (
    await git(root, ["for-each-ref", "--format=%(refname):%(objectname)"])
  ).stdout;
  const statusBefore = (await git(root, ["status", "--porcelain=v1", "-z"])).stdout;
  const context = await readRepositoryContext(root);
  assert.equal(context.state, "available");
  assert.equal(context.branch, undefined);
  assert.equal(context.head, headBefore.trim());
  assert.equal(context.dirty.total, 208);
  assert.equal(context.dirty.returned, 200);
  assert.equal(context.dirty.truncated, true);
  assert.equal(context.manifest?.scriptNames.length, 100);
  assert.equal(context.manifest?.scriptNames[0], "script-000");
  assert.equal(context.manifest?.scriptNames[99], "script-099");
  assert.equal(context.manifest?.truncated, true);
  assert.equal(
    context.dirty.files.find(({ path }) => path === "binary-untracked.bin")?.binary,
    true,
  );
  assert.equal((await readRepositoryContext(root)).fingerprint, context.fingerprint);
  assert.deepEqual(await readFile(join(root, ".git", "index")), indexBefore);
  assert.equal((await git(root, ["rev-parse", "HEAD"])).stdout, headBefore);
  assert.equal(
    (await git(root, ["for-each-ref", "--format=%(refname):%(objectname)"])).stdout,
    refsBefore,
  );
  assert.equal((await git(root, ["status", "--porcelain=v1", "-z"])).stdout, statusBefore);
  assert.equal(await readFile(join(root, "modify.txt"), "utf8"), "after\n");

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
  const unavailableContext = await readRepositoryContext(outside);
  assert.equal(unavailableContext.state, "unavailable");
  assert.equal(unavailableContext.dirty.total, 0);
  assert.equal(unavailableContext.manifest, undefined);
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
}

console.log("repository diff tests passed");
