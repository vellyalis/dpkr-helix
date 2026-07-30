# Security and Permissions

## Trust boundaries

### Public MCP boundary

Remote clients reach the existing MCP listener through a public HTTPS tunnel and OAuth approval. This boundary already exposes powerful repository and shell operations.

### Local administration boundary

Project registration, path import, preset mutation, forgetting projects, operation streams, terminal/diff/agent-output views, and stop mutations are local-owner administration. They must not be added to the tunnel-facing MCP API.

### Workspace boundary

A workspace limits DevSpace file tools to a root. Shell access is inherently more powerful than file-tool path checks; presets must not misrepresent this.

### Agent boundary

A local agent can modify the workspace according to its sandbox/write mode. Starting it is an explicit side effect and must be policy-checked and visible.

## Security invariants

1. Project roots are always canonicalized and checked against current allowed roots.
2. Discovery does not widen allowed roots.
3. Remote tools cannot register projects or change presets.
4. Dashboard auth is separate from OAuth auth.
5. Dashboard network bind remains loopback-only.
6. No request-IP-only security decision protects the dashboard.
7. No arbitrary command/script input reaches native picker process creation.
8. Registered policy applies even through legacy `open_workspace`.
9. Patch authorization happens before any mutation.
10. Secrets are denied in design-write scope and never persisted in handoffs/state.
11. Agent delegation is never implicit.
12. Forgetting a project never deletes files.
13. Live Operations never becomes a second tool, process, agent, review, or Project State owner.
14. Run state and assurance stage remain separate; final agent text cannot assert verification.
15. Operation payloads are redacted and bounded before publication or persistence.
16. Hidden reasoning, prompts, chat transcripts, environment values, secrets, and unnecessary file contents are excluded from operation output.
17. Stop is CSRF-protected, capability-based, routed to the canonical owner, and never implies rollback.
18. Dashboard/event/SSE failure does not repeat or restart underlying side effects.

## Dashboard threat model

### Cross-site request to localhost

A malicious webpage may try to call `127.0.0.1`. Mitigations:

- exact Host validation,
- exact Origin validation,
- no CORS,
- SameSite=Strict HttpOnly session cookie,
- per-session CSRF token required on mutation,
- JSON content-type checks,
- bootstrap token required for session creation.

### DNS rebinding

Reject Host values outside exact loopback names and configured port. Do not accept arbitrary Host even when the socket is loopback.

### Token leakage

- bootstrap token stored in `auth.json` with restricted permissions,
- transferred in URL fragment, not query,
- fragment copied only to tab-scoped `sessionStorage` and cleared before the
  first network wait,
- never stored in `localStorage`, returned by the server, or cached in a
  session/bootstrap response,
- invalid bootstrap credentials clear the tab copy and stale in-memory CSRF,
- never printed by `doctor`,
- no token-bearing URL in server logs,
- constant-time comparison.

### Public tunnel exposure

The admin Express app is a different listener bound to loopback. It is not attached as a route to the public MCP app. Operation snapshots, SSE, event history, terminal, diff, agent output, and stop routes are included in the route-separation audit. The public static mount uses a decoded, normalized allowlist containing only `workspace-app.html` and `assets/`; the dashboard HTML entry, other top-level build outputs, encoded aliases, duplicate separators, and traversal-style variants are absent from the public listener.

MWU-07.03 repeated this boundary against the managed fixed origin after a real
machine restart. The global runtime bundle matched the verified local build;
the dashboard route and exact/normalized/encoded/traversal/case static variants
returned 404, while public MCP health and MCP App HTML/JS/CSS/OPTIONS remained
available. The loopback dashboard and health-gated recovery task also remained
operational. No credential value or response body was retained in the proof.

## Live operation output threat model

### Hidden reasoning and prompt leakage

Provider SDKs and model adapters may expose internal event objects. Adapters publish only explicitly classified safe fields. Unknown fields are ignored or summarized generically. Raw SDK objects, full prompts, chat transcripts, and hidden reasoning are never dumped to the browser or SQLite.

### Terminal and environment leakage

Process output is untrusted and may contain credentials or environment values. Output is bounded, passed through conservative redaction, and displayed as potentially sensitive local content. DevSpace does not persist raw environment objects, command-construction internals, or full process invocation context merely for observability.

### File-content leakage

File events store path and operation metadata, not complete file contents. Diff details are loaded through the existing repository/change-review path only when requested and remain inside the authenticated loopback boundary.

### Event-store amplification

