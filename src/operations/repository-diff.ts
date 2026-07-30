import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { getGitEligibility, git } from "../git.js";

const MAX_FILE_PATCH_BYTES = 2 * 1024 * 1024;

export type RepositoryFileOperation =
  | "untracked"
  | "added"
  | "modified"
  | "deleted"
  | "renamed";

export interface RepositoryDiffFile {
  path: string;
  previousPath?: string;
  operation: RepositoryFileOperation;
  additions?: number;
  removals?: number;
  binary: boolean;
}

export interface RepositoryDiffSummary {
  state: "available" | "unavailable";
  basis: "current_worktree_against_head";
  refreshedAt: string;
  branch?: string;
  files: RepositoryDiffFile[];
  additions: number;
  removals: number;
  statsIncomplete: boolean;
  message?: string;
}

export interface RepositoryFileDiff {
  state: "available" | "unavailable";
  refreshedAt: string;
  file?: RepositoryDiffFile;
  patch?: string;
  message?: string;
}

export async function readRepositoryDiffSummary(
  workspaceRoot: string,
): Promise<RepositoryDiffSummary> {
  const refreshedAt = new Date().toISOString();
  const eligibility = await getGitEligibility(workspaceRoot);
  if (!eligibility.ok || !eligibility.gitRoot) {
    return unavailableSummary(
      refreshedAt,
      eligibility.message ?? "Repository state is unavailable.",
    );
  }

  try {
    const [statusResult, statsResult, branchResult] = await Promise.all([
      git(workspaceRoot, [
        "-c",
        "status.relativePaths=true",
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        "--",
        ".",
      ]),
      git(workspaceRoot, [
        "diff",
        "--numstat",
        "-z",
        "--find-renames",
        "--relative",
        "HEAD",
        "--",
        ".",
      ]),
      git(workspaceRoot, ["branch", "--show-current"]),
    ]);
    const stats = parseNumstat(statsResult.stdout);
    const files = parseStatus(statusResult.stdout).map((file) => {
      const stat = stats.get(file.path);
      return {
        ...file,
        additions: stat?.additions,
        removals: stat?.removals,
        binary: stat?.binary ?? false,
      };
    });
    const totals = files.reduce(
      (sum, file) => ({
        additions: sum.additions + (file.additions ?? 0),
        removals: sum.removals + (file.removals ?? 0),
      }),
      { additions: 0, removals: 0 },
    );
    return {
      state: "available",
      basis: "current_worktree_against_head",
      refreshedAt,
      branch: branchResult.stdout.trim() || undefined,
      files,
      ...totals,
      statsIncomplete: files.some(
        ({ additions, removals }) =>
          additions === undefined || removals === undefined,
      ),
    };
  } catch {
    return unavailableSummary(
      refreshedAt,
      "Current repository changes could not be read.",
    );
  }
}

export async function readRepositoryFileDiff(
  workspaceRoot: string,
  requestedPath: string,
): Promise<RepositoryFileDiff> {
  const refreshedAt = new Date().toISOString();
  const summary = await readRepositoryDiffSummary(workspaceRoot);
  if (summary.state !== "available") {
    return {
      state: "unavailable",
      refreshedAt,
      message: summary.message,
    };
  }
  const file = summary.files.find(({ path }) => path === requestedPath);
  if (!file) {
    return {
      state: "unavailable",
      refreshedAt,
      message: "The selected path is not in the current repository change set.",
    };
  }

  try {
    const patch = file.operation === "untracked"
      ? await untrackedFilePatch(workspaceRoot, file.path)
      : (
          await git(workspaceRoot, [
            "diff",
            "--no-color",
            "--no-ext-diff",
            "--find-renames",
            "--relative",
            "HEAD",
            "--",
            file.path,
          ], { maxBuffer: MAX_FILE_PATCH_BYTES })
        ).stdout;
    return {
      state: "available",
      refreshedAt,
      file,
      patch,
    };
  } catch (error) {
    return {
      state: "unavailable",
      refreshedAt,
      file,
      message: repositoryDiffError(error),
    };
  }
}

