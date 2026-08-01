# Security Model

DevSpace exposes local coding capabilities over MCP. Treat it as remote access
to your development machine.

The security model is simple:

- you choose a narrow filesystem allowlist
- the MCP endpoint requires OAuth approval with your Owner password
- Host headers are allowlisted from the configured public URL
- every coding action happens through explicit MCP tool calls

## Filesystem Allowlist

DevSpace only opens workspaces under configured roots.

Good examples:

```text
~/work
~/personal/open-source
```

Avoid broad roots:

```text
~
/
C:\
```

The narrower the root, the easier it is to reason about what the MCP client can
reach.

## Owner Password

`devspace init` generates an Owner password and stores it in:

```text
~/.devspace/auth.json
```

When an MCP client connects, DevSpace shows an approval page. Enter the Owner
password only when you intentionally want that client to access this server.

For env-driven deployments, set a long random value:

```bash
DEVSPACE_OAUTH_OWNER_TOKEN="$(openssl rand -base64 32)"
```

## Public URL And Host Allowlist

DevSpace needs `DEVSPACE_PUBLIC_BASE_URL` so MCP clients can discover OAuth
metadata and connect to the correct resource.

The value should be the origin only:

```text
https://your-tunnel-host.example.com
```

Do not include `/mcp` in `DEVSPACE_PUBLIC_BASE_URL`.

By default, DevSpace derives allowed Host headers from the local host and public
URL. Use `DEVSPACE_ALLOWED_HOSTS=*` only for intentional local debugging.

## Tunnels

DevSpace does not manage tunnels. Your tunnel or reverse proxy should point to:

```text
http://127.0.0.1:7676
```

DevSpace OAuth protects the MCP endpoint, but the tunnel URL should not be
treated as a secret. A whole-site identity gate must not be added blindly:
ChatGPT needs to reach OAuth metadata, authorization/token endpoints, and MCP.
Use an additional proxy control only after the complete ChatGPT OAuth flow and
required public paths are proven compatible.

Cloudflare account certificates, tunnel credential JSON, remotely managed
tunnel tokens, and OpenAI tunnel runtime keys are credentials. Enter them
directly in their owner-controlled browser or terminal. Do not place them in
the repository, chat, logs, screenshots, or handoff state.

## Windows Scheduled Recovery

The portable installer does not register startup automatically. The optional
External-mode recovery installer creates one limited-current-user Scheduled
Task only after an explicit Plan and Install command.

The task Action uses `wscript.exe //B //NoLogo`, and its wrapper launches
PowerShell with no window. It reads the saved public origin and port but does
not read the Owner password, Cloudflare credentials, browser profiles, or
cookies.

The installer-owned runtime record is the desired-running marker. An
intentional `setup-windows.ps1 -Mode Stop` removes it, so scheduled recovery
does not restart the service. A public-only outage also does not restart a
healthy local process; the external tunnel remains a separate owner.

Removal is explicit and fails closed if a same-named task or helper file is not
recognized as managed by dpkr helix.

## Shell Access

The shell tool is powerful by design. It is meant for tests, builds, git, and
package scripts.

Filesystem path containment applies to DevSpace file tools. Shell commands run
as local commands and can do what your user account can do. This is why the MCP
client must be trusted and the Owner password must stay private.

## Managed Self-Update

The portable Windows installation can expose `update_dpkr_helix` to an OAuth-
approved MCP client. Treat it as a privileged software-update action. Its tool
metadata is mutating, destructive-capable, and open-world because it fetches
and installs source from GitHub; clients may require approval before calling it.

The tool accepts no path, branch, remote, command, package, or credential input.
The managed setup script independently requires the canonical dpkr helix
`origin`, a clean `main`, a fast-forward `origin/main`, and an External stable
endpoint. Candidate code is verified in a temporary worktree before the live
process stops. Update status returns only bounded state, timestamps, commit IDs,
and reason codes. Local paths, Git/npm output, prompts, file contents, and
credentials are excluded.

This does not make GitHub or the local account a sandbox. A compromised
canonical repository, Git executable, npm registry/cache, Node runtime, or
Windows user can still affect the installation. Branch protection, pinned
workflow actions, production audit, postinstall integrity checks, and local
preflight reduce that supply-chain risk; rollback preserves the previous local
package when candidate deployment itself fails.

## Worktrees

Managed worktrees reduce accidental edits to your active checkout, but they are
not a security boundary. They are a workflow boundary for isolated coding
sessions.

## Native File Download

Native file download is an opt-in, one-shot transfer into an already-open
workspace. `download_artifact` accepts the MCP host's native file value, the
`workspaceId` returned by `open_workspace`, and an unused relative destination
path. It returns only the workspace-relative path and does not create a
persistent artifact service or reusable artifact ID.

DevSpace accepts only the documented native-file object and trusted OpenAI
download hosts and redirects. Arbitrary URL strings, local source paths,
credentials, malformed references, and unknown object fields are rejected.

Absolute paths, traversal, symlinked parents, and existing destinations also
fail closed. Downloads stream under the configured per-file limit and are
published without overwrite as owner-only files. DevSpace does not extract or
execute transferred content.

## Logs

By default, DevSpace logs requests and tool calls. Shell command previews are
disabled unless `DEVSPACE_LOG_SHELL_COMMANDS=1`.

Do not enable shell command logging if commands may contain secrets.

Artifact tool logs contain bounded workspace ID, validated hostname,
workspace-relative output path, byte count, hash, duration, and status metadata.
`download_artifact` does not log the opaque file value. Raw content, connector
references, native file IDs, bearer credentials, presigned URLs, host paths,
temporary paths, and base64 chunks are never included in tool logs or tool
results.
