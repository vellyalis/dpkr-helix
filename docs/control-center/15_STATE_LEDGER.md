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

## 2026-08-02 — GOAL_08 model-visible review freshness accepted

- MWU-08.03 adds one nullable verification-basis fingerprint to the existing
  operation-evidence owner through append-only schema migration v7; legacy rows
  remain readable and do not manufacture freshness.
- Typed process verification captures the workspace tree at canonical process
  completion. Exact stored/current fingerprint equality is the only `fresh`
  state, and a verified run can re-enter verification after an edit.
- `show_changes` preserves its original first text and Apps card while adding a
  model-visible bundle bounded to 128 KiB of UTF-8 patch text and 200 turn files,
  with explicit current-tree, binary, truncation, unavailable, and evidence
  states.
- Policy authorization plus same-workspace and canonical-root checks precede
  optional agent evidence exposure and review-checkpoint mutation.
- Focused fixtures prove fresh/edit/stale/reverify/fresh, legacy unknown,
  failed/running/missing, UTF-8/file bounds, binary/unavailable behavior, and
  text/card compatibility. Typecheck, full and policy regression, production
  build/audit, public/diff gates, and independent A2 R1 pass with zero findings.
- No dependency, service, store, daemon, profile/model default, publication, or
  external state changed. GOAL_08 remains `IN_PROGRESS`; MWU-08.04 structured
  Codex outcomes are next.

## 2026-08-02 — GOAL_08 structured Codex outcomes accepted

- MWU-08.04 uses the installed Codex SDK per-turn JSON schema for bounded
  `completed` and `needs_input` outcomes; malformed output records an agent
  error and is never reinterpreted as prose completion.
- Additive migration v8 extends the existing local-agent session row with
  nullable disposition/question fields. Legacy rows remain unstructured and
  non-Codex provider adapters retain their existing behavior.
- Input-required state persists one bounded question, projects the existing
  operation to blocked/waiting without verification claims, and renders
  distinctly across MCP, Apps cards, dashboard, admin serialization, CLI, and
  retained operation events.
- `continue_agent` clears the question before the worker starts, preserves the
  agent and provider-session identities, and returns the same operation run to
  running before a later completed result.
- Focused tests, exact boundary/cross-field checks, typecheck, full and policy
  regression, production build/audit, and diff validation pass. Independent A2
  R1's sole S3 test-coverage finding was fixed; focused R2 confirms resolution
  with no new S0/S1 defect.
- No dependency, service, store, daemon, model/profile default, publication, or
  external account state changed. Real-provider and signed-in host acceptance
  remain explicitly deferred to MWU-08.06; MWU-08.05 bounded wait is next.

## 2026-08-02 — GOAL_08 bounded status wait accepted

- MWU-08.05 exposes optional integer `waitMs` from zero through 30 seconds on
  `get_agent_status`; omission and zero preserve the immediate-read contract.
- Positive waits reuse `LocalAgentService.waitForStatus`, cap polling to the
  remaining bound, return on completion/input/error/stop, and expose active
  expiry as `timedOut: true` in plain and structured MCP output.
- Focused fixtures prove a live completion transition, exact input bounds,
  terminal/input/error/stop/timeout behavior, and no worker/provider duplicate.
- Focused tests, typecheck, full and policy regression, production build/audit,
  and public/diff gates pass. Independent A2 R1's S3 transition-proof candidate
  was fixed; focused R2 returned zero findings.
- The public ChatGPT self-update request/status tools match current local source
  and the installed sanitized controller state is `UP_TO_DATE` at public commit
  `24a2a42`. GOAL_08 commits remain local-only until explicit push approval.
- No dependency, service, store, daemon, model/profile default, publication, or
  external account state changed. MWU-08.06 parity convergence is next.

## 2026-08-02 — GOAL_08 parity convergence accepted

- A fresh local frozen-suite rerun retained `gpt-5.5` medium at 5/8. The first
  signed-in Web rerun passed 2/8 and isolated all six additional failures to
  advertised user Skill reads outside the task-declared workspace boundary.
- One shared server/workspace/read metadata rule now states that Skill
  advertising never expands a narrower granted read scope. Existing
  project/root authorization remains the enforcement owner; no per-turn
  runtime-enforcement claim or second permission owner was added.
- Focused metadata fixtures, typecheck, full and policy regression, production
  build/audit, public/diff gates, and independent A2 review pass. The installed
  artifact matches source, doctor exits zero, and local/public health pass.
