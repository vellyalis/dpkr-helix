# Helix + official Codex launcher

The `helix` command is the terminal entrance to the same local development
environment used by ChatGPT through dpkr helix. It deliberately does not
implement a second chat client, model transport, or billing path. Interactive
coding remains owned by the official Codex CLI.

## What the launcher connects

The launcher combines four existing owners without duplicating them:

- **Official Codex CLI** owns the terminal conversation, ChatGPT sign-in,
  model selection, approvals, sandboxing, and Codex session history.
- **dpkr helix ProjectRegistry** resolves stable project IDs, slugs, and exact
  display names to approved local roots.
- **dpkr helix persistent handoff** carries bounded progress and verification
  state between ChatGPT-controlled work and a new Codex session.
- **Managed Windows setup/recovery scripts** remain the only owner of Helix
  start, stop, repair, and self-update.

No prompt, transcript, API key, or Codex credential is copied into a new Helix
store. `helix continue` reads only the existing sanitized persistent handoff.

## Daily commands

```powershell
# Current directory, if it is inside an approved root.
helix

# Registered project slug, ID, unambiguous exact display name, or a uniquely
# discovered Git project inside the approved roots.
helix studyforge
helix codex studyforge

# Forward official Codex arguments after --.
helix studyforge -- -m gpt-5.6-sol --search

# Start a new Codex session with the latest ChatGPT/Helix handoff.
helix continue studyforge

# Resume the latest official Codex session scoped to the project.
helix resume studyforge

# Use the official Codex session picker instead of --last.
helix resume studyforge --picker

# Inspect project names accepted by the launcher.
helix projects
```

When no project is supplied, the current directory must be inside a configured
dpkr helix allowed root. If it belongs to a registered project, the project root
is used so Codex session filtering, AGENTS.md discovery, and handoff lookup stay
stable.

An explicit unknown selector is compared with approved-root directory names and
then with a bounded Git-project discovery scan. A unique match is registered in
the existing ProjectRegistry and opened. Ambiguous matches fail with their paths
instead of guessing.

## Lifecycle and operations

```powershell
helix up
helix down
helix restart
helix recover
helix status
helix doctor
helix dashboard
helix update
```

`up`, `down`, `restart`, `recover`, and `update` call the installed managed
Windows scripts. They do not create a second daemon or process owner.

`helix doctor` prints the combined launcher status, runs the installed dpkr
helix native/configuration doctor, and then runs the official Codex doctor.

Opening Codex through `helix` probes local Helix health first. A healthy
attested process is preserved. If the local endpoint is unavailable, the
launcher requests the existing managed Start path and requires health to return
before opening Codex.

`helix update` uses the same verified candidate, rollback, and status controller
as ChatGPT-initiated updates. It prints phase changes and exits nonzero if the
candidate is rejected, rolled back, or fails.

## Handoff semantics

The three coding entrances are intentionally different:

| Command | Meaning |
| --- | --- |
| `helix <project>` | Start a normal new official Codex session |
| `helix continue <project>` | Start a new Codex session seeded with the latest dpkr helix persistent handoff |
| `helix resume <project>` | Resume the latest official Codex session for that project |

The handoff is treated as a resume aid, not as ground truth. The generated Codex
prompt requires reconciliation with Git, files, configuration, and current test
evidence before edits.

## Authentication and usage limits

The launcher executes the official `codex` binary already installed on the
machine. Check it directly with:

```powershell
codex --version
codex login status
```

The Codex account, login, approval policy, and usage limits are therefore the
same as running `codex` directly. `helix` does not accept or read an OpenAI API
key and does not route work through the separately billed OpenAI API.

## Failure boundaries

- An unknown simple project name fails with a pointer to `helix projects`.
- A path outside the approved roots is rejected by the existing project path
  policy.
- `helix continue` fails rather than inventing continuity when no persistent
  handoff exists.
- A missing official Codex installation fails with an actionable login/install
  message.
- Lifecycle failures are returned from the managed scripts; the launcher does
  not attempt its own repair algorithm.
