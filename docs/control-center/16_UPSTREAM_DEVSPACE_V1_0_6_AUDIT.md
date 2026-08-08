# Upstream DevSpace v1.0.6 Audit

## Scope and evidence

This audit compares the current dpkr helix product contracts with upstream
DevSpace through release `v1.0.6`.

- dpkr helix implementation baseline inspected: `e257511245b95fa485a570cc204efa56305b45fb`
- upstream comparison anchor: `0d9b60c72c2f154ef9fde918ebc9dd1335eba338`
- upstream target: `3bd0378b128c048add810dff00efeff4e7326eb9`
  (`Release v1.0.6`, 2026-08-06)

The public dpkr helix repository was intentionally published from a clean root,
so the current Helix and upstream histories have no Git merge base. Commit
counts therefore do not represent portable feature units. The review groups
the upstream work by merged product contract instead of attempting a tree merge
or bulk cherry-pick.

## Classification

| Candidate or evidence | Classification | dpkr helix decision |
| --- | --- | --- |
| PR #128 — ChatGPT conversation-aware workspace reuse | **Adopted, adapted** | Persist one checkout binding per opaque ChatGPT conversation and canonical project target. Apply it to both `open_workspace` and Helix's `open_project`. Keep worktree requests fresh. |
| PR #128 — review checkpoint restart and recovery hardening | **Adopted, adapted** | Preserve existing open/baseline refs across manager and server restarts, serialize concurrent initialization, reject workspace-ID/root mismatches, and recover a missing last-shown baseline from workspace open. Retain Helix's workspace-bounded fingerprint owner instead of copying upstream's repository-wide snapshot implementation. |
| PR #129 — shorter workspace IDs | **Adopted** | New workspaces use compact opaque IDs while all previously persisted IDs remain valid. |
| PR #124 — expanded root `AGENTS.md` product guidance | **Selective reference** | Do not replace Helix's product-specific complexity, recovery, handoff, verification, and security rules. Reuse upstream terminology or boundary guidance only when it closes an observed ambiguity. |
| PR #122 — card scrollbar styling | **Adopted, adapted** | Reuse the compatible thin-scrollbar behavior through Helix card tokens and the Pierre diff shadow-DOM override. Do not copy upstream colors as a second visual system. |
| PR #131 — tool-card UI overhaul | **Adopted correctness subset** | Port file-kind classification, rename-source presentation, direct single-file diff visibility, and bounded payload scrolling. Preserve Helix Project, Handoff, verification, and operation semantics instead of importing the complete React/CSS tree. |
| PR #134 — workspace-card/provider presentation | **Adopted, redesigned for Helix** | Replace the unstructured workspace text dump with one compact details surface for Project policy, mode/reuse, worktree base, repository state, Handoff, instructions, Skills, profiles, and providers. Defer branded provider logos because they add assets without improving current correctness or continuity. |
| Experimental commit `1c4b4c4` — host-installed Codex CLI | **Promising isolated experiment** | A host CLI could remove the bundled Codex SDK and its install-time Windows spawn repair while reusing the owner's normal Codex authentication and session store. Do not import it into this work unit: the branch is unmerged and does not preserve Helix's structured outcome, Operations, and verification contracts. |
| Experimental commit `a6564d2` — Codex app-server harness | **Defer; adapt before adoption** | The protocol can carry a turn `outputSchema`, but the command is explicitly experimental and the branch's harness does not pass Helix's outcome schema or retain all Helix lifecycle projections. Evaluate it in a separate worktree against the current SDK lane; do not bulk cherry-pick the runtime replacement. |
| Live Helix worker launch acknowledgement timeout | **Independent Helix fix adopted** | The observed failure occurred before provider execution. Keep the existing detached worker and IPC owner, extend its bounded internal launch grace from ten to thirty seconds, heartbeat active work, and reconcile stale active rows from the long-lived service. Do not add retries, a daemon, or a second worker executable without further evidence. |
| Release/version/readme changes | **No code import** | Helix has a separate product identity, source-distribution boundary, Windows recovery contract, and release process. |

## Post-release Codex runtime assessment

Two unmerged upstream branches published after `v1.0.6` explore replacing the
bundled Codex SDK with the owner's installed `codex` executable. The later
branch drives `codex app-server` over JSON-RPC stdio, probes a minimum CLI
version, removes DevSpace's own `node_modules/.bin` from the child PATH, and
adds CLI version details to provider availability and failures.

The direction has real potential for Helix:

- it would use the same official Codex installation, account, and normal
  session store as the existing `helix` launcher;
- it could remove the Codex SDK dependency and the narrow install-time
  `windowsHide` repair that Helix currently verifies; and
- provider availability could report the exact executable version instead of
  only the presence of a package.

