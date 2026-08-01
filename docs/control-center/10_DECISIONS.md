# Architecture Decisions

## ADR-001 — Extend DevSpace, do not create a browser extension

**Status:** Accepted

**Decision:** Implement project UI, project tools, and Codex handoff inside the cloned DevSpace repository.

**Why:** DevSpace already owns MCP, OAuth, workspace access, React/Vite tool cards, SQLite, worktrees, and local-agent adapters. A browser extension would add DOM coupling, Native Messaging, duplicate authentication, and another update surface.

**Reconsider when:** The target MCP host permanently lacks MCP Apps and cannot support a usable model-driven project picker.

## ADR-002 — Use a second loopback-only admin listener

**Status:** Accepted

**Decision:** Serve dashboard/admin APIs from a distinct Express listener bound to `127.0.0.1`, in the same process.

**Why:** Adding admin routes to the tunnel-facing listener risks public exposure. IP checks do not reliably distinguish tunnel traffic.

**Rejected:** `/dashboard` on existing public app; separate daemon.

**Reconsider when:** DevSpace adopts a proven multiplexed listener with cryptographically isolated local-only routes.

## ADR-003 — Persist projects in SQLite

**Status:** Accepted

**Decision:** Add a registered-project table to the existing state database.

**Why:** Stable IDs, unique canonical paths, presets, ordering, and timestamps are relational state. Reusing workspace-session history would conflate transient sessions with user-owned project identity.

**Rejected:** `projects.json`, deriving from recent sessions only.

## ADR-004 — No global active project

**Status:** Accepted

**Decision:** `open_project` returns a workspace ID. Subsequent operations remain workspace-scoped.

**Why:** A process-global active project would cause collisions between MCP sessions, parallel worktrees, and agents.

## ADR-005 — Registered policy follows canonical path

**Status:** Accepted

**Decision:** `WorkspaceRegistry` attaches a registered project's current policy even when the caller uses legacy `open_workspace`.

**Why:** Otherwise policy can be bypassed by replacing project ID with the known path.

## ADR-006 — Keep registry mutation local

**Status:** Accepted

**Decision:** Remote MCP exposes list/open only. Register/update/forget/preset changes are local dashboard actions.

**Why:** Project administration changes the local trust boundary and should not be available to remote model prompts.

## ADR-007 — Deny shell in inspect/design

**Status:** Accepted

**Decision:** Do not attempt command-string classification. Shell is denied in inspect/design and allowed in develop with clear warning.

**Why:** Arbitrary shell cannot be reliably made read-only.

## ADR-008 — Reuse and extract local-agent orchestration

**Status:** Accepted

**Decision:** Move reusable CLI behavior into `LocalAgentService`; MCP and CLI use it.

**Why:** Existing Codex SDK and session persistence are already correct ownership points. Duplicating worker logic would create divergent behavior.

## ADR-009 — Structured handoff, no chat transcript dump

**Status:** Accepted

**Decision:** `delegate_task` accepts a typed envelope and renders a deterministic prompt.

**Why:** It creates a smaller, auditable contract and avoids leaking unrelated conversation content.

## ADR-010 — Native folder picker is optional

**Status:** Accepted

**Decision:** Scan/import and manual path are core. A Windows native picker is a convenience behind an adapter.

**Why:** Browser file-system APIs do not reliably provide server-usable absolute paths, and cross-platform native dialogs are environment-dependent.

## ADR-011 — Preserve existing open and tool behavior

**Status:** Accepted

**Decision:** New tools and metadata are additive. Unregistered legacy paths keep current capabilities.

**Why:** DevSpace's existing users and MCP clients must not require registry adoption.

## ADR-012 — Persist session handoffs outside repositories

**Status:** Accepted

**Decision:** DevSpace stores one structured resume handoff per canonical workspace root in the existing SQLite state database. Checkout sessions for the same root resume the same handoff; isolated worktrees keep distinct handoffs and cannot overwrite one another. `open_workspace` returns the current handoff, and explicit `get_handoff` and `update_handoff` MCP tools read and update it. The server and project instructions require timeout-resistant work units and handoff updates after meaningful work units and before completion.

**Why:** Project-local Markdown handoffs would dirty every repository, may be ignored or deleted, and cannot reliably apply to all DevSpace workspaces. A hook can record that a command ran but cannot accurately synthesize semantic progress, verification, risks, and next actions. SQLite preserves continuity without writing user repositories, while explicit structured updates keep the model responsible for the meaning of the handoff.

**Rejected:** Relying only on `AGENTS.md`; automatically generating `.devspace/HANDOFF.md` in every repository; attempting to infer a full handoff from shell/tool history; storing full chat transcripts.

**Reconsider when:** MCP provides a reliable workspace-session lifecycle event carrying a validated structured state envelope, or the Vibe Harness runtime becomes the single persistent state authority for all DevSpace projects.

## ADR-013 — Live Operations is a projection, not a second executor

**Status:** Accepted

**Decision:** Add provider-neutral run/event/evidence projection over existing MCP tools, `ProcessSessionManager`, `LocalAgentService`, Git/change review, and Project State. The dashboard may request a supported stop only through the canonical owner.

**Why:** A second process or agent lifecycle would create duplicate side effects, conflicting state, misleading stop behavior, and an additional recovery surface. The user needs observability, not another runtime.

**Rejected:** Dashboard-owned shell sessions; dashboard-owned provider workers; re-running commands from event history; treating provider final text as verification.

**Reconsider when:** DevSpace intentionally replaces an existing canonical owner through a separately accepted architecture migration with rollback and compatibility proof.

## ADR-014 — One Control Center shell with Projects, Runs, Agents, and System

**Status:** Accepted

**Decision:** Evolve the existing loopback React/Vite dashboard into one coherent application shell. Projects remains the local management surface; Runs becomes the operational surface; Agents and System expose their existing canonical state. MCP App cards remain compact host-embedded results rather than a second full dashboard.

**Why:** Separate dashboards or unrelated page stacks would duplicate navigation, authentication, DTOs, and status meaning. One shell gives the user stable information hierarchy while preserving the existing loopback boundary.

**Rejected:** Separate Live Operations application; Electron/Tauri wrapper; forcing the MCP App card into a full-screen administration UI.

**Reconsider when:** A future host provides a proven first-class full-page MCP Apps surface with equivalent local-only security and no duplicated ownership.

## ADR-015 — Use a restrained dependency-free visual system first

**Status:** Accepted

**Decision:** Implement light/dark semantic tokens, dense desktop layouts, shared primitives, explicit state language, and WCAG 2.2 AA target behavior using the existing React/Vite/CSS stack before considering a component framework.

**Why:** The current UI needs information hierarchy and state clarity more than a dependency. A generic framework would not solve the product-specific distinction between active, result-available, verification-pending, and verified states, and would add migration and bundle cost.

**Rejected:** Decorative AI-style gradients/glassmorphism; oversized marketing cards; a new component library without measured total-complexity reduction.

**Reconsider when:** Repeated implemented components demonstrate a concrete accessibility or maintenance deficit that a specific library can reduce, with a complexity receipt and migration proof.

## ADR-016 — Current repository state wins over force-installed design packages

**Status:** Accepted

**Decision:** Treat external ZIP packages as reference inputs. Never force-copy their implementation prompt, Project State, decisions, implementation plan, or completed Goal evidence over a repository with current progress. Integrate only missing or accepted changes additively after comparison.

**Why:** The v2 package contained useful Live Operations material but would overwrite current GOAL_01-03 progress and still lacked `12_UI_VISUAL_DESIGN_SYSTEM.md`, `13_UI_SCREEN_SPECIFICATIONS.md`, and repository HANDOFF. Force installation could silently roll back the source of truth.

**Rejected:** Running `INSTALL_TO_REPO.ps1` with `-Force` on the current checkout; resetting current design/state to package defaults.

**Reconsider when:** A versioned installer supports ownership markers, three-way migration, conflict reporting, backup/rollback, and explicit compatibility with the target repository state.

## ADR-017 — Portable setup owns installation; browser acceptance helpers are local-only

**Status:** Accepted

**Decision:** Keep `scripts/setup-windows.ps1`, its tests, and `docs/setup-windows.md` as the canonical portable/fresh-PC setup contract. Treat machine-specific Playwright/Edge profile helpers used to unblock GOAL_03 AC-03.11 as local acceptance-recovery utilities only.

