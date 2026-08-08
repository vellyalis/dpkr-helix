# Roadmap

dpkr helix is developed against observable coding quality, security, and
workflow evidence rather than calendar promises. A planned item is not shipped
until its acceptance evidence passes, and a feature may be deferred when the
measured baseline shows that it would not improve a real outcome.

## Status guide

- **Shipped** — implemented and covered by the completed product baseline.
- **In validation** — source implementation and local proof are complete, but
  publication, managed deployment, or live-host acceptance is still pending.
- **Next** — the first planned work unit; implementation has not started.
- **Stopped** — intentionally ended incomplete; partial evidence remains
  diagnostic and no completion claim is made.
- **Planned** — accepted direction with an ordered dependency and proof owner.
- **Not committed** — an idea is outside the accepted roadmap until evidence
  and a concrete requirement justify it.

## At a glance

| Horizon | Status | Outcome |
| --- | --- | --- |
| Local coding baseline | Shipped | Approved project access, direct file and shell tools, reusable workspaces, project policies, handoffs, local-agent delegation, and live operations |
| Source distribution and hardening | Shipped | Source-based installation, public/private data boundary, security and contribution policies, dependency checks, and a reviewed public-release runbook |
| Measured Codex-quality parity | Shipped | Signed-in Web-plus-helix passes the frozen suite 8/8 versus retained local Codex 5/8 without weakening permissions, evidence truth, or existing work |
| GPT-5.6 Sol effort comparison | Stopped | Owner stopped the incomplete 24/96 matrix because it no longer changes a current product, release, or setting decision |
| Daily operation quality and continuity | Shipped | Fresh-session operation, reconnect continuity, direct tools, handoffs, and bounded nested-instruction discovery are live-verified |
| Selective upstream continuity and card clarity | Shipped | Same-conversation reuse, restart-safe review state, truthful deployment provenance, migration v10 compatibility, clearer cards, and bounded worker cold starts are live-verified |
| Operations standby presentation | Shipped | Connected MCP session roots are separated from active `NOW` work without changing canonical state or lifecycle |
| Practical daily-use controls | Shipped | Provider quota cooldowns, reversible workspace-session archive, and one Current/Resume plus failure-diagnosis surface are public, managed-deployed, and installed-verified |
| Managed update verification throughput | Shipped | Every existing update gate remains mandatory while independent read-only checks use bounded parallel execution; installed end-to-end timing is live-verified |
| Prepared runtime replacement | Shipped | The exact lock-restored runtime is built and fingerprinted before downtime, then its fixed package root replaces the previous generation without rerunning global dependency resolution |
| Installed Codex canary closure | Shipped | The same installed CLI, profile, worker, configured model, Codex adapter and external account are checked with a bounded exact-token canary instead of asking the model to interpret package metadata; two installed runs confirm materially lower closure |
| Codex runtime selection | Shipped | The bundled Codex SDK 0.145.0 remains the measured production runtime after host app-server, host exec, and newer SDK comparisons failed to improve the same structured workload |
| Local-agent worker startup | Shipped | One dedicated worker entrypoint replaces full CLI bootstrap before provider execution while preserving policy, SQLite, Operations, IPC readiness, heartbeat, continuation, and failure ownership |
| Additional product expansion | Not committed | Add only capabilities justified by a measured parity failure or a concrete user requirement |

## Completed program: measured Codex-quality parity

The program is complete. P01-P08 and their deterministic snapshots are frozen;
the current baseline, rejected medium and High candidates, shared repository
context, review freshness, structured outcomes, bounded waiting, final
boundary-metadata candidate, and signed-in acceptance are recorded. The goal
was not to imitate the local Codex interface. It measured the same coding tasks
on the same repository snapshots and closed proven gaps in correctness, safety,
review quality, and workflow continuity.

