# Release

Release is the last operator lane. For the full lane model, start with [Workflows](workflows.md).

Branches:

- `dev`: ongoing implementation and upstream updates.
- `main`: verified template baseline.

Release is not just a final shell sequence. Treat it as evidence-driven closure work for one exact verified commit.
If the path to promotion still includes PR review, stacked promotion, cleanup, or adopt follow-through loops, use `autonomous-release-closure` to drive that work from current evidence instead of guessing the next safe step.

Release flow:

```bash
git switch dev
./scripts/harness worktree-preflight --task <task-id>
npm run verify
./scripts/harness verify --output=.harness/verification
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
git push origin dev
gh pr create --base main --head dev --title "<release title>"
npm run release:pack
gh release create <version> --notes-file dist/release/<version>/release-notes.md dist/release/<version>/*
git switch main
git merge --ff-only dev
```

Push `origin/main` only when you are actually promoting `main`. A local fast-forward is enough when you only need parity with the verified release candidate while the PR is still open.

Only cut a release from the exact verified commit. If the release includes upstream baseline changes, also attach an [Upstream Update Compatibility](upstream-update-compatibility.md) report covering changed upstream files, affected projections, required resync, risk level, patch drift warnings, and checks.

Release lane expectations:

- `plan` and `review` work should already be complete before promotion starts.
- `verify` artifacts must be current for the exact `dev` commit being promoted.
- `finish` should already have merged scoped work back to `dev`.
- release notes should describe the verified delta only, in short user-facing language
- The PR to `main`, the release tag, and any local `main` fast-forward should all reference the same verified commit.
- `archive` should close any planning-only tasks whose durable conclusions have been transferred.

## Release Notes

Keep release notes short and evidence-based:

- group by the few changes an operator or adopter will actually notice
- prefer capability language over commit chronology
- do not pad the notes with internal retries, temporary failures, or planning-only work unless they changed the shipped workflow

For feature or Superpowers worktrees, run `./scripts/harness worktree-preflight --task <task-id>` while still on the intended source branch when the repo has multiple active tasks. In this repository, ongoing implementation starts from `dev` unless a task explicitly says it should start from `main`.

## GitHub Repository Setup

Create the GitHub repository with:

```bash
gh repo create superpowering-with-files --public --source=. --remote=origin --push
```

Create and push `dev`:

```bash
git switch -c dev
git push -u origin dev
git switch main
git push -u origin main
```

After repository creation, enable template repository behavior in GitHub repository settings.

## Context Governance Release Gate

Any release that changes policy rendering, projected skills, hook projection, or health reporting must also pass the context-governance gate before promotion:

- `health.context` exists in the verification report and includes entries, hooks, planning, skill profiles, summary, and warnings
- rendered entries for Codex, GitHub Copilot, Cursor, and Claude Code use the intended entry profile
- `minimal-global` remains the default skill profile for user-global and `both` scope installs
- `full` remains explicit opt-in for workspaces that intentionally need the complete skill surface
- hook payload measurements use projected runtime hook files, not only source files
- `hookMode: off` remains the default for low-overhead installs
- `sync --dry-run` shows only expected Harness-managed projection changes

Do not promote context-governance changes based on unit tests alone. The release must include a real Harness verification report and a dry-run projection check so IDE compatibility regressions are caught before `main`.
