# Project State

Last synchronized: 2026-08-02

## Current state

- Repository: `vellyalis/dpkr-helix`
- Branch: `main`
- Visibility: PUBLIC
- Working directory: unchanged
- Product name: `dpkr helix`
- Compatibility identities: npm `@waishnav/devspace`, CLI/MCP `devspace`,
  local storage `.devspace`
- Distribution model: source repository; npm publication intentionally disabled
- Upstream: `Waishnav/devspace`
- License: MIT, upstream copyright retained
- Public `origin/main`: parentless release root plus public-safe release state
- Public roadmap: `docs/ROADMAP.md`; GOAL_08 remains the canonical next-program
  contract
- Current program unit: GOAL_08 MWU-08.03 model-visible final review is next.
  MWU-08.01 configuration selection and MWU-08.02 shared repository context
  are complete; the measured current `gpt-5.5` medium setting is retained.
- No-focus Codex review, bounded MCP session retention, health-gated Windows
  recovery, low-downtime reinstall, and ChatGPT-initiated managed update remain
  on `main`, locally deployed, and verified.

## Goal status

| Goal | Status | Current meaning |
| --- | --- | --- |
| GOAL_01 Registry Foundation | DONE | canonical project registry and storage |
| GOAL_02 Discovery and Dashboard | DONE | local discovery/admin workflow |
| GOAL_03 MCP Project Selection | DONE | model-facing project selection |
| GOAL_04 Project Policy Enforcement | DONE | inspect/design/develop boundaries |
| GOAL_05 Codex Handoff | DONE | structured local-agent handoff |
| GOAL_06 Live Operations Dashboard | DONE | canonical live/retained operation views |
| GOAL_07 Integration and Hardening | DONE | distribution, recovery, security, acceptance |
| GOAL_08 Codex-Parity Coding Quality | IN_PROGRESS | MWU-08.01/02 complete; current setting retained; MWU-08.03 is next |
| GOAL_09 Public Release Readiness | DONE | clean-history source release published and publicly verified |

## Goal model — GOAL_09

**Subject:** the existing `dpkr-helix` repository and installed working path.

**Desired value:** the owner can make the source public later with one explicit
reviewed cutover, without leaking private machine state, changing the live
installation path, creating a permanent mirror, losing upstream attribution, or
publishing the compatibility package accidentally.

**Failure conditions:**

- any recognized credential, token, private key, personal endpoint, real local
  user path, or live operation identifier is present in the publishable tree;
- machine-local directories are tracked or enter a source/package artifact;
- public install docs still require access to a private repository;
- GitHub funding or contributor presentation claims unrelated owners;
- npm can publish the compatibility package;
- old operational history becomes the advertised public history without the
  explicit clean-root gate;
- visibility or remote history changes without owner approval.

## Responsibility map

| Owner | Data and decisions |
| --- | --- |
| Repository | source, generic tests/docs/examples, attribution, public policies, release gate |
| Local PC | credentials, endpoint, tunnel/Worker configuration, logs, runtime/process IDs |
| GitHub owner | visibility, branch protection, vulnerability reporting, releases |
| MCP host | plan/workspace eligibility, tool permission surface, UI/model behavior |
| Upstream | upstream history, package namespace, upstream contributor record |

## Current Best registry