| Order | Milestone | User-visible outcome | Exit rule |
| --- | --- | --- | --- |
| 1 — Complete | Baseline and configuration selection | Current `gpt-5.5` medium retained after same-snapshot medium, conditional-High, and metadata comparisons | Frozen suite and evidence-based selection recorded before product behavior changes |
| 2 — Complete | Shared repository context | Opened workspaces provide bounded, accurate repository context and a tree fingerprint | Prove clean, dirty, detached, non-Git, missing, and oversized cases without mutating index, checkout, or refs |
| 3 — Complete | Review and verification freshness | The model can distinguish fresh verification from stale or legacy evidence after files change | Prove fresh → stale → reverified transitions and preserve existing clients |
| 4 — Complete | Structured outcomes and questions | Codex can return completed, needs-input, or error outcomes without speculative edits and can continue the same thread after an answer | Prove persistence, restart behavior, same-session continuation, and provider compatibility |
| 5 — Complete | Bounded status waiting | One bounded status call can wait for completion or a question without duplicate execution | Prove terminal, input, error, stop, and timeout paths with zero duplicate workers |
| 6 — Complete | Parity convergence | Signed-in Web-plus-helix passes 8/8 versus retained local Codex 5/8; security, canary, pre-existing-work, evidence, and regression gates agree | Web-plus-helix has no additional mandatory failure; all completion evidence is synchronized |

The detailed requirements, failure behavior, task fixtures, and acceptance
criteria live in the canonical
[GOAL_08 Codex-Parity Coding Quality](./control-center/goals/GOAL_08_CODEX_PARITY.md)
contract. The ordered implementation record is
[08_IMPLEMENTATION_PLAN.md](./control-center/08_IMPLEMENTATION_PLAN.md).

## Stopped evaluation: GPT-5.6 Sol effort comparison

The owner selected one follow-up comparison without reopening completed product
implementation: run the same `gpt-5.6-sol` model at `medium`, `high`, and
`xhigh` across all P01-P08 cases and both surfaces. Historical medium and High
records are diagnostic only because delegated attempts were mixed with managed
`gpt-5.5`, High covered only four cases, and xhigh was not run.

The owner stopped the execution incomplete at 24 of 96 terminal records. The
[machine-readable plan](../evals/codex-parity/v1/effort-comparison-plan.json)
and [runbook](../evals/codex-parity/v1/EFFORT_COMPARISON_RUNBOOK.md) preserve the
frozen snapshots, require actual model/effort attribution before scoring,
prohibit ChatGPT Work and Web-side local-agent delegation, and stop a cell
before the full run if direct execution or attribution is not proven. The
partial records remain diagnostic only: they do not select an effort, change a
default, or support a complete P01-P08 conclusion. Resume only if a concrete
effort-selection decision or observed model-quality regression requires it.

## Shipped: daily operation quality and continuity

WS-OPS-05 completed one fresh, signed-in normal-Chat workflow through the
production path. It verified correct app/tool selection, workspace open and
reuse, direct read/exec continuity, reconnect health, and truthful handoff
state. The only repeated product gap was nested-instruction discovery walking
ignored evaluation copies. The accepted fix extended the existing ephemeral
directory exclusions to `.tmp`, reducing one fresh workspace result from 1,055
advertised nested instruction paths to the nine real tracked paths with zero
`.tmp` entries. No new context service, Gitignore parser, pagination protocol,
or automation owner was added.

## Shipped: selective upstream continuity and card clarity

The base source candidate is public at `16e236c` and audits upstream DevSpace
through `v1.0.6` by observable contract instead of attempting to merge unrelated
histories. It
adapts conversation-aware checkout reuse and review-checkpoint recovery to
Helix's Project, Handoff, repository-context, policy, and Operations owners. It
also adopts only the correctness-bearing card improvements: explicit
opened/reused/worktree state, structured workspace details, accurate file-kind
and rename presentation, direct single-file diffs, and bounded scrollbars.

During the same audit, a real delegated worker failed before provider execution
because its fixed ten-second launch acknowledgement expired during a cold
Windows CLI start. The source candidate keeps the same detached worker and IPC
owner, extends the bounded internal acknowledgement grace to thirty seconds,
adds a lightweight heartbeat while the provider is active, and reconciles a
starting/running record as interrupted only after one hour without activity.
The long-lived service performs that check at startup and every five minutes;
worker children skip the scan before acknowledging readiness. This prevents
dead workers from remaining permanently `running` while preserving genuinely
active detached workers and avoiding more cold-start work. It does not add a
retry loop, daemon, user setting, PID registry, or provider-specific exception.

