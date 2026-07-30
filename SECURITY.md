# Security Policy

## Supported version

Security fixes are applied to the current `main` branch. Until tagged releases
begin, older commits are not maintained as separate supported versions.

## Report a vulnerability privately

Do not open a public issue containing a vulnerability, credential, private
hostname, local path, file content, or reproduction data from a real machine.
Use GitHub's private vulnerability reporting for this repository:

<https://github.com/vellyalis/dpkr-helix/security/advisories/new>

Include the affected commit, the smallest safe reproduction, expected and
observed behavior, and the security impact. Replace all real credentials,
hostnames, account IDs, workspace IDs, and local paths with placeholders.

If private vulnerability reporting is temporarily unavailable, contact the
maintainer through a private channel listed on the maintainer's GitHub profile.
Do not send secrets through a public issue, discussion, pull request, or chat
transcript.

## Security boundary

dpkr helix is remote access to approved local development folders. An
authorized MCP client can read files, change files, and run shell commands with
the operating-system permissions of the user running dpkr helix. Filesystem
allowlists constrain the file tools; they do not turn shell execution into an
operating-system sandbox.

Before exposing the service outside localhost:

- read the full [security model](./docs/security.md);
- approve only narrow project roots;
- run the service under a dedicated, least-privilege account that cannot access
  unrelated secrets or private files;
- use a strong Owner password and an HTTPS endpoint you control;
- verify that dashboard and admin routes are not exposed publicly;
- understand that tool inputs, file excerpts, and command output are sent to
  the connected MCP host.

The repository intentionally excludes machine-local Cloudflare configuration,
temporary logs, local agent state, `.env` files, and credential-shaped files.
Run `npm run check:public` before every push intended for distribution.
