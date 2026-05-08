# Maintenance

Maintenance is the operator-facing `verify`, `archive`, and upkeep surface of Harness. For the full lane map, start with [Workflows](workflows.md).

Maintenance flow:

```bash
./scripts/harness status
./scripts/harness fetch
./scripts/harness update
./scripts/harness sync --dry-run
./scripts/harness sync
./scripts/harness doctor
```

`fetch` retrieves upstream candidates. `update` applies accepted candidates. `sync` regenerates installed projections and garbage-collects stale Harness-managed paths that are no longer desired.

Use `sync --dry-run` to inspect the desired projection diff without writing files. Use `sync --check` when you want a non-zero exit code if projections are out of sync.

`verify` prints its report to stdout by default. Write files only when you ask for them explicitly:

```bash
./scripts/harness verify --output=.harness/verification
```

## Lane Responsibilities

- `verify`: run focused suites first, then `npm run verify`, `./scripts/harness verify --output=...`, `./scripts/harness sync --dry-run`, and `./scripts/harness doctor --check-only`.
- `archive`: close and archive only after lifecycle state is explicit and companion-plan metadata is synchronized.
- `release`: use the release gate in [Release](release.md) when maintenance work changes policy rendering, projections, hooks, or adoption state.

Harness may integrate browser or eval tooling, but those stay optional contracts. See [Workflows](workflows.md#optional-contracts).

## Planning Lifecycle Audit

Use this checklist whenever you want to audit or prune `planning/active/` without inventing a second planning workflow.

Recommended command flow:

```bash
./scripts/harness active-summary
./scripts/harness active-summary --json --output=.harness/planning-active-summary.json
```

Checklist:

1. Confirm empty active task directories are zero. If a directory has no `task_plan.md`, treat it as an anomaly rather than a normal task.
2. Confirm every remaining task has `## Current State` with `Status`, `Archive Eligible`, and `Close Reason`.
3. Confirm tasks that look complete but are not `closed + Archive Eligible: yes` are explicitly reviewed before any archive step.
4. Confirm tasks that are `closed + Archive Eligible: yes` are also companion-synced before calling `archive-task`.
5. Confirm `waiting_review` tasks still have a real review, PR, or approval gate.
6. Confirm `active` tasks still have unfinished phases, concurrent edits, or an external time/dependency gate.
7. Close and archive only the tasks whose durable conclusions are already transferred and whose lifecycle state is explicit.

`active-summary` is the operator-facing queue audit. `summary` remains a single-task session context tool and should not be repurposed as a multi-task audit surface.

Before policy extraction, reread the current global policy source and compare it with `harness/core/policy/base.md`.

When changing orchestration policy:

1. Update `harness/core/policy/base.md` first.
2. Keep platform overrides limited to platform-specific caveats.
3. If the rule needs mechanical support, add it under `harness/installer` rather than patching vendored upstream skills.
4. Run adapter rendering tests to confirm every supported target receives the rule.
5. Run repository verification before reporting completion.

Future projection patches, health checks, and tests should be verified against the companion-plan semantics for rendered entry files, projected skills, and health warnings:

- projection patches must render `docs/superpowers/plans/**` as the required companion-artifact path whenever Superpowers is used on a deep-reasoning task
- projected skill wording must preserve the summary/detail split and the bidirectional references between `planning/active/<task-id>/` and the companion plan
- health checks must continue to treat `planning/active/<task-id>/` as authoritative and any companion plan as secondary
- tests should validate mandatory companion-plan persistence consistently across policy, rendered entries, projected skills, and health warnings

When a task carries a companion artifact, lifecycle tooling must keep it in sync: `close-task` and `archive-task` should block unsynced companion metadata, and `archive-task` should relocate the companion artifact into the archived task directory as `companion_plan.md`.

Worktree base selection is a Harness-owned guardrail. Maintain it in:

- `harness/core/policy/base.md` for rendered cross-platform policy.
- `harness/installer/lib/git-base.mjs` for base recommendation logic.
- `harness/installer/commands/worktree-preflight.mjs` for the CLI entry point.
- `harness/installer/lib/superpowers-finishing-a-development-branch-patch.mjs` for projected finishing guidance that resolves the merge target from recorded `Worktree base` metadata before conservative fallback checks.

Finishing branch base resolution must stay aligned with worktree creation. If planning records `Worktree base: <ref> @ <sha>`, projected finishing guidance should use that base for merge-back decisions unless the user or task explicitly overrides it.

Worktree naming is a Harness-owned contract. Maintain it in:

- `harness/installer/lib/worktree-name.mjs` for canonical label resolution.
- `harness/installer/commands/worktree-name.mjs` for the operator-facing CLI.
- `harness/installer/lib/superpowers-using-git-worktrees-patch.mjs` for the projected skill guidance.

Run this before creating a manual or Superpowers-driven worktree:

```bash
./scripts/harness worktree-preflight --task <task-id>
./scripts/harness worktree-name --task <task-id> --namespace <agent-prefix>
git worktree add <path>/<canonical-label> -b <suggested-branch> <base-ref>
```

Treat `./scripts/harness worktree-name` as the source of truth for worktree basenames and branch names. Do not derive them from prompt summaries or skill names.

When you need a remote recovery point for a risky session, use this operator flow:

1. Run `./scripts/harness worktree-preflight --task <task-id> --safety` when the repo has multiple active tasks.
2. Run `./scripts/harness worktree-name --task <task-id> --namespace <agent-prefix>`.
3. Move the work into a dedicated worktree branch using the suggested basename and branch name.
4. Run `./scripts/harness checkpoint-push --message="..."`.
5. Review the generated review artifact directory, including `review.md` and `result.json`.
6. Treat PR creation and merge as separate manual actions.

## Upstream Skill Updates

### Scheduled Refresh Activation

Before enabling the weekly upstream refresh schedule, configure dev branch protection:

- Protect branch: dev
- Require pull request before merging
- Require status checks to pass before merging
- Required check: npm run verify (or the workflow job name that wraps it)
- Restrict direct pushes to dev

Activation order:

1. Merge workflow implementation to main.
2. Configure dev branch protection.
3. Verify locally:

	```bash
	npm run verify
	node --test tests/automation/*.test.mjs
	```

4. Run `workflow_dispatch` with the default `create_pr: false` setting as a PR-disabled rehearsal and confirm:

	- result file generated
	- artifact uploaded
	- no unexpected files in `eligibleFiles`
	- no pull request is created or updated

5. Run `workflow_dispatch` again with `create_pr: true` only when you intentionally want to test the PR creation/update path.
6. Enable the weekly schedule only after the PR-disabled rehearsal passes, the optional PR path check passes if run, and dev branch protection is in place.
7. Set the repository variable `UPSTREAM_REFRESH_SCHEDULE_ENABLED=true` to allow scheduled runs to execute after the workflow is merged to main.

Weekly schedule gate: the workflow contains the Friday 20:00 Asia/Shanghai cron (`0 12 * * 5`), but scheduled runs are skipped until the repository variable `UPSTREAM_REFRESH_SCHEDULE_ENABLED` is set to `true`.

When an open pull request already matches the fixed automation head `automation/upstream-refresh` and base `dev`, the PR helper updates that automation-owned branch with `git push --force-with-lease origin automation/upstream-refresh` before refreshing the PR body. This guarded update is not a general force-push path: unmatched PRs use the create path, and new PR creation continues to use `git push --set-upstream origin automation/upstream-refresh`.

### Local Dev Sync After Upstream PR Merge

GitHub Actions cannot directly trigger commands on a developer machine after an upstream refresh PR merges. The optional local helper is intentionally explicit and local-only:

```bash
node scripts/local/sync-dev-after-upstream-pr.mjs
```

Recommended v1 trigger options:

- Manual: run `node scripts/local/sync-dev-after-upstream-pr.mjs` after confirming the upstream refresh PR has merged.
- Local schedule: use a macOS LaunchAgent that runs the helper after expected PR merge windows.
- Advanced: use a local webhook listener only when this machine is intentionally exposed or tunneled.

The helper performs a safe preflight before changing branches. It verifies that the current checkout is this repository, the worktree is clean, local `refs/heads/dev` exists, `refs/remotes/origin/dev` exists, local dev is not ahead of origin dev, and the update can be fast-forwarded using `refs/heads/dev...refs/remotes/origin/dev`.

After that complete-ref preflight passes, the only sync commands it may run are:


```bash
git fetch origin dev
git checkout dev
git merge --ff-only origin/dev
```

It does not stash, rebase, auto-resolve conflicts, or merge non-fast-forward history. When sync stops, the terminal report includes:

- current branch
- local HEAD
- `origin/dev` HEAD
- reason sync stopped
- manual recovery suggestions

Common manual recovery checks:

```bash
git status --short
git rev-parse --verify refs/heads/dev
git rev-parse --verify refs/remotes/origin/dev
git log --oneline refs/remotes/origin/dev..refs/heads/dev
git log --oneline --left-right refs/heads/dev...refs/remotes/origin/dev
git fetch origin dev
git checkout dev
git merge --ff-only origin/dev
```

Upstream updates are staged before they are applied:

```bash
./scripts/harness fetch --source=superpowers
./scripts/harness update --source=superpowers
```

After any Superpowers update that touches `finishing-a-development-branch`, run `./scripts/harness sync --dry-run` and the focused adapter checks `npm test -- tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs` to confirm the Harness finishing patch still applies cleanly.

`planning-with-files` also tracks its Git source directly:

```bash
./scripts/harness fetch --source=planning-with-files
./scripts/harness update --source=planning-with-files
```

The update command may only write into `harness/upstream/<source-name>`. It must not modify `harness/core`, `harness/adapters`, `harness/installer`, or `planning/active`.

Do not patch `harness/upstream/superpowers` or `harness/upstream/planning-with-files` to enforce local workflow policy. Those directories are upstream baselines and may be replaced during update. Keep local governance and workflow mechanics in Harness-owned layers.

After any upstream update, run:

```bash
npm run verify
./scripts/harness worktree-preflight
./scripts/harness sync --dry-run
./scripts/harness sync
./scripts/harness doctor
```

### Scheduled Refresh Failures

The scheduled upstream refresh treats blocked automation as terminal. Git conflicts, `npm run verify` failures, refresh allowlist violations, `git commit` failures, and `gh pr create` or `gh pr edit` failures must not auto-advance.

The refresh runner writes `.harness/upstream-refresh-result.json` before exiting non-zero. Download the workflow artifact that contains this result file and the job log, then inspect `status` and `blockedReason` before taking over manually.

Manual takeover path:

1. Download the failed workflow artifact and review `.harness/upstream-refresh-result.json` plus the job log.
2. Reproduce from a local `dev` baseline:

	```bash
	git fetch origin dev
	git checkout dev
	git pull --ff-only origin dev
	node scripts/ci/run-upstream-refresh.mjs
	```

3. Fix the reported conflict, validation failure, or allowlist violation in the local refresh branch.
4. Re-run the validation chain:

	```bash
	npm run verify
	./scripts/harness worktree-preflight
	./scripts/harness sync --dry-run
	./scripts/harness sync
	./scripts/harness doctor
	```

5. Open or update the upstream refresh PR manually if automation did not reach the PR step.

## Context Governance Gates

Context-governance changes must not ship without checking the rendered entry files, projected skills, optional hook payloads, and Harness health output together.

Required checks:

- run `npm run verify`
- run `./scripts/harness verify --output=.harness/verification` and review `health.context`
- run `./scripts/harness sync --dry-run`
- run `./scripts/harness doctor --check-only`
- confirm rendered entries stay on the always-on core profile unless a target explicitly needs more detail
- confirm `hookMode: off` remains the low-overhead default
- if hook files changed, confirm runtime hook payload measurements stay within the configured budgets
- if skill projection changed, verify the lean user-global default `minimal-global` profile and the explicit opt-in `full` profile

User-global calibration must be isolated unless the goal is to intentionally update the operator's real user-global files. Use a disposable clone and a disposable home/profile, then perform an actual sync before verification:

```bash
export HOME=/path/to/disposable-home
./scripts/harness install --scope=both --targets=all --projection=portable --hooks=on --skills-profile=minimal-global
./scripts/harness sync --conflict=backup
./scripts/harness verify --output=.harness/verification
./scripts/harness doctor --check-only
```

For backup-governance takeover checks in that disposable home, run an explicit user-global install and confirm both health and adoption state:

```bash
export HOME=/path/to/disposable-home
./scripts/harness install --scope=user-global --targets=all --hooks=on
./scripts/harness sync --conflict=backup
./scripts/harness doctor --check-only
./scripts/harness adoption-status
```

When you run `sync --conflict=backup`, Harness archives the displaced content into `~/.harness/backups/` and records it in `~/.harness/backup-index.json`. If legacy `.harness-backup-*` siblings are still present from an older takeover, the next successful `sync` imports them into that archive store and removes the live duplicates before projecting the new baseline.

Use `sync --dry-run` before the actual sync only as a preview; it is not a substitute for verification because it does not write projection files. Manual inspection should cover the user-global entry files for Codex, GitHub Copilot, and Claude Code, plus Cursor's workspace rule output when `scope=both` is used. Cursor does not currently have a rendered user-global entry. The expected result is thin always-on entry content, no full deep-task policy dump, and no broad skill projection when `minimal-global` is selected.