The first update request after the base publication exposed why that bootstrap
gate matters: source `HEAD` already equaled `origin/main`, so the previous
updater returned `UP_TO_DATE` even though the physical installed package was
older. The follow-up records the clean deployment commit alongside the existing
package hash and installed-tree fingerprint. A no-op is now valid only when
source, commit provenance, and physical fingerprint all agree. Older settings
without provenance redeploy once rather than manufacturing an installed state.

The first live reuse call then exposed a separate clean-history migration
collision: managed installations had already assigned version 9 to
`local-agent-fallbacks`, while the public source had assigned version 9 to the
new conversation table. The accepted source repair restores the immutable
historical version-9 meaning and creates conversation bindings at version 10.
It also normalizes the short-lived public version-9 shape. Managed deployment
preserved all 1,052 prior workspace rows, created a prefixed SHA-256 binding,
and reused the same compact workspace on the second same-conversation project
open while suppressing repeated static bootstrap.

The deployed worker path also acknowledged a cold read-only launch and reached
the Codex provider in 6.8 seconds, below the new bounded thirty-second grace.
The provider then rejected execution only because the external usage allowance
was exhausted; the retained failure was not a worker acknowledgement timeout,
and the repository remained clean.

## Shipped: Operations standby presentation

Post-deployment observation found that the Runs `NOW` queue was dominated by
connected but idle MCP session roots. Of 66 top-level active roots, 63 were
canonical `running` sessions in phase `waiting` with current action `Waiting for
the MCP client`; only one was actively executing and two required action.

The accepted source change adds a fifth derived queue, `STANDBY`, for only that
exact MCP-session shape. It keeps the underlying state `running`, preserves the
transport and retention owners, and leaves ordinary running work, local-agent
input waits, and non-session MCP operations in their existing queues. Replaying
the same live rows through the pure classifier yields `NOW=1`, `ACTION=2`, and
`STANDBY=63`. Managed deployment then exposed the five-queue order and
`STANDBY` label from the physical installed package. After restart retired old
connections, the installed classifier reported `NOW=1`, `ACTION=2`, and
`STANDBY=8` for the remaining top-level active roots. Doctor, local/public
health, OAuth metadata, and a fresh installed-provenance `UP_TO_DATE` check all
pass. No lifecycle or database change was involved.

## Shipped: practical daily-use controls

The current source candidate closes three repeated workflow costs without
introducing a scheduler, provider router, second project owner, or destructive
cleanup service.

First, local-agent failures now carry a bounded structured reason such as
`usage_limit`, `rate_limited`, authentication, configuration, policy, provider,
temporary, or generic failure. A usage/rate failure records or derives its
reset time from the existing agent row, temporarily changes provider status to
`cooldown`, and prevents duplicate worker launches until expiry. Helix never
silently switches provider, model, billing, or privacy boundary; the user may
retry later or explicitly select another configured profile/provider.

Second, System reports workspace-session total, active/archived split, roots,
conversation bindings, recent creation rate, and safe archive eligibility. The
local-only archive action uses a fixed seven-day threshold, excludes every
worktree, rechecks bindings plus active operations and agents transactionally,
deletes no files, and reactivates a session automatically on reuse. Source
validation does not archive the owner's production history.

Third, the read-only `get_project_resume` tool and Project inspector combine the
existing Project, Handoff, repository, workspace, Operations, local-agent, and
verification owners into one bounded Current/Resume view. It identifies the
next recorded action and the latest sanitized failure, including quota reset
time and a concrete recovery action, before a new chat opens the project.

