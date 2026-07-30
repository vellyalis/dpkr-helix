# Test and Acceptance Plan

The complete requirement-to-owner/evidence mapping is maintained in
`14_REQUIREMENTS_EVIDENCE_MATRIX.md`. This plan owns release gates and manual
scenarios; it does not duplicate the traceability matrix.

## Standard verification

Every implementation goal runs:

```bash
npm run typecheck
npm test
npm run build
```

A goal may add focused commands but may not replace these.

## Unit tests

### Project store and migrations

- fresh DB applies migration and creates project table
- migration is idempotent
- existing v3 DB upgrades without data loss
- create/list/get/update/remove/touch
- duplicate canonical path is idempotent
- unique slug collision handling
- workspace session with and without project ID restores

### Path canonicalization

Use temporary directories and platform-aware assertions:

- allowed direct directory succeeds
- path outside allowed root fails
- symlink resolving outside fails
- relative/tilde expansion follows existing helpers
- Windows path-key case folding tested through injectable platform normalizer
- missing/non-directory paths return typed errors

### Discovery

- finds nested Git repositories
- recognizes `.git` directory and file
- does not descend into discovered repo
- skips heavy directories
- does not follow symlink
- obeys max depth
- obeys directory count
- timeout returns partial result
- selected roots must be configured roots
- scan does not persist candidates

### Policy guard

Matrix tests for all presets and operations.

Additional:

- design allows `docs/a.md`
- design allows root `README.md`
- design denies `src/a.ts`
- design denies `.env`
- patch with one denied path rejects the entire patch before mutation
- artifact destination uses same path policy
- direct `open_workspace` matching registered project attaches policy
- worktree inherits source-project policy
- unregistered path retains legacy behavior

### Dashboard auth

With fake clock/random:

- correct bootstrap token creates session
- incorrect token generic rejection
- constant-time compare helper
- Host rejection
- Origin rejection
- missing/bad CSRF rejection
- mutation requires JSON
- expiry invalidates session
- token never appears in response/log fixture
- logout clears session

### Folder picker adapter

With mocked spawn:

- supported Windows returns trimmed path
- cancellation returns undefined
- timeout kills child
- non-zero exit sanitized
- request cannot control executable/script
- unsupported platform returns capability result
- returned path still passes project validation

### Local agent service

With fake runner/spawner/store:

- profile target resolution
- provider availability failure
- structured prompt rendering
- start record/status transitions
- resume uses provider session ID
- model/thinking override
- policy denial occurs before store mutation
- temp prompt cleanup
- CLI adapter and MCP adapter share service behavior

### Operation projection

- append-only run/event migration and restart
- strict per-run sequence allocation under concurrency
- run state and assurance stage transition matrix
- agent final response yields `result_available`, not `verified`
- bounded event count, payload bytes, terminal chunks, and retention
- redaction excludes prompts, hidden reasoning, environment values, secrets, and unnecessary file contents
- event publication failure does not fail the underlying operation
- stale running record reconciles after process restart
- canonical owner correlation and stop capability
- provider-unknown fields are ignored or generically summarized

MWU-07.04 adds one cross-owner lifecycle proof to these focused tests. A
faithful schema-v3 fixture is opened by a real child process, upgraded through
v6, populated through the canonical project/workspace/handoff/operation
stores, and restarted twice. The first restart preserves every selected row
and fails the missing process owner once; the second leaves the complete
snapshot and migration/event counts unchanged. Readiness, health, shutdown,
forced cleanup, and temporary-state removal are bounded and ordered.

## MCP tool contract tests

- `list_projects` schema/annotations/output
- unavailable filtering
- `open_project` selector resolution
- ambiguity error
- default mode and override
- open result compatibility with `open_workspace`
- project metadata included
- subagent tools absent when disabled
- delegation tools present when enabled
- tool cards include expected `_meta`
- plain text result remains useful

## UI tests

Use pure parsing/display helpers where possible to avoid adding a heavy DOM test stack.

- new tool names recognized
- project list display/title/summary
- project open card
- agent card
- existing card tests unchanged
- host capability fallback decision helper
- `callServerTool` payload builder
- safe fallback message text
- dashboard API DTO parsing
- shared shell navigation and route parsing
- project table/search/filter/inspector state
- run state and assurance-stage display mapping
- explicit `Result available — verification pending` rendering
- activity ordering/grouping/follow-live behavior
- SSE cursor de-duplication and reconnect projection
- terminal wrap/follow/truncation states
- diff file-state and evidence-state formatting
- stop visibility based on canonical capability
- loading, empty, partial, stale, disconnected, blocked, and failure states
- keyboard focus and tab behavior using the lightest compatible test surface
- light/dark token completeness and no one-off status meanings

