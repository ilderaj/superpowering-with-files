---
applyTo: "**"
---
# Harness Policy For Copilot

Apply this global policy together with repository-local instructions.

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

## Communication Guidelines


- Use Chinese for all conversations, explanations, code review results, and plan file content.
- Use English for all code-related content: code, code comments, documentation, UI strings, commit messages, and PR titles or descriptions.

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

## Copilot Platform Notes

# Copilot Override

GitHub Copilot supports Harness shared `.agents/skills` roots (`.agents/skills` and `~/.agents/skills`).

Render `copilot-instructions.md` for Copilot instruction entrypoints. Keep this entry thin: materialize the shared skill roots and the patched `planning-with-files` content, but do not inline broader core workflow policy, tracked-task detail, or deep-reasoning sections into the startup payload.


