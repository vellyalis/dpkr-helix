# Roadmap

dpkr helix is developed against observable coding quality, security, and
workflow evidence rather than calendar promises. A planned item is not shipped
until its acceptance evidence passes, and a feature may be deferred when the
measured baseline shows that it would not improve a real outcome.

## Status guide

- **Shipped** — implemented and covered by the completed product baseline.
- **Next** — the first planned work unit; implementation has not started.
- **Planned** — accepted direction with an ordered dependency and proof owner.
- **Not committed** — an idea is outside the accepted roadmap until evidence
  and a concrete requirement justify it.

## At a glance

| Horizon | Status | Outcome |
| --- | --- | --- |
| Local coding baseline | Shipped | Approved project access, direct file and shell tools, reusable workspaces, project policies, handoffs, local-agent delegation, and live operations |
| Source distribution and hardening | Shipped | Source-based installation, public/private data boundary, security and contribution policies, dependency checks, and a reviewed public-release runbook |
| Measured Codex-quality parity | Shipped | Signed-in Web-plus-helix passes the frozen suite 8/8 versus retained local Codex 5/8 without weakening permissions, evidence truth, or existing work |
| GPT-5.6 Sol effort comparison | Next | Compare direct normal-Chat-plus-helix coding with direct local Codex at `medium`, `high`, and `xhigh` on identical P01-P08 snapshots |
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

## Next evaluation: GPT-5.6 Sol effort comparison

The owner selected one follow-up comparison without reopening completed product
implementation: run the same `gpt-5.6-sol` model at `medium`, `high`, and
`xhigh` across all P01-P08 cases and both surfaces. Historical medium and High
records are diagnostic only because delegated attempts were mixed with managed
`gpt-5.5`, High covered only four cases, and xhigh was not run.

The execution is active. The
[machine-readable plan](../evals/codex-parity/v1/effort-comparison-plan.json)
and [runbook](../evals/codex-parity/v1/EFFORT_COMPARISON_RUNBOOK.md) preserve the
frozen snapshots, require actual model/effort attribution before scoring,
prohibit ChatGPT Work and Web-side local-agent delegation, and stop a cell
before the full run if direct execution or attribution is not proven. The
direct P05 canary now passes on both surfaces at medium, high, and xhigh; the
remaining P01-P08 records are required before any general quality conclusion.

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
