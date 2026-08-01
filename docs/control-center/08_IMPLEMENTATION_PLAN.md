# Implementation Plan

## Status values

- `NOT_STARTED`
- `IN_PROGRESS`
- `BLOCKED`
- `DONE`

Codex must select the first non-DONE goal whose dependencies are DONE.

## Goal table

| Goal | Status | Dependencies | Outcome |
|---|---|---|---|
| GOAL_01 Registry Foundation | DONE | none | Persistent registered projects, canonical path identity, workspace association |
| GOAL_02 Discovery and Local Dashboard | DONE | GOAL_01 | Loopback admin surface, scan/import/edit/forget, CLI dashboard command |
| GOAL_03 MCP Project Selection | DONE | GOAL_01 | `list_projects`, `open_project`, project cards and capability fallback; real ChatGPT host opened registered project `devspace` without an absolute path and read `AGENTS.md` from the returned workspace |
| GOAL_04 Project Policy Enforcement | DONE | GOAL_01, GOAL_03 | Centralized inspect/design/develop enforcement across all current workspace, path, artifact, process-start, and local-agent owners; full compatibility/security proof closed |
| GOAL_05 Codex Handoff | DONE | GOAL_03, GOAL_04 | Reusable local-agent service and explicit structured MCP delegation |
| GOAL_06 Live Operations and Control Center UI | DONE | GOAL_02, GOAL_03, GOAL_04, GOAL_05 | Canonical operation projection, live run evidence, coherent Projects/Runs/Agents/System UI |
| GOAL_07 Integration and Hardening | DONE | GOAL_02, GOAL_03, GOAL_04, GOAL_05, GOAL_06 | End-to-end UX, reliability, security, docs, visual/accessibility, compatibility proof |
| GOAL_08 Codex-Parity Coding Quality | IN_PROGRESS | GOAL_07 | MWU-08.01 current baseline complete; candidate comparison and configuration selection active |
| GOAL_09 Public Release Readiness | DONE | GOAL_07 | Clean-history source release published and publicly verified |

GOAL_02 and GOAL_03 may be implemented in either order after GOAL_01. Do not work on both in the same worktree unless explicitly orchestrated with non-overlapping write ownership.

Plan revision on 2026-07-28: the previously unstarted final GOAL_06 was moved to GOAL_07, and a new GOAL_06 was inserted for Live Operations and the Control Center UI. Completed GOAL_01/02 evidence and the current GOAL_03 blocker were preserved. `goals/GOAL_06_INTEGRATION_AND_HARDENING.md` is now a compatibility pointer only.

## Cross-plan ordering and ownership

The portable Windows setup already present in this repository is a completed baseline, not an additional Control Center Goal.

- `scripts/setup-windows.ps1`, its tests, and `docs/setup-windows.md` own the portable/fresh-PC installation contract.
- Browser setup performed only to prove AC-03.11 is an acceptance-recovery substep inside GOAL_03. It does not become GOAL_04, GOAL_06, or a second installer.
- A machine-specific helper that clones a signed-in Edge profile or replaces the local Codex `playwright` entry is local acceptance support only. It must not redefine the portable installer or become a distributable credential-migration mechanism.
- GOAL_04 and GOAL_05 preserve the portable setup baseline and must not edit its installer opportunistically.
- GOAL_06 may create stable runtime/UI configuration requirements, but portable installer changes wait until those contracts stabilize.
- GOAL_07 owns final portable installer, configuration, documentation, and integration-test reconciliation.

Strict execution order from the current state:

```text
GOAL_04 MWU-04.02 workspace/worktree/restored policy attachment and direct-open bypass protection - DONE
  -> MWU-04.03 file/edit/write and design-documentation path enforcement - DONE
  -> MWU-04.04 patch preauthorization before mutation - DONE
  -> MWU-04.05 artifact destination and shell/process preauthorization - DONE
  -> MWU-04.06 local-agent authorization integration point - DONE
  -> MWU-04.07 complete matrix/security/compatibility proof; mark GOAL_04 DONE - DONE
  -> GOAL_05 shared local-agent/Codex handoff
  -> GOAL_06 live operations and Control Center UI
  -> GOAL_07 integration, portable setup reconciliation, and final acceptance
  -> GOAL_08 measured Codex parity and coding-quality contracts
```

Support work may unblock the current Goal but never authorizes skipping its acceptance criteria or starting a dependent Goal early.

## Goal evidence template

When marking a goal DONE, append:

```text
Completed:
Commit/worktree:
Changed modules:
Automated evidence:
Manual evidence:
Known residual risks:
Next eligible goal:
```

## GOAL_01 completion evidence

Completed: 2026-07-28

Commit/worktree: checkout worktree on `local/control-center-setup`; implementation remains uncommitted. Current HEAD is `ac475ca feat: add portable Windows setup`, an unrelated parallel commit that landed during this Goal.

Changed modules:

- `src/projects/project-types.ts`
- `src/projects/project-dto.ts`
- `src/projects/project-store.ts`
- `src/projects/project-registry.ts`
- `src/db/client.ts`
- `src/db/schema.ts`
- `src/db/migrations.ts`
- `src/workspace-store.ts`
- `src/workspaces.ts`
- `src/server.ts`
- `package.json`
- GOAL_01 migration, registry, and workspace-association tests

Automated evidence:

- `npm run typecheck` passed.
- `npm test` passed, including migration v4, registry, Windows path-key, symlink/outside-root, concurrent duplicate registration, checkout/worktree association, nested worktree source-root, legacy session, restart, and fail-closed persisted-value tests.
- `npm run build` passed.
- A temporary clean copy completed `npm ci`, then passed the same typecheck, test, and build gates using `package-lock.json` exactly.
- `git diff --check` passed.

Manual evidence:

- Public `open_workspace` MCP input/output schemas and structured content were not expanded.
- Existing MCP, OAuth, CLI, widget, local-agent, and workspace tests passed.
- Independent review found and reproduced a nested-worktree identity defect; the defect was fixed by resolving Project identity from the actual Git `sourceRoot`.
- Independent re-review reported no S0-S2 blocking findings.
- Secret-like scan found only an explicit test-only OAuth token fixture already required by existing configuration tests.

Known residual risks:

- Project policy enforcement is intentionally not active until GOAL_04; GOAL_01 only persists and attaches the preset placeholder.
- Dashboard, discovery, MCP project tools, and Codex handoff remain unimplemented by design.
- The existing Vite build emits chunk-size warnings; GOAL_01 does not change UI bundles.
- The live checkout dependency directory was repaired while DevSpace was running and may contain semver-compatible versions newer than the lockfile; the clean `npm ci` verification surface passed and `package-lock.json` is unchanged.

Next eligible goal: GOAL_02 Discovery and Local Dashboard. GOAL_03 is also dependency-eligible, but GOAL_02 is the first remaining Goal in plan order.

## GOAL_02 completion evidence

Completed: 2026-07-28

Commit/worktree: checkout worktree on `local/control-center-setup`; implementation remains uncommitted on top of the dirty GOAL_01 baseline.

Changed modules:

- `src/admin/admin-auth.ts`
- `src/admin/admin-server.ts`
- `src/admin/browser-open.ts`
- `src/admin/folder-picker.ts`
- `src/projects/project-discovery.ts`
- `src/dashboard/api.ts`
- `src/dashboard/main.tsx`
- `src/dashboard/styles.css`
- `src/ui/dashboard.html`
- `src/config.ts`
- `src/user-config.ts`
- `src/cli.ts`
- `src/server.ts`
- `vite.config.ts`
- GOAL_02 config, discovery, admin, picker, browser-open, CLI, and Windows process-session test updates

Automated evidence:

- `npm run typecheck` passed.
- `npm test` passed, including bounded discovery, dashboard auth/session/CSRF abuse checks, local/public route separation, forget-with-files-preserved, mocked Windows picker/fallback, browser-open URL redaction, dashboard config compatibility, and CLI help coverage.
- `npm run build` passed and emitted both `dist/ui/workspace-app.html` and `dist/ui/dashboard.html`; the existing Vite chunk-size warnings remain.

Manual evidence:

- Built-server smoke started `node dist/cli.js serve` with temporary config, confirmed MCP `/healthz` on the MCP port and dashboard HTML on the distinct loopback dashboard port.
- The smoke used a dashboard bootstrap token from environment and did not print the token-bearing URL.

Known residual risks:

- The dashboard UI is functional but still intentionally local-admin only; MCP `list_projects`/`open_project` and MCP Apps project cards remain GOAL_03.
- Project permission enforcement remains GOAL_04; GOAL_02 can edit stored presets but does not enforce side-effect tools.
- Windows native folder picker is covered through a mocked process adapter; a real Windows Forms dialog was not opened in automated verification.
- Dashboard startup failure is handled as a warning in `serve`; a live port-conflict smoke was not run beyond automated route/server coverage.
- `process-sessions.test.ts` now skips a Unix-style non-PTY Ctrl-C fixture on Windows because it can leave an unkillable child process on this runtime.

Next eligible goal: GOAL_03 MCP Project Selection.

## Cross-cutting session continuity evidence

Completed: 2026-07-28, by explicit user request after GOAL_02.

Changed modules:

- `AGENTS.md`
- `skills/subagent-delegation/SKILL.md`
- `src/workspace-handoff-store.ts`
- `src/db/schema.ts`
- `src/db/migrations.ts`
- `src/server.ts`
- migration, OAuth migration-list, and workspace-handoff tests