**Why:** The portable setup uses an intentionally managed, pinned, loopback-only Playwright MCP configuration and does not migrate an authenticated browser profile. The current-machine recovery helper instead replaces the local `playwright` entry and clones a signed-in Edge profile so the real ChatGPT host can be observed. Both approaches solve different problems and must not silently compete for the same configuration ownership.

**Rules:**

- GOAL_03 may use the local helper only to obtain real-host acceptance evidence.
- The helper is not a distributable credential/profile migration mechanism and must not redefine portable setup behavior.
- GOAL_04 through GOAL_06 preserve the existing portable setup baseline unless their own accepted runtime contract requires a focused change.
- GOAL_07 reconciles the final stable Control Center requirements into the portable installer, tests, and documentation.
- A local acceptance configuration may remain on this machine, but Project State and HANDOFF must identify the divergence explicitly.

**Rejected:** Treating both Playwright configurations as interchangeable; committing hard-coded user paths as the general installer; changing the portable setup during an unrelated Goal.

**Reconsider when:** The portable installer gains an explicit opt-in, secret-safe, tested browser-session bootstrap mode with clear configuration ownership and rollback.

## ADR-018 — Recover dashboard auth without a second session store

**Status:** Accepted

**Decision:** Keep `AdminAuth` as the only dashboard-session owner. A valid
HttpOnly session cookie may recover its per-session CSRF token through
`GET /api/session`. The browser retains the existing dashboard bootstrap token
only in tab-scoped `sessionStorage`, clears it from the URL fragment before any
network wait, and uses it to recreate a lost in-memory session after a local
server restart. An authenticated API request may retry once after a shared
single-flight reauthentication; invalid tokens clear client auth state and are
discarded.

**Why:** The previous UI kept CSRF only in JavaScript memory, so an ordinary
reload appeared disconnected despite a valid cookie, while a server restart
could not recover an already-open tab. Reusing the existing bootstrap and
session contracts restores continuity without persistent browser storage,
SQLite auth sessions, another service, or replaying an unauthenticated request
more than once.

**Security boundary:** Session and bootstrap responses are `no-store`; the
bootstrap token is never returned by the server, written to Project State, or
stored in `localStorage`; Host, Origin, SameSite, HttpOnly, CSRF, and loopback
listener boundaries remain unchanged.

**Reconsider when:** The dashboard authentication owner becomes intentionally
persistent across browser tabs or devices through a separately accepted
security design.

## ADR-019 — Normalize provider events before the operation boundary

**Status:** Accepted

**Decision:** `src/operations/operation-contracts.ts` is the provider-neutral
run, event, evidence, cursor, and run-detail DTO contract. Existing MCP,
process-session, and local-agent owners may emit only the listed safe payload
fields. Provider SDK events remain adapter inputs and are never persisted or
streamed wholesale. The operation contract keeps run state separate from
assurance stage, so `completed + result_available` is valid and is not
`verified`.

Installed SDK reconciliation found distinct event mechanisms: Codex exposes
`runStreamed()` and `ThreadEvent`, Claude exposes an async `SDKMessage` stream,
OpenCode exposes generated event unions/SSE, Pi exposes session subscriptions,
and ACP adapters already receive protocol events. These are evidence that a
provider SDK union would be a leaky and unstable public/storage contract rather
than a reusable owner.

**Ownership seams:**

- one MCP invocation owns one `mcp_tool` run; a generated operation run ID is
  canonical when the host provides no safe invocation ID,
- `ProcessSessionManager` remains the process owner; its in-memory numeric
  session ID is only a source reference and an orphaned active run is reconciled
  after restart,
- `LocalAgentService` and `LocalAgentStore` remain the agent/session owners;
  `LocalAgentRecord.id` is the operation source reference,
- `OperationRunService` will own only operation state, correlation, and
  capability lookup,
- Git, command results, review, and Project State remain the evidence sources.

Local-agent runs are not stoppable today because `LocalAgentService` and its
provider adapters expose no real cancellation seam. GOAL_06 must report that
capability as false until a provider-safe cancellation path is implemented in
the canonical owner; the dashboard must not kill a detached worker by inference.

**Persistence migration plan:** MWU-06.02 adds migration v6 to the existing
SQLite database, with no new database or service:

- `operation_runs` stores the DTO metadata plus retained event count/byte
  accounting,
- `operation_events` stores a global monotonic cursor, strict `(run_id,
  sequence)` uniqueness, typed event metadata, optional bounded payload JSON,
  and payload byte count,
- `operation_evidence` stores one independent evidence state per `(run_id,
  type)`,
- foreign keys cascade operation details from a removed run, while retention
  preserves bounded summaries for retained runs,
- sequence allocation, event insert, run projection update, and retained-byte
  accounting occur in one SQLite immediate transaction,
- restart reconciliation closes active runs whose canonical owner cannot be
  recovered; it never re-executes work.

**Complexity receipt:** Accepted. AC-06.1 through AC-06.8 require durable,
ordered, reconnectable run/event/evidence projection. The existing SQLite owner
and append-only migration mechanism can satisfy it; the current project,
workspace, process, and agent stores cannot represent per-run ordered events or
assurance evidence. The simplest valid alternative is three tables in the
existing database plus one focused store in MWU-06.02. A new dependency,
database, daemon, queue, cache, or provider-specific event store is rejected.
Failure is non-fatal to underlying work; rollback before publication is removal
of the additive migration/code, and later removal requires first retiring the
GOAL_06 operation history contract.

**Rejected:** Persisting raw SDK events or `LocalAgentRunResult.items`; treating
provider final text as evidence; reusing `local_agent_sessions` as an event log;
a second database; a dashboard-owned process/agent lifecycle; speculative
cross-tool task correlation.

**Reconsider when:** A canonical provider-neutral protocol supplies the same
safe semantics for every configured adapter, or an existing DevSpace store
becomes the accepted owner of ordered run history without weakening retention,
reconnect, or assurance separation.

## ADR-020 — Project operation state without owning execution

**Status:** Accepted

**Decision:** `OperationRunService` is the only owner of operation-run
projection transitions over `OperationStore`; it never executes, repeats, or
stops the underlying work. `OperationEventBus` is a synchronous typed
in-process publisher whose subscribers are isolated from one another. A failed
subscriber is reported as a generic projection issue and never turns a
successfully persisted canonical operation event into an underlying-operation
failure. Async subscribers remain outside the synchronous bus contract; a
returned thenable is rejected as a failed delivery and its rejection is
absorbed so it cannot become an unhandled operation failure.

Run state and assurance stage use separate transition matrices. Only an
explicit `verification_evidence` authority may enter `verifying` or `verified`;
`verified` additionally requires persisted passed evidence with no recorded
failed/running/not-run item, and a Goal-linked run requires passed `goal_state`
evidence. An operation owner may report result availability or pending
verification but cannot assert verification. Initial runs may be only `working`
or `not_applicable` for assurance. Terminal run state always disables stop
capability without changing assurance.

Capability lookup receives a typed canonical-owner reference. It fails closed
to `unknown` and non-stoppable, allows stop capability only for currently
available non-terminal `process_session` owners, and reports local-agent and MCP
runs as non-stoppable until their canonical owners expose a real cancellation
seam. Restart reconciliation marks an active run failed only when its owner is
known missing; unknown owner state remains active and has any stale persisted
stop capability cleared.

**Complexity receipt:** Accepted. MWU-06.03 explicitly requires one event bus
and one run service. The existing `OperationStore` remains the persistence
owner, and injected capability lookup remains a plain function. No dependency,
queue, worker, daemon, provider registry, stop implementation, route, or second
lifecycle owner is added. Removal before owner instrumentation is the additive
module/test rollback; later removal requires retiring the GOAL_06 projection
contract first.

**Rejected:** provider-specific buses; asynchronous queues before a browser
stream exists; inferred process or agent cancellation; terminal state implying
verification; reconciliation that re-executes work; subscriber failure escaping
to canonical owners.

**Reconsider when:** A canonical owner gains a tested cancellation contract, or
SSE/browser delivery introduces a measured need for a bounded asynchronous
consumer boundary.

## ADR-021 — Observe canonical process sessions without owning them

**Status:** Accepted

