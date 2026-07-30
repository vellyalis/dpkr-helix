import type {
  ProjectAvailability,
  ProjectView,
  RegisteredProject,
  WorkspaceProjectMetadata,
} from "./project-types.js";

export function toProjectView(
  project: RegisteredProject,
  availability: ProjectAvailability,
  unavailableReason?: string,
): ProjectView {
  const { rootKey: _rootKey, ...visible } = project;
  return {
    ...visible,
    availability,
    ...(unavailableReason ? { unavailableReason } : {}),
  };
}

export function toWorkspaceProjectMetadata(
  project: RegisteredProject,
): WorkspaceProjectMetadata {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    permissionPreset: project.permissionPreset,
    defaultMode: project.defaultMode,
  };
}