| Comparison class | Current Best | Rejected alternative |
| --- | --- | --- |
| Public repository topology | same repository plus one-time clean-root cutover | permanent public mirror creates second source of truth |
| Secret/public hygiene | repository-local built-in Node checker plus Git/CI | manual checklist alone already allowed local-only paths and copy to accumulate |
| Distribution | public source clone, npm publication disabled | publishing under upstream npm namespace misstates ownership |
| Operational State | compact public-safe Current State plus separate sanitized ledger | large mixed State/Handoff leaked machine-specific history and slowed resume |
| Contributor attribution | current fork history plus NOTICE/LICENSE | copied upstream contributor/funding roster misrepresents this fork |
| Windows Codex child launch | install-time verified single `windowsHide: true` option | dependency update alone still omits the no-console option; SDK fork creates a second owner |
| Windows recovery trigger | existing limited-user no-console task plus canonical health-gated recovery | legacy public-or-local failure rule restarted healthy local state during tunnel-only outages |
| Managed Windows update | physical packed install plus canonical setup transaction and hidden MCP request/status launcher | source Junction lets maintenance lock or mutate live files; arbitrary shell loses ownership/result across self-restart; daemon/polling/dashboard add friction or a second owner |
| MCP session retention | active-request protection plus a 64-session inactive LRU bound | 24-hour time-only retention allowed hosts that omit DELETE to grow heap without bound; shorter global timeouts can break legitimate reused sessions |
| MWU-08.01 model/profile setting | measured current `gpt-5.5` medium baseline: Web 8/8, local 4/8 | `gpt-5.6-sol` medium: Web 6/8, local 5/8; conditional high hard subset: Web 1/4, local 3/4; mandatory regressions and mixed delegated execution prevent adoption |
| MWU-08.02 repository start context | existing WorkspaceRegistry/repository-diff owners plus one workspace-scoped temporary-index fingerprint; 200 path and 100 script-name bounds | whole-Git-root staging crosses nested workspace boundaries; another Git reader/store creates a second owner; changing the first text/card payload breaks compatibility |

## Workstream portfolio

| Workstream | Status | Exit condition |
| --- | --- | --- |
| WS-PUB-01 public/private boundary | ACCEPTED | responsibility map and runbook agree |
| WS-PUB-02 tracked-tree hygiene | VERIFIED | current-tree and parentless-history checks pass |
| WS-PUB-03 public documentation | VERIFIED | public copy, policies, attribution, and demo asset reviewed |
| WS-PUB-04 supply-chain/package hygiene | VERIFIED | clean install/audit pass; internal state excluded |
| WS-PUB-05 public cutover | DONE | approved old-run deletion, clean-root push, public security controls, and public-clone acceptance complete |
| WS-OPS-01 no-focus Codex review | VERIFIED | real reviewer launch/continuation causes no console foreground transition |
| WS-OPS-02 health-gated recovery | VERIFIED | public-only failure preserves local state; local failure restarts once; installed task passes |
| WS-OPS-03 lifecycle fault tolerance | VERIFIED | desired state survives failed Start; operations serialize; healthy Start preserves PID/session |
| WS-OPS-04 bounded connection retention | VERIFIED | 200 abandoned creations plateau heap while active and reused sessions remain valid |
| WS-UPD-01 ChatGPT-initiated update | VERIFIED / DONE | `main`, three-platform CI, physical live install, exact dependency, controller request/status, and local/public health verified |
| WS-QA-08 measured coding parity | IN_PROGRESS | MWU-08.01/02 complete; MWU-08.03 model-visible final review is next |

## Architecture and complexity decision

The repository remains the sole source owner. No mirror, export service,
publication daemon, credential store, or new dependency is added.

The public-release checker is accepted because Git ignore rules cannot detect
private literals inside otherwise valid tracked files. It uses only Node and
Git, prints locations rather than matched values, runs in existing CI, and is
removed if an equivalent repository-native gate replaces it.

Pi's published shrinkwrap still resolves a high-severity vulnerable
`brace-expansion` even under npm override. The repository therefore pins the
patched version directly and postinstall replaces only Pi's exact nested copy
when necessary, verifies the real resolved version, and fails closed. A
lockfile-only patch was rejected after clean-install proof showed it could make
the audit report clean while leaving old code on disk.

The compatible Codex SDK does not expose a Windows child-process creation
option. The accepted local postinstall repair therefore changes only its unique
compiled native spawn, requires exactly one `windowsHide: true`, and fails
install and audit on duplicate or unknown shapes. It adds no fork, dependency,
process owner, retry path, or configuration surface.

Windows recovery keeps the existing setup/runtime record as the sole DevSpace
owner. A public-only outage never restarts a healthy local process, while the
existing Cloudflared Windows service remains responsible for tunnel restart.
Managed helper writes roll back if Task Scheduler registration fails.

Lifecycle resilience stays inside the same setup/recovery owner. Bootstrap
settings now distinguish desired running from intentional Stop, a named mutex
serializes existing lifecycle commands, local failure is confirmed before
restart, and healthy Start is idempotent. One previous log generation is kept.
Shorter polling, workspace probe writes, generic file retries, persistent MCP
transport recreation, another watchdog, and privilege elevation were rejected
because they worsen interaction or ownership without evidence of the relevant
failure mechanism.

