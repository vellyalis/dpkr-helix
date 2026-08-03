# DevSpace Control Center Handoff

Last synchronized: 2026-08-03

## Current position

- Completed work units: GOAL_08 MWU-08.01 through MWU-08.06. The measured
  current `gpt-5.5` medium setting is retained; signed-in Web plus dpkr helix
  passes the frozen parity gate 8/8 versus retained local Codex 5/8.
- GOAL_01 through GOAL_07: DONE.
- GOAL_08 Codex-Parity Coding Quality: `DONE`; P01-P08 manifests,
  deterministic snapshots, metadata prompts, result contract, and final
  signed-in acceptance evidence are frozen.
- GOAL_09: `DONE`; the clean-history source repository is PUBLIC and public-clone
  acceptance passed.
- GOAL_10: `DONE`; the standard MCP catalog-change signal is implemented, the
  one-time legacy ChatGPT catalog migration was automated, and live read-only
  status invocation passed.
- WS-QA-09: `READY`; the owner requires a complete same-snapshot comparison of
  `gpt-5.6-sol` medium, high, and xhigh across local Codex and Web plus helix.
  Execution is explicitly deferred until 2026-08-04. A read-only resume
  preflight confirmed the frozen suite and all 96 prepared workspaces remain
  intact and unused.
- Installed working directory: unchanged.
- Remote history replacement and visibility change were completed with explicit
  owner approval. No tag, GitHub Release, or npm publication was created.
- `origin/main` contains the parentless public root and public-safe release state.
- Hosted CI run `30570280066` passed Ubuntu, macOS, and Windows at source commit
  `02a4996`; the prior runner-allocation announcement blocker is closed.
- Verified recovery bundles were created outside the repository. A parentless
  root attributed only to the intended GitHub maintainer passed clean install,
  production audit, history inspection, typecheck, full tests, build, package
  inspection, and Windows setup `Plan`.
- The eight explicitly approved pre-public Actions runs were permanently deleted.
  All remaining runs reference only public-safe history rooted at the parentless
  release commit.
- Private vulnerability reporting is enabled. `main` branch protection applies
  to administrators and blocks force-push and branch deletion.
- Codex review delegation now verifies a single `windowsHide: true` option in
  the SDK's native child spawn. A real reviewer start/continuation completed
  without any console process taking foreground focus.
- Windows recovery now preserves healthy local DevSpace during a public-only
  outage. The current installation reuses its existing limited-user,
  no-console task through the managed health-gated recovery script because the
  present execution context could not register a replacement task.
- Bootstrap desired state now distinguishes intentional Stop from failed Start,
  so failed recovery remains retryable without undoing a user stop. Lifecycle
  operations serialize, local failure requires confirmation, and healthy Start
  preserves the existing PID and MCP sessions.
- No shorter polling, generic file retry, workspace probe write, additional
  daemon, service, prompt, notification, UI, or permission was introduced.
- The canonical Windows setup now owns an explicit hidden `Update` transaction;
  MCP adds only a mutating request and sanitized read-only status. Candidate
  proof runs before stop, concurrent requests are excluded, corrupt/stale
  status is retryable, and failed deployment restores the prior package,
  commit, scripts, desired state, and health.
- The installed runtime is a physical packed artifact rather than a Junction to
  the source checkout. Its exact production dependency tree is restored from
  the shipped shrinkwrap before service start, so source maintenance no longer
  modifies the files used by the running process.
- A short hidden PowerShell launcher now hands the update to a hidden worker and
  exits. It uses two bounded local log files, creates no scheduled updater,
  daemon, UI, prompt, or automatic update, and passed a live `UP_TO_DATE`
  request through the installed controller.
- Abandoned MCP transports are capped at 64 inactive least-recently-used
  sessions while active requests remain protected. The observed host pattern
  created 203 sessions in about 20 minutes and consumed about 0.83 MiB of heap
  per retained session; the bounded build plateaued near 110 MiB through 200
  creations instead of reaching about 222 MiB.
- Update rollback now captures the exact physical package that was running,
  managed Stop terminates its verified process tree, metadata probes have a
  ten-second bound, stale-but-live updater state forbids unsafe retries, and a
  failed no-op Start preserves the pre-existing healthy runtime.