function unavailableSummary(
  refreshedAt: string,
  message: string,
): RepositoryDiffSummary {
  return {
    state: "unavailable",
    basis: "current_worktree_against_head",
    refreshedAt,
    files: [],
    additions: 0,
    removals: 0,
    statsIncomplete: false,
    message,
  };
}

function parseStatus(output: string): Omit<
  RepositoryDiffFile,
  "additions" | "removals" | "binary"
>[] {
  const fields = output.split("\0");
  const files: Omit<
    RepositoryDiffFile,
    "additions" | "removals" | "binary"
  >[] = [];
  for (let index = 0; index < fields.length;) {
    const entry = fields[index++];
    if (!entry || entry.length < 4) continue;
    const status = entry.slice(0, 2);
    const path = safeGitPath(entry.slice(3));
    if (!path) continue;
    if (status.includes("R")) {
      const previousPath = safeGitPath(fields[index++] ?? "");
      files.push({
        path,
        previousPath,
        operation: "renamed",
      });
      continue;
    }
    files.push({
      path,
      operation: operationFromStatus(status),
    });
  }
  return files;
}

function operationFromStatus(status: string): RepositoryFileOperation {
  if (status === "??") return "untracked";
  if (status.includes("A")) return "added";
  if (status.includes("D")) return "deleted";
  return "modified";
}

function parseNumstat(
  output: string,
): Map<string, { additions: number; removals: number; binary: boolean }> {
  const fields = output.split("\0");
  const stats = new Map<
    string,
    { additions: number; removals: number; binary: boolean }
  >();
  for (let index = 0; index < fields.length;) {
    const header = fields[index++];
    if (!header) continue;
    const parts = header.split("\t");
    const binary = parts[0] === "-" || parts[1] === "-";
    const value = {
      additions: statNumber(parts[0]),
      removals: statNumber(parts[1]),
      binary,
    };
    if (parts.length >= 3) {
      const path = safeGitPath(parts[2] ?? "");
      if (path) stats.set(path, value);
      continue;
    }
    index += 1;
    const path = safeGitPath(fields[index++] ?? "");
    if (path) stats.set(path, value);
  }
  return stats;
}

function statNumber(value: string | undefined): number {
  if (!value || value === "-") return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function safeGitPath(path: string): string | undefined {
  const normalized = path.replaceAll("\\", "/");
  if (
    !normalized
    || isAbsolute(path)
    || normalized.split("/").includes("..")
  ) {
    return undefined;
  }
  return normalized;
}

async function untrackedFilePatch(
  workspaceRoot: string,
  path: string,
): Promise<string> {
  const absolutePath = resolve(workspaceRoot, path);
  const relativePath = relative(workspaceRoot, absolutePath);
  if (
    !relativePath
    || relativePath === ".."
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)
  ) {
    throw new Error("The selected path is outside the workspace.");
  }
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("The selected untracked path is not a regular file.");
  }
  if (metadata.size > MAX_FILE_PATCH_BYTES) {
    throw new Error("The selected file diff exceeds the dashboard size limit.");
  }
  const content = await readFile(absolutePath, "utf8");
  if (content.includes("\0")) {
    throw new Error("Binary untracked file content is not rendered.");
  }
  return newFilePatch(path, content);
}

function newFilePatch(path: string, content: string): string {
  const lines = content.length === 0
    ? []
    : content.endsWith("\n")
      ? content.slice(0, -1).split("\n")
      : content.split("\n");
  const range = lines.length === 0 ? "+0,0" : `+1,${lines.length}`;
  return [
    `diff --git a/${path} b/${path}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${path}`,
    `@@ -0,0 ${range} @@`,
    ...lines.map((line) => `+${line}`),
  ].join("\n");
}

function repositoryDiffError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("maxBuffer")) {
      return "The selected file diff exceeds the dashboard size limit.";
    }
    if (
      error.message.startsWith("The selected")
      || error.message.startsWith("Binary ")
    ) {
      return error.message;
    }
  }
  return "The selected repository diff could not be read.";
}
