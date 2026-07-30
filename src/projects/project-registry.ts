import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { basename, posix, resolve, win32 } from "node:path";
import { AccessDeniedError, assertAllowedPath, expandHomePath } from "../roots.js";
import { toProjectView } from "./project-dto.js";
import type { ProjectStore } from "./project-store.js";
import type {
  ProjectAvailability,
  ProjectPatch,
  ProjectPermissionPreset,
  ProjectSource,
  ProjectView,
  ProjectWorkspaceMode,
  RegisteredProject,
} from "./project-types.js";

export type ProjectPathErrorCode =
  | "PROJECT_PATH_MISSING"
  | "PROJECT_PATH_NOT_DIRECTORY"
  | "PROJECT_PATH_NOT_ALLOWED"
  | "PROJECT_PATH_INVALID";

export class ProjectPathError extends Error {
  constructor(
    readonly code: ProjectPathErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ProjectPathError";
  }
}

export type ProjectSelectorErrorCode =
  | "PROJECT_SELECTOR_REQUIRED"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_AMBIGUOUS";

export interface ProjectSelectorCandidate {
  id: string;
  slug: string;
  name: string;
  root: string;
}

export class ProjectSelectorError extends Error {
  constructor(
    readonly code: ProjectSelectorErrorCode,
    message: string,
    readonly candidates: ProjectSelectorCandidate[] = [],
  ) {
    super(message);
    this.name = "ProjectSelectorError";
  }
}

export class ProjectRegistryError extends Error {
  constructor(
    readonly code:
      | "PROJECT_UNKNOWN"
      | "PROJECT_NAME_REQUIRED"
      | "PROJECT_SLUG_CONFLICT"
      | "PROJECT_INVALID_PRESET"
      | "PROJECT_INVALID_MODE"
      | "PROJECT_INVALID_SOURCE",
    message: string,
  ) {
    super(message);
    this.name = "ProjectRegistryError";
  }
}

export interface CanonicalProjectRoot {
  root: string;
  rootKey: string;
}

export interface RegisterProjectInput {
  path: string;
  name?: string;
  slug?: string;
  permissionPreset?: ProjectPermissionPreset;
  defaultMode?: ProjectWorkspaceMode;
  pinned?: boolean;
  source?: ProjectSource;
}

export interface ProjectPathOps {
  stat(path: string): Promise<Pick<Stats, "isDirectory">>;
  realpath(path: string): Promise<string>;
}

export interface CanonicalizeProjectRootOptions {
  platform?: NodeJS.Platform;
  ops?: ProjectPathOps;
}

export interface ProjectRegistryDependencies extends CanonicalizeProjectRootOptions {
  now?: () => string;
  createId?: () => string;
}

export class ProjectRegistry {
  private readonly platform: NodeJS.Platform;
  private readonly ops: ProjectPathOps;
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(
    private readonly store: ProjectStore,
    private readonly allowedRoots: readonly string[],
    dependencies: ProjectRegistryDependencies = {},
  ) {
    this.platform = dependencies.platform ?? process.platform;
    this.ops = dependencies.ops ?? { stat, realpath };
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.createId = dependencies.createId ?? (() => `prj_${randomUUID()}`);
  }

  async register(input: RegisterProjectInput): Promise<ProjectView> {
    const canonical = await canonicalizeProjectRoot(input.path, this.allowedRoots, {
      platform: this.platform,
      ops: this.ops,
    });
    const existing = this.store.getByRootKey(canonical.rootKey);
    if (existing) return this.getView(existing);

    const name = normalizeProjectName((input.name ?? basename(canonical.root)) || "Project");
    const slugBase = normalizeProjectSlug(input.slug ?? name);
    const permissionPreset = input.permissionPreset ?? "develop";
    const defaultMode = input.defaultMode ?? "checkout";
    const source = input.source ?? "manual";
    assertPermissionPreset(permissionPreset);
    assertWorkspaceMode(defaultMode);
    assertProjectSource(source);
    const now = this.now();
    const project: RegisteredProject = {
      id: this.createId(),
      slug: this.createUniqueSlug(slugBase),
      name,
      root: canonical.root,
      rootKey: canonical.rootKey,
      permissionPreset,
      defaultMode,
      pinned: input.pinned ?? false,
      source,
      createdAt: now,
      updatedAt: now,
    };

    while (true) {
      try {
        return this.getView(this.store.create(project));
      } catch (error) {
        const duplicateRoot = this.store.getByRootKey(project.rootKey);
        if (duplicateRoot) return this.getView(duplicateRoot);

        if (!this.store.getBySlug(project.slug)) throw error;
        project.slug = this.createUniqueSlug(slugBase);
      }
    }
  }

