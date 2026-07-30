import type {
  ProjectPermissionPreset,
  WorkspaceProjectMetadata,
} from "./project-types.js";
import type { LocalAgentWriteMode } from "../local-agent-runtime.js";

export type WorkspacePolicyOperation =
  | "read"
  | "search"
  | "list"
  | "write"
  | "edit"
  | "patch"
  | "artifact_write"
  | "shell"
  | "delegate_read_only"
  | "delegate_write"
  | "delegate_full_access";

export type WorkspacePolicyAllowScope =
  | "no-policy-path"
  | "workspace-scope"
  | "design-documentation-scope";

export type WorkspacePolicySource =
  | {
      kind: "registered_project";
      project: WorkspaceProjectMetadata;
    }
  | {
      kind: "legacy";
    };

export interface WorkspacePolicyDecisionInput {
  source: WorkspacePolicySource;
  operation: WorkspacePolicyOperation;
}

export interface WorkspacePolicyAllowedDecision {
  allowed: true;
  operation: WorkspacePolicyOperation;
  source: WorkspacePolicySource["kind"];
  scope: WorkspacePolicyAllowScope;
}

export interface WorkspacePolicyDeniedDecision {
  allowed: false;
  operation: WorkspacePolicyOperation;
  source: "registered_project";
  reason:
    | "registered-project-operation-denied"
    | "registered-project-path-denied";
  denial: {
    project: Pick<WorkspaceProjectMetadata, "id" | "slug" | "name" | "permissionPreset">;
    operation: WorkspacePolicyOperation;
    preset: ProjectPermissionPreset;
    safeAction: string;
  };
}

export type WorkspacePolicyDecision =
  | WorkspacePolicyAllowedDecision
  | WorkspacePolicyDeniedDecision;

export type WorkspaceFileMutationOperation = Extract<
  WorkspacePolicyOperation,
  "write" | "edit" | "patch" | "artifact_write"
>;

export interface WorkspaceFileMutationAuthorizationInput {
  source: WorkspacePolicySource;
  operation: WorkspaceFileMutationOperation;
  relativePath: string;
}

export class WorkspacePolicyDeniedError extends Error {
  constructor(readonly decision: WorkspacePolicyDeniedDecision) {
    super(formatWorkspacePolicyDenial(decision));
    this.name = "WorkspacePolicyDeniedError";
  }
}

export interface WorkspacePolicyAllowedOperationRule {
  allowed: true;
  scope: WorkspacePolicyAllowScope;
}

export interface WorkspacePolicyDeniedOperationRule {
  allowed: false;
}

export type WorkspacePolicyOperationRule =
  | WorkspacePolicyAllowedOperationRule
  | WorkspacePolicyDeniedOperationRule;

export type ProjectPermissionOperationMatrix = {
  readonly [Preset in ProjectPermissionPreset]: {
    readonly [Operation in WorkspacePolicyOperation]: WorkspacePolicyOperationRule;
  };
};

export const PROJECT_PERMISSION_OPERATION_MATRIX = {
  inspect: {
    read: { allowed: true, scope: "workspace-scope" },
    search: { allowed: true, scope: "workspace-scope" },
    list: { allowed: true, scope: "workspace-scope" },
    write: { allowed: false },
    edit: { allowed: false },
    patch: { allowed: false },
    artifact_write: { allowed: false },
    shell: { allowed: false },
    delegate_read_only: { allowed: true, scope: "no-policy-path" },
    delegate_write: { allowed: false },
    delegate_full_access: { allowed: false },
  },
  design: {
    read: { allowed: true, scope: "workspace-scope" },
    search: { allowed: true, scope: "workspace-scope" },
    list: { allowed: true, scope: "workspace-scope" },
    write: { allowed: true, scope: "design-documentation-scope" },
    edit: { allowed: true, scope: "design-documentation-scope" },
    patch: { allowed: true, scope: "design-documentation-scope" },
    artifact_write: { allowed: true, scope: "design-documentation-scope" },
    shell: { allowed: false },
    delegate_read_only: { allowed: true, scope: "no-policy-path" },
    delegate_write: { allowed: false },
    delegate_full_access: { allowed: false },
  },
  develop: {
    read: { allowed: true, scope: "workspace-scope" },
    search: { allowed: true, scope: "workspace-scope" },
    list: { allowed: true, scope: "workspace-scope" },
    write: { allowed: true, scope: "workspace-scope" },
    edit: { allowed: true, scope: "workspace-scope" },
    patch: { allowed: true, scope: "workspace-scope" },
    artifact_write: { allowed: true, scope: "workspace-scope" },
    shell: { allowed: true, scope: "no-policy-path" },
    delegate_read_only: { allowed: true, scope: "no-policy-path" },
    delegate_write: { allowed: true, scope: "no-policy-path" },
    delegate_full_access: { allowed: false },
  },
} as const satisfies ProjectPermissionOperationMatrix;

const LEGACY_COMPATIBLE_OPERATION_SCOPES = {
  read: "workspace-scope",
  search: "workspace-scope",
  list: "workspace-scope",
  write: "workspace-scope",
  edit: "workspace-scope",
  patch: "workspace-scope",
  artifact_write: "workspace-scope",
  shell: "no-policy-path",
  delegate_read_only: "no-policy-path",
  delegate_write: "no-policy-path",
  delegate_full_access: "no-policy-path",
} as const satisfies Record<WorkspacePolicyOperation, WorkspacePolicyAllowScope>;

const PROJECT_POLICY_SAFE_ACTION =
  "Change this project's permission preset locally in the dpkr helix dashboard.";
