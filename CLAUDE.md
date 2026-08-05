# Harness Policy For Claude Code

# Hybrid Workflow Policy

This project uses a hybrid workflow:

- `planning-with-files` is the persistent memory and planning system.
- `superpowers` is an optional, temporary reasoning tool.
- Persistent task state must live only under `planning/active/<task-id>/`:
  - required core planning trio: `task_plan.md`, `findings.md`, `progress.md`
  - optional lifecycle artifact: `reconciliation.md`
  - explicitly closed task state may move to `planning/archive/<timestamp>-<task-id>/`

## Default Behavior


By default:

- Do not invoke superpowers.
- Do not perform heavyweight workflow routing for simple tasks.
- Directly execute quick tasks.
- Once a task is classified as a tracked task, create and keep the required core planning trio updated, and add `reconciliation.md` only when lifecycle evidence needs its own artifact.
- Isolate concurrent work by task id instead of sharing one project-root planning file set.
- At the start of complex work, scan existing active tasks when stale context may matter, but do not move legacy or completed-looking tasks automatically.

### Simplicity Ladder

Before expanding scope, complexity, or dependencies:

1. Question whether the work needs to exist at all.
2. Prefer the standard library before custom code.
3. Prefer native platform features before dependencies.
4. Prefer already-installed dependencies before adding new ones.
5. Prefer the smallest working diff and the fewest files.
6. Never simplify away trust-boundary validation, data-loss prevention, security, accessibility, or explicit user asks.

### Deliberate Simplifications

When a temporary simplification is intentional, record it with:

- marker prefix: `swf-simplify:`
- required fields: `ceiling` and `upgrade trigger`

Example:

```text
// swf-simplify: single-workspace scan only; upgrade when leaf workspaces need distinct ledger grouping
```

## Rule Precedence


When these rules overlap, apply them in this order:

1. Repository policy that defines durable task memory and planning ownership.
2. Explicit task classification in this file.
3. Heuristics from skills or prompts, such as tool-call count.

If a task is classified as tracked, Planning with Files is mandatory even when the implementation itself feels straightforward.
The default instruction to execute quick work directly never overrides a tracked-task classification.

## Task Classification


Classify the task before choosing the workflow:

- `Quick task`: single-stage work with a clear path, no subagents, no worktree isolation, no expected cross-session recovery, and no durable research trail worth persisting. Execute directly without heavyweight routing.
- `Tracked task`: any task with multiple phases, research or comparison work, subagents, worktree/branch isolation, expected session recovery, or durable decisions and verification worth keeping on disk. Create or reuse `planning/active/<task-id>/` before substantive work.
- `Deep-reasoning task`: a tracked task whose architecture is unclear, requirements are ambiguous, debugging is complex, root cause is not obvious, or deep structured reasoning is explicitly requested. Only this class may justify superpowers.

Tool-call count is only a supporting signal. Exceeding five meaningful tool calls may indicate tracked work, but it does not override the task classification above by itself.

## Goal Round Start Protocol


Before each substantive goal round, continuation tick, or phase boundary:

1. Restore context from `planning/active/<task-id>/` first. Read `task_plan.md`, `progress.md`, and `findings.md`. If `reconciliation.md` exists and the current round depends on lifecycle evidence, read that optional lifecycle artifact too. If those files reference a companion plan, read only the relevant compact section you need for the current round.
2. Reclassify the current round using the existing `quick`, `tracked`, and `deep-reasoning` model. A task can stay tracked overall while a specific round is quick or deep.
3. Route the round by its current classification:
   - `quick`: stay lightweight. Do not create a companion plan and do not add subagents just because a goal loop is running.
   - `tracked`: keep `planning/active/<task-id>/` authoritative and update the planning files after meaningful progress, phase changes, validation results, or durable decisions.
   - `deep-reasoning`: create or update `docs/superpowers/plans/<date>-<task-id>.md`. If that companion plan is new or materially revised, require 1 read-only reviewer subagent before execution. The reviewer may assess plan completeness, architecture fit, scope alignment, rollback, or validation commands, but must not edit code or planning files. Revise from the review, re-review when needed, and execute only from an approved companion plan. After approval, follow normal Superpowers execution discipline: choose inline execution or subagents as appropriate, honor worktree isolation guidance when needed, and preserve progress with commits, checkpoints, pushes, or PR handoff when useful.
