# UI Screen Specifications

## Status

This document is the canonical screen-level specification for the loopback-only DevSpace Control Center.

It applies the runtime contract in `11_LIVE_OPERATIONS_DASHBOARD.md` and the visual system in `12_UI_VISUAL_DESIGN_SYSTEM.md` to concrete screens and states.

## Product boundary

The Control Center remains one local React/Vite application served by the existing loopback admin listener.

It is not:

- a browser extension,
- a desktop shell,
- a second DevSpace daemon,
- a replacement for ChatGPT MCP App cards,
- a second owner of workspaces, processes, agents, review, or Project State.

## Navigation model

Primary destinations:

1. Projects
2. Runs
3. Agents
4. System

The first implementation may use a dependency-free fragment route model:

- `#/projects`
- `#/projects/<projectId>`
- `#/runs`
- `#/runs/<runId>`
- `#/agents`
- `#/system`

Fragment routes avoid adding a router dependency and remain reload-safe on the loopback static server. A future route migration must preserve deep-linkable project and run selection.

## Global application shell

### Purpose

Keep identity, navigation, and connection state stable while screen content changes.

### Layout

Left navigation on desktop:

- DevSpace Control Center identity
- Projects
- Runs
- Agents
- System
- compact dashboard connection status at the bottom

Global top area inside the content region:

- current screen title
- optional one-line status summary
- current-screen primary action
- current-screen secondary actions

### Global status

Show:

- dashboard connection: connected, reconnecting, disconnected
- MCP service: available or unavailable
- count of active and blocked runs

Do not display full public URLs, credentials, tokens, or noisy provider details in the global shell. Those belong in System.

### Global behavior

- selected destination remains visible,
- navigation does not discard an unsaved destructive decision silently,
- reconnect banner appears only when dashboard data is stale or unavailable,
- global connection recovery does not fake successful mutations,
- screen selection is reflected in the URL fragment.

## Screen 1: Projects

### Primary user question

Which repositories are registered, available, safe to use, and currently active?

### Page header

Title: `Projects`

Summary:

- total registered,
- unavailable count,
- active workspace/run count when available.

Primary action: `Add project`

Secondary actions:

- `Scan allowed roots`
- `Refresh`

### Main layout

Desktop split view:

```text
+------------------------------------------------+---------------------------+
| Search / filters / project table               | Project inspector         |
|                                                |                           |
| name | branch | state | preset | mode | runs   | identity                  |
| ...                                            | workspace defaults        |
|                                                | recent work               |
|                                                | edit / forget             |
+------------------------------------------------+---------------------------+
```

The inspector is hidden until a project is selected. At compact widths it becomes a drawer.

### Project table columns

Required:

- project name and slug,
- canonical path as secondary monospace text,
- availability,
- Git branch and dirty count when known,
- permission preset,
- default mode,
- active run count,
- last opened,
- row actions.

Optional columns may move into the inspector below 1280px, but availability, preset, and mode must remain visible.

### Sorting and filtering

Default ordering:

1. pinned projects,
2. projects with active/blocked runs,
3. available projects,
4. unavailable projects,
5. most recently opened.

Filters:

- availability,
- permission preset,
- default mode,
- active work,
- allowed root.

Search matches name, slug, and visible path.

### Row actions

- `Open checkout`
- `Open worktree`
- `Edit`
- overflow for secondary actions

`Forget` remains separated as destructive and is not the first row action.

The local dashboard may present open instructions or invoke an existing local action only when a real supported path exists. It must not pretend to control the remote ChatGPT host.

### Project inspector

Sections:

1. Identity
   - stable ID
   - slug
   - canonical path
   - source
   - availability and reason
2. Defaults
   - permission preset
   - default checkout/worktree mode
   - pinned state
3. Repository
   - branch
   - dirty count
   - source root/worktree relationship when known
4. Activity
   - active workspaces
   - active and recent runs
   - recent local-agent sessions
5. Actions
   - edit project
   - copy ID/path
   - forget project

### Add project drawer

Tabs or clearly separated sections:

- Scan roots
- Choose folder
- Manual path

Scan results are grouped by allowed root and support multi-select import.

Each candidate shows:

- repository name,
- canonical path,
- Git marker,
- already registered state,
- validation failure when not importable.

Partial scans show the exact limit reason and retain discovered candidates.

### Edit project drawer

Editable:

- display name,
- slug,
- permission preset,
- default mode,
- pinned state.

Read-only:

- project ID,
- canonical path,
- current allowed-root relationship.

Save waits for server confirmation. Field-level errors remain next to the affected field.

### Forget confirmation

Required copy:

`Remove this project from DevSpace? Repository files will not be deleted.`

