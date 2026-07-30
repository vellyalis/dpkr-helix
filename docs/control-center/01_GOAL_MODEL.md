# Goal Model

## Subject

DevSpace, an MCP server that exposes approved local coding workspaces to ChatGPT and other MCP hosts.

## User

A user who wants ChatGPT Web to perform repository investigation, design, code editing, testing, review, and deliberate handoff to local Codex without repeatedly managing absolute paths or shell commands.

## Desired value

Make DevSpace feel like one coherent local development control surface:

- repository registration is visual and persistent,
- project selection in ChatGPT is name-based and deterministic,
- access policy is visible and enforced,
- local Codex receives structured, resumable implementation work,
- direct MCP, process, and local-agent work is visibly observable without a second runtime,
- result availability, verification, failure, block, and stop states are unmistakable,
- project management and live work share one coherent, accessible Control Center UI,
- changes remain inspectable and reversible,
- existing power-user paths continue to work.

## Goal invariants

1. DevSpace remains the single product and security boundary.
2. The existing public MCP endpoint remains the remote coding interface.
3. Local project administration is available only through a loopback-only dashboard in the same DevSpace process.
4. Registered projects must remain inside configured `allowedRoots`.
5. `workspaceId` remains the scope key for subsequent repository operations.
6. Existing `open_workspace` behavior remains backward compatible.
7. A registered project's permission policy cannot be bypassed by opening the same path through `open_workspace`.
8. Codex is never started silently. Delegation is an explicit, visible action.
9. Forgetting a registered project never deletes repository files.
10. The design must work on Windows. Unsupported native picker platforms degrade to scan/manual path entry.
11. No browser extension, Electron/Tauri shell, or second standalone application is introduced.
12. Live Operations is a bounded projection over existing canonical owners; it never becomes a second tool, process, agent, review, or Project State runtime.
13. An agent final response or successful command is never presented as verified completion without explicit required evidence.
14. Operation output excludes hidden reasoning, prompts, chat transcripts, secrets, environment values, and unnecessary file contents.
15. The Control Center preserves explicit text labels, keyboard access, light/dark support, and meaningful failure/disconnected states.
16. Remote Git publication and other external side effects remain outside automatic scope.

## Success conditions

The overall goal succeeds when all of the following are observed:

- The local dashboard starts with DevSpace and is reachable only through a loopback listener.
- The dashboard can scan approved roots, register a repository, edit its display settings, and forget it without touching repository contents.
- `list_projects` shows registered projects through MCP.
- `open_project` resolves a stable project identifier and returns a usable workspace.
- A project can be selected without the model receiving or guessing an absolute path from the user.
- Existing `open_workspace` still works and registered policies are enforced for matching paths.
- Project presets prevent disallowed write, shell, patch, artifact, and delegation operations.
- A structured task can be explicitly delegated to `codex-implementer`.
- Agent status and final response can be retrieved, and repository changes can be reviewed using existing change-review behavior.
- Direct MCP, DevSpace-managed process, and local-agent work appears as identifiable canonical runs with ordered, bounded, redacted events.
- The Runs/live-run UI shows current action, safe terminal output, changed files, diff, agent output, evidence gaps, elapsed time, failure/block reason, and reconnect state.
- `Result available — verification pending` is visibly distinct from `Verified`.
- Stop appears only for a real stoppable canonical owner and never claims rollback.
- Projects, Runs, Agents, and System share a coherent visual system and complete loading, empty, partial, stale, disconnected, and error states.
- Existing tests pass and new acceptance tests cover storage, path boundaries, UI data contracts, policy enforcement, delegation, live operations, accessibility, and reconnect behavior.
- Restarting DevSpace preserves registered projects and restores/reconciles persisted workspace, local-agent, and operation state as designed.
- ChatGPT Web receives bounded current repository context when a workspace is opened, without requiring the user to restate branch, dirty paths, or available root package scripts.
- The model-visible final review contract exposes bounded turn changes, current workspace changes, and verification freshness instead of relying on provider prose or a UI-only patch.
- A delegated Codex can return a structured material question and resume the same provider thread after the user's answer.
- Bounded agent-status waiting replaces repeated immediate polling without changing worker ownership.
- On the accepted parity suite, Web plus dpkr helix has no more mandatory failures than local Codex and has no permission, secret, pre-existing-work, or stale-verification regression.