Vite production build is required proof that both entries compile and manifest lookup remains stable.

## CLI tests

- `dashboard` command recognized
- missing config behavior
- browser-open adapter receives fragment URL but logs sanitized URL
- doctor reports dashboard enabled/port only
- old commands still parse
- init preserves existing tokens and creates missing dashboard token
- dashboard port validation

## Integration tests

### Registry/open integration

1. Create allowed root and temporary Git project.
2. Register project.
3. Create MCP server with in-memory/test stores.
4. Call list.
5. Call open by slug.
6. Read a file using returned workspace ID.
7. Restart service/store.
8. List/open again.

### Policy integration

Register design project and confirm:

- Markdown write succeeds,
- source write fails,
- shell fails,
- no file changed after rejected patch.

### Agent integration

Use fake provider adapter:

- open develop project,
- delegate structured goal,
- status becomes running then idle,
- final response retrievable,
- workspace scope preserved.

### Live operation integration

Use real in-process services and fake provider/process adapters where appropriate:

- direct MCP tool creates a linked run without changing its public contract,
- process start/output/exit creates ordered bounded events,
- local-agent streamed events preserve provider session and final-response behavior,
- snapshot plus SSE reconnect resumes after a sequence cursor without repeated side effects,
- slow client is bounded/disconnected while underlying work completes,
- repository change refresh comes from Git/change-review evidence,
- verification evidence changes assurance only from actual results,
- stop routes to the canonical owner and does not claim rollback,
- every current admin/operation method-path and the dashboard entry/static
  normalized variants return 404 on the public listener while MCP App
  HTML/JavaScript/CSS and asset OPTIONS remain compatible,
- dashboard route failure leaves MCP/tool/process/agent work operational.

Real Codex and real Windows process-tree behavior are manual acceptance steps, not required in ordinary automated CI.

## Manual acceptance scenarios

### A. Local dashboard security

- Start DevSpace with public tunnel.
- Confirm MCP URL works.
- Confirm dashboard works locally through `devspace dashboard`.
- Attempt dashboard route through public origin; it must not exist.
- Open a malicious-origin test page; mutation must fail without session/CSRF.

MWU-07.03 completed the restart and public-route portion on the then-current
managed fixed origin. The later fixed-ingress migration repeated that boundary
proof at a fixed endpoint represented here as `https://mcp.example.com`: public health and
OAuth metadata returned 200, unauthenticated MCP returned 401, the loopback
dashboard remained available, and dashboard/admin routes returned 404.
Restarting the automatic Cloudflared service retained the same public origin.
MWU-07.18 completed the remaining manual pass on 2026-07-30. The fixed public
MCP health endpoint and loopback dashboard returned 200, the public project
admin route returned 404, and a direct mutation request with malicious
`Origin: https://attacker.invalid` plus an invalid CSRF token returned 403.
Chrome policy refused navigation to the proposed `data:` malicious-origin
page, so the same HTTP Origin/session/CSRF boundary was exercised directly
rather than weakened or bypassed. The focused real-HTTP admin test and full
regression suite also passed.

### B. Project onboarding

- Scan an allowed root containing at least three repositories.
- Import one.
- Register one non-Git folder manually.
- Restart DevSpace.
- Both remain.
- Forget one and verify files are untouched.

MWU-07.18 completed this walkthrough against an isolated production CLI and
dashboard using the real SQLite/project owners. A bounded allowed root exposed
three Git repositories in Scan; exactly one was imported and one non-Git
folder was registered manually. Both registrations remained after the
isolated service restarted on the same state directory. Forgetting the
non-Git registration changed the project count from two to one while its
README remained present with the same SHA-256
`08BA24C9DF052143128AF3709AB162BCE8AF3056295B630ECA58B8ECE6D22C86`.
The production dashboard reached the forget confirmation; when the Chrome
confirmation bridge stalled, the already-authorized mutation was completed
through the same loopback-only admin API and verified independently.

### C. ChatGPT selection

- Ask ChatGPT to show projects.
- Select one by card or slug.
- Confirm returned root, policy, mode, and workspace ID.
- Continue reading/editing without re-entering path.