4. When execution reveals a mismatch, distinguish a `plan issue` from an `execution issue`. This is execution-time plan-mismatch escalation, not a new runner:
   - `quick`: stay lightweight and resolve ordinary execution issues directly. Do not trigger a replan loop just because a goal loop is active.
   - `tracked` and `deep-reasoning`: if the plan itself is the issue, a bounded mini review/revise/verify loop may run inside normal Superpowers execution discipline. If the current plan is still sound and only execution failed, treat it as an execution issue and keep working from the approved plan.
   - Keep root-goal stability, avoid goal drift, and preserve `planning/active/<task-id>/` as the authoritative planning record while the companion plan or synced summaries are revised.
5. Bound plan-polishing and execution-time replan loops together. Attempt 1 revises from verifier feedback. Attempt 2 re-verifies the failed areas. Attempt 3 performs a broader rethink. If the 3rd review round is still a failed review, record blockers and unresolved assumptions in the authoritative planning files, then stop the current execution attempt instead of looping forever.
6. Sync back after each phase. Keep detailed reasoning in the companion plan, but write durable decisions, lifecycle and phase status, validation results, review verdicts, execution mode, companion-plan path, summary, and sync-back status into `planning/active/<task-id>/`.

For tracked and deep-reasoning work, major phase boundaries, completion of a reviewed plan, or unusually long continuation history are good cues to prefer a fresh thread and restore from `planning/active/<task-id>/` instead of stretching one continuation indefinitely. This is soft guidance for hygiene, not a hard stop.

This protocol is repository-owned guidance, not a separate runner. Hooks may inject reminders or compact context, but they do not replace round-start restore, reclassification, routing, or sync-back discipline.

### Mode-Aware Verification Contract

The `Mode-Aware Verification Contract` is the repo-owned vocabulary for choosing proof by failure risk. It explains which evidence is supposed to catch the most dangerous failure for the current kind of work. It does not create a second runner, replace native `/goal`, or force heavy process onto quick tasks.

Harness uses six mode families:

| Mode Family | Typical Surface | Typical Failure Risk |
| --- | --- | --- |
| design/planning | intake shaping, task memory, companion plans, acceptance design | wrong scope, missing constraints, or unverifiable success criteria |
| execution | implementation, templates, adapters, focused checks | broken invariants, wrong files, partial rollout |
| review | plan review, diff review, PR review, architecture review | accepted-but-wrong scope, unsafe change, weak rollback or review blind spots |
| acceptance/verify | focused verification, fixtures, user-visible workflow checks | unmet acceptance criteria, broken workflow, silent user-facing regressions |
| reconcile/lifecycle | reconciliation, finish, archive, task-state transitions | drift between intent, implementation, evidence, and lifecycle state |
| operations/release/adoption | install, sync, doctor, backup/takeover, release, adoption | rollout, recovery, migration, or support regressions |

Harness distinguishes proof types so the contract can match the risk:

- `unit/invariant proof`: code-level or structural evidence that narrow logic, schemas, parsers, adapters, and invariants still hold.
- `BDD/acceptance proof`: scenario or workflow evidence that user-visible outcomes still match the claim.
- `review proof`: reviewer evidence about scope fit, architecture, rollback, docs, and risk framing.
- `lifecycle/governance proof`: evidence that task state, reconciliation, ownership, backlog/docs updates, and archive readiness are correctly aligned.
- `operational proof`: evidence that install, sync, doctor, release, adoption, recovery, or takeover behavior is safe in practice.

The proof-stack core vocabulary is:

- `Primary Proof`: the evidence most likely to catch the highest-risk failure for the current mode family.
- `Backstop Proof`: secondary evidence that covers residual or adjacent risk without pretending to replace the primary proof.
- `Unacceptable Substitute`: evidence that may look green or busy but does not actually close the relevant risk.
- `Evidence Sink`: where the proof result is recorded so future review, reconciliation, or operations work can find it.

When a tracked or deep-reasoning task needs an explicit proof design, the minimal declared contract shape is seven fields:

- `Proof Target`: the exact claim, artifact, or risk boundary the proof stack is meant to validate.
- `Primary Proof`: the evidence most likely to catch the highest-risk failure for the current mode family.
- `Backstop Proof`: secondary evidence that covers residual or adjacent risk without pretending to replace the primary proof.
- `Escalation Trigger`: the condition that forces the task to stop, narrow scope, or seek review because the declared proof is missing, failed, or contradicted.
- `Evidence Sink`: where the proof result is recorded so future review, reconciliation, or operations work can find it.
- `Reconcile Rule`: how the task must sync proof outcomes back into lifecycle state, reconciliation, or follow-up ownership.
- `Unacceptable Substitute`: evidence that may look green or busy but does not actually close the relevant risk.

Proof choice must match failure risk rather than defaulting to unit versus BDD:

