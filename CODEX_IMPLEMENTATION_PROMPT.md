# DevSpace Control Center — Implementation Prompt

## Mission

Implement the integrated DevSpace Control Center described in `docs/control-center/` without discarding completed work or creating a second runtime owner.

The finished system must let a user:

1. register and discover repositories under existing DevSpace allowed roots,
2. select a registered project from a local dashboard or ChatGPT MCP App card,
3. open it without repeatedly typing an absolute path,
4. apply and understand a visible project permission preset,
5. hand an implementation task to the existing local-agent/Codex integration explicitly,
6. observe direct MCP, process-session, and local-agent work in a live local Control Center,
7. inspect safe terminal output, changed files, diff, agent output, verification, review, and Project State evidence,
8. distinguish `Result available — verification pending` from `Verified`,
9. stop only a real stoppable DevSpace-owned worker without claiming rollback,
10. receive bounded repository context, structured material questions, and a model-visible final review that distinguishes fresh from stale verification,
11. wait for delegated work without repeated tight polling,
12. keep existing MCP, CLI, OAuth, workspace, worktree, tool-card, and unregistered-path workflows backward compatible.

This is not a request to add documents only. For an implementation Micro Work Unit, investigate the repository, change code, add tests, verify the result, and update resumable state.

## Source-of-truth and package safety

The current repository is authoritative.

Do not run an older ZIP installer or copy a package over this checkout with force-overwrite behavior. Do not replace current `08_IMPLEMENTATION_PLAN.md`, `09_PROJECT_STATE.md`, `10_DECISIONS.md`, `HANDOFF.md`, or completed Goal evidence with package defaults.

When an external package or design differs from the repository:

1. inspect the current implementation and state,
2. identify the smallest additive change,
3. record a material design conflict in `10_DECISIONS.md`,
4. preserve completed evidence and existing behavior unless the current accepted Goal explicitly changes it.

## Session bootstrap reading order

Do not reread the entire design package on every DevSpace session.

Read in this order:

1. `AGENTS.md`
2. `docs/control-center/00_README.md`
3. `docs/control-center/08_IMPLEMENTATION_PLAN.md`
4. `docs/control-center/09_PROJECT_STATE.md`
5. `docs/control-center/HANDOFF.md`
6. the selected Goal file
7. only the design, code, and test files referenced by that Goal and the selected Micro Work Unit

Use Git, code, configuration, installed dependency types, direct execution results, and current tests to reconcile stale document claims.

## Goal selection

Open `docs/control-center/08_IMPLEMENTATION_PLAN.md`.

Continue the current active/blocking Goal and exact next action from `HANDOFF.md`. Do not skip a blocked earlier Goal to begin a later dependent Goal.

When no Goal is active or blocked, select the first non-DONE Goal whose dependencies are DONE.

Current Goal files:

- `docs/control-center/goals/GOAL_01_REGISTRY_FOUNDATION.md`
- `docs/control-center/goals/GOAL_02_DISCOVERY_AND_LOCAL_DASHBOARD.md`
- `docs/control-center/goals/GOAL_03_MCP_PROJECT_SELECTION.md`
- `docs/control-center/goals/GOAL_04_PROJECT_POLICY_ENFORCEMENT.md`
- `docs/control-center/goals/GOAL_05_CODEX_HANDOFF.md`
- `docs/control-center/goals/GOAL_06_LIVE_OPERATIONS_DASHBOARD.md`
- `docs/control-center/goals/GOAL_07_INTEGRATION_AND_HARDENING.md`
- `docs/control-center/goals/GOAL_08_CODEX_PARITY.md`

`GOAL_06_INTEGRATION_AND_HARDENING.md` is a compatibility pointer only and must not be executed.

## Cross-plan ownership

The repository's portable Windows setup is an existing compatibility baseline, not another numbered Goal.

- `scripts/setup-windows.ps1`, its tests, and `docs/setup-windows.md` own portable/fresh-PC installation.
- Machine-specific browser/profile setup used to close a real-host acceptance criterion is nested support work inside the current Goal.
- Support work must not be promoted into a later Goal, used to skip an acceptance criterion, or generalized into the portable installer without an accepted decision.
- Preserve the portable setup through GOAL_04 to GOAL_06; reconcile final stable configuration changes in GOAL_07; GOAL_08 must not change the running workspace path or external ingress merely to pursue parity.
- When HANDOFF and Project State differ, reconcile both with Git and current machine evidence before acting; update the stale source before continuing.

