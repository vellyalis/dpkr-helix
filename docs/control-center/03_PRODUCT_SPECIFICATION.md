# Product Specification

## Product name

DevSpace Control Center

This is a feature set inside DevSpace, not a separate application.

## Surfaces

### Local dashboard

Default local URL:

```text
http://127.0.0.1:<dashboardPort>/
```

The dashboard is opened by:

```bash
devspace dashboard
```

The dashboard is for local administration only. It is not a public MCP page and must not be routed through the tunnel.

### ChatGPT MCP App cards

The existing `ui://devspace/workspace-app.html` resource gains card variants for:

- registered project list,
- project opened,
- agent delegated,
- agent status/list.

Plain MCP clients still receive text and structured content.

### CLI

The CLI retains all current commands and adds `dashboard`.

## Dashboard information architecture

### Header

- DevSpace running/stopped state
- MCP local URL
- public base URL host only, with credentials omitted
- dashboard local URL
- provider availability summary
- refresh action

### Projects view

Each project row/card displays:

- display name
- slug
- canonical path
- available/missing/not-allowed state
- Git branch and dirty count when status has been requested
- permission preset
- default workspace mode
- pinned state
- last opened
- actions: Open instructions, Edit, Forget

Primary actions:

- Scan allowed roots
- Add project path
- Choose folder, when native picker is supported
- Import selected candidates

### Project edit dialog

Editable:

- display name
- slug, with uniqueness validation
- permission preset
- default workspace mode
- pinned state

Read-only:

- stable project ID
- canonical root path
- current allowed-root relationship

“Forget project” uses explicit copy:

> Remove this project from DevSpace? Repository files will not be deleted.

### Discovery view

Displays scan progress and candidates grouped by allowed root.

A candidate includes:

- repository folder name
- canonical path
- whether it is already registered
- inferred slug
- Git repository marker type
- selection checkbox

Scan limits and partial-result warnings are visible.

### Agents view

For a selected project:

- agent ID
- profile/provider/model/thinking
- status
- created/updated time
- latest response preview
- open status details

Starting a new agent from the local dashboard is optional until GOAL_05 exposes one canonical `LocalAgentService` start path. ChatGPT MCP delegation is the required first start path. The dashboard must at least display sessions and must never create a duplicate agent runtime.

### Refined Control Center information architecture

The completed local dashboard uses one application shell with Projects, Runs, Agents, and System destinations.

- Projects owns project discovery, registration, availability, preset, mode, and project activity presentation.
- Runs presents the live operational projection defined in `11_LIVE_OPERATIONS_DASHBOARD.md`.
- Agents presents configured provider and local-agent session state from the canonical service/store.
- System presents local service, security boundary, allowed-root, storage, retention, and sanitized diagnostic state.

The detailed visual roles, components, density, theme, interaction, and accessibility requirements are defined in `12_UI_VISUAL_DESIGN_SYSTEM.md`.

The screen layouts, required fields/actions, empty/loading/error/disconnected states, and acceptance matrix are defined in `13_UI_SCREEN_SPECIFICATIONS.md`.

Where those documents refine this earlier dashboard section, they supersede only the live-operation and UI presentation details. Existing project, security, MCP, workspace, policy, and agent ownership remains unchanged.

## ChatGPT flows

### Flow A: list and select project

User:

> Show my DevSpace projects.

Expected model action:

1. call `list_projects`,
2. present the returned card,
3. select by exact project ID/slug,
4. call `open_project`,
5. reuse returned `workspaceId`.

The user can also click an Open button when the host supports MCP Apps server-tool calls.

### Flow B: ambiguous project name

If two projects share a display name:

- `open_project` returns an ambiguity error,
- result includes matching ID, slug, and path,
- no project is opened.

### Flow C: open in worktree

User:

> Open Aelyris in an isolated worktree based on main.

Call:

```json
{
  "project": "aelyris",
  "mode": "worktree",
  "baseRef": "main"
}
```

The response includes existing worktree metadata and project metadata.

### Flow D: design-only session

A project is configured as `design`.

- Markdown/document paths allowed by the preset can be changed.
- Source-code writes, shell execution, artifact downloads into disallowed paths, and write-capable agent delegation are denied.
- The denial tells the user to change the preset through the local dashboard.

### Flow E: delegate implementation to Codex

User:

> Hand Goal 3 to local Codex.

The model must first have an open workspace. It calls `delegate_task` with a structured envelope, for example:

```json
{
  "workspaceId": "ws_...",
  "target": "codex-implementer",
  "goal": "Implement GOAL_03_MCP_PROJECT_SELECTION.md",
  "context": "Use the Control Center design package and preserve open_workspace compatibility.",
  "relevantFiles": [
    "src/server.ts",
    "src/workspaces.ts",
    "src/ui/card-types.ts",
    "src/ui/workspace-app.tsx"
  ],
  "acceptanceCriteria": [
    "list_projects and open_project schemas match the specification",
    "existing UI cards still render",
    "typecheck, tests, and build pass"
  ],
  "rules": [
    "Do not modify unrelated modules",
    "Do not push"
  ],
  "verification": [
    "npm run typecheck",
    "npm test",
    "npm run build"
  ],
  "sourceDocuments": [
    "docs/control-center/goals/GOAL_03_MCP_PROJECT_SELECTION.md"
  ]
}
```

The tool returns an agent ID and visible status. No delegation occurs merely because a project was opened.

### Flow F: retrieve and review

The model calls `get_agent_status`. When idle:

- final response is shown,
- the model inspects the repository,
- runs required verification or explains why not,
- calls `show_changes` if configured,
- does not claim agent output is verified until it has checked evidence.

## Project presets

### Inspect

Use for analysis and repository reading.

- read/search/list: allowed
- file writes/edits/patch: denied
- artifact destination writes: denied
- shell: denied
- local agent: read-only only; first release may deny all delegation instead of exposing a misleading read-only profile

### Design

Use for requirements, plans, ADRs, and documentation.

- read/search/list: allowed
- documentation writes: allowed
- source and arbitrary config writes: denied
- shell: denied
- write-capable local agent: denied

Default documentation scope:

- files under `docs/`
- root-level Markdown files
- files under `.devspace/` intended for project state
- no `.env`, key, credential, or generated binary paths

### Develop

Equivalent to current DevSpace power within an opened workspace, subject to existing root and workspace protections.

- read/search/list: allowed
- file writes/patch/artifact: allowed inside workspace
- shell: allowed
- local agent write mode: `workspace-write`
- `danger-full-access` is not the default and is not enabled by this preset

## Error behavior

Errors are actionable and safe:

- missing project: list closest slugs, no path guessing
- unavailable path: identify missing/not-allowed state
- duplicate registration: return existing project record
- scan limit reached: return partial candidates and limit reason
- dashboard auth failure: generic unauthorized response, no token detail
- picker unsupported: return capability state, not stack trace
- policy denied: name operation and preset
- provider unavailable: report configured profile and provider diagnostic
- dashboard port conflict: MCP remains available and CLI prints recovery command
