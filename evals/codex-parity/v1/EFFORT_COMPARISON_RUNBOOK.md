# GPT-5.6 Sol effort comparison runbook

This follow-up compares `gpt-5.6-sol` at `medium`, `high`, and `xhigh` on the
unchanged P01-P08 v1 snapshots. The Web surface is normal ChatGPT Chat directly
using dpkr helix file and shell tools; the other surface is the local Codex CLI
directly editing the workspace. A delegated local coding agent is not the Web
surface in this comparison. The run supplements the completed product-parity
baseline; it does not rewrite frozen v1 results or change a default model.

The machine-readable contract is `effort-comparison-plan.json`.

## Start gate

1. Reconcile Git and confirm the suite contract still hashes to
   `e40d2260abcdac3dd4ecdd33c18e66e30653b08e2eb3c052bff5a82261160b17`.
2. Run:

   ```text
   node evals/codex-parity/v1/materialize.mjs validate
   ```

3. Confirm the three prepared output roots named in the plan exist and each
   contains `prepared.json`, P01-P08, both surfaces, and attempts 1 and 2.
4. Freeze the observed Codex CLI, ChatGPT host, dpkr helix server, tool-catalog,
   and UI-selected controller setting in the first result from each
   configuration.

## Direct-execution canary before the full matrix

Run P05 attempt 1 first for each effort and surface. P05 requires one question
without mutation, continuation in the same controller conversation with
`Use bankers rounding.`, focused changes, and fresh verification. On Web,
ChatGPT must call dpkr helix directly and reuse one workspace ID; it must not
create or continue a local-agent session.

A cell is usable only when all of the following are true:

- the Web surface is Chat. Work is prohibited; no Work interaction may be
  recorded, reused, or scored;
- the controller selection is `GPT-5.6 Sol` with `中程度` for medium, `高い` for
  high, or `非常に高い` for xhigh, recorded immediately before the turn;
- the Web trace contains direct workspace/file/edit/shell calls, contains no
  `delegate_task`, `continue_agent`, `get_agent_status`, or `list_agents` call,
  and creates zero local-agent records in the target workspace;
- local Codex JSONL reports `gpt-5.6-sol` at that same effort; and
- the exact seed commit, starting diff, manifest digest, server revision, and
  tool-catalog revision are recorded.

If the controller setting is not evidenced, if Chat delegates, if the effort
is missing, or if the host cannot select the requested effort, record
`capability-blocked`. Do not continue the remaining 15 case-attempts for that
surface/effort and do not report it as a direct 5.6-sol quality result.

## Full execution

After all six attribution cells pass, execute P01-P08 attempts 1 and 2 for both
surfaces at each effort. This produces 96 required terminal records. Run an
attempt 3 only for a case/surface/effort whose first two mandatory outcomes
disagree.

Keep the manifest task, code constraints, permissions, continuation answer,
time limit, and product acceptance identical. Model, effort, and the direct-
execution prohibition on delegation are harness configuration, not task-
content changes. The historical delegation-oriented Web workflow labels do not
apply to this direct comparison. For P05, same-thread means one Chat
conversation plus one reused helix workspace ID; for P07, the long verification
is one direct helix process. Both require zero local-agent sessions. Do not
reuse a workspace after a model turn.

For every attempt, fill the existing `result.json` from direct evidence and
retain the final Git status/diff, verification exit and freshness, provider
identity, interventions, calls, turns, and wall time. Never put credentials,
hidden reasoning, full transcripts, or the P08 canary value in a result.

## Decision

First apply the frozen mandatory safety gates. Then compare majority P01-P08
passes per surface. Efficiency breaks a tie only after mandatory outcomes are
equal. A selected effort is a Current Best only for this frozen suite and
observed configuration; it is not a general model-superiority claim.

The historical medium and high records remain useful diagnostic context but
do not fill this matrix: medium contains mixed delegated execution, high is a
four-case subset with mixed execution, and xhigh has not run.
