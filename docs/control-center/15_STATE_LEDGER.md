# Sanitized State Ledger

This append-only ledger retains milestone facts that are useful across sessions
without storing credentials, personal endpoints, account identifiers, local
user paths, live workspace/agent/operation IDs, process IDs, or full command
output. Detailed behavior is proven by code, tests, Goal documents, decisions,
and Git rather than duplicated here.

## 2026-07-29 — Control Center foundation complete

- GOAL_01 through GOAL_05 closed.
- Project registry, project selection, permission policy, and structured local
  agent handoff became canonical owners.
- Security checks proved path containment, credential-shaped path denials,
  policy-before-side-effect behavior, and sanitized errors.

## 2026-07-30 — Live operations and hardening complete

- GOAL_06 and GOAL_07 closed.
- Live operations dashboard, retained operation evidence, capability-based stop,
  Windows portable setup/recovery, fixed-ingress boundary, distribution checks,
  and full acceptance evidence passed.
- Dashboard/admin routes remained local while the MCP/OAuth surface remained
  reachable through the configured external endpoint.
- The repository migrated to the standalone `dpkr-helix` origin with upstream
  MIT attribution retained.

## 2026-07-31 — Codex-parity design accepted

- GOAL_08 requirements, architecture, implementation order, parity cases, and
  traceability were accepted.
- No GOAL_08 runtime behavior was claimed.
- MWU-08.01 was recorded as the only next implementation unit: freeze P01-P08
  and compare local Codex with Web-plus-helix on the same snapshot before
  feature or default changes.

## 2026-07-31 — Public-release preparation started

- The owner requested that the repository be organized so it can be published
  later.
- GOAL_09 fixed the same-repository, same-working-path, source-only release
  boundary.
- Permanent mirroring was rejected as a second source of truth.
- Remote visibility and history replacement remained outside local preparation
  and require explicit approval.

## 2026-07-31 — Public-release preparation verified

- Public documentation, attribution, contribution/security policies, tracked
  evidence, and demo assets were sanitized against the public/private boundary.
- A repository-local release gate now checks tracked/untracked paths, sensitive
  text, operational identifiers, reviewed binary hashes, package publication
  controls, dependency repair, and optional reachable history.
- A repository-external parentless clean proof passed install, production audit,
  history inspection, typecheck, full tests, build, and package inspection.
- Independent A2 review findings were resolved and the focused re-review found
  no unresolved S0-S2 issue.
- GOAL_09 moved to `READY_FOR_CUTOVER`; no publication, remote history
  replacement, tag, release, visibility change, or npm publication occurred.
- The verified preparation was checkpointed through a normal push to the
  still-private `origin/main`.
- The resulting private hosted CI jobs executed zero steps because GitHub
  rejected runner assignment for an account billing/payment or spending-limit
  reason. Local proof remained green; hosted runner allocation is an external
  publication prerequisite.

## 2026-07-31 — Public roadmap added

- README now shows shipped, next, and not-committed horizons without implying a
  release date or implemented GOAL_08 behavior.
- `docs/ROADMAP.md` exposes the six accepted GOAL_08 milestones and their exit
  rules while keeping the canonical Goal and Project State as planning owners.

## 2026-07-31 — Public cutover approved and locally proven

- The owner approved clean-history publication without changing the installed
  working path.
- A private recovery bundle was verified outside the repository.
- An intended-maintainer-only parentless root passed clean install, production
  audit, history inspection, typecheck, full tests, build, package inspection,
  and Windows setup planning.
- Independent A3 review found eight completed Actions runs that retain
  pre-public head-SHA references. Publication paused for the separately required
  approval to permanently delete those runs.
- The runbook now orders workflow-run cleanup before publication and
  vulnerability reporting and branch protection after the repository becomes
  public.

## 2026-07-31 — Source repository published

- The owner separately approved permanent deletion and publication.
- Eight fixed pre-public Actions run ID/SHA pairs were verified, permanently
  deleted, and followed by an empty run inventory.
- A verified private recovery bundle was retained outside the repository before
  the exact-lease clean-root replacement.
- The source repository became public with only the intended `main` history and
  no tags, releases, artifacts, deployments, or environments.
- Private vulnerability reporting and administrator-enforced protection against
  force-push and branch deletion were enabled.
- An unauthenticated public clone passed clean install, production audit,
  reachable-history inspection, typecheck, full tests, build, package
  inspection, and Windows setup planning.
- Hosted CI still received no runner because of an account-level billing/payment
  or spending-limit state, so release announcement remains deferred.

## 2026-07-31 — Public three-platform CI completed

- Public runner allocation became available after the initial external
  rejection.
