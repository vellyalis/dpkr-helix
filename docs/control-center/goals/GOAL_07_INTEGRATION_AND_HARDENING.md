/goal

# GOAL 07 — Integration, Hardening, and Final Acceptance

## Goal

Close cross-feature gaps, prove the complete DevSpace Control Center workflow, update user-facing documentation, and deliver a reliable final feature set without breaking existing DevSpace users.

## Dependencies

GOAL_02, GOAL_03, GOAL_04, GOAL_05, and GOAL_06 must be DONE.

## Status

`DONE` — final convergence completed on 2026-07-30.

- MWU-07.01 is DONE: a real in-process plain MCP client opened an unregistered
  allowed directory through `open_workspace`, received no registered-project
  metadata, and read a file through the returned `workspaceId`. Focused
  protocol verification, typecheck, and the full test suite passed.
- MWU-07.02 is DONE: the real-HTTP public boundary matrix covers every current
  admin/operation API method-path plus dashboard entry/static variants. A
  reproduced public `dashboard.html` exposure was fixed with a normalized
  allowlist limited to the MCP App HTML and assets. Focused/full tests,
  typecheck, build, built ownership scan, and independent R3 passed.
- MWU-07.03 is DONE: after the approved machine restart, the managed global
  bundle byte-matched the verified local build. Live fixed-origin checks
  rejected the dashboard route and all normalized/encoded static variants
  while public MCP health, MCP App HTML/JS/CSS/OPTIONS, the loopback dashboard,
  both listeners, and scheduled recovery remained operational.
- MWU-07.04 is DONE: an isolated real child-process lifecycle upgraded a
  faithful schema-v3 database through v6, preserved legacy and current
  project/workspace/handoff state, reconciled one missing-owner operation
  exactly once, and left the complete persisted snapshot unchanged after a
  second restart.
- MWU-07.05 is DONE: the current CLI help contract retains every pre-Control
  Center command, the real MCP SDK resolves the MCP Apps card resource and
  project card metadata, and an unregistered Git workspace completes
  `open_workspace` -> `read` -> `edit`/`write` with inline diff cards advancing
  the canonical change-review checkpoint.
- MWU-07.06 is DONE: `14_REQUIREMENTS_EVIDENCE_MATRIX.md` maps every requirement
  ID to its canonical implementation and verification owner, distinguishes
  automated/observed/manual-pending evidence, and the user docs now cover
  upgrade/rollback, permission presets, live-operation semantics, and
  old-package conflicts.
- MWU-07.07 is DONE: a signed-in real ChatGPT Work conversation used the
  `DevSpace Stable` connector for `list_projects` -> `open_project` -> `read`,
  selected the registered `devspace` slug without asking for an absolute path,
  returned root/policy/mode/workspace identity, and reused that workspace to
  read `package.json` without edits, shell, or delegation.
- MWU-07.08 is DONE: a signed-in normal Chat conversation used the refreshed
  `DevSpace Stable` catalog to delegate exactly one read-only investigation to
  `codex-implementer`. The delegated agent was visible from starting through
  running and result availability, returned its final response, and was the
  only new agent. Repository inspection found no tracked change and retained
  only the pre-existing untracked `.tmp/`; `npm run typecheck` passed. The host
  exposed no verification-association fields on `bash`, so the dashboard
  correctly retained `Result available` instead of inventing `Verified`.
- MWU-07.09 is DONE: user observation identified the permanent right-side
  Evidence checklist as low-value duplication that obscured the active output.
  Runs now gives that width to a terminal-dominant two-column stage, defaults
  process/MCP runs to terminal, labels live retained output and follow state,
  and keeps verification evidence in its explicit tab. The managed dashboard
  observed one real direct-MCP command from `Running bash` to successful
  completion. Its ChatGPT `bash` surface returned process text only at
  completion, so incremental process-session/reconnect and local-agent
  live-view acceptance remain open.
- MWU-07.10 is DONE: the managed runtime now uses its existing Codex process
  tool mode, and the refreshed `DevSpace Stable` catalog exposes
  `exec_command`/`write_stdin` instead of the one-shot `bash` surface. A normal
  Chat started a process session; the terminal retained exactly
  `LIVE STREAM 01/30` through `30/30` in order with no duplicates after a
  dashboard reload and ended at exit code 0. One additional read-only
  `codex-implementer` was independently visible as
  `Running/working`, then `Result available`, with its linked run, canonical
  status events, and final agent output. No repository file was changed by
  either acceptance action.