Noisy output can exhaust memory, disk, or browser queues. Per-event, per-run, retention, and per-client bounds are mandatory. Truncation emits a visible marker while underlying work continues.

### Reconnect replay

A cursor may redeliver events but must never re-execute a tool, command, patch, process, or agent action. Browser projection de-duplicates by run and sequence.

MWU-07.04 proves the corresponding server-restart boundary in an isolated
real process. A persisted running process operation whose canonical owner is
absent after restart is transitioned to `failed` with
`owner_unavailable_after_restart` once. The next restart produces no new
event, migration row, run, or persisted-state change. The test never launches
the represented command, never touches the live DevSpace database, and awaits
child termination before removing its temporary SQLite state.

### Stop abuse

Stop requires dashboard session, exact Host/Origin checks, CSRF, JSON, and a canonical stoppable owner. The API cannot accept an arbitrary PID, process command, provider executable, or repository rollback request.

## Project path threat model

### Traversal and symlinks

Registration and opening operate on real paths and existing root helpers. Discovery does not follow symlinks. Manual selection is revalidated.

### Allowed-root change

Project availability is computed against the current config on every list/open mutation. A previously valid record does not grant permanent access.

### Windows path aliasing

Canonical `rootKey` is case-folded on Windows. Duplicate drive-letter case or separator variants do not create distinct records.

## Permission presets

### Inspect policy

```text
read/search/list                 allow
write/edit/apply_patch           deny
artifact write                   deny
shell                            deny
read-only local agent            allow
write-capable local agent        deny
danger-full-access agent         deny
```

### Design policy

```text
read/search/list                 allow
write/edit/apply_patch           allow only design documentation scope
artifact write                   allow only design documentation scope
shell                            deny
read-only local agent            allow
write-capable local agent        deny
danger-full-access agent         deny
```

### Develop policy

```text
read/search/list                 allow
write/edit/apply_patch           allow inside workspace
artifact write                   allow inside workspace
shell                            allow with existing DevSpace warnings
read-only local agent            allow
local agent workspace-write      allow
danger-full-access agent         deny
```

For registered projects, `danger-full-access` is a first-class policy operation denied by every preset. It must never become an unknown or missing operation that a caller can skip authorizing. Legacy unregistered workspaces represent their existing behavior explicitly for backward compatibility; that compatibility does not add `danger-full-access` to any registered preset.

## Central enforcement matrix

| Operation | Guard point |
|---|---|
| read | read handler |
| grep/glob/ls | search/list handlers |
| write/edit | before existing file tool call |
| apply_patch | after parse, before first mutation |
| artifact download | before destination creation |
| shell/exec | before process session start |
| local agent start/continue | before store mutation/worker spawn |
| operation stop | admin auth/CSRF, then canonical owner capability lookup before cancellation |

A handler must not duplicate preset logic. It asks the centralized guard.

## Design-write scope

Allowed by default:

- `docs/**`
- root-level `*.md` and `*.mdx`
- `.devspace/**`

Always denied:

- `.env` and `.env.*`
- files matching common private-key/credential names
- paths outside workspace
- Git internals
- DevSpace state/auth directories outside repository
- symlink targets outside workspace

If future requirements need custom scopes, add them as a separately reviewed feature. Do not add a generic arbitrary-glob editor in the first implementation.

## Shell limitation

It is not possible to make arbitrary shell execution safely “read-only” with string heuristics. Therefore inspect/design deny shell. Develop clearly displays that shell can act with the user account's permissions, consistent with the existing DevSpace security model.

## Agent delegation security

- `delegate_task` requires an opened workspace.
- target profile/provider must be configured and available.
- policy must allow delegation.
- default write mode is `workspace-write`, never `danger-full-access`.
- prompt envelope excludes secrets and chat transcript.
- the tool result identifies the agent that was started.
- status is persisted; no unlimited automatic retries.
- remote publication remains subject to repository instructions and explicit approval.

## Native picker security

- local dashboard session required,
- fixed adapter code only,
- no arbitrary executable,
- process timeout,
- output length bounded,
- selected path treated as untrusted,
- canonical allowlist validation after selection,
- cancellation returns no selection.

## Audit events

Add structured log events for:

- dashboard session created/rejected,
- project registered/updated/forgotten,
- discovery started/completed/truncated,
- project opened,
- policy denied,
- agent delegated/continued/completed/error,
- operation run created/state changed/reconciled,
- operation history truncated,
- dashboard SSE client disconnected for bounded-queue protection,
- canonical stop requested/completed/failed.

Do not include secret values, prompts, hidden reasoning, environment objects, file contents, or full handoff content.