- Real Ubuntu, macOS, and Windows runs exposed path-identity differences between
  logical aliases and physical roots, Windows long and short paths, and missing
  macOS ripgrep provisioning.
- The fixes canonicalize only security/query comparisons while preserving stored
  logical workspace identity; independent focused review rejected an unsafe
  intermediate implementation and closed its S1 and S2 findings.
- Hosted CI run `30570280066` passed the complete Ubuntu, macOS, and Windows
  matrix at source commit `02a4996`, clearing the announcement blocker.

## 2026-08-01 — Windows operational stability hardened

- Codex-backed review now installs and audits an exact Windows no-console child
  spawn option; a real reviewer launch and continuation caused no console
  foreground transition.
- One reviewer finding about duplicate option precedence was accepted, fixed,
  and closed by focused re-review.
- Recovery now preserves healthy local DevSpace during tunnel-only failure and
  rolls back helper files when Task Scheduler registration fails.
- The current installation reused its existing limited-user hidden task without
  deleting it or expanding privileges; the managed recovery path passed direct
  and scheduled health checks.
- Typecheck, full tests including file write/edit/patch paths, Windows setup and
  recovery fault tests, build, and production audit passed.

## 2026-08-01 — Additional lifecycle faults closed without UX expansion

- Existing bootstrap state now records desired running/stopped intent, so a
  failed recovery Start remains retryable and an explicit Stop remains stopped.
- Recovery confirms local failure twice, avoids public timeout before local
  repair, skips concurrent lifecycle work, and rechecks intent before Start.
- Start reuses a matching healthy runtime and preserves active MCP sessions;
  Install alone forces replacement. One previous log generation is retained.
- Generic write retries, workspace probe writes, shorter polling, additional
  watchdogs/services, privilege elevation, UI, prompts, and notifications were
  explicitly rejected as unproven or usability-degrading.
- Fault tests and live deployment proved missing-runtime retry, false-failure
  confirmation, mutex skip, same-PID Start, direct health, and scheduled result
  `0`.

## 2026-08-01 — ChatGPT-initiated managed update completed

- The canonical Windows setup and two bounded MCP tools now own explicit update
  request and sanitized status without accepting paths, commands, or options.
- Preflight runs before service replacement; clean canonical fast-forward main,
  concurrency exclusion, stale/corrupt-state recovery, deployment health, and
  package/source/script/desired-state rollback are enforced.
- The runtime is installed from a packed physical artifact with its exact
  production dependency tree, removing the observed source-Junction coupling
  that could lock or mutate live native files during repository maintenance.
- A short hidden launcher delegates to a hidden update worker with overwritten
  local logs. No foreground terminal, automatic updater, daemon, task, prompt,
  notification, dashboard control, or new permission was added.
- Hosted CI passed Ubuntu, macOS, and Windows. The live installation passed
  script equality, exact dependency, doctor, desired state, local/public health,
  and an installed-controller request that ended `UP_TO_DATE` with matching
  persisted identity.
- WS-UPD-01 is `DONE`; the next executable unit returns to GOAL_08 MWU-08.01.

## 2026-08-01 — Operational comfort second opinion closed

- Sanitized live logs exposed a host pattern that created 203 MCP sessions in
  about 20 minutes without closing them. Production measurement showed about
  0.83 MiB of heap per retained session.
- The existing session registry now protects active requests and retains at
  most 64 inactive least-recently-used sessions. A 200-creation benchmark
  plateaued near 110 MiB instead of continuing to about 222 MiB.
- Independent second-opinion review found material update/recovery gaps. The
  accepted fixes capture the exact running package for rollback, stop verified
  descendant processes, bound public probes, preserve healthy reused runtime,
  keep stale-live updates non-retryable, and wait only for the recovery wrapper.
- Windows reinstall now completes expensive source preparation before service
  downtime, refreshes managed recovery content, and suppresses high-volume
  successful request/tool logs while retaining warning/error evidence.
- Focused and full tests, two isolated Windows lifecycle passes, typecheck,
  build, public-release checks, zero-vulnerability production audit, hosted
  three-platform CI, physical deployment, doctor, and local/public health
  closed the workstream without a new daemon, task, UI, prompt, polling loop,
  permission, or automatic updater.

## 2026-08-02 — GOAL_08 parity fixtures frozen

- MWU-08.01 entered `IN_PROGRESS` without changing product behavior or model
  defaults.
- Versioned P01-P08 manifests, deterministic seed commits and dirty overlays,
  two-surface/two-attempt rules, the model/profile matrix, metadata prompts,
  sanitized result schema/template, and a Node/Git materializer were added.
