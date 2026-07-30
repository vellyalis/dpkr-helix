import assert from "node:assert/strict";
import { posix } from "node:path";
import {
  authorizeWorkspaceFileMutation,
  decideWorkspacePolicy,
  isDesignDocumentationPath,
  operationForDelegateMode,
  PROJECT_PERMISSION_OPERATION_MATRIX,
  WorkspacePolicyDeniedError,
  type WorkspacePolicyAllowScope,
  type WorkspacePolicyOperation,
  type WorkspacePolicyOperationRule,
} from "./project-policy.js";
import type {
  ProjectPermissionPreset,
  WorkspaceProjectMetadata,
} from "./project-types.js";

const operations = [
  "read",
  "search",
  "list",
  "write",
  "edit",
  "patch",
  "artifact_write",
  "shell",
  "delegate_read_only",
  "delegate_write",
  "delegate_full_access",
] as const satisfies readonly WorkspacePolicyOperation[];

const presets = ["inspect", "design", "develop"] as const satisfies readonly ProjectPermissionPreset[];

const expectedMatrix = {
  inspect: {
    read: "workspace-scope",
    search: "workspace-scope",
    list: "workspace-scope",
    write: false,
    edit: false,
    patch: false,
    artifact_write: false,
    shell: false,
    delegate_read_only: "no-policy-path",
    delegate_write: false,
    delegate_full_access: false,
  },
  design: {
    read: "workspace-scope",
    search: "workspace-scope",
    list: "workspace-scope",
    write: "design-documentation-scope",
    edit: "design-documentation-scope",
    patch: "design-documentation-scope",
    artifact_write: "design-documentation-scope",
    shell: false,
    delegate_read_only: "no-policy-path",
    delegate_write: false,
    delegate_full_access: false,
  },
  develop: {
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
    delegate_full_access: false,
  },
} as const satisfies {
  readonly [Preset in ProjectPermissionPreset]: {
    readonly [Operation in WorkspacePolicyOperation]: false | string;
  };
};

assert.deepEqual(operations, Object.keys(PROJECT_PERMISSION_OPERATION_MATRIX.inspect));
assert.deepEqual(operations, Object.keys(PROJECT_PERMISSION_OPERATION_MATRIX.design));
assert.deepEqual(operations, Object.keys(PROJECT_PERMISSION_OPERATION_MATRIX.develop));

for (const preset of presets) {
  for (const operation of operations) {
    const project = projectFor(preset);
    const decision = decideWorkspacePolicy({
      source: { kind: "registered_project", project },
      operation,
    });
    const expected: false | WorkspacePolicyAllowScope = expectedMatrix[preset][operation];
    if (expected === false) {
      assert.equal(decision.allowed, false, `${preset} ${operation}`);
      assert.equal(decision.operation, operation);
      assert.equal(decision.source, "registered_project");
      assert.equal(decision.reason, "registered-project-operation-denied");
      assert.deepEqual(decision.denial.project, {
        id: project.id,
        slug: project.slug,
        name: project.name,
        permissionPreset: preset,
      });
      assert.equal(decision.denial.operation, operation);
      assert.equal(decision.denial.preset, preset);
      assert.match(decision.denial.safeAction, /dpkr helix dashboard/);
    } else {
      assert.equal(decision.allowed, true, `${preset} ${operation}`);
      assert.equal(decision.operation, operation);
      assert.equal(decision.source, "registered_project");
      assert.equal(decision.scope, expected);
    }
  }
}

for (const operation of operations) {
  const decision = decideWorkspacePolicy({
    source: { kind: "legacy" },
    operation,
  });
  assert.deepEqual(decision, {
    allowed: true,
    operation,
    source: "legacy",
    scope: operation === "shell" || operation.startsWith("delegate_")
      ? "no-policy-path"
      : "workspace-scope",
  });
}

for (const preset of presets) {
  for (const operation of operations) {
    const rule: WorkspacePolicyOperationRule =
      PROJECT_PERMISSION_OPERATION_MATRIX[preset][operation];
    if (rule.allowed) {
      assert.equal(typeof rule.scope, "string", `${preset} ${operation}`);
    } else {
      assert.equal("scope" in rule, false, `${preset} ${operation}`);
    }
  }
}

const deniedWrite = decideWorkspacePolicy({
  source: { kind: "registered_project", project: projectFor("inspect") },
  operation: "write",
});
assert.equal(deniedWrite.allowed, false);
assert.equal(deniedWrite.reason, "registered-project-operation-denied");
assert.equal(deniedWrite.denial.project.slug, "project-inspect");
assert.equal(deniedWrite.denial.operation, "write");
assert.equal(deniedWrite.denial.preset, "inspect");
assert.match(deniedWrite.denial.safeAction, /dpkr helix dashboard/);
assert.equal(JSON.stringify(deniedWrite).includes("relativePath"), false);
assert.equal(JSON.stringify(deniedWrite).includes("secret-prod-token"), false);

