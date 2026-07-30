import type { ProjectView } from "../projects/project-types.js";

export interface ProjectGitStatus {
  branch?: string;
  dirtyCount?: number;
  unavailable?: string;
  stale?: boolean;
}

export interface ProjectScreenRecord {
  project: ProjectView;
  gitStatus: ProjectGitStatus;
  activeRunCount: number;
}

export interface ProjectScreenFilters {
  search: string;
  availability: string;
  permissionPreset: string;
  defaultMode: string;
  activeWork: string;
  allowedRoot: string;
}

export function filterAndSortProjectRecords(
  records: ProjectScreenRecord[],
  filters: ProjectScreenFilters,
): ProjectScreenRecord[] {
  const search = filters.search.trim().toLocaleLowerCase();
  return records
    .filter(({ project, activeRunCount }) => {
      if (
        search
        && ![project.name, project.slug, project.root]
          .some((value) => value.toLocaleLowerCase().includes(search))
      ) return false;
      if (filters.availability && project.availability !== filters.availability) return false;
      if (filters.permissionPreset && project.permissionPreset !== filters.permissionPreset) return false;
      if (filters.defaultMode && project.defaultMode !== filters.defaultMode) return false;
      if (filters.activeWork === "active" && activeRunCount === 0) return false;
      if (filters.activeWork === "idle" && activeRunCount > 0) return false;
      if (filters.allowedRoot && !isWithinRoot(project.root, filters.allowedRoot)) return false;
      return true;
    })
    .sort(compareProjectRecords);
}

export function isActiveRunState(state: string): boolean {
  return state === "queued" || state === "running" || state === "blocked" || state === "stopping";
}

export function isWithinRoot(path: string, root: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(root).replace(/\/+$/, "");
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function compareProjectRecords(a: ProjectScreenRecord, b: ProjectScreenRecord): number {
  if (a.project.pinned !== b.project.pinned) return a.project.pinned ? -1 : 1;
  if (a.activeRunCount !== b.activeRunCount) return b.activeRunCount - a.activeRunCount;
  if (a.project.availability !== b.project.availability) {
    if (a.project.availability === "available") return -1;
    if (b.project.availability === "available") return 1;
  }
  const aOpened = Date.parse(a.project.lastOpenedAt ?? "") || 0;
  const bOpened = Date.parse(b.project.lastOpenedAt ?? "") || 0;
  if (aOpened !== bOpened) return bOpened - aOpened;
  return a.project.name.localeCompare(b.project.name);
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+/g, "/").toLocaleLowerCase();
}
