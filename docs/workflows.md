# Workflows

This page is the operator-facing map of Harness.

Use it when you already understand the project at a high level and need to answer:

- which lane applies now?
- what is the boundary of that lane?
- which command surfaces usually prove the work?

Harness keeps policy rendering, projection, and planning state separate from this operator layer. This page is about how to move work, not how the implementation is wired internally.

## Mode-Aware Verification Contract

Harness uses one shared proof vocabulary across workflow modes.

| Mode Family | Where It Sits | Primary Proof | Existing Lane Or Gate Coverage | When Unit/BDD Are Not Enough |
| --- | --- | --- | --- | --- |
| design/planning | intake, `plan`, companion-plan authoring | review proof | `planning-with-files`, `goal2plan`, reviewer-gated companion plans | when architecture, scope, rollback, or acceptance-design risk matters more than code behavior; lifecycle/governance proof then backstops durable task-state alignment |
| execution | implementation slices and narrow rollout work | unit/invariant proof | focused tests, diffs, fixtures, targeted commands | when a green local check says nothing about operator intent or release safety |
| review | plan review, diff review, PR review | review proof | `review` lane and reviewer checkpoints | when tests pass but the change can still be wrong, unsafe, or out of scope |
| acceptance/verify | focused verification and user-visible workflow checks | BDD/acceptance proof | `verify` lane, `npm run verify:all`, `./scripts/harness verify` | when behavior checks pass but lifecycle state, docs, or rollout evidence still drift |
| reconcile/lifecycle | verify-to-finish transition before `finish` or `archive` | lifecycle/governance proof | `reconcile` gate, lifecycle state, `active-summary`, `reconciliation.md` | when archive readiness, SOT alignment, or follow-up ownership is the real risk |
| operations/release/adoption | `cloud-dev`, install/adoption flows, `finish`, `release` | operational proof | `sync --dry-run`, `doctor --check-only`, adoption and release checks | when unit/BDD cannot prove takeover safety, backup behavior, rollout readiness, or recovery |

The table summarizes proof-stack core vocabulary. When a tracked or deep-reasoning task needs explicit proof design, the minimal declared contract shape is seven fields: `Proof Target`, `Primary Proof`, `Backstop Proof`, `Escalation Trigger`, `Evidence Sink`, `Reconcile Rule`, and `Unacceptable Substitute`. Quick tasks stay lightweight and usually do not need the declaration.

## Workflow Lanes

### `plan`

Use `plan` when the work is tracked, multi-phase, or likely to outlive the current session.

- Create or reuse `planning/active/<task-id>/`.
- Keep `planning-with-files` as the only durable task-memory system.
- Use Superpowers only for deep-reasoning phases, then sync decisions back.
- If the task is clearly complex but the intake is too sparse to write a credible implementation plan, call the projected `goal2plan` skill first to enrich intake and produce a reviewed plan before execution.
- Record worktree base before isolated implementation starts.

Typical commands:

```bash
./scripts/harness summary --task <task-id>
./scripts/harness worktree-preflight --task <task-id>
./scripts/harness worktree-name --task <task-id> --namespace <prefix>
```

`goal2plan` is a planning skill, not a separate lane. It prepares one native Codex `/goal` prompt, requires a reviewed implementation plan artifact, and then hands execution back to the normal direct/tracked/deep-reasoning classification instead of creating a second execution system.

Long-running continuation threads are a hygiene risk. When a tracked or deep-reasoning task crosses a major phase boundary or context churn gets heavy, prefer a fresh thread plus planning restore over extending the same continuation indefinitely.

### `cloud-dev`

Use `cloud-dev` when agent work should stage remotely from `origin/dev` without changing a local checkout.

- Treat `cloud-dev` as a remote-only staging branch derived from `origin/dev`.
- Create a per-task `cloud-dev/<issue>-<slug>` branch for scoped agent work.
- Merge work into `dev` only through a pull request after `cloud-dev` review is complete.
- Do not auto-sync `cloud-dev` into local checkouts.

Typical commands:

```bash
node scripts/ci/check-cloud-dev-branch.mjs --mode=check
npm run verify
./scripts/harness doctor --check-only
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
- Run the full repository check `npm run verify:all` before merge or release.
- Review `verify`, `sync --dry-run`, and `doctor --check-only` together for context-governance changes.

Typical commands:

```bash
npm run verify:all
./scripts/harness verify --output=.harness/verification
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
```

### `reconcile`

Use `reconcile` as the verify-to-finish gate when tracked work changes behavior, policy, lifecycle state, or source-of-truth expectations.

- Treat reconciliation as the primary lifecycle/governance proof for archive readiness and SOT alignment.
- Use review proof when the unresolved risk is scope, architecture, approval, or rollback rather than user-visible behavior.
- Do not treat passing unit or BDD checks as an acceptable substitute for reconciliation when task state, docs, backlog, or adoption evidence still drift.
- Keep `planning/active/<task-id>/` as the authoritative task-memory root and add `reconciliation.md` only when reconcile evidence needs a standalone lifecycle artifact.

Typical commands:

```bash
./scripts/harness active-summary
./scripts/harness record --file reconciliation --task <task-id>
./scripts/harness doctor --check-only
```

### `finish`

Use `finish` when a scoped branch is ready to return to the recorded worktree base.

- Push the scoped branch first when you want a remote recovery point.
- Merge back using the recorded worktree base rather than late guesses.
- Record commit, merge, and push results in the task progress file.

Typical commands:

```bash
git push -u origin <branch>
git switch <base-ref>
git merge --no-ff <branch>
git push origin <base-ref>
```

### `release`

Use `release` when `dev` is ready to promote or when release documentation and adoption status need to be synchronized.

- Treat `main` as the verified release baseline.
- Re-read current branch, PR, and adoption state before tagging or promotion; release work is evidence-driven closure work, not a blind final command chain.
- Keep release docs aligned with current command surfaces and repository naming.
- Use `autonomous-release-closure` when promotion still includes review-to-merge, stacked PR, cleanup, or adopt follow-through loops.
- Include adoption and context-governance evidence before promotion.
- Keep release notes and release artifacts tied to the exact verified commit.

Typical commands:

```bash
npm run verify:all
./scripts/harness verify --output=.harness/verification
./scripts/harness doctor --check-only
./scripts/harness adoption-status
npm run release:pack
gh release create <version> --notes-file dist/release/<version>/release-notes.md dist/release/<version>/*
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

## Supporting Guides

- [State convergence](state-convergence.md) keeps `planning/active`, roadmap, and backlog status aligned during review or maintenance.
- [Cloud Dev parity](cloud-dev-parity.md) defines the agent-neutral cloud task contract and evidence gates for remote work.
- [MCP read-only compatibility](mcp-read-only-compatibility.md) defines native adapter, MCP read-only, and docs-only/manual tiers.
- [Office templates](office-templates.md) cover lightweight non-coding tasks without changing the coding workflow.

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
- Scope: evals supplement repository verification; they do not replace `npm run verify:all`, `sync --dry-run`, or `doctor --check-only`.


## Reconcile Gate

Reconciliation is the verify-to-finish gate defined in `docs/reconciliation.md`. It is not a replacement for implementation or verification, and it should not become a documentation tax for tiny changes.

Use the gate before finish/archive when a task changes code behavior, workflow policy, adapter output, MCP contracts, safety behavior, cloud-dev behavior, roadmap/backlog commitments, or other tracked product decisions. The gate compares planned intent, actual changes, acceptance status, verification evidence, intentional deviations, unresolved drift, and docs/backlog update needs.

Lifecycle tooling recognizes these reconciliation signals:

- `complete`: `planning/active/<task-id>/reconciliation.md` as an optional lifecycle artifact, `## Reconciliation` in `progress.md`, or `Reconcile: complete` in `task_plan.md`/`progress.md`.
- `not_required`: `Reconcile: not_required` or `Reconcile: not required` with a reason for trivial/copy-only work.
- `waived`: `Reconcile: waived` with the owner/reviewer decision recorded.
- `open` / `unknown`: no accepted signal yet; `active-summary` reports an anomaly when an archive-ready task is still open.

`./scripts/harness active-summary` reports reconciliation counts and per-task status. `./scripts/harness record --file reconciliation --task <task-id>` creates/appends the recommended `reconciliation.md` shape.

A task may mark `reconcile: not required` only for trivial/copy-only work or when the active task plan records a clear owner-approved reason.
