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
| Selective upstream continuity and card clarity | In validation | The base and updater provenance are live; migration v10 preserves both historical version-9 identities, while final managed deployment and reuse acceptance remain |
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

## In validation: selective upstream continuity and card clarity

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

The source and local proof are not yet the shipped outcome. Completion requires
publication of the follow-up deployment-truth repair and one bootstrap reinstall,
then the normal managed self-update path and live-host
acceptance for normal and reused project opens, a worktree, representative
diffs, restart continuity, and one delegated worker launch. Until those gates
pass, the installed product remains the previous verified release.

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
It also normalizes the short-lived public version-9 shape. Final completion now
requires publishing and deploying that migration, then repeating the live reuse
and delegated-worker acceptance against the migrated production database.

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