- if the risk is local invariant breakage, `unit/invariant proof` can be primary and BDD may only be a backstop
- if the risk is user-facing behavior drift, `BDD/acceptance proof` should be primary and unit checks are only a backstop
- if the risk is scope, architecture, rollback, policy, or approval drift, `review proof` must be primary even when tests are green
- if the risk is lifecycle state, source-of-truth alignment, or archive readiness, `lifecycle/governance proof` must be primary
- if the risk is install, release, adoption, or recovery failure, `operational proof` must be primary

Quick tasks stay lightweight. They usually rely on direct proof in-session and may omit a declared verification contract entirely. Tracked and deep-reasoning tasks may declare a `Mode-Aware Verification Contract` when the proof target, proof stack, escalation rule, evidence sink, reconcile rule, or unacceptable substitutes need to be explicit. Declaring the contract documents proof design only; it does not add a new runner.

## When Superpowers Is Allowed


Use superpowers only when:

- architecture is unclear
- requirements are ambiguous
- debugging is complex
- root cause is not obvious
- deep structured reasoning is explicitly requested

## Soft Model Tiering


- Use the most capable model for intake shaping, reviewed planning, architecture or protocol analysis, rollback judgment, and high-risk review.
- Use a standard model for multi-file integration, uncertain debugging, and medium-risk review.
- Use a cheap model only for approved-plan mechanical work, narrow diff checks, clerical worktree or release steps, and bounded checklist review.
- Upgrade from cheap -> standard -> capable when the task becomes blocked by missing context, conflicting interpretations, or design judgment.

## When Superpowers Is Not Allowed


Do not use superpowers for:

- trivial edits
- simple bug fixes
- straightforward feature implementation
- renames, moves, formatting, or low-risk refactors
- routine implementation even if a skill might loosely apply
- tasks where direct execution is clear and the reasoning value does not justify the token cost

## Communication Guidelines


- Use Chinese for all conversations, explanations, code review results, and plan file content.
- Use English for all code-related content: code, code comments, documentation, UI strings, commit messages, and PR titles or descriptions.

## Tool Preferences


### Package Management

- Development tools are managed via `proto`, including Bun, Node.js, and pnpm.
- Python commands should always use `uv`.
- JavaScript and TypeScript work should check the lock file for the package manager.

### Search And Documentation

- Use `fd` for file search when available.
- Use `rg` for content search.
- Use the `gh` CLI for all GitHub operations.
- Check official package documentation for latest usage.

## Compact Instructions


When compressing context, preserve in priority order:

1. Architecture decisions and design trade-offs. Never summarize these away.
2. Modified files and their key changes.
3. Current task goal and verification status.
4. Open TODOs and known dead ends.
5. Tool outputs. Keep pass or fail verdicts; discard verbose output when safe.

## Shell And Token-Saving Preferences


Use output-compressing command wrappers for shell commands likely to produce medium or large output, especially Git operations, broad searches, large file or tree reads, diffs, tests, builds, linters, logs, GitHub CLI, Docker, Kubernetes, curl, and JSON or log formatting.

Skip command wrappers for trivial commands or tiny targeted reads where compression adds overhead without saving context.

## Leaf Workspace Root Policy


- A narrow leaf workspace is allowed for context control, but durable Harness state stays rooted at one authority root.
- Inside a git worktree, treat that git top-level as the authority-root boundary by default; do not walk above it for a different project root unless an explicit override is present: `--root`, `HARNESS_PROJECT_ROOT`, or `.harness/authority-root.json` inside the worktree.
- `planning/active/<task-id>/` stays single-homed at the authority root; `install`, `sync`, `verify`, `record`, `summary`, and `doctor` still act on that root even from a linked leaf workspace.

## Claude Code Platform Notes

# Claude Code Override

Claude Code can use `CLAUDE.md`, skills, plugins, and independently configured hooks.

Render a thin `CLAUDE.md` entry file and materialize per-skill projections under `.claude/skills`. This repository does not project or inject planning context through hooks.

Claude Code does not ship a native long-running goal executor like Codex `/goal`. When a goal-like continuation flow is active (for example the `ralph-loop` plugin or a `/goal` skill), apply the Goal Round Start Protocol at each observable round, checkpoint, or phase boundary: restore the task-scoped planning files, reclassify the current round, keep quick rounds lightweight, and sync durable state back to `planning/active/<task-id>/`.

Host hook configuration is Host-owned and non-authoritative. It never replaces restoring the Trio planning files, reclassifying the current round, or the main-session round start.

For leaf workspaces (for example opening `packages/demo/`), Claude Code still uses the current git worktree root as the default authority root. See the Leaf Workspace Root Policy section for the bounded resolution order and explicit override flow.
