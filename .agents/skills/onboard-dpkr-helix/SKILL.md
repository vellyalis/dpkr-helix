---
name: onboard-dpkr-helix
description: Set up or recover dpkr helix on another Windows PC, including the portable installer, a stable Cloudflare Tunnel, ChatGPT developer-mode app registration, OAuth approval, and optional no-console scheduled recovery. Use for new-PC onboarding, repeatable source-repository installation, stable MCP endpoint setup, or diagnosing an incomplete dpkr helix onboarding. Do not use for ordinary repository development or for changing an already healthy deployment without an onboarding goal.
---

# Onboard dpkr helix

Keep deterministic local installation in `scripts/setup-windows.ps1`. Use this
skill to coordinate the account-bound steps that the script must not own.

## Establish the boundary

1. Read `AGENTS.md`, `docs/setup-windows.md`, and `docs/security.md`.
2. Reconcile Git status and preserve unrelated changes.
3. Confirm the target is Windows PowerShell 5.1 or newer and the source clone is
   the intended `dpkr-helix` repository.
4. Never copy `.devspace`, `.cloudflared`, `.codex/browser-profiles`,
   `cert.pem`, tunnel credential JSON, API keys, cookies, or Owner passwords
   from another PC.
5. Never read, echo, paste, log, commit, or place an Owner password or tunnel
   token in handoff state. Ask the user to enter secrets directly into the
   relevant browser or elevated terminal.

## Select the endpoint

Use a Cloudflare Quick Tunnel only for a temporary evaluation. State that its
hostname changes after restart, ChatGPT metadata must then be refreshed, and
portable scheduled recovery is intentionally unavailable.

Recommend a stable Cloudflare named tunnel for reusable onboarding when the
user controls a domain on Cloudflare. Prefer Cloudflare's remotely managed
tunnel path. The user owns the Cloudflare account, zone, hostname, and any
cost or workspace decision.

Treat OpenAI Secure MCP Tunnel as a separate alternative, not a drop-in
default. dpkr helix's browser-facing OAuth authorization endpoint must remain
reachable; do not select this route until that complete OAuth path has been
proven for the target account and workspace.

If the endpoint choice changes account cost, domain ownership, workspace
permissions, or public exposure, present a closed recommendation and wait for
the user before creating or changing external resources.

## Run local installation

From the repository root, preview before mutation:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 `
  -Mode Plan `
  -AllowedRoot C:\src\my-project
```

For temporary evaluation, run the same script in its default Quick Tunnel
mode. For a stable endpoint, first complete the Cloudflare handoff below, then
run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 `
  -AllowedRoot C:\src\my-project `
  -TunnelMode External `
  -PublicBaseUrl https://mcp.example.com
```

Let the installer own prerequisites, per-PC credentials, Codex login,
configuration, process identity, local/public metadata checks, and the
read-only Codex delegation smoke. Do not reproduce those operations in ad hoc
commands.

## Complete the Cloudflare handoff

1. Ask the user to sign in to Cloudflare and choose the account, domain,
   tunnel name, and public hostname.
2. Before creating a tunnel, DNS route, service, or token, describe the exact
   external change and wait for approval.
3. In Cloudflare, create a remotely managed named tunnel and add one published
   application route from the chosen hostname to
   `http://127.0.0.1:<DevSpace port>`.
4. Have the user run Cloudflare's generated Windows service-install command in
   an elevated terminal. The tunnel token must be entered there, never through
   chat or repository files.
5. Verify read-only observations: the Cloudflared service is running, the
   public `/healthz` and OAuth metadata return successfully, unauthenticated
   `/mcp` is rejected, and public dashboard/admin routes remain unavailable.
6. Do not enable a whole-site authentication gate that blocks ChatGPT's OAuth
   metadata, token, or MCP requests. DevSpace OAuth remains the MCP
   authorization boundary.

Use the current official links in `docs/setup-windows.md`; do not invent
Cloudflare dashboard labels or OpenAI permission names from memory.

## Register the ChatGPT app and OAuth

1. Ask the user to enable ChatGPT Developer mode when their account and
   workspace policy allow it.
2. Before creating or refreshing an app, state that this changes external
   ChatGPT account state and wait for approval.
3. Create the developer-mode connection with the stable public URL including
   `/mcp`, then review the discovered tools and annotations.
4. Let the user enter the local Owner password directly in the approval page.
   Do not inspect `~/.devspace/auth.json`.
5. Refresh the connection after tool, schema, annotation, authentication, or
   UI metadata changes.
6. Prove a new conversation can list projects, open the intended project
   without an absolute-path prompt, reuse the returned workspace, and perform
   one read-only call before permitting broader actions.

## Install optional recovery

Offer recovery only for `-TunnelMode External` with a stable HTTPS origin.
Preview it first:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows-recovery.ps1 `
  -Mode Plan
```

Explain that installation creates a limited-current-user Scheduled Task at
logon and every five minutes. Wait for approval, then have the user run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows-recovery.ps1 `
  -Mode Install
```

The task must enter through `wscript.exe //B //NoLogo`, never direct
interactive PowerShell. Recovery must preserve an intentional
`setup-windows.ps1 -Mode Stop`: absence of the managed runtime record means
"stay stopped." A public-only outage must not restart a healthy local
DevSpace process.

Remove recovery only after explicit approval:

```powershell
& "$env:USERPROFILE\.devspace\setup-windows-recovery.ps1" -Mode Remove
```

## Finish or recover

Verify local health, public health, OAuth metadata, ChatGPT tool discovery,
the selected project/read flow, Cloudflared service state when used, task
Action/last result when installed, and absence of unexpected visible windows.

On failure, stop only processes owned by the portable installer. Preserve
unknown task definitions and unmanaged Cloudflare/Codex configuration. Report
the failed boundary, safe rollback, residual external state, and one exact
resume action without recording secrets.
