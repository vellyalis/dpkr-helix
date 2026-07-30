import { createRequire } from "node:module";
import {
  cpSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nodeModulesRoot = join(projectRoot, "node_modules");
const patchedSource = join(nodeModulesRoot, "brace-expansion");
const piRoot = join(
  nodeModulesRoot,
  "@earendil-works",
  "pi-coding-agent",
);
const nestedTarget = join(piRoot, "node_modules", "brace-expansion");
const minimatchPackage = join(piRoot, "node_modules", "minimatch", "package.json");
const minimumSafeVersion = [5, 0, 8];

function assertInsideNodeModules(path) {
  const pathFromNodeModules = relative(nodeModulesRoot, path);
  if (
    pathFromNodeModules === "" ||
    pathFromNodeModules.startsWith("..") ||
    resolve(nodeModulesRoot, pathFromNodeModules) !== resolve(path)
  ) {
    throw new Error(
      `Refusing to modify a path outside node_modules: ${relative(projectRoot, path)}`,
    );
  }
}

function readVersion(packageRoot) {
  const packageJsonPath = join(packageRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (
    packageJson.name !== "brace-expansion" ||
    typeof packageJson.version !== "string"
  ) {
    throw new Error(
      `Unexpected package metadata at ${relative(projectRoot, packageJsonPath)}`,
    );
  }
  return String(packageJson.version);
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unexpected brace-expansion version: ${version}`);
  }
  return match.slice(1).map(Number);
}

function isSafe(version) {
  const parsed = parseVersion(version);
  for (let index = 0; index < minimumSafeVersion.length; index += 1) {
    if (parsed[index] > minimumSafeVersion[index]) return true;
    if (parsed[index] < minimumSafeVersion[index]) return false;
  }
  return true;
}

function findPackageRoot(entryPath) {
  let current = dirname(entryPath);
  while (current.startsWith(nodeModulesRoot)) {
    const packageJsonPath = join(current, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      if (
        packageJson.name === "brace-expansion" &&
        typeof packageJson.version === "string"
      ) {
        return current;
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("Could not locate the resolved brace-expansion package root.");
}

function resolvedPiVersion() {
  if (!existsSync(minimatchPackage)) {
    return null;
  }
  const requireFromMinimatch = createRequire(minimatchPackage);
  const entryPath = requireFromMinimatch.resolve("brace-expansion");
  return {
    root: findPackageRoot(entryPath),
    version: readVersion(findPackageRoot(entryPath)),
  };
}

function verifyResolvedVersion() {
  const resolved = resolvedPiVersion();
  if (!resolved) {
    console.log("Pi minimatch is not installed; brace-expansion patch is not required.");
    return;
  }
  if (!isSafe(resolved.version)) {
    throw new Error(
      `Pi still resolves vulnerable brace-expansion ${resolved.version}.`,
    );
  }
  console.log(`Pi resolves patched brace-expansion ${resolved.version}.`);
}

if (process.argv.includes("--check")) {
  verifyResolvedVersion();
  process.exit(0);
}

if (!existsSync(patchedSource)) {
  throw new Error(
    "Pinned brace-expansion is missing. Run npm ci from the reviewed lockfile.",
  );
}

const sourceVersion = readVersion(patchedSource);
if (!isSafe(sourceVersion)) {
  throw new Error(`Pinned brace-expansion ${sourceVersion} is not safe.`);
}

const before = resolvedPiVersion();
if (!before || isSafe(before.version)) {
  verifyResolvedVersion();
  process.exit(0);
}

assertInsideNodeModules(nestedTarget);
const suffix = `.dpkr-safe-${process.pid}`;
const stagedTarget = `${nestedTarget}${suffix}`;
const previousTarget = `${nestedTarget}.dpkr-old-${process.pid}`;
assertInsideNodeModules(stagedTarget);
assertInsideNodeModules(previousTarget);

rmSync(stagedTarget, { recursive: true, force: true });
rmSync(previousTarget, { recursive: true, force: true });
cpSync(patchedSource, stagedTarget, { recursive: true });

if (readVersion(stagedTarget) !== sourceVersion) {
  rmSync(stagedTarget, { recursive: true, force: true });
  throw new Error("Staged brace-expansion copy failed verification.");
}

try {
  renameSync(nestedTarget, previousTarget);
  renameSync(stagedTarget, nestedTarget);
  verifyResolvedVersion();
  rmSync(previousTarget, { recursive: true, force: true });
} catch (error) {
  if (!existsSync(nestedTarget) && existsSync(previousTarget)) {
    renameSync(previousTarget, nestedTarget);
  }
  rmSync(stagedTarget, { recursive: true, force: true });
  throw error;
}