**Decision:** `ProcessSessionManager` remains the sole owner of process spawn,
stdin, resize, interrupt, terminate, exit, buffering, and cleanup. It exposes
one optional synchronous observation port whose calls are exception-isolated
from the canonical lifecycle. A focused `ProcessSessionOperationProjector`
translates those observations into `OperationRunService` calls and never
spawns, writes to, kills, waits for, or restores a process.

Projection starts only after a pipe or PTY has spawned successfully and before
its output/exit callbacks are registered. Commands and environment values are
never persisted. Output is held in one bounded per-session cross-stream
redaction window, emitted promptly at line boundaries, replaced wholesale when
the shared sensitive-content owner detects secret-like data, and capped by
UTF-8 byte length before the existing store applies its event/run retention
limits. Stop intent projects `stopping`; the terminal state uses the observed
exit code/signal plus that intent so a normal exit after an ignored interrupt is
`completed`, an acknowledged forced termination is `stopped`, and an
unrequested signal/nonzero exit is `failed`.

Capability lookup accepts only a typed `process_session` source reference with
workspace ownership and an exact numeric `process:<id>` source ID. It reports
only a live canonical session as available/stoppable, fails malformed
references closed, and lets existing restart reconciliation close missing
owners without re-execution.

**Complexity receipt:** Accepted. MWU-06.04 explicitly requires bounded
process-session instrumentation, while the existing process owner cannot write
provider-neutral durable events without the already accepted run service. The
simplest valid change is one optional observation interface plus one focused
adapter over the existing service/store. No dependency, service, database,
queue, worker, configuration, route, stop implementation, or second lifecycle
owner is added. Projection failure is non-fatal and logged generically.
Rollback before later consumers is removal of the adapter, server wiring, and
optional observation calls; later removal requires retiring the accepted
process-run visibility contract.

**Rejected:** persisting commands or raw unbounded output; separate stdout and
stderr redaction windows; dashboard-owned process control; inferring successful
stop from request intent alone; changing public process tool schemas; adding an
asynchronous queue before SSE requires one.

**Reconsider when:** The canonical process owner gains a different stable event
contract that can satisfy the same ordering, redaction, capability, and
failure-isolation requirements with less total ownership.

## ADR-022 — Project direct MCP calls at the registration boundary

**Status:** Accepted

**Decision:** The existing `McpServer.registerTool` boundary remains the
canonical dispatch path for direct MCP tools. One
`McpToolOperationProjector` decorates current callback registrations and
projects each real invocation into an `mcp_tool` run without owning execution,
retry, cancellation, or result shaping. The original callback is invoked once
and its exact result or exception remains canonical.

Known workspace/project context is resolved from the canonical
`WorkspaceRegistry`; successful `open_workspace` and `open_project` results may
attach newly established context after the owner returns. MCP request IDs are
connection-scoped and therefore are not persisted as source references; the
generated operation run ID identifies each invocation. Inputs, outputs,
exception text, prompts, commands, and environment values are not persisted.
Existing mutation owners attach non-enumerable internal file change metadata
only after successful writes. Generic lifecycle/failure events are emitted
through `OperationRunService`, and every projection failure is isolated from
the tool result.

**Complexity receipt:** Accepted. MWU-06.05 explicitly requires real direct MCP
invocations and existing mutation outcomes to appear in the accepted operation
model. The common registration boundary is the simplest current owner seam and
avoids per-tool lifecycle duplication. One focused adapter and an internal
symbol are added; no dependency, store, queue, worker, daemon, correlation
engine, configuration, route, stop mutation, UI, or second execution owner is
introduced. Rollback before read consumers is removal of the decorator,
metadata attachments, and server wiring.

**Rejected:** persisting tool arguments/results or exception messages; changing
public input/output schemas; assigning one semantic task identity across
unrelated MCP calls; instrumenting each handler with a separate lifecycle;
projecting attempted file changes before canonical mutation succeeds.

**Reconsider when:** The MCP SDK provides a stable server-side invocation
observation hook that preserves the same ordering, context, privacy, and
non-interference guarantees with less local code.

## ADR-023 — Observe local-agent turns across the detached worker boundary

**Status:** Accepted

**Decision:** `LocalAgentService` remains the sole owner of local-agent record
creation, resume, status, provider-session continuity, final response, and
worker execution. It exposes one optional synchronous observation port called
only after canonical store transitions. Provider adapters may emit only known
assistant text through an exception-isolated callback; reasoning, tool payloads,
unknown fields, raw provider events, errors, prompts, and environment values
are never forwarded wholesale.

`LocalAgentOperationProjector` uses the canonical agent ID as `sourceRunId`.
Each initial turn or resume gets a distinct operation run because terminal runs
cannot legally return to running. The detached worker finds the latest turn
through the existing SQLite owner; ties on millisecond timestamps are resolved
by insertion order. Status and safe bounded/redacted assistant text are
projected before a final response records `agent.result_available`, advances
assurance only to `result_available`, and completes the run. Failures are
generic and never persist provider error text.

**Complexity receipt:** Accepted. MWU-06.06 explicitly requires safe streamed
local-agent visibility while the canonical lifecycle crosses a detached worker
process. The simplest complete seam is one observation interface, one focused
projector, and one optional assistant-text callback on the existing runtime
input. Both server and worker reuse the existing operation SQLite owner. No
dependency, new store, queue, daemon, provider event registry, cancellation
owner, route, SSE endpoint, or UI is added. Removing the observation wiring
restores the prior lifecycle without migrating canonical local-agent records.

**Rejected:** persisting `LocalAgentRunResult.items` or raw provider messages;
showing reasoning/tool payloads; treating a provider response as verification;
reopening terminal operation runs; in-memory-only correlation that fails across
the detached worker; changing provider session or final-response ownership.

**Reconsider when:** A provider-neutral streaming contract becomes native to
all configured adapters, or the canonical local-agent owner gains a tested
cancellation/event stream that can replace this port with less code.

## ADR-024 — Reconnect through the durable cursor owner

**Status:** Accepted

**Decision:** Authenticated operation snapshots and SSE live only on the
loopback admin listener. Snapshot cursors are captured before snapshot reads so
concurrent commits replay safely. `Last-Event-ID` takes precedence during
automatic reconnect. The in-process event bus is a low-latency wake-up signal;
every delivery catches up from the existing SQLite global cursor so a detached
worker event cannot be skipped or reordered around a server event.

A bounded one-second read poll discovers commits made by detached workers that
cannot publish on the server's in-process bus. History gaps, oversized catch-up,
and store failure request snapshot rehydration and disconnect. A response
backpressure signal disconnects immediately without an application queue, no
more than sixteen streams are accepted, and admin shutdown closes all streams
and timers.

**Complexity receipt:** Accepted. MWU-06.07 requires cursor reconnect across the
existing detached-worker boundary. The existing SQLite operation store is the
only durable cross-process owner; the existing bus alone cannot observe worker
processes. A bounded per-client timer over that store is the simplest complete
alternative and adds no dependency, service, store, queue, daemon, worker, or
configuration. Failure degrades dashboard observability only. Rollback before
UI consumers is removal of the additive admin routes/store reads and server
wiring.

**Rejected:** direct bus-event delivery that can skip an earlier detached-worker
cursor; an in-memory replay queue; a new cross-process broker; operation routes
on the public MCP listener; stop mutation or UI work in this unit.

**Reconsider when:** The canonical operation owner gains a cross-process
notification primitive that preserves the same durable ordering and bounded
failure behavior with less total machinery.

## ADR-025 — Stop through live canonical capability only

**Status:** Accepted

**Decision:** Stop is an authenticated, CSRF-protected mutation on the loopback
admin listener only. It accepts no caller-selected target fields. A stored run
must resolve to the canonical `mcp` process-session source, the live
`ProcessSessionManager` must advertise it as stoppable, and that manager remains
the sole process-tree signal owner. Local-agent runs remain non-stoppable until
their canonical owner exposes a real cancellation seam.

The operation state must persist `stopping` before signal dispatch. Projection
failure refuses the signal; synchronous signal failure restores the truthful
`running` state. Only the observed process exit selects `stopped`, `failed`, or
`completed`. Requested, completed, and failed audit records contain only the
safe canonical run ID and generic outcome. Stop never claims to revert
repository changes.

**Complexity receipt:** Accepted. MWU-06.08 requires one mutation coordinator
over the existing operation service, process projector, and process-session
owner. No dependency, service, store, queue, worker, policy language, or second
executor was added. Failure either leaves the live process untouched or restores
its projected running state. Rollback before UI consumers is removal of the
additive admin route/coordinator and the focused stop-recovery projection.

