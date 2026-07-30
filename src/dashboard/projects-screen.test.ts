import assert from "node:assert/strict";
import type { ProjectView } from "../projects/project-types.js";
import {
  filterAndSortProjectRecords,
  isActiveRunState,
  isWithinRoot,
  type ProjectScreenRecord,
} from "./projects-screen.js";

const records: ProjectScreenRecord[] = [
  record(project("idle", { lastOpenedAt: "2026-07-01T00:00:00Z" })),
  record(project("unavailable", { availability: "missing", pinned: true })),
  record(project("active"), 2),
  record(project("pinned", { pinned: true })),
  record(project("design", {
    permissionPreset: "design",
    defaultMode: "worktree",
    root: "C:\\work\\nested\\design",
  })),
];

assert.deepEqual(
  filterAndSortProjectRecords(records, emptyFilters()).map(({ project }) => project.id),
  ["pinned", "unavailable", "active", "idle", "design"],
);
assert.deepEqual(
  filterAndSortProjectRecords(records, { ...emptyFilters(), search: "NESTED" })
    .map(({ project }) => project.id),
  ["design"],
);
assert.deepEqual(
  filterAndSortProjectRecords(records, { ...emptyFilters(), permissionPreset: "design" })
    .map(({ project }) => project.id),
  ["design"],
);
assert.deepEqual(
  filterAndSortProjectRecords(records, { ...emptyFilters(), activeWork: "active" })
    .map(({ project }) => project.id),
  ["active"],
);
assert.deepEqual(
  filterAndSortProjectRecords(records, { ...emptyFilters(), allowedRoot: "C:\\work" })
    .map(({ project }) => project.id),
  ["pinned", "unavailable", "active", "idle", "design"],
);

assert.equal(isWithinRoot("C:\\workspace\\repo", "c:\\workspace"), true);
assert.equal(isWithinRoot("C:\\workspace-other\\repo", "c:\\workspace"), false);
assert.equal(isActiveRunState("blocked"), true);
assert.equal(isActiveRunState("completed"), false);

console.log("projects screen tests passed");

function emptyFilters() {
  return {
    search: "",
    availability: "",
    permissionPreset: "",
    defaultMode: "",
    activeWork: "",
    allowedRoot: "",
  };
}

function record(value: ProjectView, activeRunCount = 0): ProjectScreenRecord {
  return { project: value, gitStatus: {}, activeRunCount };
}

function project(id: string, patch: Partial<ProjectView> = {}): ProjectView {
  return {
    id,
    slug: id,
    name: id,
    root: `C:\\work\\${id}`,
    permissionPreset: "develop",
    defaultMode: "checkout",
    pinned: false,
    source: "manual",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    availability: "available",
    ...patch,
  };
}
