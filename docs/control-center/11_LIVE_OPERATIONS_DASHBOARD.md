# Live Operations Dashboard

## Status

This document is the canonical product and runtime contract for live operation visibility in DevSpace Control Center.

It extends the existing project, workspace, policy, process-session, local-agent, and dashboard architecture. It does not replace their ownership.

## Purpose

DevSpace must make active work observable without turning the dashboard into a second executor.

The user must be able to answer, from one local screen:

- which project and workspace are active,
- whether work came from direct MCP tool use or a configured local agent,
- what operation is currently running,
- which files changed,
- what terminal or provider output is safe to show,
- whether typecheck, tests, build, review, and state updates have run,
- whether a result merely exists or the selected Goal is actually verified,
- why work is blocked, failed, stopped, or waiting,
- whether the canonical DevSpace-owned worker can be stopped safely.

## Invariants

### One execution owner

The dashboard is an operational projection.

- `WorkspaceRegistry` continues to own workspace creation and restoration.
- Existing file and patch tools continue to own their operations.
- `ProcessSessionManager` continues to own DevSpace-managed shell processes.
- `LocalAgentService` and the existing provider adapters continue to own agent execution.
- Existing review and Project State mechanisms continue to own completion evidence.

`OperationRunService`, event storage, SSE, and the UI may observe, summarize, and request a supported stop. They must not start duplicate processes, re-run commands, apply patches, or create an alternative agent lifecycle.

### Result is not verification

An agent final response or a successful tool call is not equivalent to Goal completion.

Run state and assurance state are separate:

- a provider may finish while verification is pending,
- verification may fail after a result is available,
- a read-only operation may complete with verification not applicable,
- a Goal becomes verified only from explicit required evidence.

### Local-only administration

All operation REST and SSE endpoints are served only by the existing loopback admin listener and use the existing dashboard session and CSRF boundary.

No operation stream, stop mutation, project mutation, terminal output, or diff endpoint is mounted on the public MCP listener.

### Safe projection

The dashboard must never display or persist:

- hidden reasoning or chain-of-thought,
- full prompts or chat transcripts,
- environment values,
- OAuth, dashboard, CSRF, provider, or repository secrets,
- complete file contents merely for logging,
- raw internal SDK objects that were not explicitly classified for display.

A generic `working`, `thinking`, or `waiting for provider` state is allowed.

### Bounded behavior

Output, event history, diff summaries, and browser queues are bounded. A noisy process or slow browser must not exhaust memory or block MCP work.

Dashboard failure must not fail the underlying MCP tool, process, or local-agent operation.

## User experience

The local Control Center uses one application shell with four primary destinations:

- Projects
- Runs
- Agents
- System

The Runs destination is the operational center. Active and blocked work appears above completed work.

A selected run uses a terminal-dominant two-region desktop layout:

```text
+----------------------+------------------------------------------------------+
| Projects / Runs      | Active run                                           |
|                      |                                                      |
| devspace             | GOAL 05 / codex-implementer                          |
| main / develop       | Running / 00:12:41                                   |
|                      |                                                      |
| Active               | Live terminal / activity                             |
| - implementation     | 21:42:03 workspace opened                            |
| - tests running      | 21:42:05 read src/server.ts                          |
|                      | 21:42:19 edited local-agent-service.ts               |
| Recent               | 21:42:27 npm test                                    |
| - completed          |                                                      |
| - failed             | Activity Terminal Diff Agent output Evidence         |
+----------------------+------------------------------------------------------+
```

Context, changed files, and verification are available in the run header and
their explicit Diff/Evidence projections; they do not reserve a permanent
third column while work is active.

The layout is defined visually in `12_UI_VISUAL_DESIGN_SYSTEM.md` and screen-by-screen in `13_UI_SCREEN_SPECIFICATIONS.md`.

## Canonical run model

### Run kinds

```ts
export type OperationRunKind =
  | "mcp_tool"
  | "process_session"
  | "local_agent";
```

A run corresponds to a real canonical owner:

- one MCP tool invocation,
- one DevSpace-managed process session,
- one local-agent session.

The UI may group related runs by project, workspace, Goal ID, parent run, or explicit correlation ID. It must not invent a semantic task boundary when the runtime has no real correlation evidence.

### Run state

```ts
export type OperationRunState =
  | "queued"
  | "running"
  | "blocked"
  | "stopping"
  | "stopped"
  | "failed"
  | "completed";
```

### Assurance stage

