import {
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sdkRoot = join(projectRoot, "node_modules", "@openai", "codex-sdk");
const packageJsonPath = join(sdkRoot, "package.json");
const sdkEntryPath = join(sdkRoot, "dist", "index.js");
const spawnPrefix = "const child = spawn(this.executablePath, commandArgs, {";
const signalOption = "signal: args.signal";
const hiddenOption = "windowsHide: true";
const hiddenKeyPattern = /\bwindowsHide\s*:/g;
const hiddenTruePattern = /\bwindowsHide\s*:\s*true\b/g;
const hiddenFalsePattern = /\bwindowsHide\s*:\s*false\b/g;

function readCodexSdkVersion() {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (
    packageJson.name !== "@openai/codex-sdk" ||
    typeof packageJson.version !== "string"
  ) {
    throw new Error(
      `Unexpected package metadata at ${relative(projectRoot, packageJsonPath)}`,
    );
  }
  return packageJson.version;
}

function codexSpawnBlock(source) {
  const start = source.indexOf(spawnPrefix);
  if (start < 0 || source.indexOf(spawnPrefix, start + spawnPrefix.length) >= 0) {
    throw new Error("Could not identify the unique Codex SDK spawn block.");
  }
  const end = source.indexOf("});", start + spawnPrefix.length);
  if (end < 0) {
    throw new Error("The Codex SDK spawn block is incomplete.");
  }
  return { start, end, text: source.slice(start, end) };
}

function verifyPatched(source, version) {
  const block = codexSpawnBlock(source);
  const keyCount = [...block.text.matchAll(hiddenKeyPattern)].length;
  const trueCount = [...block.text.matchAll(hiddenTruePattern)].length;
  if (keyCount !== 1 || trueCount !== 1) {
    throw new Error(
      `Codex SDK ${version} must contain exactly one windowsHide: true spawn option. Run npm install again.`,
    );
  }
  console.log(`Codex SDK ${version} uses a hidden Windows child process.`);
}

const version = readCodexSdkVersion();
const source = readFileSync(sdkEntryPath, "utf8");

if (process.argv.includes("--check")) {
  verifyPatched(source, version);
  process.exit(0);
}

const block = codexSpawnBlock(source);
const hiddenKeyCount = [...block.text.matchAll(hiddenKeyPattern)].length;
const hiddenTrueCount = [...block.text.matchAll(hiddenTruePattern)].length;
const hiddenFalseCount = [...block.text.matchAll(hiddenFalsePattern)].length;
if (hiddenKeyCount === 1 && hiddenTrueCount === 1) {
  verifyPatched(source, version);
  process.exit(0);
}
if (hiddenKeyCount > 1) {
  throw new Error(`Codex SDK ${version} contains duplicate windowsHide spawn options.`);
}
if (!block.text.includes(signalOption)) {
  throw new Error(`Unexpected Codex SDK ${version} spawn options.`);
}

let patchedBlock;
if (hiddenKeyCount === 1 && hiddenFalseCount === 1) {
  patchedBlock = block.text.replace(hiddenFalsePattern, hiddenOption);
} else if (hiddenKeyCount === 0) {
  patchedBlock = block.text.replace(
    signalOption,
    `${signalOption},\n      ${hiddenOption}`,
  );
} else {
  throw new Error(`Unexpected Codex SDK ${version} windowsHide spawn option.`);
}
if (patchedBlock === block.text) {
  throw new Error(`Could not patch Codex SDK ${version} spawn options.`);
}

const patchedSource =
  source.slice(0, block.start) + patchedBlock + source.slice(block.end);
const stagedPath = `${sdkEntryPath}.dpkr-${process.pid}`;
try {
  writeFileSync(stagedPath, patchedSource, "utf8");
  verifyPatched(readFileSync(stagedPath, "utf8"), version);
  renameSync(stagedPath, sdkEntryPath);
} finally {
  rmSync(stagedPath, { force: true });
}