Functional checkpoint `5b95de7` and final acceptance checkpoint `0070576` are
public and managed-deployed. The physical
installed package exposes `get_project_resume` as a read-only, non-destructive
MCP tool; the live registered project returns current clean `main`, Handoff,
workspace, active-run, failure, and next-action state. The installed lifecycle
owner reports 1,076 sessions, 21 conversation bindings, zero archived rows, and
129 conservative archive candidates. The historical quota failure is classified
as `usage_limit`; its reset has expired, so all physically present providers are
again available rather than being held in stale cooldown.

Installed source provenance and physical fingerprint agree, `devspace doctor`
passes, and local/public health plus OAuth metadata return 200. Production
archive remains an explicit, confirmed local-dashboard action; acceptance did
not archive or delete any session, repository file, or worktree.

## Shipped: managed update verification throughput

The managed updater still performs a clean `npm ci`, all 68 TypeScript tests,
TypeScript checking, the reviewed production dependency audit, both Windows
setup/recovery suites, the production build, public-release scan, package and
installed-tree fingerprints, rollback preparation, and replacement health
checks. No gate is skipped because speed cannot compensate for dependency,
native-module, recovery, public-boundary, or deployment-truth failure.

The former preflight executed those independent read-only checks serially. A
measured run attributed about 83.3 seconds to clean dependency installation and
166.1 seconds to the serial 68-file test chain; all measured preflight
components summed to about 292.9 seconds. The accepted source keeps dependency
installation first, runs the complete test set with bounded concurrency four,
runs tests, typecheck, production audit, and both Windows contract suites in one
fixed concurrent group, then performs build and public scan in order. Each
child has isolated logs and a fail-closed exit-code sidecar because Windows
`cmd.exe` can otherwise report zero through a wrapper after a called command
fails.

The exact production `Invoke-UpdatePreflight` completed in 123.106 seconds on
the owner host, about 169.8 seconds below the measured serial components, with
68/68 tests and every other gate passing. A persistent dependency cache was
rejected: copying its 35,906 files and roughly 1.05 GB still took 49.8 seconds
and would add integrity, promotion, cleanup, and Windows long-path lifecycle for
only a much smaller theoretical gain. Functional checkpoint `be3fd0d` is public
and installed. Its transition deployment took 361.09 seconds because that
request began under the previous installed outer updater. The following
documentation-only checkpoint `a70a192` was processed entirely by the new
installed lane and completed in 291.749 seconds. The replacement runtime was
healthy after 257.628 seconds and the remaining provenance and health closure
took 34.121 seconds. This observed end-to-end run is 69.341 seconds, or 19.2
percent, below the transition run; the stronger same-candidate preflight
evidence remains the 292.9-to-123.106-second comparison above.

## Shipped: prepared runtime replacement

After the verification fast lane shipped, the largest remaining cost was the
physical package replacement. The previous installer asked npm to install the
verified tarball globally and then copied the deployment shrinkwrap into the
installed package and ran a second `npm ci --omit=dev`. Direct inspection proved
the second pass was not redundant in correctness terms: global npm resolution
omitted the hidden deployment lock, selected 41 package versions different from
the reviewed shrinkwrap, and introduced four additional package paths. Removing
the locked pass would therefore trade deployment truth for speed.

The accepted source instead removes the unsafe first dependency resolution. It
extracts the already SHA-256-verified runtime tarball into the existing update
temporary root, validates the exact package and `devspace`/`helix` bin contract,
runs one locked production `npm ci` with the existing postinstall repairs, and
computes the same physical runtime fingerprint before the runtime mutex or stop.
After the source plan and rollback package are rechecked, the updater stops the
service, retains the old fixed package root inside the existing rollback area,
moves the prepared root into the same global package location, and verifies the
installed fingerprint before restart. Existing global CLI shims remain in
place. A damaged existing install, missing shim contract, or cross-volume layout
uses the established verified npm installer instead.

