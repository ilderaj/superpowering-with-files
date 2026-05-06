# Workflows

Harness keeps policy rendering, projection, and planning state separate from the operator-facing workflow surface. This page is the productized map of that surface.

## Workflow Lanes

### `plan`

Use `plan` when the work is tracked, multi-phase, or likely to outlive the current session.

- Create or reuse `planning/active/<task-id>/`.
- Keep `planning-with-files` as the only durable task-memory system.
- Use Superpowers only for deep-reasoning phases, then sync decisions back.
- Record worktree base before isolated implementation starts.

Typical commands:

```bash
./scripts/harness summary --task <task-id>
./scripts/harness worktree-preflight --task <task-id>
./scripts/harness worktree-name --task <task-id> --namespace <prefix>
```

### `review`

Use `review` when the goal is to inspect a plan, diff, PR, or archive decision before implementation moves on.

- Review findings before touching code.
- Re-check lifecycle state before archiving.
- Treat PR and review tasks as active until the external review result is known.

Typical checks:

```bash
./scripts/harness active-summary
git diff --stat
gh pr view <number> --json state,mergeStateStatus,url
```

### `verify`

Use `verify` after any meaningful code, policy, projection, or documentation change.

- Run focused suites first when the scope is narrow.
- Run the full repository check before merge or release.
- Review `verify`, `sync --dry-run`, and `doctor --check-only` together for context-governance changes.

Typical commands:

```bash
npm run verify
./scripts/harness verify --output=.harness/verification
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
```

### `finish`

Use `finish` when a scoped branch is ready to return to `dev`.

- Push the scoped branch first when you want a remote recovery point.
- Merge back using the recorded worktree base rather than late guesses.
- Record commit, merge, and push results in the task progress file.

Typical commands:

```bash
git push -u origin <branch>
git switch dev
git merge --no-ff <branch>
git push origin dev
```

### `release`

Use `release` when `dev` is ready to promote or when release documentation and adoption status need to be synchronized.

- Treat `main` as the verified release baseline.
- Keep release docs aligned with current command surfaces and repository naming.
- Include adoption and context-governance evidence before promotion.

Typical commands:

```bash
npm run verify
./scripts/harness verify --output=.harness/verification
./scripts/harness doctor --check-only
./scripts/harness adoption-status
git switch main
git merge --ff-only dev
```

### `archive`

Use `archive` only when the task is explicitly closed and archive eligible.

- Move closed task state into `planning/archive/<timestamp>-<task-id>/`.
- Keep companion-plan metadata synchronized before archive.
- Do not archive tasks that only look complete.

Typical commands:

```bash
bash harness/core/upstream-overlays/planning-with-files/scripts/close-task.sh . <task-id> "..."
bash harness/core/upstream-overlays/planning-with-files/scripts/archive-task.sh . <task-id>
```

## Optional Contracts

Harness documents integration contracts for browser and eval capabilities, but does not require a bundled runtime for either one.

### Browser Contract

Use this contract when an external browser tool or plugin is available.

- Input: local target, action goal, and scope of navigation.
- Expected artifacts: screenshot, accessibility or DOM snapshot, and a short result record.
- Safety boundary: browser automation must stay outside the core Harness install path unless the user explicitly wants integration work.

### Eval Contract

Use this contract when validating a projected skill, hook payload, or workflow lane behavior.

- Input: target IDE, skill or command surface, and expected behavior.
- Expected artifacts: reproducible fixture, pass/fail verdict, and regression note if behavior changes.
- Scope: evals supplement repository verification; they do not replace `npm run verify`, `sync --dry-run`, or `doctor --check-only`.
