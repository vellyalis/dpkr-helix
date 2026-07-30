# Requirements

Requirement IDs are stable. Tests, implementation goals, and completion evidence must reference them.

## Functional requirements

### Project registry

- **FR-REG-001** Persist registered projects in the existing DevSpace SQLite state database.
- **FR-REG-002** Each project has a stable opaque ID, unique slug, display name, canonical root path, canonical path key, permission preset, default workspace mode, pinned flag, source, timestamps, and optional last-opened time.
- **FR-REG-003** Registration validates that the target exists, is a directory, resolves to a real path, and is inside an existing configured allowed root.
- **FR-REG-004** Duplicate registration by canonical path is idempotent and must not create a second project.
- **FR-REG-005** Windows path comparison is case-insensitive after canonicalization.
- **FR-REG-006** Renaming a display name does not change project ID or root.
- **FR-REG-007** Forgetting a project removes registry metadata only.
- **FR-REG-008** Project records survive process restart.
- **FR-REG-009** Existing registered records whose path is missing or no longer allowed are reported as unavailable, not silently deleted.
- **FR-REG-010** Existing workspace sessions may store the associated project ID without making the association mandatory for legacy sessions.

### Repository discovery

- **FR-DISC-001** The dashboard can scan configured allowed roots for Git repositories.
- **FR-DISC-002** Scanning never follows directory symlinks/reparse points outside the scanned tree.
- **FR-DISC-003** Scanning is bounded by maximum depth, directory count, time, and concurrency.
- **FR-DISC-004** Scanning skips known heavy internal directories such as `.git`, `node_modules`, `dist`, `build`, `target`, `.cache`, and DevSpace-managed worktree storage.
- **FR-DISC-005** Discovery returns candidates before persistence; the user chooses which candidates to import.
- **FR-DISC-006** Manual path registration remains available for non-Git project folders.
- **FR-DISC-007** A Windows native directory picker may be used as a convenience but is not required for core registration.
- **FR-DISC-008** Picker cancellation is not an error. Unsupported platforms display a manual-path fallback.

### Local dashboard

- **FR-UI-001** DevSpace starts an optional local administration listener in the same process, bound to `127.0.0.1` by default and a port distinct from the public MCP listener.
- **FR-UI-002** The local listener serves a React/Vite dashboard and JSON APIs.
- **FR-UI-003** The dashboard lists allowed roots, registered projects, availability, permission preset, default mode, last-opened time, and basic Git metadata when requested.
- **FR-UI-004** The dashboard can scan roots, import candidates, register a manual path, rename a project, change preset/default mode/pinned state, and forget a project.
- **FR-UI-005** The dashboard shows DevSpace/MCP health and local-agent provider availability.
- **FR-UI-006** The dashboard shows recent local-agent sessions for a selected project/workspace.
- **FR-UI-007** `devspace dashboard` opens the local dashboard in the default browser.
- **FR-UI-008** If the dashboard listener cannot start, the MCP server still starts and reports a warning unless dashboard operation was explicitly required.
- **FR-UI-009** The dashboard never displays or returns the Owner OAuth password or persisted dashboard bootstrap token.

### MCP project selection

- **FR-MCP-001** Add a read-only `list_projects` MCP tool.
- **FR-MCP-002** Add an `open_project` MCP tool accepting project ID, exact slug, or unambiguous exact display name.
- **FR-MCP-003** Ambiguous names return candidate IDs/slugs and do not guess.
- **FR-MCP-004** `open_project` accepts optional `mode` and `baseRef` with the same worktree semantics as `open_workspace`.
- **FR-MCP-005** `open_project` delegates workspace creation to the existing `WorkspaceRegistry` and returns a compatible superset of `open_workspace` structured content.
- **FR-MCP-006** `open_workspace` remains available and unchanged for unregistered paths.
- **FR-MCP-007** Opening a path matching a registered project attaches that project's policy regardless of whether the caller used `open_project` or `open_workspace`.
- **FR-MCP-008** Server instructions tell capable clients to use `list_projects`/`open_project` for registered-project selection and continue to document the legacy path flow.
- **FR-MCP-009** MCP Apps cards render project lists and project-open results without regressing existing tool cards.
- **FR-MCP-010** Interactive project buttons use `App.callServerTool()` only when the host advertises server-tool support.
- **FR-MCP-011** When direct app tool calls are unavailable, the card provides a `sendMessage` or copyable command fallback rather than failing.