const SENSITIVE_FILE_NAME_TOKENS = new Set([
  "credential",
  "credentials",
  "passwd",
  "password",
  "passwords",
  "secret",
  "secrets",
  "token",
  "tokens",
]);
const SENSITIVE_FILE_NAME_TOKEN_PAIRS = new Set([
  "access:key",
  "api:key",
  "private:key",
  "service:account",
]);
const SSH_PRIVATE_KEY_NAME_PATTERN = /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?$/i;
const PRIVATE_KEY_EXTENSIONS = new Set([
  ".jks",
  ".key",
  ".keystore",
  ".p12",
  ".pem",
  ".pfx",
]);

export function decideWorkspacePolicy(
  input: WorkspacePolicyDecisionInput,
): WorkspacePolicyDecision {
  if (input.source.kind === "legacy") {
    return {
      allowed: true,
      operation: input.operation,
      source: "legacy",
      scope: LEGACY_COMPATIBLE_OPERATION_SCOPES[input.operation],
    };
  }

  const registeredSource = input.source;
  const preset = registeredSource.project.permissionPreset;
  const rule: WorkspacePolicyOperationRule =
    PROJECT_PERMISSION_OPERATION_MATRIX[preset][input.operation];
  if (!rule.allowed) {
    return deny(input.operation, registeredSource.project);
  }

  return {
    allowed: true,
    operation: input.operation,
    source: "registered_project",
    scope: rule.scope,
  };
}

export function authorizeWorkspacePolicyOperation(
  input: WorkspacePolicyDecisionInput,
): WorkspacePolicyAllowedDecision {
  const decision = decideWorkspacePolicy(input);
  if (!decision.allowed) {
    throw new WorkspacePolicyDeniedError(decision);
  }
  return decision;
}

export function authorizeWorkspaceFileMutation(
  input: WorkspaceFileMutationAuthorizationInput,
): WorkspacePolicyAllowedDecision {
  const decision = authorizeWorkspacePolicyOperation({
    source: input.source,
    operation: input.operation,
  });

  if (
    decision.scope === "design-documentation-scope" &&
    !isDesignDocumentationPath(input.relativePath)
  ) {
    throw workspaceFileMutationPathDeniedError({
      source: input.source,
      operation: input.operation,
    });
  }

  return decision;
}

export function isDesignDocumentationPath(relativePath: string): boolean {
  if (
    !relativePath ||
    relativePath.includes("\0") ||
    relativePath.includes("\\")
  ) {
    return false;
  }

  const normalizedPath = relativePath;
  if (normalizedPath.startsWith("/") || normalizedPath.startsWith("../")) return false;

  const segments = normalizedPath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return false;
  }

  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  if (
    lowerSegments.some(
      (segment) => segment === ".git" || segment.startsWith(".env"),
    )
  ) {
    return false;
  }

  const fileName = lowerSegments.at(-1) ?? "";
  const extensionIndex = fileName.lastIndexOf(".");
  const extension = extensionIndex >= 0 ? fileName.slice(extensionIndex) : "";
  if (
    PRIVATE_KEY_EXTENSIONS.has(extension) ||
    lowerSegments.some(isSensitiveCredentialName) ||
    SSH_PRIVATE_KEY_NAME_PATTERN.test(fileName)
  ) {
    return false;
  }

  if (lowerSegments[0] === "docs" && lowerSegments.length > 1) return true;
  if (lowerSegments[0] === ".devspace" && lowerSegments.length > 1) return true;
  return lowerSegments.length === 1 && /\.mdx?$/i.test(fileName);
}

export function workspaceFileMutationPathDeniedError(input: {
  source: WorkspacePolicySource;
  operation: WorkspaceFileMutationOperation;
}): WorkspacePolicyDeniedError {
  if (input.source.kind !== "registered_project") {
    throw new Error("Legacy policy does not define a registered path denial.");
  }
  return new WorkspacePolicyDeniedError(
    deny(
      input.operation,
      input.source.project,
      "registered-project-path-denied",
    ),
  );
}

export function operationForDelegateMode(
  mode: LocalAgentWriteMode,
): WorkspacePolicyOperation {
  switch (mode) {
    case "read_only":
      return "delegate_read_only";
    case "allowed":
      return "delegate_write";
    case "full_access":
      return "delegate_full_access";
    default:
      return assertNever(mode);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported local-agent write mode: ${String(value)}`);
}

function deny(
  operation: WorkspacePolicyOperation,
  project: WorkspaceProjectMetadata,
  reason: WorkspacePolicyDeniedDecision["reason"] =
    "registered-project-operation-denied",
): WorkspacePolicyDeniedDecision {
  const { id, slug, name, permissionPreset } = project;
  return {
    allowed: false,
    operation,
    source: "registered_project",
    reason,
    denial: {
      project: { id, slug, name, permissionPreset },
      operation,
      preset: permissionPreset,
      safeAction: PROJECT_POLICY_SAFE_ACTION,
    },
  };
}

function isSensitiveCredentialName(name: string): boolean {
  const tokens = name.split(/[._-]+/).filter(Boolean);
  if (tokens.some((token) => SENSITIVE_FILE_NAME_TOKENS.has(token))) return true;

  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (
      SENSITIVE_FILE_NAME_TOKEN_PAIRS.has(
        `${tokens[index]}:${tokens[index + 1]}`,
      )
    ) {
      return true;
    }
  }
  return false;
}

function formatWorkspacePolicyDenial(
  decision: WorkspacePolicyDeniedDecision,
): string {
  const { project, operation, preset, safeAction } = decision.denial;
  const reason =
    decision.reason === "registered-project-path-denied"
      ? "because the destination is outside the active preset's allowed path scope"
      : "by the active project preset";
  return `Operation "${operation}" is denied ${reason} for project "${project.name}" (${project.slug}, ${project.id}) with preset "${preset}". ${safeAction}`;
}
