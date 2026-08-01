# Project State

Last synchronized: 2026-08-01

## Current state

- Repository: `vellyalis/dpkr-helix`
- Branch: `fix/windows-operational-stability`
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
- Current maintenance unit: no-focus Codex review launch and health-gated
  Windows recovery are implemented, locally deployed, and verified on the task
  branch

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
| GOAL_08 Codex-Parity Coding Quality | NOT_STARTED | requirements/design accepted; MWU-08.01 next |
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
| Managed Windows update | canonical setup `Update` transaction plus MCP request/status adapter | arbitrary shell loses ownership/result across self-restart; daemon/polling/dashboard add friction or a second owner |

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
| WS-UPD-01 ChatGPT-initiated update | AUTOMATED VERIFIED; MAIN/LIVE PROOF PENDING | publish the verified checkpoint, install it, and observe catalog/status plus local/public health |
| WS-QA-08 measured coding parity | PLANNED | resume at MWU-08.01 after current priority |

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
| in-flight MCP requests cannot survive an actual process/OS loss | external protocol/platform residual | prevent avoidable restarts, persist workspace identity, recover the service, and let the client establish a new MCP transport |

## Next executable action

Publish the automated-verified WS-UPD-01 checkpoint to protected `main`, deploy
it once through the existing setup owner, and prove the new MCP catalog/status
plus local/public recovery. Then resume GOAL_08 MWU-08.01.