### Project permission policy

- **FR-POL-001** Provide presets `inspect`, `design`, and `develop`.
- **FR-POL-002** `inspect` permits read/search/list only; it denies file modification, artifact writes, shell execution, patch application, and write-capable delegation.
- **FR-POL-003** `design` permits read/search/list and modification only to documentation paths defined by the preset; shell execution and write-capable delegation are denied.
- **FR-POL-004** `develop` preserves current DevSpace workspace write/shell capability and permits `workspace-write` local-agent delegation.
- **FR-POL-005** Policy is stored on the registered project and copied into each opened workspace.
- **FR-POL-006** Every file-write path, patch operation path, artifact destination, shell call, and local-agent start passes a centralized policy guard.
- **FR-POL-007** Patch policy validation occurs before any patch operation is applied.
- **FR-POL-008** Denials identify the operation, project, active preset, and safe way to change the preset locally.
- **FR-POL-009** Remote MCP tools cannot change a project's preset.
- **FR-POL-010** Unregistered legacy paths retain existing behavior to preserve compatibility.
- **FR-POL-011** No preset is marketed as safe against arbitrary shell behavior while shell access is enabled.

### Codex handoff

- **FR-AGT-001** Extract reusable local-agent orchestration from CLI-only code into a service consumed by CLI and MCP.
- **FR-AGT-002** Add `delegate_task`, `get_agent_status`, `list_agents`, and `continue_agent` MCP tools when subagents are enabled.
- **FR-AGT-003** `delegate_task` accepts a structured task envelope: goal, context, relevant files, acceptance criteria, rules, verification, source documents, target profile, model, and thinking level.
- **FR-AGT-004** The service renders the envelope into a deterministic worker prompt and uses existing profile instructions.
- **FR-AGT-005** The default dashboard/ChatGPT suggestion is `codex-implementer`; raw providers and other configured profiles remain supported.
- **FR-AGT-006** Starting or continuing an agent requires explicit tool invocation and produces a visible result card.
- **FR-AGT-007** Provider availability, project policy, workspace scope, and profile validity are checked before a worker starts.
- **FR-AGT-008** Existing provider session IDs are used to resume the same Codex thread.
- **FR-AGT-009** Agent status and final response remain in the existing local-agent state store.
- **FR-AGT-010** Temporary prompt files are permission-restricted and cleaned after the worker consumes them.
- **FR-AGT-011** No chat transcript, OAuth secret, dashboard token, or unrelated user data is persisted in a handoff.
- **FR-AGT-012** After a write-capable agent completes, the user/model can call existing change-review tools against the same workspace.

### Live operations

