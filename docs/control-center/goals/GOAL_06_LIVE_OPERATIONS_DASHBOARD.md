/goal

# GOAL 06 — Live Operations and Control Center UI

## Status

DONE — MWU-06.01 through MWU-06.16 completed on 2026-07-30.

## Goal

Make direct MCP, DevSpace-managed process, and configured local-agent work visibly alive through one reliable local Control Center, while preserving one canonical execution owner for every operation.

Apply the visual system and screen specifications without replacing the existing project, workspace, policy, process, agent, review, or Project State ownership.

## Dependencies

GOAL_02, GOAL_03, GOAL_04, and GOAL_05 must be DONE.

GOAL_03 must not be bypassed merely because the GOAL_06 design documents exist.

## Canonical documents

Read only the documents needed for the selected Micro Work Unit, but treat these as required contracts for this Goal:

- `docs/control-center/11_LIVE_OPERATIONS_DASHBOARD.md`
- `docs/control-center/12_UI_VISUAL_DESIGN_SYSTEM.md`
- `docs/control-center/13_UI_SCREEN_SPECIFICATIONS.md`
- relevant sections of `03_PRODUCT_SPECIFICATION.md`
- relevant sections of `04_ARCHITECTURE.md`
- relevant sections of `05_DETAILED_DESIGN.md`
- `07_TEST_AND_ACCEPTANCE_PLAN.md`

## User-visible outcome

The user opens the loopback-only Control Center and can:

- manage projects through a coherent Projects screen,
- see active, blocked, failed, result-available, and verified work distinctly,
- open a live run and follow semantic activity without manual refresh,
- inspect safe terminal output, repository changes, diff, agent output, and evidence,
- understand exactly what proof remains,
- stop only a real stoppable DevSpace-owned worker,
- inspect agent/provider and system health,
- use the interface by keyboard in light or dark mode.

The dashboard clearly distinguishes `Result available — verification pending` from `Verified`.

## Scope

- provider-neutral operation run and assurance contracts,
- typed event bus and bounded persistence,
- operation projection and correlation to existing project/workspace/process/agent owners,
- direct MCP tool instrumentation,
- `ProcessSessionManager` event integration,
- `LocalAgentService` and provider-safe streamed event integration,
- authenticated loopback-only operation REST and SSE APIs,
- cursor reconnect, bounded queues, retention, redaction, and recovery,
- capability-based stop routed to canonical owners,
- shared Control Center application shell and design tokens,
- Projects, Runs, live run, Agents, and System screen implementation,
- loading, empty, partial, blocked, failure, disconnected, and stale states,
- keyboard, accessibility, responsive behavior, and visual consistency,
- focused and standard tests,
- Project State, HANDOFF, decision, and evidence updates.

## Non-scope

- showing hidden reasoning or chain-of-thought,
- fake timer-based progress,
- a second process, shell, agent, review, or state owner,
- a writable browser terminal in the first implementation,
- automatic rollback or retry loops,
- public/remote operation streaming,
- a browser extension, Electron/Tauri shell, or separate daemon,
- an unrelated multi-agent planner,
- replacing Git, tests, review, or Project State as sources of truth,
- a one-pass rewrite of every UI screen in one session.

## Micro Work Unit rule

One DevSpace work session completes exactly one Micro Work Unit from the ordered list below.

A Micro Work Unit must normally satisfy all of these limits:

- one observable behavior or one internal contract,
- one narrow ownership boundary,
- a small focused file set,
- focused tests that finish in timeout-resistant calls,
- repository and persistent handoff updated before the final response.

Do not implement the whole Goal in one call. Do not reduce the final Goal. Continue from the first incomplete unit whose prerequisites are complete.

If a unit proves larger than expected, finish the smallest coherent sub-contract, record the exact remaining boundary, and stop without beginning another unit.

## Ordered Micro Work Units

### MWU-06.01 — Contract reconciliation and migration plan

Outcome:

- reconcile `11/12/13` with current code, installed provider SDK types, existing process/local-agent stores, and current dashboard APIs,
- define final TypeScript run/event/evidence DTOs,
- identify exact persistence migration and ownership seams,
- record any conflict in `10_DECISIONS.md` before code chooses a different design.

Proof:

- no runtime behavior change,
- typed contract tests or compile-only fixtures where useful,
- documented complexity receipt,
- exact next code unit recorded.

### MWU-06.02 — Operation run persistence foundation

Outcome:

- append-only SQLite migration for run metadata,
- bounded event/evidence persistence contract,
- restart-safe run identity,
- store tests for migration, sequence, limits, and recovery.

Must not instrument tools yet.

### MWU-06.03 — Event bus and run service

Outcome:

- provider-neutral `OperationEventBus`,
- `OperationRunService` state transitions,
- assurance stage separation,
- canonical owner references and capability lookup,
- non-fatal event publication behavior.

### MWU-06.04 — Process-session projection

Outcome:

- existing `ProcessSessionManager` emits bounded start/output/exit/stop events,
- no second process lifecycle,
- Windows and non-Windows behavior preserved,
- output redaction/truncation tests.

### MWU-06.05 — Direct MCP tool projection

Outcome:

- real MCP tool invocations create identifiable `mcp_tool` runs,
- workspace/project/source linkage is attached when known,
- file-change and failure events are emitted from existing paths,
- public tool input/output schemas remain compatible.

Do not invent a multi-tool semantic task correlation when no runtime correlation exists.

### MWU-06.06 — Local-agent streamed projection

Outcome:

- existing `LocalAgentService` and provider adapters emit safe status/message/result events,
- final provider response produces `result_available`, not `verified`,
- provider session/final response behavior remains unchanged,
- unknown provider fields are not dumped.

### MWU-06.07 — Operation snapshot and SSE read path

Outcome:

- authenticated loopback-only run list/detail/event endpoints,
- cursor-based SSE reconnect,
- snapshot rehydration,
- slow-consumer and bounded-history behavior,
- route-separation proof from the public MCP listener.

No stop mutation in this unit.

### MWU-06.08 — Capability-based stop

Outcome:

- authenticated CSRF-protected stop endpoint,
- only canonical stoppable process/agent owners are exposed,
- process-tree/provider cancellation result is observed before final state,
- UI/API copy states that stop does not rollback changes.

### MWU-06.09 — Shared UI shell and tokens

Outcome:

- Projects, Runs, Agents, System navigation shell,
- light/dark system theme tokens from `12_UI_VISUAL_DESIGN_SYSTEM.md`,
- stable page header, status, button, input, table, inspector, notice, tab, and layout primitives,
- existing dashboard remains functional during migration,
- no new component framework without an accepted complexity receipt.

### MWU-06.10 — Projects screen migration

Outcome:

- replace the current vertical band/card form with the specified table-plus-inspector hierarchy,
- add coherent search/filter, add/scan/edit/forget flows,
- preserve existing GOAL_02 APIs and security,
- show availability, preset, mode, activity, and destructive copy clearly.

### MWU-06.11 — Runs list and live run Activity

Status: DONE on 2026-07-30.

Outcome:

- runs list prioritizes active/blocked/result-pending work,
- live run header, rail, Activity tab, current action, reconnect, follow-live, and evidence summary,
- exact state/assurance distinctions are visible.

### MWU-06.12 — Terminal and Agent output tabs

Status: DONE on 2026-07-30. Web ChatGPT/DevSpace MCP session aggregation,
safe retained projection, reset recovery, independent review, production
browser acceptance, and managed-runtime installation passed.

Outcome:

- safe read-only terminal projection with follow/wrap/search/copy and truncation states,
- safe provider messages/final response/session identity,
- one live parent run per MCP transport session,
- chronological registered-tool, safe file/workspace, and child process events,
- a terminal-like presentation that never fabricates activity or private thought,
- no hidden reasoning, prompt, environment, or token exposure.

### MWU-06.13 — Diff and Evidence tabs

Status: DONE on 2026-07-30. Focused/full verification, production browser
acceptance, security/route-separation audit, and managed-runtime installation
passed.

Outcome:

- repository-backed changed-file list and lazy diff,
- additions/removals and operation types,
- independent typecheck/tests/build/review/Goal-State evidence,
- provider claims cannot set evidence passed.

### MWU-06.14 — Agents and System screens

Status: DONE on 2026-07-30. Focused/full verification, authenticated
route/security checks, production browser acceptance at 1440px/720px, and
sanitized-copy verification passed.

Outcome:

- provider/session status and linked runs,
- system/service/security/allowed-root/storage/retention diagnostics,
- sanitized copyable diagnostics,
- no second root/provider configuration owner introduced accidentally.

### MWU-06.15 — Accessibility, responsive, and visual convergence

Status: DONE on 2026-07-30. Focused/full verification, production build,
WCAG contrast checks, keyboard/focus acceptance, and production-browser
acceptance across all four screens at 1280px/720px in light/dark passed.

Outcome:

- keyboard-complete primary flows,
- focus and dialog/drawer behavior,
- WCAG 2.2 AA target checks,
- reduced motion,
- 1280px desktop and compact responsive checks,
- light/dark screenshot evidence,
- prohibited visual patterns removed.

### MWU-06.16 — Real operation acceptance and Goal closure

Outcome:

- real direct MCP operation observed,
- real process output/reconnect observed,
- real Codex result-versus-verified state observed,
- real capability-based stop observed on Windows where supported,
- standard verification passes,
- all GOAL_06 acceptance criteria and proof obligations are mapped to evidence,
- Goal status becomes DONE only after evidence closes.

## Acceptance criteria

- AC-06.1: Direct MCP, process-session, and local-agent operations create identifiable runs linked to real canonical owners.
- AC-06.2: Run state and assurance stage are independent; an agent final response cannot render as verified.
- AC-06.3: Typed events cover workspace, tool, file, process, agent, verification, review, warning, failure, and Project State updates.
- AC-06.4: Existing tool/process/agent owners emit events without duplicated execution paths or broken public contracts.
- AC-06.5: Events are strictly ordered, bounded, redacted, reconnectable, and restart-reconciled.
- AC-06.6: The loopback operation API/SSE/stop surface is absent from the public MCP listener.
- AC-06.7: Dashboard failure or slow clients do not break or materially delay underlying work.
- AC-06.8: Persisted and streamed content excludes prompts, hidden reasoning, environment values, secrets, and unnecessary file contents.
- AC-06.9: Stop appears only for stoppable canonical owners, ends the observed worker where supported, and never claims rollback.
- AC-06.10: Projects uses the defined information hierarchy and preserves GOAL_02 functionality/security.
- AC-06.11: Runs and live run screens expose current action, terminal, changed files/diff, agent output, evidence gaps, elapsed time, failure/block reason, and reconnect state.
- AC-06.12: Active, blocked, failed, stopped, result-available, verification-pending, and verified states are distinguishable by text and visual treatment.
- AC-06.13: Agents and System expose actionable provider/service/security diagnostics without leaking sensitive data.
- AC-06.14: Light/dark, keyboard, reduced-motion, and responsive acceptance pass.
- AC-06.15: Existing MCP Apps cards and plain MCP clients remain compatible.
- AC-06.16: Standard verification passes.
- AC-06.17: Manual real direct-MCP, process, Codex, reconnect, result-versus-verified, and Windows stop scenarios pass.

## Proof obligations

- run/event/evidence migration and restart tests,
- event ordering and concurrency tests,
- bounded payload, retention, redaction, and truncation tests,
- process output and process-tree stop tests including Windows behavior,
- direct MCP instrumentation and public-contract tests,
- fake and real provider streamed-event tests,
- SSE reconnect, de-duplication, snapshot, and slow-client tests,
- dashboard/public route-separation tests,
- state/assurance projection tests,
- Projects screen behavior tests,
- Runs/live run state tests,
- keyboard/focus/accessibility tests that fit the existing test stack,
- production build of MCP App and dashboard entries,
- light/dark desktop screenshots for visual review,
- real Codex and real Windows manual evidence without push.

## Completion evidence — 2026-07-30

### Acceptance map

- AC-06.1 — MWU-06.04 through MWU-06.06 focused tests plus isolated real
  acceptance created `mcp_tool`, child `process_session`, and `local_agent`
  runs linked to the live MCP transport, canonical process session IDs, and
  a real Codex agent.
- AC-06.2 — The real Codex run first rendered `Result available` with every
  evidence item absent. Only the later parent inspection and attached
  `npm run typecheck` exit 0 changed the same run to `Verified`.
- AC-06.3 — Contract/store/projector tests cover all 21 event types, including
  verification, review, warning, failure, and Project State; the real run
  emitted verification started/completed and assurance-change events.
- AC-06.4 — ADR-020 through ADR-025 and ADR-035 keep MCP dispatch,
  `ProcessSessionManager`, `LocalAgentService`, `OperationStore`, and
  `OperationRunService` canonical. Full compatibility tests pass.
- AC-06.5 — Migration/store/concurrency/retention/redaction/reconnect tests pass.
  Interrupted command verification now reconciles retained `running` evidence
  to `not_run` and assurance to `verification_pending` after restart.
- AC-06.6 — Admin route tests prove operation read/SSE/stop/diagnostics remain
  on the authenticated loopback listener and are absent from public MCP.
- AC-06.7 — Subscriber, projection, slow-client, backpressure, and injected
  verification-store failures cannot change the canonical command result.
  Failed completion projection restores retry eligibility.
- AC-06.8 — Sensitive-content tests and direct browser inspection found no
  prompt, hidden reasoning, environment value, credential, command body, tool
  argument/result, or unnecessary file content in retained operation evidence.
- AC-06.9 — A real Windows parent/child Node process exposed stop only while
  live. The authenticated capability stop returned 202, the session ended, the
  observed child PID no longer existed, and copy stated that repository changes
  are not reverted.