The confirmation names the selected project and path.

### Required states

- loading skeleton with table shape,
- no registered projects,
- no search/filter matches,
- scan in progress,
- partial scan,
- unavailable project,
- stale Git status,
- mutation failure,
- dashboard disconnected.

### Acceptance checks

- primary project identity, availability, preset, and mode are visible without opening a dialog,
- project settings can be inspected and changed without reading raw JSON,
- forget cannot be confused with deleting repository files,
- current vertical band/card implementation is replaced by a coherent table-plus-inspector hierarchy,
- keyboard users can search, select, inspect, edit, and confirm actions.

## Screen 2: Project detail

### Primary user question

What is happening in this project, and what will DevSpace allow?

Project detail may be the expanded Projects inspector route rather than a separate duplicated data model.

### Header

Show:

- project name and availability,
- slug and path,
- branch and dirty count,
- permission preset,
- default mode,
- primary open action.

### Sections

- Overview
- Workspaces
- Runs
- Agents
- Policy

The first implementation may render these sections as tabs or one responsive page. Data and actions must remain shared with the Projects screen.

### Policy section

Explain the selected preset in observable terms:

- read/search,
- documentation write,
- source/config write,
- shell,
- local-agent delegation.

Do not expose an editable low-level policy language.

### Empty state

When no workspace or run exists, explain the normal next action without implying a failure.

## Screen 3: Runs list

### Primary user question

What should I follow, act on, review, or leave archived?

### Page header

Title: `Runs`

Summary:

- `NOW`,
- `ACTION`,
- `REVIEW`,
- `ARCHIVE`.

These are derived action queues. Exact run state and assurance remain visible
and authoritative.

Primary action is normally absent because runs begin through actual MCP, process, or local-agent owners. Do not add a generic `New run` button that creates a second execution path.

Secondary action: `Refresh`

### Main layout

Desktop split view:

- left/main: runs table or grouped list,
- right: selected run summary/evidence inspector.

The implemented live-run route presents this as three peer modules—queue rail,
selected stage, and evidence inspector—with an eight-pixel gutter. Summary and
filter modules use the same outer rhythm. Rows keep table alignment rather than
becoming individual cards; explicit state and updated time share the rail's
bottom metadata line.

Selecting a run opens `#/runs/<runId>` without losing list filters.

### Run groups

Default groups:

1. `NOW` — queued or running
2. `ACTION` — blocked, stopping, or failed
3. `REVIEW` — result available, verification pending, or verifying
4. `ARCHIVE` — stopped, verified, and other completed

A flat sortable table is acceptable when grouping would obscure comparison,
but `NOW` and `ACTION` must remain visually prioritized. Queue membership must
be mutually exclusive and derived from the canonical run state.

### Run row fields

- title,
- project/workspace,
- source and run kind,
- state,
- assurance stage,
- next action, current action, or phase,
- elapsed or total duration,
- updated time,
- stop capability indicator.

### Filters

- project,
- source/provider,
- kind,
- state,
- assurance stage,
- time range.

### Required distinctions

The following must not look equivalent:

- `Running`
- `Completed — result available`
- `Verification pending`
- `Verified`
- `Blocked`
- `Failed`
- `Stopped`

### Required states

- no operation history,
- no active runs,
- filtered empty result,
- reconnecting stream,
- snapshot available but live stream disconnected,
- retention-truncated history.

## Screen 4: Live run detail

### Primary user question

What queue is this operation in, what is the next action, and what proof is
still missing?

### Desktop layout

```text
+----------------------+------------------------------------------------------+
| Run/project rail     | Run header                                           |
|                      +------------------------------------------------------+
| Active and recent    | Activity / Terminal / Diff / Output / Evidence       |
| runs                 |                                                      |
+----------------------+------------------------------------------------------+
```

The live stage owns the reclaimed desktop width. Evidence remains a first-class
tab rather than an always-visible duplicate. At narrower widths the run rail
moves below the stage while preserving state markers.

### Run rail

Shows:

- project groups,
- active and blocked runs first,
- recent completed/failed runs,
- state icon plus explicit label,
- elapsed time for active runs.

Selecting another run changes the stage without changing workspace ownership.

### Run header

Required:

- run title and short ID,
- source/provider/profile/model/thinking when applicable,
- project and workspace,
- checkout/worktree and branch,
- permission preset,
- run state,
- assurance stage,
- action queue plus current phase/action,
- start time and elapsed time,
- follow-live state,
- stop action only when supported.

When applicable, render this exact concept prominently:

`Result available — verification pending`

### Stop action

Label: `Stop active worker`

Confirmation or adjacent explanatory text:

`Stop ends the active worker. It does not revert repository changes.`

