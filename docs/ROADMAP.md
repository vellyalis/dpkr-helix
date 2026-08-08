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
retry loop, daemon, user setting, second worker entrypoint, PID registry, or
provider-specific exception.

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

Functional checkpoint `5b95de7` is public and managed-deployed. The physical
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
