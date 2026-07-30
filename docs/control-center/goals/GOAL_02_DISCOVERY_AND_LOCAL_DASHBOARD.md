/goal

# GOAL 02 — Discovery and Local Dashboard

## Goal

Add the local-only administration surface that lets the user discover, register, edit, and forget projects without typing configuration files.

## Dependencies

GOAL_01 must be DONE.

## User-visible outcome

`devspace dashboard` opens a local dashboard. The user can scan approved roots, import repositories, register a manual folder, change project display settings, and forget a registry entry without deleting files.

## Scope

- second loopback-only admin Express listener in the same process
- dashboard authentication/session/CSRF
- Vite dashboard entry
- project-management APIs
- bounded Git repository discovery
- project list/edit/import UI
- CLI `dashboard`
- doctor/init/config changes
- optional Windows native folder picker and fallback
- agent/provider read-only status display
- tests and docs

## Non-scope

- public MCP project list/open tools
- MCP Apps project card
- project operation-policy enforcement
- new delegation tools

## Acceptance criteria

- AC-02.1: Admin listener binds only to `127.0.0.1` and a distinct configured port.
- AC-02.2: Admin routes are not mounted on the public MCP Express app.
- AC-02.3: Bootstrap, session cookie, Origin/Host, and CSRF requirements satisfy NFR-SEC-001 through NFR-SEC-004.
- AC-02.4: Dashboard implements FR-UI-003 through FR-UI-006.
- AC-02.5: Discovery implements FR-DISC-001 through FR-DISC-006.
- AC-02.6: `devspace dashboard`, init defaults, doctor output, and older config compatibility work.
- AC-02.7: Forget removes metadata only; an automated test confirms repository files remain.
- AC-02.8: Dashboard startup failure warns but does not prevent MCP startup.
- AC-02.9: Windows picker is tested through a mocked process adapter; unsupported/cancel fallback works.
- AC-02.10: Existing MCP App manifest/resource build remains intact.
- AC-02.11: Standard verification passes.

## Proof obligations

- local/public route separation test,
- dashboard auth abuse tests,
- bounded discovery tests,
- browser-open URL redaction test,
- multi-entry Vite build,
- manual local dashboard smoke test.

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
