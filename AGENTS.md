# Harness Policy For Codex

# Hybrid Workflow Policy

This project uses a hybrid workflow:

- `planning-with-files` is the persistent memory and planning system.
- `superpowers` is an optional, temporary reasoning tool.
- Persistent task state must live only in:
  - `planning/active/<task-id>/task_plan.md`
  - `planning/active/<task-id>/findings.md`
  - `planning/active/<task-id>/progress.md`
  - explicitly closed task state may move to `planning/archive/<timestamp>-<task-id>/`

## Default Behavior


By default:

- Do not invoke superpowers.
- Do not perform heavyweight workflow routing for simple tasks.
- Directly execute quick tasks.
- Once a task is classified as a tracked task, create and keep the active task's three markdown files updated.
- Isolate concurrent work by task id instead of sharing one project-root planning file set.
- At the start of complex work, scan existing active tasks when stale context may matter, but do not move legacy or completed-looking tasks automatically.

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

1. Restore context from `planning/active/<task-id>/` first. Read `task_plan.md`, `progress.md`, and `findings.md`. If those files reference a companion plan, read only the relevant compact section you need for the current round.
2. Reclassify the current round using the existing `quick`, `tracked`, and `deep-reasoning` model. A task can stay tracked overall while a specific round is quick or deep.
3. Route the round by its current classification:
   - `quick`: stay lightweight. Do not create a companion plan and do not add subagents just because a goal loop is running.
   - `tracked`: keep `planning/active/<task-id>/` authoritative and update the planning files after meaningful progress, phase changes, validation results, or durable decisions.
   - `deep-reasoning`: create or update `docs/superpowers/plans/<date>-<task-id>.md`, verify the plan before execution, and use read-only verifier subagents only when they are useful and available. Verifiers may review plan completeness, architecture fit, risks, rollback, or validation commands, but they must not edit code or planning files. Integrate their feedback before execution.
4. Bound plan-polishing loops. Attempt 1 revises from verifier feedback. Attempt 2 re-verifies the failed areas. Attempt 3 performs a broader rethink. After three failed verification rounds, record blockers and unresolved assumptions in the authoritative planning files and stop instead of looping forever.
5. Sync back after each phase. Keep detailed reasoning in the companion plan, but write durable decisions, lifecycle and phase status, validation results, companion-plan path, summary, and sync-back status into `planning/active/<task-id>/`.

This protocol is repository-owned guidance, not a separate runner. Hooks may inject reminders or compact context, but they do not replace round-start restore, reclassification, routing, or sync-back discipline.

## When Superpowers Is Allowed


Use superpowers only when:

- architecture is unclear
- requirements are ambiguous
- debugging is complex
- root cause is not obvious
- deep structured reasoning is explicitly requested

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

## Codex Platform Notes

# Codex Override

Codex can consume `AGENTS.md` as the primary instruction entrypoint.

Use rendered `AGENTS.md` files for both workspace and user-global scopes. Project Codex skills into `.agents/skills` and `~/.agents/skills`, and materialize them to keep discovery aligned with the current Codex skill model.

Codex `/goal` remains the native long-running executor. Harness does not wrap it with an external runner and does not modify Codex internals.

When Codex uses `/goal`, repository-local `/plan-goal`, or any goal-like continuation flow, apply the Goal Round Start Protocol at each observable round, checkpoint, or phase boundary: restore the task-scoped planning files, reclassify the current round, keep quick rounds lightweight, use companion-plan plus verifier gating only for deep-reasoning rounds, and sync durable state back to `planning/active/<task-id>/`.

Hooks stay lightweight in Codex. They may inject compact planning reminders or hot context for the next prompt, but the core round-start discipline lives in rendered guidance and task-scoped planning files.

