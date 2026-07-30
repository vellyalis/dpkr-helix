import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectDiscovery } from "./project-discovery.js";

const root = await mkdtemp(join(tmpdir(), "devspace-discovery-test-"));
try {
  const allowed = join(root, "allowed");
  const outside = join(root, "outside");
  const repo = join(allowed, "team", "repo");
  const nested = join(repo, "nested");
  const tooDeep = join(allowed, "a", "b", "c");
  const heavyRepo = join(allowed, "node_modules", "dep");
  await mkdir(join(repo, ".git"), { recursive: true });
  await mkdir(join(nested, ".git"), { recursive: true });
  await mkdir(tooDeep, { recursive: true });
  await mkdir(heavyRepo, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(tooDeep, ".git"), "gitdir: ../real\n");
  await writeFile(join(heavyRepo, ".git"), "");
  try {
    await symlink(outside, join(allowed, "outside-link"), "dir");
  } catch {
    // Windows without symlink permission still exercises the non-link cases.
  }

  const discovery = new ProjectDiscovery([allowed], { getByRootKey: () => undefined });
  const result = await discovery.scan({ maxDepth: 4, maxDirectories: 100, timeoutMs: 10_000 });
  assert.deepEqual(result.candidates.map((candidate) => candidate.name).sort(), ["c", "repo"]);
  assert.equal(result.candidates.some((candidate) => candidate.root.includes("node_modules")), false);
  assert.equal(result.candidates.some((candidate) => candidate.root.includes("nested")), false);
  assert.equal(result.candidates.find((candidate) => candidate.name === "c")?.gitMarker, "file");

  const shallow = await discovery.scan({ maxDepth: 1 });
  assert.equal(shallow.candidates.some((candidate) => candidate.name === "c"), false);

  const limited = await discovery.scan({ maxDirectories: 1 });
  assert.equal(limited.truncated, true);
  assert.equal(limited.reason, "directory_limit");

  await assert.rejects(
    () => discovery.scan({ roots: [outside] }),
    /outside configured allowed roots/,
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