Behavior:

- DevSpace-wide instructions require small timeout-resistant execution and polling units without reducing the selected Goal.
- `open_workspace` returns the persisted workspace-root handoff and instructs the model to reconcile it with repository evidence before continuing; parallel worktrees remain isolated.
- `get_handoff` and `update_handoff` provide explicit structured persistence outside the repository.
- Delegated agent IDs and terminal results must be written to the handoff so later sessions resume polling/review instead of starting duplicate agents.

Automated evidence:

- `npm run typecheck` passed.
- `npm test` passed, including migration v5 and handoff persistence/reopen/Windows path-key tests.
- `npm run build` passed; built artifacts contain the new tools and continuity instruction.
- `git diff --check` passed with only existing Windows line-ending warnings.
- Independent review identified three valid S2 findings: omitted partial updates erased existing fields, parallel worktrees shared a handoff key, and secret-free persistence relied only on instructions. All three were fixed; the same reviewer thread re-reviewed the focused diff and reported no unresolved S0-S2 findings and no blocking defect.

Known residual risks:

- The current DevSpace process is healthy and ChatGPT Web exposes the GOAL_03 tools after plugin refresh. GOAL_03 AC-03.11 is complete after registering `devspace` through the official local Dashboard API and proving the path-free `list_projects` -> `open_project` -> one `read` flow in a normal persistent ChatGPT chat.
- Handoff content is model-authored coordination state and can become stale; Git, code, configuration, Project State, and test results remain authoritative. Known secret-like/transcript content is rejected at persistence, but classification remains conservative.

## GOAL_03 implementation evidence

Implementation completed: 2026-07-28

Completed: 2026-07-29

Goal status: DONE. The DevSpace server is healthy and the real ChatGPT Web app/tool catalog exposes `list_projects`, `open_project`, `get_handoff`, and `update_handoff` after plugin refresh. AC-03.11 passed in a normal persistent ChatGPT chat after the live registry contained the available `devspace` project; ChatGPT listed the project, opened it by slug without an absolute path, and read `AGENTS.md` exactly once through the returned `workspaceId`.

Commit/worktree: checkout worktree on `local/control-center-setup`; implementation remains uncommitted on top of the dirty GOAL_01, GOAL_02, and session-continuity baseline. Current HEAD is `45835ae docs: record standalone distribution boundary`.

Changed modules:

- `src/server.ts`
- `src/projects/project-mcp.ts`
- `src/projects/project-mcp.test.ts`
- `src/projects/project-mcp-server.test.ts`
- `src/ui/card-types.ts`
- `src/ui/card-types.test.ts`
- `src/ui/project-actions.ts`
- `src/ui/project-actions.test.ts`
- `src/ui/tool-display.ts`
- `src/ui/tool-display.test.ts`
- `src/ui/workspace-app.tsx`
- `src/ui/workspace-app.css`
- `package.json`

Automated evidence:

- `npx tsx src/projects/project-mcp.test.ts`, `npx tsx src/projects/project-mcp-server.test.ts`, `npx tsx src/ui/project-actions.test.ts`, `npx tsx src/ui/card-types.test.ts`, and `npx tsx src/ui/tool-display.test.ts` passed on 2026-07-28.
- `src/projects/project-mcp-server.test.ts` connects an MCP SDK `Client` to the actual registered `McpServer` with `InMemoryTransport`, lists the real tool catalog, verifies `list_projects`/`open_project` metadata, schemas, app visibility, and annotations, calls `list_projects`, exercises unavailable and ambiguous `open_project` errors without a `workspaceId`, and opens checkout plus managed worktree projects through the real `WorkspaceRegistry`.
- The new MCP client smoke found and fixed two schema/runtime mismatches: `open_project` structured error output is now declared in the registered output schema, and shared workspace-open structured output now includes `result` plus the actual worktree `sourceRoot` field.
- `npm run typecheck` passed after the schema/test additions.
- `npm test` passed, including new project MCP schema/annotation/plain-text/list filtering/selector/ambiguity/worktree/default-mode coverage, actual registered MCP server/client coverage, and UI capability/fallback helper coverage.
- `npm run build` passed and emitted the updated MCP App bundle containing `list_projects`, `open_project`, `serverTools`, and project open action strings; the existing Vite chunk-size warning remains.
- `git diff --check` passed with only existing Windows line-ending warnings.
- Independent review found four valid defects: `open_project` was not app-callable, its annotations misrepresented worktree/session side effects, clipboard fallback could claim success without a copyable command, and `updateModelContext` ignored advertised modalities. All four were fixed. The same reviewer thread re-reviewed the focused changes and reported no unresolved S0-S2 findings and no blocking code defect.
- Restart-readiness preflight passed on 2026-07-28: `npx tsx src/projects/project-mcp.test.ts`, `npx tsx src/ui/project-actions.test.ts`, and `npm run typecheck`. Repository and global installed built artifacts both contain `list_projects`, `open_project`, `get_handoff`, and `update_handoff`.

Manual evidence:

- Real ChatGPT/MCP-host card click selection was initially pending because the running global CLI predated the installed bundle and retained the old tool catalog. The built bundle and automated fallback tests covered the capability branches available without a real host, but did not satisfy AC-03.11.
- The first real-host attempt did not restart DevSpace because no safe browser-control/reconnection path was available. Browser runtime API inspection exposed no attachable browser backend, and the available Playwright tab surface was unavailable. Repository and globally installed bundles both contained `list_projects`, `open_project`, `get_handoff`, and `update_handoff`, but restarting without a controllable browser surface would have risked severing the parent connection without enabling AC-03.11 verification.
- Real-host retry on 2026-07-29 confirmed the normal Codex `playwright` MCP entry under `%USERPROFILE%\.codex` uses the system Node executable with the local `@playwright/mcp` CLI, Microsoft Edge, a dedicated `%LOCALAPPDATA%\ms-playwright\codex-chatgpt` profile, and the existing Playwright output/console limits. The dedicated profile directory exists and contains an Edge profile. Browser control still did not become available: host-level `mcp__playwright.browser_navigate("https://chatgpt.com/")` returned `user cancelled MCP tool call`; Browser runtime `getForUrl("https://chatgpt.com/")` returned `No browser is available` and troubleshooting-directed `agent.browsers.list()` returned `[]`; a direct MCP client could start the local Playwright MCP server and list `browser_navigate`/`browser_snapshot`, but navigation failed because the profile was already locked by an existing Edge instance; official `--extension` attach reported the Playwright Extension was not installed. DevSpace was intentionally not restarted because there was still no controllable ChatGPT Web tab and no safe reconnection path.
- Follow-up retry on 2026-07-29 attempted to identify only Microsoft Edge processes whose command line contained the dedicated `%LOCALAPPDATA%\ms-playwright\codex-chatgpt` profile. `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'"` failed with access denied, `wmic` was not installed, and `Get-Process` exposed only PID/path/window/start-time without command-line arguments. No Edge process was closed because PID/start-time inference would violate the exact command-line boundary. DevSpace was not restarted.
- Safe-inference retry on 2026-07-29 used the user's verified observation that there were zero `msedge.exe` processes before the setup script and all current `msedge.exe` processes started together from that launch. Local Codex closed only those newly started Edge processes; `msedgewebview2.exe` was not targeted and no DevSpace process was touched. A follow-up `Get-Process -Name msedge` returned no visible `msedge.exe` processes. The configured direct local Playwright MCP launch still reported the dedicated `%LOCALAPPDATA%\ms-playwright\codex-chatgpt` profile as already in use; native profile listing showed no root `Singleton*` or `DevTools*` file and only an existing `Default\LOCK` data file. The wrapped `mcp__playwright.browser_navigate("https://chatgpt.com/")` still returned `user cancelled MCP tool call`. DevSpace was not restarted because ChatGPT browser control and signed-in state were not proven.
- CDP recovery on 2026-07-29 verified `http://127.0.0.1:9222/json/version` returns Edge `Edg/150.0.4078.99` with a WebSocket debugger URL and normal Codex `playwright` points to local `@playwright/mcp` with `--cdp-endpoint=http://127.0.0.1:9222`. Host-level Playwright MCP remained approval-cancelled and direct local Playwright MCP over CDP failed on sandboxed Playwright cache access, but raw CDP control of `https://chatgpt.com/` was proven: the page title was `ChatGPT`, visible signed-in UI text included ChatGPT Pro, chat history, new chat, library, and projects, and no login/signup prompt was present. This evidence was persisted before restarting DevSpace because the parent MCP connection may drop.
- Historical DevSpace restart failure on 2026-07-29: stopped the old global DevSpace Node process, then attempted to relaunch the installed `@waishnav/devspace` CLI. The relaunched process exited with an `EPERM` chmod error under `%USERPROFILE%\.local\share\devspace`. This is superseded by the later successful restarts and current health proof.
- GOAL_03 AC-03.11 retry on 2026-07-29 used Playwright MCP against the existing signed-in Edge CDP session. Verified DevSpace health on `http://127.0.0.1:7676/healthz` and the active Node process. Opened a fresh temporary ChatGPT Web chat. The first attempt showed the stale DevSpace catalog; the installed DevSpace plugin was already set to `すべて許可`, and the plugin detail `更新する` action refreshed the host catalog to include `get_handoff`, `list_projects`, `open_project`, and `update_handoff`. A second fresh temporary chat displayed a DevSpace app iframe from `list_projects`, but the frame reported `Registered projects`, `0 registered`, `0 available · 0 unavailable`, and `No registered projects are available.` A local read-only SQLite check under `%USERPROFILE%\.local\share\devspace` confirmed `registered_projects` row count was 0. AC-03.11 remained blocked until an available project was registered.
- GOAL_03 AC-03.11 persistent-chat retry on 2026-07-29 used only the configured Playwright MCP controls attached to the existing Edge CDP session. `browser_tabs list` showed signed-in ChatGPT tabs, then `browser_tabs new https://chatgpt.com/` opened a normal persistent ChatGPT chat at `https://chatgpt.com/` with no `temporary-chat` parameter. `browser_type` submitted the path-free DevSpace request, and the ChatGPT turn displayed a DevSpace app/tool result for project listing. The visible iframe result reported `Registered projects`, `0 registered`, `0 available · 0 unavailable`, and `No registered projects are available.` The final ChatGPT-visible structured result reported `result: No registered projects are available.`, `total: 0`, `available: 0`, and `projects: []`. No `open_project` call, `workspaceId`, project metadata, or `read` proof could be produced because there was no first available project id or slug. A direct attempt to click the composer plugin selector via Playwright MCP returned `TimeoutError: browserBackend.callTool: Timeout 5000ms exceeded` while waiting for the `プラグイン` button to become stable, but the later submitted turn still invoked DevSpace and produced the empty `list_projects` result.
- GOAL_03 AC-03.11 final persistent-chat acceptance on 2026-07-29 used the configured Playwright MCP controls attached to the existing Edge CDP session and continued a normal persistent ChatGPT Work chat with DevSpace selected. ChatGPT called `DevSpace.list_projects({})`, then `DevSpace.open_project({"project":"devspace"})`, then `DevSpace.read` exactly once for `AGENTS.md` using the returned workspace. Actual visible results: slug `devspace`, name `DevSpace`, root `%USERPROFILE%\devspace`, preset `develop`, mode `checkout`, availability `available`, and a valid returned workspace ID; the `AGENTS.md` read succeeded. ChatGPT explicitly reported that `open_workspace` and absolute-path open were not used and `read` was called once.

