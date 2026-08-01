# DevSpace Control Center Handoff

Last synchronized: 2026-08-02

## Current position

- Current work unit: GOAL_08 MWU-08.01 baseline and configuration selection;
  the fixture-freeze phase is complete and external baseline execution remains.
- GOAL_01 through GOAL_07: DONE.
- GOAL_08 Codex-Parity Coding Quality: `IN_PROGRESS`; P01-P08 manifests,
  deterministic snapshots, metadata prompts, and the result contract are frozen.
- GOAL_09: `DONE`; the clean-history source repository is PUBLIC and public-clone
  acceptance passed.
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

## Completed before this work unit

- The active repository is `vellyalis/dpkr-helix` on `main`.
- The product and repository presentation use the `dpkr helix` name.
- The upstream MIT license and copyright notice are retained.
- GOAL_08 defines the measured same-snapshot parity suite, model/profile
  selection, bounded start context, review freshness, structured user input,
  and bounded wait behavior.
- GOAL_08's active unit is MWU-08.01. P01-P08 and the result template are
  frozen; current local-Codex versus Web-plus-helix attempts, the candidate
  comparison, and configuration adoption remain before any product feature or
  model-default change.

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
7. Continue GOAL_08 at MWU-08.01 from the generated/frozen suite; do not
   recreate its manifests. WS-UPD-01 is complete on `main` and in the installed
   runtime.

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

## Exact next action

After explicit approval for external model/browser submissions, run the frozen
current `gpt-5.5` medium baseline twice per surface and record sanitized results.
Then compare `gpt-5.6-sol` at medium before considering high on the hard subset.
