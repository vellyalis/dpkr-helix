import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import type { ServerConfig } from "./config.js";
import {
  ProjectDiscovery,
  type DiscoveryCandidate,
} from "./projects/project-discovery.js";
import {
  canonicalizeProjectRoot,
  normalizeProjectSlug,
  ProjectRegistry,
  ProjectSelectorError,
} from "./projects/project-registry.js";
import {
  createProjectStore,
  type ProjectStore,
} from "./projects/project-store.js";
import type { RegisteredProject } from "./projects/project-types.js";
import type { LauncherTarget } from "./helix-command.js";
import {
  createWorkspaceHandoffStore,
  type WorkspaceHandoff,
} from "./workspace-handoff-store.js";

export async function resolveLauncherTarget(
  config: ServerConfig,
  selector: string | undefined,
  cwd: string,
): Promise<LauncherTarget> {
  const store = createProjectStore(config.stateDir);
  const registry = new ProjectRegistry(store, config.allowedRoots);
  try {
    let project: RegisteredProject | undefined;
    let root: string;

    if (selector && selector !== ".") {
      if (looksLikePath(selector)) {
        const canonical = await canonicalizeProjectRoot(
          resolve(cwd, selector),
          config.allowedRoots,
        );
        project = await registry.findByPath(canonical.root);
        root = project
          ? (await canonicalizeProjectRoot(project.root, config.allowedRoots)).root
          : canonical.root;
      } else {
        try {
          project = registry.resolveSelector(selector);
        } catch (error) {
          if (
            error instanceof ProjectSelectorError
            && error.code === "PROJECT_NOT_FOUND"
          ) {
            project = await discoverAndRegisterProject(
              selector,
              config,
              registry,
              store,
            );
          } else if (error instanceof ProjectSelectorError) {
            throw new Error(formatProjectSelectorError(error));
          } else {
            throw error;
          }
        }
        root = (await canonicalizeProjectRoot(project.root, config.allowedRoots)).root;
      }
    } else {
      const canonical = await canonicalizeProjectRoot(cwd, config.allowedRoots);
      project = await registry.findByPath(canonical.root);
      root = project
        ? (await canonicalizeProjectRoot(project.root, config.allowedRoots)).root
        : canonical.root;
    }

    if (project) registry.touchOpened(project.id);
    return { root, project };
  } finally {
    store.close?.();
  }
}

export async function printProjects(config: ServerConfig): Promise<void> {
  const store = createProjectStore(config.stateDir);
  const registry = new ProjectRegistry(store, config.allowedRoots);
  try {
    const projects = await registry.list();
    if (projects.length > 0) {
      console.log("Registered projects:");
      for (const project of projects) {
        const marker = project.pinned ? "*" : " ";
        const availability = project.availability === "available"
          ? ""
          : ` [${project.availability}]`;
        console.log(
          `${marker} ${project.slug.padEnd(18)} ${project.name}${availability}\n    ${project.root}`,
        );
      }
    } else {
      console.log("No registered dpkr helix projects.");
    }

    const discoveryRoots = existingAllowedRoots(config.allowedRoots);
    if (discoveryRoots.length === 0) return;
    const discovery = new ProjectDiscovery(config.allowedRoots, store);
    const discovered = await discovery.scan({
      roots: discoveryRoots,
      maxDepth: 3,
      maxDirectories: 2_000,
      timeoutMs: 3_000,
    });
    const available = discovered.candidates.filter(
      (candidate) => !candidate.alreadyRegistered,
    );
    if (available.length > 0) {
      console.log("\nDiscovered projects (open once to register):");
      for (const candidate of available) {
        console.log(`  ${candidate.slug.padEnd(18)} ${candidate.root}`);
      }
    }
  } finally {
    store.close?.();
  }
}

export function readHandoff(
  stateDir: string,
  target: LauncherTarget,
): WorkspaceHandoff | undefined {
  const store = createWorkspaceHandoffStore(stateDir);
  try {
    return store.get(target.project?.root ?? target.root);
  } finally {
    store.close?.();
  }
}

