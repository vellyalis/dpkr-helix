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
without opening Edge, starts DevSpace on an unused loopback port, deletes the
installed CLI while that isolated service is running, proves package-based
self-repair and stable-origin reconciliation, then stops and removes the
isolated installation:

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

The managed Codex profiles use `gpt-5.6-luna` at `max` for read-only
exploration, and `gpt-5.6-sol` at `medium`, `high`, and `xhigh` for normal
implementation, review, and the hardest implementation tasks respectively.
The default `codex-implementer` target uses Sol at `medium`; no managed profile
uses GPT-5.5.

The global runtime is installed from a built package archive rather than an npm
link to the checkout, then its production dependencies are restored from the
verified deployment lock. Normal source dependency maintenance therefore cannot
lock or partially remove files used by the running service, and compatible range
updates cannot silently change the deployed tree after verification.

Global npm installs pass the resolved prefix explicitly instead of relying only
on `npm_config_prefix`. On Windows, npm can otherwise report a successful global
install without creating the advertised package directory when the prefix
contains spaces and non-ASCII characters. Setup treats the package directory as
mandatory evidence of success before it can stop or start a managed generation.

The exact package archive is also copied to a content-addressed directory under
`~/.devspace/runtime-packages`. Bootstrap settings record its SHA-256 plus a
fingerprint of `package.json`, the deployment lock, and every deployed `dist`
file. The archive contains application files only, not the Owner password,
Cloudflare credentials, browser state, user configuration, or workspace data.

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

Before reuse, Start also verifies the retained package hash, deployed runtime
fingerprint, recorded runtime generation, saved/configured public origin, local
health, authorization-server metadata, and protected-resource metadata. A fully
attested process is reused without invalidating MCP sessions. If deployed files
are missing or changed, Start validates the retained archive before stopping the
owned process, restores the package and locked production dependencies, and
starts one new attested generation. A legacy healthy installation creates this
recovery archive before its first restart under the hardened script.

## Update From ChatGPT

After the update surface is present in the ChatGPT catalog, you can ask ChatGPT
to update dpkr helix. ChatGPT uses `get_dpkr_helix_update_status` and
`update_dpkr_helix`; you do not need to provide Git, npm, stop, or restart
commands. Ordinary later updates reuse these stable tool names, so the expected
service reconnect does not require another catalog refresh or replacement chat.

The server emits the standard MCP tool-list-change notification after a new
connection initializes. Conforming clients can therefore resynchronize their
catalog automatically. ChatGPT Web currently does not apply that notification
when a legacy connection gains new tool names. That one-time migration can be
performed by the guided workflow in the already signed-in browser after the
owner approves the external account action; otherwise use the developer-mode
connection's **Update** action and start one fresh chat. It is not part of every
self-update.

This path is deliberately explicit. It never polls for versions or installs an
update without a user request. It is available only when the managed source is a
clean `main` checkout using `origin/main` and the installation uses an External
stable endpoint. A Quick Tunnel changes address during restart, so the tool
refuses that mode instead of stranding the ChatGPT connection.

The updater:

1. verifies the canonical dpkr helix `origin`, fetches `origin/main`, and rejects
   dirty, non-main, or diverged source;
2. creates a temporary detached worktree at the exact target commit;
3. installs dependencies and runs the production audit, typecheck, full tests,
   build, public-release check, and both Windows setup/recovery PowerShell suites
   while the current service remains available;
4. stores the verified candidate as a content-addressed recovery package and,
   under the runtime operation lock, captures the current verified package plus
   settings and managed scripts for rollback;
5. stops and replaces dpkr helix from the candidate archive only after
   preflight succeeds, using a short hidden launcher and a separate hidden
   one-shot updater whose two local log files are replaced on every request;
6. checks the CLI, exact local/public OAuth origin contract, protected-resource
   metadata, and Codex delegation;
7. fast-forwards the managed source and updates the managed recovery scripts;
8. restores the previous package, bootstrap settings, source commit, scripts,
   desired state, and health if deployment fails.

One MCP reconnect is expected after verified deployment begins because the
server is replacing itself. After reconnecting, ask ChatGPT for the update
status. The result is stored without credentials, local source paths, command
output, or file contents.

The status response separates a running attempt from the last completed
attempt. An inactive `rejected`, `failed`, `rolled_back`, `succeeded`, or
`up_to_date` result is historical and does not claim that the same source
condition still exists. When `canRequestUpdate` is `true`, a new explicit
`update_dpkr_helix` request runs the current preflight checks again; the old
terminal code is not a request blocker.

The equivalent local command is:

```powershell
& "$env:USERPROFILE\.devspace\setup-windows.ps1" -Mode Update
```

An update does not create a Scheduled Task, daemon, service, queue, dashboard
button, or automatic upgrade policy. The existing setup/recovery owner remains
responsible for installation and restart.

### Maintainer End-To-End Acceptance

A no-op `UP_TO_DATE` result proves request and status wiring but not service
replacement. To verify the complete ChatGPT path, publish one real reviewed
commit from a separate worktree while the managed clean `main` checkout remains
at its preceding commit. Confirm that `origin/main` is exactly one fast-forward
commit ahead, explicitly ask ChatGPT to call `update_dpkr_helix`, then use
`get_dpkr_helix_update_status` after reconnecting.

Acceptance requires the status target, managed source `HEAD`, tracking ref, and
advertised remote ref to match; local and public health, doctor, and the hosted
platform checks must also pass. Do not rewind the managed checkout, force-push,
or create a meaningless runtime change merely to manufacture an update target.

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
6. After explicit approval, let the guided workflow update the developer-mode
   connection when tool, schema, annotation, authentication, or MCP App UI
   metadata changes. ChatGPT Web currently needs this host-side refresh even
   though dpkr helix emits the standard MCP tool-list-change notification.

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

Recovery reads only the saved External origin, port, desired state,
installer-owned runtime record, application package/fingerprint state, and
public metadata. `Start` and `Stop` persist the desired state in the existing
bootstrap settings, so an intentional stop stays stopped while a failed
recovery start remains eligible for the next scheduled attempt. It never reads
the Owner password, Cloudflare token, browser state, or workspace contents.

A local failure is confirmed by a second short probe before reconciliation.
Every eligible check then enters the existing managed Start path so that a
health-only response cannot hide missing deployed files, a stale process
generation, config drift, or OAuth metadata advertising an obsolete Quick
Tunnel URL. Start performs no public-network check and reuses a fully attested
local process, so a public-only outage never causes a local restart. Recovery
then requires local and public health plus both OAuth metadata documents to
match the saved stable origin.

Start, Stop, and Install share one current-session operation lock. A scheduled
check skips immediately while one is active, and its internal Start rechecks
the desired state after acquiring the lock. Start is idempotent: a matching,
healthy managed process is reused without invalidating MCP sessions. Restart
keeps one bounded previous generation of stdout/stderr logs for diagnosis. The
hidden reconciliation wrapper is bounded to 120 seconds. Its last sanitized
result is written atomically to `~/.devspace/windows-recovery.json`, including a
state, machine-readable code, message, and UTC check time but no credentials,
source paths, command output, or file contents.

Remove the exact managed task, helper files, and managed recovery-status record
with:

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
- Recovery does not shorten the five-minute interval, probe workspace files,
  add generic mutation retries, or create another service/process owner.
- The retained recovery package is application code only and is accepted only
  when its filename and contents match the saved SHA-256. Runtime reuse also
  requires the saved deployed-file fingerprint and stable OAuth origin.
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