## One Micro Work Unit per DevSpace session

A DevSpace session completes one Micro Work Unit, not an entire large Goal.

The normal upper bound is:

- one observable behavior or one internal contract,
- one narrow ownership boundary,
- a focused file set,
- focused timeout-resistant verification,
- HANDOFF and Project State synchronized before the final response.

Small units reduce timeout and recovery risk; they do not reduce the final product Goal.

Do not begin a second Micro Work Unit after the first is complete. Record the next executable unit and stop.

## Operating rules

- Preserve the existing MCP endpoint, OAuth flow, `open_workspace`, file tools, worktree behavior, tool modes, widget modes, CLI behavior, and unregistered-path workflow unless an accepted requirement explicitly changes them.
- Integrate into the existing TypeScript/Node/Express/React/Vite/SQLite architecture.
- Do not create a browser extension, Electron/Tauri application, standalone dashboard daemon, or separate operation/agent runtime.
- Keep the dashboard and all project/operation mutations on the existing loopback-only admin listener.
- Never expose admin, operation stream, terminal, diff, project mutation, or stop routes through the public tunnel.
- Do not add autonomous or silent delegation. Delegation requires an explicit tool/user action and must remain visible.
- Preserve one canonical owner for workspaces, policies, file operations, processes, agents, review, and Project State.
- Live operation output must never expose hidden reasoning, prompts, chat transcripts, secrets, raw environment values, or unnecessary file contents.
- An agent final response must not be presented as Goal completion until required verification and review evidence closes.
- Do not add unrelated refactors or rewrite working modules merely to match a preferred style.
- Do not push, publish, merge, tag, release, or create a remote PR without explicit approval.
- Use the repository's existing package manager and test commands.
- Treat Windows as required. Other supported platforms must fail gracefully where native behavior is unavailable.
- New dependencies require a documented complexity receipt. Prefer existing dependencies and platform APIs.
- Use short reads, edits, tests, builds, reviews, and polls. Use a process session only for commands that genuinely outlast one normal call.

## Required workflow for each Micro Work Unit

1. Reconcile `HANDOFF.md` and `09_PROJECT_STATE.md` with Git, code, configuration, installed dependency types, and current evidence.
2. Confirm the selected Goal and first incomplete Micro Work Unit.
3. Inspect only the exact implementation seams needed for that unit.
4. Record a material conflict in `10_DECISIONS.md` before implementing a different accepted design.
5. Implement the smallest complete change that closes the selected unit and does not block later units.
6. Add or update focused tests for observable acceptance criteria.
7. Run focused checks in small calls.
8. Run full standard verification when the unit changes an integration boundary, before marking a Goal DONE, or when the Goal requires it:
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
9. Perform required review for the unit and resolve only valid blocking findings within scope.
10. Update:
   - the Goal status/evidence when it changed,
   - `docs/control-center/09_PROJECT_STATE.md`,
   - `docs/control-center/HANDOFF.md`,
   - the persistent DevSpace handoff through `update_handoff` when that tool is available.
11. Report changed files, direct evidence, unfinished content, residual risk, and one exact next action.

## Handoff contract

After every meaningful completed or interrupted unit, record:

- current Goal and Micro Work Unit,
- exact completed behavior,
- actual changed files,
- tests and results,
- active agent/process IDs,
- unfinished content,
- residual risks,
- files required on resume,
- completed work that must not be repeated,
- one executable next action.

Never place secrets, credentials, full prompts, full chat transcripts, or large logs in handoff state.

## Completion rules

A Micro Work Unit is complete only when its focused behavior and proof close.

A Goal is `DONE` only when all of its acceptance criteria and proof obligations are satisfied. A passing build or provider final response alone is not completion.

The original Control Center baseline remains complete with GOAL_01 through
GOAL_07 DONE. The extended mission is complete only when GOAL_08 also reaches
`DONE`, its same-snapshot parity and signed-in host acceptance pass,
documentation matches implementation, and no blocking security, data-loss,
policy-bypass, public-exposure, crash, stale-verification, or unusable-UX risk
remains.