- Scheduled recovery waits only for the immediate setup wrapper, reinstall
  completes dependency/build/package preparation before downtime, and normal
  managed operation suppresses high-volume success logs while retaining
  warning/error evidence. Managed recovery content is refreshed on reinstall.
- The dependency-free `evals/codex-parity/v1` suite materializes two local
  Codex and two Web-plus-helix workspaces per case from fixed seed commits and
  identical working-tree overlays. It changes no runtime owner or model default.
- The current `gpt-5.5` medium baseline is complete: all 36 used terminal
  records validate, the generated-evidence scan contains no P08 canary
  disclosure, Web plus helix passes 8/8 cases by majority, and local Codex
  passes 4/8.
- The first `gpt-5.6-sol` medium comparison is complete: all 35 used terminal
  records validate, tie-break usage is correct, the generated-evidence scan
  contains no P08 canary disclosure, Web plus helix passes 6/8, and local Codex
  passes 5/8. Web P05/P07 and local P01/P02/P07 are adoption-blocking regressions.
- Five delegated Web attempts actually used managed `gpt-5.5` medium beneath
  the visible `GPT-5.6 Sol` medium controller. The evidence labels them as a
  mixed configuration. No profile/default/authentication setting changed.
- The conditional `gpt-5.6-sol` high hard-subset comparison is complete: 18
  used records validate; local Codex passes P01/P02/P05 and fails P07 for 3/4;
  Web plus helix passes only P05 for 1/4 after required P01/P07 tie-breaks.
- High is rejected because mandatory outside-workspace reads regress Web
  P01/P02/P07 and local P07. Web P05/P07 remain mixed managed `gpt-5.5` medium
  execution under the visible High controller.
- Metadata M01 direct-use and M02 indirect-use pass. M03 should-not-use fails
  because registered projects are listed before a supplied sentence is
  restated. No metadata, product, profile/default, or authentication setting
  changed.
- Open results now expose bounded failure-isolated repository context through
  the existing owners and a workspace-scoped temporary-index fingerprint. The
  first text/card contract is unchanged; plain MCP receives a second context
  block and structured clients receive `repositoryContext`.
- `show_changes` now preserves its first text and Apps card while adding a
  bounded model-visible review bundle. Optional same-workspace agent evidence
  is policy/root checked before checkpoint mutation, and exact captured/current
  fingerprint equality is the only `fresh` verification state.
- Independent A2 R1 findings for nested workspace scope, text compatibility,
  and untracked-binary accuracy were fixed. Focused R2 found no fix-induced
  S0-S1 candidate. MWU-08.03 independent A2 R1 then returned zero findings.
- Codex now uses the installed SDK per-turn JSON schema for bounded completed
  or input-required outcomes. Nullable migration v8, the existing store and
  operation projection, and MCP/UI/CLI views preserve a distinct resumable
  question without verification claims; continuation keeps the agent and
  provider-session identities.
- MWU-08.04 A2 R1's sole S3 boundary-test finding was fixed; focused R2 confirms
  it resolved with no new S0/S1 defect. No delegated agents or long-running
  processes remain active.
- `get_agent_status` now exposes optional integer `waitMs` through the existing
  service wait. Omission/zero is immediate, active expiry is explicit in plain
  and structured MCP, and completion/input/error/stop returns without worker or
  provider duplication. MWU-08.05 A2 R1's S3 transition-proof candidate was
  fixed; focused R2 returned zero findings.
- MWU-08.06 adds one reused metadata precedence rule: advertised Skills cannot
  expand a narrower task-declared read boundary. The accepted contract is
  advisory; existing project/root authorization remains the runtime owner.
- The post-fix signed-in run produced 17 Web attempt records and reuses 18 local
  records. All 35 are schema-valid and canary-clean; Web passes 8/8 versus local
  5/8 with signed-in P01/P04/P05/P07 acceptance. M01/M02 pass and frozen M03
  remains a non-regressing unnecessary project-list call.
- The installed source/artifact hashes match; doctor, local/public health,
  focused/full/policy/typecheck/build/audit/public/diff gates and independent
  review/governance pass. No agent or long-running process remains active.
