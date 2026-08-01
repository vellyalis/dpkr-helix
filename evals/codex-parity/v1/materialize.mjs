import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const suiteRoot = resolve(import.meta.dirname);
const suitePath = join(suiteRoot, "suite.json");
const suite = readJson(suitePath);
const command = process.argv[2] ?? "validate";

if (!new Set(["validate", "prepare"]).has(command)) {
  fail("Usage: node materialize.mjs validate | prepare [--out PATH] [--attempts 2|3]");
}

const cases = validateSuite();

if (command === "validate") {
  console.log(`Validated ${suite.suiteId} v${suite.version} with ${cases.length} cases.`);
  process.exit(0);
}

const outArg = option("--out");
if (!outArg) fail("prepare requires --out PATH");
const outRoot = resolve(process.cwd(), outArg);
const attempts = Number(option("--attempts") ?? suite.requiredAttempts);
if (![2, 3].includes(attempts)) fail("--attempts must be 2 or 3");
if (outRoot === resolve(process.cwd()) || outRoot === suiteRoot || existsSync(outRoot)) {
  fail(`Output must be a new directory distinct from the repository and suite roots: ${outRoot}`);
}

mkdirSync(outRoot, { recursive: true });
const prepared = [];

for (const entry of cases) {
  const caseRoot = dirname(entry.manifestPath);
  const source = join(outRoot, entry.manifest.id, "source");
  cpSync(join(caseRoot, entry.manifest.snapshot.seedDirectory), source, {
    recursive: true,
    errorOnExist: true,
  });
  initDeterministicRepository(source);
  const seedCommit = git(source, ["rev-parse", "HEAD"]).trim();
  if (entry.suiteCase.expectedSeedCommit !== seedCommit) {
    fail(`${entry.manifest.id}: seed commit mismatch; expected ${entry.suiteCase.expectedSeedCommit}, received ${seedCommit}`);
  }

  for (const surface of suite.surfaces) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const attemptRoot = join(outRoot, entry.manifest.id, surface, `attempt-${attempt}`);
      const workspace = join(attemptRoot, "workspace");
      mkdirSync(attemptRoot, { recursive: true });
      git(outRoot, ["clone", "--quiet", "--no-hardlinks", source, workspace]);
      applyWorkingTree(caseRoot, workspace, entry.manifest.snapshot.workingTreeDirectory);
      createOutsideCanary(attemptRoot, workspace, entry.manifest.setup?.outsideReadCanary);
      const startingDiff = git(workspace, ["diff", "--binary", "HEAD"]);
      const status = git(workspace, ["status", "--short"]);
      const attemptRecord = {
        schema: "dpkr-helix-parity-attempt/v1",
        suiteId: suite.suiteId,
        suiteVersion: suite.version,
        caseId: entry.manifest.id,
        surface,
        attempt,
        workspace,
        seedCommit,
        manifestSha256: entry.manifestSha256,
        startingDiffSha256: sha256(startingDiff),
        startingStatus: status.split(/\r?\n/).filter(Boolean),
      };
      writeFileSync(join(attemptRoot, "attempt.json"), `${JSON.stringify(attemptRecord, null, 2)}\n`);
      const result = readJson(join(suiteRoot, "result-template.json"));
      result.caseId = entry.manifest.id;
      result.surface = surface;
      result.attempt = attempt;
      result.snapshot = {
        seedCommit,
        manifestSha256: entry.manifestSha256,
        startingDiffSha256: attemptRecord.startingDiffSha256,
      };
      writeFileSync(join(attemptRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
      prepared.push(attemptRecord);
    }
  }
}

writeFileSync(
  join(outRoot, "prepared.json"),
  `${JSON.stringify({ schema: "dpkr-helix-parity-prepared/v1", suiteId: suite.suiteId, suiteVersion: suite.version, attempts, prepared }, null, 2)}\n`,
);
console.log(`Prepared ${prepared.length} workspaces under ${outRoot}.`);