  async update(id: string, patch: ProjectPatch): Promise<ProjectView> {
    const current = this.store.getById(id);
    if (!current) {
      throw new ProjectRegistryError("PROJECT_UNKNOWN", `Unknown registered project: ${id}`);
    }

    const normalizedPatch: ProjectPatch = {};
    if (patch.name !== undefined) normalizedPatch.name = normalizeProjectName(patch.name);
    if (patch.slug !== undefined) {
      const slug = normalizeProjectSlug(patch.slug);
      const conflict = this.store.getBySlug(slug);
      if (conflict && conflict.id !== id) {
        throw new ProjectRegistryError(
          "PROJECT_SLUG_CONFLICT",
          `Project slug is already registered: ${slug}`,
        );
      }
      normalizedPatch.slug = slug;
    }
    if (patch.permissionPreset !== undefined) {
      assertPermissionPreset(patch.permissionPreset);
      normalizedPatch.permissionPreset = patch.permissionPreset;
    }
    if (patch.defaultMode !== undefined) {
      assertWorkspaceMode(patch.defaultMode);
      normalizedPatch.defaultMode = patch.defaultMode;
    }
    if (patch.pinned !== undefined) normalizedPatch.pinned = patch.pinned;

    return this.getView(this.store.update(id, normalizedPatch, this.now()));
  }

  getById(id: string): RegisteredProject | undefined {
    return this.store.getById(id);
  }

  async getViewById(id: string): Promise<ProjectView | undefined> {
    const project = this.store.getById(id);
    return project ? this.getView(project) : undefined;
  }

  async list(): Promise<ProjectView[]> {
    return Promise.all(this.store.list().map((project) => this.getView(project)));
  }

  resolveSelector(selector: string): RegisteredProject {
    const value = selector.trim();
    if (!value) {
      throw new ProjectSelectorError(
        "PROJECT_SELECTOR_REQUIRED",
        "A project ID, slug, or exact display name is required.",
      );
    }

    const byId = this.store.getById(value);
    if (byId) return byId;

    const bySlug = this.store.getBySlug(value);
    if (bySlug) return bySlug;

    const folded = value.toLocaleLowerCase("en-US");
    const nameMatches = this.store
      .list()
      .filter((project) => project.name.toLocaleLowerCase("en-US") === folded);
    if (nameMatches.length === 1) return nameMatches[0]!;
    if (nameMatches.length > 1) {
      throw new ProjectSelectorError(
        "PROJECT_AMBIGUOUS",
        `Project display name is ambiguous: ${value}`,
        nameMatches.map(toSelectorCandidate),
      );
    }

    throw new ProjectSelectorError("PROJECT_NOT_FOUND", `Registered project not found: ${value}`);
  }

  async findByPath(path: string): Promise<RegisteredProject | undefined> {
    const canonical = await canonicalizeProjectRoot(path, this.allowedRoots, {
      platform: this.platform,
      ops: this.ops,
    });
    const candidates = this.store
      .list()
      .filter((project) =>
        isProjectRootKeyInsidePath(project.rootKey, canonical.rootKey, this.platform),
      )
      .sort((a, b) => b.rootKey.length - a.rootKey.length);

    for (const project of candidates) {
      try {
        const current = await canonicalizeProjectRoot(project.root, this.allowedRoots, {
          platform: this.platform,
          ops: this.ops,
        });
        if (current.rootKey === project.rootKey) return project;
      } catch {
        // A stale, missing, or no-longer-allowed project cannot own a newly opened workspace.
      }
    }

    return undefined;
  }

  forget(id: string): boolean {
    return this.store.remove(id);
  }

  touchOpened(id: string): void {
    this.store.touchOpened(id, this.now());
  }

  private async getView(project: RegisteredProject): Promise<ProjectView> {
    const availability = await this.inspectAvailability(project);
    return toProjectView(project, availability.status, availability.reason);
  }

  private async inspectAvailability(
    project: RegisteredProject,
  ): Promise<{ status: ProjectAvailability; reason?: string }> {
    try {
      const canonical = await canonicalizeProjectRoot(project.root, this.allowedRoots, {
        platform: this.platform,
        ops: this.ops,
      });
      if (canonical.rootKey !== project.rootKey) {
        return {
          status: "invalid",
          reason: "The project path now resolves to a different filesystem location.",
        };
      }
      return { status: "available" };
    } catch (error) {
      if (error instanceof ProjectPathError) {
        if (error.code === "PROJECT_PATH_MISSING") {
          return { status: "missing", reason: error.message };
        }
        if (error.code === "PROJECT_PATH_NOT_ALLOWED") {
          return { status: "not_allowed", reason: error.message };
        }
        return { status: "invalid", reason: error.message };
      }
      return { status: "invalid", reason: "Project availability could not be verified." };
    }
  }