- **FR-OPS-001** Direct MCP tool invocations, DevSpace-managed process sessions, and configured local-agent sessions create identifiable operation runs linked to their canonical owner.
- **FR-OPS-002** Run state and assurance stage are stored and rendered independently.
- **FR-OPS-003** A local-agent final response sets `result_available` or `verification_pending`; it never sets `verified` by itself.
- **FR-OPS-004** Typed provider-neutral events cover workspace, tool, file, process, agent, verification, review, warning, failure, and Project State activity.
- **FR-OPS-005** Events have a strict per-run sequence and reconnectable cursor.
- **FR-OPS-006** Event count, payload size, terminal chunks, browser queues, and retention are bounded.
- **FR-OPS-007** Event payloads are redacted before browser publication and persistence.
- **FR-OPS-008** Existing tools, `ProcessSessionManager`, `LocalAgentService`, Git/change review, and Project State remain canonical owners; the operation layer does not duplicate execution.
- **FR-OPS-009** The loopback dashboard exposes authenticated run list, run detail, event history, and SSE snapshot/reconnect APIs.
- **FR-OPS-010** Operation read, stream, diff, terminal, agent-output, and stop APIs are absent from the public MCP listener.
- **FR-OPS-011** The dashboard shows current action, elapsed time, safe terminal output, changed files, repository-backed diff, safe agent output, evidence gaps, failure/block reason, and reconnect/truncation state.
- **FR-OPS-012** Typecheck, tests, build, review, and Goal/Project State evidence have independent explicit states.
- **FR-OPS-013** Stop is shown only for a real stoppable canonical owner and routes through its existing cancellation path.
- **FR-OPS-014** Stop does not claim rollback and does not delete or restore changed files automatically.
- **FR-OPS-015** Dashboard/event-store/SSE failure does not fail or restart the underlying MCP tool, process, or agent operation.
- **FR-OPS-016** Persisted running operations are reconciled with canonical owner state after DevSpace restart.

### Control Center UI

- **FR-VIS-001** The loopback dashboard uses one application shell with Projects, Runs, Agents, and System destinations.
- **FR-VIS-002** Projects uses a coherent table/list plus inspector hierarchy and preserves scan, add, edit, preset, mode, pin, and forget functionality.
- **FR-VIS-003** Runs prioritizes active, blocked, stopping, result-available, verification-pending, and failed work above ordinary completed history.
- **FR-VIS-004** Live run provides Activity, Terminal, Diff, Agent output, and Evidence projections when applicable.
- **FR-VIS-005** Agents shows provider availability, configured profile/session state, linked project/workspace/run, and sanitized diagnostics without becoming a second agent owner.
- **FR-VIS-006** System shows local service, security boundary, allowed-root, provider, storage, migration, retention, and sanitized diagnostic state.
- **FR-VIS-007** Active, blocked, failed, stopped, result-available, verification-pending, verifying, and verified states use consistent explicit text, icon, and semantic color roles.
- **FR-VIS-008** The dashboard supports system-default light/dark themes through semantic tokens.
- **FR-VIS-009** Loading, empty, partial, stale, reconnecting, disconnected, blocked, failure, and truncation states are intentionally rendered for every affected screen.
- **FR-VIS-010** Primary project, run, agent, filter, tab, dialog, drawer, and stop flows are keyboard operable with visible focus.
- **FR-VIS-011** Live updates do not steal focus or force-scroll a user who moved away from the latest event; a visible follow-live action restores automatic scrolling.
- **FR-VIS-012** The first implementation uses the existing React/Vite/CSS stack and does not require a new component framework unless a documented complexity receipt proves lower total complexity.

### CLI and configuration

- **FR-CLI-001** Add `devspace dashboard`.
- **FR-CLI-002** `devspace doctor` reports dashboard configuration and reachability without exposing secrets.
- **FR-CLI-003** Configuration supports dashboard enable/disable and dashboard port.
- **FR-CLI-004** Existing configuration files are migrated or defaulted without breaking older installations.
- **FR-CLI-005** `devspace init` creates a separate dashboard bootstrap token when missing.
- **FR-CLI-006** Existing `serve`, `init`, `doctor`, `config`, and `agents` commands retain their current behavior.

### Codex parity and coding quality