Known residual risks:

- The DevSpace server was healthy on its local MCP and dashboard ports after reloading the newly added dashboard token; no additional restart was performed during the final `list_projects` -> `open_project` -> `read` sequence.
- Project-card Open button behavior and fallback UI remain covered by automated tests; the final real-host AC-03.11 acceptance used ChatGPT model tool calls rather than manually clicking the card's Open Checkout action.
- Project permission preset enforcement is intentionally not implemented until GOAL_04.
- Local-agent delegation tools are intentionally not implemented until GOAL_05.

Next eligible goal: GOAL_04 Project Policy Enforcement.

## GOAL_04 progress evidence

Started: 2026-07-29

Goal status: DONE.

MWU-04.01 completed: one pure centralized operation-only policy contract and exhaustive typed preset/operation matrix were added under `src/projects`. The contract covers registered-project and legacy sources; `read`, `search`, `list`, `write`, `edit`, `patch`, `artifact_write`, `shell`, `delegate_read_only`, `delegate_write`, and `delegate_full_access`; explicit required scopes; sanitized actionable denials; and current `LocalAgentWriteMode` mapping. Registered `delegate_full_access` is explicitly denied for every preset, while legacy full access remains explicit for compatibility. No runtime handler or path authorization was wired in this unit.

Changed modules:

- `src/projects/project-policy.ts`
- `src/projects/project-policy.test.ts`
- `package.json`
- `docs/control-center/05_DETAILED_DESIGN.md`
- `docs/control-center/06_SECURITY_AND_PERMISSIONS.md`
- `docs/control-center/08_IMPLEMENTATION_PLAN.md`
- `docs/control-center/09_PROJECT_STATE.md`
- `docs/control-center/HANDOFF.md`

Automated evidence:

- `npx tsx src/projects/project-policy.test.ts` passed.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run build` passed with the existing Vite chunk-size warning only.
- `git diff --check` passed with Windows line-ending warnings only.
- Independent review found two valid contract gaps: implicit `full_access` handling and missing first-class `edit`. Both were fixed; focused re-review reported zero unresolved S0-S2 findings.

Known residual risks:

- The policy contract is intentionally not enforced yet.
- Canonical workspace and design-documentation path authorization remains owned by later GOAL_04 units.

MWU-04.02 scope: attach current registered-project policy metadata to checkout/worktree/restored workspaces and prove direct `open_workspace` cannot bypass it.

MWU-04.02 completed: `ProjectRegistry.findByPath` now selects the most-specific currently valid registered project whose canonical root contains the opened checkout/source path, using exact path-segment boundaries, Windows case-folding, and filesystem-root-safe prefix handling. Candidate projects are revalidated against current allowed roots and current real paths before association. `Workspace` now carries a first-class `WorkspacePolicySource`, derived from current registered-project metadata when available and `{ kind: "legacy" }` for unregistered, legacy, or forgotten-project fallback sessions. Cached active workspaces refresh the current project metadata and policy source on retrieval, so preset updates and project forget operations take effect without restart. No file/write/edit/path/patch/artifact/shell/agent handler was wired in this unit.

Changed modules:

- `src/projects/project-registry.ts`
- `src/workspaces.ts`
- `src/projects/project-registry.test.ts`
- `src/projects/workspace-association.test.ts`
- `docs/control-center/08_IMPLEMENTATION_PLAN.md`
- `docs/control-center/09_PROJECT_STATE.md`
- `docs/control-center/HANDOFF.md`

Automated evidence:

- `npx tsx src/projects/project-registry.test.ts` passed.
- `npx tsx src/projects/workspace-association.test.ts` passed.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run build` passed with the existing Vite chunk-size warning only.
- `git diff --check` passed with Windows line-ending warnings only.
- Independent review found one valid S2 stale active-workspace preset issue. It was fixed; focused re-review reported zero S0-S2 findings.

Known residual risks:

- Runtime side-effect handlers still do not enforce the policy contract; this remains intentionally deferred to the next GOAL_04 Micro Work Units.
- Canonical path authorization and design-documentation scope checks are still unwired.

MWU-04.03 completed: `write` and `edit` now preauthorize the current workspace operation through the centralized project-policy contract, resolve one canonical mutation destination through `WorkspaceRegistry`, authorize the canonical workspace-relative path, and pass that exact destination to the existing Pi file tool before mutation. Registered `inspect` denies both operations. Registered `design` allows only `docs/**`, root-level Markdown/MDX, and `.devspace/**`; it rejects path escape, `.env*`, Git internals, credential/private-key-like names, and canonical paths reached through workspace-internal or outside-workspace symlinks. Registered `develop` retains workspace writes, and unregistered legacy workspaces retain existing behavior. Registered destination-resolution failures use the same sanitized operation/project/preset/dashboard denial shape. Failed operations were proven not to change the filesystem.

Changed modules:

- `src/projects/project-policy.ts`
- `src/projects/project-policy.test.ts`
- `src/projects/project-file-policy.test.ts`
- `src/workspaces.ts`
- `src/server.ts`
- `package.json`
- `docs/control-center/08_IMPLEMENTATION_PLAN.md`
- `docs/control-center/09_PROJECT_STATE.md`
- `docs/control-center/HANDOFF.md`

Automated evidence:

- `npx tsx src/projects/project-policy.test.ts` passed.
- `npx tsx src/projects/project-file-policy.test.ts` passed.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run build` passed with the existing Vite chunk-size warning only.
- `git diff --check` passed with Windows line-ending warnings only.
- Focused MCP integration tests prove allowed and denied write/edit behavior for inspect, design, develop, and legacy workspaces; rejected writes/edits, path escapes, credential-like destinations, Git/.env targets, and symlink bypass attempts leave the filesystem unchanged.
- Independent review found two valid S2 gaps: tokenized credential names were underblocked and registered path-resolution failures bypassed the centralized sanitized denial. Both were fixed; focused re-review reported zero unresolved S0-S2 findings.

Known residual risks:

- Patch, artifact, shell/process, and local-agent enforcement remain intentionally unwired for their later GOAL_04 Micro Work Units.
- Mutation authorization is pre-side-effect and canonical-path based, but it does not attempt a new filesystem transaction/handle ownership abstraction; existing local filesystem race assumptions remain unchanged.

MWU-04.04 completed: `apply_patch` now preauthorizes the registered operation before parsing, resolves every unique source and destination path—including move targets—through `WorkspaceRegistry.resolveMutationPath`, authorizes each canonical workspace-relative path through the shared design-documentation predicate, and gives `applyPatch` the exact authorized canonical destinations. `applyPatch` completes this entire path-resolution preflight before reading/staging patch content or beginning any filesystem mutation, then reuses only the preflight destinations. Registered `inspect` denies patch, registered `design` permits only canonical documentation paths, registered `develop` permits workspace paths, and unregistered legacy patch behavior remains compatible. Mixed-action, move-source, move-destination, path escape, `.env*`, Git-internal, credential-like, workspace-internal symlink, and outside-workspace symlink denials were proven to leave every file unchanged.

Changed modules:

- `src/apply-patch.ts`
- `src/apply-patch.test.ts`
- `src/projects/project-policy.ts`
- `src/projects/project-patch-policy.test.ts`
- `src/server.ts`
- `package.json`
- `docs/control-center/08_IMPLEMENTATION_PLAN.md`
- `docs/control-center/09_PROJECT_STATE.md`
- `docs/control-center/HANDOFF.md`

Automated evidence:

- `npx tsx src/apply-patch.test.ts` passed.
- `npx tsx src/projects/project-patch-policy.test.ts` passed.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run build` passed with the existing Vite chunk-size warning only.
- `git diff --check` passed with Windows line-ending warnings only.
- Focused tests prove every patch path is resolved before staging, denied later actions cannot partially apply earlier actions, both sides of moves are authorized, registered denials are sanitized/actionable, and legacy patches remain compatible.
- Independent review reported zero unresolved S0-S2 findings.