- AC-06.10 — Projects focused/full tests and MWU-06.10 browser acceptance
  preserve project scan/add/update/forget, project selection, policy, and the
  accepted table/inspector hierarchy.
- AC-06.11 — Runs tests and MWU-06.11 through MWU-06.13 browser acceptance cover
  action/state/time/failure, Activity, Terminal, Agent output, current Diff,
  Evidence, reconnect/reset/truncation, follow-live, and changed files.
- AC-06.12 — Pure state/presentation tests and real browser observation
  distinguish active, blocked, failed, stopped, result-available,
  verification-pending, verifying, and verified text/treatment.
- AC-06.13 — MWU-06.14 tests and browser acceptance prove provider/service/root/
  storage/security diagnostics, bounded copy, redacted previews, and public
  route absence.
- AC-06.14 — MWU-06.15 production-browser acceptance passed light/dark,
  keyboard-only primary flows, focus trap/return, reduced motion, 1280px and
  720px layouts, target sizes, contrast, and zero page overflow.
- AC-06.15 — MCP Apps/card tests, real in-memory MCP catalog tests, the connected
  ChatGPT `DevSpace Stable` flow, and isolated plain SDK client calls remain
  compatible. `exec_command.verification` is optional and additive.
- AC-06.16 — Final `npm run typecheck`, full `npm test`, production
  `npm run build`, and `git diff --check` pass; build retains only the existing
  large-chunk warning and diff check only line-ending warnings.
- AC-06.17 — An isolated acceptance instance passed real open/read/apply-patch,
  30-line live process reconnect with exact de-duplication, real Codex
  result-versus-verified, and Windows process-tree stop acceptance without push.

### Proof-obligation map

- Migration/restart — migration v6/store restart tests plus interrupted
  verification reconciliation test.
- Ordering/concurrency — transactional per-run/global-cursor store tests and
  subscriber-isolation tests.
- Bounds/redaction/truncation/retention — operation store, process projector,
  local-agent projector, SSE, Terminal, Agent-output, and diagnostics tests.
- Process output/Windows tree stop — process platform/session/projector/stop
  tests plus the real child-PID acceptance above.
- Direct MCP/public contract — MCP projector/project policy/MCP server tests
  plus real SDK client open/read/apply-patch.
- Fake/real provider stream — local-agent service/adapter/projector tests plus
  a real Codex agent.
- SSE reconnect/de-duplication/snapshot/slow client — operation route/SSE and
  dashboard API tests plus real `reconnect-line-1..30`, 30 unique of 30.
- Route separation — admin/public route tests and real public-boundary checks
  from MWU-06.13/MWU-06.14.
- State/assurance — operation service, verification projector, Runs, and Agents
  tests plus the observed pending-to-verified transition.
- Projects/Runs/UI/accessibility/screenshots/build — MWU-06.10 through
  MWU-06.15 focused tests and retained production-browser evidence, followed by
  the final production build.
- Independent A2 review — R1 finding F001 was adjudicated against ADR-035 and
  AC-06.7, fixed with fault/restart recovery tests, and scoped R2 returned zero
  findings (scope digest
  `c2e052a254bcfaf6ca3a3197c1cb2ee97fa2f11599f7f5d5df8791fade8a2896`).
- Real/no-push — direct MCP, process reconnect, Codex, and Windows stop ran only
  on the isolated loopback runtime; no remote publish action occurred.

## Shared rules

- Start by reading `AGENTS.md`, `00_README.md`, `08_IMPLEMENTATION_PLAN.md`, `09_PROJECT_STATE.md`, and `HANDOFF.md`; then read this Goal and only the referenced documents needed for the selected Micro Work Unit.
- Reconcile documents with current Git, code, configuration, installed SDK types, and test evidence before editing.
- Do not restart completed Goals or overwrite their evidence.
- Preserve one owner for projects, workspaces, policies, processes, agents, review, and Project State.
- Treat `11_LIVE_OPERATIONS_DASHBOARD.md` as the canonical runtime/behavior contract.
- Treat `12_UI_VISUAL_DESIGN_SYSTEM.md` as the canonical visual system.
- Treat `13_UI_SCREEN_SPECIFICATIONS.md` as the canonical information architecture and screen contract.
- Do not display or persist hidden reasoning.
- Keep one Micro Work Unit per DevSpace session.
- Use small timeout-resistant read, edit, test, build, review, and poll calls.
- Update repository `HANDOFF.md` and persistent DevSpace handoff after the unit, after delegated-agent state changes, and before the final response.
- Run focused checks during the unit; run full `npm run typecheck`, `npm test`, and `npm run build` when the unit changes an integration boundary or before claiming a Goal complete.
- Do not push, publish, merge, tag, or create a remote PR.