**Rejected:** caller-supplied PID, command, provider, or agent identifiers;
stopping non-MCP lookalike references; direct process APIs outside
`ProcessSessionManager`; optimistic terminal state before observed exit; public
MCP stop routes; invented local-agent cancellation; repository rollback.

**Reconsider when:** A canonical non-process owner exposes a tested cancellation
contract with equivalent authorization, recovery, observed-outcome, and audit
semantics.

## ADR-026 — Give truthful live work one elevated visual stage

**Status:** Superseded in visual treatment by ADR-027; truthful-data and ownership decisions retained

**Decision:** The Control Center adopts an operational-cockpit hierarchy rather
than a uniformly flat admin surface. Projects remains the calm, dense
administrative layer. Runs combines its selected run header and Activity feed
into one elevated stage, with the run rail and evidence inspector as quieter
supporting planes. Controlled tonal light, a deep stage shadow, and a separate
live signal accent may reinforce a real selected run or connected event stream;
explicit state and assurance labels remain authoritative. Motion may only
represent retained events, a live operation, reconnect, or another observed
transition.

This takes Scape's strong identity and BridgeSpace's operational depth as
directional references without copying either product's branding, marketing
composition, or desktop metaphor. It preserves DevSpace's differentiator:
truthful local state, ownership, evidence, and recovery.

**Complexity receipt:** Accepted. MWU-06.11 changes the existing visual tokens,
React dashboard modules, and ordinary CSS only. It adds no dependency, service,
store, router, execution path, animation owner, or fabricated data. Rollback is
the removal of the additive Runs view/helpers and the stage-specific token/CSS
changes.

**Rejected:** a marketing hero inside the operational application; a literal
spatial-desktop or terminal-wall clone; uniformly shadowed cards; decorative
background animation; fake activity; a second source of run or evidence truth.

**Reconsider when:** Direct user observation shows that the elevated stage
obscures comparison, reduces information density, or makes disconnected and
active states appear equivalent at the accepted 1440px and 720px viewports.

## ADR-027 — Use modern terminal discipline without terminal cosplay

**Status:** Accepted

**Context:** Direct user observation triggered ADR-026's reconsider condition:
the blue tonal field, glow, large radius, deep shadow, and card stack read as
AI-generated rather than as a refined professional instrument.

**Decision:** Runs becomes a contiguous rectilinear workspace. Thin pane chrome,
compact typography, monospaced time and identifiers, and data-row rhythm carry
the hierarchy. A warm orange edge identifies selection and primary action; a
separate steady green cue reports observed live state. Gradients, glow, the deep
stage shadow, oversized run typography, and continuous live pulsing are removed.
Light mode uses the same newsroom-like structure rather than a separate card
composition.

This borrows the discipline of a modern market-data workspace—fast scanning,
customizable pane logic, restrained chrome—without reproducing Bloomberg
branding, its literal black-and-orange wall, or a retro terminal aesthetic. Real
DevSpace run, event, state, and evidence owners remain unchanged.

**Complexity receipt:** Accepted. The refinement changes the canonical token
source, existing Runs markup/copy, ordinary CSS, and focused visual-contract
tests only. It adds no dependency, service, store, router, configuration,
animation owner, or data path. Rollback is one local visual-refinement commit.

**Rejected:** a literal retro Bloomberg replica because it would become dated
product cosplay; retaining the glowing stage because it failed direct user
observation; an all-table newswire because it weakens selected-run action and
evidence hierarchy.

**Reconsider when:** The contiguous panes reduce scanability, keyboard clarity,
semantic contrast, or first-viewport evidence at 1440px or 720px in either
theme.

## ADR-028 — Present runs as action queues without changing run truth

**Status:** Accepted

**Context:** The professional-terminal treatment improved density and visual
discipline, but the retained-state labels still make the user interpret several
technical states before deciding what to handle next. The desired value is the
action clarity of GTD, not a personal-productivity metaphor pasted onto an
operations console.

**Decision:** Runs derives four mutually exclusive presentation queues from the
canonical run state and assurance stage:

1. `NOW` — queued or running,
2. `ACTION` — blocked, stopping, or failed,
3. `REVIEW` — result available, verification pending, or verifying,
4. `ARCHIVE` — stopped, verified, or otherwise completed.

The top summary, priority rail, selected-run chrome, and next-action region use
the same queue vocabulary and fixed order. Exact state and assurance labels
remain visible and authoritative. When no canonical current action exists, the
UI may show a bounded queue-specific next step such as reviewing retained
evidence; it must not claim that work was executed or verified.

**Goal model:** A user should identify the next run to handle from the first
viewport without translating the internal state machine. Acceptance requires
one mutually exclusive queue per retained run, exact state visibility, the same
queue order in summary and rail, no new execution path, and preserved 1440px and
720px scanability.

**Complexity receipt:** Accepted. One pure derived grouping/action helper,
existing React copy, ordinary CSS, and focused tests are sufficient. No
dependency, store, service, router, persistence field, workflow engine, task
owner, or canonical-state mutation is added.

**Rejected:** Literal GTD `Inbox / Next Actions / Waiting For / Someday` because
the operations domain has no matching inbox or someday owner; a Kanban board
because columns reduce terminal density and weaken selected-run detail; keeping
technical group names because it leaves the action-translation burden with the
user.

**Reconsider when:** A queue hides an exact state, one run can appear in more
than one queue, derived next-action copy becomes misleading, or the action
vocabulary slows incident scanning compared with ADR-027 at the accepted
viewports.

## ADR-029 — Use a financial-data module rhythm without copying the reference product

**Status:** Accepted

**Context:** ADR-027 and ADR-028 made Runs operationally clear, but the first
viewport still gave nearly every separator and compact row the same visual
weight. Direct comparison with Capitol Trades showed that its polish comes from
consistent module boundaries, aligned numeric/time columns, restrained color,
and a clear heading-data-metadata rhythm—not from its logo, content, or charts.

**Decision:** Keep the existing DevSpace shell, mutually exclusive action
queues, canonical state labels, and `rail / stage / evidence` ownership. Refine
only their presentation:

- separate summary, filters, rail, stage, and evidence with an eight-pixel
  module gutter,
- allow a restrained four-pixel outer radius on primary modules while list rows
  remain rectilinear,
- make queue summaries taller and numeric-first,
- align each rail row's explicit state and updated time on one metadata line,
- increase selected-stage and evidence breathing room while preserving dense
  table rules and first-viewport proof.

Orange remains selection/action, green remains live, and semantic
success/warning/danger/info roles remain unchanged. No decorative chart,
marketing navigation, animation, data field, or new component dependency is
introduced.

**Goal model:** The user should scan the screen like a financial information
desk: identify queue magnitude, choose a row, read its next action, and inspect
proof without the chrome competing with the data. Acceptance requires the
existing queue partition and exact labels to remain authoritative, no
horizontal body overflow at 1440px or 720px, a stage-first compact layout, and
coherent light/dark rendering.

**Complexity receipt:** Accepted. One markup alignment and ordinary CSS over
existing owners are sufficient. No store, service, dependency, route, workflow,
chart, or second source of truth is added.

**Rejected:** A literal Capitol Trades clone because its top navigation,
politician/issuer cards, charts, and brand colors do not answer DevSpace's
run/evidence question; a full light editorial redesign because it would discard
the accepted terminal context; rounded cards for every row because they weaken
comparison density and repeat the generic AI-dashboard pattern.

**Reconsider when:** The additional module gutters remove required evidence
from the first viewport, compact mode becomes slower to scan, state/time
alignment truncates authoritative labels, or the reference-derived treatment
reduces DevSpace identity.

## ADR-030 — Stream actual Codex work without reconstructing hidden thought

**Status:** Rejected after user scope clarification; superseded by ADR-031

**Context:** The first MWU-06.12 candidate projected retained terminal output
and final provider messages, but direct user observation found that it did not
answer the central live-operations question: what Codex is doing now. Repository
inspection proved the current Codex adapter calls the buffering SDK `run()`
method even though the installed SDK exposes `runStreamed()` with structured
reasoning-summary, to-do, command, file-change, MCP, web-search,
assistant-message, error, and lifecycle items.

**Decision:** Rejected. This would truthfully show a separately launched local
Codex agent, but the user's actor is Web ChatGPT using DevSpace MCP. It would
therefore answer a different question even if its event stream were accurate.

