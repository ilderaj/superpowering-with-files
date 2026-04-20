# Release

Branches:

- `dev`: ongoing implementation and upstream updates.
- `main`: verified template baseline.

Release flow:

```bash
git switch dev
./scripts/harness worktree-preflight
npm run verify
./scripts/harness verify --output=.harness/verification
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
git switch main
git merge --ff-only dev
git push origin main
```

Only promote to `main` after verification passes.

For feature or Superpowers worktrees, run `./scripts/harness worktree-preflight` while still on the intended source branch. In this repository, ongoing implementation starts from `dev` unless a task explicitly says it should start from `main`.

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
- `full` remains the default skill profile
- `minimal-global` remains opt-in and projects only the allow-listed adoption-safe skill subset
- hook payload measurements use projected runtime hook files, not only source files
- `hookMode: off` remains the default for low-overhead installs
- `sync --dry-run` shows only expected Harness-managed projection changes

Do not promote context-governance changes based on unit tests alone. The release must include a real Harness verification report and a dry-run projection check so IDE compatibility regressions are caught before `main`.