It is not yet a safe drop-in replacement. The installed Codex CLI used for this
audit exposes `app-server` as an experimental command. Its generated v2 schema
does support an optional `outputSchema` on `turn/start`, but the upstream branch
does not pass `LOCAL_AGENT_OUTCOME_JSON_SCHEMA`, preserve Helix's
completed/needs-input contract, emit the existing assistant-message projection,
or prove the current Operations and verification lifecycle. The branch also
adds a substantial protocol client and therefore becomes a new compatibility
surface tied to CLI releases.

A future isolated experiment may adopt this direction only if it proves all of
the following against the current SDK lane under identical tasks:

1. structured completed and needs-input outcomes remain schema-constrained;
2. continuation resumes the same provider thread after restart;
3. Windows launches remain hidden and bounded;
4. assistant messages, result availability, evidence freshness, and
   verification project through the existing Operations owners;
5. unsupported CLI versions fail before worker side effects with an actionable
   version report; and
6. reverting to the current SDK lane requires no migration of Helix session or
   operation state.

## Independent worker cold-start finding

The audit's own read-only delegation produced a launch acknowledgement timeout.
Source inspection showed that `createDetachedLocalAgentWorkerSpawner` allowed
ten seconds for a detached child to load the complete CLI graph, initialize its
configuration and service, and send the IPC ready message. The failure occurs
before `runLocalAgentProvider`, so changing the Codex transport would not repair
it. On the same Windows environment, a cold source CLI start crossed the old
budget while a warmed worker acknowledged in roughly two seconds.

The accepted repair stays inside the existing worker owner: the default
acknowledgement grace is thirty seconds, remains bounded, and is internally
overridable only for focused tests. A delayed-ready fixture proves that the
spawner accepts a healthy but non-immediate child. While provider work is
active, the same worker now refreshes its existing store record every thirty
seconds. The long-lived service reconciles on startup and every five minutes;
only a starting/running record with no activity for one hour is changed to an
interrupted error and projected through the existing status observer. Worker
children skip this scan before their ready acknowledgement, so the truth repair
does not recreate the cold-start failure it fixes. This closes the observed
stale-running state without PID persistence or a new process owner. There is
still exactly one worker, one prompt file, one IPC acknowledgement, and no
automatic retry.

## Adopted workspace contract

The host-provided `openai/session` value is treated as an opaque conversation
scope, not parsed or interpreted as identity data. Before persistence it is
reduced to a prefixed SHA-256 storage key; the raw host value is never written
to SQLite.

```text
hashed conversation scope + canonical checkout target
                    |
                    v
     persisted workspace binding in existing SQLite
                    |
       +------------+-------------+
       |                          |
 valid active checkout      stale/invalid binding
       |                          |
 reuse workspaceId          delete binding, open new
```

The observable behavior is:

- the same ChatGPT conversation opening the same canonical checkout reuses the
  existing `workspaceId`;
- different conversations remain isolated;
- hosts that provide no conversation metadata retain explicit-open behavior and
  receive a fresh workspace;
- every worktree request remains fresh, even inside one conversation;
- concurrent duplicate checkout opens converge on one workspace;
- persisted bindings survive a registry/server restart;
- persisted rows contain only deterministic storage keys rather than raw host
  conversation values;
- a missing, inactive, disallowed, non-directory, or otherwise stale checkout
  binding is not reused;
- registered-project policy is refreshed through the existing project owner
  when a workspace is restored or reused.

On a repeated open, model-visible output keeps the current handoff, repository
context, project policy summary, and reuse instruction, but omits repeated
static `AGENTS.md`, Skill, provider, and profile bootstrap arrays. The MCP App
card still receives the complete display context in result metadata. This keeps
Helix's dynamic continuity information fresh without repeatedly spending model
context on unchanged setup material.

## Adopted review contract

The review manager now treats Git refs as the persistent source of truth rather
than overwriting them whenever its in-memory map is recreated.

- existing open and last-shown refs are discovered and retained;
- two simultaneous initializations share one operation;
- one workspace ID cannot silently acquire another root;
- a missing last-shown ref falls back to the workspace-open ref and may
  re-establish the baseline;
- a missing workspace-open ref is reported when that exact history is requested;
- snapshot creation continues to use Helix's existing workspace-root-bounded
  temporary-index fingerprint, so opening a nested project does not review
  unrelated files elsewhere in the containing repository.

## Implementation surface

- `src/request-meta.ts`
- `src/db/schema.ts`
- `src/db/migrations.ts`
- `src/workspace-store.ts`
- `src/workspaces.ts`
- `src/server.ts`
- `src/review-checkpoints.ts`
- `src/local-agent-service.ts`
- `src/local-agent-store.ts`
- `src/ui/card-types.ts`
- `src/ui/patch-display.ts`
- `src/ui/review-payload.tsx`
- `src/ui/scrollbar.ts`
- `src/ui/tool-display.ts`
- `src/ui/workspace-app.tsx`
- `src/ui/workspace-app.css`
- focused migration, metadata, workspace, review, worker-launch, and real MCP
  server tests

