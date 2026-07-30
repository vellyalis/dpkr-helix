import type { ServerConfig } from "./config.js";
import type { LocalAgentWriteMode } from "./local-agent-runtime.js";
import { createWorkspaceStore } from "./workspace-store.js";
import { WorkspaceRegistry } from "./workspaces.js";
import { createProjectStore } from "./projects/project-store.js";
import { ProjectRegistry } from "./projects/project-registry.js";
import { toWorkspaceProjectMetadata } from "./projects/project-dto.js";
import {
  authorizeWorkspacePolicyOperation,
  operationForDelegateMode,
  type WorkspacePolicySource,
} from "./projects/project-policy.js";
import { isPathInsideRoot } from "./roots.js";

export interface LocalAgentPolicyScope {
  workspaceId?: string;
  workspaceRoot: string;
}

export interface AuthorizedLocalAgentActionInput<T> {
  config: ServerConfig;
  scope: LocalAgentPolicyScope;
  writeMode: LocalAgentWriteMode;
  action: () => T | Promise<T>;
}

export async function runAuthorizedLocalAgentAction<T>(
  input: AuthorizedLocalAgentActionInput<T>,
): Promise<T> {
  const source = await resolveLocalAgentPolicySource(input.config, input.scope);
  authorizeWorkspacePolicyOperation({
    source,
    operation: operationForDelegateMode(input.writeMode),
  });
  return await input.action();
}

export async function resolveLocalAgentPolicySource(
  config: ServerConfig,
  scope: LocalAgentPolicyScope,
): Promise<WorkspacePolicySource> {
  const projectStore = createProjectStore(config.stateDir);
  const workspaceStore = createWorkspaceStore(config.stateDir);
  try {
    const projects = new ProjectRegistry(projectStore, config.allowedRoots);
    if (!scope.workspaceId) {
      if (config.allowedRoots.some((root) => isPathInsideRoot(scope.workspaceRoot, root))) {
        const project = await projects.findByPath(scope.workspaceRoot);
        if (project) {
          return {
            kind: "registered_project",
            project: toWorkspaceProjectMetadata(project),
          };
        }
      }

      const storedSession = workspaceStore.findSessionByRoot(scope.workspaceRoot);
      if (!storedSession) return { kind: "legacy" };
      scope = { workspaceId: storedSession.id, workspaceRoot: scope.workspaceRoot };
    }

    const workspaceId = scope.workspaceId;
    if (!workspaceId) throw new Error("Local-agent workspace context is missing a workspace ID.");
    const workspaces = new WorkspaceRegistry(config, workspaceStore, projects);
    const workspace = workspaces.getWorkspace(workspaceId);
    if (!sameWorkspaceRoot(workspace.root, scope.workspaceRoot)) {
      throw new Error("Local-agent workspace context does not match the persisted workspace.");
    }
    return workspace.policySource;
  } finally {
    workspaceStore.close?.();
    projectStore.close?.();
  }
}

function sameWorkspaceRoot(first: string, second: string): boolean {
  return isPathInsideRoot(first, second) && isPathInsideRoot(second, first);
}