Stop is hidden or disabled with a reason when the canonical owner cannot stop.

### Activity tab

Default for runs without a canonical terminal projection.

Event row:

- timestamp,
- semantic event icon/type,
- concise summary,
- expandable safe details.

Behavior:

- preserve order,
- append without stealing focus,
- stop automatic scrolling when the user scrolls away,
- show `Follow live` control,
- group repeated low-value output while preserving event count and sequence range,
- show reconnect and truncation markers inline.

### Terminal tab

Default for process-session and live MCP transport runs.

Required controls:

- follow live,
- wrap,
- search,
- copy selection.

Required behavior:

- read-only,
- safe ANSI rendering,
- stdout/stderr differentiation,
- horizontal scrolling when wrap is off,
- visible output truncation marker,
- no hidden environment or prompt data.

When no canonical process output exists, state that the selected run has no terminal stream rather than showing a fake terminal.

### Diff tab

Implementation note (MWU-06.13): the first accepted slice reads the selected
run workspace's current working tree against HEAD. It is not a historical
per-run snapshot; the UI labels that basis, discloses incomplete untracked
line totals, and lazy-loads only the selected current file patch.

Layout:

- changed-file rail,
- selected file diff,
- additions/removals summary.

Required behavior:

- refresh after real file-change events and run completion,
- lazy-load large diffs,
- reuse existing repository patch/review rendering when possible,
- show unavailable repository state safely,
- distinguish untracked, added, modified, deleted, renamed,
- never trust a provider's textual claim as the diff source.

### Agent output tab

Visible only when the run has local-agent/provider output.

Shows:

- safe streamed messages,
- final response,
- provider/session identity,
- provider error summary,
- result-available timestamp.

It never shows hidden reasoning. The final response is labeled as an agent
result, not verification.

### Web/MCP live terminal

For a live MCP transport run, the Terminal tab defaults open and presents one
chronological stream across the parent MCP run and its child process runs.

Shows only directly observed canonical events:

- registered tool start/completion/failure and timing,
- safe relative read and changed-file paths,
- workspace-open lifecycle,
- child process lifecycle and bounded/redacted output,
- transport completion.

It never fabricates thinking, reconstructs Web ChatGPT reasoning, persists
prompts or arbitrary tool arguments/results, or treats an MCP connection as a
proven ChatGPT task boundary. Child process cards are hidden only while their
parent is present; orphaned runs remain independently visible.

### Evidence tab

Implementation note (MWU-06.13): all five evidence types render even when no
record exists. Missing records are explicit `not_run` gaps; only stored typed
evidence supplies state, origin sequence, timestamp, and result summary.

Evidence items:

- typecheck,
- tests,
- build,
- review,
- Goal/Project State update.

Each item shows:

- state,
- timestamp,
- short result,
- missing requirement,
- originating event or available action.

Overall assurance:

- `Working`
- `Result available`
- `Verification pending`
- `Verifying`
- `Verified`
- `Not applicable`

Only explicit evidence changes these states.

### Context inspector

Sections:

- project/workspace identity,
- source/profile/model,
- branch/mode/preset,
- changed-file totals,
- parent/related runs,
- failure/block reason,
- retention/reconnect state.

### Required failure states

- canonical owner failed,
- provider disconnected,
- process exit non-zero,
- dashboard stream disconnected while work continues,
- repository unavailable,
- event history truncated,
- stop requested but owner did not terminate,
- result available but required evidence missing.

## Screen 5: Agents

### Primary user question

Which providers are usable, and what happened in each local-agent session?

### Header

Title: `Agents`

Summary:

- available provider count,
- running agents,
- idle/result-available agents,
- failed agents.

A start action appears only after GOAL_05 provides a canonical `LocalAgentService` path that the dashboard can reuse without duplication. Until then, the screen is observational.

### Provider strip

Each provider shows:

- name,
- available/unavailable,
- configured profiles count,
- sanitized diagnostic summary when unavailable.

Provider details do not expose command templates, credentials, or environment values.

### Agent sessions table

Columns:

- agent/session ID,
- project/workspace,
- profile/provider,
- model/thinking,
- status,
- assurance/result state,
- updated time,
- linked run.

### Agent inspector

Shows:

- provider session identity,
- start/update/finish times,
- current status,
- safe final response preview,
- linked operation run,
- workspace and project,
- resume/continue capability only when supported by the canonical service.

### Required states

- provider unavailable,
- no configured profiles,
- no sessions,
- running,
- idle with result available,
- failed,
- stale session after restart.

## Screen 6: System

### Primary user question

Is DevSpace healthy, correctly bounded, and ready for local work?

### Sections

#### Service