- MWU-07.11 is DONE: manual Windows stop acceptance reproduced a UI routing
  defect where a nested `process_session` advertised `stoppable` but its
  top-level MCP row did not expose Stop. Runs now resolves the live stoppable
  run inside the selected related-run group and sends the existing canonical
  run ID to the unchanged stop API. The acceptance session started a PowerShell
  parent process, child `PING.EXE`, and child console process; the
  visible Stop action terminated the complete tree, left the managed DevSpace
  PID alive, and recorded `running -> stopping -> stopped`. The UI explicitly
  said Stop does not revert repository changes and made no rollback claim.
- MWU-07.12 is DONE: the signed-in normal Chat associated canonical process
  exits with the existing result-available agent. A first invalid
  shell command exited 1 and returned the run from `verifying` to
  `verification_pending`; a retry process session ran the real typecheck,
  exited 0, and moved the same run to `verified`. The dashboard directly
  observed pending, verifying, and verified, while the Evidence tab retained
  only passed Typecheck and kept Tests, Build, Review, and Goal/Project State
  as Not run.
- MWU-07.13 is DONE: a private remote clean checkout completed `npm ci`,
  typecheck, full tests, and production build in standard order. The first
  clean test run exposed a project MCP integration test that implicitly
  depended on an existing Vite manifest. A test-only manifest/asset fixture
  now owns and removes that prerequisite without changing production code.
  The packed tarball installed into an empty consumer; its CLI version/help,
  manifest, dashboard brand, and supplied icon passed direct smoke checks.
- MWU-07.14 is DONE: the high `GHSA-mh99-v99m-4gvg` production advisory was
  explicitly adjudicated. Pi `0.82.1` and `0.83.0` both publish an inner
  shrinkwrap pinned to vulnerable `brace-expansion@5.0.7`; root override,
  outer shrinkwrap, and manual-lock candidates failed direct clean-install or
  packed-consumer proof and were reverted. The Pi RPC local-agent path loads
  its minimatch-backed model/resource/package code, including an optional
  operator-selected model. Because local-agent authorization precedes that
  call and the same authenticated client already has scoped shell execution,
  one high audit finding remains as an accepted availability residual until Pi
  publishes a corrected shrinkwrap or the trusted-operator boundary changes.
  The README now uses a current dpkr helix live Runs dashboard and
  product-focused setup/security copy.
- MWU-07.15 is DONE: Projects, Runs/live run, Agents, and System passed
  production-browser desktop acceptance in light and dark with no body-level
  horizontal overflow. A direct live-MCP route now selects its terminal
  instead of Activity. The two unchanged user-supplied logo variants follow
  the existing theme owner, and `https://dpkr.dev` is the official homepage.
- MWU-07.16 is DONE: production-browser keyboard and compact-width acceptance
  covered Projects, Runs/live run, Agents, and System at 1280px and 720px.
  Search shortcuts, visible focus, tab-arrow behavior, compact focus traps,
  Escape close, opener restoration, reduced-motion CSS, 40px compact targets,
  and body-level overflow passed. One undersized Agents linked-run target was
  reproduced and corrected to 32px desktop and 40px compact without adding a
  new component or state owner.
- MWU-07.17 is DONE: the 124-ID requirements matrix, release-level acceptance
  record, Goal contract, implementation plan, Project State, and HANDOFF now
  agree with MWU-07.01 through MWU-07.16 and the current Cloudflare fixed
  ingress. User-facing README/setup/configuration/security/troubleshooting
  owners were checked and already cover AC-07.16 without a product-doc rewrite.
  Open manual scenarios remain explicit and were not converted into passes.
- MWU-07.18 is DONE: manual scenarios A, B, D, and E now have direct evidence.
  The fixed public/local security boundary rejected malicious-origin mutation;
  an isolated production dashboard completed three-repository discovery,
  import, manual registration, restart persistence, and metadata-only forget;
  a real MCP client proved managed-worktree isolation and inherited source
  policy; and real MCP calls enforced inspect/design/develop, including
  delegation denial before side effects. Typecheck, the full regression suite,
  local/public health, public admin 404, Cloudflared service state, and
  scheduled recovery passed without product or deployment changes.