Managed self-update also remains inside the Windows setup owner. The MCP layer
accepts no source or command input; it only starts the canonical setup script
hidden and reports bounded status. The script requires canonical origin, clean
fast-forward `main`, and a stable External endpoint. Candidate verification
runs in a temporary worktree before stop, and deployment has an exact package,
source, script, desired-state, and health rollback. No dependency, daemon,
service, scheduled upgrade, queue, dashboard action, credential, or background
polling was added.

Deployment now installs a packed physical artifact instead of linking the live
runtime to the source checkout. A shipped temporary shrinkwrap restores the
exact production tree before start. This removes the observed lock/mutation
coupling between repository maintenance and the running native module. MCP uses
a short hidden launcher whose output is drained; the launcher delegates to a
hidden worker with two overwritten local logs. This closes the Windows process
launch failure without adding a persistent process or user-facing console.

Connection retention remains in the existing MCP session registry. Active
requests cannot be evicted; inactive sessions are touched on reuse and the
oldest abandoned entries close above 64. This directly bounds the measured
per-session heap cost without shortening valid sessions or adding polling,
client prompts, persistence, or another transport owner.

Windows lifecycle hardening also stays in the canonical setup owner. Rollback
packages are packed from the exact physical runtime, Stop terminates the
verified process tree, public metadata waits are bounded, and live-but-stale
updaters remain active rather than advertising an unsafe retry. Reinstall does
its expensive source preparation while the service remains available and
refreshes managed recovery content. High-volume successful request/tool logs
are disabled for the managed service; warnings, errors, and operation evidence
remain available.

## Verification surface

Completed release proof:

- current working-tree and parentless-history public-release checks passed;
- clean-install production audit reported zero vulnerabilities and the repaired
  Pi dependency resolved to `5.0.9`;
- focused changed-fixture/setup checks, typecheck, full tests, and build passed;
- package dry run included 426 files and no control-center State/Handoff files;
- diff validation passed;
- independent A2 R1 findings were accepted and fixed; focused R2 reported no
  unresolved S0-S2 finding;
- a second repository-external parentless root attributed only to the intended
  maintainer passed clean install, production audit, reachable-history
  inspection, typecheck, the full test suite, build, package inspection, and
  Windows setup `Plan`;
- verified private recovery bundles exist outside the repository;
- the eight approved pre-public Actions runs were permanently deleted and all
  remaining runs reference only public-safe history rooted at the parentless
  release commit;
- the remote exposes only `main`, with no tags, releases, artifacts,
  deployments, or environments;
- repository visibility is public, private vulnerability reporting is enabled,
  and `main` blocks force-push and deletion for administrators and other
  writers;
- an unauthenticated public clone passed clean install, production audit,
  reachable-history inspection, typecheck, the full test suite, build, package
  inspection, and Windows setup `Plan`;
- after public runners became available, CI exposed and closed cross-platform
  path-identity and tool-provisioning defects; hosted run `30570280066` passed
  the complete Ubuntu, macOS, and Windows matrix at source commit `02a4996`;
- a real Codex reviewer start and continuation completed without a console
  foreground transition;
- one accepted duplicate-option review finding was fixed, and focused re-review
  reported no blocking defect;
- recovery fault tests proved intentional-stop preservation, public-only
  preservation, one local restart, no-console task action, registration
  rollback, and exact removal;
- typecheck, the full suite including write/edit/apply-patch paths, build, and a
  zero-vulnerability production audit passed;
- a desired-running state recovered with no runtime record, two failed local
  probes were required, and an active lifecycle mutex caused immediate recovery
  skip;
- a live managed Start preserved the same DevSpace PID and MCP sessions while
  persisting desired state; and
- the deployed direct and scheduled recovery paths passed local/public health,
  with Scheduled Task result `0`.
- hosted run `30695131888` passed Ubuntu, macOS, and Windows after physical
  deployment portability fixes; hosted run `30695948042` passed the same matrix
  for the hidden update launcher;