No dependency, daemon, background worker, second workspace owner, second review
store, permission expansion, or automatic local-agent workflow was added.

## Verification

Focused evidence completed during this audit:

- TypeScript typecheck passes.
- migration v10 creates the conversation-binding table, preserves the managed
  installation's historical v9 `local-agent-fallbacks` meaning, and upgrades
  both the managed-v9 and short-lived public-v9 histories without data loss;
- same/different/no-conversation and concurrent-open behavior passes;
- checkout reuse survives SQLite store and registry recreation;
- focused storage inspection proves raw conversation values are absent from the
  binding table and only prefixed SHA-256 keys are persisted;
- worktree opens remain fresh;
- review refs survive manager recreation;
- concurrent review initialization, root mismatch rejection, and missing
  baseline fallback pass;
- an in-memory MCP client proves that both `open_project` and `open_workspace`
  consume `openai/session`, reuse only within the same conversation, suppress
  repeated model bootstrap, and retain complete card metadata.
- focused card tests prove reused/worktree titles, review-file kinds, rename
  source and destination paths, direct single-file expansion, and complete
  workspace card metadata without exposing lifecycle flags in model schemas;
- the worker-spawner test proves a delayed but healthy IPC acknowledgement is
  accepted inside the new bounded default grace, and focused service/store tests
  prove heartbeat refresh, startup and periodic stale-active reconciliation,
  and worker-child reconciliation suppression before readiness;
- the complete `npm test` suite passes after updating the two existing tests
  that intentionally enumerate every schema migration;
- `npm run test:policy`, `npm run typecheck`, and the production build pass;
- the public-release content scan passes against an isolated temporary Git
  index containing the proposed new files. The ordinary working-tree invocation
  correctly remains red only because those files are intentionally untracked
  until a later commit decision; it reported no content or secret finding.

The installed ChatGPT connection still requires a normal package deployment or
self-update before this source change can be observed in a live conversation.

## Remaining upstream candidates

The next upstream-derived work should not be a general sync. Branded provider
logos and the remaining upstream workspace-card decoration are deferred because
the current profile/provider text is explicit and accessible without adding six
binary/SVG assets or a second presentation vocabulary. Reconsider only after a
live card observation identifies a recognition or density defect that the
existing Helix rows and chips cannot solve.

## Independent Helix follow-up classification

The same audit inspected the current installed state and source ownership rather
than limiting itself to upstream commits. The remaining candidates are ordered
by observed impact, not novelty.

| Candidate | Current evidence | Decision |
| --- | --- | --- |
| Local-agent launch and stale-active truth | A real delegation missed the ten-second acknowledgement; persisted state also contained active records whose workers no longer existed. | **Adopted now.** Thirty-second bounded acknowledgement, worker heartbeat, one-hour stale reconciliation, and focused proof stay inside existing owners. |
| Conversation-scope persistence | The first implementation would have stored the opaque host scope verbatim. | **Adopted now.** Persist only a prefixed SHA-256 key; keep raw scope transient. |
| Waiting MCP sessions dominate `NOW` | After live reuse deployment, 63 of 66 top-level active roots were connected `mcp-session:` runs in canonical phase `waiting`; only one was actively executing and two required action. | **Adopted as presentation only.** Add `STANDBY` for the exact session-root waiting shape. Do not complete, archive, hide, or otherwise mutate the live connection state. |
| Workspace-session retention | The installed database now contains 1,053 workspace-session rows, all marked active, while conversation reuse has only just begun with one binding. | **Measure before changing.** Observe the post-reuse creation rate and report counts/growth before adding retention. Do not delete old continuity state merely to reduce a currently small database. |
| Dependency refresh | `npm outdated` reports multiple minor and major updates, including MCP Apps, provider SDKs, diff rendering, SQLite, Vite, TypeScript, and Codex SDK. The reviewed production audit currently reports zero vulnerabilities. | **Separate compatibility batch.** Do not mix provider, native SQLite, build-tool, and UI-library upgrades into this large continuity change. Prioritize MCP Apps and patch-compatible provider SDK minors; isolate Codex SDK and native/major upgrades. |
| `createMcpServer` size | `src/server.ts` exceeds 100 KiB and `createMcpServer` spans more than 1,100 lines across workspace, agent, process, file, review, and HTTP registration concerns. | **Maintenance candidate, not current product work.** Split by existing owner boundaries only after this release is live; require no catalog, schema, authorization, or projection change. |
| Host-installed Codex app-server | The experimental branch removes SDK ownership but adds a substantial protocol client and omits current Helix outcome/Operations obligations. | **Isolated comparison only.** Keep the SDK lane until the acceptance contract above is proven. |