for (const preset of presets) {
  const deniedFullAccess = decideWorkspacePolicy({
    source: { kind: "registered_project", project: projectFor(preset) },
    operation: "delegate_full_access",
  });
  assert.equal(deniedFullAccess.allowed, false);
  assert.equal(deniedFullAccess.reason, "registered-project-operation-denied");
  assert.equal(deniedFullAccess.denial.project.slug, `project-${preset}`);
  assert.equal(deniedFullAccess.denial.operation, "delegate_full_access");
  assert.equal(deniedFullAccess.denial.preset, preset);
  assert.match(deniedFullAccess.denial.safeAction, /dpkr helix dashboard/);
  assert.equal(JSON.stringify(deniedFullAccess).includes("secret-prod-token"), false);
}

assert.deepEqual(
  decideWorkspacePolicy({
    source: { kind: "legacy" },
    operation: "delegate_full_access",
  }),
  {
    allowed: true,
    operation: "delegate_full_access",
    source: "legacy",
    scope: "no-policy-path",
  },
);

const allowedDesignPaths = [
  "docs/architecture.md",
  "DOCS/nested/plan.MDX",
  "README.md",
  "PLAN.mdx",
  ".devspace/HANDOFF.md",
];
for (const path of allowedDesignPaths) {
  assert.equal(isDesignDocumentationPath(path), true, path);
}

const deniedDesignPaths = [
  "src/index.ts",
  "docs",
  ".devspace",
  "../README.md",
  "docs/../src/index.md",
  "docs/.git/config.md",
  "docs/.env.production.md",
  "docs/credentials.json",
  "docs/client-secret.json",
  "docs/api-token.txt",
  "docs/prod.credentials.json",
  "docs/api-key.txt",
  "docs/aws_access_key_id.txt",
  "docs/private-key.md",
  "docs/id_ed25519",
  "docs/signing.pem",
  "docs\\evil.ts",
  ".devspace\\worker.ts",
  "docs\\nested\\plan.md",
];
for (const path of deniedDesignPaths) {
  assert.equal(isDesignDocumentationPath(path), false, path);
}

const deceptivePosixPath = posix.relative(
  "/workspace",
  posix.resolve("/workspace", "docs\\evil.ts"),
);
assert.equal(deceptivePosixPath, "docs\\evil.ts");
assert.equal(isDesignDocumentationPath(deceptivePosixPath), false);

for (const operation of ["write", "edit", "patch", "artifact_write"] as const) {
  assert.throws(
    () => authorizeWorkspaceFileMutation({
      source: { kind: "registered_project", project: projectFor("design") },
      operation,
      relativePath: deceptivePosixPath,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WorkspacePolicyDeniedError);
      assert.equal(error.decision.reason, "registered-project-path-denied");
      assert.equal(error.decision.denial.operation, operation);
      assert.doesNotMatch(error.message, /docs\\evil\.ts/);
      return true;
    },
  );
}

assert.equal(
  authorizeWorkspaceFileMutation({
    source: { kind: "registered_project", project: projectFor("design") },
    operation: "write",
    relativePath: "docs/plan.md",
  }).scope,
  "design-documentation-scope",
);
assert.equal(
  authorizeWorkspaceFileMutation({
    source: { kind: "registered_project", project: projectFor("develop") },
    operation: "edit",
    relativePath: "src/index.ts",
  }).scope,
  "workspace-scope",
);
assert.equal(
  authorizeWorkspaceFileMutation({
    source: { kind: "legacy" },
    operation: "write",
    relativePath: "src/index.ts",
  }).scope,
  "workspace-scope",
);

assert.throws(
  () =>
    authorizeWorkspaceFileMutation({
      source: { kind: "registered_project", project: projectFor("inspect") },
      operation: "write",
      relativePath: "docs/plan.md",
    }),
  (error: unknown) => {
    assert.ok(error instanceof WorkspacePolicyDeniedError);
    assert.equal(error.decision.reason, "registered-project-operation-denied");
    assert.match(error.message, /Operation "write"/);
    assert.match(error.message, /Project inspect/);
    assert.match(error.message, /preset "inspect"/);
    assert.match(error.message, /dpkr helix dashboard/);
    assert.doesNotMatch(error.message, /docs\/plan\.md/);
    return true;
  },
);

assert.throws(
  () =>
    authorizeWorkspaceFileMutation({
      source: { kind: "registered_project", project: projectFor("design") },
      operation: "edit",
      relativePath: "docs/secret-prod-token.pem",
    }),
  (error: unknown) => {
    assert.ok(error instanceof WorkspacePolicyDeniedError);
    assert.equal(error.decision.reason, "registered-project-path-denied");
    assert.match(error.message, /Operation "edit"/);
    assert.match(error.message, /allowed path scope/);
    assert.match(error.message, /preset "design"/);
    assert.match(error.message, /dpkr helix dashboard/);
    assert.doesNotMatch(error.message, /secret-prod-token/);
    return true;
  },
);

assert.equal(operationForDelegateMode("read_only"), "delegate_read_only");
assert.equal(operationForDelegateMode("allowed"), "delegate_write");
assert.equal(operationForDelegateMode("full_access"), "delegate_full_access");

function projectFor(preset: ProjectPermissionPreset): WorkspaceProjectMetadata {
  return {
    id: `prj_${preset}`,
    slug: `project-${preset}`,
    name: `Project ${preset}`,
    permissionPreset: preset,
    defaultMode: "checkout",
  };
}