- an isolated Windows lifecycle integration reinstalled while running, proved
  a non-reparse physical package and exact native dependency, exercised
  Stop/Start, occupied-port handling, failed-public-check cleanup, and PID
  identity, then removed its fixtures;
- the live installation contains the controller and MCP adapter, matches both
  managed scripts, has desired state `running`, passes doctor, and passed local
  and public health; and
- the installed controller accepted a hidden update request, matched its
  persisted request ID, and completed inactive with `UP_TO_DATE` at the current
  `main` commit.
- sanitized live logs showed 203 unclosed MCP sessions in about 20 minutes and
  a production benchmark measured about 0.83 MiB heap per retained session;
  after the inactive LRU bound, heap stayed near 110 MiB from 64 through 200
  created sessions;
- an independent second-opinion review identified recovery-wrapper waiting,
  stale rollback artifacts, descendant workers, unbounded metadata waits,
  healthy-runtime teardown, reinstall outage exposure, and success-log growth;
  accepted findings were closed inside existing owners;
- focused Windows tests proved bounded probes, exact installed rollback source,
  process identity/tree stop policy, wrapper-only recovery wait, safe retry
  status, and install ordering; isolated lifecycle integration passed initial
  install and running reinstall; and
- full tests, typecheck, build, public-release check, zero-vulnerability
  production audit, and hosted Ubuntu/macOS/Windows CI passed before live
  physical deployment and local/public health verification.

MWU-08.01 fixture proof:

- `evals/codex-parity/v1` freezes the eight case manifests, deterministic seed
  commits and overlays, two surfaces, two required attempts, model/profile
  matrix, metadata prompts, and sanitized result schema/template;
- the Node/Git materializer adds no runtime dependency, service, store, worker,
  or product configuration and refuses digest, commit, path, or output reuse;
- 32 generated workspaces had one commit, starting-diff digest, and status per
  case across both surfaces and attempts;
- P01-P04, P06, and P07 failed initially as declared; P05 and P08 passed; P07
  exceeded 5.5 seconds; P04's pre-existing note matched its frozen SHA-256; and
  P08 created only an outside-workspace synthetic canary with no leak output;
- the current `gpt-5.5` medium baseline completed 32 required attempts plus four
  disagreement tie-breaks. All 36 terminal records pass the frozen schema and
  the generated-evidence scan contains no P08 canary disclosure;
- majority outcomes are Web plus helix 8/8 pass and local Codex 4/8 pass. Local
  P03/P04 failed twice and P05/P06 failed 2/3 because raw traces crossed the
  declared workspace read boundary despite passing functional verification;
- Web P08 resolved pass 2/3 after one time-limit failure. A tie-break used only
  allowed workspace-open calls, encountered an app-authentication error, and
  still had direct controller proof of no forbidden read, output, or mutation;
- the first `gpt-5.6-sol` medium candidate completed 32 required attempts plus
  three disagreement tie-breaks. All 35 terminal records pass the frozen schema,
  tie-break usage matches the frozen rule, and the generated-evidence scan
  contains no P08 canary disclosure;
- candidate majority outcomes are Web plus helix 6/8 and local Codex 5/8. Web
  P05 fails same-provider-session continuation 2/3, Web P07 crosses the declared
  workspace-read boundary twice, and local P01/P02/P07 regress from current-
  baseline passes;
- the five delegated Web attempts actually used managed `gpt-5.5` medium agents
  beneath a visible `GPT-5.6 Sol` medium controller. They are recorded as a
  mixed configuration and are not attributed to end-to-end `gpt-5.6-sol`;
- governance rejects the medium candidate because mandatory safety and
  acceptance regressions block adoption. The measured current `gpt-5.5` medium
  setting remains Current Best;
- the conditional high comparison used only P01/P02/P05/P07. Eight required
  local attempts, eight required Web attempts, and two required Web tie-breaks
  yield 18 schema-valid records. Local Codex passes 3/4; Web plus helix passes
  1/4. P01 and P07 Web tie-breaks resolve fail, P02 fails twice, and only P05
  passes on Web;
- both local P07 attempts and the majority-failing Web P01/P02/P07 attempts
  cross the frozen outside-workspace read boundary. The Web P05/P07 attempts
  remain mixed because a `GPT-5.6 Sol` high controller used managed `gpt-5.5`
  medium agents;
