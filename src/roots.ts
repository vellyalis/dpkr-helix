import { realpathSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export function expandHomePath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return resolve(homedir(), path.slice(2));
  }

  return path;
}

export function isPathInsideRoot(path: string, root: string): boolean {
  const resolvedPath = resolve(expandHomePath(path));
  const resolvedRoot = resolve(expandHomePath(root));
  const relationship = relative(resolvedRoot, resolvedPath);

  return (
    relationship === "" ||
    (!isAbsolute(relationship) &&
      !relationship.startsWith("..") &&
      relationship !== ".." &&
      !relationship.includes(`..${sep}`))
  );
}

export function assertAllowedPath(path: string, allowedRoots: string[]): string {
  const resolvedPath = resolve(expandHomePath(path));
  if (allowedRoots.some((root) => isPathInsideRoot(resolvedPath, root))) {
    return resolvedPath;
  }

  throw new AccessDeniedError(`Path is outside allowed roots: ${path}`);
}

export async function assertCanonicalAllowedPath(
  path: string,
  allowedRoots: string[],
): Promise<string> {
  const canonicalPath = await canonicalizePathAllowMissing(path);
  for (const allowedRoot of allowedRoots) {
    const canonicalAllowedRoot = await canonicalizePathAllowMissing(allowedRoot);
    if (!isPathInsideRoot(canonicalPath, canonicalAllowedRoot)) {
      continue;
    }

    const logicalPath = resolve(
      expandHomePath(allowedRoot),
      relative(canonicalAllowedRoot, canonicalPath),
    );
    return assertAllowedPath(logicalPath, allowedRoots);
  }

  throw new AccessDeniedError(`Path is outside allowed roots: ${path}`);
}

export function resolveAllowedPath(inputPath: string, cwd: string, allowedRoots: string[]): string {
  const absolutePath = resolve(cwd, inputPath);
  return assertAllowedPath(absolutePath, allowedRoots);
}

export function canonicalizePathAllowMissingSync(path: string): string {
  let current = resolve(expandHomePath(path));
  const missingSegments: string[] = [];
  while (true) {
    try {
      return resolve(realpathSync.native(current), ...missingSegments.reverse());
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missingSegments.push(basename(current));
      current = parent;
    }
  }
}

export function isSameCanonicalPath(first: string, second: string): boolean {
  const firstKey = canonicalPathKey(first);
  const secondKey = canonicalPathKey(second);
  return firstKey === secondKey;
}

function canonicalPathKey(path: string): string {
  const canonical = canonicalizePathAllowMissingSync(path);
  return process.platform === "win32"
    ? canonical.toLocaleLowerCase("en-US")
    : canonical;
}

async function canonicalizePathAllowMissing(path: string): Promise<string> {
  let current = resolve(expandHomePath(path));
  const missingSegments: string[] = [];
  while (true) {
    try {
      const canonicalRoot = await realpath(current);
      return resolve(canonicalRoot, ...missingSegments.reverse());
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missingSegments.push(basename(current));
      current = parent;
    }
  }
}

function isMissingPathError(error: unknown): boolean {
  return Boolean(
    typeof error === "object"
      && error
      && "code" in error
      && (error as { code?: unknown }).code === "ENOENT",
  );
}
