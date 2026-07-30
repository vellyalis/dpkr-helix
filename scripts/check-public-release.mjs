import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const scanHistory = process.argv.includes("--history");
const revisionIndex = process.argv.indexOf("--revision");
const historyRevision =
  revisionIndex === -1 ? "HEAD" : process.argv[revisionIndex + 1];
const findings = [];
const reviewedBinaryHashes = new Map([
  ["docs/assets/devspace-logo-light.png", "9c8e53a8949622aaac9eabe3338a6c0a3e9d52cd0d87ac765c7fa9a96987ff47"],
  ["docs/assets/devspace-screenshot.png", "009236e54e449dc2de406d1fa06077d982943d913a70e262287c887ff669688d"],
  ["docs/assets/dpkr-helix-dashboard.png", "2b23e63eecdc6c7ae80f57f497c4be9047d5d6cc39738f010a13d7014e86bb31"],
  ["src/ui/dpkr-helix-icon-light.png", "3e5b92566cfaa2112e5e908d48cbdf2c3c6f02a8c7a94cd116aa420d3739b0df"],
  ["src/ui/dpkr-helix-icon.png", "9be2a36cd89cb6c847a9aa820cc8438500eac357a53f0c2be5d7f2de8e0693c2"],
]);

if (
  !historyRevision ||
  historyRevision.startsWith("-") ||
  !/^[0-9A-Za-z_./-]+$/.test(historyRevision)
) {
  throw new Error("Invalid --revision value.");
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: options.encoding ?? "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function splitNull(value) {
  return value.split("\0").filter(Boolean);
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

const requiredFiles = [
  "LICENSE",
  "NOTICE.md",
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "docs/PUBLIC_RELEASE.md",
];

const forbiddenPathRules = [
  {
    label: "local temporary state",
    match: (path) => path === ".tmp" || path.startsWith(".tmp/"),
  },
  {
    label: "machine-specific Cloudflare configuration",
    match: (path) => path === "cloudflare" || path.startsWith("cloudflare/"),
  },
  {
    label: "local agent state",
    match: (path) =>
      path === ".agents/state" || path.startsWith(".agents/state/"),
  },
  {
    label: "environment file",
    match: (path) =>
      /(^|\/)\.env(?:\.|$)/i.test(path) && !path.endsWith(".env.example"),
  },
  {
    label: "private-key or credential-shaped file",
    match: (path) =>
      /(^|\/).*\.(?:key|pem|p12|pfx)$/i.test(path) ||
      /(^|\/).*(?:credential|secret|token).*/i.test(path),
  },
  {
    label: "unowned upstream funding configuration",
    match: (path) => path === ".github/FUNDING.yml",
  },
];

const sensitiveTextRules = [
  {
    label: "private key",
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  },
  {
    label: "OpenAI-style API key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    label: "GitHub token",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  },
  {
    label: "AWS access key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    label: "literal API-token assignment",
    pattern:
      /\b(?:CF_API_TOKEN|CLOUDFLARE_API_TOKEN|OPENAI_API_KEY)\s*=\s*["']?[A-Za-z0-9_./+=-]{16,}/gi,
  },
];

const blockedLiterals = [
  {
    label: "retired private repository name",
    value: ["devspace-codex", "-setup"].join(""),
  },
];

const publicInstallDocs = new Set([
  "README.md",
  "docs/setup-windows.md",
  ".agents/skills/onboard-dpkr-helix/SKILL.md",
]);

function scanText(path, text, prefix = "") {
  for (const rule of sensitiveTextRules) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      findings.push(
        `${prefix}${path}:${lineNumber(text, match.index)}: ${rule.label}`,
      );
    }
  }

  for (const rule of blockedLiterals) {
    const index = text.toLowerCase().indexOf(rule.value.toLowerCase());
    if (index !== -1) {
      findings.push(
        `${prefix}${path}:${lineNumber(text, index)}: ${rule.label}`,
      );
    }
  }

  const windowsProfiles = /\b[A-Z]:\\Users\\([A-Za-z0-9._-]+)\\/gi;
  const allowedFixtureUsers = new Set(["alice", "developer", "example", "test"]);
  for (const match of text.matchAll(windowsProfiles)) {
    if (!allowedFixtureUsers.has(match[1].toLowerCase())) {
      findings.push(
        `${prefix}${path}:${lineNumber(text, match.index)}: non-generic Windows profile path`,
      );
    }
  }

  const cloudflareWorkerOrigins =
    /https:\/\/[A-Za-z0-9.-]+\.workers\.dev(?:\/[^\s)`"']*)?/gi;
  for (const match of text.matchAll(cloudflareWorkerOrigins)) {
    findings.push(
      `${prefix}${path}:${lineNumber(text, match.index)}: installation-specific Cloudflare hostname`,
    );
  }

  if (publicInstallDocs.has(path)) {
    const privateCopy = ["private", " repository"].join("");
    const index = text.toLowerCase().indexOf(privateCopy);
    if (index !== -1) {
      findings.push(
        `${prefix}${path}:${lineNumber(text, index)}: private-only install copy`,
      );
    }
  }

  if (path.toLowerCase().endsWith(".md")) {
    const operationalPatterns = [
      /\b(?:prj|ws|agt|op)_[0-9a-f-]{8,}\b/gi,
      /\bPID\s+`?\d{2,}`?/gi,
      /\b(?:process\s+)?session\s+`\d+`/gi,
    ];
    for (const pattern of operationalPatterns) {
      for (const match of text.matchAll(pattern)) {
        findings.push(
          `${prefix}${path}:${lineNumber(text, match.index)}: live operational identifier`,
        );
      }
    }
  }
}

function scanPath(path, prefix = "") {
  for (const rule of forbiddenPathRules) {
    if (rule.match(path)) {
      findings.push(`${prefix}${path}: ${rule.label}`);
    }
  }
}

function scanContents(path, contents, prefix = "") {
  if (!contents.includes(0)) {
    scanText(path, contents.toString("utf8"), prefix);
    return;
  }

  const expectedHash = reviewedBinaryHashes.get(path);
  const actualHash = createHash("sha256").update(contents).digest("hex");
  if (!expectedHash) {
    findings.push(`${prefix}${path}: binary file has not received public-content review`);
  } else if (actualHash !== expectedHash) {
    findings.push(`${prefix}${path}: reviewed binary content changed`);
  }
}

const trackedFiles = splitNull(git(["ls-files", "-z"]));
const untrackedFiles = splitNull(
  git(["ls-files", "--others", "--exclude-standard", "-z"]),
);
const workingFiles = [...new Set([...trackedFiles, ...untrackedFiles])]
  .filter((path) => existsSync(resolve(root, path)))
  .sort();

for (const required of requiredFiles) {
  if (!workingFiles.includes(required)) {
    findings.push(`${required}: required public-release file is missing`);
  }
}

for (const path of untrackedFiles) {
  findings.push(`${path}: untracked file must be committed or ignored`);
}

for (const path of workingFiles) {
  scanPath(path);
  const contents = readFileSync(resolve(root, path));
  scanContents(path, contents);
}

const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
const packageLock = JSON.parse(
  readFileSync(resolve(root, "package-lock.json"), "utf8"),
);
if (packageJson.private !== true) {
  findings.push("package.json: private must be true to prevent accidental npm publication");
}
if (packageJson.name !== "@waishnav/devspace") {
  findings.push("package.json: compatibility package identity changed unexpectedly");
}
if (packageJson.files?.includes("docs")) {
  findings.push("package.json: internal control-center state would enter npm package");
}
if (packageJson.dependencies?.["brace-expansion"] !== "5.0.9") {
  findings.push("package.json: patched brace-expansion must remain directly pinned");
}
if (!packageJson.scripts?.postinstall?.includes("fix-pi-brace-expansion.mjs")) {
  findings.push("package.json: Pi dependency repair is missing from postinstall");
}
const piBraceLock =
  packageLock.packages?.[
    "node_modules/@earendil-works/pi-coding-agent/node_modules/brace-expansion"
  ];
if (piBraceLock?.version !== "5.0.9") {
  findings.push("package-lock.json: Pi brace-expansion resolution must remain patched");
}

if (scanHistory) {
  const commits = git(["rev-list", historyRevision])
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  for (const commit of commits) {
    const paths = splitNull(
      git(["ls-tree", "-r", "--name-only", "-z", commit]),
    );
    for (const path of paths) {
      scanPath(path, `${commit.slice(0, 12)}:`);
      const contents = git(["show", `${commit}:${path}`], { encoding: "buffer" });
      scanContents(path, contents, `${commit.slice(0, 12)}:`);
    }
  }
}

if (findings.length > 0) {
  console.error(`Public-release check failed with ${findings.length} finding(s):`);
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exitCode = 1;
} else {
  const scope = scanHistory ? "working tree and reachable HEAD history" : "working tree";
  console.log(`Public-release check passed: ${scope}.`);
}
