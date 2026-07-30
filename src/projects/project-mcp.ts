import * as z from "zod/v4";
import type {
  ProjectAvailability,
  ProjectPermissionPreset,
  ProjectView,
  ProjectWorkspaceMode,
} from "./project-types.js";

export const PROJECT_LIST_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const PROJECT_OPEN_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export const PROJECT_OPEN_TOOL_VISIBILITY = ["model", "app"] as const;

export const projectViewOutputSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  root: z.string(),
  permissionPreset: z.enum(["inspect", "design", "develop"]),
  defaultMode: z.enum(["checkout", "worktree"]),
  pinned: z.boolean(),
  source: z.enum(["manual", "discovered"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastOpenedAt: z.string().optional(),
  availability: z.enum(["available", "missing", "not_allowed", "invalid"]),
  unavailableReason: z.string().optional(),
});

export const workspaceProjectOutputSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  permissionPreset: z.enum(["inspect", "design", "develop"]),
  defaultMode: z.enum(["checkout", "worktree"]),
});

export interface ProjectListOptions {
  includeUnavailable?: boolean;
  pinnedFirst?: boolean;
}

export interface ProjectListStructuredOutput extends Record<string, unknown> {
  result: string;
  projects: ProjectView[];
  summary: {
    total: number;
    available: number;
    unavailable: number;
  };
}

export interface ProjectSelectorCandidateView {
  id: string;
  slug: string;
  name: string;
  root: string;
}

export interface ProjectErrorStructuredOutput extends Record<string, unknown> {
  result: string;
  error: {
    code: string;
    message: string;
    candidates?: ProjectSelectorCandidateView[];
  };
}

export function createProjectListOutput(
  allProjects: ProjectView[],
  options: ProjectListOptions = {},
): ProjectListStructuredOutput {
  const includeUnavailable = options.includeUnavailable === true;
  const projects = sortProjectViews(
    includeUnavailable
      ? allProjects
      : allProjects.filter((project) => project.availability === "available"),
    options.pinnedFirst !== false,
  );
  const available = allProjects.filter((project) => project.availability === "available").length;
  const unavailable = allProjects.length - available;
  const lines = [
    projects.length === 0
      ? "No registered projects are available."
      : `Registered projects (${projects.length}${includeUnavailable ? ` of ${allProjects.length}` : ""} shown):`,
    ...projects.map(formatProjectLine),
    !includeUnavailable && unavailable > 0
      ? `${unavailable} unavailable project${unavailable === 1 ? "" : "s"} hidden. Call list_projects with includeUnavailable=true to inspect them.`
      : undefined,
  ].filter((line): line is string => Boolean(line));

  return {
    result: lines.join("\n"),
    projects,
    summary: {
      total: allProjects.length,
      available,
      unavailable,
    },
  };
}

export function formatProjectOpenResult(input: {
  workspaceId: string;
  root: string;
  mode: ProjectWorkspaceMode;
  project: {
    id: string;
    slug: string;
    name: string;
    permissionPreset: ProjectPermissionPreset;
    defaultMode: ProjectWorkspaceMode;
  };
}): string {
  return [
    `Opened project ${input.project.name} (${input.project.slug})`,
    `Project ID: ${input.project.id}`,
    `Workspace: ${input.workspaceId}`,
    `Root: ${input.root}`,
    `Mode: ${input.mode}`,
    `Preset: ${input.project.permissionPreset}`,
  ].join("\n");
}

export function createProjectErrorOutput(
  code: string,
  message: string,
  candidates: ProjectSelectorCandidateView[] = [],
): ProjectErrorStructuredOutput {
  const candidateText = candidates.length > 0
    ? `\nCandidates:\n${candidates.map((candidate) => `- ${candidate.name}: id=${candidate.id}, slug=${candidate.slug}, root=${candidate.root}`).join("\n")}`
    : "";
  return {
    result: `${message}${candidateText}`,
    error: {
      code,
      message,
      ...(candidates.length > 0 ? { candidates } : {}),
    },
  };
}

function sortProjectViews(projects: ProjectView[], pinnedFirst: boolean): ProjectView[] {
  return [...projects].sort((a, b) => {
    if (pinnedFirst && a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.name.localeCompare(b.name)
      || a.slug.localeCompare(b.slug)
      || a.id.localeCompare(b.id);
  });
}

function formatProjectLine(project: ProjectView): string {
  const availability = availabilityLabel(project.availability);
  const unavailable = project.availability === "available"
    ? ""
    : ` (${project.unavailableReason ?? "unavailable"})`;
  return `- ${project.name} [${project.slug}] id=${project.id}; ${availability}; preset=${project.permissionPreset}; mode=${project.defaultMode}; root=${project.root}${unavailable}`;
}

function availabilityLabel(availability: ProjectAvailability): string {
  return availability === "available" ? "available" : `unavailable:${availability}`;
}