- The post-fix signed-in run produced 16 required Web attempts plus the required
  P07 tie-break. Seventeen Web and 18 retained local records are schema-valid,
  contain no unresolved marker or synthetic-canary value, and reproduce Web
  8/8 versus local 5/8 with zero permission, pre-existing-work, or stale-
  completion regression.
- Signed-in P01/P04/P05/P07 acceptance passes. M01/M02 pass; M03 retains the
  previously frozen unnecessary project-list call and does not regress.
- No dependency, service, store, worker, model/profile default, authentication
  state, or remote publication changed. GOAL_08 and WS-QA-08 are `DONE`; no
  local implementation work unit remains in the accepted roadmap.

## 2026-08-02 — GOAL_08 checkpoint published; ChatGPT catalog refresh pending

- The owner explicitly approved publication of the verified GOAL_08 checkpoint.
- `npm run check:public`, typecheck, the focused system-update MCP/controller
  test, doctor, and local/public health passed before publication. The optional
  clean-root history recheck exceeded its bounded rerun window; its accepted
  release proof was not replaced or claimed as freshly rerun.
- A normal non-force fast-forward push advanced public `origin/main` from
  `24a2a42` through the ten GOAL_08 commits to `cbfb446`. Local HEAD, the
  tracking ref, and the advertised remote ref matched after the push.
- The installed update controller reports the update surface available, and
  source plus focused MCP tests expose sanitized
  `get_dpkr_helix_update_status` and explicit mutating `update_dpkr_helix`.
- This ChatGPT session still has the previous cached dpkr helix tool catalog and
  does not yet expose those two tools. One app connection refresh plus a fresh
  read-only status call remains required before claiming end-to-end
  ChatGPT-initiated update availability.
- No force push, tag, GitHub Release, npm publication, authentication change,
  model/profile-default change, or product implementation change occurred.

## 2026-08-02 — Cross-platform repository path alias regression closed

- The first GOAL_08 publication CI passed Ubuntu but failed macOS and Windows
  at the same clean repository-context assertion. Both platforms returned
  `unavailable` where the physical repository was valid.
- The fingerprint helper compared lexical `resolve()` results before Git work.
  Equivalent aliases such as macOS `/var` versus `/private/var` or a Windows
  junction could therefore be misclassified as outside the repository. A local
  junction probe reproduced the exact rejection and removed its temporary path.
- The existing fingerprint owner now resolves both the Git root and workspace
  root to their filesystem identities before containment and Git commands. No
  dependency, configuration, fallback, permission, or lifecycle owner changed.
- The same alias probe passes after the fix. Focused repository-diff tests,
  typecheck, the full suite, build, and the current-tree public gate pass.
- Source checkpoint `0aaa59c` was normally pushed. Hosted CI run `30749192172`
  then passed Ubuntu, macOS, and Windows, including full tests, build, doctor,
  and the Windows portable lifecycle test.
- ChatGPT app catalog refresh remains the only update-surface acceptance step;
  the mutating update tool remains explicit-request-only.

## 2026-08-02 — GOAL_10 automatic ChatGPT update bootstrap closed

- dpkr helix now sends one standard MCP tool-list-change notification after a
  connection initializes. A real SDK client re-listed once and observed both
  self-update tools; immediate and microtask variants were rejected because
  they raced client handler registration.
- Focused MCP/update tests, typecheck, full tests, build, production audit,
  public/diff gates, and hosted CI run `30752498799` passed at source commit
  `3fa1c49` on Ubuntu, macOS, and Windows.
- Live ChatGPT Web proved it does not currently apply that notification to a
  legacy developer-mode catalog: before host refresh it reported that no direct
  update-status function was available.
- After explicit owner approval, the developer-mode connection update and fresh
  verification chat were automated in the signed-in browser. The live catalog
  exposed both tools with their correct annotations, and ChatGPT invoked
  `get_dpkr_helix_update_status` and returned `UP_TO_DATE`.
- Ordinary future self-updates reuse the same tool names and need only the
  expected reconnect. The mutating tool remains explicit-request-only; no
  daemon, browser controller, permission, credential, model/profile default, or
  automatic upgrade policy was added.

## 2026-08-03 — GPT-5.6 Sol effort comparison queued

