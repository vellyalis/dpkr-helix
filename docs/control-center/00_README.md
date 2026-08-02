# DevSpace Control Center

## Purpose

DevSpace Control Center is an integrated feature set inside the existing DevSpace repository.

It creates a smoother human-facing bridge between ChatGPT Web, approved local repositories, existing workspace/file/process tools, and configured local-agent providers such as Codex.

It is not a browser extension, a desktop wrapper, a separate daemon, or a replacement for DevSpace.

## User experience after completion

The user starts DevSpace and opens a loopback-only Control Center.

The Projects screen shows allowed roots, discovered repositories, registered projects, availability, Git state, permission preset, default workspace mode, and active work.

In ChatGPT, the user can ask DevSpace to list projects and open one by stable project ID or slug rather than repeatedly typing an absolute Windows path. `open_project` returns the same workspace context and `workspaceId` guarantees as `open_workspace`.

When implementation should move to a configured local agent, ChatGPT uses an explicit structured delegation tool. DevSpace starts or resumes the existing canonical local-agent path in the same workspace.

The Runs screen makes direct MCP, DevSpace-managed process, and local-agent work observable. The user can inspect semantic activity, safe terminal output, changed files, diff, agent output, verification, review, and Project State evidence. The UI distinguishes `Result available — verification pending` from `Verified` and exposes stop only for a real stoppable DevSpace-owned worker.

## Existing repository facts used by this design

- Package: `@waishnav/devspace`
- Inspected version: `1.0.4`
- Runtime: Node.js and TypeScript
- Server: Express plus Streamable HTTP MCP
- UI: React/Vite MCP Apps resource plus loopback dashboard entry
- Persistence: SQLite through `better-sqlite3` and Drizzle
- Workspace lifecycle: `WorkspaceRegistry`
- Process lifecycle: existing `ProcessSessionManager`
- Local-agent support: Codex SDK plus configured provider adapters
- Local-agent persistence: existing local-agent session store
- Public workflow: `open_workspace` followed by workspace-scoped tools
- Project workflow: additive `list_projects` and `open_project`
- Session continuity: repository HANDOFF plus persistent DevSpace handoff state

## Package map

- `01_GOAL_MODEL.md`: product goal, invariants, success, and failure conditions
- `02_REQUIREMENTS.md`: functional and non-functional requirements
- `03_PRODUCT_SPECIFICATION.md`: user-visible behavior and interaction flows
- `04_ARCHITECTURE.md`: responsibility boundaries and system data flow
- `05_DETAILED_DESIGN.md`: modules, schemas, APIs, algorithms, and failure behavior
- `06_SECURITY_AND_PERMISSIONS.md`: trust boundaries and enforcement rules
- `07_TEST_AND_ACCEPTANCE_PLAN.md`: automated and manual proof obligations
- `08_IMPLEMENTATION_PLAN.md`: ordered Goal status, dependencies, and accumulated evidence
- `09_PROJECT_STATE.md`: resumable current state and current bottleneck
- `10_DECISIONS.md`: accepted architecture decisions and reconsideration conditions
- `11_LIVE_OPERATIONS_DASHBOARD.md`: canonical run/event/evidence/stream/stop contract
- `12_UI_VISUAL_DESIGN_SYSTEM.md`: canonical visual tokens, components, interaction, and accessibility rules
- `13_UI_SCREEN_SPECIFICATIONS.md`: Projects, Runs, live run, Agents, and System screen contracts
- `14_REQUIREMENTS_EVIDENCE_MATRIX.md`: requirement-to-proof traceability
- `15_STATE_LEDGER.md`: append-only, public-safe milestone history
- `HANDOFF.md`: current Micro Work Unit, exact evidence, risks, and next executable action
- `goals/`: one implementation Goal contract per increment
- `goals/GOAL_08_CODEX_PARITY.md`: accepted quality/parity extension, bounded
  context/review/outcome contracts, and evaluation plan
- `goals/GOAL_09_PUBLIC_RELEASE_READINESS.md`: same-repository public/private
  boundary, release gates, and deferred publication cutover
- `../ROADMAP.md`: public, status-labeled summary of shipped capabilities and
  accepted future work; Goal files and Project State remain authoritative
- root `CODEX_IMPLEMENTATION_PROMPT.md`: safe resume and Micro Work Unit runner

## Goal sequence

1. GOAL_01 Registry Foundation
2. GOAL_02 Discovery and Local Dashboard
3. GOAL_03 MCP Project Selection
4. GOAL_04 Project Policy Enforcement
5. GOAL_05 Codex Handoff
6. GOAL_06 Live Operations and Control Center UI
7. GOAL_07 Integration, Hardening, and Final Acceptance
8. GOAL_08 Codex-Parity Coding Quality
9. GOAL_09 Public Release Readiness

Goals control dependency and acceptance scope. Each DevSpace session performs one small timeout-resistant Micro Work Unit and resumes from HANDOFF. Small execution units must not reduce the final product Goal.

GOAL_01 through GOAL_07 are completed product baselines. GOAL_08 is an additive
quality extension in progress; MWU-08.01 through MWU-08.03 are complete and
MWU-08.04 structured Codex outcomes are next.
GOAL_09 completed the reviewed clean-history source publication without
changing runtime owners or the installed path.

## Source-of-truth and upgrade safety

The current repository, Git state, code, direct execution results, tests, Project State, decisions, and HANDOFF are authoritative.

Do not force-copy an older Control Center ZIP over a repository that already contains implementation progress. Older installers may overwrite:

- `CODEX_IMPLEMENTATION_PROMPT.md`,
- design documents,
- implementation status,
- Project State,
- decisions,
- Goal evidence.

External packages are reference inputs only until compared with the current checkout. Integrate missing contracts and implementation slices additively. Record material conflicts in `10_DECISIONS.md`.

The superseded `goals/GOAL_06_INTEGRATION_AND_HARDENING.md` filename remains only as a compatibility pointer. The active files are `GOAL_06_LIVE_OPERATIONS_DASHBOARD.md` and `GOAL_07_INTEGRATION_AND_HARDENING.md`.

## Scope discipline

Do not ship:

- a dashboard that does not connect to real DevSpace state,
- an MCP picker without local project administration,
- a delegation button that silently starts an agent,
- a live view powered by fake timers,
- a second execution/process/agent owner,
- a final response presented as verification without evidence,
- a decorative UI rewrite that weakens information hierarchy, security, or compatibility.

## Starting or resuming work

Open the repository through DevSpace in the requested checkout/worktree mode.

Then instruct the implementation model:

```text
Read CODEX_IMPLEMENTATION_PROMPT.md and resume the exact next Micro Work Unit from docs/control-center/HANDOFF.md. Do not repeat completed work.
```

The model must begin with the short bootstrap reading order in the implementation prompt rather than rereading every design document on every session.
