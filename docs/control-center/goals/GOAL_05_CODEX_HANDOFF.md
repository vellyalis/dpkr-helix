/goal

# GOAL 05 — Structured Codex Handoff

## Goal

Turn the existing local Codex/subagent plumbing into a first-class, explicit, structured MCP handoff workflow without duplicating orchestration.

## Dependencies

GOAL_03 and GOAL_04 must be DONE.

## User-visible outcome

ChatGPT can explicitly delegate a focused implementation task to `codex-implementer`, receive an agent ID, inspect status/final response, continue the same thread, and review actual repository changes.

## Scope

- extract `LocalAgentService` and worker concerns from CLI
- keep existing CLI behavior through the service
- structured task envelope and deterministic renderer
- `delegate_task`
- `get_agent_status`
- `list_agents`
- `continue_agent`
- provider/profile/policy validation
- MCP Apps cards for agent actions/results
- prompt temp-file cleanup
- tests, docs, state

## Non-scope

- silent automatic delegation
- multi-agent orchestration planner
- remote Git publication
- storing full chat transcripts
- danger-full-access default
- replacing existing provider adapters

## Acceptance criteria

- AC-05.1: CLI and MCP use one service owner for start/resume/list/status.
- AC-05.2: Task envelope satisfies FR-AGT-003 and renders deterministically.
- AC-05.3: Delegation is rejected before state mutation when provider/profile/policy is invalid.
- AC-05.4: Explicit successful delegation returns visible agent ID/status/profile.
- AC-05.5: Codex thread resumes through existing provider session ID.
- AC-05.6: Agent MCP tools are absent when subagents are disabled.
- AC-05.7: Temp prompt files/directories are cleaned.
- AC-05.8: Agent result cards do not claim implementation is verified.
- AC-05.9: Existing `devspace agents` command tests remain valid.
- AC-05.10: Standard verification passes.
- AC-05.11: Manual real-Codex handoff completes one focused task and results are reviewable.

## Proof obligations

- fake adapter/service tests,
- CLI/MCP parity test,
- disabled/denied no-side-effect tests,
- resume test,
- temp cleanup test,
- real Codex manual evidence without push.

## Shared rules

- Read `CODEX_IMPLEMENTATION_PROMPT.md` and all referenced control-center documents first.
- Reconcile design claims with current code.
- Preserve current public behavior unless this goal explicitly changes it.
- Keep changes focused.
- Do not implement later goals opportunistically.
- Add tests for observable acceptance criteria.
- Run `npm run typecheck`, `npm test`, and `npm run build`.
- Update `08_IMPLEMENTATION_PLAN.md` and `09_PROJECT_STATE.md`.
- Do not push or publish.