Known residual risks:

- Artifact destination, shell/process, and local-agent enforcement remain intentionally unwired for later GOAL_04 Micro Work Units.
- Existing local filesystem race assumptions remain unchanged; the unit reuses canonical owners and does not introduce a new file-handle or transaction subsystem.

MWU-04.05 completed: `download_artifact` now routes `artifact_write` through `WorkspaceRegistry.resolveAuthorizedMutationPath` before adapter recognition/open, parent creation, partial creation, or publication, then passes the canonical relative destination to the existing descriptor-anchored writer. Registered `inspect` denies artifacts, registered `design` uses the same canonical design-documentation predicate as write/edit/patch, registered `develop` retains workspace destinations, and legacy workspaces retain compatibility. Policy-denied artifact logs keep only `workspaceId` from tool input plus generic event fields; no path, file shape, hostname, native value, or file-derived data is logged. Both normal `bash` and Codex `exec_command` route through one `runAuthorizedWorkspaceProcess` guard that authorizes `shell` before working-directory resolution and before invoking the process-start callback. Registered `inspect` and `design` deny shell without command classification, while registered `develop` and legacy workspaces remain allowed.

Changed modules:

- `src/projects/project-policy.ts`
- `src/workspaces.ts`
- `src/artifact-tools.ts`
- `src/artifact-download.test.ts`
- `src/server.ts`
- `src/projects/project-artifact-shell-policy.test.ts`
- `package.json`
- `docs/control-center/08_IMPLEMENTATION_PLAN.md`
- `docs/control-center/09_PROJECT_STATE.md`
- `docs/control-center/HANDOFF.md`

Automated evidence:

- `npx tsx src/artifact-download.test.ts` passed.
- `npx tsx src/projects/project-artifact-shell-policy.test.ts` passed.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run build` passed with the existing Vite chunk-size warning only.
- `git diff --check` passed with Windows line-ending warnings only.
- Focused tests prove policy-denied artifact calls perform zero adapter recognition/open calls and create no destination, sensitive artifact denial logs contain only `workspaceId`, denied normal-bash callbacks are invoked zero times and create no marker, denied Codex process starts remain zero, shell authorization precedes invalid working-directory resolution, and develop/legacy behavior remains allowed.
- Independent review found two valid S2 gaps: file-derived artifact denial log fields remained and normal bash lacked a direct zero-start callback proof. Both were fixed; focused re-review reported zero unresolved S0-S2 findings.

Known residual risks:

- Local-agent authorization integration and final GOAL_04 matrix/security/compatibility closure remain intentionally deferred.
- `write_stdin` continues to operate on an already-started process and was not expanded into this process-start Micro Work Unit.
- Artifact publication remains owned by the existing Linux-only descriptor-anchored implementation; Windows verification proves authorization ordering and platform fallback, while existing Linux tests cover successful publication.

MWU-04.06 completed: existing local-agent CLI new-run, continuation, and hidden `__worker` execution paths now pass through `runAuthorizedLocalAgentAction` before prompt-file creation, local-agent store create/update, worker spawn, status mutation, prompt read, or provider execution. The helper maps the active `LocalAgentWriteMode` through `operationForDelegateMode`, resolves current registered policy from a persisted workspace session when present, resolves direct registered checkout/subdirectory CLI use through `ProjectRegistry.findByPath`, and recovers managed-worktree policy by canonical workspace-root session lookup when `DEVSPACE_WORKSPACE_ID` is absent. Registered `inspect` and `design` deny the current write-capable CLI mode, registered `develop` permits it, registered full access remains denied, read-only delegation remains allowed, project preset changes take effect immediately, forgotten projects fall back to legacy compatibility, and unregistered paths retain existing behavior. Root mismatches and unknown workspace IDs fail before action execution.

Changed modules:

- `src/local-agent-policy.ts`
- `src/local-agent-policy.test.ts`
- `src/cli.ts`
- `src/cli.test.ts`
- `src/workspace-store.ts`
- `package.json`
- `docs/control-center/08_IMPLEMENTATION_PLAN.md`
- `docs/control-center/09_PROJECT_STATE.md`
- `docs/control-center/HANDOFF.md`

Automated evidence:

- `npx tsx src/local-agent-policy.test.ts` passed.
- `npx tsx src/cli.test.ts` passed.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run build` passed with the existing Vite chunk-size warning only.
- `git diff --check` passed with Windows line-ending warnings only.
- Focused tests prove registered checkout and managed-worktree direct CLI invocation cannot bypass policy without a workspace ID, Windows case variants resolve the same persisted worktree, denied new runs create no record, denied continuations do not mutate existing records, direct hidden-worker invocation does not update status or invoke a provider, live preset changes are authoritative, project forget preserves legacy compatibility, and root mismatch/unknown workspace contexts fail before action callbacks.
- Independent review initially reported one S1 type-narrowing issue from an earlier diff; it was fixed. Focused re-review of the current implementation reported zero unresolved S0-S2 findings.

MWU-04.07 completed: the full GOAL_04 contract was reconciled against AC-04.1 through AC-04.10 and FR-POL-001 through FR-POL-011. Read, grep, glob, and ls now explicitly consult the centralized guard, matching the documented handler contract while preserving read/search/list behavior for inspect, design, develop, and legacy workspaces. The public MCP catalog is proven not to expose project registration, preset mutation, or forget operations and no MCP input schema accepts `permissionPreset`. `npm run test:policy` now runs the complete matrix, workspace/direct-open/worktree/restoration, file/edit, patch, artifact, shell/process, local-agent, MCP boundary, and dashboard preset compatibility proof as one durable closure suite.

The cumulative independent review across `b0ac429..HEAD` plus the closure diff found one valid S2: on POSIX, a literal backslash in a root filename such as `docs\\evil.ts` was incorrectly translated into a design-scope separator. The shared design predicate now rejects any canonical relative path containing a backslash. The exact POSIX reproduction and all four path-bearing operations (`write`, `edit`, `patch`, `artifact_write`) are covered by sanitized denial tests. Focused re-review reported zero unresolved S0-S2 findings and confirmed GOAL_04 may be marked DONE.

Acceptance closure:

- AC-04.1 / FR-POL-001–011: exhaustive typed matrix, complete handler wiring, local-only preset mutation, safe shell semantics, and legacy compatibility proved.
- AC-04.2: registered checkout/subdirectory direct `open_workspace` and direct CLI paths cannot bypass policy.
- AC-04.3: managed worktrees and restored sessions inherit current source-project policy, including Windows case variants and live preset changes.
- AC-04.4: every patch source/destination, including move targets, is authorized before staging or mutation; denied patches leave all files unchanged.
- AC-04.5: artifact destinations use the same canonical path authorization before adapter or filesystem side effects.
- AC-04.6: documented design paths are allowed; source, secret, Git, environment, key, credential, traversal, symlink, and deceptive separator paths are denied.
- AC-04.7: normal bash and Codex exec calls are denied before working-directory resolution and process start for inspect/design.
- AC-04.8: unregistered legacy file, patch, artifact, shell, and delegation behavior remains explicit and compatible.
- AC-04.9: operation/project/preset/dashboard denials are actionable and omit requested paths, content, commands, and file-derived values where required.
- AC-04.10: `npm run test:policy`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check` passed.

Changed modules in MWU-04.07:

- `src/projects/project-policy.ts`
- `src/projects/project-policy.test.ts`
- `src/server.ts`
- `src/projects/project-file-policy.test.ts`
- `src/projects/project-mcp-server.test.ts`
- `package.json`
- `docs/control-center/08_IMPLEMENTATION_PLAN.md`
- `docs/control-center/09_PROJECT_STATE.md`
- `docs/control-center/HANDOFF.md`

Known residual risks:

- GOAL_05 still owns extraction of a reusable LocalAgentService, structured MCP delegation tools, prompt cleanup, cards, and real-Codex acceptance.
- Existing local filesystem race assumptions and the Linux-only descriptor-anchored artifact publication owner are unchanged; GOAL_04 added authorization rather than a second transaction/runtime owner.
- `write_stdin` remains interaction with an already-started process; GOAL_04 requires authorization before process start and intentionally preserves poll/interrupt capability afterward.

Next eligible goal: GOAL_05 Structured Codex Handoff. Do not begin GOAL_05 implementation in this closure unit.

## GOAL_05 progress evidence

MWU-05.01 completed: `src/local-agent-service.ts` is now the single owner for existing local-agent start/resume dispatch, workspace-scoped list/status polling, and hidden-worker provider execution. It reuses the existing `LocalAgentStore`, GOAL_04 local-agent policy guard, profile loader, provider availability check, provider adapters, provider session IDs, prompt-file mechanism, and detached CLI worker. `src/cli.ts` now parses commands and formats terminal output over this service rather than owning orchestration.

The service boundary is dependency-injected for focused tests without adding a dependency, store, daemon, worker type, or alternate runtime. Focused fake-owner tests prove profile resolution, model/thinking overrides, start and resume transitions, provider-session reuse, profile prompt composition, status/list behavior, provider-unavailable failure before prompt/store side effects, and policy denial before provider/prompt/store side effects. Existing CLI policy tests prove registered inspect denials still occur before new record creation, continuation mutation, or hidden-worker status/provider work.

Verification:

- `npx tsx src/local-agent-service.test.ts` passed.
- `npx tsx src/cli.test.ts` passed.
- `npx tsx src/local-agent-policy.test.ts` passed.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run build` passed with only the existing Vite chunk-size warning.
- `npm run test:policy` passed.
- `git diff --check` passed with Windows line-ending warnings only.

