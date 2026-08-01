# Portable Windows Setup

`scripts/setup-windows.ps1` reproduces the verified Windows setup on another PC.
It installs and configures:

- this DevSpace checkout;
- a pinned Codex CLI and three Codex delegation profiles;
- Cloudflare Quick Tunnel, or a stable HTTPS origin supplied by you;
- a pinned Playwright MCP runtime;
- a dedicated Edge profile with loopback-only browser control;
- per-PC DevSpace configuration and a newly generated Owner password.

It does not copy credentials from another machine, modify an existing unmanaged
Playwright MCP section, or register an automatic startup task. Stable-endpoint
recovery is a separate explicit preview/install step.

## Guided Onboarding

When Codex is running from this clone, invoke:

```text
$onboard-dpkr-helix
```

The repo-local skill coordinates the installer with Cloudflare and ChatGPT
account handoffs. It does not bypass approval for tunnel, DNS, service, app, or
OAuth changes, and it never asks the model to read an Owner password or tunnel
token.

## 1. Clone The Repository

Clone the source repository on the target PC:

```powershell
git clone https://github.com/vellyalis/dpkr-helix.git
Set-Location .\dpkr-helix
```

The repository is independent of the upstream DevSpace repository, so this copy
does not depend on the upstream repository remaining available.

Do not copy these user-specific folders:

```text
~/.devspace
~/.codex/browser-profiles
```

They can contain credentials or authenticated browser sessions.

## 2. Preview The Changes

Open PowerShell in the cloned DevSpace folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 `
  -Mode Plan `
  -AllowedRoot C:\src\my-project
```

The preview performs no installation, login, configuration write, or process
start.

Maintainers can run the isolated Windows checks with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.test.ps1
```

The slower near-fresh-user integration test uses a temporary user profile and
npm prefix plus an archive of the verified Git `HEAD` (so unrelated working-tree
changes cannot affect the result), installs the Playwright MCP configuration
without opening Edge, starts DevSpace on an unused loopback port, then stops and
removes the isolated installation:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.integration.test.ps1
```

## 3. Install

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 `
  -AllowedRoot C:\src\my-project
```

Pass multiple roots only when ChatGPT genuinely needs them:

```powershell
-AllowedRoot C:\src\project-a,C:\src\project-b
```

The script installs missing prerequisites with `winget`, builds the copied
checkout, creates a new Owner password, runs the official Codex browser login
when needed, starts DevSpace and the tunnel, and checks local/public OAuth
metadata plus a real Codex subagent run.

The final line prints the MCP URL to enter in ChatGPT Developer mode. ChatGPT
app creation and its OAuth approval remain interactive account actions.

Codex CLI browser authentication follows the official `codex login` flow:
<https://learn.chatgpt.com/docs/developer-commands?surface=cli#cli-codex-login>.

## 4. Start And Stop Later

Install mode copies the script to the target user's DevSpace directory.

```powershell
& "$env:USERPROFILE\.devspace\setup-windows.ps1" -Mode Start
```

```powershell
& "$env:USERPROFILE\.devspace\setup-windows.ps1" -Mode Stop
```

Start mode only stops processes recorded and owned by this setup before
restarting them. It refuses to stop a reused PID unless its executable,
creation time, and command line all match the recorded process identity, and it
keeps the runtime record when identity cannot be proven.

## Stable HTTPS Endpoint

Quick Tunnel is convenient for setup and testing, but its hostname changes
after restart. Cloudflare also disables Quick Tunnel when
`~/.cloudflared/config.yml` or `config.yaml` exists; the installer detects this
and stops without moving the user's configuration. If you already have an
OpenAI Secure MCP Tunnel or a Cloudflare hostname, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 `
  -AllowedRoot C:\src\my-project `
  -TunnelMode External `
  -PublicBaseUrl https://devspace.example.com
```

The script then starts DevSpace without starting cloudflared.

For repeatable use on another PC, the recommended Cloudflare path is:

1. In a Cloudflare account that controls the chosen domain, create a remotely
   managed named tunnel.
2. Add one published application route from the chosen hostname to
   `http://127.0.0.1:7676` (or the selected DevSpace port).
3. Run Cloudflare's generated Windows service-install command in an elevated
   terminal. Enter its tunnel token directly there; do not paste it into chat
   or save it in this repository.
4. Run the External-mode installer command above with the matching HTTPS
   origin.
