# Architecture

## Selected architecture

Extend the existing DevSpace package with five internal capabilities:

1. project registry and discovery,
2. loopback-only local administration dashboard,
3. MCP project-selection tools and interactive cards,
4. reusable local-agent orchestration exposed through explicit MCP tools,
5. bounded live-operation projection and a coherent Projects/Runs/Agents/System Control Center UI.

No browser extension, desktop shell, or second standalone daemon is added.

## Runtime topology

```text
ChatGPT / MCP host
        |
        | OAuth + public HTTPS tunnel
        v
MCP listener: existing Express app
config.host:config.port
        |
        +-- MCP tools
        +-- MCP Apps resource
        +-- WorkspaceRegistry
        +-- ProjectRegistry
        +-- ProjectPolicyGuard
        +-- LocalAgentService
        +-- OperationRunService / OperationEventBus
        |
        +-------------------+
                            |
                            v
                     SQLite state DB

Local browser
        |
        | loopback only + local admin session + CSRF
        v
Admin listener: second Express app
127.0.0.1:dashboardPort
        |
        +-- dashboard static assets
        +-- project management API
        +-- discovery API
        +-- optional native folder picker adapter
        +-- health/agent read API
        +-- authenticated operation snapshots and SSE
        +-- capability-routed stop API
```

Both listeners live in the same Node process and share service instances. The admin listener is not mounted on the public MCP Express app.

## Why a second listener is required

Putting `/dashboard` on the tunnel-facing Express app would create a second public attack surface. Request-IP checks are insufficient because a tunnel process may connect from loopback. A separate listener bound to `127.0.0.1` provides a real network boundary while retaining one package, one process, one configuration, and one shutdown lifecycle.

## Responsibility boundaries

### `ProjectStore`

Owns database persistence only. It does not scan, open workspaces, or enforce tool policy.

### `ProjectRegistry`

Owns project identity, path canonicalization, allowed-root validation, name/slug resolution, availability checks, and last-opened updates.

### `ProjectDiscovery`

Owns bounded filesystem traversal and discovery candidate creation. It never persists automatically.

### `ProjectPolicyGuard`

Owns operation authorization for a workspace policy. Tool handlers call it before side effects.

### `WorkspaceRegistry`

Continues to own checkout/worktree creation, workspace restoration, instruction/skill loading, and path scoping. It receives a `ProjectRegistry` dependency and attaches project identity/policy where a canonical path matches a registered project.

### `LocalAgentService`

Owns start, resume, list, status, and supported cancellation behavior for configured local agents. CLI and MCP become adapters over this service.

### `OperationRunService`

Owns operation-run records, state/assurance transitions, canonical-owner correlation, and stop-capability resolution. It does not execute tools, processes, or agents.

### `OperationEventBus` and `OperationEventStore`

Own typed in-process publication and bounded SQLite persistence of safe operational events. Publication or dashboard failure must not fail the underlying canonical operation.

### `OperationProjector`

Builds browser DTOs from operation records plus existing project, workspace, process, local-agent, Git/change-review, verification, and Project State evidence. It does not become a new source of truth.

### MCP server

Owns remote schemas, annotations, structured outputs, and tool result cards. It cannot mutate project registration or presets.

### Admin server

Owns local project-management mutations, dashboard authentication, CSRF, and browser-facing APIs.

### MCP App UI

Owns presentation and optional host-proxied tool calls. It never directly reads the local filesystem.

## Data flow: project registration

```text
Dashboard action
  -> local-admin authentication and CSRF
  -> ProjectRegistry.register(path, metadata)
  -> realpath/stat
  -> assertAllowedPath(current allowed roots)
  -> compute canonical path key
  -> ProjectStore upsert/idempotent duplicate handling
  -> sanitized project DTO
```

## Data flow: project open

```text
MCP open_project(project selector)
  -> ProjectRegistry.resolveSelector
  -> revalidate current path and allowed roots
  -> WorkspaceRegistry.openWorkspace(path/mode/baseRef)
  -> attach project ID and policy
  -> persist workspace session association
  -> load AGENTS/skills/profiles
  -> open_workspace-compatible result + project metadata
```

Direct `open_workspace(path)` also asks `ProjectRegistry.findByPath(path)`. If it matches a registered project, the same policy is attached. This closes the policy-bypass route.

## Data flow: policy-guarded operation

```text
tool input + workspaceId
  -> WorkspaceRegistry.getWorkspace
  -> ProjectPolicyGuard.assertOperation
  -> resolve/validate all affected paths
  -> perform existing operation
  -> existing result/diff/review behavior
```

For patch application, the complete path set is extracted and authorized before the first mutation.

## Data flow: Codex handoff

```text
explicit delegate_task
  -> workspace lookup
  -> policy guard
  -> profile/provider validation
  -> structured envelope validation
  -> deterministic prompt renderer
  -> LocalAgentService.start
  -> existing LocalAgentStore record
  -> detached worker
  -> existing Codex SDK adapter
  -> status/final response persisted
```

The service uses the same workspace root and existing provider session ID behavior. It does not copy chat transcripts to the repository.

## Data flow: live operation projection

```text
existing MCP tool / ProcessSessionManager / LocalAgentService / verification owner
  -> focused instrumentation adapter
  -> redact and bound payload
  -> OperationEventBus
  -> OperationRunService and OperationEventStore
  -> OperationProjector
  -> loopback-only REST snapshot and SSE cursor stream
  -> Control Center Runs/live-run screens
```

A stop request resolves the canonical owner and calls only its existing supported cancellation path. It does not re-run commands, own a process tree, or rollback repository changes.