## Failure conditions

The goal fails if any of these remain true:

- The user still has to type an absolute path for normal registered-project selection.
- The dashboard is accessible through the public tunnel without a separate local-admin secret and CSRF protection.
- A project outside `allowedRoots` can be registered, discovered, or opened.
- Direct `open_workspace` bypasses a registered project's restricted policy.
- The UI only displays static text and cannot initiate or clearly guide project selection where the host supports MCP Apps calls.
- Codex receives an unstructured chat dump, starts without explicit intent, or cannot be resumed/status-checked.
- The dashboard creates a second shell/process/agent execution path or replays side effects from event history.
- Agent final text is rendered as verified completion without evidence.
- Live output exposes hidden reasoning, prompts, environment values, credentials, or unnecessary file contents.
- Active, blocked, failed, stopped, result-available, and verified states are visually or semantically ambiguous.
- Existing MCP clients lose compatibility.
- “Forget project” deletes or modifies the repository.
- A native folder picker becomes a hard dependency for project discovery.
- The implementation requires a separate browser extension or desktop runtime.
- Verification performed on an older repository tree is presented as fresh for the current tree.
- A material delegated-task ambiguity is silently converted into an implementation assumption because no structured input outcome exists.
- A quality claim is based only on model name, reasoning effort, tool-call count, latency, or subjective impression rather than same-snapshot task evidence.
- Codex-parity work creates a second Git, process, agent, verification, state, notification, or orchestration owner.

## Responsibility map

### User responsibility

- Choose which filesystem roots DevSpace may access.
- Register or select projects.
- Choose the project permission preset.
- Explicitly request Codex delegation.
- Approve external publication operations when separately requested.

### DevSpace responsibility

- Enforce allowlists and project policy.
- Persist project identities and safe metadata.
- Provide local dashboard and MCP project-selection tools.
- Create and scope workspaces.
- Start, track, resume, and cancel supported local agents through existing adapters.
- Project real operation state through bounded run/event/evidence services without duplicating execution.
- Provide one coherent Projects/Runs/Agents/System Control Center with accessible and explicit state presentation.
- Preserve backward compatibility and provide meaningful errors.
- Keep secrets, prompts, hidden reasoning, environment values, and unnecessary file contents out of project files, logs, state, and operation output.
- Project bounded repository context, review bundles, verification fingerprints, structured local-agent outcomes, and wait results from existing canonical owners.

### ChatGPT responsibility

- Use project IDs/slugs instead of guessing paths.
- Reuse returned `workspaceId`.
- Respect project policy and explicit delegation requirements.
- Create a focused structured handoff envelope.
- Review tool results and repository changes before claiming completion.
- Treat missing, stale, truncated, or legacy-unknown evidence as incomplete rather than verified.
- Use bounded status waiting and answer a structured `needs_input` through the existing continuation path.

### Codex responsibility

- Work only within the assigned workspace and goal.
- Read repository instructions and referenced design documents.
- Implement acceptance criteria, run verification, and report blockers.
- Avoid remote publication without approval.
- Return the native structured outcome requested by dpkr helix and ask before mutation when a material ambiguity prevents correct completion.

### Environment responsibility

- Provide Node, Git, Bash-compatible shell where required, SQLite native module, and a configured tunnel for remote MCP.
- Provide a supported browser for the local dashboard.
- Provide local Codex authentication and SDK availability when delegation is used.

## Generalization requirement

The registry supports multiple allowed roots and multiple repositories. Each registered project can have its own default mode and policy. Repository context, review, verification freshness, structured outcomes, waiting, and parity fixtures must not hardcode the current `%USERPROFILE%\devspace` path or a single repository.

## Current goal gap

GOAL_01 through GOAL_07 are complete. The remaining accepted extension is
GOAL_08: prove parity against local Codex on identical repository snapshots,
then close only the measured gaps in model/profile settings, start context,
model-visible final review, verification freshness, structured material
questions, and bounded agent waiting. Current evidence does not justify a new
orchestration layer, vector index, reverse Web notification channel, automatic
agent fleet, or unconditional high-compute default.
