# Contributing

Thanks for helping improve dpkr helix. This project accepts focused bug fixes,
security hardening, compatibility repairs, documentation corrections, and
features that have a concrete current use case.

## Before changing code

1. Read [AGENTS.md](./AGENTS.md), [README.md](./README.md), and the
   [security model](./docs/security.md).
2. Open or reference an issue when the change alters a public contract,
   security boundary, persistent data, or installation behavior.
3. Keep the change scoped. New services, stores, dependencies, plugin systems,
   or parallel execution owners require a current requirement and a simpler
   alternative that was proven insufficient.

## Local checks

Use Node `>=22.19 <27` and install the reviewed lockfile:

```bash
npm ci --no-audit
npm run audit:production
npm run check:public
npm run typecheck
npm test
npm run build
```

Run focused tests while developing, then run the complete checks before opening
a pull request. Do not weaken a test, policy, or security boundary merely to
make a check pass.

## Secrets and machine-local data

Never commit credentials, Owner passwords, tunnel tokens, account
certificates, cookies, browser profiles, `.env` files, personal hostnames,
workspace or operation IDs from a live installation, or absolute paths from a
real machine.

The following directories are local-only and ignored:

- `.tmp/`
- `.agents/state/`
- `cloudflare/`

Use placeholders such as `https://mcp.example.com`, `C:\src\my-project`, and
`ws_example` in tests and documentation.

## Pull requests

A pull request should explain the user-visible outcome, security or data
impact, tests run, and any residual risk. Keep unrelated formatting, renaming,
dependency upgrades, and architecture cleanup out of the same change.

Contributions are accepted under the repository's MIT license. Upstream
attribution is maintained in [NOTICE.md](./NOTICE.md) and
[LICENSE](./LICENSE). GitHub derives this fork's Contributors view from this
repository's own public commit history; the README does not maintain a copied
upstream contributor roster.