MWU-07.07 completed this scenario in a signed-in ChatGPT Work conversation on
2026-07-30. The then-named `DevSpace Stable` app listed the registered
`devspace` project, opened it in checkout/develop mode without asking for an
absolute path, returned root, policy, mode, and workspace ID, then reused that
workspace ID to read the first 20 lines of `package.json`. The prompt prohibited
edits, shell, and delegation; the host reported none were performed. That
historical proof remains valid after the current fixed-origin app was finalized
as `dpkr helix`.

### D. Worktree

- Open registered Git project in worktree mode.
- Confirm worktree metadata and source-project policy.
- Confirm original checkout is not modified by a test edit.

MWU-07.18 completed this scenario through a real MCP SDK client connected to
the production MCP tool registrations. `open_project` returned `worktree`
mode, a managed worktree root, the exact source root, and the source project's
`develop` preset. A test file written through the returned worktree
`workspaceId` existed only in that worktree; the source checkout lacked the
file, retained its source file content, and had identical Git status before
and immediately after the worktree edit.

### E. Policy

- Set inspect and verify writes/shell/delegation denied.
- Set design and verify docs write succeeds while source write fails.
- Set develop and verify existing build/test workflow works.

MWU-07.18 completed the matrix through the real MCP handlers and canonical
project/workspace/policy owners. Under `inspect`, write, shell, and delegation
were denied, with zero local-agent store or worker side effects. Under
`design`, a docs write succeeded and a source write failed without creating
the source file. Under `develop`, the fixture's existing `npm test` workflow
ran `node --check src/app.js` successfully. The project finished on its
original `develop` preset.

### F. Codex handoff

- Explicitly delegate one goal to `codex-implementer`.
- Observe visible agent ID/status.
- Retrieve completion response.
- Inspect actual changes and run verification.
- Confirm no silent second agent started.

MWU-07.08 completed this scenario in a signed-in normal Chat conversation on
2026-07-30. After refreshing the then-named `DevSpace Stable` catalog, ChatGPT
opened registered project `devspace` and delegated exactly once to
`codex-implementer`. The delegated agent moved from `starting` to `running` to
`idle`/`Result available`, returned a bounded source-based conclusion, and
remained the only newly created agent. The agent and an independent repository
check both found no tracked change; the pre-existing untracked `.tmp/` remained
untouched. `npm run typecheck` passed. Because the Stable `bash` schema exposed
no agent/verification association fields, the run honestly remained `Result
available` rather than being presented as verified; the separate
result-to-verified transition is closed in scenario G. The current fixed-origin
app is named `dpkr helix`; the old app is retained only for reversible cleanup.

### G. Live operations and Control Center UI

- Observe one direct MCP read/write flow and confirm real events rather than timer progress.
- Observe one DevSpace-managed process with live output, reconnect the dashboard, and confirm no duplicated side effect.
- Observe one real Codex run through result availability, repository inspection, verification, and final verified state.
- Confirm the provider final response first renders as `Result available — verification pending`.
- Stop one supported Windows-owned process/worker and confirm the canonical process tree ends without rollback claims.
- Review Projects, Runs, live run, Agents, and System at 1280px and a compact width.
- Review light and dark themes, keyboard-only primary flows, focus restoration, and reduced-motion behavior.
- Confirm hidden reasoning, prompts, tokens, environment values, and unnecessary file contents are absent.

MWU-07.09 completed the user-directed terminal-dominant Runs refinement and
one real direct-MCP command observation on 2026-07-30. The permanent right-side
`Evidence checklist` was removed because it duplicated the Evidence tab while
reducing the live projection width. Evidence remains available explicitly as a
tab. The Runs stage now uses the reclaimed width, process/MCP runs default to
their terminal projection, and the terminal header exposes `Live output`,
retained chunk count, and follow state. Browser observation on the managed
loopback dashboard showed `Running bash` changing to `[ok] bash 20332ms`
without fake progress. The ChatGPT-exposed `bash` call returned its 20 output
lines as one completed result rather than a pollable process session, so the
exact incremental process-output/reconnect and local-agent live-view portions
remain open for the next scenario.