5. Verify public `/healthz` and OAuth metadata, unauthenticated `/mcp`
   rejection, and that dashboard/admin routes remain unavailable publicly.

Cloudflare recommends remotely managed tunnels for most current deployments.
A locally managed `cert.pem` can manage tunnels across its Cloudflare account,
so do not copy either that certificate or a tunnel credential JSON to the
recipient PC.

OpenAI Secure MCP Tunnel is not treated as a drop-in default for this setup.
Although it can carry MCP and OAuth discovery privately, OpenAI documents that
the browser-facing authorization server is not automatically tunneled. Use it
only after the complete dpkr helix approval flow is proven reachable for the
target organization and ChatGPT workspace.

## Connect ChatGPT And Approve OAuth

After the stable endpoint passes:

1. In ChatGPT, enable Developer mode under **Settings → Security and login**
   when the account and workspace policy allow it.
2. Open the ChatGPT Plugins page, create a developer-mode connection, and enter
   the MCP URL including `/mcp`.
3. Review the discovered tools and metadata before using the connection.
4. Enter the Owner password directly in the dpkr helix approval page. Do not
   expose `~/.devspace/auth.json` to ChatGPT, Codex, logs, or handoff state.
5. Start a new conversation and prove `list_projects` → `open_project` → one
   read-only workspace call.
6. Refresh the connection after tool, schema, annotation, authentication, or
   MCP App UI metadata changes.

Creating or refreshing the ChatGPT connection and approving OAuth change
external account state. The guided skill must pause for user approval before
those actions.

## Optional No-Console Recovery

Recovery is available only after an External-mode installation has a stable
HTTPS origin. Preview it without writing files or Task Scheduler state:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows-recovery.ps1 `
  -Mode Plan
```

After checking the preview, explicitly install it:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows-recovery.ps1 `
  -Mode Install
```

This creates a limited-current-user Scheduled Task at logon and every five
minutes. Its Action enters through `wscript.exe //B //NoLogo`; Windows Script
Host starts the recovery PowerShell with window style `0`, so periodic checks
do not create an interactive console window.

Task registration is transactional with respect to its managed helper files.
If Windows rejects the Task Scheduler update, the prior helper contents are
restored and a first-time failed install leaves no managed helper behind.

Recovery reads only the saved External origin, port, and installer-owned runtime
record. If the runtime record is absent after an intentional
`setup-windows.ps1 -Mode Stop`, it stays stopped. If local health passes but
public health fails, it preserves the healthy DevSpace process and reports the
external tunnel boundary. It invokes the existing managed installer Start mode
only when local health is bad, then requires both local and public health to
recover.

Remove the exact managed task and helper files with:

```powershell
& "$env:USERPROFILE\.devspace\setup-windows-recovery.ps1" -Mode Remove
```

Install and Remove change Task Scheduler state and require explicit approval.
The script refuses to overwrite or remove a same-named task or helper file that
does not match its managed markers.

## Security Boundaries

- Keep `AllowedRoot` narrow. File tools reject paths outside it.
- DevSpace `bash` and Codex workers execute with the Windows user's authority.
- The Owner password is stored in `~/.devspace/auth.json`; do not share it.
- The managed Edge profile can retain cookies and is controllable through
  `127.0.0.1:9222` while running.
- `setup-windows.ps1` never registers automatic startup. The separate recovery
  installer is opt-in, External-mode-only, previewable, and removable.
- An occupied DevSpace port is rejected before a tunnel starts. Setup and
  verification failures automatically stop processes started by that attempt.
- The managed Codex TOML block is replaced atomically and checked with the
  installed Codex CLI; the prior file is restored if validation fails.
- DevSpace's Codex SDK child is installed with the Windows no-console spawn
  option. Postinstall and production audit fail closed if an SDK update removes,
  duplicates, or changes that option instead of silently restoring focus-stealing
  behavior.
- Use `-Mode Stop` for immediate tunnel and DevSpace cutoff.

Official references:

- [OpenAI Codex authentication](https://learn.chatgpt.com/docs/developer-commands?surface=cli#cli-codex-login)
- [OpenAI MCP configuration](https://learn.chatgpt.com/docs/developer-configuration#mcp-servers)
- [OpenAI developer-mode plugin connection](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
- [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
- [Cloudflare Tunnel setup](https://developers.cloudflare.com/tunnel/setup/)
- [Cloudflare Tunnel Windows service](https://developers.cloudflare.com/tunnel/advanced/local-management/as-a-service/windows/)