- MCP local URL,
- public host only with credentials omitted,
- dashboard local URL,
- process uptime,
- version,
- dashboard connection state.

#### Security boundary

- dashboard bound to loopback,
- public admin routes absent/unknown status,
- dashboard session state,
- concise warning that project mutations are local only.

#### Allowed roots

- configured roots,
- current availability,
- scan limits summary.

Changing root configuration remains in the established config workflow unless a safe existing mutation contract is implemented. Do not silently add a new root-management owner.

#### Providers

- provider availability,
- configured profiles,
- sanitized diagnostics.

#### Storage and retention

- database path in safe local form,
- schema/migration version,
- operation history retention summary,
- truncation/cleanup status.

#### Diagnostics

- refresh diagnostics,
- copy sanitized diagnostic summary,
- open documented troubleshooting guidance.

Never copy tokens, environment values, full paths outside existing path policy, or raw logs by default.

### Required states

- dashboard port conflict/degraded mode,
- database unavailable,
- provider unavailable,
- public boundary unknown,
- retention cleanup warning,
- healthy normal state.

## Shared overlays and transient surfaces

### Command/search

First implementation uses per-screen search. A global command palette is optional and must not be added merely for visual polish.

### Toasts

Allowed for:

- copied ID/path,
- saved setting,
- import complete,
- stop request accepted.

Not allowed as the only presentation for errors requiring user action.

### Global banners

Reserved for:

- dashboard disconnected,
- dashboard running in degraded observability mode,
- local admin security boundary failure,
- database migration/startup failure.

### Confirmation dialogs

Required for:

- forget project,
- stop active worker when repository changes may exist,
- other explicit destructive local mutation.

## Loading strategy

- shell renders immediately,
- each screen owns its loading state,
- use shaped skeletons for tables and inspectors,
- do not block Projects because Agents failed to load,
- do not blank an existing run snapshot during SSE reconnect,
- retain stale data with a visible stale/reconnecting label until refreshed.

## Error strategy

Errors are scoped to the smallest responsible area.

Examples:

- project mutation error stays in the drawer/row,
- one provider failure stays in the provider strip,
- one run stream failure stays in the run detail,
- dashboard-wide authentication or connection failure uses a global banner.

Every error states:

- what failed,
- whether underlying work continues,
- what the user can safely do next.

## Empty-state strategy

Empty states answer why the area is empty and show one relevant action.

Examples:

- Projects: `No projects registered` plus `Add project`
- Runs: `No operation history yet` and explanation that real MCP/process/agent work appears automatically
- Agents: `No local-agent sessions` and provider status
- Diff: `No repository changes detected for this run`
- Evidence: `No verification evidence recorded`

Do not use giant illustrations or celebratory marketing copy.

## Responsive and keyboard behavior

- all primary actions remain reachable without hover,
- table selection and inspector access work by keyboard,
- tabs follow ARIA keyboard patterns,
- dialogs and drawers restore focus,
- run live updates do not steal focus,
- terminal and diff support horizontal scrolling,
- evidence inspector collapses before essential center content,
- compact layouts retain explicit state labels.

## Data ownership map

| Screen data/action | Canonical owner |
|---|---|
| project identity/settings | `ProjectRegistry` / `ProjectStore` |
| workspace identity/mode | `WorkspaceRegistry` |
| policy effect | `ProjectPolicyGuard` |
| process execution/output/stop | `ProcessSessionManager` |
| local-agent execution/status | `LocalAgentService` / existing store/adapters |
| operation projection | `OperationRunService` / event store/projector |
| repository diff | existing Git/change-review path |
| verification | actual commands/review/Project State |
| dashboard auth/mutation boundary | admin server |

The UI never becomes the canonical owner of these states.

## Screen acceptance matrix

| Screen | Must answer | Blocking failure examples |
|---|---|---|
| Projects | What can I open and under which policy/mode? | preset hidden, unavailable state unclear, forget implies deletion |
| Project detail | What is active and allowed in this project? | duplicated conflicting project data, policy effect unexplained |
| Runs | What needs attention now? | active/blocked buried, result shown as verified |
| Live run | What is happening, what changed, what proof is missing? | fake progress, hidden failure, no reconnect, unsafe output |
| Agents | Which providers/sessions are usable? | provider secrets shown, agent result treated as verified |
| System | Is the local boundary and service healthy? | tokens/public admin routes exposed, diagnostics unactionable |

## Implementation sequence constraint

Do not attempt a one-pass visual rewrite of every screen.

The selected Goal must build the shared shell and tokens first, then migrate one complete screen or operational slice at a time. Each Micro Work Unit must leave the existing dashboard usable, update HANDOFF and Project State, and include focused visual/behavioral evidence.