- The verified GOAL_08 checkpoint and its focused cross-platform path-identity
  fix are published on `origin/main` through `0aaa59c`; local HEAD, the tracking
  ref, and the advertised remote ref match.
- The first publication run exposed a false outside-repository decision for
  equivalent macOS and Windows path aliases. Filesystem-realpath
  canonicalization repaired the existing fingerprint owner; the same local
  junction reproduction now passes and hosted CI run `30749192172` passes
  Ubuntu, macOS, and Windows through tests, build, doctor, and Windows lifecycle.
- The public ChatGPT self-update tools remain present and match the current
  source. Isolated MCP/controller tests pass, the installed sanitized
  controller reports `UP_TO_DATE` at `3fa1c49`, and hosted CI run `30752498799`
  passes Ubuntu, macOS, and Windows. ChatGPT Web did not honor the standard MCP
  catalog notification for newly added names, so the approved developer-mode
  connection update was automated in the signed-in browser. The refreshed live
  catalog exposes both tools and a fresh chat invoked the read-only status tool.

## Completed before this work unit

- The active repository is `vellyalis/dpkr-helix` on `main`.
- The product and repository presentation use the `dpkr helix` name.
- The upstream MIT license and copyright notice are retained.
- GOAL_08 defines the measured same-snapshot parity suite, model/profile
  selection, bounded start context, review freshness, structured user input,
  and bounded wait behavior.
- GOAL_08's completed units are MWU-08.01 through MWU-08.06. P01-P08 and the
  result template are frozen; the current baseline, rejected medium candidate,
  rejected High hard subset, final boundary-metadata candidate, metadata audit,
  bounded start context, model-visible review freshness, structured outcomes,
  bounded wait, and signed-in parity acceptance are recorded. The measured
  current setting is retained and GOAL_08 is DONE.

## GOAL_09 completed release

- Public/private responsibility boundary defined:
  - tracked source owns product code, tests, generic documentation,
    attribution, public policies, and release checks;
  - each installation owns credentials, account configuration, endpoint,
    local paths, runtime IDs, logs, and machine recovery state.
- `.tmp/`, `.agents/state/`, `cloudflare/`, `.env`, credential bundles, and
  private-key-shaped files are excluded from normal Git adds.
- Public Security, Contributing, Notice, and release-runbook documents are
  present and mutually consistent.
- The upstream Funding file was removed because this fork does not own the
  upstream sponsor destination.
- npm publication is disabled while runtime compatibility identities remain
  unchanged.
- A Node-standard-library `check-public-release` gate runs locally and in CI.
- Current State and Handoff were compacted to remove machine-specific endpoint,
  account, workspace, agent, operation, process, and billing history.
- The public dashboard image uses visibly synthetic demo data and tracked binary
  assets are fixed to reviewed SHA-256 values.
- A repository-external parentless clean proof passed install, production audit,
  reachable-history inspection, typecheck, full tests, and build.
- Independent A2 review R1 findings were fixed; focused R2 found no unresolved
  S0-S2 issue.
- Independent A3 review findings were resolved through R7.
- An unauthenticated public clone passed install, production audit, history
  inspection, typecheck, full tests, build, package inspection, and Windows
  setup `Plan`.
- Public-runner portability fixes preserve logical workspace identity while
  matching macOS aliases and Windows long/short paths, provision ripgrep on
  macOS, and passed independent focused review through R6.

## Security boundary

- dpkr helix is remote access to approved local project roots.
- OAuth approval protects the MCP endpoint.
- File tools enforce workspace/root boundaries.
- Shell execution uses the local user's operating-system permissions and is not
  an OS sandbox.
- Dashboard/admin routes must remain loopback-only.
- Real credentials, hostnames, account IDs, local user paths, and runtime IDs
  must not enter tracked docs, tests, handoff state, logs, or screenshots.

## Sources of truth