**Complexity receipt:** Rejected for this requirement because it adds an
unrelated execution path instead of observing the existing MCP boundary.

**Rejected:** animated fake thinking based on elapsed time or run state;
dumping raw SDK events; enabling raw-agent-reasoning display; replacing the
current SDK with a parallel app-server client; persisting prompts, environment,
MCP arguments, or result payloads.

**Reconsider when:** A future requirement explicitly asks DevSpace to launch and
observe a local Codex agent.

## ADR-031 — Aggregate actual Web/MCP activity by transport session

**Status:** Accepted

**Context:** Web ChatGPT invokes DevSpace through Streamable HTTP MCP. DevSpace
can directly observe registered tool invocation, safe tool results, file effects,
and process output, but MCP does not expose the model's private reasoning. The
previous projector created a separate run for every tool call, which fragmented
one visible ChatGPT work stream into many cards.

**Decision:** Reuse the existing `McpSessionRegistry` transport ID as a
server-generated correlation key. The MCP projector creates or reuses one
nonterminal `mcp_tool` operation run per live transport session and appends
actual tool lifecycle, workspace, and safe file events. Process runs remain
owned by the process-session projector and receive the MCP run as `parentRunId`.
The Runs UI hides a child only while its parent is present, then merges parent
and child events by the operation store's global cursor into one terminal-like
live view.

Only registered tool names, bounded safe relative paths already owned by tool
handlers, timestamps, generic failure state, and existing bounded/redacted
process output are eligible. Tool input content, prompt text, command/query
arguments, absolute paths, credentials, environment, tool result payloads, and
private model reasoning are excluded. The surface describes the MCP connection,
not an inferred ChatGPT task boundary.

**Complexity receipt:** Accepted. It extends `McpSessionRegistry`, the MCP and
process projectors, operation store/event bus/SSE, and Runs screen. Node's
`AsyncLocalStorage` supplies concurrency-safe parent correlation without a new
dependency, store, service, worker, or daemon. If correlation is unavailable,
the safe failure mode is an ungrouped process run. Rollback is local removal of
the source key, parent link, and UI aggregation.

**Rejected:** fabricated thinking/state animation; prompt or raw argument
capture; one card per tool as the primary experience; heuristic task grouping
inside a connection; a duplicate monitor/store; launching a local Codex agent.

**Reconsider when:** MCP exposes a first-class safe client task identifier, the
transport lifecycle no longer approximates a useful visible session, or the
operation store stops providing a global cursor.

## ADR-032 — Read current repository Diff on demand and keep Evidence explicit

**Status:** Accepted

**Context:** MWU-06.13 must show repository-backed file operations and patches
without treating provider prose or retained `file.changed` events as repository
truth. It must also expose five evidence classes independently without allowing
an agent final response to become verification. The existing owners are
`WorkspaceRegistry` for the allowed current workspace, Git for repository state,
`OperationStore` for typed evidence, and the authenticated loopback dashboard
for local administration.

**Decision:** Resolve a selected run's current `workspaceId` through
`WorkspaceRegistry`, then read its current Git working tree against HEAD only
when the authenticated loopback dashboard requests it. One summary route lists
added, deleted, modified, renamed, and untracked paths plus available tracked
line totals. A separate selected-file route lazy-loads a bounded textual patch
only for an exact path in that current change set. The UI labels this as current
repository state rather than a historical run snapshot and discloses incomplete
untracked totals.

Evidence remains the five typed `OperationEvidence` records already stored by
the operation owner: typecheck, tests, build, review, and Goal/Project State.
Absent records render as explicit gaps; free-form provider output is never
parsed or promoted.

**Goal model:** The local user can answer “what is actually changed now?” and
“what proof is still missing?” without reading provider claims. Acceptance
requires repository/unavailable/clean/incomplete states, lazy selected patches,
five independent evidence states with origin/timestamp/gap, authenticated
loopback-only access, keyboard-operable tabs, and desktop/compact no-overflow.

**Complexity receipt:** Accepted. A focused stateless repository reader and two
read routes are the simplest complete boundary. They reuse the existing Git
helper, WorkspaceRegistry, OperationStore, React stack, and Pierre renderer.
No dependency, migration, store, service, worker, cache, public MCP schema, or
configuration surface is added. Failure affects only local read presentation;
removal is limited to the reader, routes, API methods, and two tabs.

**Security boundary:** Run and workspace must both exist; the current
WorkspaceRegistry allowlist is revalidated; a file patch requires exact
membership in Git's current changed-file set. Untracked symlinks, binary or
oversized content, traversal, raw Git errors, and unavailable repositories fail
without path or content disclosure. Repository output is sent only through the
existing authenticated loopback admin listener.

**Rejected:** Reconstructing Diff from operation events because events are
bounded observations, not repository truth; persisting per-run patches because
that creates a second owner, sensitive-content retention, migration, and stale
history; parsing provider claims into evidence because prose is not an
independent command, review, or Project State result.

**Reconsider when:** Product requirements demand historical per-run snapshots,
the canonical workspace is no longer a Git worktree, Git reads become too slow
for explicit refresh, or a canonical verification owner supplies richer typed
requirements/actions.

## ADR-033 — Project Agents and System diagnostics from canonical owners

**Status:** Accepted

**Context:** MWU-06.14 must answer which local-agent providers and sessions are
usable and whether the local DevSpace service is healthy and correctly bounded.
The required facts already belong to `LocalAgentStore`, provider/profile
loading, linked `OperationStore` runs, `ServerConfig`, project discovery,
SQLite migrations, operation-retention limits, and the loopback admin listener.
Persisting a second health model or adding root/provider configuration actions
would create conflicting owners and exceed this observational work unit.

**Decision:** Add thin authenticated admin read projections over those existing
owners. Agents derives presentation state from persisted sessions plus the
latest linked canonical operation run, preserves result-versus-verification
distinction, labels restart owner-loss as stale, bounds and redacts response
previews, and exposes no new start/continue mutation. System reports service,
loopback/public-admin boundary, allowed-root availability and discovery bounds,
provider/profile status, safe database/schema details, and operation-retention
status. Copyable diagnostics summarize counts and safe endpoints while omitting
allowed-root paths, credentials, environment values, and raw logs. Existing
troubleshooting documentation remains the guidance owner.

Provider command failures use the fixed provider name rather than a configured
executable value so a path supplied through environment configuration cannot
be reflected into diagnostics. All routes remain on the authenticated
loopback-only admin app; the public MCP listener and tool catalog are unchanged.

**Goal model:** A local user can distinguish provider availability, running,
result-available, failed, and restart-stale agent sessions, then confirm service,
security boundary, roots, storage, and retention health without reading config
files or exposing sensitive diagnostics. Acceptance requires truthful canonical
projection, explicit empty/degraded states, bounded/redacted output, refresh and
copy feedback, authenticated/public route separation, and desktop/compact
layouts without horizontal page overflow.

**Complexity receipt:** Accepted. Focused pure presentation functions, ordinary
React views/CSS, readonly database diagnostics, exported existing constants,
and additive fields on existing authenticated responses are the simplest
complete design. No dependency, service, store, migration, worker, cache,
daemon, configuration owner, public schema, or mutation is added. Failure is
limited to local read presentation; rollback removes the projections, views,
styles, and additive response fields.

**Rejected:** Client-only inference because schema and storage health cannot be
known truthfully from existing browser data; a new diagnostics service/store
because every fact already has a canonical owner; new root/provider management
because the work unit is observational; raw provider commands, environment,
logs, or full unrestricted paths because they are unnecessary and unsafe.

**Reconsider when:** A canonical health service replaces the current owners,
the dashboard gains an approved root/provider mutation contract, provider
availability requires asynchronous monitoring, or product requirements demand
remote diagnostics beyond the loopback trust boundary.

## ADR-034 — Converge dashboard accessibility through existing UI owners

**Status:** Accepted

**Context:** MWU-06.15 directly reproduced five convergence defects in the
production bundle: the compact Agents inspector remained a static off-viewport
panel without modal focus behavior; dense Runs controls fell below the accepted
target size; selected light-theme text/action roles missed WCAG AA contrast;
loading skeletons used continuous decorative gradient motion; and theme
selection was repeated in every page header instead of belonging to System.
Projects already owned a correct compact focus trap, making a copied second
implementation a demonstrated divergence risk.