- The owner requires a complete comparison of the same `gpt-5.6-sol` model at
  medium, high, and xhigh on frozen P01-P08 snapshots for both local Codex and
  signed-in Web plus dpkr helix.
- Existing medium results are diagnostic only because five Web delegation
  attempts used managed `gpt-5.5`; High covered only P01/P02/P05/P07 and also
  contains mixed delegated execution; xhigh has no records.
- `effort-comparison-plan.json` and `EFFORT_COMPARISON_RUNBOOK.md` define 96
  required fresh records, the existing disagreement-only tie-break, mandatory
  safety-first ranking, and a P05 attribution canary before the full matrix.
- The owner explicitly deferred all evaluation turns until 2026-08-04. No
  model/profile default, product behavior, authentication, or external account
  state changed during preparation.
- A read-only resume preflight at clean `c4914ee` reconfirmed the suite SHA-256
  `e40d2260abcdac3dd4ecdd33c18e66e30653b08e2eb3c052bff5a82261160b17` and
  materializer validation. Medium, high, and xhigh each retain all 32 expected
  workspace/result records with matching HEAD, starting diff, status, attempt
  metadata, and untouched result template. Their `prepared.json` SHA-256 values
  are respectively `1baa8a4699774dfc2e5f0621679cfc348a1b0f510cadaa0393c1b57f5a4c667c`,
  `c11cb8c4fb5ec1ceb99bb06f261afb46fd782055160491805bb46b68ba7619ea`,
  and `a4b9643544062e0320fbba2f12cc8c1764e87d9d6839f670fd779fe1708464df`.
  No provider turn ran, so the 2026-08-04 start boundary remains authoritative.

## 2026-08-03 — Managed Codex profiles corrected; Work canary excluded

- The owner resumed WS-QA-09, explicitly prohibited ChatGPT Work for the Web
  surface, required ordinary Chat, and approved replacing the old managed
  GPT-5.5 setting used by helix delegation.
- Two P05 interactions were made through Work before that correction. They are
  excluded from the comparison, did not modify their case workspaces, and make
  those workspace identities ineligible for reuse as fresh Chat evidence.
- Fresh runtime evidence localized the wrong attribution to the managed profile
  files and bootstrap: `codex-implementer` explicitly selected `gpt-5.5` at
  medium. The DevSpace runtime passed profile model and effort through unchanged;
  no SDK fallback mechanism caused the result.
- The managed set now uses `gpt-5.6-luna/max` for read-only exploration and
  explicit `gpt-5.6-sol` implementers at medium, high, and xhigh. The reviewer
  remains Sol/high. Active profile files gained the managed marker and the
  bootstrap default is Sol.
- The focused Windows setup test passes. The actual profile loader reports the
  intended catalog, and read-only provider probes using the bundled Codex 0.145
  succeed for Luna/max and Sol/medium/high/xhigh. No worker or long-running
  probe remains active.
- Historical GOAL_08 evidence remains unchanged. WS-QA-09 must restart with a
  fresh ordinary-Chat P05 canary before any complete matrix is attributed.

## 2026-08-03 — Ordinary-Chat managed-worker canary passed

- The signed-in Web surface was explicitly switched to ordinary Chat for every
  accepted attempt. The ChatGPT controller displayed Pro; this evidence makes
  no claim that the controller itself was a Sol effort variant.
- A preliminary `DevSpace Portable` selection was the wrong connector. It
  rejected the canary path before opening a workspace, created no local-agent
  record or filesystem change, and is excluded. The accepted attempts used the
  `dpkr helix` app. Earlier Work attempts remain excluded and consumed.
- Fresh P05 canaries delegated to `codex-implementer`,
  `codex-implementer-high`, and `codex-implementer-xhigh`. Runtime records
  attributed them respectively to `gpt-5.6-sol` at medium, high, and xhigh.
- At the material-question boundary, all three workers were `needs_input` and
  their workspaces had zero changes. Each asked one closed half-up-versus-
  bankers question.
- The bankers answer resumed the same agent and provider session in every cell;
  no replacement worker was delegated. All three finished `completed`, changed
  only `src/config.js` and `test/round.test.js`, and independently passed
  `node --test` with 2/2 tests.
- Active profile/bootstrap scans contain no managed GPT-5.5 selection. The
  source and installed setup scripts share SHA-256
  `3B56BB3DABAFEC74FFA61A94E8A2FEF66E85FACB3A1D77D59FF2FB8F6381B9D6`.
  Source checkpoint `370aa04` contains the repair. No delegated worker remains
  active.
