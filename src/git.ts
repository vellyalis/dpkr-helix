import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitCommandResult {
  stdout: string;
  stderr: string;
}

export interface GitEligibility {
  ok: boolean;
  gitRoot?: string;
  reason?: "not_git" | "no_head";
  message?: string;
}

export interface WorkingTreeFingerprint {
  head: string;
  fingerprint: string;
}

export async function git(
  cwd: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; maxBuffer?: number } = {},
): Promise<GitCommandResult> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
  });

  return { stdout, stderr };
}

export async function getGitEligibility(cwd: string): Promise<GitEligibility> {
  try {
    await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return {
      ok: false,
      reason: "not_git",
      message: "workspace is not inside a git repository",
    };
  }

  const gitRoot = (await git(cwd, ["rev-parse", "--show-toplevel"])).stdout.trim();
  try {
    await git(gitRoot, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  } catch {
    return {
      ok: false,
      gitRoot,
      reason: "no_head",
      message: "repository has no HEAD commit",
    };
  }

  return { ok: true, gitRoot };
}

export async function createWorkingTreeFingerprint(
  gitRoot: string,
  workspaceRoot = gitRoot,
): Promise<WorkingTreeFingerprint> {
  const resolvedGitRoot = resolve(gitRoot);
  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  const relationship = relative(resolvedGitRoot, resolvedWorkspaceRoot);
  if (
    relationship === ".."
    || relationship.startsWith(`..${sep}`)
    || isAbsolute(relationship)
  ) {
    throw new Error("Workspace root is outside the Git repository.");
  }
  const tempDir = await mkdtemp(join(tmpdir(), "devspace-git-index-"));
  const indexPath = join(tempDir, "index");
  const env = { GIT_INDEX_FILE: indexPath };

  try {
    const head = (
      await git(gitRoot, ["rev-parse", "--verify", "HEAD^{commit}"])
    ).stdout.trim();
    await git(gitRoot, ["read-tree", head], { env });
    await git(resolvedWorkspaceRoot, ["add", "-A", "--", "."], { env });
    const fingerprint = (
      await git(gitRoot, ["write-tree"], { env })
    ).stdout.trim();
    return { head, fingerprint };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function safeWorkspaceRefSegment(workspaceId: string): string {
  const safe = workspaceId.replace(/[^A-Za-z0-9._-]/g, "-");
  return safe.length > 0 ? safe : createHash("sha256").update(workspaceId).digest("hex").slice(0, 16);
}