**Decision:** Move the existing Projects overlay focus trap, compact media
query, and typing-target predicate into one focused dashboard helper used by
Projects and Agents. Keep desktop inspectors non-modal. Extend existing Runs
components with accepted target sizes and `/` terminal-search behavior. Keep
theme state in the existing shell but place its only visible control in System.
Adjust existing semantic tokens to measured contrast-safe values and remove
decorative skeleton gradients rather than adding animation infrastructure.

**Goal model:** Every existing screen must remain keyboard-complete and usable
at 1280px and compact width, with truthful modal focus, visible focus,
contrast-safe semantic roles, 32px/40px targets, explicit light/dark behavior,
and no decorative continuous motion or page overflow.

**Complexity receipt:** Accepted. The current requirement is MWU-06.15 and the
observed failure risk is inaccessible/off-viewport compact interaction. Browser
native focus alone does not trap a modal or restore its opener, while locally
copying the Projects hook already produced divergent Agents behavior. One
dependency-free helper is the simplest complete alternative. React and CSS
remain the owners; there is no runtime, storage, monitoring, security, or
operational cost. Failure is limited to dashboard focus behavior. Rollback or
removal restores the three small local functions to Projects and Agents.

**Rejected:** A focus-management dependency because current React/DOM
primitives are sufficient; a second local Agents hook because divergence is the
reproduced defect; a new theme service/store because the shell already owns
browser theme state; visual exceptions for dense Runs controls because compact
target acceptance is explicit.

**Reconsider when:** Overlay behavior needs nested dialogs, asynchronous focus
handoff, or multiple current call paths with requirements the focused helper
cannot express.

## ADR-035 — Derive local-agent verification from canonical command exits

**Status:** Accepted

**Context:** MWU-06.16 real acceptance exposed a missing production connection:
`LocalAgentOperationProjector` truthfully stopped at `result_available`, and
`OperationRunService` required persisted evidence for `verified`, but no
runtime path recorded that evidence. Tests could insert evidence directly, but
doing so in acceptance would create a second owner and would not prove the
product path. Provider prose, handoff text, dashboard mutation, and shell-string
classification are not acceptable verification sources.

**Decision:** Extend the existing `exec_command` input with one optional typed
association containing a completed local-agent ID and a command-verification
category (`typecheck`, `tests`, or `build`). Resolve the exact canonical agent
and latest operation run before spawn, require the same workspace and
`result_available`/`verification_pending` assurance, and let the existing
`ProcessSessionManager` own execution and exit outcome. One focused
`OperationVerificationProjector` converts the observed start/exit into bounded
typed events, evidence, and legal assurance transitions through the existing
`OperationStore` and `OperationRunService`. The client cannot submit pass/fail;
exit zero without a signal passes, and every other terminal result fails.
Projection failure never changes the command result and attempts to recover
assurance to `verification_pending`.

**Goal model:** A parent MCP client can independently run an explicit check
after a real provider result and show the same run moving from
`Result available — verification pending` through `verifying` to either
`verified` or back to `verification_pending`, without treating provider text as
proof.

**Complexity receipt:** Accepted. AC-06.2, AC-06.3, AC-06.4, AC-06.11, and the
mandatory real Codex scenario require this connection. Existing stores and
owners cannot infer which result a command verifies; direct store mutation,
free-form evidence tools, dashboard mutation, and generic shell classification
all violate accepted boundaries. The selected change adds no dependency,
service, store, migration, route, worker, queue, daemon, or command executor.
Runtime cost is one optional in-memory association per process session plus
existing bounded event/evidence writes. Rollback removes the optional field,
projector, and wiring; ordinary `exec_command` behavior is unchanged.

**Security and failure boundary:** Agent lookup is exact/prefix-resolved by the
canonical local-agent store and then constrained to the same workspace,
completed status, available result, known provider, and eligible operation run.
No command, output, prompt, provider session, environment value, or credential
is persisted as evidence. A missing target, cross-workspace target, unfinished
agent, or ineligible assurance fails before spawn. Projection/store failure is
non-fatal to the command and cannot manufacture a passed result.

**Rejected:** Marking provider completion verified; parsing provider prose;
direct SQLite injection for acceptance; a public evidence mutation endpoint;
dashboard-owned verification; a new verification executor; automatic
association with the newest workspace agent; and classification of arbitrary
shell strings.

**Reconsider when:** A canonical provider-neutral verification result API
supersedes command execution, projects require non-command evidence categories,
or an authenticated host protocol can carry stronger provenance without
changing the process owner.

## ADR-036 — Keep the transitive audit visible until Pi publishes a truthful fix

**Status:** Accepted with residual risk

**Context:** Production audit reports high `GHSA-mh99-v99m-4gvg` in
`brace-expansion@5.0.7` under `@earendil-works/pi-coding-agent@0.82.1`. The
patched release is `5.0.8`, but Pi `0.82.1` and current `0.83.0` both publish
an inner shrinkwrap pinned to `5.0.7`. npm considers overrides only from the
installing root, while Pi's published shrinkwrap dictates its nested tree.

**Decision:** Keep Pi as the canonical coding-primitives owner and keep the
audit finding visible. Accept the current availability residual temporarily.
Upgrade the existing dependency as soon as Pi publishes a release whose
shrinkwrap resolves a patched brace-expansion maintenance version. Reopen this
decision sooner if model/package/glob patterns can cross the current
trusted-operator boundary.

**Evidence and exposure:** A root override did not move the nested version.
An outer publishable shrinkwrap was included in the dpkr helix tarball, but an
empty consumer still installed `5.0.7` and reported the high advisory. A
manual root-lock edit caused `npm audit` to report zero even though clean
`npm ci` installed `5.0.7`; it was reverted as a false security signal. Source
inspection places Pi's minimatch call sites in package-manager and
model-resolver modules. dpkr helix's default find tool uses `fd`, but its
local-agent adapter starts `pi --mode rpc`, forwards the optional
operator-selected model through `--model`, and therefore loads Pi's
model/resource/package paths. This makes the vulnerable dependency reachable;
it does not make it public. The call remains behind authenticated local-agent
authorization, and that client already has scoped shell execution. The current
additional impact is therefore authenticated process availability, not a new
public or privilege boundary.

**Complexity receipt:** No new dependency, fork, vendored binary, install
hook, bundle, service, store, or configuration is added. The current
requirement is honest security adjudication. A private patched Pi fork or
bundled Pi tree would create a second supply-chain owner and ongoing release
burden for one transitive lock entry. Rollback is unnecessary because failed
candidates were removed and dependency metadata remains unchanged.

**Rejected:** Root override because installed-package overrides are ignored;
outer shrinkwrap because the inner Pi shrinkwrap still won in the consumer;
manual lock correction because it produced a false clean audit; vendoring or
forking Pi because it creates an unjustified second owner; hiding or
allowlisting the audit because it destroys the residual-risk signal.

**Reconsider when:** Pi publishes a corrected shrinkwrap, npm gains a verified
consumer-safe mechanism that can override the inner lock without a fork, a
model/package/glob pattern can cross the trusted-operator boundary, or the
service trust boundary allows untrusted clients.

## ADR-037 — Coordinate reusable onboarding with a repo skill and focused recovery owner

**Status:** Accepted

**Context:** MWU-07.20 must make the verified Windows setup reusable on another
PC without copying credentials or pretending that Cloudflare, OpenAI/ChatGPT,
domain, workspace, app-registration, and OAuth decisions are local script
inputs. The existing `setup-windows.ps1` already owns deterministic local
installation, configuration, process identity, verification, and rollback.
The accepted recipient path also needs stable ingress and optional background
recovery without recreating the terminal flash fixed in MWU-07.19.

**Goal model:** A recipient can start from the private repository, preview the
local install, choose temporary or stable ingress with explicit account
ownership, complete ChatGPT developer-mode registration and OAuth without
exposing credentials, install optional no-console recovery, verify the
end-to-end project/read path, and resume a failed boundary without repeating
completed or externally destructive steps.

**Decision:** Keep `setup-windows.ps1` as the only local install/runtime owner.
Add repo-local `onboard-dpkr-helix` under `.agents/skills` to coordinate
interactive account steps, approval boundaries, verification order, and
recovery. Add one focused `setup-windows-recovery.ps1` owner for an optional
limited-current-user Scheduled Task. It delegates restart to the managed setup
script, treats absence of the runtime record as intentional Stop, preserves a
healthy local process during a public-only outage, and enters through
`wscript.exe //B //NoLogo` plus window style `0`.