function validateSuite() {
  if (suite.schema !== "dpkr-helix-parity-suite/v1" || suite.version !== 1) {
    fail("Unsupported suite schema or version.");
  }
  if (suite.requiredAttempts !== 2 || !Array.isArray(suite.cases) || suite.cases.length !== 8) {
    fail("Suite must define exactly P01-P08 and two required attempts.");
  }
  for (const artifact of Object.values(suite.artifacts ?? {})) {
    const artifactPath = resolveInside(suiteRoot, artifact.path);
    const actualHash = sha256(readFileSync(artifactPath));
    if (artifact.sha256 !== actualHash) {
      fail(`${artifact.path}: artifact digest mismatch; expected ${artifact.sha256}, received ${actualHash}`);
    }
  }
  if (Object.keys(suite.artifacts ?? {}).length !== 3) {
    fail("Suite must freeze the result schema, result template, and materializer digests.");
  }
  const expectedIds = Array.from({ length: 8 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`);
  const actualIds = suite.cases.map((entry) => entry.id);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) fail("Suite case order must be P01-P08.");

  return suite.cases.map((suiteCase) => {
    const manifestPath = resolveInside(suiteRoot, suiteCase.manifest);
    const raw = readFileSync(manifestPath);
    const manifestSha256 = sha256(raw);
    if (suiteCase.manifestSha256 !== manifestSha256) {
      fail(`${suiteCase.id}: manifest digest mismatch; expected ${suiteCase.manifestSha256}, received ${manifestSha256}`);
    }
    const manifest = JSON.parse(raw.toString("utf8"));
    validateManifest(manifest, suiteCase.id, dirname(manifestPath));
    if (!/^[0-9a-f]{40}$/.test(suiteCase.expectedSeedCommit)) {
      fail(`${suiteCase.id}: expectedSeedCommit is not frozen.`);
    }
    return { suiteCase, manifestPath, manifest, manifestSha256 };
  });
}

function validateManifest(manifest, id, caseRoot) {
  if (manifest.schema !== "dpkr-helix-parity-case/v1" || manifest.id !== id) {
    fail(`${id}: unsupported or mismatched case manifest.`);
  }
  for (const field of ["title", "task", "constraints", "acceptance", "permissions", "snapshot", "evidence"]) {
    if (manifest[field] === undefined) fail(`${id}: missing ${field}.`);
  }
  if (!Array.isArray(manifest.constraints) || !Array.isArray(manifest.acceptance)) {
    fail(`${id}: constraints and acceptance must be arrays.`);
  }
  const seed = resolveInside(caseRoot, manifest.snapshot.seedDirectory);
  if (!statSync(seed).isDirectory()) fail(`${id}: seedDirectory is not a directory.`);
  if (manifest.snapshot.workingTreeDirectory) {
    const workingTree = resolveInside(caseRoot, manifest.snapshot.workingTreeDirectory);
    if (!statSync(workingTree).isDirectory()) fail(`${id}: workingTreeDirectory is not a directory.`);
  }
  const paths = listFiles(seed).map((path) => relative(seed, path).replaceAll(sep, "/"));
  if (!paths.includes("package.json") || paths.some((path) => /(^|\/)\.git(\/|$)/.test(path))) {
    fail(`${id}: seed must contain package.json and no .git content.`);
  }
}

function initDeterministicRepository(directory) {
  git(directory, ["init", "--quiet", "--initial-branch=main"]);
  git(directory, ["config", "core.autocrlf", "false"]);
  git(directory, ["config", "core.filemode", "false"]);
  git(directory, ["config", "user.name", "dpkr helix parity"]);
  git(directory, ["config", "user.email", "parity@example.invalid"]);
  git(directory, ["add", "--all"]);
  git(directory, ["commit", "--quiet", "-m", "fixture: freeze parity seed"], {
    GIT_AUTHOR_DATE: "2026-08-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-08-01T00:00:00Z",
  });
}

function applyWorkingTree(caseRoot, workspace, directory) {
  if (!directory) return;
  const overlay = resolveInside(caseRoot, directory);
  for (const file of listFiles(overlay)) {
    const target = resolveInside(workspace, relative(overlay, file));
    mkdirSync(dirname(target), { recursive: true });
    cpSync(file, target, { force: true });
  }
}

function createOutsideCanary(attemptRoot, workspace, config) {
  if (!config) return;
  const target = resolve(workspace, config.relativePath);
  const relativeToWorkspace = relative(workspace, target);
  const relativeToAttempt = relative(attemptRoot, target);
  if (!relativeToWorkspace.startsWith(`..${sep}`) || relativeToAttempt.startsWith(`..${sep}`) || isAbsolute(relativeToAttempt)) {
    fail("Outside-read canary must be outside the workspace but inside its attempt directory.");
  }
  writeFileSync(target, `${config.syntheticValue}\n`, { flag: "wx" });
}

function listFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

function git(cwd, args, extraEnv = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function resolveInside(root, path) {
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (rel === "" || (!rel.startsWith(`..${sep}`) && !isAbsolute(rel))) return target;
  fail(`Path escapes expected root: ${path}`);
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} requires a value.`);
  return value;
}

function fail(message) {
  throw new Error(message);
}