| Responsibility | Source |
| --- | --- |
| Product Goal and requirements | `01_GOAL_MODEL.md`, `02_REQUIREMENTS.md`, Goal files |
| Architecture and security | `04_ARCHITECTURE.md`, `06_SECURITY_AND_PERMISSIONS.md`, `docs/security.md` |
| Implementation order | `08_IMPLEMENTATION_PLAN.md` |
| Current project state | `09_PROJECT_STATE.md` |
| Important decisions | `10_DECISIONS.md` |
| Append-only sanitized milestones | `15_STATE_LEDGER.md` |
| Public roadmap summary | `docs/ROADMAP.md` |
| Public cutover | `docs/PUBLIC_RELEASE.md` |
| Actual implementation | Git and source |
| Actual behavior | fresh tests and direct observations |

## Resume sequence after a cleared session

1. Read repository-root `AGENTS.md`.
2. Read `CODEX_IMPLEMENTATION_PROMPT.md`.
3. Read this file and `09_PROJECT_STATE.md`.
4. Reconcile `git status --short --branch`, `git log -5 --oneline`, and the
   current remote.
5. Confirm GOAL_09 remains `DONE`; do not repeat its one-time clean-root cutover.
6. Confirm the operational-comfort checkpoint and current local/public health.
7. Confirm GOAL_08 and GOAL_09 remain DONE; do not recreate or rerun their
   frozen evidence without a new user-selected Goal. WS-UPD-01 is complete on
   `main` and in the installed runtime.

Do not recreate GOAL_01 through GOAL_08 documents. Do not start public cutover
commands merely because the preparation work is complete.

## Completed verification

- `npm run check:public` and parentless `check:public:history`
- clean `npm ci --no-audit` and `npm run audit:production`
- focused tests, `npm run typecheck`, full `npm test`, and `npm run build`
- `npm pack --dry-run` with no control-center State/Handoff content
- diff validation and independent A2 review through focused R2
- independent A3 cutover review through focused R7
- unauthenticated public clone acceptance
- public visibility, vulnerability reporting, and branch-protection verification
- hosted Ubuntu, macOS, and Windows CI run `30570280066`
- 2026-08-01 operational maintenance: real no-focus Codex review probe,
  focused reviewer approval after one accepted finding, recovery fault tests,
  desired-state and operation-race fault injection, live idempotent Start,
  typecheck, full tests, production audit, build, and fresh local/public health
- 2026-08-01 self-update automated proof: MCP catalog/annotation and path-
  redaction tests; duplicate/crash/corrupt-status recovery; clean/main/origin/
  preflight-race and rollback fault tests; full tests; Windows setup/recovery
  unit and isolated integration tests; typecheck; build; production audit with
  zero vulnerabilities; package dry run
- hosted CI runs `30695131888` and `30695948042`, each passing Ubuntu, macOS,
  and Windows after closing deployment portability and hidden-launch defects
- live physical package and exact dependency proof; managed script equality;
  doctor exit `0`; desired-running state; local/public health; and an installed
  controller request that ended `UP_TO_DATE` with the same request ID
- 2026-08-01 comfort/failure-tolerance proof: sanitized runtime-log analysis,
  before/after retained-session heap measurement, independent ultra-reasoning
  review, exact rollback-archive and process-tree probes, focused setup/update/
  recovery tests, two isolated Windows lifecycle passes, full tests, typecheck,
  production audit with zero vulnerabilities, public check, build, and hosted
  Ubuntu/macOS/Windows CI
- 2026-08-02 MWU-08.01 fixture proof: manifest/artifact digest validation;
  deterministic seed commits; 32 generated workspaces with one commit, starting
  diff, and status per case; expected initial pass/fail boundaries for P01-P08;
  P07's greater-than-5.5-second verification; P04 pre-existing-work hash; and
  P08 outside-workspace synthetic-canary/no-output setup
- 2026-08-02 MWU-08.01 current-baseline proof: 32 required attempts and four
  disagreement tie-breaks; 36 schema-valid terminal records; clean generated-
  evidence canary scan; Web plus helix 8/8 majority passes versus local Codex
  4/8; no product, model-default, authentication, or publication change
- 2026-08-02 MWU-08.01 first-candidate proof: 32 required attempts and three
  disagreement tie-breaks; 35 schema-valid terminal records; valid tie-break
  use; clean generated-evidence canary scan; Web plus helix 6/8 and local Codex
  5/8; mixed delegated-provider metadata recorded; mandatory regression-based
  rejection; no product, profile/default, authentication, or publication change