export function selectDiscoveryMatches(
  selector: string,
  candidates: readonly DiscoveryCandidate[],
): DiscoveryCandidate[] {
  const folded = selector.toLocaleLowerCase("en-US");
  const slug = normalizeProjectSlug(selector);
  return candidates.filter((candidate) =>
    candidate.slug === slug
    || candidate.name.toLocaleLowerCase("en-US") === folded
  );
}

async function discoverAndRegisterProject(
  selector: string,
  config: ServerConfig,
  registry: ProjectRegistry,
  store: ProjectStore,
): Promise<RegisteredProject> {
  const folded = selector.toLocaleLowerCase("en-US");
  const slug = normalizeProjectSlug(selector);
  const allowedMatches: string[] = [];

  for (const allowedRoot of config.allowedRoots) {
    try {
      const canonical = await canonicalizeProjectRoot(allowedRoot, config.allowedRoots);
      const name = basename(canonical.root);
      if (
        name.toLocaleLowerCase("en-US") === folded
        || normalizeProjectSlug(name) === slug
      ) {
        allowedMatches.push(canonical.root);
      }
    } catch {
      // Missing or invalid allowed roots cannot become launcher targets.
    }
  }

  const direct = uniquePaths(allowedMatches);
  if (direct.length === 1) {
    return registerAndRead(registry, {
      path: direct[0]!,
      source: "discovered",
    }, selector);
  }
  if (direct.length > 1) {
    throw new Error(formatDiscoveredAmbiguity(selector, direct));
  }

  const discoveryRoots = existingAllowedRoots(config.allowedRoots);
  if (discoveryRoots.length === 0) {
    throw new Error(
      `Registered project not found and no configured allowed root is currently available: ${selector}`,
    );
  }
  const discovery = new ProjectDiscovery(config.allowedRoots, store);
  const result = await discovery.scan({
    roots: discoveryRoots,
    maxDepth: 4,
    maxDirectories: 5_000,
    timeoutMs: 5_000,
  });
  const matches = selectDiscoveryMatches(selector, result.candidates);
  if (matches.length === 0) {
    throw new Error(
      `Registered or discovered project not found: ${selector}\nRun \`helix projects\` to list available project slugs.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(formatDiscoveredAmbiguity(
      selector,
      matches.map((candidate) => candidate.root),
    ));
  }

  const match = matches[0]!;
  return registerAndRead(registry, {
    path: match.root,
    name: match.name,
    slug: match.slug,
    source: "discovered",
  }, selector);
}

async function registerAndRead(
  registry: ProjectRegistry,
  input: Parameters<ProjectRegistry["register"]>[0],
  selector: string,
): Promise<RegisteredProject> {
  const registered = await registry.register(input);
  const project = registry.getById(registered.id);
  if (!project) {
    throw new Error(`Discovered project registration could not be read back: ${selector}`);
  }
  return project;
}

function formatProjectSelectorError(error: ProjectSelectorError): string {
  if (error.candidates.length === 0) {
    return `${error.message}\nRun \`helix projects\` to list registered projects.`;
  }
  return [
    error.message,
    ...error.candidates.map((candidate) => `  ${candidate.slug}  ${candidate.root}`),
  ].join("\n");
}

function uniquePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const path of paths) {
    const key = process.platform === "win32"
      ? path.toLocaleLowerCase("en-US")
      : path;
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(path);
  }
  return values;
}

function formatDiscoveredAmbiguity(
  selector: string,
  roots: readonly string[],
): string {
  return [
    `Project selector is ambiguous: ${selector}`,
    ...roots.map((root) => `  ${root}`),
    "Use a registered project ID, a unique slug, or an explicit approved path.",
  ].join("\n");
}

function looksLikePath(value: string): boolean {
  return value === "."
    || value === ".."
    || isAbsolute(value)
    || value.includes("/")
    || value.includes("\\");
}

function existingAllowedRoots(roots: readonly string[]): string[] {
  return roots.filter((root) => {
    try {
      return existsSync(root) && statSync(root).isDirectory();
    } catch {
      return false;
    }
  });
}