- MWU-07.19 is DONE: the machine-local five-minute recovery task no longer
  enters through console-subsystem PowerShell in the interactive session.
  Standard `wscript.exe` now starts the unchanged recovery script with no
  window and returns its exit code. Two task probes observed zero newly visible
  or foreground windows while task result, local/public health, principal,
  triggers, and the managed DevSpace PID remained correct.
- MWU-07.20 is DONE: the repo-local `onboard-dpkr-helix` Skill now coordinates
  the existing portable installer with explicit Cloudflare stable-ingress and
  ChatGPT/OAuth handoffs. The optional External-only recovery owns one exact
  ownership-marked limited-current-user task and two marked helpers, enters
  through `wscript.exe`, preserves intentional Stop, and does not restart a
  healthy local runtime for public-only failure. Focused/integration/full
  regression, typecheck, build, package, security/documentation, and A2 review
  evidence pass without an external or system-state mutation.
- Final convergence is DONE: all 17 acceptance criteria, every mandatory
  release gate, all 124 requirement IDs, scenarios A through H, standard
  verification, documentation, residual-risk disclosure, Project State, and
  HANDOFF agree. Recipient-PC task/account creation remains an explicit
  approval-bound NotRun residual, not a failed product gate.
- AC-07.4 is closed for source, isolated built-runtime, and the managed
  fixed-origin runtime.
- AC-07.3 and AC-07.10 are closed by the migration/restart, retained-state,
  reconnect/de-duplication, bounded-output, and release-scenario evidence.
- AC-07.12 is closed by MWU-07.01 and MWU-07.05.
- AC-07.1 and AC-07.16 are closed by MWU-07.06.
- AC-07.6 is closed by the MWU-07.07 real-host ChatGPT selection proof.
- AC-07.7 is closed by the MWU-07.08 real Codex handoff/result/repository-review
  and verification-work proof.
- AC-07.8 is closed by MWU-07.09 and MWU-07.10 direct MCP, incremental process,
  reconnect/de-duplication, and local-agent live-view proof.
- AC-07.11 is closed by MWU-07.11 capability routing, Windows process-tree
  termination, stopped-state, and no-rollback proof.
- The result-to-verified portion of AC-07.9 is closed by MWU-07.12 real
  failure/retry, canonical exit-derived evidence, and dashboard/store proof.
- AC-07.13 is closed by MWU-07.13 clean checkout, standard-gate, package
  installation, installed-CLI, and packaged-asset proof.
- AC-07.14 is closed by MWU-07.15 light/dark desktop screen acceptance.
- AC-07.15 is closed by MWU-07.16 keyboard, focus, reduced-motion, target-size,
  and responsive production-browser acceptance.
- No accepted GOAL_01 through GOAL_07 implementation work remains. Reopen only
  for a reproduced regression, a changed requirement, or a residual-risk
  trigger recorded below.

## User-visible outcome

dpkr helix starts cleanly, the local Control Center and ChatGPT surfaces agree, project selection and policy are obvious, Codex handoff is smooth, active work is observable, result and verification are never confused, failures recover safely, and existing MCP/CLI workflows remain usable.

## Scope

- end-to-end integration fixes,
- dashboard/MCP/project/workspace/agent/operation DTO consistency,
- project, policy, handoff, live operation, evidence, and stop workflow convergence,
- startup/shutdown/port conflict and restart handling,
- migration and retention recovery,
- logging, redaction, and public-boundary audit,
- performance and bounded-resource validation,
- visual consistency and state-language audit against `12_UI_VISUAL_DESIGN_SYSTEM.md`,
- screen completeness audit against `13_UI_SCREEN_SPECIFICATIONS.md`,
- README/setup/configuration/security/troubleshooting/rollback updates,
- removal of dead scaffolding and unresolved placeholders introduced by prior Goals,
- requirements-to-evidence mapping,
- final automated and manual acceptance,
- final Project State and HANDOFF.

## Non-scope

- new product features outside accepted requirements,
- custom policy language,
- a browser extension, desktop shell, or separate daemon,
- remote/public dashboard access,
- automatic remote publication,
- unrelated repository modernization,
- visual redesign beyond the accepted design system and screens,
- hiding known residual risk to declare completion.