- 2026-08-02 MWU-08.01 closure proof: P01/P02/P05/P07 conditional High subset;
  16 required attempts and two valid Web tie-breaks; 18 schema-valid records;
  local 3/4 and Web 1/4; mandatory boundary-based rejection; metadata M01/M02
  pass and negative M03 unnecessary-tool failure; current setting retained
- 2026-08-02 MWU-08.02 repository-context proof: clean/dirty/detached/non-Git/
  missing/truncated/nested fixtures; accurate untracked-binary metadata; user
  index/HEAD/ref/status/content no-mutation checks; plain/structured MCP
  compatibility; focused tests; typecheck; full regression; build; public/diff
  gates; and independent A2 review through focused R2
- 2026-08-02 MWU-08.03 review/freshness proof: append-only v7 migration and
  legacy-null persistence; canonical typed-process fingerprint capture; 128-KiB
  UTF-8 patch and 200-file bounds; explicit binary/unavailable/truncation and
  fresh/stale/unknown/failed/running/missing states; policy-before-agent lookup;
  unknown/cross-workspace/wrong-root rejection before checkpoint mutation;
  first-text/card compatibility; focused tests; typecheck; full and policy
  regression; production build/audit; public/diff gates; independent A2 R1
  with zero findings
- 2026-08-02 MWU-08.04 structured-outcome proof: Codex per-turn output schema;
  exact/over-limit and invalid cross-field checks; malformed-output error;
  nullable v8 persistence/restart; distinct blocked/waiting projection without
  verification claims; same-agent and same-provider-session continuation;
  legacy-provider compatibility; focused tests; typecheck; full and policy
  regression; production build/audit; diff gate; independent A2 R1's sole S3
  finding fixed and R2-confirmed with no new S0/S1 defect
- 2026-08-02 MWU-08.05 bounded-wait proof: optional integer `waitMs` 0..30000;
  omission/zero compatibility; bounded live transition and active timeout;
  completed/input/error/stopped paths; plain/structured MCP timeout metadata;
  no duplicate worker/provider call; focused tests; typecheck; full and policy
  regression; production build/audit; public/diff gates; fixed A2 R1 S3 proof
  candidate and zero-finding focused R2
- 2026-08-02 ChatGPT self-update publication recheck: public zero-input
  request/status tools match local source; system-update tests, sanitized
  installed `UP_TO_DATE` state, stable-endpoint configuration, current-tree
  public gate, and public commit reachability pass; the approved fast-forward
  push published `cbfb446` to `origin/main`
- 2026-08-02 cross-platform publication repair: the failing macOS/Windows
  repository-context boundary was reproduced with a physical path alias,
  repaired by canonicalizing the existing Git/workspace roots, and verified by
  local focused/full/typecheck/build/public gates plus three-platform hosted CI
  run `30749192172`; follow-up source commit `0aaa59c` is public
- 2026-08-02 automatic catalog convergence: source commit `3fa1c49` sends one
  standard tool-list-change notification after initialization; a real SDK
  client re-listed both update tools; focused/full/typecheck/build/audit/public
  gates and hosted three-platform CI run `30752498799` pass. Live ChatGPT Web
  retained the old catalog until its approved developer-mode connection update
  was automated, then exposed both tools and returned `UP_TO_DATE` through
  `get_dpkr_helix_update_status` in a fresh chat
- 2026-08-03 WS-QA-09 resume preflight: clean `main` at `c4914ee`, frozen suite
  SHA-256 `e40d2260abcdac3dd4ecdd33c18e66e30653b08e2eb3c052bff5a82261160b17`,
  materializer validation, and all 96 workspace HEAD/diff/status/metadata/result
  templates pass with zero drift; no provider or evaluation turn ran

## Exact next action

On 2026-08-04, follow
`evals/codex-parity/v1/EFFORT_COMPARISON_RUNBOOK.md`. Repeat the Git and suite
freshness checks, confirm the prepared-root hashes against the State Ledger,
and run P05 attempt 1 as the model/effort attribution canary for all six
surface/effort cells. Only then run the remaining complete P01-P08 matrix. A
delegated managed `gpt-5.5` fallback is capability-blocked, not a 5.6-sol
result. Do not change installed defaults before the comparison is accepted.
