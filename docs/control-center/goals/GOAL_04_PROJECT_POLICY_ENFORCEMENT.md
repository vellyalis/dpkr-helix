/goal

# GOAL 04 — Project Policy Enforcement

## Goal

Make the visible project permission preset a real, centralized authorization boundary across DevSpace operations.

## Dependencies

GOAL_01 and GOAL_03 must be DONE.

## User-visible outcome

Inspect, Design, and Develop presets behave predictably. A restricted project cannot bypass its preset by using `open_workspace` or a different write tool.

## Scope

- policy domain and centralized guard
- attach current project policy to checkout/worktree/restored workspaces
- enforce file-write, edit, patch, artifact, shell, and delegation operation gates
- design-documentation path scope
- policy metadata/errors in MCP output/cards
- dashboard preset persistence compatibility
- security and matrix tests
- docs/state

## Non-scope

- arbitrary custom policy editor/globs
- shell command classification
- remote policy mutation
- danger-full-access agent mode
- delegation tool implementation except guard integration point

## Acceptance criteria

- AC-04.1: Presets implement FR-POL-001 through FR-POL-011.
- AC-04.2: Direct `open_workspace` cannot bypass a registered project policy.
- AC-04.3: Worktree inherits source-project policy.
- AC-04.4: Patch validates all touched paths before the first mutation.
- AC-04.5: Artifact destination uses the same path authorization.
- AC-04.6: Design scope allows documented paths and denies source/secret paths.
- AC-04.7: Inspect/design shell calls fail before process start.
- AC-04.8: Unregistered path behavior remains backward compatible.
- AC-04.9: Denial messages are actionable and do not leak secrets.
- AC-04.10: Standard verification passes.

## Proof obligations

- complete preset/operation matrix test,
- bypass tests for path open and worktree,
- rejected patch leaves filesystem unchanged,
- shell process-spawn mock proves no process starts,
- artifact path tests,
- compatibility regression tests.

## Shared rules

- Read `CODEX_IMPLEMENTATION_PROMPT.md` and all referenced control-center documents first.
- Reconcile design claims with current code.
- Preserve current public behavior unless this goal explicitly changes it.
- Keep changes focused.
- Do not implement later goals opportunistically.
- Add tests for observable acceptance criteria.
- Run `npm run typecheck`, `npm test`, and `npm run build`.
- Update `08_IMPLEMENTATION_PLAN.md` and `09_PROJECT_STATE.md`.
- Do not push or publish.