Use a Cloudflare remotely managed named tunnel with a published application
route as the documented stable default when the user controls a Cloudflare
domain. Keep Quick Tunnel as temporary evaluation only. Keep OpenAI Secure MCP
Tunnel as a separately proven alternative because its transport does not
automatically make the browser-facing authorization server reachable. ChatGPT
app creation/refresh and OAuth approval remain explicit external-account
actions; Owner passwords and tunnel credentials are entered directly by the
user and are never model inputs.

**Responsibility map:** The recipient owns account, domain, hostname, cost,
workspace permission, external creation, and secret entry. Cloudflare owns
stable ingress and its service lifecycle. ChatGPT owns developer-mode
connection state and tool-metadata refresh. DevSpace OAuth owns MCP approval.
The portable installer owns local configuration/processes. The recovery script
owns only its exact task and marked helper files. The repo skill owns ordering,
closed questions, approval pauses, and bounded evidence. Product documentation
owns the human-readable runbook.

**Security and failure boundary:** Plan modes do not mutate local or external
state. Tunnel/DNS/service/app/OAuth changes require user approval. No source
file, task description, test, log, or handoff stores credential values. An
unrecognized same-named task or helper file fails closed. Quick Tunnel cannot
install scheduled recovery because its hostname changes. Public-only outage
does not trigger local restart; intentional Stop remains stable.

**Complexity receipt:** Accepted. One instruction skill and one dependency-free
PowerShell task owner close current distribution and no-focus requirements.
They add no runtime service, store, schema, route, daemon, queue, dependency,
plugin manifest, marketplace, connector, or second DevSpace process owner.
Rollback removes the exact scheduled task/marked helper files and deletes the
repo skill/recovery script. Monitoring is the existing local/public health,
Task Scheduler result, Cloudflared service state, and ChatGPT tool discovery.

**Rejected:** Extending one script to automate every account action because it
would collect secrets and conflate local/external ownership; documentation only
because it cannot enforce approval pauses, resumption, or no-console recovery;
a plugin because the private clone already distributes the single workflow and
a manifest/marketplace/install lifecycle adds no current capability; copying
the machine-local Worker, tunnel IDs, task XML, browser profile, or credentials;
OpenAI Secure MCP Tunnel as an unproven default; automatic recovery for Quick
Tunnel; and direct scheduled `powershell.exe` because console creation can
precede hidden-window handling.

**Reconsider when:** The workflow is distributed independently of the private
repository to a team or universal directory, an official API can perform the
account handoffs without secret exposure or ambiguous external effects, the
OAuth authorization server becomes proven reachable through Secure MCP Tunnel,
or Windows provides a simpler no-console current-user recovery primitive with
equivalent rollback and ownership guarantees.

## ADR-038 — Pursue Codex parity through measured contracts, not new orchestration

**Status:** Accepted

**Context:** The completed dpkr helix baseline already exposes approved local
workspaces, direct file/search/patch/process tools, structured delegation,
provider-thread continuation, operation projection, verification evidence,
review checkpoints, and a local Control Center. The remaining user goal is to
make ChatGPT Web feel at least as useful and accurate as local Codex on frequent
coding work. Candidate gaps include stale profile models, missing compact
repository context, UI-oriented rather than model-oriented final review,
verification without a repository basis fingerprint, unstructured material
questions, and repeated status polling.

**Decision:** Add GOAL_08 as a quality extension after the closed GOAL_07
baseline. First compare local Codex and Web plus helix on identical repository
snapshots and evaluate model/profile/prompt settings without product changes.
Then implement only the remaining measured gaps through existing owners:

- `WorkspaceRegistry` open serialization gains bounded deterministic repository
  context from the current repository-diff owner;
- review checkpoints and `show_changes` gain bounded model-visible structured
  content;
- canonical process-exit evidence gains one nullable isolated-tree
  fingerprint so freshness can be compared;
- `LocalAgentService` and the existing local-agent row gain native
  Codex-SDK-schema `completed | needs_input` result metadata;
- the existing `get_agent_status` tool exposes the service's bounded wait.

The first model candidate is `gpt-5.6-sol` at the current effort. It is not an
automatic upgrade or unconditional default: same-snapshot evidence decides
adoption, and higher effort is limited to cases with measured gain.

**Responsibility and security boundary:** The user retains project, permission,
compute, external-action, and question-answer decisions. ChatGPT remains the
controller and final reviewer. Local Codex remains a scoped executor that
cannot verify itself. Existing policy guards run before side effects or
same-workspace evidence lookup. New context and evidence remain bounded,
redacted, additive, and unavailable rather than guessed on failure.

**Complexity receipt:** Accepted. The design adds no dependency, service,
daemon, queue, event bus, vector store, policy language, browser channel, or
execution owner. One append-only nullable schema extension is justified because
verification freshness cannot be reconstructed reliably from exit timestamps,
file mtimes, or provider prose. The Codex SDK already supplies JSON output
schemas, and `LocalAgentService.waitForStatus()` already supplies bounded
waiting. Rollback removes additive serializer/tool fields and leaves nullable
legacy data ignored; GOAL_01-07 behavior remains usable.

**Rejected:** A reverse local-agent-to-Web wake-up channel; automatic
multi-agent planning; vector/code indexing; a second diff, verification, or
state store; automatic commit/push/merge; unconditional Pro/high/xhigh/max;
prose-marker parsing for `needs_input`; and feature work before a parity
baseline.

**Deferred:** Local-agent cancellation. Codex SDK exposes `AbortSignal`, but
the current detached worker deliberately disconnects after launch. Truthful
cancellation needs durable worker identity, cancellation delivery, restart
reconciliation, and proof of no further writes. Reconsider after a reproduced
runaway-worker incident, a parity case blocked by inability to cancel, or a
separate accepted lifecycle Goal.

**Verification:** P01-P08 in
`goals/GOAL_08_CODEX_PARITY.md`, focused compatibility/security/migration
tests, exact fresh-to-stale evidence transitions, real Codex structured
outcome/continuation, and signed-in normal-Chat acceptance.

**Reconsider when:** The parity baseline shows another global bottleneck;
repository context reduces task success through context load; the provider
removes native structured output; MCP gains a standard server-to-host
notification/turn contract with equivalent ownership and security; or
cancellation becomes a repeated real-task blocker.

## ADR-039: Prepare the existing repository for a one-time clean-root public release

**Date:** 2026-07-31

**Status:** Accepted for local preparation; external cutover deferred

**Context:** The owner wants `dpkr helix` organized so it can be published for
general use later. The current installed path must not move. The tracked tip
contained private-only onboarding copy, a personal endpoint, live operation
identifiers, large mixed State/Handoff records, and an upstream Funding file.
No recognized API key, password, token, or private key was detected, but
publishing the current history unchanged would expose irrelevant
machine-specific operational metadata.

**Decision:** Keep the existing repository as the sole source owner. Make the
current tracked tree public-safe, disable accidental npm publication, retain
upstream MIT attribution in LICENSE/NOTICE, add public Security/Contributing
contracts, and add one dependency-free Node release checker to existing CI.
Immediately before an explicitly approved visibility change, create a verified
private Git bundle, create a parentless commit from the reviewed tree, prove its
reachable history, replace remote `main` with an exact lease, inspect all remote
refs/artifacts, and only then change visibility.

**Responsibility boundary:** The repository owns source, tests, generic
documentation, attribution, policies, and the public release gate. Each local
installation owns credentials, account-specific Cloudflare configuration,
personal endpoint, paths, logs, and runtime IDs. GitHub account visibility,
branch protection, vulnerability reporting, and release publication remain
owner-controlled external actions.

**Alternatives rejected:**

- A permanent public mirror, because it creates a second source of truth and
  recurring synchronization/security work.
- Publishing current history unchanged, because operational metadata would
  remain in the advertised history.
- Manual review alone, because private-only copy and unignored local
  directories already accumulated.
- Publishing under the upstream npm namespace, because the compatibility name
  is not this fork's distribution identity.

**Complexity receipt:** Accepted. `scripts/check-public-release.mjs` uses only
Node and Git, adds no dependency, service, store, daemon, or runtime setting,
and reports locations without echoing matched values. `.gitignore` cannot
detect private text inside otherwise valid tracked files. The checker is owned
by the repository and can be removed if an equivalent repository-native gate
replaces it.