Detailed contracts are in `11_LIVE_OPERATIONS_DASHBOARD.md`.

## Proposed module layout

```text
src/
  projects/
    project-types.ts
    project-store.ts
    project-registry.ts
    project-discovery.ts
    project-policy.ts
    project-dto.ts
  admin/
    admin-server.ts
    admin-auth.ts
    admin-routes.ts
    folder-picker.ts
    browser-open.ts
  dashboard/
    index.html
    main.tsx
    app.tsx
    api.ts
    styles.css
    components/
    screens/
  operations/
    operation-types.ts
    operation-run-service.ts
    operation-event-bus.ts
    operation-event-store.ts
    operation-projector.ts
    operation-redaction.ts
  local-agent-service.ts
  local-agent-worker.ts
```

Existing modules receive focused integration changes:

- `src/server.ts`
- `src/cli.ts`
- `src/config.ts`
- `src/user-config.ts`
- `src/workspaces.ts`
- `src/workspace-store.ts`
- `src/db/schema.ts`
- `src/db/migrations.ts`
- `src/artifact-tools.ts`
- `src/ui/card-types.ts`
- `src/ui/tool-display.ts`
- `src/ui/workspace-app.tsx`
- `vite.config.ts`
- tests and docs

Exact file organization may change if repository evidence favors a simpler existing convention, but responsibilities must remain separated.

## Compatibility strategy

- `open_workspace` remains public.
- Existing workspace sessions without `projectId` restore normally.
- Existing config files default new dashboard fields.
- Existing OAuth and public listener remain unchanged.
- New project tools are additive.
- New card types are additive.
- Subagent MCP tools are registered only when `config.subagents` is enabled.
- Hosts without MCP Apps support receive normal MCP text/structured content.
- Hosts without `serverTools` capability see non-interactive fallback UI.

## Failure and recovery

### Database migration failure

The migration transaction rolls back. DevSpace fails startup with a clear local error before serving inconsistent state. Existing database file is not partially advanced.

### Dashboard listener failure

MCP listener remains available. The CLI prints the failed local address and recovery configuration. If an explicit “dashboard required” setting is later added, only then may startup fail.

### Repository removed or moved

The project remains registered with availability state `missing`. The user can edit/forget/re-register. DevSpace never searches the whole machine to guess the new location.

### Allowed roots changed

Every list/open/mutation revalidates. A project outside current roots becomes `not_allowed`; it is not opened.

### Agent worker crash

Existing status becomes `error` with a sanitized error. A follow-up can start after inspection; no automatic retry loop.

### MCP App host lacks capabilities

The model can still call MCP tools. The card displays explicit fallback instructions.

### Operation projection unavailable

Underlying MCP tools, process sessions, and local-agent work continue. The dashboard reports degraded observability, and persisted runs are reconciled from canonical owners after recovery. No operation is restarted merely to restore a display.

### SSE client disconnects or is slow

The browser reconnects from a cursor and refreshes a snapshot. Per-client queues are bounded; a slow client may be disconnected without blocking underlying work or repeating side effects.

## Complexity receipts

### Second loopback listener

Required to prevent the project-management API from sharing the tunnel-facing network boundary. Same process avoids a second deployment unit.

### Project registry table

Required for stable name-based project selection and persisted settings. Workspace-session history cannot safely substitute because it lacks user-facing identity and policy.

### Local-agent service extraction

Required to avoid duplicating CLI orchestration in MCP handlers and to preserve one owner of provider/session behavior.

### Optional native picker adapter

Convenience only. It is isolated behind capability detection and cannot block core scan/manual registration.

### Operation run/event projection

Required to make real direct MCP, process, and local-agent work observable while preserving one owner for execution. A typed bounded projection is simpler and safer than dashboard-owned execution, raw log scraping, or provider-specific UI state.

### Shared Control Center visual system

Required to replace the current unrelated vertical bands with consistent information hierarchy, state meaning, keyboard behavior, light/dark themes, and complete loading/error/disconnected states. It uses the existing React/Vite/CSS stack first and does not justify a new component framework by itself.

## GOAL_08 Codex-parity extension

`goals/GOAL_08_CODEX_PARITY.md` is the canonical Goal contract. The extension
does not add another layer to the system. It strengthens four existing seams:

```text
WorkspaceRegistry
  -> bounded repositoryContext projection

ReviewCheckpointManager + repository-diff owner
  -> model-visible structured review bundle

ProcessSessionManager + operation evidence
  -> exit-derived result with repository-tree fingerprint

LocalAgentService + Codex SDK
  -> structured completed/needs_input outcome
  -> existing same-thread continuation
  -> existing bounded wait exposed through MCP
```

### Ownership

- `WorkspaceRegistry` still owns workspace identity and lifecycle.
- `src/operations/repository-diff.ts` and the review-checkpoint module share one
  isolated temporary-index fingerprint primitive; neither persists a second
  repository snapshot database.
- `ProcessSessionManager` remains the only command owner. The operation
  verification projector may persist one nullable basis fingerprint beside the
  evidence it already owns.
- `LocalAgentService` remains the only local-agent lifecycle owner. Structured
  disposition is result metadata, not a new status machine or message service.
- the MCP server serializes additive bounded fields and never becomes an
  executor, verifier, model router, or notification scheduler.

### Architecture rejection

Do not add a reverse browser/Web wake-up path, agent planner, vector index,
workflow engine, or cancellation control plane under GOAL_08. Structured input
requests and bounded host polling close the current communication gap. A
truthful detached-worker cancellation contract is a separate lifecycle
decision and remains deferred until its explicit trigger is observed.