```ts
export type OperationAssuranceStage =
  | "working"
  | "result_available"
  | "verification_pending"
  | "verifying"
  | "verified"
  | "not_applicable";
```

`completed + result_available` is valid and common for local agents. It must render as `Result available — verification pending`, never as a successful Goal completion.

### Run identity

```ts
export interface OperationRun {
  id: string;
  kind: OperationRunKind;
  source: "mcp" | "codex" | "claude" | "opencode" | "pi" | "cursor" | "copilot";
  sourceRunId?: string;
  parentRunId?: string;
  projectId?: string;
  workspaceId?: string;
  goalId?: string;
  title: string;
  state: OperationRunState;
  assuranceStage: OperationAssuranceStage;
  phase?: string;
  currentAction?: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  stoppable: boolean;
  failureCode?: string;
  failureSummary?: string;
}
```

IDs are stable across dashboard reconnect and process restart when the underlying owner is persisted.

## Canonical event model

Every event has a strict per-run sequence number.

```ts
export interface OperationEvent<T = unknown> {
  runId: string;
  sequence: number;
  type: OperationEventType;
  timestamp: string;
  level: "debug" | "info" | "warning" | "error";
  summary: string;
  payload?: T;
}
```

Required event families:

- `run.created`
- `run.state_changed`
- `workspace.opened`
- `tool.started`
- `tool.completed`
- `tool.failed`
- `file.read`
- `file.changed`
- `process.started`
- `process.output`
- `process.exited`
- `agent.status_changed`
- `agent.message`
- `agent.result_available`
- `verification.started`
- `verification.completed`
- `review.finding`
- `review.completed`
- `project_state.updated`
- `warning`
- `failure`

Payloads are typed, provider-neutral, redacted before publication, and size-limited before storage.

## Event projection rules

The dashboard derives the following from events and canonical stores:

- current action,
- elapsed time,
- changed file list,
- additions/removals when available,
- latest safe terminal output,
- latest safe provider message,
- independent evidence states,
- failure/block reason,
- stoppable capability.

Projection rules:

- preserve strict event order,
- coalesce repeated low-value events without deleting the original sequence boundary,
- never infer success from absence of errors,
- never mark verification passed from free-form provider text,
- refresh diff summaries from repository evidence rather than trusting agent claims,
- resolve project/workspace metadata from existing canonical services.

## Evidence model

Each evidence item is independent:

```ts
export type EvidenceState =
  | "not_run"
  | "running"
  | "passed"
  | "failed"
  | "not_applicable";

export interface OperationEvidence {
  type: "typecheck" | "tests" | "build" | "review" | "goal_state";
  state: EvidenceState;
  timestamp?: string;
  sourceEventSequence?: number;
  summary?: string;
}
```

A Goal-linked run can become `verified` only when the Goal's required evidence is satisfied and no unresolved blocking review finding remains.

The dashboard does not become a new source of truth. It projects evidence recorded by actual command results, review results, and Project State updates.

## Runtime components

### `OperationRunService`

Owns operation-run records, state transitions, correlation, and stop-capability lookup. It does not execute the underlying work.

### `OperationEventBus`

An in-process typed publisher. Existing owners emit events through narrow adapters. Event publication failure is non-fatal to the underlying operation.

### `OperationEventStore`

Persists bounded run and event metadata in the existing SQLite database through append-only migrations.

### `OperationProjector`

Builds dashboard DTOs from run records, bounded events, existing project/workspace state, local-agent state, and current repository diff summaries.

### Instrumentation adapters

Focused adapters instrument:

- MCP tool lifecycle,
- workspace opening,
- file mutations,
- `ProcessSessionManager` starts, output, exits, and stop,
- `LocalAgentService` and provider-safe streamed events,
- verification/review/state-update results.

Instrumentation must not change existing public tool schemas merely to support the dashboard.

### Admin operation routes

The loopback admin listener exposes authenticated read APIs, SSE, and capability-based stop only.

## Data flow

```text
Existing canonical owner
  -> narrow instrumentation adapter
  -> redact and bound payload
  -> OperationEventBus
  -> OperationRunService / OperationEventStore
  -> OperationProjector
  -> loopback REST snapshot + SSE cursor stream
  -> React dashboard
```

A dashboard stop request follows a separate controlled path:

```text
Dashboard Stop
  -> admin auth + CSRF
  -> OperationRunService resolve canonical owner
  -> owner capability check
  -> ProcessSessionManager or LocalAgentService stop
  -> emitted state events
```

## Persistence and retention

