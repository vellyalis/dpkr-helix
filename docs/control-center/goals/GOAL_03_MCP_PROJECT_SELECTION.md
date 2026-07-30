/goal

# GOAL 03 — MCP Project Selection

## Goal

Let ChatGPT and other MCP hosts list and open registered projects by stable identity, with an interactive card where supported and a safe fallback everywhere else.

## Dependencies

GOAL_01 must be DONE.

## User-visible outcome

The user can say “show my projects” and open one by name/slug. Absolute paths are no longer needed for normal registered projects.

## Scope

- `list_projects`
- `open_project`
- shared serialization with `open_workspace`
- server instruction updates
- project list/open structured output and text
- MCP Apps project card
- capability-aware `callServerTool` behavior
- message/copy fallback
- UI/tool contract tests
- docs/state

## Non-scope

- registry mutation over MCP
- project preset enforcement
- local-agent delegation tools
- local dashboard implementation, except compatibility with its data model

## Acceptance criteria

- AC-03.1: `list_projects` is read-only and returns sanitized project views.
- AC-03.2: `open_project` implements exact ID/slug/unambiguous-name resolution and default mode.
- AC-03.3: Ambiguous name does not open a project.
- AC-03.4: Open result is compatible with `open_workspace` and includes project metadata.
- AC-03.5: Existing `open_workspace` schema and behavior remain available.
- AC-03.6: Project card displays availability, preset, mode, and open actions.
- AC-03.7: Interactive actions require host `serverTools` capability.
- AC-03.8: Unsupported hosts receive useful fallback text/message behavior.
- AC-03.9: Existing card tests and render paths do not regress.
- AC-03.10: Standard verification passes.
- AC-03.11: Manual ChatGPT test can select a registered project without entering its path.

## Proof obligations

- MCP schema/annotation tests,
- selector and ambiguity tests,
- UI capability/fallback tests,
- open-worktree compatibility test,
- plain MCP text result test,
- manual real-host evidence.

## Real-host acceptance recovery order

AC-03.11 remains inside GOAL_03. Browser/Playwright preparation is a support substep, not a separate Goal and not permission to begin GOAL_04 early.

Execute in this order:

1. release any Edge process locking the dedicated AC-03.11 automation profile,
2. prove local Codex can control a signed-in `https://chatgpt.com/` tab,
3. identify the stale global DevSpace serve process by exact executable, command line, and creation time,
4. restart only that canonical process,
5. reconnect or refresh the ChatGPT DevSpace connector,
6. call `list_projects`, open one registered project without entering its absolute path, and use the returned `workspaceId` for a read-only workspace call,
7. record real-host card/fallback/capability evidence,
8. mark GOAL_03 DONE only after AC-03.11 closes,
9. begin GOAL_04 afterward.

The portable Windows installer remains owned by `scripts/setup-windows.ps1`. Machine-specific signed-in-profile helpers are local acceptance recovery only and are reconciled with portable setup in GOAL_07.

## Shared rules

- Follow the short bootstrap reading order in `CODEX_IMPLEMENTATION_PROMPT.md`; then read only this Goal and the exact files needed for the current acceptance/recovery unit.
- Reconcile design claims with current code.
- Preserve current public behavior unless this goal explicitly changes it.
- Keep changes focused.
- Do not implement later goals opportunistically.
- Add tests for observable acceptance criteria.
- Run `npm run typecheck`, `npm test`, and `npm run build`.
- Update `08_IMPLEMENTATION_PLAN.md` and `09_PROJECT_STATE.md`.
- Do not push or publish.