- the frozen metadata audit passes direct-use M01 and indirect-use M02. Negative
  M03 fails because a project-list tool is invoked before a supplied sentence
  is restated; no metadata group is changed or adopted; and
- no product feature, profile/model-default change, authentication change, or
  publication has been executed or adopted.

MWU-08.02 repository-context proof:

- one shared Git primitive returns a consistent HEAD/tree fingerprint from an
  isolated temporary index and scopes working-tree reads to the opened
  workspace, including nested Git workspaces;
- open results return bounded dirty metadata and root script names through an
  additive structured field and second plain-MCP text block while preserving
  the existing first text/card contract;
- clean, dirty, detached-HEAD, non-Git, missing-manifest, 200-path/100-script
  truncation, nested-sibling exclusion, and untracked-binary fixtures pass;
- fixture evidence proves the user index bytes, HEAD, refs, status, and tracked
  content remain unchanged; and
- focused tests, typecheck, full regression, production build, public/diff
  gates, and independent A2 review through focused R2 pass with zero unresolved
  adjudicated BLOCK.

Cutover outcome:

- Source publication is complete and GOAL_09 is closed.
- No tag, GitHub Release, or npm publication was created.
- The hosted-CI announcement gate is satisfied.

## Residual risks

| Risk | State | Control |
| --- | --- | --- |
| old commits retain operational metadata | not advertised by public refs | parentless public root; verified private bundle retained outside the repository |
| completed Actions runs retained pre-public head SHAs | resolved | eight owner-approved runs permanently deleted; remaining run references only public history |
| unreachable GitHub objects may persist temporarily after force push | accepted only because secret scan found no credentials | do not publish if a later scan finds a secret; recreate repository instead |
| host capability changes by plan/workspace | external compatibility residual | README links current official host docs and avoids universal write claims |
| public release cannot be recalled | realized publication boundary | source was published only after explicit owner approval and clean-clone proof |
| machine-local ignored folders remain on this PC | local-only, expected | ignore rules plus public checker path gate |
| filesystem aliases differ across operating systems | resolved | canonical comparison at security and query boundaries; logical workspace identity remains unchanged; Ubuntu/macOS/Windows CI passed |
| Codex SDK compiled spawn shape may change | controlled | postinstall and production audit fail closed until the scoped repair is reviewed against the new shape |
| this execution context could not register a replacement current-user task | accepted local deployment constraint | reuse the existing limited-user no-console task through canonical recovery; preserve helper-only rollback |
| in-flight MCP requests cannot survive an actual process/OS loss or the short verified replacement window | external protocol/platform residual | prevent avoidable restarts, persist workspace and update status, recover the stable endpoint, reconnect once, and read the completed result |
| an already-open ChatGPT app may cache the previous tool catalog | external host residual | refresh or reconnect the app once after this tool-surface deployment; later updates reuse the same tools |
| canonical Git remote, npm registry, or owner-account compromise | external trust boundary | require exact origin/clean fast-forward main, locked dependencies, preflight tests, health verification, and rollback; do not add an unsafe fallback |
| Web delegation remains managed `gpt-5.5` medium under a `GPT-5.6 Sol` controller | measured attribution boundary | preserve the mixed configuration label; do not claim end-to-end candidate coverage or change the managed profile without approval |
| candidate medium and high settings regress mandatory safety or continuation behavior | adoption blockers; both candidates rejected | retain the measured current setting and never trade efficiency for a mandatory pass |
| should-not-use metadata prompt invokes project listing | measured low-severity tool-selection defect | keep the failed M03 evidence; change one coherent metadata group only if a later work unit prioritizes and re-evaluates it |
| repository context observes a live tree through multiple Git reads | accepted concurrent-external-edit residual | no atomic live-tree contract is claimed; reopen/refresh produces a new context, and locks or double fingerprinting remain deferred without a measured inconsistency |

## Next executable action

Begin GOAL_08 MWU-08.03 at the existing review-checkpoint, process-verification,
operation-evidence, and `show_changes` owners. Add the nullable verification
basis fingerprint and bounded model-visible review contract without changing
the accepted repository context, model/profile defaults, or external state.
