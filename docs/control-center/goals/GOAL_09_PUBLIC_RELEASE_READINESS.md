# GOAL_09 — Public Release Readiness

## Status

`DONE` — the approved clean-history source release is public, security controls
are enabled, and unauthenticated public-clone acceptance passed.

## Goal

Prepare the existing `dpkr-helix` repository so the owner can publish it later
with one explicit, reviewed cutover, without moving the installed working
directory, creating a second source repository, exposing secrets or
machine-specific operational state, misattributing upstream work, or
accidentally publishing the compatibility package to npm.

## Invariants

- The live working path remains unchanged.
- `origin` remains private until the owner explicitly approves publication. This
  invariant was satisfied before the completed visibility change.
- No password, API key, token, credential, cookie, private key, or real account
  configuration enters Git, a release bundle, handoff state, or chat output.
- The upstream MIT copyright and license remain intact.
- The product name is `dpkr helix`; upstream npm and CLI identifiers remain
  compatibility contracts, not an ownership claim.
- Public source and private machine state have one documented boundary.
- Public readiness does not imply that every MCP host or ChatGPT plan exposes
  the same tool permissions.

## Responsibility map

| Owner | Responsibility |
| --- | --- |
| Git-tracked repository | source, tests, generic docs/examples, attribution, public policies, release checks |
| Local installation | credentials, fixed endpoint, account identifiers, tunnel configuration, logs, runtime IDs |
| GitHub owner | visibility, branch protection, vulnerability reporting, releases, external publication approval |
| MCP host/platform | plan eligibility, tool support, authorization UI, model behavior |
| Upstream DevSpace | upstream source history and contributor attribution |

## Acceptance

- **PR-01:** `npm run check:public` passes on the publishable tree and reports
  only file/line metadata on failure.
- **PR-02:** `.tmp/`, `.agents/state/`, `cloudflare/`, `.env`, bundle files, and
  credential-shaped files cannot be added by a normal `git add -A`.
- **PR-03:** README, setup, security, contribution, attribution, and release
  documents are valid for a public source clone and contain no private-only
  onboarding claim.
- **PR-04:** npm publication is disabled and the dry-run package excludes
  internal control-center State/Handoff files.
- **PR-05:** production dependency audit has zero known high or critical
  findings, or an explicit owner-approved release exception is documented.
- **PR-06:** typecheck, full tests, build, package dry run, and diff validation
  pass from the reviewed dependency tree.
- **PR-07:** pre-public operational history is not made the advertised public
  history; the one-time parentless-root cutover and recovery bundle are
  documented and `npm run check:public:history` passes on the cutover branch.
- **PR-08:** no public visibility change, force push, release, tag, or npm
  publication occurs without explicit owner approval.

## Architecture decision

### Accepted

Keep one repository and one working path. Sanitize the tracked tree, add one
Node-standard-library release checker, and perform a one-time clean-root cutover
immediately before publication.

### Rejected alternatives

- **Permanent public mirror:** rejected because it creates a second source of
  truth and recurring synchronization/security failure modes.
- **Publish current history unchanged:** rejected because operational endpoint
  and run metadata remain reachable in pre-public commits.
- **Depend on manual memory alone:** rejected because the repository already
  accumulated unignored machine-local directories and private-only copy.

### Complexity receipts

`scripts/check-public-release.mjs` is required because existing `.gitignore`,
Git, npm, and CI cannot detect forbidden text already inside otherwise valid
tracked Markdown. The checker adds no dependency, service, store, daemon,
configuration language, or runtime path. Its owner is the repository; failure
is a false positive or missed pattern; rollback is deleting the script and CI
step; removal is allowed only if an equivalent repository-native
secret/publication gate replaces it.

Pi's published shrinkwrap still installs vulnerable `brace-expansion@5.0.7`
even when npm reports the root override as applied. Lockfile-only replacement
was rejected because clean-install proof showed the vulnerable code still on
disk. The accepted repair directly pins `5.0.9`; postinstall atomically
replaces only Pi's exact nested copy when its resolved version is unsafe, then
fails closed unless Pi actually resolves a patched version. It adds no new
package because `brace-expansion` was already transitive. Remove the repair
when a verified Pi release naturally resolves `>=5.0.8`.

## Verification surface

- current-tree release check;
- reachable-history release check on the parentless cutover branch;
- `npm audit --omit=dev`;
- package-content inspection;
- typecheck, test, build, and `git diff --check`;
- independent A2 review of the frozen public-preparation diff.

## Completion evidence

- The working-tree and parentless-history public checks pass.
- A repository-external clean install resolves Pi's repaired
  `brace-expansion@5.0.9`; the production audit reports zero vulnerabilities.
- Typecheck, the full test suite, and the production build pass from that clean
  dependency tree.
- The package dry run contains 426 files and no control-center State/Handoff
  files.
- All tracked binary assets match reviewed SHA-256 values; the public dashboard
  uses visibly synthetic demo data.
- Independent A2 review R1 produced four requirement-linked findings. All four
  were fixed; focused R2 reported no unresolved finding or directly introduced
  S0-S2 regression.
- Independent A3 cutover review identified pre-public Actions-run retention,
  commit attribution, and GitHub Free control-ordering gaps. Attribution was
  proven with an owner-linked parentless root; the runbook now covers intended
  attribution, completed-run inspection/deletion, and post-public security
  configuration. Focused R4-R7 closed the destructive-scope, fail-open, and
  exact-lease regressions with no remaining S0-S2 finding.
- The eight owner-approved pre-public Actions runs were permanently deleted.
- The remote was exact-lease replaced by the parentless root, then made public.
- Private vulnerability reporting and administrator-enforced branch protection
  are enabled; force-push and branch deletion are disabled.
- An unauthenticated public clone passed the complete release acceptance.

## Post-release residual

The completed cutover order, recovery point, verification, and irreversibility
warning are owned by [docs/PUBLIC_RELEASE.md](../../PUBLIC_RELEASE.md).

The public-root hosted CI jobs were rejected before runner assignment because
the GitHub account requires billing/payment or spending-limit action. This is an
external announcement blocker, not a repository test failure; resolve it before
announcing a release.