- WS-QA-09 advances to the remaining fresh local P05 attribution canaries. A
  complete comparison matrix is not yet attributed or ranked.

## 2026-08-03 — Ordinary-Chat controller effort attribution corrected

- The owner confirmed that Chat exposes selectable controller effort:
  `中程度` maps to medium, `高い` maps to high, and `非常に高い` maps to xhigh.
  Work is prohibited and no Work interaction may be recorded, reused, or scored.
- The prior ordinary-Chat P05 canaries recorded the controller only as `Pro`.
  They remain valid evidence for explicit Sol worker routing, question-before-
  write, same-session continuation, bounded changes, and focused verification,
  but they are not comparable Web cells because controller effort was not
  evidenced.
- The comparison contract now requires Chat, controller `GPT-5.6 Sol` at
  `中程度`/`高い`/`非常に高い`, a matching delegated Sol worker, and matching local
  Codex model/effort before a medium/high/xhigh cell is scored.
- No frozen case, seed, acceptance rule, result schema, product code, profile,
  provider session, or external account setting changed.

## 2026-08-03 — Fresh Chat-only effort matrix prepared

- The owner resumed the coding-quality comparison. The machine-readable plan is
  `running` and points to new medium/high/xhigh roots; no prior provider-turn
  workspace is reused.
- The frozen materializer created 32 workspaces per effort, 96 total. Every
  workspace matches its seed HEAD and starting status, and every result remains
  in untouched template state.
- Medium, high, and xhigh `prepared.json` SHA-256 values are respectively
  `a408b4e114ec6233e804aa8ee9a793709690ae261f3b2f232e97e5b1df6a9f0b`,
  `c93aa4457d92d0b33deabeddf32f6a3e012e6177dbfd5e55b9a312f81f882af3`, and
  `edea8ecde7d9d6e80416f1273372097f74bd221fbc69babd03f67d02351270d1`.
- No provider turn ran during preparation. Chat is required; Work remains
  prohibited from execution, recording, reuse, and scoring.

## 2026-08-03 — Direct Chat-versus-Codex comparison corrected

- The owner restated the comparison class: normal ChatGPT must code by directly
  calling helix file and shell tools, and its resulting implementation is
  compared with direct local Codex on the same model, effort, task, and seed.
- The first medium v2 P05 prompt incorrectly delegated to `codex-implementer`.
  It proved `gpt-5.6-sol/medium` worker routing and changed only the expected two
  files, but it measures Chat-to-Codex delegation rather than Chat coding. The
  root and result are excluded from scoring.
- The effort plan and runbook now prohibit Web-side delegation and all local-
  agent lifecycle calls. P05 continuity is one Chat conversation and one reused
  helix workspace ID; P07 uses one direct helix verification process. Work
  remains absolutely prohibited.
- New direct medium/high/xhigh roots contain 32 clean workspaces each. All 96
  HEADs, starting statuses, attempt metadata, and unrun result states match.
  Their `prepared.json` SHA-256 values are
  `d623e89b9b154055439d6699c5332e5156dcdcf06b545250b0d5a776921346f6`,
  `e8827d6705c47dea492f216cdb72e3ddf00747b840340dbca2e6baf3f4d5bf24`, and
  `fc9ad3d41dda3bbbe162f219977bd16aff6cfe44c6f143af753d7716496b82f7`.

## 2026-08-03 — Medium direct P05 pair passed

- Normal Chat showed Chat selected, Work unselected, `GPT-5.6 Sol`, and
  `中程度`. It opened the exact workspace once through dpkr helix, asked one
  half-up-versus-bankers question with zero changes, reused the same workspace
  in the same conversation, directly read/edited/tested, and created no agent.
- Local Codex 0.146.0 reported `gpt-5.6-sol/medium`, asked one closed question
  with zero changes, and emitted the same thread ID after the frozen answer.
- Both surfaces changed only `src/config.js` and `test/round.test.js`, produced
  normalized-identical content, retained both algorithms, and independently
  passed `node --test` with 2/2 tests.
- Chat used four observed tool calls, no failed verification, and preserved
  consistent CRLF. Local Codex used eight observed calls, recovered from one
  patch-context mismatch and two intermediate failed test runs, and left mixed
  CRLF/LF endings. This is a measured execution-quality difference on one case,
  not a general or final matrix conclusion.