- **FR-PAR-001** A versioned parity case manifest compares local Codex and ChatGPT Web plus dpkr helix from the same immutable repository snapshot, task goal, constraints, acceptance criteria, and allowed permissions.
- **FR-PAR-002** The baseline records mandatory task outcome, forbidden changes, verification freshness, user interventions, tool calls, latency, and exact model/profile settings without storing prompts containing secrets or repository contents.
- **FR-PAR-003** A model/profile candidate is adopted only after the parity suite shows no safety or acceptance regression. The initial candidate is `gpt-5.6-sol` at the current reasoning effort; higher effort requires measured hard-task value.
- **FR-PAR-004** Server instructions and tool metadata change one coherent group at a time and are evaluated with direct-use, indirect-use, and should-not-use prompts before adoption.
- **FR-PAR-005** `open_project` and `open_workspace` return optional bounded `repositoryContext` containing Git availability, branch, `HEAD`, dirty-path metadata, truncation state, and root-manifest script names.
- **FR-PAR-006** Repository context is mechanically derived and excludes task inference, verification selection, untracked contents, package script bodies, recent commit messages, remotes, credentials, and environment values.
- **FR-PAR-007** Git or manifest context failure is explicit and does not fail otherwise valid workspace creation.
- **FR-PAR-008** `show_changes` returns a structured model-visible review bundle while preserving existing text and MCP Apps card behavior.
- **FR-PAR-009** The review bundle contains bounded turn changes, current working-tree changes against `HEAD`, a stable current tree fingerprint, explicit truncation, and optional verification evidence for an explicitly supplied same-workspace local-agent ID.
- **FR-PAR-010** Binary, oversized, unavailable, and truncated changes remain explicit; absent patch text never implies no change.
- **FR-PAR-011** Typed process verification records the repository-tree fingerprint observed at canonical process completion without recording command text, output, prompts, or caller-supplied outcomes as evidence.
- **FR-PAR-012** Associated verification is labeled `fresh`, `stale`, `unknown_legacy`, `failed`, `running`, or `missing`; only an exact stored/current fingerprint match can be `fresh`.
- **FR-PAR-013** Codex delegation uses the SDK per-turn JSON output schema to return `completed` or `needs_input`, a bounded report, and exactly one bounded question when input is required.
- **FR-PAR-014** `needs_input` persists through the existing local-agent store, is rendered distinctly, does not produce verification-pending or verified claims, and remains resumable.
- **FR-PAR-015** `continue_agent` clears the prior question, resumes the same provider session ID, and returns the operation to running without creating a second agent identity.
- **FR-PAR-016** `get_agent_status` accepts optional `waitMs` from `0` through `30000`; omission or zero preserves immediate behavior and a positive value uses the existing bounded service wait.
- **FR-PAR-017** Bounded status waiting returns on completion, error, stop, or `needs_input`, and returns the current active state with explicit timeout metadata when the bound expires.
- **FR-PAR-018** Plain MCP hosts receive required parity fields through text and structured content without depending on MCP Apps metadata.

## Non-functional requirements