Isolated acceptance prepared the exact production runtime in 52.282 seconds and
replaced the fixed package directory in 0.664 seconds. The prepared and installed
fingerprints both equaled
`66fc4bf14554d5220233324016e66988793390e225924d96cbfb2542240cb067`;
`devspace doctor` confirmed the SQLite native dependency and `helix --help`
exited successfully. Functional checkpoint `cbdfad8` is public and installed.
Its 371.668-second deployment is a transition observation only because the
request began under the preceding installed updater. The following installed
lane deployed checkpoint `64be57a` in 253.690 seconds, reached the healthy
replacement runtime in 215.174 seconds, and completed provenance/health closure
in 38.516 seconds. Against the preceding fully installed update lane's
282.348-second total and 249.782-second runtime-start point, this removes 28.658
seconds end to end and 34.608 seconds before runtime availability. The update log
shows one 385-package development install for candidate verification and one
353-package production install for the prepared runtime, with no fallback
installer warning. Source, installed commit, physical fingerprint, Doctor,
SQLite, local/public health and local/public OAuth metadata agree.

## Shipped: bounded installed Codex canary

The remaining post-runtime closure was dominated by the external Codex turn,
not by Doctor or OAuth metadata. Recent managed updates spent 28.236 to 49.056
seconds inside the retained `codex-explorer` session after creation. Lowering
effort alone did not solve the old prompt: asking Codex to read `package.json`
and report its identity still took 52.096 seconds at low effort.

The accepted candidate keeps the installed `devspace` CLI, `codex-explorer`
profile resolution, detached worker, explicit configured model, Codex adapter,
external account, structured terminal record, quota advisory, and strict
non-quota failure behavior. It narrows only the external task to an exact
`DPKR_HELIX_PROBE_OK` response with no file read or modification. For the
managed `gpt-5.6-sol` model it requests low effort; other configured models keep
their profile setting because low-effort support is not assumed generically.
Doctor plus local/public OAuth checks still run first, so a prior verification
failure cannot strand a detached canary worker.

Read-only comparison runs completed the exact-token canary through the same
profile in 14.097 and 13.721 seconds; the candidate function itself completed in
14.571 seconds. Complete 68/68 regression, policy, typecheck, build,
zero-vulnerability production audit, setup/recovery, public-release and diff
gates pass. Functional checkpoint `00ae449` is public. Its first preflight was
safely rejected before replacement when an existing process-session test
exposed a load-sensitive artificial timer; follow-up `80b853d` removes only
that timer, passed the focused test 20/20 and the complete 68-file suite, and is
installed. Transition request `97a4513d-e247-451b-a82b-df80d490298a` completed
in 348.274 seconds and reached runtime in 307.018 seconds, but it began under the
old installed canary. That old turn still used max effort and consumed 34.852
of the 41.256 post-runtime seconds. The first valid new-canary request
`52fb4ac2-f4d2-410d-94af-32ed24dff745` deployed checkpoint `5a90d12` and closed
19.231 seconds after runtime start. Its `thinking=low` external turn completed
in 13.769 seconds, reducing closure by 22.025 seconds, or 53.4 percent, and the
provider turn by 21.083 seconds, or 60.5 percent, versus the transition run.
Source, installed commit, fingerprint, Doctor, SQLite, local/public health and
local/public OAuth agree. Confirmatory request
`61d774e6-56ef-46f2-8f45-71e3a054fadd` deployed checkpoint `e26b6dd`, closed
26.727 seconds after runtime start and completed its low-effort turn in 18.946
seconds. Both installed runs therefore improved materially over the transition:
closure fell by 14.529 to 22.025 seconds, or 35.2 to 53.4 percent, and provider
time fell by 15.906 to 21.083 seconds, or 45.6 to 60.5 percent. The deterministic
gates, strict failure behavior, quota advisory and endpoint ordering remain
unchanged, so the workstream is shipped.

## Shipped: Codex runtime selection audit

The host-installed Codex experiments were evaluated as runtime candidates
rather than imported because they change process ownership, protocol stability,
and rollback obligations. Installed `codex-cli 0.146.0` app-server proved that
it can preserve Helix's output schema, `completed`/`needs_input` outcomes,
same-thread continuation, item capture, assistant deltas, hidden Windows spawn,
bounded termination, and clean exit. That capability proof closed the earlier
assumption that app-server was necessarily too weak, but it did not make the
experimental protocol the Current Best.

