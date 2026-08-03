# Codex parity suite v1

This suite freezes P01-P08 for GOAL_08. It compares local Codex and ChatGPT Web
plus dpkr helix from the same deterministic Git snapshot and the same declared
permissions. It is evaluation data, not a second execution, Git, verification,
or state owner.

## What is frozen

- `suite.json` fixes the comparison matrix, parity gate, case paths, manifest
  digests, and deterministic seed commits.
- Each `cases/Pxx/manifest.json` fixes the task goal, constraints, acceptance,
  permissions, initial state, and required evidence.
- `result.schema.json` defines the sanitized per-attempt record.
- `result-template.json` is copied before a run and filled from direct evidence.
- `materialize.mjs` uses only Node and Git to create two attempts per surface.

The materializer commits each seed with fixed author, timestamp, Git settings,
and file bytes, clones that commit for both surfaces, then applies the same
declared working-tree overlay. It refuses an existing output directory and a
seed commit or manifest digest that differs from `suite.json`.

## Prepare identical snapshots

From the repository root:

```text
node evals/codex-parity/v1/materialize.mjs prepare --out .tmp/codex-parity-v1
```

The generated layout is:

```text
.tmp/codex-parity-v1/P01/local-codex/attempt-1/workspace
.tmp/codex-parity-v1/P01/web-helix/attempt-1/workspace
```

Attempts 1 and 2 are required. Create attempt 3 only as a tie-break when the
two mandatory outcomes disagree:

```text
node evals/codex-parity/v1/materialize.mjs prepare --attempts 3 --out .tmp/codex-parity-v1-tiebreak
```

Run `validate` when only the committed suite contract needs checking:

```text
node evals/codex-parity/v1/materialize.mjs validate
```

## Execute and record

For every attempt:

1. Start from the generated `workspace` without editing its setup metadata.
2. Give the surface only the manifest's `task`, `constraints`, `acceptance`,
   `permissions`, and time limit. Do not copy provider prompts, hidden
   reasoning, environment values, credentials, or repository file contents
   into the result.
3. Preserve the exact model, profile, reasoning effort, prompt revision, server
   revision, and tool-catalog revision actually used.
4. Record direct acceptance evidence, the final Git status/diff summary,
   required verification, interventions, tool calls, status calls, turns, and
   wall time in a copy of `result-template.json`.
5. Count a lower call count, time, token count, or cost as an improvement only
   after every mandatory quality and safety gate passes.

The template is intentionally not valid against `result.schema.json` until all
`PENDING`, `not_run`, and null timing fields are replaced with observed terminal
evidence. A result that is still in template state is not a baseline record.

The current configuration is `gpt-5.5` at medium reasoning with managed profile
digest `195f31f49c99c75247bdc290a4bbc032fd48568aa6be9569859d3f72e4c491b0`.
The first completed candidate was `gpt-5.6-sol` at medium with the same profile
text. Its original conditional higher-effort rule evaluated High only on the
hard subset. A later owner-requested full `medium` / `high` / `xhigh` comparison
is defined separately by `effort-comparison-plan.json` and
`EFFORT_COMPARISON_RUNBOOK.md`; it reuses the frozen snapshots without changing
the v1 historical matrix. The owner stopped that follow-up incomplete after 24
of 96 terminal records because it no longer changed a current product or
setting decision. Its partial cells are diagnostic only. Model and prompt
defaults are not changed by either evaluation.

## Safety and ownership

- Generated repositories and attempt records belong under ignored `.tmp/`.
- P08 uses a synthetic outside-workspace canary. Its contents are never a
  credential and must not be copied into results.
- The suite never commits, pushes, publishes, installs, or changes the running
  dpkr helix configuration.
- Browser or provider submissions require the normal external-action approval
  boundary.
