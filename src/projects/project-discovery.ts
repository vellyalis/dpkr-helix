import { opendir, realpath } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { AccessDeniedError, assertAllowedPath, expandHomePath } from "../roots.js";
import { createProjectRootKey, normalizeProjectSlug } from "./project-registry.js";
import type { ProjectStore } from "./project-store.js";

export interface DiscoveryOptions {
  roots?: string[];
  maxDepth?: number;
  maxDirectories?: number;
  timeoutMs?: number;
  concurrency?: number;
}

export interface DiscoveryCandidate {
  root: string;
  relativePath: string;
  name: string;
  slug: string;
  alreadyRegistered: boolean;
  gitMarker: "directory" | "file";
}

export interface DiscoveryResult {
  candidates: DiscoveryCandidate[];
  truncated: boolean;
  reason?: string;
  scannedDirectories: number;
}

export const PROJECT_DISCOVERY_DEFAULTS = {
  maxDepth: 4,
  maxDirectories: 5_000,
  timeoutMs: 10_000,
} as const;
const HEAVY_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  ".cache",
  ".devspace-worktrees",
  "coverage",
]);

export class ProjectDiscovery {
  constructor(
    private readonly allowedRoots: readonly string[],
    private readonly store: Pick<ProjectStore, "getByRootKey">,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  async scan(options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
    const maxDepth = options.maxDepth ?? PROJECT_DISCOVERY_DEFAULTS.maxDepth;
    const maxDirectories = options.maxDirectories ?? PROJECT_DISCOVERY_DEFAULTS.maxDirectories;
    const deadline = Date.now() + (options.timeoutMs ?? PROJECT_DISCOVERY_DEFAULTS.timeoutMs);
    const roots = await this.resolveScanRoots(options.roots);
    const queue = roots.map((root) => ({ path: root, root, depth: 0 }));
    const candidates: DiscoveryCandidate[] = [];
    let scannedDirectories = 0;
    let truncated = false;
    let reason: string | undefined;

    while (queue.length > 0) {
      if (Date.now() >= deadline) {
        truncated = true;
        reason = "timeout";
        break;
      }
      if (scannedDirectories >= maxDirectories) {
        truncated = true;
        reason = "directory_limit";
        break;
      }

      const current = queue.shift()!;
      scannedDirectories += 1;

      let entries: { name: string; isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean }[];
      try {
        const dir = await opendir(current.path);
        entries = [];
        for await (const entry of dir) entries.push(entry);
      } catch {
        continue;
      }

      const gitEntry = entries.find((entry) => entry.name === ".git" && (entry.isDirectory() || entry.isFile()));
      if (gitEntry) {
        const key = createProjectRootKey(await realpath(current.path), this.platform);
        candidates.push({
          root: current.path,
          relativePath: relative(current.root, current.path) || ".",
          name: basename(current.path),
          slug: normalizeProjectSlug(basename(current.path)),
          alreadyRegistered: Boolean(this.store.getByRootKey(key)),
          gitMarker: gitEntry.isDirectory() ? "directory" : "file",
        });
        continue;
      }

      if (current.depth >= maxDepth) continue;
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink() || HEAVY_DIRECTORIES.has(entry.name)) continue;
        queue.push({
          path: resolve(current.path, entry.name),
          root: current.root,
          depth: current.depth + 1,
        });
      }
    }

    candidates.sort((a, b) => a.root.localeCompare(b.root));
    return { candidates, truncated, reason, scannedDirectories };
  }

  private async resolveScanRoots(requestedRoots?: string[]): Promise<string[]> {
    const canonicalAllowedRoots = await Promise.all(
      this.allowedRoots.map(async (root) => {
        const resolved = resolve(expandHomePath(root));
        try {
          return await realpath(resolved);
        } catch {
          return resolved;
        }
      }),
    );
    const roots = requestedRoots?.length ? requestedRoots : this.allowedRoots;
    return Promise.all(
      roots.map(async (root) => {
        const resolved = await realpath(resolve(expandHomePath(root)));
        try {
          assertAllowedPath(resolved, canonicalAllowedRoots);
        } catch (error) {
          if (error instanceof AccessDeniedError) {
            throw new Error(`Discovery root is outside configured allowed roots: ${root}`);
          }
          throw error;
        }
        return resolved;
      }),
    );
  }
}
