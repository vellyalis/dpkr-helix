# Setup Guide

This guide is for users who want ChatGPT or another MCP host to work in local
projects through DevSpace.

## Requirements

- Node `>=22.19 <27`
- npm
- Git
- Bash, including Git Bash or WSL on Windows
- a public HTTPS URL that forwards to the local DevSpace server

DevSpace does not create the public tunnel for you. Use Cloudflare Tunnel,
ngrok, Pinggy, Tailscale Funnel, or your own HTTPS reverse proxy.

## Install And Configure

Run:

```bash
npx @waishnav/devspace init
```

The setup flow asks one question at a time.

### Project Roots

Choose the folders ChatGPT is allowed to open through DevSpace. Keep this
narrow.

Examples:

```text
~/personal,~/work
```

```text
/Users/alice/dev,/Users/alice/work
```

```text
C:\Users\alice\dev,C:\Users\alice\work
```

### Local Port

The default is `7676`.

The local MCP URL is:

```text
http://127.0.0.1:7676/mcp
```

### Public Base URL

Start your tunnel or reverse proxy before entering this value. Point the tunnel
at:

```text
http://127.0.0.1:7676
```

Enter the public origin without `/mcp`:

```text
https://your-tunnel-host.example.com
```

Configure the MCP client with the full MCP endpoint:

```text
https://your-tunnel-host.example.com/mcp
```

## Start The Server

Run:

```bash
npx @waishnav/devspace serve
```

If your tunnel URL changes for one run, override it without rewriting config:

```bash
DEVSPACE_PUBLIC_BASE_URL="https://new-tunnel.example.com" npx @waishnav/devspace serve
```

For a stable public URL, persist it:

```bash
npx @waishnav/devspace config set publicBaseUrl https://devspace.example.com
npx @waishnav/devspace serve
```

## Approve The Client

When ChatGPT, Claude, or another MCP client connects, DevSpace shows an Owner
password approval page. Enter the Owner password printed during setup.

The default config files are:

```text
~/.devspace/config.json
~/.devspace/auth.json
```

Keep `auth.json` private.

## Check Your Setup

Run:

```bash
npx @waishnav/devspace doctor
```

The doctor command reports the resolved config, Node version, Node ABI, platform,
Git, Bash, public URL, allowed hosts, and SQLite native dependency status.

## Upgrade And Roll Back

Before upgrading, stop DevSpace and copy `~/.devspace` plus the configured
`DEVSPACE_STATE_DIR`. Install the new package, run `devspace doctor`, then start
the server. Database migrations are automatic and are not downgraded by
installing an older package.

To roll back application code, stop the server and reinstall the previously
known-good package version. If it cannot read the migrated database, stop it and
restore the state-directory backup taken before the upgrade. Do not merge an old
database with a newer one.

On Windows, rerun the portable setup preview before installation. It reports
conflicting packages and services without changing the machine.

Portable Windows installations with a stable External endpoint can update from
ChatGPT after the update tools have been discovered once. The managed updater
accepts only a clean fast-forward `main`, verifies `origin/main` in a temporary
worktree before stopping the service, and restores the previous installation if
deployment fails. See [Portable Windows Setup](./setup-windows.md#update-from-chatgpt).

## Running From A Local Checkout

If you are developing DevSpace itself instead of using the published package:

```bash
npm install --include=dev
npm run dev
```

The same setup rules apply.

## Reproduce The Verified Windows Setup

For a Windows PC that also needs Codex delegation, Cloudflare Quick Tunnel, and
Playwright MCP, use the idempotent installer described in
[Portable Windows Setup](./setup-windows.md).