Changed modules:

- `src/local-agent-service.ts`
- `src/local-agent-service.test.ts`
- `src/cli.ts`
- `package.json`
- `docs/control-center/08_IMPLEMENTATION_PLAN.md`
- `docs/control-center/09_PROJECT_STATE.md`
- `docs/control-center/HANDOFF.md`

GOAL_05 closure completed:

- `LocalAgentService` is the single orchestration owner consumed by both CLI and MCP.
- A typed task envelope renders deterministically and rejects secret-like or pasted transcript content before prompt, state, worker, or provider side effects.
- `delegate_task`, `get_agent_status`, `list_agents`, and `continue_agent` are registered only when subagents are enabled. MCP delegation accepts profiles/providers only; continuation is explicit and preserves the existing provider session ID.
- Current project policy, workspace scope, profile/provider identity, and provider availability are checked before mutation. Agent DTOs omit provider session IDs, list output omits response/error bodies, and cards describe provider output as verification pending.
- Prompt ownership transfers only after an IPC worker-ready acknowledgement. Store, spawn, early-exit, timeout, policy, provider, and worker failures retain an actionable session error where possible and clean DevSpace-owned temp prompt directories.
- A real Codex agent completed one focused regression-test task, the parent independently inspected its one-file diff and reran the test, and a read-only continuation reused the exact same provider session ID without additional file changes.
- Independent A2 review found four valid security/policy/cleanup defects. Fixes were independently re-reviewed twice; all findings were resolved with no directly introduced S0-S2 regressions.

Final verification:

- focused local-agent handoff/service/MCP/server/CLI and workspace-handoff tests passed,
- `npm run typecheck` passed,
- `npm test` passed,
- `npm run build` passed with only the existing Vite chunk-size warning,
- `npm run test:policy` passed,
- `git diff --check` passed with Windows line-ending warnings only.

GOAL_05 implementation checkpoints are `655b479`, `f25cf25`, `ee9c646`, and `c4821ab`. GOAL_06 is now the first eligible non-DONE goal; no GOAL_06 runtime work was started in this closure.

## GOAL_06 progress evidence

MWU-06.01 completed the contract reconciliation without changing runtime
behavior:

- `src/operations/operation-contracts.ts` defines the final provider-neutral
  run, state, assurance, evidence, cursor, detail, and 21-event payload
  contracts as a discriminated TypeScript union.
- The contract accepts only safe normalized fields. It does not import provider
  SDK event types and cannot carry prompt, hidden reasoning, environment, or
  arbitrary unknown provider fields.
- Current `ProcessSessionManager`, `LocalAgentService`, `LocalAgentStore`, admin
  APIs, migration v5, and the installed Codex/Claude/OpenCode/Pi/ACP event
  surfaces were reconciled with `11/12/13`.
- ADR-019 records the canonical ownership seams, migration v6 tables and
  transaction boundary, retention accounting, restart reconciliation, local
  agent stop limitation, rejected alternatives, rollback, and complexity
  receipt.
- The compile/runtime fixture proves all 21 event names are covered and that an
  agent result is represented as `completed + result_available`, not verified.

Verification:

