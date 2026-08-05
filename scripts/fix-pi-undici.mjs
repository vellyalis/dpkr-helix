import { createRequire } from "node:module";
import {
  cpSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nodeModulesRoot = join(projectRoot, "node_modules");
const patchedSource = join(nodeModulesRoot, "undici");
const piRoot = join(
  nodeModulesRoot,
  "@earendil-works",
  "pi-coding-agent",
);
const piPackagePath = join(piRoot, "package.json");
const piShrinkwrapPath = join(piRoot, "npm-shrinkwrap.json");
const nestedTarget = join(piRoot, "node_modules", "undici");
const hiddenLockPath = join(nodeModulesRoot, ".package-lock.json");
const reviewedVersion = "8.10.0";
const reviewedResolved = "https://registry.npmjs.org/undici/-/undici-8.10.0.tgz";
const reviewedIntegrity = "sha512-HvltHd7avK13QIw/oLe4qoOLyoVSoafqJ2jYOrtMRBkbYT31eiBQ8O0ehRKZiEZCMEyLFQNIADpgCWC5fALvYQ==";
const reviewedLockEntry = {
  version: reviewedVersion,
  resolved: reviewedResolved,
  integrity: reviewedIntegrity,
  license: "MIT",
  engines: {
    node: ">=22.19.0",
  },
};

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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readVersion(packageRoot) {
  const packageJsonPath = join(packageRoot, "package.json");
  const packageJson = readJson(packageJsonPath);
  if (
    packageJson.name !== "undici" ||
    typeof packageJson.version !== "string"
  ) {
    throw new Error(
      `Unexpected package metadata at ${relative(projectRoot, packageJsonPath)}`,
    );
  }
  return String(packageJson.version);
}

function assertReviewedLockEntry(entry, label) {
  if (
    !entry ||
    entry.version !== reviewedVersion ||
    entry.resolved !== reviewedResolved ||
    entry.integrity !== reviewedIntegrity
  ) {
    throw new Error(`${label} does not pin reviewed undici ${reviewedVersion}.`);
  }
}

function rootDeploymentLockPath() {
  for (const name of ["npm-shrinkwrap.json", "package-lock.json"]) {
    const path = join(projectRoot, name);
    if (existsSync(path)) return path;
  }
  throw new Error("The root deployment lock is missing.");
}

function verifyRootDeploymentLock() {
  const lockPath = rootDeploymentLockPath();
  const lock = readJson(lockPath);
  const rootPackage = lock.packages?.[""];
  const piPackage = lock.packages?.[
    "node_modules/@earendil-works/pi-coding-agent"
  ];
  if (rootPackage?.dependencies?.undici !== reviewedVersion) {
    throw new Error(
      `The root deployment lock does not require undici ${reviewedVersion}.`,
    );
  }
  if (piPackage?.dependencies?.undici !== reviewedVersion) {
    throw new Error(
      `The root deployment lock does not override Pi undici to ${reviewedVersion}.`,
    );
  }
  assertReviewedLockEntry(
    lock.packages?.["node_modules/undici"],
    "The root undici lock entry",
  );
  assertReviewedLockEntry(
    lock.packages?.[
      "node_modules/@earendil-works/pi-coding-agent/node_modules/undici"
    ],
    "The Pi undici lock entry",
  );
}

function findPackageRoot(entryPath) {
  let current = dirname(entryPath);
  while (current.startsWith(nodeModulesRoot)) {
    const packageJsonPath = join(current, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = readJson(packageJsonPath);
      if (
        packageJson.name === "undici" &&
        typeof packageJson.version === "string"
      ) {
        return current;
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("Could not locate the resolved Pi undici package root.");
}

function resolvedPiUndici() {
  if (!existsSync(piPackagePath)) {
    return null;
  }
  const requireFromPi = createRequire(piPackagePath);
  const entryPath = requireFromPi.resolve("undici");
  const root = findPackageRoot(entryPath);
  return {
    root,
    version: readVersion(root),
  };
}

function verifyInstalledMetadata() {
  const piPackage = readJson(piPackagePath);
  if (
    piPackage.name !== "@earendil-works/pi-coding-agent" ||
    piPackage.dependencies?.undici !== reviewedVersion
  ) {
    throw new Error(
      `Installed Pi package metadata does not require undici ${reviewedVersion}.`,
    );
  }

  const piShrinkwrap = readJson(piShrinkwrapPath);
  if (
    piShrinkwrap.packages?.[""]?.dependencies?.undici !== reviewedVersion
  ) {
    throw new Error(
      `Installed Pi shrinkwrap does not require undici ${reviewedVersion}.`,
    );
  }
  assertReviewedLockEntry(
    piShrinkwrap.packages?.["node_modules/undici"],
    "Installed Pi shrinkwrap",
  );

  if (existsSync(hiddenLockPath)) {
    const hiddenLock = readJson(hiddenLockPath);
    if (
      hiddenLock.packages?.[
        "node_modules/@earendil-works/pi-coding-agent"
      ]?.dependencies?.undici !== reviewedVersion
    ) {
      throw new Error(
        `npm hidden lock does not require Pi undici ${reviewedVersion}.`,
      );
    }
    assertReviewedLockEntry(
      hiddenLock.packages?.[
        "node_modules/@earendil-works/pi-coding-agent/node_modules/undici"
      ],
      "npm hidden Pi undici lock entry",
    );
  }
}

function verifyResolvedVersion() {
  const resolved = resolvedPiUndici();
  if (!resolved) {
    console.log("Pi is not installed; undici patch is not required.");
    return;
  }
  if (resolved.version !== reviewedVersion) {
    throw new Error(
      `Pi resolves unreviewed undici ${resolved.version}; expected ${reviewedVersion}.`,
    );
  }
  verifyInstalledMetadata();
  console.log(`Pi resolves reviewed undici ${resolved.version}.`);
}

function patchPiPackageMetadata() {
  const value = readJson(piPackagePath);
  if (value.name !== "@earendil-works/pi-coding-agent") {
    throw new Error("Installed Pi package metadata has an unexpected name.");
  }
  const current = value.dependencies?.undici;
  if (current !== "8.5.0" && current !== reviewedVersion) {
    throw new Error(`Installed Pi requires unexpected undici ${current}.`);
  }
  value.dependencies.undici = reviewedVersion;
  return value;
}

function patchPiShrinkwrap() {
  const value = readJson(piShrinkwrapPath);
  if (value.packages?.[""]?.name !== "@earendil-works/pi-coding-agent") {
    throw new Error("Installed Pi shrinkwrap has an unexpected root package.");
  }
  const current = value.packages[""].dependencies?.undici;
  if (current !== "8.5.0" && current !== reviewedVersion) {
    throw new Error(`Installed Pi shrinkwrap requires unexpected undici ${current}.`);
  }
  value.packages[""].dependencies.undici = reviewedVersion;
  value.packages["node_modules/undici"] = { ...reviewedLockEntry };
  if (value.dependencies?.undici) {
    value.dependencies.undici = { ...reviewedLockEntry };
  }
  return value;
}

function patchHiddenLock() {
  if (!existsSync(hiddenLockPath)) return null;
  const value = readJson(hiddenLockPath);
  const piPackage = value.packages?.[
    "node_modules/@earendil-works/pi-coding-agent"
  ];
  if (!piPackage?.dependencies) {
    throw new Error("npm hidden lock is missing installed Pi metadata.");
  }
  const current = piPackage.dependencies.undici;
  if (current !== "8.5.0" && current !== reviewedVersion) {
    throw new Error(`npm hidden lock requires unexpected Pi undici ${current}.`);
  }
  piPackage.dependencies.undici = reviewedVersion;
  value.packages[
    "node_modules/@earendil-works/pi-coding-agent/node_modules/undici"
  ] = { ...reviewedLockEntry };
  return value;
}

function stageJsonReplacement(path, value) {
  assertInsideNodeModules(path);
  const suffix = `.dpkr-safe-${process.pid}`;
  const staged = `${path}${suffix}`;
  const previous = `${path}.dpkr-old-${process.pid}`;
  assertInsideNodeModules(staged);
  assertInsideNodeModules(previous);
  rmSync(staged, { recursive: true, force: true });
  rmSync(previous, { recursive: true, force: true });
  writeFileSync(staged, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  readJson(staged);
  return {
    path,
    staged,
    previous,
    replaced: false,
  };
}

function replaceStagedFile(record) {
  renameSync(record.path, record.previous);
  renameSync(record.staged, record.path);
  record.replaced = true;
}

function restoreStagedFile(record) {
  if (record.replaced) {
    rmSync(record.path, { recursive: true, force: true });
    if (existsSync(record.previous)) {
      renameSync(record.previous, record.path);
    }
  }
  rmSync(record.staged, { recursive: true, force: true });
}

verifyRootDeploymentLock();

if (process.argv.includes("--check")) {
  verifyResolvedVersion();
  process.exit(0);
}

if (!existsSync(patchedSource)) {
  throw new Error(
    "Pinned undici is missing. Run npm ci from the reviewed lockfile.",
  );
}
if (readVersion(patchedSource) !== reviewedVersion) {
  throw new Error(
    `Pinned undici does not match reviewed ${reviewedVersion}.`,
  );
}
if (!existsSync(piPackagePath) || !existsSync(piShrinkwrapPath)) {
  console.log("Pi is not installed; undici patch is not required.");
  process.exit(0);
}

const metadataReplacements = [
  stageJsonReplacement(piPackagePath, patchPiPackageMetadata()),
  stageJsonReplacement(piShrinkwrapPath, patchPiShrinkwrap()),
];
const hiddenLock = patchHiddenLock();
if (hiddenLock) {
  metadataReplacements.push(
    stageJsonReplacement(hiddenLockPath, hiddenLock),
  );
}

const before = resolvedPiUndici();
const replaceRuntime = !before || before.version !== reviewedVersion;
const runtimeSuffix = `.dpkr-safe-${process.pid}`;
const stagedTarget = `${nestedTarget}${runtimeSuffix}`;
const previousTarget = `${nestedTarget}.dpkr-old-${process.pid}`;
let runtimeReplaced = false;

if (replaceRuntime) {
  assertInsideNodeModules(nestedTarget);
  assertInsideNodeModules(stagedTarget);
  assertInsideNodeModules(previousTarget);
  rmSync(stagedTarget, { recursive: true, force: true });
  rmSync(previousTarget, { recursive: true, force: true });
  cpSync(patchedSource, stagedTarget, { recursive: true });
  if (readVersion(stagedTarget) !== reviewedVersion) {
    rmSync(stagedTarget, { recursive: true, force: true });
    throw new Error("Staged undici copy failed verification.");
  }
}

try {
  if (replaceRuntime) {
    if (existsSync(nestedTarget)) {
      renameSync(nestedTarget, previousTarget);
    }
    renameSync(stagedTarget, nestedTarget);
    runtimeReplaced = true;
  }
  for (const record of metadataReplacements) {
    replaceStagedFile(record);
  }
  verifyResolvedVersion();
  rmSync(previousTarget, { recursive: true, force: true });
  for (const record of metadataReplacements) {
    rmSync(record.previous, { recursive: true, force: true });
  }
} catch (error) {
  for (const record of [...metadataReplacements].reverse()) {
    restoreStagedFile(record);
  }
  if (runtimeReplaced) {
    rmSync(nestedTarget, { recursive: true, force: true });
    if (existsSync(previousTarget)) {
      renameSync(previousTarget, nestedTarget);
    }
  }
  rmSync(stagedTarget, { recursive: true, force: true });
  throw error;
}