  private createUniqueSlug(input: string): string {
    const base = normalizeProjectSlug(input);
    let candidate = base;
    let suffix = 2;
    while (this.store.getBySlug(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }
}

export async function canonicalizeProjectRoot(
  input: string,
  allowedRoots: readonly string[],
  options: CanonicalizeProjectRootOptions = {},
): Promise<CanonicalProjectRoot> {
  const platform = options.platform ?? process.platform;
  const ops = options.ops ?? { stat, realpath };
  const absolutePath = resolve(expandHomePath(input));

  let stats: Pick<Stats, "isDirectory">;
  try {
    stats = await ops.stat(absolutePath);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      throw new ProjectPathError(
        "PROJECT_PATH_MISSING",
        `Project path does not exist: ${input}`,
        { cause: error },
      );
    }
    throw new ProjectPathError(
      "PROJECT_PATH_INVALID",
      `Project path could not be inspected: ${input}`,
      { cause: error },
    );
  }
  if (!stats.isDirectory()) {
    throw new ProjectPathError(
      "PROJECT_PATH_NOT_DIRECTORY",
      `Project path must be a directory: ${input}`,
    );
  }

  let root: string;
  try {
    root = await ops.realpath(absolutePath);
  } catch (error) {
    throw new ProjectPathError(
      "PROJECT_PATH_INVALID",
      `Project path could not be resolved: ${input}`,
      { cause: error },
    );
  }

  const canonicalAllowedRoots = await Promise.all(
    allowedRoots.map(async (allowedRoot) => {
      const resolvedRoot = resolve(expandHomePath(allowedRoot));
      try {
        return await ops.realpath(resolvedRoot);
      } catch {
        return resolvedRoot;
      }
    }),
  );

  try {
    assertAllowedPath(root, canonicalAllowedRoots);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      throw new ProjectPathError(
        "PROJECT_PATH_NOT_ALLOWED",
        `Project path is outside configured allowed roots: ${input}`,
        { cause: error },
      );
    }
    throw error;
  }

  return {
    root,
    rootKey: createProjectRootKey(root, platform),
  };
}

export function createProjectRootKey(path: string, platform: NodeJS.Platform = process.platform): string {
  const normalized = platform === "win32" ? win32.normalize(path) : posix.normalize(path);
  return platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

export function isProjectRootKeyInsidePath(
  projectRootKey: string,
  pathRootKey: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const rootKey = trimTrailingPathSeparators(
    createProjectRootKey(projectRootKey, platform),
    platform,
  );
  const childKey = trimTrailingPathSeparators(
    createProjectRootKey(pathRootKey, platform),
    platform,
  );
  if (childKey === rootKey) return true;

  const separator = platform === "win32" ? "\\" : "/";
  const descendantPrefix = rootKey.endsWith(separator) ? rootKey : `${rootKey}${separator}`;
  return childKey.startsWith(descendantPrefix);
}

function trimTrailingPathSeparators(path: string, platform: NodeJS.Platform): string {
  const parsed = platform === "win32" ? win32.parse(path) : posix.parse(path);
  const root = parsed.root;
  let value = path;
  while (value.length > root.length && /[\\/]/.test(value.at(-1) ?? "")) {
    value = value.slice(0, -1);
  }
  return value;
}

export function normalizeProjectSlug(input: string): string {
  const parts = input
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .match(/[\p{Letter}\p{Number}]+/gu);
  return parts?.join("-") || "project";
}

function normalizeProjectName(input: string): string {
  const name = input.trim();
  if (!name) {
    throw new ProjectRegistryError("PROJECT_NAME_REQUIRED", "Project display name is required.");
  }
  return name;
}

function assertPermissionPreset(value: string): asserts value is ProjectPermissionPreset {
  if (value !== "inspect" && value !== "design" && value !== "develop") {
    throw new ProjectRegistryError("PROJECT_INVALID_PRESET", `Invalid project permission preset: ${value}`);
  }
}

function assertWorkspaceMode(value: string): asserts value is ProjectWorkspaceMode {
  if (value !== "checkout" && value !== "worktree") {
    throw new ProjectRegistryError("PROJECT_INVALID_MODE", `Invalid project workspace mode: ${value}`);
  }
}

function assertProjectSource(value: string): asserts value is ProjectSource {
  if (value !== "manual" && value !== "discovered") {
    throw new ProjectRegistryError("PROJECT_INVALID_SOURCE", `Invalid project source: ${value}`);
  }
}

function toSelectorCandidate(project: RegisteredProject): ProjectSelectorCandidate {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    root: project.root,
  };
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