- `npx tsx src/operations/operation-contracts.test.ts` passed with all 21 event
  types covered.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run build` passed with only the existing Vite chunk-size warning.
- `git diff --check` passed with Windows line-ending warnings only.

MWU-06.02 completed the operation persistence foundation:

- append-only migration v6 and matching Drizzle declarations add
  `operation_runs`, `operation_events`, and `operation_evidence` to the existing
  SQLite owner,
- `OperationStore` provides generated canonical run IDs, non-unique
  canonical-owner source references, strict transactional per-run sequence,
  SQLite AUTOINCREMENT global cursors, independent evidence, payload/count byte
  accounting, bounded completed/detail retention, and restart lookup,
- individual oversize payloads become a safe persisted warning marker; retained
  history gaps remain explicit through `historyTruncated`,
- the existing sensitive-content boundary covers persisted operation text,
  payload JSON, and identifiers,
- no event bus, instrumentation, route, stop mutation, dashboard runtime, new
  dependency, database, daemon, queue, or cache was added.

Focused fresh/upgrade/rollback migration and store tests passed, followed by
`npm run typecheck`, full `npm test`, production `npm run build`, and
`git diff --check`. Independent review found three valid source-identity,
terminal-retention, and identifier-secret defects; all were fixed, and scoped
round-2 review reported zero findings.

MWU-06.03 completed the provider-neutral projection control boundary:

- `OperationEventBus` publishes typed stored events synchronously, isolates
  subscribers, rejects/absorbs returned thenables, supports idempotent
  unsubscribe, and reports delivery failures without throwing into the
  canonical operation,
- `OperationRunService` owns run creation, legal run-state and independent
  assurance-stage transitions, activity projection, typed canonical-owner
  references, fail-closed capability lookup, and restart reconciliation,
- only the verification-evidence path may enter `verifying`; `verified`
  additionally requires passed persisted evidence with no recorded incomplete
  or failed item, plus passed `goal_state` evidence for Goal-linked runs,
- owner-reported results remain distinct from verification,
- stop capability is derived, never inferred: only an available non-terminal
  process session can currently report stoppable, while MCP/local-agent and
  unknown-owner runs fail closed and reconciliation clears stale persisted stop
  capability,
- no canonical owner instrumentation, route, stop mutation, UI runtime,
  dependency, queue, worker, daemon, provider registry, or second execution
  lifecycle was added. ADR-020 records the boundary and complexity receipt.

Focused transition, assurance, capability, reconciliation, persistence-failure,
and subscriber-isolation proofs passed, followed by typecheck, full test,
production build, and diff validation. Independent A2 review and its final
closed-basis disposition are recorded in Project State.

MWU-06.04 completed bounded canonical process-session projection:

- `ProcessSessionManager` remains the sole process-lifecycle owner and calls a
  synchronous observation port only after spawn succeeds,
- one focused adapter creates `process_session` runs and projects start,
  bounded/redacted output, exit, and stop-state transitions through the
  existing run service/store,
- command text is never persisted; one bounded per-session redaction window
  detects secrets split across output chunks or stdout/stderr, and UTF-8 output
  events are capped before persistence,
- live capability lookup resolves only the canonical in-memory session, while
  terminal state follows observed exit code/signal plus recorded stop intent,
- projection/store failures cannot change canonical process success.

Focused process projector/session/platform tests, typecheck, full tests,
production build, and diff validation passed. Independent A2 review found two
valid cross-stream redaction and terminal-outcome defects; simplest-valid fixes
were applied and scoped round-2 review confirmed both resolved with no directly
introduced S0/S1 defects. ADR-021 records the ownership and complexity receipt.

Exact next unit: MWU-06.05 only. Instrument real direct MCP tool invocations as
identifiable `mcp_tool` runs with known workspace/project/source linkage and
safe file-change/failure events while preserving public tool schemas and
existing tool owners. Do not instrument local-agent owners, add routes/SSE/stop
mutation/UI, or start GOAL_07 in that unit.

MWU-06.05 completed direct MCP tool projection:

- one decorator at the actual `McpServer.registerTool` boundary projects current
  callback tools without changing their registrations, schemas, callback count,
  results, or exceptions,
- runs use safe static tool identity, generated operation run identity,
  canonical workspace/project lookup, and successful open-result linkage;
  connection-scoped MCP request IDs are deliberately not persisted,
- existing write/edit/apply-patch/artifact owners attach non-enumerable internal
  metadata only after successful mutation, producing safe `file.changed`
  events without persisting content,
- generic lifecycle and failure events omit arguments, results, exception text,
  commands, prompts, and environment values,
- projection/store failures, frozen results, and unexpected projection access
  failures cannot replace a canonical tool result,
- no semantic multi-tool correlation, local-agent instrumentation, route, SSE,
  stop mutation, UI, dependency, or second execution owner was added. ADR-022
  records the ownership and complexity receipt.

Focused real MCP client/server proofs, project file-policy integration,
typecheck, full tests, production build, and diff validation passed. The A2
independent-review disposition is recorded in Project State.

Exact next unit: MWU-06.06 only. Instrument the existing `LocalAgentService` and
provider-adapter event paths with safe status/message/result projection;
preserve provider session and final response behavior, map final results to
`result_available` rather than `verified`, and do not dump unknown provider
fields. Do not add operation routes/SSE/stop/UI or start GOAL_07 in that unit.

MWU-06.06 completed local-agent streamed projection:

- `LocalAgentService` remains the lifecycle/store owner and calls one optional
  exception-isolated observation port only after canonical record transitions,
- provider adapters expose only known assistant text; reasoning, tool payloads,
  raw events, unknown fields, prompts, errors, and environment values are not
  projected,
- one focused projector links each turn to the stable canonical agent ID,
  creates a new run for resume after a terminal turn, and deterministically
  continues that run across the detached worker SQLite boundary,
- assistant chunks share one bounded redaction window, final response is
  independently bounded/redacted, failures stay generic, and final output
  produces `completed + result_available`, never `verified`,
- provider session IDs, final response persistence, adapter return values,
  worker behavior, and public MCP/CLI contracts remain unchanged,
- no new dependency/store/queue/daemon, cancellation owner, route, SSE, stop
  mutation, or UI was added. ADR-023 records the boundary and complexity
  receipt.

Focused projector/store/service/runtime/adapter/CLI/MCP-server tests, typecheck,
full tests, policy closure, production build, and diff validation passed.
Independent A2 review found one valid same-timestamp resume-selection defect;
the deterministic insertion-order tie-breaker was added and scoped round-2
review reported no findings.

Exact next unit: MWU-06.07 only. Add authenticated loopback-only operation
snapshot/detail/event reads and cursor-based SSE reconnect over the accepted
store/event bus, including bounded-history and slow-consumer behavior. Prove
route separation from the public MCP listener. Do not add stop mutation or UI
work in that unit.

MWU-06.07 completed operation snapshot and SSE read paths:

- authenticated dashboard-session reads expose bounded run snapshots, run
  detail/evidence, and per-run events with explicit snapshot-rehydration state,
- one global monotonic cursor drives SSE catch-up; `Last-Event-ID` takes
  precedence on automatic reconnect and snapshot cursors are captured before
  their corresponding reads so concurrent worker events replay rather than
  disappear,
- the existing in-process event bus triggers SQLite cursor catch-up instead of
  bypassing it, preserving order when detached workers and the server write
  concurrently; a bounded poll discovers detached-worker writes,
- expired/gapped or oversized catch-up returns a recoverable reset cursor,
  backpressured clients disconnect without queued growth, concurrent streams are
  capped, and admin shutdown closes every stream/timer,
- routes exist only in the authenticated loopback admin app; the public MCP app
  contains no operation REST/SSE route,
- no stop mutation, UI runtime, dependency, store, queue, daemon, or second
  operation owner was added. ADR-024 records the read boundary and complexity
  receipt.

Focused auth/read/SSE/history/backpressure/cross-process-order tests, typecheck,
full tests, production build, and diff validation passed. Independent A2 review
found three valid fixture, snapshot-boundary, and reconnect-precedence defects;
all received simplest-valid fixes and scoped round-2 review reported no new
S0/S1 finding.

Exact next unit: MWU-06.08 only. Add the authenticated CSRF-protected
capability-based stop route through canonical owners, prove observed stop
outcomes and public-route separation, and state clearly that stop does not
rollback changes. Do not begin UI shell work or GOAL_07 in that unit.

MWU-06.08 completed capability-based stop:

- the authenticated loopback admin app accepts an empty-object-only,
  CSRF-protected stop request and rejects caller-selected process/provider
  targets,
- only live canonical MCP process-session references can advertise and execute
  stop; local-agent and noncanonical references remain non-stoppable,
- `ProcessSessionManager` remains the sole signal owner, persists `stopping`
  before signaling, refuses to signal if projection fails, and restores
  `running` if signal dispatch throws,
- terminal state and completion audit follow the observed process exit; safe
  run correlation covers requested, completed, and failed audit records,
- response copy explicitly says stop does not revert repository changes, and
  the public MCP listener exposes no operation stop route,
- no UI, new dependency, service, store, worker, queue, or second execution
  owner was added. ADR-025 records the stop boundary and failure recovery.

Focused stop/projector/admin-route tests, typecheck, full tests, production
build, and diff validation passed. Independent A2 review found one canonical
reference S1 and two state/audit S2 defects; all received simplest-valid fixes.

MWU-06.09 completed the shared UI shell and tokens:

- the existing React/Vite entry now owns one Projects, Runs, Agents, and System
  fragment-navigation shell with stable identity, active destination, page
  header, dashboard/MCP status, and screen-action area,
- system theme is the default and explicit light/dark modes use the accepted
  semantic CSS roles without component-specific status colors or new
  persistence,
- shared control, panel/table, inspector, notice, tab, focus, reduced-motion,
  desktop, and compact-layout primitives come from the accepted visual system,
- existing project scan/add/update/forget, folder picker, project selection,
  local-agent list, admin API, and auth recovery remain in the Projects
  destination without changing their canonical owners,
- later destinations expose only the navigation/shell migration boundary; no
  screen data implementation, router, component framework, dependency, store,
  service, or worker was added.

Focused route/theme/token tests, typecheck, full tests, production build, and
diff validation passed. Browser verification against the production bundle
directly observed the accepted 224px desktop navigation and corrected 56px
header, fragment selection, explicit light/dark roles, 720px compact layout,
40px compact input target, and no horizontal overflow.

MWU-06.10 is DONE:

- registered projects now render in the accepted searchable/filterable table
  with deterministic pin/activity/availability/last-opened ordering,
- a 336px desktop inspector becomes a compact drawer and exposes identity,
  defaults, repository state, active/recent activity, copy, edit, and forget,
- scan/import/manual/folder-picker add, edit, forget, auth recovery, and
  existing project APIs remain owned by their current paths,
- existing Git-status, operation-run, and local-agent reads supply activity
  without adding a store, service, router, dependency, or execution owner,
- browser acceptance at 1440px and 720px directly observed the accepted
  table/inspector and add/edit drawer hierarchy with no horizontal overflow,
- the observed focus defects were fixed: Add/Edit/Inspector restore their
  opening control, and the compact inspector is an `aria-modal` dialog whose
  focus cycles within the drawer,
- focused Projects/API and shell tests, typecheck, full tests, production build,
  and diff validation passed.

MWU-06.11 is DONE:

- the Runs destination uses the existing bounded operation snapshot, detail,
  event, SSE, evidence, and capability-based stop APIs without creating a
  second run or execution owner,
- active, blocked/stopping, result/verification, failed, and recent-completed
  groups remain explicitly distinguishable; project, source, kind, state,
  assurance, and time filters preserve their state across run selection,
- the selected run forms one elevated operational stage with truthful current
  action, state/assurance, source/workspace/phase/duration, Activity sequence,
  safe retained details, reconnect/snapshot/truncation markers, follow-live
  behavior, and stop copy,
- consecutive process output is grouped only in the Activity projection while
  retaining count and sequence range; changed files and independent evidence
  remain separate supporting facts,
- ADR-026 and the visual-system update record the accepted operational-cockpit
  direction and reject literal marketing/spatial-desktop copies, fake activity,
  and new visual/runtime owners,
- focused dashboard tests, typecheck, full tests, production build, diff
  validation, and production browser acceptance at 1440px/720px passed.

MWU-06.14 is DONE. Agents now projects canonical provider availability,
configured profiles, persisted sessions, linked operation runs, result versus
verification state, stale-after-restart state, and safe bounded final previews.
System reports service, loopback security boundary, allowed roots, provider,
SQLite schema, and operation-retention diagnostics through authenticated
admin reads, plus bounded copyable diagnostics and existing troubleshooting
guidance. ADR-033 records the thin-projection decision and rejection of second
configuration/diagnostics owners. Focused and full tests, typecheck, production
build, diff validation, route/security checks, and production browser
acceptance at 1440px/720px passed. Exact next unit: MWU-06.15 —
Accessibility, responsive, and visual convergence. Do not begin MWU-06.16 or
GOAL_07 in the same work unit. That unit is now closed by the evidence below.

MWU-06.15 is DONE. All four existing screens passed production-browser
acceptance at 1280px and 720px with no page overflow or undersized interactive
targets. Compact Projects and Agents inspectors are in-viewport modal dialogs
with focus trap, Escape close, and opener restoration; Projects, Agents, and
Runs expose their accepted `/` search path; theme ownership is in System.
Light/dark semantic tokens close the selected WCAG AA contrast obligations,
decorative gradient shimmer is gone, and reduced-motion CSS remains present.
Focused/full tests, typecheck, production build, diff validation, screenshots,
and zero-console-warning checks passed. Exact next unit: MWU-06.16 — real
operation acceptance and Goal closure. Do not begin GOAL_07 in the same work
unit.

MWU-06.16 began with real-scenario reconstruction that exposed one blocking
runtime gap: local-agent runs reached `result_available`, but no production
adapter recorded independently observed command evidence or advanced assurance
to `verified`. ADR-035 accepts the smallest complete repair: an optional
same-workspace agent/type association on `exec_command`, canonical process-exit
ownership, and one focused evidence projector over the existing operation
store/service. The caller cannot submit pass/fail, ordinary command behavior is
unchanged, and no route, store, service, migration, worker, dependency, or
second executor is added. Focused and standard verification passed before the
real acceptance and proof mapping recorded in the completion entry below.

MWU-06.16 is DONE and GOAL_06 is DONE. The missing result-to-evidence runtime
connection is closed by ADR-035 without a second executor, store, service,
route, or outcome self-attestation. Final real acceptance observed direct MCP
open/read/apply-patch; a 30-line managed process across dashboard reconnect with
30 unique ordered lines; a Windows process-tree capability stop whose observed
child PID ended; and a real Codex agent at `Result available` before an
independent attached typecheck exit 0 moved the same run to `Verified`.
Interrupted or failed evidence projection returns to retryable
`verification_pending`. Final typecheck, full tests, production build, diff
validation, and A2 independent R2 pass. GOAL_07 then began with the separate
MWU-07.01 recorded below and is now complete.

## GOAL_07 progress evidence

MWU-07.01 completed the first final-compatibility proof without changing
runtime behavior:

- the real in-process MCP SDK client opens an unregistered allowed directory
  through the unchanged `open_workspace` tool,
- the returned workspace has checkout mode and no registered-project metadata,
- the same plain MCP client uses the returned `workspaceId` to call the
  workspace-scoped `read` tool,
- both text content and structured content remain useful without consuming MCP
  Apps metadata,
- the legacy tools remain present beside `list_projects` and `open_project` in
  the actual registered tool catalog.

The focused `src/projects/project-mcp-server.test.ts` proof, `npm run
typecheck`, and the full `npm test` suite passed. No dependency, service, store,
route, schema, configuration, runtime owner, or production bundle changed.
AC-07.12 is partially closed; CLI, MCP Apps card, and remaining legacy
file/change-review compatibility still require final convergence evidence.

MWU-07.02 completed the public-MCP versus loopback-admin boundary audit and
closed one reproduced exposure defect:

- a real HTTP matrix now proves all current 20 admin/operation method-path
  cells are absent from the public listener,
- the audit found that the shared Vite output exposed `dashboard.html` through
  the public `/mcp-app-assets` static mount,
- the public listener now decodes and normalizes requested asset paths and
  allows only `workspace-app.html` and `assets/`,
- exact, duplicate-separator, encoded-name/dot, traversal-style, and
  case-variant dashboard paths return 404,
- built output retains admin routes only in `dist/admin` while the public
  server bundle has no admin route ownership markers,
- the MCP App HTML and manifest-selected JavaScript/CSS remain available with
  CORS, and asset OPTIONS remains 204.

Focused verification, typecheck, the full test suite, production build, built
route-ownership scan, and independent review
`IR-MWU07.02-R3-20260730` passed with F001 resolved and zero findings. No
dependency, service, store, schema, configuration surface, or runtime owner was
added. AC-07.4 is closed for source and isolated built-runtime proof.

MWU-07.03 completed the managed-runtime activation and fixed-origin proof after
the approved machine restart. Reconciliation found the restarted global
runtime already byte-matched the verified local server, CLI, dashboard HTML,
and MCP App HTML, so no duplicate installation or second restart was applied.
The live fixed origin returned 404 for the dashboard route, exact static entry,
duplicate separator, encoded name/dot, traversal-style, and case variants.
Public health, MCP, MCP App HTML/manifest-selected JavaScript/CSS and OPTIONS,
the loopback dashboard, both listeners, and the five-minute recovery task
remained operational. Independent review `IR-MWU07.03-R1-20260730` rechecked
the six-document scope, bundle hashes, live boundary, listeners, recovery task,
and isolated full method matrix and reported zero findings. AC-07.4 is
therefore closed on the managed fixed origin.

MWU-07.04 completed the existing-database migration and managed
restart/reconciliation proof. One isolated test creates the accepted v3
workspace/OAuth/local-agent schema, starts the real server lifecycle to apply
v4-v6, then persists a registered project, associated workspace, structured
handoff, and running canonical process operation through the existing stores.
The next process start preserves all state and reconciles the missing process
owner to `failed` exactly once. A further restart leaves the full selected
snapshot, six migration rows, and two operation events structurally
unchanged. Test-owned child readiness, health, shutdown, forced termination,
and temporary-state cleanup are bounded; no live DevSpace process or user
database is touched. Focused verification, typecheck, the full test suite,
production build, and independent A2 review converged with no unresolved
adjudicated BLOCK.

MWU-07.05 closed AC-07.12 without changing production behavior. The CLI test
now locks the existing `serve`, `init`, `doctor`, `config`, and `agents`
commands alongside `dashboard`. The real in-memory MCP SDK proof resolves the
MCP Apps HTML resource and project-card metadata, then uses an unregistered Git
workspace through `open_workspace`, `read`, `edit`, and `write`; both mutation
cards carry their diffs and advance the existing review checkpoint.

MWU-07.06 closes AC-07.1 and AC-07.16. The requirements evidence matrix lists
all 124 requirement IDs and points each group to its canonical implementation
and proof, without treating still-pending manual scenarios as automated passes.
Existing user-documentation owners now cover upgrade/rollback, permission
presets, live-operation verification semantics, and old-package conflicts.

MWU-07.07 closes AC-07.6. A signed-in real ChatGPT Work conversation used
`DevSpace Stable` to list projects, open `devspace` by slug in checkout/develop
mode without an absolute-path prompt, report root/policy/mode/workspace ID, and
reuse that workspace ID for a `package.json` read with no edit, shell, or
agent-delegation side effect.

MWU-07.08 closes AC-07.7. A signed-in normal Chat conversation used the
refreshed `DevSpace Stable` catalog to open `devspace` and delegate one
read-only source investigation to `codex-implementer`. The delegated agent
was visible through starting, running, idle, and result availability; no second
agent was created. Its final response and an independent Git review agreed
that no tracked file changed and the pre-existing `.tmp/` remained untouched.
`npm run typecheck` passed. Since the exposed `bash` schema had no
agent/verification association fields, the dashboard honestly retained
`Result available`; this does not pre-close the distinct verified-state
scenario.

MWU-07.09 adopts the terminal-dominant Runs candidate after direct user
feedback. The always-visible Evidence checklist duplicated the existing
Evidence tab and reduced the primary live surface, so it was removed without
changing evidence ownership or semantics. The two-column cockpit widens the
stage; process/MCP runs default to terminal; and the dark terminal header
shows `Live output`, retained chunks, and follow state. Focused tests,
typecheck, production build, and managed-dashboard browser observation passed.
A real direct-MCP command visibly changed from `Running bash` to successful
completion. The ChatGPT-exposed `bash` surface returned its 20 lines only when
complete, so no incremental process-output claim is made.

MWU-07.10 closes AC-07.8. The managed runtime was switched to its existing
Codex process tool mode and the `DevSpace Stable` catalog was refreshed without
changing its URL or permissions. In a normal Chat, a process session streamed
`LIVE STREAM 01/30` through `30/30`; after a dashboard reload the terminal held
all 30 unique lines in order and exit code 0. A single read-only
`codex-implementer` was then visible in Agents as
`Running/working` and in its linked run through idle, completion, result
availability, and final agent output. Neither action changed repository files.

MWU-07.11 closes AC-07.11. A real nested process run was stoppable in the
canonical store but its top-level MCP group hid the action. The Runs stage now
selects the live stoppable member of the related-run group while preserving the
existing process manager, stop API, and grouped terminal projection. Focused
tests, typecheck, the full suite, production build, local/public health, and
managed-browser acceptance passed. The accepted Stop terminated PowerShell
a parent PowerShell process, child `PING.EXE`, and child console process;
no member remained, the DevSpace process stayed alive, and the process run
recorded `running -> stopping -> stopped` without failure or rollback claims.

MWU-07.12 closes the result-to-verified semantic transition surface. The
signed-in normal Chat reused the existing agent. A first associated
process exited 1 and returned the run from `verifying` to retryable
`verification_pending`; a fresh process session then ran the real typecheck,
exited 0, and drove the same run to `verified`. Browser and SQLite evidence
agreed on result availability, failed verification, retry, passed evidence,
and final state. The Evidence tab retained only the passed Typecheck and left
all unrun evidence explicit.

MWU-07.13 closes AC-07.13 on a remote clean checkout and packaged-install
surface. The first clean `npm test` reproduced an implicit dependency on
`dist/ui/.vite/manifest.json` before the standard build step. The project MCP
integration test now creates a minimal manifest plus JavaScript/CSS assets only
when no build exists, verifies the real resource callback, and removes only
its own files and empty directories. Production code and the normal build
owner are unchanged.

The clean surface completed `npm ci`, `npm run typecheck`, full `npm test`, and
`npm run build`. `npm pack` produced the package tarball, and a separate empty
consumer installed it successfully. The installed `devspace` CLI reported
version `1.0.4`, help displayed `dpkr helix`, and the packaged Vite manifest,
dashboard title, and 2,141,564-byte icon were present. No dependency, service,
store, schema, route, worker, or configuration owner was added.

MWU-07.14 explicitly adjudicates the high transitive production advisory
`GHSA-mh99-v99m-4gvg`. GitHub and npm identify `brace-expansion@5.0.8` as the
patched release, but both installed `@earendil-works/pi-coding-agent@0.82.1`
and current `0.83.0` publish an inner shrinkwrap that pins `5.0.7`.

Three apparent remediations were rejected with direct evidence. A root
`override` is ignored in an installed dependency. A publishable outer
shrinkwrap still let Pi's inner shrinkwrap install `5.0.7` in an empty
consumer. Manually changing only the root lock made `npm audit` report zero
while clean `npm ci` still installed `5.0.7`; that false-negative lock was
reverted.

The residual is accepted temporarily, not hidden. The vulnerable minimatch
call sites are Pi's package-manager and model-resolver paths. dpkr helix's
default file finder uses Pi's `fd` path, but its local-agent provider also
starts `pi --mode rpc` and can forward an operator-selected model through
`--model`; Pi's RPC startup imports the model resolver and resource/package
loading path. This is reachable, but only after the existing authenticated
local-agent authorization boundary, whose client already has explicit scoped
shell execution inside the approved workspace. The current additional impact
is therefore authenticated process availability, not a new privilege or public
attack boundary. The production audit remains one high finding. Upgrade
immediately when Pi publishes a shrinkwrap containing a patched
brace-expansion maintenance release, or reopen sooner if model/package/glob
patterns can cross the current trusted-operator boundary.

The same unit rewrites the project README around `dpkr helix`, replaces the
old DevSpace-branded hero image with a current live Runs dashboard capture,
and keeps only the npm package, CLI command, MCP identity, and storage paths as
explicit compatibility identifiers.

MWU-07.15 is DONE. Production-browser desktop acceptance covered Projects,
Runs and a live MCP run, Agents, and System in both light and dark. The screens
preserved the accepted state/evidence boundaries and had no body-level
horizontal overflow. Direct entry to an existing MCP run exposed one blocking
default-tab defect; synchronizing the selected-run identity now opens the
terminal while preserving later user-selected tabs across detail/SSE refresh.
The user-selected dark/light dpkr helix images are retained unchanged and
selected by the existing theme owner, and `https://dpkr.dev` is recorded as
the official homepage. Focused tests, typecheck, the final full regression
suite, production build, managed-runtime hash comparison, and direct browser
re-entry passed.

