# DevSpace Control Center Handoff

Last synchronized: 2026-07-31

## Current position

- Current work unit: GOAL_09 Public Release Readiness.
- GOAL_01 through GOAL_07: DONE.
- GOAL_08 Codex-Parity Coding Quality: design accepted; implementation
  `NOT_STARTED`.
- GOAL_09: `CUTOVER_BLOCKED`; the owner approved publication, local clean-root
  proof passed, and repository visibility remains PRIVATE while permanent
  deletion approval is requested for eight pre-public Actions workflow runs.
- Installed working directory: unchanged.
- Remote history replacement, visibility change, tag, release, and npm
  publication: not performed.
- The verified preparation is committed and normally pushed to the still-private
  `origin/main`.
- The latest hosted CI run assigned no runner and executed no steps because
  GitHub reported an account billing/payment or spending-limit blocker. Local
  clean proof passed; do not present this external failure as a code failure.
- A verified recovery bundle was created outside the repository. A parentless
  root attributed only to the intended GitHub maintainer passed clean install,
  production audit, history inspection, typecheck, full tests, build, package
  inspection, and Windows setup `Plan`.
- Independent A3 cutover review found that eight completed Actions runs preserve
  pre-public head-SHA references. They must be permanently deleted before
  visibility changes, but deletion requires separate owner approval.

## Completed before this work unit

- The active repository is `vellyalis/dpkr-helix` on `main`.
- The product and repository presentation use the `dpkr helix` name.
- The upstream MIT license and copyright notice are retained.
- GOAL_08 defines the measured same-snapshot parity suite, model/profile
  selection, bounded start context, review freshness, structured user input,
  and bounded wait behavior.
- GOAL_08's first eligible implementation unit remains MWU-08.01: freeze
  P01-P08 and record the current local-Codex versus Web-plus-helix baseline
  before changing product code or model defaults.

## GOAL_09 completed local preparation

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
5. If GOAL_09 is `CUTOVER_BLOCKED`, do not publish until the recorded deletion
   approval is available; then continue the exact next action below.
6. Return to GOAL_08 MWU-08.01 only after GOAL_09 is completed or the owner
   explicitly cancels the cutover.

Do not recreate GOAL_01 through GOAL_08 documents. Do not start public cutover
commands merely because the preparation work is complete.

## Completed verification

- `npm run check:public` and parentless `check:public:history`
- clean `npm ci --no-audit` and `npm run audit:production`
- focused tests, `npm run typecheck`, full `npm test`, and `npm run build`
- `npm pack --dry-run` with no control-center State/Handoff content
- diff validation and independent A2 review through focused R2

## Exact next action

Obtain explicit approval to permanently delete the eight completed pre-public
Actions workflow runs. Then delete and verify them, regenerate the parentless
root from the final reviewed tree, exact-lease force-push, change visibility,
enable post-public security controls, and run public-clone acceptance. Do not
announce while hosted CI runner allocation remains blocked.