Three alternating fresh-turn pairs under the same `gpt-5.6-sol` low-effort,
read-only structured prompt measured app-server at 10.982, 11.360, and 12.682
seconds versus the bundled SDK at 8.487, 8.857, and 8.973 seconds. The SDK
median was 2.503 seconds, or 22.0 percent, lower. Non-experimental host
`codex exec` completed fresh/resume/needs-input turns in 14.866, 12.808, and
11.740 seconds and required an additional schema file plus process/event parser.

The SDK itself was then compared without changing tracked dependencies. Version
0.145.0 measured a 7.853-second median across three fresh turns; 0.146.1 measured
12.021 seconds and 0.147.0 measured 13.273 seconds. The reviewed Windows-hidden
spawn repair remained compatible, but both updates were materially slower.
All experimental source and generated protocol files were removed, dependencies
were restored from the canonical lock, and production retains SDK 0.145.0 with
no dual runtime, version router, new protocol owner, or state migration.

## Shipped: dedicated local-agent worker entrypoint

The retained detached worker previously re-entered the complete `devspace` CLI
before acknowledging readiness. That loaded interactive prompts, admin and
diagnostic command modules that the worker never used. Seven isolated
no-provider launches measured the old path at 14.540 seconds cold, 2.590 seconds
median, and 4.213 seconds mean before IPC acknowledgement.

The accepted source extracts the existing CLI LocalAgentService construction and
starts one dedicated `local-agent-worker` entrypoint with only
`<agent-id> --prompt-file <path>`. It keeps the same project-policy preflight,
SQLite row, Operations projector, 30-second finite acknowledgement, hidden
detached child, heartbeat, provider adapter, structured outcome, prompt-file
cleanup, and interruption reconciliation. The undocumented full-CLI
`agents __worker` path was removed, so this is one narrower entrypoint rather
than a second lifecycle owner. No daemon, warm pool, queue, schema, setting,
permission, dependency, or PID registry was added.

The built entrypoint acknowledged seven isolated launches in 1.459 to 1.570
seconds, with a 1.479-second median and 1.492-second mean. That reduced the cold
path by 13.061 seconds / 89.8 percent, the median by 1.111 seconds / 42.9 percent,
and the mean by 2.721 seconds / 64.6 percent. Functional checkpoint `63036bf`
is public and installed. Three installed new/continued runs acknowledged in
2.671, 4.565, and 2.252 seconds, a 2.671-second median and a 4.129-second /
60.7-percent improvement from the prior 6.8-second live baseline. The same
provider session survived continuation, each latest retained run projected the
expected eight Operations events, and all exact-marker results completed.

Complete 69/69 regression, policy, typecheck, production build, zero-vulnerability
production audit, Windows setup/recovery, public-release, package-content, and
diff gates pass. The physical installation contains the 1,190-byte compiled
worker, source/runtime commits and fingerprints agree, Doctor loads SQLite, and
local/public health plus OAuth metadata return 200.

## Decision rules

- No product feature begins before the baseline milestone closes.
- A feature is deferred if it does not improve mandatory task success, evidence
  truth, safety, or a repeatedly observed workflow cost.
- Lower latency, tool calls, tokens, or cost cannot compensate for a mandatory
  correctness, permission, secret-handling, or stale-evidence failure.
- Existing owners are extended before adding a dependency, service, store,
  daemon, queue, or parallel source of truth.
- “Better than local Codex” may be claimed only for the measured suite and
  tested configuration; a general superiority claim requires broader repeated
  evidence.

## Not currently committed

The accepted roadmap does not currently include a generic plugin system,
multi-agent planner, autonomous background orchestration, browser extension,
desktop wrapper, cloud source mirror, or second execution engine. These are not
permanently forbidden, but they require a current user need and direct evidence
that the existing owners cannot satisfy it.

## How this document stays accurate

This page is the public summary, not a second planning authority. Status changes
must be backed by implementation and verification, then synchronized with the
canonical Goal, Project State, and Handoff. Roadmap changes do not silently
promise a release date, hosted service, paid plan, or host capability.