MWU-07.16 is DONE. Production-browser acceptance at 1280px and 720px covered
Projects, Runs/live run, Agents, and System. Projects, Runs, and Agents exposed
their `/` search focus path with the visible 3px focus indicator; Runs arrow
navigation moved both focus and selection across its ARIA tabs. Compact
Projects and Agents inspectors trapped focus, closed on Escape, and restored
their exact opener. All four compact screens had no body-level horizontal
overflow, and the loaded production stylesheet retained the reduced-motion
override. Direct measurement found one blocking exception: linked-run anchors
in the Agents table were only 13px high. The existing CSS owner now gives them
32px desktop and 40px compact targets; production remeasurement passed.
Focused shell tests, typecheck, the full regression suite, production build,
bundle activation through the existing global junction, local health/security
checks, and zero browser console warnings passed.

MWU-07.17 is DONE. The requirements matrix now reflects the completed
production-browser, real Codex, reconnect, verification-transition, and
Windows stop observations without leaving requirement rows manual-pending. The
acceptance plan preserves release-level manual scenarios A, B, D, and E as
open; current fixed ingress, Goal status, Project State, and HANDOFF agree.
README and the existing setup/configuration/security/troubleshooting owners
already cover AC-07.16, so no duplicate user-documentation owner was added.

MWU-07.18 is DONE. Manual scenarios A, B, D, and E now have direct evidence:
the fixed public/local security boundary rejected malicious-origin mutation,
the isolated production dashboard completed three-repository scan/import plus
manual registration/restart/forget without touching files, a real MCP client
proved managed-worktree isolation and inherited source policy, and real MCP
tools enforced inspect/design/develop including delegation-before-side-effect
denial. Typecheck, the full test suite, local/public health, public admin 404,
Cloudflared service state, and scheduled recovery passed. No product runtime,
dependency, schema, route, store, service, configuration, or deployment
changed.