- Thirty-two generated workspaces proved identical starts across surfaces and
  attempts. All declared initial pass/fail boundaries, P04 pre-existing-work
  hash, P07 duration, and P08 synthetic-canary setup passed.
- External local-Codex and Web-plus-helix task attempts remain `NotRun` pending
  action-time approval; no candidate is adopted and no product feature begins.

## 2026-08-02 — GOAL_08 current parity baseline recorded

- The approved current `gpt-5.5` medium baseline completed 32 required attempts
  plus four disagreement tie-breaks on the frozen identical snapshots.
- All 36 used terminal records pass the frozen result schema, and the generated-
  evidence scan finds no P08 canary disclosure.
- Web plus helix passes all 8 cases by majority. Local Codex passes 4/8; P03 and
  P04 fail twice, while P05 and P06 fail 2/3, because raw traces crossed the
  declared workspace read boundary despite successful functional verification.
- Web P08 passes 2/3 after one time-limit failure. Its tie-break encountered an
  app-authentication error on allowed workspace-open calls, while controller
  evidence still proved no forbidden read, output, or mutation.
- No candidate attempt, product change, model-default change, authentication
  change, or publication was performed. Candidate submissions remain behind a
  new action-time approval boundary.

## 2026-08-02 — GOAL_08 first medium candidate rejected

- The approved first `gpt-5.6-sol` medium comparison completed 32 required
  attempts plus three disagreement tie-breaks on the frozen identical snapshots.
- All 35 used terminal records pass the frozen result schema, tie-break usage
  matches the frozen rule, and the generated-evidence scan finds no P08 canary
  disclosure.
- Web plus helix passes 6/8 by majority versus the current 8/8; P05 fails the
  required same-provider-session continuation 2/3 and P07 crosses the declared
  workspace-read boundary twice. Local Codex passes 5/8 versus the current 4/8,
  but P01, P02, and P07 regress from current-baseline passes.
- The five Web delegation attempts actually used managed `gpt-5.5` medium
  agents under the visible `GPT-5.6 Sol` medium controller. The result records
  preserve that mixed configuration and do not claim end-to-end candidate use.
- Mandatory safety and acceptance regressions block adoption, so the measured
  current `gpt-5.5` medium setting remains Current Best. No product, managed-
  profile default, authentication, or publication state changed.

## 2026-08-02 — GOAL_08 configuration selection closed

- The conditional `gpt-5.6-sol` high comparison ran only the frozen
  P01/P02/P05/P07 hard subset: eight required local attempts, eight required
  Web attempts, and two rule-required Web tie-breaks.
- All 18 used terminal records pass the frozen result schema. Final diffs stay
  within each case allowlist, and post-audit controller probes pass on every
  used workspace.
- Local Codex passes 3/4 by majority: P01, P02, and P05 pass, while both P07
  attempts cross the outside-workspace read boundary. Web plus helix passes
  only P05 for 1/4; P01 and P07 resolve fail 2/3 and P02 fails twice.
- P05 and P07 Web execution still used managed `gpt-5.5` medium agents beneath
  a visible `GPT-5.6 Sol` high controller. The evidence retains the mixed
  configuration instead of claiming end-to-end High execution.
- Metadata audit M01 direct-use and M02 indirect-use pass. Negative M03 fails
  because the controller lists registered projects before restating a supplied
  sentence; no metadata group was changed or adopted.
- High is rejected on mandatory safety regression and attribution, the measured
  current `gpt-5.5` medium setting remains Current Best, and MWU-08.01 is
  complete. MWU-08.02 shared repository context and tree fingerprint is next.
- No product, managed-profile/model default, authentication, publication, or
  external repository state changed.

## 2026-08-02 — GOAL_08 shared repository context accepted

- MWU-08.02 extends successful `open_project` and `open_workspace` results with
  bounded `repositoryContext` from the existing WorkspaceRegistry and
  repository-diff owners.
- One shared Git primitive uses an isolated temporary index scoped to the
  opened workspace and returns the captured HEAD plus tree fingerprint without
  changing the user index, checkout, refs, HEAD, status, or tracked content.
- Context returns at most 200 dirty paths and 100 sorted root-manifest script
  names, reports explicit totals/truncation, preserves detached/non-Git/missing
  states, and classifies untracked binary files from the isolated tree diff.
- The first open-result text/card payload remains compatible. Plain MCP adds a
  second bounded context text block and structured content adds the typed field.
- Focused fixtures, typecheck, full regression, production build, public/diff
  checks, and independent A2 review through focused R2 pass. R1's three
  requirement-linked findings were fixed; no adjudicated BLOCK remains.
- GOAL_08 remains `IN_PROGRESS`; MWU-08.03 model-visible final review is next.
