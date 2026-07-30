# Public Release Runbook

## Current release boundary

The working repository is prepared as a **source release**. It is not an npm
publication: `package.json` remains intentionally `private`, while the upstream
package identity and `devspace` command remain only for runtime compatibility.

The repository may remain private indefinitely. Making it public is a separate
external action and must not be combined with ordinary development pushes.

## What belongs in the public repository

- source, tests, setup scripts, and generic examples;
- public architecture, requirements, decisions, and sanitized evidence;
- MIT attribution, security policy, contribution guide, and release runbook.

The following remain machine-local:

- `.env` and credentials;
- `.tmp/` logs and temporary verification state;
- `.agents/state/` local execution ledgers;
- `cloudflare/` account-specific Worker, tunnel, and routing configuration;
- real hostnames, local user paths, account IDs, project/workspace/agent/run
  IDs, cookies, Owner passwords, and tokens.

## Normal private preparation

These checks are safe to run before an ordinary push to the private repository:

```powershell
npm ci --no-audit
npm run check:public
npm run audit:production
npm run typecheck
npm test
npm run build
npm pack --dry-run
git diff --check
git status --short
```

`npm run check:public` checks the publishable working tree without printing
matched secret values. A passing result does not authorize a visibility change.

## One-time clean-history cutover

The pre-public commits contain machine-specific operational history that was
removed from the current tree. No recognized API key, password, private key, or
token was found, but those commits must not become the advertised public
history. Perform this cutover once, immediately before changing visibility.

1. Stop feature work and require a clean working tree.
2. Confirm `origin` is the intended private `vellyalis/dpkr-helix` repository.
3. Inspect all branches, tags, releases, completed Actions workflow runs and
   their head SHAs, Actions artifacts, issue attachments, and GitHub
   environments. A force-push does not remove workflow-run records. After
   explicit owner approval for permanent deletion, delete every completed run
   that references pre-public history, then verify that no such run remains:

   ```powershell
   # Populate only with the exact ID/SHA pairs included in the owner's approval.
   # Never build this deletion list dynamically.
   $approvedRuns = @(
     # [pscustomobject]@{ databaseId = 123456789; headSha = "40-character-sha" }
   )
   if ($approvedRuns.Count -eq 0) {
     throw "No workflow runs were explicitly approved for permanent deletion."
   }

   $inventoryJson = gh run list --repo vellyalis/dpkr-helix --limit 100 `
     --json databaseId,headSha,status
   if ($LASTEXITCODE -ne 0 -or
       [string]::IsNullOrWhiteSpace(($inventoryJson -join ""))) {
     throw "Could not read the workflow run inventory; stop without deleting."
   }
   $inventory = @($inventoryJson | ConvertFrom-Json)
   foreach ($approvedRun in $approvedRuns) {
     $matches = @($inventory | Where-Object {
       $_.databaseId -eq $approvedRun.databaseId -and
       $_.headSha -eq $approvedRun.headSha
     })
     if ($matches.Count -ne 1 -or $matches[0].status -ne "completed") {
       throw "Approved workflow run inventory changed; stop without deleting."
     }
     gh api --method DELETE `
       "repos/vellyalis/dpkr-helix/actions/runs/$($approvedRun.databaseId)"
     if ($LASTEXITCODE -ne 0) {
       throw "Workflow run deletion failed; stop and inspect the inventory."
     }
   }
   $remainingJson = gh run list --repo vellyalis/dpkr-helix --limit 100 `
     --json databaseId,headSha,status
   if ($LASTEXITCODE -ne 0 -or
       [string]::IsNullOrWhiteSpace(($remainingJson -join ""))) {
     throw "Could not verify workflow run deletion; stop before publication."
   }
   $remaining = @($remainingJson | ConvertFrom-Json)
   if ($remaining.Count -ne 0) {
     throw "Workflow run inventory changed; inspect and obtain new approval."
   }
   ```

   Remove or sanitize any other private material before visibility changes.
4. Create a private recovery bundle outside the repository and outside any
   public or synchronized folder:

   ```powershell
   git bundle create ..\dpkr-helix-private-backup.bundle --all
   git bundle verify ..\dpkr-helix-private-backup.bundle
   ```

5. Create a parentless commit from the already-reviewed tree without changing
   the working directory:

   The install must run lifecycle scripts. Do not add `--ignore-scripts`:
   `postinstall` verifies and repairs a vulnerable transitive dependency that
   is pinned by this repository.

   ```powershell
   $previousLocalMain = git rev-parse main
   $previousRemoteMain = git rev-parse refs/remotes/origin/main
   $observedRemoteMain = (git ls-remote origin refs/heads/main).Split("`t")[0]
   if ($LASTEXITCODE -ne 0 -or
       $observedRemoteMain -ne $previousRemoteMain) {
     throw "Remote main changed; fetch, inspect, and recreate the recovery bundle."
   }
   $publicTree = git rev-parse "main^{tree}"
   $publicLogin = gh api user --jq '.login'
   $publicName = gh api user --jq '.name // .login'
   $publicId = gh api user --jq '.id'
   $publicEmail = "$publicId+$publicLogin@users.noreply.github.com"
   $publicRoot = "Initial public release" |
     git -c "user.name=$publicName" -c "user.email=$publicEmail" `
       commit-tree $publicTree
   git branch --force public-root $publicRoot
   git switch public-root
   npm run check:public:history
   npm ci --no-audit
   npm run audit:production
   npm run typecheck
   npm test
   npm run build
   ```

6. Review `git show --stat --oneline HEAD` and `git shortlog -sne HEAD`. The
   public root should contain only the intended maintainer attribution and the
   upstream copyright retained in `LICENSE`.
7. Only after explicit owner approval, replace the private remote `main` with
   the reviewed root using an exact lease:

   ```powershell
   git branch --move --force main
   git push --force-with-lease=refs/heads/main:$previousRemoteMain origin main
   ```

8. Verify the remote has only intended branches and tags. Do not leave a
   `private-backup`, archive, or pre-public tag on a repository that will become
   public.
9. Verify that newly created Actions runs reference only `$publicRoot`. A
   successful hosted CI run is required before announcing the release. If an
   account or billing state prevents runner allocation, record the external
   blocker and do not announce.
10. Change repository visibility to public. This is the point after which
    publication is not practically reversible: returning to private cannot
    recall clones or downloaded source.
11. Immediately enable private vulnerability reporting and configure or confirm
    branch protection. On GitHub Free for a personal repository, these controls
    cannot be fully configured while the repository is private; verify them
    after the visibility change and before announcement.
12. Re-run the public clone acceptance below from a new directory.

Keep the recovery bundle private. Delete it only when its recovery value is no
longer needed.

## Public clone acceptance

From a clean directory on a supported machine:

```powershell
git clone https://github.com/vellyalis/dpkr-helix.git
Set-Location .\dpkr-helix
npm ci --no-audit
npm run audit:production
npm run check:public:history
npm run typecheck
npm test
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 `
  -Mode Plan `
  -AllowedRoot C:\src\my-project
```

Do not use `npm ci --ignore-scripts` for this release verification. The explicit
post-install audit is authoritative only after the required dependency repair
has run.

The release is ready to announce only if these checks pass, the CI workflow has
allocated runners successfully, the security-reporting link works, and the
README accurately describes current host compatibility.

## Rollback

Before visibility changes, restore the prior branch from the verified bundle or
`$previousLocalMain`. After visibility changes, code already cloned or
downloaded cannot be recalled; a private rollback changes future access only.