MWU-07.19 is DONE. The user-reported five-minute terminal flash was traced to
the machine-local recovery task launching console-subsystem `powershell.exe`
directly under `InteractiveToken`; `-WindowStyle Hidden` could apply only after
console creation. The task now uses standard `wscript.exe //B //NoLogo` plus a
machine-local wrapper that starts the unchanged PowerShell recovery script
with window style `0` and returns its exit code. Triggers, principal, recovery
logic, and dependencies are unchanged. Two corrected task probes observed zero
new visible or foreground windows, task result `0`, local/public health `200`,
and the same managed PID. No repository runtime, dependency, service, store,
schema, route, or portable installer behavior changed.

MWU-07.20 is DONE. A repo-local `onboard-dpkr-helix` Skill now coordinates the
existing portable installer with user-approved Cloudflare named-tunnel/service
and ChatGPT developer-mode/OAuth handoffs. ADR-037 rejects a second installer,
tunnel owner, credential owner, plugin lifecycle, service, store, dependency,
or daemon. One focused External-only recovery script owns an
ownership-marked limited-current-user task plus two marked helpers, enters
through no-console `wscript.exe`, preserves intentional Stop, and does not
restart healthy local DevSpace for a public-only outage.

Focused and integration PowerShell tests, typecheck, real Skill discovery,
full regression, production build, package contents, security/documentation
checks, and A2 independent review pass. R1's one S2 Action-only ownership
finding was fixed; scoped R2 reported zero remaining S0-S2 candidates. No live
task or external account/tunnel/app/OAuth state changed.

Final GOAL_07 convergence is DONE. All acceptance criteria, release gates,
requirements evidence, residual risks, Goal status, Project State, and HANDOFF
agree without converting the recorded recipient NotRun boundary into a pass.
At that closure point no further GOAL_01-07 implementation unit remained;
GOAL_08 is the later accepted quality extension below.

## GOAL_08 planned work

GOAL_08 was accepted as a new quality extension on 2026-07-31. It does not
reopen GOAL_01 through GOAL_07. Its canonical requirements, data contracts,
failure behavior, complexity receipts, parity suite, and acceptance criteria
are in `goals/GOAL_08_CODEX_PARITY.md`.

Execution order:

```text
MWU-08.01 same-snapshot baseline and model/profile/prompt selection
  -> MWU-08.02 shared repository context and tree fingerprint
  -> MWU-08.03 model-visible review bundle and verification freshness
  -> MWU-08.04 structured Codex completed/needs_input outcomes
  -> MWU-08.05 bounded get_agent_status wait
  -> MWU-08.06 parity, signed-in host, security, regression, and docs convergence
```

No product feature begins before MWU-08.01 records the current baseline. If the
baseline proves a planned feature does not affect mandatory task success,
evidence truth, safety, or a repeated workflow cost, defer that feature rather
than implementing the plan mechanically.

Current MWU-08.01 state on 2026-08-02: the frozen current baseline is recorded
with 36 schema-valid terminal records. Web plus helix passes 8/8 cases and
local Codex passes 4/8 by frozen majority. Candidate comparison, metadata
audit, configuration selection, and review remain.

## GOAL_09 public-release preparation

GOAL_09 was accepted on 2026-07-31 as the user's immediate distribution
priority. It does not change runtime owners or the installed working path and
does not claim GOAL_08 implementation. Its canonical Goal, acceptance, release
boundary, and complexity receipt are in
`goals/GOAL_09_PUBLIC_RELEASE_READINESS.md`.

Execution order:

```text
public/private responsibility boundary
  -> tracked-tree and ignore hygiene
  -> README/security/contribution/attribution convergence
  -> dependency and package-content gate
  -> full verification and independent A2 review
  -> normal private commit/push
  -> DEFER: explicit clean-root and visibility cutover
```

The deferred cutover is not an unfinished local implementation unit. It is a
separate external and partly irreversible publication action owned by
`docs/PUBLIC_RELEASE.md` and requires explicit approval immediately before
execution.

## Global dependency graph

```text
GOAL_01
  |\
  | +--> GOAL_02 -----------------------------+
  +----> GOAL_03 --> GOAL_04 --> GOAL_05 --> GOAL_06 --> GOAL_07 --> GOAL_08
                                                 ^          +----> GOAL_09
                                                 |
                         GOAL_02 ----------------+
```

Strict logical dependency for GOAL_04 includes GOAL_03 because policy metadata must be visible through project-open results. GOAL_05 depends on policy enforcement so delegation cannot ship with a bypass.

## GOAL_01-07 completion checklist

- [x] All seven goals DONE
- [x] Standard verification passes
- [x] Existing legacy workflow acceptance passes
- [x] Dashboard and operation routes inaccessible through public MCP origin
- [x] Registered policy cannot be bypassed
- [x] ChatGPT project selection tested
- [x] Real Codex handoff tested
- [x] Direct MCP, process, and local-agent live views tested
- [x] Result available and verified states remain distinct
- [x] Capability-based stop tested where supported
- [x] Projects, Runs, live run, Agents, and System screen acceptance passes
- [x] Light/dark, keyboard, accessibility, and responsive checks pass
- [x] No secrets, prompts, hidden reasoning, or environment values in repository, logs, state, or operation output
- [x] `09_PROJECT_STATE.md` reflects completed state
- [x] User-facing README/configuration/security/troubleshooting/rollback docs updated

## GOAL_08 completion checklist

- [ ] P01-P08 baseline recorded before feature changes
- [ ] model/profile/prompt candidate accepted or rejected by same-snapshot evidence
- [ ] repository context and fingerprint acceptance passes
- [ ] model-visible review and verification-freshness acceptance passes
- [ ] structured Codex needs-input and same-thread continuation acceptance passes
- [ ] bounded agent wait acceptance passes
- [ ] plain MCP, policy, migration, secret, typecheck, full test, and build gates pass
- [ ] signed-in normal-Chat acceptance passes
- [ ] requirements evidence, decisions, Project State, HANDOFF, and user docs converge

## GOAL_09 completion checklist

- [ ] tracked tree and untracked-file exclusions pass the public-release gate
- [ ] private-only install copy and machine-specific endpoint/path/state are absent
- [ ] source distribution, attribution, security reporting, and contribution boundaries agree
- [ ] accidental npm publication is disabled and package contents exclude internal State/Handoff
- [ ] production audit has zero high/critical findings
- [ ] typecheck, full tests, build, package dry run, and diff validation pass
- [ ] independent A2 review converges with zero adjudicated blockers
- [ ] State and Handoff record `READY_FOR_CUTOVER`
- [ ] normal private commit/push completes without executing public cutover