## Micro Work Unit rule

Use one timeout-resistant Micro Work Unit per DevSpace session.

Typical final units include one of:

- one integration defect and its regression proof,
- one migration/restart/retention proof surface,
- one security/redaction/public-boundary audit slice,
- one complete manual acceptance scenario,
- one documentation/evidence matrix slice,
- final convergence only after all earlier slices close.

Do not combine all final acceptance into one long call. Resume from HANDOFF and preserve completed proof.

## Acceptance criteria

- AC-07.1: Every requirement is mapped to implementation evidence or explicitly documented as not applicable with a valid reason.
- AC-07.2: All release gates in `07_TEST_AND_ACCEPTANCE_PLAN.md` pass.
- AC-07.3: Dashboard, MCP, project, workspace, policy, agent, and operation data agree after create/update/forget/open/run/stop/restart.
- AC-07.4: Public tunnel does not expose admin, operation stream, operation detail, project mutation, or stop routes.
- AC-07.5: Registered policy has no known bypass across all current file, patch, artifact, shell, process, and local-agent side-effect paths.
- AC-07.6: Real ChatGPT project list/open works without re-entering an absolute path.
- AC-07.7: Real Codex handoff, status, result retrieval, repository review, and verification work.
- AC-07.8: Real live operation view shows direct MCP, process, and local-agent activity without fake progress or duplicate execution.
- AC-07.9: Result available, verification pending, verifying, verified, blocked, failed, and stopped remain semantically and visually distinct.
- AC-07.10: SSE reconnect, process restart reconciliation, bounded retention, and slow-client behavior recover without repeated side effects.
- AC-07.11: Capability-based stop works where supported and never claims rollback.
- AC-07.12: Legacy unregistered `open_workspace`, current file tools, CLI commands, MCP Apps cards, and plain MCP clients remain compatible.
- AC-07.13: Standard verification passes from a clean checkout/install surface.
- AC-07.14: Projects, Runs, live run, Agents, and System satisfy their screen acceptance matrix in light and dark themes.
- AC-07.15: Keyboard, focus, reduced-motion, and responsive acceptance pass.
- AC-07.16: User documentation contains installation, upgrade, configuration, normal workflow, permission presets, live-operation meaning, security warnings, troubleshooting, rollback, and old-package conflict guidance.
- AC-07.17: Project State marks all Goals DONE and records residual non-blocking risks honestly.

## Proof obligations

- requirements-to-evidence matrix,
- clean-install and existing-database migration tests,
- process and service restart tests,
- retention/truncation/reconciliation tests,
- dashboard/public-boundary automated and manual proof,
- no-secret and safe-output scan,
- policy bypass audit,
- real ChatGPT project-selection evidence,
- real Codex handoff and result-versus-verified evidence,
- real direct MCP/process/local-agent live-view evidence,
- Windows process-tree stop evidence where supported,
- light/dark desktop screenshot review,
- keyboard and responsive walkthrough,
- clean Git diff review limited to the accumulated Control Center scope,
- compatibility report,
- final rollback and recovery instructions.

## Completion rule

GOAL_07 is DONE only when:

- all previous Goals are DONE,
- every blocking acceptance criterion is closed,
- every required manual scenario has recorded evidence,
- standard verification passes,
- documentation and state agree with the implementation,
- no known security, data-loss, policy-bypass, public-exposure, crash, or unusable-UX blocker remains.

Non-blocking residual risks may remain only when their impact, mitigation, and reconsideration condition are recorded.

## Shared rules

- Start with `AGENTS.md`, `00_README.md`, `08_IMPLEMENTATION_PLAN.md`, `09_PROJECT_STATE.md`, and `HANDOFF.md`; then read only the documents required for the selected Micro Work Unit.
- Reconcile design claims with current code, configuration, installed dependencies, Git, and test evidence.
- Do not overwrite or discard completed Goal evidence.
- Do not add unrelated refactors or product scope.
- Preserve one canonical owner for every runtime responsibility.
- Keep changes and verification calls small and timeout-resistant.
- Update repository HANDOFF and persistent DevSpace handoff after every meaningful or interrupted unit and before the final response.
- Run `npm run typecheck`, `npm test`, and `npm run build` before Goal completion.
- Do not push, publish, merge, tag, release, or create a remote PR.