Use append-only SQLite migrations for:

- operation run metadata,
- bounded operation events,
- evidence metadata when it cannot be derived reliably from existing stores.

Defaults:

- retain active runs,
- retain a bounded recent completed history,
- cap event count and total payload bytes per run,
- cap individual output chunks,
- retain summaries after detailed output expires,
- allow configuration of retention within safe minimum and maximum bounds.

Do not persist unlimited terminal streams. When a cap is reached, emit a visible truncation event and continue the underlying process normally.

## REST and SSE contract

Recommended loopback routes:

- `GET /api/operations/runs`
- `GET /api/operations/runs/:runId`
- `GET /api/operations/runs/:runId/events?after=<sequence>`
- `GET /api/operations/stream?after=<cursor>`
- `POST /api/operations/runs/:runId/stop`

Rules:

- reads require an authenticated dashboard session,
- stop requires CSRF and JSON,
- reconnect uses the last acknowledged sequence/cursor,
- duplicate delivery is tolerated by sequence de-duplication,
- reconnect never re-executes side effects,
- slow consumers are disconnected with a recoverable cursor,
- the browser can always rehydrate from a snapshot.

## Stop semantics

Stop is shown only when the canonical owner advertises a real stop capability.

- DevSpace-owned process sessions may terminate their canonical process tree where supported.
- Local agents may stop only through the existing provider/service cancellation path.
- Completed, failed, non-owned, and ordinary short MCP tool runs are not stoppable.
- Stop does not imply rollback.
- Stop does not delete changed files.
- Stop transitions through `stopping` and ends as `stopped`, `failed`, or `completed` based on observed owner state.

The UI must state plainly: `Stop ends the active worker. It does not revert repository changes.`

## Dashboard views

### Runs rail

Shows active, blocked, stopping, failed, and recent completed runs. It supports filtering by project, source, kind, state, and time.

### Run header

Shows:

- title and run ID,
- source/provider/profile/model/thinking when applicable,
- project, workspace, branch, mode, and permission preset,
- run state and assurance stage,
- start time and elapsed time,
- explicit `Result available — verification pending` state,
- stop only when supported.

### Activity

Shows semantic events in strict order. Repeated output may be grouped visually. Details are expandable.

### Terminal

Shows sanitized stdout/stderr from canonical DevSpace-owned process sessions and provider command events. It is read-only in the first implementation.

### Diff

Shows changed files, operation type, additions/removals, and existing patch/review rendering. Large diffs are lazy-loaded from repository evidence.

### Agent output

Shows safe streamed provider messages, provider errors, final response, and provider session identity. Hidden reasoning is never shown.

### Evidence

Shows typecheck, tests, build, review, and Goal/Project State independently, including missing requirements.

## Failure and recovery

### Event store unavailable

Underlying work continues. The dashboard shows degraded observability and can recover from canonical stores after restart.

### SSE disconnect

The browser reconnects from the last sequence cursor and refreshes the run snapshot. No side effects repeat.

### Process restart

Persisted runs are reconciled with existing process/local-agent/session state. Runs whose canonical owner no longer exists become `failed` or `stopped` with a recovery summary; they are never silently left `running`.

### Provider payload changes

Provider adapters map only known safe event fields. Unknown fields are ignored or summarized generically, not dumped to the browser.

### Repository moved or removed

Historical metadata remains readable. Live diff and workspace actions report the current unavailable state.

## Non-scope

- hidden reasoning display,
- fake progress generated by timers,
- a writable browser terminal,
- a second shell, process, or agent runtime,
- automatic retry loops,
- automatic rollback,
- public or remote event streaming,
- replacing Project State, Git, tests, or review as sources of truth,
- an unrelated multi-agent planning product.

## Acceptance conditions

The feature is acceptable only when:

1. direct MCP, process-session, and local-agent work create identifiable canonical runs,
2. run state and assurance stage remain separate,
3. events remain ordered, bounded, redacted, and reconnectable,
4. existing owners emit events without duplicated execution paths,
5. dashboard failure does not break MCP, CLI, process, or agent work,
6. the UI exposes current action, terminal, changed files, diff, agent output, evidence gaps, elapsed time, and failure reason,
7. stop is capability-based and never claims rollback,
8. persisted or streamed content excludes secrets, prompts, file contents, environment values, and hidden reasoning,
9. real Windows process-tree stop and real Codex streamed-view scenarios are manually verified,
10. standard verification and the dedicated proof obligations in the selected Goal pass.