- **NFR-SEC-001** The admin listener is loopback-only and must not share the tunnel-facing bind address.
- **NFR-SEC-002** Dashboard mutation APIs require a separate local-admin session, strict Host/Origin validation, SameSite cookie, and CSRF token.
- **NFR-SEC-003** The bootstrap token is never placed in query parameters or logs; a URL fragment may be used for initial browser transfer and must be cleared immediately.
- **NFR-SEC-004** Remote MCP OAuth and local dashboard authentication remain separate.
- **NFR-SEC-005** Discovery, registration, and open operations revalidate the path against current allowed roots at execution time.
- **NFR-SEC-006** No API accepts an arbitrary executable or script for native folder selection.
- **NFR-COMP-001** Existing MCP tool schemas and output behavior remain backward compatible.
- **NFR-COMP-002** Plain MCP hosts that ignore MCP Apps metadata still receive useful text and structured content.
- **NFR-REL-001** Database migrations are append-only, transactional, and idempotent.
- **NFR-REL-002** Dashboard failure must not corrupt project state or prevent MCP shutdown.
- **NFR-REL-003** Repository discovery is cancellable or bounded and cannot block the server event loop indefinitely.
- **NFR-REL-004** Operation event publication, persistence, projection, and browser delivery are failure-isolated from the underlying canonical work.
- **NFR-REL-005** SSE reconnect and process restart reconciliation do not repeat side effects.
- **NFR-REL-006** Slow consumers are bounded and may be disconnected with a recoverable cursor.
- **NFR-PERF-001** `list_projects` does not run full Git status for every project synchronously.
- **NFR-PERF-002** Typical registry listing of 100 projects completes from SQLite without filesystem traversal.
- **NFR-PERF-003** Sustained process/provider output remains within configured memory, event, payload, and retention bounds and does not make the dashboard or MCP server unresponsive.
- **NFR-PERF-004** Large diff and historical event details are lazy-loaded or paged rather than eagerly embedded in every run snapshot.
- **NFR-UX-001** Normal project selection requires project name/slug, not an absolute path.
- **NFR-UX-002** Destructive-looking actions distinguish “forget registry entry” from filesystem deletion.
- **NFR-UX-003** Permission preset and workspace mode are visible before open/delegation actions.
- **NFR-UX-004** `Result available — verification pending` is visibly and semantically distinct from `Verified`.
- **NFR-UX-005** Color is never the only carrier of operational state.
- **NFR-UX-006** Dense desktop layouts remain scannable at 1280px and degrade intentionally at compact widths.
- **NFR-A11Y-001** The local dashboard targets WCAG 2.2 AA, visible focus, semantic landmarks/headings, labeled controls, and correct dialog/tab keyboard behavior.
- **NFR-A11Y-002** The dashboard honors `prefers-reduced-motion` and does not use fake progress or continuously decorative motion.
- **NFR-SEC-007** Operation streams, event stores, terminal/diff/agent output, fixtures, and screenshots exclude hidden reasoning, prompts, chat transcripts, secrets, raw environment values, and unnecessary file contents.
- **NFR-TEST-001** New domain logic is dependency-injected enough to test without starting real tunnels, opening real browser dialogs, or invoking real Codex.
- **NFR-TEST-002** Real Codex streamed output and supported Windows process-tree stop are manual acceptance surfaces in addition to fake-adapter automated coverage.
- **NFR-MAINT-001** New modules follow existing TypeScript conventions and do not turn `src/server.ts` or `src/cli.ts` into larger monoliths.
- **NFR-MAINT-002** Dashboard and MCP App surfaces may share pure helpers/tokens but must not be forced into one component tree when host constraints differ.
- **NFR-PAR-001** GOAL_08 adds no runtime dependency, service, daemon, store, queue, event bus, configuration UI, or policy language.
- **NFR-PAR-002** Repository context lists at most 200 dirty paths and 100 root-manifest script names, with explicit totals and truncation.
- **NFR-PAR-003** Model-visible patch text is UTF-8 bounded to 128 KiB and discloses truncation independently from the existing UI patch bound.
- **NFR-PAR-004** Repository fingerprints use an isolated temporary Git index and do not mutate the user index, checkout, branch, `HEAD`, or tracked files.
- **NFR-PAR-005** Context, review, evidence, structured-outcome, and wait failures are isolated from workspace creation, mutation, process execution, and provider completion.
- **NFR-PAR-006** New schema fields are additive, transactional, idempotent, nullable for legacy rows, and never manufacture structured outcomes or fresh evidence.
- **NFR-PAR-007** Policy and same-workspace checks precede new agent lookup, evidence exposure, or review-checkpoint mutation.
- **NFR-PAR-008** Prompt and tool-catalog size remains measured; GOAL_08 instructions are not duplicated merely for discoverability.
- **NFR-PAR-009** Callers omitting new optional inputs retain existing open, status, continuation, and `show_changes` behavior except for additive structured fields.
- **NFR-PAR-010** Lower calls, tokens, latency, or cost count as improvements only when mandatory quality and safety gates still pass.
