export type ProjectPermissionPreset = "inspect" | "design" | "develop";
export type ProjectSource = "manual" | "discovered";
export type ProjectAvailability = "available" | "missing" | "not_allowed" | "invalid";
export type ProjectWorkspaceMode = "checkout" | "worktree";

export interface RegisteredProject {
  id: string;
  slug: string;
  name: string;
  root: string;
  rootKey: string;
  permissionPreset: ProjectPermissionPreset;
  defaultMode: ProjectWorkspaceMode;
  pinned: boolean;
  source: ProjectSource;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
}

export interface NewRegisteredProject extends RegisteredProject {}

export interface ProjectPatch {
  slug?: string;
  name?: string;
  permissionPreset?: ProjectPermissionPreset;
  defaultMode?: ProjectWorkspaceMode;
  pinned?: boolean;
}

export interface ProjectView extends Omit<RegisteredProject, "rootKey"> {
  availability: ProjectAvailability;
  unavailableReason?: string;
}

export interface WorkspaceProjectMetadata {
  id: string;
  slug: string;
  name: string;
  permissionPreset: ProjectPermissionPreset;
  defaultMode: ProjectWorkspaceMode;
}
