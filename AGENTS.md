# DevSpace

This project exposes a local development workspace over MCP so ChatGPT, Claude,
or another MCP-capable host can operate directly on this machine's approved
development directories.

The goal is not to delegate work to a separate local coding agent. The MCP host
should call tools that read files, edit files, search code, and run shell
commands directly against approved local project roots.

Pi's SDK is currently used as the backend adapter for mature local coding
primitives such as read, edit, write, grep, find, ls, and bash. DevSpace wraps
those primitives behind a remote Streamable HTTP MCP interface, suitable for use
through a Cloudflare Tunnel.

The model-facing workflow is workspace based. MCP clients should call
`open_workspace` once per local project directory or worktree, then reuse the
returned `workspaceId` for subsequent tool calls in that same folder. Do not
call `open_workspace` again for the same folder unless the `workspaceId` is
rejected as unknown, the client switches folders/worktrees or checkout/worktree
mode, or the user explicitly asks to reopen. `AGENTS.md` files are returned
automatically by `open_workspace` and by later tool calls when the requested path
enters a directory with instructions that have not been loaded for that
workspace.

Core constraints:

- Treat this as remote access to the local machine; security is part of the
  core design, not a later add-on.
- Start with a narrow filesystem allowlist.
- Prefer explicit, inspectable tool calls over autonomous local agent loops.
- Keep the first version small enough to validate with real ChatGPT/Claude MCP
  clients before adding UI or workflow features.

## Complexity discipline

Preserve the complete accepted Goal, but implement each selected Micro Work Unit
with the simplest complete design that satisfies its current requirements and
proof obligations.

Before adding a dependency, service, store, background worker, event bus,
abstraction layer, configuration surface, platform adapter, cache, queue, or
other persistent mechanism, identify all of the following:

- the current requirement or concrete failure risk that requires it,
- the existing DevSpace owner or primitive that cannot satisfy that need,
- the simplest local alternative and direct evidence that it is insufficient,
- the new owner's failure mode, rollback/removal path, and verification burden.

If any item is missing, defer or reject the added complexity. A possible future
need, aesthetic preference, theoretical reuse, or speculative scale is not
enough.

Project-specific defaults:

- Extend the existing canonical owners (`WorkspaceRegistry`, `ProjectRegistry`,
  process sessions, local-agent runtime/store, SQLite, and the loopback
  dashboard) instead of creating a second owner or parallel source of truth.
- Do not prebuild later Goals, generic plugin systems, arbitrary policy
  languages, shell classifiers, multi-agent planners, new daemons, browser
  extensions, or desktop wrappers unless the selected Goal explicitly requires
  them.
- Do not extract an abstraction for anticipated duplication. Extract only when
  real current call paths share a stable invariant and leaving it local creates
  a concrete divergence or security risk.
- Do not combine unrelated cleanup, renaming, formatting, dependency upgrades,
  or architecture modernization with the selected Micro Work Unit.
- Do not add options, flags, extension points, fallback paths, persistence, or
  concurrency that are not exercised by a current acceptance criterion or
  required recovery case.
- Prefer a pure function or focused module before a framework, service, or new
  lifecycle owner. Prefer current package and platform APIs before a new
  dependency.
- Tests must prove acceptance boundaries, changed behavior, compatibility, and
  high-impact failures. Stop adding tests when the required proof obligations
  are closed and additional tests would not change a design or completion
  decision.

Stop the work unit when its observable contract is implemented, its focused and
required regression checks pass, blocking review findings are resolved, state is
synchronized, and the next executable action is recorded. Do not continue into
optional polish or the next Micro Work Unit merely because time or context
remains.

## DevSpace session continuity

When work is performed through DevSpace, optimize the execution unit for
reliable remote operation without reducing the Goal:

- Keep inspection, edits, tests, builds, reviews, and agent polling in small,
  timeout-resistant calls. Run independent verification commands separately.
- Use a process session and short polls for commands that genuinely need longer
  than one normal tool call. Never hide a large product-scope reduction behind
  the phrase “small step.”
- At session start, read the persistent handoff returned by `open_workspace`,
  then reconcile it with Git, code, configuration, Project State, and current
  test evidence before acting. Continue from the recorded next action instead
  of restarting completed work.
- The DevSpace MCP host must call `update_handoff` after every meaningful
  completed or interrupted work unit, immediately after starting or finishing a
  delegated agent, and again before the final response. Record exact completed
  work, verification, active agent IDs, residual risks, and the next executable
  action. A child agent that does not have this MCP tool must report those fields
  to its parent instead of attempting an unavailable command.
- Keep secrets, credentials, file contents, and full chat transcripts out of
  handoffs. Treat a handoff as resumable coordination state, not as a substitute
  for repository evidence.