MWU-07.10 completed those remaining live-view portions on 2026-07-30. The
managed runtime reused its existing Codex process-session implementation, and
the refreshed Stable catalog exposed `exec_command` plus `write_stdin`. Normal
A Chat-launched process session emitted 30 one-second lines. The dashboard was
reloaded during the operation; the selected terminal subsequently contained
exactly one ordered copy of every `LIVE STREAM 01/30` through `30/30` line and
the canonical exit-0 event. One new read-only local agent,
the read-only agent appeared in Agents as `Running/working`, linked to
its canonical operation, then reached `Result available`.
The linked run exposed starting, running, idle, result-available, and completed
events plus the final bounded Agent output. No file or Git mutation occurred.
This closes the direct-MCP/process/local-agent live-view and reconnect/
de-duplication portion of scenario G; supported Windows stop, verified-state,
and visual/accessibility checks remain separate.

MWU-07.11 completed the supported Windows stop portion on 2026-07-30. Initial
observation found that the nested process run was canonically stoppable while the
grouped parent MCP stage omitted Stop. The UI was corrected to resolve a live
stoppable member from the already-related run group and submit that exact run
ID to the existing stop endpoint. In the acceptance session, a PowerShell
parent process owned `PING.EXE`, which owned a console child. Before the action
all three existed with the expected parent links. The visible
`Stop active worker` control stated that stopping does not revert repository
changes; after activation all three child-tree processes were absent while the
managed DevSpace process remained. The store and Activity projection independently showed
`running -> stopping -> stopped`, `process.exited`, no failure summary, and no
rollback claim. The Stop control disappeared after terminal state. This closes
the supported Windows stop portion of scenario G.

MWU-07.12 completed the result-to-verified portion on 2026-07-30 in the same
signed-in normal Chat and existing agent run
the existing agent run. The first associated command failed
because `Start-Sleep` was invalid in the managed `cmd.exe` shell; the
dashboard and persisted events showed `verifying -> verification_pending`
without a verified claim. A retry used a fresh process session to wait with
`ping`, run the real `npm run typecheck`, and exit 0. The dashboard directly
showed `Result available — verification pending`, `Verifying`, then
`Verified` for the same agent. Its Evidence tab retained only
`Typecheck / Passed / Operation event 15`; the other four evidence categories
remained `Not run`. SQLite events independently recorded result availability
at sequences 6-8, the failed verification at 9-12, and the passed retry at
13-16. No pass/fail outcome was accepted from the client. This closes the
result-to-verified portion of scenario G; the remaining visual/accessibility
walkthrough stays separate.

MWU-07.15 completed the desktop visual portion on 2026-07-30. Projects,
Runs/live run, Agents, and System were observed in explicit light and dark
themes with no body-level horizontal overflow. Direct navigation to an MCP run
selected its terminal projection, and the accepted theme owner selected the
corresponding unchanged dpkr helix image.

MWU-07.16 completed the keyboard, focus, reduced-motion, target-size, and
compact-width portion on 2026-07-30. Production-browser walkthroughs at 1280px
and 720px covered search shortcuts, ARIA-tab arrow navigation, compact focus
traps, Escape close, exact opener restoration, responsive overflow, and the
loaded reduced-motion override. The one reproduced 13px Agents link target was
corrected and remeasured at 32px desktop and 40px compact. Scenario G is
closed.

### H. Compatibility

- Use legacy `open_workspace` on an unregistered folder.
- Run current file tools.
- Confirm inline file cards contain the resulting diffs and advance the
  canonical change-review checkpoint.
- Resolve the MCP Apps HTML resource and project tool-card metadata through a
  real MCP SDK client.
- Confirm CLI help retains `serve`, `init`, `doctor`, `config`, and `agents`
  while advertising `dashboard`.
- Confirm existing tool cards and change review.
- Use a plain MCP client with widgets ignored.

MWU-07.01 and MWU-07.05 completed this scenario. A plain MCP client opened an
unregistered allowed folder and reused its workspace ID; a real MCP SDK client
resolved the Apps resource and project-card metadata; legacy file tools
produced inline diffs and advanced the canonical review checkpoint; and CLI
help retained `serve`, `init`, `doctor`, `config`, and `agents` while adding
`dashboard`.

## Manual acceptance completion after MWU-07.18

All scenarios A through H now have direct recorded evidence. MWU-07.18 closed
the previously remaining A, B, D, and E surfaces without converting automation
alone into a manual pass. Final GOAL_07 convergence reconciled all scenarios,
release gates, and acceptance criteria and marked the Goal DONE.

## Machine-local background recovery after MWU-07.19