The production audit also found that Pi's own shrinkwrap installs
`brace-expansion@5.0.7`. npm override and a lockfile-only edit were both
rejected after isolated clean-install proof: they could report a fixed graph
while the vulnerable package remained the actual resolved code. The accepted
repair pins `5.0.9` directly, replaces only Pi's exact nested package
atomically during postinstall when needed, verifies the real resolution, and
fails the install if it cannot prove `>=5.0.8`. This adds no new package,
service, or runtime owner. Remove it after a verified Pi release naturally
resolves the patched version.

**Failure and recovery:** A false positive blocks preparation without changing
external state and can be fixed by generalizing the fixture or narrowing a
proven-noise rule. A false negative is mitigated by independent A2 review,
history-mode scanning, package inspection, and clean-clone acceptance. Before
visibility changes, the verified bundle restores the old history. After
visibility changes, public clones cannot be recalled; therefore the visibility
step remains separately approved and intentionally unexecuted by GOAL_09.

**Reconsider when:** GitHub provides a repository-native gate with equivalent
working-tree/history/path coverage, npm becomes an intentional distribution
channel under an owned package identity, or a recognized secret is found in
pre-public history. A real secret invalidates the force-push-only approach and
requires repository recreation or another purge with independent proof.

## ADR-040: Hide Codex review children and preserve local state across tunnel outages

**Date:** 2026-08-01

**Status:** Accepted and locally verified

**Context:** On Windows, a Codex-backed review could create a visible terminal
and steal foreground focus. Separately, the installed legacy recovery helper
restarted DevSpace when either local or public health failed, so a transient
tunnel-only outage could interrupt an otherwise healthy MCP session and make
subsequent file writes unavailable until reconnection.

**Decision:** Keep the existing Codex SDK and patch only its unique compiled
native spawn block during the existing postinstall lifecycle. Require exactly
one `windowsHide: true` option and fail closed on duplicate or unknown shapes.
Keep the existing setup/runtime record as the sole DevSpace owner. Recovery
restarts only when local health fails; public-only failure preserves the local
process and leaves tunnel recovery to the existing Windows service owner.
Managed recovery helper files roll back if task registration fails.

**Alternatives rejected:** A Codex SDK fork, because it creates a second
dependency owner; a new watchdog/service, because the existing task and Windows
service own the required lifecycles; broad retries, because they hide disconnect
mechanisms; and restarting local DevSpace for tunnel-only failure, because it
destroys healthy session continuity.

**Complexity receipt:** Accepted. One dependency-free install repair extends the
existing postinstall/audit pattern, and one rollback path strengthens the
existing recovery script. No dependency, daemon, service, store, queue, cache,
configuration surface, or permission expansion is added.

**Failure and recovery:** An SDK layout change blocks install/audit rather than
silently regressing focus behavior. Revert the scoped patch and reinstall the
prior package to roll back. Recovery task registration failure restores prior
managed helper contents. A constrained installation may reuse an already-owned
limited-user no-console task by pointing its user-owned helper at the canonical
recovery script; no task deletion or privilege increase is required.

**Reconsider when:** The upstream Codex SDK exposes or guarantees an equivalent
Windows spawn option, the existing task can be replaced under normal user
permissions, or fresh evidence identifies a different connection-interruption
mechanism.

## ADR-041: Preserve recovery intent and serialize Windows lifecycle operations

**Date:** 2026-08-01

**Status:** Accepted and locally verified

**Context:** Runtime-record absence previously meant both intentional Stop and a
failed Start. A failed recovery attempt could therefore remove its own retry
eligibility. Recovery also evaluated public health before repairing a failed
local service, trusted one local probe, and could race a manual lifecycle
operation. Start always replaced a healthy process, invalidating live MCP
sessions, and restart deleted the prior failure log.

**Decision:** Persist `running` or `stopped` intent in the existing bootstrap
settings, with runtime-record inference for legacy settings. Confirm local
failure twice with short probes and defer public probing until local health is
available. Serialize Start, Stop, and Install with a current-session named
mutex; recovery skips an active operation and its Start rechecks intent after
lock acquisition. Reuse a matching healthy managed runtime, force replacement
only from Install, and retain one previous log generation.

**Alternatives rejected:** Shorter polling, generic file-write retries,
workspace probe writes, persistent MCP-transport recreation, a second watchdog,
and privilege elevation. They add user-visible latency, background activity,
content mutation, protocol risk, another lifecycle owner, or approval friction
without evidence that they address the observed failure boundary.

**Complexity receipt:** Accepted at existing-mechanism adaptation. One field is
added to the existing bootstrap owner, one current-session named mutex
serializes the existing commands, and bounded log rotation uses the existing
log directory. No dependency, service, daemon, worker, store, UI, prompt,
notification, or monitoring interval is added.

**Failure and recovery:** An abandoned mutex is acquired safely by the next
operation. A persistent Start failure keeps `running` intent for another
scheduled attempt; an explicit Stop changes intent before stopping. Install
keeps intent stopped while replacing/configuring files, enables it only at the
Start boundary, and returns to stopped after verification rollback. Revert this
decision and reinstall the preceding checkpoint to restore the old
runtime-record-only behavior.

**Reconsider when:** A platform service becomes the accepted sole owner of both
DevSpace and tunnel lifecycle, the MCP protocol/client supplies session recovery
that survives server replacement, or fresh mutation errors demonstrate a
separate filesystem mechanism.

## ADR-042: Keep self-update inside the Windows setup owner and expose only request/status over MCP

**Date:** 2026-08-01

**Status:** Accepted; automated verification complete, main/live proof pending

**Context:** Publishing source to Git does not update the globally installed
dpkr helix process. Asking ChatGPT to compose Git, npm, stop, restart, and
rollback commands through a workspace shell is error-prone, and the tool call
transport disappears when the server replaces itself. A dashboard-only action
would not satisfy the ChatGPT workflow. Automatic polling, a daemon, or a
second updater would add background behavior and another lifecycle owner.

**Decision:** Extend `scripts/setup-windows.ps1`, the existing installation and
runtime owner, with one explicit `Update` transaction. Expose a read-only MCP
status tool and an explicitly mutating update-request tool through a small
dependency-injected controller. The controller starts the canonical script as
a detached `windowsHide` process and accepts no caller-selected source, branch,
remote, command, or package.

The script requires the canonical GitHub origin, clean `main`, External stable
endpoint, and a fast-forward fetched `origin/main`. It verifies the exact target
in a temporary worktree before stopping the current process. It packages the
previous installation, installs and health-checks the candidate, atomically
refreshes the managed setup/recovery scripts, then fast-forwards the source. If
deployment fails, it restores the old package, exact commit, scripts, desired
state, and health. A bounded local status file records only state, request/time
fields, commit IDs, and reason codes for the reconnecting client.

**Alternatives rejected:** Arbitrary shell orchestration, because it cannot
provide one owner or a durable result across self-restart; dashboard-only
mutation, because ChatGPT cannot use it; package auto-update or polling, because
it changes software without an explicit request; and a daemon/service/queue,
because the existing setup and recovery lifecycle already provide the needed
owners.

**Complexity receipt:** Accepted at existing-owner adaptation. One PowerShell
mode, one focused TypeScript controller, two MCP tools, and one bounded status
file are required by the self-restart and result-observation boundary. No
dependency, service, daemon, scheduler, queue, cache, dashboard UI, credential,
permission, or automatic update policy is added. Remove the MCP adapter and
Update mode together if the host/platform later supplies a verified atomic
self-update contract.

**Failure and recovery:** Preflight rejection leaves the current process and
source untouched. Only verified apply stops it. Concurrent duplicate requests
are refused. Deployment rollback uses a package created before stop
and an exact prior commit. If both apply and rollback fail, status is `failed`
with `ROLLBACK_FAILED`; the existing hidden recovery task can attempt normal
Start, and the local operator retains the prior package/source evidence for
manual repair. In-flight MCP requests cannot survive replacement; the stable
endpoint and status tool make the single reconnect explicit.

**Reconsider when:** MCP provides server-replacement continuity and durable
task results, dpkr helix adopts a signed package/release channel that is safer
than canonical `origin/main`, or a cross-platform managed installer becomes a
current requirement with equivalent rollback proof.
