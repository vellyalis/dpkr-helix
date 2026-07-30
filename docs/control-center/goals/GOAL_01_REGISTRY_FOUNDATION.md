/goal

# GOAL 01 — Registry Foundation

## Goal

Add the persistent registered-project domain, canonical path identity, and workspace association required by every later feature.

## User-visible outcome

No new dashboard is required yet. The repository gains a tested internal project registry that can safely represent projects under allowed roots and associate an opened workspace with a registered project.

## Scope

- project domain types and DTOs
- SQLite schema and append-only migration
- `ProjectStore`
- `ProjectRegistry`
- path canonicalization and selector resolution
- nullable `projectId` workspace-session persistence
- `WorkspaceRegistry` integration sufficient to attach project metadata/policy placeholder
- unit/integration tests
- state/docs updates

## Non-scope

- dashboard
- discovery UI
- MCP project tools
- policy enforcement beyond carrying a preset value
- Codex delegation tools

## Required implementation seams

- `src/db/schema.ts`
- `src/db/migrations.ts`
- `src/workspace-store.ts`
- `src/workspaces.ts`
- new focused `src/projects/*` modules
- related tests

## Acceptance criteria

- AC-01.1: Fresh and existing v3 databases migrate transactionally.
- AC-01.2: Registered project records implement FR-REG-001 through FR-REG-010.
- AC-01.3: Duplicate Windows path variants resolve to one canonical project in platform-normalized tests.
- AC-01.4: IDs and slugs resolve deterministically; ambiguous display names do not guess.
- AC-01.5: A checkout opened by path carries `projectId` when the canonical path is registered.
- AC-01.6: A worktree carries the source project's identity.
- AC-01.7: Legacy unregistered workspace sessions still restore.
- AC-01.8: No public MCP schema changes are required in this goal.
- AC-01.9: Standard verification passes.

## Proof obligations

- migration test starting from pre-goal schema,
- outside-root/symlink path tests,
- duplicate/idempotency tests,
- workspace association tests,
- compatibility test for legacy session.

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