The scheduled five-minute fixed-tunnel recovery path was checked separately
from dashboard focus acceptance. After its Action changed from direct
interactive `powershell.exe` to the standard no-console Windows Script Host
entry, two forced task runs were sampled with `GetForegroundWindow` and
new-process `MainWindowHandle` observation. Both runs created zero visible
windows and zero foreground processes, advanced the scheduled run, returned
result `0`, kept local and fixed-public health at `200`, and left the managed
DevSpace PID unchanged. The first probe was rejected as an invalid oracle
because it included a pre-existing Windows Terminal; the accepted probe
baselines process IDs immediately before each task start.

## Reusable Windows onboarding after MWU-07.20

The repo-local onboarding Skill and optional recovery path were verified
without changing recipient or external state. The portable installer focused
test and near-fresh-user External-mode integration passed. The recovery test
proved External eligibility, Quick Tunnel rejection, no-console launcher
content, intentional-stop preservation, public-only outage preservation,
exactly one managed restart for local failure, ownership-marked exact-task
recognition, spoofed matching-Action rejection, mocked Install/Remove, Plan
no-write, and secret-boundary output. PowerShell parsing, real ScheduledTasks
object construction without registration, typecheck, real Skill discovery,
full regression, production build, package dry-run, link/diff/secret checks,
and independent A2 R2 also passed.

Actual recipient-PC task registration/execution/removal and Cloudflare/
ChatGPT/OAuth creation remain NotRun: those operations change current-user
system or external account state and require separate explicit approval. The
existing machine-local MWU-07.19 task probes supply direct no-visible-window
evidence for the same `wscript.exe` entry pattern, but are not relabeled as a
portable recipient lifecycle pass.

## Release gates

All are mandatory:

- all automated tests pass,
- production build succeeds,
- no public admin route,
- no known policy bypass,
- no secret in logs/fixtures/state,
- Windows dashboard open and project registration verified,
- real ChatGPT `list_projects`/`open_project` verified,
- real Codex handoff verified once,
- direct MCP, process-session, and local-agent live views verified,
- result-available and verified states remain distinct,
- SSE reconnect and bounded-output behavior verified,
- capability-based stop verified where supported,
- Projects, Runs, live run, Agents, and System screen acceptance passes,
- light/dark, keyboard, accessibility, reduced-motion, and responsive checks pass,
- no prompt, hidden reasoning, environment value, secret, or unnecessary file content in operation output,
- docs, decisions, HANDOFF, and project state updated.

Final convergence result on 2026-07-30: **PASS**. Every gate above has direct
automated or recorded observational evidence. The recipient-PC task/account
operations listed above remain approval-bound NotRun residuals and do not
replace or weaken any release gate.

## GOAL_08 Codex-parity acceptance

GOAL_01 through GOAL_07 release evidence remains closed. GOAL_08 adds the
quality comparison and focused acceptance surfaces defined in
`goals/GOAL_08_CODEX_PARITY.md`; it does not relabel prior evidence.

### Evaluation order

1. Run P01-P08 on the current local-Codex and Web-plus-helix baseline.
2. Compare model/profile/prompt candidates without product feature changes.
3. Adopt or reject the configuration candidate.
4. Implement repository context and review/fingerprint contracts.
5. Implement structured Codex outcome and bounded status wait.
6. Rerun identical P01-P08 snapshots and the required regression gates.
7. Perform signed-in normal-Chat acceptance for P01, P04, P05, and P07.

### Focused automated proof

- clean, dirty, detached-HEAD, non-Git, missing-manifest, oversized, binary,
  and unavailable repository-context fixtures;
- isolated temporary-index fingerprint leaves index, checkout, branch, `HEAD`,
  refs, and files unchanged;
- `show_changes` structured patch/content bounds and legacy text/card
  compatibility;
- exact fresh -> edit -> stale -> reverify -> fresh transition;
- legacy verification evidence remains `unknown_legacy`;
- unknown, ambiguous, cross-workspace, and wrong-root review agent rejection
  before checkpoint mutation;
- Codex output-schema completed, needs-input, malformed/error, persistence,
  restart, and same-provider-session continuation paths;
- non-Codex adapter compatibility;
- status immediate, completed, needs-input, error, stopped, and timeout paths
  with no duplicate worker;
- policy, redaction, migration, plain-MCP, full regression, typecheck, and build
  coverage.

### Quality gate

Web plus dpkr helix must have no more mandatory parity-case failures than local
Codex and must have zero permission, secret, pre-existing-work, unrelated
change, and stale-verification regressions. Call count, latency, token, and
cost improvements are secondary and cannot offset a quality or safety failure.
