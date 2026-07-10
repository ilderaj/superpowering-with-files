# Harness Policy For Codex

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

### Chief And Worker Operating Model

- Tracked production work defaults to a visible session worker when the platform provides a visible worker surface.
- Chief owns intake, binding, business judgment, authorization, major-phase gates, acceptance, reconciliation, and lifecycle.
- Chief-direct is limited to quick work and narrow gate or reconcile verification.
- Use one primary visible worker session per tracked task across phases; session context is a cache, not authority.
- Every major phase boundary returns to Chief. Within an approved phase, the worker may proceed autonomously.
- Chief chat history is not task authority. Restore and update the exact bound trio before deriving an Assignment Packet.
- Default capacity is two Chief-managed visible executing lanes. Additional visible lanes require explicit human approval.
- Worker-local subagents are session-internal implementation details, not visible-worker substitutes or lifecycle owners.
- Their authority and runtime permission are strict subsets of the parent worker envelope.
- Use `prohibited`, `worker_discretion`, or `encouraged`; tracked phases default to `worker_discretion`.
- Promote a delegated slice to a visible parallel worker when it becomes cross-phase, long-running, independently human-steered, independently outcome-bearing, or the owner of distinct mutable state.
- Wait for delegated work to return before the parent claims the phase outcome.

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

Deep or unusually long work may use a fresh thread that restores the trio. This is repository guidance, not a runner; hooks do not replace restore, routing, or sync-back discipline.

### Mode-Aware Verification Contract

The `Mode-Aware Verification Contract` selects proof by failure risk. It does not create a runner, replace native `/goal`, or force heavyweight process onto quick tasks.

Harness uses six mode families:

| Mode Family | Main risk |
| --- | --- | --- |
| design/planning | wrong scope or unverifiable criteria |
| execution | broken invariants or partial rollout |
| review | scope, architecture, rollback, or approval drift |
| acceptance/verify | unmet user-visible outcomes |
| reconcile/lifecycle | source-of-truth or archive drift |
| operations/release/adoption | rollout, recovery, or migration failure |

Proof types are `unit/invariant`, `BDD/acceptance`, `review`, `lifecycle/governance`, and `operational`; choose the type that covers the mode's main risk.

The proof-stack core vocabulary is:

- `Primary Proof`: the evidence most likely to catch the highest-risk failure for the current mode family.
- `Backstop Proof`: secondary evidence that covers residual or adjacent risk without pretending to replace the primary proof.
- `Unacceptable Substitute`: evidence that may look green or busy but does not actually close the relevant risk.
- `Evidence Sink`: where the proof result is recorded so future review, reconciliation, or operations work can find it.

When a tracked task needs an explicit proof design, declare:

- `Proof Target`, `Primary Proof`, and `Backstop Proof`;
- `Escalation Trigger`, `Evidence Sink`, and `Reconcile Rule`;
- `Unacceptable Substitute`.

Use unit proof for invariants, BDD for user-visible behavior, review proof for scope/architecture/approval, lifecycle proof for task state, and operational proof for install/release/recovery.

Quick tasks stay lightweight with direct in-session proof; tracked/deep tasks declare the contract only when needed.

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

## Codex Platform Notes

# Codex Override

Codex can consume `AGENTS.md` as the primary instruction entrypoint.

Use rendered `AGENTS.md` files for both workspace and user-global scopes. Project Codex skills into `.agents/skills` and `~/.agents/skills`, and materialize them to keep discovery aligned with the current Codex skill model.

Codex `/goal` remains the native long-running executor. Harness does not wrap it with an external runner and does not modify Codex internals.

When Codex uses `/goal`, repository-local `/plan-goal`, or any goal-like continuation flow, apply the Goal Round Start Protocol at each observable round, checkpoint, or phase boundary: restore the task-scoped planning files, reclassify the current round, keep quick rounds lightweight, require reviewer-gated companion plans only for deep-reasoning rounds, execute approved plans with normal Superpowers execution discipline, and sync durable state back to `planning/active/<task-id>/`.

Hooks stay lightweight in Codex. They may inject compact planning reminders or hot context for the next prompt, but the core round-start discipline lives in rendered guidance and task-scoped planning files.

## Codex Visible Session Controls

- Use native visible task or thread controls for tracked workers when the host exposes them.
- Do not forward Chief chat history into a worker. Send the bounded Assignment Packet, exact trio paths, current binding observation, and necessary source references.
- When create, continue, model, or permission controls are unavailable, fail honestly to a bounded manual handoff instead of claiming native control.
- A worktree and narrow packet are defense in depth; they do not prove an atomic per-thread permission boundary.

## Codex Concise Output Guidance

User-visible chat wording only.

- Use 1-2 short `did / next / blocker` sentences.
- Skip play-by-play, repeated context, and planning-file recaps.
- Trio writeback is primary; chat wording is optional.
